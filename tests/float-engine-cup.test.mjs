/* Float's Groove Cup (float/shared/cup.js) and its songs (float/shared/groove.js):
   the cut schedule, a whole Cup's cuts and final order, ties, one judgement a
   cue, misses at their deadline by the room's offset, the calibration from
   people only, the breakdown, stand-ins, the phase clock, demo cues, the
   show after a song, the chug-off and Last Call's countdown (float/GROOVE.md
   "Rounds, elimination, positions", "Judging", "Practice, narrated", "After
   a song", "Drinking (Oct 28: Brandon's picks)", "Last Call: the
   countdown"). */
import test from "node:test";
import assert from "node:assert/strict";
import { CUP_TIMING, ROUNDS, SONG_PHASE_MS, addBots, advance, awardsSummary, barPlayers, chugDone, chugoffSummary, createCup, cutOf,
  cutSchedule, cutShowOf, lastCallPhaseMs, lastCallSummary, makeEntrant, meOf, migrate, resultsOf, scoresOf, standingsOf, startCup, tick,
  toLobby } from "../float/shared/cup.js";
import { FREEZE_BEATS, GROOVE, applyHit, botChugAfter, closeSong, createBar, createSong, deadlineOf, excusedAtBar, hitsOf, lastCallOf,
  missAfterOf, rankSong,
  riderStats, stepSong } from "../float/shared/groove.js";
import { CHUGOFF, LAST_CALL, MISS_AFTER_MS, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS, awardsOf, breakdownSection, chartOf, cueTime, demoCues,
  feedbackOf, gradeOf, lastCallId, lastCallTotal, lastCallWorst, playedCues, practiceCues, scoredCues } from "../float/shared/chart.js";
import { cleanRider, PHASES } from "../float/shared/protocol.js";

/* a cup of n riders: bots (spread skills) unless `people` says how many lead it as phones */
function cupOf(n, { drinking = true, people = 0, seed = 9, drinks = () => true } = {}) {
  const cup = createCup({ id:"t", seed, drinking });
  for (let i = 0; i < n; i += 1) {
    const person = i < people;
    cup.entrants.push(makeEntrant(cup, cleanRider({ name:`R${i}`, color:"#112233", drinks:drinks(i) }),
      { device:`d${i}`, bot:!person, skill:person ? null : 0.2 + (0.75 * i) / Math.max(1, n - 1) }));
  }
  startCup(cup, 1000);
  return cup;
}
/* the room's clock: Cup.tick every 100 ms until `until` (or `ms` passes) */
function play(cup, clock, { ms = Infinity, until = () => false, driven = i => cup.entrants[i].bot, each = null } = {}) {
  const end = clock.t + ms;
  const events = [], phases = [];
  while (clock.t < end) {
    clock.t += 100;
    if (each) each(clock.t);
    const out = tick(cup, clock.t, { driven:(i, t) => driven(i, t) });
    events.push(...out.events);
    phases.push(...out.phases);
    if (until(clock.t)) break;
  }
  return { events, phases };
}
const into = cup => ({ t:cup.startAt });
const timeOfCue = (song, cue) => cueTime(song.songAt, cue.beat);
/* a person's hit on `cue` at exactly the room's offset plus `d` */
const hitAt = (cup, i, cue, d = 0) => {
  const t = timeOfCue(cup.song, cue) + cup.song.offset + d;
  return applyHit(cup, cup.song, i, { c:cue.id, r:cup.song.offset + d }, t + 40);
};

test("cutSchedule: five rounds, monotonic, never below 3, the final always 3; 13 is 13, 10, 7, 5, 3", () => {
  assert.equal(ROUNDS, 5);
  assert.deepEqual(cutSchedule(13), [13, 10, 7, 5, 3]);
  for (let n = 1; n <= 16; n += 1) {
    const schedule = cutSchedule(n);
    assert.equal(schedule.length, 5, `n ${n}`);
    assert.equal(schedule[0], n);
    for (let k = 1; k < schedule.length; k += 1) assert.ok(schedule[k] <= schedule[k - 1], `n ${n} monotonic`);
    if (n >= 3) assert.equal(schedule.at(-1), 3, `n ${n} final of 3`);
    else assert.deepEqual(schedule, new Array(5).fill(n), `n ${n}: no cuts`);
  }
  assert.deepEqual(cutSchedule(16), [16, 12, 9, 6, 3]);
  assert.deepEqual(cutSchedule(9), [9, 7, 5, 4, 3]);
  assert.deepEqual(cutSchedule(5), [5, 4, 3, 3, 3]);
  assert.deepEqual(cutSchedule(4), [4, 3, 3, 3, 3]);
  assert.deepEqual(cutSchedule(13, 4), [13, 9, 6, 3], "four rounds as before");
});

