import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHIP_COLORS, EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest, pokerDenoms, pokerInventory } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import {
  STACK_CAP, stackChipCount, stackView, orderStacks, stacksTotal, contestStacks, settleStack, settledStacks,
  eventWinnerStacks, stackGeometry, pickStacks, stackMaxHeight,
} from "../src/features/wagers/betStacks.js";
import { seatStacks, trayStacks, pokerChip, POKER_CHIPS, TRAY_TUBE } from "../src/features/poker/pokerChips.js";
import { advanceMoment, contestRiders } from "../src/features/tv/tvModel.js";
import { fillLevel, tableView } from "../src/features/wagers/tableModel.js";
import { BAND_TABLE_H, SWEEP_MS, TABLE_H, backerPile, entryContest, sweepWindow, tableLayout } from "../src/features/tv/tvTable.js";

/* Everyone's bets as stacks of their own identity chip. The model is pure;
   the render checks run the real components, as the other UI suites do. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { Wagers, FELT_CELLS, ROW_STACKS } from "./src/features/wagers/Wagers.jsx";
    export { PokerSetupSheet } from "./src/features/director/FinaleSheets.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const bundle = new Module(fileURLToPath(new URL("bet-stacks.cjs", import.meta.url)));
bundle.filename = bundle.id;
bundle.paths = Module._nodeModulePaths(root);
bundle._compile(compiled.outputFiles[0].text, bundle.filename);
const { TVMode, Wagers, FELT_CELLS, ROW_STACKS, PokerSetupSheet, PlayerIdentityProvider } = bundle.exports;

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"gm-device", actionId:`bs-${++seq}` });
const as = player => ({ player, deviceId:`d-${player}`, actionId:`bs-${++seq}` });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const evOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const ref = (state, id) => {
  const contest = resolveCurrentContest(state, evOf(state, id));
  return { contestId:contest.id, contestRevision:contest.revision };
};
/* a bet on one side of the current contest, placed through the server */
function bet(state, evId, player, sideIndex, stake) {
  const contest = resolveCurrentContest(state, evOf(state, evId));
  const side = contest.sides[sideIndex];
  const base = { eventId:evId, contestId:contest.id, contestRevision:contest.revision, stake, pickPlayers:[...side.players] };
  const wager = contest.kind === "match"
    ? { ...base, kind:"match", drawId:contest.drawId, match:[...contest.match], matchName:contest.label, teamIdx:side.key, pickTeam:true }
    : { ...base, kind:"outright", pick:side.key };
  act(state, "placeWager", { wager }, as(player));
}
/* a live bracket match with bystanders backing both sides at mixed stakes */
function bracketWithBets() {
  const state = structuredClone(EMPTY_STATE);
  ROSTER.forEach(player => act(state, "adjust", { player, delta:1500, reason:"Test" }));
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const contest = resolveCurrentContest(state, evOf(state, "8ball"));
  const bystanders = ROSTER.filter(p => !contest.players.includes(p));
  const plan = [[0, 1000], [1, 200], [0, 500], [1, 100], [0, 300], [1, 800], [0, 200], [1, 400]];
  bystanders.slice(0, plan.length).forEach((player, index) => bet(state, "8ball", player, ...plan[index]));
  return { state, contest:resolveCurrentContest(state, evOf(state, "8ball")), bystanders };
}

test("a stack is one chip per 100, capped with its value stamped past the cap", () => {
  assert.equal(stackChipCount(0), 0);
  assert.equal(stackChipCount(100), 1);
  assert.equal(stackChipCount(700), 7);
  assert.equal(stackChipCount(50), 1, "any chip at all shows as one");
  assert.deepEqual(stackView(300), { chips:3, shown:3, capped:false });
  assert.deepEqual(stackView(STACK_CAP * 100), { chips:STACK_CAP, shown:STACK_CAP, capped:false });
  assert.deepEqual(stackView(1500), { chips:15, shown:STACK_CAP, capped:true });
  assert.deepEqual(stackView(900, 6), { chips:9, shown:6, capped:true });
  /* the drawing grows with the stack and never with anything else */
  assert.ok(stackGeometry(40, 5).height > stackGeometry(40, 2).height);
  assert.equal(stackGeometry(40, 5).width, stackGeometry(40, 1).width);
});

test("stacks merge per bettor and stand biggest first, ties in name order", () => {
  const stacks = orderStacks([
    { player:"Khoa", stake:200 }, { player:"Adi", stake:300 }, { player:"Khoa", stake:100 },
    { player:"Ben", stake:300 }, { player:"Evan", stake:0 },
  ]);
  assert.deepEqual(stacks.map(item => [item.player, item.stake]), [["Adi", 300], ["Ben", 300], ["Khoa", 300]]);
  assert.equal(stacksTotal(stacks), 900);
  assert.deepEqual(stacks.map(item => item.chips), [3, 3, 3]);
});

