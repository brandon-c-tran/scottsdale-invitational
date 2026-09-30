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
  TOWER_TIMING, TOWER_MAX_ANIMATED_CHIPS, towerChips, towerLeaders, towerTransition, towerSchedule, towerFit,
  frameMonitor, towersMode, standingsTowerRows, resultTowerRows, towerSignature, dropEase,
} from "../src/features/tv/towersModel.js";
import {
  DESERT_PHASES, desertPhase, isDaySky, isNightSky, constellationStars, constellationLines, desertScene,
} from "../src/features/tv/desertModel.js";
import { resultPresentation, championView } from "../src/features/tv/tvModel.js";
import { trophyPlates, plateTiers } from "../src/features/weekend/trophy.js";

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

test("the camera fits thirteen towers across and the tallest under the header", () => {
  const early = towerFit({ width:1920, baseY:716, count:13, tallest:10 });
  const late = towerFit({ width:1920, baseY:716, count:13, tallest:90 });
  assert.ok(early > late, "a taller board zooms out");
  assert.ok(early * (12 * 2.9 + 2) <= 1920 - 128 + 0.001, "thirteen towers fit across");
  assert.ok(late * 90 * 0.2 * Math.cos(20 * Math.PI / 180) < 716, "the tallest tower clears the top");
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
  assert.deepEqual(plates.find(plate => plate.eventId === "putt"), { eventId:"putt", name:"Long Putt", session:"fri",
    winners:["Evan"], posted:true });
  assert.ok(!plates.some(plate => plate.eventId === "die"));
  const tiers = plateTiers(plates);
  assert.deepEqual(tiers.map(tier => tier.session), ["fri", "sam", "sap", "san"]);
  assert.equal(tiers.reduce((n, tier) => n + tier.plates.length, 0), plates.length);
});

/* ── rendered ── */
const compiled = await build({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { TrophyPlates } from "./src/features/weekend/Trophy.jsx";
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
const { TVMode, TrophyPlates, Guide, PlayerIdentityProvider } = mod.exports;

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
  assert.match(html, /class="tv-desert is-strip tv-backdrop"/);
  assert.ok(!html.includes("tv-towers-canvas"));
});

test("Weekend > Games shows the trophy with a stamped plate per posted event", () => {
  const state = structuredClone(EMPTY_STATE);
  post(state, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  state.profiles = { Evan:{ display:"Evan", num:7, color:"#2F7E83" } };
  const events = allEventsOf(state);
  const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(Guide, { events, state, me:"Evan", section:"games", onSection:() => {} })));
  assert.match(html, /aria-label="Long Putt: Evan"/);
  assert.equal((html.match(/fd-trophy-plate is-posted/g) || []).length, 1);
  assert.equal((html.match(/class="fd-trophy-plate"/g) || []).length, events.filter(ev => !ev.finale).length - 1,
    "every other plate is blank");
  assert.match(html, /class="fd-trophy-stamp"[^>]*>7</, "stamped with the winner's number");
  const tv = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TrophyPlates, { state, events, variant:"tv", cup:300 })));
  assert.match(tv, /fd-trophy is-tv/);
  assert.match(tv, />FIELD DAY</);
});
