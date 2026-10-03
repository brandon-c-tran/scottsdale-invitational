/* QA fast-forward and checkpoints: one server write reaches any named point
   of the weekend through the real reducers, and checkpoints save and
   restore game progress under the game-progress reset contract. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_STATE, LOGISTICS, MAX_RISK, PT, ROSTER, RESET_PROGRESS_CONFIRMATION, START,
  allEventsOf, atRisk, computeStandings, duelReserve, makeBracket, maxRisk, pokerLive,
  postCountRulingApplies, resolveCurrentContest, resolveWager, stacksPosted, suggestParticipants,
} from "../shared/core.js";
import { confirmPayload, qaPrompt } from "../src/features/qa/useQaFast.js";
import { resolveDirector } from "../shared/show.js";
import { checkInComplete } from "../shared/checkin.js";
import {
  QA_PROGRESS_KEYS, parseQaTarget, qaCheckpointSummary, qaEventStage, qaPokerStage, qaSlate, qaTargets,
} from "../shared/qa.js";
import { applyAction } from "../worker/actions.js";
import { qaNeedsRewind } from "../worker/qa.js";
import { Tournament } from "../worker/tournament.js";
import { publicState } from "../worker/publicState.js";
import { isPortableStorageKey } from "../worker/snapshot.js";

const LOCAL = { isGm:true, qa:true, progressReset:true, environment:"local" };
const PRODUCTION = { ...LOCAL, environment:"production" };
const empty = () => structuredClone(EMPTY_STATE);

/* the Durable Object's contract: the handler runs on a copy, kept only on ok */
function advance(state, target, { ctx = LOCAL, ...payload } = {}) {
  const next = structuredClone(state);
  const result = applyAction(next, "qaAdvance", { target, seed:7, ...payload }, ctx);
  return { result, state:result.ok ? next : state };
}
function reach(target, from = empty(), options = {}) {
  const { result, state } = advance(from, target, options);
  assert.equal(result.ok, true, `${target}: ${result.error}`);
  return { state, extra:result.extra };
}

const slateOf = state => qaSlate(state, allEventsOf(state));
const eventById = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const pendingOn = (state, contest) => (state.wagers || []).filter(wager => wager.eventId === contest.eventId
  && wager.contestId === contest.id && resolveWager(state, wager, allEventsOf(state)).status === "pending");

