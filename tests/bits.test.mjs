/* Bits (Oct 10, features/gags/bits): the registry's contract (ids, shapes,
   styles, lengths, beats, the still, cues on kit recipes inside the bit,
   a scene for every id), the camera (medium shots, the painting always
   covering the canvas, the cast in frame, moves on the bit's clock),
   pickBit's determinism and its no-repeat rule, the room's cues on the
   bit's clock (reduced motion's one summary, the reel's slow motion), the
   foley recipes, the rig's geometry and pose timing, the CSS convention
   every bit animates by (--ba from var(--tl), resting on its end state),
   and every scene's real markup. */
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
const { BITS, BIT_SHAPES, BIT_STYLES, LETTER_LAND_MS, LETTER_PLACES, MOMENT_MS, SHAPES, STYLES, beatVars, bitById, bitsOf, pickBit,
  seedHash } = registry;
/* idle (Oct 10): the downtime vignettes run longer and letter nothing */
const { IDLE_MS } = registry;
const camera = await import("../src/features/gags/bits/camera.js");
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
    else assert.ok(bit.ms >= IDLE_MS.min && bit.ms <= IDLE_MS.max, `${at} an idle vignette's ${bit.ms} ms`);
    assert.ok(bit.still >= 0 && bit.still <= bit.ms, `${at} still ${bit.still} inside the bit`);
    for (const [name, ms] of Object.entries(bit.beats)) {
      assert.match(name, /^[a-z][a-zA-Z0-9]*$/, `${at} beat ${name} names a custom property`);
      assert.ok(ms >= 0 && ms <= bit.ms, `${at} beat ${name} at ${ms} inside the bit`);
    }
    if (bit.shape === "idle") assert.equal(bit.letter, null, `${at} an idle vignette letters nothing`);
    else {
      assert.ok(bit.letter.at >= 0 && bit.letter.at <= bit.ms, `${at} the lettering lands inside the bit`);
      assert.ok(bit.still >= bit.letter.at + LETTER_LAND_MS, `${at} the still shows the name landed`);
      assert.ok(LETTER_PLACES.includes(bit.letter.place), `${at} lettered at ${bit.letter.place}`);
      assert.ok(bit.cast[bit.letter.over], `${at} letters a side it casts`);
    }
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
  assert.deepEqual(["quickdraw", "anvil", "roadrunner"].map(bitById).map(bit => [bit.id, bit.shape, bit.style]), [
    ["quickdraw", "versus", "action"], ["anvil", "loss", "slapstick"], ["roadrunner", "loss", "desert"],
  ]);
  const qd = bitById("quickdraw").beats;
  assert.ok(qd.twitch < qd.draw && qd.draw < qd.bang && qd.bang < qd.fall && qd.fall < qd.land, "the tell, the draw, the bang, the fall");
  assert.ok(qd.kick - qd.bang >= 30 && qd.kick - qd.bang <= 60, "the flash's frames, then the kick");
  assert.ok(qd.whip - qd.kick >= 300, "the camera stays for the skid");
  assert.ok(qd.fall - qd.whip >= 450 && qd.fall - qd.whip <= 900, "on B, nothing happens: a deadpan beat before the fall");
  assert.ok(qd.blow < qd.spin && qd.spin < qd.fumble && qd.fumble < qd.drop, "cool, then the fumble");
  const an = bitById("anvil").beats;
  assert.ok(an.notice - (an.shadow) > 1000 && an.drop - an.notice >= 200 && an.drop < an.hit, "the shadow, the look up, then the anvil");
  assert.ok(an.peel - an.hit >= 700, "the pancake holds before it peels");
  assert.ok(an.pop < an.look && an.limp - an.look >= 800, "back in shape, it looks at the room for a beat before it limps off");
  const rr = bitById("roadrunner").beats;
  assert.ok(rr.stop < rr.beep && rr.beep < rr.leave && rr.leave < rr.clear && rr.clear < rr.notice && rr.notice < rr.zip);
  assert.ok(rr.notice - rr.clear >= 300, "a beat with only the shadow");
  assert.ok(rr.arrive < rr.skid && rr.stop - rr.skid >= 250, "in like a shot, then a long skid");
  assert.ok(rr.notice < rr.windup && rr.zip - rr.windup >= 400, "the shadow winds itself up before it goes");
});

/* ── pickBit ── */

test("pickBit: the same seed picks the same bit on every screen, from the shape's pool", () => {
  for (const shape of SHAPES) for (let i = 0; i < 50; i++) {
    const seed = `contest:die:${i}`;
    const a = pickBit(shape, seed), b = pickBit(shape, seed);
    assert.equal(a.id, b.id, "deterministic");
    assert.equal(a.shape, shape);
  }
  assert.equal(pickBit("idle", "x")?.shape, "idle", "idle picks from its own pool");
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
    for (const shape of SHAPES) {
      const ids = bitsOf(shape).map(bit => bit.id);
      if (ids.length === 1) assert.equal(pickBit(shape, seed, ids).id, ids[0], "a pool of one plays its one");
      else if (ids.length > 1) assert.notEqual(pickBit(shape, seed, [ids[0]]).id, ids[0], `${shape}: the one just played waits`);
    }
  }
  assert.equal(pickBit("loss", "x", "not a list")?.shape, "loss", "a bad recent list is ignored");
});

/* ── the team bits (Oct 12) ── */

