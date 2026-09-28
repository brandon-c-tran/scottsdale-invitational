import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, EMPTY_STATE, ROSTER, computeStandings, makeBracket, resolveCurrentContest, resolveWager, teamLabel } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

/* Compile the real components once. React stays external so server rendering
   and the component hooks share the same instance. No browser/network/state
   store is started, and no generated files or git baseline are required. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { Wagers, wagerPickLabel, mergeWagerLines } from "./src/features/wagers/Wagers.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("wagers-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { Wagers, wagerPickLabel, mergeWagerLines, PlayerIdentityProvider } = componentModule.exports;

const solo = BUILTIN_EVENTS.find(event => event.id === "putt");
const pairs = BUILTIN_EVENTS.find(event => event.id === "8ball");
const player = ROSTER[0];
const fresh = event => ({ ...structuredClone(EMPTY_STATE), live:true, onDeck:event.id });
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

/* Capture native button handlers during a real React render. Exercise them
   through their accessible names and disabled states, not layout/classes. */
function controls(state, event, overrides = {}) {
  const buttons = [], picks = [], retractions = [], retractionRefs = [], voids = [];
  let html;
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button" && props?.onClick) buttons.push({
      name:(props["aria-label"] || textOf(children)).trim(), description:props["aria-description"],
      disabled:!!props.disabled, click:props.onClick,
    });
    return createElement(type, props, ...children);
  };
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(Wagers, {
        state, events:BUILTIN_EVENTS, me:player, standings:computeStandings(state), gm:false,
        wagerEv:event, onDeckEv:!state.frozen && state.onDeck === event.id ? event : null,
        onEvents:() => {}, onEvent:() => {}, onPick:pick => picks.push(pick),
        onRetract:(id, ref) => { retractions.push(id); retractionRefs.push(ref); }, onVoid:ids => voids.push(ids), ...overrides,
      })));
  } finally {
    React.createElement = createElement;
  }
  const named = name => {
    const button = buttons.find(item => item.name === name);
    assert.ok(button, `Missing control: ${name}`);
    return button;
  };
  return {
    picks, retractions, retractionRefs, voids, html, named, names:buttons.map(button => button.name),
    click(name) { const button = named(name); assert.equal(button.disabled, false, `${name} is disabled`); return button.click(); },
    pickAll() { buttons.filter(button => !button.disabled && button.name.startsWith("Place a chip on "))
      .forEach(button => button.click()); return picks; },
  };
}

function withTeams(state, event = pairs) {
  state.draws[event.id] = { id:"draw-current", teams:Array.from({ length:4 }, (_, index) => ({
    players:ROSTER.slice(index * 2, index * 2 + 2),
  })) };
  return state.draws[event.id];
}

function refs(state, event) {
  const contest = resolveCurrentContest(state, event);
  return { contestId:contest.id, contestRevision:contest.revision };
}

/* A published next-contest snapshot carries its own open phase and revision;
   an older running event must never reopen just because a result changed. */
function openCurrent(state, event) {
  const contest = resolveCurrentContest(state, event);
  const revision = contest.revision + 1;
  state.eventOps[event.id] = { ...state.eventOps[event.id], contestRevision:revision,
    contest:{ id:contest.id, revision, phase:"betting-open" } };
  return contest;
}

test("the FFA board retains every manual winner choice, including yourself", () => {
  const state = fresh(solo), single = controls(state, solo);
  assert.deepEqual(single.picks, []);
  assert.deepEqual(state.wagers, []);
  assert.match(single.html, /Back yourself/);
  single.click(`Place a chip on ${ROSTER[1]}`);
  assert.deepEqual(single.picks, [{ kind:"outright", eventId:solo.id, pick:ROSTER[1],
    pickPlayers:[ROSTER[1]], pickTeam:false, evName:solo.name, stake:100, ...refs(state, solo) }]);
  assert.equal(controls(state, solo).pickAll().length, ROSTER.length);

  const event = BUILTIN_EVENTS.find(item => item.id === "volley");
  const teamState = fresh(event), draw = withTeams(teamState, event);
  draw.teams = draw.teams.slice(0, 2);
  /* two teams are a matchup: an observer may back either side at even money */
  const teams = controls(teamState, event, { me:ROSTER.at(-1) }), team = draw.teams[1];
  assert.match(teams.html, /Winner pays 1:1/);
  teams.click(`Place a chip on ${teamLabel(teamState, team)}`);
  assert.deepEqual(teams.picks, [{ kind:"outright", eventId:event.id, pickTeam:true,
    pickPlayers:team.players, drawId:draw.id, evName:event.name, stake:100, ...refs(teamState, event) }]);
  assert.equal(controls(teamState, event).named(teamLabel(teamState, team)).disabled, true);
});