/* What must hold on any board a fast-forward produces. */
function assertCoherent(state, label) {
  const events = allEventsOf(state);
  const rows = computeStandings(state);
  const stacks = Object.values(state.results || {}).find(result => result?.stacks) || null;
  for (const row of rows) {
    const rulings = (state.adjustments || []).filter(a => !a.removedAt && a.player === row.player);
    if (stacks) {
      const after = rulings.filter(a => postCountRulingApplies(a, stacks)).reduce((sum, a) => sum + a.delta, 0);
      assert.equal(row.pts, (stacks.stacks[row.player] ?? 0) + after, `${label}: ${row.player} is their counted stack`);
    } else {
      const ruled = rulings.reduce((sum, a) => sum + a.delta, 0);
      assert.equal(row.pts, START + row.awardPts + row.mvpPts + row.betNet + row.duelNet + ruled,
        `${label}: ${row.player} standings are derived`);
    }
  }
  for (const wager of state.wagers || []) {
    const status = resolveWager(state, wager, events).status;
    assert.ok(["won", "lost", "pending", "void"].includes(status), `${label}: wager resolves`);
    if (wager.status === "void") continue;
    assert.notEqual(status, "void", `${label}: no live wager points at a stale draw or stage`);
    if (wager.drawId && wager.kind === "match") assert.equal(state.draws[wager.eventId]?.id, wager.drawId);
    if (wager.stagesId) assert.equal(state.stages[wager.eventId]?.id, wager.stagesId);
    if (status === "pending") {
      const contest = resolveCurrentContest(state, eventById(state, wager.eventId));
      assert.equal(wager.contestId, contest?.id, `${label}: pending chips ride the current contest only`);
    }
    assert.ok(wager.stake >= PT && wager.stake % PT === 0, `${label}: stakes move in 100s`);
  }
  if (!pokerLive(state) && !stacksPosted(state))
    for (const row of rows) {
      const exposure = atRisk(state, row.player, events) + duelReserve(state, row.player);
      assert.ok(exposure <= Math.max(MAX_RISK, maxRisk(row.pts)), `${label}: ${row.player} inside the cap`);
    }
  assert.ok(!Object.keys(state.wagerOps || {}).some(key => key.includes("qa-sim")),
    `${label}: synthetic retry ledger entries leave with the run`);
  assert.equal(state.showControl?.active ?? null, null, `${label}: no scene started`);
  const beat = resolveDirector(state, events, { showControl:true }).nextAction?.type;
  assert.notEqual(beat, "replay-winner-scene", `${label}: the director owes no skipped ceremony`);
  const onDeck = state.onDeck;
  if (onDeck) assert.equal(resolveCurrentContest(state, eventById(state, onDeck))?.phase, "betting-open");
  const ids = (state.duels || []).map(duel => duel.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: duel ids are unique`);
}

test("targets parse against the slate and reject anything else", () => {
  const state = empty();
  assert.deepEqual(parseQaTarget(state, "event:die:mid"), { kind:"event", key:"event:die:mid", evId:"die", phase:"mid", index:1 });
  assert.deepEqual(parseQaTarget(state, "event:8ball:mid"), { kind:"event", key:"event:8ball:mid", evId:"8ball", phase:"mid", index:7 });
  assert.equal(parseQaTarget(state, "session:fri").evId, "where", "a session ends at its last event");
  assert.equal(parseQaTarget(state, "poker:live").phase, "live");
  for (const bad of ["event:poker:open", "event:nope:open", "event:putt:late", "poker:dealt", "session:fin",
    "event:putt:open:x", 7, null, "x".repeat(90)])
    assert.equal(parseQaTarget(state, bad), null, String(bad));
  const shelved = { ...empty(), shelved:{ putt:true } };
  assert.equal(parseQaTarget(shelved, "event:putt:open"), null, "a shelved event is not a target");
  const listed = qaTargets(state);
  assert.equal(listed.sessions.flatMap(session => session.events).length, slateOf(state).length);
  assert.equal(listed.poker.length, 3);
});

test("locker room: every untouched slot checked in, chips claimed, not live", () => {
  const { state } = reach("locker");
  assert.equal(state.live, false);
  assert.equal(Object.keys(state.results).length, 0);
  for (const player of ROSTER) assert.ok(checkInComplete(state, player), `${player} checked in`);
  const colors = ROSTER.map(player => state.profiles[player].color);
  assert.equal(new Set(colors).size, ROSTER.length, "colors are first come first serve");
  assertCoherent(state, "locker");
});

test("a touched profile is never filled, and production fills nothing", () => {
  const start = empty();
  start.profiles.Evan = { size:"L" };
  const { state } = reach("locker", start);
  assert.deepEqual(state.profiles.Evan, { size:"L" }, "half-filled answers stay exactly as the guest left them");
  assert.equal(state.seeds.Evan, undefined);
  const prod = reach("event:putt:done", empty(), { ctx:PRODUCTION, confirm:RESET_PROGRESS_CONFIRMATION });
  assert.deepEqual(prod.state.profiles, {}, "production never gets plausible fakes");
  assert.ok(prod.state.results.putt, "the game still plays without profiles");
});

test("every event reaches open, mid and done from an empty board", () => {
  for (const ev of slateOf(empty())) {
    for (const phase of ["open", "mid", "done"]) {
      const { state } = reach(`event:${ev.id}:${phase}`);
      const label = `${ev.id}:${phase}`;
      const slate = slateOf(state);
      const index = slate.findIndex(item => item.id === ev.id);
      slate.slice(0, index).forEach(item => assert.ok(state.results[item.id], `${label}: ${item.id} played first`));
      slate.slice(index + 1).forEach(item => assert.equal(qaEventStage(state, item), 0, `${label}: ${item.id} untouched`));
      const target = eventById(state, ev.id);
      const contest = resolveCurrentContest(state, target);
      if (phase === "open") {
        assert.equal(state.onDeck, ev.id, `${label}: on deck`);
        assert.equal(contest.phase, "betting-open");
        assert.equal(state.eventOps[ev.id].contestStack?.length || 0, 0, `${label}: nothing decided`);
        assert.ok(pendingOn(state, contest).length > 0, `${label}: bets are down`);
      } else if (phase === "mid") {
        assert.equal(state.results[ev.id], undefined, `${label}: no result yet`);
        if (state.eventOps[ev.id].contestStack?.length) {
          assert.equal(contest.phase, "betting-open", `${label}: the next contest is open`);
          assert.ok(pendingOn(state, contest).length > 0, `${label}: with bets on it`);
        } else {
          assert.equal(contest.phase, "in-progress", `${label}: the only contest is under way`);
          assert.ok(pendingOn(state, contest).length > 0, `${label}: bets locked in`);
        }
      } else {
        assert.ok(state.results[ev.id], `${label}: result posted`);
        assert.equal(state.onDeck, null);
      }
      assert.equal(state.live, true);
      assertCoherent(state, label);
    }
  }
});

test("sessions, the finale stages and the crown", () => {
  const fri = reach("session:fri").state;
  slateOf(fri).filter(ev => ev.session === "fri").forEach(ev => assert.ok(fri.results[ev.id]));
  assert.equal(qaEventStage(fri, eventById(fri, "bball5")), 0, "Saturday is untouched");
  assertCoherent(fri, "session:fri");

  const set = reach("poker:set").state;
  assert.equal(qaPokerStage(set), 1);
  slateOf(set).forEach(ev => assert.ok(set.results[ev.id], `${ev.id} played before the table`));
  assertCoherent(set, "poker:set");

  const live = reach("poker:live").state;
  assert.equal(pokerLive(live), true);
  assert.ok(live.poker.outs.length > 0, "busts are in");
  assert.ok(Object.keys(live.poker.counts).length > 0, "counts have started");
  assertCoherent(live, "poker:live");

  const counted = reach("poker:counted").state;
  assert.equal(stacksPosted(counted), true);
  const result = counted.results.poker;
  const total = Object.values(result.stacks).reduce((sum, count) => sum + count, 0);
  assert.equal(total, counted.poker.total, "counts sum to the dealt chips");
  assertCoherent(counted, "poker:counted");

  const crowned = reach("crowned").state;
  assert.equal(crowned.frozen, true);
  assert.equal(computeStandings(crowned)[0].rank, 1);
  assertCoherent(crowned, "crowned");
});

test("crowned from empty is one fast write, and a seed repeats the weekend", () => {
  const started = performance.now();
  const first = reach("crowned", empty(), { seed:1234 });
  const elapsed = performance.now() - started;
  console.log(`# crowned from empty: ${elapsed.toFixed(0)} ms, ${first.extra.writes} reducer writes, `
    + `${first.extra.bets} bets, ${first.extra.duels} duels, ${first.extra.contests} contests`);
  assert.ok(elapsed < 3000, `crowned took ${elapsed} ms`);
  const second = reach("crowned", empty(), { seed:1234 });
  const shape = state => ({
    standings:computeStandings(state).map(row => [row.player, row.pts]),
    results:Object.fromEntries(Object.entries(state.results).map(([id, result]) => [id, result.slots])),
    bets:state.wagers.map(wager => [wager.player, wager.eventId, wager.stake, wager.pick, wager.teamIdx, wager.pickKey]),
  });
  assert.deepEqual(shape(second.state), shape(first.state));
  assert.equal(first.extra.seed, 1234);
  const other = reach("crowned", empty(), { seed:99 });
  assert.notDeepEqual(shape(other.state).results, shape(first.state).results, "another seed plays another weekend");
  assert.ok(Math.abs(Date.now() - new Date().getTime()) < 50, "the real clock is back");
  assert.notEqual(Math.random(), Math.random(), "the real generator is back");
  const stamps = Object.values(first.state.results).map(result => result.ts);
  assert.equal(new Set(stamps).size, stamps.length, "results carry increasing times");
});

