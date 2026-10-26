/* A stand-in room for the screen (`?mock=1`), with the net API's exact shape
   (float/PROTOCOL.md "Net"): { send, on, close, serverNow, rtt, status,
   onStatus }. It plays a whole synthetic Cup over the fixture river and
   speaks the contract's messages (welcome, room, snap at 20 Hz, ev, debug),
   so the screen is built against the real wire format before the engine and
   net.js land.

   Everything is seeded and precomputed when the Cup starts, so any instant
   can be reached at once:
     ?mock=1                 a lobby that fills with 13 riders; Start (or &auto=1) runs the Cup
     &n=6                    how many riders join
     &shot=<point>           jump straight to a moment (SHOTS below)
     &freeze=1               stop the clock there (screenshots)
     &seed=7                 another race
     &drinking=0             the room's drinking off */
import { FIXTURE_COURSE } from "./fixtureCourse.js";
import { prepareCourse } from "./model/courseGeom.js";
import { cutSchedule } from "./model/cupShape.js";
import { FLAG, packRow } from "../../shared/protocol.js";
import { cleanLook, defaultLook, HAT_IDS, SHADE_IDS, POSE_IDS } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";

const DT = 50;
export const MOCK_TIMING = Object.freeze({ introMs:15000, gridMs:7000, countMs:3000, cutMs:20000, podiumMs:16000,
  feedbackMs:30000, capMs:30000, joinMs:600 });
const T = MOCK_TIMING;

const NAMES = ["Brandon", "Evan", "Eyob", "Sahil", "Khoa", "Chinh", "Adi", "Chiang", "Richard", "Allan", "Henry", "Ben", "Jeremy"];
const COLORS = ["#d97742", "#4f93a3", "#c9b25a", "#a6527c", "#6e9450", "#3b6e9c", "#e39a3b", "#7c5ca6", "#2f7e83",
  "#b23b5e", "#a8a03f", "#6d6fa8", "#c05b33", "#557b72", "#8a4f62", "#d1c0a0"];

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockEntrant(k, { bot = false } = {}) {
  const base = NAMES[k % NAMES.length];
  const name = bot ? `Bot ${k + 1}` : k >= NAMES.length ? `${base} ${Math.floor(k / NAMES.length) + 1}` : base;
  const groom = name === "Brandon";
  const hats = HAT_IDS.filter(id => id !== "crown");
  const look = cleanLook({
    ...defaultLook(name, FLOATIE_IDS),
    hat:groom ? "crown" : hats[(k * 5 + 1) % hats.length],
    shades:SHADE_IDS[(k * 3) % SHADE_IDS.length],
    pose:POSE_IDS[k % POSE_IDS.length],
  }, { groom, floatieIds:FLOATIE_IDS, seed:name });
  return { device:`mock-${k}`, name, color:COLORS[k % COLORS.length], look, bot, connected:true, ready:false,
    number:k + 1, skin:null, groom, drinks:true };
}

