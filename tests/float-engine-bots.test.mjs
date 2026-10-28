/* Float's computer riders in the Groove (float/shared/groove.js botDraw,
   botCount, botSkills, botDoneAfter; float/GROOVE.md "What the room sends",
   "Last Call: the countdown"): a sharp bot within about 30 ms, a sloppy one
   about 90 ms with the odd miss, every draw a function of what it is for (so
   a resumed room and a mock draw the same taps), centred on the room's
   offset whatever the TV's delay, never on a demo cue, Done 4 to 14 s into
   the break, a field ordered by skill; at Last Call, counting down in its
   head, a sharp bot within about 150 ms, a sloppy one 800 ms or more off and
   now and then a second out. */
import test from "node:test";
import assert from "node:assert/strict";
import { BOT, COUNT_BOT, GROOVE, botCount, botDoneAfter, botDraw, botSkills, createBar, createSong, rand01, seedOf, stepSong }
  from "../float/shared/groove.js";
import { createCup, makeEntrant, startCup, addBots } from "../float/shared/cup.js";
import { LAST_CALL, chartOf, cueTime, demoCues, lastCallId, playedCues, scoredCues, SONG_MS } from "../float/shared/chart.js";
import { cleanRider } from "../float/shared/protocol.js";
import { CRITTER_IDS } from "../float/shared/looks.js";

const draws = (skill, n = 4000, seed = 11) => Array.from({ length:n }, (_, k) => botDraw(seed, k % 4, k % 13, k, skill));
const median = list => { const s = list.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

test("a sharp bot is within about 30 ms, a sloppy one about 90 ms off with the odd miss; never past the window", () => {
  const sharp = draws(1), sloppy = draws(0), mid = draws(GROOVE.STAND_IN_SKILL);
  const off = list => list.filter(draw => draw.hit).map(draw => Math.abs(draw.dev));
  const missRate = list => list.filter(draw => !draw.hit).length / list.length;
  assert.ok(median(off(sharp)) <= 20, `sharp median ${median(off(sharp))}`);
  assert.ok(off(sharp).filter(d => d <= 30).length / off(sharp).length > 0.85, "most within 30 ms");
  assert.ok(median(off(sloppy)) >= 45 && median(off(sloppy)) <= 95, `sloppy median ${median(off(sloppy))}`);
  assert.ok(missRate(sharp) < 0.01, `sharp misses ${missRate(sharp)}`);
  assert.ok(missRate(sloppy) > 0.03 && missRate(sloppy) < 0.08, `sloppy misses ${missRate(sloppy)}`);
  assert.ok(median(off(mid)) > median(off(sharp)) && median(off(mid)) < median(off(sloppy)), "a stand-in sits between");
  for (const draw of [...sharp, ...sloppy]) {
    if (!draw.hit) { assert.equal(draw.dev, null); continue; }
    assert.ok(Number.isInteger(draw.dev) && Math.abs(draw.dev) <= BOT.MAX_DEV, `${draw.dev}`);
  }
  /* a skill out of range is clamped, junk is middling */
  assert.deepEqual(botDraw(1, 0, 0, 0, 7), botDraw(1, 0, 0, 0, 1));
  assert.ok(botDraw(1, 0, 0, 0, "x").hit !== undefined);
});

test("a draw is a function of the cup's seed, the round, the rider and the cue", () => {
  assert.deepEqual(botDraw(5, 1, 2, 3, 0.7), botDraw(5, 1, 2, 3, 0.7));
  const a = draws(0.7, 200, 5).map(draw => draw.dev), b = draws(0.7, 200, 6).map(draw => draw.dev);
  assert.notDeepEqual(a, b, "another cup, other taps");
  assert.equal(rand01(1, 2, 3), rand01(1, 2, 3));
  assert.notEqual(rand01(1, 2, 3), rand01(1, 2, 4));
  const spread = Array.from({ length:5000 }, (_, k) => rand01(9, k));
  assert.ok(spread.every(u => u >= 0 && u < 1));
  const mean = spread.reduce((sum, u) => sum + u, 0) / spread.length;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `uniform (${mean})`);
  assert.equal(seedOf("abc"), seedOf("abc"));
  assert.notEqual(seedOf("abc"), seedOf("abd"));
});

