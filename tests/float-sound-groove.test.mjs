/* Float's sound in the Groove (float/GROOVE.md "Sound (the Groove)";
   float/client/sound/groove.js, grooveScreen.js, groovePhone.js, the
   Groove's block of the kit, the clip path in src/lib/sound.js): what
   plays at which beat of each song, the TV's song laid bar by bar from
   songAt on the exact beats (a TV joining mid-song from its next bar, no
   moment from a catch-up), the round card, the cut's drumroll and outs,
   the podium, the flubs (fresh, panned, a density rule, never a rider
   still chugging), the phone's taps, Through and Out, the host's voice
   (the manifest, the clips decoded through the clip path and played so
   their beat lands on the beat), and the recipes themselves. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

globalThis.__FD_BUILD_ID__ = "build-test";
const chartMod = await import("../float/shared/chart.js");
const { chartOf, BEAT_MS, BAR_MS, SONG_IDS, CUE_KINDS, SONG_LEAD_MS } = { ...chartMod, BEAT_MS:(await import("../float/shared/beat.js")).BEAT_MS };
const groove = await import("../float/client/sound/groove.js");
const screen = await import("../float/client/sound/grooveScreen.js");
const phone = await import("../float/client/sound/groovePhone.js");
const index = await import("../float/client/sound/index.js");
const { VOICE } = await import("../float/client/sound/voices.js");
const kit = await import("../src/lib/soundKit.js");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const T0 = 1_900_000_000_000;
const PRE = groove.GROOVE_PRE_MS;

/* ── the schedule ── */

test("every song: the band's bar on every bar's downbeat, told its section and the cues it answers", () => {
  assert.equal(PRE / 1000, kit.GROOVE_PRE_S, "the planner and the kit share the lead");
  for (const id of SONG_IDS) {
    const chart = chartOf(id), events = groove.songEvents(chart);
    const bars = events.filter(e => e.id === "floatGroove");
    assert.equal(bars.length, chart.bars, `${id}: one bar each`);
    bars.forEach((e, bar) => {
      assert.equal(e.beat, bar * 4, `${id} bar ${bar} on its downbeat`);
      const section = chart.sections.find(s => bar >= s.bar && bar < s.bar + s.bars);
      assert.equal(e.opts.sec, section.kind);
      assert.equal(e.opts.k, bar - section.bar);
      assert.equal(e.opts.mode, chart.modes[bar]);
      const mine = chart.cues.filter(c => Math.floor(c.beat / 4) === bar);
      assert.deepEqual(e.opts.hits, mine.map(c => [c.beat - bar * 4, c.kind]), `${id} bar ${bar}: its cues`);
    });
    assert.deepEqual(bars.filter(e => e.opts.part === 1 && e.opts.sec === "play").map(e => e.opts.bar)[0], 22, "play B is the second play");
    /* the outro's finish lands on its last cue */
    const outro = bars.find(e => e.opts.sec === "outro" && e.opts.k === 0);
    const last = chart.cues.at(-1);
    assert.equal(outro.opts.finish, last.beat - outro.opts.bar * 4, `${id}: the big finish on the last cue`);
  }
});

test("every cue: the band's answer on its own beat, and the host's call on its call beat", () => {
  for (const id of SONG_IDS) {
    const chart = chartOf(id), events = groove.songEvents(chart);
    const answers = events.filter(e => e.id === "floatAnswer");
    assert.equal(answers.length, chart.cues.length, `${id}: an answer per cue`);
    chart.cues.forEach((cue, i) => {
      assert.equal(answers[i].beat, cue.beat);
      assert.equal(answers[i].opts.kind, cue.kind);
    });
    for (const cue of chart.cues) {
      if (cue.call === null) continue;
      const at = beat => events.filter(e => e.beat === beat && (e.id === "floatVoice" || e.id === "floatWhirl"));
      if (cue.kind === "drop") {
        assert.deepEqual([0, 1, 2].map(j => at(cue.call + j).map(e => e.opts.line).join()), ["three", "two", "one"], `${id}: the countdown`);
        continue;
      }
      const calls = at(cue.call);
      assert.ok(calls.length >= 1, `${id}: a call at ${cue.call} for the ${cue.kind} at ${cue.beat}`);
      if (cue.kind === "hop") assert.equal(calls[0].opts.line, "ba");
      if (cue.kind === "spin") assert.equal(calls[0].id, "floatWhirl");
      if (cue.kind === "hey") assert.ok(["ready", "hey"].includes(calls[0].opts.line));
      assert.equal(cue.beat - cue.call, CUE_KINDS[cue.kind].lead, "the call leads its answer by the kind's lead");
    }
    /* a paddle's call is the pulse: no call of its own */
    assert.equal(events.filter(e => e.id === "floatVoice" || e.id === "floatWhirl").length,
      chart.cues.filter(c => c.call !== null).reduce((n, c) => n + (c.kind === "drop" ? 3 : 1), 0) + 10, `${id}: the calls, the counts, the two lines`);
  }
});

