/* Gags (Oct 8; the bits since Oct 10, features/gags): the room's moments,
   derived from the record. The win/loss timeline (contests, free-for-all
   results, heats, an event counted once, a correction that rewinds a
   contest, a shelved event, the finale); the five triggers (an upset from
   the stored odds, a run of straight wins, a new leader and a new last
   place after a posted result, a big losing bet of 1,000 or more), their
   thresholds and one moment per write in priority order; which bit plays
   (seeded by the write, no repeats across the weekend); the windows and
   who owns the TV after one, the face-off waiting it out, the switch, a
   frozen board and the poker table, a win song walking out first; the
   phones a moment plays on, only from a fresh frame, and the receipt
   after it; the highlight reel's turn; the QA test and both actions'
   gating; the room's cues; and the TV's, the phone's and the QA
   console's real markup. */
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

const {
  EMPTY_STATE, ROSTER, RESET_PROGRESS_CONFIRMATION, RESET_PROGRESS_PRESERVED_KEYS, allEventsOf, computeStandings, makeBracket,
  resolveCurrentContest,
} = await import("../shared/core.js");
const { QA_PROGRESS_KEYS } = await import("../shared/qa.js");
const shared = await import("../shared/gags.js");
const { GAG_BITS, GAG_SHAPES, GAG_TEST_AMOUNT, gagShapeOf, gagTestCast } = shared;
const { applyAction } = await import("./support/confirmed-start.mjs");
const gags = await import("../src/features/gags/gagModel.js");
const {
  BIG_LOSS_MIN, GAG_TEST_LEAD_MS, GAG_TRIGGERS, LEADER_FACT, RESULT_GAG_AT_MS, RESULT_GAG_END_MS, STREAK_MIN, TRIGGER_SHAPE, UPSET_FACT,
  aloneFirst, aloneLast, gagAt, gagAudience, gagCast, gagForPlayer, gagHoldMs, gagLamp, gagPlan, gagWrites, latestGag, lossFact,
  momentLog, nextGagEdge, recentFor, resultGagAt, streakFact, testGag, winStreaks, writeResults,
} = gags;
const { BIT_OUT_MS, LETTER_LAND_MS, READ_MS, bitById, bitsOf, pickBit, poolKey, poolOf, isTeamBit, TEAM_MAX } = await import("../src/features/gags/bits/registry.js");
const { HIGHLIGHT_CARD, highlightAt, highlightReel, highlightSince, withHighlightTurns } = await import("../src/features/gags/highlights.js");
const { PHONE_BIT_HOLD_MAX_MS, PHONE_BIT_HOLD_SLACK_MS, phoneBitHoldMs, phoneBitStep } = await import("../src/features/gags/phoneBit.js");
const { holdStage, stageHeld } = await import("../src/lib/motion.js");
const { TV_ADVANCE_MS, TV_AMBIENT_TURN_MS, TV_RESULT_MOMENT_MS, podiumBeatAt, resultMomentPhase } = await import("../src/features/tv/tvModel.js");
const { faceOffStart } = await import("../src/features/tv/faceOff.js");
const { WALKOUT_CLEAR_MS, WALKOUT_OF_WRITE_MS, WALKOUT_TIMING, afterWalkout, walkoutForWrite, walkoutSpan } =
  await import("../src/features/moments/walkout.js");
const room = await import("../src/features/tv/roomSound.js");
const { bitCues } = await import("../src/features/tv/bitSound.js");
const kit = await import("../src/lib/soundKit.js");
const { tvGags } = await import("../src/features/director/tvSheetModel.js");
const scenarios = await import("../dev/fit/scenarios.js");

let serial = 0;
const fresh = () => structuredClone(EMPTY_STATE);
const ev = (s, id) => allEventsOf(s).find(item => item.id === id);
const current = (s, id) => resolveCurrentContest(s, ev(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = (extra = {}) => ({ isGm:true, player:"Brandon", deviceId:"gags-gm", actionId:`gag-${++serial}`, ...extra });
const guest = player => ({ isGm:false, player, deviceId:`gags-${player}`, actionId:`gag-${++serial}` });
const act = (s, type, payload = {}, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (s, type, payload, ctx, pattern) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  if (pattern) assert.match(result.error, pattern);
  return result;
};
const rule = (s, player, delta) => act(s, "adjust", { player, delta, reason:"setup" });
const events = s => allEventsOf(s);
const msOf = gag => bitById(gag.bit).span;

/* Beer Die as six pairs in the stored hand-drawn six: play-in 1 is team 3
   (Adi, Chiang) against team 4 (Richard, Allan), play-in 2 team 2 (Khoa,
   Chinh) against team 5 (Henry, Ben); team 0 (Brandon, Evan) and team 1
   (Eyob, Sahil) wait in the semifinals. Jeremy sits out. */
const TEAM = Array.from({ length:6 }, (_, key) => ROSTER.slice(key * 2, key * 2 + 2));
function dieBoard(setup = () => {}) {
  const s = fresh();
  s.live = true;
  setup(s);
  s.draws.die = { id:"draw-die", ts:1, teams:TEAM.map(players => ({ players:[...players] })) };
  s.brackets.die = makeBracket(6);
  act(s, "announceEvent", { evId:"die" });
  return s;
}
/* record the current contest's winner (locking its market first) */
function decide(s, evId, winner, extra = {}) {
  later(1000);
  if (current(s, evId).phase === "betting-open") act(s, "lockAndStart", { evId, ...refs(current(s, evId)) });
  later(1000);
  const c = current(s, evId);
  return act(s, "recordContestWinner", { evId, ...refs(c), winner, ...extra });
}
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
const matchBet = (s, key, stake) => ({ wager:{ kind:"match", eventId:"die", evName:"Beer Die Doubles", stake,
  ...refs(current(s, "die")), match:current(s, "die").match, teamIdx:key, drawId:"draw-die" } });
const outright = (c, pick, stake) => ({ wager:{ kind:"outright", eventId:c.eventId || "putt", evName:"Long Putt", ...refs(c), pick,
  pickPlayers:[pick], stake } });
const results = (s, write) => Object.fromEntries(writeResults(s, write));
const newest = s => gagWrites(s, events(s)).at(-1);
const posted = (s, evId) => Number(s.results[evId].confirmedAt);
/* the newest write's moment, whatever the switch and the lifecycle say */
const lastMoment = s => momentLog(s, events(s)).at(-1)?.moment || null;
/* the underdogs of play-in 1: Richard and Allan ruled 500 up each */
const upsetBoard = (setup = () => {}) => dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); setup(state); });

/* ── the record ── */

test("each recorded contest: W to the side that won, L to the side it beat, nobody else", () => {
  const s = dieBoard();
  decide(s, "die", 3);
  const write = newest(s);
  assert.equal(write.type, "contest");
  assert.deepEqual(results(s, write), { Adi:"W", Chiang:"W", Richard:"L", Allan:"L" });
  assert.equal(write.at, s.eventOps.die.lastContest.decidedAt);
  decide(s, "die", 5);
  assert.deepEqual(results(s, newest(s)), { Henry:"W", Ben:"W", Khoa:"L", Chinh:"L" });
});

test("heats: the winner W, who did not qualify L, the other qualifiers neither", () => {
  const s = fresh();
  s.live = true;
  act(s, "announceAndDraw", { evId:"beerio", cfg:{ nGroups:4, advance:2 } });
  const heat = current(s, "beerio");
  assert.equal(heat.kind, "heat");
  const [winner, also, ...rest] = heat.sides.map(side => side.key);
  later(1000);
  act(s, "lockAndStart", { evId:"beerio", ...refs(heat) });
  later(1000);
  act(s, "recordContestWinner", { evId:"beerio", ...refs(current(s, "beerio")), winner, qualifiers:[winner, also] });
  const map = results(s, newest(s));
  assert.equal(map[winner], "W");
  assert.equal(map[also], undefined, "through, but not the heat's win");
  rest.forEach(player => assert.equal(map[player], "L", player));
});

test("an event played as contests counts through them, never twice through a result posted later", () => {
  const s = dieBoard();
  [3, 2, 3, 2].forEach(key => decide(s, "die", key));
  decide(s, "die", 3);                     /* the final, its result not posted with it */
  later(6000);
  act(s, "saveResult", { evId:"die", slots:[TEAM[3], TEAM[2], [...TEAM[0], ...TEAM[1]]] });
  const writes = gagWrites(s, events(s)).filter(item => item.ev.id === "die");
  assert.deepEqual(writes.map(item => item.type), ["contest", "contest", "contest", "contest", "contest", "result"]);
  assert.deepEqual(results(s, writes.at(-1)), {}, "the result adds no win or loss of its own");
  assert.deepEqual(winStreaks(s, events(s)).at(-2).reached.map(item => item.player), ["Adi", "Chiang"],
    "the streak rode the final's own write");
});

