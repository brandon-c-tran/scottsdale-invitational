/* Float Groove art, the kayaks (float/GROOVE.md v3 item 10): a critter's
   generated kayak art into the manifest. Reads <raw>/gen/<id>-kayak-sheet.png
   (the nine poses on a 3 x 3 grid, transparent, the hull flat magenta and
   the paddle blades flat violet), <id>-kayak-portrait.png and
   <id>-kayak-tee-sheet.png (the same sheet in a green T-shirt), falling back
   to the committed copies in float/look/groove (<name>.webp), and writes
   public/float/groove/critters/<id>/<pose>.webp, <pose>-tube.webp, the
   portrait, tee/<pose>{,-tube,-shirt}.webp and the critter's manifest entry.

   Registration: every pose is placed by its hull, the one thing all nine
   share. One scale per critter (the idle hull's width becomes HULL_W), and
   each pose's hull waterline centre (the middle of its bbox across, its
   bottom edge, where the kayak meets the water) lands on WATER, so a pose
   swaps without a jump and every critter's kayak is the same size. The
   hull and the blades turn grey in `src` (their shading kept, highlights
   left white by thinning the mask there) and their union is the `tube`
   mask the rider's colour fills; the shaft, the critter and the cup keep
   their own colours.

   Anchors (box px, measured per pose): eyes = the two dark dots' midpoint;
   face = a quarter eye-span under them; head = the head's top (idle: walked
   up from the eyes through the opaque body; other poses: idle's head-to-face
   offset from this pose's face); hand = the cup's centre in chug, else the
   middle of the paddle shaft (between the blades); blade = the lowest
   blade's centre (where a stroke meets the water); chest (tee) = the
   largest circle inside the shirt.

     node scripts/float-art-kayak.mjs <id...> [--no-tee] [--debug]   */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ALL_CRITTER_IDS } from "../float/shared/looks.js";
import { OUT, RAW, SOURCES, sourceOf, loadRGBA, blank, components, placeInBox, saveWebp, savePng, dilate, close, hueOf, hueDist, lum, editManifest, alphaBounds } from "./float-art-lib.mjs";

export const POSES = ["idle", "stroke", "stroke-r", "hey", "nice", "miss", "chug", "cheer", "out"];
/* the family's one scale: every idle hull this wide (box px), its waterline
   centre here. 270 keeps five in a row at the tightest row (10 riders, the
   front row at scale 0.62 x ART_FILL 1.45: 293 box px a slot) */
export const HULL_W = 270;
export const WATER = [256, 440];
export const BOX = 512;
/* the portrait: the hull up to this wide, the critter kept inside the frame */
export const PORTRAIT = { size:1024, hullMax:720, margin:36, bottom:960 };
const GRID = { cols:3, rows:3 };
/* the photo's least radius in the box */
export const CHEST_MIN = 18;
/* box px, by critter and pose, where the measure misses (set by eye on the review sheets) */
export const ANCHOR_FIX = {};

const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
const val = (r, g, b) => Math.max(r, g, b) / 255;
export const round2 = p => [Math.round(p[0]), Math.round(p[1])];

export function normalizeAlpha(img) {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 8 ? 0 : d[i] >= 246 ? 255 : Math.round(d[i] * 255 / 246);
  return img;
}

/* the commonest strongly saturated bright hue within `spread` of `near` */
export function keyHue(img, near, spread = 40) {
  const hist = new Array(72).fill(0);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (sat(r, g, b) < 0.55 || val(r, g, b) < 0.45) continue;
    const h = hueOf(r, g, b);
    if (hueDist(h, near) > spread) continue;
    hist[Math.floor(h / 5)]++;
  }
  const best = hist.indexOf(Math.max(...hist));
  return hist[best] > 50 ? best * 5 + 2.5 : null;
}

/* one key colour's pixels: { core (0/1), light (0..1 highlight), ink } */
function keyPixels(img, hue, { tol = 22 } = {}) {
  const { data:d, width:W, height:H } = img;
  const core = new Uint8Array(W * H), light = new Float32Array(W * H), ink = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const i = k * 4;
    if (d[i + 3] < 24) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const s = sat(r, g, b), v = val(r, g, b);
    if (v < 0.32) { ink[k] = 1; continue; }
    if (s < 0.1) continue;
    if (hueDist(hueOf(r, g, b), hue) > tol) continue;
    if (s >= 0.42) core[k] = 1;
    else if (v > 0.7) { core[k] = 1; light[k] = Math.min(1, (0.6 - s) / 0.5); }
  }
  return { core, light, ink };
}