test("Paddle Party: paddles on one and three, the host's Ready two beats before every Hey on four, Hey Hey for a double", () => {
  const chart = chartOf("paddle"), events = groove.songEvents(chart);
  for (const bar of [2, 3, 4, 5, 6, 13, 22, 29]) {
    const answers = events.filter(e => e.id === "floatAnswer" && e.opts.kind === "paddle" && Math.floor(e.beat / 4) === bar).map(e => e.beat % 4);
    assert.deepEqual(answers, [0, 2], `bar ${bar}: splashes on one and three`);
  }
  const heys = events.filter(e => e.id === "floatAnswer" && e.opts.kind === "hey");
  assert.ok(heys.length >= 12);
  for (const hey of heys) {
    const call = events.find(e => e.id === "floatVoice" && e.beat === hey.beat - 2);
    const double = heys.some(h => h !== hey && Math.abs(h.beat - hey.beat) === 0.5);
    assert.equal(call?.opts.line, double ? "hey" : "ready", `the call for the Hey at ${hey.beat}`);
  }
  /* the first Hey of the song is practice's, on bar 3's fourth beat (beat 15), called on its second (13) */
  assert.equal(heys[0].beat, 15);
  assert.equal(events.find(e => e.beat === 13 && e.id === "floatVoice").opts.line, "ready");
  /* the intro: "Here we go!" on its third beat, the count-in on bar 1's beats */
  const lines = events.filter(e => e.id === "floatVoice" && !["ready", "hey"].includes(e.opts.line)).map(e => [e.beat, e.opts.line]);
  assert.deepEqual(lines.slice(0, 5), [[2, "herewego"], [4, "one"], [5, "two"], [6, "three"], [7, "four"]]);
  /* the drink break: "Drink!" on its first beat, the count back in its last bar, no cues in it */
  const drink = chart.sections.find(s => s.kind === "drink");
  assert.deepEqual(lines.filter(([beat]) => beat >= drink.from && beat < drink.to), [[drink.from, "drink"], [drink.to - 4, "one"],
    [drink.to - 3, "two"], [drink.to - 2, "three"], [drink.to - 1, "four"]]);
  assert.equal(events.filter(e => e.kind === "answer" && e.beat >= drink.from && e.beat < drink.to).length, 0);
  /* a voice is cut short of the next one */
  const ready = events.find(e => e.beat === 13 && e.id === "floatVoice");
  assert.ok(ready.opts.after > 0 && ready.opts.after <= 1.5);
  const quick = heys.find(h => heys.some(x => x.beat === h.beat + 0.5));
  assert.ok(quick && Math.abs(quick.opts.after - 0.22) < 1e-9, "a Hey with another half a beat behind stops before it");
});

test("Rock Hop: each hop's call is a sung ba on a chord tone of its bar, and its boing echoes the same note", () => {
  const chart = chartOf("rock"), events = groove.songEvents(chart);
  const score = kit.GROOVE_SCORE.rock;
  for (const call of events.filter(e => e.opts.line === "ba")) {
    const note = kit.grooveBaNote("rock", call.opts.k, call.opts.n, call.opts.of);
    const section = groove.barPlan(chart, Math.floor(call.beat / 4));
    const chord = section.sec === "outro" ? score.tonic : score.chords[call.opts.k % 8];
    assert.ok(chord.tones.some(m => (m - note) % 12 === 0), `ba at ${call.beat} (${note}) is in its chord`);
    const answer = events.find(e => e.id === "floatAnswer" && e.beat === call.beat + 2 && e.opts.n === call.opts.n);
    assert.ok(answer, `ba at ${call.beat} has its hop`);
    assert.equal(kit.grooveBaNote("rock", answer.opts.k, answer.opts.n, answer.opts.of), note, "the hop answers on the call's note");
  }
});

