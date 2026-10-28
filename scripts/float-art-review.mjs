/* Float Groove art as PNGs: the /float/art review page (float/client/art/
   ArtApp.jsx) in headless Chrome on its own Vite server (no Worker, no
   state). Each shot is one view of the page, frozen.

     node scripts/float-art-review.mjs                 every shot
     node scripts/float-art-review.mjs --only flotilla shots whose name matches
     node scripts/float-art-review.mjs --out <dir>     default ../groove-art-raw/review
   FLOAT_ART_PORT the server port (5181). */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchChrome } from "./headless-chrome.mjs";
import { ROOT, RAW } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(value("--out") || path.join(RAW, "review"));
const ONLY = value("--only") ? new RegExp(value("--only")) : null;
const PORT = Number(process.env.FLOAT_ART_PORT || 5181);

export const SHOTS = [
  ["flotilla", "view=flotilla&freeze=1", 1400, 900],
  ["lastcall", "view=lastcall&freeze=1", 1400, 900],
  ["critters", "view=critters&freeze=1", 1100, 4000],
  ["critter-capybara", "view=critter&id=capybara&freeze=1", 1800, 900],
  ["crowns", "view=crowns&freeze=1", 1000, 1900],
  ["portraits", "view=portraits&freeze=1", 1400, 1000],
  ["host", "view=host&freeze=1", 1200, 1200],
  ["scenes", "view=scenes&freeze=1", 2000, 2400],
  ["props", "view=props&freeze=1", 1400, 1000],
  ["type", "view=type&freeze=1", 1400, 500],
];

const floatArtRoute = {
  name:"float-art-route",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://art.local");
      if (url.pathname === "/float/art" || url.pathname === "/float/art/") req.url = `/float/art.html${url.search}`;
      next();
    });
  },
};
const server = await createServer({
  root:ROOT, configFile:false, logLevel:"error", clearScreen:false,
  plugins:[floatArtRoute, react()],
  cacheDir:path.join(ROOT, "node_modules/.vite-float-groove-art"),
  server:{ port:PORT, strictPort:false, host:"127.0.0.1", hmr:false },
  optimizeDeps:{ entries:["float/client/main.jsx"], include:["react", "react-dom/client"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;
const chrome = await launchChrome({ width:1400, height:900 });
const errors = [];
chrome.on(m => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
});
try {
  fs.mkdirSync(OUT, { recursive:true });
  for (const [name, q, w, h] of SHOTS) {
    if (ONLY && !ONLY.test(name)) continue;
    await chrome.cdp("Emulation.setDeviceMetricsOverride", { width:w, height:h, deviceScaleFactor:1, mobile:false });
    const t0 = Date.now();
    await chrome.load(`${BASE}/float/art?${q}`, { timeout:60000 });
    const ok = await chrome.until("document.body.dataset.ready === '1'", { timeout:90000, every:250 });
    if (!ok) errors.push(`${name}: never ready`);
    await new Promise(r => setTimeout(r, 600));
    const file = await chrome.screenshot(path.join(OUT, `${name}.png`));
    console.log(`${file}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  await chrome.close();
  await server.close();
}
if (errors.length) { console.error(errors.map(e => `  ${e}`).join("\n")); process.exitCode = 1; }
