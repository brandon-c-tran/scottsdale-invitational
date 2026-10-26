/* Draws Float's river from above (float/shared/course.js) as an SVG, and a
   PNG beside it when sharp is installed: banks, the island, rocks, zones,
   each leg's grid and finish, and optionally the bots' racing lines.

     node scripts/float-course.mjs [out.svg] [--lines] [--leg N] [--px 1600]

   For reviewing the course's shape; nothing in the game reads it. */
import { writeFileSync } from "node:fs";
import { COURSE, frameAt, courseLength, gridSlots, beachSlot } from "../float/shared/course.js";

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const out = args.find(arg => arg.endsWith(".svg")) || "float-course.svg";
const legOnly = option("--leg", null);
const px = Number(option("--px", 1800));

const course = COURSE;
const total = courseLength(course);
const leg = legOnly === null ? null : course.legs[Number(legOnly)];
const from = leg ? leg.s0 : 0, to = leg ? leg.s1 : total;

const bank = side => {
  const points = [];
  for (let s = from; s <= to; s += 1) {
    const f = frameAt(course, s);
    points.push([f.x + f.nx * side * f.w / 2, f.y + f.ny * side * f.w / 2]);
  }
  return points;
};
const left = bank(1), right = bank(-1);
const all = [...left, ...right];
const pad = 20;
const minX = Math.min(...all.map(p => p[0])) - pad, maxX = Math.max(...all.map(p => p[0])) + pad;
const minY = Math.min(...all.map(p => p[1])) - pad, maxY = Math.max(...all.map(p => p[1])) + pad;
const scale = px / Math.max(maxX - minX, maxY - minY);
const W = Math.ceil((maxX - minX) * scale), H = Math.ceil((maxY - minY) * scale);
const X = x => ((x - minX) * scale).toFixed(1);
const Y = y => ((maxY - y) * scale).toFixed(1);
const path = points => points.map(([x, y], k) => `${k ? "L" : "M"}${X(x)},${Y(y)}`).join("");

const zoneColor = { pool:"#7fd3e6", riffle:"#ffffff", narrows:"#c98b5a", eddy:"#5fb3a1", whirlpool:"#b45cff",
  split:"#ffd166", drop:"#ff4d6d", bar:"#e9d8a6" };
const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="#c9a26b"/>`);
parts.push(`<path d="${path(left)}${path(right.slice().reverse()).replace("M", "L")}Z" fill="#2f7fa8"/>`);
for (const zone of course.zones) {
  if (zone.s1 < from || zone.s0 > to) continue;
  const s0 = Math.max(from, zone.s0), s1 = Math.min(to, zone.s1);
  const pts = [];
  for (let s = s0; s <= s1; s += 1) { const f = frameAt(course, s); pts.push([f.x, f.y]); }
  parts.push(`<path d="${path(pts)}" stroke="${zoneColor[zone.k] || "#fff"}" stroke-width="${Math.max(3, 2.2 * scale)}" fill="none" opacity="0.8"/>`);
  if (zone.k === "whirlpool")
    parts.push(`<circle cx="${X(zone.x)}" cy="${Y(zone.y)}" r="${(zone.r * scale).toFixed(1)}" fill="none" stroke="#b45cff" stroke-width="2"/>`,
      `<circle cx="${X(zone.x)}" cy="${Y(zone.y)}" r="${(zone.core * scale).toFixed(1)}" fill="#b45cff" opacity="0.6"/>`);
}
for (const [x, y, r] of course.islands)
  parts.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${(r * scale).toFixed(1)}" fill="#7a9a4a"/>`);
for (const [x, y, r] of course.rocks)
  parts.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${Math.max(1.5, r * scale).toFixed(1)}" fill="#3b3b3b"/>`);
course.legs.forEach((item, index) => {
  if (leg && item !== leg) return;
  for (const [s, color] of [[item.grid, "#00ff88"], [item.finish, "#ff3355"]]) {
    const f = frameAt(course, s);
    const a = [f.x + f.nx * f.w / 2, f.y + f.ny * f.w / 2], b = [f.x - f.nx * f.w / 2, f.y - f.ny * f.w / 2];
    parts.push(`<path d="${path([a, b])}" stroke="${color}" stroke-width="3"/>`);
  }
  for (const slot of gridSlots(course, index, 13))
    parts.push(`<circle cx="${X(slot.x)}" cy="${Y(slot.y)}" r="${(0.8 * scale).toFixed(1)}" fill="#ffee00"/>`);
  for (let k = 0; k < 13; k += 1) {
    const slot = beachSlot(course, index, k);
    parts.push(`<circle cx="${X(slot.x)}" cy="${Y(slot.y)}" r="${(0.8 * scale).toFixed(1)}" fill="#ff8800"/>`);
  }
  const f = frameAt(course, (item.s0 + item.s1) / 2);
  parts.push(`<text x="${X(f.x + f.nx * 40)}" y="${Y(f.y + f.ny * 40)}" font-size="${Math.max(14, 6 * scale)}" fill="#1b1b1b" font-family="sans-serif">${index + 1} ${item.name}</text>`);
});
if (flag("--lines")) {
  const { racingLine } = await import("../float/shared/bots.js");
  for (const [variant, color] of [["left", "#ff00aa"], ["right", "#00ffee"]]) {
    const line = racingLine(course, variant);
    const pts = [];
    for (const [s, d] of line) {
      if (s < from || s > to) continue;
      const f = frameAt(course, s);
      pts.push([f.x + f.nx * d, f.y + f.ny * d]);
    }
    parts.push(`<path d="${path(pts)}" stroke="${color}" stroke-width="1.5" fill="none"/>`);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
writeFileSync(out, svg);
console.log(`wrote ${out} (${W}x${H})`);
try {
  const sharp = (await import("sharp")).default;
  const png = out.replace(/\.svg$/, ".png");
  await sharp(Buffer.from(svg)).png().toFile(png);
  console.log(`wrote ${png}`);
} catch (error) {
  console.log(`no PNG (${error.message.split("\n")[0]})`);
}
