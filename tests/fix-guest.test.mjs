import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, CHIP_COLORS, EMPTY_STATE, ROSTER, computeStandings, makeBracket,
  pokerLevels, resolveCurrentContest } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

/* The returning guest's phone: real components compiled once, React kept
   external. No transport, storage, or tournament is started. */
const root = fileURLToPath(new URL("../", import.meta.url));
const load = async (name, contents, plugins = []) => {
  const compiled = await build({
    stdin:{ contents, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"],
    loader:{ ".css":"empty" }, write:false, logLevel:"silent", plugins,
  });
  const mod = new Module(fileURLToPath(new URL(name, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};
const ui = await load("fix-guest.cjs", `
  export { GuestHome, personalLine, hasGameRules } from "./src/features/home/GuestHome.jsx";
  export { deriveHomeModel, bracketPath } from "./src/features/home/homeModel.js";
  export { HomeDuels } from "./src/features/home/HomeDuels.jsx";
  export { hasDuelTurn } from "./src/features/duels/duelView.js";
  export { AppHeader } from "./src/ui/AppChrome.jsx";
  export { UpdateChip } from "./src/ui/UpdateReady.jsx";
  export { PlayerSheet } from "./src/features/profile/PlayerSheet.jsx";
  export * from "./src/features/home/guestUpdates.js";
  export { filterRevealCandidates, buildEventReveal } from "./src/features/weekend/drawReveal.js";
  export { Wagers, isUncertainResult } from "./src/features/wagers/Wagers.jsx";
  export { DraftSheet } from "./src/features/draft/DraftSheet.jsx";
  export { DrawAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
  export { HowToSheet } from "./src/features/weekend/HowToSheet.jsx";
  export { Avatar } from "./src/features/identity/PlayerIdentity.jsx";
  export { PlayerPass } from "./src/features/profile/PlayerPass.jsx";
  export { ChipPicker } from "./src/features/profile/ProfileEditor.jsx";
  export { AppNavigation } from "./src/ui/AppChrome.jsx";
  export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
`);
const app = await load("fix-guest-app.cjs", `export { ProfileSheet, PokerCard, actionFeedback } from "./src/App.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, [{ name:"isolated-client", setup(builder) {
  builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
    export const useTournament=()=>({});
    export const localGet=()=>null, localSet=()=>{}, hasGmToken=()=>false, setGmToken=()=>{};
    const refuse=()=>{ throw new Error("transport must not run"); };
    export const dispatch=refuse, uploadPhoto=refuse, downloadSnapshot=refuse, spotifyStatus=refuse,
      spotifyPlayer=refuse, spotifySearch=refuse, spotifyAuthorize=refuse, spotifyDisconnect=refuse,
      spotifyPlay=refuse, spotifyPause=refuse, spotifyDevice=refuse, spotifyAutoWinSongs=refuse, songPreview=refuse, songSnippet=refuse;` }));
} }]);

const pairs = BUILTIN_EVENTS.find(event => event.id === "8ball");
const putt = BUILTIN_EVENTS.find(event => event.id === "putt");
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true });
const noop = () => {};
const StubMark = () => null;
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

function render(Component, props, state = props.state, Provider = ui.PlayerIdentityProvider) {
  const buttons = [], images = [];
  const createElement = React.createElement;
  React.createElement = (type, elementProps, ...children) => {
    if (type === "button") buttons.push({ name:(elementProps?.["aria-label"] || textOf(children)).trim(),
      description:elementProps?.["aria-description"], disabled:!!elementProps?.disabled, click:elementProps?.onClick });
    if (type === "img") images.push(elementProps);
    return createElement(type, elementProps, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(Provider, { profiles:state?.profiles || {} },
      createElement(Component, props)));
  } finally { React.createElement = createElement; }
  const named = name => {
    const button = buttons.find(item => item.name === name);
    assert.ok(button, `Missing control: ${name}\n${buttons.map(item => item.name).join("\n")}`);
    return button;
  };
  return { html, buttons, images, named, click:name => {
    const button = named(name);
    assert.equal(button.disabled, false, `${name} is disabled`);
    return button.click();
  } };
}

function bracketState() {
  const state = fresh();
  state.draws[pairs.id] = { id:"draw-8ball", teams:Array.from({ length:4 }, (_, index) => ({
    players:ROSTER.slice(index * 2, index * 2 + 2) })), roles:[{ player:ROSTER[12], role:"scorekeeper" }] };
  state.brackets[pairs.id] = makeBracket(4);
  return state;
}
function openCurrent(state, event) {
  const contest = resolveCurrentContest(state, event);
  const revision = contest.revision + 1;
  state.eventOps[event.id] = { ...state.eventOps[event.id], contestRevision:revision,
    contest:{ id:contest.id, revision, phase:"betting-open" } };
}
const line = (state, me) => {
  const model = ui.deriveHomeModel({ state, me, events:[pairs] });
  return ui.personalLine({ current:model.current, state, model });
};

