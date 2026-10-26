/* Signed distance sculpting, for the critters' bake only
   (scripts/float-bake-critters.mjs). Nothing here runs at play time: the
   bake turns a Sculpt into a mesh with its colors, fur, occlusion and skin
   weights, and the screen loads the result.

   A critter is one soft mass: parts (ellipsoids, round cones, round boxes)
   melted together with a smooth minimum, each part carrying its own color,
   fur and bone binding, so where two parts meet their colors and weights
   blend the same way their surfaces do. Cuts carve sockets and nostrils.
   Paint layers then lay markings over the whole mass (a muzzle, a belly, the
   swim trunks, spots, bands, blush).

   Units are metres, y up, the critter facing -z, its seat at the origin. */

const { sqrt, abs, min, max, exp, cos, sin } = Math;

/* ── smooth booleans ──────────────────────────────────────────────────── */

/* cubic smooth minimum (C2, so fillets shade without a crease): k is the
   most material the blend adds, and two surfaces blend within 6k */
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const kk = 6 * k;
  const h = max(kk - abs(a - b), 0) / kk;
  return (a < b ? a : b) - h * h * h * kk / 6;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mixN = (a, b, t) => a + (b - a) * t;

/* ── frames: a part may be turned (Euler XYZ, as three's) ─────────────── */

/* the transpose of R = Rx * Ry * Rz: maps a world offset into the part's frame */
function inverseRotation([rx = 0, ry = 0, rz = 0] = []) {
  const cx = cos(rx), sx = sin(rx), cy = cos(ry), sy = sin(ry), cz = cos(rz), sz = sin(rz);
  /* R (row major) for XYZ order, as three's Matrix4.makeRotationFromEuler */
  const R = [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}

/* ── primitives: { f(x, y, z) -> distance, lo, hi } ────────────────────── */

function ellipsoidD(x, y, z, rx, ry, rz) {
  const a = x / rx, b = y / ry, c = z / rz;
  const k0 = sqrt(a * a + b * b + c * c);
  const a2 = a / rx, b2 = b / ry, c2 = c / rz;
  const k1 = sqrt(a2 * a2 + b2 * b2 + c2 * c2);
  return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
}

export function ellipsoid(c, r, rot = null) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r;
  const R = max(rx, ry, rz);
  const box = { lo: [cx - R, cy - R, cz - R], hi: [cx + R, cy + R, cz + R] };
  if (!rot) return { ...box, f: (x, y, z) => ellipsoidD(x - cx, y - cy, z - cz, rx, ry, rz) };
  const M = inverseRotation(rot);
  return { ...box, f: (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    return ellipsoidD(M[0] * dx + M[1] * dy + M[2] * dz, M[3] * dx + M[4] * dy + M[5] * dz, M[6] * dx + M[7] * dy + M[8] * dz, rx, ry, rz);
  } };
}

export const sphere = (c, r) => {
  const [cx, cy, cz] = c;
  return { lo: [cx - r, cy - r, cz - r], hi: [cx + r, cy + r, cz + r], f: (x, y, z) => sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r };
};

/* a cone between two spheres, rounded at both ends (Inigo Quilez's exact
   round cone): limbs, snouts, ears, tails, horns */
export function roundCone(a, b, r1, r2) {
  const [ax, ay, az] = a, [bx, by, bz] = b;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const R = max(r1, r2);
  return {
    lo: [min(ax, bx) - R, min(ay, by) - R, min(az, bz) - R],
    hi: [max(ax, bx) + R, max(ay, by) + R, max(az, bz) + R],
    f(x, y, z) {
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
      return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}
export const capsule = (a, b, r) => roundCone(a, b, r, r);

/* a box with rounded edges: half extents, edge radius */
export function roundBox(c, half, r, rot = null) {
  const [cx, cy, cz] = c, [hx, hy, hz] = half;
  const R = sqrt(hx * hx + hy * hy + hz * hz);
  const M = rot ? inverseRotation(rot) : null;
  return {
    lo: [cx - R, cy - R, cz - R], hi: [cx + R, cy + R, cz + R],
    f(x, y, z) {
      let dx = x - cx, dy = y - cy, dz = z - cz;
      if (M) { const lx = M[0] * dx + M[1] * dy + M[2] * dz, ly = M[3] * dx + M[4] * dy + M[5] * dz, lz = M[6] * dx + M[7] * dy + M[8] * dz; dx = lx; dy = ly; dz = lz; }
      const qx = abs(dx) - hx + r, qy = abs(dy) - hy + r, qz = abs(dz) - hz + r;
      const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
      return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, max(qy, qz)), 0) - r;
    },
  };
}