test("observers bet only the current bracket matchup, then its successor and final", () => {
  const state = fresh(pairs), draw = withTeams(state);
  const bracket = state.brackets[pairs.id] = makeBracket(4);
  const observer = { me:ROSTER.at(-1) };
  let view = controls(state, pairs, observer), picks = view.pickAll();
  assert.deepEqual(picks.map(pick => [pick.kind, pick.match, pick.teamIdx]), [
    ["match", [0, 0], 0], ["match", [0, 0], 3],
  ]);
  assert.ok(!view.names.includes("Semifinals"));
  for (const pick of picks) {
    assert.equal(pick.drawId, draw.id);
    assert.equal(pick.eventId, pairs.id);
    assert.equal(pick.stake, 100);
    assert.deepEqual(pick.pickPlayers, draw.teams[pick.teamIdx].players);
    assert.equal(pick.contestId, refs(state, pairs).contestId);
    assert.equal(pick.contestRevision, refs(state, pairs).contestRevision);
  }
  bracket.rounds[0][0].winner = 0;
  assert.equal(controls(state, pairs, observer).pickAll().length, 0);
  openCurrent(state, pairs);
  picks = controls(state, pairs, observer).pickAll();
  assert.deepEqual(picks.map(pick => [pick.match, pick.teamIdx]), [[[0, 1], 1], [[0, 1], 2]]);
  bracket.rounds[0][1].winner = 2;
  openCurrent(state, pairs);
  picks = controls(state, pairs, observer).pickAll();
  assert.deepEqual(picks.map(pick => [pick.match, pick.teamIdx]), [[[1, 0], 0], [[1, 0], 2]]);
  assert.ok(picks.every(pick => pick.kind === "match"));
  bracket.rounds[1][0].winner = 2;
  assert.equal(controls(state, pairs, observer).pickAll().length, 0);
});

test("large teams retain their drawn names and every player target alongside manual chip controls", () => {
  const event = BUILTIN_EVENTS.find(item => item.id === "volley");
  const state = fresh(event), viewed = [], opened = [];
  const draw = state.draws[event.id] = { id:"large-team-draw", teams:[
    { name:"The Sidewinders", players:ROSTER.slice(0, 6) },
    { name:"The Coyotes", players:ROSTER.slice(6, 12) },
  ] };
  state.wagers = [{ id:"large-team-stack", player, kind:"outright", eventId:event.id,
    pickTeam:true, pickPlayers:draw.teams[0].players, drawId:draw.id,
    stake:300, chips:[{ stake:100 }, { stake:200 }] }];
  const view = controls(state, event, {
    onPlayer:name => viewed.push(name), onEvent:ev => opened.push(ev.id),
  });
  for (const member of draw.teams.flatMap(team => team.players))
    view.click(`View ${member}'s player card`);
  assert.deepEqual(viewed, ROSTER.slice(0, 12));
  assert.deepEqual(view.picks, []);
  /* a Sidewinder backs only the Sidewinders */
  assert.equal(view.named("The Coyotes").disabled, true);
  view.click("Place a chip on The Sidewinders");
  assert.deepEqual(view.picks[0].pickPlayers, draw.teams[0].players);
  assert.equal(view.picks[0].drawId, draw.id);
  assert.equal(view.picks[0].stake, 100);
  view.click("Retract your last chip on The Sidewinders");
  assert.deepEqual(view.retractions, ["large-team-stack"]);
  assert.deepEqual(view.retractionRefs, [refs(state, event)]);
  view.click("Event details↗");
  assert.deepEqual(opened, [event.id]);
  assert.equal(view.picks.length, 1);
});

