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

/* Everyone's bets as stacks of their own identity chip. The model is pure;
   the render checks run the real components, as the other UI suites do. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { TVMode, fieldLayout } from "./src/features/tv/TVMode.jsx";
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
const { TVMode, fieldLayout, Wagers, FELT_CELLS, ROW_STACKS, PokerSetupSheet, PlayerIdentityProvider } = bundle.exports;

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
  assert.match(board, /tv-side-total"><span class="fd-reel[^"]*" role="img" aria-label="2,000"/);
  assert.match(board, /tv-side-total"><span class="fd-reel[^"]*" role="img" aria-label="1,500"/);
  /* a 1,000 stake caps at ten chips and stamps its value */
  assert.match(board, new RegExp(`data-stack-player="${bystanders[0]}" data-stack-chips="${STACK_CAP}"`));
  assert.ok(contest);
});

test("TV free-for-all: a player's spot on the felt holds the stacks backing them, an empty spot stays quiet", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  bet(state, "putt", "Adi", ROSTER.indexOf("Khoa"), 200);
  bet(state, "putt", "Ben", ROSTER.indexOf("Khoa"), 300);
  bet(state, "putt", "Evan", ROSTER.indexOf("Evan"), 100);
  const html = renderTv(state);
  const card = player => {
    const cards = html.split('class="tv-side is-spot').slice(1);
    return cards.find(chunk => new RegExp(`tv-spot-name"[^>]*>${player}<`).test(chunk)) || "";
  };
  assert.match(card("Khoa"), /data-stack-player="Adi"/);
  assert.match(card("Khoa"), /data-stack-player="Ben"/);
  assert.match(card("Khoa"), /tv-side-total"><span class="fd-reel[^"]*" role="img" aria-label="500"/);
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

test("TV wide field: one felt, every spot sized before any chip lands; an empty board is one line", () => {
  const layout = fieldLayout(13, 1784);
  assert.equal(layout.rows, 2, "thirteen sides stand in two rows of one felt");
  assert.equal(layout.perRow, 7);
  assert.equal(fieldLayout(6, 1784).rows, 1);
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const empty = renderTv(state);
  assert.doesNotMatch(empty, /No bets/, "an empty board needs no words: its felt is simply not there");
  assert.match(empty, /class="tv-contest-foot"><span class="tv-pay-lamp is-lit"><i class="fd-insert" aria-hidden="true"><\/i>Winner pays 2:1</,
    "the payout stays, the board's lit payout lamp");
  assert.doesNotMatch(empty, /tv-spot-felt/, "and its felt collapses");
  bet(state, "putt", "Adi", ROSTER.indexOf("Khoa"), 500);
  const riding = renderTv(state);
  bet(state, "putt", "Ben", ROSTER.indexOf("Evan"), 300);
  const second = renderTv(state);
  /* the rows share the board's height, so every spot is one size whatever rides it */
  const rows = html => html.match(/grid-template-rows:repeat\((\d+), minmax\(0, 1fr\)\)/)?.[1];
  assert.equal(rows(riding), String(layout.rows));
  assert.equal(rows(second), rows(riding), "a second side's first chip moves no spot");
  assert.equal(riding.split('class="tv-spot-felt"').length - 1, 13, "every spot keeps its felt once chips ride");
  /* the total stands on a line of its own, never over the stacks */
  assert.equal(second.split('class="tv-spot-total"').length - 1, 13, "every spot reserves its total's line");
  assert.doesNotMatch(second, /class="tv-spot-felt"><div class="tv-side-total"/, "no total inside the stacks' band");
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
  assert.match(phone("Henry"), /fd-wagers-pick is-one-line/, "every card on a wide board is one line");
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
  assert.match(spectator, /<span class="fd-wagers-pays"><i class="fd-insert" aria-hidden="true"><\/i>Winner pays 1:1<\/span>/);
  assert.doesNotMatch(spectator, /fd-wagers-payout/, "said once, on the board, not muted in the painting");
  /* a competitor backing their own side */
  const me = contest.sides[0].players[0];
  bet(state, "8ball", me, 0, 200);
  const mine = phoneBoard(state, me, "8ball").html;
  assert.match(mine, /fd-wagers-pick is-mine has-chips is-your-side is-self-bet/);
  assert.match(mine, /class="fd-wagers-pick-role is-backed"><i class="fd-insert" aria-hidden="true"><\/i>Your team</);
  assert.match(mine, /class="fd-wagers-stack is-you"/);
  assert.match(mine, /class="fd-stack-ring"/, "your chips' ring under your stack");
  /* the other team: no well, an unlit slot with a lock that says why, and
     under it, in your filament, "Yours" pointing at your own side */
  assert.match(mine, /class="fd-wagers-well is-locked is-point-back" role="img" aria-label="Opponent: You can only bet on your team in this match\."/);
  assert.match(mine, /class="fd-wagers-well-pointer" aria-hidden="true"><svg[^>]*>.*?<\/svg>Yours<\/span>/);
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
