/* QA's solo test: one write starts Trivia or Where and When for the
   commissioner's own player alone, so one phone can play the real game.
   Nobody else plays or joins, the autopilot reveals once that player locks
   in, and the result posts with them first. */
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE, ROSTER, allEventsOf } from "../shared/core.js";
import { geoPlayers } from "../shared/geo.js";
import { parseQaTarget, qaSoloTargets } from "../shared/qa.js";
import { AUTO_ALL_IN_MS, autoBeat } from "../shared/autopilot.js";
import { geoPlayersOf } from "../worker/geo.js";
import { applyAction } from "./support/confirmed-start.mjs";

const [me, evan, khoa] = ROSTER;
let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = (player = me) => ({ ...GM, player, deviceId:"gm", actionId:`g${++serial}` });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  return result;
};

const ROUNDS = [
  { id:"gaaaaaa1", photo:{ id:"gphoto01", w:1600, h:1200 }, lat:37.8199, lng:-122.4783, place:"Golden Gate Bridge",
    when:"2019-07-04T21" },
  { id:"gaaaaaa2", photo:{ id:"gphoto02", w:1200, h:1600 }, lat:40.758, lng:-73.9855, place:"Times Square", when:"2021-12-31T23" },
];
const CUSTOM = { id:"tcustom01", source:"custom", name:"The groom", questions:[
  { id:"qgroom001", format:"choice", text:"Where did Brandon propose?", options:["Kyoto", "Paris", "Big Sur", "Tahoe"], answer:2 },
  { id:"qgroom002", format:"choice", text:"Which city?", options:["A", "B", "C", "D"], answer:1 },
] };

function configured() {
  const state = structuredClone(EMPTY_STATE);
  for (const round of ROUNDS) act(state, "geoSaveRound", structuredClone(round));
  act(state, "triviaSaveRound", { round:structuredClone(CUSTOM) });
  return state;
}
/* a solo jump from the commissioner's own phone; a rewind confirms like any jump */
function solo(state, game, ctx = gm()) {
  let result = applyAction(state, "qaAdvance", { target:`solo:${game}`, seed:3 }, ctx);
  if (!result.ok && result.extra?.needsConfirm)
    result = applyAction(state, "qaAdvance", { target:`solo:${game}`, seed:3, confirm:result.extra.confirm
      || "RESET GAME PROGRESS" }, ctx);
  return result;
}

test("solo targets parse to the slate's in-app games and say whether they have content", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(parseQaTarget(state, "solo:trivia")?.evId, "trivia");
  assert.equal(parseQaTarget(state, "solo:where")?.evId, "where");
  assert.equal(parseQaTarget(state, "solo:karaoke"), null);
  assert.equal(parseQaTarget(state, "solo:trivia:x"), null);
  assert.deepEqual(qaSoloTargets(state).map(item => [item.key, item.ready]), [["solo:trivia", false], ["solo:where", false]]);
  assert.deepEqual(qaSoloTargets(configured()).map(item => item.ready), [true, true]);
});

test("solo Trivia: only the commissioner's player plays, nobody joins, and it reveals once they lock", () => {
  const state = configured();
  const result = solo(state, "trivia");
  assert.equal(result.ok, true, result.error);
  const game = state.trivia;
  assert.equal(game.eventId, "trivia");
  assert.equal(game.solo, true);
  assert.deepEqual(game.players, [me]);
  assert.equal(state.live, true, "the weekend is live, as any game start makes it");
  assert.equal(Object.keys(state.results || {}).length, 0, "nothing else posts");
  const question = game.questions[game.index];
  const realNow = Date.now;
  try {
    const open = Number(game.times[question.id].startsAt);
    Date.now = () => open + 2000;
    assert.equal(refuse(state, "triviaPick", { questionId:question.id, choice:1 }, as(evan)).error, "You are not playing");
    act(state, "triviaPick", { questionId:question.id, choice:2, lock:true }, as(me));
    const beat = autoBeat(state);
    assert.equal(beat.type, "triviaReveal");
    assert.ok(beat.at <= open + 2000 + AUTO_ALL_IN_MS + 5, "reveals a beat after the one player locks in");
  } finally { Date.now = realNow; }
});

