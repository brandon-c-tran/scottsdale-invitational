/* Float's recipes (the block at the end of src/lib/soundKit.js): every one
   registered and playable on its opts, every node released when its last
   source ends, the beds cut clean, every pitched note in D's five, the mix
   covering every recipe, the kit's constants matching the planners', and
   a scan that Float's sound reaches Web Audio only through the engine,
   the room bus only from the screen and the you bus only from the phone.
   Levels are measured offline (dev/sound-preview.html?selftest renders
   every recipe; the report's harness the mixes). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

globalThis.__FD_BUILD_ID__ = "build-test";
const kit = await import("../src/lib/soundKit.js");
const music = await import("../float/client/sound/music.js");
const river = await import("../float/client/sound/river.js");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* a recording context, enough for the kit */
function fakeContext() {
  class Param {
    constructor(v = 0) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; }
    linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); }
    exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw new Error(`an exponential ramp to ${v}`); this.events.push(["exp", v, t]); }
    cancelScheduledValues(t) { this.events.push(["cancel", t]); }
    setTargetAtTime() {}
  }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.connected = []; this.starts = [];
      for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"]) this[name] = new Param(1); }
    connect(node) { if (!node) throw new Error("connected to nothing"); this.connected.push(node); return node; }
    disconnect() { this.disconnected = (this.disconnected || 0) + 1; }
    start(t) { if (!Number.isFinite(t)) throw new Error("started at a bad time"); this.starts.push(t); }
    stop(t) { if (!Number.isFinite(t)) throw new Error("stopped at a bad time"); this.stopAt = t; }
  }
  return { currentTime:10, sampleRate:8000, destination:{}, nodes:[],
    node(kind) { const n = new Node(this, kind); this.nodes.push(n); return n; },
    createGain() { return this.node("gain"); }, createBiquadFilter() { return this.node("filter"); },
    createDynamicsCompressor() { return this.node("comp"); }, createConvolver() { return this.node("conv"); },
    createStereoPanner() { return this.node("pan"); }, createOscillator() { return this.node("osc"); },
    createBufferSource() { return this.node("src"); },
    createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; } };
}
const OPTS = [{},
  { leg:3, final:true, tense:5, bar:3, phrase:7, fill:true, crash:true, first:true, summary:true, n:12, grains:3, offsets:[0, 40, 90],
    pans:[-0.6, 0, 0.6], step:5, place:1, pose:"airguitar", big:true, small:true, side:"R", p:1, v:3, ms:900,
    from:{ ...river.RIVER_MIX.drop, roar:1, churn:1, crickets:1, laps:1, swirl:1 }, to:{ ...river.RIVER_MIX.pool, crickets:1, laps:1 } },
  { leg:0, tense:0, bar:1, drop:"suspend", pose:"chug", section:1 },
  { leg:2, tense:3, bar:2, phrase:5, drop:"land", pose:"backflip", section:3, cut:true },
  { leg:1, tense:2, bar:0, pose:"flex", section:2, step:-3, place:9, n:-1 }];

test("every Float recipe: registered, playable on its opts, every node released once its last source ends", () => {
  const ids = kit.FLOAT_PARTS.map(part => part.id);
  assert.equal(ids.length, 37);
  assert.ok(ids.every(id => id.startsWith("float")), "Float's ids are its own");
  assert.equal(new Set(ids).size, ids.length);
  for (const listen of ["tv", "phone"]) {
    const ctx = fakeContext();
    const E = kit.makeEngine(ctx, { listen });
    const base = ctx.nodes.length;
    for (const id of ids) for (const opts of OPTS) {
      ctx.nodes.length = base;
      assert.equal(kit.isSound(id), true, id);
      assert.equal(kit.SOUNDS[id], kit.FLOAT_PARTS.find(part => part.id === id), `${id}: the kit holds Float's own entry`);
      assert.ok(kit.playRecipe(E, id, 10, opts), id);
      const made = ctx.nodes.slice(base);
      const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
      assert.ok(sources.length > 0, `${id} makes sound`);
      assert.ok(sources.every(n => typeof n.onended === "function"), `${id}: every source reports its end`);
      assert.ok(sources.every(n => n.starts.every(t => t >= 10 - 1e-9)), `${id}: nothing starts before its time`);
      sources.forEach(n => n.onended());
      assert.ok(made.every(n => n.disconnected === 1), `${id} ${JSON.stringify(opts).slice(0, 40)}: every node released once`);
    }
    assert.equal(E.graph, undefined);
    assert.equal(E.cutDry, undefined, "no gate or mix left open between recipes");
  }
  /* where each one may sound */
  for (const part of kit.FLOAT_PARTS) assert.deepEqual(part.where, part.id === "floatDip" || part.id.startsWith("floatYou") ? ["phone"] : ["tv"], part.id);
});

