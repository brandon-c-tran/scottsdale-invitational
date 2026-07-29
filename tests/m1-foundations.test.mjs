import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_EVENTS,
  EMPTY_STATE,
  OVERFLOW_ROLES,
  ROSTER,
  ROSTER_CONFIG,
  RESET_PROGRESS_CONFIRMATION,
  allEventsOf,
  atRisk,
  computeStandings,
  defaultQaParticipants,
  drawTeams,
  makeBracket,
  normalizeOverflowRoles,
  overflowRoleMeta,
  coalescePendingReveals,
  qaBracketMatchWager,
  resolveSlot,
  rosterPlayers,
  resolveEventLifecycle,
  resolveWeekendOperation,
  wagerBoardEvent,
  validateEventParticipants,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { hydrateStoredState } from "../worker/state.js";
import { Tournament } from "../worker/tournament.js";
import {
  buildSnapshot,
  nextRestoreVersion,
  snapshotSha256,
  validateSnapshot,
} from "../worker/snapshot.js";

const gm = { isGm:true, player:"Brandon" };
const eightBall = BUILTIN_EVENTS.find(event => event.id === "8ball");
const longPutt = BUILTIN_EVENTS.find(event => event.id === "putt");
const snapshotEntries = () => new Map([
  ["state", structuredClone(EMPTY_STATE)],
  ["version", 7],
  ["claims", { deviceA:"Brandon" }],
]);
const tournamentFor = env => new Tournament({ blockConcurrencyWhile() {} }, env);

test("roster config is additive and attendance status does not rewrite profile data", () => {
  assert.equal(ROSTER_CONFIG.length, 13);
  assert.equal(ROSTER.length, 13);

  const config12 = ROSTER_CONFIG.slice(0, 12);
  const config14 = [...ROSTER_CONFIG, { id:"Guest14", name:"Guest 14", status:"confirmed" }];
  assert.equal(rosterPlayers(config12).length, 12);
  assert.equal(rosterPlayers(config14).length, 14);
  assert.deepEqual(rosterPlayers(config14).slice(0, 13), ROSTER);

  const profiles = { Jeremy:{ display:"J", num:42 }, Brandon:{ display:"B" } };
  const attendanceChanged = ROSTER_CONFIG.map(player =>
    player.id === "Jeremy" ? { ...player, status:"out" } : player);
  assert.equal(rosterPlayers(attendanceChanged).length, 12);
  assert.deepEqual(profiles.Jeremy, { display:"J", num:42 });
});

test("strict team participation handles 12, 13, and 14 active-roster scenarios explicitly", () => {
  const active12 = ROSTER.slice(0, 12);
  const active13 = [...ROSTER];
  const active14 = [...ROSTER, "Guest14"];

  assert.equal(validateEventParticipants(eightBall, active12, active12).ok, true);
  assert.match(validateEventParticipants(eightBall, active13, active13).error, /exactly 12/i);
  assert.match(validateEventParticipants(eightBall, active14, active14).error, /exactly 12/i);

  const chosen12of14 = validateEventParticipants(eightBall, active14.slice(0, 12), active14);
  assert.equal(chosen12of14.ok, true);
  assert.equal(chosen12of14.overflow.length, 2);
});

test("event crew gives every stored overflow role an intentional presentation", () => {
  for (const role of OVERFLOW_ROLES) {
    const meta = overflowRoleMeta(role);
    assert.ok(meta.label, `${role} label`);
    assert.ok(meta.short, `${role} short label`);
    assert.match(meta.detail, /\.$/, `${role} duty`);
  }
  assert.equal(overflowRoleMeta("sit-out").label, "Event host");
  assert.deepEqual(
    normalizeOverflowRoles(ROSTER.slice(0, 12), ROSTER,
      [{ player:ROSTER[12], role:"sit-out" }], eightBall),
    [{ player:ROSTER[12], role:"sit-out" }],
  );
});

