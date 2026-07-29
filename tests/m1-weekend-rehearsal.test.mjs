import test, { after } from "node:test";
import assert from "node:assert/strict";

import {
  AWARDS,
  BUILTIN_EVENTS,
  CHIP_MIN,
  EMPTY_STATE,
  POKER_CONFIG,
  PT,
  ROSTER,
  allEventsOf,
  bracketChampion,
  computeStandings,
  defaultQaParticipants,
  pokerDenoms,
  pokerDistribution,
  resolveEventLifecycle,
  resolveSlot,
  stageEntrantView,
  stageFinalists,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const gm = { isGm:true, player:"Brandon" };
const originalRandom = Math.random;
let randomState = 0x5f3759df;
Math.random = () => {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
after(() => { Math.random = originalRandom; });
const act = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload, gm);
  assert.equal(result.ok, true, `${type}: ${result.error || "rejected"}`);
  return result;
};

function configureEvent(state, event) {
  if (event.teamCfg) {
    const players = defaultQaParticipants(event, ROSTER);
    const selected = new Set(players);
    const roles = ROSTER
      .filter(player => !selected.has(player))
      .map(player => ({ player, role:"scorekeeper" }));
    act(state, "runDraw", { evId:event.id, players, roles });
  }
  if (["pingpong", "bball1", "beerio"].includes(event.id)) {
    act(state, "runStages", {
      evId:event.id,
      cfg:{ kind:"heats", nGroups:3, advance:1, players:[...ROSTER] },
    });
  } else if (event.id === "spike") {
    act(state, "runStages", {
      evId:event.id,
      cfg:{ kind:"pools", nGroups:2, advance:1 },
    });
  }
}

function finishCompetition(state, event) {
  const bracket = state.brackets[event.id];
  if (bracket) {
    for (let round = 0; round < bracket.rounds.length; round++) {
      for (let match = 0; match < bracket.rounds[round].length; match++) {
        const current = bracket.rounds[round][match];
        if (current.winner !== null && current.winner !== undefined) continue;
        const winner = resolveSlot(bracket, current.a);
        assert.notEqual(winner, null, `${event.id} bracket side is seated`);
        act(state, "pickBracketWinner", {
          evId:event.id,
          r:round,
          m:match,
          teamIdx:winner,
        });
      }
    }
  }

  const stages = state.stages[event.id];
  if (stages) {
    for (let group = 0; group < stages.groups.length; group++) {
      for (let index = 0; index < stages.advance; index++) {
        act(state, "toggleThrough", {
          evId:event.id,
          g:group,
          key:stages.groups[group].entrants[index],
        });
      }
    }
    act(state, "setFinalWinner", {
      evId:event.id,
      key:stageFinalists(stages)[0],
    });
  }
}

function resultSlots(state, event) {
  const awards = AWARDS[event.value] || [0, 0, 0];
  const wanted = Math.max(1, awards.filter(value => value > 0).length);
  const stages = state.stages[event.id];
  if (stages) {
    const finalists = stageFinalists(stages);
    const ordered = [
      stages.finalWinner,
      ...finalists.filter(key => key !== stages.finalWinner),
    ];
    return ordered.slice(0, wanted)
      .map(key => [...stageEntrantView(state, stages, key).players]);
  }

  const draw = state.draws[event.id];
  const bracket = state.brackets[event.id];
  if (draw && bracket) {
    const champion = bracketChampion(bracket);
    const final = bracket.rounds.at(-1)[0];
    const sides = [resolveSlot(bracket, final.a), resolveSlot(bracket, final.b)];
    const runner = sides.find(side => side !== champion);
    const ordered = [champion, runner, ...draw.teams.map((_, index) => index)]
      .filter((value, index, values) => value !== undefined
        && value !== null && values.indexOf(value) === index);
    return ordered.slice(0, wanted).map(index => [...draw.teams[index].players]);
  }
  if (draw)
    return draw.teams.slice(0, wanted).map(team => [...team.players]);
  return ROSTER.slice(0, wanted).map(player => [player]);
}

test("configured poker distribution is exact and legal for 12, 13, and 14 seats", () => {
  assert.equal(POKER_CONFIG.minimumStack, 600);
  assert.equal(POKER_CONFIG.stackQuantum, PT);
  assert.equal(POKER_CONFIG.countQuantum, CHIP_MIN);
  assert.equal(POKER_CONFIG.maxStack, null);
  assert.equal(POKER_CONFIG.rounding, "exact");

  for (const count of [12, 13, 14]) {
    const entries = Array.from({ length:count }, (_, index) => ({
      player:`Player-${index + 1}`,
      pts:index < 2 ? index * 200 : 600 + index * 100,
    }));
    const distribution = pokerDistribution(entries);
    assert.equal(distribution.ok, true, `${count}-seat distribution is legal`);
    assert.equal(distribution.rows.length, count);
    assert.equal(distribution.minimumCount, 2);
    assert.equal(distribution.total,
      distribution.rows.reduce((sum, row) => sum + row.stack, 0));
    for (const row of distribution.rows) {
      assert.ok(row.stack >= POKER_CONFIG.minimumStack);
      assert.equal(row.stack % POKER_CONFIG.stackQuantum, 0);
      assert.equal(row.denominations.reduce((sum, chip) => sum + chip.v * chip.n, 0),
        row.stack);
    }
  }

  assert.deepEqual(pokerDenoms(625), [
    { v:100, n:4 },
    { v:25, n:9 },
  ]);
  assert.deepEqual(pokerDenoms(75), [{ v:25, n:3 }]);
  assert.deepEqual(pokerDenoms(610), []);
});