/* the kick's strike (the pulse's): its mode starts at 52 Hz times 2.25 and drops */
const KICK_STRIKE = 52 * (1 + 1.25);
const struckAt = (ctx, from, f) => ctx.nodes.slice(from).filter(n => n.kind === "osc")
  .flatMap(n => n.frequency.events.filter(([kind, v]) => kind === "set" && Math.abs(v - f) < 1e-6).map(([, , t]) => Math.round((t - 10) * 1000)));

test("the beat: the pulse's kick and knock on every quarter of every bar (every leg, tense, final, the Drop's lip), and no kick between", () => {
  assert.deepEqual(kit.FLOAT_PULSE_STEPS, [0, 4, 8, 12], "a bar's four beats, 500 ms apart at 120 a minute");
  const ctx = fakeContext();
  const E = kit.makeEngine(ctx, { listen:"tv" });
  const beats = [0, 500, 1000, 1500];
  const B3 = kit.FLOAT_NOTES.B3, Fs3 = kit.FLOAT_NOTES.Fs3;
  for (const leg of [0, 1, 2, 3]) for (const tense of [0, 1, 2, 3, 4, 5]) for (const final of [false, true])
    for (const extra of [{}, { drop:"suspend" }, { drop:"land" }, { fill:true, crash:true }, { first:true }]) {
      const from = ctx.nodes.length;
      kit.playRecipe(E, "floatRace", 10, { leg, tense, final, bar:tense % 4, phrase:7, ...extra });
      const label = `leg ${leg} tense ${tense}${final ? " final" : ""} ${JSON.stringify(extra)}`;
      assert.deepEqual([...new Set(struckAt(ctx, from, KICK_STRIKE))].sort((a, b) => a - b), beats, `${label}: a kick on every beat and only there`);
      /* the knock: the bar's first beat on B, the rest on F sharp (its body drops 6% into pitch) */
      assert.deepEqual(struckAt(ctx, from, B3 * 1.06), [0], `${label}: the downbeat's knock`);
      assert.deepEqual(struckAt(ctx, from, Fs3 * 1.06).sort((a, b) => a - b), [500, 1000, 1500], `${label}: the other beats' knock`);
      ctx.nodes.filter(n => n.kind === "osc" || n.kind === "src").forEach(n => n.onended?.());
    }
  /* the vamp on the grid: the same pulse, so the practice is the race's beat */
  const from = ctx.nodes.length;
  kit.playRecipe(E, "floatVamp", 10, { bar:1 });
  assert.deepEqual([...new Set(struckAt(ctx, from, KICK_STRIKE))].sort((a, b) => a - b), beats);
  /* the count-in: the numbers carry the pulse, the sticks a knock, both on their beat; nothing low between */
  for (const [id, opts] of [["floatCount", { n:3 }], ["floatCount", { n:2 }], ["floatCount", { n:1, final:true }], ["floatCountTick", {}], ["floatCountTick", { final:true }]]) {
    const at = ctx.nodes.length;
    kit.playRecipe(E, id, 10, opts);
    assert.ok([B3, Fs3].some(f => struckAt(ctx, at, f * 1.06).includes(0)), `${id} ${JSON.stringify(opts)}: a knock on its beat`);
    const low = ctx.nodes.slice(at).filter(n => n.kind === "osc").flatMap(n => n.frequency.events
      .filter(([kind, v]) => kind === "set" && v < 260).map(([, , t]) => Math.round((t - 10) * 1000)));
    assert.ok(low.every(ms => ms <= 30 || ms >= 500), `${id} ${JSON.stringify(opts)}: nothing low between the beats, a strum's spread aside (${low})`);
    assert.ok(id === "floatCountTick" ? struckAt(ctx, at, KICK_STRIKE).length === 0 : struckAt(ctx, at, KICK_STRIKE).every(ms => ms === 0), `${id}: its kick on the beat`);
  }
  ctx.nodes.filter(n => n.kind === "osc" || n.kind === "src").forEach(n => n.onended?.());
});

