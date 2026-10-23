/* An element that enters and later leaves runs two animations from one
   list: an entrance, then an exit with a long delay. When the exit fills
   backwards (both, backwards) and names its own from (0%) keyframe, that
   keyframe applies for the whole of its delay, and as the later animation
   in the list it wins: the entrance never shows. That is how the phone's
   You're up takeover popped in instead of fading, the crown's own chip sat
   in place instead of rising at 1.6s, the TV's face-off sides faded in
   place instead of slamming in, and the champion's tower stood full height
   while every other tower grew (found Oct 23). An exit holds its end with
   `forwards`, or leaves its from keyframe out (it then starts from
   whatever the entrance left). This scans every stylesheet in src. */
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
    else if (name.endsWith(".css")) files.push(path);
  }
})(join(ROOT, "src"));

const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
/* every @keyframes: the properties its from/0% keyframe sets, and every property it touches */
export function keyframesOf(css) {
  const out = new Map();
  const head = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = head.exec(css))) {
    let depth = 1, i = head.lastIndex;
    while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    const from = new Set(), all = new Set();
    for (const block of css.slice(head.lastIndex, i - 1).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const props = [...block[2].matchAll(/([\w-]+)\s*:/g)].map(p => p[1]).filter(p => p !== "animation-timing-function");
      props.forEach(p => all.add(p));
      if (/(^|,)\s*(from|0%)\s*(,|$)/.test(block[1].trim())) props.forEach(p => from.add(p));
    }
    out.set(m[1], { from, all });
  }
  return out;
}
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
  return out.map(s => s.trim());
}
/* the animation lists in `css` where a later, backwards-filling animation's
   from keyframe sets a property an earlier one in the list animates */
export function maskedEntrances(css, frames = keyframesOf(css)) {
  const found = [];
  const re = /(?:^|[;{\s])(?:animation|--ba|--fa)\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const list = items(m[1]).map(text => {
      const words = text.split(/\s+/);
      return { text, name:words.find(word => frames.has(word)), backwards:words.some(word => word === "both" || word === "backwards") };
    });
    for (let j = 1; j < list.length; j++) {
      const later = list[j];
      if (!later.name || !later.backwards) continue;
      for (let k = 0; k < j; k++) {
        const early = list[k];
        if (!early.name || early.name === later.name) continue;
        const props = [...frames.get(later.name).from].filter(p => frames.get(early.name).all.has(p));
        if (props.length) found.push({ line:css.slice(0, m.index).split("\n").length, masks:`${later.name} hides ${early.name} (${props.join(", ")})` });
      }
    }
  }
  return found;
}

test("an exit later in an animation list never hides the entrance before it", () => {
  const sheets = files.map(file => [file, strip(readFileSync(file, "utf8"))]);
  /* keyframes are global: an animation may name one from another sheet */
  const frames = new Map();
  for (const [, css] of sheets) for (const [name, kf] of keyframesOf(css)) if (!frames.has(name)) frames.set(name, kf);
  const bad = [];
  for (const [file, css] of sheets)
    for (const hit of maskedEntrances(css, frames)) bad.push(`${relative(ROOT, file)}:${hit.line} ${hit.masks}`);
  assert.deepEqual(bad, [], `give these exits \`forwards\` (or drop their from keyframe):\n${bad.join("\n")}`);
});

test("the scan catches the shape it guards against and leaves the safe ones alone", () => {
  const kf = "@keyframes in { from { opacity:0; } to { opacity:1; } } @keyframes out { from { opacity:1; } to { opacity:0; } }"
    + " @keyframes fade { to { opacity:0; } } @keyframes squash { 0% { transform:none; } 50% { transform:scale(.9); } 100% { transform:none; } }"
    + " @keyframes slide { from { transform:translateX(-90px); } to { transform:none; } }";
  const scan = rule => maskedEntrances(`${kf} .a { animation:${rule}; }`);
  assert.equal(scan("in 200ms both, out 400ms 7s both").length, 1, "the exit's from hides the entrance");
  assert.equal(scan("slide 400ms 900ms both, squash 300ms 1300ms both").length, 1, "a landing squash hides the slide");
  assert.equal(scan("in 200ms both, out 400ms 7s forwards").length, 0, "forwards: no fill during the delay");
  assert.equal(scan("in 200ms both, fade 400ms 7s both").length, 0, "no from keyframe: it starts from the entrance");
  assert.equal(scan("in 200ms both, squash 300ms 1s both").length, 0, "different properties");
  assert.equal(maskedEntrances(`@keyframes go-both-ways { from { opacity:1; } to { opacity:0; } } ${kf}`
    + " .b { animation:in 200ms both, go-both-ways 1s 2s forwards; }").length, 0, "a name with both in it is not a fill");
});
