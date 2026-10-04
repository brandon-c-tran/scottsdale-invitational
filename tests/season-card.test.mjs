import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, makeBracket } from "../shared/core.js";
import { withLegacyEvents } from "./support/legacy-events.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { seasonStats, eventRow, headToHead, rivalries, betRecord, betsOn, duelTally, eventMeetings,
      wagerPickPlayers, recordText } from "./src/features/profile/seasonStats.js";
    export { PlayerSheet, rematchAvailable } from "./src/features/profile/PlayerSheet.jsx";
    export { PlayerPass } from "./src/features/profile/PlayerPass.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("season-card.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { seasonStats, eventRow, headToHead, rivalries, betRecord, betsOn, duelTally, eventMeetings,
  wagerPickPlayers, recordText, PlayerSheet, rematchAvailable, PlayerPass, PlayerIdentityProvider } = componentModule.exports;

const [A, B, C, D, E, F, G, H, I, J, K, L, M] = ROSTER;
const ev = (s, id) => allEventsOf(s).find(item => item.id === id);

/* Beer Pong Doubles (1,200: 1,200 / 600 / 300) played as a six-team
   bracket: T0 beats T3 and T1 in the final, T1 beats T5, T3 and T5 won
   their play-ins. M crews. */
function played() {
  const s = { ...structuredClone(EMPTY_STATE), live:true };
  const teams = [[A, B], [C, D], [E, F], [G, H], [I, J], [K, L]].map(players => ({ players }));
  s.draws.pong = { id:"d-pong", teams, roles:[{ player:M, role:"referee" }], ts:1 };
  const br = makeBracket(6);
  br.rounds[0][0].winner = 3; br.rounds[0][1].winner = 5;
  br.rounds[1][0].winner = 0; br.rounds[1][1].winner = 1;
  br.rounds[2][0].winner = 0;
  s.brackets.pong = br;
  s.results.pong = { slots:[[A, B], [C, D], [G, H, K, L]], ts:10, revision:1 };
  return s;
}

test("an event row carries the place and award the board paid", () => {
  const s = played();
  const pong = ev(s, "pong");
  assert.deepEqual(pick(eventRow(s, pong, A)), { status:"placed", place:"1st", award:1200 });
  assert.deepEqual(pick(eventRow(s, pong, C)), { status:"placed", place:"2nd", award:600 });
  assert.deepEqual(pick(eventRow(s, pong, G)), { status:"placed", place:"3rd", award:300 },
    "each semifinal loser takes the full 3rd");
  assert.deepEqual(pick(eventRow(s, pong, K)), { status:"placed", place:"3rd", award:300 });
  assert.deepEqual(pick(eventRow(s, pong, E)), { status:"out", place:"Play-in", award:0 });
  assert.deepEqual(pick(eventRow(s, pong, M)), { status:"crew", place:"Crew", award:300 });
  const standings = computeStandings(s);
  const byPlayer = Object.fromEntries(standings.map(row => [row.player, row.pts]));
  assert.equal(byPlayer[G], 1300, "the card reads the same derived award as the board");
  assert.equal(byPlayer[M], 1300, "crew take the 3rd-place award");
});
const pick = row => row && ({ status:row.status, place:row.place, award:row.award });

test("a bracket in progress shows who is alive and where the rest went out", () => {
  const s = played();
  delete s.results.pong;
  s.brackets.pong.rounds[2][0].winner = null;
  s.brackets.pong.rounds[1][1].winner = null;
  const pong = ev(s, "pong");
  assert.deepEqual(pick(eventRow(s, pong, A)), { status:"playing", place:"Final", award:null });
  assert.deepEqual(pick(eventRow(s, pong, C)), { status:"playing", place:"SF", award:null });
  assert.deepEqual(pick(eventRow(s, pong, G)), { status:"out", place:"SF", award:null });
  assert.deepEqual(pick(eventRow(s, pong, M)), { status:"crew", place:"Crew", award:null });
  assert.equal(eventRow(s, ev(s, "8ball"), A), null, "an event nobody has started is not on the card");
});

test("before the weekend the card has only what exists", () => {
  const s = structuredClone(EMPTY_STATE);
  const stats = seasonStats(s, A, { viewer:B });
  assert.deepEqual(stats.events, []);
  assert.equal(stats.rank, null);
  assert.equal(stats.pts, null);
  assert.equal(stats.versus, null);
  assert.equal(stats.active, false);
  const live = seasonStats({ ...s, live:true }, A);
  assert.equal(live.rank, null, "a board where nobody has moved has no rank to show");
  assert.equal(live.pts, 1000);
  assert.equal(live.active, false);
});

