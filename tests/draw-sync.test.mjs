/* M7 + M8: every screen reveals the draw together, and your own card rings.
   The timeline is pure (drawReveal.js) and anchored on the server's
   announcement stamp (eventOps[ev].announcedAt), so these tests drive it with
   explicit server times rather than wall clocks. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, BUILTIN_EVENTS, ROSTER, CHIP_COLORS, resolveCurrentContest, defaultQaParticipants } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { sharedProjection } from "../worker/publicState.js";
import {
  DRAW_INTRO_MS, DRAW_INTRO_REDUCED_MS, buildEventReveal, drawRevealGroups, drawSequenceMs, drawStepAt, drawStepDelay,
  introRemainingMs, revealTimeline, startDrawPlayback,
} from "../src/features/weekend/drawReveal.js";
import { TV_INTRO_OVERLAY_MS } from "../src/features/tv/tvModel.js";

let seq = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"draw-sync", actionId:`ds-${++seq}` });
const players = ROSTER.slice(0, 12);

/* a fake timer queue on a server clock the test moves */
function serverClock(start = 1_000_000) {
  let now = start, nextId = 0;
  const jobs = new Map();
  return {
    now:() => now,
    schedule(callback, delay) { const id = ++nextId; jobs.set(id, { callback, at:now + delay }); return id; },
    cancel(id) { jobs.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        jobs.delete(due[0]); now = Math.max(now, due[1].at); due[1].callback();
      }
      now = end;
    },
    get pending() { return jobs.size; },
  };
}

test("the step model counts cards on the same schedule the reveal always used", () => {
  for (const total of [1, 2, 3, 5, 9, 13]) {
    assert.equal(drawStepAt(-500, total), 0);
    assert.equal(drawStepAt(0, total), 0);
    assert.equal(drawStepAt(479, total), 0);
    assert.equal(drawStepAt(480, total), 1);
    for (let index = 0; index < total; index++) {
      assert.equal(drawStepAt(drawStepDelay(index, total) - 1, total), index);
      assert.equal(drawStepAt(drawStepDelay(index, total), total), index + 1);
    }
    assert.equal(drawStepAt(drawSequenceMs(total), total), total);
    assert.equal(drawStepAt(10 * 60 * 1000, total), total);
    /* long draws stay bounded */
    assert.ok(drawSequenceMs(total) <= 480 + 2900 + 1);
  }
  assert.equal(drawStepAt(5000, 0), 0);
  assert.equal(drawStepAt(NaN, 4), 0);
});

test("the intro handoff matches the TV's directed intro overlay", () => {
  assert.equal(DRAW_INTRO_MS, TV_INTRO_OVERLAY_MS);
  assert.ok(DRAW_INTRO_REDUCED_MS < DRAW_INTRO_MS);
});

test("screens that open at different moments turn every card at the same server instant", () => {
  const total = 5, startAt = 2_000_000;
  const time = serverClock(startAt - 1200);
  const screens = [];
  const open = () => {
    const seen = [];
    const playback = startDrawPlayback({ total, startAt, now:time.now, schedule:time.schedule, cancel:time.cancel,
      onStep:value => seen.push([time.now(), value]) });
    screens.push({ seen, playback });
    return playback;
  };
  open();                          // the TV, still in the intro
  time.advance(1300); open();      // a phone that heard 100ms into the reveal
  time.advance(900); const late = open(); // a phone that joins mid-sequence
  assert.ok(late.joined >= 1, "a late screen joins at the current step");
  time.advance(10_000);
  const stepAt = seen => Object.fromEntries(seen.filter(([, value]) => value > 0).map(([at, value]) => [value, at]));
  const reference = stepAt(screens[0].seen);
  for (let step = 1; step <= total; step++)
    assert.equal(reference[step], startAt + drawStepDelay(step - 1, total), `step ${step} turns on the room's clock`);
  for (const screen of screens.slice(1)) {
    const own = stepAt(screen.seen);
    for (const [step, at] of Object.entries(own)) {
      /* a step already due when the screen opened shows at once */
      if (Number(step) <= screen.playback.joined) continue;
      assert.equal(at, reference[step], `step ${step} lands with the TV`);
    }
    assert.equal(screen.seen.at(-1)[1], total);
  }
  assert.equal(time.pending, 0);
});