test("The Drop: the music cuts for the countdown, three, two, one on its beats, the drop on the next", () => {
  const chart = chartOf("drop"), events = groove.songEvents(chart);
  const drop = chart.cues.find(c => c.kind === "drop");
  const cutBar = events.find(e => e.id === "floatGroove" && e.opts.cut);
  assert.equal(cutBar.beat, Math.floor(drop.call / 4) * 4, "the bar of the countdown");
  assert.equal(cutBar.opts.hits.length, 0);
  assert.deepEqual(events.filter(e => e.beat >= drop.call && e.beat < drop.beat && e.id === "floatVoice").map(e => [e.beat, e.opts.line]),
    [[drop.call, "three"], [drop.call + 1, "two"], [drop.call + 2, "one"]]);
  assert.ok(events.some(e => e.id === "floatAnswer" && e.opts.kind === "drop" && e.beat === drop.beat));
  /* a spin, a hop and a paddle bar each tell the band what the riders do */
  const modes = new Set(events.filter(e => e.id === "floatGroove").map(e => e.opts.mode));
  for (const mode of ["paddle", "rock", "spin"]) assert.ok(modes.has(mode), mode);
});

test("the slots: every event laid with its own bar, at songAt + beat * BEAT_MS - the lead, on whole milliseconds", () => {
  for (const id of SONG_IDS) {
    const chart = chartOf(id), slots = groove.songSlots(chart);
    assert.equal(slots.length, chart.bars);
    assert.equal(slots.flat().length, groove.songEvents(chart).length);
    slots.forEach((slot, bar) => slot.forEach(ev => assert.equal(Math.floor(ev.beat / 4), bar)));
    for (const ev of slots.flat()) assert.equal(groove.eventAt(T0, ev.beat), T0 + ev.beat * BEAT_MS - PRE);
    assert.ok(slots.flat().every(ev => Number.isInteger(groove.eventAt(T0, ev.beat))), "eighths at 120 a minute are whole ms");
  }
});

/* ── the TV ── */
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
  return { played, runner, emit, advance, now:() => now, set:at => { now = at; }, status:next => statusFns.forEach(fn => fn(next)) };
}
const entrants = n => Array.from({ length:n }, (_, i) => ({ device:`d${i}`, bot:i > 2, drinks:true }));
const room = (phase, s, extra = {}) => ({ phase, s, code:"BXRT", round:0, rounds:4, field:[0, 1, 2, 3, 4], out:[], entrants:entrants(5), ...extra });

test("the TV lays the song a bar ahead from songAt: the round card's sting and title, then every bar's events on their beats", () => {
  const r = rig();
  r.emit("welcome", { you:{ role:"screen" } });
  r.emit("room", room("lobby", r.now()));
  r.advance(500);
  const start = r.now() + 250, songAt = start + SONG_LEAD_MS;
  r.set(start);
  r.emit("room", room("song", start, { song:"paddle", startAt:start, songAt, endsAt:songAt + 66000 }));
  const sting = r.played.find(p => p.id === "floatSting"), title = r.played.find(p => p.id === "floatVoice" && p.opts.line === "title-paddle");
  assert.equal(sting.at, songAt + groove.TITLE_BEATS.sting - PRE, "the sting as the card goes up");
  assert.equal(title.at, songAt + groove.TITLE_BEATS.title - PRE, "the title a beat after the sting's hit");
  assert.equal(sting.opts.song, "paddle");
  r.advance(songAt + 9000 - r.now());
  const laid = r.played.filter(p => p.lateMs === groove.GROOVE_LATE_MS);
  /* a bar's events are laid together, as its downbeat comes within a lead */
  const want = groove.songEvents(chartOf("paddle")).filter(e => groove.eventAt(songAt, Math.floor(e.beat / 4) * 4) < r.now() + groove.GROOVE_LEAD_MS);
  assert.deepEqual(laid.map(p => [p.id, p.at]), want.map(e => [e.id, groove.eventAt(songAt, e.beat)]), "every event of the bars so far, in order, exact");
  assert.ok(laid.every(p => p.at - p.laidAt <= groove.GROOVE_LEAD_MS + BAR_MS && p.at - p.laidAt > 0), "each laid ahead, never more than a bar and a lead");
  assert.ok(laid.filter(p => p.id === "floatGroove").every(p => p.at - p.laidAt <= groove.GROOVE_LEAD_MS), "a bar no more than a lead");
  assert.equal(laid.filter(p => p.id === "floatGroove")[0].at, songAt - PRE, "bar 0 on beat 0");
  r.runner.stop();
});

