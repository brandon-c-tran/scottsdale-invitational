/* The river (float/PROTOCOL.md "The Cup", "The course data"): the Salt
   River in four legs, raced in order, each harder than the last.

   The river is authored below as a PLAN (bends as curvature, keyframes for
   width, current and water height, rocks and the island at a distance and a
   side) and built once, deterministically, into the contract's format:
   COURSE = { id, line, flow, elev, rocks, islands, zones, legs }. Everything
   reads COURSE (or any course in that format sent over the wire) through the
   helpers at the bottom, which never need the plan.

   Coordinates: x east, y north, metres, top-down. s is distance along the
   centreline (`line`); d is the offset across it, + to the left looking
   downstream. Pure: no DOM, no Workers APIs. */
import { WATER, GRID, BEACH } from "./tuning.js";

export const COURSE_ID = "salt";
const STEP = 4;

/* an island as circles every 4 m along s, widest in the middle: [s, d, r] */
function lens(mid, half, widest, d, bulge) {
  const circles = [];
  for (let s = mid - half; s <= mid + half + 1e-9; s += 4) {
    const t = (s - mid) / (half + 2);
    circles.push([s, Math.round((d + bulge * (1 - t * t)) * 100) / 100,
      Math.round(Math.max(1.6, widest * Math.sqrt(1 - t * t)) * 100) / 100]);
  }
  return circles;
}

/* ---------------------------------------------------------------- the plan

   Each leg teaches, then tests: it starts in a wide calm pool (the grid),
   shows its idea gently, gives a calm stretch to drink in, then tests the
   idea harder, and ends in calm water at a gravel bar (the takeout).

   1 Put-in       wide and gentle: one mid-river rock, a calm pool, a taste of
                  a riffle, a long easy run-out.
   2 The Narrows  canyon walls close in: a fast slalom of rocks, a calm eddy
                  pool where the canyon opens (drink here), a second, faster
                  narrows with a riffle.
   3 Whirlpool    a long left bend with a whirlpool on its inside (go wide),
     Bend         then the island: the fast rocky left channel is shorter, the
                  calm right channel longer (and the place to drink).
   4 The Drop     two runs of rapids, a calmer lead-in to line up, the falls
                  (3.6 m: hit it straight or flip), then calm water to the bar. */