test("team bits: six of them, each casting a side of 3 to 7, versus and win only", () => {
  const { TEAM_MIN, TEAM_MAX, isTeamBit } = registry;
  const team = BITS.filter(isTeamBit);
  assert.deepEqual(team.map(bit => [bit.id, bit.shape, bit.style]), [
    ["dominoes", "versus", "slapstick"], ["tugofwar", "versus", "slapstick"], ["slowmowalk", "versus", "action"],
    ["pyramid", "win", "slapstick"], ["teamphoto", "win", "desert"], ["victorylap", "win", "action"],
  ]);
  assert.deepEqual([TEAM_MIN, TEAM_MAX], [3, 7]);
  for (const bit of team) {
    const roles = bit.shape === "versus" ? ["a", "b"] : ["a"];
    assert.deepEqual(Object.keys(bit.cast).sort(), roles, `${bit.id}: its roles`);
    for (const role of roles) assert.deepEqual([bit.cast[role].min, bit.cast[role].max], [TEAM_MIN, TEAM_MAX], `${bit.id}.${role}`);
    assert.equal(bit.letter.over, "a", `${bit.id}: letters the winners`);
  }
  assert.equal(bitsOf("loss").some(isTeamBit) || bitsOf("idle").some(isTeamBit), false, "a loss is one player; idle is the room");
  assert.equal(BITS.filter(bit => !isTeamBit(bit)).every(bit => Object.values(bit.cast).every(role => !role.min)), true,
    "the solo bits keep no minimum");
});

test("pickBit: a moment whose larger side has 3 or more picks a team bit, anything smaller a solo one", () => {
  const { isTeamBit, poolOf, poolKey, teamSized } = registry;
  const n = k => Array.from({ length:k }, (_, i) => ROSTER[i]);
  /* a versus picks by the larger of its two sides */
  for (const [a, b, team] of [[1, 1, false], [2, 2, false], [1, 2, false], [3, 3, true], [2, 3, true], [3, 1, true], [7, 6, true],
    [6, 7, true], [4, 6, true]]) {
    const sides = { a:n(a), b:n(b) };
    assert.equal(teamSized(sides), team, `${a} v ${b}`);
    assert.equal(teamSized({ a, b }), team, `${a} v ${b} as counts`);
    for (let i = 0; i < 40; i++) {
      const bit = pickBit("versus", `contest:volley:${i}`, [], sides);
      assert.equal(bit.shape, "versus");
      assert.equal(isTeamBit(bit), team, `${a} v ${b}: ${bit.id}`);
    }
  }
  for (const [k, team] of [[1, false], [2, false], [3, true], [5, true], [7, true]]) {
    const picks = new Set(Array.from({ length:60 }, (_, i) => pickBit("win", `w${i}`, [], { a:n(k) }).id));
    assert.ok([...picks].every(id => isTeamBit(bitById(id)) === team), `a win of ${k}`);
    if (team) assert.deepEqual([...picks].sort(), ["pyramid", "teamphoto", "victorylap"], `a win of ${k}: every team bit comes up`);
  }
  assert.equal(isTeamBit(pickBit("loss", "x", [], { a:n(5) })), false, "a loss has no team bits: the solo pool");
  assert.equal(isTeamBit(pickBit("versus", "x")), false, "no sides: the solo pool, as before");
  /* the solo picks are exactly what they were before the team bits existed */
  for (let i = 0; i < 40; i++) {
    const solo = bitsOf("versus").filter(bit => !isTeamBit(bit));
    assert.equal(pickBit("versus", `s${i}`, [], { a:["Adi", "Chiang"], b:["Ben", "Evan"] }).id,
      solo[seedHash(`versus:s${i}`) % solo.length].id, "the same seed, the same solo bit");
  }
  assert.deepEqual([poolKey("versus", { a:3, b:3 }), poolKey("versus", { a:2, b:2 }), poolKey("loss", { a:4 })], ["versus:team", "versus", "loss"]);
  assert.deepEqual(poolOf("win", { a:3 }).map(bit => bit.id), ["pyramid", "teamphoto", "victorylap"]);
});

test("pickBit in the team pool: deterministic on every screen, never a played one while another remains", () => {
  const sides = { a:SEVEN_PLAYERS(), b:SEVEN_PLAYERS().slice(0, 6) };
  const pool = registry.poolOf("versus", sides).map(bit => bit.id);
  assert.deepEqual(pool, ["dominoes", "tugofwar", "slowmowalk"]);
  for (let i = 0; i < 60; i++) {
    const seed = `contest:bball5:${i}`;
    assert.equal(pickBit("versus", seed, [], sides).id, pickBit("versus", seed, [], structuredClone(sides)).id, "the same on every screen");
    for (const played of pool) assert.notEqual(pickBit("versus", seed, [played], sides).id, played, "a played bit waits");
    assert.equal(pickBit("versus", seed, pool.filter(id => id !== "tugofwar"), sides).id, "tugofwar", "the one left");
    assert.notEqual(pickBit("versus", seed, [...pool.slice(1), pool[0]], sides).id, pool[0], "never the newest twice running");
  }
});
const SEVEN_PLAYERS = () => ROSTER.slice(0, 7);

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
  assert.deepEqual(geometry.clusterLayout(1), { shown:1, more:0, size:240, step:187, pair:false, xs:[0], reach:geometry.clusterLayout(1).reach });
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
    export { butteStaging, butteRock, butteHole } from "./src/features/gags/bits/butte.jsx";
    export { CastChip, CastSide, poseTimeline, poseLayerStyle } from "./src/features/gags/cast/CastChip.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("bits-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { BitStage, SCENES, CastSide, poseTimeline, poseLayerStyle, PlayerIdentityProvider, bitNameSize, butteStaging, butteRock, butteHole } = ui.exports;

