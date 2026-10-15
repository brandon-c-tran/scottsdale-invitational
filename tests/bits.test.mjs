/* Bits (Oct 10; the neon catalog since Oct 14, features/gags/bits): the
   registry's contract (ids, shapes, styles, lengths, beats, the still, the
   song's beats, cues on kit recipes inside the bit, a scene for every id),
   the catalog (Brandon's 32, by group), the camera (medium shots, the
   painting always covering the canvas, the cast in frame, moves on the
   bit's clock), pickBit's determinism, its no-repeat rule, its team pool
   (a side of 2 or more) and the needle scratch's song, the room's cues on
   the bit's clock, the foley recipes, the neon rig's geometry, the CSS
   convention every bit animates by (--ba from var(--tl), resting on its
   end state), the no-hands rule (the house hand is the only hand), a music
   bit's hold, and every scene's real markup. */
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
const { BITS, BIT_SHAPES, BIT_STYLES, IDLE_MS, LETTER_LAND_MS, LETTER_PLACES, MOMENT_MS, SHAPES, STYLES, TEAM_MAX, TEAM_MIN, beatVars,
  bitById, bitsOf, isTeamBit, pickBit, poolOf, seedHash } = registry;
const camera = await import("../src/features/gags/bits/camera.js");
const kit = await import("../src/lib/soundKit.js");
const { bitCues } = await import("../src/features/tv/bitSound.js");
const neonArt = await import("../src/features/gags/neon/neonArt.js");
const { holdBeatOf, songBeatOf } = await import("../shared/bitMusic.js");

/* Brandon's catalog (Oct 14): 32 bits, re-conceived as neon signs */
const CATALOG = Object.freeze({
  upset:["standoff", "flipper", "rockslide"],
  music:["headphones", "needledrop", "disco", "jukebox", "lowrider", "piano"],
  show:["sunset", "statue", "victoryspin", "fireworks"],
  loss:["anvil", "roadrunner", "quicksand", "dynamite", "vulture", "rake", "needlescratch"],
  team:["dominoes", "tugofwar", "slowmowalk", "pyramid", "teamphoto", "victorylap"],
  idle:["nap", "edgepush", "saguaro", "coinspin", "polish", "losttourist"],
});

/* ── the registry's contract ── */

