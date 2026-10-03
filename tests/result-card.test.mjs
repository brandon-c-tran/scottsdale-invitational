import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, CHIP_COLORS, EMPTY_STATE, ROSTER, START, computeStandings } from "../shared/core.js";

/* X2 receipt, M19 own-chip shower, X5 last card and the M18 phone crown.
   Pure models tested directly; real components compiled once with React
   external. No transport, storage, or tournament. */
const root = fileURLToPath(new URL("../", import.meta.url));
const load = async (name, contents) => {
  const compiled = await build({
    stdin:{ contents, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"],
    loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL(name, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};
const ui = await load("result-card.cjs", `
  export * from "./src/features/results/resultMoment.js";
  export * from "./src/features/results/lastCard.js";
  export { crownOpening } from "./src/features/results/useCrownMoment.js";
  export { showerPieces, SHOWER_CHIPS, ChipShower } from "./src/features/results/ChipShower.jsx";
  export { ChipReceipt } from "./src/features/results/ChipReceipt.jsx";
  export { LastCardFace, LastCardLayer } from "./src/features/results/LastCard.jsx";
  export { cardFileName, shareCardImage, drawLastCard } from "./src/features/results/cardImage.js";
  export { GuestHome } from "./src/features/home/GuestHome.jsx";
  export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
`);

const events = BUILTIN_EVENTS;
const putt = events.find(event => event.id === "putt");
/* Rage Cage: the Saturday-night solo free-for-all; it pays 1st and 2nd the same (1,600, 1,600, 400) */
const cage = events.find(event => event.id === "ragecage");
const pairs = events.find(event => event.id === "8ball");
const poker = events.find(event => event.id === "poker");
const [me, khoa, sahil, adi] = ROSTER;
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true,
  profiles:Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
    color:CHIP_COLORS[index % CHIP_COLORS.length].hex }])) });
const FRESH = { fresh:true, live:true, correction:false };
const CATCH_UP = { fresh:false, live:false, correction:false, reason:"first" };
const snap = state => ui.chipSnapshot(state, me, events, computeStandings(state));
const moment = (before, after, frame = FRESH, extra = {}) =>
  ui.resultMoment({ prev:snap(before), next:snap(after), prevState:before, state:after, events, frame, now:7, ...extra });

test("a fresh result makes one receipt: your place, each bet settling, the total and the rank", () => {
  const before = fresh();
  before.wagers = [
    { id:"w-khoa", player:me, kind:"outright", eventId:cage.id, pick:khoa, pickPlayers:[khoa], stake:200, mult:2 },
    { id:"w-sahil", player:me, kind:"outright", eventId:cage.id, pick:sahil, pickPlayers:[sahil], stake:200, mult:2 },
  ];
  const after = structuredClone(before);
  after.results[cage.id] = { slots:[[khoa], [me], []], ts:5, revision:1 };
  const receipt = moment(before, after);
  assert.equal(receipt.kind, "receipt");
  assert.deepEqual(receipt.lines.map(line => [line.label, line.detail, line.delta]), [
    ["2nd place", "Event award", 1600],
    [`Bet on ${khoa}`, "200 at 2:1", 400],
    [`Bet on ${sahil}`, "200 at 2:1", -200],
  ]);
  assert.equal(receipt.from, START);
  assert.equal(receipt.to, START + 1600 + 400 - 200);
  assert.equal(receipt.title, cage.name);
  assert.equal(receipt.subtitle, `${khoa} won`);
  assert.equal(receipt.chip, khoa, "the winner's chip heads the card");
  assert.equal(receipt.celebrate, true, "a won bet celebrates on the bettor's phone");
  assert.equal(receipt.lines.reduce((sum, line) => sum + line.delta, 0), receipt.to - receipt.from);
  assert.ok(receipt.rankTo < receipt.rankFrom || receipt.rankFrom === 1);
});

test("only a fresh frame makes a receipt; a catch-up says nothing and a correction is one quiet line", () => {
  const before = fresh();
  const after = structuredClone(before);
  after.results[putt.id] = { slots:[[me], [], []], ts:5, revision:1 };
  assert.equal(moment(before, after, CATCH_UP), null, "the since line reports an absence");
  const receipt = moment(before, after);
  assert.equal(receipt.lines[0].label, "1st place");
  assert.equal(receipt.celebrate, true);

  const corrected = structuredClone(after);
  corrected.results[putt.id] = { slots:[[adi], [], []], ts:9, revision:2, correctedAt:9 };
  corrected.eventOps[putt.id] = { corrections:[{ type:"overwrite", at:9, reason:"Wrong card" }] };
  const notice = moment(after, corrected, { fresh:false, live:true, correction:true });
  assert.deepEqual(notice, { kind:"notice", delta:-400, text:"Result corrected: −400" });
  assert.equal(moment(after, corrected, FRESH).kind, "notice", "a revised result is a correction whatever the frame says");
});

