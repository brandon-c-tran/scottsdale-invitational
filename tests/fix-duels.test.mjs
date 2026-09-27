import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, DUEL_LAPSE_MS, allEventsOf, computeStandings, resolveCurrentContest, resolveDuel,
  resolveEventLifecycle, duelPhase, duelReserve, redactDuelsForViewer, maxRisk,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { HomeDuels } from "./src/features/home/HomeDuels.jsx";
    export { QuickDrawGame, reactionFor } from "./src/features/duels/QuickDraw.jsx";
    export { DuelDesk, duelDeskLine } from "./src/features/duels/DuelDesk.jsx";
    export { duelView, duelRecord } from "./src/features/duels/duelView.js";
    export { PlayerSheet } from "./src/features/profile/PlayerSheet.jsx";
    export { deriveHomeModel } from "./src/features/home/homeModel.js";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("fix-duels.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { HomeDuels, QuickDrawGame, reactionFor, DuelDesk, duelDeskLine, duelView, duelRecord,
  PlayerSheet, deriveHomeModel, PlayerIdentityProvider } = componentModule.exports;

const [evan, khoa, sahil, dan, eli] = ROSTER;
let serial = 0;
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:`host-${++serial}` });
const guest = (player, actionId) => ({ player, deviceId:`device-${player}`, actionId:actionId || `duel-${++serial}` });
const live = () => ({ ...structuredClone(EMPTY_STATE), live:true });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const fail = (s, type, payload, ctx, pattern) => {
  const before = structuredClone(s);
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should reject`);
  if (pattern) assert.match(result.error, pattern);
  assert.deepEqual(s, before, `${type} must not change state on rejection`);
  return result;
};
const challenge = (s, from, to, stake = 100, extra = {}) =>
  act(s, "sendDuel", { to, game:"quickdraw", stake, ...extra }, guest(from)).extra.id;
const duelOf = (s, id) => s.duels.find(d => d.id === id);
const pts = s => Object.fromEntries(computeStandings(s).map(row => [row.player, row.pts]));
const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");
function render(Component, props, profiles = {}) {
  const buttons = [];
  const createElement = React.createElement;
  React.createElement = (type, p, ...children) => {
    if (type === "button") buttons.push({ name:(p?.["aria-label"] || textOf(children)).trim(),
      disabled:!!p?.disabled, click:p?.onClick });
    return createElement(type, p, ...children);
  };
  let html;
  try {
    html = renderToStaticMarkup(createElement(PlayerIdentityProvider, { profiles }, createElement(Component, props)));
  } finally { React.createElement = createElement; }
  return { html, buttons, named:name => buttons.find(button => button.name === name) };
}

test("a challenge reserves only the challenger's ante until the recipient accepts", () => {
  const s = live();
  const id = challenge(s, evan, khoa, 500);
  const d = duelOf(s, id);
  assert.equal(d.consent, true);
  assert.equal(d.acceptedAt, null);
  assert.equal(duelPhase(d), "offered");
  assert.equal(duelReserve(s, evan), 500);
  assert.equal(duelReserve(s, khoa), 0, "no reservation without accept");
  fail(s, "playDuel", { id, ms:250 }, guest(evan), /Waiting for .* to accept/);
  fail(s, "playDuel", { id, ms:250 }, guest(khoa), /Accept the challenge first/);
  fail(s, "acceptDuel", { id }, guest(sahil), /Not your duel/);
  fail(s, "acceptDuel", { id }, guest(evan), /your challenge/);
  act(s, "acceptDuel", { id }, guest(khoa));
  assert.equal(duelPhase(d), "live");
  assert.equal(duelReserve(s, khoa), 500);
  assert.equal(act(s, "acceptDuel", { id }, guest(khoa)).extra.unchanged, true, "accept retry is acknowledged");
  act(s, "playDuel", { id, ms:210 }, guest(evan));
  act(s, "playDuel", { id, ms:300 }, guest(khoa));
  assert.deepEqual(resolveDuel(d), { settled:true, push:false, winner:evan, loser:khoa });
  assert.equal(pts(s)[evan], 1500);
  assert.equal(pts(s)[khoa], 500);
});

test("accept checks the recipient's cap and balance at that moment", () => {
  const s = live();
  const id = challenge(s, evan, khoa, 300);
  s.duels.push({ id:"legacy", from:khoa, to:sahil, stake:300, status:"open", runs:{}, ts:Date.now() });
  const result = fail(s, "acceptDuel", { id }, guest(khoa), /Max 500 at risk/);
  assert.ok(result);
  s.duels = s.duels.filter(d => d.id !== "legacy");
  s.adjustments.push({ id:"poor", player:khoa, delta:-800, reason:"test", ts:1 });
  fail(s, "acceptDuel", { id }, guest(khoa), /Not enough chips/);
  s.adjustments = [];
  act(s, "acceptDuel", { id }, guest(khoa));
});

test("decline is open until the recipient draws; withdraw only before acceptance", () => {
  const s = live();
  const a = challenge(s, evan, khoa);
  fail(s, "declineDuel", { id:a }, guest(evan), /Not your duel/);
  act(s, "declineDuel", { id:a }, guest(khoa));
  assert.equal(duelPhase(duelOf(s, a)), "declined");
  assert.equal(act(s, "declineDuel", { id:a }, guest(khoa)).extra.unchanged, true);
  assert.equal(duelReserve(s, evan), 0);

  const b = challenge(s, evan, khoa);
  act(s, "acceptDuel", { id:b }, guest(khoa));
  act(s, "playDuel", { id:b, ms:200 }, guest(evan));
  fail(s, "withdrawDuel", { id:b }, guest(evan), /already accepted/);
  act(s, "declineDuel", { id:b }, guest(khoa));
  assert.equal(duelReserve(s, evan), 0);
  assert.equal(duelReserve(s, khoa), 0);

  const c = challenge(s, evan, khoa);
  act(s, "acceptDuel", { id:c }, guest(khoa));
  act(s, "playDuel", { id:c, ms:200 }, guest(khoa));
  fail(s, "declineDuel", { id:c }, guest(khoa), /Already in play/);

  const s2 = live();
  const d = challenge(s2, evan, khoa);
  fail(s2, "withdrawDuel", { id:d }, guest(khoa), /Not your challenge/);
  act(s2, "withdrawDuel", { id:d }, guest(evan));
  assert.equal(duelPhase(duelOf(s2, d)), "withdrawn");
  assert.equal(act(s2, "withdrawDuel", { id:d }, guest(evan)).extra.unchanged, true);
  fail(s2, "acceptDuel", { id:d }, guest(khoa), /closed/);
  assert.equal(duelReserve(s2, evan), 0);
});

test("an open challenge goes to the first eligible taker", () => {
  const s = live();
  fail(s, "sendDuel", { open:true, to:khoa, stake:300 }, guest(evan), /no opponent/);
  const id = act(s, "sendDuel", { open:true, game:"quickdraw", stake:300 }, guest(evan)).extra.id;
  const d = duelOf(s, id);
  assert.equal(d.to, null);
  assert.equal(d.open, true);
  fail(s, "sendDuel", { open:true, stake:100 }, guest(evan), /already have an open challenge/);
  assert.equal(duelReserve(s, evan), 300);
  fail(s, "acceptDuel", { id }, guest(evan), /your challenge/);
  /* someone already in a duel with the challenger cannot take a second one */
  s.duels.push({ id:"pair", from:dan, to:evan, stake:100, status:"open", runs:{}, ts:Date.now() });
  fail(s, "acceptDuel", { id }, guest(dan), /already have a duel going/);
  act(s, "acceptDuel", { id }, guest(sahil));
  assert.equal(d.to, sahil);
  fail(s, "acceptDuel", { id }, guest(khoa), /Someone already took it/);
  assert.equal(act(s, "acceptDuel", { id }, guest(sahil)).extra.unchanged, true);
  act(s, "playDuel", { id, ms:200 }, guest(sahil));
  act(s, "playDuel", { id, foul:true }, guest(evan));
  assert.equal(resolveDuel(d).winner, sahil);
});

test("an unanswered challenge lapses without a timer and reserves nothing", () => {
  const s = live();
  const id = challenge(s, evan, khoa, 500);
  const d = duelOf(s, id);
  d.ts -= DUEL_LAPSE_MS;
  assert.equal(duelPhase(d), "lapsed");
  assert.equal(duelReserve(s, evan), 0);
  fail(s, "acceptDuel", { id }, guest(khoa), /lapsed/);
  fail(s, "playDuel", { id, ms:200 }, guest(evan), /accept/);
  /* the pair is free again and the lapsed offer does not use a daily slot */
  const next = challenge(s, evan, khoa, 500);
  assert.equal(duelPhase(duelOf(s, next)), "offered");
  act(s, "withdrawDuel", { id:next }, guest(evan));
  challenge(s, evan, sahil);
  challenge(s, evan, dan);
  challenge(s, evan, eli);
  fail(s, "sendDuel", { to:ROSTER[5], stake:100 }, guest(evan), /Three challenges a day/);
});

test("pokerSetup is never blocked by duels and voids the unplayed ones in the same write", () => {
  const s = live();
  const offered = challenge(s, evan, khoa);
  const half = challenge(s, sahil, dan);
  act(s, "acceptDuel", { id:half }, guest(dan));
  act(s, "playDuel", { id:half, ms:190 }, guest(sahil));
  const lapsed = challenge(s, eli, evan);
  duelOf(s, lapsed).ts -= DUEL_LAPSE_MS;
  const done = challenge(s, ROSTER[5], ROSTER[6]);
  act(s, "acceptDuel", { id:done }, guest(ROSTER[6]));
  act(s, "playDuel", { id:done, ms:180 }, guest(ROSTER[5]));
  act(s, "playDuel", { id:done, ms:260 }, guest(ROSTER[6]));
  const before = pts(s);
  const finale = allEventsOf(s).find(ev => ev.finale && ev.game === "poker");
  const lifecycle = resolveEventLifecycle(s, finale);
  assert.equal(lifecycle.nextAction.enabled, true);
  assert.ok(!lifecycle.blockers.some(line => /duel/i.test(line)));
  const setup = act(s, "pokerSetup", {});
  assert.equal(setup.extra.voidedDuels, 3);
  for (const id of [offered, half, lapsed]) {
    assert.equal(duelOf(s, id).status, "void");
    assert.equal(duelOf(s, id).voidReason, "finale");
  }
  assert.equal(duelPhase(duelOf(s, done)), "settled");
  assert.deepEqual(pts(s), before, "voiding moves no chips");
  assert.equal(pts(s)[ROSTER[5]], 1100);
});

test("the commissioner voids one duel or every open duel in one write", () => {
  const s = live();
  const a = challenge(s, evan, khoa);
  const b = challenge(s, sahil, dan);
  act(s, "acceptDuel", { id:b }, guest(dan));
  fail(s, "voidOpenDuels", {}, guest(evan), /Commissioner only/);
  act(s, "voidDuel", { id:a });
  assert.equal(act(s, "voidDuel", { id:a }).extra.unchanged, true);
  assert.equal(act(s, "voidOpenDuels", {}).extra.count, 1);
  assert.equal(duelOf(s, b).status, "void");
  assert.equal(act(s, "voidOpenDuels", {}).extra.unchanged, true);
});

test("retries acknowledge the same write; a different run never replaces the first", () => {
  const s = live();
  const ctx = guest(evan, "same-tap");
  const first = act(s, "sendDuel", { to:khoa, stake:200 }, ctx);
  const again = act(s, "sendDuel", { to:khoa, stake:200 }, ctx);
  assert.equal(again.extra.unchanged, true);
  assert.equal(again.extra.id, first.extra.id);
  assert.equal(s.duels.length, 1);
  const id = first.extra.id;
  act(s, "acceptDuel", { id }, guest(khoa));
  act(s, "playDuel", { id, ms:240 }, guest(khoa));
  assert.equal(act(s, "playDuel", { id, ms:240 }, guest(khoa)).extra.unchanged, true);
  fail(s, "playDuel", { id, ms:150 }, guest(khoa), /already drew/);
  fail(s, "playDuel", { id, ms:40 }, guest(evan), /Bad time/);
  assert.deepEqual(reactionFor(40), { ms:null, foul:true });
  assert.deepEqual(reactionFor(Number.NaN), { ms:null, foul:true });
  assert.deepEqual(reactionFor(212.4), { ms:212, foul:false });
  assert.deepEqual(reactionFor(9000), { ms:5000, foul:false });
});

test("duels stay closed before the weekend, while frozen, and once the finale is dealt", () => {
  const s = structuredClone(EMPTY_STATE);
  fail(s, "sendDuel", { to:khoa }, guest(evan), /weekend starts/);
  const frozen = { ...live(), frozen:true };
  fail(frozen, "sendDuel", { to:khoa }, guest(evan), /frozen/);
  const dealt = live();
  const id = challenge(dealt, evan, khoa);
  act(dealt, "pokerSetup", {});
  fail(dealt, "acceptDuel", { id }, guest(khoa), /poker table/);
  fail(dealt, "sendDuel", { to:khoa }, guest(evan), /poker table/);
});

test("undecided duels hide every other player's run from a viewer", () => {
  const duels = [
    { id:"half", from:evan, to:khoa, stake:100, status:"open", consent:true, acceptedAt:1,
      runs:{ [evan]:{ ms:190, foul:false, ts:2 } }, ts:1 },
    { id:"done", from:evan, to:sahil, stake:100, status:"open", runs:{ [evan]:{ ms:190 }, [sahil]:{ ms:220 } }, ts:1 },
    { id:"void", from:dan, to:evan, stake:100, status:"void", runs:{ [dan]:{ ms:170 } }, ts:1 },
  ];
  const original = structuredClone(duels);
  const forKhoa = redactDuelsForViewer(duels, khoa);
  assert.deepEqual(duels, original, "input is not mutated");
  assert.deepEqual(forKhoa[0].runs, { [evan]:{ played:true } });
  assert.equal(forKhoa[1], duels[1], "settled duels keep both times");
  assert.deepEqual(forKhoa[2].runs, { [dan]:{ played:true } });
  const forEvan = redactDuelsForViewer(duels, evan);
  assert.deepEqual(forEvan[0].runs[evan], duels[0].runs[evan]);
  assert.deepEqual(redactDuelsForViewer(duels, null)[0].runs, { [evan]:{ played:true } });
  assert.equal(redactDuelsForViewer(undefined, evan), undefined);
  assert.equal(resolveDuel(forKhoa[0]).settled, false);
});

test("the Quick Draw layer never shows the opponent's time before the duel settles", () => {
  const s = live();
  s.duels = [{ id:"d", from:evan, to:khoa, stake:300, status:"open", consent:true, acceptedAt:1,
    runs:{ [evan]:{ ms:187, foul:false, ts:2 } }, ts:Date.now() }];
  const intro = render(QuickDrawGame, { state:s, me:khoa, duel:s.duels[0], onSubmit:() => ({ ok:true }), onClose:() => {} });
  assert.match(intro.html, /has drawn/);
  assert.doesNotMatch(intro.html, /187/);
  assert.ok(intro.named("Ready"));
  const waiting = render(QuickDrawGame, { state:s, me:evan, duel:s.duels[0], onSubmit:() => ({ ok:true }), onClose:() => {} });
  assert.match(waiting.html, /187 ms/);
  assert.match(waiting.html, /Waiting on/);

  s.duels[0] = { ...s.duels[0], acceptedAt:null };
  const offer = render(QuickDrawGame, { state:s, me:khoa, duel:s.duels[0], onAccept:() => ({ ok:true }),
    onDecline:() => ({ ok:true }), onClose:() => {} });
  assert.ok(offer.named("Accept"));
  assert.ok(offer.named("Decline"));
  assert.ok(offer.named("Not now"));
  assert.ok(!offer.named("Ready"));
  s.duels[0] = { ...s.duels[0], runs:{} };
  const sent = render(QuickDrawGame, { state:s, me:evan, duel:s.duels[0], onWithdraw:() => ({ ok:true }), onClose:() => {} });
  assert.match(sent.html, /Waiting for .* to accept/);
  assert.ok(sent.named("Withdraw"));
  assert.ok(sent.named("Not now"));
});

test("Home lists your offers and open challenges you can take, with separate targets", async () => {
  const s = live();
  s.duels = [
    { id:"mine", from:khoa, to:evan, stake:200, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
    { id:"open", from:sahil, to:null, open:true, stake:300, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
    { id:"lapsed", from:dan, to:null, open:true, stake:300, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() - DUEL_LAPSE_MS },
    { id:"others", from:dan, to:eli, stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
  ];
  const accepted = [], viewed = [];
  const view = render(HomeDuels, { state:s, me:evan, gm:false, onPlayer:p => viewed.push(p), onPlay:() => {},
    onAccept:id => { accepted.push(id); return { ok:true }; }, onDecline:() => ({ ok:true }) });
  assert.equal((view.html.match(/<article /g) || []).length, 2);
  assert.match(view.html, /Challenged you/);
  assert.match(view.html, /Open challenge · 10 min/);
  view.named(`View ${sahil}'s player card`).click();
  assert.deepEqual(viewed, [sahil]);
  assert.deepEqual(accepted, []);
  assert.equal((await view.named(`Accept duel with ${sahil}`).click()).ok, true);
  assert.deepEqual(accepted, ["open"]);
  assert.ok(view.named(`Decline duel with ${khoa}`));
  assert.ok(!view.named(`Decline duel with ${sahil}`), "an open challenge is ignored, not declined");
  const sender = render(HomeDuels, { state:s, me:sahil, gm:false, onWithdraw:() => ({ ok:true }) });
  assert.match(sender.html, /Open to anyone/);
  assert.ok(sender.named("Withdraw open challenge"));
});

