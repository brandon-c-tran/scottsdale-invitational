/* Float Groove art, the kayaks: what the key left behind. Counts, in every
   pose sprite (plain and tee) and portrait, the pixels still flat magenta
   or violet outside the tube mask (they would not take the rider's colour).
     node scripts/float-art-kayak-check.mjs [--max 150] */
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { OUT, MANIFEST, hueOf, hueDist } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const MAX = Number(args.includes("--max") ? args[args.indexOf("--max") + 1] : 150);
const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const raw = rel => sharp(path.join(OUT, rel)).ensureAlpha().raw().toBuffer();
let bad = 0;
for (const [id, c] of Object.entries(m.critters)) {
  const sets = [...Object.entries(c.poses).map(([p, a]) => [p, a]), ...Object.entries(c.tee?.poses || {}).map(([p, a]) => [`tee ${p}`, a]), ["portrait", c.portrait]];
  const out = [];
  for (const [name, a] of sets) {
    const [s, t] = await Promise.all([raw(a.src), raw(a.tube)]);
    let n = 0;
    for (let i = 0; i < s.length; i += 4) {
      if (s[i + 3] < 200 || t[i + 3] > 30) continue;
      const r = s[i], g = s[i + 1], b = s[i + 2], mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      if (sat < 0.5 || mx < 90) continue;
      const h = hueOf(r, g, b);
      if (hueDist(h, 328) < 22 || hueDist(h, 255) < 22) n++;
    }
    if (n > MAX) out.push(`${name} ${n}`);
  }
  if (out.length) { bad++; console.log(`${id}: ${out.join(", ")}`); }
}
console.log(bad ? `${bad} critters with unkeyed key colour over ${MAX} px` : "clean");