test("a whole Cup of 13: five songs in order, the lowest percents out 13, 10, 7, 5, 3, the final's order then the cuts reversed", () => {
  const cup = cupOf(13);
  const clock = into(cup);
  assert.equal(cup.phase, "intro");
  const intros = [];
  const { events, phases } = play(cup, clock, { until:() => cup.phase === "podium", each:() => {
    if (cup.phase === "chugoff" && intros.at(-1)?.round !== cup.round)
      intros.push({ round:cup.round, call:cup.chugoff.goAt - cup.startAt, length:cup.endsAt - cup.startAt });
  } });
  assert.equal(cup.phase, "podium");
  assert.deepEqual(phases, ["song", "cut", "chugoff", "lastcall", "song", "cut", "chugoff", "lastcall", "song", "cut", "chugoff", "lastcall",
    "song", "cut", "chugoff", "lastcall", "song", "cut", "podium"], "a chug-off and a Last Call after every cut but the last");
  assert.deepEqual(intros.map(item => item.call), [CHUGOFF.INTRO_FIRST_MS, CHUGOFF.INTRO_MS, CHUGOFF.INTRO_MS, CHUGOFF.INTRO_MS],
    "the first chug-off's call is 7 s, later ones 4 s");
  assert.deepEqual(cup.history.map(item => item.song), ["paddle", "rock", "spin", "drop", "fireworks"]);
  assert.deepEqual(cup.history.map(item => item.field.length), [13, 10, 7, 5, 3]);
  assert.deepEqual(cup.history.map(item => item.lastCall?.trick ?? null), ["lights", "slow", "ticks", "rush", null], "four Last Calls");
  for (const item of cup.history) {
    const { results } = item;
    assert.deepEqual(results.map(row => row.place), results.map((_, k) => k + 1));
    const through = item.round < 4 ? cutSchedule(13)[item.round + 1] : 3;
    /* the lowest go; the chug-off settles the spot between the last through and the first out */
    assert.equal(results.filter(row => !row.out).length, through);
    if (item.round < 4) {
      assert.deepEqual(results.slice(through + 1).map(row => row.i), item.out.slice(1), "everyone below the pair goes");
      assert.deepEqual([item.chugoff.a, item.chugoff.b], [results[through - 1].i, results[through].i]);
      assert.deepEqual(item.out[0], item.chugoff.loser, "the chug-off's loser is the round's best out");
      assert.deepEqual(cup.history[item.round + 1].field, results.filter(row => !row.out).map(row => row.i),
        "the next field is this ranking, the chug-off's winner in the last spot");
    } else assert.deepEqual(item.out, []);
    assert.deepEqual(results.filter(row => row.out).map(row => row.i).sort((x, y) => x - y), item.out.slice().sort((x, y) => x - y));
    for (let k = 1; k < results.length; k += 1) assert.ok(results[k].pct <= results[k - 1].pct, "by the round's percent");
  }
  /* final: the final's order, then the last cut's best (4th) down to the first out */
  const [r1, r2, r3, r4, final] = cup.history;
  assert.deepEqual(cup.final, [...final.results.map(row => row.i), ...r4.out, ...r3.out, ...r2.out, ...r1.out]);
  assert.deepEqual(cup.podium, final.results.map(row => row.i));
  assert.equal(new Set(cup.final).size, 13);
  assert.equal(cup.out.length, 10);
  assert.deepEqual(cup.out.slice(0, r1.out.length - 1), r1.out.slice(1).reverse(), "out: a round's worst first");
  assert.equal(cup.out[r1.out.length - 1], r1.out[0], "the chug-off's loser after them");
  assert.deepEqual(standingsOf(cup).map(item => item.i), cup.final);
  assert.equal(standingsOf(cup)[3].out, 3, "4th went out in round 4 (index 3)");
  assert.equal(cup.done, true);
  /* the Cup total is each rider's songs summed */
  const winner = cup.final[0];
  const sum = cup.history.reduce((total, item) => total + item.results.find(row => row.i === winner).pct, 0);
  assert.ok(Math.abs(cup.totals[winner] - sum) < 0.05);
  /* every rider in every song got exactly one judgement a cue, and the events said so once each */
  for (const item of cup.history) {
    const chart = chartOf(item.song);
    for (const i of item.field) assert.equal(item.stats[i].perfects + item.stats[i].nice + item.stats[i].ok + item.stats[i].early
      + item.stats[i].late + item.stats[i].misses, scoredCues(chart).length);
  }
  const judged = events.filter(event => event.e === "hit");
  const total = cup.history.reduce((sum, item) => sum + item.field.length * playedCues(chartOf(item.song)).length
    + (item.lastCall ? item.lastCall.players.length * playedCues(chartOf(item.lastCall.id)).length : 0), 0);
  assert.deepEqual(cup.history.map(item => item.lastCall?.players.length ?? null), [13, 13, 13, 13, null], "everyone in the Cup at each Last Call");
  assert.equal(judged.length, total);
  /* sharper bots go further */
  const skill = i => cup.entrants[i].skill;
  const top = cup.final.slice(0, 3).reduce((sum, i) => sum + skill(i), 0) / 3;
  const bottom = cup.final.slice(-4).reduce((sum, i) => sum + skill(i), 0) / 4;
  assert.ok(top > bottom + 0.3, `top ${top}, bottom ${bottom}`);
  play(cup, clock, { until:() => cup.phase === "lobby" });
  assert.equal(cup.phase, "lobby");
  assert.equal(cup.entrants.length, 0, "the bots leave with the Cup");
});

test("1 to 3 riders play every song without a cut; the last song's order is the result", () => {
  for (const n of [1, 2, 3]) {
    const cup = cupOf(n);
    const clock = into(cup);
    play(cup, clock, { until:() => cup.phase === "podium" });
    assert.deepEqual(cup.history.map(item => item.field.length), [n, n, n, n, n]);
    assert.deepEqual(cup.history.map(item => item.song), ["paddle", "rock", "spin", "drop", "fireworks"], "solo QA plays all five");
    assert.deepEqual(cup.out, []);
    assert.deepEqual(cup.final, cup.history[4].results.map(row => row.i));
    assert.deepEqual(cup.podium, cup.final.slice(0, 3));
  }
});

test("the phase clock: intro 8 s, the song's card 3 s before beat 0, cut 12 s, Last Call 3 s + its countdown + 1.5 s, then the next song; the last cut 7 s, podium 15 s, feedback 45 s", () => {
  const cup = cupOf(4);
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.INTRO_MS);
  assert.equal(cup.songId, "paddle", "the first song is known in the intro");
  const introEnds = cup.endsAt;
  advance(cup, introEnds + 40);
  assert.equal(cup.phase, "song");
  assert.equal(cup.startAt, introEnds, "on time: the song goes up when the intro ends");
  assert.equal(cup.songAt, cup.startAt + SONG_LEAD_MS);
  assert.equal(cup.endsAt, cup.songAt + SONG_MS + SONG_TAIL_MS);
  assert.equal(SONG_PHASE_MS, SONG_LEAD_MS + SONG_MS + SONG_TAIL_MS);
  assert.equal(cup.song.songAt, cup.songAt);
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "cut");
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.CUT_BEFORE_LAST_CALL_MS, "a cut with Last Call after it is 12 s");
  assert.equal(CUP_TIMING.CUT_BEFORE_LAST_CALL_MS, 12000);
  /* 4 riders: one goes, so the last through and the first out chug for the spot */
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "chugoff");
  assert.equal(cup.chugoff.goAt, cup.startAt + CHUGOFF.INTRO_FIRST_MS, "the Cup's first chug-off says its rule: 7 s");
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.CHUGOFF_MAX_MS);
  assert.equal(CUP_TIMING.CHUGOFF_MAX_MS, 7000 + 30000 + 3000 + 2500);
  const cutEnds = cup.endsAt;
  advance(cup, cutEnds);
  assert.equal(cup.phase, "lastcall");
  assert.equal(cup.round, 0, "Last Call belongs to the round it follows");
  assert.equal(cup.startAt, cutEnds);
  assert.equal(cup.bar.songAt, cup.startAt + CUP_TIMING.LAST_CALL_LEAD_MS);
  assert.equal(cup.bar.id, "lastcall-lights");
  assert.equal(cup.endsAt, cup.bar.songAt + chartOf(cup.bar.id).ms + SONG_TAIL_MS);
  assert.equal(cup.endsAt - cup.startAt, lastCallPhaseMs(0));
  assert.equal(lastCallPhaseMs(0), 3000 + chartOf("lastcall-lights").ms + 1500);
  assert.equal(chartOf(cup.bar.id).countdown.introMs, LAST_CALL.INTRO_FIRST_MS, "the first one's intro says what it is: 7 s");
  /* a phase that ends late (a room that slept) starts the next from now */
  const late = cup.endsAt + 9000;
  advance(cup, late);
  assert.equal(cup.phase, "song");
  assert.equal(cup.round, 1);
  assert.equal(cup.songId, "rock");
  assert.equal(cup.startAt, late);
  for (const round of [1, 2, 3, 4]) {
    advance(cup, cup.endsAt);
    assert.equal(cup.phase, "cut", `round ${round}`);
    if (round < 4) {
      advance(cup, cup.endsAt);
      assert.equal(cup.phase, "lastcall", "3 riders: nobody goes, no chug-off");
      assert.equal(cup.bar.id, lastCallId(round));
      assert.equal(cup.endsAt - cup.startAt, lastCallPhaseMs(round));
      assert.equal(chartOf(cup.bar.id).countdown.introMs, LAST_CALL.INTRO_MS, "later ones: a 3 s title");
      advance(cup, cup.endsAt);
      assert.equal(cup.phase, "song");
    }
  }
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.CUT_LAST_MS);
  assert.equal(cutOf(cup), null, "no cut after the final");
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "podium", "and no Last Call after the final");
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.PODIUM_MS);
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "feedback");
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.FEEDBACK_MS);
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "lobby");
  assert.equal(cup.endsAt, null);
  for (const phase of ["lobby", "intro", "song", "cut", "lastcall", "podium", "feedback"]) assert.ok(PHASES.includes(phase));
});

