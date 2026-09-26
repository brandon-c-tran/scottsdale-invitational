import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STATE, BUILTIN_EVENTS, ROSTER, defaultQaParticipants, draftTurn,
  computeStandings, resolveCurrentContest, resolveEventLifecycle,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const fresh = () => structuredClone(EMPTY_STATE);
const event = id => BUILTIN_EVENTS.find(ev => ev.id === id);
let serial = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"draft-host", actionId:`draft-${++serial}` });
const guest = player => ({ player, deviceId:`draft-${player}`, actionId:`draft-${++serial}` });
const setup = (ev = event("bball")) => {
  const players = defaultQaParticipants(ev);
  return { evId:ev.id, players, captains:players.slice(0, ev.teamCfg.teams),
    roles:ROSTER.filter(player => !players.includes(player)).map(player => ({ player, role:"referee" })) };
};
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refs = (state, evId = "bball") => {
  const { draftId, pickIndex, draftRevision } = draftTurn(state.drafts[evId]);
  return { draftId, pickIndex, draftRevision };
};
const started = (ev = event("bball")) => {
  const state = fresh();
  if (!BUILTIN_EVENTS.some(item => item.id === ev.id)) state.customEvents.push(ev);
  act(state, "startDraft", setup(ev)); return state;
};
const pick = (state, evId = "bball", player = state.drafts[evId].pool[0], ctx) => {
  const turn = draftTurn(state.drafts[evId]);
  return act(state, "pickDraftPlayer", { evId, player, ...refs(state, evId) }, ctx || guest(turn.captain));
};
const complete = (state, evId = "bball") => {
  while (state.drafts[evId].pool.length) pick(state, evId);
};
const rejectsWithoutMutation = (state, type, payload, message, ctx = gm()) => {
  const before = structuredClone(state), result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should reject`);
  if (message) assert.match(result.error, message, type);
  assert.deepEqual(state, before, `${type} cannot change state when rejected`);
};

for (const [evId, order] of [
  ["six-team-draft", [0, 1, 2, 3, 4, 5]],
  ["bball", [0, 1, 2, 3, 3, 2, 1, 0]],
  ["volley", [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]],
]) {
  test(`${evId}: every captain picks in snake order and the exact teams finalize once`, () => {
    const ev = event(evId) || { ...event("8ball"), id:evId, kind:"team" };
    const state = started(ev), initial = setup(ev), standings = computeStandings(state);
    const draft = state.drafts[evId], expected = initial.captains.map(captain => [captain]);
    assert.equal(draftTurn(draft).totalPicks, order.length);
    for (const [index, teamIndex] of order.entries()) {
      const turn = draftTurn(draft), player = draft.pool[0];
      assert.equal(turn.pickIndex, index);
      assert.equal(turn.draftRevision, index);
      assert.equal(turn.teamIndex, teamIndex);
      assert.equal(turn.captain, initial.captains[teamIndex]);
      assert.equal(turn.round, Math.floor(index / ev.teamCfg.teams) + 1);
      expected[teamIndex].push(player);
      pick(state, evId, player);
      assert.equal(state.live, false);
      assert.equal(state.onDeck, null);
      assert.deepEqual(state.wagers, []);
    }
    const turn = draftTurn(draft);
    assert.equal(turn.complete, true);
    assert.equal(turn.captain, null);
    assert.equal(turn.teamIndex, null);
    assert.deepEqual(draft.teams.map(team => team.players), expected);
    const payload = { evId, ...refs(state, evId) }, ctx = gm();
    const posted = act(state, "finalizeDraft", payload, ctx);
    const draw = structuredClone(state.draws[evId]);
    assert.equal(posted.extra.drawId, draw.id);
    assert.equal(draw.sourceDraftId, draft.id);
    assert.deepEqual(draw.teams.map(team => team.captain), initial.captains);
    assert.deepEqual(draw.teams.map(team => team.players), expected);
    assert.deepEqual(draw.draft.picks, draft.picks);
    assert.deepEqual(draw.roles, initial.roles);
    assert.equal(state.drafts[evId], undefined);
    assert.equal(state.eventOps[evId].lastDraft.status, "finalized");
    assert.equal(state.eventOps[evId].lastDraft.drawId, draw.id);
    assert.equal(state.live, false);
    assert.deepEqual(computeStandings(state), standings);
    if (ev.teamCfg.bracket) assert.equal(state.brackets[evId].size, ev.teamCfg.bracket);
    else assert.equal(state.brackets[evId], undefined);
    assert.equal(act(state, "finalizeDraft", payload, ctx).extra.unchanged, true);
    assert.equal(act(state, "finalizeDraft", payload).extra.unchanged, true);
    assert.deepEqual(state.draws[evId], draw, "A retry cannot rename, reseed, or replace finalized teams");
    draft.teams[0].players.push("not in the saved draw");
    draft.picks[0].player = "not in the saved history";
    assert.deepEqual(state.draws[evId], draw, "Finalized references do not alias the retired draft");
  });
}

test("only the on-clock captain or commissioner can make a pick", () => {
  const state = started(), payload = { evId:"bball", player:state.drafts.bball.pool[0], ...refs(state) };
  rejectsWithoutMutation(state, "pickDraftPlayer", payload, /Not your pick/, guest(ROSTER[1]));
  rejectsWithoutMutation(state, "pickDraftPlayer", payload, /Choose your player/, guest("unknown"));
  rejectsWithoutMutation(state, "pickDraftPlayer", { ...payload, player:ROSTER[0] }, /not available/i, guest(ROSTER[0]));
  act(state, "pickDraftPlayer", payload, gm());
  assert.equal(state.drafts.bball.picks.length, 1, "The host may enter a captain's spoken choice");
  for (const type of ["startDraft", "undoDraftPick", "finalizeDraft", "cancelDraft"]) {
    rejectsWithoutMutation(state, type, type === "startDraft" ? setup() : { evId:"bball", ...refs(state) },
      /Commissioner only/, guest(ROSTER[0]));
  }
});

test("new draft references reject missing, stale, and delayed taps across an undo", () => {
  const state = started(), evId = "bball", old = refs(state), player = state.drafts[evId].pool[0];
  rejectsWithoutMutation(state, "pickDraftPlayer", { evId, player }, /Draft changed/);
  rejectsWithoutMutation(state, "pickDraftPlayer", { evId, player, ...old, draftId:"other-draft" }, /Draft changed/);
  for (const type of ["undoDraftPick", "finalizeDraft", "cancelDraft"])
    rejectsWithoutMutation(state, type, { evId }, /Draft changed/);
  pick(state);
  rejectsWithoutMutation(state, "pickDraftPlayer", { evId, player:state.drafts[evId].pool[0], ...old }, /Draft changed/);
  act(state, "undoDraftPick", { evId, ...refs(state) });
  assert.equal(draftTurn(state.drafts[evId]).pickIndex, old.pickIndex);
  assert.equal(draftTurn(state.drafts[evId]).draftRevision, 2);
  assert.equal(state.drafts[evId].pool[0], player, "Undo restores the available-player order");
  rejectsWithoutMutation(state, "pickDraftPlayer", { evId, player, ...old }, /Draft changed/);
  pick(state, evId, state.drafts[evId].pool[1]);
  assert.equal(state.drafts[evId].picks.length, 1);
});

test("pick and undo acknowledgements can be retried without taking the next turn", () => {
  const state = started(), evId = "bball", firstCaptain = draftTurn(state.drafts[evId]).captain;
  const payload = { evId, player:state.drafts[evId].pool[0], ...refs(state) }, captain = guest(firstCaptain);
  act(state, "pickDraftPlayer", payload, captain);
  const afterPick = structuredClone(state);
  assert.equal(act(state, "pickDraftPlayer", payload, captain).extra.unchanged, true);
  assert.deepEqual(state, afterPick);
  rejectsWithoutMutation(state, "pickDraftPlayer", { ...payload, player:state.drafts[evId].pool[0] }, /Request id already used/, captain);
  rejectsWithoutMutation(state, "pickDraftPlayer", payload, /Request id already used/, { ...captain, player:ROSTER[1] });
  pick(state);
  const undo = { evId, ...refs(state) }, ctx = gm();
  act(state, "undoDraftPick", undo, ctx);
  const afterUndo = structuredClone(state);
  assert.equal(act(state, "undoDraftPick", undo, ctx).extra.unchanged, true);
  assert.deepEqual(state, afterUndo);
  assert.equal(state.drafts[evId].picks.length, 1);
  // A lost acknowledgement arriving after the commissioner undid the pick
  // reports its original success, without silently making it again.
  assert.equal(act(state, "pickDraftPlayer", payload, captain).extra.unchanged, true);
  assert.deepEqual(state, afterUndo);
});

test("starting and cancelling preserve draft identity and cannot touch a newer draft on retry", () => {
  const state = fresh(), payload = setup(), ctx = gm();
  act(state, "startDraft", payload, ctx);
  const firstId = state.drafts.bball.id;
  pick(state);
  const afterPick = structuredClone(state);
  assert.equal(act(state, "startDraft", payload, ctx).extra.unchanged, true);
  assert.deepEqual(state, afterPick);
  act(state, "startDraft", payload);
  assert.equal(state.drafts.bball.id, firstId);
  assert.equal(state.drafts.bball.picks.length, 1);
  rejectsWithoutMutation(state, "startDraft", { ...payload, captains:[...payload.captains].reverse() }, /draft is running/i);
  const cancel = { evId:"bball", ...refs(state) }, cancelCtx = gm();
  act(state, "cancelDraft", cancel, cancelCtx);
  assert.equal(state.drafts.bball, undefined);
  assert.equal(state.eventOps.bball.lastDraft.status, "cancelled");
  assert.equal(act(state, "cancelDraft", cancel).extra.unchanged, true);
  act(state, "startDraft", payload);
  assert.notEqual(state.drafts.bball.id, firstId);
  const newer = structuredClone(state);
  assert.equal(act(state, "cancelDraft", cancel, cancelCtx).extra.unchanged, true);
  assert.equal(act(state, "startDraft", payload, ctx).extra.unchanged, true);
  assert.deepEqual(state, newer);
  rejectsWithoutMutation(state, "cancelDraft", cancel, /Draft changed/);
  assert.equal(state.live, false);
  assert.deepEqual(state.wagers, []);
});

test("draft setup validates exact participants, captain membership, and supported teams", () => {
  const valid = setup();
  for (const [payload, message] of [
    [{ ...valid, players:ROSTER }, /exactly 12/i],
    [{ ...valid, players:[...valid.players.slice(1), valid.players[1]] }, /selected twice/],
    [{ ...valid, players:["unknown", ...valid.players.slice(1)] }, /confirmed players/],
    [{ ...valid, captains:valid.captains.slice(1) }, /one captain per team/],
    [{ ...valid, captains:[...valid.captains.slice(1), valid.captains[1]] }, /captain is listed twice/],
    [{ ...valid, captains:[ROSTER[12], ...valid.captains.slice(1)] }, /playing pool/],
    [{ ...valid, evId:"putt" }, /Not a team event/],
    [{ ...valid, evId:"8ball" }, /Not a team event/],
  ]) rejectsWithoutMutation(fresh(), "startDraft", payload, message);
  const invalid = fresh();
  invalid.customEvents.push({ ...event("bball"), id:"bad-teams", teamCfg:{ teams:3, size:4, bracket:3 } });
  rejectsWithoutMutation(invalid, "startDraft", { ...valid, evId:"bad-teams", captains:valid.captains.slice(0, 3) }, /Unsupported/);
});

test("finalization rejects incomplete or corrupted teams without dropping the draft", () => {
  const state = started();
  rejectsWithoutMutation(state, "finalizeDraft", { evId:"bball", ...refs(state) }, /Pool not empty/);
  complete(state);
  const corruptions = [
    d => { d.teams[0].players[1] = d.teams[1].players[1]; },
    d => { d.teams[0].captain = d.teams[1].captain; },
    d => { d.picks[0].team = 1; },
    d => { d.teams.pop(); },
  ];
  for (const corrupt of corruptions) {
    const broken = structuredClone(state); corrupt(broken.drafts.bball);
    rejectsWithoutMutation(broken, "finalizeDraft", { evId:"bball", ...refs(broken) });
    assert.equal(broken.draws.bball, undefined);
  }
});

test("draft edits cannot overwrite teams once betting opens, play starts, or the board freezes", () => {
  for (const mutate of [
    state => { state.onDeck = "bball"; },
    state => { state.eventOps.bball.bettingOpenedAt = 1; },
    state => { state.eventOps.bball.bettingLockedAt = 2; },
    state => { state.eventOps.bball.startedAt = 3; },
    state => { state.frozen = true; },
    state => { state.results.bball = { slots:[[ROSTER[0]]], ts:1 }; },
    state => { state.shelved.bball = true; },
    state => { state.poker = { id:"poker", total:13000, startingStacks:{}, counts:{} }; },
  ]) {
    const state = started(); complete(state);
    mutate(state);
    for (const type of ["pickDraftPlayer", "undoDraftPick", "finalizeDraft", "cancelDraft"])
      rejectsWithoutMutation(state, type, { evId:"bball", player:ROSTER[0], ...refs(state) });
    rejectsWithoutMutation(state, "startDraft", setup());
  }
  const state = started();
  rejectsWithoutMutation(state, "runDraw", { evId:"bball", players:setup().players }, /Finish or cancel/);
  rejectsWithoutMutation(state, "announceAndDraw", setup(), /Finish or cancel/);
  rejectsWithoutMutation(state, "announceEvent", { evId:"bball" });
});

test("a finalized draft opens the correct contest and late finalization retries keep its bets intact", () => {
  const state = started(); complete(state);
  const payload = { evId:"bball", ...refs(state) }, ctx = gm();
  act(state, "finalizeDraft", payload, ctx);
  const drawId = state.draws.bball.id;
  act(state, "announceEvent", { evId:"bball" });
  const current = resolveCurrentContest(state, event("bball")), player = ROSTER[12];
  act(state, "placeWager", { wager:{ kind:"match", eventId:"bball", match:current.match,
    teamIdx:current.sides[0].key, drawId, stake:100,
    contestId:current.id, contestRevision:current.revision } }, guest(player));
  const before = structuredClone(state);
  assert.equal(act(state, "finalizeDraft", payload, ctx).extra.unchanged, true);
  assert.equal(act(state, "finalizeDraft", payload).extra.unchanged, true);
  assert.deepEqual(state, before);
  assert.equal(resolveEventLifecycle(state, event("bball")).phase, "betting-open");
  assert.equal(state.wagers.length, 1);
});

test("an existing unversioned draft remains editable and finalizes without changing its selected players", () => {
  const state = started(), d = state.drafts.bball;
  delete d.version; delete d.revision; delete d.players;
  act(state, "pickDraftPlayer", { evId:"bball", player:d.pool[0] }, guest(d.teams[0].captain));
  act(state, "undoDraftPick", { evId:"bball" });
  while (d.pool.length) act(state, "pickDraftPlayer", { evId:"bball", player:d.pool[0] }, guest(draftTurn(d).captain));
  const expected = structuredClone(d.teams);
  act(state, "finalizeDraft", { evId:"bball" });
  assert.deepEqual(state.draws.bball.teams.map(({ captain, players }) => ({ captain, players })), expected);
  assert.equal(state.live, false);
});
