import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Motion foundation (M0), shared heartbeat (M1/M20), and the iOS tap tick
   (HX). Pure rules are tested directly; the transport's fresh-change gate is
   driven through the real client over a fake socket; the Durable Object's
   clock stamps are read from real frames. Nothing leaves the process. */
globalThis.__FD_BUILD_ID__ = "build-test";

const listeners = { window:{}, document:{} };
const storageArea = () => {
  const values = new Map();
  return { getItem:k => values.has(k) ? values.get(k) : null, setItem:(k, v) => values.set(k, String(v)),
    removeItem:k => values.delete(k) };
};
class FakeWebSocket {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWebSocket.instances.push(this); }
  send(frame) { this.sent.push(JSON.parse(frame)); }
  close() { const was = this.readyState; this.readyState = 3; if (was !== 3) this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message) { this.onmessage?.({ data:JSON.stringify(message) }); }
}
mock.timers.enable({ apis:["setTimeout", "setInterval", "Date"], now:1_800_000_000_000 });
globalThis.window = {
  location:{ pathname:"/", search:"", protocol:"http:", host:"test.local", reload() {} },
  addEventListener(type, fn) { (listeners.window[type] ||= []).push(fn); },
};
globalThis.location = globalThis.window.location;
globalThis.document = { hidden:false, addEventListener(type, fn) { (listeners.document[type] ||= []).push(fn); } };
globalThis.localStorage = storageArea();
globalThis.sessionStorage = storageArea();
globalThis.WebSocket = FakeWebSocket;

const { EMPTY_STATE, PT } = await import("../shared/core.js");
const gate = await import("../src/lib/frameGate.js");
const clock = await import("../src/lib/serverClock.js");
const motion = await import("../src/lib/motion.js");
const haptics = await import("../src/lib/haptics.js");
const client = await import("../src/lib/client.js");
const { Tournament } = await import("../worker/tournament.js");

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const withState = patch => ({ ...structuredClone(EMPTY_STATE), ...patch });

/* ── the fresh-change gate ── */

test("only a broadcast on a settled, visible socket that repairs nothing is fresh", () => {
  const prev = withState({});
  const next = withState({ updatedAt:5 });
  const msg = { version:3, lastAction:"placeWager", state:next };
  const ok = gate.classifyFrame({ msg, prevState:prev, hadState:true });
  assert.equal(ok.fresh, true);
  assert.equal(ok.reason, "fresh");
  const cases = [
    [{ msg, prevState:prev, hadState:false }, "first"],
    [{ msg:{ ...msg, hello:4 }, prevState:prev, hadState:true }, "resync"],
    [{ msg, prevState:prev, hadState:true, settling:true }, "settling"],
    [{ msg, prevState:prev, hadState:true, hidden:true }, "hidden"],
    [{ msg:{ ...msg, lastAction:null }, prevState:prev, hadState:true }, "quiet"],
    [{ msg, prevState:prev, hadState:true, accepted:false }, "stale"],
    [{ msg:{ ...msg, lastAction:"correctContest" }, prevState:prev, hadState:true }, "correction"],
  ];
  for (const [input, reason] of cases) {
    const result = gate.classifyFrame(input);
    assert.equal(result.fresh, false, reason);
    assert.equal(result.reason, reason);
  }
});

