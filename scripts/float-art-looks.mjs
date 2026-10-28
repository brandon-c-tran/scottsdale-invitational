/* Float Groove art: the looks (float/shared/looks.js HATS and SHADES), cut
   from two generated sheets (<raw>/gen/looks-hats.png, a 3 x 2 grid in
   HATS order; looks-shades.png, 2 x 2 in SHADES order).

   A hat's magenta is keyed like the tube (grey shading in `src`, a white
   `mask` the rider's colour fills); the crown keeps its gold. A hat is
   drawn fit x the critter's head width wide, its `anchor` (the middle of
   its base) at the head anchor's x, depth x the head width under the head's
   top, but never lower than a little over the eyes. Glasses keep their colours; their `anchor` is between the
   lenses and `span` the lenses' distance, so a pair is drawn to the eyes'
   span at anchor.eyes.

     node scripts/float-art-looks.mjs */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OUT, WEBP, sourceOf, loadRGBA, blank, components, alphaBounds, dilate, close, hueOf, hueDist, lum, editManifest } from "./float-art-lib.mjs";

const HATS = ["cowboy", "bucket", "visor", "captain", "party", "flowers"];
const SHADES = ["aviators", "hearts", "stars", "goggles"];
/* how each hat sits: fit = its width over the head's; depth = how far its
   base goes under the head's top, as a share of the head's width */
export const HAT_FIT = {
  cowboy:{ fit:1.22, depth:0.2 },
  bucket:{ fit:0.98, depth:0.2 },
  visor:{ fit:0.94, depth:0.2 },
  captain:{ fit:0.96, depth:0.18 },
  party:{ fit:0.42, depth:0.05 },
  flowers:{ fit:0.98, depth:0.1 },
  crown:{ fit:0.6, depth:0.05 },
};
/* a hat's base never comes lower than this share of the head's width over the eyes */
export const HAT_EYE_GAP = 0.08;
const HAT_W = 320, SHADE_W = 300;

function normalizeAlpha(img) {
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] < 8 ? 0 : img.data[i] >= 246 ? 255 : Math.round(img.data[i] * 255 / 246);
  return img;
}

/* the sheet's pieces, each to its grid cell, trimmed */
async function cells(file, cols, rows) {
  const img = normalizeAlpha(await loadRGBA(file));
  const { width:W, height:H, data:d } = img;
  const solid = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 16) solid[k] = 1;
  const { labels, comps } = components(solid, W, H);
  const cellOf = (x, y) => Math.min(rows - 1, Math.floor(y / (H / rows))) * cols + Math.min(cols - 1, Math.floor(x / (W / cols)));
  const owner = new Map();
  for (const c of comps) if (c.n >= 10) owner.set(c.id, cellOf(c.cx, c.cy));
  const out = Array.from({ length:cols * rows }, () => blank(W, H));
  for (let k = 0; k < W * H; k++) {
    const o = owner.get(labels[k]) ?? (d[k * 4 + 3] ? cellOf(k % W, Math.floor(k / W)) : undefined);
    if (o !== undefined) out[o].data.set(d.subarray(k * 4, k * 4 + 4), k * 4);
  }
  return out.map(cell => {
    const b = alphaBounds(cell, 8), pad = 3;
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad), w = Math.min(W - x0, b.w + pad * 2), h = Math.min(H - y0, b.h + pad * 2);
    const t = blank(w, h);
    for (let y = 0; y < h; y++) t.data.set(cell.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return t;
  });
}

async function scaled(img, w) {
  const h = Math.round(img.height * w / img.width);
  const buf = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw:{ width:img.width, height:img.height, channels:4 } }).resize(w, h, { kernel:"lanczos3", fit:"fill" }).raw().toBuffer();
  return { data:new Uint8Array(buf.buffer, buf.byteOffset, buf.length), width:w, height:h };
}
const write = (img, file) => sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw:{ width:img.width, height:img.height, channels:4 } }).webp(WEBP).toFile(file);

