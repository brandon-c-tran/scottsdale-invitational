/* Who's ahead (float/GROOVE.md "Who's ahead"): the room's own order in a
   song (`room.results`: by the song's points so far, ties by the Cup
   before it, then Perfects, then field order, the engine's compareRows),
   moved between the room's frames by the hits the screen has seen since,
   re-ranked at most once a beat so a flurry of hits does not shuffle it.
   The cut line sits after `cut` places (the next round's field); the
   final has none (its top three are marked). Pure, with one small
   stateful ranker that keeps the last order and when it was made. */
import { POINTS } from "../../../shared/chart.js";

/* a rider's standing so far: the room's row plus what the screen judged since it */
export function standingOf(row, extra = { pts:0, perfects:0, n:0 }) {
  return {
    i:row.i,
    pts:(Number(row.pts) || 0) + extra.pts,
    perfects:(Number(row.perfects) || 0) + extra.perfects,
    cup:Number(row.cup) || 0,
  };
}

/* the order: points, then the Cup, then Perfects, then the field's order */
export function rankOrder(standings = [], field = []) {
  const pos = new Map(field.map((i, k) => [i, k]));
  return standings.slice().sort((a, b) => b.pts - a.pts || b.cup - a.cup || b.perfects - a.perfects
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

/* the order from a room message and the store: [i] best first */
export function liveOrder({ results = [], field = [], judged = null, since = -Infinity, chart = null } = {}) {
  const rows = (Array.isArray(results) ? results : []).filter(r => Number.isInteger(r?.i));
  const known = new Set(rows.map(r => r.i));
  for (const i of field) if (!known.has(i)) rows.push({ i, pts:0, perfects:0, cup:0 });
  const extras = extrasSince(judged, since, chart);
  return rankOrder(rows.filter(r => !field.length || field.includes(r.i)).map(r => standingOf(r, extras.get(r.i))), field);
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
