/* Rivalries and records (Oct 10, features/tv/recordsModel.js): the TV's
   downtime cards, derived from the record and never stored. Each kind from
   a weekend the real reducers played: head to head (two pairs who met twice
   standing as one card, the closest and the most lopsided, the player
   card's own record), the biggest swing (up and down, what made it, never a
   ruling), the longest streak, the most upsets, the best and the worst
   bettor, Quick Draw's fastest reaction and most wins; corrections, undone
   contests and voids changing them; no data, no card; the rotation (records
   only in a gap, one card a turn, the next records turn the next card); and
   the TV's real markup. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.timers.enable({ apis:["Date"], now:1_900_000_000_000 });
const later = (ms = 1000) => mock.timers.tick(ms);

const { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, makeBracket, resolveCurrentContest } = await import("../shared/core.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const { headToHead } = await import("../src/features/profile/seasonStats.js");
const { TV_AMBIENT_TURN_MS, biggestSwing } = await import("../src/features/tv/tvModel.js");
const { withPhotoTurns } = await import("../src/features/photos/photoModel.js");
const R = await import("../src/features/tv/recordsModel.js");
const {
  BETTOR_MIN, MAX_SHARED, MIN_MEETINGS, RECORD_LABELS, STREAK_MIN, SWING_MIN, UPSETS_MIN, bettorCards, duelsCard, fastestCard,
  headToHeadCards, recordAt, recordCards, recordLabel, recordTurn, rivalryBlocks, streakCard, swingCard, upsetsCard, withRecordTurns,
} = R;

let serial = 0;
const fresh = () => { const s = structuredClone(EMPTY_STATE); s.live = true; return s; };
const ev = (s, id) => allEventsOf(s).find(item => item.id === id);
const current = (s, id) => resolveCurrentContest(s, ev(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = (extra = {}) => ({ isGm:true, player:"Brandon", deviceId:"records-gm", actionId:`rec-${++serial}`, ...extra });
const guest = player => ({ isGm:false, player, deviceId:`records-${player}`, actionId:`rec-${++serial}` });
const act = (s, type, payload = {}, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const rule = (s, player, delta) => act(s, "adjust", { player, delta, reason:"setup" });
const events = s => allEventsOf(s);

/* a pairs bracket in the stored hand-drawn six: play-in 1 is team 3 (Adi,
   Chiang) against team 4 (Richard, Allan), play-in 2 team 2 (Khoa, Chinh)
   against team 5 (Henry, Ben); team 0 (Brandon, Evan) and team 1 (Eyob,
   Sahil) wait in the semifinals. The same six pairs in every pairs event. */
const TEAM = Array.from({ length:6 }, (_, key) => ROSTER.slice(key * 2, key * 2 + 2));
function pairs(s, evId) {
  s.draws[evId] = { id:`draw-${evId}`, ts:1, teams:TEAM.map(players => ({ players:[...players] })) };
  s.brackets[evId] = makeBracket(6);
  act(s, "announceEvent", { evId });
  return s;
}
/* record the current contest's winner (locking its market first) */
function decide(s, evId, winner, extra = {}) {
  later(1000);
  if (current(s, evId).phase === "betting-open") act(s, "lockAndStart", { evId, ...refs(current(s, evId)) });
  later(1000);
  return act(s, "recordContestWinner", { evId, ...refs(current(s, evId)), winner, ...extra });
}
/* a bracket played out: play-in 1, play-in 2, the semifinals, the final */
const playOut = (s, evId, keys) => keys.forEach((key, i) => decide(s, evId, key, i === keys.length - 1 ? { postResult:true } : {}));
/* a free-for-all played to its result */
function playFfa(s, evId, slots, { before = () => {} } = {}) {
  later(1000);
  act(s, "announceEvent", { evId });
  before(current(s, evId));
  later(1000);
  act(s, "lockAndStart", { evId, ...refs(current(s, evId)) });
  act(s, "beginResultEntry", { evId });
  later(1000);
  return act(s, "saveResult", { evId, slots });
}
const outright = (c, pick, stake) => ({ wager:{ kind:"outright", eventId:c.eventId || "putt", evName:"Long Putt", ...refs(c), pick,
  pickPlayers:[pick], stake } });
