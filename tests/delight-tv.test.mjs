import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import {
  TOWER_TIMING, TOWER_MAX_ANIMATED_CHIPS, towerChips, towerLeaders, towerTransition, towerSchedule, towerLayout,
  towerStackPx, towerChipSpan, towerLabelBoxes, towerCountSize, TOWER_COUNT_EM, TOWER_LAYOUT,
  frameMonitor, towersMode, standingsTowerRows, resultTowerRows, towerSignature, dropEase, towerSounds,
} from "../src/features/tv/towersModel.js";
import {
  DESERT_PHASES, desertPhase, isDaySky, isNightSky, constellationStars, constellationLines, desertScene,
} from "../src/features/tv/desertModel.js";
import { resultPresentation, championView } from "../src/features/tv/tvModel.js";
import { trophyPlates, trophyCup } from "../src/features/weekend/trophy.js";

const root = fileURLToPath(new URL("../", import.meta.url));
let seq = 0;
const gm = { isGm:true, player:"Brandon", deviceId:"gm-device", showControl:false };
const act = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload, { ...gm, actionId:`delight-${++seq}` });
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const post = (state, evId, slots) => {
  act(state, "announceEvent", { evId });
  const ev = allEventsOf(state).find(item => item.id === evId);
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId, contestId:contest.id, contestRevision:contest.revision });
  act(state, "beginResultEntry", { evId });
  act(state, "saveResult", { evId, slots });
};
const rows = pairs => pairs.map(([player, pts]) => ({ player, pts }));

/* ── Chip Towers: the pure model ── */
test("towers stand one chip per 100, all thirteen, in standings order", () => {
  assert.equal(towerChips(1000), 10);
  assert.equal(towerChips(1650), 16, "a 25-chip finale remainder never makes a partial chip");
  assert.equal(towerChips(-300), 0);
  const state = structuredClone(EMPTY_STATE);
  const board = standingsTowerRows(computeStandings(state));
  assert.equal(board.length, ROSTER.length);
  assert.ok(board.every(row => towerChips(row.pts) === 10), "everyone starts on a ten-chip tower");
  assert.deepEqual(towerLeaders(board), [], "nobody leads a level board");
  assert.deepEqual(towerLeaders(rows([["A", 1400], ["B", 1400], ["C", 1000]])), ["A", "B"], "co-leaders share the ring");
  assert.equal(towerSignature(rows([["A", 1450], ["B", 900]])), "A:14|B:9");
});

test("a transition animates one moment and snaps everything else", () => {
  const before = rows([["A", 1400], ["B", 1200], ["C", 1000]]);
  const after = rows([["C", 2600], ["A", 1400], ["B", 1000]]);
  assert.equal(towerTransition(null, after).mode, "snap", "first mount never animates");
  const tr = towerTransition(before, after);
  assert.equal(tr.mode, "animate");
  assert.deepEqual(tr.adds, { C:16 });
  assert.deepEqual(tr.removes, { B:2 });
  assert.equal(tr.reorder, true);
  assert.deepEqual(tr.moves.map(m => [m.player, m.from, m.to]), [["C", 2, 0], ["A", 0, 1], ["B", 1, 2]]);
  assert.deepEqual([tr.leadFrom, tr.leadTo, tr.leadMoved], [["A"], ["C"], true]);
  assert.equal(towerTransition(before, after, { reducedMotion:true }).mode, "snap", "reduced motion keeps the end state only");
  assert.equal(towerTransition(before, before.map(row => ({ ...row }))).mode, "none");
  assert.equal(towerTransition(before, rows([["A", 1400], ["B", 1200]])).mode, "snap", "a changed roster snaps");
  const flood = rows([["A", 1400 + (TOWER_MAX_ANIMATED_CHIPS + 1) * 100], ["B", 1200], ["C", 1000]]);
  assert.equal(towerTransition(before, flood).mode, "snap", "a reconnect-sized batch snaps");
});

