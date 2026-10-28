/* Float's screen, moment by moment, as PNGs: the real FloatScreen on the
   mock (float/client/screen/mockNet.js: a scripted Cup in the tab,
   ?mock=1&shot=<moment>&freeze=1; the moments are its MOCK_SHOTS)
   at 1920 x 1080 in headless Chrome, from its own Vite server (no Worker,
   no Durable Object, nothing left running after).

     node scripts/float-shots.mjs                      every moment
     node scripts/float-shots.mjs practice drink       just those
       --out <dir>        default .impeccable/review/float
       --quality <tier>   high (default) | medium | low | lowest
       --size <w>x<h>     the window (default 1920x1080; the stage letterboxes)
       --query <a=b&c=d>  more of the page's query (n=9, seed=4, drinking=0)
       --wait <ms>        extra settle time before each capture (default 600)
       --gpu              a real GPU (ANGLE D3D11) instead of SwiftShader, for frame rates
       --live <ms>        let the clock run that long after the jump (no freeze), e.g. for fps
       --low-power        ask WebGL for the low-power (integrated) GPU, with --gpu
       --real <base>      a real room on a running dev server: Start with bots, a shot every --every ms
                          (--room test, --bots 12, --every 8000, --for 420000), into <out>/real
       --eval <file>      run that expression in the page after each shot and print it
       --luid <hi,lo>     with --gpu: that adapter (HKLM\SOFTWARE\Microsoft\DirectX\{...}\AdapterLuid; "0,70294")

   Prints each PNG's path with the screen's frame rate.
   FLOAT_SHOTS_PORT overrides the port (5183); CHROME the browser. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchChrome, CHROME_PATH } from "./headless-chrome.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(["--out", "--quality", "--wait", "--live", "--luid", "--real", "--room", "--every", "--for", "--bots", "--eval", "--size", "--query"]);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((arg, i) => !arg.startsWith("--") && !flags.has(args[i - 1]));
const OUT = path.resolve(ROOT, value("--out") || ".impeccable/review/float");
const QUALITY = value("--quality") || "high";
const WAIT = Number(value("--wait") ?? 600);
const LIVE = value("--live") ? Number(value("--live")) : null;
const GPU = args.includes("--gpu");
const [WIDTH, HEIGHT] = (value("--size") || "1920x1080").split("x").map(Number);
const EXTRA = new URLSearchParams(value("--query") || "");
const SHOTS = positional.length ? positional
  : ["lobby", "fdlobby", "intro", "card", "count", "practice", "go", "play", "hey", "drink", "late", "outro", "cut", "cutout", "cutnext",
    "rock", "spin", "sign", "final", "drop", "finalcut", "podium", "feedback"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* Float's pages, as the dev server routes them */