const PLAN = {
  start:{ x:0, y:0, heading:-62 },
  /* [length, turn in degrees, + left]: each bend's curvature rises and falls
     as a raised cosine, so the river never kinks */
  bends:[
    /* 1 Put-in: 0 to 380 */
    [44, 6], [76, 40], [84, -58], [56, 30], [52, -32], [68, 26],
    /* 2 The Narrows: 380 to 780 */
    [40, 4], [50, -30], [45, 44], [45, -50], [60, 36], [45, -56], [50, 52], [65, -22],
    /* 3 Whirlpool Bend: 780 to 1200 */
    [40, -6], [100, 104], [30, 0], [110, 56], [70, -78], [70, -20],
    /* 4 The Drop: 1200 to 1580 */
    [40, 4], [60, 40], [50, -46], [50, 40], [50, -4], [70, -32], [60, 18],
  ],
  width:[
    [0, 28], [40, 26], [70, 22], [120, 20], [180, 19], [200, 24], [215, 30], [250, 30],
    [268, 18], [285, 14], [305, 16], [330, 22], [350, 24], [380, 24],
    [395, 24], [420, 22], [445, 15], [470, 11], [515, 10], [545, 11], [562, 18], [580, 24],
    [605, 22], [625, 12], [640, 9.5], [690, 10], [712, 14], [735, 20], [752, 22], [780, 22],
    [800, 24], [825, 22], [850, 27], [890, 24], [920, 18], [945, 20], [966, 34], [1040, 34],
    [1062, 20], [1090, 17], [1130, 19], [1172, 22], [1200, 22],
    [1215, 24], [1245, 20], [1290, 15], [1310, 14], [1340, 15], [1360, 13], [1395, 15],
    [1420, 16], [1440, 16], [1452, 22], [1470, 28], [1520, 26], [1555, 24], [1580, 24],
  ],
  /* the current in the middle of the river (m/s); banks run slower */
  flow:[
    [0, 1.2], [35, 1.7], [70, 2.6], [180, 3], [200, 2.1], [215, 1.5], [250, 1.5],
    [268, 2.8], [280, 3.6], [300, 3.4], [320, 2.5], [345, 1.8], [360, 1.4], [380, 1.3],
    [395, 1.3], [420, 2], [445, 3.1], [470, 3.7], [545, 3.9], [565, 2.3], [580, 1.5],
    [605, 1.7], [625, 3.3], [640, 4.1], [700, 3.9], [725, 2.8], [745, 1.8], [760, 1.4], [780, 1.3],
    [800, 1.3], [825, 2.3], [850, 2.9], [890, 2.9], [920, 3.1], [945, 2.9], [966, 2.5],
    [1040, 2.5], [1060, 2.9], [1090, 3.3], [1115, 2.5], [1125, 1.7], [1150, 1.5], [1162, 1.4], [1200, 1.3],
    [1215, 1.3], [1245, 2.4], [1290, 3.3], [1310, 4.1], [1345, 3.9], [1360, 4.2], [1395, 3.6],
    [1420, 2.6], [1434, 3.4], [1440, 5.0], [1446, 5.5], [1452, 2.6], [1470, 1.7],
    [1520, 1.4], [1555, 1.3], [1580, 1.1],
  ],
  /* the water's surface (m): a gentle fall, steps at the riffles, the Drop */
  elev:[
    [0, 22], [268, 21], [285, 20.5], [470, 19.6], [545, 19], [640, 18.6], [700, 18],
    [1085, 16.8], [1105, 16.4], [1300, 15.8], [1335, 15.2], [1360, 15], [1395, 14.4],
    [1440, 14.2], [1441, 14.1], [1443, 12.6], [1446, 10.6], [1580, 10.4],
  ],
  /* [s, d, radius] */
  rocks:[
    /* 1 */
    [95, -7.6, 0.9], [102, -6.8, 0.6], [150, 2.2, 1.1], [232, 10, 1.0],
    [277, -3.6, 0.8], [285, 3.0, 0.9], [294, -0.4, 0.7], [318, 6.4, 0.8],
    /* 2 */
    [452, -3.0, 0.9], [482, 1.6, 1.0], [498, -2.0, 0.8], [512, 2.2, 0.9], [531, -1.6, 1.0],
    [548, 1.8, 0.8], [590, -7.0, 1.2], [632, -2.0, 0.8], [652, 2.0, 0.9], [668, -1.2, 0.8],
    [686, 1.8, 0.9], [703, -1.5, 0.8],
    /* 3: the outside of the bend, then the left channel */
    [846, -8.2, 1.0], [905, 3.0, 0.9],
    [962, 11.4, 0.8], [978, 13.4, 0.8], [993, 10.8, 1.0], [1009, 13.2, 0.8], [1025, 11.0, 0.9],
    [1039, 12.6, 0.7], [1095, -2.6, 0.9], [1101, 3.0, 0.8],
    /* 4 */
    [1262, 4.0, 0.9], [1308, -2.6, 0.9], [1316, 3.6, 1.0], [1325, -0.4, 0.8], [1334, 4.6, 0.9],
    [1339, -4.6, 0.8], [1358, 2.0, 1.0], [1366, -3.0, 0.9], [1375, 1.0, 0.8], [1384, -1.0, 1.1],
    [1390, 4.0, 0.8], [1437, -6.8, 0.9], [1437, 6.8, 0.9], [1490, -9.0, 1.2],
  ],
  /* the island at Whirlpool Bend: a lens of overlapping circles a little left
     of the middle, so the left channel is the narrower, faster one */
  islands:lens(1000, 46, 6.2, 1.0, 0.6),
  zones:[
    { k:"pool", s0:0, s1:32 },
    { k:"pool", s0:206, s1:256 },
    { k:"riffle", s0:270, s1:306, power:0.85 },
    { k:"bar", s0:344, s1:376, side:1 },
    { k:"pool", s0:380, s1:416 },
    { k:"narrows", s0:442, s1:560 },
    /* where the canyon opens: a slow eddy along the inside (left) bank */
    { k:"eddy", s0:566, s1:612, side:1, back:0.3 },
    { k:"narrows", s0:620, s1:716 },
    { k:"riffle", s0:645, s1:681, power:1.1 },
    { k:"bar", s0:746, s1:776, side:-1 },
    { k:"pool", s0:780, s1:816 },
    /* on the inside of the big left bend: it spins counter-clockwise */
    { k:"whirlpool", s0:834, s1:896, at:[864, 6.4], r:10.5, core:2.6, spin:1, rot:2.6, pull:0.7, still:0.7 },
    /* the island: left (fast, rocky, shorter) and right (calm, longer) */
    { k:"split", s0:952, s1:1050, fast:1.45, calm:0.62 },
    { k:"riffle", s0:1085, s1:1106, power:1.1 },
    /* the run-out: calm water to drink in for those who took the fast channel */
    { k:"pool", s0:1120, s1:1152 },
    { k:"bar", s0:1154, s1:1190, side:1 },
    { k:"pool", s0:1200, s1:1236 },
    { k:"riffle", s0:1300, s1:1341, power:1.1 },
    { k:"riffle", s0:1352, s1:1393, power:1.2 },
    { k:"drop", s0:1440, s1:1446 },
    { k:"pool", s0:1452, s1:1522 },
    { k:"bar", s0:1546, s1:1578, side:-1 },
  ],
  legs:[
    { id:"putin", name:"Put-in", s0:0, s1:380, grid:26, finish:352 },
    { id:"narrows", name:"The Narrows", s0:380, s1:780, grid:408, finish:754 },
    { id:"whirlpool", name:"Whirlpool Bend", s0:780, s1:1200, grid:808, finish:1162 },
    { id:"drop", name:"The Drop", s0:1200, s1:1580, grid:1228, finish:1557 },
  ],
};

