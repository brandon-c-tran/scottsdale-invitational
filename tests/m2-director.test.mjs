import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_EVENTS,
  EMPTY_STATE,
  ROSTER,
  resolveEventLifecycle,
  resolveCurrentContest,
  resolveWeekendOperation,
} from "../shared/core.js";
import { resolveDirector, resolveShowScene } from "../shared/show.js";
import { applyAction } from "../worker/actions.js";

const events = BUILTIN_EVENTS;
const contestRef = (state, evId) => {
  const event = BUILTIN_EVENTS.find(item => item.id === evId);
  const contest = event && resolveCurrentContest(state, event);
  return contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
};
const gm = actionId => ({
  isGm:true,
  player:"Brandon",
  actionId,
  deviceId:"gm-device",
  showControl:true,
});
const gmOff = actionId => ({ ...gm(actionId), showControl:false });

test("the director upgrades lifecycle beats and keeps scene beats capability-gated", () => {
  const state = structuredClone(EMPTY_STATE);

  const off = resolveDirector(state, events, { showControl:false });
  const operation = resolveWeekendOperation(state, events);
  assert.equal(off.event.id, operation.event.id);
  assert.equal(off.scene, null);
  assert.equal(off.nextAction.type, "announce");
  assert.match(off.nextAction.label, /^Announce /);

  /* Going live never inserts a separate opening-weekend step. */
  state.live = true;
  const on = resolveDirector(state, events, { showControl:true });
  assert.equal(on.nextAction.type, "announce");
  assert.match(on.nextAction.label, /^Announce /);

  /* A manually played opening remains optional. */
  state.showControl.history = [{ id:"show-x", kind:"opening", outcome:"completed" }];
  assert.equal(resolveDirector(state, events, { showControl:true }).nextAction.type,
    "announce");

  /* scene beats never exist when the capability is off */
  state.showControl.active = {
    id:"show-a", kind:"event-intro", eventId:"putt", step:0,
    startedAt:1, updatedAt:1, retryOf:null, revision:null, commands:[],
  };
  assert.equal(resolveDirector(state, events, { showControl:false }).nextAction.type,
    "announce");
  assert.equal(resolveDirector(state, events, { showControl:true }).nextAction.type,
    "advance-scene");
});

test("announceEvent opens betting and starts the intro in one write", () => {
  const state = structuredClone(EMPTY_STATE);
  const announced = applyAction(state, "announceEvent", { evId:"putt" }, gm("ann-1"));
  assert.equal(announced.ok, true);
  assert.equal(state.onDeck, "putt");
  assert.ok(state.eventOps.putt.bettingOpenedAt > 0);
  assert.equal(state.showControl.active.kind, "event-intro");
  assert.equal(state.showControl.active.eventId, "putt");
  const sceneId = state.showControl.active.id;

  /* a retry converges without restarting the ceremony */
  const retried = applyAction(state, "announceEvent", { evId:"putt" }, gm("ann-2"));
  assert.equal(retried.ok, true);
  assert.equal(retried.extra.unchanged, true);
  assert.equal(state.showControl.active.id, sceneId);

  /* the identical chain minus scenes when the capability is off */
  const bare = structuredClone(EMPTY_STATE);
  const bareAnnounce = applyAction(bare, "announceEvent", { evId:"putt" }, gmOff("ann-3"));
  assert.equal(bareAnnounce.ok, true);
  assert.equal(bare.onDeck, "putt");
  assert.equal(bare.showControl.active, null);
});