test("with the room's drinking off there is no Last Call: each cut is 15 s and the next song follows it", () => {
  const cup = cupOf(5, { drinking:false });
  const clock = into(cup);
  const { phases } = play(cup, clock, { until:() => cup.phase === "podium" });
  assert.deepEqual(phases, ["song", "cut", "song", "cut", "song", "cut", "song", "cut", "song", "cut", "podium"]);
  assert.ok(cup.history.every(item => !("lastCall" in item)));
  const dry = cupOf(5, { drinking:false });
  advance(dry, dry.endsAt);
  advance(dry, dry.endsAt);
  assert.equal(dry.phase, "cut");
  assert.equal(dry.endsAt - dry.startAt, CUP_TIMING.CUT_MS);
  assert.equal(CUP_TIMING.CUT_MS, 15000);
});

test("ties: the round percent, then the Cup total, then perfects, then the field's order", () => {
  const cup = cupOf(7, { people:7 });
  advance(cup, cup.endsAt);
  const song = cup.song;
  const scored = scoredCues(chartOf(song.id));
  const give = (i, qualities) => qualities.forEach((q, k) => { song.judged[i][scored[k].id] = [q, q === "miss" ? null : 0, "p"]; });
  const f = song.field;
  /* f[0] and f[1]: the same percent (100 + 40 = 70 + 70), the same Cup total; f[0] has the perfect */
  give(f[1], ["perfect", "ok"]);
  give(f[0], ["nice", "nice"]);
  /* f[2] and f[3]: the same percent and perfects; f[3] carries more from earlier songs */
  give(f[2], ["perfect", "perfect"]);
  give(f[3], ["perfect", "perfect"]);
  cup.totals[f[3]] = 180.5;
  cup.totals[f[2]] = 180.4;
  /* f[4]: a huge Cup total never beats a better round percent */
  give(f[4], ["ok"]);
  cup.totals[f[4]] = 999;
  /* f[5] and f[6]: identical in everything: the field's order */
  give(f[5], ["ok"]);
  give(f[6], ["ok"]);
  const rows = rankSong(cup, song);
  assert.deepEqual(rows.map(row => row.i), [f[3], f[2], f[1], f[0], f[4], f[5], f[6]]);
  assert.equal(rows[2].pct, rows[3].pct, "a real tie on the percent");
  assert.deepEqual(rows.map(row => row.place), [1, 2, 3, 4, 5, 6, 7]);
});

test("one judgement a cue: a second hit is ignored, a hit after its miss is ignored, a tap from the future is not believed", () => {
  const cup = cupOf(2, { people:1 });
  advance(cup, cup.endsAt);
  const song = cup.song;
  const [first, second, third] = scoredCues(chartOf(song.id));
  const t = timeOfCue(song, first);
  const hit = applyHit(cup, song, 0, { c:first.id, r:30 }, t + 90);
  assert.deepEqual(hit, { e:"hit", i:0, c:first.id, q:"perfect", d:30, at:t + 30 });
  assert.equal(applyHit(cup, song, 0, { c:first.id, r:-20 }, t + 95), null, "judged once");
  assert.deepEqual(song.judged[0][first.id], ["perfect", 30, "p"]);
  /* past the deadline the cue is the room's miss, whatever arrives */
  const t2 = timeOfCue(song, second);
  assert.equal(applyHit(cup, song, 0, { c:second.id, r:100 }, t2 + MISS_AFTER_MS), null, "after its miss");
  const { events } = stepSong(cup, song, t2 + MISS_AFTER_MS, { driven:i => i === 1 });
  assert.ok(events.some(event => event.i === 0 && event.c === second.id && event.q === "miss" && !("d" in event)));
  assert.equal(applyHit(cup, song, 0, { c:second.id, r:0 }, t2 + MISS_AFTER_MS + 10), null);
  /* a tap stamped well ahead of the room's clock */
  const t3 = timeOfCue(song, third);
  assert.equal(applyHit(cup, song, 0, { c:third.id, r:0 }, t3 - GROOVE.FUTURE_MS - 5), null, "from the future");
  assert.ok(applyHit(cup, song, 0, { c:third.id, r:0 }, t3 - GROOVE.FUTURE_MS + 5), "a stamp a little ahead is fine");
  /* junk */
  for (const bad of [{ c:9999, r:0 }, { c:"1", r:0 }, { c:third.id + 1, r:"x" }, { c:third.id + 1, r:null }, { c:third.id + 1, r:500 }])
    assert.equal(applyHit(cup, song, 0, bad, t3 + 100), null, JSON.stringify(bad));
  assert.equal(applyHit(cup, song, 7, { c:third.id + 1, r:0 }, t3 + 100), null, "not in the field");
});

test("misses land at cueTime + offset + 550 by the room's offset", () => {
  const cup = cupOf(2, { people:2 });
  cup.offset = 200;
  advance(cup, cup.endsAt);
  const song = cup.song;
  assert.equal(song.offset, 200, "the last song's offset to start from");
  const cue = scoredCues(chartOf(song.id))[0];
  const deadline = timeOfCue(song, cue) + 200 + MISS_AFTER_MS;
  assert.equal(deadlineOf(song, cue), deadline);
  stepSong(cup, song, deadline - 1);
  assert.equal(song.judged[0][cue.id], undefined, "not yet");
  /* a late tap 300 ms after the cue (by the offset) still lands before it */
  assert.equal(applyHit(cup, song, 1, { c:cue.id, r:200 + 290 }, deadline - 1).q, "late");
  const { events } = stepSong(cup, song, deadline);
  assert.deepEqual(events.filter(event => event.c === cue.id), [{ e:"hit", i:0, c:cue.id, q:"miss", at:deadline }]);
});

