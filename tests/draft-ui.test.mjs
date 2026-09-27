import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, BUILTIN_EVENTS, computeStandings, disp, draftTurn, snakeTeam } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { DraftSheet, DraftEntry } from "./src/features/draft/DraftSheet.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("draft-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { DraftSheet, DraftEntry, PlayerIdentityProvider } = componentModule.exports;
const pool = ROSTER.slice(0, 12), captains = pool.slice(0, 2), commissioner = ROSTER[12];
const roles = [{ player:commissioner, role:"photographer" }];
let actionNumber = 0;
const act = (state, type, payload, player = commissioner, isGm = true) => applyAction(state, type, payload,
  { isGm, player, deviceId:"draft-ui", actionId:`draft-ui-${++actionNumber}` });
const saved = (state, type, payload, player, isGm) => {
  const result = act(state, type, payload, player, isGm);
  assert.equal(result.ok, true, result.error); return result;
};
const reference = turn => ({ draftId:turn.draftId, pickIndex:turn.pickIndex, draftRevision:turn.draftRevision });
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

function fixture(started = true) {
  const state = structuredClone(EMPTY_STATE), ev = BUILTIN_EVENTS.find(event => event.id === "volley");
  state.profiles[ROSTER[0]] = { display:"Brandon T." };
  if (started) saved(state, "startDraft", { evId:ev.id, captains, players:pool, roles });
  return { state, ev };
}

/* Capture native controls from the actual rendered component. Setup choices
   are made during SSR so React itself updates their state closures. Async
   handlers retain their real shared ref guard; browser checks cover layout,
   rerendered pending/error text, and focus separately. */
function controls(state, ev, overrides = {}, select = [], Component = DraftSheet) {
  const buttons = new Map(), viewed = [], calls = [], closed = [], opened = [];
  let selection = 0;
  const me = overrides.me ?? commissioner, gm = overrides.gm ?? true;
  const perform = (type, payload) => { calls.push({ type, payload }); return act(state, type, { evId:ev.id, ...payload }, me, gm); };
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    // Synchronous disclosure actions update DraftSheet, so invoke them while
    // that parent is rendering rather than later inside ActionButton's SSR.
    if (typeof type === "function" && type.name === "ActionButton"
        && !props?.disabled && select[selection] === textOf(children).trim()) {
      selection++; props.onClick();
    }
    if (type === "button") {
      const name = (props?.["aria-label"] || textOf(children)).trim();
      const button = { name, disabled:!!props?.disabled, pressed:props?.["aria-pressed"], click:props?.onClick };
      buttons.set(name, button);
      if (select[selection] === name && !button.disabled) {
        selection++; button.click();
      }
    }
    return createElement(type, props, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(Component, { state, ev, me, gm, pool, roles, standings:computeStandings(state),
        onPlayer:player => viewed.push(player), onClose:() => closed.push(true), onOpen:() => opened.push(true),
        onStart:(chosen, players) => perform("startDraft", { captains:chosen, players, roles }),
        onPick:(player, ref) => perform("pickDraftPlayer", { player, ...ref }),
        onUndo:ref => perform("undoDraftPick", ref), onFinalize:ref => perform("finalizeDraft", ref),
        onCancel:ref => perform("cancelDraft", ref), ...overrides,
      })));
  } finally { React.createElement = createElement; }
  assert.equal(selection, select.length, "Every setup choice must be rendered");
  const named = name => { const button = buttons.get(name); assert.ok(button, `Missing control: ${name}`); return button; };
  return { html, buttons:[...buttons.values()], viewed, calls, closed, opened, named,
    click(name) { const button = named(name); assert.equal(button.disabled, false, `${name} disabled`); return button.click(); } };
}
const label = (state, player) => `Draft ${disp(state,player)}`;
const card = (state, player) => `View ${disp(state,player)}'s player card`;
const choose = (state, player) => `Choose ${disp(state,player)} as captain`;

