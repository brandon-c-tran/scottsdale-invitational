/* The Groove: one round's song as the room plays it (float/GROOVE.md
   "Judging", "Rounds, elimination, positions", "What the room sends",
   "Drinking (Oct 28: Brandon's picks)"). Pure: no DOM, no Workers APIs and no clock of its own; every
   function takes `now` (server ms). The room (float/worker/room.js), the
   bench (scripts/float-sim.mjs), the tests and the screen's and phone's
   mocks run a song through these, so they agree to the hit.

   A song is plain JSON (the room saves it inside the Cup every 2 s):
     { v, round, id, songAt, field, base, offset, frozen, samples, calBeat,
       judged:{ [i]:{ [c]:[q, d, by] } }, last:{ [i]:{ c, q, d? } },
       cursor:{ [i]:k } }
   `judged` holds every judgement: q the quality ("miss" the room's call),
   d the judged offset (null for a miss), `by` who played the cue: "p" the
   rider's phone, "b" a bot entrant, "s" a stand-in for a phone gone
   STALE_MS (a miss is by whoever was playing at its deadline).

   The rules, in the order they bite:
   - One judgement a cue a rider. A cue with no hit by its deadline,
     cueTime + offset + MISS_AFTER_MS on the room's clock, is a miss; a hit
     after it, or a second hit on a cue, is ignored. A demo cue (the host
     showing it in practice, cue.demo) is nobody's: never judged, missed,
     tapped by a bot or calibrated on; the room plays playedCues(chart).
   - A phone's hit { c, r } is judged with the room's offset (judgeHit). A
     tap stamped (cueTime + r) more than FUTURE_MS ahead of the room's clock
     is not believed.
   - Bots and stand-ins tap at cueTime + offset + dev, dev drawn from skill
     (botDraw): their d is their skill alone, whatever the TV's delay.
   - The breakdown (bars 14 to 21, where the drink break was) is echo cues:
     scored, tapped by bots and stand-ins, missed, like any played cue.
   - Calibration (the room's, one offset for everyone): people's raw r on
     practice cues are the samples (bots' and stand-ins' never are); the
     offset is recomputed half a beat into each beat of practice, the last
     time half a beat before the first play bar (FREEZE_BEATS), which fixes
     it, so every scored cue is judged on one offset; a practice with fewer
     than CALIBRATION.MIN samples keeps the last song's offset (`base`, 0
     at a Cup's first song).

   Last Call (GROOVE.md "Last Call: the countdown") runs on the same
   machinery: a "bar" is a song's state for chartOf(lastCallId(round))
   (createBar) with everyone in the Cup in its field, frozen from the start
   (it never calibrates: the last song's offset judges it), one cue on the
   countdown's zero and the chart's 3 s window, so no tap is a miss at
   zeroAt + offset + window + 250; bots count in their heads (botCount);
   lastCallOf is the totals and who drinks. */
import { LAST_CALL, LAST_CALL_ID, MISS_AFTER_MS, POINTS, WINDOW, beatOf, calibrate, chartOf, cueTime, judgeHit, lastCallId,
  lastCallTotal, lastCallWorst, playedCues, scoreOf, songForRound } from "./chart.js";

export const GROOVE = Object.freeze({
  /* a phone silent this long is played by a stand-in */
  STALE_MS:5000,
  STAND_IN_SKILL:0.55,
  /* a hit stamped this far ahead of the room's clock is not believed */
  FUTURE_MS:250,
  /* the room's light timer in a song, its scores and its saves */
  TICK_MS:100,
  SCORES_MS:4000,
  SAVE_MS:2000,
  /* a bot in a chug-off finishes its drink this long after the go (to + span) */
  CHUG_FROM_MS:4000,
  CHUG_SPAN_MS:8000,
});
/* the offset is recomputed this far into each beat of practice, and fixed
   this many beats before the first play bar */
export const FREEZE_BEATS = 0.5;

/* How bots tap, by skill (index 0 at skill 0, index 1 at skill 1): SPREAD
   the standard deviation of their offset (ms), LEAN each bot's own early or
   late (up to, ms), MISS the share of cues they never tap. A skill 1 bot is
   within about 30 ms, a skill 0 one about 90 ms off with the odd miss. */
export const BOT = Object.freeze({ SPREAD:Object.freeze([85, 15]), LEAN:Object.freeze([35, 4]),
  MISS:Object.freeze([0.05, 0.004]), MAX_DEV:280 });
