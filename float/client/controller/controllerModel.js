/* What the phone shows, from what the room says (float/GROOVE.md "What the
   room sends", "The screen (TV) and the phone"). Pure: the controller and
   the tests read the same answers.

   The Cup: lobby -> intro -> [song -> cut] x rounds -> podium -> feedback.
   In a song the phone is the pad; its moments come from the clock and the
   chart (chart.js clockAt): the round card in the 3 s lead, the intro,
   practice, play, the breakdown (copy the host a bar later), play again,
   the outro, then the wait for the cut. Where the room's frame leaves something out, the frozen
   chart module fills it in: no `chart` is chartOf(song), no `songAt` is
   startAt + SONG_LEAD_MS. */
import { CHUGOFF, LAST_CALL_ID, SONGS, qualityOf, SONG_LEAD_MS, callsBetween, breakdownSection, chartOf, clockAt, cuesBetween, feedbackOf, gradeOf,
  gradeWord, lineAt, songForRound } from "../../shared/chart.js";
/* the whole module too, for what the chart adds later (offsetTone, countTone, dark) without breaking before it lands */
import * as CHART from "../../shared/chart.js";
import { seatsFor, seatWords } from "../../shared/seats.js";

const num = value => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export const indexOf = value => Number.isInteger(value) ? value : value && typeof value === "object" && Number.isInteger(Number(value.i)) ? Number(value.i) : null;
export const indexes = items => (Array.isArray(items) ? items : []).map(indexOf).filter(i => i !== null);
const list = value => Array.isArray(value) ? value : [];

