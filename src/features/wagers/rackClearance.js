/* The fixed rack covers the bottom of the screen; the board pads its end
   by exactly what the rack covers (its height plus its offset from the
   bottom), less whatever the page already leaves below the board (the
   tab bar's padding), so the last side and Open bets always clear it.
   Pure; Wagers.jsx measures and applies it as --fd-rack-pad. */
export const RACK_CLEAR_GAP = 16;
export function rackPadding({ rackBottom = 0, rackHeight = 0, below = 0, gap = RACK_CLEAR_GAP, min = 32 } = {}) {
  const need = (Number(rackBottom) || 0) + (Number(rackHeight) || 0) + gap - Math.max(0, Number(below) || 0);
  return Math.max(min, Math.ceil(need));
}
