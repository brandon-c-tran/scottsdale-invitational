/* Float Groove art: a contact sheet of what the manifest holds, painted the
   way the module paints it (the tube mask filled with a colour, multiplied
   over the grey tube), on a background, for looking at the art without a
   browser.

     node scripts/float-art-contact.mjs [--out file.png] [--critters a,b] [--poses idle,cheer]
       [--colors #e53935,#fdd835,#00897b,#1a237e] [--bg #9fe3e0] [--size 256] [--portraits]
*/
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OUT, MANIFEST, RAW } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const val = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const critters = val("--critters", Object.keys(m.critters).join(",")).split(",");
const poses = val("--poses", m.poses.join(",")).split(",");
const colors = val("--colors", "#e53935,#fdd835,#00897b,#1a237e").split(",");
const size = Number(val("--size", 200));
const bgHex = val("--bg", "#9fe3e0");
const portraits = args.includes("--portraits");
const out = val("--out", path.join(RAW, "contact.png"));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

async function painted(srcFile, tubeFile, color, px) {
  const src = await sharp(path.join(OUT, srcFile)).ensureAlpha().resize(px, px).raw().toBuffer();
  const tube = tubeFile ? await sharp(path.join(OUT, tubeFile)).ensureAlpha().resize(px, px).raw().toBuffer() : null;
  const [r, g, b] = hex(color);
  const o = Buffer.from(src);
  if (tube) for (let i = 0; i < o.length; i += 4) {
    const a = tube[i + 3] / 255;
    if (!a) continue;
    o[i] = Math.round(src[i] * (1 - a) + (src[i] * r / 255) * a);
    o[i + 1] = Math.round(src[i + 1] * (1 - a) + (src[i + 1] * g / 255) * a);
    o[i + 2] = Math.round(src[i + 2] * (1 - a) + (src[i + 2] * b / 255) * a);
  }
  return sharp(o, { raw:{ width:px, height:px, channels:4 } }).png().toBuffer();
}

const tiles = [];
const cols = portraits ? colors.length : poses.length * Math.max(1, colors.length > 1 && poses.length === 1 ? colors.length : 1);
let row = 0;
for (const id of critters) {
  const c = m.critters[id];
  if (!c) continue;
  let col = 0;
  if (portraits) {
    for (const color of colors) tiles.push({ input:await painted(c.portrait.src, c.portrait.tube, color, size), left:col++ * size, top:row * size });
  } else {
    for (const [k, pose] of poses.entries()) {
      const p = c.poses[pose];
      const color = colors[(k + row) % colors.length];
      if (poses.length === 1) for (const cc of colors) tiles.push({ input:await painted(p.src, p.tube, cc, size), left:col++ * size, top:row * size });
      else tiles.push({ input:await painted(p.src, p.tube, color, size), left:col++ * size, top:row * size });
    }
  }
  row++;
}
const W = Math.max(...tiles.map(t => t.left)) + size, H = row * size;
fs.mkdirSync(path.dirname(out), { recursive:true });
await sharp({ create:{ width:W, height:H, channels:4, background:bgHex } }).composite(tiles).png().toFile(out);
console.log(out, `${W}x${H}`, cols);
