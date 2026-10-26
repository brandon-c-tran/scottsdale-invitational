/* The phone controller, looked at (float/PROTOCOL.md "The phone held
   sideways"): opens /float/play against the pretend room (mockRoom.js) in
   headless Chrome as a touch phone, at 390x844 (a portrait viewport, so the
   sideways screens draw turned) and 844x390 (landscape, laid out natively),
   paddles it with real multi-touch through CDP Input.dispatchTouchEvent,
   checks what the controller sent (stroke, hands, drink, balloon, ready,
   look, feedback), and saves a screenshot of every scene.

     node scripts/float-controller-shots.mjs [--url http://localhost:5183]
       [--out <dir>] [--only race,beach] [--sizes portrait,landscape] [--scale 2]

   Needs a dev server (npm run dev -- --port 5183). Exits 1 when a check fails. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchChrome } from "./headless-chrome.mjs";
import { toViewport } from "../float/client/controller/turn.js";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const BASE = arg("url", "http://localhost:5183").replace(/\/$/, "");
const OUT = path.resolve(arg("out", path.join(os.tmpdir(), "float-controller-shots")));
const ONLY = arg("only", "") ? new Set(arg("only", "").split(",")) : null;
const SIZES = { portrait:[390, 844], landscape:[844, 390] };
const WANT = arg("sizes", "portrait,landscape").split(",").filter(name => SIZES[name]);
const SCALE = Number(arg("scale", "2")) || 2;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
  return ok;
};

async function main() {
  try { await fetch(`${BASE}/float/play`); }
  catch { console.error(`No dev server at ${BASE} (npm run dev -- --port 5183)`); process.exit(2); }
  fs.mkdirSync(OUT, { recursive:true });
  const page = await launchChrome({ width:390, height:844 });
  const errors = [];
  page.on(m => {
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
  });
  try {
    for (const size of WANT) {
      const [w, h] = SIZES[size];
      await page.cdp("Emulation.setTouchEmulationEnabled", { enabled:true, maxTouchPoints:5 });
      await page.resize(w, h, { mobile:true, scale:SCALE });
      await shots(page, size, w, h);
    }
  } finally {
    await page.close();
  }
  check(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  console.log(`\nshots in ${OUT}`);
  if (failures.length) { console.log(`${failures.length} failed`); process.exit(1); }
}

/* ── touches, aimed in content space ── */
async function geometry(page) {
  return page.evaluate(`(() => {
    const frame = document.querySelector(".flc-frame"), box = document.querySelector(".flc-viewport");
    if (!frame || !box) return null;
    const r = box.getBoundingClientRect();
    return { turn:Number(frame.dataset.turn) || 0, w:box.clientWidth, h:box.clientHeight, left:r.left, top:r.top,
      cw:frame.offsetWidth, ch:frame.offsetHeight };
  })()`);
}
const at = (g, cx, cy) => {
  const v = toViewport(cx, cy, g, g.turn);
  return { x:Math.round(g.left + v.x), y:Math.round(g.top + v.y) };
};
const point = (g, id, cx, cy) => ({ ...at(g, cx, cy), id, radiusX:8, radiusY:8, force:0.6 });
const touch = (page, type, points) => page.cdp("Input.dispatchTouchEvent", { type, touchPoints:points });

/* one thumb pulls down `px` (content space) in four moves, lifting at the
   end unless hold. Headless Chrome acknowledges a touch only after it
   paints, so the moves are few and the clock is the page's own. */
async function pull(page, g, id, cx, cy, px, { hold = false, start = true } = {}) {
  if (start) await touch(page, "touchStart", [point(g, id, cx, cy)]);
  for (let k = 1; k <= 4; k++) await touch(page, "touchMove", [point(g, id, cx, cy + px * k / 4)]);
  if (!hold) await touch(page, "touchEnd", [point(g, id, cx, cy + px)]);
}
/* The input checks run on a page whose motion is stilled: headless Chrome
   paints in software and acknowledges each touch only after it paints, so
   a busy frame would hold a pull still for 150 ms and the stroke detector
   would rightly call it a stall. A phone delivers touches queued behind a
   busy frame before any timer, with their own time stamps. The shots are
   taken before this. */
