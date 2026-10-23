/* The win song picker, as data: the clock, where a start point may sit,
   and the window the room will hear. Pure. */
import { WIN_SONG_CLIP_MS } from "../../../shared/audio.js";

export const SEARCH_DEBOUNCE_MS = 350;
export const SEARCH_MIN = 2;
export const NUDGE_MS = 5000;

export function songClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* the last start that still leaves a second of song, as the server clamps */
export const maxStart = track => Math.max(0, (Number(track?.durationMs) || 0) - 1000);

export const clampStart = (track, ms) => Math.min(maxStart(track), Math.max(0, Math.round((Number(ms) || 0) / 1000) * 1000));

/* what the room hears when this song plays for a win */
export function clipWindow(track) {
  const from = clampStart(track, track?.startMs);
  const to = Math.min(Number(track?.durationMs) || 0, from + WIN_SONG_CLIP_MS);
  return { from, to, text:`Plays ${songClock(from)} to ${songClock(to)}` };
}

/* Home's line for a player in the contest on screen whose side is just
   them (a 1v1, a free-for-all), the one case where a win plays exactly
   their song: { song } when they saved one, { pick:true } when the picker
   is on and they have not, else null. A pair or team draws one member's
   song, so it gets no line. */
export function yourSongLine(state, contest, me, { songs = false } = {}) {
  if (!me || !contest?.players?.includes(me)) return null;
  const side = contest.sides?.find(item => item.players?.includes(me));
  if (!side || side.players.length !== 1) return null;
  const track = state?.profiles?.[me]?.walkoutTrack;
  if (track?.name) return { song:track.name };
  return songs ? { pick:true } : null;
}

/* the search the field holds: trimmed, collapsed, or null below the minimum */
export function searchQuery(text) {
  const query = String(text || "").trim().replace(/\s+/g, " ");
  return query.length >= SEARCH_MIN ? query.slice(0, 80) : null;
}

/* The start point's timeline: a tick every 5 s and a lettered minute, as
   for any pop song, until the song runs long; then the labels step out (2,
   5, 10 or more minutes) so at most START_LABELS stand under the strip,
   never running into each other, and the ticks step out to stay a texture
   (at most START_TICKS), every label on a tall tick. */
export const START_LABELS = 7;
export const START_TICKS = 90;
const LABEL_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 240, 480, 720].map(minutes => minutes * 60000);
const TICK_STEPS = [5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1200000, 3600000];
export function startMarks(durationMs) {
  const duration = Math.max(1000, Number(durationMs) || 0);
  const count = step => Math.floor(duration / step) + 1;
  const label = LABEL_STEPS.find(step => count(step) <= START_LABELS) || LABEL_STEPS[LABEL_STEPS.length - 1];
  const tick = TICK_STEPS.find(step => count(step) <= START_TICKS && label % step === 0) || label;
  return {
    labels:Array.from({ length:count(label) }, (_, i) => i * label),
    ticks:Array.from({ length:count(tick) }, (_, i) => ({ ms:i * tick, major:(i * tick) % label === 0 })),
  };
}
