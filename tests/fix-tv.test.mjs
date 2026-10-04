import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_STATE, BUILTIN_EVENTS, ROSTER, EDITION, allEventsOf, computeStandings,
  resolveCurrentContest, pokerClock,
} from "../shared/core.js";
import { resolveShowScene, resolveDirector, retireFinishedShowScene } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { Tournament } from "../worker/tournament.js";
import {
  TV_INTRO_OVERLAY_MS, TV_SCENE_IDLE_MS, tvSceneView, ambientIndex, resultPresentation,
  resultMomentPhase, resultMomentFor, advanceMoment, tvCanvasFit, latestSettledDuel, tickerItems,
  cueCandidates, tvConnection, bracketStrip, nextOpenMatch, soleLeader, boardLevel,
} from "../src/features/tv/tvModel.js";
import { noteServerTime, serverOffset, resetServerClock } from "../src/features/tv/serverClock.js";

const root = fileURLToPath(new URL("../", import.meta.url));
let seq = 0;
const gm = (showControl = true) => ({ isGm:true, player:"Brandon", deviceId:"gm-device",
  actionId:`tv-${++seq}`, showControl });
const act = (state, type, payload = {}, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const ref = (state, evId) => {
  const ev = allEventsOf(state).find(item => item.id === evId);
  const contest = resolveCurrentContest(state, ev);
  return { contestId:contest.id, contestRevision:contest.revision };
};
const puttPosted = (showControl = true) => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" }, gm(showControl));
  act(state, "lockAndStart", { evId:"putt", ...ref(state, "putt") }, gm(showControl));
  act(state, "beginResultEntry", { evId:"putt" }, gm(showControl));
  act(state, "saveResult", { evId:"putt", slots:[["Evan"], ["Adi"], ["Khoa"]] }, gm(showControl));
  return state;
};

/* ── 1. a leftover scene never swallows the next reveal ── */
test("a draw, stage, or draft write retires a scene on its last step, not an earlier one", () => {
  const state = puttPosted();
  const events = allEventsOf(state);
  assert.equal(state.showControl.active.kind, "winner");
  /* step 0 still owes Continue: a draw leaves it alone */
  act(state, "runDraw", { evId:"pong", players:ROSTER.slice(0, 12) });
  assert.equal(state.showControl.active?.kind, "winner");
  act(state, "clearDraw", { evId:"pong" });
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  assert.equal(resolveShowScene(state, events).stepKey, "standings");
  /* the one-tap team announcement is exactly the write that used to leave
     the standings card sitting on the TV over the new reveal */
  act(state, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) });
  assert.equal(state.showControl.active, null);
  assert.equal(state.showControl.history[0].kind, "winner");
  assert.equal(state.showControl.history[0].outcome, "completed");
  assert.ok(state.draws.pong);
});

test("scene retirement is presentation only and skipped without Show Control", () => {
  const state = puttPosted();
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  const offState = structuredClone(state);
  act(offState, "runDraw", { evId:"pong", players:ROSTER.slice(0, 12) }, gm(false));
  assert.equal(offState.showControl.active?.kind, "winner");
  act(state, "startDraft", { evId:"volley", captains:ROSTER.slice(0, 4), players:ROSTER.slice(0, 12) });
  assert.equal(state.showControl.active, null);
  assert.equal(retireFinishedShowScene({ active:null, history:[] }), null);
});

/* ── 2/3. scenes no longer take over the TV ── */
test("the event intro is a timed overlay, then the live board; last steps idle back to ambient", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const scene = resolveShowScene(state, allEventsOf(state));
  const t0 = scene.active.startedAt;
  const intro = tvSceneView(scene, t0 + 500);
  assert.equal(intro.mode, "intro-overlay");
  assert.equal(intro.covers, true);
  assert.equal(intro.until, t0 + TV_INTRO_OVERLAY_MS);
  const after = tvSceneView(scene, t0 + TV_INTRO_OVERLAY_MS + 1);
  assert.deepEqual([after.mode, after.covers, after.ticker], ["live", false, true]);

  const posted = puttPosted();
  const winner = resolveShowScene(posted, allEventsOf(posted));
  assert.equal(tvSceneView(winner, winner.active.startedAt + 60 * 60000).covers, true,
    "an earlier step waits for the host");
  assert.equal(tvSceneView(winner, winner.active.startedAt).ticker, true);
  act(posted, "advanceShowScene", { id:posted.showControl.active.id });
  const last = resolveShowScene(posted, allEventsOf(posted));
  assert.equal(tvSceneView(last, last.active.updatedAt + 1000).covers, true);
  assert.equal(tvSceneView(last, last.active.updatedAt + TV_SCENE_IDLE_MS).mode, "ambient");
});

test("a stale scene never blocks the TV and the director still offers the replay", () => {
  const state = puttPosted();
  act(state, "saveResult", { evId:"putt", slots:[["Adi"], ["Evan"], ["Khoa"]],
    confirmOverwrite:true, correctionReason:"Scorecard fixed" });
  const events = allEventsOf(state);
  const scene = resolveShowScene(state, events);
  assert.equal(scene.staleReason, "The result was corrected");
  const view = tvSceneView(scene, Date.now());
  assert.equal(view.mode, "stale");
  assert.equal(view.covers, false);
  /* one beat (C14): the replay retires the stale scene in its own write */
  const beat = resolveDirector(state, events, { showControl:true }).nextAction;
  assert.equal(beat.type, "replay-winner-scene");
  assert.equal(beat.sceneId, scene.active.id);
});

/* ── 4. production result moment ── */
test("a result presentation splits every change into event award and bets, and names the new leader", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const contest = resolveCurrentContest(state, BUILTIN_EVENTS.find(e => e.id === "putt"));
  /* Adi's 100 at 2:1 plus 2nd place (200) ties Evan's 400 for 1st */
  const wager = { kind:"outright", eventId:"putt", stake:100, pick:"Evan",
    contestId:contest.id, contestRevision:contest.revision };
  const bet = applyAction(state, "placeWager", { wager }, { player:"Adi", deviceId:"adi", actionId:"w1" });
  assert.equal(bet.ok, true, bet.error);
  act(state, "lockAndStart", { evId:"putt", ...ref(state, "putt") });
  act(state, "beginResultEntry", { evId:"putt" });
  act(state, "saveResult", { evId:"putt", slots:[["Evan"], ["Adi"], ["Khoa"]] });
  const model = resultPresentation(state, allEventsOf(state), "putt");
  assert.equal(model.kind, "awards");
  assert.equal(model.rows.length, ROSTER.length);
  for (const row of model.rows) assert.equal(row.change, row.award + row.bets, row.player);
  const evan = model.rows.find(row => row.player === "Evan");
  const adi = model.rows.find(row => row.player === "Adi");
  assert.equal(evan.award, 400);
  assert.equal(adi.award, 200);
  assert.equal(adi.bets, 200);
  assert.equal(evan.rankAfter, 1);
  assert.deepEqual(model.revealOrder.map(item => item.place), [3, 2, 1]);
  assert.equal(model.leadChanged, true);
  assert.deepEqual(model.leader.players.sort(), ["Adi", "Evan"]);
  assert.equal(model.previousLeader, null);
});

