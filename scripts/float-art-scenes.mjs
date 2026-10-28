/* Float Groove art: the scenes (float/GROOVE.md "The art pipeline",
   "Backgrounds"), 1920 x 1080, layered back to front:
     sky    depth 0     drawn: a soft pastel gradient, a big pale sun, soft clouds
     land   depth 0.3   generated: the strip of mesas, cacti and bank
                        (<raw>/gen/scene-<id>.png), its ends blended so it
                        tiles, its bank set on the waterline
     water  depth 1     drawn: the checkered river fading into the distance
   The bar (Last Call) is one generated room. Every looping layer tiles
   at 1920.

     node scripts/float-art-scenes.mjs [ids...] */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OUT, RAW, WEBP, loadRGBA, blank, alphaBounds, editManifest, saveWebp } from "./float-art-lib.mjs";

const W = 1920, H = 1080;
const args = process.argv.slice(2);

/* sky top, sky bottom, sun, cloud, water near, water far, checker tone */
export const PALETTES = {
  open:{ sky:["#9fe3dc", "#ffdcbf"], sun:"#fff1b8", cloud:"#ffffff", water:["#58c4d4", "#9ee3e6"], check:"#4bb6c9", water0:0.40 },
  rocks:{ sky:["#c7c0f0", "#ffd6c7"], sun:"#fff0cf", cloud:"#fff6fb", water:["#5fb2d6", "#a6d8ec"], check:"#53a5cc", water0:0.40 },
  whirlpool:{ sky:["#bdeed6", "#e6dcff"], sun:"#fffbd6", cloud:"#ffffff", water:["#5aa6dc", "#a8d4f2"], check:"#4d98d2", water0:0.40 },
  falls:{ sky:["#ffbfae", "#ffe7b5"], sun:"#fff7da", cloud:"#fff3ea", water:["#4fb6d8", "#9edcec"], check:"#43a8cd", water0:0.40 },
  lobby:{ sky:["#bff0e0", "#fff0c9"], sun:"#fff6c2", cloud:"#ffffff", water:["#62d0d6", "#a8eceb"], check:"#55c2cb", water0:0.48 },
  podium:{ sky:["#d8caff", "#ffd9e8"], sun:"#fff3cc", cloud:"#fff7fd", water:["#8f9ff0", "#c7c8fa"], check:"#8392e6", water0:0.62 },
};
const LAND_DEPTH = 0.3;