test("the towers sound as they move: a clack per landing chip at its tower, the bank, the re-sort", () => {
  const tr = towerTransition(rows([["A", 1400], ["B", 1200], ["C", 1000]]), rows([["C", 1300], ["A", 1400], ["B", 1000]]));
  const heard = towerSounds(tr, 3);
  assert.equal(heard.chips.length, 3, "one per chip that falls");
  assert.deepEqual(heard.chips.map(chip => chip.offset), [0, 1, 2].map(i =>
    TOWER_TIMING.hold + i * TOWER_TIMING.stagger + TOWER_TIMING.drop * 0.8), "as each one hits the stack");
  assert.ok(heard.chips.every(chip => chip.pan === 0.7), "panned to C's tower before it moves (the right end)");
  assert.deepEqual(heard.cues.map(cue => cue.id), ["S11", "stepDown"]);
  assert.equal(heard.cues[1].offset, towerSchedule(tr).sortStart);
  assert.deepEqual(towerSounds(towerTransition(null, rows([["A", 1000]])), 1), { chips:[], cues:[] }, "a snap is silent");
});

test("the beats follow the spec: hold, drops on a stagger, re-sort, then the ring", () => {
  const tr = towerTransition(rows([["B", 1200], ["A", 1000]]), rows([["A", 2600], ["B", 1200]]));
  const s = towerSchedule(tr);
  /* a 1,600 award is 16 chips: about 2.2s of falling after the 300 hold */
  assert.equal(s.chipsEnd, TOWER_TIMING.hold + 15 * TOWER_TIMING.stagger + TOWER_TIMING.drop);
  assert.ok(s.chipsEnd - TOWER_TIMING.hold > 2000 && s.chipsEnd - TOWER_TIMING.hold < 2200);
  assert.equal(s.sortStart, s.chipsEnd + TOWER_TIMING.sortDelay);
  assert.equal(s.sortEnd, s.sortStart + TOWER_TIMING.sort);
  assert.equal(s.ringEnd, s.sortEnd + TOWER_TIMING.ring);
  const quiet = towerSchedule(towerTransition(rows([["A", 1200], ["B", 1000]]), rows([["A", 1300], ["B", 1000]])));
  assert.equal(quiet.sortEnd, quiet.sortStart, "no re-sort when the order holds");
  assert.equal(quiet.ringEnd, quiet.sortEnd, "no ring slide when the lead holds");
  assert.equal(dropEase(0), 0);
  assert.equal(dropEase(1), 1);
  assert.ok(dropEase(0.9) < 1 && dropEase(0.9) > 0.9, "one small settle after landing");
});

test("the towers keep their slots and true chip proportions: a taller board stands narrower towers, then thinner chips past the floor", () => {
  const early = towerLayout({ width:1920, baseY:730, count:13, tallest:10, top:40 });
  const mid = towerLayout({ width:1920, baseY:730, count:13, tallest:92, top:330 });
  const late = towerLayout({ width:1920, baseY:730, count:13, tallest:150, top:330 });
  assert.equal(early.slotPx, late.slotPx, "every tower keeps its slot");
  assert.deepEqual(towerLabelBoxes(early).map(box => box.x), towerLabelBoxes(late).map(box => box.x), "slot centres never move");
  /* a short board: the slot sets the chip, at its true proportion */
  assert.ok(Math.abs(early.k - early.slotK) < 1e-9 && early.smallPx === early.naturalPx && early.bigPx === early.naturalPx);
  /* a tall board: narrower towers, chips still their true proportion (the 9,200 result's ~45px stacks) */
  assert.ok(mid.k < early.k && mid.k > mid.floorK, "the 9,200 result narrows the chip");
  assert.ok(2 * mid.k > 40 && 2 * mid.k < 52, `a chunky ~45px chip (${(2 * mid.k).toFixed(1)})`);
  assert.equal(mid.smallPx, mid.naturalPx, "true thickness");
  assert.equal(mid.bigPx, mid.naturalPx, "true thickness");
  assert.ok(!mid.compressed);
  /* past the legible floor the chip stops narrowing and its thickness gives */
  assert.equal(late.k, late.floorK);
  assert.ok(2 * late.k >= TOWER_LAYOUT.minDiameterPx - 1e-9, "never under the legible diameter");
  assert.ok(late.compressed && late.bigPx < late.naturalPx, "the chips get thinner instead");
  assert.ok(towerStackPx(late, 150) <= 730 - 330 + 1e-6, "the tallest clears the headline");
});

/* the views the towers stand in (TVMode: towerBase = height - 106, and the
   sky's top margin per view), with the ticker and without */