test("setup requires the commissioner and preserves the selected captain order", async () => {
  const { state, ev } = fixture(false);
  const guest = controls(state, ev, { gm:false, me:captains[0] });
  assert.match(guest.html, /Draft closed/);
  assert.ok(!guest.buttons.some(button => button.name === "Start the draft"));
  assert.equal(controls(state, ev).named("Start the draft").disabled, true);
  const host = controls(state, ev, {}, [choose(state,captains[1]), choose(state,captains[0])]);
  assert.match(host.html, /Captain order is pick order/);
  assert.equal(host.named(choose(state,pool[2])).disabled, true);
  assert.equal((await host.click("Start the draft")).ok, true);
  assert.deepEqual(state.drafts[ev.id].teams.map(team => team.captain), [...captains].reverse());
  assert.deepEqual(state.drafts[ev.id].pool, pool.slice(2));
  assert.equal(state.live, false, "Draft preparation must not start the weekend");
  assert.deepEqual(host.closed, [], "Starting keeps the draft open");
});

test("setup methods choose valid ordered captains and manual removal allows replacement", async () => {
  /* Deliberate change: seeded captains come from the draw's live strength
     blend (labelled Balanced), not from raw private self-ratings. */
  for (const method of ["Balanced", "Random"]) {
    const { state, ev } = fixture(false);
    state.seeds = Object.fromEntries(pool.map((player,index) => [player, { [ev.sport]:1 + index * 0.25 }]));
    let chosen;
    const view = controls(state, ev, {
      onStart:captainOrder => { chosen = captainOrder; return { ok:true }; } }, [method]);
    await view.click("Start the draft");
    assert.equal(new Set(chosen).size, 2);
    assert.ok(chosen.every(player => pool.includes(player)));
    if (method !== "Random") assert.deepEqual(chosen, [...pool].reverse().slice(0,2));
  }
  const { state, ev } = fixture(false);
  const view = controls(state, ev, {}, [choose(state,captains[0]), choose(state,captains[1]),
    `Remove ${disp(state,captains[0])} as captain`, choose(state,pool[2])]);
  await view.click("Start the draft");
  assert.deepEqual(state.drafts[ev.id].teams.map(team => team.captain), [captains[1],pool[2]]);
});

test("only the current captain or commissioner can pick; spectator cards remain separate", async () => {
  const { state, ev } = fixture(), available = state.drafts[ev.id].pool;
  for (const player of [captains[1], commissioner, available[0]]) {
    const guest = controls(state, ev, { gm:false, me:player });
    assert.ok(guest.buttons.filter(button => button.name.startsWith("Draft ")).every(button => button.disabled));
    assert.ok(!guest.buttons.some(button => button.name === "Undo last pick" || button.name === "Cancel draft"));
    for (const person of [captains[0], ...available, commissioner]) guest.click(card(state,person));
    assert.deepEqual(guest.viewed, [captains[0], ...available, commissioner]);
    assert.deepEqual(guest.calls, []);
  }
  const before = reference(draftTurn(state.drafts[ev.id]));
  const captain = controls(state, ev, { gm:false, me:captains[0] });
  assert.match(captain.html, /Your pick/);
  captain.click(card(state,available[0]));
  assert.deepEqual(captain.calls, [], "Opening a card cannot make a pick");
  assert.equal((await captain.click(label(state,available[0]))).ok, true);
  assert.deepEqual(captain.calls, [{ type:"pickDraftPlayer", payload:{ player:available[0], ...before } }]);
  const host = controls(state, ev);
  assert.match(host.html, /Picking for Evan/);
  assert.equal((await host.click(label(state,state.drafts[ev.id].pool[0]))).ok, true);
});

