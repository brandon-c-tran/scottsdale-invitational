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

/* Past the cap a stack does not grow chip by chip: it breaks, and a short
   tower stands on the break, one chip up to twice the cap and two beyond,
   so 1,000, 1,200 and 2,500 are three different heights. Every board sizes
   its felt for the tallest stack: the cap plus the tower plus the break. */
export const STACK_TOWER = 2;
export const towerTiers = (chips, cap = STACK_CAP) => chips <= cap ? 0 : chips <= 2 * cap ? 1 : STACK_TOWER;
export const towerGap = size => Math.max(4, Math.round(Math.max(8, Number(size) || 0) * 0.14));
export const stackMaxHeight = (size, cap = STACK_CAP) => stackGeometry(size, cap + STACK_TOWER).height + towerGap(size);
/* one stake's stack as ChipStack draws it (a tower past the cap) */
export function stackHeight(size, stake, cap = STACK_CAP) {
  const chips = stackChipCount(stake), tiers = towerTiers(chips, cap);
  return stackGeometry(size, Math.max(1, Math.min(chips, cap)) + tiers).height + (tiers ? towerGap(size) : 0);
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
export function sideKeyOf(state, contest, wager) {
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

/* ── many bettors on one side (P1) ──
   A side can carry up to 12 bettors. Past `slots` stacks, the smallest
   collapse into one "+N" group that keeps each bettor's colour and carries
   their combined total. The list arrives biggest first, so the group is
   always the tail. */
export function groupStacks(stacks = [], slots = Infinity, keep = null) {
  const list = stacks || [];
  const room = Math.max(1, Math.floor(Number(slots) || 0) || 1);
  if (!Number.isFinite(Number(slots)) || list.length <= room) return { shown:list, rest:null };
  const size = Math.max(1, room - 1);
  let shown = list.slice(0, size);
  /* a stack that must stay a target (your own) takes the last shown slot
     rather than folding into the group; the order is still biggest first */
  const kept = keep ? list.find(item => item.player === keep) : null;
  if (kept && !shown.includes(kept)) shown = [...list.slice(0, size - 1), kept];
  const tail = list.filter(item => !shown.includes(item));
  return { shown, rest:{ players:tail.map(item => item.player), count:tail.length,
    total:stacksTotal(tail), stacks:tail } };
}

/* The ladder a fitted board steps down until every stack fits its felt:
   smaller chips first, then grouping the smallest stacks,
   one more at a time. Chips never go below `min` px (TV text stays legible
   under them). */
export function fitLevels(count, { chip = 64, cap = STACK_CAP, min = 30 } = {}) {
  const sizes = [];
  /* the last two steps only a short felt reaches: the tallest stack, its
     amount and its name must stand inside it, never sliced at its foot */
  for (const k of [1, 0.875, 0.75, 0.66, 0.58, 0.5, 0.42, 0.375]) {
    const size = Math.max(min, Math.round(chip * k));
    /* one cap everywhere: a smaller chip, never a shorter stack rule */
    if (!sizes.length || sizes[sizes.length - 1].size !== size) sizes.push({ size, cap, slots:Infinity });
  }
  /* once some must group, more bettors on show wins over bigger chips, but
     each count tries a few sizes so a short felt does not shrink them all */
  const grouped = sizes.filter((_, index) => index === 0 || index === sizes.length - 1 || index === 2);
  const levels = [...sizes];
  for (let slots = Math.max(0, count) - 1; slots >= 2; slots--)
    grouped.forEach(level => levels.push({ ...level, slots }));
  return levels;
}

/* A decided contest as its sides stood: which side won, each side's stacks
   settled through resolveWager (a winner's payout is its own delta), and the
   totals the board stamps. Null until the contest is actually decided, so a
   reorder or a rewind never plays as a result. */
export function contestWinnerKey(state, evId, contest) {
  if (!contest) return null;
  if (contest.kind === "ffa") {
    const first = state.results?.[evId]?.slots?.[0];
    const top = Array.isArray(first) ? first : first != null ? [first] : [];
    if (!top.length) return null;
    const side = (contest.sides || []).find(item => item.players.some(p => top.includes(p)));
    return side ? side.key : null;
  }
  const stack = state.eventOps?.[evId]?.contestStack;
  const list = Array.isArray(stack) ? stack : state.eventOps?.[evId]?.lastContest ? [state.eventOps[evId].lastContest] : [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.id === contest.id) return list[i].winner ?? null;
  return null;
}
export function decidedContest(state, events, evId, contest) {
  const winner = contestWinnerKey(state, evId, contest);
  if (!contest || winner === null || winner === undefined) return null;
  const bySide = new Map((contest.sides || []).map(side => [side.key, new Map()]));
  (state.wagers || []).forEach(wager => {
    if (!wagerMatchesContest(wager, contest)) return;
    const result = resolveWager(state, wager, events);
    if (result.status !== "won" && result.status !== "lost") return;
    const side = bySide.get(sideKeyOf(state, contest, wager));
    if (!side) return;
    const cur = side.get(wager.player) || { player:wager.player, stake:0, paid:0, status:result.status };
    cur.stake += Number(wager.stake) || 0;
    if (result.status === "won") cur.paid += Math.max(0, result.delta);
    side.set(wager.player, cur);
  });
  const sides = (contest.sides || []).map(side => {
    const stacks = [...bySide.get(side.key).values()]
      .sort((a, b) => b.stake - a.stake || a.player.localeCompare(b.player));
    const won = side.key === winner;
    return { key:side.key, players:side.players, won, stacks,
      total:stacksTotal(stacks), paid:stacks.reduce((sum, item) => sum + item.paid, 0) };
  });
  return { winner, sides,
    paid:sides.reduce((sum, side) => sum + side.paid, 0),
    lost:sides.filter(side => !side.won).reduce((sum, side) => sum + side.total, 0),
    any:sides.some(side => side.stacks.length > 0) };
}
/* what one player collects from a decided contest */
export const decidedPayout = (decided, player) => (decided?.sides || [])
  .reduce((sum, side) => sum + side.stacks.filter(item => item.player === player)
    .reduce((acc, item) => acc + (item.status === "won" ? item.stake + item.paid : 0), 0), 0);

/* ── chip flight geometry (M4), pure ── */
/* where a chip waits over a stack (or the + well) while its write is out:
   `size` px square, centred on the anchor, `lift` px above its top */
export const hoverRect = (anchor, size, lift = 8) => anchor ? ({
  left:anchor.left + anchor.width / 2 - size / 2, top:anchor.top - size - lift, width:size, height:size,
}) : null;
/* a stack's top face as a square rect the landing chip fits into */
export const faceRect = svgRect => svgRect ? ({
  left:svgRect.left, top:svgRect.top - svgRect.width * 0.2, width:svgRect.width, height:svgRect.width,
}) : null;
/* the rack chip a retracted chip flies home to: its own value when the rack
   carries it, otherwise the selected one */
export const rackTargetFor = (value, denoms, fallback) =>
  `bets:rack:${denoms.includes(value) ? value : fallback}`;

/* a recorded contest entry, as the contest target its tickets were placed on */
export const contestOfEntry = (eventId, entry) => entry ? ({ id:entry.id, eventId, kind:entry.kind,
  match:entry.match, group:entry.group, stagesId:entry.stagesId, drawId:entry.drawId }) : null;

/* an event-wide free-for-all's winning stacks once its result posts */
export const eventWinnerStacks = (state, events, eventId) => settledStacks(state, events, { eventId },
  wager => wager.eventId === eventId && wager.kind === "outright");

/* the name under a stack: the first word of the display name, unless that
   word is an initial or two ("j vo", "J. R."), when the whole name stays */
export const shortName = display => {
  const name = String(display || "").trim();
  const first = name.split(/\s+/)[0] || "";
  return first.replace(/[^\p{L}\p{N}]/gu, "").length <= 2 ? name : first;
};
export const stackName = (state, player) => shortName(disp(state, player) || player);
