import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AWARDS, AWARD_VALUES, AWARD_LADDER, BUILTIN_EVENTS, CHIP_MIN, CHIP_SET, CHIP_RESERVE, EMPTY_STATE, POKER_CONFIG,
  POKER_LEVELS, ROSTER, allEventsOf, awardTable, computeStandings, migrateAwardLadder, pokerClock, pokerDeal,
  pokerDistribution, pokerInventory, pokerSeatChips, pokerSeatShort, pokerTableDeal, raceOffText,
} from "../shared/core.js";
import { hydrateStoredState } from "../worker/state.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { pokerTickerItems } from "../src/features/tv/tvModel.js";

/* Oct 14 economy (Brandon's calls after the economy simulation): awards
   x1.5 with the start at 1,000, and a finale dealt from his own chip case
   (a Slowplay set) with the 5s open and the 1s left in the case. */

const gm = (extra = {}) => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:null, deviceId:"gm",
  actionId:`g${Math.random()}`, ...extra });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const sum = chips => chips.reduce((total, chip) => total + chip.v * chip.n, 0);
const count = (chips, v) => chips.find(chip => chip.v === v)?.n || 0;
const dealable = Object.fromEntries(POKER_CONFIG.denominations.map(v => [v, CHIP_SET[v] - (CHIP_RESERVE[v] || 0)]));

/* ── the ladder ── */
test("the award ladder is x1.5: 600 / 1,200 / 1,800 / 2,400, 2nd half, 3rd a quarter rounded to 100s", () => {
  assert.deepEqual(AWARDS, { 600:[600, 300, 200], 1200:[1200, 600, 300], 1800:[1800, 900, 500], 2400:[2400, 1200, 600] });
  assert.deepEqual(AWARD_VALUES, [600, 1200, 1800, 2400]);
  for (const table of Object.values(AWARDS)) assert.ok(table.every(pts => pts % 100 === 0));
  const value = id => BUILTIN_EVENTS.find(ev => ev.id === id);
  for (const [session, pts] of [["fri", 600], ["sam", 1200], ["sap", 1800], ["san", 2400]])
    for (const ev of BUILTIN_EVENTS.filter(item => item.session === session)) assert.equal(ev.value, pts, ev.id);
  assert.equal(value("karaoke").value, 600, "Karaoke is Friday's 600");
  assert.deepEqual(awardTable(value("bball5")), [1200, 0, 0], "5v5 pays winners only");
  assert.deepEqual(awardTable(value("ragecage")), [2400, 2400, 600], "Rage Cage pays 1st and 2nd the same");
  assert.equal(EMPTY_STATE.awardLadder, AWARD_LADDER);
  const fresh = structuredClone(EMPTY_STATE);
  act(fresh, "addEvent", { ev:{ id:"cornhole", name:"Cornhole", value:600, kind:"solo" } });
  assert.match(applyAction(fresh, "addEvent", { ev:{ id:"old", name:"Old", value:400, kind:"solo" } }, gm()).error,
    /payout ladder/, "an old ladder value is no longer a value");
});

