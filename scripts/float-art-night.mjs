/* Float Groove art, Fireworks (float/GROOVE.md v3 "9. Fireworks, the new
   final"): the `night` scene and the firework props, all drawn here (no
   generation), in the scenes' flat pastel shapes turned to night.

   scenes.night, 1920 x 1080, layered like the others:
     sky    depth 0     deep blue to violet, stars (a few twinkle-shaped), a big moon
     land   depth 0.3   mesa and saguaro silhouettes in two tones, a flat bank; tiles at 1920
     water  depth 1     the checkered lake fading into the distance, moonlit glints
   props (white with the ink line, tinted at run time, tint:true):
     firework-1..4      bursts: a peony of dots, a chrysanthemum of streaks, a star ring, a willow
     rocket             a little rocket, its nose up, with a trail; anchor its nose
     fuse               a lit fuse's spark; anchor its middle

     node scripts/float-art-night.mjs */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OUT, WEBP, editManifest } from "./float-art-lib.mjs";

const W = 1920, H = 1080;
export const NIGHT = { sky:["#1b2463", "#5a3f9e", "#8d5fb8"], moon:"#fff4cf", star:"#fffbe8", far:"#3b2f78", near:"#241b52", bank:"#2d2361",
  water:["#182a6e", "#3b4aa8"], check:"#8fa6ff", water0:0.56 };
const rand = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const f = n => n.toFixed(1);

