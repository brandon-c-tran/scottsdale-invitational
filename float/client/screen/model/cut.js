/* The cut (float/GROOVE.md "Rounds, elimination, positions"): the song's
   ranking with each rider's percent, the cut line, the eliminated stamped
   out from the bottom up, then hopping to the bank to become the crowd, the
   survivors re-forming for the next song, and the next song's card. Pure:
   ms from the cut's start, squeezed to fit a shorter cut. */
import { indexList } from "./cupShape.js";

export const CUT_BEATS = Object.freeze({ STAMP:2600, STAMP_GAP:450, HOLD:2600, HOP_GAP:420, HOP_MS:760, REFORM:700, NEXT:500 });

/* the moments of a cut with `out` riders going home, in a phase `ms` long */
export function cutTimeline(out = 0, ms = 20000) {
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

/* the song this cut closes, as the room records it: its history entry for
   this round ({ round, song, field, results, out }), or null */
export function cutRecord(room) {
  const history = Array.isArray(room?.history) ? room.history : [];
  const last = history[history.length - 1];
  return last && (last.round === undefined || last.round === room?.round) ? last : null;
}

/* the field that played the song: the room's record, else what the screen
   saw in the song, else the room's field */
export function cutField(room, songField = []) {
  const record = cutRecord(room);
  const fromRecord = indexList(record?.field);
  if (fromRecord.length) return fromRecord;
  if (indexList(songField).length) return indexList(songField);
  return indexList(room?.field);
}

/* The song's ranking at the cut: [{ i, pct, place, out }] best first. The
   room's own (`results`: its places, ties broken its way, `out` on the
   riders going home) when it sends one; else by `scores`' percent, ties by
   the Cup before it, then entrant index, `out` from the room's outs. */
export function cutRanking(scores = [], { field = [], out = [], results = null } = {}) {
  const gone = new Set(indexList(out));
  const placed = (Array.isArray(results) ? results : []).filter(row => Number.isInteger(row?.i));
  if (placed.length) {
    return placed.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
      .map((row, k) => ({ i:row.i, pct:Number(row.pct) || 0, cup:Number(row.cup) || 0, place:row.place ?? k + 1,
        out:row.out === undefined ? gone.has(row.i) : row.out === true }));
  }
  const rows = (Array.isArray(scores) ? scores : []).filter(row => Number.isInteger(row?.i));
  const known = new Set(rows.map(row => row.i));
  for (const i of indexList(field)) if (!known.has(i)) rows.push({ i, pct:0, cup:0 });
  const inField = new Set(indexList(field));
  return rows
    .filter(row => !inField.size || inField.has(row.i))
    .map(row => ({ i:row.i, pct:Number(row.pct) || 0, cup:Number(row.cup) || 0 }))
    .sort((a, b) => b.pct - a.pct || b.cup - a.cup || a.i - b.i)
    .map((row, k) => ({ ...row, place:k + 1, out:gone.has(row.i) }));
}

/* the ranking for a room message in its cut */
export function cutRankingOf(room, songField = []) {
  const record = cutRecord(room);
  const field = cutField(room, songField);
  const results = Array.isArray(room?.results) && room.results.length ? room.results : record?.results;
  const out = indexList(record?.out).length ? [...indexList(room?.out), ...indexList(record.out)] : room?.out;
  return cutRanking(room?.scores, { field, out, results });
}

/* who this cut sends home, from the last place up (the order they are
   stamped and hop) */
export const cutOuts = ranking => ranking.filter(row => row.out).map(row => row.i).reverse();

/* "92.5%": a percent as the board letters it */
export const pctText = pct => {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `${v >= 99.95 ? 100 : v.toFixed(1)}%`;
};
