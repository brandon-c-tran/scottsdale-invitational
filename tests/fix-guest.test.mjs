import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, CHIP_COLORS, EMPTY_STATE, ROSTER, computeStandings, makeBracket,
  resolveCurrentContest } from "../shared/core.js";
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
  export { deriveHomeModel } from "./src/features/home/homeModel.js";
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
const app = await load("fix-guest-app.cjs", `export { ProfileSheet } from "./src/App.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, [{ name:"isolated-client", setup(builder) {
  builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
    export const useTournament=()=>({});
    export const localGet=()=>null, localSet=()=>{}, hasGmToken=()=>false, setGmToken=()=>{};
    const refuse=()=>{ throw new Error("transport must not run"); };
    export const dispatch=refuse, uploadPhoto=refuse, downloadSnapshot=refuse, spotifyStatus=refuse,
      spotifyPlayer=refuse, spotifySearch=refuse, spotifyAuthorize=refuse, spotifyDisconnect=refuse,
      spotifyPlay=refuse, spotifyPause=refuse, spotifyDevice=refuse;` }));
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

  state.brackets[pairs.id].rounds[0][0].winner = 0;
  openCurrent(state, pairs);
  assert.equal(line(state, ROSTER[6]), "You’re out · betting open");
  assert.equal(line(state, ROSTER[0]), `Next: Final vs winner of Semifinal 2 · with ${ROSTER[1]}`);

  const view = render(ui.GuestHome, { state, me:ROSTER[0], events:[pairs], standings:computeStandings(state),
    GameMark:StubMark, onOpen:noop, onPlayer:noop, onBets:noop, onStandings:noop, onProfile:noop,
    onEvents:noop, onGuide:noop, onHouse:noop });
  assert.match(view.html, /class="fd-home-personal">Next: Final vs winner of Semifinal 2/);
  for (const player of [ROSTER[2], ROSTER[3], ROSTER[4], ROSTER[5]])
    assert.ok(view.buttons.some(button => button.name === `View ${player}'s player card`), "The room's matchup still renders");
});

test("an added event without a game has no dead rules target and opens its own description", () => {
  const custom = { id:"cornhole", name:"Cornhole", session:"fri", value:400, kind:"solo", custom:true, desc:"Three bags each." };
  assert.equal(ui.hasGameRules(custom), false);
  assert.equal(ui.hasGameRules(putt), true);
  assert.equal(ui.hasGameRules(BUILTIN_EVENTS.find(event => event.id === "bball")), true, "variant-only games have rules");
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
  assert.ok(text.includes(`${pairs.name}: ${ROSTER[3]} & ${ROSTER[4]} won`));
  assert.ok(text.includes("your bet +200"));
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
  assert.ok(!sheet.buttons.some(button => button.name === "Walkout"));
  assert.doesNotMatch(sheet.html, /not configured/);
  state.profiles[me].size = "XL";
  await sheet.click("Save");
  assert.deepEqual(saved, [{ display:"Evan" }], "a commissioner size change is not overwritten");

  state.profiles[me].walkoutTrack = { name:"Saved Song", artists:["Artist"], durationMs:200000, url:"https://open.spotify.com/track/x" };
  const withTrack = render(app.ProfileSheet, { ...props, state }, state, app.PlayerIdentityProvider);
  assert.ok(withTrack.buttons.some(button => button.name === "Walkout"));
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
});
