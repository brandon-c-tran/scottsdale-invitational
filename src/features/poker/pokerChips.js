/* The finale's physical chips: what a dealer builds for each seat and what
   the commissioner pulls from the case, as stacks rather than arithmetic.
   Pure; every count comes from pokerDenoms/pokerInventory in core. */

import { POKER_CONFIG, pokerDenoms } from "../../../shared/core.js";

/* one flat color per denomination (tokens in experience.css :root); only
   the gold 1000 is light enough to carry dark ink */
export const POKER_CHIPS = Object.freeze({
  25:Object.freeze({ color:"var(--poker-25)", isLight:false, skin:"quad" }),
  100:Object.freeze({ color:"var(--poker-100)", isLight:false, skin:"quad" }),
  500:Object.freeze({ color:"var(--poker-500)", isLight:false, skin:"quad" }),
  1000:Object.freeze({ color:"var(--poker-1000)", isLight:true, skin:"quad" }),
});
export const pokerChip = value => ({ ...(POKER_CHIPS[value] || POKER_CHIPS[100]), stamp:value });

/* a case rack holds its chips in rows of twenty */
export const TRAY_TUBE = 20;

/* small chips first, the way a stack is set out in front of a seat */
const ascending = list => [...list].sort((a, b) => a.v - b.v);

/* a seat's stack, one short stack per denomination, and the value it makes */
export function seatStacks(stack) {
  const denominations = ascending(pokerDenoms(stack));
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
