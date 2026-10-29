/* The pad's input (float/client/controller/SongScreen.jsx padHandlers, the
   listeners the pad puts on its element): every new touch outside a
   button is a tap at the touch's own time, one per finger, and the page
   does nothing else with it (no scroll, zoom, click or selection); a
   button's touch ([data-ui]: Done, Cheer) is the button's; a mouse, a pen,
   Space and Enter tap too; a touch's pointer event never taps twice. Then
   the tap itself through padTap: stamped, matched, gated. */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { chartOf, cueTime } from "../float/shared/chart.js";
import { createPad, padTap, serverStamp, stampOf } from "../float/client/controller/rhythm.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
async function bundle(contents, name) {
  const out = await build({ stdin:{ contents, resolveDir:ROOT, loader:"jsx", sourcefile:`${name}.jsx` }, bundle:true, platform:"node",
    format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", jsx:"automatic" });
  const mod = new Module(fileURLToPath(new URL(`float-controller-input-${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return mod.exports;
}
const { padHandlers } = await bundle(`export { padHandlers } from "./float/client/controller/SongScreen.jsx";`, "pad");

/* an element that may sit inside a button */
const target = (ui = false) => ({ closest:selector => (ui && /data-ui/.test(selector) ? {} : null) });
function touchEvent({ fingers = 1, timeStamp = 500, ui = false, cancelable = true } = {}) {
  const event = { type:"touchstart", timeStamp, cancelable, target:target(ui), changedTouches:Array.from({ length:fingers }, (_, k) => ({ identifier:k })),
    prevented:false, preventDefault() { this.prevented = true; } };
  return event;
}

test("a touch is a tap at its own time, one per finger, and the page does nothing else with it", () => {
  const taps = [];
  const on = padHandlers((at, event) => taps.push([at, event.type]));
  const one = touchEvent({ timeStamp:812.5 });
  on.touchstart(one);
  assert.deepEqual(taps, [[812.5, "touchstart"]]);
  assert.equal(one.prevented, true, "no scroll, no zoom, no click");
  on.touchstart(touchEvent({ fingers:2, timeStamp:900 }));
  assert.deepEqual(taps.slice(1), [[900, "touchstart"], [900, "touchstart"]], "two fingers at once are two taps");
  /* a touch that cannot be cancelled still taps */
  const loose = touchEvent({ cancelable:false, timeStamp:950 });
  on.touchstart(loose);
  assert.equal(loose.prevented, false);
  assert.equal(taps.length, 4);
});

test("a button's touch is the button's: Done and Cheer are never taps", () => {
  const taps = [];
  const on = padHandlers(at => taps.push(at));
  const done = touchEvent({ ui:true });
  on.touchstart(done);
  assert.deepEqual(taps, []);
  assert.equal(done.prevented, false, "the button gets its own touch");
});

test("a mouse, a pen and Space or Enter tap; a touch's own pointer event does not tap twice", () => {
  const taps = [];
  const on = padHandlers((at, event) => taps.push(`${event.type}:${at}`));
  on.pointerdown({ type:"pointerdown", pointerType:"mouse", button:0, timeStamp:10, target:target() });
  on.pointerdown({ type:"pointerdown", pointerType:"pen", button:0, timeStamp:20, target:target() });
  on.pointerdown({ type:"pointerdown", pointerType:"touch", button:0, timeStamp:30, target:target() });
  on.pointerdown({ type:"pointerdown", pointerType:"mouse", button:2, timeStamp:40, target:target() });
  on.pointerdown({ type:"pointerdown", pointerType:"mouse", button:0, timeStamp:50, target:target(true) });
  const key = code => ({ type:"keydown", code, repeat:false, timeStamp:60, target:target(), preventDefault() {} });
  on.keydown(key("Space"));
  on.keydown(key("Enter"));
  on.keydown(key("KeyA"));
  on.keydown({ ...key("Space"), repeat:true });
  on.keydown({ ...key("Space"), target:{ closest:selector => /textarea/.test(selector) ? {} : null } });
  assert.deepEqual(taps, ["pointerdown:10", "pointerdown:20", "keydown:60", "keydown:60"]);
});

test("the tap, as the touch handler makes it: stamped back to the touch, matched; the pad is always open", () => {
  const chart = chartOf("paddle");
  const songAt = 5_000_000;
  const pad = createPad();
  pad.song("s");
  /* the touch landed at 700 on the page's clock and was handled at 760 (a busy frame): it counts at 700 */
  const t = serverStamp(stampOf({ timeStamp:700 }, 760), { perfNow:760, serverNow:cueTime(songAt, 12) + 60 + 30 });
  assert.equal(t, cueTime(songAt, 12) + 30);
  const tap = padTap(pad, t, { chart, songAt, offset:0 });
  assert.equal(tap.open, true);
  assert.deepEqual(tap.found.hit, { t:"hit", c:2, r:30 });
  assert.equal(tap.found.q, "perfect");
  /* the breakdown (where the drink break was): an echo cue, an ordinary tap */
  const echo = chart.cues.find(cue => cue.kind === "echo");
  const copy = padTap(pad, cueTime(songAt, echo.beat) + 70, { chart, songAt });
  assert.deepEqual([copy.open, copy.found.c, copy.found.q], [true, echo.id, "nice"]);
  /* a demo is the host's: a tap on it matches nothing */
  const demo = chart.cues.find(cue => cue.demo);
  assert.equal(padTap(pad, cueTime(songAt, demo.beat), { chart, songAt }).found, null);
});