test("other people's results only move numbers: nothing for a phone whose chips did not move", () => {
  const before = fresh();
  const after = structuredClone(before);
  after.results[putt.id] = { slots:[[khoa], [sahil], [adi]], ts:5, revision:1 };
  assert.equal(moment(before, after), null);
  assert.deepEqual(ui.freshContestWins(before, after, me), []);
  assert.equal(ui.freshContestWins(before, after, khoa).length, 1);
});

test("a match win with no chips still showers the winner, and nobody else", () => {
  const before = fresh();
  before.draws[pairs.id] = { id:"d1", teams:[{ players:[me, khoa] }, { players:[sahil, adi] }] };
  before.brackets[pairs.id] = { size:2, rounds:[[{ a:{ t:0 }, b:{ t:1 }, winner:null }]] };
  const after = structuredClone(before);
  after.brackets[pairs.id].rounds[0][0].winner = 0;
  assert.deepEqual(ui.freshContestWins(before, after, me), [{ evId:pairs.id, key:"match:0:0" }]);
  assert.deepEqual(ui.freshContestWins(before, after, sahil), []);
  assert.deepEqual(ui.freshContestWins(after, after, me), [], "an already decided match is not a new win");
});

test("a bracket match settles your bet with the contest named", () => {
  const before = fresh();
  before.draws[pairs.id] = { id:"d1", teams:[{ players:[khoa, sahil] }, { players:[adi, ROSTER[4]] }] };
  before.brackets[pairs.id] = { size:4, rounds:[[{ a:{ t:0 }, b:{ t:1 }, winner:null }], [{ a:{ w:[0, 0] }, b:{ t:2 }, winner:null }]] };
  before.wagers = [{ id:"m1", player:me, kind:"match", eventId:pairs.id, drawId:"d1", match:[0, 0], teamIdx:0,
    pickTeam:true, pickPlayers:[khoa, sahil], stake:300 }];
  const after = structuredClone(before);
  after.brackets[pairs.id].rounds[0][0].winner = 0;
  after.eventOps[pairs.id] = { contestStack:[{ id:"c1", kind:"match", match:[0, 0], winner:0, decidedAt:11, short:"Semifinal 1" }] };
  const receipt = moment(before, after);
  assert.deepEqual(receipt.lines.map(line => [line.label, line.detail, line.delta]),
    [[`Bet on ${khoa} & ${sahil}`, "300 at 1:1", 300]]);
  assert.equal(receipt.subtitle, `${khoa} & ${sahil} won Semifinal 1`);
});

test("duels and rulings join the receipt; the duel on screen is not said twice; a returned bet is a quiet line", () => {
  const before = fresh();
  before.duels = [{ id:"qd", from:me, to:khoa, stake:200, status:"open", runs:{ [me]:{ ms:300, ts:3 } } }];
  const after = structuredClone(before);
  after.duels[0].runs[khoa] = { ms:410, ts:4 };
  after.adjustments = [{ id:"r1", player:me, delta:100, reason:"Late tee", ts:4 }];
  const receipt = moment(before, after);
  assert.deepEqual(receipt.lines.map(line => [line.label, line.delta]), [[`Quick Draw vs ${khoa}`, 200], ["Ruling", 100]]);
  assert.equal(receipt.title, "Your chips");
  assert.equal(receipt.celebrate, false, "only events, matches and bets shower");
  assert.deepEqual(moment(before, after, FRESH, { skipDuel:"qd" }).lines.map(line => line.kind), ["ruling"]);

  const swap = fresh();
  swap.draws[pairs.id] = { id:"d1", teams:[{ players:[khoa] }, { players:[sahil] }] };
  swap.brackets[pairs.id] = { size:2, rounds:[[{ a:{ t:0 }, b:{ t:1 }, winner:null }]] };
  swap.wagers = [{ id:"v", player:me, kind:"match", eventId:pairs.id, drawId:"d1", match:[0, 0], teamIdx:0, pickPlayers:[khoa], stake:300 }];
  const swapped = structuredClone(swap);
  swapped.wagers[0].status = "void";
  assert.deepEqual(moment(swap, swapped), { kind:"notice", delta:0, text:"Bet voided: 300 returned" });
});

