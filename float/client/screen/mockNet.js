/* The screen's stand-in connection (`?mock=1`): the REAL room
   (float/worker/room.js FloatRoom, the engine's Cup, river and bots) run in
   this tab on a clock the mock owns, over fake sockets, with the net API's
   exact shape (float/PROTOCOL.md "Net"): { send, on, close, serverNow, rtt,
   status, onStatus }. Nothing goes over the network, and what the screen
   draws is what a real room sends.

     ?mock=1               a lobby that fills with the roster's phones; Start runs the Cup
     &n=13                 how many phones join (0 to 16)
     &auto=1               start on its own once they are in
     &shot=<moment>        jump straight to a moment (MOCK_SHOTS), in accelerated time
     &freeze=1             and stop the clock there (screenshots)
     &seed=3               another room

   The phones become the engine's bots once the Cup starts (they never
   paddle), so every rider moves the way the engine's bots do.

   The groove (float/PROTOCOL.md "The beat"): until the engine sends the
   streak levels (FLAG.STREAK_1), the mock plays its bots' streaks itself,
   by the contract's rules (a stroke a beat, on the beat by skill; levels at
   4, 8 and 16; an off stroke resets, a missed beat drops a level), into the
   snapshot flags and `groove` events the screen gets. */
import { FloatRoom } from "../../worker/room.js";
import { COURSE } from "../../shared/course.js";
import { cleanLook, defaultLook, HAT_IDS, SHADE_IDS, POSE_IDS } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { FLAG } from "../../shared/protocol.js";
import { BEAT_MS, levelOf, levelFloor } from "../../shared/beat.js";
import { botSkills } from "../../shared/bots.js";

const TICK = 1000 / 30;

const NAMES = ["Brandon", "Evan", "Eyob", "Sahil", "Khoa", "Chinh", "Adi", "Chiang", "Richard", "Allan", "Henry", "Ben", "Jeremy",
  "Marco", "Dev", "Theo"];
const COLORS = ["#d97742", "#4f93a3", "#c9b25a", "#a6527c", "#6e9450", "#3b6e9c", "#e39a3b", "#7c5ca6", "#2f7e83",
  "#b23b5e", "#a8a03f", "#6d6fa8", "#c05b33", "#557b72", "#8a4f62", "#d1c0a0"];

export function mockRider(k) {
  const name = NAMES[k % NAMES.length];
  const groom = name === "Brandon";
  const hats = HAT_IDS.filter(id => id !== "crown");
  const look = cleanLook({
    ...defaultLook(name, FLOATIE_IDS),
    hat:groom ? "crown" : hats[(k * 5 + 1) % hats.length],
    shades:SHADE_IDS[(k * 3) % SHADE_IDS.length],
    pose:POSE_IDS[k % POSE_IDS.length],
  }, { groom, floatieIds:FLOATIE_IDS, seed:name });
  return { name, color:COLORS[k % COLORS.length], look, drinks:true, number:k + 1, ...(groom ? { groom:true } : {}) };
}

