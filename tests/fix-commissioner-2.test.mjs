import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest, resolveWager, resolveEventLifecycle,
  resultAwards, awardPlan, contestUndoAvailability, contestCorrectionAvailability, contestCorrections, correctionText,
  refundText, announcementTakeBack, lockerRoomAvailability, pokerSetupPreview, postCountRulingApplies,
} from "../shared/core.js";
import { resolveDirector, championIdentity } from "../shared/show.js";
import { applyAction as rawApply } from "../worker/actions.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { Tournament } from "../worker/tournament.js";

let serial = 0;
const fresh = (order = []) => ({ ...structuredClone(EMPTY_STATE), eventOrder:order });
const eventOf = (s, id) => allEventsOf(s).find(ev => ev.id === id);
const current = (s, id) => resolveCurrentContest(s, eventOf(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = (showControl = false) => ({ isGm:true, player:"Brandon", deviceId:"host", actionId:`fc2-${++serial}`, showControl });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`g2-${++serial}` });
const act = (s, type, payload = {}, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (s, type, payload, pattern, ctx = gm(), apply = applyAction) => {
  const before = structuredClone(s);
  const result = apply(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  if (pattern) assert.match(result.error, pattern);
  assert.deepEqual(s, before, `${type} must not mutate when refused`);
  return result;
};
const chip = (s, id, key, stake = 100) => {
  const c = current(s, id), ev = eventOf(s, id), side = c.sides.find(item => item.key === key);
  const common = { eventId:id, evName:ev.name, stake, ...refs(c) };
  if (c.kind === "ffa") return c.drawId ? { ...common, kind:"outright", pickTeam:true, pickPlayers:side.players, drawId:c.drawId }
    : { ...common, kind:"outright", pick:key };
  if (c.kind === "match") return { ...common, kind:"match", match:c.match, teamIdx:key, drawId:c.drawId };
  return { ...common, kind:c.kind === "heat" ? "heat" : "stage", stagesId:c.stagesId, drawId:c.drawId,
    group:c.group, final:c.kind === "stage-final", pickKey:key };
};
const bet = (s, id, player, key, stake = 100) => act(s, "placeWager", { wager:chip(s, id, key, stake) }, guest(player));
const pts = s => Object.fromEntries(computeStandings(s).map(r => [r.player, r.pts]));
const status = (s, w) => resolveWager(s, w, allEventsOf(s)).status;
const startPlay = (s, id, ctx = gm()) => act(s, "lockAndStart", { evId:id, ...refs(current(s, id)) }, ctx);
const record = (s, id, key) => act(s, "recordContestWinner", { evId:id, ...refs(current(s, id)), winner:key });
const runFfa = (s, id, slots, ctx = gm()) => {
  if (!s.onDeck) act(s, "announceEvent", { evId:id }, ctx);
  startPlay(s, id, ctx);
  act(s, "beginResultEntry", { evId:id }, ctx);
  return act(s, "saveResult", { evId:id, slots }, ctx);
};
const director = (s, showControl = true) => resolveDirector(s, allEventsOf(s), { showControl });

/* ── C3: the first game-opening write confirms that it starts the weekend ── */
test("C3: opening the first game before the weekend is live needs startWeekend, and names the event", () => {
  const s = fresh(["putt", "8ball"]);
  for (const [type, payload] of [["announceEvent", { evId:"putt" }], ["setOnDeck", { id:"putt" }],
    ["announceAndDraw", { evId:"8ball" }]]) {
    const refused = refuse(s, type, payload, /^Starts the weekend$/, gm(), rawApply);
    assert.equal(refused.extra.needsStartConfirm, true);
    assert.equal(refused.extra.event, eventOf(s, payload.evId || payload.id).name);
  }
  /* an invalid write reports its own error, not the confirmation */
  refuse({ ...s, frozen:true }, "announceEvent", { evId:"putt" }, /frozen/, gm(), rawApply);
  refuse(s, "announceEvent", { evId:"putt" }, /Commissioner only/, guest("Evan"), rawApply);
  const opened = rawApply(s, "announceEvent", { evId:"putt", startWeekend:true }, gm());
  assert.equal(opened.ok, true);
  assert.equal(s.live, true);
  /* once live, no confirmation is asked */
  act(s, "setOnDeck", { id:null, ...refs(current(s, "putt")) });
  assert.equal(rawApply(s, "lockAndStart", { evId:"putt", ...refs(current(s, "putt")) }, gm()).ok, true);
});

test("C3: the weekend goes back to the locker room only while nothing has been played or bet", () => {
  const s = fresh(["putt", "nine"]);
  act(s, "announceEvent", { evId:"putt" });
  assert.equal(lockerRoomAvailability(s).enabled, true);
  const back = act(s, "returnToLockerRoom");
  assert.deepEqual(back.extra.reset, ["Long Putt"]);
  assert.equal(s.live, false);
  assert.equal(s.onDeck, null);
  assert.equal(s.eventOps.putt.contest, undefined);
  assert.equal(resolveEventLifecycle(s, eventOf(s, "putt")).phase, "setup");
  assert.equal(act(s, "returnToLockerRoom").extra.unchanged, true);

  act(s, "announceEvent", { evId:"putt" });
  bet(s, "putt", "Evan", "Khoa");
  refuse(s, "returnToLockerRoom", {}, /Bets have been placed/);
  const started = fresh(["putt"]);
  act(started, "announceEvent", { evId:"putt" });
  startPlay(started, "putt");
  refuse(started, "returnToLockerRoom", {}, /Long Putt has started/);
  const dueled = fresh(["putt"]); dueled.live = true;
  act(dueled, "sendDuel", { to:"Khoa", stake:100 }, guest("Evan"));
  refuse(dueled, "returnToLockerRoom", {}, /Duels/);
  refuse(fresh(), "returnToLockerRoom", {}, /Commissioner only/, guest("Evan"));
});

/* ── C2 and C9: any recorded contest can be corrected ── */
function playedBracket() {
  const s = fresh(["8ball"]); s.live = true;
  act(s, "announceAndDraw", { evId:"8ball" });
  const crew = s.draws["8ball"].roles[0].player;
  const pi1 = current(s, "8ball");
  bet(s, "8ball", crew, pi1.sides[0].key);
  startPlay(s, "8ball");
  record(s, "8ball", pi1.sides[0].key);
  const pi2 = current(s, "8ball");
  bet(s, "8ball", crew, pi2.sides[0].key);
  startPlay(s, "8ball");
  record(s, "8ball", pi2.sides[0].key);
  const next = current(s, "8ball");
  bet(s, "8ball", crew, next.sides[1].key);
  return { s, crew, pi1, pi2, next };
}

test("C2: an earlier bracket winner is corrected by rewinding every contest recorded after it", () => {
  const { s, crew, pi1, pi2, next } = playedBracket();
  const [w1, w2, w3] = [...s.wagers].reverse();
  assert.deepEqual([status(s, w1), status(s, w2), status(s, w3)], ["won", "won", "pending"]);
  const options = contestCorrections(s, eventOf(s, "8ball"));
  assert.deepEqual(options.map(option => option.label), ["Correct Play-in 2", "Correct Play-in 1"]);
  const available = contestCorrectionAvailability(s, eventOf(s, "8ball"), pi1.id);
  assert.equal(available.enabled, true);
  assert.deepEqual(available.rewinds, ["Play-in 2"]);
  assert.deepEqual(available.refunds, [{ player:crew, stake:200 }]);
  assert.equal(correctionText(s, available), `Rewinds Play-in 2. Returns ${crew} 200.`);

  /* a stale revision and an unknown contest are refused without change */
  refuse(s, "correctContest", { evId:"8ball", contestId:pi1.id, contestRevision:available.contestRevision - 1 }, /Contest changed/);
  refuse(s, "correctContest", { evId:"8ball", contestId:"match:nope", contestRevision:available.contestRevision }, /Contest changed/);
  /* the quick undo only takes the most recent contest */
  refuse(s, "undoLastContest", { evId:"8ball", contestId:pi1.id, contestRevision:available.contestRevision }, /Contest changed/);

  const corrected = act(s, "correctContest", { evId:"8ball", contestId:pi1.id, contestRevision:available.contestRevision });
  assert.deepEqual(corrected.extra.rewinds, ["Play-in 2"]);
  assert.deepEqual(corrected.extra.refunds, [{ player:crew, stake:200 }]);
  const now = current(s, "8ball");
  assert.equal(now.id, pi1.id);
  assert.equal(now.phase, "in-progress");
  assert.ok(now.revision > available.contestRevision);
  assert.equal(s.onDeck, null, "betting stays locked");
  assert.equal(s.brackets["8ball"].rounds[0][1].winner, null, "Play-in 2 is rewound");
  assert.deepEqual([status(s, w1), status(s, w2), status(s, w3)], ["pending", "void", "void"]);
  assert.equal(s.eventOps["8ball"].contestStack.length, 0);
  assert.equal(s.eventOps["8ball"].lastContest, undefined);
  assert.equal(s.eventOps["8ball"].corrections.at(-1).type, "correct-contest");
  assert.equal(next.label.startsWith("Semifinal"), true);

  /* the corrected winner settles the restored ticket, then play continues */
  record(s, "8ball", pi1.sides[1].key);
  assert.equal(status(s, w1), "lost");
  assert.equal(current(s, "8ball").id, pi2.id);
  assert.equal(current(s, "8ball").phase, "betting-open");

  /* a retry of the same correction is acknowledged, never applied twice */
  const ctx = gm();
  const again = playedBracket();
  const ref = { evId:"8ball", contestId:again.pi1.id, contestRevision:contestCorrectionAvailability(again.s, eventOf(again.s, "8ball"), again.pi1.id).contestRevision };
  act(again.s, "correctContest", ref, ctx);
  const snapshot = structuredClone(again.s);
  assert.equal(act(again.s, "correctContest", ref, ctx).extra.unchanged, true);
  assert.deepEqual(again.s, snapshot);
});

test("C2: heats rewind their qualifiers, and a legacy lastContest-only record stays correctable", () => {
  const s = fresh(["pingpong"]); s.live = true;
  act(s, "announceAndDraw", { evId:"pingpong" });
  const heat1 = current(s, "pingpong");
  startPlay(s, "pingpong");
  record(s, "pingpong", heat1.sides[0].key);
  startPlay(s, "pingpong");
  const heat2 = current(s, "pingpong");
  record(s, "pingpong", heat2.sides[0].key);
  const ev = eventOf(s, "pingpong");
  const available = contestCorrectionAvailability(s, ev, heat1.id);
  assert.equal(available.label, "Correct Heat 1");
  act(s, "correctContest", { evId:"pingpong", contestId:heat1.id, contestRevision:available.contestRevision });
  assert.deepEqual(s.stages.pingpong.groups.slice(0, 2).map(g => [g.winner, g.through]), [[null, []], [null, []]]);
  assert.equal(current(s, "pingpong").id, heat1.id);

  const legacy = fresh(["pingpong"]); legacy.live = true;
  act(legacy, "announceAndDraw", { evId:"pingpong" });
  startPlay(legacy, "pingpong");
  record(legacy, "pingpong", current(legacy, "pingpong").sides[0].key);
  delete legacy.eventOps.pingpong.contestStack;
  const undo = contestUndoAvailability(legacy, eventOf(legacy, "pingpong"));
  assert.equal(undo.enabled, true);
  act(legacy, "undoLastContest", { evId:"pingpong", contestId:undo.contestId, contestRevision:undo.contestRevision });
  assert.equal(legacy.stages.pingpong.groups[0].winner, null);
});

test("C9: the correction confirm and its ack name the duels exposure enforcement voids", () => {
  const s = fresh(["8ball"]); s.live = true;
  act(s, "announceAndDraw", { evId:"8ball" });
  const c = current(s, "8ball");
  const spectator = s.draws["8ball"].roles[0].player;
  bet(s, "8ball", spectator, c.sides[0].key, 500);
  startPlay(s, "8ball");
  record(s, "8ball", c.sides[0].key);
  const d = act(s, "sendDuel", { to:"Ben", stake:500 }, guest(spectator));
  act(s, "acceptDuel", { id:d.extra.id }, guest("Ben"));
  s.duels[0].acceptedAt += 1000;
  const ev = eventOf(s, "8ball");
  const undo = contestUndoAvailability(s, ev);
  assert.deepEqual(undo.voidDuels.map(item => item.id), [d.extra.id]);
  const expected = `Voids ${spectator} vs Ben duel.`;
  assert.equal(correctionText(s, undo), expected);
  const before = structuredClone(s);
  contestCorrections(s, ev);
  assert.deepEqual(s, before, "the preview never mutates");
  const done = act(s, "undoLastContest", { evId:"8ball", contestId:undo.contestId, contestRevision:undo.contestRevision });
  assert.equal(correctionText(s, done.extra), expected);
  assert.equal(s.duels[0].status, "void");
});

test("C2: the contest panel offers each recorded contest by name and confirms what the correction moves", async () => {
  const { s, crew, pi1 } = playedBracket();
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compiled = buildSync({
    stdin:{ contents:`export { ContestPanel } from "./src/features/weekend/ContestPanel.jsx";
      export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL("fix-commissioner-2-panel.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  const { ContestPanel, PlayerIdentityProvider } = mod.exports;
  const calls = [];
  const render = select => {
    const buttons = new Map(), create = React.createElement;
    let clicked = false;
    React.createElement = (type, props, ...children) => {
      if (type === "button") {
        const name = String(props?.["aria-label"] || [children].flat(Infinity).filter(x => typeof x === "string").join("")).trim();
        buttons.set(name, props);
        if (select && name === select && !clicked) { clicked = true; props.onClick(); }
      }
      return create(type, props, ...children);
    };
    let html;
    try {
      html = renderToStaticMarkup(create(PlayerIdentityProvider, { profiles:s.profiles }, create(ContestPanel, {
        state:s, ev:eventOf(s, "8ball"), me:"Brandon", gm:true, onPlayer:() => {}, onLock:() => ({ ok:true }),
        onWinner:() => ({ ok:true }), onResult:() => {},
        onUndo:reference => { calls.push(reference); return applyAction(s, "correctContest", { evId:"8ball", ...reference }, gm()); },
      })));
    } finally { React.createElement = create; }
    return { html, buttons };
  };
  const view = render();
  /* every recorded contest by name, newest first (commissioner flow: "Fix") */
  assert.ok(view.buttons.has("Fix Play-in 2"));
  assert.ok(view.buttons.has("Fix Play-in 1"));
  const confirm = render("Fix Play-in 1");
  assert.match(confirm.html, new RegExp(`Rewinds Play-in 2\\. Returns ${crew} 200\\.`));
  assert.equal(calls.length, 0, "opening the confirm changes nothing");
});

/* ── C4: swap in ── */
test("C4: a player swapped in gets back chips they had on the other side", () => {
  const s = fresh(["8ball"]); s.live = true;
  act(s, "announceAndDraw", { evId:"8ball" });
  const c = current(s, "8ball");
  const crew = s.draws["8ball"].roles[0].player;
  bet(s, "8ball", crew, c.sides[1].key, 300);
  const out = c.sides[0].players[0];
  const swapped = act(s, "swapPlayer", { evId:"8ball", out, into:crew });
  assert.deepEqual(swapped.extra.refunds, [{ player:crew, stake:300 }]);
  assert.equal(s.wagers[0].status, "void");
  assert.match(s.wagers[0].voidReason, /swapped in/);
  /* chips on their own new side stay */
  const t = fresh(["8ball"]); t.live = true;
  act(t, "announceAndDraw", { evId:"8ball" });
  const ct = current(t, "8ball"), crewT = t.draws["8ball"].roles[0].player;
  bet(t, "8ball", crewT, ct.sides[0].key, 300);
  assert.deepEqual(act(t, "swapPlayer", { evId:"8ball", out:ct.sides[0].players[0], into:crewT }).extra.refunds, []);
  assert.equal(status(t, t.wagers[0]), "pending");
});

/* ── C5: away during an open free-for-all ── */
test("C5: marking a side of an open FFA away returns its backers' chips and moves the revision", () => {
  const s = fresh(["putt"]); s.live = true;
  act(s, "announceEvent", { evId:"putt" });
  bet(s, "putt", "Evan", "Khoa", 200);
  bet(s, "putt", "Khoa", "Adi", 100);
  const before = current(s, "putt").revision;
  const away = act(s, "setAway", { player:"Khoa", away:true });
  assert.deepEqual(away.extra.refunds, [{ player:"Evan", stake:200 }]);
  assert.equal(s.wagers.find(w => w.player === "Evan").status, "void");
  assert.equal(status(s, s.wagers.find(w => w.player === "Khoa")), "pending", "their own chips are untouched");
  assert.ok(current(s, "putt").revision > before);
  assert.equal(current(s, "putt").sides.some(side => side.key === "Khoa"), false);
  const back = act(s, "setAway", { player:"Khoa", away:false });
  assert.deepEqual(back.extra.refunds, []);
});

/* ── C6: post-count rulings follow their count ── */
test("C6: a post-count ruling applies only to the count revision it was made on", () => {
  const s = fresh(["poker"]); s.live = true;
  act(s, "pokerSetup"); act(s, "pokerStart");
  ROSTER.forEach((p, i) => act(s, "pokerCount", { player:p, count:i === 0 ? 1025 : i === 1 ? 975 : 1000 }, guest(p)));
  act(s, "pokerResult", { noScene:true });
  act(s, "adjust", { player:ROSTER[1], delta:25, reason:"Miscount" });
  assert.equal(pts(s)[ROSTER[1]], 1000);
  act(s, "clearResult", { evId:"poker", confirmClear:true, correctionReason:"Recount" });
  act(s, "pokerCount", { player:ROSTER[1], count:1000 });
  act(s, "pokerCount", { player:ROSTER[0], count:1000 });
  act(s, "pokerResult", { noScene:true });
  assert.equal(pts(s)[ROSTER[1]], 1000, "the recount already holds the fix; the old ruling does not add it twice");
  const old = s.adjustments[0];
  assert.equal(postCountRulingApplies(old, s.results.poker), false);
  act(s, "adjust", { player:ROSTER[1], delta:50, reason:"Found chips" });
  assert.equal(s.adjustments[0].pokerRevision, 2);
  assert.equal(pts(s)[ROSTER[1]], 1050);
});

/* ── C7: crew pay what a 3rd-place player gets ── */
test("C7: crew earn the split 3rd share when a bracket splits 3rd, else the 3rd-place award", () => {
  const s = fresh(["pickleball"]); s.live = true;
  act(s, "announceAndDraw", { evId:"pickleball" });
  const ev = eventOf(s, "pickleball"), teams = s.draws.pickleball.teams, crew = s.draws.pickleball.roles[0].player;
  assert.deepEqual(awardPlan(ev, s.draws.pickleball).find(row => row.place === "crew").pts, 200);
  const split = resultAwards(s, ev, { slots:[teams[0].players, teams[1].players, [...teams[2].players, ...teams[3].players]] });
  assert.equal(split.find(a => a.player === crew).pts, 200);
  const single = resultAwards(s, ev, { slots:[teams[0].players, teams[1].players, teams[2].players] });
  assert.equal(single.find(a => a.player === crew).pts, 400);
  const volley = fresh(["volley"]); volley.live = true;
  act(volley, "announceAndDraw", { evId:"volley" });
  const vteams = volley.draws.volley.teams, vcrew = volley.draws.volley.roles[0].player;
  assert.equal(resultAwards(volley, eventOf(volley, "volley"), { slots:[vteams[0].players, vteams[1].players] })
    .find(a => a.player === vcrew).pts, 400);
});

/* ── C8: take back an announcement; skip and restore ── */
test("C8: a mis-announced event is taken back to unannounced with its chips returned", () => {
  const s = fresh(["putt", "nine"]); s.live = true;
  act(s, "announceEvent", { evId:"nine" });
  bet(s, "nine", "Evan", "Khoa", 200);
  act(s, "setOnDeck", { id:null, ...refs(current(s, "nine")) });
  assert.deepEqual(announcementTakeBack(s, eventOf(s, "nine")).refunds, [{ player:"Evan", stake:200 }]);
  const back = act(s, "takeBackAnnouncement", { evId:"nine" });
  assert.equal(refundText(s, back.extra.refunds), "Returns Evan 200");
  assert.equal(s.onDeck, null);
  assert.equal(s.wagers[0].status, "void");
  for (const key of ["contest", "bettingOpenedAt", "bettingLockedAt"]) assert.equal(s.eventOps.nine[key], undefined, key);
  assert.equal(resolveEventLifecycle(s, eventOf(s, "nine")).phase, "setup");
  assert.equal(act(s, "takeBackAnnouncement", { evId:"nine" }).extra.unchanged, true);
  act(s, "announceEvent", { evId:"putt" });
  startPlay(s, "putt");
  refuse(s, "takeBackAnnouncement", { evId:"putt" }, /already started/);
});

test("C8: restoring a skipped event that never started brings it back unannounced, chips returned", () => {
  const s = fresh(["putt", "nine", "8ball"]); s.live = true;
  act(s, "announceEvent", { evId:"putt" });
  bet(s, "putt", "Evan", "Khoa", 200);
  act(s, "shelve", { id:"putt", on:true, confirmReturn:true });
  runFfa(s, "nine", [["Evan"], ["Adi"], ["Ben"]]);
  const restored = act(s, "shelve", { id:"putt", on:false });
  assert.deepEqual(restored.extra.refunds, [{ player:"Evan", stake:200 }]);
  assert.equal(s.wagers.find(w => w.eventId === "putt").status, "void");
  assert.equal(resolveEventLifecycle(s, eventOf(s, "putt")).phase, "setup");
  refuse(s, "placeWager", { wager:chip(s, "putt", "Adi") }, /closed/, guest("Ben"));
  assert.equal(act(s, "announceAndDraw", { evId:"8ball" }).ok, true, "nothing phantom blocks the next event");
});

/* ── C1, C13, C14: the director's ceremony beats ── */
test("C13: the event intro is one step, so announce goes straight to lock and start", () => {
  const s = fresh(["putt"]); s.live = true;
  act(s, "announceEvent", { evId:"putt" }, gm(true));
  assert.equal(s.showControl.active.kind, "event-intro");
  assert.equal(director(s).nextAction.type, "lock-start");
  startPlay(s, "putt", gm(true));
  assert.equal(s.showControl.active, null);
  assert.equal(s.showControl.history[0].outcome, "completed");
});

test("C14: a result correction is one Replay beat with a Skip beside it", () => {
  const s = fresh(["putt", "nine"]); s.live = true;
  runFfa(s, "putt", [["Evan"]], gm(true));
  act(s, "advanceShowScene", { id:s.showControl.active.id }, gm(true));
  act(s, "saveResult", { evId:"putt", slots:[["Khoa"]], confirmOverwrite:true, correctionReason:"Wrong" }, gm(true));
  const beat = director(s);
  assert.equal(beat.nextAction.type, "replay-winner-scene");
  assert.equal(beat.nextAction.label, "Replay winner");
  assert.equal(beat.nextAction.subject, "Long Putt");
  assert.deepEqual([beat.secondary.type, beat.secondary.label], ["skip-replay", "Skip"]);
  const staleId = s.showControl.active.id;
  act(s, "replayWinnerScene", { eventId:"putt" }, gm(true));
  assert.deepEqual([s.showControl.history[0].id, s.showControl.history[0].outcome], [staleId, "cancelled"]);
  assert.equal(s.showControl.active.revision, 2);
  assert.notEqual(director(s).nextAction?.type, "replay-winner-scene");

  /* Skip settles the debt without playing it, and clears the stale scene */
  act(s, "saveResult", { evId:"putt", slots:[["Adi"]], confirmOverwrite:true, correctionReason:"Again" }, gm(true));
  act(s, "skipWinnerReplay", { eventId:"putt" }, gm(true));
  assert.equal(s.showControl.active, null);
  assert.deepEqual([s.showControl.history[0].outcome, s.showControl.history[0].revision], ["skipped", 3]);
  assert.equal(director(s).nextAction.type, "announce", "the next official beat is back");
  refuse(s, "replayWinnerScene", { eventId:"putt" }, /unavailable/, gm(false));
});

test("C1: crowning retires a finished scene and starts the champion scene in the same write", () => {
  const s = fresh(["putt"]); s.live = true;
  runFfa(s, "putt", [["Evan"]], gm(true));
  act(s, "advanceShowScene", { id:s.showControl.active.id }, gm(true));
  assert.equal(s.showControl.active.step, 1, "the winner scene sits on its last step");
  const crowned = act(s, "setFrozen", { f:true }, gm(true));
  assert.ok(crowned.extra.sceneId);
  assert.equal(s.showControl.history[0].kind, "winner");
  assert.equal(s.showControl.history[0].outcome, "completed");
  assert.equal(s.showControl.active.kind, "champion");
  assert.deepEqual(s.showControl.active.champion, ["Evan"]);
  assert.notEqual(director(s).nextAction?.type, "start-champion-scene", "the champion is not owed twice");
  assert.equal(act(s, "setFrozen", { f:true }, gm(true)).extra.unchanged, true);

  /* a re-crown with a different champion owes the room a new scene */
  act(s, "endShowScene", { id:s.showControl.active.id, outcome:"skipped" }, gm(true));
  act(s, "setFrozen", { f:false }, gm(false));
  act(s, "adjust", { player:"Khoa", delta:1000, reason:"Ruling" });
  act(s, "setFrozen", { f:true }, gm(false));
  assert.deepEqual(championIdentity(s), ["Khoa"]);
  assert.equal(director(s).nextAction.type, "start-champion-scene");
  act(s, "startShowScene", { kind:"champion" }, gm(true));
  assert.deepEqual(s.showControl.active.champion, ["Khoa"]);
  assert.notEqual(director(s).nextAction?.type, "start-champion-scene");
  /* legacy champion records without an identity count as played */
  const legacy = structuredClone(s);
  legacy.showControl.active = null;
  legacy.showControl.history = [{ id:"old", kind:"champion", outcome:"completed" }];
  assert.notEqual(director(legacy).nextAction?.type, "start-champion-scene");
  /* crowning never fails because of the scene */
  const bare = fresh(); bare.live = true;
  assert.equal(act(bare, "setFrozen", { f:true }, gm(false)).extra, undefined);
});

/* ── C10: the frame says whether the connection is the commissioner ── */
test("C10: every state frame carries gm, and a revoked phone is told at once", async () => {
  const entries = new Map(), sockets = [];
  const context = {
    blockConcurrencyWhile() {},
    getWebSockets() { return sockets; },
    storage:{
      async get(key) { return entries.get(key); },
      async put(key, value) {
        if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
        else entries.set(key, structuredClone(value));
      },
      async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
      async list({ prefix = "" } = {}) { return new Map([...entries].filter(([key]) => key.startsWith(prefix))); },
    },
  };
  const tournament = new Tournament(context, { GM_PIN:"unit-test-pin", APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  const socket = () => {
    let attachment = null;
    const ws = { frames:[], send(frame) { this.frames.push(JSON.parse(frame)); },
      serializeAttachment(value) { attachment = structuredClone(value); }, deserializeAttachment() { return attachment; } };
    sockets.push(ws);
    return ws;
  };
  const say = (ws, deviceId, type, payload = {}, gmToken = null) =>
    tournament.webSocketMessage(ws, JSON.stringify({ actionId:`c10-${++serial}`, type, payload, deviceId, gmToken }));
  const host = socket(), phone = socket();
  await say(host, "device-host-0001", "gmUnlock", { pin:"unit-test-pin" });
  const token = host.frames.at(-1).extra.gmToken;
  await say(host, "device-host-0001", "hello", { view:"app", nonce:1 }, token);
  await say(phone, "device-phone-0002", "hello", { view:"app", nonce:1 });
  assert.equal(host.frames.at(-1).gm, true);
  assert.equal(phone.frames.at(-1).gm, false);
  const id = await tournament.gmTokenId(token);
  await tournament.revokeGmToken(id);
  const last = host.frames.filter(frame => frame.type === "state").at(-1);
  assert.equal(last.gm, false);
});

/* ── C11 and C17: the finale preview, cancel, and the frozen guard ── */
test("C11: pokerSetupPreview is side-effect free and matches the deal; cancel restores the duels it voided", () => {
  const s = fresh(["poker"]); s.live = true;
  const duel = act(s, "sendDuel", { to:"Khoa", stake:100 }, guest("Evan")).extra.id;
  act(s, "setAway", { player:"Ben", away:true });
  act(s, "adjust", { player:"Adi", delta:-700, reason:"Rehearsal" });
  const before = structuredClone(s);
  const preview = pokerSetupPreview(s);
  assert.deepEqual(s, before);
  assert.equal(preview.ok, true);
  assert.equal(preview.seats.includes("Ben"), false);
  assert.deepEqual(preview.away, [{ player:"Ben", pts:1000 }]);
  assert.deepEqual(preview.rows.find(row => row.player === "Adi"), { player:"Adi", before:300, stack:600, grant:300,
    denominations:preview.rows.find(row => row.player === "Adi").denominations });
  assert.deepEqual(preview.voidDuels.map(item => [item.id, item.label]), [[duel, "Evan vs Khoa"]]);
  const setup = act(s, "pokerSetup");
  assert.equal(setup.extra.total, preview.total);
  assert.deepEqual(setup.extra.inventory, preview.inventory);
  assert.deepEqual(s.poker.voidedDuelIds, [duel]);
  assert.equal(s.duels[0].status, "void");
  const cancelled = act(s, "pokerCancel");
  assert.deepEqual(cancelled.extra.restoredDuels, [duel]);
  assert.equal(s.duels[0].status, "open");
  assert.equal(s.duels[0].voidReason, undefined);
  assert.equal(pts(s).Adi, 300, "the minimum grant went with the table");
});

test("C17: pokerSetup and pokerCancel refuse a frozen board", () => {
  const s = fresh(["poker"]); s.live = true;
  s.frozen = true;
  refuse(s, "pokerSetup", {}, /frozen/);
  s.frozen = false;
  act(s, "pokerSetup");
  act(s, "setFrozen", { f:true });
  refuse(s, "pokerCancel", {}, /frozen/);
});

/* ── C25: away players are never treated as dealt ── */
test("C25: the champion is the chip leader among the seats, even below an away player's carried total", () => {
  const s = fresh(["poker"]); s.live = true;
  act(s, "adjust", { player:"Ben", delta:5000, reason:"Rehearsal" });
  act(s, "setAway", { player:"Ben", away:true });
  act(s, "pokerSetup"); act(s, "pokerStart");
  const seats = s.poker.seats;
  assert.equal(seats.includes("Ben"), false);
  seats.forEach((p, i) => act(s, "pokerCount", { player:p, count:i === 0 ? 2000 : i === 1 ? 0 : 1000 }, guest(p)));
  act(s, "pokerResult", { noScene:true });
  assert.deepEqual(s.results.poker.seats, seats);
  const rows = computeStandings(s);
  assert.equal(rows[0].player, seats[0]);
  assert.equal(rows[0].rank, 1);
  const ben = rows.find(row => row.player === "Ben");
  assert.equal(ben.pts, 6000, "the away total carries");
  assert.ok(ben.rank > 1, "but never outranks the table");
  assert.deepEqual(rows.filter(row => row.rank === 1).map(row => row.player), [seats[0]]);
});

/* ── G20: duels refuse away players ── */
test("G20: sending or accepting a duel refuses a player who is away", () => {
  const s = fresh(); s.live = true;
  act(s, "setAway", { player:"Khoa", away:true });
  refuse(s, "sendDuel", { to:"Khoa", stake:100 }, /^Khoa is away$/, guest("Evan"));
  refuse(s, "sendDuel", { to:"Evan", stake:100 }, /^Khoa is away$/, guest("Khoa"));
  const open = act(s, "sendDuel", { open:true, stake:100 }, guest("Evan")).extra.id;
  refuse(s, "acceptDuel", { id:open }, /^Khoa is away$/, guest("Khoa"));
  const offer = act(s, "sendDuel", { to:"Adi", stake:100 }, guest("Ben")).extra.id;
  act(s, "setAway", { player:"Ben", away:true });
  refuse(s, "acceptDuel", { id:offer }, /^Ben is away$/, guest("Adi"));
});