const TOWER_VIEWS = [
  ...[836, 956].flatMap(height => [["result", 330], ["ribbon", 190], ["standings", 120], ["ambient", 40]]
    .map(([name, top]) => ({ name:`${name}-${height}`, baseY:height - 106, top, height }))),
  { name:"horizon", baseY:170, top:8, height:272, fill:0.56, minChipPx:3 },
];
const towerBoard = (count, leader) => Array.from({ length:count }, (_, i) =>
  i === count - 1 ? -300 : i === count - 2 ? 300 : Math.round((leader - (leader - 600) * i / (count - 2)) / 100) * 100);

test("tower labels never collide and every tower stays on the canvas, at any board and any roster size", () => {
  for (const count of [10, 12, 13]) for (const leader of [2000, 9200, 15000]) for (const view of TOWER_VIEWS) {
    const pts = towerBoard(count, leader);
    const chips = pts.map(towerChips);
    const tallest = Math.max(...chips);
    const layout = towerLayout({ width:1920, baseY:view.baseY, count, tallest, top:view.top, edge:64,
      fill:view.fill, minChipPx:view.minChipPx });
    const at = `${count} players, ${leader} leader, ${view.name}`;
    const boxes = towerLabelBoxes(layout);
    assert.equal(boxes.length, count, at);
    boxes.forEach((box, i) => {
      assert.ok(box.l >= 64 - 1e-6 && box.r <= 1856 + 1e-6, `${at}: label ${i} inside the safe sides`);
      if (i) assert.ok(boxes[i - 1].r + 8 <= box.l + 1e-6, `${at}: labels ${i - 1} and ${i} apart`);
      /* the count at its fitted size inside its label, never under 24px */
      const text = (pts[i] < 0 ? "-" : "") + Math.abs(pts[i]).toLocaleString("en-US");
      const size = towerCountSize(text, layout.labelW);
      assert.ok(size >= 24 && text.length * TOWER_COUNT_EM * size <= layout.labelW + 1e-6, `${at}: count ${text} fits`);
      /* the tower and the leader's ring inside the canvas, and inside its slot */
      const ring = 1.35 * layout.k;
      assert.ok(box.x - ring >= 0 && box.x + ring <= 1920, `${at}: tower ${i} on the canvas`);
      assert.ok(2 * layout.k <= layout.slotPx, `${at}: a chip inside its slot`);
      assert.ok(2 * layout.k >= Math.min(TOWER_LAYOUT.minDiameterPx, layout.slotK * 2) - 1e-9, `${at}: a legible chip`);
    });
    /* two lines of label (35 + 2 + 39) under the floor, inside the pane */
    assert.ok(boxes[0].y + 76 <= view.height + 1, `${at}: labels inside the pane`);
    assert.ok(view.baseY - towerStackPx(layout, tallest) >= view.top - 1e-6, `${at}: the tallest clears the top margin`);
    /* honest at a glance: more chips always stand taller, and a short stack
       keeps its chips legible */
    for (let n = 1; n <= tallest; n++) assert.ok(towerStackPx(layout, n) > towerStackPx(layout, n - 1), `${at}: ${n} over ${n - 1}`);
    assert.ok(towerStackPx(layout, 3) - layout.capPx >= 3 * Math.min(view.minChipPx || 4, layout.naturalPx) - 1e-6,
      `${at}: three chips read as three`);
    assert.ok(layout.bigPx <= layout.smallPx + 1e-9 && layout.smallPx <= layout.naturalPx + 1e-9, `${at}: past the knee every chip alike`);
    /* true proportions until the floor: only a board past it thins its chips */
    if (!layout.compressed) assert.ok(Math.abs(layout.bigPx - layout.naturalPx) < 1e-9, `${at}: chips at their true thickness`);
  }
});