test("home keeps the room's matchup and adds the viewer's own bracket position, partner, and crew role", () => {
  const state = bracketState();
  state.onDeck = pairs.id;
  assert.equal(line(state, ROSTER[2]), `Next: Semifinal vs ${ROSTER[4]} & ${ROSTER[5]} · with ${ROSTER[3]}`);
  assert.equal(line(state, ROSTER[12]), "Your role · Scorekeeper");

  /* G17: a spectator reads the match after the one on screen */
  assert.deepEqual(ui.bracketPath(state, pairs, ROSTER[12]), { mine:false, text:"Semifinal 2 next" });
  assert.deepEqual(ui.bracketPath(state, pairs, ROSTER[0]), { mine:true, text:"Semifinal now" });

  state.brackets[pairs.id].rounds[0][0].winner = 0;
  openCurrent(state, pairs);
  /* G16: out is out, whatever the market is doing */
  assert.equal(line(state, ROSTER[6]), "You’re out");
  assert.equal(line(state, ROSTER[0]), `Next: Final vs winner of Semifinal 2 · with ${ROSTER[1]}`);
  assert.deepEqual(ui.bracketPath(state, pairs, ROSTER[0]), { mine:true, text:"Semifinal ✓ → Final vs winner of Semifinal 2" });
  assert.deepEqual(ui.bracketPath(state, pairs, ROSTER[6]), { mine:false, text:"Final next" });

  const opened = [];
  const view = render(ui.GuestHome, { state, me:ROSTER[0], events:[pairs], standings:computeStandings(state),
    GameMark:StubMark, onOpen:noop, onPlayer:noop, onBets:noop, onStandings:noop,
    onEvents:noop, onBracket:event => opened.push(event.id) });
  /* the path line says what is next once, and the bracket picture is gone */
  assert.doesNotMatch(view.html, /fd-home-personal">Next:/);
  assert.doesNotMatch(view.html, /fd-bracket-peek|fd-bracket-scroll/);
  assert.match(view.html, /Semifinal ✓ → Final vs winner of Semifinal 2/);
  view.click(`Semifinal ✓ → Final vs winner of Semifinal 2. Open the full ${pairs.name} bracket`);
  assert.deepEqual(opened, [pairs.id]);
  for (const player of [ROSTER[2], ROSTER[3], ROSTER[4], ROSTER[5]])
    assert.ok(view.buttons.some(button => button.name === `View ${player}'s player card`), "The room's matchup still renders");

  /* crew read their role and what it means */
  const crew = render(ui.GuestHome, { state, me:ROSTER[12], events:[pairs], standings:computeStandings(state),
    GameMark:StubMark, onOpen:noop, onPlayer:noop, onBets:noop, onStandings:noop, onEvents:noop, onBracket:noop });
  assert.match(crew.html, /Your role · Scorekeeper<small>Tracks the score and reports the finish\.<\/small>/);
  assert.match(crew.html, /Final next/);
});

test("an added event without a game has no dead rules target and opens its own description", () => {
  const custom = { id:"cornhole", name:"Cornhole", session:"fri", value:400, kind:"solo", custom:true, desc:"Three bags each." };
  assert.equal(ui.hasGameRules(custom), false);
  assert.equal(ui.hasGameRules(putt), true);
  assert.equal(ui.hasGameRules(BUILTIN_EVENTS.find(event => event.id === "bball5")), true, "variant-only games have rules");
  const opened = [], rules = [];
  const state = { ...fresh(), live:false };
  const view = render(ui.GuestHome, { state, me:ROSTER[0], events:[custom], standings:computeStandings(state),
    GameMark:StubMark, onOpen:event => opened.push(event.id), onRules:event => rules.push(event.id),
    onPlayer:noop, onBets:noop, onStandings:noop, onProfile:noop, onEvents:noop, onGuide:noop, onHouse:noop });
  assert.ok(!view.buttons.some(button => button.name === "How to play"));
  view.click("Open event");
  assert.deepEqual(opened, [custom.id]);
  assert.deepEqual(rules, []);
  const sheet = render(ui.HowToSheet, { gameId:undefined, ev:custom, onClose:noop }, state);
  assert.match(sheet.html, /Three bags each\./);
});

test("one update summary joins every source, signs numbers once, and names corrections and voids", () => {
  const me = ROSTER[0], events = BUILTIN_EVENTS;
  const before = fresh();
  before.wagers = [
    { id:"w-win", player:me, kind:"outright", eventId:putt.id, pick:me, pickPlayers:[me], stake:400 },
    { id:"w-void", player:me, kind:"match", eventId:pairs.id, drawId:"old-draw", match:[0, 0], teamIdx:0, pickTeam:true, pickPlayers:[], stake:300 },
  ];
  before.draws[pairs.id] = { id:"old-draw", teams:[{ players:[ROSTER[1]] }, { players:[ROSTER[2]] }] };
  before.brackets[pairs.id] = { size:4, rounds:[[{ a:{ t:0 }, b:{ t:1 }, winner:null }]] };
  before.adjustments = [{ id:"rival", player:ROSTER[1], delta:200, ts:1 }];
  const prev = ui.guestLedger(before, me, events);

  const after = structuredClone(before);
  after.results[putt.id] = { slots:[[me], [], []], ts:5, revision:1 };
  const next = ui.guestLedger(after, me, events);
  const summary = ui.summarizeUpdate(prev, next, { state:after, events });
  assert.equal(summary.msg, `1st in ${putt.name} +400 · bet +800 · you lead`);
  assert.equal(summary.tone, "gold");
  assert.deepEqual(ui.freshResults(ui.resultMarkers(before), after), [putt.id]);

  const voided = structuredClone(after);
  voided.draws[pairs.id].id = "new-draw";
  const voidSummary = ui.summarizeUpdate(next, ui.guestLedger(voided, me, events), { state:voided, events });
  assert.equal(voidSummary.msg, "Bet voided · 300 returned");

  const lost = structuredClone(before);
  lost.wagers[0].pick = ROSTER[3];
  lost.wagers[0].pickPlayers = [ROSTER[3]];
  const lostBefore = ui.guestLedger(lost, me, events);
  lost.results[putt.id] = { slots:[[ROSTER[4]], [], []], ts:5, revision:1 };
  assert.equal(ui.summarizeUpdate(lostBefore, ui.guestLedger(lost, me, events), { state:lost, events }).msg, "Bet -400");

  const corrected = structuredClone(after);
  corrected.results[putt.id] = { slots:[[ROSTER[5]], [], []], ts:9, revision:2, correctedAt:9, correctionReason:"Wrong card" };
  corrected.eventOps[putt.id] = { corrections:[{ type:"overwrite", at:9, reason:"Wrong card" }] };
  const correction = ui.summarizeUpdate(next, ui.guestLedger(corrected, me, events), { state:corrected, events });
  assert.equal(correction.msg, `Correction · ${putt.name} · -1,600`);
  assert.deepEqual(ui.freshResults(ui.resultMarkers(after), corrected), [], "a correction never celebrates");

  const unaffected = ui.guestLedger(corrected, ROSTER[9], events);
  const moreCorrection = structuredClone(corrected);
  moreCorrection.results[putt.id] = { ...corrected.results[putt.id], slots:[[ROSTER[6]], [], []], revision:3, correctedAt:10 };
  assert.equal(ui.summarizeUpdate(unaffected, ui.guestLedger(moreCorrection, ROSTER[9], events),
    { state:moreCorrection, events }), null, "a player whose place did not change hears nothing");
  assert.equal(ui.signed(-500), "-500");
  assert.equal(ui.signed(1600), "+1,600");
});

test("since you looked summarizes an absence from this device's own memory", () => {
  const me = ROSTER[0], events = BUILTIN_EVENTS;
  const state = fresh();
  state.draws[pairs.id] = { id:"d1", teams:[{ players:[ROSTER[3], ROSTER[4]] }, { players:[ROSTER[5], ROSTER[6]] }] };
  const saved = ui.sinceSnapshot(state, me, events, computeStandings(state), 4, Date.UTC(2026, 9, 31, 21, 14));
  assert.equal(ui.sinceLine(saved, state, me, events, computeStandings(state), saved.at + 60_000), null, "no line without an absence");
  state.results[pairs.id] = { slots:[[ROSTER[3], ROSTER[4]], [], []], ts:saved.at + 1000 };
  state.adjustments = [{ id:"x", player:ROSTER[7], delta:3000, ts:1 }];
  state.wagers = [{ id:"mine", player:me, kind:"outright", eventId:pairs.id, pickTeam:true, drawId:"d1",
    pickPlayers:[ROSTER[3], ROSTER[4]], stake:100 }];
  const text = ui.sinceLine(saved, state, me, events, computeStandings(state), saved.at + 10 * 60_000);
  assert.match(text, /^Since \d{1,2}:\d{2} (AM|PM) · /);
  assert.match(text, new RegExp(`· ${pairs.name}: ${ROSTER[3]} & ${ROSTER[4]} won · \\d+ more$`),
    "the result it opens leads; the rest is a count");
  const summary = ui.sinceSummary(saved, state, me, events, computeStandings(state), saved.at + 10 * 60_000);
  assert.ok(summary.detail.includes("your bet +200"), "the accessible name spells out the rest");
  assert.equal(ui.sinceLine({ ...saved, me:ROSTER[1] }, state, me, events, computeStandings(state), saved.at + 10 * 60_000), null);
});

test("old draw reveals retire silently; the on-deck or fresh draw remains; prepared draws wait", () => {
  const now = 10_000_000;
  const state = fresh();
  state.draws = {
    done:{ id:"d-done", ts:1 }, started:{ id:"d-started", ts:2 }, shelved:{ id:"d-shelved", ts:3 },
    deck:{ id:"d-deck", ts:4 }, prepared:{ id:"d-prepared", ts:5 }, recent:{ id:"d-recent", ts:now - 30_000 },
  };
  state.results.done = { slots:[["x"]] };
  state.eventOps.started = { startedAt:6 };
  state.shelved.shelved = true;
  state.onDeck = "deck";
  const out = ui.filterRevealCandidates(state, { now, seen:["d-seen"] });
  assert.deepEqual(out.retire.sort(), ["d-done", "d-shelved", "d-started"]);
  assert.deepEqual(Object.keys(out.draws).sort(), ["deck", "recent"]);
  assert.ok(!out.retire.includes("d-prepared"), "a prepared draw stays unseen for its announcement");
});

function wagers(state, event, overrides = {}) {
  return render(ui.Wagers, { state, events:BUILTIN_EVENTS, me:ROSTER[0], standings:computeStandings(state), gm:false,
    wagerEv:event, onEvents:noop, onEvent:noop, onPick:noop, onRetract:noop, onVoid:noop, onPlayer:noop, ...overrides });
}

test("the meter draws stack, cap notch, bets, hatched duels and loss overflow with numbers only", () => {
  const state = { ...fresh(), onDeck:putt.id };
  state.wagers = [{ id:"a", player:ROSTER[0], kind:"outright", eventId:putt.id, pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:200 }];
  state.duels = [{ id:"d", from:ROSTER[0], to:ROSTER[2], stake:100, status:"open", runs:{} }];
  const view = wagers(state, putt);
  assert.match(view.html, /class="fd-wagers-meter"/);
  assert.match(view.html, /class="is-bets" style="left:0;width:20%"/);
  assert.match(view.html, /class="is-duels" style="left:20%;width:10%"/);
  assert.match(view.html, /class="fd-wagers-meter-notch" style="left:50%"/);
  assert.match(view.html, /<strong[^>]*>200<\/strong>/, "the gap carries the to-bet number");
  assert.doesNotMatch(view.html, /at risk<\/span>|Includes .* in duels/);
  assert.match(view.html, /300 at risk, 500 maximum, 1,000 in your stack, 100 reserved for duels/);

  state.duels = [];
  state.wagers[0].stake = 500;
  const capped = wagers(state, putt);
  assert.match(capped.html, /fd-wagers-meter is-capped/);
  const pick = capped.named(ROSTER[1]);
  assert.equal(pick.disabled, true);
  assert.equal(capped.named(ROSTER[2]).description, "At your 500 limit");
  assert.match(capped.html, /Max 500/);

  state.adjustments = [{ id:"loss", player:ROSTER[0], delta:-400, ts:1 }];
  state.wagers[0].stake = 600;
  const over = wagers(state, putt);
  assert.match(over.html, /class="is-over"/);
});

test("free-for-all boards lead with the viewer's own name", () => {
  const view = wagers({ ...fresh(), onDeck:putt.id }, putt, { me:ROSTER[5] });
  const picks = view.buttons.filter(button => button.name.startsWith("Place a chip on "));
  assert.equal(picks[0].name, `Place a chip on ${ROSTER[5]}`);
  assert.equal(picks.length, ROSTER.length);
});

test("a timed-out chip holds as Checking instead of inviting a duplicate tap", async () => {
  assert.equal(ui.isUncertainResult({ ok:false, error:"No response, try again" }), true);
  assert.equal(ui.isUncertainResult({ ok:false, uncertain:true }), true);
  assert.equal(ui.isUncertainResult({ ok:false, error:"Betting is locked" }), false);
  assert.equal(ui.isUncertainResult({ ok:true }), false);
  for (const reply of [{ ok:false, error:"No response, try again" }, { ok:false, uncertain:true, error:"Checking" }]) {
    const sent = [];
    const view = wagers({ ...fresh(), onDeck:putt.id }, putt, { onPick:pick => { sent.push(pick); return Promise.resolve(reply); } });
    await view.click(`Place a chip on ${ROSTER[1]}`);
    view.click(`Place a chip on ${ROSTER[1]}`);
    assert.equal(sent.length, 1, "no second chip until the next broadcast answers the first");
  }
  const sent = [];
  const failed = wagers({ ...fresh(), onDeck:putt.id }, putt, { onPick:pick => { sent.push(pick); return Promise.resolve({ ok:false, error:"Betting is locked" }); } });
  await failed.click(`Place a chip on ${ROSTER[1]}`);
  await failed.click(`Place a chip on ${ROSTER[1]}`);
  assert.equal(sent.length, 2, "an ordinary rejection releases the pick for retry");
});

test("settled bets can open directly with the viewer's own group expanded", () => {
  const state = { ...fresh(), onDeck:null };
  state.results[putt.id] = { slots:[[ROSTER[1]], [], []], ts:1 };
  state.wagers = [{ id:"s", player:ROSTER[0], kind:"outright", eventId:putt.id, pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:100 }];
  const view = wagers(state, null, { openSettled:true });
  assert.match(view.html, /<details class="fd-wagers-history" open="">/);
  assert.equal(view.named(`Hide settled bets by ${ROSTER[0]}`).disabled, false);
});

test("nav badges mark only other tabs that are waiting on the guest", () => {
  const tabs = [];
  const view = render(ui.AppNavigation, { tab:"board", onTab:tab => tabs.push(tab), badges:{ bets:"betting open", board:"your turn" } }, fresh());
  view.click("Bets, betting open");
  assert.ok(view.buttons.some(button => button.name === "Home"), "the current tab carries no badge");
  assert.equal((view.html.match(/fd-nav-badge/g) || []).length, 1);
  assert.deepEqual(tabs, ["bets"]);
});

test("a confirmed draft lands every player on their own team and names crew jobs", () => {
  const event = BUILTIN_EVENTS.find(item => item.teamCfg?.size >= 2 && item.kind === "team") || pairs;
  const state = fresh();
  const size = event.teamCfg.size;
  state.draws[event.id] = { id:"d-final", sourceDraftId:"draft-1", method:"draft",
    roles:[{ player:ROSTER[12], role:"photographer" }],
    teams:Array.from({ length:event.teamCfg.teams }, (_, index) => ({ captain:ROSTER[index * size],
      players:ROSTER.slice(index * size, index * size + size) })) };
  const me = ROSTER[size + 1];
  const view = render(ui.DraftSheet, { ev:event, state, gm:false, me, onClose:noop, onPlayer:noop });
  assert.doesNotMatch(view.html, /Draft closed/);
  assert.match(view.html, /Teams confirmed/);
  const firstTeam = view.html.indexOf('aria-label="Your team"');
  assert.ok(firstTeam > 0 && firstTeam < view.html.indexOf(`${ROSTER[0]}&#x27;s team`), "the viewer's team leads");
  const crew = render(ui.DraftSheet, { ev:event, state, gm:false, me:ROSTER[12], onClose:noop, onPlayer:noop });
  assert.match(crew.html, /Your role · Photographer/);

  const reveal = { id:"r", evId:pairs.id, title:"The draw", subtitle:pairs.name, versus:null,
    groups:[{ title:"Team", lines:[{ avatars:[ROSTER[0]], text:ROSTER[0] }] }], crew:[{ player:ROSTER[12], role:"sit-out" }] };
  const announced = render(ui.DrawAnnouncement, { state, reveal, onClose:noop, reducedMotion:true });
  assert.match(announced.html, /Event host/);
  assert.doesNotMatch(announced.html, /sit out/);
});

test("avatars and player cards fall back to initials and fit long names without gradients", () => {
  const state = fresh();
  state.profiles[ROSTER[0]] = { display:"Supercalifragil", photoV:3, color:CHIP_COLORS[0].hex };
  const avatar = render(ui.Avatar, { state, p:ROSTER[0] });
  assert.doesNotMatch(avatar.html, /gradient/);
  assert.equal(typeof avatar.images[0]?.onError, "function");
  const pass = render(ui.PlayerPass, { state, p:ROSTER[0] });
  assert.match(pass.html, /--pass-name-chars:15/);
  assert.equal(typeof pass.images[0]?.onError, "function");
  const css = readFileSync(new URL("../src/features/profile/player-pass.css", import.meta.url), "utf8");
  assert.match(css, /\.fd-pass-name[^}]*overflow-wrap:normal/);
});

