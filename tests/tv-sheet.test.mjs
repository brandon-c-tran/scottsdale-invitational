/* The commissioner's TV sheet (features/director/TvSheet.jsx and its pure
   model): what is on the TV now, the scenes he can put on, the steps as
   lamps, the TVs in the room, and plain names. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, allEventsOf } from "../shared/core.js";
import { resolveShowScene } from "../shared/show.js";
import { applyAction } from "../worker/actions.js";
import {
  tvAdvanceLabel, tvAmbient, tvNowCard, tvNowLabel, tvRetry, tvRoom, tvSceneTiles,
} from "../src/features/director/tvSheetModel.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { TvSheet } from "./src/features/director/TvSheet.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("tv-sheet.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { TvSheet } = mod.exports;

/* Sheet's presence motion is a layout effect; the server renderer says so once per render */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"tv-gm", actionId:`tv-${++seq}`, showControl:true, environment:"local" });
const fresh = () => structuredClone(EMPTY_STATE);
const noop = () => {};
const render = (state, extra = {}) => {
  const events = allEventsOf(state);
  return renderToStaticMarkup(React.createElement(TvSheet, { state, events, scene:resolveShowScene(state, events), scenes:true,
    onClose:noop, onStart:noop, onAdvance:noop, onEnd:noop, onRetry:noop, onShortcut:noop, ...extra }));
};

test("idle: the TV runs itself (standings), and the scenes are tiles", () => {
  const state = fresh();
  const events = allEventsOf(state);
  const ambient = tvAmbient(state, events);
  assert.equal(ambient.label, "Standings");
  assert.equal(tvNowLabel(null, ambient), "Standings");
  assert.deepEqual(tvSceneTiles(state, events).map(tile => tile.kind), ["opening", "standings"]);
  assert.deepEqual(tvSceneTiles(state, events, events[0]).map(tile => tile.kind), ["opening", "event-intro", "standings"]);
  const html = render(state);
  assert.match(html, /On the TV now/);
  assert.match(html, /Put on the TV/);
  assert.match(html, /class="fd-tv-tile"/);
  assert.match(html, /Copy TV sound shortcut/);
  assert.doesNotMatch(html, /Show Control|Audio Director|Start a scene/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /—|!/);
  /* without the capability: the card and the room, no scenes */
  const plain = render(state, { scenes:false });
  assert.doesNotMatch(plain, /Put on the TV/);
  assert.match(plain, /On the TV now/);
});

test("mid-scene: the card leads with the scene and its steps as lamps; Next is the one primary", () => {
  const state = fresh();
  assert.equal(applyAction(state, "startShowScene", { kind:"opening" }, gm()).ok, true);
  const events = allEventsOf(state);
  const scene = resolveShowScene(state, events);
  assert.equal(tvNowLabel(scene, tvAmbient(state, events)), "Opening 1 of 2");
  const card = tvNowCard(scene, tvAmbient(state, events));
  assert.deepEqual(card.steps.map(step => step.state), ["live", "next"]);
  assert.equal(tvAdvanceLabel(scene), "Next");
  const html = render(state);
  assert.match(html, /fd-field-live fd-lamp is-live/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Title<\/span>/);
  assert.match(html, /Roster<\/span>/);
  assert.doesNotMatch(html, /Put on the TV/, "no tiles while a scene plays");
  for (const label of ["End", "Skip"]) assert.ok(html.includes(`>${label}</button>`), label);
  assert.equal(applyAction(state, "advanceShowScene", { id:state.showControl.active.id }, gm()).ok, true);
  assert.equal(tvAdvanceLabel(resolveShowScene(state, events)), "Finish");
});

test("retry only for a scene that was ended before its last step", () => {
  const state = fresh();
  applyAction(state, "startShowScene", { kind:"standings" }, gm());
  applyAction(state, "endShowScene", { id:state.showControl.active.id, outcome:"skipped" }, gm());
  assert.equal(tvRetry(state), null, "a skip is not a failure");
  applyAction(state, "startShowScene", { kind:"opening" }, gm());
  applyAction(state, "endShowScene", { id:state.showControl.active.id, outcome:"cancelled" }, gm());
  assert.deepEqual(tvRetry(state)?.label, "Opening");
  assert.match(render(state), /Retry Opening/);
});

test("the TVs in the room: each with its sound, or none connected", () => {
  assert.equal(tvRoom({ tvs:null }), null);
  assert.equal(tvRoom({ tvs:[], live:true }).missing, true);
  const now = 1_000_000;
  const room = tvRoom({ tvs:[{ ageMs:1000, sound:"on" }, { ageMs:1000, sound:"blocked" }, { ageMs:120000, sound:"on" }],
    receivedAt:now, now });
  assert.deepEqual(room.tvs.map(tv => tv.sound), ["on", "off"], "a TV gone quiet drops out");
  const html = render(fresh(), { tvs:[{ ageMs:1000, sound:"blocked" }], tvsAt:Date.now() });
  assert.match(html, /Sound off/);
  assert.match(render(fresh(), { tvs:[], tvsAt:Date.now() }), /No TV connected/);
});
