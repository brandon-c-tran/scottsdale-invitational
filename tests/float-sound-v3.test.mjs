/* Float's sound, v3 (float/GROOVE.md "v3 (Oct 28 evening: playtest 2 of
   the Groove)"): the blackout bars (a bare hi-hat, no calls, no answers,
   back in with a hit), Fireworks' rockets (the fuse on the call, the launch
   on the beat, every hit's burst a beat later panned to the rider, a miss's
   fizzle, the sky after the finale), Paddle Party's demo paddles as the
   host's, the new practice lines, Last Call's rush counts. */
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__FD_BUILD_ID__ = "build-test";
const chartMod = await import("../float/shared/chart.js");
const { chartOf } = chartMod;
const { BEAT_MS } = await import("../float/shared/beat.js");
const groove = await import("../float/client/sound/groove.js");
const screen = await import("../float/client/sound/grooveScreen.js");
const index = await import("../float/client/sound/index.js");
const { VOICE } = await import("../float/client/sound/voices.js");
const kit = await import("../src/lib/soundKit.js");
const T0 = 1_900_000_000_000;
const PRE = groove.GROOVE_PRE_MS;
const barOf = beat => Math.floor(beat / 4);

/* a chart shaped like Fireworks out of Paddle Party's: every Hey a rocket
   (the same lead of two), two blackout bars in play B */
function rocketChart({ dark = [24, 25] } = {}) {
  const base = chartOf("paddle");
  const cues = base.cues.map(c => (c.kind === "hey" ? { ...c, kind:"rocket", call:c.beat - 2 } : c));
  return { ...base, id:"fireworks", name:"Fireworks", scene:"night", cues, dark };
}

test("blackout bars: the band's bar is a bare hi-hat, no call and no answer in it, the next bar back in with a hit", () => {
  const chart = rocketChart(), events = groove.songEvents(chart), dark = new Set(chart.dark);
  assert.deepEqual([...groove.darkBars(chart)], chart.dark);
  const bars = events.filter(e => e.id === "floatGroove");
  assert.equal(bars.length, chart.bars);
  for (const e of bars) {
    assert.equal(!!e.opts.dark, dark.has(e.opts.bar), `bar ${e.opts.bar}: dark as charted`);
    assert.equal(!!e.opts.back, !dark.has(e.opts.bar) && dark.has(e.opts.bar - 1), `bar ${e.opts.bar}: back in after the dark`);
  }
  const host = events.filter(e => ["floatVoice", "floatWhirl", "floatEcho", "floatFuse"].includes(e.id) && !e.opts.narration);
  assert.equal(host.filter(e => dark.has(barOf(e.beat))).length, 0, "the host's calls stop in the dark");
  assert.equal(events.filter(e => e.id === "floatAnswer" && dark.has(barOf(e.beat))).length, 0, "the band answers nothing in the dark");
  /* every cue outside the dark keeps its answer, and every call outside it its call */
  const lit = chart.cues.filter(c => !dark.has(barOf(c.beat)));
  assert.equal(events.filter(e => e.id === "floatAnswer").length, lit.length);
  assert.ok(chart.cues.some(c => dark.has(barOf(c.beat))), "the fixture has cues in the dark (still judged, the room's)");
  /* the recipes: a dark bar is hats alone, the bar after it opens on a crash */
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" });
  const darkOpts = bars.find(e => e.opts.dark).opts;
  ctx.nodes.length = 0;
  kit.playRecipe(E, "floatGroove", 10, darkOpts);
  const srcs = ctx.nodes.filter(n => n.kind === "osc" || n.kind === "src");
  assert.ok(srcs.length > 0 && srcs.every(n => n.kind === "src"), "noise only: the hi-hat, no note");
  assert.ok(srcs.length <= 3, `one hat line (${srcs.length} sources)`);
  /* a song with no dark bars is untouched */
  const plain = groove.songEvents(chartOf("paddle"));
  assert.ok(plain.filter(e => e.id === "floatGroove").every(e => !e.opts.dark && !e.opts.back));
});