/* a chain of round cones through points (radii per point), melted together:
   tails, horns, curling plumes */
export function chain(points, radii, k = 0.004) {
  const cones = [];
  for (let i = 0; i < points.length - 1; i++) cones.push(roundCone(points[i], points[i + 1], radii[i], radii[i + 1]));
  const lo = [0, 1, 2].map(j => min(...cones.map(c => c.lo[j]))), hi = [0, 1, 2].map(j => max(...cones.map(c => c.hi[j])));
  return { lo, hi, f(x, y, z) { let d = cones[0].f(x, y, z); for (let i = 1; i < cones.length; i++) d = smin(d, cones[i].f(x, y, z), k); return d; } };
}

/* any primitive seen through a deformation of space: map(x, y, z, out)
   writes the point to look up; scale is the deformation's largest stretch
   (it keeps the result a lower bound) */
export function warp(prim, map, { pad = 0.05, scale = 1 } = {}) {
  const q = [0, 0, 0];
  return {
    lo: prim.lo.map(v => v - pad), hi: prim.hi.map(v => v + pad),
    f(x, y, z) { map(x, y, z, q); return prim.f(q[0], q[1], q[2]) / scale; },
  };
}

/* a primitive cut by half-spaces (flat tops, flat sides), softly: each cut
   [nx, ny, nz, d] keeps the side where dot(p, n) < d */
export function trim(prim, cuts, k = 0.03) {
  return {
    lo: prim.lo, hi: prim.hi,
    f(x, y, z) {
      let d = prim.f(x, y, z);
      for (let i = 0; i < cuts.length; i++) { const c = cuts[i]; d = smax(d, x * c[0] + y * c[1] + z * c[2] - c[3], k); }
      return d;
    },
  };
}

/* the union of several primitives, hard or melted */
export function union(prims, k = 0) {
  const lo = [0, 1, 2].map(j => min(...prims.map(c => c.lo[j]))), hi = [0, 1, 2].map(j => max(...prims.map(c => c.hi[j])));
  return { lo, hi, f(x, y, z) { let d = prims[0].f(x, y, z); for (let i = 1; i < prims.length; i++) d = smin(d, prims[i].f(x, y, z), k); return d; } };
}

/* ── colors ───────────────────────────────────────────────────────────── */

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/* a hex as linear rgb (colors blend in linear light) */
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`sdf: bad color ${hex}`);
  return [0, 2, 4].map(i => srgbToLinear(parseInt(m[1].slice(i, i + 2), 16) / 255));
}
export const toSrgb8 = c => Math.round(clamp(linearToSrgb(clamp(c, 0, 1)), 0, 1) * 255);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ── noise, for spots, bristles and fur variation (deterministic) ─────── */

function hash3(ix, iy, iz, seed) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* smooth value noise in 0..1 */
export function noise3(x, y, z, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
    r += w * hash3(ix + dx, iy + dy, iz + dz, seed);
  }
  return r;
}
export function fbm3(x, y, z, seed = 1, octaves = 3) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < octaves; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
/* cellular (Worley) distance to the nearest of a jittered lattice of points */
export function cells3(x, y, z, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 9, second = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    const px = cx + hash3(cx, cy, cz, seed), py = cy + hash3(cx, cy, cz, seed + 1), pz = cz + hash3(cx, cy, cz, seed + 2);
    const d = sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2);
    if (d < best) { second = best; best = d; } else if (d < second) second = d;
  }
  return [best, second];
}

/* ── the sculpt ───────────────────────────────────────────────────────── */

/* the material every point carries: linear color, fur length (0 bare, 1 a
   full pelt), fuzz (sheen: 0 smooth like horn or a shell, 1 plush), roughness
   (1 plush .. 0.15 polished), the rider's color (the swim trunks) */
export const blankMaterial = () => ({ color: [1, 1, 1], fur: 1, fuzz: 1, rough: 1, tint: 0 });

export class Sculpt {
  constructor(id) {
    this.id = id;
    this.parts = [];
    this.cuts = [];
    this.paints = [];
    this.byName = new Map();
    /* the largest blend of any part so far (how far a part's influence reaches) */
    this.maxK = 0;
  }