test("a TV that joins mid-song hears the song from its next bar line, and no round card", () => {
  const r = rig();
  const songAt = T0 - 21_300;
  r.emit("welcome", {});
  r.emit("room", room("song", r.now(), { song:"rock", startAt:songAt - 3000, songAt, endsAt:songAt + 66000 }));
  r.advance(3000);
  const bars = r.played.filter(p => p.id === "floatGroove");
  assert.ok(bars.length >= 1);
  assert.equal(bars[0].at, songAt + 11 * BAR_MS - PRE, "the next bar line ahead: bar 11");
  assert.equal(bars[0].opts.bar, 11);
  assert.equal(r.played.filter(p => p.id === "floatSting").length, 0, "a catch-up owes no moment");
  r.runner.stop();
});

test("the song ends: the bars still to come are dropped, the cut's drumroll, a sting per rider out on the cut's beats, then the loop", () => {
  const r = rig();
  r.emit("welcome", {});
  const songAt = r.now() + 3000;
  r.emit("room", room("song", r.now(), { song:"paddle", startAt:r.now(), songAt, endsAt:songAt + 66000, out:[] }));
  r.advance(3000 + 20_000);
  const cutAt = r.now();
  r.emit("room", room("cut", cutAt, { startAt:cutAt, field:[0, 1, 2, 3, 4], out:[3, 1] }));
  const after = r.played.filter(p => p.lateMs === groove.GROOVE_LATE_MS && p.at > cutAt);
  assert.ok(after.length && after.every(p => p.cancelled), "nothing of the song plays on");
  const roll = r.played.find(p => p.id === "floatRoll");
  assert.equal(roll.at, cutAt + groove.CUT_BEATS.roll - PRE);
  assert.equal(roll.opts.ms, groove.CUT_BEATS.reveal - groove.CUT_BEATS.roll);
  const gone = r.played.filter(p => p.id === "floatGone");
  assert.deepEqual(gone.map(p => [p.at, p.opts.step]), [[cutAt + groove.CUT_BEATS.reveal - PRE, 0], [cutAt + groove.CUT_BEATS.reveal + groove.CUT_BEATS.gap - PRE, 1]],
    "in the room's order, a step lower each");
  assert.ok(gone[0].pan > gone[1].pan, "panned to each rider's place in the field");
  /* the room's own `out` event for a rider already stung is not a second sting */
  r.emit("ev", { e:"out", i:3 });
  assert.equal(r.played.filter(p => p.id === "floatGone").length, 2);
  r.advance(screen.CUT_LOOP_MS + 2500);
  const loop = r.played.filter(p => p.id === "floatLobby");
  assert.ok(loop.length && loop[0].at + PRE >= cutAt + screen.CUT_LOOP_MS && loop.every(p => (p.at + PRE) % BAR_MS === 0 && p.opts.cut));
  r.runner.stop();
});

test("misses: a quiet flub panned to the rider, three at most at once, none for a rider still chugging after the break", () => {
  const r = rig();
  const songAt = r.now() + 3000, chart = chartOf("paddle");
  const field = Array.from({ length:13 }, (_, i) => i);
  r.emit("welcome", {});
  r.emit("room", room("song", r.now(), { song:"paddle", songAt, startAt:r.now(), field, entrants:entrants(13) }));
  const cue = chart.cues.find(c => c.scored && c.beat < 50);
  r.set(songAt + cue.beat * BEAT_MS + 550);
  r.emit("ev", { e:"hit", i:0, c:cue.id, q:"miss" });
  r.emit("ev", { e:"hit", i:12, c:cue.id, q:"nice", d:40 });
  let flubs = r.played.filter(p => p.id === "floatFlub");
  assert.equal(flubs.length, 1, "a miss flubs; a hit is the band's");
  assert.equal(flubs[0].pan, -0.6, "the field's first is at the left");
  for (let i = 1; i < 13; i++) r.emit("ev", { e:"hit", i, c:cue.id, q:"miss" });
  flubs = r.played.filter(p => p.id === "floatFlub");
  assert.equal(flubs.length, screen.FLUB.grains, "a crowd of misses is a few flubs");
  /* after the break: a rider who has not tapped Done is chugging */
  const drink = chart.sections.find(s => s.kind === "drink");
  const late = chart.cues.find(c => c.beat >= drink.to);
  r.set(songAt + late.beat * BEAT_MS + 550);
  r.emit("ev", { e:"hit", i:4, c:late.id, q:"miss" });
  assert.equal(r.played.filter(p => p.id === "floatFlub").length, 3, "still drinking: no flub");
  r.emit("ev", { e:"done", i:4 });
  assert.equal(r.played.filter(p => p.id === "floatDone").length, 1, "a glass as they tap Done");
  r.set(r.now() + 600);
  r.emit("ev", { e:"hit", i:4, c:late.id + 1, q:"miss" });
  assert.equal(r.played.filter(p => p.id === "floatFlub").length, 4, "done and missing: the flub");
  /* stale and hidden events are silent */
  r.emit("ev", { e:"hit", i:5, c:late.id + 2, q:"miss", s:r.now() - screen.EV_FRESH_MS - 1 });
  assert.equal(r.played.filter(p => p.id === "floatFlub").length, 4);
  r.runner.stop();
  const h = rig({ visible:false });
  h.emit("welcome", {});
  h.emit("room", room("song", h.now(), { song:"paddle", songAt:h.now() + 3000, startAt:h.now() }));
  h.emit("ev", { e:"hit", i:1, c:3, q:"miss" });
  assert.equal(h.played.length, 0, "a hidden TV sounds nothing");
  h.runner.stop();
});

