/* Computer paddlers (float/PROTOCOL.md "Field Day": bots fill a field and
   paddle for anyone whose phone is away). A bot sends exactly what a phone
   sends (strokes, thumbs, the drink) through applyInput, so the race cannot
   tell them apart.

     racingLine(course, variant)        the line bots follow: [[s, d], ...]
     createBot({ i, skill, seed, ... }) a bot's state (plain JSON, kept in race.bots)
     botInputs(race, course, bot)       this tick's inputs for the bot's rider
     botBalloon(bot, race, t)           an eliminated bot's throw, or null
     botFloatie(seed), botSkills(n, seed)

   Steering: a look-ahead point on the racing line (plus a personal offset so
   bots do not queue nose to tail), the heading error corrected by stroking on
   the side that turns toward it (a right stroke yaws left), alternating when
   on line. Skill (0 sloppy to 1 strong) sets cadence, power, how tight the
   steering is, how often the bot zones out, and how well it lines up the
   Drop. Bots drink in calm water (hands off 3 to 6 s) and, if they reach the
   takeout dry, finish their drink there after a short delay. Deterministic:
   each bot's randomness is its own mulberry32 state. */
import { frameAt, flowAt, legAt, islandSpan, rocksNear, islandsNear, courseLength, zonesAt } from "./course.js";
import { nextRandom, seedOf, riderOf, physicsFor } from "./sim.js";
import { RADIUS } from "./tuning.js";
import { BEAT_MS } from "./beat.js";
import { FLOATIE_IDS } from "./floaties.js";
import { wrapAngle } from "./protocol.js";

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/* ---------------------------------------------------------------- the line

   Dynamic programming over stations every 4 m and lanes across the river:
   the cheapest path in time (length over paddling plus current, the inside
   of a bend shorter, fast water better), never through a rock, the island or
   a whirlpool's grip, with a cost on swinging across. `variant` picks the
   island's channel: "left" (fast, rocky, shorter) or "right" (calm, longer). */
const LINES = new WeakMap();
const STATION = 4;
const LANES = 25;
const PADDLE_V = 2.4;