test("returning devices play only the latest unseen draw ceremony", () => {
  const draws = {
    putt:{ id:"d100", ts:100, teams:[] },
    pong:{ id:"d300", ts:300, teams:[] },
  };
  const stages = {
    bball:{ id:"s200", ts:200, groups:[] },
    pool:{ id:"s400", ts:400, groups:[] },
  };
  const pending = coalescePendingReveals(draws, stages, ["d300"]);
  assert.equal(pending.latest.item.id, "s400");
  assert.equal(pending.latest.evId, "pool");
  assert.equal(pending.latest.kind, "stage");
  assert.deepEqual(pending.staleIds, ["s200", "d100"]);

  const activeAnnouncement = coalescePendingReveals(draws, stages, [], "pong");
  assert.equal(activeAnnouncement.latest.item.id, "d300");
  assert.deepEqual(activeAnnouncement.staleIds, ["s400", "s200", "d100"]);
});

test("server rejects oversized draws and persists exact teams plus overflow roles", () => {
  const rejectedState = structuredClone(EMPTY_STATE);
  const rejected = applyAction(rejectedState, "runDraw", {
    evId:"8ball",
    players:ROSTER,
  }, gm);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /exactly 12/i);
  assert.equal(rejectedState.draws["8ball"], undefined);

  const state = structuredClone(EMPTY_STATE);
  const players = ROSTER.slice(0, 12);
  const accepted = applyAction(state, "runDraw", {
    evId:"8ball",
    players,
    roles:[{ player:ROSTER[12], role:"referee" }],
  }, gm);
  assert.equal(accepted.ok, true);
  const draw = state.draws["8ball"];
  assert.equal(draw.teams.length, 6);
  assert.ok(draw.teams.every(team => team.players.length === 2));
  assert.deepEqual(new Set(draw.teams.flatMap(team => team.players)), new Set(players));
  assert.deepEqual(draw.roles, [{ player:ROSTER[12], role:"referee" }]);

  const draftState = structuredClone(EMPTY_STATE);
  const drafted = applyAction(draftState, "startDraft", {
    evId:"bball",
    players,
    captains:players.slice(0, 4),
    roles:[{ player:ROSTER[12], role:"photographer" }],
  }, gm);
  assert.equal(drafted.ok, true);
  assert.deepEqual(draftState.drafts.bball.roles,
    [{ player:ROSTER[12], role:"photographer" }]);
});

test("shared draw helper produces exact-sized groups", () => {
  const draw = drawTeams(eightBall, structuredClone(EMPTY_STATE), ROSTER.slice(0, 12));
  assert.ok(draw);
  assert.equal(draw.teams.length, 6);
  assert.ok(draw.teams.every(team => team.players.length === 2));
});

test("every shipped strict team format yields exact QA participants and group sizes", () => {
  for (const event of BUILTIN_EVENTS.filter(candidate => candidate.teamCfg)) {
    const expected = event.teamCfg.teams * event.teamCfg.size;
    const players = defaultQaParticipants(event, ROSTER);
    assert.equal(players.length, expected, `${event.id} QA participant count`);
    assert.equal(validateEventParticipants(event, players, ROSTER).ok, true, `${event.id} validation`);
    const draw = drawTeams(event, structuredClone(EMPTY_STATE), players);
    assert.ok(draw, `${event.id} draw`);
    assert.equal(draw.teams.length, event.teamCfg.teams, `${event.id} team count`);
    assert.ok(draw.teams.every(team => team.players.length === event.teamCfg.size),
      `${event.id} exact group size`);
  }
  assert.ok(makeBracket(4));
  assert.ok(makeBracket(6));
  assert.equal(makeBracket(5), null);
});

