/* The game intros (Oct 3 redo): one timeline for the room, one scene per
   game on the slate with the GameMark fallback, the same composition on a
   phone and the TV, and the room's sound on the same beats. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, BUILTIN_EVENTS } from "../shared/core.js";
import { INTRO_MS, INTRO_REDUCED_MS, INTRO_TIMING, INTRO_SCENES, INTRO_LEAD_MS, FALLBACK_SCENE, introElapsed, introScene }
  from "../src/features/intro/introTiming.js";
import { DRAW_INTRO_MS, DRAW_INTRO_REDUCED_MS, introRemainingMs, revealTimeline } from "../src/features/weekend/drawReveal.js";
import { TV_INTRO_OVERLAY_MS, TV_INTRO_AUTO_MS, tvSceneView } from "../src/features/tv/tvModel.js";
import * as kit from "../src/lib/soundKit.js";
import * as room from "../src/features/tv/roomSound.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { GameIntro } from "./src/features/intro/GameIntro.jsx";
    export { SCENES } from "./src/features/intro/IntroScenes.jsx";
    export { IntroOverlay } from "./src/features/tv/TVCeremony.jsx";
    export { EventAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("game-intros.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { GameIntro, SCENES, IntroOverlay, EventAnnouncement, PlayerIdentityProvider } = mod.exports;
const html = element => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:{} }, element));
const CUSTOM = { id:"custom", name:"Cornhole", session:"san", value:1600, kind:"solo", game:"cornhole" };

/* ── the timing contract ── */

test("one intro length for the room: the phones' handoff, the TV overlay and the draw all read INTRO_MS", () => {
  assert.equal(DRAW_INTRO_MS, INTRO_MS);
  assert.equal(TV_INTRO_OVERLAY_MS, INTRO_MS);
  assert.equal(DRAW_INTRO_REDUCED_MS, INTRO_REDUCED_MS);
  assert.ok(INTRO_REDUCED_MS < INTRO_MS);
  assert.ok(TV_INTRO_AUTO_MS > INTRO_MS, "a solo intro with nothing behind it holds past its own end");
  assert.ok(INTRO_MS <= 5000, "confident and short");
  const state = structuredClone(EMPTY_STATE);
  state.eventOps = { pong:{ announcedAt:50_000 } };
  assert.equal(revealTimeline(state, "pong").handoffAt, 50_000 + INTRO_MS);
  assert.equal(introRemainingMs(state, "pong", { now:51_000 }), INTRO_MS - 1000);
  const scene = { definition:{}, active:{ kind:"event-intro", startedAt:50_000, eventId:"pong" } };
  assert.equal(tvSceneView(scene, 50_000 + INTRO_MS - 1).mode, "intro-overlay");
  assert.equal(tvSceneView(scene, 50_000 + INTRO_MS).mode, "live");
});

test("the beats run in order inside the intro, and the hand-over comes after the name", () => {
  const T = INTRO_TIMING;
  assert.ok(T.flicker < T.play && T.play < T.hit && T.hit < T.sweep && T.sweep <= T.ladder && T.ladder < T.recede);
  assert.equal(T.recede + T.recedeMs, T.total);
  assert.ok(T.hit + T.nameMs < T.recede, "the name has landed well before the draw takes over");
  assert.ok(T.dolly + T.dollyMs <= T.recede);
  const css = readFileSync(new URL("../src/features/intro/intro.css", import.meta.url), "utf8");
  /* the stylesheet's shell beats are the module's numbers */
  assert.match(css, new RegExp(`fi-stamp ${T.nameMs}ms [^;]*\\+ ${T.hit}ms\\)`));
  assert.match(css, new RegExp(`fi-sweep ${T.sweepMs}ms [^;]*\\+ ${T.sweep}ms\\)`));
  assert.match(css, new RegExp(`fi-rise ${T.ladderMs}ms [^;]*\\+ ${T.ladder}ms\\)`));
  assert.match(css, new RegExp(`fi-veil ${T.recedeMs}ms [^;]*\\+ ${T.recede}ms\\)`));
  assert.match(css, new RegExp(`fi-flicker ${T.flickerMs}ms`));
});