test("the open book groups tickets by what they back, one stack per bettor", () => {
  const labelOf = wager => ({ pick:wager.pick, ctx:"to win Long Putt" });
  const picks = pickStacks([
    { eventId:"putt", player:"Adi", pick:"Khoa", stake:200 },
    { eventId:"putt", player:"Ben", pick:"Khoa", stake:300 },
    { eventId:"putt", player:"Adi", pick:"Khoa", stake:100 },
    { eventId:"putt", player:"Evan", pick:"Evan", stake:100 },
  ], labelOf);
  assert.deepEqual(picks.map(pick => [pick.name, pick.total]), [["Khoa", 600], ["Evan", 100]]);
  assert.deepEqual(picks[0].stacks.map(item => [item.player, item.stake]), [["Adi", 300], ["Ben", 300]]);
});

test("each side of the current contest carries its own stacks and total", () => {
  const { state, contest, bystanders } = bracketWithBets();
  const sides = contestStacks(state, allEventsOf(state), contest);
  const left = sides.get(contest.sides[0].key), right = sides.get(contest.sides[1].key);
  assert.deepEqual(left.stacks.map(item => item.stake), [1000, 500, 300, 200]);
  assert.deepEqual(right.stacks.map(item => item.stake), [800, 400, 200, 100]);
  assert.equal(left.total, 2000);
  assert.equal(right.total, 1500);
  assert.equal(left.stacks[0].player, bystanders[0]);
  /* the TV's rider list is the same model */
  assert.deepEqual(contestRiders(state, allEventsOf(state), contest).get(contest.sides[0].key).total, 2000);
  /* a second chip from the same bettor grows their stack, it does not add one */
  bet(state, "8ball", bystanders[1], 1, 300);
  const grown = contestStacks(state, allEventsOf(state), resolveCurrentContest(state, evOf(state, "8ball")))
    .get(contest.sides[1].key);
  assert.equal(grown.stacks.length, 4);
  assert.equal(grown.stacks.find(item => item.player === bystanders[1]).stake, 500);
});

test("settling grows a winner by its payout and sends a loser back to the bank", () => {
  assert.deepEqual(settleStack(300, "won", 1), { status:"won", before:300, paid:300, after:600 });
  assert.deepEqual(settleStack(300, "won", 2), { status:"won", before:300, paid:600, after:900 });
  assert.deepEqual(settleStack(300, "lost", 1), { status:"lost", before:300, paid:0, after:0 });

  const { state, contest } = bracketWithBets();
  act(state, "lockAndStart", { evId:"8ball", ...ref(state, "8ball") });
  act(state, "recordContestWinner", { evId:"8ball", winner:contest.sides[0].key, ...ref(state, "8ball") });
  const view = settledStacks(state, allEventsOf(state), contest);
  assert.deepEqual(view.winners.map(item => [item.stake, item.paid, item.after]),
    [[1000, 700, 1700], [500, 400, 900], [300, 200, 500], [200, 100, 300]],
    "the pool: 100 + 100 seed and 3,500 staked is 3,700 over the winners' 2,100, 1.7x, each net to the nearest 100");
  assert.deepEqual(view.losers.map(item => item.stake), [800, 400, 200, 100]);
  assert.equal(view.paid, 1400);
  assert.equal(view.lost, 1500);
  /* the TV's advance moment carries the same derived settlement */
  const moment = advanceMoment(state, evOf(state, "8ball"), state.eventOps["8ball"].lastContest.decidedAt + 500);
  assert.equal(moment.settle.paid, 1400);
  assert.equal(moment.settle.losers.length, 4);

  /* a free-for-all's pool: 13 seeds of 100 and 500 staked is 1,800; Evan's
     side holds 300 of it, 6.0x, so Adi's 200 nets 1,000 */
  const ffa = structuredClone(EMPTY_STATE);
  act(ffa, "announceEvent", { evId:"putt" });
  bet(ffa, "putt", "Adi", ROSTER.indexOf("Evan"), 200);
  bet(ffa, "putt", "Ben", ROSTER.indexOf("Khoa"), 300);
  act(ffa, "lockAndStart", { evId:"putt", ...ref(ffa, "putt") });
  act(ffa, "beginResultEntry", { evId:"putt" });
  act(ffa, "saveResult", { evId:"putt", slots:[["Evan"], ["Khoa"], ["Adi"]] });
  const won = eventWinnerStacks(ffa, allEventsOf(ffa), "putt");
  assert.deepEqual(won.winners.map(item => [item.player, item.stake, item.after]), [["Adi", 200, 1200]]);
  assert.deepEqual(won.losers.map(item => item.player), ["Ben"]);
});

