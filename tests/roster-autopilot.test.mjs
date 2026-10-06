/* Two promises the commissioner asked for (Oct 3):
   - the weekend runs itself where a clock already decides (the winner scene
     on the TV, Where and When, Trivia), and
   - up to three invited players can drop out at the last second: one tap
     takes them off the roster (and back on), and every event, count and
     screen carries on with whoever is coming. */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_STATE, ROSTER, START, allEventsOf, computeStandings, presentPlayers, resolveCurrentContest, rosterOf,
} from "../shared/core.js";
import { AUTO_STANDINGS_HOLD_MS, AUTO_WINNER_HOLD_MS, resolveDirector, sceneAutoBeat } from "../shared/show.js";
import { autoBeat } from "../shared/autopilot.js";
import { projectPrompts } from "../shared/prompts.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { publicState } from "../worker/publicState.js";

let serial = 0;
const gm = (extra = {}) => ({ isGm:true, player:null, deviceId:"gm", actionId:`g${++serial}`, environment:"local", ...extra });
const show = (extra = {}) => gm({ showControl:true, ...extra });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  return result.error;
};
const fresh = () => structuredClone(EMPTY_STATE);
const evOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const OUT = ROSTER.slice(-3);

/* ── Not coming ── */

test("Not coming takes a player off the weekend and one tap puts them back", () => {
  const state = fresh();
  act(state, "setOut", { player:OUT[0], out:true });
  assert.equal(rosterOf(state).length, ROSTER.length - 1);
  assert.ok(!computeStandings(state).some(row => row.player === OUT[0]), "no board row");
  assert.ok(!presentPlayers(state).includes(OUT[0]), "never drawn");
  assert.equal(applyAction(structuredClone(state), "setOut", { player:OUT[0], out:true }, gm()).extra?.unchanged, true);
  /* awards count only who is coming */
  const prompts = { ballots:[{ id:"b1", kind:"awards", status:"open", rev:1, createdAt:1, publishedAt:1,
    questions:[{ id:"q1", title:"MVP", nominees:null, allowSelf:false }] }], responses:{} };
  const ballot = projectPrompts(prompts, { player:ROSTER[0], roster:rosterOf(state) }).ballots[0];
  assert.equal(ballot.of, ROSTER.length - 1);
  /* back on: everything is as it was */
  act(state, "setOut", { player:OUT[0], out:false });
  assert.equal(computeStandings(state).length, ROSTER.length);
  assert.equal(computeStandings(state).find(row => row.player === OUT[0]).pts, START);
});

test("Not coming is refused once the weekend has a record of them, and keeps the slate playable", () => {
  const state = fresh();
  act(state, "announceAndDraw", { evId:"die" });
  const drawn = state.draws.die.teams[0].players[0];
  assert.match(refuse(state, "setOut", { player:drawn, out:true }), /in the Beer Die Doubles draw\. Mark them away instead/);
  /* the floor: Beerio's heats need eight */
  const small = fresh();
  ROSTER.slice(0, ROSTER.length - 8).forEach(player => act(small, "setOut", { player, out:true }));
  assert.match(refuse(small, "setOut", { player:ROSTER.at(-1), out:true }), /at least 8/);
  /* only the commissioner */
  assert.equal(applyAction(fresh(), "setOut", { player:OUT[0], out:true }, as(ROSTER[0])).ok, false);
});

test("a device claimed by a player who is not coming gets the public view", () => {
  const state = fresh();
  act(state, "setOut", { player:OUT[0], out:true });
  const view = publicState(state, { player:OUT[0] });
  assert.ok(!view.standings || !view.standings.some?.(row => row.player === OUT[0]));
});

test("three not coming and one away: QA plays the whole weekend to the crown with ten at the table", () => {
  const state = fresh();
  OUT.forEach(player => act(state, "setOut", { player, out:true }));
  act(state, "setAway", { player:ROSTER[1], away:true });
  const next = structuredClone(state);
  const result = applyAction(next, "qaAdvance", { target:"crowned", seed:7 }, gm({ qa:true, progressReset:true }));
  assert.equal(result.ok, true, result.error);
  assert.ok(next.frozen, "crowned");
  const rows = computeStandings(next);
  assert.equal(rows.length, ROSTER.length - 3);
  const events = allEventsOf(next).filter(ev => !next.shelved?.[ev.id]);
  for (const ev of events) assert.ok(next.results[ev.id], `${ev.name} posted`);
  const everywhere = JSON.stringify({ draws:next.draws, results:next.results, poker:next.poker, stages:next.stages });
  for (const player of OUT) assert.ok(!everywhere.includes(JSON.stringify(player)), `${player} never played`);
  assert.ok(next.poker.seats.length === ROSTER.length - 4, "the table seats who is here");
});