test("a screen joins the room's intro where the room is: late mid-scene, after it at the end, a little early it waits", () => {
  assert.equal(introElapsed(10_000, 11_250), 1250);
  assert.equal(introElapsed(10_000, 99_000), INTRO_MS);
  assert.equal(introElapsed(10_000, 9_700), -300);
  assert.equal(introElapsed(10_000, 1_000), -INTRO_LEAD_MS);
  assert.equal(introElapsed(10_000, 11_000, { reduced:true }), INTRO_MS);
  assert.equal(introElapsed(null, 11_000), 0, "no stamp: it plays from when it opens");
  const late = html(React.createElement(GameIntro, { ev:BUILTIN_EVENTS[0], surface:"tv", anchor:10_000, now:() => 12_345 }));
  assert.match(late, /--tl:-2345ms/);
  const over = html(React.createElement(GameIntro, { ev:BUILTIN_EVENTS[0], surface:"phone", anchor:10_000, now:() => 60_000 }));
  assert.match(over, new RegExp(`--tl:-${INTRO_MS}ms`), "an intro that is over shows its last frame");
});

/* ── a scene per game, and the fallback ── */

test("every event on the slate has its own scene; basketball's two events are two scenes", () => {
  const scenes = BUILTIN_EVENTS.map(introScene);
  assert.ok(scenes.every(scene => scene !== FALLBACK_SCENE), scenes.join());
  assert.equal(new Set(scenes).size, BUILTIN_EVENTS.length, "no two events share a scene");
  assert.equal(introScene(BUILTIN_EVENTS.find(ev => ev.id === "bball5")), "basketball:5v5");
  assert.equal(introScene(BUILTIN_EVENTS.find(ev => ev.id === "bball1")), "basketball:1v1");
  assert.deepEqual(Object.keys(SCENES).sort(), [...INTRO_SCENES].sort(), "the registry and the timing module agree");
});

test("a commissioner-added game with no art plays the shared scene around its GameMark, else the FD chip", () => {
  assert.equal(introScene(CUSTOM), FALLBACK_SCENE);
  assert.equal(introScene({ game:"spikeball" }), FALLBACK_SCENE);
  assert.equal(introScene({}), FALLBACK_SCENE);
  const out = html(React.createElement(GameIntro, { ev:CUSTOM, surface:"tv", anchor:1, now:() => 2 }));
  assert.match(out, /data-scene="mark"/);
  assert.match(out, /fd-game-mark/);
  assert.match(out, /Cornhole/);
  const borrowed = html(React.createElement(GameIntro, { ev:{ ...CUSTOM, game:"foosball" }, surface:"phone" }));
  assert.match(borrowed, /fd-game-mark/);
});

test("phone and TV draw the same scene, the name lettered once in the Inline cut, a digit's case kept", () => {
  for (const ev of BUILTIN_EVENTS) {
    const tv = html(React.createElement(GameIntro, { ev, surface:"tv", anchor:1, now:() => 2 }));
    const phone = html(React.createElement(GameIntro, { ev, surface:"phone", anchor:1, now:() => 2 }));
    const scene = introScene(ev);
    for (const out of [tv, phone]) {
      assert.ok(out.includes(`data-scene="${scene}"`), ev.id);
      assert.equal((out.match(/fd-intro-name/g) || []).length, 1, `${ev.id}: one name`);
      assert.match(out, /fd-show is-marquee fd-glass-letter/);
      assert.match(out, /fd-glass-depth/, `${ev.id}: the session's painting in plates`);
    }
    if (/\d/.test(ev.name)) assert.match(tv, /fd-keep-case/, `${ev.id}: EventName keeps the digit's case`);
    /* the phone carries the session's lamp chase round its window; the TV
       runs its own frame lamps */
    assert.match(phone, /fd-chase/);
    assert.doesNotMatch(tv, /fd-intro-chase/);
  }
});

test("reduced motion is the finished frame: still, no hand-over dimming", () => {
  const out = html(React.createElement(GameIntro, { ev:BUILTIN_EVENTS[1], surface:"tv", anchor:1, reduced:true, handoff:true }));
  assert.match(out, /class="fd-intro is-tv is-still"/);
  assert.match(out, /--tl:-\d{5,}ms/);
  const css = readFileSync(new URL("../src/features/intro/intro.css", import.meta.url), "utf8");
  /* the app-wide reduced-motion rule drops animations to their first frame;
     a still intro keeps each one's last (--fa) */
  assert.match(css, /\.fd-intro\.is-still \*, \.fd-intro\.is-still \*::before \{ animation:var\(--fa\) !important; \}/);
});