test("a seat's starting chips are one short stack per denomination; the tray is rows of twenty", () => {
  const seat = seatStacks(600);
  assert.deepEqual(seat.stacks, [{ v:25, n:8 }, { v:100, n:4 }], "small chips first, counts from pokerDenoms");
  assert.equal(seat.total, 600);
  for (const stack of [600, 1000, 1700, 2900, 6400]) {
    const view = seatStacks(stack);
    assert.equal(view.total, stack, `${stack} deals exactly`);
    assert.equal(view.stacks.length, pokerDenoms(stack).length);
  }
  const tray = trayStacks(pokerInventory([600, 1000, 2900, 3600]));
  const quarters = tray.find(item => item.v === 25);
  assert.equal(quarters.n, 32);
  assert.deepEqual(quarters.tubes, [TRAY_TUBE, 12]);
  assert.ok(tray.every(item => item.tubes.reduce((sum, n) => sum + n, 0) === item.n));
  /* each denomination has its own flat token color; only gold carries dark ink */
  assert.deepEqual(Object.keys(POKER_CHIPS).map(Number).sort((a, b) => a - b), [25, 100, 500, 1000]);
  assert.ok(Object.values(POKER_CHIPS).every(chip => /^var\(--poker-\d+\)$/.test(chip.color)));
  assert.equal(pokerChip(1000).isLight, true);
  assert.equal(pokerChip(100).stamp, 100);
});

/* capture native buttons during a real render, then drive them by name */
function renderWithButtons(element) {
  const buttons = [];
  const createElement = React.createElement;
  const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
    : React.isValidElement(value) ? textOf([value.props.children])
      : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");
  React.createElement = (type, props, ...children) => {
    if (type === "button" && props?.onClick) buttons.push({ name:(props["aria-label"] || textOf(children)).trim(),
      disabled:!!props.disabled, click:props.onClick, html:null });
    return createElement(type, props, ...children);
  };
  let html;
  try { html = renderToStaticMarkup(element(createElement)); } finally { React.createElement = createElement; }
  const named = name => {
    const button = buttons.find(item => item.name === name);
    assert.ok(button, `Missing control: ${name}`);
    return button;
  };
  return { html, buttons, named };
}

test("phone: every backer's chips stand on the felt; your stack retracts, anyone else's opens their card", () => {
  const { state, contest, bystanders } = bracketWithBets();
  const me = bystanders[1];
  bet(state, "8ball", me, 1, 100);
  const side = contest.sides[1];
  const name = side.players.map(p => p).join(" & ");
  const viewed = [], retracted = [], picks = [];
  const view = renderWithButtons(h => h(PlayerIdentityProvider, { profiles:state.profiles },
    h(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
      wagerEv:evOf(state, "8ball"), onEvents:() => {}, onEvent:() => {}, onPick:pick => picks.push(pick),
      onRetract:id => retracted.push(id), onPlayer:p => viewed.push(p), onVoid:() => {} })));
  const retract = view.named(`Retract your last chip on ${name}`);
  retract.click();
  assert.equal(retracted.length, 1, "your stack takes your last chip back");
  assert.deepEqual(viewed, [], "and opens no card");
  const others = [[bystanders[3], 100], [bystanders[5], 800], [bystanders[7], 400]];
  for (const [player, stake] of others) {
    view.named(`View ${player}'s player card (${stake} chips)`).click();
    assert.equal(viewed.at(-1), player);
  }
  assert.equal(retracted.length, 1, "another bettor's stack never retracts");
  assert.deepEqual(picks, [], "and never places a chip");
  /* the felt (Oct 4): a stack per backer, built of that backer's own chip */
  assert.equal(view.html.split('class="fd-wagers-felt"').length - 1, 2, "one felt a side");
  for (const [player] of others) assert.match(view.html, new RegExp(`data-stack-player="${player}"`), `${player} stands on the felt`);
  assert.match(view.html, new RegExp(`data-stack-player="${me}"`), "and so do you");
  const stackColors = html => new Map([...html.matchAll(/class="fd-stack[^"]*" style="--stack-color:([^;]+);[^"]*" data-stack-player="([^"]+)"/g)]
    .map(m => [m[2], m[1]]));
  assert.ok([...stackColors(view.html).values()].every(color => color !== "var(--sun)"), "no stack is the rack's amber house chip");
  const claimed = structuredClone(state);
  claimed.profiles[bystanders[5]] = { ...claimed.profiles[bystanders[5]], color:CHIP_COLORS[3].hex, skin:"flame" };
  claimed.profiles[me] = { ...claimed.profiles[me], color:CHIP_COLORS[9].hex, skin:"dots" };
  const colored = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:claimed.profiles },
    React.createElement(Wagers, { state:claimed, me, events:allEventsOf(claimed), standings:computeStandings(claimed), gm:false,
      wagerEv:evOf(claimed, "8ball"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {}, onVoid() {} })));
  assert.equal(stackColors(colored).get(bystanders[5]), CHIP_COLORS[3].hex, "a backer's stack wears their claimed color");
  assert.equal(stackColors(colored).get(me), CHIP_COLORS[9].hex, "and so does yours");
  assert.match(view.html, /class="fd-wagers-pot-total"><span class="fd-reel[^"]*" role="img" aria-label="1,600"/, "the side's total heads its felt");
  /* yours wears the filament ring; biggest first, each with its amount */
  assert.match(view.html, /class="fd-wagers-stack is-you"[^>]*>.*?class="fd-stack-ring"/);
  const order = view.buttons.map(b => /^View (.+)'s player card \(/.exec(b.name)?.[1]).filter(Boolean);
  assert.deepEqual(order.slice(-3), [bystanders[5], bystanders[7], bystanders[3]]);
  const values = [...view.html.matchAll(/class="fd-stacks-value">([^<]+)</g)].map(m => m[1]);
  assert.ok(values.includes("800") && values.includes("400"), `value lines: ${values}`);
});

