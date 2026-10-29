/* Float Groove looks: where a hat and a pair of glasses go, measured from
   the finished art (float/GROOVE.md v3 "Hats and glasses sit right").

   For every critter, every pose of the plain set and of the photo tee set,
   and the portrait, from the sprite itself:
   - the eyes: the pair of small round dark dots nearest where the eyes were
     (their middle, their span, the line's tilt); closed eyes keep the
     set's idle span and the old point
   - the forehead: from a little over the eyes, out both ways along the eye
     line to the outline, so the head's middle is the skull's (a three
     quarter face has its eyes off to one side) and its width the head's
   - the head's top: from the forehead's middle up to the outline

   Written per pose as anchor.head (the top's middle), anchor.eyes, and
   measure { headW, eyeSpan, tilt } (degrees, the eye line's slope), which
   the painter reads before the critter's own measure.

     node scripts/float-art-fit-anchors.mjs [ids...] [--dry] [--debug <dir>] [--origin]
   (--origin: the tube sprites' run, searching from their first eyes in float-art-fit-origin.json) */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { OUT, loadRGBA, components, alphaBounds, editManifest } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry");
const DEBUG = value("--debug");
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--debug");

const val = (r, g, b) => Math.max(r, g, b) / 255;
/* a fix by eye, by critter, set ("plain", "tee", "portrait") and pose: any of { head, eyes, headW, eyeSpan, tilt } (box px) */
export const FIT_FIX = {
  /* a three quarter face: the skull's top is left of where the forehead walk lands */
  /* the ears move the top about from pose to pose: what is measured stands */
  jackrabbit:{ trust:true, drop:{ px:42, skip:["out"] } },
  capybara:{ follow:true, plain:{ idle:{ head:[277, 214], headW:172 } }, portrait:null },
};

/* the eyes: two small round dark dots, side by side, near `near` (R: the ring's width in this image) */
export function findEyePair(img, R, near) {
  const { data:d, width:W, height:H } = img;
  const dark = new Uint8Array(W * H);
  const reach = R * 0.32;
  const x0 = Math.max(0, Math.floor(near[0] - reach)), x1 = Math.min(W - 1, Math.ceil(near[0] + reach));
  const y0 = Math.max(0, Math.floor(near[1] - reach)), y1 = Math.min(H - 1, Math.ceil(near[1] + reach));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4;
    if (d[i + 3] > 180 && val(d[i], d[i + 1], d[i + 2]) < 0.3) dark[y * W + x] = 1;
  }
  const { comps } = components(dark, W, H);
  const dots = comps.filter(c => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    return w >= R * 0.02 && w <= R * 0.09 && h >= R * 0.02 && h <= R * 0.11 && Math.max(w, h) / Math.min(w, h) < 1.8 && c.n / (w * h) > 0.5;
  });
  let best = null;
  for (let a = 0; a < dots.length; a++) for (let b = a + 1; b < dots.length; b++) {
    const A = dots[a], B = dots[b];
    const dx = Math.abs(A.cx - B.cx), dy = Math.abs(A.cy - B.cy);
    if (dx < R * 0.08 || dx > R * 0.5 || dy > dx * 0.5) continue;
    const sizeMatch = Math.min(A.n, B.n) / Math.max(A.n, B.n);
    if (sizeMatch < 0.4) continue;
    const mx = (A.cx + B.cx) / 2, my = (A.cy + B.cy) / 2;
    const off = Math.hypot(mx - near[0], my - near[1]) / R;
    const score = sizeMatch - off * 2 - dy / R;
    if (!best || score > best.score) best = { score, l:A.cx < B.cx ? A : B, r:A.cx < B.cx ? B : A };
  }
  if (!best) return null;
  const { l, r } = best;
  return { x:(l.cx + r.cx) / 2, y:(l.cy + r.cy) / 2, span:Math.hypot(r.cx - l.cx, r.cy - l.cy), tilt:Math.atan2(r.cy - l.cy, r.cx - l.cx), dot:Math.sqrt((l.n + r.n) / 2) };
}

/* walk from p along dir to the outline or outside; the last point inside.
   A dark run wider than an outline (a spot, a stripe) is walked through. */