test("the Cup's moments: the intro opens, the podium's fanfare on its beats, the lobby's joins and readies, a catch-up silent", () => {
  const r = rig();
  r.emit("welcome", {});
  r.emit("room", room("lobby", r.now(), { entrants:entrants(2) }));
  r.emit("room", room("lobby", r.now() + 10, { entrants:[...entrants(2), { device:"new" }] }));
  assert.equal(r.played.filter(p => p.id === "floatHello").length, 1);
  r.emit("room", room("lobby", r.now() + 20, { entrants:[...entrants(2), { device:"new", ready:true }] }));
  assert.equal(r.played.filter(p => p.id === "floatSet").length, 1);
  r.emit("room", room("intro", r.now() + 30, { startAt:r.now() + 30 }));
  assert.equal(r.played.filter(p => p.id === "floatOpen").length, 1);
  const podiumAt = r.now() + 40;
  r.emit("room", room("podium", podiumAt, { startAt:podiumAt, podium:[2, 0, 1] }));
  const fanfare = r.played.find(p => p.id === "floatFanfare");
  assert.equal(fanfare.at, podiumAt + groove.PODIUM_BEATS.roll - PRE);
  assert.deepEqual([groove.PODIUM_BEATS.third, groove.PODIUM_BEATS.second, groove.PODIUM_BEATS.first].map(ms => ms - groove.PODIUM_BEATS.roll),
    [kit.GROOVE_PODIUM_MS.third, kit.GROOVE_PODIUM_MS.second, kit.GROOVE_PODIUM_MS.first], "the screen's reveal beats are the fanfare's");
  r.runner.stop();
  const late = rig();
  late.emit("welcome", {});
  late.emit("room", room("podium", late.now(), { startAt:late.now(), podium:[0, 1, 2] }));
  assert.equal(late.played.filter(p => p.id === "floatFanfare").length, 0);
  late.runner.stop();
});

/* ── the phone ── */
function phoneRun(messages, { me = 2 } = {}) {
  let mem = phone.initialPhone({ me });
  const cues = [];
  for (const msg of messages) {
    const r = phone.phoneStep(mem, msg, { now:(msg.now ?? msg.s) + 40, me, visible:true, taps:{ tap:-Infinity, done:-Infinity, cheer:-Infinity }, wall:msg.s });
    mem = r.mem; cues.push(...r.cues);
  }
  return { mem, cues };
}

