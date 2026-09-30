import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, contestUndoAvailability, resolveCurrentContest } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import {
  STACK_CAP, groupStacks, fitLevels, contestWinnerKey, decidedContest, decidedPayout, hoverRect, faceRect,
  rackTargetFor, orderStacks, STACK_TOWER, towerTiers, stackMaxHeight, stackGeometry,
} from "../src/features/wagers/betStacks.js";
import { legKeyframes, fly, MAX_HOLD_MS } from "../src/lib/motion.js";

/* M4 (chip flight), M5 (settle in place) and P1 (crowded sides). The
   geometry and settlement models are pure; the render checks run the real
   components, as the other UI suites do. */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { Wagers } from "./src/features/wagers/Wagers.jsx";
    export { BetStacks, FitStacks } from "./src/features/wagers/BetStacks.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const bundle = new Module(fileURLToPath(new URL("bets-motion.cjs", import.meta.url)));
bundle.filename = bundle.id;
bundle.paths = Module._nodeModulePaths(root);
bundle._compile(compiled.outputFiles[0].text, bundle.filename);
const { Wagers, BetStacks, FitStacks, PlayerIdentityProvider } = bundle.exports;

let seq = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"gm-device", actionId:`bm-${++seq}` });
const as = player => ({ player, deviceId:`d-${player}`, actionId:`bm-${++seq}` });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const evOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const current = state => resolveCurrentContest(state, evOf(state, "8ball"));
const ref = contest => ({ contestId:contest.id, contestRevision:contest.revision });
function bet(state, player, sideIndex, stake) {
  const contest = current(state);
  const side = contest.sides[sideIndex];
  act(state, "placeWager", { wager:{ eventId:"8ball", ...ref(contest), stake, pickPlayers:[...side.players],
    kind:"match", drawId:contest.drawId, match:[...contest.match], matchName:contest.label, teamIdx:side.key, pickTeam:true } }, as(player));
}
function liveMatch() {
  const state = structuredClone(EMPTY_STATE);
  ROSTER.forEach(player => act(state, "adjust", { player, delta:1500, reason:"Test" }));
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) });
  const contest = current(state);
  const bystanders = ROSTER.filter(p => !contest.players.includes(p));
  return { state, contest, bystanders };
}
const stacksOf = n => orderStacks(Array.from({ length:n }, (_, i) => ({ player:ROSTER[i], stake:(n - i) * 100 })));

test("P1: a crowded side keeps its biggest stacks and folds the smallest into one +N group", () => {
  const twelve = stacksOf(12);
  assert.deepEqual(groupStacks(twelve).rest, null, "no limit, no group");
  assert.equal(groupStacks(twelve, 12).rest, null, "exactly the room shows everyone");
  const { shown, rest } = groupStacks(twelve, 6);
  assert.equal(shown.length, 5, "the group takes the last slot");
  assert.deepEqual(shown.map(item => item.stake), [1200, 1100, 1000, 900, 800]);
  assert.equal(rest.count, 7);
  assert.equal(rest.total, 700 + 600 + 500 + 400 + 300 + 200 + 100);
  assert.deepEqual(rest.players, twelve.slice(5).map(item => item.player), "each grouped bettor keeps their identity");
  assert.equal(shown.length + rest.count, 12, "nobody drops off the side");
});

test("P1: the fit ladder shrinks chips first, then groups one more bettor at a time", () => {
  const levels = fitLevels(9, { chip:64, cap:STACK_CAP, min:34 });
  const sizes = levels.filter(level => level.slots === Infinity);
  assert.equal(sizes[0].size, 64);
  assert.ok(sizes.every((level, i) => i === 0 || level.size < sizes[i - 1].size), "sizes only step down");
  assert.ok(levels.every(level => level.size >= 34), "never below the legible minimum");
  assert.ok(levels.every(level => level.cap >= 5 && level.cap <= STACK_CAP));
  const grouped = levels.filter(level => level.slots !== Infinity);
  assert.equal(grouped[0].slots, 8);
  assert.equal(grouped.at(-1).slots, 2);
  assert.ok(grouped.every((level, i) => i === 0 || level.slots <= grouped[i - 1].slots), "grouping only grows");
  assert.equal(fitLevels(1, { chip:48 }).filter(level => level.slots !== Infinity).length, 0, "one bettor never groups");
});

