/* The river's geometry for the screen, from the contract's course data
   (float/PROTOCOL.md "The course data"). Pure: no DOM, no three.js, so the
   world, the flat map and the camera director share it. Positions, the
   nearest point and the water's height come from the engine's own helpers
   (float/shared/course.js), so the banks the screen draws are the banks the
   race bumps into.

   x east, y north, metres, top-down; s is distance along the centreline.
   Left is the left bank looking downstream (+90 degrees from the tangent). */
import { frameAt, nearestS, elevAt as engineElev, flowSpeed } from "../../../shared/course.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* a piecewise-linear table [[s, v], ...] sampled at s */
export function tableAt(table, s, fallback = 0) {
  if (!Array.isArray(table) || !table.length) return fallback;
  if (s <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (s >= last[0]) return last[1];
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid][0] <= s) lo = mid; else hi = mid;
  }
  const a = table[lo], b = table[hi];
  const span = b[0] - a[0];
  return span > 0 ? lerp(a[1], b[1], (s - a[0]) / span) : b[1];
}

/* how rough the water is for a zone kind: 0 glassy .. 1 white */
export const ZONE_ROUGH = Object.freeze({ pool:0, eddy:0.12, bar:0, split:0.25, whirlpool:0.35, narrows:0.22, riffle:0.75, drop:1 });

export function prepareCourse(course) {
  const line = Array.isArray(course?.line) ? course.line.filter(p => Array.isArray(p) && p.length >= 2) : [];
  if (line.length < 2) throw new Error("course has no line");
  const n = line.length;
  const xs = new Float64Array(n), ys = new Float64Array(n), ws = new Float64Array(n), ss = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = +line[i][0]; ys[i] = +line[i][1]; ws[i] = Math.max(2, +(line[i][2] ?? 20));
    if (i) ss[i] = ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const length = ss[n - 1];
  /* tangents smoothed over a few samples, so bank normals never kink */
  const txs = new Float64Array(n), tys = new Float64Array(n);
  const R = 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - R), b = Math.min(n - 1, i + R);
    let tx = xs[b] - xs[a], ty = ys[b] - ys[a];
    const len = Math.hypot(tx, ty) || 1;
    txs[i] = tx / len; tys[i] = ty / len;
  }
  const zones = Array.isArray(course.zones) ? course.zones.filter(z => z && Number.isFinite(z.s0) && Number.isFinite(z.s1)) : [];
  const legs = Array.isArray(course.legs) ? course.legs : [];
  const rocks = Array.isArray(course.rocks) ? course.rocks : [];
  const islands = Array.isArray(course.islands) ? course.islands : [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const h = ws[i] / 2;
    minX = Math.min(minX, xs[i] - h); maxX = Math.max(maxX, xs[i] + h);
    minY = Math.min(minY, ys[i] - h); maxY = Math.max(maxY, ys[i] + h);
  }

  /* segment index for s (binary search on cumulative distance) */
  const indexAt = s => {
    if (s <= 0) return 0;
    if (s >= length) return n - 2;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ss[mid] <= s) lo = mid; else hi = mid;
    }
    return lo;
  };

  /* the centreline at s, written into `out`: x, y, w, tx, ty (unit tangent), nx, ny (unit left normal) */
  const sampleInto = (s, out = {}) => {
    const f = frameAt(course, clamp(s, 0, length));
    out.x = f.x; out.y = f.y; out.w = f.w; out.tx = f.tx; out.ty = f.ty; out.nx = f.nx; out.ny = f.ny;
    /* beyond the ends, carry on straight */
    if (s < 0) { out.x += f.tx * s; out.y += f.ty * s; }
    else if (s > length) { out.x += f.tx * (s - length); out.y += f.ty * (s - length); }
    out.s = s;
    return out;
  };
  const sample = s => sampleInto(s, {});

  const elevAt = s => engineElev(course, s);
  const flowAt = s => flowSpeed(course, s);
  const zonesAt = s => zones.filter(z => s >= z.s0 && s <= z.s1).map(z => z.k);
  /* zone roughness eased over `ease` metres either side, so foam fades in */
  const roughAt = (s, ease = 12) => {
    let r = 0;
    for (const z of zones) {
      const k = ZONE_ROUGH[z.k] ?? 0;
      if (!k) continue;
      const inside = Math.min(s - z.s0, z.s1 - s);
      if (inside < -ease) continue;
      r = Math.max(r, k * clamp((inside + ease) / (2 * ease), 0, 1));
    }
    return r;
  };
  /* signed curvature (radians per metre, + turning left) */
  const turnAt = s => {
    const a = sample(s - 6), b = sample(s + 6);
    let d = Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d / 12;
  };

  /* a spatial grid of segments for nearest-point queries */
  const CELL = 16;
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = Math.min(xs[i], xs[i + 1]), x1 = Math.max(xs[i], xs[i + 1]);
    const y0 = Math.min(ys[i], ys[i + 1]), y1 = Math.max(ys[i], ys[i + 1]);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = key(cx, cy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  }
  const projectSeg = (i, x, y, best) => {
    const ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
    const px = ax + dx * t, py = ay + dy * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < best.d2) { best.d2 = d2; best.s = ss[i] + (ss[i + 1] - ss[i]) * t; best.i = i; }
  };
  /* the distance along the river nearest to (x, y); `hint` (an s) keeps the
     search local, so a rider never jumps to a neighbouring bend */
  const nearest = (x, y, hint = null, out = {}) => {
    const best = { d2:Infinity, s:0, i:0 };
    if (hint !== null && Number.isFinite(hint)) {
      const near = nearestS(course, x, y, hint);
      out.s = near.s; out.d = Math.abs(near.d); out.lat = near.d;
      return out;
    }
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let r = 1; r <= 8; r++) {
      for (let ix = cx - r; ix <= cx + r; ix++)
        for (let iy = cy - r; iy <= cy + r; iy++)
          for (const i of grid.get(key(ix, iy)) || []) projectSeg(i, x, y, best);
      /* everything within r cells is covered: nothing outside can be nearer */
      if (best.d2 <= (r * CELL) ** 2) break;
    }
    if (best.d2 === Infinity) for (let i = 0; i < n - 1; i++) projectSeg(i, x, y, best);
    out.s = best.s; out.d = Math.sqrt(best.d2);
    return out;
  };
  /* metres left of the centreline at s */
  const lateralOf = (x, y, s) => {
    const p = sample(s);
    return (x - p.x) * p.nx + (y - p.y) * p.ny;
  };

  const legAt = index => legs[clamp(index | 0, 0, Math.max(0, legs.length - 1))] || { id:"leg", name:"", s0:0, s1:length, grid:0, finish:length };
  const zoneSpans = kind => zones.filter(z => z.k === kind);

  return {
    id:course.id || "course", course, n, xs, ys, ws, ss, txs, tys, length,
    bounds:{ minX, maxX, minY, maxY },
    zones, legs, rocks, islands,
    indexAt, sample, sampleInto, elevAt, flowAt, zonesAt, roughAt, turnAt, nearest, lateralOf, legAt, zoneSpans,
  };
}

/* shortest signed difference between two headings */
export function angleDelta(from, to) {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export const lerpAngle = (a, b, t) => a + angleDelta(a, b) * t;
