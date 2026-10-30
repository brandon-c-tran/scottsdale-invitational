/* Who's ahead (float/GROOVE.md "Who's ahead"): the room's own order in a
   song (`room.results`: by the song's percent so far, ties by the Cup
   before it, then Perfects, then field order, the engine's compareRows),
   moved between the room's frames by the hits the screen has seen since,
   re-ranked at most once a beat so a flurry of hits does not shuffle it.
   The cut line sits after `cut` places (the next round's field); the
   final has none (its top three are marked). Pure, with one small
   stateful ranker that keeps the last order and when it was made. */
import { POINTS } from "../../../shared/chart.js";
/* "1st", "2nd", "3rd", "11th" */
const ordinalText = n => { const k = n % 100; return `${n}${k >= 11 && k <= 13 ? "th" : ({ 1:"st", 2:"nd", 3:"rd" })[n % 10] || "th"}`; };

/* a rider's standing so far: the room's row plus what the screen judged
   since it (`live` the store's live percent, which already counts those) */
export function standingOf(row, extra = { pts:0, perfects:0, n:0 }, live = null) {
  return {
    i:row.i,
    pts:(Number(row.pts) || 0) + extra.pts,
    pct:Number.isFinite(live) ? live : Number(row.pct) || 0,
    perfects:(Number(row.perfects) || 0) + extra.perfects,
    cup:Number(row.cup) || 0,
  };
}

const tenths = value => Math.round((Number(value) || 0) * 10);
/* the order: the song's percent so far, then the Cup (to a tenth), then
   Perfects, then the field's order (groove.js compareRows) */
export function rankOrder(standings = [], field = []) {
  const pos = new Map(field.map((i, k) => [i, k]));
  return standings.slice().sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || tenths(b.cup) - tenths(a.cup) || b.perfects - a.perfects
    || (pos.get(a.i) ?? a.i) - (pos.get(b.i) ?? b.i)).map(s => s.i);
}

/* what each rider's hits after the room's frame add: { [i]: { pts, perfects, n } } */
export function extrasSince(judged, since, chart) {
  const out = new Map();
  if (!judged) return out;
  for (const [i, mine] of judged) {
    const extra = { pts:0, perfects:0, n:0 };
    for (const [c, j] of mine) {
      if (!(j.at > since) || !chart?.cues?.[c]?.scored) continue;
      extra.pts += POINTS[j.q] || 0;
      extra.n += 1;
      if (j.q === "perfect") extra.perfects += 1;
    }
    out.set(i, extra);
  }
  return out;
}

/* the order from a room message and the store: [i] best first (liveOf the
   store's live percent, null before a judgement) */
export function liveOrder({ results = [], field = [], judged = null, since = -Infinity, chart = null, liveOf = null } = {}) {
  const rows = (Array.isArray(results) ? results : []).filter(r => Number.isInteger(r?.i));
  const known = new Set(rows.map(r => r.i));
  for (const i of field) if (!known.has(i)) rows.push({ i, pts:0, pct:0, perfects:0, cup:0 });
  const extras = extrasSince(judged, since, chart);
  const live = i => (typeof liveOf === "function" ? liveOf(i) : null);
  return rankOrder(rows.filter(r => !field.length || field.includes(r.i)).map(r => standingOf(r, extras.get(r.i), live(r.i))), field);
}

/* the places that go through (the cut line after them), or null (the final, or no cut) */
export const throughOf = (room, fieldSize) => {
  if (room?.lastRound || room?.cut === null || room?.cut === undefined) return null;
  const cut = Number(room.cut);
  return Number.isFinite(cut) && cut > 0 && cut < fieldSize ? cut : null;
};

/* A ranker: the order re-made at most once a beat (`beat` the song's
   beat now). Returns { order, through, at } and keeps them between calls. */
export function createRanker() {
  let last = null;
  return {
    get last() { return last; },
    reset() { last = null; },
    update({ beat, key, make }) {
      const slot = Number.isFinite(beat) ? Math.floor(beat) : 0;
      if (last && last.key === key && last.slot === slot) return last;
      last = { ...make(), key, slot };
      return last;
    },
  };
}

/* below the cut line? (never in the final) */
export const belowCut = (order, through, i) => through !== null && order.indexOf(i) >= through;

/* the song's order now, for the strip and the cast alike (one ranker per
   store, so both draw the same order): { order, through } or null */
const RANKERS = new WeakMap();
export function rankNow(store, now) {
  const st = store?.state;
  const chart = st?.chart;
  if (!chart || st.phase !== "song" || !Number.isFinite(st.songAt) || !Number.isFinite(now)) return null;
  let ranker = RANKERS.get(store);
  if (!ranker) RANKERS.set(store, ranker = createRanker());
  const field = st.songField || [];
  return ranker.update({ beat:(now - st.songAt) / chart.beatMs, key:`${st.songKey}:${st.resultsAt}`,
    make:() => ({ order:liveOrder({ results:st.results, field, judged:st.judged, since:st.resultsAt, chart, liveOf:store.liveOf }), through:throughOf(st.room, field.length) }) });
}

/* ── the strip: every rider as a chip, in rank order, across the top ── */
export const RANK = Object.freeze({ x0:360, x1:1900, top:66, maxSlot:150 });
export function rankSlots(n, { x0 = RANK.x0, x1 = RANK.x1, maxSlot = RANK.maxSlot } = {}) {
  const w = n ? Math.min(maxSlot, (x1 - x0) / n) : maxSlot;
  const start = x0 + ((x1 - x0) - w * n) / 2;
  return { w, start, x:k => start + k * w };
}
/* the strip's marks for an order: { [i]: label } (the leader "1st"; the final's three) */
export function rankMarks(order, { final = false } = {}) {
  const out = {};
  order.slice(0, final ? 3 : 1).forEach((i, k) => { out[i] = ordinalText(k + 1); });
  return out;
}