test("a correction is recognised by its action, a new correction entry, or a moved result revision", () => {
  for (const action of ["clearResult", "correctContest", "undoLastContest", "voidWager", "voidDuel",
    "removeAdjustment", "undoDraftPick", "takeBackAnnouncement", "pokerCancel", "returnToLockerRoom"])
    assert.equal(gate.isCorrectionFrame(null, null, action), true, action);
  const posted = withState({ results:{ putt:{ slots:[["A"]], revision:1 } } });
  assert.equal(gate.isCorrectionFrame(posted, posted, "saveResult"), false);
  const overwritten = withState({ results:{ putt:{ slots:[["B"]], revision:2 } } });
  assert.equal(gate.isCorrectionFrame(posted, overwritten, "saveResult"), true, "overwrite");
  assert.equal(gate.isCorrectionFrame(posted, withState({ results:{} }), "anything"), true, "cleared");
  const first = withState({ results:{} });
  assert.equal(gate.isCorrectionFrame(first, posted, "saveResult"), false, "a first post is news");
  const noted = withState({ eventOps:{ putt:{ corrections:[{ type:"overwrite", at:10 }] } } });
  assert.equal(gate.isCorrectionFrame(withState({}), noted, "recordContestWinner"), true, "a new entry");
  /* the history is capped at 20 per event: a new entry still moves the mark */
  const full = n => withState({ eventOps:{ putt:{ corrections:Array.from({ length:20 }, (_, i) => ({ at:n + i })) } } });
  assert.notEqual(gate.correctionMark(full(1)), gate.correctionMark(full(2)));
});

test("the frame store publishes numbered frames to subscribers", () => {
  gate.resetFrames();
  const seen = [];
  const stop = gate.subscribeFrame(frame => seen.push(frame));
  const a = gate.publishFrame({ version:2, fresh:true, lastAction:"placeWager" });
  const b = gate.publishFrame({ version:2, fresh:false });
  stop();
  gate.publishFrame({ version:3 });
  assert.equal(seen.length, 2);
  assert.ok(b.seq > a.seq, "a repeated version is still a new frame");
  assert.equal(gate.currentFrame().version, 3);
});

/* ── the transport feeds the gate and the clock ── */
const current = () => FakeWebSocket.instances.at(-1);
const lastHello = ws => ws.sent.filter(message => message.type === "hello").at(-1);
const frame = (extra = {}) => ({ type:"state", version:1, state:EMPTY_STATE, environment:"local",
  capabilities:{}, build:"build-test", boot:"boot-1", applied:[], you:null, ...extra });

test("the client marks a frame fresh only after the socket settles, and never while catching up", () => {
  const ws = current();
  ws.open();
  ws.receive(frame({ hello:lastHello(ws).payload.nonce, version:1 }));
  assert.equal(gate.currentFrame().fresh, false, "the first state on a socket is a catch-up");
  ws.receive(frame({ version:2, lastAction:"placeWager", state:{ ...EMPTY_STATE, updatedAt:1 } }));
  assert.equal(gate.currentFrame().fresh, true, "a broadcast after that is news");
  assert.equal(gate.currentFrame().lastAction, "placeWager");

  /* back from the background: frames before the probe's answer are catch-up */
  document.hidden = true;
  listeners.document.visibilitychange.forEach(fn => fn());
  ws.receive(frame({ version:3, lastAction:"placeWager" }));
  assert.equal(gate.currentFrame().reason, "hidden");
  document.hidden = false;
  listeners.document.visibilitychange.forEach(fn => fn());
  const probe = lastHello(ws).payload.nonce;
  ws.receive(frame({ version:4, lastAction:"saveResult" }));
  assert.equal(gate.currentFrame().fresh, false);
  assert.equal(gate.currentFrame().reason, "settling");
  ws.receive(frame({ version:4, hello:probe }));
  assert.equal(gate.currentFrame().reason, "resync");
  ws.receive(frame({ version:5, lastAction:"placeWager" }));
  assert.equal(gate.currentFrame().fresh, true, "settled again");

  ws.receive(frame({ version:6, lastAction:"voidWager" }));
  assert.equal(gate.currentFrame().fresh, false);
  assert.equal(gate.currentFrame().correction, true);

  /* a reconnect starts over */
  ws.close();
  mock.timers.tick(600);
  const next = current();
  assert.notEqual(next, ws);
  next.open();
  next.receive(frame({ version:7, lastAction:"placeWager" }));
  assert.equal(gate.currentFrame().reason, "first");
  next.receive(frame({ version:8, lastAction:"placeWager" }));
  assert.equal(gate.currentFrame().fresh, true);
  assert.equal(client.getTournamentSnapshot().connected, true);
});

