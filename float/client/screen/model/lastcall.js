/* Last Call on the TV (float/GROOVE.md "Last Call"): everyone in the Cup at
   the bar, the bartender sliding a drink down the counter on each of a
   grab's `slides`, everyone grabbing once, every rider's offset big over
   them until the next slides begin, then the totals and who drinks. Pure:
   everything from the chart, a beat and the room's `lastCall`. */
import { BEATS_PER_BAR, LAST_CALL } from "../../../shared/chart.js";
import { STAGE_W } from "./flotilla.js";

/* the counter on the stage: the glass's run along it (the bar scene's
   counter line is 0.45 of the height) */
export const COUNTER = Object.freeze({ y:488, from:470, to:1700 });
/* the bartender behind the counter, left of the run */
export const BARTENDER = Object.freeze({ x:300, y:494, h:400 });

/* the glass at a beat: { x, visible, k (which grab), sliding } along the
   counter. Before a grab's first slide it waits at the bartender's hand;
   each slide moves it a step down the bar (a quick glide on the beat); on
   the grab it reaches the end, and is gone until the next grab's slides */
export function glassAt(chart, beat) {
  const grabs = chart?.cues || [];
  const out = { x:COUNTER.from, visible:false, k:-1, sliding:0 };
  if (!grabs.length || !Number.isFinite(beat)) return out;
  for (let k = 0; k < grabs.length; k += 1) {
    const cue = grabs[k];
    const slides = cue.slides || [cue.beat - 1];
    const prev = k ? grabs[k - 1].beat : -Infinity;
    if (beat <= prev + 0.6) continue;
    if (beat >= cue.beat + 0.6) continue;
    out.visible = true;
    out.k = k;
    /* steps: each slide moves the glass a share of the run, the grab the rest */
    const stops = [...slides, cue.beat];
    let pos = 0;
    for (let s = 0; s < stops.length; s += 1) {
      if (beat < stops[s]) break;
      const glide = Math.min(1, (beat - stops[s]) / 0.28);
      const eased = 1 - Math.pow(1 - glide, 3);
      pos = (s + eased) / stops.length;
      if (glide < 1) out.sliding = 1 - glide;
    }
    if (beat >= cue.beat) out.visible = beat < cue.beat + 0.6;
    out.x = COUNTER.from + (COUNTER.to - COUNTER.from) * Math.min(1, pos);
    return out;
  }
  return out;
}

/* until which beat a grab's readouts stay up: the next grab's first slide,
   or (the last grab) until the totals land */
export function readoutUntil(chart, cueId) {
  const grabs = chart?.cues || [];
  const next = grabs[cueId + 1];
  if (next) return (next.slides || [next.beat])[0];
  return (chart?.bars || 8) * BEATS_PER_BAR;
}

/* the bartender's pose at a beat: a slide on each slide beat, a cheer once
   the totals are in, else idle */
export function bartenderPose(chart, beat, { revealed = false } = {}) {
  if (revealed) return "cheer";
  for (const cue of chart?.cues || []) for (const slide of cue.slides || []) if (beat >= slide && beat < slide + 0.45) return "slide";
  return "idle";
}

/* everyone at the bar: one line-up along the front of the counter, so each
   rider's readout stands right over them (the slots alternate two heights
   when they are close) and every name sits under its own tube:
   { [i]: { x, y, scale, row } } */
export const BAR_LINE = Object.freeze({ y:940, lo:130, hi:1790, maxSpacing:300 });
export function barLayout(players = []) {
  const list = players.filter(i => Number.isInteger(i));
  const out = {};
  const n = list.length;
  if (!n) return out;
  const spacing = n > 1 ? Math.min(BAR_LINE.maxSpacing, (BAR_LINE.hi - BAR_LINE.lo) / (n - 1)) : 0;
  const scale = Math.max(0.3, Math.min(0.62, (spacing || BAR_LINE.maxSpacing) / 360));
  const start = (BAR_LINE.lo + BAR_LINE.hi) / 2 - (spacing * (n - 1)) / 2;
  list.forEach((i, k) => { out[i] = { x:start + k * spacing, y:BAR_LINE.y, scale, row:0 }; });
  return out;
}

/* who drinks, as the room says once the last grab is in (null before) */
export const drinkersOf = lastCall => (Array.isArray(lastCall?.worst) ? lastCall.worst : null);

/* the beat the sound lands its who-drinks sting on (float/client/sound
   LAST_CALL_BEATS.drinks, beats from the bar's songAt), when the sound
   does not say */
export const VERDICT_BEAT = 28;
/* The verdict as the room shows it (the banner, the totals, the drinker's
   chug, the bartender's cheer): who drinks, once the room has named them
   AND the sound's sting has come, so it is seen as it is heard; null
   before. state: { lastCall, lastCallAt (when `worst` arrived), songAt,
   chart }. */
export function verdictAt(state, now, { beat = VERDICT_BEAT } = {}) {
  const drinkers = drinkersOf(state?.lastCall);
  if (!drinkers || !Number.isFinite(now)) return null;
  const beatMs = state?.chart?.beatMs || 500;
  const sting = Number.isFinite(state?.songAt) ? state.songAt + (Number.isFinite(beat) ? beat : VERDICT_BEAT) * beatMs : -Infinity;
  const arrived = Number.isFinite(state?.lastCallAt) ? state.lastCallAt : -Infinity;
  return now >= Math.max(sting, arrived) ? drinkers : null;
}

/* a total as the TV letters it: seconds to two decimals ("1.24") */
export const totalText = ms => (Number.isFinite(ms) ? (Math.round(ms / 10) / 100).toFixed(2) : "");

/* everyone at the bar: the field, then the riders out, the last out first
   (the room's own order, cup.js barPlayers) */
export const barPlayersOf = room => {
  const field = Array.isArray(room?.field) ? room.field : [];
  const out = Array.isArray(room?.out) ? room.out : [];
  return [...field, ...out.slice().reverse()].filter(i => Number.isInteger(i));
};

export { LAST_CALL };
