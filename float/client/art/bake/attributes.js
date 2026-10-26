/* What every vertex of the plush body carries (bake time only): its color,
   fur length, fuzz, roughness, the rider's-color mask, soft occlusion, and
   its bone weights, smoothed over the surface so the mass bends like a soft
   toy instead of shearing where one bone hands over to the next. */
import { adjacency } from "./mesher.js";
import { clamp } from "./sdf.js";

export function plushAttributes(sculpt, mesh, boneNames, { smoothing = 24, aoOptions = {}, log = () => {} } = {}) {
  const t0 = Date.now();
  const { positions, normals, indices } = mesh;
  const V = positions.length / 3;
  const P = sculpt.parts.length;
  const B = boneNames.length;
  const boneIndex = new Map(boneNames.map((n, i) => [n, i]));
  const color = new Float32Array(V * 3);
  const mat = new Float32Array(V * 5); /* fur, fuzz, rough, tint, ao */
  const weights = new Float32Array(V * B);
  const scratch = { dists: new Float64Array(P), own: new Float64Array(P) };
  const bw = new Map();
  const p = [0, 0, 0], n = [0, 0, 0];
  for (let v = 0; v < V; v++) {
    p[0] = positions[v * 3]; p[1] = positions[v * 3 + 1]; p[2] = positions[v * 3 + 2];
    n[0] = normals[v * 3]; n[1] = normals[v * 3 + 1]; n[2] = normals[v * 3 + 2];
    const m = sculpt.material(p, n, scratch);
    color[v * 3] = m.color[0]; color[v * 3 + 1] = m.color[1]; color[v * 3 + 2] = m.color[2];
    /* the part that owns this point most */
    let top = 0;
    for (let i = 1; i < P; i++) if (scratch.own[i] > scratch.own[top]) top = i;
    mat[v * 5] = clamp(m.fur, 0, 1); mat[v * 5 + 1] = clamp(m.fuzz, 0, 1); mat[v * 5 + 2] = clamp(m.rough, 0, 1); mat[v * 5 + 3] = clamp(m.tint, 0, 1);
    mat[v * 5 + 4] = sculpt.occlusion(p, n, sculpt.parts[top], aoOptions);
    sculpt.boneWeights(p, scratch.own, bw);
    for (const [name, w] of bw) {
      const b = boneIndex.get(name);
      if (b === undefined) throw new Error(`attributes: no bone ${name}`);
      weights[v * B + b] += w;
    }
  }
  log(`  attributes: ${V} vertices, ${Date.now() - t0} ms`);
  /* smooth the weights (and the occlusion a little) over the surface */
  const { start, list } = adjacency(indices, V);
  let a = weights, b = new Float32Array(weights.length);
  for (let it = 0; it < smoothing; it++) {
    for (let v = 0; v < V; v++) {
      const s0 = start[v], s1 = start[v + 1], k = s1 - s0;
      for (let j = 0; j < B; j++) {
        let sum = 0;
        for (let q = s0; q < s1; q++) sum += a[list[q] * B + j];
        b[v * B + j] = a[v * B + j] * 0.5 + (k ? (sum / k) * 0.5 : a[v * B + j] * 0.5);
      }
    }
    [a, b] = [b, a];
  }
  const ao = new Float32Array(V);
  for (let v = 0; v < V; v++) ao[v] = mat[v * 5 + 4];
  for (let it = 0; it < 3; it++) {
    const next = new Float32Array(V);
    for (let v = 0; v < V; v++) {
      let sum = 0;
      for (let q = start[v]; q < start[v + 1]; q++) sum += ao[list[q]];
      const k = start[v + 1] - start[v];
      next[v] = k ? ao[v] * 0.5 + (sum / k) * 0.5 : ao[v];
    }
    ao.set(next);
  }
  for (let v = 0; v < V; v++) mat[v * 5 + 4] = ao[v];
  log(`  weights smoothed (${smoothing} passes), ${Date.now() - t0} ms`);
  return { color, mat, weights: a, boneCount: B };
}

/* the four strongest bones of a vertex, weights summing to 255 */
export function topFour(weights, v, B, outIdx, outW) {
  const best = [-1, -1, -1, -1], bv = [0, 0, 0, 0];
  for (let j = 0; j < B; j++) {
    const w = weights[v * B + j];
    if (w <= bv[3]) continue;
    let k = 3;
    while (k > 0 && w > bv[k - 1]) { bv[k] = bv[k - 1]; best[k] = best[k - 1]; k--; }
    bv[k] = w; best[k] = j;
  }
  /* drop slivers (they only cost precision) */
  let sum = 0;
  for (let k = 0; k < 4; k++) { if (bv[k] < 0.02) { bv[k] = 0; best[k] = best[0]; } sum += bv[k]; }
  if (sum <= 0) { bv[0] = 1; sum = 1; best[0] = Math.max(0, best[0]); }
  let total = 0;
  for (let k = 0; k < 4; k++) {
    outIdx[k] = Math.max(0, best[k]);
    outW[k] = Math.round((bv[k] / sum) * 255);
    total += outW[k];
  }
  /* rounding leftovers go to the strongest */
  outW[0] += 255 - total;
}