export function racingLine(course, variant = "left") {
  let cache = LINES.get(course);
  if (!cache) { cache = {}; LINES.set(course, cache); }
  if (cache[variant]) return cache[variant];
  const total = courseLength(course);
  const stations = Math.floor(total / STATION) + 1;
  const pools = course.zones.filter(zone => zone.k === "whirlpool");
  const splits = course.zones.filter(zone => zone.k === "split");
  const lane = [], cost = [];
  for (let k = 0; k < stations; k += 1) {
    const s = Math.min(total, k * STATION);
    const f = frameAt(course, s);
    const half = f.w / 2 - RADIUS - 0.6;
    const span = islandSpan(course, s);
    const split = splits.find(zone => s >= zone.s0 && s <= zone.s1);
    const rocks = rocksNear(course, s, 4);
    const islands = islandsNear(course, s, 4);
    const row = [], rowCost = [];
    for (let j = 0; j < LANES; j += 1) {
      const d = -half + (2 * half) * j / (LANES - 1);
      const x = f.x + f.nx * d, y = f.y + f.ny * d;
      let blocked = false, near = 0;
      for (const rock of rocks) {
        const gap = Math.hypot(x - rock.x, y - rock.y) - rock.r - RADIUS;
        if (gap < 0.5) blocked = true; else if (gap < 1.6) near += (1.6 - gap) * 0.35;
      }
      for (const island of islands) {
        const gap = Math.hypot(x - island.x, y - island.y) - island.r - RADIUS;
        if (gap < 0.6) blocked = true; else if (gap < 1.8) near += (1.8 - gap) * 0.3;
      }
      if (span && d > span[0] - RADIUS && d < span[1] + RADIUS) blocked = true;
      if (split && span) {
        if (variant === "left" && d < span[0]) blocked = true;
        if (variant === "right" && d > span[1]) blocked = true;
      }
      for (const pool of pools) {
        const rho = Math.hypot(x - pool.x, y - pool.y);
        if (rho < pool.r * 0.8) blocked = true; else if (rho < pool.r * 1.25) near += (pool.r * 1.25 - rho) * 0.25;
      }
      const water = flowAt(course, x, y, { hint:s });
      const along = water.ux * f.tx + water.uy * f.ty;
      row.push({ d, x, y, blocked, near, speed:Math.max(0.6, PADDLE_V + along) });
      rowCost.push(Infinity);
    }
    lane.push(row);
    cost.push(rowCost);
  }
  /* forward pass */
  const from = lane.map(() => new Int16Array(LANES).fill(-1));
  for (let j = 0; j < LANES; j += 1) if (!lane[0][j].blocked) cost[0][j] = Math.abs(lane[0][j].d) * 0.02;
  const reach = 3;
  for (let k = 1; k < stations; k += 1) {
    for (let j = 0; j < LANES; j += 1) {
      const cell = lane[k][j];
      if (cell.blocked) continue;
      let best = Infinity, arg = -1;
      for (let i = Math.max(0, j - reach); i <= Math.min(LANES - 1, j + reach); i += 1) {
        const prev = cost[k - 1][i];
        if (!Number.isFinite(prev)) continue;
        const p = lane[k - 1][i];
        const len = Math.hypot(cell.x - p.x, cell.y - p.y);
        const swing = (cell.d - p.d) * (cell.d - p.d) * 0.05;
        const c = prev + len / ((cell.speed + p.speed) / 2) + cell.near + swing;
        if (c < best) { best = c; arg = i; }
      }
      cost[k][j] = best;
      from[k][j] = arg;
    }
    /* a station every lane of which is blocked would strand the line: keep
       the middle open (never happens on the Salt; a guard for odd courses) */
    if (cost[k].every(c => !Number.isFinite(c))) {
      const mid = (LANES - 1) >> 1;
      cost[k][mid] = Math.min(...cost[k - 1].filter(Number.isFinite), 0) + STATION;
      from[k][mid] = cost[k - 1].findIndex(Number.isFinite);
    }
  }
  let j = 0;
  for (let i = 1; i < LANES; i += 1) if (cost[stations - 1][i] < cost[stations - 1][j]) j = i;
  const path = new Array(stations);
  for (let k = stations - 1; k >= 0; k -= 1) {
    path[k] = lane[k][Math.max(0, j)].d;
    j = k ? from[k][Math.max(0, j)] : j;
    if (j < 0) j = (LANES - 1) >> 1;
  }
  /* a light smoothing that never moves a point into a blocked cell's lane */
  const smooth = path.slice();
  for (let pass = 0; pass < 2; pass += 1) {
    for (let k = 1; k < stations - 1; k += 1) {
      const next = (smooth[k - 1] + 2 * smooth[k] + smooth[k + 1]) / 4;
      if (Math.abs(next - path[k]) < 0.9) smooth[k] = next;
    }
  }
  const line = smooth.map((d, k) => [Math.min(total, k * STATION), Math.round(d * 100) / 100]);
  cache[variant] = line;
  return line;
}

/* the line's offset at s */
export function lineAt(line, s) {
  if (s <= line[0][0]) return line[0][1];
  const k = Math.min(line.length - 2, Math.floor(s / STATION));
  const [s0, d0] = line[k], [s1, d1] = line[k + 1];
  const u = s1 > s0 ? clamp((s - s0) / (s1 - s0), 0, 1) : 0;
  return d0 + (d1 - d0) * u;
}

/* ---------------------------------------------------------------- a bot */

/* skills for n bots, spread from sloppy to strong, shuffled by seed */
export function botSkills(n, seed = 1) {
  const holder = { rng:seedOf(`skills:${seed}`) };
  const skills = [];
  for (let k = 0; k < n; k += 1) skills.push(n === 1 ? 0.6 : 0.2 + 0.75 * k / (n - 1));
  for (let k = skills.length - 1; k > 0; k -= 1) {
    const j = Math.floor(nextRandom(holder) * (k + 1));
    [skills[k], skills[j]] = [skills[j], skills[k]];
  }
  return skills.map(value => Math.round(value * 100) / 100);
}

