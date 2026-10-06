/* Oct 2 foundations: the commissioner's TV check (presence, never state),
   the TV's wake lock, the lazy TV and commissioner modules, computed chip
   ink, and the bets rack clearance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHIP_COLORS, CHIP_GRAY, ROSTER } from "../shared/core.js";
import { Tournament } from "../worker/tournament.js";
import { TV_STALE_MS, liveTvs, tvHealthLine } from "../src/features/director/tvHealth.js";
import { CHIP_INKS, __resetChipInks, chipInkIsDark, chipInks, contrastRatio } from "../src/features/identity/chipInk.js";
import { resolvePlayerIdentity } from "../src/features/identity/playerIdentity.js";
import { createWakeLock as libWakeLock } from "../src/lib/wakeLock.js";
import { createWakeLock as tableWakeLock } from "../src/features/poker/tableView.js";
import { lazyPart } from "../src/lib/lazyPart.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ── the commissioner's TV check ── */
test("tvHealthLine: muted or missing TVs, one line, nothing when all is well", () => {
  const now = 1_000_000;
  assert.equal(tvHealthLine({ tvs:null, live:true, now }), null, "not a commissioner frame");
  assert.equal(tvHealthLine({ tvs:[], live:false, now }), null, "no TV expected before the weekend");
  assert.equal(tvHealthLine({ tvs:[], live:true, now }), "No TV connected");
  assert.equal(tvHealthLine({ tvs:[{ sound:"on", ageMs:1_000 }], receivedAt:now, live:true, now }), null);
  assert.equal(tvHealthLine({ tvs:[{ sound:"blocked", ageMs:1_000 }], receivedAt:now, live:false, now }), "TV sound off");
  assert.equal(tvHealthLine({ tvs:[{ sound:"blocked", ageMs:0 }, { sound:"on", ageMs:0 }], receivedAt:now, live:true, now }),
    "TV sound off on 1 of 2");
  assert.equal(tvHealthLine({ tvs:[{ sound:"unknown", ageMs:0 }], receivedAt:now, live:true, now }), null,
    "an older TV build that never reports is not called muted");
  /* a TV that stops speaking counts as gone, from its age plus the time since this device heard */
  const tvs = [{ sound:"on", ageMs:20_000 }];
  assert.equal(liveTvs(tvs, now, now + TV_STALE_MS - 20_001).length, 1);
  assert.equal(liveTvs(tvs, now, now + TV_STALE_MS - 20_000).length, 0);
  assert.equal(tvHealthLine({ tvs, receivedAt:now, live:true, now:now + TV_STALE_MS }), "No TV connected");
  for (const line of ["No TV connected", "TV sound off", "TV sound off on 1 of 2"]) assert.doesNotMatch(line, /!|—/);
});

