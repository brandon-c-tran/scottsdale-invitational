/* Float Groove art: flat placeholder scenes and props, drawn as SVG and
   written as WebP (float/GROOVE.md "Until the real sprites land"): pastel
   gradients, a pale sun, flat mesas, a checkered water band fading into the
   distance; simple props in the critters' thin black line. The generated
   art replaces these files (scripts/float-art-scenes.mjs, -props.mjs).

     node scripts/float-art-placeholders.mjs [--scenes] [--props]
*/
import path from "node:path";
import sharp from "sharp";
import { OUT, WEBP, editManifest } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const doScenes = !args.includes("--props") || args.includes("--scenes");
const doProps = !args.includes("--scenes") || args.includes("--props");
const W = 1920, H = 1080;
const INK = "#1d1b22";

/* the palettes: sky top, sky bottom, sun, far mesas, near mesas, bank, water light, water dark */
const PALETTES = {
  open:{ sky:["#9fe6dd", "#ffd9b8"], sun:"#fff2b0", far:"#f2b29a", near:"#e99b85", bank:"#f3c597", water:["#7fd8e0", "#5cc3d6"], water0:0.43 },
  rocks:{ sky:["#c9c2f2", "#ffd3c2"], sun:"#fff0c4", far:"#d9a7b9", near:"#c98f9f", bank:"#e8b99a", water:["#86cde6", "#65b5d8"], water0:0.43 },
  whirlpool:{ sky:["#b9ecd2", "#e8d9ff"], sun:"#fffbd0", far:"#b3c9e8", near:"#9fb4dc", bank:"#d9c4a8", water:["#8fc6ee", "#6aa8e0"], water0:0.43 },
  falls:{ sky:["#ffc2b3", "#ffe6b0"], sun:"#fff6d6", far:"#e7a08f", near:"#d98872", bank:"#efb98f", water:["#80cfe6", "#56b2d6"], water0:0.43 },
  lobby:{ sky:["#bff0e0", "#fff0c9"], sun:"#fff6c2", far:"#f5c4a8", near:"#eab090", bank:"#f6d3a6", water:["#8ee0e0", "#6ccfd6"], water0:0.5 },
  podium:{ sky:["#d6c8ff", "#ffd6e6"], sun:"#fff3c8", far:"#e4b7cf", near:"#d6a0bd", bank:"#efc9b0", water:["#c3b3f0", "#a996e6"], water0:0.62 },
};

const lerp = (a, b, t) => a + (b - a) * t;
/* a seeded wobble so a "hand drawn" line is the same every run */
const rand = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/* mesa silhouettes across the width, tiling (the first and last x match) */
function mesas(seed, y, hMin, hMax, color, n = 5) {
  const r = rand(seed);
  let d = `M0 ${H} L0 ${y}`;
  const step = W / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * step, x1 = x0 + step;
    const top = y - lerp(hMin, hMax, r());
    const a = x0 + step * lerp(0.15, 0.3, r()), b = x1 - step * lerp(0.15, 0.3, r());
    d += ` L${a.toFixed(0)} ${y} L${(a + 30).toFixed(0)} ${top.toFixed(0)} L${(b - 30).toFixed(0)} ${top.toFixed(0)} L${b.toFixed(0)} ${y}`;
  }
  d += ` L${W} ${y} L${W} ${H} Z`;
  return `<path d="${d}" fill="${color}"/>`;
}