test("deterministic rehearsal completes every event, locks the dealt board, and reverses poker exactly", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "setLive", { on:true });

  const events = BUILTIN_EVENTS.filter(event => !event.finale);
  for (const event of events) {
    configureEvent(state, event);
    act(state, "setOnDeck", { id:event.id });
    act(state, "setOnDeck", { id:null });
    act(state, "startEvent", { evId:event.id });
    finishCompetition(state, event);
    act(state, "beginResultEntry", { evId:event.id });
    act(state, "saveResult", {
      evId:event.id,
      slots:resultSlots(state, event),
    });
    assert.equal(resolveEventLifecycle(state, event).phase, "complete", event.id);
  }

  assert.equal(Object.keys(state.results).length, events.length);
  assert.ok(allEventsOf(state).filter(event => !event.finale)
    .every(event => resolveEventLifecycle(state, event).phase === "complete"));

  const jeremy = computeStandings(state).find(row => row.player === "Jeremy");
  act(state, "adjust", {
    player:"Jeremy",
    delta:400 - jeremy.pts,
    reason:"Rehearsal short stack",
  });
  act(state, "adjust", {
    player:"Brandon",
    delta:100,
    reason:"Minimum stack",
  });
  const beforePoker = computeStandings(state)
    .map(row => ({ player:row.player, pts:row.pts }));
  const unrelatedMinimumRuling = state.adjustments
    .find(adjustment => adjustment.player === "Brandon" && adjustment.reason === "Minimum stack");

  const setup = act(state, "pokerSetup");
  assert.equal(setup.extra.minimumCount, 1);
  assert.deepEqual(state.poker.startingStacks,
    Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts])));
  assert.equal(state.poker.total,
    Object.values(state.poker.startingStacks).reduce((sum, stack) => sum + stack, 0));
  const grantsAfterSetup = state.adjustments.length;

  const setupRetry = act(state, "pokerSetup");
  assert.equal(setupRetry.extra.unchanged, true);
  assert.equal(state.adjustments.length, grantsAfterSetup);
  assert.match(applyAction(state, "adjust", {
    player:"Evan",
    delta:100,
    reason:"Must be blocked",
  }, gm).error, /cancel the poker table/i);
  assert.match(applyAction(state, "saveResult", {
    evId:"putt",
    slots:[["Evan"]],
    confirmOverwrite:true,
    correctionReason:"Must be blocked",
  }, gm).error, /cancel the poker table/i);

  act(state, "pokerStart");
  const startRetry = act(state, "pokerStart");
  assert.equal(startRetry.extra.unchanged, true);

  const half = state.poker.total / 2;
  assert.equal(half % CHIP_MIN, 0);
  for (const player of ROSTER) {
    const count = ["Brandon", "Evan"].includes(player) ? half : 0;
    const counted = act(state, "pokerCount", { player, count });
    if (player === "Brandon") {
      const countRetry = act(state, "pokerCount", { player, count });
      assert.equal(countRetry.extra.unchanged, true);
    }
    assert.equal(counted.ok, true);
  }
  assert.equal(resolveEventLifecycle(state,
    BUILTIN_EVENTS.find(event => event.id === "poker")).phase, "result-entry");

  const posted = act(state, "pokerResult");
  assert.equal(posted.extra.revision, 1);
  assert.deepEqual(state.results.poker.slots[0], ["Brandon", "Evan"]);
  const postRetry = act(state, "pokerResult");
  assert.equal(postRetry.extra.unchanged, true);
  assert.equal(state.results.poker.revision, 1);
  const tied = computeStandings(state).filter(row => ["Brandon", "Evan"].includes(row.player));
  assert.equal(tied[0].pts, half);
  assert.equal(tied[1].pts, half);
  assert.equal(tied[0].rank, tied[1].rank);

  act(state, "clearResult", {
    evId:"poker",
    confirmClear:true,
    correctionReason:"Rehearsal verifies exact reversal",
  });
  act(state, "pokerCancel");
  const cancelRetry = act(state, "pokerCancel");
  assert.equal(cancelRetry.extra.unchanged, true);
  assert.equal(state.poker, null);
  assert.ok(state.adjustments.some(adjustment => adjustment.id === unrelatedMinimumRuling.id));
  assert.deepEqual(computeStandings(state).map(row => ({ player:row.player, pts:row.pts })),
    beforePoker);
});
