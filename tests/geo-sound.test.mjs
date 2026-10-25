/* Where and When's sound: the room's cues on the server clock (a photo
   going up, each lock, the minute's bed and last ten seconds, the reveal on
   the map's own beats), the phone's own moments, the kit's recipes and the
   cut gate that stops the bed clean. Pure models against real reducer
   states; the recipes render offline in dev/sound-preview.html?selftest. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EMPTY_STATE, ROSTER, allEventsOf, resolveCurrentContest } from "../shared/core.js";
import { GEO_ROUND_MS } from "../shared/geo.js";
import { applyAction } from "./support/confirmed-start.mjs";

globalThis.__FD_BUILD_ID__ = "build-test";
const kit = await import("../src/lib/soundKit.js");
const room = await import("../src/features/tv/roomSound.js");
const geo = await import("../src/features/tv/geoSound.js");
const phone = await import("../src/features/geo/geoPhoneSound.js");
const { REVEAL, revealPlan } = await import("../src/features/geo/mapModel.js");
const { reelLanding, reelLandingMs } = await import("../src/ui/reelModel.js");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const [author, evan, khoa, sahil] = ROSTER;
let serial = 0;
const gm = () => ({ isGm:true, player:author, deviceId:"gm", actionId:`g${++serial}` });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const where = state => allEventsOf(state).find(ev => ev.id === "where");
const ROUNDS = [
  { id:"gaaaaaa1", photo:{ id:"gphoto01", w:1600, h:1200 }, lat:37.8199, lng:-122.4783, place:"Golden Gate Bridge", when:"2019-07-04T21" },
  { id:"gaaaaaa2", photo:{ id:"gphoto02", w:1200, h:1600 }, lat:40.758, lng:-73.9855, place:"Times Square", when:"2021-12-31T23" },
];
function announced() {
  const state = structuredClone(EMPTY_STATE);
  for (const round of ROUNDS) act(state, "geoSaveRound", round);
  act(state, "announceEvent", { evId:"where" });
  return state;
}
function started() {
  const state = announced();
  const contest = resolveCurrentContest(state, where(state));
  act(state, "lockAndStart", { evId:"where", contestId:contest.id, contestRevision:contest.revision });
  return state;
}
const snap = state => room.roomSnapshot(state, allEventsOf(state), { liveEv:where(state) });
const geoOnly = cues => cues.filter(cue => cue.id.startsWith("geo"));

test("a photo going up: the projector's sting on startedAt, after Lock and start's knock; a load or a stale frame is silent", () => {
  const before = announced(), after = started();
  const prev = snap(before), next = snap(after);
  assert.equal(prev.geo, null);
  const { startedAt } = after.geo;
  const cues = room.roomCues(prev, next, { now:startedAt });
  const photo = cues.filter(cue => cue.id === "geoPhoto");
  assert.equal(photo.length, 1);
  assert.equal(photo[0].at, startedAt + geo.GEO_PHOTO_STING_MS);
  assert.ok(cues.some(cue => cue.id === "S8" && cue.at < photo[0].at), "the lock's knock first, then the photo");
  assert.ok(room.roomCues(prev, next, { now:startedAt, reduced:true }).find(cue => cue.id === "geoPhoto").opts.summary);
  assert.deepEqual(room.roomStep(prev, next, { fresh:false, now:startedAt }), [], "a catch-up or correction sounds nothing");
  assert.deepEqual(room.roomStep(null, next, { fresh:true, now:startedAt }), [], "a TV that loads mid-photo sounds nothing");
  assert.deepEqual(geoOnly(room.roomCues(next, snap(structuredClone(after)), { now:startedAt + 500 })), [], "the same photo never stings twice");
  /* the next photo stings again */
  const r1 = after.geo.order[0];
  act(after, "geoReveal", { roundId:r1 });
  const revealed = snap(after);
  assert.deepEqual(geoOnly(room.roomCues(next, revealed, { now:Date.now() })), [], "the reveal rides the map's beats, not the frame");
  act(after, "geoNext", { roundId:r1 });
  const second = room.roomCues(revealed, snap(after), { now:Date.now() }).filter(cue => cue.id === "geoPhoto");
  assert.equal(second.length, 1);
  assert.equal(second[0].at, after.geo.startedAt + geo.GEO_PHOTO_STING_MS);
});

