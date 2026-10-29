/* The sound's beats the picture lands on (float/client/sound: CUT_BEATS,
   PODIUM_BEATS), read by the screen at run time. The sound module loads
   lazily (stage/ScreenSound.jsx) so the screen never fails with it; until
   it is in, or if it never is, the screen's own beats stand in. */
import { timedLines } from "./model/song.js";

export const soundBeats = { cut:null, podium:null, narration:null };

export function setSoundBeats(mod = {}) {
  soundBeats.cut = mod.CUT_BEATS || null;
  soundBeats.podium = mod.PODIUM_BEATS || null;
  soundBeats.narration = typeof mod.narration === "function" ? mod.narration : null;
}

/* the chart's narration, timed as the host says it once the sound is in
   (its narration(chart)), else on the chart's own beats; kept per chart */
const TIMED = new WeakMap();
export function narrationOf(chart) {
  if (!chart || typeof chart !== "object") return [];
  const fn = soundBeats.narration;
  const kept = TIMED.get(chart);
  if (kept && kept.fn === fn) return kept.lines;
  let spoken = null;
  try { spoken = fn ? fn(chart) : null; } catch { spoken = null; }
  const lines = timedLines(chart, spoken);
  TIMED.set(chart, { fn, lines });
  return lines;
}

/* the podium's reveal (ms from its start) when the sound does not say */
export const PODIUM_FALLBACK = Object.freeze({ third:1450, second:2200, first:2700, pose:3400 });
export const podiumBeats = () => soundBeats.podium || PODIUM_FALLBACK;
