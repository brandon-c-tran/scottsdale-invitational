/* Where the night's lights go, from the course alone (so any river the room
   sends is dressed the same way): string lights on poles along the banks at
   every put-in and takeout, gantries of bulbs across the river at each
   leg's start and finish, the pools' floating lanterns and the bar's party.
   Pure: course coordinates (x east, y north, z up), no three.js.

   glowAt() is the warm light those bulbs throw, baked into the water's and
   the banks' vertices so a few hundred bulbs cost no real lights. */
import { BULBS } from "./palette.js";

const POLE = 4.6;
const GANTRY = 7.2;

function mulberry(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planLights(geo, { bankZ, barS = null } = {}) {
  const rnd = mulberry(11);
  const poles = [];
  const wires = [];
  const bulbs = [];
  const lanterns = [];
  const torches = [];
  const tmp = {};
  /* a point on the bank: `side` +1 left, -1 right; `back` metres behind the water's edge */
  const bank = (s, side, back = 2.6) => {
    const p = geo.sampleInto(s, tmp);
    const off = side * (p.w / 2 + back);
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    const z = bankZ ? bankZ(x, y, s) : geo.elevAt(s) + 0.6;
    return { x, y, z };
  };
  const hang = (a, b, sag, spacing, palette = BULBS, phase = 0) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(2, Math.round(len / spacing));
    const points = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const z = a.z + (b.z - a.z) * t - sag * 4 * t * (1 - t);
      points.push({ x:a.x + (b.x - a.x) * t, y:a.y + (b.y - a.y) * t, z });
      if (k > 0 && k < n) bulbs.push({ x:points[k].x, y:points[k].y, z:z - 0.12, color:palette[(k + phase) % palette.length], phase:rnd() * 6.28 });
    }
    wires.push(points);
  };
  const pole = (at, h) => { poles.push({ ...at, h }); return { x:at.x, y:at.y, z:at.z + h }; };
  /* a run along one bank */
  const along = (s0, s1, side, step = 9) => {
    let prev = null;
    for (let s = s0; s <= s1 + 0.01; s += step) {
      /* nothing in front of the bar's deck */
      if (barS !== null && side === 1 && Math.abs(s - barS) < 13) { prev = null; continue; }
      const top = pole(bank(s, side), POLE + (rnd() - 0.5) * 0.6);
      if (prev) hang(prev, top, 0.7 + rnd() * 0.3, 1.15, BULBS, (s | 0));
      prev = top;
    }
  };
  /* a gantry across the river */
  const across = (s, palette) => {
    const a = pole(bank(s, 1, 1.2), GANTRY), b = pole(bank(s, -1, 1.2), GANTRY);
    hang(a, b, Math.min(2.2, Math.hypot(a.x - b.x, a.y - b.y) * 0.05), 0.9, palette);
  };
  const legs = geo.legs.length ? geo.legs : [{ grid:0, finish:geo.length }];
  legs.forEach((leg, k) => {
    across(leg.grid + 1.5, ["#ffd9a0", "#7fe6f5", "#ffd9a0", "#ffc879"]);
    across(leg.finish, ["#ff6fb8", "#ffd9a0", "#ffb35c", "#ffd9a0"]);
    along(Math.max(0, leg.grid - 16), leg.grid + 26, 1);
    along(Math.max(0, leg.grid - 12), leg.grid + 18, -1);
    along(leg.finish - 22, Math.min(geo.length - 4, leg.finish + 26), 1);
    along(leg.finish - 14, Math.min(geo.length - 4, leg.finish + 22), -1);
    void k;
  });
  /* pools: one bank lit, lanterns on the water */
  for (const z of geo.zoneSpans("pool")) {
    along(z.s0, z.s1, rnd() < 0.5 ? 1 : -1, 10);
    for (let k = 0; k < 9; k++) {
      const s = z.s0 + (z.s1 - z.s0) * rnd();
      const p = geo.sample(s);
      const lat = (rnd() - 0.5) * (p.w - 6);
      lanterns.push({ x:p.x + p.nx * lat, y:p.y + p.ny * lat, s, color:rnd() < 0.25 ? "#ff8fc6" : "#ffc06a", phase:rnd() * 6.28 });
    }
  }
  /* the bar: the far bank lit along, the bar's own bank lit up to its deck, torches */
  for (const z of geo.zoneSpans("bar")) {
    along(z.s0, Math.min(geo.length - 3, z.s1), -1, 7);
    if (barS !== null) along(z.s0, Math.max(z.s0, barS - 14), 1, 7);
    for (let k = 0; k < 6; k++) {
      const at = bank(z.s0 + (z.s1 - z.s0) * (k + 0.5) / 6, k % 2 ? 1 : -1, 4.5);
      torches.push({ ...at, phase:rnd() * 6.28 });
    }
  }
  /* now and then along the way */
  for (let s = 70; s < geo.length - 40; s += 120 + rnd() * 40) {
    const near = legs.some(leg => Math.abs(s - leg.grid) < 40 || Math.abs(s - leg.finish) < 40);
    if (!near) along(s, s + 27, rnd() < 0.5 ? 1 : -1, 9);
  }

  /* the bulbs' warm light, gridded */
  const CELL = 12;
  const grid = new Map();
  for (const b of bulbs) {
    const key = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(b);
  }
  for (const t of torches) {
    const key = `${Math.floor(t.x / CELL)},${Math.floor(t.y / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({ ...t, z:t.z + 1.6, torch:true });
  }
  const glowAt = (x, y, z) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let sum = 0;
    for (let ix = cx - 2; ix <= cx + 2; ix++) for (let iy = cy - 2; iy <= cy + 2; iy++) {
      const list = grid.get(`${ix},${iy}`);
      if (!list) continue;
      for (const b of list) {
        const d2 = (b.x - x) ** 2 + (b.y - y) ** 2 + (b.z - z) ** 2;
        if (d2 < 900) sum += (b.torch ? 3 : 1) / (1 + d2 / 9);
      }
    }
    return Math.min(1.6, sum * 0.16);
  };

  return { poles, wires, bulbs, lanterns, torches, glowAt };
}
