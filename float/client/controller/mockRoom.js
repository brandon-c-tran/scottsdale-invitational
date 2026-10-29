/* A room for the phone without a server (float/PROTOCOL.md "Net"): the REAL
   room (float/worker/room.js FloatRoom: the engine's Cup, songs, judging,
   bots and stand-ins) run in this tab on a clock the mock owns, over fake
   sockets, with connectFloat's exact shape. What the phone draws is what a
   real room sends, and its taps are judged by the real room.

   /float/play?mock=1                      a party lobby that fills with the
                                           weekend's phones; Ready starts the
                                           Cup against them (twelve bots)
   /float/play?mock=1&at=<scene>           one moment, reached by running the
                                           room's clock forward (a ghost taps
                                           for you on the way), then live
   /float/play?mock=1&at=<scene>&freeze=1  the same moment held still (the
                                           room's clock stops; a tap still
                                           lands on it and is judged)

   While a scene is reached the phone hears nothing; at the moment it says
   hello again (as after a reconnect) and gets the room as it stands. The
   room's frames reach the phone `lag` ms after they are sent, and the
   phone's `lag` ms after it sends them. The mock pings for the phone every
   2 s of the room's clock, so the room never hands it to a stand-in.
   `window.__floatMock` (with expose) carries what the controller sent and
   go(scene) for the headless check. */
import { FloatRoom } from "../../worker/room.js";
import { chartOf, cueTime, MISS_AFTER_MS } from "../../shared/chart.js";
import { botSkills } from "../../shared/groove.js";

export const MOCK_SCENES = Object.freeze(["lobby", "lobby-ready", "lobby-fieldday", "intro", "card", "count", "practice", "hey",
  "watch-demo", "play", "play-late", "play-miss", "breakdown", "breakdown-copy", "outro", "after", "rock", "spin", "drop", "fireworks", "fireworks-launch", "fireworks-dark",
  "cut", "cut-out", "cut-bubble", "cut-final", "chugoff", "chugoff-count", "chugoff-go", "chugoff-kept", "chugoff-out",
  "chugoff-crowd", "lastcall", "lastcall-tap", "lastcall-locked", "lastcall-reveal", "lastcall-drink", "lastcall-safe",
  "crowd", "podium", "podium-win", "podium-out", "feedback", "watch"]);
/* a frozen scene's clock starts here, so a held moment is the same every time */
export const MOCK_EPOCH = Date.UTC(2026, 9, 31, 4, 0, 0);
/* the room's clock runs forward this far a step, and the phone is heard every PING_MS */
export const STEP_MS = 50;
export const PING_MS = 2000;
/* Ready in a party lobby starts the Cup this long after */
export const READY_START_MS = 1500;

/* the weekend's phones that fill the lobby (they ride as bots once the Cup starts) */
const NAMES = ["Evan", "Eyob", "Sahil", "Khoa", "Chinh", "Adi", "Chiang", "Richard", "Allan", "Henry", "Ben", "Jeremy"];
const COLORS = ["#4f93a3", "#c9b25a", "#a6527c", "#6e9450", "#3b6e9c", "#e39a3b", "#7c5ca6", "#2f7e83", "#b23b5e", "#a8a03f",
  "#6d6fa8", "#c05b33"];
const CRITTERS = ["javelina", "roadrunner", "jackrabbit", "tortoise", "gila", "hornedlizard", "bighorn", "quail", "armadillo",
  "coyote", "otter", "frog"];
export const mockRider = k => ({ name:NAMES[k % NAMES.length], color:COLORS[k % COLORS.length], drinks:true, number:k + 2,
  look:{ critter:CRITTERS[k % CRITTERS.length], floatie:"classic", hat:"none", shades:"none", pose:"flex" } });

