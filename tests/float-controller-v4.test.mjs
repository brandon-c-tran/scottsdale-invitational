/* The phone, v4 (float/GROOVE.md "v4 (Oct 29: playtest 3)"): right versus
   wrong at a glance (the pad's answer by grade, the streak and its break,
   the timing meter, the coach line), and auto-rowing on 1 and 3. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chartOf, cueTime } from "../float/shared/chart.js";
import { COACH_AFTER, METER_TICKS, STREAK_SHOW, autoRowPose, foldTaps, tapsView } from "../float/client/controller/controllerModel.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const h = React.createElement;
async function bundle(contents, name) {
  const out = await build({ stdin:{ contents, resolveDir:ROOT, loader:"jsx", sourcefile:`${name}.jsx` }, bundle:true, platform:"node",
    format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", jsx:"automatic" });
  const mod = new Module(fileURLToPath(new URL(`float-controller-v4-${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return mod.exports;
}
const run = rows => rows.reduce((list, [c, q, d]) => foldTaps(list, { c, q, d, key:`k${c}` }), []);

test("your taps this song: one entry a cue, the room's restamp corrects it in place, misses join", () => {
  let list = run([[1, "nice", 70], [2, "late", 190]]);
  list = foldTaps(list, { c:2, q:"ok", d:150, key:"r2" });
  assert.deepEqual(list.map(row => [row.c, row.q, row.d, row.key]), [[1, "nice", 70, "k1"], [2, "ok", 150, "k2"]], "restamped in place, its key kept");
  list = foldTaps(list, { c:3, q:"miss", d:null, key:"r3" });
  assert.deepEqual(list.at(-1), { c:3, q:"miss", d:null, key:"r3" });
  assert.equal(foldTaps(list, { c:3, q:"miss" }), list, "the same word twice changes nothing");
  assert.equal(foldTaps(list, null), list);
});

test("the streak: Nice or better in a row, broken visibly by Early, Late or a Miss; an OK neither grows nor breaks it loudly", () => {
  assert.equal(tapsView(run([[1, "perfect", 10], [2, "nice", -80], [3, "perfect", 0]])).streak, 3);
  const broke = tapsView(run([[1, "perfect", 10], [2, "nice", -80], [3, "perfect", 0], [4, "late", 200]]));
  assert.deepEqual([broke.streak, broke.broken], [0, { n:3, key:"k4" }]);
  assert.deepEqual(tapsView(run([[1, "perfect", 10], [2, "nice", -80], [3, "perfect", 0], [4, "miss", null]])).broken, { n:3, key:"k4" });
  assert.equal(tapsView(run([[1, "perfect", 10], [2, "late", 200]])).broken, null, `a streak under ${STREAK_SHOW} breaks quietly`);
  const ok = tapsView(run([[1, "perfect", 10], [2, "nice", -80], [3, "perfect", 0], [4, "ok", 130]]));
  assert.deepEqual([ok.streak, ok.broken], [0, null]);
});

test("the meter: your last 8 taps as signed ticks, misses leave none", () => {
  const rows = Array.from({ length:12 }, (_, k) => [k, k % 4 === 3 ? "miss" : "nice", k % 4 === 3 ? null : (k - 6) * 10]);
  const view = tapsView(run(rows));
  assert.equal(view.ticks.length, METER_TICKS);
  assert.ok(view.ticks.every(tick => Number.isFinite(tick.d)));
  assert.equal(view.ticks.at(-1).d, 40, "the newest last");
});

test("the coach: three off the same way in a row says which way to go, gone once you are back on time", () => {
  assert.equal(tapsView(run([[1, "late", 200], [2, "ok", 130], [3, "late", 180]])).coach, "Tap earlier");
  assert.equal(tapsView(run([[1, "early", -200], [2, "ok", -130], [3, "early", -180]])).coach, "Tap later");
  assert.equal(tapsView(run([[1, "late", 200], [2, "early", -130], [3, "late", 180]])).coach, null, "mixed: no line");
  assert.equal(tapsView(run([[1, "late", 200], [2, "late", 130], [3, "late", 180], [4, "perfect", 10]])).coach, null, "back on time");
  assert.equal(tapsView(run([[1, "late", 200], [2, "late", 190]])).coach, null, `not before ${COACH_AFTER}`);
});

test("auto-rowing: left on 1, right on 3, half a beat each, in practice, play and the outro; never in the card, the breakdown or the dark", () => {
  const paddle = chartOf("paddle");
  assert.equal(autoRowPose(paddle, { moment:"play", beat:40.1 }), "stroke");
  assert.equal(autoRowPose(paddle, { moment:"play", beat:42.2 }), "stroke-r");
  assert.equal(autoRowPose(paddle, { moment:"play", beat:40.6 }), "idle");
  assert.equal(autoRowPose(paddle, { moment:"play", beat:41.1 }), "idle", "2 and 4 rest");
  for (const moment of ["card", "intro", "breakdown", "after"]) assert.equal(autoRowPose(paddle, { moment, beat:40.1 }), "idle", moment);
  const fw = chartOf("fireworks");
  if (fw.dark?.length) assert.equal(autoRowPose(fw, { moment:"play", beat:fw.dark[0] * 4 + 0.1 }), "idle", "you row in the dark only in your head");
});

test("the pad answers: a flash by grade, the streak and the coach at the foot, the meter, the word big for Early and Late", async () => {
  const { SongScreen } = await bundle(`export { default as SongScreen } from "./float/client/controller/SongScreen.jsx";`, "screen");
  const paddle = chartOf("paddle");
  const songAt = 7_000_000;
  const entrant = { name:"B", color:"#e4572e", look:{ critter:"capybara" } };
  const shape = { round:0, rounds:5, of:13, final:false, through:10 };
  const draw = (taps, extra = {}) => renderToStaticMarkup(h(SongScreen, { serverNow:() => cueTime(songAt, 40.2), chart:paddle, songAt, entrant, shape,
    name:"Paddle Party", taps:run(taps), onTap:() => {}, ...extra }));
  const streak = draw([[1, "perfect", 10], [2, "nice", -60], [3, "perfect", 5], [4, "perfect", 0]]);
  assert.match(streak, /flc-answer is-perfect/);
  assert.match(streak, />4 in a row</);
  assert.equal((streak.match(/class="flc-tick/g) || []).length, 4);
  assert.match(streak, /flc-tick is-gold is-last/);
  const late = draw([[1, "late", 200], [2, "late", 210], [3, "late", 190]]);
  assert.match(late, /flc-answer is-late/);
  assert.match(late, />Tap earlier</);
  const broke = draw([[1, "perfect", 10], [2, "nice", -60], [3, "perfect", 5], [4, "miss", null]]);
  assert.match(broke, /flc-answer is-miss/);
  assert.match(broke, /flc-streak is-broken[^>]*>3 in a row</);
  const popped = draw([], { popup:{ key:9, q:"early", d:-200, at:globalThis.performance.now() } });
  assert.match(popped, /data-q="early"/);
  const card = renderToStaticMarkup(h(SongScreen, { serverNow:() => songAt - 1000, chart:paddle, songAt, entrant, shape, name:"Paddle Party",
    taps:run([[1, "perfect", 0]]), onTap:() => {} }));
  assert.doesNotMatch(card, /flc-meter|flc-answer/, "the card has none of it");
});
