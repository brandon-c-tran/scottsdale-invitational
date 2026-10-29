/* Float Groove art, the kayaks: Brandon's review renders, painted the way
   the module paints (the tube mask filled with the rider's colour,
   multiplied over the grey shading), without a browser.

     node scripts/float-art-kayak-review.mjs [--out <dir>] [--critters a,b] [--anchors]
   writes <out>/contact.png (every critter x pose, rider colours rotating),
   tee.png (the photo tee set, a stand-in photo on the chest), portraits.png,
   anchors.png (head, eyes, face, hand, water marked on every pose) and
   flotilla.png (13 riders at the screen's real seats on the open scene,
   1920 x 1080, plus the 10-rider round: the tightest row of five).
   Default out: .impeccable/review/float-kayak */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT, OUT, MANIFEST } from "./float-art-lib.mjs";
import { flotillaLayout } from "../float/client/screen/model/flotilla.js";

const args = process.argv.slice(2);
const val = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const DIR = path.resolve(ROOT, val("--out", ".impeccable/review/float-kayak"));
const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const critters = val("--critters", Object.keys(m.critters).join(",")).split(",").filter(id => m.critters[id]);
const COLORS = ["#e53935", "#fdd835", "#00897b", "#1a237e", "#ff7043", "#8e24aa", "#43a047", "#29b6f6", "#f06292", "#6d4c41", "#212121", "#ffffff"];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const BG = "#bfe9e4";
fs.mkdirSync(DIR, { recursive:true });

const cache = new Map();
const rawOf = (rel, px) => {
  const key = `${rel}@${px}`;
  if (!cache.has(key)) cache.set(key, sharp(path.join(OUT, rel)).ensureAlpha().resize(px, px).raw().toBuffer());
  return cache.get(key);
};
/* the module's paint: tube mask x colour multiplied over the grey; shirt likewise with its own colour and the photo */
async function painted({ src, tube, shirt }, color, px, { shirtColor = null } = {}) {
  const s = await rawOf(src, px);
  const t = tube ? await rawOf(tube, px) : null;
  const sh = shirt ? await rawOf(shirt, px) : null;
  const o = Buffer.from(s);
  const tint = (mask, rgb) => { for (let i = 0; i < o.length; i += 4) { const a = mask[i + 3] / 255; if (!a) continue; for (let c = 0; c < 3; c++) o[i + c] = Math.round(o[i + c] * (1 - a) + (o[i + c] * rgb[c] / 255) * a); } };
  if (t) tint(t, hex(color));
  if (sh) tint(sh, hex(shirtColor || color));
  return sharp(o, { raw:{ width:px, height:px, channels:4 } }).png().toBuffer();
}
const label = (text, w, h = 26, size = 18) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="6" y="${h - 7}" font-family="Arial" font-size="${size}" fill="#24313a">${text}</text></svg>`);

async function grid(name, rows, size, { cols } = {}) {
  const tiles = [];
  let H = 0, W = 0;
  for (const [r, row] of rows.entries()) {
    tiles.push({ input:label(row.label, 400), left:0, top:H });
    H += 26;
    for (const [c, cell] of row.cells.entries()) {
      tiles.push({ input:cell, left:c * size, top:H });
      W = Math.max(W, (c + 1) * size);
    }
    H += size;
  }
  const file = path.join(DIR, name);
  await sharp({ create:{ width:W, height:H, channels:4, background:BG } }).composite(tiles).png().toFile(file);
  console.log(file, `${W}x${H}`);
}

const poseArt = (c, pose, set = c) => set.poses[pose] || set.poses.idle;

async function contact() {
  const rows = [];
  for (const [r, id] of critters.entries()) {
    const c = m.critters[id];
    rows.push({ label:`${id}: ${m.poses.join(" · ")}`, cells:await Promise.all(m.poses.map((pose, k) => painted(poseArt(c, pose), COLORS[(k + r) % COLORS.length], 220))) });
  }
  await grid("contact.png", rows, 220);
}

async function tees() {
  const rows = [];
  for (const [r, id] of critters.entries()) {
    const c = m.critters[id];
    if (!c.tee) continue;
    const cells = [];
    for (const [k, pose] of m.poses.entries()) {
      const p = c.tee.poses[pose];
      if (!p) { cells.push(await sharp({ create:{ width:220, height:220, channels:4, background:BG } }).png().toBuffer()); continue; }
      const color = COLORS[(k + r) % COLORS.length];
      const base = await painted(p, color, 220, { shirtColor:COLORS[(k + r + 5) % COLORS.length] });
      const k2 = 220 / 512, [x, y] = p.anchor.chest, R = p.chestR * k2;
      const ring = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><circle cx="${x * k2}" cy="${y * k2}" r="${R}" fill="#f4c99b" stroke="#24313a" stroke-width="1.5"/><circle cx="${x * k2 - R * 0.3}" cy="${y * k2 - R * 0.15}" r="${R * 0.1}" fill="#24313a"/><circle cx="${x * k2 + R * 0.3}" cy="${y * k2 - R * 0.15}" r="${R * 0.1}" fill="#24313a"/></svg>`);
      cells.push(await sharp(base).composite([{ input:ring }]).png().toBuffer());
    }
    rows.push({ label:`${id} tee (photo stand-in on the chest)`, cells });
  }
  await grid("tee.png", rows, 220);
}

