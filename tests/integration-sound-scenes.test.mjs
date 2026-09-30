import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* Integration of the phase-3 pieces seen together on a TV and two phones:
   rehearsal jumps are silent teleports; the face-off (D2) comes before the
   bets, after the intro and draw or the decided contest, never under them,
   with its own restrained beat; a lead change never rings on top of a WON
   or a result; the commissioner's "saved" yields to his own moment; the
   cue rack wraps; the phone's own card rings only when it follows live. */
globalThis.__FD_BUILD_ID__ = "build-test";
const storageArea = () => {
  const values = new Map();
  return { getItem:k => values.has(k) ? values.get(k) : null, setItem:(k, v) => values.set(k, String(v)),
    removeItem:k => values.delete(k) };
};
globalThis.localStorage = storageArea();
Object.defineProperty(globalThis, "navigator", { value:{ userAgent:"test" }, configurable:true, writable:true });

const { CHIP_COLORS, CHIP_SKINS, EMPTY_STATE, ROSTER, allEventsOf, resolveCurrentContest } = await import("../shared/core.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const gate = await import("../src/lib/frameGate.js");
const sound = await import("../src/lib/sound.js");
const room = await import("../src/features/tv/roomSound.js");
const face = await import("../src/features/tv/faceOff.js");
const { TV_ADVANCE_MS, TV_REVEAL_HOLD_MS } = await import("../src/features/tv/tvModel.js");
const { buildEventReveal, drawSequenceMs, revealTimeline } = await import("../src/features/weekend/drawReveal.js");
const kit = await import("../src/lib/soundKit.js");

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"isc-gm", actionId:`isc-${++seq}`, showControl:true });
const act = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload, gm());
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const contestOf = (state, id) => resolveCurrentContest(state, eventOf(state, id));
const ref = (state, id) => { const c = contestOf(state, id); return { contestId:c.id, contestRevision:c.revision }; };
const profiles = () => Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
  color:CHIP_COLORS[index % CHIP_COLORS.length].hex, skin:CHIP_SKINS[index % CHIP_SKINS.length] }]));
const announced = (evId = "8ball") => {
  const state = { ...structuredClone(EMPTY_STATE), profiles:profiles() };
  act(state, "announceAndDraw", { evId });
  return state;
};

/* ── rehearsal jumps ── */

test("a QA jump or restore is a teleport: its frame never animates or sounds", () => {
  const before = structuredClone(EMPTY_STATE), after = { ...structuredClone(EMPTY_STATE), live:true };
  for (const lastAction of ["qaAdvance", "qaRestore"]) {
    const frame = gate.classifyFrame({ msg:{ version:5, lastAction, state:after }, prevState:before, hadState:true });
    assert.equal(frame.fresh, false, lastAction);
    assert.equal(frame.live, false, lastAction);
    assert.equal(frame.reason, "jump", lastAction);
    assert.ok(gate.JUMP_ACTIONS.has(lastAction));
  }
  const news = gate.classifyFrame({ msg:{ version:5, lastAction:"lockAndStart", state:after }, prevState:before, hadState:true });
  assert.equal(news.fresh, true, "an ordinary write is still news");
  /* the phones' and the TV's sound gates read the same classification */
  const jump = gate.publishFrame({ version:6, ...gate.classifyFrame({ msg:{ version:6, lastAction:"qaAdvance", state:after },
    prevState:before, hadState:true }), at:Date.now() });
  assert.equal(sound.freshFrameNow(jump), false);
});

/* ── D2: the face-off before the bets ── */

test("D2: the first contest's face-off starts when the TV's intro and draw end", () => {
  const state = announced();
  const ev = eventOf(state, "8ball");
  const contest = contestOf(state, "8ball");
  assert.equal(contest.phase, "betting-open", "announceAndDraw opens the market in the same write");
  assert.ok(face.faceOffKey(ev, contest), "a two-sided open contest is a face-off");
  const reveal = buildEventReveal(state, ev);
  const steps = (reveal.versus ? 2 : reveal.groups.length) + (reveal.crew?.length ? 1 : 0);
  const line = revealTimeline(state, "8ball", { reveal });
  const start = face.faceOffStart(state, ev);
  assert.equal(start, line.revealAt + drawSequenceMs(steps) + TV_REVEAL_HOLD_MS, "on the reveal's own server timeline");
  assert.ok(start > state.eventOps["8ball"].bettingOpenedAt + 5000, "never under the intro or the draw");
});

