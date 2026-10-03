import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { REEL, reelLanding, reelLandingMs, reelMotion, reelStep, reelStripFaces } from "../src/ui/reelModel.js";

/* The score reel rule (Oct 3): a reel wherever a number lands or changes as
   a moment, plain numerals wherever people scan a list; a reel rolls only
   for a fresh change and always rests on its value. */
const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compiled = buildSync({
  stdin:{ contents:`export { ScoreReel } from "./src/ui/ScoreReel.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("score-reels.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { ScoreReel } = mod.exports;
const render = props => renderToStaticMarkup(React.createElement(ScoreReel, props));

/* the face each flat window rests on: its strip's --d index, read as a digit */
const restingDigits = html => [...html.matchAll(/class="fd-reel-strip[^"]*" style="--d:(\d+)/g)].map(m => Number(m[1]) % 10).join("");

test("a landing rolls like an odometer: low windows spin, high ones click over, each ends on its digit", () => {
  const cells = reelLanding(0, 1600);
  assert.deepEqual(cells.map(cell => cell.digit), [1, 6, 0, 0]);
  assert.deepEqual(cells.map(cell => cell.faces), [1, 16, 20, 20], "thousands clicks once, hundreds passes 16, the rest cap at two turns");
  for (const cell of cells) assert.equal(cell.end % 10, cell.digit, "every window lands on its own digit");
  assert.ok(cells.every((cell, i) => i === 0 || cell.delay > cells[i - 1].delay), "left to right");
  assert.ok(cells[3].ms > cells[0].ms, "a longer roll takes longer");
  assert.ok(reelLandingMs(cells) <= REEL.maxLandMs + 3 * REEL.staggerMs);
  assert.ok(reelStripFaces(cells) > Math.max(...cells.map(cell => Math.max(cell.start, cell.end))), "room past the detent");
});

test("a landing from a lower count turns only what moved; a loss rolls back from the far run", () => {
  const up = reelLanding(2400, 2800);
  assert.deepEqual(up.map(cell => cell.faces), [0, 4, 20, 20]);
  assert.equal(up[0].ms, 0, "the thousands window stays put");
  const down = reelLanding(2800, 2400);
  assert.ok(down.every(cell => cell.end <= cell.start && cell.end >= 0), "backward, never below the strip");
  assert.deepEqual(down.map(cell => cell.end % 10), [2, 4, 0, 0]);
  assert.equal(reelLanding(900, 900).every(cell => cell.faces === 0), true, "no change, no roll");
});

test("a live window turns the short way and snaps back to its middle run before running off the strip", () => {
  assert.deepEqual(reelStep(REEL.band + 9, 9, 0, 1), { from:REEL.band + 9, to:REEL.band + 10, steps:1, snapped:false },
    "90 to 100: one face forward, never nine back");
  assert.equal(reelStep(REEL.band, 0, 9, -1).steps, -1, "100 to 90: one face back");
  const edge = reelStep(REEL.faces - 2, 8, 2, 1);
  assert.equal(edge.snapped, true);
  assert.equal(edge.from, REEL.band + 8);
  assert.equal(edge.to % 10, 2);
});

test("a reel rolls only for a fresh change (and the count after it); reduced motion never rolls", () => {
  assert.equal(reelMotion({ now:1000 }).live, false, "a load or catch-up is placed");
  const opened = reelMotion({ animate:true, now:1000 });
  assert.equal(opened.live, true, "a fresh frame rolls");
  assert.equal(reelMotion({ now:1000 + REEL.freshMs - 1, liveUntil:opened.liveUntil }).live, true, "the count that follows it rolls");
  assert.equal(reelMotion({ now:1000 + REEL.freshMs + 1, liveUntil:opened.liveUntil }).live, false, "a later change is placed");
  assert.equal(reelMotion({ animate:true, reduced:true, now:1000 }).live, false);
  assert.equal(reelMotion({ motion:"always", now:0 }).live, true);
  assert.equal(reelMotion({ motion:"always", reduced:true }).live, false);
  assert.equal(reelMotion({ motion:"never", animate:true, now:0 }).live, false);
});

test("every reel rests on its value: live, landing and slim (the reduced-motion end state)", () => {
  assert.equal(restingDigits(render({ value:12300 })), "12300");
  const landing = render({ value:1600, from:0, at:"calc(var(--tl) + 240ms)" });
  assert.equal(restingDigits(landing), "1600");
  assert.match(landing, /--land-at:calc\(var\(--tl\) \+ 240ms\)/, "a scene's landing runs on the room's clock");
  assert.match(landing, /is-rolling/);
  const settled = render({ value:2800, from:2400, slim:true, label:"2,800" });
  assert.match(settled, /fd-reel is-slim is-landing/);
  assert.match(settled, /aria-label="2,800"/);
  assert.equal(restingDigits(settled), "2800");
  /* a window that does not move carries no roll */
  assert.equal((settled.match(/is-rolling/g) || []).length, 3);
});

test("reels sit where a number lands or changes; scanned lists stay plain numerals", () => {
  const podium = read("src/features/tv/TVPodium.jsx");
  assert.match(podium, /ScoreReel value=\{entry\.amount\} from=\{0\}[\s\S]*?at="calc\(var\(--tl\) \+ var\(--beat\)/,
    "a podium award rolls in on its own beat, on the server clock");
  assert.match(podium, /ScoreReel value=\{rail\.paid\}[\s\S]*?var\(--rail-at\)/);
  const tv = read("src/features/tv/TVMode.jsx");
  assert.match(tv, /from=\{row\.pts - delta\} motion="always" slim label/, "a mover's tower count lands on its reel");
  assert.match(tv, /: fmt\(row\.pts\)\}<\/span>/, "a tower that did not move keeps its plain numeral");
  assert.match(read("src/features/tv/TVChampion.jsx"), /<ScoreReel value=\{view\.pts\} drum[\s\S]*?from=\{playing \? 0 : null\}[\s\S]*?var\(--tl\)/,
    "the champion's stack spins up on the crown's hero drum, on the room's clock, and stands at rest");
  assert.match(read("src/features/results/LastCard.jsx"), /<ScoreReel value=\{pts\} drum[\s\S]*?from=\{0\}/, "and on every phone");
  assert.match(read("src/features/results/ChipReceipt.jsx"), /<ScoreReel value=\{total\}/);
  assert.match(read("src/features/duels/QuickDraw.jsx"), /from=\{drewNow\.current \? 0 : null\}/, "only a draw made on this screen lands");
  /* the thirteen rows are scanned: plain numerals, never reels */
  const standings = read("src/features/standings/Standings.jsx");
  assert.equal((standings.match(/<ScoreReel/g) || []).length, 1, "only the leader's count is a reel on the board");
});