async function portraits() {
  const per = 5, size = 360, tiles = [];
  for (const [k, id] of critters.entries()) {
    const c = m.critters[id];
    tiles.push({ input:await painted(c.portrait, COLORS[k % COLORS.length], size), left:(k % per) * size, top:Math.floor(k / per) * (size + 26) + 26 });
    tiles.push({ input:label(id, size), left:(k % per) * size, top:Math.floor(k / per) * (size + 26) });
  }
  const file = path.join(DIR, "portraits.png");
  await sharp({ create:{ width:per * size, height:Math.ceil(critters.length / per) * (size + 26), channels:4, background:BG } }).composite(tiles).png().toFile(file);
  console.log(file);
}

/* every pose with its anchors drawn: head (red ring), eyes (blue bar, eyeSpan wide), face (green), hand (orange), water (black cross), blade (violet) */
async function anchors() {
  const rows = [];
  const size = 256, k = size / 512;
  for (const id of critters) {
    const c = m.critters[id];
    const span = c.measure?.eyeSpan || 40, headW = c.measure?.headW || 150;
    const cells = [];
    for (const pose of m.poses) {
      const p = poseArt(c, pose);
      const a = { ...c.anchor, ...(p.anchor || {}) };
      const base = await painted(p, "#9e9e9e", size);
      const pt = (q, r, color) => (q ? `<circle cx="${q[0] * k}" cy="${q[1] * k}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1"/>` : "");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <line x1="${(a.head[0] - headW / 2) * k}" y1="${a.head[1] * k}" x2="${(a.head[0] + headW / 2) * k}" y2="${a.head[1] * k}" stroke="#e53935" stroke-width="2"/>
        <line x1="${(a.eyes[0] - span / 2) * k}" y1="${a.eyes[1] * k}" x2="${(a.eyes[0] + span / 2) * k}" y2="${a.eyes[1] * k}" stroke="#1e88e5" stroke-width="3"/>
        ${pt(a.head, 4, "#e53935")}${pt(a.face, 4, "#43a047")}${pt(a.hand, 4, "#fb8c00")}${pt(a.blade, 3, "#8e24aa")}
        <path d="M${a.water[0] * k - 8} ${a.water[1] * k}h16M${a.water[0] * k} ${a.water[1] * k - 8}v16" stroke="#000" stroke-width="2"/></svg>`;
      cells.push(await sharp(base).composite([{ input:Buffer.from(svg) }]).png().toBuffer());
    }
    rows.push({ label:`${id}: head (red, headW), eyes (blue, eyeSpan), face (green), hand (orange), blade (violet), water (+)`, cells });
  }
  await grid("anchors.png", rows, size);
}

/* the flotilla at the screen's own seats (flotillaLayout), drawn as the
   screen draws a rider: box scaled by the row's scale x ART_FILL, water at the seat */
const ART_FILL = 1.45;
async function flotilla(n, name) {
  const scene = m.scenes?.open;
  const W = 1920, H = 1080;
  const layers = [];
  for (const layer of scene?.layers || []) layers.push({ input:await sharp(path.join(OUT, layer.src)).resize(W, H, { fit:"cover" }).png().toBuffer(), left:0, top:0 });
  const field = Array.from({ length:n }, (_, i) => i);
  const seats = flotillaLayout(field, new Map(field.map(i => [i, null])), { kind:n <= 3 ? "final" : "song" });
  const list = Object.entries(seats).map(([i, p]) => ({ i:Number(i), ...p })).sort((a, b) => a.y - b.y || a.x - b.x);
  const tiles = [];
  for (const r of list) {
    const id = critters[r.i % critters.length];
    const c = m.critters[id];
    const pose = ["idle", "stroke", "stroke-r", "idle", "hey"][r.i % 5];
    const px = Math.round(512 * r.scale * ART_FILL);
    const img = await painted(poseArt(c, pose), COLORS[r.i % COLORS.length], px);
    const sc = px / 512;
    tiles.push({ input:img, left:Math.round(r.x - c.anchor.water[0] * sc), top:Math.round(r.y - c.anchor.water[1] * sc) });
  }
  const file = path.join(DIR, name);
  const bg = sharp({ create:{ width:W, height:H, channels:4, background:"#9fe3e0" } });
  /* tiles off the canvas are cropped by sharp only when inside; clamp by extending */
  await bg.composite([...layers, ...tiles.map(t => ({ ...t, left:Math.max(-2000, t.left), top:Math.max(-2000, t.top) }))]).png().toFile(file);
  console.log(file, list.length, "riders");
}

await contact();
await tees();
await portraits();
await anchors();
await flotilla(13, "flotilla-13.png");
await flotilla(10, "flotilla-10.png");
