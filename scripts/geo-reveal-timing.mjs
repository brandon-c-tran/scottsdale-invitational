/* Where and When's TV reveal, timed: serves dev/geo-timing.html (the real
   TVMode over the real reducers, two photos guessed and revealed on a live
   clock) from its own Vite server with the in-memory transport, opens it in
   headless Chrome, and prints, per reveal, when the map was ready, when the
   reveal's beats began (the first pin is due 300 ms in), when the photo
   cover lifted, and the tiles still downloading while the pins dropped and
   the camera opened. MapLibre over OpenFreeMap's real tiles (no Google key
   locally), so it needs the network.

     node scripts/geo-reveal-timing.mjs [--runs 2] [--json]
   FIT_PORT sets the port (5197); CHROME the browser. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchChrome } from "./headless-chrome.mjs";
import { standInGeo, standInPhoto } from "../dev/fit/standins.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const RUNS = Number(value("--runs") || 2);
const PORT = Number(process.env.FIT_PORT || 5197);

const plugin = {
  name:"fd-geo-timing",
  enforce:"pre",
  async resolveId(source, importer, options) {
    if (!/lib[\\/]client(\.js)?$/.test(source) || !importer) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf:true });
    if (resolved && /src[\\/]lib[\\/]client\.js$/.test(resolved.id)) return path.join(ROOT, "dev/fit/client.js");
    return null;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, "http://timing.local");
      const photo = /^\/api\/photo\/([^/]+)$/.exec(url.pathname);
      const geo = /^\/api\/geo\/photo\/([^/]+)$/.exec(url.pathname);
      if (photo || geo) {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(photo ? standInPhoto(decodeURIComponent(photo[1])) : standInGeo(geo[1]));
        return;
      }
      if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
        res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end("{\"ok\":false}"); return;
      }
      if (url.pathname !== "/dev/geo-timing.html") return next();
      try {
        const html = await server.transformIndexHtml(req.url, fs.readFileSync(path.join(ROOT, "dev/geo-timing.html"), "utf8"));
        res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html);
      } catch (error) { next(error); }
    });
  },
};
const server = await createServer({
  root:ROOT, configFile:false, logLevel:"error", clearScreen:false, plugins:[plugin, react()],
  define:{ __FD_BUILD_ID__:JSON.stringify("timing") },
  cacheDir:process.env.FIT_CACHE_DIR || path.join(ROOT, "node_modules/.vite-geo-timing"),
  server:{ port:PORT, strictPort:false, host:"127.0.0.1", hmr:false },
  optimizeDeps:{ entries:["dev/geo-timing.jsx"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;

/* one reveal's numbers, ms from the reveal write */
function summarize(log, tiles, n) {
  const at = name => log.find(item => item.name === name)?.t ?? null;
  const t0 = at(`reveal:${n}`);
  const end = log.find(item => item.t > t0 && /^guess:/.test(item.name))?.t ?? Infinity;
  const within = item => item.t >= t0 && item.t < end;
  const first = (name, pred = () => true) => log.find(item => within(item) && item.name === name && pred(item))?.t ?? null;
  const rel = t => t === null ? null : t - t0;
  const pin = first("pin"), answer = first("pin", item => item.kind === "answer");
  const ease = log.find(item => within(item) && item.name === "map:easeTo");
  const easeEnd = ease ? ease.t + ease.ms : null;
  const idleAfter = t => t === null ? null : log.find(item => within(item) && item.name === "map:idle" && item.t >= t)?.t ?? null;
  const pending = t => tiles.filter(tile => tile.start >= t0 && tile.start <= t && tile.end > t).length;
  /* the last jump before the first pin: the reveal's start framing, and when its tiles were in */
  const jump = [...log].reverse().find(item => within(item) && item.name === "map:jumpTo" && item.t <= (pin ?? -Infinity));
  const loadedAt = Math.max(-Infinity, ...log.filter(item => item.name === "map:ready" && item.t < end).map(item => item.t));
  return {
    reveal:n,
    mapReady:Number.isFinite(loadedAt) ? loadedAt - t0 : null,
    coverOff:rel(first("cover:off")),
    startJump:jump ? rel(jump.t) : null,
    startTilesIn:jump ? rel(idleAfter(jump.t)) : null,
    firstPin:rel(pin),
    beatsStart:pin === null ? null : pin - t0 - 300,
    answerPin:rel(answer),
    cameraOpen:ease ? [rel(ease.t), rel(easeEnd)] : null,
    tilesAfterReveal:tiles.filter(tile => tile.start >= t0 && tile.start < end).length,
    tilesLoadingAtFirstPin:pin === null ? null : pending(pin),
    tilesFetchedDuringCamera:ease ? tiles.filter(tile => tile.start >= ease.t && tile.start <= easeEnd).length : null,
    tilesLoadingAtCameraEnd:easeEnd === null ? null : pending(easeEnd),
    lastTileDone:rel(Math.max(t0, ...tiles.filter(tile => tile.start >= t0 && tile.start < end).map(tile => tile.end))),
    idleAfterCamera:easeEnd === null ? null : rel(idleAfter(easeEnd)),
  };
}

const results = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const chrome = await launchChrome({ width:1920, height:1080 });
    try {
      await chrome.load(`${BASE}/dev/geo-timing.html`, { timeout:60000 });
      if (!await chrome.until("window.__DONE__ === true", { timeout:90000, every:250 })) throw new Error("the page never finished");
      /* tiles: each vector tile the map asked for (its dataloading) and when it was in (its data) */
      const { log, tiles } = await chrome.evaluate("({ log:window.__geoLog, tiles:window.__geoTiles })");
      const rows = [1, 2].map(n => ({ run:run + 1,
        ...summarize(log, tiles.map(tile => ({ ...tile, end:tile.end ?? Infinity })), n) }));
      results.push(...rows);
      if (args.includes("--log")) console.log(JSON.stringify(log));
    } finally { await chrome.close(); }
  }
  if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else console.table(results);
} finally {
  await server.close();
}