test("more chips always stand taller, at every compression level the towers reach", () => {
  /* natural, narrowed, at the floor with the knee, and deep past it (the
     0.25px floor): the rendered stack in canvas px rises with every chip */
  for (const view of TOWER_VIEWS) for (const tallest of [1, 5, 10, 11, 20, 40, 92, 150, 220, 400]) {
    const layout = towerLayout({ width:1920, baseY:view.baseY, count:13, tallest, top:view.top, edge:64,
      fill:view.fill, minChipPx:view.minChipPx });
    let last = towerStackPx(layout, 0);
    for (let n = 1; n <= tallest; n++) {
      const px = towerStackPx(layout, n);
      assert.ok(px > last, `${view.name}, ${tallest} tallest: ${n} chips over ${n - 1}`);
      last = px;
    }
    /* and a board's towers in rank order are in height order */
    if (tallest < 10) continue;
    const pts = towerBoard(13, tallest * 100);
    const heights = pts.map(v => towerStackPx(layout, towerChips(v)));
    heights.forEach((h, i) => { if (i) assert.ok(h <= heights[i - 1] + 1e-9, `${view.name}, ${tallest}: rank ${i} no taller`); });
  }
});

test("an empty or negative stack holds its place with no chips", () => {
  const layout = towerLayout({ width:1920, baseY:730, count:13, tallest:150, top:330 });
  assert.equal(towerChips(-300), 0);
  assert.equal(towerChips(0), 0);
  assert.equal(towerStackPx(layout, 0), layout.capPx, "only the base on the felt");
  assert.equal(towerChipSpan(layout, 0).y, 0);
  assert.ok(towerChipSpan(layout, 12).y > towerChipSpan(layout, 11).y);
});

test("fallback: no WebGL, a failure, a slow TV, or the stacks board all stay flat", () => {
  assert.equal(towersMode({ supported:false, loaded:true }), "2d");
  assert.equal(towersMode({ supported:true, loaded:false }), "2d", "flat until the chunk is in");
  assert.equal(towersMode({ supported:true, loaded:true }), "3d");
  for (const failed of ["init", "lost", "slow", "render", "load"])
    assert.equal(towersMode({ supported:true, loaded:true, failed }), "2d", failed);
  assert.equal(towersMode({ supported:true, loaded:true, kind:"stacks" }), "2d");
  const slow = frameMonitor({ runMs:Infinity });
  const trips = Array.from({ length:30 }, () => slow(60));
  assert.deepEqual([trips[28], trips[29]], [false, true], "30 slow frames in a row");
  const recovering = frameMonitor({ runMs:Infinity });
  for (let i = 0; i < 29; i++) recovering(60);
  assert.equal(recovering(16), false, "a good frame resets the run");
  const crawl = frameMonitor();
  assert.equal([crawl(400), crawl(400), crawl(400)].at(-1), true, "a second of slow frames trips a very slow TV");
});

