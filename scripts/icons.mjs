/* Regenerates every app icon and the link card from the one master mark,
   "the chip, lit" (src/ui/fdMark.js, also drawn in the app by Brand.jsx
   FDMark). Pure geometry rasterised by sharp, no browser. Lettering uses the
   bundled Big Shoulders cuts (static 900 instances of public/fonts, OFL), so
   the card renders the same on every machine. Use --icons-only to leave the
   existing share card untouched. */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { markBody, MARK_INKS, MARK_INKS_STAGING } from "../src/ui/fdMark.js";
import { EDITION } from "../shared/core.js";

const GROUND = "#090b14", BONE = "#f4ecd8", AMBER = "#ffa630", LILAC = "#b2abc2";
const SHOW_FONT = fileURLToPath(new URL("./fonts/BigShouldersDisplay-Black.ttf", import.meta.url));
const MARQUEE_FONT = fileURLToPath(new URL("./fonts/BigShouldersInlineDisplay-Black.ttf", import.meta.url));

/* the mark at markPx, centred on a px square, over an optional ground */
const icon = ({ px, markPx, bg = null, inks = MARK_INKS, label = "", level = "full" }) => {
  const at = (px - markPx) / 2;
  return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" xmlns="http://www.w3.org/2000/svg">
    ${bg ? `<rect width="${px}" height="${px}" fill="${bg}"/>` : ""}
    <svg x="${at}" y="${at}" width="${markPx}" height="${markPx}" viewBox="0 0 64 64">
      ${markBody({ level, inks, label, uid:"m" })}
    </svg>
  </svg>`;
};

const OUTPUTS = [
  /* "any": the chip alone, full bleed */
  { file:"public/icon-512.png", px:512, markPx:504 },
  { file:"public/icon-192.png", px:192, markPx:188 },
  /* maskable: the chip inside the 80% safe circle on the glass ground */
  { file:"public/icon-maskable-512.png", px:512, markPx:400, bg:GROUND },
  { file:"public/icon-maskable-192.png", px:192, markPx:150, bg:GROUND },
  /* iOS home screen: opaque glass ground, the chip clear of the corner mask */
  { file:"public/apple-touch-icon.png", px:180, markPx:150, bg:GROUND },
];
const STAGING_OUTPUTS = [
  { file:"public/icon-staging-512.png", px:512, markPx:504 },
  { file:"public/icon-staging-192.png", px:192, markPx:188 },
  { file:"public/icon-staging-maskable-512.png", px:512, markPx:400, bg:MARK_INKS_STAGING.ink },
  { file:"public/icon-staging-maskable-192.png", px:192, markPx:150, bg:MARK_INKS_STAGING.ink },
  { file:"public/apple-touch-icon-staging.png", px:180, markPx:150, bg:MARK_INKS_STAGING.ink },
];

const type = (value, font, fontfile, size, color, tracking = 0) => sharp({
  text:{
    text:`<span foreground="${color}" letter_spacing="${Math.round(tracking * 1024)}">${value}</span>`,
    font:`${font} ${size}`, fontfile, rgba:true, dpi:72,
  },
}).png().toBuffer();

/* Big Shoulders draws "1" as a bare stroke, which reads as I beside capitals
   (the app's OneSafe flags it). A lone 1 is set in a key color, found in the
   raster, repainted, and given the same flag: a short stroke off the stem's
   top, turned -35deg. */
const KEY = [255, 0, 255];
const flaggedType = async (value, font, fontfile, size, color, tracking = 0) => {
  const marked = value.replace(/(^|[^0-9])1(?![0-9])/g, `$1<span foreground="#ff00ff">1</span>`);
  const { data, info } = await sharp(await type(marked, font, fontfile, size, color, tracking))
    .raw().toBuffer({ resolveWithObject:true });
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const stems = [];
  for (let x = 0; x < info.width; x++) for (let y = 0; y < info.height; y++) {
    const at = (y * info.width + x) * 4;
    const d = Math.abs(data[at] - KEY[0]) + Math.abs(data[at + 1] - KEY[1]) + Math.abs(data[at + 2] - KEY[2]);
    if (data[at + 3] === 0 || d > 120) continue;
    let stem = stems.find(s => x <= s.x1 + 2);
    if (!stem) stems.push(stem = { x0:x, x1:x, y0:y, y1:y });
    stem.x1 = Math.max(stem.x1, x); stem.y0 = Math.min(stem.y0, y); stem.y1 = Math.max(stem.y1, y);
    data[at] = r; data[at + 1] = g; data[at + 2] = b;
  }
  const flags = stems.map(({ x0, x1, y0 }) => {
    const w = x1 - x0 + 1, len = size * 0.23, a = 35 * Math.PI / 180;
    const sx = x0 + w * 0.5, sy = y0 + w * 0.35;
    return `<line x1="${sx}" y1="${sy}" x2="${sx - Math.cos(a) * len}" y2="${sy + Math.sin(a) * len}"
      stroke="${color}" stroke-width="${w * 0.86}" stroke-linecap="butt"/>`;
  }).join("");
  const pad = Math.ceil(size * 0.2);
  return sharp({ create:{ width:info.width + pad, height:info.height, channels:4, background:{ r:0, g:0, b:0, alpha:0 } } })
    .composite([
      { input:Buffer.from(`<svg width="${info.width + pad}" height="${info.height}" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${pad} 0)">${flags}</g></svg>`), left:0, top:0 },
      { input:data, raw:info, left:pad, top:0 },
    ]).png().toBuffer();
};

