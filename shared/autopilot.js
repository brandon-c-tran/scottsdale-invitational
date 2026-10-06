/* The autopilot: the writes the weekend makes on its own clock, so the
   commissioner is not tapping through what a timer already decides.

   - A winner scene moves from the podium to the standings, then finishes,
     and the TV settles back to the board.
   - Where and When reveals a photo when its minute is up (or as soon as
     every player has locked in), holds the reveal, then puts up the next
     photo; after the last one it posts the result.
   - Trivia does the same per question, with the scores between rounds.

   `autoBeat(state)` is the one source: the next write the server owes, as
   { at, from, type, payload, key }, or null (`from` is when the wait
   began, for drawing it; it may be missing). The Durable Object's alarm runs it
   through the ordinary reducer with a commissioner context (actionId = key,
   so a retried beat is a no-op), and every phone can read the same answer
   to draw how long a beat has left. Each beat is the same action the
   director pill offers, so a tap simply takes it early.

   The commissioner can hold the autopilot (state.autopilot.hold): nothing
   moves on its own until it is released, and the pill offers every beat by
   hand. Pure. */
import { isActivePlayer, isAbsent, rosterOf } from "./core.js";
import { sceneAutoBeat, autopilotHeld } from "./show.js";
import { GEO_GRACE_MS, geoCurrentId, geoLastRound, geoPlayers } from "./geo.js";
/* trivia exports triviaAutoBeat; read through the namespace so a build
   without it simply has no trivia beats */
import * as trivia from "./trivia.js";

/* a photo's reveal: the pins drop and the lines run in about three seconds,
   then every phone counts its score; the room needs the rest to react */
export const GEO_REVEAL_HOLD_MS = 14 * 1000;
/* everyone locked in early: a breath before the reveal, so the last lock
   lands on every screen first */
export const AUTO_ALL_IN_MS = 1500;

export { autopilotHeld };

export function geoAutoBeat(state) {
  const geo = state?.geo;
  if (!geo?.order || geo.finishedAt || state.results?.[geo.eventId]) return null;
  const roundId = geoCurrentId(geo);
  if (geo.phase === "guess") {
    const deadline = Number(geo.closesAt) + GEO_GRACE_MS;
    const players = geoPlayers(state, rosterOf(state), { isActivePlayer:id => isActivePlayer(id, state), isAway:isAbsent });
    const guesses = geo.guesses?.[roundId] || {};
    const allIn = players.length > 0 && players.every(player => guesses[player]?.done);
    const at = allIn
      ? Math.min(deadline, Math.max(...players.map(player => Number(guesses[player].at) || 0)) + AUTO_ALL_IN_MS)
      : deadline;
    return { at, from:Number(geo.startedAt) || null, type:"geoReveal", payload:{ roundId },
      key:`geo:${geo.eventId}:${geo.startedAt}:${roundId}:reveal` };
  }
  const shownAt = Number(geo.revealedAt) || Number(geo.closesAt) || 0;
  if (geo.phase === "reveal" && !geoLastRound(geo))
    return { at:shownAt + GEO_REVEAL_HOLD_MS, from:shownAt, type:"geoNext", payload:{ roundId },
      key:`geo:${geo.eventId}:${geo.startedAt}:${roundId}:next` };
  /* the last photo's reveal, or a game already moved to done */
  return { at:shownAt + GEO_REVEAL_HOLD_MS, from:shownAt, type:"geoFinish", payload:{ evId:geo.eventId },
    key:`geo:${geo.eventId}:${roundId}:finish` };
}

/* The next write the server owes on its own, the earliest first. Scene
   beats exist only when Show Control is on. */
export function autoBeat(state, { showControl = false } = {}) {
  if (!state || autopilotHeld(state)) return null;
  const beats = [
    showControl ? sceneAutoBeat(state) : null,
    geoAutoBeat(state),
    trivia.triviaAutoBeat?.(state) || null,
  ].filter(beat => beat && Number.isFinite(beat.at));
  if (!beats.length) return null;
  return beats.reduce((first, beat) => beat.at < first.at ? beat : first);
}