test("the result moment sequence and its reduced-motion equivalent carry the same facts", () => {
  assert.deepEqual(resultMomentPhase(0, 100), { phase:"podium", revealed:1, sorted:false });
  /* the podium builds: 3rd at once, 2nd at 0.9 s, a held beat, 1st at 2.4 s */
  assert.equal(resultMomentPhase(0, 850).revealed, 1);
  assert.equal(resultMomentPhase(0, 950).revealed, 2);
  assert.equal(resultMomentPhase(0, 2350).revealed, 2);
  assert.equal(resultMomentPhase(0, 2450).revealed, 3);
  assert.deepEqual(resultMomentPhase(0, 100, { reducedMotion:true }), { phase:"podium", revealed:3, sorted:false });
  assert.deepEqual(resultMomentPhase(0, 7200), { phase:"standings", revealed:3, sorted:false });
  assert.equal(resultMomentPhase(0, 10200, { reducedMotion:true }).sorted, true);
  assert.equal(resultMomentPhase(0, 8600).sorted, true);
  /* directed scene: host-controlled steps */
  assert.equal(resultMomentPhase(0, 999999, { step:"winner" }).phase, "podium");
  assert.equal(resultMomentPhase(0, 10, { step:"standings" }).sorted, false);

  const state = puttPosted(false);
  const events = allEventsOf(state);
  const ts = state.results.putt.confirmedAt || state.results.putt.ts;
  assert.ok(resultMomentFor(state, events, ts + 5000, null, null));
  assert.equal(resultMomentFor(state, events, ts + 20001, null, null), null);
  const directed = puttPosted(true);
  const scene = resolveShowScene(directed, allEventsOf(directed));
  assert.equal(resultMomentFor(directed, allEventsOf(directed), ts + 1000,
    tvSceneView(scene, ts + 1000), scene), null, "the directed winner scene covers it");
});

test("poker results present official final stacks and the standings champion, never +0 each", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "pokerSetup");
  act(state, "pokerStart");
  ROSTER.forEach((p, i) => {
    if (i >= 10) act(state, "pokerBust", { player:p });
    else act(state, "pokerCount", { player:p, count:i === 0 ? 3000 : 1000 });
  });
  act(state, "pokerResult", { noScene:true });
  const model = resultPresentation(state, allEventsOf(state), "poker");
  assert.equal(model.kind, "stacks");
  assert.equal(model.podium[0].unit, "stack");
  assert.deepEqual(model.podium[0].players, [computeStandings(state)[0].player]);
  assert.equal(model.podium[0].amount, 3000);
  assert.equal(model.rows.filter(row => row.busted).length, 3);
});

