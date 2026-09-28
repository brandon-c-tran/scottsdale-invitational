import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AWARDS, BUILTIN_EVENTS, CHIP_COLORS, EMPTY_STATE, ROSTER, computeStandings, makeBracket, resolveCurrentContest,
} from "../shared/core.js";
import { contestWinLines, winSlots, joinNames, ordinal, winLineFor } from "../src/features/standings/winImpact.js";
import { BAR_FLOOR, MAX_UNITS, barScale, barUnit, chipBar, rowMoves, soleLeader, BOARD_BEATS }
  from "../src/features/standings/boardModel.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { GuestHome } from "./src/features/home/GuestHome.jsx";
    export { Leaderboard, ChipBar } from "./src/features/standings/Standings.jsx";
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
    export { TVWinLine } from "./src/features/tv/TVCards.jsx";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "three"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("home-table.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const ui = componentModule.exports;

const eightBall = BUILTIN_EVENTS.find(event => event.id === "8ball");
const volley = BUILTIN_EVENTS.find(event => event.id === "volley");
const putt = BUILTIN_EVENTS.find(event => event.id === "putt");
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true });
const noop = () => {};
const StubMark = () => null;

/* four pairs; both semifinals decided, so the final is the current contest */
function finalState() {
  const state = fresh();
  state.draws[eightBall.id] = { id:"d8", teams:Array.from({ length:4 }, (_, i) => ({ players:ROSTER.slice(i * 2, i * 2 + 2) })) };
  state.brackets[eightBall.id] = makeBracket(4);
  state.brackets[eightBall.id].rounds[0][0].winner = 0;
  state.brackets[eightBall.id].rounds[0][1].winner = 1;
  state.onDeck = eightBall.id;
  return state;
}
const render = (Component, props, state) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider,
  { profiles:state.profiles }, React.createElement(Component, props)));

test("X8: a bracket final's win line names the rank it reaches, from the real awards", () => {
  const state = finalState();
  /* team 1 (Eyob & Sahil) is ahead going in; team 0 trails */
  state.adjustments = [{ id:"a", player:ROSTER[2], delta:300, ts:1 }, { id:"b", player:ROSTER[3], delta:300, ts:1 }];
  const contest = resolveCurrentContest(state, eightBall);
  assert.equal(contest.kind, "match");
  assert.deepEqual(winSlots(state, eightBall, contest, 0)[0], ROSTER.slice(0, 2));
  const lines = contestWinLines(state, eightBall, contest);
  assert.equal(lines.length, 2);
  const zero = winLineFor(lines, 0), one = winLineFor(lines, 1);
  assert.equal(zero.kind, "rank");
  assert.equal(zero.text, `Win: ${ROSTER[0]} and ${ROSTER[1]} to 1st`);
  assert.equal(one.kind, "chips", "already leading: the line is the chips");
  assert.equal(one.text, `Win: ${ROSTER[2]} and ${ROSTER[3]} +${AWARDS[eightBall.value][0]}`);
});

test("X8: a win that posts nothing says nothing, and wagers are never the side's standings", () => {
  const state = finalState();
  state.brackets[eightBall.id].rounds[0][1].winner = null;
  const semi = resolveCurrentContest(state, eightBall);
  assert.equal(semi.match[0], 0);
  assert.equal(winSlots(state, eightBall, semi, semi.sides[0].key), null);
  assert.deepEqual(contestWinLines(state, eightBall, semi), [null, null]);

  /* a huge pending bet on team 0 by a spectator changes nothing about the line */
  const final = finalState();
  const contest = resolveCurrentContest(final, eightBall);
  const before = contestWinLines(final, eightBall, contest).map(line => line?.text);
  final.wagers = [{ id:"w", player:ROSTER[12], kind:"match", eventId:eightBall.id, drawId:"d8", match:[1, 0],
    teamIdx:0, pickTeam:true, pickPlayers:ROSTER.slice(0, 2), stake:5000 }];
  assert.deepEqual(contestWinLines(final, eightBall, contest).map(line => line?.text), before);
});

