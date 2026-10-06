/* The fit audit (npm run audit:fit): renders every TV scene at 1920x1080 and
   every phone view at 390x844 and 375x667, headless through the Chrome
   DevTools Protocol, over states built in memory by the real reducers
   (dev/fit/scenarios.js), and reports text that is clipped, truncated,
   outside the canvas or safe area, overlapping, covered by a dock, or too
   small (dev/fit/rules.js). Writes .impeccable/review/fit/report.{json,md},
   a screenshot per view and a crop per finding. Exits 1 on any finding that
   is not a documented exception (dev/fit/exceptions.js).

   Its own Vite server (no Worker, no Durable Object state, its own port),
   with the in-memory transport (dev/fit/client.js) in place of
   src/lib/client.js and stand-in photos. Nothing it starts outlives it.

     npm run audit:fit                      everything
     npm run audit:fit -- --only tv         the TV (or phone)
     npm run audit:fit -- --grep crown      views whose id matches
     npm run audit:fit -- --no-crops        skip the crops
   CHROME=<path> overrides the browser; FIT_PORT the server port (5197). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { collectFit } from "../dev/fit/collect.js";
import { findingsFor, failing, summarize } from "../dev/fit/rules.js";
import { FIT_EXCEPTIONS } from "../dev/fit/exceptions.js";
import { TV_SCENARIOS, PHONE_SCENARIOS, PHONE_TABS, PHONE_SIZES } from "../dev/fit/scenarios.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
/* FIT_OUT keeps a parallel run's report and shots apart */
const OUT = process.env.FIT_OUT ? path.resolve(process.env.FIT_OUT) : path.join(ROOT, ".impeccable/review/fit");
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ONLY = value("--only");
const GREP = value("--grep") ? new RegExp(value("--grep")) : null;
const CROPS = !flag("--no-crops");
/* --eval <file>: also run that expression in every view and print it (debugging a rule) */
const PROBE = value("--eval") ? fs.readFileSync(value("--eval"), "utf8") : null;
const PORT = Number(process.env.FIT_PORT || 5197);
const CHROME = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find(p => fs.existsSync(p));
/* reels' digit strips and drums are windows by design; screen-reader text is not on screen */
const IGNORE = ".fd-reel-strip, .fd-drum, .fd-reel-sizer, .sr-only, .fd-sr, .visually-hidden";
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── the server ── */
const PHOTO = (seed, label) => {
  const hue = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="hsl(${hue} 35% 42%)"/>`
    + `<circle cx="120" cy="96" r="52" fill="hsl(${hue} 30% 78%)"/><rect x="40" y="160" width="160" height="110" rx="70" fill="hsl(${hue} 30% 78%)"/>`
    + (label ? `<text x="120" y="230" font-size="20" text-anchor="middle" fill="#fff">${label}</text>` : "") + `</svg>`;
};
const GEO = id => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="#5b7fa3"/>`
  + `<rect y="700" width="1600" height="500" fill="#7a6a4f"/><circle cx="${300 + (id.length * 97) % 900}" cy="300" r="140" fill="#f1d27a"/></svg>`;
const fitPlugin = {
  name:"fd-fit-audit",
  enforce:"pre",
  async resolveId(source, importer, options) {
    if (!/lib[\\/]client(\.js)?$/.test(source) || !importer) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf:true });
    if (resolved && /src[\\/]lib[\\/]client\.js$/.test(resolved.id)) return path.join(ROOT, "dev/fit/client.js");
    return null;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, "http://fit.local");
      const photo = /^\/api\/photo\/([^/]+)$/.exec(url.pathname) || /^\/api\/moments\/([^/]+)/.exec(url.pathname);
      const geo = /^\/api\/(?:geo|trivia)\/photo\/([^/]+)$/.exec(url.pathname);
      if (photo || geo) {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(photo ? PHOTO(decodeURIComponent(photo[1])) : GEO(geo[1]));
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
  root:ROOT, configFile:false, logLevel:"error", clearScreen:false,
  plugins:[fitPlugin, react()],
  define:{ __FD_BUILD_ID__:JSON.stringify("fit") },
  /* FIT_CACHE_DIR keeps a parallel checkout off the shared cache */
  cacheDir:process.env.FIT_CACHE_DIR || path.join(ROOT, "node_modules/.vite-fit"),
  server:{ port:PORT, strictPort:false, host:"127.0.0.1", hmr:false },
  optimizeDeps:{ entries:["dev/fit-tv.jsx", "dev/fit-phone.jsx"] },
});
await server.listen();
const BASE = `http://127.0.0.1:${server.config.server.port}`;