test("state frames and pongs set the shared clock", () => {
  clock.resetServerClock();
  const moves = [];
  const stop = clock.onServerClock(offset => moves.push(offset));
  const ws = current();
  ws.receive(frame({ version:9, serverNow:Date.now() + 4000 }));
  assert.equal(clock.serverOffset(), 4000);
  ws.receive({ type:"pong", serverNow:Date.now() + 4500 });
  assert.equal(clock.serverOffset(), 4500, "the largest lower bound wins");
  ws.receive({ type:"pong", serverNow:Date.now() + 4200 });
  assert.equal(clock.serverOffset(), 4500);
  stop();
  assert.deepEqual(moves, [4000, 4500], "listeners hear only real moves");
  assert.equal(clock.serverPhase(2000, 10_500), 500);
  assert.equal(clock.serverPhase(2000, -500), 1500);
  assert.equal(clock.serverPhase(0, 10), 0);
  clock.resetServerClock();
});

test("the tv module keeps its clock import working", async () => {
  const tv = await import("../src/features/tv/serverClock.js");
  assert.equal(tv.serverNow, clock.serverNow);
  assert.equal(tv.noteServerTime, clock.noteServerTime);
});

/* ── the Durable Object stamps its send time ── */
const memoryContext = () => {
  const entries = new Map(), sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of [key].flat()) entries.delete(item); },
    async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix))); },
    async transaction(fn) { return fn(storage); },
  };
  return { sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage } };
};

test("every state frame and pong carries the server's send time", async () => {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  let attachment = null;
  const ws = { frames:[], send(raw) { ws.frames.push(JSON.parse(raw)); },
    serializeAttachment(v) { attachment = structuredClone(v); }, deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  const deviceId = "device-motion-7f1c2a9e-0000-4000-8000-000000000001";
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", payload:{ view:"app", nonce:1 }, deviceId }));
  const state = ws.frames.find(item => item.type === "state");
  assert.equal(state.serverNow, Date.now());
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"ping", deviceId }));
  assert.deepEqual(ws.frames.at(-1), { type:"pong", serverNow:Date.now() });
});

/* ── motion math ── */

test("counts step only through values that can exist, and land exactly", () => {
  assert.equal(motion.countValueAt(1000, 1400, 0), 1000);
  assert.equal(motion.countValueAt(1000, 1400, 1), 1400);
  assert.equal(motion.countValueAt(1000, 1400, 2), 1400);
  for (let p = 0; p <= 1; p += 0.05) {
    const v = motion.countValueAt(2300, 1800, p);
    assert.equal(v % PT, 0, `p=${p}`);
    assert.ok(v <= 2300 && v >= 1800);
  }
  const poker = motion.countValueAt(0, 2875, 0.5, 25);
  assert.equal(poker % 25, 0, "poker counts step in 25s");
  assert.equal(motion.signedChips(400), "+400");
  assert.equal(motion.signedChips(-1500), "−1,500");
  assert.equal(motion.signedChips(0), "0");
});

test("a value change is fresh only from a new, recent, fresh frame for the same subject", () => {
  const frame = { seq:5, fresh:true, at:1000 };
  const committed = { value:1000, key:"A", frameSeq:4, changeId:2, from:900, to:1000 };
  const step = input => motion.freshChangeStep(committed, { frame, now:1100, ...input });
  assert.deepEqual(motion.freshChangeStep(null, { value:1, frame, now:1100 }),
    { fresh:false, changeId:0, from:1, to:1 }, "first mount");
  assert.deepEqual(step({ value:1400, key:"A" }), { fresh:true, changeId:3, from:1000, to:1400 });
  assert.equal(step({ value:1400, key:"B" }).fresh, false, "another subject");
  assert.equal(step({ value:1000, key:"A" }).fresh, false, "unchanged");
  assert.equal(step({ value:1400, key:"A", frame:{ ...frame, fresh:false } }).fresh, false, "catch-up frame");
  assert.equal(step({ value:1400, key:"A", frame:{ ...frame, seq:4 } }).fresh, false, "a local change");
  assert.equal(step({ value:1400, key:"A", now:1000 + motion.FRESH_WINDOW_MS + 1 }).fresh, false, "too late");
});

