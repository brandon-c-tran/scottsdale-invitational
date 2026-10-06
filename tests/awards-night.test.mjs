import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CHIP_COLORS, CHIP_SKINS, EMPTY_STATE, ROSTER, RESET_PROGRESS_PRESERVED_KEYS, allEventsOf,
  computeStandings, resolveCurrentContest } from "../shared/core.js";
import { resolveDirector } from "../shared/show.js";
import {
  awardOnTv, awardResults, awardsRevealBlocker, ballotStatusLine, projectPrompts, revealedCount, tallyBallot, winnersOf,
} from "../shared/prompts.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { publicState } from "../worker/publicState.js";
import { hydrateStoredState } from "../worker/state.js";
import { buildSnapshot, validateSnapshot } from "../worker/snapshot.js";
import { Tournament } from "../worker/tournament.js";
import { QA_PROGRESS_KEYS } from "../shared/qa.js";
import { directorPill } from "../src/features/director/directorPill.js";
import { roomCues, roomSnapshot } from "../src/features/tv/roomSound.js";
import {
  AWARD_TIMING, awardCues, awardPhase, awardTimeline, ballotModel, chipOrder, homeResults, nextUnanswered, nomineePans,
} from "../src/features/awards/awardsModel.js";

/* D6 Awards night: the ballot lifecycle on the real reducers, the privacy of
   answers and totals in every frame, honors never touching the economy, the
   HTTP endpoints on the real Durable Object, the director's reveal beats,
   the TV choreography, and the real components' markup and handlers. */

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { AwardsBallot, AwardsResults, AwardsHome } from "./src/features/awards/AwardsHome.jsx";
    export { AwardsDesk, deskBallot, draftPayload, draftProblem } from "./src/features/awards/AwardsDesk.jsx";
    export { AwardsReveal } from "./src/features/awards/TVAwards.jsx";
    export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
  resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("awards-night.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;

let seq = 0;
const gm = (extra = {}) => ({ isGm:true, player:"Brandon", deviceId:"gm-device", actionId:`aw-${++seq}`, ...extra });
const guest = player => ({ isGm:false, player, deviceId:`device-${player}`, actionId:`aw-${++seq}` });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx, pattern) => {
  const before = JSON.stringify(state);
  const result = applyAction(structuredClone(state), type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  if (pattern) assert.match(result.error, pattern);
  assert.equal(JSON.stringify(state), before);
  return result;
};
const profiles = () => Object.fromEntries(ROSTER.map((player, index) => [player, { display:player, num:index + 1,
  color:CHIP_COLORS[index % CHIP_COLORS.length].hex, skin:CHIP_SKINS[index % CHIP_SKINS.length], photoV:index + 1 }]));
const fresh = () => ({ ...structuredClone(EMPTY_STATE), profiles:profiles() });

const BALLOT = { id:"bawards1", kind:"awards", questions:[
  { id:"qfraud", title:"Fraud of the weekend", nominees:null, allowSelf:false },
  { id:"qclutch", title:"Most clutch", nominees:["Evan", "Sahil", "Khoa"], allowSelf:false },
  { id:"qhost", title:"Best host", nominees:["Brandon", "Evan"], allowSelf:true },
] };
/* everyone votes: Evan wins the first, Sahil and Khoa tie the second */
const VOTES = {
  qfraud:player => player === "Evan" ? "Sahil" : "Evan",
  qclutch:player => player === "Sahil" ? "Khoa" : player === "Khoa" ? "Sahil" : player === "Jeremy" ? "Evan"
    : ROSTER.indexOf(player) % 2 ? "Khoa" : "Sahil",
};
function published() {
  const state = fresh();
  act(state, "promptPublish", { ballot:structuredClone(BALLOT) });
  return state;
}
function voted(state = published(), voters = ROSTER) {
  for (const player of voters) {
    act(state, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:VOTES.qfraud(player) }, guest(player));
    act(state, "promptRespond", { id:"bawards1", questionId:"qclutch", choice:VOTES.qclutch(player) }, guest(player));
  }
  return state;
}
const outsidePrompts = state => {
  const { prompts, updatedAt, ...rest } = state;
  return JSON.stringify(rest);
};