test("a late uncolored guest can make one chip claim while established chips stay locked", () => {
  const state = fresh();
  const taken = CHIP_COLORS[0].hex, free = CHIP_COLORS[1].hex;
  state.profiles[ROSTER[1]] = { color:taken, skin:"wave" };
  const ctx = player => ({ player, deviceId:"test", actionId:`chip-${player}` });
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[0], color:taken }, ctx(ROSTER[0])).ok, false);
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[0], skin:"flame" }, ctx(ROSTER[0])).ok, false, "a color comes with the first claim");
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[0], color:free }, ctx(ROSTER[0])).ok, true);
  assert.equal(state.profiles[ROSTER[0]].skin, "ticks");
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[0], color:CHIP_COLORS[2].hex }, ctx(ROSTER[0])).ok, false);
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[0], skin:"flame" }, ctx(ROSTER[0])).ok, false);
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[1], color:null }, ctx(ROSTER[1])).ok, false);
  assert.equal(applyAction(state, "pickChip", { player:ROSTER[2], color:CHIP_COLORS[3].hex, skin:"star" }, ctx(ROSTER[2])).ok, true);
  assert.equal(state.profiles[ROSTER[2]].skin, "star");

  const claims = [];
  const late = fresh();
  const view = render(ui.ChipPicker, { state:late, me:ROSTER[4], num:"", onChip:(color, skin) => claims.push([color, skin]) });
  assert.match(view.html, /Claiming a color locks your chip for the weekend/);
  view.click("Chip pattern Starburst");
  assert.deepEqual(claims, [], "choosing a pattern is local until the color claim");
  view.click(`Claim chip color ${free}`);
  assert.deepEqual(claims, [[free, "ticks"]]);
  late.profiles[ROSTER[4]] = { color:free, skin:"ticks" };
  assert.match(render(ui.ChipPicker, { state:late, me:ROSTER[4], num:"", onChip:noop }).html, /Chips are locked for the weekend/);
});