const isDark = (d, i) => d[i + 3] > 150 && val(d[i], d[i + 1], d[i + 2]) < 0.3;
function walk(img, [x, y], [ux, uy], max, line = 6) {
  const { data:d, width:W, height:H } = img;
  let lx = x, ly = y, t = 0;
  const at = t => { const px = Math.round(x + ux * t), py = Math.round(y + uy * t); return px < 0 || py < 0 || px >= W || py >= H ? -1 : (py * W + px) * 4; };
  while (t < max) {
    const i = at(t);
    if (i < 0 || d[i + 3] < 60) break;
    if (isDark(d, i)) {
      let run = 0;
      while (t + run < max) { const j = at(t + run); if (j < 0 || !isDark(d, j)) break; run += 0.5; }
      const j = at(t + run);
      if (run <= line || j < 0 || d[j + 3] < 60) break;
      t += run;
      continue;
    }
    lx = x + ux * t; ly = y + uy * t;
    t += 0.5;
  }
  return [lx, ly];
}
const inside = (img, [x, y]) => {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || py < 0 || px >= img.width || py >= img.height) return false;
  const i = (py * img.width + px) * 4;
  return img.data[i + 3] > 150 && !isDark(img.data, i);
};

/* the head from the eyes: { head:[x, top], headW, eyes:[x, y], eyeSpan, tilt } */
export function headFrom(img, eyes, R) {
  const th = eyes.tilt || 0;
  const u = [Math.cos(th), Math.sin(th)], n = [Math.sin(th), -Math.cos(th)];
  /* the forehead: a little over the eyes (a frog's eyes are its top: lower); the widest row */
  const line = Math.max(4, R * 0.026);
  let best = null;
  for (const k of [0.2, 0.3, 0.45, 0.6, 0.75]) {
    const lift = Math.max(eyes.span * k, (eyes.dot || R * 0.04) * 0.9);
    const p = [eyes.x + n[0] * lift, eyes.y + n[1] * lift];
    if (!inside(img, p)) continue;
    const reach = Math.max(eyes.span * 0.5 + R * 0.24, R * 0.36);
    const a = walk(img, p, [-u[0], -u[1]], reach, line), b = walk(img, p, u, reach, line);
    const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!best || w > best.w) best = { w, mid:[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }
  if (!best) best = { w:eyes.span * 1.6, mid:[eyes.x, eyes.y] };
  /* the top: up from the forehead's middle (and either side, the highest of three: a crest's line is not the top) */
  const tops = [-0.15, 0, 0.15].map(s => {
    const from = [best.mid[0] + u[0] * best.w * s, best.mid[1] + u[1] * best.w * s];
    const t = inside(img, from) ? walk(img, from, n, R * 0.8, line) : from;
    return Math.hypot(t[0] - from[0], t[1] - from[1]);
  });
  const up = [...tops].sort((a, b) => a - b)[1];
  const top = [best.mid[0] + n[0] * up, best.mid[1] + n[1] * up];
  return { head:top, headW:best.w, eyes:[eyes.x, eyes.y], eyeSpan:eyes.span, tilt:th * 180 / Math.PI };
}

const r1 = v => Math.round(v * 10) / 10;
const ri = p => [Math.round(p[0]), Math.round(p[1])];

/* the ring's width in an image, from its tube mask */
async function ringWidth(tubeFile, fallback) {
  if (!tubeFile) return fallback;
  try { const b = alphaBounds(await loadRGBA(path.join(OUT, tubeFile)), 60); return b.w > 20 ? b.w : fallback; } catch { return fallback; }
}
async function measureSet(file, R, near, fallback, idle = null) {
  const img = await loadRGBA(path.join(OUT, file));
  let pair = findEyePair(img, R, near);
  /* a pair far off idle's span is a snout's nostrils or a paw's pads, not the eyes */
  if (pair && idle && (pair.span < idle.eyeSpan * 0.72 || pair.span > idle.eyeSpan * 1.4)) pair = null;
  const eyes = pair || (fallback ? { x:near[0], y:near[1], span:fallback.eyeSpan, tilt:0, guessed:true } : null);
  if (!eyes) return null;
  const m = headFrom(img, eyes, R);
  return { ...m, guessed:!!eyes.guessed, img };
}

/* closed eyes: find idle's head in this pose by its outline (the best overlap of dark pixels, half resolution) */
const darkHalf = img => {
  const W = img.width >> 1, H = img.height >> 1, out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((y * 2) * img.width + x * 2) * 4;
    if (isDark(img.data, i)) out[y * W + x] = 1;
  }
  return { W, H, d:out };
};
export function registerHead(idleImg, idle, img, guess, reach = 44) {
  const A = darkHalf(idleImg), B = darkHalf(img);
  const hw = Math.max(idle.headW, 80) * 0.65;
  const x0 = Math.max(0, Math.round((idle.head[0] - hw) / 2)), x1 = Math.min(A.W - 1, Math.round((idle.head[0] + hw) / 2));
  const y0 = Math.max(0, Math.round((idle.head[1] - 12) / 2)), y1 = Math.min(A.H - 1, Math.round((idle.eyes[1] + idle.eyeSpan * 0.45) / 2));
  const tpl = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (A.d[y * A.W + x]) tpl.push([x, y]);
  const g = [Math.round(guess[0] / 2), Math.round(guess[1] / 2)], r = Math.round(reach / 2);
  let best = { score:-1, dx:0, dy:0 };
  for (let dy = g[1] - r; dy <= g[1] + r; dy++) for (let dx = g[0] - r; dx <= g[0] + r; dx++) {
    let hit = 0;
    for (const [x, y] of tpl) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < B.W && Y < B.H && B.d[Y * B.W + X]) hit++; }
    let win = 0;
    for (let y = y0 + dy; y <= y1 + dy; y++) for (let x = x0 + dx; x <= x1 + dx; x++) if (x >= 0 && y >= 0 && x < B.W && y < B.H && B.d[y * B.W + x]) win++;
    const score = hit / (tpl.length + win - hit || 1);
    if (score > best.score) best = { score, dx, dy };
  }
  return { dx:best.dx * 2, dy:best.dy * 2, score:best.score };
}