/* a Quick Draw played through: sent, accepted, both ready, both drawn */
function duel(s, from, to, { a = 300, b = 400, stake = 100, foulA = false } = {}) {
  later(1000);
  const id = act(s, "sendDuel", { to, game:"quickdraw", stake }, guest(from)).extra.id;
  act(s, "acceptDuel", { id }, guest(to));
  act(s, "duelReady", { id }, guest(to));
  act(s, "duelReady", { id }, guest(from));
  const d = s.duels.find(item => item.id === id);
  mock.timers.tick(Math.max(0, Number(d.fireAt) - Date.now()) + 50);
  act(s, "playDuel", foulA ? { id, foul:true } : { id, ms:a }, guest(from));
  if (b !== null) act(s, "playDuel", { id, ms:b }, guest(to));
  return id;
}
const sides = card => card.sides.map(side => [side.players, side.wins]);

/* ── head to head ── */

test("head to head: two pairs that met twice stand as one card, by the player card's own record", () => {
  const s = pairs(fresh(), "die");
  playOut(s, "die", [3, 2, 3, 2, 3]);              /* Adi & Chiang take every match they play */
  pairs(s, "pickleball");
  playOut(s, "pickleball", [4, 2, 4, 2, 2]);       /* Richard & Allan beat them back; Khoa & Chinh take it */
  const cards = headToHeadCards(s, events(s));
  assert.deepEqual(cards.map(sides), [
    [[["Adi", "Chiang"], 1], [["Richard", "Allan"], 1]],    /* the closest: dead even */
    [[["Khoa", "Chinh"], 2], [["Eyob", "Sahil"], 0]],       /* the most lopsided, the side ahead first */
    [[["Khoa", "Chinh"], 2], [["Henry", "Ben"], 0]],        /* then the most played */
  ]);
  assert.deepEqual(cards.map(card => card.meetings), [2, 2, 2]);
  assert.equal(cards[0].kind, "h2h");
  assert.deepEqual(cards[0].players, ["Adi", "Chiang", "Richard", "Allan"]);
  /* every pair on a card has exactly that record on the player card */
  for (const card of cards) {
    const [a, b] = card.sides;
    for (const x of a.players) for (const y of b.players) {
      const record = headToHead(s, x, y, events(s));
      assert.deepEqual([record.won, record.lost], [a.wins, b.wins], `${x} v ${y}`);
    }
  }
  /* four player pairs, one card: each pair in one block only */
  const blocks = rivalryBlocks(s, events(s));
  const seen = blocks.flatMap(block => block.sides[0].players.flatMap(x => block.sides[1].players.map(y => [x, y].sort().join("|"))));
  assert.equal(new Set(seen).size, seen.length);
  assert.ok(blocks.every(block => block.meetings >= MIN_MEETINGS));
  /* in the rotation: the closest leads, the others spread through it */
  const list = recordCards(s, events(s));
  assert.equal(list[0].id, cards[0].id);
  assert.ok(list.findIndex(card => card.id === cards[1].id) > 1 && list.at(-1).id === cards[2].id);
});

test("head to head: one meeting is no card; an undone contest and a voided duel take a meeting back", () => {
  const s = pairs(fresh(), "die");
  playOut(s, "die", [3, 2, 3, 2, 3]);
  assert.deepEqual(headToHeadCards(s, events(s)), [], "every pair has met once");
  pairs(s, "pickleball");
  decide(s, "pickleball", 4);
  assert.deepEqual(sides(headToHeadCards(s, events(s))[0]), [[["Adi", "Chiang"], 1], [["Richard", "Allan"], 1]]);
  const top = s.eventOps.pickleball.contestStack.at(-1);
  later(2000);
  act(s, "undoLastContest", { evId:"pickleball", contestId:top.id, contestRevision:s.eventOps.pickleball.contestRevision });
  assert.deepEqual(headToHeadCards(s, events(s)), [], "the rematch is undone: one meeting again");
  /* two Quick Draws are a head to head of their own */
  const q = fresh();
  const first = duel(q, "Sahil", "Ben", { a:240, b:300 });
  duel(q, "Ben", "Sahil", { a:500, b:260 });
  assert.deepEqual(sides(headToHeadCards(q, events(q))[0]), [[["Sahil"], 2], [["Ben"], 0]]);
  act(q, "voidDuel", { id:first, reason:"Wrong phone" });
  assert.deepEqual(headToHeadCards(q, events(q)), [], "a voided duel never happened");
});

