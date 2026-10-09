/* Gags (Oct 8, features/gags): the TV's bowling-alley cartoons, derived
   from the record. The win/loss timeline (contests, free-for-all results,
   heats, an event counted once, a correction that rewinds a contest, a
   shelved event, the finale), upsets from the stored odds, the gutter's
   threshold and its biggest loser, the vultures' before and after, one gag
   per write in priority order, the windows and who owns the TV after one,
   the face-off waiting it out, the switch, a frozen board and the poker
   table, a win song walking out first (the gag, the face-off and S15
   after it; a late one, someone else's), the QA test, both actions'
   gating, the room's cues, the kit's recipes, and the TV's real markup. */
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
const { GAG_KINDS, GAG_TEST_AMOUNT, gagTestCast } = await import("../shared/gags.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const gags = await import("../src/features/gags/gagModel.js");
const {
  GAG_MS, GAG_TEST_LEAD_MS, GAG_TIMING, GUTTER_MIN, RESULT_GAG_AT_MS, RESULT_GAG_END_MS, TURKEY_MIN, aloneLast, gagAt, gagHoldMs,
  gagLamp, gagPlan, gagWrites, latestGag, nextGagEdge, testGag, winStreaks, writeResults,
} = gags;
const { TV_ADVANCE_MS, RESULT_SORT_DELAY_MS, RESULT_STANDINGS_AT_MS, podiumBeatAt } = await import("../src/features/tv/tvModel.js");
const { faceOffStart } = await import("../src/features/tv/faceOff.js");
const { WALKOUT_CLEAR_MS, WALKOUT_OF_WRITE_MS, WALKOUT_TIMING, afterWalkout, walkoutForWrite, walkoutSpan } =
  await import("../src/features/moments/walkout.js");
const room = await import("../src/features/tv/roomSound.js");
const kit = await import("../src/lib/soundKit.js");
const { tvGags } = await import("../src/features/director/tvSheetModel.js");

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
const results = (s, write) => Object.fromEntries(writeResults(s, write));
const newest = s => gagWrites(s, events(s)).at(-1);

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

test("a turkey: the write that brings a run of straight wins to three, lettered with the side that made it", () => {
  const s = dieBoard();
  decide(s, "die", 3);                     /* Adi and Chiang: 1 */
  decide(s, "die", 2);
  decide(s, "die", 3);                     /* 2 */
  assert.equal(latestGag(s, events(s)), null, "two in a row is not a turkey");
  decide(s, "die", 2);
  decide(s, "die", 3, { postResult:true }); /* 3, and the final posts the result in the same write */
  const steps = winStreaks(s, events(s));
  assert.deepEqual(steps.at(-1).reached, [{ player:"Adi", count:3 }, { player:"Chiang", count:3 }]);
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "turkey");
  assert.equal(gag.count, TURKEY_MIN);
  assert.deepEqual(gag.players, ["Adi", "Chiang"]);
  assert.equal(gag.name, "Adi & Chiang", "a whole side on the same run letters the side");
  assert.equal(gag.write, "result:die", "the final and the result it posted are one write");
  assert.equal(gagWrites(s, events(s)).filter(item => item.ev.id === "die").length, 5, "four contests and one result, never six");
  /* again at four: Adi alone wins the next free-for-all */
  playFfa(s, "putt", [["Adi"], ["Sahil"], ["Evan"]]);
  const four = latestGag(s, events(s));
  assert.equal(four.kind, "turkey");
  assert.equal(four.count, 4);
  assert.deepEqual(four.players, ["Adi"]);
  assert.equal(four.name, "Adi");
});

test("a free-for-all result: W to 1st, L to everyone else who played; Away never counts", () => {
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
  /* three free-for-alls in a row: a turkey on the third */
  playFfa(s, "where", [["Khoa"], ["Sahil"], ["Evan"]]);
  assert.equal(latestGag(s, events(s))?.kind === "turkey", false);
  playFfa(s, "ragecage", [["Khoa"], ["Ben"], ["Adi"]]);
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "turkey");
  assert.deepEqual([gag.players, gag.count, gag.name], [["Khoa"], 3, "Khoa"]);
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
    "the turkey rode the final's own write");
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
  const poker = fresh();
  poker.results.poker = { slots:[["Adi"]], stacks:{ Adi:9000 }, ts:Date.now(), confirmedAt:Date.now(), revision:1 };
  assert.equal(gagWrites(poker, events(poker)).length, 0);
});

/* ── strike, gutter, vultures ── */

test("a strike: the stored odds named the winner the underdog; the favorite winning is no gag", () => {
  const upset = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  assert.equal(current(upset, "die").odds.underdog, 3);
  decide(upset, "die", 3);
  const gag = latestGag(upset, events(upset));
  assert.equal(gag.kind, "strike");
  assert.deepEqual(gag.players, TEAM[3]);
  assert.equal(gag.name, "Adi & Chiang");
  assert.deepEqual(gag.beaten, TEAM[4]);
  assert.equal(gag.beatenName, "Richard & Allan");
  const decided = upset.eventOps.die.lastContest.decidedAt;
  assert.equal(gag.start, decided + TV_ADVANCE_MS, "after the decided contest's moment");
  assert.equal(gag.end, gag.start + GAG_MS.strike);
  const chalk = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(chalk, "die", 4);
  assert.equal(latestGag(chalk, events(chalk)), null);
});