/* grow a mask into the dark outline around it, never into the body */
function growIntoInk(mask, img, ink, passes = 4) {
  const { data:d, width:W, height:H } = img;
  let grown = mask;
  for (let pass = 0; pass < passes; pass++) {
    const next = dilate(grown, W, H, 1);
    for (let k = 0; k < W * H; k++) if (next[k] && !grown[k] && !ink[k] && !(d[k * 4 + 3] < 250 && lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) < 140)) next[k] = 0;
    grown = next;
  }
  return grown;
}

const bboxOf = (mask, W, H) => {
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
  for (let k = 0; k < W * H; k++) {
    if (!mask[k]) continue;
    n++;
    const x = k % W, y = (k - x) / W;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { x0, x1, y0, y1, w:x1 - x0 + 1, h:y1 - y0 + 1, cx:(x0 + x1) / 2, n } : null;
};

/* The kayak of one pose: the hull (magenta) and the blades (violet).
   { mask (0/1, hull + blades incl. their outline), light, hull:{ mask, bbox },
     blades:[{ cx, cy, x0, x1, y0, y1, n }] } or null */
export function findKayak(img, hues) {
  const { width:W, height:H } = img;
  const hull = keyPixels(img, hues.hull);
  const blade = keyPixels(img, hues.blade, { tol:26 });
  /* the hull: the biggest magenta piece and the pieces beside it (an arm or the shaft can split it) */
  const hc = components(hull.core, W, H);
  const main = hc.comps.reduce((a, c) => (!a || c.n > a.n ? c : a), null);
  if (!main) return null;
  const mw = main.x1 - main.x0, mh = main.y1 - main.y0;
  const keepHull = new Set(hc.comps.filter(c => c === main || (c.n > Math.max(150, main.n * 0.01)
    && c.x1 >= main.x0 - mw * 0.2 && c.x0 <= main.x1 + mw * 0.2 && c.cy >= main.y0 - mh * 0.4 && c.cy <= main.y1 + mh * 0.3)).map(c => c.id));
  let hullMask = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (hull.core[k] && keepHull.has(hc.labels[k])) hullMask[k] = 1;
  hullMask = close(hullMask, W, H, 3);
  /* the blades: every violet piece of any size worth keeping, wherever it is (overhead, floating) */
  const bc = components(blade.core, W, H);
  const keepBlade = bc.comps.filter(c => c.n > Math.max(200, main.n * 0.01));
  const ids = new Set(keepBlade.map(c => c.id));
  let bladeMask = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (blade.core[k] && ids.has(bc.labels[k])) bladeMask[k] = 1;
  bladeMask = close(bladeMask, W, H, 2);
  const ink = hull.ink;
  const grownHull = growIntoInk(hullMask, img, ink);
  const grownBlade = growIntoInk(bladeMask, img, ink);
  const mask = new Uint8Array(W * H);
  const light = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) {
    if (grownHull[k] || grownBlade[k]) mask[k] = 1;
    light[k] = hullMask[k] ? hull.light[k] : bladeMask[k] ? blade.light[k] : 0;
  }
  const hb = bboxOf(hullMask, W, H);
  return { mask, light, hull:{ mask:hullMask, bbox:hb }, blades:keepBlade.map(c => ({ cx:c.cx, cy:c.cy, x0:c.x0, x1:c.x1, y0:c.y0, y1:c.y1, n:c.n })) };
}

