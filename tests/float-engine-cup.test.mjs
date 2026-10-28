/* Float's Groove Cup (float/shared/cup.js) and its songs (float/shared/groove.js):
   the cut schedule, a whole Cup's cuts and final order, ties, one judgement a
   cue, misses at their deadline by the room's offset, the calibration from
   people only, the drink rule, stand-ins, the phase clock, and Last Call
   (float/GROOVE.md "Rounds, elimination, positions", "Judging", "The drink
   break", "Last Call"). */
import test from "node:test";
import assert from "node:assert/strict";
import { CUP_TIMING, LAST_CALL_PHASE_MS, ROUNDS, SONG_PHASE_MS, addBots, advance, barPlayers, createCup, cutOf, cutSchedule,
  lastCallSummary, makeEntrant, meOf, migrate, resultsOf, scoresOf, standingsOf, startCup, tick, toLobby } from "../float/shared/cup.js";
import { FREEZE_BEATS, GROOVE, applyDone, applyHit, botDoneAfter, closeSong, createBar, createSong, deadlineOf, drinkTimes, lastCallOf,
  missAfterOf, rankSong,
  riderStats, stepSong } from "../float/shared/groove.js";
import { LAST_CALL, MISS_AFTER_MS, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS, chartOf, cueTime, lastCallTotal, lastCallWorst, practiceCues,
  scoredCues } from "../float/shared/chart.js";
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

test("cutSchedule: four rounds, monotonic, never below 3, the final always 3; 13 is 13, 9, 6, 3", () => {
  assert.equal(ROUNDS, 4);
  assert.deepEqual(cutSchedule(13), [13, 9, 6, 3]);
  for (let n = 1; n <= 16; n += 1) {
    const schedule = cutSchedule(n);
    assert.equal(schedule.length, 4, `n ${n}`);
    assert.equal(schedule[0], n);
    for (let k = 1; k < schedule.length; k += 1) assert.ok(schedule[k] <= schedule[k - 1], `n ${n} monotonic`);
    if (n >= 3) assert.equal(schedule.at(-1), 3, `n ${n} final of 3`);
    else assert.deepEqual(schedule, new Array(4).fill(n), `n ${n}: no cuts`);
  }
  assert.deepEqual(cutSchedule(16), [16, 11, 7, 3]);
  assert.deepEqual(cutSchedule(4), [4, 3, 3, 3]);
});

test("a whole Cup of 13: four songs in order, the lowest percents out 13, 9, 6, 3, the final's order then the cuts reversed", () => {
  const cup = cupOf(13);
  const clock = into(cup);
  assert.equal(cup.phase, "intro");
  const { events, phases } = play(cup, clock, { until:() => cup.phase === "podium" });
  assert.equal(cup.phase, "podium");
  assert.deepEqual(phases, ["song", "cut", "lastcall", "song", "cut", "lastcall", "song", "cut", "lastcall", "song", "cut", "podium"],
    "a Last Call after every cut but the last");
  assert.deepEqual(cup.history.map(item => item.song), ["paddle", "rock", "spin", "drop"]);
  assert.deepEqual(cup.history.map(item => item.field.length), [13, 9, 6, 3]);
  for (const item of cup.history) {
    const { results } = item;
    assert.deepEqual(results.map(row => row.place), results.map((_, k) => k + 1));
    const through = item.round < 3 ? cutSchedule(13)[item.round + 1] : 3;
    assert.deepEqual(item.out, results.slice(through).map(row => row.i), "the lowest go");
    assert.ok(results.slice(through).every(row => row.out) && results.slice(0, through).every(row => !row.out));
    for (let k = 1; k < results.length; k += 1) assert.ok(results[k].pct <= results[k - 1].pct, "by the round's percent");
    if (item.round < 3) assert.deepEqual(cup.history[item.round + 1].field, results.slice(0, through).map(row => row.i),
      "the next field is this ranking");
  }
  /* final: the final's order, then the last cut's best (4th) down to the first out */
  const [r1, r2, r3, final] = cup.history;
  assert.deepEqual(cup.final, [...final.results.map(row => row.i), ...r3.out, ...r2.out, ...r1.out]);
  assert.deepEqual(cup.podium, final.results.map(row => row.i));
  assert.equal(new Set(cup.final).size, 13);
  assert.equal(cup.out.length, 10);
  assert.deepEqual(cup.out.slice(0, 4), r1.out.slice().reverse(), "out: a round's worst first");
  assert.deepEqual(standingsOf(cup).map(item => item.i), cup.final);
  assert.equal(standingsOf(cup)[3].out, 2, "4th went out in round 3 (index 2)");
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
  const total = cup.history.reduce((sum, item) => sum + item.field.length * chartOf(item.song).cues.length
    + (item.lastCall ? item.lastCall.players.length * chartOf("lastcall").cues.length : 0), 0);
  assert.deepEqual(cup.history.map(item => item.lastCall?.players.length ?? null), [13, 13, 13, null], "everyone in the Cup at each Last Call");
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
    assert.deepEqual(cup.history.map(item => item.field.length), [n, n, n, n]);
    assert.deepEqual(cup.out, []);
    assert.deepEqual(cup.final, cup.history[3].results.map(row => row.i));
    assert.deepEqual(cup.podium, cup.final.slice(0, 3));
  }
});

