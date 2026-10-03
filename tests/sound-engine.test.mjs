import test, { mock } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* A1 to A8: the sound engine's pure gates (fresh, hush including the
   walkout contract and Quick Draw, TV vs phone routing, the density
   limiter, schedule math from serverNow and outputLatency, the phase room
   table, the toggle), the live engine against a recording fake
   AudioContext, the TV's and phone's cue models against real reducer
   states, and a scan that nothing outside the sound module touches Web
   Audio. The recipes themselves render in headless Chrome through the
   preview's self-test (dev/sound-preview.html?selftest). */
globalThis.__FD_BUILD_ID__ = "build-test";
const storageArea = () => {
  const values = new Map();
  return { getItem:k => values.has(k) ? values.get(k) : null, setItem:(k, v) => values.set(k, String(v)),
    removeItem:k => values.delete(k) };
};
globalThis.localStorage = storageArea();
Object.defineProperty(globalThis, "navigator", { value:{ userAgent:"test", audioSession:{ type:"auto" } }, configurable:true, writable:true });
mock.timers.enable({ apis:["setTimeout", "Date"], now:1_900_000_000_000 });

const { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest } = await import("../shared/core.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const kit = await import("../src/lib/soundKit.js");
const sound = await import("../src/lib/sound.js");
const gate = await import("../src/lib/frameGate.js");
const clock = await import("../src/lib/serverClock.js");
const { PHASES, weekendPhase } = await import("../src/ui/phase.js");
const room = await import("../src/features/tv/roomSound.js");
const phone = await import("../src/features/home/phoneSound.js");
const { ADVANCE_TIMING, CROWN_TIMING } = await import("../src/features/tv/tvMotion.js");
const { DRAW_INTRO_MS, drawStepDelay, revealTimeline } = await import("../src/features/weekend/drawReveal.js");
const { BOARD_BEATS } = await import("../src/features/standings/boardModel.js");

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ── a recording AudioContext ── */
class FakeParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); }
  exponentialRampToValueAtTime(v, t) { this.events.push(["exp", v, t]); }
  cancelScheduledValues(t) { this.events.push(["cancel", t]); }
  setTargetAtTime(v, t) { this.events.push(["target", v, t]); }
}
class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.type = ""; this.buffer = null;
    for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"])
      this[name] = new FakeParam(name === "gain" ? 1 : 0);
  }
  connect(node) { return node; }
  disconnect() { this.disconnected = (this.disconnected || 0) + 1; }
  start(t = 0) { this.ctx.starts.push({ kind:this.kind, t }); }
  stop() {}
}
function fakeContext({ autoplay = true } = {}) {
  const made = [];
  class Ctx {
    constructor(options) {
      this.options = options; this.state = "suspended"; this.currentTime = 10; this.sampleRate = 8000;
      this.outputLatency = 0.05; this.destination = {}; this.starts = []; this.resumes = 0; made.push(this);
    }
    node(kind) { const n = new FakeNode(this, kind); (this.nodes ||= []).push(n); return n; }
    createGain() { return this.node("gain"); }
    createBiquadFilter() { return this.node("filter"); }
    createDynamicsCompressor() { return this.node("comp"); }
    createConvolver() { return this.node("conv"); }
    createStereoPanner() { return this.node("pan"); }
    createOscillator() { return this.node("osc"); }
    createBufferSource() { return this.node("src"); }
    createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; }
    resume() {
      this.resumes++;
      if (autoplay) { this.state = "running"; this.onstatechange?.(); }
      return Promise.resolve();
    }
    close() { this.state = "closed"; }
  }
  return { Ctx, made };
}
const fresh = (ms = 0) => gate.publishFrame({ version:1, fresh:true, lastAction:"placeWager", at:Date.now() - ms });
const quiet = () => gate.publishFrame({ version:1, fresh:false, reason:"first", at:Date.now() });
function engineFor(surface = "phone", options) {
  const fake = fakeContext(options);
  sound.__resetSoundEngine({ factory:fake.Ctx });
  sound.setSoundSurface(surface);
  localStorage.removeItem(sound.SOUND_KEY);
  return fake;
}
const earliest = ctx => Math.min(...ctx.starts.map(item => item.t));

/* ── pure gates ── */

