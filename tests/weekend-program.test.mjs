/* Weekend, the program: now and next by the live order (never a clock),
   the payouts ladders, and the drawn rules' data (every set pictured, every
   label from the one words file, at most four words). */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { programCover, payoutRows } from "../src/features/weekend/programModel.js";
import { STEP_SETS, gameStepsModel, stepSetId, allStepKeys, unusedWordKeys } from "../src/features/rules/gameSteps.js";
import { RULES_WORDS } from "../src/features/rules/rulesWords.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { RULE_PICTURES, NOTE_GLYPHS } from "./src/features/rules/RulePictures.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("weekend-program.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { RULE_PICTURES, NOTE_GLYPHS } = mod.exports;

let seq = 0;
const at = target => {
  const state = structuredClone(EMPTY_STATE);
  const result = applyAction(state, "qaAdvance", { target, seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true },
    { isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"t", actionId:`t${++seq}`, showControl:false });
  assert.ok(result.ok, result.error);
  return state;
};

test("the cover reads now and next by the live order, never a time", () => {
  const locker = at("locker");
  const before = programCover(locker, allEventsOf(locker));
  assert.equal(before.mode, "before");
  assert.equal(before.lead.label, "First");
  assert.equal(before.lead.event.id, "putt");
  assert.equal(before.then.event.id, "die");
  assert.equal(before.then.label, "Then", "the row under the cover reads the same in every state");

  const open = at("event:putt:open");
  const live = programCover(open, allEventsOf(open));
  assert.deepEqual([live.lead.label, live.lead.event.id, live.lead.live, live.then.label, live.then.event.id],
    ["Now", "putt", true, "Then", "die"]);

  const done = at("event:bball1:done");
  const between = programCover(done, allEventsOf(done));
  assert.equal(between.lead.label, "Next", "nothing in play: the next event leads, unlit");
  assert.equal(between.lead.live, false);
  assert.equal(between.then.label, "Then");

  const crowned = at("crowned");
  assert.equal(programCover(crowned, allEventsOf(crowned)).mode, "kept");
  for (const cover of [before, live, between])
    assert.ok(!/\d{1,2}:\d{2}|AM|PM/.test(JSON.stringify([cover.lead?.label, cover.then?.label])), "no clock");
});

test("payouts: one ladder per session, an event that pays its own way on its own row, the finale on none", () => {
  const rows = payoutRows(allEventsOf(structuredClone(EMPTY_STATE)));
  const own = rows.filter(row => row.own).map(row => row.events[0].id);
  assert.deepEqual(own.sort(), ["bball5", "ragecage"]);
  assert.deepEqual(rows.find(row => row.events.some(ev => ev.id === "putt")).pays, [400, 200, 100]);
  assert.ok(!rows.some(row => row.events.some(ev => ev.finale)));
});

test("every rules set is drawn, every label comes from the words file in four words or fewer", () => {
  for (const id of Object.keys(STEP_SETS)) {
    const model = gameStepsModel(id);
    for (const step of model.steps) assert.ok(RULE_PICTURES[step.key], `${step.key}: drawn`);
    for (const note of model.notes) assert.ok(NOTE_GLYPHS[note.glyph], `${note.key}: glyph ${note.glyph}`);
  }
  for (const key of allStepKeys()) {
    assert.ok(RULES_WORDS[key], `${key}: has words`);
    assert.ok(RULES_WORDS[key].split(/\s+/).length <= 4, `${key}: "${RULES_WORDS[key]}" is over four words`);
    assert.ok(!/—|!/.test(RULES_WORDS[key]), `${key}: no em dash or exclamation`);
  }
  assert.deepEqual(unusedWordKeys(), [], "no orphan words");
  for (const ev of allEventsOf(structuredClone(EMPTY_STATE))) assert.ok(stepSetId(ev), `${ev.id}: has drawn rules`);
  assert.equal(stepSetId({ game:"basketball", variant:"5v5" }), "basketball:5v5");
  assert.equal(stepSetId("basketball"), "basketball:1v1", "a game with formats opens on its first");
  assert.equal(stepSetId("nope"), null);
});