test("the profile sheet saves only what changed and hides an unconfigured walkout search", async () => {
  const me = ROSTER[0];
  const state = fresh();
  state.profiles[me] = { display:"Evan", num:7, size:"L", flightsBooked:true, flightIn:{ air:"UA", num:"1", time:"10:00" } };
  const saved = [];
  const props = { state, me, onClose:noop, spotifyCatalogEnabled:false, save:fields => { saved.push(fields); return Promise.resolve({ ok:true }); } };
  const sheet = render(app.ProfileSheet, props, state, app.PlayerIdentityProvider);
  assert.ok(!sheet.buttons.some(button => button.name === "Win song"));
  assert.doesNotMatch(sheet.html, /not configured/);
  state.profiles[me].size = "XL";
  await sheet.click("Save");
  assert.deepEqual(saved, [{ display:"Evan" }], "a commissioner size change is not overwritten");

  state.profiles[me].walkoutTrack = { name:"Saved Song", artists:["Artist"], durationMs:200000, url:"https://open.spotify.com/track/x" };
  const withTrack = render(app.ProfileSheet, { ...props, state }, state, app.PlayerIdentityProvider);
  assert.ok(withTrack.buttons.some(button => button.name === "Win song"));
  assert.match(withTrack.html, /Saved Song/);
  assert.doesNotMatch(withTrack.html, /Search Spotify|Remove song|not configured/);
});

