/* Float Groove looks: what goes in front of a hat or a pair of glasses,
   measured from the finished art (float/GROOVE.md "Hats and glasses sit
   right", Oct 30 pass).

   A hat is painted over the sprite, so anything the sprite has above the
   brow that sticks up thinner than the skull (ears, horns, a crest, a
   plume, a paddle or paws held overhead) would vanish under it. For every
   critter, every pose of the plain set and of the photo tee set, and the
   portrait, this writes:

   - `<pose>-front.webp`: the sprite's own pixels of those parts (the body's
     alpha minus its morphological opening, near the head in its turned frame,
     only pieces that grow from the head: never an arm or the paddle), and in
     the chug pose the cup with its ink, which sits in front of glasses
   - `<pose>-seam.webp`: an ink line where a protrusion meets the skull (its
     base), drawn only over a hat, so an ear comes out of the crown with an
     edge instead of a cut

   - `measure.skullTop`: the skull's top (the opened body, so never an ear's
     tip) as a depth under anchor.head along the head's down; hats seat from it

   The painter draws front clipped to the accessories it painted and seam
   clipped to the hat (index.js `paintSprite`). Written to the manifest as
   `front` and `seam` on each pose (portrait: on the portrait). Run it after
   float-art-fit-anchors.mjs, which rewrites every measure.

     node scripts/float-art-seat.mjs [ids...] [--dry] [--debug <dir>] */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { OUT, loadRGBA, components, editManifest, WEBP } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry");
const DEBUG = value("--debug");
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--debug");

/* the opening's radius in box px: an ear, a horn or a crest is thinner than twice this, a skull is not */
const OPEN_PX = 34;
/* a critter whose skull is narrow (or whose parts are broad) opens at its own radius */
export const OPEN_BY = { winnie:14 };
/* critters whose opened body rises over the skull behind it (the tortoise's shell, the bighorn's horn
   roots): their hats seat from the measured head anchor */
export const SKULL_FROM_ANCHOR = new Set(["tortoise", "bighorn"]);
/* how far under the eyes a part may hang and still count (head widths): arms raised beside the
   head, a paw at the glasses, the cup; the painter keeps only what crosses something worn */
const DOWN_REACH = 0.6;
/* how far either side of the skull's middle a protrusion may stand (head widths) */
const REACH = 1.35;
/* the seam's width and the smallest piece kept, in box px (512) */
const SEAM_PX = 2.6, MIN_PIECE = 40;

/* exact squared Euclidean distance to the nearest `false` cell of mask (Felzenszwalb) */
export function edt(mask, W, H) {
  const INF = 1e12;
  const f = new Float64Array(Math.max(W, H)), d = new Float64Array(Math.max(W, H));
  const v = new Int32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1);
  const out = new Float64Array(W * H);
  const pass = (n) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      while (true) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s <= z[k]) { k--; continue; }
        break;
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = mask[y * W + x] ? INF : 0;
    pass(H);
    for (let y = 0; y < H; y++) out[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = out[y * W + x];
    pass(W);
    for (let x = 0; x < W; x++) out[y * W + x] = d[x];
  }
  return out;
}
/* opening by a disc of radius r: erode (far enough from outside), then grow back by r */
export function opening(mask, W, H, r) {
  const toOut = edt(mask, W, H);
  const core = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) core[i] = toOut[i] > r * r ? 1 : 0;
  const notCore = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) notCore[i] = core[i] ? 0 : 1;
  const toCore = edt(notCore, W, H);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = mask[i] && toCore[i] <= r * r ? 1 : 0;
  return out;
}
function grow(mask, W, H, r) {
  const not = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) not[i] = mask[i] ? 0 : 1;
  const d = edt(not, W, H), out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = d[i] <= r * r ? 1 : 0;
  return out;
}

const isRed = (r, g, b) => r > 165 && g < 120 && b < 120 && r - g > 80;
const isDark = (r, g, b) => Math.max(r, g, b) < 90;