test("P1: the TV felt and the phone board render every bettor or a +N group, the total apart", () => {
  const stacks = stacksOf(12);
  const felt = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:{} },
    React.createElement(FitStacks, { stacks, total:7800, totalClass:"tv-side-total", chip:64, names:p => p })));
  assert.match(felt, /fd-fit-total tv-side-total[^>]*>7,800</, "the total is its own element, never under a stack");
  assert.equal((felt.match(/data-stack-player=/g) || []).length, 12, "before measuring, everyone stands");
  const grouped = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:{} },
    React.createElement(BetStacks, { stacks, slots:4, names:p => p })));
  assert.equal((grouped.match(/data-stack-player=/g) || []).length, 3);
  assert.match(grouped, /aria-label="9 more: 4,500 chips"/);
  assert.match(grouped, />\+9</);

  const { state, bystanders } = liveMatch();
  bystanders.slice(0, 8).forEach((player, i) => bet(state, player, 0, 100 * (i + 1)));
  const me = bystanders[8];
  const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
      wagerEv:evOf(state, "8ball"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {} })));
  assert.equal((html.match(/class="fd-wagers-other"/g) || []).length, 4, "two rows on a phone: the well and four stacks");
  assert.match(html, /aria-label="4 more: 1,000 chips"/, "the four smallest fold into one pile");
  /* one value line under every stack and under the "+N" stack; nothing is
     stamped above a stack, so no felt grows to make room for it */
  const values = [...html.matchAll(/class="fd-stacks-value">([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(values, ["800", "700", "600", "500", "1,000"]);
  assert.match(html, /data-chip-value="\+4"/, "the group is drawn as a stack with +N on its face");
  assert.doesNotMatch(html, /fd-stack-tag|has-tag|fd-stack-fan/);
});

test("P1: your own stack keeps its biggest-first place and never folds into the group", () => {
  const { state, bystanders } = liveMatch();
  bystanders.slice(0, 8).forEach((player, i) => bet(state, player, 0, 100 * (i + 1)));
  const render = me => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
      wagerEv:evOf(state, "8ball"), onEvents() {}, onEvent() {}, onPick() {}, onRetract() {}, onPlayer() {} })));
  const order = html => [...html.matchAll(/data-stack-player="([^"]+)"/g)].map(match => match[1]);
  /* the 700 bettor sees the same order a spectator sees, ringed in place */
  const spectator = order(render(bystanders[8])), second = order(render(bystanders[6]));
  assert.deepEqual(second, spectator);
  /* the 100 bettor would fold into the group; their stack takes the last slot instead */
  const smallest = render(bystanders[0]);
  assert.deepEqual(order(smallest), [bystanders[7], bystanders[6], bystanders[5], bystanders[0]]);
  assert.match(smallest, /Retract your last chip on/);
  assert.match(smallest, /aria-label="4 more: 1,400 chips"/);
});

test("one cap everywhere: past it a stack stands a tower on a break, so 1,000, 1,200 and 2,500 differ", () => {
  assert.equal(towerTiers(10), 0);
  assert.equal(towerTiers(12), 1);
  assert.equal(towerTiers(20), 1);
  assert.equal(towerTiers(25), STACK_TOWER);
  assert.equal(towerTiers(80), STACK_TOWER, "the tower never grows past its reserve");
  const drawn = stake => {
    const html = renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:{} },
      React.createElement(BetStacks, { stacks:[{ player:ROSTER[0], stake }], size:28 })));
    return Number(html.match(/data-stack-chips="(\d+)"/)[1]);
  };
  assert.deepEqual([1000, 1200, 2500].map(drawn), [STACK_CAP, STACK_CAP + 1, STACK_CAP + 2]);
  assert.ok(stackMaxHeight(28) > stackGeometry(28, STACK_CAP + STACK_TOWER).height, "the break is part of the reserve");
  /* a fitted board never shortens the cap to make a stack fit */
  assert.ok(fitLevels(12, { chip:64, min:34 }).every(level => level.cap === STACK_CAP));
});

test("M4: a waiting chip hovers over the stack, lands on its face, and flies home to its own rack slot", () => {
  const anchor = { left:100, top:200, width:28, height:40 };
  assert.deepEqual(hoverRect(anchor, 28, 10), { left:100, top:162, width:28, height:28 });
  assert.equal(hoverRect(null, 28), null, "no anchor, no flight");
  assert.deepEqual(faceRect({ left:10, top:50, width:30, height:60 }), { left:10, top:44, width:30, height:30 });
  const denoms = [100, 200, 500, 1000];
  assert.equal(rackTargetFor(500, denoms, 100), "bets:rack:500");
  assert.equal(rackTargetFor(300, denoms, 200), "bets:rack:200", "an odd legacy chip goes to the selected slot");
  /* the second leg starts where the first ended and lands exactly on the target */
  const base = { left:0, top:0, width:46, height:46 }, hover = { left:100, top:100, width:28, height:28 };
  const target = { left:100, top:140, width:28, height:28 };
  const frames = legKeyframes(base, hover, target, { fade:true });
  assert.match(frames[0].transform, /translate\(91\.00px, 91\.00px\) scale\(0\.6087\)/);
  assert.match(frames.at(-1).transform, /translate\(91\.00px, 131\.00px\) scale\(0\.6087\)/);
  assert.equal(frames.at(-1).opacity, 0);
  assert.equal(frames[0].opacity, 1);
  assert.ok(MAX_HOLD_MS >= 10000, "a hover outlives any real write timeout");
});