/* ---------------------------------------------------------------- building */

const rad = deg => deg * Math.PI / 180;
const r2 = value => Math.round(value * 100) / 100;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const smooth = t => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/* a keyframed value: smoothstep between keys (widths) or straight (the rest) */
function keyed(keys, s, eased) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k += 1) {
    const [s1, v1] = keys[k];
    if (s <= s1) {
      const [s0, v0] = keys[k - 1];
      const t = s1 > s0 ? (s - s0) / (s1 - s0) : 1;
      return v0 + (v1 - v0) * (eased ? smooth(t) : t);
    }
  }
  return keys[keys.length - 1][1];
}

function buildCourse(plan) {
  const total = plan.bends.reduce((sum, [len]) => sum + len, 0);
  const curvature = s => {
    let at = 0;
    for (const [len, turn] of plan.bends) {
      if (s < at + len) return (rad(turn) / len) * (1 - Math.cos(2 * Math.PI * (s - at) / len));
      at += len;
    }
    return 0;
  };
  /* integrate heading and position in small steps (midpoint rule) */
  const sub = 0.25;
  let x = plan.start.x, y = plan.start.y, heading = rad(plan.start.heading);
  const line = [];
  for (let s = 0; s <= total + 1e-9; s += sub) {
    const along = Math.round(s / sub);
    if (along % (STEP / sub) === 0) line.push([r2(x), r2(y), r2(keyed(plan.width, s, true))]);
    const mid = heading + curvature(s + sub / 2) * sub / 2;
    x += Math.cos(mid) * sub;
    y += Math.sin(mid) * sub;
    heading += curvature(s + sub / 2) * sub;
  }
  const base = { id:COURSE_ID, line, flow:plan.flow.map(([s, v]) => [s, v]),
    elev:plan.elev.map(([s, z]) => [s, z]) };
  const place = ([s, d, r]) => {
    const f = frameAt(base, s);
    return [r2(f.x + f.nx * d), r2(f.y + f.ny * d), r];
  };
  const zones = plan.zones.map(zone => {
    if (zone.k !== "whirlpool") return { ...zone };
    const { at, ...rest } = zone;
    const [cx, cy] = place([at[0], at[1], 0]);
    return { ...rest, x:cx, y:cy };
  });
  return Object.freeze({
    ...base,
    rocks:plan.rocks.map(place),
    islands:plan.islands.map(place),
    zones,
    legs:plan.legs.map(leg => ({ ...leg })),
  });
}

/* ---------------------------------------------------------------- sampling

   Every helper takes a course in the contract's format (COURSE, or one sent
   over the wire) and caches what it derives from it. */

const CACHE = new WeakMap();

