/* Commissioner flow: the director pill, one-tap winners, a final that posts
   its own result, finish orders, the crown composite, the finale sheets, and
   the confirms in front of voids and corrections. Server rules go through
   applyAction; UI through the actual components rendered with their real
   handlers. The tap counts measure the pill and contest controls. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest, resolveEventLifecycle,
  resultAwards, pokerSetupPreview, stageFinalists, isAway,
} from "../shared/core.js";
import { resolveDirector, postedFinalUndo, contestName } from "../shared/show.js";
import { applyAction } from "../worker/actions.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { DirectorPill } from "./src/features/director/DirectorPill.jsx";
    export { directorPill } from "./src/features/director/directorPill.js";
    export { PokerSetupSheet, CrownSheet } from "./src/features/director/FinaleSheets.jsx";
    export { ContestPanel } from "./src/features/weekend/ContestPanel.jsx";
    export { CompetitionBracket } from "./src/features/weekend/CompetitionBracket.jsx";
    export { DuelDesk } from "./src/features/duels/DuelDesk.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("fix-commissioner-flow.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { DirectorPill, directorPill, PokerSetupSheet, CrownSheet, ContestPanel, CompetitionBracket, DuelDesk,
  PlayerIdentityProvider } = componentModule.exports;

let serial = 0;
const fresh = (order = []) => ({ ...structuredClone(EMPTY_STATE), eventOrder:order });
const eventOf = (s, id) => allEventsOf(s).find(ev => ev.id === id);
const current = (s, id) => resolveCurrentContest(s, eventOf(s, id));
const refs = contest => ({ contestId:contest.id, contestRevision:contest.revision });
const gm = (extra = {}) => ({ isGm:true, player:"Brandon", deviceId:"host", actionId:`flow-${++serial}`, ...extra });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (s, type, payload, pattern, ctx = gm()) => {
  const before = structuredClone(s);
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  if (pattern) assert.match(result.error, pattern);
  assert.deepEqual(s, before, `${type} must not mutate when refused`);
  return result;
};
const director = (s, showControl = false) => resolveDirector(s, allEventsOf(s), { showControl });
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

/* Render with real handlers; `select` taps named buttons during the render so
   in-component steps (confirms, orders) re-render like a real tap. */
function render(Component, props, select = []) {
  const buttons = [];
  let selection = 0;
  const createElement = React.createElement;
  React.createElement = (type, p, ...children) => {
    if (type === "button" && p?.onClick) {
      const button = { name:(p["aria-label"] || textOf(children)).trim(), className:p.className || "",
        disabled:!!p.disabled, click:p.onClick };
      buttons.push(button);
      const wanted = select[selection];
      if (wanted && (typeof wanted === "function" ? wanted(button) : wanted === button.name)) { selection++; button.click(); }
    }
    return createElement(type, p, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:props.state?.profiles || {} },
      createElement(Component, props)));
  } finally { React.createElement = createElement; }
  assert.equal(selection, select.length, "All requested selections were rendered");
  const find = test => buttons.filter(button => typeof test === "function" ? test(button) : button.name === test).at(-1);
  return { html, buttons,
    named(test) { const button = find(test); assert.ok(button, `Missing control: ${test}`); return button; },
    click(test) { const button = find(test); assert.ok(button, `Missing control: ${test}`);
      assert.equal(button.disabled, false, `${button.name} disabled`); return button.click(); } };
}

/* ── the director pill, driven as the commissioner would drive it ── */
/* onWrite stands in for App's act(): a refusal asking to confirm the weekend
   start is one more tap (the confirm), then the same write with the flag */
function pill(state, { me = "Brandon", showControl = false, writes = [], opens = [], confirms = [] } = {}) {
  const events = allEventsOf(state);
  const model = directorPill(state, events, director(state, showControl), { me });
  const onWrite = async (type, payload) => {
    writes.push({ type, payload });
    let result = applyAction(state, type, payload, gm({ showControl }));
    if (!result.ok && result.extra?.needsStartConfirm) {
      confirms.push(`${result.extra.event} starts the weekend.`);
      result = applyAction(state, type, { ...payload, startWeekend:true }, gm({ showControl }));
    }
    return result;
  };
  return { model, props:{ model, state, events, onWrite, onOpen:run => opens.push(run), onPlayer:() => {} } };
}
const mainPill = button => button.className.includes("fd-director-pill");