test("M4: with no screen a flight is skipped and never blocks the write it decorates", async () => {
  let released = false;
  const hold = new Promise(resolve => setTimeout(() => { released = true; resolve(null); }, 5));
  assert.equal(await fly({ left:0, top:0, width:10, height:10 }, { left:5, top:5, width:10, height:10 }, { hold }), false);
  assert.equal(released, false, "fly returned before the hold settled");
});

test("M4: the pending guard still admits one write at a time; flights ride along", () => {
  const { state, bystanders } = liveMatch();
  const me = bystanders[0];
  const picks = [];
  let clicks = [];
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button" && props?.onClick && /^Place a chip on/.test(props["aria-label"] || "")) clicks.push(props.onClick);
    return createElement(type, props, ...children);
  };
  try {
    renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
      createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
        wagerEv:evOf(state, "8ball"), onEvents() {}, onEvent() {}, onRetract() {}, onPlayer() {},
        onPick:pick => { picks.push(pick); return new Promise(() => {}); } })));
  } finally { React.createElement = createElement; }
  assert.equal(clicks.length, 2);
  clicks[0](); clicks[0](); clicks[0]();
  assert.equal(picks.length, 1, "a second tap waits for the first write, as before");
  assert.equal(picks[0].stake, 100);
});

test("roulette taps: + tapped while a chip saves queues behind it, one write at a time; a failure drops the rest", async () => {
  const run = async outcome => {
    const { state, bystanders } = liveMatch();
    const me = bystanders[0];
    const picks = [], resolvers = [];
    let clicks = [];
    const createElement = React.createElement;
    React.createElement = (type, props, ...children) => {
      if (type === "button" && props?.onClick && /^Place a chip on/.test(props["aria-label"] || "")) clicks.push(props.onClick);
      return createElement(type, props, ...children);
    };
    try {
      renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles:state.profiles },
        createElement(Wagers, { state, me, events:allEventsOf(state), standings:computeStandings(state), gm:false,
          wagerEv:evOf(state, "8ball"), onEvents() {}, onEvent() {}, onRetract() {}, onPlayer() {},
          onPick:pick => { picks.push(pick); return new Promise(resolve => resolvers.push(resolve)); } })));
    } finally { React.createElement = createElement; }
    for (let i = 0; i < 7; i++) clicks[0]();
    assert.equal(picks.length, 1, "only one write is in flight");
    const settle = async () => { resolvers.at(-1)(outcome); await new Promise(resolve => setTimeout(resolve, 0)); };
    for (let i = 0; i < 6 && resolvers.length > picks.length - 1 && picks.length === resolvers.length; i++) {
      const before = picks.length;
      await settle();
      if (picks.length === before) break;
    }
    return picks.length;
  };
  assert.equal(await run({ ok:true }), 5, "the first write and four queued taps all land, in order");
  assert.equal(await run({ ok:false, error:"Over your limit" }), 1, "a refused chip clears the queue");
});

test("M5: a decided contest is read from the record: winner, settled stacks, payouts", () => {
  const { state, bystanders } = liveMatch();
  const [a, b, c] = bystanders;
  bet(state, a, 0, 300); bet(state, b, 0, 200); bet(state, c, 1, 400);
  const decided0 = current(state);
  assert.equal(decidedContest(state, allEventsOf(state), "8ball", decided0), null, "open: nothing to settle");
  act(state, "lockAndStart", { evId:"8ball", ...ref(decided0) });
  act(state, "recordContestWinner", { evId:"8ball", ...ref(current(state)), winner:decided0.sides[0].key });
  assert.notEqual(current(state).id, decided0.id, "the next contest opened in the same write");
  assert.equal(contestWinnerKey(state, "8ball", decided0), decided0.sides[0].key);
  const view = decidedContest(state, allEventsOf(state), "8ball", decided0);
  const [won, lost] = view.sides;
  assert.equal(won.won, true);
  assert.equal(lost.won, false);
  assert.deepEqual(won.stacks.map(item => [item.player, item.stake, item.paid]), [[a, 300, 300], [b, 200, 200]]);
  assert.deepEqual(lost.stacks.map(item => [item.player, item.stake, item.status]), [[c, 400, "lost"]]);
  assert.equal(view.paid, 500);
  assert.equal(view.lost, 400);
  assert.equal(decidedPayout(view, a), 600, "stake back plus 1:1");
  assert.equal(decidedPayout(view, c), 0);
  /* Undo rewinds the record: the hold has nothing left to show */
  const undo = contestUndoAvailability(state, evOf(state, "8ball"));
  act(state, "undoLastContest", { evId:"8ball", contestId:undo.contestId, contestRevision:undo.contestRevision });
  assert.equal(decidedContest(state, allEventsOf(state), "8ball", decided0), null);
});
