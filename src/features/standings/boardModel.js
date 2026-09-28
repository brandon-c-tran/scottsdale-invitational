/* X1 + M2/M3: the pure half of the live table. Chip bars and the board's
   motion schedule. Nothing here is stored or reaches the server. */

import { PT } from "../../../shared/core.js";

/* The bar scale: the leader's stack, never under 2,000 so the opening 1,000
   reads as half a bar rather than a full one. */
export const BAR_FLOOR = 2000;
export function barScale(standings = []) {
  const top = Math.max(0, ...standings.map(row => Number(row?.pts) || 0));
  return Math.max(BAR_FLOOR, top);
}

/* One drawn unit is one 100 chip while that stays legible (at most 60
   across the bar); past that a unit is 200, then 500, then 1,000. */
export const MAX_UNITS = 60;
export function barUnit(scale) {
  for (const unit of [PT, 2 * PT, 5 * PT, 10 * PT]) if (scale / unit <= MAX_UNITS) return unit;
  return Math.ceil(scale / MAX_UNITS / (10 * PT)) * 10 * PT;
}

/* The units of one player's bar. The stack reads left to right: chips held,
   then chips riding on bets, then duel antes, both drawn as outlines at the
   end of the bar so what is at risk is what would leave it.
   Returns { slots, unit, cells:[{ x, w, kind:"held"|"bets"|"duels" }] }
   in unit coordinates (the bar is `slots` wide). */
export function chipBar({ pts = 0, scale = BAR_FLOOR, bets = 0, duels = 0, gap = 0.26 } = {}) {
  const unit = barUnit(scale);
  const slots = Math.max(1, Math.ceil(scale / unit));
  const total = Math.max(0, Number(pts) || 0);
  const riskBets = Math.min(Math.max(0, bets), total);
  const riskDuels = Math.min(Math.max(0, duels), total - riskBets);
  const heldEnd = (total - riskBets - riskDuels) / unit, betsEnd = (total - riskDuels) / unit;
  const count = Math.ceil(total / unit - 1e-9);
  const cells = [];
  for (let i = 0; i < count; i++) {
    const w = Math.min(1, total / unit - i);
    if (w <= 0) break;
    const mid = i + w / 2;
    const kind = mid <= heldEnd ? "held" : mid <= betsEnd ? "bets" : "duels";
    cells.push({ x:i, w:Math.max(0.12, w - gap), kind });
  }
  return { slots, unit, cells };
}

/* The board's motion schedule after a fresh change (p1-leaderboard), in ms
   from the frame: count first, then the rows slide, the ranks roll, and the
   arrows and the new leader land last. */
export const BOARD_BEATS = Object.freeze({
  count:150,     // numbers start counting in 100s, the change rises off them
  slide:950,     // rows move to their new rank
  roll:1300,     // rank digits roll once the rows have landed
  rollStagger:16,
  arrows:1500,   // rank-change arrows pop
  leader:1500,   // the new leader's row warms, one sweep under it
  settle:3000,   // everything is at rest
});

/* Which rows move and by how much: { player: { from, to } } in list index,
   only for rows whose index changed. */
export function rowMoves(beforeOrder = [], afterOrder = []) {
  const was = new Map(beforeOrder.map((player, index) => [player, index]));
  const moves = {};
  afterOrder.forEach((player, index) => {
    const from = was.get(player);
    if (from !== undefined && from !== index) moves[player] = { from, to:index };
  });
  return moves;
}

/* The player who alone holds 1st, or null (nobody yet, or a tie). */
export function soleLeader(standings = [], starting = false) {
  if (starting || !standings.length) return null;
  const top = standings.filter(row => row.rank === 1);
  return top.length === 1 ? top[0].player : null;
}