/* ── the migration ── */
test("a stored custom event or value edit on the old ladder moves once on hydration, and pays", () => {
  const stored = structuredClone(EMPTY_STATE);
  delete stored.awardLadder;
  stored.customEvents = [
    { id:"c400", custom:true, name:"Cornhole", value:400, kind:"solo" },
    { id:"c1200", custom:true, name:"Darts", value:1200, kind:"solo" },
    { id:"cpays", custom:true, name:"Odd", value:1600, kind:"solo", pays:[1600, 1600, 400] },
  ];
  stored.eventEdits = { putt:{ value:800 }, trivia:{ value:1200, name:"Pub Quiz" }, die:{ desc:"Same text" } };
  const state = hydrateStoredState(stored);
  assert.equal(state.awardLadder, AWARD_LADDER);
  const ev = id => allEventsOf(state).find(item => item.id === id);
  assert.equal(ev("c400").value, 600);
  assert.deepEqual(awardTable(ev("c400")), [600, 300, 200], "a stored 400 never pays [0, 0, 0]");
  assert.equal(ev("c1200").value, 1800, "the old Saturday afternoon is the new one");
  assert.deepEqual(awardTable(ev("cpays")), [2400, 2400, 600]);
  assert.equal(ev("putt").value, 1200);
  assert.deepEqual([ev("trivia").value, ev("trivia").name], [1800, "Pub Quiz"]);
  assert.equal(ev("die").value, 600, "an edit without a value keeps the built-in's");
  /* once only: a second hydration leaves the new values alone (1,200 is legal on both ladders) */
  const again = hydrateStoredState(structuredClone(state));
  assert.deepEqual(again.customEvents.map(item => item.value), [600, 1800, 2400]);
  assert.equal(again.eventEdits.putt.value, 1200);
  /* a fresh state is already on the ladder */
  const today = structuredClone(EMPTY_STATE);
  today.customEvents = [{ id:"new", custom:true, name:"New", value:1200, kind:"solo" }];
  assert.equal(migrateAwardLadder(today).customEvents[0].value, 1200);
  /* a posted result is derived: it pays what the moved event pays */
  const posted = hydrateStoredState({ ...structuredClone(stored), live:true,
    results:{ c400:{ slots:[[ROSTER[0]], [ROSTER[1]], [ROSTER[2]]], ts:1, revision:1 } } });
  assert.equal(computeStandings(posted).find(row => row.player === ROSTER[0]).awardPts, 600);
});

/* ── the blinds ── */
test("ten 12-minute levels; the 5s race off after level 2 and the 25s after level 5", () => {
  assert.deepEqual(POKER_LEVELS.map(level => `${level.sb}/${level.bb}`),
    ["10/20", "25/50", "50/100", "100/200", "150/300", "200/400", "300/600", "500/1000", "800/1600", "1000/2000"]);
  assert.ok(POKER_LEVELS.every(level => level.mins === 12));
  assert.deepEqual(POKER_LEVELS.map(raceOffText), [null, null, "Race off the 5s", null, null, "Race off the 25s", null, null, null, null]);
  /* every blind is made of the chips still in play at its level */
  POKER_LEVELS.forEach((level, index) => {
    const smallest = index >= 5 ? 100 : index >= 2 ? 25 : 5;
    assert.equal(level.sb % smallest, 0, `level ${index + 1}`);
  });
  const state = structuredClone(EMPTY_STATE);
  act(state, "pokerSetup");
  act(state, "pokerStart");
  const at = pokerClock(state.poker, state.poker.startedAt + 2 * 12 * 60000 + 1000);
  assert.equal(at.idx, 2);
  assert.equal(raceOffText(at), "Race off the 5s", "the clock carries the level's note");
  const ticker = pokerTickerItems(state, state.poker.startedAt + 12 * 60000 + 1000);
  assert.ok(ticker.some(item => JSON.stringify(item).includes("race off the 5s")), "the ticker's next level says so");
});

/* ── counts in 5s ── */
test("counts move in 5s, and so do rulings once the counts post", () => {
  assert.equal(CHIP_MIN, 5);
  assert.equal(POKER_CONFIG.countQuantum, 5);
  assert.deepEqual(POKER_CONFIG.denominations, [1000, 500, 100, 25, 5]);
  const state = structuredClone(EMPTY_STATE);
  act(state, "pokerSetup");
  act(state, "pokerStart");
  const [a, b] = ROSTER;
  assert.match(applyAction(state, "pokerCount", { player:a, count:1237 }, gm()).error, /Counts move in 5s/);
  act(state, "pokerCount", { player:a, count:1235 });
  assert.equal(state.poker.counts[a], 1235);
  let left = state.poker.total - 1235;
  ROSTER.slice(1).forEach((player, index) => {
    const share = index === ROSTER.length - 2 ? left : 1000;
    act(state, "pokerCount", { player, count:share });
    left -= share;
  });
  act(state, "pokerResult", { noScene:true });
  assert.equal(computeStandings(state).find(row => row.player === a).pts, 1235, "the count is the standing, verbatim");
  assert.match(applyAction(state, "adjust", { player:b, delta:7, reason:"Recount" }, gm()).error, /Counts move in 5s/);
  act(state, "adjust", { player:b, delta:15, reason:"Recount" });
});

