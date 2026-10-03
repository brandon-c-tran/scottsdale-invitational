import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, CHIP_COLORS, EMPTY_STATE, GAMES, LOGISTICS, ROSTER, computeStandings, makeBracket } from "../shared/core.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { GuestHome } from "./src/features/home/GuestHome.jsx";
    export { Board } from "./src/features/standings/Standings.jsx";
    export { PlayerSheet } from "./src/features/profile/PlayerSheet.jsx";
    export { ProfileEditor } from "./src/features/profile/ProfileEditor.jsx";
    export { Schedule } from "./src/features/weekend/Schedule.jsx";
    export { Guide } from "./src/features/weekend/Guide.jsx";
    export { HowToSheet } from "./src/features/weekend/HowToSheet.jsx";
    export { VenueCard } from "./src/features/travel/Travel.jsx";
    export { HouseSheet } from "./src/features/weekend/ProgramSheets.jsx";
    export { gameStepsModel } from "./src/features/rules/gameSteps.js";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
    export { AppNavigation } from "./src/ui/AppChrome.jsx";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("player-flow-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { GuestHome, Board, PlayerSheet, ProfileEditor, Schedule, Guide, HowToSheet, VenueCard, HouseSheet, gameStepsModel,
  PlayerIdentityProvider, AppNavigation } = componentModule.exports;
const [me, other] = ROSTER;
/* Schedule keeps this visit's folded sessions in sessionStorage */
const sessionArea = new Map();
globalThis.sessionStorage = { getItem:key => sessionArea.has(key) ? sessionArea.get(key) : null,
  setItem:(key, value) => sessionArea.set(key, String(value)), removeItem:key => sessionArea.delete(key) };
const fresh = () => ({ ...structuredClone(EMPTY_STATE), live:true });
const noop = () => {};
const StubMark = () => null;
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");

/* Exercise real rendered handlers by accessible names. SSR does not emulate
   browser focus or rerenders; those are checked in the integrated browser. */
function controls(Component, state, overrides = {}) {
  const buttons = [], viewed = [], adjusted = [], challenges = [], closed = [], opened = [];
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button") buttons.push({
      name:(props?.["aria-label"] || textOf(children)).trim(),
      disabled:!!props?.disabled, current:props?.["aria-current"], className:props?.className,
      click:props?.onClick,
    });
    return createElement(type, props, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(Component, {
        state, me, p:other, standings:computeStandings(state), events:BUILTIN_EVENTS,
        allTied:true, coChamps:[], myAtRisk:0, deltas:{}, gm:false,
        GameMark:StubMark, StatPills:StubMark, resultImpact:() => "", nextOpenMatch:() => null,
        onPlayer:player => viewed.push(player), onAdjust:player => adjusted.push(player),
        onDuel:stake => { challenges.push(stake); return Promise.resolve({ ok:true }); },
        onClose:() => closed.push(true), onOpen:event => opened.push(event.id),
        onProfile:noop, onEdit:noop, onEvents:noop, onGuide:noop, onHouse:noop, onBets:noop, onStandings:noop,
        onFreeze:noop, onUnfreeze:noop, ...overrides,
      })));
  } finally {
    React.createElement = createElement;
  }
  const named = name => {
    const button = buttons.find(item => item.name === name);
    assert.ok(button, `Missing control: ${name}`);
    return button;
  };
  return { html, viewed, adjusted, challenges, closed, opened, buttons, named,
    click(name) {
      const button = named(name);
      assert.equal(button.disabled, false, `${name} is disabled`);
      assert.equal(typeof button.click, "function", `${name} has no action`);
      return button.click();
    },
  };
}

test("every home player opens a card, including the current player, without editing or challenging", () => {
  for (const live of [false, true]) {
    const state = { ...fresh(), live }, edited = [];
    const view = controls(GuestHome, state, { onProfile:() => edited.push(true) });
    for (const player of ROSTER) view.click(`View ${player}'s player card, 1,000 ${live ? "chips" : "starting chips"}`);
    assert.deepEqual(view.viewed, ROSTER);
    assert.deepEqual(edited, []);
    assert.deepEqual(view.challenges, []);
    assert.ok(!view.buttons.some(button => button.name === "Edit your profile"), "the header avatar opens the profile");
    assert.deepEqual(edited, []);
  }
});

