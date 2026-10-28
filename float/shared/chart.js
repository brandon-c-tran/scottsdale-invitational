/* Float's songs and charts (float/GROOVE.md "Songs and charts", "Judging").
   Pure: shared by the room (the truth), the screen, the phone, the sound and
   the tests, so a tap is called the same thing everywhere.

   A song is 32 bars at 120 bpm (BEAT_MS 500, a bar 2 s, 64 s):
     intro 2 . practice 4 . play 8 . drink 8 . play 8 . outro 2
   Beats count from the song's beat 0 (songAt, server time) and may be
   fractional (an "and" is k + 0.5). A cue is one tap:
     { id, beat, kind, call, scored }
   id is its index in the chart (ascending by beat); kind is what the tap is
   (CUE_KINDS); call is the beat the host calls it (beat - its lead), or null
   when the pulse itself is the call (a paddle); scored is false in practice
   (judged and shown, never scored).

   Every call is the answer's own rhythm, a fixed lead earlier ("answer the
   host"): Paddle Party paddles on 1 and 3 and answers "Ready" with "Hey!" two
   beats later; Rock Hop echoes the host's "ba" two beats later; Spin Cycle
   echoes the host's spin one beat later, on the backbeat; The Drop mixes all
   three and ends on one tap after a three-beat countdown.

   Offsets: a tap's raw offset r is its server time minus the cue's time. The
   room keeps one calibration offset for everyone (the median of the people's
   practice taps; the TV's sound delay is the room's, not a player's), and a
   tap is judged on d = r - offset. */
import { BEAT_MS } from "./beat.js";

export const BPM = 60000 / BEAT_MS;
export const BEATS_PER_BAR = 4;
export const BAR_MS = BEAT_MS * BEATS_PER_BAR;

/* the song's sections, in order */
export const SONG_SHAPE = Object.freeze([
  Object.freeze({ kind:"intro", bars:2 }),
  Object.freeze({ kind:"practice", bars:4 }),
  Object.freeze({ kind:"play", bars:8 }),
  Object.freeze({ kind:"drink", bars:8 }),
  Object.freeze({ kind:"play", bars:8 }),
  Object.freeze({ kind:"outro", bars:2 }),
]);
export const SECTION_KINDS = Object.freeze(["intro", "practice", "play", "drink", "outro"]);
export const SONG_BARS = SONG_SHAPE.reduce((sum, section) => sum + section.bars, 0);
export const SONG_BEATS = SONG_BARS * BEATS_PER_BAR;
export const SONG_MS = SONG_BEATS * BEAT_MS;
/* the room puts a song up this long before its beat 0 (the round card) */
export const SONG_LEAD_MS = 3000;
/* and keeps it this long after the last beat (the last cue's miss lands) */
export const SONG_TAIL_MS = 1500;

/* the judgement windows, |d| in ms */
export const WINDOW = Object.freeze({ PERFECT:50, NICE:100, OK:160, MAX:300, SLACK:60 });
export const QUALITIES = Object.freeze(["perfect", "nice", "ok", "early", "late", "miss"]);
export const POINTS = Object.freeze({ perfect:100, nice:70, ok:40, early:0, late:0, miss:0 });
/* the words over a critter, and the tone each is lettered in (GROOVE.md "The look") */
export const WORDS = Object.freeze({ perfect:"Perfect", nice:"Nice!", ok:"OK", early:"Early", late:"Late", miss:"Miss" });
export const TONES = Object.freeze({ perfect:"gold", nice:"yellow", ok:"white", early:"salmon", late:"salmon", miss:"grey" });
/* the room calls a cue missed this long after its time (the window, plus a late tap's trip) */
export const MISS_AFTER_MS = WINDOW.MAX + 250;
/* the popup over a critter */
export const POPUP_MS = 700;

/* calibration (the room's): a practice tap within RANGE of its cue is a
   sample; the median of at least MIN, clamped, is the offset */
export const CALIBRATION = Object.freeze({ RANGE:350, CLAMP:250, MIN:4 });