async function debugShot(img, m, file) {
  const { width:W, height:H } = img;
  const th = m.tilt * Math.PI / 180, u = [Math.cos(th), Math.sin(th)];
  const hw = m.headW / 2, es = m.eyeSpan / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <line x1="${m.head[0] - u[0] * hw}" y1="${m.head[1] - u[1] * hw}" x2="${m.head[0] + u[0] * hw}" y2="${m.head[1] + u[1] * hw}" stroke="#ff2d75" stroke-width="${W / 170}"/>
    <circle cx="${m.head[0]}" cy="${m.head[1]}" r="${W / 90}" fill="#ff2d75"/>
    <line x1="${m.eyes[0] - u[0] * es}" y1="${m.eyes[1] - u[1] * es}" x2="${m.eyes[0] + u[0] * es}" y2="${m.eyes[1] + u[1] * es}" stroke="${m.guessed ? "#ffa000" : "#00b0ff"}" stroke-width="${W / 170}"/>
  </svg>`;
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw:{ width:W, height:H, channels:4 } })
    .flatten({ background:"#8fdbe2" }).composite([{ input:Buffer.from(svg) }]).png().toBuffer()
    .then(buf => sharp(buf).resize(256, 256).png().toFile(file));
}

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
/* where the eyes were before this script's first run (the search starts there) */
const ORIGIN_FILE = fileURLToPath(new URL("./float-art-fit-origin.json", import.meta.url));
/* --origin: search from the tube art's first eyes (the Oct 27 sprites); new art searches from its own manifest's eyes */
const ORIGIN = args.includes("--origin") && fs.existsSync(ORIGIN_FILE) ? JSON.parse(fs.readFileSync(ORIGIN_FILE, "utf8")) : null;
const RING = 250;
const results = {};
const report = [];
const debugFiles = [];
for (const [id, c] of Object.entries(manifest.critters)) {
  if (only.length && !only.includes(id)) continue;
  const out = { plain:{}, tee:{}, portrait:null };
  const sets = [["plain", c.poses], ["tee", c.tee?.poses]];
  for (const [set, poses] of sets) {
    if (!poses) continue;
    let idle = null;
    for (const pose of manifest.poses) {
      const art = poses[pose];
      if (!art) continue;
      const near = ORIGIN?.[id]?.[pose] || c.poses[pose]?.anchor?.eyes || c.anchor.eyes;
      const m = await measureSet(art.src, RING, near, idle || c.measure, idle);
      if (!m) { report.push(`${id} ${set} ${pose}: no eyes`); continue; }
      const fix = FIT_FIX[id]?.[set]?.[pose] || (set === "tee" ? FIT_FIX[id]?.plain?.[pose] : null);
      if (fix) Object.assign(m, fix);
      if (m.guessed) m.tilt = 0;
      if (m.guessed && idle) {
        /* closed eyes: idle's head found by its outline */
        const reg = registerHead(idle.img, idle, m.img, [near[0] - idle.eyes[0], near[1] - idle.eyes[1]]);
        m.eyes = [idle.eyes[0] + reg.dx, idle.eyes[1] + reg.dy];
        m.head = [idle.head[0] + reg.dx, idle.head[1] + reg.dy];
        m.headW = idle.headW; m.eyeSpan = idle.eyeSpan;
        report.push(`${id} ${set} ${pose}: closed eyes, head found by outline (${r1(reg.score)})`);
      } else if (idle && pose !== "idle" && !fix) {
        /* the skull keeps its place over the eyes: idle's offset, turned with the eye line */
        const t = (m.tilt - idle.tilt) * Math.PI / 180, ox = idle.head[0] - idle.eyes[0], oy = idle.head[1] - idle.eyes[1];
        const expect = [m.eyes[0] + ox * Math.cos(t) - oy * Math.sin(t), m.eyes[1] + ox * Math.sin(t) + oy * Math.cos(t)];
        const off = Math.hypot(m.head[0] - expect[0], m.head[1] - expect[1]);
        const ratio = m.headW / idle.headW;
        if (FIT_FIX[id]?.follow || (!FIT_FIX[id]?.trust && off > idle.headW * 0.6)) {
          report.push(`${id} ${set} ${pose}: follows idle (off ${Math.round(off)}, width x${r1(ratio)})`);
          m.head = expect; m.headW = idle.headW;
        } else if (ratio < 0.75 || ratio > 1.35) {
          /* the top as measured, the width idle's (an arm or a splash cut the forehead short) */
          report.push(`${id} ${set} ${pose}: idle's width (x${r1(ratio)})`);
          m.headW = idle.headW;
        }
      }
      if (pose === "idle") idle = m;
      out[set][pose] = m;
      if (DEBUG) { const f = path.join(DEBUG, `${id}-${set}-${pose}.png`); fs.mkdirSync(DEBUG, { recursive:true }); await debugShot(m.img, m, f); debugFiles.push(f); }
    }
  }
  if (c.portrait) {
    const R = await ringWidth(c.portrait.tube, RING * 2);
    const m = await measureSet(c.portrait.src, R, c.portrait.anchor.eyes, c.portrait.measure);
    const fix = FIT_FIX[id]?.portrait || null;
    if (m && fix) Object.assign(m, fix);
    if (m) { out.portrait = m; if (DEBUG) { const f = path.join(DEBUG, `${id}-portrait.png`); await debugShot(m.img, m, f); debugFiles.push(f); } }
    else report.push(`${id} portrait: no eyes`);
  }
  results[id] = out;
  const idle = out.plain.idle;
  console.log(`${id.padEnd(13)} idle head ${ri(idle.head)} headW ${Math.round(idle.headW)} eyes ${ri(idle.eyes)} span ${Math.round(idle.eyeSpan)} tilt ${r1(idle.tilt)}`);
}
if (report.length) console.log(report.join("\n"));