test("poker: the last seat can never bust when an away player sits out", () => {
  const state = fresh();
  act(state, "setAway", { player:ROSTER[0], away:true });
  const next = structuredClone(state);
  assert.equal(applyAction(next, "qaAdvance", { target:"poker:live", seed:3 }, gm({ qa:true, progressReset:true })).ok, true);
  const seats = next.poker.seats;
  assert.ok(!seats.includes(ROSTER[0]));
  seats.slice(0, -1).forEach(player => { if (!next.poker.outs.some(out => out.player === player)) act(next, "pokerBust", { player }); });
  assert.match(refuse(next, "pokerBust", { player:seats.at(-1) }), /.+/);
});

/* ── the winner scene plays itself ── */

test("the winner scene moves to the standings and finishes on its own; the pill never stops for it", () => {
  const state = fresh();
  act(state, "announceEvent", { evId:"putt" }, show());
  const contest = resolveCurrentContest(state, evOf(state, "putt"));
  act(state, "lockAndStart", { evId:"putt", contestId:contest.id, contestRevision:contest.revision }, show());
  act(state, "beginResultEntry", { evId:"putt" }, show());
  act(state, "saveResult", { evId:"putt", slots:[[ROSTER[0]], [ROSTER[1]], [ROSTER[2]]] }, show());
  const scene = state.showControl.active;
  assert.equal(scene.kind, "winner");
  let beat = sceneAutoBeat(state);
  assert.deepEqual([beat.type, beat.payload, beat.at], ["advanceShowScene", { id:scene.id }, scene.startedAt + AUTO_WINNER_HOLD_MS]);
  assert.deepEqual(autoBeat(state, { showControl:true }), beat);
  assert.equal(autoBeat(state, { showControl:false }), null, "no scenes without Show Control");
  /* the pill is already on the next event */
  const pill = resolveDirector(state, allEventsOf(state), { showControl:true }).nextAction;
  assert.notEqual(pill.type, "advance-scene");
  act(state, beat.type, beat.payload, show({ actionId:beat.key }));
  assert.equal(state.showControl.active.step, 1);
  /* a retried beat is a no-op */
  assert.equal(applyAction(state, beat.type, beat.payload, show({ actionId:beat.key })).extra?.unchanged, true);
  beat = sceneAutoBeat(state);
  assert.equal(beat.at, state.showControl.active.updatedAt + AUTO_STANDINGS_HOLD_MS);
  act(state, beat.type, beat.payload, show({ actionId:beat.key }));
  assert.equal(state.showControl.active, null);
  assert.equal(state.showControl.history[0].outcome, "completed");
  assert.equal(sceneAutoBeat(state), null);
});

test("held, the commissioner takes the winner scene by hand", () => {
  const state = fresh();
  act(state, "setAutopilot", { hold:true });
  act(state, "announceEvent", { evId:"putt" }, show());
  const contest = resolveCurrentContest(state, evOf(state, "putt"));
  act(state, "lockAndStart", { evId:"putt", contestId:contest.id, contestRevision:contest.revision }, show());
  act(state, "beginResultEntry", { evId:"putt" }, show());
  act(state, "saveResult", { evId:"putt", slots:[[ROSTER[0]], [], []] }, show());
  assert.equal(autoBeat(state, { showControl:true }), null);
  const pill = resolveDirector(state, allEventsOf(state), { showControl:true }).nextAction;
  assert.deepEqual([pill.type, pill.label], ["advance-scene", "Show standings"]);
  assert.equal(applyAction(state, "setAutopilot", { hold:true }, gm()).extra?.unchanged, true);
  assert.equal(applyAction(fresh(), "setAutopilot", { hold:true }, as(ROSTER[0])).ok, false);
});

/* ── sitting out by choice ── */

