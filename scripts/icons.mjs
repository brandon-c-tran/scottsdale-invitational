/* Regenerates the PWA icon set from the FD chip mark (same geometry as FDMark
   in src/App.jsx, tokens resolved to static hex). Pure geometry, no browser
   dependency. Use --icons-only to leave the existing share card untouched. */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";

const SUN = "#F0B02F", INK0 = "#2A2119", NIGHT = "#171009", BONE = "#FBF3E4";
const ACCENT = "#C25832", ACCENT2 = "#D97A50", MUTED = "#C9B896";
const DISPLAY_FONT = fileURLToPath(new URL("./fonts/BarlowCondensed-Bold.ttf", import.meta.url));
const VENUE_IMAGE = fileURLToPath(new URL("../public/airbnb-compound-field-day.webp", import.meta.url));

/* Chip mark mirrors FDMark. Triangular rays read as a sun rather than a clock,
   and the compact favicon drops the hairline inner ring at tiny sizes. */
const mark = (px, ring = INK0, compact = false) => {
  const pt = (r, deg) => {
    const a = deg * Math.PI / 180;
    return [32 + Math.cos(a) * r, 32 + Math.sin(a) * r].map(v => v.toFixed(2));
  };
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const [x1, y1] = pt(23.4, i * 45 + 22.5), [x2, y2] = pt(28.2, i * 45 + 22.5);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BONE}" stroke-width="3.4" stroke-linecap="round"/>`;
  }).join("");
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45;
    const [x1, y1] = pt(10.7, a - 8), [x2, y2] = pt(17.8, a), [x3, y3] = pt(10.7, a + 8);
    return `<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="${INK0}"/>`;
  }).join("");
  return `
  <svg width="${px}" height="${px}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="29.5" fill="${SUN}" stroke="${ring}" stroke-width="3.5"/>
    ${ticks.replaceAll('stroke-width="3.4"', 'stroke-width="3.8"')}
    ${compact ? "" : `<circle cx="32" cy="32" r="20.6" fill="none" stroke="${INK0}" stroke-width="1.5" opacity="0.6"/>`}
    ${rays}
    <circle cx="32" cy="32" r="8.4" fill="${INK0}"/>
  </svg>`;
};

const frame = (body, px, markPx, bg) => {
  const at = (px - markPx) / 2;
  const nested = body.replace("<svg ", `<svg x="${at}" y="${at}" `);
  return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"
    xmlns="http://www.w3.org/2000/svg">
    ${bg ? `<rect width="${px}" height="${px}" fill="${bg}"/>` : ""}
    ${nested}
  </svg>`;
};

/* The link card is an invitation first and a logo lockup second. A real venue
   crop gives the URL a sense of place; the scorecard panel keeps every word
   legible at group-chat thumbnail size. Text is rendered through the bundled
   display face so generation is deterministic on every platform. */
const typeLayer = (value, size, color, tracking = 0) => sharp({
  text: {
    text: `<span foreground="${color}" letter_spacing="${Math.round(tracking * 1024)}">${value}</span>`,
    font: `Barlow Condensed Bold ${size}`,
    fontfile: DISPLAY_FONT,
    rgba: true,
    dpi: 72,
  },
}).png().toBuffer();

const share = async () => {
  const [venue, kicker, step, title, edition, manifesto, facts] = await Promise.all([
    sharp(VENUE_IMAGE)
      .resize(550, 630, { fit:"cover", position:"centre" })
      .modulate({ brightness:0.83, saturation:0.78 })
      .sharpen({ sigma:0.6 })
      .toBuffer(),
    typeLayer("YOUR INVITATION", 20, MUTED, 1.6),
    typeLayer("1 OF 6", 20, MUTED, 1.4),
    typeLayer("FIELD DAY", 164, BONE, 0.35),
    typeLayer("SCOTTSDALE · 2026", 38, ACCENT2, 1.2),
    typeLayer("THE BACHELOR PARTY IS\nA TOURNAMENT.", 48, BONE, 0.25),
    typeLayer("OCT 30 TO NOV 1  ·  13 PLAYERS  ·  16 EVENTS", 28, MUTED, 0.45),
  ]);

  const scorecard = `<svg width="1200" height="630" viewBox="0 0 1200 630"
    xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="8"/>
      </filter>
    </defs>
    <rect width="662" height="630" fill="${NIGHT}"/>
    <rect x="650" width="12" height="630" fill="${ACCENT}"/>
    <rect x="662" width="538" height="630" fill="${NIGHT}" opacity="0.14"/>
    <rect x="24" y="24" width="1152" height="582" rx="10" fill="none"
      stroke="${BONE}" stroke-width="2" opacity="0.18"/>
    <rect x="58" y="82" width="76" height="4" rx="2" fill="${ACCENT}"/>
    <rect x="142" y="82" width="76" height="4" rx="2" fill="${BONE}" opacity="0.15"/>
    <rect x="226" y="82" width="76" height="4" rx="2" fill="${BONE}" opacity="0.15"/>
    <rect x="310" y="82" width="76" height="4" rx="2" fill="${BONE}" opacity="0.15"/>
    <rect x="394" y="82" width="76" height="4" rx="2" fill="${BONE}" opacity="0.15"/>
    <rect x="478" y="82" width="76" height="4" rx="2" fill="${BONE}" opacity="0.15"/>
    <line x1="58" y1="488" x2="548" y2="488" stroke="${BONE}" stroke-width="2" opacity="0.16"/>
    <rect x="662" y="24" width="514" height="8" fill="${SUN}"/>
    ${mark(178, BONE).replace("<svg ", '<svg x="560" y="382" ')}
    <rect width="1200" height="630" filter="url(#grain)" opacity="0.026" style="mix-blend-mode:screen"/>
  </svg>`;

  return sharp({ create:{ width:1200, height:630, channels:4, background:NIGHT } })
    .composite([
      { input:venue, left:650, top:0 },
      { input:Buffer.from(scorecard), left:0, top:0 },
      { input:kicker, left:58, top:47 },
      { input:step, left:514, top:47 },
      { input:title, left:56, top:119 },
      { input:edition, left:59, top:252 },
      { input:manifesto, left:58, top:326 },
      { input:facts, left:58, top:523 },
    ])
    .png({ compressionLevel:9, adaptiveFiltering:true })
    .toBuffer();
};

const OUTPUTS = [
  { file: "public/icon-512.png", px: 512, markPx: 512, bg: null },
  { file: "public/icon-192.png", px: 192, markPx: 192, bg: null },
  /* Maskable: a quieter 72% mark leaves real room for every launcher crop. */
  { file: "public/icon-maskable-512.png", px: 512, markPx: 368, bg: NIGHT, ring: BONE },
  { file: "public/icon-maskable-192.png", px: 192, markPx: 138, bg: NIGHT, ring: BONE },
  /* iOS home screen: opaque night field */
  { file: "public/apple-touch-icon.png", px: 180, markPx: 148, bg: NIGHT, ring: BONE },
];

if (!process.argv.includes("--icons-only")) {
  writeFileSync("public/share.png", await share());
  console.log("wrote public/share.png");
}

for (const o of OUTPUTS) {
  const svg = frame(mark(o.markPx, o.ring), o.px, o.markPx, o.bg);
  await sharp(Buffer.from(svg)).png().toFile(o.file);
  console.log("wrote", o.file);
}

/* Vector favicon uses the compact geometry, so 16px does not turn into a
   ring of hairlines. Browsers that ignore SVG keep the 192px PNG fallback. */
writeFileSync("public/favicon.svg", mark(64, BONE, true).trim());
console.log("wrote public/favicon.svg");