/* Every tap on the pill or a sheet it opens counts. Players counting their
   own stacks and the room playing the game are not commissioner taps. */
async function drive(state, done, { me = "Brandon", sheets = {}, between = () => {}, limit = 40 } = {}) {
  const taps = [];
  while (!done(state)) {
    assert.ok(taps.length < limit, `Tap limit reached: ${taps.join(", ")}`);
    if (between(state)) continue;
    const writes = [], opens = [], confirms = [];
    const { model, props } = pill(state, { me, writes, opens, confirms });
    assert.ok(model, "The pill always has a next step");
    if (model.sides) {
      await render(DirectorPill, props).click(`Winner: ${model.sides[0].name}`);
      taps.push(`${model.label} · ${model.lines[0]}`);
    } else {
      await render(DirectorPill, props).click(mainPill);
      taps.push(model.label);
      if (opens.length) {
        const sheet = sheets[opens[0].open];
        assert.ok(sheet, `No sheet for ${opens[0].open}`);
        taps.push(...[].concat(await sheet(state, opens[0])));
      }
    }
    taps.push(...confirms);
    for (const write of writes) assert.ok(write, "Each write was acknowledged");
  }
  return taps;
}

test("C19: a bracket final's recorded winner posts the result in the same write, with Undo reopening the final", () => {
  const state = fresh(["pickleball"]); state.live = true;
  act(state, "announceAndDraw", { evId:"pickleball" });
  const ev = eventOf(state, "pickleball");
  let contest;
  while ((contest = current(state, "pickleball"))) {
    if (contest.phase === "betting-open") act(state, "lockAndStart", { evId:ev.id, ...refs(current(state, ev.id)) });
    const live = current(state, ev.id);
    const final = live.match[0] === state.brackets.pickleball.rounds.length - 1;
    const result = act(state, "recordContestWinner", { evId:ev.id, ...refs(live), winner:live.sides[0].key,
      qualifiers:[live.sides[0].key], ...(final ? { postResult:true } : {}) }, gm({ showControl:true }));
    if (final) {
      assert.equal(result.extra.posted, true);
      assert.ok(result.extra.sceneId, "The winner scene starts through saveResult");
    } else assert.equal(result.extra.posted, undefined, "Earlier matches never post");
  }
  const posted = state.results.pickleball, br = state.brackets.pickleball, draw = state.draws.pickleball;
  assert.equal(posted.revision, 1);
  assert.equal(resolveEventLifecycle(state, ev).phase, "complete");
  const final = br.rounds[2][0], champion = final.winner;
  assert.deepEqual(posted.slots[0], draw.teams[champion].players);
  assert.equal(posted.slots[1].length, 2, "Runner-up is placed");
  assert.equal(posted.slots[2].length, 4, "Both semifinal losers share 3rd");
  const third = resultAwards(state, ev, posted).filter(award => award.place === 2);
  assert.ok(third.every(award => award.pts === 200), "Split 3rd: 400 over two teams");
  assert.equal(state.showControl.active.kind, "winner");

  /* the 5-second Undo takes the result back and reopens the final */
  const undo = postedFinalUndo(state, ev);
  assert.equal(undo.enabled, true);
  act(state, "undoLastContest", { evId:ev.id, contestId:undo.contestId, contestRevision:undo.contestRevision });
  assert.equal(state.results.pickleball, undefined);
  assert.equal(br.rounds[2][0].winner, null);
  const reopened = current(state, ev.id);
  assert.equal(reopened.phase, "in-progress");
  assert.equal(state.showControl.active, null, "The stale winner scene leaves the TV");
  assert.equal(state.eventOps.pickleball.corrections.at(-1).reason, "Final winner undone");
  /* recording again posts a new revision; an identical retry changes nothing */
  const ctx = gm();
  act(state, "recordContestWinner", { evId:ev.id, ...refs(reopened), winner:reopened.sides[1].key,
    qualifiers:[reopened.sides[1].key], postResult:true }, ctx);
  assert.equal(state.results.pickleball.revision, 2);
  const again = act(state, "recordContestWinner", { evId:ev.id, ...refs(reopened), winner:reopened.sides[1].key,
    qualifiers:[reopened.sides[1].key], postResult:true }, ctx);
  assert.equal(again.extra.unchanged, true);
  assert.equal(state.results.pickleball.revision, 2);
  /* once the next event is announced the final is no longer undoable here */
  act(state, "announceEvent", { evId:"putt" });
  assert.equal(postedFinalUndo(state, ev).enabled, false);
});