test("head to head: a teammate with a different record stands apart, never on the merged side", () => {
  const s = pairs(fresh(), "die");
  playOut(s, "die", [3, 2, 3, 2, 3]);
  pairs(s, "pickleball");
  playOut(s, "pickleball", [3, 2, 3, 2, 3]);
  /* a Quick Draw only Adi and Richard played */
  duel(s, "Adi", "Richard", { a:250, b:300 });
  const blocks = rivalryBlocks(s, events(s)).filter(block => block.sides.flatMap(side => side.players)
    .some(p => ["Adi", "Chiang", "Richard", "Allan"].includes(p)) && block.sides.flatMap(side => side.players)
    .every(p => ["Adi", "Chiang", "Richard", "Allan"].includes(p)));
  assert.deepEqual(blocks.map(block => block.sides.map(side => [side.players, side.wins])), [
    [[["Adi"], 3], [["Richard"], 0]],
    [[["Adi", "Chiang"], 2], [["Allan"], 0]],
    [[["Chiang"], 2], [["Richard"], 0]],
  ]);
});

/* ── the biggest swing ── */

test("the biggest swing: the ticker's own (an event's award and bets for one player), up or down; never a ruling", () => {
  const s = fresh();
  rule(s, "Jeremy", 2000);
  assert.equal(swingCard(s, events(s)), null, "a ruling is the commissioner's, never a swing");
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]], { before:c => {
    act(s, "placeWager", outright(c, "Khoa", 300), guest("Khoa"));     /* +400 for 1st, +600 at 2:1 */
    act(s, "placeWager", outright(c, "Ben", 1200), guest("Jeremy"));   /* -1,200 */
  } });
  const card = swingCard(s, events(s));
  assert.deepEqual([card.kind, card.players, card.amount], ["swing", ["Jeremy"], -1200], "the loss is the bigger swing");
  assert.deepEqual(card.cause, { kind:"event", evId:"putt", name:"Long Putt", game:"putting", variant:null });
  const ticker = biggestSwing(s, events(s), "putt");
  assert.deepEqual([ticker.player, ticker.change], [card.players[0], card.amount], "the ticker's Biggest swing, the same");
  /* a correction moves it: Ben takes 1st, Jeremy's chips pay 2:1 */
  later(5000);
  act(s, "saveResult", { evId:"putt", slots:[["Ben"], ["Adi"], ["Evan"]], confirmOverwrite:true, correctionReason:"Measured again" });
  const corrected = swingCard(s, events(s));
  assert.deepEqual([corrected.players, corrected.amount], [["Jeremy"], 2400]);
  assert.equal(corrected.cause.evId, "putt");
});

test("an event played as contests swings by all of its bets once its result posts, the way the ticker counts it", () => {
  const s = pairs(fresh(), "die");
  rule(s, "Jeremy", 2000);
  const back = key => ({ wager:{ kind:"match", eventId:"die", evName:"Beer Die Doubles", stake:600, ...refs(current(s, "die")),
    match:current(s, "die").match, teamIdx:key, drawId:"draw-die" } });
  act(s, "placeWager", back(3), guest("Jeremy"));   /* the play-in, +600 */
  decide(s, "die", 3);
  decide(s, "die", 2);
  assert.equal(swingCard(s, events(s)), null, "an event still being played has no swing yet");
  act(s, "placeWager", back(3), guest("Jeremy"));   /* the semifinal, +600 */
  decide(s, "die", 3);
  decide(s, "die", 2);
  decide(s, "die", 3, { postResult:true });
  const card = swingCard(s, events(s));
  assert.deepEqual([card.players, card.amount, card.cause.evId], [["Jeremy"], 1200, "die"]);
  assert.equal(biggestSwing(s, events(s), "die").change, 1200);
});

test("a swing under 500 is no card; a duel's swing names who it was against", () => {
  const s = fresh();
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]]);
  assert.equal(swingCard(s, events(s)), null, `${400} for 1st is under ${SWING_MIN}`);
  rule(s, "Sahil", 1000);
  rule(s, "Ben", 1000);
  duel(s, "Sahil", "Ben", { a:240, b:300, stake:600 });
  const card = swingCard(s, events(s));
  assert.deepEqual([card.players, card.amount, card.cause], [["Sahil"], 600, { kind:"duel", against:["Ben"] }],
    "a gain wins a tie with the loss beside it");
});