/* what a tap is, the beats its call leads it by, and the word for it */
export const CUE_KINDS = Object.freeze({
  paddle:Object.freeze({ lead:null, mode:"paddle", word:"Paddle" }),
  hey:Object.freeze({ lead:2, mode:"paddle", word:"Hey!" }),
  hop:Object.freeze({ lead:2, mode:"rock", word:"Hop" }),
  spin:Object.freeze({ lead:1, mode:"spin", word:"Spin" }),
  /* the call is a countdown: three notes, at -3, -2 and -1 */
  drop:Object.freeze({ lead:3, mode:"drop", word:"Drop" }),
});
/* what the riders do in a bar (chart.modes): a cue kind's mode, or the section's */
export const MODES = Object.freeze(["intro", "paddle", "rock", "spin", "drop", "drink", "outro"]);

export const SONGS = Object.freeze([
  Object.freeze({ id:"paddle", name:"Paddle Party", scene:"open" }),
  Object.freeze({ id:"rock", name:"Rock Hop", scene:"rocks" }),
  Object.freeze({ id:"spin", name:"Spin Cycle", scene:"whirlpool" }),
  Object.freeze({ id:"drop", name:"The Drop", scene:"falls" }),
]);
export const SONG_IDS = Object.freeze(SONGS.map(song => song.id));

/* The plans: a bar's taps as eight slots, one an eighth note (slot s is beat
   s / 2 of the bar): P paddle, H hey, O hop, S spin, D drop, "." nothing.
   Bars are the song's own (0 to 31); practice is bars 2 to 5, play 6 to 13
   and 22 to 29, the outro 30 and 31. Drink bars (14 to 21) have no taps. */
const SLOT = { P:"paddle", H:"hey", O:"hop", S:"spin", D:"drop" };
const rep = (bar, n) => new Array(n).fill(bar);
const PLANS = Object.freeze({
  paddle:{
    practice:["P...P...", "P...P.H.", "P...P...", "P...P.H."],
    playA:[...rep(["P...P...", "P...P.H."], 4).flat()],
    playB:["P...P.H.", "P...P.H.", "P...P.H.", "P...P.H.", "P...P.HH", "P...P.H.", "P...P.HH", "P...P..."],
    outro:["H.......", "........"],
  },
  rock:{
    practice:["....O...", "....O...", "....O.O.", "....O.O."],
    playA:["....O...", "....O...", "....O.O.", "....O...", "....O.O.", "....O...", "....OO..", "....O.O."],
    playB:["....O.O.", "....OO..", "....O.O.", "....OOO.", "....OO..", "....O.O.", "....OOO.", "....O..."],
    outro:["....O...", "........"],
  },
  spin:{
    practice:rep("..S...S.", 4),
    playA:rep("..S...S.", 8),
    playB:["..S...S.", "..S...S.", "..SS..S.", "..S...SS", "..SS..SS", "..S...S.", "..SS..SS", "..S...S."],
    outro:["..S.....", "........"],
  },
  drop:{
    practice:["P...P.H.", "....O.O.", "..S...S.", "..S...S."],
    playA:["P...P.H.", "P...P.HH", "....O.O.", "....OOO.", "..S...S.", "..SS..SS", "P...P.H.", "....OOO."],
    playB:["..S...S.", "....O.O.", "P...P.H.", "..SS..SS", "....OOO.", "P.P.P.P.", "..S...SS", "........"],
    outro:["D.......", "........"],
  },
});

/* the sections with their bars and beats: [{ kind, bar, bars, from, to }] (to exclusive) */
export function sectionsOf(shape = SONG_SHAPE) {
  let bar = 0;
  return shape.map(section => {
    const item = { kind:section.kind, bar, bars:section.bars, from:bar * BEATS_PER_BAR, to:(bar + section.bars) * BEATS_PER_BAR };
    bar += section.bars;
    return item;
  });
}

const callOf = (kind, beat) => CUE_KINDS[kind].lead === null ? null : beat - CUE_KINDS[kind].lead;