/* three heats, one through each: a three-way stage final */
test("C18: a stage final records a finish order and posts once the paid places are known", () => {
  const setup = () => {
    const state = fresh(["beerio"]); state.live = true;
    act(state, "announceAndDraw", { evId:"beerio", cfg:{ nGroups:3 } });
    let contest;
    while ((contest = current(state, "beerio")) && contest.kind === "heat") {
      if (contest.phase === "betting-open") act(state, "lockAndStart", { evId:"beerio", ...refs(contest) });
      const live = current(state, "beerio");
      act(state, "recordContestWinner", { evId:"beerio", ...refs(live), winner:live.sides[0].key });
    }
    act(state, "lockAndStart", { evId:"beerio", ...refs(current(state, "beerio")) });
    return state;
  };
  const state = setup(), final = current(state, "beerio"), keys = final.sides.map(side => side.key);
  assert.equal(final.kind, "stage-final");
  assert.equal(keys.length, 3);
  refuse(state, "recordContestWinner", { evId:"beerio", ...refs(final), winner:keys[0], order:[keys[1], keys[0]], postResult:true },
    /finish order/);
  act(state, "recordContestWinner", { evId:"beerio", ...refs(final), winner:keys[1], qualifiers:[keys[1]],
    order:[keys[1], keys[2], keys[0]], postResult:true });
  assert.deepEqual(state.results.beerio.slots, [[keys[1]], [keys[2]], [keys[0]]]);

  /* only the winner: the final is recorded and the result waits for entry */
  const partial = setup(), next = current(partial, "beerio");
  act(partial, "recordContestWinner", { evId:"beerio", ...refs(next), winner:next.sides[0].key, postResult:true });
  assert.equal(partial.results.beerio, undefined);
  assert.equal(resolveEventLifecycle(partial, eventOf(partial, "beerio")).phase, "result-entry");
});

test("C18 UI: the actual finalists are tapped 1st, 2nd, 3rd and Record order sends the order", async () => {
  const state = fresh(["beerio"]); state.live = true;
  act(state, "announceAndDraw", { evId:"beerio", cfg:{ nGroups:3 } });
  let contest;
  while ((contest = current(state, "beerio")) && contest.kind === "heat") {
    if (contest.phase === "betting-open") act(state, "lockAndStart", { evId:"beerio", ...refs(contest) });
    const live = current(state, "beerio");
    act(state, "recordContestWinner", { evId:"beerio", ...refs(live), winner:live.sides[0].key });
  }
  act(state, "lockAndStart", { evId:"beerio", ...refs(current(state, "beerio")) });
  const ev = eventOf(state, "beerio"), final = current(state, "beerio");
  const [a, b, c] = final.sides.map(side => side.key);
  const sent = [];
  const props = { state, ev, me:"Brandon", gm:true, onPlayer:() => {}, onLock:() => ({ ok:true }), onUndo:() => ({ ok:true }),
    onWinner:payload => { sent.push(payload); return applyAction(state, "recordContestWinner", { evId:ev.id, ...payload }, gm()); } };
  const start = render(ContestPanel, props);
  /* each pick shows the place it will take; the button names what is owed */
  assert.doesNotMatch(start.html, /Tap 1st/);
  assert.ok(start.named(`1st: ${a}`));
  assert.equal(start.named("Pick 1st").disabled, true);
  /* two places and one finalist left: the third is implied */
  const view = render(ContestPanel, props, [`1st: ${b}`, `2nd: ${c}`]);
  assert.ok(view.named(`Remove ${b} from 1st`));
  assert.equal((await view.click("Record order")).ok, true);
  assert.deepEqual(sent, [{ ...refs(final), winner:b, qualifiers:[b], order:[b, c, a], postResult:true }]);
  assert.deepEqual(state.results.beerio.slots, [[b], [c], [a]]);
});

