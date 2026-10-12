/* QA's simulated room (shared/qaSim.js, "Sim players"): every present
   player but the commissioner's own plays on a human clock through the
   ordinary player writes, which the Durable Object makes on its alarm
   beside the autopilot. Deterministic for a seed, keyed once per move,
   never the absent, never the commissioner unless included, off at once;
   each in-app game played to its posted result by the room and the
   autopilot alone, over simulated time. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_STATE, PT, RESET_PROGRESS_CONFIRMATION, allEventsOf, atRisk, computeStandings, draftTurn, duelReserve, maxRisk,
  presentPlayers, resolveCurrentContest,
} from "../shared/core.js";
import { QA_PROGRESS_KEYS } from "../shared/qa.js";
import {
  SIM_PLANNERS, geoSimGuess, qaSimOf, simContext, simDue, simHash, simMoves, simNext, simPlayers,
} from "../shared/qaSim.js";
import { milesApart, hoursApart } from "../shared/geo.js";
import { boardStandings, finalMax, boardTopValue } from "../shared/triviaBoard.js";
import { applyAction } from "./support/confirmed-start.mjs";

let serial = 0;
const ME = "Brandon";
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = (player = ME, extra = {}) => ({ ...GM, player, deviceId:"gm", actionId:`g${++serial}`, ...extra });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const at = (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
};
const atAsync = async (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
};
const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const lockAndStart = (state, evId) => {
  const contest = resolveCurrentContest(state, eventOf(state, evId));
  return act(state, "lockAndStart", { evId, contestId:contest.id, contestRevision:contest.revision });
};
const simOn = (state, extra = {}, ctx = gm()) => act(state, "qaSimPlayers", { on:true, seed:4242, ...extra }, ctx);

/* the Durable Object, in memory: storage, no sockets */
async function room(state) {
  const { Tournament } = await import("../worker/tournament.js");
  const entries = new Map();
  const storage = {
    async get(key) { return entries.get(key); }, async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, v); else entries.set(key, value);
    },
    async delete(keys) { for (const key of [].concat(keys)) entries.delete(key); },
    async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix))); },
    async transaction(fn) { return fn(storage); }, async setAlarm() {}, async getAlarm() { return null; }, async deleteAlarm() {},
  };
  const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => [], storage, waitUntil() {} },
    { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true" });
  await tournament.hydrateFromStorage();
  tournament.state = state;
  /* every write the alarm made, with its server time */
  tournament.log = [];
  const persist = tournament.persistAndBroadcast.bind(tournament);
  tournament.persistAndBroadcast = async (type, next, options) => {
    tournament.log.push({ type, at:Date.now(), next });
    return persist(type, next, options);
  };
  return tournament;
}
/* run the alarm at each next instant (the autopilot's beat or the room's
   move) until `done`, as the Durable Object's own alarm would */
async function play(tournament, done, { from = 0, limit = 5000 } = {}) {
  let clock = from;
  for (let guard = 0; guard < limit; guard++) {
    if (done(tournament.state)) return clock;
    const beat = tournament.nextAutoBeat();
    const due = tournament.simActive() ? simDue(tournament.state, clock, tournament.simSpent)[0] : null;
    const move = due || (tournament.simActive() ? simNext(tournament.state, clock, tournament.simSpent) : null);
    const next = Math.min(beat ? beat.at : Infinity, move ? move.at : Infinity);
    if (!Number.isFinite(next)) throw new Error(`stalled at ${clock}: ${tournament.state.trivia?.phase || tournament.state.geo?.phase}`);
    clock = Math.max(clock, next);
    await atAsync(clock, () => tournament.runAutopilot());
  }
  throw new Error("never finished");
}
const writesOf = (tournament, type) => tournament.log.filter(entry => entry.type === type);

/* ── set lists ── */
const q = (id, text, options, answer = 0) => ({ id, format:"choice", text, options, answer });
const SPORTS = { id:"tsports01", source:"bank", category:"sports",
  picks:["sports-16", "sports-01", "sports-10", "sports-06", "sports-02"] };