/* one sprite: { front:RGBA, seam:alpha, skullTop } in the image's own px. at: anchors, m: measure, k: image px per box px */
export function seatOf(img, at, m, { pose = "", k = 1, open = OPEN_PX, tube = null } = {}) {
  const { data:d, width:W, height:H } = img;
  const A = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  const headW = Math.max(m.headW || 160, 0.2 * 512) * (m.headW ? 1 : k);
  const th = (m.tilt || 0) * Math.PI / 180, u = [Math.cos(th), Math.sin(th)], n = [Math.sin(th), -Math.cos(th)];
  const [hx, hy] = at.head, [ex, ey] = at.eyes || at.face || at.head;
  /* depth of the eyes under the head's top, along the head's down */
  const eyeDown = Math.max(headW * 0.12, -((ex - hx) * n[0] + (ey - hy) * n[1]));
  const r = open * k;
  const O = opening(A, W, H, r);
  const P = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!A[i] || O[i]) continue;
    const dx = x - hx, dy = y - hy;
    const across = dx * u[0] + dy * u[1], down = -(dx * n[0] + dy * n[1]);
    if (down > eyeDown + headW * DOWN_REACH || Math.abs(across) > headW * REACH || down < -headW * 2.2) continue;
    P[i] = 1;
  }
  /* only what grows from the head: a piece whose lowest point is over the eyes (ears, horns, a crest,
     a plume), never an arm (it hangs on down past them) nor the paddle (it carries the kayak's colour,
     or is mostly its dark shaft); small crumbs (a corner the disc rounded off) are nothing */
  const { comps, labels } = components(P, W, H);
  const low = new Float64Array(comps.length).fill(-Infinity), tubeN = new Uint32Array(comps.length), darkN = new Uint32Array(comps.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!P[i]) continue;
    const c = labels[i], dx = x - hx, dy = y - hy;
    const down = -(dx * n[0] + dy * n[1]);
    if (down > low[c]) low[c] = down;
    if (tube && tube[i * 4 + 3] > 80) tubeN[c]++;
    if (isDark(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) darkN[c]++;
  }
  const keep = new Set(comps.filter(c => c.n >= MIN_PIECE * k * k && low[c.id] < eyeDown * 0.9 && tubeN[c.id] < c.n * 0.04 && darkN[c.id] < c.n * 0.5).map(c => c.id));
  for (let i = 0; i < W * H; i++) if (P[i] && !keep.has(labels[i])) P[i] = 0;
  /* a part's own ink just outside it comes too (its outline is drawn half on the skull) */
  const P2 = grow(P, W, H, 2.5 * k);
  for (let i = 0; i < W * H; i++) if (P2[i] && A[i] && isDark(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) && !P[i]) P[i] = 2;
  /* the seam: a part's pixels next to the skull (opaque, not a part), so where it meets what a hat covers */
  const rest = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) rest[i] = A[i] && !P[i] ? 1 : 0;
  const nearRest = grow(rest, W, H, SEAM_PX * k);
  const seam = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) seam[i] = P[i] === 1 && nearRest[i] ? 255 : 0;
  /* the cup (chug): red near the face, closed over its highlights, with its ink */
  if (pose === "chug") {
    const C = new Uint8Array(W * H);
    const R2 = (headW * 1.1) ** 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 4;
      if (A[i] && isRed(d[j], d[j + 1], d[j + 2]) && (x - ex) ** 2 + (y - ey) ** 2 < R2) C[i] = 1;
    }
    const big = components(C, W, H).comps.filter(c => c.n >= 120 * k * k);
    if (big.length) {
      const g = grow(C, W, H, 7 * k), closed = new Uint8Array(W * H);
      /* closing: grown, then everything still 7 px inside the grown shape */
      const notG = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) notG[i] = g[i] ? 0 : 1;
      const dg = edt(notG.map(v => 1 - v), W, H);
      for (let i = 0; i < W * H; i++) closed[i] = g[i] && dg[i] > (7 * k - 0.5) ** 2 ? 1 : 0;
      const ink = grow(closed, W, H, 3 * k);
      for (let i = 0; i < W * H; i++) if (A[i] && (closed[i] || (ink[i] && isDark(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])))) P[i] = P[i] || 3;
    }
  }
  /* the skull's top along the head's axis: the opened body (no ears, crest or paddle) highest within
     a fifth of a head either side of the head's middle, as a depth under the head anchor */
  let skullTop = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!O[y * W + x]) continue;
    const dx = x - hx, dy = y - hy;
    const across = dx * u[0] + dy * u[1], down = -(dx * n[0] + dy * n[1]);
    if (Math.abs(across) > headW * 0.2 || down > eyeDown) continue;
    if (skullTop === null || down < skullTop) skullTop = down;
  }
  const front = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) if (P[i]) { for (let c = 0; c < 4; c++) front[i * 4 + c] = d[i * 4 + c]; }
  return { front, seam, skullTop:skullTop === null ? null : Math.round(skullTop), count:P.reduce((s, v) => s + (v ? 1 : 0), 0) };
}