test("the ballot runs draft, open, closed, revealed, one award at a time", () => {
  const state = fresh();
  const saved = act(state, "promptSave", structuredClone(BALLOT));
  assert.equal(saved.extra.id, "bawards1");
  assert.equal(state.prompts.ballots[0].status, "draft");
  /* a retried save lands once */
  assert.equal(act(state, "promptSave", structuredClone(BALLOT)).extra.unchanged, true);
  assert.equal(state.prompts.ballots.length, 1);
  act(state, "promptPublish", { id:"bawards1" });
  assert.equal(state.prompts.ballots[0].status, "open");
  assert.equal(act(state, "promptPublish", { id:"bawards1" }).extra.unchanged, true);
  refuse(state, "promptSave", { ...structuredClone(BALLOT), questions:[{ title:"Changed" }] }, gm(), /can't be edited/);

  voted(state);
  const close = act(state, "promptClose", { id:"bawards1" });
  assert.equal(close.extra.voted, ROSTER.length);
  const ballot = state.prompts.ballots[0];
  assert.equal(ballot.status, "closed");
  assert.equal(ballot.tally.questions.qfraud.votes, ROSTER.length);
  assert.equal(ballot.tally.questions.qfraud.counts.Evan, ROSTER.length - 1);
  assert.deepEqual(winnersOf(ballot.tally.questions.qclutch.counts, ["Evan", "Sahil", "Khoa"]).length >= 1, true);
  refuse(state, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:"Khoa" }, guest("Ben"), /closed/);

  /* a mistaken close reopens with every answer intact */
  act(state, "promptReopen", { id:"bawards1" });
  assert.equal(state.prompts.ballots[0].status, "open");
  assert.equal(Object.keys(state.prompts.responses.bawards1).length, ROSTER.length);
  act(state, "promptClose", { id:"bawards1" });

  refuse(state, "promptReveal", { id:"bawards1", step:2 }, gm(), /in order/);
  act(state, "promptReveal", { id:"bawards1", step:1 });
  assert.equal(revealedCount(state.prompts.ballots[0]), 1);
  /* the first award discards every per-voter answer */
  assert.equal(state.prompts.responses.bawards1, undefined);
  assert.equal(act(state, "promptReveal", { id:"bawards1", step:1 }).extra.unchanged, true);
  refuse(state, "promptReopen", { id:"bawards1" }, gm(), /reveal has started/);
  refuse(state, "promptDiscard", { id:"bawards1" }, gm(), /End the reveal/);
  act(state, "promptReveal", { id:"bawards1", step:2 });
  act(state, "promptReveal", { id:"bawards1", step:3 });
  act(state, "promptRevealEnd", { id:"bawards1" });
  assert.equal(state.prompts.ballots[0].reveal.done, true);
  assert.equal(act(state, "promptRevealEnd", { id:"bawards1" }).extra.unchanged, true);
  refuse(state, "promptReveal", { id:"bawards1", step:3 }, gm(), /over/);
  assert.equal(ballotStatusLine(state.prompts.ballots[0]), "Revealed");
  act(state, "promptDiscard", { id:"bawards1" });
  assert.equal(state.prompts.ballots.length, 0);
});