test("bracket meetings count opposite sides only, and follow a correction", () => {
  const s = played();
  assert.deepEqual(eventMeetings(s, A, B), [], "partners never meet");
  const final = eventMeetings(s, A, C);
  assert.equal(final.length, 1);
  assert.equal(final[0].won, true);
  assert.equal(final[0].label, "Final");
  const semi = eventMeetings(s, G, A);
  assert.equal(semi[0].label, "Semifinal 1");
  assert.equal(semi[0].won, false);
  /* the commissioner corrects the final: derived, so the record flips */
  s.brackets.pong.rounds[2][0].winner = 1;
  s.results.pong = { slots:[[C, D], [A, B], [G, H, K, L]], ts:11, revision:2 };
  assert.equal(eventMeetings(s, A, C)[0].won, false);
  assert.equal(pick(eventRow(s, ev(s, "pong"), A)).place, "2nd");
  /* a shelved event leaves every card */
  s.shelved = { pong:true };
  assert.deepEqual(eventMeetings(s, A, C), []);
  assert.equal(eventRow(s, ev(s, "pong"), A), null);
});

test("heats rank only their winner, and two-sided matchups meet across the teams", () => {
  const s = played();
  s.stages.beerio = { id:"s-bk", eventId:"beerio", kind:"heats", entrantType:"solo", advance:1, contestVersion:1,
    groups:[
      { name:"Heat 1", entrants:[A, C, E, G], through:[A], winner:A },
      { name:"Heat 2", entrants:[B, D, F, H], through:[H], winner:H },
      { name:"Heat 3", entrants:[I, J, K, L, M], through:[], winner:null },
    ], finalWinner:null, ts:5 };
  const heat = (x, y) => eventMeetings(s, x, y).find(m => m.eventId === "beerio");
  assert.equal(heat(C, A).won, false);
  assert.equal(heat(C, A).label, "Heat 1");
  assert.deepEqual(eventMeetings(s, C, E).filter(m => m.eventId === "beerio"), [], "two heat losers did not meet");
  const beerio = ev(s, "beerio");
  assert.deepEqual(pick(eventRow(s, beerio, C)), { status:"out", place:"Heat", award:null });
  assert.deepEqual(pick(eventRow(s, beerio, A)), { status:"playing", place:"Final", award:null });
  assert.deepEqual(pick(eventRow(s, beerio, I)), { status:"playing", place:"Heat 3", award:null });
  /* legacy heats kept only the qualifying list */
  s.stages.beerio.groups[1] = { name:"Heat 2", entrants:[B, D, F, H], through:[H] };
  assert.equal(heat(B, H).won, false);

  /* Flip Cup (legacy): two even teams, one game */
  withLegacyEvents(s, ["flip"]);
  s.draws.flip = { id:"d-flip", teams:[{ players:[A, C, E, G, I, K] }, { players:[B, D, F, H, J, L] }], roles:[{ player:M, role:"referee" }], ts:6 };
  s.results.flip = { slots:[[B, D, F, H, J, L]], ts:12, revision:1 };
  const flip = eventMeetings(s, A, B).find(m => m.eventId === "flip");
  assert.equal(flip.won, false);
  assert.equal(flip.label, "Flip Cup");
  assert.equal(eventMeetings(s, A, C).some(m => m.eventId === "flip"), false, "teammates did not meet");
  assert.equal(pick(eventRow(s, ev(s, "flip"), A)).place, "–");
});

test("bets and Quick Draw settle through the shared resolvers, legacy tickets included", () => {
  const s = played();
  s.wagers = [
    /* a legacy outright ticket without a stored multiplier pays 2:1 */
    { id:"w1", player:C, kind:"outright", eventId:"pong", pick:A, stake:100, ts:1 },
    { id:"w2", player:C, kind:"match", eventId:"pong", drawId:"d-pong", match:[1, 0], teamIdx:3,
      pickPlayers:[G, H], pickTeam:true, stake:200, ts:2 },
    /* a stale draw id voids the ticket */
    { id:"w3", player:C, kind:"match", eventId:"pong", drawId:"old", match:[1, 0], teamIdx:0, stake:500, ts:3 },
    { id:"w4", player:C, kind:"outright", eventId:"putt", pick:E, stake:100, ts:4 },
  ];
  const bets = betRecord(s, C);
  assert.deepEqual([bets.won, bets.lost, bets.net, bets.pending, bets.atRisk], [1, 1, 0, 1, 100]);
  assert.equal(bets.best.delta, 200);
  assert.deepEqual(wagerPickPlayers(s, s.wagers[1]), [G, H]);
  assert.deepEqual(betsOn(s, C, A), { won:1, lost:0, net:200 });
  assert.equal(computeStandings(s).find(row => row.player === C).betNet, bets.net);

  s.duels = [
    { id:"d1", from:A, to:C, stake:300, status:"open", consent:true, acceptedAt:1,
      runs:{ [A]:{ ms:200 }, [C]:{ ms:250 } }, ts:1 },
    { id:"d2", from:C, to:A, stake:100, status:"open", runs:{ [A]:{ foul:true }, [C]:{ ms:300 } }, ts:2 },
    { id:"d3", from:C, to:A, stake:100, status:"open", runs:{ [A]:{ foul:true }, [C]:{ foul:true } }, ts:3 },
    { id:"d4", from:C, to:A, stake:500, status:"void", runs:{}, ts:4 },
    { id:"d5", from:A, to:E, stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:5 },
  ];
  assert.deepEqual(duelTally(s, A), { won:1, lost:1, push:1, net:200 });
  assert.equal(recordText(duelTally(s, A)), "1-1-1");
  const record = headToHead(s, A, C);
  assert.equal(record.won, 2, "the final and one Quick Draw");
  assert.equal(record.lost, 1);
  assert.equal(recordText(record), "2-1");
});

