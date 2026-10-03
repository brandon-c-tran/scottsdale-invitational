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
const full = { gm:true, showControl:true, scene:"Opening 1/3", crownReady:true, lockerRoom:true, away:["Ben"], geoPhotos:8,
  awardsNote:"2 published", onDeck:"Long Putt", takeBacks:[{ id:"putt", name:"Long Putt" }], frozen:true,
  snapshotExport:true, qaAllowed:true, qaOn:true, progressReset:true };

test("the More menu: You, Weekend, Commissioner, by icon, no sentences", () => {
  const guest = moreMenu({ gm:false });
  assert.deepEqual(guest.map(section => section.id), ["you", "weekend", "commissioner"]);
  assert.deepEqual(ids(guest), ["profile", "trip", "rules", "tv", "commissioner"]);
  assert.equal(guest.at(-1).items[0].icon, "lock", "locked until the PIN");
  assert.equal(moreMenu({ gm:true }).at(-1).items[0].name, "Commissioner menu");
  for (const section of guest) assert.ok(section.icon && section.title.split(" ").length <= 2, section.id);
});

test("the commissioner's menu groups by frequency; rare and destructive rows last, Exit alone at the foot", () => {
  const menu = commissionerMenu(full);
  assert.deepEqual(menu.map(section => section.id), ["show", "weekend", "fix", "records", "rehearsal", "exit"]);
  const flat = menu.flatMap(section => section.items);
  assert.equal(flat.at(-1).id, "exit");
  assert.equal(menu.at(-1).title, null, "Exit stands alone");
  const destructive = flat.filter(item => item.tone === "destructive").map(item => item.id);
  assert.deepEqual(destructive, ["unfreeze", "reset"]);
  for (const id of destructive) assert.ok(["fix", "rehearsal"].includes(menu.find(section => section.items.some(item => item.id === id)).id));
  assert.equal(flat.find(item => item.id === "qa").pressed, true, "QA mode is a switch");
  for (const item of flat) if (item.value) assert.ok(!/[.!]$/.test(String(item.value)) && String(item.value).length <= 24, item.id);
  /* capabilities off: their rows are gone, never disabled */
  const bare = ids(commissionerMenu({}));
  for (const id of ["qa", "reset", "snapshot", "showControl", "crown", "lockBets", "unfreeze"]) assert.ok(!bare.includes(id), id);
  assert.deepEqual(commissionerMenu({}).map(section => section.id), ["show", "weekend", "records", "exit"]);
});

test("one renderer: sections with icon heads, 52px rows, values on the right, a switch for QA", () => {
  const html = renderToStaticMarkup(React.createElement(MenuSections, { sections:commissionerMenu(full), onItem:() => {} }));
  assert.match(html, /<h3 class="fd-menu-head"><span class="fd-menu-head-glyph"/);
  assert.match(html, /<span class="fd-menu-name">Who is here<\/span><span class="fd-menu-value">1 away<\/span>/);
  assert.match(html, /aria-pressed="true"[^>]*><span class="fd-menu-name">QA mode<\/span><span class="fd-menu-switch is-on"/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /—|!/);
  const css = readFileSync(new URL("../src/ui/menu.css", import.meta.url), "utf8");
  assert.match(css, /\.fd-menu-row \{[^}]*min-height:52px;/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "tokens only");
});

test("the pill: Skip and the alternatives ride in the more tray, never beside the pill", () => {
  const state = { ...structuredClone(EMPTY_STATE), eventOrder:["pickleball", "volley"] };
  const events = allEventsOf(state);
  const model = directorPill(state, events, resolveDirector(state, events, { showControl:false }));
  assert.ok(model.extras.length >= 2);
  assert.deepEqual(model.extras.map(extra => extra.kind), model.extras.map(extra => extra.label === "Skip" ? "skip" : "alt"));
  assert.equal(model.extras.at(-1).kind, "skip", "edge cases last");
  const pill = readFileSync(new URL("../src/features/director/DirectorPill.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(pill, /fd-director-extras/, "no floating extras row");
  assert.match(pill, /trayOpen && <PillTray/);
});
