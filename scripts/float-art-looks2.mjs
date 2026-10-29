/* Float Groove art: the v3 hat rack and glasses (float/GROOVE.md v3 "A
   cuter, cooler hat rack"), cut from <raw>/gen/looks2-hats.png (3 x 3, in
   LOOKS2_HATS order) and looks2-shades.png (3 x 2, LOOKS2_SHADES order;
   scripts/float-art-jobs-looks2.mjs writes the jobs).

   A hat's magenta is keyed like the tube (grey shading in `src`, a white
   `mask` the rider's colour fills); a hat drawn without magenta (the frog
   hat, the viking helmet, the halo) keeps its own colours (`mask` null,
   `own` true). fit is the hat's width over the head's, depth how far its
   base goes under the head's top (as a share of the head's width; the
   halo's is negative: it floats). Glasses keep their colours; `anchor` is
   between the lenses and `span` their distance. The cowboy and party hats,
   the crown and the aviators stay as they were; retired ids
   (looks.js RETIRED_HATS, RETIRED_SHADES) leave the manifest and are drawn
   as their new id.

     node scripts/float-art-looks2.mjs [--hats-only | --shades-only] */
import fs from "node:fs";
import path from "node:path";
import { OUT, sourceOf, editManifest } from "./float-art-lib.mjs";
import { cells, scaled, write, keyHat, baseOf, lensesOf, HAT_EYE_GAP } from "./float-art-looks.mjs";
import { LOOKS2_HATS, LOOKS2_SHADES } from "./float-art-jobs-looks2.mjs";
import { RETIRED_HATS, RETIRED_SHADES } from "../float/shared/looks.js";

export const HAT_FIT2 = {
  froggy:{ fit:1.16, depth:0.24 },
  beanie:{ fit:1.02, depth:0.26 },
  propeller:{ fit:1.04, depth:0.22 },
  tophat:{ fit:0.66, depth:0.06 },
  viking:{ fit:1.62, depth:0.24 },
  fishing:{ fit:1.12, depth:0.22 },
  sunhat:{ fit:1.36, depth:0.18 },
  halo:{ fit:0.78, depth:-0.2 },
  mushroom:{ fit:1.18, depth:0.26 },
};
const HAT_W = 320, SHADE_W = 300;
const args = process.argv.slice(2);
const dir = path.join(OUT, "looks");
fs.mkdirSync(path.join(dir, "hats"), { recursive:true });
fs.mkdirSync(path.join(dir, "shades"), { recursive:true });

const hats = {}, shades = {};
if (!args.includes("--shades-only")) {
  const hatCells = await cells(sourceOf("looks2-hats"), 3, 3);
  for (const [k, id] of LOOKS2_HATS.entries()) {
    const img = await scaled(hatCells[k], HAT_W);
    const keyed = keyHat(img);
    const F = HAT_FIT2[id];
    if (keyed) {
      await write(keyed.src, path.join(dir, "hats", `${id}.webp`));
      await write(keyed.mask, path.join(dir, "hats", `${id}-mask.webp`));
    } else await write(img, path.join(dir, "hats", `${id}.webp`));
    hats[id] = { src:`looks/hats/${id}.webp`, mask:keyed ? `looks/hats/${id}-mask.webp` : null, ...(keyed ? {} : { own:true }),
      w:img.width, h:img.height, anchor:[Math.round(img.width / 2), baseOf(img)], fit:F.fit, depth:F.depth, gap:HAT_EYE_GAP };
  }
}
if (!args.includes("--hats-only")) {
  const shadeCells = await cells(sourceOf("looks2-shades"), 3, 2);
  for (const [k, id] of LOOKS2_SHADES.entries()) {
    const img = await scaled(shadeCells[k], SHADE_W);
    await write(img, path.join(dir, "shades", `${id}.webp`));
    const [l, r] = lensesOf(img);
    shades[id] = { src:`looks/shades/${id}.webp`, w:img.width, h:img.height, anchor:[Math.round((l[0] + r[0]) / 2), Math.round((l[1] + r[1]) / 2)], span:Math.round(r[0] - l[0]) };
  }
}
editManifest(m => {
  m.hats = { ...m.hats, ...hats };
  m.shades = { ...m.shades, ...shades };
  for (const id of Object.keys(RETIRED_HATS)) delete m.hats[id];
  for (const id of Object.keys(RETIRED_SHADES)) delete m.shades[id];
  /* the crown, the cowboy and party hats keep their own entries */
});
console.log("hats:", Object.entries(hats).map(([id, h]) => `${id}${h.own ? " (own colours)" : ""}`).join(", ") || "kept");
console.log("shades:", Object.entries(shades).map(([id, s]) => `${id} span ${s.span}`).join(", ") || "kept");