test("sitting out: the shape fits who is left, crew still earns, sit-outs earn nothing, ten must play", async () => {
  const { resultAwards } = await import("../shared/core.js");
  const state = fresh();
  const out = ROSTER.slice(0, 3);
  /* Sand Volleyball: 13 here, three sit out, so ten: three teams of three and one crew */
  act(state, "announceAndDraw", { evId:"volley", sitOut:out });
  const draw = state.draws.volley;
  assert.deepEqual(draw.out, out);
  assert.equal(draw.teams.length, 3);
  assert.ok(draw.teams.every(team => team.players.length === 3));
  assert.equal(draw.roles.length, 1, "the one the shape cannot seat is crew");
  const seated = draw.teams.flatMap(team => team.players);
  for (const player of out) assert.ok(!seated.includes(player) && !draw.roles.some(role => role.player === player));
  const awards = resultAwards(state, evOf(state, "volley"), { slots:[draw.teams[0].players, draw.teams[1].players, []] });
  assert.ok(awards.some(row => row.player === draw.roles[0].player && row.place === "crew"), "crew earns 3rd");
  for (const player of out) assert.ok(!awards.some(row => row.player === player), "a sit-out earns nothing");
  /* a fourth would leave nine */
  const short = fresh();
  assert.match(refuse(short, "announceAndDraw", { evId:"volley", sitOut:ROSTER.slice(0, 4) }), /10 need to play/);
  /* pairs: one sits out, twelve play, six pairs and no crew */
  const pairs = fresh();
  act(pairs, "announceAndDraw", { evId:"die", sitOut:[ROSTER[5]] });
  assert.equal(pairs.draws.die.teams.length, 6);
  assert.equal(pairs.draws.die.roles.length, 0);
});

test("the crew check offers Sit out, refits the shape and carries the sit-outs on its one confirm", async () => {
  const { crewCheckModel, crewCheckRun, suggestedCrew } = await import("../src/features/director/crewCheck.js");
  const state = fresh();
  const ev = evOf(state, "volley");
  const out = ROSTER.slice(0, 3);
  const model = crewCheckModel(state, ev, suggestedCrew(state, ev, out), out);
  assert.equal(model.fit.ok, true, model.fit.error);
  assert.equal(model.shape, "3 teams of 3");
  assert.deepEqual(model.roster.filter(item => item.state === "out").map(item => item.player), out);
  assert.equal(model.canSitOut, true);
  const tooMany = crewCheckModel(state, ev, [], ROSTER.slice(0, 4));
  assert.deepEqual([tooMany.fit.ok, tooMany.fit.error], [false, "10 need to play"]);
  const run = crewCheckRun({ write:"announceAndDraw", payload:{ evId:"volley" } }, model.playing, model.crew, model.sitOut);
  assert.deepEqual(run.payload.sitOut, out);
  act(state, run.write, run.payload);
  assert.deepEqual(state.draws.volley.out, out);
  /* a room of ten sits nobody out */
  const ten = fresh();
  ROSTER.slice(-3).forEach(player => act(ten, "setOut", { player, out:true }));
  assert.equal(crewCheckModel(ten, ev, []).canSitOut, false);
});

/* ── crew is the commissioner's call, down to the ten-player shape ── */

test("crew check: extra crew refits the shape, the odd one out is auto crew, 5v5 takes refs and sit-outs", async () => {
  const { crewCheckModel, crewCheckRun } = await import("../src/features/director/crewCheck.js");
  const state = fresh();
  const die = evOf(state, "die");
  /* two crew picked by hand: eleven left, five pairs, one more auto crew */
  const two = [{ player:ROSTER[11], role:"referee" }, { player:ROSTER[12], role:"scorekeeper" }];
  const model = crewCheckModel(state, die, two, []);
  assert.equal(model.fit.ok, true, model.fit.error);
  assert.equal(model.playing.length, 10);
  assert.equal(model.shape, "5 teams of 2");
  assert.equal(model.crew.filter(item => item.auto).length, 1);
  /* set the auto pick back to Playing: someone else takes the seat */
  const autoPick = model.crew.find(item => item.auto).player;
  const kept = crewCheckModel(state, die, two, [], [autoPick]);
  assert.ok(kept.playing.includes(autoPick));
  assert.equal(kept.playing.length, 10);
  const run = crewCheckRun({ write:"announceAndDraw", payload:{ evId:"die" } }, model.playing, model.crew, model.sitOut);
  act(state, run.write, run.payload);
  assert.equal(state.draws.die.teams.length, 5);
  assert.equal(state.draws.die.roles.length, 3);
  /* nine would be too few */
  const many = [ROSTER[9], ROSTER[10], ROSTER[11], ROSTER[12]].map(player => ({ player, role:"referee" }));
  assert.equal(crewCheckModel(fresh(), die, many, []).fit.ok, false);
  /* 5v5: two refs and one sitting out, ten play 5 v 5 */
  const court = fresh();
  const five = evOf(court, "bball5");
  const refs = [{ player:ROSTER[11], role:"referee" }, { player:ROSTER[12], role:"referee" }];
  const m5 = crewCheckModel(court, five, refs, [ROSTER[10]]);
  assert.equal(m5.fit.ok, true, m5.fit.error);
  assert.equal(m5.playing.length, 10);
  const r5 = crewCheckRun({ write:"announceAndDraw", payload:{ evId:"bball5" } }, m5.playing, m5.crew, m5.sitOut);
  act(court, r5.write, r5.payload);
  assert.deepEqual(court.draws.bball5.teams.map(team => team.players.length).sort(), [5, 5]);
  assert.equal(court.draws.bball5.roles.length, 2);
  assert.deepEqual(court.draws.bball5.out, [ROSTER[10]]);
});