test("a correction that rewinds a contest takes its win back", () => {
  const s = dieBoard();
  decide(s, "die", 3);
  decide(s, "die", 2);
  decide(s, "die", 3);
  const streak = player => {
    let run = 0;
    for (const step of winStreaks(s, events(s))) { const value = step.results.get(player); if (value) run = value === "W" ? run + 1 : 0; }
    return run;
  };
  assert.equal(streak("Adi"), 2);
  const top = s.eventOps.die.contestStack.at(-1);
  later(2000);
  act(s, "undoLastContest", { evId:"die", contestId:top.id, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(streak("Adi"), 1, "the semifinal's win is gone with it");
  assert.equal(gagWrites(s, events(s)).some(item => item.entry?.id === top.id), false);
});

test("a shelved event and the poker finale never count", () => {
  const s = dieBoard();
  decide(s, "die", 3);
  decide(s, "die", 2);
  later(1000);
  act(s, "shelve", { id:"die", on:true, confirmReturn:true });
  assert.equal(gagWrites(s, events(s)).length, 0);
  assert.deepEqual(momentLog(s, events(s)), []);
  const poker = fresh();
  poker.results.poker = { slots:[["Adi"]], stacks:{ Adi:9000 }, ts:Date.now(), confirmedAt:Date.now(), revision:1 };
  assert.equal(gagWrites(poker, events(poker)).length, 0);
});

/* ── the five triggers ── */

test("an upset: the stored odds named the winner the underdog, both sides cast; the favorite winning is no moment", () => {
  const upset = upsetBoard();
  assert.equal(current(upset, "die").odds.underdog, 3);
  decide(upset, "die", 3);
  const gag = latestGag(upset, events(upset));
  assert.deepEqual([gag.trigger, gag.shape, gag.fact], ["upset", "versus", UPSET_FACT]);
  assert.deepEqual(gag.players, TEAM[3]);
  assert.equal(gag.name, "Adi & Chiang");
  assert.deepEqual(gag.beaten, TEAM[4]);
  assert.deepEqual(gagCast(gag), { a:TEAM[3], b:TEAM[4] }, "the winners are the bit's a, the side they beat its b");
  assert.ok(GAG_BITS.versus.includes(gag.bit));
  const decided = upset.eventOps.die.lastContest.decidedAt;
  assert.equal(gag.start, decided + TV_ADVANCE_MS, "after the decided contest's moment");
  assert.equal(gag.ms, msOf(gag), "as long as its bit");
  assert.equal(gag.end, gag.start + gag.ms);
  const chalk = upsetBoard();
  decide(chalk, "die", 4);
  assert.equal(latestGag(chalk, events(chalk)), null);
});

test("an upset in a two-sided game played as one result (the full court), over its result's podium", () => {
  const s = fresh();
  s.live = true;
  const left = ROSTER.slice(0, 7), right = ROSTER.slice(7);
  right.forEach(player => rule(s, player, 500));
  s.draws.bball5 = { id:"draw-court", ts:1, teams:[{ players:[...left] }, { players:[...right] }] };
  playFfa(s, "bball5", [left]);
  assert.equal(s.eventOps.bball5.odds["ffa:bball5:draw-court"].underdog, 0);
  const gag = latestGag(s, events(s));
  assert.deepEqual([gag.trigger, gag.shape], ["upset", "versus"]);
  assert.deepEqual(gag.players, left);
  assert.deepEqual(gag.beaten, right);
  assert.equal(gag.start, posted(s, "bball5") + resultGagAt(gag.ms));
});

test("a streak: the write that brings a run of straight wins to three, lettered with the side that made it, and again at four", () => {
  const s = dieBoard();
  decide(s, "die", 3);                     /* Adi and Chiang: 1 */
  decide(s, "die", 2);
  decide(s, "die", 3);                     /* 2 */
  assert.equal(latestGag(s, events(s)), null, "two in a row is not a streak");
  decide(s, "die", 2);
  decide(s, "die", 3, { postResult:true }); /* 3, and the final posts the result in the same write */
  const steps = winStreaks(s, events(s));
  assert.deepEqual(steps.at(-1).reached, [{ player:"Adi", count:3 }, { player:"Chiang", count:3 }]);
  const gag = latestGag(s, events(s));
  assert.deepEqual([gag.trigger, gag.shape, gag.count, gag.fact], ["streak", "win", STREAK_MIN, "3 in a row"]);
  assert.deepEqual(gag.players, ["Adi", "Chiang"]);
  assert.equal(gag.name, "Adi & Chiang", "a whole side on the same run letters the side");
  assert.equal(gag.write, "result:die", "the final and the result it posted are one write");
  assert.ok(GAG_BITS.win.includes(gag.bit));
  assert.equal(gagWrites(s, events(s)).filter(item => item.ev.id === "die").length, 5, "four contests and one result, never six");
  /* again at four: Adi alone wins the next free-for-all */
  playFfa(s, "putt", [["Adi"], ["Sahil"], ["Evan"]]);
  const four = latestGag(s, events(s));
  assert.deepEqual([four.trigger, four.count, four.fact, four.name], ["streak", 4, "4 in a row", "Adi"]);
  assert.deepEqual(four.players, ["Adi"]);
  assert.equal(streakFact(7), "7 in a row");
});

test("a free-for-all result: W to 1st, L to everyone else who played; Away never counts; three in a row is a streak", () => {
  const s = fresh();
  s.live = true;
  act(s, "setAway", { player:"Jeremy", away:true });
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]]);
  const map = results(s, newest(s));
  assert.equal(map.Khoa, "W");
  assert.equal(map.Adi, "L", "2nd lost to the winner");
  assert.equal(map.Evan, "L");
  assert.equal(map.Jeremy, undefined, "away, not played");
  assert.equal(Object.values(map).filter(value => value === "L").length, 11);
  playFfa(s, "where", [["Khoa"], ["Sahil"], ["Evan"]]);
  assert.notEqual(latestGag(s, events(s))?.trigger, "streak");
  playFfa(s, "ragecage", [["Khoa"], ["Ben"], ["Adi"]]);
  const gag = latestGag(s, events(s));
  assert.equal(gag.trigger, "streak", "a streak outranks the lead it also keeps");
  assert.deepEqual([gag.players, gag.count, gag.name], [["Khoa"], 3, "Khoa"]);
});

test("a new leader: a posted result leaves a different player alone at the top; a lead kept, a tie or a contest write is none", () => {
  const s = fresh();
  s.live = true;
  playFfa(s, "putt", [["Evan"], ["Adi"], ["Ben"]]);
  const gag = latestGag(s, events(s));
  assert.deepEqual([gag.trigger, gag.shape, gag.players, gag.name, gag.fact], ["leader", "win", ["Evan"], "Evan", LEADER_FACT]);
  assert.ok(GAG_BITS.win.includes(gag.bit));
  assert.equal(gag.start, posted(s, "putt") + resultGagAt(gag.ms), "over the result's podium");
  playFfa(s, "where", [["Evan"], ["Sahil"], ["Khoa"]]);
  assert.equal(latestGag(s, events(s)), null, "Evan was alone at the top and still is");
  const tie = fresh();
  tie.live = true;
  rule(tie, "Khoa", 400);
  playFfa(tie, "putt", [["Evan"], ["Adi"], ["Ben"]]);
  assert.equal(latestGag(tie, events(tie)), null, "Evan ties Khoa: nobody alone at the top");
  /* a contest's bets can move the lead, but only a posted result names a new leader */
  const bets = dieBoard();
  act(bets, "placeWager", matchBet(bets, 3, 500), guest("Jeremy"));
  decide(bets, "die", 3);
  assert.equal(aloneFirst(Object.fromEntries(computeStandings(bets).map(row => [row.player, row.pts]))), "Jeremy");
  assert.equal(latestGag(bets, events(bets)), null);
  assert.equal(aloneFirst({ a:2, b:1 }), "a");
  assert.equal(aloneFirst({ a:2, b:2 }), null);
});

test("a big losing bet: one bettor's net loss on the write, 1,000 or more; the biggest loser plays it", () => {
  assert.equal(BIG_LOSS_MIN, 1000);
  const s = dieBoard(state => { rule(state, "Jeremy", 2000); rule(state, "Henry", 2000); });
  act(s, "placeWager", matchBet(s, 4, 1200), guest("Jeremy"));
  act(s, "placeWager", matchBet(s, 4, 1000), guest("Henry"));
  act(s, "placeWager", matchBet(s, 3, 300), guest("Brandon"));
  decide(s, "die", 3);
  const gag = latestGag(s, events(s));
  assert.deepEqual([gag.trigger, gag.shape, gag.players, gag.amount, gag.name, gag.fact],
    ["bigloss", "loss", ["Jeremy"], 1200, "Jeremy", "-1,200"]);
  assert.deepEqual(gagCast(gag), { a:["Jeremy"], b:[] });
  assert.ok(GAG_BITS.loss.includes(gag.bit));
  assert.equal(lossFact(12500), "-12,500");
  /* under the line: no moment */
  const small = dieBoard(state => rule(state, "Jeremy", 2000));
  act(small, "placeWager", matchBet(small, 4, BIG_LOSS_MIN - 100), guest("Jeremy"));
  decide(small, "die", 3);
  assert.equal(latestGag(small, events(small)), null, "900 is not a big losing bet");
});

