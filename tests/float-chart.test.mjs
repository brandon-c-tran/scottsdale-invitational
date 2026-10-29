/* The charts (float/GROOVE.md "Songs and charts", "Judging"): one judgement
   for the phone, the room, the screen and the sound. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BAR_MS, SONG_BARS, SONG_BEATS, SONG_MS, SONGS, SONG_IDS, CUE_KINDS, MODES, WINDOW, POINTS,
  chartOf, songForRound, sectionsOf, sectionAt, clockAt, callsBetween, cuesBetween, scoredCues, practiceCues, breakdownSection, CHUGOFF,
  qualityOf, matchTap, judgeHit, scoreOf, calibrate, formatOffset, popupOf, cueTime,
  playedCues, demoCues, lineAt, gradeOf, gradeWord, feedbackOf, awardsOf, countdownOf, lastCallId,
  LAST_CALL, LAST_CALL_ID, LAST_CALL_TRICKS, lastCallTotal, lastCallWorst, offsetTone, countTone, TONES,
} from "../float/shared/chart.js";

test("a song is 32 bars at 120 bpm: intro 2, practice 4, play 8, breakdown 8, play 8, outro 2", () => {
  assert.equal(BAR_MS, 2000);
  assert.equal(SONG_BARS, 32);
  assert.equal(SONG_BEATS, 128);
  assert.equal(SONG_MS, 64_000);
  assert.deepEqual(sectionsOf().map(s => [s.kind, s.bar, s.bars, s.from, s.to]), [
    ["intro", 0, 2, 0, 8], ["practice", 2, 4, 8, 24], ["play", 6, 8, 24, 56],
    ["breakdown", 14, 8, 56, 88], ["play", 22, 8, 88, 120], ["outro", 30, 2, 120, 128],
  ]);
});

test("five songs, named for what you do; the last round is always The Drop", () => {
  assert.deepEqual(SONGS.map(s => s.name), ["Paddle Party", "Rock Hop", "Spin Cycle", "The Drop", "Fireworks"]);
  assert.deepEqual(SONGS.map(s => s.scene), ["open", "rocks", "whirlpool", "falls", "night"]);
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
    assert.ok(["practice", "play", "breakdown", "outro"].includes(section), `${cue.beat} in ${section}`);
    assert.equal(cue.scored, section !== "practice");
    if (cue.demo) assert.equal(section, "practice", "only practice shows a cue");
    const lead = CUE_KINDS[cue.kind].lead;
    assert.equal(cue.call, lead === null ? null : cue.beat - lead);
    if (cue.call !== null) assert.ok(cue.call >= 0, "called inside the song");
  });
  assert.ok(scoredCues(chart).length >= 25, `${id} has ${scoredCues(chart).length} scored cues`);
  assert.ok(practiceCues(chart).length >= 3, `${id} practices ${practiceCues(chart).length}`);
  assert.ok(chart.lines.length >= 3, "practice is narrated");
  const practice = sections.find(s => s.kind === "practice");
  const breakdown = breakdownSection(chart);
  for (const line of chart.lines) assert.ok(((line.beat >= practice.from - 1 && line.beat < practice.to)
    || (line.beat >= breakdown.from - 1 && line.beat < breakdown.to)) && line.until > line.beat && line.text.length <= 36, line.text);
  for (const demo of demoCues(chart)) assert.ok(!["Your turn", "Both now"].includes(lineAt(chart, demo.beat)?.text), "a demo is never under Your turn");
  assert.deepEqual([breakdownSection(chart).from, breakdownSection(chart).to], [56, 88]);
  const echoes = cuesBetween(chart, 56, 88);
  assert.ok(echoes.length >= 8 && echoes.every(c => c.kind === "echo" && c.scored && c.call === c.beat - 4), "the breakdown: copy the host a bar later");
  assert.ok(echoes.every(c => Math.floor(c.beat / 4) % 2 === 1 && Math.floor(c.call / 4) % 2 === 0), "the host's bar, then yours");
  assert.equal(lineAt(chart, 56).text, "Copy me");
  assert.equal(lineAt(chart, 60), null, "the line goes once the copying starts");
  assert.equal(chart.modes[0], "intro");
  assert.ok(chart.modes.slice(14, 22).every(mode => mode === "echo"));
  assert.equal(chart.modes[31], "outro");
  assert.deepEqual(JSON.parse(JSON.stringify(chart)), chart, "plain JSON, as the room sends it");
});

test("the patterns: paddles on 1 and 3, Rock Hop answers two beats after the host, Spin Cycle one beat after, on the backbeat", () => {
  const paddle = chartOf("paddle"), rock = chartOf("rock"), spin = chartOf("spin"), drop = chartOf("drop");
  assert.deepEqual(cuesBetween(paddle, 24, 32).map(c => [c.beat % 4, c.kind]),
    [[0, "paddle"], [2, "paddle"], [0, "paddle"], [2, "paddle"], [3, "hey"]]);
  assert.ok(rock.cues.filter(c => !["echo", "paddle"].includes(c.kind)).every(c => c.kind === "hop" && c.call === c.beat - 2 && c.beat % 4 >= 2 && c.call % 4 < 2),
    "the host's half, then yours");
  assert.ok(spin.cues.filter(c => !["echo", "paddle"].includes(c.kind)).every(c => c.kind === "spin" && [1, 1.5, 3, 3.5].includes(c.beat % 4)));
  assert.deepEqual(cuesBetween(spin, 24, 28).map(c => [c.beat % 4, c.kind]), [[0, "paddle"], [1, "spin"], [2, "paddle"], [3, "spin"]],
    "row, spin, row, spin");
  const last = drop.cues[drop.cues.length - 1];
  assert.deepEqual([last.kind, last.beat, last.call], ["drop", 120, 117]);
  assert.equal(drop.modes[29], "drop", "the countdown bar is the drop's");
  assert.deepEqual(callsBetween(rock, 12, 16).map(c => c.call), [13], "the host's ba on 2 for the hop on 4");
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
  const played = playedCues(chart);
  const k = played.findIndex((cue, j) => played[j + 1]?.beat === cue.beat + 1);
  const between = cueTime(songAt, played[k].beat) + 280;
  assert.deepEqual(matchTap(chart, songAt, between), { cue:played[k + 1], d:-220, r:-220 }, "nearer to the next");
  const demo = demoCues(chart)[0];
  assert.notEqual(matchTap(chart, songAt, cueTime(songAt, demo.beat))?.cue, demo, "a demo is the host's: no tap is meant for it");
  assert.equal(judgeHit(chart, demo.id, 0, 0), null);
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
  assert.deepEqual([c.bar, c.inBar, c.section, c.mode, c.over], [15, 0.5, "breakdown", "echo", false]);
  assert.equal(clockAt(chart, songAt, songAt - 1000).section, null);
  assert.equal(clockAt(chart, songAt, songAt + SONG_MS).over, true);
});

test("practice is narrated: the line at each beat, Rhythm Heaven's text box, gone once play starts", () => {
  const chart = chartOf("paddle");
  assert.equal(lineAt(chart, 6), null);
  assert.equal(lineAt(chart, 7).text, "Paddle on 1 and 3");
  assert.equal(lineAt(chart, 11).text, "Keep paddling. Hey! on 4");
  assert.equal(lineAt(chart, 16).text, "Watch");
  assert.equal(lineAt(chart, 21).text, "Both now");
  assert.equal(lineAt(chart, 24), null, "play has no box");
  assert.deepEqual(demoCues(chart).map(c => [c.beat, c.kind, c.call]), [[16, "paddle", null], [18, "paddle", null], [19, "hey", 17]],
    "the host's bar paddles and heys");
  const practice = practiceCues(chart);
  assert.deepEqual(practice.map(c => [c.beat, c.kind]), [[8, "paddle"], [10, "paddle"], [12, "paddle"], [14, "paddle"],
    [20, "paddle"], [22, "paddle"], [23, "hey"]], "paddle, keep paddling, (watch), both");
  assert.ok(practice.filter(c => c.beat < 23.5).length >= 4, "enough to calibrate before the offset is fixed");
});

test("after a song: Superb, OK or Try again, a line of feedback, the awards", () => {
  assert.deepEqual([95, 90, 89.9, 65, 64, 0].map(gradeOf), ["superb", "superb", "ok", "ok", "tryagain", "tryagain"]);
  assert.equal(gradeWord("tryagain"), "Try again");
  const chart = chartOf("paddle");
  const scored = scoredCues(chart);
  const heys = scored.filter(c => c.kind === "hey"), paddles = scored.filter(c => c.kind === "paddle");
  const hits = {};
  for (const c of heys) hits[c.id] = { q:"perfect", d:5 };
  for (const c of paddles) hits[c.id] = { q:"late", d:180 };
  const fb = feedbackOf(chart, hits);
  assert.equal(fb.best, "hey");
  assert.equal(fb.worst, "paddle");
  assert.equal(fb.lean, "late");
  assert.equal(fb.line, "Great Heys. Paddles a little late.");
  assert.equal(fb.grade, "tryagain");
  const all = Object.fromEntries(scored.map(c => [c.id, { q:"perfect", d:0 }]));
  assert.equal(feedbackOf(chart, all).line, "Great paddles.");
  const early = Object.fromEntries(scored.map(c => [c.id, { q:"nice", d:-70 }]));
  const awards = awardsOf(chart, [{ i:0, hits:all }, { i:1, hits:early }, { i:2, hits:{} }]);
  assert.deepEqual(awards.map(a => [a.id, a.i]), [["perfects", 0], ["streak", 1], ["splashes", 2]], "one award a rider while another qualifies");
  assert.equal(awards[0].label, "Most Perfects");
});

test("Last Call is a countdown: shown and said, then dark; one tap on zero, a wide window, the farthest off drinks", () => {
  assert.deepEqual(LAST_CALL_TRICKS, ["lights", "slow", "ticks", "rush"]);
  assert.deepEqual([0, 1, 2, 3, 7].map(lastCallId), ["lastcall-lights", "lastcall-slow", "lastcall-ticks", "lastcall-rush", "lastcall-rush"]);
  const lights = chartOf("lastcall-lights"), slow = chartOf("lastcall-slow"), ticks = chartOf("lastcall-ticks"), rush = chartOf("lastcall-rush");
  assert.equal(chartOf(LAST_CALL_ID), lights, "the first trick is the default");
  for (const chart of [lights, slow, ticks, rush]) {
    const cd = chart.countdown;
    assert.equal(chart.name, "Last Call");
    assert.equal(chart.scene, "bar");
    assert.equal(chart.window, LAST_CALL.WINDOW);
    assert.deepEqual(chart.cues.map(c => [c.kind, c.scored]), [["zero", false]]);
    assert.equal(cueTime(0, chart.cues[0].beat), cd.zeroAt);
    assert.deepEqual(cd.steps.map(s => s.n), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    assert.ok(cd.steps.filter(s => s.n <= 3).every(s => !s.show && !s.say && !s.tick), "dark from 3");
    assert.equal(cd.hideAt, cd.steps[7].at);
    assert.ok(cd.revealAt >= cd.zeroAt + LAST_CALL.WINDOW && cd.verdictAt > cd.revealAt && chart.ms > cd.verdictAt);
    assert.deepEqual(JSON.parse(JSON.stringify(chart)), chart);
  }
  assert.equal(lights.countdown.introMs, LAST_CALL.INTRO_FIRST_MS, "the first says what Last Call is");
  assert.equal(lights.countdown.zeroAt - lights.countdown.introMs, 10_000);
  const gaps = slow.countdown.steps.map((s, k, all) => (all[k + 1]?.at ?? slow.countdown.zeroAt) - s.at);
  assert.deepEqual(gaps, [1000, 1000, 1000, 1000, 1400, 1400, 1400, 1400, 1400, 1400], "the slow one stretches from 6");
  assert.deepEqual(ticks.countdown.steps.filter(s => s.tick).map(s => s.n), [6, 5, 4], "voice to ticks at 6");
  const fast = rush.countdown.steps.map((s, k, all) => (all[k + 1]?.at ?? rush.countdown.zeroAt) - s.at);
  assert.deepEqual(fast, [1000, 1000, 1000, 1000, 700, 700, 700, 700, 700, 700], "the rush shortens from 6, dark at 3 at the fast pace");
  assert.ok(rush.countdown.steps.filter(s => s.n > 3).every(s => s.show && s.say && !s.tick));
  assert.equal(rush.countdown.hideAt, rush.countdown.steps[7].at);
  assert.equal(rush.countdown.zeroAt - rush.countdown.introMs, 8200);
  assert.deepEqual(countdownOf("rush"), rush.countdown);
  assert.ok(ticks.countdown.steps.filter(s => s.tick).every(s => s.show && !s.say));
  const songAt = 10_000;
  const late = matchTap(lights, songAt, songAt + lights.countdown.zeroAt + 730);
  assert.deepEqual([late.cue.id, late.d], [0, 730]);
  assert.equal(popupOf(qualityOf(late.d), late.d).num, "+0.73");
  assert.equal(judgeHit(lights, 0, -2900, 0).q, "early");
  assert.equal(matchTap(lights, songAt, songAt + lights.countdown.zeroAt - 3500), null, "too early to be meant for zero");
  assert.equal(lastCallTotal({ 0:-120 }, lights), 120);
  assert.equal(lastCallTotal({}, lights), LAST_CALL.MISS_MS);
  assert.deepEqual(lastCallWorst([{ i:0, ms:60 }, { i:3, ms:900 }, { i:5, ms:900 }]), [3, 5]);
  assert.equal(countdownOf("slow", { first:true }).introMs, LAST_CALL.INTRO_FIRST_MS);
  assert.equal(chartOf("paddle").window, WINDOW.MAX, "songs keep the 300 ms window");
  assert.deepEqual(lights.dark, [], "every chart carries dark");
});

test("the chug-off's timing is shared", () => {
  assert.deepEqual(CHUGOFF, { INTRO_MS:4000, INTRO_FIRST_MS:7000, WINDOW_MS:30000, REVEAL_MS:3000, EXIT_MS:2500 });
});

test("the numbers' tones: songs gold, green, yellow, red by |offset|; Last Call green, yellow, orange, red; a miss stays grey", () => {
  assert.deepEqual([0, 50, -50, 51, 100, -101, 160, 161, -900].map(offsetTone),
    ["gold", "gold", "gold", "green", "green", "yellow", "yellow", "red", "red"]);
  assert.deepEqual([0, 100, -101, 300, 301, -700, 701, 3000].map(countTone),
    ["green", "green", "yellow", "yellow", "orange", "orange", "red", "red"]);
  assert.equal(TONES.miss, "grey");
});

test("the rocket: the host lights it two beats ahead, you launch; Fireworks' plan reads R", () => {
  assert.deepEqual(CUE_KINDS.rocket, { lead:2, mode:"rocket", word:"Launch" });
  assert.ok(MODES.includes("rocket"));
  const chart = chartOf("fireworks");
  assert.deepEqual([chart.id, chart.name, chart.scene], ["fireworks", "Fireworks", "night"]);
  const rockets = chart.cues.filter(c => c.kind === "rocket");
  assert.ok(rockets.length >= 20 && rockets.every(c => c.call === c.beat - 2));
  assert.ok(demoCues(chart).some(c => c.kind === "rocket"), "the host shows it first");
  assert.ok(chart.modes.includes("rocket"));
  for (const id of SONG_IDS) assert.ok(Array.isArray(chartOf(id).dark), `${id} carries dark`);
});

test("dark bars: in play, each the bar before it again, and only their own cues are called in them", () => {
  for (const id of SONG_IDS) {
    const chart = chartOf(id);
    const barOf = beat => Math.floor(beat / 4);
    const shape = bar => cuesBetween(chart, bar * 4, bar * 4 + 4).map(c => [c.beat - bar * 4, c.kind]);
    for (const bar of chart.dark) {
      assert.equal(sectionAt(chart, bar * 4)?.kind, "play", `${id}: dark bar ${bar} is in play`);
      assert.ok(shape(bar).length > 0, `${id}: dark bar ${bar} has taps`);
      assert.deepEqual(shape(bar), shape(bar - 1), `${id}: dark bar ${bar} repeats the bar before it`);
    }
    for (const cue of chart.cues) if (cue.call !== null && chart.dark.includes(barOf(cue.call)))
      assert.ok(chart.dark.includes(barOf(cue.beat)), `${id}: cue ${cue.id} at ${cue.beat} is lit but called in the dark`);
  }
  assert.deepEqual(chartOf("paddle").dark, []);
});

test("rowing is the base of every song: a stroke on 1 and 3 of every play bar unless the song's own cue takes it; practice opens with a bar of rowing; the breakdown only copies", () => {
  for (const id of SONG_IDS) {
    const chart = chartOf(id);
    const plays = chart.sections.filter(s => s.kind === "play");
    for (const section of plays) for (let bar = section.bar; bar < section.bar + section.bars; bar += 1) {
      if (id === "drop" && bar === 29) {
        assert.deepEqual(cuesBetween(chart, bar * 4, bar * 4 + 4), [], "the drop's countdown bar: the music cuts");
        continue;
      }
      for (const beat of [bar * 4, bar * 4 + 2]) {
        const on = chart.cues.filter(c => c.beat === beat);
        assert.equal(on.length, 1, `${id}: one cue on beat ${beat}`);
      }
      assert.ok(cuesBetween(chart, bar * 4, bar * 4 + 4).some(c => c.kind === "paddle"), `${id}: bar ${bar} rows`);
      assert.ok(cuesBetween(chart, bar * 4, bar * 4 + 4).every(c => c.kind !== "paddle" || c.beat % 1 === 0), `${id}: strokes on the beat`);
    }
    const practice = chart.sections.find(s => s.kind === "practice");
    assert.deepEqual(cuesBetween(chart, practice.from, practice.from + 4).map(c => [c.beat - practice.from, c.kind, !!c.demo]),
      [[0, "paddle", false], [2, "paddle", false]], `${id}: a bar of rowing first`);
    assert.match(lineAt(chart, practice.from).text, /^(Row|Paddle) on 1 and 3$/);
    assert.ok(cuesBetween(chart, 56, 88).every(c => c.kind === "echo"), `${id}: the breakdown only copies`);
    assert.ok(practiceCues(chart).filter(c => c.beat < practice.to - 0.5).length >= 4, `${id}: calibrates`);
    const beats = chart.cues.map(c => c.beat);
    assert.equal(new Set(beats).size, beats.length, `${id}: never two cues at one time`);
  }
});