test("each lock is a pin pushed home from that player's seat, a step up each; a draft is silent; nothing once the result posts", () => {
  const state = started();
  const r1 = state.geo.order[0];
  const s0 = snap(state);
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.45 }, as(khoa));
  const s1 = snap(state);
  assert.deepEqual(geoOnly(room.roomCues(s0, s1, { now:1 })), [], "a draft that is not locked sounds nothing");
  act(state, "geoGuess", { roundId:r1, lat:37.8, lng:-122.45, when:"2019-07-04T20", done:true }, as(khoa));
  const s2 = snap(state);
  const [lock] = room.roomCues(s1, s2, { now:5000 }).filter(cue => cue.id === "geoLock");
  assert.equal(lock.at, 5000);
  assert.equal(lock.opts.step, 0);
  assert.equal(lock.pan, s2.geo.pans[khoa]);
  assert.match(lock.key, new RegExp(`:lock:${khoa}$`));
  act(state, "geoGuess", { roundId:r1, lat:40, lng:-74, done:true }, as(evan));
  act(state, "geoGuess", { roundId:r1, lat:41, lng:-74, done:true }, as(sahil));
  const both = room.roomCues(s2, snap(state), { now:6000 }).filter(cue => cue.id === "geoLock");
  assert.deepEqual(both.map(cue => cue.opts.step), [1, 2], "two locks in one frame, each a step higher");
  assert.deepEqual(both.map(cue => cue.at), [6000, 6090]);
  const pans = Object.values(s2.geo.pans);
  assert.ok(Math.min(...pans) >= -0.7 && Math.max(...pans) <= 0.7 && new Set(pans).size === pans.length, "every seat its own place");
  /* the result posts: the posted result rings S14, the game is silent */
  const finished = structuredClone(state);
  act(finished, "geoReveal", { roundId:r1 });
  act(finished, "geoNext", { roundId:r1 });
  act(finished, "geoReveal", { roundId:finished.geo.order[1] });
  act(finished, "geoFinish", { evId:"where" });
  assert.equal(snap(finished).geo, null);
});

test("the minute's clock: the bed a bar at a time ending on the knock, tense over the last ten, ticks each second, the knock at zero", () => {
  const startedAt = 1_000_000, closesAt = startedAt + GEO_ROUND_MS;
  const s = { id:"where", roundId:"g1", phase:"guess", startedAt, closesAt };
  const cues = geo.geoClockCues(s, startedAt);
  const bars = cues.filter(cue => cue.id === "geoBed");
  assert.equal(bars.length, Math.floor((GEO_ROUND_MS - geo.GEO_BED_LEAD_MS) / geo.GEO_BAR_MS));
  assert.equal(bars[0].at, startedAt + geo.GEO_BED_LEAD_MS, "the sting has the first bar to itself");
  assert.equal(bars.at(-1).at + geo.GEO_BAR_MS, closesAt, "the last bar ends on the knock");
  assert.ok(bars.every((bar, i) => i === 0 || bar.at - bars[i - 1].at === geo.GEO_BAR_MS), "bars butt end to end");
  assert.deepEqual(bars.slice(-6).map(bar => bar.opts.tense), [0, 1, 2, 3, 4, 5], "the last ten seconds tense, bar by bar");
  assert.deepEqual(bars.filter(bar => bar.opts.last).length, 1);
  assert.equal(bars.at(-1).opts.bar, 3, "the turn's fifth chord leads into the knock");
  assert.deepEqual(bars.slice(-4).map(bar => bar.opts.bar), [0, 1, 2, 3]);
  const ticks = cues.filter(cue => cue.id === "geoTick");
  assert.deepEqual(ticks.map(cue => [cue.at, cue.opts.s]), Array.from({ length:10 }, (_, i) => [closesAt - (10 - i) * 1000, 10 - i]));
  assert.ok(ticks.every(tick => (closesAt - tick.at) % geo.GEO_BAR_MS === 0 || (closesAt - tick.at) % geo.GEO_BAR_MS === 1000),
    "every tick on a beat of the bed");
  assert.deepEqual(cues.filter(cue => cue.id === "S8").map(cue => cue.at), [closesAt]);
  /* a TV that joins late hears only what is still ahead, from the next bar line */
  const late = geo.geoClockCues(s, closesAt - 5500);
  assert.ok(late.every(cue => cue.at > closesAt - 5700));
  assert.equal(late.filter(cue => cue.id === "geoBed")[0].at, closesAt - 4000);
  assert.deepEqual(late.filter(cue => cue.id === "geoTick").map(cue => cue.opts.s), [5, 4, 3, 2, 1]);
  /* reduced motion: the clock without the bed; any other phase: nothing */
  const reduced = geo.geoClockCues(s, startedAt, { reduced:true });
  assert.equal(reduced.filter(cue => cue.id === "geoBed").length, 0);
  assert.equal(reduced.filter(cue => cue.id === "geoTick").length, 10);
  assert.deepEqual(geo.geoClockCues({ ...s, phase:"reveal" }, startedAt), []);
  assert.deepEqual(geo.geoClockCues(null, startedAt), []);
});