test("the phone at the cut: Out on your turn among the outs, Through after the last, on the cut's beats; your place on the podium", () => {
  const s = T0;
  const song = { t:"room", phase:"song", s, round:0, field:[0, 1, 2, 3], out:[] };
  const cut = (out, extra = {}) => ({ t:"room", phase:"cut", s:s + 66_000, startAt:s + 66_000, round:0, field:[0, 1, 2, 3], out, ...extra });
  const outMe = phoneRun([{ t:"welcome", s }, { t:"room", phase:"lobby", s, out:[] }, song, cut([3, 2])]);
  assert.deepEqual(outMe.cues, [{ id:"floatYouOut", at:s + 66_000 + groove.CUT_BEATS.reveal + groove.CUT_BEATS.gap + 60 }]);
  const through = phoneRun([{ t:"welcome", s }, { t:"room", phase:"lobby", s, out:[] }, song, cut([3, 1])]);
  assert.deepEqual(through.cues, [{ id:"floatYouSafe", at:s + 66_000 + groove.CUT_BEATS.reveal + 2 * groove.CUT_BEATS.gap + 60 }]);
  const watching = phoneRun([{ t:"welcome", s }, { t:"room", phase:"lobby", s, out:[] }, { ...song, field:[0, 1] }, cut([1], { field:[0, 1] })]);
  assert.deepEqual(watching.cues, [], "not in the song: nothing");
  const catchUp = phoneRun([{ t:"welcome", s }, cut([2])]);
  assert.deepEqual(catchUp.cues, [], "a catch-up is silent");
  const podium = phoneRun([{ t:"welcome", s }, { t:"room", phase:"lobby", s, out:[] }, { t:"room", phase:"podium", s:s + 1000, startAt:s + 1000, podium:[1, 2, 0] }]);
  assert.deepEqual(podium.cues, [{ id:"floatYouPlace", at:s + 1000 + groove.PODIUM_BEATS.second, opts:{ place:2 } }]);
  /* the room's Done for you, when this phone did not tap it */
  const done = phoneRun([{ t:"welcome", s }, { t:"room", phase:"song", s, round:0, field:[2], out:[], songAt:s + 3000 }, { t:"ev", e:"done", i:2, s:s + 40_000 }]);
  assert.deepEqual(done.cues.map(c => c.id), ["floatYouDone"]);
});

test("the phone's taps: through the real engine on the you bus, crisp or muffled by the judgement, never on the TV", async () => {
  mock.timers.enable({ apis:["setTimeout", "Date"], now:T0 });
  try {
    const sound = await import("../src/lib/sound.js");
    const made = [];
    class Ctx {
      constructor() { this.state = "suspended"; this.currentTime = 10; this.sampleRate = 8000; this.destination = {}; this.starts = []; made.push(this); }
      node(kind) { const ctx = this; const param = () => ({ value:1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
        return { kind, type:"", gain:param(), frequency:param(), Q:param(), pan:param(), threshold:param(), knee:param(), ratio:param(), attack:param(), release:param(),
          connect(n) { return n; }, disconnect() {}, start(t) { ctx.starts.push({ kind, t }); }, stop() {} }; }
      createGain() { return this.node("gain"); } createBiquadFilter() { return this.node("filter"); } createDynamicsCompressor() { return this.node("comp"); }
      createConvolver() { return this.node("conv"); } createStereoPanner() { return this.node("pan"); } createOscillator() { return this.node("osc"); }
      createBufferSource() { return this.node("src"); } createBuffer(c, l) { return { length:l, numberOfChannels:c, getChannelData:() => new Float32Array(l) }; }
      resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); } close() { this.state = "closed"; }
    }
    sound.__resetSoundEngine({ factory:Ctx });
    sound.setSoundSurface("phone");
    for (const q of [...phone.TAP_QUALITIES, null]) {
      mock.timers.tick(100);
      assert.ok(index.floatTapSound(q, "paddle"), `a tap judged ${q}`);
    }
    assert.equal(index.floatTapSound("perfect"), null, "a second touch inside 35 ms is the same tap");
    mock.timers.tick(100);
    assert.ok(index.floatDoneSound()); assert.ok(index.floatCheerSound());
    assert.equal(index.floatCheerSound(), null, "one cheer at a time");
    assert.ok(made[0].starts.length > 0, "sounded on the phone");
    /* the parked race's names still sound, on the Groove's taps */
    mock.timers.tick(100);
    assert.ok(index.floatStrokeSound("L", 0.8, "good"));
    sound.setSoundSurface("tv");
    mock.timers.tick(100);
    assert.equal(index.floatTapSound("perfect"), null, "never on the TV");
    sound.__resetSoundEngine();
  } finally { mock.timers.reset(); }
});

/* ── the clip path ── */
/* a decoded clip: silence for 60 ms, then a 220 Hz tone for 200 ms that dies away */
function toneBuffer(sampleRate = 8000) {
  const n = Math.round(sampleRate * 0.3), data = new Float32Array(n);
  for (let i = Math.round(sampleRate * 0.06); i < Math.round(sampleRate * 0.26); i++) {
    const t = i / sampleRate - 0.06;
    data[i] = Math.sin(2 * Math.PI * 220 * t) * Math.min(1, t / 0.01) * Math.exp(-t * 3);
  }
  return { duration:n / sampleRate, sampleRate, length:n, numberOfChannels:1, getChannelData:() => data };
}

