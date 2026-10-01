import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, draftTurn, snakeTeam } from "../shared/core.js";
import { withLegacyEvents } from "./support/legacy-events.mjs";
import { applyAction } from "./support/confirmed-start.mjs";
import { draftSeats, draftBoard, landedPick } from "../src/features/draft/draftModel.js";
import { levelRoll, levelAnchor, seatOrder, buildSchedule, CONTINUOUS_TICK_MS } from "../src/features/poker/pokerMotion.js";
import { freshMount, flipMoves, childOffsets } from "../src/lib/motionKit.js";
import { FRESH_WINDOW_MS } from "../src/lib/motion.js";
import { isCorrectionFrame } from "../src/lib/frameGate.js";

/* M9 (draft pick flight, TV draft screen) and M17 (finale motion). The
   rules are pure and tested directly; the components render for real. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { TVDraft } from "./src/features/tv/TVDraft.jsx";
    export { TVPoker } from "./src/features/tv/TVPoker.jsx";
    export { DraftSheet } from "./src/features/draft/DraftSheet.jsx";
    export { PokerSeatChips, LevelChip, RollNumber } from "./src/features/poker/PokerMotion.jsx";
    export { DenomStacks } from "./src/features/poker/PokerChips.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const bundle = new Module(fileURLToPath(new URL("draft-finale-motion.cjs", import.meta.url)));
bundle.filename = bundle.id;
bundle.paths = Module._nodeModulePaths(root);
bundle._compile(compiled.outputFiles[0].text, bundle.filename);
const { TVDraft, TVPoker, DraftSheet, PokerSeatChips, LevelChip, RollNumber, DenomStacks, PlayerIdentityProvider } = bundle.exports;

let seq = 0;
const gm = () => ({ isGm:true, player:ROSTER[12], deviceId:"motion-gm", actionId:`dfm-${++seq}` });
const act = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload, gm());
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const render = (state, element) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider,
  { profiles:state.profiles }, element));
/* an even two-team draft (six a side plus one on crew): the slate's 5v5 is
   everyone in at seven and six, so the even shape is the legacy Flip Cup */
const flip = allEventsOf(withLegacyEvents(structuredClone(EMPTY_STATE), ["flip"])).find(ev => ev.id === "flip");
const pool = ROSTER.slice(0, 12), captains = pool.slice(0, 2);
function drafting(picks = 0) {
  const state = withLegacyEvents(structuredClone(EMPTY_STATE), ["flip"]);
  act(state, "startDraft", { evId:flip.id, captains, players:pool, roles:[{ player:ROSTER[12], role:"photographer" }] });
  for (let i = 0; i < picks; i++) {
    const draft = state.drafts[flip.id], turn = draftTurn(draft);
    act(state, "pickDraftPlayer", { evId:flip.id, player:draft.pool[0], draftId:turn.draftId,
      pickIndex:turn.pickIndex, draftRevision:turn.draftRevision });
  }
  return state;
}

/* ── the draft board ── */

test("every team's seats follow the snake: numbered picks, filled in pick order", () => {
  const state = drafting(3), draft = state.drafts[flip.id];
  const seats = draftSeats(draft);
  const T = draft.teams.length, total = draftTurn(draft).totalPicks;
  assert.equal(seats.length, T);
  assert.equal(seats.reduce((n, team) => n + team.slots.length, 0), total, "one seat per pick");
  for (const team of seats) {
    const expected = Array.from({ length:total }, (_, k) => k).filter(k => snakeTeam(k, T) === team.index).map(k => k + 1);
    assert.deepEqual(team.slots.map(slot => slot.pick), expected);
  }
  /* the three picks sit in their captain's first open seats, in order */
  const seated = seats.flatMap(team => team.slots.filter(slot => slot.player).map(slot => [slot.pick, slot.player]));
  assert.deepEqual(seated.sort((a, b) => a[0] - b[0]).map(([, player]) => player), draft.picks.map(pick => pick.player));
});

