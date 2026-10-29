/* The offset number's colour (float/GROOVE.md v3 "Numbers in more colours
   than red"): how close a tap was, the same scale on the TV and the phone.
   chart.js owns the scale (offsetTone, countTone); until the engine's
   v3 chart is on this branch, the contract's thresholds stand in. The word
   keeps its TONES. */
import * as chartModule from "../../../shared/chart.js";

const ownOffsetTone = abs => (abs <= 50 ? "gold" : abs <= 100 ? "green" : abs <= 160 ? "yellow" : "red");
const ownCountTone = abs => (abs <= 100 ? "green" : abs <= 300 ? "yellow" : abs <= 700 ? "orange" : "red");

/* a song's tap: gold, green, yellow or red by |d| (ms); a miss grey */
export function numberTone(q, d) {
  if (q === "miss" || !Number.isFinite(d)) return "grey";
  const fn = typeof chartModule.offsetTone === "function" ? chartModule.offsetTone : ownOffsetTone;
  return fn(Math.abs(d)) || ownOffsetTone(Math.abs(d));
}

/* Last Call's: green, yellow, orange or red by |d| (ms); no tap red */
export function countNumberTone(q, d) {
  if (q === "miss" || !Number.isFinite(d)) return "red";
  const fn = typeof chartModule.countTone === "function" ? chartModule.countTone : ownCountTone;
  return fn(Math.abs(d)) || ownCountTone(Math.abs(d));
}
