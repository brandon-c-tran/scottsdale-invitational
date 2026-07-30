import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_STATE,
  ROSTER,
  allEventsOf,
  atRisk,
  computeStandings,
  makeBracket,
} from "../shared/core.js";
import {
  contestMarketPublicSummary,
  contestMarketRole,
  projectedBackingDelta,
  resolveContestMarket,
  sumDeltas,
} from "../shared/markets.js";
import { applyAction } from "../worker/actions.js";
import { hydrateStoredState } from "../worker/state.js";
import { Tournament } from "../worker/tournament.js";

const eventId = "8ball";
const gm = actionId => ({
  isGm:true,
  player:"Brandon",
  deviceId:"gm-device",
  actionId,
  matchupStakes:true,
});
const player = (name, actionId, enabled = true) => ({
  isGm:false,
  player:name,
  deviceId:`device-${name}`,
  actionId,
  matchupStakes:enabled,
});
const total = state =>
  computeStandings(state).reduce((sum, row) => sum + row.pts, 0);
const points = state =>
  Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts]));

function matchupState() {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  state.draws[eventId] = {
    id:"draw-matchup-stakes",
    teams:[
      { players:["Brandon", "Evan"] },
      { players:["Eyob", "Sahil"] },
      { players:["Khoa", "Chinh"] },
      { players:["Adi", "Chiang"] },
    ],
  };
  state.brackets[eventId] = makeBracket(4);
  state.onDeck = eventId;
  state.eventOps[eventId] = { bettingOpenedAt:1 };
  return state;
}

function openMarket(state, actionId = "open-market") {
  const result = applyAction(state, "openMatchMarket", {
    eventId,
    round:0,
    match:0,
  }, gm(actionId));
  assert.equal(result.ok, true, result.error);
  const marketId = result.extra.marketId;
  assert.ok(state.contestMarkets[marketId]);
  return marketId;
}

function startCompetition(state) {
  state.onDeck = null;
  state.eventOps[eventId].bettingLockedAt = 2;
  state.eventOps[eventId].startedAt = 3;
}

function pickWinner(state, teamIdx, actionId = `winner-${teamIdx}`) {
  const result = applyAction(state, "pickBracketWinner", {
    evId:eventId,
    r:0,
    m:0,
    teamIdx,
  }, gm(actionId));
  assert.equal(result.ok, true, result.error);
  return result;
}

function predict(state, marketId, name, sideKey, actionId) {
  const result = applyAction(state, "recordContestPrediction", {
    marketId,
    sideKey,
  }, player(name, actionId));
  assert.equal(result.ok, true, result.error);
  return result;
}

function back(state, marketId, name, sideKey, stake, actionId) {
  const result = applyAction(state, "backContestPrediction", {
    marketId,
    sideKey,
    stake,
  }, player(name, actionId));
  assert.equal(result.ok, true, result.error);
  return result;
}

test("a concrete matchup proceeds normally with no participation", () => {
  const state = matchupState();
  const before = total(state);
  startCompetition(state);
  pickWinner(state, 0);
  assert.equal(state.brackets[eventId].rounds[0][0].winner, 0);
  assert.equal(total(state), before);
  const market = Object.values(state.contestMarkets)[0];
  assert.ok(market, "result recovery creates the concrete matchup record");
  assert.deepEqual(market.predictions, {});
  assert.deepEqual(market.backing, {});
  assert.equal(resolveContestMarket(state, market).status, "settled");
});

test("putting a bracket event on deck opens its next matchup automatically", () => {
  const state = matchupState();
  state.onDeck = null;
  state.eventOps[eventId] = {};
  const opened = applyAction(state, "setOnDeck", { id:eventId }, gm("event-on-deck"));
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.extra.marketCreated, true);
  const market = state.contestMarkets[opened.extra.marketId];
  assert.ok(market);
  assert.equal(market.round, 0);
  assert.equal(market.match, 0);
  assert.equal(market.lockedAt, null);

  const retry = applyAction(state, "setOnDeck", { id:eventId }, gm("event-on-deck-retry"));
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(Object.keys(state.contestMarkets).length, 1);
});