export function ordinal(n) {
  const v = Math.abs(Math.trunc(Number(n)));
  if (!Number.isFinite(v) || v < 1) return "";
  const tens = v % 100, ones = v % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${v}${suffix}`;
}

/* this phone's entrant: its device in the room's entrants (indexes shift in
   the lobby, and a Field Day claim moves the entrant to the newest device).
   Only before the first room message does the welcome's index stand in. */
export function findMe({ room, device, welcome = null } = {}) {
  if (Array.isArray(room?.entrants)) return device ? room.entrants.findIndex(e => e && e.device === device) : -1;
  const said = num(welcome?.entrant);
  return Number.isInteger(said) && said >= 0 ? said : -1;
}

/* the Cup is over: the final has been played (its cut, the podium, the card) */
export const cupDone = room => indexes(room?.final).length > 0 || indexes(room?.podium).length > 0;

/* ---- the song ---- */

/* the song's beat 0 on the room's clock */
export function songAtOf(room) {
  const said = num(room?.songAt);
  if (said !== null) return said;
  const start = num(room?.startAt);
  /* a song and Last Call both go up their lead (3 s) before beat 0 */
  return (room?.phase === "song" || room?.phase === "lastcall") && start !== null ? start + SONG_LEAD_MS : null;
}
/* the song a taken set, a Done and a popup belong to */
export function songKeyOf(room) {
  const at = songAtOf(room);
  return at === null ? null : `${room?.cupId || ""}:${num(room?.round) ?? 0}:${at}`;
}
/* the chart: the room's own, else the one kept for its chartId, else the frozen module's for its song */
export function chartFor(room, kept = null) {
  if (room?.chart && typeof room.chart === "object" && Array.isArray(room.chart.cues)) return room.chart;
  const id = room?.chartId || room?.song || null;
  if (kept && Array.isArray(kept.cues) && (!id || kept.id === id)) return kept;
  return id ? chartOf(id) : null;
}
export const songName = id => String(id || "").startsWith(LAST_CALL_ID) ? "Last Call" : SONGS.find(song => song.id === id)?.name || "";
/* the room's one calibration offset, ms */
export const offsetOf = room => num(room?.offset) ?? 0;

/* Where the song is at server time `now`:
   moment  "card" (the 3 s lead), "intro", "practice", "play", "breakdown",
           "outro", "after" (the last beat is past; the cut is coming)
   half    "A" or "B" for play (B after the breakdown)
   beat, bar, inBar  as clockAt */
export function songView(chart, songAt, now) {
  if (!chart || !Number.isFinite(songAt) || !Number.isFinite(now)) return { moment:"card", half:null, beat:null, bar:null, inBar:null, lead:null };
  if (now < songAt) return { moment:"card", half:null, beat:(now - songAt) / chart.beatMs, bar:null, inBar:null, lead:songAt - now };
  const clock = clockAt(chart, songAt, now);
  if (clock.over || !clock.section) return { moment:"after", half:null, beat:clock.beat, bar:clock.bar, inBar:clock.inBar, lead:0 };
  const breakdown = breakdownSection(chart);
  const half = clock.section === "play" ? (breakdown && clock.beat >= breakdown.to ? "B" : "A") : null;
  return { moment:clock.section, half, beat:clock.beat, bar:clock.bar, inBar:clock.inBar, lead:0 };
}

/* ---- Last Call: the countdown (GROOVE.md "Last Call: the countdown") ----

   The phone never shows the count: the TV is where you watch it. Its
   moments, in ms from the bar's songAt (chart.countdown): "intro" (the
   title; the first Last Call says what it is), "count" (Tap on zero, one
   big pad, then Locked), "reveal" (your offset, big), "verdict" (You drink
   or Safe, at the later of verdictAt and the room's word on who drinks). */
export const LAST_CALL_LINE = "The bar closes at zero. Tap on zero. Farthest off drinks.";
export function countdownView({ room, idx, chart, songAt, now, judged = {}, tap = null }) {
  const cd = chart?.countdown || null;
  const t = Number.isFinite(songAt) && Number.isFinite(now) ? now - songAt : null;
  const moment = !cd || t === null ? "intro" : t < cd.introMs ? "intro" : t < cd.revealAt ? "count" : t < cd.verdictAt ? "reveal" : "verdict";
  const cue = chart?.cues?.[0] || null;
  /* your tap: the room's word on it, else this phone's own call */
  const said = cue ? judged[cue.id] : null;
  const mine = said?.q ? { q:said.q, d:said.q === "miss" ? null : num(said.d) } : tap?.q ? { q:tap.q, d:num(tap.d) } : null;
  const shown = moment === "reveal" || moment === "verdict" ? mine || { q:"miss", d:null } : null;
  const worst = moment === "verdict" && Array.isArray(room?.lastCall?.worst) ? indexes(room.lastCall.worst) : null;
  return { moment, first:!!cd?.first, locked:!!mine, offset:shown, drinks:worst === null ? null : worst.includes(idx) };
}

/* the room's word on this rider's Last Call tap, from what the phone holds
   (`game`: useRoom's state): its ev hit on cue 0, else me.lastCall { ms, d },
   which comes at once and is held until the reveal (countdownView) */
export function lastCallJudged(game, songKey) {
  const judged = game?.memory?.song === songKey ? game.memory.judged || {} : {};
  if (judged[0]) return judged;
  const said = game?.me?.lastCall;
  const d = said && typeof said === "object" ? num(said.d) : null;
  if (d === null) return judged;
  return { ...judged, 0:{ q:game.me.c === 0 && typeof game.me.q === "string" ? game.me.q : qualityOf(d), d } };
}

/* ---- practice, narrated (GROOVE.md "Practice, narrated") ---- */

/* the narration at beat b: the practice's text box (chart.js lineAt), its text or null */
export const narrationAt = (chart, beat) => Number.isFinite(beat) ? lineAt(chart, beat)?.text || null : null;
/* the host showing a cue (demo:true) at beat b: from its call until half a
   beat past it; nobody taps it, the phone says "Watch" and acts it out */
export function demoAt(chart, beat) {
  if (!chart || !Number.isFinite(beat)) return null;
  for (const cue of chart.cues || []) {
    if (!cue.demo) continue;
    const from = Number.isFinite(cue.call) ? cue.call : cue.beat - 1;
    if (beat >= from && beat < cue.beat + 0.5) return cue;
  }
  return null;
}

/* ---- after a song (GROOVE.md "After a song") ---- */

/* the cut's beats on this phone (the sound's CUT_BEATS: Out on your turn in
   the outs, Through after the last, ms from the cut's start) */
export const CUT_SHOW = Object.freeze({ reveal:2500, gap:500 });
/* Your grade and the judge's line (the room's `me.feedback`, else the
   room's grade on your result, else judged here from the room's word on
   your cues), and when Through or Out is told: on your turn in the outs,
   revealed one by one from the bottom, or after the last for Through.
   { grade, word, line, at, told } */
export function cutShow({ room, me = null, idx, chart, judged = {}, now, beats = CUT_SHOW }) {
  const own = me?.feedback && typeof me.feedback === "object" ? me.feedback : null;
  const result = list(room?.results).find(item => indexOf(item) === idx) || null;
  const judgedHere = chart ? feedbackOf(chart, judged) : null;
  const grade = own?.grade || result?.grade || (Number.isFinite(num(me?.pct)) ? gradeOf(num(me.pct)) : judgedHere?.grade) || null;
  const line = typeof own?.line === "string" ? own.line : judgedHere?.line || "";
  const reveal = Number.isFinite(beats?.reveal) ? beats.reveal : CUT_SHOW.reveal, gap = Number.isFinite(beats?.gap) ? beats.gap : CUT_SHOW.gap;
  /* the room's show: each rider out on their own beat (server ms), Through after the last */
  const show = room?.show && typeof room.show === "object" && Array.isArray(room.show.outs) ? room.show : null;
  let at = null;
  if (show) {
    const outs = show.outs.map(o => ({ i:indexOf(o), at:num(o?.at) })).filter(o => o.i !== null && o.at !== null);
    const mine = outs.find(o => o.i === idx);
    at = mine ? mine.at : outs.length ? Math.max(...outs.map(o => o.at)) + gap : num(show.line) ?? num(show.grades);
  } else {
    const round = num(room?.round) ?? 0;
    const last = list(room?.history).at(-1);
    /* this round's outs in the order they are revealed: the bottom first */
    const outs = last && num(last.round) === round ? indexes(last.out).slice().reverse() : [];
    const k = outs.indexOf(idx);
    const start = num(room?.startAt);
    at = start === null ? null : start + reveal + (k >= 0 ? k : outs.length) * gap;
  }
  return { grade, word:grade ? gradeWord(grade) : "", line, at, told:at === null || (Number.isFinite(now) && now >= at) };
}

/* ---- who's ahead (GROOVE.md "Who's ahead") ----

   Your place in the song so far and the field ("4th of 13"), and "Safe"
   or "Below the cut", from the room's `me` (place, of, cut), in play only:
   nothing in the card, the intro or practice (nobody scores), and the
   final has no cut, so its place stands alone. null when there is nothing
   to show. { place, of, text, status, safe } */
export const RANK_MOMENTS = Object.freeze(["play", "breakdown", "outro", "after"]);
export function rankView({ me = null, view = null, shape = null } = {}) {
  if (!RANK_MOMENTS.includes(view?.moment)) return null;
  const place = num(me?.place);
  if (place === null || place < 1) return null;
  const of = num(me?.of);
  const final = me?.lastRound === true || !!shape?.final;
  const cut = final ? null : num(me?.cut);
  const text = final || of === null ? ordinal(place) : `${ordinal(place)} of ${of}`;
  /* everyone goes through: no line to be below */
  const line = cut !== null && (of === null || cut < of);
  const safe = line ? place <= cut : null;
  return { place, of, text, status:line ? (safe ? "Safe" : "Below the cut") : null, safe };
}

/* ---- the chug-off (GROOVE.md "The chug-off") ----

   The last rider through against the first rider out, after a song: the
   first to finish a drink keeps the spot. room.chugoff { a, b, goAt,
   doneAt:{ [i]: ms after goAt }, winner, by }. moment "intro" (the call,
   the names, 3 2 1, until goAt), "go" (Done is live for the two), "told"
   (the winner is in). sent: a Done this phone sent in this chug-off.
   why: how it was decided, one plain line (by "chug", "score", "forfeit").
   { moment, a, b, names, contender, first, done, winner, kept, goAt, by, why } */
export const CHUGOFF_LINE = "Last one in against first one out. First to finish keeps the spot.";
export function chugoffView({ room, idx, now, sent = false }) {
  const c = room?.chugoff && typeof room.chugoff === "object" ? room.chugoff : {};
  const a = indexOf(c.a), b = indexOf(c.b);
  const entrants = list(room?.entrants);
  const nameOf = i => (i === null ? "" : entrants[i]?.name || "");
  const start = num(room?.startAt);
  const goAt = num(c.goAt) ?? (start === null ? null : start + CHUGOFF.INTRO_MS);
  const winner = indexOf(c.winner);
  const contender = idx >= 0 && (idx === a || idx === b);
  const doneAt = c.doneAt && typeof c.doneAt === "object" ? c.doneAt : {};
  const done = contender && (sent || num(doneAt[idx]) !== null);
  const moment = winner !== null ? "told" : goAt === null || !Number.isFinite(now) || now < goAt ? "intro" : "go";
  /* the Cup's first chug-off says what it is: the room's word, else the first round's */
  const first = typeof c.first === "boolean" ? c.first : (num(room?.round) ?? 0) === 0;
  const by = c.by || null;
  const loser = winner === null ? null : winner === a ? b : a;
  const why = winner === null ? "" : by === "score" ? "Nobody finished. The better score keeps the spot."
    : by === "forfeit" ? (loser === idx ? "Your phone dropped" : `${nameOf(loser)}'s phone dropped`)
    : winner === idx ? "You finished first" : `${nameOf(winner)} finished first`;
  return { moment, a, b, names:[nameOf(a), nameOf(b)], contender, first, done, winner,
    kept:winner === null || !contender ? null : winner === idx, goAt, by, why };
}