test("X8: a two-team game fixes 2nd too; a big team reads as its team label; ties say tie", () => {
  const state = fresh();
  state.draws[volley.id] = { id:"dv", teams:[{ players:ROSTER.slice(0, 6) }, { players:ROSTER.slice(6, 12) }] };
  state.onDeck = volley.id;
  const contest = resolveCurrentContest(state, volley);
  assert.equal(contest.sides.length, 2);
  const slots = winSlots(state, volley, contest, 0);
  assert.deepEqual(slots[0], ROSTER.slice(0, 6));
  assert.deepEqual(slots[1], AWARDS[volley.value][1] > 0 ? ROSTER.slice(6, 12) : []);
  /* everyone level: already tied for 1st, so the line is the chips each */
  const lines = contestWinLines(state, volley, contest);
  assert.equal(lines[0].kind, "chips");
  assert.equal(lines[0].text, `Win: Team ${ROSTER[0]} +${AWARDS[volley.value][0].toLocaleString("en-US")}`);

  /* someone ahead: the six winners climb past the rest of the field */
  const ahead = fresh();
  ahead.draws[volley.id] = structuredClone(state.draws[volley.id]);
  ahead.onDeck = volley.id;
  ahead.adjustments = [{ id:"t", player:ROSTER[12], delta:AWARDS[volley.value][0] + 500, ts:1 },
    { id:"u", player:ROSTER[6], delta:300, ts:1 }];
  const climb = contestWinLines(ahead, volley, resolveCurrentContest(ahead, volley));
  assert.equal(climb[0].text, `Win: Team ${ROSTER[0]} to 2nd`);

  /* landing level with the leader says tie */
  const tie = finalState();
  tie.adjustments = [{ id:"x", player:ROSTER[12], delta:AWARDS[eightBall.value][0], ts:1 }];
  const tied = contestWinLines(tie, eightBall, resolveCurrentContest(tie, eightBall));
  assert.equal(tied[0].text, `Win: ${ROSTER[0]} and ${ROSTER[1]} tie for 1st`);
  assert.equal(tied[0].tied, true);
});

test("X8: a wide field line is per player, and keys limit the work to your own side", () => {
  const state = fresh();
  state.onDeck = putt.id;
  state.adjustments = [{ id:"l", player:ROSTER[0], delta:300, ts:1 }];
  const contest = resolveCurrentContest(state, putt);
  assert.equal(contest.kind, "ffa");
  const mine = contestWinLines(state, putt, contest, { keys:[ROSTER[4]] });
  assert.equal(mine.filter(Boolean).length, 1);
  assert.equal(winLineFor(mine, ROSTER[4]).text, `Win: ${ROSTER[4]} to 1st`);
  assert.equal(winLineFor(mine, ROSTER[5]), null, "other sides are not worked out");
  assert.equal(joinNames(["A", "B", "C"]), "A, B and C");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
});

test("X1: the chip bar is one unit per 100 while legible, with your exposure outlined at its end", () => {
  assert.equal(barScale([{ pts:1000 }, { pts:900 }]), BAR_FLOOR);
  assert.equal(barScale([{ pts:4600 }]), 4600);
  assert.equal(barUnit(4600), 100);
  assert.equal(barUnit(9000), 200);
  assert.ok(barUnit(40000) / 1 >= 40000 / MAX_UNITS);
  const bar = chipBar({ pts:1000, scale:2000, bets:300, duels:100 });
  assert.equal(bar.slots, 20);
  assert.equal(bar.cells.length, 10);
  assert.deepEqual(bar.cells.map(cell => cell.kind), [...Array(6).fill("held"), "bets", "bets", "bets", "duels"]);
  assert.equal(chipBar({ pts:-300, scale:2000 }).cells.length, 0, "a negative balance draws nothing");
  const partial = chipBar({ pts:1050, scale:2000 });
  assert.equal(partial.cells.length, 11);
  assert.ok(partial.cells.at(-1).w < partial.cells[0].w, "a part unit draws short");
});

test("M2 + M3: moves, the sole leader, and the beat order are pure", () => {
  assert.deepEqual(rowMoves(["a", "b", "c"], ["c", "a", "b"]), { c:{ from:2, to:0 }, a:{ from:0, to:1 }, b:{ from:1, to:2 } });
  assert.deepEqual(rowMoves(["a", "b"], ["a", "b"]), {});
  assert.equal(soleLeader([{ player:"a", rank:1 }, { player:"b", rank:1 }]), null, "a tie has no leader");
  assert.equal(soleLeader([{ player:"a", rank:1 }, { player:"b", rank:2 }]), "a");
  assert.equal(soleLeader([{ player:"a", rank:1 }], true), null, "before play nobody leads");
  assert.ok(BOARD_BEATS.count < BOARD_BEATS.slide && BOARD_BEATS.slide < BOARD_BEATS.roll
    && BOARD_BEATS.roll <= BOARD_BEATS.arrows && BOARD_BEATS.arrows < BOARD_BEATS.settle,
  "count, then slide, then roll, then arrows");
});