test("a strike in a two-sided game played as one result (the full court)", () => {
  const s = fresh();
  s.live = true;
  const left = ROSTER.slice(0, 7), right = ROSTER.slice(7);
  right.forEach(player => rule(s, player, 500));
  s.draws.bball5 = { id:"draw-court", ts:1, teams:[{ players:[...left] }, { players:[...right] }] };
  playFfa(s, "bball5", [left]);
  assert.equal(s.eventOps.bball5.odds["ffa:bball5:draw-court"].underdog, 0);
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "strike");
  assert.deepEqual(gag.players, left);
  assert.equal(gag.start, Number(s.results.bball5.confirmedAt) + RESULT_GAG_AT_MS);
});

test("a gutter ball: one bettor's loss on the contest, 500 or more; the biggest loser rolls", () => {
  const wager = (s, key, stake) => ({ wager:{ kind:"match", eventId:"die", evName:"Beer Die Doubles", stake, ...refs(current(s, "die")),
    match:current(s, "die").match, teamIdx:key, drawId:"draw-die" } });
  const s = dieBoard(state => { rule(state, "Jeremy", 1000); rule(state, "Henry", 1000); });
  act(s, "placeWager", wager(s, 4, 600), guest("Jeremy"));
  act(s, "placeWager", wager(s, 4, 500), guest("Henry"));
  act(s, "placeWager", wager(s, 3, 300), guest("Brandon"));
  decide(s, "die", 3);
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "gutter");
  assert.deepEqual([gag.players, gag.amount, gag.name], [["Jeremy"], 600, "Jeremy"]);
  /* under the line: no gag */
  const small = dieBoard(state => rule(state, "Jeremy", 1000));
  act(small, "placeWager", wager(small, 4, GUTTER_MIN - 100), guest("Jeremy"));
  decide(small, "die", 3);
  assert.equal(latestGag(small, events(small)), null);
});

test("a gutter ball on a free-for-all is the bettor's net: a hedge that won is no loss", () => {
  const s = fresh();
  s.live = true;
  ["Jeremy", "Henry"].forEach(player => rule(s, player, 1000));
  const outright = (c, pick, stake) => ({ wager:{ kind:"outright", eventId:"putt", evName:"Long Putt", ...refs(c), pick,
    pickPlayers:[pick], stake } });
  playFfa(s, "putt", [["Khoa"], ["Adi"], ["Evan"]], { before:c => {
    act(s, "placeWager", outright(c, "Khoa", 500), guest("Jeremy"));
    act(s, "placeWager", outright(c, "Ben", 500), guest("Jeremy"));
    act(s, "placeWager", outright(c, "Ben", 700), guest("Henry"));
  } });
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "gutter");
  assert.deepEqual([gag.players, gag.amount], [["Henry"], 700], "Jeremy won 1,000 and lost 500: up, not in the gutter");
});

test("the vultures: a result leaves a new player alone in last, read from the board before that write", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Ben", -100);
  assert.equal(aloneLast(Object.fromEntries(computeStandings(s).map(row => [row.player, row.pts]))), "Ben");
  playFfa(s, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => act(s, "placeWager", { wager:{ kind:"outright", eventId:"putt",
    evName:"Long Putt", ...refs(c), pick:"Brandon", pickPlayers:["Brandon"], stake:200 } }, guest("Richard")) });
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "vultures");
  assert.deepEqual([gag.players, gag.name, gag.place], [["Richard"], "Richard", "13th"]);
  /* a later ruling moves the board, never the result's own before and after */
  later(500);
  rule(s, "Sahil", -900);
  const step = winStreaks(s, events(s)).find(item => item.write.key === "result:putt");
  assert.equal(gags.gagForWrite(s, events(s), step.write, step.reached).players[0], "Richard");
  /* last place with the roster a player short */
  const short = fresh();
  short.live = true;
  act(short, "setOut", { player:"Jeremy", out:true });
  rule(short, "Ben", -100);
  playFfa(short, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => act(short, "placeWager", { wager:{ kind:"outright",
    eventId:"putt", evName:"Long Putt", ...refs(c), pick:"Brandon", pickPlayers:["Brandon"], stake:200 } }, guest("Richard")) });
  assert.equal(latestGag(short, events(short)).place, "12th");
});

