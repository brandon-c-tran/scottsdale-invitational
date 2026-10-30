/* Float's songs and charts (float/GROOVE.md "Songs and charts", "Judging").
   Pure: shared by the room (the truth), the screen, the phone, the sound and
   the tests, so a tap is called the same thing everywhere.

   A song is 32 bars at 120 bpm (BEAT_MS 500, a bar 2 s, 64 s):
     intro 2 . practice 4 . play 8 . breakdown 8 . play 8 . outro 2
   The breakdown (Oct 28, in the drink break's place) is the mid-song twist:
   the host plays a rhythm for a bar and everyone copies it the next bar
   ("echo" cues, a bar's lead), four times.
   Beats count from the song's beat 0 (songAt, server time) and may be
   fractional (an "and" is k + 0.5). A cue is one tap:
     { id, beat, kind, call, scored }
   id is its index in the chart (ascending by beat); kind is what the tap is
   (CUE_KINDS); call is the beat the host calls it (beat - its lead), or null
   when the pulse itself is the call (a paddle); scored is false in practice
   (judged and shown, never scored). A practice cue with demo:true is the
   host showing it (the call and the band's answer sound, the riders act it
   out): nobody taps it, nothing matches or misses it. `lines` are the
   practice's narration, Rhythm Heaven's text box: { beat, text } from that
   beat until the next line or the end of practice. `dark` (v3) are the bars
   (0 to 31) that black out: the host and the band drop out to a bare
   hi-hat and the calls stop; their cues are judged like any (a dark bar
   repeats the bar before it, and only its own cues are called in it).

   Rowing taps are Paddle Party's alone (v4 item 1; v3 had them under
   every song): in its play every bar paddles on 1 and 3 (the pulse is the
   call). The other songs tap their own move; everyone still rows in the
   picture and the band. Every call is the answer's own rhythm, a fixed
   lead earlier ("answer the host"): Paddle Party paddles on 1 and 3 and answers "Ready" with "Hey!" two
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
  Object.freeze({ kind:"breakdown", bars:8 }),
  Object.freeze({ kind:"play", bars:8 }),
  Object.freeze({ kind:"outro", bars:2 }),
]);
export const SECTION_KINDS = Object.freeze(["intro", "practice", "play", "breakdown", "outro"]);
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
/* the number's tone (GROOVE.md v3 "Numbers in more colours than red"): by
   how close it is, the same scale on the TV and the phone; a miss has no
   number and stays TONES.miss. Songs: gold, green, yellow, red. */
export const OFFSET_TONES = Object.freeze([[50, "gold"], [100, "green"], [160, "yellow"]]);
export const offsetTone = absMs => (OFFSET_TONES.find(([max]) => Math.abs(Number(absMs)) <= max) || [0, "red"])[1];
/* Last Call's (|ms| from zero): green, yellow, orange, red */
export const COUNT_TONES = Object.freeze([[100, "green"], [300, "yellow"], [700, "orange"]]);
export const countTone = absMs => (COUNT_TONES.find(([max]) => Math.abs(Number(absMs)) <= max) || [0, "red"])[1];
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
  /* the breakdown's: copy the host's rhythm a bar later */
  echo:Object.freeze({ lead:4, mode:"echo", word:"Copy" }),
  /* Fireworks': the host lights a fuse on the call, you launch two beats later */
  rocket:Object.freeze({ lead:2, mode:"rocket", word:"Launch" }),
  /* Last Call's: the moment the countdown reaches zero (chart.countdown) */
  zero:Object.freeze({ lead:null, mode:"lastcall", word:"Zero" }),
});
/* what the riders do in a bar (chart.modes): a cue kind's mode, or the section's */
export const MODES = Object.freeze(["intro", "paddle", "rock", "spin", "drop", "echo", "rocket", "outro", "lastcall"]);

export const SONGS = Object.freeze([
  Object.freeze({ id:"paddle", name:"Paddle Party", scene:"open" }),
  Object.freeze({ id:"rock", name:"Rock Hop", scene:"rocks" }),
  Object.freeze({ id:"spin", name:"Spin Cycle", scene:"whirlpool" }),
  Object.freeze({ id:"drop", name:"The Drop", scene:"falls" }),
  Object.freeze({ id:"fireworks", name:"Fireworks", scene:"night" }),
]);
export const SONG_IDS = Object.freeze(SONGS.map(song => song.id));

