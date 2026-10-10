/* Bits (Oct 10, features/gags/bits): the registry's contract (ids, shapes,
   styles, lengths, beats, the still, cues on kit recipes inside the bit,
   a scene for every id), pickBit's determinism and its no-repeat rule, the
   room's cues on the bit's clock (reduced motion's one summary, the reel's
   slow motion), the foley recipes, the rig's geometry and pose timing, the
   CSS convention every bit animates by (--ba from var(--tl), resting on its
   end state), and every scene's real markup. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.timers.enable({ apis:["Date"], now:1_900_000_000_000 });
globalThis.__FD_BUILD_ID__ = "build-test";

const root = fileURLToPath(new URL("../", import.meta.url));
const { ROSTER, CHIP_COLORS } = await import("../shared/core.js");
const registry = await import("../src/features/gags/bits/registry.js");
const { BITS, BIT_SHAPES, BIT_STYLES, LETTER_LAND_MS, MOMENT_MS, SHAPES, STYLES, beatVars, bitById, bitsOf, pickBit, seedHash } = registry;
const kit = await import("../src/lib/soundKit.js");
const { bitCues } = await import("../src/features/tv/bitSound.js");
const geometry = await import("../src/features/gags/cast/castGeometry.js");
const { GLOVE_POSES, GLOVE_POSE_NAMES } = await import("../src/features/gags/cast/gloveArt.js");

/* ── the registry's contract ── */

test("every bit: a unique id, a shape and a style, a moment's length, its beats, still and cues inside it", () => {
  assert.ok(BITS.length >= 3, "the three exemplars");
  assert.equal(new Set(BITS.map(bit => bit.id)).size, BITS.length, "unique ids");
  for (const bit of BITS) {
    const at = `${bit.id}:`;
    assert.match(bit.id, /^[a-z][a-z0-9-]*$/, `${at} a plain id`);
    assert.ok(bit.name && typeof bit.name === "string", `${at} a name`);
    assert.ok(SHAPES.includes(bit.shape), `${at} shape ${bit.shape}`);
    assert.ok(STYLES.includes(bit.style), `${at} style ${bit.style}`);
    if (bit.shape !== "idle") assert.ok(bit.ms >= MOMENT_MS.min && bit.ms <= MOMENT_MS.max, `${at} ${bit.ms} ms`);
    assert.ok(bit.still >= 0 && bit.still <= bit.ms, `${at} still ${bit.still} inside the bit`);
    for (const [name, ms] of Object.entries(bit.beats)) {
      assert.match(name, /^[a-z][a-zA-Z0-9]*$/, `${at} beat ${name} names a custom property`);
      assert.ok(ms >= 0 && ms <= bit.ms, `${at} beat ${name} at ${ms} inside the bit`);
    }
    assert.ok(bit.letter.at >= 0 && bit.letter.at <= bit.ms, `${at} the lettering lands inside the bit`);
    assert.ok(bit.still >= bit.letter.at + LETTER_LAND_MS, `${at} the still shows the name landed`);
    assert.ok(bit.cast[bit.letter.over], `${at} letters a side it casts`);
    assert.ok(kit.isSound(bit.summary), `${at} summary ${bit.summary} is a kit recipe`);
    assert.ok(bit.cues.length > 0, `${at} has sound`);
    for (const cue of bit.cues) {
      assert.ok(cue.at >= 0 && cue.at <= bit.ms, `${at} cue ${cue.sound} at ${cue.at} inside the bit`);
      assert.ok(kit.isSound(cue.sound), `${at} cue ${cue.sound} is a kit recipe`);
      assert.ok(Math.abs(cue.pan || 0) <= 1, `${at} cue ${cue.sound} pans inside the room`);
    }
    assert.ok(bit.fits.length && bit.fits.every(trigger => BIT_SHAPES[bit.shape].triggers.includes(trigger)), `${at} fits its shape's triggers`);
    if (bit.shape === "versus") assert.ok(bit.cast.a && bit.cast.b, `${at} a versus casts both sides`);
    else if (bit.shape !== "idle") assert.ok(bit.cast.a, `${at} casts its player`);
    assert.ok(Object.isFrozen(bit) && Object.isFrozen(bit.beats) && Object.isFrozen(bit.cues), `${at} frozen`);
  }
  assert.deepEqual(Object.keys(BIT_STYLES), ["action", "slapstick", "desert"]);
  assert.deepEqual(SHAPES, ["versus", "win", "loss", "idle"]);
  assert.equal(bitById("quickdraw").shape, "versus");
  assert.equal(bitById("nope"), null);
  assert.deepEqual(beatVars(bitById("anvil"))["--b-hit"], `${bitById("anvil").beats.hit}ms`);
});