test("solo Where and When: no author, the commissioner's player alone guesses, and it posts them first", () => {
  const state = configured();
  assert.equal(solo(state, "where").ok, true);
  const geo = state.geo;
  assert.equal(geo.author, null);
  assert.deepEqual(geo.only, [me]);
  assert.deepEqual(geoPlayersOf(state), [me]);
  assert.deepEqual(geoPlayers(state, ROSTER), [me], "the phones read the same list");
  const realNow = Date.now;
  try {
    for (const round of ROUNDS) {
      Date.now = () => Number(state.geo.startedAt) + 3000;
      assert.equal(refuse(state, "geoGuess", { roundId:round.id, lat:1, lng:1 }, as(khoa)).error, "You are not playing this one");
      act(state, "geoGuess", { roundId:round.id, lat:round.lat, lng:round.lng, when:round.when, done:true }, as(me));
      const reveal = autoBeat(state);
      assert.equal(reveal.type, "geoReveal");
      assert.ok(reveal.at < Number(state.geo.closesAt), "reveals before the clock once the one player is in");
      Date.now = () => reveal.at;
      act(state, reveal.type, reveal.payload, { ...gm(null), auto:true, actionId:reveal.key });
      const next = autoBeat(state);
      Date.now = () => next.at;
      act(state, next.type, next.payload, { ...gm(null), auto:true, actionId:next.key });
    }
    const post = autoBeat(state);
    if (post) { Date.now = () => post.at; act(state, post.type, post.payload, { ...gm(null), auto:true, actionId:post.key }); }
  } finally { Date.now = realNow; }
  assert.deepEqual(state.results?.where?.slots?.[0], [me]);
});

test("solo needs the commissioner's own player, and rewinds a game already played", () => {
  const state = configured();
  assert.equal(solo(state, "trivia", gm(null)).error, "Claim your player on this phone first");
  assert.equal(solo(state, "where").ok, true);
  /* again: the board is rewound and a fresh solo game starts */
  const again = solo(state, "where");
  assert.equal(again.ok, true, again.error);
  assert.equal(again.extra.rewound, true);
  assert.deepEqual(state.geo.only, [me]);
  /* switching games rewinds the one in play */
  assert.equal(solo(state, "trivia").ok, true);
  assert.equal(state.geo, EMPTY_STATE.geo ?? null);
  assert.deepEqual(state.trivia.players, [me]);
  assert.ok(allEventsOf(state).some(ev => ev.id === "trivia"));
});

test("solo Trivia on the board format: one player picks, buzzes and plays it to a posted result", async () => {
  const { boardAutoBeat } = await import("../shared/triviaBoard.js");
  const state = configured();
  act(state, "triviaSetFormat", { format:"board" });
  assert.equal(solo(state, "trivia").ok, true);
  assert.equal(state.trivia.format, "board");
  assert.equal(state.trivia.solo, true);
  assert.deepEqual(state.trivia.players, [me]);
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    for (let guard = 0; guard < 400 && !state.results?.trivia; guard++) {
      const game = state.trivia;
      const log = game.current ? game.log?.[game.current] : null;
      const ready = game.phase === "clue" ? Number(log?.armAt) || 0
        : game.phase === "answer" || game.phase === "dd-clue" ? Number(log?.turnAt) || 0 : 0;
      now = Math.max(now, ready) + 50;
      /* the one player's moves, as the QA room makes them (never the actor's: a commissioner with no player) */
      if (applyAction(state, "boardSim", {}, gm(null)).ok) continue;
      const beat = boardAutoBeat(state);
      assert.ok(beat, `the board waits on nothing at ${game.phase}`);
      now = Math.max(now, beat.at);
      act(state, beat.type, beat.payload, { ...gm(null), auto:true, actionId:beat.key });
    }
  } finally { Date.now = realNow; }
  assert.deepEqual(state.results?.trivia?.slots?.[0], [me]);
});
