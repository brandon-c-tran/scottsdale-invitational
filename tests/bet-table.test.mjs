import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, UPSET_PRICE, allEventsOf, computeStandings, contestPool, poolNet, poolPrice, resolveCurrentContest,
} from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { decidedContest } from "../src/features/wagers/betStacks.js";
import {
  GRID_COLS, backLine, fillLevel, gridRows, mineBack, nextBack, returnOn, settledTable, sharePcts, tableShape, tableView,
} from "../src/features/wagers/tableModel.js";

/* The table (Oct 13): what each spot shows is pure (tableModel.js); the drag
   of a rack chip onto a spot runs through the real Wagers board. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { tableDrag, tableDragJustEnded } from "./src/features/wagers/BetTable.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const bundle = new Module(fileURLToPath(new URL("bet-table.cjs", import.meta.url)));
bundle.filename = bundle.id;
bundle.paths = Module._nodeModulePaths(root);
bundle._compile(compiled.outputFiles[0].text, bundle.filename);
const { Wagers, tableDrag, tableDragJustEnded, PlayerIdentityProvider } = bundle.exports;

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"bt-gm", actionId:`bt-${++seq}` });
const as = player => ({ player, deviceId:`d-${player}`, actionId:`bt-${++seq}` });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const evOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const current = (state, id) => resolveCurrentContest(state, evOf(state, id));
function bet(state, evId, player, sideIndex, stake) {
  const contest = current(state, evId);
  const side = contest.sides[sideIndex];
  const base = { eventId:evId, contestId:contest.id, contestRevision:contest.revision, stake, pickPlayers:[...side.players] };
  const wager = contest.kind === "match"
    ? { ...base, kind:"match", drawId:contest.drawId, match:[...contest.match], matchName:contest.label, teamIdx:side.key, pickTeam:true }
    : { ...base, kind:"outright", pick:side.key };
  act(state, "placeWager", { wager }, as(player));
}
function liveMatch() {
  const state = structuredClone(EMPTY_STATE);
  ROSTER.forEach(player => act(state, "adjust", { player, delta:1500, reason:"Test" }));
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const contest = current(state, "8ball");
  return { state, contest, bystanders:ROSTER.filter(p => !contest.players.includes(p)) };
}

test("shares are whole percents that always add to 100, largest remainder first", () => {
  assert.deepEqual(sharePcts([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(sharePcts([2100, 1600]), [57, 43]);
  assert.deepEqual(sharePcts([0, 0]), [0, 0], "no money, no shares");
  assert.deepEqual(sharePcts([]), []);
  assert.deepEqual(sharePcts([-50, 100]), [0, 100], "a negative is no money");
  /* thirteen sides of every shape still sum to 100 */
  let seed = 7;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let run = 0; run < 200; run++) {
    const money = Array.from({ length:1 + Math.floor(rand() * 13) }, () => Math.round(rand() * 30) * 100);
    const pcts = sharePcts(money);
    if (money.some(value => value > 0)) assert.equal(pcts.reduce((sum, value) => sum + value, 0), 100, money.join(","));
    pcts.forEach((pct, i) => assert.ok(Math.abs(pct - money[i] / money.reduce((a, b) => a + b, 0) * 100) < 1 || !money.some(Boolean)));
  }
});

test("a spot's fill: none without money, never a hairline, never quite full", () => {
  assert.equal(fillLevel(0), 0);
  assert.equal(fillLevel(-1), 0);
  assert.equal(fillLevel(0.001), 0.04, "an unbacked spot's seed still shows");
  assert.equal(fillLevel(0.5), 0.5);
  assert.equal(fillLevel(1), 0.96, "a spot with all the money still reads as a fill");
});