test("the exemplars keep their shape and style", () => {
  assert.deepEqual(BITS.map(bit => [bit.id, bit.shape, bit.style]), [
    ["quickdraw", "versus", "action"], ["anvil", "loss", "slapstick"], ["roadrunner", "loss", "desert"],
  ]);
  const qd = bitById("quickdraw").beats;
  assert.ok(qd.twitch < qd.draw && qd.draw < qd.bang && qd.bang < qd.fall && qd.fall < qd.land, "the tell, the draw, the bang, the fall");
  assert.ok(qd.fall - qd.bang >= 300 && qd.fall - qd.bang <= 700, "a deadpan beat between the bang and the fall");
  assert.ok(qd.blow < qd.spin && qd.spin < qd.fumble && qd.fumble < qd.drop, "cool, then the fumble");
  const an = bitById("anvil").beats;
  assert.ok(an.notice - (an.shadow) > 1000 && an.drop - an.notice >= 200 && an.drop < an.hit, "the shadow, the look up, then the anvil");
  assert.ok(an.peel - an.hit >= 700, "the pancake holds before it peels");
  const rr = bitById("roadrunner").beats;
  assert.ok(rr.stop < rr.beep && rr.beep < rr.leave && rr.leave < rr.clear && rr.clear < rr.notice && rr.notice < rr.zip);
  assert.ok(rr.notice - rr.clear >= 300, "a beat with only the shadow");
});

/* ── pickBit ── */

test("pickBit: the same seed picks the same bit on every screen, from the shape's pool", () => {
  for (const shape of ["versus", "loss"]) for (let i = 0; i < 50; i++) {
    const seed = `contest:die:${i}`;
    const a = pickBit(shape, seed), b = pickBit(shape, seed);
    assert.equal(a.id, b.id, "deterministic");
    assert.equal(a.shape, shape);
  }
  assert.equal(pickBit("idle", "x"), null, "a shape with no bits");
  assert.equal(pickBit("nope", "x"), null);
  const picked = new Set(Array.from({ length:200 }, (_, i) => pickBit("loss", `s${i}`).id));
  assert.deepEqual([...picked].sort(), bitsOf("loss").map(bit => bit.id).sort(), "every loss bit comes up");
  assert.equal(seedHash("abc"), seedHash("abc"));
  assert.notEqual(seedHash("abc"), seedHash("abd"));
});

test("pickBit: never one already played while another remains; never the newest twice running", () => {
  const pool = bitsOf("loss").map(bit => bit.id);
  for (let i = 0; i < 100; i++) {
    const seed = `r${i}`;
    for (const played of pool) {
      const pick = pickBit("loss", seed, [played]);
      assert.notEqual(pick.id, played, "a bit in recent is skipped");
    }
    const newest = pool[0];
    const all = pickBit("loss", seed, [...pool.slice(1), newest]);
    assert.notEqual(all.id, newest, "every bit played: not the newest again");
    assert.equal(pickBit("versus", seed, ["quickdraw"]).id, "quickdraw", "a pool of one plays its one");
  }
  assert.equal(pickBit("loss", "x", "not a list")?.shape, "loss", "a bad recent list is ignored");
});

/* ── the room's cues ── */

test("a bit's cues land on its own clock, open past a win song; reduced motion is its one summary", () => {
  const bit = bitById("quickdraw");
  const start = 5_000_000;
  const cues = bitCues(bit, { start, key:"t1" });
  assert.equal(cues.length, bit.cues.length);
  cues.forEach((cue, i) => {
    assert.equal(cue.at, start + bit.cues[i].at);
    assert.equal(cue.id, bit.cues[i].sound);
    assert.equal(cue.open, true);
  });
  assert.equal(new Set(cues.map(cue => cue.key)).size, cues.length, "one key each");
  const crack = cues.find(cue => cue.id === "bitCrack");
  assert.equal(crack.at, start + bit.beats.bang, "the crack lands on the bang");
  assert.deepEqual(bitCues("anvil", { start, reduced:true }).map(cue => [cue.id, cue.at]), [["bitClang", start]]);
  const slow = bitCues(bit, { start, rate:0.25 });
  assert.equal(slow.find(cue => cue.id === "bitCrack").at, start + bit.beats.bang * 4, "slow motion slows the clock");
  assert.equal(slow.find(cue => cue.id === "bitWind").opts.ms, bit.cues[0].opts.ms * 4, "and each cue's own length");
  assert.deepEqual(bitCues("nope", { start }), []);
  assert.deepEqual(bitCues(bit, {}), [], "no start, no cues");
});