function memoryContext() {
  const entries = new Map(), sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
  };
  return { entries, sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil() {} } };
}
const socketIn = memory => {
  let attachment = null;
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
const GM_TOKEN = "gm-token-for-tv-check";
const device = n => `device-tv-check-4000-8000-${String(n).padStart(12, "0")}`;

test("TV sockets report their sound; only commissioner sockets hear about it, never in state", async () => {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  const say = (ws, deviceId, message, gm = false) => tournament.webSocketMessage(ws,
    JSON.stringify({ actionId:`a${Math.random()}`, ...message, deviceId, ...(gm ? { gmToken:GM_TOKEN } : {}) }));

  const host = socketIn(memory), guest = socketIn(memory), tv = socketIn(memory);
  await say(host, device(1), { type:"hello", payload:{ view:"app", visible:true } }, true);
  await say(guest, device(2), { type:"hello", payload:{ view:"app", visible:true } });
  const hostFrame = host.frames.findLast(frame => frame.type === "state");
  assert.equal(hostFrame.gm, true);
  assert.deepEqual(hostFrame.tvs, [], "the commissioner's frame says no TV is connected");
  assert.equal("tvs" in guest.frames.findLast(frame => frame.type === "state"), false, "a guest never gets it");

  await say(tv, device(3), { type:"hello", payload:{ view:"tv", visible:true, tvSound:"blocked" } });
  let note = host.frames.findLast(frame => frame.type === "tvs");
  assert.equal(note.tvs.length, 1);
  assert.equal(note.tvs[0].sound, "blocked");
  assert.equal(note.tvs[0].visible, true);
  assert.ok(note.tvs[0].ageMs >= 0);
  assert.equal(guest.frames.some(frame => frame.type === "tvs"), false);
  assert.equal(tv.frames.some(frame => frame.type === "tvs"), false, "the TV itself is never a commissioner");

  await say(tv, device(3), { type:"presence", payload:{ visible:true, tvSound:"on" } });
  assert.equal(host.frames.findLast(frame => frame.type === "tvs").tvs[0].sound, "on");
  await say(tv, device(3), { type:"ping", payload:{ visible:true } });
  assert.equal(host.frames.findLast(frame => frame.type === "tvs").tvs[0].sound, "on", "a ping without a report keeps it");
  await say(tv, device(3), { type:"presence", payload:{ visible:true, tvSound:"loud" } });
  assert.equal(host.frames.findLast(frame => frame.type === "tvs").tvs[0].sound, "on", "junk is ignored");
  /* a phone cannot pose as a TV's sound */
  await say(guest, device(2), { type:"presence", payload:{ visible:true, tvSound:"blocked" } });
  assert.equal(host.frames.findLast(frame => frame.type === "tvs").tvs.length, 1);

  /* never tournament state, never stored */
  assert.equal(JSON.stringify(tournament.state).includes("tvSound"), false);
  assert.equal([...memory.entries.values()].some(value => JSON.stringify(value ?? null).includes("tvSound")), false);
  const stateFrame = host.frames.findLast(frame => frame.type === "state");
  assert.equal("tvs" in (stateFrame.state || {}), false);

  /* the TV leaves */
  memory.sockets.splice(memory.sockets.indexOf(tv), 1);
  await tournament.webSocketClose(tv);
  assert.deepEqual(host.frames.findLast(frame => frame.type === "tvs").tvs, []);
});

test("the client reports TV sound from any TV view (the /tv route or the app's own TV mode), on hello, ping and when it changes", () => {
  const client = read("src/lib/client.js");
  assert.match(client, /export function reportTvSound\(status\)/);
  assert.match(client, /const isTvView = \(\) => tvView \|\| isTvRoute\(\);/);
  assert.match(client, /if \(!isTvView\(\) \|\| tvSound === next\) return;/);
  assert.match(client, /export function setTvView\(on\)/);
  assert.match(client, /type:"hello", payload:\{ view:viewName\(\), nonce, visible:pageVisible\(\), \.\.\.tvSoundPayload\(\) \}/);
  assert.match(client, /type: "ping", payload:\{ visible:pageVisible\(\), view:viewName\(\), \.\.\.tvSoundPayload\(\) \}/);
  assert.match(client, /msg\.type === "tvs"\) receiveTvs\(msg\.tvs\)/);
  const app = read("src/App.jsx");
  assert.match(app, /onSoundStatus=\{reportTvSound\}/);
  /* a device that opens TV mode from the menu is counted as a TV */
  assert.match(app, /useEffect\(\(\) => \{ setTvView\(tv\); \}, \[tv\]\);/);
  const worker = read("worker/tournament.js");
  assert.match(worker, /const tv = payload\?\.view === "tv" \? true : payload\?\.view === "app" \? false : wasTv;/);
  assert.match(app, /<TvHealth tvs=\{tournament\.tvs\} receivedAt=\{tournament\.tvsAt\} live=\{!!state\.live\} \/>/);
});