async function quiet(page) {
  await page.evaluate(`(() => {
    if (window.__quiet) return; window.__quiet = true;
    document.head.insertAdjacentHTML("beforeend", "<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>");
    Element.prototype.animate = function () {
      const done = { cancel() {}, finish() {}, set onfinish(fn) { setTimeout(fn, 0); } };
      return done;
    };
  })()`);
}
/* the first touch unlocks the sound engine (its one slow call) and the portraits draw: then time things */
async function warm(page, g) {
  await quiet(page);
  await page.until("!!document.querySelector('.flc-hud .flp.is-drawn')", { timeout:8000 });
  await touch(page, "touchStart", [point(g, 8, g.cw * 0.25, g.ch * 0.6)]);
  await touch(page, "touchEnd", [point(g, 8, g.cw * 0.25, g.ch * 0.6)]);
  await sleep(1200);
}
const sent = page => page.evaluate("JSON.stringify(window.__floatMock?.sent || [])").then(JSON.parse);
const clearSent = page => page.evaluate("window.__floatMock && (window.__floatMock.sent.length = 0)");

async function paddleChecks(page, size) {
  await page.evaluate(`window.__floatMock.go("race")`);
  await sleep(500);
  const g = await geometry(page);
  if (!check(!!g, `${size}: the race frame is there`)) return;
  check(size === "portrait" ? g.turn !== 0 : g.turn === 0, `${size}: turn ${g.turn}`);
  await warm(page, g);
  await clearSent(page);
  const lx = g.cw * 0.22, rx = g.cw * 0.78, y0 = g.ch * 0.38;
  /* both thumbs land, then alternate pulls with the other thumb resting */
  await touch(page, "touchStart", [point(g, 1, lx, y0)]);
  await touch(page, "touchStart", [point(g, 2, rx, y0)]);
  await sleep(150);
  await pull(page, g, 1, lx, y0, 90, { start:false });
  await sleep(120);
  await pull(page, g, 3, lx, y0, 80, { hold:true });
  await touch(page, "touchMove", [point(g, 3, lx, y0 + 70)]);
  await pull(page, g, 2, rx, y0, 90, { start:false });
  await sleep(120);
  await pull(page, g, 4, rx, y0, 85);
  await sleep(200);
  let out = await sent(page);
  const strokes = out.filter(m => m.t === "stroke");
  check(strokes.length >= 4, `${size}: ${strokes.length} strokes sent`);
  check(strokes.map(s => s.side).join("") === "LLRR", `${size}: stroke sides ${strokes.map(s => s.side).join("")}`);
  check(strokes.every(s => s.p > 0.3 && s.p <= 1), `${size}: stroke power ${strokes.map(s => s.p).join(", ")}`);
  const hands = out.filter(m => m.t === "hands").map(m => m.n);
  check(hands.includes(2), `${size}: hands 2 while both thumbs are down (${hands.join(" ")})`);
  check(!hands.slice(hands.indexOf(2) + 1).includes(1), `${size}: no hands 1 between strokes (${hands.join(" ")})`);
  /* the left thumb (id 3) lifts and stays up: one hand after the grace, then none */
  await touch(page, "touchEnd", [point(g, 3, lx, y0 + 80)]);
  await sleep(1300);
  out = await sent(page);
  const later = out.filter(m => m.t === "hands").map(m => m.n);
  check(later[later.length - 1] === 0, `${size}: hands 0 after both lift (${later.join(" ")})`);
  /* a tap is a light stroke */
  await clearSent(page);
  await touch(page, "touchStart", [point(g, 5, lx, y0)]);
  await sleep(60);
  await touch(page, "touchEnd", [point(g, 5, lx, y0)]);
  await sleep(150);
  out = await sent(page);
  const tap = out.filter(m => m.t === "stroke");
  check(tap.length === 1 && tap[0].side === "L" && tap[0].p > 0 && tap[0].p <= 0.35, `${size}: a tap strokes lightly (${JSON.stringify(tap)})`);
  /* a thumb that crosses the middle keeps its side */
  await clearSent(page);
  await touch(page, "touchStart", [point(g, 6, g.cw * 0.45, y0)]);
  for (let k = 1; k <= 6; k++) { await touch(page, "touchMove", [point(g, 6, g.cw * 0.45 + k * 18, y0 + k * 14)]); await sleep(16); }
  await touch(page, "touchEnd", [point(g, 6, g.cw * 0.45 + 108, y0 + 84)]);
  await sleep(150);
  out = await sent(page);
  check(out.filter(m => m.t === "stroke").map(m => m.side).join("") === "L", `${size}: a thumb across the middle keeps its side`);
}

