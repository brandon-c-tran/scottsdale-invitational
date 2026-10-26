/* A pretend room for the phone (float/PROTOCOL.md "Net"): the interface of
   connectFloat, answering one controller with welcome, room, me and ev
   frames through every phase of a Cup, about 60 ms each way.

   /float/play?mock=1             a whole Cup against twelve bots; your strokes
                                  move you, your drink places you
   /float/play?mock=1&at=<scene>  one scene held still, for a screenshot (the
                                  race scenes keep answering strokes)

   It speaks what the room (float/worker/room.js) sends: the contract's
   fields plus cupId, swapUntil, cut, len, resume, final, history and each
   entrant's botDriven; live place-ordered results during a race; no `me`
   for a rider on the beach; the Cup's phase lengths. Strokes are judged on
   the beat as the room judges them (sim.js judgeBeat: the phone's k and d,
   lastBeat of any judgement, a missed beat a level), and `me` carries the
   streak, level and q. Its river is a toy (strokes add speed by judgement
   and level, one side six times running flips you): the engine owns the
   real rules. `window.__floatMock` (with expose) carries what the
   controller sent and go(scene) for the headless check. */
import { CRITTER_IDS, POSE_IDS } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { FLAG } from "../../shared/protocol.js";
import { BEAT_MS, LEVEL_GAIN, QUALITY_GAIN, judge, levelFloor, levelOf } from "../../shared/beat.js";
import { BEAT } from "../../shared/tuning.js";

export const MOCK_SCENES = Object.freeze(["lobby", "lobby-ready", "lobby-fieldday", "intro", "grid", "countdown",
  "race", "race-locked", "race-drank", "race-flipped", "race-arrived", "race-done", "race-final",
  "cut", "cut-final", "cut-last", "outcut", "beach-drink", "beach", "beach-between",
  "podium", "podium-win", "podium-out", "feedback", "watch"]);

/* the Cup's clock (the engine's tuning.js TIMING and BALLOON) */
export const MOCK_TIMING = Object.freeze({ INTRO_MS:8000, GRID_MS:4000, COUNTDOWN_MS:3000, CUT_MS:20000, SWAP_MS:15000,
  CUT_LAST_MS:7000, PODIUM_MS:15000, FEEDBACK_MS:45000, CAP_MS:30000, HARD_CAP_MS:180000,
  BALLOON_MS:12000, FLIGHT_MS:1200, IMMUNE_MS:6000, SWIM_MS:2500 });
export const MOCK_LEG_M = 160;
/* the toy stroke: speed by power, judgement and level, a top speed the
   level raises, and the engine's flood (tuning.js FLOOD: every stroke fills
   it, 3 a second drain out, past 2.5 a stroke pushes nothing) */
const PADDLE = Object.freeze({ GAIN:1, TOP:5.4, SUSTAIN:3, FLOOD:2.5 });

/* the room's judgement of a stroke (sim.js judgeBeat), on a race clock of ms since the gun */
export function mockJudge(r, msg, raceMs) {
  const kNow = Math.round(raceMs / BEAT_MS);
  let k = Number.isInteger(msg?.k) ? msg.k : null, d = Number.isFinite(msg?.d) ? Math.round(msg.d) : null;
  if (k === null || d === null) { k = kNow; d = Math.round(raceMs - kNow * BEAT_MS); }
  if (Math.abs(k - kNow) > BEAT.STALE || Math.abs(d) > BEAT_MS / 2)
    return { k:kNow, d, q:k * BEAT_MS + d < raceMs ? "late" : "early", onBeat:false };
  return { k, d, ...judge(k, d, { lastBeat:r.lastBeat }) };
}
/* beats up to `upTo` not yet looked at: one with no stroke after one with a stroke drops a level (sim.js settleMisses) */
export function mockMisses(r, upTo) {
  while (r.missK < upTo) {
    r.missK += 1;
    const k = r.missK;
    if (k < 1 || r.beats.includes(k) || !r.beats.includes(k - 1)) continue;
    r.level = Math.max(0, r.level - 1);
    r.streak = levelFloor(r.level);
  }
  if (r.beats.length > 6) r.beats = r.beats.slice(-6);
}
const T = MOCK_TIMING;
const LEGS = [["putin", "Put-in"], ["narrows", "The Narrows"], ["bend", "Whirlpool Bend"], ["drop", "The Drop"]]
  .map(([id, name], i) => ({ id, name, s0:i * MOCK_LEG_M, s1:(i + 1) * MOCK_LEG_M, grid:i * MOCK_LEG_M, finish:(i + 1) * MOCK_LEG_M }));