const MUSIC = { id:"tmusic001", source:"bank", category:"music", picks:["music-01", "music-04", "music-06", "music-15", "music-16"] };
const CUSTOM = { id:"tcustom01", source:"custom", name:"The groom", questions:[
  q("qgroom001", "Where did Brandon propose?", ["Kyoto", "Paris", "Big Sur", "Tahoe"], 2),
  { id:"qgroom002", format:"number", text:"How many days did they date before he proposed?", answer:1461, unit:"days", digits:4 },
  q("qgroom005", "What does he order at a bar?", ["Old Fashioned", "Negroni", "IPA", "Margarita"]),
] };
const FINAL = { id:"tfinal001", category:"The groom",
  questions:[q("qfinal001", "Where is the bachelor party?", ["Scottsdale", "Tahoe", "Austin", "Nashville"])] };
const GEO_ROUNDS = [
  { id:"gaaaaaa1", photo:{ id:"gphoto01", w:1600, h:1200 }, lat:37.8199, lng:-122.4783, place:"Golden Gate Bridge", when:"2019-07-04T21" },
  { id:"gaaaaaa2", photo:{ id:"gphoto02", w:1200, h:1600 }, lat:40.758, lng:-73.9855, place:"Times Square", when:"2021-12-31T23" },
  { id:"gaaaaaa3", photo:{ id:"gphoto03", w:1600, h:900 }, lat:36.1147, lng:-115.1728, place:"Las Vegas", when:"2023-03-18T02" },
];

/* Trivia locked and started, Sim players on from T0, the set list in */
const T0 = 1_900_000_000_000;
function triviaRoom({ format = "rounds", rounds = [SPORTS, CUSTOM], final = null, away = [] } = {}) {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
  for (const player of away) act(state, "setAway", { player, away:true });
  at(T0, () => simOn(state));
  /* a market the room may bet on is open: no bets in these games, so the
     test reads the game alone */
  at(T0, () => lockAndStart(state, "trivia"));
  if (format !== "rounds") act(state, "triviaSetFormat", { format });
  for (const round of rounds) act(state, "triviaSaveRound", { round:structuredClone(round) });
  if (final) act(state, "triviaSaveFinal", { final:structuredClone(final) });
  at(T0 + 1000, () => act(state, "triviaStart", { evId:"trivia" }));
  return state;
}

/* ── the planner ── */

test("the switch: commissioner and QA only, a seed and the commissioner's own player, off at once, kept out of checkpoints", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(state, "qaSimPlayers", { on:true }, { isGm:false, player:"Evan" }).error, "Commissioner only");
  assert.equal(applyAction(state, "qaSimPlayers", { on:true }, { ...gm(), qa:false }).error, "QA is unavailable");
  assert.equal(applyAction(state, "qaSimPlayers", { on:"yes" }, gm()).error, "Turn Sim players on or off");
  at(T0, () => simOn(state));
  assert.deepEqual(state.qaSim, { on:true, me:ME, includeMe:false, seed:4242, at:T0 });
  assert.equal(act(state, "qaSimPlayers", { on:true }).extra.unchanged, true, "on again: nothing");
  act(state, "qaSimPlayers", { on:true, includeMe:true });
  assert.equal(state.qaSim.includeMe, true);
  assert.equal(state.qaSim.at, T0, "Include me keeps the room's clock and seed");
  act(state, "qaSimPlayers", { on:false });
  assert.equal(state.qaSim, null);
  assert.equal(act(state, "qaSimPlayers", { on:false }).extra.unchanged, true);
  assert.ok(!QA_PROGRESS_KEYS.includes("qaSim"), "a checkpoint never carries the switch");
  assert.ok("qaSim" in EMPTY_STATE);
});

test("production: switching on takes the same confirmation quick bets do; off needs none", () => {
  const state = structuredClone(EMPTY_STATE);
  const prod = () => gm(ME, { environment:"production" });
  const asked = applyAction(state, "qaSimPlayers", { on:true }, prod());
  assert.equal(asked.ok, false);
  assert.equal(asked.extra.needsConfirm, true);
  assert.equal(asked.extra.production, true);
  assert.equal(state.qaSim, null);
  act(state, "qaSimPlayers", { on:true, confirm:RESET_PROGRESS_CONFIRMATION }, prod());
  assert.equal(state.qaSim.on, true);
  act(state, "qaSimPlayers", { on:false }, prod());
  assert.equal(state.qaSim, null);
});

