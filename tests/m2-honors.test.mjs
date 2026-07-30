import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_STATE,
  computeStandings,
} from "../shared/core.js";
import {
  HONOR_THEMES,
  activeHonorMoment,
  honorAggregation,
  honorMomentContext,
} from "../shared/honors.js";
import { applyAction } from "../worker/actions.js";
import { hydrateStoredState } from "../worker/state.js";
import { Tournament } from "../worker/tournament.js";

const eventId = "8ball";
const gm = actionId => ({
  isGm:true,
  player:"Brandon",
  deviceId:"gm-device",
  actionId,
  honors:true,
});
const player = (name, actionId, enabled = true) => ({
  isGm:false,
  player:name,
  deviceId:`device-${name}`,
  actionId,
  honors:enabled,
});

function completedEventState() {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  state.draws[eventId] = {
    id:"honors-draw",
    teams:[
      { players:["Brandon", "Evan"] },
      { players:["Eyob", "Sahil"] },
    ],
    roles:[],
  };
  state.results[eventId] = {
    slots:[
      ["Brandon", "Evan"],
      ["Eyob", "Sahil"],
      [],
    ],
    ts:100,
  };
  return state;
}

function openEventMoment(state, actionId = "open-event-props") {
  const result = applyAction(state, "openHonorMoment", {
    source:{ kind:"event", eventId },
  }, gm(actionId));
  assert.equal(result.ok, true, result.error);
  return result.extra.momentId;
}

test("props are capability-gated, commissioner-opened, and source-valid", () => {
  const state = completedEventState();
  const guestOpen = applyAction(state, "openHonorMoment", {
    source:{ kind:"event", eventId },
  }, player("Brandon", "guest-open"));
  assert.match(guestOpen.error, /commissioner/i);
  const disabled = applyAction(state, "openHonorMoment", {
    source:{ kind:"event", eventId },
  }, { ...gm("disabled-open"), honors:false });
  assert.match(disabled.error, /unavailable/i);

  const momentId = openEventMoment(state);
  assert.equal(activeHonorMoment(state).id, momentId);
  assert.equal(honorMomentContext(state, state.honorMoments[momentId]).valid, true);
  const replay = applyAction(state, "openHonorMoment", {
    source:{ kind:"event", eventId },
  }, gm("open-event-props"));
  assert.equal(replay.ok, true);
  assert.equal(replay.extra.unchanged, true);
});

test("one positive submission per giver and moment is retry-safe and editable while open", () => {
  const state = completedEventState();
  const before = computeStandings(state);
  const momentId = openEventMoment(state);
  const self = applyAction(state, "submitHonor", {
    momentId,
    recipient:"Brandon",
    theme:"clutch",
  }, player("Brandon", "self-props"));
  assert.match(self.error, /someone else/i);
  const badTheme = applyAction(state, "submitHonor", {
    momentId,
    recipient:"Evan",
    theme:"worst-player",
  }, player("Brandon", "bad-theme"));
  assert.match(badTheme.error, /positive/i);

  const first = applyAction(state, "submitHonor", {
    momentId,
    recipient:"Evan",
    theme:"teammate",
    note:"Kept us together.",
  }, player("Brandon", "first-props"));
  assert.equal(first.ok, true, first.error);
  const honorId = first.extra.honorId;
  const retry = applyAction(state, "submitHonor", {
    momentId,
    recipient:"Evan",
    theme:"teammate",
    note:"Kept us together.",
  }, player("Brandon", "first-props"));
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(state.honors.length, 1);

  const changed = applyAction(state, "submitHonor", {
    momentId,
    recipient:"Sahil",
    theme:"good-sport",
    note:"  Competed hard   and kept it fun.  ",
  }, player("Brandon", "change-props"));
  assert.equal(changed.ok, true, changed.error);
  assert.equal(state.honors.length, 1);
  assert.equal(state.honors[0].id, honorId);
  assert.equal(state.honors[0].recipient, "Sahil");
  assert.equal(state.honors[0].note, "Competed hard and kept it fun.");
  assert.deepEqual(computeStandings(state), before);
});