test("no vultures when last place stays, or when the bottom is shared", () => {
  const same = fresh();
  same.live = true;
  rule(same, "Ben", -300);
  playFfa(same, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  assert.equal(latestGag(same, events(same)), null, "Ben was alone at the bottom and still is");
  const level = fresh();
  level.live = true;
  playFfa(level, "putt", [["Evan"], ["Adi"], ["Khoa"]]);
  assert.equal(latestGag(level, events(level)), null, "ten tied at the bottom: nobody alone");
  assert.equal(aloneLast({ a:1, b:1 }), null);
  assert.equal(aloneLast({}), null);
});

test("one gag per write, the rarest first", () => {
  /* a turkey and a gutter ball on the same final: the turkey */
  const s = dieBoard(state => rule(state, "Jeremy", 1000));
  [3, 2, 3, 2].forEach(key => decide(s, "die", key));
  act(s, "placeWager", { wager:{ kind:"match", eventId:"die", evName:"Beer Die Doubles", stake:900, ...refs(current(s, "die")),
    match:current(s, "die").match, teamIdx:2, drawId:"draw-die" } }, guest("Jeremy"));
  decide(s, "die", 3, { postResult:true });
  assert.equal(latestGag(s, events(s)).kind, "turkey");
  /* an upset with a big loser: the strike */
  const t = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); rule(state, "Jeremy", 1000); });
  act(t, "placeWager", { wager:{ kind:"match", eventId:"die", evName:"Beer Die Doubles", stake:800, ...refs(current(t, "die")),
    match:current(t, "die").match, teamIdx:4, drawId:"draw-die" } }, guest("Jeremy"));
  decide(t, "die", 3);
  assert.equal(latestGag(t, events(t)).kind, "strike");
  assert.deepEqual(GAG_KINDS, ["turkey", "strike", "gutter", "vultures"]);
});

/* ── when ── */

test("the windows: a contest's gag after its advance moment, a result's over the tail of its podium", () => {
  assert.ok(RESULT_GAG_AT_MS + Math.max(...Object.values(GAG_MS)) <= RESULT_STANDINGS_AT_MS + RESULT_SORT_DELAY_MS,
    "a result's gag lifts before the towers re-sort");
  assert.equal(RESULT_GAG_END_MS, RESULT_STANDINGS_AT_MS + RESULT_SORT_DELAY_MS);
  for (const kind of GAG_KINDS) {
    assert.ok(GAG_MS[kind] >= 3800 && GAG_MS[kind] <= 4800, `${kind}: about four seconds`);
    const T = GAG_TIMING[kind];
    assert.ok(T.out < T.total && T.total - T.out >= 400, `${kind} lifts off before it ends`);
  }
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
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
  assert.match(gag.id, /^contest:die:/);
});

test("only the newest write plays, and the next lifecycle write takes the TV from it", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);
  assert.equal(latestGag(s, events(s)).kind, "strike");
  later(2500);
  act(s, "lockAndStart", { evId:"die", ...refs(current(s, "die")) });
  assert.equal(latestGag(s, events(s)), null, "the next match locked and started");
  const t = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(t, "die", 3);
  decide(t, "die", 2);
  assert.equal(latestGag(t, events(t)), null, "a newer decision with no gag of its own");
});

test("the face-off waits out the gag its decision owes the room", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);
  const decided = s.eventOps.die.lastContest.decidedAt;
  assert.equal(gagHoldMs(s, ev(s, "die")), GAG_MS.strike);
  assert.equal(faceOffStart(s, ev(s, "die")), decided + TV_ADVANCE_MS + GAG_MS.strike);
  const plain = dieBoard();
  decide(plain, "die", 3);
  assert.equal(gagHoldMs(plain, ev(plain, "die")), 0);
  assert.equal(faceOffStart(plain, ev(plain, "die")), plain.eventOps.die.lastContest.decidedAt + TV_ADVANCE_MS);
  s.gagsOff = true;
  assert.equal(faceOffStart(s, ev(s, "die")), decided + TV_ADVANCE_MS, "Gags off: the face-off keeps its time");
});

test("Gags off, a frozen board and the poker table play nothing; the winner's song walks out first", () => {
  const make = () => {
    const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
    decide(s, "die", 3);
    return s;
  };
  const off = make();
  off.gagsOff = true;
  assert.equal(latestGag(off, events(off)), null);
  assert.equal(gagHoldMs(off, ev(off, "die")), 0);
  const frozen = make();
  frozen.frozen = true;
  assert.equal(latestGag(frozen, events(frozen)), null);
  const table = make();
  table.poker = { id:"poker", ts:Date.now(), seats:[...ROSTER], outs:[] };
  assert.equal(latestGag(table, events(table)), null);
  assert.equal(gags.gagsAllowed({ ...table, results:{ poker:{ stacks:{} } } }), true, "a posted count frees the TV");
  const song = make();
  const decided = song.eventOps.die.lastContest.decidedAt;
  /* (Oct 9) the winner's own song used to skip the gag outright, so with
     win songs on almost none played; it now walks out first and the gag
     follows it (the walkout tests below) */
  song.showControl.audio = { walkout:{ player:"Adi", trackId:null, startedAt:decided + 900, until:decided + 30900, auto:true } };
  assert.equal(latestGag(song, events(song)).start, decided + 900 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS,
    "the winner's song walks out, then the gag");
  song.showControl.audio.walkout.auto = false;
  assert.equal(latestGag(song, events(song)).start, decided + TV_ADVANCE_MS, "a song the commissioner put on is no takeover");
  song.showControl.audio.walkout = { player:"Adi", trackId:null, startedAt:decided - 20000, until:decided + 10000, auto:true };
  assert.equal(latestGag(song, events(song)).start, decided + TV_ADVANCE_MS, "a walkout long docked");
});