test("a progress reset clears it; a QA jump and a restore keep it playing", () => {
  const state = structuredClone(EMPTY_STATE);
  simOn(state);
  act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
  act(state, "qaAdvance", { target:"locker", seed:7, confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(state.qaSim?.on, true, "a rewind keeps the room");
  act(state, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(state.qaSim, null, "a reset clears it");
});

test("who plays: present players only, never the commissioner's own unless included", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "setAway", { player:"Evan", away:true });
  assert.deepEqual(simPlayers(state), [], "off: nobody");
  simOn(state);
  const players = simPlayers(state);
  assert.ok(!players.includes(ME), "never the commissioner's player");
  assert.ok(!players.includes("Evan"), "never an absent player");
  assert.equal(players.length, presentPlayers(state).length - 1);
  act(state, "qaSimPlayers", { on:true, includeMe:true });
  assert.ok(simPlayers(state).includes(ME), "Include me");
  /* a commissioner with no claimed player: everyone */
  const open = structuredClone(EMPTY_STATE);
  simOn(open, {}, gm(null));
  assert.equal(simPlayers(open).length, presentPlayers(open).length);
});

test("deterministic: the same state plans the same moves at the same instants with stable keys; a new seed another room", () => {
  const state = triviaRoom();
  const a = simMoves(state, T0), b = simMoves(structuredClone(state), T0);
  assert.ok(a.length >= 10, `a room of answers (${a.length})`);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map(move => move.key)).size, a.length, "every move its own key");
  for (const move of a) assert.match(move.key, /^sim:/);
  assert.ok(a.every(move => move.player !== ME));
  const other = structuredClone(state);
  other.qaSim.seed = 7;
  assert.notDeepEqual(simMoves(other, T0).map(move => move.at), a.map(move => move.at));
  assert.equal(simHash(1, "a", "b"), simHash(1, "a", "b"));
  assert.notEqual(simHash(1, "a", "b"), simHash(2, "a", "b"));
  /* due and next split on now */
  const mid = a[Math.floor(a.length / 2)].at;
  assert.ok(simDue(state, mid).every(move => move.at <= mid));
  assert.ok(simNext(state, mid).at > mid);
  /* a spent key is never planned again */
  const spent = new Set([a[0].key]);
  assert.ok(!simMoves(state, T0, spent).some(move => move.key === a[0].key));
  assert.deepEqual(simContext(a[0]), { isGm:false, sim:true, player:a[0].player, deviceId:`sim:${a[0].player}`, actionId:a[0].key });
  assert.deepEqual(Object.keys(SIM_PLANNERS), ["trivia", "board", "geo", "bets", "draft"]);
});

test("off stops everything at once, and an absent player stops on the spot", async () => {
  const state = triviaRoom();
  const someone = simMoves(state, T0)[0].player;
  act(state, "setAway", { player:someone, away:true });
  assert.ok(!simMoves(state, T0).some(move => move.player === someone));
  act(state, "qaSimPlayers", { on:false });
  assert.deepEqual(simMoves(state, T0), []);
  const tournament = await room(state);
  await atAsync(T0 + 60_000, () => tournament.runAutopilot());
  assert.equal(writesOf(tournament, "triviaPick").length, 0, "no picks with the room off");
});

/* ── Trivia, rounds ── */

test("Trivia rounds: the room answers on its own clock and the autopilot plays the game to its posted result", async () => {
  const state = triviaRoom();
  const profiles = structuredClone(state.profiles);
  const tournament = await room(state);
  await play(tournament, s => !!s.results?.trivia, { from:T0 + 1000 });
  const done = tournament.state;
  assert.ok(done.results.trivia, "the result posted");
  const game = done.trivia;
  const picks = writesOf(tournament, "triviaPick");
  assert.ok(picks.length >= game.questions.length * 8, `picks across the game (${picks.length})`);
  /* nobody acted for the commissioner or an absent player */
  for (const question of game.questions) {
    const answers = game.picks[question.id] || {};
    assert.equal(answers[ME], undefined, "the commissioner's own player stays theirs");
    const time = game.times[question.id];
    const locks = Object.values(answers).filter(pick => pick.locked).map(pick => pick.lockedAt);
    const spread = Math.max(...locks) - Math.min(...locks);
    assert.ok(spread >= 3000, `locks spread over the window, not at once (${spread} ms)`);
    assert.ok(locks.every(t => t >= time.startsAt + 1000 && t <= time.closesAt), "inside the window, never at the gun");
    assert.ok(new Set(locks).size >= locks.length - 2, "each at its own moment");
  }
  /* some never lock, some change their mind, about half to most are right */
  const all = game.questions.flatMap(question => Object.values(game.picks[question.id] || {}));
  const unlocked = all.filter(pick => !pick.locked).length;
  assert.ok(unlocked > 0 && unlocked < all.length * 0.3, `a few never lock (${unlocked} of ${all.length})`);
  const perQuestion = game.questions.map(question => Object.keys(game.picks[question.id] || {}).length);
  assert.ok(picks.length > perQuestion.reduce((a, b) => a + b, 0), "someone changed their pick before locking");
  const choice = game.questions.filter(question => question.format !== "number");
  const right = choice.flatMap(question => Object.values(game.picks[question.id] || {})
    .map(pick => pick.choice === question.answer));
  const share = right.filter(Boolean).length / right.length;
  assert.ok(share > 0.3 && share < 0.95, `right about half to most of the time (${share.toFixed(2)})`);
  const number = game.questions.find(question => question.format === "number");
  const values = Object.values(game.picks[number.id]).map(pick => pick.value);
  assert.ok(values.every(value => Math.abs(value - number.answer) < number.answer), "closest number: near the answer");
  assert.ok(new Set(values).size > 4, "and all over it");
  assert.deepEqual(done.profiles, profiles, "no profile written");
});