  /* a lump of the mass.
     k: how softly it melts into what came before (0: a hard join)
     bone: a bone name, or fn(x, y, z) -> [[bone, weight], ...]
     color: a hex, or fn(x, y, z) -> linear rgb
     fur, fuzz, rough: its surface (see blankMaterial)
     movable: an arm, leg or tail; its shadow on the body is not baked
     tau: how sharply it owns the surface near it (for colors and weights) */
  part(name, shape, { k = 0.02, bone = "chest", color = "#888888", fur = 1, fuzz = 1, rough = 1, tint = 0, movable = false, tau = null, group = null } = {}) {
    if (this.byName.has(name)) throw new Error(`sculpt ${this.id}: part ${name} twice`);
    const col = typeof color === "function" ? color : rgb(color);
    /* a limb owns only its own surface and the fillet where it meets the
       body, never the body's side across the gap under a hanging arm */
    const p = { name, shape, f: shape.f, k, bone, color: col, fur, fuzz, rough, tint, movable, tau: tau ?? (movable ? 0.0045 : Math.max(0.006, k * 1.2)), group: group || name, index: this.parts.length };
    this.parts.push(p);
    this.byName.set(name, p);
    this.maxK = max(this.maxK, k);
    return p;
  }

  /* carve: a smooth subtraction (sockets, nostrils); its rim may carry a color */
  cut(name, shape, { k = 0.006, color = null, fur = null, fuzz = null, rough = null, width = 0.01 } = {}) {
    this.cuts.push({ name, shape, f: shape.f, k, color: color ? rgb(color) : null, fur, fuzz, rough, width });
  }

  /* a paint layer: fn(p, n, own, m) changes the material m in place. p and n
     are [x, y, z]; own(name) is how much that part owns the point (0..1) */
  paint(fn) { this.paints.push(fn); }

