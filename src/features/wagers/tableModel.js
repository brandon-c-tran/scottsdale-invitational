/* The table (Oct 13, "your seat at the table"): every betting screen, on a
   phone or the TV, draws the current contest as one felt with a printed
   spot per side. Pure: what each spot shows, from the pool (shared/core.js
   contestPool) and the open stacks (betStacks.js contestStacks).

   Odds are split by job: a spot's % is the room's belief (its share of the
   pool, the bank's seed included), drawn as an amber fill rising in the
   spot; what a chip pays rides the chip ("200 → 680": what comes back,
   stake included). A contest opened before pools keeps its fixed payout and
   shares by the money alone. */
import { POOL_MIN, UPSET_PRICE, PT, contestMult, contestPool, poolNet, poolPrice } from "../../../shared/core.js";
import { contestStacks } from "./betStacks.js";

/* the layouts: a matchup is two big spots, three to six sides one row,
   seven or more a grid: on the TV, GRID_COLS a row (13 is 7 + 6); the
   phone lays a grid three a row (table.css) */
export const GRID_COLS = 7;
export const tableShape = count => count <= 2 ? "match" : count <= 6 ? "row" : "grid";
export const gridRows = (count, cols = GRID_COLS) => Math.max(1, Math.ceil(count / cols));

/* whole percents that add to 100 (largest remainder); all zero with no money */
export function sharePcts(shares = []) {
  const total = shares.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  if (!(total > 0)) return shares.map(() => 0);
  const raw = shares.map(value => Math.max(0, Number(value) || 0) / total * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, i) => [value - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; floors[i] += 1; left -= 1; }
  return floors;
}

/* What comes back on a win: the stake plus what it nets. A pool prices the
   stake into its own side first (your chip moves the price it is paid at);
   a legacy contest pays its fixed multiple. */
export function returnOn(spot, table, stake) {
  const s = Math.max(0, Number(stake) || 0);
  if (!(s > 0) || !spot) return 0;
  if (!table?.pool) return s * (1 + (spot.mult || 1));
  const price = poolPrice(table.total + s, spot.money + s);
  return s + poolNet(s, price);
}
/* your chips on a spot and what they bring back at its price now */
export const mineBack = spot => spot && spot.mine > 0 ? spot.mine + (spot.pool ? poolNet(spot.mine, spot.price) : spot.mine * (spot.mult || 1)) : 0;
/* the next chip you drop: your chips plus it, priced together */
export function nextBack(spot, table, stake) {
  if (!spot) return 0;
  const s = Math.max(0, Number(stake) || 0);
  if (!table?.pool) return (spot.mine + s) * (1 + (spot.mult || 1));
  const both = spot.mine + s;
  if (!(both > 0)) return 0;
  /* your chips already ride in the side's money; only the new one adds */
  const price = poolPrice(table.total + s, spot.money + s);
  return both + poolNet(both, price);
}

/* The table for one contest, from `me`'s seat. */
export function tableView(state, events, contest, me = null) {
  if (!contest) return null;
  const pool = contestPool(state, contest);
  const stacks = contestStacks(state, events, contest);
  const raw = (contest.sides || []).map(side => {
    const ride = stacks.get(side.key) || { stacks:[], total:0 };
    const priced = pool?.sides.find(item => item.key === side.key) || null;
    const seed = priced?.seed || 0;
    const money = seed + (priced ? priced.stake : ride.total);
    const mult = pool ? null : contestMult(contest, side.key);
    const mine = ride.stacks.filter(item => item.player === me).reduce((sum, item) => sum + item.stake, 0);
    return { key:side.key, players:side.players, stacks:ride.stacks, staked:ride.total, seed, money, mine, mult,
      pool:!!pool, price:pool ? priced?.price ?? pool.price(side.key) : (mult || 1) + 1,
      bettors:ride.stacks.length };
  });
  const pcts = sharePcts(raw.map(spot => spot.money));
  const total = pool ? pool.total : raw.reduce((sum, spot) => sum + spot.money, 0);
  const prices = raw.map(spot => spot.price);
  const longIndex = prices.length ? prices.indexOf(Math.max(...prices)) : -1;
  const spots = raw.map((spot, i) => ({
    ...spot,
    pct:pcts[i],
    share:total > 0 ? spot.money / total : 0,
    /* a matchup's or a row's long shot lights; a grid's quiet spots all sit long */
    long:!!pool && tableShape(raw.length) !== "grid" && i === longIndex && spot.price >= UPSET_PRICE,
    back:0,
  }));
  spots.forEach(spot => { spot.back = mineBack(spot); });
  return {
    contestId:contest.id, kind:contest.kind, shape:tableShape(spots.length), pool:!!pool,
    total:Math.round(total), staked:raw.reduce((sum, spot) => sum + spot.staked, 0), spots,
    mine:spots.find(spot => spot.mine > 0)?.key ?? null,
  };
}

/* the share a spot's fill rises to, never a hairline for a priced spot so
   an unbacked one still shows its seed, and never quite full */
export const fillLevel = share => share > 0 ? Math.max(0.04, Math.min(0.96, share)) : 0;

/* "200 → 680" */
export const fmtChips = n => Math.round(Number(n) || 0).toLocaleString("en-US");
export const backLine = (stake, back) => `${fmtChips(stake)} → ${fmtChips(back)}`;

export { POOL_MIN, PT };

/* A decided contest as its table stood: each spot's share and price from
   the pool (its tickets, settled), the stacks as the room saw them with
   what each winner was paid (betStacks.js decidedContest), and which spot
   won. A long shot that won carries the price it paid ("Paid 3.4×"). */
export function settledTable(state, contest, decided, me = null) {
  if (!contest || !decided) return null;
  const pool = contestPool(state, contest);
  const raw = decided.sides.map(side => {
    const priced = pool?.sides.find(item => item.key === side.key) || null;
    const money = (priced?.seed || 0) + (priced ? priced.stake : side.total);
    const mult = pool ? null : contestMult(contest, side.key);
    const mine = side.stacks.filter(item => item.player === me).reduce((sum, item) => sum + item.stake, 0);
    const minePaid = side.stacks.filter(item => item.player === me).reduce((sum, item) => sum + item.paid, 0);
    return { key:side.key, players:side.players, stacks:side.stacks, staked:side.total, money, mine, mult, pool:!!pool,
      price:pool ? priced?.price ?? pool.price(side.key) : (mult || 1) + 1, bettors:side.stacks.length,
      won:side.won, paid:side.paid, back:side.won ? mine + minePaid : 0 };
  });
  const pcts = sharePcts(raw.map(spot => spot.money));
  const total = pool ? pool.total : raw.reduce((sum, spot) => sum + spot.money, 0);
  const spots = raw.map((spot, i) => ({ ...spot, pct:pcts[i], share:total > 0 ? spot.money / total : 0,
    long:spot.won && !!pool && spot.price >= UPSET_PRICE }));
  return { contestId:contest.id, kind:contest.kind, shape:tableShape(spots.length), pool:!!pool,
    total:Math.round(total), staked:raw.reduce((sum, spot) => sum + spot.staked, 0), spots, settled:true,
    winner:decided.winner };
}
