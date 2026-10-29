/* Float Groove art: the photo tee (float/GROOVE.md "Looks, the Groove"). A
   critter's tee sheet (<raw>/gen/<id>-tee-sheet.png: its own pose sheet
   redrawn wearing a plain bright green T-shirt, the ring still magenta) is
   cut like its plain sheet, registered on the ring at the same scale and
   waterline, and keyed twice: the ring into `tube`, the shirt into `shirt`
   (grey shading in `src`; white masks the rider's colour fills). Each
   pose's photo goes in the largest circle that fits inside the shirt:
   anchor.chest and chestR. `frame` is the square of the idle pose the
   portrait is cut from ([x, y, side], box px).

     node scripts/float-art-tees.mjs <id...> */
import fs from "node:fs";
import path from "node:path";
import { ALL_CRITTER_IDS } from "../float/shared/looks.js";
import { OUT, MANIFEST, POSES, sourceOf, loadRGBA, blank, components, placeInBox, saveWebp, dilate, close, hueOf, hueDist, lum, editManifest, alphaBounds } from "./float-art-lib.mjs";
import { RING_W, WATER, normalizeAlpha, ringHue, findRing, splitRing, findEyes, sliceSheet, round2, ANCHOR_FIX } from "./float-art-sprites.mjs";

/* the photo's least radius in the box (it is clipped to the shirt, so a bigger one just shows less) */
export const CHEST_MIN = 18;
const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
const val = (r, g, b) => Math.max(r, g, b) / 255;

/* the shirt: the green's pixels and its pale highlights, gaps closed, grown into its outline */
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
  let grown = core;
  for (let pass = 0; pass < 4; pass++) {
    const next = dilate(grown, W, H, 1);
    for (let k = 0; k < W * H; k++) if (next[k] && !grown[k] && !ink[k] && !(d[k * 4 + 3] < 250 && lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) < 140)) next[k] = 0;
    grown = next;
  }
  return { mask:grown, core, light };
}

/* the shirt turned grey in src (its shading kept, highlights left white), and its mask */
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

/* the largest circle inside a mask: a two-pass chamfer distance, its peak;
   with near ([x, y], the idle chest in this cell's px) the best trade of
   size against distance from it, so the photo stays put from pose to pose */
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
  /* only circles at least minR (when the shirt has room for one) */
  const floor = Math.min(minR, peak);
  let best = -Infinity, at = -1;
  for (let k = 0; k < W * H; k++) {
    if (!dist[k] || dist[k] >= INF || dist[k] < floor) continue;
    const score = near ? dist[k] - 0.35 * Math.hypot(k % W - near[0], Math.floor(k / W) - near[1]) : dist[k];
    if (score > best) { best = score; at = k; }
  }
  return at < 0 ? null : [at % W, Math.floor(at / W), dist[at]];
}

