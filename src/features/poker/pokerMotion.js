/* Finale motion rules (M17), pure: when the blinds roll, who sits where
   once players bust, and the dealer's timing for building a stack chip by
   chip. The components in PokerMotion.jsx and PokerChips.jsx draw them. */

import { ROSTER } from "../../../shared/core.js";

/* How long a clock tick may be apart from the one before and still count as
   the clock running on screen (a phone back from the background jumps). */
export const CONTINUOUS_TICK_MS = 2500;

/* Whether a change of blind level should roll, and which way.
   prevIdx/idx:  level index shown before and now
   prevAt/at:    the clock readings those were computed at
   sameAnchor:   the table's stored level anchor did not change (the level
                 moved because time passed, not because of a write)
   fresh:        the write that moved it arrived as a fresh frame
   Returns 1 (up), -1 (down), or 0 (show it). */
export function levelRoll({ prevIdx, idx, prevAt, at, sameAnchor, fresh }) {
  if (!Number.isInteger(prevIdx) || !Number.isInteger(idx) || prevIdx === idx) return 0;
  const byClock = sameAnchor && Number.isFinite(prevAt) && Number.isFinite(at)
    && at >= prevAt && at - prevAt <= CONTINUOUS_TICK_MS;
  if (!fresh && !byClock) return 0;
  return idx > prevIdx ? 1 : -1;
}

/* The table's anchor: what a level write changes. */
export const levelAnchor = pk => pk ? `${pk.startedAt || 0}:${pk.levelIdx ?? ""}:${pk.levelStartedAt ?? ""}:${pk.levelOffset || 0}:${pk.pausedAt || 0}` : "";

/* Seats in play first (in seat order), then everyone who busted, best
   finish first, so each new bust lands just under the players still in. */
export function seatOrder(pk) {
  if (!pk) return { alive:[], out:[] };
  const seats = Array.isArray(pk.seats) ? pk.seats : ROSTER;
  const outs = (pk.outs || []).map(item => item?.player).filter(player => seats.includes(player));
  const outSet = new Set(outs);
  return {
    alive:seats.filter(player => !outSet.has(player)),
    out:[...outs].reverse().map(player => ({ player, finish:seats.length - outs.indexOf(player) })),
  };
}

/* The dealer builds a seat's stacks left to right, one chip at a time,
   each stack starting a little after the one before. The whole build fits
   in `maxMs`: a big stack deals faster rather than taking longer.
   counts: chips per stack. Returns [{ start, step }] in ms. */
export function buildSchedule(counts, { chipStep = 55, stackGap = 150, maxMs = 1500, land = 260 } = {}) {
  const list = (counts || []).map(n => Math.max(0, Number(n) || 0));
  if (!list.length) return [];
  const span = (step, gap) => Math.max(...list.map((n, i) => i * gap + Math.max(0, n - 1) * step)) + land;
  const natural = span(chipStep, stackGap);
  const k = natural > maxMs ? (maxMs - land) / Math.max(1, natural - land) : 1;
  const step = chipStep * k, gap = stackGap * k;
  return list.map((_, i) => ({ start:Math.round(i * gap), step:Math.round(step * 10) / 10 }));
}