test("the phase clock: intro 8 s, the song's card 3 s before beat 0, cut 12 s, Last Call 3 s + 16 s + 1.5 s, then the next song; the last cut 7 s, podium 15 s, feedback 45 s", () => {
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
  const cutEnds = cup.endsAt;
  advance(cup, cutEnds);
  assert.equal(cup.phase, "lastcall");
  assert.equal(cup.round, 0, "Last Call belongs to the round it follows");
  assert.equal(cup.startAt, cutEnds);
  assert.equal(cup.bar.songAt, cup.startAt + CUP_TIMING.LAST_CALL_LEAD_MS);
  assert.equal(cup.endsAt, cup.bar.songAt + chartOf("lastcall").ms + SONG_TAIL_MS);
  assert.equal(LAST_CALL_PHASE_MS, 3000 + 16000 + 1500);
  /* a phase that ends late (a room that slept) starts the next from now */
  const late = cup.endsAt + 9000;
  advance(cup, late);
  assert.equal(cup.phase, "song");
  assert.equal(cup.round, 1);
  assert.equal(cup.songId, "rock");
  assert.equal(cup.startAt, late);
  for (const round of [1, 2, 3]) {
    advance(cup, cup.endsAt);
    assert.equal(cup.phase, "cut", `round ${round}`);
    if (round < 3) {
      advance(cup, cup.endsAt);
      assert.equal(cup.phase, "lastcall");
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

test("with the room's drinking off there is no Last Call: each cut is 20 s and the next song follows it", () => {
  const cup = cupOf(5, { drinking:false });
  const clock = into(cup);
  const { phases } = play(cup, clock, { until:() => cup.phase === "podium" });
  assert.deepEqual(phases, ["song", "cut", "song", "cut", "song", "cut", "song", "cut", "podium"]);
  assert.ok(cup.history.every(item => !("lastCall" in item)));
  const dry = cupOf(5, { drinking:false });
  advance(dry, dry.endsAt);
  advance(dry, dry.endsAt);
  assert.equal(dry.phase, "cut");
  assert.equal(dry.endsAt - dry.startAt, CUP_TIMING.CUT_MS);
  assert.equal(CUP_TIMING.CUT_MS, 20000);
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
  assert.ok(song.samples.length >= 8);
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

test("the drink rule: a cue after the break is a miss until Done; who skips the drink and a dry room are done anyway", () => {
  /* four people: 0 taps Done, 1 never does, 2 skips the drink, 3 taps Done before the break (ignored) then never */
  const cup = cupOf(4, { people:4, drinks:i => i !== 2 });
  const clock = into(cup);
  play(cup, clock, { until:() => cup.phase === "song", driven:() => false });
  const song = cup.song;
  const chart = chartOf(song.id);
  const drink = drinkTimes(song);
  const cues = chart.cues;
  /* everyone taps every cue perfectly (a phone sends nothing while locked, but the room must not need that) */
  const doneEvents = [];
  play(cup, clock, { driven:() => false, until:() => cup.phase !== "song", each:t => {
    for (const i of [0, 1, 2, 3]) for (const cue of cues) {
      if (song.judged[i][cue.id] || timeOfCue(song, cue) + 10 > t) continue;
      applyHit(cup, song, i, { c:cue.id, r:10 }, t);
    }
    if (t >= drink.from - 3000 && t < drink.from - 2900) assert.equal(applyDone(cup, song, 3, t), null, "not before the break");
    if (t >= drink.from + 6000 && song.done[0] === undefined) doneEvents.push(applyDone(cup, song, 0, t));
  } });
  const result = cup.history.at(-1);
  const after = cues.filter(cue => cue.scored && cue.beat >= drink.toBeat);
  const statsOf = i => result.stats[i];
  assert.ok(doneEvents[0] && doneEvents[0].e === "done");
  assert.equal(statsOf(0).misses, 0, "Done in the break: nothing lost");
  assert.equal(statsOf(1).misses, after.length, "never Done: every cue after the break");
  assert.equal(statsOf(3).misses, after.length);
  assert.equal(statsOf(2).misses, 0, "skips the drink: done without tapping");
  assert.ok(statsOf(2).doneMs >= GROOVE.DONE_FROM_MS && statsOf(2).doneMs <= GROOVE.DONE_FROM_MS + GROOVE.DONE_SPAN_MS,
    "at a bot's moment in the break, like anyone");
  assert.equal(statsOf(1).doneMs, null);
  /* a dry room: done before the song starts, no Done to tap, nothing lost */
  const dry = cupOf(2, { people:2, drinking:false });
  const dryClock = into(dry);
  play(dry, dryClock, { until:() => dry.phase === "song", driven:() => false });
  assert.ok(dry.song.field.every(i => dry.song.done[i] <= dry.startAt));
  assert.deepEqual(scoresOf(dry, dryClock.t).map(row => row.done), [true, true]);
  const { events } = play(dry, dryClock, { driven:() => false, until:() => dry.phase !== "song", each:t => {
    for (const i of [0, 1]) for (const cue of chartOf(dry.song.id).cues)
      if (!dry.song.judged[i][cue.id] && timeOfCue(dry.song, cue) <= t) applyHit(dry, dry.song, i, { c:cue.id, r:0 }, t);
  } });
  assert.equal(events.filter(event => event.e === "done").length, 0);
  assert.equal(dry.history[0].stats[0].misses, 0);
});

test("bots and stand-ins tap Done 4 to 14 s into the break; a phone gone 5 s is played by a stand-in until it is back", () => {
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
  /* the stand-in was in charge through the break, so it tapped Done for the phone, at a bot's moment */
  assert.equal(song.done[0], drinkTimes(song).from + botDoneAfter(cup.seed, 0, 0));
  for (const i of [1, 2]) {
    const after = song.done[i] - drinkTimes(song).from;
    assert.ok(after >= 4000 && after <= 14000, `bot ${i} Done ${after} ms into the break`);
  }
  play(cup, clock, { driven, until:() => cup.phase === "cut" });
  const stats = cup.history[0].stats;
  assert.ok(stats[0].botShare > 0.2 && stats[0].botShare < 0.8, `the share a stand-in played (${stats[0].botShare})`);
  assert.equal(stats[1].botShare, 1, "a bot plays all of its own");
  assert.equal(stats[0].hits, 0);
});

test("scores, results and me: the field's song so far, the round's ranking, and one rider's own", () => {
  const cup = cupOf(5, { people:1 });
  const clock = into(cup);
  assert.deepEqual(scoresOf(cup, clock.t).map(row => Object.keys(row).sort()), new Array(5).fill(["cup", "done", "i", "live", "n", "pct", "pts"]));
  assert.equal(meOf(cup, 0, clock.t).place, standingsOf(cup).find(row => row.i === 0).place);
  play(cup, clock, { until:() => cup.phase === "song" && clock.t > cup.songAt + 20000 });
  const scores = scoresOf(cup, clock.t);
  assert.equal(scores.length, 5);
  for (const row of scores) {
    assert.ok(row.n > 0 && row.live >= 0 && row.live <= 100 && row.pct >= 0 && row.pct <= row.live);
    assert.equal(row.cup, 0);
    assert.equal(row.done, false);
  }
  const results = resultsOf(cup);
  assert.deepEqual(results.map(row => row.place), [1, 2, 3, 4, 5]);
  const me = meOf(cup, 0, clock.t);
  for (const key of ["i", "pts", "pct", "live", "place", "of", "cut", "done", "c", "q"]) assert.ok(key in me, key);
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
  const total = chartOf(cup.song.id).cues.length;
  assert.equal(events.length, total * 2);
  assert.ok(events.every(event => event.q === "miss"));
  assert.deepEqual(ranking.map(row => row.pct), [0, 0]);
  const stats = riderStats(cup, cup.song, 0);
  assert.deepEqual(Object.keys(stats).sort(), ["botShare", "doneMs", "early", "hits", "late", "misses", "nice", "ok", "pct", "perfects", "pts"]);
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
  assert.ok(bots.every(entrant => entrant.skill >= 0.2 && entrant.skill <= 0.95 && entrant.color && entrant.look.critter !== "winnie"));
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

/* ---- Last Call ---- */

/* a cup played to its first Last Call; the room's offset set while the cut runs */
function toLastCall({ n = 7, people = 3, offset = 140, driven = null } = {}) {
  const cup = cupOf(n, { people });
  const clock = into(cup);
  const drive = driven || (i => cup.entrants[i].bot);
  play(cup, clock, { driven:drive, until:() => cup.phase === "cut" });
  cup.offset = offset;
  play(cup, clock, { driven:drive, until:() => cup.phase === "lastcall" });
  return { cup, clock, drive };
}
const grabAt = (bar, c) => cueTime(bar.songAt, chartOf("lastcall").cues[c].beat);

test("Last Call: everyone in the Cup at the bar, judged on the last song's offset with a one-second window, never calibrating", () => {
  const { cup, clock } = toLastCall();
  const bar = cup.bar;
  assert.equal(cup.round, 0);
  assert.equal(cup.out.length, 2, "7 riders: 2 out after the first song");
  assert.deepEqual(bar.field, [...cup.field, ...cup.out.slice().reverse()], "the field, then the riders out");
  assert.deepEqual(barPlayers(cup), bar.field);
  assert.equal(bar.id, "lastcall");
  assert.equal(bar.offset, 140, "the last song's offset");
  assert.equal(bar.frozen, true);
  const out = cup.out[0];
  assert.ok(!cup.entrants[out].bot, "the people never tapped: they went out");
  /* a person out of the Cup grabs, 0.73 s late: inside the window, a Late */
  const t = grabAt(bar, 0);
  const late = applyHit(cup, bar, out, { c:0, r:140 + 730 }, t + 140 + 760);
  assert.deepEqual([late.q, late.d], ["late", 730]);
  /* one a grab */
  assert.equal(applyHit(cup, bar, out, { c:0, r:140 }, t + 140 + 800), null);
  /* past the window is no grab at all */
  const other = cup.out[1];
  assert.equal(applyHit(cup, bar, other, { c:0, r:140 + 1000 + 61 }, t + 140 + 1100), null);
  /* a grab never made is the room's miss at cueTime + offset + window + 250 */
  assert.equal(missAfterOf(chartOf("lastcall")), LAST_CALL.WINDOW + 250);
  const deadline = t + 140 + LAST_CALL.WINDOW + 250;
  assert.equal(deadlineOf(bar, chartOf("lastcall").cues[0]), deadline);
  stepSong(cup, bar, deadline - 1, { driven:i => cup.entrants[i].bot });
  assert.equal(bar.judged[other][0], undefined, "not yet");
  const { events } = stepSong(cup, bar, deadline, { driven:i => cup.entrants[i].bot });
  assert.ok(events.some(event => event.i === other && event.c === 0 && event.q === "miss"));
  /* never a calibration sample, whatever is tapped */
  assert.deepEqual(bar.samples, []);
  assert.equal(bar.offset, 140);
  /* bots always grab */
  play(cup, clock, { until:() => cup.phase !== "lastcall" });
  const record = cup.history[0].lastCall;
  for (const row of record.totals) if (cup.entrants[row.i].bot) assert.ok(Object.values(row.grabs).every(d => Number.isFinite(d)), "bots grab");
  assert.equal(cup.offset, 140, "and the offset is the next song's to start from");
  assert.equal(cup.song.offset, 140);
});

test("Last Call's totals grow as grabs land; who drinks shows once the last grab's deadline has passed; a tie drinks together", () => {
  const cup = cupOf(3, { people:3 });
  const bar = createBar({ cup, round:0, songAt:100_000, players:[2, 0, 1], offset:50 });
  const chart = chartOf("lastcall");
  const grab = (i, c, d) => { bar.judged[i][c] = d === null ? ["miss", null, "p"] : ["ok", d, "p"]; };
  let summary = lastCallOf(bar, 100_000);
  assert.deepEqual(summary.totals.map(row => [row.i, row.ms, row.grabs]), [[2, 0, {}], [0, 0, {}], [1, 0, {}]], "nothing yet: 0, growing from there");
  assert.equal(summary.worst, null);
  grab(2, 0, -40); grab(0, 0, 300); grab(1, 0, null);
  summary = lastCallOf(bar, grabAt(bar, 0) + 2000);
  assert.deepEqual(summary.totals.map(row => row.ms), [40, 300, LAST_CALL.MISS_MS], "a missed grab counts a full second");
  assert.deepEqual(summary.totals[2].grabs, { 0:null });
  grab(2, 1, 20); grab(0, 1, -10); grab(1, 1, 0);
  grab(2, 2, 900); grab(0, 2, -650);
  const last = deadlineOf(bar, chart.cues[2], chart);
  summary = lastCallOf(bar, last - 1);
  assert.deepEqual(summary.totals.map(row => row.ms), [960, 960, LAST_CALL.MISS_MS], "rider 1's third grab not in yet: not counted yet");
  assert.equal(summary.worst, null, "until the last deadline");
  summary = lastCallOf(bar, last);
  /* at the deadline a grab never judged is a miss: rider 1 is 2000 + 0 */
  assert.deepEqual(summary.totals.map(row => row.ms), [960, 960, 2 * LAST_CALL.MISS_MS]);
  assert.deepEqual(summary.worst, [1]);
  assert.equal(summary.totals[2].ms, lastCallTotal({ 0:null, 1:0 }));
  /* a tie on the worst drinks together */
  grab(1, 2, 0);
  bar.judged[1][0] = ["ok", -960, "p"];
  bar.judged[1][1] = ["ok", 0, "p"];
  summary = lastCallOf(bar, last);
  assert.deepEqual(summary.totals.map(row => row.ms), [960, 960, 960]);
  assert.deepEqual(summary.worst, [2, 0, 1], "all tied, all drink");
  assert.deepEqual(summary.worst, lastCallWorst(summary.totals));
});

test("Last Call in the Cup: stand-ins grab for phones gone, me carries each rider's own, who drank stays in the round's history", () => {
  /* the three people: rider 0 plays its phone, 1 and 2 are gone from the start of the cut (stand-ins) */
  let cutAt = Infinity;
  const driven = (i, t) => cup.entrants[i].bot || (i !== 0 && t >= cutAt + GROOVE.STALE_MS);
  const cup = cupOf(7, { people:3 });
  const clock = into(cup);
  play(cup, clock, { driven, until:() => cup.phase === "cut" });
  cutAt = clock.t;
  play(cup, clock, { driven, until:() => cup.phase === "lastcall" });
  const bar = cup.bar;
  /* rider 0 grabs once, 20 ms off */
  const t0 = grabAt(bar, 0) + bar.offset;
  play(cup, clock, { driven, until:() => clock.t >= t0 + 30 });
  applyHit(cup, bar, 0, { c:0, r:bar.offset + 20 }, clock.t);
  const me = meOf(cup, 0, clock.t);
  assert.deepEqual(me.lastCall, { ms:20, grabs:{ 0:20 } });
  assert.deepEqual([me.c, me.q, me.d], [0, "perfect", 20]);
  const outMe = meOf(cup, cup.out[0], clock.t);
  assert.equal(outMe.out, true, "a rider out plays Last Call too");
  assert.ok("lastCall" in outMe);
  assert.deepEqual(lastCallSummary(cup, clock.t).totals.map(row => row.i), bar.field);
  play(cup, clock, { driven, until:() => cup.phase !== "lastcall" });
  assert.equal(cup.phase, "song");
  assert.equal(cup.round, 1);
  assert.equal(lastCallSummary(cup, clock.t), null, "only in its phase");
  const record = cup.history[0].lastCall;
  assert.deepEqual(Object.keys(record).sort(), ["offset", "players", "round", "totals", "worst"]);
  assert.equal(record.round, 0);
  assert.equal(record.players.length, 7);
  assert.ok(record.worst.length >= 1);
  assert.deepEqual(record.worst, lastCallWorst(record.totals));
  /* rider 0's other two grabs were never made: a full second each */
  assert.equal(record.totals.find(row => row.i === 0).ms, 20 + 2 * LAST_CALL.MISS_MS);
  /* the stand-ins grabbed for 1 and 2 */
  for (const i of [1, 2]) {
    const row = record.totals.find(item => item.i === i);
    assert.ok(Object.values(row.grabs).every(d => Number.isFinite(d)), `a stand-in grabbed for ${i}`);
  }
  /* the next song's state is fresh, the bar gone */
  assert.equal(cup.bar, null);
  assert.equal(cup.song.round, 1);
});

test("Last Call follows only cuts with a song after them: never after the final, and 1 to 3 riders still get one each round", () => {
  const cup = cupOf(2);
  const clock = into(cup);
  const { phases } = play(cup, clock, { until:() => cup.phase === "podium" });
  assert.equal(phases.filter(phase => phase === "lastcall").length, 3);
  assert.deepEqual(cup.history.map(item => item.lastCall?.players ?? null).map(players => players && players.length), [2, 2, 2, null]);
});