/* ── 5/6/7. TV rendering ── */
const compiled = await build({
  stdin:{ contents:`export { TVMode, MAST_H, TICKER_H, SAFE_Y, frameBeads } from "./src/features/tv/TVMode.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
    resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const tvModule = new Module(fileURLToPath(new URL("fix-tv.cjs", import.meta.url)));
tvModule.filename = tvModule.id;
tvModule.paths = Module._nodeModulePaths(root);
tvModule._compile(compiled.outputFiles[0].text, tvModule.filename);
const { TVMode, PlayerIdentityProvider, MAST_H, TICKER_H, SAFE_Y, frameBeads } = tvModule.exports;

function renderTv(state, { now = Date.now(), showControl = true, connection = { ready:true, connected:true, version:3 } } = {}) {
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const allTied = standings[0].pts === standings[standings.length - 1].pts && !state.frozen;
  const onDeckEv = state.onDeck && !state.frozen ? events.find(e => e.id === state.onDeck && !state.results[e.id]) : null;
  const champion = state.frozen ? standings[0] : null;
  return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { state, events, standings, allTied, onDeckEv, champion,
      coChamps:state.frozen ? standings.filter(r => r.rank === 1) : [], showControlEnabled:showControl,
      connection, now, onExit:() => {} })));
}
const count = (html, needle) => html.split(needle).length - 1;

test("directed standings and the ambient board show all thirteen players", () => {
  const state = puttPosted();
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  act(state, "startShowScene", { kind:"standings" });
  const html = renderTv(state, { now:state.showControl.active.startedAt + 1000 });
  for (const p of ROSTER) assert.ok(html.includes(`>${p}<`), `${p} on the directed board`);
  const ambient = renderTv(puttPosted(false), { now:Date.now() + 60 * 60000, showControl:false });
  assert.ok(ambient.includes("tv-ticker"));
});

test("the TV canvas is fixed, labelled, edition-driven, and keeps the ticker under scenes but the champion", () => {
  const fit = tvCanvasFit(3840, 2160);
  assert.deepEqual(fit, { scale:2, left:0, top:0 });
  assert.deepEqual(tvCanvasFit(1920, 1200), { scale:1, left:0, top:60 });
  const state = puttPosted();
  const scene = state.showControl.active;
  const html = renderTv(state, { now:scene.startedAt + 500 });
  assert.match(html, /aria-label="Exit TV mode"[^>]*>Exit TV</);
  assert.ok(html.includes(EDITION.label));
  assert.ok(html.includes("tv-ticker"), "ticker under the winner scene");
  assert.ok(html.includes("tv-podium"));
  assert.ok(!html.includes("each</"), "a solo winner reads +400, not +400 each");
  const bare = html.replace(/<[^>]*>/g, " ");
  const hit = bare.match(/.{0,60}\b(points|PTS|pts)\b.{0,20}/);
  assert.equal(hit, null, `chips, never points: ${hit?.[0]}`);

  const frozen = puttPosted();
  act(frozen, "advanceShowScene", { id:frozen.showControl.active.id });
  act(frozen, "advanceShowScene", { id:frozen.showControl.active.id });
  act(frozen, "setFrozen", { f:true });
  /* crowning starts the champion scene; a board frozen without one gets it by hand */
  if (frozen.showControl.active?.kind !== "champion") act(frozen, "startShowScene", { kind:"champion" });
  const champ = renderTv(frozen, { now:frozen.showControl.active.startedAt + 1000 });
  assert.ok(champ.includes("tv-champ"));
  assert.ok(!champ.includes("tv-ticker"));
  assert.ok(!champ.includes("radial-gradient"));

  const css = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  /* the Exit control sits outside the scaled canvas, in viewport pixels */
  const canvasCss = css.replace(/\.tv-exit \{[^}]*\}/, "");
  const sizes = [...canvasCss.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 20 && sizes.every(size => size >= 24), `TV text sizes ${sizes.filter(s => s < 24)}`);
  /* flat, but for the glass's one hard reflection (DESIGN.md: a gradient
     exists only as material), defined once as --tv-sheen */
  const sheen = css.match(/--tv-sheen:[^;]*;/g) || [];
  assert.equal(sheen.length, 1, "one reflection token");
  /* tokens only: a gradient is the glass's own light (liquid glass), never a raw color */
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(css.replace(sheen[0], "")), "tokens only");
  const shell = readFileSync(new URL("../src/ui/shell.css", import.meta.url), "utf8");
  assert.ok(!shell.includes("si-glow"));
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(!app.includes("THE WEEKEND STARTS HERE"));
  assert.ok(!app.includes("SCOTTSDALE · 2026") && !app.includes("Scottsdale 2026"));
  assert.ok(!app.includes("10 is the chip quantum"));
});

test("the event intro overlays the live board for the intro's length only", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const t0 = state.showControl.active.startedAt;
  const during = renderTv(state, { now:t0 + 1000 });
  assert.ok(during.includes("tv-intro"));
  assert.ok(during.includes("tv-contest"), "the live board is already underneath");
  const after = renderTv(state, { now:t0 + TV_INTRO_OVERLAY_MS + 10 });
  assert.ok(!after.includes("tv-intro"));
  assert.ok(after.includes("tv-contest"));
  assert.ok(after.includes("tv-ticker"));
});

test("bracket play shows the current match large with a strip, then an advances moment", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) }, gm(false));
  act(state, "lockAndStart", { evId:"pong", ...ref(state, "pong") }, gm(false));
  const live = renderTv(state, { showControl:false });
  assert.ok(live.includes("is-up-now"));
  assert.ok(live.includes("tv-contest-head") && !live.includes("Up now · "), "the match by its name beside its lit lamp, no meta line");
  assert.ok(live.includes("tv-bracket"), "the drawn bracket under the match");
  assert.ok(!live.includes("tv-ondeck"), "the header does not repeat the board");
  const contest = resolveCurrentContest(state, BUILTIN_EVENTS.find(e => e.id === "pong"));
  act(state, "recordContestWinner", { evId:"pong", winner:contest.sides[0].key, ...ref(state, "pong") }, gm(false));
  const decidedAt = state.eventOps.pong.lastContest.decidedAt;
  const moment = advanceMoment(state, BUILTIN_EVENTS.find(e => e.id === "pong"), decidedAt + 1000);
  assert.equal(moment.verb, "Advance", "a pair takes the plural verb");
  assert.equal(advanceMoment(state, BUILTIN_EVENTS.find(e => e.id === "pong"), decidedAt + 5001), null);
  assert.ok(renderTv(state, { now:decidedAt + 1000, showControl:false }).includes("tv-advance"));
  const strip = bracketStrip(state, BUILTIN_EVENTS.find(e => e.id === "pong"), null);
  assert.ok(strip.some(round => round.matches.some(match => match.sides.some(side => side.won))));
  assert.ok(nextOpenMatch(state.brackets.pong));
});

/* Oct 2 (Backglass wave 2): the ticker says what the board does not: who is
   on deck after the match being played, never the live match itself */
test("ticker: on deck is the matchup after the current one; the live match is the board's", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) }, gm(false));
  const pong = BUILTIN_EVENTS.find(e => e.id === "pong");
  const now = nextOpenMatch(state.brackets.pong), deck = onDeckMatch(state.brackets.pong);
  assert.ok(now && deck && `${now.r}-${now.m}` !== `${deck.r}-${deck.m}`, "a different match");
  const items = tickerItems({ state, events:allEventsOf(state), standings:computeStandings(state), allTied:false,
    liveEv:pong, liveContest:resolveCurrentContest(state, pong), now:Date.now() });
  const onDeck = items.find(item => item.tag === "On deck");
  assert.ok(onDeck && onDeck.text.endsWith(deck.roundName), onDeck?.text);
  assert.ok(!items.some(item => item.tag === "Up now"), "the live match is on the board, not the ticker");
});

test("the TV separates loading from reconnecting with last-known data", () => {
  assert.equal(tvConnection({ ready:false }).mode, "loading");
  assert.equal(tvConnection({ ready:true, connected:false }).mode, "reconnecting");
  assert.equal(tvConnection({ ready:true, connected:true, status:"stale" }).mode, "reconnecting");
  assert.equal(tvConnection({ ready:true, connected:true }).mode, "live");
  const state = puttPosted(false);
  assert.ok(renderTv(state, { connection:{ ready:false } }).includes("Connecting"));
  const stale = renderTv(state, { connection:{ ready:true, connected:false, version:4 } });
  assert.ok(stale.includes("Reconnecting"));
  assert.ok(stale.includes("tv-ticker"), "last-known data stays up");
});

test("poker on the TV labels dealt stacks as starting chips and marks busts", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "pokerSetup");
  assert.ok(renderTv(state).includes("Starting chips"));
  act(state, "pokerStart");
  act(state, "pokerBust", { player:ROSTER[12] });
  const html = renderTv(state, { now:state.poker.startedAt + 1000 });
  /* at the table each seat shows the stack it was dealt, captioned once */
  assert.ok(html.includes("Stacks as dealt") && !html.includes("Starting chips"));
  assert.ok(html.includes("is-out"));
  assert.ok(!html.includes(">Standings<"));
});

/* ── 11. the blind clock ── */
test("the blind clock nudges fresh, pauses exactly, and never sticks at 0:00", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "pokerSetup");
  act(state, "pokerStart");
  const pk = state.poker;
  const start = pk.startedAt;
  assert.equal(pokerClock(pk, start + 16 * 60000).idx, 1, "levels still advance on their own");
  act(state, "pokerLevel", { delta:1 });
  const nudged = pokerClock(state.poker, state.poker.levelStartedAt + 1000);
  assert.equal(nudged.idx, 1);
  assert.equal(nudged.msLeft, 15 * 60000 - 1000, "the nudged level starts fresh");
  act(state, "pokerPause", { paused:true });
  const pausedAt = state.poker.pausedAt;
  const held = pokerClock(state.poker, pausedAt + 10 * 60000);
  assert.equal(held.paused, true);
  assert.equal(held.msLeft, pokerClock(state.poker, pausedAt).msLeft);
  assert.equal(applyAction(state, "pokerPause", { paused:true }, gm()).extra?.unchanged, true);
  act(state, "pokerPause", { paused:false });
  assert.equal(state.poker.pausedAt, null);
  const last = { ...state.poker, levelIdx:6, levelStartedAt:0, pausedAt:null };
  const end = pokerClock(last, 10 * 60 * 60000);
  assert.equal(end.last, true);
  assert.equal(end.final, true);
  /* legacy tables keep deriving from startedAt and offset */
  const legacy = { startedAt:1000, levels:state.poker.levels, levelOffset:-1 };
  const late = pokerClock(legacy, 1000 + 3 * 60 * 60000);
  assert.equal(late.idx, 5);
  assert.ok(late.msLeft > 0, "a shifted legacy level is never reported expired");
});

test("the server clock takes the least-delayed broadcast sample", () => {
  resetServerClock();
  noteServerTime(10_000, 9_000);
  noteServerTime(20_000, 19_400);
  assert.equal(serverOffset(), 1000);
  noteServerTime(Date.now() + 48 * 3600000);
  assert.equal(serverOffset(), 1000, "implausible samples are ignored");
  resetServerClock();
  const now = 1_000_000;
  assert.equal(ambientIndex(5, now), ambientIndex(5, now + 50), "two TVs a beat apart agree");
  assert.equal(ambientIndex(1, now), 0);
});

/* ── 12. ticker ── */
test("the ticker shows the most recently settled duel and formats rulings in chips", () => {
  const duels = [
    { id:"new", from:"Adi", to:"Evan", stake:100, status:"open", ts:5, runs:{ Adi:{ ms:300, ts:6 } } },
    { id:"late", from:"Khoa", to:"Brandon", stake:100, status:"open", ts:1,
      runs:{ Khoa:{ ms:250, ts:2 }, Brandon:{ ms:400, ts:90 } } },
    { id:"early", from:"Adi", to:"Khoa", stake:100, status:"open", ts:3,
      runs:{ Adi:{ ms:250, ts:4 }, Khoa:{ ms:400, ts:10 } } },
  ];
  assert.equal(latestSettledDuel(duels).d.id, "late");
  const state = structuredClone(EMPTY_STATE);
  state.duels = duels;
  state.adjustments = [{ id:"r", player:"Evan", delta:1200, reason:"Spirit", ts:1 }];
  const standings = computeStandings(state);
  const items = tickerItems({ state, events:allEventsOf(state), standings, allTied:false, now:Date.now() });
  assert.ok(items.some(item => item.tag === "Ruling" && item.text.includes("+1,200")));
  assert.ok(items.some(item => item.tag === "Duel" && item.text.startsWith("Khoa beat Brandon")));
  assert.ok(items.some(item => item.tag === "Leader" && item.parts.some(part => part.amount && part.role === "chip")));
});

/* ── 10. walkout cues ── */
test("cues are offered for the contest's players after lock-and-start and at the poker start", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"pong", players:ROSTER.slice(0, 12) }, gm(false));
  const pong = BUILTIN_EVENTS.find(e => e.id === "pong");
  assert.equal(cueCandidates(state, allEventsOf(state), { operationEvent:pong }).players.length, 0);
  act(state, "lockAndStart", { evId:"pong", ...ref(state, "pong") }, gm(false));
  const cues = cueCandidates(state, allEventsOf(state), { operationEvent:pong });
  assert.equal(cues.reason, "contest");
  assert.deepEqual(cues.players.sort(), resolveCurrentContest(state, pong).players.sort());
  assert.equal(cueCandidates(state, allEventsOf(state), { operationEvent:pong,
    now:Date.now() + 10 * 60000 }).players.length, 0, "only right after the start");

  const poker = structuredClone(EMPTY_STATE);
  act(poker, "pokerSetup");
  act(poker, "pokerStart");
  assert.equal(cueCandidates(poker, allEventsOf(poker), {}).players.length, ROSTER.length);
});

const memoryContext = () => {
  const entries = new Map();
  return { entries, context:{ blockConcurrencyWhile() {}, storage:{
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix))); },
  } } };
};
const spotifyTournament = () => {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { APP_ENV:"staging", M2_AUDIO_CATALOG_ENABLED:"true",
    M2_AUDIO_PLAYBACK_ENABLED:"true", SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret" });
  tournament.state = structuredClone(EMPTY_STATE);
  tournament.claims = {};
  tournament.gmToken = "gm";
  return { tournament, memory };
};
const call = (tournament, path, body) => {
  const request = new Request(`https://staging.example/api/spotify/${path}`, {
    method:body ? "POST" : "GET", headers:{ Authorization:"Bearer gm", "Content-Type":"application/json" },
    ...(body ? { body:JSON.stringify(body) } : {}) });
  return tournament.handleSpotify(request, new URL(request.url));
};
const withFetch = async (handler, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await run(); } finally { globalThis.fetch = original; }
};
const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status });