/* src (hull and blades grey, shading kept) and the tube mask (white; alpha thinned at highlights) */
export function splitKayak(img, kayak) {
  const { data:d, width:W, height:H } = img;
  /* one gain for the hull and one for the blades, so both sit at the same grey */
  const gainOf = part => {
    const ls = [];
    for (let k = 0; k < W * H; k++) if (part[k] && d[k * 4 + 3] > 240 && val(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) > 0.5 && !kayak.light[k]) ls.push(lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]));
    ls.sort((a, b) => a - b);
    return 222 / Math.max(30, ls.length ? ls[ls.length >> 1] : 90);
  };
  const hullGain = gainOf(kayak.hull.mask);
  const bladeOnly = kayak.mask.map((v, k) => (v && !kayak.hull.mask[k] ? 1 : 0));
  const bladeGain = gainOf(bladeOnly);
  const src = { data:new Uint8Array(d), width:W, height:H };
  const tube = blank(W, H);
  for (let k = 0; k < W * H; k++) {
    if (!kayak.mask[k]) continue;
    const i = k * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const v = val(r, g, b), l = lum(r, g, b);
    const gain = kayak.hull.mask[k] ? hullGain : bladeGain;
    const gray = v < 0.32 ? Math.round(l * 0.6) : Math.min(255, Math.round(l * gain));
    const lit = kayak.light[k];
    const out = lit ? Math.round(gray + (255 - gray) * lit) : gray;
    src.data[i] = out; src.data[i + 1] = out; src.data[i + 2] = out;
    tube.data[i] = 255; tube.data[i + 1] = 255; tube.data[i + 2] = 255;
    tube.data[i + 3] = Math.round(d[i + 3] * (1 - 0.85 * lit));
  }
  return { src, tube };
}

/* the eyes: two small round dark blobs side by side above the waterline
   (R: the critter's size, a ring's width; band: the rows to look in) */
export function findEyes(img, { R, y0 = 0, y1, cx }, near = null, keyed = null) {
  const { data:d, width:W, height:H } = img;
  const dark = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const y = Math.floor(k / W);
    if (y < y0 || y > y1) continue;
    if (keyed?.[k]) continue;
    const i = k * 4;
    if (d[i + 3] > 200 && val(d[i], d[i + 1], d[i + 2]) < 0.28) dark[k] = 1;
  }
  const { comps } = components(dark, W, H);
  const dots = comps.filter(c => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const fill = c.n / (w * h);
    return w >= R * 0.022 && w <= R * 0.09 && h >= R * 0.022 && h <= R * 0.11 && Math.max(w, h) / Math.min(w, h) < 1.7 && fill > 0.55;
  });
  const nearOk = (x, y) => !near || (Math.abs(x - near[0]) < R * 0.35 && Math.abs(y - near[1]) < R * 0.35);
  let best = null;
  for (let a = 0; a < dots.length; a++) for (let b = a + 1; b < dots.length; b++) {
    const A = dots[a], B = dots[b];
    const dx = Math.abs(A.cx - B.cx), dy = Math.abs(A.cy - B.cy);
    if (dx < R * 0.12 || dx > R * 0.62 || dy > R * 0.14) continue;
    if (!nearOk((A.cx + B.cx) / 2, (A.cy + B.cy) / 2)) continue;
    const sizeMatch = Math.min(A.n, B.n) / Math.max(A.n, B.n);
    if (sizeMatch < 0.45) continue;
    const score = sizeMatch - dy / R - (near ? Math.hypot((A.cx + B.cx) / 2 - near[0], (A.cy + B.cy) / 2 - near[1]) / R : 0);
    if (!best || score > best.score) best = { score, l:A.cx < B.cx ? A : B, r:A.cx < B.cx ? B : A };
  }
  if (best) return { x:(best.l.cx + best.r.cx) / 2, y:(best.l.cy + best.r.cy) / 2, span:best.r.cx - best.l.cx };
  const one = dots.filter(o => nearOk(o.cx, o.cy)).sort((a, b) => Math.abs(a.cx - cx) - Math.abs(b.cx - cx))[0];
  return one ? { x:one.cx, y:one.cy, span:R * 0.2, single:true } : null;
}

/* the head's top over x: walked up from y through the opaque body to the first clear row */
export function headUp(img, x, y) {
  const { data:d, width:W } = img;
  const cx = Math.round(x);
  const solid = yy => { let hits = 0; for (let dx = -3; dx <= 3; dx++) { const xx = cx + dx; if (xx >= 0 && xx < W && d[(yy * W + xx) * 4 + 3] > 160) hits++; } return hits >= 3; };
  let yy = Math.round(y);
  while (yy > 0 && solid(yy - 1)) yy--;
  return yy;
}

/* the head's width: the opaque span a little under the head's top */
export function headWidth(img, [hx, hy], R) {
  const y = Math.round(hy + R * 0.22);
  const solid = x => x >= 0 && x < img.width && img.data[(y * img.width + x) * 4 + 3] > 40;
  let l = Math.round(hx), r = Math.round(hx);
  while (solid(l - 1)) l--;
  while (solid(r + 1)) r++;
  return Math.max(Math.round(R * 0.4), r - l + 1);
}