/* ── the TV stays awake ── */
test("TV mode holds a Screen Wake Lock through the one shared helper", async () => {
  assert.equal(tableWakeLock, libWakeLock, "Table view and the TV share createWakeLock");
  const device = read("src/features/tv/TVDevice.jsx");
  assert.match(device, /const lock = createWakeLock\(\);\s*lock\.start\(\);\s*return \(\) => \{ lock\.release\(\); \};/);
  assert.match(read("src/features/tv/TVMode.jsx"), /useTvWakeLock\(\);/);
  /* re-asked when the page comes back, released on exit, silent where unsupported */
  const listeners = {};
  const locks = [];
  const doc = { visibilityState:"visible", addEventListener:(type, fn) => { listeners[type] = fn; },
    removeEventListener:type => { delete listeners[type]; } };
  const nav = { wakeLock:{ request:async () => {
    const lock = { released:false, onrelease:null,
      release:async () => { lock.released = true; lock.onrelease?.(); },
      addEventListener:(type, fn) => { if (type === "release") lock.onrelease = fn; } };
    locks.push(lock);
    return lock; } } };
  const lock = libWakeLock({ nav, doc });
  assert.equal(await lock.start(), true);
  assert.equal(lock.held(), true);
  /* the system drops the lock while the page is hidden */
  doc.visibilityState = "hidden";
  locks[0].onrelease();
  assert.equal(lock.held(), false);
  doc.visibilityState = "visible";
  listeners.visibilitychange();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(locks.length, 2, "asked again on return");
  assert.equal(lock.held(), true);
  await lock.release();
  assert.equal(locks[1].released, true, "released on exit");
  assert.equal(listeners.visibilitychange, undefined);
  assert.equal(await libWakeLock({ nav:{}, doc }).start(), false, "no Wake Lock: nothing, no error");
});

/* ── phones never download the TV or the commissioner's desks ── */
test("App loads TV mode and commissioner-only modules on first use", () => {
  const app = read("src/App.jsx");
  for (const path of ["./features/tv/TVMode.jsx", "./features/qa/QABar.jsx", "./features/qa/QASheet.jsx",
    "./features/geo/GeoDesk.jsx", "./features/awards/AwardsDesk.jsx", "./features/director/FinaleSheets.jsx"]) {
    assert.doesNotMatch(app, new RegExp(`^import [^;]*from "${path.replaceAll(".", "\\.")}";`, "m"), `${path} is not a static import`);
    assert.match(app, new RegExp(`lazyPart\\(\\(\\) => import\\("${path.replaceAll(".", "\\.")}"\\)`), `${path} loads lazily`);
  }
  assert.doesNotMatch(app, /from "qrcode-generator"/, "the QR code ships with the TV");
  for (const name of ["TVMode", "QABar", "QASheet", "GeoDesk", "AwardsDesk", "CrownSheet", "PokerSetupSheet"])
    assert.match(app, new RegExp(`<Suspense fallback=\\{null\\}><${name} `), `${name} renders inside Suspense`);
});

test("lazyPart: once preloaded it renders synchronously, and a mount keeps its type", async () => {
  let loads = 0;
  const Hello = ({ name }) => React.createElement("b", null, `hi ${name}`);
  const Part = lazyPart(async () => { loads++; return { Hello }; }, "Hello");
  const suspended = renderToStaticMarkup(React.createElement(React.Suspense, { fallback:"wait" },
    React.createElement(Part, { name:"Evan" })));
  assert.equal(suspended, "wait", "before the module lands, the quiet fallback");
  await Part.preload();
  await Part.preload();
  assert.equal(loads, 1, "one fetch");
  assert.equal(renderToStaticMarkup(React.createElement(React.Suspense, { fallback:"wait" },
    React.createElement(Part, { name:"Evan" }))), "<b>hi Evan</b>");
  let fails = 0;
  const Broken = lazyPart(async () => { if (fails++ === 0) throw new Error("offline"); return { Hello }; }, "Hello");
  await assert.rejects(Broken.preload());
  await Broken.preload();
  assert.equal(fails, 2, "a failed fetch can be tried again");
});