test("the board lists the turn, the snake order after it, and the latest pick", () => {
  const state = drafting(1), draft = state.drafts[flip.id];
  const board = draftBoard(draft, { upcoming:4 });
  assert.equal(board.upcoming.length, 4);
  assert.deepEqual(board.upcoming.map(item => item.pick), [2, 3, 4, 5]);
  assert.equal(board.upcoming[0].captain, draftTurn(draft).captain);
  /* pick 2 then pick 3 belong to the same captain at the snake's turn */
  assert.equal(board.upcoming[1].turnsBack, true);
  assert.deepEqual(board.last, { player:draft.picks[0].player, team:draft.picks[0].team, pick:1,
    captain:draft.teams[draft.picks[0].team].captain });
  assert.equal(draftBoard(null), null);
});

test("only one fresh pick on the same draft lands; undo, catch-up jumps and stale frames land nothing", () => {
  const state = drafting(2), draft = state.drafts[flip.id];
  assert.deepEqual(landedPick(draft, { fresh:true, from:1, to:2 }), { player:draft.picks[1].player, team:draft.picks[1].team, pick:2 });
  assert.equal(landedPick(draft, { fresh:false, from:1, to:2 }), null, "not fresh");
  assert.equal(landedPick(draft, { fresh:true, from:3, to:2 }), null, "undo");
  assert.equal(landedPick(draft, { fresh:true, from:0, to:2 }), null, "a jump is a catch-up");
  assert.equal(landedPick(draft, { fresh:true, from:2, to:3 }), null, "not what the draft holds");
  /* undo is a rewind frame: never fresh, so it plays nothing */
  const before = structuredClone(state), turn = draftTurn(draft);
  act(state, "undoDraftPick", { evId:flip.id, draftId:turn.draftId, pickIndex:turn.pickIndex, draftRevision:turn.draftRevision });
  assert.equal(isCorrectionFrame(before, state, "undoDraftPick"), true);
});