/* ── one round on the water ── */
function simulateRound({ geo, leg, field, through, throwers, drinking, entrants, seed }) {
  const rnd = mulberry32(seed);
  const len = leg.finish - leg.grid;
  const dt = DT / 1000;
  const islandAt = geo.islands.map(([x, y, r]) => {
    const near = geo.nearest(x, y);
    return { s:near.s, lat:geo.lateralOf(x, y, near.s), r };
  });
  const zone = (k, s) => geo.zones.some(z => z.k === k && s >= z.s0 && s <= z.s1);
  const pools = geo.zones.filter(z => z.k === "pool" && z.s1 > leg.grid && z.s0 < leg.finish);
  const drops = geo.zones.filter(z => z.k === "drop" && z.s1 > leg.grid && z.s0 < leg.finish);
  const riffles = geo.zones.filter(z => z.k === "riffle" && z.s1 > leg.grid && z.s0 < leg.finish);
  const cols = Math.min(5, field.length);
  const riders = field.map((i, k) => {
    const row = Math.floor(k / cols), col = k % cols;
    const inRow = Math.min(cols, field.length - row * cols);
    const s = leg.grid - 1 - row * 4.5;
    const w = geo.sample(s).w;
    const span = Math.min(w - 8, 4.2 * (inRow - 1) + 0.01);
    const lat = inRow > 1 ? span / 2 - (span * col) / (inRow - 1) : 0;
    const e = entrants[i] || {};
    const needsDrink = drinking && e.drinks !== false;
    let drink = null;
    if (needsDrink) {
      const pick = rnd();
      if (pools.length && pick < 0.6) {
        const pool = pools[0];
        drink = { s:Math.max(leg.grid + 8, pool.s0 + (pool.s1 - pool.s0) * rnd() * 0.5), dur:5000 + rnd() * 6000 };
      } else if (pick < 0.78) drink = { s:leg.grid + len * (0.1 + rnd() * 0.45), dur:5000 + rnd() * 6000 };
    }
    return {
      i, s, lat, lane:lat, vs:0, heading:Math.atan2(geo.sample(s).ty, geo.sample(s).tx),
      skill:0.84 + rnd() * 0.24, phase:rnd() * 10, phase2:rnd() * 10, side:rnd() < 0.5 ? 1 : -1,
      needsDrink, drink, drinkStart:null, drinkEnd:needsDrink ? null : undefined,
      flipDrop:rnd() < 0.38, flipRiffle:riffles.map(() => rnd() < 0.06),
      swimUntil:-1, bumpUntil:-1, bumpCool:-1, splashFrom:-1, splashUntil:-1, spinUntil:-1, slowUntil:-1,
      lastL:-1e9, lastR:-1e9, nextStroke:200 + rnd() * 300, strokeSide:rnd() < 0.5 ? "L" : "R",
      arrivedAt:null, placeAt:null, wait:1500 + rnd() * 2600, takeoutDrink:3000 + rnd() * 4500, x:0, y:0, rest:null,
    };
  });
  const byI = new Map(riders.map(r => [r.i, r]));
  const steps = [];
  const events = [];
  const results = [];
  const throws = throwers.map((i, k) => ({ i, next:7000 + k * 2300 + rnd() * 1500 }));
  const pending = [];
  let firstFinish = null, endStep = null, arrivals = 0;
  const tmp = {};
  for (let step = 0; step < 6000; step++) {
    const t = step * DT;
    for (const r of riders) {
      const p = geo.sampleInto(r.s, tmp);
      const w = p.w;
      const swim = t < r.swimUntil;
      /* drinking */
      if (r.needsDrink && r.drinkEnd === null && r.drinkStart === null) {
        if (r.arrivedAt !== null) { if (t >= r.arrivedAt + r.wait) r.drinkStart = t, r.drinkDur = r.takeoutDrink; }
        else if (r.drink && r.s >= r.drink.s && !swim) r.drinkStart = t, r.drinkDur = r.drink.dur;
      }
      if (r.drinkStart !== null && r.drinkEnd === null && t >= r.drinkStart + r.drinkDur) {
        r.drinkEnd = t;
        events.push({ t, e:"drink", i:r.i });
        if (r.arrivedAt !== null && r.placeAt === null) r.placeAt = t;
      }
      const handsOff = r.drinkStart !== null && r.drinkEnd === null;
      /* flips: the falls, sometimes a riffle */
      for (const z of drops) if (r.flipDrop && r.s >= z.s0 + 7 && r.s < z.s0 + 9 && r.swimUntil < 0) {
        r.swimUntil = t + 3600; r.flipDrop = false;
        events.push({ t, e:"flip", i:r.i, x:r.x, y:r.y });
      }
      riffles.forEach((z, k) => {
        if (r.flipRiffle[k] && r.s >= (z.s0 + z.s1) / 2 && r.swimUntil < t) {
          r.flipRiffle[k] = false; r.swimUntil = t + 3000;
          events.push({ t, e:"flip", i:r.i, x:r.x, y:r.y });
        }
      });
      /* speed along the river */
      const ramp = Math.min(1, t / 2000);
      let paddle = 2.6 * r.skill * ramp;
      if (handsOff) paddle *= 0.32;
      if (swim) paddle = 0.35;
      if (t < r.slowUntil) paddle *= 0.55;
      let target = geo.flowAt(r.s) * (swim ? 0.7 : 0.85) + paddle;
      if (r.arrivedAt !== null) {
        const gap = r.rest.s - r.s;
        target = Math.max(0, Math.min(target, gap * 0.6));
      }
      r.vs += (target - r.vs) * Math.min(1, dt * 1.5);
      r.s += r.vs * dt;
      /* across the river: a lane that wanders, around the island, inside the banks */
      let lane = r.lane + Math.sin(t * 0.00013 + r.phase) * 0.12 * w + Math.sin(t * 0.00037 + r.phase2) * 0.05 * w;
      if (r.arrivedAt !== null) lane = r.rest.lat;
      for (const isl of islandAt) {
        if (Math.abs(r.s - isl.s) < isl.r + 10) {
          const left = isl.lat + isl.r + 3, right = isl.lat - isl.r - 3;
          lane = r.side > 0 ? Math.max(lane, left) : Math.min(lane, right);
        }
      }
      const edge = w / 2 - 2.2;
      lane = Math.max(-edge, Math.min(edge, lane));
      r.lat += (lane - r.lat) * Math.min(1, dt * 0.9);
      r.lat = Math.max(-edge, Math.min(edge, r.lat));
      const nx = p.x + p.nx * r.lat, ny = p.y + p.ny * r.lat;
      const dx = nx - r.x, dy = ny - r.y;
      r.x = nx; r.y = ny;
      /* heading: the way it moves, a wobble per stroke, a spin when flipped or hit */
      if (step && Math.hypot(dx, dy) > 0.004) {
        const move = Math.atan2(dy, dx);
        let d = move - r.heading;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        r.heading += d * Math.min(1, dt * 3);
      }
      if (swim) r.heading += 1.8 * dt;
      if (t < r.spinUntil) r.heading += 6 * dt;
      /* strokes */
      if (!swim && r.arrivedAt === null && t >= r.nextStroke && ramp > 0) {
        const side = handsOff ? "R" : r.strokeSide;
        if (side === "L") { r.lastL = t; r.heading -= 0.06; } else { r.lastR = t; r.heading += 0.06; }
        r.strokeSide = r.strokeSide === "L" ? "R" : "L";
        r.nextStroke = t + (handsOff ? 700 : 300 + (1.1 - r.skill) * 260);
      }
      /* the takeout */
      if (r.arrivedAt === null && r.s - leg.grid >= len) {
        r.arrivedAt = t;
        if (firstFinish === null) firstFinish = t;
        const k = arrivals++;
        const pw = geo.sample(leg.finish + 8).w;
        r.rest = { s:leg.finish + 7 + (k % 3) * 3.4 + Math.floor(k / 6) * 1.5, lat:((k % 6) - 2.5) * Math.min(4.4, (pw - 6) / 6) };
        events.push({ t, e:"arrive", i:r.i });
        if (!r.needsDrink) { r.drinkEnd = t; r.placeAt = t; }
        else if (r.drinkEnd !== null) r.placeAt = t;
      }
      if (r.placeAt !== null && !results.some(row => row.i === r.i)) {
        results.push({ i:r.i, place:results.length + 1, time:r.arrivedAt, drinkAt:r.drinkEnd, at:t });
      }
    }
    /* bumps */
    for (let a = 0; a < riders.length; a++) for (let b = a + 1; b < riders.length; b++) {
      const ra = riders[a], rb = riders[b];
      if (ra.arrivedAt !== null && rb.arrivedAt !== null) continue;
      const d = Math.hypot(ra.x - rb.x, ra.y - rb.y);
      if (d < 1.9 && t > ra.bumpCool && t > rb.bumpCool) {
        ra.bumpUntil = rb.bumpUntil = t + 250;
        ra.bumpCool = rb.bumpCool = t + 1300;
        const push = ra.lat >= rb.lat ? 1 : -1;
        ra.lane += push * 0.8; rb.lane -= push * 0.8;
        events.push({ t, e:"bump", i:ra.i, j:rb.i, x:(ra.x + rb.x) / 2, y:(ra.y + rb.y) / 2 });
      }
    }
    /* balloons from the beach */
    for (const th of throws) {
      if (t < th.next) continue;
      th.next = t + 12000;
      const targets = riders.filter(r => r.arrivedAt === null && t - r.splashFrom > 6000 && t >= r.swimUntil);
      if (!targets.length) continue;
      targets.sort((a, b) => b.s - a.s);
      const pick = targets[Math.floor(rnd() * Math.min(targets.length, 5))];
      events.push({ t, e:"balloon", i:th.i, j:pick.i, x:pick.x, y:pick.y });
      pending.push({ at:t + 1200, i:th.i, j:pick.i });
    }
    for (let k = pending.length - 1; k >= 0; k--) {
      const hit = pending[k];
      if (t < hit.at) continue;
      pending.splice(k, 1);
      const r = byI.get(hit.j);
      if (!r || r.arrivedAt !== null) continue;
      r.splashFrom = t; r.splashUntil = t + 600; r.spinUntil = t + 500; r.slowUntil = t + 1200;
      events.push({ t, e:"splash", i:hit.i, j:hit.j, x:r.x, y:r.y });
    }
    /* the rows */
    steps.push(riders.map(r => {
      let f = 0;
      if (t < r.swimUntil) f |= FLAG.SWIM;
      if (r.drinkStart !== null && r.drinkEnd === null) f |= FLAG.HANDS_OFF;
      if (r.arrivedAt !== null) f |= FLAG.ARRIVED;
      if (r.drinkEnd !== null && r.drinkEnd !== undefined) f |= FLAG.DRANK;
      if (t - r.lastL < 250) f |= FLAG.STROKE_L;
      if (t - r.lastR < 250) f |= FLAG.STROKE_R;
      if (t < r.bumpUntil) f |= FLAG.BUMP;
      if (t >= r.splashFrom && t < r.splashUntil) f |= FLAG.SPLASHED;
      return packRow(r.i, { x:r.x, y:r.y, a:r.heading, f, p:r.s - leg.grid });
    }));
    const placed = results.length;
    if (placed >= Math.min(through, riders.length) || (firstFinish !== null && t >= firstFinish + T.capMs)) { endStep = step; break; }
  }
  if (endStep === null) endStep = steps.length - 1;
  const duration = endStep * DT + DT;
  const placedSet = new Set(results.map(row => row.i));
  const rest = riders.filter(r => !placedSet.has(r.i)).sort((a, b) => b.s - a.s);
  const order = [...results.map(row => row.i), ...rest.map(r => r.i)];
  return { steps, events:events.sort((a, b) => a.t - b.t), results, order, duration, firstFinish,
    progress:new Map(riders.map(r => [r.i, r.s - leg.grid])) };
}