const rand = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function skySvg(p, top) {
  const r = rand(p.sky[0].length * 977 + top);
  const cloud = (cx, cy, s) => `<g fill="${p.cloud}" fill-opacity="0.85">
    <ellipse cx="${cx}" cy="${cy}" rx="${110 * s}" ry="${30 * s}"/>
    <ellipse cx="${cx - 40 * s}" cy="${cy - 18 * s}" rx="${48 * s}" ry="${34 * s}"/>
    <ellipse cx="${cx + 26 * s}" cy="${cy - 26 * s}" rx="${56 * s}" ry="${40 * s}"/></g>`;
  const clouds = [[0.16, 0.14, 1.1], [0.47, 0.08, 0.8], [0.62, 0.2, 0.65]].map(([x, y, s]) => cloud(W * x + r() * 40, H * y + r() * 20, s)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="${(top / H).toFixed(3)}" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
      <radialGradient id="glow"><stop offset="0.55" stop-color="${p.sun}" stop-opacity="0.55"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="${W * 0.78}" cy="${top - 190}" r="260" fill="url(#glow)"/>
    <circle cx="${W * 0.78}" cy="${top - 190}" r="150" fill="${p.sun}"/>
    ${clouds}
  </svg>`;
}

/* the river: rows grow toward the viewer; each row's columns divide the width, so it tiles */
function waterSvg(p, top) {
  const r = rand(top * 31 + 7);
  let rows = "", y = top, h = 12, k = 0;
  while (y < H) {
    const cols = Math.max(8, Math.round(40 * Math.pow(0.83, k)));
    const cw = W / cols;
    const t = (y - top) / (H - top);
    const a = Math.min(0.5, 0.06 + t * 0.6);
    for (let c = 0; c < cols; c++) if ((c + k) % 2 === 0) rows += `<rect x="${(c * cw).toFixed(2)}" y="${y}" width="${cw.toFixed(2)}" height="${Math.min(h, H - y)}" fill="${p.check}" fill-opacity="${a.toFixed(2)}"/>`;
    y += h; h = Math.round(h * 1.2 + 3); k++;
  }
  /* glints: short white dashes, wrapped across the seam */
  let glints = "";
  for (let i = 0; i < 26; i++) {
    const gy = top + 30 + Math.pow(r(), 1.4) * (H - top - 60);
    const t = (gy - top) / (H - top);
    const len = 24 + t * 70, gx = r() * W;
    for (const off of [0, -W, W]) glints += `<rect x="${(gx + off).toFixed(1)}" y="${gy.toFixed(1)}" width="${len.toFixed(1)}" height="${(3 + t * 4).toFixed(1)}" rx="3" fill="#ffffff" fill-opacity="${(0.35 + t * 0.25).toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.water[1]}"/><stop offset="1" stop-color="${p.water[0]}"/></linearGradient>
      <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[1]}" stop-opacity="0.7"/><stop offset="1" stop-color="${p.sky[1]}" stop-opacity="0"/></linearGradient>
    </defs>
    <rect x="0" y="${top}" width="${W}" height="${H - top}" fill="url(#w)"/>
    ${rows}${glints}
    <rect x="0" y="${top}" width="${W}" height="${Math.round((H - top) * 0.28)}" fill="url(#haze)"/>
    <rect x="0" y="${top - 2}" width="${W}" height="7" fill="#ffffff" fill-opacity="0.85"/>
  </svg>`;
}

/* the generated strip: its bank line, its ends blended into a tile, set on the waterline */
async function landLayer(id, top) {
  const img = await loadRGBA(path.join(RAW, "gen", `scene-${id}.png`));
  const { width:IW, height:IH, data:d } = img;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 10 ? 0 : d[i] >= 246 ? 255 : Math.round(d[i] * 255 / 246);
  const b = alphaBounds(img, 40);
  /* the bank: the lowest row the strip still mostly covers */
  let bank = b.y1;
  for (let y = b.y1; y > b.y0; y--) {
    let n = 0;
    for (let x = 0; x < IW; x++) if (d[(y * IW + x) * 4 + 3] > 200) n++;
    if (n > IW * 0.8) { bank = y; break; }
  }
  /* cut below the bank so the water starts clean */
  const y0 = Math.max(0, b.y0 - 4), h = bank - y0 + 1;
  const B = 120, TW = IW - B;
  const tile = blank(TW, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < TW; x++) {
    const src = ((y0 + y) * IW + x) * 4;
    const o = (y * TW + x) * 4;
    if (x < B) {
      /* the start fades from the strip's end into its own start */
      const t = x / B, e = ((y0 + y) * IW + TW + x) * 4;
      const a1 = d[src + 3] / 255 * t, a2 = d[e + 3] / 255 * (1 - t), a = a1 + a2;
      for (let c = 0; c < 3; c++) tile.data[o + c] = a ? Math.round((d[src + c] * a1 + d[e + c] * a2) / a) : 0;
      tile.data[o + 3] = Math.round(Math.min(1, a) * 255);
    } else tile.data.set(d.subarray(src, src + 4), o);
  }
  const k = W / TW, th = Math.round(h * k);
  const scaled = await sharp(Buffer.from(tile.data.buffer), { raw:{ width:TW, height:h, channels:4 } }).resize(W, th, { kernel:"lanczos3", fit:"fill" }).png().toBuffer();
  const yTop = top + 5 - th;
  const layer = await sharp({ create:{ width:W, height:H, channels:4, background:{ r:0, g:0, b:0, alpha:0 } } })
    .composite([{ input:scaled, left:0, top:yTop }]).webp(WEBP).toBuffer();
  return layer;
}

async function scene(id) {
  const p = PALETTES[id];
  const top = Math.round(p.water0 * H);
  const dir = path.join(OUT, "scenes", id);
  fs.mkdirSync(dir, { recursive:true });
  await sharp(Buffer.from(skySvg(p, top))).webp(WEBP).toFile(path.join(dir, "sky.webp"));
  fs.writeFileSync(path.join(dir, "land.webp"), await landLayer(id, top));
  await sharp(Buffer.from(waterSvg(p, top))).webp(WEBP).toFile(path.join(dir, "water.webp"));
  for (const old of ["far.webp", "bank.webp"]) fs.rmSync(path.join(dir, old), { force:true });
  editManifest(m => {
    m.scenes[id] = { w:W, h:H, water:p.water0, layers:[
      { src:`scenes/${id}/sky.webp`, depth:0, loop:false },
      { src:`scenes/${id}/land.webp`, depth:LAND_DEPTH, loop:true },
      { src:`scenes/${id}/water.webp`, depth:1, loop:true },
    ] };
  });
  console.log(`${id}: done`);
}

/* the bar: one room, 1536 x 1024 grown to 1920 x 1280 and cut to 1080 */
async function bar() {
  const dir = path.join(OUT, "scenes", "bar");
  fs.mkdirSync(dir, { recursive:true });
  const grown = await sharp(path.join(RAW, "gen", "scene-bar.png")).resize(W, 1280, { kernel:"lanczos3" }).png().toBuffer();
  await sharp(grown).extract({ left:0, top:120, width:W, height:H }).webp(WEBP).toFile(path.join(dir, "room.webp"));
  editManifest(m => { m.scenes.bar = { w:W, h:H, water:0.45, counter:0.45, layers:[{ src:"scenes/bar/room.webp", depth:0, loop:false }] }; });
  console.log("bar: done");
}

const ids = args.length ? args : [...Object.keys(PALETTES), "bar"];
for (const id of ids) {
  if (id === "bar") await bar();
  else if (PALETTES[id]) await scene(id);
  else console.error(`${id}: no such scene`);
}