async function tapElement(page, selector) {
  const box = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null; el.scrollIntoView({ block:"center", inline:"center" });
    const r = el.getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; })()`);
  if (!box) return false;
  await sleep(60);
  const p = { x:Math.round(box.x), y:Math.round(box.y), id:9, radiusX:6, radiusY:6, force:0.5 };
  await touch(page, "touchStart", [p]);
  await sleep(50);
  await touch(page, "touchEnd", [p]);
  return true;
}

async function drinkChecks(page, size) {
  await page.evaluate(`window.__floatMock.go("race")`);
  await sleep(500);
  await clearSent(page);
  /* a thumb rests on the left paddle while the other hand taps the drink */
  const g = await geometry(page);
  await touch(page, "touchStart", [point(g, 1, g.cw * 0.2, g.ch * 0.5)]);
  const tapped = await tapElement(page, ".flc-drink");
  await sleep(300);
  await touch(page, "touchEnd", [point(g, 1, g.cw * 0.2, g.ch * 0.5)]);
  const out = await sent(page);
  check(tapped && out.some(m => m.t === "drink"), `${size}: the drink button sends drink with a thumb on a paddle`);
  check(!out.some(m => m.t === "stroke"), `${size}: tapping the drink is not a stroke`);
}

async function beachChecks(page, size) {
  await page.evaluate(`window.__floatMock.go("beach")`);
  await sleep(900);
  await clearSent(page);
  const tapped = await tapElement(page, ".flc-target:not([disabled])");
  await sleep(200);
  const out = await sent(page);
  check(tapped && out.some(m => m.t === "balloon" && Number.isInteger(m.at)), `${size}: a racer's portrait throws a balloon`);
}

