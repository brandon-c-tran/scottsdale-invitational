/* D2: the face-off, before the bets. When a two-sided contest becomes the
   current contest with betting open (an event's first contest once its
   intro and draw have played on the TV; each later one when the previous
   winner is recorded and it opens in the same write, once the decided
   contest has had its moment), the TV's live scene opens on both sides'
   photo chips, large, slid in from their own edges, with their head-to-head
   when they have met and each side's win line (X8), then settles into the
   betting board after about MOTION.beat. The order in the room is the
   face-off, the bets, the lock. Driven by the game, never by a song. Fresh
   only: a reload, a late TV, a correction, a rehearsal jump or reduced
   motion shows the betting board. Pure model here; the hook latches it. */

import { useEffect, useRef, useState } from "react";
import { allEventsOf, disp } from "../../../shared/core.js";
import { headToHead } from "../profile/seasonStats.js";
import { MOTION, useFreshChange } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { buildEventReveal, drawSequenceMs, revealReady, revealTimeline } from "../weekend/drawReveal.js";
import { TV_ADVANCE_MS, TV_INTRO_AUTO_MS, TV_REVEAL_HOLD_MS, contestSideView } from "./tvModel.js";
import { nextLatch, useTimeline } from "./tvMotion.js";

/* ms from the face-off's start */
export const FACEOFF_TIMING = Object.freeze({
  slide:0, slideMs:560,        // each side slides in from its own edge
  vs:420, vsMs:320,            // VS stamps between them (the room's one beat)
  h2h:760, h2hMs:300,          // their record, when they have met
  lines:900, linesMs:300,      // X8: what a win does
  settle:MOTION.beat, settleMs:400, // it lifts off the betting board
  total:MOTION.beat + 400,
});

/* The contest a face-off belongs to: a two-sided current contest with its
   market open, as "event:contest", else null. */
export const faceOffKey = (ev, contest) => ev && contest?.sides?.length === 2 && contest.phase === "betting-open"
  ? `${ev.id}:${contest.id}` : null;
/* a market that just opened on a new two-sided contest (a first render
   never reports a change, so a reload or a late TV never gets here) */
export const faceOffPlays = (from, to) => !!to && to !== from;

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

/* the write that opened the market and what else it did arrive together */
const SAME_WRITE_MS = 2000;
/* the reveal's steps (its cards, then the crew), as TVDrawReveal counts them */
const revealSteps = reveal => (reveal.versus ? 2 : (reveal.groups || []).length) + (reveal.crew?.length ? 1 : 0);

/* When the face-off starts, on the server clock, the same on every TV: when
   the market opened, but after what that same write put on the TV first.
   The first contest of an announcement waits for the TV's intro and its draw
   reveal to end (the reveal's own server-anchored timeline); a contest opened
   by recording the previous winner waits for that decided contest's moment
   (TV_ADVANCE_MS). */
export function faceOffStart(state, ev) {
  const op = state?.eventOps?.[ev?.id] || {};
  const opened = Number(op.bettingOpenedAt) || 0;
  let start = opened;
  const announced = Number(op.announcedAt) || 0;
  const decided = Number(op.lastContest?.decidedAt) || 0;
  /* the announcement's own market: no contest decided since */
  if (announced && opened && Math.abs(opened - announced) <= SAME_WRITE_MS && !(decided >= announced)) {
    const reveal = revealReady(state, ev.id) ? buildEventReveal(state, ev) : null;
    const line = reveal ? revealTimeline(state, ev.id, { reveal }) : null;
    start = Math.max(start, reveal && line ? line.revealAt + drawSequenceMs(revealSteps(reveal)) + TV_REVEAL_HOLD_MS
      : announced + TV_INTRO_AUTO_MS);
  }
  if (decided && opened && Math.abs(opened - decided) <= SAME_WRITE_MS) start = Math.max(start, decided + TV_ADVANCE_MS);
  return start;
}

/* Something still covering the live pane when the face-off is due (a
   directed scene, a result moment, a TV whose own ceremony runs late)
   would hide it. It waits for the pane to show and plays from that moment;
   past FACEOFF_HOLD_MAX_MS after its start it is dropped. `gate` is the
   hook's memory, { id, at } with at null while waiting and -1 once dropped;
   returns the next memory and the anchor to play from (null: not now). */
export const FACEOFF_HOLD_MAX_MS = 60000;
export function faceOffGate(gate, { id, anchor, covered, now }) {
  if (!id) return { gate:null, anchor:null };
  let next = gate?.id === id ? gate : { id, at:covered ? null : Number(anchor) };
  if (next.at === null && !covered)
    next = { id, at:Number(now) - Number(anchor) <= FACEOFF_HOLD_MAX_MS ? Number(now) : -1 };
  return { gate:next, anchor:next.at > 0 ? next.at : null };
}

/* chip size per side: one player huge, a pair large, a team as a group */
export function faceOffChipSize(count, width = 620) {
  if (count <= 1) return 300;
  const perRow = count <= 4 ? count : Math.ceil(count / 2);
  const size = Math.floor((width - (perRow - 1) * 14) / perRow);
  return Math.max(96, Math.min(count <= 2 ? 230 : count <= 4 ? 160 : 132, size));
}

/* The face-off to draw now for the live contest, or null. `covered`: the
   live pane is under a ceremony or scene right now (faceOffGate). */
export function useFaceOff(state, ev, contest, { covered = false } = {}) {
  const change = useFreshChange(faceOffKey(ev, contest), "tv-contest");
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key:"tv-contest", build:(from, to) => faceOffPlays(from, to)
    ? { anchor:faceOffStart(state, ev), contestId:contest.id, evId:ev.id } : null });
  const moment = latch.current?.moment || null;
  const valid = !!moment && ev?.id === moment.evId && contest?.id === moment.contestId;
  /* a start still ahead: the reveal or the decided contest has the TV */
  const now = serverNow();
  const due = valid && now >= moment.anchor;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!valid || due) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, moment.anchor - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [moment?.id, valid, due]); // eslint-disable-line react-hooks/exhaustive-deps
  const hold = useRef(null);
  const gated = faceOffGate(hold.current, { id:due ? moment.id : null, anchor:moment?.anchor, covered, now });
  hold.current = gated.gate;
  const playFrom = due ? gated.anchor : null;
  const timeline = useTimeline(playFrom !== null ? moment.id : null, playFrom, FACEOFF_TIMING.total);
  return playFrom !== null && timeline.playing ? { ...moment, anchor:playFrom, elapsed:timeline.elapsed } : null;
}
