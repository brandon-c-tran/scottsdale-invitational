/* From a Sculpt to a closed triangle mesh (bake time only).

   The distance is sampled on a fine grid, but only in a narrow band round
   the surface: a coarse pass finds the blocks the surface can pass through
   and only those are sampled finely. Surface nets put one vertex in every
   cell the surface crosses and one quad across every grid edge it crosses;
   each vertex is then walked onto the true surface along the gradient, so
   the mesh lies on the sculpt however coarse the grid. */
import { clamp } from "./sdf.js";

const { sqrt, abs, min, max, ceil } = Math;

/* the 12 cube edges as pairs of corner numbers (corner c: x = c&1, y = c>>1&1, z = c>>2&1) */
const EDGES = [];
for (let c = 0; c < 8; c++) for (const bit of [1, 2, 4]) if (!(c & bit)) EDGES.push([c, c | bit]);

export function meshSculpt(sculpt, { h = 0.004, pad = 0.02, block = 4, log = () => {} } = {}) {
  const t0 = Date.now();
  const { lo, hi } = sculpt.bounds(pad);
  const nx = ceil((hi[0] - lo[0]) / h) + 1, ny = ceil((hi[1] - lo[1]) / h) + 1, nz = ceil((hi[2] - lo[2]) / h) + 1;
  const sxy = nx * ny;
  const N = sxy * nz;
  const values = new Float32Array(N).fill(NaN);
  const B = block;
  const bx = ceil((nx - 1) / B), by = ceil((ny - 1) / B), bz = ceil((nz - 1) / B);
  const cnx = bx + 1, cny = by + 1, cnz = bz + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  const X = i => lo[0] + i * h, Y = j => lo[1] + j * h, Z = k => lo[2] + k * h;
  for (let K = 0; K < cnz; K++) for (let J = 0; J < cny; J++) for (let I = 0; I < cnx; I++) {
    coarse[I + cnx * (J + cny * K)] = sculpt.dist(X(min(I * B, nx - 1)), Y(min(J * B, ny - 1)), Z(min(K * B, nz - 1)));
  }
  /* a block can hold surface if any corner is nearer than its diagonal (with
     room: smooth blends and warps are only close to a true distance) */
  const reach = B * h * sqrt(3) * 1.35 + h;
  const active = [];
  let evaluated = 0;
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    let near = false, sign = 0;
    for (let c = 0; c < 8; c++) {
      const v = coarse[(I + (c & 1)) + cnx * ((J + ((c >> 1) & 1)) + cny * (K + ((c >> 2) & 1)))];
      if (abs(v) < reach) near = true;
      sign += v < 0 ? -1 : 1;
    }
    if (!near && abs(sign) === 8) continue;
    active.push([I, J, K]);
    for (let k = K * B; k <= min((K + 1) * B, nz - 1); k++) for (let j = J * B; j <= min((J + 1) * B, ny - 1); j++) for (let i = I * B; i <= min((I + 1) * B, nx - 1); i++) {
      const g = i + nx * j + sxy * k;
      if (!Number.isNaN(values[g])) continue;
      values[g] = sculpt.dist(X(i), Y(j), Z(k));
      evaluated++;
    }
  }
  /* everything else is far from the surface: inside or out as its block says */
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const g = i + nx * j + sxy * k;
    if (!Number.isNaN(values[g])) continue;
    const I = min(bx, Math.round(i / B)), J = min(by, Math.round(j / B)), K = min(bz, Math.round(k / B));
    values[g] = coarse[I + cnx * (J + cny * K)] < 0 ? -1 : 1;
  }
  log(`  grid ${nx}x${ny}x${nz} (${(N / 1e6).toFixed(1)}M), ${active.length} blocks, ${(evaluated / 1e6).toFixed(2)}M samples, ${Date.now() - t0} ms`);

  /* surface nets: a vertex per crossed cell */
  const cellVert = new Int32Array(N).fill(-1);
  const pos = [];
  const corner = new Float64Array(8);
  for (const [I, J, K] of active) {
    for (let k = K * B; k < min((K + 1) * B, nz - 1); k++) for (let j = J * B; j < min((J + 1) * B, ny - 1); j++) for (let i = I * B; i < min((I + 1) * B, nx - 1); i++) {
      const g = i + nx * j + sxy * k;
      if (cellVert[g] >= 0) continue;
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = values[g + (c & 1) + nx * ((c >> 1) & 1) + sxy * ((c >> 2) & 1)];
        corner[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDGES) {
        const va = corner[a], vb = corner[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = clamp(va / (va - vb), 0, 1);
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
        const bxx = b & 1, byy = (b >> 1) & 1, bzz = (b >> 2) & 1;
        sx += ax + (bxx - ax) * t; sy += ay + (byy - ay) * t; sz += az + (bzz - az) * t; n++;
      }
      cellVert[g] = pos.length / 3;
      pos.push(X(i + sx / n), Y(j + sy / n), Z(k + sz / n));
    }
  }
  /* a quad across every crossed grid edge, wound outward */
  const tris = [];
  const P = pos;
  const quad = (a, b, c, d, outward) => {
    /* split along the shorter diagonal; outward: the axis the surface faces */
    const d1 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d2 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    let t = d1 <= d2 ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
    /* wind the first triangle to face along `outward` */
    const [i0, i1, i2] = t;
    const ux = P[i1 * 3] - P[i0 * 3], uy = P[i1 * 3 + 1] - P[i0 * 3 + 1], uz = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const vx = P[i2 * 3] - P[i0 * 3], vy = P[i2 * 3 + 1] - P[i0 * 3 + 1], vz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    if (nxv * outward[0] + nyv * outward[1] + nzv * outward[2] < 0) t = [t[0], t[2], t[1], t[3], t[5], t[4]];
    tris.push(...t);
  };
  /* each block owns the grid points of its half-open range, so every edge is
     emitted once (a crossing on a block's face makes its neighbour active too) */
  for (const [I, J, K] of active) {
    for (let k = K * B; k < min((K + 1) * B, nz); k++) for (let j = J * B; j < min((J + 1) * B, ny); j++) for (let i = I * B; i < min((I + 1) * B, nx); i++) {
      const g = i + nx * j + sxy * k;
      const v0 = values[g];
      const inside = v0 < 0;
      /* x edge: cells (i, j-1..j, k-1..k) */
      if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && inside !== (values[g + 1] < 0)) {
        const a = cellVert[g - nx - sxy], b = cellVert[g - sxy], c = cellVert[g], d = cellVert[g - nx];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(a, b, c, d, [inside ? 1 : -1, 0, 0]);
      }
      if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && inside !== (values[g + nx] < 0)) {
        const a = cellVert[g - 1 - sxy], b = cellVert[g - sxy], c = cellVert[g], d = cellVert[g - 1];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(a, b, c, d, [0, inside ? 1 : -1, 0]);
      }
      if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && inside !== (values[g + sxy] < 0)) {
        const a = cellVert[g - 1 - nx], b = cellVert[g - nx], c = cellVert[g], d = cellVert[g - 1];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(a, b, c, d, [0, 0, inside ? 1 : -1]);
      }
    }
  }
  log(`  surface nets: ${pos.length / 3} vertices, ${tris.length / 3} triangles, ${Date.now() - t0} ms`);
  return { positions: new Float64Array(pos), indices: new Uint32Array(tris), h };
}