test("table shapes: two sides a match, three to six a row, seven or more a 7-wide grid", () => {
  assert.deepEqual([1, 2, 3, 6, 7, 13].map(tableShape), ["match", "match", "row", "row", "grid", "grid"]);
  assert.equal(GRID_COLS, 7);
  assert.deepEqual([0, 7, 8, 13, 14, 15].map(count => gridRows(count)), [1, 1, 2, 2, 2, 3], "13 is 7 + 6");
  assert.equal(backLine(1200, 3450), "1,200 → 3,450");
});

test("what comes back: a pool prices your chip into its own side; a legacy contest pays its fixed multiple", () => {
  const table = { pool:true, total:2300 };
  const spot = { pool:true, money:1100, mine:0, price:poolPrice(2300, 1100) };
  /* your 100 joins the side before it is priced, so it brings back less than the price it sees */
  assert.equal(nextBack(spot, table, 100), 100 + poolNet(100, poolPrice(2400, 1200)));
  assert.equal(returnOn(spot, table, 100), nextBack(spot, table, 100));
  assert.ok(nextBack(spot, table, 100) <= 100 + poolNet(100, spot.price));
  /* chips already down ride in the side's money; the next one prices them together */
  const yours = { ...spot, mine:300 };
  assert.equal(nextBack(yours, table, 200), 500 + poolNet(500, poolPrice(2500, 1300)));
  assert.equal(mineBack(yours), 300 + poolNet(300, spot.price));
  assert.equal(mineBack({ ...spot, mine:0 }), 0);
  assert.equal(nextBack(spot, table, 0), 0, "no chip, nothing back");
  /* the long shot pays more for the same chip */
  const empty = { pool:true, money:100, mine:0, price:poolPrice(2300, 100) };
  assert.ok(nextBack(empty, table, 100) > nextBack(spot, table, 100));
  /* legacy: 1:1 doubles, 2:1 triples, whatever is on the side */
  assert.equal(nextBack({ mine:0, mult:1 }, { pool:false }, 100), 200);
  assert.equal(nextBack({ mine:200, mult:2 }, { pool:false }, 100), 900);
  assert.equal(mineBack({ mine:200, mult:2, pool:false }), 600);
  assert.equal(returnOn(null, table, 100), 0);
});

test("tableView: a spot a side in the contest's order, the seeds in the shares, yours priced", () => {
  const { state, contest, bystanders } = liveMatch();
  bet(state, "8ball", bystanders[0], 0, 1000);
  bet(state, "8ball", bystanders[1], 0, 500);
  bet(state, "8ball", bystanders[2], 1, 200);
  const me = bystanders[2];
  const table = tableView(state, allEventsOf(state), current(state, "8ball"), me);
  assert.equal(table.shape, "match");
  assert.equal(table.pool, true);
  assert.deepEqual(table.spots.map(spot => spot.key), contest.sides.map(side => side.key));
  const pool = contestPool(state, current(state, "8ball"));
  assert.equal(table.total, pool.total);
  assert.equal(table.staked, 1700);
  assert.deepEqual(table.spots.map(spot => spot.money), [100 + 1500, 100 + 200]);
  assert.equal(table.spots.reduce((sum, spot) => sum + spot.pct, 0), 100);
  assert.deepEqual(table.spots.map(spot => spot.bettors), [2, 1]);
  /* yours: which spot, and what it brings back at its price now */
  assert.equal(table.mine, contest.sides[1].key);
  const [, mine] = table.spots;
  assert.equal(mine.mine, 200);
  assert.equal(mine.back, 200 + poolNet(200, mine.price));
  /* 1,800 over 300 is 6x: the matchup's long shot is lit */
  assert.ok(mine.price >= UPSET_PRICE && mine.long);
  assert.equal(table.spots[0].long, false);
  /* a spectator's view of the same table has nothing of theirs */
  const spectator = tableView(state, allEventsOf(state), current(state, "8ball"), bystanders[5]);
  assert.equal(spectator.mine, null);
  assert.ok(spectator.spots.every(spot => spot.mine === 0 && spot.back === 0));
  assert.equal(tableView(state, allEventsOf(state), null), null);

  /* a 13-way field is a grid, where no spot is lit as the long shot */
  const ffa = structuredClone(EMPTY_STATE);
  act(ffa, "announceEvent", { evId:"putt" });
  bet(ffa, "putt", "Adi", ROSTER.indexOf("Khoa"), 500);
  const wide = tableView(ffa, allEventsOf(ffa), current(ffa, "putt"), "Adi");
  assert.equal(wide.shape, "grid");
  assert.equal(wide.spots.length, ROSTER.length);
  assert.ok(wide.spots.every(spot => !spot.long));
  assert.equal(wide.spots.reduce((sum, spot) => sum + spot.pct, 0), 100);
});

