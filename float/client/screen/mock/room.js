/* The stand-in room (`?mock=1`): the REAL room (float/worker/room.js
   FloatRoom, the engine's Cup and songs, its bots, its judging) run in this
   tab on a clock the mock owns, over fake sockets, with the net API's exact
   shape (float/PROTOCOL.md "Net"): { send, on, close, serverNow, rtt,
   status, onStatus }. Nothing goes over the network, and what the screen
   draws is what a real room sends.

   The roster's phones join the lobby; Start runs the Cup. Two of them stay
   people the mock plays (the groom and the next phone): they tap every cue
   with their own timing, late on average like a TV's sound, so the room
   calibrates on them; in a chug-off each taps Done a few seconds after the go. The rest become the engine's bots, their skills
   spread, so every popup shows. A shot runs the room's clock to its moment
   (the screen joins a second before it, so the popups in flight are
   there) and, with freeze=1, stops it. */
import { FloatRoom } from "../../../worker/room.js";
import { chartOf } from "../../../shared/chart.js";
import { FakeSocket, SHOTS, gauss, hash01, mockRider, mockSkills, shotTime } from "./shared.js";

/* the room's own tick is every 100 ms; the mock steps it at 20 Hz */
const STEP_MS = 50;
/* the phones the mock plays as people: index, skill (ms of spread), bias, Done after a chug-off's go */
const PEOPLE = Object.freeze([
  { k:0, spread:22, bias:42, miss:0.01, doneAfter:5200 },
  { k:1, spread:48, bias:58, miss:0.03, doneAfter:9800 },
]);

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