test("toasts wrap inside the screen with a separate 44px action, and older controls meet 44px", () => {
  const css = readFileSync(new URL("../src/ui/experience.css", import.meta.url), "utf8");
  const toast = css.match(/\.fd-toast \{[^}]*\}/)[0];
  assert.match(toast, /max-width:min\(calc\(100vw - 24px\)/);
  assert.doesNotMatch(toast, /nowrap/);
  assert.match(css, /\.fd-toast-msg \{[^}]*line-clamp:2/);
  assert.match(css, /\.fd-toast-action \{[^}]*min-height:44px/);
  assert.match(css, /\.fd-toast\.is-over-rack/);
  const arrival = readFileSync(new URL("../src/features/check-in/arrival.css", import.meta.url), "utf8");
  assert.match(arrival, /\.fd-rating-options button \{[^}]*min-height:44px/);
  assert.doesNotMatch(arrival, /\.fd-rating-options button \{ min-height:3\dpx/);
  /* G8: while the rack is up the toast docks under the header, off the + targets */
  const docked = css.match(/\.fd-toast\.is-over-rack \{[^}]*\}/)[0];
  assert.match(docked, /top:calc\(env\(safe-area-inset-top\) \+ \d+px\)/);
  assert.match(docked, /bottom:auto/);
});

/* ── returning guest regressions ── */
const minutes = n => n * 60_000;
const homeProps = (state, me, extra = {}) => ({ state, me, events:[pairs, putt], standings:computeStandings(state),
  GameMark:StubMark, onOpen:noop, onPlayer:noop, onBets:noop, onStandings:noop, onEvents:noop, onBracket:noop, ...extra });

test("G1: a phone back from the background builds the since line from the first fresh state, never the stale one", () => {
  const me = ROSTER[0], events = BUILTIN_EVENTS;
  let clock = Date.UTC(2026, 9, 31, 20, 0), stored = null, writes = 0;
  const tracker = ui.sinceTracker({ read:() => stored, write:saved => { stored = structuredClone(saved); writes++; }, clock:() => clock });
  const live = state => ({ state, me, events, standings:computeStandings(state), version:1, connected:true, hidden:false });
  const stale = fresh();
  stale.draws[pairs.id] = { id:"d1", teams:[{ players:[ROSTER[3], ROSTER[4]] }, { players:[ROSTER[5], ROSTER[6]] }] };
  assert.equal(tracker.observe(live(stale)), null, "a first look has nothing to report");
  tracker.hidden(live(stale));
  const leftAt = stored.at;

  clock += minutes(40);
  tracker.visible(live(stale));
  assert.equal(tracker.waiting, true);
  const before = writes;
  assert.equal(tracker.observe(live(stale)), null, "the stale board on screen says nothing");
  assert.equal(tracker.observe({ ...live(structuredClone(stale)), connected:false }), null, "nor does a dead socket");
  assert.equal(writes, before, "and neither rewrites the memory");
  assert.equal(stored.at, leftAt);

  const next = structuredClone(stale);
  next.results[pairs.id] = { slots:[[ROSTER[3], ROSTER[4]], [], []], ts:clock - minutes(5) };
  const summary = tracker.observe(live(next));
  assert.match(summary.text, new RegExp(`^Since .* · ${pairs.name}: ${ROSTER[3]} & ${ROSTER[4]} won`));
  assert.deepEqual(summary.route, { type:"event", evId:pairs.id });
  assert.equal(tracker.waiting, false);
  assert.ok(stored.results[pairs.id], "the fresh board becomes the memory");
  assert.equal(tracker.observe(live(structuredClone(next))), null, "said once");
});