test("the result step rises from the board before the event to the board after", () => {
  const state = structuredClone(EMPTY_STATE);
  post(state, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  const model = resultPresentation(state, allEventsOf(state), "putt");
  const before = resultTowerRows(model, false);
  const after = resultTowerRows(model, true);
  assert.equal(before.length, ROSTER.length);
  assert.ok(before.every(row => row.pts === 1000 && !row.award));
  assert.equal(after[0].player, "Evan");
  assert.equal(after[0].award, 400);
  const tr = towerTransition(before, after);
  assert.equal(tr.mode, "animate");
  assert.deepEqual(tr.adds, Object.fromEntries(after.filter(row => row.award).map(row => [row.player, row.award / 100])));
  assert.equal(tr.adds.Evan, 4, "a Friday win drops four chips");
  assert.deepEqual(tr.leadTo, ["Evan"]);
});

/* ── the bundle ── */
test("three.js is a TV-only lazy chunk: nothing on the main path imports it statically", () => {
  const files = [];
  const walk = dir => readdirSync(dir, { withFileTypes:true }).forEach(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(path);
  });
  walk(join(root, "src"));
  walk(join(root, "shared"));
  const importsThree = /(?:^|\n)\s*import[^;]*from\s*["']three["']/;
  const staticThree = files.filter(file => importsThree.test(readFileSync(file, "utf8")));
  assert.deepEqual(staticThree.map(file => file.replace(/\\/g, "/").split("/src/")[1]), ["features/tv/ChipTowers.jsx"]);
  const staticTowers = files.filter(file => /import[^;(]*from\s*["'][^"']*ChipTowers(\.jsx)?["']/.test(readFileSync(file, "utf8")));
  assert.deepEqual(staticTowers, [], "ChipTowers is never imported statically");
  const gate = readFileSync(join(root, "src/features/tv/TowersBoard.jsx"), "utf8");
  assert.match(gate, /import\("\.\/ChipTowers\.jsx"\)/, "the gate loads the scene with a dynamic import");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.dependencies.three, /^\d+\.\d+\.\d+$/, "three is pinned to an exact version");
  /* after a build, the entry chunk carries no renderer */
  const assets = join(root, "dist/client/assets");
  if (existsSync(assets)) {
    const entry = readdirSync(assets).filter(name => /^index-.*\.js$/.test(name));
    entry.forEach(name => assert.ok(!readFileSync(join(assets, name), "utf8").includes("WebGLRenderer"), name));
  }
});

/* ── Desert Clock and the constellation ── */
test("the sky follows the session: live event, else the last result, finale once dealt", () => {
  const events = allEventsOf(EMPTY_STATE);
  const ev = id => events.find(item => item.id === id);
  const state = { ...structuredClone(EMPTY_STATE), live:true };
  assert.equal(desertPhase(structuredClone(EMPTY_STATE), events), "fri", "before anything, Friday");
  assert.equal(desertPhase(state, events), "fri", "live with nothing announced is still Friday");
  assert.equal(desertPhase(state, events, { liveEvent:ev("volley") }), "sap");
  assert.equal(desertPhase({ ...state, live:false }, events, { liveEvent:ev("volley") }), "fri",
    "before the weekend goes live it is Friday");
  const played = { ...state, results:{ putt:{ slots:[["Evan"]], ts:1 }, pickleball:{ slots:[["Adi"]], ts:5 } } };
  assert.equal(desertPhase(played, events), "sam", "between events, the last posted session");
  assert.equal(desertPhase({ ...played, poker:{ id:"poker" } }, events), "fin");
  assert.equal(desertPhase({ ...played, frozen:true }, events), "fin");
  assert.equal(desertPhase({ ...state, live:true }, events, { operationEvent:ev("trivia") }), "san",
    "a live weekend with nothing posted takes the event being prepared");
  assert.deepEqual(DESERT_PHASES.filter(isDaySky), ["sam", "sap"], "the two light skies carry --ink0 text");
  assert.deepEqual(DESERT_PHASES.filter(isNightSky), ["san", "fin"], "stars from Saturday night");
});

test("every event winner leaves a star; the champion's are joined in slate order", () => {
  const events = allEventsOf(EMPTY_STATE);
  const state = { ...structuredClone(EMPTY_STATE), results:{
    putt:{ slots:[["Chiang"]], ts:1 }, pong:{ slots:[["Adi", "Evan"]], ts:2 }, ragecage:{ slots:[["Chiang"]], ts:3 } } };
  const stars = constellationStars(state, events);
  assert.equal(stars.length, 4, "one star per winner");
  assert.deepEqual(constellationStars(state, events), stars, "deterministic on every TV");
  stars.forEach(star => assert.ok(star.x >= 0.03 && star.x <= 0.97 && star.y >= 0 && star.y <= 1));
  const pong = stars.filter(star => star.eventId === "pong");
  assert.equal(new Set(pong.map(star => `${star.x},${star.y}`)).size, 1, "teammates share one anchor");
  assert.notEqual(pong[0].dx, pong[1].dx, "and sit apart in a belt");
  const lines = constellationLines(stars, ["Chiang"]);
  assert.deepEqual(lines.map(line => line.points.map(point => point.eventId)), [["putt", "ragecage"]]);
  assert.deepEqual(constellationLines(stars, ["Adi"]), [], "one star draws no line");
  /* a correction moves the star, because it reads the official result */
  const corrected = { ...state, results:{ ...state.results, ragecage:{ slots:[["Khoa"]], ts:3, revision:2 } } };
  assert.equal(constellationStars(corrected, events).find(star => star.eventId === "ragecage").player, "Khoa");
  const view = championView(state, events, computeStandings(state));
  assert.equal(view.stars.length, 4);
  assert.deepEqual(view.lines.map(line => line.player), ["Chiang"]);
});

test("the horizon is flat paths in any band, and every desert fill is a mixed token", () => {
  for (const [variant, width, height] of [["strip", 1920, 118], ["full", 1920, 678], ["full", 740, 330]]) {
    const scene = desertScene({ width, height, variant });
    for (const d of [scene.far, scene.mid, scene.ground]) assert.ok(!/NaN|Infinity/.test(d), `${variant} ${d.slice(0, 40)}`);
    assert.ok(scene.sky.bottom > scene.sky.top && scene.horizon <= height);
    DESERT_PHASES.forEach(phase => assert.ok(scene.disc[phase].x >= 0 && scene.disc[phase].x <= width));
  }
  const css = readFileSync(join(root, "src/features/tv/tv.css"), "utf8");
  const block = css.slice(css.indexOf("--desert-fri-sky"), css.indexOf("--desert-star"));
  assert.ok(block.length > 100);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), "no raw hex in the desert tokens");
  DESERT_PHASES.forEach(phase => ["sky", "far", "mid", "ground", "near", "cactus", "disc"].forEach(layer =>
    assert.ok(block.includes(`--desert-${phase}-${layer}:`), `--desert-${phase}-${layer}`)));
  const band = readFileSync(join(root, "src/features/tv/DesertBand.jsx"), "utf8");
  assert.ok(!/Gradient|#[0-9a-f]{6}/i.test(band), "flat fills only");
});