const save = async (buf, W, H, channels, file) => {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const img = channels === 4 ? sharp(Buffer.from(buf), { raw:{ width:W, height:H, channels:4 } })
    : sharp(Buffer.from(buf.length === W * H ? (() => { const o = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255; o[i * 4 + 3] = buf[i]; } return o; })() : buf), { raw:{ width:W, height:H, channels:4 } });
  await img.webp(WEBP).toFile(file);
};

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (MAIN) await main();
async function main() {
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
const written = {};
const debugTiles = [];
for (const [id, c] of Object.entries(manifest.critters)) {
  if (only.length && !only.includes(id)) continue;
  written[id] = { plain:{}, tee:{}, portrait:null };
  const jobs = [];
  for (const pose of manifest.poses) {
    if (c.poses?.[pose]) jobs.push(["plain", pose, c.poses[pose], { ...c.anchor, ...c.poses[pose].anchor }, { ...c.measure, ...c.poses[pose].measure }, 1]);
    if (c.tee?.poses?.[pose]) jobs.push(["tee", pose, c.tee.poses[pose], { ...c.anchor, ...(c.tee.anchor || {}), ...c.tee.poses[pose].anchor }, { ...c.measure, ...c.tee.poses[pose].measure }, 1]);
  }
  /* the portrait draws the critter bigger than a pose's box does: its scale is its head against idle's */
  const portraitK = c.portrait ? Math.max(1.5, Math.min(3.5, (c.portrait.measure?.headW || 320) / ((c.poses.idle?.measure || c.measure)?.headW || 160))) : 1;
  if (c.portrait) jobs.push(["portrait", "portrait", c.portrait, c.portrait.anchor, c.portrait.measure, portraitK]);
  for (const [set, pose, art, at, m, k] of jobs) {
    if (!at?.head) continue;
    const img = await loadRGBA(path.join(OUT, art.src));
    const tube = art.tube ? (await loadRGBA(path.join(OUT, art.tube)).catch(() => null))?.data || null : null;
    const seat = seatOf(img, at, m, { pose, k, open:OPEN_BY[id] || OPEN_PX, tube });
    const { front, seam, count } = seat, skullTop = SKULL_FROM_ANCHOR.has(id) ? null : seat.skullTop;
    const base = art.src.replace(/\.webp$/, "");
    const files = { front:`${base}-front.webp`, seam:`${base}-seam.webp`, skullTop };
    if (!DRY) {
      await save(front, img.width, img.height, 4, path.join(OUT, files.front));
      await save(seam, img.width, img.height, 1, path.join(OUT, files.seam));
    }
    if (set === "portrait") written[id].portrait = files; else written[id][set][pose] = files;
    if (DEBUG && set !== "tee") {
      /* the sprite dimmed, its front parts at full strength in magenta-tinted ink, the seam in cyan */
      const W = img.width, H = img.height, o = new Uint8Array(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const j = i * 4, f = front[j + 3] > 0, s = seam[i] > 0;
        o[j] = s ? 0 : f ? 255 : 200 + img.data[j] / 5; o[j + 1] = s ? 220 : f ? 40 : 200 + img.data[j + 1] / 5; o[j + 2] = s ? 255 : f ? 200 : 200 + img.data[j + 2] / 5;
        o[j + 3] = img.data[j + 3] > 20 ? 255 : 0;
      }
      const file = path.join(DEBUG, `${id}-${pose}.png`);
      fs.mkdirSync(DEBUG, { recursive:true });
      await sharp(Buffer.from(o), { raw:{ width:W, height:H, channels:4 } }).flatten({ background:"#ffffff" }).resize(200, 200).png().toFile(file);
      debugTiles.push(file);
    }
    console.log(`${id} ${set} ${pose}: ${count} px in front, skull top ${skullTop}`);
  }
}
if (DEBUG && debugTiles.length) {
  const cols = manifest.poses.length + 1, S = 200;
  const comp = debugTiles.map((f, i) => ({ input:f, left:(i % cols) * S, top:Math.floor(i / cols) * S }));
  await sharp({ create:{ width:cols * S, height:Math.ceil(debugTiles.length / cols) * S, channels:3, background:"#fff" } }).composite(comp).png().toFile(path.join(DEBUG, "_seat.png"));
  console.log(path.join(DEBUG, "_seat.png"));
}
if (!DRY) {
  editManifest(mf => {
    for (const [id, w] of Object.entries(written)) {
      const c = mf.critters[id];
      /* the files on the pose; the skull's top in its measure (box px; the portrait's in its own px) */
      const put = (entry, { skullTop, ...files }) => { Object.assign(entry, files); entry.measure = { ...(entry.measure || {}) }; if (skullTop == null) delete entry.measure.skullTop; else entry.measure.skullTop = skullTop; };
      for (const [pose, files] of Object.entries(w.plain)) put(c.poses[pose], files);
      for (const [pose, files] of Object.entries(w.tee)) put(c.tee.poses[pose], files);
      if (w.portrait) put(c.portrait, w.portrait);
    }
  });
  console.log("manifest written");
}
}
