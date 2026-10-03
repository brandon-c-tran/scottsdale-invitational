import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, BUILTIN_EVENTS, allEventsOf, computeStandings, resolveCurrentContest, makeBracket,
  resolveSlot } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import {
  ADVANCE_TIMING, CROWN_TIMING, bracketSignature, bracketAdvanceMotion, feedTarget, bracketGeometry, railPoints,
  railPath, pointAlong, tokenKeyframes, crownKey, crownPlays, timelineAt, beatProgress, nextLatch,
} from "../src/features/tv/tvMotion.js";
import { freshChangeStep } from "../src/lib/motion.js";
import { advanceMoment, nextOpenMatch } from "../src/features/tv/tvModel.js";

/* M14 (TV bracket advance) and M18 (the crown): the pure models, the
   fresh-change latch, and the TV's real markup. */
const root = fileURLToPath(new URL("../", import.meta.url));
/* ── the real TV markup ── */
const compiled = await build({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { TVBracket } from "./src/features/tv/TVBracket.jsx";
    export { ChampionMoment, crownHall } from "./src/features/tv/TVChampion.jsx";
    export { championView } from "./src/features/tv/tvModel.js";
    export { bracketLayout } from "./src/features/weekend/CompetitionBracket.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
    resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("tv-scenes.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { TVMode, TVBracket, ChampionMoment, crownHall, championView, bracketLayout,
  PlayerIdentityProvider } = mod.exports;
let seq = 0;
const gm = (showControl = false) => ({ isGm:true, player:"Brandon", deviceId:"gm-device", showControl });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, { ...ctx, actionId:`scenes-${++seq}` });
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const ref = (state, evId) => {
  const contest = resolveCurrentContest(state, BUILTIN_EVENTS.find(e => e.id === evId));
  return { contestId:contest.id, contestRevision:contest.revision };
};
const recordCurrent = (state, evId, pick = 0) => {
  const ev = BUILTIN_EVENTS.find(e => e.id === evId);
  if (resolveCurrentContest(state, ev).phase === "betting-open") act(state, "lockAndStart", { evId, ...ref(state, evId) });
  const contest = resolveCurrentContest(state, ev);
  act(state, "recordContestWinner", { evId, winner:contest.sides[pick].key, ...ref(state, evId) });
};

/* ── M14: the bracket model ── */
test("a bracket signature names every match's winner", () => {
  const br = makeBracket(6);
  assert.equal(bracketSignature(br), "-,-/-,-/-");
  br.rounds[0][1].winner = 5;
  assert.equal(bracketSignature(br), "-,5/-,-/-");
  assert.equal(bracketSignature(null), null);
});

test("each match feeds exactly one slot, the final none", () => {
  const br = makeBracket(6);
  assert.deepEqual(feedTarget(br, 0, 0), { r:1, m:0, index:1 });
  assert.deepEqual(feedTarget(br, 0, 1), { r:1, m:1, index:1 });
  assert.deepEqual(feedTarget(br, 1, 1), { r:2, m:0, index:1 });
  assert.equal(feedTarget(br, 2, 0), null);
});

test("only a forward step moves: winner, loser, the slot it rides to, and where UP NOW goes", () => {
  const br = makeBracket(6);
  const before = bracketSignature(br);
  br.rounds[0][0].winner = 4;
  const after = bracketSignature(br);
  const motion = bracketAdvanceMotion(br, before, after, { hotTo:[0, 1] });
  assert.equal(motion.matches.length, 1);
  assert.deepEqual(motion.matches[0], { r:0, m:0, winner:4, winIndex:1, loser:3, target:{ r:1, m:0, index:1 } });
  assert.deepEqual(motion.hotFrom, [0, 0]);
  assert.deepEqual(motion.hotTo, [0, 1]);
  assert.equal(resolveSlot(br, br.rounds[1][0].b), 4, "the winner is already seated where the rider lands");
  /* a rewind, a changed winner, or nothing new: the end state, nothing moves */
  assert.equal(bracketAdvanceMotion(br, after, before), null, "an undo never plays");
  const changed = after.replace("4", "3");
  assert.equal(bracketAdvanceMotion(br, after, changed), null, "a corrected winner never plays");
  assert.equal(bracketAdvanceMotion(br, after, after), null);
  /* a batch (a reconnect catching up) snaps */
  const all = structuredClone(br);
  all.rounds[0][1].winner = 5; all.rounds[1][0].winner = 0; all.rounds[1][1].winner = 5;
  assert.equal(bracketAdvanceMotion(all, before, bracketSignature(all)), null);
});

test("the rail is the connector the bracket draws, in canvas pixels", () => {
  const br = makeBracket(6);
  const layout = bracketLayout(br);
  const dims = { row:36, gap:10, colGap:30 };
  const geo = bracketGeometry({ rounds:br.rounds.length, centers:layout.centers, units:layout.units }, dims, 1300);
  assert.equal(geo.cardH, 75);
  assert.equal(geo.height, Math.ceil(layout.units * 85 - 10));
  assert.equal(geo.colW, (1300 - 60) / 3);
  const pts = railPoints(geo, dims, { r:0, m:0 }, { r:1, m:0, index:1 }, 20);
  assert.equal(pts.length, 5);
  assert.equal(pts[0][0], geo.colW, "leaves the decided card's right edge");
  assert.equal(pts[0][1], geo.center(0, 0));
  assert.equal(pts[1][0], geo.colW + 15, "turns at the middle of the gap, as the drawn connector does");
  assert.equal(pts[3][0], geo.left(1), "meets the next card's left edge");
  assert.equal(pts[3][1], geo.rowY(1, 0, 1), "on the row the winner lands in");
  assert.equal(pts[4][0], geo.left(1) + 20);
  assert.match(railPath(pts), /^M\S+ \S+L\S+ \S+L\S+ \S+L\S+ \S+$/, "the drawn rail stops at the card");
  assert.deepEqual(pointAlong([[0, 0], [10, 0], [10, 10]], 0.75), [10, 5]);
  assert.deepEqual(pointAlong([[0, 0], [10, 0]], 2), [10, 0]);
});

test("the rider lifts off, rides eased, and hands over to the slot as it lands", () => {
  const pts = [[0, 0], [100, 0], [100, 50], [160, 50]];
  const { keyframes, duration } = tokenKeyframes(pts, { w:80, h:46 });
  assert.equal(duration, 60 + ADVANCE_TIMING.rideMs + 40);
  assert.equal(keyframes[0].offset, 0);
  assert.equal(keyframes[keyframes.length - 1].offset, 1);
  assert.ok(keyframes.every((frame, i) => i === 0 || frame.offset >= keyframes[i - 1].offset), "offsets never go back");
  assert.equal(keyframes[0].opacity, 0);
  assert.equal(keyframes[1].opacity, 1);
  assert.equal(keyframes[keyframes.length - 1].opacity, 0, "the real row takes over on landing");
  assert.match(keyframes[0].transform, /^translate\(-40px, -23px\)/, "rides on its centre");
  assert.match(keyframes[keyframes.length - 1].transform, /^translate\(120px, 27px\)/);
  /* the beats keep p3's order */
  const T = ADVANCE_TIMING;
  assert.ok(T.fill < T.stamp && T.stamp < T.lose && T.lose < T.lift && T.lift < T.ride);
  assert.ok(T.ride + T.rideMs <= T.land + 40 && T.land < T.upNow && T.upNow + T.upNowMs <= T.unfill && T.unfill + T.unfillMs <= T.total);
});

/* ── the fresh-change latch ── */
test("a moment plays only for a fresh frame, and never for a key it was not built for", () => {
  const frame = { fresh:true, seq:2, at:1000 };
  const committed = { value:"a", key:"k", frameSeq:1, changeId:0, from:"a", to:"a" };
  const step = freshChangeStep(committed, { value:"b", key:"k", frame, now:1200 });
  const build = (from, to) => ({ from, to });
  const latch = nextLatch(null, { change:{ ...step, animate:true }, key:"k", build });
  assert.deepEqual(latch.moment, { from:"a", to:"b", id:"k:1" });
  assert.equal(nextLatch(latch, { change:{ ...step, animate:true }, key:"k", build }), latch, "one change, one moment");
  assert.equal(nextLatch(latch, { change:{ fresh:false, animate:false, changeId:1 }, key:"k", build }), latch,
    "later renders keep it");
  assert.equal(nextLatch(latch, { change:{ fresh:false, animate:false, changeId:1 }, key:"other", build }), null,
    "a different subject drops it");
  const late = freshChangeStep(committed, { value:"b", key:"k", frame, now:4000 });
  assert.equal(late.fresh, false, "a frame the screen caught late is not news");
  assert.equal(nextLatch(null, { change:{ ...late, animate:false }, key:"k", build }), null);
  const reduced = nextLatch(null, { change:{ ...step, animate:false }, key:"k", build });
  assert.equal(reduced, null, "reduced motion keeps the end state");
  const nothing = nextLatch(null, { change:{ ...step, animate:true }, key:"k", build:() => null });
  assert.equal(nothing.moment, null);
});

test("timelines are anchored on the server instant", () => {
  assert.deepEqual(timelineAt(10_000, 10_400, 3200), { elapsed:400, playing:true });
  assert.deepEqual(timelineAt(10_000, 14_000, 3200), { elapsed:3200, playing:false }, "a late TV shows the end");
  assert.deepEqual(timelineAt(10_000, 9_000, 3200), { elapsed:0, playing:true }, "clock skew never plays backwards");
  assert.deepEqual(timelineAt(0, 9_000, 3200), { elapsed:3200, playing:false });
  assert.equal(beatProgress(500, 400, 200), 0.5);
  assert.equal(beatProgress(100, 400, 200), 0);
  assert.equal(beatProgress(900, 400, 200), 1);
});

/* ── M18: the crown ── */
test("the crown plays when the board freezes or a champion scene starts, never when one ends", () => {
  const state = { frozen:true };
  assert.equal(crownKey({ frozen:false }), null);
  assert.equal(crownKey(state), "crown");
  assert.equal(crownKey(state, { active:{ kind:"champion", id:"s1" } }), "scene:s1");
  assert.equal(crownKey(state, { active:{ kind:"champion", id:"s1" }, staleReason:"x" }), "crown");
  assert.equal(crownKey(state, { active:{ kind:"winner", id:"s0" } }), "crown");
  assert.equal(crownPlays(null, "crown"), true, "crowned without Show Control");
  assert.equal(crownPlays(null, "scene:s1"), true, "crowned with the champion scene in the same write");
  assert.equal(crownPlays("crown", "scene:s2"), true, "the director shows the champion later");
  assert.equal(crownPlays("scene:s1", "scene:s2"), true, "a replay plays again");
  assert.equal(crownPlays("scene:s1", "crown"), false, "Skip leaves the frame standing still");
  assert.equal(crownPlays("crown", null), false);
  const C = CROWN_TIMING;
  assert.ok(C.hold <= C.stepDown && C.stepDown < C.rise && C.rise + C.riseMs <= C.flood + 50);
  assert.ok(C.flood < C.chip && C.chip < C.tag && C.tag < C.name && C.name < C.count && C.count < C.path);
  assert.ok(C.lines + 2 * C.lineStagger + C.lineMs <= C.total);
});

const wrap = (state, node) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles }, node));
const renderTv = (state, { now = Date.now(), showControl = false } = {}) => {
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const champion = state.frozen ? standings[0] : null;
  return wrap(state, React.createElement(TVMode, { state, events, standings, allTied:false, onDeckEv:null, champion,
    coChamps:champion ? standings.filter(r => r.rank === 1) : [], showControlEnabled:showControl,
    connection:{ ready:true, connected:true, version:3 }, now, onExit:() => {} }));
};