async function processTee(id) {
  const plain = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).critters[id];
  if (!plain) throw new Error(`${id}: cut its plain sprites first`);
  const sheet = normalizeAlpha(await loadRGBA(sourceOf(`${id}-tee-sheet`)));
  const hue = ringHue(sheet);
  if (hue === null) throw new Error(`${id}: no magenta ring in the tee sheet`);
  const cells = sliceSheet(sheet);
  const rings = cells.map(cell => findRing(cell, hue));
  rings.forEach((ring, k) => { if (!ring) throw new Error(`${id}: no ring in ${POSES[k]}`); });
  const s = RING_W / rings[0].bbox.w;
  const dir = path.join(OUT, "critters", id, "tee");
  fs.mkdirSync(dir, { recursive:true });
  const poses = {};
  const report = [];
  let frame = null, idleChest = null;
  for (const [k, pose] of POSES.entries()) {
    const cell = cells[k], ring = rings[k];
    const shirt = findShirt(cell);
    if (!shirt) { report.push(`${pose}: no shirt`); continue; }
    const { src:ringed, tube } = splitRing(cell, ring);
    const { src, mask } = splitShirt(ringed, cell, shirt);
    const wx = ring.bbox.cx, wy = ring.bbox.y0 + ring.bbox.h * 0.7;
    const place = img => placeInBox(img, { sx:wx, sy:wy, s, bx:WATER[0], by:WATER[1] });
    const [ps, pt, pm] = await Promise.all([place(src), place(tube), place(mask)]);
    await Promise.all([
      saveWebp(ps.img, path.join(dir, `${pose}.webp`)),
      saveWebp(pt.img, path.join(dir, `${pose}-tube.webp`)),
      saveWebp(pm.img, path.join(dir, `${pose}-shirt.webp`)),
    ]);
    const toBox = (x, y) => [WATER[0] + (x - wx) * s, WATER[1] + (y - wy) * s];
    const fromBox = ([x, y]) => [wx + (x - WATER[0]) / s, wy + (y - WATER[1]) / s];
    /* the face as the plain pose has it, moved to these eyes where they are found */
    const base = { ...plain.anchor, ...(plain.poses[pose]?.anchor || {}) };
    const eyes = ANCHOR_FIX[id]?.[pose] ? null : findEyes(cell, ring, fromBox(base.face));
    let anchor = { ...base };
    if (eyes) {
      const face = toBox(eyes.x, eyes.y + eyes.span * 0.25);
      const dx = face[0] - base.face[0], dy = face[1] - base.face[1];
      if (Math.hypot(dx, dy) < 40) anchor = { ...base, face, head:[base.head[0] + dx, base.head[1] + dy], eyes:toBox(eyes.x, eyes.y) };
    }
    /* the photo: the largest circle inside the shirt, a little inside its edge */
    const chest = chestOf(shirt.core, cell.width, cell.height, idleChest ? fromBox(idleChest.at) : null, idleChest ? (idleChest.r * 0.75) / s + 3 : 0);
    let chestR = chest ? Math.max(0, Math.round((chest[2] - 3) * s)) : 0;
    if (idleChest) chestR = Math.min(chestR, Math.round(idleChest.r * 1.15));
    if (chest) anchor.chest = toBox(chest[0], chest[1]);
    if (pose === "idle" && chest) idleChest = { at:anchor.chest, r:chestR };
    const out = Object.fromEntries(Object.entries(anchor).map(([name, at]) => [name, round2(at)]));
    out.water = [...WATER];
    poses[pose] = { src:`critters/${id}/tee/${pose}.webp`, tube:`critters/${id}/tee/${pose}-tube.webp`, shirt:`critters/${id}/tee/${pose}-shirt.webp`, anchor:out, chestR };
    if (pose === "idle") {
      /* the portrait's framing: the ring half the frame's width (as the plain portraits), room above for a hat, its foot near the bottom */
      const b = alphaBounds(ps.img, 24);
      const side = Math.min(512, Math.round(RING_W * 2));
      const x = Math.max(0, Math.min(512 - side, Math.round(WATER[0] - side / 2)));
      const y = Math.max(0, Math.min(512 - side, Math.round(b.y1 + 14 - side)));
      frame = [x, y, side];
    }
    if (chestR < 14) report.push(`${pose}: small chest ${chestR}`);
  }
  /* a photo big enough to read: at least CHEST_MIN, near the poses' median; it is printed on the shirt only (the arms cross it) */
  const rs = Object.values(poses).map(p => p.chestR).sort((a, b) => a - b);
  const median = rs[rs.length >> 1] || CHEST_MIN;
  for (const p of Object.values(poses)) p.chestR = Math.max(CHEST_MIN, Math.round(Math.max(p.chestR, median * 0.85)));
  editManifest(m => { m.critters[id].tee = { frame, poses }; });
  console.log(`${id}: tee scale ${s.toFixed(3)}, chest r ${Object.values(poses).map(p => p.chestR).join(" ")}${report.length ? `; ${report.join("; ")}` : ""}`);
}

const ids = process.argv.slice(2);
for (const id of ids.length ? ids : ALL_CRITTER_IDS) {
  if (!ALL_CRITTER_IDS.includes(id)) { console.error(`${id}: not a critter`); continue; }
  await processTee(id).catch(error => { console.error(`${id}: ${error.message}`); process.exitCode = 1; });
}
