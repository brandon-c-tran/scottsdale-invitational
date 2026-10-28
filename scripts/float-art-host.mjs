/* Float Groove art: the host (float/GROOVE.md "The host"): its sheet of
   three poses (<raw>/gen/host-sheet.png: idle, call, cheer in a row) cut
   into one box, registered on the feet (anchor.ground) at one scale, so a
   pose swaps without a jump. Anchors: ground (between the feet), head (the
   hat's crown), face (between the eyes), horn (the megaphone's bell, where
   a call comes out); each pose keeps its own where they move.

     node scripts/float-art-host.mjs [--sheet <png>] */
import path from "node:path";
import { OUT, RAW, sourceOf, loadRGBA, blank, components, placeInBox, saveWebp, alphaBounds, hueOf, editManifest } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const sheetFile = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : sourceOf("host-sheet");
export const HOST_BOX = [512, 560];
export const GROUND = [256, 540];
const POSES = ["idle", "call", "cheer"];

const img = await loadRGBA(sheetFile);
const { width:W, height:H, data:d } = img;
for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 8 ? 0 : d[i] >= 246 ? 255 : Math.round(d[i] * 255 / 246);
const solid = new Uint8Array(W * H);
for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 24) solid[k] = 1;
const { labels, comps } = components(solid, W, H);
/* each piece to the nearest of three columns */
const cols = [W / 6, W / 2, W * 5 / 6];
const owner = new Map();
for (const c of comps) if (c.n >= 12) owner.set(c.id, cols.reduce((best, x, k) => (Math.abs(c.cx - x) < Math.abs(c.cx - cols[best]) ? k : best), 0));
const cells = POSES.map(() => blank(W, H));
for (let k = 0; k < W * H; k++) {
  const o = owner.get(labels[k]);
  if (o === undefined) continue;
  cells[o].data.set(d.subarray(k * 4, k * 4 + 4), k * 4);
}

/* the feet: the bottom rows' opaque pixels, their middle */
function feetOf(cell) {
  const b = alphaBounds(cell, 120);
  let sx = 0, n = 0;
  for (let y = b.y1 - 8; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (cell.data[(y * W + x) * 4 + 3] > 120) { sx += x; n++; }
  return { x:n ? sx / n : (b.x0 + b.x1) / 2, y:b.y1, b };
}
/* the eyes: two small round dark dots in the upper half of the body */
function eyesOf(cell, b) {
  const dark = new Uint8Array(W * H);
  for (let y = b.y0; y < b.y0 + b.h * 0.7; y++) for (let x = b.x0; x <= b.x1; x++) {
    const i = (y * W + x) * 4;
    if (cell.data[i + 3] > 200 && Math.max(cell.data[i], cell.data[i + 1], cell.data[i + 2]) < 70) dark[y * W + x] = 1;
  }
  const dots = components(dark, W, H).comps.filter(c => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    return w >= 6 && w <= 26 && h >= 6 && h <= 30 && Math.max(w, h) / Math.min(w, h) < 1.8 && c.n / (w * h) > 0.55;
  });
  let best = null;
  for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
    const a = dots[i], c = dots[j];
    const dx = Math.abs(a.cx - c.cx), dy = Math.abs(a.cy - c.cy);
    if (dx < 14 || dx > 120 || dy > 14) continue;
    const score = Math.min(a.n, c.n) / Math.max(a.n, c.n) - dy / 40;
    if (!best || score > best.score) best = { score, x:(a.cx + c.cx) / 2, y:(a.cy + c.cy) / 2 };
  }
  return best;
}
/* the megaphone's bell: the red pixels farthest from the body's middle */
function hornOf(cell, b, bodyX) {
  const reds = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const i = (y * W + x) * 4, r = cell.data[i], g = cell.data[i + 1], bl = cell.data[i + 2];
    if (cell.data[i + 3] < 200 || r < 150 || (r - Math.max(g, bl)) < 80) continue;
    const h = hueOf(r, g, bl);
    if (h > 20 && h < 340) continue;
    reds.push([x, y, Math.hypot(x - bodyX, y - (b.y0 + b.h * 0.45))]);
  }
  if (!reds.length) return null;
  reds.sort((p, q) => q[2] - p[2]);
  const far = reds.slice(0, Math.max(10, Math.round(reds.length * 0.08)));
  return [far.reduce((s, p) => s + p[0], 0) / far.length, far.reduce((s, p) => s + p[1], 0) / far.length];
}
/* the hat's crown: the top of the opaque pixels over the body's middle */
function headOf(cell, x) {
  for (let y = 0; y < H; y++) if (cell.data[(y * W + Math.round(x)) * 4 + 3] > 160) return y;
  return null;
}

const feet = cells.map(feetOf);
/* one scale: every pose, registered on its feet, fits the box */
let up = 0, left = 0, right = 0;
for (const f of feet) { up = Math.max(up, f.y - f.b.y0); left = Math.max(left, f.x - f.b.x0); right = Math.max(right, f.b.x1 - f.x); }
const s = Math.min((GROUND[1] - 10) / up, (GROUND[0] - 8) / left, (HOST_BOX[0] - GROUND[0] - 8) / right);
const poses = {};
let base = null;
for (const [k, pose] of POSES.entries()) {
  const cell = cells[k], f = feet[k];
  const placed = await placeInBox(cell, { sx:f.x, sy:f.y, s, bx:GROUND[0], by:GROUND[1], box:HOST_BOX });
  const inBox = alphaBounds(placed.img, 24);
  if (!inBox || inBox.x0 <= 0 || inBox.y0 <= 0 || inBox.x1 >= HOST_BOX[0] - 1 || inBox.y1 >= HOST_BOX[1] - 1) console.warn(`host ${pose}: touches the box's edge`);
  await saveWebp(placed.img, path.join(OUT, "host", `${pose}.webp`));
  const toBox = ([x, y]) => [Math.round(GROUND[0] + (x - f.x) * s), Math.round(GROUND[1] + (y - f.y) * s)];
  const eyes = eyesOf(cell, f.b);
  const bodyX = eyes ? eyes.x : f.x;
  const headY = headOf(cell, bodyX);
  const head = toBox([bodyX, headY ?? f.b.y0]);
  /* an eye behind the megaphone: the idle face's offset from the head */
  const face = eyes ? toBox([eyes.x, eyes.y + 10]) : base ? [head[0] + base.face[0] - base.head[0], head[1] + base.face[1] - base.head[1]] : toBox([f.x, f.b.y0 + f.b.h * 0.45]);
  const horn = hornOf(cell, f.b, bodyX);
  const anchor = { ground:[...GROUND], head, face, horn:horn ? toBox(horn) : face };
  if (pose === "idle") base = anchor;
  poses[pose] = { src:`host/${pose}.webp`, anchor };
  console.log(`host ${pose}: eyes ${eyes ? "found" : "not found"}, horn ${horn ? "found" : "not found"}`);
}
editManifest(m => { m.host = { box:HOST_BOX, anchor:base, poses }; });
console.log(`host: scale ${s.toFixed(3)}`);
