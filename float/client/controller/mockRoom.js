/* A pretend room for the phone (float/PROTOCOL.md "Net"): the interface of
   connectFloat, answering one controller with welcome, room, me and ev
   frames through every phase of a Cup, about 60 ms each way.

   /float/play?mock=1             a whole Cup against twelve bots; your strokes
                                  move you, your drink places you
   /float/play?mock=1&at=<scene>  one scene held still, for a screenshot (the
                                  race scenes keep answering strokes)

   It speaks only what the contract promises (no `me` on the beach, no swap
   deadline), so the controller is built against what the room will send.
   None of this is the real game's rules: the engine owns those.
   `window.__floatMock` (with expose) carries what the controller sent and
   go(scene) for the headless check. */
import { CRITTER_IDS, POSE_IDS } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { FLAG } from "../../shared/protocol.js";

export const MOCK_SCENES = Object.freeze(["lobby", "lobby-ready", "intro", "grid", "countdown", "race", "race-out", "race-drank",
  "race-flipped", "race-arrived", "race-done", "race-final", "cut", "cut-final", "outcut", "beach-drink", "beach", "podium",
  "podium-win", "podium-out", "feedback"]);

export const MOCK_LEG_M = 160;
const LEGS = [["putin", "Put-in"], ["narrows", "The Narrows"], ["bend", "Whirlpool Bend"], ["drop", "The Drop"]]
  .map(([id, name], i) => ({ id, name, s0:i * MOCK_LEG_M, s1:(i + 1) * MOCK_LEG_M, grid:i * MOCK_LEG_M, finish:(i + 1) * MOCK_LEG_M }));
const COURSE = Object.freeze({ id:"mock", legs:LEGS });
const BOT_NAMES = ["Mara", "Theo", "Jun", "Rosa", "Dev", "Ines", "Kofi", "Lena", "Omar", "Pia", "Sol", "Wes"];
const BOT_COLORS = ["#ff9b2f", "#ffd23f", "#9be15d", "#2fd3a0", "#25c6e8", "#4a86ff", "#8a63ff", "#d35bff", "#ff5fa8", "#f2ead8",
  "#7ad3ff", "#ffb38a"];
const ME = 0;
const ROUND_CAP_MS = 30000;
const SWIM_MS = 3000;

/* the field for every round (the engine's cup.js owns the real schedule) */
export function mockFields(n) {
  if (n <= 3) return [n, n, n, n];
  return [n, Math.round(n - (n - 3) * 0.4), Math.round(n - (n - 3) * 0.7), 3];
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}