test("a screen that opens after the sequence shows the complete draw without a clock", () => {
  const time = serverClock(5_000_000), seen = [];
  const playback = startDrawPlayback({ total:4, startAt:5_000_000 - 60_000, now:time.now,
    schedule:() => assert.fail("a finished draw must not schedule steps"), onStep:value => seen.push(value) });
  assert.deepEqual(seen, [4]);
  assert.equal(playback.joined, 4);
});

test("skip still ends a synced reveal locally and never regresses", () => {
  const time = serverClock(100_000), seen = [];
  const playback = startDrawPlayback({ total:4, startAt:100_000, now:time.now, schedule:time.schedule, cancel:time.cancel,
    onStep:value => seen.push(value) });
  time.advance(500); playback.skip();
  time.advance(10_000);
  assert.deepEqual(seen, [0, 1, 4]);
  assert.equal(time.pending, 0);
});

test("the server stamps the announcement once, in the same write as the draw", () => {
  const state = structuredClone(EMPTY_STATE);
  const before = Date.now();
  assert.equal(applyAction(state, "announceAndDraw", { evId:"pong", players }, gm()).ok, true);
  const op = state.eventOps.pong;
  assert.ok(op.announcedAt >= before && op.announcedAt <= Date.now());
  assert.equal(op.announcedAt, op.drawRevealedAt, "one write, one instant");
  assert.equal(op.announcedAt, op.bettingOpenedAt);
  const line = revealTimeline(state, "pong", { reveal:buildEventReveal(state, BUILTIN_EVENTS.find(ev => ev.id === "pong")) });
  assert.deepEqual(line, { introAt:op.announcedAt, handoffAt:op.announcedAt + DRAW_INTRO_MS, revealAt:op.announcedAt + DRAW_INTRO_MS });
  assert.equal(revealTimeline(state, "pong", { reducedMotion:true }).handoffAt, op.announcedAt + DRAW_INTRO_REDUCED_MS);

  /* a retried tap acknowledges without moving the room's clock */
  const stamped = op.announcedAt;
  assert.equal(applyAction(state, "announceAndDraw", { evId:"pong", players }, gm()).extra.unchanged, true);
  assert.equal(state.eventOps.pong.announcedAt, stamped);

  /* it reaches every client */
  assert.equal(sharedProjection(state).eventOps.pong.announcedAt, stamped);

  /* the next contest opening inside a started event is not an announcement */
  const ev = BUILTIN_EVENTS.find(item => item.id === "pong");
  let contest = resolveCurrentContest(state, ev);
  assert.equal(applyAction(state, "lockAndStart", { evId:"pong", contestId:contest.id, contestRevision:contest.revision }, gm()).ok, true);
  contest = resolveCurrentContest(state, ev);
  const winner = applyAction(state, "recordContestWinner", { evId:"pong", contestId:contest.id,
    contestRevision:contest.revision, winner:contest.sides[0].key }, gm());
  assert.equal(winner.ok, true, winner.error);
  assert.equal(state.eventOps.pong.announcedAt, stamped);
});

test("a draw held for a later event reveals after that event's own intro; setOnDeck stamps too", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(state, "runDraw", { evId:"pong", players }, gm()).ok, true);
  assert.equal(revealTimeline(state, "pong"), null, "no announcement, no room clock yet");
  const drewAt = state.eventOps.pong.drawRevealedAt;
  assert.equal(applyAction(state, "setOnDeck", { id:"pong" }, gm()).ok, true);
  const op = state.eventOps.pong;
  assert.ok(op.announcedAt >= drewAt);
  const reveal = buildEventReveal(state, BUILTIN_EVENTS.find(ev => ev.id === "pong"));
  assert.equal(revealTimeline(state, "pong", { reveal }).revealAt, op.announcedAt + DRAW_INTRO_MS);

  /* a draw written after the intro was over starts at its own write */
  const later = structuredClone(state);
  later.draws.pong.ts = op.announcedAt + 60_000;
  assert.equal(revealTimeline(later, "pong", { reveal }).revealAt, op.announcedAt + 60_000);

  /* announceEvent (the director) goes through the same stamp */
  const direct = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(direct, "announceEvent", { evId:"putt" }, gm()).ok, true);
  assert.ok(direct.eventOps.putt.announcedAt > 0);
});

