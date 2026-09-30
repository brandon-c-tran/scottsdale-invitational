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

/* the search the field holds: trimmed, collapsed, or null below the minimum */
export function searchQuery(text) {
  const query = String(text || "").trim().replace(/\s+/g, " ");
  return query.length >= SEARCH_MIN ? query.slice(0, 80) : null;
}
