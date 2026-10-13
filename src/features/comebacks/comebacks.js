/* What each side of a contest pays, as every surface reads it, so the
   phone, the TV and the pill agree. Pure: the rules live in shared/core.js
   (the pool since Oct 13: contestPool, priceText; a contest opened before
   pools keeps its fixed payout, contestSideMults and its stored odds). */
import { POOL_CAP, UPSET_PRICE, contestPool, contestSideMults, priceText } from "../../../shared/core.js";

/* a fixed payout's copy, always this shape (legacy contests only) */
export const payLine = mult => `Winner pays ${Number(mult) || 1}:1`;

/* Per side, in the contest's own keys:
   - a pool: its price now (the price it settles at once betting locks),
     "3.4×", whether it is the long shot (the board's longest price, an
     upset if it wins) and its share of the pool;
   - a legacy contest with underdog odds: its fixed payout line. */
export function contestTerms(state, contest) {
  if (!contest) return null;
  const wide = (contest.sides || []).length > 2;
  const pool = contestPool(state, contest);
  if (pool) {
    const sides = {};
    for (const side of pool.sides) {
      const share = pool.total > 0 ? (side.seed + side.stake) / pool.total : 0;
      sides[side.key] = {
        size:(contest.sides.find(item => item.key === side.key)?.players || []).length,
        price:side.price, text:priceText(side.price), stake:side.stake, bettors:side.bettors, share,
        /* a matchup's long shot lights; a wide board's unbacked sides all
           sit at the cap, so none lights there (the cap reads dim instead) */
        long:!wide && side.key === pool.longshot && side.price >= UPSET_PRICE,
        cap:side.price >= POOL_CAP,
        favorite:side.key === pool.favorite && !wide,
      };
    }
    return { pool:true, odds:true, any:true, wide, sides, total:pool.total, staked:pool.staked,
      longshot:pool.longshot, favorite:pool.favorite };
  }
  const mults = contestSideMults(contest);
  const odds = !!contest.odds;
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
  return { pool:false, odds, wide, sides, any:odds };
}

/* the long shot by name, when the board has one: "Eyob & Ben 4.2×" */
export function longshotLine(terms, nameOf) {
  if (!terms?.pool || terms.longshot === null || terms.longshot === undefined) return null;
  const side = terms.sides[terms.longshot];
  return side?.long ? `${nameOf(terms.longshot)} ${side.text}` : null;
}