/* ── the browser ── */
const udd = fs.mkdtempSync(path.join(os.tmpdir(), "fd-fit-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${udd}`, "--hide-scrollbars",
  "--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", "--no-default-browser-check",
  "--force-color-profile=srgb", "--window-size=1920,1080", "about:blank"], { stdio:"ignore" });
let cleaned = false;
async function cleanup() {
  if (cleaned) return; cleaned = true;
  try { chrome.kill(); } catch {}
  try { await server.close(); } catch {}
  await sleep(500);
  try { fs.rmSync(udd, { recursive:true, force:true }); } catch {}
}
process.on("SIGINT", () => cleanup().then(() => process.exit(130)));

let port;
for (let i = 0; i < 200 && !port; i++) {
  await sleep(100);
  try { port = fs.readFileSync(path.join(udd, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {}
}
if (!port) { console.error("Chrome did not start"); await cleanup(); process.exit(2); }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0;
const waits = new Map();
const pageErrors = [];
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    pageErrors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text);
};
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++nextId;
  waits.set(id, m => m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await cdp("Page.enable");
await cdp("Runtime.enable");
const COLLECT = `(${collectFit.toString()})`;

/* ── contrast at rest (advisory) ──
   Text against the background it actually sits on: the text color (its
   alpha and every ancestor's opacity folded in) over the stack of solid
   backgrounds behind it in the DOM, composited down to the first opaque
   one. Text over a gradient, an image or a translucent blur is skipped
   (no single background to measure), as is disabled text. Body text needs
   4.5:1, large text (24px, or 18.66px bold) 3:1. Written to contrast.md
   beside the report; it never fails the run. FIT_CONTRAST=0 turns it off. */
const CONTRAST_ON = process.env.FIT_CONTRAST !== "0";
function contrastProbe(ignore) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently:true });
  const rgba = color => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "rgba(0,0,0,0)"; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a:a / 255 };
  };
  const over = (top, bottom) => ({ r:top.r * top.a + bottom.r * (1 - top.a), g:top.g * top.a + bottom.g * (1 - top.a),
    b:top.b * top.a + bottom.b * (1 - top.a), a:1 });
  const lum = c => [c.r, c.g, c.b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const hex = c => `#${[c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const selector = el => {
    const part = node => `${node.tagName.toLowerCase()}${[...node.classList].slice(0, 2).map(name => `.${name}`).join("")}`;
    return el.parentElement ? `${part(el.parentElement)} > ${part(el)}` : part(el);
  };
  /* the background behind el, or null when there is no single one */
  const backdrop = el => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      /* the page's own glass grain over its ground color is the ground */
      const page = node === document.body || node === document.documentElement;
      if (cs.backgroundImage !== "none" && !page) return null;
      const bg = rgba(cs.backgroundColor);
      if (bg.a > 0) {
        if (bg.a < 0.9 && cs.backdropFilter && cs.backdropFilter !== "none") return null;
        layers.push(bg);
        if (bg.a >= 0.99) break;
      }
      if (node === document.documentElement && (!layers.length || layers.at(-1).a < 0.99)) layers.push({ r:0, g:0, b:0, a:1 });
    }
    if (!layers.length) return null;
    return layers.reduceRight((acc, layer) => acc ? over(layer, acc) : { ...layer, a:1 }, null);
  };
  const out = [], seen = new Set();
  let measured = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (ignore && el.closest(ignore)) continue;
    if (![...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
    if (el.closest(":disabled, [aria-disabled=true], [inert]")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || cs.display === "none") continue;
    let opacity = 1;
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    if (opacity < 0.05) continue;
    const bg = backdrop(el);
    if (!bg) continue;
    measured++;
    const fg = rgba(cs.color);
    const text = over({ ...fg, a:fg.a * opacity }, bg);
    const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
    const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    if (ratio >= need) continue;
    const words = el.textContent.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = `${selector(el)}|${words}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sel:selector(el), text:words, ratio:Math.round(ratio * 100) / 100, need, fg:hex(text), bg:hex(bg), size });
  }
  return { measured, items:out.sort((a, b) => a.ratio - b.ratio).slice(0, 25) };
}
const CONTRAST = `(${contrastProbe.toString()})`;
const contrastViews = [];
let contrastMeasured = 0;
async function contrast(view) {
  if (!CONTRAST_ON) return;
  try {
    const { measured, items } = await evaluate(`${CONTRAST}(${JSON.stringify(IGNORE)})`);
    contrastMeasured += measured;
    if (items.length) contrastViews.push({ view, items });
  } catch (error) { contrastViews.push({ view, items:[], error:error.message }); }
}