/* the red cup's centre (chug), or null */
export function cupOf(img) {
  const { data:d, width:W, height:H } = img;
  const m = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const i = k * 4;
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (sat(r, g, b) > 0.6 && val(r, g, b) > 0.45 && hueDist(hueOf(r, g, b), 2) < 14) m[k] = 1;
  }
  const { comps } = components(m, W, H);
  const big = comps.reduce((a, c) => (!a || c.n > a.n ? c : a), null);
  return big && big.n > 300 ? [big.cx, big.cy] : null;
}

/* the sheet's cells: each piece goes to the cell its centre is in */
export function sliceGrid(img, { cols, rows } = GRID) {
  const { width:W, height:H } = img;
  const n = cols * rows;
  const solid = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (img.data[k * 4 + 3] > 24) solid[k] = 1;
  const { labels, comps } = components(solid, W, H);
  const cw = W / cols, ch = H / rows;
  const cellAt = (x, y) => Math.max(0, Math.min(rows - 1, Math.floor(y / ch))) * cols + Math.max(0, Math.min(cols - 1, Math.floor(x / cw)));
  const owner = new Int32Array(comps.length).fill(-1);
  const big = new Array(n).fill(0);
  for (const c of comps) {
    if (c.n < 12) continue;
    owner[c.id] = cellAt(c.cx, c.cy);
    if (c.n > 4000) big[owner[c.id]]++;
  }
  if (big.some(v => v < 1)) throw new Error(`a cell has no critter (${big.join(",")})`);
  const cells = Array.from({ length:n }, () => blank(W, H));
  for (let k = 0; k < W * H; k++) {
    const l = labels[k];
    const x = k % W, y = (k - x) / W;
    const cell = l >= 0 ? owner[l] : img.data[k * 4 + 3] ? cellAt(x, y) : -1;
    if (cell < 0) continue;
    const i = k * 4, out = cells[cell].data;
    out[i] = img.data[i]; out[i + 1] = img.data[i + 1]; out[i + 2] = img.data[i + 2]; out[i + 3] = img.data[i + 3];
  }
  return cells.map(cell => {
    const b = alphaBounds(cell, 0);
    const pad = 6;
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad), w = Math.min(W - x0, b.w + pad * 2), h = Math.min(H - y0, b.h + pad * 2);
    const out = blank(w, h);
    for (let y = 0; y < h; y++) out.data.set(cell.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return out;
  });
}

/* the hull's waterline centre in its cell: across its middle, at its bottom */
const waterOf = kayak => [kayak.hull.bbox.cx, kayak.hull.bbox.y1];

/* the shirt (tee): the green's pixels and its pale highlights, grown into its outline */
export function findShirt(img) {
  const { data:d, width:W, height:H } = img;
  const hist = new Array(72).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200 || sat(d[i], d[i + 1], d[i + 2]) < 0.5 || val(d[i], d[i + 1], d[i + 2]) < 0.4) continue;
    const h = hueOf(d[i], d[i + 1], d[i + 2]);
    if (h >= 70 && h <= 170) hist[Math.floor(h / 5)]++;
  }
  const best = hist.indexOf(Math.max(...hist));
  if (hist[best] < 50) return null;
  const hue = best * 5 + 2.5;
  let core = new Uint8Array(W * H);
  const light = new Float32Array(W * H), ink = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const i = k * 4;
    if (d[i + 3] < 24) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], s = sat(r, g, b), v = val(r, g, b);
    if (v < 0.3) { ink[k] = 1; continue; }
    if (s < 0.1 || hueDist(hueOf(r, g, b), hue) > 26) continue;
    if (s >= 0.35) core[k] = 1;
    else if (v > 0.72) { core[k] = 1; light[k] = Math.min(1, (0.5 - s) / 0.4); }
  }
  const { labels, comps } = components(core, W, H);
  const keep = new Set(comps.filter(c => c.n > 120).map(c => c.id));
  for (let k = 0; k < W * H; k++) if (core[k] && !keep.has(labels[k])) core[k] = 0;
  core = close(core, W, H, 2);
  return { mask:growIntoInk(core, img, ink), core, light };
}