function saguaro(x, base, h, color = "#6fae7b") {
  const w = h * 0.16;
  const arm = (side, at, len) => {
    const ax = x + side * w * 0.5, ay = base - h * at;
    const ex = ax + side * w * 1.3;
    return `<path d="M${ax} ${ay} L${ex} ${ay} L${ex} ${ay - len}" fill="none" stroke="${color}" stroke-width="${w * 0.8}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  return `<g>${arm(-1, 0.45, h * 0.28)}${arm(1, 0.6, h * 0.22)}<line x1="${x}" y1="${base}" x2="${x}" y2="${base - h}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/></g>`;
}

/* the water: rows grow toward the viewer, each row's columns divide the width (so it tiles) */
function checker(p) {
  const top = Math.round(p.water0 * H);
  let rows = "", y = top, h = 10, k = 0;
  while (y < H) {
    const cols = Math.max(8, Math.round(48 * Math.pow(0.82, k)));
    const cw = W / cols;
    const t = (y - top) / (H - top);
    const alpha = Math.min(1, 0.15 + t * 1.4);
    for (let c = 0; c < cols; c++) if ((c + k) % 2 === 0) rows += `<rect x="${(c * cw).toFixed(2)}" y="${y}" width="${cw.toFixed(2)}" height="${h}" fill="${p.water[1]}" fill-opacity="${(alpha * 0.55).toFixed(2)}"/>`;
    y += h; h = Math.round(h * 1.22 + 2); k++;
  }
  return `<rect x="0" y="${top}" width="${W}" height="${H - top}" fill="${p.water[0]}"/>${rows}
    <rect x="0" y="${top}" width="${W}" height="${Math.round((H - top) * 0.35)}" fill="url(#haze)"/>
    <rect x="0" y="${top - 3}" width="${W}" height="6" fill="#ffffff" fill-opacity="0.7"/>`;
}

function sceneLayers(id, p) {
  const top = Math.round(p.water0 * H);
  const defs = `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[1]}" stop-opacity="0.75"/><stop offset="1" stop-color="${p.sky[1]}" stop-opacity="0"/></linearGradient>
  </defs>`;
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${body}</svg>`;
  const sky = svg(`<rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="${W * 0.78}" cy="${top - 210}" r="150" fill="${p.sun}"/>
    <ellipse cx="${W * 0.2}" cy="160" rx="120" ry="26" fill="#ffffff" fill-opacity="0.6"/>
    <ellipse cx="${W * 0.55}" cy="110" rx="90" ry="20" fill="#ffffff" fill-opacity="0.5"/>`);
  const far = svg(`${mesas(id.length * 97 + 11, top - 40, 70, 170, p.far, 4)}`.replace(`L0 ${H}`, `L0 ${top + 2}`).replace(`L${W} ${H} Z`, `L${W} ${top + 2} Z`));
  const sag = [0.12, 0.31, 0.58, 0.83].map((f, i) => saguaro(W * f, top - 8, 60 + (i % 2) * 34)).join("");
  const bank = svg(`${mesas(id.length * 131 + 7, top - 10, 20, 70, p.near, 6)}`.replace(`L0 ${H}`, `L0 ${top + 2}`).replace(`L${W} ${H} Z`, `L${W} ${top + 2} Z`)
    + `<rect x="0" y="${top - 26}" width="${W}" height="${30}" fill="${p.bank}"/>${sag}`);
  const water = svg(checker(p));
  return { sky, far, bank, water };
}

async function writeSvg(svg, file, opts = {}) {
  await sharp(Buffer.from(svg)).webp({ ...WEBP, ...opts }).toFile(file);
}

async function scenes() {
  const entries = {};
  for (const [id, p] of Object.entries(PALETTES)) {
    const L = sceneLayers(id, p);
    const dir = path.join(OUT, "scenes", id);
    await import("node:fs").then(fs => fs.mkdirSync(dir, { recursive:true }));
    const layers = [];
    for (const [name, depth, loop] of [["sky", 0, false], ["far", 0.15, true], ["bank", 0.4, true], ["water", 1, true]]) {
      await writeSvg(L[name], path.join(dir, `${name}.webp`));
      layers.push({ src:`scenes/${id}/${name}.webp`, depth, loop });
    }
    entries[id] = { w:W, h:H, water:p.water0, layers, placeholder:true };
  }
  /* the bar (Last Call): a warm room, a counter, a plank floor */
  const bar = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c9a6"/><stop offset="1" stop-color="#e9a983"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#wall)"/>
    <rect x="0" y="120" width="${W}" height="16" fill="#b8754f"/><rect x="0" y="300" width="${W}" height="16" fill="#b8754f"/>
    <rect x="0" y="560" width="${W}" height="${H - 560}" fill="#c98d63"/>
    ${Array.from({ length:14 }, (_, i) => `<rect x="0" y="${600 + i * 36}" width="${W}" height="3" fill="#a87150"/>`).join("")}
    <rect x="0" y="470" width="${W}" height="80" fill="#9a5b3b" stroke="${INK}" stroke-width="4"/>
    <rect x="0" y="456" width="${W}" height="22" fill="#b86f48" stroke="${INK}" stroke-width="4"/>
  </svg>`;
  await import("node:fs").then(fs => fs.mkdirSync(path.join(OUT, "scenes", "bar"), { recursive:true }));
  await writeSvg(bar, path.join(OUT, "scenes", "bar", "room.webp"));
  entries.bar = { w:W, h:H, water:0.43, counter:0.43, layers:[{ src:"scenes/bar/room.webp", depth:0, loop:false }], placeholder:true };
  editManifest(m => { Object.assign(m.scenes, entries); });
  console.log("scenes:", Object.keys(entries).join(" "));
}

/* ---- props ---- */
const line = (w = 4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const PROPS = {
  splash:{ w:256, h:192, anchor:[128, 176], svg:`
    <path d="M40 176 C50 120 70 110 80 70 C92 110 104 120 112 150 C118 100 128 60 132 20 C140 60 146 100 152 150 C160 118 172 108 184 74 C196 112 210 124 218 176 Z" fill="#ffffff" ${line()}/>
    <circle cx="60" cy="56" r="10" fill="#ffffff" ${line(3)}/><circle cx="200" cy="44" r="8" fill="#ffffff" ${line(3)}/><circle cx="104" cy="30" r="6" fill="#ffffff" ${line(3)}/>` },
  ripple:{ w:256, h:96, anchor:[128, 48], svg:`
    <ellipse cx="128" cy="48" rx="116" ry="34" fill="none" stroke="#ffffff" stroke-width="6" stroke-opacity="0.9"/>
    <ellipse cx="128" cy="48" rx="70" ry="18" fill="none" stroke="#ffffff" stroke-width="5" stroke-opacity="0.8"/>` },
  rock:{ w:256, h:200, anchor:[128, 168], svg:`
    <path d="M24 170 C20 110 60 60 118 46 C170 34 226 80 234 170 Z" fill="#b9a7a0" ${line()}/>
    <path d="M70 92 C90 70 120 62 146 66" fill="none" stroke="#ffffff" stroke-width="6" stroke-opacity="0.55" stroke-linecap="round"/>
    <path d="M10 170 L246 170" stroke="#ffffff" stroke-width="6" stroke-opacity="0.8" stroke-linecap="round"/>` },
  whirl:{ w:384, h:160, anchor:[192, 80], svg:`
    <ellipse cx="192" cy="80" rx="180" ry="66" fill="#5fa6dc" fill-opacity="0.55"/>
    <path d="M192 80 m-20 0 a20 8 0 1 1 40 0 a44 18 0 1 1 -88 0 a80 32 0 1 1 160 0 a120 48 0 1 1 -240 0" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-opacity="0.9"/>` },
  cup:{ w:128, h:160, anchor:[64, 96], svg:`
    <path d="M22 30 L106 30 L94 150 L34 150 Z" fill="#e8443a" ${line()}/>
    <path d="M22 30 L106 30 L104 50 L24 50 Z" fill="#ffffff" ${line(3)}/>
    <path d="M40 66 L46 136" stroke="#ffffff" stroke-width="6" stroke-opacity="0.5" stroke-linecap="round"/>` },
  crown:{ w:160, h:112, anchor:[80, 104], svg:`
    <path d="M16 100 L10 30 L48 62 L80 14 L112 62 L150 30 L144 100 Z" fill="#ffd34d" ${line()}/>
    <circle cx="80" cy="76" r="9" fill="#ff6fa8" ${line(3)}/><circle cx="40" cy="82" r="6" fill="#62c4ff" ${line(3)}/><circle cx="120" cy="82" r="6" fill="#62c4ff" ${line(3)}/>` },
  "falls-lip":{ w:640, h:720, anchor:[96, 120], svg:`
    <path d="M0 120 L120 120 C180 120 210 160 230 230 L320 720 L0 720 Z" fill="#7fd0e6"/>
    <path d="M230 230 L320 720 L640 720 L640 300 Z" fill="#e9f7fb" fill-opacity="0.9"/>
    <path d="M0 120 L120 120 C180 120 210 160 230 230" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round"/>
    ${[260, 320, 380, 440, 500, 560].map((y, i) => `<path d="M${236 + i * 14} ${y} l60 6" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-opacity="0.8"/>`).join("")}
    <ellipse cx="420" cy="640" rx="240" ry="70" fill="#ffffff" fill-opacity="0.8"/>` },
};
function sign(icon) {
  return { w:220, h:300, anchor:[110, 250], svg:`
    <rect x="102" y="120" width="16" height="170" rx="6" fill="#c08a5a" ${line()}/>
    <rect x="16" y="14" width="188" height="130" rx="18" fill="#f6dcae" ${line()}/>
    ${icon}` };
}
PROPS["sign-paddle"] = sign(`<path d="M70 120 L140 40" ${line(8)}/><path d="M128 30 C150 10 176 18 176 36 C176 56 156 64 140 50 Z" fill="#7fd0e6" ${line()}/>`);
PROPS["sign-rock"] = sign(`<path d="M50 120 C48 80 76 52 110 48 C146 46 172 80 170 120 Z" fill="#b9a7a0" ${line()}/>`);
PROPS["sign-spin"] = sign(`<path d="M110 80 m-8 0 a8 8 0 1 1 16 0 a20 20 0 1 1 -40 0 a34 34 0 1 1 68 0 a48 48 0 1 1 -96 0" fill="none" stroke="#5fa6dc" stroke-width="9" stroke-linecap="round"/>`);
const CONFETTI = [
  `<rect x="8" y="16" width="32" height="16" rx="3" fill="#ffffff" ${line(3)}/>`,
  `<circle cx="24" cy="24" r="12" fill="#ffffff" ${line(3)}/>`,
  `<path d="M6 30 C14 10 24 38 32 18 C36 10 42 14 44 20" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/><path d="M6 30 C14 10 24 38 32 18 C36 10 42 14 44 20" fill="none" ${line(2)} />`,
  `<path d="M24 6 L29 19 L43 19 L32 28 L36 42 L24 34 L12 42 L16 28 L5 19 L19 19 Z" fill="#ffffff" ${line(3)}/>`,
];

async function props() {
  const fs = await import("node:fs");
  fs.mkdirSync(path.join(OUT, "props"), { recursive:true });
  const entries = {};
  for (const [id, p] of Object.entries(PROPS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">${p.svg}</svg>`;
    await writeSvg(svg, path.join(OUT, "props", `${id}.webp`));
    entries[id] = { src:`props/${id}.webp`, w:p.w, h:p.h, anchor:p.anchor, tint:false, placeholder:true };
  }
  for (const [k, body] of CONFETTI.entries()) {
    const id = `confetti-${k + 1}`;
    await writeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">${body}</svg>`, path.join(OUT, "props", `${id}.webp`));
    entries[id] = { src:`props/${id}.webp`, w:48, h:48, anchor:[24, 24], tint:true, placeholder:true };
  }
  editManifest(m => { Object.assign(m.props, entries); m.font = { family:"Float Pixel", src:"/fonts/pixelify-sans-latin.woff2" }; });
  console.log("props:", Object.keys(entries).join(" "));
}

if (doScenes) await scenes();
if (doProps) await props();