test("clip marks: the start, the beat (the first rise past 30% of the peak), the end and the pitch, read from the samples", () => {
  const b = toneBuffer(8000), m = kit.clipMarks(b.getChannelData(0), 8000);
  assert.ok(Math.abs(m.start - 0.06) < 0.006, `start ${m.start}`);
  assert.ok(m.beat >= m.start && m.beat - 0.06 < 0.012, `beat ${m.beat}`);
  assert.ok(m.end > 0.25 && m.end <= m.dur, `end ${m.end}`);
  assert.ok(Math.abs(m.f0 - 220) < 6, `f0 ${m.f0}`);
  const silent = kit.clipMarks(new Float32Array(800), 8000);
  assert.deepEqual([silent.start, silent.beat, silent.f0], [0, 0, 0]);
});

test("the clip path: registered by id and URL, fetched once, decoded with the context, played so its beat lands on the beat", async () => {
  mock.timers.enable({ apis:["setTimeout", "Date"], now:T0 });
  try {
    const sound = await import("../src/lib/sound.js");
    const made = [];
    class Ctx {
      constructor() { this.state = "suspended"; this.currentTime = 10; this.sampleRate = 8000; this.outputLatency = 0; this.destination = {}; this.starts = []; this.decodes = 0; made.push(this); }
      node(kind) { const ctx = this; const param = () => ({ value:1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
        const n = { kind, type:"", buffer:null, gain:param(), frequency:param(), Q:param(), pan:param(), threshold:param(), knee:param(), ratio:param(), attack:param(),
          release:param(), playbackRate:param(), connect(x) { return x; }, disconnect() {}, start(t, offset = 0, dur) { ctx.starts.push({ kind, t, offset, dur, buffer:n.buffer, rate:n.playbackRate.value }); }, stop() {} };
        return n; }
      createGain() { return this.node("gain"); } createBiquadFilter() { return this.node("filter"); } createDynamicsCompressor() { return this.node("comp"); }
      createConvolver() { return this.node("conv"); } createStereoPanner() { return this.node("pan"); } createOscillator() { return this.node("osc"); }
      createBufferSource() { return this.node("src"); } createBuffer(c, l) { return { length:l, numberOfChannels:c, getChannelData:() => new Float32Array(l), duration:l / 8000 }; }
      decodeAudioData(bytes, ok) { this.decodes++; const b = toneBuffer(8000); ok?.(b); return Promise.resolve(b); }
      resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); } close() { this.state = "closed"; }
    }
    sound.__resetSoundEngine({ factory:Ctx });
    sound.setSoundSurface("phone");
    let fetches = 0;
    const fetch = async url => { fetches++; assert.equal(url, "/float/groove/voice/ready.mp3"); return { ok:true, arrayBuffer:async () => new ArrayBuffer(16) }; };
    assert.equal(sound.registerClips([{ id:"ready", file:"ready.mp3" }, { id:"bad" }], { base:"/float/groove/voice/" }), 1, "a clip needs an id and a file");
    assert.equal(sound.registerClips([{ id:"ready", file:"ready.mp3" }], { base:"/float/groove/voice/" }), 0, "the same clip twice is one");
    /* fetched before the phone's context exists: decoded when it is made */
    assert.equal(await sound.preloadClips(["ready"], { fetch }), 0);
    assert.equal(sound.clipReady("ready"), false);
    sound.unlockSound();
    await Promise.resolve(); await Promise.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(sound.clipReady("ready"), true, "decoded once the context is made");
    assert.equal(await sound.preloadClips(["ready"], { fetch }), 1);
    assert.equal(fetches, 1, "fetched once");
    assert.equal(made[0].decodes, 1, "decoded once");
    /* on the TV: the host's Ready played so its beat lands on the call's beat */
    sound.setSoundSurface("tv");
    const ctx = made[0];
    ctx.starts.length = 0;
    assert.ok(sound.playSound("floatVoice", { bus:"room", opts:{ line:"ready" } }));
    const src = ctx.starts.find(s => s.kind === "src" && s.buffer?.length === 2400);
    assert.ok(src, "the decoded buffer played");
    const marks = kit.clipMarks(toneBuffer(8000).getChannelData(0), 8000);
    const lead = Math.min(kit.GROOVE_PRE_S, marks.beat - marks.start);
    const beatAt = 10.005 + kit.GROOVE_PRE_S;
    assert.ok(Math.abs(src.t + (marks.beat - src.offset) - beatAt) < 1e-9, "start + (beat - offset) is the beat");
    assert.ok(Math.abs(src.offset - (marks.beat - lead)) < 1e-9 && src.t >= 10.005 - 1e-9, "its soft start leads in, never before the cue");
    /* not decoded: the synthesized stand-in */
    ctx.starts.length = 0;
    assert.ok(sound.playSound("floatVoice", { bus:"room", opts:{ line:"drink" } }));
    assert.ok(ctx.starts.length > 0 && !ctx.starts.some(s => s.kind === "src" && s.buffer?.length === 2400), "a stand-in chirps for a clip not there");
    sound.__resetSoundEngine();
    assert.equal(sound.clipReady("ready"), false, "a reset clears the store");
  } finally { mock.timers.reset(); }
});

