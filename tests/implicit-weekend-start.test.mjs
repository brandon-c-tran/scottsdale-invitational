import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, BUILTIN_EVENTS, ROSTER, allEventsOf, atRisk, computeStandings,
  defaultQaParticipants, draftTurn, resolveCurrentContest, resolveEventLifecycle, wagerBoardEvent,
} from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { resolveDirector } from "../shared/show.js";

const fresh = () => structuredClone(EMPTY_STATE);
const event = id => BUILTIN_EVENTS.find(item => item.id === id);
const solo = event("putt"), bracket = event("8ball");
let serial = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"implicit-start-host", actionId:`host-${++serial}` });
const guest = () => ({ player:ROSTER[0], deviceId:"implicit-start-guest", actionId:`guest-${++serial}` });
const act = (state, type, payload = {}, actor = gm()) => {
  const result = applyAction(state, type, payload, actor);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refs = (state, ev = solo) => {
  const contest = resolveCurrentContest(state, ev);
  return { contestId:contest.id, contestRevision:contest.revision };
};

/* Older snapshots can already contain an opened/locked contest while the
   separate live flag is false. Starting one must repair that mismatch. */
function preparedContest(phase) {
  const state = fresh();
  if (phase === "betting-open") state.onDeck = solo.id;
  const contest = resolveCurrentContest(state, solo);
  state.eventOps[solo.id] = { bettingOpenedAt:1, contestRevision:3,
    contest:{ id:contest.id, revision:3, phase },
    ...(phase === "betting-locked" ? { bettingLockedAt:2 } : {}),
  };
  return state;
}

const openingActions = [
  ["announceEvent", { evId:solo.id }, solo],
  ["setOnDeck", { id:solo.id }, solo],
  ["announceAndDraw", { evId:bracket.id, players:defaultQaParticipants(bracket) }, bracket],
];
for (const [type, payload, ev] of openingActions) {
  test(`${type} starts the weekend when its first betting market opens`, () => {
    const state = fresh(), standings = computeStandings(state);
    assert.equal(state.live, false);
    act(state, type, payload);
    assert.equal(state.live, true);
    assert.equal(state.onDeck, ev.id);
    assert.equal(resolveCurrentContest(state, ev).phase, "betting-open");
    assert.equal(state.eventOps[ev.id].startedAt, undefined, "Betting is available before play starts");
    assert.deepEqual(computeStandings(state), standings, "Opening the weekend never charges a player");
    assert.deepEqual(state.wagers, []);
    assert.equal(wagerBoardEvent(state).id, ev.id);
  });
}

for (const [type, phase] of [
  ["startEvent", "betting-locked"],
  ["lockAndStart", "betting-open"],
  ["lockAndStart", "betting-locked"],
]) {
  test(`${type} starts a previously prepared weekend from ${phase}`, () => {
    const state = preparedContest(phase), ref = refs(state);
    assert.equal(state.live, false);
    act(state, type, { evId:solo.id, ...ref });
    assert.equal(state.live, true);
    assert.equal(state.onDeck, null);
    assert.equal(resolveEventLifecycle(state, solo).phase, "in-progress");
    assert.ok(state.eventOps[solo.id].startedAt > 0);
    assert.deepEqual(refs(state), ref, "Starting play retains the exact contest");
    assert.deepEqual(state.wagers, []);
  });
}

test("poker setup remains preparation; starting its clock starts the weekend", () => {
  const state = fresh();
  act(state, "pokerSetup");
  assert.equal(state.live, false);
  assert.equal(state.poker.startedAt, null);
  const startingStacks = structuredClone(state.poker.startingStacks);
  act(state, "pokerStart");
  assert.equal(state.live, true);
  assert.ok(state.poker.startedAt > 0);
  assert.deepEqual(state.poker.startingStacks, startingStacks);
});

test("drawing teams and heats leaves the weekend unstarted until betting opens", () => {
  const teams = fresh();
  act(teams, "runDraw", { evId:bracket.id, players:defaultQaParticipants(bracket) });
  assert.equal(teams.live, false);
  assert.ok(teams.draws[bracket.id]);
  assert.equal(teams.onDeck, null);
  assert.equal(wagerBoardEvent(teams), null);
  act(teams, "setOnDeck", { id:bracket.id });
  assert.equal(teams.live, true);

  const heats = fresh(), ev = event("pingpong");
  act(heats, "runStages", { evId:ev.id, cfg:{ ...ev.stageCfg, players:defaultQaParticipants(ev) } });
  assert.equal(heats.live, false);
  assert.ok(heats.stages[ev.id]);
  assert.equal(heats.onDeck, null);
  assert.equal(wagerBoardEvent(heats), null);
  act(heats, "announceEvent", { evId:ev.id });
  assert.equal(heats.live, true);
  assert.equal(resolveCurrentContest(heats, ev).kind, "heat");
});

test("a complete captains draft is preparation and does not start the weekend", () => {
  const state = fresh(), ev = event("volley"), players = defaultQaParticipants(ev);
  act(state, "startDraft", { evId:ev.id, players, captains:players.slice(0, ev.teamCfg.teams) });
  assert.equal(state.live, false);
  while (state.drafts[ev.id].pool.length) {
    act(state, "pickDraftPlayer", { evId:ev.id, player:state.drafts[ev.id].pool[0], ...draftTurn(state.drafts[ev.id]) });
    assert.equal(state.live, false);
  }
  act(state, "finalizeDraft", { evId:ev.id, ...draftTurn(state.drafts[ev.id]) });
  assert.equal(state.live, false);
  assert.equal(state.draws[ev.id].teams.length, ev.teamCfg.teams);
  assert.equal(state.onDeck, null);
  act(state, "announceEvent", { evId:ev.id });
  assert.equal(state.live, true);
});

test("closing a prepared market does not implicitly start or stop the weekend", () => {
  const state = preparedContest("betting-open");
  act(state, "setOnDeck", { id:null, ...refs(state) });
  assert.equal(state.live, false);
  assert.equal(resolveCurrentContest(state, solo).phase, "betting-locked");
  act(state, "setOnDeck", { id:null });
  assert.equal(state.live, false);

  const running = fresh();
  act(running, "announceEvent", { evId:solo.id });
  act(running, "setOnDeck", { id:null, ...refs(running) });
  assert.equal(running.live, true);
});

test("unauthorized launch actions cannot change the live flag or their prepared state", () => {
  const poker = fresh(); act(poker, "pokerSetup");
  const attempts = [
    ...openingActions.map(([type, payload]) => [fresh(), type, payload]),
    [preparedContest("betting-locked"), "startEvent"],
    [preparedContest("betting-open"), "lockAndStart"],
    [poker, "pokerStart", {}],
  ];
  for (const [state, type, payload] of attempts) {
    const before = structuredClone(state);
    const result = applyAction(state, type, payload || { evId:solo.id, ...refs(state) }, guest());
    assert.equal(result.ok, false, type);
    assert.match(result.error, /Commissioner only/);
    assert.equal(state.live, false, type);
    assert.deepEqual(state, before, type);
  }
});

test("rejected launches never start the weekend", () => {
  const invalid = [
    [fresh(), "announceEvent", { evId:"missing-event" }],
    [fresh(), "announceEvent", {}],
    [fresh(), "announceEvent", { evId:null }],
    [fresh(), "setOnDeck", { id:bracket.id }],
    [fresh(), "announceAndDraw", { evId:bracket.id, players:ROSTER }],
    [fresh(), "startEvent", { evId:solo.id }],
    [fresh(), "lockAndStart", { evId:solo.id }],
    [fresh(), "pokerStart", {}],
    [{ ...fresh(), frozen:true }, "announceEvent", { evId:solo.id }],
  ];
  for (const [state, type, payload] of invalid) {
    const result = applyAction(state, type, payload, gm());
    assert.equal(result.ok, false, `${type} must reject its invalid setup`);
    assert.equal(state.live, false, type);
    assert.equal(state.onDeck, null, type);
    assert.deepEqual(state.wagers, [], type);
  }
});

test("stale contest references cannot start the weekend, including retries of an open market", () => {
  for (const phase of ["betting-open", "betting-locked"]) {
    for (const type of ["announceEvent", "setOnDeck", "startEvent", "lockAndStart"]) {
      const state = preparedContest(phase), before = structuredClone(state);
      const stale = { ...refs(state), contestRevision:2 };
      const result = applyAction(state, type, { ...(type === "setOnDeck" ? { id:solo.id } : { evId:solo.id }), ...stale }, gm());
      assert.equal(result.ok, false, `${type} during ${phase}`);
      assert.match(result.error, /Contest changed/);
      assert.equal(state.live, false, type);
      assert.deepEqual(state, before, type);
    }
  }
});

test("the legacy explicit setLive action remains GM-only and compatible", () => {
  const state = fresh();
  const denied = applyAction(state, "setLive", { on:true }, guest());
  assert.equal(denied.ok, false); assert.equal(state.live, false);
  act(state, "setLive", { on:true }); assert.equal(state.live, true);
  act(state, "setLive", { on:false }); assert.equal(state.live, false);
  assert.equal(state.onDeck, null); assert.deepEqual(state.results, {});
});

test("an acknowledged legacy launch repairs live once and then returns to an unchanged retry", () => {
  const attempts = openingActions.map(([type, payload]) => {
    const state = fresh();
    act(state, type, payload);
    return { state, type, payload };
  });
  const started = preparedContest("betting-open"), startPayload = { evId:solo.id, ...refs(started) };
  act(started, "lockAndStart", startPayload);
  attempts.push({ state:started, type:"lockAndStart", payload:startPayload });
  const poker = fresh();
  act(poker, "pokerSetup"); act(poker, "pokerStart");
  attempts.push({ state:poker, type:"pokerStart", payload:{} });

  for (const { state, type, payload } of attempts) {
    state.live = false;
    const before = structuredClone(state);
    const repaired = act(state, type, payload);
    assert.equal(state.live, true, type);
    assert.notEqual(repaired.extra?.unchanged, true, `${type}: the repair must be persisted and broadcast`);
    assert.deepEqual(state, { ...before, live:true }, `${type}: repair must not repeat game mutations`);
    const after = structuredClone(state);
    const retried = act(state, type, payload);
    assert.equal(retried.extra?.unchanged, true, `${type}: the next retry is a no-op`);
    assert.deepEqual(state, after, type);
  }
});

for (const showControl of [false, true]) {
  test(`the first event moves directly from announcement to play with show control ${showControl ? "on" : "off"}`, () => {
    const state = fresh(), events = allEventsOf(state);
    const initial = resolveDirector(state, events, { showControl });
    /* with Show Control the optional Opening beat comes first; Skip opening
       leads straight to the announcement, which starts the weekend */
    assert.equal(initial.nextAction.type, showControl ? "start-opening-scene" : "announce");
    if (showControl) assert.equal(initial.then.type, "announce");
    const ev = initial.event;
    act(state, "announceEvent", { evId:ev.id }, { ...gm(), showControl });
    assert.equal(state.live, true);
    if (showControl) {
      /* the intro is one step (C13): no Continue between announce and start */
      assert.equal(state.showControl.active.kind, "event-intro");
      assert.equal(resolveDirector(state, events, { showControl }).nextAction.type, "lock-start");
    }
    const next = resolveDirector(state, events, { showControl });
    assert.equal(next.nextAction.type, "lock-start");
    assert.equal(next.nextAction.enabled, true);
    assert.equal(next.event.id, ev.id);
    act(state, "lockAndStart", { evId:ev.id, ...refs(state, ev) }, { ...gm(), showControl });
    assert.equal(resolveEventLifecycle(state, ev).phase, "in-progress");
    assert.equal(state.showControl.history.some(scene => scene.kind === "opening"), false);
  });
}

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("implicit-weekend-start-ui.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { Wagers, PlayerIdentityProvider } = mod.exports;

test("the real wagering board takes manual chips as soon as the first market opens", () => {
  const state = fresh(), buttons = [], create = React.createElement;
  act(state, "announceEvent", { evId:solo.id });
  assert.equal(state.eventOps[solo.id].startedAt, undefined);
  assert.deepEqual(state.wagers, []);
  React.createElement = (type, props, ...children) => {
    if (type === "button") buttons.push(props);
    return create(type, props, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(create(PlayerIdentityProvider, { profiles:state.profiles }, create(Wagers, {
      state, me:ROSTER[0], gm:false, events:allEventsOf(state), standings:computeStandings(state), wagerEv:wagerBoardEvent(state),
      onEvents:() => {}, onEvent:() => {}, onPlayer:() => {},
      onPick:wager => applyAction(state, "placeWager", { wager }, guest()),
      onRetract:(id, ref) => applyAction(state, "retractWager", { id, ...ref }, guest()),
    })));
  } finally { React.createElement = create; }
  assert.match(html, /Betting open/);
  assert.match(html, /Choose your betting chip/);
  const picks = buttons.filter(button => button["aria-label"]?.startsWith("Place a chip on "));
  assert.equal(picks.length, ROSTER.length);
  assert.ok(picks.every(button => !button.disabled));
  const chosen = picks.find(button => button["aria-label"] === `Place a chip on ${ROSTER[1]}`);
  chosen.onClick();
  assert.equal(state.wagers.length, 1);
  assert.equal(state.wagers[0].pick, ROSTER[1]);
  assert.equal(state.wagers[0].stake, 100);
  assert.equal(atRisk(state, ROSTER[0], allEventsOf(state)), 100);
  assert.equal(state.eventOps[solo.id].startedAt, undefined);
});
