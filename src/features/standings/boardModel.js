/* X1 + M2/M3: the pure half of the live table. Chip bars and the board's
   motion schedule. Nothing here is stored or reaches the server. */


/* The bar scale: the leader's stack, never under 2,000 so the opening 1,000
   reads as half a bar rather than a full one. */
export const BAR_FLOOR = 2000;
export function barScale(standings = []) {
  const top = Math.max(0, ...standings.map(row => Number(row?.pts) || 0));
  return Math.max(BAR_FLOOR, top);
}

/* The bar's notches: one per 100 (one physical chip) while they stand
   comfortably apart, then one per 500, per 1,000, per 5,000, so the bar
   reads as a solid run of the player's color at any scale instead of
   washing out into stripes. NOTCH_MIN_PCT is the closest two notches stand
   as a share of the track (4% of a ~150px bar is 6px, the 1.5px notch a
   quarter of it). Null when even the coarsest would crowd (never in play). */
export const NOTCH_STEPS = Object.freeze([100, 500, 1000, 5000]);
export const NOTCH_MIN_PCT = 4;
export function chipNotch(scale = BAR_FLOOR) {
  const s = Math.max(1, Number(scale) || BAR_FLOOR);
  const step = NOTCH_STEPS.find(n => (n / s) * 100 >= NOTCH_MIN_PCT);
  return step ? { step, pct:(step / s) * 100 } : null;
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