test("shared lifecycle drives one guarded GM action from setup through completion", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(resolveWeekendOperation(state).event.id, "putt");
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "setup");
  assert.equal(resolveEventLifecycle(state, longPutt).nextAction.type, "open-betting");

  assert.equal(applyAction(state, "setOnDeck", { evId:"ignored", id:"putt" }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "betting-open");
  assert.match(applyAction(state, "startEvent", { evId:"putt" }, gm).error, /lock betting/i);

  assert.equal(applyAction(state, "setOnDeck", { id:null }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "betting-locked");
  assert.equal(applyAction(state, "startEvent", { evId:"putt" }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "in-progress");
  assert.equal(applyAction(state, "beginResultEntry", { evId:"putt" }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "result-entry");

  const slots = [["Brandon"], ["Evan"], ["Eyob"]];
  const posted = applyAction(state, "saveResult", { evId:"putt", slots }, gm);
  assert.equal(posted.ok, true);
  assert.equal(state.results.putt.revision, 1);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "complete");

  const retry = applyAction(state, "saveResult", { evId:"putt", slots }, gm);
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(state.results.putt.revision, 1);

  const correctedSlots = [["Evan"], ["Brandon"], ["Eyob"]];
  assert.match(applyAction(state, "saveResult", {
    evId:"putt",
    slots:correctedSlots,
  }, gm).error, /confirm replacing/i);
  assert.match(applyAction(state, "saveResult", {
    evId:"putt",
    slots:correctedSlots,
    confirmOverwrite:true,
  }, gm).error, /reason required/i);
  const corrected = applyAction(state, "saveResult", {
    evId:"putt",
    slots:correctedSlots,
    confirmOverwrite:true,
    correctionReason:"Scorecard was entered backwards",
  }, gm);
  assert.equal(corrected.ok, true);
  assert.equal(state.results.putt.revision, 2);
  assert.equal(state.eventOps.putt.corrections.at(-1).type, "overwrite");

  assert.match(applyAction(state, "clearResult", { evId:"putt" }, gm).error, /confirm clearing/i);
  const cleared = applyAction(state, "clearResult", {
    evId:"putt",
    confirmClear:true,
    correctionReason:"Re-enter from signed scorecard",
  }, gm);
  assert.equal(cleared.ok, true);
  assert.equal(state.results.putt, undefined);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "result-entry");
  assert.equal(state.eventOps.putt.corrections.at(-1).type, "clear");

  const reposted = applyAction(state, "saveResult", {
    evId:"putt",
    slots:correctedSlots,
  }, gm);
  assert.equal(reposted.ok, true);
  assert.equal(state.results.putt.revision, 3);
});

test("bracket progress is rejected until betting locks and play starts", () => {
  const state = structuredClone(EMPTY_STATE);
  const players = ROSTER.slice(0, 12);
  assert.equal(applyAction(state, "runDraw", {
    evId:"8ball",
    players,
    roles:[{ player:ROSTER[12], role:"scorekeeper" }],
  }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, eightBall).phase, "draw-revealed");
  assert.equal(applyAction(state, "setOnDeck", { id:"8ball" }, gm).ok, true);

  const bracket = state.brackets["8ball"];
  const match = bracket.rounds[0][0];
  const teamIdx = match.a.t;
  assert.match(applyAction(state, "pickBracketWinner", {
    evId:"8ball",
    r:0,
    m:0,
    teamIdx,
  }, gm).error, /lock betting/i);
  assert.equal(applyAction(state, "setOnDeck", { id:null }, gm).ok, true);
  assert.equal(applyAction(state, "startEvent", { evId:"8ball" }, gm).ok, true);
  assert.equal(applyAction(state, "pickBracketWinner", {
    evId:"8ball",
    r:0,
    m:0,
    teamIdx,
  }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, eightBall).phase, "in-progress");
  assert.match(applyAction(state, "beginResultEntry", { evId:"8ball" }, gm).error, /complete the bracket/i);

  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    for (let matchIndex = 0; matchIndex < bracket.rounds[roundIndex].length; matchIndex++) {
      const current = bracket.rounds[roundIndex][matchIndex];
      if (current.winner !== null && current.winner !== undefined) continue;
      const winner = resolveSlot(bracket, current.a);
      assert.notEqual(winner, null);
      assert.equal(applyAction(state, "pickBracketWinner", {
        evId:"8ball",
        r:roundIndex,
        m:matchIndex,
        teamIdx:winner,
      }, gm).ok, true);
    }
  }
  assert.equal(applyAction(state, "beginResultEntry", { evId:"8ball" }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, eightBall).phase, "result-entry");
  const final = bracket.rounds.at(-1)[0];
  const alternate = resolveSlot(bracket, final.b);
  assert.equal(applyAction(state, "pickBracketWinner", {
    evId:"8ball",
    r:bracket.rounds.length - 1,
    m:0,
    teamIdx:alternate,
  }, gm).ok, true);
  assert.equal(resolveEventLifecycle(state, eightBall).phase, "in-progress");
  assert.equal(state.eventOps["8ball"].resultEntryAt, undefined);
});