test("a flight arcs from rect to rect and lands at the target's size", () => {
  const from = { left:0, top:600, width:40, height:40 };
  const to = { left:200, top:780, width:20, height:20 };
  const frames = motion.flightKeyframes(from, to, { arc:60 });
  assert.equal(frames[0].offset, 0);
  assert.equal(frames.at(-1).offset, 1);
  assert.equal(frames[0].transform, "translate(0.00px, 0.00px) scale(1.0000)");
  assert.equal(frames.at(-1).transform, "translate(190.00px, 170.00px) scale(0.5000)");
  const mid = frames[Math.floor(frames.length / 2)].transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
  const straight = frames.map(f => f.transform);
  const flat = motion.flightKeyframes(from, to, { arc:0 })[Math.floor(frames.length / 2)].transform.match(/, ([-\d.]+)px/);
  assert.ok(Number(mid[2]) < Number(flat[1]), "the arc lifts the middle of the path");
  assert.equal(new Set(straight).size, straight.length);
  assert.ok(motion.flightKeyframes(from, to, { fade:true }).at(-1).opacity === 0);
  assert.equal(motion.rectVisible({ left:10, top:10, width:0, height:10 }, { width:390, height:844 }), false);
  assert.equal(motion.rectVisible({ left:-50, top:10, width:40, height:10 }, { width:390, height:844 }), false);
  assert.equal(motion.rectVisible({ left:380, top:830, width:40, height:40 }, { width:390, height:844 }), true);
});

test("fly resolves false at once when it cannot fly", async () => {
  assert.equal(await motion.fly(null, "tab:home"), false);
  assert.equal(await motion.fly({ left:0, top:0, width:10, height:10 }, "tab:nowhere"), false);
  const el = { isConnected:true, getBoundingClientRect:() => ({ left:0, top:0, width:10, height:10 }) };
  const release = motion.registerFlightTarget("tab:test", el);
  globalThis.window.innerWidth = 390; globalThis.window.innerHeight = 844;
  assert.equal(motion.flightTarget("tab:test"), el);
  release();
  assert.equal(motion.flightTarget("tab:test"), null);
});

test("the easing curves match their CSS and the tokens match motion.css", () => {
  const out = motion.easeFn.out;
  assert.equal(out(0), 0);
  assert.equal(out(1), 1);
  assert.ok(out(0.5) > 0.8, "ease-out is front-loaded");
  const land = motion.cubicBezier(0.3, 0.7, 0.35, 1.25);
  assert.ok([0.6, 0.7, 0.8].some(x => land(x) > 1), "ease-land overshoots");
  const css = read("src/ui/motion.css");
  const token = name => css.match(new RegExp(`--${name}:([^;]+);`))?.[1].trim();
  assert.equal(token("motion-beat"), `${motion.MOTION.beat}ms`);
  assert.equal(token("motion-count"), `${motion.MOTION.count}ms`);
  assert.equal(token("motion-delta"), `${motion.MOTION.delta}ms`);
  assert.equal(token("motion-flight"), `${motion.MOTION.flight}ms`);
  assert.equal(token("motion-settle"), `${motion.MOTION.settleHold}ms`);
  assert.equal(token("motion-sheet-out"), `${motion.MOTION.sheetOut}ms`);
  for (const [name, value] of Object.entries(motion.EASE)) assert.equal(token(`ease-${name}`), value);
  assert.equal(motion.MOTION.settleHold, 2400);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "no raw hex in motion.css");
});

/* ── heartbeat ── */

