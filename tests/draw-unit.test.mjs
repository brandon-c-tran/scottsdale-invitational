/* Oct 3: a draw card turns over as ONE unit. Brandon, on the TV's Beer Pong
   draw: "why does it reveal one player on one tick then the other on second
   tick, even though names are already there". A pair's two chips, a team's
   chips, a heat's racers and their names all land on the card's own beat,
   on the phone, the TV and in the room's sound; and nothing of a card that
   has not turned (a face, a name, a team's own name) is on any screen. The
   TV's layout (drawLayout.js) stands any draw's cards inside the canvas. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, BUILTIN_EVENTS, ROSTER, defaultQaParticipants, disp } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import {
  buildEventReveal, drawBeats, drawRevealGroups, drawStepDelay, revealTimeline, shownPlayers,
} from "../src/features/weekend/drawReveal.js";
import { DRAW_TV, drawGrid, drawLayout, drawPans, gridBoxes, tvDrawGroups } from "../src/features/tv/drawLayout.js";
import { revealPans, roomCues, roomSnapshot } from "../src/features/tv/roomSound.js";

let seq = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"draw-unit", actionId:`du-${++seq}` });

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { DrawAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
    export { TVDrawReveal } from "./src/features/tv/TVCeremony.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("draw-unit.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { DrawAnnouncement, TVDrawReveal, PlayerIdentityProvider } = mod.exports;

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
/* every draw shape the weekend makes: a pairs bracket with byes (Beer Pong,
   8-Ball), four teams of three in a bracket (Volleyball), the 5v5's
   7 v 6, heats of three and four (Beerio Kart) */
const SHAPES = ["pong", "8ball", "volley", "bball5", "beerio"];
function drawn(evId) {
  const state = structuredClone(EMPTY_STATE);
  const ev = BUILTIN_EVENTS.find(item => item.id === evId);
  assert.equal(applyAction(state, "announceAndDraw", { evId, players:defaultQaParticipants(ev) }, gm()).ok, true, evId);
  const reveal = buildEventReveal(state, ev);
  assert.ok(reveal, `${evId} has a reveal`);
  const groups = drawRevealGroups(state, reveal);
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  return { state, ev, reveal, groups, total, revealAt:revealTimeline(state, ev.id, { reveal }).revealAt };
}
/* text as renderToStaticMarkup escapes it */
const esc = text => String(text).replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tvFaces = html => [...html.matchAll(/class="tv-draw-face" data-player="([^"]+)"/g)].map(match => match[1]);

test("a card's people share one beat: every face of a team lands with its name, on the card's turn", () => {
  for (const evId of SHAPES) {
    const { groups, total } = drawn(evId);
    const beats = drawBeats(groups, total);
    assert.equal(beats.length, groups.length);
    beats.forEach((beat, index) => {
      assert.equal(beat.at, drawStepDelay(index, total), `${evId}: card ${index + 1} turns on its own step`);
      assert.deepEqual(beat.players, groups[index].lines.flatMap(line => line.avatars || []),
        `${evId}: everyone on card ${index + 1} lands with it`);
    });
    /* nobody is on two cards, so nobody can land early on another's beat */
    const all = beats.flatMap(beat => beat.players);
    assert.equal(new Set(all).size, all.length, `${evId}: one card a player`);
    for (let shown = 0; shown <= groups.length; shown++)
      assert.deepEqual([...shownPlayers(groups, shown)].sort(), beats.slice(0, shown).flatMap(beat => beat.players).sort());
  }
});

test("the TV shows a turned card whole and nothing of the cards still to turn", () => {
  for (const evId of SHAPES) {
    const { state, ev, reveal, groups, total, revealAt } = drawn(evId);
    const tvGroups = tvDrawGroups(state, reveal);
    for (let shown = 0; shown <= groups.length; shown++) {
      /* the room's clock just past this many turns (before: none turned) */
      const at = shown === 0 ? revealAt - 50 : revealAt + drawStepDelay(shown - 1, total) + 10;
      const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
        React.createElement(TVDrawReveal, { state, events:[ev], reveal, now:() => at })));
      assert.deepEqual(tvFaces(html).sort(), [...shownPlayers(groups, shown)].sort(),
        `${evId} at ${shown}: exactly the turned cards' faces, every one of them`);
      assert.doesNotMatch(html, /partner/, "no held beat inside a card");
      /* a covered card holds an unlit seat per face, never a name */
      const seats = [...html.matchAll(/class="tv-draw-seat"/g)].length;
      assert.equal(seats, groups.slice(shown).reduce((n, group) => n + group.lines.reduce((m, line) => m + line.avatars.length, 0), 0));
      for (const group of tvGroups.slice(shown)) {
        for (const line of group.lines) assert.ok(!html.includes(`>${esc(line.text)}<`), `${evId}: ${line.text} stays covered`);
        if (group.team && group.title) assert.ok(!html.includes(`>${esc(group.title)}<`), `${evId}: a team's own name stays covered`);
      }
      for (const group of tvGroups.slice(0, shown))
        for (const line of group.lines) assert.ok(html.includes(esc(line.text)), `${evId}: ${line.text} shows with its faces`);
    }
  }
});