test("Fireworks' rockets: the fuse on the call, the launch on the beat, the sky after the finale", () => {
  const chart = rocketChart({ dark:[] }), events = groove.songEvents(chart);
  const rockets = chart.cues.filter(c => c.kind === "rocket");
  assert.deepEqual(events.filter(e => e.id === "floatFuse").map(e => e.beat), rockets.map(c => c.call), "a fuse on every call");
  assert.deepEqual(events.filter(e => e.id === "floatAnswer" && e.opts.kind === "rocket").map(e => e.beat), rockets.map(c => c.beat), "a launch on every beat");
  /* a fuse sizzles up to the next fuse at most */
  const fuses = events.filter(e => e.id === "floatFuse");
  fuses.slice(0, -1).forEach((e, k) => assert.ok(e.opts.after <= (fuses[k + 1].beat - e.beat) * BEAT_MS / 1000, "short of the next"));
  /* the sky: two beats after the last rocket, inside the song */
  const last = chart.cues.at(-1);
  assert.equal(last.kind, "rocket");
  assert.equal(groove.skyBeat(chart), last.beat + 2);
  assert.deepEqual(events.filter(e => e.id === "floatSky").map(e => e.beat), [last.beat + 2]);
  assert.equal(groove.skyBeat(chartOf("paddle")), null, "only a song that ends on rockets");
  assert.equal(index.ROCKET_BURST_MS, BEAT_MS, "the burst a beat after the launch");
  assert.equal(index.skyBeat, groove.skyBeat);
  /* the band ducks under the fuse like any call */
  const bar = events.find(e => e.id === "floatGroove" && e.opts.calls.some(([, k]) => k === "rocket"));
  assert.ok(bar, "a bar is told its rocket calls");
});

test("the Fireworks score: its own key, chords and hook, played bar by bar like the others", () => {
  const S = kit.GROOVE_SCORE.fireworks;
  assert.ok(S && S.big && S.chords.length === 8 && S.hook.length === 8, "eight bars of chords and hook");
  assert.ok(kit.GROOVE_SONG_IDS.includes("fireworks"));
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" });
  const chart = rocketChart();
  for (const ev of groove.songEvents(chart)) {
    ctx.nodes.length = 0;
    assert.ok(kit.playRecipe(E, ev.id, 10, ev.opts), `${ev.id} at ${ev.beat}`);
    const sources = ctx.nodes.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, `${ev.id} at ${ev.beat} sounds`);
    assert.ok(sources.every(n => n.starts.every(t => t >= 10 - 1e-9)), `${ev.id} ${ev.beat}: nothing before its time`);
  }
  /* B's last four bars lift a whole step, and the finale lands there (Bb to C) */
  const lead = opts => { ctx.nodes.length = 0; kit.playRecipe(E, "floatGroove", 10, { song:"fireworks", sec:"play", len:8, next:"play", only:["melody"], hits:[], calls:[], ...opts });
    return ctx.nodes.filter(n => n.kind === "osc" && n.type === "square").length; };
  assert.ok(lead({ part:1, k:4, bar:26 }) > 0);
});

test("the TV: a rocket's hit bursts a beat after its launch, panned to the rider and sized by the judgement; a miss fizzles; the dark's misses are silent", () => {
  const chart = rocketChart();
  const r = rig();
  r.emit("welcome", {});
  r.emit("room", room("lobby", r.now()));
  const start = r.now() + 100, songAt = start + 3000;
  r.set(start);
  r.emit("room", room("song", start, { song:"fireworks", chart, startAt:start, songAt, endsAt:songAt + 66000, round:4, rounds:5, field:[0, 1, 2] }));
  const rocket = chart.cues.find(c => c.kind === "rocket" && !chart.dark.includes(barOf(c.beat)));
  const cueAt = songAt + rocket.beat * BEAT_MS;
  r.set(cueAt + 120);
  r.emit("ev", { e:"hit", i:0, c:rocket.id, q:"perfect", d:4 });
  r.emit("ev", { e:"hit", i:2, c:rocket.id, q:"late", d:220 });
  const bursts = r.played.filter(p => p.id === "floatBurst");
  assert.deepEqual(bursts.map(p => [p.at, p.pan, p.opts.size, p.opts.q]), [[cueAt + groove.ROCKET_BURST_MS, -0.6, 1, "perfect"], [cueAt + groove.ROCKET_BURST_MS, 0.6, 0.3, "late"]]);
  r.set(cueAt + 560);
  r.emit("ev", { e:"hit", i:1, c:rocket.id, q:"miss" });
  assert.deepEqual(r.played.filter(p => p.id === "floatFizzle").map(p => [p.at, p.pan]), [[cueAt + 580, 0]]);
  assert.equal(r.played.filter(p => p.id === "floatFlub").length, 0, "a rocket's miss fizzles instead of the flub");
  /* a hit that lands after its burst's beat bursts as it lands */
  const next = chart.cues.find(c => c.kind === "rocket" && c.beat > rocket.beat + 1 && !chart.dark.includes(barOf(c.beat)));
  r.set(songAt + next.beat * BEAT_MS + 700);
  r.emit("ev", { e:"hit", i:1, c:next.id, q:"ok", d:150 });
  assert.equal(r.played.filter(p => p.id === "floatBurst").at(-1).at, r.now() + 20);
  /* a paddle missed in a blackout bar: nothing */
  const inDark = chart.cues.find(c => c.kind === "paddle" && chart.dark.includes(barOf(c.beat)));
  r.set(songAt + inDark.beat * BEAT_MS + 560);
  r.emit("ev", { e:"hit", i:0, c:inDark.id, q:"miss" });
  assert.equal(r.played.filter(p => p.id === "floatFlub").length, 0, "the dark is silent");
  /* outside it a miss still flubs */
  const lit = chart.cues.find(c => c.kind === "paddle" && c.beat > inDark.beat + 8 && !chart.dark.includes(barOf(c.beat)));
  r.set(songAt + lit.beat * BEAT_MS + 560);
  r.emit("ev", { e:"hit", i:0, c:lit.id, q:"miss" });
  assert.equal(r.played.filter(p => p.id === "floatFlub").length, 1);
  r.runner.stop();
});