test("one answer per player per award, revisable until close, with the award's rules", () => {
  const state = published();
  const vote = (player, questionId, choice) => applyAction(state, "promptRespond", { id:"bawards1", questionId, choice },
    guest(player));
  assert.equal(vote("Ben", "qfraud", "Evan").ok, true);
  assert.equal(vote("Ben", "qfraud", "Evan").extra.unchanged, true, "an identical retry changes nothing");
  assert.equal(vote("Ben", "qfraud", "Sahil").ok, true, "a vote can change");
  assert.deepEqual(state.prompts.responses.bawards1.Ben.answers, { qfraud:"Sahil" });
  assert.equal(vote("Ben", "qfraud", null).ok, true, "and be taken back");
  assert.equal(state.prompts.responses.bawards1.Ben, undefined);
  refuse(state, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:"Ben" }, guest("Ben"), /someone else/);
  refuse(state, "promptRespond", { id:"bawards1", questionId:"qclutch", choice:"Ben" }, guest("Ben"), /nominee/);
  refuse(state, "promptRespond", { id:"bawards1", questionId:"qnope", choice:"Evan" }, guest("Ben"), /award/);
  assert.equal(vote("Brandon", "qhost", "Brandon").ok, true, "a self-vote where the award allows it");
  refuse(state, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:"Evan" },
    { isGm:false, player:null, deviceId:"x", actionId:"y" }, /Check in/);
  /* authoring is the commissioner's */
  for (const type of ["promptSave", "promptPublish", "promptClose", "promptReveal", "promptRevealEnd", "promptDiscard"])
    refuse(state, type, { id:"bawards1", step:1, ballot:BALLOT }, guest("Ben"), /Commissioner/);
  /* one open ballot at a time */
  refuse(state, "promptPublish", { ballot:{ ...structuredClone(BALLOT), id:"bsecond1" } }, gm(), /Close the open ballot/);
  /* drafts are validated */
  refuse(state, "promptSave", { id:"bdraft1", questions:[{ title:"  " }] }, gm(), /Name award 1/);
  refuse(state, "promptSave", { id:"bdraft1", questions:[{ title:"Solo", nominees:["Evan"] }] }, gm(), /two nominees/);
  refuse(state, "promptSave", { id:"bdraft1", questions:[{ title:"Ghost", nominees:["Evan", "Nobody"] }] }, gm(), /nominees/);
  refuse(state, "promptSave", { id:"bdraft1", questions:Array.from({ length:7 }, (_, i) => ({ title:`A${i}` })) }, gm(), /Up to 6/);
});

test("frames carry the turnout and your own answers, never anyone's vote, and totals only once revealed", () => {
  const state = voted(published(), ROSTER.slice(0, 7));
  const frame = viewer => publicState(state, viewer);
  const guestView = frame({ player:"Ben" });
  const ballot = guestView.prompts.ballots[0];
  assert.equal(ballot.voted, 7);
  assert.equal(ballot.of, ROSTER.length);
  assert.deepEqual(ballot.results, {});
  assert.equal(ballot.mine, undefined, "Ben has not voted");
  const evanAnswers = frame({ player:"Evan" }).prompts.ballots[0].mine;
  assert.deepEqual(evanAnswers, { qfraud:VOTES.qfraud("Evan"), qclutch:VOTES.qclutch("Evan") });
  for (const viewer of [{}, { player:"Ben" }, { isGm:true }, { isGm:true, player:"Brandon" }]) {
    const json = JSON.stringify(frame(viewer));
    assert.doesNotMatch(json, /responses/, "answers never leave the Worker");
    assert.doesNotMatch(json, /"tally"/, "totals never leave before the reveal");
    assert.doesNotMatch(json, /"counts"/);
  }
  assert.equal(frame({}).prompts.ballots[0].mine, undefined, "the TV has no answers");
  /* drafts are the commissioner's */
  act(state, "promptSave", { id:"bdraft2", questions:[{ title:"Later" }] });
  assert.equal(frame({ player:"Ben" }).prompts.ballots.length, 1);
  assert.equal(frame({ isGm:true }).prompts.ballots.length, 2);

  act(state, "promptClose", { id:"bawards1" });
  for (const viewer of [{}, { player:"Ben" }, { isGm:true }])
    assert.doesNotMatch(JSON.stringify(frame(viewer)), /"counts"/, "closing shows nobody the totals");
  act(state, "promptReveal", { id:"bawards1", step:1 });
  const after = frame({ isGm:true }).prompts.ballots.find(item => item.id === "bawards1");
  assert.deepEqual(Object.keys(after.results), ["qfraud"], "only the revealed award has totals");
  assert.equal(after.results.qfraud.counts.Evan, 6);
  assert.deepEqual(after.results.qfraud.winners, ["Evan"]);
  assert.equal(after.mine, undefined);
  /* nothing in any frame names a voter */
  const json = JSON.stringify(frame({ player:"Ben" }));
  assert.doesNotMatch(json, /"answers"/);
  assert.doesNotMatch(json, /"mine"/);
});