test("Home and Bets exposure count only accepted duels and your own waiting offer", () => {
  const s = live();
  s.duels = [
    { id:"offer-in", from:khoa, to:evan, stake:300, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
    { id:"offer-out", from:evan, to:sahil, stake:100, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
    { id:"accepted", from:dan, to:evan, stake:200, status:"open", consent:true, acceptedAt:Date.now(), runs:{}, ts:Date.now() },
    { id:"legacy", from:eli, to:evan, stake:100, status:"open", runs:{}, ts:1 },
  ];
  const home = deriveHomeModel({ state:s, me:evan, events:allEventsOf(s), standings:computeStandings(s) });
  assert.equal(home.standing.duelAntes, 400);
  assert.equal(duelReserve(s, khoa), 300);
  assert.equal(maxRisk(1000) - home.standing.duelAntes, 100);
});

test("a returning player sees settled results, void, and a rematch on the card", () => {
  const s = live();
  s.duels = [
    { id:"w", from:evan, to:sahil, stake:100, status:"open", consent:true, acceptedAt:1,
      runs:{ [evan]:{ ms:212, foul:false }, [sahil]:{ ms:305, foul:false } }, ts:3 },
    { id:"p", from:sahil, to:evan, stake:200, status:"open", runs:{ [evan]:{ foul:true, ms:null }, [sahil]:{ foul:true, ms:null } }, ts:2 },
    { id:"v", from:sahil, to:evan, stake:300, status:"void", consent:true, acceptedAt:1, runs:{ [sahil]:{ ms:150 } }, ts:1 },
    { id:"withdrawn", from:evan, to:sahil, stake:100, status:"withdrawn", consent:true, acceptedAt:null, runs:{}, ts:4 },
  ];
  const record = duelRecord(s, evan, sahil);
  assert.deepEqual([record.won, record.lost, record.net], [1, 0, 100]);
  assert.deepEqual(record.lines.map(line => line.outcome), ["won", "push", "void"]);
  const card = render(PlayerSheet, { state:s, me:evan, p:sahil, standings:computeStandings(s), events:allEventsOf(s),
    onClose:() => {}, onDuel:() => ({ ok:true }) });
  assert.match(card.html, new RegExp(`You vs ${sahil}`));
  assert.match(card.html, /1-0/);
  assert.match(card.html, /212 ms vs 305 ms/);
  assert.match(card.html, /Push/);
  assert.match(card.html, /Void/);
  assert.doesNotMatch(card.html, /150/, "a voided duel keeps its partial time hidden");
  assert.ok(card.named("Rematch for 100"));
  const own = render(PlayerSheet, { state:s, me:evan, p:evan, standings:computeStandings(s), events:allEventsOf(s),
    onClose:() => {}, onDuel:() => ({ ok:true }) });
  assert.match(own.html, /Your duels/);
  assert.match(own.html, new RegExp(`vs ${sahil}`));
});

test("the commissioner list names every open duel by real name", () => {
  const s = live();
  s.profiles[khoa] = { display:"Nickname" };
  s.duels = [
    { id:"a", from:evan, to:khoa, stake:200, status:"open", consent:true, acceptedAt:1, runs:{ [evan]:{ ms:200 } }, ts:Date.now() },
    { id:"b", from:sahil, to:null, open:true, stake:300, status:"open", consent:true, acceptedAt:null, runs:{}, ts:Date.now() },
    { id:"c", from:dan, to:eli, stake:100, status:"open", runs:{}, ts:1 },
    { id:"d", from:dan, to:evan, stake:100, status:"declined", runs:{}, ts:1 },
  ];
  assert.equal(duelDeskLine(s.duels[0]), `${evan} vs ${khoa}, 200, ${khoa} has not drawn`);
  assert.match(duelDeskLine(s.duels[1]), new RegExp(`${sahil} vs anyone, 300, not taken`));
  assert.equal(duelDeskLine(s.duels[2]), `${dan} vs ${eli}, 100, neither has drawn`);
  const voided = [];
  let all = 0;
  const desk = render(DuelDesk, { state:s, onVoid:id => { voided.push(id); return { ok:true }; },
    onVoidAll:() => { all++; return { ok:true }; } });
  assert.equal((desk.html.match(/<li /g) || []).length, 3);
  assert.doesNotMatch(desk.html, /Nickname/);
  assert.ok(desk.named("Void all open duels"));
  assert.ok(desk.named(`Void ${evan} vs ${khoa}`));
});

test("legacy duel records stay reserved on both sides, playable, and settle the same way", () => {
  const s = live();
  s.duels = [{ id:"old", from:evan, to:khoa, stake:300, status:"open", runs:{}, ts:1 }];
  const d = s.duels[0];
  assert.equal(duelPhase(d), "live");
  assert.equal(duelReserve(s, evan), 300);
  assert.equal(duelReserve(s, khoa), 300);
  const view = duelView(s, d, khoa);
  assert.equal(view.canPlay, true);
  assert.equal(view.canAccept, false);
  act(s, "playDuel", { id:"old", ms:400 }, guest(evan));
  act(s, "playDuel", { id:"old", ms:250 }, guest(khoa));
  assert.equal(resolveDuel(d).winner, khoa);
  assert.equal(pts(s)[khoa], 1300);
  assert.equal(pts(s)[evan], 700);
  assert.equal(computeStandings(s).find(row => row.player === khoa).duelNet, 300);
  fail(s, "withdrawDuel", { id:"old" }, guest(evan), /closed|accepted/);
});