export const botFloatie = seed => FLOATIE_IDS[Math.floor(nextRandom({ rng:seedOf(`floatie:${seed}`) }) * FLOATIE_IDS.length)];

/* `style` (optional) overrides the timing skill gives: { perfect, off } as
   rates (the rest GOOD) and { extra } the share of beats it strokes twice
   (the second too fast), or { spam } strokes a second at no particular
   moment, as a phone mashed by thumbs; scripts/float-sim.mjs races human
   players this way */
export function createBot({ i, skill = 0.6, seed = 1, leg = 0, course, style = null }) {
  const bot = { i, skill:clamp(Number(skill) || 0.6, 0, 1), rng:seedOf(`bot:${seed}:${i}:${leg}`),
    variant:"left", offset:0, offsetTo:0, offsetAt:0, next:0, side:"R", hands:2,
    drinkAt:null, drinkUntil:null, drank:false, wait:null, mistake:null, mistakeUntil:0, wrong:false,
    plan:null, lastK:-1, style:style ? { ...style } : null };
  /* the island: a bot that still has to drink takes the calm right channel more often */
  bot.variant = nextRandom(bot) < 0.3 + 0.25 * (1 - bot.skill) ? "right" : "left";
  /* where it means to drink: the first calm water past the start, mostly */
  bot.drinkPlan = nextRandom(bot) < 0.85 ? 0 : 1;
  bot.drinkFor = 3 + 3 * nextRandom(bot);
  /* at the Drop's lip the sloppy sometimes freeze and go over crooked */
  bot.nerves = nextRandom(bot) < 0.55 * (1 - bot.skill) * (1 - bot.skill);
  if (course) racingLine(course, bot.variant);
  return bot;
}

const calmKinds = new Set(["pool", "eddy", "bar"]);
/* calm water ahead of this bot to drink in (a pool, an eddy, the bar, or the
   calm channel it chose) */
function calmHere(course, bot, rider) {
  for (const zone of zonesAt(course, rider.s)) {
    if (calmKinds.has(zone.k)) return true;
    if (zone.k === "split" && bot.variant === "right") {
      const span = islandSpan(course, rider.s);
      if (span && rider.s > zone.s0 + 10 && rider.s < zone.s1 - 12) return true;
    }
  }
  return false;
}
const hazardAhead = (course, s) => zonesAt(course, s + 14).some(zone => zone.k === "riffle" || zone.k === "drop" || zone.k === "whirlpool")
  || rocksNear(course, s + 6, 6).length > 0;

/* The beat (float/PROTOCOL.md "The beat"): a bot strokes once a beat, on
   it by its accuracy: PERFECT from 30% (skill 0) to 90% (skill 1) of the
   time, the odd stroke early or late, the rest GOOD. It sends what a phone
   sends: the beat k and its offset d. */
export const accuracyOf = bot => ({
  perfect:bot.style?.perfect ?? 0.3 + 0.6 * bot.skill,
  off:bot.style?.off ?? 0.015 + 0.05 * (1 - bot.skill),
});
function planBeat(bot, k) {
  const { perfect, off } = accuracyOf(bot);
  const roll = nextRandom(bot);
  const sign = nextRandom(bot) < 0.5 ? -1 : 1;
  let d;
  if (roll < off) d = sign * (175 + 65 * nextRandom(bot));
  else if (roll < off + perfect) d = (nextRandom(bot) * 2 - 1) * 72;
  else d = sign * (88 + 68 * nextRandom(bot));
  return { k, d:Math.round(d) };
}
/* the bot's next beat, if its moment has come (a plan left behind by a
   drink, a swim or a pause is made again for the beat ahead) */
function beatDue(bot, nowMs) {
  if (!bot.plan || nowMs > bot.plan.k * BEAT_MS + bot.plan.d + 300)
    bot.plan = planBeat(bot, Math.max(bot.lastK + 1, Math.ceil((nowMs - 60) / BEAT_MS)));
  return nowMs >= bot.plan.k * BEAT_MS + bot.plan.d ? bot.plan : null;
}
const stroked = (bot, plan) => { bot.lastK = plan.k; bot.plan = null; };

