/* Regenerates the PWA icon set from the FD crest (same geometry as FDMark in
   src/App.jsx, tokens resolved to static hex). Chromium renders the crest with
   the real Barlow Condensed so the PNGs always carry the proper lockup.

   Run: NODE_PATH=$(npm root -g) node scripts/icons.mjs */
import { createRequire } from "module";
import { writeFileSync, readFileSync } from "fs";

const require2 = createRequire(import.meta.url);
const { chromium } = require2(process.env.PLAYWRIGHT_PKG || require2.resolve("playwright", { paths: [process.env.NODE_PATH || "/opt/node22/lib/node_modules"] }));

const SUN = "#F0B02F", INK = "#2A2119", NIGHT = "#251C14", BONE = "#FBF3E4", BG = "#F2E9D8";

/* Barlow Condensed BoldItalic, embedded so the render can never fall back.
   Pass FONT_WOFF2=path (a copy of the Google-served latin woff2). */
const FONT_B64 = readFileSync(process.env.FONT_WOFF2).toString("base64");

/* crest geometry mirrors FDMark: outer ring, hairline inner ring, italic FD */
const crest = (px, ring = INK) => `
  <svg width="${px}" height="${px}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="29.5" fill="${SUN}" stroke="${ring}" stroke-width="3.5"/>
    <circle cx="32" cy="32" r="24" fill="none" stroke="${INK}" stroke-width="1.4" opacity="0.55"/>
    <text x="34" y="43.5" text-anchor="middle" font-family="'Barlow Condensed'" font-weight="700"
      font-style="italic" font-size="33" letter-spacing="-0.5" fill="${INK}">FD</text>
  </svg>`;

const page_ = (body, px, bg) => `<!doctype html><html><head>
  <style>
    @font-face { font-family:'Barlow Condensed'; font-style:italic; font-weight:700;
      src:url(data:font/woff2;base64,${FONT_B64}) format('woff2'); }
    html,body{margin:0}
    #f{width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;${bg ? `background:${bg}` : ""}}
  </style>
  </head><body><div id="f">${body}</div></body></html>`;

const OUTPUTS = [
  { file: "public/icon-512.png", px: 512, crestPx: 512, bg: null },
  { file: "public/icon-192.png", px: 192, crestPx: 192, bg: null },
  /* maskable: crest inside the 80% safe zone on the night chrome */
  { file: "public/icon-maskable-512.png", px: 512, crestPx: 400, bg: NIGHT, ring: BONE },
  /* iOS home screen: opaque bone field */
  { file: "public/apple-touch-icon.png", px: 180, crestPx: 152, bg: BG },
];

const browser = await chromium.launch({
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});
const page = await browser.newPage({ ignoreHTTPSErrors: true });
for (const o of OUTPUTS) {
  await page.setViewportSize({ width: o.px, height: o.px });
  await page.setContent(page_(crest(o.crestPx, o.ring), o.px, o.bg), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => document.fonts.check("italic 700 33px 'Barlow Condensed'"));
  if (!loaded) { console.error("Barlow Condensed did not load; refusing to render fallback icons"); process.exit(1); }
  const buf = await page.locator("#f").screenshot({ omitBackground: !o.bg });
  writeFileSync(o.file, buf);
  console.log("wrote", o.file, buf.length, "bytes");
}
await browser.close();