const floatPages = {
  name:"float-shots-pages",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://shots.local");
      if (url.pathname === "/float" || url.pathname === "/float/") req.url = `/float.html${url.search}`;
      if (url.pathname.startsWith("/api/") || url.pathname === "/ws" || url.pathname.startsWith("/float/ws")) {
        res.statusCode = 404; res.end("{}"); return;
      }
      next();
    });
  },
};
const server = await createServer({
  root:ROOT, configFile:false, logLevel:"error", clearScreen:false,
  plugins:[floatPages, react()],
  define:{ __FD_BUILD_ID__:JSON.stringify("float-shots") },
  cacheDir:path.join(ROOT, "node_modules/.vite-float-shots"),
  server:{ port:Number(process.env.FLOAT_SHOTS_PORT || 5183), strictPort:false, host:"127.0.0.1", hmr:false },
  optimizeDeps:{ entries:["float.html"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;

/* a GPU-backed browser, for frame rates (SwiftShader's say nothing about a laptop) */
async function launchGpu({ width, height }) {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "float-gpu-"));
  const chrome = spawn(CHROME_PATH, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${udd}`, "--hide-scrollbars", "--mute-audio",
    "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
    ...(value("--luid") ? [`--use-adapter-luid=${value("--luid")}`] : []),
    "--no-first-run", "--no-default-browser-check", "--force-color-profile=srgb", `--window-size=${width},${height}`, "about:blank"], { stdio:"ignore" });
  let port;
  for (let i = 0; i < 200 && !port; i++) { await sleep(100); try { port = fs.readFileSync(path.join(udd, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
  if (!port) { chrome.kill(); throw new Error("Chrome did not start"); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const waits = new Map(), listeners = new Set();
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    if (m.method) listeners.forEach(fn => fn(m));
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waits.set(n, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id:n, method, params }));
  });
  const evaluate = async expression => {
    const r = await cdp("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:false });
  return {
    cdp, evaluate,
    on:fn => { listeners.add(fn); return () => listeners.delete(fn); },
    load:async (url, { timeout = 20000 } = {}) => {
      const loaded = new Promise(resolve => { const on = m => { if (m.method === "Page.loadEventFired") { listeners.delete(on); resolve(); } }; listeners.add(on); });
      await cdp("Page.navigate", { url });
      await Promise.race([loaded, sleep(timeout)]);
    },
    until:async (expression, { timeout = 15000, every = 100 } = {}) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { try { if (await evaluate(expression)) return true; } catch {} await sleep(every); }
      return false;
    },
    screenshot:async file => {
      const { data } = await cdp("Page.captureScreenshot", { format:"png" });
      fs.mkdirSync(path.dirname(file), { recursive:true });
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      return file;
    },
    close:async () => { try { ws.close(); } catch {} try { chrome.kill(); } catch {} await sleep(400); try { fs.rmSync(udd, { recursive:true, force:true }); } catch {} },
  };
}

const chrome = GPU ? await launchGpu({ width:WIDTH, height:HEIGHT }) : await launchChrome({ width:WIDTH, height:HEIGHT });
const errors = [];
chrome.on(m => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n").slice(0, 3).join(" | ")
    || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
});

const results = [];
/* --real <base>: a real room on a running dev server (npm run dev -- --port 5182):
   open /float?room=<--room>, add bots, Start, and take a shot every --every ms for --for ms */
const REAL = value("--real");
if (REAL) {
  const roomId = value("--room") || "test";
  const every = Number(value("--every") || 8000), total = Number(value("--for") || 420000);
  const bots = Number(value("--bots") || 12);
  try {
    await chrome.load(`${REAL.replace(/\/$/, "")}/float?room=${roomId}&quality=${QUALITY}`, { timeout:60000 });
    if (!await chrome.until("document.body.dataset.ready === '1'", { timeout:90000, every:250 })) throw new Error("the screen never drew");
    for (const type of ["mousePressed", "mouseReleased"]) await chrome.cdp("Input.dispatchMouseEvent", { type, x:960, y:540, button:"left", clickCount:1 });
    await chrome.evaluate(`(async () => {
      const plus = document.querySelector('[aria-label="More bots"]'), minus = document.querySelector('[aria-label="Fewer bots"]');
      for (let k = 0; k < 20 && minus && !minus.disabled; k++) { minus.click(); await new Promise(r => setTimeout(r, 30)); }
      for (let k = 0; k < ${bots} && plus && !plus.disabled; k++) { plus.click(); await new Promise(r => setTimeout(r, 30)); }
      await new Promise(r => setTimeout(r, 100));
      document.querySelector(".fs-start")?.click();
    })()`);
    const end = Date.now() + total;
    for (let n = 0; Date.now() < end; n++) {
      await sleep(every);
      const phase = await chrome.evaluate("document.querySelector('.fs-root')?.dataset.phase || 'none'");
      const file = await chrome.screenshot(path.join(OUT, "real", `${String(n).padStart(3, "0")}-${phase}.png`));
      const stats = await chrome.evaluate("window.__floatStats || null");
      console.log(`${path.relative(ROOT, file)}  ${stats ? `fps ${stats.fps} tier ${stats.tier}` : ""}`);
      if (phase === "feedback" && n > 3) break;
    }
  } finally { await chrome.close(); await server.close(); }
  if (errors.length) { console.error([...new Set(errors)].map(e => `  ${e}`).join("\n")); process.exitCode = 1; }
  process.exit();
}
try {
  for (const shot of SHOTS) {
    const query = new URLSearchParams({ mock:"1", room:"bcdf", shot, quality:QUALITY });
    if (LIVE === null) query.set("freeze", "1");
    for (const [k, v] of EXTRA) query.set(k, v);
    await chrome.load(`${BASE}/float.html?${query}`, { timeout:60000 });
    const ok = await chrome.until("document.body.dataset.ready === '1'", { timeout:90000, every:250 });
    if (!ok) { console.error(`${shot}: never ready`); continue; }
    /* a click, as the room's host would make: sound unlocks and its prompt goes */
    if (!args.includes("--no-click")) {
      for (const type of ["mousePressed", "mouseReleased"]) await chrome.cdp("Input.dispatchMouseEvent", { type, x:960, y:540, button:"left", clickCount:1 });
    }
    const frames0 = await chrome.evaluate("window.__floatFrames || 0");
    await chrome.until(`(window.__floatFrames || 0) >= ${frames0 + 6}`, { timeout:60000, every:150 });
    await sleep(LIVE ?? WAIT);
    const tag = [...EXTRA].map(([k, v]) => `${k}${v}`).join("-");
    const file = await chrome.screenshot(path.join(OUT, `${shot}${tag ? `-${tag}` : ""}${QUALITY !== "high" ? `-${QUALITY}` : ""}${WIDTH !== 1920 || HEIGHT !== 1080 ? `-${WIDTH}x${HEIGHT}` : ""}.png`));
    const stats = await chrome.evaluate("window.__floatStats || null");
    if (value("--eval")) console.log(`${shot} eval:`, await chrome.evaluate(fs.readFileSync(path.resolve(value("--eval")), "utf8")));
    results.push({ shot, file, stats });
    console.log(`${path.relative(ROOT, file)}  ${stats ? `fps ${stats.fps} tier ${stats.tier}` : ""}`);
  }
} finally {
  await chrome.close();
  await server.close();
}
if (errors.length) { console.error([...new Set(errors)].map(e => `  ${e}`).join("\n")); process.exitCode = 1; }
