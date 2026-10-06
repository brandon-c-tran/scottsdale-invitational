import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_EVENTS, EMPTY_STATE, ROSTER, computeStandings, makeBracket } from "../shared/core.js";
import { deriveHomeModel } from "../src/features/home/homeModel.js";

const [me, partner, opponent, opponentPartner] = ROSTER;
const solo = BUILTIN_EVENTS.find(event => event.id === "putt");
const pairs = BUILTIN_EVENTS.find(event => event.id === "8ball");
const poker = BUILTIN_EVENTS.find(event => event.id === "poker");
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true });
const model = (state, events = BUILTIN_EVENTS, player = me) => deriveHomeModel({ state, events, me:player });
function teams(state, event = pairs, count = 4) {
  const draw = { id:`draw-${event.id}`, teams:Array.from({ length:count }, (_, index) => ({
    players:ROSTER.slice(index * 2, index * 2 + 2),
  })), roles:[] };
  state.draws[event.id] = draw;
  return draw;
}
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("before the weekend keeps the first event ahead of future draws without pretending play or betting started", () => {
  const state = { ...fresh(), live:false };
  teams(state);
  state.brackets[pairs.id] = makeBracket(4);
  state.onDeck = pairs.id;
  const home = model(state);
  assert.equal(home.mode, "before");
  assert.equal(home.current.event.id, solo.id);
  assert.equal(home.current.status, "First event");
  assert.equal(home.current.assignment.kind, "solo");
  assert.equal(home.betting, null);
  assert.equal(home.standing, null);
});

test("actual play beats a later prepared draw, draft, or newly opened betting market", () => {
  const state = fresh();
  const future = { ...pairs, id:"future", name:"Future pairs" };
  teams(state, future);
  state.brackets[future.id] = makeBracket(4);
  state.eventOps[future.id] = { bettingLockedAt:300 };
  state.drafts[future.id] = { ts:400 };
  state.eventOps[solo.id] = { startedAt:100 };
  let home = model(state, [future, solo]);
  assert.equal(home.current.event.id, solo.id);
  assert.equal(home.current.status, "Playing");
  assert.deepEqual(home.upcoming.map(event => event.id), [future.id]);
  state.onDeck = future.id;
  home = model(state, [future, solo]);
  assert.equal(home.current.event.id, solo.id);
  assert.equal(home.betting.event.id, future.id);
  assert.equal(home.betting.open, true);
  assert.equal(home.betting.canPlace, true);
});

test("betting-open and betting-locked events stay current before a scheduled event", () => {
  const state = fresh();
  teams(state);
  state.onDeck = pairs.id;
  let home = model(state);
  assert.equal(home.current.event.id, pairs.id);
  assert.equal(home.current.status, "Betting open");
  state.onDeck = null;
  state.eventOps[pairs.id] = { bettingLockedAt:10 };
  home = model(state);
  assert.equal(home.current.event.id, pairs.id);
  assert.equal(home.current.status, "Playing", "a guest reads the room, not the market lock");
  assert.equal(home.betting.open, false);
  assert.equal(home.betting.canPlace, false);
  assert.equal(home.betting.label, "View bets");
});

test("result entry and completed brackets keep the result visible without inventing another opponent", () => {
  const state = fresh();
  teams(state);
  state.brackets[pairs.id] = makeBracket(4);
  state.brackets[pairs.id].rounds[0][0].winner = 0;
  state.brackets[pairs.id].rounds[0][1].winner = 1;
  state.brackets[pairs.id].rounds[1][0].winner = 0;
  state.eventOps[pairs.id] = { startedAt:10 };
  let home = model(state);
  assert.equal(home.current.event.id, pairs.id);
  assert.equal(home.current.status, "Awaiting result");
  assert.equal(home.current.awaitingResult, true);
  assert.equal(home.current.assignment.status, "won");
  assert.deepEqual(home.current.assignment.opponents, []);
  state.eventOps[solo.id] = { startedAt:11, resultEntryAt:20 };
  home = model(state);
  assert.equal(home.current.event.id, solo.id);
  assert.equal(home.current.status, "Awaiting result");
});

test("team assignment names the saved partner and the player's actual bracket opponent", () => {
  const state = fresh(), draw = teams(state);
  state.brackets[pairs.id] = makeBracket(4);
  state.eventOps[pairs.id] = { startedAt:10 };
  const home = model(state);
  const assignment = home.current.assignment;
  assert.equal(assignment.kind, "team");
  assert.equal(assignment.label, "Your partner");
  assert.deepEqual(assignment.players, [me, partner]);
  assert.deepEqual(assignment.partners, [partner]);
  assert.deepEqual(assignment.opponents, draw.teams[3].players);
  assert.deepEqual(assignment.match, { r:0, m:0, a:0, b:3,
    roundName:"Semifinals", isCurrent:true, awaitingOpponent:false });
  assert.equal(assignment.status, "up-now");
  state.onDeck = pairs.id;
  assert.equal(model(state).current.assignment.status, "up-now", "A stale onDeck flag cannot reopen a contest already playing");
  delete state.eventOps[pairs.id].startedAt;
  const betting = model(state).current.assignment;
  assert.equal(betting.status, "next");
  assert.equal(betting.match.isCurrent, false);
  assert.deepEqual(betting.opponents, draw.teams[3].players);
});