/* ── the table's deal ── */
test("the deal: every seat's odd tail, one working layer smallest first, the bulk in 1000s, exact per seat", () => {
  const stacks = { a:600, b:1500, c:2400, d:3000, e:3700, f:4100, g:5200, h:6000, i:2000, j:1800, k:900, l:7400, m:8800 };
  const deal = pokerDeal(stacks);
  assert.equal(deal.ok, true);
  for (const [player, stack] of Object.entries(stacks)) assert.equal(sum(deal.seats[player]), stack, player);
  /* the small chips are spread evenly: every seat the same 5s and 25s */
  for (const chips of Object.values(deal.seats)) {
    assert.ok(count(chips, 5) >= 10, "ten 5s or more a seat");
    assert.ok(count(chips, 25) >= 6, "six 25s or more a seat");
  }
  const short = Object.entries(deal.seats).filter(([player]) => stacks[player] < POKER_CONFIG.exchangeFrom);
  assert.equal(new Set(short.map(([, chips]) => count(chips, 5))).size, 1, "short stacks share one layer of 5s");
  assert.deepEqual(deal.seats.a, [{ v:100, n:4 }, { v:25, n:6 }, { v:5, n:10 }], "600: a layer and nothing else");
  /* the reserve stays in the bank; nothing is dealt past the case */
  for (const v of POKER_CONFIG.denominations) assert.ok(count(deal.inventory, v) <= dealable[v], `${v}s`);
  assert.equal(count(deal.inventory, 1), 0, "the 1s stay in the case");
  /* pure and the same on every screen, whatever order the seats arrive in */
  const reversed = Object.fromEntries(Object.entries(stacks).reverse());
  assert.deepEqual(pokerDeal(reversed).seats, deal.seats);
});

test("the exchange pass trades leftover small chips onto the biggest stacks until the case runs out", () => {
  const stacks = { a:600, b:9000, c:14000 };
  const deal = pokerDeal(stacks);
  assert.equal(deal.ok, true);
  for (const [player, stack] of Object.entries(stacks)) assert.equal(sum(deal.seats[player]), stack);
  /* the passes run biggest first (1000s for 500s, 500s for 100s, 100s for
     25s, 25s for 5s); the last leaves fewer than five 5s in the case */
  assert.ok(deal.left[5] < 5, `the 5s are used up (${deal.left[5]} left)`);
  assert.ok(deal.left[500] < 2 || ![...deal.seats.b, ...deal.seats.c].some(chip => chip.v === 1000),
    "the spare 500s went onto the big stacks until no 1000 was left to trade");
  assert.ok(count(deal.seats.c, 500) > 10, "the biggest stack took them");
  assert.equal(sum(deal.inventory), 600 + 9000 + 14000);
  assert.equal(count(deal.seats.a, 1000), 0, "a short stack never trades");
});

/* ── past the case (Oct 23): the finale is never refused ──
   The case less the bank's reserve covers every board that dealt before,
   and those deal exactly as they did. Past it the bank lends its reserve,
   1000s first; past the whole case every chip is dealt and the rest of
   each seat that runs out is made up by hand (`short`). */