test("A6 hush: a walkout ducks until its `until`, Quick Draw mutes while armed", () => {
  const now = 5_000;
  assert.equal(sound.walkoutActive({ player:"Evan", trackId:"t", startedAt:1_000, until:6_000 }, now), true);
  assert.equal(sound.walkoutActive({ player:"Evan", until:5_000 }, now), false, "until is exclusive");
  assert.equal(sound.walkoutActive({ player:"Evan", until:4_999 }, now), false);
  assert.equal(sound.walkoutActive(null, now), false);
  assert.equal(sound.walkoutActive({ player:"Evan" }, now), false, "no until, no hush");
  assert.equal(sound.walkoutActive("yes", now), false);
  assert.equal(sound.hushReason({ walkout:{ until:9_000 }, now }), "walkout");
  assert.equal(sound.hushReason({ quickDraw:true, now }), "quickDraw");
  assert.equal(sound.hushReason({ walkout:{ until:1 }, quickDraw:false, now }), null);
});

test("routing: the room bus speaks only on the TV, you and gm only on a phone", () => {
  assert.equal(sound.busAllowed("room", "tv"), true);
  assert.equal(sound.busAllowed("room", "phone"), false);
  assert.equal(sound.busAllowed("you", "phone"), true);
  assert.equal(sound.busAllowed("gm", "phone"), true);
  assert.equal(sound.busAllowed("you", "tv"), false);
  assert.equal(sound.busAllowed("gm", "tv"), false);
  assert.equal(sound.busAllowed("bogus", "phone"), false);
});

test("schedule math: server time to the audio clock, early by the output latency; late cues drop", () => {
  const at = sound.scheduleTime({ at:11_000, now:10_000, currentTime:3, outputLatency:0.12 });
  assert.ok(Math.abs(at - (3 + 1 - 0.12)) < 1e-9);
  assert.equal(sound.scheduleTime({ at:10_000, now:10_000, currentTime:3, outputLatency:0 }), 3.005, "never in the past");
  assert.equal(sound.scheduleTime({ at:9_800, now:10_000, currentTime:3 }), 3.005, "a little late still plays at once");
  assert.equal(sound.scheduleTime({ at:9_600, now:10_000, currentTime:3 }), null, "past LATE_MS: silent");
  assert.equal(sound.scheduleTime({ at:NaN, now:10_000, currentTime:3 }), null);
  assert.equal(sound.LATE_MS, 300);
});

test("fresh gate: only a fresh frame that just arrived may sound a remote moment", () => {
  const now = 50_000;
  assert.equal(sound.freshFrameNow({ fresh:true, at:now - 200 }, now), true);
  assert.equal(sound.freshFrameNow({ fresh:true, at:now - 2_000 }, now), false, "a later re-render is not news");
  assert.equal(sound.freshFrameNow({ fresh:false, at:now }, now), false);
  assert.equal(sound.freshFrameNow(null, now), false);
  assert.deepEqual(room.roomStep(null, {}, { fresh:true }), [], "a first snapshot (a TV joining late) owes nothing");
  assert.deepEqual(room.roomStep({}, {}, { fresh:false }), [], "a reconnect or a correction owes nothing");
  assert.deepEqual(phone.phoneStep(null, {}, { fresh:true }), []);
});

test("A8: the room table follows weekendPhase, dry Friday to the finale's long tail", () => {
  for (const phase of PHASES) assert.ok(kit.ROOMS[phase], phase);
  assert.equal(kit.roomKeyFor("nope"), "fri");
  assert.equal(kit.roomForPhase(undefined), kit.ROOMS.fri);
  assert.equal(weekendPhase({ ...structuredClone(EMPTY_STATE), live:false }, []), "fri");
  assert.equal(kit.roomForPhase(weekendPhase({ ...structuredClone(EMPTY_STATE), frozen:true }, [])), kit.ROOMS.fin);
  assert.ok(kit.ROOMS.fin.len > kit.ROOMS.san.len && kit.ROOMS.san.len > kit.ROOMS.fri.len);
  assert.ok(kit.ROOMS.san.tone < kit.ROOMS.fri.tone, "night is warmer");
  assert.equal(kit.wetLevel("san", "phone"), kit.ROOMS.san.wet * kit.PHONE_WET, "a phone speaker is drier");
  assert.equal(kit.highpassFor("phone"), 380);
  assert.equal(kit.highpassFor("tv"), 25);
});

test("the kit: all 26 recipes and the sequence parts, each with a playable recipe", () => {
  assert.deepEqual(kit.SOUND_IDS, Array.from({ length:26 }, (_, i) => `S${i + 1}`));
  for (const id of [...kit.SOUND_IDS, "ride", "land", "upNow", "stepDown", "crownCount", "crownCall", "crowd"]) {
    assert.equal(kit.isSound(id), true, id);
    assert.equal(typeof kit.SOUNDS[id].play, "function");
  }
  assert.equal(kit.isSound("S27"), false);
});

