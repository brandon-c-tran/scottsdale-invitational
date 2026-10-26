/* The race (float/PROTOCOL.md "The Cup", "The snapshot row"): one leg of the
   river, simulated top-down at a fixed 30 Hz.

     createRace({ course, leg, field, seed, drinking })   the grid, before the gun
     applyInput(race, i, input)    a stroke, thumbs, the drink (from a phone or a bot)
     throwBalloon(race, from, at)  an eliminated rider's balloon, landing later
     stepRace(race, course)        one tick; returns that tick's events
     rows(race)                    the snapshot rows [i, x, y, a, f, p]

   A race is plain JSON (the room saves it every second and resumes from it)
   and deterministic: the same race, inputs and seed step the same way, so the
   balancing script replays bot races from a seed. Its only randomness is
   race.rng, a mulberry32 state kept inside the race.

   The water: each floatie is a circle dragged toward the local current
   (k = DRAG / mass, so Weight resists the current), turned by the water's own
   spin, shoved about in riffles, pulled round a whirlpool. A stroke is an
   impulse released over a fraction of a second along the heading: a left
   stroke pushes forward and yaws right, a right stroke forward and yaws left,
   alternating goes straight. Strokes drain a leaky bucket at 3 a second; over
   it they weaken and cost stamina. Floaties bump (mass, restitution, spin on
   glancing hits), scrape rocks, the island and the banks, and flip: over the
   Drop's lip off line, or sideways through a riffle. A balloon spins and
   splashes, never flips. Pure: no DOM, no Workers APIs. */
import { COURSE, flowAt, frameAt, legAt, gridSlots, beachSlot, rocksNear, islandsNear, nearestS } from "./course.js";
import { FLAG, packRow, wrapAngle } from "./protocol.js";
import { DT, RADIUS, WATER, PADDLE, CONTACT, FLIP, BALLOON, FLAG_MS, BEACH, LAUNCH_V, LAUNCH_S, COOLER, physicsOf } from "./tuning.js";