const CASE = POKER_CONFIG.denominations.reduce((total, v) => total + v * CHIP_SET[v], 0);
const DEALABLE = POKER_CONFIG.denominations.reduce((total, v) => total + v * dealable[v], 0);
const byHand = deal => Object.values(deal.short || {}).reduce((total, n) => total + n, 0);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const NEAR = [600, 1800, 3100, 4200, 4800, 5500, 6100, 6700, 7300, 7900, 9200, 11300, 13400];
const board = (stacks, players = ROSTER) => Object.fromEntries(stacks.map((stack, index) => [players[index], stack]));

test("the case: 88,250 in play less the 1s, 81,950 with the bank's reserve held back", () => {
  assert.equal(CASE, 88250);
  assert.equal(DEALABLE, 81950);
});

test("every board the case less the reserve covers deals exactly as it did on Oct 14", () => {
  /* digests of the deals the Oct 14 code made, taken before the bank could lend */
  const before = [
    [{ a:600, b:1500, c:2400, d:3000, e:3700, f:4100, g:5200, h:6000, i:2000, j:1800, k:900, l:7400, m:8800 }, "a2bbc2562543c259"],
    [{ a:600, b:9000, c:14000 }, "7ff356fe77963803"],
    [board(NEAR), "00ecf396055bd293"],
    [board([600, 2200, 4400, 5100, 6800, 8000, 9900, 12600, 15000]), "93b1502a15746793"],
  ];
  for (const [stacks, was] of before) {
    const deal = pokerDeal(stacks);
    assert.deepEqual(Object.keys(deal), ["ok", "seats", "inventory", "left"], "nothing lent, nothing by hand");
    assert.equal(digest(deal), was, `${Object.values(stacks).reduce((a, b) => a + b, 0)} deals as before`);
  }
  assert.equal(NEAR.reduce((a, b) => a + b, 0), 81900, "50 under the case less the reserve");
  const stored = pokerDistribution(Object.entries(board(NEAR)).map(([player, pts]) => ({ player, pts }))).deal;
  assert.deepEqual(Object.keys(stored), ["seats", "inventory"]);
  assert.equal(digest(stored), "cae7701289429d9f", "the stored deal is the same bytes");
});

test("a board just past the case less the reserve: the bank lends its 1000s first and keeps its change", () => {
  /* 82,500: one of the bank's three 1000s covers it */
  const over = board([...NEAR.slice(0, 12), 14000]);
  const deal = pokerDeal(over);
  assert.equal(deal.ok, true);
  assert.deepEqual(deal.lent, [{ v:1000, n:1 }]);
  assert.equal(deal.short, undefined);
  for (const [player, stack] of Object.entries(over)) assert.equal(sum(deal.seats[player]), stack, player);
  assert.equal(sum(deal.inventory), 82500);
  for (const v of [500, 100, 25, 5]) assert.ok(count(deal.inventory, v) <= dealable[v], `the bank keeps its ${v}s`);
  /* the bank lends as few as cover, biggest first: the 500s once its 1000s
     are out, its 100s, 25s and 5s (change and the race-offs) last */
  const lent = top => pokerDeal(board([...NEAR.slice(0, 12), top])).lent;
  assert.deepEqual(lent(15500), [{ v:1000, n:3 }], "84,000");
  assert.deepEqual(lent(17500), [{ v:1000, n:3 }, { v:500, n:3 }], "86,000");
  assert.deepEqual(lent(18500), [{ v:1000, n:3 }, { v:500, n:4 }, { v:100, n:1 }], "87,000");
  assert.deepEqual(lent(19700), [{ v:1000, n:3 }, { v:500, n:4 }, { v:100, n:10 }, { v:25, n:10 }], "88,200: the 5s stay");
  for (const top of [14000, 15500, 17500, 18500, 19700])
    for (const chip of lent(top)) assert.ok(chip.n <= CHIP_RESERVE[chip.v], "never more than the reserve holds");

  /* through the reducer: setup succeeds, the stored deal says what the bank
     lent, a retry changes nothing, and cancel takes it all back */
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  act(state, "adjust", { player:ROSTER[0], delta:69600, reason:"Test" });
  const total = computeStandings(state).reduce((sum, row) => sum + row.pts, 0);
  assert.equal(total, 82600);
  const setup = act(state, "pokerSetup");
  const pk = state.poker;
  assert.deepEqual(pk.deal.lent, [{ v:1000, n:1 }]);
  assert.equal(pk.deal.short, undefined);
  for (const player of ROSTER) assert.equal(sum(pokerSeatChips(pk, player)), pk.startingStacks[player], player);
  assert.deepEqual(pokerTableDeal(pk).lent, pk.deal.lent);
  assert.deepEqual(pokerInventory(pk), setup.extra.inventory);
  assert.equal(act(state, "pokerSetup").extra.unchanged, true);
  act(state, "pokerCancel");
  assert.equal(state.poker, null);
  assert.equal(computeStandings(state).reduce((sum, row) => sum + row.pts, 0), 82600);
});

