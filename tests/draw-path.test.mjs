import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* D10 "Your path after the draw": the one line a synced reveal ends on for
   the players in it. */
globalThis.__FD_BUILD_ID__ = "build-test";

const {
  EMPTY_STATE, ROSTER, BUILTIN_EVENTS, allEventsOf, bracketMatchName, defaultQaParticipants, makeBracket, resolveSlot,
} = await import("../shared/core.js");
const { applyAction } = await import("./support/confirmed-start.mjs");
const { withLegacyEvents } = await import("./support/legacy-events.mjs");
const { bracketDrawPath, drawPath, drawPathText, stageDrawPath } = await import("../src/features/weekend/drawPath.js");
const { buildEventReveal, drawRevealGroups } = await import("../src/features/weekend/drawReveal.js");

let seq = 0;
const gm = (player = ROSTER[0]) => ({ isGm:true, player, deviceId:"path-test", actionId:`pt-${++seq}` });
const eventOf = id => BUILTIN_EVENTS.find(ev => ev.id === id);
const fresh = () => structuredClone(EMPTY_STATE);

/* ── D10: the path model ── */
const soloBracket = n => {
  const s = fresh();
  const players = ROSTER.slice(0, n);
  s.draws.bball1 = { id:`d-${n}`, teams:players.map(player => ({ players:[player] })), ts:1 };
  s.brackets.bball1 = makeBracket(n);
  return { s, players };
};

test("a bracket of 4 to 13 draws every player's path from their first match to the final, byes included", () => {
  for (let n = 4; n <= 13; n++) {
    const { s, players } = soloBracket(n);
    const bracket = s.brackets.bball1, finalRound = bracket.rounds.length - 1;
    for (const [team, player] of players.entries()) {
      const path = bracketDrawPath(s, "bball1", player);
      assert.ok(path, `${n}: ${player}`);
      assert.equal(path.team, team);
      const first = path.steps[0];
      const [r0, m0] = first.id.split(":").map(Number);
      const match = bracket.rounds[r0][m0];
      assert.ok(resolveSlot(bracket, match.a) === team || resolveSlot(bracket, match.b) === team, "starts where seated");
      /* a first-round bye enters later: everyone plays in round 1 only if seated there */
      const inRoundOne = bracket.rounds[0].some(item => resolveSlot(bracket, item.a) === team || resolveSlot(bracket, item.b) === team);
      assert.equal(r0 === 0, inRoundOne, `${n}: ${player} bye`);
      assert.equal(path.steps.length, finalRound - r0 + 1, "one stop per round to the final");
      assert.equal(path.steps.at(-1).final, true);
      assert.equal(path.steps.at(-1).label, "Final");
      path.steps.forEach((step, index) => {
        const [r, m] = step.id.split(":").map(Number);
        assert.equal(r, r0 + index);
        assert.equal(step.label, bracketMatchName(bracket, r, m));
        assert.ok(step.opponents?.length || step.from, "an opponent or the match that decides it");
        if (step.opponents) assert.ok(!step.opponents.includes(player));
        if (step.from) assert.match(step.from, /\S/);
        for (const team of step.candidates) assert.ok(team.length && !team.includes(player));
      });
      /* the first opponent is named, unless you wait on a match */
      const other = resolveSlot(bracket, match.a) === team ? match.b : match.a;
      if (other.t !== undefined) assert.deepEqual(first.opponents, [players[other.t]]);
      else assert.equal(first.from, bracketMatchName(bracket, other.w[0], other.w[1]));
      assert.doesNotMatch(drawPathText(path), /[—!]|undefined|null/);
    }
    assert.equal(bracketDrawPath(s, "bball1", ROSTER[13] || "Nobody"), null, "not in the draw");
  }
});

test("a decided match reads as won or lost, and a loss ends the path", () => {
  const { s, players } = soloBracket(4);
  const bracket = s.brackets.bball1;
  const a = resolveSlot(bracket, bracket.rounds[0][0].a), b = resolveSlot(bracket, bracket.rounds[0][0].b);
  bracket.rounds[0][0].winner = a;
  const winner = bracketDrawPath(s, "bball1", players[a]);
  assert.equal(winner.steps[0].won, true);
  assert.equal(winner.steps.length, 2);
  const loser = bracketDrawPath(s, "bball1", players[b]);
  assert.equal(loser.steps.length, 1);
  assert.equal(loser.steps[0].lost, true);
  /* the other semifinal's winner now knows exactly whom the final might bring */
  const c = resolveSlot(bracket, bracket.rounds[0][1].a);
  const final = bracketDrawPath(s, "bball1", players[c]).steps[1];
  assert.deepEqual(final.opponents, [players[a]]);
});