test("moments that land together join one card that keeps where the chips started", () => {
  const a = { kind:"receipt", id:"r1", me, lines:[{ id:"award:x", eventId:"x", delta:400, kind:"award" }],
    eventIds:["x"], from:1000, to:1400, rankFrom:9, rankTo:3, title:"X", subtitle:"A won", celebrate:false };
  const b = { kind:"receipt", id:"r2", me, lines:[{ id:"award:x", eventId:"x", delta:400, kind:"award" },
    { id:"bet:1", eventId:"x", delta:200, kind:"bet", won:true }], eventIds:["x"], from:1400, to:1600, rankFrom:3,
    rankTo:1, title:"X", subtitle:"A won", celebrate:true };
  const merged = ui.mergeMoments(a, b);
  assert.equal(merged.id, "r1");
  assert.equal(merged.from, 1000);
  assert.equal(merged.to, 1600);
  assert.equal(merged.rankFrom, 9);
  assert.equal(merged.rankTo, 1);
  assert.equal(merged.lines.length, 2, "a line already on the card is not repeated");
  assert.equal(merged.celebrate, true);
  assert.equal(merged.version, 1);
  assert.deepEqual(ui.rankMove(9, 1), { up:true, text:"▲ 8 places" });
  assert.deepEqual(ui.rankMove(2, 3), { up:false, text:"▼ 1 place" });
  assert.equal(ui.rankMove(4, 4), null);
  assert.equal(ui.flightChips(800), 3);
  assert.equal(ui.flightChips(100), 1);
  assert.equal(ui.flightChips(-200), 0);
});

test("the shower is your own chips, seeded, and the same pieces on every render", () => {
  const a = ui.showerPieces(3), b = ui.showerPieces(3);
  assert.deepEqual(a, b);
  assert.equal(a.length, ui.SHOWER_CHIPS);
  assert.ok(a.every(piece => piece.left >= 0 && piece.left <= 100 && piece.size >= 22));
  const html = renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:fresh().profiles },
    React.createElement(ui.ChipShower, { burst:0, p:me })));
  assert.equal(html, "", "nothing falls without a win");
});

/* A weekend for one player, in the order it happened */
function weekend() {
  const state = fresh();
  state.results[putt.id] = { slots:[[me], [khoa], [sahil]], ts:1000000, revision:1 };
  state.results[cage.id] = { slots:[[khoa], [adi], [me]], ts:3000000, revision:1 };
  state.wagers = [
    { id:"b1", player:me, kind:"outright", eventId:cage.id, pick:khoa, pickPlayers:[khoa], stake:300, mult:2 },
    { id:"b2", player:me, kind:"outright", eventId:putt.id, pick:sahil, pickPlayers:[sahil], stake:200, mult:2 },
  ];
  state.duels = [
    { id:"d1", from:me, to:adi, stake:200, status:"open", ts:1500000, runs:{ [me]:{ ms:250, ts:1500000 }, [adi]:{ ms:300, ts:1600000 } } },
    { id:"d2", from:khoa, to:me, stake:100, status:"open", ts:2000000, runs:{ [me]:{ foul:true, ts:2000000 }, [khoa]:{ ms:300, ts:2100000 } } },
  ];
  state.adjustments = [{ id:"r1", player:me, delta:-100, reason:"Late", ts:2500000 }];
  return state;
}

test("the chip history replays the weekend in order and always lands on the board's number", () => {
  const state = weekend();
  const history = ui.chipHistory(state, me, events);
  const board = computeStandings(state).find(row => row.player === me).pts;
  assert.equal(history[0].pts, START);
  assert.equal(history.at(-1).pts, board);
  assert.deepEqual(history.map(step => step.pts), [1000, 1200, 1400, 1300, 1200, 2200]);
  assert.deepEqual(history.map(step => step.session), ["fri", "fri", "fri", "fri", "fri", "san"]);

  for (const player of ROSTER)
    assert.equal(ui.chipHistory(state, player, events).at(-1).pts,
      computeStandings(state).find(row => row.player === player).pts, `${player} lands on the board`);

  /* the poker count becomes the stack, and a ruling on that count applies on top */
  const final = structuredClone(state);
  final.results[poker.id] = { slots:[[khoa], [me], []], stacks:Object.fromEntries(ROSTER.map(p => [p, p === khoa ? 6000 : p === me ? 1500 : 500])),
    seats:ROSTER, ts:9000000, revision:1 };
  final.adjustments.push({ id:"r2", player:me, delta:25, reason:"Count", ts:9500000, pokerRevision:1 });
  final.frozen = true;
  const steps = ui.chipHistory(final, me, events);
  assert.equal(steps.at(-2).pts, 1500);
  assert.equal(steps.at(-1).pts, 1525);
  assert.equal(steps.at(-1).session, "fin");
  assert.equal(steps.at(-1).pts, computeStandings(final).find(row => row.player === me).pts);
});