/* How bots count down at Last Call, in their heads, by skill as BOT: SPREAD
   the standard deviation (ms), LEAN each bot's own rush or drag (up to, ms),
   SLIP the share of counts a whole number off (SLIP_MS, either way). A sharp
   bot is within about 150 ms, a sloppy one 800 ms or more off and now and
   then a second out. They always tap, inside the window. */
export const COUNT_BOT = Object.freeze({ SPREAD:Object.freeze([1150, 130]), LEAN:Object.freeze([250, 20]),
  SLIP:Object.freeze([0.25, 0.03]), SLIP_MS:1000, MAX_DEV:LAST_CALL.WINDOW - 20 });

/* a cue is the room's miss this long after its time and the offset: the
   chart's window and a late tap's trip (MISS_AFTER_MS for a song, 1250 at
   Last Call) */
export const missAfterOf = chart => (chart?.window || WINDOW.MAX) + (MISS_AFTER_MS - WINDOW.MAX);

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0.6));
const along = (pair, skill) => pair[0] + (pair[1] - pair[0]) * skill;
const tenths = value => Math.round((Number(value) || 0) * 10);

/* ---------------------------------------------------------------- randomness

   Stateless: a draw is a hash of what it is for (the cup's seed, the round,
   the rider, the cue), so a resumed room, the bench and a mock draw the very
   same taps without keeping any generator state. */
const mix = h => {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
};
/* a string's seed (FNV-1a) */
export function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* a number in [0, 1) from integers: the same parts, the same number */
export function rand01(...parts) {
  let h = 0x9e3779b9;
  for (const part of parts) h = mix((h ^ mix((Number(part) | 0) >>> 0)) + 0x6d2b79f5);
  return h / 4294967296;
}
const normal = (u1, u2) => Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);

/* skills for n bots, spread from sloppy (0.2) to sharp (0.95), shuffled by seed */
export function botSkills(n, seed = 1) {
  const skills = [];
  for (let k = 0; k < n; k += 1) skills.push(n === 1 ? 0.6 : 0.2 + 0.75 * k / (n - 1));
  for (let k = skills.length - 1; k > 0; k -= 1) {
    const j = Math.floor(rand01(seed, 0x5c111, k) * (k + 1));
    [skills[k], skills[j]] = [skills[j], skills[k]];
  }
  return skills.map(value => Math.round(value * 100) / 100);
}

/* A bot's (or a stand-in's) tap on cue c: { hit:false, dev:null } when it
   misses, else { hit:true, dev }: ms from the room's beat (its d). */
export function botDraw(seed, round, i, c, skill) {
  const s = clamp01(skill);
  if (rand01(seed, round, i, c, 1) < along(BOT.MISS, s)) return { hit:false, dev:null };
  const lean = (rand01(seed, i, 0x1ea9) * 2 - 1) * along(BOT.LEAN, s);
  const dev = lean + along(BOT.SPREAD, s) * normal(rand01(seed, round, i, c, 2), rand01(seed, round, i, c, 3));
  return { hit:true, dev:Math.round(Math.max(-BOT.MAX_DEV, Math.min(BOT.MAX_DEV, dev))) };
}

/* A bot's (or a stand-in's) tap on Last Call's zero, counted in its head:
   { hit:true, dev } (ms from zero by the room's offset, inside the window). */
export function botCount(seed, round, i, c, skill) {
  const s = clamp01(skill);
  const u = k => rand01(seed, round, i, c, 0xc0de, k);
  let dev = (rand01(seed, i, 0xc0df) * 2 - 1) * along(COUNT_BOT.LEAN, s) + along(COUNT_BOT.SPREAD, s) * normal(u(1), u(2));
  if (u(3) < along(COUNT_BOT.SLIP, s)) dev += u(4) < 0.5 ? -COUNT_BOT.SLIP_MS : COUNT_BOT.SLIP_MS;
  return { hit:true, dev:Math.round(Math.max(-COUNT_BOT.MAX_DEV, Math.min(COUNT_BOT.MAX_DEV, dev))) };
}
/* is this chart a Last Call? (chart.js: lastcall-lights, -slow, -ticks) */
export const isLastCall = chart => typeof chart?.id === "string" && chart.id.startsWith(LAST_CALL_ID);
/* the chart's bot: Last Call's count, else a song's tap */
const drawFor = chart => isLastCall(chart) ? botCount : botDraw;

