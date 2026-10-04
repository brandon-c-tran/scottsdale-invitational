import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, BUILTIN_EVENTS, computeStandings, resolveCurrentContest, resolveEventLifecycle, resolveWager } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { ContestPanel } from "./src/features/weekend/ContestPanel.jsx";
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("contest-panel-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { ContestPanel, Wagers, PlayerIdentityProvider } = componentModule.exports;
const me = ROSTER[12];
let actionNumber = 0;
const act = (state, type, payload) => applyAction(state, type, payload,
  { isGm:true, player:me, deviceId:"panel-test", actionId:`panel-${++actionNumber}` });
const saved = (state, type, payload) => { const result = act(state, type, payload); assert.equal(result.ok, true, result.error); return result; };
const ref = contest => ({ contestId:contest.id, contestRevision:contest.revision });
const evOf = id => BUILTIN_EVENTS.find(event => event.id === id);
const names = side => side.players.join(" & ");
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

function fixture(kind = "bracket", started = false, advance = 2) {
  const state = structuredClone(EMPTY_STATE); state.live = true;
  const ev = evOf(kind === "bracket" ? "8ball" : kind === "heats" ? "beerio" : "putt");
  if (kind === "bracket") saved(state, "announceAndDraw", { evId:ev.id, players:ROSTER.slice(0, 12), roles:[{ player:me, role:"photographer" }] });
  else {
    if (kind === "heats") saved(state, "runStages", { evId:ev.id, cfg:{ kind:"heats", nGroups:3, advance, players:[...ROSTER] } });
    saved(state, "announceEvent", { evId:ev.id });
  }
  if (started) saved(state, "lockAndStart", { evId:ev.id, ...ref(resolveCurrentContest(state, ev)) });
  return { state, ev };
}

/* Drive synchronous selections during the actual SSR render. React processes
   these render-phase state updates itself, giving the final handlers their real
   state closures. The browser rehearsal separately checks focus and layout. */
function controls(state, ev, overrides = {}, select = []) {
  const buttons = new Map(), viewed = [], bets = [], locks = [], winners = [], results = [];
  let selection = 0;
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button") {
      const name = (props?.["aria-label"] || textOf(children)).trim();
      const button = { name, role:props?.role, disabled:!!props?.disabled, checked:props?.["aria-checked"], click:props?.onClick };
      buttons.set(name, button);
      const wanted = select[selection];
      if (wanted && (typeof wanted === "function" ? wanted(button) : wanted === name)) { selection++; button.click(); }
    }
    return createElement(type, props, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(ContestPanel, { state, ev, me, gm:true,
        onPlayer:player => viewed.push(player), onBets:() => bets.push(true),
        onLock:reference => { locks.push(reference); return { ok:true }; },
        onWinner:reference => { winners.push(reference); return { ok:true }; }, onResult:() => results.push(true), ...overrides,
      })));
  } finally { React.createElement = createElement; }
  assert.equal(selection, select.length, "All requested selections were rendered");
  const named = name => { const button = buttons.get(name); assert.ok(button, `Missing control: ${name}`); return button; };
  return { html, buttons:[...buttons.values()], viewed, bets, locks, winners, results, named,
    click(name) { const button = named(name); assert.equal(button.disabled, false, `${name} disabled`); return button.click(); } };
}

test("commissioner lock carries the exact active contest reference and guest identities open cards", async () => {
  const { state, ev } = fixture();
  const contest = resolveCurrentContest(state, ev);
  const host = controls(state, ev);
  await host.click("Lock bets and start");
  assert.deepEqual(host.locks, [ref(contest)]);
  assert.match(host.html, /8-Ball Doubles bracket/);
  assert.doesNotMatch(host.html, /Contest sequence|fd-contest-sides/);
  const guest = controls(state, ev, { gm:false, me:contest.players[0] });
  for (const player of contest.players) guest.click(`View ${player}'s player card`);
  assert.deepEqual(guest.viewed, contest.players);
  assert.match(guest.html, /is-you/);
  guest.click("Back yourself"); // a competitor backs their own side
  assert.deepEqual(guest.bets, [true]);
  assert.ok(!guest.buttons.some(button => button.name === "Lock bets and start"));
});

