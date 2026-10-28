/* What the song shows at a beat (float/GROOVE.md "Songs and charts", "The
   screen (TV) and the phone"): the round card through the lead, Practice,
   Go!, Drink!, the host's calls and The Drop's signs, and which scene each
   phase stands in. Pure: everything from the chart and a beat. */
import { BEATS_PER_BAR, CUE_KINDS, SONG_LEAD_MS, SONGS, chartOf, sectionAt } from "../../../shared/chart.js";

/* the scene each phase stands in (the art manifest's scene ids) */
export function sceneFor(phase, chart = null) {
  if (phase === "lobby") return "lobby";
  if (phase === "podium" || phase === "feedback") return "podium";
  if (phase === "lastcall") return "bar";
  if ((phase === "song" || phase === "cut") && chart?.scene) return chart.scene;
  return "open";
}

/* a song's round label: "Round 2", or "Final" */
export const roundLabel = (round, rounds, lastRound = null) => {
  const last = typeof lastRound === "boolean" ? lastRound : rounds > 0 && round >= rounds - 1;
  return last ? "Final" : `Round ${(round | 0) + 1}`;
};

export const songName = id => SONGS.find(song => song.id === id)?.name || "";

/* the room's chart for a room message: its own, one it sent before, or the
   shared module's (the same function the room runs) */
export function chartFor(msg, cache = new Map()) {
  if (msg?.chart && typeof msg.chart === "object" && Array.isArray(msg.chart.cues)) {
    cache.set(msg.chart.id, msg.chart);
    return msg.chart;
  }
  const id = msg?.chartId || msg?.song;
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  const chart = chartOf(id);
  if (chart) cache.set(id, chart);
  return chart;
}

/* beat 0 of the song: the room's songAt, else its startAt plus the lead */
export function songStart(msg) {
  if (Number.isFinite(msg?.songAt)) return msg.songAt;
  if (Number.isFinite(msg?.startAt)) return msg.startAt + SONG_LEAD_MS;
  return null;
}

/* the count-ins, as the sound counts them ("one, two, three, four" on the
   intro's last bar): { from, to } beats */
export function countIns(chart) {
  const out = [];
  for (const kind of ["intro"]) {
    const section = (chart?.sections || []).find(s => s.kind === kind);
    if (section) out.push({ from:section.to - BEATS_PER_BAR, to:section.to });
  }
  return out;
}

/* The banner at a beat: { key, kind, text, sub, at } or null.
     card      the lead and the intro's first bar: "Round 1" over "Paddle Party"
     count     the count-in, 1 2 3 4 on its beats (the intro's last bar)
     go        a beat and a half from each play bar's start
   (practice has the narration box instead: lineAt) */
export function bannerAt(chart, beat, { round = 0, rounds = 0, lastRound = null } = {}) {
  if (!chart || !Number.isFinite(beat)) return null;
  const sections = chart.sections || [];
  const plays = sections.filter(s => s.kind === "play");
  for (const count of countIns(chart)) {
    if (beat >= count.from && beat < count.to) {
      const n = Math.floor(beat - count.from) + 1;
      return { key:`count:${count.from}:${n}`, kind:"count", text:String(n), at:count.from + n - 1 };
    }
  }
  if (beat < 4) return { key:"card", kind:"card", text:roundLabel(round, rounds, lastRound), sub:chart.name, at:-SONG_LEAD_MS / chart.beatMs };
  for (const play of plays) {
    if (beat >= play.from && beat < play.from + 1.5) return { key:`go:${play.from}`, kind:"go", text:"Go!", at:play.from };
  }
  return null;
}

/* the host's word for a call */
const CALL_WORDS = Object.freeze({ hey:"Ready", hop:"Ba", spin:"Spin" });

/* Every call the host makes, in beat order: { beat, cue, kind, word, n }.
   A paddle has none (the pulse is its call); The Drop's drop is a
   countdown, three notes at -3, -2 and -1. Memoized per chart. */