test("the rocket's sounds: the fuse, the launch, a burst at each size, the fizzle, the sky and the phone's tap all play and release", () => {
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" });
  const run = (id, opts) => {
    ctx.nodes.length = 0;
    assert.ok(kit.playRecipe(E, id, 10, opts), id);
    const made = ctx.nodes.slice(), srcs = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(srcs.length > 0, `${id} sounds`);
    srcs.forEach(n => n.onended?.());
    assert.ok(made.every(n => n.disconnected === 1), `${id}: released`);
    return srcs;
  };
  run("floatFuse", { after:0.5 });
  run("floatAnswer", { kind:"rocket", n:1 });
  const small = run("floatBurst", { size:0.3, q:"late" }).length, big = run("floatBurst", { size:1, q:"perfect" }).length;
  assert.ok(big > small * 1.5, `a Perfect's burst is the biggest (${big} vs ${small})`);
  run("floatFizzle", { pan:0.4 });
  run("floatSky", {});
  const phoneE = kit.makeEngine(recorder(), { listen:"phone" });
  assert.ok(kit.playRecipe(phoneE, "floatYouTap", 10, { q:"perfect", kind:"rocket" }));
});

test("practice: the demo bar's paddles are the host's own, the new lines are said", () => {
  /* a demo paddle's answer: the host's paddle (the breakdown's), not the riders' splash */
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" });
  const shape = opts => { ctx.nodes.length = 0; kit.playRecipe(E, "floatAnswer", 10, opts); return ctx.nodes.map(n => n.kind).join(); };
  const echo = () => { ctx.nodes.length = 0; kit.playRecipe(E, "floatEcho", 10, { n:0 }); return ctx.nodes.map(n => n.kind).join(); };
  assert.equal(shape({ kind:"paddle", n:0, demo:true }), echo());
  assert.notEqual(shape({ kind:"paddle", n:0 }), echo());
  const base = chartOf("paddle");
  const withDemo = { ...base, cues:base.cues.map(c => (c.beat === 16 ? { ...c, demo:true, scored:false } : c)) };
  const ans = groove.songEvents(withDemo).find(e => e.id === "floatAnswer" && e.beat === 16);
  assert.equal(ans.opts.demo, true, "the planner marks a demo's answer");
  /* the lines */
  for (const [text, id] of [["Paddle on 1 and 3", "say-paddle"], ["Keep paddling. Hey! on 4", "say-keephey"], ["Watch", "say-watch"], ["Both now", "say-bothnow"]]) {
    assert.equal(groove.lineClip(text), id, text);
    assert.ok(VOICE.clips.some(c => c.id === id), `${id}: its clip`);
    assert.ok(kit.GROOVE_LINES.includes(id), `${id}: its recipe's name`);
  }
  assert.ok(VOICE.clips.some(c => c.id === "title-fireworks") && kit.GROOVE_LINES.includes("title-fireworks"), "Fireworks' title");
});