test("a felt holds the well and five stacks; past that the smallest fold into +N, never yours", () => {
  assert.equal(FELT_CELLS, 6);
  assert.equal(ROW_STACKS, 2);
});

const renderTv = (state, now = Date.now()) => {
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const onDeckEv = state.onDeck ? events.find(e => e.id === state.onDeck && !state.results[e.id]) : null;
  return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { state, events, standings, allTied:false, onDeckEv, champion:null, coChamps:[],
      showControlEnabled:false, connection:{ ready:true, connected:true, version:3 }, now, onExit:() => {} })));
};
/* no single line of TV text pairs a name with a number */
const textNodes = html => [...html.matchAll(/>([^<>]+)</g)].map(match => match[1].trim()).filter(Boolean);

/* the TV's table (TVTable.jsx): one felt, the contest printed in a corner
   and the pool in the other, a spot per side */
const feltOf = html => html.slice(html.indexOf('<section class="tvt '), html.indexOf("</section>", html.indexOf('<section class="tvt ')));
const spotsOf = felt => felt.split('class="tvt-spot ').slice(1);

test("TV: the table's spots carry the room's %, a fill to their share and the bettors as named stacks", () => {
  const { state, contest, bystanders } = bracketWithBets();
  const html = renderTv(state);
  const felt = feltOf(html);
  assert.ok(felt.length > 0, "the live contest is the table");
  assert.match(felt, /<section class="tvt tv-glass is-match is-open/);
  const table = tableView(state, allEventsOf(state), contest);
  /* the corners: the match by its name, the pool on its reel (the bank's seeds and every chip) */
  assert.match(felt, /class="tvt-label-text">/);
  assert.match(felt, new RegExp(`class="tvt-pool"><small>Pool</small><span class="fd-reel[^"]*" role="img" aria-label="${table.total.toLocaleString("en-US")}"`));
  const spots = spotsOf(felt);
  assert.equal(spots.length, 2, "a matchup is two spots");
  table.spots.forEach((spot, i) => {
    /* the room's % on its reel, the fill risen to the side's share */
    assert.match(spots[i], new RegExp(`aria-label="${spot.pct}%"`));
    assert.match(spots[i], new RegExp(`--fill:${fillLevel(spot.share)}`));
  });
  assert.equal(table.spots[0].pct + table.spots[1].pct, 100);
  for (const player of bystanders.slice(0, 8)) {
    assert.match(felt, new RegExp(`data-stack-player="${player}"`));
    assert.match(felt, new RegExp(`class="fd-stacks-name">${player}<`));
  }
  /* no line of the felt pairs a name with a number, and no × price is shown */
  assert.ok(textNodes(felt).every(text => !/[A-Za-z] \d/.test(text)), textNodes(felt).join(" | "));
  assert.doesNotMatch(felt.replace(/<[^>]*>/g, " "), /×/);
  /* a 1,000 stake caps at ten chips and stamps its value */
  assert.match(felt, new RegExp(`data-stack-player="${bystanders[0]}" data-stack-chips="${STACK_CAP}"`));
});

test("TV free-for-all: a 7-wide grid of spots, each its face, name, % and its backers' pile", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  bet(state, "putt", "Adi", ROSTER.indexOf("Khoa"), 200);
  bet(state, "putt", "Ben", ROSTER.indexOf("Khoa"), 300);
  bet(state, "putt", "Evan", ROSTER.indexOf("Evan"), 100);
  const html = renderTv(state);
  const felt = feltOf(html);
  assert.match(felt, /class="tvt-body is-grid"/);
  const spots = spotsOf(felt);
  assert.equal(spots.length, 13, "a spot for every side, none hidden in a strip");
  const contest = resolveCurrentContest(state, evOf(state, "putt"));
  const table = tableView(state, allEventsOf(state), contest);
  assert.equal(table.shape, "grid");
  /* spots never move: they stand in the contest's own order */
  assert.deepEqual(spots.map(spot => /data-spot="([^"]+)"/.exec(spot)[1]), contest.sides.map(side => String(side.key)));
  const khoa = spots[ROSTER.indexOf("Khoa")];
  assert.match(khoa, /class="tvt-name is-cell"[^>]*><span[^>]*>Khoa</);
  /* its backers, most money first, as a pile of their faces */
  assert.deepEqual([...khoa.matchAll(/data-backer="([^"]+)"/g)].map(m => m[1]), ["Ben", "Adi"]);
  assert.match(khoa, new RegExp(`aria-label="${table.spots[ROSTER.indexOf("Khoa")].pct}%"`));
  /* the % adds to 100 across the felt; a grid lights no long shot (every quiet spot sits long) */
  assert.equal(table.spots.reduce((sum, spot) => sum + spot.pct, 0), 100);
  assert.doesNotMatch(felt, /tvt-pct is-long/);
  assert.ok(textNodes(felt).every(text => !/[A-Za-z] \d/.test(text)), textNodes(felt).join(" | "));
});

test("poker starting stacks are drawn chips on the setup sheet and the TV, never multiplication", () => {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  act(state, "adjust", { player:"Evan", delta:1900, reason:"Test" });
  act(state, "adjust", { player:"Adi", delta:-600, reason:"Test" });
  const sheet = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(PokerSetupSheet, { state, onClose:() => {}, onDeal:() => ({ ok:true }) })));
  assert.doesNotMatch(sheet, /×| x \d|\d x /);
  assert.match(sheet, /data-denom="25" data-count="8"/);
  assert.match(sheet, /class="fd-poker-tray"/);
  assert.match(sheet, /aria-label="Minimum stack, 200 added"/);
  act(state, "pokerSetup", {});
  const tv = renderTv(state);
  assert.match(tv, /class="tv-pane tv-table"/);
  assert.doesNotMatch(tv.replace(/<[^>]*>/g, " "), /×| x \d/);
  assert.match(tv, /data-denom="100"/);
  /* the guest card and the All stacks sheet draw the same stacks */
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const between = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
  for (const body of [between("function PokerBuyinSheet", "function PokerResultSheet"),
    between("function PokerCard", "function ChipCounter")]) {
    assert.doesNotMatch(body, /\} x \$\{|× /);
    assert.match(body, /<DenomStacks /);
  }
});

