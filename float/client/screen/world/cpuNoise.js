/* Small CPU noise for building the world once (heights, colours, scatter). */

function hash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* gradient noise, about -0.7..0.7 */
export function noise2(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const g = (ix, iy, dx, dy) => {
    const a = hash(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const u = fade(fx), v = fade(fy);
  const a = g(x0, y0, fx, fy) + (g(x0 + 1, y0, fx - 1, fy) - g(x0, y0, fx, fy)) * u;
  const b = g(x0, y0 + 1, fx, fy - 1) + (g(x0 + 1, y0 + 1, fx - 1, fy - 1) - g(x0, y0 + 1, fx, fy - 1)) * u;
  return a + (b - a) * v;
}

export function fbm(x, y, octaves = 3, seed = 0) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let k = 0; k < octaves; k++) {
    sum += noise2(x * freq, y * freq, seed + k * 13) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