/* the engine sends the levels itself once it judges strokes */
const ENGINE_GROOVE = "STREAK_1" in FLAG;
const hash01 = (a, b, c) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/* the bots' streaks, played beat by beat from the snapshots the room sends */
function grooveShim(seed, skillOf) {
  const riders = new Map();
  const pending = [];
  let gun = null, round = null, phase = null, lastK = null;
  const shim = {
    lockedAt:null,
    room(msg) {
      phase = msg.phase;
      if (msg.phase === "countdown" || msg.phase === "race") {
        if (msg.round !== round) { round = msg.round; riders.clear(); lastK = null; pending.length = 0; }
        if (Number.isFinite(msg.startAt)) gun = msg.startAt;
      }
    },
    snap(msg) {
      if (phase !== "race" || !Number.isFinite(gun) || !Array.isArray(msg.k)) return;
      const kNow = Math.floor((msg.s - gun) / BEAT_MS);
      if (kNow < 0) return;
      for (let k = lastK === null ? 0 : lastK + 1; k <= kNow; k++) {
        for (const row of msg.k) {
          const i = row[0], f = row[4] | 0;
          let r = riders.get(i);
          if (!r) riders.set(i, r = { streak:0, level:0, stroked:false });
          if (f & FLAG.ARRIVED) continue;
          if ((f & FLAG.HANDS_OFF) || (f & FLAG.SWIM)) {
            /* a beat without a stroke costs a level, once */
            if (r.stroked) r.streak = Math.min(r.streak, levelFloor(Math.max(0, r.level - 1)));
            r.stroked = false;
          } else {
            const skill = Math.max(0, Math.min(1, skillOf(i) ?? 0.6));
            const off = hash01(seed, i * 7919 + round * 104729, k) < 0.14 - 0.12 * skill;
            r.streak = off ? 0 : r.streak + 1;
            r.stroked = true;
          }
          const level = levelOf(r.streak);
          if (level > r.level) {
            pending.push({ t:"ev", e:"groove", i, level, s:gun + k * BEAT_MS });
            if (level === 3) shim.lockedAt = gun + k * BEAT_MS;
          }
          r.level = level;
        }
      }
      lastK = kNow;
    },
    /* a snapshot for the screen: the levels in its flags */
    decorate(msg) {
      if (!Array.isArray(msg.k)) return msg;
      return { ...msg, k:msg.k.map(row => {
        const level = riders.get(row[0])?.level || 0;
        return level ? [row[0], row[1], row[2], row[3], (row[4] | 0) | (level << 8), row[5]] : row;
      }) };
    },
    /* the level-ups due by s (older ones, from before the screen opened, are dropped) */
    take(s, since = -Infinity) {
      const due = [];
      for (let k = pending.length - 1; k >= 0; k--) if (pending[k].s <= s) { const [e] = pending.splice(k, 1); if (e.s >= since) due.unshift(e); }
      return due;
    },
  };
  return shim;
}

