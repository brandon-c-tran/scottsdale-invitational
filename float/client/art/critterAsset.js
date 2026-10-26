/* The baked critters (scripts/float-bake-critters.mjs writes them to
   public/float/critters/<id>.<detail>.bin): one compact binary per species
   and detail, loaded when a critter of that species is first built and
   shared by every rider of it.

   Layout (little endian): a 48-byte header, then a gzip payload.
     0  "FLC2"            4  format (u16)      6  bones (u16)
     8  vertices (u32)    12 indices (u32)     16 plush indices (u32): the
                                                  plush body's triangles come
                                                  first, the features after
     20 bounds min (3 f32)   32 bounds max (3 f32)   44 payload bytes (u32)
   The payload, each array in byte planes (all low bytes, then the next):
     positions: u16 x3, quantized to the bounds, delta coded in vertex order
     normals: u8 x2, octahedral
     aColor: u8 x4, sRGB color and fur length
     aMat: u8 x4, occlusion, fuzz, roughness (0: a catch light), rider's color
     skinIndex, skinWeight: u8 x4 each
     indices: u16 "high water" codes (vertices are numbered by first use)

   Nothing here touches the DOM at import: node tests and the TV's stills
   import it too. In node there is no fetch of a site path: the tests hand
   the bytes over with setCritterSource. */
import * as THREE from "three";

export const CRITTER_MAGIC = "FLC2";
export const CRITTER_FORMAT = 1;
export const CRITTER_HEADER = 48;

/* ── decoding ─────────────────────────────────────────────────────────── */

export async function gunzip(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("float art: no DecompressionStream");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* in a page, a decode lets a frame through between its passes (a hero
   file is a few milliseconds of work on a TV's CPU, and it may arrive
   mid-race); in node it runs straight through */
const breath = () => (typeof document === "undefined" ? null : new Promise(r => setTimeout(r, 0)));

/* planes: n values of `bytes` bytes each, stored as `bytes` planes */
function readPlanes(src, at, n, bytes) {
  const out = bytes === 1 ? new Uint8Array(n) : bytes === 2 ? new Uint16Array(n) : new Uint32Array(n);
  for (let b = 0; b < bytes; b++) {
    const base = at + b * n, shift = 8 * b;
    for (let i = 0; i < n; i++) out[i] |= src[base + i] << shift;
  }
  return { out, at: at + n * bytes };
}

export function readHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== CRITTER_MAGIC) throw new Error("float art: not a critter file");
  const format = view.getUint16(4, true);
  if (format !== CRITTER_FORMAT) throw new Error(`float art: critter format ${format}`);
  const f = o => view.getFloat32(o, true);
  return {
    bones: view.getUint16(6, true), vertices: view.getUint32(8, true), indices: view.getUint32(12, true), plushIndices: view.getUint32(16, true),
    min: [f(20), f(24), f(28)], max: [f(32), f(36), f(40)], payload: view.getUint32(44, true),
  };
}

/* the arrays of a critter file */
export async function decodeCritter(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const head = readHeader(bytes);
  const body = await gunzip(bytes.subarray(CRITTER_HEADER, CRITTER_HEADER + head.payload));
  const V = head.vertices, I = head.indices;
  let at = 0;
  const positions = new Float32Array(V * 3);
  for (let axis = 0; axis < 3; axis++) {
    const r = readPlanes(body, at, V, 2); at = r.at;
    const lo = head.min[axis], span = (head.max[axis] - head.min[axis]) / 65535;
    let q = 0;
    for (let i = 0; i < V; i++) { q = (q + r.out[i]) & 0xffff; positions[i * 3 + axis] = lo + q * span; }
  }
  await breath();
  const normals = new Float32Array(V * 3);
  {
    const u = readPlanes(body, at, V, 1); at = u.at;
    const v = readPlanes(body, at, V, 1); at = v.at;
    for (let i = 0; i < V; i++) {
      let x = (u.out[i] / 255) * 2 - 1, y = (v.out[i] / 255) * 2 - 1;
      let z = 1 - Math.abs(x) - Math.abs(y);
      if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * Math.sign(ox || 1); y = (1 - Math.abs(ox)) * Math.sign(y || 1); }
      const l = Math.hypot(x, y, z) || 1;
      normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l;
    }
  }
  const quad = () => {
    const out = new Uint8Array(V * 4);
    for (let c = 0; c < 4; c++) {
      const r = readPlanes(body, at, V, 1); at = r.at;
      for (let i = 0; i < V; i++) out[i * 4 + c] = r.out[i];
    }
    return out;
  };
  await breath();
  const color = quad(), mat = quad(), skinIndex = quad(), skinWeight = quad();
  await breath();
  const codes = readPlanes(body, at, I, 2); at = codes.at;
  const index = V > 65535 ? new Uint32Array(I) : new Uint16Array(I);
  let next = 0;
  for (let i = 0; i < I; i++) {
    const code = codes.out[i];
    const v = next - code;
    index[i] = v;
    if (code === 0) next++;
  }
  return { head, positions, normals, color, mat, skinIndex, skinWeight, index };
}