function skySvg(p, top) {
  const r = rand(4242);
  let stars = "";
  for (let i = 0; i < 120; i++) {
    const x = r() * W, y = Math.pow(r(), 1.3) * (top - 60), s = 1.2 + r() * 2.6;
    stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${p.star}" fill-opacity="${(0.45 + r() * 0.5).toFixed(2)}"/>`;
  }
  /* a few bigger four-point twinkles */
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = r() * (top * 0.7), s = 9 + r() * 9;
    stars += `<path d="M${f(x)} ${f(y - s)} C${f(x + s * 0.18)} ${f(y - s * 0.18)} ${f(x + s * 0.18)} ${f(y - s * 0.18)} ${f(x + s)} ${f(y)} C${f(x + s * 0.18)} ${f(y + s * 0.18)} ${f(x + s * 0.18)} ${f(y + s * 0.18)} ${f(x)} ${f(y + s)} C${f(x - s * 0.18)} ${f(y + s * 0.18)} ${f(x - s * 0.18)} ${f(y + s * 0.18)} ${f(x - s)} ${f(y)} C${f(x - s * 0.18)} ${f(y - s * 0.18)} ${f(x - s * 0.18)} ${f(y - s * 0.18)} ${f(x)} ${f(y - s)} Z" fill="${p.star}"/>`;
  }
  const mx = W * 0.8, my = top * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="${(top / H * 0.7).toFixed(3)}" stop-color="${p.sky[1]}"/><stop offset="${(top / H).toFixed(3)}" stop-color="${p.sky[2]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>
      <radialGradient id="glow"><stop offset="0.45" stop-color="${p.moon}" stop-opacity="0.35"/><stop offset="1" stop-color="${p.moon}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${stars}
    <circle cx="${mx}" cy="${my}" r="300" fill="url(#glow)"/>
    <circle cx="${mx}" cy="${my}" r="140" fill="${p.moon}"/>
    <g fill="#e9dcae" fill-opacity="0.55"><circle cx="${mx - 46}" cy="${my - 30}" r="24"/><circle cx="${mx + 38}" cy="${my + 34}" r="17"/><circle cx="${mx + 26}" cy="${my - 52}" r="11"/><circle cx="${mx - 22}" cy="${my + 52}" r="9"/></g>
  </svg>`;
}

/* a saguaro: a trunk and up to two arms, rounded, as one silhouette */
function saguaro(x, base, h, w, arms, fill) {
  const r = w / 2;
  let s = `<rect x="${f(x - r)}" y="${f(base - h)}" width="${f(w)}" height="${f(h + 4)}" rx="${f(r)}" fill="${fill}"/>`;
  for (const [side, at, len] of arms) {
    const ax = x + side * (r + w * 0.7), ay = base - h * at;
    s += `<rect x="${f(Math.min(x, ax) - (side < 0 ? r * 0.6 : -r * 0.2))}" y="${f(ay - w * 0.42)}" width="${f(Math.abs(ax - x) + r * 0.4)}" height="${f(w * 0.84)}" rx="${f(w * 0.42)}" fill="${fill}"/>`;
    s += `<rect x="${f(ax - w * 0.42)}" y="${f(ay - len)}" width="${f(w * 0.84)}" height="${f(len)}" rx="${f(w * 0.42)}" fill="${fill}"/>`;
  }
  return s;
}
/* the silhouettes: far mesas, near cacti and bushes, a flat bank on the waterline; the ends match so it tiles */
function landSvg(p, top) {
  const r = rand(777);
  const mesa = (x, w, h, k) => `<path d="M${f(x)} ${top} L${f(x + w * 0.12)} ${f(top - h)} Q${f(x + w * 0.16)} ${f(top - h - 6)} ${f(x + w * 0.22)} ${f(top - h)} L${f(x + w * 0.78)} ${f(top - h)} Q${f(x + w * 0.84)} ${f(top - h - 6)} ${f(x + w * 0.88)} ${f(top - h)} L${f(x + w)} ${top} Z" fill="${k}"/>`;
  let far = "";
  for (const [x, w, h] of [[-120, 520, 150], [360, 380, 96], [690, 620, 190], [1240, 420, 120], [1600, 520, 160]]) for (const off of [0, -W, W]) far += mesa(x + off, w, h, p.far);
  let near = "";
  const cacti = [[160, 130, 30, [[-1, 0.55, 46], [1, 0.7, 38]]], [610, 92, 22, [[1, 0.5, 30]]], [1010, 150, 34, [[-1, 0.62, 52], [1, 0.45, 40]]], [1420, 104, 24, [[-1, 0.5, 32]]], [1790, 120, 28, [[1, 0.58, 40]]]];
  for (const [x, h, w, arms] of cacti) for (const off of [0, -W, W]) near += saguaro(x + off, top - 6, h, w, arms, p.near);
  for (let i = 0; i < 14; i++) {
    const x = r() * W, s = 14 + r() * 22;
    for (const off of [0, -W, W]) near += `<ellipse cx="${f(x + off)}" cy="${top - 6}" rx="${f(s * 1.5)}" ry="${f(s)}" fill="${p.near}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${far}${near}
    <rect x="0" y="${top - 14}" width="${W}" height="20" fill="${p.bank}"/>
  </svg>`;
}

/* the lake: rows grow toward the viewer; each row's columns divide the width, so it tiles; the moon's path */
function waterSvg(p, top) {
  const r = rand(top * 31 + 11);
  let rows = "", y = top, h = 12, k = 0;
  while (y < H) {
    const cols = Math.max(8, Math.round(40 * Math.pow(0.83, k)));
    const cw = W / cols, t = (y - top) / (H - top), a = Math.min(0.34, 0.08 + t * 0.4);
    for (let c = 0; c < cols; c++) if ((c + k) % 2 === 0) rows += `<rect x="${f(c * cw)}" y="${y}" width="${f(cw)}" height="${Math.min(h, H - y)}" fill="${p.check}" fill-opacity="${a.toFixed(2)}"/>`;
    y += h; h = Math.round(h * 1.2 + 3); k++;
  }
  let glints = "";
  for (let i = 0; i < 22; i++) {
    const gy = top + 20 + Math.pow(r(), 1.3) * (H - top - 40), t = (gy - top) / (H - top);
    const len = 30 + t * 90, gx = r() * W;
    for (const off of [0, -W, W]) glints += `<rect x="${f(gx - len / 2 + off)}" y="${f(gy)}" width="${f(len)}" height="${f(3 + t * 5)}" rx="3" fill="${p.moon}" fill-opacity="${(0.4 + t * 0.3).toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.water[1]}"/><stop offset="1" stop-color="${p.water[0]}"/></linearGradient>
      <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[2]}" stop-opacity="0.6"/><stop offset="1" stop-color="${p.sky[2]}" stop-opacity="0"/></linearGradient>
    </defs>
    <rect x="0" y="${top}" width="${W}" height="${H - top}" fill="url(#w)"/>
    ${rows}${glints}
    <rect x="0" y="${top}" width="${W}" height="${Math.round((H - top) * 0.25)}" fill="url(#haze)"/>
    <rect x="0" y="${top - 2}" width="${W}" height="6" fill="${p.moon}" fill-opacity="0.55"/>
  </svg>`;
}

/* ---- the props: white with the ink line (the confetti's), tinted at run time ---- */
const INK = "#1d1b22";
const line = (w = 4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const around = (n, fn) => Array.from({ length:n }, (_, i) => fn(i, (i / n) * Math.PI * 2)).join("");
/* a streak from r0 to r1 at angle a: a round-ended white bar with its ink edge */
const streak = (c, a, r0, r1, w) => {
  const x0 = c + Math.cos(a) * r0, y0 = c + Math.sin(a) * r0, x1 = c + Math.cos(a) * r1, y1 = c + Math.sin(a) * r1;
  return `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${INK}" stroke-width="${w + 7}" stroke-linecap="round"/><path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="#ffffff" stroke-width="${w}" stroke-linecap="round"/>`;
};
const dot = (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#ffffff" ${line(3.5)}/>`;
const star = (x, y, R, k = 0.45, rot = -Math.PI / 2) => `<path d="${Array.from({ length:10 }, (_, i) => { const rr = i % 2 ? R * k : R, a = rot + i * Math.PI / 5; return `${i ? "L" : "M"}${f(x + Math.cos(a) * rr)} ${f(y + Math.sin(a) * rr)}`; }).join(" ")} Z" fill="#ffffff" ${line(3.5)}/>`;
const S = 320, C = S / 2;
const DRAWN = {
  /* a peony: two rings of round stars and a bright heart */
  "firework-1":[S, S, around(16, (i, a) => dot(C + Math.cos(a) * 122, C + Math.sin(a) * 122, 15)) + around(10, (i, a) => dot(C + Math.cos(a + 0.3) * 72, C + Math.sin(a + 0.3) * 72, 11)) + dot(C, C, 18)],
  /* a chrysanthemum: long streaks out from the middle, tipped */
  "firework-2":[S, S, around(14, (i, a) => streak(C, a, 34, 128, 9)) + around(14, (i, a) => dot(C + Math.cos(a) * 140, C + Math.sin(a) * 140, 8))],
  /* a ring of stars */
  "firework-3":[S, S, around(9, (i, a) => star(C + Math.cos(a) * 112, C + Math.sin(a) * 112, 26, 0.45, a)) + star(C, C, 34)],
  /* a willow: streaks that bow and fall */
  "firework-4":[S, S, around(12, (i, a) => {
    const x1 = C + Math.cos(a) * 92, y1 = C + Math.sin(a) * 76, x2 = C + Math.cos(a) * 124, y2 = Math.min(S - 14, C + Math.sin(a) * 110 + 56);
    const d = `M${f(C + Math.cos(a) * 20)} ${f(C + Math.sin(a) * 20)} Q${f(x1)} ${f(y1 - 26)} ${f(x2)} ${f(y2)}`;
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>`;
  }) + dot(C, C, 16)],
  /* a little rocket, nose up, fins, a short wavy trail */
  rocket:[96, 220, `<path d="M48 120 C40 150 58 164 46 190 C40 204 50 214 48 218" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="M48 120 C40 150 58 164 46 190 C40 204 50 214 48 218" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>`
    + `<path d="M30 92 L14 122 L32 116 Z" fill="#ffffff" ${line()}/><path d="M66 92 L82 122 L64 116 Z" fill="#ffffff" ${line()}/>`
    + `<path d="M48 6 C64 22 68 46 66 70 L66 112 Q48 122 30 112 L30 70 C28 46 32 22 48 6 Z" fill="#ffffff" ${line()}/>`
    + `<circle cx="48" cy="58" r="10" fill="#ffffff" ${line(3.5)}/><path d="M32 40 Q48 30 64 40" fill="none" ${line(3.5)}/>`],
  /* a lit fuse's spark: a star of short rays and a hot middle */
  fuse:[96, 96, around(8, (i, a) => streak(48, a + (i % 2) * 0.2, 14, i % 2 ? 30 : 40, 5)) + dot(48, 48, 12)],
};
const ANCHOR = { rocket:[48, 6] };

const dir = path.join(OUT, "scenes", "night");
fs.mkdirSync(dir, { recursive:true });
const top = Math.round(NIGHT.water0 * H);
await sharp(Buffer.from(skySvg(NIGHT, top))).webp(WEBP).toFile(path.join(dir, "sky.webp"));
await sharp(Buffer.from(landSvg(NIGHT, top))).webp(WEBP).toFile(path.join(dir, "land.webp"));
await sharp(Buffer.from(waterSvg(NIGHT, top))).webp(WEBP).toFile(path.join(dir, "water.webp"));
const props = {};
for (const [id, [w, h, body]] of Object.entries(DRAWN)) {
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).webp(WEBP).toFile(path.join(OUT, "props", `${id}.webp`));
  props[id] = { src:`props/${id}.webp`, w, h, anchor:ANCHOR[id] || [w / 2, h / 2], tint:true };
}
editManifest(m => {
  m.scenes.night = { w:W, h:H, water:NIGHT.water0, layers:[
    { src:"scenes/night/sky.webp", depth:0, loop:false },
    { src:"scenes/night/land.webp", depth:0.3, loop:true },
    { src:"scenes/night/water.webp", depth:1, loop:true },
  ] };
  Object.assign(m.props, props);
});
console.log("night scene and", Object.keys(props).join(" "));
