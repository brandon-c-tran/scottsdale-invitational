/* Comebacks, as every surface reads them (v3.1). Pure: the rules live in
   shared/core.js (oddsFor, seedBracket); this says what to letter, so the
   phone, the TV and the pill agree. */
import { contestSideMults } from "../../../shared/core.js";

/* the payout copy, always this shape */
export const payLine = mult => `Winner pays ${Number(mult) || 1}:1`;

/* Per side: what it pays when the contest carries underdog odds. */
export function contestTerms(state, contest) {
  if (!contest) return null;
  const mults = contestSideMults(contest);
  const odds = !!contest.odds;
  const wide = (contest.sides || []).length > 2;
  const sides = {};
  for (const side of contest.sides || []) {
    sides[side.key] = {
      size:side.players.length,
      each:side.players.length > 1,
      mult:mults[side.key],
      payLine:odds ? payLine(mults[side.key]) : null,
      underdog:odds && contest.odds.underdog === side.key,
    };
  }
  return { odds, wide, sides, any:odds };
}
