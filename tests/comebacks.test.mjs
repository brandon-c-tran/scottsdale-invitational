/* v3.1 comebacks: the leader bounty, underdog odds and byes to the bottom.
   All three are derived or fixed at a named moment, so corrections move
   them with the record and later standings never do. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE, ROSTER, PT, START, BOUNTY_PTS, UNDERDOG_MULT, allEventsOf, computeStandings, resolveCurrentContest,
  resolveWager, makeBracket, seedBracket, bracketByeSlots, bountyFor, bountyAwards, oddsFor, contestMult,
  wagerMult, atRisk, maxRisk, resolveSlot, stacksPosted,
} from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";

let serial = 0;
const fresh = () => structuredClone(EMPTY_STATE);
const event = (s, id) => allEventsOf(s).find(e => e.id === id);
const current = (s, id) => resolveCurrentContest(s, event(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:`host-${++serial}` });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`chip-${++serial}` });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const reject = (s, type, payload, ctx, pattern) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should reject`);
  if (pattern) assert.match(result.error, pattern);
};
const rule = (s, player, delta) => act(s, "adjust", { player, delta, reason:"setup" });
const row = (s, player) => computeStandings(s).find(item => item.player === player);
const lock = (s, id) => act(s, "lockAndStart", { evId:id, ...refs(current(s, id)) });
const win = (s, id, winner) => act(s, "recordContestWinner", { evId:id, ...refs(current(s, id)), winner });
const matchChip = (s, id, key, stake = PT) => {
  const c = current(s, id);
  return { kind:"match", eventId:id, evName:event(s, id).name, stake, ...refs(c), match:c.match, teamIdx:key, drawId:c.drawId };
};
/* Beer Die as six pairs in the stored hand-drawn six shape: the first
   contest is team 3 (ROSTER 6, 7) against team 4 (ROSTER 8, 9). */
function dieBoard(setup = () => {}) {
  const s = fresh();
  s.live = true;
  setup(s);
  s.draws.die = { id:"draw-die", ts:1, teams:Array.from({ length:6 }, (_, key) => ({ players:ROSTER.slice(key * 2, key * 2 + 2) })) };
  s.brackets.die = makeBracket(6);
  act(s, "announceEvent", { evId:"die" });
  return s;
}