test("D2: a contest opened by recording the winner follows the decided contest's moment", () => {
  const state = announced();
  const ev = eventOf(state, "8ball");
  const first = contestOf(state, "8ball");
  const firstKey = face.faceOffKey(ev, first);
  act(state, "lockAndStart", { evId:"8ball", ...ref(state, "8ball") });
  assert.equal(face.faceOffKey(ev, contestOf(state, "8ball")), null, "the lock plays nothing");
  assert.equal(face.faceOffPlays(firstKey, null), false);
  const winner = contestOf(state, "8ball").sides[0].key;
  act(state, "recordContestWinner", { evId:"8ball", ...ref(state, "8ball"), winner });
  const next = contestOf(state, "8ball");
  assert.equal(next.phase, "betting-open");
  const nextKey = face.faceOffKey(ev, next);
  assert.ok(nextKey && nextKey !== firstKey);
  assert.equal(face.faceOffPlays(null, nextKey), true);
  const decided = state.eventOps["8ball"].lastContest.decidedAt;
  assert.equal(face.faceOffStart(state, ev), decided + TV_ADVANCE_MS, "after the WON and the ride, not on them");
});

test("D2 gate: a covered pane holds the face-off, then it plays from the moment the pane shows, once", () => {
  const anchor = 10_000;
  let step = face.faceOffGate(null, { id:"m1", anchor, covered:false, now:anchor });
  assert.equal(step.anchor, anchor, "clear at its start: plays on the shared server anchor");
  step = face.faceOffGate(step.gate, { id:"m1", anchor, covered:true, now:anchor + 900 });
  assert.equal(step.anchor, anchor, "once playing, a later cover does not restart it");

  let held = face.faceOffGate(null, { id:"m2", anchor, covered:true, now:anchor });
  assert.equal(held.anchor, null, "a scene still covers the pane: wait");
  held = face.faceOffGate(held.gate, { id:"m2", anchor, covered:true, now:anchor + 3000 });
  assert.equal(held.anchor, null);
  held = face.faceOffGate(held.gate, { id:"m2", anchor, covered:false, now:anchor + 4000 });
  assert.equal(held.anchor, anchor + 4000, "plays from the moment the pane shows");
  held = face.faceOffGate(held.gate, { id:"m2", anchor, covered:false, now:anchor + 5000 });
  assert.equal(held.anchor, anchor + 4000, "and keeps that anchor");

  let late = face.faceOffGate(null, { id:"m3", anchor, covered:true, now:anchor });
  late = face.faceOffGate(late.gate, { id:"m3", anchor, covered:false, now:anchor + face.FACEOFF_HOLD_MAX_MS + 1 });
  assert.equal(late.anchor, null, "a wait past the limit drops it");
  assert.equal(face.faceOffGate(late.gate, { id:"m3", anchor, covered:false, now:anchor + 90_000 }).anchor, null);
  assert.deepEqual(face.faceOffGate(late.gate, { id:null, anchor, covered:false, now:anchor }), { gate:null, anchor:null });
});

test("D2 sound: one restrained beat as VS stamps; the lock keeps its S8 at the lock", () => {
  assert.ok(kit.isSound("faceOff"), "a kit part");
  assert.ok(kit.PARTS.some(part => part.id === "faceOff"));
  const cues = room.faceOffCues({ id:"tv-contest:3", anchor:50_000 });
  assert.deepEqual(cues, [{ id:"faceOff", at:50_000 + face.FACEOFF_TIMING.vs, key:"faceoff:tv-contest:3" }]);
  assert.deepEqual(room.faceOffCues(null), []);

  const state = announced();
  const events = allEventsOf(state);
  const liveEv = eventOf(state, "8ball");
  const prev = room.roomSnapshot(state, events, { liveEv });
  act(state, "lockAndStart", { evId:"8ball", ...ref(state, "8ball") });
  const next = room.roomSnapshot(state, events, { liveEv });
  const lockCues = room.roomCues(prev, next, { now:state.eventOps["8ball"].bettingLockedAt + 40 });
  assert.deepEqual(lockCues.map(cue => [cue.id, cue.at]), [["S8", state.eventOps["8ball"].bettingLockedAt]]);
  assert.ok(!lockCues.some(cue => cue.id === "faceOff"), "nothing extra at the lock");
});

/* ── S15 never stacks on a WON or a result ── */