test("match participants can manually back their team while opponents stay visible with a reason", () => {
  const state = fresh(pairs), draw = withTeams(state);
  state.brackets[pairs.id] = makeBracket(4);
  const opened = [], view = controls(state, pairs, { onEvent:event => opened.push(event.id) });
  const opponent = teamLabel(state, draw.teams[3]);
  assert.match(view.html, /Your team/);
  assert.match(view.html, /You can only bet on your team in this match/);
  assert.equal(view.named(opponent).disabled, true);
  assert.equal(view.named(opponent).description, "You can only bet on your team in this match.");
  assert.deepEqual(view.picks, []);
  view.click(`Open the full ${pairs.name} bracket`);
  assert.deepEqual(opened, [pairs.id]);
  assert.deepEqual(view.picks, []);
  view.click(`Place a chip on ${teamLabel(state, draw.teams[0])}`);
  assert.equal(view.picks.length, 1);
  assert.equal(view.picks[0].teamIdx, 0);
});

test("heat winner betting offers one heat at a time and a separate final", () => {
  const state = fresh(solo);
  const stage = state.stages[solo.id] = { id:"stage-current", eventId:solo.id, kind:"heats",
    entrantType:"player", advance:1, groups:[
      { name:"Heat A", entrants:ROSTER.slice(0, 3), through:[], winner:null },
      { name:"Heat B", entrants:ROSTER.slice(3, 6), through:[], winner:null },
    ], finalWinner:null };
  const observer = { me:ROSTER.at(-1) };
  let picks = controls(state, solo, observer).pickAll();
  assert.equal(picks.length, 3);
  assert.ok(picks.every(pick => pick.kind === "heat" && pick.group === 0));
  assert.deepEqual(picks[0], { kind:"heat", eventId:solo.id, stagesId:stage.id,
    group:0, groupName:resolveCurrentContest(state, solo).label, pickKey:ROSTER[0], pickPlayers:[ROSTER[0]],
    pickTeam:false, evName:solo.name, stake:100, ...refs(state, solo) });
  const participant = controls(state, solo);
  assert.match(participant.html, /Back yourself/);
  assert.equal(participant.named(ROSTER[1]).disabled, true);
  assert.equal(participant.pickAll().length, 1);
  assert.equal(participant.picks[0].pickKey, player);

  stage.groups[0].winner = ROSTER[0];
  stage.groups[0].through = [ROSTER[0]];
  assert.equal(controls(state, solo, observer).pickAll().length, 0);
  openCurrent(state, solo);
  picks = controls(state, solo, observer).pickAll();
  assert.deepEqual(picks.map(pick => pick.group), [1, 1, 1]);
  stage.groups[1].winner = ROSTER[3];
  stage.groups[1].through = [ROSTER[3]];
  openCurrent(state, solo);
  picks = controls(state, solo, observer).pickAll();
  assert.deepEqual(picks.map(pick => [pick.kind, pick.final, pick.pickKey]), [
    ["stage", true, ROSTER[0]], ["stage", true, ROSTER[3]],
  ]);
  assert.ok(picks.every(pick => pick.stagesId === stage.id));
  const finalist = controls(state, solo);
  assert.equal(finalist.pickAll().length, 1);
  assert.match(finalist.html, /You can only bet on yourself in this final/);
  stage.finalWinner = ROSTER[0];
  assert.equal(controls(state, solo, observer).pickAll().length, 0);
});

test("team heat picks retain team identity and the current draw and stage references", () => {
  const event = BUILTIN_EVENTS.find(item => item.id === "spike");
  const state = fresh(event), draw = withTeams(state, event);
  state.stages[event.id] = { id:"pools-current", eventId:event.id, drawId:draw.id, kind:"pools",
    entrantType:"team", advance:1, groups:[{ name:"Pool A", entrants:[0, 1], through:[], winner:null }], finalWinner:null };
  const view = controls(state, event), picks = view.pickAll();
  assert.equal(picks.length, 1);
  assert.deepEqual(picks[0], { kind:"heat", eventId:event.id, stagesId:"pools-current", drawId:draw.id,
    group:0, groupName:resolveCurrentContest(state, event).label, pickKey:0, pickPlayers:draw.teams[0].players,
    pickTeam:true, evName:event.name, stake:100, ...refs(state, event) });
});