/* ── the whole Cup, in ms from its start ── */
function buildCup({ entrants, geo, drinking, seed }) {
  const n = entrants.length;
  const shape = cutSchedule(n);
  const rounds = shape.length;
  const legs = geo.legs;
  const legFor = r => Math.max(0, legs.length - rounds + r);
  const rnd = mulberry32(seed);
  const phases = [];
  let t = 0;
  phases.push({ phase:"intro", round:0, leg:legFor(0), startAt:t, endsAt:(t += T.introMs) });
  let field = entrants.map((_, i) => i).sort(() => rnd() - 0.5);
  const out = [];
  const races = [];
  for (let r = 0; r < rounds; r++) {
    const leg = legFor(r);
    const last = r === rounds - 1;
    const through = last ? field.length : Math.min(field.length, shape[r + 1]);
    phases.push({ phase:"grid", round:r, leg, field, through, startAt:t, endsAt:(t += T.gridMs), out:out.slice() });
    phases.push({ phase:"countdown", round:r, leg, field, through, startAt:t, endsAt:(t += T.countMs), out:out.slice() });
    const gun = t;
    const sim = simulateRound({ geo, leg:legs[leg], field, through, throwers:out.slice(), drinking, entrants, seed:seed * 31 + r * 7919 });
    const race = { round:r, leg, field, through, gun, sim, outBefore:out.slice() };
    races.push(race);
    phases.push({ phase:"race", round:r, leg, field, through, startAt:gun, endsAt:(t = gun + sim.duration), race, out:out.slice() });
    const cut = last ? [] : sim.order.slice(through);
    /* elimination order: the best of a cut goes out last */
    out.push(...cut.slice().reverse());
    race.cut = cut;
    if (!last) phases.push({ phase:"cut", round:r, leg, field, through, startAt:t, endsAt:(t += T.cutMs), race, out:out.slice() });
    field = last ? sim.order : sim.order.slice(0, through);
  }
  const final = races[races.length - 1].sim.order;
  const podium = final.slice(0, 3);
  const standings = [...final, ...out.slice().reverse()];
  phases.push({ phase:"podium", round:rounds - 1, leg:legFor(rounds - 1), field:final, startAt:t, endsAt:(t += T.podiumMs), out:out.slice(), podium, standings });
  phases.push({ phase:"feedback", round:rounds - 1, leg:legFor(rounds - 1), field:final, startAt:t, endsAt:(t += T.feedbackMs), out:out.slice(), podium, standings });
  return { phases, races, rounds, podium, standings, end:t, legFor, geo };
}