/* ── runs and upsets ── */

test("the longest streak: three straight wins or more, its wins drawn; an undone win takes it back", () => {
  const s = pairs(fresh(), "die");
  [3, 2, 3, 2].forEach(key => decide(s, "die", key));
  assert.equal(streakCard(s, events(s)), null, "two in a row is not a record");
  decide(s, "die", 3);                             /* the final, its result not posted with it */
  const card = streakCard(s, events(s));
  assert.deepEqual([card.kind, card.players, card.count], ["streak", ["Adi", "Chiang"], STREAK_MIN]);
  assert.deepEqual(card.wins.map(win => win.game), ["die", "die", "die"]);
  const top = s.eventOps.die.contestStack.at(-1);
  later(2000);
  act(s, "undoLastContest", { evId:"die", contestId:top.id, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(streakCard(s, events(s)), null, "the final's win is gone with it");
  /* a free-for-all's 1st carries a run on; a run shared by more than three is no record */
  decide(s, "die", 3, { postResult:true });
  playFfa(s, "putt", [["Adi"], ["Sahil"], ["Evan"]]);
  const four = streakCard(s, events(s));
  assert.deepEqual([four.players, four.count], [["Adi"], 4]);
  assert.deepEqual(four.wins.map(win => win.game), ["die", "die", "die", "putting"]);
});

test("the most upsets: wins the stored odds named underdog, two or more", () => {
  const s = fresh();
  ["Richard", "Allan", "Brandon", "Evan"].forEach(player => rule(s, player, 600));
  pairs(s, "die");
  assert.equal(current(s, "die").odds.underdog, 3);
  decide(s, "die", 3);                             /* Adi & Chiang, 1,200 behind: an upset */
  assert.equal(upsetsCard(s, events(s)), null, `one upset is not a record (${UPSETS_MIN})`);
  decide(s, "die", 2);
  assert.equal(current(s, "die").odds.underdog, 3, "again the underdog against Brandon & Evan");
  decide(s, "die", 3);
  const card = upsetsCard(s, events(s));
  assert.deepEqual([card.kind, card.players, card.count], ["upsets", ["Adi", "Chiang"], 2]);
  assert.deepEqual(card.wins.map(win => win.game), ["die", "die"]);
  /* the favorite winning is no upset */
  const chalk = fresh();
  ["Richard", "Allan"].forEach(player => rule(chalk, player, 600));
  pairs(chalk, "die");
  decide(chalk, "die", 4);
  assert.equal(R.upsetWinners(chalk, { ev:ev(chalk, "die"), entry:chalk.eventOps.die.contestStack.at(-1), type:"contest" }), null);
});

/* ── bets ── */

test("the best and the worst bettor: the net of settled bets, 500 either way; a voided bet changes it", () => {
  const s = fresh();
  rule(s, "Henry", 1000);
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]], { before:c => {
    act(s, "placeWager", outright(c, "Khoa", 500), guest("Henry"));    /* +1,000 */
    act(s, "placeWager", outright(c, "Ben", 500), guest("Jeremy"));    /* -500 */
    act(s, "placeWager", outright(c, "Adi", 200), guest("Sahil"));     /* -200 */
  } });
  const [best, worst] = bettorCards(s, events(s));
  assert.deepEqual([best.kind, best.players, best.amount, best.worst], ["bettor", ["Henry"], 1000, false]);
  assert.deepEqual([worst.players, worst.amount, worst.worst], [["Jeremy"], -BETTOR_MIN, true]);
  assert.equal(recordLabel(best), "Best bettor");
  assert.equal(recordLabel(worst), "Worst bettor");
  const ticket = s.wagers.find(wager => wager.player === "Henry");
  act(s, "voidWager", { id:ticket.id, reason:"Placed by mistake" });
  assert.deepEqual(bettorCards(s, events(s)).map(card => card.players[0]), ["Jeremy"], "the void took Henry's win away");
});

/* ── Quick Draw ── */

