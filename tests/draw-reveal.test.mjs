import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, BUILTIN_EVENTS, ROSTER, defaultQaParticipants, resolveSlot } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { buildEventReveal, startDrawPlayback } from "../src/features/weekend/drawReveal.js";

function clock() {
  let now = 0, nextId = 0;
  const jobs = new Map(), queued = [];
  return {
    schedule(callback, delay) { const id = ++nextId; jobs.set(id, { callback, at:now + delay }); queued.push(callback); return id; },
    cancel(id) { jobs.delete(id); },
    tick(ms) { now += ms; for (const [id, job] of [...jobs].sort((a,b) => a[1].at - b[1].at)) if (job.at <= now) { jobs.delete(id); job.callback(); } },
    get pending() { return jobs.size; },
    queued,
  };
}

test("draw reveals saved groups in order, stays finished, and bounds long draws", () => {
  for (const total of [2, 4, 13]) {
    const time = clock(), seen = [];
    startDrawPlayback({ total, onStep:value => seen.push(value), schedule:time.schedule, cancel:time.cancel });
    assert.deepEqual(seen, [0]);
    time.tick(479); assert.deepEqual(seen, [0]);
    time.tick(1); assert.deepEqual(seen, [0,1]);
    time.tick(3000);
    assert.deepEqual(seen, Array.from({ length:total + 1 }, (_,index) => index));
    assert.equal(time.pending, 0);
    time.tick(30000); assert.equal(seen.at(-1), total);
  }
});

test("skip and unmount cancel the clock, including already queued callbacks; replay starts fresh", () => {
  const time = clock(), seen = [];
  const options = { total:3, onStep:value => seen.push(value), schedule:time.schedule, cancel:time.cancel };
  const first = startDrawPlayback(options);
  time.tick(480); first.skip();
  assert.deepEqual(seen, [0,1,3]); assert.equal(time.pending, 0);
  time.queued.forEach(callback => callback());
  assert.deepEqual(seen, [0,1,3], "Skip must never regress to an earlier group");
  const replay = startDrawPlayback(options);
  assert.equal(seen.at(-1), 0);
  time.tick(480); assert.equal(seen.at(-1), 1);
  replay.stop(); const before = [...seen];
  time.queued.forEach(callback => callback()); time.tick(5000);
  assert.deepEqual(seen, before); assert.equal(time.pending, 0);
});

test("reduced motion goes straight to the complete draw without scheduling movement", () => {
  const seen = [];
  const options = { total:4, reducedMotion:true, onStep:value => seen.push(value), schedule:() => assert.fail("Reduced motion must not start a clock") };
  startDrawPlayback(options).stop();
  startDrawPlayback(options).stop();
  assert.deepEqual(seen, [4,4], "Replay respects the same preference");
});

function prepared(eventId) {
  const state = structuredClone(EMPTY_STATE), ev = BUILTIN_EVENTS.find(event => event.id === eventId);
  const result = applyAction(state, "runDraw", { evId:ev.id, players:defaultQaParticipants(ev) }, { isGm:true, player:ROSTER[0] });
  assert.equal(result.ok, true, result.error);
  return { state, ev };
}

test("replay reads the actual first-round matchups and byes without changing saved assignments", () => {
  const { state, ev } = prepared("8ball"), original = JSON.stringify(state);
  const reveal = buildEventReveal(state, ev), bracket = state.brackets[ev.id], draw = state.draws[ev.id];
  assert.equal(reveal.id, draw.id); assert.equal(reveal.evId, ev.id);
  const pairs = bracket.rounds[0].map(match => [resolveSlot(bracket,match.a), resolveSlot(bracket,match.b)])
    .filter(pair => pair.every(index => index !== null));
  assert.deepEqual(reveal.groups.filter(group => group.vs).map(group => group.lines.map(line => line.avatars)),
    pairs.map(pair => pair.map(index => draw.teams[index].players)));
  assert.deepEqual(reveal.groups.flatMap(group => group.lines.flatMap(line => line.avatars)).sort(), draw.teams.flatMap(team => team.players).sort());
  assert.deepEqual(reveal.crew, draw.roles || []);
  assert.deepEqual(buildEventReveal(state,ev), reveal);
  assert.equal(JSON.stringify(state), original);
});