test("one tap on the current bracket team records the exact winner and revision", async () => {
  const { state, ev } = fixture("bracket", true);
  const contest = resolveCurrentContest(state, ev), side = contest.sides[1];
  const view = controls(state, ev);
  assert.ok(!view.buttons.some(button => button.name === "Record winner" || button.role === "radio"));
  assert.equal(view.buttons.filter(button => button.name.startsWith("Winner: ") && !button.disabled).length, 2);
  await view.click(`Winner: ${names(side)}`);
  assert.deepEqual(view.winners, [{ ...ref(contest), winner:side.key, qualifiers:[side.key] }]);
});

test("bracket winner taps wait for acknowledgement; viewing an avatar never records a result", async () => {
  const { state, ev } = fixture("bracket", true), contest = resolveCurrentContest(state, ev);
  let acknowledge, attempts=0;
  const view=controls(state,ev,{onWinner:payload=>{attempts++;return new Promise(resolve=>{acknowledge=()=>resolve({ok:true,payload});});}});
  for(const player of contest.players) view.click(`View ${player}'s player card`);
  assert.equal(attempts,0);
  const first=view.click(`Winner: ${names(contest.sides[0])}`);
  await view.click(`Winner: ${names(contest.sides[1])}`);
  assert.equal(attempts,1);
  acknowledge(); await first;
  assert.ok(!view.buttons.some(button=>button.name==="Record winner"));
});

test("a one-qualifier heat records its winner directly on the competitor row", async () => {
  const {state,ev}=fixture("heats",false,1);
  saved(state,"lockAndStart",{evId:ev.id,...ref(resolveCurrentContest(state,ev))});
  const contest=resolveCurrentContest(state,ev), side=contest.sides[0];
  const view=controls(state,ev);
  assert.ok(!view.buttons.some(button=>button.name==="Record winner"||button.role==="radio"));
  await view.click(`Winner: ${names(side)}`);
  assert.deepEqual(view.winners,[{...ref(contest),winner:side.key,qualifiers:[side.key]}]);
});

test("two-through heats require a separate additional qualifier, then submit both keys", async () => {
  const { state, ev } = fixture("heats", true);
  const contest = resolveCurrentContest(state, ev), [winner, other] = contest.sides;
  const winnerOnly = controls(state, ev, {}, [`Winner: ${names(winner)}`]);
  /* no instruction line: the record button counts what is still owed */
  assert.equal(winnerOnly.named("Pick 1 more").disabled, true);
  assert.doesNotMatch(winnerOnly.html, /Choose 1 more to advance/);
  const complete = controls(state, ev, {}, [`Winner: ${names(winner)}`,
    button => button.role === "checkbox" && button.name === `Also advances: ${names(other)}`]);
  await complete.click("Record winner");
  assert.deepEqual(complete.winners, [{ ...ref(contest), winner:winner.key, qualifiers:[winner.key, other.key] }]);
  assert.equal(complete.buttons.filter(button => button.role === "checkbox" && button.checked).length, 1);
});

test("recording a match opens only the next matchup and requires a fresh winner choice", async () => {
  const { state, ev } = fixture("bracket", true);
  const before = resolveCurrentContest(state, ev), winner = before.sides[0];
  const view = controls(state, ev, { onWinner:payload => act(state, "recordContestWinner", { evId:ev.id, ...payload }) });
  assert.equal((await view.click(`Winner: ${names(winner)}`)).ok, true);
  const next = resolveCurrentContest(state, ev);
  assert.notEqual(next.id, before.id);
  assert.ok(next.revision > before.revision);
  assert.equal(next.phase, "betting-open");
  assert.ok(!controls(state, ev).buttons.some(button => button.name === "Record winner"));
  saved(state, "lockAndStart", { evId:ev.id, ...ref(next) });
  assert.equal(controls(state, ev).buttons.filter(button => button.name.startsWith("Winner: ") && !button.disabled).length, 2);
});