test("the last card says only what happened: place, stack, wins, best bet, Quick Draw, high", () => {
  const state = weekend();
  state.results[poker.id] = { slots:[[khoa], [me], []], stacks:Object.fromEntries(ROSTER.map(p => [p, p === khoa ? 6000 : p === me ? 1500 : 500])),
    seats:ROSTER, ts:9000000, revision:1 };
  state.frozen = true;
  const card = ui.lastCardModel(state, me, { events });
  assert.equal(card.place, "2ND");
  assert.equal(card.pts, 1500);
  assert.equal(card.champion, false);
  assert.deepEqual(card.leaders.map(leader => leader.player), [khoa]);
  assert.deepEqual(card.wins, [putt.name]);
  assert.deepEqual(card.facts.map(fact => [fact.id, fact.value]), [
    ["wins", putt.name], ["best", "+600"], ["qd", "+100"], ["high", "2,200"]]);
  assert.equal(card.facts[1].label, `Best bet on ${khoa}`);
  assert.equal(card.facts[2].label, "Quick Draw 1–1");
  assert.equal(card.dates, "OCT 30 TO NOV 1");
  assert.equal(card.footer, `${ROSTER.length} PLAYERS · 3 EVENTS`);

  const quiet = ui.lastCardModel(fresh(), adi, { events });
  assert.deepEqual(quiet.facts, [], "a quiet weekend is a short card, not a table of zeros");
  assert.equal(quiet.history.length, 1);
});

test("the chart is a step line with the high marked and session ticks that never crowd", () => {
  const history = ui.chipHistory(weekend(), me, events);
  const chart = ui.chartModel(history, { width:330, height:128 });
  assert.match(chart.d, /^M4 [\d.]+ H[\d.]+ V[\d.]+/);
  assert.equal(chart.points.length, history.length);
  assert.equal(chart.last.pts, 2200);
  assert.equal(chart.peak, null, "a high that is also the last point is drawn once");
  assert.ok(chart.ticks.length >= 1 && chart.ticks[0].label === "FRI");
  for (let i = 1; i < chart.ticks.length; i++) assert.ok(chart.ticks[i].x - chart.ticks[i - 1].x >= chart.ticks[i - 1].label.length * 7.8 + 6, "labels never touch");
  const flat = ui.chartModel([{ pts:START, session:"fri" }]);
  assert.equal(flat.points.length, 2, "a single point still draws a line");
});

test("the crown opens once per phone: moment when fresh, the card when this phone missed it", () => {
  const state = weekend();
  assert.equal(ui.crownKey(state), null);
  state.frozen = true;
  const key = ui.crownKey(state);
  assert.ok(key.startsWith(computeStandings(state)[0].player));
  assert.equal(ui.crownOpening({ key, seen:null, fresh:true }), "moment");
  assert.equal(ui.crownOpening({ key, seen:null, fresh:false }), "card");
  assert.equal(ui.crownOpening({ key, seen:key, fresh:true }), null, "never twice");
  assert.equal(ui.crownOpening({ key, seen:null, fresh:true, active:false }), null, "not over check-in or on the TV");
  assert.equal(ui.crownOpening({ key:null, seen:null, fresh:true }), null);
});

const render = (element, profiles = fresh().profiles) =>
  renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles }, element));