test("closing blocks submissions, reopening preserves the audit record, and voiding removes aggregation eligibility", () => {
  const state = completedEventState();
  const momentId = openEventMoment(state);
  assert.equal(applyAction(state, "submitHonor", {
    momentId,
    recipient:"Evan",
    theme:"energy",
  }, player("Brandon", "energy-props")).ok, true);
  const close = applyAction(state, "closeHonorMoment", {
    momentId,
  }, gm("close-props"));
  assert.equal(close.ok, true, close.error);
  assert.equal(activeHonorMoment(state), null);
  const late = applyAction(state, "submitHonor", {
    momentId,
    recipient:"Sahil",
    theme:"clutch",
  }, player("Eyob", "late-props"));
  assert.match(late.error, /closed/i);

  const reopened = applyAction(state, "openHonorMoment", {
    source:{ kind:"event", eventId },
  }, gm("reopen-props"));
  assert.equal(reopened.ok, true, reopened.error);
  assert.equal(reopened.extra.momentId, momentId);
  assert.equal(state.honorMoments[momentId].reopened, 1);
  assert.equal(applyAction(state, "submitHonor", {
    momentId,
    recipient:"Evan",
    theme:"clutch",
  }, player("Eyob", "eyob-props")).ok, true);
  assert.equal(honorAggregation(state)[0].player, "Evan");
  assert.equal(honorAggregation(state)[0].uniqueGivers, 2);

  const voided = applyAction(state, "voidHonorMoment", {
    momentId,
    reason:"Result was withdrawn",
  }, gm("void-props"));
  assert.equal(voided.ok, true, voided.error);
  assert.deepEqual(honorAggregation(state), []);
  assert.equal(state.honors.length, 2);
});

test("cleared results and changed bracket participants become ineligible without erasing records", () => {
  const state = completedEventState();
  const eventMomentId = openEventMoment(state);
  assert.equal(applyAction(state, "submitHonor", {
    momentId:eventMomentId,
    recipient:"Evan",
    theme:"smart-play",
  }, player("Brandon", "event-smart")).ok, true);
  delete state.results[eventId];
  assert.equal(honorMomentContext(state, state.honorMoments[eventMomentId]).valid, false);
  assert.deepEqual(honorAggregation(state), []);
  assert.equal(state.honors.length, 1);

  const bracketState = completedEventState();
  bracketState.brackets[eventId] = {
    size:2,
    rounds:[[
      { a:{ t:0 }, b:{ t:1 }, winner:0 },
    ]],
  };
  const opened = applyAction(bracketState, "openHonorMoment", {
    source:{ kind:"bracket-match", eventId, round:0, match:0 },
  }, gm("open-match-props"));
  assert.equal(opened.ok, true, opened.error);
  const matchMoment = bracketState.honorMoments[opened.extra.momentId];
  assert.deepEqual(matchMoment.participants.sort(), ["Brandon", "Evan", "Eyob", "Sahil"].sort());
  bracketState.draws[eventId].id = "replacement-draw";
  assert.equal(honorMomentContext(bracketState, matchMoment).valid, false);
});

test("aggregation rewards breadth and keeps theme labels finite", () => {
  const state = completedEventState();
  const momentId = openEventMoment(state);
  for (const [giver, recipient, theme] of [
    ["Brandon", "Evan", "teammate"],
    ["Eyob", "Evan", "clutch"],
    ["Sahil", "Eyob", "energy"],
  ]) {
    const result = applyAction(state, "submitHonor", {
      momentId,
      recipient,
      theme,
    }, player(giver, `props-${giver}`));
    assert.equal(result.ok, true, result.error);
  }
  const aggregate = honorAggregation(state);
  assert.equal(aggregate[0].player, "Evan");
  assert.equal(aggregate[0].uniqueGivers, 2);
  assert.equal(aggregate[0].uniqueThemes, 2);
  assert.equal(aggregate[0].breadth > aggregate[1].breadth, true);
  assert.deepEqual(HONOR_THEMES.map(theme => theme.id), [
    "clutch", "teammate", "good-sport", "energy", "smart-play", "chaos",
  ]);
});

test("v9 state hydrates additively to v10 and production remains fail-closed", () => {
  const legacy = hydrateStoredState({
    v:9,
    profiles:{ Brandon:{ display:"B" } },
    results:{},
    logistics:structuredClone(EMPTY_STATE.logistics),
  });
  assert.equal(legacy.v, 10);
  assert.deepEqual(legacy.honorMoments, {});
  assert.deepEqual(legacy.honors, []);
  assert.deepEqual(legacy.honorOps, {});

  const production = new Tournament({ blockConcurrencyWhile() {} }, {
    APP_ENV:"production",
    M2_HONORS_ENABLED:"false",
  });
  assert.equal(production.capabilities.honors, false);
});
