/* The phone controller, looked at (float/GROOVE.md "The screen (TV) and the
   phone"): opens /float/play against the pretend room (mockRoom.js) in
   headless Chrome as a touch phone, holds every moment still (&freeze=1:
   the room's clock stops, taps still land on it), taps the pad and the
   buttons with real touches through CDP Input.dispatchTouchEvent, checks
   what the controller sent (hit, drink, cheer, ready), and saves a
   screenshot of every moment.

     node scripts/float-controller-shots.mjs [--url http://localhost:5184]
       [--out <dir>] [--only practice,drink,join] [--sizes portrait,landscape,se,max] [--scale 2]

   Needs a dev server (npx vite --port 5184 --strictPort). Exits 1 when a
   check fails. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchChrome } from "./headless-chrome.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const BASE = arg("url", "http://localhost:5184").replace(/\/$/, "");
const OUT = path.resolve(arg("out", path.join(os.tmpdir(), "float-controller-shots")));
const ONLY = arg("only", "") ? new Set(arg("only", "").split(",")) : null;
/* an iPhone 14 upright (the phone in one hand), sideways on request, an SE, a Pro Max */
const SIZES = { portrait:[390, 844], landscape:[844, 390], se:[375, 667], max:[430, 932] };
const WANT = arg("sizes", "portrait").split(",").filter(name => SIZES[name]);
const SCALE = Number(arg("scale", "2")) || 2;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const want = name => !ONLY || ONLY.has(name);

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
  return ok;
};

/* the moments, each held still; `tap` taps the pad there once it is up */
const MOMENTS = [
  ["lobby"], ["lobby-ready"], ["lobby-fieldday"], ["intro"], ["card"], ["count"],
  ["practice", { tap:true, word:"Nice!" }], ["hey"], ["play", { tap:true, word:"Perfect" }], ["play-late", { tap:true, word:"Late" }],
  ["play-miss", { word:"Miss" }], ["drink"], ["drink-done"], ["drink-dry"], ["drink-late"], ["outro"], ["after"],
  ["rock"], ["spin"], ["drop"], ["cut"], ["cut-out"], ["cut-final"], ["lastcall"], ["lastcall-grab", { tap:true, word:"Late" }],
  ["lastcall-drink"], ["lastcall-safe"], ["crowd"], ["podium"], ["podium-win"], ["podium-out"],
  ["feedback"], ["watch"],
];

async function main() {
  try { await fetch(`${BASE}/float/play`); }
  catch { console.error(`No dev server at ${BASE} (npx vite --port 5184 --strictPort)`); process.exit(2); }
  fs.mkdirSync(OUT, { recursive:true });
  const errors = [];
  for (const size of WANT) {
    const [w, h] = SIZES[size];
    /* a browser of its own for each group: headless Chrome's emulated touch
       screen can stop delivering touches to a page after a long run */
    for (const group of [moments, padChecks, joinChecks]) {
      const page = await launchChrome({ width:w, height:h });
      page.on(m => {
        if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
        if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/favicon|WebSocket|ERR_CONNECTION/.test(m.params.entry.text)) errors.push(m.params.entry.text);
      });
      try {
        await page.cdp("Emulation.setTouchEmulationEnabled", { enabled:true, maxTouchPoints:5 });
        await page.resize(w, h, { mobile:true, scale:SCALE });
        await group(page, size);
      } finally {
        await page.close();
      }
    }
  }
  check(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  console.log(`\nshots in ${OUT}`);
  if (failures.length) { console.log(`${failures.length} failed`); process.exit(1); }
}

/* ── touches ── */
const touch = (page, type, points) => page.cdp("Input.dispatchTouchEvent", { type, touchPoints:points });
let touchIds = 100;
async function tapAt(page, x, y) {
  const p = { x:Math.round(x), y:Math.round(y), id:touchIds++, radiusX:8, radiusY:8, force:0.6 };
  await touch(page, "touchStart", [p]);
  await sleep(40);
  await touch(page, "touchEnd", [p]);
}
/* A tap fired inside the page at this instant: the room's clock is frozen
   for a held moment, and a CDP touch reaches the page only after headless
   Chrome paints (a few hundred ms, which the touch's own time stamp then
   rightly carries back), so the popup moments tap from inside the page. */