test("S15: a lead that changes with a decided contest rings with its lead card; a result owns its frame", () => {
  const base = { announced:{}, reveals:{}, locks:{}, results:{}, drafts:{}, chips:null, frozen:false, poker:null, scene:null };
  const now = 100_000;
  const decided = now - 20;
  const withAdvance = room.roomCues({ ...base, leader:"Ben", decidedAt:decided - 60_000 },
    { ...base, leader:"Evan", decidedAt:decided }, { now });
  assert.deepEqual(withAdvance.map(cue => [cue.id, cue.at]), [["S15", decided + TV_ADVANCE_MS]],
    "after the contest's moment, when the lead card docks (dockCard)");
  const quiet = room.roomCues({ ...base, leader:"Ben", decidedAt:0 }, { ...base, leader:"Evan", decidedAt:0 }, { now });
  assert.deepEqual(quiet.map(cue => [cue.id, cue.at]), [["S15", now]], "a lead change on its own rings at once");
  const posted = room.roomCues({ ...base, leader:"Ben", decidedAt:0 },
    { ...base, leader:"Evan", decidedAt:0, results:{ putt:{ revision:1, at:now - 5 } } }, { now });
  assert.deepEqual(posted.map(cue => cue.id), ["S14"], "the result's bell, not two at once");
});

/* ── the commissioner's ear beside his own moment ── */

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(v) { this.value = v; } linearRampToValueAtTime() {} exponentialRampToValueAtTime() {}
  cancelScheduledValues() {} setTargetAtTime() {}
}
class FakeNode {
  constructor(ctx) {
    this.ctx = ctx; this.type = ""; this.buffer = null;
    for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"])
      this[name] = new FakeParam(name === "gain" ? 1 : 0);
  }
  connect(node) { return node; } start() { this.ctx.started++; } stop() {}
}
class FakeCtx {
  constructor() { this.state = "suspended"; this.currentTime = 10; this.sampleRate = 8000; this.outputLatency = 0;
    this.destination = {}; this.started = 0; }
  createGain() { return new FakeNode(this); } createBiquadFilter() { return new FakeNode(this); }
  createDynamicsCompressor() { return new FakeNode(this); } createConvolver() { return new FakeNode(this); }
  createStereoPanner() { return new FakeNode(this); } createOscillator() { return new FakeNode(this); }
  createBufferSource() { return new FakeNode(this); }
  createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; }
  resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); }
  close() { this.state = "closed"; }
}

test("A7 beside A4: the ack yields to the commissioner's own moment for the same write; a failure never does", () => {
  assert.equal(sound.ackYields("S25", 10_000, 10_150), true);
  assert.equal(sound.ackYields("S25", 10_000, 10_000 + sound.GM_YIELD_MS + 1), false);
  assert.equal(sound.ackYields("S26", 10_000, 10_010), false, "Didn't save always sounds");
  assert.equal(sound.ackYields("S25", 0, 10), false, "nothing played yet");

  sound.__resetSoundEngine({ factory:FakeCtx });
  sound.setSoundSurface("phone");
  assert.equal(sound.unlockSound(), true);
  assert.ok(sound.playSound("S9", { bus:"you" }), "You're playing");
  assert.equal(sound.playSound("S25", { bus:"gm" }), null, "the ack for the same write stays quiet");
  assert.ok(sound.playSound("S26", { bus:"gm" }), "a failure still sounds");
  assert.ok(sound.playSound("S25", { bus:"gm", delayMs:sound.GM_YIELD_MS + 200 }), "a later ack sounds");
  sound.__resetSoundEngine();
});

/* ── the cue rack at 390px ── */