test("your judged paddle: crisp on the beat (perfect brighter, with a glint), a muffled slap off it, and the plain dip without a judgement", () => {
  const ctx = fakeContext();
  const E = kit.makeEngine(ctx, { listen:"phone" });
  const play = opts => { const from = ctx.nodes.length; kit.playRecipe(E, "floatDip", 10, opts); return ctx.nodes.slice(from); };
  const plunk = nodes => nodes.filter(n => n.kind === "osc" && n.frequency.events.some(([kind, v]) => kind === "set" && v > 700 && v < 1300));
  const glint = nodes => nodes.filter(n => n.kind === "osc" && n.frequency.events.some(([kind, v]) => kind === "set" && v > 1400));
  const lowpass = nodes => nodes.filter(n => n.kind === "filter" && n.type === "lowpass" && n.frequency.value < 1000);
  for (const q of ["perfect", "good"]) assert.ok(plunk(play({ q, side:"L", v:0 })).length >= 1, `${q}: the blade's clean plunk`);
  assert.ok(glint(play({ q:"perfect", side:"R", v:0 })).length >= 1, "perfect: the glint over it");
  assert.equal(glint(play({ q:"good", side:"R", v:0 })).length, 0);
  for (const q of ["early", "late", "fast"]) {
    const nodes = play({ q, side:"L", v:1 });
    assert.equal(plunk(nodes).length, 0, `${q}: no clean plunk`);
    assert.ok(lowpass(nodes).length >= 1, `${q}: muffled`);
    assert.ok(nodes.filter(n => n.kind === "osc").every(n => !n.frequency.events.some(([kind, v]) => kind === "exp" && v < 380)), `${q}: no falling tone, never a loss`);
  }
  assert.ok(plunk(play({ side:"L", v:2 })).length >= 1, "no judgement: the plain dip");
  ctx.nodes.filter(n => n.kind === "osc" || n.kind === "src").forEach(n => n.onended?.());
});

test("the beds are cut recipes: a stopped bar goes silent, one not yet started never sounds, and the mix sits inside the gate", () => {
  const beds = ["floatRace", "floatVamp", "floatLounge", "floatRiver"];
  for (const id of kit.FLOAT_PARTS.map(part => part.id)) assert.equal(kit.cutSound(id), beds.includes(id), id);
  for (const id of beds) {
    const ctx = fakeContext();
    const E = kit.makeEngine(ctx, { listen:"tv" });
    const base = ctx.nodes.length;
    const handle = kit.playRecipe(E, id, 12, { bar:1, leg:2, tense:4 });
    assert.equal(typeof handle.stop, "function", id);
    const gates = ctx.nodes.slice(base, base + 2);
    assert.deepEqual(gates.map(n => n.connected[0]), [E.dry, E.wet], `${id}: the gate stands before the engine (the walkout duck still holds)`);
    const voices = ctx.nodes.slice(base + 2).filter(n => n.kind === "pan");
    const mixed = ctx.nodes.slice(base + 2, base + 4);
    const into = kit.FLOAT_MIX[id] === 1 ? gates[0] : mixed[0];
    if (kit.FLOAT_MIX[id] !== 1) assert.deepEqual(mixed.map(n => n.connected[0]), gates, `${id}: the mix's level goes through the gate`);
    assert.ok(voices.length && voices.every(n => n.connected.includes(into)), `${id}: every voice through the gate`);
    handle.stop();
    assert.ok(gates.every(n => n.gain.events.some(([kind, v, t]) => kind === "set" && v === 0 && t === 10)), `${id}: held silent before it starts`);
    ctx.currentTime = 13;
    const from = ctx.nodes.length;
    const ringing = kit.playRecipe(E, id, 12.5, { bar:2 });
    const ring = ctx.nodes.slice(from, from + 2);
    ringing.stop(); ringing.stop();
    for (const gate of ring) assert.deepEqual(gate.gain.events.filter(e => e[0] === "ramp"), [["ramp", 0, 13 + kit.CUT_FADE_S]], `${id}: fades once`);
    const made = ctx.nodes.slice(from);
    made.filter(n => n.kind === "osc" || n.kind === "src").forEach(n => n.onended());
    assert.ok(made.every(n => n.disconnected === 1), `${id}: nothing left running`);
    assert.equal(E.cutDry, undefined);
  }
});