/* The plans: a bar's taps as eight slots, one an eighth note (slot s is beat
   s / 2 of the bar): P paddle, H hey, O hop, S spin, D drop, E echo,
   R rocket, "." nothing.
   Bars are the song's own (0 to 31); practice is bars 2 to 5, play 6 to 13
   and 22 to 29, the outro 30 and 31. Drink bars (14 to 21) have no taps. */
const SLOT = { P:"paddle", H:"hey", O:"hop", S:"spin", D:"drop", E:"echo", R:"rocket" };
/* lowercase in practice: the host shows it (demo), nobody taps */
const DEMO = { p:"paddle", h:"hey", o:"hop", s:"spin", r:"rocket" };
const rep = (bar, n) => new Array(n).fill(bar);
const PLANS = Object.freeze({
  /* where rowing is learned (v3: paddle, keep paddling with the Hey
     coming, watch the host do both, both now) */
  paddle:{
    practice:["P...P...", "P...P...", "p...p.h.", "P...P.H."],
    lines:[[7, "Paddle on 1 and 3"], [11, "Keep paddling. Hey! on 4"], [15, "Watch"], [20, "Both now"], [55, "Copy me", 60]],
    playA:[...rep(["P...P...", "P...P.H."], 4).flat()],
    breakdown:["........", "E.E.E...", "........", "E..EE...", "........", "EEE.E...", "........", "E...EEE."],
    playB:["P...P.H.", "P...P.H.", "P...P.H.", "P...P.H.", "P...P.HH", "P...P.H.", "P...P.HH", "P...P..."],
    outro:["H.......", "........"],
  },
  /* v4: you row only in Paddle Party (everyone rows in the picture and
     the band). The host's "ba" in the first half, your hop in the second
     (v2's); the host's call is the demo, so practice shows one hop and
     plays the rest (5 taps to calibrate on) */
  rock:{
    practice:["....o...", "....O...", "....O.O.", "....O.O."],
    lines:[[7, "Hop two beats after me"], [11, "Your turn"], [15, "Two this time"], [55, "Copy me", 60]],
    playA:["....O...", "....O...", "....O.O.", "....O...", "....O.O.", "....O...", "....OO..", "....O.O."],
    breakdown:["........", "E...E...", "........", "E.E.E...", "........", "EE..E...", "........", "E..E.E.."],
    playB:["....O.O.", "....OO..", "....O.O.", "....OOO.", "....OO..", "....O.O.", "....OOO.", "....O..."],
    outro:["....O...", "........"],
  },
  /* the host spins on 1 and 3, you echo one beat later, on the backbeat (v2's) */
  spin:{
    practice:["..s...s.", "..S...S.", "..S...S.", "..S...S."],
    lines:[[7, "Spin one beat after me"], [12, "Your turn"], [20, "On the backbeat"], [55, "Copy me", 60]],
    playA:rep("..S...S.", 8),
    breakdown:["........", "..E...E.", "........", "..EE..E.", "........", "..E...EE", "........", "..EE..EE"],
    playB:["..S...S.", "..S...S.", "..SS..S.", "..S...SS", "..SS..SS", "..S...S.", "..SS..SS", "..S...S."],
    outro:["..S.....", "........"],
  },
  /* the semifinal: a bar of each pattern in turn (paddle bars are a
     pattern, not a layer); play B (v3 item 8) a new pattern every bar with
     no sign, syncopated "and" hops and spins, two dark bars (each the bar
     before it again); bar 29 is the countdown's (the music cuts) */
  drop:{
    practice:["P...P.H.", "....O.O.", "..S...S.", "..S...S."],
    lines:[[7, "All three, in turn"], [11, "Hop"], [15, "Spin"], [55, "Copy me", 60]],
    playA:["P...P.H.", "P...P.HH", "....O.O.", "....OOO.", "..S...S.", "..SS..SS", "P...P.H.", "....OOO."],
    breakdown:["........", "E.E.E.E.", "........", "E.EEE...", "........", "EE.EE...", "........", "E.E.EEE."],
    playB:["..S..S.S", "....OO.O", "P...PHO.", "P...PHO.", "..S..OO.", "..S..OO.", "...S..OS", "........"],
    outro:["D.......", "........"],
    dark:[25, 27],
  },
  /* the final: rockets with every other kind (paddle bars as a pattern),
     the "and"s, two dark bars (each the bar before it again, kept in your
     head), a three-rocket finale */
  fireworks:{
    practice:["....r.r.", "....R.R.", "....RR..", "....RRR."],
    lines:[[7, "Watch the fuse"], [11, "Launch two beats after I light"], [15, "Two quick ones"], [19, "Three in a row"],
      [55, "Copy me", 60]],
    playA:["P...P.R.", "P...P.RR", "....O.R.", "..S...R.", "P...P.HR", "....OR.R", "..SS..R.", "P...P.RR"],
    breakdown:["........", "E..E..E.", "........", "E.E..EE.", "........", "EE.E.E..", "........", "E.EE.E.E"],
    playB:["....R.RR", "..S...RR", "P...P.OR", "....RR.R", "....RR.R", "..S..RRR", "..S..RRR", "P...P..."],
    outro:["..R.R.R.", "........"],
    dark:[26, 28],
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
  const breakdown = sections.find(section => section.kind === "breakdown");
  const outro = sections.find(section => section.kind === "outro");
  const blocks = [
    { from:practice.bar, bars:plan.practice, scored:false },
    { from:play[0].bar, bars:plan.playA, scored:true },
    { from:breakdown.bar, bars:plan.breakdown, scored:true },
    { from:play[1].bar, bars:plan.playB, scored:true },
    { from:outro.bar, bars:plan.outro, scored:true },
  ];
  const cues = [];
  for (const block of blocks) block.bars.forEach((slots, k) => {
    [...slots].forEach((ch, s) => {
      if (ch === ".") return;
      const demo = !block.scored && Object.hasOwn(DEMO, ch);
      const kind = demo ? DEMO[ch] : SLOT[ch];
      const beat = (block.from + k) * BEATS_PER_BAR + s / 2;
      cues.push(demo ? { beat, kind, call:callOf(kind, beat), scored:false, demo:true }
        : { beat, kind, call:callOf(kind, beat), scored:block.scored });
    });
  });
  cues.sort((a, b) => a.beat - b.beat);
  return cues.map((cue, id) => Object.freeze({ id, ...cue }));
}

/* what the riders do in each bar: the mode of its cues (its own move over
   the rowing); a bar without cues
   takes its section's (intro, outro) or, in practice, play and the
   breakdown, the next bar's, so the scene changes a bar ahead of the taps
   (the breakdown's host bars are "echo") */
function modesOf(cues, sections) {
  const modes = new Array(SONG_BARS).fill(null);
  /* a bar is its own move's (the first cue that isn't a paddle), "paddle"
     only where it only paddles (or paddles with a Hey) */
  for (const cue of cues) if (cue.kind !== "paddle") modes[Math.floor(cue.beat / BEATS_PER_BAR)] ??= CUE_KINDS[cue.kind].mode;
  for (const cue of cues) modes[Math.floor(cue.beat / BEATS_PER_BAR)] ??= CUE_KINDS[cue.kind].mode;
  for (const section of sections) for (let bar = section.bar; bar < section.bar + section.bars; bar += 1) {
    if (modes[bar]) continue;
    if (section.kind === "intro") modes[bar] = section.kind;
  }
  for (let bar = SONG_BARS - 1; bar >= 0; bar -= 1) if (!modes[bar]) modes[bar] = modes[bar + 1] || "outro";
  return modes;
}

/* the plan's narration: [beat, text, until?] -> { beat, text, until }; a line
   ends at its own until, the next line, or the end of the section it
   explains (the section starting within a beat of it) */
function linesOf(list, sections) {
  const sorted = list.slice().sort((a, b) => a[0] - b[0]);
  return sorted.map(([beat, text, until], k) => {
    const section = sections.find(item => beat + 1 >= item.from && beat + 1 < item.to);
    const next = sorted[k + 1]?.[0];
    const end = until ?? Math.min(section ? section.to : Infinity, next ?? Infinity);
    return Object.freeze({ beat, text, until:end });
  });
}

const CHARTS = new Map();
/* a song's whole chart, as the room sends it: plain JSON (Last Call's too) */
export function chartOf(songId) {
  if (typeof songId === "string" && songId.startsWith(LAST_CALL_ID)) return lastCallChart(songId);
  const song = SONGS.find(item => item.id === songId);
  if (!song) return null;
  if (!CHARTS.has(songId)) {
    const sections = sectionsOf();
    const cues = cuesOf(PLANS[songId], sections);
    CHARTS.set(songId, Object.freeze({
      v:1, id:song.id, name:song.name, scene:song.scene, window:WINDOW.MAX,
      bpm:BPM, beatMs:BEAT_MS, bars:SONG_BARS, beats:SONG_BEATS, ms:SONG_MS,
      sections:Object.freeze(sections.map(Object.freeze)), modes:Object.freeze(modesOf(cues, sections)), cues:Object.freeze(cues),
      lines:Object.freeze(linesOf(PLANS[songId].lines || [], sections)),
      dark:Object.freeze((PLANS[songId].dark || []).slice()),
    }));
  }
  return CHARTS.get(songId);
}

/* the song a round plays (v3: five rounds): the last is Fireworks, the one
   before it The Drop, the others Paddle Party, Rock Hop, Spin Cycle in
   order. Fewer rounds keep the last two (1: Fireworks; 2: The Drop,
   Fireworks; 3: Paddle Party, The Drop, Fireworks). Rounds unknown (0):
   the five in order. */
export function songForRound(round, rounds) {
  const r = Math.max(0, round | 0), n = rounds | 0;
  if (n <= 0) return SONG_IDS[Math.min(r, SONG_IDS.length - 1)];
  if (r >= n - 1) return "fireworks";
  if (r === n - 2) return "drop";
  return SONG_IDS[Math.min(r, 2)];
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
export const practiceCues = chart => (chart?.cues || []).filter(cue => !cue.scored && !cue.demo);
/* the cues a rider plays (no demos): what the room judges and misses */
export const playedCues = chart => (chart?.cues || []).filter(cue => !cue.demo);
export const demoCues = chart => (chart?.cues || []).filter(cue => cue.demo);
/* the narration line showing at a beat (Rhythm Heaven's text box), or null */
export function lineAt(chart, beat) {
  return (chart?.lines || []).find(item => beat >= item.beat && beat < item.until) || null;
}
export const breakdownSection = chart => (chart?.sections || []).find(item => item.kind === "breakdown") || null;

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
  const max = chart.window || WINDOW.MAX;
  let best = null;
  for (const cue of chart.cues) {
    const d = local - cue.beat * chart.beatMs;
    if (d < -max) break;
    if (d > max || cue.demo || taken?.has(cue.id)) continue;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { cue, d };
  }
  return best ? { cue:best.cue, d:Math.round(best.d), r:Math.round(best.d + offset) } : null;
}

/* The room's call on a rider's tap: cue id c with raw offset r, judged with
   the room's offset. Returns { c, q, d, pts, scored } or null (no such cue,
   or too far from it to be meant for it). */
export function judgeHit(chart, c, r, offset = 0) {
  const cue = Number.isInteger(c) ? chart?.cues?.[c] : null;
  if (!cue || cue.demo || !Number.isFinite(r)) return null;
  const d = Math.round(r - offset);
  if (Math.abs(d) > (chart.window || WINDOW.MAX) + WINDOW.SLACK) return null;
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

/* ---- the chug-off (GROOVE.md "The chug-off") ----
   After each song but the final, the last rider through and the first
   rider out race to finish a drink in front of the room; the first to tap
   Done keeps the spot. The phase: the call (INTRO_MS: "Chug-off!", the two
   names, 3 2 1), up to WINDOW_MS for a Done, the winner shown (REVEAL_MS),
   the loser's exit (EXIT_MS). Nobody Done in the window: the better score
   keeps the spot. */
export const CHUGOFF = Object.freeze({ INTRO_MS:4000, INTRO_FIRST_MS:7000, WINDOW_MS:30000, REVEAL_MS:3000, EXIT_MS:2500 });

/* ---- after a song: grades, a line for each rider, the awards ---- */

/* Rhythm Heaven's three: Superb, OK, Try again (by the song's percent) */
export const GRADES = Object.freeze([
  Object.freeze({ id:"superb", min:90, word:"Superb" }),
  Object.freeze({ id:"ok", min:65, word:"OK" }),
  Object.freeze({ id:"tryagain", min:-Infinity, word:"Try again" }),
]);
export const gradeOf = pct => (GRADES.find(grade => (Number(pct) || 0) >= grade.min) || GRADES[GRADES.length - 1]).id;
export const gradeWord = id => GRADES.find(grade => grade.id === id)?.word || "";

const KIND_WORDS = Object.freeze({ paddle:"paddles", hey:"Heys", hop:"hops", spin:"spins", drop:"the drop", echo:"copies",
  rocket:"launches" });
const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
const median = xs => {
  if (!xs.length) return null;
  const sorted = xs.slice().sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
/* how a rider leaned on the beat: "early", "late" or null (median d past 40 ms) */
export const leanOf = (ds = []) => {
  const m = median(ds.filter(Number.isFinite));
  return m === null ? null : m <= -40 ? "early" : m >= 40 ? "late" : null;
};

/* a rider's song in a line, the judge's verdict: from their judgements on
   scored cues ({ [cueId]: { q, d } }; a miss has q "miss"). Returns
   { grade, pct, best, worst, lean, line } (best and worst cue kinds). */
export function feedbackOf(chart, hits = {}) {
  const kinds = new Map();
  for (const cue of scoredCues(chart)) {
    const k = kinds.get(cue.kind) || { kind:cue.kind, n:0, pts:0, ds:[] };
    k.n += 1;
    const hit = hits[cue.id];
    if (hit && hit.q !== "miss") {
      k.pts += POINTS[hit.q] || 0;
      if (Number.isFinite(hit.d)) k.ds.push(hit.d);
    }
    kinds.set(cue.kind, k);
  }
  const all = [...kinds.values()];
  const total = all.reduce((sum, k) => ({ pts:sum.pts + k.pts, n:sum.n + k.n }), { pts:0, n:0 });
  const pct = total.n ? Math.round((total.pts / (total.n * POINTS.perfect)) * 1000) / 10 : 0;
  const lean = leanOf(all.flatMap(k => k.ds));
  const list = all.filter(k => k.n >= 2).map(k => ({ kind:k.kind, avg:k.pts / (k.n * POINTS.perfect), lean:leanOf(k.ds) }));
  if (!list.length) return { grade:gradeOf(pct), pct, best:null, worst:null, lean, line:"" };
  const best = list.reduce((a, b) => b.avg > a.avg ? b : a);
  const worst = list.reduce((a, b) => b.avg < a.avg ? b : a);
  const parts = [];
  if (best.avg >= 0.85) parts.push(`Great ${KIND_WORDS[best.kind]}.`);
  if (worst !== best && worst.avg < 0.7) parts.push(`${capital(KIND_WORDS[worst.kind])} ${worst.lean ? `a little ${worst.lean}` : "were off"}.`);
  else if (lean) parts.push(`A little ${lean}.`);
  if (!parts.length) parts.push(pct >= 65 ? "Steady." : "Off the beat.");
  return { grade:gradeOf(pct), pct, best:best.kind, worst:worst.kind, lean, line:parts.join(" ") };
}

/* the song's awards, for the cut, from every rider's judgements
   ([{ i, hits }]): [{ id, i, value, label }], one a rider while another
   qualifies. Most Perfects (3+), the longest run of Perfect or Nice (5+),
   always early, always late (median 40 ms or more), most splashes (3+
   misses). */
export const AWARD_LABELS = Object.freeze({
  perfects:"Most Perfects", streak:"Longest streak", early:"Always early", late:"Always late", splashes:"Most splashes",
});
export function awardsOf(chart, riders = []) {
  const cues = scoredCues(chart);
  const stats = riders.map(({ i, hits = {} }) => {
    let perfects = 0, misses = 0, run = 0, streak = 0;
    const ds = [];
    for (const cue of cues) {
      const hit = hits[cue.id];
      if (!hit || hit.q === "miss") { misses += 1; run = 0; continue; }
      if (hit.q === "perfect") perfects += 1;
      if (Number.isFinite(hit.d)) ds.push(hit.d);
      run = hit.q === "perfect" || hit.q === "nice" ? run + 1 : 0;
      streak = Math.max(streak, run);
    }
    return { i, perfects, misses, streak, lean:median(ds) };
  });
  const pick = (id, score, min) => {
    const ranked = stats.filter(s => score(s) !== null && score(s) >= min).sort((a, b) => score(b) - score(a) || a.i - b.i);
    return ranked.length ? { id, ranked } : null;
  };
  const candidates = [
    pick("perfects", s => s.perfects, 3),
    pick("streak", s => s.streak, 5),
    pick("early", s => s.lean === null ? null : -s.lean, 40),
    pick("late", s => s.lean, 40),
    pick("splashes", s => s.misses, 3),
  ].filter(Boolean);
  const out = [], used = new Set();
  for (const { id, ranked } of candidates) {
    const s = ranked.find(item => !used.has(item.i));
    if (!s) continue;
    used.add(s.i);
    const value = id === "perfects" ? s.perfects : id === "streak" ? s.streak : id === "splashes" ? s.misses : Math.round(Math.abs(s.lean));
    out.push({ id, i:s.i, value, label:AWARD_LABELS[id] });
  }
  return out;
}

/* ---- Last Call (GROOVE.md "Last Call"): the countdown ----

   Between songs (after each cut but the last) the bar closes at zero: the
   bartender counts down from 10, a second a count, shown big and said out
   loud; partway the count goes dark (a slapstick bit at the bar) and
   everyone counts the rest in their head and taps once, on zero. The
   tricks get harder each Last Call: "lights" (the lights go out at 3),
   "slow" (the count slows from 6, then goes dark at 3 at the slower pace),
   "ticks" (the voice stops at 6, ticks only, then dark at 3), "rush" (the
   count speeds up from 6 to 0.7 s, then dark at 3 at the fast pace). The tap is a
   cue of kind "zero" at the countdown's zero with a wide window
   (LAST_CALL.WINDOW); no tap counts MISS_MS. The farthest from zero drinks
   (every rider tied on it). Never scored in the Cup.

   chart.countdown (ms from the chart's beat 0, songAt):
     { trick, first, introMs, steps:[{ n, at, show, say, tick }], hideAt,
       zeroAt, revealAt, verdictAt }
   n is the number (10 to 1); `show` it is drawn, `say` the bartender says
   it, `tick` the clock ticks it; hideAt the bit that hides the count,
   zeroAt the true zero, revealAt every rider's offset (the window has
   closed), verdictAt who drinks. The first Last Call's intro is longer: it
   says what Last Call is. */
export const LAST_CALL_ID = "lastcall";
export const LAST_CALL_TRICKS = Object.freeze(["lights", "slow", "ticks", "rush"]);
export const LAST_CALL = Object.freeze({
  FROM:10, STEP_MS:1000, SLOW_MS:1400, RUSH_MS:700, WINDOW:3000, MISS_MS:3000,
  /* the reveal waits for the room's ranking: the zero's miss deadline at
     the largest offset (WINDOW + 250 + CALIBRATION.CLAMP) and a tick (v4) */
  INTRO_FIRST_MS:7000, INTRO_MS:3000, REVEAL_AFTER_MS:3600, VERDICT_AFTER_MS:2500, OUTRO_MS:3500,
});
/* the Last Call after round k (0-based): its chart id */
export const lastCallId = k => `${LAST_CALL_ID}-${LAST_CALL_TRICKS[Math.max(0, Math.min(LAST_CALL_TRICKS.length - 1, k | 0))]}`;

export function countdownOf(trick = "lights", { first = trick === "lights" } = {}) {
  const L = LAST_CALL;
  const introMs = first ? L.INTRO_FIRST_MS : L.INTRO_MS;
  const steps = [];
  let at = 0;
  for (let n = L.FROM; n >= 1; n -= 1) {
    const hidden = n <= 3;
    steps.push({ n, at:introMs + at, show:!hidden, say:!hidden && !(trick === "ticks" && n <= 6), tick:trick === "ticks" && n <= 6 && !hidden });
    /* the gap after n: "slow" stretches every count from 6 down, "rush"
       shortens it */
    at += n <= 6 && trick === "slow" ? L.SLOW_MS : n <= 6 && trick === "rush" ? L.RUSH_MS : L.STEP_MS;
  }
  const zeroAt = introMs + at;
  const hideAt = steps.find(step => step.n === 3).at;
  const revealAt = zeroAt + L.REVEAL_AFTER_MS;
  return { trick, first, introMs, steps, hideAt, zeroAt, revealAt, verdictAt:revealAt + L.VERDICT_AFTER_MS };
}

const LAST_CALLS = new Map();
function lastCallChart(id = LAST_CALL_ID) {
  const trick = LAST_CALL_TRICKS.find(item => id === `${LAST_CALL_ID}-${item}`) || "lights";
  const key = `${LAST_CALL_ID}-${trick}`;
  if (LAST_CALLS.has(key)) return LAST_CALLS.get(key);
  const countdown = countdownOf(trick);
  const ms = countdown.verdictAt + LAST_CALL.OUTRO_MS;
  const bars = Math.ceil(ms / BAR_MS);
  const toBeat = time => time / BEAT_MS;
  const barOf = time => Math.floor(time / BAR_MS);
  const sections = [
    { kind:"intro", bar:0, bars:barOf(countdown.introMs), from:0, to:toBeat(countdown.introMs) },
    { kind:"play", bar:barOf(countdown.introMs), bars:barOf(countdown.revealAt) - barOf(countdown.introMs), from:toBeat(countdown.introMs), to:toBeat(countdown.revealAt) },
    { kind:"outro", bar:barOf(countdown.revealAt), bars:bars - barOf(countdown.revealAt), from:toBeat(countdown.revealAt), to:bars * BEATS_PER_BAR },
  ];
  const modes = Array.from({ length:bars }, (_, bar) => bar * BAR_MS < countdown.introMs ? "intro"
    : bar * BAR_MS >= countdown.revealAt ? "outro" : "lastcall");
  const cue = Object.freeze({ id:0, beat:toBeat(countdown.zeroAt), kind:"zero", call:null, scored:false });
  const chart = Object.freeze({
    v:2, id:key, name:"Last Call", scene:"bar", window:LAST_CALL.WINDOW,
    bpm:BPM, beatMs:BEAT_MS, bars, beats:bars * BEATS_PER_BAR, ms,
    sections:Object.freeze(sections.map(Object.freeze)), modes:Object.freeze(modes), cues:Object.freeze([cue]), lines:Object.freeze([]),
    dark:Object.freeze([]),
    countdown:Object.freeze({ ...countdown, steps:Object.freeze(countdown.steps.map(Object.freeze)) }),
  });
  LAST_CALLS.set(key, chart);
  return chart;
}

/* a rider's Last Call: |d| from zero ({ [cueId]: d }); no tap is MISS_MS */
export function lastCallTotal(grabs = {}, chart = lastCallChart()) {
  let ms = 0;
  for (const cue of chart.cues) {
    const d = grabs[cue.id];
    ms += Number.isFinite(d) ? Math.abs(d) : LAST_CALL.MISS_MS;
  }
  return ms;
}

/* who drinks: the farthest off, every rider tied on it ([{ i, ms }] -> [i]) */
export function lastCallWorst(totals = []) {
  if (!totals.length) return [];
  const worst = Math.max(...totals.map(item => item.ms));
  return totals.filter(item => item.ms === worst).map(item => item.i);
}