/* the count to Chug!: 3, 2, 1 over the intro's last three seconds, then "Chug!" for 900 ms */
export function chugCount(goAt, now) {
  if (!Number.isFinite(goAt) || !Number.isFinite(now)) return null;
  const left = goAt - now;
  if (left > 3000) return null;
  if (left > 0) return String(Math.ceil(left / 1000));
  return left > -900 ? "Chug!" : null;
}

/* the song a round plays, by name: the room's, else the frozen order */
export function roundSong(room) {
  const id = room?.song || room?.chartId || songForRound(num(room?.round) ?? 0, num(room?.rounds) ?? 0);
  return { id, name:songName(id) };
}

/* The host's call as a bubble (GROOVE.md "Answer the host"): each call's
   word from its own beat (callsBetween), held while its answer is still to
   come and a quarter beat past it; the calls of one phrase stay together,
   the answered ones marked, until the last is answered. A drop's call is a
   countdown: 3, 2, 1 on its three beats. A paddle has no call (the pulse
   is the call). [{ key, word, at, kind, c, answered }] */
export const CALL_WORDS = Object.freeze({ hey:"Ready", hop:"Ba", spin:"Spin", echo:"♪", rocket:"Launch" });
/* a blackout bar (chart.dark, v3 wave B): the host and the band drop out,
   no calls show; you keep the pattern in your head and the pad still judges */