function cuesOf(plan, sections) {
  const play = sections.filter(section => section.kind === "play");
  const practice = sections.find(section => section.kind === "practice");
  const outro = sections.find(section => section.kind === "outro");
  const blocks = [
    { from:practice.bar, bars:plan.practice, scored:false },
    { from:play[0].bar, bars:plan.playA, scored:true },
    { from:play[1].bar, bars:plan.playB, scored:true },
    { from:outro.bar, bars:plan.outro, scored:true },
  ];
  const cues = [];
  for (const block of blocks) block.bars.forEach((slots, k) => {
    [...slots].forEach((ch, s) => {
      if (ch === ".") return;
      const kind = SLOT[ch];
      const beat = (block.from + k) * BEATS_PER_BAR + s / 2;
      cues.push({ beat, kind, call:callOf(kind, beat), scored:block.scored });
    });
  });
  cues.sort((a, b) => a.beat - b.beat);
  return cues.map((cue, id) => Object.freeze({ id, ...cue }));
}

/* what the riders do in each bar: the mode of its cues; a bar without cues
   takes its section's (intro, drink, outro) or, in practice and play, the
   next bar's, so the scene changes a bar ahead of the taps */
function modesOf(cues, sections) {
  const modes = new Array(SONG_BARS).fill(null);
  for (const cue of cues) modes[Math.floor(cue.beat / BEATS_PER_BAR)] ??= CUE_KINDS[cue.kind].mode;
  for (const section of sections) for (let bar = section.bar; bar < section.bar + section.bars; bar += 1) {
    if (modes[bar]) continue;
    if (section.kind === "intro" || section.kind === "drink") modes[bar] = section.kind;
  }
  for (let bar = SONG_BARS - 1; bar >= 0; bar -= 1) if (!modes[bar]) modes[bar] = modes[bar + 1] || "outro";
  return modes;
}

const CHARTS = new Map();
/* a song's whole chart, as the room sends it: plain JSON */
export function chartOf(songId) {
  const song = SONGS.find(item => item.id === songId);
  if (!song) return null;
  if (!CHARTS.has(songId)) {
    const sections = sectionsOf();
    const cues = cuesOf(PLANS[songId], sections);
    CHARTS.set(songId, Object.freeze({
      v:1, id:song.id, name:song.name, scene:song.scene,
      bpm:BPM, beatMs:BEAT_MS, bars:SONG_BARS, beats:SONG_BEATS, ms:SONG_MS,
      sections:Object.freeze(sections.map(Object.freeze)), modes:Object.freeze(modesOf(cues, sections)), cues:Object.freeze(cues),
    }));
  }
  return CHARTS.get(songId);
}

/* the song a round plays: the last round is always The Drop, the others in order */
export function songForRound(round, rounds) {
  if (rounds > 0 && round >= rounds - 1) return "drop";
  return SONG_IDS[Math.max(0, Math.min(2, round | 0))];
}

/* ---- the clock ---- */

export const cueTime = (songAt, beat, beatMs = BEAT_MS) => songAt + beat * beatMs;
/* the song's beat at server time t (a float; negative before beat 0) */
export const beatOf = (songAt, t, beatMs = BEAT_MS) => (t - songAt) / beatMs;

/* where the song is at server time t:
   { beat, bar, inBar, section, mode, over } (section a kind, null outside) */
export function clockAt(chart, songAt, t) {
  const beat = beatOf(songAt, t, chart?.beatMs || BEAT_MS);
  const bar = Math.floor(beat / BEATS_PER_BAR);
  const inBar = beat - bar * BEATS_PER_BAR;
  const section = chart?.sections?.find(item => beat >= item.from && beat < item.to)?.kind || null;
  const mode = bar >= 0 && bar < (chart?.bars || 0) ? chart.modes[bar] : null;
  return { beat, bar, inBar, section, mode, over:beat >= (chart?.beats || 0) };
}

export function sectionAt(chart, beat) {
  return chart?.sections?.find(item => beat >= item.from && beat < item.to) || null;
}

/* the cues whose call falls in [a, b) beats: what the host sounds and acts out */
export const callsBetween = (chart, a, b) => (chart?.cues || []).filter(cue => cue.call !== null && cue.call >= a && cue.call < b);
/* the cues whose own beat falls in [a, b) */
export const cuesBetween = (chart, a, b) => (chart?.cues || []).filter(cue => cue.beat >= a && cue.beat < b);
export const scoredCues = chart => (chart?.cues || []).filter(cue => cue.scored);
export const practiceCues = chart => (chart?.cues || []).filter(cue => !cue.scored);
export const drinkSection = chart => (chart?.sections || []).find(item => item.kind === "drink") || null;