test("the calibration is people's practice only: median, at most once a beat, frozen from the first play bar, the last song's under 4 samples", () => {
  /* solo QA: one person and five bots */
  const cup = cupOf(6, { people:1 });
  const clock = into(cup);
  play(cup, clock, { until:() => cup.phase === "song" });
  const song = cup.song;
  assert.equal(song.offset, 0, "0 at the Cup's first song");
  const practice = practiceCues(chartOf(song.id));
  const lags = [140, 160, 150, 155, 145, 152, 148, 151, 149, 150];
  const changes = [];
  let last = song.offset;
  play(cup, clock, { until:() => song.frozen,
    each:t => {
      for (const [k, cue] of practice.entries()) {
        const at = timeOfCue(song, cue) + lags[k];
        if (song.judged[0][cue.id] || at > t) continue;
        applyHit(cup, song, 0, { c:cue.id, r:lags[k] }, t);
      }
      if (song.offset !== last) { changes.push(Math.floor((t - song.songAt) / 500)); last = song.offset; }
    } });
  assert.deepEqual(song.samples, lags.slice(0, song.samples.length), "only the person's taps are samples");
  assert.equal(song.samples.length, practice.length, "every practice tap before the freeze (7 in Paddle Party)");
  assert.ok(practice.length >= 6);
  assert.equal(song.offset, 150, "the median");
  assert.ok(new Set(changes).size === changes.length, `at most once a beat (${changes})`);
  /* frozen half a beat before the first play bar */
  const play0 = chartOf(song.id).sections.find(section => section.kind === "play");
  assert.ok(clock.t >= song.songAt + (play0.from - FREEZE_BEATS) * 500 && clock.t < song.songAt + play0.from * 500);
  /* bots' taps judge as their skill whatever the offset: centred on it */
  const bots = Object.entries(song.judged).filter(([i]) => Number(i) > 0).flatMap(([, judged]) => Object.values(judged))
    .filter(item => item[1] !== null);
  const meanD = bots.reduce((sum, item) => sum + item[1], 0) / bots.length;
  assert.ok(Math.abs(meanD) < 25, `bots' mean d ${meanD}`);
  /* a late practice tap after the freeze moves nothing */
  const offset = song.offset;
  const samples = song.samples.length;
  const open = practice.find(cue => !song.judged[0][cue.id]);
  if (open) applyHit(cup, song, 0, { c:open.id, r:-200 }, clock.t);
  stepSong(cup, song, clock.t + 600);
  assert.equal(song.offset, offset);
  assert.equal(song.samples.length, samples);
  /* the next song starts from it */
  play(cup, clock, { until:() => cup.phase === "song" && cup.round === 1 });
  assert.equal(cup.offset, 150);
  assert.equal(cup.song.offset, 150);
  assert.equal(cup.history[0].offset, 150);
  assert.equal(cup.history[0].samples, song.samples.length);
});

test("a practice with fewer than 4 samples keeps the last song's offset", () => {
  const practiceWith = (taps, base) => {
    const cup = cupOf(3, { people:1 });
    cup.offset = base;
    const clock = into(cup);
    play(cup, clock, { until:() => cup.phase === "song" });
    const song = cup.song;
    const cues = practiceCues(chartOf(song.id)).slice(0, taps);
    play(cup, clock, { until:() => song.frozen, each:t => {
      for (const cue of cues) if (!song.judged[0][cue.id] && timeOfCue(song, cue) + 20 <= t) applyHit(cup, song, 0, { c:cue.id, r:20 }, t);
    } });
    return song;
  };
  const three = practiceWith(3, 90);
  assert.equal(three.samples.length, 3);
  assert.equal(three.offset, 90, "3 samples: the last song's offset");
  const four = practiceWith(4, 90);
  assert.equal(four.samples.length, 4);
  assert.equal(four.offset, 20, "4 samples: this song's");
});

test("the breakdown, where the drink break was: echo cues are played and scored like play, tapped by bots and stand-ins; no Done anywhere in a song", () => {
  const chart = chartOf("paddle");
  const breakdown = breakdownSection(chart);
  const echoes = chart.cues.filter(cue => cue.kind === "echo");
  assert.deepEqual([breakdown.from, breakdown.to], [56, 88]);
  assert.ok(echoes.length >= 8 && echoes.every(cue => cue.scored && cue.beat >= 56 && cue.beat < 88));
  /* rider 0 a phone that taps every echo, 1 a person gone (a stand-in), 2 to 4 bots */
  const cup = cupOf(5, { people:2 });
  const clock = into(cup);
  const driven = (i, t) => cup.entrants[i].bot || i === 1;
  play(cup, clock, { driven, until:() => cup.phase === "song" });
  const song = cup.song;
  play(cup, clock, { driven, until:() => cup.phase !== "song", each:t => {
    for (const cue of echoes) if (!song.judged[0][cue.id] && timeOfCue(song, cue) + 10 <= t) applyHit(cup, song, 0, { c:cue.id, r:10 }, t);
  } });
  const judged = cup.history[0];
  for (const i of [0, 1, 2]) assert.equal(judged.stats[i].perfects + judged.stats[i].nice + judged.stats[i].ok + judged.stats[i].early
    + judged.stats[i].late + judged.stats[i].misses, scoredCues(chart).length);
  assert.ok(judged.stats[0].hits >= echoes.length, "the phone's echoes landed");
  assert.ok(judged.stats[1].botShare > 0.9, "a stand-in played them for the person gone");
  assert.equal(cup.scores.every(row => !("done" in row)), true);
});

test("the chug-off: the last through and the first out (the cut's order, its ties included); the first Done keeps the spot, the out and the next field follow", () => {
  const cup = cupOf(5, { people:5 });
  advance(cup, cup.endsAt);
  /* the song as given: riders by points, 3 and 4 tied on everything (the field's order breaks it) */
  const song = cup.song;
  const scored = scoredCues(chartOf(song.id));
  const give = (i, n) => scored.slice(0, n).forEach(cue => { song.judged[i][cue.id] = ["perfect", 0, "p"]; });
  const order = song.field.slice();
  [40, 30, 20, 10, 10].forEach((n, k) => give(order[k], n));
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "cut");
  const [first, second, third, a, b] = order;
  assert.deepEqual(cup.bubble, [a, b], "4th and 5th, tied: the field's order decides who is which");
  assert.deepEqual(cup.results.filter(row => row.bubble).map(row => row.i), [a, b]);
  assert.deepEqual(cup.field, [first, second, third], "the spot is open");
  assert.deepEqual(cup.out, []);
  assert.equal(meOf(cup, a, 0).through, null);
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "chugoff");
  const go = cup.chugoff.goAt;
  assert.equal(chugDone(cup, b, go - 1), null, "not before the go");
  assert.equal(chugDone(cup, first, go + 100), null, "only the two");
  const done = chugDone(cup, b, go + 2500);
  assert.deepEqual(done.events, [{ e:"done", i:b, at:go + 2500 }]);
  assert.deepEqual(done.decided, { winner:b, loser:a, by:"chug", at:go + 2500 });
  assert.deepEqual(chugoffSummary(cup), { a, b, goAt:go, doneAt:{ [b]:2500 }, winner:b, by:"chug", loser:a, decidedAt:go + 2500 });
  assert.deepEqual(cup.field, [first, second, third, b], "the winner takes the last spot");
  assert.deepEqual(cup.out, [a]);
  assert.equal(cup.endsAt, go + 2500 + CHUGOFF.REVEAL_MS + CHUGOFF.EXIT_MS);
  assert.equal(chugDone(cup, b, go + 3000), null, "once each");
  assert.ok(chugDone(cup, a, go + 4000), "the other's Done is kept for the record");
  assert.equal(chugDone(cup, a, go + CHUGOFF.WINDOW_MS + 1), null);
  assert.equal(meOf(cup, b, 0).through, true);
  assert.equal(meOf(cup, a, 0).out, true);
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "lastcall");
  const record = cup.history[0].chugoff;
  assert.deepEqual(record, { round:0, a, b, goAt:go, doneAt:{ [b]:2500, [a]:4000 }, winner:b, loser:a, by:"chug" });
  assert.deepEqual(cup.history[0].out, [a]);
  assert.equal(cup.history[0].results.find(row => row.i === a).out, true);
  assert.deepEqual(cup.bar.field, [first, second, third, b, a], "at the bar: the field, then the riders out");
  assert.equal(chugoffSummary(cup), null);
});