  /* bounds of the whole mass (with room for its blends) */
  bounds(pad = 0.03) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of this.parts) for (let j = 0; j < 3; j++) { lo[j] = min(lo[j], p.shape.lo[j]); hi[j] = max(hi[j], p.shape.hi[j]); }
    return { lo: lo.map(v => v - pad), hi: hi.map(v => v + pad) };
  }

  /* the distance to the mass. A part further (by its box) than any blend in
     the sculpt reaches (6k for the largest k, and a margin) stands in as
     its box's distance, a lower bound: exact near the surface, and never a
     jump in the field, which the mesh would keep as a seam. A cut is
     skipped beyond its own blend's reach. */
  dist(x, y, z, skip = null) {
    let d = Infinity;
    const parts = this.parts;
    const far = 6 * this.maxK + 0.06;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (skip && skip(p)) continue;
      const lo = p.shape.lo, hi = p.shape.hi;
      const ox = max(lo[0] - x, 0, x - hi[0]), oy = max(lo[1] - y, 0, y - hi[1]), oz = max(lo[2] - z, 0, z - hi[2]);
      const boxD = sqrt(ox * ox + oy * oy + oz * oz);
      const di = boxD > far ? boxD : p.f(x, y, z);
      d = d === Infinity ? di : smin(d, di, p.k);
    }
    for (let i = 0; i < this.cuts.length; i++) {
      const c = this.cuts[i];
      const lo = c.shape.lo, hi = c.shape.hi, m = 6 * c.k + 0.06;
      if (x < lo[0] - m || x > hi[0] + m || y < lo[1] - m || y > hi[1] + m || z < lo[2] - m || z > hi[2] + m) continue;
      d = smax(d, -c.f(x, y, z), c.k);
    }
    return d;
  }

  /* each part's own distance at a point (exact), into out */
  partDistances(x, y, z, out) {
    for (let i = 0; i < this.parts.length; i++) out[i] = this.parts[i].f(x, y, z);
    return out;
  }

  /* how much each part owns a surface point: a soft nearest, sharpened by tau */
  ownership(dists, out) {
    let dmin = Infinity;
    for (let i = 0; i < dists.length; i++) if (dists[i] < dmin) dmin = dists[i];
    let sum = 0;
    for (let i = 0; i < dists.length; i++) {
      const w = exp(-max(0, dists[i] - dmin) / this.parts[i].tau);
      out[i] = w; sum += w;
    }
    for (let i = 0; i < dists.length; i++) out[i] /= sum;
    return out;
  }

  /* the outward normal (central differences) */
  normal(x, y, z, eps = 0.0012, out = [0, 0, 0]) {
    const dx = this.dist(x + eps, y, z) - this.dist(x - eps, y, z);
    const dy = this.dist(x, y + eps, z) - this.dist(x, y - eps, z);
    const dz = this.dist(x, y, z + eps) - this.dist(x, y, z - eps);
    const l = sqrt(dx * dx + dy * dy + dz * dz) || 1;
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return out;
  }

  /* walk a point onto the surface (Newton steps along the gradient) */
  project(p, iterations = 4) {
    const e = 0.0008;
    for (let it = 0; it < iterations; it++) {
      const [x, y, z] = p;
      const d = this.dist(x, y, z);
      if (abs(d) < 1e-6) break;
      const gx = (this.dist(x + e, y, z) - this.dist(x - e, y, z)) / (2 * e);
      const gy = (this.dist(x, y + e, z) - this.dist(x, y - e, z)) / (2 * e);
      const gz = (this.dist(x, y, z + e) - this.dist(x, y, z - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-10) break;
      const s = d / g2;
      p[0] = x - gx * s; p[1] = y - gy * s; p[2] = z - gz * s;
    }
    return p;
  }

  /* march from an inside point along a direction to where the mass ends;
     returns the surface point (or null) */
  raycast(origin, dir, { maxT = 1.5, skip = null } = {}) {
    const [ox, oy, oz] = origin;
    const l = sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
    const dx = dir[0] / l, dy = dir[1] / l, dz = dir[2] / l;
    let t = 0, prev = this.dist(ox, oy, oz, skip);
    const step = 0.004;
    if (prev > 0) {
      /* outside: march in until we enter */
      for (; t < maxT; t += max(step, prev * 0.9)) {
        const d = this.dist(ox + dx * t, oy + dy * t, oz + dz * t, skip);
        if (d < 0) return bisect(this, origin, [dx, dy, dz], t - max(step, prev * 0.9), t, skip);
        prev = d;
      }
      return null;
    }
    for (t = step; t < maxT; t += step) {
      const d = this.dist(ox + dx * t, oy + dy * t, oz + dz * t, skip);
      if (d > 0) return bisect(this, origin, [dx, dy, dz], t - step, t, skip);
    }
    return null;
  }

  /* the material at a surface point with normal n */
  material(p, n, scratch) {
    const { dists, own } = scratch;
    this.partDistances(p[0], p[1], p[2], dists);
    this.ownership(dists, own);
    const m = blankMaterial();
    m.color = [0, 0, 0]; m.fur = 0; m.fuzz = 0; m.rough = 0; m.tint = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const w = own[i];
      if (w < 1e-4) continue;
      const part = this.parts[i];
      const c = typeof part.color === "function" ? part.color(p[0], p[1], p[2], n) : part.color;
      m.color[0] += c[0] * w; m.color[1] += c[1] * w; m.color[2] += c[2] * w;
      m.fur += part.fur * w; m.fuzz += part.fuzz * w; m.rough += part.rough * w; m.tint += part.tint * w;
    }
    for (const c of this.cuts) {
      if (!c.color && c.fur == null) continue;
      const dc = c.f(p[0], p[1], p[2]);
      const t = 1 - smooth(0, c.width, dc);
      if (t <= 0) continue;
      if (c.color) m.color = lerp3(m.color, c.color, t);
      if (c.fur != null) m.fur = mixN(m.fur, c.fur, t);
      if (c.fuzz != null) m.fuzz = mixN(m.fuzz, c.fuzz, t);
      if (c.rough != null) m.rough = mixN(m.rough, c.rough, t);
    }
    const ownOf = name => { const part = this.byName.get(name); return part ? own[part.index] : 0; };
    const ownGroup = group => { let s = 0; for (const part of this.parts) if (part.group === group) s += own[part.index]; return s; };
    for (const fn of this.paints) fn(p, n, ownOf, m, ownGroup);
    return m;
  }

  /* bone weights at a surface point, from the parts that own it */
  boneWeights(p, own, out = new Map()) {
    out.clear();
    for (let i = 0; i < this.parts.length; i++) {
      const w = own[i];
      if (w < 1e-4) continue;
      const b = this.parts[i].bone;
      if (typeof b === "string") out.set(b, (out.get(b) || 0) + w);
      else for (const [name, bw] of (Array.isArray(b) ? b : b(p[0], p[1], p[2]))) if (bw > 0) out.set(name, (out.get(name) || 0) + w * bw);
    }
    return out;
  }

  /* soft ambient occlusion: how much of the open air above a point the mass
     takes up. Movable parts (arms, legs, tails) cast none on the rest, since
     they will not stay where they were sculpted */
  occlusion(p, n, ownPart = null, { reach = 0.045, samples = 5, strength = 1.5 } = {}) {
    const skip = part => part.movable && part !== ownPart;
    let occ = 0, sca = 1, total = 0;
    for (let i = 1; i <= samples; i++) {
      const h = reach * (i / samples) ** 1.4;
      const d = this.dist(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h, skip);
      occ += max(0, h - d) * sca;
      total += h * sca;
      sca *= 0.82;
    }
    return clamp(1 - strength * occ / total, 0, 1);
  }
}