/* the arrays as a geometry (attribute names the plush shader reads) */
export function critterGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(data.color, 4, true));
  geo.setAttribute("aMat", new THREE.BufferAttribute(data.mat, 4, true));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(data.skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(data.skinWeight, 4, true));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  geo.userData.plushIndices = data.head.plushIndices;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  /* the fur: the plush body's triangles that carry any (drawn as shells) */
  const idx = data.index, fur = [];
  for (let t = 0; t < data.head.plushIndices; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (data.color[a * 4 + 3] > 8 || data.color[b * 4 + 3] > 8 || data.color[c * 4 + 3] > 8) fur.push(a, b, c);
  }
  geo.userData.furIndex = fur.length ? (data.positions.length / 3 > 65535 ? new Uint32Array(fur) : new Uint16Array(fur)) : null;
  return geo;
}

/* ── loading ──────────────────────────────────────────────────────────── */

let source = null;
/* where critter files come from: fn(id, detail, file) -> bytes (or a promise
   of them). Unset, the browser fetches them from the site. */
export function setCritterSource(fn) { source = typeof fn === "function" ? fn : null; }

export const critterPath = file => `/float/critters/${file}`;

async function fetchBytes(id, detail, file) {
  if (source) return source(id, detail, file);
  /* no page to fetch from (node without setCritterSource): no mesh, at once */
  if (typeof fetch !== "function" || typeof location === "undefined") throw new Error("float art: no critter source");
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(critterPath(file));
      if (!res.ok) throw new Error(`float art: ${file} ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      last = error;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}

const loaded = new Map();
const pending = new Map();
/* bumped by disposeCritterGeometry: a load still in flight then resolves
   for whoever waits on it but is not kept */
let epoch = 0;

/* a species' geometry now, if it has arrived */
export const critterGeometryNow = key => loaded.get(key) || null;

/* a species' geometry (cached): key is "<id>:<detail>", file its name with a
   cache-busting hash */
export function loadCritterGeometry(key, id, detail, file) {
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  if (pending.has(key)) return pending.get(key);
  const at = epoch;
  const job = Promise.resolve()
    .then(() => fetchBytes(id, detail, file))
    .then(bytes => decodeCritter(bytes))
    .then(data => {
      const geo = critterGeometry(data);
      if (at === epoch) { loaded.set(key, geo); pending.delete(key); }
      return geo;
    })
    .catch(error => { if (at === epoch) pending.delete(key); throw error; });
  pending.set(key, job);
  return job;
}

/* everything loaded so far, and the fur's shells made over it (for
   disposeFloatArt) */
export function disposeCritterGeometry() {
  for (const geo of loaded.values()) {
    for (const [k, v] of Object.entries(geo.userData)) if (k.startsWith("shells:") && v?.isBufferGeometry) v.dispose();
    geo.dispose();
  }
  loaded.clear();
  pending.clear();
  epoch++;
}
export const critterEpoch = () => epoch;
export const critterCacheSize = () => loaded.size;