/* The link card: the mark and the name, nothing to read twice. The edition
   and its dates come from EDITION, never spelled out here. */
const share = async () => {
  /* the name fills the column beside the mark */
  const column = 540;
  const probe = await sharp(await type("Field Day", "FD Big Shoulders Inline", MARQUEE_FONT, 200, BONE, 1)).metadata();
  const titleSize = Math.floor(200 * column / probe.width);
  const [title, edition, dates] = await Promise.all([
    type("Field Day", "FD Big Shoulders Inline", MARQUEE_FONT, titleSize, BONE, 1),
    flaggedType(EDITION.label.toUpperCase(), "FD Big Shoulders", SHOW_FONT, 60, AMBER, 3),
    flaggedType(EDITION.short.toUpperCase(), "FD Big Shoulders", SHOW_FONT, 44, LILAC, 3),
  ]);
  const [t, e] = await Promise.all([title, edition].map(buf => sharp(buf).metadata()));
  const markPx = 400, markX = 88, markY = (630 - markPx) / 2;
  const textX = 566;
  const block = t.height + 18 + e.height + 22 + 44;
  const top = Math.round((630 - block) / 2) - 8;
  const plate = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="${GROUND}"/>
    <rect x="24" y="24" width="1152" height="582" rx="14" fill="none" stroke="${BONE}" stroke-opacity=".14" stroke-width="2"/>
    <svg x="${markX}" y="${markY}" width="${markPx}" height="${markPx}" viewBox="0 0 64 64">${markBody({ level:"full", uid:"s" })}</svg>
  </svg>`;
  return sharp(Buffer.from(plate))
    .composite([
      { input:title, left:textX - 6, top },
      { input:edition, left:textX - Math.ceil(60 * 0.2), top:top + t.height + 18 },
      { input:dates, left:textX - Math.ceil(44 * 0.2), top:top + t.height + 18 + e.height + 22 },
    ])
    .png({ compressionLevel:9, adaptiveFiltering:true })
    .toBuffer();
};

if (!process.argv.includes("--icons-only")) {
  writeFileSync("public/share.png", await share());
  console.log("wrote public/share.png");
}
for (const o of OUTPUTS) {
  await sharp(Buffer.from(icon(o))).png().toFile(o.file);
  console.log("wrote", o.file);
}
for (const o of STAGING_OUTPUTS) {
  await sharp(Buffer.from(icon({ ...o, inks:MARK_INKS_STAGING, label:"STG" }))).png().toFile(o.file);
  console.log("wrote", o.file);
}

/* The vector favicon is the small cut (chip and sun), so a 16px tab does not
   turn into a ring of crumbs. Browsers that ignore SVG keep the 192px PNG. */
const favicon = (inks, label = "") => `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${markBody({ level:"small", inks, label, uid:"f" })}</svg>`;
writeFileSync("public/favicon.svg", favicon(MARK_INKS));
console.log("wrote public/favicon.svg");
writeFileSync("public/favicon-staging.svg", favicon(MARK_INKS_STAGING, "STG"));
console.log("wrote public/favicon-staging.svg");