test("a big losing bet on a free-for-all is the bettor's net: a hedge that won is no loss", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Brandon", 5000);                /* the lead stays where it is */
  ["Jeremy", "Henry"].forEach(player => rule(s, player, 1000));
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]], { before:c => {
    act(s, "placeWager", outright(c, "Khoa", 500), guest("Jeremy"));
    act(s, "placeWager", outright(c, "Ben", 500), guest("Jeremy"));
    act(s, "placeWager", outright(c, "Ben", 1000), guest("Henry"));
  } });
  const gag = latestGag(s, events(s));
  assert.equal(gag.trigger, "bigloss");
  assert.deepEqual([gag.players, gag.amount], [["Henry"], 1000], "Jeremy won 1,000 and lost 500: up, not down");
});

test("a new last place: a result leaves a different player alone at the bottom, read from the board before that write", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Khoa", 2000);                   /* the lead stays where it is */
  rule(s, "Ben", -100);
  assert.equal(aloneLast(Object.fromEntries(computeStandings(s).map(row => [row.player, row.pts]))), "Ben");
  playFfa(s, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => act(s, "placeWager", outright(c, "Brandon", 200), guest("Richard")) });
  const gag = latestGag(s, events(s));
  assert.deepEqual([gag.trigger, gag.shape, gag.players, gag.name, gag.place, gag.fact],
    ["last", "loss", ["Richard"], "Richard", "13th", "13th"]);
  assert.ok(GAG_BITS.loss.includes(gag.bit));
  /* a later ruling moves the board, never the result's own before and after */
  later(500);
  rule(s, "Sahil", -900);
  const step = momentLog(s, events(s)).find(item => item.write.key === "result:putt");
  assert.deepEqual(step.moment.players, ["Richard"]);
  /* last place with the roster a player short */
  const short = fresh();
  short.live = true;
  act(short, "setOut", { player:"Jeremy", out:true });
  rule(short, "Khoa", 2000);
  rule(short, "Ben", -100);
  playFfa(short, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => act(short, "placeWager", outright(c, "Brandon", 200),
    guest("Richard")) });
  assert.equal(latestGag(short, events(short)).fact, "12th");
});

test("no new last place when last place stays, or when the bottom is shared", () => {
  const same = fresh();
  same.live = true;
  rule(same, "Khoa", 2000);
  rule(same, "Ben", -300);
  playFfa(same, "putt", [["Evan"], ["Adi"], ["Sahil"]]);
  assert.equal(latestGag(same, events(same)), null, "Ben was alone at the bottom and still is");
  const level = fresh();
  level.live = true;
  rule(level, "Khoa", 2000);
  playFfa(level, "putt", [["Evan"], ["Adi"], ["Sahil"]]);
  assert.equal(latestGag(level, events(level)), null, "nine tied at the bottom: nobody alone");
  assert.equal(aloneLast({ a:1, b:1 }), null);
  assert.equal(aloneLast({}), null);
});

test("one moment per write, in order: upset, streak, new leader, big losing bet, new last place", () => {
  assert.deepEqual(GAG_TRIGGERS, ["upset", "streak", "leader", "bigloss", "last"]);
  assert.deepEqual(TRIGGER_SHAPE, { upset:"versus", streak:"win", leader:"win", bigloss:"loss", last:"loss" });
  /* an upset that is also a third straight win: the upset */
  const both = dieBoard();
  decide(both, "die", 3);
  decide(both, "die", 2);
  decide(both, "die", 3);
  /* the other finalists ruled clear before the final's market opens: Adi and Chiang go in as its underdog */
  rule(both, "Khoa", 600);
  rule(both, "Chinh", 600);
  decide(both, "die", 2);
  assert.equal(current(both, "die").odds?.underdog, 3);
  decide(both, "die", 3, { postResult:true });
  assert.deepEqual(winStreaks(both, events(both)).at(-1).reached.map(item => item.count), [3, 3], "a streak too");
  assert.equal(latestGag(both, events(both)).trigger, "upset");
  /* an upset with a big loser: the upset */
  const loser = upsetBoard(state => rule(state, "Jeremy", 1000));
  act(loser, "placeWager", matchBet(loser, 4, 1000), guest("Jeremy"));
  decide(loser, "die", 3);
  assert.equal(latestGag(loser, events(loser)).trigger, "upset");
  /* a streak and a big loser on the same final: the streak */
  const run = dieBoard(state => rule(state, "Jeremy", 1000));
  [3, 2, 3, 2].forEach(key => decide(run, "die", key));
  act(run, "placeWager", matchBet(run, 2, 1000), guest("Jeremy"));
  decide(run, "die", 3, { postResult:true });
  assert.equal(latestGag(run, events(run)).trigger, "streak");
  /* a new leader and a new last place on one result: the leader */
  const top = fresh();
  top.live = true;
  rule(top, "Ben", -100);
  playFfa(top, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => act(top, "placeWager", outright(c, "Brandon", 200), guest("Richard")) });
  assert.deepEqual([latestGag(top, events(top)).trigger, latestGag(top, events(top)).players], ["leader", ["Evan"]]);
  /* a new leader and a big losing bet: the leader (Henry led, and his bet cost him the lead) */
  const lead = fresh();
  lead.live = true;
  rule(lead, "Henry", 1000);
  playFfa(lead, "putt", [["Evan"], ["Adi"], ["Sahil"]], { before:c => act(lead, "placeWager", outright(c, "Ben", 1000), guest("Henry")) });
  assert.deepEqual([latestGag(lead, events(lead)).trigger, latestGag(lead, events(lead)).players], ["leader", ["Evan"]]);
  /* a big losing bet and a new last place: the bet */
  const bottom = fresh();
  bottom.live = true;
  rule(bottom, "Khoa", 3000);
  rule(bottom, "Henry", 1000);
  rule(bottom, "Ben", -100);
  playFfa(bottom, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => {
    act(bottom, "placeWager", outright(c, "Brandon", 1000), guest("Henry"));
    act(bottom, "placeWager", outright(c, "Brandon", 200), guest("Richard"));
  } });
  const gag = latestGag(bottom, events(bottom));
  assert.deepEqual([gag.trigger, gag.players], ["bigloss", ["Henry"]]);
  assert.equal(momentLog(bottom, events(bottom)).filter(step => step.moment).length, 1, "one moment for the one write");
});

/* ── which bit ── */

test("which bit: its shape's pool, seeded by the write's key, so every screen picks the same", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  const gag = latestGag(s, events(s));
  assert.equal(gag.bit, pickBit("versus", gag.write, []).id, "the weekend's first versus: its key alone picks it");
  assert.equal(latestGag(structuredClone(s), events(s)).bit, gag.bit, "another screen, the same bit");
  for (const shape of GAG_SHAPES) assert.ok(bitsOf(shape).length > 0);
  assert.equal(bitsOf("idle").some(bit => GAG_BITS.versus.includes(bit.id) || GAG_BITS.win.includes(bit.id)
    || GAG_BITS.loss.includes(bit.id)), false, "idle vignettes are never a moment");
});

test("no repeats: each shape plays round its pool before a bit comes back, and never one twice running", () => {
  assert.deepEqual(recentFor([], 3), []);
  assert.deepEqual(recentFor(["a"], 3), ["a"]);
  assert.deepEqual(recentFor(["a", "b"], 3), ["a", "b"]);
  assert.deepEqual(recentFor(["a", "b", "c"], 3), ["c"], "a round's start: only the newest waits");
  assert.deepEqual(recentFor(["a", "b", "c", "b"], 3), ["b"]);
  const s = scenarios.fresh("event:pong:done");
  const log = momentLog(s, events(s));
  const moments = log.filter(step => step.moment);
  assert.ok(moments.length >= 8, `a weekend's worth of moments (${moments.length})`);
  /* each pool keeps its own round: a shape's solo bits, and its team bits
     (a moment whose larger side has 3 or more, the registry's poolOf) */
  const sidesOf = step => ({ a:step.moment.players, b:step.moment.shape === "versus" ? step.moment.beaten : [] });
  const pools = new Set(moments.map(step => poolKey(step.moment.shape, sidesOf(step))));
  /* volleyball's 3 v 3 upset plays a team bit; the pairs and the 1v1s solo ones */
  const volley = moments.find(step => step.write.ev.id === "volley" && step.moment.trigger === "upset");
  assert.ok(volley && volley.moment.players.length === 3 && isTeamBit(bitById(volley.moment.bit)), "a team of three: a team bit");
  assert.ok(moments.filter(step => Math.max(step.moment.players.length, step.moment.beaten?.length || 0) < 3)
    .every(step => !isTeamBit(bitById(step.moment.bit))), "a side of one or two: a solo bit");
  for (const key of pools) {
    const picks = moments.filter(step => poolKey(step.moment.shape, sidesOf(step)) === key);
    const shape = picks[0].moment.shape;
    const ids = picks.map(step => step.moment.bit);
    const n = poolOf(shape, sidesOf(picks[0])).length;
    assert.ok(ids.every(id => poolOf(shape, sidesOf(picks[0])).some(bit => bit.id === id)), `${key}: from its own pool`);
    ids.forEach((id, i) => { if (i) assert.notEqual(id, ids[i - 1], `${key}: ${id} twice running`); });
    for (let k = 0; k < ids.length; k += n) {
      const round = ids.slice(k, k + n);
      assert.equal(new Set(round).size, round.length, `${key}: a round of the pool repeats (${round.join(", ")})`);
    }
    /* replayed in order: each pick is the write's seed against the pool's picks before it */
    picks.forEach((step, i) => assert.equal(step.moment.bit,
      pickBit(shape, step.write.key, recentFor(ids.slice(0, i), n), sidesOf(step)).id));
  }
  assert.deepEqual(momentLog(structuredClone(s), events(s)).map(step => step.moment?.bit || null),
    log.map(step => step.moment?.bit || null), "every screen replays the same weekend");
});