test("each bot leans its own way a little, the sloppy more", () => {
  const leanOf = (i, skill) => {
    const devs = Array.from({ length:600 }, (_, c) => botDraw(21, 0, i, c, skill)).filter(draw => draw.hit).map(draw => draw.dev);
    return devs.reduce((sum, d) => sum + d, 0) / devs.length;
  };
  const sharp = Array.from({ length:13 }, (_, i) => Math.abs(leanOf(i, 1)));
  const sloppy = Array.from({ length:13 }, (_, i) => Math.abs(leanOf(i, 0)));
  assert.ok(Math.max(...sharp) < 10, `sharp leans ${Math.max(...sharp)}`);
  assert.ok(Math.max(...sloppy) > 12 && Math.max(...sloppy) < BOT.LEAN[0] + 12, `sloppy leans ${Math.max(...sloppy)}`);
});

test("skills spread from 0.2 to 0.95, shuffled by seed; Done 4 to 14 s into the break", () => {
  const skills = botSkills(12, 3);
  assert.equal(skills.length, 12);
  assert.ok(Math.min(...skills) === 0.2 && Math.max(...skills) === 0.95);
  assert.deepEqual(botSkills(12, 3), skills);
  assert.notDeepEqual(botSkills(12, 4), skills);
  assert.deepEqual(botSkills(1, 3), [0.6]);
  assert.deepEqual(botSkills(0, 3), []);
  const done = Array.from({ length:300 }, (_, k) => botDoneAfter(7, k % 4, k));
  assert.ok(done.every(ms => ms >= 4000 && ms <= 14000));
  assert.ok(Math.max(...done) - Math.min(...done) > 8000, "spread across the window");
  assert.equal(botDoneAfter(7, 1, 2), botDoneAfter(7, 1, 2));
});

/* a song of bots alone, stepped the room's way (every 100 ms) */
function botSong({ n = 13, offset = 0, seed = 5 } = {}) {
  const cup = createCup({ id:`bots-${seed}`, seed });
  addBots(cup, n, seed);
  startCup(cup, 0);
  cup.offset = offset;
  const song = createSong({ cup, round:0, songAt:10_000, field:cup.field, base:offset });
  const events = [];
  for (let t = 7000; t <= 10_000 + SONG_MS + 1500; t += 100) events.push(...stepSong(cup, song, t, { driven:() => true }).events);
  return { cup, song, events };
}

test("bots tap at the room's offset: their judgement is their skill alone, whatever the TV's delay", () => {
  const plain = botSong({ offset:0 });
  const delayed = botSong({ offset:180 });
  const qualities = run => run.events.filter(event => event.e === "hit").map(event => `${event.i}:${event.c}:${event.q}:${event.d}`);
  assert.deepEqual(qualities(delayed), qualities(plain), "the same taps judged the same");
  /* and they land when the delayed room hears the cue */
  const chart = chartOf(delayed.song.id);
  const hit = delayed.events.find(event => event.e === "hit" && event.q !== "miss");
  assert.equal(hit.at, cueTime(delayed.song.songAt, chart.cues[hit.c].beat) + 180 + hit.d);
  assert.equal(delayed.song.samples.length, 0, "bots never calibrate");
  assert.equal(delayed.song.offset, 180, "and the offset stays the last song's");
});

test("a field of bots finishes in skill order, near enough: sharp ones near 100, sloppy ones lower", () => {
  const { cup, song } = botSong({ seed:8 });
  const chart = chartOf(song.id);
  const pct = i => {
    let pts = 0;
    for (const cue of scoredCues(chart)) pts += { perfect:100, nice:70, ok:40 }[song.judged[i][cue.id]?.[0]] || 0;
    return pts / scoredCues(chart).length;
  };
  const rows = song.field.map(i => ({ skill:cup.entrants[i].skill, pct:pct(i) })).sort((a, b) => b.skill - a.skill);
  assert.ok(rows[0].pct > 93, `the sharpest ${rows[0].pct}`);
  assert.ok(rows.at(-1).pct < rows[0].pct - 10, `the sloppiest ${rows.at(-1).pct}`);
  /* rank correlation */
  const byPct = rows.slice().sort((a, b) => b.pct - a.pct);
  const rank = row => byPct.indexOf(row);
  const d2 = rows.reduce((sum, row, k) => sum + (rank(row) - k) ** 2, 0);
  const rho = 1 - (6 * d2) / (rows.length * (rows.length ** 2 - 1));
  assert.ok(rho > 0.7, `skill orders the field (rho ${rho.toFixed(2)})`);
  /* every cue of every bot judged once, a hit or the odd miss; never a demo (the host's) */
  for (const i of song.field) {
    assert.equal(Object.keys(song.judged[i]).length, playedCues(chart).length);
    for (const cue of demoCues(chart)) assert.equal(song.judged[i][cue.id], undefined);
  }
});

