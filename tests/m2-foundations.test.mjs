import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_EVENTS,
  EMPTY_STATE,
  RESET_PROGRESS_CONFIRMATION,
} from "../shared/core.js";
import {
  SHOW_HISTORY_LIMIT,
  SHOW_SCENE_DEFINITIONS,
  createShowScene,
  finishShowScene,
  resolveShowScene,
  validateShowSceneRequest,
} from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { hydrateStoredState } from "../worker/state.js";
import { buildSnapshot, validateSnapshot } from "../worker/snapshot.js";

const events = BUILTIN_EVENTS;
const gm = actionId => ({
  isGm:true,
  player:"Brandon",
  actionId,
  deviceId:"gm-device",
  showControl:true,
  progressReset:true,
});

test("show definitions are finite and validate their official context", () => {
  assert.deepEqual(Object.keys(SHOW_SCENE_DEFINITIONS),
    ["opening", "event-intro", "winner", "standings", "champion"]);
  for (const definition of Object.values(SHOW_SCENE_DEFINITIONS)) {
    assert.ok(["major", "normal", "routine"].includes(definition.intensity));
    assert.ok(definition.steps.length > 0);
    assert.equal(new Set(definition.steps).size, definition.steps.length);
  }

  const state = structuredClone(EMPTY_STATE);
  assert.equal(validateShowSceneRequest(state, { kind:"opening" }, events).ok, true);
  assert.equal(validateShowSceneRequest(state,
    { kind:"event-intro", eventId:"putt" }, events).ok, true);
  assert.match(validateShowSceneRequest(state,
    { kind:"event-intro", eventId:"missing" }, events).error, /current event/i);
  assert.match(validateShowSceneRequest(state,
    { kind:"winner", eventId:"putt" }, events).error, /official result/i);
  assert.match(validateShowSceneRequest(state,
    { kind:"champion" }, events).error, /champion/i);

  state.results.putt = { slots:[["Brandon"], [], []], ts:1 };
  assert.equal(validateShowSceneRequest(state,
    { kind:"winner", eventId:"putt" }, events).ok, true);
  state.frozen = true;
  assert.equal(validateShowSceneRequest(state, { kind:"champion" }, events).ok, true);
});

test("Show Control is GM-only, capability-gated, retry-safe, and recoverable", () => {
  const state = structuredClone(EMPTY_STATE);
  /* the event intro is one step now (C13); the opening is the two-step scene */
  const request = { kind:"opening" };

  const guest = applyAction(state, "startShowScene", request, {
    isGm:false,
    actionId:"guest-start",
    showControl:true,
  });
  assert.match(guest.error, /commissioner/i);

  const disabled = applyAction(state, "startShowScene", request, {
    ...gm("disabled-start"),
    showControl:false,
  });
  assert.match(disabled.error, /unavailable/i);

  const started = applyAction(state, "startShowScene", request, gm("start-1"));
  assert.equal(started.ok, true);
  const firstId = state.showControl.active.id;
  assert.equal(state.showControl.active.kind, "opening");
  assert.equal(state.showControl.active.step, 0);

  const replayedStart = applyAction(state, "startShowScene", request, gm("start-1"));
  assert.equal(replayedStart.ok, true);
  assert.equal(replayedStart.extra.unchanged, true);
  assert.equal(state.showControl.active.id, firstId);

  const conflictingReplay = applyAction(state, "startShowScene",
    { kind:"standings" }, gm("start-1"));
  assert.match(conflictingReplay.error, /request id already used/i);
  assert.equal(state.showControl.active.id, firstId);

  const competing = applyAction(state, "startShowScene",
    { kind:"standings" }, gm("start-2"));
  assert.match(competing.error, /current scene/i);

  const firstAdvance = applyAction(state, "advanceShowScene",
    { id:firstId }, gm("advance-1"));
  assert.equal(firstAdvance.ok, true);
  assert.equal(state.showControl.active.step, 1);

  const replayedAdvance = applyAction(state, "advanceShowScene",
    { id:firstId }, gm("advance-1"));
  assert.equal(replayedAdvance.extra.unchanged, true);
  assert.equal(state.showControl.active.step, 1);

  const completed = applyAction(state, "advanceShowScene",
    { id:firstId }, gm("advance-2"));
  assert.equal(completed.ok, true);
  assert.equal(completed.extra.outcome, "completed");
  assert.equal(state.showControl.active, null);
  assert.equal(state.showControl.history[0].id, firstId);
  assert.equal(state.showControl.history[0].outcome, "completed");

  const retried = applyAction(state, "retryShowScene",
    { id:firstId }, gm("retry-1"));
  assert.equal(retried.ok, true);
  assert.notEqual(state.showControl.active.id, firstId);
  assert.equal(state.showControl.active.retryOf, firstId);

  const retryId = state.showControl.active.id;
  const skipped = applyAction(state, "endShowScene",
    { id:retryId, outcome:"skipped" }, gm("end-1"));
  assert.equal(skipped.ok, true);
  assert.equal(state.showControl.active, null);
  assert.equal(state.showControl.history[0].outcome, "skipped");

  const conflictingEndReplay = applyAction(state, "endShowScene",
    { id:retryId, outcome:"cancelled" }, gm("end-1"));
  assert.match(conflictingEndReplay.error, /request id already used/i);
});

