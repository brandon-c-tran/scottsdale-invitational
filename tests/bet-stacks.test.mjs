import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest, pokerDenoms, pokerInventory } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import {
  STACK_CAP, stackChipCount, stackView, orderStacks, stacksTotal, contestStacks, settleStack, settledStacks,
  eventWinnerStacks, stackGeometry, pickStacks, stackMaxHeight,
} from "../src/features/wagers/betStacks.js";
import { seatStacks, trayStacks, pokerChip, POKER_CHIPS, TRAY_TUBE } from "../src/features/poker/pokerChips.js";
import { advanceMoment, contestRiders } from "../src/features/tv/tvModel.js";

/* Everyone's bets as stacks of their own identity chip. The model is pure;
   the render checks run the real components, as the other UI suites do. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { TVMode, compactStackSize } from "./src/features/tv/TVMode.jsx";
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
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
const { TVMode, compactStackSize, Wagers, PokerSetupSheet, PlayerIdentityProvider } = bundle.exports;

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
    [[1000, 1000, 2000], [500, 500, 1000], [300, 300, 600], [200, 200, 400]], "1:1 doubles");
  assert.deepEqual(view.losers.map(item => item.stake), [800, 400, 200, 100]);
  assert.equal(view.paid, 2000);
  assert.equal(view.lost, 1500);
  /* the TV's advance moment carries the same derived settlement */
  const moment = advanceMoment(state, evOf(state, "8ball"), state.eventOps["8ball"].lastContest.decidedAt + 500);
  assert.equal(moment.settle.paid, 2000);
  assert.equal(moment.settle.losers.length, 4);

  /* a free-for-all pays 2:1: the backers' stacks triple */
  const ffa = structuredClone(EMPTY_STATE);
  act(ffa, "announceEvent", { evId:"putt" });
  bet(ffa, "putt", "Adi", ROSTER.indexOf("Evan"), 200);
  bet(ffa, "putt", "Ben", ROSTER.indexOf("Khoa"), 300);
  act(ffa, "lockAndStart", { evId:"putt", ...ref(ffa, "putt") });
  act(ffa, "beginResultEntry", { evId:"putt" });
  act(ffa, "saveResult", { evId:"putt", slots:[["Evan"], ["Khoa"], ["Adi"]] });
  const won = eventWinnerStacks(ffa, allEventsOf(ffa), "putt");
  assert.deepEqual(won.winners.map(item => [item.player, item.stake, item.after]), [["Adi", 200, 600]]);
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