/* walk every vertex onto the surface and give it the sculpt's normal */
export function settle(sculpt, mesh, { iterations = 3 } = {}) {
  const { positions } = mesh;
  const V = positions.length / 3;
  const normals = new Float32Array(V * 3);
  const p = [0, 0, 0], n = [0, 0, 0];
  for (let v = 0; v < V; v++) {
    p[0] = positions[v * 3]; p[1] = positions[v * 3 + 1]; p[2] = positions[v * 3 + 2];
    const before = [p[0], p[1], p[2]];
    sculpt.project(p, iterations);
    /* a vertex that wanders more than a cell away is left where it was */
    if ((p[0] - before[0]) ** 2 + (p[1] - before[1]) ** 2 + (p[2] - before[2]) ** 2 > (mesh.h * 1.5) ** 2) { p[0] = before[0]; p[1] = before[1]; p[2] = before[2]; }
    positions[v * 3] = p[0]; positions[v * 3 + 1] = p[1]; positions[v * 3 + 2] = p[2];
    sculpt.normal(p[0], p[1], p[2], Math.max(0.0012, mesh.h * 0.4), n);
    normals[v * 3] = n[0]; normals[v * 3 + 1] = n[1]; normals[v * 3 + 2] = n[2];
  }
  mesh.normals = normals;
  return mesh;
}

/* drop degenerate triangles and every piece but the big ones; returns the
   kept mesh with its vertices compacted */
export function clean(mesh, { keepShare = 0.01, log = () => {} } = {}) {
  const { positions, indices } = mesh;
  const V = positions.length / 3;
  const parent = new Int32Array(V).map((_, i) => i);
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const tris = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (a === b || b === c || a === c) continue;
    tris.push(a, b, c);
    const ra = find(a), rb = find(b), rc = find(c);
    parent[rb] = ra; parent[find(rc)] = find(ra);
  }
  const size = new Map();
  for (let t = 0; t < tris.length; t++) { const r = find(tris[t]); size.set(r, (size.get(r) || 0) + 1); }
  const biggest = Math.max(...size.values());
  const keep = new Set([...size].filter(([, s]) => s >= biggest * keepShare).map(([r]) => r));
  if (size.size > keep.size) log(`  dropped ${size.size - keep.size} stray pieces`);
  if (keep.size > 1) log(`  warning: ${keep.size} separate pieces (a part does not touch the mass)`);
  const remap = new Int32Array(V).fill(-1);
  const pos = [], nor = [], idx = [];
  for (let t = 0; t < tris.length; t += 3) {
    if (!keep.has(find(tris[t]))) continue;
    for (let j = 0; j < 3; j++) {
      const v = tris[t + j];
      if (remap[v] < 0) {
        remap[v] = pos.length / 3;
        pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        if (mesh.normals) nor.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
      }
      idx.push(remap[v]);
    }
  }
  return { ...mesh, positions: new Float64Array(pos), normals: mesh.normals ? new Float32Array(nor) : null, indices: new Uint32Array(idx) };
}

/* vertex neighbours from the triangles (for smoothing weights on the surface) */
export function adjacency(indices, V) {
  const sets = Array.from({ length: V }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
  }
  const start = new Int32Array(V + 1);
  for (let v = 0; v < V; v++) start[v + 1] = start[v] + sets[v].size;
  const list = new Int32Array(start[V]);
  for (let v = 0; v < V; v++) { let i = start[v]; for (const u of sets[v]) list[i++] = u; }
  return { start, list };
}

/* edges used once or more than twice (a closed mesh has none) */
export function openEdges(indices) {
  const count = new Map();
  for (let t = 0; t < indices.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = indices[t + e], b = indices[t + (e + 1) % 3];
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    count.set(key, (count.get(key) || 0) + 1);
  }
  let open = 0, many = 0;
  for (const c of count.values()) { if (c === 1) open++; else if (c > 2) many++; }
  return { open, many };
}

export { max };
