/* A one-shot stepped animation must hold its end with a START jump.
   Chrome can leave a finished animation's progress a hair under 1
   (0.9999999999998899 after a 1558.6 ms delay, measured Oct 12), and an
   END jump (step-end, steps(n, end), steps(n), jump-end) then rests on
   its FIRST value: a fill-forwards "show" never shows and a "hide" never
   hides. The bits' pose layers and props switched this way, so on a live
   TV hands stacked, guns stayed in hand and props doubled while every
   frozen frame looked right. Loops (infinite) and fill-less holds never
   rest on an end and are fine. This scans every stylesheet and every
   animation string in src. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(css|jsx?|mjs)$/.test(name)) files.push(path);
  }
})(join(ROOT, "src"));

const END_JUMP = /\bstep-end\b|\bsteps\(\s*\d+\s*(?:,\s*(?:end|jump-end)\s*)?\)/;
/* split an animation list on its top-level commas */
function items(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out;
}
export function offenders(source) {
  const found = [];
  source.split(/\r?\n/).forEach((line, k) => {
    if (!END_JUMP.test(line)) return;
    for (const item of items(line)) {
      if (!END_JUMP.test(item)) continue;
      if (/\binfinite\b/.test(item)) continue;
      if (/\btransition\b\s*:/.test(item)) continue;
      if (!/\b(both|forwards)\b/.test(item)) continue;
      found.push({ line:k + 1, text:item.trim().slice(0, 120) });
    }
  });
  return found;
}

test("a one-shot stepped animation that holds its end jumps at the start, never the end", () => {
  const bad = [];
  for (const file of files) {
    for (const hit of offenders(readFileSync(file, "utf8"))) bad.push(`${relative(ROOT, file)}:${hit.line} ${hit.text}`);
  }
  assert.deepEqual(bad, [], `use step-start (steps(n, start)) for these:\n${bad.join("\n")}`);
});

test("the scan catches the shapes it guards against and leaves loops alone", () => {
  assert.equal(offenders("--ba:bit-hide 1ms step-end calc(var(--tl) + 4080ms) both;").length, 1);
  assert.equal(offenders("animation:x 90ms steps(1, end) both;").length, 1);
  assert.equal(offenders("animation:x 900ms steps(6) 0ms forwards;").length, 1);
  assert.equal(offenders("--ba:a 1ms step-start 10ms both, b 32ms step-end 5ms 2 forwards;").length, 1);
  assert.equal(offenders("animation:x 1.2s steps(1, end) infinite;").length, 0);
  assert.equal(offenders("animation:x 900ms steps(1, end) calc(var(--tl) + 1s);").length, 0, "no fill: nothing rests");
  assert.equal(offenders("transition:fill 1.6s steps(6, end);").length, 0);
  assert.equal(offenders("animation:x 1ms step-start 5ms both;").length, 0);
});