test("the reveal on the map's beats: a drop per pin as it lands, the lines, the answer, then the scores with the rows", () => {
  const start = 50_000, plan = revealPlan(3);
  const cues = geo.geoRevealCues({ start, count:3, pans:[-0.7, 0, 0.7], revealedAt:start, rows:3 });
  assert.deepEqual(cues.map(cue => cue.id), ["geoDrop", "geoDrop", "geoDrop", "geoLines", "geoAnswer", "geoSettle"]);
  assert.deepEqual(cues.slice(0, 3).map(cue => cue.at), plan.drops.map(at => start + at + geo.GEO_DROP_HIT_MS));
  assert.deepEqual(cues.slice(0, 3).map(cue => [cue.pan, cue.opts.step]), [[-0.7, 0], [0, 1], [0.7, 2]]);
  assert.equal(cues[3].at, start + plan.lines);
  assert.equal(cues[3].opts.ms, REVEAL.lines);
  const answerAt = start + plan.answer + geo.GEO_ANSWER_HIT_MS;
  assert.equal(cues[4].at, answerAt);
  assert.equal(cues[5].at, Math.max(start + geo.GEO_ROWS_MS + 100, answerAt + 500), "the scores settle with the rows, never before the answer");
  assert.equal(cues[5].opts.last, false);
  /* beats that start late (the map settling first) move every cue with them; the rows keep their own instant */
  const later = geo.geoRevealCues({ start:start + 1500, count:3, revealedAt:start, rows:3 });
  assert.equal(later.find(cue => cue.id === "geoAnswer").at, answerAt + 1500);
  assert.equal(later.find(cue => cue.id === "geoSettle").at, answerAt + 1500 + 500);
  /* a big field: every pin still drops, the settle waits for the answer */
  const twelve = geo.geoRevealCues({ start, count:12, revealedAt:start, rows:6 });
  assert.equal(twelve.filter(cue => cue.id === "geoDrop").length, 12);
  const lastPhoto = geo.geoRevealCues({ start, count:0, revealedAt:start, rows:0, last:true });
  assert.deepEqual(lastPhoto.map(cue => cue.id), ["geoAnswer", "geoSettle"], "nobody pinned: the answer, and the last photo still resolves");
  assert.equal(lastPhoto[1].opts.last, true);
  assert.deepEqual(geo.geoRevealCues({ start, count:0, revealedAt:start, rows:0 }).map(cue => cue.id), ["geoAnswer"]);
  assert.deepEqual(geo.geoRevealCues({ start, count:5, rows:5, reduced:true }), [{ id:"geoAnswer", at:start }], "reduced motion: the one summary");
  assert.deepEqual(geo.geoRevealCues({ start:NaN }), []);
});

test("the wiring: the room's snapshot carries the game, its clock rides useRoomSound, its reveal the map's onBeats", () => {
  const roomSrc = read("src/features/tv/roomSound.js");
  assert.match(roomSrc, /geo:geoRoomSnapshot\(state\)/);
  assert.match(roomSrc, /geoCues\(prev, next, \{ now, reduced \}\)/);
  assert.match(roomSrc, /useGeoRoomClock\(snap\?\.geo \|\| null\)/);
  const map = read("src/features/geo/GeoMap.jsx");
  const effect = map.slice(map.indexOf("/* the reveal, on the beats of mapModel.js revealPlan */"));
  assert.ok(effect.indexOf("onBeats?.(sinceRef.current)") > 0 && effect.indexOf("onBeats?.(sinceRef.current)") < effect.indexOf("if (at.over)"),
    "the map reports its beats as they start, before it decides whether to animate");
  const tv = read("src/features/tv/TVGeo.jsx");
  assert.match(tv, /const onBeats = useGeoRevealSound\(view\);/);
  assert.match(tv, /onBeats=\{onBeats\}/);
  assert.ok(tv.indexOf("useGeoRevealSound(view)") < tv.indexOf("if (!view) return null"), "the hook runs on every render");
  assert.doesNotMatch(read("src/features/tv/geoSound.js"), /bus:\s*"(you|gm)"/);
});