test("weekend operation keeps the newest active event as the canonical next action", () => {
  const state = structuredClone(EMPTY_STATE);
  state.eventOps.putt = { startedAt:200 };
  state.drafts.pong = { ts:100 };
  assert.equal(resolveWeekendOperation(state).event.id, "putt");

  state.drafts.pong.ts = 300;
  assert.equal(resolveWeekendOperation(state).event.id, "pong");
});

test("wager ledger is retry-safe, aggregates intentional chips, retracts one chip, and recalculates corrections", () => {
  const state = structuredClone(EMPTY_STATE);
  const bettor = actionId => ({
    isGm:false,
    player:"Evan",
    deviceId:"device-evan",
    actionId,
  });
  const wager = (pick, stake) => ({
    kind:"outright",
    eventId:"putt",
    evName:"Long Putt",
    pick,
    pickPlayers:[pick],
    pickTeam:false,
    stake,
  });

  assert.equal(applyAction(state, "setOnDeck", { id:"putt" }, gm).ok, true);
  const first = applyAction(state, "placeWager", { wager:wager("Khoa", 200) }, bettor("place-1"));
  assert.equal(first.ok, true);
  assert.equal(state.wagers.length, 1);
  assert.equal(state.wagers[0].stake, 200);

  const retry = applyAction(state, "placeWager", { wager:wager("Khoa", 200) }, bettor("place-1"));
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(state.wagers.length, 1);
  assert.equal(state.wagers[0].stake, 200);

  const reused = applyAction(state, "placeWager", { wager:wager("Brandon", 100) }, bettor("place-1"));
  assert.equal(reused.ok, false);
  assert.match(reused.error, /request id already used/i);

  const aggregated = applyAction(state, "placeWager", { wager:wager("Khoa", 100) }, bettor("place-2"));
  assert.equal(aggregated.ok, true);
  assert.equal(aggregated.extra.aggregated, true);
  assert.equal(state.wagers.length, 1);
  assert.equal(state.wagers[0].stake, 300);
  assert.equal(state.wagers[0].chips.length, 2);

  assert.equal(applyAction(state, "placeWager", {
    wager:wager("Brandon", 100),
  }, bettor("place-3")).ok, true);
  assert.equal(state.wagers.length, 2);
  assert.equal(atRisk(state, "Evan", allEventsOf(state)), 400);

  const khoaWager = state.wagers.find(entry => entry.pick === "Khoa");
  const retracted = applyAction(state, "retractWager", { id:khoaWager.id }, bettor("retract-1"));
  assert.equal(retracted.ok, true);
  assert.equal(retracted.extra.removed, false);
  assert.equal(khoaWager.stake, 200);
  assert.equal(khoaWager.chips.length, 1);
  const retractRetry = applyAction(state, "retractWager", { id:khoaWager.id }, bettor("retract-1"));
  assert.equal(retractRetry.ok, true);
  assert.equal(retractRetry.extra.unchanged, true);
  assert.equal(khoaWager.stake, 200);

  assert.equal(applyAction(state, "setOnDeck", { id:null }, gm).ok, true);
  assert.equal(applyAction(state, "startEvent", { evId:"putt" }, gm).ok, true);
  assert.equal(applyAction(state, "beginResultEntry", { evId:"putt" }, gm).ok, true);
  assert.equal(applyAction(state, "saveResult", {
    evId:"putt",
    slots:[["Khoa"], ["Brandon"], ["Eyob"]],
  }, gm).ok, true);
  assert.equal(computeStandings(state).find(row => row.player === "Evan").betNet, 300);

  assert.equal(applyAction(state, "saveResult", {
    evId:"putt",
    slots:[["Brandon"], ["Khoa"], ["Eyob"]],
    confirmOverwrite:true,
    correctionReason:"Signed scorecard correction",
  }, gm).ok, true);
  assert.equal(computeStandings(state).find(row => row.player === "Evan").betNet, 0);
  assert.equal(Object.keys(state.wagerOps).length, 4);
});