/* ── Trophy plates ── */
test("one plate per event, blank until it posts, then the winners; skipped events have none", () => {
  const state = structuredClone(EMPTY_STATE);
  const events = allEventsOf(state);
  const blank = trophyPlates(state, events);
  assert.equal(blank.length, events.filter(ev => !ev.finale).length, "the finale is the cup, not a plate");
  assert.ok(blank.every(plate => !plate.posted && !plate.winners.length));
  post(state, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  state.shelved = { ...state.shelved, die:true };
  const plates = trophyPlates(state, allEventsOf(state));
  const putt = plates.find(plate => plate.eventId === "putt");
  assert.equal(putt.posted, true);
  assert.deepEqual(putt.winners, ["Evan"]);
  assert.equal(putt.engraving.name, "Evan");
  assert.ok(!plates.some(plate => plate.eventId === "die"));
  const cup = trophyCup(state, allEventsOf(state));
  assert.deepEqual(cup.bands.map(band => band.session), ["fri", "sam", "sap", "san"]);
  assert.equal(cup.bands.reduce((n, band) => n + band.plates.length, 0), plates.length);
});

/* ── rendered ── */
const compiled = await build({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { TrophyCup } from "./src/features/weekend/Trophy.jsx";
    export { Guide } from "./src/features/weekend/Guide.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
    resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("delight-tv.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { TVMode, TrophyCup, Guide, PlayerIdentityProvider } = mod.exports;

test("the TV draws the session's band with the flat board where WebGL is absent", () => {
  const state = structuredClone(EMPTY_STATE);
  post(state, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { state, events, standings, allTied:false, onDeckEv:null, champion:null, coChamps:[],
      showControlEnabled:false, connection:{ ready:true, connected:true, version:3 }, now:Date.now() + 3600e3, onExit:() => {} })));
  assert.match(html, /data-phase="fri"/);
  assert.match(html, /data-towers="2d"/, "no WebGL on the server: the flat board, no error");
  assert.match(html, /class="tv-desert is-glass tv-backdrop"/, "the session painted across the whole canvas");
  assert.ok(!html.includes("tv-towers-canvas"));
});

test("Weekend shows the cup: an engraved plate per posted event, the rest blank", () => {
  const state = structuredClone(EMPTY_STATE);
  post(state, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  state.profiles = { Evan:{ display:"Evan", num:7, color:"#2F7E83" } };
  const events = allEventsOf(state);
  const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(Guide, { events, state, me:"Evan", section:"games", onSection:() => {} })));
  assert.match(html, /aria-label="Long Putt: Evan"/);
  assert.equal((html.match(/fd-cup-plate is-posted/g) || []).length, 1);
  assert.equal((html.match(/class="fd-cup-plate( is-next)?"/g) || []).length, events.filter(ev => !ev.finale).length - 1,
    "every other plate is blank");
  /* a plate shows the winner's chip and name; a jersey number never stands in for a person */
  assert.match(html, /class="fd-cup-winner"[^>]*>Evan</, "the plate names its winner");
  const tv = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TrophyCup, { state, events, variant:"tv" })));
  assert.match(tv, /fd-cup is-tv/);
  assert.match(tv, /aria-label="Friday Night"/, "one band per session");
  assert.doesNotMatch(tv, /fd-cup-cartouche is-posted/, "the cup waits for the champion");
});
