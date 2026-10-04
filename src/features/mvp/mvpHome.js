/* Home's team MVP row, as data. Only the winning team sees it: the vote
   while it is open, then its MVP for a while after. Pure. */
import { mvpOpen, mvpStands, mvpVoters } from "../../../shared/mvp.js";

/* how long the team keeps the MVP line on Home once the vote closes (the
   MVP's own receipt and the TV card already carry the moment) */
export const MVP_RESULT_MS = 2 * 60 * 1000;

export function mvpHomeModel(state, me, events = [], now = Date.now()) {
  if (!me) return null;
  const nameOf = evId => events.find(event => event.id === evId)?.name || "Team MVP";
  let result = null;
  for (const [evId, record] of Object.entries(state?.mvp || {})) {
    if (!record?.team?.includes(me)) continue;
    if (mvpOpen(state, evId)) {
      const voters = mvpVoters(state, record);
      return { kind:"vote", evId, name:nameOf(evId), picks:record.team.filter(player => player !== me),
        mine:record.mine || null, voted:Number(record.voted) || 0, voters:voters.length,
        canVote:voters.includes(me), closesAt:Number(record.closesAt) || 0 };
    }
    const closedAt = Number(record.closedAt) || 0;
    if (!closedAt || !record.winner || !mvpStands(state, evId) || now - closedAt > MVP_RESULT_MS) continue;
    if (!result || closedAt > result.closedAt)
      result = { kind:"result", evId, name:nameOf(evId), winner:record.winner, you:record.winner === me, closedAt,
        votes:Number(record.tally?.[record.winner]) || 0, how:record.how || "votes" };
  }
  return result;
}