test("locking betting keeps its bracket active after matchup chips settle", () => {
  const state = structuredClone(EMPTY_STATE);
  const bettor = {
    isGm:false,
    player:"Jeremy",
    deviceId:"device-jeremy",
    actionId:"locked-bracket-wager",
  };

  assert.equal(applyAction(state, "runDraw", {
    evId:"8ball",
    players:ROSTER.slice(0, 12),
  }, gm).ok, true);
  const bracket = state.brackets["8ball"];
  const draw = state.draws["8ball"];
  const match = bracket.rounds[0][0];
  const teamIdx = resolveSlot(bracket, match.a);

  assert.equal(applyAction(state, "setOnDeck", { id:"8ball" }, gm).ok, true);
  assert.equal(applyAction(state, "placeWager", { wager:{
    kind:"match",
    eventId:"8ball",
    evName:"8-Ball Doubles",
    drawId:draw.id,
    match:[0, 0],
    matchName:"Play-in",
    teamIdx,
    pickPlayers:[...draw.teams[teamIdx].players],
    pickTeam:true,
    stake:100,
  } }, bettor).ok, true);
  assert.equal(wagerBoardEvent(state).id, "8ball");

  assert.equal(applyAction(state, "setOnDeck", { id:null }, gm).ok, true);
  assert.equal(state.onDeck, null);
  assert.equal(wagerBoardEvent(state).id, "8ball");

  assert.equal(applyAction(state, "startEvent", { evId:"8ball" }, gm).ok, true);
  assert.equal(applyAction(state, "pickBracketWinner", {
    evId:"8ball",
    r:0,
    m:0,
    teamIdx,
  }, gm).ok, true);
  assert.equal(wagerBoardEvent(state).id, "8ball");
});

test("locking an empty market keeps its betting board visible until the result posts", () => {
  const state = structuredClone(EMPTY_STATE);

  assert.equal(wagerBoardEvent(state), null);
  assert.equal(applyAction(state, "setOnDeck", { id:"putt" }, gm).ok, true);
  assert.equal(wagerBoardEvent(state).id, "putt");

  assert.equal(applyAction(state, "setOnDeck", { id:null }, gm).ok, true);
  assert.equal(state.wagers.length, 0);
  assert.equal(resolveEventLifecycle(state, longPutt).phase, "betting-locked");
  assert.equal(wagerBoardEvent(state).id, "putt");

  assert.equal(applyAction(state, "startEvent", { evId:"putt" }, gm).ok, true);
  assert.equal(wagerBoardEvent(state).id, "putt");
  assert.equal(applyAction(state, "beginResultEntry", { evId:"putt" }, gm).ok, true);
  assert.equal(wagerBoardEvent(state).id, "putt");

  assert.equal(applyAction(state, "saveResult", {
    evId:"putt",
    slots:[["Brandon"], ["Evan"], ["Eyob"]],
  }, gm).ok, true);
  assert.equal(wagerBoardEvent(state), null);
});