test("from a mid-weekend board it plays forward and keeps what really happened", () => {
  let { state } = reach("event:die:open");
  const ev = eventById(state, "die");
  const contest = resolveCurrentContest(state, ev);
  const player = ROSTER.find(p => !contest.players.includes(p));
  const real = applyAction(state, "placeWager", { wager:{ kind:"match", eventId:"die", evName:ev.name,
    drawId:contest.drawId, match:[...contest.match], matchName:contest.label, teamIdx:contest.sides[0].key,
    contestId:contest.id, contestRevision:contest.revision, pickPlayers:contest.sides[0].players, pickTeam:true,
    stake:PT } }, { player, deviceId:"real-phone", actionId:"tap-1" });
  assert.equal(real.ok, true, real.error);
  const drawId = state.draws.die.id;
  const moved = reach("session:sam", state);
  assert.equal(moved.extra.rewound, false);
  state = moved.state;
  assert.equal(state.draws.die.id, drawId, "the real draw stays");
  const kept = state.wagers.find(wager => wager.id === real.extra.wagerId);
  assert.ok(kept, "the real bet survives and settles");
  assert.ok(["won", "lost"].includes(resolveWager(state, kept, allEventsOf(state)).status));
  assert.ok(state.wagerOps["request:real-phone:tap-1"], "a real phone's retry ledger stays");
  assertCoherent(state, "forward");

  /* an event already under way before the target finishes first */
  let mid = reach("event:pong:mid").state;
  mid = reach("event:trivia:open", mid).state;
  assert.ok(mid.results.pong);
  assertCoherent(mid, "finish then open");
});

