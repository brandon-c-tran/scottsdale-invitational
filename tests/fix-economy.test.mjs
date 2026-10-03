import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, AWARDS, PT, OUTRIGHT_MULT, allEventsOf, resolveCurrentContest, resolveWager, computeStandings,
  atRisk, maxRisk, makeBracket, resolveSlot, defaultQaParticipants, contestMult, resultAwards, awardPlan,
  pokerDenoms, pokerDistribution, pokerInventory, drawTeams, resolveEventLifecycle, teamLabel,
} from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { withLegacyEvents } from "./support/legacy-events.mjs";

/* Economy regressions: every scenario runs the real actions against in-memory
   state. No transport, no storage. */
let serial = 0;
const fresh = () => structuredClone(EMPTY_STATE);
/* Flip Cup left the slate; it is still the even two-team game (6 v 6 plus crew) */
const withFlip = () => withLegacyEvents(fresh(), ["flip"]);
const event = (s, id) => allEventsOf(s).find(e => e.id === id);
const current = (s, id) => resolveCurrentContest(s, event(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = id => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:id || `host-${++serial}` });
const guest = (player, id) => ({ player, deviceId:`device-${player}`, actionId:id || `chip-${++serial}` });
const act = (s, type, payload = {}, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const fail = (s, type, payload = {}, ctx = gm(), pattern) => {
  const before = structuredClone(s);
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should reject`);
  if (pattern) assert.match(result.error, pattern);
  assert.deepEqual(s, before, `${type} must not mutate on rejection`);
  return result;
};
const pts = s => Object.fromEntries(computeStandings(s).map(row => [row.player, row.pts]));
const chip = (s, id, side, stake = PT) => {
  const c = current(s, id), ev = event(s, id);
  const common = { eventId:id, evName:ev.name, stake, ...refs(c) };
  if (c.kind === "ffa") return c.drawId
    ? { ...common, kind:"outright", pickTeam:true, pickPlayers:side.players, drawId:c.drawId }
    : { ...common, kind:"outright", pick:side.key, pickPlayers:[side.key] };
  if (c.kind === "match") return { ...common, kind:"match", match:c.match, teamIdx:side.key, drawId:c.drawId };
  return { ...common, kind:c.kind === "heat" ? "heat" : "stage", stagesId:c.stagesId, drawId:c.drawId,
    group:c.group, final:c.kind === "stage-final", pickKey:side.key };
};
const bet = (s, id, player, key, stake = PT) => {
  const side = current(s, id).sides.find(x => x.key === key);
  return applyAction(s, "placeWager", { wager:chip(s, id, side, stake) }, guest(player));
};
const lock = (s, id) => act(s, "lockAndStart", { evId:id, ...refs(current(s, id)) });
const win = (s, id, winner) => act(s, "recordContestWinner", { evId:id, ...refs(current(s, id)), winner });
const drawn = (s, id) => act(s, "announceAndDraw", { evId:id, players:defaultQaParticipants(event(s, id)) });
const post = (s, id, slots) => {
  lock(s, id);
  if (resolveEventLifecycle(s, event(s, id)).phase !== "result-entry") act(s, "beginResultEntry", { evId:id });
  return act(s, "saveResult", { evId:id, slots });
};
const runFfa = (s, id, slots) => {
  if (s.onDeck !== id) act(s, "announceEvent", { evId:id });
  return post(s, id, slots);
};
const crewOf = (s, id) => s.draws[id].roles.map(role => role.player);
/* two heats of solo players, then a two-player final */
const heats = (id = "beerio") => {
  const s = fresh();
  act(s, "runStages", { evId:id, cfg:{ kind:"heats", nGroups:2, advance:1, players:ROSTER } });
  act(s, "announceEvent", { evId:id });
  while (current(s, id)?.kind === "heat") { lock(s, id); win(s, id, current(s, id).sides[0].key); }
  return s;
};

/* ── 1. two-sided contests are matchups ── */
test("every two-team event pays 1:1, keeps competitors on their side, and holds one side per bettor", () => {
  /* an even two-team game with crew, and a bracket match of teams */
  for (const id of ["flip", "volley"]) {
    const s = withFlip();
    drawn(s, id);
    const c = current(s, id);
    assert.equal(c.sides.length, 2);
    assert.equal(contestMult(c), 1, `${id} pays 1:1`);
    const competitor = c.sides[0].players[0], spectator = crewOf(s, id)[0];
    assert.match(bet(s, id, competitor, c.sides[1].key).error, /only back yourself or your team/);
    assert.equal(bet(s, id, competitor, c.sides[0].key, 300).ok, true);
    assert.equal(bet(s, id, spectator, c.sides[1].key, 200).ok, true);
    assert.match(bet(s, id, spectator, c.sides[0].key).error, /One side per contest/);
    assert.equal(bet(s, id, spectator, c.sides[1].key, 100).ok, true, "adding to the same side still works");
    const before = pts(s);
    if (c.kind === "match") {
      lock(s, id); win(s, id, c.sides[1].key);
      const after = pts(s);
      assert.equal(after[spectator] - before[spectator], 300, "even money on the match");
      assert.equal(after[competitor] - before[competitor], -300);
      continue;
    }
    post(s, id, [c.sides[1].players, c.sides[0].players]);
    const after = pts(s), crewAward = AWARDS[event(s, id).value][2];
    assert.equal(crewAward, 400);
    assert.equal(after[spectator] - before[spectator], 300 + crewAward, "even money plus the crew award");
    assert.equal(after[competitor] - before[competitor], -300 + AWARDS[event(s, id).value][1]);
  }

  /* 5v5 is everyone, seven against six: no crew, no spectator, winners only */
  const s = fresh();
  drawn(s, "bball5");
  const c = current(s, "bball5");
  assert.deepEqual(s.draws.bball5.teams.map(team => team.players.length).sort(), [6, 7]);
  assert.deepEqual(crewOf(s, "bball5"), []);
  assert.equal(c.sides.length, 2);
  assert.equal(contestMult(c), 1, "bball5 pays 1:1");
  const [winner, loser] = [c.sides[0].players[0], c.sides[1].players[0]];
  assert.match(bet(s, "bball5", loser, c.sides[0].key).error, /only back yourself or your team/);
  assert.equal(bet(s, "bball5", loser, c.sides[1].key, 300).ok, true);
  assert.equal(bet(s, "bball5", winner, c.sides[0].key, 200).ok, true);
  assert.equal(bet(s, "bball5", winner, c.sides[1].key).ok, false, "a competitor holds only their own side");
  const before = pts(s);
  post(s, "bball5", [c.sides[0].players, c.sides[1].players]);
  const after = pts(s);
  assert.equal(after[winner] - before[winner], 200 + 800, "even money plus the winners' 800");
  assert.equal(after[loser] - before[loser], -300, "the other side takes no award");
});

test("no two-sided contest can be hedged at a profit", () => {
  const cases = [];
  { const s = withFlip(); drawn(s, "flip"); cases.push([s, "flip"]); }
  { const s = fresh(); drawn(s, "volley"); cases.push([s, "volley"]); }
  { const s = fresh(); drawn(s, "8ball"); cases.push([s, "8ball"]); }
  cases.push([heats(), "beerio"]);
  for (const [s, id] of cases) {
    const c = current(s, id);
    assert.equal(c.sides.length, 2, `${id} ${c.kind} has two sides`);
    for (const player of ROSTER) {
      const results = c.sides.map(side => bet(s, id, player, side.key, 200));
      assert.ok(results.filter(result => result.ok).length <= 1, `${player} holds one side of ${id}`);
    }
    /* whichever side wins, nobody's book on this contest is up on both outcomes */
    const outcomes = c.sides.map(side => {
      const settled = structuredClone(s);
      lock(settled, id);
      if (c.kind === "ffa") {
        act(settled, "beginResultEntry", { evId:id });
        act(settled, "saveResult", { evId:id, slots:[side.players] });
      } else win(settled, id, side.key);
      return Object.fromEntries(computeStandings(settled).map(row => [row.player, row.betNet]));
    });
    for (const player of ROSTER)
      assert.ok(!(outcomes[0][player] > 0 && outcomes[1][player] > 0), `${player} cannot lock a profit on ${id}`);
  }
});

test("a wide free-for-all still pays 2:1 across any sides, and older 2:1 team tickets keep their contract", () => {
  const s = fresh();
  act(s, "announceEvent", { evId:"putt" });
  const c = current(s, "putt");
  assert.equal(contestMult(c), OUTRIGHT_MULT);
  assert.equal(bet(s, "putt", ROSTER[0], ROSTER[1]).ok, true);
  assert.equal(bet(s, "putt", ROSTER[0], ROSTER[2]).ok, true);
  const before = pts(s)[ROSTER[0]];
  runFfa(s, "putt", [[ROSTER[1]]]);
  assert.equal(pts(s)[ROSTER[0]] - before, 2 * PT - PT);

  const legacy = withFlip();
  drawn(legacy, "flip");
  const team = legacy.draws.flip.teams[0];
  legacy.wagers.unshift({ id:"legacy-flip", player:crewOf(legacy, "flip")[0], kind:"outright", eventId:"flip",
    pickTeam:true, pickPlayers:[...team.players], drawId:legacy.draws.flip.id, stake:300, status:"open", ts:1 });
  post(legacy, "flip", [team.players, legacy.draws.flip.teams[1].players]);
  assert.deepEqual(resolveWager(legacy, legacy.wagers.find(w => w.id === "legacy-flip"), allEventsOf(legacy)),
    { status:"won", delta:600 }, "a ticket placed before even money pays what it promised");
});

/* ── 2 and 3. crew and a bracket's two 3rds ── */
test("event crew earn the 3rd-place award and both bracket semifinal losers take the full 3rd", () => {
  const s = withFlip();
  drawn(s, "flip");
  const crew = crewOf(s, "flip");
  assert.equal(crew.length, 1);
  const before = pts(s)[crew[0]];
  post(s, "flip", [s.draws.flip.teams[0].players, s.draws.flip.teams[1].players]);
  assert.equal(pts(s)[crew[0]] - before, 400, "Flip Cup's 3rd at 1,600");
  assert.equal(computeStandings(s).find(row => row.player === crew[0]).wins, 0);

  /* Friday pays three places now, so its crew earn Friday's 3rd */
  const friday = fresh();
  drawn(friday, "die");
  const crewDie = crewOf(friday, "die")[0];
  assert.deepEqual(awardPlan(event(friday, "die"), friday.draws.die).map(row => [row.place, row.pts]),
    [[0, 400], [1, 200], [2, 100], ["crew", 100]]);
  assert.deepEqual(resultAwards(friday, event(friday, "die"), { slots:[[ROSTER[0]]] })
    .filter(a => a.player === crewDie).map(a => [a.place, a.pts]), [["crew", 100]]);

  /* pickleball is the 800 bracket: each semifinal loser takes the full 200 */
  const pb = fresh();
  drawn(pb, "pickleball");
  const br = pb.brackets.pickleball, teams = pb.draws.pickleball.teams;
  while (current(pb, "pickleball")) { lock(pb, "pickleball"); win(pb, "pickleball", current(pb, "pickleball").sides[0].key); }
  const semis = br.rounds.at(-2).map(match => [resolveSlot(br, match.a), resolveSlot(br, match.b)]
    .find(side => side !== match.winner));
  const final = br.rounds.at(-1)[0];
  const [champ, runner] = [final.winner, [resolveSlot(br, final.a), resolveSlot(br, final.b)].find(x => x !== final.winner)];
  const third = semis.flatMap(side => teams[side].players);
  const awards = resultAwards(pb, event(pb, "pickleball"), { slots:[teams[champ].players, teams[runner].players, third] });
  assert.deepEqual(awards.filter(a => a.place === 2).map(a => a.pts), [200, 200, 200, 200], "no split: all four take 200");
  assert.deepEqual(awards.filter(a => a.place === 0).map(a => a.pts), [800, 800]);
  assert.deepEqual(awards.filter(a => a.place === 1).map(a => a.pts), [400, 400]);
  /* crew earn what a 3rd-place player gets */
  assert.deepEqual(awards.filter(a => a.place === "crew").map(a => a.pts), [200]);
  const oneSide = resultAwards(pb, event(pb, "pickleball"), { slots:[teams[champ].players, [], teams[semis[0]].players] });
  assert.deepEqual([...new Set(oneSide.filter(a => a.place === 2).map(a => a.pts))], [200]);
  const threeSides = resultAwards(pb, event(pb, "pickleball"),
    { slots:[teams[champ].players, [], [...third, ...teams[runner].players]] });
  assert.deepEqual(threeSides.filter(a => a.place === 2).map(a => a.pts), [200, 200, 200, 200, 200, 200],
    "three sides in 3rd still take the full 200 each");
  const plan = awardPlan(event(pb, "pickleball"), pb.draws.pickleball);
  assert.deepEqual(plan.map(row => [row.place, row.pts]), [[0, 800], [1, 400], [2, 200], ["crew", 200]]);
});

/* ── 5. corrections never strand a negative board ── */
test("a correction voids the newest chips that no longer fit and records them; the finale deals a negative as 0", () => {
  const s = fresh();
  const P = ROSTER[5];
  act(s, "announceEvent", { evId:"ragecage" });
  assert.equal(bet(s, "ragecage", P, P, 500).ok, true);
  runFfa(s, "ragecage", [[P]]);
  act(s, "announceEvent", { evId:"where" });
  const cap = maxRisk(pts(s)[P]);
  for (let staked = 0; staked < cap; staked += PT) assert.equal(bet(s, "where", P, ROSTER[0]).ok, true);
  act(s, "saveResult", { evId:"ragecage", slots:[[ROSTER[1]]], confirmOverwrite:true, correctionReason:"Wrong winner" });
  const balance = pts(s)[P], exposure = atRisk(s, P, allEventsOf(s));
  assert.ok(exposure <= Math.min(maxRisk(balance), balance), `${exposure} fits ${balance}`);
  const entry = s.eventOps.ragecage.corrections.at(-1);
  assert.equal(entry.type, "overwrite");
  assert.ok(entry.voided.length > 0 && entry.voided.every(item => item.player === P));
  assert.equal(entry.voided.reduce((sum, item) => sum + item.stake, 0), cap - exposure);
  runFfa(s, "where", [[ROSTER[2]]]);
  assert.ok(pts(s)[P] >= 0, "the bettor never goes below zero");

  /* a ruling can still push someone under zero; the finale covers it */
  const neg = fresh();
  act(neg, "adjust", { player:ROSTER[3], delta:-1300, reason:"Rehearsal" });
  assert.equal(pts(neg)[ROSTER[3]], -300);
  const dist = pokerDistribution([{ player:"x", pts:-300 }]);
  assert.equal(dist.ok, true);
  assert.deepEqual([dist.rows[0].stack, dist.rows[0].grant], [600, 900]);
  const setup = act(neg, "pokerSetup");
  assert.equal(neg.poker.startingStacks[ROSTER[3]], 600);
  assert.deepEqual(pts(neg), neg.poker.startingStacks, "the dealt stacks are the board");
  assert.equal(setup.extra.minimumCount, 1);
});

test("undoing a contest voids duel antes that the restored balance cannot cover", () => {
  const s = fresh();
  drawn(s, "8ball");
  const c1 = current(s, "8ball");
  const spectator = ROSTER.find(p => !c1.players.includes(p));
  assert.equal(bet(s, "8ball", spectator, c1.sides[0].key, 500).ok, true);
  assert.equal(bet(s, "8ball", c1.sides[0].players[0], c1.sides[0].key, 500).ok, true);
  lock(s, "8ball");
  win(s, "8ball", c1.sides[0].key);
  act(s, "sendDuel", { to:c1.sides[0].players[0], stake:700 }, guest(spectator));
  s.duels[0].ts += 1000; // the duel is the newest commitment
  const undo = act(s, "undoLastContest", { evId:"8ball", contestId:c1.id, contestRevision:s.eventOps["8ball"].contestRevision });
  assert.equal(undo.extra.voided[0].type, "duel", "the newest commitment goes first");
  assert.ok(!undo.extra.voided.some(item => item.player === spectator), "the restored ticket fits once the ante is gone");
  assert.equal(s.duels[0].status, "void");
  assert.equal(s.eventOps["8ball"].corrections.at(-1).type, "correct-contest");
  const exposure = atRisk(s, spectator, allEventsOf(s));
  assert.ok(exposure <= Math.min(maxRisk(pts(s)[spectator]), pts(s)[spectator]));
});

/* ── 6. shelving returns chips ── */
test("shelving voids an event's open tickets with an explicit confirm, and restoring brings them back", () => {
  const s = fresh();
  act(s, "announceEvent", { evId:"putt" });
  assert.equal(bet(s, "putt", ROSTER[6], ROSTER[7], 500).ok, true);
  assert.equal(bet(s, "putt", ROSTER[8], ROSTER[7], 200).ok, true);
  lock(s, "putt");
  const refused = fail(s, "shelve", { id:"putt", on:true }, gm(), /Returns 2 bets, 700 chips/);
  assert.deepEqual(refused.extra, { bets:2, chips:700 });
  act(s, "shelve", { id:"putt", on:true, confirmReturn:true });
  assert.ok(s.wagers.every(w => resolveWager(s, w, allEventsOf(s)).status === "void"));
  assert.equal(atRisk(s, ROSTER[6], allEventsOf(s)), 0);
  act(s, "shelve", { id:"putt", on:false });
  assert.ok(s.wagers.every(w => resolveWager(s, w, allEventsOf(s)).status === "pending"));
  act(s, "shelve", { id:"putt", on:true, confirmReturn:true });
  act(s, "setOnDeck", { id:"where" });
  assert.equal(bet(s, "where", ROSTER[6], ROSTER[7], 500).ok, true, "shelved chips no longer hold the cap");
  const posted = fresh();
  runFfa(posted, "putt", [[ROSTER[0]]]);
  fail(posted, "shelve", { id:"putt", on:true, confirmReturn:true }, gm(), /Clear the result/);
});

/* ── 7. commissioner paths that move posted chips ── */
test("posted chips move only with a reason, never on a frozen board, and never through an event edit", () => {
  const s = fresh();
  act(s, "announceEvent", { evId:"putt" });
  assert.equal(bet(s, "putt", ROSTER[3], ROSTER[3], 500).ok, true);
  runFfa(s, "putt", [[ROSTER[3]], [ROSTER[4]]]);
  fail(s, "editEvent", { id:"putt", patch:{ value:1600 } }, gm(), /Clear the result/);
  act(s, "editEvent", { id:"putt", patch:{ name:"Long Putt", value:400 } });
  const won = s.wagers[0];
  fail(s, "voidWager", { id:won.id }, gm(), /Reason required/);

  act(s, "setFrozen", { f:true });
  for (const [type, payload] of [
    ["voidWager", { id:won.id, reason:"Late bet" }],
    ["adjust", { player:ROSTER[4], delta:500, reason:"x" }],
    ["saveResult", { evId:"putt", slots:[[ROSTER[4]]], confirmOverwrite:true, correctionReason:"x" }],
    ["clearResult", { evId:"putt", confirmClear:true, correctionReason:"x" }],
    ["shelve", { id:"where", on:true }],
  ]) fail(s, type, payload, gm(), /frozen/);
  act(s, "setFrozen", { f:false });

  const before = pts(s)[ROSTER[3]];
  act(s, "voidWager", { id:won.id, reason:"Placed after the putt" });
  assert.equal(pts(s)[ROSTER[3]], before - 2 * 500);
  assert.equal(won.voidReason, "Placed after the putt");
  assert.equal(won.voidedFrom, "won");
  assert.equal(won.voidedBy, ROSTER[0]);
  assert.ok(won.voidedAt > 0);

  const duel = fresh(); duel.live = true;
  act(duel, "sendDuel", { to:ROSTER[1], stake:300 }, guest(ROSTER[0]));
  const d = duel.duels[0];
  act(duel, "acceptDuel", { id:d.id }, guest(ROSTER[1]));
  act(duel, "playDuel", { id:d.id, ms:200 }, guest(ROSTER[0]));
  act(duel, "playDuel", { id:d.id, ms:300 }, guest(ROSTER[1]));
  fail(duel, "voidDuel", { id:d.id }, gm(), /Reason required/);
  act(duel, "voidDuel", { id:d.id, reason:"Phone glitch" });
  assert.deepEqual([d.status, d.voidReason, d.voidedFrom], ["void", "Phone glitch", "open"]);
  assert.equal(pts(duel)[ROSTER[0]], 1000);
});

/* ── 8. rulings ── */
test("a retried ruling applies once, and a ruling comes off only with a reason", () => {
  const s = fresh();
  const ctx = gm("ruling-1");
  act(s, "adjust", { player:ROSTER[2], delta:300, reason:"Pressure putt" }, ctx);
  const retry = act(s, "adjust", { player:ROSTER[2], delta:300, reason:"Pressure putt" }, ctx);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(s.adjustments.length, 1);
  assert.equal(pts(s)[ROSTER[2]], 1300);
  fail(s, "adjust", { player:ROSTER[2], delta:200, reason:"Other" }, ctx, /Request id already used/);
  const id = s.adjustments[0].id;
  fail(s, "removeAdjustment", { id }, gm(), /Reason required/);
  act(s, "removeAdjustment", { id, reason:"Wrong player" });
  assert.equal(pts(s)[ROSTER[2]], 1000);
  assert.equal(s.adjustments[0].removeReason, "Wrong player");
  act(s, "adjust", { player:ROSTER[3], delta:100, reason:"Minimum stack" });
  fail(s, "removeAdjustment", { id:s.adjustments[0].id, reason:"x" }, gm(), /poker table/);
});

/* ── 9 and 10. the finale ── */
const dealt = () => {
  const s = fresh();
  act(s, "setLive", { on:true });
  act(s, "pokerSetup");
  act(s, "pokerStart");
  return s;
};
test("post-count rulings follow the poker result through a clear and repost, and never touch the pre-poker board", () => {
  const s = dealt();
  ROSTER.forEach((p, i) => act(s, "pokerCount", { player:p, count:i === 0 ? 1025 : i === 1 ? 975 : 1000 }, guest(p)));
  act(s, "pokerResult", { noScene:true });
  act(s, "adjust", { player:ROSTER[2], delta:25, reason:"Miscounted" });
  assert.equal(s.adjustments[0].pokerRevision, 1);
  assert.equal(pts(s)[ROSTER[2]], 1025);
  act(s, "clearResult", { evId:"poker", confirmClear:true, correctionReason:"Recount" });
  assert.equal(pts(s)[ROSTER[2]], 1000, "the 25 does not leak into the dealt board");
  fail(s, "pokerCancel", {}, gm(), /Cards are live/);
  act(s, "pokerResult", { noScene:true });
  /* deliberate change (C6): a repost is a new count, and a ruling made on the
     old count stops applying; it stays in the ledger with its count */
  assert.equal(s.results.poker.revision, 2);
  assert.equal(pts(s)[ROSTER[2]], 1000, "a ruling on count 1 does not apply to count 2");
  assert.equal(s.adjustments[0].pokerRevision, 1);
});

test("the table always keeps a chip holder, a counted 0 is a bust, and no count exceeds the table", () => {
  const s = dealt();
  const total = s.poker.total;
  fail(s, "pokerCount", { player:ROSTER[0], count:total + 25 }, guest(ROSTER[0]), /dealt/);
  act(s, "pokerBust", { player:ROSTER[12] }, guest(ROSTER[12]));
  act(s, "pokerCount", { player:ROSTER[11], count:0 }, guest(ROSTER[11]));
  assert.deepEqual(s.poker.outs.map(o => o.player), [ROSTER[12], ROSTER[11]]);
  act(s, "pokerCount", { player:ROSTER[11], count:0 }, guest(ROSTER[11]));
  for (let i = 10; i >= 2; i--) act(s, "pokerBust", { player:ROSTER[i] }, guest(ROSTER[i]));
  act(s, "pokerCount", { player:ROSTER[0], count:total }, guest(ROSTER[0]));
  act(s, "pokerBust", { player:ROSTER[1] }, guest(ROSTER[1]));
  fail(s, "pokerBust", { player:ROSTER[0] }, gm(), /last player in cannot bust/);
  act(s, "pokerResult", { noScene:true });
  const rows = computeStandings(s);
  const rank = p => rows.find(row => row.player === p).rank;
  assert.equal(rank(ROSTER[0]), 1);
  assert.ok(rank(ROSTER[11]) > rank(ROSTER[2]), "an early 0 ranks below later busts");
  assert.ok(rank(ROSTER[11]) < rank(ROSTER[12]), "and above the bust before it");
});

/* ── 11. redraws ── */
test("a draw with chips riding on it cannot be redrawn or cleared", () => {
  const s = fresh();
  drawn(s, "8ball");
  const c = current(s, "8ball");
  assert.equal(bet(s, "8ball", ROSTER[12], c.sides[0].key, 300).ok, true);
  act(s, "setOnDeck", { id:null, ...refs(c) });
  fail(s, "clearDraw", { evId:"8ball" }, gm(), /Void the 1 open bet/);
  fail(s, "runDraw", { evId:"8ball", players:defaultQaParticipants(event(s, "8ball")) }, gm(), /Void the 1 open bet/);
  act(s, "voidWager", { id:s.wagers[0].id });
  act(s, "clearDraw", { evId:"8ball" });
});

/* ── 12 and 13. dealing and ids ── */
test("the deal opens with a working layer, stays exact, and reports the tray", () => {
  for (let v = 0; v <= 60000; v += 25) {
    const chips = pokerDenoms(v);
    assert.equal(chips.reduce((sum, c) => sum + c.v * c.n, 0), v);
  }
  assert.deepEqual(pokerDenoms(1000), [{ v:100, n:8 }, { v:25, n:8 }]);
  assert.deepEqual(pokerDenoms(2900), [{ v:500, n:3 }, { v:100, n:12 }, { v:25, n:8 }]);
  assert.deepEqual(pokerDenoms(12900), [{ v:1000, n:10 }, { v:500, n:3 }, { v:100, n:12 }, { v:25, n:8 }]);
  const s = fresh();
  const setup = act(s, "pokerSetup");
  assert.deepEqual(setup.extra.inventory, pokerInventory(s.poker.startingStacks));
  assert.equal(setup.extra.inventory.reduce((sum, c) => sum + c.v * c.n, 0), s.poker.total);
});

test("balanced draws made in the same millisecond never share an id", () => {
  const s = fresh(), ev = event(s, "8ball"), players = defaultQaParticipants(ev);
  const ids = new Set(Array.from({ length:20 }, () => drawTeams(ev, s, players).id));
  assert.equal(ids.size, 20);
  assert.ok([...ids].every(id => /^d\d+-[a-z0-9]+$/.test(id)));
});

/* ── 4. the result sheet ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const blocked = names => names.map(name => `export const ${name}=()=>{throw new Error("No transport in economy tests");};`).join("\n");
const compiled = await build({
  stdin:{ contents:'export { ResultSheet } from "./src/App.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";',
    resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"isolated-result", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:blocked([
      "useTournament", "dispatch", "uploadPhoto", "downloadSnapshot", "localGet", "localSet", "getDeviceId", "setGmToken", "hasGmToken",
      "spotifyStatus", "spotifyPlayer", "spotifySearch", "spotifyAuthorize", "spotifyDisconnect", "spotifyPlay", "spotifyPause", "spotifyDevice", "spotifyAutoWinSongs", "songPreview", "songSnippet", "spotifyRetry", "geoUploadPhoto", "geoDeleteRound", "geoPhotoUrl", "reportTvSound", "setTvView",
    ]) }));
    builder.onLoad({ filter:/[\\/]features[\\/]check-in[\\/]install\.js$/ }, () => ({ loader:"js", contents:
      `export const installEvt=null;\n${blocked(["onInstallReady", "firstOnboardStep", "isStandalone", "isIOS"])}` }));
  } }],
});
const componentModule = new Module(fileURLToPath(new URL("fix-economy.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { ResultSheet, PlayerIdentityProvider } = componentModule.exports;

/* clicks run inside the sheet's own render (on the control element it
   creates), so the next render pass is the sheet's reaction to them */
const sheet = (state, ev, clicks = []) => {
  const saved = [], createElement = React.createElement;
  const text = node => Array.isArray(node) ? node.map(text).join("")
    : React.isValidElement(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
  let next = 0, html;
  React.createElement = (type, props, ...children) => {
    if (type !== "button" && next < clicks.length && text(children) === clicks[next] && props?.onClick) { next++; props.onClick(); }
    return createElement(type, props, ...children);
  };
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(ResultSheet, { state, ev, onClose:() => {}, save:slots => { saved.push(structuredClone(slots)); return { ok:true }; } })));
  } finally { React.createElement = createElement; }
  return { html, saved, clicked:next };
};

test("two teams, one game: the result is picking the winner, and the other team is 2nd when 2nd pays", () => {
  /* The team choices are plain buttons. A click lands during the sheet's
     render; the next click waits for the render pass that reacts to it (the
     clicked control is drawn again). */
  const clickAll = (s, id, clicks) => {
    const saved = [], createElement = React.createElement;
    const text = node => Array.isArray(node) ? node.map(text).join("")
      : React.isValidElement(node) ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
    let next = 0, html, lastSeen = 0;
    React.createElement = (type, props, ...children) => {
      const label = text(children);
      if (next > 0 && label.includes(clicks[next - 1]) && props?.onClick) lastSeen++;
      const ready = next === 0 || lastSeen >= 2;
      if (ready && next < clicks.length && props?.onClick && label.includes(clicks[next])) {
        next++; lastSeen = 1; props.onClick();
      }
      return createElement(type, props, ...children);
    };
    try {
      html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:s.profiles },
        createElement(ResultSheet, { state:s, ev:event(s, id), onClose:() => {},
          save:slots => { saved.push(structuredClone(slots)); return { ok:true }; } })));
    } finally { React.createElement = createElement; }
    return { html, saved };
  };

  /* Flip Cup (legacy, 6 v 6 at 1,600) pays the other team 2nd */
  const s = withFlip();
  drawn(s, "flip");
  const teams = s.draws.flip.teams;
  assert.equal(teams.length, 2);
  const open = clickAll(s, "flip", []);
  assert.match(open.html, />Winner</);
  assert.doesNotMatch(open.html, /Runner-up|2nd place|Pick by player/, "no places to fill");
  const posted = clickAll(s, "flip", [teamLabel(s, teams[1]), "Post official result"]);
  assert.deepEqual(posted.saved, [[[...teams[1].players], [...teams[0].players], []]]);
  assert.match(posted.html, /\+1,600 each to the winners, \+800 each to the other team, \+400 each to the crew\./);

  /* 5v5 pays winners only: the other team takes no place */
  const full = fresh();
  drawn(full, "bball5");
  const sides = full.draws.bball5.teams;
  assert.equal(sides.length, 2);
  const fullOpen = clickAll(full, "bball5", []);
  assert.match(fullOpen.html, />Winner</);
  assert.doesNotMatch(fullOpen.html, /Runner-up|2nd place|Pick by player/, "no places to fill");
  const fullPosted = clickAll(full, "bball5", [teamLabel(full, sides[1]), "Post official result"]);
  assert.deepEqual(fullPosted.saved, [[[...sides[1].players], [], []]]);
  assert.match(fullPosted.html, /\+800 each to the winners\./);
  assert.doesNotMatch(fullPosted.html, /to the other team|to the crew/);
});

test("the result sheet prefills both semifinal losers in 3rd and a stage runner-up, and asks before leaving a paid place empty", () => {
  /* Pickleball pays 800 / 400 / 200: both semifinal losers take 200, and so does crew */
  const pb = fresh();
  drawn(pb, "pickleball");
  while (current(pb, "pickleball")) { lock(pb, "pickleball"); win(pb, "pickleball", current(pb, "pickleball").sides[0].key); }
  const pbView = sheet(pb, event(pb, "pickleball"), ["Post official result"]);
  assert.match(pbView.html, /Runners-up.*\+400 each, 2 in/s);
  assert.match(pbView.html, /3rd place.*\+200 each, 4 in/s);
  assert.match(pbView.html, /Event crew \+200 each/);
  assert.equal(pbView.saved.length, 1, "every paid place is filled, so it posts");
  assert.equal(pbView.saved[0][2].length, 4);

  /* Beerio Kart pays 1,600 / 800 / 400 */
  const pp = heats("beerio");
  lock(pp, "beerio"); win(pp, "beerio", current(pp, "beerio").sides[0].key);
  const stage = pp.stages.beerio;
  const view = sheet(pp, event(pp, "beerio"), ["Post official result"]);
  assert.equal(view.saved.length, 0, "an empty paid place stops the post");
  assert.match(view.html, /3rd place pays 400\. Nobody selected\./);
  assert.doesNotMatch(view.html, /2nd place pays/, "the two-finalist runner-up is prefilled");
  assert.match(view.html, /Leave empty/);
  const runner = stage.groups.flatMap(g => g.through).find(key => key !== stage.finalWinner);
  const left = sheet(pp, event(pp, "beerio"), ["Post official result", "Leave empty"]);
  assert.deepEqual(left.saved[0].slice(0, 2), [[stage.finalWinner], [runner]]);
  assert.deepEqual(left.saved[0][2], []);
});