test("cues always target the saved speaker and transfer playback once when nothing is active", async () => {
  const { tournament, memory } = spotifyTournament();
  memory.entries.set("private:spotify:session", { accessToken:"a", refreshToken:"r", expiresAt:Date.now() + 3600000,
    account:{ id:"b", displayName:"Brandon", product:"free" } });
  const saved = await (await call(tournament, "device", { deviceId:"speaker-1", name:"Living room" })).json();
  assert.deepEqual(saved.device, { id:"speaker-1", name:"Living room" });
  const calls = [];
  let plays = 0;
  const response = await withFetch(async (url, init) => {
    calls.push(`${init.method || "GET"} ${String(url).replace("https://api.spotify.com/v1", "")}`);
    if (String(url).includes("/me/player/play")) {
      plays += 1;
      return plays === 1 ? json(404, { error:{ status:404, message:"Player command failed: No active device found",
        reason:"NO_ACTIVE_DEVICE" } }) : json(204, null);
    }
    return json(204, null);
  }, () => call(tournament, "play", { uri:"spotify:track:1234567890123456789012" }));
  assert.equal((await response.json()).ok, true);
  assert.deepEqual(calls, [
    "PUT /me/player/play?device_id=speaker-1",
    "PUT /me/player",
    "PUT /me/player/play?device_id=speaker-1",
  ]);
  const status = await (await call(tournament, "status")).json();
  assert.equal(status.device.id, "speaker-1");
  assert.equal(status.premium, false, "a non-Premium account is flagged");
});

test("a revoked grant reports reconnect, never connected, and concurrent refreshes share one request", async () => {
  const { tournament, memory } = spotifyTournament();
  memory.entries.set("private:spotify:session", { accessToken:"old", refreshToken:"r", expiresAt:0,
    account:{ product:"premium" } });
  let tokenCalls = 0;
  await withFetch(async url => {
    if (String(url).includes("/api/token")) {
      tokenCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      return json(200, { access_token:"new", expires_in:3600 });
    }
    return json(200, { devices:[], is_playing:false });
  }, () => Promise.all([call(tournament, "player"), call(tournament, "player")]));
  assert.equal(tokenCalls, 1);

  memory.entries.set("private:spotify:session", { accessToken:"old", refreshToken:"r", expiresAt:0,
    account:{ product:"premium" } });
  const failed = await withFetch(async () => json(400, { error:"invalid_grant", error_description:"Refresh token revoked" }),
    () => call(tournament, "play", { uri:"spotify:track:1234567890123456789012" }));
  const body = await failed.json();
  assert.equal(body.code, "reauthorize");
  assert.equal(body.error, "Spotify signed out. Reconnect in Speaker");
  const status = await (await call(tournament, "status")).json();
  assert.equal(status.connected, false);
  assert.equal(status.reconnect, true);
  assert.equal(status.error, "Spotify signed out. Reconnect in Speaker");
});

/* ── TV repair pass (T1-T22) ── */
import { resolveWeekendOperation, resolveSlot } from "../shared/core.js";
import {
  tvLiveEvent, nextUpEvent, latestResultOf, correctionMoment, dockCard, tvBusy, tickerPage, TICKER_ROLES,
  onDeckMatch, biggestSwing,
  tickerRuling, pokerTableRows, contestRiders, championView, readableInk, weekendProgress, stackRace, duelBoard,
  spotlightPlayer, decidedWinner, TV_CORRECTION_MS, TV_LEAD_CHANGE_MS,
} from "../src/features/tv/tvModel.js";
import { buildEventReveal } from "../src/features/weekend/drawReveal.js";

/* writes in one test land in the same millisecond otherwise; ordering
   checks need a clock that moves */
const movingClock = () => {
  const original = Date.now;
  let t = 1_800_000_000_000;
  Date.now = () => (t += 10);
  return () => { Date.now = original; };
};
const evOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const playBracket = (state, evId) => {
  act(state, "announceAndDraw", { evId, players:ROSTER.slice(0, 12) }, gm(false));
  for (let k = 0; k < 20; k++) {
    const contest = resolveCurrentContest(state, evOf(state, evId));
    if (!contest || contest.kind === "ffa") break;
    if (contest.phase === "betting-open") act(state, "lockAndStart", { evId, ...ref(state, evId) }, gm(false));
    act(state, "recordContestWinner", { evId, winner:contest.sides[0].key, ...ref(state, evId) }, gm(false));
  }
};
const bracketSlots = (state, evId) => {
  const br = state.brackets[evId], teams = state.draws[evId].teams;
  const loser = match => [resolveSlot(br, match.a), resolveSlot(br, match.b)].find(key => key !== match.winner);
  const fin = br.rounds[br.rounds.length - 1][0];
  const semis = br.rounds[br.rounds.length - 2] || [];
  return [[...teams[fin.winner].players], [...teams[loser(fin)].players], semis.flatMap(m => teams[loser(m)].players)];
};