const COURSE = Object.freeze({ id:"mock", legs:LEGS });
const BOT_NAMES = ["Mara", "Theo", "Jun", "Rosa", "Dev", "Ines", "Kofi", "Lena", "Omar", "Pia", "Sol", "Wes"];
const BOT_COLORS = ["#ff9b2f", "#ffd23f", "#9be15d", "#2fd3a0", "#25c6e8", "#4a86ff", "#8a63ff", "#d35bff", "#ff5fa8", "#f2ead8",
  "#7ad3ff", "#ffb38a"];
const ME = 0;

/* the field for every round, as the engine's cup.js cutSchedule: 13 -> 13, 9, 6, 3 */
export function mockFields(n, legs = 4) {
  const riders = Math.max(0, n | 0);
  if (riders <= 3) return new Array(legs).fill(riders);
  const cuts = legs - 1, total = riders - 3;
  const schedule = [riders];
  for (let k = 0; k < cuts; k += 1) schedule.push(schedule[k] - (Math.floor(total / cuts) + (k < total % cuts ? 1 : 0)));
  return schedule;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}
const r3 = v => Math.round(v * 1000) / 1000;

export function createMockRoom({ hello = null, scene = null, timers = globalThis, now = () => Date.now(), lag = 60,
  expose = false, bots = 12 } = {}) {
  const later = (fn, ms) => timers.setTimeout(fn, ms);
  const listeners = new Map(), statusFns = new Set(), sent = [];
  const device = "mock-phone";
  const rand = seeded(20261030);
  let status = "connecting", closed = false, phaseTimer = null, raceTimer = null, botTimer = null, sceneName = null;
  let courseSent = false, cup = null, sim = null, feedback = null, cups = 0;

  const setStatus = next => {
    if (next === status) return;
    status = next;
    for (const fn of [...statusFns]) { try { fn(next); } catch {} }
  };
  const emit = msg => {
    for (const key of [msg.t, "*"]) for (const fn of [...(listeners.get(key) || [])]) { try { fn(msg); } catch {} }
  };
  /* to the phone, stamped now, landing `lag` later */
  const deliver = msg => {
    if (closed) return;
    const frame = { ...msg, s:msg.s ?? now() };
    later(() => { if (!closed && status === "open") emit(frame); }, lag);
  };
  const rider = () => {
    let extra = null;
    try { extra = typeof hello === "function" ? hello() : hello; } catch {}
    return extra?.rider || {};
  };

  function freshCup({ mode = "party" } = {}) {
    const me = rider();
    cups += 1;
    const entrants = [{ device, name:me.name || "You", color:me.color || "#ff5a4f", look:me.look || { critter:"capybara",
      floatie:"donut", hat:"none", shades:"none", pose:"flex" }, bot:false, connected:true, ready:false, drinks:me.drinks !== false,
      ...(me.pid ? { pid:me.pid } : {}), ...(me.photo ? { photo:me.photo } : {}), ...(me.number != null ? { number:me.number } : {}),
      ...(me.groom ? { groom:true } : {}) }];
    for (let k = 0; k < bots; k++) {
      entrants.push({ device:`bot-${k}`, name:BOT_NAMES[k % BOT_NAMES.length], color:BOT_COLORS[k % BOT_COLORS.length],
        look:{ critter:CRITTER_IDS[(k * 5 + 3) % CRITTER_IDS.length], floatie:FLOATIE_IDS[(k * 3 + 1) % FLOATIE_IDS.length],
          hat:"none", shades:"none", pose:POSE_IDS[k % POSE_IDS.length] }, bot:true, connected:true, ready:k % 3 !== 0, drinks:true });
    }
    return { id:`c-mock${cups}`, phase:"lobby", mode, code:"brkt", drinking:true, round:0, rounds:4, schedule:mockFields(entrants.length),
      field:[], out:[], startAt:null, endsAt:null, swapUntil:null, resume:false, entrants, results:[], history:[], standings:[],
      podium:null, final:null, beach:{}, done:false };
  }

  const isLast = () => cup.round >= cup.rounds - 1;
  const cutOf = () => isLast() ? null : cup.schedule[cup.round + 1];
  const standingsOf = () => (cup.final || [...cup.field, ...[...cup.out].reverse()]).map((i, k) => {
    const gone = cup.history.find(item => item.out.includes(i));
    return { i, place:k + 1, out:gone ? gone.round : null };
  });
  const roomFrame = () => {
    const live = cup.phase === "race" && sim;
    const frame = { t:"room", phase:cup.phase, mode:cup.mode, code:cup.code, cupId:cup.id, drinking:cup.drinking, round:cup.round,
      rounds:cup.rounds, leg:Math.min(3, cup.round), field:[...cup.field], out:[...cup.out], startAt:cup.startAt, endsAt:cup.endsAt,
      swapUntil:cup.swapUntil, resume:cup.resume, cut:cutOf(), len:MOCK_LEG_M,
      entrants:cup.entrants.map(e => ({ ...e, botDriven:!!e.bot })),
      results:live ? liveResults() : cup.results.map(r => ({ ...r })), standings:cup.standings,
      podium:cup.podium ? [...cup.podium] : null, final:cup.final ? [...cup.final] : null,
      history:cup.history.map(({ round, leg, field, results, out }) => ({ round, leg, field, results, out })) };
    if (!courseSent) { frame.course = COURSE; courseSent = true; } else frame.courseId = COURSE.id;
    return frame;
  };
  const sendRoom = () => deliver(roomFrame());
  const event = (e, i, extra = {}) => deliver({ t:"ev", e, i, ...extra });

  /* ── the race ── */
  const raceT = () => sim ? Math.max(0, (now() - cup.startAt) / 1000) : 0;
  function startSim() {
    sim = { racers:new Map(cup.field.map((i, slot) => [i, { i, prog:-slot * 1.2, v:0, f:0, arriveAt:null, drinkAt:null,
      streak:0, level:0, q:null, lastBeat:null, beats:[], missK:-1, heat:0,
      swimUntil:0, hands:2, strokes:[], last:{ L:-1e9, R:-1e9 }, splashAt:-1e9, hitAt:-1e9,
      pace:2.7 + rand() * 0.95, drinkAtProg:rand() < 0.55 ? MOCK_LEG_M * (0.25 + rand() * 0.5) : null,
      drinkDelay:1.5 + rand() * 4.5 }])), firstFinish:null, at:now() };
  }
  const finishAt = r => r.arriveAt !== null && r.drinkAt !== null ? Math.max(r.arriveAt, r.drinkAt) : null;
  function placeRiders() {
    const rs = [...sim.racers.values()];
    const done = rs.filter(r => finishAt(r) !== null).sort((a, b) => finishAt(a) - finishAt(b) || a.i - b.i);
    const waiting = rs.filter(r => r.arriveAt !== null && finishAt(r) === null).sort((a, b) => a.arriveAt - b.arriveAt);
    const racing = rs.filter(r => r.arriveAt === null).sort((a, b) => b.prog - a.prog || a.i - b.i);
    return [...done, ...waiting, ...racing];
  }
  const liveResults = () => placeRiders().map((r, k) => ({ i:r.i, place:k + 1, time:finishAt(r), drinkAt:r.drinkAt }));
  const owesDrink = i => cup.drinking && cup.entrants[i]?.drinks !== false;
  function drinkNow(r) {
    if (r.drinkAt !== null) return false;
    r.drinkAt = r3(raceT());
    event("drink", r.i);
    if (sim.firstFinish === null && finishAt(r) !== null) sim.firstFinish = finishAt(r);
    return true;
  }
  function stepSim() {
    if (!sim || cup.phase !== "race") return;
    const t = now(), dt = Math.min(0.25, Math.max(0, (t - sim.at) / 1000)), rt = raceT();
    sim.at = t;
    let changed = false;
    for (const r of sim.racers.values()) {
      r.f &= FLAG.ARRIVED | FLAG.DRANK;
      if (t - r.last.L < 250) r.f |= FLAG.STROKE_L;
      if (t - r.last.R < 250) r.f |= FLAG.STROKE_R;
      if (t - r.splashAt < 600) r.f |= FLAG.SPLASHED;
      if (t - (r.bumpAt ?? -1e9) < 250) r.f |= FLAG.BUMP;
      if (r.hands < 2) r.f |= FLAG.HANDS_OFF;
      if (r.drinkAt !== null) r.f |= FLAG.DRANK;
      if (r.arriveAt !== null) {
        if (r.drinkAt === null && r.i !== ME && rt >= r.arriveAt + r.drinkDelay) { drinkNow(r); changed = true; }
        continue;
      }
      const swimming = t < r.swimUntil;
      if (swimming) r.f |= FLAG.SWIM;
      if (r.i === ME) {
        r.v *= Math.exp(-0.5 * dt);
        r.heat = Math.max(0, r.heat - PADDLE.SUSTAIN * dt);
        mockMisses(r, Math.floor((t - cup.startAt - BEAT.MISS_GRACE_MS) / BEAT_MS));
        r.prog += ((swimming ? 0.8 : r.v) + 0.6) * dt;
      } else {
        r.prog += Math.max(0, r.pace + Math.sin(t / 900 + r.i) * 0.35 + (swimming ? -1.5 : 0)) * dt;
        if (r.drinkAtProg !== null && r.drinkAt === null && r.prog >= r.drinkAtProg) { drinkNow(r); changed = true; }
      }
      if (r.prog >= MOCK_LEG_M) {
        r.prog = MOCK_LEG_M;
        r.arriveAt = r3(rt);
        r.f |= FLAG.ARRIVED;
        event("arrive", r.i);
        if (!owesDrink(r.i) && r.drinkAt === null) drinkNow(r);
        if (sim.firstFinish === null && finishAt(r) !== null) sim.firstFinish = finishAt(r);
        changed = true;
      }
    }
    const order = placeRiders();
    const mine = cup.entrants[ME]?.device === device ? sim.racers.get(ME) : null;
    if (mine) deliver({ t:"me", i:ME, place:order.indexOf(mine) + 1, of:order.length, prog:Math.round(Math.max(0, mine.prog) * 10) / 10,
      len:MOCK_LEG_M, stam:1, f:mine.f, cut:cutOf(), streak:mine.streak, level:mine.level, q:mine.q });
    if (sim.firstFinish !== null) {
      const ends = Math.min(cup.startAt + T.HARD_CAP_MS, Math.round(cup.startAt + sim.firstFinish * 1000 + T.CAP_MS));
      if (ends !== cup.endsAt) { cup.endsAt = ends; changed = true; }
    }
    if (!sceneName) {
      const target = cutOf() ?? order.length;
      const placed = order.filter(r => finishAt(r) !== null).length;
      if (placed >= order.length || placed >= target || (sim.firstFinish !== null && rt >= sim.firstFinish + T.CAP_MS / 1000)
        || rt >= T.HARD_CAP_MS / 1000) { endRound(); return; }
    }
    if (changed) sendRoom();
  }
  function endRound() {
    timers.clearInterval(raceTimer);
    raceTimer = null;
    finishRound(placeRiders().map(r => ({ i:r.i, time:finishAt(r), drinkAt:r.drinkAt, arriveAt:r.arriveAt,
      prog:Math.round(Math.max(0, Math.min(MOCK_LEG_M, r.prog)) * 10) / 10 })));
    for (const i of cup.history[cup.history.length - 1].out.slice().reverse()) event("out", i);
    sim = null;
    phase("cut", cup.done ? T.CUT_LAST_MS : T.CUT_MS, () => {
      cup.swapUntil = null;
      if (cup.done) { phase("podium", T.PODIUM_MS, () => phase("feedback", T.FEEDBACK_MS, toLobby)); return; }
      cup.round += 1;
      cup.results = [];
      phase("grid", T.GRID_MS, countdown);
    });
  }
  /* the round is over: places, the cut (cup.js finishRound) */
  function finishRound(order) {
    const results = order.map((r, k) => ({ ...r, place:k + 1 }));
    const last = isLast();
    const through = last ? order.length : Math.min(order.length, cutOf());
    const survivors = order.slice(0, through).map(r => r.i), eliminated = order.slice(through).map(r => r.i);
    cup.out.push(...eliminated.slice().reverse());
    for (const r of order.slice(through)) cup.beach[r.i] = { drank:r.drinkAt !== null || !owesDrink(r.i), next:now() };
    cup.history.push({ round:cup.round, leg:Math.min(3, cup.round), field:[...cup.field], results, out:eliminated });
    cup.results = results;
    cup.field = survivors;
    if (last) { cup.final = [...survivors, ...[...cup.out].reverse()]; cup.podium = survivors.slice(0, 3); cup.done = true; }
    cup.standings = standingsOf();
  }
  function countdown() {
    cup.phase = "countdown";
    cup.startAt = now() + T.COUNTDOWN_MS;
    cup.endsAt = cup.startAt;
    sendRoom();
    clearTimer();
    if (!sceneName) phaseTimer = later(goRace, T.COUNTDOWN_MS);
  }
  function goRace() {
    cup.phase = "race";
    cup.endsAt = cup.startAt + T.HARD_CAP_MS;
    startSim();
    sendRoom();
    raceTimer = timers.setInterval(stepSim, 100);
  }
  const clearTimer = () => { if (phaseTimer) timers.clearTimeout(phaseTimer); phaseTimer = null; };
  function phase(name, ms, next) {
    clearTimer();
    cup.phase = name;
    cup.startAt = now();
    cup.endsAt = ms ? now() + ms : null;
    if (name === "cut") cup.swapUntil = cup.done ? null : now() + T.SWAP_MS;
    sendRoom();
    if (next && ms && !sceneName) phaseTimer = later(next, ms);
  }
  function startCup() {
    cup.round = 0; cup.out = []; cup.results = []; cup.history = []; cup.podium = null; cup.final = null; cup.done = false;
    cup.beach = {}; cup.schedule = mockFields(cup.entrants.length);
    cup.field = cup.entrants.map((e, i) => i);
    cup.standings = standingsOf();
    phase("intro", T.INTRO_MS, () => phase("grid", T.GRID_MS, countdown));
  }
  function toLobby() {
    clearTimer();
    if (raceTimer) timers.clearInterval(raceTimer);
    raceTimer = null;
    sim = null;
    const keep = cup.entrants;
    cup = freshCup({ mode:cup.mode });
    cup.entrants = keep.map(e => ({ ...e, ready:false }));
    sendRoom();
  }
  /* out bots throw now and then, so the beach and the TV see balloons */
  function botBalloons() {
    if (!sim || cup.phase !== "race" || sceneName) return;
    for (const i of cup.out) {
      if (i === ME || rand() > 0.08) continue;
      const targets = [...sim.racers.values()].filter(r => r.arriveAt === null);
      const target = targets[Math.floor(rand() * targets.length)];
      if (target) throwBalloon(i, target.i);
    }
  }
  function throwBalloon(from, at) {
    event("balloon", from, { j:at });
    later(() => {
      const target = sim?.racers.get(at);
      const t = now();
      if (!target || target.arriveAt !== null || t - target.hitAt < T.IMMUNE_MS) { event("splash", from); return; }
      target.hitAt = target.splashAt = t;
      event("splash", from, { j:at });
    }, T.FLIGHT_MS);
  }

  /* ── what the phone sends ── */
  function receive(msg) {
    sent.push(msg);
    const r = sim?.racers.get(ME);
    const t = now();
    switch (msg.t) {
      case "hello":
        if (!cup) { cup = freshCup(); if (scene) go(scene, { quiet:true }); }
        deliver({ t:"welcome", you:{ device, role:"controller", ...(cup.entrants.some(e => e.device === device) ? { entrant:ME } : {}) } });
        courseSent = false;
        sendRoom();
        return;
      case "ping": deliver({ t:"pong", c:msg.c }); return;
      case "ready":
        if (cup.phase !== "lobby" || cup.mode !== "party") return;
        cup.entrants[ME].ready = msg.on === true;
        sendRoom();
        if (msg.on && !sceneName) {
          later(() => { cup.entrants.forEach(e => { if (e.bot) e.ready = true; }); sendRoom(); }, 700);
          clearTimer();
          phaseTimer = later(() => { if (cup.phase === "lobby" && cup.entrants[ME].ready) startCup(); }, 1800);
        }
        return;
      case "look": {
        const look = msg.look || {};
        if (cup.phase === "lobby") cup.entrants[ME].look = { ...cup.entrants[ME].look, ...look };
        else if (cup.phase === "cut" && cup.swapUntil !== null && t <= cup.swapUntil && cup.field.includes(ME) && look.floatie
          && look.floatie !== cup.entrants[ME].look.floatie) cup.entrants[ME].look = { ...cup.entrants[ME].look, floatie:look.floatie };
        else return;
        sendRoom();
        return;
      }
      case "stroke": {
        if (!r || cup.phase !== "race" || r.arriveAt !== null || t < r.swimUntil) return;
        const side = msg.side === "R" ? "R" : msg.side === "L" ? "L" : null;
        const p = Math.max(0, Math.min(1, Number(msg.p) || 0));
        if (!side || !(p > 0.02)) return;
        /* the beat: judged as the room judges it; on it builds the streak, off it breaks it */
        const verdict = mockJudge(r, msg, t - cup.startAt);
        mockMisses(r, verdict.k - 1);
        r.q = verdict.q;
        r.lastBeat = r.lastBeat === null ? verdict.k : Math.max(r.lastBeat, verdict.k);
        if (!r.beats.includes(verdict.k)) r.beats = [...r.beats.filter(k => k >= verdict.k - 4), verdict.k];
        if (verdict.onBeat) {
          r.streak += 1;
          const level = levelOf(r.streak);
          if (level > r.level) event("groove", ME, { level });
          r.level = level;
        } else { r.streak = 0; r.level = 0; }
        const flooded = r.heat + 1 > PADDLE.FLOOD;
        r.heat = Math.min(PADDLE.FLOOD + 1, r.heat + 1);
        /* one side twice running pushes less straight ahead (it turns you) */
        const lastSide = r.strokes[r.strokes.length - 1];
        const eff = lastSide && lastSide.side === side && t - lastSide.at < 900 ? 0.5 : 1;
        r.strokes.push({ side, at:t });
        if (r.strokes.length > 8) r.strokes.shift();
        r.last[side] = t;
        const gain = LEVEL_GAIN[r.level] || 1;
        if (!flooded) r.v = Math.min(PADDLE.TOP * gain, r.v + p * (QUALITY_GAIN[verdict.q] ?? 0.4) * gain * eff * PADDLE.GAIN);
        /* one side, six times running, spins you over */
        const recent = r.strokes.filter(s => t - s.at < 1600);
        if (recent.length >= 6 && recent.every(s => s.side === side)) {
          r.swimUntil = t + T.SWIM_MS; r.v = 0; r.strokes = [];
          event("flip", ME);
        }
        return;
      }
      case "hands": if (r) r.hands = Math.max(0, Math.min(2, Math.round(Number(msg.n)) || 0)); return;
      case "drink": {
        const spot = cup.beach[ME];
        if (spot && !cup.field.includes(ME)) {
          if (!spot.drank) { spot.drank = true; spot.next = t; event("drink", ME); sendRoom(); }
          return;
        }
        if (!r || cup.phase !== "race") return;
        if (drinkNow(r)) sendRoom();
        return;
      }
      case "balloon": {
        const at = Number(msg.at), spot = cup.beach[ME];
        const target = sim?.racers.get(at);
        if (!Number.isInteger(at) || cup.phase !== "race" || !spot || !spot.drank || t < spot.next || !target || target.arriveAt !== null) return;
        spot.next = t + T.BALLOON_MS;
        throwBalloon(ME, at);
        return;
      }
      case "feedback":
        if (!cup.done && cup.phase !== "feedback") return;
        feedback = msg.answers || null;
        if (!sceneName && cup.phase === "feedback") later(toLobby, 1500);
        return;
      default:
    }
  }

  /* ── scenes: one moment, held ── */
  function go(name, { quiet = false } = {}) {
    if (!MOCK_SCENES.includes(name)) return false;
    sceneName = name;
    clearTimer();
    if (raceTimer) timers.clearInterval(raceTimer);
    raceTimer = null;
    sim = null;
    cup = freshCup({ mode:name === "lobby-fieldday" ? "fieldday" : "party" });
    const all = cup.entrants.map((e, i) => i);
    /* rounds raced so far: round k finishes with leaders[k] first, then the
       rest of that round's field in grid order; cup.round ends on the last */
    const raced = leaders => {
      cup.field = [...all];
      cup.standings = standingsOf();
      leaders.forEach((first, k) => {
        cup.round = k;
        const order = [...first.filter(i => cup.field.includes(i)), ...cup.field.filter(i => !first.includes(i))];
        finishRound(order.map((i, n) => ({ i, time:r3(52 + n * 1.7), drinkAt:r3(20 + n * 0.9), arriveAt:r3(50 + n * 1.7), prog:MOCK_LEG_M })));
      });
    };
    const race = (round, mine = {}) => {
      cup.round = round;
      cup.phase = "race"; cup.startAt = now() - 40000; cup.endsAt = cup.startAt + T.HARD_CAP_MS;
      startSim();
      cup.field.forEach((i, k) => Object.assign(sim.racers.get(i), { prog:MOCK_LEG_M * (0.66 - k * 0.04), pace:0 }));
      const r = sim.racers.get(ME);
      if (r) Object.assign(r, { prog:MOCK_LEG_M * 0.56, pace:0 }, mine);
      raceTimer = timers.setInterval(stepSim, 100);
    };
    const between = (phaseName, ms) => { cup.phase = phaseName; cup.startAt = now() - 2000; cup.endsAt = cup.startAt + ms; };
    const out11 = [3, 2, 5, 1, 7, 8, 6, 4, 9, 10, ME];
    switch (name) {
      case "lobby": break;
      case "lobby-ready": cup.entrants[ME].ready = true; break;
      case "lobby-fieldday": cup.entrants[ME].pid = "mock"; break;
      case "intro": cup.field = [...all]; cup.standings = standingsOf(); between("intro", T.INTRO_MS); break;
      case "grid": raced([[2, 5, 1, ME, 7, 3, 8, 6, 4]]); cup.round = 1; cup.results = []; between("grid", T.GRID_MS); break;
      case "countdown": raced([[2, 5, 1, ME]]); cup.round = 1; cup.results = [];
        cup.phase = "countdown"; cup.startAt = cup.endsAt = now() + 2600; break;
      case "race": cup.field = [...all]; race(0); break;
      case "race-locked": cup.field = [...all]; race(0, { prog:MOCK_LEG_M * 0.62, streak:18, level:3, q:"perfect" }); break;
      case "race-drank": cup.field = [...all]; race(0, { drinkAt:12.5, f:FLAG.DRANK }); break;
      case "race-flipped": cup.field = [...all]; race(0, { prog:MOCK_LEG_M * 0.5, swimUntil:now() + 3600000 }); break;
      case "race-arrived": cup.field = [...all]; race(0, { prog:MOCK_LEG_M, arriveAt:38, f:FLAG.ARRIVED });
        for (const [k, i] of [2, 5, 1, 7, 3, 8, 6, 4].entries()) Object.assign(sim.racers.get(i), { prog:MOCK_LEG_M, arriveAt:30 + k,
          drinkAt:31 + k, f:FLAG.ARRIVED | FLAG.DRANK });
        /* the first finisher started the cap: the round closes 30 s after it */
        sim.firstFinish = 31;
        break;
      case "race-done": cup.field = [...all]; race(0, { prog:MOCK_LEG_M, arriveAt:36, drinkAt:37, f:FLAG.ARRIVED | FLAG.DRANK });
        for (const i of [2, 5]) Object.assign(sim.racers.get(i), { prog:MOCK_LEG_M, arriveAt:30 + i * 0.1, drinkAt:31 + i * 0.1,
          f:FLAG.ARRIVED | FLAG.DRANK });
        break;
      case "race-final": raced([[ME, 3, 5], [ME, 3, 5], [3, ME, 5]]); cup.results = []; race(3); break;
      case "cut": raced([[3, 2, 5, ME]]); between("cut", T.CUT_MS); cup.swapUntil = cup.startAt + T.SWAP_MS; break;
      case "cut-final": raced([[ME, 3, 5], [ME, 3, 5], [ME, 3, 5]]); between("cut", T.CUT_MS); cup.swapUntil = cup.startAt + T.SWAP_MS; break;
      case "cut-last": raced([[ME, 3, 5], [ME, 3, 5], [3, ME, 5], [3, ME, 5]]); between("cut", T.CUT_LAST_MS); cup.swapUntil = null; break;
      case "outcut": raced([out11]);
        cup.history[0].results = cup.results = cup.results.map(r => r.i === ME ? { ...r, drinkAt:null, time:null } : r);
        cup.beach[ME] = { drank:false, next:now() };
        between("cut", T.CUT_MS); cup.swapUntil = cup.startAt + T.SWAP_MS; break;
      case "beach-drink": case "beach": raced([out11]);
        cup.history[0].results = cup.history[0].results.map(r => r.i === ME ? { ...r, drinkAt:null, time:null } : r);
        cup.beach[ME] = { drank:name === "beach", next:now() };
        cup.results = [];
        race(1);
        Object.assign(sim.racers.get(cup.field[0]), { prog:MOCK_LEG_M, arriveAt:39, drinkAt:39.5, f:FLAG.ARRIVED | FLAG.DRANK });
        /* the room's state says nothing of a beach drink: the phone knows it from its own drink event */
        if (name === "beach") later(() => { event("drink", ME); event("splash", 4, { j:cup.field[2] }); }, 200);
        break;
      case "beach-between": raced([out11, [3, 2, 5, 1, 7, 8]]); cup.beach[ME] = { drank:true, next:now() };
        between("cut", T.CUT_MS); cup.swapUntil = cup.startAt + T.SWAP_MS; break;
      case "podium": case "podium-win": case "podium-out": {
        const top = name === "podium-win" ? [ME, 3, 5] : name === "podium" ? [3, ME, 5] : [3, 5, 2];
        const lead = name === "podium-out" ? [3, 5, 2, 1, 7, 8, ME, 6, 4, 9] : [...top, 2, 1, 7, 8, 6, 4];
        raced([lead, lead, lead, top]);
        between("podium", T.PODIUM_MS); break;
      }
      case "feedback": raced([[3, ME, 5], [3, ME, 5], [3, ME, 5], [3, ME, 5]]); between("feedback", T.FEEDBACK_MS); break;
      case "watch": cup.entrants[ME].device = "someone-else"; raced([[3, 2, 5, 1]]); cup.round = 1; cup.results = []; race(1); break;
      default:
    }
    if (cup.phase !== "race") cup.standings = standingsOf();
    if (status === "open" && !quiet) {
      const member = cup.entrants.some(e => e.device === device);
      deliver({ t:"welcome", you:{ device, role:"controller", ...(member ? { entrant:ME } : {}) } });
      sendRoom();
    }
    return true;
  }

  /* open shortly after creation, like a socket */
  later(() => { if (!closed) setStatus("open"); }, 80);
  botTimer = timers.setInterval?.(botBalloons, 1000) ?? null;

  const net = {
    device,
    room:"mock",
    send(msg) {
      if (closed || status !== "open" || !msg || typeof msg !== "object") return false;
      later(() => { if (!closed) receive(JSON.parse(JSON.stringify(msg))); }, lag);
      return true;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimer();
      if (raceTimer) timers.clearInterval(raceTimer);
      if (botTimer) timers.clearInterval(botTimer);
      setStatus("closed");
    },
    serverNow:() => now(),
    rtt:() => lag * 2,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:{ sent, scenes:MOCK_SCENES, go:name => go(name), cup:() => cup, feedback:() => feedback, serial:++mockSerial,
      status:() => status, closed:() => closed,
      /* a balloon from the beach, or a bump, on this rider now */
      hit() { const r = sim?.racers.get(ME); if (!r) return; r.splashAt = r.hitAt = now(); event("splash", 4, { j:ME }); },
      bump() { const r = sim?.racers.get(ME); if (!r) return; r.bumpAt = now(); event("bump", ME, { j:cup.field[1] }); },
      /* let the held scene run on as a live Cup */
      run() { sceneName = null; if (cup.phase === "race" && !raceTimer) raceTimer = timers.setInterval(stepSim, 100); },
      /* drop the connection for a moment, as a sleeping phone would */
      blip(ms = 1500) { setStatus("connecting"); later(() => { if (!closed) setStatus("open"); }, ms); } },
  };
  /* the controller sends hello on open, as connectFloat does */
  statusFns.add(next => { if (next === "open") receive({ t:"hello", role:"controller", device, rider:rider() }); });
  net.mock.net = net;
  if (expose && typeof window !== "undefined") {
    window.__floatMock = net.mock;
    window.__floatMocks = [...(window.__floatMocks || []), net.mock];
  }
  return net;
}
let mockSerial = 0;
