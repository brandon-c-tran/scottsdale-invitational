/* Team MVP: who votes, how a vote closes, and what each viewer may see.
   The record and its derived payout live in core (state.mvp, mvpAwards,
   MVP_PTS). Pure: no storage, no clock beyond what it is given.

   - Opens in the write that posts an event result whose first place is a
     team of MVP_MIN_TEAM or more (worker/actions.js saveResult).
   - Every winning teammate who is not away votes one teammate, never
     themself, and may change the vote until it closes.
   - Closes when every voter has voted, when the commissioner closes it, or
     at `closesAt` (the Durable Object's alarm). Most votes wins; a tie is
     drawn among the tied, and no votes at all draws the whole team.
   - Per-voter answers never leave the server: a viewer gets their own vote
     back and the turnout; the counts appear only once it closes, when the
     answers are deleted. */

import { MVP_MIN_TEAM, MVP_WINDOW_MS, isActivePlayer, isAway, mvpOpen, mvpStands } from "./core.js";

export { MVP_MIN_TEAM, MVP_WINDOW_MS, mvpOpen, mvpStands };

export const MVP_HOW = Object.freeze(["votes", "tie", "none"]);

/* the teammates who vote: everyone on the winning team who is not away */
export const mvpVoters = (state, record) =>
  (record?.team || []).filter(player => isActivePlayer(player) && !isAway(state, player));

export const mvpNeedsVote = team => Array.isArray(team) && team.length >= MVP_MIN_TEAM;

export function newMvpRecord(team, now) {
  return { id:`mvp-${now}`, team:[...team], openedAt:now, closesAt:now + MVP_WINDOW_MS, votes:{} };
}

export function mvpTally(record) {
  const tally = {};
  for (const pick of Object.values(record?.votes || {})) tally[pick] = (tally[pick] || 0) + 1;
  return tally;
}

/* the winner and how it was reached; `random` returns [0, 1) */
export function decideMvp(record, random = Math.random) {
  const team = record?.team || [];
  const tally = mvpTally(record);
  const top = Math.max(0, ...Object.values(tally));
  const leaders = top > 0 ? team.filter(player => tally[player] === top) : [...team];
  const pick = leaders[Math.min(leaders.length - 1, Math.floor(random() * leaders.length))] || null;
  return { winner:pick, tally, how:top === 0 ? "none" : leaders.length > 1 ? "tie" : "votes" };
}

export const everyoneVoted = (state, record) => {
  const voters = mvpVoters(state, record);
  return voters.length > 0 && voters.every(player => record.votes?.[player]);
};

/* open votes whose time is up */
export const mvpDue = (state, now) => Object.keys(state?.mvp || {})
  .filter(evId => mvpOpen(state, evId) && Number(state.mvp[evId].closesAt) <= now);

/* the earliest time an open vote closes by itself, or null */
export function nextMvpDeadline(state) {
  const times = Object.keys(state?.mvp || {}).filter(evId => mvpOpen(state, evId))
    .map(evId => Number(state.mvp[evId].closesAt)).filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

/* the most recently closed MVP that still stands */
export function latestMvp(state) {
  let best = null;
  for (const [eventId, record] of Object.entries(state?.mvp || {})) {
    if (!record?.closedAt || !record.winner || !mvpStands(state, eventId)) continue;
    if (!best || Number(record.closedAt) > Number(best.closedAt)) best = { eventId, ...record };
  }
  return best;
}

/* a player's standing MVPs, newest first */
export const mvpsOf = (state, player) => Object.entries(state?.mvp || {})
  .filter(([eventId, record]) => record?.winner === player && record.closedAt && mvpStands(state, eventId))
  .map(([eventId, record]) => ({ eventId, at:Number(record.closedAt) }))
  .sort((left, right) => right.at - left.at);

/* What a frame carries. Nobody sees another player's vote; a voter gets
   their own back as `mine`, and everyone gets the turnout. */
export function projectMvp(map, { player = null } = {}) {
  const out = {};
  for (const [evId, record] of Object.entries(map || {})) {
    if (!record || typeof record !== "object") continue;
    const { votes, ...rest } = record;
    out[evId] = {
      ...rest,
      voted:Object.keys(votes || {}).length,
      ...(player && votes?.[player] ? { mine:votes[player] } : {}),
    };
  }
  return out;
}