test("TV density rule: a crowd is one riffle, otherwise one clack per 120 ms", () => {
  const batch = kit.roomChips([{ at:0, pan:-1 }, { at:50, pan:1 }, { at:100, pan:1 }, { at:900, pan:1 }, { at:950, pan:1 }]);
  assert.equal(batch[0].kind, "riffle");
  assert.equal(batch[0].merged, 3);
  assert.deepEqual(batch.slice(1).map(item => item.kind), ["clack", "skip"]);
  let memory = null;
  const live = [];
  for (const at of [0, 60, 300, 700, 720, 760, 790]) {
    const step = kit.limitChips(memory, [{ at, pan:0.5 }]);
    memory = step.memory;
    live.push(...step.plan.map(item => item.kind));
  }
  assert.deepEqual(live, ["clack", "skip", "riffle", "clack", "skip", "riffle", "skip"],
    "the third inside 400 ms turns into a riffle; clacks keep 120 ms apart; a crowd swallows its tail");
});

test("the Sound toggle: on by default, stored as si-sound=off, silences everything", () => {
  const fake = engineFor("phone");
  assert.equal(sound.soundOptedOut(), false);
  sound.unlockSound();
  assert.ok(sound.playSound("S5"));
  sound.setSoundOptOut(true);
  assert.equal(localStorage.getItem("si-sound"), "off");
  assert.equal(sound.soundOptedOut(), true);
  const before = fake.made[0].starts.length;
  assert.equal(sound.playSound("S5"), null);
  assert.equal(sound.unlockSound(), false);
  assert.equal(fake.made[0].starts.length, before);
  sound.setSoundOptOut(false);
  assert.equal(localStorage.getItem("si-sound"), null);
});

/* ── the live engine ── */

test("A1: one lazy context, playback on a phone (through the silent switch), created and resumed in the user's tap", () => {
  const fake = engineFor("phone");
  navigator.audioSession.type = "auto";
  assert.equal(sound.playSound("S5"), null, "nothing plays before the first tap");
  assert.equal(fake.made.length, 0, "and nothing is created by a remote moment");
  sound.unlockSound();
  assert.equal(fake.made.length, 1);
  assert.equal(navigator.audioSession.type, "playback", "set before the context existed");
  sound.setPreviewSession(true);
  sound.setPreviewSession(false);
  assert.equal(navigator.audioSession.type, "playback", "a song preview stopping never flips the phone to ambient");
  assert.equal(fake.made[0].state, "running");
  sound.unlockSound();
  assert.equal(fake.made.length, 1, "one context for the whole app");
  assert.equal(fake.made[0].options.latencyHint, "interactive");
});

test("A1: a tap sound lands now; a room cue lands on the server's time minus output latency", () => {
  const fake = engineFor("phone");
  sound.unlockSound();
  const ctx = fake.made[0];
  ctx.starts.length = 0;
  assert.ok(sound.playSound("S5", { bus:"you" }));
  assert.equal(earliest(ctx), 10.005);
  assert.equal(sound.cueAt("S2", Date.now() + 1000), null, "the room never sounds on a phone");

  const tv = engineFor("tv");
  navigator.audioSession.type = "auto";
  sound.primeSound();
  const tctx = tv.made[0];
  assert.equal(navigator.audioSession.type, "auto", "untouched on the TV");
  sound.setPreviewSession(true);
  assert.equal(navigator.audioSession.type, "auto", "the TV keeps the default session");
  assert.equal(sound.playSound("S5", { bus:"you" }), null, "a phone's own sound never plays on the TV");
  clock.resetServerClock();
  clock.noteServerTime(Date.now() + 5_000, Date.now());
  const serverAt = clock.serverNow() + 1_000;
  assert.ok(sound.cueAt("S2", serverAt));
  assert.equal(tctx.starts.length, 0, "a cue further out waits on a timer");
  mock.timers.tick(750);
  assert.ok(tctx.starts.length > 0);
  assert.ok(Math.abs(earliest(tctx) - (10 + 0.25 - 0.05)) < 1e-6, `landed at ${earliest(tctx)}`);
  assert.equal(sound.cueAt("S14", clock.serverNow() - 400), null, "a TV joining late is silent");
  clock.resetServerClock();
});