/* when a bot in a chug-off taps Done: ms after the go (4 to 12 s) */
export const botChugAfter = (seed, round, i) => GROOVE.CHUG_FROM_MS + Math.round(GROOVE.CHUG_SPAN_MS * rand01(seed, round, i, 0xc4c));
/* how a rider is played when no phone plays them: a bot entrant's own skill, or a stand-in's */
export const skillOf = (cup, i) => cup.entrants?.[i]?.bot ? clamp01(cup.entrants[i].skill) : GROOVE.STAND_IN_SKILL;
/* the sum of a rider's earlier songs' percents (one decimal) */
export const cupTotal = (cup, i) => cup.totals?.[i] || 0;
export const addTenths = (a, b) => Math.round(((Number(a) || 0) + (Number(b) || 0)) * 10) / 10;

/* ---------------------------------------------------------------- a song */

/* a fresh song for this round: beat 0 at songAt, the field in its order
   (the last round's ranking, which breaks a last tie), the last song's
   offset to start from */
export function createSong({ cup, round = cup.round, songAt, field = cup.field, base = 0 }) {
  const id = songForRound(round, cup.rounds);
  const song = { v:2, round, id, songAt, field:field.slice(), base, offset:base, frozen:false, samples:[], calBeat:null,
    judged:{}, last:{}, cursor:{} };
  for (const i of song.field) { song.judged[i] = {}; song.cursor[i] = 0; }
  return song;
}

const chartFor = song => chartOf(song.id);
const timeOf = (song, chart, cue) => cueTime(song.songAt, cue.beat, chart.beatMs);
/* when the room calls cue `cue` missed */
export const deadlineOf = (song, cue, chart = chartFor(song)) => timeOf(song, chart, cue) + song.offset + missAfterOf(chart);

function record(song, i, cue, q, d, by) {
  song.judged[i][cue.id] = [q, d, by];
  song.last[i] = d === null ? { c:cue.id, q } : { c:cue.id, q, d };
}

/* A phone's hit on cue c with raw offset r, at the room's `now`. Returns the
   event { e:"hit", i, c, q, d, at } (at: the tap's server time) or null
   when it is ignored: no such rider or cue, a demo, judged already, past
   its miss, stamped from the future, or too far from the cue. A practice
   hit before the offset is fixed is a calibration sample. */
export function applyHit(cup, song, i, { c, r } = {}, now) {
  const judged = song?.judged?.[i];
  if (!judged) return null;
  const chart = chartFor(song);
  const cue = Number.isInteger(c) ? chart.cues[c] : null;
  const raw = Number(r);
  if (!cue || r === null || r === "" || !Number.isFinite(raw) || judged[cue.id]) return null;
  const t = timeOf(song, chart, cue);
  if (now >= t + song.offset + missAfterOf(chart)) return null;
  if (t + raw > now + GROOVE.FUTURE_MS) return null;
  const hit = judgeHit(chart, cue.id, raw, song.offset);
  if (!hit) return null;
  record(song, i, cue, hit.q, hit.d, "p");
  if (!cue.scored && !song.frozen) song.samples.push(Math.round(raw));
  return { e:"hit", i, c:cue.id, q:hit.q, d:hit.d, at:Math.round(t + raw) };
}


/* The calibration's beat: recomputed FREEZE_BEATS into each beat of
   practice (so at most once a beat, and a tap on a beat is in by its
   recompute), the last of them, FREEZE_BEATS before the first play bar,
   fixing it for the song. calBeat is the last beat recomputed. Returns
   whether the offset changed. */
function calibrateStep(song, chart, now) {
  if (song.frozen) return false;
  const practice = chart.sections.find(section => section.kind === "practice");
  if (!practice) return false;
  const beat = beatOf(song.songAt, now, chart.beatMs);
  const k = Math.floor(beat - FREEZE_BEATS);
  if (k < practice.from) return false;
  const last = beat >= practice.to - FREEZE_BEATS;
  if (!last && song.calBeat !== null && k <= song.calBeat) return false;
  song.calBeat = Math.min(k, practice.to - 1);
  if (last) song.frozen = true;
  const next = calibrate(song.samples) ?? (last ? song.base : null);
  if (next === null || next === song.offset) return false;
  song.offset = next;
  return true;
}

/* A rider's cues up to `now`: a bot's or a stand-in's taps as they come
   due (for `driven` riders: bot entrants, the kicked, phones gone), then the
   misses whose deadline has passed. */