test("the leader bounty is stamped when betting locks and pays the side that beats the leader", () => {
  const s = dieBoard(state => rule(state, ROSTER[6], 1000));
  const before = current(s, "die");
  assert.deepEqual(before.match, [0, 0]);
  assert.equal(before.bounty, undefined, "nothing is stamped while betting is open");
  assert.deepEqual(bountyFor(s, before).players, [ROSTER[6]], "the projected bounty names the leader");
  lock(s, "die");
  const locked = current(s, "die");
  assert.deepEqual(locked.bounty.players, [ROSTER[6]]);
  assert.equal(locked.bounty.kind, "match");
  /* later standings never move a stamped bounty */
  rule(s, ROSTER[12], 3000);
  assert.deepEqual(current(s, "die").bounty.players, [ROSTER[6]]);
  win(s, "die", 4);
  assert.equal(row(s, ROSTER[8]).bountyPts, BOUNTY_PTS);
  assert.equal(row(s, ROSTER[9]).bountyPts, BOUNTY_PTS);
  assert.equal(row(s, ROSTER[6]).bountyPts, 0, "never paid to the leader");
  assert.equal(row(s, ROSTER[8]).pts, START + BOUNTY_PTS);
  assert.deepEqual(bountyAwards(s).map(item => item.player).sort(), [ROSTER[8], ROSTER[9]].sort());

  /* the undo takes it back with the result, and the record replays it */
  const top = s.eventOps.die.contestStack.at(-1);
  act(s, "undoLastContest", { evId:"die", contestId:top.id, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(row(s, ROSTER[8]).bountyPts, 0);
  assert.deepEqual(current(s, "die").bounty.players, [ROSTER[6]], "the corrected contest keeps its stamp");
  win(s, "die", 3);
  assert.equal(row(s, ROSTER[8]).bountyPts, 0, "a leader who wins pays nobody");
  assert.equal(row(s, ROSTER[7]).bountyPts, 0, "nor their teammate");
});

test("tied leaders all carry the bounty; it pays only when every winner is off the bounty", () => {
  const split = dieBoard(state => { rule(state, ROSTER[6], 1000); rule(state, ROSTER[8], 1000); });
  lock(split, "die");
  assert.deepEqual([...current(split, "die").bounty.players].sort(), [ROSTER[6], ROSTER[8]].sort());
  win(split, "die", 4);
  assert.equal(computeStandings(split).reduce((sum, item) => sum + item.bountyPts, 0), 0,
    "a winning side holding a leader collects nothing");

  const together = dieBoard(state => { rule(state, ROSTER[6], 1000); rule(state, ROSTER[7], 1000); });
  lock(together, "die");
  assert.equal(current(together, "die").bounty.players.length, 2);
  win(together, "die", 4);
  assert.equal(row(together, ROSTER[8]).bountyPts, BOUNTY_PTS);
});

test("no bounty before the weekend moves or when the leader sits the contest out", () => {
  const level = dieBoard();
  lock(level, "die");
  assert.equal(current(level, "die").bounty, undefined, "everyone at 1,000 leads, so nobody can collect");
  const elsewhere = dieBoard(state => rule(state, ROSTER[12], 1000));
  lock(elsewhere, "die");
  assert.equal(current(elsewhere, "die").bounty, undefined);
  assert.equal(elsewhere.eventOps.die.bounties, undefined);
});

test("a free-for-all pays its 1st place when a bounty player was in the field and not among them", () => {
  const s = fresh();
  s.live = true;
  rule(s, ROSTER[0], 1000);
  act(s, "announceEvent", { evId:"putt" });
  lock(s, "putt");
  const stamped = s.eventOps.putt.bounties[current(s, "putt").id];
  assert.deepEqual(stamped.players, [ROSTER[0]]);
  assert.ok(stamped.field.includes(ROSTER[5]));
  act(s, "beginResultEntry", { evId:"putt" });
  act(s, "saveResult", { evId:"putt", slots:[[ROSTER[5]], [ROSTER[0]], []] });
  assert.equal(row(s, ROSTER[5]).bountyPts, BOUNTY_PTS);
  assert.equal(row(s, ROSTER[0]).bountyPts, 0);
  assert.equal(row(s, ROSTER[1]).bountyPts, 0, "only 1st place collects");
  act(s, "saveResult", { evId:"putt", slots:[[ROSTER[0]], [ROSTER[5]], []], confirmOverwrite:true, correctionReason:"wrong tap" });
  assert.equal(computeStandings(s).reduce((sum, item) => sum + item.bountyPts, 0), 0, "the leader won: nothing");
  act(s, "saveResult", { evId:"putt", slots:[[ROSTER[3]], [ROSTER[5]], []], confirmOverwrite:true, correctionReason:"recount" });
  assert.equal(row(s, ROSTER[3]).bountyPts, BOUNTY_PTS);
  act(s, "clearResult", { evId:"putt", confirmClear:true, correctionReason:"replay" });
  assert.equal(row(s, ROSTER[3]).bountyPts, 0, "a cleared result takes it back");
});

test("the exposure trim covers a bounty taken back", () => {
  const s = fresh();
  s.live = true;
  rule(s, ROSTER[0], 1000);
  act(s, "announceEvent", { evId:"putt" });
  lock(s, "putt");
  act(s, "beginResultEntry", { evId:"putt" });
  act(s, "saveResult", { evId:"putt", slots:[[ROSTER[5]], [], []] });
  const winner = ROSTER[5];
  assert.equal(row(s, winner).pts, START + 400 + BOUNTY_PTS);
  /* the next market: back the winner's limit on a match they are not in */
  s.draws.die = { id:"draw-die", ts:1, teams:Array.from({ length:6 }, (_, key) => ({ players:ROSTER.slice(key * 2, key * 2 + 2) })) };
  s.brackets.die = makeBracket(6);
  act(s, "announceEvent", { evId:"die" });
  const cap = maxRisk(row(s, winner).pts);
  for (let staked = 0; staked < cap; staked += PT)
    act(s, "placeWager", { wager:matchChip(s, "die", 3) }, guest(winner));
  assert.equal(atRisk(s, winner, allEventsOf(s)), cap);
  act(s, "clearResult", { evId:"putt", confirmClear:true, correctionReason:"replay" });
  assert.equal(row(s, winner).bountyPts, 0);
  assert.ok(atRisk(s, winner, allEventsOf(s)) <= maxRisk(row(s, winner).pts), "newest chips go back to fit the cap");
});

test("the bounty never touches the poker finale", () => {
  const s = fresh();
  s.results.poker = { stacks:Object.fromEntries(ROSTER.map((player, index) => [player, 500 + index * 100])), slots:[[ROSTER[12]]], ts:5 };
  s.eventOps.die = { bounties:{ x:{ players:[ROSTER[0]], kind:"ffa", field:ROSTER, at:1 } } };
  assert.equal(stacksPosted(s), true);
  assert.equal(bountyFor(s, { sides:[{ key:0, players:[ROSTER[0]] }, { key:1, players:[ROSTER[1]] }] }), null);
  computeStandings(s).forEach(item => assert.equal(item.pts, s.results.poker.stacks[item.player], "stacks are the standings"));
  const finale = fresh();
  finale.results.poker = { slots:[[ROSTER[1]]], ts:1 };
  finale.eventOps.poker = { bounties:{ y:{ players:[ROSTER[0]], kind:"ffa", field:ROSTER, at:1 } } };
  assert.equal(bountyAwards(finale).length, 0);
});

test("underdog odds: a 1,000 gap (average chips per player, times 2) pays the lower side 2:1", () => {
  const s = dieBoard(state => { rule(state, ROSTER[8], 500); rule(state, ROSTER[9], 500); });
  const c = current(s, "die");
  assert.deepEqual(c.odds && { underdog:c.odds.underdog, mult:c.odds.mult }, { underdog:3, mult:UNDERDOG_MULT });
  assert.equal(contestMult(c, 3), 2);
  assert.equal(contestMult(c, 4), 1);
  const spectator = ROSTER[12];
  act(s, "placeWager", { wager:matchChip(s, "die", 3) }, guest(spectator));
  act(s, "placeWager", { wager:matchChip(s, "die", 4) }, guest(ROSTER[11]));
  const [fav] = s.wagers.filter(w => w.player === ROSTER[11]);
  const [dog] = s.wagers.filter(w => w.player === spectator);
  assert.equal(dog.mult, 2, "the ticket keeps the payout it was placed at");
  assert.equal(fav.mult, 1);
  /* competitors still back only their own side, one side per contest */
  reject(s, "placeWager", { wager:matchChip(s, "die", 4) }, guest(ROSTER[6]), /yourself or your team/);
  reject(s, "placeWager", { wager:matchChip(s, "die", 4) }, guest(spectator), /One side per contest/);
  /* standings moving after the open never move the odds or the ticket */
  rule(s, ROSTER[6], 2000);
  assert.equal(current(s, "die").odds.underdog, 3);
  act(s, "placeWager", { wager:matchChip(s, "die", 3) }, guest(spectator));
  assert.equal(s.wagers.find(w => w.player === spectator).mult, 2);
  lock(s, "die");
  win(s, "die", 3);
  const events = allEventsOf(s);
  assert.deepEqual(resolveWager(s, dog, events), { status:"won", delta:2 * dog.stake });
  assert.deepEqual(resolveWager(s, fav, events), { status:"lost", delta:-fav.stake });
  /* a correction reopening the contest keeps its stored odds */
  const top = s.eventOps.die.contestStack.at(-1);
  act(s, "undoLastContest", { evId:"die", contestId:top.id, contestRevision:s.eventOps.die.contestRevision });
  assert.equal(current(s, "die").odds.underdog, 3);
});

test("underdog odds need the full gap; pairs compare combined chips and a 7 v 6 compares averages", () => {
  const close = dieBoard(state => { rule(state, ROSTER[8], 400); rule(state, ROSTER[9], 500); });
  assert.equal(current(close, "die").odds, undefined, "a 900 gap is even money");
  assert.equal(close.eventOps.die.odds[current(close, "die").id].underdog, null);
  const pairs = { sides:[{ key:0, players:[ROSTER[0], ROSTER[1]] }, { key:1, players:[ROSTER[2], ROSTER[3]] }] };
  const s = fresh();
  rule(s, ROSTER[2], 500); rule(s, ROSTER[3], 500);
  assert.equal(oddsFor(s, pairs).underdog, 0, "2,000 against 3,000 combined");
  /* the 7 v 6 full court: sums differ by a player, averages do not */
  const court = { sides:[{ key:0, players:ROSTER.slice(0, 7) }, { key:1, players:ROSTER.slice(7) }] };
  assert.equal(oddsFor(fresh(), court).underdog, null);
  const lifted = fresh();
  ROSTER.slice(7).forEach(player => rule(lifted, player, 500));
  assert.equal(oddsFor(lifted, court).underdog, 0);
  /* the wide field keeps 2:1 everywhere and carries no odds */
  assert.equal(oddsFor(fresh(), { sides:ROSTER.map(key => ({ key, players:[key] })) }), null);
});

test("legacy tickets keep their original payouts", () => {
  const s = dieBoard();
  lock(s, "die");
  const c = current(s, "die");
  s.wagers.push({ id:"old-match", kind:"match", eventId:"die", drawId:"draw-die", match:[0, 0], teamIdx:3,
    stake:300, player:ROSTER[12], status:"open" });
  s.wagers.push({ id:"old-outright", kind:"outright", eventId:"putt", pick:ROSTER[1], stake:100, player:ROSTER[12], status:"open" });
  assert.equal(wagerMult(s.wagers.at(-2)), 1);
  assert.equal(wagerMult(s.wagers.at(-1)), 2);
  win(s, "die", 3);
  assert.equal(resolveWager(s, s.wagers.find(w => w.id === "old-match"), allEventsOf(s)).delta, 300);
  assert.equal(c.kind, "match");
});

const teamsOf = players => players.map(list => ({ players:list }));
function seededBoard(n) {
  const s = fresh();
  /* distinct strengths: roster players climb by 100s; fillers sit at 1,000 */
  const players = Array.from({ length:n }, (_, index) => ROSTER[index] || `Filler${index}`);
  players.forEach((player, index) => {
    if (ROSTER.includes(player)) s.adjustments.push({ id:`r${index}`, player, delta:(index + 1) * PT * 3, ts:1 });
  });
  const pts = Object.fromEntries(computeStandings(s).map(item => [item.player, item.pts]));
  const strength = player => pts[player] ?? START;
  const draw = { id:`draw-${n}`, ts:7, teams:teamsOf(players.map(player => [player])) };
  return { s, draw, strength, players };
}

test("byes go to the lowest-ranked entrants for 3 to 16, and the seeds ride on the bracket", () => {
  for (let n = 3; n <= 16; n++) {
    const { s, draw, strength, players } = seededBoard(n);
    const br = seedBracket(s, draw);
    const byeCount = bracketByeSlots(makeBracket(n)).length;
    const ranked = [...players.keys()].sort((a, b) => strength(players[a]) - strength(players[b]));
    const lowest = new Set(ranked.slice(0, byeCount));
    const firstRound = new Set(br.rounds[0].flatMap(match => [match.a.t, match.b.t]));
    assert.equal(br.seeds.length, n, `${n}: seeds stored`);
    assert.deepEqual([...br.seeds].sort((a, b) => a - b), [...players.keys()], `${n}: every team seeded once`);
    assert.equal((br.byes || []).length, byeCount, `${n}: bye count`);
    for (const team of br.byes || []) {
      assert.ok(lowest.has(team), `${n}: ${players[team]} has a bye and is among the lowest`);
      assert.ok(!firstRound.has(team), `${n}: a bye skips the first round`);
    }
    assert.deepEqual(seedBracket(s, draw), br, `${n}: the seeding replays`);
    /* every team still appears exactly once across the bracket's entry slots */
    const entries = br.rounds.flatMap(round => round.flatMap(match => [match.a, match.b])).filter(slot => slot.t !== undefined);
    assert.equal(entries.length, n);
  }
});

test("a level board keeps the draw order, and the live draw seeds its bracket", () => {
  const level = seedBracket(fresh(), { id:"d", ts:1, teams:teamsOf(ROSTER.slice(0, 6).map(player => [player])) });
  assert.deepEqual(level.seeds, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(level.rounds, makeBracket(6).rounds);
  const s = fresh();
  s.live = true;
  rule(s, ROSTER[0], 2000); rule(s, ROSTER[1], 1500); rule(s, ROSTER[2], 1200);
  act(s, "announceAndDraw", { evId:"die" });
  const br = s.brackets.die;
  assert.ok(Array.isArray(br.seeds) && br.seeds.length === 6);
  const pts = Object.fromEntries(computeStandings(s).map(item => [item.player, item.pts]));
  const avg = key => s.draws.die.teams[key].players.reduce((sum, player) => sum + pts[player], 0) / 2;
  const byes = br.byes;
  const others = [0, 1, 2, 3, 4, 5].filter(key => !byes.includes(key));
  assert.ok(Math.max(...byes.map(avg)) <= Math.min(...others.map(avg)), "the byes hold the bottom of the board");
  /* the first contest is a play-in between two teams that did not get a bye */
  const c = current(s, "die");
  c.sides.forEach(side => assert.ok(!byes.includes(side.key)));
  assert.equal(resolveSlot(br, br.rounds[1][0].a), byes[0]);
});

test("the full weekend still closes through the QA fast-forward with comebacks in play", () => {
  const LOCAL = { isGm:true, qa:true, progressReset:true, environment:"local" };
  let bounties = 0, dogs = 0, byes = 0;
  for (const seed of [7, 1234, 99]) {
    const s = fresh();
    const result = applyAction(s, "qaAdvance", { target:"crowned", seed }, LOCAL);
    assert.equal(result.ok, true, result.error);
    assert.equal(s.frozen, true);
    const stacks = Object.values(s.results).find(item => item?.stacks);
    computeStandings(s).forEach(item => {
      const after = (s.adjustments || []).filter(a => !a.removedAt && a.player === item.player && a.pokerRevision !== undefined)
        .reduce((sum, a) => sum + a.delta, 0);
      assert.equal(item.pts, (stacks.stacks[item.player] ?? 0) + after, `${seed}: ${item.player} is their counted stack`);
    });
    for (const op of Object.values(s.eventOps)) {
      bounties += Object.keys(op.bounties || {}).length;
      dogs += Object.values(op.odds || {}).filter(odds => odds.underdog !== null).length;
    }
    byes += Object.values(s.brackets).filter(br => br.byes?.length).length;
    s.wagers.filter(w => w.status !== "void").forEach(w => {
      const resolved = resolveWager(s, w, allEventsOf(s));
      if (resolved.status === "won") assert.equal(resolved.delta, wagerMult(w) * w.stake);
    });
  }
  assert.ok(bounties > 0, "bounties were stamped across the weekend");
  assert.ok(dogs > 0, "some contests opened with underdog odds");
  assert.ok(byes > 0, "brackets seated byes");
});