test("a later match stays next, an unknown opponent stays unknown, and eliminated teams stay out", () => {
  const state = fresh();
  teams(state);
  state.brackets[pairs.id] = makeBracket(4);
  state.eventOps[pairs.id] = { startedAt:10 };
  let assignment = model(state, BUILTIN_EVENTS, opponent).current.assignment;
  assert.equal(assignment.status, "next");
  assert.equal(assignment.match.isCurrent, false);
  state.brackets[pairs.id].rounds[0][0].winner = 0;
  assignment = model(state).current.assignment;
  assert.equal(assignment.status, "waiting");
  assert.equal(assignment.match.roundName, "Final");
  assert.equal(assignment.match.awaitingOpponent, true);
  assert.deepEqual(assignment.opponents, []);
  state.brackets[pairs.id].rounds[0][1].winner = 1;
  assignment = model(state).current.assignment;
  assert.deepEqual(assignment.opponents, [opponent, opponentPartner]);
  state.brackets[pairs.id].rounds[1][0].winner = 1;
  assignment = model(state).current.assignment;
  assert.equal(assignment.status, "out");
  assert.equal(assignment.match, null);
  assert.deepEqual(assignment.opponents, []);
});

test("overflow roles are actual assignments and missing teams stay pending rather than implying participation", () => {
  const state = fresh(), draw = teams(state);
  state.onDeck = pairs.id;
  draw.roles = [{ player:ROSTER[12], role:"photographer" }];
  let assignment = model(state, BUILTIN_EVENTS, ROSTER[12]).current.assignment;
  assert.equal(assignment.kind, "crew");
  assert.equal(assignment.label, "Photographer");
  assert.equal(assignment.role, "photographer");
  assert.deepEqual(assignment.opponents, []);
  assignment = model(state, BUILTIN_EVENTS, ROSTER[10]).current.assignment;
  assert.equal(assignment.kind, "pending");
  assert.equal(assignment.label, "Assignment pending");
  delete state.draws[pairs.id];
  state.onDeck = null;
  assignment = model(state, [pairs]).current.assignment;
  assert.equal(assignment.label, "Teams not drawn");
  state.drafts[pairs.id] = { ts:10, roles:[{ player:ROSTER[12], role:"scorekeeper" }] };
  assert.equal(model(state, [pairs]).current.assignment.label, "Draft in progress");
  assert.equal(model(state, [pairs], ROSTER[12]).current.assignment.label, "Scorekeeper");
});

test("solo heat assignments advance into the actual final and exclude unassigned players", () => {
  const state = fresh();
  state.onDeck = solo.id;
  state.stages[solo.id] = { id:"heats", eventId:solo.id, kind:"heats", entrantType:"solo", advance:1,
    groups:[{ name:"Heat 1", entrants:[me, partner], through:[] },
      { name:"Heat 2", entrants:[opponent, opponentPartner], through:[] }], finalWinner:null };
  let assignment = model(state).current.assignment;
  assert.equal(assignment.kind, "solo");
  assert.equal(assignment.group.name, "Heat 1");
  assert.deepEqual(assignment.group.players, [me, partner]);
  assert.equal(model(state, BUILTIN_EVENTS, ROSTER[12]).current.assignment.kind, "pending");
  state.stages[solo.id].groups[0].through = [me];
  assert.equal(model(state).current.assignment.status, "through");
  state.stages[solo.id].groups[1].through = [opponent];
  assignment = model(state).current.assignment;
  assert.equal(assignment.status, "final");
  assert.equal(assignment.group.name, "Final");
  assert.deepEqual(assignment.group.players, [me, opponent]);
  assert.equal(model(state, BUILTIN_EVENTS, partner).current.assignment.status, "out");
});

test("team pools use the current draw identity and never attach a stale pool to a replacement draw", () => {
  const state = fresh(), draw = teams(state);
  state.onDeck = pairs.id;
  state.stages[pairs.id] = { id:"pools", eventId:pairs.id, kind:"pools", entrantType:"team", drawId:draw.id,
    advance:1, groups:[{ name:"Pool A", entrants:[0, 1], through:[] },
      { name:"Pool B", entrants:[2, 3], through:[] }], finalWinner:null };
  let assignment = model(state).current.assignment;
  assert.equal(assignment.group.name, "Pool A");
  assert.deepEqual(assignment.group.players, [me, partner, opponent, opponentPartner]);
  state.draws[pairs.id].id = "replacement";
  assignment = model(state).current.assignment;
  assert.equal(assignment.kind, "team");
  assert.equal(assignment.group, null);
});