test("a target behind the board rewinds through a game-progress reset", () => {
  const { state } = reach("event:pickleball:done");
  const keep = { profiles:state.profiles, seeds:state.seeds, logistics:state.logistics };
  const refused = advance(state, "event:die:open").result;
  assert.equal(refused.ok, false);
  assert.equal(refused.extra.needsConfirm, true);
  assert.match(refused.error, /^Replaces \d+ results and \d+ bets$/);
  const back = reach("event:die:open", state, { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(back.extra.rewound, true);
  assert.equal(back.state.results.pickleball, undefined);
  assert.ok(back.state.results.putt);
  assert.deepEqual({ profiles:back.state.profiles, seeds:back.state.seeds, logistics:back.state.logistics }, keep);
  assertCoherent(back.state, "rewound");
  for (const [key, from] of [["locker", state], ["poker:set", reach("crowned").state], ["event:putt:open", reach("event:putt:mid").state]])
    assert.equal(qaNeedsRewind(from, parseQaTarget(from, key)), true, key);
  assert.equal(qaNeedsRewind(state, parseQaTarget(state, "crowned")), false);
});

test("reaching the same place twice changes nothing", () => {
  const { state } = reach("event:beerio:mid");
  const again = advance(state, "event:beerio:mid").result;
  assert.equal(again.ok, true);
  assert.equal(again.extra.unchanged, true);
  const done = reach("event:beerio:done").state;
  assert.equal(advance(done, "event:beerio:done").result.extra.unchanged, true);
});

test("Sim contest and Finish event step the current event only", () => {
  let state = reach("locker").state;
  state = reach("step", state).state;
  assert.equal(state.onDeck, "putt", "an unannounced event opens first");
  state = reach("step", state).state;
  assert.ok(state.results.putt, "a free-for-all is one contest");
  state = reach("step", state).state;
  assert.equal(state.onDeck, "die");
  state = reach("step", state).state;
  assert.equal(state.eventOps.die.contestStack.length, 1, "one contest decided");
  assert.equal(resolveCurrentContest(state, eventById(state, "die")).phase, "betting-open", "the next is open");
  state = reach("finish", state).state;
  assert.ok(state.results.die);
  assert.equal(qaEventStage(state, eventById(state, "where")), 0, "finish stops at the result");
  assertCoherent(state, "steps");

  let poker = reach("poker:counted").state;
  poker = reach("step", poker).state;
  assert.equal(poker.frozen, true, "after the counts, the step is the crown");
  const none = advance(poker, "step").result;
  assert.equal(none.ok, false);
  assert.equal(none.error, "Nothing left to play");
});

test("a captains draft left running is finished the way a commissioner would, and prep is not progress", () => {
  let state = reach("session:fri").state;
  const ev = eventById(state, "bball5");
  const suggestion = suggestParticipants(state, ev);
  const captains = suggestion.players.slice(0, ev.teamCfg.teams);
  const started = applyAction(state, "startDraft", { evId:"bball5", captains, players:suggestion.players,
    roles:suggestion.roles }, LOCAL);
  assert.equal(started.ok, true, started.error);
  const drawn = applyAction(state, "runDraw", { evId:"volley", ...suggestParticipants(state, eventById(state, "volley")) }, LOCAL);
  assert.equal(drawn.ok, true, drawn.error);
  assert.equal(qaEventStage(state, eventById(state, "volley")), 0, "a draw alone is preparation");
  assert.equal(qaNeedsRewind(state, parseQaTarget(state, "event:bball5:open")), false);
  const volleyDraw = state.draws.volley.id;
  state = reach("event:volley:open", state).state;
  assert.equal(state.draws.bball5.method, "draft", "the draft became the teams");
  assert.deepEqual(state.draws.bball5.teams.map(team => team.captain), captains);
  assert.deepEqual(state.draws.bball5.teams.map(team => team.players.length).sort(), [6, 7], "everyone plays, seven and six");
  assert.equal(state.draws.volley.id, volleyDraw, "a prepared draw is kept");
  assertCoherent(state, "draft");
});

test("the sheet's model marks where the board is, and prompts follow the environment", () => {
  const state = reach("event:die:mid").state;
  const listed = qaTargets(state);
  const fri = listed.sessions.find(session => session.id === "fri");
  const putt = fri.events.find(row => row.id === "putt");
  const pool = fri.events.find(row => row.id === "die");
  assert.deepEqual(putt.phases.map(phase => phase.reached), [true, true, true]);
  assert.deepEqual(pool.phases.map(phase => [phase.reached, phase.current, phase.rewinds]),
    [[true, false, true], [true, true, false], [false, false, false]]);
  assert.equal(listed.locker.rewinds, true);
  assert.equal(listed.locker.current, false);
  assert.equal(qaTargets(empty()).locker.current, true);
  assert.deepEqual(qaTargets(reach("poker:live").state).poker.map(item => [item.reached, item.current]),
    [[true, false], [true, true], [false, false]]);
  assert.equal(qaCheckpointSummary(state).label, "Beer Die Doubles · Mid");
  const needs = { ok:false, error:"Replaces 1 result and 9 bets", extra:{ needsConfirm:true, production:false } };
  assert.equal(qaPrompt(needs, { production:false }).auto, true, "staging confirms a rewind itself");
  assert.equal(qaPrompt(needs, { production:true }).auto, false, "production always asks");
  assert.equal(qaPrompt({ ok:false, error:"x", extra:{ needsConfirm:true, production:true } }, { production:false }).auto, false);
  const cards = qaPrompt({ ok:false, error:"Cards are live at the table", extra:{ needsPokerConfirm:true } }, { production:false });
  assert.equal(cards.poker, true);
  assert.equal(cards.auto, undefined, "live cards always ask");
  assert.deepEqual(confirmPayload({ target:"crowned" }, cards), { target:"crowned", confirmPokerLive:true });
  assert.deepEqual(confirmPayload({ id:"cp1" }, { poker:false }), { id:"cp1", confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(qaPrompt({ ok:false, error:"Nope" }, { production:false }), null);
});

test("brackets of any supported size, byes and one-player entrants play generically", () => {
  const sizes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].filter(n => makeBracket(n) && n <= ROSTER.length);
  assert.ok(sizes.includes(3) && sizes.includes(5));
  for (const n of sizes) {
    const state = empty();
    state.customEvents = [{ id:`qa${n}`, custom:true, name:`Solo ${n}`, value:1200, kind:"solo", session:"fri",
      teamCfg:{ teams:n, size:1, bracket:n } }];
    state.eventOrder = [`qa${n}`];
    const mid = reach(`event:qa${n}:mid`, state).state;
    assert.equal(mid.draws[`qa${n}`].teams.length, n);
    assert.ok(mid.draws[`qa${n}`].teams.every(team => team.players.length === 1));
    assertCoherent(mid, `bracket ${n} mid`);
    const done = reach(`event:qa${n}:done`, mid).state;
    const result = done.results[`qa${n}`];
    assert.equal(result.slots[0].length, 1, `bracket ${n}: one champion`);
    const matches = makeBracket(n).rounds.flat().length;
    assert.equal(done.eventOps[`qa${n}`].contestStack.length, matches, `bracket ${n}: every match recorded`);
    assertCoherent(done, `bracket ${n} done`);
  }
});

test("gating: commissioner, the QA capability, production confirmation, live cards", () => {
  const state = empty();
  assert.equal(applyAction(structuredClone(state), "qaAdvance", { target:"locker" }, { ...LOCAL, isGm:false, player:"Evan" }).error,
    "Commissioner only");
  assert.equal(applyAction(structuredClone(state), "qaAdvance", { target:"locker" }, { ...LOCAL, qa:false }).error,
    "QA is unavailable");
  assert.equal(applyAction(structuredClone(state), "qaAdvance", { target:"nowhere" }, LOCAL).error, "Unknown QA target");
  /* anything not local or staging is production */
  for (const environment of ["production", undefined, "preview"]) {
    const refused = advance(state, "event:putt:open", { ctx:{ ...LOCAL, environment } }).result;
    assert.equal(refused.ok, false, String(environment));
    assert.equal(refused.extra.needsConfirm, true);
    assert.equal(refused.extra.production, true);
  }
  assert.equal(advance(state, "event:putt:open", { ctx:PRODUCTION, confirm:"yes" }).result.ok, false,
    "only the exact reset confirmation");
  assert.equal(advance(state, "event:putt:open", { ctx:PRODUCTION, confirm:RESET_PROGRESS_CONFIRMATION }).result.ok, true);
  /* a rewind is a reset: it needs the reset capability */
  const played = reach("event:putt:done").state;
  assert.equal(advance(played, "locker", { ctx:{ ...LOCAL, progressReset:false }, confirm:RESET_PROGRESS_CONFIRMATION }).result.error,
    "Game progress reset is unavailable");
  /* live cards refuse everything until confirmed, even with the reset confirmation */
  const live = reach("poker:live").state;
  const blocked = advance(live, "crowned", { confirm:RESET_PROGRESS_CONFIRMATION }).result;
  assert.equal(blocked.ok, false);
  assert.equal(blocked.extra.needsPokerConfirm, true);
  assert.equal(advance(live, "crowned", { confirmPokerLive:true }).result.ok, true);
});

/* ── the Durable Object: checkpoints, backups, projections ── */
const memoryContext = () => {
  const entries = new Map();
  const sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
  };
  return { entries, sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage } };
};
const socketFor = memory => {
  let attachment = null;
  const ws = { frames:[], raw:[],
    send(frame) { ws.raw.push(frame); ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
const GM_TOKEN = "gm-token-for-qa-fast";
let seq = 0;
async function objectWith(env = {}) {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { APP_ENV:"local", QA_ENABLED:"true",
    PROGRESS_RESET_ENABLED:"true", M2_SHOW_CONTROL_ENABLED:"true", ...env });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  const gm = socketFor(memory), guest = socketFor(memory), tv = socketFor(memory);
  const say = async (ws, deviceId, type, payload = {}, { asGm = false } = {}) => {
    const actionId = `q${++seq}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, type, payload, deviceId,
      ...(asGm ? { gmToken:GM_TOKEN } : {}) }));
    return ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
  };
  await say(gm, "device-gm", "hello", {}, { asGm:true });
  await say(guest, "device-guest", "hello");
  await say(tv, "device-tv", "hello", { view:"tv" });
  await say(guest, "device-guest", "claim", { player:"Evan" });
  const asGm = (type, payload) => say(gm, "device-gm", type, payload, { asGm:true });
  return { memory, tournament, gm, guest, tv, say, asGm };
}

test("checkpoints save privately and restore only game progress, behind a backup", async () => {
  const { memory, tournament, gm, guest, tv, say, asGm } = await objectWith();
  memory.entries.set("photo:Evan", "data:image/jpeg;base64,AAAA");
  memory.entries.set("private:gm:tokens", { a:{ token:"x", createdAt:1 } });
  assert.equal((await asGm("qaAdvance", { target:"event:pong:mid", seed:3 })).ok, true);
  const atSave = structuredClone(tournament.state);
  const framesBefore = [gm, guest, tv].map(ws => ws.frames.length);
  const saved = await asGm("qaCheckpointSave", { name:"  Pong   mid  " });
  assert.equal(saved.ok, true);
  assert.equal(saved.extra.checkpoints[0].name, "Pong mid");
  assert.equal(saved.extra.checkpoints[0].summary.label, qaCheckpointSummary(atSave).label);
  assert.deepEqual([guest, tv].map(ws => ws.frames.length), framesBefore.slice(1), "saving broadcasts nothing");
  const id = saved.extra.checkpoints[0].id;
  assert.ok(memory.entries.has(`private:qa:checkpoint:${id}`));
  assert.ok(!isPortableStorageKey(`private:qa:checkpoint:${id}`) && !isPortableStorageKey("private:qa:checkpoints"));
  const snapshot = await tournament.createSnapshot();
  assert.ok(!snapshot.entries.some(entry => entry.key.includes("qa:")), "never in a snapshot");

  /* the guest cannot list, save, or restore */
  assert.equal((await say(guest, "device-guest", "qaCheckpoints")).error, "Commissioner only");
  assert.equal((await say(guest, "device-guest", "qaRestore", { id })).error, "Commissioner only");

  /* move on, and change what a restore must never touch */
  assert.equal((await asGm("qaAdvance", { target:"crowned" })).ok, true);
  assert.equal((await asGm("saveProfile", { player:"Evan", display:"Evan T" })).ok, true);
  assert.equal((await asGm("addEvent", { ev:{ id:"late1", name:"Late Game", value:400, kind:"solo" } })).ok, true);
  assert.equal((await asGm("saveLogistics", { venueNote:"Gate code 12" })).ok, true);
  const before = structuredClone(tournament.state);
  const claims = structuredClone(tournament.claims);

  const refused = await asGm("qaRestore", { id });
  assert.equal(refused.ok, false, "restoring over results takes the confirmation");
  assert.equal(refused.extra.needsConfirm, true);
  const restored = await asGm("qaRestore", { id, confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(restored.ok, true, restored.error);
  assert.ok(restored.extra.backupKey?.startsWith("m1:pre-reset:"), "the rotating pre-reset backup comes first");
  const state = tournament.state;
  for (const key of QA_PROGRESS_KEYS)
    assert.deepEqual(state[key], atSave[key], `${key} is the checkpoint's`);
  for (const key of ["profiles", "seeds", "logistics", "onboardEpoch", "customEvents", "eventEdits", "eventOrder"])
    assert.deepEqual(state[key], before[key], `${key} is untouched`);
  assert.equal(state.profiles.Evan.display, "Evan T");
  assert.equal(state.logistics.venueNote, "Gate code 12");
  assert.deepEqual(state.wagerOps, {}, "the retry ledger clears as in a reset");
  assert.deepEqual(tournament.claims, claims);
  assert.equal(memory.entries.get("photo:Evan"), "data:image/jpeg;base64,AAAA");
  assert.deepEqual(memory.entries.get("private:gm:tokens"), { a:{ token:"x", createdAt:1 } });
  assert.equal([...memory.entries.keys()].filter(key => key.startsWith("m1:pre-reset:") && key.endsWith(":manifest")).length, 1,
    "one rotating backup");
  assert.ok(memory.entries.has(`private:qa:checkpoint:${id}`), "the checkpoint survives its restore");

  /* every frame, for every viewer, is free of checkpoints */
  for (const ws of [gm, guest, tv])
    for (const raw of ws.raw.filter(frame => JSON.parse(frame).type === "state"))
      assert.ok(!raw.includes(id) && !raw.includes("Pong mid") && !raw.includes("\"savedAt\""), "no frame carries a checkpoint");
  for (const viewer of [{ isGm:true }, { player:"Evan" }, {}])
    assert.ok(!JSON.stringify(publicState(state, viewer)).includes(id));

  /* delete, then the id is gone */
  const removed = await asGm("qaCheckpointDelete", { id });
  assert.deepEqual(removed.extra.checkpoints, []);
  assert.equal(memory.entries.has(`private:qa:checkpoint:${id}`), false);
  assert.equal((await asGm("qaRestore", { id, confirm:RESET_PROGRESS_CONFIRMATION })).error, "No such checkpoint");
});

test("checkpoints: capacity, capability, production and live cards", async () => {
  const off = await objectWith({ QA_ENABLED:"false" });
  assert.equal((await off.asGm("qaCheckpoints")).error, "QA is unavailable");
  assert.equal((await off.asGm("qaAdvance", { target:"locker" })).error, "QA is unavailable");

  const noReset = await objectWith({ PROGRESS_RESET_ENABLED:"false" });
  const kept = await noReset.asGm("qaCheckpointSave", {});
  assert.equal(kept.ok, true);
  assert.equal((await noReset.asGm("qaRestore", { id:kept.extra.saved, confirm:RESET_PROGRESS_CONFIRMATION })).error,
    "Game progress reset is unavailable");

  const { asGm } = await objectWith();
  for (let i = 0; i < 10; i++) assert.equal((await asGm("qaCheckpointSave", { name:`n${i}` })).ok, true);
  const full = await asGm("qaCheckpointSave", { name:"eleven" });
  assert.equal(full.ok, false);
  assert.match(full.error, /Delete one first/);
  const list = (await asGm("qaCheckpoints")).extra.checkpoints;
  assert.equal(list.length, 10);
  assert.equal(list[0].name, "n9", "newest first");
  assert.equal(list[9].summary.label, "Locker room");

  const prod = await objectWith({ APP_ENV:"production" });
  const point = (await prod.asGm("qaCheckpointSave", {})).extra.saved;
  const unconfirmed = await prod.asGm("qaRestore", { id:point });
  assert.equal(unconfirmed.extra.production, true);
  assert.equal((await prod.asGm("qaAdvance", { target:"event:putt:open" })).extra.needsConfirm, true);
  assert.equal((await prod.asGm("qaAdvance", { target:"poker:live", confirm:RESET_PROGRESS_CONFIRMATION })).ok, true);
  const cards = await prod.asGm("qaRestore", { id:point, confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(cards.extra.needsPokerConfirm, true, "live cards refuse a restore until confirmed");
  const back = await prod.asGm("qaRestore", { id:point, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true });
  assert.equal(back.ok, true, back.error);
  assert.equal(prod.tournament.state.poker, null);
  assert.deepEqual(prod.tournament.state.profiles, {}, "production was never filled");
});

test("a restored checkpoint must be well formed and from this version", () => {
  const state = empty();
  const checkpoint = { id:"cpabcdef12", name:"x", v:9, progress:{ wagers:{} } };
  assert.equal(applyAction(state, "qaRestore", { id:checkpoint.id }, { ...LOCAL, qaCheckpoint:checkpoint }).error,
    "That checkpoint is damaged");
  assert.equal(applyAction(state, "qaRestore", { id:checkpoint.id },
    { ...LOCAL, qaCheckpoint:{ ...checkpoint, v:99, progress:{} } }).error, "That checkpoint is from a newer version");
  assert.equal(applyAction(state, "qaRestore", { id:"cpother1234" }, { ...LOCAL, qaCheckpoint:checkpoint }).error,
    "No such checkpoint");
  assert.deepEqual(state.logistics, { ...LOGISTICS }, "a refused restore changes nothing");
});

/* ── the console itself, rendered ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { QASheet } from "./src/features/qa/QASheet.jsx";
    export { QABar } from "./src/features/qa/QABar.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const consoleModule = new Module(fileURLToPath(new URL("qa-fast.cjs", import.meta.url)));
consoleModule.filename = consoleModule.id;
consoleModule.paths = Module._nodeModulePaths(root);
consoleModule._compile(compiled.outputFiles[0].text, consoleModule.filename);
const { QASheet, QABar, PlayerIdentityProvider } = consoleModule.exports;
const inProvider = (state, element) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider,
  { profiles:state.profiles || {} }, element));

test("the console: Step, Bets, Jump to, Lens, Checkpoints and Reset, every target 44px", () => {
  const state = reach("event:8ball:mid").state;
  const status = { environment:"staging", version:3, schema:9, profiles:13, completed:1, total:17, pendingWagers:6,
    openDuels:0, current:"8-Ball Doubles", phase:"Betting open", next:"Lock bets and start", blockers:[] };
  const noop = () => {};
  const market = { contestId:"c1", contestRevision:1, label:"Final", bets:6, chips:1400 };
  const props = { state, status, me:"Evan", guestLens:false, busy:false, market,
    environment:"staging", dispatch:async () => ({ ok:true }), notify:noop, onSwitch:noop, onLens:noop, onPlayLive:noop,
    onDuelMe:noop, onDuels:noop, pokerOn:false, onBustOne:noop, onCountRest:noop, onRerun:noop,
    onReplayMine:noop, onResetRequest:noop, onExit:noop, onClose:noop };
  const html = inProvider(state, React.createElement(QASheet, props));
  for (const text of ["Step", "Bets", "Jump to", "Lens", "Checkpoints", "Reset", "Sim contest", "Finish event", "Play live",
    "Everyone bets", "Back the favorite", "Spread evenly", "Clear bets", "Locker room",
    "Friday Night", "Saturday Night", "Finale", "Crowned", "Reset game progress", "Guest view"])
    assert.ok(html.includes(text), text);
  /* the order: Step, Bets, Jump to, Lens, Checkpoints, Reset last */
  const order = ["Step", "Bets", "Jump to", "Lens", "Checkpoints", "Reset"]
    .map(label => html.search(new RegExp(`<span>${label}</span>(<span class="fd-qa-aside">[^<]*</span>)?</h3>`)));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), `sections in order: ${order}`);
  for (const ev of slateOf(state)) assert.ok(html.includes(`aria-label="${ev.name.replace("&", "&amp;")}: Mid"`), ev.name);
  assert.equal((html.match(/class="is-current"/g) || []).length, 1, "one place is current");
  assert.ok(html.includes('aria-label="8-Ball Doubles: Mid" class="is-current"'));
  const text = html.replace(/<[^>]+>/g, " ");
  assert.ok(!/—|!/.test(text), "no em dashes or exclamation marks");
  assert.doesNotMatch(text, /releases every claimed|keeps people, travel/, "no explanatory sentences");
  /* no contest taking bets: the bets actions are off */
  const closed = inProvider(state, React.createElement(QASheet, { ...props, market:null }));
  assert.match(closed, /<button type="button" class="fd-qa-bet" disabled="">Everyone bets/);
  const css = readFileSync(new URL("../src/features/qa/qa.css", import.meta.url), "utf8");
  for (const rule of [".fd-qa-seg button {", ".fd-qa-end {", ".fd-qa-strip-btn {", ".fd-qa-strip-open {", ".fd-qa-players button {", ".fd-qa-bet {"])
    assert.match(css.slice(css.indexOf(rule)).split("}")[0], /(min-height|height):4[4-8]px/, rule);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css), "tokens only");
  const strip = extra => inProvider(state, React.createElement(QABar, { status, sim:null, onStop:noop, guestLens:false,
    onLens:noop, onOpen:noop, market, dispatch:async () => ({ ok:true }), environment:"staging", notify:noop, ...extra }));
  const bar = strip();
  assert.match(bar, /data-qa-open="true"[^>]*aria-label="QA console, Staging"/, "the strip opens the console");
  assert.match(bar, /aria-label="Everyone bets"/, "one-tap bets while a contest takes them");
  assert.match(bar, /aria-label="Sim contest"/);
  assert.doesNotMatch(strip({ market:null }), /Everyone bets/, "no bets button while nothing takes bets");
  assert.match(strip({ sim:"Evan puts 200 on Khoa" }), /Stop/);
});