test("the TV's Sound early by: the room bus lands that much sooner; phones and late cues unaffected", () => {
  assert.equal(sound.clampEarlyMs(123), 120);
  assert.equal(sound.clampEarlyMs(999), sound.TV_EARLY_MAX_MS);
  assert.equal(sound.clampEarlyMs(-40), 0);
  assert.equal(sound.clampEarlyMs("x"), 0);
  assert.equal(sound.soundEarlyMs(), 0, "off by default");
  assert.equal(sound.setSoundEarlyMs(130), 130);
  assert.equal(localStorage.getItem(sound.TV_EARLY_KEY), "130");
  assert.equal(sound.soundEarlyMs(), 130);

  const tv = engineFor("tv");
  sound.primeSound();
  const ctx = tv.made[0];
  ctx.starts.length = 0;
  assert.ok(sound.cueAt("S2", Date.now() + 1_000));
  mock.timers.tick(1_000 - 250 - 130 - 1);
  assert.equal(ctx.starts.length, 0, "still waiting");
  mock.timers.tick(2);
  assert.ok(ctx.starts.length > 0, "scheduled 130 ms sooner than the cue's own time");
  ctx.starts.length = 0;
  assert.ok(Math.abs(earliest((sound.cueAt("S3", Date.now() + 200), ctx)) - (10 + 0.2 - 0.13 - 0.05)) < 1e-6,
    "lands early by the setting on the audio clock");
  sound.setSoundEarlyMs(400);
  assert.ok(sound.cueAt("S3", Date.now()), "a cue due now is not dropped as late at the largest setting");
  assert.equal(sound.cueAt("S3", Date.now() - 400), null, "a cue already late still drops");

  const phone = engineFor("phone");
  sound.unlockSound();
  const pctx = phone.made[0];
  pctx.starts.length = 0;
  assert.ok(sound.playSound("S5", { bus:"you", delayMs:500 }));
  mock.timers.tick(249);
  assert.equal(pctx.starts.length, 0, "the phone's own sounds never move");
  mock.timers.tick(2);
  assert.ok(pctx.starts.length > 0);
  sound.setSoundEarlyMs(0);
  assert.equal(localStorage.getItem(sound.TV_EARLY_KEY), null);
});

test("the commissioner's TV check: a TV reports on only while its context runs", () => {
  const tv = engineFor("tv", { autoplay:false });
  assert.equal(sound.tvSoundStatus(), "blocked", "no context yet");
  sound.primeSound();
  assert.equal(sound.tvSoundStatus(), "blocked", "waiting for a click");
  tv.made[0].state = "running";
  assert.equal(sound.tvSoundStatus(), "on");
  sound.setSoundOptOut(true);
  assert.equal(sound.tvSoundStatus(), "blocked", "Sound off reads as off");
  sound.setSoundOptOut(false);
});

test("A1: several screens noticing the same moment play it once (key)", () => {
  const fake = engineFor("phone");
  sound.unlockSound();
  assert.ok(sound.playSound("S4", { key:"card:d1" }));
  assert.equal(sound.playSound("S4", { key:"card:d1" }), null);
  assert.ok(sound.playSound("S4", { key:"card:d2" }));
  assert.ok(fake.made[0].starts.length > 0);
});

test("A6: the walkout contract ducks the room to 25% under the song, and opens again at until", () => {
  const fake = engineFor("tv");
  sound.primeSound();
  const ctx = fake.made[0];
  const engine = sound.__soundEngine();
  const walkout = { player:"Evan", trackId:"4uLU6hMCjMI75M1A2tKUQC", startedAt:Date.now(), until:Date.now() + 5_000 };
  const later = sound.cueAt("S3", Date.now() + 2_000);
  assert.ok(later, "scheduled before the walkout starts");
  sound.setWalkout(walkout);
  assert.equal(sound.isHushed(), true);
  assert.equal(sound.isMuted(), false, "a win song ducks, it never mutes");
  const ramp = engine.E.hush.gain.events.filter(e => e[0] === "ramp").at(-1);
  assert.deepEqual([ramp[1], Math.round((ramp[2] - ctx.currentTime) * 1000)], [sound.WALKOUT_DUCK, 150], "ducks over 150 ms");
  assert.equal(sound.WALKOUT_DUCK, 0.25);
  assert.ok(sound.cueAt("S2", Date.now()), "the room still sounds under the song");
  ctx.starts.length = 0;
  mock.timers.tick(2_000);
  assert.ok(ctx.starts.length > 0, "a cue that comes due during the walkout plays, ducked");
  mock.timers.tick(3_100);
  assert.equal(sound.isHushed(), false, "until passed: open again without another write");
  assert.equal(engine.E.hush.gain.events.filter(e => e[0] === "ramp").at(-1)[1], 1);
  assert.ok(sound.cueAt("S2", Date.now()));
  sound.setWalkout({ ...walkout, until:Date.now() + 60_000 });
  sound.setWalkout(null);
  assert.equal(sound.isHushed(), false, "a stop clears it at once");
});

