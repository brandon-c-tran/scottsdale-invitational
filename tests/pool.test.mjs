/* The pool (Oct 13): every market opened since is parimutuel. The bank
   seeds POOL_SEED a side at the open, split by the sides' average chips; a
   side's price is the whole pool over what rides on it, to a tenth, between
   POOL_MIN and POOL_CAP; a winner nets stake x (price - 1) to the nearest
   100 and never less than 100. Everything here runs the real reducers and
   checks the arithmetic by hand: seeding, prices, payouts, voids and
   corrections moving the price, the standings, the ticket's stamp, the
   board's view, the upset line, a room of 13 on one contest, and the
   simulated room's bets. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE, ROSTER, PT, POOL_SEED, POOL_CAP, POOL_MIN, UPSET_PRICE, allEventsOf, computeStandings, contestPool,
  contestUpset, makeBracket, poolBook, poolNet, poolOf, poolPrice, poolSeed, priceText, resolveCurrentContest, resolveWager,
  wagerPrice,
} from "../shared/core.js";
import { ROOM_BETS, roomBet, roomFavorite } from "../shared/qaSim.js";
import { applyAction } from "./support/confirmed-start.mjs";

let serial = 0;
const fresh = () => { const s = structuredClone(EMPTY_STATE); s.live = true; return s; };
const ev = (s, id) => allEventsOf(s).find(item => item.id === id);
const current = (s, id) => resolveCurrentContest(s, ev(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"pool-gm", actionId:`pool-${++serial}` });
const guest = player => ({ isGm:false, player, deviceId:`pool-${player}`, actionId:`pool-${++serial}` });
const act = (s, type, payload = {}, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const rule = (s, player, delta) => act(s, "adjust", { player, delta, reason:"setup" });
const pts = s => Object.fromEntries(computeStandings(s).map(row => [row.player, row.pts]));

/* Beer Die as six pairs in the stored hand-drawn six: play-in 1 is team 3
   (Adi, Chiang) against team 4 (Richard, Allan); Jeremy sits out. */
const TEAM = Array.from({ length:6 }, (_, key) => ROSTER.slice(key * 2, key * 2 + 2));
function dieBoard(setup = () => {}) {
  const s = fresh();
  setup(s);
  s.draws.die = { id:"draw-die", ts:1, teams:TEAM.map(players => ({ players:[...players] })) };
  s.brackets.die = makeBracket(6);
  act(s, "announceEvent", { evId:"die" });
  return s;
}
const onMatch = (s, key, stake, player) => act(s, "placeWager", { wager:{ kind:"match", eventId:"die", evName:"Beer Die Doubles",
  stake, ...refs(current(s, "die")), match:current(s, "die").match, teamIdx:key, drawId:"draw-die" } }, guest(player));
const onPlayer = (s, pick, stake, player, evId = "putt") => act(s, "placeWager", { wager:{ kind:"outright", eventId:evId,
  evName:ev(s, evId).name, ...refs(current(s, evId)), pick, pickPlayers:[pick], stake } }, guest(player));
const decide = (s, winner) => {
  if (current(s, "die").phase === "betting-open") act(s, "lockAndStart", { evId:"die", ...refs(current(s, "die")) });
  return act(s, "recordContestWinner", { evId:"die", ...refs(current(s, "die")), winner });
};
const postFfa = (s, evId, slots) => {
  act(s, "lockAndStart", { evId, ...refs(current(s, evId)) });
  act(s, "beginResultEntry", { evId });
  return act(s, "saveResult", { evId, slots });
};
const deltaOf = (s, w) => resolveWager(s, w, allEventsOf(s)).delta;

/* ── seeding ── */