test("a board past the whole case sets up anyway: every chip dealt, the biggest stack's rest by hand", () => {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  const [top, ...rest] = ROSTER;
  act(state, "adjust", { player:top, delta:24000, reason:"Test" });
  rest.slice(0, 11).forEach(player => act(state, "adjust", { player, delta:5500, reason:"Test" }));
  act(state, "adjust", { player:rest[11], delta:-700, reason:"Test" });
  const standings = computeStandings(state).map(row => [row.player, row.pts]);
  const pts = Object.fromEntries(standings);
  const adjustments = structuredClone(state.adjustments);
  const setup = act(state, "pokerSetup");
  assert.equal(setup.extra.minimumCount, 1, "the minimum stack still tops up the short stack");
  const pk = state.poker;
  assert.equal(pk.total, 97100);
  assert.equal(pk.startingStacks[rest[11]], 600);
  /* the case deals everything it holds, its reserve with it */
  assert.deepEqual(pk.deal.inventory, POKER_CONFIG.denominations.map(v => ({ v, n:CHIP_SET[v] })));
  assert.deepEqual(pk.deal.lent, POKER_CONFIG.denominations.map(v => ({ v, n:CHIP_RESERVE[v] })));
  /* and what it cannot cover is the biggest stack's, exactly the board past the case */
  assert.deepEqual(pk.deal.short, { [top]:97100 - CASE });
  assert.equal(byHand(pk.deal), pk.total - CASE);
  for (const player of ROSTER)
    assert.equal(sum(pokerSeatChips(pk, player)) + pokerSeatShort(pk, player), pk.startingStacks[player], player);
  assert.equal(pokerSeatShort(pk, top), 8850);
  assert.equal(pokerSeatShort(pk, rest[0]), 0);
  assert.deepEqual(pokerTableDeal(pk).short, pk.deal.short);
  /* the board is untouched: the stacks are the standings */
  assert.equal(pk.startingStacks[top], pts[top]);
  assert.equal(act(state, "pokerSetup").extra.unchanged, true, "a retry deals nothing new");
  const dealt = structuredClone(pk.deal);
  /* cancel reverts exactly; dealing again deals the same */
  act(state, "pokerCancel");
  assert.equal(state.poker, null);
  assert.deepEqual(state.adjustments, adjustments, "the grant goes with the table");
  assert.deepEqual(computeStandings(state).map(row => [row.player, row.pts]), standings);
  act(state, "pokerSetup");
  assert.deepEqual(state.poker.deal, dealt, "pure and deterministic");
  /* the table plays, counts post, the crown happens */
  act(state, "pokerStart");
  for (const player of ROSTER) act(state, "pokerCount", { player, count:state.poker.startingStacks[player] });
  act(state, "pokerResult", { noScene:true });
  assert.equal(computeStandings(state).find(row => row.player === top).pts, 25000, "the count is the standing, verbatim");
  act(state, "crownChampion", { champions:[top] });
  assert.equal(state.frozen, true);
});