test("scene resolution uses current official facts and reconstructs after reconnect", () => {
  const state = structuredClone(EMPTY_STATE);
  state.results.putt = { slots:[["Brandon"], ["Evan"], []], ts:10, revision:1 };
  assert.equal(applyAction(state, "startShowScene",
    { kind:"winner", eventId:"putt" }, gm("winner-start")).ok, true);

  const first = resolveShowScene(state, events);
  assert.deepEqual(first.players, ["Brandon"]);
  assert.equal(first.result.revision, 1);

  state.results.putt = { slots:[["Evan"], ["Brandon"], []], ts:20, revision:2 };
  const corrected = resolveShowScene(state, events);
  assert.deepEqual(corrected.players, ["Evan"]);
  assert.equal(corrected.result.revision, 2);

  const reconnectedState = structuredClone(state);
  const reconnected = resolveShowScene(reconnectedState, events);
  assert.equal(reconnected.active.id, corrected.active.id);
  assert.equal(reconnected.stepKey, corrected.stepKey);
  assert.deepEqual(reconnected.players, corrected.players);

  delete state.results.putt;
  assert.match(resolveShowScene(state, events).staleReason, /result/i);
});

test("show history is bounded", () => {
  const control = { active:null, history:[] };
  for (let index = 0; index < SHOW_HISTORY_LIMIT + 7; index++) {
    control.active = createShowScene({ kind:"opening", eventId:null }, {
      id:`scene-${index}`,
      now:index + 1,
    });
    finishShowScene(control, "completed", index + 2);
  }
  assert.equal(control.history.length, SHOW_HISTORY_LIMIT);
  assert.equal(control.history[0].id, `scene-${SHOW_HISTORY_LIMIT + 6}`);
  assert.equal(control.history.at(-1).id, "scene-7");
});

test("presentation remains independent of poker and audio providers", () => {
  const state = structuredClone(EMPTY_STATE);
  state.poker = {
    id:"poker",
    total:13000,
    startedAt:100,
    levels:[],
    outs:[],
    counts:{},
  };
  const pokerBefore = structuredClone(state.poker);
  const started = applyAction(state, "startShowScene",
    { kind:"standings" }, gm("poker-show"));
  assert.equal(started.ok, true);
  assert.deepEqual(state.poker, pokerBefore);
  assert.equal("audio" in state.showControl.active, false);
  assert.equal(resolveShowScene(state, events).stepKey, "board");
});

test("current-schema hydration, snapshots, and game-progress reset handle Show Control safely", () => {
  const legacy = {
    v:7,
    profiles:{ Brandon:{ display:"B" } },
    logistics:structuredClone(EMPTY_STATE.logistics),
  };
  const hydrated = hydrateStoredState(legacy);
  assert.equal(hydrated.v, EMPTY_STATE.v);
  assert.deepEqual(hydrated.showControl, { active:null, history:[] });

  const state = structuredClone(EMPTY_STATE);
  state.profiles.Brandon = { display:"B" };
  assert.equal(applyAction(state, "startShowScene",
    { kind:"opening" }, gm("reset-show")).ok, true);
  const snapshot = buildSnapshot(new Map([
    ["state", state],
    ["version", 1],
    ["claims", {}],
  ]), {
    environment:"local",
    applicationVersion:"m2-test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  assert.equal(validateSnapshot(snapshot).ok, true);
  assert.equal(snapshot.metadata.stateSchemaVersion, EMPTY_STATE.v);

  const reset = applyAction(state, "resetTournament", {
    confirm:RESET_PROGRESS_CONFIRMATION,
  }, gm("reset-progress"));
  assert.equal(reset.ok, true);
  assert.deepEqual(state.showControl, { active:null, history:[] });
  assert.deepEqual(state.profiles.Brandon, { display:"B" });
});