/* ── after the walkout ──
   A win song the decision (or the result) started walks out on the TV
   first; its window (walkoutSpan, the one useTvWalkout plays) is what the
   gag and the next face-off wait for. Its record lands in a second write a
   second or two after the decision's. */
const songOf = (player, startedAt) => ({ walkout:{ player, trackId:null, startedAt, until:startedAt + 30000, auto:true } });

test("a contest's gag plays once its own win song has walked out", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);                         /* Adi and Chiang, the underdogs: a strike */
  const decided = s.eventOps.die.lastContest.decidedAt;
  const first = latestGag(s, events(s));
  assert.equal(first.start, decided + TV_ADVANCE_MS, "before the song's write: right after the advance moment");
  s.showControl.audio = songOf("Chiang", decided + 1200);
  const span = walkoutSpan(s, events(s));
  assert.deepEqual([span.anchor, span.end], [decided + 1200, decided + 1200 + WALKOUT_TIMING.total], "the TV's walkout window");
  assert.deepEqual(walkoutForWrite(s, events(s), { at:decided, players:["Adi", "Chiang"] }), span, "either winner's song is the write's");
  const gag = latestGag(s, events(s));
  assert.equal(gag.id, first.id, "the same gag, moved");
  assert.equal(gag.start, span.end + WALKOUT_CLEAR_MS);
  assert.equal(gag.end, gag.start + GAG_MS.strike);
  assert.deepEqual(gagPlan(s, events(s)).map(item => item.start), [gag.start], "the plan (and its sounds) use the moved window");
  assert.equal(gagAt(gagPlan(s, events(s)), span.end - 1), null, "nothing under the walkout");
  /* within a few seconds of the write and no further */
  assert.equal(walkoutForWrite(s, events(s), { at:decided - WALKOUT_OF_WRITE_MS - 1300, players:["Chiang"] }), null);
});

test("a result's gag plays after its winner's walkout, which waits for 1st on the podium", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Ben", -100);
  playFfa(s, "putt", [["Evan"], ["Adi"], ["Ben"]], { before:c => act(s, "placeWager", { wager:{ kind:"outright", eventId:"putt",
    evName:"Long Putt", ...refs(c), pick:"Brandon", pickPlayers:["Brandon"], stake:200 } }, guest("Richard")) });
  const posted = Number(s.results.putt.confirmedAt);
  assert.equal(latestGag(s, events(s)).start, posted + RESULT_GAG_AT_MS);
  s.showControl.audio = songOf("Evan", posted + 800);
  const span = walkoutSpan(s, events(s));
  assert.equal(span.anchor, posted + podiumBeatAt(2) + 600, "the walkout holds for 1st to turn (podiumHoldUntil)");
  const gag = latestGag(s, events(s));
  assert.equal(gag.kind, "vultures", "a loser's gag rides its write's song too");
  assert.equal(gag.start, span.end + WALKOUT_CLEAR_MS);
});

test("the next face-off waits for its decision's walkout, then the gag; a new leader's S15 moves with them", () => {
  /* no gag: the walkout alone (the face-off used to play hidden under it) */
  const plain = dieBoard();
  decide(plain, "die", 3);
  const d1 = plain.eventOps.die.lastContest.decidedAt;
  assert.equal(faceOffStart(plain, ev(plain, "die")), d1 + TV_ADVANCE_MS);
  plain.showControl.audio = songOf("Adi", d1 + 1000);
  assert.equal(faceOffStart(plain, ev(plain, "die")), d1 + 1000 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS);
  assert.equal(gagHoldMs(plain, ev(plain, "die")), 0);
  /* a gag: the walkout, the gag, then the face-off */
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);
  const d = s.eventOps.die.lastContest.decidedAt;
  assert.equal(gagHoldMs(s, ev(s, "die")), GAG_MS.strike);
  s.showControl.audio = songOf("Adi", d + 1000);
  const gag = latestGag(s, events(s));
  assert.equal(gagHoldMs(s, ev(s, "die")), gag.end - (d + TV_ADVANCE_MS), "the hold runs to the moved gag's end");
  assert.equal(faceOffStart(s, ev(s, "die")), gag.end);
  /* S15, rung at the decision for the old card, moves to the new one */
  const ring = { decidedAt:d, at:d + TV_ADVANCE_MS + GAG_MS.strike };
  const snap = { decidedAt:d, gagHold:gagHoldMs(s, ev(s, "die")) };
  assert.equal(room.leadRingMoves(ring, snap, d + 1100), gag.end);
  assert.equal(room.leadRingMoves(ring, { decidedAt:d, gagHold:GAG_MS.strike }, d + 1100), null, "nothing moved");
  assert.equal(room.leadRingMoves(ring, { ...snap, decidedAt:d + 9000 }, d + 1100), null, "another decision");
  assert.equal(room.leadRingMoves(ring, snap, ring.at - 100), null, "already on the audio clock");
  /* a face-off due before a walkout began keeps its time */
  assert.equal(afterWalkout({ anchor:20_000, end:29_100 }, 19_000), 19_000);
  assert.equal(afterWalkout({ anchor:20_000, end:29_100 }, 25_000), 29_100 + WALKOUT_CLEAR_MS);
  assert.equal(afterWalkout(null, 25_000), 25_000);
});