test("A2: a voice's nodes are disconnected once its last source ends; the engine's own stay", () => {
  const fake = fakeContext();
  const ctx = new fake.Ctx({});
  const E = kit.makeEngine(ctx, { room:"san", listen:"tv" });
  const engineNodes = ctx.nodes.length;
  for (const id of kit.SOUND_IDS) {
    ctx.nodes.length = engineNodes;
    assert.ok(kit.playRecipe(E, id, 10));
    const made = ctx.nodes.slice(engineNodes);
    const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, id);
    assert.ok(sources.every(n => typeof n.onended === "function"), `${id}: every source reports its end`);
    assert.ok(made.every(n => !n.disconnected), `${id}: nothing is cut while it rings`);
    sources.slice(0, -1).forEach(n => n.onended());
    assert.ok(made.every(n => !n.disconnected), `${id}: held until the last source ends`);
    sources.at(-1).onended();
    assert.ok(made.every(n => n.disconnected === 1), `${id}: every voice node released once`);
    assert.ok(ctx.nodes.slice(0, engineNodes).every(n => !n.disconnected), `${id}: the master, hush and reverb stay`);
  }
  assert.equal(E.graph, undefined, "no graph left open between recipes");
});

test("A4: Quick Draw is silent from armed until the reaction is captured", () => {
  engineFor("phone");
  sound.unlockSound();
  sound.setQuickDrawHush(true);
  assert.equal(sound.playSound("S16"), null);
  assert.equal(sound.__soundEngine().E.hush.gain.events.filter(e => e[0] === "ramp").at(-1)[1], 0, "a full mute");
  /* a win song starting during Quick Draw never lifts the mute to a duck */
  sound.setWalkout({ player:"Evan", until:Date.now() + 5_000 });
  assert.equal(sound.hushReason({ walkout:{ until:Date.now() + 5_000 }, quickDraw:true }), "quickDraw");
  assert.equal(sound.isMuted(), true);
  assert.equal(sound.playSound("S16"), null);
  sound.setWalkout(null);
  sound.setQuickDrawHush(false);
  assert.ok(sound.playSound("S16"));
});

test("A3: TV board chips go through the density rule", () => {
  const fake = engineFor("tv");
  sound.primeSound();
  const plan = sound.roomChipsLanded([{ at:Date.now(), pan:-0.5 }, { at:Date.now() + 40, pan:0.5 }, { at:Date.now() + 80, pan:0.5 }]);
  assert.deepEqual(plan.map(item => item.kind), ["clack", "skip", "riffle"]);
  assert.ok(fake.made[0].starts.length > 0);
  engineFor("phone");
  assert.deepEqual(sound.roomChipsLanded([{ at:Date.now(), pan:0 }]), [], "never on a phone");
});

test("A5: the TV shows Click for sound only while its context waits for a click", () => {
  /* the component and the engine from one bundle, so they share one engine */
  const bundle = compile(`export { SoundUnlockChip } from "./src/features/tv/SoundUnlockChip.jsx";
    export * from "./src/lib/sound.js";`, "sound-chip");
  const fake = fakeContext({ autoplay:false });
  bundle.__resetSoundEngine({ factory:fake.Ctx });
  bundle.setSoundSurface("tv");
  assert.equal(bundle.soundUnlockNeeded(), false, "no context yet");
  bundle.primeSound();
  assert.equal(fake.made[0].state, "suspended");
  assert.equal(bundle.soundUnlockNeeded(), true);
  const html = renderToStaticMarkup(React.createElement(bundle.SoundUnlockChip));
  assert.match(html, /Click for sound/);
  assert.match(read("src/features/tv/tv-sound.css"), /font:600 26px/, "24px or more on the canvas");
  fake.made[0].state = "running";
  assert.equal(bundle.soundUnlockNeeded(), false);
  assert.equal(renderToStaticMarkup(React.createElement(bundle.SoundUnlockChip)), "");
  bundle.setSoundOptOut(true);
  fake.made[0].state = "suspended";
  assert.equal(bundle.soundUnlockNeeded(), false, "Sound off: no chip");
  bundle.setSoundOptOut(false);
  engineFor("phone", { autoplay:false });
  sound.unlockSound();
  assert.equal(sound.soundUnlockNeeded(), false, "phones never show it");
  assert.equal(sound.tvKioskCommand("https://fielddayseries.com/"),
    "chrome --kiosk --autoplay-policy=no-user-gesture-required https://fielddayseries.com/tv");
  assert.equal(sound.TV_KIOSK_COMMAND, sound.tvKioskCommand());
});

