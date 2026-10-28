/* What the phone shows, from what the room says (float/GROOVE.md "What the
   room sends", "The screen (TV) and the phone"). Pure: the controller and
   the tests read the same answers.

   The Cup: lobby -> intro -> [song -> cut] x rounds -> podium -> feedback.
   In a song the phone is the pad; its moments come from the clock and the
   chart (chart.js clockAt): the round card in the 3 s lead, the intro,
   practice, play, the drink break, play again, the outro, then the wait
   for the cut. Where the room's frame leaves something out, the frozen
   chart module fills it in: no `chart` is chartOf(song), no `songAt` is
   startAt + SONG_LEAD_MS. */
import { LAST_CALL_ID, SONGS, SONG_LEAD_MS, callsBetween, chartOf, clockAt, drinkSection, feedbackOf, gradeOf, gradeWord, lineAt,
  songForRound } from "../../shared/chart.js";

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
   moment  "card" (the 3 s lead), "intro", "practice", "play", "drink",
           "outro", "after" (the last beat is past; the cut is coming)
   half    "A" or "B" for play (B after the drink break)
   beat, bar, inBar  as clockAt */
export function songView(chart, songAt, now) {
  if (!chart || !Number.isFinite(songAt) || !Number.isFinite(now)) return { moment:"card", half:null, beat:null, bar:null, inBar:null, lead:null };
  if (now < songAt) return { moment:"card", half:null, beat:(now - songAt) / chart.beatMs, bar:null, inBar:null, lead:songAt - now };
  const clock = clockAt(chart, songAt, now);
  if (clock.over || !clock.section) return { moment:"after", half:null, beat:clock.beat, bar:clock.bar, inBar:clock.inBar, lead:0 };
  const drink = drinkSection(chart);
  const half = clock.section === "play" ? (drink && clock.beat >= drink.to ? "B" : "A") : null;
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
  const round = num(room?.round) ?? 0;
  const last = list(room?.history).at(-1);
  /* this round's outs in the order they are revealed: the bottom first */
  const outs = last && num(last.round) === round ? indexes(last.out).slice().reverse() : [];
  const k = outs.indexOf(idx);
  const start = num(room?.startAt);
  const reveal = Number.isFinite(beats?.reveal) ? beats.reveal : CUT_SHOW.reveal, gap = Number.isFinite(beats?.gap) ? beats.gap : CUT_SHOW.gap;
  const at = start === null ? null : start + reveal + (k >= 0 ? k : outs.length) * gap;
  return { grade, word:grade ? gradeWord(grade) : "", line, at, told:at === null || (Number.isFinite(now) && now >= at) };
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
export const CALL_WORDS = Object.freeze({ hey:"Ready", hop:"Ba", spin:"Spin" });
export const ANSWER_HOLD = 0.25;
const PHRASE = 1.5;
export function pendingCalls(chart, beat) {
  if (!chart || !Number.isFinite(beat)) return [];
  const calls = callsBetween(chart, beat - 8, beat + 1e-6);
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

/* does this rider owe a drink (the room's switch and the rider's answer) */
export function drinksOn(room, idx) {
  if (room?.drinking === false) return false;
  const entrant = list(room?.entrants)[idx];
  return entrant?.drinks !== false;
}

/* The drink break on this phone (GROOVE.md "The drink break"): from the
   break's first beat a drinker owes Done until they tap it, and while it is
   owed the pad takes no taps, through the break and after it (the room
   counts their cues as misses until Done). A Done tapped, or one the room
   confirms, opens the pad again: it waits for the beat.
   owes: drinksOn; done: the room's word (me.done, ev done) or a Done this
   phone sent in this song. Returns
     owed    Done is up (big, the only thing on the screen)
     resting the break with nothing owed: "Done" for a drinker who tapped
             it, "Break" for one who doesn't drink
     pad     the pad takes taps */
export function drinkGate({ view, chart, owes, done }) {
  const drink = drinkSection(chart);
  const beat = view?.beat;
  const reached = !!drink && Number.isFinite(beat) && beat >= drink.from && view?.moment !== "card";
  const owed = !!owes && reached && !done;
  const inBreak = view?.moment === "drink";
  return { owed, inBreak, resting:inBreak && !owed, drank:!!owes && !!done, pad:!owed };
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
    /* Last Call: everyone in the Cup at the bar, the riders out too */
    case "lastcall": return member ? "lastcall" : "watch";
    case "podium": return member ? "podium" : "watch";
    case "feedback": return member ? "feedback" : "watch";
    default: return "watch";
  }
}

/* Screen Wake Lock (src/lib/wakeLock.js) from joining to the podium: the
   drink break and the cut are 30 s and more without a touch, past iPhone's
   auto-lock. The feedback card is typed on, and needs none. A phone still
   joining (no phase yet) is awake. */
export const WAKE_PHASES = Object.freeze(["lobby", "intro", "song", "cut", "lastcall", "podium"]);
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
   else the field's scores), and the verdict: Through, Out, or after the
   final the Cup's place.
   { pct, place, of, through, out, final, cupPlace } */
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
  return { pct, place, of, through:!out && !final, out:out && !final, final, cupPlace:final ? finalPlace(room, idx) : null };
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