test("a chug-off nobody finishes goes to the better score; a contender whose phone is gone can't win; both gone, the score; bots chug in 4 to 12 s", () => {
  const settle = ({ bots = false, gone = () => false, n = 4 } = {}) => {
    const cup = cupOf(n, { people:bots ? 0 : n });
    const clock = into(cup);
    const driven = (i, t) => cup.entrants[i].bot || gone(i, t, cup);
    play(cup, clock, { driven, until:() => cup.phase === "chugoff" });
    const go = cup.chugoff.goAt;
    play(cup, clock, { driven, until:() => cup.phase !== "chugoff" });
    return { cup, go, record:cup.history[0].chugoff };
  };
  const none = settle();
  assert.deepEqual([none.record.winner, none.record.by], [none.record.a, "score"], "the better score: the last through");
  assert.deepEqual(none.record.doneAt, {});
  const gone = settle({ gone:(i, t, cup) => i === cup.history[0]?.chugoff?.a || i === cup.chugoff?.a });
  assert.deepEqual([gone.record.winner, gone.record.by], [gone.record.b, "forfeit"], "the one here keeps the spot");
  const both = settle({ gone:(i, t, cup) => [cup.chugoff?.a, cup.chugoff?.b].includes(i) });
  assert.deepEqual([both.record.winner, both.record.by], [both.record.a, "score"]);
  const bots = settle({ bots:true });
  const times = Object.values(bots.record.doneAt);
  assert.equal(times.length, 2, "both bots finish");
  assert.ok(times.every(ms => ms >= GROOVE.CHUG_FROM_MS && ms <= GROOVE.CHUG_FROM_MS + GROOVE.CHUG_SPAN_MS));
  assert.equal(bots.record.by, "chug");
  assert.equal(bots.record.doneAt[bots.record.winner], Math.min(...times));
  assert.equal(botChugAfter(bots.cup.seed, 0, bots.record.a), bots.record.doneAt[bots.record.a]);
});

test("no chug-off with the room's drinking off, after the final, or when nobody goes out", () => {
  const dry = cupOf(5, { drinking:false });
  const { phases } = play(dry, into(dry), { until:() => dry.phase === "podium" });
  assert.ok(!phases.includes("chugoff"));
  assert.ok(dry.history.every(item => !item.chugoff));
  const small = cupOf(3);
  const small2 = play(small, into(small), { until:() => small.phase === "podium" });
  assert.ok(!small2.phases.includes("chugoff"), "3 riders: nobody goes");
  const four = cupOf(4);
  const four2 = play(four, into(four), { until:() => four.phase === "podium" });
  assert.equal(four2.phases.filter(phase => phase === "chugoff").length, 1, "4 riders: only the first song cuts");
});

test("a phone gone 5 s is played by a stand-in until it is back", () => {
  const cup = cupOf(3, { people:1 });
  const clock = into(cup);
  play(cup, clock, { until:() => cup.phase === "song" });
  const song = cup.song;
  /* the person's phone goes quiet 20 s into the song and is back late in play B; it never taps */
  const quietFrom = song.songAt + 20000, backAt = song.songAt + 56000;
  const driven = (i, t) => cup.entrants[i].bot || (t >= quietFrom + GROOVE.STALE_MS && t < backAt);
  play(cup, clock, { driven, until:() => clock.t >= song.songAt + 62000 });
  const chart = chartOf(song.id);
  const at = cue => timeOfCue(song, cue) + song.offset;
  const mine = Object.entries(song.judged[0]).map(([c, item]) => ({ cue:chart.cues[c], by:item[2], q:item[0] }));
  const stood = mine.filter(item => item.by === "s");
  assert.ok(stood.length > 10, `the stand-in played (${stood.length})`);
  assert.ok(stood.every(item => at(item.cue) >= quietFrom + GROOVE.STALE_MS - 300 && at(item.cue) < backAt + 600),
    "only while the phone was gone");
  assert.ok(stood.some(item => item.q !== "miss"), "and hit");
  assert.ok(mine.filter(item => at(item.cue) > backAt + 600).every(item => item.by === "p" && item.q === "miss"), "back: its own cues again");
  play(cup, clock, { driven, until:() => cup.phase === "cut" });
  const stats = cup.history[0].stats;
  assert.ok(stats[0].botShare > 0.2 && stats[0].botShare < 0.8, `the share a stand-in played (${stats[0].botShare})`);
  assert.equal(stats[1].botShare, 1, "a bot plays all of its own");
  assert.equal(stats[0].hits, 0);
});

test("scores, results and me: the field's song so far, the round's ranking, and one rider's own", () => {
  const cup = cupOf(5, { people:1, drinking:false });
  const clock = into(cup);
  assert.deepEqual(scoresOf(cup, clock.t).map(row => Object.keys(row).sort()), new Array(5).fill(["cup", "i", "live", "n", "pct", "pts"]));
  assert.equal(meOf(cup, 0, clock.t).place, standingsOf(cup).find(row => row.i === 0).place);
  play(cup, clock, { until:() => cup.phase === "song" && clock.t > cup.songAt + 20000 });
  const scores = scoresOf(cup, clock.t);
  assert.equal(scores.length, 5);
  for (const row of scores) {
    assert.ok(row.n > 0 && row.live >= 0 && row.live <= 100 && row.pct >= 0 && row.pct <= row.live);
    assert.equal(row.cup, 0);
  }
  const results = resultsOf(cup);
  assert.deepEqual(results.map(row => row.place), [1, 2, 3, 4, 5]);
  const me = meOf(cup, 0, clock.t);
  for (const key of ["i", "pts", "pct", "live", "place", "of", "cut", "c", "q"]) assert.ok(key in me, key);
  assert.equal(me.of, 5);
  assert.equal(me.cut, 4);
  assert.equal(me.q, "miss", "the person never tapped");
  assert.equal(me.place, 5);
  play(cup, clock, { until:() => cup.phase === "cut" });
  const cutMe = meOf(cup, 0, clock.t);
  assert.equal(cutMe.out, true);
  assert.equal(cutMe.through, false);
  assert.equal(cutMe.place, 5);
  const through = meOf(cup, cup.field[0], clock.t);
  assert.equal(through.through, true);
  assert.equal(through.place, 1);
  /* the cut's scores are the song's final ones */
  assert.equal(scoresOf(cup, clock.t).length, 5);
  assert.ok(scoresOf(cup, clock.t).every(row => row.n === scoredCues(chartOf("paddle")).length));
  play(cup, clock, { until:() => cup.phase === "song" });
  assert.deepEqual(meOf(cup, 0, clock.t).out, true, "out riders hear they are out");
});