const shot = async (page, size, name) => {
  const file = await page.screenshot(path.join(OUT, `${size}-${name}.png`));
  console.log(`     ${path.basename(file)}`);
};
const enabled = (page, selector) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && !el.disabled; })()`);

/* the standalone join: the code, a new rider, the Locker, the lobby, a returning phone */
async function joinChecks(page, size) {
  await page.load(`${BASE}/float/play?mock=1&join=code`);
  await page.evaluate("localStorage.removeItem('float-rider'); localStorage.removeItem('float-beach'); localStorage.removeItem('float-feedback')");
  await page.load(`${BASE}/float/play?mock=1&join=code`);
  if (!check(await page.until("!!document.querySelector('.flj-code')", { timeout:20000 }), `${size}: the code entry`)) return;
  await sleep(300);
  await shot(page, size, "join-code");
  await tapElement(page, ".flj-code-input");
  await page.cdp("Input.insertText", { text:"bAr" });
  await sleep(150);
  check(await page.evaluate("document.querySelector('.flj-code-input').value") === "br", `${size}: a vowel is not a code letter`);
  await page.cdp("Input.insertText", { text:"kt" });
  check(await page.until("!!document.querySelector('.flj-edit')", { timeout:5000 }), `${size}: four letters open the rider`);
  check(/[?&]room=brkt\b/.test(await page.evaluate("location.search")), `${size}: the code goes in the address`);
  await sleep(300);
  await shot(page, size, "join-new");
  check(!(await enabled(page, ".flj-join")), `${size}: Join waits for "Drinking?"`);
  await tapElement(page, ".flj-yesno button");
  await sleep(150);
  check(await enabled(page, ".flj-join"), `${size}: Join once answered`);
  await tapElement(page, ".flj-swatch:nth-child(8)");
  await tapElement(page, ".flj-look");
  if (!check(await page.until("!!document.querySelector('.fll-locker')", { timeout:5000 }), `${size}: the Locker opens`)) return;
  await sleep(700);
  for (const tab of ["critter", "floatie", "hat", "shades", "pose"]) {
    await tapElement(page, `.fll-tabs [data-tab="${tab}"]`);
    await sleep(500);
    await shot(page, size, `locker-${tab}`);
  }
  await tapElement(page, `.fll-tabs [data-tab="floatie"]`);
  await sleep(300);
  await tapElement(page, ".fll-floaties li:nth-child(5) button");
  await sleep(120);
  await shot(page, size, "locker-floatie-switch");
  await tapElement(page, `.fll-tabs [data-tab="hat"]`);
  check(!(await page.evaluate("[...document.querySelectorAll('.fll-chip')].some(b => /Crown/.test(b.textContent))")),
    `${size}: no crown for a rider who is not the groom`);
  await tapElement(page, ".flj-done");
  await sleep(200);
  await tapElement(page, ".flj-join");
  check(await page.until("document.querySelector('.flc-root')?.dataset.screen === 'lobby'", { timeout:8000 }), `${size}: Join opens the lobby`);
  await sleep(500);
  await shot(page, size, "join-lobby");
  const saved = await page.evaluate("JSON.parse(localStorage.getItem('float-rider') || 'null')");
  check(saved?.name === "Brandon" && saved?.drinks === true && saved?.look?.floatie === "shark", `${size}: the rider is kept (${JSON.stringify(saved)})`);
  await tapElement(page, ".flc-lobby .flc-pill");
  if (check(await page.until("!!document.querySelector('.flc-locker-sheet .fll-locker')", { timeout:5000 }), `${size}: Change look opens the Locker`)) {
    await sleep(600);
    await shot(page, size, "lobby-locker");
  }
  /* the returning phone: one tap from the lobby */
  await page.load(`${BASE}/float/play?mock=1`);
  if (check(await page.until("!!document.querySelector('.flj-ready')", { timeout:20000 }), `${size}: a returning phone gets its rider`)) {
    await sleep(500);
    await shot(page, size, "join-returning");
    await tapElement(page, ".flj-join");
    check(await page.until("document.querySelector('.flc-root')?.dataset.screen === 'lobby'", { timeout:8000 }), `${size}: one tap to the lobby`);
  }
  /* the link drops: the pill reads the right way up, sideways too */
  await page.evaluate(`window.__floatMock.go("race"); setTimeout(() => window.__floatMock.blip(4000), 600)`);
  await sleep(1300);
  await shot(page, size, "race-reconnecting");
  await sleep(3500);
}

async function shots(page, size, w, h) {
  await page.load(`${BASE}/float/play?mock=1&at=lobby`);
  const ready = await page.until("!!window.__floatMock && !!document.querySelector('.flc-screen, .flc-race')", { timeout:20000 });
  if (!check(ready, `${size}: the mock controller loaded`)) return;
  await sleep(400);
  const scenes = await page.evaluate("window.__floatMock.scenes");
  for (const scene of scenes) {
    if (ONLY && !ONLY.has(scene)) continue;
    await page.evaluate(`window.__floatMock.go(${JSON.stringify(scene)})`);
    await sleep(scene.startsWith("race") || scene === "countdown" ? 700 : 600);
    const file = await page.screenshot(path.join(OUT, `${size}-${scene}.png`));
    console.log(`     ${path.basename(file)}`);
  }
  if (!ONLY || ONLY.has("race")) await paddleChecks(page, size);
  if (!ONLY || ONLY.has("race")) await drinkChecks(page, size);
  if (!ONLY || ONLY.has("beach")) await beachChecks(page, size);
  if (!ONLY || ONLY.has("join")) await joinChecks(page, size);
  void w; void h;
}

main().catch(error => { console.error(error); process.exit(1); });