test("pending host writes suppress repeat taps until acknowledgement, and failures allow retry", async () => {
  const { state, ev } = fixture();
  let acknowledge, attempts = 0;
  const view = controls(state, ev, { onLock:() => { attempts++; return new Promise(resolve => { acknowledge = resolve; }); } });
  const first = view.click("Lock bets and start");
  await view.click("Lock bets and start");
  assert.equal(attempts, 1);
  acknowledge({ ok:false, error:"Connection failed" });
  assert.equal((await first).ok, false);
  const retry = view.click("Lock bets and start");
  assert.equal(attempts, 2);
  acknowledge({ ok:true });
  assert.equal((await retry).ok, true);
});

test("winner failures and thrown writes preserve an explicit retry path", async () => {
  for (const failure of [() => ({ ok:false, error:"Stale result" }), () => undefined,
    () => { throw new Error("Offline"); }]) {
    const { state, ev } = fixture("bracket", true);
    const contest = resolveCurrentContest(state, ev);
    let attempts = 0;
    const view = controls(state, ev, { onWinner:() => { attempts++; return attempts === 1 ? failure() : { ok:true }; } });
    await view.click(`Winner: ${names(contest.sides[0])}`);
    assert.equal((await view.click(`Winner: ${names(contest.sides[0])}`)).ok, true);
    assert.equal(attempts, 2);
  }
});

test("FFA sends the host to result entry and completed events cannot be edited from the panel", () => {
  const { state, ev } = fixture("ffa", true);
  const view = controls(state, ev);
  view.click("Enter result");
  assert.deepEqual(view.results, [true]);
  assert.ok(!view.buttons.some(button => button.role === "radio"));
  saved(state, "beginResultEntry", { evId:ev.id });
  saved(state, "saveResult", { evId:ev.id, slots:[[ROSTER[0]], [], []], noScene:true });
  assert.equal(resolveEventLifecycle(state, ev).phase, "complete");
  assert.equal(controls(state, ev).html, "");
  const fresh = fixture();
  assert.equal(controls({ ...fresh.state, frozen:true }, fresh.ev).html, "");
  assert.equal(controls({ ...fresh.state, shelved:{ [fresh.ev.id]:true } }, fresh.ev).html, "");
});

function bettingControls(state, ev, player) {
  const buttons = [];
  const createElement = React.createElement;
  const guestAction = (type, payload) => applyAction(state, type, payload,
    { isGm:false, player, deviceId:"panel-guest", actionId:`guest-${++actionNumber}` });
  React.createElement = (type, props, ...children) => {
    if (type === "button") buttons.push({ name:(props?.["aria-label"] || textOf(children)).trim(),
      disabled:!!props?.disabled, click:props?.onClick });
    return createElement(type, props, ...children);
  };
  try {
    renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(Wagers, { state, events:BUILTIN_EVENTS, wagerEv:ev, me:player, standings:computeStandings(state), gm:false,
        onPick:wager => guestAction("placeWager", { wager }),
        onRetract:(id, reference) => guestAction("retractWager", { id, ...reference }), onPlayer:() => {},
      })));
  } finally { React.createElement = createElement; }
  return { buttons, click(name) { const button = buttons.find(item => item.name === name);
    assert.ok(button, `Missing bet control: ${name}`); assert.equal(button.disabled, false, `${name} disabled`); return button.click(); } };
}