/* ── output ── */
fs.mkdirSync(OUT, { recursive:true });
/* a full run starts clean; a partial one (--only, --grep) replaces only its own */
for (const dir of ["crops", "shots"]) {
  if (!ONLY && !GREP) fs.rmSync(path.join(OUT, dir), { recursive:true, force:true });
  fs.mkdirSync(path.join(OUT, dir), { recursive:true });
}
const views = [];
let cropCount = 0;
const CROP_LIMIT = 600;

async function load(url, { timeout = 20000 } = {}) {
  pageErrors.length = 0;
  await cdp("Page.navigate", { url });
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(200);
    try { if (await evaluate("window.__FIT_READY__ === true")) break; } catch {}
  }
  await fontsReady();
  await sleep(250);
}
/* Nothing is measured or shot on a fallback face. document.fonts.ready
   alone settles as soon as nothing is loading, which is true before a face
   the page has not drawn yet is even requested (one locker view measured on
   the condensed fallback), so the show faces are asked for by name, then
   ready is awaited, then each is checked. A face that still is not there
   after three tries is a page error on the view, never a silent pass. */
const SHOW_FACES = ["700 40px 'Big Shoulders Display'", "800 40px 'Big Shoulders Display'", "900 40px 'Big Shoulders Display'",
  "900 40px 'Big Shoulders Inline Display'"];
const FONTS_READY = `(async () => {
  const faces = ${JSON.stringify(SHOW_FACES)};
  await Promise.all(faces.map(face => document.fonts.load(face, "FIELD DAY 0123").catch(() => [])));
  await document.fonts.ready;
  return faces.filter(face => !document.fonts.check(face, "FIELD DAY 0123"));
})()`;
async function fontsReady() {
  let missing = [];
  for (let i = 0; i < 3; i++) {
    try { missing = await evaluate(FONTS_READY); } catch (error) { missing = [error.message]; }
    if (!missing.length) return;
    await sleep(300);
  }
  pageErrors.push(`font not loaded: ${missing.join(", ")}`);
}
async function shot(file, clip = null) {
  await fontsReady();
  const params = { format:"png", captureBeyondViewport:!!clip };
  if (clip) params.clip = { ...clip, scale:1 };
  const r = await cdp("Page.captureScreenshot", params);
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
}
async function crops(view, findings, { scrollY = 0, maxW, maxH }) {
  if (!CROPS) return;
  let n = 0;
  for (const f of findings) {
    if (!f.box || cropCount >= CROP_LIMIT || n >= 25) continue;
    const pad = 28;
    const y0 = f.viewport ? f.box.y : f.box.y + scrollY;
    const x = Math.max(0, f.box.x - pad), y = Math.max(0, y0 - pad);
    const w = Math.min(maxW - x, f.box.w + pad * 2), h = Math.min(maxH - y, f.box.h + pad * 2);
    if (w < 4 || h < 4) continue;
    const file = `crops/${view}-${++n}.png`;
    try { await shot(file, { x, y, width:w, height:h }); f.crop = file; cropCount++; } catch {}
  }
}
async function probe(view) {
  if (!PROBE) return;
  try { console.log(view, JSON.stringify(await evaluate(PROBE), null, 1)); } catch (error) { console.log(view, "probe failed", error.message); }
}
function record(view, mode, url, records, findings, extra = {}) {
  views.push({ view, mode, url, root:records.root, counts:{ text:records.counts?.text || 0, controls:records.counts?.controls || 0 },
    summary:summarize(findings), findings, errors:[...new Set(pageErrors)].slice(0, 5), ...extra });
  const fail = failing(findings).length;
  console.log(`${fail ? "FAIL" : " ok "} ${view.padEnd(46)} ${fail} finding${fail === 1 ? "" : "s"}${findings.length - fail ? ` (+${findings.length - fail} excepted)` : ""}`
    + (pageErrors.length ? `  [${pageErrors.length} page error]` : ""));
}