test("a walkout from another write never moves the gag", () => {
  const make = () => {
    const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
    decide(s, "die", 3);
    return s;
  };
  const s = make();
  const d = s.eventOps.die.lastContest.decidedAt;
  s.showControl.audio = songOf("Adi", d - 20000);
  assert.equal(walkoutForWrite(s, events(s), { at:d, players:["Adi", "Chiang"] }), null, "an earlier win's song");
  assert.equal(latestGag(s, events(s)).start, d + TV_ADVANCE_MS, "long docked: the gag keeps its time");
  /* a song for someone this write did not crown, over the window: the
     gag is skipped, never moved after it */
  const other = make();
  const d2 = other.eventOps.die.lastContest.decidedAt;
  other.showControl.audio = songOf("Evan", d2 + 1000);
  assert.equal(walkoutForWrite(other, events(other), { at:d2, players:["Adi", "Chiang"] }), null);
  assert.equal(latestGag(other, events(other)), null);
  assert.equal(faceOffStart(other, ev(other, "die")), d2 + 1000 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS,
    "the face-off still waits for whatever walkout holds the room");
});

test("a late walkout: the gag already up gives the room away and the face-off waits for the song", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);
  const d = s.eventOps.die.lastContest.decidedAt;
  /* a slow speaker: the song starts 5.5 s on, half a second into the gag */
  s.showControl.audio = songOf("Adi", d + 5500);
  assert.equal(latestGag(s, events(s)), null, "the gag gives way, and is never moved after the song");
  assert.equal(gagHoldMs(s, ev(s, "die")), GAG_MS.strike, "its own window still holds the room");
  assert.equal(faceOffStart(s, ev(s, "die")), d + 5500 + WALKOUT_TIMING.total + WALKOUT_CLEAR_MS);
});

test("the QA console's test is untouched by win songs: never moved, still never under a walkout", () => {
  const s = fresh();
  s.live = true;
  act(s, "qaGag", { kind:"strike" }, gm({ qa:true }));
  const at = s.gagTest.at;
  s.showControl.audio = songOf(s.gagTest.players[0], at - 2000);
  assert.equal(walkoutSpan(s, events(s)).end > at, true);
  assert.equal(testGag(s, events(s)), null, "a walkout on the TV over its window holds the room, as before");
  s.showControl.audio = songOf(s.gagTest.players[0], at - 30000);
  assert.equal(testGag(s, events(s)).start, at + GAG_TEST_LEAD_MS, "a docked one leaves it be, never moved");
});

test("the chase and the lamp: a win in its winner's flood color, a loss in the clay at rest", () => {
  const s = fresh();
  s.profiles.Adi = { color:"#3B6E9C" };
  const win = gagLamp(s, { kind:"turkey", players:["Adi"] });
  assert.equal(win.pace, "run");
  assert.match(win.color, /^#[0-9a-f]{6}$/i);
  assert.notEqual(win.color.toLowerCase(), "#3b6e9c", "the flood is lit, never the raw paint");
  assert.deepEqual(gagLamp(s, { kind:"gutter", players:["Adi"] }), { color:"var(--clay)", pace:"rest" });
  assert.equal(gagLamp(s, null), null);
});

/* ── the controls ── */

test("setGags: the commissioner's switch, a boolean, idempotent, kept by a progress reset", () => {
  const s = fresh();
  assert.equal(tvGags(s).on, true, "on by default");
  refuse(s, "setGags", { on:false }, guest("Adi"), /Commissioner only/);
  refuse(s, "setGags", { on:"no" }, gm(), /on or off/);
  act(s, "setGags", { on:false });
  assert.equal(s.gagsOff, true);
  assert.equal(tvGags(s).on, false);
  assert.equal(applyAction(s, "setGags", { on:false }, gm()).extra.unchanged, true);
  act(s, "qaGag", { kind:"turkey" }, gm({ qa:true }));
  assert.ok(s.gagTest);
  act(s, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION }, gm({ progressReset:true }));
  assert.equal(s.gagsOff, true, "a setting survives a progress reset");
  assert.equal(s.gagTest, null, "a test does not");
  assert.ok(RESET_PROGRESS_PRESERVED_KEYS.includes("gagsOff"));
  assert.ok(QA_PROGRESS_KEYS.includes("gagTest") && !QA_PROGRESS_KEYS.includes("gagsOff"));
  act(s, "setGags", { on:true });
  assert.equal(s.gagsOff, false);
  /* the poker table never refuses the switch */
  const table = fresh();
  table.poker = { id:"poker", ts:Date.now(), seats:[...ROSTER], outs:[] };
  act(table, "setGags", { on:false });
});