test("T1: a skipped event is never live, and nobody's instruction appears under its name", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) }, gm(false));
  act(state, "shelve", { id:"8ball", on:true, confirmReturn:true }, gm(false));
  const events = allEventsOf(state);
  const operation = resolveWeekendOperation(state, events);
  assert.equal(tvLiveEvent(state, events, operation.event), null);
  const html = renderTv(state, { showControl:false });
  assert.ok(!html.includes("tv-live-name"), "no live board for a shelved event");
  assert.ok(!/Choose players|Open betting|Post the|Lock bets/.test(html.replace(/<[^>]*>/g, " ")), "no commissioner labels");
});

test("T3: next up is the operation event while it has not started", () => {
  const state = puttPosted(false);
  const events = allEventsOf(state);
  const operation = resolveWeekendOperation(state, events);
  assert.equal(operation.event.id, "die");
  assert.equal(nextUpEvent(state, events, { liveEv:null, operationEv:operation.event }).id, "die");
  act(state, "announceAndDraw", { evId:"die", players:ROSTER.slice(0, 12) }, gm(false));
  const after = allEventsOf(state);
  const live = tvLiveEvent(state, after, resolveWeekendOperation(state, after).event);
  assert.equal(live.id, "die");
  assert.equal(nextUpEvent(state, after, { liveEv:live }).id, "where", "a live event is skipped");
});

test("T4: the fallback result moment never retakes the TV after a directed scene or a newer write", () => {
  const restore = movingClock();
  try {
    const directed = puttPosted(true);
    const anchor = directed.results.putt.confirmedAt;
    act(directed, "advanceShowScene", { id:directed.showControl.active.id });
    act(directed, "endShowScene", { id:directed.showControl.active.id, outcome:"skipped" });
    assert.equal(directed.showControl.history[0].kind, "winner");
    assert.equal(resultMomentFor(directed, allEventsOf(directed), anchor + 5000, null, null), null,
      "the winner scene already told it");
    const bare = puttPosted(false);
    const bareAnchor = bare.results.putt.confirmedAt;
    assert.ok(resultMomentFor(bare, allEventsOf(bare), bareAnchor + 5000, null, null));
    act(bare, "announceEvent", { evId:"where" }, gm(false));
    assert.equal(resultMomentFor(bare, allEventsOf(bare), bareAnchor + 5000, null, null), null,
      "the next event's announcement owns the TV");
  } finally { restore(); }
});

test("T5: a split place stays split per drawn team, and tied stacks are named or counted", () => {
  const state = structuredClone(EMPTY_STATE);
  playBracket(state, "8ball");
  act(state, "saveResult", { evId:"8ball", slots:bracketSlots(state, "8ball") }, gm(false));
  const model = resultPresentation(state, allEventsOf(state), "8ball");
  const third = model.podium.find(item => item.place === 3);
  assert.equal(third.groups.length, 2);
  assert.ok(third.names.every(name => name.includes(" & ")), third.names.join("|"));
  const html = renderTv(state, { now:state.results["8ball"].confirmedAt + 6000, showControl:false });
  /* each drawn pair stands on 3rd's step as its own group, named its own way */
  const thirdStep = html.slice(html.indexOf('class="tv-step is-p3'));
  assert.ok((thirdStep.match(/class="tv-step-block"/g) || []).length >= 2, "a split 3rd stands as two groups");
  assert.ok(!html.includes("Team "), "never an invented team");

  const poker = structuredClone(EMPTY_STATE);
  act(poker, "pokerSetup"); act(poker, "pokerStart");
  ROSTER.forEach((p, i) => {
    if (i >= 10) act(poker, "pokerBust", { player:p });
    else act(poker, "pokerCount", { player:p, count:i === 0 ? 3000 : 1000 });
  });
  act(poker, "pokerResult", { noScene:true });
  const stacks = resultPresentation(poker, allEventsOf(poker), "poker");
  assert.deepEqual(stacks.podium[1].names, ["9 tied"]);
  assert.equal(stacks.podium[1].players.length, 9);
});

test("T6: away players are never dealt: rows, rail, and cues", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "setAway", { player:"Henry", away:true });
  act(state, "pokerSetup"); act(state, "pokerStart");
  const rows = pokerTableRows(state, computeStandings(state));
  const henry = rows.find(row => row.player === "Henry");
  assert.equal(henry.away, true);
  assert.equal(henry.starting, null);
  assert.equal(rows.at(-1).player, "Henry", "listed apart, after the table");
  const html = renderTv(state, { now:state.poker.startedAt + 1000 });
  assert.ok(html.includes("tv-table-away"), "away players are named under the table");
  const cues = cueCandidates(state, allEventsOf(state), { now:state.poker.startedAt + 1000 });
  assert.equal(cues.players.length, ROSTER.length - 1);
  assert.ok(!cues.players.includes("Henry"));
  ROSTER.filter(p => p !== "Henry").forEach((p, i) => act(state, "pokerCount", { player:p, count:i ? 500 : 2000 }));
  act(state, "pokerResult", { noScene:true });
  const model = resultPresentation(state, allEventsOf(state), "poker");
  assert.equal(model.rows.find(row => row.player === "Henry").away, true);
  assert.ok(!model.podium.some(item => item.players.includes("Henry")));
});

test("T8: a decided bracket shows its winner and the bracket, never a commissioner label", () => {
  const state = structuredClone(EMPTY_STATE);
  playBracket(state, "8ball");
  const winner = decidedWinner(state, evOf(state, "8ball"));
  assert.equal(winner?.players.length, 2);
  const html = renderTv(state, { showControl:false });
  assert.ok(html.includes("tv-decided"));
  assert.ok(html.includes("tv-bracket"));
  assert.ok(!/Post the|Enter the|Record /.test(html.replace(/<[^>]*>/g, " ")));
});

