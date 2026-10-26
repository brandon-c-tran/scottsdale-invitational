/* How much of a stroke lands, as the river counts it (float/shared/sim.js
   applyInput: the cadence bucket), so the phone's own splash and dip can say
   what the room will do with it. Strokes drain out of the bucket at SUSTAIN
   a second; past FREE in the bucket a stroke weakens (to RUSH_FLOOR at
   most), past CAP the room ignores it. Feedback only: the room is sent the
   pull's own power and does this itself, so nothing is counted twice. */
import { PADDLE } from "../../shared/tuning.js";

/* sim.js: rushed = max(RUSH_FLOOR, 1 - rush * RUSH_SLOPE) */
export const RUSH_SLOPE = 0.45;

export function createCadence({ k = PADDLE } = {}) {
  let heat = 0, at = null;
  const drain = t => {
    if (at !== null && t > at) heat = Math.max(0, heat - k.SUSTAIN * (t - at) / 1000);
    at = at === null ? t : Math.max(at, t);
  };
  return {
    /* a stroke at t (ms): the share of its power that lands, 0 when ignored */
    stroke(t) {
      drain(t);
      if (heat + 1 > k.CAP) return 0;
      heat += 1;
      const rush = Math.max(0, heat - k.FREE);
      return Math.max(k.RUSH_FLOOR, 1 - rush * RUSH_SLOPE);
    },
    heat(t) { if (Number.isFinite(t)) drain(t); return heat; },
    clear() { heat = 0; at = null; },
  };
}