export function connectRoom({ room = "mock", hello = {}, options = {} } = {}) {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const opt = key => options[key] ?? params.get(key);
  const phones = Math.max(0, Math.min(16, Number(opt("n") ?? 13) || 0));
  const seed = Number(opt("seed")) || 3;
  const shot = opt("shot");
  const freeze = String(opt("freeze") || "") === "1";
  const auto = String(opt("auto") || "") === "1";
  const drinking = String(opt("drinking") ?? "1") !== "0";
  const code = /^[a-z0-9-]{1,32}$/.test(room) ? room : "mock";
  const plan = shot && SHOTS[shot] ? SHOTS[shot] : null;
  const url = () => new URL(`https://float.mock/float/ws?room=${code}`);

  const listeners = new Map();
  const statusFns = new Set();
  let status = "connecting";
  let closed = false;
  const clock = { t:Date.UTC(2026, 9, 31, 3, 0, 0) + seed * 1000, now:() => clock.t };
  /* repeatable ids: the same Cup (its bots' draws) for the same seed */
  let idCount = 0;
  const engine = new FloatRoom(memoryCtx(), {}, { clock, timers:false, ids:prefix => `${prefix}mock${seed}x${idCount++}` });
  const emit = msg => {
    const fns = listeners.get(msg.t);
    if (fns) [...fns].forEach(fn => { try { fn(msg); } catch (error) { console.error(error); } });
  };
  const setStatus = next => { status = next; statusFns.forEach(fn => fn(next)); };
  const say = (ws, message) => engine.onMessage(ws, JSON.stringify(message));

  /* the observer: when each phase began, the song's beat 0, the rounds */
  const seen = {};
  const watch = { phase:"lobby", round:0, rounds:0, song:null, songAt:null, out:[] };
  const watcher = new FakeSocket(text => {
    const msg = JSON.parse(text);
    if (msg.t !== "room") return;
    const key = ["song", "cut", "chugoff", "lastcall"].includes(msg.phase) ? `${msg.phase}:${msg.round}` : msg.phase;
    if (!seen[key]) seen[key] = { startAt:Number.isFinite(msg.startAt) ? msg.startAt : msg.s, songAt:msg.songAt ?? null };
    else if (msg.songAt && !seen[key].songAt) seen[key].songAt = msg.songAt;
    /* the chug-off's go and its decision */
    if (msg.phase === "chugoff" && msg.chugoff) {
      if (Number.isFinite(msg.chugoff.goAt)) seen[key].goAt = msg.chugoff.goAt;
      const won = Number.isInteger(msg.chugoff.winner) ? msg.chugoff.doneAt?.[msg.chugoff.winner] : undefined;
      if (!Number.isFinite(seen[key].winAt) && Number.isInteger(msg.chugoff.winner))
        seen[key].winAt = Number.isFinite(won) ? msg.chugoff.goAt + won : Number.isFinite(msg.chugoff.decidedAt) ? msg.chugoff.decidedAt : msg.s;
    }
    Object.assign(watch, { phase:msg.phase, round:msg.round | 0, rounds:msg.rounds | 0, song:msg.song || null, songAt:msg.songAt ?? null,
      out:Array.isArray(msg.out) ? msg.out : [] });
  });

  /* the phones */
  const phoneSockets = [];
  const join = k => {
    const ws = new FakeSocket(null);
    engine.attach(ws, url());
    say(ws, { t:"hello", role:"controller", device:`mock-phone-${k}`, rider:mockRider(k) });
    phoneSockets[k] = ws;
  };

  /* the people the mock plays: each cue tapped once at its own time (the
     host's demos are nobody's); in a chug-off, Done a few seconds after the go */
  const people = new Map();
  const playPeople = () => {
    const cup = engine.cup;
    if (watch.phase === "chugoff" && Number.isFinite(cup?.chugoff?.goAt)) {
      for (const person of PEOPLE) {
        const ws = phoneSockets[person.k];
        const i = cup.entrants?.findIndex(e => e.device === `mock-phone-${person.k}`) ?? -1;
        if (!ws || i < 0 || (cup.chugoff.a !== i && cup.chugoff.b !== i)) continue;
        const key = `chug:${watch.round}:${cup.chugoff.goAt}`;
        let me = people.get(person.k);
        if (!me || me.song !== key) people.set(person.k, me = { song:key, next:0, done:false });
        if (!me.done && clock.t >= cup.chugoff.goAt + person.doneAfter) { me.done = true; say(ws, { t:"drink" }); }
      }
      return;
    }
    if ((watch.phase !== "song" && watch.phase !== "lastcall") || !watch.song || !Number.isFinite(watch.songAt)) return;
    const chart = chartOf(watch.song);
    if (!chart) return;
    for (const person of PEOPLE) {
      const ws = phoneSockets[person.k];
      const i = cup?.entrants?.findIndex(e => e.device === `mock-phone-${person.k}`) ?? -1;
      /* in a song only the field plays; at the bar everyone does */
      if (!ws || i < 0 || (watch.phase === "song" && (watch.out.includes(i) || !cup?.field?.includes(i)))) continue;
      let me = people.get(person.k);
      const songKey = `${watch.phase}:${watch.round}:${watch.songAt}`;
      if (!me || me.song !== songKey) people.set(person.k, me = { song:songKey, next:0, done:false });
      while (me.next < chart.cues.length) {
        const cue = chart.cues[me.next];
        /* Last Call: off by a few hundred ms, not a song's few dozen */
        const spread = watch.phase === "lastcall" ? person.spread * 8 : person.spread;
        const r = Math.round(person.bias + gauss(seed, watch.round, person.k, cue.id) * spread);
        const at = watch.songAt + cue.beat * chart.beatMs + r;
        if (at > clock.t) break;
        me.next += 1;
        if (cue.demo || hash01(seed, watch.round, person.k, cue.id, 9) < person.miss) continue;
        say(ws, { t:"hit", c:cue.id, r });
      }
    }
  };

  /* everyone but the people becomes one of the engine's bots once the Cup starts */
  let botted = false;
  const botThePhones = () => {
    if (botted || !engine.cup || engine.cup.phase === "lobby") return;
    botted = true;
    const skills = mockSkills(engine.cup.entrants.length, seed);
    const people = new Set(PEOPLE.map(p => `mock-phone-${p.k}`));
    engine.cup.entrants.forEach((entrant, i) => {
      if (String(entrant.device || "").startsWith("mock-phone-") && !people.has(entrant.device)) { entrant.bot = true; entrant.skill = skills[i] ?? 0.6; }
    });
  };

  /* the room's clock forward: phones keep themselves live, the people play, the room ticks */
  let lastPing = -Infinity, lastCheer = -Infinity;
  const step = to => {
    let guard = 0;
    while (clock.t < to && guard++ < 400000) {
      clock.t = Math.min(to, clock.t + STEP_MS);
      if (clock.t - lastPing >= 2000) {
        lastPing = clock.t;
        PEOPLE.forEach(p => { const ws = phoneSockets[p.k]; if (ws) say(ws, { t:"ping", c:clock.t }); });
        if (engine.cup?.phase === "lobby") phoneSockets.forEach(ws => ws && say(ws, { t:"ping", c:clock.t }));
      }
      playPeople();
      /* an out person cheers from the bank now and then */
      if (watch.phase === "song" && clock.t - lastCheer > 1700) {
        lastCheer = clock.t;
        for (const p of PEOPLE) {
          const i = engine.cup?.entrants?.findIndex(e => e.device === `mock-phone-${p.k}`) ?? -1;
          if (i >= 0 && watch.out.includes(i) && hash01(seed, p.k, Math.floor(clock.t / 1700)) < 0.6) say(phoneSockets[p.k], { t:"cheer" });
        }
      }
      engine.tick();
      if (engine.cup?.phase === "lobby") botted = false;
      botThePhones();
    }
  };

  const host = new FakeSocket(null);
  const start = () => { say(host, { t:"host", cmd:"start", bots:phones ? 0 : 12, drinking }); botThePhones(); };

  let screenWs = null;
  const attachScreen = () => {
    if (screenWs) return;
    screenWs = new FakeSocket(text => emit(JSON.parse(text)));
    engine.attach(screenWs, url());
    say(screenWs, { t:"hello", role:"screen", device:hello.device || "mock-screen" });
  };

  /* the room loads (its storage is async) before anyone says hello */
  const ready = Promise.resolve(engine.ready).then(async () => {
    engine.attach(watcher, url());
    say(watcher, { t:"hello", role:"screen", device:"mock-watcher" });
    /* a Field Day Cup: the Tournament reserves it with its players, and it starts on its own */
    if (plan?.fieldday) {
      await engine.fetch(new Request(`https://float.mock/internal/cup?room=${code}`, { method:"POST",
        body:JSON.stringify({ evId:"float", cupId:"mock-cup", mode:"fieldday", drinking, startAt:clock.t + 47000, bots:0,
          entrants:Array.from({ length:phones }, (_, k) => ({ ...mockRider(k), pid:`p${k + 1}` })) }) }));
      for (let k = 0; k < phones; k += 1) if (k % 4 !== 2) join(k);
      step(clock.t + 500);
      return;
    }
    const live = !plan && !freeze;
    if (!live) for (let k = 0; k < phones; k += 1) join(k);
    step(clock.t + 1500);
    phoneSockets.forEach((ws, k) => { if (ws && k % 5 !== 3) say(ws, { t:"ready", on:true }); });
    engine.attach(host, url());
    say(host, { t:"hello", role:"screen", device:"mock-host" });
    if (!plan || plan.lobby) return;
    start();
    /* on to a second before the moment, the screen in, then the moment */
    let at = null;
    for (let guard = 0; guard < 20000 && at === null; guard += 1) {
      step(clock.t + 250);
      at = shotTime(shot, seen, watch.rounds);
      if (watch.phase === "lobby" && guard > 40) break;
    }
    if (at === null) return;
    step(at - 1000);
  });

  let timer = null, openTimer = null, joinTimer = null;
  let realBase = 0, mockBase = 0, openedAt = 0;
  const open = () => {
    if (closed) return;
    setStatus("open");
    attachScreen();
    const at = plan && !plan.lobby ? shotTime(shot, seen, watch.rounds) : null;
    if (at !== null) step(at);
    realBase = performance.now(); mockBase = clock.t; openedAt = clock.t;
    /* live: the phones join one by one */
    if (!plan && !freeze) {
      let k = 0;
      joinTimer = setInterval(() => {
        if (closed || k >= phones || (engine.cup && engine.cup.phase !== "lobby")) { clearInterval(joinTimer); return; }
        join(k);
        const ws = phoneSockets[k];
        if (k % 5 !== 3) setTimeout(() => { if (!closed && engine.cup?.phase === "lobby") say(ws, { t:"ready", on:true }); }, 900 + (k % 3) * 500);
        k += 1;
      }, 280);
    }
    if (!freeze) timer = setInterval(() => {
      if (closed) return;
      const target = mockBase + (performance.now() - realBase);
      /* a tab that slept: carry on from here, never replay the gap at speed */
      if (target - clock.t > 2000) { mockBase = clock.t; realBase = performance.now(); return; }
      step(target);
      if (auto && engine.cup?.phase === "lobby" && clock.t > openedAt + 4500) { openedAt = Infinity; start(); }
    }, 16);
  };
  ready.then(() => { if (!closed) openTimer = setTimeout(open, 0); }).catch(error => { console.error("Float mock", error); setStatus("closed"); });

  return {
    send(msg) {
      if (closed || !screenWs || !msg || typeof msg !== "object") return false;
      say(screenWs, msg);
      if (msg.t === "host" && msg.cmd === "start") botThePhones();
      return true;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      closed = true;
      clearTimeout(openTimer); clearInterval(timer); clearInterval(joinTimer);
      try { screenWs?.close(); } catch {}
      setStatus("closed");
      listeners.clear(); statusFns.clear();
    },
    serverNow:() => clock.t,
    rtt:() => 0,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:true,
    /* for a test or a console: the room and its clock */
    engine, clock, step, ready,
  };
}

export default connectRoom;