test("announceAndDraw is one atomic write with a resume table", () => {
  const state = structuredClone(EMPTY_STATE);
  const players = ROSTER.slice(0, 12);
  const first = applyAction(state, "announceAndDraw", { evId:"pong", players }, gm("ad-1"));
  assert.equal(first.ok, true);
  assert.deepEqual({ drew:first.extra.drew, announced:first.extra.announced },
    { drew:true, announced:true });
  assert.ok(state.draws.pong);
  assert.ok(state.brackets.pong);
  assert.equal(state.onDeck, "pong");
  assert.ok(state.eventOps.pong.drawRevealedAt > 0);
  assert.ok(state.eventOps.pong.bettingOpenedAt > 0);
  /* the legacy announce chain owns this ceremony; no directed scene starts */
  assert.equal(state.showControl.active, null);

  const retried = applyAction(state, "announceAndDraw", { evId:"pong", players }, gm("ad-2"));
  assert.equal(retried.ok, true);
  assert.equal(retried.extra.unchanged, true);

  /* resume from a manual half-state: draw exists, betting never opened */
  const half = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(half, "runDraw", { evId:"pong", players }, gm("ad-3")).ok, true);
  const resumed = applyAction(half, "announceAndDraw", { evId:"pong", players }, gm("ad-4"));
  assert.equal(resumed.ok, true);
  assert.deepEqual({ drew:resumed.extra.drew, announced:resumed.extra.announced },
    { drew:false, announced:true });

  /* one market at a time survives the composite */
  const busy = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(busy, "setOnDeck", { id:"putt" }, gm("ad-5")).ok, true);
  assert.match(applyAction(busy, "announceAndDraw", { evId:"pong", players }, gm("ad-6")).error,
    /current betting market/i);
});

test("lockAndStart merges lock and start and retires the intro as skipped", () => {
  const state = structuredClone(EMPTY_STATE);
  applyAction(state, "announceEvent", { evId:"putt" }, gm("ls-1"));
  const locked = applyAction(state, "lockAndStart", { evId:"putt", ...contestRef(state, "putt") }, gm("ls-2"));
  assert.equal(locked.ok, true);
  assert.equal(state.onDeck, null);
  assert.ok(state.eventOps.putt.bettingLockedAt > 0);
  assert.ok(state.eventOps.putt.startedAt > 0);
  assert.equal(state.showControl.active, null);
  assert.equal(state.showControl.history[0].kind, "event-intro");
  assert.equal(state.showControl.history[0].outcome, "skipped");

  const retried = applyAction(state, "lockAndStart", { evId:"putt", ...contestRef(state, "putt") }, gm("ls-3"));
  assert.equal(retried.ok, true);
  assert.equal(retried.extra.unchanged, true);

  /* also legal from betting-locked, and refused before betting ever opened */
  const lockedFirst = structuredClone(EMPTY_STATE);
  applyAction(lockedFirst, "setOnDeck", { id:"putt" }, gm("ls-4"));
  applyAction(lockedFirst, "setOnDeck", { id:null, ...contestRef(lockedFirst, lockedFirst.onDeck) }, gm("ls-5"));
  assert.equal(applyAction(lockedFirst, "lockAndStart", { evId:"putt", ...contestRef(lockedFirst, "putt") }, gm("ls-6")).ok, true);
  const cold = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(cold, "lockAndStart", { evId:"putt", ...contestRef(cold, "putt") }, gm("ls-7")).ok, false);
});

test("posting a result carries its ceremony; corrections mark it stale and owe a replay", () => {
  const state = structuredClone(EMPTY_STATE);
  applyAction(state, "announceEvent", { evId:"putt" }, gm("wr-1"));
  applyAction(state, "lockAndStart", { evId:"putt", ...contestRef(state, "putt") }, gm("wr-2"));
  applyAction(state, "beginResultEntry", { evId:"putt" }, gm("wr-3"));
  const posted = applyAction(state, "saveResult",
    { evId:"putt", slots:[["Brandon"], [], []] }, gm("wr-4"));
  assert.equal(posted.ok, true);
  assert.equal(state.showControl.active.kind, "winner");
  assert.equal(state.showControl.active.revision, 1);
  assert.equal(resolveShowScene(state, events).staleReason, null);

  /* an overwrite bumps the revision under the live scene: stale, then clear */
  const corrected = applyAction(state, "saveResult", {
    evId:"putt", slots:[["Evan"], [], []],
    confirmOverwrite:true, correctionReason:"2nd and 1st were reversed",
  }, gm("wr-5"));
  assert.equal(corrected.ok, true);
  assert.equal(state.showControl.active.revision, 1);
  assert.match(resolveShowScene(state, events).staleReason, /corrected/i);
  assert.equal(resolveDirector(state, events, { showControl:true }).nextAction.type,
    "clear-scene");

  /* after clearing, the director owes the ceremony at the new revision */
  applyAction(state, "endShowScene",
    { id:state.showControl.active.id, outcome:"cancelled" }, gm("wr-6"));
  const replay = resolveDirector(state, events, { showControl:true });
  assert.equal(replay.nextAction.type, "replay-winner-scene");
  assert.equal(replay.nextAction.eventId, "putt");

  /* playing it manually stamps the revision, which settles the debt */
  assert.equal(applyAction(state, "startShowScene",
    { kind:"winner", eventId:"putt" }, gm("wr-7")).ok, true);
  assert.equal(state.showControl.active.revision, 2);
  applyAction(state, "advanceShowScene",
    { id:state.showControl.active.id }, gm("wr-8"));
  applyAction(state, "advanceShowScene",
    { id:state.showControl.active.id }, gm("wr-9"));
  assert.equal(state.showControl.active, null);
  assert.notEqual(resolveDirector(state, events, { showControl:true }).nextAction.type,
    "replay-winner-scene");
});