function geom(course) {
  let g = CACHE.get(course);
  if (g) return g;
  const line = course.line;
  const n = line.length;
  const xs = new Float64Array(n), ys = new Float64Array(n), ws = new Float64Array(n), cum = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    xs[i] = line[i][0]; ys[i] = line[i][1]; ws[i] = line[i][2];
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const segs = Math.max(1, n - 1);
  const sx = new Float64Array(segs), sy = new Float64Array(segs), sl = new Float64Array(segs);
  for (let i = 0; i < n - 1; i += 1) {
    const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i], len = Math.hypot(dx, dy) || 1;
    sx[i] = dx / len; sy[i] = dy / len; sl[i] = Math.hypot(dx, dy);
  }
  /* a vertex's tangent averages its two segments, so headings blend smoothly */
  const vx = new Float64Array(n), vy = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.max(0, i - 1), b = Math.min(n - 2, i);
    let tx = sx[a] + sx[b], ty = sy[a] + sy[b];
    const len = Math.hypot(tx, ty) || 1;
    vx[i] = tx / len; vy[i] = ty / len;
  }
  g = { n, xs, ys, ws, cum, sx, sy, sl, vx, vy, total:cum[n - 1],
    zones:(course.zones || []).slice().sort((a, b) => a.s0 - b.s0),
    rocks:[], islands:[], whirlpools:[] };
  CACHE.set(course, g);
  /* obstacles, placed back on the line once */
  const onLine = ([x, y, r]) => { const near = nearestS(course, x, y); return { x, y, r, s:near.s, d:near.d }; };
  g.rocks = (course.rocks || []).map(onLine).sort((a, b) => a.s - b.s);
  g.islands = (course.islands || []).map(onLine).sort((a, b) => a.s - b.s);
  g.whirlpools = g.zones.filter(zone => zone.k === "whirlpool" && Number.isFinite(zone.x));
  g.drops = g.zones.filter(zone => zone.k === "drop");
  return g;
}

/* the segment holding distance s */
function segIndex(g, s) {
  if (s <= 0) return 0;
  if (s >= g.total) return g.n - 2;
  let lo = 0, hi = g.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid] <= s) lo = mid; else hi = mid;
  }
  return Math.min(lo, g.n - 2);
}

/* the river's length along the centreline */
export const courseLength = course => geom(course).total;

/* the centreline at distance s: position, width, unit tangent (downstream)
   and unit normal (to the left) */
export function frameAt(course, s) {
  const g = geom(course);
  const i = segIndex(g, s);
  const len = g.sl[i];
  const u = len > 0 ? clamp((s - g.cum[i]) / len, 0, 1) : 0;
  const x = g.xs[i] + (g.xs[i + 1] - g.xs[i]) * u;
  const y = g.ys[i] + (g.ys[i + 1] - g.ys[i]) * u;
  const w = g.ws[i] + (g.ws[i + 1] - g.ws[i]) * u;
  let tx = g.vx[i] * (1 - u) + g.vx[i + 1] * u, ty = g.vy[i] * (1 - u) + g.vy[i + 1] * u;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  return { s, x, y, w, tx, ty, nx:-ty, ny:tx };
}

/* the nearest point on the centreline to (x, y): distance s, signed offset d
   (+ left). A hint (the s found last tick) keeps the search local. */
export function nearestS(course, x, y, hint) {
  const g = geom(course);
  const last = g.n - 2;
  let lo = 0, hi = last;
  if (Number.isFinite(hint)) {
    const at = segIndex(g, hint);
    lo = Math.max(0, at - 6);
    hi = Math.min(last, at + 10);
  }
  for (;;) {
    let best = Infinity, bi = lo, bu = 0;
    for (let i = lo; i <= hi; i += 1) {
      const ax = g.xs[i], ay = g.ys[i];
      const dx = g.xs[i + 1] - ax, dy = g.ys[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      const px = ax + dx * u - x, py = ay + dy * u - y;
      const d2 = px * px + py * py;
      if (d2 < best) { best = d2; bi = i; bu = u; }
    }
    /* the best sat on the window's edge: widen it and look again */
    const widen = (bi === lo && lo > 0) || (bi === hi && hi < last);
    if (widen && hi - lo < last) {
      lo = Math.max(0, lo - 24);
      hi = Math.min(last, hi + 24);
      continue;
    }
    const s = g.cum[bi] + g.sl[bi] * bu;
    const f = frameAt(course, s);
    return { s, d:(x - f.x) * f.nx + (y - f.y) * f.ny, w:f.w, f };
  }
}

/* a piecewise-linear [[s, value], ...] table */
function table(rows, s) {
  if (!rows?.length) return 0;
  if (s <= rows[0][0]) return rows[0][1];
  let lo = 0, hi = rows.length - 1;
  if (s >= rows[hi][0]) return rows[hi][1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][0] <= s) lo = mid; else hi = mid;
  }
  const [s0, v0] = rows[lo], [s1, v1] = rows[hi];
  return s1 > s0 ? v0 + (v1 - v0) * (s - s0) / (s1 - s0) : v1;
}