test("G9 G21: the since line names duels, rulings, corrections and places, and routes by what it reports", () => {
  const me = ROSTER[0], events = BUILTIN_EVENTS;
  const state = fresh();
  state.results[putt.id] = { slots:[[ROSTER[1]], [], []], ts:1, revision:1 };
  state.adjustments = [{ id:"leader", player:ROSTER[5], delta:3000, ts:1 }];
  const at = Date.UTC(2026, 9, 31, 20, 0), later = at + minutes(30);
  const saved = ui.sinceSnapshot(state, me, events, computeStandings(state), 1, at);

  const bets = structuredClone(state);
  bets.wagers = [{ id:"w", player:me, kind:"outright", eventId:putt.id, pick:ROSTER[1], pickPlayers:[ROSTER[1]], stake:100 }];
  assert.deepEqual(ui.sinceSummary(saved, bets, me, events, computeStandings(bets), later).route, { type:"settled" });

  const corrected = structuredClone(state);
  corrected.results[putt.id] = { slots:[[ROSTER[2]], [], []], ts:1, revision:2, correctedAt:5 };
  const correction = ui.sinceSummary(saved, corrected, me, events, computeStandings(corrected), later);
  assert.match(correction.text, new RegExp(`· Correction · ${putt.name}`));
  assert.deepEqual(correction.route, { type:"event", evId:putt.id });

  const moved = structuredClone(state);
  moved.duels = [{ id:"qd", from:me, to:ROSTER[7], stake:300, status:"open", runs:{ [me]:{ ms:200 }, [ROSTER[7]]:{ ms:260 } } }];
  moved.adjustments.push({ id:"r1", player:me, delta:1000, ts:2, reason:"Style" });
  const text = ui.sinceSummary(saved, moved, me, events, computeStandings(moved), later);
  assert.match(text.detail, /· duel \+300 · ruling \+1,000 · up 1 place, now 2nd$/);
  assert.match(text.text, /^Since .* · up 1 place, now 2nd · 2 more$/, "one line: the place it opens, then a count");
  assert.doesNotMatch(text.text, /↑|↓/);
  assert.deepEqual(text.route, { type:"standings" });

  const routes = [];
  const view = render(ui.GuestHome, homeProps(moved, me, { since:text, onSince:route => routes.push(route) }));
  view.click(`${text.detail}. View standings`);
  assert.deepEqual(routes, [{ type:"standings" }]);
});

test("G7 G18: Home drops the title, says a result once, and collapses your own waiting offer", () => {
  const me = ROSTER[0], state = bracketState();
  state.onDeck = pairs.id;
  state.results[putt.id] = { slots:[[ROSTER[1]], [], []], ts:1 };
  const now = Date.now();
  state.duels = [
    { id:"mine", from:me, to:ROSTER[9], stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:now },
    { id:"theirs", from:ROSTER[10], to:me, stake:300, status:"open", consent:true, acceptedAt:null, runs:{}, ts:now },
  ];
  const duelContent = React.createElement(ui.HomeDuels, { state, me, gm:false, onAccept:noop, onDecline:noop, onWithdraw:noop, onPlay:noop, onPlayer:noop });
  const plain = render(ui.GuestHome, homeProps(state, me, { duelContent }));
  assert.doesNotMatch(plain.html, />Scottsdale</);
  assert.match(plain.html, /aria-label="Latest result"/);
  assert.equal((plain.html.match(/<article /g) || []).length, 1, "only the duel waiting on you is a card");
  assert.ok(plain.html.indexOf(`Accept duel with ${ROSTER[10]}`) < plain.html.indexOf("Withdraw challenge to"), "act-on-it duels lead");
  assert.match(plain.html, new RegExp(`Waiting for ${ROSTER[9]} to accept<small>100 · 10 min</small>`));
  assert.doesNotMatch(plain.html, /Edit your profile|Trip details/);
  const withSince = render(ui.GuestHome, homeProps(state, me, { duelContent,
    since:{ text:`Since 8:00 PM · ${putt.name}: ${ROSTER[1]} won`, route:{ type:"event", evId:putt.id } } }));
  assert.doesNotMatch(withSince.html, /aria-label="Latest result"/, "the since line already names it");
});

test("G2: Home's your-turn dot is built from what you can do now, and a lapsed offer clears it", () => {
  const me = ROSTER[0], state = fresh(), now = Date.now();
  state.duels = [{ id:"old", from:ROSTER[1], to:me, stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:now - minutes(11) }];
  assert.equal(ui.hasDuelTurn(state, me, now), false, "a lapsed offer is stored as open but is not your turn");
  state.duels.push({ id:"sent", from:me, to:ROSTER[2], stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:now });
  assert.equal(ui.hasDuelTurn(state, me, now), false, "your own waiting offer is not your turn");
  state.duels.push({ id:"live", from:ROSTER[3], to:me, stake:100, status:"open", consent:true, acceptedAt:now, runs:{ [ROSTER[3]]:{ played:true } }, ts:now });
  assert.equal(ui.hasDuelTurn(state, me, now), true);
  state.duels[2].runs[me] = { ms:250 };
  assert.equal(ui.hasDuelTurn(state, me, now), false, "after your draw it is theirs");
  state.duels.push({ id:"open", from:ROSTER[4], to:null, open:true, stake:200, status:"open", consent:true, acceptedAt:null, runs:{}, ts:now });
  assert.equal(ui.hasDuelTurn(state, me, now), true, "an open challenge you can take");
  assert.equal(ui.hasDuelTurn(state, me, now + minutes(11)), false);
});