test("starting play locks the current matchup and bracket progress opens the next one", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  startCompetition(state);
  const started = applyAction(state, "startBracketMatch", {
    evId:eventId,
    r:0,
    m:0,
  }, gm("start-physical-matchup"));
  assert.equal(started.ok, true, started.error);
  assert.ok(state.contestMarkets[marketId].lockedAt);
  const retry = applyAction(state, "startBracketMatch", {
    evId:eventId,
    r:0,
    m:0,
  }, gm("start-physical-matchup"));
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.extra.unchanged, true);

  const winner = pickWinner(state, 0, "advance-and-prepare-next");
  assert.ok(winner.extra.nextMarketId);
  const next = state.contestMarkets[winner.extra.nextMarketId];
  assert.equal(next.round, 0);
  assert.equal(next.match, 1);
  assert.equal(next.lockedAt, null);
  assert.equal(Object.keys(state.contestMarkets).length, 2);
});

test("roles separate a consensual team ante from spectator prediction and backing", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  const market = state.contestMarkets[marketId];
  assert.deepEqual(contestMarketRole(market, "Brandon"), {
    role:"competitor",
    canAnte:true,
    canPredict:false,
    canBack:false,
  });
  assert.deepEqual(contestMarketRole(market, "Khoa"), {
    role:"spectator",
    canAnte:false,
    canPredict:true,
    canBack:true,
  });
  const competitorPick = applyAction(state, "recordContestPrediction", {
    marketId,
    sideKey:"0",
  }, player("Brandon", "competitor-pick"));
  assert.match(competitorPick.error, /competitors/i);
  const spectatorAnte = applyAction(state, "respondContestAnte", {
    marketId,
    accept:true,
    stake:100,
  }, player("Khoa", "spectator-ante"));
  assert.match(spectatorAnte.error, /only competitors/i);
  const legacyPlacement = applyAction(state, "placeWager", {
    wager:{ kind:"outright", eventId, pick:"Khoa", stake:100 },
  }, player("Khoa", "legacy-after-cutover"));
  assert.match(legacyPlacement.error, /legacy betting is retired/i);
});

test("free predictions are editable, retry-safe, and never move or reserve chips", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  const before = points(state);
  predict(state, marketId, "Khoa", "0", "predict-free");
  const retry = applyAction(state, "recordContestPrediction", {
    marketId,
    sideKey:"0",
  }, player("Khoa", "predict-free"));
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  predict(state, marketId, "Khoa", "3", "change-free");
  assert.equal(state.contestMarkets[marketId].predictions.Khoa, "3");
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 0);
  assert.deepEqual(points(state), before);
});

test("backing is optional and a retry-safe retraction pulls one committed chip", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  const before = total(state);
  predict(state, marketId, "Khoa", "0", "retract-pick");
  back(state, marketId, "Khoa", "0", 100, "retract-back-1");
  back(state, marketId, "Khoa", "0", 100, "retract-back-2");
  assert.equal(state.contestMarkets[marketId].backing.Khoa.stake, 200);
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 200);
  assert.equal(total(state), before);
  const first = applyAction(state, "retractContestBacking", {
    marketId,
  }, player("Khoa", "retract-one"));
  assert.equal(first.ok, true, first.error);
  assert.equal(first.extra.stake, 100);
  const retry = applyAction(state, "retractContestBacking", {
    marketId,
  }, player("Khoa", "retract-one"));
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(state.contestMarkets[marketId].backing.Khoa.stake, 100);
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 100);
  assert.equal(total(state), before);
});