/* ---- randomness: mulberry32, its state a uint32 kept in the race ---- */
export function nextRandom(holder) {
  let t = (holder.rng = (holder.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function seedOf(value) {
  let h = 2166136261 >>> 0;
  for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const PHYSICS = new Map();
export const physicsFor = id => {
  if (!PHYSICS.has(id)) PHYSICS.set(id, Object.freeze(physicsOf(id)));
  return PHYSICS.get(id);
};

const r3 = v => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/* ---- the race ---- */

/* field: [{ i, floatie, drinks }] in grid order, pole first */
export function createRace({ course = COURSE, leg = 0, field = [], seed = 1, drinking = true } = {}) {
  const slots = gridSlots(course, leg, field.length);
  const { grid, finish } = legAt(course, leg);
  return {
    v:1,
    course:course.id,
    leg,
    seed:seed >>> 0,
    rng:seedOf(`race:${seed}:${leg}`),
    tick:0,
    t:0,
    drinking:drinking !== false,
    grid,
    finish,
    len:finish - grid,
    arrivals:0,
    firstFinish:null,
    balloons:[],
    riders:field.map((entry, k) => {
      const slot = slots[k];
      return {
        i:entry.i,
        fl:physicsFor(entry.floatie).id,
        drinks:entry.drinks !== false,
        x:slot.x, y:slot.y, vx:0, vy:0, a:slot.a, w:0,
        s:slot.s, prog:slot.s - grid,
        stam:1, heat:0, push:0, yawQ:0, lastStroke:-9,
        hands:2, swim:0, immune:0, backIn:-99,
        whirlT:0, whirlFree:0,
        tL:-9, tR:-9, tBump:-9, tBumpFlag:-9, tSplash:-9, hitAt:-99,
        arrived:false, arriveAt:null, drinkAt:null, beach:-1,
        st:{ strokes:0, flips:0, dropFlips:0, bumpsGiven:0, bumpsTaken:0, splashed:0 },
      };
    }),
    events:[],
  };
}

export const riderOf = (race, i) => race.riders.find(rider => rider.i === i) || null;
/* when a rider placed: arrived and drank (the drink rule) */
export const finishAt = rider => rider.arrived && rider.drinkAt !== null ? Math.max(rider.arriveAt, rider.drinkAt) : null;

/* an input from a phone or a bot, applied at the race's current time.
   { t:"stroke", side:"L"|"R", p }, { t:"hands", n }, { t:"drink" }.
   Returns true if it changed anything. */
export function applyInput(race, i, input) {
  const rider = riderOf(race, i);
  if (!rider || !input) return false;
  if (input.t === "hands") {
    const n = clamp(Math.round(Number(input.n)), 0, 2);
    if (!Number.isFinite(n) || n === rider.hands) return false;
    rider.hands = n;
    return true;
  }
  if (input.t === "drink") {
    if (rider.drinkAt !== null) return false;
    rider.drinkAt = r3(race.t);
    race.events.push({ e:"drink", i });
    noteFinish(race, rider);
    return true;
  }
  if (input.t !== "stroke") return false;
  if (rider.arrived || rider.swim > 0) return false;
  const side = input.side === "L" ? "L" : input.side === "R" ? "R" : null;
  const p = clamp(Number(input.p), 0, 1);
  if (!side || !(p > 0.02)) return false;
  /* the cadence bucket: a phone flooding strokes gets nothing past CAP */
  if (rider.heat + 1 > PADDLE.CAP) return false;
  rider.heat += 1;
  const phys = physicsFor(rider.fl);
  const rush = Math.max(0, rider.heat - PADDLE.FREE);
  const rushed = Math.max(PADDLE.RUSH_FLOOR, 1 - rush * 0.45);
  const tired = tiredness(rider.stam);
  const power = p * rushed * tired;
  rider.stam = Math.max(0, rider.stam - PADDLE.COST * p - PADDLE.RUSH_COST * rush);
  rider.push += phys.thrust * power;
  const steady = phys.steadyHandsOff && rider.hands < 2 ? COOLER.STROKE_YAW : 1;
  /* a left stroke yaws right (clockwise), a right stroke left */
  rider.yawQ += (side === "L" ? -1 : 1) * phys.yaw * power * steady;
  rider.lastStroke = race.t;
  if (side === "L") rider.tL = race.t; else rider.tR = race.t;
  rider.st.strokes += 1;
  return true;
}

/* an eliminated rider's balloon at racer `at`; the caller checks who may throw */
export function throwBalloon(race, from, at) {
  const target = riderOf(race, at);
  if (!target || target.arrived) return false;
  race.balloons.push({ from, at, land:r3(race.t + BALLOON.FLIGHT_MS / 1000) });
  race.events.push({ e:"balloon", i:from, j:at });
  return true;
}

/* a stroke's power by stamina: full down to FRESH, then down to TIRED at 0 */
export const tiredness = stam => stam >= PADDLE.FRESH ? 1
  : PADDLE.TIRED + (1 - PADDLE.TIRED) * Math.max(0, stam) / PADDLE.FRESH;

function noteFinish(race, rider) {
  const at = finishAt(rider);
  if (at !== null && (race.firstFinish === null || at < race.firstFinish)) race.firstFinish = at;
}

/* over you go: in the water for SWIM_MS. why: "drop" or "riffle" */
function flip(race, rider, why) {
  rider.swim = FLIP.SWIM_MS / 1000;
  rider.push = 0;
  rider.yawQ = 0;
  rider.vx *= 0.3;
  rider.vy *= 0.3;
  rider.w = 0;
  rider.st.flips += 1;
  if (why === "drop") rider.st.dropFlips += 1;
  race.events.push({ e:"flip", i:rider.i, x:r3(rider.x), y:r3(rider.y), why });
}

/* one tick (1/30 s). Returns the events raised since the last tick. */
export function stepRace(race, course = COURSE) {
  race.tick += 1;
  race.t = race.tick * DT;
  const t = race.t;
  for (const rider of race.riders) moveRider(race, course, rider, t);
  collide(race, course, t);
  for (const rider of race.riders) {
    if (rider.arrived) continue;
    const before = rider.s;
    const near = nearestS(course, rider.x, rider.y, rider.s);
    rider.s = near.s;
    rider.prog = near.s - race.grid;
    /* over the Drop's lip: straight, or over you go */
    for (const zone of course.zones) {
      if (zone.k !== "drop" || !(before < zone.s0 && near.s >= zone.s0) || rider.swim > 0) continue;
      const phys = physicsFor(rider.fl);
      if (phys.neverFlips || rider.immune > 0) continue;
      const lip = frameAt(course, zone.s0);
      const off = Math.abs(wrapAngle(rider.a - Math.atan2(lip.ty, lip.tx)));
      if (off > phys.dropAngle || Math.abs(rider.w) > phys.dropSpin) flip(race, rider, "drop");
    }
    if (before < race.finish && near.s >= race.finish) arrive(race, course, rider, before, t);
  }
  landBalloons(race, t);
  /* this tick's events, and any an input raised since the last tick */
  return race.events.splice(0);
}

function moveRider(race, course, rider, t) {
  const phys = physicsFor(rider.fl);
  /* the cadence bucket drains; stamina comes back once you rest */
  rider.heat = Math.max(0, rider.heat - PADDLE.SUSTAIN * DT);
  if (t - rider.lastStroke > PADDLE.REST_S) rider.stam = Math.min(1, rider.stam + PADDLE.RECOVER * DT);
  if (rider.immune > 0) rider.immune = Math.max(0, rider.immune - DT);

  if (rider.arrived) {
    /* glide onto the bar and sit */
    const slot = beachSlot(course, race.leg, rider.beach);
    const kx = (slot.x - rider.x) * BEACH.PULL, ky = (slot.y - rider.y) * BEACH.PULL;
    rider.vx += (kx - rider.vx) * Math.min(1, 3 * DT);
    rider.vy += (ky - rider.vy) * Math.min(1, 3 * DT);
    rider.x += rider.vx * DT;
    rider.y += rider.vy * DT;
    rider.w += (wrapAngle(slot.a - rider.a) * 1.5 - rider.w) * Math.min(1, 3 * DT);
    rider.a = wrapAngle(rider.a + rider.w * DT);
    return;
  }

  /* the whirlpool holds you a while, then lets go */
  const freed = rider.whirlFree > 0;
  if (freed) rider.whirlFree = Math.max(0, rider.whirlFree - DT);
  const water = flowAt(course, rider.x, rider.y, { hint:rider.s, whirl:freed ? 0.15 : 1 });
  let held = false;
  for (const zone of course.zones) {
    if (zone.k !== "whirlpool") continue;
    if (Math.hypot(rider.x - zone.x, rider.y - zone.y) < zone.r * 0.75) held = true;
  }
  if (held && !freed) {
    rider.whirlT += DT;
    if (rider.whirlT > WATER.WHIRL_HOLD_S) { rider.whirlFree = WATER.WHIRL_RELEASE_S; rider.whirlT = 0; }
  } else if (!held) rider.whirlT = Math.max(0, rider.whirlT - DT);

  const handsOff = rider.hands < 2;
  if (rider.swim > 0) {
    /* in the water, hanging on to the floatie: dragged along at a fraction
       of the current */
    rider.swim = Math.max(0, rider.swim - DT);
    rider.vx += (water.ux * FLIP.SWIM_DRIFT - rider.vx) * Math.min(1, 2 * DT);
    rider.vy += (water.uy * FLIP.SWIM_DRIFT - rider.vy) * Math.min(1, 2 * DT);
    rider.w += (0.5 * water.curl - rider.w) * Math.min(1, 2 * DT);
    rider.x += rider.vx * DT;
    rider.y += rider.vy * DT;
    rider.a = wrapAngle(rider.a + rider.w * DT);
    if (rider.swim === 0) {
      /* back in, facing downstream */
      rider.a = Math.atan2(water.ty, water.tx);
      rider.w = 0;
      rider.vx = water.ux * 0.6;
      rider.vy = water.uy * 0.6;
      rider.immune = FLIP.IMMUNE_S;
      rider.backIn = t;
    }
    return;
  }

  /* the current pushes a heavier floatie harder (it sits deeper) */
  const k = WATER.DRAG / phys.mass;
  const drag = 1 - Math.exp(-k * DT);
  rider.vx += (water.ux * phys.ride - rider.vx) * drag;
  rider.vy += (water.uy * phys.ride - rider.vy) * drag;

  /* the keel: the water resists sliding sideways through it, so you travel
     where you point (Turn: how quickly) */
  const hx = Math.cos(rider.a), hy = Math.sin(rider.a);
  {
    const rx = rider.vx - water.ux, ry = rider.vy - water.uy;
    const side = -rx * hy + ry * hx;
    const bite = (1 - Math.exp(-phys.keel * DT)) * side;
    rider.vx -= -hy * bite;
    rider.vy -= hx * bite;
  }

  /* the stroke envelope releases its push and its yaw */
  const release = 1 - Math.exp(-PADDLE.RELEASE * DT);
  if (rider.push > 1e-4) {
    const impulse = rider.push * release;
    rider.push -= impulse;
    let launch = 0;
    /* the donut's launch: off the grid, and back in after a flip */
    if (phys.launch && (t < LAUNCH_S || t - rider.backIn < LAUNCH_S)) {
      const over = Math.hypot(rider.vx - water.ux, rider.vy - water.uy);
      launch = phys.launch * clamp(2 - over / LAUNCH_V, 0, 1);
    }
    const dv = impulse * (1 + launch) / phys.mass;
    rider.vx += hx * dv;
    rider.vy += hy * dv;
  } else rider.push = 0;
  if (Math.abs(rider.yawQ) > 1e-5) {
    const yaw = rider.yawQ * release;
    rider.yawQ -= yaw;
    rider.w += yaw;
  } else rider.yawQ = 0;

  /* spin relaxes toward the water's own (half its curl); the cooler, hands
     off, holds its heading */
  const steady = phys.steadyHandsOff && handsOff;
  const target = 0.5 * water.curl * (steady ? COOLER.WATER_SPIN : 1);
  const damp = phys.spinDamp * (steady ? COOLER.DAMP : 1);
  rider.w += (target - rider.w) * (1 - Math.exp(-damp * DT));

  /* riffles shove you about */
  let riffle = null;
  for (const zone of course.zones) if (zone.k === "riffle" && rider.s >= zone.s0 && rider.s <= zone.s1) riffle = zone;
  if (riffle) {
    const power = riffle.power ?? 1;
    if (nextRandom(race) < WATER.RIFFLE_RATE * power * DT) {
      /* a wave: is this rider sideways, or ploughing through too fast? */
      if (!phys.neverFlips && rider.immune === 0) {
        const off = Math.abs(wrapAngle(rider.a - Math.atan2(water.uy, water.ux)));
        const sideways = Math.max(0, (off - phys.riffleAngle) / (Math.PI / 2));
        const fast = Math.max(0, (Math.hypot(rider.vx - water.ux, rider.vy - water.uy) - phys.riffleFast) / 1.5);
        const over = Math.max(sideways, fast);
        if (over > 0 && nextRandom(race) < Math.min(0.9, (FLIP.CHANCE + FLIP.CHANCE_GAIN * over) * power)) {
          flip(race, rider, "riffle");
          return;
        }
      }
      const heavy = (80 / phys.mass) * phys.rough;
      const side = nextRandom(race) < 0.5 ? -1 : 1;
      const push = WATER.RIFFLE_PUSH * power * heavy * (0.6 + 0.8 * nextRandom(race));
      rider.vx += -water.ty * side * push;
      rider.vy += water.tx * side * push;
      const spin = WATER.RIFFLE_SPIN * power * heavy * (nextRandom(race) * 2 - 1);
      rider.w += steady ? spin * 0.3 : spin;
    }
  }

  rider.x += rider.vx * DT;
  rider.y += rider.vy * DT;
  rider.a = wrapAngle(rider.a + rider.w * DT);

}

function arrive(race, course, rider, before, t) {
  const span = rider.s - before;
  const over = span > 0 ? clamp((rider.s - race.finish) / span, 0, 1) : 0;
  rider.arrived = true;
  rider.arriveAt = r3(t - over * DT);
  rider.beach = race.arrivals;
  race.arrivals += 1;
  rider.swim = 0;
  rider.push = 0;
  rider.yawQ = 0;
  rider.prog = race.len;
  race.events.push({ e:"arrive", i:rider.i, x:r3(rider.x), y:r3(rider.y) });
  /* no drink this round (drinks:false, or the room's drinking off): it counts on arrival */
  if (rider.drinkAt === null && !(race.drinking && rider.drinks)) {
    rider.drinkAt = rider.arriveAt;
    race.events.push({ e:"drink", i:rider.i });
  }
  noteFinish(race, rider);
}

/* ---- contact ---- */

function bumpEvent(race, giver, taker, x, y, t) {
  const quiet = BUMP_QUIET;
  if (t - giver.tBump < quiet && (!taker || t - taker.tBump < quiet)) {
    giver.tBump = t;
    if (taker) taker.tBump = t;
    return;
  }
  giver.tBump = t;
  if (taker) {
    taker.tBump = t;
    giver.st.bumpsGiven += 1;
    taker.st.bumpsTaken += 1;
    race.events.push({ e:"bump", i:giver.i, j:taker.i, x:r3(x), y:r3(y) });
  } else race.events.push({ e:"bump", i:giver.i, x:r3(x), y:r3(y) });
}
const BUMP_QUIET = 0.4;

function collide(race, course, t) {
  const riders = race.riders;
  const R = RADIUS;
  /* floatie on floatie */
  for (let a = 0; a < riders.length; a += 1) {
    const p = riders[a];
    if (p.arrived) continue;
    const pp = physicsFor(p.fl);
    for (let b = a + 1; b < riders.length; b += 1) {
      const q = riders[b];
      if (q.arrived) continue;
      let dx = q.x - p.x, dy = q.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 4 * R * R) continue;
      const dist = Math.sqrt(d2) || 1e-6;
      const nx = dx / dist, ny = dy / dist;
      const qp = physicsFor(q.fl);
      const ip = 1 / pp.mass, iq = 1 / qp.mass;
      /* separate */
      const overlap = 2 * R - dist;
      p.x -= nx * overlap * ip / (ip + iq);
      p.y -= ny * overlap * ip / (ip + iq);
      q.x += nx * overlap * iq / (ip + iq);
      q.y += ny * overlap * iq / (ip + iq);
      const rvx = q.vx - p.vx, rvy = q.vy - p.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn >= 0) continue;
      const jn = -(1 + CONTACT.RESTITUTION) * vn / (ip + iq);
      /* the shark hits harder: what it gives is multiplied */
      p.vx -= nx * jn * ip * qp.bumpOut;
      p.vy -= ny * jn * ip * qp.bumpOut;
      q.vx += nx * jn * iq * pp.bumpOut;
      q.vy += ny * jn * iq * pp.bumpOut;
      /* a glancing hit spins both the same way */
      const vt = rvx * -ny + rvy * nx;
      const spin = CONTACT.SPIN * vt * Math.min(1, -vn / 1.5);
      p.w += spin * (2 * qp.mass / (pp.mass + qp.mass)) * 0.5;
      q.w += spin * (2 * pp.mass / (pp.mass + qp.mass)) * 0.5;
      if (-vn > CONTACT.BUMP_MIN) {
        p.tBumpFlag = t; q.tBumpFlag = t;
        /* the giver is whoever was moving into the other harder */
        const pin = p.vx * nx + p.vy * ny, qin = -(q.vx * nx + q.vy * ny);
        if (pin >= qin) bumpEvent(race, p, q, p.x + nx * R, p.y + ny * R, t);
        else bumpEvent(race, q, p, p.x + nx * R, p.y + ny * R, t);
      }
    }
  }
  /* rocks, the island, the banks */
  for (const rider of riders) {
    if (rider.arrived) continue;
    const phys = physicsFor(rider.fl);
    for (const rock of rocksNear(course, rider.s, 6)) hitCircle(race, rider, phys, rock.x, rock.y, rock.r, CONTACT.ROCK_RESTITUTION, t);
    for (const island of islandsNear(course, rider.s, 4)) hitCircle(race, rider, phys, island.x, island.y, island.r, CONTACT.BANK_RESTITUTION, t);
    const near = nearestS(course, rider.x, rider.y, rider.s);
    const room = near.w / 2 - R;
    if (Math.abs(near.d) > room) {
      const side = Math.sign(near.d);
      /* the inward normal */
      const nx = -near.f.nx * side, ny = -near.f.ny * side;
      const depth = Math.abs(near.d) - room;
      rider.x += nx * depth;
      rider.y += ny * depth;
      surface(race, rider, phys, nx, ny, CONTACT.BANK_RESTITUTION, t, rider.x - nx * R, rider.y - ny * R);
    }
  }
}

function hitCircle(race, rider, phys, cx, cy, cr, restitution, t) {
  const dx = rider.x - cx, dy = rider.y - cy;
  const min = RADIUS + cr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const dist = Math.sqrt(d2) || 1e-6;
  const nx = dx / dist, ny = dy / dist;
  rider.x = cx + nx * min;
  rider.y = cy + ny * min;
  surface(race, rider, phys, nx, ny, restitution, t, cx + nx * cr, cy + ny * cr);
}

/* bounce off a fixed surface whose normal (into the water) is (nx, ny) */
function surface(race, rider, phys, nx, ny, restitution, t, x, y) {
  const vn = rider.vx * nx + rider.vy * ny;
  if (vn >= 0) return;
  const tx = -ny, ty = nx;
  const vt = rider.vx * tx + rider.vy * ty;
  /* scraping costs speed along the surface, more for a harder hit */
  const keep = 1 - (1 - CONTACT.SCRAPE) * Math.min(1, -vn / 1.5) - 0.04;
  rider.vx = tx * vt * keep - nx * vn * restitution;
  rider.vy = ty * vt * keep - ny * vn * restitution;
  /* a fixed surface glances you off it: the heading eases toward the way you
     slide along it (never into it, so a bank cannot hold you) */
  const along = Math.atan2(rider.vy, rider.vx);
  if (Math.hypot(rider.vx, rider.vy) > 0.3 && -vn > 0.2) {
    const turn = wrapAngle(along - rider.a);
    if (Math.abs(turn) < Math.PI / 2) rider.w += turn * CONTACT.SPIN * Math.min(1, -vn / 1.5);
  }
  if (-vn > CONTACT.BUMP_MIN) {
    rider.tBumpFlag = t;
    bumpEvent(race, rider, null, x, y, t);
  }
  void phys;
}

/* ---- balloons ---- */

function landBalloons(race, t) {
  if (!race.balloons.length) return;
  const flying = [];
  for (const balloon of race.balloons) {
    if (balloon.land > t + 1e-9) { flying.push(balloon); continue; }
    const target = riderOf(race, balloon.at);
    if (!target || target.arrived || t - target.hitAt < BALLOON.IMMUNE_MS / 1000) {
      const x = target ? target.x + (nextRandom(race) - 0.5) * 3 : 0;
      const y = target ? target.y + (nextRandom(race) - 0.5) * 3 : 0;
      race.events.push({ e:"splash", i:balloon.from, x:r3(x), y:r3(y) });
      continue;
    }
    const phys = physicsFor(target.fl);
    const heavy = 80 / phys.mass;
    const sign = nextRandom(race) < 0.5 ? -1 : 1;
    if (target.swim === 0) {
      target.w += sign * BALLOON.SPIN * heavy;
      const angle = nextRandom(race) * Math.PI * 2;
      target.vx += Math.cos(angle) * BALLOON.SHOVE * heavy;
      target.vy += Math.sin(angle) * BALLOON.SHOVE * heavy;
      target.push *= 0.5;
    }
    target.hitAt = t;
    target.tSplash = t;
    target.st.splashed += 1;
    race.events.push({ e:"splash", i:balloon.from, j:balloon.at, x:r3(target.x), y:r3(target.y) });
  }
  race.balloons = flying;
}

/* ---- what the screens and phones see ---- */

export function flagsOf(rider, t) {
  let f = 0;
  if (rider.swim > 0) f |= FLAG.SWIM;
  if (rider.hands < 2) f |= FLAG.HANDS_OFF;
  if (rider.arrived) f |= FLAG.ARRIVED;
  if (rider.drinkAt !== null) f |= FLAG.DRANK;
  if (t - rider.tL < FLAG_MS.STROKE / 1000) f |= FLAG.STROKE_L;
  if (t - rider.tR < FLAG_MS.STROKE / 1000) f |= FLAG.STROKE_R;
  if (t - (rider.tBumpFlag ?? -9) < FLAG_MS.BUMP / 1000) f |= FLAG.BUMP;
  if (t - rider.tSplash < FLAG_MS.SPLASH / 1000) f |= FLAG.SPLASHED;
  return f;
}

/* progress shown: metres from the start line, 0 to the leg's length */
export const progressOf = (race, rider) => clamp(rider.prog, 0, race.len);

/* one packed row per racer: [i, x, y, a, f, p] */
export const rows = race => race.riders.map(rider => packRow(rider.i,
  { x:rider.x, y:rider.y, a:rider.a, f:flagsOf(rider, race.t), p:progressOf(race, rider) }));
