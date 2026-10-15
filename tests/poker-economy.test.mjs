import test from "node:test";
import assert from "node:assert/strict";
import {
  AWARDS, AWARD_VALUES, AWARD_LADDER, BUILTIN_EVENTS, CHIP_MIN, CHIP_SET, CHIP_RESERVE, EMPTY_STATE, POKER_CONFIG,
  POKER_LEVELS, ROSTER, allEventsOf, awardTable, computeStandings, migrateAwardLadder, pokerClock, pokerDeal,
  pokerDistribution, pokerInventory, pokerSeatChips, pokerTableDeal, raceOffText,
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

test("a board the case cannot cover is refused with the commissioner's reason", () => {
  const deep = pokerDistribution(ROSTER.map(player => ({ player, pts:20000 })));
  assert.equal(deep.ok, false);
  assert.match(deep.errors[0], /chip case can't cover/);
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  for (const player of ROSTER) act(state, "adjust", { player, delta:19000, reason:"Test" });
  assert.match(applyAction(state, "pokerSetup", {}, gm()).error, /chip case can't cover/);
  assert.equal(state.poker, null);
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