test("a funded pool and unanimous equal team ante redistribute exactly and conserve supply", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  const market = state.contestMarkets[marketId];
  const beforeTotal = total(state);
  const before = points(state);

  for (const [name, index] of [
    ["Brandon", 0],
    ["Evan", 1],
    ["Adi", 2],
    ["Chiang", 3],
  ]) {
    const result = applyAction(state, "respondContestAnte", {
      marketId,
      accept:true,
      stake:100,
    }, player(name, `ante-${index}`));
    assert.equal(result.ok, true, result.error);
  }

  predict(state, marketId, "Khoa", "0", "khoa-pick");
  back(state, marketId, "Khoa", "0", 200, "khoa-back");
  const retry = applyAction(state, "backContestPrediction", {
    marketId,
    sideKey:"0",
    stake:200,
  }, player("Khoa", "khoa-back"));
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(market.backing.Khoa.stake, 200);

  predict(state, marketId, "Chinh", "3", "chinh-pick");
  back(state, marketId, "Chinh", "3", 100, "chinh-back");
  predict(state, marketId, "Henry", "3", "henry-pick");
  back(state, marketId, "Henry", "3", 100, "henry-back");

  const forming = contestMarketPublicSummary(state, market);
  assert.equal(forming.predictionTotal, 3);
  assert.equal(forming.backingCommitted, 400);
  assert.equal(forming.backingActive, true);
  assert.equal(forming.sides.find(side => side.key === "0").backing, 200);
  assert.equal(forming.sides.find(side => side.key === "3").backers, 2);
  assert.equal(projectedBackingDelta(market, "Khoa"), 200);
  assert.equal("player" in forming.sides[0], false);

  assert.equal(total(state), beforeTotal);
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 200);
  assert.equal(atRisk(state, "Brandon", allEventsOf(state)), 100);
  startCompetition(state);
  pickWinner(state, 0);

  const settlement = resolveContestMarket(state, market);
  assert.equal(settlement.status, "settled");
  assert.equal(settlement.backing.active, true);
  assert.equal(settlement.ante.active, true);
  assert.equal(settlement.backing.committed, 400);
  assert.equal(settlement.ante.committed, 400);
  assert.equal(sumDeltas(settlement.deltas), 0);
  const finalSummary = contestMarketPublicSummary(state, market);
  assert.equal(finalSummary.totalActivePot, 800);
  assert.equal(finalSummary.winnerKey, "0");
  assert.deepEqual(settlement.deltas, {
    Khoa:200,
    Chinh:-100,
    Henry:-100,
    Brandon:100,
    Evan:100,
    Adi:-100,
    Chiang:-100,
  });
  assert.equal(total(state), beforeTotal);
  const after = points(state);
  for (const [name, delta] of Object.entries(settlement.deltas))
    assert.equal(after[name] - before[name], delta);
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 0);

  /* Re-delivering the same official choice cannot append a second payment. */
  const once = points(state);
  pickWinner(state, 0, "winner-duplicate");
  assert.deepEqual(points(state), once);
});

test("correcting a result reverses and reapplies the one derived settlement", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  predict(state, marketId, "Khoa", "0", "correct-khoa-pick");
  back(state, marketId, "Khoa", "0", 200, "correct-khoa-back");
  predict(state, marketId, "Chinh", "3", "correct-chinh-pick");
  back(state, marketId, "Chinh", "3", 100, "correct-chinh-back");
  predict(state, marketId, "Henry", "3", "correct-henry-pick");
  back(state, marketId, "Henry", "3", 100, "correct-henry-back");
  startCompetition(state);

  const baseline = points(state);
  pickWinner(state, 0, "correct-first");
  assert.equal(points(state).Khoa, baseline.Khoa + 200);
  assert.equal(total(state), ROSTER.length * 1000);

  pickWinner(state, 3, "correct-second");
  const corrected = resolveContestMarket(state, state.contestMarkets[marketId]);
  assert.deepEqual(corrected.deltas, {
    Chinh:100,
    Henry:100,
    Khoa:-200,
  });
  assert.equal(points(state).Khoa, baseline.Khoa - 200);
  assert.equal(points(state).Chinh, baseline.Chinh + 100);
  assert.equal(points(state).Henry, baseline.Henry + 100);
  assert.equal(total(state), ROSTER.length * 1000);
});

test("pool conservation holds across funded stake shapes and either winner", () => {
  for (let leftUnits = 1; leftUnits <= 5; leftUnits++) {
    for (let rightUnits = 1; rightUnits <= 5; rightUnits++) {
      for (const winner of [0, 3]) {
        const state = matchupState();
        const suffix = `${leftUnits}-${rightUnits}-${winner}`;
        const marketId = openMarket(state, `invariant-open-${suffix}`);
        predict(state, marketId, "Khoa", "0", `invariant-left-pick-${suffix}`);
        back(state, marketId, "Khoa", "0", leftUnits * 100,
          `invariant-left-back-${suffix}`);
        predict(state, marketId, "Chinh", "3", `invariant-right-pick-${suffix}`);
        back(state, marketId, "Chinh", "3", rightUnits * 100,
          `invariant-right-back-${suffix}`);
        const before = total(state);
        startCompetition(state);
        pickWinner(state, winner, `invariant-winner-${suffix}`);
        const settlement = resolveContestMarket(state, state.contestMarkets[marketId]);
        assert.equal(settlement.status, "settled");
        assert.equal(settlement.backing.active, true);
        assert.equal(sumDeltas(settlement.deltas), 0);
        assert.equal(total(state), before);
      }
    }
  }
});