class FakeSocket {
  constructor(onText) { this.onText = onText; this.readyState = 1; this.listeners = {}; }
  send(text) { if (this.readyState === 1) this.onText?.(text); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  accept() {}
  close() { if (this.readyState === 3) return; this.readyState = 3; for (const fn of this.listeners.close || []) fn({}); }
}
const memoryCtx = () => {
  const entries = new Map();
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  return {
    storage:{
      async get(key) { return copy(entries.get(key)); },
      async put(key, value) { entries.set(key, copy(value)); },
      async delete(key) { entries.delete(key); },
      async setAlarm() {},
      async deleteAlarm() {},
    },
    blockConcurrencyWhile:fn => fn(),
  };
};

/* how the ghost plays your cues on the way to a moment: r (raw ms) for a
   cue, or null to leave it (the room's miss); and, in a chug-off it is in,
   how long after the go it taps Done (null: never) */
const near = c => ((c * 37) % 41) - 20;
export const GHOSTS = Object.freeze({
  good:{ r:(cue, offset) => offset + near(cue.id), chug:2000 },
  practice:{ r:(cue, offset) => cue.scored ? offset + near(cue.id) : 18 + near(cue.id) / 4, chug:2000 },
  idle:{ r:() => null, chug:null },
  bad:{ r:() => null, chug:null },
});
/* Last Call's ghost: every song as practice, then its one tap on zero `r` ms off (null: none) */
const zeroGhost = (r, chug = 2000) => ({ ...GHOSTS.practice, chug, r:(cue, offset) => cue.kind === "zero" ? (r === null ? null : offset + r)
  : GHOSTS.practice.r(cue, offset) });

export function createMockRoom({ hello = null, scene = null, freeze = false, timers = globalThis, now:realNow = () => Date.now(),
  perf = () => globalThis.performance?.now?.() ?? Date.now(), lag = 40, expose = false, bots = 12 } = {}) {
  const later = (fn, ms) => timers.setTimeout(fn, ms);
  const listeners = new Map(), statusFns = new Set(), sent = [];
  const device = "mock-phone";
  const clock = { t:freeze ? MOCK_EPOCH : Math.round(realNow()), now:() => clock.t };
  let status = "connecting", closed = false, frozen = !!freeze, muted = false, follow = null, readyAt = null;
  let room = null, phoneWs = null, hostWs = null, lastPing = -Infinity, lastPerf = perf(), lastHello = null, riderPatch = null;
  let ghost = null, ghostSent = new Map(), going = Promise.resolve(), feedback = null, sceneName = null, lobbyWs = [];

  const setStatus = next => {
    if (next === status) return;
    status = next;
    for (const fn of [...statusFns]) { try { fn(next); } catch {} }
  };
  const emit = msg => { for (const key of [msg.t, "*"]) for (const fn of [...(listeners.get(key) || [])]) { try { fn(msg); } catch {} } };
  const say = (ws, msg) => { if (room && ws) room.onMessage(ws, JSON.stringify(msg)); };
  const rider = () => {
    let extra = null;
    try { extra = typeof hello === "function" ? hello() : hello; } catch {}
    return { ...(extra?.rider || {}), ...(riderPatch || {}) };
  };
  const meIndex = () => room?.entrantIndex(device) ?? -1;

  /* a fresh room: the phone's socket (its frames reach the phone after `lag`, unless muted), the host's */
  async function freshRoom() {
    try { phoneWs?.close(); hostWs?.close(); } catch {}
    /* repeatable ids, a scene's own: a held moment is the same Cup every time, and never another moment's */
    let serial = 0;
    const tag = String(sceneName || "live").replace(/[^a-z0-9]/gi, "");
    room = new FloatRoom(memoryCtx(), {}, { clock, timers:false, ids:prefix => `${prefix}${tag}${(serial += 1)}` });
    await room.ready;
    phoneWs = new FakeSocket(text => {
      if (muted || closed) return;
      const msg = JSON.parse(text);
      later(() => { if (!closed && status === "open") emit(msg); }, lag);
    });
    room.attach(phoneWs, new URL("https://float.mock/float/ws?room=mock"));
    hostWs = new FakeSocket(null);
    room.attach(hostWs, new URL("https://float.mock/float/ws?room=mock"));
    say(hostWs, { t:"hello", role:"screen", device:"mock-host" });
    ghostSent = new Map();
  }
  /* the phone says hello (on open, after a scene is reached, after a blip) */
  function phoneHello() {
    lastHello = { t:"hello", role:"controller", device, rider:rider() };
    say(phoneWs, lastHello);
    lastPing = clock.t;
  }
  /* the weekend's phones in the lobby, most of them ready (connected until the Cup starts) */
  function fillLobby(n = bots) {
    lobbyWs = [];
    for (let k = 0; k < n; k += 1) {
      const ws = new FakeSocket(null);
      room.attach(ws, new URL("https://float.mock/float/ws?room=mock"));
      say(ws, { t:"hello", role:"controller", device:`mock-rider-${k}`, rider:mockRider(k) });
      if (k % 5 !== 3) say(ws, { t:"ready", on:true });
      lobbyWs.push(ws);
    }
  }
  /* the Cup starts: the lobby's other phones ride as bots */
  function startCup() {
    const cup = room.cup;
    if (!cup || cup.phase !== "lobby") return;
    const skills = botSkills(cup.entrants.length, 3);
    cup.entrants.forEach((entrant, i) => {
      if (String(entrant.device || "").startsWith("mock-rider-")) { entrant.bot = true; entrant.skill = skills[i] ?? 0.6; }
    });
    say(hostWs, { t:"host", cmd:"start", bots:0, drinking:true });
    lobbyWs.splice(0).forEach(ws => ws.close());
  }

  /* the ghost's taps and Done, due by the room's clock */
  function ghostStep() {
    const cup = room?.cup, i = meIndex();
    /* a song, or Last Call's bar (the same shape) */
    const song = cup?.phase === "lastcall" ? cup.bar : cup?.phase === "song" ? cup.song : null;
    if (!ghost || !song || i < 0 || !song.judged?.[i]) return;
    const chart = chartOf(song.id);
    const key = `${cup.id}:${song.round}:${song.id}`;
    if (!ghostSent.has(key)) ghostSent.set(key, { hits:new Set(), done:false });
    const mine = ghostSent.get(key);
    for (const cue of chart.cues) {
      const t = cueTime(song.songAt, cue.beat, chart.beatMs);
      if (t - 400 > clock.t) break;
      if (mine.hits.has(cue.id) || song.judged[i][cue.id]) continue;
      const r = ghost.r(cue, song.offset);
      if (r === null || r === undefined) { mine.hits.add(cue.id); continue; }
      if (t + r > clock.t) continue;
      mine.hits.add(cue.id);
      if (clock.t < t + song.offset + (chart.window || 300) + 250) say(phoneWs, { t:"hit", c:cue.id, r:Math.round(r) });
    }
  }
  /* the ghost's Done in a chug-off it is in */
  function ghostChug() {
    const cup = room?.cup, i = meIndex(), chug = cup?.chugoff;
    if (!ghost || ghost.chug === null || ghost.chug === undefined || cup?.phase !== "chugoff" || !chug || (i !== chug.a && i !== chug.b)) return;
    const key = `${cup.id}:${chug.round}:chug`;
    if (ghostSent.has(key) || clock.t < chug.goAt + ghost.chug) return;
    ghostSent.set(key, true);
    say(phoneWs, { t:"drink" });
  }

  /* the room's clock forward to `to`: a step at a time, the ghost and the phone's pings on the way */
  function runTo(to) {
    let guard = 0;
    while (clock.t < to && guard++ < 400000) {
      clock.t = Math.min(to, clock.t + STEP_MS);
      ghostStep();
      ghostChug();
      if (clock.t - lastPing >= PING_MS) {
        lastPing = clock.t;
        if (meIndex() >= 0) say(phoneWs, { t:"ping", c:clock.t });
        for (const ws of lobbyWs) say(ws, { t:"ping", c:clock.t });
      }
      room.tick();
      if (readyAt !== null && clock.t >= readyAt + READY_START_MS) {
        readyAt = null;
        if (room.cup?.phase === "lobby" && room.cup.entrants[meIndex()]?.ready) startCup();
      }
    }
  }
  function runUntil(when, maxMs = 900000) {
    const end = clock.t + maxMs;
    while (clock.t < end) {
      runTo(clock.t + STEP_MS);
      if (when(room.cup)) return true;
    }
    return false;
  }
  /* the song's beat `beat` of round `round` (playing every song before it with `ghost`) */
  function toBeat(round, beat) {
    runUntil(cup => cup.phase === "song" && cup.round === round);
    runTo(room.cup.songAt + beat * 500);
  }
  /* Last Call after round `round`'s cut: `at(countdown)` ms from its songAt */
  function toBar(round, at) {
    runUntil(cup => cup.phase === "lastcall" && cup.round === round && !!cup.bar);
    const bar = room.cup.bar;
    runTo(bar.songAt + at(chartOf(bar.id).countdown));
  }
  /* this phone on the chug-off's pair: at the cut it takes the seat of
     the rider on the bubble (`k` 0 the last through, 1 the first out) */
  function bubbleMe(k = 0) {
    const cup = room.cup, i = meIndex();
    const seat = cup?.bubble?.[k];
    if (!Number.isInteger(seat) || i < 0 || seat === i) return;
    const mine = cup.entrants[i];
    cup.entrants[i] = cup.entrants[seat];
    cup.entrants[seat] = mine;
  }
  /* round 0's cut with this phone on the bubble (or watching it) */
  function toCut(k = null) {
    runUntil(cup => cup.phase === "cut");
    if (k !== null) bubbleMe(k);
  }
  function toChug(k = null) {
    toCut(k);
    runUntil(cup => cup.phase === "chugoff" && !!cup.chugoff);
  }
  /* the Cup's order with this phone at `place` (a held podium) */
  function placeMe(place) {
    const cup = room.cup, i = meIndex();
    if (!cup?.final || i < 0) return;
    const reorder = list => { const rest = list.filter(k => k !== i); rest.splice(Math.max(0, place - 1), 0, i); return rest; };
    cup.final = reorder(cup.final);
    if (cup.podium) cup.podium = cup.final.slice(0, 3);
    cup.standings = cup.final.map((k, n) => ({ i:k, place:n + 1, out:cup.standings.find(item => item.i === k)?.out ?? null }));
  }

  /* real time: the room's clock follows the page's while nothing holds it */
  function startFollowing() {
    if (follow) return;
    lastPerf = perf();
    follow = timers.setInterval(() => {
      const p = perf(), dt = p - lastPerf;
      lastPerf = p;
      if (frozen || closed || !room) return;
      /* a page that slept carries on from here, never replays the gap at speed */
      runTo(clock.t + Math.min(dt, 1000));
    }, 16);
  }

  /* ── scenes ── */
  async function go(name, { quiet = false } = {}) {
    if (!MOCK_SCENES.includes(name)) return false;
    sceneName = name;
    readyAt = null;
    if (freeze) { clock.t = MOCK_EPOCH; frozen = false; }
    riderPatch = null;
    ghost = GHOSTS.good;
    muted = true;
    await freshRoom();
    const lobby = name.startsWith("lobby");
    if (name === "lobby-fieldday") {
      riderPatch = { pid:"p1" };
      await room.fetch(new Request("https://float.mock/internal/cup?room=fd-float", { method:"POST",
        body:JSON.stringify({ evId:"float", cupId:"mock-cup", mode:"fieldday", drinking:true, startAt:clock.t + 600000, bots:0,
          entrants:[{ ...rider(), pid:"p1" }, ...NAMES.map((n, k) => ({ ...mockRider(k), pid:`p${k + 2}` }))] }) }));
    }
    if (name !== "watch") phoneHello();
    if (name !== "lobby-fieldday") fillLobby(bots);
    if (name === "lobby-ready") say(phoneWs, { t:"ready", on:true });
    if (!lobby) {
      startCup();
      const i = meIndex();
      if (i >= 0) say(phoneWs, { t:"ready", on:true });
    }
    const song = () => room.cup.song;
    const cueAt = beat => room.cup.songAt + beat * chartOf(room.cup.songId).beatMs;
    switch (name) {
      case "intro": runTo(clock.t + 2000); break;
      case "card": runUntil(cup => cup.phase === "song"); runTo(room.cup.songAt - 1200); break;
      case "count": toBeat(0, 5.1); break;
      /* the moment a tap lands 70 ms late (Nice!), with the room's offset as it stands */
      case "practice": ghost = { ...GHOSTS.practice, r:(cue, offset) => cue.beat === 12 ? null : GHOSTS.practice.r(cue, offset) };
        toBeat(0, 11.6); runTo(cueAt(12) + song().offset + 70); break;
      case "hey": ghost = GHOSTS.practice; toBeat(0, 13.2); break;
      /* a tap now: 20 ms early (Perfect), 190 ms late (Late) */
      case "play": ghost = GHOSTS.practice; toBeat(0, 29.4); runTo(cueAt(30) + song().offset - 20); break;
      case "play-late": ghost = GHOSTS.practice; toBeat(0, 29.4); runTo(cueAt(30) + song().offset + 190); break;
      /* the ghost leaves beat 30: the room's miss lands just after the phone is back */
      case "play-miss": ghost = { ...GHOSTS.practice, r:(cue, offset) => cue.beat === 30 ? null : GHOSTS.practice.r(cue, offset) };
        toBeat(0, 29.4); runTo(cueAt(30) + song().offset + MISS_AFTER_MS - 160); break;
      /* the host's demo ("Watch"); the breakdown's "Copy me", then the copy (a tap 30 ms late) */
      case "watch-demo": ghost = GHOSTS.practice; toBeat(0, 17.4); break;
      case "breakdown": ghost = GHOSTS.practice; toBeat(0, 57.2); break;
      case "breakdown-copy": ghost = { ...GHOSTS.practice, r:(cue, offset) => cue.beat === 60 ? null : GHOSTS.practice.r(cue, offset) };
        toBeat(0, 59.6); runTo(cueAt(60) + song().offset + 30); break;
      case "outro": ghost = GHOSTS.practice; toBeat(0, 120.2); break;
      case "after": ghost = GHOSTS.practice; toBeat(0, 128.6); break;
      case "rock": ghost = GHOSTS.practice; toBeat(1, 9.2); break;
      case "spin": ghost = GHOSTS.practice; toBeat(2, 10.6); break;
      case "drop": ghost = GHOSTS.practice; toBeat(3, 118.1); break;
      /* Fireworks, the final (round 5): the host's fuse (Launch), a launch tapped now (20 ms late, Perfect), a blackout bar */
      case "fireworks": ghost = GHOSTS.practice; toBeat(4, 29.6); break;
      case "fireworks-launch": ghost = { ...GHOSTS.practice, r:(cue, offset) => cue.beat === 31 ? null : GHOSTS.practice.r(cue, offset) };
        toBeat(4, 30.6); runTo(cueAt(31) + song().offset + 20); break;
      case "fireworks-dark": ghost = GHOSTS.practice; toBeat(4, 105.7); break;
      case "cut": ghost = GHOSTS.practice; runUntil(cup => cup.phase === "cut"); runTo(clock.t + 1500); break;
      case "cut-out": ghost = GHOSTS.bad; runUntil(cup => cup.phase === "cut"); runTo(room.cup.endsAt - 1500); break;
      case "cut-bubble": ghost = GHOSTS.practice; toCut(0); runTo(room.cup.endsAt - 1500); break;
      /* the chug-off: its call (the Cup's first says what it is), the count, the go, kept or out, and the room's view */
      case "chugoff": ghost = GHOSTS.practice; toChug(0); runTo(room.cup.startAt + 600); break;
      case "chugoff-count": ghost = GHOSTS.practice; toChug(0); runTo(room.cup.chugoff.goAt - 1500); break;
      case "chugoff-go": ghost = { ...GHOSTS.practice, chug:null }; toChug(0); runTo(room.cup.chugoff.goAt + 1200); break;
      case "chugoff-kept": ghost = { ...GHOSTS.practice, chug:1500 }; toChug(0); runTo(room.cup.chugoff.goAt + 2400); break;
      case "chugoff-out": ghost = { ...GHOSTS.practice, chug:null }; toChug(1);
        runUntil(cup => cup.phase !== "chugoff" || cup.chugoff?.winner !== null); runTo(clock.t + 900); break;
      case "chugoff-crowd": ghost = GHOSTS.practice; toChug(null); runTo(room.cup.chugoff.goAt + 1500); break;
      case "cut-final": ghost = GHOSTS.practice; runUntil(cup => cup.phase === "cut" && cup.round === cup.rounds - 1);
        placeMe(1); runTo(clock.t + 1500); break;
      /* Last Call, the countdown: the intro (the first says what it is), Tap on zero, Locked (730 ms late), the
         offset revealed, who drinks (2.6 s off: the farthest) and who is safe (20 ms off) */
      case "lastcall": ghost = zeroGhost(730); toBar(0, cd => 2000); break;
      case "lastcall-tap": ghost = zeroGhost(null); toBar(0, cd => cd.zeroAt - 1500); break;
      case "lastcall-locked": ghost = zeroGhost(730); toBar(0, cd => cd.zeroAt + 1500); break;
      case "lastcall-reveal": ghost = zeroGhost(730); toBar(0, cd => cd.revealAt + 500); break;
      case "lastcall-drink": ghost = zeroGhost(2600); toBar(0, cd => cd.verdictAt + 700); break;
      case "lastcall-safe": ghost = zeroGhost(20); toBar(0, cd => cd.verdictAt + 700); break;
      case "crowd": ghost = GHOSTS.bad; toBeat(1, 34.2); break;
      case "podium": case "podium-win": ghost = GHOSTS.practice; runUntil(cup => cup.phase === "podium");
        placeMe(name === "podium-win" ? 1 : 2); runTo(clock.t + 2000); break;
      case "podium-out": ghost = GHOSTS.bad; runUntil(cup => cup.phase === "podium"); runTo(clock.t + 2000); break;
      case "feedback": ghost = GHOSTS.practice; runUntil(cup => cup.phase === "feedback"); runTo(clock.t + 1000); break;
      case "watch": toBeat(1, 40.2); break;
      default:
    }
    muted = false;
    ghost = null;
    /* back on the air: the room as it stands (the first scene waits for the phone's own hello) */
    if (!quiet || status === "open") phoneHello();
    if (name === "play-miss") runTo(clock.t + 220);
    if (!freeze) startFollowing();
    frozen = !!freeze;
    return true;
  }

  /* ── what the phone sends ── */
  function receive(msg) {
    sent.push(msg);
    if (!room) return;
    if (msg.t === "hello") { lastHello = msg; lastPing = clock.t; }
    say(phoneWs, msg.t === "hello" ? { ...msg, rider:{ ...(msg.rider || {}), ...(riderPatch || {}) } } : msg);
    if (msg.t === "ping") lastPing = clock.t;
    if (msg.t === "feedback") feedback = msg.answers || null;
    /* a live party lobby starts READY_START_MS (on the room's clock) after this phone is ready */
    if (msg.t === "ready" && room.cup?.phase === "lobby" && room.cup.mode === "party" && !sceneName) readyAt = msg.on === true ? clock.t : null;
  }

  /* open shortly after creation, like a socket, with the room loaded */
  going = (async () => {
    await freshRoom();
    if (scene && MOCK_SCENES.includes(scene)) await go(scene, { quiet:true });
    else { fillLobby(bots); startFollowing(); }
  })();
  going.then(() => later(() => { if (!closed) setStatus("open"); }, 30)).catch(error => { console.error("Float mock", error); setStatus("closed"); });

  const net = {
    device,
    room:"mock",
    send(msg) {
      if (closed || status !== "open" || !msg || typeof msg !== "object") return false;
      const copy = JSON.parse(JSON.stringify(msg));
      later(() => { if (!closed) receive(copy); }, lag);
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
      if (follow) timers.clearInterval(follow);
      try { phoneWs?.close(); hostWs?.close(); } catch {}
      setStatus("closed");
    },
    serverNow:() => clock.now(),
    rtt:() => lag * 2,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:{ sent, scenes:MOCK_SCENES, go:name => (going = going.then(() => go(name))), cup:() => room?.cup || null, room:() => room,
      feedback:() => feedback, serial:++mockSerial, status:() => status, closed:() => closed, me:meIndex,
      /* the room's clock: where it is, held or let run, moved */
      clock:() => clock.t, run() { frozen = false; startFollowing(); }, hold() { frozen = true; }, advance(ms) { runTo(clock.t + ms); },
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