test("a decided match keeps the bracket in view: the card takes the contest's space, UP NOW moves on", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) });
  const before = renderTv(state);
  assert.match(before, /class="tv-bracket-upnow"/, "the match being played carries one outline");
  assert.ok(!before.includes("is-hot"));
  recordCurrent(state, "pong", 0);
  const decidedAt = state.eventOps.pong.lastContest.decidedAt;
  const html = renderTv(state, { now:decidedAt + 1000 });
  assert.match(html, /class="tv-advance is-slot"/);
  assert.match(html, /class="tv-contest-slot"/);
  assert.ok(html.indexOf("tv-contest-slot") < html.indexOf("tv-bracket is-side"), "the bracket sits below the card");
  assert.ok(!html.includes("tv-br-win") && !html.includes("tv-br-token"),
    "a render nobody saw arrive fresh shows the end state");
  assert.equal(advanceMoment(state, BUILTIN_EVENTS.find(e => e.id === "pong"), decidedAt + 1000).kind, "match");
  const hot = nextOpenMatch(state.brackets.pong);
  assert.ok(hot, "the next seated match is up now");
});

test("the bracket plays a step it is handed, and a late view does not", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) });
  const ev = BUILTIN_EVENTS.find(e => e.id === "pong");
  const from = bracketSignature(state.brackets.pong);
  recordCurrent(state, "pong", 0);
  const br = state.brackets.pong;
  const hot = nextOpenMatch(br);
  const motion = { ...bracketAdvanceMotion(br, from, bracketSignature(br), { hotTo:[hot.r, hot.m] }),
    id:"m1", anchor:Date.now() - 200 };
  const live = wrap(state, React.createElement(TVBracket, { state, ev, size:"full", hot:[hot.r, hot.m], motion }));
  assert.match(live, /tv-bracket is-full is-advancing/);
  assert.match(live, /--tl:-2\d\dms/, "joins its own timeline where the server says it is");
  assert.match(live, /class="tv-br-win"[^>]*>.*<span class="tv-br-stamp">Won<\/span>/);
  assert.match(live, /is-lose-moment/);
  assert.match(live, /is-arriving/);
  assert.match(live, /tv-bracket-match is-landing/);
  assert.match(live, /tv-bracket-upnow-tab"><i class="fd-beat-dot tv-beat"><\/i>Up now/, "UP NOW beats with everything live");
  const late = wrap(state, React.createElement(TVBracket, { state, ev, size:"full", hot:[hot.r, hot.m],
    motion:{ ...motion, id:"m2", anchor:Date.now() - 10_000 } }));
  assert.ok(!late.includes("is-advancing") && !late.includes("tv-br-win"), "a TV joining late sees the bracket as it stands");
  const strip = wrap(state, React.createElement(TVBracket, { state, ev, hot:[hot.r, hot.m] }));
  assert.ok(!strip.includes("tv-bracket-upnow-tab"), "the strip under the contest does not repeat Up now");
});