test("the betting destination distinguishes market availability from the player's remaining capacity", () => {
  const state = fresh();
  state.onDeck = solo.id;
  state.wagers = [{ id:"pending", player:me, kind:"outright", eventId:solo.id, pick:opponent, stake:400 }];
  let home = model(state);
  assert.equal(home.standing.atRisk, 400);
  assert.equal(home.standing.available, 100);
  assert.equal(home.betting.open, true);
  assert.equal(home.betting.canPlace, true);
  state.wagers[0].stake = 500;
  home = model(state);
  assert.equal(home.standing.available, 0);
  assert.equal(home.betting.open, true);
  assert.equal(home.betting.canPlace, false);
  state.wagers = [];
  state.duels = [{ id:"reserved", status:"open", from:me, to:partner, runs:{}, stake:900 }];
  home = model(state);
  assert.equal(home.standing.duelAntes, 900);
  assert.equal(home.standing.exposure, 900);
  assert.equal(home.standing.available, 0);
  assert.equal(model(state, BUILTIN_EVENTS, null).betting.canPlace, false);
});

test("shelved, posted, missing-team, and finale markets never advertise a safe place-chips action", () => {
  const shelved = fresh();
  shelved.onDeck = solo.id;
  shelved.shelved[solo.id] = true;
  assert.equal(model(shelved).betting, null);
  const posted = fresh();
  posted.onDeck = solo.id;
  posted.results[solo.id] = { ts:1, slots:[[me]] };
  assert.equal(model(posted).betting, null);
  const missingTeams = fresh();
  missingTeams.onDeck = pairs.id;
  assert.equal(model(missingTeams).betting.open, false);
  assert.equal(model(missingTeams).betting.canPlace, false);
  const invalidFinale = fresh();
  invalidFinale.onDeck = poker.id;
  assert.equal(model(invalidFinale).betting, null);
});

test("poker setup, live play, counts, and frozen results suppress old betting and next-event prompts", () => {
  const state = fresh();
  state.onDeck = solo.id;
  state.eventOps[solo.id] = { startedAt:500 };
  state.poker = { id:poker.id, ts:1, startedAt:null, outs:[], counts:{} };
  let home = model(state);
  assert.equal(home.mode, "finale");
  assert.equal(home.finale.phase, "setup");
  assert.equal(home.current.event.id, poker.id);
  assert.equal(home.betting, null);
  assert.deepEqual(home.upcoming, []);
  assert.equal(home.standing.available, 0);
  state.poker.startedAt = 2;
  state.poker.outs = [{ player:me, ts:3 }];
  home = model(state);
  assert.equal(home.finale.phase, "live");
  assert.equal(home.finale.out, true);
  state.eventOps[poker.id] = { resultEntryAt:4 };
  assert.equal(model(state).finale.phase, "result-entry");
  state.results[poker.id] = { ts:5, slots:[[partner]], stacks:{ [partner]:2500, [me]:0 }, outs:[me] };
  home = model(state);
  assert.equal(home.mode, "complete");
  assert.equal(home.current, null);
  assert.equal(home.finale.phase, "complete");
  assert.equal(home.betting, null);
  assert.deepEqual(home.upcoming, []);
  state.frozen = true;
  assert.equal(model(state).mode, "complete");
  assert.deepEqual(model(state).upcoming, []);
});

test("upcoming events retain supplied order and omit completed, shelved, and other ongoing events", () => {
  const state = fresh();
  const events = BUILTIN_EVENTS.slice(0, 6);
  state.eventOps[events[2].id] = { startedAt:20 };
  teams(state, events[2]);
  state.eventOps[events[3].id] = { startedAt:10 };
  teams(state, events[3]);
  state.results[events[0].id] = { ts:1, slots:[[me]] };
  state.shelved[events[1].id] = true;
  const home = model(state, events);
  assert.equal(home.current.event.id, events[2].id);
  assert.deepEqual(home.upcoming.map(event => event.id), events.slice(4).map(event => event.id));
});

test("derivation preserves the snapshot and derives the own standing without leaking private answers", () => {
  const state = fresh();
  state.onDeck = solo.id;
  state.profiles[me] = { flightIn:{ note:"PRIVATE_FLIGHT" }, size:"PRIVATE_SIZE" };
  state.seeds[me] = { golf:"PRIVATE_RATING" };
  const before = structuredClone(state);
  const home = model(deepFreeze(state));
  assert.deepEqual(state, before);
  assert.equal(home.standing.pts, computeStandings(state).find(row => row.player === me).pts);
  assert.doesNotMatch(JSON.stringify(home), /PRIVATE_FLIGHT|PRIVATE_SIZE|PRIVATE_RATING/);
  assert.equal(model(state, BUILTIN_EVENTS, "Unknown").current.assignment.kind, "spectator");
  assert.equal(model(state, BUILTIN_EVENTS, "Unknown").standing, null);
});
