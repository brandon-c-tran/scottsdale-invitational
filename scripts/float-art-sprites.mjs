/* Float Groove art: a critter's generated art into the manifest
   (float/GROOVE.md "The art pipeline"). Reads <raw>/gen/<id>-sheet.png (the
   eight poses in a 4 x 2 grid on a transparent background, the swim ring in
   flat magenta) and <raw>/gen/<id>-portrait.png (idle, facing front), and
   writes public/float/groove/critters/<id>/<pose>.webp, <pose>-tube.webp,
   portrait.webp, portrait-tube.webp and the critter's manifest entry.

   Every pose is registered by its ring, the one thing all eight share: one
   scale per critter (the idle ring's width becomes RING_W), and each pose's
   ring centre, 70% down its height, lands on the critter's waterline
   (anchor.water), so a pose swaps without a jump and every critter's ring is
   the same size on screen. The ring turns grey in `src` (its shading kept;
   its highlights left white by thinning the mask there) and its mask is the
   tube file. head and face come from the eyes; hand from the ring.

     node scripts/float-art-sprites.mjs <id...> [--sheet <png>] [--portrait <png>] [--debug]
*/
import fs from "node:fs";
import path from "node:path";
import { ALL_CRITTER_IDS } from "../float/shared/looks.js";
import { OUT, RAW, POSES, BOX, loadRGBA, blank, components, placeInBox, saveWebp, savePng, dilate, close, hueOf, hueDist, lum, editManifest, alphaBounds } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flags = new Set(["--sheet", "--portrait"]);
const ids = args.filter((a, i) => !a.startsWith("--") && !flags.has(args[i - 1]));
const DEBUG = args.includes("--debug");

/* the family's one scale: every idle ring this wide, its waterline here */
export const RING_W = 250;
export const WATER = [256, 440];
/* the portrait: the ring up to this wide, the critter kept inside the frame */
export const PORTRAIT = { size:1024, ringMax:600, margin:36, bottom:984 };
const SHEET_GRID = { cols:4, rows:2 };

/* alpha: the model's transparent PNGs top out at 254; stray specks under 8 go */
function normalizeAlpha(img) {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 8 ? 0 : d[i] >= 246 ? 255 : Math.round(d[i] * 255 / 246);
  return img;
}

const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
const val = (r, g, b) => Math.max(r, g, b) / 255;

/* the ring's hue: the commonest hue among strongly saturated, bright pixels near 330 (magenta to hot pink) */
function ringHue(img) {
  const hist = new Array(72).fill(0);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (sat(r, g, b) < 0.6 || val(r, g, b) < 0.5) continue;
    const h = hueOf(r, g, b);
    if (hueDist(h, 320) > 45) continue;
    hist[Math.floor(h / 5)]++;
  }
  const best = hist.indexOf(Math.max(...hist));
  return hist[best] > 50 ? best * 5 + 2.5 : null;
}

/* The ring of one pose: { mask (0/1 incl. its outline), highlight (0 to 1),
   bbox, n } or null. Magenta pixels by hue; its pale highlights (same hue,
   low saturation, bright); closed over small gaps; then grown into the black
   outline around it, never into the white body. */
function findRing(img, hue) {
  const { data:d, width:W, height:H } = img;
  const core = new Uint8Array(W * H), light = new Float32Array(W * H), ink = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const i = k * 4;
    if (d[i + 3] < 24) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const s = sat(r, g, b), v = val(r, g, b);
    if (v < 0.32) { ink[k] = 1; continue; }
    if (s < 0.08) continue;
    if (hueDist(hueOf(r, g, b), hue) > 20) continue;
    if (s >= 0.45) core[k] = 1;
    else if (v > 0.7) { core[k] = 1; light[k] = Math.min(1, (0.62 - s) / 0.5); }
  }
  /* keep the big pieces (the ring), not a pink tongue or cheek */
  const { labels, comps } = components(core, W, H);
  /* the ring is the biggest piece; others count only where the ring is (an arm can split it), never above it (an open pink mouth) */
  const main = comps.reduce((a, c) => (!a || c.n > a.n ? c : a), null);
  const keep = new Set(comps.filter(c => c === main || (c.n > Math.max(400, main.n * 0.04) && c.cy >= main.y0 && c.y0 >= main.y0 - (main.y1 - main.y0) * 0.15)).map(c => c.id));
  let mask = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (core[k] && keep.has(labels[k])) mask[k] = 1;
  mask = close(mask, W, H, 3);
  /* grow into the dark outline only */
  let grown = mask;
  for (let pass = 0; pass < 4; pass++) {
    const next = dilate(grown, W, H, 1);
    for (let k = 0; k < W * H; k++) if (next[k] && !grown[k] && !ink[k] && !(d[k * 4 + 3] < 250 && lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) < 140)) next[k] = 0;
    grown = next;
  }
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
  for (let k = 0; k < W * H; k++) {
    if (!mask[k]) continue;
    n++;
    const x = k % W, y = (k - x) / W;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!n) return null;
  return { mask:grown, light, bbox:{ x0, x1, y0, y1, w:x1 - x0 + 1, h:y1 - y0 + 1, cx:(x0 + x1) / 2 }, n };
}