/* ── when ── */

test("the windows: a contest's bit after its advance moment, a result's over its podium, lifting off as the towers re-sort", () => {
  assert.ok(RESULT_GAG_AT_MS >= podiumBeatAt(2) + 1000, "1st has stood on its podium a second");
  for (const id of [...GAG_BITS.versus, ...GAG_BITS.win, ...GAG_BITS.loss]) {
    const bit = bitById(id);
    /* the bit holds its last frame until its name has stood READ_MS */
    assert.ok(bit.span >= bit.ms && bit.span - (bit.letter.at + LETTER_LAND_MS) >= READ_MS - 1, `${id}: the name stands to be read`);
    const start = resultGagAt(bit.span);
    assert.ok(start >= RESULT_GAG_AT_MS, id);
    if (bit.span <= RESULT_GAG_END_MS - RESULT_GAG_AT_MS) assert.equal(start + bit.span, RESULT_GAG_END_MS, `${id}: ends on the sort`);
    else assert.equal(start, RESULT_GAG_AT_MS, `${id}: as early as the podium allows`);
    /* a longer one holds the towers' sort (and its sound) until it lifts off */
    const end = start + bit.span;
    assert.equal(resultMomentPhase(0, end - 1, { holdSort:true }).sorted, false, `${id}: the towers wait under it`);
    assert.equal(resultMomentPhase(0, Math.max(end, RESULT_GAG_END_MS)).sorted, true, `${id}: and sort once it lifts`);
  }
  const s = upsetBoard();
  decide(s, "die", 3);
  const plan = gagPlan(s, events(s));
  const gag = plan[0];
  assert.equal(gagAt(plan, gag.start - 1), null);
  assert.equal(gagAt(plan, gag.start)?.id, gag.id);
  assert.equal(gagAt(plan, gag.end - 1)?.id, gag.id);
  assert.equal(gagAt(plan, gag.end), null);
  assert.equal(nextGagEdge(plan, gag.start - 10), gag.start);
  assert.equal(nextGagEdge(plan, gag.start + 10), gag.end);
  assert.equal(nextGagEdge(plan, gag.end + 10), null);
  assert.match(gag.id, /^contest:die:.*:upset$/);
});

test("only the newest write plays, and the next lifecycle write takes the TV from it", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  assert.equal(latestGag(s, events(s)).trigger, "upset");
  later(2500);
  act(s, "lockAndStart", { evId:"die", ...refs(current(s, "die")) });
  assert.equal(latestGag(s, events(s)), null, "the next match locked and started");
  const t = upsetBoard();
  decide(t, "die", 3);
  decide(t, "die", 2);
  assert.equal(latestGag(t, events(t)), null, "a newer decision with no moment of its own");
});

test("the face-off waits out the bit its decision owes the room", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  const decided = s.eventOps.die.lastContest.decidedAt;
  const ms = latestGag(s, events(s)).ms;
  assert.equal(gagHoldMs(s, ev(s, "die")), ms);
  assert.equal(faceOffStart(s, ev(s, "die")), decided + TV_ADVANCE_MS + ms);
  const plain = dieBoard();
  decide(plain, "die", 3);
  assert.equal(gagHoldMs(plain, ev(plain, "die")), 0);
  assert.equal(faceOffStart(plain, ev(plain, "die")), plain.eventOps.die.lastContest.decidedAt + TV_ADVANCE_MS);
  s.gagsOff = true;
  assert.equal(faceOffStart(s, ev(s, "die")), decided + TV_ADVANCE_MS, "Gags off: the face-off keeps its time");
});

test("Gags off, a frozen board and the poker table play nothing; the winner's song walks out first", () => {
  const make = () => {
    const s = upsetBoard();
    decide(s, "die", 3);
    return s;
  };
  const off = make();
  off.gagsOff = true;
  assert.equal(latestGag(off, events(off)), null);
  assert.equal(gagHoldMs(off, ev(off, "die")), 0);
  assert.equal(gagForPlayer(off, events(off), "Adi"), null, "nor on a phone");
  const frozen = make();
  frozen.frozen = true;
  assert.equal(latestGag(frozen, events(frozen)), null);
  const table = make();
  table.poker = { id:"poker", ts:Date.now(), seats:[...ROSTER], outs:[] };
  assert.equal(latestGag(table, events(table)), null);
  assert.equal(gags.gagsAllowed({ ...table, results:{ poker:{ stacks:{} } } }), true, "a posted count frees the TV");
  const song = make();
  const decided = song.eventOps.die.lastContest.decidedAt;
  song.showControl.audio = { walkout:{ player:"Adi", trackId:null, startedAt:decided + 900, until:decided + 30900, auto:true } };
  assert.equal(latestGag(song, events(song)).start, decided + 900 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS,
    "the winner's song walks out, then the bit");
  song.showControl.audio.walkout.auto = false;
  assert.equal(latestGag(song, events(song)).start, decided + TV_ADVANCE_MS, "a song the commissioner put on is no takeover");
  song.showControl.audio.walkout = { player:"Adi", trackId:null, startedAt:decided - 20000, until:decided + 10000, auto:true };
  assert.equal(latestGag(song, events(song)).start, decided + TV_ADVANCE_MS, "a walkout long docked");
});

/* ── after the walkout ── */
const songOf = (player, startedAt) => ({ walkout:{ player, trackId:null, startedAt, until:startedAt + 30000, auto:true } });

test("a contest's bit plays once its own win song has walked out", () => {
  const s = upsetBoard();
  decide(s, "die", 3);                         /* Adi and Chiang, the underdogs: an upset */
  const decided = s.eventOps.die.lastContest.decidedAt;
  const first = latestGag(s, events(s));
  assert.equal(first.start, decided + TV_ADVANCE_MS, "before the song's write: right after the advance moment");
  s.showControl.audio = songOf("Chiang", decided + 1200);
  const span = walkoutSpan(s, events(s));
  assert.deepEqual([span.anchor, span.end], [decided + 1200, decided + 1200 + WALKOUT_TIMING.total], "the TV's walkout window");
  assert.deepEqual(walkoutForWrite(s, events(s), { at:decided, players:["Adi", "Chiang"] }), span, "either winner's song is the write's");
  const gag = latestGag(s, events(s));
  assert.equal(gag.id, first.id, "the same moment, moved");
  assert.equal(gag.bit, first.bit, "and the same bit");
  assert.equal(gag.start, span.end + WALKOUT_CLEAR_MS);
  assert.equal(gag.end, gag.start + gag.ms);
  assert.deepEqual(gagPlan(s, events(s)).map(item => item.start), [gag.start], "the plan (and its sounds) use the moved window");
  assert.equal(gagAt(gagPlan(s, events(s)), span.end - 1), null, "nothing under the walkout");
  assert.equal(walkoutForWrite(s, events(s), { at:decided - WALKOUT_OF_WRITE_MS - 1300, players:["Chiang"] }), null);
});

test("a result's bit plays after its winner's walkout, which waits for 1st on the podium", () => {
  const s = fresh();
  s.live = true;
  playFfa(s, "putt", [["Evan"], ["Adi"], ["Ben"]]);
  const at = posted(s, "putt");
  assert.equal(latestGag(s, events(s)).start, at + resultGagAt(latestGag(s, events(s)).ms));
  s.showControl.audio = songOf("Evan", at + 800);
  const span = walkoutSpan(s, events(s));
  assert.equal(span.anchor, at + podiumBeatAt(2) + 600, "the walkout holds for 1st to turn (podiumHoldUntil)");
  const gag = latestGag(s, events(s));
  assert.equal(gag.trigger, "leader");
  assert.equal(gag.start, span.end + WALKOUT_CLEAR_MS);
});

test("the next face-off waits for its decision's walkout, then the bit; a new leader's S15 moves with them", () => {
  const plain = dieBoard();
  decide(plain, "die", 3);
  const d1 = plain.eventOps.die.lastContest.decidedAt;
  assert.equal(faceOffStart(plain, ev(plain, "die")), d1 + TV_ADVANCE_MS);
  plain.showControl.audio = songOf("Adi", d1 + 1000);
  assert.equal(faceOffStart(plain, ev(plain, "die")), d1 + 1000 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS);
  assert.equal(gagHoldMs(plain, ev(plain, "die")), 0);
  const s = upsetBoard();
  decide(s, "die", 3);
  const d = s.eventOps.die.lastContest.decidedAt;
  const ms = latestGag(s, events(s)).ms;
  assert.equal(gagHoldMs(s, ev(s, "die")), ms);
  s.showControl.audio = songOf("Adi", d + 1000);
  const gag = latestGag(s, events(s));
  assert.equal(gagHoldMs(s, ev(s, "die")), gag.end - (d + TV_ADVANCE_MS), "the hold runs to the moved bit's end");
  assert.equal(faceOffStart(s, ev(s, "die")), gag.end);
  const ring = { decidedAt:d, at:d + TV_ADVANCE_MS + ms };
  const snap = { decidedAt:d, gagHold:gagHoldMs(s, ev(s, "die")) };
  assert.equal(room.leadRingMoves(ring, snap, d + 1100), gag.end);
  assert.equal(room.leadRingMoves(ring, { decidedAt:d, gagHold:ms }, d + 1100), null, "nothing moved");
  assert.equal(room.leadRingMoves(ring, { ...snap, decidedAt:d + 9000 }, d + 1100), null, "another decision");
  assert.equal(room.leadRingMoves(ring, snap, ring.at - 100), null, "already on the audio clock");
  assert.equal(afterWalkout({ anchor:20_000, end:29_100 }, 19_000), 19_000);
  assert.equal(afterWalkout({ anchor:20_000, end:29_100 }, 25_000), 29_100 + WALKOUT_CLEAR_MS);
  assert.equal(afterWalkout(null, 25_000), 25_000);
});