test("Quick Draw: the fastest settled reaction, and the most wins; unsettled, untapped and void never count", () => {
  const s = fresh();
  duel(s, "Sahil", "Ben", { a:231, b:286 });
  assert.deepEqual(fastestCard(s), { id:fastestCard(s).id, kind:"fastest", players:["Sahil"], ms:231 });
  assert.equal(duelsCard(s), null, "one win is not a record");
  duel(s, "Adi", "Sahil", { foulA:true, b:5000 });  /* Sahil never tapped: a win, not a time */
  assert.equal(fastestCard(s).ms, 231);
  assert.deepEqual([duelsCard(s).players, duelsCard(s).count], [["Sahil"], 2]);
  /* a run still waiting on the other side is private, never a record */
  duel(s, "Henry", "Chiang", { a:150, b:null });
  assert.equal(fastestCard(s).players[0], "Sahil");
  /* four players on two wins each share it: no record; a third win makes one */
  const t = fresh();
  [["Brandon", "Evan"], ["Eyob", "Khoa"], ["Chinh", "Adi"], ["Richard", "Allan"]].forEach(([a, b]) => {
    duel(t, a, b, { a:250, b:300 });
    duel(t, a, b, { a:260, b:310 });
  });
  assert.equal(duelsCard(t), null, `more than ${MAX_SHARED} share it`);
  duel(t, "Brandon", "Henry", { a:270, b:330 });
  assert.deepEqual([duelsCard(t).players, duelsCard(t).count], [["Brandon"], 3]);
});

/* ── no data, no card ── */

test("no data, no card: a fresh board, rulings alone, one quiet result", () => {
  assert.deepEqual(recordCards(structuredClone(EMPTY_STATE)), []);
  const s = fresh();
  rule(s, "Khoa", 3000);
  rule(s, "Ben", -800);
  assert.deepEqual(recordCards(s, events(s)), []);
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]]);
  assert.deepEqual(recordCards(s, events(s)), [], "one free-for-all with no bets holds no record");
  assert.deepEqual(recordCards(null), []);
});

/* ── the turns ── */

test("the rotation: one records turn after the gap's own cards, which keep their places, before the photos", () => {
  assert.deepEqual(withRecordTurns(["board", "next", "latest", "trophy"], 0), ["board", "next", "latest", "trophy"]);
  assert.deepEqual(withRecordTurns(["board", "next", "latest", "trophy"], 3), ["board", "next", "latest", "trophy", "records"]);
  assert.deepEqual(withRecordTurns(["board"], 1), ["board", "records"]);
  assert.deepEqual(withPhotoTurns(withRecordTurns(["board", "next", "latest", "trophy"], 9), 2),
    ["board", "next", "latest", "trophy", "records", "photos"]);
  /* each records turn shows the card after the last one's, on the server clock */
  const ambient = withPhotoTurns(withRecordTurns(["board", "next", "latest", "trophy"], 5), 12);
  const cards = ["a", "b", "c", "d", "e"].map(id => ({ id }));
  const P = TV_AMBIENT_TURN_MS, L = ambient.length;
  assert.deepEqual(ambient, ["board", "next", "latest", "photos", "trophy", "records", "photos"]);
  const shown = [];
  for (let turn = 0; turn < L * 12; turn++) {
    const at = turn * P + 300;
    const k = recordTurn(ambient, at);
    assert.equal(k !== null, ambient[turn % L] === "records", `turn ${turn}`);
    if (k !== null) shown.push(recordAt(cards, ambient, at).id);
  }
  assert.deepEqual(shown, ["a", "b", "c", "d", "e", "a", "b", "c", "d", "e", "a", "b"]);
  assert.equal(recordAt(cards, ambient, 3 * P), recordAt(cards, ambient, 4 * P - 1), "one card the whole turn");
  assert.equal(recordAt([], ambient, 3 * P), null);
  assert.equal(recordAt(cards, ["board", "next"], 3 * P), null);
});