function settleRider(cup, song, chart, i, now, driven, events) {
  const judged = song.judged[i];
  const cues = chart.cues;
  let k = song.cursor[i] || 0;
  while (k < cues.length && (cues[k].demo || judged[cues[k].id])) k += 1;
  song.cursor[i] = k;
  const bot = cup.entrants?.[i]?.bot === true;
  const skill = skillOf(cup, i);
  const drawOf = drawFor(chart);
  const early = chart.window || WINDOW.MAX;
  const missAfter = missAfterOf(chart);
  for (let j = k; j < cues.length; j += 1) {
    const cue = cues[j];
    const t = timeOf(song, chart, cue);
    if (t + song.offset - early > now) break;
    if (cue.demo || judged[cue.id]) continue;
    const deadline = t + song.offset + missAfter;
    const draw = drawOf(cup.seed, song.round, i, cue.id, skill);
    const at = t + song.offset + (draw.dev ?? 0);
    if (draw.hit && at <= now && at < deadline && driven(i, at)) {
      const hit = judgeHit(chart, cue.id, song.offset + draw.dev, song.offset);
      record(song, i, cue, hit.q, hit.d, bot ? "b" : "s");
      events.push({ e:"hit", i, c:cue.id, q:hit.q, d:hit.d, at:Math.round(at) });
      continue;
    }
    if (deadline <= now) {
      record(song, i, cue, "miss", null, driven(i, deadline) ? (bot ? "b" : "s") : "p");
      events.push({ e:"hit", i, c:cue.id, q:"miss", at:Math.round(deadline) });
    }
  }
}

/* The song up to `now`: the calibration's beat, then every rider's due
   taps and misses. `driven(i, t)` says whether nobody's phone plays rider i
   at time t. Returns { events (in time order: { e:"hit", i, c, q, d?, at }),
   offset (whether it changed) }. */
export function stepSong(cup, song, now, { driven = () => false } = {}) {
  const chart = chartFor(song);
  const events = [];
  const offset = calibrateStep(song, chart, now);
  for (const i of song.field) settleRider(cup, song, chart, i, now, driven, events);
  events.sort((a, b) => a.at - b.at || a.i - b.i);
  return { events, offset };
}

/* ---------------------------------------------------------------- scores */

/* rider i's judgements as scoreOf reads them: { [cueId]: q } */
export function qualitiesOf(song, i) {
  const out = {};
  for (const [c, item] of Object.entries(song?.judged?.[i] || {})) out[c] = item[0];
  return out;
}

/* rider i's judgements as the chart's after-a-song helpers read them
   (feedbackOf, awardsOf): { [cueId]: { q, d } } (a miss: q "miss", d null) */
export function hitsOf(song, i) {
  const out = {};
  for (const [c, item] of Object.entries(song?.judged?.[i] || {})) out[c] = { q:item[0], d:item[1] };
  return out;
}

/* rider i's counts: scored cues by quality; over every cue judged, how many
   (judged), the phone's own taps among them (phone), and how many a bot or
   stand-in played (bot) */
export function tally(song, i, chart = chartFor(song)) {
  const counts = { perfect:0, nice:0, ok:0, early:0, late:0, miss:0, judged:0, phone:0, bot:0 };
  const judged = song?.judged?.[i] || {};
  for (const cue of chart.cues) {
    const item = judged[cue.id];
    if (!item) continue;
    counts.judged += 1;
    if (item[2] === "p" && item[0] !== "miss") counts.phone += 1;
    if (item[2] === "b" || item[2] === "s") counts.bot += 1;
    if (cue.scored) counts[item[0]] += 1;
  }
  return counts;
}

/* rider i's score so far: { pts, max, pct, live, n } (live: the percent of
   the scored cues judged so far, for the flotilla) */
export function riderScore(song, i, chart = chartFor(song)) {
  const score = scoreOf(chart, qualitiesOf(song, i));
  const live = score.n ? Math.round((score.pts / (score.n * POINTS.perfect)) * 1000) / 10 : 0;
  return { ...score, live };
}

/* the field's scores: [{ i, pts, pct, live, n, cup }] */
export function songScores(cup, song) {
  const chart = chartFor(song);
  return song.field.map(i => {
    const score = riderScore(song, i, chart);
    return { i, pts:score.pts, pct:score.pct, live:score.live, n:score.n, cup:cupTotal(cup, i) };
  });
}

/* ties: the round percent, then the Cup total, then perfects, then the
   field's order (the last round's ranking) */
export const compareRows = (a, b) => b.pct - a.pct || tenths(b.cup) - tenths(a.cup) || b.perfects - a.perfects || a.k - b.k;

/* the field in place order: [{ i, place, pts, pct, perfects, misses, cup }] */
export function rankSong(cup, song) {
  const chart = chartFor(song);
  const rows = song.field.map((i, k) => {
    const score = scoreOf(chart, qualitiesOf(song, i));
    const counts = tally(song, i, chart);
    return { i, k, pts:score.pts, pct:score.pct, perfects:counts.perfect, misses:counts.miss, cup:cupTotal(cup, i) };
  });
  rows.sort(compareRows);
  return rows.map(({ k, ...row }, n) => ({ ...row, place:n + 1 }));
}