test("settledTable: the decided table as it stood, the winner, what each winner was paid, yours", () => {
  const { state, contest, bystanders } = liveMatch();
  const [a, b, c] = bystanders;
  bet(state, "8ball", a, 0, 1000);
  bet(state, "8ball", b, 1, 200);
  bet(state, "8ball", c, 1, 100);
  const decided0 = current(state, "8ball");
  const before = tableView(state, allEventsOf(state), decided0, b);
  act(state, "lockAndStart", { evId:"8ball", contestId:decided0.id, contestRevision:decided0.revision });
  const locked = current(state, "8ball");
  act(state, "recordContestWinner", { evId:"8ball", contestId:locked.id, contestRevision:locked.revision, winner:contest.sides[1].key });
  const decided = decidedContest(state, allEventsOf(state), "8ball", decided0);
  const table = settledTable(state, decided0, decided, b);
  assert.equal(table.settled, true);
  assert.equal(table.shape, "match");
  assert.equal(table.winner, contest.sides[1].key);
  const [lost, won] = table.spots;
  assert.deepEqual([lost.won, won.won], [false, true]);
  /* the shares stand as the room bet them */
  assert.deepEqual(table.spots.map(spot => spot.pct), before.spots.map(spot => spot.pct));
  /* the winners split the losing side's money: b's 200 at the locked price */
  const paidB = won.stacks.find(item => item.player === b).paid;
  assert.equal(paidB, poolNet(200, won.price));
  assert.equal(won.back, 200 + paidB, "yours: your stake and what it was paid");
  assert.equal(won.paid, won.stacks.reduce((sum, item) => sum + item.paid, 0));
  assert.equal(lost.back, 0);
  /* a long shot that came in carries its price; the beaten favorite never */
  assert.ok(won.price >= UPSET_PRICE);
  assert.equal(won.long, true);
  assert.equal(lost.long, false);
  assert.equal(settledTable(state, decided0, null, b), null, "undecided: no settled table");
});

/* ── the drag: a rack chip held and dragged onto a spot places that chip ── */
function board(state, me, onPick, { runEffects = false } = {}) {
  const buttons = [], effects = [];
  const createElement = React.createElement, useEffect = React.useEffect;
  React.createElement = (type, props, ...children) => {
    if (type === "button" && props) buttons.push(props);
    return createElement(type, props, ...children);
  };
  /* server rendering runs no effects; the spots register their drop targets
     in one, so the drag test runs them once the board has rendered */
  if (runEffects) React.useEffect = fn => { effects.push(fn); };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
        wagerEv:evOf(state, "putt"), onEvents() {}, onEvent() {}, onRetract() {}, onPlayer() {}, onPick })));
  } finally { React.createElement = createElement; React.useEffect = useEffect; }
  effects.forEach(fn => { try { fn(); } catch {} });
  return { html, rack:value => buttons.find(props => props["aria-label"] === `Bet ${value} a tap`) };
}
/* the finger over a spot: elementFromPoint finds the spot's printed square */
function withSpotUnderFinger(key, run) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "document"), was = globalThis.document;
  globalThis.document = { elementFromPoint:x => x >= 100
    ? { closest:selector => selector === "[data-spot]" ? { getAttribute:name => name === "data-spot" ? key : null } : null } : null };
  try { return run(); } finally { if (had) globalThis.document = was; else delete globalThis.document; }
}
const pointer = (x, extra = {}) => ({ pointerType:"touch", button:0, pointerId:7, clientX:x, clientY:40,
  currentTarget:{ setPointerCapture() {} }, ...extra });

