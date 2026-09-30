import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, EMPTY_STATE, allEventsOf, resolveWeekendOperation } from "../shared/core.js";
import { PHASES, weekendPhase, liveEventOf } from "../src/ui/phase.js";
import { desertPhase, DESERT_PHASES } from "../src/features/tv/desertModel.js";
import { tvLiveEvent } from "../src/features/tv/tvModel.js";

/* TH1, the living weekend: the session phase themes phones and the TV from
   one pure function, the surface ramp is legible in every phase, and the
   theme never animates on first load. */
const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");
const load = async (name, contents) => {
  const compiled = await build({
    stdin:{ contents, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"],
    loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL(name, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};
const ui = await load("living-theme.cjs", `
  export { phaseShouldEase, applyPhase, PHASE_SHIFT_CLASS, PHASE_SHIFT_MS } from "./src/ui/usePhaseTheme.js";
  export { Schedule } from "./src/features/weekend/Schedule.jsx";
  export { Board, postedLine } from "./src/features/standings/Standings.jsx";
  export { sinceSnapshot, sinceSummary } from "./src/features/home/guestUpdates.js";
  export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
`);

/* ── the palette, parsed from experience.css ── */
const css = read("src/ui/experience.css");
const declarations = body => Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)]
  .map(([, name, value]) => [name, value.trim()]));
const block = selector => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `experience.css has ${selector}`);
  return declarations(css.slice(at, css.indexOf("}", at)));
};
const BASE = block(":root");
const OVERRIDES = Object.fromEntries(PHASES.filter(p => p !== "fri").map(p => [p, block(`:root[data-phase="${p}"]`)]));
const palette = phase => {
  const tokens = { ...BASE, ...(OVERRIDES[phase] || {}) };
  const resolve = (value, depth = 0) => {
    const ref = /^var\(--([\w-]+)\)$/.exec(value);
    return ref && depth < 8 ? resolve(tokens[ref[1]], depth + 1) : value;
  };
  return Object.fromEntries(Object.keys(tokens).map(name => [name, resolve(tokens[name])]));
};
const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `${hex} is a flat hex color`);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const BODY_TEXT = ["ink", "bone", "muted", "muted2", "clay-text", "disabled", "sun", "live2", "green", "accent2",
  "night-text", "night-text2", "signal-text"];
const SURFACES = ["bg", "paper", "paper2", "night", "night2", "night-deep"];
const STUDY = {
  fri:{ bg:"#0e191c", paper:"#192529", paper2:"#233034" },
  sam:{ bg:"#231d14", paper:"#2c261c", paper2:"#342e24" },
  sap:{ bg:"#261913", paper:"#30221a", paper2:"#3a2a23" },
  san:{ bg:"#1f1212", paper:"#2c1d1d", paper2:"#382828" },
  fin:{ bg:"#111116", paper:"#1d1d22", paper2:"#29292f" },
};