test("the real 8-ball draw: pairs, byes to the semifinals, and candidates for the next round", () => {
  const s = fresh();
  const ev = eventOf("8ball");
  assert.equal(applyAction(s, "announceAndDraw", { evId:ev.id, players:defaultQaParticipants(ev) }, gm()).ok, true);
  const reveal = buildEventReveal(s, ev);
  const draw = s.draws["8ball"];
  for (const [index, team] of draw.teams.entries()) {
    const path = drawPath(s, reveal, team.players[0]);
    assert.equal(path.kind, "bracket");
    assert.equal(path.team, index);
    const bye = !s.brackets["8ball"].rounds[0].some(match => [match.a.t, match.b.t].includes(index));
    assert.equal(path.steps.length, bye ? 2 : 3);
    if (bye) {
      assert.match(path.steps[0].label, /^Semifinal/);
      assert.equal(path.steps[0].candidates.length, 2, "the play-in's two pairs");
      assert.ok(path.steps[0].candidates.every(pair => pair.length === 2));
    } else {
      assert.match(path.steps[0].label, /^Play-in/);
      assert.equal(path.steps[0].opponents.length, 2);
      assert.equal(path.steps[1].opponents.length, 2, "the seed waiting in the semifinal is known");
    }
  }
  /* the crew and anyone left out get nothing new */
  const outside = ROSTER.find(player => !draw.teams.some(team => team.players.includes(player)));
  if (outside) assert.equal(drawPath(s, reveal, outside), null);
  assert.equal(drawPath(s, { ...reveal, id:"old-draw" }, draw.teams[0].players[0]), null, "a stale reveal has no path");
});

test("heats and pools: your group, its rivals, who goes through, then the final", () => {
  const players = ROSTER.slice(0, 12);
  const heats = fresh();
  heats.stages.beerio = { id:"st-1", eventId:"beerio", kind:"heats", advance:1, entrantType:"solo",
    groups:[{ name:"Heat 1", entrants:players.slice(0, 4) }, { name:"Heat 2", entrants:players.slice(4, 8) },
      { name:"Heat 3", entrants:players.slice(8, 12) }] };
  const path = drawPath(heats, { id:"st-1", evId:"beerio" }, players[5]);
  assert.equal(path.kind, "stage");
  assert.deepEqual(path.steps.map(step => step.label), ["Heat 2", "Final"]);
  assert.deepEqual(path.steps[0].opponents, [players[4], players[6], players[7]]);
  assert.equal(path.steps[0].note, "Winner goes through");
  assert.equal(path.steps[1].final, true);
  assert.equal(path.steps[1].from, "3 heat winners");
  assert.equal(drawPathText(path), `Heat 2 vs ${players[4]} & ${players[6]} & ${players[7]} (Winner goes through), then Final vs 3 heat winners`);
  /* two through */
  heats.stages.beerio.advance = 2;
  assert.equal(stageDrawPath(heats, "beerio", players[0]).steps[0].note, "Top 2 go through");
  /* knocked out in the heat: the final drops away */
  heats.stages.beerio.advance = 1;
  heats.stages.beerio.groups[1].through = [players[4]];
  const out = stageDrawPath(heats, "beerio", players[5]);
  assert.equal(out.steps.length, 1);
  assert.equal(out.steps[0].lost, true);
  assert.equal(stageDrawPath(heats, "beerio", players[4]).steps[0].won, true);
  assert.equal(drawPath(heats, { id:"st-1", evId:"beerio" }, ROSTER[12]), null, "a spectator");

  /* pools of pairs, from the (legacy) spikeball setup */
  const pools = withLegacyEvents(fresh(), ["spike"]);
  const spike = allEventsOf(pools).find(ev => ev.id === "spike");
  assert.equal(applyAction(pools, "announceAndDraw", { evId:"spike", players:defaultQaParticipants(spike) }, gm()).ok, true);
  const stage = pools.stages.spike;
  assert.ok(stage, "announce and draw sets up the pools");
  const me = pools.draws.spike.teams[0].players[0];
  const partner = pools.draws.spike.teams[0].players[1];
  for (const reveal of [{ id:stage.id, evId:"spike" }, { id:pools.draws.spike.id, evId:"spike" }]) {
    const poolPath = drawPath(pools, reveal, me);
    assert.equal(poolPath.kind, "stage");
    assert.match(poolPath.steps[0].label, /\S/);
    assert.equal(poolPath.steps[0].opponents.includes(partner), false, "your partner is not your rival");
    assert.equal(poolPath.steps[0].opponents.length % 2, 0, "rival pairs");
    assert.equal(poolPath.steps[1].from, `${stage.groups.length} pool winner${stage.groups.length === 1 ? "" : "s"}`);
  }
  /* a two-team game (the 7 v 6 full court) has no path beyond the matchup on screen */
  const full = fresh(), bball5 = allEventsOf(full).find(ev => ev.id === "bball5");
  assert.equal(applyAction(full, "announceAndDraw", { evId:"bball5", players:defaultQaParticipants(bball5) }, gm()).ok, true);
  const vr = buildEventReveal(full, bball5);
  assert.equal(drawPath(full, vr, full.draws.bball5.teams[0].players[0]), null);
});