test("Trivia board: picks, buzzes, rebounds, the Daily Double and everyone's Final, played to the posted result", async () => {
  const state = triviaRoom({ format:"board", rounds:[SPORTS, MUSIC], final:FINAL });
  const tournament = await room(state);
  await play(tournament, s => !!s.results?.trivia, { from:T0 + 1000 });
  const game = tournament.state.trivia;
  assert.ok(tournament.state.results.trivia, "the result posted");
  assert.equal(game.played.length, Object.keys(game.clues).length, "every cell played");
  const logs = Object.values(game.log);
  assert.ok(logs.filter(log => !log.auto).length >= 5, "the room picked its own cells, not the autopilot");
  assert.ok(logs.some(log => (log.races || []).length > 0), "a wrong answer opened a rebound and the room buzzed again");
  const buzzes = writesOf(tournament, "boardBuzz");
  assert.ok(buzzes.length >= 20, `buzzes (${buzzes.length})`);
  assert.ok(logs.filter(log => log.attempts?.some(attempt => attempt.right)).length >= 3, "some clues taken");
  for (const log of logs) {
    for (const buzz of Object.values(log.buzzes || {})) assert.ok(buzz.ms >= 220 && buzz.ms <= 900, "a human reaction");
    for (const attempt of log.attempts || []) assert.notEqual(attempt.player, ME);
  }
  const daily = game.log[game.dd];
  assert.ok(daily.wager >= 100, "the Daily Double wagered");
  const top = boardTopValue(game);
  const rows = new Map(boardStandings({ ...game, phase:"final-clue", finishedAt:null }).map(row => [row.player, row.preFinal]));
  const wagers = Object.entries(game.finalWagers);
  assert.ok(wagers.length >= simPlayers(tournament.state).length, "everyone wagers on the Final");
  for (const [player, { wager }] of wagers) assert.ok(wager >= 0 && wager <= finalMax(rows.get(player) ?? 0, top), player);
  const locks = Object.values(game.finalPicks).filter(pick => pick.locked);
  assert.ok(locks.length >= simPlayers(tournament.state).length, "everyone answers the Final");
  assert.ok(Math.max(...locks.map(pick => pick.lockedAt)) - Math.min(...locks.map(pick => pick.lockedAt)) > 5000,
    "Final answers spread over its window");
});

/* ── Where and When ── */