test("honors never touch chips, wagers, results or standings, and run on a frozen board or a dealt table", () => {
  const state = fresh();
  act(state, "announceEvent", { evId:"putt" });
  const ev = allEventsOf(state).find(item => item.id === "putt");
  const contest = resolveCurrentContest(state, ev);
  act(state, "placeWager", { wager:{ kind:"outright", eventId:"putt", pick:"Evan", stake:100, contestId:contest.id,
    contestRevision:contest.revision } }, guest("Ben"));
  assert.equal(state.wagers.length, 1);
  const standings = JSON.stringify(computeStandings(state));
  const before = outsidePrompts(state);
  act(state, "promptPublish", { ballot:structuredClone(BALLOT) });
  voted(state);
  act(state, "promptClose", { id:"bawards1" });
  assert.equal(outsidePrompts(state), before, "the ballot wrote only state.prompts");
  assert.equal(JSON.stringify(computeStandings(state)), standings);
  /* the reveal waits for a free room */
  refuse(state, "promptReveal", { id:"bawards1", step:1 }, gm(), /Betting is open on/);
  assert.match(awardsRevealBlocker(state), /Betting is open/);
  assert.equal(awardOnTv(state), null);

  const frozen = voted(published());
  frozen.frozen = true;
  act(frozen, "promptClose", { id:"bawards1" });
  act(frozen, "promptReveal", { id:"bawards1", step:1 });
  const table = fresh();
  table.poker = { id:"poker", seats:[...ROSTER], outs:[], counts:{}, ts:1 };
  refuse(table, "adjust", { player:"Ben", delta:100, reason:"x" }, gm(), /poker table/);
  act(table, "promptPublish", { ballot:structuredClone(BALLOT) });
  act(table, "promptRespond", { id:"bawards1", questionId:"qfraud", choice:"Evan" }, guest("Ben"));
});

test("resets, old states and snapshots keep the ballots", () => {
  const state = voted(published());
  assert.ok(RESET_PROGRESS_PRESERVED_KEYS.includes("prompts"));
  assert.ok(!QA_PROGRESS_KEYS.includes("prompts"), "a QA checkpoint never carries guest answers");
  act(state, "resetTournament", { confirm:"RESET_GAME_PROGRESS" }, gm({ progressReset:true }));
  assert.equal(state.prompts.ballots[0].status, "open");
  assert.equal(Object.keys(state.prompts.responses.bawards1).length, ROSTER.length);

  const old = structuredClone(EMPTY_STATE);
  delete old.prompts;
  const hydrated = hydrateStoredState(old);
  assert.deepEqual(hydrated.prompts, { ballots:[], responses:{} });
  assert.deepEqual(publicState(old, { player:"Ben" }).prompts, { ballots:[] }, "an old state projects empty");

  const photos = ROSTER.map(player => [`photo:${player}`, "data:image/jpeg;base64,AAAA"]);
  const snapshot = buildSnapshot(new Map([["state", state], ["version", 3], ["claims", {}], ...photos]),
    { environment:"local", applicationVersion:"test" });
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.deepEqual(checked.entries.get("state").prompts.ballots[0].id, "bawards1");
  const broken = structuredClone(snapshot);
  broken.entries.find(entry => entry.key === "state").value.prompts = { ballots:"nope" };
  assert.match(validateSnapshot(broken).errors.join(";"), /ballots are malformed/);
});

test("the director reveals each award when the room is free, and Skip ends it", () => {
  const state = voted(published());
  state.live = true;
  act(state, "promptClose", { id:"bawards1" });
  const events = allEventsOf(state);
  let director = resolveDirector(state, events, { showControl:false });
  assert.equal(director.nextAction.type, "reveal-award");
  assert.equal(director.nextAction.label, "Reveal awards");
  assert.equal(director.nextAction.subject, "Fraud of the weekend (1 of 3)");
  let pill = directorPill(state, events, director);
  assert.deepEqual(pill.run, { write:"promptReveal", payload:{ id:"bawards1", step:1 } });
  assert.deepEqual(pill.extras.find(extra => extra.label === "Skip").run,
    { write:"promptRevealEnd", payload:{ id:"bawards1" } });
  act(state, pill.run.write, pill.run.payload);
  director = resolveDirector(state, events, { showControl:true });
  assert.equal(director.nextAction.label, "Next award");
  for (let step = 2; step <= 3; step++) {
    pill = directorPill(state, events, resolveDirector(state, events, { showControl:true }));
    act(state, pill.run.write, pill.run.payload, gm({ showControl:true }));
  }
  director = resolveDirector(state, events);
  assert.equal(director.nextAction.type, "end-awards");
  /* after the crown too */
  state.frozen = true;
  pill = directorPill(state, events, resolveDirector(state, events));
  assert.equal(pill.run.write, "promptRevealEnd");
  act(state, pill.run.write, pill.run.payload);
  assert.notEqual(resolveDirector(state, events).nextAction?.type, "end-awards");

  /* while an event is being bet on, the lifecycle keeps the pill */
  const busy = voted(published());
  act(busy, "promptClose", { id:"bawards1" });
  act(busy, "announceEvent", { evId:"putt" });
  assert.notEqual(resolveDirector(busy, allEventsOf(busy)).nextAction.type, "reveal-award");
});