test("every bit: a unique id, a shape and a style, a moment's length, its beats, still, song and cues inside it", () => {
  assert.equal(new Set(BITS.map(bit => bit.id)).size, BITS.length, "unique ids");
  for (const bit of BITS) {
    const at = `${bit.id}:`;
    assert.match(bit.id, /^[a-z][a-z0-9-]*$/, `${at} a plain id`);
    assert.ok(bit.name && typeof bit.name === "string", `${at} a name`);
    assert.ok(SHAPES.includes(bit.shape), `${at} shape ${bit.shape}`);
    assert.ok(STYLES.includes(bit.style), `${at} style ${bit.style}`);
    if (bit.shape !== "idle") assert.ok(bit.ms >= MOMENT_MS.min && bit.ms <= MOMENT_MS.max, `${at} ${bit.ms} ms`);
    else assert.ok(bit.ms >= IDLE_MS.min && bit.ms <= IDLE_MS.max, `${at} an idle vignette's ${bit.ms} ms`);
    assert.ok(bit.still >= 0 && bit.still <= bit.ms, `${at} still ${bit.still} inside the bit`);
    for (const [name, ms] of Object.entries(bit.beats)) {
      assert.match(name, /^[a-z][a-zA-Z0-9]*$/, `${at} beat ${name} names a custom property`);
      assert.ok(ms >= 0 && ms <= bit.ms, `${at} beat ${name} at ${ms} inside the bit`);
    }
    if (bit.shape === "idle") assert.equal(bit.letter, null, `${at} an idle vignette letters nothing`);
    else {
      assert.ok(bit.letter.at >= 0 && bit.letter.at <= bit.ms, `${at} the lettering lights inside the bit`);
      assert.ok(bit.still >= bit.letter.at + LETTER_LAND_MS, `${at} the still shows the name lit`);
      assert.ok(LETTER_PLACES.includes(bit.letter.place), `${at} lettered at ${bit.letter.place}`);
      assert.ok(bit.cast[bit.letter.over], `${at} letters a side it casts`);
    }
    if (bit.song) assert.ok(Object.hasOwn(bit.beats, bit.song.beat), `${at} the song's beat is one of its beats`);
    if (bit.song?.hold) assert.ok(Object.hasOwn(bit.beats, bit.song.hold), `${at} the hold is one of its beats`);
    assert.ok(kit.isSound(bit.summary), `${at} summary ${bit.summary} is a kit recipe`);
    assert.ok(bit.cues.length > 0, `${at} has sound`);
    for (const cue of bit.cues) {
      assert.ok(cue.at >= 0 && cue.at <= bit.ms, `${at} cue ${cue.sound} at ${cue.at} inside the bit`);
      assert.ok(kit.isSound(cue.sound), `${at} cue ${cue.sound} is a kit recipe`);
      assert.ok(Math.abs(cue.pan || 0) <= 1, `${at} cue ${cue.sound} pans inside the room`);
    }
    assert.ok(bit.fits.length && bit.fits.every(trigger => BIT_SHAPES[bit.shape].triggers.includes(trigger)), `${at} fits its shape's triggers`);
    if (bit.shape === "versus") assert.ok(bit.cast.a && bit.cast.b, `${at} a versus casts both sides`);
    else assert.ok(bit.cast.a, `${at} casts its player`);
    if (!isTeamBit(bit)) assert.ok(Object.values(bit.cast).every(role => role.max <= 2), `${at} a solo bit casts one a side (two in the room)`);
    assert.ok(Object.isFrozen(bit) && Object.isFrozen(bit.beats) && Object.isFrozen(bit.cues), `${at} frozen`);
  }
  assert.deepEqual(Object.keys(BIT_STYLES), ["music", "punchline", "songless"]);
  assert.deepEqual(SHAPES, ["versus", "win", "loss", "idle"]);
  assert.equal(bitById("standoff").shape, "versus");
  assert.equal(bitById("nope"), null);
  assert.deepEqual(beatVars(bitById("anvil"))["--b-hit"], `${bitById("anvil").beats.hit}ms`);
});

test("the catalog is Brandon's 32: three upsets, six music wins, four show wins, seven losses, six team bits, six idle", () => {
  const all = Object.values(CATALOG).flat();
  assert.equal(all.length, 32);
  assert.deepEqual(BITS.map(bit => bit.id).sort(), [...all].sort(), "exactly the catalog");
  for (const id of CATALOG.upset) assert.deepEqual([bitById(id).shape, bitById(id).style, isTeamBit(bitById(id))], ["versus", "punchline", false], id);
  for (const id of CATALOG.music) assert.deepEqual([bitById(id).shape, bitById(id).style], ["win", "music"], id);
  for (const id of CATALOG.show) assert.deepEqual([bitById(id).shape, bitById(id).style, isTeamBit(bitById(id))], ["win", "punchline", false], id);
  for (const id of CATALOG.loss) assert.deepEqual([bitById(id).shape, bitById(id).style, bitById(id).song], ["loss", "songless", null], id);
  for (const id of CATALOG.team) {
    const bit = bitById(id);
    assert.equal(isTeamBit(bit), true, id);
    assert.ok(["versus", "win"].includes(bit.shape), `${id}: a team's upset or run`);
    assert.equal(bit.style, "punchline", `${id}: the song on its punchline`);
    for (const role of Object.values(bit.cast)) assert.deepEqual([role.min, role.max], [1, TEAM_MAX], `${id}: a side of 1 to ${TEAM_MAX}`);
  }
  for (const id of CATALOG.idle) assert.deepEqual([bitById(id).shape, bitById(id).style, bitById(id).letter], ["idle", "songless", null], id);
  assert.deepEqual(CATALOG.idle.filter(id => bitById(id).cast.a.max === 2).sort(), ["coinspin", "edgepush"], "two chips: the contests");
  /* the needle scratch cuts a song still playing, on its own beat */
  const scratch = bitById("needlescratch");
  assert.equal(scratch.needs, "song");
  assert.ok(Object.hasOwn(scratch.beats, scratch.cut), "it cuts on one of its beats");
  assert.ok(scratch.cues.some(cue => cue.sound === "bitScratch" && cue.at === scratch.beats[scratch.cut]), "the scratch on the cut");
  assert.equal(BITS.filter(bit => bit.needs).length, 1, "nothing else needs a song");
});