test("phone: your stack retracts, anyone else's stack opens their card, each its own target", () => {
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
  /* one sun ring, on your own stack; everyone else's chips are their own stacks */
  assert.equal(view.html.split("fd-stack-ring").length - 1, 1);
  for (const player of [...bystanders.slice(0, 8), me])
    assert.match(view.html, new RegExp(`data-stack-player="${player}"`));
  /* the side's total sits on its felt */
  assert.match(view.html, /class="fd-wagers-felt-total">1,600</);
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

test("TV: bettors ride as named stacks, never a Name 200 list", () => {
  const { state, contest, bystanders } = bracketWithBets();
  const html = renderTv(state);
  const board = html.slice(html.indexOf('class="tv-sides'), html.indexOf('class="tv-contest-foot"'));
  assert.ok(board.length > 0);
  for (const player of bystanders.slice(0, 8)) {
    assert.match(board, new RegExp(`data-stack-player="${player}"`));
    assert.match(board, new RegExp(`class="fd-stacks-name">${player}<`));
  }
  assert.ok(textNodes(board).every(text => !/[A-Za-z] \d/.test(text)), textNodes(board).join(" | "));
  assert.doesNotMatch(board, /tv-side-riders/);
  assert.match(board, /tv-side-total">2,000</);
  assert.match(board, /tv-side-total">1,500</);
  /* a 1,000 stake caps at ten chips and stamps its value */
  assert.match(board, new RegExp(`data-stack-player="${bystanders[0]}" data-stack-chips="${STACK_CAP}"`));
  assert.ok(contest);
});

test("TV free-for-all: a player's card holds the stacks backing them, an empty card stays quiet", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  bet(state, "putt", "Adi", ROSTER.indexOf("Khoa"), 200);
  bet(state, "putt", "Ben", ROSTER.indexOf("Khoa"), 300);
  bet(state, "putt", "Evan", ROSTER.indexOf("Evan"), 100);
  const html = renderTv(state);
  const card = player => {
    const cards = html.split('class="tv-side is-row').slice(1);
    return cards.find(chunk => chunk.includes(`class="tv-side-name">${player}<`)) || "";
  };
  assert.match(card("Khoa"), /data-stack-player="Adi"/);
  assert.match(card("Khoa"), /data-stack-player="Ben"/);
  assert.match(card("Khoa"), /tv-side-total">500</);
  assert.match(card("Evan"), /data-stack-player="Evan"/);
  assert.doesNotMatch(card("Chinh"), /data-stack-player|tv-side-total|No chips/);
  /* the card no longer repeats its own name with a number */
  const sides = html.slice(html.indexOf('class="tv-sides'), html.indexOf('class="tv-contest-foot"'));
  assert.ok(textNodes(sides).every(text => !/[A-Za-z] \d/.test(text)), textNodes(sides).join(" | "));
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
  assert.match(tv, /tv-buyin-grid/);
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

test("TV wide field: every row is one fixed height, sized before any chip lands", () => {
  const { chip, cap, rowH } = compactStackSize(5, 716);
  assert.equal(rowH, Math.floor((716 - 4 * 14) / 5));
  assert.equal(cap, STACK_CAP, "one cap everywhere");
  assert.ok(stackMaxHeight(chip) + 30 + 20 <= rowH, "the tallest stack and its name stand inside a row");
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const empty = renderTv(state);
  bet(state, "putt", "Adi", ROSTER.indexOf("Khoa"), 500);
  const riding = renderTv(state);
  const rows = html => html.match(/grid-auto-rows:(\d+)px/)?.[1];
  assert.equal(rows(empty), String(rowH));
  assert.equal(rows(riding), rows(empty), "a first chip moves no card");
});

test("a wide board's felt is one line: the well, two stacks, and the rest as one +N stack", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const khoa = ROSTER.indexOf("Khoa");
  [["Adi", 400], ["Ben", 300], ["Evan", 200], ["Chinh", 100]].forEach(([player, stake]) => bet(state, "putt", player, khoa, stake));
  const phone = me => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
      wagerEv:evOf(state, "putt"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {} })));
  const onKhoa = html => { const at = html.indexOf('aria-label="Bets on Khoa"'); return html.slice(at, html.indexOf('aria-label="Bets on ', at + 1)); };
  const order = html => [...html.matchAll(/data-stack-player="([^"]+)"/g)].map(match => match[1]);
  const spectator = onKhoa(phone("Henry"));
  assert.match(phone("Henry"), /fd-wagers-pick is-one-line/, "every card on a wide board is one line");
  assert.match(phone("Henry"), /--fd-felt-lines:1/);
  assert.deepEqual(order(spectator), ["Adi"]);
  assert.match(spectator, /aria-label="3 more: 600 chips"/);
  /* your own small stack takes a stack cell rather than folding */
  const mine = onKhoa(phone("Chinh"));
  assert.deepEqual(order(mine), ["Chinh"]);
  assert.match(mine, /Retract your last chip on Khoa/);
  assert.match(mine, /aria-label="3 more: 900 chips"/);
  /* a matchup keeps two lines */
  const { state:match, bystanders } = bracketWithBets();
  const two = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:match.profiles },
    React.createElement(Wagers, { state:match, me:bystanders[8], events:allEventsOf(match), standings:computeStandings(match),
      gm:false, wagerEv:evOf(match, "8ball"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {} })));
  assert.match(two, /--fd-felt-lines:2/);
  assert.doesNotMatch(two, /is-one-line/);
});