for (const kind of ["bracket", "heats"]) test(`actual guest board and host panel complete ${kind === "bracket" ? "all five six-team matches" : "three two-through heats and the final"}`, async () => {
  const { state, ev } = fixture(kind);
  const played = [], winners = [];
  let contest;
  while ((contest = resolveCurrentContest(state, ev))) {
    assert.equal(contest.phase, "betting-open");
    played.push(contest.kind);
    assert.ok(played.length <= 5, "Contest sequence must terminate");
    const spectator = ROSTER.find(player => !contest.players.includes(player));
    const backed = contest.sides[0], winner = contest.kind === "heat" ? contest.sides[1] : backed;
    const firstGuest = bettingControls(state, ev, spectator);
    assert.equal(firstGuest.buttons.filter(button => !button.disabled && button.name.startsWith("Place a chip on ")).length, contest.sides.length);
    const participant = bettingControls(state, ev, backed.players[0]);
    assert.equal(participant.buttons.filter(button => !button.disabled && button.name.startsWith("Place a chip on ")).length, 1);
    assert.equal((await firstGuest.click(`Place a chip on ${names(backed)}`)).ok, true);
    assert.equal((await bettingControls(state, ev, spectator).click(`Place a chip on ${names(backed)}`)).ok, true);
    const wager = state.wagers.find(item => item.contestId === contest.id && item.player === spectator);
    assert.equal(wager.stake, 200);
    assert.equal((await bettingControls(state, ev, spectator).click(`Retract your last chip on ${names(backed)}`)).ok, true);
    assert.equal(state.wagers.find(item => item.id === wager.id).stake, 100);
    const host = controls(state, ev, { onLock:reference => act(state, "lockAndStart", { evId:ev.id, ...reference }) });
    assert.equal((await host.click("Lock bets and start")).ok, true);
    assert.equal(bettingControls(state, ev, spectator).buttons.filter(button => !button.disabled && button.name.startsWith("Place a chip on ")).length, 0);
    /* a stage final of three or more is recorded as a finish order of the
       places the event pays (every event pays 1st, 2nd and 3rd) */
    const [other, third] = contest.sides.slice(1);
    const selection = contest.kind === "heat" ? [`Winner: ${names(winner)}`,
      button => button.role === "checkbox" && button.name === `Also advances: ${names(backed)}`]
      : contest.kind === "stage-final" ? [`1st: ${names(winner)}`, `2nd: ${names(other)}`, `3rd: ${names(third)}`] : [];
    const result = controls(state, ev, { onWinner:payload => act(state, "recordContestWinner", { evId:ev.id, ...payload }) }, selection);
    assert.equal((await result.click(contest.kind === "heat" ? "Record winner"
      : contest.kind === "stage-final" ? "Record order" : `Winner: ${names(winner)}`)).ok, true);
    winners.push(winner.players);
    const settled = resolveWager(state, state.wagers.find(item => item.id === wager.id), BUILTIN_EVENTS);
    assert.equal(settled.delta, contest.kind === "heat" ? -100 : 100, "A qualifying non-winner loses a winner bet; winners pay even");
  }
  assert.deepEqual(played, kind === "bracket" ? Array(5).fill("match") : ["heat", "heat", "heat", "stage-final"]);
  /* the final's decisive tap posts the official result in the same write */
  assert.equal(resolveEventLifecycle(state, ev).phase, "complete");
  assert.deepEqual(state.results[ev.id].slots[0], winners.at(-1));
  assert.equal(controls(state, ev).html, "");
  assert.ok(state.wagers.every(wager => resolveWager(state, wager, BUILTIN_EVENTS).status !== "pending"));
});