test("names fit by construction: one line while it letters large, else broken at its space, never under 24px", () => {
  const { recordNameFit, recordNameLines, holderLayout, markSize } = R;
  assert.deepEqual(recordNameFit("Henry Nguyen", 456, { max:96 }), { size:76, lines:["Henry Nguyen"] }, "one line, large");
  assert.deepEqual(recordNameFit("Henry Nguyen", 214, { max:64 }), { size:64, lines:["Henry", "Nguyen"] }, "two lines read larger");
  assert.deepEqual(recordNameFit("Allan Montgomery", 133, { max:52 }), { size:26, lines:["Allan", "Montgomery"] });
  assert.equal(recordNameFit("Bartholomewsmith", 133).size, 24, "a long single word stays on the TV's floor");
  assert.deepEqual(recordNameLines("Brandon", 214, 61), ["Brandon"]);
  assert.deepEqual(recordNameLines("Henry Nguyen", 214, 61), ["Henry", "Nguyen"]);
  /* every column holds its chip; three a side is the most */
  for (const n of [1, 2, 3]) {
    const layout = holderLayout(n, 456, { chip:280 });
    assert.ok(layout.face <= layout.col && layout.col * n + 28 * (n - 1) <= 456, `${n} a side`);
  }
  assert.equal(R.H2H_SIDE_MAX, 3);
  assert.equal(markSize(5, 700), 88);
  assert.ok(markSize(12, 700) * 12 + 16 * 11 <= 700, "a long run shrinks its marks to the row");
  assert.equal(markSize(30, 700), 32, "past that the row wraps");
  assert.match(readFileSync(new URL("../src/features/tv/tv-records.css", import.meta.url), "utf8"), /\.tv-record-marks \{[^}]*flex-wrap:wrap/);
});

test("every card has a label of one to three words, and the records' copy carries no em dash", () => {
  for (const label of Object.values(RECORD_LABELS)) {
    const words = label.split(" ");
    assert.ok(words.length >= 1 && words.length <= 3, label);
  }
  for (const file of ["src/features/tv/recordsModel.js", "src/features/tv/TVRecords.jsx", "src/features/tv/tv-records.css"])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /—/, `${file}: no em dashes`);
  const css = readFileSync(new URL("../src/features/tv/tv-records.css", import.meta.url), "utf8");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css) && !/rgba?\(/.test(css), "tokens only");
  const sizes = [...css.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length && sizes.every(px => px >= 24), "24px and up on the canvas");
  assert.doesNotMatch(css, /var\(--you/, "the TV has no you");
});

/* ── the TV ── */

/* the towers' labels measure in a layout effect; the server renderer says so once per render */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { TVRecord, recordFigure, ENTRANCE_GRACE_MS } from "./src/features/tv/TVRecords.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("records-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { TVMode, TVRecord, recordFigure, ENTRANCE_GRACE_MS, PlayerIdentityProvider } = ui.exports;
const tv = (state, now) => {
  const list = events(state);
  const standings = computeStandings(state);
  return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { standings, state, events:list, onDeckEv:null, allTied:false, champion:standings[0] && state.frozen
      ? standings[0] : null, coChamps:[], showControlEnabled:false, connection:{ ready:true, connected:true, status:"open", version:1 },
      onExit:() => {}, now })));
};
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const recordOn = html => /data-record="([a-z0-9]+)"/.exec(html)?.[1] || null;

/* a weekend with records: Beer Die played out, then Pickleball's play-in */
function recordsWeekend() {
  const s = pairs(fresh(), "die");
  playOut(s, "die", [3, 2, 3, 2, 3]);
  pairs(s, "pickleball");
  playOut(s, "pickleball", [4, 2, 4, 2, 2]);
  later(TV_AMBIENT_TURN_MS * 3);                   /* the result's moment has long passed */
  return s;
}