test("a scene still mid-sequence keeps the TV; one at its last step retires for the award", () => {
  const state = voted(published());
  act(state, "promptClose", { id:"bawards1" });
  state.showControl = { active:{ id:"s1", kind:"opening", step:0, startedAt:1, updatedAt:1, commands:[] }, history:[] };
  refuse(state, "promptReveal", { id:"bawards1", step:1 }, gm({ showControl:true }), /Finish the scene/);
  state.showControl.active.step = 1;
  act(state, "promptReveal", { id:"bawards1", step:1 }, gm({ showControl:true }));
  assert.equal(state.showControl.active, null);
  assert.equal(state.showControl.history[0].outcome, "completed");
});

test("the TV lays ballot chips round by round, stamps the winner, and sounds on the reveal's clock", () => {
  assert.deepEqual(chipOrder(["A", "B", "C"], { A:2, B:3, C:1 }), ["A", "B", "C", "A", "B", "B"]);
  assert.deepEqual(chipOrder(["A", "B"], {}), []);
  const view = { ballotId:"b", index:0, nominees:["A", "B", "C"], counts:{ A:2, B:3, C:1 }, winners:["B"], at:10_000 };
  const timeline = awardTimeline(view);
  assert.equal(timeline.chips.length, 6);
  assert.equal(timeline.chips[0].at, AWARD_TIMING.chips);
  assert.ok(timeline.stamp > timeline.chips.at(-1).at);
  const early = awardPhase(view, 10_000 + AWARD_TIMING.chips + timeline.step + 1);
  assert.deepEqual(early.landed, { A:1, B:1, C:0 });
  assert.equal(early.stamped, false);
  const late = awardPhase(view, 10_000 + timeline.settled + 1);
  assert.equal(late.settled, true);
  assert.deepEqual(late.landed, { A:2, B:3, C:1 });
  assert.equal(awardPhase(view, 10_000, { reducedMotion:true }).stamped, true, "reduced motion shows the end state");
  assert.deepEqual(nomineePans(["A", "B", "C"]), [-0.6, 0, 0.6]);
  const cues = awardCues(view);
  assert.equal(cues.filter(cue => cue.id === "chip").length, 6);
  assert.deepEqual(cues.filter(cue => cue.id !== "chip").map(cue => cue.id), ["S10", "S14"]);
  assert.equal(cues.find(cue => cue.id === "S10").at, 10_000 + timeline.stamp);
  assert.deepEqual(awardCues(view, { reduced:true }).map(cue => cue.id), ["S14"]);

  /* the room's sound hook plays them on the step that turns the award */
  const state = voted(published());
  act(state, "promptClose", { id:"bawards1" });
  const events = allEventsOf(state);
  const prev = roomSnapshot(publicState(state, {}), events);
  act(state, "promptReveal", { id:"bawards1", step:1 });
  const next = roomSnapshot(publicState(state, {}), events);
  const played = roomCues(prev, next, { now:Date.now() });
  assert.ok(played.some(cue => cue.id === "S14"));
  assert.equal(roomCues(next, next, { now:Date.now() }).length, 0, "the same award never sounds twice");
});

