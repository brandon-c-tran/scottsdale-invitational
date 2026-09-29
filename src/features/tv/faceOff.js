/* D2: the face-off at lock. When the commissioner locks and starts a
   two-sided contest, the TV's live scene opens on both sides' photo chips,
   large, slid in from their own edges, with their head-to-head when they
   have met and each side's win line (X8), then settles into the normal
   UP NOW layout after about MOTION.beat. Driven by the game (the lock),
   never by a song. Fresh only: a reload, a late TV, a correction or reduced
   motion shows the normal layout. Pure model here; the hook latches it. */

import { useRef } from "react";
import { allEventsOf, disp } from "../../../shared/core.js";
import { headToHead } from "../profile/seasonStats.js";
import { MOTION, useFreshChange } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { contestSideView } from "./tvModel.js";
import { nextLatch, useTimeline } from "./tvMotion.js";

/* ms from the lock */
export const FACEOFF_TIMING = Object.freeze({
  slide:0, slideMs:560,        // each side slides in from its own edge
  vs:420, vsMs:320,            // VS stamps between them
  h2h:760, h2hMs:300,          // their record, when they have met
  lines:900, linesMs:300,      // X8: what a win does
  settle:MOTION.beat, settleMs:400, // it lifts off the normal layout
  total:MOTION.beat + 400,
});

/* only the lock itself: a market that was open (or locked) starting play */
export const faceOffPlays = (from, to) => (from === "betting-open" || from === "betting-locked") && to === "in-progress";

/* "Chiang leads 2-1", "Tied 1-1", or null when they have never met. Only a
   one-on-one has a record; teams change from game to game. */
export function faceOffRecord(state, sides, events = allEventsOf(state)) {
  if (sides?.length !== 2 || sides.some(side => side.players?.length !== 1)) return null;
  const [a, b] = sides.map(side => side.players[0]);
  const record = headToHead(state, a, b, events);
  if (record.won + record.lost === 0) return null;
  if (record.won === record.lost) return `Tied ${record.won}-${record.lost}`;
  const [leader, high, low] = record.won > record.lost ? [a, record.won, record.lost] : [b, record.lost, record.won];
  return `${disp(state, leader)} leads ${high}-${low}`;
}

/* What the face-off shows for a contest, or null for anything but two sides */
export function faceOffView(state, ev, contest, events = allEventsOf(state)) {
  if (!ev || !contest || contest.sides?.length !== 2) return null;
  const sides = contest.sides.map(side => ({ key:side.key, ...contestSideView(state, ev, contest, side) }));
  if (sides.some(side => !side.players?.length)) return null;
  return { contestId:contest.id, label:contest.kind === "match" || contest.label !== ev.name ? contest.label : null,
    event:ev.name, sides, record:faceOffRecord(state, sides, events) };
}

/* the lock's own write time when this frame carries it, else now */
export function faceOffAnchor(state, ev, now) {
  const op = state?.eventOps?.[ev?.id] || {};
  const at = Math.max(Number(op.bettingLockedAt) || 0, Number(op.startedAt) || 0);
  return at > 0 && now - at >= -2000 && now - at < FACEOFF_TIMING.total ? at : now;
}

/* chip size per side: one player huge, a pair large, a team as a group */
export function faceOffChipSize(count, width = 620) {
  if (count <= 1) return 300;
  const perRow = count <= 4 ? count : Math.ceil(count / 2);
  const size = Math.floor((width - (perRow - 1) * 14) / perRow);
  return Math.max(96, Math.min(count <= 2 ? 230 : count <= 4 ? 160 : 132, size));
}

/* The face-off to draw now for the live contest, or null. */
export function useFaceOff(state, ev, contest) {
  const two = contest?.sides?.length === 2;
  const key = ev && contest && two ? `${ev.id}:${contest.id}` : null;
  const change = useFreshChange(key ? contest.phase : null, key);
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key, build:(from, to) => faceOffPlays(from, to)
    ? { anchor:faceOffAnchor(state, ev, serverNow()), contestId:contest.id } : null });
  const moment = latch.current?.moment || null;
  const valid = !!moment && contest?.id === moment.contestId && contest.phase === "in-progress";
  const timeline = useTimeline(valid ? moment.id : null, moment?.anchor, FACEOFF_TIMING.total);
  return valid && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}