test("closing a song judges anything left open; riderStats carry every quality and the share a bot played", () => {
  const cup = cupOf(2, { people:2 });
  advance(cup, cup.endsAt);
  const { ranking, events } = closeSong(cup, cup.song);
  const total = playedCues(chartOf(cup.song.id)).length;
  assert.equal(events.length, total * 2);
  assert.ok(events.every(event => event.q === "miss"));
  assert.deepEqual(ranking.map(row => row.pct), [0, 0]);
  const stats = riderStats(cup, cup.song, 0);
  assert.deepEqual(Object.keys(stats).sort(), ["botShare", "early", "hits", "late", "misses", "nice", "ok", "pct", "perfects", "pts"]);
  assert.equal(stats.botShare, 0);
  assert.equal(stats.misses, scoredCues(chartOf(cup.song.id)).length);
});

test("a song is plain JSON that survives a save; a fresh song for a song phase that lost its state", () => {
  const cup = cupOf(4);
  const clock = into(cup);
  play(cup, clock, { until:() => cup.phase === "song" && clock.t > cup.songAt + 30000 });
  const copy = JSON.parse(JSON.stringify(cup));
  assert.deepEqual(copy, cup);
  /* both carry on to the same judgements: the bots' taps are a function of the seed */
  const a = play(cup, { t:clock.t }, { ms:20000 });
  const b = play(copy, { t:clock.t }, { ms:20000, driven:i => copy.entrants[i].bot });
  assert.deepEqual(copy.song.judged, cup.song.judged);
  assert.deepEqual(a.events, b.events);
  /* createSong carries the last offset and the field's order */
  const song = createSong({ cup, round:1, songAt:5000, field:[3, 1], base:42 });
  assert.deepEqual([song.id, song.field, song.offset, song.base, song.frozen], ["rock", [3, 1], 42, 42, false]);
});

test("addBots fills with named computer riders; toLobby lets them go; a saved 3D Cup comes back as a lobby", () => {
  const cup = createCup({ id:"bots", seed:4 });
  cup.entrants.push(makeEntrant(cup, cleanRider({ name:"Ann" }), { device:"a" }));
  assert.equal(addBots(cup, 12), 12);
  assert.equal(cup.entrants.length, 13);
  assert.equal(addBots(cup, 10), 3, "never past 16");
  cup.entrants.length = 13;
  const bots = cup.entrants.filter(entrant => entrant.bot);
  assert.equal(new Set(bots.map(entrant => entrant.name)).size, 12);
  assert.ok(bots.every(entrant => entrant.skill >= 0.1 && entrant.skill <= 0.65 && entrant.color && entrant.look.critter !== "winnie"));
  startCup(cup, 0);
  toLobby(cup, 5);
  assert.deepEqual(cup.entrants.map(entrant => entrant.name), ["Ann"]);
  assert.deepEqual([cup.history, cup.final, cup.podium, cup.field], [[], null, null, []]);
  /* the parked river's save */
  const old = { v:1, id:"c-old", mode:"party", code:"brkt", drinking:true, seed:7, phase:"race", startAt:1, endsAt:2,
    round:2, entrants:[{ device:"a", name:"Ann", color:"#112233", look:{ critter:"otter" }, bot:false, ready:true },
      { device:"bot-1", name:"Frog", bot:true, skill:0.5 }], field:[0, 1], out:[], beach:{} };
  const back = migrate(old, 1000);
  assert.equal(back.v, 2);
  assert.equal(back.phase, "lobby");
  assert.deepEqual(back.entrants.map(entrant => entrant.name), ["Ann"]);
  assert.equal(back.entrants[0].ready, false);
  const fd = migrate({ ...old, mode:"fieldday", evId:"float", id:"cup-1" }, 1000);
  assert.equal(fd.startPlanned, 1000 + CUP_TIMING.START_SOON_MS, "a Field Day Cup under way starts over by itself");
  assert.equal(fd.entrants.length, 2, "with its bots");
  assert.equal(migrate(back, 2000), back, "a Groove Cup is left alone");
});

/* ---- demo cues (GROOVE.md "Practice, narrated") ---- */

test("demo cues are the host's: never judged, missed, tapped by a bot or a stand-in, or calibrated on", () => {
  /* rider 0 a phone that taps everything it can, rider 1 a person gone (a stand-in), the rest bots */
  const cup = cupOf(5, { people:2 });
  const clock = into(cup);
  const driven = (i, t) => cup.entrants[i].bot || i === 1;
  play(cup, clock, { driven, until:() => cup.phase === "song" });
  const song = cup.song;
  const chart = chartOf(song.id);
  const demos = demoCues(chart);
  assert.ok(demos.length >= 1 && demos.every(cue => !cue.scored), "Paddle Party's practice shows one");
  const refused = new Set();
  play(cup, clock, { driven, until:() => clock.t >= song.songAt + 30000, each:t => {
    for (const cue of chart.cues) {
      if (song.judged[0][cue.id] || refused.has(cue.id) || cueTime(song.songAt, cue.beat) + 20 > t) continue;
      const hit = applyHit(cup, song, 0, { c:cue.id, r:20 }, t);
      if (!hit) refused.add(cue.id);
    }
  } });
  assert.deepEqual([...refused].sort(), demos.map(cue => cue.id).sort(), "a tap on a demo is no hit, and only on a demo");
  for (const i of song.field) for (const cue of demos) assert.equal(song.judged[i][cue.id], undefined, `rider ${i}: the demo is nobody's`);
  assert.equal(song.samples.length, practiceCues(chart).length, "every tapped practice cue a sample, the demos none");
  /* the song's end judges what was played and nothing else */
  play(cup, clock, { driven, until:() => cup.phase === "cut" });
  for (const i of [0, 1, 2]) {
    const stats = cup.history[0].stats[i];
    assert.equal(stats.perfects + stats.nice + stats.ok + stats.early + stats.late + stats.misses, scoredCues(chart).length);
  }
});

test("a practice with three taps from people: a lone phone keeps the last song's offset", () => {
  const chart = chartOf("rock");
  assert.ok(practiceCues(chart).length >= 4, "every practice has enough to calibrate (v3: rowing in every song)");
  const cup = cupOf(3, { people:1 });
  cup.offset = 110;
  advance(cup, cup.endsAt);
  cup.round = 1;
  cup.song = createSong({ cup, round:1, songAt:cup.songAt, field:cup.field, base:110 });
  const song = cup.song;
  assert.equal(song.id, "rock");
  const clock = { t:song.songAt };
  play(cup, clock, { until:() => song.frozen, each:t => {
    for (const cue of practiceCues(chart).slice(0, 3)) if (!song.judged[0][cue.id] && cueTime(song.songAt, cue.beat) + 30 <= t)
      applyHit(cup, song, 0, { c:cue.id, r:30 }, t);
  } });
  assert.equal(song.samples.length, 3);
  assert.equal(song.offset, 110, "three samples: the last song's offset");
});

/* ---- after a song (GROOVE.md "After a song") ---- */