test("a walkout from another write never moves the bit", () => {
  const make = () => {
    const s = upsetBoard();
    decide(s, "die", 3);
    return s;
  };
  const s = make();
  const d = s.eventOps.die.lastContest.decidedAt;
  s.showControl.audio = songOf("Adi", d - 20000);
  assert.equal(walkoutForWrite(s, events(s), { at:d, players:["Adi", "Chiang"] }), null, "an earlier win's song");
  assert.equal(latestGag(s, events(s)).start, d + TV_ADVANCE_MS, "long docked: the bit keeps its time");
  const other = make();
  const d2 = other.eventOps.die.lastContest.decidedAt;
  other.showControl.audio = songOf("Evan", d2 + 1000);
  assert.equal(walkoutForWrite(other, events(other), { at:d2, players:["Adi", "Chiang"] }), null);
  assert.equal(latestGag(other, events(other)), null);
  assert.equal(faceOffStart(other, ev(other, "die")), Math.max(d2 + 1000 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS,
    d2 + TV_ADVANCE_MS + gagHoldMs(other, ev(other, "die"))), "the face-off still waits for whatever walkout holds the room");
});

test("a late walkout: the bit already up gives the room away and the face-off waits for the song", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  const d = s.eventOps.die.lastContest.decidedAt;
  const ms = latestGag(s, events(s)).ms;
  s.showControl.audio = songOf("Adi", d + 5500);
  assert.equal(latestGag(s, events(s)), null, "the bit gives way, and is never moved after the song");
  assert.equal(gagHoldMs(s, ev(s, "die")), ms, "its own window still holds the room");
  assert.equal(faceOffStart(s, ev(s, "die")), d + 5500 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS);
});

/* ── the phones ── */

test("the phones it is about: both sides of an upset, a win's winners, a loss's loser; a QA test only on the TVs", () => {
  assert.deepEqual(gagAudience({ shape:"versus", players:["Adi", "Chiang"], beaten:["Richard", "Allan"] }),
    ["Adi", "Chiang", "Richard", "Allan"]);
  assert.deepEqual(gagAudience({ shape:"win", players:["Adi", "Chiang"], beaten:[] }), ["Adi", "Chiang"]);
  assert.deepEqual(gagAudience({ shape:"loss", players:["Jeremy"], beaten:[] }), ["Jeremy"]);
  assert.deepEqual(gagAudience({ shape:"versus", test:true, players:["Adi"], beaten:["Evan"] }), []);
  assert.deepEqual(gagAudience(null), []);
  const upset = upsetBoard();
  decide(upset, "die", 3);
  for (const player of [...TEAM[3], ...TEAM[4]]) assert.ok(gagForPlayer(upset, events(upset), player), player);
  assert.equal(gagForPlayer(upset, events(upset), "Evan"), null, "a spectator's phone stays put");
  assert.equal(gagForPlayer(upset, events(upset), null), null);
  const loss = dieBoard(state => rule(state, "Jeremy", 2000));
  act(loss, "placeWager", matchBet(loss, 4, 1000), guest("Jeremy"));
  decide(loss, "die", 3);
  assert.equal(gagForPlayer(loss, events(loss), "Jeremy").trigger, "bigloss");
  assert.equal(gagForPlayer(loss, events(loss), "Adi"), null, "the winners of that contest are not the loss's");
  const qa = fresh();
  qa.live = true;
  act(qa, "qaGag", { shape:"versus" }, gm({ qa:true }));
  assert.ok(testGag(qa, events(qa)));
  for (const player of ROSTER) assert.equal(gagForPlayer(qa, events(qa), player), null, "a QA test never reaches a phone");
});

test("a phone plays its moment only from a fresh frame, at the TV's instant; it follows the state until it starts, then holds", () => {
  const moment = { id:"m1", start:10_000, end:15_000 };
  /* a phone that opens after the write: owed, never fresh, nothing */
  assert.equal(phoneBitStep(null, { owed:moment, fresh:null, now:9_000 }), null);
  assert.equal(phoneBitStep(null, { owed:moment, fresh:null, now:12_000 }), null, "nor mid-bit");
  /* the write lands fresh: latched, waiting for its instant */
  let latch = phoneBitStep(null, { owed:moment, fresh:"m1", now:5_000 });
  assert.deepEqual([latch.id, latch.held, latch.done], ["m1", false, false]);
  /* its win song's write moves it: it follows */
  const moved = { ...moment, start:19_000, end:24_000 };
  latch = phoneBitStep(latch, { owed:moved, now:6_000 });
  assert.equal(latch.moment.start, 19_000);
  /* it starts, and holds: a later write (the next contest locked) never takes it off this screen */
  latch = phoneBitStep(latch, { owed:moved, now:19_100 });
  assert.equal(latch.held, true);
  latch = phoneBitStep(latch, { owed:null, now:20_000 });
  assert.deepEqual([latch.done, latch.moment.end], [false, 24_000]);
  assert.equal(phoneBitStep(latch, { owed:null, now:24_000 }).done, true, "it leaves as the bit ends");
  /* gone before it started: gone */
  const early = phoneBitStep(null, { owed:moment, fresh:"m1", now:5_000 });
  assert.equal(phoneBitStep(early, { owed:null, now:6_000 }), null);
  /* a tap puts it away */
  const tapped = phoneBitStep(phoneBitStep(null, { owed:moment, fresh:"m1", now:11_000 }), { owed:moment, now:11_500, dismissed:"m1" });
  assert.equal(tapped.done, true);
  /* a fresh frame that is not this moment's arrival does not latch it */
  assert.equal(phoneBitStep(null, { owed:moment, fresh:"m2", now:5_000 }), null);
  /* sound on the phone's own bus, centred, open past a win song; reduced motion its one summary */
  const cues = bitCues("quickdraw", { start:50_000, bus:"you", key:"p" });
  assert.ok(cues.length > 3 && cues.every(cue => cue.bus === "you" && cue.pan === 0 && cue.open));
  assert.deepEqual(bitCues("anvil", { start:50_000, bus:"you", reduced:true }).map(cue => [cue.id, cue.bus]), [["bitClang", "you"]]);
  const source = readFileSync(new URL("../src/features/gags/phoneBit.js", import.meta.url), "utf8");
  assert.match(source, /useFreshChange\(owed\?\.id \|\| null, me \|\| null\)/, "latched on a fresh change only");
  assert.match(readFileSync(new URL("../src/features/gags/PhoneBit.jsx", import.meta.url), "utf8"),
    /useBitSound\(\{ bit, start:moment\?\.start, enabled:!!bit && !!moment, reduced, key:`phone:\$\{moment\?\.id\}`, bus:"you" \}\)/);
});

test("the bit first, then the receipt: from the fresh frame to the bit's end the phone holds the stage the receipt waits on", () => {
  const now = 1_000_000;
  assert.equal(phoneBitHoldMs({ end:now + 9_000 }, now), 9_000 + PHONE_BIT_HOLD_SLACK_MS, "to the bit's end");
  assert.equal(phoneBitHoldMs({ end:now + 90_000 }, now), PHONE_BIT_HOLD_MAX_MS, "never past the cap");
  assert.equal(phoneBitHoldMs(null, now), 0);
  assert.equal(stageHeld(), false);
  const release = holdStage("bit:test", { maxMs:phoneBitHoldMs({ end:Date.now() + 9_000 }, Date.now()) });
  assert.equal(stageHeld(), true, "the receipt waits");
  assert.equal(stageHeld(Date.now() + 9_000), true, "through the bit");
  release();
  assert.equal(stageHeld(), false, "and docks once it is over");
  const hook = readFileSync(new URL("../src/features/gags/phoneBit.js", import.meta.url), "utf8");
  assert.match(hook, /pending \? holdStage\(`bit:\$\{step\.id\}`, \{ maxMs:phoneBitHoldMs\(moment, serverNow\(\)\) \}\)/,
    "held from the latch (the fresh frame) until it is done");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /\{moment && !stageHeld && <ChipReceipt /, "the receipt docks only once the stage is free");
  const layer = readFileSync(new URL("../src/features/moments/PhoneMoments.jsx", import.meta.url), "utf8");
  const order = ["if (walkout)", "if (bit.moment)", "if (up?.role === \"player\")"].map(line => layer.indexOf(line));
  assert.ok(order.every(at => at > 0) && order[0] < order[1] && order[1] < order[2], "the walkout, then the bit, then You're up");
  assert.match(layer, /lazyPart\(\(\) => import\("\.\.\/gags\/PhoneBit\.jsx"\), "PhoneBit"\)/, "its drawing loads on first use");
  assert.match(layer, /<BitBoundary key=\{bit\.moment\.id\}><Suspense fallback=\{null\}>/,
    "a drawing that will not load costs the moment, never the app");
});