test("scenes never block the official write", () => {
  /* noScene (the QA sim path) posts with no ceremony and leaves no debt */
  const sim = structuredClone(EMPTY_STATE);
  applyAction(sim, "announceEvent", { evId:"putt" }, gm("nb-1"));
  applyAction(sim, "lockAndStart", { evId:"putt", ...contestRef(sim, "putt") }, gm("nb-2"));
  applyAction(sim, "beginResultEntry", { evId:"putt" }, gm("nb-3"));
  const posted = applyAction(sim, "saveResult",
    { evId:"putt", slots:[["Brandon"], [], []], noScene:true }, gm("nb-4"));
  assert.equal(posted.ok, true);
  assert.equal(sim.showControl.active, null);

  /* a scene mid-flight when the result posts retires cleanly, never errs */
  const busy = structuredClone(EMPTY_STATE);
  applyAction(busy, "announceEvent", { evId:"putt" }, gm("nb-5"));
  applyAction(busy, "lockAndStart", { evId:"putt", ...contestRef(busy, "putt") }, gm("nb-6"));
  applyAction(busy, "beginResultEntry", { evId:"putt" }, gm("nb-7"));
  applyAction(busy, "startShowScene", { kind:"standings" }, gm("nb-8"));
  const overStanding = applyAction(busy, "saveResult",
    { evId:"putt", slots:[["Brandon"], [], []] }, gm("nb-9"));
  assert.equal(overStanding.ok, true);
  assert.equal(busy.showControl.active.kind, "winner");
  /* the standings scene was on its only step, so it retired as completed */
  assert.equal(busy.showControl.history[0].kind, "standings");
  assert.equal(busy.showControl.history[0].outcome, "completed");
});

test("poker setup names its blockers before the tap instead of after it", () => {
  const state = structuredClone(EMPTY_STATE);
  const poker = events.find(ev => ev.finale && ev.game === "poker");
  assert.ok(poker);
  state.wagers = [{ id:"w1", player:"Brandon", kind:"outright", eventId:"putt",
    pick:"Tran", stake:100, ts:1 }];
  const blocked = resolveEventLifecycle(state, poker);
  assert.equal(blocked.nextAction.type, "setup-poker");
  assert.equal(blocked.nextAction.enabled, false);
  assert.match(blocked.nextAction.blockers[0], /open bet/i);

  state.wagers = [];
  const clear = resolveEventLifecycle(state, poker);
  assert.equal(clear.nextAction.enabled, true);
  assert.equal(clear.nextAction.blockers.length, 0);
});

test("clearing a draw keeps revision and correction history", () => {
  const state = structuredClone(EMPTY_STATE);
  const players = ROSTER.slice(0, 12);
  applyAction(state, "runDraw", { evId:"pong", players }, gm("cd-1"));
  state.eventOps.pong.revision = 2;
  state.eventOps.pong.corrections = [{ type:"clear", at:1, by:"Brandon", reason:"redo" }];
  const cleared = applyAction(state, "clearDraw", { evId:"pong" }, gm("cd-2"));
  assert.equal(cleared.ok, true);
  assert.equal(state.draws.pong, undefined);
  assert.equal(state.eventOps.pong.drawRevealedAt, undefined);
  assert.equal(state.eventOps.pong.revision, 2);
  assert.equal(state.eventOps.pong.corrections.length, 1);
});