test("T2: the TV draws the intro and the draw inside its canvas", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) }, gm(false));
  const reveal = buildEventReveal(state, evOf(state, "8ball"), "draw");
  const events = allEventsOf(state);
  const tvWith = ceremony => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:state.profiles },
    React.createElement(TVMode, { state, events, standings:computeStandings(state), allTied:true, onDeckEv:evOf(state, "8ball"),
      showControlEnabled:false, connection:{ ready:true, connected:true, version:3 }, now:Date.now(), onExit:() => {}, ceremony })));
  const html = tvWith({ intro:null, reveal, handoff:false });
  const canvas = html.indexOf("data-tv-canvas"), inner = html.indexOf("tv-reveal"), exit = html.indexOf("tv-exit");
  assert.ok(canvas >= 0 && inner > canvas && inner < exit, "inside the scaled canvas");
  /* every card stands on the canvas from the start, unturned: its people
     land when it turns (Oct 3, draw-unit.test.mjs), never before */
  assert.equal([...html.matchAll(/class="tv-draw-card /g)].length, reveal.groups.length);
  /* only the draw's own cards: the betting board under it may name the live match */
  const cards = html.slice(inner, exit);
  assert.equal([...cards.matchAll(/class="tv-draw-card /g)].length, reveal.groups.length, "the slice holds every card");
  assert.ok(reveal.groups.every(group => group.lines.every(line => !cards.includes(`>${line.text.replace(/&/g, "&amp;")}<`))));
  const intro = tvWith({ intro:"8ball", reveal:null, handoff:true });
  assert.ok(intro.indexOf("tv-intro") > intro.indexOf("data-tv-canvas"));
  /* a draw follows: the intro docks its name where the draw letters it,
     no "Drawing teams" line (Oct 3 intros) */
  assert.match(intro, /class="fd-intro is-tv is-handoff/);
  assert.ok(!intro.includes("Drawing teams"));
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(!/<EventIntro[^>]*\bbig\b/.test(app) && !/<Reveal[^>]*\bbig\b/.test(app), "no phone overlays on the TV");
});

test("T10: the reload flag follows what the TV shows, and the client never reloads blind", () => {
  const state = puttPosted();
  act(state, "advanceShowScene", { id:state.showControl.active.id });
  const scene = resolveShowScene(state, allEventsOf(state));
  const idle = tvSceneView(scene, scene.active.updatedAt + TV_SCENE_IDLE_MS + 1);
  assert.equal(tvBusy({ sceneView:idle }), false, "an active but idle scene is not a ceremony");
  assert.equal(tvBusy({ sceneView:tvSceneView(scene, scene.active.updatedAt + 1000) }), true);
  assert.equal(tvBusy({ reveal:{ id:"d1" } }), true);
  assert.equal(tvBusy({ advance:{ id:"x" } }), true);
  const client = readFileSync(new URL("../src/lib/client.js", import.meta.url), "utf8");
  assert.ok(!client.includes("TV_CEREMONY_WAIT_MS"), "no five-minute blind reload");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(app.includes("!tv) window.__FD_CEREMONY__ = !!(intro || reveal)"), "the TV owns its own flag");
});

test("T11/T12: the ticker holds one fact a page on the server clock; a quiet label, color only on amounts", () => {
  const items = Array.from({ length:5 }, (_, i) => ({ tag:`T${i}`, text:String(i) }));
  assert.deepEqual(tickerPage(items, 0).items.map(it => it.tag), ["T0"]);
  assert.deepEqual(tickerPage(items, 6000).items.map(it => it.tag), ["T1"]);
  assert.equal(tickerPage(items, 12000).pages, 5);
  assert.equal(tickerPage(items, 30000).index, 0);
  assert.deepEqual(tickerPage(items, 6000, 2).items.map(it => it.tag), ["T2", "T3"], "pages of more than one still work");
  const css = readFileSync(new URL("../src/ui/experience.css", import.meta.url), "utf8");
  const token = name => css.match(new RegExp(`${name}:(#[0-9a-f]{6})`, "i"))[1];
  const lum = hex => hex.slice(1).match(/.{2}/g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  /* Oct 2 (Backglass wave 2): the label is quiet lilac on the glass, no
     filled tags; an amount's role sets its ink, every one legible on glass */
  const tv = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  assert.match(tv, /\.tv-ticker-tag \{[^}]*color:var\(--muted\)/);
  for (const ink of ["--sun", "--green", "--clay-text", "--muted", "--bone"]) assert.ok(ratio(token(ink), token("--bg")) >= 4.5, ink);
  assert.ok(!/\.tv-ticker-tag \{[^}]*background/.test(tv), "no filled tags");
  const state = puttPosted(false);
  state.adjustments = [{ id:"r", player:"Evan", delta:100, reason:"Spirit", ts:1 }];
  const all = tickerItems({ state, events:allEventsOf(state), standings:computeStandings(state), allTied:false,
    latest:latestResultOf(state, allEventsOf(state)), nextEv:evOf(state, "8ball"), now:Date.now() });
  assert.ok(all.every(item => TICKER_ROLES.includes(item.role)), all.map(i => i.role).join());
  assert.ok(all.every(item => item.text === item.parts.map(part => typeof part === "string" ? part : part.amount).join("")));
  /* the last result's biggest swing names one player and their change */
  const swing = all.find(item => item.tag === "Biggest swing");
  const best = biggestSwing(state, allEventsOf(state), "putt");
  assert.ok(swing && best && swing.players[0] === best.player && swing.text.includes("Long Putt"), swing?.text);
});

test("T13/T14: a correction gets one line first, then the lead change", () => {
  const restore = movingClock();
  try {
    const state = puttPosted(false);
    act(state, "saveResult", { evId:"putt", slots:[["Adi"], ["Evan"], ["Khoa"]], confirmOverwrite:true, correctionReason:"Card" }, gm(false));
    const at = state.results.putt.correctedAt;
    const correction = correctionMoment(state, allEventsOf(state), at + 1000);
    assert.equal(correction.text, "Long Putt: Adi 1st");
    assert.equal(correctionMoment(state, allEventsOf(state), at + TV_CORRECTION_MS + 1), null);
    const lead = { at, leader:{ players:["Adi"], pts:1400 } };
    assert.equal(dockCard({ now:at + 1000, lead, correction }).kind, "correction");
    assert.equal(dockCard({ now:correction.until + 10, lead, correction }).kind, "lead");
    assert.equal(dockCard({ now:at + 1000, lead, holdUntil:at + 5000 }), null, "waits out the advance moment");
    assert.equal(dockCard({ now:at + 5000 + TV_LEAD_CHANGE_MS + 1, lead, holdUntil:at + 5000 }), null);
    const tv = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
    assert.ok(!tv.includes("tv-leadchange-float"), "docked, never floating over the rail");
  } finally { restore(); }
});

test("T16/T17/T19: sides read as teams, riders merge per bettor, and advances carry context", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceAndDraw", { evId:"8ball", players:ROSTER.slice(0, 12) }, gm(false));
  const ev = evOf(state, "8ball");
  const contest = resolveCurrentContest(state, ev);
  const side = contest.sides[0];
  const bettor = ROSTER.find(p => !contest.players.includes(p));
  const wager = { kind:"match", eventId:"8ball", contestId:contest.id, contestRevision:contest.revision, stake:100,
    drawId:contest.drawId, match:[...contest.match], matchName:contest.label, teamIdx:side.key,
    pickPlayers:side.players, pickTeam:true, pick:"x" };
  for (const id of ["w1", "w2"]) {
    const r = applyAction(state, "placeWager", { wager }, { player:bettor, deviceId:`d-${bettor}`, actionId:id });
    assert.equal(r.ok, true, r.error);
  }
  const riders = contestRiders(state, allEventsOf(state), contest).get(side.key);
  assert.deepEqual(riders.riders, [{ player:bettor, stake:200 }]);
  assert.equal(riders.total, 200);
  const html = renderTv(state, { showControl:false });
  /* the bettor rides as their own two-chip stack, named, never "Name 200" */
  assert.match(html, new RegExp(`data-stack-player="${bettor}" data-stack-chips="2"`));
  assert.ok(!html.replace(/<[^>]*>/g, " ").includes(`${bettor} 200`));
  assert.ok(html.includes("Winner pays 1:1") && !/ to 1\b|even/.test(html.replace(/<[^>]*>/g, " ")));
  act(state, "lockAndStart", { evId:"8ball", ...ref(state, "8ball") }, gm(false));
  act(state, "recordContestWinner", { evId:"8ball", winner:side.key, ...ref(state, "8ball") }, gm(false));
  const moment = advanceMoment(state, ev, state.eventOps["8ball"].lastContest.decidedAt + 500);
  assert.equal(moment.verb, "Advance", "a pair advances");
  assert.match(moment.detail, /^beat .+ · Semifinals next$/);
  const volley = structuredClone(EMPTY_STATE);
  act(volley, "announceAndDraw", { evId:"volley", players:ROSTER.slice(0, 12) }, gm(false));
  const vhtml = renderTv(volley, { showControl:false });
  assert.ok(vhtml.includes("is-h2h"));
  assert.ok(vhtml.includes("Winner pays 1:1"), "two teams pay 1:1, even as a free-for-all");
  const names = [...vhtml.matchAll(/class="tv-side-name">([^<]*)</g)].map(m => m[1]);
  assert.equal(names.length, 2);
  /* a team reads as its team name, never as its members joined up (a
     generated name may itself carry an "&", like "Basalt & Pepper") */
  const rosters = volley.draws.volley.teams.map(team => team.players.map(p => volley.profiles?.[p]?.display || p).join(" &amp; "));
  assert.ok(names.every(name => !rosters.some(roster => roster.startsWith(name.trim()) || name.includes(roster))), names.join("|"));
});

test("T20/T21: champion, progress, race, duels, and spotlight models", () => {
  const state = puttPosted(false);
  act(state, "setFrozen", { f:true }, gm(false));
  const standings = computeStandings(state);
  const view = championView(state, allEventsOf(state), standings);
  assert.deepEqual(view.players, ["Evan"]);
  assert.deepEqual(view.plates, [{ eventId:"putt", name:"Long Putt", winner:"Evan" }]);
  assert.equal(view.path[0].label, "1st Long Putt");
  assert.equal(readableInk("#E39A3B"), "var(--ink0)");
  assert.equal(readableInk("#2F7E83"), "var(--bone)");
  /* D3: a frozen TV takes turns with the class photo; this is the champion's turn */
  const html = renderTv(state, { showControl:false, now:Math.floor(Date.now() / 36000) * 36000 + 1000 });
  assert.ok(html.includes("tv-champ") && html.includes(">Final<"));
  assert.ok(!html.includes("tv-ticker") && !html.includes("is-live"), "final: no ticker, no pulsing dot");
  const progress = weekendProgress(state, allEventsOf(state));
  assert.equal(progress.find(row => row.id === "putt").status, "done");
  assert.deepEqual(progress.find(row => row.id === "putt").winners, ["Evan"]);
  assert.equal(stackRace(standings)[0].share, 1);
  state.duels = [{ id:"d", from:"Adi", to:"Evan", stake:100, status:"open", ts:1,
    runs:{ Adi:{ ms:250, ts:2 }, Evan:{ ms:300, ts:3 } } }];
  const duels = duelBoard(state);
  assert.equal(duels.records[0].player, "Adi");
  assert.equal(duels.recent[0].winner, "Adi");
  state.profiles = { Adi:{ display:"Adi" }, Evan:{ display:"Evan" } };
  assert.notEqual(spotlightPlayer(state, 0, 1000), spotlightPlayer(state, 1000, 1000));
});

test("T22: latest by original post, rulings the room hears, crash board and Exit on the canvas", () => {
  const events = allEventsOf(EMPTY_STATE);
  const state = { ...structuredClone(EMPTY_STATE), results:{
    putt:{ slots:[["Evan"]], ts:100, confirmedAt:100 },
    where:{ slots:[["Adi"]], ts:300, confirmedAt:50, correctedAt:300, revision:2 } } };
  assert.equal(latestResultOf(state, events).ev.id, "putt", "a correction does not make an old event latest");
  state.adjustments = [{ id:"g", player:"Adi", delta:100, reason:"Minimum stack" },
    { id:"r", player:"Evan", delta:100, reason:"Spirit", removedAt:5 }, { id:"ok", player:"Khoa", delta:-100, reason:"Late" }];
  assert.equal(tickerRuling(state).id, "ok");
  const boundary = readFileSync(new URL("../src/ui/AppErrorBoundary.jsx", import.meta.url), "utf8");
  assert.ok(boundary.includes("tvCanvasFit") && boundary.includes("data-tv-canvas"));
  const tv = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.ok(tv.includes("is-idle"), "Exit TV hides when the pointer is idle");
});

/* Oct 2 finish: the ticker names a leader only when one stands alone */
test("ticker: no Leader fact while the top is shared or the whole board is level", () => {
  const state = structuredClone(EMPTY_STATE);
  const events = allEventsOf(state);
  const level = computeStandings(state);
  assert.equal(boardLevel(level), true, "everyone on the opening 1,000");
  assert.equal(soleLeader(level), null);
  /* a caller that does not flag the level board still gets no leader */
  const opening = tickerItems({ state, events, standings:level, allTied:false, now:0 });
  assert.ok(!opening.some(item => item.tag === "Leader"), "no leader at 1,000 apiece");
  state.adjustments = [{ id:"a", player:"Evan", delta:300, reason:"Spirit", ts:1 },
    { id:"b", player:"Adi", delta:300, reason:"Spirit", ts:2 }];
  const shared = computeStandings(state);
  assert.equal(boardLevel(shared), false);
  assert.equal(soleLeader(shared), null, "Evan and Adi share the top");
  assert.ok(!tickerItems({ state, events, standings:shared, allTied:false, now:0 }).some(item => item.tag === "Leader"));
  state.adjustments.push({ id:"c", player:"Evan", delta:100, reason:"Spirit", ts:3 });
  const alone = computeStandings(state);
  assert.equal(soleLeader(alone).player, "Evan");
  const leader = tickerItems({ state, events, standings:alone, allTied:false, now:0 }).find(item => item.tag === "Leader");
  assert.equal(leader?.text, "Evan 1,400");
});

/* Oct 2 wave 2 fix round (finish review): the TV's frame, safe area,
   ticker, podium and result step */
const tvm = await import("../src/features/tv/tvModel.js");
const { applyAction:rawAct } = await import("../worker/actions.js");
const { RESET_PROGRESS_CONFIRMATION } = await import("../shared/core.js");

test("safe area: the masthead and ticker plates sit 54px (5%) inside the canvas top and bottom", () => {
  assert.equal(SAFE_Y, 54);
  const css = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  assert.match(css, /--tv-safe-y:54px/);
  assert.match(css, /\.tv-mast \{[^}]*padding:var\(--tv-safe-y\) var\(--tv-edge\) 0/);
  const [, top, height] = css.match(/\.tv-ticker-glass, \.tv-ticker-page \{[^}]*top:(\d+)px; height:(\d+)px/);
  assert.ok(TICKER_H - Number(top) - Number(height) >= SAFE_Y, "the ticker plate ends inside the bottom inset");
  assert.ok(MAST_H >= SAFE_Y + 64, "the masthead holds its 64px plates under the inset");
  const html = renderTv(puttPosted(false), { now:Date.now() + 60 * 60000, showControl:false });
  assert.match(html, new RegExp(`--tv-mast-h:${MAST_H}px`));
});

test("the frame's lamps: a ring of bulbs at rest, every third lit and stepping, steady under reduced motion", () => {
  const beads = frameBeads();
  assert.equal(beads % 3, 0);
  assert.ok(beads > 120 && beads < 160, `${beads} bulbs about 40px apart`);
  const html = renderTv(puttPosted(false), { now:Date.now() + 60 * 60000, showControl:false });
  assert.match(html, /class="tv-frame-lamps is-rest"/);
  assert.equal(count(html, `pathLength="${beads}"`), 2, "unlit bulbs and the lit run");
  const css = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  assert.match(css, /\.tv-frame-lit \{[^}]*stroke-dasharray:0 3;[^}]*steps\(3, end\)/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^@]*\.tv-frame-lit \{ animation:none; \}/);
  assert.ok(!/\.tv-frame-[a-z]+ \{[^}]*(drop-shadow|filter:)/.test(css), "no glow on the frame");
});

test("podium: first is lit in its winner's own color and the frame runs in it", () => {
  const state = puttPosted(false);
  const events = allEventsOf(state);
  const anchor = resultMomentFor(state, events, Date.now(), null, null).anchor;
  const html = renderTv(state, { now:anchor + 3000, showControl:false });
  assert.match(html, /class="tv-step is-p1 is-filled is-lit"[^>]*--win:#[0-9a-f]{6}/i);
  assert.match(html, /data-chase=""/);
  assert.match(html, /class="tv-frame-lamps is-run"[^>]*style="--chase:#[0-9a-f]{6}"/i);
  assert.ok(!html.includes("tv-result-band"), "no session band in a lamp color on the result sign");
  const css = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  const podium = readFileSync(new URL("../src/features/tv/TVPodium.jsx", import.meta.url), "utf8");
  assert.ok(!/BetStacks|winnerStacks/.test(podium.slice(0, podium.indexOf("export function BackersRail"))),
    "the backers ride their own rail, never inside 1st's step");
  assert.ok(!/\.tv-felt \{[^}]*border:/.test(css) && /\.tv-felt \{[^}]*var\(--tv-window\)/.test(css), "felts are windows in the pane");
});

test("result step: every tower keeps its name; a tower that did not move shows nothing on its count line", () => {
  const towers = readFileSync(new URL("../src/features/tv/ChipTowers.jsx", import.meta.url), "utf8");
  assert.ok(!/visibility = t\.z/.test(towers), "a tower hopping back keeps its label");
  const css = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  assert.match(css, /\.tv-tower-label:is\(\.is-moved, \.is-still\) \.tv-tower-pts \{ animation:tv-tower-pts/);
  assert.ok(!/tv-tower-still \{[^}]*opacity/.test(css), "no dimmed balances beside the deltas");
  const mode = readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.ok(mode.includes("tv-result-headline") && mode.includes("is-marquee tv-result-headline-name"), "the headline in the hero lettering");
});

test("ticker: two short facts share a page, a long one is alone; the first fact never repeats its tag", () => {
  const short = n => ({ tag:"Leader", players:["Evan"], parts:["Evan ", { amount:"1,400", role:"chip" }], text:`Evan 1,400 ${n}` });
  const long = { tag:"Crew", players:["Evan", "Adi", "Khoa"], parts:["Evan, Referee · Adi, Scorekeeper · Khoa, Timekeeper · Ben, Line judge"], text:"" };
  assert.ok(tvm.tickerFactWidth(short(1)) <= tvm.TICKER_HALF_PX);
  assert.ok(tvm.tickerFactWidth(long) > tvm.TICKER_HALF_PX);
  const pages = tvm.tickerPages([short(1), short(2), long, short(3)]);
  assert.deepEqual(pages.map(page => page.length), [2, 1, 1]);
  assert.equal(tvm.tickerSpread([short(1), short(2), long], 0).items.length, 2);
  assert.equal(tvm.tickerSpread([short(1), short(2), long], tvm.TV_TICKER_PAGE_MS).items[0], long);
  assert.equal(tvm.tickerSpread([], 0).items.length, 0);
  const state = structuredClone(EMPTY_STATE);
  const items = tickerItems({ state, events:allEventsOf(state), standings:computeStandings(state), allTied:true, now:0,
    facts:[{ id:"f", kind:"first", tag:"First", at:1, players:["Evan"], text:"First to 2,000: Evan" }] });
  const first = items.find(item => item.text.startsWith("First to"));
  assert.equal(first.tag, "Milestone");
});

test("ticker: won bets belong to the last result and leave once anything else takes the room", () => {
  const state = puttPosted(false);
  const events = allEventsOf(state);
  const latest = tvm.latestResultOf(state, events);
  const openWon = [{ w:{ player:"Adi", eventId:"putt" }, r:{ delta:200 } }, { w:{ player:"Ben", eventId:"pong" }, r:{ delta:500 } }];
  const base = { state, events, standings:computeStandings(state), allTied:false, latest, openWon, now:0 };
  const won = tickerItems(base).filter(item => item.tag === "Bet won");
  assert.deepEqual(won.map(item => item.players[0]), ["Adi"], "only the last result's bets");
  assert.ok(!tickerItems({ ...base, draft:true }).some(item => item.tag === "Bet won"), "not during a draft");
  assert.ok(!tickerItems({ ...base, liveEv:events.find(ev => ev.id === "pong") }).some(item => item.tag === "Bet won"),
    "not once a contest is in play");
  assert.ok(!tickerItems({ ...base, showing:"putt" }).some(item => item.tag === "Result"), "the result on screen is not repeated");
});

test("ticker: live poker carries only the table's news, never a busted player as a leader or an old bet", () => {
  const state = structuredClone(EMPTY_STATE);
  const r = rawAct(state, "qaAdvance", { target:"poker:live", seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true },
    { isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"qa", actionId:"qa-poker" });
  assert.equal(r.ok, true, r.error);
  const events = allEventsOf(state);
  const pk = state.poker;
  const items = tickerItems({ state, events, standings:computeStandings(state), allTied:false,
    latest:tvm.latestResultOf(state, events), openWon:[{ w:{ player:"Eyob", eventId:"kart" }, r:{ delta:200 } }],
    now:Number(pk.startedAt) + 1000 });
  const tags = items.map(item => item.tag);
  for (const gone of ["Bet won", "Leader", "Result", "Biggest swing"]) assert.ok(!tags.includes(gone), `${gone} during the finale`);
  const outs = (pk.outs || []).map(o => o.player);
  if (outs.length) {
    const out = items.find(item => item.tag === "Out");
    assert.equal(out.players[0], outs[outs.length - 1]);
    assert.ok(!items.some(item => item.tag === "Deepest stack" && outs.includes(item.players[0])), "a busted seat is never the deepest stack");
  }
  assert.ok(tags.includes("Average stack"));
});

test("trophy: the cup is turned metal (cyan is navigation), winners cut into silver plates", () => {
  const css = readFileSync(new URL("../src/features/weekend/trophy.css", import.meta.url), "utf8");
  assert.ok(!css.includes("--accent"), "no cyan on the trophy");
  assert.match(css, /\.fd-cup-plate\.is-posted \{ background:var\(--cup-silver\); color:var\(--cup-cut-ink\)/);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css), "colors only from tokens");
  const jsx = readFileSync(new URL("../src/features/weekend/Trophy.jsx", import.meta.url), "utf8");
  assert.ok(!jsx.includes(`"--accent"`));
});