function compile(contents, name) {
  const compiled = buildSync({ stdin:{ contents, resolveDir:root, loader:"jsx" }, bundle:true, platform:"node",
    format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const bundle = new Module(fileURLToPath(new URL(`${name}.cjs`, import.meta.url)));
  bundle.filename = bundle.id;
  bundle.paths = Module._nodeModulePaths(root);
  bundle._compile(compiled.outputFiles[0].text, bundle.filename);
  return bundle.exports;
}

/* ── the TV's cue model on real reducer states ── */
let seq = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"sound-gm", actionId:`se-${++seq}` });
const as = player => ({ player, deviceId:`d-${player}`, actionId:`se-${++seq}` });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const evOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const snap = (state, extra = {}) => room.roomSnapshot(state, allEventsOf(state),
  { standings:computeStandings(state), liveEv:state.onDeck ? evOf(state, state.onDeck) : evOf(state, "8ball"), ...extra });

test("A3: announce and draw: S2 at announcedAt, then one S3 per card on the room's clock, panned", () => {
  const state = structuredClone(EMPTY_STATE);
  const before = snap(state);
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const after = snap(state);
  const now = Date.now();
  const cues = room.roomCues(before, after, { now });
  const at = state.eventOps["8ball"].announcedAt;
  assert.deepEqual(cues.find(cue => cue.id === "S2"), { id:"S2", at, key:`intro:8ball:${at}` });
  const ticks = cues.filter(cue => cue.id === "S3");
  const reveal = after.reveals["8ball"];
  assert.equal(ticks.length, reveal.total);
  assert.equal(reveal.revealAt, revealTimeline(state, "8ball", { reveal:{ id:reveal.id, evId:"8ball" } }).revealAt);
  assert.equal(ticks[0].at, at + DRAW_INTRO_MS + drawStepDelay(0, reveal.total));
  ticks.forEach((tick, i) => assert.equal(tick.at, reveal.revealAt + drawStepDelay(i, reveal.total)));
  assert.ok(ticks.some(tick => tick.pan < 0) && ticks.some(tick => tick.pan > 0), "cards pan across the canvas");
  const reduced = room.roomCues(before, after, { now, reduced:true }).filter(cue => cue.id === "S3");
  assert.equal(reduced.length, 1, "reduced motion: the whole draw at once, one card sound");
  assert.deepEqual(room.roomCues(after, snap(state), { now }), [], "nothing new, nothing owed");
});

test("A3: chips on the open board, the lock, and a posted result", () => {
  const state = structuredClone(EMPTY_STATE);
  ROSTER.forEach(player => act(state, "adjust", { player, delta:1500, reason:"Test" }));
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const contest = resolveCurrentContest(state, evOf(state, "8ball"));
  const bystander = ROSTER.find(p => !contest.players.includes(p));
  const s0 = snap(state);
  const side = contest.sides[1];
  act(state, "placeWager", { wager:{ eventId:"8ball", contestId:contest.id, contestRevision:contest.revision, stake:200,
    pickPlayers:[...side.players], kind:"match", drawId:contest.drawId, match:[...contest.match], matchName:contest.label,
    teamIdx:side.key, pickTeam:true } }, as(bystander));
  const s1 = snap(state);
  const chip = room.roomCues(s0, s1, { now:5 });
  assert.deepEqual(chip, [{ id:"chip", at:5, pan:0.55 }], "one tap, one chip, on its side of the board");
  act(state, "lockAndStart", { evId:"8ball", contestId:contest.id, contestRevision:contest.revision });
  const s2 = snap(state);
  const lock = room.roomCues(s1, s2, { now:6 });
  assert.equal(lock.filter(cue => cue.id === "S8").length, 1);
  assert.equal(lock.find(cue => cue.id === "S8").at, state.eventOps["8ball"].bettingLockedAt);
  const results = { ...s2.results, "8ball":{ revision:1, at:777 } };
  assert.deepEqual(room.roomCues(s2, { ...s2, results }, { now:9 }).map(cue => [cue.id, cue.at]), [["S14", 777]]);
});

test("A3: lead change, draft pick, deal, bust, opening scene", () => {
  const base = { announced:{}, reveals:{}, locks:{}, results:{}, drafts:{ d1:3 }, chips:null, leader:"Evan",
    frozen:false, poker:null, scene:null };
  const ids = next => room.roomCues(base, { ...base, ...next }, { now:100 }).map(cue => [cue.id, cue.at]);
  assert.deepEqual(ids({ leader:"Sahil" }), [["S15", 100]]);
  assert.deepEqual(ids({ leader:"Sahil", frozen:true }), [], "the crown has its own sequence");
  assert.deepEqual(ids({ drafts:{ d1:4 } }), [["S18", 100 + 520]], "the card slaps as it lands");
  assert.deepEqual(ids({ poker:{ id:"p", ts:5, started:false, outs:0, posted:false } }), [["S20", 100]]);
  const table = { ...base, poker:{ id:"p", ts:5, started:true, outs:1, posted:false } };
  assert.deepEqual(room.roomCues(table, { ...table, poker:{ ...table.poker, outs:2 } }, { now:1 }).map(c => [c.id, c.at]),
    [["S22", 1], ["bustCard", 1 + room.BUST_CARD_LAND_MS]], "the chip spins flat, then the bust card lands");
  assert.deepEqual(room.roomCues(table, { ...table, poker:{ ...table.poker, outs:2 } }, { now:1, reduced:true }).map(c => c.id),
    ["S22"], "reduced motion: the bust alone");
  assert.deepEqual(ids({ scene:{ id:"sc1", kind:"opening", startedAt:90 } }), [["S1", 90]]);
  assert.deepEqual(ids({ frozen:true }), []);
  assert.deepEqual(room.roomCues(base, { ...base, frozen:true }, { now:1, reduced:true }).map(c => c.id), ["S1"],
    "reduced motion: the crown is its call");
});