function splitShirt(src, orig, shirt) {
  const { data:d, width:W, height:H } = orig;
  const ls = [];
  for (let k = 0; k < W * H; k++) if (shirt.core[k] && !shirt.light[k] && d[k * 4 + 3] > 240) ls.push(lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]));
  ls.sort((a, b) => a - b);
  const gain = 222 / Math.max(30, ls.length ? ls[ls.length >> 1] : 120);
  const out = { data:new Uint8Array(src.data), width:W, height:H };
  const mask = blank(W, H);
  for (let k = 0; k < W * H; k++) {
    if (!shirt.mask[k]) continue;
    const i = k * 4, l = lum(d[i], d[i + 1], d[i + 2]), v = val(d[i], d[i + 1], d[i + 2]);
    const gray = v < 0.3 ? Math.round(l * 0.6) : Math.min(255, Math.round(l * gain));
    const lit = shirt.light[k];
    const g = lit ? Math.round(gray + (255 - gray) * lit) : gray;
    out.data[i] = g; out.data[i + 1] = g; out.data[i + 2] = g;
    mask.data[i] = 255; mask.data[i + 1] = 255; mask.data[i + 2] = 255; mask.data[i + 3] = Math.round(d[i + 3] * (1 - 0.85 * lit));
  }
  return { src:out, mask };
}

/* the largest circle inside a mask (chamfer distance); with near, traded against distance from it */
export function chestOf(mask, W, H, near = null, minR = 0) {
  const INF = 1e9, dist = new Float64Array(W * H);
  for (let k = 0; k < W * H; k++) dist[k] = mask[k] ? INF : 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!dist[k]) continue;
    let v = dist[k];
    if (x > 0) v = Math.min(v, dist[k - 1] + a);
    if (y > 0) { v = Math.min(v, dist[k - W] + a); if (x > 0) v = Math.min(v, dist[k - W - 1] + b); if (x < W - 1) v = Math.min(v, dist[k - W + 1] + b); }
    dist[k] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x;
    if (!dist[k]) continue;
    let v = dist[k];
    if (x < W - 1) v = Math.min(v, dist[k + 1] + a);
    if (y < H - 1) { v = Math.min(v, dist[k + W] + a); if (x < W - 1) v = Math.min(v, dist[k + W + 1] + b); if (x > 0) v = Math.min(v, dist[k + W - 1] + b); }
    dist[k] = v;
  }
  let peak = 0;
  for (let k = 0; k < W * H; k++) if (dist[k] < INF && dist[k] > peak) peak = dist[k];
  const floor = Math.min(minR, peak);
  let best = -Infinity, at = -1;
  for (let k = 0; k < W * H; k++) {
    if (!dist[k] || dist[k] >= INF || dist[k] < floor) continue;
    const score = near ? dist[k] - 0.35 * Math.hypot(k % W - near[0], Math.floor(k / W) - near[1]) : dist[k];
    if (score > best) { best = score; at = k; }
  }
  return at < 0 ? null : [at % W, Math.floor(at / W), dist[at]];
}

const clampBox = (p, size = BOX) => [Math.max(0, Math.min(size, p[0])), Math.max(0, Math.min(size, p[1]))];

/* cut one sheet's cells: kayaks, scale, and per-pose placement */
async function cutSheet(id, sheetName) {
  const sheet = normalizeAlpha(await loadRGBA(sourceOf(sheetName)));
  const hues = { hull:keyHue(sheet, 325, 35), blade:keyHue(sheet, 258, 35) };
  if (hues.hull === null) throw new Error(`${id}: no magenta hull in ${sheetName}`);
  if (hues.blade === null) throw new Error(`${id}: no violet blades in ${sheetName}`);
  const cells = sliceGrid(sheet);
  const kayaks = cells.map(cell => findKayak(cell, hues));
  kayaks.forEach((k, i) => { if (!k?.hull.bbox) throw new Error(`${id}: no hull in ${POSES[i]} (${sheetName})`); });
  const s = HULL_W / kayaks[0].hull.bbox.w;
  return { cells, kayaks, s, hues };
}