/* the current in the middle of the river at s (m/s) */
export const flowSpeed = (course, s) => table(course.flow, s);
/* the water's surface height at s (m) */
export const elevAt = (course, s) => table(course.elev, s);
export const widthAt = (course, s) => frameAt(course, s).w;

/* every zone that holds s */
export const zonesAt = (course, s) => geom(course).zones.filter(zone => s >= zone.s0 && s <= zone.s1);
export const inZone = (course, s, k) => geom(course).zones.some(zone => zone.k === k && s >= zone.s0 && s <= zone.s1);

/* how far into a zone s is, 0 at either end rising to 1 within `ramp` metres:
   a zone's effect fades in and out instead of switching */
const zoneRamp = (zone, s, ramp = 8) => Math.min(smooth((s - zone.s0) / ramp), smooth((zone.s1 - s) / ramp));

/* the island's extent across the river at s: [dRight, dLeft], or null */
export function islandSpan(course, s) {
  let lo = Infinity, hi = -Infinity;
  for (const island of geom(course).islands) {
    const ds = s - island.s;
    if (ds * ds >= island.r * island.r) continue;
    const h = Math.sqrt(island.r * island.r - ds * ds);
    lo = Math.min(lo, island.d - h);
    hi = Math.max(hi, island.d + h);
  }
  return lo < hi ? [lo, hi] : null;
}

/* rocks within `range` metres of s along the river */
export function rocksNear(course, s, range = 8) {
  const rocks = geom(course).rocks;
  let lo = 0, hi = rocks.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rocks[mid].s < s - range) lo = mid + 1; else hi = mid; }
  const near = [];
  for (let k = lo; k < rocks.length && rocks[k].s <= s + range; k += 1) near.push(rocks[k]);
  return near;
}
/* island circles within `range` of s */
export const islandsNear = (course, s, range = 10) =>
  geom(course).islands.filter(island => Math.abs(island.s - s) <= range + island.r);

/* the current at (x, y): { ux, uy } m/s, plus where that is (s, d, w), the
   middle-of-river speed v and the water's curl (its spin, rad/s, twice the
   rate a floating thing turns). `whirl` scales a whirlpool's grip (the sim
   lets go of anyone it has held long enough). */
export function flowAt(course, x, y, { hint, whirl = 1 } = {}) {
  const g = geom(course);
  const near = nearestS(course, x, y, hint);
  const { s, d, f } = near;
  const half = Math.max(0.5, f.w / 2);
  const v = flowSpeed(course, s);
  const q = clamp(d / half, -1, 1);
  let along = 1 - WATER.BANK * q * q;
  let curl = 2 * v * WATER.BANK * q / half;
  for (const zone of g.zones) {
    if (s < zone.s0) break;
    if (s > zone.s1) continue;
    if (zone.k === "split") {
      const span = islandSpan(course, s);
      if (!span) continue;
      const ramp = zoneRamp(zone, s, 12);
      if (d >= span[1]) {
        const width = Math.max(0.5, half - span[1]);
        const qc = clamp(((d - span[1]) / width) * 2 - 1, -1, 1);
        along += ((1 - WATER.BANK * qc * qc) * zone.fast - along) * ramp;
      } else if (d <= span[0]) {
        const width = Math.max(0.5, span[0] + half);
        const qc = clamp(((d + half) / width) * 2 - 1, -1, 1);
        along += ((1 - WATER.BANK * qc * qc) * zone.calm - along) * ramp;
      }
    } else if (zone.k === "eddy") {
      const toward = q * (zone.side || 1);
      if (toward > 0.3) along += (-(zone.back ?? 0.3) - along) * smooth((toward - 0.3) / 0.5) * zoneRamp(zone, s);
    }
  }
  let ux = f.tx * v * along, uy = f.ty * v * along;
  /* the water parts around the island: near its nose and sides it carries
     you off it, so nothing drifts onto it and stays */
  if (g.islands.length) {
    const ahead = islandSpan(course, s + 5) || islandSpan(course, s);
    if (ahead) {
      const mid = (ahead[0] + ahead[1]) / 2;
      const gap = Math.abs(d - mid) - (ahead[1] - ahead[0]) / 2;
      if (gap < 3) {
        const push = v * 0.45 * (1 - smooth(gap / 3)) * (d >= mid ? 1 : -1);
        ux += f.nx * push;
        uy += f.ny * push;
      }
    }
  }
  /* the water parts around a rock too: just upstream of one it carries you
     to the nearer side, so nothing stays pinned on it */
  for (const rock of g.rocks) {
    if (rock.s < s - rock.r) continue;
    if (rock.s > s + rock.r + 2.5) break;
    const off = d - rock.d;
    const gap = Math.abs(off) - rock.r;
    if (gap > 1.6) continue;
    const push = Math.max(v, 1) * 0.5 * (1 - smooth(gap / 1.6)) * (off >= 0 ? 1 : -1);
    ux += f.nx * push;
    uy += f.ny * push;
  }
  for (const pool of g.whirlpools) {
    const rx = x - pool.x, ry = y - pool.y;
    const rho = Math.hypot(rx, ry);
    if (rho >= pool.r) continue;
    const edge = (1 - smooth((rho - pool.r * 0.5) / (pool.r * 0.5))) * whirl;
    const core = rho < pool.core;
    const swirl = pool.rot * (core ? rho / pool.core : pool.core / rho) * edge;
    const pull = pool.pull * edge * (core ? rho / pool.core : 1);
    const calm = 1 - (pool.still ?? 0.7) * (1 - smooth(rho / pool.r)) * whirl;
    ux *= calm; uy *= calm;
    if (rho > 1e-6) {
      const ex = rx / rho, ey = ry / rho;
      ux += (pool.spin || 1) * swirl * -ey - pull * ex;
      uy += (pool.spin || 1) * swirl * ex - pull * ey;
    }
    if (core) curl += (pool.spin || 1) * 2 * pool.rot / pool.core * edge;
  }
  return { ux, uy, s, d, w:f.w, v, curl, tx:f.tx, ty:f.ty };
}