/* ── the highlight reel ── */

test("the highlight reel: the weekend's moments newest first, each with its event; none with Gags off", () => {
  const s = upsetBoard();
  decide(s, "die", 3);                     /* an upset */
  decide(s, "die", 2);
  decide(s, "die", 3);
  decide(s, "die", 2);
  decide(s, "die", 3, { postResult:true }); /* three in a row */
  const reel = highlightReel(s, events(s));
  const moments = momentLog(s, events(s)).filter(step => step.moment);
  assert.equal(reel.length, moments.length);
  assert.deepEqual(reel.map(entry => entry.write), moments.map(step => step.write.key).reverse(), "newest first");
  assert.deepEqual([reel[0].trigger, reel[0].evName, reel[0].session], ["streak", "Beer Die Doubles", ev(s, "die").session]);
  assert.equal(reel.at(-1).trigger, "upset");
  assert.ok(reel.every(entry => bitById(entry.bit) && entry.name && entry.fact));
  s.gagsOff = true;
  assert.deepEqual(highlightReel(s, events(s)), []);
});

test("a highlights turn on the server clock: the first after the newest moment replays it, then the ones before, round again", () => {
  const P = TV_AMBIENT_TURN_MS;
  const ambient = withHighlightTurns(["board", "next", "latest", "trophy", "records"], 3);
  assert.equal(ambient.at(-1), HIGHLIGHT_CARD);
  assert.deepEqual(withHighlightTurns(["board"], 0), ["board"], "no moments, no turn");
  const L = ambient.length;
  const base = 1_000 * L * P;
  const reel = [{ id:"c", at:base + 2 * P + 500 }, { id:"b", at:base - 40 * P }, { id:"a", at:base - 90 * P }];
  const turns = [];
  for (let turn = 0; turn < 4 * L + 2; turn++) {
    const now = base + turn * P + 1_000;
    const hit = highlightAt(reel, ambient, now);
    if (ambient[(1_000 * L + turn) % L] !== HIGHLIGHT_CARD) { assert.equal(hit, null); continue; }
    turns.push(hit.entry.id);
    assert.equal(hit.turnAt, Math.floor(now / P) * P);
  }
  assert.deepEqual(turns, ["c", "b", "a", "c"]);
  assert.equal(highlightAt([], ambient, base), null);
  assert.equal(highlightAt(reel, ["board"], base), null);
});

/* ── the QA console ── */

test("the shapes and their bits: the Worker's list is the registry's", () => {
  for (const shape of GAG_SHAPES) assert.deepEqual(GAG_BITS[shape], bitsOf(shape).map(bit => bit.id), shape);
  assert.deepEqual(shared.GAG_TEAM_BITS, GAG_SHAPES.flatMap(shape => bitsOf(shape)).filter(isTeamBit).map(bit => bit.id),
    "the Worker's team bits are the registry's");
  assert.equal(shared.GAG_TEAM_MAX, TEAM_MAX);
  assert.equal(gagShapeOf("anvil"), "loss");
  assert.equal(gagShapeOf("quickdraw"), "versus");
  assert.equal(gagShapeOf("nap"), null, "an idle vignette is no moment");
  assert.equal(shared.GAG_KINDS, undefined, "the four literal gags are gone");
});

test("setGags: the commissioner's switch, a boolean, idempotent, kept by a progress reset", () => {
  const s = fresh();
  assert.equal(tvGags(s).on, true, "on by default");
  refuse(s, "setGags", { on:false }, guest("Adi"), /Commissioner only/);
  refuse(s, "setGags", { on:"no" }, gm(), /on or off/);
  act(s, "setGags", { on:false });
  assert.equal(s.gagsOff, true);
  assert.equal(tvGags(s).on, false);
  assert.equal(applyAction(s, "setGags", { on:false }, gm()).extra.unchanged, true);
  act(s, "qaGag", { shape:"win" }, gm({ qa:true }));
  assert.ok(s.gagTest);
  act(s, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION }, gm({ progressReset:true }));
  assert.equal(s.gagsOff, true, "a setting survives a progress reset");
  assert.equal(s.gagTest, null, "a test does not");
  assert.ok(RESET_PROGRESS_PRESERVED_KEYS.includes("gagsOff"));
  assert.ok(QA_PROGRESS_KEYS.includes("gagTest") && !QA_PROGRESS_KEYS.includes("gagsOff"));
  act(s, "setGags", { on:true });
  assert.equal(s.gagsOff, false);
  const table = fresh();
  table.poker = { id:"poker", ts:Date.now(), seats:[...ROSTER], outs:[] };
  act(table, "setGags", { on:false });
});

test("qaGag: a named bit or a shape's Random, the commissioner with the QA capability, a stand-in cast from the board", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Khoa", 900);
  rule(s, "Adi", 400);
  rule(s, "Jeremy", -300);
  refuse(s, "qaGag", { shape:"win" }, { ...guest("Adi"), qa:true }, /Commissioner only/);
  refuse(s, "qaGag", { shape:"win" }, gm(), /QA is unavailable/);
  refuse(s, "qaGag", { bit:"spare" }, gm({ qa:true }), /Pick a bit/);
  refuse(s, "qaGag", { bit:"nap" }, gm({ qa:true }), /Pick a bit/);
  refuse(s, "qaGag", { shape:"idle" }, gm({ qa:true }), /Pick versus, win or loss/);
  refuse(s, "qaGag", {}, gm({ qa:true }), /Pick versus, win or loss/);
  act(s, "qaGag", { bit:"anvil" }, gm({ qa:true }));
  assert.deepEqual({ ...s.gagTest, at:0 }, { shape:"loss", bit:"anvil", at:0, players:["Jeremy"], beaten:[] });
  assert.equal(s.gagTest.at, Date.now());
  act(s, "qaGag", { shape:"versus" }, gm({ qa:true }));
  assert.deepEqual([s.gagTest.bit, s.gagTest.players, s.gagTest.beaten], [null, ["Jeremy"], ["Khoa"]], "the underdog beats the leader");
  act(s, "qaGag", { shape:"win" }, gm({ qa:true }));
  assert.deepEqual(s.gagTest.players, ["Khoa"]);
  assert.equal(gagTestCast(s, "spare"), null);
  assert.deepEqual(gagTestCast(s, "loss"), { players:["Jeremy"], beaten:[] });
  refuse({ ...structuredClone(s), frozen:true }, "qaGag", { shape:"win" }, gm({ qa:true }), /frozen/);
  const table = structuredClone(s);
  table.poker = { id:"poker", ts:Date.now(), seats:[...ROSTER], outs:[] };
  refuse(table, "qaGag", { bit:"anvil" }, gm({ qa:true }), /poker table has the TV/);
});

test("qaGag: a team bit plays a whole team from the board; a solo bit and Random stay one a side", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Khoa", 900);
  rule(s, "Adi", 400);
  rule(s, "Jeremy", -300);
  const board = shared.gagTestCast(s, "loss").players;
  act(s, "qaGag", { bit:"dominoes" }, gm({ qa:true }));
  const { players, beaten } = s.gagTest;
  assert.deepEqual([players.length, beaten.length], [6, 7], "the room split as the full court splits it");
  assert.equal(players[0], "Jeremy", "the underdogs from last place up");
  assert.equal(beaten[0], "Khoa", "the favorites from the leader down");
  assert.equal(new Set([...players, ...beaten]).size, 13, "nobody on both sides");
  const gag = testGag(s);
  assert.deepEqual([gag.bit, gag.players, gag.beaten], ["dominoes", players, beaten], "the TV plays every one of them");
  assert.match(gag.name, /^Team /);
  act(s, "qaGag", { bit:"pyramid" }, gm({ qa:true }));
  assert.deepEqual(s.gagTest.players, ["Khoa", "Adi", s.gagTest.players[2]], "a win's team: the top three");
  assert.equal(testGag(s).players.length, 3);
  act(s, "qaGag", { bit:"anvil" }, gm({ qa:true }));
  assert.deepEqual(s.gagTest.players, board, "a solo bit: last place alone");
  for (let i = 0; i < 8; i++) {
    later(1000);
    act(s, "qaGag", { shape:i % 2 ? "versus" : "win" }, gm({ qa:true }));
    assert.equal(isTeamBit(bitById(testGag(s).bit)), false, "Random casts one a side, so it plays a solo bit");
  }
});