const CALLS = new WeakMap();
/* the breakdown's calls are the host's rhythm, a gesture a note (no word) */
export function hostCalls(chart) {
  if (!chart?.cues) return [];
  if (CALLS.has(chart)) return CALLS.get(chart);
  const calls = [];
  for (const cue of chart.cues) {
    if (cue.call === null || cue.call === undefined) continue;
    if (cue.kind === "drop") {
      const lead = CUE_KINDS.drop.lead;
      for (let k = 0; k < lead; k += 1) calls.push({ beat:cue.call + k, cue:cue.id, kind:"drop", word:String(lead - k), n:k });
    } else calls.push({ beat:cue.call, cue:cue.id, kind:cue.kind, word:CALL_WORDS[cue.kind] || "", n:0 });
  }
  calls.sort((a, b) => a.beat - b.beat || a.n - b.n);
  CALLS.set(chart, calls);
  return calls;
}

/* what a rider does for a cue: its own move; the breakdown's copy is the
   song's own (Paddle Party a stroke, Rock Hop a hop, Spin Cycle a spin, The
   Drop each in turn) */
const ECHO_MOVES = Object.freeze({ paddle:"paddle", rock:"hop", spin:"spin" });
export function actionKind(chart, cue) {
  if (!cue) return "paddle";
  if (cue.kind !== "echo") return cue.kind;
  if (ECHO_MOVES[chart?.id]) return ECHO_MOVES[chart.id];
  return ["paddle", "hop", "spin"][(cue.id | 0) % 3];
}

/* the demo the riders act out at a beat (the host's "Watch"): the latest
   demo cue whose beat has come and whose move is still playing, or null */
export function demoAt(chart, beat, { holdBeats = 1.2 } = {}) {
  if (!chart?.cues || !Number.isFinite(beat)) return null;
  let found = null;
  for (const cue of chart.cues) {
    if (cue.beat > beat) break;
    if (cue.demo && beat < cue.beat + holdBeats) found = cue;
  }
  return found;
}

/* where the narration box stands: over the scene in practice, below the
   rank strip in the breakdown */
export function lineSpot(chart, line) {
  if (!line) return null;
  const section = (chart?.sections || []).find(s => line.beat + 1 >= s.from && line.beat + 1 < s.to);
  return section?.kind === "breakdown" || section?.kind === "play" ? "low" : "top";
}

/* is the rank strip up at a beat? from the first play bar to the song's end */
export function rankStripOn(chart, beat) {
  if (!chart || !Number.isFinite(beat)) return false;
  const first = (chart.sections || []).find(s => s.kind === "play");
  return !!first && beat >= first.from - 0.5;
}

/* how long the host holds a call (beats) */
export const CALL_HOLD = 0.7;

/* the host at a beat: { pose, call } (call the one being made, or null) */
export function hostAt(chart, beat, { phase = "song" } = {}) {
  if (phase !== "song" || !chart || !Number.isFinite(beat)) return { pose:phase === "podium" ? "cheer" : "idle", call:null };
  const calls = hostCalls(chart);
  let call = null;
  for (let k = calls.length - 1; k >= 0; k -= 1) {
    const c = calls[k];
    if (c.beat > beat) continue;
    if (beat < c.beat + CALL_HOLD) call = c;
    break;
  }
  if (call) return { pose:"call", call };
  const end = chart.cues?.length ? chart.cues[chart.cues.length - 1].beat : chart.beats;
  if (beat >= end + 0.5) return { pose:"cheer", call:null };
  return { pose:"idle", call:null };
}

const PLAY_MODES = new Set(["paddle", "rock", "spin"]);
/* The Drop's signs: the bar before a switch, the host holds up the next
   pattern's sign (sign-paddle, sign-rock, sign-spin). Other songs: none. */
export function signAt(chart, beat) {
  if (!chart || chart.id !== "drop" || !Number.isFinite(beat)) return null;
  const bar = Math.floor(beat / BEATS_PER_BAR);
  const modes = chart.modes || [];
  if (bar < 0 || bar >= modes.length - 1) return null;
  const next = modes[bar + 1];
  if (!PLAY_MODES.has(next) || next === modes[bar]) return null;
  return { mode:next, prop:`sign-${next}`, bar };
}

/* the section and mode at a beat, for the scene: rocks drift by in a rock
   bar, the whirl turns in a spin bar, the falls come up for the drop */
export function sceneMode(chart, beat) {
  if (!chart || !Number.isFinite(beat)) return { section:null, mode:null };
  const bar = Math.floor(beat / BEATS_PER_BAR);
  const section = sectionAt(chart, beat)?.kind || (beat < 0 ? "lead" : "over");
  return { section, mode:bar >= 0 && bar < (chart.modes?.length || 0) ? chart.modes[bar] : null };
}