/* ── components ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { DrawAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("draw-path.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { DrawAnnouncement, PlayerIdentityProvider } = mod.exports;
function render(Component, props) {
  const buttons = [], create = React.createElement;
  React.createElement = (type, attributes, ...children) => {
    if (type === "button") buttons.push(attributes);
    return create(type, attributes, ...children);
  };
  try {
    return { html:renderToStaticMarkup(create(PlayerIdentityProvider, { profiles:props.state.profiles }, create(Component, props))), buttons };
  } finally { React.createElement = create; }
}

function eightBall() {
  const state = fresh();
  const ev = eventOf("8ball");
  assert.equal(applyAction(state, "announceAndDraw", { evId:ev.id, players:defaultQaParticipants(ev) }, gm()).ok, true);
  return { state, ev, reveal:buildEventReveal(state, ev) };
}

test("the synced reveal ends on your path; spectators and replays end as before", () => {
  const { state, reveal } = eightBall();
  const me = state.draws["8ball"].teams[0].players[0];
  const later = () => Number(state.eventOps["8ball"].announcedAt) + 60_000;
  const mine = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:false, now:later, onClose:() => {},
    onBets:() => {} });
  assert.match(mine.html, /class="fd-draw-footer"/, "joined after the end: the path is simply there");
  assert.doesNotMatch(mine.html, /is-drawing/);
  assert.match(mine.html, /role="img" aria-label="Your path: (Play-in|Semifinal) \d vs /);
  assert.match(mine.html, /<b>You<\/b>/);
  assert.match(mine.html, /<b>Final<\/b>/);
  /* the hand-off to Bets sits right under it */
  assert.match(mine.html, /fd-draw-footer[\s\S]*Place chips[\s\S]*Done/);

  /* a spectator (or the crew) sees the reveal end as before */
  const outside = ROSTER.find(player => !state.draws["8ball"].teams.some(team => team.players.includes(player)));
  if (outside) {
    const spectator = render(DrawAnnouncement, { state, reveal, me:outside, synced:true, reducedMotion:false, now:later, onClose:() => {} });
    assert.doesNotMatch(spectator.html, /fd-draw-path|fd-draw-footer/);
  }
  /* a replay from the event sheet is not the ceremony */
  const replay = render(DrawAnnouncement, { state, reveal, me, initialComplete:true, reducedMotion:false, onClose:() => {} });
  assert.doesNotMatch(replay.html, /fd-draw-path/);
  /* reduced motion: the line as it lies */
  const reduced = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:true, onClose:() => {} });
  assert.match(reduced.html, /class="fd-draw-footer"/);
  assert.doesNotMatch(reduced.html, /is-drawing/);
  /* covered cards never show a path early */
  const early = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:false,
    now:() => Number(state.eventOps["8ball"].announcedAt), onClose:() => {} });
  assert.doesNotMatch(early.html, /fd-draw-path/);
  /* the path names only real people */
  const groups = drawRevealGroups(state, reveal);
  assert.ok(groups.length);
  assert.doesNotMatch(mine.html, /undefined|null winner/);
});