test("the phone turns the same unit: a turned card's people are all reachable, a covered card's none", () => {
  for (const evId of ["pong", "volley", "beerio"]) {
    const { state, reveal, groups, total, revealAt } = drawn(evId);
    const at = revealAt + drawStepDelay(0, total) + 10;   // one card turned
    const { html, buttons } = render(DrawAnnouncement, { state, reveal, synced:true, reducedMotion:false,
      now:() => at, onClose:() => {}, onPlayer:() => {} });
    assert.doesNotMatch(html, /is-partner|partner-beat/, `${evId}: no face a beat behind its card`);
    assert.ok(buttons.filter(button => button["aria-label"]?.startsWith("View ")).every(button => !button.style && !button.className), `${evId}: every face turns with its card, none on its own delay`);
    const open = new Set(buttons.filter(button => !button.disabled && button["aria-label"]?.startsWith("View ")).map(button => button.key));
    assert.deepEqual([...open].sort(), [...shownPlayers(groups, 1)].sort(), `${evId}: exactly the first card's people`);
    for (const button of buttons.filter(item => item["aria-label"]?.startsWith("View ") && !open.has(item.key)))
      assert.equal(button.tabIndex, -1, "covered identities stay out of reach");
  }
});

test("the room hears one turn a card, never a second beat for a partner", () => {
  const { state, ev, reveal, groups } = drawn("pong");
  const events = [ev];
  const next = roomSnapshot(state, events);
  assert.equal(next.reveals[ev.id].partners, undefined);
  const prev = roomSnapshot({ ...structuredClone(state), eventOps:{}, draws:{}, brackets:{}, onDeck:null }, events);
  const cues = roomCues(prev, next, { now:next.reveals[ev.id].revealAt - 5000 }).filter(cue => String(cue.key || "").startsWith(`draw:${reveal.id}`));
  assert.equal(cues.length, next.reveals[ev.id].total, "one S3 a step");
  assert.ok(cues.every(cue => cue.id === "S3"));
  assert.equal(revealPans(reveal).length, groups.length);
});

test("the TV stands any draw's cards inside the canvas, balanced by count", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const { cols, rows } = drawGrid(n);
    assert.ok(cols * rows >= n && cols * (rows - 1) < n, `${n}: no empty row`);
    const boxes = gridBoxes(n);
    for (const box of boxes) {
      assert.ok(box.x >= DRAW_TV.left - 0.5 && box.x + box.w <= DRAW_TV.left + DRAW_TV.width + 0.5, `${n}: inside the safe sides`);
    }
    /* each row is centered on the canvas */
    for (let row = 0; row < rows; row++) {
      const inRow = boxes.filter(box => box.row === row);
      const mid = (inRow[0].x + inRow.at(-1).x + inRow.at(-1).w) / 2;
      assert.ok(Math.abs(mid - 960) <= 1, `${n}: row ${row} centered (${mid})`);
    }
    const pans = drawPans({ boxes });
    assert.ok(pans.every(pan => pan >= -0.6 && pan <= 0.6));
  }
  for (const evId of SHAPES) {
    const { state, reveal } = drawn(evId);
    const groups = tvDrawGroups(state, reveal);
    const layout = drawLayout(reveal, groups);
    assert.equal(layout.boxes.length, groups.length);
    for (const box of layout.boxes) {
      assert.ok(box.y >= DRAW_TV.top && box.y + box.h <= DRAW_TV.top + DRAW_TV.height + 0.5, `${evId}: under the name, over the foot`);
      assert.ok(box.x >= DRAW_TV.left && box.x + box.w <= DRAW_TV.left + DRAW_TV.width + 0.5, `${evId}: inside the safe sides`);
    }
    assert.ok(layout.cards.every(card => card.face >= 48 && card.name >= 28), `${evId}: faces and names read from the couch`);
    /* one face size per kind of card, so a row reads level */
    const vs = layout.cards.filter(card => card.kind === "vs").map(card => card.face);
    assert.ok(new Set(vs).size <= 1, `${evId}: matchups share a face`);
  }
  /* a 7 v 6 stands as two cards across a VS */
  const split = drawn("bball5");
  const layout = drawLayout(split.reveal, tvDrawGroups(split.state, split.reveal));
  assert.equal(layout.kind, "versus");
  assert.equal(layout.boxes.length, 2);
  assert.deepEqual(split.reveal.versus.map(team => team.players.length).sort(), [6, 7]);
  assert.ok(layout.face * 7 + 6 * DRAW_TV.faceGap <= layout.cardW - 2 * DRAW_TV.padX, "seven faces on one row");
  assert.equal(disp(split.state, ROSTER[0]).length > 0, true);
});
