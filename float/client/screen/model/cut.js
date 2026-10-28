/* The cut (float/GROOVE.md "Rounds, elimination, positions"): the song's
   ranking with each rider's percent, the cut line, the eliminated stamped
   out from the bottom up, then hopping to the bank to become the crowd, the
   survivors re-forming for the next song, and what comes next (the next
   song's card, or Last Call). Pure: ms from the cut's start, squeezed to
   fit a shorter cut. */
import { indexList } from "./cupShape.js";

/* HOP_MS: a rider's whole way to the bank (the small hop, then the waddle) */
export const CUT_BEATS = Object.freeze({ HOLD:2600, HOP_GAP:420, HOP_MS:1400, REFORM:700, NEXT:500, NEXT_STANDS:3000 });
/* the sound's beats for the cut (float/client/sound CUT_BEATS): the drumroll
   from `roll`, its hit on `reveal`, one rider out each `gap` from it */
export const SOUND_CUT = Object.freeze({ roll:500, reveal:2500, gap:500 });

/* The moments of a cut with `out` riders going home, in a phase `ms` long:
   the cut line on the drumroll's hit and each Out on its sting (the sound's
   beats, exactly), then the board away, the hops, the re-forming and the
   next card, run faster in a short cut (the one before Last Call) so the
   next card still stands three seconds. */
export function cutTimeline(out = 0, ms = 20000, sound = SOUND_CUT) {
  const n = Math.max(0, out | 0);
  const B = CUT_BEATS;
  const beats = { ...SOUND_CUT, ...(sound || {}) };
  const stampAt = j => beats.reveal + j * beats.gap;
  const stampsEnd = n ? stampAt(n - 1) : beats.reveal;
  const rest = B.HOLD + (n ? 400 + (n - 1) * B.HOP_GAP + B.HOP_MS + B.REFORM : 400) + B.NEXT;
  const room = Number.isFinite(ms) && ms > 0 ? ms - stampsEnd - B.NEXT_STANDS : rest;
  const k = Math.max(0.3, Math.min(1, room / rest));
  const boardOut = stampsEnd + B.HOLD * k;
  const hop = boardOut + 400 * k;
  const hopsEnd = hop + Math.max(0, n - 1) * B.HOP_GAP * k + B.HOP_MS * k;
  const reform = n ? hopsEnd + B.REFORM * k : boardOut + 400 * k;
  return {
    reveal:beats.reveal,
    stampAt,
    boardOut,
    hopAt:j => hop + j * B.HOP_GAP * k,
    hopMs:B.HOP_MS * k,
    reform,
    next:reform + B.NEXT * k,
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