test("QA bracket betting covers open matchups without backing a player's opponent", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(state, "runDraw", {
    evId:"8ball",
    players:ROSTER.slice(0, 12),
  }, gm).ok, true);
  const draw = state.draws["8ball"];
  const bracket = state.brackets["8ball"];
  const picks = ROSTER.slice(0, 9).map((player, index) =>
    qaBracketMatchWager(state, eightBall, player, index, 100));

  assert.equal(picks.every(wager => wager?.kind === "match"), true);
  assert.equal(new Set(picks.map(wager => wager.match.join(":"))).size, 2);
  assert.equal(applyAction(state, "setOnDeck", { id:"8ball" }, gm).ok, true);
  for (let index = 0; index < picks.length; index++) {
    const player = ROSTER[index];
    const wager = picks[index];
    const match = bracket.rounds[wager.match[0]][wager.match[1]];
    const sides = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
    assert.equal(sides.includes(wager.teamIdx), true);
    const myTeamIdx = draw.teams.findIndex(team => team.players.includes(player));
    if (sides.includes(myTeamIdx)) assert.equal(wager.teamIdx, myTeamIdx);
    assert.equal(applyAction(state, "placeWager", { wager }, {
      isGm:false,
      player,
      deviceId:`qa-device-${index}`,
      actionId:`qa-match-${index}`,
    }).ok, true);
  }
  assert.equal(state.wagers.filter(wager => wager.kind === "match").length, 9);
});

