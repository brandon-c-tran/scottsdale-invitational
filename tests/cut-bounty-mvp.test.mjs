/* Oct 4: the leader bounty and team MVP are cut. A stored state written
   while they existed (staging has some) still loads, projects, validates
   and computes standings, and what it carries for them is simply ignored. */
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE, ROSTER, START, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import { cleanWalkout, walkoutOf } from "../shared/audio.js";
import { projectPrompts, tallyBallot, voteError } from "../shared/prompts.js";
import { resolveDirector } from "../shared/show.js";
import { applyAction } from "../worker/actions.js";
import { publicState } from "../worker/publicState.js";
import { hydrateStoredState } from "../worker/state.js";
import { buildSnapshot, validateSnapshot } from "../worker/snapshot.js";
import { winSongFor } from "../worker/winSong.js";
import { alertsFor } from "../worker/pushAlerts.js";
import { nowPlayingModel } from "../src/features/tv/nowPlaying.js";

const LOCAL = { isGm:true, qa:true, progressReset:true, environment:"local" };
function reach(target) {
  const state = structuredClone(EMPTY_STATE);
  const result = applyAction(state, "qaAdvance", { target, seed:7 }, LOCAL);
  assert.equal(result.ok, true, result.error);
  return state;
}
const pointsOf = state => computeStandings(state).map(row => `${row.player}:${row.pts}`).join("|");

/* Volleyball posted (a team of three won) and Beer Die's next contest live,
   then dressed with what the cut features used to write */
function legacy() {
  const state = reach("event:volley:done");
  const before = pointsOf(state);
  const team = state.results.volley.slots[0];
  const [winner, voter] = team;
  state.mvp = {
    volley:{ id:"mvp-1", team:[...team], openedAt:1, closesAt:60_001, closedAt:30_000, winner, tally:{ [winner]:2 }, how:"votes" },
    die:{ id:"mvp-2", team:[...team], openedAt:1, closesAt:Date.now() + 60_000, votes:{ [voter]:winner } },
  };
  for (const evId of Object.keys(state.eventOps)) {
    const op = state.eventOps[evId];
    const ids = [...(op.contestStack || []).map(entry => entry.id), op.contest?.id].filter(Boolean);
    if (ids.length) op.bounties = Object.fromEntries(ids.map(id => [id, { players:[ROSTER[0]], kind:"match", at:1 }]));
  }
  state.showControl = { ...(state.showControl || {}), audio:{ ...(state.showControl?.audio || {}),
    walkout:{ player:winner, trackId:null, startedAt:Date.now(), until:Date.now() + 30_000, auto:true, mvp:true } } };
  return { state, before };
}

test("an old state's MVP record and bounty stamps pay nothing and change no total", () => {
  const { state, before } = legacy();
  assert.ok(Object.values(state.eventOps).some(op => op.bounties), "the fixture carries stamps");
  assert.equal(pointsOf(state), before, "the board reads as if they were never there");
  for (const row of computeStandings(state)) {
    assert.equal(row.pts, START + row.awardPts + row.betNet + row.duelNet
      + (state.adjustments || []).filter(a => !a.removedAt && a.player === row.player).reduce((sum, a) => sum + a.delta, 0));
    assert.equal("mvpPts" in row, false);
    assert.equal("bountyPts" in row, false);
  }
  for (const ev of allEventsOf(state)) {
    const contest = resolveCurrentContest(state, ev);
    if (contest) assert.equal(contest.bounty, undefined, `${ev.id}: no bounty rides the contest`);
  }
  assert.equal("mvp" in EMPTY_STATE, false);
});

test("it loads, projects and validates; the cut records never leave the Worker", () => {
  const { state } = legacy();
  const hydrated = hydrateStoredState(state);
  assert.equal(hydrated.v, EMPTY_STATE.v);
  for (const viewer of [{ isGm:true }, { player:ROSTER[1] }, {}]) {
    const frame = publicState(hydrated, viewer);
    assert.equal("mvp" in frame, false, "no MVP record, open votes included");
    for (const op of Object.values(frame.eventOps || {})) assert.equal(op?.bounties, undefined);
  }
  const snapshot = buildSnapshot(new Map([["state", hydrated], ["version", 3], ["claims", {}]]),
    { environment:"local", applicationVersion:"test" });
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.errors.join("; "));
  /* the director owes no "Close MVP vote", and the old actions are gone */
  const director = resolveDirector(hydrated, allEventsOf(hydrated), { showControl:false });
  assert.ok(!(director.extras || []).some(extra => /mvp/i.test(String(extra.type))));
  for (const type of ["mvpVote", "mvpClose"])
    assert.match(applyAction(structuredClone(hydrated), type, { evId:"die", pick:ROSTER[1] }, { isGm:true }).error, /Unknown action/);
});

test("no song, alert or TV label follows an old MVP record", () => {
  const { state } = legacy();
  const closed = structuredClone(state);
  closed.mvp.die = { ...closed.mvp.die, closedAt:Date.now(), winner:closed.mvp.die.team[0] };
  delete closed.mvp.die.votes;
  assert.equal(winSongFor(state, closed), null, "a vote closing plays nothing");
  const opened = structuredClone(state);
  opened.mvp.trivia = { id:"mvp-3", team:ROSTER.slice(0, 3), openedAt:1, closesAt:Date.now() + 60_000 };
  assert.deepEqual(alertsFor(state, opened).filter(alert => alert.reason === "mvp"), []);
  assert.equal("mvp" in walkoutOf(state), false, "the walkout record reads as a plain win song");
  const card = nowPlayingModel(state, allEventsOf(state), Date.now() + 1000);
  assert.ok(card && !("mvp" in card), "the TV's Now playing names no MVP");
  assert.equal("mvp" in cleanWalkout({ player:ROSTER[0], trackId:null, startedAt:1, until:2, mvp:true }), false);
});

test("a stored Most MVPs award takes no votes and counts nothing", () => {
  const question = { id:"qmvps", title:"Most MVPs", nominees:null, allowSelf:false, source:"mvps" };
  const ballot = { id:"bold", kind:"awards", status:"closed", rev:1, createdAt:1, publishedAt:2, closedAt:3,
    questions:[question, { id:"qhost", title:"Best host", nominees:null, allowSelf:false }] };
  assert.ok(voteError(question, ROSTER[0], ROSTER[1]));
  const { state } = legacy();
  const tally = tallyBallot(ballot, { bold:{ [ROSTER[0]]:{ answers:{ qmvps:ROSTER[1], qhost:ROSTER[2] }, at:1 } } }, state);
  assert.deepEqual(tally.questions.qmvps, { counts:{}, votes:0 });
  assert.equal(tally.questions.qhost.votes, 1);
  const projected = projectPrompts({ ballots:[ballot], responses:{} }, { isGm:true });
  assert.equal(projected.ballots[0].questions.length, 2, "the ballot keeps its shape");
});
