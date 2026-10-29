/* The offset number's colour (float/GROOVE.md v3 "Numbers in more colours
   than red"): how close a tap was, the same scale on the TV and the phone
   (chart.js offsetTone, countTone). The word keeps its TONES. */
import { countTone, offsetTone } from "../../../shared/chart.js";

/* a song's tap: gold, green, yellow or red by |d| (ms); a miss grey */
export const numberTone = (q, d) => (q === "miss" || !Number.isFinite(d) ? "grey" : offsetTone(Math.abs(d)));
/* Last Call's: green, yellow, orange or red by |d| (ms); no tap red */
export const countNumberTone = (q, d) => (q === "miss" || !Number.isFinite(d) ? "red" : countTone(Math.abs(d)));