test("qaGag: the commissioner with the QA capability, a known kind, a stand-in cast from the board", () => {
  const s = fresh();
  s.live = true;
  rule(s, "Khoa", 900);
  rule(s, "Adi", 400);
  rule(s, "Jeremy", -300);
  refuse(s, "qaGag", { kind:"turkey" }, { ...guest("Adi"), qa:true }, /Commissioner only/);
  refuse(s, "qaGag", { kind:"turkey" }, gm(), /QA is unavailable/);
  refuse(s, "qaGag", { kind:"spare" }, gm({ qa:true }), /turkey, strike, gutter or vultures/);
  act(s, "qaGag", { kind:"turkey" }, gm({ qa:true }));
  assert.deepEqual({ ...s.gagTest, at:0 }, { kind:"turkey", at:0, players:["Khoa"] });
  assert.equal(s.gagTest.at, Date.now());
  act(s, "qaGag", { kind:"strike" }, gm({ qa:true }));
  assert.deepEqual(s.gagTest.players, ["Jeremy", "Khoa"], "the underdog first");
  act(s, "qaGag", { kind:"gutter" }, gm({ qa:true }));
  assert.deepEqual([s.gagTest.players, s.gagTest.amount], [["Adi"], GAG_TEST_AMOUNT]);
  act(s, "qaGag", { kind:"vultures" }, gm({ qa:true }));
  assert.deepEqual(s.gagTest.players, ["Jeremy"]);
  assert.equal(gagTestCast(s, "spare"), null);
  /* never on a frozen board or at the poker table */
  refuse({ ...structuredClone(s), frozen:true }, "qaGag", { kind:"turkey" }, gm({ qa:true }), /frozen/);
  const table = structuredClone(s);
  table.poker = { id:"poker", ts:Date.now(), seats:[...ROSTER], outs:[] };
  refuse(table, "qaGag", { kind:"turkey" }, gm({ qa:true }), /poker table has the TV/);
});

test("a QA test plays its kind just after its write, even with Gags off", () => {
  const s = fresh();
  s.live = true;
  s.gagsOff = true;
  act(s, "qaGag", { kind:"vultures" }, gm({ qa:true }));
  const gag = testGag(s);
  assert.equal(gag.kind, "vultures");
  assert.equal(gag.start, s.gagTest.at + GAG_TEST_LEAD_MS);
  assert.equal(gag.end, gag.start + GAG_MS.vultures);
  assert.equal(gag.place, "13th");
  assert.ok(gag.test);
  assert.equal(gagPlan(s, events(s))[0].id, gag.id);
  assert.equal(testGag({ ...s, frozen:true }), null);
  assert.equal(testGag({ ...s, gagTest:{ kind:"spare", at:Date.now(), players:["Adi"] } }), null);
  act(s, "qaGag", { kind:"turkey" }, gm({ qa:true }));
  assert.deepEqual([testGag(s).count, testGag(s).name], [TURKEY_MIN, s.gagTest.players[0]]);
});

/* ── sound ── */

test("the room's cues land on each kind's beats from the gag's start; reduced motion is one summary sound", () => {
  const start = 50_000;
  for (const kind of GAG_KINDS) {
    const gag = { id:`g:${kind}`, kind, start };
    const cues = room.gagCues(gag);
    assert.ok(cues.length >= 3, kind);
    for (const cue of cues) {
      assert.ok(kit.isSound(cue.id), `${kind}: ${cue.id} is in the kit`);
      assert.ok(cue.at >= start && cue.at < start + GAG_MS[kind], `${kind}: ${cue.id} inside the gag`);
      assert.match(cue.key, new RegExp(`^gag:g:${kind}:`));
    }
    assert.deepEqual(room.gagCues(gag, { reduced:true }).map(cue => cue.id), [room.GAG_SUMMARY[kind]]);
  }
  const T = GAG_TIMING;
  const at = (kind, id) => room.gagCues({ id:"x", kind, start:0 }).filter(cue => cue.id === id).map(cue => cue.at);
  assert.deepEqual(at("turkey", "gagDing"), T.turkey.x, "a ding as each strike mark stamps");
  assert.deepEqual(at("turkey", "gagGobble"), [T.turkey.gobble, T.turkey.gobble2], "gobble, twice");
  assert.deepEqual(at("strike", "gagCrash"), [T.strike.hit]);
  assert.deepEqual(at("gutter", "gagClunk"), [T.gutter.drop]);
  assert.deepEqual(at("gutter", "gagTrombone"), [T.gutter.sad]);
  assert.deepEqual(at("vultures", "gagSquawk"), [T.vultures.squawk, T.vultures.squawk2]);
  assert.deepEqual(room.gagCues(null), []);
  assert.deepEqual(room.gagCues({ id:"x", kind:"spare", start:0 }), []);
});

