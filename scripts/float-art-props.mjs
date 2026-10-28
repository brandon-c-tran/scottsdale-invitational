/* Float Groove art: the props (float/GROOVE.md "The art manifest"), cut
   from two generated sheets of six (<raw>/gen/props-water.png and
   props-things.png, a 3 x 2 grid each), trimmed, sized, and anchored where
   the screen places them:
     splash, splash-big   bottom middle (where it leaves the water)
     ripple, whirl        the middle (on the water around a rider)
     rock                 its waterline
     falls-lip            the top-left of the river's surface, where it joins the water band
     cup                  its middle (a paw holds it)
     crown                its bottom middle (on anchor.head)
     sign-*               the stick's foot (the host's hand)
     podium               its bottom middle; `steps` are the tops of 1st, 2nd and 3rd
   Confetti and the sparkle are drawn (white, tinted at run time).

     node scripts/float-art-props.mjs */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OUT, RAW, WEBP, sourceOf, loadRGBA, blank, components, alphaBounds, editManifest } from "./float-art-lib.mjs";

const SHEETS = {
  "props-water":["splash", "ripple", "rock", "whirl", "falls-lip", "splash-big"],
  "props-things":["cup", "crown", "sign-paddle", "sign-rock", "sign-spin", "podium"],
};
/* each prop's longest side in the file */
const SIZE = { splash:256, ripple:320, rock:280, whirl:440, "falls-lip":560, "splash-big":360, cup:160, crown:200, "sign-paddle":280, "sign-rock":280, "sign-spin":280, podium:640 };

async function cut(sheet, names) {
  const img = await loadRGBA(sourceOf(sheet));
  const { width:W, height:H, data:d } = img;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 8 ? 0 : d[i] >= 246 ? 255 : Math.round(d[i] * 255 / 246);
  const solid = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (d[k * 4 + 3] > 16) solid[k] = 1;
  const { labels, comps } = components(solid, W, H);
  const cellOf = (x, y) => Math.min(1, Math.floor(y / (H / 2))) * 3 + Math.min(2, Math.floor(x / (W / 3)));
  const owner = new Map();
  for (const c of comps) if (c.n >= 10) owner.set(c.id, cellOf(c.cx, c.cy));
  const cells = names.map(() => blank(W, H));
  for (let k = 0; k < W * H; k++) {
    const o = owner.get(labels[k]);
    const cell = o ?? (d[k * 4 + 3] ? cellOf(k % W, Math.floor(k / W)) : undefined);
    if (cell === undefined) continue;
    cells[cell].data.set(d.subarray(k * 4, k * 4 + 4), k * 4);
  }
  return cells;
}

function firstOpaqueY(img, x, t = 160) {
  for (let y = 0; y < img.height; y++) if (img.data[(y * img.width + Math.round(x)) * 4 + 3] > t) return y;
  return img.height - 1;
}
function lastOpaqueY(img, x, t = 160) {
  for (let y = img.height - 1; y >= 0; y--) if (img.data[(y * img.width + Math.round(x)) * 4 + 3] > t) return y;
  return 0;
}

const entries = {};
for (const [sheet, names] of Object.entries(SHEETS)) {
  const cells = await cut(sheet, names);
  for (const [k, id] of names.entries()) {
    const cell = cells[k];
    const b = alphaBounds(cell, 8);
    const pad = 4;
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
    const w = Math.min(cell.width - x0, b.w + pad * 2), h = Math.min(cell.height - y0, b.h + pad * 2);
    const k2 = SIZE[id] / Math.max(w, h);
    const ow = Math.round(w * k2), oh = Math.round(h * k2);
    const trimmed = await sharp(Buffer.from(cell.data.buffer), { raw:{ width:cell.width, height:cell.height, channels:4 } })
      .extract({ left:x0, top:y0, width:w, height:h }).resize(ow, oh, { kernel:"lanczos3", fit:"fill" }).raw().toBuffer();
    const out = { data:new Uint8Array(trimmed.buffer, trimmed.byteOffset, trimmed.length), width:ow, height:oh };
    fs.mkdirSync(path.join(OUT, "props"), { recursive:true });
    await sharp(trimmed, { raw:{ width:ow, height:oh, channels:4 } }).webp(WEBP).toFile(path.join(OUT, "props", `${id}.webp`));
    let anchor = [Math.round(ow / 2), oh - 1];
    const extra = {};
    if (id === "ripple" || id === "whirl" || id === "cup") anchor = [Math.round(ow / 2), Math.round(oh / 2)];
    if (id === "rock") anchor = [Math.round(ow / 2), Math.round(oh * 0.86)];
    if (id === "falls-lip") {
      /* the river's surface where it joins the water: the first row's leftmost opaque pixel */
      search: for (let y = 0; y < oh; y++) for (let x = 0; x < ow * 0.5; x++) if (out.data[(y * ow + x) * 4 + 3] > 160) { anchor = [x, y]; break search; }
    }
    if (id === "podium") {
      /* the blocks: left 2nd, middle 1st, right 3rd */
      const top = x => [Math.round(x), firstOpaqueY(out, x)];
      extra.steps = [top(ow * 0.5), top(ow * 0.17), top(ow * 0.83)];
      anchor = [Math.round(ow / 2), lastOpaqueY(out, ow / 2)];
    }
    entries[id] = { src:`props/${id}.webp`, w:ow, h:oh, anchor, tint:false, ...extra };
  }
}

/* drawn: confetti pieces and the sparkle, white with the ink line, tinted at run time */
const INK = "#1d1b22";
const line = (w = 3) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const DRAWN = {
  "confetti-1":[48, 48, `<rect x="8" y="16" width="32" height="16" rx="4" fill="#ffffff" ${line()} transform="rotate(-18 24 24)"/>`],
  "confetti-2":[48, 48, `<circle cx="24" cy="24" r="12" fill="#ffffff" ${line()}/>`],
  "confetti-3":[48, 48, `<path d="M8 32 C14 12 22 38 30 18 C34 10 40 14 42 20" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M8 32 C14 12 22 38 30 18 C34 10 40 14 42 20" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`],
  "confetti-4":[48, 48, `<path d="M24 5 L29 18 L43 19 L32 28 L36 42 L24 34 L12 42 L16 28 L5 19 L19 18 Z" fill="#ffffff" ${line()}/>`],
  sparkle:[96, 96, `<path d="M48 6 C52 34 62 44 90 48 C62 52 52 62 48 90 C44 62 34 52 6 48 C34 44 44 34 48 6 Z" fill="#ffffff" ${line(4)}/>`],
};
for (const [id, [w, h, body]] of Object.entries(DRAWN)) {
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).webp(WEBP).toFile(path.join(OUT, "props", `${id}.webp`));
  entries[id] = { src:`props/${id}.webp`, w, h, anchor:[w / 2, h / 2], tint:true };
}
editManifest(m => { m.props = entries; });
console.log("props:", Object.keys(entries).join(" "));
