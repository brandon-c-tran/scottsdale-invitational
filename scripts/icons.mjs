/* Regenerates the PWA icon set from the FD chip mark (same geometry as FDMark
   in src/App.jsx, tokens resolved to static hex). Pure geometry, no fonts.

   Run: NODE_PATH=$(npm root -g) node scripts/icons.mjs */
import { createRequire } from "module";
import { writeFileSync } from "fs";

const require2 = createRequire(import.meta.url);
const { chromium } = require2(process.env.PLAYWRIGHT_PKG || require2.resolve("playwright", { paths: [process.env.NODE_PATH || "/opt/node22/lib/node_modules"] }));

const SUN = "#F0B02F", INK0 = "#2A2119", NIGHT = "#171009", BONE = "#FBF3E4";

/* chip mark mirrors FDMark: sun chip, bone edge ticks, geometric sun center */
const mark = (px, ring = INK0) => {
  const pt = (r, deg) => {
    const a = deg * Math.PI / 180;
    return [32 + Math.cos(a) * r, 32 + Math.sin(a) * r].map(v => v.toFixed(2));
  };
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const [x1, y1] = pt(23.4, i * 45 + 22.5), [x2, y2] = pt(28.2, i * 45 + 22.5);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BONE}" stroke-width="3.4" stroke-linecap="round"/>`;
  }).join("");
  const rays = Array.from({ length: 8 }, (_, i) => {
    const [x1, y1] = pt(13.4, i * 45), [x2, y2] = pt(17.6, i * 45);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK0}" stroke-width="3.1" stroke-linecap="round"/>`;
  }).join("");
  return `
  <svg width="${px}" height="${px}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="29.5" fill="${SUN}" stroke="${ring}" stroke-width="3.5"/>
    ${ticks}
    <circle cx="32" cy="32" r="20.6" fill="none" stroke="${INK0}" stroke-width="1.5" opacity="0.6"/>
    <circle cx="32" cy="32" r="8.6" fill="${INK0}"/>
    ${rays}
  </svg>`;
};

const page_ = (body, px, bg) => `<!doctype html><html><head>
  <style>html,body{margin:0}#f{width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;${bg ? `background:${bg}` : ""}}</style>
  </head><body><div id="f">${body}</div></body></html>`;

/* the link card: what the invite looks like pasted into a group chat. Same
   mark, same night field, the words set in the display face so a bare URL is
   never what people see first. */
const share = () => `<div style="width:1200px;height:630px;background:${NIGHT};display:flex;
  align-items:center;justify-content:center;gap:64px;font-family:'Barlow Condensed',sans-serif">
  ${mark(300, BONE)}
  <div style="color:${BONE}">
    <div style="font-size:44px;font-weight:700;letter-spacing:0.22em;color:${SUN};
      text-transform:uppercase">Scottsdale &middot; 2026</div>
    <div style="font-size:150px;font-weight:700;line-height:0.92;letter-spacing:-0.01em;
      text-transform:uppercase">Field Day</div>
    <div style="font-size:40px;font-weight:500;letter-spacing:0.04em;color:#B9A88E;
      margin-top:14px">Oct 30 to Nov 1 &middot; 13 players &middot; 16 events</div>
  </div>
</div>`;

const OUTPUTS = [
  { file: "public/icon-512.png", px: 512, markPx: 512, bg: null },
  { file: "public/icon-192.png", px: 192, markPx: 192, bg: null },
  /* maskable: mark inside the 80% safe zone on the night canvas */
  { file: "public/icon-maskable-512.png", px: 512, markPx: 400, bg: NIGHT, ring: BONE },
  { file: "public/icon-maskable-192.png", px: 192, markPx: 150, bg: NIGHT, ring: BONE },
  /* iOS home screen: opaque night field */
  { file: "public/apple-touch-icon.png", px: 180, markPx: 148, bg: NIGHT, ring: BONE },
];

const browser = await chromium.launch();
const page = await browser.newPage();
/* the share card needs the real display face, so load fonts first */
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><html><head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&display=swap" rel="stylesheet">
  <style>html,body{margin:0}</style></head><body>${share()}</body></html>`);
await page.waitForTimeout(1800);
writeFileSync("public/share.png", await page.screenshot());
console.log("wrote public/share.png");

for (const o of OUTPUTS) {
  await page.setViewportSize({ width: o.px, height: o.px });
  await page.setContent(page_(mark(o.markPx, o.ring), o.px, o.bg));
  const buf = await page.locator("#f").screenshot({ omitBackground: !o.bg });
  writeFileSync(o.file, buf);
  console.log("wrote", o.file, buf.length, "bytes");
}
await browser.close();