test("the TV takes a records turn only in a gap, one card a turn, the next records turn the next card", () => {
  const s = recordsWeekend();
  const cards = recordCards(s, events(s));
  assert.ok(cards.length >= 4, "several cards to take turns");
  const base = Math.ceil(Date.now() / (TV_AMBIENT_TURN_MS * 840)) * TV_AMBIENT_TURN_MS * 840;
  const seen = [];
  for (let turn = 0; turn < 24; turn++) {
    const at = base + turn * TV_AMBIENT_TURN_MS + 4000;
    const html = tv(s, at);
    if (recordOn(html)) seen.push({ turn, html, label:/<section class="tv-record[^"]*" aria-label="([^"]+)"/.exec(html)?.[1] });
  }
  assert.ok(seen.length >= 4, "records turns come round");
  assert.ok(seen.every((item, i) => !i || item.turn - seen[i - 1].turn > 1), "never two records turns in a row");
  /* successive records turns show successive cards, in the model's order */
  const k0 = cards.findIndex(card => recordLabel(card) === seen[0].label);
  assert.ok(k0 >= 0);
  seen.forEach((item, i) => assert.equal(item.label, recordLabel(cards[(k0 + i) % cards.length]), `records turn ${i}`));
  /* the head to head: its label, both sides' names and the record between them */
  const h2h = seen.find(item => item.label === "Head to head");
  assert.ok(h2h, "a head to head comes round");
  assert.match(text(h2h.html), /Head to head .*Adi .*Chiang .*1 to 1 .*Richard .*Allan/);
  /* an event live: no records turn at all */
  const live = recordsWeekend();
  act(live, "announceEvent", { evId:"putt" }, gm());
  for (let turn = 0; turn < 8; turn++) assert.equal(recordOn(tv(live, base + turn * TV_AMBIENT_TURN_MS + 4000)), null, `live, turn ${turn}`);
  /* no cards: no records turn */
  const quiet = fresh();
  playFfa(quiet, "putt", [["Khoa"], ["Adi"], ["Evan"]]);
  later(TV_AMBIENT_TURN_MS * 3);
  for (let turn = 0; turn < 8; turn++) assert.equal(recordOn(tv(quiet, base + turn * TV_AMBIENT_TURN_MS + 4000)), null);
  /* a crowned board keeps its own turns */
  const frozen = recordsWeekend();
  frozen.frozen = true;
  for (let turn = 0; turn < 8; turn++) assert.equal(recordOn(tv(frozen, base + turn * TV_AMBIENT_TURN_MS + 4000)), null);
});

test("on a swing's records turn the ticker's own Biggest swing steps aside: never two on one screen", () => {
  const s = recordsWeekend();
  const card = swingCard(s, events(s));
  assert.ok(card, "Pickleball's 1st is the weekend's biggest swing");
  const base = Math.ceil(Date.now() / (TV_AMBIENT_TURN_MS * 840)) * TV_AMBIENT_TURN_MS * 840;
  const tickerSwing = html => /class="tv-ticker-tag">Biggest swing</.test(html);
  const pages = turn => [300, 6300, 12300, 18300].map(ms => tv(s, base + turn * TV_AMBIENT_TURN_MS + ms));
  let swingTurn = null;
  for (let turn = 0; turn < 60 && swingTurn === null; turn++)
    if (/<h2 class="tv-record-label">Biggest swing</.test(tv(s, base + turn * TV_AMBIENT_TURN_MS + 4000))) swingTurn = turn;
  assert.notEqual(swingTurn, null, "the swing comes round");
  assert.ok(pages(swingTurn).every(html => !tickerSwing(html)), "the card says it, the ticker does not");
  assert.ok(pages(swingTurn - 1).some(tickerSwing), "the turn before, the ticker names the latest result's swing");
});

const draw = (state, card, profiles = state.profiles) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles },
  React.createElement(TVRecord, { state, card, turnAt:0, now:5000 })));