test("locked markets and full exposure disable picks while the rack respects available chips", () => {
  const state = fresh(solo);
  const smallStack = controls(state, solo, {
    standings:computeStandings(state).map(row => row.player === player ? { ...row, pts:300 } : row),
  });
  assert.equal(smallStack.named("Bet 200 a tap").disabled, false);
  assert.equal(smallStack.named("Bet 500 a tap").disabled, true);
  state.wagers = [{ id:"at-cap", player, kind:"outright", eventId:solo.id,
    pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:500 }];
  const capped = controls(state, solo);
  assert.equal(capped.named(ROSTER[1]).disabled, true);
  assert.equal(capped.named("Bet 100 a tap").disabled, true);
  assert.equal(capped.pickAll().length, 0);
  capped.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(capped.retractions, ["at-cap"]);
  state.onDeck = null;
  const locked = controls(state, solo);
  assert.equal(locked.named(ROSTER[1]).disabled, true);
  assert.equal(locked.pickAll().length, 0);
  assert.equal(locked.names.includes(`Retract your last chip on ${ROSTER[1]}`), false);
});

test("open duel antes reduce available betting chips without preventing a retraction", () => {
  const state = fresh(solo);
  state.wagers = [{ id:"reserved-bet", player, kind:"outright", eventId:solo.id,
    pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:200 }];
  state.duels = [{ id:"reserved-duel", from:player, to:ROSTER[2], stake:200, status:"open", runs:{} }];
  const view = controls(state, solo);
  assert.equal(view.named("Bet 100 a tap").disabled, false);
  assert.equal(view.named("Bet 200 a tap").disabled, true);
  assert.match(view.html, /400 at risk, 500 maximum, 1,000 in your stack, 200 reserved for duels/);
  view.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(view.retractions, ["reserved-bet"]);
  state.duels[0].stake = 300;
  const full = controls(state, solo);
  assert.equal(full.pickAll().length, 0);
  full.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(full.retractions, ["reserved-bet"]);
});

test("new heat-winner and old advancement bets keep separate labels, records and outcomes", () => {
  const state = fresh(solo);
  const stage = state.stages[solo.id] = { id:"mixed-stage", eventId:solo.id, kind:"heats",
    entrantType:"player", advance:2, groups:[{ name:"Heat A", entrants:ROSTER.slice(0, 3), through:[], winner:null }], finalWinner:null };
  const common = { player, eventId:solo.id, stagesId:stage.id, group:0, groupName:"Heat A",
    pickKey:ROSTER[1], pickPlayers:[ROSTER[1]], stake:100 };
  const advancement = { ...common, id:"old-advance", kind:"stage" };
  const winner = { ...common, id:"new-winner", kind:"heat" };
  state.wagers = [advancement, winner];
  assert.equal(wagerPickLabel(state, advancement, BUILTIN_EVENTS).ctx, `to advance from Heat A in ${solo.name}`);
  assert.equal(wagerPickLabel(state, winner, BUILTIN_EVENTS).ctx, `to win Heat A in ${solo.name}`);
  const lines = mergeWagerLines(state.wagers.map(w => ({ w, r:resolveWager(state, w, BUILTIN_EVENTS) })));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(line => line.w.stake), [100, 100]);
  const before = structuredClone(state.wagers);
  const view = controls(state, solo);
  assert.match(view.html, /to advance from Heat A/);
  assert.match(view.html, /to win Heat A/);
  assert.deepEqual(state.wagers, before);
  stage.groups[0].winner = ROSTER[0];
  stage.groups[0].through = [ROSTER[0], ROSTER[1]];
  assert.deepEqual(resolveWager(state, advancement, BUILTIN_EVENTS), { status:"won", delta:100 });
  assert.deepEqual(resolveWager(state, winner, BUILTIN_EVENTS), { status:"lost", delta:-100 });
});

