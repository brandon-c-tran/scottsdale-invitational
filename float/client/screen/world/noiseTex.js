/* One tileable noise texture for the water, foam and stone, made on the CPU
   once (a sampled texture is far cheaper per pixel than noise math on an
   integrated GPU):
     R, G  ripple normal (x, z), from three octaves of periodic gradient noise
     B     foam cells (inverted Worley, soft)
     A     a second height field, for glints and streaks */
import * as THREE from "three";

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* periodic gradient noise at (u, v) in [0,1), `f` cells per tile */
function gradNoise(u, v, f, seed) {
  const x = u * f, y = v * f;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (ix, iy, dx, dy) => {
    const a = hash2(((ix % f) + f) % f, ((iy % f) + f) % f, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const n00 = dot(x0, y0, fx, fy), n10 = dot(x0 + 1, y0, fx - 1, fy);
  const n01 = dot(x0, y0 + 1, fx, fy - 1), n11 = dot(x0 + 1, y0 + 1, fx - 1, fy - 1);
  const u2 = fade(fx), v2 = fade(fy);
  return (n00 + (n10 - n00) * u2) + ((n01 + (n11 - n01) * u2) - (n00 + (n10 - n00) * u2)) * v2;
}

function worley(u, v, f, seed) {
  const x = u * f, y = v * f;
  const cx = Math.floor(x), cy = Math.floor(y);
  let best = 9, second = 9;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const ix = cx + dx, iy = cy + dy;
    const wx = ((ix % f) + f) % f, wy = ((iy % f) + f) % f;
    const px = ix + hash2(wx, wy, seed), py = iy + hash2(wx, wy, seed + 17);
    const d = Math.hypot(px - x, py - y);
    if (d < best) { second = best; best = d; } else if (d < second) second = d;
  }
  return { best, second };
}

let cached = null;

export function noiseTexture(size = 256) {
  if (cached && !cached.disposed) return cached.texture;
  const data = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    height[y * size + x] = gradNoise(u, v, 6, 1) * 0.55 + gradNoise(u, v, 12, 2) * 0.3 + gradNoise(u, v, 24, 3) * 0.15;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x;
    const hx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)];
    const hy = height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x];
    const u = x / size, v = y / size;
    const w = worley(u, v, 10, 5);
    /* lace: bright along the borders between cells, as foam sits */
    const edge = w.second - w.best;
    const foam = Math.max(0, Math.min(1, 1 - edge / 0.32)) * (0.75 + 0.25 * Math.max(0, 1 - w.best));
    const h2 = gradNoise(u, v, 16, 9) * 0.6 + gradNoise(u, v, 32, 10) * 0.4;
    data[k * 4] = Math.max(0, Math.min(255, 128 + hx * 460));
    data[k * 4 + 1] = Math.max(0, Math.min(255, 128 + hy * 460));
    data[k * 4 + 2] = Math.round(foam * 255);
    data[k * 4 + 3] = Math.max(0, Math.min(255, 128 + h2 * 300));
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cached = { texture, disposed:false };
  const dispose = texture.dispose.bind(texture);
  texture.dispose = () => { cached.disposed = true; dispose(); };
  return texture;
}

/* a soft radial dot, for glows, blob shadows and spray */
export function dotTexture(size = 64, { power = 2 } = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
    const r = Math.min(1, Math.hypot(dx, dy));
    const a = Math.pow(1 - r, power);
    const k = (y * size + x) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255;
    data[k + 3] = Math.round(a * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