/* ── the foley ── */

class Param { constructor(v = 0) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {}
  exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new Error(`an exponential ramp to ${v}`); } cancelScheduledValues() {} setTargetAtTime() {} }
class FakeNode {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind;
    for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"]) this[name] = new Param(1); }
  connect(node) { return node; } disconnect() { this.disconnected = (this.disconnected || 0) + 1; } start() {} stop() {}
}
class FakeContext {
  constructor() { this.currentTime = 10; this.sampleRate = 8000; this.destination = {}; this.nodes = []; }
  node(kind) { const n = new FakeNode(this, kind); this.nodes.push(n); return n; }
  createGain() { return this.node("gain"); } createBiquadFilter() { return this.node("filter"); }
  createDynamicsCompressor() { return this.node("comp"); } createConvolver() { return this.node("conv"); }
  createStereoPanner() { return this.node("pan"); } createOscillator() { return this.node("osc"); }
  createBufferSource() { return this.node("src"); }
  createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; }
}
test("the bits' foley: synthesized, playable on the TV and a phone, every node released once its sources end", () => {
  const ids = kit.BIT_PARTS.map(part => part.id);
  for (const needed of ["bitCrack", "bitRicochet", "bitClang", "bitWhistle", "bitStreak", "bitBeep", "bitThud", "bitWind", "bitBoing"])
    assert.ok(ids.includes(needed), `${needed} is in the kit`);
  const ctx = new FakeContext();
  const E = kit.makeEngine(ctx, { room:"sap", listen:"tv" });
  const base = ctx.nodes.length;
  for (const listen of ["tv", "phone"]) {
    kit.setListen(E, listen);
    for (const id of ids) for (const opts of [{}, { ms:900, from:0.4, to:-0.4, small:true, step:1 }]) {
      assert.ok(!kit.SOUND_IDS.includes(id), `${id} is a part, not one of the 26`);
      ctx.nodes.length = base;
      assert.ok(kit.playRecipe(E, id, 10, opts), id);
      const made = ctx.nodes.slice(base);
      const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
      assert.ok(sources.length > 0, `${id} makes sound`);
      assert.ok(sources.every(n => typeof n.onended === "function"), `${id}: every source reports its end`);
      sources.forEach(n => n.onended());
      assert.ok(made.every(n => n.disconnected === 1), `${id}: every node released once`);
    }
  }
  assert.equal(kit.SOUND_IDS.length, 26, "the 26 stay 26");
});

/* ── the rig ── */

test("the rig: everything hangs off the feet, scaled with the chip; a side shows four and counts the rest", () => {
  const g = geometry.castGeometry(240);
  assert.equal(g.size, 240);
  assert.ok(g.top < g.center.y && g.center.y < g.bottom && g.bottom <= 0, "the chip stands above its feet");
  assert.equal(g.hands.l.x, -g.hands.r.x, "the gloves mirror");
  assert.ok(g.hands.r.x > g.radius, "a glove floats clear of the chip");
  assert.equal(g.scale, 1);
  assert.ok(g.glove > g.scale, "the gloves are worn a size up");
  const half = geometry.castGeometry(120);
  assert.equal(half.hands.r.x * 2, g.hands.r.x);
  assert.equal(geometry.castGeometry(240, { shoes:false }).bottom, 0, "no shoes: the rim on the floor");
  assert.deepEqual(geometry.clusterLayout(1), { shown:1, more:0, size:240, step:187, xs:[0], reach:geometry.clusterLayout(1).reach });
  const six = geometry.clusterLayout(6, { dir:1 });
  assert.equal(six.shown, 4);
  assert.equal(six.more, 2);
  assert.ok(six.xs.every((x, i) => i === 0 || x > six.xs[i - 1]), "a side extends the way it is told");
  assert.ok(geometry.clusterLayout(4).size < geometry.clusterLayout(2).size, "a bigger side stands smaller chips");
  assert.equal(geometry.panAt(960), 0);
  assert.ok(geometry.panAt(0) < -0.8 && geometry.panAt(1920) > 0.8);
});