test("every body-text token reads at 4.5:1 on every surface in every phase", () => {
  const failures = [];
  for (const phase of PHASES) {
    const tokens = palette(phase);
    for (const text of BODY_TEXT) for (const surface of SURFACES) {
      const ratio = contrast(tokens[text], tokens[surface]);
      if (ratio < 4.5) failures.push(`${phase} ${text}/${surface} ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("each session swaps the surface ramp from the study; bone, gold, accents and ink0 never change", () => {
  const constant = ["ink", "bone", "ink0", "sun", "accent", "accent2", "pool", "olive", "clay", "clay-text", "live2",
    "green", "silver", "bronze", "line", "poker-25", "poker-100", "poker-500", "poker-1000"];
  for (const phase of PHASES) {
    const tokens = palette(phase);
    for (const [name, hex] of Object.entries(STUDY[phase])) assert.equal(tokens[name].toLowerCase(), hex, `${phase} --${name}`);
    assert.equal(tokens["night-deep"], tokens.bg, `${phase}: the night ramp is the surface ramp`);
    assert.equal(tokens.night, tokens.paper);
    assert.equal(tokens.night2, tokens.paper2);
    assert.match(tokens.chrome, /^rgba\(/, `${phase} has its own chrome`);
    assert.match(tokens.scrim, /^rgba\(/);
    assert.ok(tokens.phase, `${phase} has a --phase color`);
    for (const name of constant) assert.equal(tokens[name], palette("fri")[name], `${phase} keeps --${name}`);
  }
  for (const phase of Object.keys(OVERRIDES))
    for (const name of ["ink", "bone", "sun", "ink0", "accent", "clay"])
      assert.ok(!(name in OVERRIDES[phase]), `${phase} does not override --${name}`);
  assert.match(css, /\.fd-header \{[^}]*box-shadow:inset 0 3px 0 var\(--phase\)/, "the phase line tops the header");
  assert.match(css, /\.fd-sheet-overlay(::before)? \{[^}]*background:var\(--scrim\)/, "the scrim follows the phase");
});

test("the phase shift is gated by a class, eases 1.5s, and reduced motion switches at once", () => {
  assert.match(css, /:root\.fd-phase-shift[^{]*\{\s*transition:background-color 1\.5s/);
  assert.match(css, /prefers-reduced-motion:reduce\)\s*\{\s*:root\.fd-phase-shift[^{]*\{ transition:none !important; \}/);
  assert.equal(ui.PHASE_SHIFT_MS, 1500);
  assert.equal(ui.phaseShouldEase(null, "sam"), false, "first application never eases");
  assert.equal(ui.phaseShouldEase({ phase:"fri", settled:false }, "sap"), false, "nor the first snapshot");
  assert.equal(ui.phaseShouldEase({ phase:"sap", settled:true }, "sap"), false);
  assert.equal(ui.phaseShouldEase({ phase:"sam", settled:true }, "sap"), true, "a session change while open eases");
  assert.equal(ui.phaseShouldEase({ phase:"sam", settled:true }, "sap", { reduced:true }), false);
});

function fakeDocument(bgByPhase) {
  const attrs = {}, classes = new Set(), meta = { content:"#0e191c", setAttribute(k, v) { this[k] = v; } };
  const documentElement = {
    setAttribute:(k, v) => { attrs[k] = v; },
    classList:{ add:c => classes.add(c), remove:c => classes.delete(c), contains:c => classes.has(c) },
  };
  return { attrs, classes, meta, documentElement,
    querySelector:selector => selector === 'meta[name="theme-color"]' ? meta : null,
    defaultView:{ getComputedStyle:() => ({ getPropertyValue:name => name === "--bg" ? ` ${bgByPhase[attrs["data-phase"]]}` : "" }) } };
}

test("applying a phase sets data-phase and the theme-color; staging keeps its blue", () => {
  const bg = Object.fromEntries(PHASES.map(phase => [phase, palette(phase).bg]));
  const timers = { pending:null, setTimeout(fn) { this.pending = fn; return 1; }, clearTimeout() {} };
  const doc = fakeDocument(bg);
  ui.applyPhase(doc, "san", { staging:false, timers });
  assert.equal(doc.attrs["data-phase"], "san");
  assert.equal(doc.meta.content, "#1f1212", "the status bar follows the session");
  assert.equal(doc.classes.has(ui.PHASE_SHIFT_CLASS), false, "no ease unless asked");
  ui.applyPhase(doc, "fin", { ease:true, staging:false, timers });
  assert.equal(doc.classes.has(ui.PHASE_SHIFT_CLASS), true);
  timers.pending();
  assert.equal(doc.classes.has(ui.PHASE_SHIFT_CLASS), false, "the class comes off after the shift");
  const staging = fakeDocument(bg);
  staging.meta.content = "#101A33";
  ui.applyPhase(staging, "sap", { staging:true, timers });
  assert.equal(staging.attrs["data-phase"], "sap");
  assert.equal(staging.meta.content, "#101A33");
  /* the build stamps Friday for production and blue for staging */
  const vite = read("vite.config.js");
  assert.match(vite, /APP_THEME_COLOR: staging \? "#101A33" : "#0e191c"/);
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.theme_color, palette("fri").bg);
  assert.equal(manifest.background_color, palette("fri").bg);
});

/* ── one phase function for phones and the TV ── */
test("phones and the TV read the same phase function, and phones never import TV code", () => {
  assert.equal(desertPhase, weekendPhase);
  assert.equal(DESERT_PHASES, PHASES);
  assert.equal(tvLiveEvent, liveEventOf);
  const phaseSource = read("src/ui/phase.js") + read("src/ui/usePhaseTheme.js");
  assert.doesNotMatch(phaseSource, /features\/tv/);
  assert.match(read("src/features/tv/TVMode.jsx"), /weekendPhase\(state, events, \{ liveEvent:liveEv, operationEvent:operationEv \}\)/);
  assert.match(read("src/App.jsx"), /usePhaseTheme\(\{ state, events, operationEvent:weekendOperation\.event, settled:ready \}\)/);
});

test("the phase walks the weekend: Friday until live, the event in play, the last result, the finale", () => {
  const events = allEventsOf(EMPTY_STATE);
  const ev = id => events.find(item => item.id === id);
  const locker = structuredClone(EMPTY_STATE);
  locker.results = { pickleball:{ slots:[["Adi"]], ts:5 } };
  assert.equal(weekendPhase(locker, events), "fri", "before the weekend goes live, Friday whatever is stored");
  const live = { ...structuredClone(EMPTY_STATE), live:true };
  assert.equal(weekendPhase({ ...live, onDeck:"volley" }, events), "sap", "the open market's session");
  const played = { ...live, results:{ putt:{ slots:[["Evan"]], ts:1 }, pickleball:{ slots:[["Adi"]], ts:5 } } };
  assert.equal(weekendPhase(played, events), "sam");
  assert.equal(weekendPhase({ ...played, poker:{ id:"poker" } }, events), "fin");
  assert.equal(weekendPhase({ ...played, frozen:true }, events), "fin");
  /* whatever the state, the TV's explicit inputs and the phone's defaults agree */
  const states = [locker, live, { ...live, onDeck:"volley" }, played, { ...played, onDeck:"trivia" }, { ...played, frozen:true }];
  for (const state of states) {
    const operationEvent = resolveWeekendOperation(state, events).event;
    const tv = weekendPhase(state, events, { liveEvent:tvLiveEvent(state, events, operationEvent), operationEvent });
    assert.equal(weekendPhase(state, events), tv);
    assert.ok(PHASES.includes(tv));
  }
  assert.equal(ev("volley").session, "sap");
});

/* ── contrast fixes ── */
function sourceFiles(dir) {
  return readdirSync(join(root, dir)).flatMap(name => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? sourceFiles(path) : /\.(css|jsx?|mjs)$/.test(name) ? [path] : [];
  });
}
test("text is never drawn in clay; clay stays a fill and a line", () => {
  const offenders = [];
  for (const path of sourceFiles("src")) {
    read(path).split("\n").forEach((line, i) => {
      if (/(^|[\s{;,])color:\s*var\(--clay\)|color:\s*[^,;]*"var\(--clay\)"|tone:[^,]*"var\(--clay\)"/.test(line))
        offenders.push(`${path}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test("the header's dead phase table is gone", () => {
  const app = read("src/App.jsx");
  assert.doesNotMatch(app, /const PHASE = \{/);
  assert.doesNotMatch(app, /phaseOf/);
});

/* ── P3 ── */
const render = element => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:{} }, element));

test("Events says Draw pending and Setup only on the next event", () => {
  const state = structuredClone(EMPTY_STATE);
  const events = allEventsOf(state);
  const html = render(React.createElement(ui.Schedule, { state, events, gm:false, open() {}, onReorder() {} }));
  const count = label => (html.match(new RegExp(`>${label}<`, "g")) || []).length;
  assert.ok(count("Draw pending") + count("Setup") <= 1, "at most the next event carries a preparation label");
  const next = resolveWeekendOperation(state, events).event;
  const status = next.teamCfg ? "Draw pending" : "Setup";
  assert.ok(html.includes(`${next.name}. ${status}.`), "the next event keeps its label");
});

test("the Standings sheet names itself once, in its header", () => {
  const state = structuredClone(EMPTY_STATE);
  const events = allEventsOf(state);
  const props = { state, standings:[], me:null, deltas:{}, allTied:true, champion:null, coChamps:[], gm:false, events,
    myAtRisk:0, onOpen() {}, onAdjust() {}, onPlayer() {}, finaleDone:false };
  const embedded = render(React.createElement(ui.Board, { ...props, embedded:true }));
  assert.doesNotMatch(embedded, />Standings</, "the sheet header carries the title");
  assert.doesNotMatch(embedded, /events posted/, "and the count");
  assert.match(ui.postedLine(state, events), /^0 of \d+ events posted$/);
  assert.match(read("src/App.jsx"), /<Sheet title=\{champion \? "Final standings" : "Standings"\} subtitle=\{postedLine\(state, events\)\}/);
});

test("the since line is one line: what it opens, then a count", () => {
  const me = "Brandon";
  const events = BUILTIN_EVENTS;
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  const standings = [{ player:me, pts:1000, rank:1 }, { player:"Adi", pts:1000, rank:1 }];
  const at = Date.UTC(2026, 9, 31, 20, 0);
  const saved = ui.sinceSnapshot(state, me, events, standings, 1, at);
  const later = structuredClone(state);
  const ids = events.filter(ev => !ev.teamCfg && !ev.finale).slice(0, 3).map(ev => ev.id);
  ids.forEach((id, i) => { later.results[id] = { slots:[["Adi"], [], []], ts:at + i + 1 }; });
  later.adjustments = [{ id:"r", player:me, delta:200, ts:1 }];
  const summary = ui.sinceSummary(saved, later, me, events, [{ player:"Adi", pts:3000, rank:1 }, { player:me, pts:1200, rank:2 }],
    at + 30 * 60_000);
  const newest = events.find(ev => ev.id === ids[2]);
  assert.equal(summary.route.type, "event");
  assert.equal(summary.route.evId, newest.id, "it opens the newest result");
  assert.match(summary.text, new RegExp(`^Since \\d{1,2}:\\d{2} (AM|PM) · ${newest.name}: Adi won · 4 more$`));
  assert.match(summary.detail, /3 results · .* · ruling \+200 · down 1 place, now 2nd$/);
});