test("A3: one write, one beat: a rehearsal jump sounds only its newest intro and lock; the crown owns its frame", () => {
  const base = { announced:{}, reveals:{}, locks:{}, results:{}, drafts:{}, chips:null, leader:"Evan",
    frozen:false, poker:null, scene:null };
  const jump = { ...base, announced:{ a:100, b:300, c:200 }, locks:{ a:110, b:310, c:210 },
    results:{ c:{ revision:1, at:250 } } };
  assert.deepEqual(room.roomCues(base, jump, { now:400 }).map(cue => [cue.id, cue.at]),
    [["S2", 300], ["S8", 310], ["S14", 250]]);
  const crowned = { ...jump, frozen:true, leader:"Sahil" };
  assert.deepEqual(room.roomCues(base, crowned, { now:400 }), [], "the crown sequence plays instead");
  assert.deepEqual(room.roomCues(base, crowned, { now:400, reduced:true }).map(cue => cue.id), ["S1"]);
});

test("A3: a decided match on ADVANCE_TIMING; the crown on CROWN_TIMING; reduced motion is one summary sound", () => {
  const advance = { id:"c1", decidedAt:1_000, settle:{ winners:[{}], losers:[{}] } };
  const motion = { anchor:1_000, matches:[{ target:{ r:1, m:0, index:0 } }], hotTo:[1, 0] };
  assert.deepEqual(room.advanceCues(advance, motion).map(cue => [cue.id, cue.at - 1_000]), [
    ["S10", ADVANCE_TIMING.stamp], ["S11", room.SETTLE_SOUND.lose], ["S12", room.SETTLE_SOUND.pay],
    ["ride", ADVANCE_TIMING.ride - 60], ["land", ADVANCE_TIMING.land], ["upNow", ADVANCE_TIMING.upNow]]);
  assert.deepEqual(room.advanceCues({ ...advance, settle:null }).map(cue => cue.id), ["S10"], "a heat: WON only");
  assert.deepEqual(room.advanceCues(advance, motion, { reduced:true }).map(cue => cue.id), ["S10"]);
  /* the produced crown (Backglass, Oct 2): night, the towers, one tower out
     per place from last up to 3rd, the hold, 2nd, the rise, the flood */
  const crown = room.crownCues({ id:"scene:x", anchor:50_000 }, { count:13 });
  const C = CROWN_TIMING;
  const beats = crown.map(cue => [cue.id, cue.at - 50_000]);
  assert.deepEqual(beats.slice(0, 2), [["nightFall", C.night], ["towersUp", C.towers]]);
  const outs = crown.filter(cue => cue.id === "towerOut");
  assert.equal(outs.length, 12, "every tower but the champion's goes dark");
  assert.equal(outs[0].at - 50_000, C.stepDown, "last place first");
  assert.ok(outs.every((cue, i) => i === 0 || cue.at > outs[i - 1].at), "in order, up the board");
  assert.ok(outs[0].pan > outs.at(-1).pan, "panned to each tower across the canvas");
  assert.equal(outs.at(-1).at - 50_000, C.second, "2nd goes dark after the hold");
  assert.ok(outs.at(-2).at - 50_000 < C.holdTwo, "3rd goes before the last two hold");
  assert.deepEqual(beats.slice(-6), [["cascade", C.rise], ["S23", C.flood - 600], ["S24", C.chip], ["S10", C.tag],
    ["crownCount", C.count], ["crownCall", C.lines]]);
  assert.ok(crown.every(cue => cue.open), "over the champion's song: never ducked");
  assert.ok(C.total >= 20_000 && C.total <= 30_000, "a produced crown of about twenty seconds, never a minute of waiting");
  assert.deepEqual(room.crownCues({ id:"x", anchor:1 }, { reduced:true }).map(cue => cue.id), ["S1"]);
  assert.deepEqual(room.sidePans({ sides:[{}, {}] }), [-0.55, 0.55]);
  assert.deepEqual(room.revealPans({ versus:[{}, {}] }), [-0.5, 0.5]);
});