test("a lead that changes with a decided contest rings after its gag", () => {
  const prev = { announced:{}, reveals:{}, locks:{}, results:{}, drafts:{}, chips:null, leader:"Evan", frozen:false,
    poker:null, scene:null, decidedAt:1_000, gagHold:0 };
  const next = { ...prev, leader:"Sahil" };
  assert.deepEqual(room.roomCues(prev, next, { now:1_100 }).map(cue => [cue.id, cue.at]), [["S15", 1_000 + TV_ADVANCE_MS]]);
  assert.deepEqual(room.roomCues(prev, { ...next, gagHold:GAG_MS.strike }, { now:1_100 }).map(cue => [cue.id, cue.at]),
    [["S15", 1_000 + TV_ADVANCE_MS + GAG_MS.strike]]);
});

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(v, t) { assert.ok(Number.isFinite(v) && Number.isFinite(t)); this.value = v; }
  linearRampToValueAtTime(v, t) { assert.ok(Number.isFinite(v) && Number.isFinite(t)); }
  exponentialRampToValueAtTime(v, t) { assert.ok(v > 0 && Number.isFinite(t), "exponential ramps stay above zero"); }
  cancelScheduledValues() {}
}
class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind;
    for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"])
      this[name] = new FakeParam(name === "gain" ? 1 : 0);
  }
  connect(node) { return node; }
  disconnect() { this.disconnected = (this.disconnected || 0) + 1; }
  start() {}
  stop() {}
}
class FakeContext {
  constructor() { this.currentTime = 10; this.sampleRate = 8000; this.destination = {}; this.nodes = []; }
  node(kind) { const n = new FakeNode(this, kind); this.nodes.push(n); return n; }
  createGain() { return this.node("gain"); }
  createBiquadFilter() { return this.node("filter"); }
  createDynamicsCompressor() { return this.node("comp"); }
  createConvolver() { return this.node("conv"); }
  createStereoPanner() { return this.node("pan"); }
  createOscillator() { return this.node("osc"); }
  createBufferSource() { return this.node("src"); }
  createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; }
}
test("the gag recipes: synthesized, playable, and every node released once its sources end", () => {
  const ids = ["gagStep", "gagGobble", "gagDing", "gagRoll", "gagCrash", "gagFlourish", "gagClunk", "gagTrombone", "gagWind", "gagSquawk"];
  const ctx = new FakeContext();
  const E = kit.makeEngine(ctx, { room:"san", listen:"tv" });
  const engineNodes = ctx.nodes.length;
  for (const id of ids) {
    assert.ok(kit.isSound(id), id);
    assert.ok(!kit.SOUND_IDS.includes(id), `${id} is a part, not one of the 26`);
    ctx.nodes.length = engineNodes;
    assert.ok(kit.playRecipe(E, id, 10, { step:2, ms:1200 }));
    const made = ctx.nodes.slice(engineNodes);
    const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, id);
    assert.ok(sources.every(n => typeof n.onended === "function"), `${id}: every source reports its end`);
    sources.slice(0, -1).forEach(n => n.onended());
    assert.ok(made.every(n => !n.disconnected), `${id}: held until the last source ends`);
    sources.at(-1).onended();
    assert.ok(made.every(n => n.disconnected === 1), `${id}: every node released once`);
  }
});

/* ── the TV ── */

/* the towers' labels measure in a layout effect; the server renderer says so once per render */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { TVGag, gagNameSize, gagVerdict } from "./src/features/gags/TVGags.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("gags-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(root);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const { TVMode, TVGag, gagNameSize, gagVerdict, PlayerIdentityProvider } = ui.exports;
const tv = (state, now) => {
  const list = events(state);
  const standings = computeStandings(state);
  return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { standings, state, events:list, onDeckEv:null, allTied:false, champion:null, coChamps:[],
      showControlEnabled:false, connection:{ ready:true, connected:true, status:"open", version:1 }, onExit:() => {}, now })));
};
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the TV draws the gag in its window, never before or after, lettered with a fact and a name", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);
  const gag = latestGag(s, events(s));
  const during = tv(s, gag.start + 2500);
  assert.match(during, /class="tv-takeover tv-gag is-strike"/);
  assert.match(during, /aria-label="Upset: Adi &amp; Chiang"/);
  assert.match(text(during), /UPSET Adi &amp; Chiang/);
  assert.equal((during.match(/class="tv-gag-pin"/g) || []).length, 10, "ten pins");
  assert.match(during, /--tl:-2500ms/, "a TV joining 2.5 s in plays from there");
  assert.doesNotMatch(tv(s, gag.start - 50), /tv-gag/);
  assert.doesNotMatch(tv(s, gag.end + 50), /tv-gag/);
  s.gagsOff = true;
  assert.doesNotMatch(tv(s, gag.start + 2500), /tv-gag/, "Gags off");
});

test("the TV draws a gag moved by its walkout in the new window, never under the walkout", () => {
  const s = dieBoard(state => { rule(state, "Richard", 500); rule(state, "Allan", 500); });
  decide(s, "die", 3);
  const d = s.eventOps.die.lastContest.decidedAt;
  s.showControl.audio = songOf("Adi", d + 1000);
  const gag = latestGag(s, events(s));
  assert.doesNotMatch(tv(s, d + TV_ADVANCE_MS + 2500), /tv-gag/, "its old window is the walkout's");
  assert.match(tv(s, gag.start + 2500), /class="tv-takeover tv-gag is-strike"/);
});

