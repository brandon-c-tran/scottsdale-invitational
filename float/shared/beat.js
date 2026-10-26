/* The beat (float/PROTOCOL.md "The beat"): paddling is judged against the
   race music's pulse. Pure, shared by the phone (instant feedback) and the
   room (the truth), so both call a stroke the same thing. */
import { BAR_MS } from "./tuning.js";

export const BEAT_MS = BAR_MS / 4;
export const WINDOW = Object.freeze({ PERFECT:80, GOOD:160 });

/* streak levels: the count of on-beat strokes in a row each level needs */
export const LEVELS = Object.freeze([
  { level:0, at:0, name:"" },
  { level:1, at:4, name:"Rhythm" },
  { level:2, at:8, name:"Groove" },
  { level:3, at:16, name:"Locked in" },
]);
export const levelOf = streak => {
  let level = 0;
  for (const step of LEVELS) if (streak >= step.at) level = step.level;
  return level;
};
export const levelName = level => LEVELS[level]?.name || "";
/* a level's floor: where a missed beat drops a streak to */
export const levelFloor = level => LEVELS[Math.max(0, level)]?.at ?? 0;

/* thrust per stroke by judgement, and the level's speed */
export const QUALITY_GAIN = Object.freeze({ perfect:1, good:0.8, early:0.4, late:0.4, fast:0.4 });
export const LEVEL_GAIN = Object.freeze([1, 1.08, 1.16, 1.25]);

/* the nearest beat to server time t, and how far off it is */
export function beatAt(t, gun, beatMs = BEAT_MS) {
  if (!Number.isFinite(t) || !Number.isFinite(gun)) return { k:null, d:null };
  const k = Math.round((t - gun) / beatMs);
  return { k, d:Math.round(t - (gun + k * beatMs)) };
}

/* A stroke's judgement from its beat index and offset. `lastBeat` is the
   beat this rider last stroked on the beat (a second stroke in the same
   beat is too fast). Returns { q, onBeat }: q is "perfect", "good",
   "early", "late" or "fast". */
export function judge(k, d, { lastBeat = null } = {}) {
  if (!Number.isInteger(k) || !Number.isFinite(d)) return { q:"late", onBeat:false };
  if (lastBeat !== null && k === lastBeat) return { q:"fast", onBeat:false };
  const off = Math.abs(d);
  if (off <= WINDOW.PERFECT) return { q:"perfect", onBeat:true };
  if (off <= WINDOW.GOOD) return { q:"good", onBeat:true };
  return { q:d < 0 ? "early" : "late", onBeat:false };
}

/* the whole judgement of a stroke at server time t */
export function judgeStroke(t, gun, options = {}) {
  const { k, d } = beatAt(t, gun);
  return { k, d, ...judge(k, d, options) };
}

/* where a beat pulse is at server time t: 0 on the beat, rising to 1 */
export const beatPhase = (t, gun, beatMs = BEAT_MS) =>
  Number.isFinite(t) && Number.isFinite(gun) ? (((t - gun) % beatMs) + beatMs) % beatMs / beatMs : 0;