test("addBots: critter names, the palette, any tube, never the groom's own critter", () => {
  const cup = createCup({ id:"names", seed:2 });
  cup.entrants.push(makeEntrant(cup, cleanRider({ name:"Otter" }), { device:"a" }));
  addBots(cup, 13, 2);
  const bots = cup.entrants.filter(entrant => entrant.bot);
  assert.equal(bots.length, 13);
  assert.ok(!bots.some(entrant => entrant.name === "Otter"), "a name already taken is skipped");
  assert.ok(bots.every(entrant => CRITTER_IDS.includes(entrant.look.critter)));
  assert.ok(bots.some(entrant => /^Bot \d+$/.test(entrant.name)), "past the critters, Bot N");
  assert.equal(new Set(cup.entrants.map(entrant => entrant.color)).size, cup.entrants.length, "distinct colours");
});

test("Last Call: counting in its head, a sharp bot is within about 150 ms, a sloppy one 800 ms or more off and now and then a second out, always inside the window", () => {
  const counts = skill => Array.from({ length:4000 }, (_, k) => botCount(13, k % 3, k % 13, k, skill));
  const off = list => list.map(draw => Math.abs(draw.dev));
  const sharp = counts(1), sloppy = counts(0), stand = counts(GROOVE.STAND_IN_SKILL);
  assert.ok(sharp.every(draw => draw.hit) && sloppy.every(draw => draw.hit), "bots always tap");
  assert.ok(median(off(sharp)) <= 110, `sharp median ${median(off(sharp))}`);
  assert.ok(off(sharp).filter(d => d <= 150).length / sharp.length > 0.7, "mostly within 150 ms");
  assert.ok(median(off(sloppy)) >= 800, `sloppy median ${median(off(sloppy))}`);
  const secondOut = list => list.filter(draw => Math.abs(draw.dev) >= COUNT_BOT.SLIP_MS).length / list.length;
  assert.ok(secondOut(sharp) < 0.05, `sharp a second out ${secondOut(sharp)}`);
  assert.ok(secondOut(sloppy) > 0.3, `sloppy a second out ${secondOut(sloppy)}`);
  assert.ok(median(off(stand)) > median(off(sharp)) && median(off(stand)) < median(off(sloppy)), "a stand-in between");
  for (const draw of [...sharp, ...sloppy]) assert.ok(Number.isInteger(draw.dev) && Math.abs(draw.dev) < LAST_CALL.WINDOW);
  assert.deepEqual(botCount(3, 1, 2, 0, 0.4), botCount(3, 1, 2, 0, 0.4), "a function of what it is for");
  assert.notDeepEqual(botCount(3, 1, 2, 0, 0.4), botDraw(3, 1, 2, 0, 0.4), "its own draw, not a song's tap");
});

test("Last Call with bots alone: one tap each on zero, judged on the room's offset, whichever countdown", () => {
  const cup = createCup({ id:"bar-bots", seed:6 });
  addBots(cup, 9, 6);
  startCup(cup, 0);
  for (const round of [0, 1, 2]) {
    const bar = createBar({ cup, round, songAt:5000, players:cup.field, offset:160 });
    assert.equal(bar.id, lastCallId(round));
    const chart = chartOf(bar.id);
    const events = [];
    for (let t = 2000; t <= 5000 + chart.ms + 1500; t += 100) events.push(...stepSong(cup, bar, t, { driven:() => true }).events);
    assert.equal(events.length, 9, "one tap a bot");
    const zero = bar.songAt + chart.countdown.zeroAt;
    for (const event of events) {
      assert.equal(event.c, 0);
      assert.equal(event.at, zero + 160 + event.d, "tapped on the room's zero plus the bot's count");
    }
    assert.deepEqual(bar.samples, [], "never calibrating");
  }
});