/* named moments, in ms from the Cup's start */
export function shotTime(cup, shot) {
  const ph = kind => cup.phases.filter(p => p.phase === kind);
  const race = r => cup.races[Math.min(r, cup.races.length - 1)];
  const arrivals = r => race(r).sim.events.filter(e => e.e === "arrive");
  switch (shot) {
    case "intro": return ph("intro")[0].startAt + 6500;
    case "grid": return ph("grid")[0].startAt + 3600;
    case "countdown": return ph("countdown")[0].startAt + 1300;
    case "go": return race(0).gun + 600;
    case "race": return race(0).gun + 30000;
    case "race2": case "narrows": return race(1).gun + 30000;
    case "race3": case "whirlpool": return race(2).gun + 36000;
    case "drop": {
      /* the leader at the falls' lip, in the final */
      const last = race(cup.races.length - 1);
      const lip = cup.geo.zones.find(z => z.k === "drop");
      const leg = cup.geo.legs[last.leg];
      const k = lip ? last.sim.steps.findIndex(rows => rows.some(row => row[5] + leg.grid >= lip.s0 + 2)) : -1;
      return last.gun + (k >= 0 ? k * DT + 400 : 40000);
    }
    case "final": return race(cup.races.length - 1).gun + 20000;
    case "arrivals": { const a = arrivals(0); return race(0).gun + (a[Math.min(4, a.length - 1)]?.t ?? 60000) + 900; }
    case "cut": return ph("cut")[0].startAt + 4200;
    case "cutnext": return ph("cut")[0].startAt + 14500;
    case "podium": return ph("podium")[0].startAt + 5200;
    case "feedback": return ph("feedback")[0].startAt + 2500;
    default: return null;
  }
}