export const darkAt = (chart, beat) => Number.isFinite(beat) && Array.isArray(chart?.dark) && chart.dark.includes(Math.floor(beat / 4));
export const ANSWER_HOLD = 0.25;
const PHRASE = 1.5;
export function pendingCalls(chart, beat) {
  if (!chart || !Number.isFinite(beat)) return [];
  if (darkAt(chart, beat)) return [];
  const calls = callsBetween(chart, beat - 8, beat + 1e-6).filter(cue => !darkAt(chart, cue.call));
  const pending = calls.filter(cue => cue.beat + ANSWER_HOLD > beat);
  if (!pending.length) return [];
  const first = Math.min(...pending.map(cue => cue.call));
  const words = [];
  for (const cue of calls) {
    if (cue.call < first - PHRASE || cue.beat + ANSWER_HOLD + PHRASE <= beat) continue;
    const answered = cue.beat + ANSWER_HOLD <= beat;
    if (cue.kind === "drop") {
      for (let k = 0; k < 3; k++) if (cue.call + k <= beat + 1e-6) words.push({ key:`${cue.id}.${k}`, word:String(3 - k), at:cue.call + k, kind:"drop", c:cue.id, answered });
    } else words.push({ key:String(cue.id), word:CALL_WORDS[cue.kind] || "", at:cue.call, kind:cue.kind, c:cue.id, answered });
  }
  return words.sort((a, b) => a.at - b.at);
}

/* does this rider drink (the room's switch and the rider's answer) */
export function drinksOn(room, idx) {
  if (room?.drinking === false) return false;
  const entrant = list(room?.entrants)[idx];
  return entrant?.drinks !== false;
}

