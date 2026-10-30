/* Writes a critter file (the format is critterAsset.js's; bake time only). */
import { gzipSync } from "node:zlib";
import { CRITTER_MAGIC, CRITTER_FORMAT, CRITTER_HEADER } from "../critterAsset.js";

/* number vertices by first use in the index buffer (the format's index code
   relies on it), keeping only used vertices */
export function reorderByFirstUse(index, V) {
  const map = new Int32Array(V).fill(-1);
  const order = [];
  const out = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) {
    const v = index[i];
    if (map[v] < 0) { map[v] = order.length; order.push(v); }
    out[i] = map[v];
  }
  return { index: out, order };
}

function planes(values, bytes) {
  const n = values.length;
  const out = new Uint8Array(n * bytes);
  for (let b = 0; b < bytes; b++) for (let i = 0; i < n; i++) out[b * n + i] = (values[i] >>> (8 * b)) & 0xff;
  return out;
}

const octEncode = (x, y, z) => {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / s, v = y / s;
  if (z < 0) { const ou = u; u = (1 - Math.abs(v)) * (ou >= 0 ? 1 : -1); v = (1 - Math.abs(ou)) * (v >= 0 ? 1 : -1); }
  return [Math.round((u * 0.5 + 0.5) * 255), Math.round((v * 0.5 + 0.5) * 255)];
};

/* data: { positions (f32 x3), normals (x3), color (u8 x4), mat (u8 x4),
   skinIndex (u8 x4), skinWeight (u8 x4), index, plushIndices, bones } with
   vertices already numbered by first use */
export function encodeCritter(data) {
  const V = data.positions.length / 3, I = data.index.length;
  if (V > 65535) throw new Error(`pack: ${V} vertices (the index code is 16-bit)`);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V; i++) for (let a = 0; a < 3; a++) { const v = data.positions[i * 3 + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
  for (let a = 0; a < 3; a++) if (max[a] - min[a] < 1e-6) max[a] = min[a] + 1e-6;
  /* the bounds as stored (f32), so quantizing uses exactly what decoding will */
  const f32 = new Float32Array([...min, ...max]);
  const chunks = [];
  for (let a = 0; a < 3; a++) {
    const lo = f32[a], span = f32[3 + a] - f32[a];
    const deltas = new Uint16Array(V);
    let prev = 0;
    for (let i = 0; i < V; i++) {
      const q = Math.max(0, Math.min(65535, Math.round(((data.positions[i * 3 + a] - lo) / span) * 65535)));
      deltas[i] = (q - prev) & 0xffff;
      prev = q;
    }
    chunks.push(planes(deltas, 2));
  }
  const nu = new Uint8Array(V), nv = new Uint8Array(V);
  for (let i = 0; i < V; i++) { const [u, v] = octEncode(data.normals[i * 3], data.normals[i * 3 + 1], data.normals[i * 3 + 2]); nu[i] = u; nv[i] = v; }
  chunks.push(nu, nv);
  for (const arr of [data.color, data.mat, data.skinIndex, data.skinWeight]) {
    for (let c = 0; c < 4; c++) { const plane = new Uint8Array(V); for (let i = 0; i < V; i++) plane[i] = arr[i * 4 + c]; chunks.push(plane); }
  }
  const codes = new Uint16Array(I);
  let next = 0;
  for (let i = 0; i < I; i++) {
    const v = data.index[i];
    if (v > next) throw new Error("pack: vertices are not numbered by first use");
    codes[i] = next - v;
    if (v === next) next++;
  }
  chunks.push(planes(codes, 2));
  const raw = Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  const payload = gzipSync(raw, { level: 9 });
  const head = Buffer.alloc(CRITTER_HEADER);
  head.write(CRITTER_MAGIC, 0, "latin1");
  head.writeUInt16LE(CRITTER_FORMAT, 4);
  head.writeUInt16LE(data.bones, 6);
  head.writeUInt32LE(V, 8);
  head.writeUInt32LE(I, 12);
  head.writeUInt32LE(data.plushIndices, 16);
  for (let k = 0; k < 6; k++) head.writeFloatLE(f32[k], 20 + k * 4);
  head.writeUInt32LE(payload.length, 44);
  return { bytes: Buffer.concat([head, payload]), raw: raw.length };
}