const tapNow = (page, x, y) => page.evaluate(`(() => {
  const target = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
  if (!target) return false;
  const touch = new Touch({ identifier:${touchIds++}, target, clientX:${Math.round(x)}, clientY:${Math.round(y)}, radiusX:8, radiusY:8, force:0.6 });
  target.dispatchEvent(new TouchEvent("touchstart", { touches:[touch], targetTouches:[touch], changedTouches:[touch], bubbles:true, cancelable:true }));
  target.dispatchEvent(new TouchEvent("touchend", { touches:[], targetTouches:[], changedTouches:[touch], bubbles:true, cancelable:true }));
  return true;
})()`);
/* taps on an element fired inside the page, `times` in a row at once (a gate's check) */
const tapElementNow = (page, selector, times = 1) => page.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let k = 0; k < ${times}; k++) {
    const touch = new Touch({ identifier:${touchIds++} * 10 + k, target:el, clientX:x, clientY:y, radiusX:8, radiusY:8, force:0.6 });
    el.dispatchEvent(new TouchEvent("touchstart", { touches:[touch], targetTouches:[touch], changedTouches:[touch], bubbles:true, cancelable:true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches:[], targetTouches:[], changedTouches:[touch], bubbles:true, cancelable:true }));
  }
  return true;
})()`);
async function tapElement(page, selector) {
  const box = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null; el.scrollIntoView({ block:"center", inline:"center" });
    const r = el.getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; })()`);
  if (!box) return false;
  await sleep(60);
  await tapAt(page, box.x, box.y);
  return true;
}
const sent = page => page.evaluate("JSON.stringify(window.__floatMock?.sent || [])").then(JSON.parse);
const clearSent = page => page.evaluate("window.__floatMock && (window.__floatMock.sent.length = 0)");
const shot = async (page, size, name) => {
  const file = await page.screenshot(path.join(OUT, `${size}-${name}.png`));
  console.log(`     ${path.basename(file)}`);
};
const screenIs = (page, name, timeout = 6000) => page.until(`document.querySelector('.flc-root')?.dataset.screen === ${JSON.stringify(name)}`, { timeout });
const go = async (page, scene) => { await page.evaluate(`window.__floatMock.go(${JSON.stringify(scene)})`); await sleep(650); };
const popupText = page => page.evaluate("document.querySelector('.flc-popup')?.textContent || ''");

async function open(page, scene) {
  await page.load(`${BASE}/float/play?mock=1&freeze=1&at=${scene}`);
  return page.until("!!window.__floatMock && !!document.querySelector('.flc-screen')", { timeout:25000 });
}

/* every moment, held still */
async function moments(page, size) {
  const [w, h] = SIZES[size];
  if (!check(await open(page, "lobby"), `${size}: the mock controller loaded`)) return;
  await sleep(1500);
  /* the first touch unlocks the sound (its one slow call) */
  await tapAt(page, w * 0.5, h * 0.2);
  await sleep(300);
  for (const [scene, opts = {}] of MOMENTS) {
    if (!want(scene)) continue;
    await go(page, scene);
    if (opts.tap) {
      await clearSent(page);
      await tapNow(page, w * 0.5, h * 0.62);
      await sleep(190);
    }
    if (opts.wait) await sleep(opts.wait);
    const said = opts.word ? await popupText(page) : "";
    await shot(page, size, scene);
    if (opts.word) check(said.includes(opts.word), `${size} ${scene}: the popup says ${opts.word} (${said})`);
    if (opts.tap) {
      const hits = (await sent(page)).filter(m => m.t === "hit");
      const last = hits.length === 1 ? "" : ` last tap ${await page.evaluate("JSON.stringify(window.__floatLastTap || null)")}`;
      check(hits.length === 1 && Number.isInteger(hits[0].c) && Number.isFinite(hits[0].r), `${size} ${scene}: one tap, one hit {c, r} (${JSON.stringify(hits)})${last}`);
    }
  }
}