test("drag: a rack chip held past the slop and dropped on a spot places that chip there", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const picks = [];
  const me = ROSTER[0], target = ROSTER[1];
  const view = board(state, me, pick => { picks.push(pick); return { ok:true }; }, { runEffects:true });
  const chip = view.rack(500);
  assert.ok(chip && !chip.disabled, "the 500 is affordable");
  withSpotUnderFinger(target, () => {
    chip.onPointerDown(pointer(10));
    chip.onPointerMove(pointer(15));
  });
  assert.doesNotMatch(board(state, me, () => {}).html, /is-over/, "a nudge under the slop is still a tap");
  withSpotUnderFinger(target, () => chip.onPointerMove(pointer(150)));
  /* in the air over the spot: the spot lifts and previews what this chip brings back */
  const air = board(state, me, () => {}).html;
  const table = tableView(state, allEventsOf(state), current(state, "putt"), me);
  const back = nextBack(table.spots.find(item => item.key === target), table, 500);
  assert.match(air, new RegExp(`<div class="fd-spot is-grid is-open is-over" data-spot="${target}"`));
  assert.equal((air.match(/class="fd-spot [^"]*is-over/g) || []).length, 1, "only the spot under the finger");
  assert.match(air, new RegExp(`<span class="fd-spot-drop" aria-hidden="true">${backLine(500, back)}</span>`));
  /* the wide field's spots (3 a row since Oct 13) say it in their own line too */
  assert.match(air, new RegExp(`<span class="fd-spot-back is-over" aria-hidden="true">${backLine(500, back)}</span>`));
  assert.deepEqual(picks, [], "nothing is placed while the chip is in the air");
  chip.onPointerUp(pointer(150));
  assert.equal(picks.length, 1, "the drop places one chip");
  assert.equal(picks[0].pick, target);
  assert.equal(picks[0].stake, 500, "at the dragged chip's own value, not the selected one");
  /* the pointerup also reads as a click on the rack chip: it is swallowed */
  assert.equal(tableDragJustEnded(), true);
  let prevented = 0;
  chip.onClickCapture({ preventDefault() { prevented++; }, stopPropagation() { prevented++; } });
  assert.equal(prevented, 2, "the click after a drag never selects the chip");
  assert.doesNotMatch(board(state, me, () => {}).html, /is-over|fd-spot-drop/, "the table is still again");
});

test("drag: released off the table or cancelled, nothing is placed", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const picks = [];
  const view = board(state, ROSTER[0], pick => { picks.push(pick); return { ok:true }; }, { runEffects:true });
  const chip = view.rack(200);
  withSpotUnderFinger(ROSTER[1], () => {
    /* dragged, but let go where no spot is */
    chip.onPointerDown(pointer(10));
    chip.onPointerMove(pointer(60));
    chip.onPointerUp(pointer(60));
    /* over a spot, then the system takes the touch */
    chip.onPointerDown(pointer(10));
    chip.onPointerMove(pointer(150));
    chip.onPointerCancel(pointer(150));
  });
  assert.doesNotMatch(board(state, ROSTER[0], () => {}).html, /is-over/, "a cancelled drag leaves the table still");
  assert.deepEqual(picks, []);
  /* the store on its own: a drop lands only on the spot under the finger */
  withSpotUnderFinger("nobody", () => {
    tableDrag.start(100, 0, 0);
    tableDrag.move(150, 0);
    tableDrag.end();
  });
  assert.deepEqual(picks, [], "no spot of that key: no write");
});