test("the bank seeds 100 a side at the open, split by the sides' average chips", () => {
  assert.equal(POOL_SEED, PT);
  const level = dieBoard();
  const c = current(level, "die");
  assert.equal(c.pool, true);
  assert.deepEqual(level.eventOps.die.pools[c.id].seed, { 3:100, 4:100 }, "a level board: 100 each");
  assert.deepEqual(Object.keys(level.eventOps.die.pools[c.id].seed), ["3", "4"], "keyed by the side's key");
  assert.equal(typeof level.eventOps.die.pools[c.id].at, "number");
  assert.equal(level.eventOps.die.odds, undefined, "no odds stamped");
  /* 1,000 a head against 1,500: 200 split 2 to 3 */
  const lean = dieBoard(s => { rule(s, "Richard", 500); rule(s, "Allan", 500); });
  assert.deepEqual(lean.eventOps.die.pools[current(lean, "die").id].seed, { 3:80, 4:120 });
  /* a wide free-for-all: 13 sides, 1,300, Jeremy's 3,000 weighs three */
  const wide = fresh();
  rule(wide, "Jeremy", 2000);
  act(wide, "announceEvent", { evId:"putt" });
  const seed = wide.eventOps.putt.pools[current(wide, "putt").id].seed;
  assert.equal(Object.keys(seed).length, ROSTER.length);
  assert.equal(seed.Jeremy, 260);
  assert.equal(seed.Khoa, 86.67, "to the hundredth");
  assert.ok(Math.abs(Object.values(seed).reduce((a, b) => a + b, 0) - 1300) < 0.1);
  /* pure: a side at zero or below weighs as 100, never nothing */
  const sides = { sides:[{ key:0, players:["Adi"] }, { key:1, players:["Ben"] }] };
  assert.deepEqual(poolSeed(fresh(), sides, [{ player:"Adi", pts:-500 }, { player:"Ben", pts:900 }]), { 0:20, 1:180 });
  assert.deepEqual(poolSeed(fresh(), { sides:[] }), {});
});