test("taking an announcement back or clearing the draw retires the stamp; re-announcing restamps", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(state, "announceAndDraw", { evId:"pong", players }, gm()).ok, true);
  assert.equal(applyAction(state, "takeBackAnnouncement", { evId:"pong" }, gm()).ok, true);
  assert.equal(state.eventOps.pong.announcedAt, undefined);
  assert.equal(applyAction(state, "setOnDeck", { id:"pong" }, gm()).ok, true);
  assert.ok(state.eventOps.pong.announcedAt > 0);
  const contest = resolveCurrentContest(state, BUILTIN_EVENTS.find(ev => ev.id === "pong"));
  assert.equal(applyAction(state, "setOnDeck", { id:null, contestId:contest.id, contestRevision:contest.revision }, gm()).ok, true);
  assert.equal(applyAction(state, "clearDraw", { evId:"pong" }, gm()).ok, true);
  assert.equal(state.eventOps.pong.announcedAt, undefined);
});

test("the intro hands over at the shared moment, and old states keep the device clock", () => {
  const state = structuredClone(EMPTY_STATE);
  state.eventOps = { pong:{ announcedAt:10_000 } };
  assert.equal(introRemainingMs(state, "pong", { now:10_400 }), DRAW_INTRO_MS - 400);
  assert.equal(introRemainingMs(state, "pong", { now:20_000 }), 0);
  assert.equal(introRemainingMs(state, "pong", { now:9_000 }), DRAW_INTRO_MS, "never longer than one intro");
  assert.equal(introRemainingMs(state, "pong", { now:10_100, reducedMotion:true }), DRAW_INTRO_REDUCED_MS - 100);
  const legacy = structuredClone(EMPTY_STATE);
  assert.equal(introRemainingMs(legacy, "pong", { now:99_999, localStart:5_000, localNow:6_000 }), DRAW_INTRO_MS - 1000);
});

/* ── components ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { DrawAnnouncement, EventAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
    export { TVDrawReveal } from "./src/features/tv/TVCeremony.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("draw-sync.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { DrawAnnouncement, EventAnnouncement, TVDrawReveal, PlayerIdentityProvider } = mod.exports;
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
function announced() {
  const state = structuredClone(EMPTY_STATE);
  const ev = BUILTIN_EVENTS.find(item => item.id === "8ball");
  assert.equal(applyAction(state, "announceAndDraw", { evId:ev.id, players:defaultQaParticipants(ev) }, gm()).ok, true);
  const reveal = buildEventReveal(state, ev);
  return { state, ev, reveal, groups:drawRevealGroups(state, reveal), revealAt:revealTimeline(state, ev.id, { reveal }).revealAt };
}
const cards = html => [...html.matchAll(/<section[^>]*class="fd-draw-card ([^"]*)"/g)].map(match => match[1]);

test("a phone opening mid-reveal shows the turned cards as they lie and keeps the rest covered", () => {
  const { state, reveal, groups, revealAt } = announced();
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const at = revealAt + drawStepDelay(1, total) + 10;   // two cards have turned
  const { html, buttons } = render(DrawAnnouncement, { state, reveal, synced:true, reducedMotion:false,
    now:() => at, onClose:() => {}, onPlayer:() => {} });
  const classes = cards(html);
  assert.equal(classes.filter(item => item.includes("is-revealed")).length, 2);
  assert.ok(classes.slice(0, 2).every(item => item.includes("is-settled")), "already turned: no second turn");
  assert.ok(classes.slice(2).every(item => item.includes("is-covered") && !item.includes("is-settled")));
  assert.match(html, /Skip animation/);
  /* covered identities stay out of reach */
  const covered = new Set(groups.slice(2).flatMap(group => group.lines.flatMap(line => line.avatars || [])));
  for (const button of buttons.filter(item => covered.has(item.key)))
    assert.equal(button.tabIndex, -1);
});