test("G3: Update ready is a header chip, never a floating layer", () => {
  const reloads = [];
  const header = render(ui.AppHeader, { state:fresh(), me:ROSTER[0], onHome:noop, onProfile:noop, onMenu:noop,
    connected:true, loaded:true, updateReady:true, onReload:() => reloads.push(1), GameMark:StubMark });
  header.click("Update ready. Reload");
  assert.deepEqual(reloads, [1]);
  const quiet = render(ui.AppHeader, { state:fresh(), me:ROSTER[0], onHome:noop, onProfile:noop, onMenu:noop,
    connected:true, loaded:true, updateReady:false, onReload:noop, GameMark:StubMark });
  assert.ok(!quiet.buttons.some(button => button.name === "Update ready. Reload"));
  const source = readFileSync(new URL("../src/ui/UpdateReady.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /position:\s*"?fixed/);
  assert.doesNotMatch(readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8"), /<UpdateReady/);
  const client = readFileSync(new URL("../src/lib/client.js", import.meta.url), "utf8");
  assert.match(client, /__FD_HOLD_RELOAD__ === true/, "G10: an open sheet or draft holds the automatic reload");
});

test("G4: an uncertain write toasts only when it settles as a real failure", async () => {
  const toasts = [];
  const notify = message => toasts.push(message);
  let settle;
  const uncertain = { ok:false, uncertain:true, error:"No response, try again", settled:new Promise(resolve => { settle = resolve; }) };
  assert.equal(app.actionFeedback(uncertain, notify, "Saved"), uncertain);
  assert.deepEqual(toasts, [], "Checking… is on the surface; no toast yet");
  settle({ ok:true, late:true });
  await uncertain.settled; await null;
  assert.deepEqual(toasts, ["Saved"]);
  const failed = { ok:false, uncertain:true, error:"No response, try again", settled:Promise.resolve({ ok:false, error:"Not saved, try again" }) };
  app.actionFeedback(failed, notify);
  await failed.settled; await null;
  assert.deepEqual(toasts, ["Saved", "Not saved, try again"]);
  app.actionFeedback({ ok:false, error:"Betting is locked" }, notify);
  assert.equal(toasts.at(-1), "Betting is locked");
});

test("G6: an unseated guest reads their carried chips with no seat controls; seat controls are 44px", () => {
  const finale = BUILTIN_EVENTS.find(event => event.finale && event.game === "poker");
  const state = fresh();
  state.poker = { id:finale.id, total:12000, startingStacks:{}, startedAt:Date.now(), levels:pokerLevels(),
    levelIdx:0, levelStartedAt:Date.now(), levelOffset:0, outs:[], counts:{}, ts:1,
    seats:ROSTER.slice(1), unseated:{ [ROSTER[0]]:1400 } };
  const props = { state, standings:computeStandings(state), gm:false, onBuyin:noop, onStart:noop, onCancel:noop,
    onLevel:noop, onPause:noop, onBust:noop, onUnbust:noop, onCount:noop, onReview:noop };
  const away = render(app.PokerCard, { ...props, me:ROSTER[0] }, state, app.PlayerIdentityProvider);
  assert.match(away.html, /Not seated · your 1,400 chips carry/);
  assert.ok(!away.buttons.some(button => ["Count", "I busted", "Recount"].includes(button.name)));
  const seated = render(app.PokerCard, { ...props, me:ROSTER[1] }, state, app.PlayerIdentityProvider);
  assert.ok(seated.buttons.some(button => button.name === "Count"));
  assert.ok(seated.buttons.some(button => button.name === "I busted"));
  assert.equal((seated.html.match(/<button[^>]*min-height:44px/g) || []).length, 2);
  state.poker.startedAt = null;
  const setup = render(app.PokerCard, { ...props, me:ROSTER[0] }, state, app.PlayerIdentityProvider);
  assert.ok(setup.buttons.some(button => button.name === "All stacks"));
  assert.ok(!setup.buttons.some(button => button.name === "Everyone"));
  assert.match(setup.html, /Not seated · your 1,400 chips carry/);
});

test("G13 G15: a settled duel joins the update line instead of replacing it", () => {
  const me = ROSTER[0], events = BUILTIN_EVENTS;
  const before = fresh();
  before.duels = [{ id:"qd", from:me, to:ROSTER[7], stake:300, status:"open", runs:{ [me]:{ ms:200 } }, ts:1 }];
  before.wagers = [{ id:"w", player:me, kind:"outright", eventId:putt.id, pick:me, pickPlayers:[me], stake:100 }];
  const prev = ui.guestLedger(before, me, events);
  const after = structuredClone(before);
  after.duels[0].runs[ROSTER[7]] = { ms:260 };
  after.results[putt.id] = { slots:[[me], [], []], ts:2, revision:1 };
  const summary = ui.summarizeUpdate(prev, ui.guestLedger(after, me, events), { state:after, events });
  assert.equal(summary.msg, `1st in ${putt.name} +400 · bet +200 · Quick Draw vs ${ROSTER[7]} +300 · you lead`);
  assert.equal(ui.summarizeUpdate(prev, ui.guestLedger(after, me, events), { state:after, events, skipDuel:"qd" }).msg,
    `1st in ${putt.name} +400 · bet +200 · you lead`, "the Quick Draw layer already shows its own duel");
});

test("G20: an away guest sits out on Home and nobody can challenge an away player", () => {
  const me = ROSTER[0], state = bracketState();
  state.onDeck = pairs.id;
  state.away = { [me]:true };
  const view = render(ui.GuestHome, homeProps(state, me));
  assert.match(view.html, /You are marked away/);
  const live = fresh();
  live.away = { [ROSTER[3]]:true };
  const card = p => render(ui.PlayerSheet, { state:live, me, p, standings:computeStandings(live), events:BUILTIN_EVENTS,
    onClose:noop, onDuel:() => ({ ok:true }) });
  assert.ok(!card(ROSTER[3]).buttons.some(button => /^Challenge /.test(button.name)));
  assert.ok(card(ROSTER[4]).buttons.some(button => button.name === `Challenge ${ROSTER[4]} for 100`));
});

test("G25: before the weekend a guest without a flight answer gets one compact question", async () => {
  const me = ROSTER[0], state = { ...fresh(), live:false };
  state.profiles[me] = { display:"Evan" };
  const asked = [];
  const props = extra => homeProps(state, me, { events:[putt], onFlightsYes:() => asked.push("yes"),
    onFlightsNotYet:() => { asked.push("not yet"); return Promise.resolve({ ok:true }); }, ...extra });
  const view = render(ui.GuestHome, props());
  assert.match(view.html, /Booked your flights\?/);
  assert.match(view.html, /Before the weekend.*1 left.*Booked your flights\?/s, "the question is a row of the list");
  assert.match(render(ui.GuestHome, props({ setup:[{ id:"jersey", section:"jersey", label:"Confirm your jersey" },
    { id:"details", section:"travel", label:"Venmo and drinks" }], onSetup:noop })).html,
    /3 left.*Confirm your jersey.*Booked your flights\?.*Venmo and drinks/s, "in travel's place");
  view.click("Yes");
  await view.click("Not yet");
  assert.deepEqual(asked, ["yes", "not yet"]);
  state.profiles[me].flightsBooked = false;
  assert.match(render(ui.GuestHome, props()).html, /Booked your flights\?/, "Not yet from check-in is asked again");
  assert.doesNotMatch(render(ui.GuestHome, props({ flightsAnswered:true })).html, /Booked your flights/);
  state.profiles[me] = { flightsBooked:true };
  assert.doesNotMatch(render(ui.GuestHome, props()).html, /Booked your flights/);
  state.profiles[me] = { flightIn:{ air:"UA", num:"1", time:"10:00" } };
  assert.doesNotMatch(render(ui.GuestHome, props()).html, /Booked your flights/, "saved legs are an answer");
  state.profiles[me] = {};
  assert.doesNotMatch(render(ui.GuestHome, props({ state:{ ...state, live:true } })).html, /Booked your flights/);
});

test("before the weekend Home lists what is still owed and each row opens its profile section", () => {
  const me = ROSTER[0], state = { ...fresh(), live:false };
  state.profiles[me] = { display:"Evan", flightsBooked:true, flightIn:{ air:"UA", num:"1", time:"10:00" } };
  const opened = [];
  const setup = [{ id:"jersey", section:"jersey", label:"Confirm your jersey" },
    { id:"details", section:"travel", label:"Venmo and drinks" }];
  const view = render(ui.GuestHome, homeProps(state, me, { events:[putt], setup, onSetup:item => opened.push(item.section) }));
  assert.match(view.html, /Before the weekend/);
  assert.match(view.html, /2 left/);
  view.click("Confirm your jersey");
  view.click("Venmo and drinks");
  assert.deepEqual(opened, ["jersey", "travel"]);
  assert.doesNotMatch(render(ui.GuestHome, homeProps(state, me, { events:[putt], setup:[], onSetup:noop })).html,
    /Before the weekend/);
  assert.doesNotMatch(render(ui.GuestHome, homeProps({ ...state, live:true }, me, { events:[putt], setup,
    onSetup:noop })).html, /Before the weekend/, "the weekend itself is not the time");
});

test("the Jersey section draws the back and its one button confirms; ordered jerseys only save", async () => {
  const me = ROSTER[0], state = { ...fresh(), live:false };
  state.profiles[me] = { display:"Evan", num:7, size:"L" };
  const saved = [];
  const props = { state, me, onClose:noop, initialSection:"jersey", spotifyCatalogEnabled:false,
    save:fields => { saved.push(fields); return Promise.resolve({ ok:true }); } };
  const sheet = render(app.ProfileSheet, props, state, app.PlayerIdentityProvider);
  assert.match(sheet.html, /Jersey back: EVAN, number 7, size L/);
  assert.ok(sheet.buttons.some(button => button.name === "Trip"));
  await sheet.click("Confirm jersey");
  assert.deepEqual(saved, [{ display:"Evan", confirmJersey:true }]);

  state.profiles[me] = { ...state.profiles[me], backName:"EVAN", jerseyOk:{ name:"EVAN", num:7, size:"L", at:1 } };
  const done = render(app.ProfileSheet, { ...props, state }, state, app.PlayerIdentityProvider);
  assert.match(done.html, /Confirmed/);
  assert.ok(done.buttons.some(button => button.name === "Save"));
  assert.ok(!done.buttons.some(button => button.name === "Confirm jersey"));

  const locked = { ...state, jerseysLocked:true, profiles:{ ...state.profiles, [me]:{ display:"Evan", num:7, size:"L" } } };
  const ordered = render(app.ProfileSheet, { ...props, state:locked }, locked, app.PlayerIdentityProvider);
  assert.match(ordered.html, /Jerseys are ordered/);
  assert.ok(!ordered.buttons.some(button => button.name === "Confirm jersey"));
  assert.match(ordered.html, /aria-label="Name on back" disabled=""|disabled="" [^>]*aria-label="Name on back"/);
});

test("G5: Bets during the finale is closed, and before the weekend says it once", () => {
  const finale = BUILTIN_EVENTS.find(event => event.finale && event.game === "poker");
  const table = { ...fresh(), poker:{ id:finale.id, outs:[], startedAt:1 } };
  const closed = wagers(table, null);
  assert.match(closed.html, /Betting is closed for the finale/);
  assert.doesNotMatch(closed.html, /Betting opens/);
  assert.ok(!closed.buttons.some(button => button.name === "Browse the events"));
  const before = wagers({ ...fresh(), live:false }, null);
  assert.equal((before.html.match(/Betting opens/g) || []).length, 1);
});

test("G19: Checking… waits for the transport to settle, not for any broadcast", async () => {
  let settle;
  const reply = { ok:false, uncertain:true, error:"No response, try again", settled:new Promise(resolve => { settle = resolve; }) };
  const sent = [];
  const view = wagers({ ...fresh(), onDeck:putt.id }, putt, { onPick:pick => { sent.push(pick); return Promise.resolve(reply); } });
  await view.click(`Place a chip on ${ROSTER[1]}`);
  view.click(`Place a chip on ${ROSTER[1]}`);
  assert.equal(sent.length, 1, "held while Checking");
  settle({ ok:true, late:true });
  await reply.settled;
});