test("snapshot builder excludes credentials and internal backups", () => {
  const entries = snapshotEntries();
  entries.set("gmToken", "secret");
  entries.set("m1:pre-restore:123:manifest", { secret:"backup" });
  entries.set("m1:pre-reset:456:manifest", { secret:"reset-backup" });
  entries.set("future:portable-key", { value:1 });
  const snapshot = buildSnapshot(entries, {
    environment:"local",
    applicationVersion:"test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  assert.equal(snapshot.entries.some(entry => entry.key === "gmToken"), false);
  assert.equal(snapshot.entries.some(entry => entry.key.startsWith("m1:pre-restore:")), false);
  assert.equal(snapshot.entries.some(entry => entry.key.startsWith("m1:pre-reset:")), false);
  assert.deepEqual(snapshot.entries.find(entry => entry.key === "future:portable-key")?.value, { value:1 });
  assert.equal(validateSnapshot(snapshot).ok, true);
});

test("game progress reset requires explicit capability and preserves people plus event configuration", () => {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  state.results.putt = { slots:[["Brandon"]], ts:1 };
  state.wagers = [{ id:"w1" }];
  state.adjustments = [{ id:"a1" }];
  state.draws["8ball"] = { id:"draw-1" };
  state.brackets["8ball"] = { size:6, rounds:[] };
  state.stages.putt = { id:"stage-1" };
  state.drafts.pong = { id:"draft-1" };
  state.duels = [{ id:"duel-1" }];
  state.poker = { id:"poker" };
  state.shelved.pong = true;
  state.onDeck = "putt";
  state.frozen = true;
  state.eventOps.putt = { completedAt:1 };
  state.profiles.Brandon = {
    display:"B",
    size:"L",
    color:"#123456",
    flightIn:{ air:"AA", num:"100", time:"15:00" },
  };
  state.seeds.Brandon = { pool:4 };
  state.logistics = { ...state.logistics, venue:"Saved house" };
  state.onboardEpoch = 9;
  state.customEvents = [{ id:"custom-1", name:"Custom event" }];
  state.eventEdits.putt = { name:"Pressure putt" };
  state.eventOrder = ["custom-1", "putt"];
  const preserved = {
    profiles:structuredClone(state.profiles),
    seeds:structuredClone(state.seeds),
    logistics:structuredClone(state.logistics),
    onboardEpoch:state.onboardEpoch,
    customEvents:structuredClone(state.customEvents),
    eventEdits:structuredClone(state.eventEdits),
    eventOrder:structuredClone(state.eventOrder),
  };

  assert.match(applyAction(state, "resetTournament", {
    confirm:RESET_PROGRESS_CONFIRMATION,
  }, gm).error, /unavailable/i);
  assert.match(applyAction(state, "resetTournament", {}, {
    ...gm,
    progressReset:true,
  }).error, /confirm/i);
  assert.equal(applyAction(state, "resetTournament", {
    confirm:RESET_PROGRESS_CONFIRMATION,
  }, {
    ...gm,
    progressReset:true,
  }).ok, true);

  for (const [key, value] of Object.entries(preserved))
    assert.deepEqual(state[key], value, `${key} survives a progress reset`);
  assert.equal(state.live, false);
  assert.equal(state.frozen, false);
  assert.equal(state.onDeck, null);
  assert.deepEqual(state.results, {});
  assert.deepEqual(state.wagers, []);
  assert.deepEqual(state.adjustments, []);
  assert.deepEqual(state.draws, {});
  assert.deepEqual(state.brackets, {});
  assert.deepEqual(state.stages, {});
  assert.deepEqual(state.drafts, {});
  assert.deepEqual(state.duels, []);
  assert.equal(state.poker, null);
  assert.deepEqual(state.shelved, {});
  assert.deepEqual(state.eventOps, {});
});

test("snapshot round-trip includes referenced photos and has a deterministic hash", async () => {
  const entries = snapshotEntries();
  const state = entries.get("state");
  state.profiles.Brandon = { display:"Brandon", photoV:123 };
  entries.set("photo:Brandon", "data:image/png;base64,AA==");
  const snapshot = buildSnapshot(entries, {
    environment:"staging",
    applicationVersion:"test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true);
  assert.equal(checked.stats.photos, 1);
  assert.deepEqual(checked.entries.get("state"), state);
  assert.equal(await snapshotSha256(snapshot), await snapshotSha256(snapshot));
});

test("restore versions remain monotonic for older and newer snapshots", () => {
  assert.equal(nextRestoreVersion(50, 7), 51);
  assert.equal(nextRestoreVersion(7, 50), 51);
});

test("environment capabilities fail closed and production restore routes hard deny", async () => {
  const unknown = tournamentFor({});
  assert.equal(unknown.environment, "production");
  assert.deepEqual(unknown.capabilities, {
    qa:false,
    progressReset:false,
    restore:false,
    snapshotExport:false,
  });

  const local = tournamentFor({
    APP_ENV:"local",
    QA_ENABLED:"true",
    PROGRESS_RESET_ENABLED:"true",
  });
  assert.deepEqual(local.capabilities, {
    qa:true,
    progressReset:true,
    restore:true,
    snapshotExport:true,
  });

  const production = tournamentFor({
    APP_ENV:"production",
    QA_ENABLED:"true",
    PROGRESS_RESET_ENABLED:"true",
    SNAPSHOT_ADMIN_TOKEN:"snapshot-test-token",
  });
  assert.deepEqual(production.capabilities, {
    qa:true,
    progressReset:true,
    restore:false,
    snapshotExport:false,
  });
  production.gmToken = "test-token";
  const weakRequest = new Request("https://fielddayseries.com/api/admin/snapshot", {
    headers:{ Authorization:"Bearer test-token" },
  });
  assert.equal((await production.handleAdmin(weakRequest, new URL(weakRequest.url))).status, 403);
  for (const path of ["/api/admin/restore", "/api/admin/restore-backup"]) {
    const request = new Request(`https://fielddayseries.com${path}`, {
      method:"POST",
      headers:{ Authorization:"Bearer snapshot-test-token" },
    });
    const response = await production.handleAdmin(request, new URL(request.url));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /disabled in production/);
  }
});

test("Durable Object publishes state only after the atomic storage write succeeds", async () => {
  let rejectWrite = true;
  let stored = null;
  const context = {
    blockConcurrencyWhile() {},
    getWebSockets() { return []; },
    storage:{
      async put(value) {
        if (rejectWrite) throw new Error("storage unavailable");
        stored = structuredClone(value);
      },
    },
  };
  const tournament = new Tournament(context, { APP_ENV:"local" });
  tournament.state = structuredClone(EMPTY_STATE);
  tournament.version = 8;
  const candidate = structuredClone(tournament.state);
  candidate.frozen = true;

  await assert.rejects(
    tournament.persistAndBroadcast("setFrozen", candidate),
    /storage unavailable/,
  );
  assert.equal(tournament.state.frozen, false);
  assert.equal(tournament.version, 8);

  rejectWrite = false;
  await tournament.persistAndBroadcast("setFrozen", candidate);
  assert.equal(tournament.state.frozen, true);
  assert.equal(tournament.version, 9);
  assert.equal(stored.state.frozen, true);
  assert.equal(stored.version, 9);
});

test("malformed, incompatible, unsafe, and incomplete snapshots are rejected", () => {
  assert.throws(() => JSON.parse("{broken"));
  assert.equal(validateSnapshot(null).ok, false);

  const valid = buildSnapshot(snapshotEntries(), {
    environment:"local",
    applicationVersion:"test",
    exportedAt:"2026-07-28T12:00:00.000Z",
  });
  const legacyV5 = structuredClone(valid);
  legacyV5.metadata.stateSchemaVersion = 5;
  legacyV5.entries.find(entry => entry.key === "state").value.v = 5;
  assert.equal(validateSnapshot(legacyV5).ok, true);
  const legacyV6 = structuredClone(valid);
  legacyV6.metadata.stateSchemaVersion = 6;
  legacyV6.entries.find(entry => entry.key === "state").value.v = 6;
  assert.equal(validateSnapshot(legacyV6).ok, true);
  const missingState = structuredClone(valid);
  missingState.entries = missingState.entries.filter(entry => entry.key !== "state");
  assert.match(validateSnapshot(missingState).errors.join(" "), /Missing required storage key: state/);

  const wrongSchema = structuredClone(valid);
  wrongSchema.metadata.stateSchemaVersion = 999;
  wrongSchema.entries.find(entry => entry.key === "state").value.v = 999;
  assert.match(validateSnapshot(wrongSchema).errors.join(" "), /Unsupported/);

  const unsafe = structuredClone(valid);
  unsafe.entries.push({ key:"gmToken", value:"do-not-import" });
  assert.match(validateSnapshot(unsafe).errors.join(" "), /Unsafe storage key/);

  const duplicate = structuredClone(valid);
  duplicate.entries.push(structuredClone(duplicate.entries[0]));
  assert.match(validateSnapshot(duplicate).errors.join(" "), /Duplicate storage key/);

  const missingPhoto = structuredClone(valid);
  missingPhoto.entries.find(entry => entry.key === "state").value.profiles.Brandon =
    { display:"Brandon", photoV:1 };
  assert.match(validateSnapshot(missingPhoto).errors.join(" "), /Missing referenced photo/);

  const oversized = structuredClone(valid);
  oversized.entries.push({ key:"future:large", value:"x".repeat(8 * 1024 * 1024) });
  assert.match(validateSnapshot(oversized).errors.join(" "), /maximum size/);
});

test("pre-M1 state hydrates additively without rewriting persisted values", () => {
  const stored = {
    v:5,
    profiles:{ Brandon:{ display:"B", num:10 } },
    results:{ putt:{ id:"r1", slots:[["Brandon"], [], []] } },
    logistics:{ v:2, venue:"Original venue" },
    legacyMarker:"keep-me",
  };
  const untouched = structuredClone(stored);
  const hydrated = hydrateStoredState(stored);

  assert.deepEqual(stored, untouched);
  assert.deepEqual(hydrated.profiles.Brandon, { display:"B", num:10 });
  assert.equal(hydrated.results.putt.id, "r1");
  assert.equal(hydrated.logistics.venue, "Original venue");
  assert.equal(hydrated.legacyMarker, "keep-me");
  assert.equal(hydrated.v, 7);
  assert.deepEqual(hydrated.eventOps, {});
  assert.deepEqual(hydrated.wagerOps, {});
  assert.ok(Array.isArray(hydrated.wagers));
  assert.ok(hydrated.draws && typeof hydrated.draws === "object");
});