/* ── the connection ── */
export function connectFloat({ room = "mock", role = "screen", hello = {}, options = {} } = {}) {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const opt = key => options[key] ?? params.get(key);
  const n = Math.max(1, Math.min(16, Number(opt("n")) || 13));
  const seed = Number(opt("seed")) || 3;
  const shot = opt("shot");
  const freeze = String(opt("freeze") || "") === "1";
  const auto = String(opt("auto") || "") === "1";
  const geo = prepareCourse(FIXTURE_COURSE);
  const listeners = new Map();
  const statusFns = new Set();
  let status = "connecting";
  let closed = false;
  let sentCourse = false;
  const realStart = Date.now();
  let frozenAt = null;
  const clock = () => (frozenAt !== null ? frozenAt : Date.now());

  let drinking = String(opt("drinking") ?? "1") !== "0";
  let entrants = [];
  let joinFrom = realStart;
  let cup = null;
  let cupStart = null;
  let lastPhaseKey = "";
  let lastResults = -1;
  let lastOut = -1;
  let emittedStep = -1;
  let emittedEvent = -1;
  let emittedRace = null;

  const emit = msg => {
    const fns = listeners.get(msg.t);
    if (fns) [...fns].forEach(fn => { try { fn(msg); } catch (error) { console.error(error); } });
  };
  const setStatus = next => { status = next; statusFns.forEach(fn => fn(next)); };

  const lobbyEntrants = now => {
    const joined = Math.min(n, Math.floor((now - joinFrom) / T.joinMs) + 1);
    while (entrants.length < joined) entrants.push(mockEntrant(entrants.length));
    entrants.forEach((e, k) => { e.ready = now - joinFrom > (k + 2) * T.joinMs + (k % 3) * 900 && k % 5 !== 3; });
    return entrants;
  };

  const startCup = (at, extraBots = 0) => {
    while (entrants.length < Math.min(16, extraBots)) entrants.push(mockEntrant(entrants.length, { bot:true }));
    cup = buildCup({ entrants, geo, drinking, seed });
    cupStart = at;
    emittedStep = -1; emittedEvent = -1; emittedRace = null; lastResults = -1; lastOut = -1;
  };

  const phaseAt = now => {
    if (!cup) return null;
    const rel = now - cupStart;
    if (rel >= cup.end) return null;
    return cup.phases.find(p => rel >= p.startAt && rel < p.endsAt) || null;
  };

  const roomMessage = now => {
    const ph = phaseAt(now);
    if (cup && !ph && now - cupStart >= cup.end) { cup = null; cupStart = null; joinFrom = now - n * T.joinMs; }
    const abs = rel => (rel === null || rel === undefined ? null : cupStart + rel);
    const msg = {
      t:"room", s:now, phase:ph ? ph.phase : "lobby", mode:"party", code:room, drinking,
      round:ph ? ph.round : 0, rounds:cup ? cup.rounds : cutSchedule(entrants.length).length,
      leg:ph ? ph.leg : 0, field:ph?.field ? ph.field.slice() : entrants.map((_, i) => i),
      out:ph?.out ? ph.out.slice() : [],
      /* a countdown names its gun as startAt (the race's start) */
      startAt:ph ? abs(ph.phase === "countdown" ? ph.endsAt : ph.startAt) : null, endsAt:ph ? abs(ph.endsAt) : null,
      entrants:(ph ? entrants : lobbyEntrants(now)).map(e => ({ ...e, look:{ ...e.look } })),
      results:[], standings:[], podium:[],
    };
    if (ph?.race) {
      const rel = now - cupStart - ph.race.gun;
      msg.results = ph.race.sim.results.filter(row => ph.phase !== "race" || row.at <= rel)
        .map(({ i, place, time, drinkAt }) => ({ i, place, time, drinkAt }));
      if (ph.phase === "cut") msg.out = ph.out.slice();
      /* a race's end is known only once someone finishes: the cap */
      if (ph.phase === "race") {
        const first = ph.race.sim.firstFinish;
        msg.endsAt = first !== null && first <= rel ? cupStart + ph.race.gun + first + T.capMs : null;
      }
    }
    if (ph?.phase === "race" || ph?.phase === "cut" || ph?.phase === "grid" || ph?.phase === "countdown") {
      const done = cup.races.filter(r => cupStart + r.gun + r.sim.duration <= now);
      const lastRace = done[done.length - 1];
      msg.standings = lastRace ? [...lastRace.sim.order.filter(i => !(ph.out || []).includes(i)), ...(ph.out || []).slice().reverse()] : [];
    }
    if (ph?.podium) { msg.podium = ph.podium.slice(); msg.standings = ph.standings.slice(); }
    if (!sentCourse) { msg.course = FIXTURE_COURSE; sentCourse = true; } else msg.courseId = FIXTURE_COURSE.id;
    msg.through = undefined;
    return msg;
  };

  const emitRoom = now => emit(roomMessage(now));

  /* a race's rows and moments as they come due; a screen that joins
     mid-race first gets the last 1.5 s of them at once */
  const emitRace = now => {
    const ph = phaseAt(now);
    if (!ph || ph.phase !== "race") return;
    const race = ph.race;
    let backfillMs = 0;
    if (emittedRace !== race) { emittedRace = race; emittedStep = -1; emittedEvent = -1; backfillMs = 1500; }
    const rel = now - cupStart - race.gun;
    const upTo = Math.min(race.sim.steps.length - 1, Math.floor(rel / DT));
    const from = Math.max(emittedStep + 1, Math.floor((rel - backfillMs) / DT), 0);
    for (let k = from; k <= upTo; k++) emit({ t:"snap", s:cupStart + race.gun + k * DT, k:race.sim.steps[k] });
    emittedStep = Math.max(emittedStep, upTo);
    const evs = race.sim.events;
    while (emittedEvent + 1 < evs.length && evs[emittedEvent + 1].t <= rel) {
      const e = evs[++emittedEvent];
      if (rel - e.t > Math.max(backfillMs, 1500)) continue;
      const msg = { t:"ev", s:cupStart + race.gun + e.t, e:e.e, i:e.i };
      if (e.j !== undefined) msg.j = e.j;
      if (e.x !== undefined) { msg.x = Math.round(e.x * 100) / 100; msg.y = Math.round(e.y * 100) / 100; }
      emit(msg);
    }
    const placed = race.sim.results.filter(row => row.at <= rel).length;
    if (placed !== lastResults) { lastResults = placed; emitRoom(now); }
  };

  const tick = () => {
    if (closed) return;
    const now = clock();
    const ph = phaseAt(now);
    const key = ph ? `${ph.phase}:${ph.round}` : `lobby:${cup ? "end" : entrants.length}:${entrants.filter(e => e.ready).length}`;
    if (!cup && auto && now - joinFrom > n * T.joinMs + 2500) { startCup(now); }
    if (key !== lastPhaseKey) {
      lastPhaseKey = key;
      lastResults = ph?.race ? ph.race.sim.results.filter(row => row.at <= now - cupStart - ph.race.gun).length : -1;
      emitRoom(now);
    }
    else if (!ph) lobbyEntrants(now);
    if (ph?.phase === "race") emitRace(now);
    if (ph?.out && ph.out.length !== lastOut) { lastOut = ph.out.length; }
  };

  /* a shot: the Cup already running, the clock at that moment */
  if (shot && shot !== "lobby") {
    entrants = Array.from({ length:n }, (_, k) => ({ ...mockEntrant(k), ready:true }));
    startCup(0);
    const rel = shotTime(cup, shot);
    cupStart = realStart - (rel ?? 0);
  } else if (shot === "lobby") {
    joinFrom = realStart - n * T.joinMs - 6000;
  }
  if (freeze) frozenAt = realStart;

  let timer = null;
  let debugTimer = null;
  const open = () => {
    if (closed) return;
    setStatus("open");
    const now = clock();
    emit({ t:"welcome", s:now, you:{ device:hello.device || "mock-screen", role } });
    lastPhaseKey = "";
    tick();
    timer = setInterval(tick, DT);
    debugTimer = setInterval(() => {
      if (closed) return;
      const rtt = {};
      entrants.forEach((e, k) => { if (!e.bot) rtt[e.device] = 45 + ((k * 37 + Math.floor(clock() / 2000) * 13) % 70); });
      emit({ t:"debug", s:clock(), rtt });
    }, 2000);
  };
  const openTimer = setTimeout(open, 60);

  return {
    send(msg) {
      if (closed || !msg || typeof msg !== "object") return;
      const now = clock();
      if (msg.t === "ping") emit({ t:"pong", s:now, c:msg.c });
      if (msg.t !== "host") return;
      if (msg.cmd === "start" && !cup) {
        if (typeof msg.drinking === "boolean") drinking = msg.drinking;
        startCup(now, Number(msg.bots) || 0);
        lastPhaseKey = "";
        tick();
      } else if (msg.cmd === "lobby") {
        cup = null; cupStart = null; lastPhaseKey = ""; tick();
      } else if (msg.cmd === "kick" && !cup) {
        entrants = entrants.filter(e => e.device !== msg.device);
        lastPhaseKey = ""; tick();
      }
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      closed = true;
      clearTimeout(openTimer); clearInterval(timer); clearInterval(debugTimer);
      setStatus("closed");
      listeners.clear(); statusFns.clear();
    },
    serverNow:clock,
    rtt:() => 0,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:true,
  };
}

export default connectFloat;