test("the real controls finish a full snake draft with visible names, crew and acknowledged confirmation", async () => {
  const { state, ev } = fixture(), id = state.drafts[ev.id].id;
  const picks = [], expectedTeams = captains.map(captain => [captain]);
  while (!draftTurn(state.drafts[ev.id]).complete) {
    const turn = draftTurn(state.drafts[ev.id]), player = state.drafts[ev.id].pool[0];
    assert.ok(picks.length < 10);
    assert.equal(turn.teamIndex, snakeTeam(picks.length, 2));
    const view = controls(state, ev, { gm:false, me:turn.captain });
    assert.match(view.html, new RegExp(`Pick ${picks.length + 1} of 10`));
    const result = await view.click(label(state,player));
    assert.equal(result.ok, true, result.error);
    expectedTeams[turn.teamIndex].push(player); picks.push(turn.teamIndex);
    assert.deepEqual(view.calls[0].payload, { player, ...reference(turn) });
  }
  assert.deepEqual(picks, [0,1,1,0,0,1,1,0,0,1]);
  const spectator = controls(state, ev, { gm:false, me:commissioner });
  assert.match(spectator.html, /Teams picked/);
  assert.match(spectator.html, /All players picked/);
  assert.ok(!spectator.buttons.some(button => button.name.startsWith("Draft ") || button.name === "Confirm teams"));
  for (const player of ROSTER) spectator.click(card(state,player));
  assert.deepEqual(spectator.viewed, ROSTER);
  const finalRef = reference(draftTurn(state.drafts[ev.id])), host = controls(state, ev);
  assert.equal((await host.click("Confirm teams")).ok, true);
  assert.deepEqual(host.calls, [{ type:"finalizeDraft", payload:finalRef }]);
  assert.deepEqual(host.closed, [true]);
  assert.equal(state.drafts[ev.id], undefined);
  assert.equal(state.draws[ev.id].sourceDraftId, id);
  assert.deepEqual(state.draws[ev.id].teams.map(team => team.players), expectedTeams);
  assert.deepEqual(state.draws[ev.id].roles, roles);
  assert.equal(state.live, false);
});

test("a pending pick blocks a second player and conflicting undo or discard actions", async () => {
  const { state, ev } = fixture();
  const opening = draftTurn(state.drafts[ev.id]);
  saved(state, "pickDraftPlayer", { evId:ev.id, player:state.drafts[ev.id].pool[0], ...reference(opening) });
  const available = [...state.drafts[ev.id].pool], writes = [];
  let acknowledge;
  const view = controls(state, ev, {
    onPick:(player, ref) => { writes.push({ player, ...ref }); return new Promise(resolve => { acknowledge = resolve; }); },
    onUndo:() => { writes.push("undo"); return { ok:true }; },
    onCancel:() => { writes.push("cancel"); return { ok:true }; },
  }, ["Cancel draft"]);
  const first = view.click(label(state,available[0]));
  await view.click(label(state,available[0]));
  await view.click(label(state,available[1]));
  await view.click("Undo last pick");
  await view.click("Discard draft");
  assert.equal(writes.length, 1);
  assert.equal(state.drafts[ev.id].picks.length, 1, "The UI cannot optimistically alter the roster");
  assert.deepEqual(view.closed, []);
  acknowledge({ ok:false, error:"Connection failed" });
  assert.equal((await first).ok, false);
  const retry = view.click(label(state,available[0]));
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1], "Retry preserves the same turn reference");
  acknowledge({ ok:true }); await retry;
});

test("a rejected, missing or thrown pick acknowledgement releases the guard for retry", async () => {
  for (const fail of [() => ({ ok:false, error:"Not your pick" }), () => undefined, () => { throw new Error("Offline"); }]) {
    const { state, ev } = fixture(), player = state.drafts[ev.id].pool[0];
    let attempts = 0;
    const view = controls(state, ev, { onPick:() => ++attempts === 1 ? fail() : { ok:true } });
    assert.notEqual((await view.click(label(state,player)))?.ok, true);
    assert.equal((await view.click(label(state,player))).ok, true);
    assert.equal(attempts, 2);
    assert.deepEqual(view.closed, []);
  }
});

test("a stale rendered pick cannot consume the next captain's turn", async () => {
  const { state, ev } = fixture(), stale = controls(state, ev), firstPool = [...state.drafts[ev.id].pool];
  assert.equal((await stale.click(label(state,firstPool[0]))).ok, true);
  const rejected = await stale.click(label(state,firstPool[1]));
  assert.equal(rejected.ok, false);
  assert.equal(state.drafts[ev.id].picks.length, 1);
  const refreshed = controls(state, ev);
  assert.equal((await refreshed.click(label(state,firstPool[1]))).ok, true);
  assert.equal(state.drafts[ev.id].picks.length, 2);
});