test("every pitched note of the band is in D's five, and the score names only Float's notes", () => {
  const inD = new Set(["D", "E", "Fs", "A", "B"]);
  const names = Object.entries(kit.NOTE).map(([name, f]) => [name.replace(/\d/g, ""), f]);
  const noteOf = f => names.find(([, g]) => Math.abs(Math.log2(f / g) - Math.round(Math.log2(f / g))) < 1e-6)?.[0];
  for (const [name, f] of Object.entries(kit.FLOAT_NOTES)) {
    assert.ok(inD.has(name.replace(/\d/g, "")), `${name} is named in D`);
    assert.equal(noteOf(f), name.replace(/\d/g, ""), `${name} (${f} Hz) is that note`);
  }
  const used = [];
  const { turn, riff, lead, bass, chord, whirl, lounge } = kit.FLOAT_SCORE;
  riff.flat().forEach(note => used.push(note[1])); lead.flat().forEach(note => used.push(note[1]));
  Object.values(bass).flat().forEach(n => used.push(n)); Object.values(chord).flat().forEach(n => used.push(n));
  Object.values(whirl).flat().forEach(n => used.push(n));
  lounge.forEach(bar => { used.push(...bar.arp); bar.bass.forEach(([, n]) => used.push(n)); (bar.steel || []).forEach(([, n]) => used.push(n)); });
  assert.ok(used.length > 150);
  assert.deepEqual(used.filter(n => !(n in kit.FLOAT_NOTES)), [], "every note in the score is one of Float's");
  assert.deepEqual(turn, ["B", "B", "D", "E"]);
  assert.equal(riff.length, 4); assert.equal(lead.length, 4); assert.equal(lounge.length, 8);
  /* every note of a bar inside its bar */
  for (const bar of [...riff, ...lead]) for (const [step, , len] of bar) assert.ok(step >= 0 && step + len <= 16, `${step}+${len} fits the bar`);
  /* the turn is not Where and When's or Trivia's */
  assert.notDeepEqual(turn, kit.GEO_BED.map(bar => bar.root));
});

test("the kit and the planners agree: the bar, the river's layers, and a level for every recipe in the mix", () => {
  assert.equal(kit.FLOAT_BAR_S * 1000, music.BAR_MS);
  for (const mix of Object.values(river.RIVER_MIX)) for (const key of Object.keys(mix)) assert.ok(kit.FLOAT_RIVER_LAYERS.includes(key), key);
  assert.ok(["churn", "crickets", "level"].every(key => kit.FLOAT_RIVER_LAYERS.includes(key)));
  assert.deepEqual(Object.keys(kit.FLOAT_MIX).sort(), kit.FLOAT_PARTS.map(part => part.id).sort(), "every recipe has its level, and only Float's");
  assert.ok(Object.values(kit.FLOAT_MIX).every(k => k > 0 && k <= 3));
  /* the gun over its numbers, the fanfare over the band (the measured levels are the harness's) */
  const m = kit.FLOAT_MIX;
  assert.ok(m.floatGo > m.floatCount && m.floatPodium > m.floatRace);
});

