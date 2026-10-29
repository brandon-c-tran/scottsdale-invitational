/* Float Groove looks, rendered by the REAL art module (riderSprites,
   riderPortrait) in headless Chrome: /float/art?view=fit, every critter in
   every pose with a hat and glasses, plain and in the photo tee, then the
   portrait. One PNG per sheet, the whole page.

     node scripts/float-art-fit.mjs                         every hat (with no glasses) and every pair (with no hat)
     node scripts/float-art-fit.mjs --sheet hat=cowboy,shades=aviators,tee=0,dots=1 [--sheet ...]
     node scripts/float-art-fit.mjs --out <dir>             default .scratch/float-fit
     node scripts/float-art-fit.mjs --review                the review set in .impeccable/review/float-looks
   FLOAT_ART_PORT the server port (5191). CHROME=<path> overrides the browser. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchChrome } from "./headless-chrome.mjs";
import { HATS, SHADES } from "../float/shared/looks.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const values = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const REVIEW = args.includes("--review");
const OUT = path.resolve(ROOT, values("--out")[0] || (REVIEW ? ".impeccable/review/float-looks" : ".scratch/float-fit"));
const PORT = Number(process.env.FLOAT_ART_PORT || 5191);
const hatIds = HATS.filter(h => h.id !== "none" && !h.retired).map(h => h.id);
const shadeIds = SHADES.filter(s => s.id !== "none" && !s.retired).map(s => s.id);

const parse = s => Object.fromEntries(s.split("&").map(kv => kv.split("=")));
let sheets = values("--sheet").map(parse);
if (!sheets.length && REVIEW) {
  sheets = [
    ...hatIds.map(hat => ({ hat, shades:"none", tee:"0", poses:"idle", name:`hat-${hat}` })),
    ...shadeIds.map(shades => ({ hat:"none", shades, tee:"0", poses:"idle", name:`shades-${shades}` })),
    { hat:"cowboy", shades:"round", tee:"1", ids:"capybara,roadrunner,gila,bighorn,frog,winnie", name:"poses-tee-a" },
    { hat:"froggy", shades:"hearts", tee:"1", ids:"javelina,jackrabbit,tortoise,quail,coyote,otter", name:"poses-tee-b" },
    { hat:"beanie", shades:"pixel", tee:"0", name:"poses-plain-all" },
  ];
}
if (!sheets.length) sheets = [...hatIds.map(hat => ({ hat, shades:"none" })), ...shadeIds.map(shades => ({ hat:"none", shades }))];

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
  cacheDir:path.join(ROOT, "node_modules/.vite-float-fit"),
  server:{ port:PORT, strictPort:false, host:"127.0.0.1", hmr:false },
  optimizeDeps:{ entries:["float/client/art/ArtApp.jsx"], include:["react", "react-dom/client"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;
const chrome = await launchChrome({ width:1400, height:1000 });
const errors = [];
chrome.on(m => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
});
try {
  fs.mkdirSync(OUT, { recursive:true });
  for (const sheet of sheets) {
    const { name, ...params } = sheet;
    const qs = new URLSearchParams({ view:"fit", freeze:"1", ...params }).toString();
    await chrome.resize(1400, 1000);
    await chrome.load(`${BASE}/float/art?${qs}`, { timeout:120000 });
    await chrome.until("document.body.dataset.ready === '1' && document.body.dataset.looks === '1'", { timeout:180000, every:250 });
    await new Promise(r => setTimeout(r, 400));
    const [w, h] = await chrome.evaluate("(() => { const s = document.querySelector('.fa2-sheet'); const r = s.getBoundingClientRect(); return [Math.ceil(r.right + 24), Math.ceil(r.bottom + 24)]; })()");
    await chrome.resize(Math.max(400, w), Math.max(300, h));
    await new Promise(r => setTimeout(r, 300));
    const file = path.join(OUT, `${name || Object.entries(params).map(([k, v]) => `${k}-${v}`).join("_")}.png`);
    await chrome.screenshot(file);
    console.log(path.relative(ROOT, file));
  }
} finally {
  await chrome.close();
  await server.close();
}
if (errors.length) console.log("page errors:\n" + [...new Set(errors)].join("\n"));