test("C12: the bracket keeps its picture; winner targets are their own rows beside it", () => {
  const state = fresh(["pickleball"]); state.live = true;
  act(state, "announceAndDraw", { evId:"pickleball" });
  act(state, "lockAndStart", { evId:"pickleball", ...refs(current(state, "pickleball")) });
  const ev = eventOf(state, "pickleball"), contest = current(state, "pickleball");
  const view = render(ContestPanel, { state, ev, me:"Brandon", gm:true, onPlayer:() => {}, onWinner:() => ({ ok:true }), onUndo:() => ({ ok:true }) });
  assert.doesNotMatch(view.html, /fd-bracket-pick-hint/, "No Win chip squeezed into the bracket");
  assert.equal(view.buttons.filter(button => button.name.startsWith("Winner: ") && !button.disabled).length, 2);
  assert.match(view.html, /Play-in 1/);
  /* the bracket component still offers its own chip where a caller wants it */
  const own = render(CompetitionBracket, { state, ev, me:"Brandon", gm:true, onPick:() => {} });
  assert.match(own.html, /fd-bracket-pick-hint/);
  assert.equal(contestName(state, ev, contest), "Play-in 1");
});

test("C12/C21/C22: director beats carry a short verb and their subject", () => {
  const state = fresh(["pickleball", "volley"]);
  const first = director(state).nextAction;
  assert.equal(first.type, "announce-draw");
  assert.equal(first.label, "Announce and draw");
  assert.equal(first.subject, "Pickleball Doubles");
  const model = directorPill(state, allEventsOf(state), director(state));
  assert.deepEqual(model.lines, ["Pickleball Doubles", "Crew: Jeremy (Event official)"]);
  assert.deepEqual(model.extras.map(extra => extra.label), ["Skip"], "the crew check is the beat: no Change crew");
  assert.equal(model.run.open, "crewCheck", "no draw runs from the pill without the crew check");
  assert.equal(model.run.write, undefined);
  assert.equal(model.run.then.write, "announceAndDraw");
  assert.deepEqual(model.run.roles, [{ player:"Jeremy", role:"referee" }], "the suggestion is preselected");
  assert.equal(model.run.then.startsWeekend, true, "The App's act() confirms the weekend start");

  /* Show Control on, before the weekend: the Opening beat, skippable */
  const opening = director(state, true);
  assert.equal(opening.nextAction.type, "start-opening-scene");
  const openingPill = directorPill(state, allEventsOf(state), opening);
  assert.equal(openingPill.extras[0].label, "Skip opening");
  assert.equal(openingPill.extras[0].run.open, "crewCheck");
  assert.equal(openingPill.extras[0].run.then.write, "announceAndDraw");

  /* teams of three or more lead with the captains draft; the one-tap random
     draw is the alternative */
  const volley = fresh(["volley"]);
  const volleyPill = directorPill(volley, allEventsOf(volley), director(volley));
  assert.equal(volleyPill.label, "Captains draft");
  assert.equal(volleyPill.run.open, "crewCheck");
  assert.deepEqual(volleyPill.run.then, { open:"draft", evId:"volley" });
  assert.equal(volleyPill.run.players.length, 12);
  assert.equal(volleyPill.lines[0], "Sand Volleyball");
  assert.match(volleyPill.lines[1], /^Crew: /, "the thirteenth player's role, as with the draw");
  const random = volleyPill.extras.find(extra => extra.label === "Random draw");
  assert.equal(random.run.open, "crewCheck");
  assert.equal(random.run.then.write, "announceAndDraw");
  assert.equal(random.run.then.startsWeekend, true);
  const five = fresh(["bball5"]);
  assert.equal(directorPill(five, allEventsOf(five), director(five)).label, "Captains draft", "the everyone-plays 5v5 too");
  act(volley, "startDraft", { evId:"volley", captains:["Evan", "Khoa", "Adi", "Allan"], players:ROSTER.slice(0, 12),
    roles:[{ player:ROSTER[12], role:"referee" }] });
  const draft = directorPill(volley, allEventsOf(volley), director(volley));
  assert.equal(draft.label, "Continue the draft");
  assert.deepEqual(draft.run, { open:"draft", evId:"volley" });

  /* a prepared draw that names someone now away warns and offers Swap in */
  const prepared = fresh(["pong"]);
  act(prepared, "runDraw", { evId:"pong", players:ROSTER.slice(0, 12), roles:[{ player:ROSTER[12], role:"referee" }] });
  const leaving = prepared.draws.pong.teams[0].players[0];
  act(prepared, "setAway", { player:leaving, away:true });
  const warned = directorPill(prepared, allEventsOf(prepared), director(prepared));
  assert.ok(isAway(prepared, leaving));
  assert.ok(warned.lines.includes(`${leaving} is marked away`));
  assert.ok(warned.extras.some(extra => extra.label === "Swap in"));
});

