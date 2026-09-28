/* Bet stacks: everyone's chips on a side, drawn as the physical stack of
   their own identity chip. One chip per PT, so a stack's height IS the
   stake. Pure functions over authoritative state; nothing here is stored,
   and settlement always comes from resolveWager. */

import { PT, disp, resolveWager, wagerMatchesContest, wagerSide } from "../../../shared/core.js";

/* past this many chips a stack stops growing and stamps its value */
export const STACK_CAP = 10;

/* how far the table is tilted: a chip's face reads as an ellipse this tall */
export const STACK_TILT = 0.6;
/* one stack's drawing box for a chip `size` px across and `shown` chips */
export function stackGeometry(size, shown, ring = false) {
  const D = Math.max(8, Number(size) || 0);
  const pad = Math.max(1.5, D * 0.04);
  const rx = D * 15.4 / 32, ry = rx * STACK_TILT, t = Math.max(2.4, D * 0.115);
  const yFace = pad + D * STACK_TILT / 2;
  return { D, pad, rx, ry, t, cx:pad + D / 2, yFace, width:D + pad * 2,
    height:yFace + Math.max(1, shown) * t + ry + pad + (ring ? 3 : 0) };
}

/* chips in a stake: one per PT, and any chip at all shows as one */
export const stackChipCount = stake => {
  const value = Math.max(0, Number(stake) || 0);
  return value > 0 ? Math.max(1, Math.floor(value / PT)) : 0;
};

/* what one stack draws: its chips, the visible part under the cap, and
   whether it had to be capped (which is when its value is stamped) */
export function stackView(stake, cap = STACK_CAP) {
  const chips = stackChipCount(stake);
  return { chips, shown:Math.min(chips, cap), capped:chips > cap };
}

/* one stack per bettor, biggest first; a tie reads in roster-name order */
export function orderStacks(entries = []) {
  const byPlayer = new Map();
  for (const entry of entries) {
    if (!entry?.player) continue;
    byPlayer.set(entry.player, (byPlayer.get(entry.player) || 0) + (Number(entry.stake) || 0));
  }
  return [...byPlayer].filter(([, stake]) => stake > 0)
    .map(([player, stake]) => ({ player, stake, ...stackView(stake) }))
    .sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
}

export const stacksTotal = stacks => stacks.reduce((sum, item) => sum + item.stake, 0);

/* tickets grouped by what they back (labelOf gives { pick, ctx }), each
   bettor one stack on it, the most-backed pick first */
export function pickStacks(wagers, labelOf) {
  const picks = new Map();
  (wagers || []).forEach(wager => {
    const label = labelOf(wager);
    const key = `${wager.eventId}|${label.pick}|${label.ctx}`;
    const pick = picks.get(key) || { key, name:label.pick, ctx:label.ctx, entries:[] };
    pick.entries.push({ player:wager.player, stake:wager.stake });
    picks.set(key, pick);
  });
  return [...picks.values()].map(({ entries, ...pick }) => {
    const stacks = orderStacks(entries);
    return { ...pick, stacks, total:stacksTotal(stacks) };
  }).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/* the side a ticket stands on, in the contest's own keys; a team outright
   in a free-for-all is matched by its players when it predates teamIdx */
function sideKeyOf(state, contest, wager) {
  if (contest.kind === "ffa" && wager.pickTeam) {
    const side = contest.sides?.find(item => item.players.length === wager.pickPlayers?.length
      && item.players.every(p => wager.pickPlayers.includes(p)));
    if (side) return side.key;
  }
  return wagerSide(state, wager);
}

/* every open stack on each side of the current contest, with the side total */
export function contestStacks(state, events, contest) {
  const bySide = new Map((contest?.sides || []).map(side => [side.key, []]));
  if (!contest) return new Map();
  (state.wagers || []).forEach(wager => {
    if (!wagerMatchesContest(wager, contest)) return;
    if (resolveWager(state, wager, events).status !== "pending") return;
    const list = bySide.get(sideKeyOf(state, contest, wager));
    if (list) list.push({ player:wager.player, stake:wager.stake });
  });
  return new Map([...bySide].map(([key, entries]) => {
    const stacks = orderStacks(entries);
    return [key, { stacks, total:stacksTotal(stacks) }];
  }));
}

/* A settled stack: a winner's grows by its payout (1:1 doubles it, 2:1
   triples it), a loser's goes back to the bank. */
export function settleStack(stake, status, mult = 1) {
  const before = Math.max(0, Number(stake) || 0);
  if (status === "won") return { status, before, paid:before * mult, after:before * (1 + mult) };
  if (status === "lost") return { status, before, paid:0, after:0 };
  return { status:status || "pending", before, paid:0, after:before };
}

/* A decided contest's stacks as the room saw them, and where each went.
   The payout is resolveWager's own delta, so a correction re-derives it. */
export function settledStacks(state, events, contest, matches = wager => wagerMatchesContest(wager, contest)) {
  const won = new Map(), lost = new Map();
  (state.wagers || []).forEach(wager => {
    if (!contest || !matches(wager)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    const into = result.status === "won" ? won : lost;
    const cur = into.get(wager.player) || { player:wager.player, stake:0, paid:0 };
    cur.stake += Number(wager.stake) || 0;
    if (result.status === "won") cur.paid += Math.max(0, result.delta);
    into.set(wager.player, cur);
  });
  const shape = (map, status) => [...map.values()]
    .map(item => ({ ...item, ...stackView(item.stake), status,
      after:status === "won" ? item.stake + item.paid : 0 }))
    .sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
  const winners = shape(won, "won"), losers = shape(lost, "lost");
  return {
    winners, losers,
    paid:winners.reduce((sum, item) => sum + item.paid, 0),
    lost:losers.reduce((sum, item) => sum + item.stake, 0),
    any:winners.length + losers.length > 0,
  };
}

/* a recorded contest entry, as the contest target its tickets were placed on */
export const contestOfEntry = (eventId, entry) => entry ? ({ id:entry.id, eventId, kind:entry.kind,
  match:entry.match, group:entry.group, stagesId:entry.stagesId, drawId:entry.drawId }) : null;

/* an event-wide free-for-all's winning stacks once its result posts */
export const eventWinnerStacks = (state, events, eventId) => settledStacks(state, events, { eventId },
  wager => wager.eventId === eventId && wager.kind === "outright");

/* the name under a TV stack: the first word of the display name */
export const stackName = (state, player) => String(disp(state, player) || player).split(/\s+/)[0];