test("a QA test plays its bit on the TVs just after its write, even with Gags off; Random picks the same on every TV", () => {
  const s = fresh();
  s.live = true;
  s.gagsOff = true;
  act(s, "qaGag", { bit:"roadrunner" }, gm({ qa:true }));
  const gag = testGag(s);
  assert.deepEqual([gag.bit, gag.shape, gag.fact, gag.test], ["roadrunner", "loss", lossFact(GAG_TEST_AMOUNT), true]);
  assert.equal(gag.start, s.gagTest.at + GAG_TEST_LEAD_MS);
  assert.equal(gag.end, gag.start + bitById("roadrunner").span);
  assert.equal(gagPlan(s, events(s))[0].id, gag.id);
  assert.equal(testGag({ ...s, frozen:true }), null);
  assert.equal(testGag({ ...s, gagTest:{ kind:"turkey", at:Date.now(), players:["Adi"] } }), null, "an old test plays nothing");
  assert.equal(testGag({ ...s, gagTest:{ ...s.gagTest, bit:"quickdraw" } }), null, "a bit of another shape");
  later(1000);
  act(s, "qaGag", { shape:"versus" }, gm({ qa:true }));
  const random = testGag(s);
  assert.equal(random.bit, pickBit("versus", `test:${s.gagTest.at}`).id);
  assert.equal(testGag(structuredClone(s)).bit, random.bit, "every TV picks the same");
  assert.deepEqual([random.fact, random.players, random.beaten], [UPSET_FACT, s.gagTest.players, s.gagTest.beaten]);
  act(s, "qaGag", { shape:"win" }, gm({ qa:true }));
  assert.deepEqual([testGag(s).fact, testGag(s).name], [streakFact(STREAK_MIN), s.gagTest.players[0]]);
});

test("the QA test is untouched by win songs: never moved, still never under a walkout", () => {
  const s = fresh();
  s.live = true;
  act(s, "qaGag", { shape:"versus" }, gm({ qa:true }));
  const at = s.gagTest.at;
  s.showControl.audio = songOf(s.gagTest.players[0], at - 2000);
  assert.equal(walkoutSpan(s, events(s)).end > at, true);
  assert.equal(testGag(s, events(s)), null, "a walkout on the TV over its window holds the room, as before");
  s.showControl.audio = songOf(s.gagTest.players[0], at - 30000);
  assert.equal(testGag(s, events(s)).start, at + GAG_TEST_LEAD_MS, "a docked one leaves it be, never moved");
});

test("the chase and the lamp: a versus and a win in the winner's flood color, a loss in the clay at rest", () => {
  const s = fresh();
  s.profiles.Adi = { color:"#3B6E9C" };
  for (const shape of ["versus", "win"]) {
    const lamp = gagLamp(s, { shape, players:["Adi"] });
    assert.equal(lamp.pace, "run");
    assert.match(lamp.color, /^#[0-9a-f]{6}$/i);
    assert.notEqual(lamp.color.toLowerCase(), "#3b6e9c", "the flood is lit, never the raw paint");
  }
  assert.deepEqual(gagLamp(s, { shape:"loss", players:["Adi"] }), { color:"var(--clay)", pace:"rest" });
  assert.equal(gagLamp(s, null), null);
});

/* ── sound ── */

test("the room hears the bit's own foley from the moment's start, open past a win song; reduced motion its one summary", () => {
  const gag = { id:"g1", bit:"quickdraw", start:50_000 };
  const cues = room.gagCues(gag);
  const bit = bitById("quickdraw");
  assert.deepEqual(cues.map(cue => [cue.id, cue.at]), bit.cues.map(cue => [cue.sound, 50_000 + cue.at]));
  assert.ok(cues.every(cue => cue.open && kit.isSound(cue.id) && cue.key.startsWith("gag:g1:")));
  assert.deepEqual(room.gagCues(gag, { reduced:true }).map(cue => [cue.id, cue.at]), [[bit.summary, 50_000]]);
  assert.deepEqual(room.gagCues(null), []);
  assert.deepEqual(room.gagCues({ id:"x", bit:"quickdraw" }), [], "no start, no cues");
  assert.deepEqual(room.gagCues({ id:"x", bit:"spare", start:0 }), []);
});

test("the four literal gags are gone: no turkey, pins, gutter or vultures drawn, styled or sounded", () => {
  assert.equal(Object.keys(kit.SOUNDS).some(id => /^gag[A-Z]/.test(id)), false, "no gag recipes in the kit");
  assert.equal(room.GAG_SUMMARY, undefined);
  assert.equal(gags.GAG_TIMING, undefined);
  for (const file of ["src/features/gags/TVGags.jsx", "src/features/gags/gags.css", "src/features/gags/gagModel.js"])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /turkey|gutter|tv-gag-pin|strike lane/i, file);
});

test("a lead that changes with a decided contest rings after its bit", () => {
  const prev = { announced:{}, reveals:{}, locks:{}, results:{}, drafts:{}, chips:null, leader:"Evan", frozen:false,
    poker:null, scene:null, decidedAt:1_000, gagHold:0 };
  const next = { ...prev, leader:"Sahil" };
  assert.deepEqual(room.roomCues(prev, next, { now:1_100 }).map(cue => [cue.id, cue.at]), [["S15", 1_000 + TV_ADVANCE_MS]]);
  assert.deepEqual(room.roomCues(prev, { ...next, gagHold:5_000 }, { now:1_100 }).map(cue => [cue.id, cue.at]),
    [["S15", 1_000 + TV_ADVANCE_MS + 5_000]]);
});

/* ── the real markup ── */

/* the towers' labels measure in a layout effect; the server renderer says so once per render */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { TVGag, gagVerdict } from "./src/features/gags/TVGags.jsx";
    export { TVHighlight, HIGHLIGHT_GRACE_MS } from "./src/features/gags/TVHighlight.jsx";
    export { PhoneBit, phoneBitNameFit, PHONE_BIT_NAME_W } from "./src/features/gags/PhoneBit.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("gags-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { TVMode, TVGag, gagVerdict, TVHighlight, HIGHLIGHT_GRACE_MS, PhoneBit, phoneBitNameFit, PHONE_BIT_NAME_W,
  PlayerIdentityProvider } = ui.exports;
const tv = (state, now) => {
  const list = events(state);
  const standings = computeStandings(state);
  return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { standings, state, events:list, onDeckEv:null, allTied:false, champion:null, coChamps:[],
      showControlEnabled:false, connection:{ ready:true, connected:true, status:"open", version:1 }, onExit:() => {}, now })));
};
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the TV plays the moment's bit in its window, never before or after, lettered with its name and fact", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  const gag = latestGag(s, events(s));
  const during = tv(s, gag.start + 2500);
  assert.match(during, /class="tv-takeover tv-gag is-versus"/);
  assert.match(during, /aria-label="Adi &amp; Chiang, Upset"/);
  assert.match(during, new RegExp(`data-bit="${gag.bit}"`));
  assert.match(during, /--tl:-2500ms/, "a TV joining 2.5 s in plays from there");
  assert.match(text(during), /Adi &amp; Chiang Upset/);
  assert.doesNotMatch(tv(s, gag.start - 50), /tv-gag/);
  assert.doesNotMatch(tv(s, gag.end + 50), /tv-gag/);
  s.gagsOff = true;
  assert.doesNotMatch(tv(s, gag.start + 2500), /tv-gag/, "Gags off");
});

test("the TV draws a bit moved by its walkout in the new window, never under the walkout", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  const d = s.eventOps.die.lastContest.decidedAt;
  s.showControl.audio = songOf("Adi", d + 1000);
  const gag = latestGag(s, events(s));
  assert.doesNotMatch(tv(s, d + TV_ADVANCE_MS + 2500), /tv-gag/, "its old window is the walkout's");
  assert.match(tv(s, gag.start + 2500), /class="tv-takeover tv-gag is-versus"/);
});

test("a moment plays once on a TV: given away to a late walkout, or begun before its window moved, it never comes back", () => {
  const blank = { id:null, play:false, shown:false };
  const gag = { id:"contest:die:m1:upset" };
  let v = gagVerdict(blank, gag);
  assert.equal(v.play, true);
  v = gagVerdict(v, gag, { blocked:true });
  assert.equal(v.play, false, "the walkout takes the room");
  v = gagVerdict(gagVerdict(v, null), gag);
  assert.equal(v.play, false, "never twice");
  let moved = gagVerdict(gagVerdict(blank, gag), null);
  moved = gagVerdict(moved, gag);
  assert.equal(moved.play, false, "on screen, then its window moved: not again");
  const waited = gagVerdict(gagVerdict(blank, null), gag);
  assert.equal(waited.play, true, "a moment that waited for the walkout plays in its new window");
  assert.equal(gagVerdict(blank, gag, { blocked:true }).play, false, "held at first sight: skipped, never queued");
  const walkoutSource = readFileSync(new URL("../src/features/tv/TVWalkout.jsx", import.meta.url), "utf8");
  assert.match(walkoutSource, /useWalkoutMoment\(state, events, \{ delayTo:walkoutSpan\(state, events\)\?\.anchor/,
    "the TV's walkout plays in the window the bit and the face-off wait for");
  for (const file of ["src/features/tv/faceOff.js", "src/features/moments/youreUp.js"])
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /useLiveStart\(valid \? moment\.id : null/,
      `${file}: the face-off's start follows the walkout's write until it plays`);
});

test("every moment bit on the TV: its cast, its name and fact lettered, never a joke in the copy", () => {
  const s = fresh();
  s.profiles = { Richard:{ display:"Squilliam" } };
  const draw = gag => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles },
    React.createElement(TVGag, { state:s, phase:"sap", gag:{ id:`t:${gag.bit}`, start:0, elapsed:bitById(gag.bit).still,
      ms:bitById(gag.bit).ms, end:bitById(gag.bit).ms, ...gag } })));
  for (const shape of GAG_SHAPES) for (const bit of GAG_BITS[shape]) {
    const html = draw({ bit, shape, players:["Richard", "Henry"], beaten:shape === "versus" ? ["Adi"] : [], name:"Squilliam",
      fact:shape === "loss" ? "-1,000" : "3 in a row" });
    assert.match(html, new RegExp(`class="tv-takeover tv-gag is-${shape}"`), bit);
    assert.match(html, new RegExp(`data-bit="${bit}"`));
    assert.match(text(html), shape === "loss" ? /Squilliam -1,000/ : /Squilliam 3 in a row/, bit);
    assert.match(html, /data-player="Richard"/, `${bit}: the cast is the players' chips`);
    assert.doesNotMatch(text(html), /—|!/);
  }
  assert.equal(renderToStaticMarkup(React.createElement(TVGag, { state:s, gag:{ id:"x", bit:"spare" } })), "", "an unknown bit draws nothing");
  for (const file of ["src/features/gags/TVGags.jsx", "src/features/gags/gagModel.js", "src/features/gags/gags.css", "shared/gags.js",
    "src/features/gags/TVHighlight.jsx", "src/features/gags/highlights.js", "src/features/gags/highlights.css",
    "src/features/gags/PhoneBit.jsx", "src/features/gags/phoneBit.js", "src/features/gags/phone-bit.css"])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /—/, `${file}: no em dashes`);
});

