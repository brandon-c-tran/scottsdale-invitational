/* A bit played LIVE on the real TV, against the same bit frozen at the
   same instant: the gags rehearsal (/dev/gags-preview.html, a QA test of
   the bit, its cast from the board) in headless Chrome. Frozen frames
   once hid a live-only bug (a one-shot switch resting on its first value
   once it finished: tests/stepped-fill.test.mjs), so a bit is looked at
   both ways.

   For each instant: the page loads with the bit due to start a few
   seconds on (the rehearsal's &in, so the TV has settled) and plays it
   in real time; at the instant every animation on the page is paused
   where it stands (the live state, finished animations included) and
   the TV is shot. Then the page loads frozen at that exact instant (the
   rehearsal's &t &pause) and is shot. The two land side by side in one
   PNG, live on the left.

     node scripts/bit-live.mjs dominoes 1200 2600 4400
       --out <dir>    default .impeccable/review/bits/live
       --single       also keep each live and frozen frame whole
       --cast <key>   the test cast as doubles: 2v2, 2v1, 1v2 or pair
   BIT_LIVE_PORT the server's port (default 5241; never 5173). Prints each
   PNG's path and the instant each was caught at. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchChrome } from "./headless-chrome.mjs";
import { standInGeo, standInPhoto } from "../dev/fit/standins.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((arg, i) => !arg.startsWith("--") && !["--out", "--cast"].includes(args[i - 1]));
const CAST = value("--cast");
const [bit, ...times] = positional;
const NAME = `${bit}${CAST ? `-${CAST}` : ""}`;
if (!bit || !times.length) { console.error("usage: node scripts/bit-live.mjs <bit> <ms...> [--out dir] [--single] [--cast 2v2]"); process.exit(2); }
const OUT = path.resolve(ROOT, value("--out") || ".impeccable/review/bits/live");
const SINGLE = args.includes("--single");
const PORT = Number(process.env.BIT_LIVE_PORT || 5241);
if (PORT === 5173) throw new Error("5173 is the dev server's");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* the fit audit's server: the in-memory transport, stand-in photos */
const plugin = {
  name:"fd-bit-live", enforce:"pre",
  async resolveId(source, importer, options) {
    if (!/lib[\\/]client(\.js)?$/.test(source) || !importer) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf:true });
    if (resolved && /src[\\/]lib[\\/]client\.js$/.test(resolved.id)) return path.join(ROOT, "dev/fit/client.js");
    return null;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, "http://live.local");
      const photo = /^\/api\/photo\/([^/]+)$/.exec(url.pathname) || /^\/api\/moments\/([^/]+)/.exec(url.pathname);
      const geo = /^\/api\/(?:geo|trivia)\/photo\/([^/]+)$/.exec(url.pathname);
      if (photo || geo) {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(photo ? standInPhoto(decodeURIComponent(photo[1])) : standInGeo(geo[1]));
        return;
      }
      if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
        res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end("{\"ok\":false}"); return;
      }
      const page = /^\/dev\/([\w-]+\.html)$/.exec(url.pathname)?.[1];
      if (!page) return next();
      try {
        const html = await server.transformIndexHtml(req.url, fs.readFileSync(path.join(ROOT, "dev", page), "utf8"));
        res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html);
      } catch (error) { next(error); }
    });
  },
};
const server = await createServer({
  root:ROOT, configFile:false, logLevel:"error", clearScreen:false, plugins:[plugin, react()],
  define:{ __FD_BUILD_ID__:JSON.stringify("live") },
  cacheDir:process.env.BIT_LIVE_CACHE_DIR || path.join(ROOT, `node_modules/.vite-live-${PORT}`),
  server:{ port:PORT, strictPort:false, host:"127.0.0.1", hmr:false },
  optimizeDeps:{ entries:["dev/gags-preview.jsx"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;
const chrome = await launchChrome({ width:1920, height:1080 });
const errors = [];
chrome.on(m => {
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0]
    || m.params.exceptionDetails.text);
});

/* the bit's own clock on the page: the layer mounted --tl into the bit,
   and its lift-off (running from then to the bit's end) has been going
   currentTime since */
const CLOCK = `(() => { const layer = document.querySelector(".bit-layer"); if (!layer) return null;
  const anim = layer.getAnimations().find(a => a.animationName === "bit-out"); if (!anim) return null;
  return anim.currentTime - parseFloat(layer.style.getPropertyValue("--tl") || "0"); })()`;
/* every load its own URL, so a load is never the page already there */
let loads = 0;
const url = params => `${BASE}/dev/gags-preview.html?${new URLSearchParams({ bit, bare:"1", ...(CAST ? { cast:CAST } : {}), ...params,
  load:String(++loads) })}`;
/* a fresh page's bit (its clock still near its start), or a frozen one's */
const fresh = (limit = 900) => chrome.until(`(() => { const t = ${CLOCK}; return t !== null && t < ${limit}; })()`, { timeout:14000 });
/* Load until the TV is playing the bit. The TV skips a moment, never
   queues it, when something else holds the room as its window opens (a
   load can land on a face-off or the like), so a load that shows no bit
   is tried again. */
async function loadUntil(params, ready, { tries = 5, timeout = 8000 } = {}) {
  for (let i = 0; i < tries; i++) {
    await chrome.load(url(params), { timeout:Math.max(timeout, 20000) });
    if (await chrome.until(ready, { timeout })) return true;
  }
  await chrome.screenshot(path.join(OUT, `${bit}-fail.png`));
  throw new Error(`${bit}: no bit on the TV (${bit}-fail.png; ${errors.join("; ")})`);
}

try {
  fs.mkdirSync(OUT, { recursive:true });
  /* warm the server (the first load compiles everything) */
  await loadUntil({ t:"0" }, `!!document.querySelector(".bit-layer")`, { timeout:60000 });
  for (const target of times.map(Number).filter(Number.isFinite)) {
    /* live from the top, every animation stopped where it stands at the
       instant (a load whose bit is given up, or caught late, goes again) */
    let ms = null;
    for (let tries = 0; tries < 6 && ms === null; tries++) {
      await chrome.load(url({ in:"3500" }));
      if (!await fresh(target)) continue;
      for (let i = 0; i < 2000; i++) {
        const now = await chrome.evaluate(CLOCK);
        if (process.env.BIT_LIVE_TRACE) console.log(tries, i, now);
        if (now === null || now >= target - 12) break;
        await sleep(target - now > 250 ? 100 : 4);
      }
      const caught = await chrome.evaluate(`(() => { document.getAnimations().forEach(a => a.pause()); return ${CLOCK}; })()`);
      if (caught !== null && Math.abs(caught - target) <= 120) ms = Math.round(caught);
    }
    if (ms === null) {
      await chrome.screenshot(path.join(OUT, `${bit}-fail.png`));
      throw new Error(`${bit}: could not catch the bit live at ${target} ms (${bit}-fail.png)`);
    }
    await sleep(150);
    const live = path.join(OUT, `${NAME}-${target}-live.png`);
    await chrome.screenshot(live);
    /* then frozen at that instant: the rehearsal joins the bit there and
       holds it (its mount can land a few ms on, so the ask is nudged
       until the layer's --tl is within a frame or two) */
    let at = null;
    for (let ask = ms, tries = 0; tries < 4; tries++) {
      await loadUntil({ t:String(ask), pause:"1" },
        `(() => { const l = document.querySelector(".bit-layer"); return !!l && l.style.getPropertyValue("--tl") !== ""; })()`);
      await sleep(400);
      at = Math.round(await chrome.evaluate(`-parseFloat(document.querySelector(".bit-layer").style.getPropertyValue("--tl"))`));
      if (Math.abs(at - ms) <= 25) break;
      ask = Math.max(0, ask - (at - ms));
    }
    const frozen = path.join(OUT, `${NAME}-${target}-frozen.png`);
    await chrome.screenshot(frozen);
    /* side by side, live on the left */
    const pair = `<!doctype html><body style="margin:0;background:#000;display:flex;gap:8px">
      <figure style="margin:0;position:relative"><img src="${pathToFileURL(live).href}" width="956">
        <figcaption style="position:absolute;left:8px;bottom:8px;font:700 22px sans-serif;color:#fff;background:#000a;padding:2px 8px">LIVE ${ms} ms</figcaption></figure>
      <figure style="margin:0;position:relative"><img src="${pathToFileURL(frozen).href}" width="956">
        <figcaption style="position:absolute;left:8px;bottom:8px;font:700 22px sans-serif;color:#fff;background:#000a;padding:2px 8px">FROZEN ${at} ms</figcaption></figure></body>`;
    const pairHtml = path.join(OUT, `${NAME}-${target}-pair.html`);
    fs.writeFileSync(pairHtml, pair);
    await chrome.load(pathToFileURL(pairHtml).href);
    await sleep(300);
    const file = path.join(OUT, `${NAME}-${target}-pair.png`);
    await chrome.resize(1920, 538);
    await chrome.screenshot(file);
    await chrome.resize(1920, 1080);
    fs.rmSync(pairHtml, { force:true });
    if (!SINGLE) { fs.rmSync(live, { force:true }); fs.rmSync(frozen, { force:true }); }
    console.log(`${path.relative(ROOT, file)}  live ${ms} ms, frozen ${at} ms`);
  }
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
} finally {
  await chrome.close();
  await server.close();
}