test("the TV draft fills the canvas: open chip slots by pick, the chip wall, the captain on the clock", () => {
  const state = drafting(3), draft = state.drafts[flip.id], turn = draftTurn(draft);
  const html = render(state, React.createElement(TVDraft, { state, ev:flip, d:draft }));
  const open = draftSeats(draft).flatMap(team => team.slots).filter(slot => !slot.player);
  assert.equal((html.match(/class="tv-draft-slot/g) || []).length, open.length);
  for (const slot of open) assert.match(html, new RegExp(`tv-draft-seat-open[^"]*">Pick ${slot.pick}</span>`));
  assert.equal((html.match(/class="tv-draft-slot is-next"/g) || []).length, 1, "the next seat is marked");
  assert.equal((html.match(/data-flip="[A-Za-z]+"/g) || []).length, draft.pool.length, "every available player is on the wall");
  assert.match(html, new RegExp(`${flip.name} · Pick ${turn.pickIndex + 1} of ${turn.totalPicks}`));
  assert.match(html, /tv-draft-who/);
  assert.match(html, /Pick 3<\/span>/, "the latest pick is marked in its seat");
  assert.doesNotMatch(html, /is-fresh|is-slam|is-arriving|tv-draft-flyer/, "a first render never animates");
  const done = drafting(10);
  const complete = render(done, React.createElement(TVDraft, { state:done, ev:flip, d:done.drafts[flip.id] }));
  assert.match(complete, /Teams picked/);
  assert.doesNotMatch(complete, /tv-draft-wall|tv-draft-slot/);
});

test("TV draft text is never under 24px", () => {
  const css = readFileSync(new URL("../src/features/tv/tv-draft.css", import.meta.url), "utf8");
  const sizes = [...css.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length > 5);
  assert.ok(sizes.every(size => size >= 24), `sizes: ${sizes}`);
});

test("the phone draft marks seats and pool cards for the flight and animates nothing on open", () => {
  const state = drafting(2), draft = state.drafts[flip.id];
  const html = render(state, React.createElement(DraftSheet, { ev:flip, state, gm:true, me:ROSTER[12],
    standings:computeStandings(state), onClose() {}, onPlayer() {}, onPick:() => ({ ok:true }) }));
  for (const pick of draft.picks) assert.match(html, new RegExp(`data-seat="${pick.player}"`));
  for (const player of draft.pool) assert.match(html, new RegExp(`data-flip="${player}"`));
  assert.doesNotMatch(html, /fd-draft is-fresh|is-arriving|is-landed|is-lifting/);
  const css = readFileSync(new URL("../src/features/draft/draft.css", import.meta.url), "utf8");
  /* the turn, the latest line and the seats only move under .is-fresh */
  assert.doesNotMatch(css, /^\.fd-draft-turn-copy \{[^}]*animation/m);
  assert.doesNotMatch(css, /^\.fd-draft-latest \{[^}]*animation/m);
  assert.doesNotMatch(css, /\.is-seated \{[^}]*animation/);
  assert.match(css, /\.fd-draft-turn\.is-mine::after \{[^}]*fd-beat/, "your pick breathes on the shared heartbeat");
});

/* ── motion kit ── */

test("a mount is fresh only inside the window of a fresh frame of that action", () => {
  const now = 10_000;
  assert.equal(freshMount({ fresh:true, lastAction:"pokerSetup", at:now - 100 }, "pokerSetup", now), true);
  assert.equal(freshMount({ fresh:true, lastAction:"pokerSetup", at:now - FRESH_WINDOW_MS - 1 }, "pokerSetup", now), false);
  assert.equal(freshMount({ fresh:false, lastAction:"pokerSetup", at:now }, "pokerSetup", now), false);
  assert.equal(freshMount({ fresh:true, lastAction:"pokerStart", at:now }, ["pokerSetup"], now), false);
});

test("FLIP moves only what moved and lists what entered", () => {
  const before = new Map([["a", { left:0, top:0 }], ["b", { left:100, top:0 }], ["c", { left:200, top:0 }]]);
  const after = new Map([["b", { left:0, top:0 }], ["c", { left:100, top:0 }], ["d", { left:200, top:0 }]]);
  assert.deepEqual(flipMoves(before, after), { moves:[{ key:"b", dx:100, dy:0 }, { key:"c", dx:100, dy:0 }], entering:["d"] });
  assert.deepEqual(flipMoves(null, after).moves, []);
  assert.equal(childOffsets(null).size, 0);
});

/* ── finale ── */

test("blinds roll on a fresh write or while the clock runs on screen, never on a catch-up", () => {
  const base = { prevIdx:1, idx:2, prevAt:1000, at:2000, sameAnchor:true, fresh:false };
  assert.equal(levelRoll(base), 1, "the clock moved the level on screen");
  assert.equal(levelRoll({ ...base, at:1000 + CONTINUOUS_TICK_MS + 1 }), 0, "a phone back from the background");
  assert.equal(levelRoll({ ...base, sameAnchor:false }), 0, "a changed anchor is a write, and this one is not fresh");
  assert.equal(levelRoll({ ...base, sameAnchor:false, fresh:true, idx:0 }), -1, "a fresh nudge down rolls down");
  assert.equal(levelRoll({ ...base, idx:1 }), 0);
  assert.equal(levelRoll({ ...base, prevIdx:undefined }), 0, "first render");
  assert.notEqual(levelAnchor({ levelIdx:1, levelStartedAt:5 }), levelAnchor({ levelIdx:2, levelStartedAt:5 }));
});

test("busted seats follow the players still in, best finish first", () => {
  const pk = { seats:["A", "B", "C", "D"], outs:[{ player:"C" }, { player:"A" }] };
  assert.deepEqual(seatOrder(pk), { alive:["B", "D"], out:[{ player:"A", finish:3 }, { player:"C", finish:4 }] });
  assert.deepEqual(seatOrder(null), { alive:[], out:[] });
});

test("the dealer's build fits its time whatever the stack", () => {
  const small = buildSchedule([8, 4]);
  assert.deepEqual(small.map(item => item.start), [0, 150]);
  assert.equal(small[0].step, 55);
  const big = buildSchedule([8, 20, 20, 3], { maxMs:1500, land:260 });
  const end = Math.max(...big.map((item, i) => item.start + ([8, 20, 20, 3][i] - 1) * item.step)) + 260;
  assert.ok(end <= 1501, `ends at ${end}`);
  assert.ok(big[1].step < 55, "a big stack deals faster");
  assert.deepEqual(buildSchedule([]), []);
});

function dealt() {
  const state = structuredClone(EMPTY_STATE);
  state.live = true;
  act(state, "adjust", { player:"Evan", delta:1900, reason:"Test" });
  act(state, "pokerSetup", {});
  return state;
}

test("poker renders built on any ordinary mount: the stacks, the level chip, the seat chips", () => {
  const state = dealt(), standings = computeStandings(state);
  const setup = render(state, React.createElement(TVPoker, { state, standings, now:Date.now() }));
  assert.match(setup, /tv-buyin-grid/);
  assert.match(setup, /data-denom="25"/);
  const stacks = render(state, React.createElement(DenomStacks, { stack:2900, build:true }));
  assert.match(stacks, /fd-poker-stacks/);
  act(state, "pokerStart", {});
  const seats = state.poker.seats || ROSTER;
  act(state, "pokerBust", { player:seats[3] });
  act(state, "pokerBust", { player:seats[0] });
  const live = render(state, React.createElement(TVPoker, { state, standings, now:Date.now() }));
  assert.match(live, /aria-label="Level 1"/);
  assert.match(live, /25 \/ 50/);
  assert.doesNotMatch(live, /fd-roll-out|is-tipping|fd-level-face is-out/, "a first render never animates");
  /* the rail: still in first, then the busts, the latest bust first */
  const names = [...live.matchAll(/data-flip="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(names.slice(-2), [seats[0], seats[3]]);
  assert.equal((live.match(/fd-seat-chip is-flat/g) || []).length, 2);
  const row = render(state, React.createElement(PokerSeatChips, { state, pk:state.poker }));
  assert.match(row, /role="img" aria-label="Still in: /);
  assert.deepEqual([...row.matchAll(/data-flip="([^"]+)"/g)].map(match => match[1]).slice(-2), [seats[0], seats[3]]);
});

test("a roll draws the old value leaving and the new one arriving; at rest only the value", () => {
  const state = structuredClone(EMPTY_STATE);
  const rolling = render(state, React.createElement(RollNumber, { text:"50 / 100", roll:{ id:1, dir:1, text:"25 / 50", level:0 } }));
  assert.match(rolling, /data-dir="up"/);
  assert.match(rolling, /fd-roll-out[^>]*>25 \/ 50/);
  assert.match(rolling, /fd-roll-in[^>]*>50 \/ 100/);
  const resting = render(state, React.createElement(RollNumber, { text:"50 / 100", roll:null }));
  assert.doesNotMatch(resting, /fd-roll-out|fd-roll-in/);
  const chip = render(state, React.createElement(LevelChip, { level:1, roll:{ id:2, dir:1, level:0 } }));
  assert.match(chip, /fd-level-face is-out/);
  assert.match(chip, /fd-level-face is-in/);
});

test("the phone table card uses the finale motion components and keeps its stacks", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const card = app.slice(app.indexOf("export function PokerCard"), app.indexOf("function ChipCounter"));
  assert.match(card, /<DenomStacks stack=\{myRow\.pts\} size=\{26\} build \/>/);
  assert.match(card, /<PokerBlinds /);
  assert.match(card, /<PokerSeatChips /);
});