test("the TV table's geometry: every shape fits its felt at the TV's floor, and its moments keep the server's time", () => {
  /* a matchup, a row of 3 to 6, a grid of 7+, full width and beside a bracket */
  for (const width of [1792, 1004]) {
    for (const [shape, count] of [["match", 2], ["row", 3], ["row", 4], ["row", 6], ["grid", 13], ["grid", 9]]) {
      const layout = tableLayout({ shape, count, width });
      const cols = shape === "grid" ? 7 : count;
      assert.ok(cols * layout.spotW + (cols - 1) * 12 <= width - 48, `${shape} ${count} at ${width}: ${layout.spotW}px spots fit`);
      assert.ok(layout.rows * layout.spotH <= TABLE_H, `${shape} ${count}: the rows stand in the live row`);
      assert.ok(layout.pct >= 48, `${shape} ${count}: the % reads from the couch`);
      if (layout.name) assert.ok(layout.name >= 24);
      if (layout.nameMin) assert.ok(layout.nameMin >= 24);
    }
  }
  assert.equal(tableLayout({ shape:"grid", count:13, width:1792 }).rows, 2, "13 is 7 + 6");
  assert.ok(tableLayout({ shape:"match", count:2, width:1792 }).wide, "a full-width matchup puts its stacks beside the %");
  const band = tableLayout({ shape:"match", count:2, width:1792, height:BAND_TABLE_H, band:true });
  assert.ok(band.band && band.spotH <= BAND_TABLE_H && band.spotW * 2 + band.center + band.gap * 2 <= 1792 - 40);
  /* a grid cell's pile: three faces at most, the rest +N */
  const stacks = n => Array.from({ length:n }, (_, i) => ({ player:ROSTER[i], stake:100 }));
  assert.deepEqual(backerPile(stacks(2), 3), { shown:[ROSTER[0], ROSTER[1]], more:0 });
  assert.deepEqual(backerPile(stacks(6), 3), { shown:[ROSTER[0], ROSTER[1]], more:4 });
  /* the sweep plays from the lock's server time: a late TV joins mid-sweep, a later one sees the table */
  assert.deepEqual(sweepWindow(10_000, 10_900), { at:10_000, elapsed:900 });
  assert.equal(sweepWindow(10_000, 10_000 + SWEEP_MS), null);
  assert.equal(sweepWindow(0, 5), null);
  /* rendered: no bets is still the table, the bank's 13 seeds in its pool */
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const empty = feltOf(renderTv(state));
  assert.match(empty, /class="tvt-pool"><small>Pool<\/small><span class="fd-reel[^"]*" role="img" aria-label="1,300"/,
    "the pool is the bank's 13 seeds before a chip is down");
  assert.equal(spotsOf(empty).length, 13);
  assert.doesNotMatch(empty, /Winner pays|data-stack-player|data-backer/);
});