test("C20: a match in progress puts both sides on the pill; faces open cards; Undo follows a winner", async () => {
  const state = fresh(["pickleball"]); state.live = true;
  act(state, "announceAndDraw", { evId:"pickleball" });
  act(state, "lockAndStart", { evId:"pickleball", ...refs(current(state, "pickleball")) });
  const contest = current(state, "pickleball"), writes = [];
  const viewed = [];
  const { model, props } = pill(state, { me:contest.players[0], writes });
  assert.equal(model.label, "Record winner");
  assert.deepEqual(model.lines, ["Play-in 1", "You’re playing"]);
  const view = render(DirectorPill, { ...props, onPlayer:player => viewed.push(player) });
  for (const player of contest.players) view.click(`View ${player}'s player card`);
  assert.deepEqual(viewed, contest.players);
  assert.deepEqual(writes, [], "Viewing a card never records a winner");
  const side = contest.sides[1];
  const result = await view.click(`Winner: ${side.players.join(" & ")}`);
  assert.equal(result.ok, true);
  assert.deepEqual(writes, [{ type:"recordContestWinner", payload:{ evId:"pickleball", ...refs(contest),
    winner:side.key, qualifiers:[side.key] } }]);
});

test("C21: the first weekend write goes through the one App confirm, never a second pill confirm", async () => {
  const state = fresh(["putt"]), writes = [], confirms = [];
  const { model, props } = pill(state, { writes, confirms });
  assert.equal(model.label, "Announce");
  assert.equal(model.run.startsWeekend, true);
  const view = render(DirectorPill, props);
  assert.equal((await view.click(mainPill)).ok, true);
  assert.deepEqual(writes.map(write => write.type), ["announceEvent"], "One write from the pill");
  assert.deepEqual(confirms, ["Long Putt starts the weekend."]);
  assert.equal(state.live, true);
  /* a declined confirm leaves the pill as it was, with no second confirm */
  const declined = render(DirectorPill, { ...props,
    onWrite:async () => ({ ok:false, error:"Starts the weekend", extra:{ needsStartConfirm:true } }) });
  await declined.click(mainPill);
  assert.doesNotMatch(render(DirectorPill, props).html, /starts the weekend|Chip colors/i);
});

