/* The Walkout's pure model (moments/walkout.js holds the hook that plays
   it): what the takeover shows, when it takes the room and what waits for
   it. Pure, so the moment model (features/gags/gagModel.js) and the Worker
   that times a win song to a bit read the same windows.

   A win song timed to a bit's beat (walkout.bit, Oct 14) plays no
   takeover: the bit is the moment, the song comes in on its beat, and the
   Now playing strip carries the rest of it. */

import { walkoutOf } from "../../../shared/audio.js";
import { latestResultOf, podiumBeatAt } from "../tv/tvModel.js";
import { walkoutTeam } from "./walkoutTeam.js";

/* ms from the walkout's anchor (the song's start on the server clock) */
export const WALKOUT_TIMING = Object.freeze({
  flood:0, floodMs:800,        // their color floods out from their chip
  art:250, artMs:520,          // the album art and their photo stand up
  stamp:700, stampMs:360,      // the name stamps as the song fades in; the stinger
  sub:1100, subMs:400,         // the song and artist
  dock:8400, dockMs:700,       // it docks into the Now playing strip
  total:9100,
});
/* a song this far along when the frame lands plays no takeover */
export const WALKOUT_JOIN_MS = 2500;

/* the record a takeover keys on: an automatic win song on a live board
   that no bit carries */
export function walkoutKey(state) {
  const walkout = walkoutOf(state);
  if (!walkout?.auto || !walkout.player || walkout.bit || state?.frozen) return null;
  return `${walkout.player}:${walkout.startedAt}`;
}

/* What the takeover shows for the stored record, or null. */
export function walkoutView(state, events = []) {
  const walkout = walkoutOf(state);
  if (!walkout?.player) return null;
  const saved = state?.profiles?.[walkout.player]?.walkoutTrack || null;
  const track = saved && (!walkout.trackId || saved.trackId === walkout.trackId)
    ? { name:saved.name, artists:(saved.artists || []).join(", "), imageUrl:saved.imageUrl || null } : null;
  return { player:walkout.player, startedAt:walkout.startedAt, until:walkout.until, track,
    team:walkoutTeam(state, events, walkout) };
}

/* A free-for-all posts its podium 3rd, 2nd, 1st; its winner's song starts
   with the write. The walkout holds until 1st has turned on the podium,
   so the song never tells the room before the podium does. */
export function podiumHoldUntil(state, events, player, startedAt) {
  const latest = latestResultOf(state, events);
  const res = latest?.res;
  if (!res || res.stacks || !(res.slots?.[0] || []).includes(player)) return null;
  const posted = Number(res.confirmedAt || res.ts) || 0;
  if (!posted || Math.abs(Number(startedAt) - posted) > 15000) return null;
  const places = Math.min(3, (res.slots || []).filter(slot => slot?.length).length);
  return posted + podiumBeatAt(Math.max(0, places - 1)) + 600;
}

/* ── what waits for a walkout ──
   The walkout's window on the TV, from the stored record alone, so every
   TV and everything that waits for it agree: it takes the room at its
   anchor (the song's start, held for a free-for-all's podium) and leaves
   WALKOUT_TIMING.total later. useTvWalkout plays it from this anchor; the
   next face-off (faceOff.js) waits for its end. Null without an automatic
   win song on a live board, or for one a bit carries (no takeover). */
export function walkoutSpan(state, events = []) {
  const walkout = walkoutOf(state);
  if (!walkout?.auto || !walkout.player || walkout.bit || state?.frozen) return null;
  const hold = Number(podiumHoldUntil(state, events, walkout.player, walkout.startedAt)) || 0;
  const anchor = Math.max(walkout.startedAt, hold);
  return { player:walkout.player, startedAt:walkout.startedAt, anchor, end:anchor + WALKOUT_TIMING.total };
}
/* what waits for a walkout takes the room this long after it leaves */
export const WALKOUT_CLEAR_MS = 300;
/* A takeover due at `start` while a walkout already holds the room plays
   once it has left; one due before the walkout began keeps its time. */
export const afterWalkout = (span, start) =>
  span && span.anchor <= start && start < span.end ? span.end + WALKOUT_CLEAR_MS : start;

/* Whether a fresh step to `to` starts a takeover now. */
export function walkoutPlays({ from, to, startedAt, now }) {
  if (!to || to === from) return false;
  const start = Number(startedAt);
  return Number.isFinite(start) && Number(now) - start <= WALKOUT_JOIN_MS;
}