test("the river's stretches overlap on equal-power ends, so the bed never dips where two meet", () => {
  assert.equal(river.RIVER_SEG_MS - river.RIVER_STEP_MS, river.RIVER_FADE_MS);
  const ctx = fakeContext();
  const E = kit.makeEngine(ctx, { listen:"tv" });
  const base = ctx.nodes.length;
  kit.playRecipe(E, "floatRiver", 10, { ms:river.RIVER_SEG_MS, fade:river.RIVER_FADE_MS, from:river.RIVER_MIX.riffle, to:river.RIVER_MIX.narrows });
  /* the two side envelopes: first gains whose ramps rise through sin and fall through cos */
  const envs = ctx.nodes.slice(base).filter(n => n.kind === "gain" && n.gain.events.filter(e => e[0] === "ramp").length === 8);
  assert.equal(envs.length, 2);
  const F = river.RIVER_FADE_MS / 1000;
  for (const env of envs) {
    const ramps = env.gain.events.filter(e => e[0] === "ramp");
    const rise = ramps.slice(0, 4), fall = ramps.slice(4);
    rise.forEach(([, v, t], k) => {
      const x = (k + 1) / 4;
      assert.ok(Math.abs(v - Math.sin(x * Math.PI / 2)) < 0.01, "rises on a sine");
      assert.ok(Math.abs(t - (10 + F * x)) < 1e-9);
    });
    /* where one stretch falls the next rises: their powers sum to one */
    fall.forEach(([, v], k) => {
      const up = rise[k][1];
      assert.ok(Math.abs(v * v + up * up - 1) < 0.02, "equal power where two stretches cross");
    });
  }
});

/* ── nothing but the engine ── */
const files = readdirSync(new URL("../float/client/sound/", import.meta.url)).filter(name => /\.(jsx?|mjs)$/.test(name));
test("Float's sound reaches Web Audio only through the engine; the room bus only from the screen, the you bus only from the phone", () => {
  assert.ok(files.length >= 6);
  for (const name of files) {
    const text = read(`float/client/sound/${name}`);
    assert.doesNotMatch(text, /AudioContext|webkitAudioContext|new Audio\(|createOscillator|createGain|createBufferSource|audioSession/, `${name}: no Web Audio`);
    assert.doesNotMatch(text, /soundKit\.js|__resetSoundEngine|__soundEngine/, `${name}: not the kit or the engine's test hooks`);
    for (const [, from] of text.matchAll(/from "([^"]+)"/g))
      assert.ok(from.startsWith("./") || ["react", "../../shared/protocol.js", "../../shared/tuning.js", "../../shared/beat.js", "../../../src/lib/sound.js",
        "../../../src/lib/serverClock.js"].includes(from), `${name} imports ${from}`);
    if (name !== "screen.js") assert.doesNotMatch(text, /cueAt\(|bus:\s*"room"/, `${name}: the room bus is the screen's`);
    if (name !== "controller.js") assert.doesNotMatch(text, /bus:\s*"(you|gm)"/, `${name}: the you bus is the phone's`);
  }
  assert.doesNotMatch(read("float/client/sound/controller.js"), /"floatOut"|"floatButton"|"floatCount"/, "the phone never sounds an elimination or the countdown");
  /* the block in the kit is the very last thing in the file, one block */
  const kitText = read("src/lib/soundKit.js");
  const start = kitText.indexOf("/* ════ FLOAT"), end = kitText.indexOf("/* ════ end of Float ════ */");
  assert.ok(start > 0 && end > start && kitText.slice(end).trim() === "/* ════ end of Float ════ */");
  assert.equal(kitText.slice(0, start).match(/floatParts|FLOAT_/g).length, 1, "the only Float token above the block registers it");
});