test("the phone ballot model and results read only the projection", () => {
  const state = voted(published(), ["Ben"]);
  const frame = publicState(state, { player:"Ben" });
  const model = ballotModel(frame, "Ben");
  assert.equal(model.picked, 2);
  assert.equal(model.count, 3);
  assert.equal(model.questions[0].selfBlocked, true);
  assert.equal(model.questions[2].selfBlocked, false, "Ben is not a nominee there");
  assert.equal(nextUnanswered(model.questions, 0), 2);
  act(state, "promptClose", { id:"bawards1" });
  act(state, "promptReveal", { id:"bawards1", step:1 });
  const shown = publicState(state, { player:"Ben" });
  assert.equal(ballotModel(shown, "Ben"), null);
  /* the phone holds the winner until the TV stamps it */
  const heldAt = awardResults(shown)[0];
  assert.equal(homeResults(shown, heldAt.onTvSince + 100).length, 0);
  const rows = homeResults(shown, heldAt.onTvSince + 60_000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Fraud of the weekend");
  assert.deepEqual(awardResults(shown).map(row => row.questionId), ["qfraud"]);
  act(state, "promptRevealEnd", { id:"bawards1" });
  const done = publicState(state, { player:"Ben" });
  assert.equal(homeResults(done, Date.now()).length, 3);
  assert.equal(homeResults(done, Date.now() + 13 * 60 * 60 * 1000).length, 0, "Home lets them go after the evening");
  assert.equal(tallyBallot(state.prompts.ballots[0], {}).turnout, 0);
});

/* capture the rendered buttons and their real handlers */
function render(element, profilesOf) {
  const buttons = new Map();
  const createElement = React.createElement;
  const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
    : React.isValidElement(value) ? textOf([value.props.children])
      : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");
  React.createElement = (type, props, ...children) => {
    if (type === "button") {
      const name = (props?.["aria-label"] || textOf(children)).trim();
      buttons.set(name, { name, disabled:!!props?.disabled, pressed:props?.["aria-pressed"], click:props?.onClick });
    }
    return createElement(type, props, ...children);
  };
  try {
    const html = renderToStaticMarkup(createElement(ui.PlayerIdentityProvider, { profiles:profilesOf }, element));
    return { html, buttons, named:name => { const button = buttons.get(name); assert.ok(button, `Missing ${name}`); return button; } };
  } finally { React.createElement = createElement; }
}

test("the ballot card votes through photo chips, never for yourself, and takes a vote back", async () => {
  const state = voted(published(), ["Ben"]);
  const frame = publicState(state, { player:"Ben" });
  const collapsed = render(React.createElement(ui.AwardsBallot, { state:frame, me:"Ben" }), frame.profiles);
  assert.match(collapsed.html, /Awards ballot/);
  assert.match(collapsed.html, /class="fd-awards-owed">(Fraud of the weekend|Most clutch|Best host)</,
    "the entry leads with the award still owed a vote, by name");
  assert.doesNotMatch(collapsed.html, /Vote for/, "closed until opened: it never interrupts");
  const calls = [];
  const onVote = payload => { calls.push(payload); return applyAction(state, "promptRespond", payload, guest("Ben")); };
  const open = render(React.createElement(ui.AwardsBallot, { state:frame, me:"Ben", onVote, initiallyOpen:true }),
    frame.profiles);
  /* the first open award is the one still unanswered */
  assert.match(open.html, /Best host/);
  assert.equal(open.named("Vote for Brandon").disabled, false);
  assert.equal((await open.named("Vote for Evan").click()), undefined);
  assert.deepEqual(calls.at(-1), { id:"bawards1", questionId:"qhost", choice:"Evan" });
  assert.equal(state.prompts.responses.bawards1.Ben.answers.qhost, "Evan");
  const first = render(React.createElement(ui.AwardsBallot, { state:publicState(state, { player:"Ben" }), me:"Ben", onVote,
    initiallyOpen:true }), frame.profiles);
  assert.match(first.html, /Voted/);
  /* Ben on the first award: his own chip is not a target */
  const fraud = render(React.createElement(ui.AwardsBallot, { state:publicState(voted(published(), []), { player:"Ben" }),
    me:"Ben", onVote, initiallyOpen:true }), frame.profiles);
  assert.equal(fraud.named("Ben, not eligible").disabled, true);
  assert.ok([...fraud.buttons.values()].filter(button => button.name.startsWith("Vote for ")).length === ROSTER.length - 1);
  /* a picked chip taken back sends null */
  const picked = render(React.createElement(ui.AwardsBallot, { state:publicState(state, { player:"Ben" }), me:"Ben",
    onVote, initiallyOpen:true }), frame.profiles);
  const mine = [...picked.buttons.values()].find(button => button.name.startsWith("Your vote:"));
  assert.ok(mine);
  await mine.click();
  assert.equal(calls.at(-1).choice, null);
  /* a TV or an unclaimed phone gets nothing to vote with */
  assert.equal(render(React.createElement(ui.AwardsHome, { state:frame, me:null }), frame.profiles).html, "");
});

test("the TV reveal and the commissioner's desk render the real components", () => {
  const state = voted(published());
  act(state, "promptClose", { id:"bawards1" });
  const gmFrame = publicState(state, { isGm:true, player:"Brandon" });
  const desk = render(React.createElement(ui.AwardsDesk, { state:gmFrame, onClose() {}, write:() => ({ ok:true }) }),
    gmFrame.profiles);
  assert.match(desk.html, /Reveal on TV: Fraud of the weekend/);
  assert.match(desk.html, /13<\/strong><span>of 13 voted/);
  assert.doesNotMatch(desk.html, /Evan &amp;|· 12/, "no totals before the reveal");

  act(state, "promptReveal", { id:"bawards1", step:1 });
  const tvFrame = publicState(state, {});
  const view = awardOnTv(tvFrame);
  assert.equal(view.question.title, "Fraud of the weekend");
  const settled = render(React.createElement(ui.AwardsReveal, { state:tvFrame, view, now:view.at + 60_000 }), tvFrame.profiles);
  assert.match(settled.html, /Winner/);
  assert.match(settled.html, /Award 1 of 3/);
  assert.match(settled.html, /data-award-nominee="Evan" data-award-votes="12"/);
  const opening = render(React.createElement(ui.AwardsReveal, { state:tvFrame, view, now:view.at + 100 }), tvFrame.profiles);
  assert.doesNotMatch(opening.html, /Winner/);
  assert.doesNotMatch(opening.html, /data-award-votes="[1-9]/);
  const tv = render(React.createElement(ui.TVMode, { state:tvFrame, events:allEventsOf(tvFrame),
    standings:computeStandings(tvFrame), allTied:true, now:view.at + 60_000, connection:{ ready:true, connected:true } }),
  tvFrame.profiles);
  assert.match(tv.html, /tv-awards/);
  assert.doesNotMatch(tv.html, /tv-ticker/, "the awards hold the room without the ticker");

  const tie = voted(published());
  act(tie, "promptClose", { id:"bawards1" });
  act(tie, "promptReveal", { id:"bawards1", step:1 });
  act(tie, "promptReveal", { id:"bawards1", step:2 });
  const tieFrame = publicState(tie, {});
  const tieView = awardOnTv(tieFrame);
  assert.deepEqual(tieView.winners, ["Sahil", "Khoa"]);
  assert.match(render(React.createElement(ui.AwardsReveal, { state:tieFrame, view:tieView, now:tieView.at + 60_000 }),
      tieFrame.profiles).html, /Tie/);

  const deskAfter = render(React.createElement(ui.AwardsDesk, { state:publicState(tie, { isGm:true }), onClose() {},
    write:() => ({ ok:true }) }), tieFrame.profiles);
  assert.match(deskAfter.html, /Next: Best host/);
  assert.match(deskAfter.html, /Evan <b>12<[/]b>/, "a finished award shows its winner and count");
  assert.doesNotMatch(deskAfter.html, /Sahil &amp; Khoa/, "the award on the TV waits for its stamp, even here");
  const results = render(React.createElement(ui.AwardsResults, { state:tieFrame, rows:awardResults(tieFrame).reverse() }),
    tieFrame.profiles);
  assert.match(results.html, /<strong>Awards<\/strong><small>2 of 3<\/small>/, "the awards lead, the count follows");
  assert.match(results.html, /View Evan&#x27;s player card/);
});

test("the commissioner's editor validates before it sends", () => {
  const empty = render(React.createElement(ui.AwardsDesk, { state:fresh(), onClose() {}, write:() => ({ ok:true }) }),
    profiles());
  assert.equal(empty.named("Publish").disabled, true);
  assert.equal(empty.named("Add award").disabled, false);
  assert.equal(ui.draftProblem({ questions:[{ title:"X", nominees:["Evan"] }] }), "X needs two nominees");
  assert.equal(ui.draftProblem({ questions:[{ title:"X", nominees:null }] }), null);
  const payload = ui.draftPayload({ id:"bx1", questions:[{ id:"qa1", title:" Most clutch ", nominees:null, allowSelf:false }] });
  assert.deepEqual(payload.questions[0].title, "Most clutch");
});

/* ── HTTP, on the real Durable Object ── */
function memoryContext() {
  const entries = new Map(), sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
  };
  return { entries, sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil() {} } };
}
const socketIn = memory => {
  let attachment = null;
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); }, deserializeAttachment() { return attachment; },
    close() {} };
  memory.sockets.push(ws);
  return ws;
};

