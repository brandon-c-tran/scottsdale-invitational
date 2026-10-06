/* The menus: one model (features/director/menuModel.js) and one renderer
   (ui/Menu.jsx) for the More menu and the commissioner's menu; the pill's
   edge cases (Skip) wait in its more tray. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, allEventsOf } from "../shared/core.js";
import { resolveDirector } from "../shared/show.js";
import { commissionerMenu, moreMenu } from "../src/features/director/menuModel.js";
import { deviceLabel, speakerStage, speakerValue } from "../src/features/speaker/speakerModel.js";
import { directorPill } from "../src/features/director/directorPill.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { MenuSections } from "./src/ui/Menu.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("menus.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { MenuSections } = mod.exports;

const ids = sections => sections.flatMap(section => section.items.map(item => item.id));
const full = { gm:true, audioDirector:true, speaker:"Living Room", tvNow:"Opening 2 of 2", crownReady:true, lockerRoom:true,
  away:["Ben"], geoPhotos:8, awardsNote:"2 published", onDeck:"Long Putt", takeBacks:[{ id:"putt", name:"Long Putt" }], frozen:true,
  snapshotExport:true, qaAllowed:true, qaOn:true, progressReset:true };

test("the More menu: You, Weekend, Commissioner, by icon, no sentences", () => {
  const guest = moreMenu({ gm:false });
  assert.deepEqual(guest.map(section => section.id), ["you", "weekend", "commissioner"]);
  assert.deepEqual(ids(guest), ["profile", "trip", "rules", "tv", "commissioner"]);
  assert.equal(guest.at(-1).items[0].icon, "lock", "locked until the PIN");
  /* one way in for the commissioner: the header's GM, so the More menu has no second route */
  assert.deepEqual(moreMenu({ gm:true }).map(section => section.id), ["you", "weekend"]);
  assert.equal(moreMenu({ gm:true, guestLens:true }).at(-1).items[0].name, "Back to commissioner", "the guest view's way back");
  for (const section of guest) assert.ok(section.icon && section.title.split(" ").length <= 2, section.id);
});

test("the commissioner's menu: Now, TV and sound, Games, People and trip, Setup, Exit alone at the foot", () => {
  const menu = commissionerMenu(full);
  assert.deepEqual(menu.map(section => section.id), ["now", "room", "games", "people", "setup", "exit"]);
  assert.deepEqual(menu.map(section => section.title), ["Now", "TV and sound", "Games", "People and trip", "Setup", null]);
  const of = id => menu.find(section => section.id === id).items.map(item => item.id);
  assert.deepEqual(of("now"), ["crown", "lockStart", "takeBack:putt", "lockerRoom", "unfreeze"], "only what is actionable now, first");
  assert.deepEqual(of("room"), ["showControl", "audioDirector"]);
  assert.deepEqual(of("games"), ["geo", "trivia", "awards"]);
  assert.deepEqual(of("people"), ["attendance", "travelSheet", "logistics"]);
  assert.deepEqual(of("setup"), ["gmDevices", "snapshot", "qa", "reset"]);
  const flat = menu.flatMap(section => section.items);
  assert.equal(flat.at(-1).id, "exit");
  assert.equal(menu.at(-1).title, null, "Exit stands alone");
  assert.deepEqual(flat.filter(item => item.tone === "destructive").map(item => item.id), ["takeBack:putt", "unfreeze", "reset"]);
  assert.equal(flat.filter(item => item.id === "reset").length, 1, "one reset entry");
  /* plain names: the TV and the speaker, by what they are */
  const row = id => flat.find(item => item.id === id);
  assert.equal(row("lockStart").name, "Lock and start", "the pill's words for the pill's write");
  assert.equal(row("showControl").name, "TV");
  assert.equal(row("showControl").value, "Opening 2 of 2");
  assert.equal(row("audioDirector").name, "Speaker");
  assert.equal(row("audioDirector").value, "Living Room");
  assert.equal(row("qa").pressed, undefined, "QA opens the console; the strip's switch is inside it");
  assert.notEqual(row("qa").chevron, false);
  assert.ok(!flat.some(item => item.id === "tvShortcut"), "the TV sound shortcut lives in the TV sheet");
  assert.doesNotMatch(JSON.stringify(menu), /Show Control|Audio Director/);
  for (const item of flat) if (item.value) assert.ok(!/[.!]$/.test(String(item.value)) && String(item.value).length <= 32, item.id);
  /* capabilities off: their rows are gone, never disabled; empty sections drop out */
  const bare = commissionerMenu({});
  for (const id of ["qa", "reset", "snapshot", "audioDirector", "crown", "lockStart", "unfreeze"]) assert.ok(!ids(bare).includes(id), id);
  assert.deepEqual(bare.map(section => section.id), ["room", "games", "people", "setup", "exit"]);
  assert.deepEqual(ids(bare).slice(0, 1), ["showControl"], "the TV row is always there");
});