/* src (the ring grey, shading kept) and the tube mask (white; alpha = ring, thinned at highlights) */
function splitRing(img, ring) {
  const { data:d, width:W, height:H } = img;
  const ls = [];
  for (let k = 0; k < W * H; k++) if (ring.mask[k] && d[k * 4 + 3] > 240 && val(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) > 0.55 && !ring.light[k]) ls.push(lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]));
  ls.sort((a, b) => a - b);
  const median = ls.length ? ls[ls.length >> 1] : 90;
  const gain = 222 / Math.max(30, median);
  const src = { data:new Uint8Array(d), width:W, height:H };
  const tube = blank(W, H);
  for (let k = 0; k < W * H; k++) {
    if (!ring.mask[k]) continue;
    const i = k * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const v = val(r, g, b);
    const l = lum(r, g, b);
    /* the outline stays ink; the ring's own pixels become its grey */
    const gray = v < 0.32 ? Math.round(l * 0.6) : Math.min(255, Math.round(l * gain));
    const lit = ring.light[k];
    const out = lit ? Math.round(gray + (255 - gray) * lit) : gray;
    src.data[i] = out; src.data[i + 1] = out; src.data[i + 2] = out;
    tube.data[i] = 255; tube.data[i + 1] = 255; tube.data[i + 2] = 255;
    tube.data[i + 3] = Math.round(d[i + 3] * (1 - 0.85 * lit));
  }
  return { src, tube };
}

/* the eyes: two small round dark blobs above the ring, side by side */
function findEyes(img, ring) {
  const { data:d, width:W, height:H } = img;
  const dark = new Uint8Array(W * H);
  const top = Math.max(0, ring.bbox.y0 - ring.bbox.w * 1.4);
  for (let k = 0; k < W * H; k++) {
    const y = Math.floor(k / W);
    if (y < top || y > ring.bbox.y0) continue;
    const i = k * 4;
    if (d[i + 3] > 200 && val(d[i], d[i + 1], d[i + 2]) < 0.28) dark[k] = 1;
  }
  const { comps } = components(dark, W, H);
  const R = ring.bbox.w;
  const dots = comps.filter(c => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    const fill = c.n / (w * h);
    return w >= R * 0.022 && w <= R * 0.085 && h >= R * 0.022 && h <= R * 0.1 && Math.max(w, h) / Math.min(w, h) < 1.7 && fill > 0.55;
  });
  let best = null;
  for (let a = 0; a < dots.length; a++) for (let b = a + 1; b < dots.length; b++) {
    const A = dots[a], B = dots[b];
    const dx = Math.abs(A.cx - B.cx), dy = Math.abs(A.cy - B.cy);
    if (dx < R * 0.12 || dx > R * 0.62 || dy > R * 0.12) continue;
    const sizeMatch = Math.min(A.n, B.n) / Math.max(A.n, B.n);
    if (sizeMatch < 0.45) continue;
    const score = sizeMatch - dy / R;
    if (!best || score > best.score) best = { score, l:A.cx < B.cx ? A : B, r:A.cx < B.cx ? B : A };
  }
  if (best) return { x:(best.l.cx + best.r.cx) / 2, y:(best.l.cy + best.r.cy) / 2, span:best.r.cx - best.l.cx };
  /* a side view shows one eye: the roundest dot nearest the ring's middle */
  const one = dots.sort((a, b) => Math.abs(a.cx - ring.bbox.cx) - Math.abs(b.cx - ring.bbox.cx))[0];
  return one ? { x:one.cx, y:one.cy, span:R * 0.2, single:true } : null;
}