/* ── QA quick bets: the current contest's board in one write ── */
let betSeq = 0;
const betsCtx = (extra = {}) => ({ ...LOCAL, player:"Brandon", deviceId:"qa-gm", actionId:`bets-${++betSeq}`, ...extra });
const marketOf = state => {
  const ev = eventById(state, state.onDeck);
  return { ev, contest:resolveCurrentContest(state, ev) };
};
const betsOn = (state, mode, extra = {}, ctx = betsCtx()) => {
  const { contest } = marketOf(state);
  const next = structuredClone(state);
  const result = applyAction(next, "qaBets", { mode, contestId:contest.id, contestRevision:contest.revision, seed:4, ...extra }, ctx);
  return { result, state:result.ok ? next : state };
};

test("quick bets fill the current contest through the real reducers, under every cap and rule", () => {
  for (const target of ["event:putt:open", "event:pickleball:open", "event:volley:open", "event:beerio:open"]) {
    let { state } = reach(target);
    const { contest } = marketOf(state);
    const cleared = betsOn(state, "clear");
    assert.equal(cleared.result.ok, true, `${target}: ${cleared.result.error}`);
    state = cleared.state;
    assert.equal(pendingOn(state, contest).length, 0, `${target}: cleared`);
    assert.equal(betsOn(state, "clear").result.error, "No bets to clear");
    for (const mode of ["everyone", "favorite", "spread"]) {
      const run = betsOn(state, mode);
      assert.equal(run.result.ok, true, `${target} ${mode}: ${run.result.error}`);
      assert.ok(run.result.extra.placed > 0);
      state = run.state;
      assertCoherent(state, `${target} ${mode}`);
      const events = allEventsOf(state);
      const bets = pendingOn(state, contest);
      assert.ok(bets.every(wager => wager.player !== "Brandon"), "the commissioner's own chips stay theirs");
      for (const player of new Set(bets.map(wager => wager.player))) {
        /* a wide free-for-all is unrestricted; any other contest takes one side a player */
        if (contest.kind !== "ffa") assert.equal(new Set(bets.filter(wager => wager.player === player)
          .map(wager => JSON.stringify(wager.pickPlayers))).size, 1, `${player} holds one side`);
        const row = computeStandings(state).find(item => item.player === player);
        assert.ok(atRisk(state, player, events) + duelReserve(state, player) <= maxRisk(row.pts), `${player} inside the cap`);
      }
      assert.ok(!Object.keys(state.wagerOps || {}).some(key => key.startsWith("request:qa-sim:")), "no synthetic ledger left");
    }
    const back = betsOn(state, "clear");
    assert.equal(back.result.ok, true);
    assert.equal(pendingOn(back.state, contest).length, 0, "Clear bets returns every chip");
  }
});