test("the phone: your pin, Lock in on the ack, your score as its reels land, never a low score's chime", () => {
  assert.deepEqual([0, 1499, 1500, 4999, 5000, 7999, 8000, 10000].map(phone.geoScoreTier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(phone.geoScoreCue({ total:900, where:900, when:0 }), null, "a low score lands silent");
  assert.equal(phone.geoScoreCue(null), null);
  const score = { total:7200, where:4100, when:3100 };
  const landed = (from, value) => from + reelLandingMs(reelLanding(0, value));
  assert.deepEqual(phone.geoScoreCue(score), { tier:2, delayMs:Math.max(landed(phone.GEO_SCORE_REELS.where, 4100),
    landed(phone.GEO_SCORE_REELS.when, 3100)) + phone.GEO_SCORE_AFTER_MS });
  assert.deepEqual(phone.geoScoreCue(score, { reduced:true }), { tier:2, delayMs:0 });
  const play = read("src/features/geo/GeoPlay.jsx");
  assert.match(play, /onPick=\{point => \{ setPin\(point\); geoPinSound\(\); \}\}/, "a tap or a drag let go");
  assert.match(play, /setPin\(\{ lat:place\.lat, lng:place\.lng \}\);\s*geoPinSound\(\);/, "a place searched");
  assert.match(play, /const result = await save\(true\);\s*geoLockSound\(result\);/, "Lock in sounds on the server's answer");
  assert.match(play, /useGeoScoreSound\(view\.roundId, score/);
  /* your reels land on the ScoreReels YourReveal draws */
  assert.match(play, new RegExp(`value=\\{score\\.where \\|\\| 0\\} from=\\{0\\} at=\\{${phone.GEO_SCORE_REELS.where}\\}`));
  assert.match(play, new RegExp(`value=\\{score\\.when \\|\\| 0\\} from=\\{0\\} at=\\{${phone.GEO_SCORE_REELS.when}\\}`));
  const own = read("src/features/geo/geoPhoneSound.js");
  assert.doesNotMatch(own, /bus:\s*"room"|cueAt\(/);
});

/* a recording context, enough for the kit */
function fakeContext() {
  class Param {
    constructor(v = 0) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; }
    linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); }
    exponentialRampToValueAtTime(v, t) { this.events.push(["exp", v, t]); }
    cancelScheduledValues(t) { this.events.push(["cancel", t]); }
    setTargetAtTime() {}
  }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.connected = [];
      for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"]) this[name] = new Param(1); }
    connect(node) { this.connected.push(node); return node; } disconnect() { this.disconnected = (this.disconnected || 0) + 1; } start() {} stop() {}
  }
  return { currentTime:10, sampleRate:8000, destination:{}, nodes:[],
    node(kind) { const n = new Node(this, kind); this.nodes.push(n); return n; },
    createGain() { return this.node("gain"); }, createBiquadFilter() { return this.node("filter"); },
    createDynamicsCompressor() { return this.node("comp"); }, createConvolver() { return this.node("conv"); },
    createStereoPanner() { return this.node("pan"); }, createOscillator() { return this.node("osc"); },
    createBufferSource() { return this.node("src"); },
    createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; } };
}