test("C15: Fix names the previous contest, its teams, and the refunds before anything moves", async () => {
  const state = fresh(["pickleball"]); state.live = true;
  act(state, "announceAndDraw", { evId:"pickleball" });
  act(state, "lockAndStart", { evId:"pickleball", ...refs(current(state, "pickleball")) });
  const first = current(state, "pickleball");
  act(state, "recordContestWinner", { evId:"pickleball", ...refs(first), winner:first.sides[0].key });
  const next = current(state, "pickleball");
  const bettor = ROSTER.find(player => !next.players.includes(player));
  act(state, "placeWager", { wager:{ eventId:"pickleball", evName:"Pickleball", stake:200, ...refs(next), kind:"match",
    match:next.match, teamIdx:next.sides[0].key, drawId:next.drawId, pickTeam:true, pickPlayers:next.sides[0].players } },
    { player:bettor, deviceId:`d-${bettor}`, actionId:`w-${++serial}` });
  const ev = eventOf(state, "pickleball"), calls = [];
  const props = { state, ev, me:"Brandon", gm:true, onPlayer:() => {}, onLock:() => ({ ok:true }), onWinner:() => ({ ok:true }),
    onUndo:payload => { calls.push(payload); return applyAction(state, "undoLastContest", { evId:ev.id, ...payload }, gm()); } };
  const idle = render(ContestPanel, props);
  assert.ok(idle.named("Fix Play-in 1"));
  const confirm = render(ContestPanel, props, ["Fix Play-in 1"]);
  const [a, b] = first.sides.map(side => side.players.join(" & "));
  assert.ok(confirm.html.includes(`Reopens Play-in 1: ${a} vs ${b}. ${a} loses the win.`.replace(/&/g, "&amp;")));
  assert.match(confirm.html, new RegExp(`Returns ${bettor} 200`));
  assert.deepEqual(calls, []);
  await confirm.click("Reopen Play-in 1");
  assert.equal(calls.length, 1);
  assert.equal(current(state, "pickleball").id, first.id);
});

test("C27: one confirmed crown write names the champions and refuses a board that moved", () => {
  const state = fresh(); state.live = true;
  refuse(state, "crownChampion", { champions:["Evan"] }, /Finish the finale first/);
  act(state, "pokerSetup", {});
  act(state, "pokerStart", {});
  (state.poker.seats || ROSTER).forEach((player, index) => act(state, "pokerCount", { player, count:index < 2 ? 4000 : 400 }));
  act(state, "pokerResult", { noScene:true });
  const leaders = computeStandings(state).filter(row => row.rank === 1).map(row => row.player);
  assert.equal(leaders.length, 2, "Co-champions");
  assert.equal(director(state).nextAction.label, "Crown");
  refuse(state, "crownChampion", { champions:[leaders[0]] }, /Standings changed/);
  refuse(state, "crownChampion", { champions:leaders }, /Commissioner only/, { player:"Evan", deviceId:"x", actionId:"y" });
  const crowned = act(state, "crownChampion", { champions:[...leaders].reverse() });
  assert.deepEqual(crowned.extra.champions, leaders);
  assert.equal(state.frozen, true);
  assert.equal(act(state, "crownChampion", { champions:leaders }).extra.unchanged, true);
});

test("C11/C27 sheets: Starting stacks writes only on Deal and start; Crown names who it crowns", async () => {
  const state = fresh(); state.live = true;
  act(state, "adjust", { player:"Evan", delta:-600, reason:"test" });
  act(state, "setAway", { player:"Khoa", away:true });
  const preview = pokerSetupPreview(state);
  assert.deepEqual(preview.away.map(item => item.player), ["Khoa"]);
  assert.equal(preview.rows.find(row => row.player === "Evan").grant, 200);
  const before = structuredClone(state);
  let deals = 0;
  const sheet = render(PokerSetupSheet, { state, onClose:() => {}, onDeal:() => { deals++; return { ok:true }; } });
  assert.deepEqual(state, before, "Opening the preview writes nothing");
  /* the top-up is marked on the seat, not narrated */
  assert.match(sheet.html, /aria-label="Minimum stack, 200 added"/);
  assert.match(sheet.html, /is-away/);
  assert.match(sheet.html, /Away, not dealt in/);
  await sheet.click("Deal and start");
  assert.equal(deals, 1);
  /* the preview is exactly what the deal writes */
  act(state, "pokerSetup", {});
  assert.deepEqual(state.poker.startingStacks, Object.fromEntries(preview.rows.map(row => [row.player, row.stack])));

  const crowns = [];
  const crown = render(CrownSheet, { state, onClose:() => {}, onCrown:players => { crowns.push(players); return { ok:true }; } });
  const leaders = computeStandings(state).filter(row => row.rank === 1).map(row => row.player);
  await crown.click(button => button.name.startsWith("Crown "));
  assert.deepEqual(crowns, [leaders]);
});