test("Where and When: pins near and far, dates, lock-ins on their own clocks, played to the posted result", async () => {
  const state = structuredClone(EMPTY_STATE);
  for (const round of GEO_ROUNDS) act(state, "geoSaveRound", round);
  at(T0, () => simOn(state));
  at(T0, () => act(state, "announceEvent", { evId:"where" }));
  /* the room bets while the market is open; then lock and start */
  const tournament = await room(state);
  await play(tournament, s => (s.wagers || []).length >= 3, { from:T0 });
  const clock = Math.max(...tournament.log.map(entry => entry.at)) + 30_000;
  await atAsync(clock, () => tournament.runAutopilot());
  tournament.state = structuredClone(tournament.state);
  at(clock, () => lockAndStart(tournament.state, "where"));
  assert.equal(tournament.state.geo.author, ME, "the commissioner wrote the photos and sits it out");
  await play(tournament, s => !!s.results?.where, { from:clock });
  const geo = tournament.state.geo;
  assert.ok(tournament.state.results.where, "the result posted");
  const guesses = Object.entries(geo.guesses).flatMap(([roundId, byPlayer]) =>
    Object.entries(byPlayer).map(([player, guess]) => ({ roundId, player, ...guess })));
  const players = simPlayers(tournament.state);
  assert.ok(guesses.length >= GEO_ROUNDS.length * (players.length - 1), `guesses (${guesses.length})`);
  assert.ok(guesses.every(guess => guess.player !== ME));
  const miles = guesses.map(guess => milesApart(GEO_ROUNDS.find(round => round.id === guess.roundId), guess));
  assert.ok(miles.some(m => m < 20), "some within 20 miles");
  assert.ok(miles.some(m => m > 400), "some across the country");
  assert.ok(guesses.every(guess => guess.when), "every guess has a date and hour");
  const hours = guesses.map(guess => hoursApart(GEO_ROUNDS.find(round => round.id === guess.roundId).when, guess.when));
  assert.ok(Math.min(...hours) < 24 * 30 && Math.max(...hours) > 24 * 60, "dates from close to months off");
  const locked = guesses.filter(guess => guess.done).length / guesses.length;
  assert.ok(locked > 0.7 && locked < 1, `most lock in, some let the clock run (${locked.toFixed(2)})`);
  const saves = writesOf(tournament, "geoGuess").map(entry => entry.at);
  assert.ok(saves.length >= guesses.length * 2, "a pin, then a date, then the lock, each its own save");
  /* never everyone in one instant */
  const counts = new Map();
  for (const t of saves) counts.set(t, (counts.get(t) || 0) + 1);
  assert.ok(Math.max(...counts.values()) <= 2, "saves land one by one");
  /* a guess is the skill's shape: the same player's guesses are the same each time */
  const sim = qaSimOf(tournament.state);
  assert.deepEqual(geoSimGuess(sim, GEO_ROUNDS[0], "Evan"), geoSimGuess(sim, GEO_ROUNDS[0], "Evan"));
});

/* ── bets ── */

test("bets: about 60% of the room bets once or twice, 3 to 25 s after the market opens, inside every cap", async () => {
  let seconds = 0;
  for (const seed of [4242, 7, 99]) {
    const state = structuredClone(EMPTY_STATE);
    at(T0, () => simOn(state, { seed }));
    at(T0, () => act(state, "announceEvent", { evId:"where" }));
    const tournament = await room(state);
    const end = T0 + 60_000;
    let clock = T0;
    for (let guard = 0; guard < 200; guard++) {
      const move = simDue(tournament.state, clock, tournament.simSpent)[0] || simNext(tournament.state, clock, tournament.simSpent);
      if (!move || move.at > end) break;
      clock = Math.max(clock, move.at);
      await atAsync(clock, () => tournament.runAutopilot());
    }
    const wagers = tournament.state.wagers;
    const bettors = new Set(wagers.map(wager => wager.player));
    const players = simPlayers(tournament.state);
    assert.ok(bettors.size >= players.length * 0.3 && bettors.size <= players.length * 0.9, `bettors (${bettors.size})`);
    assert.ok(!bettors.has(ME));
    const events = allEventsOf(tournament.state);
    const rows = computeStandings(tournament.state);
    for (const player of bettors) {
      const pts = rows.find(row => row.player === player).pts;
      assert.ok(atRisk(tournament.state, player, events) + duelReserve(tournament.state, player, clock) <= maxRisk(pts), player);
    }
    for (const wager of wagers) {
      assert.ok(wager.chips.length <= 2);
      for (const chip of wager.chips) assert.ok(chip.stake >= PT && chip.stake <= 5 * PT && chip.stake % PT === 0);
    }
    const times = writesOf(tournament, "placeWager").map(entry => entry.at - T0);
    assert.ok(Math.min(...times) >= 3000 && Math.max(...times) <= 33_000, `inside the window (${Math.min(...times)}..${Math.max(...times)})`);
    assert.ok(new Set(times).size >= times.length - 1, "one at a time");
    seconds += wagers.filter(wager => wager.chips.length === 2).length;
    /* nothing more to plan: each bettor's moves are made */
    assert.equal(simNext(tournament.state, end, tournament.simSpent), null);
  }
  assert.ok(seconds > 0, "someone came back for a second chip");
});

/* ── a captains draft ── */