test("each card's drawing: a label, the people's chips and names, one figure in its role's ink", () => {
  const s = fresh();
  /* every chip here letters its initials (no photos): the words are the label, the names and the figure */
  s.profiles = { Richard:{ display:"Squilliam" }, Henry:{ display:"Henry Nguyen" } };
  const words = html => text(html.replace(/<svg[\s\S]*?<\/svg>/g, " "));
  const h2h = draw(s, { id:"h2h:x", kind:"h2h", players:["Richard", "Henry"], meetings:4,
    sides:[{ players:["Richard"], wins:3 }, { players:["Henry"], wins:1 }] });
  assert.equal(words(h2h).trim(), "Head to head Squilliam 3 to 1 Henry Nguyen");
  assert.match(h2h, /class="tv-record-n is-second is-behind"/, "the side behind in lilac");
  assert.equal((h2h.match(/<svg[^>]*width="280"/g) || []).length, 2, "two big chips facing each other");
  const team = draw(s, { id:"h2h:y", kind:"h2h", players:["Adi", "Chiang", "Richard", "Allan"], meetings:2,
    sides:[{ players:["Adi", "Chiang"], wins:1 }, { players:["Richard", "Allan"], wins:1 }] });
  assert.equal(words(team).trim(), "Head to head Adi Chiang 1 to 1 Squilliam Allan");
  assert.doesNotMatch(team, /is-behind/, "level: both bone");
  /* three a side: every name at one size, a long one broken at its space */
  const trio = draw({ ...s, profiles:{ ...s.profiles, Allan:{ display:"Allan Montgomery" } } }, { id:"h2h:z", kind:"h2h",
    players:["Adi", "Chiang", "Ben", "Richard", "Allan", "Henry"], meetings:2,
    sides:[{ players:["Adi", "Chiang", "Ben"], wins:2 }, { players:["Richard", "Allan", "Henry"], wins:0 }] });
  const sizes = [...trio.matchAll(/class="fd-show tv-record-name" style="font-size:(\d+)px"/g)].map(match => Number(match[1]));
  assert.equal(sizes.length, 6);
  assert.ok(sizes.every(size => size === sizes[0] && size >= 24), "one size for all six");
  assert.match(trio, />Allan<br\/>Montgomery</);
  assert.match(trio, />Henry<br\/>Nguyen</);
  const swing = draw(s, { id:"swing:x", kind:"swing", players:["Henry"], amount:-1200,
    cause:{ kind:"event", evId:"putt", name:"Long Putt", game:"putting", variant:null } });
  assert.equal(words(swing).trim(), "Biggest swing Henry Nguyen -1,200 Long Putt");
  assert.match(swing, /class="tv-record-n is-loss"/);
  const up = draw(s, { id:"swing:y", kind:"swing", players:["Richard"], amount:600, cause:{ kind:"duel", against:["Ben"] } });
  assert.equal(words(up).trim(), "Biggest swing Squilliam +600 Quick Draw");
  assert.match(up, /class="tv-record-n is-chip"/, "chips in amber");
  const streak = draw(s, { id:"streak:x", kind:"streak", players:["Adi", "Chiang"], count:4,
    wins:[1, 2, 3, 4].map(i => ({ key:`w${i}`, evId:"die", name:"Beer Die Doubles", game:"die", variant:null })) });
  assert.equal(words(streak).trim(), "Longest streak Adi Chiang 4");
  assert.equal((streak.match(/class="tv-record-mark"/g) || []).length, 4, "a mark for every win");
  const fastest = draw(s, { id:"fastest:x", kind:"fastest", players:["Richard"], ms:187 });
  assert.equal(words(fastest).trim(), "Fastest draw Squilliam 187 ms");
  assert.equal(words(draw(s, { id:"bettor:x", kind:"bettor", players:["Henry"], amount:2100, worst:false })).trim(),
    "Best bettor Henry Nguyen +2,100");
  assert.equal(words(draw(s, { id:"bettor-worst:x", kind:"bettor", players:["Henry"], amount:-900, worst:true })).trim(),
    "Worst bettor Henry Nguyen -900");
  assert.equal(words(draw(s, { id:"upsets:x", kind:"upsets", players:["Henry"], count:3, wins:null })).trim(), "Most upsets Henry Nguyen 3");
  assert.equal(words(draw(s, { id:"duels:x", kind:"duels", players:["Henry"], count:3 })).trim(), "Most duel wins Henry Nguyen 3");
  assert.deepEqual(recordFigure({ kind:"bettor", amount:-900 }), { text:"-900", tone:"loss" });
  for (const html of [h2h, team, swing, up, streak, fastest]) {
    assert.doesNotMatch(text(html), /—|!/);
    assert.match(html, /--tl:-5000ms/, "drawn 5 s into its turn: standing, never mid-entrance");
  }
  /* the TV's clock ticks once a second: a card drawn within that tick of its
     turn plays its whole entrance; a reload later joins where the turn is */
  const at = ms => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles },
    React.createElement(TVRecord, { state:s, card:{ id:"duels:x", kind:"duels", players:["Henry"], count:3 }, turnAt:40_000,
      now:40_000 + ms })));
  assert.match(at(0), /--tl:0ms/);
  assert.match(at(900), /--tl:0ms/, "a tick late is on time");
  assert.match(at(ENTRANCE_GRACE_MS + 400), new RegExp(`--tl:-${ENTRANCE_GRACE_MS + 400}ms`));
});

test("the TV wires the records: one turn in the gap's rotation, its card keyed to the turn", () => {
  const source = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(source, /photoGap \? recordCards\(state, events\) : EMPTY/, "only computed in a gap");
  /* the records' turn, then the highlight reel's (features/gags/highlights.js), then the photos */
  assert.match(source, /withPhotoTurns\(withHighlightTurns\(withRecordTurns\(ambientCards, records\.length\), reel\.length\),\s*photos\.length\)/);
  assert.match(source, /recordAt\(records, ambient, now, TV_AMBIENT_TURN_MS\)/);
  assert.match(source, /<TVRecord key=\{`\$\{record\.id\}@\$\{turnAt\}`\}/);
});