export function createMockRoom({ hello = null, scene = null, timers = globalThis, now = () => Date.now(), lag = 60,
  expose = false, bots = 12 } = {}) {
  const later = (fn, ms) => timers.setTimeout(fn, ms);
  const listeners = new Map(), statusFns = new Set(), sent = [];
  const device = "mock-phone";
  const rand = seeded(20261030);
  let status = "connecting", closed = false, phaseTimer = null, raceTimer = null, sceneName = null, entrantSent = false;
  let cup = null, sim = null, feedback = null;

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
    const frame = { ...msg, s:now() };
    later(() => { if (!closed && status === "open") emit(frame); }, lag);
  };

  const rider = () => {
    let extra = null;
    try { extra = typeof hello === "function" ? hello() : hello; } catch {}
    return extra?.rider || {};
  };

  function freshCup() {
    const me = rider();
    const entrants = [{ device, name:me.name || "You", color:me.color || "#ff5a4f", look:me.look || { critter:"capybara",
      floatie:"donut", hat:"none", shades:"none", pose:"flex" }, bot:false, connected:true, ready:false, drinks:me.drinks !== false,
      ...(me.photo ? { photo:me.photo } : {}), ...(me.number != null ? { number:me.number } : {}), ...(me.groom ? { groom:true } : {}) }];
    for (let k = 0; k < bots; k++) {
      entrants.push({ device:`bot-${k}`, name:BOT_NAMES[k % BOT_NAMES.length], color:BOT_COLORS[k % BOT_COLORS.length],
        look:{ critter:CRITTER_IDS[(k * 5 + 3) % CRITTER_IDS.length], floatie:FLOATIE_IDS[(k * 3 + 1) % FLOATIE_IDS.length],
          hat:"none", shades:"none", pose:POSE_IDS[k % POSE_IDS.length] }, bot:true, connected:true, ready:k % 3 !== 0, drinks:true });
    }
    const fields = mockFields(entrants.length);
    return { phase:"lobby", mode:"party", code:"brkt", drinking:true, round:0, rounds:4, leg:0, field:[], out:[], startAt:null,
      endsAt:null, entrants, results:[], standings:null, podium:[], fields };
  }

  const roomFrame = () => {
    const frame = { t:"room", phase:cup.phase, mode:cup.mode, code:cup.code, drinking:cup.drinking, round:cup.round,
      rounds:cup.rounds, leg:cup.leg, field:[...cup.field], out:[...cup.out], startAt:cup.startAt, endsAt:cup.endsAt,
      entrants:cup.entrants.map(e => ({ ...e })), results:cup.results.map(r => ({ ...r })), standings:cup.standings,
      podium:[...cup.podium] };
    if (!entrantSent) { frame.course = COURSE; entrantSent = true; }
    else frame.courseId = COURSE.id;
    return frame;
  };
  const sendRoom = () => deliver(roomFrame());
  const event = (e, i, extra = {}) => deliver({ t:"ev", e, i, ...extra });

  /* ── the race ── */
  function startSim() {
    const field = cup.field;
    sim = { at:now(), racers:new Map(field.map((i, slot) => [i, { i, prog:-slot * 1.2, v:0, stam:1, f:0, arriveAt:null,
      drinkAt:null, swimUntil:0, hands:2, strokes:[], last:{ L:-1e9, R:-1e9 }, bumpAt:-1e9, splashAt:-1e9,
      pace:2.7 + rand() * 0.95, drinkAtProg:rand() < 0.55 ? MOCK_LEG_M * (0.25 + rand() * 0.5) : null, drinkDelay:1500 + rand() * 4500 }])),
      firstFinish:null };
  }
  const finished = r => r.arriveAt !== null && (r.drinkAt !== null);
  const placedAt = r => Math.max(r.arriveAt, r.drinkAt);
  function standingsNow() {
    const rs = [...sim.racers.values()];
    const done = rs.filter(finished).sort((a, b) => placedAt(a) - placedAt(b));
    const rest = rs.filter(r => !finished(r)).sort((a, b) => b.prog - a.prog);
    return [...done, ...rest];
  }
  function stepSim() {
    const t = now(), dt = Math.min(0.25, Math.max(0, (t - sim.at) / 1000));
    sim.at = t;
    for (const r of sim.racers.values()) {
      r.f &= ~(FLAG.STROKE_L | FLAG.STROKE_R | FLAG.BUMP | FLAG.SPLASHED);
      if (t - r.last.L < 250) r.f |= FLAG.STROKE_L;
      if (t - r.last.R < 250) r.f |= FLAG.STROKE_R;
      if (t - r.bumpAt < 250) r.f |= FLAG.BUMP;
      if (t - r.splashAt < 600) r.f |= FLAG.SPLASHED;
      if (r.hands < 2) r.f |= FLAG.HANDS_OFF; else r.f &= ~FLAG.HANDS_OFF;
      if (r.arriveAt !== null) {
        if (r.drinkAt === null && r.i !== ME && t >= r.arriveAt + r.drinkDelay) { r.drinkAt = t; r.f |= FLAG.DRANK; event("drink", r.i); }
        continue;
      }
      const swimming = t < r.swimUntil;
      if (swimming) r.f |= FLAG.SWIM; else r.f &= ~FLAG.SWIM;
      if (r.i === ME) {
        r.v *= Math.exp(-0.5 * dt);
        r.stam = Math.min(1, r.stam + (t - Math.max(r.last.L, r.last.R) > 400 ? 0.09 : 0.03) * dt);
        r.prog += ((swimming ? 0.8 : r.v) + 0.6) * dt;
      } else {
        r.prog += (r.pace + Math.sin(t / 900 + r.i) * 0.35 + (swimming ? -1.5 : 0)) * dt;
        if (r.drinkAtProg !== null && r.drinkAt === null && r.prog >= r.drinkAtProg) { r.drinkAt = t; r.f |= FLAG.DRANK; event("drink", r.i); }
      }
      if (r.prog >= MOCK_LEG_M) {
        r.prog = MOCK_LEG_M;
        r.arriveAt = t;
        r.f |= FLAG.ARRIVED;
        event("arrive", r.i);
        if (!cup.drinking || cup.entrants[r.i]?.drinks === false) { r.drinkAt = t; r.f |= FLAG.DRANK; }
      }
      if (finished(r) && sim.firstFinish === null) sim.firstFinish = t;
    }
    const order = standingsNow();
    const of = order.length, cut = nextField();
    order.forEach((r, k) => { r.place = k + 1; });
    const mine = sim.racers.get(ME);
    if (mine) deliver({ t:"me", i:ME, place:mine.place, of, prog:Math.round(Math.max(0, mine.prog) * 10) / 10, len:MOCK_LEG_M,
      stam:Math.round(mine.stam * 100) / 100, f:mine.f, cut });
    cup.results = order.filter(finished).map(r => ({ i:r.i, place:r.place, time:Math.round(placedAt(r) - cup.startAt),
      drinkAt:r.drinkAt === null ? null : Math.round(r.drinkAt - cup.startAt) }));
    if (sceneName) return;
    const done = order.filter(finished).length;
    if (done >= cut || (sim.firstFinish !== null && t - sim.firstFinish > ROUND_CAP_MS)) endRound(order, cut);
  }
  const nextField = () => {
    const fields = cup.fields;
    return cup.round + 1 < fields.length ? fields[cup.round + 1] : fields[fields.length - 1];
  };
  function endRound(order, cut) {
    timers.clearInterval(raceTimer);
    raceTimer = null;
    const final = cup.round >= cup.rounds - 1;
    const through = final ? order : order.slice(0, cut);
    const gone = final ? [] : order.slice(cut);
    cup.results = order.map((r, k) => ({ i:r.i, place:k + 1, time:finished(r) ? Math.round(placedAt(r) - cup.startAt) : null,
      drinkAt:r.drinkAt === null ? null : Math.round(r.drinkAt - cup.startAt) }));
    for (const r of [...gone].reverse()) { cup.out.push(r.i); event("out", r.i); }
    cup.field = through.map(r => r.i);
    if (final) {
      cup.podium = order.slice(0, 3).map(r => r.i);
      cup.standings = [...cup.podium, ...[...cup.out].reverse()];
      phase("podium", 9000, () => phase("feedback", 0));
      return;
    }
    phase("cut", 20000, () => { cup.round++; cup.leg = cup.round; phase("grid", 3500, countdown); });
  }
  function countdown() {
    cup.startAt = now() + 3000;
    cup.endsAt = null;
    phase("countdown", 3000, () => {
      cup.endsAt = null;
      phase("race", 0);
      startSim();
      raceTimer = timers.setInterval(stepSim, 100);
    });
  }
  function phase(name, ms, next) {
    if (phaseTimer) timers.clearTimeout(phaseTimer);
    phaseTimer = null;
    cup.phase = name;
    if (name === "cut") { cup.startAt = now(); cup.endsAt = now() + ms; }
    else if (name !== "countdown" && name !== "race") { cup.startAt = null; cup.endsAt = ms ? now() + ms : null; }
    sendRoom();
    if (next && ms && !sceneName) phaseTimer = later(next, ms);
  }
  function startCup() {
    cup.round = 0; cup.leg = 0; cup.out = []; cup.results = []; cup.podium = []; cup.standings = null;
    cup.field = cup.entrants.map((e, i) => i);
    phase("intro", 4000, () => phase("grid", 3500, countdown));
  }

  /* ── what the phone sends ── */
  function receive(msg) {
    sent.push(msg);
    const r = sim?.racers.get(ME);
    const t = now();
    switch (msg.t) {
      case "hello":
        deliver({ t:"welcome", you:{ device, role:"controller", entrant:ME } });
        if (!cup) { cup = freshCup(); if (scene) go(scene, { quiet:true }); }
        entrantSent = false;
        sendRoom();
        if (raceTimer === null && cup.phase === "race" && sim) raceTimer = timers.setInterval(stepSim, 100);
        return;
      case "ping": deliver({ t:"pong", c:msg.c }); return;
      case "ready":
        if (cup.phase !== "lobby") return;
        cup.entrants[ME].ready = !!msg.on;
        sendRoom();
        if (msg.on && !sceneName) {
          later(() => { cup.entrants.forEach(e => { if (e.bot) e.ready = true; }); sendRoom(); }, 700);
          if (phaseTimer) timers.clearTimeout(phaseTimer);
          phaseTimer = later(() => { if (cup.phase === "lobby" && cup.entrants[ME].ready) startCup(); }, 1800);
        }
        return;
      case "look":
        if (cup.phase === "lobby") cup.entrants[ME].look = { ...cup.entrants[ME].look, ...(msg.look || {}) };
        else if (cup.phase === "cut" && msg.look?.floatie) cup.entrants[ME].look = { ...cup.entrants[ME].look, floatie:msg.look.floatie };
        else return;
        sendRoom();
        return;
      case "stroke": {
        if (!r || cup.phase !== "race" || r.arriveAt !== null) return;
        const side = msg.side === "R" ? "R" : "L";
        const p = Math.max(0, Math.min(1, Number(msg.p) || 0));
        const lastSide = r.strokes[r.strokes.length - 1];
        const eff = lastSide && lastSide.side === side && t - lastSide.at < 900 ? 0.5 : 1;
        r.strokes.push({ side, at:t });
        if (r.strokes.length > 8) r.strokes.shift();
        r.last[side] = t;
        if (t >= r.swimUntil) r.v = Math.min(5.4, r.v + p * 0.55 * eff * (0.35 + 0.65 * r.stam));
        r.stam = Math.max(0, r.stam - 0.028 * p);
        /* one side, hard and fast, spins you over */
        const recent = r.strokes.filter(s => t - s.at < 1600);
        if (recent.length >= 6 && recent.every(s => s.side === side) && t >= r.swimUntil) {
          r.swimUntil = t + SWIM_MS; r.v = 0; r.strokes = [];
          event("flip", ME);
        }
        return;
      }
      case "hands": if (r) r.hands = Math.max(0, Math.min(2, Number(msg.n) | 0)); return;
      case "drink":
        if (cup.out.includes(ME)) { event("drink", ME); return; }
        if (!r || r.drinkAt !== null || !["race"].includes(cup.phase)) return;
        r.drinkAt = t; r.f |= FLAG.DRANK;
        event("drink", ME);
        return;
      case "balloon": {
        const at = Number(msg.at);
        if (!cup.out.includes(ME) || cup.phase !== "race" || !sim?.racers.has(at)) return;
        event("balloon", ME, { j:at });
        later(() => {
          const target = sim?.racers.get(at);
          if (target) target.splashAt = now();
          event("splash", ME, { j:at });
        }, 1200);
        return;
      }
      case "feedback":
        feedback = msg.answers || null;
        if (!sceneName && cup.phase === "feedback") later(() => { cup = freshCup(); entrantSent = true; sendRoom(); }, 2500);
        return;
      default:
    }
  }

  /* ── scenes: one moment, held ── */
  function go(name, { quiet = false } = {}) {
    if (!MOCK_SCENES.includes(name)) return false;
    sceneName = name;
    if (phaseTimer) timers.clearTimeout(phaseTimer);
    if (raceTimer) timers.clearInterval(raceTimer);
    phaseTimer = raceTimer = null;
    cup = freshCup();
    const all = cup.entrants.map((e, i) => i);
    const set = (round, out = []) => {
      cup.round = round; cup.leg = round;
      cup.out = out;
      const size = cup.fields[round];
      cup.field = all.filter(i => !out.includes(i)).slice(0, size);
    };
    const race = (round, mine = {}, out = []) => {
      set(round, out);
      cup.phase = "race"; cup.startAt = now() - 30000; cup.endsAt = null;
      startSim();
      const order = cup.field;
      for (const [k, i] of order.entries()) {
        const r = sim.racers.get(i);
        r.prog = MOCK_LEG_M * (0.62 - k * 0.035);
        r.pace = 0;
      }
      const r = sim.racers.get(ME);
      if (r) Object.assign(r, { prog:MOCK_LEG_M * 0.48, stam:0.72 }, mine);
      raceTimer = timers.setInterval(stepSim, 100);
    };
    const results = round => {
      const size = cup.fields[round];
      cup.results = all.slice(0, size).map((i, k) => ({ i:k === 3 ? ME : k === 0 ? 3 : i, place:k + 1, time:52000 + k * 1700,
        drinkAt:20000 + k * 900 }));
    };
    switch (name) {
      case "lobby": cup.phase = "lobby"; break;
      case "lobby-ready": cup.phase = "lobby"; cup.entrants[ME].ready = true; break;
      case "intro": set(0); cup.phase = "intro"; break;
      case "grid": set(1, [12, 11, 10, 9]); cup.field = [2, 5, 1, ME, 7, 3, 8, 6, 4]; cup.phase = "grid"; break;
      case "countdown": set(1, [12, 11, 10, 9]); cup.phase = "countdown"; cup.startAt = now() + 2600; break;
      case "race": race(0, { prog:MOCK_LEG_M * 0.55 }); break;
      case "race-out": race(0, { prog:MOCK_LEG_M * 0.2, stam:0.28 }); break;
      case "race-drank": race(0, { prog:MOCK_LEG_M * 0.58, drinkAt:now() - 9000, f:FLAG.DRANK }); break;
      case "race-flipped": race(0, { prog:MOCK_LEG_M * 0.5, swimUntil:now() + 3600000 }); break;
      case "race-arrived": race(0, { prog:MOCK_LEG_M, arriveAt:now() - 2000, f:FLAG.ARRIVED }); break;
      case "race-done": {
        race(0, { prog:MOCK_LEG_M, arriveAt:now() - 4000, drinkAt:now() - 3000, f:FLAG.ARRIVED | FLAG.DRANK });
        for (const i of [2, 5]) Object.assign(sim.racers.get(i), { prog:MOCK_LEG_M, arriveAt:now() - 9000, drinkAt:now() - 8000 - i * 100,
          f:FLAG.ARRIVED | FLAG.DRANK });
        break;
      }
      case "race-final": race(3, { prog:MOCK_LEG_M * 0.7 }, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]); break;
      case "cut": set(0); results(0); cup.field = cup.results.slice(0, 9).map(r => r.i); cup.out = [12, 11, 10, 9];
        cup.phase = "cut"; cup.startAt = now() - 2000; cup.endsAt = now() + 18000; break;
      case "cut-final": set(2, [12, 11, 10, 9]); results(2); cup.results = [ME, 3, 5, 2, 7, 1].map((i, k) => ({ i, place:k + 1,
        time:61000 + k * 1500, drinkAt:24000 + k * 800 })); cup.field = [ME, 3, 5]; cup.out = [12, 11, 10, 9, 1, 7, 2];
        cup.phase = "cut"; cup.startAt = now() - 1000; cup.endsAt = now() + 19000; break;
      case "outcut": set(0); cup.results = all.map((i, k) => ({ i:k === 10 ? ME : k === 0 ? 10 : i, place:k + 1, time:k < 9 ? 50000 + k * 1500 : null,
        drinkAt:k < 9 ? 21000 : null })); cup.out = [12, 11, ME, 9]; cup.field = cup.results.slice(0, 9).map(r => r.i);
        cup.phase = "cut"; cup.startAt = now() - 3000; cup.endsAt = now() + 17000; break;
      case "beach-drink": race(1, {}, [12, 11, ME, 9]); break;
      case "beach": race(1, {}, [12, 11, ME, 9]); later(() => event("drink", ME), 300); break;
      case "podium": case "podium-win": case "podium-out": {
        /* out in elimination order: the last one out is 4th */
        const [podium, out] = name === "podium-win" ? [[ME, 3, 5], [12, 11, 10, 9, 8, 7, 6, 4, 1, 2]]
          : name === "podium" ? [[3, ME, 5], [12, 11, 10, 9, 8, 7, 6, 4, 1, 2]] : [[3, 5, 2], [12, 11, 10, 9, 8, 7, ME, 6, 4, 1]];
        set(3, out);
        cup.podium = podium;
        cup.standings = [...podium, ...[...out].reverse()];
        cup.phase = "podium"; break;
      }
      case "feedback": set(3, [12, 11, 10, 9, 8, 7, 6, 4, 1, 2]); cup.podium = [3, ME, 5]; cup.phase = "feedback"; break;
      default:
    }
    if (status === "open" && !quiet) sendRoom();
    return true;
  }

  /* open shortly after creation, like a socket */
  later(() => { if (!closed) setStatus("open"); }, 80);

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
      if (phaseTimer) timers.clearTimeout(phaseTimer);
      if (raceTimer) timers.clearInterval(raceTimer);
      setStatus("closed");
    },
    serverNow:() => now(),
    rtt:() => lag * 2,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:{ sent, scenes:MOCK_SCENES, go:name => go(name), cup:() => cup, feedback:() => feedback,
      /* drop the connection for a moment, as a sleeping phone would */
      blip(ms = 1500) { setStatus("connecting"); later(() => { if (!closed) setStatus("open"); }, ms); } },
  };
  /* the controller sends hello on open, as connectFloat does */
  statusFns.add(next => { if (next === "open") receive({ t:"hello", role:"controller", device, rider:rider() }); });
  if (expose && typeof window !== "undefined") window.__floatMock = net.mock;
  return net;
}
