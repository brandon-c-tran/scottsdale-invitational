/* Float Groove art: the pixel work shared by the art scripts
   (scripts/float-art-*.mjs): keying a drawing off its background, finding
   its pieces, cutting a tube mask, and writing WebP files and the manifest
   (float/GROOVE.md "The art manifest and the 2D art module").

   An image here is { data, width, height } with data RGBA (Uint8Array). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT = path.join(ROOT, "public/float/groove");
export const MANIFEST = path.join(OUT, "manifest.json");
export const RAW = process.env.FLOAT_ART_RAW || path.resolve(ROOT, "../groove-art-raw");
/* the committed generations (lossless WebP), for a checkout without the raw folder */
export const SOURCES = path.join(ROOT, "float/look/groove");
/* a generation by name: <raw>/gen/<name>.png if it is there, else the committed copy */
export function sourceOf(name) {
  const raw = path.join(RAW, "gen", `${name}.png`);
  if (fs.existsSync(raw)) return raw;
  const kept = path.join(SOURCES, `${name}.webp`);
  if (fs.existsSync(kept)) return kept;
  throw new Error(`no source for ${name} (${raw} or ${kept})`);
}
export const POSES = ["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"];
export const BOX = 512;
export const WEBP = { quality:85, alphaQuality:100, effort:5 };

export async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  return { data:new Uint8Array(data.buffer, data.byteOffset, data.length), width:info.width, height:info.height };
}

export const blank = (width, height) => ({ data:new Uint8Array(width * height * 4), width, height });

export async function saveWebp(img, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw:{ width:img.width, height:img.height, channels:4 } })
    .webp({ ...WEBP, ...opts }).toFile(file);
  return file;
}
export async function savePng(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw:{ width:img.width, height:img.height, channels:4 } })
    .png().toFile(file);
  return file;
}

export const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export function hueOf(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
  if (!c) return 0;
  let h;
  if (max === r) h = ((g - b) / c) % 6;
  else if (max === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  return (h * 60 + 360) % 360;
}
export const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/* the background: every pixel reached from `seeds` (default the border)
   through pixels isBg(r, g, b, a) accepts. Returns a mask (1 = background). */
export function floodBackground(img, isBg, seeds = null) {
  const { data, width:W, height:H } = img;
  const bg = new Uint8Array(W * H);
  const stack = [];
  if (seeds) for (const [x, y] of seeds) stack.push(y * W + x);
  else {
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  }
  while (stack.length) {
    const k = stack.pop();
    if (bg[k]) continue;
    const i = k * 4;
    if (!isBg(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
    bg[k] = 1;
    const x = k % W;
    if (x > 0) stack.push(k - 1);
    if (x < W - 1) stack.push(k + 1);
    if (k >= W) stack.push(k - W);
    if (k < W * (H - 1)) stack.push(k + W);
  }
  return bg;
}

/* connected pieces of a mask (1 = in): { labels, comps:[{ id, n, x0, x1, y0, y1, cx, cy }] } */
export function components(mask, W, H) {
  const labels = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let k0 = 0; k0 < W * H; k0++) {
    if (!mask[k0] || labels[k0] >= 0) continue;
    const c = { id:comps.length, n:0, x0:W, x1:0, y0:H, y1:0, sx:0, sy:0 };
    const st = [k0];
    labels[k0] = c.id;
    while (st.length) {
      const k = st.pop(), x = k % W, y = (k - x) / W;
      c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const near = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1];
      for (const q of near) if (q >= 0 && mask[q] && labels[q] < 0) { labels[q] = c.id; st.push(q); }
    }
    c.cx = c.sx / c.n; c.cy = c.sy / c.n;
    comps.push(c);
  }
  return { labels, comps };
}

/* square-ish morphology on a 0/1 mask (r passes of a 3x3 cross) */
export function dilate(mask, W, H, r = 1) {
  let a = mask;
  for (let pass = 0; pass < r; pass++) {
    const b = new Uint8Array(a);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (a[k]) continue;
      if ((x > 0 && a[k - 1]) || (x < W - 1 && a[k + 1]) || (y > 0 && a[k - W]) || (y < H - 1 && a[k + W])) b[k] = 1;
    }
    a = b;
  }
  return a;
}
export function erode(mask, W, H, r = 1) {
  const inv = mask.map(v => (v ? 0 : 1));
  return dilate(inv, W, H, r).map(v => (v ? 0 : 1));
}
export const close = (mask, W, H, r) => erode(dilate(mask, W, H, r), W, H, r);

/* Key a drawing off a known flat background colour `bg` ([r,g,b]):
   `fg` (1 = drawing) from the flood; the ring of drawing pixels touching
   the background is un-blended from it (a black line antialiased onto bg
   becomes black with partial alpha), so no light halo is left. */