test("every beat is phased from the server clock, not its own mount time", () => {
  /* a beat mounted at timeline 5,000 on a phone whose server phase is 700 */
  assert.equal(motion.beatStartTime(5000, 700), 4300);
  assert.equal((5000 - motion.beatStartTime(5000, 700)) % motion.MOTION.beat, 700);
  assert.ok(motion.BEAT_ANIMATIONS.has("fd-beat-dot"));
  const css = read("src/ui/motion.css");
  for (const name of motion.BEAT_ANIMATIONS) assert.match(css, new RegExp(`@keyframes ${name} `));
  assert.match(css, /data-fd-link=down\] \.fd-beat-dot \{ background:transparent/, "a down link hollows the dot");
  assert.equal(motion.linkState({ loaded:false, connected:false }), "wait");
  assert.equal(motion.linkState({ loaded:true, connected:false }), "down");
  assert.equal(motion.linkState({ loaded:true, connected:true }), "live");
});

test("the live indicators share the one beat", () => {
  assert.match(read("src/ui/AppChrome.jsx"), /fd-connection[^\n]*fd-beat-dot/);
  assert.match(read("src/ui/AppChrome.jsx"), /fd-live-label\$\{wagerMarketOpen \? " fd-beat-fill"/);
  assert.match(read("src/ui/AppChrome.jsx"), /fd-nav-badge fd-beat/);
  assert.match(read("src/features/standings/Standings.jsx"), /fd-now-status"><i className="fd-beat-dot"/);
  assert.match(read("src/features/tv/tv.css"), /\.tv-status\.is-live i \{[^}]*animation:fd-beat-dot/);
  assert.doesNotMatch(read("src/features/tv/tv.css"), /si-pulse/);
  assert.match(read("src/features/tv/TVMode.jsx"), /upNow && <i className="fd-beat-dot tv-beat"/);
});

/* ── HX: the iOS tap tick ── */
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_OS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

test("the tick gate: iPhone and iPad only, never the TV, and only the device toggle mutes it", () => {
  const phone = { userAgent:IPHONE, optedOut:false, tv:false };
  assert.equal(haptics.tickAllowed(phone), true);
  assert.equal(haptics.tickAllowed({ ...phone, reducedMotion:true }), true, "a tick is not motion");
  assert.equal(haptics.tickAllowed({ ...phone, optedOut:true }), false);
  assert.equal(haptics.tickAllowed({ ...phone, tv:true }), false);
  assert.equal(haptics.tickAllowed({ ...phone, userAgent:IPAD_OS, maxTouchPoints:5 }), true, "iPadOS");
  assert.equal(haptics.tickAllowed({ ...phone, userAgent:IPAD_OS, maxTouchPoints:0 }), false, "a Mac");
  assert.equal(haptics.tickAllowed({ ...phone, userAgent:ANDROID }), false, "no new Android path");
  assert.equal(haptics.tickAllowed({ ...phone, userAgent:DESKTOP }), false);
  assert.equal(haptics.hapticsToggleAvailable({ userAgent:IPHONE, tv:false }), true);
  assert.equal(haptics.hapticsToggleAvailable({ userAgent:DESKTOP, canVibrate:true, tv:false }), false);
  assert.equal(haptics.HAPTICS_KEY, haptics.VIBRATION_KEY, "existing opt-outs carry over");
});

function tickDocument() {
  const made = [], clicks = [];
  const element = tag => {
    const el = { tag, children:[], attributes:{}, style:{}, listeners:{}, parent:null,
      setAttribute(k, v) { el.attributes[k] = v; }, appendChild(child) { child.parent = el; el.children.push(child); },
      addEventListener(type, fn) { el.listeners[type] = fn; },
      remove() { if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el); el.parent = null; },
      click() { clicks.push(el); const input = el.children[0]; if (input) input.checked = !input.checked; } };
    made.push(el);
    return el;
  };
  const head = element("head");
  return { doc:{ head, createElement:element }, head, made, clicks };
}
function withEnv({ userAgent, pathname = "/", optedOut = false }, fn) {
  const saved = { navigator:globalThis.navigator, document:globalThis.document, window:globalThis.window,
    localStorage:globalThis.localStorage };
  const fake = tickDocument();
  const store = storageArea();
  if (optedOut) store.setItem(haptics.VIBRATION_KEY, "off");
  Object.defineProperty(globalThis, "navigator", { value:{ userAgent, maxTouchPoints:5 }, configurable:true, writable:true });
  globalThis.document = fake.doc;
  globalThis.window = { matchMedia:() => ({ matches:false }), location:{ pathname, search:"" } };
  globalThis.localStorage = store;
  try { return fn(fake); } finally {
    Object.defineProperty(globalThis, "navigator", { value:saved.navigator, configurable:true, writable:true });
    Object.assign(globalThis, { document:saved.document, window:saved.window, localStorage:saved.localStorage });
  }
}

test("tapTick toggles a hidden switch through its label and leaves nothing behind", () => {
  withEnv({ userAgent:IPHONE }, fake => {
    assert.equal(haptics.tapTick(), true);
    const label = fake.clicks[0];
    assert.equal(label.tag, "label");
    assert.equal(label.attributes["aria-hidden"], "true");
    assert.equal(label.style.display, "none");
    const input = label.children[0];
    assert.equal(input.type, "checkbox");
    assert.equal(input.attributes.switch, "");
    assert.equal(input.tabIndex, -1);
    assert.equal(typeof label.listeners.click, "function", "its click stops at the label");
    assert.equal(fake.head.children.length, 0, "removed at once");
  });
  for (const env of [{ userAgent:ANDROID }, { userAgent:DESKTOP }, { userAgent:IPHONE, pathname:"/tv" },
    { userAgent:IPHONE, optedOut:true }])
    withEnv(env, fake => {
      assert.equal(haptics.tapTick(), false, JSON.stringify(env));
      assert.equal(fake.clicks.length, 0);
    });
  haptics.setHapticSurface("tv");
  withEnv({ userAgent:IPHONE }, fake => { assert.equal(haptics.tapTick(), false); assert.equal(fake.clicks.length, 0); });
  haptics.setHapticSurface("phone");
});

test("the tick is wired into the user's own taps and never the Quick Draw reaction", () => {
  const src = path => read(path);
  assert.match(src("src/features/wagers/Wagers.jsx"), /queueRef\.current\.length < PLACE_QUEUE\) \{\s*tapTick\(\);[\s\S]*\/\* the iOS tick belongs to the tap itself[^*]*\*\/\s*if \(!queuedTap\) tapTick\(\);/);
  assert.match(src("src/features/wagers/Wagers.jsx"), /onClick=\{\(\) => \{ tapTick\(\); setDenom\(value\); \}\}/);
  assert.match(src("src/features/draft/DraftSheet.jsx"), /if \(!canPick \|\| saving\.current\) return;\s*tapTick\(\);/);
  assert.match(src("src/features/duels/DuelCard.jsx"), /if \(action === "accept"\) tapTick\(\);/);
  assert.match(src("src/features/profile/PlayerSheet.jsx"), /ante > anteMax\) return;\s*tapTick\(\);/);
  assert.match(src("src/features/weekend/ContestPanel.jsx"), /const submit = payload => async \(\) => \{[^}]*tapTick\(\);/);
  assert.match(src("src/features/director/DirectorPill.jsx"), /onPick=\{\(\) => \{ if \(side\.run && !busy\.current\) tapTick\(\);/);
  const quickDraw = src("src/features/duels/QuickDraw.jsx");
  assert.equal(quickDraw.match(/tapTick\(\)/g).length, 1, "one call site in Quick Draw");
  assert.match(quickDraw, /if \(key === "accept" \|\| key === "rematch"\) tapTick\(\);/);
  for (const path of ["src/App.jsx", "src/features/home/guestUpdates.js"])
    assert.doesNotMatch(src(path), /tapTick/, `${path}: never on remote events`);
});