test("Home exposes every leaderboard row without a disclosure before and during the weekend", () => {
  for (const live of [false, true]) {
    const state = { ...fresh(), live };
    if (live) state.adjustments = [{ player:other, delta:400, ts:1 }];
    const standings = computeStandings(state);
    const view = controls(GuestHome, state, { standings });
    const rows = view.buttons.filter(button => button.className === "fd-standings-row");
    assert.equal(rows.length, ROSTER.length);
    assert.deepEqual(rows.map(row => row.name), standings.map(row =>
      `View ${row.player}'s player card, ${row.pts.toLocaleString("en-US")} ${live ? "chips" : "starting chips"}`));
    assert.doesNotMatch(view.html, /<details|<summary|\shidden(?:=|>)|Adjust chips for|fd-now-card|fd-leader-panel/);
    assert.match(view.html, /aria-label="Leaderboard"/);
    assert.match(view.html, /class="is-you"/);
    if (live) {
      assert.equal(rows[0].name, `View ${other}'s player card, 1,400 chips`);
      assert.match(view.html, /aria-label="Position 1"/);
    } else {
      assert.match(view.html, /STARTING CHIPS/);
      assert.equal((view.html.match(/aria-label="Not started"/g) || []).length, ROSTER.length);
      assert.doesNotMatch(view.html, /aria-label="Position \d/);
    }
  }
});

test("home keeps trip details private while event and reference actions open their destinations", () => {
  const state = { ...fresh(), live:false };
  state.logistics = { ...LOGISTICS, venue:"PRIVATE_HOUSE", checkIn:"PRIVATE_CHECKIN", airportName:"PRIVATE_AIRPORT" };
  state.profiles[me] = { size:"PRIVATE_SHIRT", flightIn:{ note:"PRIVATE_ARRIVAL" }, flightOut:{ note:"PRIVATE_DEPARTURE" } };
  state.seeds[me] = { golf:"PRIVATE_RATING" };
  const routes = [], rules = [];
  const view = controls(GuestHome, state, {
    onEvents:() => routes.push("events"), onGuide:() => routes.push("rules"),
    onHouse:() => routes.push("trip"), onStandings:() => routes.push("standings"),
    onRules:event => rules.push(event.id),
  });
  assert.doesNotMatch(view.html, /PRIVATE_HOUSE|PRIVATE_CHECKIN|PRIVATE_AIRPORT|PRIVATE_SHIRT|PRIVATE_ARRIVAL|PRIVATE_DEPARTURE|PRIVATE_RATING/);
  assert.ok(!view.html.includes(LOGISTICS.venue));
  const first = BUILTIN_EVENTS[0];
  view.click(`Open ${first.name}`);
  /* the rules are in the event sheet: the pane's one way in is the name */
  assert.ok(!view.buttons.some(button => button.name === `${first.name} rules`));
  assert.deepEqual(view.opened, [first.id]);
  assert.deepEqual(rules, []);
  assert.deepEqual(routes, []);
  view.click("All events");
  view.click("Standings");
  assert.deepEqual(routes, ["events", "standings"]);
  assert.ok(!view.buttons.some(button => ["Rules", "Trip details"].includes(button.name)), "Weekend owns the reference links");
  assert.deepEqual(view.viewed, []);
});

test("home only shows a current balance and chip-placement action after the weekend starts", () => {
  const event = BUILTIN_EVENTS.find(item => item.id === "putt");
  const state = { ...fresh(), live:false, onDeck:event.id };
  const routes = [];
  const props = { events:[event], onBets:() => routes.push("bets"), onStandings:() => routes.push("standings") };
  const before = controls(GuestHome, state, props);
  assert.doesNotMatch(before.html, /Your position|Your chips|Position<|Place chips|View bets/);
  assert.ok(!before.buttons.some(button => button.name === "Your chips and standings"));
  assert.ok(!before.buttons.some(button => button.name === "Place chips"));

  state.live = true;
  const live = controls(GuestHome, state, props);
  assert.ok(!live.buttons.some(button => button.name === "Your chips and standings"));
  assert.equal(live.buttons.filter(button => button.name === "Standings").length, 1);
  live.click("Standings");
  live.click("Back yourself"); // a competitor in the free-for-all backs themself
  assert.deepEqual(routes, ["standings", "bets"]);
  assert.deepEqual(live.opened, []);
  assert.ok(!live.buttons.some(button => button.name === "Open event"), "the event opens from its name");
  live.click(`Open ${event.name}`);
  assert.deepEqual(live.opened, [event.id]);

  state.wagers = [{ id:"at-cap", player:me, kind:"outright", eventId:event.id,
    pick:other, pickPlayers:[other], stake:500 }];
  const capped = controls(GuestHome, state, props);
  assert.ok(!capped.buttons.some(button => ["Place chips", "Back yourself"].includes(button.name)));
  capped.click("View bets");
  assert.deepEqual(routes, ["standings", "bets", "bets"]);
  capped.click("500 in bets");
  assert.deepEqual(routes, ["standings", "bets", "bets", "bets"]);
});

test("home partner and opponent cards remain separate from the current event action", () => {
  const event = BUILTIN_EVENTS.find(item => item.id === "8ball");
  const state = fresh();
  state.draws[event.id] = { id:"current-home-draw", teams:Array.from({ length:4 }, (_, index) => ({
    players:ROSTER.slice(index * 2, index * 2 + 2),
  })) };
  state.brackets[event.id] = makeBracket(4);
  state.eventOps[event.id] = { bettingLockedAt:1, startedAt:2 };
  const view = controls(GuestHome, state, { events:[event] });
  assert.match(view.html, /You’re playing/);
  /* a semifinal keeps its number, in the flagged face (ui/OneSafe.jsx) */
  assert.match(view.html, /Semifinal <span class="fd-one">1<\/span>/, "a lone 1 in its flagged face");
  const assignedPlayers = [other, ...state.draws[event.id].teams[3].players];
  for (const player of assignedPlayers) {
    const name = `View ${player}'s player card`;
    assert.ok(view.buttons.some(button => button.name === name), `${player} needs an assignment card target`);
    assert.ok(view.buttons.some(button => button.className === "fd-standings-row"
      && button.name.startsWith(`${name},`)), `${player} needs a leaderboard card target`);
    view.click(name);
  }
  assert.deepEqual(view.viewed, assignedPlayers);
  assert.deepEqual(view.opened, []);
  view.click(`Open ${event.name}`);
  assert.deepEqual(view.opened, [event.id]);
  assert.deepEqual(view.viewed, assignedPlayers);
});

test("home can open a separate betting event while preserving the running event", () => {
  const running = BUILTIN_EVENTS.find(item => item.id === "8ball");
  const betting = BUILTIN_EVENTS.find(item => item.id === "putt");
  const state = { ...fresh(), onDeck:betting.id };
  state.draws[running.id] = { id:"running-draw", teams:Array.from({ length:4 }, (_, index) => ({
    players:ROSTER.slice(index * 2, index * 2 + 2),
  })) };
  state.brackets[running.id] = makeBracket(4);
  state.eventOps[running.id] = { startedAt:1 };
  const bets = [];
  const view = controls(GuestHome, state, { events:[running, betting], onBets:() => bets.push(betting.id) });
  view.click(`Open ${running.name}`);
  const separate = view.buttons.find(button => button.name.includes(betting.name) && button.name.includes("Place chips"));
  assert.ok(separate, "The other open market must have a direct betting action");
  view.click(separate.name);
  assert.deepEqual(view.opened, [running.id]);
  assert.deepEqual(bets, [betting.id]);
});

test("home switches to poker and final standings without old event, betting, or duel actions", () => {
  const event = BUILTIN_EVENTS.find(item => item.id === "putt");
  const finale = BUILTIN_EVENTS.find(item => item.finale && item.game === "poker");
  const routes = [], rules = [];
  const PokerSlot = () => React.createElement("button", { onClick:() => routes.push("poker") }, "Poker table action");
  const DuelSlot = () => React.createElement("button", { onClick:() => routes.push("duel") }, "Open active duel");
  const pokerContent = React.createElement(PokerSlot);
  const duelContent = React.createElement(DuelSlot);
  const state = { ...fresh(), onDeck:event.id, poker:{ id:finale.id, startedAt:null, outs:[] } };
  state.eventOps[event.id] = { startedAt:1 };
  const props = { events:[event, finale], pokerContent, duelContent,
    onBets:() => routes.push("bets"), onStandings:() => routes.push("standings"), onRules:event => rules.push(event.id) };
  const assertNoOldActions = view => {
    assert.ok(!view.buttons.some(button => ["Place chips", "View bets", "Open active duel", "Open event", `Open ${event.name}`].includes(button.name)));
    assert.doesNotMatch(view.html, /aria-label="Coming up"/);
  };
  const live = controls(GuestHome, { ...state, poker:null }, props);
  live.click("Open active duel");
  assert.deepEqual(routes, ["duel"]);
  assert.ok(!live.buttons.some(button => button.name === "Poker table action"));
  routes.length = 0;
  for (const startedAt of [null, 2]) {
    state.poker.startedAt = startedAt;
    const view = controls(GuestHome, state, props);
    assertNoOldActions(view);
    view.click("Poker table action");
    view.click("Poker rules");
    assert.deepEqual(view.opened, []);
    assert.equal(rules.at(-1), finale.id);
  }
  assert.deepEqual(routes, ["poker", "poker"]);
  assert.deepEqual(rules, [finale.id, finale.id]);

  for (const frozen of [false, true]) {
    state.frozen = frozen;
    state.results[finale.id] = { ts:3, slots:[[me]], stacks:{ [me]:2100, [other]:0 } };
    const view = controls(GuestHome, state, props);
    assertNoOldActions(view);
    assert.ok(!view.buttons.some(button => ["Poker table action", "Poker rules"].includes(button.name)));
    view.click("Standings");
    assert.equal(routes.at(-1), "standings");
    assert.deepEqual(view.opened, []);
  }
  const frozen = controls(GuestHome, { ...state, frozen:true, poker:null, results:{} }, props);
  assertNoOldActions(frozen);
  assert.ok(!frozen.buttons.some(button => ["Poker table action", "Poker rules"].includes(button.name)));
  frozen.click("Standings");
  assert.equal(routes.at(-1), "standings");
  assert.ok(!routes.includes("bets") && !routes.includes("duel"));
});

test("standings keep player cards available when frozen and separate commissioner adjustments", () => {
  for (const frozen of [false, true]) {
    const state = { ...fresh(), frozen };
    const view = controls(Board, state, { gm:true });
    for (const player of ROSTER) view.click(`View ${player}'s player card, 1,000 chips`);
    assert.deepEqual(view.viewed, ROSTER);
    assert.deepEqual(view.adjusted, []);
    /* a frozen board takes no rulings, so Adjust is not offered */
    if (frozen) assert.ok(!view.buttons.some(button => button.name.startsWith("Adjust chips for")));
    else {
      view.click(`Adjust chips for ${other}`);
      assert.deepEqual(view.adjusted, [other]);
    }
    assert.deepEqual(view.challenges, []);
  }
  const before = controls(Board, { ...fresh(), live:false }, { gm:true });
  assert.ok(!before.buttons.some(button => button.name.startsWith("Adjust chips for")), "No rulings before the weekend");
});

test("embedded standings omit the page and event headers while retaining champion and commissioner actions", () => {
  const state = fresh();
  /* Crown shows only when the director would offer it */
  assert.ok(!controls(Board, state, { embedded:true, gm:true }).buttons.some(button => button.name === "Crown the champion"));
  const view = controls(Board, state, { embedded:true, gm:true, crownReady:true });
  assert.doesNotMatch(view.html, /<h1|fd-now-card/);
  assert.match(view.html, /aria-label="Tournament standings"/);
  view.click(`View ${other}'s player card, 1,000 chips`);
  view.click(`Adjust chips for ${other}`);
  assert.deepEqual(view.viewed, [other]);
  assert.deepEqual(view.adjusted, [other]);
  assert.ok(view.named("Crown the champion"));

  const champion = computeStandings(state)[0];
  const final = controls(Board, { ...state, frozen:true }, { embedded:true, gm:true, champion });
  assert.doesNotMatch(final.html, /<h1|fd-now-card/);
  assert.match(final.html, /aria-label="Champion"/);
  assert.match(final.html, /aria-label="Tournament standings"/);
  final.click(`View ${champion.player}'s player card`);
  assert.deepEqual(final.viewed, [champion.player]);
  assert.ok(final.named("Unfreeze board"));
});

test("live matchup and result player targets preserve the distinct event action", () => {
  const event = BUILTIN_EVENTS.find(item => item.id === "8ball");
  const state = fresh();
  state.draws[event.id] = { id:"current", teams:ROSTER.slice(0, 4).map(player => ({ players:[player] })) };
  state.brackets[event.id] = makeBracket(4);
  state.eventOps[event.id] = { startedAt:1 };
  const live = controls(Board, state, { nextOpenMatch:() => ({ a:0, b:1, roundName:"Final" }) });
  live.click(`View ${other}'s player card`);
  assert.deepEqual(live.viewed, [other]);
  assert.deepEqual(live.opened, []);
  live.click("Open event");
  assert.deepEqual(live.opened, [event.id]);
  state.results[event.id] = { ts:1, slots:[[other]] };
  const result = controls(Board, state);
  result.click(`View ${other}'s player card`);
  assert.deepEqual(result.viewed, [other]);
  assert.deepEqual(result.opened, []);
});

test("public player cards show saved identity and public results without personal trip or rating answers", () => {
  const state = fresh();
  state.profiles[other] = { display:"Player Alias", num:0, size:"PRIVATE_SIZE",
    flightIn:{ note:"PRIVATE_ARRIVAL" }, flightOut:{ note:"PRIVATE_DEPARTURE" },
    walkoutTrack:{ name:"Public Song" } };
  state.seeds[other] = { golf:"PRIVATE_RATING" };
  state.results[BUILTIN_EVENTS[0].id] = { ts:1, slots:[[other]] };
  const view = controls(PlayerSheet, state);
  assert.match(view.html, /Player Alias/);
  /* Oct 2: someone else's number is not theirs to show you; their card
     carries their monogram, and only your own card keeps your number */
  assert.doesNotMatch(view.html, /PLAYER \/ 0/);
  assert.match(view.html, /class="fd-pass-number fd-pass-plate" aria-hidden="true">PA</); // a two-word name letters as its initials
  assert.match(view.html, /Public Song/);
  /* public results live on the card itself (its season sheet), not repeated under it */
  assert.ok(view.html.includes(BUILTIN_EVENTS[0].name), "the card lists the event");
  assert.match(view.html, />1st</, "and the placement");
  assert.doesNotMatch(view.html, /Tournament stats|Event wins/, "nothing repeats under the card");
  assert.doesNotMatch(view.html, /PRIVATE_SIZE|PRIVATE_ARRIVAL|PRIVATE_DEPARTURE|PRIVATE_RATING/);
  assert.ok(!view.buttons.some(button => button.name === "Edit your profile"));
  const own = controls(PlayerSheet, state, { p:me });
  assert.ok(own.buttons.some(button => button.name === "Edit your profile"));
  assert.match(own.html, /PLAYER \/ (<span class="fd-one">)?\d/, "your own card keeps your number");
  // Rule change: your own card hosts the open challenge (to anyone).
  assert.ok(own.buttons.some(button => button.name === "Challenge anyone for 100"));
  assert.ok(!own.buttons.some(button => button.name === `Challenge ${me} for 100`));
});

test("the board follows actual event progress rather than a prepared future bracket", () => {
  const base = BUILTIN_EVENTS.find(item => item.id === "8ball");
  const future = { ...base, id:"future", name:"Future bracket" };
  const running = { ...base, id:"running", name:"Current event" };
  const state = fresh();
  for (const event of [future, running]) {
    state.draws[event.id] = { id:`draw-${event.id}`,
      teams:ROSTER.slice(0, 4).map(player => ({ players:[player] })) };
    state.brackets[event.id] = makeBracket(4);
  }
  state.eventOps[future.id] = { bettingLockedAt:30 };
  state.eventOps[running.id] = { startedAt:10 };
  let view = controls(Board, state, { events:[future, running] });
  assert.match(view.html, /aria-label="Current event: In progress"/);
  assert.doesNotMatch(view.html, /aria-label="Future bracket: In progress"/);
  view.click("Open event");
  assert.deepEqual(view.opened, [running.id]);

  state.eventOps[running.id].resultEntryAt = 40;
  view = controls(Board, state, { events:[future, running] });
  assert.match(view.html, /aria-label="Current event: Awaiting result"/);

  delete state.eventOps[running.id].resultEntryAt;
  state.brackets[running.id].rounds[0][0].winner = 0;
  state.brackets[running.id].rounds[0][1].winner = 1;
  state.brackets[running.id].rounds[1][0].winner = 0;
  assert.match(controls(Board, state, { events:[future, running] }).html,
    /aria-label="Current event: Awaiting result"/);

  const futureOnly = controls(Board, state, { events:[future] });
  assert.doesNotMatch(futureOnly.html, /In progress|Awaiting result/);
  assert.match(futureOnly.html, /Next event/);
});

test("duels are unavailable before the weekend, while frozen, and throughout the poker finale", () => {
  const cases = [
    state => { state.live = false; },
    state => { state.frozen = true; },
    state => { state.poker = { id:"finale" }; },
    state => { state.poker = { id:"finale", startedAt:1 }; },
    state => { state.results.finale = { stacks:{ [me]:1000, [other]:1000 } }; },
  ];
  for (const mutate of cases) {
    const state = fresh(); mutate(state);
    const view = controls(PlayerSheet, state);
    assert.doesNotMatch(view.html, /Quick Draw challenge/);
    assert.ok(!view.buttons.some(button => button.name.startsWith("Challenge ")));
  }
  const signedOut = controls(PlayerSheet, fresh(), { me:null });
  assert.doesNotMatch(signedOut.html, /Quick Draw challenge/);
});

test("a duel ante accounts for both balances, reserved antes, duplicate pairs, and the daily limit", () => {
  const poorer = fresh();
  poorer.adjustments = [{ player:other, delta:-700 }];
  const limited = controls(PlayerSheet, poorer);
  assert.equal(limited.named("Ante 200 chips each").disabled, false);
  assert.equal(limited.named("Ante 500 chips each").disabled, true);

  const reserved = fresh();
  reserved.duels = [{ id:"reserved", status:"open", from:me, to:ROSTER[2], stake:1000, runs:{} }];
  assert.match(controls(PlayerSheet, reserved).html, /Not enough chips for an ante/);

  // Rule change: the card of someone you share a duel with carries that
  // duel's actual controls instead of a dead "already open" line.
  const duplicate = fresh();
  duplicate.duels = [{ id:"existing", status:"open", from:other, to:me, stake:100, runs:{} }];
  const shared = controls(PlayerSheet, duplicate, { onPlay:noop, onDecline:noop });
  assert.equal(shared.named(`Play Quick Draw with ${other}`).disabled, false);
  assert.equal(shared.named(`Decline duel with ${other}`).disabled, false);
  assert.ok(!shared.buttons.some(button => button.name.startsWith("Challenge ")));

  const daily = fresh();
  daily.duels = ROSTER.slice(2, 5).map((to, i) => ({
    id:`today-${i}`, status:"void", from:me, to, stake:100, ts:Date.now(),
  }));
  assert.match(controls(PlayerSheet, daily).html, /Daily limit of 3 challenges reached/);
});

test("a challenge waits for acknowledgment, rejects duplicate taps, and only closes on success", async () => {
  const sent = [], closed = [];
  let acknowledge;
  const view = controls(PlayerSheet, fresh(), {
    onDuel:stake => { sent.push(stake); return new Promise(resolve => { acknowledge = resolve; }); },
    onClose:() => closed.push(true),
  });
  const challenge = `Challenge ${other} for 100`;
  view.click(challenge);
  view.click(challenge);
  assert.deepEqual(sent, [100]);
  assert.deepEqual(closed, []);
  acknowledge({ ok:false, error:"The finale is live" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(closed, []);
  view.click(challenge);
  assert.deepEqual(sent, [100, 100]);
  acknowledge({ ok:true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(closed, [true]);
});

test("a rejected challenge promise leaves the card open and permits retry", async () => {
  let attempts = 0;
  const view = controls(PlayerSheet, fresh(), {
    onDuel:() => { attempts++; return Promise.reject(new Error("Offline")); },
  });
  view.click(`Challenge ${other} for 100`);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view.closed, []);
  view.click(`Challenge ${other} for 100`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.deepEqual(view.closed, []);
});

test("primary navigation retains Home and stable routes throughout the weekend", () => {
  for (const live of [false, true]) {
    const tabs = [];
    const view = controls(AppNavigation, fresh(), { tab:"bets", live, onTab:tab => tabs.push(tab) });
    const names = ["Home", "Events", "Bets", "Weekend"];
    for (const name of names) view.click(name);
    assert.deepEqual(tabs, ["board", "sched", "bets", "guide"]);
    assert.equal(view.named("Bets").current, "page");
    assert.equal(view.buttons.filter(button => button.current).length, 1);
  }
});

test("profile keeps check-in chip choices and drafts, while a live editor shows its locked design once", () => {
  const state = { ...fresh(), live:false };
  state.profiles[me] = { display:"Saved name", num:9, color:CHIP_COLORS[2].hex, skin:"wave", size:"L" };
  const original = structuredClone(state), claims = [];
  const props = { display:"Draft name", num:"42", photo:null, size:"XL", setDisplay:noop,
    setNum:noop, setPhoto:noop, setSize:noop, onChip:(color, skin) => claims.push([color, skin]) };
  const before = controls(ProfileEditor, state, props);
  assert.match(before.html, /value="Draft name"/);
  assert.match(before.html, /value="42"/);
  assert.equal(before.buttons.filter(button => /Claim chip color|Release selected chip color/.test(button.name)).length, CHIP_COLORS.length);
  assert.ok(before.buttons.some(button => button.name === "T-shirt size: XL"));
  before.click(before.buttons.find(button => button.name.startsWith("Claim chip color")).name);
  assert.equal(claims.length, 1);
  assert.deepEqual(state, original);
  const live = controls(ProfileEditor, { ...state, live:true }, props);
  assert.match(live.html, /value="Draft name"/);
  assert.match(live.html, /value="42"/);
  assert.match(live.html, /fd-profile-chip-locked/);
  assert.ok(!live.buttons.some(button => /Claim chip color|Release selected chip color|Chip pattern/.test(button.name)));
  assert.match(live.html, /<details class="fd-profile-preview"><summary>/);
  assert.deepEqual(state, original);
});

test("Weekend's back page opens House, Rules, Games and Payouts; the house keeps saved flights and their edit; check-in keeps the full venue", () => {
  const state = { ...fresh(), live:false, logistics:structuredClone(LOGISTICS) };
  state.profiles[me] = { flightIn:{ air:"UA", num:"1885", time:"13:20" }, flightOut:{ note:"Saved return plan" }, flightsBooked:true };
  const original = structuredClone(state), opened = [];
  const program = controls(Guide, state, { onProfile:() => opened.push("travel") });
  for (const tile of ["House", "Rules", "Games", "Payouts"]) program.named(tile);
  assert.doesNotMatch(program.html, /role="tab"/, "one scroll, no sub-tabs");
  const house = controls(HouseSheet, state, { onProfile:() => opened.push("travel"), onClose:noop });
  house.click("Edit your flights");
  assert.deepEqual(opened, ["travel"]);
  assert.match(house.html, /1885/);
  assert.match(house.html, /Saved return plan/);
  assert.ok(house.html.includes(LOGISTICS.venue));
  assert.ok(house.html.includes("airbnb-compound-field-day.webp"));
  assert.ok(!house.html.includes(LOGISTICS.hostIn.num), "the host's flight code stays out");
  const checkIn = controls(VenueCard, state, { lg:LOGISTICS });
  assert.ok(checkIn.html.includes("airbnb-compound-field-day.webp"));
  assert.ok(checkIn.html.includes(LOGISTICS.venue));
  assert.deepEqual(state, original);
});

test("an event row opens the event, draws its winners and your place as a picture, and prepared heats are not labelled live", () => {
  const state = fresh(), putt = BUILTIN_EVENTS.find(event => event.id === "putt"), heat = BUILTIN_EVENTS.find(event => event.id === "beerio");
  state.results[putt.id] = { ts:1, slots:[[other], [], []] };
  state.stages[heat.id] = { id:"prepared", kind:"heats", entrantType:"solo", advance:1,
    groups:[{ name:"Heat 1", entrants:ROSTER.slice(0, 6), through:[] }, { name:"Heat 2", entrants:ROSTER.slice(6), through:[] }], finalWinner:null };
  sessionArea.set("si-events-open", JSON.stringify({ fri:true }));
  const opened = [], view = controls(Schedule, state, { events:[putt, heat], open:event => opened.push(event.id) });
  sessionArea.clear();
  view.click(`${putt.name}. Complete. Open event`);
  assert.deepEqual(opened, [putt.id]);
  /* the row is one target: its winners are the result's picture, the sheet holds their cards */
  assert.ok(!view.buttons.some(button => button.name === `View ${other}'s player card`));
  assert.match(view.html, new RegExp(`aria-label="Won by ${other}"`));
  assert.match(view.html, /fd-events-row is-done/);
  assert.ok(view.html.includes(heat.name), "the prepared heats row renders");
  assert.doesNotMatch(view.html, /Heats live|Pools live/);
  assert.doesNotMatch(view.html, /of 2 complete/, "the lamps carry progress");
});

test("Events folds a finished session to one row and keeps the session in play and later ones open", () => {
  sessionArea.clear();
  const state = fresh(), events = BUILTIN_EVENTS.filter(event => !event.finale);
  const friday = events.filter(event => event.session === "fri");
  friday.forEach((event, index) => { state.results[event.id] = { ts:index + 1, slots:[[ROSTER[index]], [], []] }; });
  const [firstSam] = events.filter(event => event.session === "sam");
  state.results[firstSam.id] = { ts:9, slots:[[ROSTER[12]], [], []] };
  const row = event => `${event.name}.`;
  const folded = controls(Schedule, state, { events });
  const toggle = folded.named(`Friday Night, ${friday.length} played`);
  assert.match(folded.html, /aria-expanded="false"/);
  for (const event of friday) assert.ok(!folded.buttons.some(button => button.name.startsWith(row(event))), `${event.name} is folded`);
  for (const player of ROSTER.slice(0, friday.length))
    assert.ok(!folded.buttons.some(button => button.name === `View ${player}'s player card`), "folded winners are a picture, not targets");
  for (const event of events.filter(event => event.session !== "fri"))
    assert.ok(folded.buttons.some(button => button.name.startsWith(row(event))), `${event.name} stays visible`);
  assert.ok(!folded.buttons.some(button => /Saturday Morning,/.test(button.name)), "a session in play never folds");
  assert.match(folded.html, /Saturday Morning/);

  toggle.click();
  assert.deepEqual(JSON.parse(sessionArea.get("si-events-open")), { fri:true });
  const expanded = controls(Schedule, state, { events });
  assert.match(expanded.html, /aria-expanded="true"/);
  for (const event of friday) expanded.named(`${event.name}. Complete. Open event`);
  assert.match(expanded.html, new RegExp(`aria-label="Won by ${ROSTER[0]}"`));
  expanded.named(`Friday Night, ${friday.length} played`).click();
  assert.deepEqual(JSON.parse(sessionArea.get("si-events-open")), { fri:false });
  sessionArea.clear();

  /* with nothing left to play every session stays open */
  for (const event of events) state.results[event.id] ||= { ts:20, slots:[[other], [], []] };
  const finished = controls(Schedule, state, { events });
  assert.doesNotMatch(finished.html, /aria-expanded/);
  for (const event of events) finished.named(`${event.name}. Complete. Open event`);
});

test("every game's sheet is drawn: each step and note as a picture with at most four words, no prose", () => {
  const text = value => renderToStaticMarkup(React.createElement(React.Fragment, null, value));
  for (const [gameId, game] of Object.entries(GAMES)) {
    const variants = game.variants?.length ? game.variants : [{ id:undefined, howto:game.howto }];
    for (const variant of variants) {
      const howto = variant.howto;
      if (!howto) continue;
      const model = gameStepsModel(gameId, variant.id);
      assert.ok(model && model.steps.length >= 3 && model.steps.length <= 4, `${gameId}: three or four drawn steps`);
      const view = controls(HowToSheet, fresh(), { gameId, variant:variant.id });
      assert.ok(view.html.includes(text(game.name)));
      for (const item of [...model.steps, ...model.notes]) {
        assert.ok(item.words !== item.key, `${item.key}: has words`);
        assert.ok(item.words.split(/\s+/).length <= 4, `${item.key}: at most four words`);
        assert.ok(view.html.includes(text(item.words)), `${item.key}: shown`);
      }
      for (const prose of [howto.objective, ...(howto.steps || []), howto.win].filter(Boolean))
        assert.ok(!view.html.includes(text(prose)), `${gameId}: no prose`);
      assert.match(view.html, /class="fd-rules-pic"/);
    }
  }
});
