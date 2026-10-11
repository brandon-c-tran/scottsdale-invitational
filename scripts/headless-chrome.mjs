/* Headless Chrome over the DevTools protocol, for the dev scripts that
   look at a page (scripts/build-bits-reel.mjs --check, scripts/bit-frames.mjs).
   One browser, one page; everything it starts is gone after close().
   CHROME=<path> overrides the browser. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const CHROME_PATH = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find(p => fs.existsSync(p));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function launchChrome({ width = 1920, height = 1080 } = {}) {
  if (!CHROME_PATH) throw new Error("Chrome not found (set CHROME)");
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "fd-chrome-"));
  const chrome = spawn(CHROME_PATH, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${udd}`, "--hide-scrollbars",
    "--mute-audio", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", "--no-default-browser-check",
    "--force-color-profile=srgb", "--allow-file-access-from-files", `--window-size=${width},${height}`, "about:blank"], { stdio:"ignore" });
  let port;
  for (let i = 0; i < 200 && !port; i++) {
    await sleep(100);
    try { port = fs.readFileSync(path.join(udd, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {}
  }
  const close = async () => {
    try { chrome.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(udd, { recursive:true, force:true }); } catch {}
  };
  if (!port) { await close(); throw new Error("Chrome did not start"); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const waits = new Map();
  const listeners = new Set();
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    if (m.method) listeners.forEach(fn => fn(m));
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    waits.set(id, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await cdp("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:false });
  /* load a URL and wait for its load event */
  const load = async (url, { timeout = 20000 } = {}) => {
    const loaded = new Promise(resolve => {
      const on = m => { if (m.method === "Page.loadEventFired") { listeners.delete(on); resolve(); } };
      listeners.add(on);
    });
    await cdp("Page.navigate", { url });
    await Promise.race([loaded, sleep(timeout)]);
  };
  /* wait until an expression is truthy */
  const until = async (expression, { timeout = 15000, every = 100 } = {}) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (await evaluate(expression)) return true; } catch {}
      await sleep(every);
    }
    return false;
  };
  const screenshot = async file => {
    const { data } = await cdp("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
    fs.mkdirSync(path.dirname(file), { recursive:true });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  };
  const resize = (w, h, { mobile = false, scale = 1 } = {}) =>
    cdp("Emulation.setDeviceMetricsOverride", { width:w, height:h, deviceScaleFactor:scale, mobile });
  return { cdp, evaluate, load, until, screenshot, resize, on:fn => { listeners.add(fn); return () => listeners.delete(fn); },
    close:async () => { try { ws.close(); } catch {} await close(); } };
}

/* what the artifact host wraps a page in, for a local look at the file */
export const ARTIFACT_SKELETON = (content, { title = "" } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${title ? `<title>${title}</title>` : ""}`
  + `<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}`
  + `body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>`
  + `</head><body>${content}</body></html>`;