/* the pad's rules, with real touches */
async function padChecks(page, size) {
  const [w, h] = SIZES[size];
  if (!want("drink") && !want("crowd") && !want("pad")) return;
  if (!check(await open(page, "drink"), `${size}: the drink break loaded`)) return;
  await sleep(1500);
  /* the drink break: the pad takes no taps until Done */
  await clearSent(page);
  await tapAt(page, w * 0.5, h * 0.3);
  await sleep(150);
  check(!(await sent(page)).some(m => m.t === "hit"), `${size}: Done owed, the pad takes no taps`);
  check(await tapElement(page, ".flc-done"), `${size}: Done is up`);
  await sleep(250);
  check((await sent(page)).some(m => m.t === "drink"), `${size}: Done sends drink`);
  check(await page.until("!!document.querySelector('.flc-rest') && !document.querySelector('.flc-done')", { timeout:3000 }), `${size}: after Done, Done`);
  await shot(page, size, "drink-tapped");
  /* play B began before Done: Done stays, the cues are the room's misses */
  await go(page, "drink-late");
  await clearSent(page);
  await tapAt(page, w * 0.5, h * 0.3);
  await sleep(150);
  check(!(await sent(page)).some(m => m.t === "hit") && (await page.evaluate("!!document.querySelector('.flc-done')")), `${size}: play B before Done: Done stays up`);
  await tapElement(page, ".flc-done");
  await sleep(250);
  check((await sent(page)).some(m => m.t === "drink"), `${size}: a late Done sends drink`);
  /* the same cue twice: one hit */
  await go(page, "practice");
  await clearSent(page);
  await tapNow(page, w * 0.5, h * 0.62);
  await sleep(60);
  await tapNow(page, w * 0.5, h * 0.62);
  await sleep(200);
  const hits = (await sent(page)).filter(m => m.t === "hit");
  check(hits.length === 1, `${size}: two taps on one cue, one hit (${hits.length})`);
  /* a tap that matches no cue sends nothing */
  await go(page, "count");
  await clearSent(page);
  await tapAt(page, w * 0.5, h * 0.62);
  await sleep(200);
  check(!(await sent(page)).some(m => m.t === "hit") && !(await popupText(page)), `${size}: a tap with no cue near does nothing else`);
  /* the crowd: Cheer, at most twice a second */
  await go(page, "crowd");
  await clearSent(page);
  await tapElementNow(page, ".flc-cheer", 2);
  await sleep(150);
  const cheers = (await sent(page)).filter(m => m.t === "cheer").length;
  check(cheers === 1, `${size}: two Cheers inside half a second send one (${cheers})`);
  await sleep(600);
  await tapElement(page, ".flc-cheer");
  await sleep(200);
  check((await sent(page)).filter(m => m.t === "cheer").length === 2, `${size}: and another after half a second`);
  await shot(page, size, "crowd-cheer");
  /* the link drops: the pill */
  await go(page, "play");
  await page.evaluate("window.__floatMock.blip(3000)");
  await sleep(400);
  await shot(page, size, "reconnecting");
  await sleep(2800);
}

/* the standalone join: the code, a new rider, the Locker, the lobby */
async function joinChecks(page, size) {
  if (!want("join")) return;
  await page.load(`${BASE}/float/play?mock=1&join=code`);
  await page.evaluate("localStorage.removeItem('float-rider'); localStorage.removeItem('float-feedback')");
  await page.load(`${BASE}/float/play?mock=1&join=code`);
  if (!check(await page.until("!!document.querySelector('.flj-code')", { timeout:25000 }), `${size}: the code entry`)) return;
  await sleep(300);
  await shot(page, size, "join-code");
  await tapElement(page, ".flj-code-input");
  await page.cdp("Input.insertText", { text:"brkt" });
  check(await page.until("!!document.querySelector('.flj-edit')", { timeout:5000 }), `${size}: four letters open the rider`);
  await sleep(300);
  await shot(page, size, "join-new");
  await tapElement(page, ".flj-yesno button");
  await tapElement(page, ".flj-swatch:nth-child(8)");
  await tapElement(page, ".flj-look");
  if (!check(await page.until("!!document.querySelector('.fll-locker')", { timeout:5000 }), `${size}: the Locker opens`)) return;
  await sleep(1500);
  const tiles = await page.evaluate("document.querySelectorAll('.fll-tile').length");
  check(tiles === 13, `${size}: thirteen critters for a rider who is not the groom (${tiles})`);
  check(!(await page.evaluate("[...document.querySelectorAll('.fll-tile')].some(b => /Winnie/.test(b.textContent))")), `${size}: no Winnie`);
  await tapElement(page, ".fll-critters li:nth-child(4) button");
  await sleep(500);
  await shot(page, size, "locker");
  await tapElement(page, ".flj-done");
  await sleep(200);
  await tapElement(page, ".flj-join");
  check(await screenIs(page, "lobby", 8000), `${size}: Join opens the lobby`);
  await sleep(600);
  await shot(page, size, "join-lobby");
  const saved = await page.evaluate("JSON.parse(localStorage.getItem('float-rider') || 'null')");
  check(saved?.look?.critter === "jackrabbit" && saved?.drinks === true, `${size}: the rider is kept (${JSON.stringify(saved)})`);
  /* the lobby's own Locker, and a pick there goes to the room */
  await tapElement(page, ".flc-lobby .flc-pill");
  if (check(await page.until("!!document.querySelector('.flc-locker-sheet .fll-locker')", { timeout:5000 }), `${size}: Change look opens the Locker`)) {
    await sleep(1200);
    await clearSent(page);
    await tapElement(page, ".fll-critters li:nth-child(13) button");
    await sleep(300);
    check((await sent(page)).some(m => m.t === "look" && m.look?.critter === "frog"), `${size}: a pick in the lobby sends the look`);
    await shot(page, size, "lobby-locker");
    await tapElement(page, ".flc-locker-sheet .flc-pill");
    await sleep(400);
  }
  /* Ready: the live room starts the Cup a moment later */
  await clearSent(page);
  await tapElement(page, ".flc-ready");
  await sleep(300);
  check((await sent(page)).some(m => m.t === "ready" && m.on === true), `${size}: Ready sends ready`);
  check(await screenIs(page, "intro", 6000), `${size}: and the Cup starts`);
}

main().catch(error => { console.error(error); process.exit(1); });
