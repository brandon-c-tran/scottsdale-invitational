/* D8 "Table view": a seated player's phone laid on the felt during the
   finale. Pure: who may open it, what it shows at a server instant, when
   the next tick is due so the level turns on the same server beat as the
   TV, and the Screen Wake Lock gate. TableView.jsx draws it. */

import { ROSTER, pokerClock, pokerDenoms } from "../../../shared/core.js";

/* "seated" (the only state that offers the view), else why not:
   "none" (no live table), "guest" (no claimed player), "unseated",
   "away", or "out" (busted). */
export function tableViewSeat(state, me) {
  const pk = state?.poker;
  if (!pk || !pk.startedAt || state.results?.[pk.id]) return "none";
  if (!me) return "guest";
  const seats = Array.isArray(pk.seats) ? pk.seats : ROSTER;
  if (!seats.includes(me)) return "unseated";
  if (state.away?.[me]) return "away";
  if ((pk.outs || []).some(out => out?.player === me)) return "out";
  return "seated";
}
export const tableViewAvailable = (state, me) => tableViewSeat(state, me) === "seated";
/* an open view stays up through a bust, and closes when the table ends or
   the player leaves it */
export const tableViewKeepsOpen = (state, me) => ["seated", "out"].includes(tableViewSeat(state, me));

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
export const mmss = ms => {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/* Everything on screen at server time `now`. */
export function tableViewModel(state, me, now) {
  const pk = state?.poker;
  if (!pk?.startedAt) return null;
  const clk = pokerClock(pk, now);
  const levels = pk.levels || [];
  const next = clk.idx < levels.length - 1 ? levels[clk.idx + 1] : null;
  const seats = Array.isArray(pk.seats) ? pk.seats : ROSTER;
  const outs = (pk.outs || []).map(out => out?.player).filter(player => seats.includes(player));
  const outIdx = outs.indexOf(me);
  const stack = Number(pk.startingStacks?.[me]) || 0;
  return {
    level:clk.idx, levelNumber:clk.idx + 1, levelCount:levels.length || clk.idx + 1,
    levelMs:(Number(levels[clk.idx]?.mins) || 0) * 60000,
    sb:clk.sb, bb:clk.bb, blinds:`${fmt(clk.sb)} / ${fmt(clk.bb)}`,
    next:next ? `${fmt(next.sb)} / ${fmt(next.bb)}` : null,
    msLeft:clk.msLeft, paused:clk.paused, final:clk.final, last:clk.last,
    clock:clk.final ? "Final level" : mmss(clk.msLeft),
    late:!clk.paused && !clk.final && !clk.last && clk.msLeft < 60000,
    stack, stackText:fmt(stack), denoms:pokerDenoms(stack),
    alive:seats.length - outs.length,
    busted:outIdx >= 0, finish:outIdx >= 0 ? seats.length - outIdx : null,
  };
}

/* ms until the displayed second changes: the countdown ticks, and a level
   turns, exactly when the server's clock crosses it (every TV and phone
   derive the same boundary from the stored level start). A paused or final
   clock only needs the slow tick. */
export const TICK_SLOP_MS = 12;
export function nextTickDelay(model) {
  if (!model || model.paused || model.final) return 1000;
  const rest = model.msLeft % 1000;
  return (rest || 1000) + TICK_SLOP_MS;
}

/* the blinds as large as the width allows: Big Shoulders Display figures run
   about half an em, the separator a little less */
export function blindsSize(text, width, { max = 136, min = 56 } = {}) {
  const units = [...String(text || "")].reduce((sum, ch) => sum + (ch === " " ? 0.24 : ch === "," ? 0.22 : ch === "/" ? 0.36 : 0.5), 0);
  return Math.max(min, Math.min(max, Math.floor(width / Math.max(units, 1))));
}

/* Screen Wake Lock: the one helper lives in src/lib/wakeLock.js (Table
   view and the TV both hold the screen awake through it) */
export { createWakeLock, wakeLockSupported } from "../../lib/wakeLock.js";