/* ---- who this phone is in the Cup ---- */

/* this rider played the song the room is on or has just finished: in its
   scores (the field this song), else its field, else out this round by
   the phone's own memory */
export function inSong(room, idx, memory = {}) {
  if (idx < 0) return false;
  const scores = indexes(room?.scores);
  if (scores.length) return scores.includes(idx);
  if (indexes(room?.field).includes(idx)) return true;
  return num(memory.outRound) !== null && num(memory.outRound) === (num(room?.round) ?? 0);
}

/* the screen for this phone:
   connecting, lobby, intro, song (the pad), crowd (out: cheer from the
   bank), cut (your percent and place, Through or Out), podium, feedback,
   watch (not in this Cup) */
export function screenOf({ room, idx, memory = {} }) {
  const phase = room?.phase;
  if (!room || !phase) return "connecting";
  const member = idx >= 0;
  const out = member && indexes(room.out).includes(idx);
  const field = indexes(room.field);
  const playing = member && !out && (field.includes(idx) || !field.length);
  switch (phase) {
    case "lobby": return "lobby";
    case "intro": return playing ? "intro" : out ? "crowd" : "watch";
    case "song": return playing ? "song" : out ? "crowd" : "watch";
    case "cut":
      if (!member) return "watch";
      if (inSong(room, idx, memory)) return "cut";
      return out ? "crowd" : "watch";
    /* the chug-off and Last Call: everyone in the Cup, the riders out too */
    case "chugoff": return member ? "chugoff" : "watch";
    case "lastcall": return member ? "lastcall" : "watch";
    case "podium": return member ? "podium" : "watch";
    case "feedback": return member ? "feedback" : "watch";
    default: return "watch";
  }
}

/* Screen Wake Lock (src/lib/wakeLock.js) from joining to the podium: the
   cut, the chug-off and Last Call are 15 s and more without a touch, and a
   Cup is long enough for iPhone's auto-lock. The feedback card is typed on, and needs none. A phone still
   joining (no phase yet) is awake. */
export const WAKE_PHASES = Object.freeze(["lobby", "intro", "song", "cut", "chugoff", "lastcall", "podium"]);
export const wakeFor = phase => !phase || WAKE_PHASES.includes(phase);

/* how many play this round, how many go through, whether it is the final */
export function roundShape(room) {
  const field = indexes(room?.field);
  const of = field.length || list(room?.entrants).length;
  const round = num(room?.round) ?? 0, rounds = num(room?.rounds) ?? 0;
  const final = room?.lastRound === true || (rounds > 0 && round >= rounds - 1);
  const cut = num(room?.cut);
  return { round, rounds, of, final, through:final || cut === null || cut >= of ? null : cut };
}

/* the field's percents in place order: highest first, a tie to the higher Cup total */
export function placeOrder(scores) {
  return list(scores).filter(s => indexOf(s) !== null)
    .map(s => ({ i:indexOf(s), pct:num(s.pct) ?? 0, cup:num(s.cup) ?? 0 }))
    .sort((a, b) => b.pct - a.pct || b.cup - a.cup || a.i - b.i);
}

/* This rider's place in the Cup once it is over (or so far). */
export function finalPlace(room, idx) {
  if (!room || idx < 0) return null;
  const final = indexes(room.final);
  if (final.includes(idx)) return final.indexOf(idx) + 1;
  const standings = list(room.standings);
  for (let k = 0; k < standings.length; k++) {
    const entry = standings[k];
    if (entry === idx) return k + 1;
    if (entry && typeof entry === "object" && indexOf(entry) === idx) return num(entry.place) ?? k + 1;
  }
  const podium = indexes(room.podium);
  if (podium.includes(idx)) return podium.indexOf(idx) + 1;
  const out = indexes(room.out);
  const at = out.indexOf(idx);
  if (at >= 0) return Math.max(podium.length, 3) + (out.length - at);
  return null;
}

/* The cut on this phone: the song's percent and place (the room's `me`,
   else the field's scores), and the verdict: Through, Out, on the bubble
   (the chug-off decides), or after the final the Cup's place.
   { pct, place, of, through, out, bubble, final, cupPlace } */