test("the HTTP endpoints author with the GM token and answer by device claim", async () => {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  tournament.gmTokens = { t1:{ token:"gm-secret", deviceId:"gm", createdAt:1 } };
  tournament.claims = { "phone-ben":"Ben", "phone-evan":"Evan" };
  const tv = socketIn(memory);
  const call = async (method, path, body, headers = {}) => {
    const response = await tournament.fetch(new Request(`https://field.day${path}`, { method,
      headers:{ "Content-Type":"application/json", ...headers }, ...(body ? { body:JSON.stringify(body) } : {}) }));
    return { status:response.status, body:await response.json() };
  };
  const admin = { Authorization:"Bearer gm-secret" };

  assert.equal((await call("GET", "/api/admin/prompts")).status, 403);
  assert.equal((await call("POST", "/api/admin/prompts", { ballot:BALLOT }, { Authorization:"Bearer wrong" })).status, 403);
  const saved = await call("POST", "/api/admin/prompts", { ballot:BALLOT }, admin);
  assert.deepEqual(saved.body, { ok:true, id:"bawards1" });
  assert.equal((await call("POST", "/api/admin/prompts/bawards1/publish", {}, admin)).body.ok, true);
  assert.ok(tv.frames.length > 0, "a publish broadcasts to every screen");
  assert.equal(tv.frames.at(-1).state.prompts.ballots[0].status, "open");

  assert.equal((await call("GET", "/api/prompts")).status, 403, "an unclaimed device");
  const pending = await call("GET", "/api/prompts", null, { "X-Field-Day-Device":"phone-ben" });
  assert.equal(pending.body.pending.length, 3);
  const answered = await call("POST", "/api/prompts/bawards1/responses", { questionId:"qfraud", choice:"Evan" },
    { "X-Field-Day-Device":"phone-ben" });
  assert.equal(answered.body.ok, true);
  assert.equal((await call("POST", "/api/prompts/bawards1/responses", { questionId:"qfraud", choice:"Evan" },
    { "X-Field-Day-Device":"phone-ben" })).body.unchanged, true);
  const self = await call("POST", "/api/prompts/bawards1/responses", { questionId:"qfraud", choice:"Evan" },
    { "X-Field-Day-Device":"phone-evan" });
  assert.equal(self.status, 400);
  const mine = await call("GET", "/api/prompts", null, { "X-Field-Day-Device":"phone-ben" });
  assert.equal(mine.body.ballots[0].mine.qfraud, "Evan");
  assert.equal(mine.body.pending.length, 2);

  const listed = await call("GET", "/api/admin/prompts", null, admin);
  assert.equal(listed.body.ballots[0].voted, 1);
  assert.doesNotMatch(JSON.stringify(listed.body), /"counts"|responses|answers/, "the commissioner sees turnout only");
  assert.equal((await call("POST", "/api/admin/prompts/bawards1/close", {}, admin)).body.ok, true);
  assert.deepEqual((await call("GET", "/api/admin/prompts/bawards1/results", null, admin)).body.ballot.results, {});
  assert.equal((await call("POST", "/api/admin/prompts/bawards1/reveal", { step:1 }, admin)).body.ok, true);
  const results = await call("GET", "/api/admin/prompts/bawards1/results", null, admin);
  assert.deepEqual(results.body.ballot.results.qfraud.counts, { Evan:1 });
  assert.equal((await call("POST", "/api/admin/prompts/bawards1/end", {}, admin)).body.ok, true);
  assert.equal((await call("POST", "/api/admin/prompts/bawards1/nope", {}, admin)).status, 404);
  assert.equal((await call("DELETE", "/api/admin/prompts/bawards1", null, admin)).body.ok, true);
  assert.deepEqual(memory.entries.get("state").prompts.ballots, []);
  assert.equal(memory.entries.get("state").v, EMPTY_STATE.v);
  assert.ok(projectPrompts(memory.entries.get("state").prompts, {}).ballots.length === 0);
});