/* the song is over: anything still open is a miss (the room has stepped it
   to its end already, so normally nothing is). Returns { ranking, events }. */
export function closeSong(cup, song, { driven = () => false } = {}) {
  const chart = chartFor(song);
  const events = [];
  for (const i of song.field) for (const cue of playedCues(chart)) {
    if (song.judged[i][cue.id]) continue;
    const deadline = deadlineOf(song, cue, chart);
    record(song, i, cue, "miss", null, driven(i, deadline) ? (cup.entrants?.[i]?.bot ? "b" : "s") : "p");
    events.push({ e:"hit", i, c:cue.id, q:"miss", at:Math.round(deadline) });
  }
  return { ranking:rankSong(cup, song), events };
}

/* rider i's round for the stats: the percent, every quality, their own
   taps, how much of it a bot or stand-in played (botShare, 0 to 1) */
export function riderStats(cup, song, i) {
  const chart = chartFor(song);
  const score = scoreOf(chart, qualitiesOf(song, i));
  const counts = tally(song, i, chart);
  return { pct:score.pct, pts:score.pts, perfects:counts.perfect, nice:counts.nice, ok:counts.ok, early:counts.early,
    late:counts.late, misses:counts.miss, hits:counts.phone,
    botShare:counts.judged ? Math.round((counts.bot / counts.judged) * 100) / 100 : 0 };
}

/* ---------------------------------------------------------------- Last Call */

/* Last Call's state, a song's shape: everyone in the Cup at the bar
   (`players`: the field, then the riders out), judged on the last song's
   offset and frozen from the start (it never calibrates); its chart the
   round's countdown (lastCallId: lights, slow, ticks) */
export function createBar({ cup, round = cup.round, songAt, players, offset = cup.offset || 0, id = lastCallId(round) }) {
  const bar = { v:2, round, id, songAt, field:players.slice(), base:offset, offset, frozen:true, samples:[],
    calBeat:null, judged:{}, last:{}, cursor:{} };
  for (const i of bar.field) { bar.judged[i] = {}; bar.cursor[i] = 0; }
  return bar;
}

/* Last Call so far: { totals:[{ i, ms, d }], worst }. d is the rider's tap
   from zero (null until it lands, or for no tap); ms how far off it counts:
   |d|, LAST_CALL.MISS_MS for no tap, 0 before it is judged (it only grows).
   Once the zero's miss deadline has passed every total is lastCallTotal (no
   tap a miss) and `worst` is who drinks: the farthest off, all tied on it,
   among those who may drink (lastCallWorst over them; [] if nobody may).
   Before that `worst` is null. Once over, the ranking (GROOVE.md v3 "Last
   Call: who did best and worst"): each row's `place`, closest to zero
   first (1 is closest; ties share a place, 1, 2, 2, 4), and `order`, every
   rider closest to farthest (ties in the bar's order); before that `place`
   is absent and `order` null. A stand-in's tap excuses its person
   (excusedAtBar): they keep their seat and their total, but never drink for
   a count they didn't make. Bot entrants may drink, so solo QA still names
   someone. */
export function lastCallOf(bar, now = Infinity) {
  const chart = chartOf(bar.id);
  const cues = playedCues(chart);
  const over = now >= deadlineOf(bar, cues[cues.length - 1], chart);
  const totals = bar.field.map(i => {
    const taps = {}, judged = [];
    for (const cue of cues) {
      const item = bar.judged[i]?.[cue.id];
      if (!item) continue;
      taps[cue.id] = item[0] === "miss" ? null : item[1];
      judged.push(cue);
    }
    const d = taps[cues[0].id];
    return { i, ms:lastCallTotal(taps, over ? { cues } : { cues:judged }), d:Number.isFinite(d) ? d : null };
  });
  if (!over) return { totals, worst:null, order:null };
  const excused = new Set(excusedAtBar(bar));
  const ranked = totals.map((row, k) => ({ row, k })).sort((a, b) => a.row.ms - b.row.ms || a.k - b.k);
  ranked.forEach((item, n) => { item.row.place = n && item.row.ms === ranked[n - 1].row.ms ? ranked[n - 1].row.place : n + 1; });
  return { totals, worst:lastCallWorst(totals.filter(row => !excused.has(row.i))), order:ranked.map(item => item.row.i) };
}

/* who a stand-in counted for (its tap, or its miss): excused from drinking */
export const excusedAtBar = bar => bar.field.filter(i => Object.values(bar.judged[i] || {}).some(item => item[2] === "s"));