test("the seed is fixed at the first open: later standings never move it, a reopened contest keeps it", () => {
  const s = dieBoard();
  const first = current(s, "die");
  const seed = structuredClone(s.eventOps.die.pools[first.id]);
  rule(s, "Adi", 3000);
  assert.deepEqual(s.eventOps.die.pools[first.id], seed, "a ruling after the open moves nothing");
  decide(s, 3);
  const second = current(s, "die");
  assert.notEqual(second.id, first.id);
  assert.ok(s.eventOps.die.pools[second.id], "the next contest's market opens its own pool");
  act(s, "correctContest", { evId:"die", contestId:first.id, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(current(s, "die").id, first.id);
  assert.deepEqual(s.eventOps.die.pools[first.id], seed, "the corrected contest keeps the seed it opened with");
});

test("taking back the announcement or clearing the draw drops the pools; the next open seeds from the board then", () => {
  const s = dieBoard();
  const id = current(s, "die").id;
  assert.ok(s.eventOps.die.pools[id]);
  act(s, "takeBackAnnouncement", { evId:"die" });
  assert.equal(s.eventOps.die.pools, undefined);
  rule(s, "Richard", 500);
  rule(s, "Allan", 500);
  act(s, "announceEvent", { evId:"die" });
  assert.deepEqual(s.eventOps.die.pools[current(s, "die").id].seed, { 3:80, 4:120 }, "seeded again, from today's board");
  /* a draw cleared after its market locks with nothing on it */
  const t = fresh();
  act(t, "announceAndDraw", { evId:"die" });
  assert.ok(Object.keys(t.eventOps.die.pools).length);
  act(t, "setOnDeck", { id:null, ...refs(current(t, "die")) });
  act(t, "clearDraw", { evId:"die" });
  assert.equal(t.eventOps.die.pools, undefined);
});

test("no pool opens while the finale is dealt", () => {
  const s = fresh();
  act(s, "pokerSetup");
  assert.equal(applyAction(s, "announceEvent", { evId:"putt" }, gm()).ok, false);
  assert.equal(s.eventOps.putt?.pools, undefined);
});

/* ── prices ── */

test("a side's price is the pool over its side, floored to a tenth, between 1.1 and 10", () => {
  assert.deepEqual([POOL_MIN, POOL_CAP, UPSET_PRICE], [1.1, 10, 3]);
  assert.equal(poolPrice(600, 400), 1.5);
  assert.equal(poolPrice(600, 200), 3);
  assert.equal(poolPrice(1000, 300), 3.3, "3.33 floors to 3.3");
  assert.equal(poolPrice(1990, 1000), 1.9, "1.99 floors, never rounds up");
  assert.equal(poolPrice(0.09, 0.05), 1.8, "a float a hair under its tenth still reads its tenth");
  assert.equal(poolPrice(1050, 1000), POOL_MIN, "never under 1.1");
  assert.equal(poolPrice(5000, 100), POOL_CAP, "never over 10");
  assert.equal(poolPrice(800, 0), POOL_CAP, "an empty side prices at the cap");
  assert.equal(priceText(3.7), "3.7×");
  assert.equal(priceText(3), "3.0×");
  /* a contest's prices from its record: two seeds of 100, 300 on A and 100 on B */
  const s = dieBoard();
  onMatch(s, 3, 300, "Jeremy");
  onMatch(s, 4, 100, "Ben");
  const pool = poolOf(s, "die", current(s, "die").id);
  assert.equal(pool.total, 600);
  assert.deepEqual(pool.sides["3"], { seed:100, stake:300, bettors:1, price:1.5 });
  assert.deepEqual(pool.sides["4"], { seed:100, stake:100, bettors:1, price:3 });
  assert.equal(pool.price(3), 1.5, "a number key reads its string side");
  assert.equal(pool.price(99), POOL_CAP, "a side nothing rides on");
});

/* ── payouts ── */

test("a winner nets stake x (price - 1), to the nearest 100, never under 100; a loser loses the stake", () => {
  assert.equal(poolNet(200, 1.5), 100);
  assert.equal(poolNet(300, 1.8), 200, "240 rounds down");
  assert.equal(poolNet(500, 1.5), 300, "250 rounds half up");
  assert.equal(poolNet(100, 1.1), 100, "10 is still one chip");
  assert.equal(poolNet(1000, 10), 9000);
  const s = dieBoard();
  onMatch(s, 3, 300, "Jeremy");
  onMatch(s, 4, 100, "Ben");
  decide(s, 4);
  const [jeremy, ben] = ["Jeremy", "Ben"].map(player => s.wagers.find(w => w.player === player));
  assert.deepEqual(resolveWager(s, ben, allEventsOf(s)), { status:"won", delta:200 }, "600 over 200: 3.0x, 100 nets 200");
  assert.deepEqual(resolveWager(s, jeremy, allEventsOf(s)), { status:"lost", delta:-300 });
  assert.equal(wagerPrice(s, ben), 3);
  assert.equal(wagerPrice(s, jeremy), 1.5);
});

/* ── voids move the price ── */

test("an Away return voids the tickets on that side, and the rest of the pool reprices", () => {
  const s = fresh();
  act(s, "announceEvent", { evId:"putt" });
  onPlayer(s, "Khoa", 300, "Adi");
  onPlayer(s, "Evan", 100, "Ben");
  const id = current(s, "putt").id;
  /* 1,300 seed and 400 staked is 1,700 over Evan's 200: 8.5x */
  assert.equal(poolOf(s, "putt", id).price("Evan"), 8.5);
  act(s, "setAway", { player:"Khoa", away:true });
  assert.equal(s.wagers.find(w => w.player === "Adi").status, "void");
  /* Khoa's ticket leaves the pool; the bank's seed for him stays in it: 1,400 over 200 */
  assert.equal(poolOf(s, "putt", id).total, 1400);
  assert.equal(poolOf(s, "putt", id).price("Evan"), 7);
  postFfa(s, "putt", [["Evan"], ["Adi"], ["Sahil"]]);
  assert.equal(deltaOf(s, s.wagers.find(w => w.player === "Ben")), 600);
});

test("a ruling that leaves a bettor over the cap voids their newest chip, and the price moves with it", () => {
  const s = dieBoard();
  onMatch(s, 4, 300, "Jeremy");
  onMatch(s, 4, 200, "Jeremy");
  onMatch(s, 3, 100, "Ben");
  const id = current(s, "die").id;
  /* 200 seed and 600 staked is 800 over Adi & Chiang's 200: 4.0x */
  assert.equal(poolOf(s, "die", id).price(3), 4);
  rule(s, "Jeremy", -600);
  const ticket = s.wagers.find(w => w.player === "Jeremy");
  assert.equal(ticket.stake, 300, "the 200 chip went back: 500 no longer fits 400");
  assert.equal(poolOf(s, "die", id).price(3), 3, "600 over 200");
  decide(s, 3);
  assert.equal(deltaOf(s, s.wagers.find(w => w.player === "Ben")), 200);
});

test("a commissioner's void reprices a settled pool, derived", () => {
  const s = dieBoard();
  onMatch(s, 3, 300, "Jeremy");
  onMatch(s, 4, 400, "Ben");
  onMatch(s, 4, 100, "Henry");
  decide(s, 3);
  const jeremy = s.wagers.find(w => w.player === "Jeremy");
  /* 1,000 over 400: 2.5x, 300 nets 450, to the nearest 100 */
  assert.equal(deltaOf(s, jeremy), 500);
  act(s, "voidWager", { id:s.wagers.find(w => w.player === "Ben").id, reason:"Placed by mistake" });
  /* 600 over 400: 1.5x, 150 */
  assert.equal(deltaOf(s, jeremy), 200);
});

/* ── corrections ── */

test("a corrected winner settles at its own side's price, derived from the same pool", () => {
  const s = dieBoard();
  onMatch(s, 3, 300, "Jeremy");
  onMatch(s, 4, 100, "Ben");
  decide(s, 3);
  const [jeremy, ben] = ["Jeremy", "Ben"].map(player => s.wagers.find(w => w.player === player));
  assert.deepEqual([deltaOf(s, jeremy), deltaOf(s, ben)], [200, -100], "1.5x: 150 rounds to 200");
  act(s, "correctContest", { evId:"die", contestId:jeremy.contestId, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(resolveWager(s, jeremy, allEventsOf(s)).status, "pending");
  act(s, "recordContestWinner", { evId:"die", ...refs(current(s, "die")), winner:4 });
  assert.deepEqual([deltaOf(s, jeremy), deltaOf(s, ben)], [-300, 200], "3.0x on the other side");
});

/* ── the standings ── */

test("the standings carry every pool ticket's derived settlement, the same with or without the shared book", () => {
  const s = dieBoard();
  onMatch(s, 3, 300, "Jeremy");
  onMatch(s, 4, 100, "Ben");
  onMatch(s, 3, 200, "Henry");
  decide(s, 3);
  onMatch(s, 2, 400, "Jeremy");
  onMatch(s, 5, 200, "Eyob");
  decide(s, 5);
  const events = allEventsOf(s);
  const book = poolBook(s);
  assert.equal(book.size, 2, "one pool a contest");
  const net = {};
  for (const w of s.wagers) {
    const alone = resolveWager(s, w, events), shared = resolveWager(s, w, events, book);
    assert.deepEqual(alone, shared, w.id);
    net[w.player] = (net[w.player] || 0) + alone.delta;
  }
  /* play-in 1: 800 over 600, 1.3x: 300 nets 90 (100), 200 nets 60 (100); play-in 2: 800 over 300, 2.6x: 200 nets 320 (300) */
  assert.deepEqual(net, { Jeremy:100 - 400, Ben:-100, Henry:100, Eyob:300 });
  for (const row of computeStandings(s)) assert.equal(row.betNet, net[row.player] || 0, row.player);
  assert.equal(pts(s).Eyob, 1300);
});

/* ── the ticket ── */

test("a ticket on a pooled contest carries pool:1 and no fixed payout; one on a contest opened before pools keeps its mult", () => {
  const s = dieBoard();
  onMatch(s, 3, 100, "Jeremy");
  const pooled = s.wagers.find(w => w.player === "Jeremy");
  assert.equal(pooled.pool, 1);
  assert.equal(pooled.mult, undefined);
  const legacy = dieBoard();
  const id = current(legacy, "die").id;
  delete legacy.eventOps.die.pools[id];
  legacy.eventOps.die.odds = { [id]:{ underdog:3, mult:2, gap:1000, at:1 } };
  onMatch(legacy, 3, 100, "Jeremy");
  onMatch(legacy, 4, 200, "Ben");
  const [dog, fav] = ["Jeremy", "Ben"].map(player => legacy.wagers.find(w => w.player === player));
  assert.deepEqual([dog.pool, dog.mult, fav.pool, fav.mult], [undefined, 2, undefined, 1]);
  assert.equal(wagerPrice(legacy, dog), 3);
  assert.equal(wagerPrice(legacy, fav), 2);
  decide(legacy, 3);
  assert.equal(deltaOf(legacy, dog), 200, "the stored 2:1, whatever rides on the other side");
  /* an older outright ticket with no mult keeps 2:1, no pool */
  const old = fresh();
  act(old, "announceEvent", { evId:"putt" });
  old.wagers.push({ id:"old", kind:"outright", eventId:"putt", pick:"Khoa", pickPlayers:["Khoa"], stake:300,
    player:"Ben", status:"open", ts:1 });
  postFfa(old, "putt", [["Khoa"], ["Adi"], ["Evan"]]);
  assert.equal(deltaOf(old, old.wagers.find(w => w.id === "old")), 600);
});

/* ── the board's view ── */

test("contestPool: each side in board order with its seed, stake, bettors and price; the favorite and the long shot", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  onMatch(s, 4, 200, "Jeremy");
  onMatch(s, 4, 100, "Ben");
  onMatch(s, 3, 100, "Henry");
  const view = contestPool(s, current(s, "die"));
  /* 200 seed and 400 staked is 600: Adi & Chiang 600 over 180, 3.3x; Richard & Allan 600 over 420, 1.4x */
  assert.equal(view.total, 600);
  assert.equal(view.staked, 400);
  assert.deepEqual(view.sides, [
    { key:3, seed:80, stake:100, bettors:1, price:3.3 },
    { key:4, seed:120, stake:300, bettors:2, price:1.4 },
  ]);
  assert.equal(view.favorite, 4);
  assert.equal(view.longshot, 3);
  assert.equal(view.price(3), 3.3);
  /* an empty pool reads its seed alone */
  const empty = contestPool(dieBoard(), current(dieBoard(), "die"));
  assert.deepEqual(empty.sides.map(side => side.price), [2, 2]);
  /* a contest without a pool has no view */
  assert.equal(contestPool(s, { ...current(s, "die"), pool:undefined }), null);
  assert.equal(contestPool(s, null), null);
});

/* ── upsets ── */

test("contestUpset: the winner's price at 3x or more is an upset; a legacy contest answers from its stored odds", () => {
  const s = dieBoard();
  onMatch(s, 4, 200, "Jeremy");
  const id = current(s, "die").id;
  assert.deepEqual(contestUpset(s, "die", id, 3), { price:4, upset:true }, "400 over 100");
  assert.deepEqual(contestUpset(s, "die", id, 4), { price:1.3, upset:false });
  const close = dieBoard();
  onMatch(close, 4, 100, "Jeremy");
  assert.deepEqual(contestUpset(close, "die", current(close, "die").id, 3), { price:3, upset:true }, "exactly 3.0x counts");
  const short = dieBoard();
  onMatch(short, 4, 100, "Jeremy");
  onMatch(short, 3, 100, "Ben");
  assert.deepEqual(contestUpset(short, "die", current(short, "die").id, 3), { price:2, upset:false });
  /* legacy: the stored underdog winning is an upset priced at 2:1's 3.0x; the other side none */
  const legacy = dieBoard();
  const old = current(legacy, "die").id;
  delete legacy.eventOps.die.pools[old];
  legacy.eventOps.die.odds = { [old]:{ underdog:3, mult:2, gap:1000, at:1 } };
  assert.deepEqual(contestUpset(legacy, "die", old, 3), { price:3, upset:true });
  assert.deepEqual(contestUpset(legacy, "die", old, 4), { price:null, upset:false });
  legacy.eventOps.die.odds[old].underdog = null;
  assert.deepEqual(contestUpset(legacy, "die", old, 3), { price:null, upset:false }, "an even legacy market has no upset");
  assert.deepEqual(contestUpset(fresh(), "die", "nothing", 0), { price:null, upset:false });
});

/* ── a room of 13 on one contest ── */

test("13 bettors on one free-for-all: the winners share the pool, and the bank's net is the seed less the rounding", () => {
  const BETS = [
    ["Brandon", "Khoa", 500], ["Evan", "Khoa", 300], ["Eyob", "Khoa", 200], ["Sahil", "Khoa", 500], ["Khoa", "Khoa", 500],
    ["Chinh", "Adi", 200], ["Adi", "Adi", 300], ["Chiang", "Evan", 100], ["Richard", "Khoa", 100], ["Allan", "Ben", 500],
    ["Henry", "Khoa", 200], ["Ben", "Ben", 200], ["Jeremy", "Sahil", 100],
  ];
  const play = winner => {
    const s = fresh();
    act(s, "announceEvent", { evId:"putt" });
    for (const [player, pick, stake] of BETS) onPlayer(s, pick, stake, player);
    const pool = poolOf(s, "putt", current(s, "putt").id);
    postFfa(s, "putt", [[winner], ["Evan"], ["Eyob"]]);
    const deltas = s.wagers.map(w => deltaOf(s, w));
    const won = s.wagers.filter((w, i) => deltas[i] > 0);
    const gross = won.reduce((sum, w) => sum + w.stake + deltaOf(s, w), 0);
    const onSide = won.reduce((sum, w) => sum + w.stake, 0);
    return { pool, gross, onSide, won:won.length, bank:-deltas.reduce((a, b) => a + b, 0) };
  };
  /* 1,300 seed and 3,700 staked is 5,000. The favorite: Khoa's side 2,400, 2.0x */
  const chalk = play("Khoa");
  assert.equal(chalk.pool.total, 5000);
  assert.equal(chalk.pool.price("Khoa"), 2);
  assert.equal(chalk.won, 7);
  assert.equal(chalk.gross, 4600, "the seven winners take 4,600 of the 5,000");
  /* the bettors' fair share is the pool less the bank's own seed on Khoa;
     flooring to a tenth and rounding each net can only cost them a little */
  const fair = chalk.pool.total * chalk.onSide / (chalk.onSide + chalk.pool.sides.Khoa.seed);
  assert.ok(chalk.gross <= fair && fair - chalk.gross <= 0.1 * chalk.onSide + 50 * chalk.won, `${chalk.gross} near ${fair}`);
  assert.equal(chalk.bank, -900, "the bank pays 900: losers' 1,400 against winners' 2,300");
  /* the long shot: Ben's side 800, 6.2x; 500 nets 2,600, 200 nets 1,040 (1,000) */
  const long = play("Ben");
  assert.equal(long.pool.price("Ben"), 6.2);
  assert.ok(long.pool.price("Ben") >= UPSET_PRICE);
  assert.equal(long.gross, 4300);
  const fairLong = long.pool.total * long.onSide / (long.onSide + long.pool.sides.Ben.seed);
  assert.ok(long.gross <= fairLong && fairLong - long.gross <= 0.1 * long.onSide + 50 * long.won);
  assert.equal(long.bank, -600, "the bank pays 600: losers' 3,000 against winners' 3,600");
});

/* ── the simulated room ── */

test("a simulated room bets a pool: mostly the favorite by the standings, rack chips inside the room it has", () => {
  const contest = { sides:[{ key:0, players:["Adi", "Chiang"] }, { key:1, players:["Richard", "Allan"] }] };
  const rows = [{ player:"Adi", pts:1000 }, { player:"Chiang", pts:1000 }, { player:"Richard", pts:1600 }, { player:"Allan", pts:1400 }];
  assert.equal(roomFavorite(contest, rows), 1);
  assert.equal(roomFavorite(contest, rows.map(row => ({ ...row, pts:1000 }))), null, "a level board has no favorite");
  const open = contest.sides;
  assert.equal(roomBet(contest, open, 1, 500, { side:0.5, pick:0, stake:0 }).side.key, 1, "under 0.7: the favorite");
  assert.equal(roomBet(contest, open, 1, 500, { side:0.8, pick:0, stake:0 }).side.key, 0, "the rest: a long shot");
  assert.equal(roomBet(contest, open, null, 500, { side:0, pick:0.9, stake:0 }).side.key, 1, "no favorite: any side");
  assert.deepEqual(ROOM_BETS.rack, [100, 200, 500, 1000]);
  assert.deepEqual([0, 0.5, 0.8, 0.99].map(u => roomBet(contest, open, 1, 5000, { side:0, pick:0, stake:u }).stake),
    [100, 200, 500, 1000], "every rack chip, the bigger rarer");
  assert.equal(roomBet(contest, open, 1, 300, { side:0, pick:0, stake:0.99 }).stake, 300, "inside the room left");
  assert.equal(roomBet(contest, open, 1, 50, { side:0, pick:0, stake:0 }), null, "no room, no chip");
  assert.equal(roomBet(contest, [], 1, 500, { side:0, pick:0, stake:0 }), null);
  /* a competitor may back only their own side, favorite or not */
  assert.equal(roomBet(contest, [open[0]], 1, 500, { side:0, pick:0.5, stake:0 }).side.key, 0);
  /* over many bettors: about 70% on the favorite in a matchup, 35% in a wide field */
  const share = (c, n = 2000) => {
    let fav = 0;
    for (let i = 0; i < n; i++) if (roomBet(c, c.sides, c.sides[0].key, 500,
      { side:((i * 7919) % n) / n, pick:((i * 104729) % n) / n, stake:0 }).side.key === c.sides[0].key) fav += 1;
    return fav / n;
  };
  assert.ok(Math.abs(share(contest) - 0.7) < 0.02);
  const wide = { sides:ROSTER.map(player => ({ key:player, players:[player] })) };
  assert.ok(Math.abs(share(wide) - 0.35) < 0.02);
});