/* this tick's inputs for the bot's rider: [{ t:"stroke", side, p, k, d }, ...] */
export function botInputs(race, course, bot) {
  const rider = riderOf(race, bot.i);
  if (!rider) return [];
  const t = race.t;
  const out = [];
  const setHands = n => { if (bot.hands !== n) { bot.hands = n; out.push({ t:"hands", n }); } };

  if (rider.arrived) {
    /* reached the takeout dry: finish the drink after a moment */
    if (rider.drinkAt === null) {
      if (bot.wait === null) bot.wait = t + 0.5 + 2.5 * nextRandom(bot);
      if (t >= bot.wait) { setHands(2); out.push({ t:"drink" }); bot.drank = true; }
      else setHands(0);
    }
    return out;
  }
  if (rider.swim > 0) return out;

  /* drinking: hands off in calm water, then the drink */
  const leg = legAt(course, race.leg);
  if (!bot.drank && rider.drinkAt === null && race.drinking && rider.drinks) {
    if (bot.drinkUntil !== null) {
      if (t >= bot.drinkUntil) { bot.drinkUntil = null; bot.drank = true; setHands(2); out.push({ t:"drink" }); }
      else {
        /* a drink costs a level of groove, for every floatie (the cooler's
           twist is that it holds its line meanwhile, not its streak) */
        return out;
      }
    } else if (rider.prog > 25 && rider.s < leg.finish - 8 && calmHere(course, bot, rider) && !hazardAhead(course, rider.s)) {
      if (bot.drinkPlan <= 0) {
        bot.drinkUntil = t + bot.drinkFor * (1.15 - 0.3 * bot.skill);
        setHands(physicsFor(rider.fl).steadyHandsOff ? 1 : 0);
        return out;
      }
    } else if (bot.drinkPlan > 0 && rider.prog > 25 && !calmHere(course, bot, rider) && bot.wasCalm) bot.drinkPlan -= 1;
    bot.wasCalm = calmHere(course, bot, rider);
  }
  setHands(2);

  /* zoning out now and then */
  if (bot.mistake && t < bot.mistakeUntil) {
    if (bot.mistake === "idle") return out;
  } else if (bot.mistake) bot.mistake = null;
  if (!bot.mistake && t > 2 && nextRandom(bot) < (1 - bot.skill) * 0.16 * (1 / 30)) {
    const roll = nextRandom(bot);
    bot.mistake = roll < 0.55 ? "idle" : roll < 0.85 ? "wrong" : "mash";
    bot.mistakeUntil = t + (bot.mistake === "idle" ? 0.5 + 1.2 * nextRandom(bot) : 0.8 + 0.6 * nextRandom(bot));
  }

  /* a personal line, wandering slowly */
  if (t >= bot.offsetAt) {
    bot.offsetTo = (nextRandom(bot) * 2 - 1) * (1.2 + 1.4 * (1 - bot.skill));
    bot.offsetAt = t + 3 + 4 * nextRandom(bot);
  }
  bot.offset += (bot.offsetTo - bot.offset) * 0.02;

  /* where it is across the river */
  const here = frameAt(course, rider.s);
  const across = (rider.x - here.x) * here.nx + (rider.y - here.y) * here.ny;
  const speed = Math.hypot(rider.vx, rider.vy);
  /* the island: once at its nose, take the channel it is actually in */
  const nose = islandSpan(course, rider.s + 4);
  if (nose) bot.variant = across > (nose[0] + nose[1]) / 2 ? "left" : "right";
  /* pinned on something: back off toward open water for a moment */
  if (speed < 0.5 && bot.drinkUntil === null) {
    if (bot.slowSince === null || bot.slowSince === undefined) bot.slowSince = t;
    if (t - bot.slowSince > 1.5 && !(bot.unstickUntil > t)) {
      bot.unstickUntil = t + 1.2;
      bot.unstickTo = across > 0 ? -1 : 1;
    }
  } else bot.slowSince = null;

  /* the moment to stroke: the next beat, or a mashing thumb's next tap */
  const nowMs = t * 1000;
  let plan = null;
  if (bot.style?.spam) {
    if (t < bot.next) return out;
    bot.next = t + (1 / bot.style.spam) * (0.7 + 0.6 * nextRandom(bot));
    const k = Math.round(nowMs / BEAT_MS);
    plan = { k, d:Math.round(nowMs - k * BEAT_MS) };
  } else {
    plan = beatDue(bot, nowMs);
    if (!plan) return out;
  }

  /* where to point */
  const phys = physicsFor(rider.fl);
  const line = racingLine(course, bot.variant);
  const rocky = rocksNear(course, rider.s + 7, 9).length > 0;
  const look = rocky ? 4 + 0.6 * speed : 6 + 1.1 * speed;
  const ahead = rider.s + look;
  const f = frameAt(course, ahead);
  const room = Math.max(0, f.w / 2 - 4);
  let d = lineAt(line, ahead);
  /* its own line, but never toward a rock: among rocks it holds the racing line */
  if (!rocky && !nose) d += clamp(bot.offset, -room, room);
  if (bot.unstickUntil > t) d = across + bot.unstickTo * 3;
  const tx = f.x + f.nx * d, ty = f.y + f.ny * d;
  let want = Math.atan2(ty - rider.y, tx - rider.x);
  let deadband = 0.16 - 0.08 * bot.skill;
  /* the Drop: line up with the current well before the lip */
  for (const zone of course.zones) {
    if (zone.k !== "drop") continue;
    const to = zone.s0 - rider.s;
    if (bot.nerves && to > -2 && to < 7) return out;
    if (to > -2 && to < 18 + 14 * bot.skill) {
      const lip = frameAt(course, zone.s0);
      const lipA = Math.atan2(lip.ty, lip.tx);
      const blend = clamp((18 + 14 * bot.skill - to) / 10, 0, 1) * (0.55 + 0.45 * bot.skill);
      want = lipA + wrapAngle(want - lipA) * (1 - blend);
      deadband = 0.05 + 0.06 * (1 - bot.skill);
    }
  }
  /* aim with a little noise, the sloppier the more */
  want += (nextRandom(bot) * 2 - 1) * 0.08 * (1 - bot.skill);
  const err = wrapAngle(want - rider.a);
  const predicted = err - (rider.w + rider.yawQ) / phys.spinDamp;
  let side;
  if (predicted > deadband) side = "R";
  else if (predicted < -deadband) side = "L";
  else side = bot.side === "L" ? "R" : "L";
  if (bot.mistake === "wrong") side = side === "L" ? "R" : "L";
  /* a masher hits whichever thumb is down */
  if (bot.style?.spam && nextRandom(bot) < 0.35) side = nextRandom(bot) < 0.5 ? "L" : "R";
  bot.side = side;
  const p = bot.style?.spam ? 1 : clamp(0.72 + 0.26 * bot.skill + (nextRandom(bot) - 0.5) * 0.16, 0.3, 1);
  out.push({ t:"stroke", side, p, k:plan.k, d:plan.d });
  /* zoning into a flurry: a second stroke in the same beat (too fast) */
  if ((bot.mistake === "mash" || nextRandom(bot) < (bot.style?.extra ?? 0)) && !bot.style?.spam)
    out.push({ t:"stroke", side:side === "L" ? "R" : "L", p, k:plan.k, d:Math.min(240, plan.d + 110) });
  if (!bot.style?.spam) stroked(bot, plan);
  return out;
}

/* an eliminated bot's balloon: every so often once allowed, at the leader
   mostly, else anyone still racing */
export function botBalloon(bot, race, t) {
  /* bots are casual throwers: a while after each balloon comes back */
  if (bot.throwAt === undefined || bot.throwAt === null) bot.throwAt = t + 2 + 9 * nextRandom(bot);
  if (t < bot.throwAt) return null;
  bot.throwAt = null;
  const racing = race.riders.filter(rider => !rider.arrived);
  if (!racing.length) return null;
  const leader = racing.reduce((best, rider) => rider.prog > best.prog ? rider : best, racing[0]);
  return nextRandom(bot) < 0.6 ? leader.i : racing[Math.floor(nextRandom(bot) * racing.length)].i;
}