test("rivalries rank the players met most, closest first", () => {
  const s = played();
  s.duels = [
    { id:"d1", from:A, to:G, stake:100, status:"open", runs:{ [A]:{ ms:200 }, [G]:{ ms:250 } }, ts:1 },
    { id:"d2", from:A, to:G, stake:100, status:"open", runs:{ [A]:{ ms:300 }, [G]:{ ms:250 } }, ts:2 },
  ];
  const list = rivalries(s, A);
  assert.equal(list[0].other, G, "three meetings with G outrank one with C");
  assert.equal(recordText(list[0]), "2-1");
  assert.deepEqual(list.map(record => record.other), [G, C, D]);
});

test("the season stats bundle carries rank, chips, the viewer's record and own rivalries", () => {
  const s = played();
  s.wagers = [{ id:"w1", player:C, kind:"outright", eventId:"pong", pick:A, stake:100, mult:2, ts:1 }];
  const standings = computeStandings(s);
  const mine = seasonStats(s, A, { standings, viewer:A });
  assert.equal(mine.rank, standings.find(row => row.player === A).rank);
  assert.equal(mine.pts, 2200);
  assert.equal(mine.wins, 1);
  assert.equal(mine.versus, null);
  assert.ok(mine.rivals.length > 0);
  const theirs = seasonStats(s, A, { standings, viewer:C });
  assert.equal(recordText(theirs.versus), "0-1");
  assert.equal(theirs.versus.bets.net, 200);
  assert.deepEqual(theirs.rivals, []);
  assert.equal(seasonStats(s, A, { standings, viewer:M }).versus, null, "no meetings, no record");
});

test("Rematch is offered only while a duel could be sent to both", () => {
  const s = played();
  const events = allEventsOf(s);
  assert.equal(rematchAvailable(s, C, A, { events }), true);
  assert.equal(rematchAvailable(s, A, A, { events }), false, "not on your own card");
  assert.equal(rematchAvailable(s, M, A, { events }), false, "no record, no rematch");
  assert.equal(rematchAvailable({ ...s, live:false }, C, A, { events }), false);
  assert.equal(rematchAvailable({ ...s, frozen:true }, C, A, { events }), false);
  assert.equal(rematchAvailable({ ...s, away:{ [A]:true } }, C, A, { events }), false);
  assert.equal(rematchAvailable({ ...s, away:{ [C]:true } }, C, A, { events }), false);
  assert.equal(rematchAvailable({ ...s, poker:{ id:"poker", startedAt:1 } }, C, A, { events }), false);
  const pending = { ...s, duels:[{ id:"x", from:A, to:C, stake:100, status:"open", consent:true,
    acceptedAt:null, runs:{}, ts:Date.now() }] };
  assert.equal(rematchAvailable(pending, C, A, { events }), false, "an open duel shows its own controls");
});

const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");
function render(Component, props) {
  const buttons = [];
  const createElement = React.createElement;
  React.createElement = (type, p, ...children) => {
    if (type === "button") buttons.push({ name:(p?.["aria-label"] || textOf(children)).trim(), click:p?.onClick });
    return createElement(type, p, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:{} }, createElement(Component, props)));
  } finally { React.createElement = createElement; }
  return { html, buttons };
}

test("the card back prints the season, your record against them, and your rivals on your own", () => {
  const s = played();
  s.profiles[A] = { display:"Chiang", num:10 };
  const base = { state:s, standings:computeStandings(s), events:allEventsOf(s), onClose:() => {}, onDuel:() => ({ ok:true }) };
  const theirs = render(PlayerSheet, { ...base, me:C, p:A });
  assert.match(theirs.html, /You vs Chiang/);
  assert.doesNotMatch(theirs.html, /Beer Pong Doubles · Final/, "the meeting names the event, no round meta");
  assert.match(theirs.html, /Beer Pong Doubles/);
  assert.match(theirs.html, /\+1,200/);
  assert.match(theirs.html, /2,200/);
  assert.doesNotMatch(theirs.html, /Rivalries/);
  assert.equal(theirs.buttons.some(button => button.name === "Rematch"), false, "Rematch waits for the card to turn");
  const own = render(PlayerSheet, { ...base, me:A, p:A });
  assert.match(own.html, /Rivalries/);
  assert.doesNotMatch(own.html, /You vs/);
  /* a guest before the weekend keeps the plain back */
  const early = render(PlayerPass, { state:structuredClone(EMPTY_STATE), p:A });
  assert.match(early.html, /Scottsdale, Arizona/);
  assert.doesNotMatch(early.html, /fd-pass-season/);
});