test("pickBit: the same seed picks the same bit on every screen, from the shape's pool", () => {
  for (const shape of SHAPES) for (const seed of ["contest:die:c1", "result:putt", "x"]) {
    const a = pickBit(shape, seed), b = pickBit(shape, seed);
    assert.equal(a?.id, b?.id, `${shape} ${seed}`);
    if (a) assert.equal(a.shape, shape);
  }
  assert.equal(pickBit("nope", "x"), null);
  const picked = new Set(Array.from({ length:300 }, (_, i) => pickBit("loss", `s${i}`).id));
  assert.equal(picked.has("needlescratch"), false, "no song playing: never the needle scratch");
  assert.equal(picked.size, CATALOG.loss.length - 1, "every other loss gets its turn");
  const scratches = new Set(Array.from({ length:300 }, (_, i) => pickBit("loss", `s${i}`, [], null, { songPlaying:true }).id));
  assert.ok(scratches.has("needlescratch"), "a song playing: the needle scratch can play");
});

test("pickBit: never one already played while another remains; never the newest twice running", () => {
  for (const seed of ["a", "b", "c", "d"]) {
    const pool = poolOf("loss").map(bit => bit.id);
    for (const played of pool) assert.notEqual(pickBit("loss", seed, [played]).id, played, "a played one waits");
    const newest = pool[0];
    assert.notEqual(pickBit("loss", seed, [...pool.slice(1), newest]).id, newest, "never the newest twice running");
  }
  assert.equal(pickBit("loss", "x", "not a list")?.shape, "loss", "a bad recent list is ignored");
});

test("the team pool: a moment whose larger side has 2 or more plays a team bit, a 1 v 1 a solo one; a loss is always solo", () => {
  assert.equal(TEAM_MIN, 2);
  const n = k => ROSTER.slice(0, k);
  for (const [a, b, team] of [[1, 1, false], [2, 1, true], [1, 2, true], [2, 2, true], [3, 3, true], [7, 6, true]]) {
    for (let i = 0; i < 20; i++) {
      const bit = pickBit("versus", `contest:x:${a}${b}${i}`, [], { a:n(a), b:n(b) });
      assert.equal(isTeamBit(bit), team, `${a} v ${b}: ${bit.id}`);
    }
  }
  for (const k of [1, 2, 3, 7]) {
    const picks = new Set(Array.from({ length:60 }, (_, i) => pickBit("win", `w${i}`, [], { a:n(k) }).id));
    assert.ok([...picks].every(id => isTeamBit(bitById(id)) === k >= 2), `a win of ${k}`);
  }
  assert.equal(isTeamBit(pickBit("loss", "x", [], { a:n(5) })), false, "a loss has no team bits");
  assert.equal(isTeamBit(pickBit("versus", "x")), false, "no sides: the solo pool");
  const sides = { a:n(3), b:n(3) };
  const pool = poolOf("versus", sides).map(bit => bit.id);
  assert.deepEqual(pool, ["dominoes", "tugofwar", "slowmowalk"]);
  for (const seed of ["s1", "s2"]) {
    assert.equal(pickBit("versus", seed, [], sides).id, pickBit("versus", seed, [], structuredClone(sides)).id, "the same on every screen");
    assert.equal(pickBit("versus", seed, pool.filter(id => id !== "tugofwar"), sides).id, "tugofwar", "the one left");
  }
});

/* ── the room's cues ── */