test("the gloves: every pose drawn the same way, the poses that hold something say where", () => {
  assert.deepEqual(GLOVE_POSE_NAMES, ["rest", "ready", "open", "fist", "grip", "point", "flat", "thumb"]);
  for (const [pose, art] of Object.entries(GLOVE_POSES)) {
    assert.ok(Array.isArray(art.groups) && art.groups.length >= 2, `${pose}: groups`);
    for (const group of art.groups) for (const part of group) {
      assert.ok(part[0] === "blob" || part[0] === "cap", `${pose}: a ${part[0]}`);
      assert.match(part[1], /^M/, `${pose}: a path`);
      if (part[0] === "cap") assert.ok(part[2] > 8 && part[2] < 24, `${pose}: a finger's width`);
    }
  }
  assert.ok(GLOVE_POSES.grip.held && GLOVE_POSES.point.held, "a grip and a finger can hold a prop");
});

/* ── the convention every bit animates by ── */

const cssFiles = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith(".css") ? [path] : [];
});
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "");
/* the comma-separated items of a list, ignoring commas inside parentheses */
const splitTop = value => {
  const out = []; let depth = 0, cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const allKeyframes = new Set(cssFiles(join(root, "src")).flatMap(file =>
  [...readFileSync(file, "utf8").matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])));

test("bits animate one way: --ba from the bit's clock, filled so each rests on its end state", () => {
  const files = cssFiles(join(root, "src/features/gags")).filter(file => !/gags\.css$/.test(file));
  assert.ok(files.length >= 6, "the stage, the rig, the props and three scenes");
  for (const file of files) {
    const css = stripComments(readFileSync(file, "utf8"));
    const name = file.slice(root.length).replaceAll("\\", "/");
    for (const m of css.matchAll(/(?<![-\w])animation\s*:\s*([^;}]+)/g))
      assert.match(m[1].trim(), /^var\(--ba\)( !important)?$/, `${name}: animate through --ba (${m[1].trim()})`);
    for (const m of css.matchAll(/--ba\s*:\s*([^;}]+)/g)) {
      if (m[1].trim() === "none") continue;
      for (const item of splitTop(m[1])) {
        const keyframes = item.split(/\s+/)[0];
        assert.ok(allKeyframes.has(keyframes), `${name}: @keyframes ${keyframes} exists`);
        assert.match(item, /calc\(var\(--tl\)/, `${name}: ${keyframes} runs on the bit's clock`);
        assert.match(item, /\b(both|forwards|infinite)\b/, `${name}: ${keyframes} keeps its end state`);
      }
    }
  }
});

test("each scene's CSS reads only beats its bit has", () => {
  for (const bit of BITS) {
    const css = stripComments(readFileSync(join(root, `src/features/gags/bits/${bit.id}.css`), "utf8"));
    for (const [, beat] of css.matchAll(/var\(--b-(\w+)\)/g))
      assert.ok(beat === "letter" || Object.hasOwn(bit.beats, beat), `${bit.id}.css reads --b-${beat}`);
  }
});

/* ── the real markup ── */

const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const compiled = buildSync({
  stdin:{ contents:`export { BitStage, BitLayer, bitNameSize } from "./src/features/gags/BitStage.jsx";
    export { SCENES } from "./src/features/gags/bits/scenes.jsx";
    export { CastChip, CastSide, poseTimeline, poseLayerStyle } from "./src/features/gags/cast/CastChip.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("bits-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { BitStage, SCENES, CastSide, poseTimeline, poseLayerStyle, PlayerIdentityProvider, bitNameSize } = ui.exports;

const PROFILES = Object.fromEntries(ROSTER.map((player, i) => [player, { display:player === "Henry" ? "Henry Nguyen" : player,
  color:CHIP_COLORS[(i * 5) % CHIP_COLORS.length].hex, skin:"ticks", photoV:1 }]));
const PHOTOS = Object.fromEntries(ROSTER.map(player => [player, `data:image/svg+xml,${player}`]));
const stage = props => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:PROFILES },
  React.createElement(BitStage, { state:{ profiles:PROFILES }, photos:PHOTOS, ...props })));
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("every registered bit has a scene", () => {
  assert.deepEqual(Object.keys(SCENES).sort(), BITS.map(bit => bit.id).sort());
  for (const bit of BITS) assert.equal(typeof SCENES[bit.id], "function", bit.id);
});

test("every scene draws on the painting with its cast, letters the name and the fact, on the bit's clock", () => {
  const casts = { versus:{ a:["Khoa"], b:["Sahil"] }, loss:{ a:["Evan"] } };
  for (const bit of BITS) {
    const cast = casts[bit.shape];
    const html = stage({ bit:bit.id, cast, fact:bit.shape === "loss" ? "-1,000" : null, at:1234, frozen:true });
    assert.match(html, new RegExp(`class="bit-layer bit-art is-${bit.id} is-${bit.shape} is-frozen"`), bit.id);
    assert.match(html, /class="tv-desert is-glass tv-backdrop"/, `${bit.id}: on the session's painting`);
    assert.match(html, /--tl:-1234ms/, `${bit.id}: held at the instant asked`);
    assert.match(html, new RegExp(`--b-letter:${bit.letter.at}ms`), `${bit.id}: the lettering's beat`);
    for (const [name, ms] of Object.entries(bit.beats)) assert.match(html, new RegExp(`--b-${name}:${ms}ms`), `${bit.id}: --b-${name}`);
    Object.values(cast).flat().forEach(player => assert.match(html, new RegExp(`data-player="${player}"`), `${bit.id}: ${player} cast`));
    const words = text(html);
    assert.match(words, new RegExp(PROFILES[cast[bit.letter.over][0]].display), `${bit.id}: the name is lettered`);
    if (bit.shape === "loss") assert.match(words, /-1,000/, `${bit.id}: the fact under it`);
    assert.match(html, /data:image\/svg\+xml/, `${bit.id}: the stand-in photos reach the chips`);
    assert.doesNotMatch(html, /class="cast-glove"[^>]*>\s*<\/svg>/, `${bit.id}: no empty glove`);
  }
});

