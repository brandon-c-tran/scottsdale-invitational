/* The Walkout (Backglass signature moment 1). When a win song starts on the
   speaker (state.showControl.audio.walkout, written only by the Worker, an
   `auto` record), the TV and the winner's own phone take over for about nine
   seconds: their identity color floods out from their chip, the album art
   and their photo stand huge, the name stamps in marquee lettering as the clip
   fades in (startedAt on the server clock), the lamps chase in their
   color, and the TV docks it into the Now playing strip. A pair's or a
   team's win walks out as the team (walkoutTeam.js): its name, every
   member's chip, its color, the song credited to the one whose pick it is,
   on the TV and on every teammate's phone. The crown plays its own sequence over the champion's song,
   so a frozen board never walks out.

   Pure model here; the hook latches it on a fresh frame only, so a reload,
   a reconnect, a catch-up or a song already running shows the strip. */

import { useEffect, useRef, useState } from "react";
import { walkoutOf } from "../../../shared/audio.js";
import { useFreshChange } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { nextLatch, useTimeline } from "../tv/tvMotion.js";
import { latestResultOf, podiumBeatAt } from "../tv/tvModel.js";
import { walkoutReaches, walkoutTeam } from "./walkoutTeam.js";

export { teamColorPlayer, teamRows, walkoutReaches, walkoutTeam } from "./walkoutTeam.js";

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

/* the record a takeover keys on: an automatic win song on a live board */
export function walkoutKey(state) {
  const walkout = walkoutOf(state);
  if (!walkout?.auto || !walkout.player || state?.frozen) return null;
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
   WALKOUT_TIMING.total later. useTvWalkout plays it from this anchor; a
   gag its win owes (features/gags) and the next face-off (faceOff.js)
   wait for its end. Null without an automatic win song on a live board. */
export function walkoutSpan(state, events = []) {
  const walkout = walkoutOf(state);
  if (!walkout?.auto || !walkout.player || state?.frozen) return null;
  const hold = Number(podiumHoldUntil(state, events, walkout.player, walkout.startedAt)) || 0;
  const anchor = Math.max(walkout.startedAt, hold);
  return { player:walkout.player, startedAt:walkout.startedAt, anchor, end:anchor + WALKOUT_TIMING.total };
}
/* a win song starts once its write is broadcast, when the speaker answers:
   a second or two, a slow speaker a few */
export const WALKOUT_OF_WRITE_MS = 6000;
/* what waits for a walkout takes the room this long after it leaves */
export const WALKOUT_CLEAR_MS = 300;
/* The walkout a write started: an automatic win song for one of that
   write's winners (`players`), begun within WALKOUT_OF_WRITE_MS after the
   write (`at`). An earlier win's song, or someone else's, is not it. */
export function walkoutForWrite(state, events, { at, players = [] } = {}) {
  const span = walkoutSpan(state, events);
  if (!span || !(players || []).includes(span.player)) return null;
  const lag = span.startedAt - Number(at);
  return lag >= -1000 && lag <= WALKOUT_OF_WRITE_MS ? span : null;
}
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

/* The takeover to draw now, or null. `delayTo` (server ms) holds the start
   back, e.g. until the TV's podium has turned 1st place; the clip has begun
   by then, so the stamp lands on the reveal instead. `forPlayer` limits it
   to one player's own phone: the singer's, or a teammate's on a team win. */
export function useWalkoutMoment(state, events, { forPlayer = null, delayTo = null, total = WALKOUT_TIMING.total } = {}) {
  const key = walkoutKey(state);
  const change = useFreshChange(key, "walkout");
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key:"walkout", build:(from, to) => {
    const view = walkoutView(state, events);
    if (!view || (forPlayer && !walkoutReaches(view, forPlayer))) return null;
    if (!walkoutPlays({ from, to, startedAt:view.startedAt, now:serverNow() })) return null;
    const anchor = Math.max(view.startedAt, Number(delayTo) || 0);
    return { ...view, key:to, anchor };
  } });
  const moment = latch.current?.moment || null;
  const valid = !!moment && moment.key === key;
  /* a start still ahead (held for the podium) waits for its instant */
  const due = valid && serverNow() >= moment.anchor;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!valid || due) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, moment.anchor - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [moment?.id, valid, due]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useTimeline(due ? moment.id : null, moment?.anchor, total);
  return due && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}
