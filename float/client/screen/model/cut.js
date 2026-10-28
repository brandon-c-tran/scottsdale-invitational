/* The cut (float/GROOVE.md "Rounds, elimination, positions"): the song's
   ranking with each rider's percent, the cut line, the eliminated stamped
   out from the bottom up, then hopping to the bank to become the crowd, the
   survivors re-forming for the next song, and the next song's card. Pure:
   ms from the cut's start, squeezed to fit a shorter cut. */
import { indexList } from "./cupShape.js";

export const CUT_BEATS = Object.freeze({ STAMP:2200, STAMP_GAP:380, HOLD:1500, HOP_GAP:420, HOP_MS:760, REFORM:700, NEXT:500 });

/* the moments of a cut with `out` riders going home, in a phase `ms` long */
export function cutTimeline(out = 0, ms = 17000) {
  const n = Math.max(0, out | 0);
  const B = CUT_BEATS;
  const stampsEnd = B.STAMP + Math.max(0, n - 1) * B.STAMP_GAP;
  const boardOut = stampsEnd + B.HOLD;
  const hop = boardOut + 400;
  const hopsEnd = hop + Math.max(0, n - 1) * B.HOP_GAP + B.HOP_MS;
  const reform = n ? hopsEnd + B.REFORM : boardOut + 400;
  const next = reform + B.NEXT;
  const nominal = next + 4500;
  const k = Number.isFinite(ms) && ms > 0 && ms < nominal ? Math.max(0.4, (ms - 1200) / (nominal - 4500)) : 1;
  return {
    stampAt:j => B.STAMP * k + j * B.STAMP_GAP * k,
    boardOut:boardOut * k,
    hopAt:j => hop * k + j * B.HOP_GAP * k,
    hopMs:B.HOP_MS * Math.min(1, k * 1.2),
    reform:reform * k,
    next:next * k,
  };
}

/* The song's ranking at the cut: [{ i, pct, place, out }] best first, by
   this song's percent, ties by the Cup before it, then entrant index;
   `out` the riders this cut sends home (the room's word) */
export function cutRanking(scores = [], { field = [], out = [] } = {}) {
  const rows = (Array.isArray(scores) ? scores : []).filter(row => Number.isInteger(row?.i));
  const known = new Set(rows.map(row => row.i));
  for (const i of indexList(field)) if (!known.has(i)) rows.push({ i, pct:0, cup:0 });
  const gone = new Set(indexList(out));
  return rows
    .map(row => ({ i:row.i, pct:Number(row.pct) || 0, cup:Number(row.cup) || 0 }))
    .sort((a, b) => b.pct - a.pct || b.cup - a.cup || a.i - b.i)
    .map((row, k) => ({ ...row, place:k + 1, out:gone.has(row.i) }));
}

/* who this cut sends home: the room's outs that played this song, from the
   last place up (the order they are stamped and hop) */
export function cutOuts(ranking = [], roomOut = [], songField = []) {
  const field = new Set(indexList(songField).length ? indexList(songField) : ranking.map(row => row.i));
  const outs = new Set(indexList(roomOut).filter(i => field.has(i)));
  return ranking.filter(row => outs.has(row.i)).map(row => row.i).reverse();
}

/* "+0.0" to "100": a percent as the board letters it */
export const pctText = pct => {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `${v >= 99.95 ? 100 : v.toFixed(1)}%`;
};