const PROFILES = Object.fromEntries(ROSTER.map((player, i) => [player, { display:player === "Henry" ? "Henry Nguyen" : player,
  color:CHIP_COLORS[(i * 5) % CHIP_COLORS.length].hex, skin:"ticks", photoV:1 }]));
const PHOTOS = Object.fromEntries(ROSTER.map(player => [player, `data:image/svg+xml,${player}`]));
const stage = props => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:PROFILES },
  React.createElement(BitStage, { state:{ profiles:PROFILES }, photos:PHOTOS, ...props })));
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/* ── the camera ── */

const SAMPLE_CASTS = { versus:[{ a:["Khoa"], b:["Sahil"] }, { a:["Adi", "Chiang"], b:["Richard", "Allan"] },
  { a:["Adi", "Chiang"], b:["Sahil"] }, { a:["Khoa"], b:["Richard", "Allan"] },
  { a:["Brandon", "Evan", "Eyob", "Ben"], b:["Henry", "Jeremy", "Chinh", "Khoa", "Sahil", "Adi"] }], loss:[{ a:["Evan"] }],
  win:[{ a:["Eyob"] }, { a:["Adi", "Chiang"] }, { a:["Adi", "Chiang", "Ben", "Evan", "Eyob"] }, { a:["Brandon", "Evan", "Eyob", "Ben", "Henry", "Jeremy"] }] };
/* the team bits' sides (Oct 12): 3 to 7 a side, and an odd 2 v 3 or 3 v 7 */
const SEVEN = ["Brandon", "Evan", "Eyob", "Khoa", "Adi", "Chiang", "Richard"], SIX = ["Henry", "Jeremy", "Chinh", "Allan", "Sahil", "Ben"];
const TEAM_CASTS = {
  versus:[{ a:SEVEN.slice(0, 3), b:SIX.slice(0, 3) }, { a:SEVEN.slice(0, 4), b:SIX.slice(0, 5) }, { a:SEVEN, b:SIX }, { a:SIX, b:SEVEN },
    { a:SEVEN.slice(0, 2), b:SIX.slice(0, 3) }, { a:SIX.slice(0, 3), b:SEVEN }],
  win:[3, 4, 5, 6, 7].map(n => ({ a:SEVEN.slice(0, n) })),
};
const castsOf = bit => registry.isTeamBit(bit) ? TEAM_CASTS[bit.shape] : SAMPLE_CASTS[bit.shape] || [{}];

test("the camera: a clamped framing always covers the canvas with the painting, and puts the floor near the foot", () => {
  const { CAMERA } = camera;
  for (const framing of [{ zoom:0.4, x:0 }, { zoom:1, x:2400 }, { zoom:9, x:960 }, { zoom:1.8, x:-50 }, { zoom:1.07, x:960 }]) {
    const f = camera.clampFraming(framing);
    assert.ok(f.zoom >= CAMERA.minZoom && f.zoom <= CAMERA.maxZoom, `zoom ${f.zoom}`);
    const left = camera.toScreen(f, { x:0 }), right = camera.toScreen(f, { x:CAMERA.width });
    assert.ok(left.x <= 0.01 && right.x >= CAMERA.width - 0.01, `the painting spans the screen at ${JSON.stringify(f)}`);
    assert.ok(camera.toScreen(f, { x:0, y:0 }).y <= 0, "the sky reaches the top");
    assert.ok(camera.toScreen(f, { x:0, y:1080 }).y >= 1080, "the floor reaches the foot");
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
        /* the whole span in the two-shot: inside the TV's safe sides unless the cast is too big to fit at all */
        const left = camera.toScreen(base, { x:anchors.minX }).x, right = camera.toScreen(base, { x:anchors.maxX }).x;
        assert.ok(left >= 0 && right <= 1920, `${at} the cast in frame (${left} to ${right})`);
        if (base.zoom > camera.CAMERA.minZoom) assert.ok(left >= 63 && right <= 1857, `${at} inside the safe sides`);
      }
      const css = camera.cameraCss(registry.castBit(bit, cast), anchors);
      assert.match(css.css, new RegExp(`@keyframes ${css.name} \\{ 0% `), `${at} one keyframes from 0%`);
      assert.match(css.css, / 100% \{ transform:translate\(960px, 990px\) scale\(/, `${at} to 100%`);
      assert.equal(css.rest, camera.framingTransform(track[track.length - 1]), `${at} rests on its last framing`);
    }
    for (const shake of bit.camera.shakes || []) assert.ok(shake.at > 0 && shake.at < bit.ms, `${bit.id}: a shake inside the bit`);
    for (const wash of bit.camera.washes || []) assert.ok(wash >= 40 && wash < bit.ms, `${bit.id}: a white frame inside the bit`);
  }
  const versus = camera.cameraTrack(bitById("quickdraw"), SCENES.quickdraw.anchors(SAMPLE_CASTS.versus[0]))[0];
  assert.ok(versus.zoom * 240 >= 330 && versus.zoom * 240 <= 390, `a 1 v 1 two-shot as tight as both sides allow (${versus.zoom * 240} px)`);
  const big = camera.cameraTrack(bitById("quickdraw"), SCENES.quickdraw.anchors(SAMPLE_CASTS.versus[4]))[0];
  assert.ok(big.zoom < versus.zoom, "a bigger cast, a wider shot");
  const shot = camera.cameraTrack(bitById("quickdraw"), SCENES.quickdraw.anchors(SAMPLE_CASTS.versus[0]));
  assert.ok(camera.framingAt(shot, bitById("quickdraw").beats.bang + 200).zoom > versus.zoom, "a punch-in on the shot");
  assert.equal(camera.cameraCss({ id:"still", ms:3000, camera:{ zoom:1.8, x:900 } }).name, null, "no moves, no keyframes");
});