/* ── the phone ── */

test("A4: a phone hears only its own player's lead, challenge and draft turn", () => {
  const me = "Evan";
  const at = (leaders, challenges = [], turn = null, frozen = false) => ({ me, frozen, leaders, challenges, turn });
  assert.deepEqual(phone.phoneCues(at(["Sahil"]), at(["Evan"])).map(c => [c.id, c.delayMs]), [["S15", BOARD_BEATS.leader]]);
  assert.deepEqual(phone.phoneCues(at(["Evan", "Sahil"]), at(["Evan"])).map(c => c.id), ["S15"], "a tie broken your way");
  assert.deepEqual(phone.phoneCues(at(["Evan"]), at(["Sahil"])), [], "losing the lead is silent");
  assert.deepEqual(phone.phoneCues(at(["Ben"]), at(["Sahil"])), [], "someone else's lead is silent");
  assert.deepEqual(phone.phoneCues(at([]), at([], ["d9"])).map(c => c.id), ["S16"]);
  assert.deepEqual(phone.phoneCues(at([], ["d9"]), at([], ["d9"])), []);
  assert.deepEqual(phone.phoneCues(at([]), at([], [], "dr:0:4")).map(c => c.id), ["S19"]);
  assert.deepEqual(phone.phoneCues(at([], [], "dr:0:4"), at([], [], "dr:0:5")), [], "the snake's second pick is not news");
  assert.deepEqual(phone.phoneStep(at(["Sahil"]), at(["Evan"]), { fresh:false }), [], "a catch-up is silent");

  const state = structuredClone(EMPTY_STATE);
  const offer = { status:"open", consent:true, stake:200, ts:Date.now(), runs:{} };
  state.duels = [{ ...offer, id:"x1", from:"Sahil", to:me }, { ...offer, id:"x2", from:"Sahil", to:"Ben" },
    { ...offer, id:"x3", from:"Sahil", to:null, open:true }, { ...offer, id:"x4", from:"Sahil", to:me, ts:Date.now() - 11 * 60_000 }];
  const view = phone.phoneSnapshot(state, computeStandings(state), me);
  assert.deepEqual(view.challenges, ["x1"], "only live challenges addressed to you (not open, not lapsed)");
  assert.deepEqual(view.leaders, [], "a level board has no leader");
});

/* ── nothing else touches Web Audio ── */
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(jsx?|mjs)$/.test(name) ? [path] : [];
});
test("no component calls sound outside the sound module API", () => {
  const files = walk(join(root, "src"));
  const engine = new Set(["src/lib/sound.js", "src/lib/soundKit.js"].map(p => join(root, p)));
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file).replaceAll("\\", "/");
    if (!engine.has(file) && /AudioContext|webkitAudioContext|new Audio\(|createOscillator|soundKit\.js|audioSession/.test(text))
      offenders.push(`${rel}: Web Audio outside the engine`);
    if (/__resetSoundEngine|__soundEngine/.test(text) && !engine.has(file)) offenders.push(`${rel}: test-only engine hooks`);
    if (!rel.startsWith("src/features/tv/") && !engine.has(file) && /bus:\s*"room"|cueAt\(|roomChipsLanded\(/.test(text))
      offenders.push(`${rel}: a room sound outside the TV`);
    if (rel.startsWith("src/features/tv/") && /bus:\s*"(you|gm)"/.test(text)) offenders.push(`${rel}: a phone sound on the TV`);
  }
  assert.deepEqual(offenders, []);
  /* the own-tap sounds ride the same handler as the tap tick */
  const wagers = read("src/features/wagers/Wagers.jsx");
  assert.match(wagers, /tapTick\(\);\s*chipSound\(kind\);/, "a queued tap");
  assert.match(wagers, /if \(!queuedTap\) tapTick\(\);\s*if \(!queuedTap\) chipSound\(kind\);/, "the first tap");
  assert.match(read("src/features/draft/DraftSheet.jsx"), /tapTick\(\);\s*unlockSound\(\);/);
  /* the hush reads the walkout contract where the Worker writes it */
  assert.match(read("src/lib/sound.js"), /state\?\.showControl\?\.audio\?\.walkout/);
  assert.match(read("src/features/duels/QuickDraw.jsx"), /setQuickDrawHush\(running\)/);
  /* A7 fires on the acknowledgement, not the tap */
  const pill = read("src/features/director/DirectorPill.jsx");
  assert.ok(pill.indexOf('playSound("S25"') > pill.indexOf("await onWrite("));
});