/* ── the TV ── */
if (ONLY !== "phone") {
  await cdp("Emulation.setDeviceMetricsOverride", { width:1920, height:1080, deviceScaleFactor:1, mobile:false });
  for (const spec of TV_SCENARIOS) {
    if (GREP && !GREP.test(spec.id)) continue;
    const url = `${BASE}/dev/fit-tv.html?scenario=${spec.id}`;
    await load(url);
    const records = await evaluate(`${COLLECT}(${JSON.stringify({ mode:"tv", ignore:IGNORE })})`);
    const findings = findingsFor(records, { mode:"tv", view:spec.id, exceptions:FIT_EXCEPTIONS });
    await shot(`shots/${spec.id}.png`);
    await crops(spec.id, failing(findings), { maxW:1920, maxH:1080 });
    await probe(spec.id);
    await contrast(spec.id);
    record(spec.id, "tv", url, records, findings);
  }
}

/* ── the phone ── */
if (ONLY !== "tv") {
  await cdp("Emulation.setTouchEmulationEnabled", { enabled:true, maxTouchPoints:5 });
  await cdp("Network.enable");
  await cdp("Network.setUserAgentOverride", { userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
    + "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform:"iPhone" });
  const jobs = [];
  for (const spec of PHONE_SCENARIOS) {
    for (const size of PHONE_SIZES) {
      for (const tab of spec.tabs || PHONE_TABS) jobs.push({ spec, size, tab, sheet:null });
      if (size.id === "390" || spec.sheetSizes?.includes(size.id)) for (const sheet of spec.sheets || [])
        jobs.push({ spec, size, tab:sheet.startsWith("weekend-") || sheet === "install-open" ? "weekend"
          : sheet === "sky" ? "events" : "home", sheet });
    }
  }
  for (const { spec, size, tab, sheet } of jobs) {
    const view = `phone-${size.id}-${spec.id}-${sheet ? `sheet-${sheet}` : tab}`;
    if (GREP && !GREP.test(view)) continue;
    await cdp("Emulation.setDeviceMetricsOverride", { width:size.w, height:size.h, deviceScaleFactor:2, mobile:true });
    const url = `${BASE}/dev/fit-phone.html?scenario=${spec.id}&tab=${tab}${sheet ? `&sheet=${sheet}` : ""}`;
    await load(url);
    if (sheet && !(await evaluate("window.__FIT_SHEET__ === true"))) pageErrors.push(`could not open the ${sheet} sheet`);
    const opts = { mode:"phone", ignore:IGNORE };
    const full = await evaluate(`${COLLECT}(${JSON.stringify({ ...opts, phase:"full" })})`);
    await evaluate("window.scrollTo(0, 0)"); await sleep(200);
    const top = await evaluate(`${COLLECT}(${JSON.stringify({ ...opts, phase:"top" })})`);
    const findings = findingsFor({ ...full, overlays:top.overlays, fold:top.fold }, { mode:"phone", view, exceptions:FIT_EXCEPTIONS });
    await evaluate("window.scrollTo(0, document.scrollingElement.scrollHeight)"); await sleep(400);
    const bottom = await evaluate(`${COLLECT}(${JSON.stringify({ ...opts, phase:"bottom" })})`);
    const atBottom = findingsFor({ text:bottom.text, overlays:bottom.overlays }, { mode:"phone", view, exceptions:FIT_EXCEPTIONS })
      .filter(f => f.rule === "overlay");
    await shot(`shots/${view}-bottom.png`);
    atBottom.forEach(f => { f.crop = `shots/${view}-bottom.png`; });
    /* the whole page as one picture: the viewport grown to the page, so the
       docks sit at its foot instead of over its middle; crops come from it */
    const docH = Math.min(full.docH, 6000);
    await evaluate("window.scrollTo(0, 0)");
    await cdp("Emulation.setDeviceMetricsOverride", { width:size.w, height:docH, deviceScaleFactor:2, mobile:true });
    await sleep(500);
    await shot(`shots/${view}.png`, { x:0, y:0, width:size.w, height:docH });
    await crops(view, failing(findings).filter(f => f.rule !== "overlay"), { scrollY:0, maxW:size.w, maxH:docH });
    await probe(view);
    await contrast(view);
    record(view, "phone", url, full, [...findings, ...atBottom]);
  }
}

/* ── the report ── */
const all = views.flatMap(v => v.findings);
const fails = failing(all);
const totals = { views:views.length, findings:all.length, failing:fails.length, byRule:summarize(all),
  viewsFailing:views.filter(v => failing(v.findings).length).length };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ generated:new Date().toISOString(), totals, views }, null, 1));
