/* Float's art as PNGs (float/client/art): the /float/art showcase at
   1920 x 1080 in headless Chrome, each shot a URL of the page frozen at a
   time, on its own Vite server (no Worker, no state, its own port).

     node scripts/float-art-shots.mjs                 every shot
     node scripts/float-art-shots.mjs --only pose     shots whose name matches
     node scripts/float-art-shots.mjs --out <dir>     default .impeccable/review/float-art
     node scripts/float-art-shots.mjs --list          the shot names
   FLOAT_ART_PORT the server port (5186). CHROME=<path> overrides the browser.
   Prints each PNG's path and the page's own stats (draw calls, triangles). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchChrome } from "./headless-chrome.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(ROOT, value("--out") || ".impeccable/review/float-art");
const ONLY = value("--only") ? new RegExp(value("--only")) : null;
const PORT = Number(process.env.FLOAT_ART_PORT || 5186);

const q = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
export const SHOTS = [
  ["lineup-night", { view: "lineup", t: 2.2, freeze: 1 }],
  ["lineup-studio", { view: "lineup", stage: "studio", t: 2.2, freeze: 1 }],
  ["detail-capybara", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", t: 1.2, freeze: 1, yaw: 0.35, hud: 0 }],
  ["detail-javelina", { view: "detail", critter: "javelina", floatie: "donut", hat: "none", t: 1.4, freeze: 1, yaw: -0.4, hud: 0 }],
  ["detail-roadrunner", { view: "detail", critter: "roadrunner", floatie: "flamingo", hat: "none", t: 1.6, freeze: 1, yaw: 0.5, hud: 0 }],
  ["detail-frog", { view: "detail", critter: "frog", floatie: "shark", hat: "none", t: 1.8, freeze: 1, yaw: -0.3, hud: 0 }],
  ["detail-frog-studio", { view: "detail", critter: "frog", floatie: "shark", hat: "none", stage: "studio", t: 1.8, freeze: 1, yaw: 0.6, hud: 0 }],
  ["detail-back", { view: "detail", critter: "roadrunner", floatie: "shark", hat: "none", t: 1.1, freeze: 1, yaw: 2.6, hud: 0 }],
  ["faces", { view: "faces", stage: "studio", t: 0.6, freeze: 1 }],
  ["faces-night", { view: "faces", t: 0.6, freeze: 1, yaw: -0.4 }],
  ["faces-back", { view: "faces", stage: "studio", t: 0.6, freeze: 1, yaw: 2.6 }],
  ["floaties", { view: "floaties", t: 1.5, freeze: 1 }],
  ["floaties-studio", { view: "floaties", stage: "studio", t: 1.5, freeze: 1 }],
  ["states", { view: "states", t: 1.15, freeze: 1 }],
  ["poses-a", { view: "poses", t: 0.9, freeze: 1 }],
  ["poses-b", { view: "poses", t: 1.75, freeze: 1 }],
  ["wardrobe", { view: "wardrobe", t: 1.2, freeze: 1 }],
  ["wardrobe-studio", { view: "wardrobe", stage: "studio", t: 1.2, freeze: 1 }],
  ["medallion", { view: "medallion", t: 0.8, freeze: 1, hud: 0 }],
  ["portraits", { view: "portraits" }],
  ["pack", { view: "race", t: 2.0, freeze: 1 }],
];

if (args.includes("--list")) { SHOTS.forEach(([name, o]) => console.log(name.padEnd(22), q(o))); process.exit(0); }

/* the art page at /float/art, as Vite would serve float/art.html */
const floatArtRoute = {
  name: "float-art-route",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://art.local");
      if (url.pathname === "/float/art" || url.pathname === "/float/art/") req.url = `/float/art.html${url.search}`;
      next();
    });
  },
};
const server = await createServer({
  root: ROOT, configFile: false, logLevel: "error", clearScreen: false,
  plugins: [floatArtRoute, react()],
  cacheDir: path.join(ROOT, "node_modules/.vite-float-art"),
  server: { port: PORT, strictPort: false, host: "127.0.0.1", hmr: false },
  optimizeDeps: { entries: ["float/client/main.jsx", "float/client/art/ArtApp.jsx"], include: ["three", "react", "react-dom/client"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;
const chrome = await launchChrome({ width: 1920, height: 1080 });
const errors = [];
chrome.on(m => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
});
const shots = [];
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, o] of SHOTS) {
    if (ONLY && !ONLY.test(name)) continue;
    const t0 = Date.now();
    await chrome.load(`${BASE}/float/art?${q(o)}`, { timeout: 120000 });
    const ok = await chrome.until("document.body.dataset.ready === '1'", { timeout: 180000, every: 250 });
    if (!ok) errors.push(`${name}: never ready`);
    const stats = await chrome.evaluate("window.__floatArt ? JSON.stringify(window.__floatArt.stats()) : ''").catch(() => "");
    const file = await chrome.screenshot(path.join(OUT, `${name}.png`));
    shots.push(file);
    console.log(`${path.relative(ROOT, file)}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${stats}`);
  }
} finally {
  await chrome.close();
  await server.close();
}
if (errors.length) { console.error(errors.map(e => `  ${e}`).join("\n")); process.exitCode = 1; }
