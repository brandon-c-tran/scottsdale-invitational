/* The charts (float/GROOVE.md "Songs and charts", "Judging"): one judgement
   for the phone, the room, the screen and the sound. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BAR_MS, SONG_BARS, SONG_BEATS, SONG_MS, SONGS, SONG_IDS, CUE_KINDS, MODES, WINDOW, POINTS,
  chartOf, songForRound, sectionsOf, clockAt, callsBetween, cuesBetween, scoredCues, practiceCues, drinkSection,
  qualityOf, matchTap, judgeHit, scoreOf, calibrate, formatOffset, popupOf, cueTime,
} from "../float/shared/chart.js";

test("a song is 32 bars at 120 bpm: intro 2, practice 4, play 8, drink 8, play 8, outro 2", () => {
  assert.equal(BAR_MS, 2000);
  assert.equal(SONG_BARS, 32);
  assert.equal(SONG_BEATS, 128);
  assert.equal(SONG_MS, 64_000);
  assert.deepEqual(sectionsOf().map(s => [s.kind, s.bar, s.bars, s.from, s.to]), [
    ["intro", 0, 2, 0, 8], ["practice", 2, 4, 8, 24], ["play", 6, 8, 24, 56],
    ["drink", 14, 8, 56, 88], ["play", 22, 8, 88, 120], ["outro", 30, 2, 120, 128],
  ]);
});

test("four songs, named for what you do; the last round is always The Drop", () => {
  assert.deepEqual(SONGS.map(s => s.name), ["Paddle Party", "Rock Hop", "Spin Cycle", "The Drop"]);
  assert.deepEqual([0, 1, 2, 3].map(r => songForRound(r, 4)), ["paddle", "rock", "spin", "drop"]);
  assert.equal(songForRound(1, 2), "drop");
  assert.equal(chartOf("nope"), null);
});

for (const id of SONG_IDS) test(`${id}: cues in order, in practice, play and the outro only, each called by its lead`, () => {
  const chart = chartOf(id);
  assert.equal(chart, chartOf(id), "cached");
  assert.equal(chart.modes.length, SONG_BARS);
  for (const mode of chart.modes) assert.ok(MODES.includes(mode), mode);
  const sections = chart.sections;
  chart.cues.forEach((cue, k) => {
    assert.equal(cue.id, k);
    if (k) assert.ok(cue.beat - chart.cues[k - 1].beat >= 0.5, `cues at least an eighth apart (${cue.beat})`);
    const section = sections.find(s => cue.beat >= s.from && cue.beat < s.to).kind;
    assert.ok(["practice", "play", "outro"].includes(section), `${cue.beat} in ${section}`);
    assert.equal(cue.scored, section !== "practice");
    const lead = CUE_KINDS[cue.kind].lead;
    assert.equal(cue.call, lead === null ? null : cue.beat - lead);
    if (cue.call !== null) assert.ok(cue.call >= 0, "called inside the song");
  });
  assert.ok(scoredCues(chart).length >= 25, `${id} has ${scoredCues(chart).length} scored cues`);
  assert.ok(practiceCues(chart).length >= 6, `${id} practices ${practiceCues(chart).length}`);
  assert.deepEqual([drinkSection(chart).from, drinkSection(chart).to], [56, 88]);
  assert.deepEqual(cuesBetween(chart, 56, 88), [], "no taps in the drink break");
  assert.equal(chart.modes[0], "intro");
  assert.ok(chart.modes.slice(14, 22).every(mode => mode === "drink"));
  assert.equal(chart.modes[31], "outro");
  assert.deepEqual(JSON.parse(JSON.stringify(chart)), chart, "plain JSON, as the room sends it");
});

test("the patterns: paddles on 1 and 3, Rock Hop answers two beats after the host, Spin Cycle one beat after, on the backbeat", () => {
  const paddle = chartOf("paddle"), rock = chartOf("rock"), spin = chartOf("spin"), drop = chartOf("drop");
  assert.deepEqual(cuesBetween(paddle, 24, 32).map(c => [c.beat % 4, c.kind]),
    [[0, "paddle"], [2, "paddle"], [0, "paddle"], [2, "paddle"], [3, "hey"]]);
  assert.ok(rock.cues.every(c => c.kind === "hop" && c.call === c.beat - 2 && c.beat % 4 >= 2 && c.call % 4 < 2),
    "the host's half, then yours");
  assert.ok(spin.cues.every(c => c.kind === "spin" && [1, 1.5, 3, 3.5].includes(c.beat % 4)));
  const last = drop.cues[drop.cues.length - 1];
  assert.deepEqual([last.kind, last.beat, last.call], ["drop", 120, 117]);
  assert.equal(drop.modes[29], "drop", "the countdown bar is the drop's");
  assert.deepEqual(callsBetween(rock, 8, 12).map(c => c.call), [8]);
});

test("the windows: Perfect 50, Nice 100, OK 160, then Early or Late", () => {
  assert.deepEqual([0, 50, -50, 51, 100, 101, 160, 161, -161, -300].map(qualityOf),
    ["perfect", "perfect", "perfect", "nice", "nice", "ok", "ok", "late", "early", "early"]);
  assert.equal(qualityOf(NaN), "miss");
  assert.deepEqual(POINTS, { perfect:100, nice:70, ok:40, early:0, late:0, miss:0 });
});

test("a tap goes to the nearest open cue within 300 ms, judged with the room's offset", () => {
  const chart = chartOf("paddle");
  const songAt = 100_000;
  const first = practiceCues(chart)[0];
  const at = cueTime(songAt, first.beat);
  assert.deepEqual(matchTap(chart, songAt, at + 30), { cue:first, d:30, r:30 });
  assert.deepEqual(matchTap(chart, songAt, at + 230, { offset:200 }), { cue:first, d:30, r:230 });
  assert.equal(matchTap(chart, songAt, at - 400), null, "nothing near");
  const k = chart.cues.findIndex((cue, j) => chart.cues[j + 1]?.beat === cue.beat + 1);
  const between = cueTime(songAt, chart.cues[k].beat) + 280;
  assert.deepEqual(matchTap(chart, songAt, between), { cue:chart.cues[k + 1], d:-220, r:-220 }, "nearer to the next");
  assert.equal(matchTap(chart, songAt, at + 20, { taken:new Set([first.id]) }), null, "one judgement a cue");
});

test("the room re-judges a hit from its raw offset; too far is no hit", () => {
  const chart = chartOf("rock");
  const cue = scoredCues(chart)[0];
  assert.deepEqual(judgeHit(chart, cue.id, 140, 100), { c:cue.id, q:"perfect", d:40, pts:100, scored:true });
  assert.deepEqual(judgeHit(chart, cue.id, -130, 0), { c:cue.id, q:"ok", d:-130, pts:40, scored:true });
  assert.equal(judgeHit(chart, cue.id, 300 + WINDOW.SLACK + 1, 0), null);
  assert.equal(judgeHit(chart, 9999, 0, 0), null);
  assert.equal(judgeHit(chart, practiceCues(chart)[0].id, 0, 0).pts, 0, "practice never scores");
});

test("a score is its percent; live counts only what has been played", () => {
  const chart = chartOf("spin");
  const scored = scoredCues(chart);
  const judged = Object.fromEntries(scored.slice(0, 4).map((cue, k) => [cue.id, ["perfect", "nice", "ok", "miss"][k]]));
  const score = scoreOf(chart, judged, { upTo:scored[3].beat + 0.5 });
  assert.equal(score.pts, 210);
  assert.equal(score.max, scored.length * 100);
  assert.equal(score.n, 4);
  assert.equal(score.live, 52.5);
  assert.equal(scoreOf(chart, Object.fromEntries(scored.map(c => [c.id, "perfect"]))).pct, 100);
});

test("calibration: the median of practice taps near their cue, clamped; none with too few", () => {
  assert.equal(calibrate([120, 140, 160, 900, 150]), 145, "the stray tap is no sample; even count averages the middle two");
  assert.equal(calibrate([400, 300, 320, 340], { range:400 }), 250, "clamped");
  assert.equal(calibrate([10, 20, 30]), null);
});

test("the popup: seconds to two decimals, the word and its tone", () => {
  assert.deepEqual([30, -10, 4, -4, 734].map(formatOffset), ["+0.03", "-0.01", "0.00", "0.00", "+0.73"]);
  assert.deepEqual(popupOf("nice", -12), { num:"-0.01", word:"Nice!", tone:"yellow" });
  assert.deepEqual(popupOf("miss"), { num:null, word:"Miss", tone:"grey" });
  assert.deepEqual(popupOf("perfect", 0), { num:"0.00", word:"Perfect", tone:"gold" });
});

test("the clock: where the song is, by server time", () => {
  const chart = chartOf("drop");
  const songAt = 50_000;
  const c = clockAt(chart, songAt, songAt + 15 * 2000 + 250);
  assert.deepEqual([c.bar, c.inBar, c.section, c.mode, c.over], [15, 0.5, "drink", "drink", false]);
  assert.equal(clockAt(chart, songAt, songAt - 1000).section, null);
  assert.equal(clockAt(chart, songAt, songAt + SONG_MS).over, true);
});

test("Last Call: three grabs at 120 bpm, a wide window, the worst total drinks", async () => {
  const { LAST_CALL, LAST_CALL_ID, lastCallTotal, lastCallWorst } = await import("../float/shared/chart.js");
  const chart = chartOf(LAST_CALL_ID);
  assert.equal(chart.name, "Last Call");
  assert.equal(chart.ms, 16_000);
  assert.equal(chart.window, 1000);
  assert.deepEqual(chart.cues.map(c => [c.beat, c.call, c.kind, c.scored]), [[7, 4, "grab", false], [15, 12, "grab", false], [22, 20, "grab", false]]);
  assert.deepEqual(chart.modes, ["intro", "lastcall", "lastcall", "lastcall", "lastcall", "lastcall", "lastcall", "outro"]);
  const songAt = 10_000;
  const late = matchTap(chart, songAt, cueTime(songAt, 7) + 730);
  assert.deepEqual([late.cue.id, late.d], [0, 730]);
  assert.equal(popupOf(qualityOf(late.d), late.d).num, "+0.73");
  assert.equal(judgeHit(chart, 0, 730, 0).q, "late");
  assert.equal(lastCallTotal({ 0:10, 1:-20, 2:30 }), 60);
  assert.equal(lastCallTotal({ 0:10 }), 10 + 2 * LAST_CALL.MISS_MS);
  assert.deepEqual(lastCallWorst([{ i:0, ms:60 }, { i:3, ms:900 }, { i:5, ms:900 }]), [3, 5]);
  assert.equal(chartOf("paddle").window, WINDOW.MAX, "songs keep the 300 ms window");
});
