/* The finale's physical chips: what a dealer builds for each seat and what
   the commissioner pulls from the case, as stacks rather than arithmetic.
   Pure; every count comes from the table's deal in core (pokerDeal,
   pokerSeatChips, pokerInventory). */

import { POKER_CONFIG } from "../../../shared/core.js";

/* Brandon's Slowplay set: a white body, the value's color in spots round
   the edge, the numeral printed in gold (tokens in experience.css :root:
   --chip-body, --chip-<v>-edge, --chip-ink-gold). The 1s stay in the case. */
const chipOf = value => Object.freeze({ color:"var(--chip-body)", edge:`var(--chip-${value}-edge)`,
  isLight:true, skin:"quad" });
export const POKER_CHIPS = Object.freeze({
  1:chipOf(1), 5:chipOf(5), 25:chipOf(25), 100:chipOf(100), 500:chipOf(500), 1000:chipOf(1000),
});
export const pokerChip = value => ({ ...(POKER_CHIPS[value] || POKER_CHIPS[100]), stamp:value });

/* a case rack holds its chips in rows of twenty */
export const TRAY_TUBE = 20;

/* small chips first, the way a stack is set out in front of a seat */
const ascending = list => [...list].sort((a, b) => a.v - b.v);

/* a seat's dealt chips ([{ v, n }]), one short stack per denomination, and
   the value they make */
export function seatStacks(chips = []) {
  const denominations = ascending((Array.isArray(chips) ? chips : []).filter(item => item?.n > 0));
  return { total:denominations.reduce((sum, item) => sum + item.v * item.n, 0), stacks:denominations };
}

/* the case pull: every denomination in full rows of twenty and the rest */
export function trayStacks(inventory = []) {
  return ascending(inventory.filter(item => item?.n > 0)).map(({ v, n }) => ({
    v, n,
    tubes:[...Array(Math.floor(n / TRAY_TUBE)).fill(TRAY_TUBE), ...(n % TRAY_TUBE ? [n % TRAY_TUBE] : [])],
  }));
}

export const POKER_DENOMINATIONS = POKER_CONFIG.denominations;