/* ── arrivals: Friday starts with people still on the road ── */

/* a guest's check-in carries the code their scan read off the TV; the
   Durable Object hands the reducer its current one (ctx.arriveCode) */
const TV_CODE = "K7QXFDTV";
const scanning = player => ({ ...as(player), arriveCode:TV_CODE });
const scan = player => ({ player, code:TV_CODE });

test("arrivals: the first check-in opens the door, everyone not in is on the way and sits out what is drawn", async () => {
  const { isOnTheWay, isAbsent } = await import("../shared/core.js");
  const state = fresh();
  /* before the door opens nobody is on the way */
  assert.equal(presentPlayers(state).length, ROSTER.length);
  /* weeks early a guest cannot open the door from home */
  assert.match(String(applyAction(structuredClone(state), "setArrived", scan(ROSTER[0]), scanning(ROSTER[0])).error), /opens Friday/);
  /* the commissioner opens it (or Friday arrives); only you can check yourself in */
  act(state, "setArrivalsOpen", { open:true });
  assert.equal(applyAction(state, "setArrived", scan(ROSTER[1]), scanning(ROSTER[0])).ok, false);
  act(state, "setArrived", scan(ROSTER[0]), scanning(ROSTER[0]));
  assert.equal(state.arrivals.open, true);
  assert.deepEqual(presentPlayers(state), [ROSTER[0]]);
  assert.ok(isOnTheWay(state, ROSTER[5]) && isAbsent(state, ROSTER[5]));
  assert.equal(applyAction(structuredClone(state), "setArrived", scan(ROSTER[0]), scanning(ROSTER[0])).extra?.unchanged, true);
  /* nine more arrive (one by the commissioner): a free-for-all plays the ten who are here */
  ROSTER.slice(1, 9).forEach(player => act(state, "setArrived", scan(player), scanning(player)));
  act(state, "setArrived", { player:ROSTER[9] });
  assert.equal(presentPlayers(state).length, 10);
  act(state, "announceEvent", { evId:"putt" });
  const contest = resolveCurrentContest(state, evOf(state, "putt"));
  assert.equal(contest.sides.length, 10);
  /* a late arrival joins the open free-for-all as a side */
  act(state, "setArrived", scan(ROSTER[12]), scanning(ROSTER[12]));
  const after = resolveCurrentContest(state, evOf(state, "putt"));
  assert.equal(after.sides.length, 11);
  assert.ok(after.revision > contest.revision, "phones re-read the sides");
  /* the commissioner can send someone back to on the way, or close the door */
  act(state, "setArrived", { player:ROSTER[12], arrived:false });
  assert.ok(isOnTheWay(state, ROSTER[12]));
  act(state, "setArrivalsOpen", { open:false });
  assert.equal(presentPlayers(state).length, ROSTER.length, "a closed door counts everyone here");
});

test("arrivals: a draw only takes who is here; on the way can still bet", () => {
  const state = fresh();
  act(state, "setArrivalsOpen", { open:true });
  ROSTER.slice(0, 10).forEach(player => act(state, "setArrived", scan(player), scanning(player)));
  act(state, "announceAndDraw", { evId:"die" });
  const drawn = state.draws.die.teams.flatMap(team => team.players);
  assert.equal(drawn.length, 10, "five pairs of the ten here");
  for (const player of ROSTER.slice(10)) assert.ok(!drawn.includes(player));
});