test("after a song: each rider's grade in the results, the song's awards in the cut, each phone's line; the cut 12 s before Last Call, 15 s without, 7 s after the final", () => {
  const cup = cupOf(6, { people:1 });
  const clock = into(cup);
  let before = null;
  play(cup, clock, { until:() => cup.phase === "cut", each:t => {
    if (cup.phase === "song" && t >= cup.endsAt - 300) before = structuredClone(cup.song);
  } });
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.CUT_BEFORE_LAST_CALL_MS);
  const chart = chartOf(before.id);
  for (const row of cup.results) assert.equal(row.grade, gradeOf(row.pct));
  assert.deepEqual(resultsOf(cup).map(row => row.grade), cup.results.map(row => row.grade));
  assert.ok(cup.results.some(row => row.grade === "superb"), "sharp bots: Superb");
  assert.equal(cup.results.find(row => row.i === 0).grade, "tryagain", "a phone that never tapped: Try again");
  const expected = awardsOf(chart, before.field.map(i => ({ i, hits:hitsOf(before, i) })));
  assert.ok(expected.length >= 1);
  assert.deepEqual(awardsSummary(cup), expected);
  assert.deepEqual(cup.history[0].awards, expected);
  const feedback = feedbackOf(chart, hitsOf(before, 0));
  assert.deepEqual(meOf(cup, 0, clock.t).feedback, { grade:feedback.grade, line:feedback.line });
  const sharp = cup.results[0].i;
  assert.deepEqual(meOf(cup, sharp, clock.t).feedback.grade, cup.results[0].grade);
  /* awards are the cut's alone */
  play(cup, clock, { until:() => cup.phase === "lastcall" });
  assert.equal(awardsSummary(cup), null);
  assert.equal(cutShowOf(cup), null);
  assert.equal("feedback" in meOf(cup, 0, clock.t), false);
  assert.equal(CUP_TIMING.CUT_MS, 15000);
});

test("the cut's show: the grades' stamp, the awards a card apart, the cut line, then the riders out from the bottom, inside the cut", () => {
  const S = CUP_TIMING.CUT_SHOW;
  const cup = cupOf(13);
  const clock = into(cup);
  play(cup, clock, { until:() => cup.phase === "cut" });
  const show = cutShowOf(cup);
  assert.equal(show.grades, cup.startAt + S.GRADES_MS);
  assert.deepEqual(show.awards, cup.awards.map((_, k) => cup.startAt + S.AWARDS_MS + k * S.AWARD_GAP_MS));
  assert.equal(show.line, cup.startAt + S.AWARDS_MS + cup.awards.length * S.AWARD_GAP_MS);
  const out = cup.results.filter(row => row.out).map(row => row.i);
  assert.deepEqual(show.outs.map(item => item.i), out.slice().reverse(), "from the bottom: the worst first");
  assert.equal(show.outs[0].at, show.line + S.OUTS_AFTER_LINE_MS);
  for (let k = 1; k < show.outs.length; k += 1) {
    const gap = show.outs[k].at - show.outs[k - 1].at;
    assert.ok(gap > 0 && gap <= S.OUT_GAP_MS + 1, `${gap} ms apart`);
  }
  assert.ok(show.outs.at(-1).at <= cup.endsAt - S.END_MS, "the last out is in with time to leave");
  /* the final's cut: grades and awards, no line, nobody out */
  play(cup, clock, { until:() => cup.phase === "cut" && cup.done });
  const last = cutShowOf(cup);
  assert.equal(cup.endsAt - cup.startAt, CUP_TIMING.CUT_LAST_MS);
  assert.deepEqual([last.line, last.outs], [null, []]);
  assert.ok(last.awards.every(at => at < cup.endsAt));
});

/* ---- Last Call: the countdown (GROOVE.md "Last Call: the countdown") ---- */

/* a cup played to its first Last Call; the room's offset set while the cut runs */
function toLastCall({ n = 8, people = 3, offset = 140, driven = null } = {}) {
  const cup = cupOf(n, { people });
  const clock = into(cup);
  const drive = driven || (i => cup.entrants[i].bot);
  play(cup, clock, { driven:drive, until:() => cup.phase === "cut" });
  cup.offset = offset;
  play(cup, clock, { driven:drive, until:() => cup.phase === "lastcall" });
  return { cup, clock, drive };
}
const zeroOf = bar => bar.songAt + chartOf(bar.id).countdown.zeroAt;

test("Last Call is the countdown: everyone in the Cup at the bar, one tap on zero judged on the last song's offset with a 3 s window, never calibrating; no tap is a miss at zero + offset + window + 250", () => {
  const { cup, clock } = toLastCall();
  const bar = cup.bar;
  const chart = chartOf(bar.id);
  assert.deepEqual([bar.id, chart.countdown.trick], ["lastcall-lights", "lights"]);
  assert.deepEqual(playedCues(chart).map(cue => cue.kind), ["zero"]);
  assert.equal(cup.out.length, 2, "8 riders: 2 out after the first song (8, 6, 5, 4, 3)");
  assert.deepEqual(bar.field, [...cup.field, ...cup.out.slice().reverse()], "the field, then the riders out");
  assert.deepEqual(barPlayers(cup), bar.field);
  assert.deepEqual([bar.offset, bar.frozen], [140, true], "the last song's offset, never calibrating");
  const [out, other] = cup.out;
  const zero = zeroOf(bar);
  /* a person out of the Cup taps 1.2 s early: inside the window, an Early */
  const early = applyHit(cup, bar, out, { c:0, r:140 - 1200 }, zero + 140 - 1200 + 40);
  assert.deepEqual([early.q, early.d], ["early", -1200]);
  assert.equal(applyHit(cup, bar, out, { c:0, r:140 }, zero + 140 + 50), null, "one tap");
  assert.equal(applyHit(cup, bar, other, { c:0, r:140 + LAST_CALL.WINDOW + 61 }, zero + 140 + LAST_CALL.WINDOW + 100), null,
    "past the window is no tap at all");
  assert.equal(missAfterOf(chart), LAST_CALL.WINDOW + 250);
  const deadline = zero + 140 + LAST_CALL.WINDOW + 250;
  assert.equal(deadlineOf(bar, chart.cues[0]), deadline);
  stepSong(cup, bar, deadline - 1, { driven:i => cup.entrants[i].bot });
  assert.equal(bar.judged[other][0], undefined, "not yet");
  const { events } = stepSong(cup, bar, deadline, { driven:i => cup.entrants[i].bot });
  assert.ok(events.some(event => event.i === other && event.c === 0 && event.q === "miss"));
  assert.deepEqual(bar.samples, []);
  assert.equal(bar.offset, 140);
  const summary = lastCallOf(bar, deadline);
  const { place:outPlace, ...outRow } = summary.totals.find(row => row.i === out);
  assert.deepEqual(outRow, { i:out, ms:1200, d:-1200 });
  const { place:otherPlace, ...otherRow } = summary.totals.find(row => row.i === other);
  assert.deepEqual(otherRow, { i:other, ms:LAST_CALL.MISS_MS, d:null }, "no tap: a full 3 s");
  assert.ok(outPlace < otherPlace, "closer is the better place");
  play(cup, clock, { until:() => cup.phase !== "lastcall" });
  const record = cup.history[0].lastCall;
  assert.deepEqual([record.id, record.trick, record.players.length], ["lastcall-lights", "lights", 8]);
  for (const row of record.totals) if (cup.entrants[row.i].bot) assert.ok(Number.isFinite(row.d), "bots always tap");
  assert.equal(cup.song.offset, 140, "and the next song starts from the same offset");
});

