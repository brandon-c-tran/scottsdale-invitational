/* Float's art as PNGs (float/client/art): the /float/art showcase at
   1920 x 1080 in headless Chrome, each shot a URL of the page frozen at a
   time, on its own Vite server (no Worker, no state, its own port).

     node scripts/float-art-shots.mjs                 every shot
     node scripts/float-art-shots.mjs --only pose     shots whose name matches
     node scripts/float-art-shots.mjs --out <dir>     default .impeccable/review/float-art
     node scripts/float-art-shots.mjs --list          the shot names
     node scripts/float-art-shots.mjs --gpu           this machine's GPU instead of the software renderer (fast)
     node scripts/float-art-shots.mjs --perf [--low-power]   the pack live on the GPU (the integrated one)
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
  ["detail-ui", { view: "detail", critter: "coyote", floatie: "donut", hat: "cowboy", shades: "aviators", t: 1.4, freeze: 1, yaw: 0.4, photo: 1 }],
  ["detail-capybara", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", t: 1.2, freeze: 1, yaw: 0.35, hud: 0 }],
  ["detail-javelina", { view: "detail", critter: "javelina", floatie: "donut", hat: "none", t: 1.4, freeze: 1, yaw: -0.4, hud: 0 }],
  ["detail-roadrunner", { view: "detail", critter: "roadrunner", floatie: "flamingo", hat: "none", t: 1.6, freeze: 1, yaw: 0.5, hud: 0 }],
  ["detail-frog", { view: "detail", critter: "frog", floatie: "shark", hat: "none", t: 1.8, freeze: 1, yaw: -0.3, hud: 0 }],
  ["detail-frog-studio", { view: "detail", critter: "frog", floatie: "shark", hat: "none", stage: "studio", t: 1.8, freeze: 1, yaw: 0.6, hud: 0 }],
  ["detail-pizza", { view: "detail", critter: "otter", floatie: "pizza", hat: "captain", t: 1.3, freeze: 1, yaw: 0.6, hud: 0 }],
  ["detail-lounge", { view: "detail", critter: "capybara", floatie: "lounge", hat: "bucket", shades: "aviators", t: 1.3, freeze: 1, yaw: 0.7, hud: 0 }],
  ["detail-cooler", { view: "detail", critter: "armadillo", floatie: "cooler", hat: "party", t: 1.3, freeze: 1, yaw: -0.6, hud: 0 }],
  ["detail-unicorn", { view: "detail", critter: "quail", floatie: "unicorn", hat: "flowers", shades: "hearts", t: 1.3, freeze: 1, yaw: 0.5, hud: 0 }],
  ["detail-frog-wear", { view: "detail", critter: "frog", floatie: "flamingo", hat: "visor", shades: "hearts", t: 1.1, freeze: 1, yaw: 0.35, hud: 0, zoom: 1 }],
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
  ["chips", { view: "chips", stage: "studio", t: 0.4, freeze: 1 }],
  ["anim-paddle", { view: "detail", critter: "otter", floatie: "classic", hat: "none", state: "paddle", t: 1.3, freeze: 1, yaw: 0.45, hud: 0 }],
  ["anim-paddle-b", { view: "detail", critter: "otter", floatie: "classic", hat: "none", state: "paddle", t: 1.42, freeze: 1, yaw: 0.45, hud: 0 }],
  ["anim-drink", { view: "detail", critter: "coyote", floatie: "classic", hat: "none", state: "drink", t: 1.6, freeze: 1, yaw: 0.5, hud: 0 }],
  ["anim-swim", { view: "detail", critter: "frog", floatie: "donut", hat: "none", state: "swim", t: 2.2, freeze: 1, yaw: 0.2, hud: 0 }],
  ["anim-sad", { view: "detail", critter: "jackrabbit", floatie: "classic", hat: "none", state: "sad", t: 1.8, freeze: 1, yaw: 0.4, hud: 0 }],
  ["anim-celebrate", { view: "detail", critter: "quail", floatie: "classic", hat: "none", state: "celebrate", t: 1.3, freeze: 1, yaw: 0.3, hud: 0 }],
  ["anim-wave", { view: "detail", critter: "jackrabbit", floatie: "classic", hat: "none", state: "idle", t: 11.45, freeze: 1, yaw: 0.3, hud: 0 }],
  ["pose-flex", { view: "detail", critter: "bighorn", floatie: "classic", hat: "none", pose: "flex", t: 0.75, freeze: 1, yaw: 0.3, hud: 0 }],
  ["pose-chug", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", pose: "chug", t: 1.2, freeze: 1, yaw: 0.45, hud: 0 }],
  ["pose-airguitar", { view: "detail", critter: "javelina", floatie: "classic", hat: "none", pose: "airguitar", t: 0.95, freeze: 1, yaw: 0.3, hud: 0 }],
  ["pose-backflip", { view: "detail", critter: "gila", floatie: "classic", hat: "none", pose: "backflip", t: 0.82, freeze: 1, yaw: 0.9, hud: 0 }],
  ["portraits", { view: "portraits" }],
  ["debug-ao", { view: "faces", stage: "studio", t: 0.6, freeze: 1, debug: 1, fur: 0 }],
  ["debug-normal", { view: "faces", stage: "studio", t: 0.6, freeze: 1, debug: 2, fur: 0 }],
  ["debug-color", { view: "faces", stage: "studio", t: 0.6, freeze: 1, debug: 3, fur: 0 }],
  ["debug-fur", { view: "faces", stage: "studio", t: 0.6, freeze: 1, debug: 4, fur: 0 }],
  ["faces-bare", { view: "faces", stage: "studio", t: 0.6, freeze: 1, fur: 0 }],
  ...["capybara", "javelina", "roadrunner", "jackrabbit", "tortoise", "gila", "hornedlizard", "bighorn", "quail", "armadillo", "coyote", "otter", "frog"]
    .map(critter => [`turn-${critter}`, { view: "turn", critter, stage: "studio", t: 0.6, freeze: 1, hud: 0 }]),
  ...["cowboy", "bucket", "visor", "captain", "party", "flowers", "crown"].map(hat => [`fit-${hat}`, { view: "fit", hat, stage: "studio", t: 0.6, freeze: 1, hud: 0 }]),
  ...["aviators", "hearts", "stars", "goggles"].map(shades => [`fit-${shades}`, { view: "fit", shades, stage: "studio", t: 0.6, freeze: 1, hud: 0, yaw: 0.2 }]),
  ["compare", { view: "compare", stage: "studio", t: 0.6, freeze: 1 }],
  ["compare-1", { view: "compare", stage: "studio", t: 0.6, freeze: 1, list: "capybara,javelina,roadrunner,jackrabbit" }],
  ["compare-2", { view: "compare", stage: "studio", t: 0.6, freeze: 1, list: "tortoise,gila,hornedlizard,bighorn,quail" }],
  ["compare-3", { view: "compare", stage: "studio", t: 0.6, freeze: 1, list: "armadillo,coyote,otter,frog" }],
  ["compare-screen-1", { view: "compare", stage: "screen", t: 0.6, freeze: 1, list: "capybara,javelina,roadrunner,jackrabbit" }],
  ["compare-screen-2", { view: "compare", stage: "screen", t: 0.6, freeze: 1, list: "tortoise,gila,hornedlizard,bighorn,quail" }],
  ["compare-screen-3", { view: "compare", stage: "screen", t: 0.6, freeze: 1, list: "armadillo,coyote,otter,frog" }],
  ["zoom-capybara", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", stage: "screen", t: 1.2, freeze: 1, yaw: 0.5, hud: 0, zoom: 1 }],
  ["zoom-javelina", { view: "detail", critter: "javelina", floatie: "classic", hat: "none", stage: "screen", t: 1.2, freeze: 1, yaw: 0.4, hud: 0, zoom: 1 }],
  ["zoom-frog", { view: "detail", critter: "frog", floatie: "classic", hat: "none", stage: "screen", t: 1.2, freeze: 1, yaw: 0.4, hud: 0, zoom: 1 }],
  ["zoom-capybara-fur", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", stage: "screen", t: 1.2, freeze: 1, yaw: 0.5, hud: 0, zoom: 1, debug: 4 }],
  ["zoom-capybara-color", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", stage: "screen", t: 1.2, freeze: 1, yaw: 0.5, hud: 0, zoom: 1, debug: 3, fur: 0 }],
  ["compare-screen", { view: "compare", stage: "screen", t: 0.6, freeze: 1 }],
  ["lineup-screen", { view: "lineup", stage: "screen", t: 2.2, freeze: 1 }],
  ["detail-capybara-screen", { view: "detail", critter: "capybara", floatie: "classic", hat: "none", stage: "screen", t: 1.2, freeze: 1, yaw: -0.3, hud: 0 }],
  ["detail-javelina-screen", { view: "detail", critter: "javelina", floatie: "donut", hat: "none", stage: "screen", t: 1.4, freeze: 1, yaw: -0.4, hud: 0 }],
  ["detail-frog-screen", { view: "detail", critter: "frog", floatie: "shark", hat: "none", stage: "screen", t: 1.8, freeze: 1, yaw: -0.3, hud: 0 }],
  ["compare-night", { view: "compare", t: 0.6, freeze: 1 }],
  ["pack", { view: "race", t: 2.0, freeze: 1 }],
];

/* headless Chrome on the real GPU (the same interface as launchChrome) */
async function launchGpuChrome({ width = 1920, height = 1080, lowPower = false } = {}) {
  const { spawn } = await import("node:child_process");
  const os = await import("node:os");
  const exe = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "float-gpu-"));
  const flags = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${udd}`, "--ignore-gpu-blocklist", "--enable-gpu", "--hide-scrollbars",
    "--mute-audio", "--no-first-run", "--no-default-browser-check", "--force-color-profile=srgb", "--disable-frame-rate-limit", `--window-size=${width},${height}`];
  if (lowPower) flags.push("--force_low_power_gpu");
  const proc = spawn(exe, [...flags, "about:blank"], { stdio: "ignore" });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let port;
  for (let i = 0; i < 200 && !port; i++) { await sleep(100); try { port = fs.readFileSync(path.join(udd, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]; } catch {} }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waits = new Map(); const listeners = new Set();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } if (m.method) listeners.forEach(fn => fn(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => { const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const load = async (url, { timeout = 20000 } = {}) => {
    const loaded = new Promise(r => { const on = m => { if (m.method === "Page.loadEventFired") { listeners.delete(on); r(); } }; listeners.add(on); });
    await cdp("Page.navigate", { url });
    await Promise.race([loaded, sleep(timeout)]);
  };
  const until = async (expression, { timeout = 15000, every = 100 } = {}) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await evaluate(expression)) return true; } catch {} await sleep(every); } return false; };
  const screenshot = async file => { const { data } = await cdp("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(data, "base64")); return file; };
  return { cdp, evaluate, load, until, screenshot, on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    close: async () => { try { ws.close(); } catch {} try { proc.kill(); } catch {} await sleep(400); try { fs.rmSync(udd, { recursive: true, force: true }); } catch {} } };
}

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

/* --perf: the 13-rider pack live on this machine's GPU (not the software
   renderer the shots use), sampled for a few seconds */
if (args.includes("--perf")) {
  const { spawn } = await import("node:child_process");
  const os = await import("node:os");
  const exe = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(p => fs.existsSync(p));
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "float-perf-"));
  const proc = spawn(exe, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${udd}`, "--ignore-gpu-blocklist", "--enable-gpu",
    "--disable-frame-rate-limit", "--no-first-run", "--window-size=1920,1080", "about:blank"], { stdio: "ignore" });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let port;
  for (let i = 0; i < 200 && !port; i++) { await sleep(100); try { port = fs.readFileSync(path.join(udd, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const waits = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
    const cdp = (method, params = {}) => new Promise(res => { const i = ++id; waits.set(i, m => res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expression => (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await cdp("Page.navigate", { url: `${BASE}/float/art?view=race` });
    for (let i = 0; i < 120 && (await ev("document.body && document.body.dataset.ready")) !== "1"; i++) await sleep(500);
    await sleep(4000);
    const gpu = await ev("(() => { const c = document.querySelector('canvas.fa-gl'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()");
    const samples = [];
    for (let i = 0; i < 6; i++) { await sleep(1000); samples.push(JSON.parse(await ev("JSON.stringify(window.__floatArt.stats())"))); }
    const fps = samples.map(s => s.fps);
    console.log(JSON.stringify({ gpu, fps, calls: samples.at(-1).calls, triangles: samples.at(-1).triangles, riders: samples.at(-1).riders }));
    ws.close();
  } finally {
    proc.kill(); await sleep(400); try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
    await server.close();
  }
  process.exit(0);
}

const chrome = args.includes("--gpu") ? await launchGpuChrome({ width: 1920, height: 1080 }) : await launchChrome({ width: 1920, height: 1080 });
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