test("the TV intro plays from the announcement stamp and carries the podium; the phone sheet opens on it", () => {
  const state = structuredClone(EMPTY_STATE);
  state.eventOps = { putt:{ announcedAt:100_000 } };
  const ev = BUILTIN_EVENTS.find(item => item.id === "putt");
  const tv = html(React.createElement(IntroOverlay, { state, ev, now:() => 101_500 }));
  assert.match(tv, /class="tv-intro fd-night"/);
  assert.match(tv, /--tl:-1500ms/);
  assert.match(tv, /fd-ladder is-podium is-tv/);
  assert.doesNotMatch(tv, /Drawing teams/);
  const phone = html(React.createElement(EventAnnouncement, { state, ev, live:true, anchor:100_000, now:() => 100_800,
    onClose:() => {}, onBets:() => {} }));
  assert.match(phone, /fd-intro is-phone/);
  assert.match(phone, /--tl:-800ms/);
  assert.match(phone, /Betting open/);
  assert.equal((phone.match(/Long Putt/g) || []).length >= 1, true);
});

/* ── the sound ── */

class FakeParam {
  constructor(value) { this.value = value; }
  setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} cancelScheduledValues() {} setTargetAtTime() {}
}
function fakeEngine() {
  const nodes = [];
  class Node {
    constructor(kind) {
      this.kind = kind; this.type = ""; this.buffer = null; nodes.push(this);
      for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"])
        this[name] = new FakeParam(name === "gain" ? 1 : 0);
    }
    connect(node) { return node; } disconnect() {} start() {} stop() {}
  }
  const ctx = { currentTime:0, sampleRate:8000, destination:{},
    createGain:() => new Node("gain"), createBiquadFilter:() => new Node("filter"), createDynamicsCompressor:() => new Node("comp"),
    createConvolver:() => new Node("conv"), createStereoPanner:() => new Node("pan"), createOscillator:() => new Node("osc"),
    createBufferSource:() => new Node("src"), createBuffer:(c, length) => ({ length, numberOfChannels:c, getChannelData:() => new Float32Array(length) }) };
  return { E:kit.makeEngine(ctx, { room:"fri", listen:"tv" }), nodes };
}

test("S2 is the game's own intro: every scene has its move, the summary is the chord alone", () => {
  for (const scene of [...INTRO_SCENES, FALLBACK_SCENE]) assert.equal(typeof kit.INTRO_FOLEY[scene], "function", scene);
  const counts = {};
  for (const scene of [...INTRO_SCENES, FALLBACK_SCENE, "unknown"]) {
    const { E, nodes } = fakeEngine();
    const before = nodes.length;
    assert.ok(kit.playRecipe(E, "S2", 1, { game:scene }), scene);
    counts[scene] = nodes.length - before;
  }
  const { E, nodes } = fakeEngine();
  const before = nodes.length;
  kit.playRecipe(E, "S2", 1, { game:"putting", summary:true });
  const summary = nodes.length - before;
  assert.ok(Object.values(counts).every(n => n > summary), "a full intro is more than its chord");
  assert.equal(counts.unknown, counts[FALLBACK_SCENE], "an unknown game plays the shared scene's sound");
  assert.equal(kit.SOUNDS.S2.ms, INTRO_MS);
  assert.ok(kit.SOUNDS.S2.where.includes("phone") && kit.SOUNDS.S2.where.includes("tv"));
});

test("the room's S2 carries its scene, and its summary under reduced motion", () => {
  const events = BUILTIN_EVENTS;
  const state = structuredClone(EMPTY_STATE);
  const prev = room.roomSnapshot(state, events);
  state.eventOps = { bball1:{ announcedAt:7_000 } };
  const next = room.roomSnapshot(state, events);
  const cue = room.roomCues(prev, next, { now:7_010 }).find(item => item.id === "S2");
  assert.deepEqual(cue.opts, { game:"basketball:1v1" });
  const still = room.roomCues(prev, next, { now:7_010, reduced:true }).find(item => item.id === "S2");
  assert.deepEqual(still.opts, { game:"basketball:1v1", summary:true });
});

test("a phone voices the intro on its own bus only while it follows live", () => {
  const source = readFileSync(new URL("../src/features/intro/GameIntro.jsx", import.meta.url), "utf8");
  const effect = source.slice(source.indexOf("const rung = useRef(false);"), source.indexOf("const tv = surface"));
  const gate = effect.indexOf("if (!freshFrameNow()) return;");
  const call = effect.indexOf('playSound("S2", { bus:"you"');
  assert.ok(gate > 0 && call > gate, "the fresh-frame gate comes first");
  assert.match(effect, /at:Number\(anchor\)/, "on the room's clock");
});