export function keyOff(img, fg, bg, { ring = 2, ink = [24, 22, 26] } = {}) {
  const { data, width:W, height:H } = img;
  const out = blank(W, H);
  const o = out.data;
  const edge = dilate(fg.map(v => (v ? 0 : 1)), W, H, ring);
  const lb = lum(bg[0], bg[1], bg[2]), li = lum(ink[0], ink[1], ink[2]);
  for (let k = 0; k < W * H; k++) {
    if (!fg[k]) continue;
    const i = k * 4;
    o[i] = data[i]; o[i + 1] = data[i + 1]; o[i + 2] = data[i + 2]; o[i + 3] = data[i + 3];
    if (!edge[k]) continue;
    /* how much of the ink this pixel holds, from its lightness between ink and bg */
    const l = lum(data[i], data[i + 1], data[i + 2]);
    const a = Math.max(0, Math.min(1, (lb - l) / (lb - li)));
    if (a > 0.92) continue;
    o[i] = ink[0]; o[i + 1] = ink[1]; o[i + 2] = ink[2]; o[i + 3] = Math.round(a * 255 * (data[i + 3] / 255));
  }
  return out;
}

/* crop + scale + place an RGBA image into a box: the source point (sx, sy)
   lands on (bx, by) at scale s */
export async function placeInBox(img, { sx, sy, s, bx, by, box = [BOX, BOX], kernel = "lanczos3" }) {
  const [BW, BH] = box;
  const W = Math.max(1, Math.round(img.width * s)), H = Math.max(1, Math.round(img.height * s));
  const scaled = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw:{ width:img.width, height:img.height, channels:4 } })
    .resize(W, H, { kernel, fit:"fill" }).raw().toBuffer();
  const left = Math.round(bx - sx * s), top = Math.round(by - sy * s);
  const out = blank(BW, BH);
  for (let y = 0; y < H; y++) {
    const ty = top + y;
    if (ty < 0 || ty >= BH) continue;
    for (let x = 0; x < W; x++) {
      const tx = left + x;
      if (tx < 0 || tx >= BW) continue;
      const si = (y * W + x) * 4, ti = (ty * BW + tx) * 4;
      out.data[ti] = scaled[si]; out.data[ti + 1] = scaled[si + 1]; out.data[ti + 2] = scaled[si + 2]; out.data[ti + 3] = scaled[si + 3];
    }
  }
  return { img:out, left, top, w:W, h:H, clipped:left < 0 || top < 0 || left + W > BW || top + H > BH };
}

/* a sub-image */
export function crop(img, x0, y0, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
    const si = (sy * img.width + sx) * 4, ti = (y * w + x) * 4;
    out.data[ti] = img.data[si]; out.data[ti + 1] = img.data[si + 1]; out.data[ti + 2] = img.data[si + 2]; out.data[ti + 3] = img.data[si + 3];
  }
  return out;
}

/* the opaque bounds of an RGBA image (alpha > t) */
export function alphaBounds(img, t = 8) {
  let x0 = img.width, x1 = -1, y0 = img.height, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] <= t) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, x1, y0, y1, w:x1 - x0 + 1, h:y1 - y0 + 1 };
}

/* Split a critter's tube out: `tube` (0/1, the tube's pixels incl. its
   outline) turns grey in `src` (its own shading kept: lightness scaled so
   the tube's body sits at `base`), and the mask image is white with alpha
   = tube (times the sprite's own alpha). */
export function splitTube(img, tube, { base = 226 } = {}) {
  const { data, width:W, height:H } = img;
  const ls = [];
  for (let k = 0; k < W * H; k++) if (tube[k] && data[k * 4 + 3] > 200) {
    const l = lum(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]);
    if (l > 70) ls.push(l);
  }
  ls.sort((a, b) => a - b);
  const median = ls.length ? ls[ls.length >> 1] : 180;
  const gain = base / Math.max(40, median);
  const src = { data:new Uint8Array(data), width:W, height:H };
  const mask = blank(W, H);
  for (let k = 0; k < W * H; k++) {
    if (!tube[k]) continue;
    const i = k * 4;
    const l = lum(data[i], data[i + 1], data[i + 2]);
    const g = Math.max(0, Math.min(255, Math.round(l < 70 ? l : l * gain)));
    src.data[i] = g; src.data[i + 1] = g; src.data[i + 2] = g;
    mask.data[i] = 255; mask.data[i + 1] = 255; mask.data[i + 2] = 255; mask.data[i + 3] = data[i + 3];
  }
  return { src, mask };
}

/* the manifest, merged: patch(manifest) edits it in place */
export function editManifest(patch) {
  let m = null;
  try { m = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch {}
  m ||= { v:1, poses:POSES, box:[BOX, BOX], critters:{}, host:null, scenes:{}, props:{}, font:null };
  patch(m);
  fs.mkdirSync(OUT, { recursive:true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify(m, null, 1)}\n`);
  return m;
}

/* a log line per image request (never the key) */
export function logRequest(entry) {
  const file = path.join(RAW, "requests.log");
  fs.mkdirSync(RAW, { recursive:true });
  fs.appendFileSync(file, `${new Date().toISOString()} ${JSON.stringify(entry)}\n`);
}