test("quick bets: favorite backs the strongest side, spread deals the sides in turn", () => {
  const { state } = betsOn(reach("event:pickleball:open").state, "clear");
  const { contest } = marketOf(state);
  const spectators = wagers => wagers.filter(wager => !contest.players.includes(wager.player));
  const spread = spectators(pendingOn(betsOn(state, "spread").state, contest));
  const counts = contest.sides.map(side => spread.filter(wager => wager.teamIdx === side.key).length);
  assert.ok(counts.every(count => count > 0), `both sides dealt: ${counts}`);
  const favorite = spectators(pendingOn(betsOn(state, "favorite").state, contest));
  assert.equal(new Set(favorite.map(wager => wager.teamIdx)).size, 1, "every spectator backs the one favorite");
});

test("quick bets: commissioner and QA only, production confirms, stale refs refused, a retry places once", () => {
  const { state } = reach("event:putt:open");
  const { contest } = marketOf(state);
  assert.equal(betsOn(state, "everyone", {}, betsCtx({ qa:false })).result.error, "QA is unavailable");
  assert.equal(betsOn(state, "everyone", {}, betsCtx({ isGm:false })).result.ok, false);
  assert.equal(betsOn(state, "nope").result.error, "Unknown QA bets action");
  assert.equal(betsOn(state, "everyone", { contestRevision:contest.revision + 1 }).result.error,
    "Contest changed, refresh and try again");
  const prod = betsOn(state, "everyone", {}, betsCtx({ environment:"production" }));
  assert.equal(prod.result.extra?.needsConfirm, true, "production always confirms");
  assert.equal(prod.result.extra?.production, true);
  const confirmed = betsOn(state, "everyone", { confirm:RESET_PROGRESS_CONFIRMATION }, betsCtx({ environment:"production" }));
  assert.equal(confirmed.result.ok, true, confirmed.result.error);
  const ctx = betsCtx();
  const once = betsOn(state, "everyone", {}, ctx);
  assert.equal(once.result.ok, true);
  const again = applyAction(once.state, "qaBets", { mode:"everyone", contestId:contest.id, contestRevision:contest.revision, seed:4 }, ctx);
  assert.equal(again.ok, true);
  assert.equal(again.extra.unchanged, true, "the same tap acknowledged, not placed twice");
  /* nothing taking bets: refused */
  const locked = structuredClone(state);
  assert.equal(applyAction(locked, "setOnDeck", { id:null, contestId:contest.id, contestRevision:contest.revision },
    { ...LOCAL, actionId:"lock" }).ok, true);
  assert.equal(applyAction(locked, "qaBets", { mode:"everyone" }, betsCtx()).error, "No contest is taking bets");
});