/* ── chip ink: whichever ink reads better ── */
test("chip ink is computed for contrast; the measured failures now use the dark ink", () => {
  for (const hex of ["#D97742", "#4F93A3", "#6E9450", "#B37A4A"]) {
    assert.equal(chipInkIsDark(hex), true, hex);
    assert.ok(contrastRatio(hex, CHIP_INKS.dark) > 4.5, `${hex} reads at AA with the dark ink`);
  }
  for (const { hex } of CHIP_COLORS) {
    const dark = contrastRatio(hex, CHIP_INKS.dark), bone = contrastRatio(hex, CHIP_INKS.bone);
    const chosen = chipInkIsDark(hex) ? dark : bone;
    assert.equal(chosen, Math.max(dark, bone), `${hex} uses the higher-contrast ink`);
    assert.equal(resolvePlayerIdentity({ [ROSTER[0]]:{ color:hex } }, ROSTER[0]).isLight, chipInkIsDark(hex));
    assert.equal("light" in CHIP_COLORS.find(color => color.hex === hex), false, "no hand-set flag left to drift");
  }
  assert.equal(resolvePlayerIdentity({}, ROSTER[0]).isLight, chipInkIsDark(CHIP_GRAY));
  assert.equal(chipInkIsDark("var(--sun)"), false, "a token keeps bone");
  /* in a browser the inks are the live tokens, so a palette change carries */
  const css = read("src/ui/experience.css");
  const token = name => css.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`))?.[1];
  const ink0 = token("ink0"), bone = token("bone");
  assert.ok(ink0 && bone);
  const saved = { document:globalThis.document, getComputedStyle:globalThis.getComputedStyle };
  try {
    globalThis.document = { documentElement:{} };
    globalThis.getComputedStyle = () => ({ getPropertyValue:name => ({ "--ink0":` ${ink0}`, "--bone":bone })[name] || "" });
    __resetChipInks();
    assert.deepEqual({ ...chipInks() }, { dark:ink0, bone });
    for (const { hex } of [...CHIP_COLORS, { hex:CHIP_GRAY }])
      assert.equal(chipInkIsDark(hex), contrastRatio(hex, ink0) > contrastRatio(hex, bone), `${hex} follows the live tokens`);
  } finally {
    Object.assign(globalThis, saved);
    if (saved.document === undefined) delete globalThis.document;
    if (saved.getComputedStyle === undefined) delete globalThis.getComputedStyle;
    __resetChipInks();
  }
  assert.equal(chipInks(), CHIP_INKS, "no stylesheet: the fallback");
  for (const path of ["src/features/identity/PlayerIdentity.jsx", "src/features/tv/ChipTowers.jsx"])
    assert.doesNotMatch(read(path), /\.light\b/, `${path} reads the computed identity.isLight`);
  assert.match(read("src/features/profile/ProfileEditor.jsx"), /chipInkIsDark\(c\.hex\)/);
});

/* ── the bets rack never covers the board ── */
test("the bets rack sits at the board's head, in the page's flow, never over the board", () => {
  /* Oct 3: the rack is the lower glass of the board's head pane, above the
     board, so no pot total, + or backer is under it at any scroll position */
  const wagers = read("src/features/wagers/Wagers.jsx");
  assert.match(wagers, /<header className=\{`fd-wagers-event-heading[\s\S]*className=\{`fd-wagers-rack[\s\S]*<\/header>[\s\S]*fd-wagers-picks/);
  const css = read("src/features/wagers/wagers.css");
  assert.doesNotMatch(css, /\.fd-wagers-rack \{[^}]*position:(fixed|sticky)/);
  assert.doesNotMatch(css, /\.fd-wagers-rack \{[^}]*bottom:/);
});

/* ── dev previews ── */
test("dev previews: /dev/x.html is served as the page, not redirected onto dev/x.jsx", () => {
  const config = read("vite.config.js");
  assert.match(config, /plugins: \[devPreviews\(\), react\(\), cloudflare\(\)/, "ahead of the Worker's asset handler");
  assert.match(config, /apply: "serve"/, "dev only, never in a build");
  assert.match(config, /server\.transformIndexHtml\(req\.url, html\)/);
});
