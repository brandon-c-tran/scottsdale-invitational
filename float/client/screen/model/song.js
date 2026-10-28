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

/* The banner at a beat: { key, kind, text, sub, at } or null.
     card      the lead and the first bar: "Round 1" over "Paddle Party"
     practice  the practice bars, a pill
     go        a beat and a half from the first play bar, and from the
               play bar after the drink
     drink     the drink break's first two bars, big */
export function bannerAt(chart, beat, { round = 0, rounds = 0, lastRound = null } = {}) {
  if (!chart || !Number.isFinite(beat)) return null;
  const sections = chart.sections || [];
  const practice = sections.find(s => s.kind === "practice");
  const plays = sections.filter(s => s.kind === "play");
  const drink = sections.find(s => s.kind === "drink");
  if (beat < 4) return { key:"card", kind:"card", text:roundLabel(round, rounds, lastRound), sub:chart.name, at:-SONG_LEAD_MS / chart.beatMs };
  for (const play of plays) {
    if (beat >= play.from && beat < play.from + 1.5) return { key:`go:${play.from}`, kind:"go", text:"Go!", at:play.from };
  }
  if (drink && beat >= drink.from && beat < drink.from + 2 * BEATS_PER_BAR) return { key:"drink", kind:"drink", text:"Drink!", at:drink.from };
  if (practice && beat >= practice.from && beat < practice.to) return { key:"practice", kind:"practice", text:"Practice", at:practice.from };
  return null;
}

/* the host's word for a call */
const CALL_WORDS = Object.freeze({ hey:"Ready", hop:"Ba", spin:"Spin" });

/* Every call the host makes, in beat order: { beat, cue, kind, word, n }.
   A paddle has none (the pulse is its call); The Drop's drop is a
   countdown, three notes at -3, -2 and -1. Memoized per chart. */
const CALLS = new WeakMap();
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

/* is this rider drinking at this beat? From the drink break's first beat
   until they tap Done (`done` the server time they did, or null) */
export function chuggingAt(chart, songAt, now, doneAt) {
  if (!chart || !Number.isFinite(songAt) || !Number.isFinite(now)) return false;
  const drink = (chart.sections || []).find(s => s.kind === "drink");
  if (!drink) return false;
  const from = songAt + drink.from * chart.beatMs;
  if (now < from) return false;
  if (Number.isFinite(doneAt) && doneAt <= now) return false;
  return now < songAt + chart.beats * chart.beatMs;
}