test("the kit's Where and When recipes: each playable on its opts, every node released when its last source ends", () => {
  const ctx = fakeContext();
  const E = kit.makeEngine(ctx, { listen:"tv" });
  const base = ctx.nodes.length;
  const ids = kit.GEO_PARTS.map(part => part.id);
  assert.deepEqual(ids, ["geoPhoto", "geoLock", "geoTick", "geoBed", "geoDrop", "geoLines", "geoAnswer", "geoSettle", "geoPin", "geoScore"]);
  for (const id of ids) for (const opts of [{}, { summary:true, step:9, s:1, bar:3, tense:5, last:true, ms:900, n:6, tier:3 }]) {
    ctx.nodes.length = base;
    assert.equal(kit.isSound(id), true, id);
    assert.ok(kit.playRecipe(E, id, 10, opts), id);
    const made = ctx.nodes.slice(base);
    const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, `${id} makes sound`);
    assert.ok(sources.every(n => typeof n.onended === "function"), `${id}: every source reports its end`);
    sources.forEach(n => n.onended());
    assert.ok(made.every(n => n.disconnected === 1), `${id}: every node released once`);
  }
  assert.equal(E.graph, undefined);
  assert.equal(E.cutDry, undefined, "no gate left open between recipes");
  /* every pitched part of the bed is in D */
  const inD = new Set(["D", "E", "Fs", "A", "B"]);
  const names = Object.entries(kit.NOTE).map(([name, f]) => [name.replace(/\d/g, ""), f]);
  const noteOf = f => names.find(([, g]) => Math.abs(Math.log2(f / g) - Math.round(Math.log2(f / g))) < 1e-6)?.[0];
  for (const bar of kit.GEO_BED) for (const f of [bar.root, ...bar.notes]) assert.ok(inD.has(noteOf(f)), `${f} Hz is in D`);
});

test("the bed is a cut recipe: its gate closes a bar that rings, holds one not yet started silent, and other recipes stay plain", () => {
  assert.equal(kit.cutSound("geoBed"), true);
  assert.equal(kit.cutSound("geoTick"), false);
  assert.equal(kit.cutSound("S8"), false);
  const ctx = fakeContext();
  const E = kit.makeEngine(ctx, { listen:"tv" });
  assert.equal(kit.playRecipe(E, "geoTick", 10, { s:4 }), true, "a plain recipe still answers true");
  const base = ctx.nodes.length;
  const handle = kit.playRecipe(E, "geoBed", 12, { bar:0 });
  assert.equal(typeof handle.stop, "function");
  const gates = ctx.nodes.slice(base, base + 2);
  assert.ok(gates.every(n => n.kind === "gain"));
  assert.deepEqual(gates.map(n => n.connected[0]), [E.dry, E.wet], "the gate stands between the bar and the engine (so the walkout duck still holds)");
  const voices = ctx.nodes.slice(base + 2).filter(n => n.kind === "pan");
  assert.ok(voices.length && voices.every(n => n.connected.includes(gates[0])), "every voice in the bar goes through the gate");
  /* not yet started: held silent at once */
  handle.stop();
  assert.ok(gates.every(n => n.gain.events.some(([kind, v, t]) => kind === "set" && v === 0 && t === 10)));
  /* ringing: faded out from now */
  ctx.currentTime = 13;
  const from = ctx.nodes.length;
  const ringing = kit.playRecipe(E, "geoBed", 12.5, { bar:1 });
  const ring = ctx.nodes.slice(from, from + 2);
  ringing.stop();
  ringing.stop();
  for (const gate of ring) {
    const ramps = gate.gain.events.filter(e => e[0] === "ramp");
    assert.deepEqual(ramps, [["ramp", 0, 13 + kit.CUT_FADE_S]], "a ringing bar fades from now, once");
  }
});

test("the engine: cancel closes a cut recipe that already rang, and still only drops a plain cue", async () => {
  const sound = await import("../src/lib/sound.js");
  const made = [];
  class Ctx {
    constructor() { Object.assign(this, fakeContext()); this.state = "suspended"; this.outputLatency = 0; made.push(this); }
    resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); }
    close() { this.state = "closed"; }
  }
  sound.__resetSoundEngine({ factory:Ctx });
  sound.setSoundSurface("tv");
  sound.primeSound();
  const ctx = made[0];
  const from = ctx.nodes.length;
  const bar = sound.playSound("geoBed", { bus:"room", opts:{ bar:0 } });
  assert.ok(bar, "the bar plays now");
  const gates = ctx.nodes.slice(from, from + 2);
  assert.ok(gates.every(n => n.kind === "gain" && !n.gain.events.length));
  bar.cancel();
  assert.ok(gates.every(n => n.gain.events.some(e => (e[0] === "set" || e[0] === "ramp") && e[1] === 0)), "cancel closed the gate");
  const tick = sound.playSound("geoTick", { bus:"room", opts:{ s:3 } });
  assert.doesNotThrow(() => tick.cancel());
  assert.equal(sound.playSound("geoBed", { bus:"you" }), null, "the bed never sounds on a phone's bus from the TV");
  sound.__resetSoundEngine();
});
