/* Float Groove art: a raw image put on a flat background and scaled, to look
   at (the Read tool shows the PNG). Several files tile left to right.

     node scripts/float-art-look.mjs <file...> [--bg #8fdbe2] [--h 640] [--out <png>] */
import path from "node:path";
import sharp from "sharp";
import { RAW } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flags = new Set(["--bg", "--h", "--out"]);
const files = args.filter((a, i) => !a.startsWith("--") && !flags.has(args[i - 1]));
const bg = value("--bg") || "#8fdbe2";
const H = Number(value("--h") || 640);
const out = value("--out") || path.join(RAW, "look.png");
const tiles = [];
let x = 0;
for (const file of files) {
  const m = await sharp(file).metadata();
  const w = Math.round(m.width * H / m.height);
  const flat = await sharp({ create:{ width:m.width, height:m.height, channels:4, background:bg } }).composite([{ input:file }]).png().toBuffer();
  tiles.push({ input:await sharp(flat).resize(w, H).png().toBuffer(), left:x, top:0 });
  x += w + 8;
}
await sharp({ create:{ width:Math.max(1, x - 8), height:H, channels:4, background:"#ffffff" } }).composite(tiles).png().toFile(out);
console.log(out);