test("Last Call's totals: 0 until the tap lands, then |d|, no tap a full 3 s; who drinks once the zero's deadline has passed; a tie drinks together", () => {
  const cup = cupOf(3, { people:3 });
  const bar = createBar({ cup, round:0, songAt:100_000, players:[2, 0, 1], offset:50 });
  const chart = chartOf(bar.id);
  const tap = (i, d) => { bar.judged[i][0] = d === null ? ["miss", null, "p"] : [d < 0 ? "early" : "late", d, "p"]; };
  let summary = lastCallOf(bar, 100_000);
  assert.deepEqual(summary.totals, [{ i:2, ms:0, d:null }, { i:0, ms:0, d:null }, { i:1, ms:0, d:null }], "nothing yet");
  assert.equal(summary.worst, null);
  assert.equal(summary.order, null, "no ranking until the window closes");
  tap(2, -400);
  tap(0, 900);
  const deadline = deadlineOf(bar, chart.cues[0], chart);
  summary = lastCallOf(bar, deadline - 1);
  assert.deepEqual(summary.totals.map(row => [row.ms, row.d]), [[400, -400], [900, 900], [0, null]], "rider 1 not in yet");
  assert.equal(summary.worst, null, "until the deadline");
  summary = lastCallOf(bar, deadline);
  assert.deepEqual(summary.totals.map(row => row.ms), [400, 900, LAST_CALL.MISS_MS], "no tap counts the full 3 s");
  assert.deepEqual(summary.worst, [1]);
  assert.deepEqual(summary.order, [2, 0, 1], "closest to farthest");
  assert.deepEqual(summary.totals.map(row => row.place), [1, 2, 3]);
  tap(1, -900);
  summary = lastCallOf(bar, deadline);
  assert.deepEqual(summary.worst, [0, 1], "tied on the farthest: both drink");
  assert.deepEqual(summary.order, [2, 0, 1], "a tie in the bar's order");
  assert.deepEqual(summary.totals.map(row => row.place), [1, 2, 2], "and sharing a place");
  tap(2, 900);
  summary = lastCallOf(bar, deadline);
  assert.deepEqual([summary.order, summary.totals.map(row => row.place)], [[2, 0, 1], [1, 1, 1]], "all tied: all first");
  assert.equal(summary.totals[2].ms, lastCallTotal({ 0:-900 }, chart));
  assert.deepEqual(summary.worst, lastCallWorst(summary.totals));
});

test("four countdowns, harder each time (lights, slow, ticks, rush), each its own length; stand-ins count for phones gone and never drink; me.lastCall { ms, d, place, of }; the record", () => {
  /* rider 0's phone is here and taps 30 ms after zero; 1 and 2 are gone from the start (stand-ins) */
  const driven = (i, t) => cup.entrants[i].bot || i === 1 || i === 2;
  const cup = cupOf(7, { people:3 });
  const clock = into(cup);
  const mine = [];
  play(cup, clock, { driven, until:() => cup.phase === "podium", each:t => {
    if (cup.phase !== "lastcall") return;
    const bar = cup.bar;
    if (!bar.judged[0][0] && t >= zeroOf(bar) + 30) {
      applyHit(cup, bar, 0, { c:0, r:30 }, t);
      mine.push({ round:cup.round, length:cup.endsAt - cup.startAt, me:meOf(cup, 0, t) });
    }
  } });
  assert.deepEqual(cup.history.map(item => item.lastCall?.trick ?? null), ["lights", "slow", "ticks", "rush", null]);
  assert.deepEqual(mine.map(item => item.length), [0, 1, 2, 3].map(lastCallPhaseMs));
  assert.ok(lastCallPhaseMs(3) < lastCallPhaseMs(2), "the rush is the shortest");
  assert.ok(lastCallPhaseMs(0) > lastCallPhaseMs(2), "the first one's longer intro");
  for (const item of mine) {
    assert.deepEqual(item.me.lastCall, { ms:30, d:30, place:null, of:7 },
      "the phone's own, on the room's offset (0: nobody calibrated); no place before the window closes");
    assert.deepEqual([item.me.c, item.me.q, item.me.d], [0, "perfect", 30]);
  }
  for (const item of cup.history.slice(0, 4)) {
    const record = item.lastCall;
    assert.deepEqual(record.excused.slice().sort(), [1, 2], "a stand-in counted for them");
    assert.ok(record.worst.length >= 1 && !record.worst.includes(1) && !record.worst.includes(2), "and they never drink for it");
    assert.deepEqual(record.worst, lastCallWorst(record.totals.filter(row => ![1, 2].includes(row.i))));
    assert.equal(record.totals.find(row => row.i === 0).ms, 30);
    for (const i of [1, 2]) assert.ok(Number.isFinite(record.totals.find(row => row.i === i).d), `a stand-in tapped for ${i}`);
  }
});

test("a stand-in's tap excuses its person: they keep their seat and total, but who drinks is the farthest off of those who tapped, bots included", () => {
  /* 0 and 1 are people, 2 a bot entrant */
  const cup = cupOf(3, { people:2 });
  const bar = createBar({ cup, round:0, songAt:50_000, players:[0, 1, 2], offset:0 });
  const set = (i, d, by) => { bar.judged[i][0] = d === null ? ["miss", null, by] : ["late", d, by]; };
  set(0, 300, "p");
  set(1, null, "s");
  set(2, 450, "b");
  const over = lastCallOf(bar, Infinity);
  assert.deepEqual(excusedAtBar(bar), [1]);
  assert.deepEqual(over.totals.map(row => [row.i, row.ms]), [[0, 300], [1, LAST_CALL.MISS_MS], [2, 450]], "the excused keep their total");
  assert.deepEqual(over.worst, [2], "a bot entrant can be named: solo QA still has someone");
  /* a person who missed while their own phone was here is not excused */
  set(1, null, "p");
  assert.deepEqual(lastCallOf(bar, Infinity).worst, [1]);
  /* nobody who may drink: nobody drinks */
  set(0, 300, "s");
  set(1, null, "s");
  set(2, 450, "s");
  assert.deepEqual(excusedAtBar(bar), [0, 1, 2]);
  assert.deepEqual(lastCallOf(bar, Infinity).worst, []);
  assert.equal(lastCallOf(bar, 50_000).worst, null, "and before the deadline, null");
});

test("Last Call follows only cuts with a song after them: never after the final, and 1 to 3 riders still get one each round", () => {
  const cup = cupOf(2);
  const clock = into(cup);
  const { phases } = play(cup, clock, { until:() => cup.phase === "podium" });
  assert.equal(phases.filter(phase => phase === "lastcall").length, 4);
  assert.deepEqual(cup.history.map(item => item.lastCall?.players.length ?? null), [2, 2, 2, 2, null]);
});