test("the TV wires the moments: a takeover with its chase, the board's busy, the face-off timed after, a winner scene allowed", () => {
  const source = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(source, /useGagWindow\(state, events, \{ now:nowOverride \}\)/);
  assert.match(source, /useGagShown\(gagWindow\.gag, \{ blocked:/);
  assert.match(source, /useGagSound\(\{ state, plan:gagWindow\.plan, gag \}\)/);
  assert.match(source, /gag && \{ takeover:"gag", chase:gagLamp\(state, gag\) \}/);
  assert.match(source, /<TVGag key=\{gag\.id\} state=\{state\} gag=\{gag\} phase=\{phase\} \/>/, "on the session's painting");
  assert.match(source, /\|\| !!showdown \|\| !!gag;/, "an update reload waits for a gap");
  const blocked = source.slice(source.indexOf("useGagShown(")).split(";")[0];
  for (const blocker of ["!!award", "!!walkoutMoment", "!!pokerMoments.takeover", "crownPlaying", "!!showdown", "!!faceOff",
    "!!ceremonyReveal", "final"])
    assert.ok(blocked.includes(blocker), blocker);
  assert.ok(blocked.includes(`(directed && showScene?.active?.kind !== "winner")`), "any other directed scene holds the room");
  const css = readFileSync(new URL("../src/features/gags/gags.css", import.meta.url), "utf8");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css) && !/rgba?\(/.test(css), "tokens only");
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*data-moment~="gag"\] > \.tv-main \{ opacity:0; \}/,
    "reduced motion keeps the board out of the still");
});

test("the TV replays a moment in its gap: a window of glass, the Replay lamp and its event, silent, holding its still", () => {
  const s = upsetBoard();
  decide(s, "die", 3);
  later(TV_RESULT_MOMENT_MS * 2);
  const reel = highlightReel(s, events(s));
  assert.equal(reel.length, 1);
  /* the live contest holds the room: no gap, no replay */
  const base = Math.ceil(Date.now() / (TV_AMBIENT_TURN_MS * 2520)) * TV_AMBIENT_TURN_MS * 2520;
  for (let turn = 0; turn < 8; turn++) assert.doesNotMatch(tv(s, base + turn * TV_AMBIENT_TURN_MS + 4000), /tv-highlight/);
  /* the event played out and posted: the TV's gap takes the replay's turn */
  for (const key of [2, 3, 2, 3]) decide(s, "die", key, key === 3 && s.eventOps.die.contestStack.length === 4 ? { postResult:true } : {});
  assert.ok(s.results.die, "Beer Die posted");
  later(TV_RESULT_MOMENT_MS * 2);
  const replays = highlightReel(s, events(s));
  assert.ok(highlightSince(s, events(s), replays) >= posted(s, "die") + TV_RESULT_MOMENT_MS, "the gap began after the result's moment");
  /* the gap's turns from now: its first highlights turn replays the newest moment */
  let found = null;
  const start = (Math.floor(Date.now() / TV_AMBIENT_TURN_MS) + 1) * TV_AMBIENT_TURN_MS;
  for (let turn = 0; turn < 10 && !found; turn++) {
    const html = tv(s, start + turn * TV_AMBIENT_TURN_MS + 4000);
    if (/data-highlight="/.test(html)) found = { html, turn };
  }
  assert.ok(found, "a highlights turn in the gap's rotation");
  assert.match(found.html, new RegExp(`data-highlight="${replays[0].bit}"`), "the newest moment first");
  assert.match(text(found.html), /Replay Beer Die Doubles/);
  assert.match(found.html, /class="tv-status is-next"/, "the info lamp");
  /* a TV that draws the turn late joins it there; past the punchline it holds the still */
  const turnAt = start + found.turn * TV_AMBIENT_TURN_MS;
  const entry = replays[0];
  const draw = now => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles },
    React.createElement(TVHighlight, { state:s, entry, turnAt, now, phase:"fri" })));
  assert.doesNotMatch(draw(turnAt + 500), /is-frozen/, "within a tick of the turn: it plays from the top");
  assert.match(draw(turnAt + 500), /--tl:0ms/);
  assert.match(draw(turnAt + bitById(entry.bit).still + 1000), /bit-layer[^"]*is-frozen/, "late: the still, held");
  assert.ok(HIGHLIGHT_GRACE_MS >= 1000);
  const source = readFileSync(new URL("../src/features/gags/TVHighlight.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /useBitSound|sound[=:]/, "silent");
  const tvSource = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(tvSource, /photoGap \? highlightReel\(state, events\) : EMPTY/, "only in a real gap");
  const css = readFileSync(new URL("../src/features/gags/highlights.css", import.meta.url), "utf8");
  const sizes = [...css.matchAll(/(?:font-size:|font:\s*\d+\s+)(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length && sizes.every(px => px >= 24), "24px and up on the canvas");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css), "tokens only");
});

test("the phone's moment: the stage across its width, the name and the fact lettered under it, a tap puts it away", () => {
  const s = fresh();
  s.profiles = { Richard:{ display:"Squilliam" }, Henry:{ display:"Henry Nguyen" } };
  const draw = moment => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles },
    React.createElement(PhoneBit, { state:s, phase:"san", moment:{ id:"p1", start:Date.now() - 3000, end:Date.now() + 2000,
      ...moment } })));
  const loss = draw({ bit:"anvil", shape:"loss", players:["Richard"], beaten:[], name:"Squilliam", fact:"-1,000" });
  assert.match(loss, /class="fd-moment fd-bit is-loss"/);
  assert.match(loss, /role="dialog"/);
  assert.match(loss, /aria-label="Squilliam, -1,000"/);
  assert.match(loss, /class="fd-show fd-bit-fact is-loss"/, "a loss's fact in the clay");
  assert.match(loss, /--tl:-3000ms/, "joined where the room is");
  assert.match(loss, /--moment-hold:5450ms/, "it leaves as the bit ends");
  assert.match(loss, /aria-label="Dismiss"/);
  assert.doesNotMatch(loss, /class="bit-words/, "the stage letters nothing at a phone's scale");
  assert.match(loss, /class="bit-layer bit-art is-anvil/);
  const versus = draw({ bit:"quickdraw", shape:"versus", players:["Henry", "Richard"], beaten:["Adi", "Chiang"],
    name:"Henry Nguyen & Squilliam", fact:"Upset" });
  assert.match(text(versus), /Henry Nguyen &amp; Squilliam Upset/);
  assert.match(versus, /data-player="Adi"/, "both sides cast");
  /* a name across the phone: one line while it reads large, else two at its last space */
  assert.deepEqual(phoneBitNameFit("Squilliam"), { size:64, lines:["Squilliam"] });
  const long = phoneBitNameFit("Les Quizerables Reunited");
  assert.deepEqual(long.lines, ["Les Quizerables", "Reunited"]);
  assert.ok(long.size * 0.52 * 15 <= PHONE_BIT_NAME_W && long.size >= 30);
  const css = readFileSync(new URL("../src/features/gags/phone-bit.css", import.meta.url), "utf8");
  const sizes = [...css.matchAll(/font-size:(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.every(px => px >= 12), "the phone's floor");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css), "tokens only");
});

test("the QA console lists every moment bit by shape, Random first, each one write", () => {
  const source = readFileSync(new URL("../src/features/qa/QASheet.jsx", import.meta.url), "utf8");
  assert.match(source, /GAG_SHAPES\.map\(shape =>/);
  assert.match(source, /label:"Random", payload:\{ shape \}/);
  assert.match(source, /bitsOf\(shape\)\.map\(bit => \(\{ key:bit\.id, label:bit\.name, payload:\{ bit:bit\.id \} \}\)\)/);
  assert.match(source, /dispatch\("qaGag", payload\)/);
  assert.doesNotMatch(source, /turkey|gutter|vultures/i, "the old four are gone");
});