test("the host's voice: a clip for every line and every take of the crowd, the files in place, the manifest and the module agreeing", () => {
  const ids = VOICE.clips.map(c => c.id);
  for (const line of kit.GROOVE_LINES.filter(id => id !== "go" && id !== "float")) assert.ok(ids.includes(line), `a clip for "${line}"`);
  for (const take of kit.GROOVE_CROWD) assert.ok(ids.includes(take), take);
  assert.equal(VOICE.base, "/float/groove/voice/");
  const manifest = JSON.parse(read("public/float/groove/voice/manifest.json"));
  assert.equal(manifest.aiGenerated, true, "the credits must say so");
  assert.deepEqual(manifest.clips.map(c => [c.id, c.file, c.onset, c.dur]), VOICE.clips.map(c => [c.id, c.file, c.onset, c.dur]));
  for (const clip of VOICE.clips) {
    assert.ok(existsSync(new URL(`../public/float/groove/voice/${clip.file}`, import.meta.url)), clip.file);
    assert.ok(clip.onset >= 0 && clip.onset < 300 && clip.dur > clip.onset && clip.dur < 1500, `${clip.id}: a short clip, its beat near its start`);
  }
  const counts = ["one", "two", "three", "four"].map(id => VOICE.clips.find(c => c.id === id));
  assert.ok(counts.every(c => c.dur - c.onset < 450), "a count is over before the next beat");
  assert.ok(VOICE.clips.find(c => c.id === "ba").f0 > 0, "the ba holds a pitch, so it can be sung at a note");
});

/* ── the recipes ── */
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

test("every song's every bar plays, the beat at t + the lead, nothing before its time, released when it ends", () => {
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" }), base = ctx.nodes.length;
  for (const id of SONG_IDS) for (const ev of groove.songEvents(chartOf(id))) {
    ctx.nodes.length = base;
    assert.ok(kit.playRecipe(E, ev.id, 10, ev.opts), `${id} ${ev.id} at ${ev.beat}`);
    const sources = ctx.nodes.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, `${id} ${ev.id} ${ev.beat} sounds`);
    assert.ok(sources.every(n => n.starts.every(t => t >= 10 - 1e-9)), `${id} ${ev.id} ${ev.beat}: nothing before its time`);
    sources.forEach(n => n.onended?.());
    assert.ok(ctx.nodes.slice(base).every(n => n.disconnected === 1), `${id} ${ev.id} ${ev.beat}: released`);
  }
});

test("the band leaves a Hey to the room: no lead or comp note on a Hey's sixteenth, the brass's stab on it", () => {
  const ctx = recorder(), E = kit.makeEngine(ctx, { listen:"tv" });
  const at = beat => 10 + kit.GROOVE_PRE_S + beat * 0.5;
  const startsAt = (kind, type, t) => ctx.nodes.filter(n => n.kind === kind && n.type === type && n.starts.some(s => Math.abs(s - t) < 1e-6));
  for (const k of [1, 3, 5, 7]) {
    ctx.nodes.length = 0;
    kit.playRecipe(E, "floatGroove", 10, { song:"paddle", bar:22 + k, sec:"play", part:1, k, len:8, next:"play", hits:[[0, "paddle"], [2, "paddle"], [3, "hey"]], calls:[[1, "hey"]] });
    assert.equal(startsAt("osc", "square", at(3)).length, 0, `bar ${k}: the lead and the clav leave beat four alone`);
    assert.ok(startsAt("osc", "sawtooth", at(3)).length >= 2, `bar ${k}: the brass stabs with the room`);
  }
});