/* the measured anchors of one placed pose */
function measurePose({ cell, kayak, s, idle, pose, placed, fixes = {} }) {
  const [wx, wy] = waterOf(kayak);
  const toBox = (x, y) => [WATER[0] + (x - wx) * s, WATER[1] + (y - wy) * s];
  const fromBox = ([x, y]) => [wx + (x - WATER[0]) / s, wy + (y - WATER[1]) / s];
  const hb = kayak.hull.bbox;
  /* the critter's size (a ring's width) in this cell's px */
  const R = (HULL_W * 0.85) / s;
  const eyes = findEyes(cell, { R, y0:Math.max(0, hb.y0 - R * 1.6), y1:hb.y0 + hb.h * 0.55, cx:hb.cx }, idle ? fromBox(idle.face) : null, kayak.mask);
  let face, head, eyesAt;
  const report = [];
  if (eyes) {
    face = toBox(eyes.x, eyes.y + eyes.span * 0.25);
    eyesAt = toBox(eyes.x, eyes.y);
    if (idle) head = [face[0] + idle.head[0] - idle.face[0], face[1] + idle.head[1] - idle.face[1]];
    else { const ex = toBox(eyes.x, 0)[0]; head = [ex, headUp(placed, ex, toBox(0, eyes.y)[1])]; }
  } else if (idle) {
    face = idle.face; head = idle.head; eyesAt = idle.eyes;
    report.push(`${pose} eyes not found`);
  } else throw new Error(`idle eyes not found`);
  const fix = fixes[pose];
  if (fix?.head) head = fix.head;
  if (fix?.face) face = fix.face;
  if (fix?.eyes) eyesAt = fix.eyes;
  /* the hand: the cup, else the shaft's middle (between the two biggest blades) */
  const cup = pose === "chug" ? cupOf(cell) : null;
  const blades = kayak.blades.slice().sort((a, b) => b.n - a.n).slice(0, 2);
  let hand;
  if (cup) hand = toBox(cup[0], cup[1]);
  else if (blades.length === 2) hand = toBox((blades[0].cx + blades[1].cx) / 2, (blades[0].cy + blades[1].cy) / 2);
  else hand = toBox(hb.cx, hb.y0);
  if (pose === "chug" && !cup) report.push("chug: no cup");
  if (blades.length < 2) report.push(`${pose}: ${blades.length} blade(s)`);
  const low = kayak.blades.slice().sort((a, b) => b.cy - a.cy)[0];
  const blade = low ? toBox(low.cx, low.cy) : hand;
  const anchor = { water:[...WATER], head:round2(clampBox(head)), face:round2(clampBox(face)), hand:round2(clampBox(hand)), eyes:round2(clampBox(eyesAt)), blade:round2(clampBox(blade)) };
  return { anchor, eyes, report, toBox, fromBox };
}

async function processCritter(id, { tee = true } = {}) {
  const { cells, kayaks, s } = await cutSheet(id, `${id}-kayak-sheet`);
  const dir = path.join(OUT, "critters", id);
  fs.mkdirSync(dir, { recursive:true });
  const poses = {};
  let idle = null, measure = null;
  const report = [];
  for (const [k, pose] of POSES.entries()) {
    const cell = cells[k], kayak = kayaks[k];
    const { src, tube } = splitKayak(cell, kayak);
    const [wx, wy] = waterOf(kayak);
    const placed = await placeInBox(src, { sx:wx, sy:wy, s, bx:WATER[0], by:WATER[1] });
    const placedTube = await placeInBox(tube, { sx:wx, sy:wy, s, bx:WATER[0], by:WATER[1] });
    if (placed.clipped) report.push(`${pose} clipped`);
    await saveWebp(placed.img, path.join(dir, `${pose}.webp`));
    await saveWebp(placedTube.img, path.join(dir, `${pose}-tube.webp`));
    if (process.argv.includes("--debug")) await savePng(placed.img, path.join(RAW, "debug", id, `${pose}.png`));
    const m = measurePose({ cell, kayak, s, idle, pose, placed:placed.img, fixes:ANCHOR_FIX[id] });
    report.push(...m.report);
    if (pose === "idle") {
      idle = m.anchor;
      const headW = headWidth(placed.img, idle.head, HULL_W * 0.85);
      measure = { headW, eyeSpan:Math.round(m.eyes && !m.eyes.single ? m.eyes.span * s : headW * 0.42) };
    }
    poses[pose] = { src:`critters/${id}/${pose}.webp`, tube:`critters/${id}/${pose}-tube.webp`, anchor:m.anchor };
  }
  const portrait = await processPortrait(id, dir);
  const entry = { anchor:idle, measure, poses, portrait, kayak:true };
  editManifest(mf => {
    mf.poses = [...POSES];
    const old = mf.critters[id] || {};
    mf.critters[id] = { ...entry, ...(old.tee && !tee ? { tee:old.tee } : {}) };
  });
  console.log(`${id}: scale ${s.toFixed(3)}, eyeSpan ${measure.eyeSpan}, headW ${measure.headW}${report.length ? `; ${report.join("; ")}` : ""}`);
  if (tee) await processTee(id, { idle });
}