test("a phone opening after the sequence shows the completed draw; before the stamp it starts covered", () => {
  const { state, reveal, revealAt } = announced();
  const done = render(DrawAnnouncement, { state, reveal, synced:true, reducedMotion:false, now:() => revealAt + 60_000, onClose:() => {} });
  assert.match(done.html, /Draw complete/);
  assert.match(done.html, /fd-draw-announcement is-reduced/);
  const legacy = structuredClone(state);
  delete legacy.eventOps["8ball"].announcedAt;
  const fresh = render(DrawAnnouncement, { state:legacy, reveal, synced:true, reducedMotion:false, now:() => revealAt + 60_000, onClose:() => {} });
  assert.ok(cards(fresh.html).every(item => item.includes("is-covered")), "old states time themselves");
  /* a replay from the event sheet is never synced */
  const replay = render(DrawAnnouncement, { state, reveal, reducedMotion:false, now:() => revealAt + 60_000, onClose:() => {} });
  assert.ok(cards(replay.html).every(item => item.includes("is-covered")));
});

test("your own card carries your color and a You tag once it shows, and nobody else's does", () => {
  const { state, reveal, groups, revealAt } = announced();
  const mineIndex = groups.findIndex(group => group.lines.some(line => (line.avatars || []).length));
  const me = groups[mineIndex].lines.find(line => line.avatars?.length).avatars[0];
  const color = CHIP_COLORS[3];
  state.profiles[me] = { color:color.hex };
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const before = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:false,
    now:() => revealAt - 100, onClose:() => {} });
  assert.doesNotMatch(before.html, /fd-draw-you/, "a covered card never gives you away");
  assert.doesNotMatch(before.html, /is-mine/);
  const after = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:false,
    now:() => revealAt + drawSequenceMs(total) + 10, onClose:() => {} });
  const classes = cards(after.html);
  assert.ok(classes[mineIndex].includes("is-mine"));
  assert.equal(classes.filter(item => item.includes("is-mine")).length,
    groups.filter(group => group.lines.some(line => (line.avatars || []).includes(me))).length);
  assert.match(after.html, /<span class="fd-draw-you">You<\/span>/);
  assert.ok(after.html.includes(`--fd-you:${color.hex}`));
  /* joining complete shows the resting cue without the ring */
  assert.doesNotMatch(after.html, /is-ringing|fd-draw-ring/);
  /* reduced motion: the static cue only */
  const reduced = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:true, onClose:() => {} });
  assert.match(reduced.html, /fd-draw-you/);
  assert.doesNotMatch(reduced.html, /fd-draw-ring/);
});

test("the TV reads the same timeline, with the crew as the last step as on phones", () => {
  const { state, ev, reveal, groups, revealAt } = announced();
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const at = revealAt + drawStepDelay(0, total) + 5;
  const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVDrawReveal, { state, events:[ev], reveal, now:() => at })));
  const shown = [...html.matchAll(/class="tv-reveal-card( is-shown)?"/g)].map(match => !!match[1]);
  assert.deepEqual(shown, groups.map((_, index) => index < 1));
  assert.match(html, /animation:none/, "the card already turned shows as it lies");
  const complete = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVDrawReveal, { state, events:[ev], reveal, now:() => revealAt + 60_000 })));
  assert.equal([...complete.matchAll(/tv-reveal-card is-shown/g)].length, groups.length);
});

test("the intro's handoff bar starts part-filled for a phone that heard late", () => {
  const { state, ev } = announced();
  const at = state.eventOps[ev.id].announcedAt + 1200;
  const { html } = render(EventAnnouncement, { state, ev, handoff:true, holdMs:DRAW_INTRO_MS, now:() => at, onClose:() => {} });
  assert.match(html, /--intro-hold:3000ms;--intro-elapsed:-1200ms/);
});