function bundle(name, contents) {
  const compiled = buildSync({ stdin:{ contents, resolveDir:root, loader:"jsx" }, bundle:true, platform:"node",
    format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL(`${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
}
const { CueRack, resetCueState } = bundle("isc-cue-rack",
  `export { CueRack, resetCueState } from "./src/features/director/CueRack.jsx";`);

test("the cue rack beside the pill: a pair or a team wraps as names, one or two keep the full label", () => {
  const track = n => ({ provider:"spotify", trackId:`T${n}`.padEnd(22, "x"), uri:`spotify:track:${`T${n}`.padEnd(22, "x")}`,
    name:"Song", artists:["Band"], durationMs:200000, startMs:0 });
  const players = ["Evan", "Sahil", "Ben", "Khoa"];
  const state = { ...structuredClone(EMPTY_STATE),
    profiles:Object.fromEntries(players.map((p, i) => [p, { display:p, walkoutTrack:track(i) }])) };
  resetCueState();
  const labels = candidates => [...renderToStaticMarkup(React.createElement(CueRack, { state, candidates }))
    .matchAll(/aria-label="([^"]*)"[^>]*>.*?<span[^>]*>([^<]*)<\/span><\/button>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(labels(["Evan", "Sahil"]),
    [["Play Evan&#x27;s song", "Play Evan&#x27;s song"], ["Play Sahil&#x27;s song", "Play Sahil&#x27;s song"]]);
  const four = labels(players);
  assert.equal(four.length, 4);
  assert.deepEqual(four.map(([, text]) => text), players, "names only, so they wrap in rows");
  assert.ok(four.every(([aria], i) => aria === `Play ${players[i]}&#x27;s song`), "the full action stays the label");
});

test("docked cues take their own header row, so a sheet title never collapses into a column", () => {
  const css = read("src/features/director/director.css");
  assert.match(css, /\.fd-sheet-header:has\(> \.fd-sheet-dock:not\(:empty\)\) \{ flex-wrap:wrap;/);
  assert.match(css, /\.fd-sheet-dock \{ order:1; flex:1 0 100%;/, "after Close in the flow, on a row of its own");
  const { Sheet, SheetDock } = bundle("isc-sheet", `export { Sheet, SheetDock } from "./src/ui/controls.jsx";`);
  const html = renderToStaticMarkup(React.createElement(SheetDock.Provider, { value:React.createElement("button", null, "Evan") },
    React.createElement(Sheet, { title:"1v1 Basketball", headerActions:React.createElement("button", null, "Rules"), onClose:() => {} })));
  assert.match(html, /fd-sheet-heading[^]*fd-sheet-header-actions[^]*fd-sheet-dock[^]*aria-label="Close"/);
});

/* ── source contracts ── */

test("the phone's own card (S4) rings only while the phone follows live", () => {
  const source = read("src/features/weekend/EventAnnouncement.jsx");
  const effect = source.slice(source.indexOf("/* S4:"), source.indexOf("const you = usePlayerIdentity(me);"));
  assert.match(effect, /if \(!currentFrame\(\)\.fresh\) return;/);
  assert.ok(effect.indexOf("currentFrame().fresh") < effect.indexOf("playSound(\"S4\""));
});

test("the profile's device rows: Haptics, then Sound, then Alerts", () => {
  const source = read("src/App.jsx");
  const at = name => source.indexOf(`<${name} />`);
  assert.ok(at("VibrationToggle") > 0 && at("VibrationToggle") < at("SoundToggle") && at("SoundToggle") < at("AlertsToggle"));
});

test("the frozen TV keys its champion / class photo rotation on the crown, read once", async () => {
  const { frozenAmbient } = await import("../src/features/results/classPhoto.js");
  const crownAt = 1_000_000, period = 12_000, crownMs = 4_800;
  assert.equal(frozenAmbient({ now:crownAt + crownMs + period - 1, crownAt, crownMs, period }), "champion");
  const later = crownAt + 60_000;
  const turn = frozenAmbient({ now:later, crownAt, crownMs, period });
  assert.equal(frozenAmbient({ now:later, crownAt:later - 100, crownMs, period }), "champion",
    "re-reading the anchor from a later write would restart the champion's hold");
  assert.ok(["class", "champion"].includes(turn));
  const source = read("src/features/tv/TVMode.jsx");
  assert.match(source, /else if \(!crownAt\.current\) crownAt\.current = crown\?\.anchor \|\| crownAnchor\(state\) \|\| 0;/);
  assert.match(source, /crownAt:crown\?\.anchor \|\| crownAt\.current \|\| 0/);
});

test("the TV wires the face-off under the cover gate and hands it to the room's voice", () => {
  const source = read("src/features/tv/TVMode.jsx");
  assert.match(source, /const liveCovered = !!\(sceneIntroEv \|\| ceremonyIntroEv \|\| ceremonyReveal \|\| directed \|\| resultModel\);/);
  assert.match(source, /useFaceOff\(state, liveEv, liveContest, \{ covered:liveCovered \}\)/);
  assert.match(source, /useRoomSound\(\{[^}]*faceOff \}\)/);
  assert.ok(source.indexOf("const liveCovered") > source.indexOf("const ceremonyIntroEv"), "computed after what covers the pane");
});