function bisect(sculpt, origin, dir, t0, t1, skip) {
  let a = t0, b = t1;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    const d = sculpt.dist(origin[0] + dir[0] * m, origin[1] + dir[1] * m, origin[2] + dir[2] * m, skip);
    if (d > 0) b = m; else a = m;
  }
  const t = (a + b) / 2;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

/* bone weights along a segment from a to b, through named bones at
   fractions: [[bone, t], ...] (t ascending), blended over width */
export function alongBones(a, b, stops, width = 0.18) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const t = clamp(((x - a[0]) * bax + (y - a[1]) * bay + (z - a[2]) * baz) / l2, 0, 1);
    const out = [];
    for (let i = 0; i < stops.length; i++) {
      const lo = i === 0 ? -Infinity : (stops[i - 1][1] + stops[i][1]) / 2;
      const hi = i === stops.length - 1 ? Infinity : (stops[i][1] + stops[i + 1][1]) / 2;
      const wl = lo === -Infinity ? 1 : smooth(lo - width / 2, lo + width / 2, t);
      const wh = hi === Infinity ? 1 : 1 - smooth(hi - width / 2, hi + width / 2, t);
      out.push([stops[i][0], wl * wh]);
    }
    return out;
  };
}

/* bone weights along a polyline (tails): bones at cumulative fractions */
export function alongPath(points, stops, width = 0.22) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const l = sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2);
    segs.push({ a, b, l, at: total });
    total += l;
  }
  const flat = alongBones([0, 0, 0], [1, 0, 0], stops, width);
  return (x, y, z) => {
    let best = Infinity, t = 0;
    for (const s of segs) {
      const bx = s.b[0] - s.a[0], by = s.b[1] - s.a[1], bz = s.b[2] - s.a[2];
      const u = clamp(((x - s.a[0]) * bx + (y - s.a[1]) * by + (z - s.a[2]) * bz) / (s.l * s.l), 0, 1);
      const d = (x - s.a[0] - bx * u) ** 2 + (y - s.a[1] - by * u) ** 2 + (z - s.a[2] - bz * u) ** 2;
      if (d < best) { best = d; t = (s.at + u * s.l) / total; }
    }
    return flat(t, 0, 0);
  };
}

/* an ellipsoid on any frame: ux, uy, uz the world directions of its own
   axes (orthonormal) */
export function ellipsoidB(c, r, [ux, uy, uz]) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r;
  const R = Math.max(rx, ry, rz);
  return {
    lo: [cx - R, cy - R, cz - R], hi: [cx + R, cy + R, cz + R],
    f(x, y, z) {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      return ellipsoidD(dx * ux[0] + dy * ux[1] + dz * ux[2], dx * uy[0] + dy * uy[1] + dz * uy[2], dx * uz[0] + dy * uz[1] + dz * uz[2], rx, ry, rz);
    },
  };
}

/* the frame of something pointing along dir with its flat side facing
   front: [ux, uy, uz], uy along dir */
export function frameAlong(dir, front = [0, 0, -1]) {
  const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const uy = n(dir);
  const d = front[0] * uy[0] + front[1] * uy[1] + front[2] * uy[2];
  let uz = [front[0] - uy[0] * d, front[1] - uy[1] * d, front[2] - uy[2] * d];
  if (Math.hypot(uz[0], uz[1], uz[2]) < 1e-6) uz = [1, 0, 0];
  uz = n(uz);
  const ux = [uy[1] * uz[2] - uy[2] * uz[1], uy[2] * uz[0] - uy[0] * uz[2], uy[0] * uz[1] - uy[1] * uz[0]];
  return [ux, uy, uz];
}
