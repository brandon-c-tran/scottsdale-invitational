/* X1 + M2/M3: the pure half of the live table. Chip bars and the board's
   motion schedule. Nothing here is stored or reaches the server. */


/* The bar scale: the leader's stack, never under 2,000 so the opening 1,000
   reads as half a bar rather than a full one. */
export const BAR_FLOOR = 2000;
export function barScale(standings = []) {
  const top = Math.max(0, ...standings.map(row => Number(row?.pts) || 0));
  return Math.max(BAR_FLOOR, top);
}

/* One player's bar, as percentages of the scale: one continuous run of
   chips held, then chips riding on bets, then duel antes, both drawn as
   outlines at the end of the bar so what is at risk is what would leave it. */
export function chipBar({ pts = 0, scale = BAR_FLOOR, bets = 0, duels = 0 } = {}) {
  const total = Math.max(0, Number(pts) || 0);
  const riskBets = Math.min(Math.max(0, bets), total);
  const riskDuels = Math.min(Math.max(0, duels), total - riskBets);
  const pct = n => Math.min(100, (n / Math.max(1, scale)) * 100);
  return { held:pct(total - riskBets - riskDuels), bets:pct(riskBets), duels:pct(riskDuels) };
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