test("undo restores the player and pick order with a fresh revision", async () => {
  const { state, ev } = fixture(), player = state.drafts[ev.id].pool[0];
  await controls(state, ev).click(label(state,player));
  const before = reference(draftTurn(state.drafts[ev.id])), host = controls(state, ev);
  assert.equal((await host.click("Undo last pick")).ok, true);
  assert.deepEqual(host.calls, [{ type:"undoDraftPick", payload:before }]);
  const restored = draftTurn(state.drafts[ev.id]);
  assert.equal(restored.captain, captains[0]);
  assert.equal(restored.pickIndex, 0);
  assert.ok(restored.draftRevision > before.draftRevision);
  assert.deepEqual(state.drafts[ev.id].pool, pool.slice(2));
  assert.equal(controls(state, ev, { gm:false, me:captains[0] }).named(label(state,player)).disabled, false);
});

for (const command of ["Confirm teams", "Discard draft"]) test(`${command} waits for acknowledgement and closes only on success`, async () => {
  const { state, ev } = fixture();
  if (command === "Confirm teams") while (state.drafts[ev.id].pool.length) {
    const turn = draftTurn(state.drafts[ev.id]);
    saved(state, "pickDraftPlayer", { evId:ev.id, player:state.drafts[ev.id].pool[0], ...reference(turn) });
  }
  const before = reference(draftTurn(state.drafts[ev.id])), calls = [];
  let acknowledge;
  const callback = ref => { calls.push(ref); return new Promise(resolve => { acknowledge = resolve; }); };
  const view = controls(state, ev, command === "Confirm teams" ? { onFinalize:callback } : { onCancel:callback },
    command === "Discard draft" ? ["Cancel draft"] : []);
  const first = view.click(command); await view.click(command);
  assert.deepEqual(calls, [before]); assert.deepEqual(view.closed, []);
  acknowledge({ ok:false, error:"Connection failed" }); await first;
  assert.deepEqual(view.closed, []);
  const retry = view.click(command);
  assert.deepEqual(calls, [before,before]);
  acknowledge({ ok:true }); await retry;
  assert.deepEqual(view.closed, [true]);
});

test("frozen, completed, shelved and poker-locked boards disable draft mutations", () => {
  for (const block of [state => { state.frozen = true; }, state => { state.results.volley = { slots:[] }; },
    state => { state.shelved.volley = true; }, state => { state.poker = { id:"poker" }; }]) {
    const { state, ev } = fixture(); block(state);
    const view = controls(state, ev);
    assert.match(view.html, /Draft paused while the board is locked/);
    assert.ok(view.buttons.filter(button => button.name.startsWith("Draft ")).every(button => button.disabled));
    assert.equal(view.named("Undo last pick").disabled, true);
    assert.equal(view.named("Cancel draft").disabled, true);
    view.click(card(state,captains[0]));
  }
});

test("the Home draft entry identifies the current turn and vanishes after confirmation", async () => {
  const { state, ev } = fixture();
  const current = controls(state, ev, { me:captains[0] }, [], DraftEntry);
  assert.match(current.html, /Your pick/);
  current.click(`Open ${ev.name} draft`);
  assert.deepEqual(current.opened, [true]);
  const other = controls(state, ev, { me:commissioner }, [], DraftEntry);
  assert.match(other.html, /Draft in progress/);
  assert.match(other.html, /Pick 1 · Brandon T\./);
  while (state.drafts[ev.id].pool.length) {
    const turn = draftTurn(state.drafts[ev.id]);
    saved(state, "pickDraftPlayer", { evId:ev.id, player:state.drafts[ev.id].pool[0], ...reference(turn) });
  }
  assert.match(controls(state, ev, {}, [], DraftEntry).html, /Teams picked/);
  await controls(state, ev).click("Confirm teams");
  assert.equal(controls(state, ev, {}, [], DraftEntry).html, "");
});