test("the Speaker row stands whenever audio is on, whatever the TV capability", () => {
  for (const showControl of [true, false]) {
    const menu = commissionerMenu({ audioDirector:true, showControl, speaker:"Not connected" });
    const room = menu.find(section => section.id === "room");
    assert.deepEqual(room.items.map(item => item.id), ["showControl", "audioDirector"], `showControl ${showControl}`);
    assert.equal(room.items[1].value, "Not connected");
  }
  assert.ok(!ids(commissionerMenu({ showControl:true })).includes("audioDirector"), "no audio, no Speaker row");
});

test("the Speaker row's value: the speaker, else what stands between", () => {
  assert.equal(speakerValue(null), null, "still asking");
  assert.equal(speakerValue({ ok:false, error:"Commissioner authentication required" }), null);
  assert.equal(speakerValue({ ok:true, configured:false }), "Set up");
  assert.equal(speakerValue({ ok:true, configured:true, connected:false }), "Not connected");
  assert.equal(speakerValue({ ok:true, configured:true, connected:false, reconnect:true }), "Reconnect");
  assert.equal(speakerValue({ ok:true, configured:true, connected:true, device:{ id:"d", name:"Living Room" } }), "Living Room");
  assert.equal(speakerValue({ ok:true, configured:true, connected:true, device:null }), "No speaker");
  assert.equal(speakerStage({ configured:true, connected:true }), "connected");
  assert.equal(deviceLabel({ name:"Den", active:true }), "Den");
  assert.equal(deviceLabel({ name:"Den", restricted:true }), "Den, unavailable");
});

test("the QA row opens the console; Reset game progress has one entry, in Setup", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /case "showControl": case "audioDirector": case "qa":[^\n]*\n[^\n]*return sheet\(id\)/);
  assert.doesNotMatch(app, /case "qa": toggleQa/);
  const console_ = readFileSync(new URL("../src/features/qa/QASheet.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(console_, /name="Reset game progress"/, "the console no longer duplicates the reset");
  assert.match(console_, /name="QA strip" pressed=/, "the strip's on/off is a switch in the console");
  assert.doesNotMatch(app, /Show Control"|Audio Director/, "no old names on screen");
});

test("one renderer: sections with icon heads, 52px rows, values on the right", () => {
  const html = renderToStaticMarkup(React.createElement(MenuSections, { sections:commissionerMenu(full), onItem:() => {} }));
  assert.match(html, /<h3 class="fd-menu-head"><span class="fd-menu-head-glyph"/);
  assert.match(html, /<span class="fd-menu-name">Who is coming<\/span><span class="fd-menu-value">1 away<\/span>/);
  assert.match(html, /<span class="fd-menu-name">QA<\/span><span class="fd-menu-value">Strip on<\/span>/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /—|!/);
  const css = readFileSync(new URL("../src/ui/menu.css", import.meta.url), "utf8");
  assert.match(css, /\.fd-menu-row \{[^}]*min-height:52px;/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "tokens only");
});

test("the pill: Skip and the alternatives ride in the more tray, never beside the pill", () => {
  const state = { ...structuredClone(EMPTY_STATE), eventOrder:["volley", "pickleball"] };
  const events = allEventsOf(state);
  const model = directorPill(state, events, resolveDirector(state, events, { showControl:false }));
  assert.ok(model.extras.length >= 2);
  assert.deepEqual(model.extras.map(extra => extra.kind), model.extras.map(extra => extra.label === "Skip" ? "skip" : "alt"));
  assert.equal(model.extras.at(-1).kind, "skip", "edge cases last");
  const pill = readFileSync(new URL("../src/features/director/DirectorPill.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(pill, /fd-director-extras/, "no floating extras row");
  assert.match(pill, /trayOpen && <PillTray/);
});
