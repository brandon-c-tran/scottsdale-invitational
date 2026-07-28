/* Regenerates the PWA icon set from the FD chip mark (same geometry as FDMark
   in src/App.jsx, tokens resolved to static hex). Pure geometry, no browser
   dependency. Use --icons-only to leave the existing share card untouched. */
import { writeFileSync } from "fs";
import sharp from "sharp";

const SUN = "#F0B02F", INK0 = "#2A2119", NIGHT = "#171009", BONE = "#FBF3E4";

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

/* the link card: what the invite looks like pasted into a group chat. Same
   mark, same night field, the words set in the display face so a bare URL is
   never what people see first. */
const share = () => `<svg width="1200" height="630" viewBox="0 0 1200 630"
  xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${NIGHT}"/>
  ${mark(300, BONE).replace("<svg ", '<svg x="105" y="165" ')}
  <g font-family="Barlow Condensed, Arial Narrow, sans-serif">
    <text x="470" y="224" fill="${SUN}" font-size="44" font-weight="700"
      letter-spacing="9">SCOTTSDALE · 2026</text>
    <text x="465" y="385" fill="${BONE}" font-size="150" font-weight="700"
      letter-spacing="-1">FIELD DAY</text>
    <text x="470" y="455" fill="#B9A88E" font-size="40" font-weight="500"
      letter-spacing="1.6">Oct 30 to Nov 1 · 13 players · 16 events</text>
  </g>
</svg>`;

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
  await sharp(Buffer.from(share())).png().toFile("public/share.png");
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
