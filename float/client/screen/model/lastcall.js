/* Last Call on the TV, the countdown (float/GROOVE.md "Last Call: the
   countdown"): everyone in the Cup at the bar; the bartender counts down
   from 10, the number big on the bar's board (or the wind-up clock) and
   said; partway the trick's gag hides the count (lights: he pulls the
   cord, dark; slow: the clock winds down; ticks: foam spills over the
   board) and nothing tells it after; at revealAt every rider's offset at
   once; at verdictAt the farthest off drinks and the closest is marked.
   Pure: everything from the chart's countdown and the room's lastCall. */
import { LAST_CALL, formatOffset, qualityOf } from "../../../shared/chart.js";

export const LAST_CALL_EXPLAINER = "The bar closes at zero. Tap on zero. Farthest off drinks.";
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const countWord = n => WORDS[n] || String(n);

/* the countdown at ms `t` from songAt: { stage, step, show, say, tick,
   hidden, trick, first, gagK } where stage is "intro", "count", "dark"
   (hidden, before the reveal), "reveal" or "verdict"; `show` the number on
   the board (null when nothing is), `say` the number being said (for 0.7
   s after its count), gagK how far into the hiding gag (0 to 1) */
export function countdownAt(countdown, t) {
  if (!countdown || !Number.isFinite(t)) return null;
  const { steps = [], hideAt, revealAt, verdictAt, introMs = 0, trick = "lights", first = false } = countdown;
  let step = null;
  for (const s of steps) if (s.at <= t) step = s;
  const hidden = t >= hideAt;
  const stage = t < introMs ? "intro" : t >= verdictAt ? "verdict" : t >= revealAt ? "reveal" : hidden ? "dark" : "count";
  const show = !hidden && step?.show ? step.n : null;
  const say = !hidden && step?.say && t - step.at < 700 ? step.n : null;
  const tick = !hidden && step?.tick && t - step.at < 400 ? step.n : null;
  return { stage, step, show, say, tick, hidden, trick, first, gagK:hidden ? Math.min(1, (t - hideAt) / 1200) : 0 };
}

/* the verdict shown at the later of its moment and the room naming who drinks */
export function verdictShown({ songAt, countdown, lastCall, lastCallAt }, now) {
  const worst = Array.isArray(lastCall?.worst) ? lastCall.worst : null;
  if (!worst || !countdown || !Number.isFinite(songAt) || !Number.isFinite(now)) return null;
  const at = Math.max(songAt + countdown.verdictAt, Number.isFinite(lastCallAt) ? lastCallAt : -Infinity);
  return now >= at ? worst : null;
}

/* the closest: the smallest |d| among those who tapped (ties all) */
export function closestOf(totals = []) {
  const tapped = totals.filter(row => Number.isFinite(row?.d));
  if (!tapped.length) return [];
  const best = Math.min(...tapped.map(row => Math.abs(row.d)));
  return tapped.filter(row => Math.abs(row.d) === best).map(row => row.i);
}

/* a rider's readout: { q, d } (no tap: a miss) */
export const readoutOf = row => (Number.isFinite(row?.d) ? { q:qualityOf(row.d), d:row.d } : { q:"miss", d:null });
export { formatOffset, LAST_CALL };

/* the bartender at ms t: "slide" while pulling the cord or tapping the
   clock (the gag), "cheer" once the verdict is in, else "idle" */
export function bartenderPose(countdown, t, { revealed = false } = {}) {
  if (revealed) return "cheer";
  if (!countdown || !Number.isFinite(t)) return "idle";
  if (t >= countdown.hideAt && t < countdown.hideAt + 1400 && countdown.trick !== "ticks") return "slide";
  return "idle";
}

/* the bartender behind the counter, at the left */
export const BARTENDER = Object.freeze({ x:300, y:494, h:400 });
/* the board over the bar */
export const BOARD = Object.freeze({ x:1060, y:200, w:400, h:240 });

/* the counter in front of everyone at the bar (GROOVE.md v3 "No tubes at
   the bar"): its top edge on the stage; the riders stand behind it waist
   up, as the bartender does behind his, so it covers every tube */
export const COUNTER = Object.freeze({ top:850 });
/* the art's ring reaches this far over the waterline (box px: its top
   edge, the paws resting on it, so the paws sit on the counter; a kayak's
   bow rides about as high), drawn
   ART_FILL (1.45) times the scale */
export const RING_OVER = 62 * 1.45;

/* everyone at the bar: one line-up behind the counter, so each rider's
   readout stands right over them and every name sits on the counter under
   them, in the order given (left to right): { [i]: { x, y, scale, row } } */
/* (v4 item 3: right of the bartender, so 13 readouts in two tiers clear him) */
export const BAR_LINE = Object.freeze({ lo:520, hi:1800, maxSpacing:300 });
export function barLayout(players = []) {
  const list = players.filter(i => Number.isInteger(i));
  const out = {};
  const n = list.length;
  if (!n) return out;
  const spacing = n > 1 ? Math.min(BAR_LINE.maxSpacing, (BAR_LINE.hi - BAR_LINE.lo) / (n - 1)) : 0;
  /* shoulder to shoulder: a critter's body is about 200 box px wide */
  const scale = Math.max(0.34, Math.min(0.62, (spacing || BAR_LINE.maxSpacing) / 280));
  /* the waterline just under the counter's top: the ring and the paws behind it */
  const y = Math.round(COUNTER.top + RING_OVER * scale + 6);
  const start = (BAR_LINE.lo + BAR_LINE.hi) / 2 - (spacing * (n - 1)) / 2;
  list.forEach((i, k) => { out[i] = { x:start + k * spacing, y, scale, row:0 }; });
  return out;
}

/* Last Call's reveal as a ranking (GROOVE.md v3 "Last Call: who did best
   and worst"): everyone at the bar, closest to zero first (left), farthest
   last (right); no tap counts LAST_CALL.MISS_MS; a tie shares a place, in
   rider order. `readout(i)` gives { q, d }. Returns [{ i, abs, place }]. */
export function barRanking(players = [], readout = () => null) {
  const miss = Number.isFinite(LAST_CALL?.MISS_MS) ? LAST_CALL.MISS_MS : 3000;
  const rows = players.filter(i => Number.isInteger(i)).map(i => {
    const r = readout(i);
    return { i, abs:r && r.q !== "miss" && Number.isFinite(r.d) ? Math.abs(r.d) : miss };
  }).sort((a, b) => a.abs - b.abs || a.i - b.i);
  rows.forEach((row, k) => { row.place = k > 0 && row.abs === rows[k - 1].abs ? rows[k - 1].place : k + 1; });
  return rows;
}

/* everyone at the bar: the field, then the riders out, the last out first
   (the room's own order, cup.js barPlayers) */
export const barPlayersOf = room => {
  const field = Array.isArray(room?.field) ? room.field : [];
  const out = Array.isArray(room?.out) ? room.out : [];
  return [...field, ...out.slice().reverse()].filter(i => Number.isInteger(i));
};

/* a name list: "Evan", "Evan and Khoa", "Evan, Khoa and Ben" */
export const namesText = names => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