class FakeSocket {
  constructor(onText) { this.onText = onText; this.readyState = 1; this.listeners = {}; }
  send(text) { if (this.readyState === 1 && this.onText) this.onText(text); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  accept() {}
  close() { this.readyState = 3; for (const fn of this.listeners.close || []) fn({}); }
}

const memoryCtx = () => {
  const entries = new Map();
  const storage = {
    async get(key) { return entries.has(key) ? structuredClone(entries.get(key)) : undefined; },
    async put(key, value) { entries.set(key, structuredClone(value)); },
    async delete(key) { entries.delete(key); },
    async setAlarm() {},
    async deleteAlarm() {},
  };
  return { storage, blockConcurrencyWhile:fn => fn() };
};

/* the moments a shot can open on: when the observer has seen it, and how long after */
const SHOTS = {
  lobby:{ lobby:true },
  /* a Field Day Cup reserved by the Tournament, waiting for its start */
  fdlobby:{ lobby:true, fieldday:true },
  intro:{ when:o => o.phase === "intro", after:2400 },
  dive:{ when:o => o.phase === "intro", after:5600 },
  grid:{ when:o => o.phase === "grid" && o.round === 0, after:2200 },
  countdown:{ when:o => o.phase === "countdown" && o.round === 0, after:1300 },
  /* a frozen shot adds 1.2 s of rows: this lands just after the gun, while Go is up */
  go:{ when:o => o.phase === "countdown" && o.round === 0, after:2100 },
  race:{ when:o => o.phase === "race" && o.round === 0, after:38000 },
  narrows:{ when:o => o.phase === "race" && o.round === 1, after:40000 },
  whirlpool:{ when:o => o.phase === "race" && o.round === 2, after:26000 },
  split:{ when:o => o.phase === "race" && o.round === 2 && o.leaderS >= 975, after:1000 },
  drop:{ when:o => o.phase === "race" && o.round === 3 && o.leaderS >= 1432, after:600 },
  /* a flip at the falls is the bots' luck: without one, the moment just past the lip */
  dropflip:{ when:o => o.phase === "race" && o.round === 3 && (o.dropFlip || o.leaderS >= 1452), after:700 },
  arrivals:{ when:o => o.phase === "race" && o.round === 0 && o.arrivals >= 5, after:800 },
  /* the first rider Locked in: the callout, the sparks */
  lockin:{ when:o => o.phase === "race" && o.lockedIn, after:300 },
  /* the run-ins that face the moon over rough water (the glint's worst case) */
  whirlend:{ when:o => o.phase === "race" && o.round === 2 && o.leaderS >= 1125, after:300 },
  home:{ when:o => o.phase === "race" && o.round === 3 && o.leaderS >= 1505, after:300 },
  cut:{ when:o => o.phase === "cut" && o.round === 0, after:4600 },
  cutnext:{ when:o => o.phase === "cut" && o.round === 0, after:14500 },
  replay:{ when:o => o.phase === "cut" && o.round === 3, after:1500 },
  podium:{ when:o => o.phase === "podium", after:5200 },
  feedback:{ when:o => o.phase === "feedback", after:2500 },
};
export const MOCK_SHOTS = Object.keys(SHOTS);

export function connectFloat({ room = "mock", role = "screen", hello = {}, options = {} } = {}) {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const opt = key => options[key] ?? params.get(key);
  const phones = Math.max(0, Math.min(16, Number(opt("n") ?? 13) || 0));
  const seed = Number(opt("seed")) || 3;
  const shot = opt("shot");
  const freeze = String(opt("freeze") || "") === "1";
  const auto = String(opt("auto") || "") === "1";
  const code = /^[a-z0-9-]{1,32}$/.test(room) ? room : "mock";
  const url = () => new URL(`https://float.mock/float/ws?room=${code}`);

  const listeners = new Map();
  const statusFns = new Set();
  let status = "connecting";
  let closed = false;
  const clock = { t:Date.UTC(2026, 9, 30, 3, 0, 0) + seed * 1000, now:() => clock.t };
  const engine = new FloatRoom(memoryCtx(), {}, { clock, timers:false });
  const groove = ENGINE_GROOVE ? null : grooveShim(seed, i => engine.cup?.entrants?.[i]?.skill);
  let screenSince = Infinity;
  const emit = msg => {
    const fns = listeners.get(msg.t);
    if (fns) [...fns].forEach(fn => { try { fn(msg); } catch (error) { console.error(error); } });
  };
  const setStatus = next => { status = next; statusFns.forEach(fn => fn(next)); };
  const say = (ws, message) => engine.onMessage(ws, JSON.stringify(message));

  /* the phones: each joins the lobby with its rider, keeps itself live, gets ready */
  const phoneSockets = [];
  const join = k => {
    const ws = new FakeSocket(null);
    engine.attach(ws, url());
    say(ws, { t:"hello", role:"controller", device:`mock-phone-${k}`, rider:mockRider(k) });
    phoneSockets.push(ws);
  };
  /* the observer: what the shots need to find their moment */
  const observed = { phase:"lobby", round:0, arrivals:0, leaderS:0, dropFlip:false, leg:0 };
  const watcher = new FakeSocket(text => {
    const msg = JSON.parse(text);
    if (groove && msg.t === "room") groove.room(msg);
    if (groove && msg.t === "snap") { groove.snap(msg); observed.lockedIn = groove.lockedAt !== null && observed.phase === "race"; }
    if (msg.t === "room") {
      if (msg.phase === "race" && (observed.phase !== "race" || msg.round !== observed.round)) { observed.arrivals = 0; observed.leaderS = 0; }
      observed.phase = msg.phase; observed.round = msg.round | 0; observed.leg = msg.leg | 0;
    } else if (msg.t === "ev") {
      if (msg.e === "arrive") observed.arrivals += 1;
      if (msg.e === "flip" && msg.why === "drop") observed.dropFlip = true;
      if (msg.e === "groove" && msg.level === 3 && observed.phase === "race") observed.lockedIn = true;
    } else if (msg.t === "snap" && observed.phase === "race") {
      const leg = COURSE.legs[observed.leg];
      for (const row of msg.k || []) observed.leaderS = Math.max(observed.leaderS, leg.grid + row[5]);
    }
  });

  /* the phones become the engine's bots when the Cup starts, with spread skills */
  let botted = false;
  const botThePhones = () => {
    if (botted || !engine.cup || engine.cup.phase === "lobby") return;
    botted = true;
    const skills = botSkills(engine.cup.entrants.length, seed);
    engine.cup.entrants.forEach((entrant, i) => {
      if (String(entrant.device || "").startsWith("mock-phone-")) { entrant.bot = true; entrant.skill = skills[i] ?? 0.6; }
    });
    phoneSockets.splice(0).forEach(ws => ws.close());
  };

  /* the room's clock forward: the 30 Hz loop while it would run, the phase timer otherwise */
  let lastPing = 0;
  const step = to => {
    let guard = 0;
    while (clock.t < to && guard++ < 200000) {
      clock.t = Math.min(to, clock.t + TICK);
      const cup = engine.cup;
      const phase = cup?.phase;
      if (["grid", "countdown", "race"].includes(phase)) engine.tick();
      else if (phase && phase !== "lobby" && cup.endsAt !== null && clock.t >= cup.endsAt) engine.wake();
      if (phase === "lobby" && clock.t - lastPing > 2000) {
        lastPing = clock.t;
        phoneSockets.forEach(ws => say(ws, { t:"ping", c:clock.t }));
      }
      if (phase === "lobby" && engine.cup?.phase !== "lobby") botted = false;
      botThePhones();
    }
  };
  const runUntil = (when, maxMs = 900000) => {
    const end = clock.t + maxMs;
    while (clock.t < end) {
      step(clock.t + TICK);
      if (when(observed)) return true;
    }
    return false;
  };

  const host = new FakeSocket(null);
  const start = () => say(host, { t:"host", cmd:"start", bots:phones ? 0 : 12, drinking:true });
  const plan = shot && SHOTS[shot];
  /* the room loads (its storage is async) before anyone says hello */
  const ready = Promise.resolve(engine.ready).then(() => {
    engine.attach(watcher, url());
    say(watcher, { t:"hello", role:"screen", device:"mock-watcher" });
    /* a Field Day Cup: the Tournament reserves it with its players, and it starts on its own */
    if (plan?.fieldday) return engine.fetch(new Request(`https://float.mock/internal/cup?room=${code}`, { method:"POST",
      body:JSON.stringify({ evId:"float", cupId:"mock-cup", mode:"fieldday", drinking:true, startAt:clock.t + 47000, bots:0,
        entrants:Array.from({ length:phones }, (_, k) => ({ ...mockRider(k), pid:`p${k + 1}` })) }) }))
      .then(() => step(clock.t + 500));
    /* the lobby fills */
    for (let k = 0; k < phones; k++) join(k);
    step(clock.t + 1500);
    phoneSockets.forEach((ws, k) => { if (k % 5 !== 3) say(ws, { t:"ready", on:true }); });
    engine.attach(host, url());
    say(host, { t:"hello", role:"screen", device:"mock-host" });
    if (plan && !plan.lobby) {
      start();
      botThePhones();
      if (runUntil(plan.when)) step(clock.t + plan.after);
    }
  });

  /* the screen itself */
  let screenWs = null;
  let timer = null;
  let realBase = 0, mockBase = 0, openedAt = 0;
  const open = () => {
    if (closed) return;
    setStatus("open");
    screenSince = clock.t - 1000;
    screenWs = new FakeSocket(text => {
      const msg = JSON.parse(text);
      if (groove && msg.t === "snap") {
        for (const e of groove.take(msg.s, screenSince)) emit(e);
        emit(groove.decorate(msg));
        return;
      }
      emit(msg);
    });
    engine.attach(screenWs, url());
    say(screenWs, { t:"hello", role:"screen", device:hello.device || "mock-screen" });
    /* a frozen shot still needs a moment of rows behind it */
    if (freeze && plan && !plan.lobby) step(clock.t + 1200);
    realBase = performance.now(); mockBase = clock.t; openedAt = clock.t;
    if (!freeze) timer = setInterval(() => {
      if (closed) return;
      const target = mockBase + (performance.now() - realBase);
      /* a tab that slept: carry on from here, never replay the gap at speed */
      if (target - clock.t > 2000) { mockBase = clock.t; realBase = performance.now(); return; }
      step(target);
      if (auto && engine.cup?.phase === "lobby" && clock.t > openedAt + 4000) { openedAt = Infinity; start(); botThePhones(); }
    }, 16);
  };
  let openTimer = null;
  ready.then(() => { if (!closed) openTimer = setTimeout(open, 0); }).catch(error => { console.error("Float mock", error); setStatus("closed"); });

  return {
    send(msg) {
      if (closed || !screenWs || !msg || typeof msg !== "object") return;
      if (msg.t === "ping") { emit({ t:"pong", s:clock.t, c:msg.c }); return; }
      say(screenWs, msg);
      if (msg.t === "host" && msg.cmd === "start") botThePhones();
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      closed = true;
      clearTimeout(openTimer); clearInterval(timer);
      try { screenWs?.close(); } catch {}
      setStatus("closed");
      listeners.clear(); statusFns.clear();
    },
    serverNow:() => clock.t,
    rtt:() => 0,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:true,
  };
}

export default connectFloat;