test("X1: every row carries a chip bar in its own color, and only your row outlines exposure", () => {
  const state = fresh();
  state.profiles = { [ROSTER[0]]:{ color:CHIP_COLORS[0].hex } };
  state.onDeck = putt.id;
  state.wagers = [{ id:"w", player:ROSTER[0], kind:"outright", eventId:putt.id, pick:ROSTER[5], pickPlayers:[ROSTER[5]], stake:300 }];
  const html = render(ui.Leaderboard, { state, standings:computeStandings(state), me:ROSTER[0], onPlayer:noop,
    myAtRisk:300, StatPills:StubMark }, state);
  assert.equal((html.match(/class="fd-chip-bar"/g) || []).length, ROSTER.length);
  assert.equal((html.match(/class="is-bets"/g) || []).length, 3, "three 100s riding on your bar");
  assert.equal((html.match(/class="is-duels"/g) || []).length, 0);
  assert.ok(html.includes(`fill="${CHIP_COLORS[0].hex}"`), "your bar wears your identity color");
  /* first render: nothing is mid-animation */
  assert.doesNotMatch(html, /fd-rank-roll|fd-lead-sweep|fd-standing-rise|is-popping|data-new-leader/);
  const frozen = render(ui.Leaderboard, { state:{ ...state, frozen:true }, standings:computeStandings(state), me:ROSTER[0],
    onPlayer:noop, myAtRisk:300 }, state);
  assert.doesNotMatch(frozen, /class="is-bets"/, "a frozen board draws no exposure");
});

test("X1 + X8: Home's contest card shows each side's bets and win line, players still open cards", () => {
  const state = finalState();
  state.wagers = [{ id:"w", player:ROSTER[10], kind:"match", eventId:eightBall.id, drawId:"d8", match:[1, 0], teamIdx:1,
    pickTeam:true, pickPlayers:ROSTER.slice(2, 4), stake:300, contestId:resolveCurrentContest(state, eightBall).id }];
  const standings = computeStandings(state);
  const viewed = [];
  const props = { state, me:ROSTER[0], events:[eightBall], standings, GameMark:StubMark, StatPills:StubMark,
    onOpen:noop, onRules:noop, onBets:noop, onBracket:noop, onPlayer:p => viewed.push(p), onStandings:noop, onEvents:noop };
  const html = render(ui.GuestHome, props, state);
  assert.match(html, /You’re playing/);
  assert.match(html, /Final · Match 1/);
  assert.match(html, /aria-label="300 chips bet on this side"/);
  assert.match(html, new RegExp(`Win: ${ROSTER[0]} and ${ROSTER[1]} to 1st|Win: ${ROSTER[0]} and ${ROSTER[1]} \\+400`));
  assert.doesNotMatch(html, /is-stamping|fd-home-sweep/, "a first load never sweeps");
  for (const player of ROSTER.slice(0, 4))
    assert.match(html, new RegExp(`aria-label="View ${player}&#x27;s player card"`));
});

test("X8 reaches the Bets board and the TV live scene", () => {
  const state = finalState();
  const html = render(ui.Wagers, { state, me:ROSTER[12], standings:computeStandings(state), gm:false,
    events:[eightBall], wagerEv:eightBall, onDeckEv:eightBall, onPick:noop, onRetract:noop, onPlayer:noop,
    onEvent:noop, onEvents:noop, onVoid:noop, onSettledSeen:noop, GameMark:StubMark }, state);
  assert.equal((html.match(/class="fd-win-line/g) || []).length, 2);
  const contest = resolveCurrentContest(state, eightBall);
  const lines = contestWinLines(state, eightBall, contest);
  const tv = render(ui.TVWinLine, { lines, sideKey:0 }, state);
  assert.match(tv, /Win: /);
  assert.match(tv, /font:600 28px/, "TV text stays at or above 24px");
  assert.equal(render(ui.TVWinLine, { lines:[null], sideKey:0 }, state), "");
});