async function processPortrait(id, dir) {
  const portrait = normalizeAlpha(await loadRGBA(sourceOf(`${id}-kayak-portrait`)));
  const hues = { hull:keyHue(portrait, 325, 35), blade:keyHue(portrait, 258, 35) };
  if (hues.hull === null || hues.blade === null) throw new Error(`${id}: the portrait has no magenta hull or violet blades`);
  const kayak = findKayak(portrait, hues);
  const pb = alphaBounds(portrait, 24);
  const P = PORTRAIT;
  const [wx, wy] = waterOf(kayak);
  const fit = Math.min(P.hullMax / kayak.hull.bbox.w, (P.size - P.margin * 2) / pb.w, (P.bottom - P.margin) / (pb.y1 - pb.y0 + 1));
  const bx = P.size / 2 + (wx - (pb.x0 + pb.w / 2)) * fit;
  const by = P.bottom - (pb.y1 - wy) * fit;
  const { src, tube } = splitKayak(portrait, kayak);
  const pa = await placeInBox(src, { sx:wx, sy:wy, s:fit, bx, by, box:[P.size, P.size] });
  const pt = await placeInBox(tube, { sx:wx, sy:wy, s:fit, bx, by, box:[P.size, P.size] });
  await saveWebp(pa.img, path.join(dir, "portrait.webp"));
  await saveWebp(pt.img, path.join(dir, "portrait-tube.webp"));
  const toBox = (x, y) => [bx + (x - wx) * fit, by + (y - wy) * fit];
  const hb = kayak.hull.bbox;
  const R = hb.w * 0.85;
  const pe = findEyes(portrait, { R, y0:Math.max(0, hb.y0 - R * 1.6), y1:hb.y0 + hb.h * 0.55, cx:hb.cx }, null, kayak.mask);
  const face = pe ? toBox(pe.x, pe.y + pe.span * 0.25) : [P.size / 2, P.size * 0.45];
  const eyes = pe ? toBox(pe.x, pe.y) : [face[0], face[1] - 30];
  const headX = pe ? toBox(pe.x, 0)[0] : P.size / 2;
  const head = [headX, headUp(pa.img, headX, eyes[1])];
  const blades = kayak.blades.slice().sort((a, b) => b.n - a.n).slice(0, 2);
  const hand = blades.length === 2 ? toBox((blades[0].cx + blades[1].cx) / 2, (blades[0].cy + blades[1].cy) / 2) : toBox(hb.cx, hb.y0);
  const headW = headWidth(pa.img, head, hb.w * fit * 0.85);
  const c = v => round2(clampBox(v, P.size));
  if (!pe || pe.single) console.log(`${id}: portrait eyes ${pe ? "single" : "not found"}`);
  return { src:`critters/${id}/portrait.webp`, tube:`critters/${id}/portrait-tube.webp`, w:P.size, h:P.size,
    anchor:{ water:c([bx, by]), head:c(head), face:c(face), hand:c(hand), eyes:c(eyes) },
    measure:{ headW, eyeSpan:Math.round(pe && !pe.single ? pe.span * fit : headW * 0.42) } };
}

/* the photo tee: the tee sheet cut like the plain one (its own hull scale),
   keyed twice: the kayak into `tube`, the shirt into `shirt` */