test("old event-outright bets remain in the ledger while the bracket exposes only a current match", () => {
  const state = fresh(pairs), draw = withTeams(state);
  state.brackets[pairs.id] = makeBracket(4);
  state.wagers = [{ id:"old-event-winner", player, kind:"outright", eventId:pairs.id,
    pickTeam:true, pickPlayers:draw.teams[0].players, drawId:draw.id, stake:100 }];
  const view = controls(state, pairs);
  assert.match(view.html, new RegExp(`to win ${pairs.name}`));
  assert.ok(view.pickAll().every(pick => pick.kind === "match"));
  assert.equal(state.wagers[0].kind, "outright");
});

test("retraction targets one record while commissioner void retains every merged legacy id", () => {
  const state = fresh(solo);
  const wager = { id:"aggregate", player, kind:"outright", eventId:solo.id,
    pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:300, chips:[{ stake:100 }, { stake:200 }] };
  state.wagers = [wager];
  const view = controls(state, solo);
  view.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(view.retractions, [wager.id]);
  assert.deepEqual(view.retractionRefs, [refs(state, solo)]);
  const result = applyAction(state, "retractWager", { id:view.retractions[0] }, {
    player, deviceId:"test-device", actionId:"retract-once",
  });
  assert.equal(result.ok, true);
  assert.equal(state.wagers[0].stake, 100);
  assert.equal(state.wagers[0].chips.length, 1);

  state.wagers = [
    { ...wager, id:"legacy-a", stake:100, chips:undefined },
    { ...wager, id:"legacy-b", stake:200, chips:undefined },
  ];
  const before = structuredClone(state.wagers);
  const legacy = controls(state, solo, { gm:true });
  legacy.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(legacy.retractions, ["legacy-b"]);
  legacy.click("Void");
  assert.deepEqual(legacy.voids, [["legacy-a", "legacy-b"]]);
  assert.deepEqual(state.wagers, before);
});

test("player cards and chip placement have independent targets on the same board", () => {
  const viewed = [];
  const view = controls(fresh(solo), solo, { onPlayer:p => viewed.push(p) });
  view.click(`View ${ROSTER[1]}'s player card`);
  assert.deepEqual(viewed, [ROSTER[1]]);
  assert.deepEqual(view.picks, []);
  view.click(`Place a chip on ${ROSTER[1]}`);
  assert.equal(view.picks.length, 1);
  assert.deepEqual(viewed, [ROSTER[1]]);

  const state = fresh(pairs), draw = withTeams(state);
  state.brackets[pairs.id] = makeBracket(4);
  const teams = controls(state, pairs, { onPlayer:p => viewed.push(p) });
  teams.click(`View ${draw.teams[3].players[1]}'s player card`);
  assert.equal(viewed.at(-1), draw.teams[3].players[1]);
  assert.deepEqual(teams.picks, []);

  const otherBettor = fresh(solo);
  otherBettor.wagers = [{ id:"other-chip", player:ROSTER[2], kind:"outright", eventId:solo.id,
    pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:200 }];
  const chips = controls(otherBettor, solo, { onPlayer:p => viewed.push(p) });
  chips.click(`View ${ROSTER[2]}'s player card (200 chips)`);
  assert.equal(viewed.at(-1), ROSTER[2]);
  assert.deepEqual(chips.picks, []);
  assert.deepEqual(chips.retractions, []);
});

test("before the weekend and between events the page keeps the original empty-state copy", () => {
  const before = controls({ ...fresh(solo), live:false, onDeck:null }, solo, { wagerEv:null });
  assert.match(before.html, /Betting opens with the first event/);
  assert.equal(before.pickAll().length, 0);
  const between = controls({ ...fresh(solo), onDeck:null }, solo, { wagerEv:null });
  assert.match(between.html, /Between events/);
  const finished = controls({ ...fresh(solo), frozen:true, onDeck:null }, solo, { wagerEv:null });
  assert.match(finished.html, /The board is frozen\./);
});