test("Last Call's rush: six, five and four said with the bartender's quick takes, 0.7 s apart, each over before the next", () => {
  for (const n of [6, 5, 4]) {
    const clip = VOICE.clips.find(c => c.id === `bar-${n}q`);
    assert.ok(clip && kit.GROOVE_BAR_LINES.includes(clip.id), `bar-${n}q`);
    assert.ok(clip.dur - clip.onset < 650, `bar-${n}q fits 0.7 s`);
  }
  /* a rush countdown, as chart.js lays it: 10 to 7 a second, then 0.7 s */
  const steps = [];
  let at = 3000;
  for (let n = 10; n >= 1; n--) { steps.push({ n, at, show:n > 3, say:n > 3, tick:false }); at += n <= 6 ? 700 : 1000; }
  const chart = { ...chartOf("lastcall-lights"), id:"lastcall-rush", countdown:{ ...chartOf("lastcall-lights").countdown, trick:"rush", first:false, introMs:3000, steps,
    hideAt:steps.find(s => s.n === 3).at, zeroAt:at, revealAt:at + 3300, verdictAt:at + 5800 } };
  const says = groove.songEvents(chart).filter(e => e.id === "floatBarVoice" && /^bar-\d/.test(e.opts.line));
  assert.deepEqual(says.map(e => e.opts.line), ["bar-10", "bar-9", "bar-8", "bar-7", "bar-6q", "bar-5q", "bar-4q"]);
  assert.deepEqual(groove.songEvents(chart).filter(e => e.id === "floatTrick").map(e => e.opts.trick), ["rush"]);
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" });
  assert.ok(kit.playRecipe(E, "floatTrick", 10, { trick:"rush" }));
});

/* ── the rigs ── */
function rig({ visible = true } = {}) {
  let now = T0;
  const handlers = {}, statusFns = [];
  const net = { on(type, fn) { (handlers[type] ||= new Set()).add(fn); return () => handlers[type].delete(fn); },
    onStatus(fn) { statusFns.push(fn); return () => {}; }, serverNow:() => now, status:() => "open" };
  const played = [];
  const play = (id, at, options) => {
    const entry = { id, at, laidAt:now, opts:options?.opts || {}, pan:options?.pan ?? 0, key:options?.key ?? null, lateMs:options?.lateMs ?? null, cancelled:false };
    played.push(entry);
    return { cancel() { entry.cancelled = true; } };
  };
  const runner = screen.createGrooveScreenSound(net, { play, visible:() => visible, setInterval:() => 0, clearInterval:() => {} });
  const emit = (type, msg = {}) => (handlers[type] || []).forEach(fn => fn({ s:now, ...msg }));
  const advance = (ms, step = 125) => { for (let t = 0; t < ms; t += step) { now += step; runner.tick(); } };
  return { played, runner, emit, advance, now:() => now, set:at => { now = at; } };
}
const entrants = n => Array.from({ length:n }, (_, i) => ({ device:`d${i}`, bot:i > 2, drinks:true }));
const room = (phase, s, extra = {}) => ({ phase, s, code:"BXRT", round:0, rounds:5, field:[0, 1, 2, 3, 4], out:[], entrants:entrants(5), ...extra });
function recorder() {
  class Param { constructor(v = 0) { this.value = v; this.events = []; } setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; }
    linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); } exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw new Error("exp to 0"); this.events.push(["exp", v, t]); }
    cancelScheduledValues() {} setTargetAtTime() {} }
  class Node { constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.type = ""; this.starts = []; for (const k of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release", "playbackRate"]) this[k] = new Param(1); }
    connect(n) { return n; } disconnect() { this.disconnected = (this.disconnected || 0) + 1; } start(t) { this.starts.push(t); } stop() {} }
  return { currentTime:10, sampleRate:8000, destination:{}, nodes:[], node(kind) { const n = new Node(this, kind); this.nodes.push(n); return n; },
    createGain() { return this.node("gain"); }, createBiquadFilter() { return this.node("filter"); }, createDynamicsCompressor() { return this.node("comp"); },
    createConvolver() { return this.node("conv"); }, createStereoPanner() { return this.node("pan"); }, createOscillator() { return this.node("osc"); },
    createBufferSource() { return this.node("src"); }, createBuffer(c, l) { return { length:l, numberOfChannels:c, getChannelData:() => new Float32Array(l) }; } };
}