test("reduced motion holds the bit's still; a screen joining late starts where the bit is", () => {
  const bit = bitById("anvil");
  const still = stage({ bit:"anvil", cast:{ a:["Evan"] }, reduced:true });
  assert.match(still, /is-frozen/);
  assert.match(still, new RegExp(`--tl:-${bit.still}ms`));
  const late = stage({ bit:"anvil", cast:{ a:["Evan"] }, start:Date.now() - 1500, reduced:false });
  assert.doesNotMatch(late, /is-frozen/);
  assert.match(late, /--tl:-1500ms/, "a TV that mounts 1.5 s in plays from there");
  const fresh = stage({ bit:"anvil", cast:{ a:["Evan"] }, reduced:false });
  assert.match(fresh, /--tl:-0ms|--tl:0ms/, "no start: from the top");
});

test("a side shows four shoulder to shoulder and counts the rest; a long name still fits", () => {
  const html = stage({ bit:"quickdraw", cast:{ a:["Brandon", "Evan"], b:["Henry", "Jeremy", "Chinh", "Khoa", "Sahil", "Adi"] }, at:0, frozen:true });
  assert.equal((html.match(/data-player="/g) || []).length, 6, "two and four");
  assert.match(text(html), /\+2/, "the rest counted");
  const side = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:PROFILES },
    React.createElement(CastSide, { players:["Evan", "Eyob", "Sahil"], x:500, dir:-1 })));
  assert.equal((side.match(/class="cast is-lead"/g) || []).length, 1);
  assert.equal((side.match(/class="cast is-mate"/g) || []).length, 2);
  assert.equal(bitNameSize("Henry Nguyen"), 156, "a real name letters at full size");
  const long = "Bartholomew Montgomery-Smythe";
  assert.ok(bitNameSize(long) < 156 && bitNameSize(long) >= 72, "a long one steps down to fit the sky");
  assert.ok(bitNameSize(long) * long.length * 0.52 <= 1600, "on one line");
});

test("a glove's poses take turns on the bit's clock; at rest only the last shows", () => {
  const list = poseTimeline([["ready", 0], ["grip", 1900], ["point", 3500]]);
  assert.deepEqual(list.map(([pose]) => pose), ["ready", "grip", "point"]);
  const first = poseLayerStyle(list, 0), middle = poseLayerStyle(list, 1), last = poseLayerStyle(list, 2);
  assert.equal(first.opacity, 0);
  assert.match(first["--ba"], /^cast-off 1ms step-end calc\(var\(--tl\) \+ 1900ms\) both$/);
  assert.equal(middle.opacity, 0);
  assert.match(middle["--ba"], /cast-on .*1900ms\) both, cast-off .*3500ms\) forwards/);
  assert.equal(last.opacity, 1);
  assert.equal(last.animation, "var(--ba)");
  assert.deepEqual(poseLayerStyle(poseTimeline("open"), 0), { opacity:1 }, "one pose: no motion");
  assert.deepEqual(poseTimeline("nope"), [["rest", 0]]);
});