test("a board far past the case: every seat still sits down, the case runs out, the rest is by hand", () => {
  const deep = pokerDistribution(ROSTER.map(player => ({ player, pts:20000 })));
  assert.equal(deep.ok, true);
  assert.equal(byHand(deep.deal), 13 * 20000 - CASE);
  for (const row of deep.rows) assert.equal(sum(row.denominations) + (row.short || 0), row.stack, row.player);
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  for (const player of ROSTER) act(state, "adjust", { player, delta:19000, reason:"Test" });
  act(state, "pokerSetup");
  assert.equal(state.poker.total, 260000);
  assert.equal(byHand(state.poker.deal), 260000 - CASE);
  assert.equal(sum(state.poker.deal.inventory), CASE, "every chip in the case, the 1s aside");
});

test("setup stores the deal every screen shows; a retry changes nothing; cancel clears it", () => {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  act(state, "adjust", { player:ROSTER[0], delta:2500, reason:"Test" });
  act(state, "adjust", { player:ROSTER[1], delta:-700, reason:"Test" });
  const setup = act(state, "pokerSetup");
  const pk = state.poker;
  assert.deepEqual(pk.deal, { seats:pokerDeal(pk.startingStacks).seats, inventory:setup.extra.inventory });
  assert.deepEqual(pokerInventory(pk), setup.extra.inventory);
  for (const player of ROSTER) assert.equal(sum(pokerSeatChips(pk, player)), pk.startingStacks[player], player);
  assert.equal(pk.startingStacks[ROSTER[1]], 600, "the minimum stack");
  assert.equal(act(state, "pokerSetup").extra.unchanged, true);
  /* a table stored before the deal was: the same deal, derived */
  const legacy = { ...structuredClone(pk) };
  delete legacy.deal;
  assert.deepEqual(pokerTableDeal(legacy), pk.deal);
  act(state, "pokerCancel");
  assert.equal(state.poker, null);
  assert.equal(computeStandings(state).find(row => row.player === ROSTER[1]).pts, 300, "the grant goes with the table");
});

/* Whole weekends to the deal through the real reducers (QA's fast-forward),
   in every roster shape the simulation ran: always dealable from the case
   less the bank's reserve, every seat exact, the small chips even. */
const SCENARIOS = [{ out:0, away:0 }, { out:1, away:0 }, { out:3, away:0 }, { out:0, away:1 }, { out:3, away:1 }];
test("seeded full weekends always deal from the case less the reserve", () => {
  let runs = 0;
  for (const { out, away } of SCENARIOS) {
    for (let seed = 1; seed <= 4; seed++) {
      const state = structuredClone(EMPTY_STATE);
      ROSTER.slice(13 - out).forEach(player => act(state, "setOut", { player, out:true }));
      ROSTER.slice(0, away).forEach(player => act(state, "setAway", { player, away:true }));
      act(state, "qaAdvance", { target:"poker:set", seed:seed * 7919 + out * 31 + away });
      const pk = state.poker;
      const seats = Object.keys(pk.startingStacks);
      assert.equal(seats.length, 13 - out - away);
      assert.ok(pk.deal, "the table stores its deal");
      /* nothing lent and nothing by hand: the sums below hold only then */
      assert.deepEqual(Object.keys(pk.deal), ["seats", "inventory"], `seed ${seed}: ${pk.total}`);
      for (const player of seats) assert.equal(sum(pk.deal.seats[player]), pk.startingStacks[player], `${player} exact`);
      assert.equal(sum(pk.deal.inventory), pk.total);
      for (const v of POKER_CONFIG.denominations)
        assert.ok(count(pk.deal.inventory, v) <= dealable[v], `${v}s within the case (seed ${seed}, ${out} out, ${away} away)`);
      const fives = seats.map(player => count(pk.deal.seats[player], 5));
      assert.ok(Math.min(...fives) >= 10, "every seat a layer of 5s");
      runs += 1;
    }
  }
  assert.equal(runs, SCENARIOS.length * 4);
});
