/* The snapshot buffer (float/PROTOCOL.md "The snapshot row", "Clock"): the
   room sends one packed row per racer at 20 Hz; the screen draws at
   serverNow() - INTERP_MS, between the two snapshots around that instant.
   Positions and progress interpolate, headings take the short way round,
   flags come from the newer row, and a stall holds the newest pose.
   Pure: no DOM, no three.js. */
import { angleDelta } from "./courseGeom.js";
import { INTERP_MS } from "../../../shared/tuning.js";

export { INTERP_MS };
/* a jump this far between two rows is a reset (a new grid), not motion */
const TELEPORT_M = 9;

export function createSnapBuffer({ keepMs = 30000 } = {}) {
  /* [{ s, rows: Map<i, {i, x, y, a, f, p}> }] in time order */
  const snaps = [];

  const parse = msg => {
    const rows = new Map();
    for (const row of Array.isArray(msg?.k) ? msg.k : []) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const i = row[0] | 0;
      rows.set(i, { i, x:+row[1], y:+row[2], a:+row[3], f:row[4] | 0, p:+row[5] });
    }
    return rows;
  };

  function push(msg) {
    const s = Number(msg?.s);
    if (!Number.isFinite(s)) return false;
    const entry = { s, rows:parse(msg) };
    const last = snaps[snaps.length - 1];
    if (!last || s > last.s) snaps.push(entry);
    else if (s === last.s) snaps[snaps.length - 1] = entry;
    else {
      /* late or out of order: slot it in */
      let k = snaps.length - 1;
      while (k > 0 && snaps[k - 1].s > s) k--;
      if (snaps[k - 1]?.s === s) snaps[k - 1] = entry; else snaps.splice(k, 0, entry);
    }
    const newest = snaps[snaps.length - 1].s;
    while (snaps.length > 2 && snaps[0].s < newest - keepMs) snaps.shift();
    return true;
  }

  /* the two snapshots around `at` (b null when `at` is past the newest) */
  function bracket(at) {
    if (!snaps.length) return null;
    if (at <= snaps[0].s) return { a:snaps[0], b:null, t:0 };
    let lo = 0, hi = snaps.length - 1;
    if (at >= snaps[hi].s) return { a:snaps[hi], b:null, t:0 };
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (snaps[mid].s <= at) lo = mid; else hi = mid;
    }
    const a = snaps[lo], b = snaps[hi];
    return { a, b, t:(at - a.s) / Math.max(1, b.s - a.s) };
  }

  /* every racer's pose at `at`, written into `out` (a Map, reused) */
  function sample(at, out = new Map()) {
    out.clear();
    const br = bracket(at);
    if (!br) return out;
    const { a, b, t } = br;
    if (!b) {
      for (const [i, r] of a.rows) out.set(i, { ...r, stale:at - a.s });
      return out;
    }
    for (const [i, rb] of b.rows) {
      const ra = a.rows.get(i);
      if (!ra || Math.hypot(rb.x - ra.x, rb.y - ra.y) > TELEPORT_M) { out.set(i, { ...rb, stale:0 }); continue; }
      out.set(i, {
        i,
        x:ra.x + (rb.x - ra.x) * t,
        y:ra.y + (rb.y - ra.y) * t,
        a:ra.a + angleDelta(ra.a, rb.a) * t,
        p:ra.p + (rb.p - ra.p) * t,
        f:rb.f,
        stale:0,
      });
    }
    /* a racer only in the older row (dropped this tick) holds its last pose */
    for (const [i, ra] of a.rows) if (!out.has(i)) out.set(i, { ...ra, stale:at - a.s });
    return out;
  }

  return {
    push,
    sample,
    bracket,
    clear:() => { snaps.length = 0; },
    get size() { return snaps.length; },
    newest:() => snaps[snaps.length - 1]?.s ?? null,
    oldest:() => snaps[0]?.s ?? null,
    /* the rows of the snapshot nearest `at` (for replays and the flat map) */
    rowsAt:at => { const br = bracket(at); return br ? (br.b && br.t > 0.5 ? br.b.rows : br.a.rows) : null; },
  };
}