test("quick bets over the Durable Object: one write, one broadcast, no backup", async () => {
  const { memory, tournament, asGm } = await objectWith();
  assert.equal((await asGm("qaAdvance", { target:"event:putt:open", seed:5 })).ok, true);
  const version = tournament.version;
  const { contest } = marketOf(tournament.state);
  const before = pendingOn(tournament.state, contest).length;
  const placed = await asGm("qaBets", { mode:"everyone", contestId:contest.id, contestRevision:contest.revision });
  assert.equal(placed.ok, true, placed.error);
  assert.equal(tournament.version, version + 1, "one write");
  assert.ok(pendingOn(tournament.state, contest).length > before);
  assert.equal([...memory.entries.keys()].filter(key => key.startsWith("m1:pre-reset:")).length, 0, "no backup");
});

test("a forward jump or Sim contest makes no backup; a rewind makes the rotating one", async () => {
  const { memory, asGm } = await objectWith();
  const backups = () => [...memory.entries.keys()].filter(key => key.startsWith("m1:pre-reset:") && key.endsWith(":manifest")).length;
  const forward = await asGm("qaAdvance", { target:"event:pong:mid", seed:5 });
  assert.equal(forward.ok, true, forward.error);
  assert.equal(forward.extra.backupKey, undefined);
  assert.equal((await asGm("qaAdvance", { target:"step" })).ok, true);
  assert.equal(backups(), 0, "moving forward discards nothing, so it copies nothing");
  const back = await asGm("qaAdvance", { target:"locker", confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(back.ok, true, back.error);
  assert.equal(back.extra.rewound, true);
  assert.ok(back.extra.backupKey?.startsWith("m1:pre-reset:"));
  assert.equal(backups(), 1);
});