/* the top of the head above x: the first opaque pixel going down that column */
function headTop(img, x, fromY = 0) {
  const { data:d, width:W, height:H } = img;
  const cx = Math.round(x);
  for (let y = fromY; y < H; y++) {
    let hits = 0;
    for (let dx = -3; dx <= 3; dx++) {
      const xx = cx + dx;
      if (xx >= 0 && xx < W && d[(y * W + xx) * 4 + 3] > 160) hits++;
    }
    if (hits >= 5) return y;
  }
  return null;
}

/* a pose cut from the sheet's cells: the pixels of the pieces nearest that cell's centre */
function sliceSheet(img) {
  const { width:W, height:H } = img;
  const solid = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (img.data[k * 4 + 3] > 24) solid[k] = 1;
  const { labels, comps } = components(solid, W, H);
  const cw = W / SHEET_GRID.cols, ch = H / SHEET_GRID.rows;
  const cellOf = c => {
    const col = Math.max(0, Math.min(SHEET_GRID.cols - 1, Math.floor(c.cx / cw)));
    const row = Math.max(0, Math.min(SHEET_GRID.rows - 1, Math.floor(c.cy / ch)));
    return row * SHEET_GRID.cols + col;
  };
  const owner = new Int32Array(comps.length).fill(-1);
  const big = new Array(8).fill(0);
  for (const c of comps) {
    if (c.n < 12) continue;
    owner[c.id] = cellOf(c);
    if (c.n > 4000) big[owner[c.id]]++;
  }
  if (big.some(n => n < 1)) throw new Error(`a cell has no critter (${big.join(",")})`);
  const cells = Array.from({ length:8 }, () => blank(W, H));
  for (let k = 0; k < W * H; k++) {
    const l = labels[k];
    if (l < 0 || owner[l] < 0) continue;
    const i = k * 4, cell = cells[owner[l]].data;
    cell[i] = img.data[i]; cell[i + 1] = img.data[i + 1]; cell[i + 2] = img.data[i + 2]; cell[i + 3] = img.data[i + 3];
  }
  /* soft edge pixels of each piece (alpha <= 24) belong to the cell they sit in */
  for (let k = 0; k < W * H; k++) {
    if (labels[k] >= 0 || !img.data[k * 4 + 3]) continue;
    const x = k % W, y = (k - x) / W;
    const cell = Math.min(SHEET_GRID.rows - 1, Math.floor(y / ch)) * SHEET_GRID.cols + Math.min(SHEET_GRID.cols - 1, Math.floor(x / cw));
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

const round2 = p => [Math.round(p[0]), Math.round(p[1])];

async function processCritter(id) {
  const sheetFile = value("--sheet") || path.join(RAW, "gen", `${id}-sheet.png`);
  const portraitFile = value("--portrait") || path.join(RAW, "gen", `${id}-portrait.png`);
  const sheet = normalizeAlpha(await loadRGBA(sheetFile));
  const hue = ringHue(sheet);
  if (hue === null) throw new Error(`${id}: no magenta ring in the sheet`);
  const cells = sliceSheet(sheet);
  const rings = cells.map(cell => findRing(cell, hue));
  rings.forEach((ring, k) => { if (!ring) throw new Error(`${id}: no ring in ${POSES[k]}`); });
  /* one scale for the critter: the idle ring (the widest of idle and stroke, in case one leans) */
  const s = RING_W / rings[0].bbox.w;
  const dir = path.join(OUT, "critters", id);
  fs.mkdirSync(dir, { recursive:true });
  const poses = {};
  let idleAnchor = null;
  const report = [];
  for (const [k, pose] of POSES.entries()) {
    const cell = cells[k], ring = rings[k];
    const { src, tube } = splitRing(cell, ring);
    const wx = ring.bbox.cx, wy = ring.bbox.y0 + ring.bbox.h * 0.7;
    const placed = await placeInBox(src, { sx:wx, sy:wy, s, bx:WATER[0], by:WATER[1] });
    const placedTube = await placeInBox(tube, { sx:wx, sy:wy, s, bx:WATER[0], by:WATER[1] });
    if (placed.clipped) report.push(`${pose} clipped`);
    await saveWebp(placed.img, path.join(dir, `${pose}.webp`));
    await saveWebp(placedTube.img, path.join(dir, `${pose}-tube.webp`));
    if (DEBUG) await savePng(placed.img, path.join(RAW, "debug", id, `${pose}.png`));
    /* anchors in the box */
    const toBox = (x, y) => [WATER[0] + (x - wx) * s, WATER[1] + (y - wy) * s];
    const eyes = findEyes(cell, ring);
    const ringBox = { x0:toBox(ring.bbox.x0, 0)[0], x1:toBox(ring.bbox.x1, 0)[0], y0:toBox(0, ring.bbox.y0)[1] };
    const hand = [ringBox.x0 + (ringBox.x1 - ringBox.x0) * 0.72, ringBox.y0 + 4];
    let face, head;
    if (eyes) {
      face = toBox(eyes.x, eyes.y + eyes.span * 0.25);
      const top = headTop(placed.img, toBox(eyes.x, 0)[0]);
      head = [toBox(eyes.x, 0)[0], top ?? toBox(0, eyes.y - eyes.span)[1]];
    } else if (idleAnchor) {
      face = idleAnchor.face;
      head = [idleAnchor.head[0], headTop(placed.img, idleAnchor.head[0]) ?? idleAnchor.head[1]];
      report.push(`${pose} eyes not found`);
    } else {
      const top = headTop(placed.img, WATER[0]) ?? 120;
      head = [WATER[0], top];
      face = [WATER[0], (top + ringBox.y0) / 2];
      report.push(`${pose} eyes not found`);
    }
    const anchor = { water:[...WATER], head:round2(head), face:round2(face), hand:round2(hand) };
    if (pose === "idle") idleAnchor = anchor;
    poses[pose] = { src:`critters/${id}/${pose}.webp`, tube:`critters/${id}/${pose}-tube.webp`, anchor };
  }
  /* the portrait: its ring as wide as fits, up to PORTRAIT.ringMax */
  const portrait = normalizeAlpha(await loadRGBA(portraitFile));
  const pHue = ringHue(portrait) ?? hue;
  const pr = findRing(portrait, pHue);
  if (!pr) throw new Error(`${id}: no ring in the portrait`);
  const pb = alphaBounds(portrait, 24);
  const P = PORTRAIT;
  const wx = pr.bbox.cx, wy = pr.bbox.y0 + pr.bbox.h * 0.7;
  const fit = Math.min(P.ringMax / pr.bbox.w,
    (P.size - P.margin * 2) / pb.w,
    (P.bottom - P.margin) / pb.h);
  /* centred on the critter's own bounds, its lowest point at P.bottom */
  const bx = P.size / 2 + (wx - (pb.x0 + pb.w / 2)) * fit;
  const by = P.bottom - (pb.y1 - wy) * fit;
  const { src:psrc, tube:ptube } = splitRing(portrait, pr);
  const pa = await placeInBox(psrc, { sx:wx, sy:wy, s:fit, bx, by, box:[P.size, P.size] });
  const pt = await placeInBox(ptube, { sx:wx, sy:wy, s:fit, bx, by, box:[P.size, P.size] });
  await saveWebp(pa.img, path.join(dir, "portrait.webp"));
  await saveWebp(pt.img, path.join(dir, "portrait-tube.webp"));
  const pToBox = (x, y) => [bx + (x - wx) * fit, by + (y - wy) * fit];
  const pe = findEyes(portrait, pr);
  const pFace = pe ? pToBox(pe.x, pe.y + pe.span * 0.25) : [P.size / 2, P.size * 0.45];
  const pHeadX = pe ? pToBox(pe.x, 0)[0] : P.size / 2;
  const pHead = [pHeadX, headTop(pa.img, pHeadX) ?? P.size * 0.15];
  const entry = {
    anchor:idleAnchor,
    poses,
    portrait:{ src:`critters/${id}/portrait.webp`, tube:`critters/${id}/portrait-tube.webp`, w:P.size, h:P.size,
      anchor:{ water:round2([bx, by]), head:round2(pHead), face:round2(pFace), hand:round2(pToBox(pr.bbox.x0 + pr.bbox.w * 0.72, pr.bbox.y0)) } },
  };
  editManifest(m => { m.critters[id] = entry; });
  console.log(`${id}: ring hue ${hue}, scale ${s.toFixed(3)}, portrait scale ${fit.toFixed(3)}${report.length ? `; ${report.join("; ")}` : ""}`);
}

for (const id of ids) {
  if (!ALL_CRITTER_IDS.includes(id)) { console.error(`${id}: not a critter`); continue; }
  await processCritter(id).catch(error => { console.error(`${id}: ${error.message}`); process.exitCode = 1; });
}