test("the receipt, the last card and Home's way back render their real content", () => {
  const before = fresh();
  before.wagers = [{ id:"w", player:me, kind:"outright", eventId:cage.id, pick:khoa, pickPlayers:[khoa], stake:200, mult:2 }];
  const after = structuredClone(before);
  after.results[cage.id] = { slots:[[khoa], [me], []], ts:5, revision:1 };
  const receipt = { ...moment(before, after), animate:false };
  const html = render(React.createElement(ui.ChipReceipt, { moment:receipt, onDismiss:() => {}, onStandings:() => {}, onSettled:() => {} }));
  assert.match(html, /2nd place/);
  assert.match(html, /\+1,600/);
  assert.match(html, /Settled bets/);
  /* the total's reel stands on its end state: its windows read 3,000 */
  const total = html.match(/fd-receipt-to">([\s\S]*?)<\/strong>/)[1];
  assert.equal([...total.matchAll(/fd-reel-strip[^"]*" style="--d:(\d+)/g)].map(m => Number(m[1]) % 10).join(""), "3000",
    "reduced or static: the total shows its end state");
  assert.doesNotMatch(html, /—/);

  const state = weekend();
  state.frozen = true;
  const standings = computeStandings(state);
  const card = ui.lastCardModel(state, me, { events, standings });
  const face = render(React.createElement(ui.LastCardFace, { model:card }));
  assert.match(face, /FIELD DAY \/ SCOTTSDALE 2026/);
  assert.match(face, /FINAL STACK/);
  assert.match(face, /Quick Draw/);
  const layer = render(React.createElement(ui.LastCardLayer, { state, me, events, standings, mode:"card",
    onClose:() => {}, onStandings:() => {} }), state.profiles);
  assert.match(layer, /Save card/);
  assert.match(layer, /Leaderboard/);
  assert.match(layer, /Champion/);
  const moment_ = render(React.createElement(ui.LastCardLayer, { state, me:standings[0].player, events, standings, mode:"moment",
    onClose:() => {}, onStandings:() => {} }), state.profiles);
  assert.match(moment_, /fd-crown-flood/, "the champion's own phone floods");
  const other = render(React.createElement(ui.LastCardLayer, { state, me:standings[5].player, events, standings, mode:"moment",
    onClose:() => {}, onStandings:() => {} }), state.profiles);
  assert.match(other, /fd-crown-flood/, "D1: every phone floods with the champion's color");
  assert.match(other, /Skip/);

  const StubMark = () => null;
  const home = render(React.createElement(ui.GuestHome, { state, me, events, standings, GameMark:StubMark,
    onPlayer:() => {}, onOpen:() => {}, onBets:() => {}, onStandings:() => {}, onEvents:() => {}, onLastCard:() => {} }), state.profiles);
  assert.match(home, /Your last card/);
});

test("saving hands the image to the share sheet and falls back to press and hold", async () => {
  assert.equal(ui.cardFileName({ name:"Evan Tran" }), "field-day-evan-tran.png");
  const blob = new Blob(["png"], { type:"image/png" });
  const shared = [];
  assert.equal(await ui.shareCardImage(blob, "a.png", { canShare:() => true, share:async data => { shared.push(data); } }), "shared");
  assert.equal(shared[0].files[0].name, "a.png");
  assert.equal(await ui.shareCardImage(blob, "a.png", { canShare:() => false, share:async () => {} }), "preview");
  assert.equal(await ui.shareCardImage(blob, "a.png", { canShare:() => true,
    share:async () => { throw Object.assign(new Error("x"), { name:"AbortError" }); } }), "cancelled");
  assert.equal(await ui.shareCardImage(blob, "a.png", { canShare:() => true,
    share:async () => { throw Object.assign(new Error("x"), { name:"NotAllowedError" }); } }), "preview");
  assert.equal(await ui.shareCardImage(null, "a.png", null), "preview");
});

test("the canvas card draws every fact without throwing", () => {
  const calls = [];
  const ctx = new Proxy({}, { get:(target, key) => {
    if (key === "measureText") return text => ({ width:String(text).length * 6 });
    if (key in target) return target[key];
    return (...args) => { calls.push([key, ...args]); };
  }, set:(target, key, value) => { target[key] = value; return true; } });
  const state = weekend();
  state.frozen = true;
  ui.drawLastCard(ctx, ui.lastCardModel(state, me, { events }), { color:"#E39A3B", ink:"#070b09" });
  const texts = calls.filter(call => call[0] === "fillText").map(call => call[1]);
  assert.ok(texts.includes("PLAYER 01"));
  assert.ok(texts.some(text => /^Quick Draw/.test(text)));
  assert.ok(texts.includes("2,200"));
});

test("App: results no longer rain confetti on every phone; receipts, own-chip showers and the crown are wired", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /summarizeUpdate\(/, "the result toast is replaced by the receipt");
  assert.match(app, /if \(tv && resultsSeenRef\.current/, "the room-wide burst is the TV's alone");
  assert.equal((app.match(/<Confetti /g) || []).length, 1, "only the TV renders confetti");
  assert.match(app, /<ChipReceipt /);
  assert.match(app, /<ChipShower burst=\{shower\} p=\{me\} amount=\{moment \? moment\.to - moment\.from : 0\} \/>/,
    "the chip rain is sized by the win");
  assert.match(app, /<MomentsLayer /, "the phone takeovers are mounted");
  assert.match(app, /<LastCardLayer /);
  assert.match(app, /onLastCard=/);
});