test("C26: Void all open duels confirms the count and names every duel first", async () => {
  const state = fresh(); state.live = true;
  state.duels = [
    { id:"a", from:"Evan", to:"Khoa", stake:200, status:"open", consent:true, acceptedAt:1, runs:{}, ts:Date.now() },
    { id:"b", from:"Sahil", to:null, open:true, stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
  ];
  let all = 0;
  const props = { state, onVoid:() => ({ ok:true }), onVoidAll:() => { all++; return { ok:true }; } };
  const confirm = render(DuelDesk, props, ["Void all open duels"]);
  assert.match(confirm.html, /Evan vs Khoa, Sahil vs anyone/);
  assert.equal(all, 0);
  await confirm.click("Void 2 duels");
  assert.equal(all, 1);
});

/* the crew check's one confirm, as shown (plus the weekend's confirm) */
function crewConfirm(state, run) {
  const payload = { ...run.then.payload, players:run.players, roles:run.roles };
  let result = applyAction(state, run.then.write, payload, gm());
  const taps = ["Announce and draw"];
  if (!result.ok && result.extra?.needsStartConfirm) {
    taps.push(`${result.extra.event} starts the weekend.`);
    result = applyAction(state, run.then.write, { ...payload, startWeekend:true }, gm());
  }
  assert.equal(result.ok, true, result.error);
  return taps;
}
test("tap count: one Pickleball bracket from announce to posted result takes at most 13 taps", async () => {
  const state = fresh(["pickleball"]);
  const taps = await drive(state, s => !!s.results.pickleball, { sheets:{ crewCheck:crewConfirm } });
  /* announce, the crew check's confirm (+ the one weekend confirm), then
     lock and record for five matches */
  assert.ok(taps.length <= 13, `${taps.length} taps: ${taps.join(" | ")}`);
  assert.equal(taps.length, 13);
  assert.equal(taps.filter(tap => tap.startsWith("Record winner")).length, 5);
  assert.equal(state.results.pickleball.revision, 1);
  /* a weekend already live skips the confirm: 12 */
  const live = fresh(["pickleball"]); live.live = true;
  assert.equal((await drive(live, s => !!s.results.pickleball, { sheets:{ crewCheck:crewConfirm } })).length, 12);
});

test("tap count: the finale from table to crown takes at most 6 taps", async () => {
  const state = fresh(); state.live = true;
  allEventsOf(state).filter(ev => !ev.finale).forEach(ev => { state.shelved[ev.id] = true; });
  act(state, "adjust", { player:"Evan", delta:900, reason:"test" });
  const sheets = {
    pokerSetup:s => { act(s, "pokerSetup", {}); act(s, "pokerStart", {}); return "Deal and start"; },
    pokerResult:s => { act(s, "pokerResult", { noScene:true }); return "Post the counts"; },
    crown:s => { const leaders = computeStandings(s).filter(row => row.rank === 1).map(row => row.player);
      act(s, "crownChampion", { champions:leaders }); return `Crown ${leaders.join(" and ")}`; },
  };
  /* the players count their own stacks while the clock runs */
  const between = s => {
    if (!s.poker?.startedAt || s.results.poker || Object.keys(s.poker.counts || {}).length) return false;
    s.poker.seats?.length || ROSTER.forEach((player, index) => applyAction(s, "pokerCount",
      { player, count:index === 0 ? s.poker.total - 600 * (ROSTER.length - 1) : 600 }, gm()));
    return true;
  };
  const labels = [];
  const beat = () => labels.push(directorPill(state, allEventsOf(state), director(state))?.label);
  beat();
  const taps = await drive(state, s => s.frozen, { sheets, between });
  assert.ok(taps.length <= 6, `${taps.length} taps: ${taps.join(" | ")}`);
  assert.deepEqual(taps.filter((_, index) => index % 2 === 0), ["Deal and start", "Post counts", "Crown"]);
  assert.equal(labels[0], "Deal and start");
  assert.equal(state.frozen, true);
  assert.ok(stageFinalists, "core helpers stay importable");
});