test("a bit's cues land on its own clock; reduced motion is its one summary; slow motion slows them", () => {
  const bit = bitById("standoff");
  const start = 5_000_000;
  const cues = bitCues(bit, { start, key:"t1" });
  assert.equal(cues.length, bit.cues.length);
  cues.forEach((cue, i) => {
    assert.equal(cue.at, start + bit.cues[i].at);
    assert.equal(cue.id, bit.cues[i].sound);
    assert.equal(cue.open, true, "no song coming: all at full");
  });
  assert.equal(new Set(cues.map(cue => cue.key)).size, cues.length, "one key each");
  assert.equal(cues.find(cue => cue.id === "bitRicochet").at, start + bit.beats.ping, "the ricochet on the glance");
  assert.deepEqual(bitCues("anvil", { start, reduced:true }).map(cue => [cue.id, cue.at]), [["bitClang", start]]);
  const slow = bitCues(bit, { start, rate:0.25 });
  assert.equal(slow.find(cue => cue.id === "bitRicochet").at, start + bit.beats.ping * 4, "slow motion slows the clock");
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
test("the bits' foley: synthesized, the neon set included, playable on the TV and a phone, every node released", () => {
  const ids = kit.BIT_PARTS.map(part => part.id);
  for (const needed of ["neonBuzz", "neonFlick", "bitGroove", "bitNeedle", "bitScratch", "bitSwitch", "bitDisco", "bitCoin", "bitSputter",
    "bitBass", "bitHydraulic", "bitChord", "bitPlink", "bitFlipper", "bitBumper", "bitSpotlight", "bitSparks", "bitFirework", "bitBang",
    "bitRake", "bitRumble", "bitRoll", "bitEngine", "bitClang", "bitRicochet"])
    assert.ok(ids.includes(needed), `${needed} is in the kit`);
  const ctx = new FakeContext();
  const E = kit.makeEngine(ctx, { room:"sap", listen:"tv" });
  const base = ctx.nodes.length;
  for (const listen of ["tv", "phone"]) {
    kit.setListen(E, listen);
    for (const id of ids) for (const opts of [{}, { ms:900, from:0.4, to:-0.4, small:true, step:1, up:true }]) {
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

/* ── the neon rig ── */

test("the neon rig: tones are lamps with jobs, the hand's poses hold where they say, a team line fits seven", () => {
  const { NEON_TONES, HAND_POSES, HAND_POSE_NAMES, teamLine, panAt, circlePath } = neonArt;
  assert.deepEqual(Object.keys(NEON_TONES).sort(), ["amber", "bone", "clay", "cyan", "ember", "magenta", "player"]);
  assert.ok(Object.values(NEON_TONES).every(tone => !/filament|--you\b/.test(tone)), "never the filament: it is \"you\" alone");
  assert.deepEqual(HAND_POSE_NAMES, ["point", "cock", "flat", "pinch", "grip"]);
  for (const pose of HAND_POSE_NAMES) {
    assert.match(HAND_POSES[pose].d, /^M[-\d]/, `${pose}: an outline`);
    assert.ok(Number.isFinite(HAND_POSES[pose].at.x) && HAND_POSES[pose].at.x > 0, `${pose}: holds something ahead of the wrist`);
  }
  for (const n of [1, 2, 3, 5, 7]) {
    const line = teamLine(n);
    assert.equal(line.shown, n);
    assert.equal(line.xs.length, n);
    assert.ok(line.xs[0] === -line.xs[n - 1], `${n}: centred`);
    assert.ok(line.half * 2 * 1.07 <= 1920 - 128, `${n}: fits the TV's safe sides at the widest shot`);
  }
  assert.ok(teamLine(7).size < teamLine(2).size, "a bigger side stands smaller chips");
  assert.equal(teamLine(9).more, 2);
  assert.equal(panAt(960), 0);
  assert.ok(panAt(0) < 0 && panAt(1920) > 0);
  assert.match(circlePath(0, 0, 10), /^M-10 0a10 10/);
});

/* ── the convention every bit animates by ── */

const cssFiles = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith(".css") ? [path] : [];
});
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "");
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
  assert.ok(files.length >= 6, "the stage, the neon and the scenes");
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

test("no hands but the house's: the scenes draw no glove, no arm, no shoe; the old cartoon rig is gone", () => {
  const dir = join(root, "src/features/gags");
  const sources = readdirSync(join(dir, "bits")).filter(name => /\.(jsx|css)$/.test(name)).map(name => [name, readFileSync(join(dir, "bits", name), "utf8")]);
  for (const [name, text] of sources) {
    assert.doesNotMatch(text, /cast\/CastChip|cast\/gloveArt|GloveArt|CastChip|ShoeArt|props\/Props/, `${name}: no cartoon rig`);
    assert.doesNotMatch(text, /cast-glove|cast-hand|cast-shoe/, `${name}: no glove, hand or shoe layer`);
  }
  assert.throws(() => statSync(join(dir, "cast")), "the cartoon rig's folder is gone");
  assert.throws(() => statSync(join(dir, "props")), "and its props'");
  const dealer = readFileSync(join(root, "src/features/wagers/DealerGlove.jsx"), "utf8");
  assert.match(dealer, /HandArt/, "the betting table's dealer is the house hand");
  assert.doesNotMatch(dealer, /gloveArt|GLOVE_POSES/, "never the cartoon glove");
});

/* ── the real markup ── */

const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const compiled = buildSync({
  stdin:{ contents:`export { BitStage, BitLayer, bitNameSize } from "./src/features/gags/BitStage.jsx";
    export { SCENES } from "./src/features/gags/bits/scenes.jsx";
    export { HouseHand, NeonChip } from "./src/features/gags/neon/Neon.jsx";
    export { DealerGlove } from "./src/features/wagers/DealerGlove.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("bits-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { BitStage, SCENES, DealerGlove, PlayerIdentityProvider, bitNameSize } = ui.exports;

const PROFILES = Object.fromEntries(ROSTER.map((player, i) => [player, { display:player === "Henry" ? "Henry Nguyen" : player,
  color:CHIP_COLORS[(i * 5) % CHIP_COLORS.length].hex, skin:"ticks", photoV:1 }]));
const PHOTOS = Object.fromEntries(ROSTER.map(player => [player, `data:image/svg+xml,${player}`]));
const stage = props => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:PROFILES },
  React.createElement(BitStage, { state:{ profiles:PROFILES }, photos:PHOTOS, ...props })));
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/* ── the camera ── */

const SAMPLE_CASTS = { versus:[{ a:["Khoa"], b:["Sahil"] }], loss:[{ a:["Evan"] }], win:[{ a:["Eyob"] }],
  idle:[{ a:["Evan", "Sahil", "Khoa"] }] };
const SEVEN = ["Brandon", "Evan", "Eyob", "Khoa", "Adi", "Chiang", "Richard"], SIX = ["Henry", "Jeremy", "Chinh", "Allan", "Sahil", "Ben"];
const TEAM_CASTS = {
  versus:[{ a:SEVEN.slice(0, 2), b:SIX.slice(0, 2) }, { a:SEVEN.slice(0, 2), b:SIX.slice(0, 1) }, { a:SEVEN.slice(0, 1), b:SIX.slice(0, 2) },
    { a:SEVEN.slice(0, 3), b:SIX.slice(0, 3) }, { a:SEVEN, b:SIX }, { a:SIX, b:SEVEN }],
  win:[2, 3, 5, 7].map(n => ({ a:SEVEN.slice(0, n) })),
};
const castsOf = bit => isTeamBit(bit) ? TEAM_CASTS[bit.shape] : SAMPLE_CASTS[bit.shape] || [{}];

test("the camera: a clamped framing always covers the canvas with the painting, and puts the floor near the foot", () => {
  const { CAMERA } = camera;
  for (const framing of [{ zoom:0.4, x:0 }, { zoom:1, x:2400 }, { zoom:9, x:960 }, { zoom:1.8, x:-50 }, { zoom:1.07, x:960 }]) {
    const f = camera.clampFraming(framing);
    assert.ok(f.zoom >= CAMERA.minZoom && f.zoom <= CAMERA.maxZoom, `zoom ${f.zoom}`);
    const left = camera.toScreen(f, { x:0 }), right = camera.toScreen(f, { x:CAMERA.width });
    assert.ok(left.x <= 0.01 && right.x >= CAMERA.width - 0.01, `the painting spans the screen at ${JSON.stringify(f)}`);
  }
  assert.deepEqual(camera.toScreen({ zoom:2, x:960 }, { x:960, y:CAMERA.floor }), { x:960, y:CAMERA.screenFloor });
  assert.equal(camera.framingTransform({ zoom:2, x:900 }), "translate(960px, 990px) scale(2) translate(-900px, -930px)");
});

test("every bit is shot: medium shots, the cast in frame, every move on the bit's clock", () => {
  for (const bit of BITS) {
    const Scene = SCENES[bit.id];
    for (const cast of castsOf(bit)) {
      const anchors = Scene.anchors?.(cast) || {};
      const track = camera.cameraTrack(registry.castBit(bit, cast), anchors);
      const at = `${bit.id} ${Object.values(cast).map(side => side.length).join("v")}:`;
      assert.equal(track[0].at, 0, `${at} framed from the start`);
      track.forEach((point, i) => {
        assert.deepEqual(camera.clampFraming(point), { zoom:point.zoom, x:point.x }, `${at} every framing covers the canvas`);
        assert.ok(point.at <= bit.ms, `${at} the camera settles inside the bit`);
        if (i) assert.ok(point.at >= track[i - 1].at, `${at} in order`);
      });
      const base = track[0];
      if (bit.shape === "loss") assert.ok(base.zoom * 240 >= 400 && base.zoom * 240 <= 480, `${at} a solo medium shot (${base.zoom * 240} px)`);
      if (Number.isFinite(anchors.minX)) {
        const left = camera.toScreen(base, { x:anchors.minX }).x, right = camera.toScreen(base, { x:anchors.maxX }).x;
        assert.ok(left >= 0 && right <= 1920, `${at} the cast in frame (${left} to ${right})`);
      }
      const css = camera.cameraCss(registry.castBit(bit, cast), anchors);
      if (css.name) assert.match(css.css, new RegExp(`@keyframes ${css.name} \\{ 0% `), `${at} one keyframes from 0%`);
      assert.equal(css.rest, camera.framingTransform(track[track.length - 1]), `${at} rests on its last framing`);
    }
    for (const shake of bit.camera.shakes || []) assert.ok(shake.at > 0 && shake.at < bit.ms, `${bit.id}: a shake inside the bit`);
    for (const wash of bit.camera.washes || []) assert.ok(wash >= 40 && wash < bit.ms, `${bit.id}: a white frame inside the bit`);
  }
});

test("every registered bit has a scene", () => {
  assert.deepEqual(Object.keys(SCENES).sort(), BITS.map(bit => bit.id).sort());
  for (const bit of BITS) assert.equal(typeof SCENES[bit.id], "function", bit.id);
});

test("every scene draws in neon at night on the painting, with its cast, the name and the fact lit, on the bit's clock", () => {
  for (const bit of BITS) {
    const cast = isTeamBit(bit) ? TEAM_CASTS[bit.shape][bit.shape === "versus" ? 4 : 3] : SAMPLE_CASTS[bit.shape][0];
    const html = stage({ bit:bit.id, cast, fact:bit.shape === "loss" ? "-1,000" : null, at:1234, frozen:true });
    assert.match(html, new RegExp(`class="bit-layer bit-art is-${bit.id} is-${bit.shape} is-frozen"`), bit.id);
    assert.match(html, /class="tv-desert is-glass tv-backdrop"/, `${bit.id}: on the session's painting`);
    assert.match(html, /class="bit-night"/, `${bit.id}: gone to night`);
    assert.match(html, /<div class="bit-world" style="transform:translate\(960px, 990px\) scale\([\d.]+\) translate\(-[\d.]+px, -930px\)/,
      `${bit.id}: shot by its camera`);
    assert.match(html, /class="neon[ "]/, `${bit.id}: drawn in neon`);
    /* the slow-mo walk draws the favorites as their stacks going up on the horizon, not as chips */
    const players = bit.shape === "idle" ? cast.a.slice(0, bit.cast.a.max) : bit.id === "slowmowalk" ? cast.a : Object.values(cast).flat();
    players.forEach(player => assert.match(html, new RegExp(`data-player="${player}"`), `${bit.id}: ${player} cast`));
    assert.match(html, /data:image\/svg\+xml/, `${bit.id}: the stand-in photos reach the chips`);
    if (bit.shape === "idle") {
      assert.doesNotMatch(html, /class="bit-words/, `${bit.id}: an idle vignette letters nothing`);
      continue;
    }
    assert.match(html, new RegExp(`class="bit-words is-${bit.letter.place}"`), `${bit.id}: lettered where the shot leaves room`);
    assert.equal(/class="bit-wash"/.test(html), (bit.camera.washes || []).length > 0, `${bit.id}: a white frame only where it fires`);
    assert.match(html, /--tl:-1234ms/, `${bit.id}: held at the instant asked`);
    assert.match(html, new RegExp(`--b-letter:${bit.letter.at}ms`), `${bit.id}: the lettering's beat`);
    for (const [name, ms] of Object.entries(bit.beats)) assert.match(html, new RegExp(`--b-${name}:${ms}ms`), `${bit.id}: --b-${name}`);
    const words = text(html);
    assert.match(words, new RegExp(PROFILES[cast[bit.letter.over][0]].display), `${bit.id}: the name is lettered`);
    if (bit.shape === "loss") assert.match(words, /-1,000/, `${bit.id}: the fact under it`);
    /* the house hand is the only hand: every hand drawn is inside one */
    const hands = (html.match(/class="neon hh-art"/g) || []).length;
    const houses = (html.match(/class="hh[ "]/g) || []).length;
    assert.ok(hands <= houses * 6, `${bit.id}: a hand is the house's`);
  }
});

test("a music bit holds its wind-up: one thing moves while it waits, on its own rule", () => {
  for (const bit of bitsOf("win").filter(item => item.style === "music")) {
    const html = stage({ bit:bit.id, cast:{ a:["Eyob"] }, at:holdBeatOf(bit), frozen:true });
    assert.match(html, /bit-hold-loop/, `${bit.id}: something keeps moving while it holds`);
    const css = stripComments(readFileSync(join(root, `src/features/gags/bits/${bit.id}.css`), "utf8"));
    assert.match(css, new RegExp(`\\.is-${bit.id}\\.is-holding[^{]*\\{[^}]*--ba:[^;]*infinite`), `${bit.id}: its hold loop`);
    assert.ok(songBeatOf(bit) > holdBeatOf(bit), `${bit.id}: the action after the hold`);
  }
  const bits = readFileSync(join(root, "src/features/gags/bits.css"), "utf8");
  assert.match(bits, /\.bit-layer\.is-frozen\.is-holding \.bit-hold-loop \{ animation-play-state:running !important; \}/);
});

test("reduced motion holds the bit's still; a screen joining late starts where the bit is; a held music bit holds", () => {
  const bit = bitById("anvil");
  const still = stage({ bit:"anvil", cast:{ a:["Evan"] }, reduced:true });
  assert.match(still, /is-frozen/);
  assert.match(still, new RegExp(`--tl:-${bit.still}ms`));
  const late = stage({ bit:"anvil", cast:{ a:["Evan"] }, start:Date.now() - 1500, reduced:false });
  assert.doesNotMatch(late, /is-frozen/);
  assert.match(late, /--tl:-1500ms/, "a TV that mounts 1.5 s in plays from there");
  const hp = bitById("headphones");
  const hold = hp.beats.hover;
  const waiting = stage({ bit:"headphones", cast:{ a:["Eyob"] }, start:Date.now() - hold - 400, origin:Date.now() + 600, reduced:false });
  assert.match(waiting, /is-frozen is-holding/, "the song on its way: held");
  assert.match(waiting, new RegExp(`--tl:-${hold}ms`), "on its hold beat");
  const on = stage({ bit:"headphones", cast:{ a:["Eyob"] }, start:Date.now() - hold - 400, origin:Date.now() - hold - 200, reduced:false });
  assert.doesNotMatch(on, /is-holding/, "the song came: it runs on");
  assert.match(on, new RegExp(`--tl:-${hold + 200}ms`), "from its second clock");
});

test("the names fit: a long name still lands on one line in its column", () => {
  assert.ok(bitNameSize("Les Quizerables Reunited") >= 52);
  assert.ok(bitNameSize("Evan") <= 140);
});

test("the betting table's dealer is the house hand in neon: its sleeve runs back off the felt behind it", () => {
  const html = renderToStaticMarkup(React.createElement(DealerGlove, { pose:"flat", size:64 }));
  assert.match(html, /class="fd-glove neon-scope"/);
  assert.match(html, /class="neon hh-art"/);
  assert.match(html, /width:64px/);
  assert.match(renderToStaticMarkup(React.createElement(DealerGlove, { pose:"flat", size:180, flip:true })), /fd-glove neon-scope is-flip/);
});

test("seedHash is FNV-1a: the same text the same everywhere", () => {
  assert.equal(seedHash("abc"), seedHash("abc"));
  assert.notEqual(seedHash("abc"), seedHash("abd"));
});