async function processTee(id, { idle: plainIdle }) {
  const plain = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8")).critters[id];
  const { cells, kayaks, s } = await cutSheet(id, `${id}-kayak-tee-sheet`);
  const dir = path.join(OUT, "critters", id, "tee");
  fs.mkdirSync(dir, { recursive:true });
  const poses = {};
  const report = [];
  let frame = null, idleChest = null, teeIdle = null;
  for (const [k, pose] of POSES.entries()) {
    const cell = cells[k], kayak = kayaks[k];
    const shirt = findShirt(cell);
    if (!shirt) { report.push(`${pose}: no shirt`); continue; }
    /* the shirt is never the kayak */
    for (let q = 0; q < kayak.mask.length; q++) if (kayak.mask[q]) { shirt.mask[q] = 0; shirt.core[q] = 0; }
    const { src:kayaked, tube } = splitKayak(cell, kayak);
    const { src, mask } = splitShirt(kayaked, cell, shirt);
    const [wx, wy] = waterOf(kayak);
    const place = img => placeInBox(img, { sx:wx, sy:wy, s, bx:WATER[0], by:WATER[1] });
    const [ps, pt, pm] = await Promise.all([place(src), place(tube), place(mask)]);
    await Promise.all([
      saveWebp(ps.img, path.join(dir, `${pose}.webp`)),
      saveWebp(pt.img, path.join(dir, `${pose}-tube.webp`)),
      saveWebp(pm.img, path.join(dir, `${pose}-shirt.webp`)),
    ]);
    const m = measurePose({ cell, kayak, s, idle:teeIdle || plainIdle, pose, placed:ps.img, fixes:ANCHOR_FIX[id] });
    if (pose === "idle") teeIdle = m.anchor;
    const anchor = { ...m.anchor };
    if (!m.eyes) Object.assign(anchor, { head:(plain.poses[pose]?.anchor || plain.anchor).head, face:(plain.poses[pose]?.anchor || plain.anchor).face, eyes:(plain.poses[pose]?.anchor || plain.anchor).eyes });
    const chest = chestOf(shirt.core, cell.width, cell.height, idleChest ? m.fromBox(idleChest.at) : null, idleChest ? (idleChest.r * 0.75) / s + 3 : 0);
    let chestR = chest ? Math.max(0, Math.round((chest[2] - 3) * s)) : 0;
    if (idleChest) chestR = Math.min(chestR, Math.round(idleChest.r * 1.15));
    if (chest) anchor.chest = round2(clampBox(m.toBox(chest[0], chest[1])));
    else { anchor.chest = round2([anchor.face[0], anchor.face[1] + 70]); report.push(`${pose}: no chest`); }
    if (pose === "idle" && chest) idleChest = { at:anchor.chest, r:chestR };
    poses[pose] = { src:`critters/${id}/tee/${pose}.webp`, tube:`critters/${id}/tee/${pose}-tube.webp`, shirt:`critters/${id}/tee/${pose}-shirt.webp`, anchor, chestR };
    if (pose === "idle") {
      const b = alphaBounds(ps.img, 24);
      const side = Math.min(512, Math.round(HULL_W * 1.8));
      const x = Math.max(0, Math.min(512 - side, Math.round(WATER[0] - side / 2)));
      const y = Math.max(0, Math.min(512 - side, Math.round(b.y1 + 14 - side)));
      frame = [x, y, side];
    }
    if (chestR < 14) report.push(`${pose}: small chest ${chestR}`);
    report.push(...m.report);
  }
  const rs = Object.values(poses).map(p => p.chestR).sort((a, b) => a - b);
  const median = rs[rs.length >> 1] || CHEST_MIN;
  for (const p of Object.values(poses)) p.chestR = Math.max(CHEST_MIN, Math.round(Math.max(p.chestR, median * 0.85)));
  editManifest(mf => { mf.critters[id].tee = { frame, poses }; });
  console.log(`${id} tee: scale ${s.toFixed(3)}, chest r ${Object.values(poses).map(p => p.chestR).join(" ")}${report.length ? `; ${report.join("; ")}` : ""}`);
}

/* the generations kept in the repo (lossless WebP in float/look/groove), so a checkout without the raw folder can recut */
async function keepSources(id) {
  const sharp = (await import("sharp")).default;
  for (const name of [`${id}-kayak-portrait`, `${id}-kayak-sheet`, `${id}-kayak-tee-sheet`]) {
    const rawFile = path.join(RAW, "gen", `${name}.png`);
    if (fs.existsSync(rawFile)) await sharp(rawFile).webp({ lossless:true, effort:4 }).toFile(path.join(SOURCES, `${name}.webp`));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const ids = args.filter(a => !a.startsWith("--"));
  for (const id of ids) {
    if (!ALL_CRITTER_IDS.includes(id)) { console.error(`${id}: not a critter`); continue; }
    await processCritter(id, { tee:!args.includes("--no-tee") }).then(() => keepSources(id)).catch(error => { console.error(`${id}: ${error.stack}`); process.exitCode = 1; });
  }
}