test("a gag plays once on a TV: given away to a late walkout, or begun before its window moved, it never comes back", () => {
  const blank = { id:null, play:false, shown:false };
  const gag = { id:"contest:die:m1:strike" };
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
  assert.equal(waited.play, true, "a gag that waited for the walkout plays in its new window");
  assert.equal(gagVerdict(blank, gag, { blocked:true }).play, false, "held at first sight: skipped, never queued");
  /* its sounds ride over the win song still playing in the strip */
  assert.ok(room.gagCues({ id:"g", kind:"strike", start:0 }).every(cue => cue.open), "open past the song's duck");
  const walkoutSource = readFileSync(new URL("../src/features/tv/TVWalkout.jsx", import.meta.url), "utf8");
  assert.match(walkoutSource, /useWalkoutMoment\(state, events, \{ delayTo:walkoutSpan\(state, events\)\?\.anchor/,
    "the TV's walkout plays in the window the gag and the face-off wait for");
  for (const file of ["src/features/tv/faceOff.js", "src/features/moments/youreUp.js"])
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /useLiveStart\(valid \? moment\.id : null/,
      `${file}: the face-off's start follows the walkout's write until it plays`);
});

test("each kind's drawing and lettering, and never a joke in the copy", () => {
  const s = fresh();
  s.profiles = { Richard:{ display:"Squilliam" } };
  const draw = gag => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles },
    React.createElement(TVGag, { state:s, gag:{ id:`t:${gag.kind}`, start:0, elapsed:3000, ms:GAG_MS[gag.kind], end:GAG_MS[gag.kind],
      ...gag } })));
  const turkey = draw({ kind:"turkey", players:["Richard", "Henry", "Ben", "Adi", "Evan"], more:2, count:5, name:"Squilliam" });
  assert.match(text(turkey), /5 IN A ROW Squilliam/);
  assert.equal((turkey.match(/class="tv-gag-turkey/g) || []).length, 4, "the lead and three followers at most");
  assert.match(turkey, />\+2</, "the rest counted");
  assert.equal((turkey.match(/class="tv-gag-mark"/g) || []).length, 3, "three strike marks");
  assert.equal((turkey.match(/class="tv-gag-feather"/g) || []).length, 28, "seven tail chips a turkey");
  const gutter = draw({ kind:"gutter", players:["Richard"], amount:1000, name:"Squilliam" });
  assert.match(text(gutter), /-1,000 Squilliam/);
  assert.match(gutter, /tv-gag-amount/);
  const vultures = draw({ kind:"vultures", players:["Richard"], place:"13th", name:"Squilliam" });
  assert.match(text(vultures), /13th Squilliam/);
  assert.equal((vultures.match(/class="tv-gag-vulture"/g) || []).length, 3, "three vultures");
  const strike = draw({ kind:"strike", players:["Adi", "Chiang"], name:"Adi & Chiang", beaten:["Richard", "Allan"] });
  assert.match(text(strike), /UPSET Adi &amp; Chiang/);
  assert.equal((strike.match(/class="tv-gag-pin-chip"/g) || []).length, 2, "the beaten side rides the front pins");
  for (const html of [turkey, gutter, vultures, strike]) assert.doesNotMatch(text(html), /—|!/);
  for (const file of ["src/features/gags/TVGags.jsx", "src/features/gags/gagModel.js", "src/features/gags/gags.css", "shared/gags.js"])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /—/, `${file}: no em dashes`);
  /* a name holds one line in its column at 56px or more */
  assert.equal(gagNameSize("Squilliam", 806, { max:124 }), 124);
  assert.ok(gagNameSize("Les Quizerables Reunited", 1500, { max:120 }) * 24 * 0.52 <= 1500);
  assert.equal(gagNameSize("x".repeat(60), 760), 56);
});

test("the TV wires the gags: a takeover with its chase, the board's busy, the face-off timed after", () => {
  const source = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(source, /useGagWindow\(state, events, \{ now:nowOverride \}\)/);
  assert.match(source, /useGagShown\(gagWindow\.gag, \{ blocked:/);
  assert.match(source, /useGagSound\(\{ state, plan:gagWindow\.plan, gag \}\)/);
  assert.match(source, /gag && \{ takeover:"gag", chase:gagLamp\(state, gag\) \}/);
  assert.match(source, /\|\| !!showdown \|\| !!gag;/, "an update reload waits for a gap");
  for (const blocker of ["!!award", "!!walkoutMoment", "!!pokerMoments.takeover", "crownPlaying", "!!showdown", "!!faceOff",
    "!!ceremonyReveal", "final"])
    assert.ok(source.slice(source.indexOf("useGagShown(")).split(";")[0].includes(blocker), blocker);
  const css = readFileSync(new URL("../src/features/gags/gags.css", import.meta.url), "utf8");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css) && !/rgba?\(/.test(css), "tokens only");
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*data-moment~="gag"\] > \.tv-main \{ opacity:0; \}/,
    "reduced motion keeps the board out of the still");
  const sizes = [...css.matchAll(/font-size:(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length && sizes.every(px => px >= 24), "24px and up on the canvas");
});