test("a decided contest's table reads its sides back from the record, and settles on the TV", () => {
  const { state, contest } = bracketWithBets();
  act(state, "lockAndStart", { evId:"8ball", ...ref(state, "8ball") });
  act(state, "recordContestWinner", { evId:"8ball", winner:contest.sides[0].key, ...ref(state, "8ball") });
  const ev = evOf(state, "8ball");
  const entry = state.eventOps["8ball"].lastContest;
  const back = entryContest(state, ev, entry);
  assert.equal(back.id, contest.id);
  assert.equal(back.pool, true);
  assert.deepEqual(back.sides, contest.sides, "the bracket's match gives its sides back");
  const decidedAt = entry.decidedAt;
  const felt = feltOf(renderTv(state, decidedAt + 2600));
  assert.match(felt, /<section class="tvt tv-glass is-settled is-match/);
  const spots = spotsOf(felt);
  assert.match(spots[0], /^[^"]*is-settled is-won/);
  assert.match(spots[1], /^[^"]*is-settled is-lost/);
  assert.match(spots[0], />Won</);
  /* the winners' stacks grow by their payout; the losers' leave for the bank */
  assert.match(spots[0], /class="tvt-felt-stacks is-settle"/);
  assert.match(spots[1], /class="tvt-felt-stacks is-settle is-raked"/);
  assert.match(felt, /class="tvt-rake"/, "the glove rakes the losing spot");
  /* five seconds on, the next match is the table again */
  assert.doesNotMatch(feltOf(renderTv(state, decidedAt + 5200)), /is-settled/);
});

test("a wide board is one row a side: mini stacks with their total (yours ringed), then a quiet well", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const khoa = ROSTER.indexOf("Khoa");
  [["Adi", 400], ["Ben", 300], ["Evan", 200], ["Chinh", 100]].forEach(([player, stake]) => bet(state, "putt", player, khoa, stake));
  const phone = me => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
      wagerEv:evOf(state, "putt"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {} })));
  const onKhoa = html => { const at = html.indexOf('aria-label="Bets on Khoa"'); return html.slice(at, html.indexOf('aria-label="Bets on ', at + 1)); };
  const spectator = onKhoa(phone("Henry"));
  assert.match(phone("Henry"), /fd-wagers-pick has-price is-one-line/, "every card on a wide board is one line, its price in it");
  /* each row's price before its well: 13 seeds of 100 and 1,000 on Khoa is
     2,300; Khoa's side 1,100 is 2.0x, every empty side at the 10x cap, dimmed */
  const prices = [...phone("Henry").matchAll(/class="fd-side-terms fd-wagers-row-price"><button type="button" class="fd-side-pays-tap is-pool"[^>]*><span class="fd-price is-sm ([^"]*)" role="img" aria-label="Pays ([\d.]+)×"/g)]
    .map(m => [m[1].trim(), m[2]]);
  assert.equal(prices.length, ROSTER.length, "a price on every row");
  assert.deepEqual(prices.filter(([, price]) => price !== "10.0"), [["", "2.0"]]);
  assert.ok(prices.filter(([, price]) => price === "10.0").every(([cls]) => cls === "is-cap"), "the cap reads dim");
  assert.doesNotMatch(phone("Henry"), /is-long/, "a wide field names no long shot");
  /* the two biggest stand as mini stacks, the rest one silver pile; no people glyph */
  assert.equal((spectator.match(/data-stack-player=/g) || []).length, 1, "one backer's stack, then the +N pile");
  assert.match(spectator, /data-stack-player="Adi"/);
  assert.doesNotMatch(spectator, /fd-icon[^>]*>[^<]*<circle cx="9" cy="8.6"/, "no people glyph");
  assert.match(spectator, /fd-wagers-pot-total">1,000</);
  assert.match(spectator, /aria-label="4 backing Khoa"/, "the stacks are one tap from the list");
  /* a row with chips lights its well; a row without stays a quiet slot */
  assert.match(spectator, /class="fd-wagers-well is-lit"/);
  const quiet = phone("Henry"), at = quiet.indexOf('aria-label="Bets on Evan"');
  assert.match(quiet.slice(at, quiet.indexOf('aria-label="Bets on ', at + 1)), /class="fd-wagers-well"/);
  /* yours, lit: a tap takes your last chip back */
  const mine = onKhoa(phone("Chinh"));
  assert.match(mine, /class="fd-wagers-pot-you"[^>]*aria-label="Retract your last chip on Khoa"/);
  assert.match(mine, /class="fd-wagers-pot-you"[^>]*>.*?class="fd-stack-ring"/, "your mini stack wears your ring");
  /* a matchup keeps two lines */
  const { state:match, bystanders } = bracketWithBets();
  const two = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:match.profiles },
    React.createElement(Wagers, { state:match, me:bystanders[8], events:allEventsOf(match), standings:computeStandings(match),
      gm:false, wagerEv:evOf(match, "8ball"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {} })));
  assert.match(two, /class="fd-wagers-felt-stacks"/, "a matchup's sides stand their backers on a felt");
  assert.doesNotMatch(two, /is-one-line/);
});

