/* Float Groove art: the image jobs (prompts and references) for the art
   pipeline, written as JSON for scripts/float-art-gen.mjs. The references
   are each critter's cell of the approved lineup (float/look/lineup.png),
   cut on its own background and doubled.

     node scripts/float-art-jobs.mjs refs        the lineup cells -> <raw>/refs/<id>.png
     node scripts/float-art-jobs.mjs portraits [ids]   -> <raw>/jobs/portraits.json
     node scripts/float-art-jobs.mjs sheets [ids]      -> <raw>/jobs/sheets.json (needs the portraits)
     node scripts/float-art-jobs.mjs host | scenes | props | winnie
   Prompts describe the style in plain words and never name another game. */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CRITTER_IDS } from "../float/shared/looks.js";
import { ROOT, RAW, loadRGBA, floodBackground, components } from "./float-art-lib.mjs";
import { ref, gen, portraitJob, sheetJob } from "./float-art-prompts.mjs";

const [what = "refs", ...rest] = process.argv.slice(2);
const pick = rest.length ? rest : CRITTER_IDS;
const REFS = path.join(RAW, "refs");
const GEN = path.join(RAW, "gen");
const JOBS = path.join(RAW, "jobs");
fs.mkdirSync(REFS, { recursive:true });
fs.mkdirSync(JOBS, { recursive:true });
const write = (name, jobs) => { const file = path.join(JOBS, `${name}.json`); fs.writeFileSync(file, JSON.stringify(jobs, null, 1)); console.log(file, jobs.length); };

/* the lineup's cells, each on its own background, doubled */
async function refs() {
  const img = await loadRGBA(path.join(ROOT, "float/look/lineup.png"));
  const bg = floodBackground(img, (r, g, b) => Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 18);
  const { labels, comps } = components(bg.map(v => (v ? 0 : 1)), img.width, img.height);
  const big = comps.filter(c => c.n > 5000).sort((a, b) => (a.y0 > 500) - (b.y0 > 500) || a.x0 - b.x0);
  const paper = [254, 253, 247];
  for (const [k, id] of CRITTER_IDS.entries()) {
    const c = big[k], pad = 18;
    const left = Math.max(0, c.x0 - pad), top = Math.max(0, c.y0 - pad);
    const width = Math.min(img.width - left, c.x1 - c.x0 + 1 + pad * 2), height = Math.min(img.height - top, c.y1 - c.y0 + 1 + pad * 2);
    /* the cell alone: any other critter's pixels become paper */
    const cell = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const kk = (top + y) * img.width + left + x, o = (y * width + x) * 3;
      const other = labels[kk] >= 0 && labels[kk] !== c.id && big.some(b => b.id === labels[kk]);
      for (let ch = 0; ch < 3; ch++) cell[o + ch] = other ? paper[ch] : img.data[kk * 4 + ch];
    }
    await sharp(cell, { raw:{ width, height, channels:3 } }).resize(width * 2, height * 2, { kernel:"lanczos3" }).png().toFile(ref(id));
  }
  await sharp(path.join(ROOT, "float/look/lineup.png")).png().toFile(ref("lineup"));
  console.log("refs:", CRITTER_IDS.length + 1);
}

if (what === "refs") await refs();
else if (what === "portraits") write("portraits", pick.map(portraitJob));
else if (what === "sheets") write("sheets", pick.map(id => sheetJob(id, id === "gila" ? "Gila monster" : id === "hornedlizard" ? "horned lizard" : id === "bighorn" ? "bighorn sheep" : id)));
else { const mod = await import(`./float-art-jobs-${what}.mjs`).catch(() => null); if (mod?.default) write(what, await mod.default({ ref, gen })); else console.error(`unknown: ${what}`); }