test("declined ante and one-sided backing refund without blocking the matchup", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  assert.equal(applyAction(state, "respondContestAnte", {
    marketId,
    accept:true,
    stake:100,
  }, player("Brandon", "decline-accept")).ok, true);
  assert.equal(applyAction(state, "respondContestAnte", {
    marketId,
    accept:false,
  }, player("Evan", "decline-no")).ok, true);
  predict(state, marketId, "Khoa", "0", "one-side-pick");
  back(state, marketId, "Khoa", "0", 300, "one-side-back");
  startCompetition(state);
  pickWinner(state, 0);

  const market = state.contestMarkets[marketId];
  const settlement = resolveContestMarket(state, market);
  assert.equal(market.pool.activation.active, false);
  assert.equal(market.ante.activation.active, false);
  assert.equal(settlement.status, "settled");
  assert.deepEqual(settlement.deltas, {});
  assert.equal(total(state), ROSTER.length * 1000);
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 0);
  assert.equal(state.brackets[eventId].rounds[0][0].winner, 0);
});

test("void and invalidated markets refund all committed chips", () => {
  const state = matchupState();
  const marketId = openMarket(state);
  predict(state, marketId, "Khoa", "0", "void-khoa-pick");
  back(state, marketId, "Khoa", "0", 100, "void-khoa-back");
  predict(state, marketId, "Chinh", "3", "void-chinh-pick");
  back(state, marketId, "Chinh", "3", 100, "void-chinh-back");
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 100);
  const voided = applyAction(state, "voidContestMarket", {
    marketId,
    reason:"Match canceled",
  }, gm("void-market"));
  assert.equal(voided.ok, true, voided.error);
  assert.equal(resolveContestMarket(state, state.contestMarkets[marketId]).status, "void");
  assert.equal(atRisk(state, "Khoa", allEventsOf(state)), 0);
  assert.equal(total(state), ROSTER.length * 1000);

  const changed = matchupState();
  const changedId = openMarket(changed, "open-invalid");
  predict(changed, changedId, "Khoa", "0", "invalid-pick");
  back(changed, changedId, "Khoa", "0", 100, "invalid-back");
  changed.draws[eventId].id = "replacement-draw";
  const invalid = resolveContestMarket(changed, changed.contestMarkets[changedId]);
  assert.equal(invalid.status, "void");
  assert.deepEqual(invalid.deltas, {});
  assert.equal(atRisk(changed, "Khoa", allEventsOf(changed)), 0);
});

test("poker blocks unresolved funded exposure and receives the conserved settled total", () => {
  const freeOnly = matchupState();
  const freeMarketId = openMarket(freeOnly, "open-free-poker");
  predict(freeOnly, freeMarketId, "Khoa", "0", "free-poker-pick");
  const freeSetup = applyAction(freeOnly, "pokerSetup", {}, gm("poker-free-only"));
  assert.equal(freeSetup.ok, true, freeSetup.error);

  const state = matchupState();
  const marketId = openMarket(state);
  predict(state, marketId, "Khoa", "0", "poker-khoa-pick");
  back(state, marketId, "Khoa", "0", 100, "poker-khoa-back");
  predict(state, marketId, "Chinh", "3", "poker-chinh-pick");
  back(state, marketId, "Chinh", "3", 100, "poker-chinh-back");
  const blocked = applyAction(state, "pokerSetup", {}, gm("poker-blocked"));
  assert.match(blocked.error, /funded matchup markets/i);

  startCompetition(state);
  pickWinner(state, 0);
  const expected = total(state);
  const setup = applyAction(state, "pokerSetup", {}, gm("poker-after-settlement"));
  assert.equal(setup.ok, true, setup.error);
  assert.equal(state.poker.total, expected);
  assert.equal(expected, ROSTER.length * 1000);
});

test("v8 production-shaped state hydrates additively and production stays disabled by default", () => {
  const legacy = hydrateStoredState({
    v:8,
    profiles:{ Brandon:{ display:"B" } },
    wagers:[],
    results:{},
    draws:{},
    brackets:{},
    logistics:structuredClone(EMPTY_STATE.logistics),
  });
  assert.equal(legacy.v, 10);
  assert.deepEqual(legacy.contestMarkets, {});
  assert.deepEqual(legacy.marketOps, {});
  assert.deepEqual(legacy.honorMoments, {});
  assert.deepEqual(legacy.honors, []);
  assert.equal(computeStandings(legacy).find(row => row.player === "Brandon").pts, 1000);

  const production = new Tournament({ blockConcurrencyWhile() {} }, {
    APP_ENV:"production",
    M2_MATCHUP_STAKES_ENABLED:"false",
  });
  assert.equal(production.capabilities.matchupStakes, false);
  const disabled = applyAction(matchupState(), "recordContestPrediction", {
    marketId:"missing",
    sideKey:"0",
  }, player("Khoa", "disabled-action", false));
  assert.match(disabled.error, /unavailable/i);
});