/* ── the Bets board, Oct 3 (critique: first viewport, empty side, names) ── */
const phoneBoard = (state, me, evId, extra = {}) => renderWithButtons(h => h(PlayerIdentityProvider, { profiles:state.profiles },
  h(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
    wagerEv:evOf(state, evId), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {}, onVoid() {}, ...extra })));

test("the rack is the board's head pane's lower glass: above the board, amber house chips", () => {
  const { state, bystanders } = bracketWithBets();
  const view = phoneBoard(state, bystanders[8], "8ball");
  const head = view.html.indexOf('class="fd-wagers-event-heading');
  const rack = view.html.indexOf('class="fd-wagers-rack');
  const board = view.html.indexOf('class="fd-wagers-picks');
  assert.ok(head >= 0 && head < rack && rack < board, "painting, then the rack, then the board");
  assert.ok(rack < view.html.indexOf("</header>"), "the rack sits inside the head pane");
  /* every denomination is the chip lamp's amber, never the viewer's identity color */
  const coins = [...view.html.matchAll(/class="fd-coin3d[^"]*"[^>]*style="--coin-color:([^"]+)"/g)].map(m => m[1]);
  assert.ok(coins.length >= 1 && coins.every(color => color === "var(--sun)"), `rack coins are amber: ${coins}`);
  assert.match(view.html, /<circle cx="16" cy="16" r="14.7" fill="var\(--sun\)"/, "the coin's face is the pot's own chip");
  /* the open market's state is read aloud; the painting is the way into the event */
  assert.match(view.html, /<span class="fd-sr" role="status">Betting open<\/span>/);
  assert.ok(view.named(`${evOf(state, "8ball").name}: Full bracket`), "the painting opens the bracket");
});

test("a side nobody backs is one lit seat: the only place target, no hollow pot or 0", () => {
  const state = structuredClone(EMPTY_STATE);
  ROSTER.forEach(player => act(state, "adjust", { player, delta:1500, reason:"Test" }));
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const contest = resolveCurrentContest(state, evOf(state, "8ball"));
  const bystanders = ROSTER.filter(p => !contest.players.includes(p));
  bet(state, "8ball", bystanders[0], 1, 300);
  const view = phoneBoard(state, bystanders[1], "8ball");
  const empty = contest.sides[0].players.join(" & "), backed = contest.sides[1].players.join(" & ");
  assert.equal(view.html.split('class="fd-wagers-open"').length - 1, 1, "the empty side is one seat");
  assert.equal(view.buttons.filter(b => b.name === `Place a chip on ${empty}`).length, 1, "one place target on it");
  assert.equal(view.buttons.filter(b => b.name === `Place a chip on ${backed}`).length, 1, "the backed side keeps its +");
  assert.doesNotMatch(view.html, /fd-wagers-seat|fd-wagers-pot-total[^"]*">0</, "no void felt, no hollow 0");
  /* every card keeps one shape: the seat spans the pot's rows */
  assert.match(view.html, /<div class="fd-wagers-felt is-open"[^>]*><button[^>]*class="fd-wagers-open"/);
  /* the backed side's well is a lit slot, never a solid amber button */
  assert.match(view.html, /<button[^>]*class="fd-wagers-well is-lit"/);
  assert.doesNotMatch(view.html, /fd-wagers-place/);
});

test("the competitor out-letters its backers, the payout is a lit lamp, a self-bet takes the filament", () => {
  const { state, contest, bystanders } = bracketWithBets();
  const spectator = phoneBoard(state, bystanders[8], "8ball").html;
  /* a pair's two competitors are lettered in the show face over their faces */
  for (const player of contest.sides[0].players)
    assert.match(spectator, new RegExp(`class="fd-wagers-pair-name"[^>]*>${player}<`));
  assert.match(spectator, /class="fd-wagers-picks is-id-pair"/, "the board sizes its identity row for pairs");
  /* the board's head: the pool, seed included (200 + 3,500 staked) */
  assert.match(spectator, /<span class="fd-wagers-pays is-pool"><i class="fd-insert" aria-hidden="true"><\/i>Pool<span class="fd-reel is-chip is-slim" role="img" aria-label="3,700">/);
  assert.doesNotMatch(spectator, /Winner pays/, "a pool says no fixed payout");
  assert.doesNotMatch(spectator, /fd-wagers-payout/, "said once, on the board, not muted in the painting");
  /* each side's price, a tap that teaches the pool: 3,700 over 2,100 is 1.7x, over 1,600 2.3x */
  for (const price of ["1.7", "2.3"])
    assert.match(spectator, new RegExp(`<button type="button" class="fd-side-pays-tap is-pool" aria-expanded="false" aria-label="Pays ${price.replace(".", "\\.")}×\\. How the pool pays"><span class="fd-price is-md " role="img" aria-label="Pays ${price.replace(".", "\\.")}×">`));
  assert.match(spectator, /<svg class="fd-info-lamp"/, "the cyan info lamp says it opens something");
  assert.doesNotMatch(spectator, /fd-price[^"]*is-long/, "2.3x is no long shot");
  /* a competitor backing their own side */
  const me = contest.sides[0].players[0];
  bet(state, "8ball", me, 0, 200);
  const mine = phoneBoard(state, me, "8ball").html;
  assert.match(mine, /fd-wagers-pick has-price is-mine has-chips is-your-side is-self-bet/);
  assert.match(mine, /class="fd-wagers-pick-role is-backed"><i class="fd-insert" aria-hidden="true"><\/i>Your team</);
  assert.match(mine, /class="fd-wagers-stack is-you"/);
  assert.match(mine, /class="fd-stack-ring"/, "your chips' ring under your stack");
  /* the other team: no well, an unlit slot with a lock that says why, and
     under it, in your filament, "Yours" pointing at your own side */
  assert.match(mine, /class="fd-wagers-well is-locked is-point-back" role="img" aria-label="Opponent: You can only bet on your team in this match\."/);
  assert.match(mine, /class="fd-wagers-well-pointer" aria-hidden="true"><svg[^>]*>.*?<\/svg>Yours<\/span>/);
  /* your stack's name line is what it wins now: 3,900 over 2,300 is 1.6x, 200 nets 120 (100) */
  assert.match(mine, /class="fd-wagers-stack-name is-win" aria-label="Wins 100 at 1\.6×">\+100</);
  assert.equal((mine.match(/fd-wagers-stack-name is-win/g) || []).length, 1, "only your own stack");
  assert.match(mine, /To win at 1\.6×/, "the ledger's pending line reads the price");

  /* a contest opened before pools keeps the lit fixed payout */
  const legacy = structuredClone(EMPTY_STATE);
  act(legacy, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  delete legacy.eventOps["8ball"].pools;
  const old = phoneBoard(legacy, ROSTER[12], "8ball").html;
  assert.match(old, /<span class="fd-wagers-pays"><i class="fd-insert" aria-hidden="true"><\/i>Winner pays 1:1<\/span>/);
  assert.doesNotMatch(old, /fd-wagers-pays is-pool|fd-price/);
});

/* X8 on a bet card is drawn to fit its row by construction (the fit
   audit's "Win: Squilliam and Adi to 4th" cut): "Win", the climbers' faces
   only when they are not the whole side, two at most and a count, then the
   arrow and the place. The sentence stays as the accessible name. */
test("a bet card's win line is drawn: faces for a part of the side, the place, never a cut sentence", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"bball5" });
  const contest = resolveCurrentContest(state, evOf(state, "bball5"));
  const [a, b] = contest.sides;
  /* one of side A already leads by far and side B sits ahead of the rest of
     A: A's win lifts the rest of A past B, never its leader */
  act(state, "adjust", { player:a.players[0], delta:4000, reason:"Test" });
  b.players.forEach(player => act(state, "adjust", { player, delta:500, reason:"Test" }));
  const viewer = ROSTER.find(p => !contest.players.includes(p)) || b.players[0];
  const html = phoneBoard(state, viewer, "bball5").html;
  assert.doesNotMatch(html, /fd-win-line/, "no lettered sentence that could be cut");
  const lines = [...html.matchAll(/<span class="fd-wagers-win is-(rank|chips)" role="img" aria-label="(Win: [^"]+)">(.*?)<\/b><\/span>/g)];
  assert.equal(lines.length, 2, "one drawn line per side");
  const partOfA = lines.find(line => line[3].includes("fd-wagers-win-faces"));
  assert.ok(partOfA, "the side whose leader does not move shows who does, as faces");
  assert.ok((partOfA[3].match(/class="fd-avatar"/g) || []).length <= 2, "two faces at most");
  assert.match(partOfA[3], /class="fd-wagers-win-more">\+\d+</, "and a count for the rest");
  const wholeB = lines.find(line => !line[3].includes("fd-wagers-win-faces"));
  assert.ok(wholeB, "a side that climbs whole names nobody (its card already does)");
  assert.match(partOfA[3], /class="fd-wagers-win-rank"><svg[^>]*>.*?<\/svg>(Tie )?\d+(st|nd|rd|th)$/, "an arrow and the place");
});