test("every registered bit has a scene", () => {
  assert.deepEqual(Object.keys(SCENES).sort(), BITS.map(bit => bit.id).sort());
  for (const bit of BITS) assert.equal(typeof SCENES[bit.id], "function", bit.id);
});

test("every scene draws on the painting with its cast, letters the name and the fact, on the bit's clock", () => {
  const casts = { versus:{ a:["Khoa"], b:["Sahil"] }, win:{ a:["Eyob"] }, loss:{ a:["Evan"] }, idle:{ a:["Evan", "Sahil", "Khoa"] } };
  for (const bit of BITS) {
    /* a team bit: every chip of a 7 v 6 (or a team of seven) on the stage */
    const cast = registry.isTeamBit(bit) ? TEAM_CASTS[bit.shape][2] || TEAM_CASTS[bit.shape][4] : casts[bit.shape];
    const html = stage({ bit:bit.id, cast, fact:bit.shape === "loss" ? "-1,000" : null, at:1234, frozen:true });
    assert.match(html, new RegExp(`class="bit-layer bit-art is-${bit.id} is-${bit.shape} is-frozen"`), bit.id);
    assert.match(html, /class="tv-desert is-glass tv-backdrop"/, `${bit.id}: on the session's painting`);
    assert.match(html, /<div class="bit-world" style="transform:translate\(960px, 990px\) scale\([\d.]+\) translate\(-[\d.]+px, -930px\)/,
      `${bit.id}: shot by its camera`);
    assert.match(html, /class="tv-desert is-glass bit-painting"/, `${bit.id}: the painting in the shot`);
    if (bit.shape === "idle") {
      assert.doesNotMatch(html, /class="bit-words/, `${bit.id}: an idle vignette letters nothing`);
      assert.doesNotMatch(html, /class="bit-dim"/, `${bit.id}: and keeps the painting at full light`);
      assert.match(html, /data-player="Evan"/, `${bit.id}: the room's first is cast`);
      assert.match(html, /data:image\/svg\+xml/, `${bit.id}: the stand-in photos reach the chips`);
      continue;
    }
    assert.match(html, new RegExp(`class="bit-words is-${bit.letter.place}"`), `${bit.id}: lettered where the shot leaves room`);
    assert.equal(/class="bit-wash"/.test(html), (bit.camera.washes || []).length > 0, `${bit.id}: a white frame only where it fires`);
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

test("the sky's dim lies over the painting and under the scene: no cast is ever dimmed (Oct 13)", () => {
  for (const id of ["pyramid", "statue", "quickdraw"]) {
    const bit = bitById(id);
    const cast = registry.isTeamBit(bit) ? { a:["Adi", "Chiang", "Richard"] } : bit.shape === "versus" ? { a:["Khoa"], b:["Sahil"] } : { a:["Eyob"] };
    const html = stage({ bit:id, cast, at:bit.still, frozen:true });
    const painting = html.indexOf("bit-painting"), dim = html.indexOf('class="bit-dim"'), scene = html.indexOf('class="bit-scene"');
    assert.ok(painting > 0 && dim > painting && scene > dim, `${id}: painting, then the dim, then the cast`);
    const worlds = [...html.matchAll(/<div class="bit-world[^"]*" style="([^"]*)"/g)].map(m => m[1]);
    assert.equal(worlds.length, 2, `${id}: the shot in two layers`);
    assert.equal(worlds[0], worlds[1], `${id}: on one camera`);
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
  assert.equal(bitNameSize("Henry Nguyen"), 110, "a real name letters at full size");
  const long = "Bartholomew Montgomery-Smythe";
  assert.ok(bitNameSize(long) < 110 && bitNameSize(long) >= 48, "a long one steps down to fit its corner");
  assert.ok(bitNameSize(long) * long.length * 0.52 <= 900, "on one line");
});

test("a glove's poses take turns on the bit's clock; at rest only the last shows", () => {
  const list = poseTimeline([["ready", 0], ["grip", 1900], ["point", 3500]]);
  assert.deepEqual(list.map(([pose]) => pose), ["ready", "grip", "point"]);
  const first = poseLayerStyle(list, 0), middle = poseLayerStyle(list, 1), last = poseLayerStyle(list, 2);
  assert.equal(first.opacity, 0);
  /* a START jump: an end jump can rest on its first value live (tests/stepped-fill.test.mjs) */
  assert.match(first["--ba"], /^cast-off 1ms step-start calc\(var\(--tl\) \+ 1900ms\) both$/);
  assert.equal(middle.opacity, 0);
  assert.match(middle["--ba"], /cast-on .*1900ms\) both, cast-off .*3500ms\) forwards/);
  assert.equal(last.opacity, 1);
  assert.equal(last.animation, "var(--ba)");
  assert.deepEqual(poseLayerStyle(poseTimeline("open"), 0), { opacity:1 }, "one pose: no motion");
  assert.deepEqual(poseTimeline("nope"), [["rest", 0]]);
});

/* ── idle (Oct 10): the downtime vignettes ── */

test("idle: six vignettes, each a story told on its beats in order, played once to an ending pose", () => {
  const idle = bitsOf("idle");
  assert.deepEqual(idle.map(bit => bit.id), ["nap", "armwrestle", "saguaro", "pushups", "sweep", "map"]);
  const order = (id, names) => {
    const beats = bitById(id).beats;
    names.reduce((prev, name) => { assert.ok(beats[name] > beats[prev], `${id}: ${prev} before ${name}`); return name; });
  };
  order("nap", ["mark1", "enter", "land", "twitch", "lift", "flee", "swat", "perch", "sigh"]);
  order("armwrestle", ["tiltA", "backA", "tiltB", "backB", "center", "look", "drip"]);
  order("saguaro", ["look", "reach1", "prick1", "reach2", "prick2", "exit", "enter", "set", "climb", "reach", "giveup", "lean", "prick3",
    "jump", "top", "face"]);
  order("pushups", ["down1", "up1", "down2", "up2", "down3", "up3", "down4", "strain", "collapse", "flat", "thumb"]);
  order("sweep", ["stroke1", "stroke2", "stroke3", "stroke4", "pat", "admire", "gust", "stare", "again", "again2"]);
  order("map", ["unfold1", "unfold2", "unfold3", "turn1", "turn2", "runner", "crumple", "toss", "rock", "bonk", "drop"]);
  const nap = bitById("nap").beats;
  assert.ok(nap.swat - nap.flee >= 20 && nap.swat - nap.flee <= 120, "the moth is off a beat before the glove lands");
  const aw = bitById("armwrestle");
  assert.ok(aw.ms - aw.beats.look >= 2500, "the look to the room holds");
  for (const bit of idle) {
    assert.equal(bit.cast.a.role, "room", `${bit.id}: cast from the room`);
    assert.ok(bit.still >= bit.ms * 0.6, `${bit.id}: reduced motion holds the ending, not the setup`);
    const base = camera.cameraTrack(bit, SCENES[bit.id].anchors?.({ a:["Evan"] }) || {})[0];
    assert.ok(base.zoom * 240 >= 380 && base.zoom * 240 <= 520, `${bit.id}: a medium shot (${base.zoom * 240} px)`);
  }
  const twins = stage({ bit:"armwrestle", cast:{ a:["Evan"] }, at:6000, frozen:true });
  assert.equal((twins.match(/data-player="Evan"/g) || []).length, 2, "a room of one wrestles a twin");
});

/* ── the slapstick bits (springglove, toohype, dynamite): their beats in
   order with the holds the joke needs, a still the stage has not started
   lifting off, and the pure staging that puts each hit where it lands ── */
const slapstick = new Module(fileURLToPath(new URL("bits-slapstick.cjs", import.meta.url)));
slapstick.filename = slapstick.id;
slapstick.paths = Module._nodeModulePaths(root);
slapstick._compile(buildSync({
  stdin:{ contents:`export { springStaging } from "./src/features/gags/bits/springglove.jsx";
    export { hypeStaging } from "./src/features/gags/bits/toohype.jsx";
    export { dynamiteMarks } from "./src/features/gags/bits/dynamite.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
}).outputFiles[0].text, slapstick.filename);
const { springStaging, hypeStaging, dynamiteMarks } = slapstick.exports;

test("the slapstick bits: beats in order, a deadpan hold before each hit, the still before the lift-off", () => {
  const order = (id, names) => {
    const beats = bitById(id).beats;
    names.slice(1).forEach((name, i) => assert.ok(beats[names[i]] < beats[name], `${id}: ${names[i]} before ${name}`));
    return beats;
  };
  const sg = order("springglove", ["hop", "turn", "raise", "press", "fire", "hit", "fly", "twinkle", "retract", "home", "boop", "look", "thumb"]);
  assert.ok(sg.raise - (sg.turn + 220) >= 300, "springglove: B sees it, and nothing happens for a beat");
  assert.ok(sg.twinkle - sg.fly >= 500, "springglove: the empty spot holds before the star");
  const th = order("toohype", ["hop1", "hop2", "hop3", "wind", "launch", "fall", "crash", "pop", "turn", "walk", "arrive"]);
  assert.ok(th.hop3 - th.hop2 > th.hop2 - th.hop1, "toohype: each bounce longer, higher");
  assert.ok(th.fall - th.launch >= 600, "toohype: the shoes alone for a beat");
  const dy = order("dynamite", ["strike", "light", "lit", "out", "admire", "realize", "look", "boom", "clear", "cough", "drop", "land"]);
  assert.ok(dy.boom - (dy.look + 420) >= 300, "dynamite: it looks at the room for a beat before the boom");
  for (const id of ["springglove", "toohype", "dynamite"]) {
    const bit = bitById(id);
    assert.equal(bit.style, "slapstick");
    assert.ok(bit.still <= bit.ms - registry.BIT_OUT_MS, `${id}: the still is held before the bit lifts off`);
  }
});

test("springglove's staging: the glove reaches into B, every star stays on the TV, for any side", () => {
  for (const [a, b] of [[1, 1], [2, 2], [4, 6], [1, 4]]) {
    const s = springStaging(a, b);
    const at = `${a}v${b}`;
    assert.ok(s.reach > 0 && s.ax < s.bx, `${at}: A left of B, a spring to cross`);
    assert.ok(s.contact.x > s.bx - s.lb.size / 2 && s.contact.x < s.bx, `${at}: the knuckles land in B's chip`);
    assert.ok(s.vp.x + (s.lb.shown - 1) * 34 <= 1760 && s.vp.y < 856, `${at}: the stars in the sky inside the painting`);
    assert.ok(s.minX < s.ax && s.maxX > s.bx, `${at}: the span holds both leads`);
  }
});

test("toohype's staging: it comes down off its shoes, a pair outward, and the shoes have a walk", () => {
  for (const n of [1, 2, 3]) {
    const s = hypeStaging(n);
    assert.equal(s.members.length, Math.min(n, 2));
    assert.equal(s.more, Math.max(0, n - 2));
    for (const m of s.members) {
      assert.ok(Math.abs(m.x1 - m.x0) > s.size, `${n}: it misses its shoes by more than a chip`);
      assert.ok(m.walk > 0.4 * s.size, `${n}: the shoes walk over`);
    }
    if (s.members.length === 2) assert.ok(s.members[0].dir < 0 && s.members[1].dir > 0, "a pair misses outward");
  }
  const marks = dynamiteMarks(240);
  assert.ok(marks.tip.y < marks.base.y, "dynamite: the fuse's tip is above the stick");
});

/* -- the deadpan desert's geometry (butte) -- */

test("butte: the finger lands on the stem, the crack falls with its strata, B's side fits the pit", () => {
  for (const [a, b] of [[1, 1], [2, 2], [4, 6]]) {
    const s = butteStaging(a, b);
    const rock = butteRock(s);
    assert.equal(rock.length, 5, "a cap and four strata");
    const at = `${a}v${b}:`;
    /* the stem's left face passes through the contact point */
    const holder = rock.find(piece => piece.key !== "cap" && piece.c.y + Math.min(...piece.points.map(p => p[1])) <= s.contact.y
      && piece.c.y + Math.max(...piece.points.map(p => p[1])) >= s.contact.y);
    assert.ok(holder, `${at} a stratum at the finger's height`);
    const left = Math.min(...holder.points.map(p => p[0])) + holder.c.x;
    assert.ok(Math.abs(left - s.contact.x) < 16, `${at} the finger meets the rock (${left} vs ${s.contact.x})`);
    assert.ok(s.contact.x > s.edge, `${at} past the lip`);
    const crack = rock.flatMap(piece => piece.crack);
    assert.ok(crack.length >= 10 && rock.filter(piece => piece.crack.length).length >= 3, `${at} the crack runs through the strata`);
    assert.ok(crack.every(seg => seg.at >= 0 && seg.at <= 200), `${at} the crack runs inside its 200 ms`);
    const pit = butteHole(s);
    const reach = s.bx + (s.lb.shown - 1) * s.lb.step + s.lb.size * 1.1;
    assert.ok(pit.x - pit.rx <= s.bx - s.lb.size * 0.5 && pit.x + pit.rx >= reach - 20, `${at} B's whole side drops into the pit`);
    assert.ok(pit.x - pit.rx > s.ax, `${at} A stands on the floor, not over the pit`);
  }
});

/* ── pairs (Oct 13): the doubles. In a solo bit a side of exactly two
   stands apart, each glove its own chip's, and both partners act ── */
const pairs = new Module(fileURLToPath(new URL("bits-pairs.cjs", import.meta.url)));
pairs.filename = pairs.id;
pairs.paths = Module._nodeModulePaths(root);
pairs._compile(buildSync({
  stdin:{ contents:`export { quickdrawStaging, quickdrawShooters } from "./src/features/gags/bits/quickdraw.jsx";
    export { springLaunchers } from "./src/features/gags/bits/springglove.jsx";
    export { walkSquad } from "./src/features/gags/bits/explosionwalk.jsx";
    export { sunsetStaging } from "./src/features/gags/bits/sunset.jsx";
    export { statueStaging } from "./src/features/gags/bits/statue.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
}).outputFiles[0].text, pairs.filename);
const { quickdrawStaging, quickdrawShooters, springLaunchers, walkSquad, sunsetStaging, statueStaging } = pairs.exports;
const PAIR_BITS = ["quickdraw", "springglove", "butte", "explosionwalk", "toohype", "sunset", "statue"];
/* two chips whose resting gloves never meet: feet further apart than both reaches */
const apart = (gap, size, at) => assert.ok(gap >= 2 * geometry.REST_REACH * size, `${at}: ${gap} px apart for ${size} px chips, the gloves clear`);

test("a pair stands apart: two chips at PAIR_STEP, every glove its own; a side of one, three or more as before", () => {
  const two = geometry.clusterLayout(2, { dir:-1 });
  assert.equal(two.pair, true);
  assert.equal(two.step, Math.round(two.size * geometry.PAIR_STEP));
  apart(two.step, two.size, "clusterLayout(2)");
  assert.equal(geometry.clusterLayout(1).pair, false);
  assert.equal(geometry.clusterLayout(3).pair, false, "three stand shoulder to shoulder");
  assert.ok(geometry.clusterLayout(3).step < two.size, "a cluster still clusters");
  assert.ok(geometry.isPair(["Adi", "Chiang"]) && geometry.isPair(2) && !geometry.isPair(3) && !geometry.isPair(["Adi"]));
  const tight = geometry.clusterLayout(2, geometry.PAIR_TIGHT);
  apart(tight.step, tight.size, "PAIR_TIGHT");
  /* each solo bit's own staging of a pair */
  const qd = quickdrawStaging(2, 2);
  apart(qd.la.step, qd.la.size, "quickdraw A");
  apart(qd.lb.step, qd.lb.size, "quickdraw B");
  const sg = springStaging(2, 2), sg12 = springStaging(1, 2);
  apart(2 * (960 - sg.ax), sg.la.size, "springglove's pincer");
  apart(2 * (960 - sg.bx), sg.lb.size, "springglove's favorites");
  apart(sg12.lb.step, sg12.lb.size, "springglove B against one");
  const ew = walkSquad(2);
  apart(ew.xs[1] - ew.xs[0], ew.size, "explosionwalk");
  const th = hypeStaging(2);
  apart(th.members[1].x0 - th.members[0].x0, th.size, "toohype");
  const ss = sunsetStaging(2), st = statueStaging(2);
  apart(ss.l.step, ss.l.size, "sunset");
  apart(st.l.step, st.l.size, "statue");
  /* the team bits keep the larger sides; a solo bit's cast never changes size by role */
  assert.ok(PAIR_BITS.every(id => !registry.isTeamBit(bitById(id))), "the solo pool");
});

test("a pair both act: both partners play the lead in every versus and win bit, the second a beat behind", () => {
  const casts = { versus:[{ a:["Adi", "Chiang"], b:["Richard", "Allan"] }, { a:["Adi", "Chiang"], b:["Sahil"] }, { a:["Khoa"], b:["Richard", "Allan"] }],
    win:[{ a:["Adi", "Chiang"] }] };
  const castOf = (html, player) => (new RegExp(`<div class="(cast[^"]*)" data-player="${player}" style="([^"]*)"`).exec(html) || []).slice(1);
  for (const id of PAIR_BITS) {
    const bit = bitById(id);
    for (const cast of casts[bit.shape]) {
      const at = `${id} ${cast.a.length}v${cast.b?.length || 0}`;
      const html = stage({ bit:id, cast, at:bit.still, frozen:true });
      for (const side of Object.values(cast)) {
        for (const player of side) assert.ok(castOf(html, player).length, `${at}: ${player} is cast`);
        if (side.length !== 2 || id === "toohype") continue;
        side.forEach(player => assert.match(castOf(html, player)[0], /\bis-lead\b/, `${at}: ${player} plays the lead`));
      }
      /* the winners' second goes a beat behind, where the bit has one */
      if (cast.a.length === 2 && bit.pairLag && !(id === "springglove" && cast.b.length === 1))
        assert.match(castOf(html, cast.a[1])[1], new RegExp(`--pd:${bit.pairLag}ms`), `${at}: the second a beat behind`);
    }
  }
  /* butte's pair: one at each lip, the second the first mirrored about the stem (its photo read the right way) */
  const butte = stage({ bit:"butte", cast:{ a:["Adi", "Chiang"], b:["Richard", "Allan"] }, at:1200, frozen:true });
  assert.match(butte, /class="bt-mirror" style="transform-origin:[\d.]+px 0px"/);
  assert.match(castOf(butte, "Chiang")[0], /\bcast-flip\b/);
  assert.doesNotMatch(castOf(butte, "Adi")[0], /\bcast-flip\b/);
});

test("a pair's second shooter: its own revolver up over its partner's head, its own shot, kick and fumble", () => {
  const [one, two] = quickdrawShooters(2, 2);
  assert.equal(one.lag, 0);
  assert.equal(two.lag, bitById("quickdraw").pairLag);
  assert.ok(two.x < one.x, "behind its partner");
  const top = geometry.castGeometry(quickdrawStaging(2, 2).la.size).top + geometry.CAST.floor;
  assert.ok(two.m.muzzleAim.y < top, `the second's muzzle (${two.m.muzzleAim.y}) is over its partner's head (${top})`);
  assert.equal(quickdrawShooters(1, 1).length, 1);
  const html = stage({ bit:"quickdraw", cast:{ a:["Adi", "Chiang"], b:["Richard", "Allan"] }, at:1000, frozen:true });
  assert.equal((html.match(/class="qd-shot"/g) || []).length, 2, "two flashes, two smokes, two loose revolvers");
  assert.ok((html.match(/\bbit-revolver\b/g) || []).length >= 6, "a revolver in each hand and each loose one");
  /* springglove: a pincer, a launcher at each end; against a pair each its own favorite a beat apart */
  const s2 = springStaging(2, 2), [l0, l1] = springLaunchers(s2);
  assert.ok(s2.pincer && l1.mirror && !l0.mirror, "the second is the first mirrored");
  assert.equal(l0.x + l1.x, 1920, "about the middle");
  assert.equal(l1.target, 1);
  assert.equal(l1.lag, bitById("springglove").pairLag);
  assert.ok(s2.contact.x > s2.bx - s2.lb.size / 2 && s2.contact.x < s2.bx, "the knuckles land in the nearer favorite");
  apart(2 * (960 - s2.bx), s2.lb.size, "the favorites back to back");
  assert.ok(s2.bx - s2.ax > s2.lb.size * 2, "a launcher's spring to cross");
  const single = springStaging(2, 1), [, solo] = springLaunchers(single);
  assert.equal(single.bx, 960, "one favorite in the middle");
  assert.equal(single.vp.x, 960, "and it goes straight up");
  assert.equal(solo.target, 0);
  assert.equal(solo.lag, 0, "against one, both land at once");
  const sgHtml = stage({ bit:"springglove", cast:{ a:["Adi", "Chiang"], b:["Richard", "Allan"] }, at:1000, frozen:true });
  assert.match(sgHtml, /class="sg-mirror cast-flip" style="transform-origin:960px 0px"/);
  const pincer = registry.castBit(bitById("springglove"), { a:["Adi", "Chiang"], b:["Sahil"] });
  assert.ok(pincer.camera.moves.every(move => move.x === undefined || move.x === "mid"), "a pincer is shot on the middle");
});

test("butte's pair pokes the stem from both lips: a pit centred on the stem, both fingers on the rock", () => {
  for (const b of [1, 2]) {
    const s = butteStaging(2, b);
    const at = `2v${b}:`;
    assert.ok(s.pincer, `${at} a pincer`);
    assert.ok(Math.abs(s.pillar - 960) < 1, `${at} the stem in the middle of the stage`);
    const pit = butteHole(s);
    assert.equal(pit.x, Math.round(s.pillar), `${at} the pit centred on the stem`);
    assert.ok(pit.x - pit.rx > s.ax, `${at} the first poker on the floor`);
    assert.ok(pit.x + pit.rx < 2 * s.pillar - s.ax, `${at} its mirror on the floor too`);
    const rock = butteRock(s);
    const holder = rock.find(piece => piece.key !== "cap" && piece.c.y + Math.min(...piece.points.map(p => p[1])) <= s.contact.y
      && piece.c.y + Math.max(...piece.points.map(p => p[1])) >= s.contact.y);
    const left = Math.min(...holder.points.map(p => p[0])) + holder.c.x, right = Math.max(...holder.points.map(p => p[0])) + holder.c.x;
    assert.ok(Math.abs(left - s.contact.x) < 16, `${at} the first finger meets the rock`);
    assert.ok(Math.abs(right - (2 * s.pillar - s.contact.x)) < 16, `${at} the second meets it on the far side (${right})`);
    const reach = s.bx + (s.lb.shown - 1) * s.lb.step + s.lb.size * 1.1;
    assert.ok(pit.x - pit.rx <= s.bx - s.lb.size * 0.5 && pit.x + pit.rx >= reach - 20, `${at} B's side drops into the pit`);
    if (b === 2) apart(s.lb.step, s.lb.size, `${at} the favorites`);
  }
  assert.equal(butteStaging(1, 2).pincer, false, "one winner against a pair keeps the one-sided staging");
});

test("castBit: a pair adds its second shot on the bit's clock, to the camera and the room's sound alike", () => {
  const qd = bitById("quickdraw");
  assert.equal(registry.castBit(qd, { a:["Khoa"], b:["Sahil"] }), qd, "a 1 v 1 plays the bit as registered");
  const two = registry.castBit(qd, { a:["Adi", "Chiang"], b:["Sahil"] });
  assert.notEqual(two, qd);
  assert.equal(registry.castBit(qd, { a:["Ben", "Evan"], b:["Richard", "Allan"] }), two, "the same object for the same match");
  assert.equal(registry.castBit(two, { a:["Adi", "Chiang"] }), two, "a cast bit casts to itself");
  assert.equal(two.camera.washes.length, qd.camera.washes.length + 1, "a second white frame");
  assert.ok(two.camera.washes.includes(qd.beats.bang + qd.pairLag));
  assert.ok(two.camera.shakes.some(shake => shake.at === qd.beats.bang + qd.pairLag && shake.big), "a second kick of the shot");
  assert.equal(two.cues.filter(cue => cue.sound === "bitCrack").length, 2, "two cracks");
  for (const bit of BITS.filter(b => b.pairs?.length)) {
    assert.ok(PAIR_BITS.includes(bit.id), `${bit.id}: only a solo bit has pairs`);
    assert.ok(bit.pairLag > 0 && bit.pairLag <= 400, `${bit.id}: a beat, not a pause`);
    for (const entry of bit.pairs) {
      assert.ok(Object.values(entry.sides).every(n => n === 2), `${bit.id}: a pair's entry`);
      for (const cue of entry.cues || []) {
        assert.ok(cue.at > 0 && cue.at < bit.ms, `${bit.id}: ${cue.sound} at ${cue.at} inside the bit`);
        assert.ok(kit.isSound(cue.sound), `${bit.id}: ${cue.sound} is a kit recipe`);
      }
      for (const shake of entry.shakes || []) assert.ok(shake.at > 0 && shake.at < bit.ms, `${bit.id}: a shake inside the bit`);
      for (const wash of entry.washes || []) assert.ok(wash >= 40 && wash < bit.ms, `${bit.id}: a white frame inside the bit`);
    }
  }
  const cues = bitCues("quickdraw", { start:10_000, cast:{ a:["Adi", "Chiang"], b:["Richard", "Allan"] } });
  assert.equal(cues.filter(cue => cue.id === "bitCrack").length, 2, "the room hears both shots");
  assert.equal(bitCues("quickdraw", { start:10_000 }).filter(cue => cue.id === "bitCrack").length, 1, "no cast, the bit as registered");
  const html = stage({ bit:"quickdraw", cast:{ a:["Adi", "Chiang"], b:["Richard", "Allan"] }, at:1000, frozen:true });
  assert.equal((html.match(/bit-wash \d+ms/g) || []).length, 2, "the stage flashes white twice");
});