const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
/* the hat's magenta keyed out: src grey with its shading, mask white (thinner on highlights) */
function keyHat(img) {
  const { data:d, width:W, height:H } = img;
  const hist = new Array(72).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200 || sat(d[i], d[i + 1], d[i + 2]) < 0.6 || Math.max(d[i], d[i + 1], d[i + 2]) < 128) continue;
    const h = hueOf(d[i], d[i + 1], d[i + 2]);
    if (hueDist(h, 320) <= 45) hist[Math.floor(h / 5)]++;
  }
  const best = hist.indexOf(Math.max(...hist));
  if (hist[best] < 50) return null;
  const hue = best * 5 + 2.5;
  let mask = new Uint8Array(W * H);
  const light = new Float32Array(W * H), ink = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const i = k * 4;
    if (d[i + 3] < 24) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2], s = sat(r, g, b), v = Math.max(r, g, b) / 255;
    if (v < 0.32) { ink[k] = 1; continue; }
    if (s < 0.08 || hueDist(hueOf(r, g, b), hue) > 20) continue;
    if (s >= 0.45) mask[k] = 1;
    else if (v > 0.7) { mask[k] = 1; light[k] = Math.min(1, (0.62 - s) / 0.5); }
  }
  mask = close(mask, W, H, 2);
  let grown = mask;
  for (let pass = 0; pass < 3; pass++) {
    const next = dilate(grown, W, H, 1);
    for (let k = 0; k < W * H; k++) if (next[k] && !grown[k] && !ink[k]) next[k] = 0;
    grown = next;
  }
  const ls = [];
  for (let k = 0; k < W * H; k++) if (mask[k] && !light[k] && d[k * 4 + 3] > 240) ls.push(lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]));
  ls.sort((a, b) => a - b);
  const gain = 222 / Math.max(30, ls.length ? ls[ls.length >> 1] : 90);
  const src = { data:new Uint8Array(d), width:W, height:H }, tint = blank(W, H);
  for (let k = 0; k < W * H; k++) {
    if (!grown[k]) continue;
    const i = k * 4, l = lum(d[i], d[i + 1], d[i + 2]), v = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    const gray = v < 0.32 ? Math.round(l * 0.6) : Math.min(255, Math.round(l * gain));
    const out = light[k] ? Math.round(gray + (255 - gray) * light[k]) : gray;
    src.data[i] = out; src.data[i + 1] = out; src.data[i + 2] = out;
    tint.data[i] = 255; tint.data[i + 1] = 255; tint.data[i + 2] = 255; tint.data[i + 3] = Math.round(d[i + 3] * (1 - 0.85 * light[k]));
  }
  return { src, mask:tint };
}

/* a hat's base: the lowest row it mostly fills (the brim's underside, not a stray drop) */
function baseOf(img) {
  const { data:d, width:W, height:H } = img;
  for (let y = H - 1; y >= 0; y--) {
    let n = 0;
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 160) n++;
    if (n > W * 0.12) return y;
  }
  return H - 1;
}

/* the lenses' middles: the opaque pixels' centroid in each half (the outer tips, a strap's stubs, left out) */
function lensesOf(img) {
  const { data:d, width:W, height:H } = img;
  const half = (x0, x1) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = Math.round(x0); x < Math.round(x1); x++) if (d[(y * W + x) * 4 + 3] > 160) { sx += x; sy += y; n++; }
    return [sx / n, sy / n];
  };
  return [half(W * 0.1, W * 0.48), half(W * 0.52, W * 0.9)];
}

const dir = path.join(OUT, "looks");
fs.mkdirSync(path.join(dir, "hats"), { recursive:true });
fs.mkdirSync(path.join(dir, "shades"), { recursive:true });
const hats = {}, shades = {};
const hatCells = await cells(sourceOf("looks-hats"), 3, 2);
for (const [k, id] of HATS.entries()) {
  const img = await scaled(hatCells[k], HAT_W);
  const keyed = keyHat(img);
  if (!keyed) throw new Error(`${id}: no magenta`);
  await write(keyed.src, path.join(dir, "hats", `${id}.webp`));
  await write(keyed.mask, path.join(dir, "hats", `${id}-mask.webp`));
  const F = HAT_FIT[id];
  hats[id] = { src:`looks/hats/${id}.webp`, mask:`looks/hats/${id}-mask.webp`, w:img.width, h:img.height, anchor:[Math.round(img.width / 2), baseOf(img)], fit:F.fit, depth:F.depth, gap:HAT_EYE_GAP };
}
/* the groom's crown is the crown prop, gold as it is */
const m0 = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
const crown = m0.props.crown;
hats.crown = { src:crown.src, mask:null, w:crown.w, h:crown.h, anchor:[Math.round(crown.w / 2), crown.h - 2], fit:HAT_FIT.crown.fit, depth:HAT_FIT.crown.depth, gap:HAT_EYE_GAP };
const shadeCells = await cells(sourceOf("looks-shades"), 2, 2);
for (const [k, id] of SHADES.entries()) {
  const img = await scaled(shadeCells[k], SHADE_W);
  await write(img, path.join(dir, "shades", `${id}.webp`));
  const [l, r] = lensesOf(img);
  shades[id] = { src:`looks/shades/${id}.webp`, w:img.width, h:img.height, anchor:[Math.round((l[0] + r[0]) / 2), Math.round((l[1] + r[1]) / 2)], span:Math.round(r[0] - l[0]) };
}
editManifest(m => { m.hats = hats; m.shades = shades; });
console.log("hats:", Object.keys(hats).join(" "));
console.log("shades:", Object.entries(shades).map(([id, s]) => `${id} span ${s.span}`).join(", "));