if (DEBUG && debugFiles.length) {
  /* one contact sheet: a row per critter and set */
  const rows = new Map();
  for (const f of debugFiles) { const key = path.basename(f).split("-").slice(0, 2).join("-"); if (!rows.has(key)) rows.set(key, []); rows.get(key).push(f); }
  const cols = Math.max(...[...rows.values()].map(r => r.length));
  const S = 256, list = [...rows.values()];
  const composite = list.flatMap((r, y) => r.map((f, x) => ({ input:f, left:x * S, top:y * S })));
  await sharp({ create:{ width:cols * S, height:list.length * S, channels:3, background:"#ffffff" } }).composite(composite).png().toFile(path.join(DEBUG, "_sheet.png"));
  console.log(path.join(DEBUG, "_sheet.png"));
}

if (!DRY) {
  /* the skull's top where the walk stops short of it (between a jackrabbit's ears): lowered along the face */
  const dropped = (id, pose, m) => {
    const drop = FIT_FIX[id]?.drop;
    if (!drop || drop.skip?.includes(pose)) return m.head;
    const t = m.tilt * Math.PI / 180, k = drop.px * (pose === "portrait" ? 2 : 1);
    return [m.head[0] - Math.sin(t) * k, m.head[1] + Math.cos(t) * k];
  };
  const anchorOf = (old, m, id, pose) => ({ ...old, head:ri(dropped(id, pose, m)), eyes:ri(m.eyes) });
  const measureOf = m => ({ headW:Math.round(m.headW), eyeSpan:Math.round(m.eyeSpan), tilt:r1(m.tilt) });
  editManifest(mf => {
    for (const [id, out] of Object.entries(results)) {
      const c = mf.critters[id];
      for (const [pose, m] of Object.entries(out.plain)) { const p = c.poses[pose]; p.anchor = anchorOf(p.anchor || c.anchor, m, id, pose); p.measure = measureOf(m); }
      for (const [pose, m] of Object.entries(out.tee)) { const p = c.tee.poses[pose]; p.anchor = anchorOf(p.anchor || c.anchor, m, id, pose); p.measure = measureOf(m); }
      if (out.plain.idle) { c.anchor = anchorOf(c.anchor, out.plain.idle, id, "idle"); c.measure = measureOf(out.plain.idle); }
      if (out.portrait) { c.portrait.anchor = anchorOf(c.portrait.anchor, out.portrait, id, "portrait"); c.portrait.measure = measureOf(out.portrait); }
    }
  });
  console.log("manifest written");
}