test("correction carries previous contest refs, waits for acknowledgement, and retries a failed save", async () => {
  const { state, ev } = fixture("bracket", true);
  const first = resolveCurrentContest(state, ev);
  saved(state, "recordContestWinner", { evId:ev.id, ...ref(first), winner:first.sides[0].key });
  const revision = state.eventOps[ev.id].contestRevision;
  const calls = [];
  let acknowledge;
  const view = controls(state, ev, { onUndo:payload => {
    calls.push(payload);
    return new Promise(resolve => { acknowledge = () => resolve(calls.length === 1 ? { ok:false, error:"Connection failed" }
      : act(state, "undoLastContest", { evId:ev.id, ...payload })); });
  } }, ["Fix Play-in 1"]);
  const firstAttempt = view.click("Reopen Play-in 1");
  await view.click("Reopen Play-in 1");
  assert.deepEqual(calls, [{ contestId:first.id, contestRevision:revision }]);
  acknowledge(); await firstAttempt;
  assert.notEqual(resolveCurrentContest(state, ev).id, first.id);
  const retry = view.click("Reopen Play-in 1");
  acknowledge(); await retry;
  assert.equal(calls.length, 2);
  const restored = resolveCurrentContest(state, ev);
  assert.equal(restored.id, first.id);
  assert.equal(restored.phase, "in-progress");
  assert.ok(restored.revision > revision);
  assert.equal(controls(state, ev).buttons.filter(button => button.name.startsWith("Winner: ") && !button.disabled).length, 2);
});

/* Deliberate change: next-contest chips no longer block a correction. The
   confirm names the chips that go back, and the correction voids them. */
test("correction names next-contest chips in its confirm and returns them in the same write", async () => {
  const { state, ev } = fixture("bracket", true);
  const first = resolveCurrentContest(state, ev);
  saved(state, "recordContestWinner", { evId:ev.id, ...ref(first), winner:first.sides[0].key });
  const next = resolveCurrentContest(state, ev), name = names(next.sides[0]);
  const onUndo = payload => act(state, "undoLastContest", { evId:ev.id, ...payload });
  assert.equal((await bettingControls(state, ev, me).click(`Place a chip on ${name}`)).ok, true);
  const confirm = controls(state, ev, { onUndo }, ["Fix Play-in 1"]);
  assert.match(confirm.html, new RegExp(`Returns ${me} 100`));
  assert.equal(state.eventOps[ev.id].lastContest.id, first.id, "Opening the confirm changes nothing");
  await confirm.click("Reopen Play-in 1");
  assert.equal(resolveCurrentContest(state, ev).id, first.id);
  assert.equal(state.wagers[0].status, "void");
});

test("a pending start also blocks the conflicting previous-result correction", async () => {
  const {state,ev}=fixture("bracket",true), first=resolveCurrentContest(state,ev);
  saved(state,"recordContestWinner",{evId:ev.id,...ref(first),winner:first.sides[0].key});
  let acknowledge, corrections=0;
  const view=controls(state,ev,{onLock:()=>new Promise(resolve=>{acknowledge=resolve;}),
    onUndo:()=>{corrections++;return {ok:true};}},["Fix Play-in 1"]);
  const start=view.click("Lock bets and start");
  await view.click("Reopen Play-in 1");
  assert.equal(corrections,0);
  acknowledge({ok:false,error:"Connection failed"}); await start;
  await view.click("Reopen Play-in 1");
  assert.equal(corrections,1);
});

test("completed-event posting waits for acknowledgement, blocks correction, and retries a failed request", async () => {
  const {state,ev}=fixture("bracket",true);
  let contest;
  while((contest=resolveCurrentContest(state,ev))){
    if(contest.phase==="betting-open")saved(state,"lockAndStart",{evId:ev.id,...ref(contest)});
    saved(state,"recordContestWinner",{evId:ev.id,...ref(contest),winner:contest.sides[0].key});
  }
  let acknowledge,posts=0,corrections=0;
  const view=controls(state,ev,{onResult:()=>{posts++;return new Promise(resolve=>{acknowledge=resolve;});},
    onUndo:()=>{corrections++;return {ok:true};}},["Fix Final"]);
  const first=view.click("Post event result");
  await view.click("Post event result");await view.click("Reopen Final");
  assert.equal(posts,1);assert.equal(corrections,0);
  acknowledge({ok:false,error:"Connection failed"});assert.equal((await first).ok,false);
  const retry=view.click("Post event result");
  await view.click("Reopen Final");
  assert.equal(posts,2);assert.equal(corrections,0);
  acknowledge({ok:true});assert.equal((await retry).ok,true);
});