test("the active board has one event heading and rejects stale open-market props", () => {
  const open = controls(fresh(solo), solo);
  assert.equal((open.html.match(/<h1>/g) || []).length, 1);
  assert.match(open.html, new RegExp(`<h1>${solo.name}</h1>`));
  assert.doesNotMatch(open.html, /<h1>Bets<\/h1>/);
  const wager = { id:"owned", player, kind:"outright", eventId:solo.id,
    pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:100 };
  const lockedStates = [
    { frozen:true },
    { live:false },
    { onDeck:null },
    { poker:{ id:"poker", startedAt:null } },
    { poker:{ id:"poker", startedAt:1 } },
    { results:{ poker:{ stacks:{ [player]:1000 } } } },
  ];
  for (const patch of lockedStates) {
    const state = { ...fresh(solo), wagers:[wager], ...patch };
    const view = controls(state, solo, { onDeckEv:solo });
    assert.equal(view.pickAll().length, 0, JSON.stringify(patch));
    assert.equal(view.names.includes(`Retract your last chip on ${ROSTER[1]}`), false);
    assert.equal(view.names.includes("Bet 100 a tap"), false);
    assert.match(view.html, /Betting locked/);
  }
});

test("a stack shows its actual chip values and removes the newest legacy record", () => {
  const state = fresh(solo);
  const wager = { player, kind:"outright", eventId:solo.id, pick:ROSTER[1], pickPlayers:[ROSTER[1]] };
  state.wagers = [
    { ...wager, id:"older-record-newest-chip", stake:300, ts:1, updatedAt:3,
      chips:[{ stake:100, ts:1 }, { stake:200, ts:3 }] },
    { ...wager, id:"newer-record-older-chip", stake:100, ts:2 },
  ];
  const view = controls(state, solo);
  assert.match(view.html, /data-chip-stake="100"/);
  assert.match(view.html, /data-chip-stake="200"/);
  assert.equal(view.named(`Retract your last chip on ${ROSTER[1]}`).description,
    "Remove 200 chips; 400 total on this pick");
  view.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(view.retractions, ["older-record-newest-chip"]);
});

test("a pending chip action waits for acknowledgment before accepting another action on that pick", async () => {
  const state = fresh(solo), sent = [];
  let acknowledge;
  const view = controls(state, solo, { onPick:pick => {
    sent.push(pick);
    return new Promise(resolve => { acknowledge = resolve; });
  } });
  const first = view.click(`Place a chip on ${ROSTER[1]}`);
  view.click(`Place a chip on ${ROSTER[1]}`);
  assert.equal(sent.length, 1);
  acknowledge({ ok:true });
  await first;
  const next = view.click(`Place a chip on ${ROSTER[1]}`);
  assert.equal(sent.length, 2);
  acknowledge({ ok:false, error:"Betting is locked" });
  await next;
  assert.deepEqual(state.wagers, []);
});

test("failed retraction preserves the server stack and allows a later retry", async () => {
  const state = fresh(solo), sent = [];
  state.wagers = [{ id:"owned", player, kind:"outright", eventId:solo.id,
    pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:300, chips:[{ stake:100 }, { stake:200 }] }];
  const before = structuredClone(state.wagers);
  let acknowledge;
  const view = controls(state, solo, { onRetract:id => {
    sent.push(id);
    return new Promise(resolve => { acknowledge = resolve; });
  } });
  const first = view.click(`Retract your last chip on ${ROSTER[1]}`);
  view.click(`Retract your last chip on ${ROSTER[1]}`);
  view.click(`Place a chip on ${ROSTER[1]}`);
  assert.deepEqual(sent, ["owned"]);
  assert.deepEqual(view.picks, []);
  acknowledge({ ok:false, error:"Connection lost" });
  await first;
  assert.deepEqual(state.wagers, before);
  const retry = view.click(`Retract your last chip on ${ROSTER[1]}`);
  assert.deepEqual(sent, ["owned", "owned"]);
  acknowledge({ ok:true });
  await retry;
});

test("a rejected action promise is contained and releases the target for retry", async () => {
  const state = fresh(solo);
  let attempts = 0;
  const view = controls(state, solo, { onPick:() => {
    attempts += 1;
    return attempts === 1 ? Promise.reject(new Error("Connection lost")) : Promise.resolve({ ok:true });
  } });
  const failed = await view.click(`Place a chip on ${ROSTER[1]}`);
  assert.deepEqual(failed, { ok:false, error:"Connection lost" });
  const retried = await view.click(`Place a chip on ${ROSTER[1]}`);
  assert.deepEqual(retried, { ok:true });
  assert.equal(attempts, 2);
  assert.deepEqual(state.wagers, []);
});