const crowned = (showControl) => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" }, gm(showControl));
  const ev = BUILTIN_EVENTS.find(e => e.id === "putt");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"putt", contestId:contest.id, contestRevision:contest.revision }, gm(showControl));
  act(state, "beginResultEntry", { evId:"putt" }, gm(showControl));
  act(state, "saveResult", { evId:"putt", slots:[["Evan"], ["Adi"], ["Khoa"]] }, gm(showControl));
  state.profiles = { Evan:{ display:"Evan", num:7, color:"#2F7E83" } };
  act(state, "setFrozen", { f:true }, gm(showControl));
  return state;
};

test("the champion frame floods in their color with readable ink; a reload shows it at rest", () => {
  const state = crowned(false);
  /* D3: a frozen TV takes turns with the class photo; this is the champion's turn */
  const html = renderTv(state, { now:Math.floor(Date.now() / 36000) * 36000 + 1000 });
  assert.match(html, /class="tv-crown is-flood is-ink-bone is-flooded"/);
  assert.match(html, /--champ-color:#2F7E83/);
  assert.match(html, /class="tv-crown-flood"/);
  assert.ok(html.includes("tv-champ") && html.includes(">Final<"));
  assert.ok(!html.includes("is-playing") && !html.includes("tv-crown-prelude"), "no moment was handed in: the end state");
  assert.ok(!html.includes("is-live") && !html.includes("tv-ticker"));
  assert.match(html, /aria-label="Evan"/, "the name reads whole to assistive tech while it stamps in letter by letter");
  assert.match(html, /class="tv-crown-coin"/, "their chip");
});

test("a fresh crown plays the produced crown: every tower in final order, dark from last up, the champion's into the flood", () => {
  const state = crowned(false);
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const view = championView(state, events, standings);
  const html = wrap(state, React.createElement(ChampionMoment, { state, view, standings,
    moment:{ id:"c1", anchor:Date.now() - 100 } }));
  assert.match(html, /tv-crown is-playing/);
  assert.equal((html.match(/class="tv-crown-tower/g) || []).length, standings.length, "all thirteen towers, as they stood");
  assert.match(html, /tv-crown-tower is-champ/);
  assert.ok(html.includes(`class="tv-crown-letter" aria-hidden="true" style="animation-delay:calc(var(--tl) + ${CROWN_TIMING.name}ms)"`),
    "the name lands on the crown's own beat");
  /* Backglass (Oct 2): the produced crown's order, on CROWN_TIMING */
  const hall = crownHall(standings, view.players);
  assert.equal(hall[0].outAt, null, "the champion's tower rises instead");
  assert.equal(hall[1].outAt, CROWN_TIMING.second, "2nd goes after the last two hold");
  assert.equal(hall.at(-1).outAt, CROWN_TIMING.stepDown, "last place goes dark first");
  hall.slice(2).forEach((tower, i, rest) => { if (i) assert.ok(tower.outAt < rest[i - 1].outAt, "then up the board"); });
  assert.ok(hall.slice(2).every(tower => tower.outAt < CROWN_TIMING.holdTwo), "3rd is out before the hold");
  assert.ok(hall.every((tower, i) => !i || tower.x > hall[i - 1].x), "in final order across the glass");
  assert.ok(hall[0].chips >= hall.at(-1).chips, "the biggest stack stands tallest");
  assert.match(html, /--flood-x:\d+px/, "the flood grows from the champion's tower");
  const tied = structuredClone(view); tied.tied = true; tied.players = ["Evan", "Adi"];
  const tie = wrap(state, React.createElement(ChampionMoment, { state, view:tied, standings }));
  assert.match(tie, /tv-crown is-tied/);
  assert.ok(!tie.includes("tv-crown-flood"), "a tie stays on night");
});

test("the scenes stay flat, tokened, and legible", () => {
  const css = readFileSync(new URL("../src/features/tv/tvScenes.css", import.meta.url), "utf8");
  /* tokens only; a gradient only as the glass's own light (DESIGN.md) */
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(css), "tokens only");
  const sizes = [...css.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 3 && sizes.every(size => size >= 24), `TV text sizes ${sizes}`);
  assert.doesNotMatch(css, /glow|text-shadow/);
  const tv = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(tv, /import "\.\/tvScenes\.css";/);
});