/* inside the banks and not on the island */
export function isInside(course, x, y, hint) {
  const g = geom(course);
  const near = nearestS(course, x, y, hint);
  if (near.s <= 0 || near.s >= g.total) return false;
  if (Math.abs(near.d) > near.w / 2) return false;
  return !g.islands.some(island => Math.hypot(x - island.x, y - island.y) < island.r);
}

export const legAt = (course, index) => course.legs[Math.max(0, Math.min(course.legs.length - 1, index | 0))];
/* the leg's length, start line to finish */
export const legLength = (course, index) => { const leg = legAt(course, index); return leg.finish - leg.grid; };

/* the starting grid: n slots, pole first. Rows across the river, alternating
   wide and narrow rows so the rows stagger; within a row from the middle
   out. Each slot: { x, y, a, s, d } (a: heading, downstream). */
export function gridSlots(course, legIndex, n) {
  const leg = legAt(course, legIndex);
  const slots = [];
  for (let row = 0; slots.length < n; row += 1) {
    const s = leg.grid - row * GRID.ROW;
    const f = frameAt(course, s);
    const fits = Math.max(1, Math.floor((f.w - 2 * GRID.MARGIN) / GRID.ACROSS) + 1);
    const wide = Math.min(GRID.MAX_PER_ROW, fits);
    const across = row % 2 && wide > 1 ? wide - 1 : wide;
    const count = Math.min(across, n - slots.length);
    const lanes = [];
    for (let k = 0; k < across; k += 1) lanes.push((k - (across - 1) / 2) * GRID.ACROSS);
    lanes.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    for (const d of lanes.slice(0, count))
      slots.push({ x:f.x + f.nx * d, y:f.y + f.ny * d, a:Math.atan2(f.ty, f.tx), s, d });
  }
  return slots;
}

/* the takeout bar for a leg (a zone "bar"), and where the k-th rider in
   parks on it */
export function barOf(course, legIndex) {
  const leg = legAt(course, legIndex);
  return geom(course).zones.find(zone => zone.k === "bar" && zone.s0 >= leg.s0 && zone.s1 <= leg.s1) || null;
}
export function beachSlot(course, legIndex, k) {
  const leg = legAt(course, legIndex);
  const side = barOf(course, legIndex)?.side || 1;
  const column = k % BEACH.COLUMNS;
  const s = Math.min(leg.s1 - 1, leg.finish + BEACH.PAST + Math.floor(k / BEACH.COLUMNS) * BEACH.ALONG);
  const f = frameAt(course, s);
  const d = side * (f.w / 2 - BEACH.IN - column * BEACH.ALONG);
  return { x:f.x + f.nx * d, y:f.y + f.ny * d, a:Math.atan2(f.ty, f.tx), s, d };
}

/* the downstream heading at s */
export const headingAt = (course, s) => { const f = frameAt(course, s); return Math.atan2(f.ty, f.tx); };

export const COURSE = buildCourse(PLAN);