export function cutView({ room, me = null, idx }) {
  const order = placeOrder(room?.scores);
  const at = order.findIndex(s => s.i === idx);
  const mine = at >= 0 ? order[at] : null;
  const pct = num(me?.pct) ?? mine?.pct ?? null;
  const place = num(me?.place) ?? (at >= 0 ? at + 1 : null);
  const of = num(me?.of) ?? (order.length || null);
  /* the room's `me` says through or out in the cut; else its out list */
  const out = me?.out === true ? true : me?.through === true ? false : indexes(room?.out).includes(idx);
  const final = room?.lastRound === true || cupDone(room);
  /* on the bubble: the chug-off decides (the room's me.bubble, its show's pair, or the result row's mark) */
  const row = list(room?.results).find(item => indexOf(item) === idx);
  const bubble = !final && !out && me?.through !== true
    && (me?.bubble === true || row?.bubble === true || indexes(room?.show?.bubble).includes(idx));
  return { pct, place, of, through:!out && !final && !bubble, out:out && !final, bubble, final, cupPlace:final ? finalPlace(room, idx) : null };
}

/* a percent as the phone letters it: whole, or one decimal under 100 when it has one */
export function pctText(pct) {
  if (!Number.isFinite(pct)) return "";
  const v = Math.max(0, Math.min(100, pct));
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/* ---- what the room has said about this rider, kept for the song ---- */

/* the room's verdicts on this rider's cues this song (ev hit, me), Done,
   and the round they went out in. A new song starts the song's part over;
   a new Cup starts it all over. */
export function foldMine(memory, msg, { idx, songKey, round } = {}) {
  const m = memory || {};
  const song = songKey && m.song !== songKey ? { song:songKey, judged:{}, done:false } : { song:m.song ?? songKey ?? null,
    judged:m.judged || {}, done:!!m.done };
  const next = { ...m, ...song };
  if (!msg) return next;
  if (msg.t === "ev" && num(msg.i) === idx) {
    if (msg.e === "hit" && Number.isInteger(msg.c) && typeof msg.q === "string") next.judged = { ...next.judged, [msg.c]:{ q:msg.q, d:num(msg.d) } };
    if (msg.e === "done") next.done = true;
    if (msg.e === "out" && next.outRound == null) next.outRound = num(round) ?? 0;
  }
  if (msg.t === "me") {
    if (msg.done === true) next.done = true;
    if (Number.isInteger(msg.c) && typeof msg.q === "string") next.judged = { ...next.judged, [msg.c]:{ q:msg.q, d:num(msg.d) } };
  }
  return next;
}

/* ---- v3: who you are, the practice counter, the tone scale (GROOVE.md "v3") ---- */

/* Your fixed seat in the flotilla (float/shared/seats.js): the field as
   rows, FRONT row first (row 0; drawn at the bottom, as on the TV), left to
   right, your seat marked, and its words ("Front row, 3rd from the left").
   null when you are not in the field or there is no field yet.
   { rows:[[{ i, me, color }]], seat, words } */
export function seatView({ room, idx }) {
  const field = indexes(room?.field);
  if (idx < 0 || !field.includes(idx)) return null;
  const seats = seatsFor(field);
  const seat = seats.get(idx) || null;
  if (!seat) return null;
  const entrants = list(room?.entrants);
  const rows = Array.from({ length:seat.rows }, () => []);
  for (const [i, s] of seats) rows[s.row][s.col] = { i, me:i === idx, color:entrants[i]?.color || null };
  return { rows, seat, words:seatWords(seat) };
}

/* Practice's four-beat counter (GROOVE.md v3 "Paddle Party teaches both at
   once"): the bar the song is in, the beats with a tap lit (from the
   chart's cues in that bar: 1 to 4, an "and" lights the beat it follows),
   and the beat now. Practice only (null elsewhere). A demo bar (the host
   shows it) lights its beats as the host's: `demo`.
   { bar, now, beats:[{ n, on, kinds, and, demo, row, move, word }] } */
export const COUNTER_WORDS = Object.freeze({ paddle:"Row", hey:"Hey!", hop:"Hop", spin:"Spin", drop:"Drop", rocket:"Launch" });
export function beatCounter(chart, view) {
  if (!chart || view?.moment !== "practice" || !Number.isFinite(view.beat)) return null;
  const perBar = 4;
  const bar = Math.floor(view.beat / perBar), from = bar * perBar;
  const beats = Array.from({ length:perBar }, (_, k) => ({ n:k + 1, on:false, kinds:[], and:false, demo:false }));
  for (const cue of cuesBetween(chart, from, from + perBar)) {
    if (cue.scored) continue;
    const at = cue.beat - from, k = Math.floor(at + 1e-6);
    const slot = beats[k];
    if (!slot) continue;
    slot.on = true;
    if (at - k > 0.25) slot.and = true;
    if (cue.demo) slot.demo = true;
    if (!slot.kinds.includes(cue.kind)) slot.kinds.push(cue.kind);
  }
  /* two marks, told apart at a glance (v3 "Row in every song"): a stroke
     (`row`) and the song's own move (`move`, its word); a beat with both
     says the move */
  for (const slot of beats) {
    slot.row = slot.kinds.includes("paddle");
    slot.move = slot.kinds.find(kind => kind !== "paddle") || null;
    slot.word = slot.kinds.filter(kind => kind !== "paddle").concat(slot.kinds).map(kind => COUNTER_WORDS[kind]).find(Boolean) || "";
  }
  return { bar, now:Math.max(0, Math.min(perBar - 1, Math.floor(view.beat - from))), beats };
}

/* The number's colour by how close (GROOVE.md v3 "Numbers in more colours
   than red"): the chart's own scale once it has one, else the contract's.
   songs: <= 50 gold, <= 100 green, <= 160 yellow, above red; a miss grey.
   Last Call: <= 100 green, <= 300 yellow, <= 700 orange, above red. */
const localOffsetTone = absMs => !Number.isFinite(absMs) ? "grey" : absMs <= 50 ? "gold" : absMs <= 100 ? "green" : absMs <= 160 ? "yellow" : "red";
const localCountTone = absMs => !Number.isFinite(absMs) ? "grey" : absMs <= 100 ? "green" : absMs <= 300 ? "yellow" : absMs <= 700 ? "orange" : "red";
export const OFFSET_TONES = Object.freeze(["gold", "green", "yellow", "orange", "red", "grey"]);
export function numberTone(q, d, { count = false } = {}) {
  if (q === "miss" || !Number.isFinite(Number(d)) || d === null) return "grey";
  const abs = Math.abs(Number(d));
  const fn = count ? (typeof CHART.countTone === "function" ? CHART.countTone : localCountTone)
    : (typeof CHART.offsetTone === "function" ? CHART.offsetTone : localOffsetTone);
  const tone = fn(abs);
  return OFFSET_TONES.includes(tone) ? tone : count ? localCountTone(abs) : localOffsetTone(abs);
}
export const contractTones = { offset:localOffsetTone, count:localCountTone };

/* Last Call's ranking on this phone (GROOVE.md v3 "Last Call: who did best
   and worst"): your place among everyone at the bar, closest to zero first,
   ties sharing a place ("3rd closest of 9"). The room's word (me.lastCall
   place/of) when it gives one, else from room.lastCall.totals ({ i, ms }:
   ms how far off, a no-tap 3000). null until there is something to rank. */
export function lastCallPlace({ room, me = null, idx }) {
  const said = me?.lastCall && typeof me.lastCall === "object" ? me.lastCall : null;
  const sp = num(said?.place), so = num(said?.of);
  if (sp !== null && so !== null && sp >= 1) return { place:sp, of:so, text:placeWords(sp, so) };
  const totals = list(room?.lastCall?.totals).map(row => ({ i:indexOf(row), ms:num(row?.ms) })).filter(row => row.i !== null && row.ms !== null);
  const mine = totals.find(row => row.i === idx);
  if (!mine || totals.length < 2) return null;
  const place = 1 + totals.filter(row => row.ms < mine.ms).length;
  return { place, of:totals.length, text:placeWords(place, totals.length) };
}
/* "Closest of 9", "3rd closest of 9", "Farthest of 9" (alone at the far end) */
const placeWords = (place, of) => place === 1 ? `Closest of ${of}` : place === of ? `Farthest of ${of}` : `${ordinal(place)} closest of ${of}`;
