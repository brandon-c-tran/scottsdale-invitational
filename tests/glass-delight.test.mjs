import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GLASS_TILT, leanToward, springStep, springSettled, paneTransform } from "../src/ui/useGlassTilt.js";
import * as motion from "../src/lib/motion.js";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/* ScoreReel's drum math is in a .jsx module; the same pure functions are
   mirrored here from the source so a change to one is a change to both. */
const reelSource = read("src/ui/ScoreReel.jsx");
const drumSteps = new Function(`return ${reelSource.match(/export function drumSteps[\s\S]*?\n}/)[0].replace("export ", "")}`)();

test("a drum rolls forward on a count up and back on a loss, never the long way", () => {
  assert.equal(drumSteps(9, 0, 1), 1, "90 to 100: the tens drum turns one face forward");
  assert.equal(drumSteps(0, 9, -1), -1, "100 to 90: one face back");
  assert.equal(drumSteps(2, 7, 1), 5);
  assert.equal(drumSteps(7, 2, -1), -5);
  assert.equal(drumSteps(4, 4, 1), 0);
  assert.match(reelSource, /faceDeg:36/, "ten faces round the ring");
  assert.match(reelSource, /radius:1\.5388/, "the ring radius is 1 / (2 tan 18deg) per face");
  assert.ok(Math.abs(1 / (2 * Math.tan(Math.PI / 10)) - 1.5388) < 1e-3);
  assert.match(read("src/ui/backglass.css"), /--r:calc\(var\(--reel-h\) \* 1\.5388\)/, "the CSS ring matches");
});

test("a flick spins whole turns only, so the reel always lands on your number", () => {
  assert.match(reelSource, /s\.angle \+= sign \* turns \* 360/);
  assert.match(reelSource, /flickTurns = speed => Math\.max\(1, Math\.min\(DRUM\.maxTurns/);
  assert.match(reelSource, /onClickCapture/, "a flick does not also tap what the reel sits in");
  assert.match(reelSource, /prefersReducedMotion\(\)\) return;/, "reduced motion never spins");
});

test("glass leans toward the finger: part way on a press, all the way on a drag", () => {
  const rect = { left:0, top:0, width:200, height:100 };
  const press = leanToward(200, 50, rect);
  assert.equal(press.x, GLASS_TILT.press);
  assert.equal(press.y, 0);
  const drag = leanToward(0, 0, rect, { dragging:true });
  assert.deepEqual(drag, { x:-1, y:-1 });
  assert.deepEqual(leanToward(10, 10, { width:0, height:0 }), { x:0, y:0 });
  assert.match(paneTransform({ x:1, y:0, z:1 }), /rotateY\(3\.000deg\) translateZ\(-5\.00px\)/, "the pressed side recedes and the glass sinks");
  assert.match(paneTransform({ x:0, y:0, z:0 }, { base:"matrix(1, 0, 0, 1, -255, 0)" }), /^matrix\(1, 0, 0, 1, -255, 0\) perspective/,
    "a pane's own transform (the rack's centring) is kept");
});

test("the spring returns level with at most a small overshoot and settles", () => {
  let pos = 1, vel = 0, peak = 0, frames = 0;
  while (!springSettled(pos, vel, 0) && frames < 600) {
    ({ pos, vel } = springStep(pos, vel, 0, 1 / 60));
    peak = Math.min(peak, pos);
    frames++;
  }
  assert.ok(frames < 120, `settles within two seconds (took ${frames} frames)`);
  assert.ok(peak < 0 && peak > -.2, `one small overshoot past level (${peak.toFixed(3)})`);
  /* a throttled frame cannot blow it up */
  const slow = springStep(1, 0, 0, 0.5);
  assert.ok(Math.abs(slow.pos) <= 1);
});

test("chips fly as coins between the rack and the board", () => {
  assert.deepEqual(motion.coinTurn(false).map(f => f.transform), ["rotateY(0deg)", "rotateY(720deg)"], "leaving the rack it spins on its edge");
  assert.deepEqual(motion.coinTurn(true).map(f => f.transform), ["rotateX(0deg)", "rotateX(360deg)"], "going home it flips");
  assert.equal(motion.EASE.drum, "cubic-bezier(.3,1.35,.5,1)");
  const wagers = read("src/features/wagers/Wagers.jsx");
  assert.match(wagers, /data-fly-coin=""/, "the rack's chips are coin ends");
  assert.match(wagers, /useFlightTarget\(`bets:rack:\$\{value\}`\)/, "the flight target is unchanged");
  assert.match(read("src/ui/motion.css"), /\.fd-flight\.is-coin \{ perspective:/);
});

test("depth and glare never run under reduced motion and only transform", () => {
  const glass = read("src/ui/glass-art.css"), back = read("src/ui/backglass.css");
  assert.match(glass, /prefers-reduced-motion:reduce\) \{ \.fd-glass-depth > svg \{ animation:none; transform:none; \}/);
  assert.match(back, /prefers-reduced-motion:reduce\) \{ \.fd-tilt-glare > span \{ animation:none/);
  assert.match(glass, /@supports \(animation-timeline:view\(\)\)/, "scroll drift only where scroll timelines run");
  const hook = read("src/ui/useGlassTilt.js");
  assert.doesNotMatch(hook, /deviceorientation|requestPermission/, "never asks iOS for motion permission");
  assert.match(hook, /prefersReducedMotion\(\)/);
});