const md = [`# Fit audit`, "", `${new Date().toISOString()} · ${totals.views} views · ${totals.failing} failing findings`
  + ` in ${totals.viewsFailing} views · ${Object.entries(totals.byRule).map(([k, v]) => `${k} ${v}`).join(", ") || "clean"}`, "",
  "Rules: dev/fit/rules.js. Exceptions: dev/fit/exceptions.js. Re-run: `npm run audit:fit`.", "",
  "| View | Failing | By rule |", "|---|---|---|",
  ...views.map(v => `| ${v.view} | ${failing(v.findings).length} | ${Object.entries(v.summary).map(([k, n]) => `${k} ${n}`).join(", ")} |`), ""];
for (const v of views) {
  if (!v.findings.length && !v.errors.length) continue;
  md.push(`## ${v.view}`, "", `[screenshot](shots/${v.view}.png) · root \`${v.root}\``, "");
  v.errors.forEach(e => md.push(`- page error: ${e}`));
  for (const f of v.findings) {
    md.push(`- **${f.rule}**${f.excepted ? ` (excepted: ${f.excepted})` : ""} \`${f.sel}\`${f.text ? ` "${f.text}"` : ""}: ${f.detail}`
      + (f.crop ? ` [crop](${f.crop})` : ""));
  }
  md.push("");
}
fs.writeFileSync(path.join(OUT, "report.md"), md.join("\n"));
if (CONTRAST_ON) {
  const low = contrastViews.reduce((n, v) => n + v.items.length, 0);
  fs.writeFileSync(path.join(OUT, "contrast.md"), [`# Contrast at rest (advisory)`, "",
    `${new Date().toISOString()} · ${low} text runs under 4.5:1 (3:1 large) in ${contrastViews.length} views, of ${contrastMeasured} measured. `
      + "Text over gradients, images, translucent blur and disabled text is skipped.", "",
    ...contrastViews.flatMap(v => [`## ${v.view}`, "", ...(v.error ? [`- probe failed: ${v.error}`] : []),
      ...v.items.map(item => `- ${item.ratio}:1 (needs ${item.need}) \`${item.sel}\` "${item.text}" ${item.fg} on ${item.bg}, ${item.size}px`), ""])]
    .join("\n"));
  console.log(`contrast (advisory): ${low} text runs under the minimum in ${contrastViews.length} views (${contrastMeasured} measured). See contrast.md`);
}
console.log(`\n${totals.views} views, ${totals.failing} failing findings (${JSON.stringify(totals.byRule)}). Report: ${path.relative(ROOT, OUT)}/report.md`);
ws.close();
await cleanup();
process.exit(fails.length ? 1 : 0);