/* ---- judging ---- */

export function qualityOf(d) {
  if (!Number.isFinite(d)) return "miss";
  const off = Math.abs(d);
  if (off <= WINDOW.PERFECT) return "perfect";
  if (off <= WINDOW.NICE) return "nice";
  if (off <= WINDOW.OK) return "ok";
  return d < 0 ? "early" : "late";
}

/* The cue a tap at server time t belongs to: the nearest one not yet
   `taken` (a Set of cue ids) whose window holds it, judged with `offset`.
   Returns { cue, d, r } (d judged, r raw, both whole ms) or null. */
export function matchTap(chart, songAt, t, { offset = 0, taken = null } = {}) {
  if (!chart || !Number.isFinite(songAt) || !Number.isFinite(t)) return null;
  const local = t - offset - songAt;
  let best = null;
  for (const cue of chart.cues) {
    const d = local - cue.beat * chart.beatMs;
    if (d < -WINDOW.MAX) break;
    if (d > WINDOW.MAX || taken?.has(cue.id)) continue;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { cue, d };
  }
  return best ? { cue:best.cue, d:Math.round(best.d), r:Math.round(best.d + offset) } : null;
}

/* The room's call on a rider's tap: cue id c with raw offset r, judged with
   the room's offset. Returns { c, q, d, pts, scored } or null (no such cue,
   or too far from it to be meant for it). */
export function judgeHit(chart, c, r, offset = 0) {
  const cue = Number.isInteger(c) ? chart?.cues?.[c] : null;
  if (!cue || !Number.isFinite(r)) return null;
  const d = Math.round(r - offset);
  if (Math.abs(d) > WINDOW.MAX + WINDOW.SLACK) return null;
  const q = qualityOf(d);
  return { c, q, d, pts:cue.scored ? POINTS[q] : 0, scored:cue.scored };
}

/* A rider's score from their judgements ({ [cueId]: q }). `upTo` (a beat)
   counts only cues before it for `live`, the share of what has been played.
   Returns { pts, max, pct, live, n } (pct and live 0 to 100, one decimal). */
export function scoreOf(chart, judged = {}, { upTo = Infinity } = {}) {
  let pts = 0, n = 0, sofar = 0;
  const scored = scoredCues(chart);
  for (const cue of scored) {
    const q = judged[cue.id];
    if (cue.beat < upTo) sofar += 1;
    if (!q) continue;
    n += 1;
    pts += POINTS[q] || 0;
  }
  const max = scored.length * POINTS.perfect;
  const pct = max ? Math.round((pts / max) * 1000) / 10 : 0;
  const live = sofar ? Math.round((pts / (sofar * POINTS.perfect)) * 1000) / 10 : 0;
  return { pts, max, pct, live:Math.min(100, live), n };
}

/* the room's offset from raw practice offsets: the median of those within
   RANGE, clamped; null with fewer than MIN */
export function calibrate(samples = [], { range = CALIBRATION.RANGE, clamp = CALIBRATION.CLAMP, min = CALIBRATION.MIN } = {}) {
  const xs = samples.filter(x => Number.isFinite(x) && Math.abs(x) <= range).sort((a, b) => a - b);
  if (xs.length < min) return null;
  const mid = xs.length >> 1;
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return Math.max(-clamp, Math.min(clamp, Math.round(median)));
}

/* ---- the popup ---- */

/* "+0.03", "-0.01", "0.00": seconds to two decimals */
export function formatOffset(d) {
  if (!Number.isFinite(d)) return "";
  const cs = Math.round(Math.abs(d) / 10);
  if (cs === 0) return "0.00";
  return `${d < 0 ? "-" : "+"}${(cs / 100).toFixed(2)}`;
}
/* what the popup letters: { num, word, tone } (a miss has no number) */
export function popupOf(q, d) {
  return { num:q === "miss" ? null : formatOffset(d), word:WORDS[q] || "", tone:TONES[q] || "white" };
}