test("the latest saved stage reveal keeps complete entrants and named teams", () => {
  const state = structuredClone(EMPTY_STATE), ev = BUILTIN_EVENTS.find(event => event.id === "pingpong");
  const result = applyAction(state, "runStages", { evId:ev.id, cfg:{ kind:"heats", nGroups:3, advance:2, players:ROSTER } }, { isGm:true, player:ROSTER[0] });
  assert.equal(result.ok, true, result.error);
  state.profiles[ROSTER[0]] = { display:"Saved display name", ratings:{ private:5 } };
  const before = JSON.stringify(state), reveal = buildEventReveal(state,ev);
  assert.equal(reveal.id, state.stages[ev.id].id);
  assert.equal(reveal.title, "The heats");
  assert.deepEqual(reveal.groups.map(group => group.lines.flatMap(line => line.avatars)), state.stages[ev.id].groups.map(group => group.entrants));
  assert.ok(reveal.groups.some(group => group.lines.some(line => line.text === "Saved display name")));
  assert.equal(JSON.stringify(reveal).includes("ratings"), false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(buildEventReveal(state,{ id:"missing" }), null);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:'export { DrawAnnouncement, EventAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";', resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("draw-reveal.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { DrawAnnouncement, EventAnnouncement, PlayerIdentityProvider } = mod.exports;
function render(props, Component = DrawAnnouncement) {
  const buttons = [], create = React.createElement;
  React.createElement = (type, attributes, ...children) => {
    if (type === "button") buttons.push(attributes);
    return create(type, attributes, ...children);
  };
  try {
    return { html:renderToStaticMarkup(create(PlayerIdentityProvider, { profiles:props.state.profiles }, create(Component,props))), buttons };
  } finally { React.createElement = create; }
}

test("covered player controls cannot fire, while reduced-motion final cards and crew open independently", () => {
  const state = structuredClone(EMPTY_STATE), viewed = [];
  let bets = 0, closed = 0;
  const props = { state, reveal:{ id:"real-saved-draw", title:"The draw", subtitle:"Volleyball",
    versus:[{ name:"The Sidewinders", players:ROSTER.slice(0,6) }, { name:"The Coyotes", players:ROSTER.slice(6,12) }],
    crew:[{ player:ROSTER[12], role:"photographer" }],
  }, onPlayer:player => viewed.push(player), onBets:() => { bets++; }, onClose:() => { closed++; } };
  const hidden = render({ ...props, reducedMotion:false });
  const hiddenPlayers = hidden.buttons.filter(button => button["aria-label"]?.startsWith("View "));
  assert.equal(hiddenPlayers.length, ROSTER.length);
  for (const button of hiddenPlayers) { assert.equal(button.disabled,true); assert.equal(button.tabIndex,-1); button.onClick(); }
  assert.deepEqual(viewed,[]); assert.match(hidden.html,/Skip animation/);
  const complete = render({ ...props, reducedMotion:true });
  assert.match(complete.html,/<h3>The Sidewinders<\/h3>/); assert.match(complete.html,/<h3>The Coyotes<\/h3>/);
  assert.match(complete.html,/Draw complete/); assert.match(complete.html,/Replay draw/);
  const players = complete.buttons.filter(button => button["aria-label"]?.startsWith("View "));
  for (const button of players) { assert.equal(button.disabled,false); button.onClick(); }
  assert.deepEqual(viewed,ROSTER); assert.equal(bets,0); assert.equal(closed,0);
});

test("returning from a player card starts with the finished draw even when motion is enabled", () => {
  const { state, ev } = prepared("8ball");
  const { html, buttons } = render({ state, reveal:buildEventReveal(state,ev), initialComplete:true,
    reducedMotion:false, onPlayer:() => {}, onClose:() => {} });
  assert.match(html,/Draw complete/); assert.match(html,/Replay draw/);
  assert.doesNotMatch(html,/Skip animation/);
  assert.match(html,/fd-draw-announcement is-reduced/);
  assert.ok(buttons.filter(button => button["aria-label"]?.startsWith("View ")).every(button => button.disabled === false));
});

test("the game handoff does not expose the matchup before its draw reveal", () => {
  const { state, ev } = prepared("8ball");
  const { html } = render({ state, ev, handoff:true, onClose:() => {} }, EventAnnouncement);
  assert.match(html,/On deck/); assert.match(html,/View draw/);
  assert.doesNotMatch(html,/Play-in|Semifinals|Teams drawn/);
});