test("a captains draft: each sim captain picks 3 to 8 s after going on the clock, to the last pick", async () => {
  const state = structuredClone(EMPTY_STATE);
  const ev = allEventsOf(state).find(item => item.id === "fivevfive")
    || allEventsOf(state).find(item => item.teamCfg && item.teamCfg.size >= 3);
  const players = presentPlayers(state);
  const captains = players.filter(player => player !== ME).slice(0, ev.teamCfg?.teams || 2);
  at(T0, () => simOn(state));
  const started = applyAction(state, "startDraft", { evId:ev.id, captains, players }, gm());
  assert.equal(started.ok, true, started.error);
  state.drafts[ev.id].ts = T0;
  const tournament = await room(state);
  await play(tournament, s => !!draftTurn(s.drafts[ev.id])?.complete, { from:T0 });
  const picks = writesOf(tournament, "pickDraftPlayer");
  const draft = tournament.state.drafts[ev.id];
  assert.ok(draft.picks.length >= 4, "picked to the end");
  assert.equal(picks.length, draft.picks.length);
  const gaps = picks.map((entry, i) => entry.at - (i ? picks[i - 1].at : T0));
  assert.ok(gaps.every(gap => gap >= 3000 && gap <= 8000), `3 to 8 s a pick (${gaps})`);
  assert.equal(tournament.state.draws[ev.id], undefined, "confirming stays the commissioner's");
});

/* ── refusals ── */

test("a refused move is remembered and never looped", async () => {
  const state = triviaRoom();
  /* a game nobody may join: every pick is refused, and the autopilot has no beat */
  state.trivia.players = null;
  const tournament = await room(state);
  const planned = simMoves(tournament.state, T0).length;
  assert.ok(planned > 5);
  const end = T0 + 60_000;
  for (let i = 0; i < 4; i++) await atAsync(end, () => tournament.runAutopilot());
  assert.equal(tournament.log.length, 0, "nothing written");
  assert.ok(tournament.simSpent.size >= planned - 2, `each refused once (${tournament.simSpent.size} of ${planned})`);
  assert.deepEqual(simDue(tournament.state, end, tournament.simSpent), [], "nothing left to try");
});

/* ── the console: the switch in Step ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { QASheet } from "./src/features/qa/QASheet.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const consoleModule = new Module(fileURLToPath(new URL("qa-sim.cjs", import.meta.url)));
consoleModule.filename = consoleModule.id;
consoleModule.paths = Module._nodeModulePaths(root);
consoleModule._compile(compiled.outputFiles[0].text, consoleModule.filename);
const { QASheet, PlayerIdentityProvider } = consoleModule.exports;

test("the console: Sim players and Include me in Step, a lamp with how many play while it runs", () => {
  const noop = () => {};
  const status = { environment:"staging", version:3, schema:9, profiles:13, completed:0, total:17, pendingWagers:0,
    openDuels:0, current:"Trivia", phase:"Under way", next:"Reveal", blockers:[] };
  const render = state => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles || {} },
    React.createElement(QASheet, { state, status, me:ME, guestLens:false, busy:false, market:null, environment:"staging",
      dispatch:async () => ({ ok:true }), notify:noop, onSwitch:noop, onLens:noop, onPlayLive:noop, onDuelMe:noop, onDuels:noop,
      pokerOn:false, onBustOne:noop, onCountRest:noop, onRerun:noop, onReplayMine:noop, onClose:noop })));
  const state = structuredClone(EMPTY_STATE);
  const off = render(state);
  assert.match(off, /aria-pressed="false"[^>]*><span class="fd-menu-name">Sim players<\/span>/);
  assert.doesNotMatch(off, /Include me/, "Include me only while the room plays");
  assert.doesNotMatch(off, /playing</);
  assert.ok(off.indexOf("Sim players") < off.indexOf("Sim contest"), "the switch leads Step, the one-shot steps stay");
  simOn(state);
  const on = render(state);
  assert.match(on, /aria-pressed="true"[^>]*><span class="fd-menu-name">Sim players<\/span>/);
  assert.match(on, /aria-pressed="false"[^>]*><span class="fd-menu-name">Include me<\/span>/);
  assert.match(on, new RegExp(`fd-qa-pulse[^>]*></span>${simPlayers(state).length} playing`));
  const text = on.replace(/<[^>]+>/g, " ");
  assert.ok(!/—|!/.test(text), "no em dashes or exclamation marks");
});
