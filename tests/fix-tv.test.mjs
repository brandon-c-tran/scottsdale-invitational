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
import { applyAction } from "../worker/actions.js";
import { Tournament } from "../worker/tournament.js";
import {
  TV_INTRO_OVERLAY_MS, TV_SCENE_IDLE_MS, tvSceneView, ambientIndex, resultPresentation,
  resultMomentPhase, resultMomentFor, advanceMoment, tvCanvasFit, latestSettledDuel, tickerItems,
  cueCandidates, tvConnection, bracketStrip, nextOpenMatch,
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
  act(state, "startDraft", { evId:"bball", captains:ROSTER.slice(0, 4), players:ROSTER.slice(0, 12) });
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
  const beat = resolveDirector(state, events, { showControl:true }).nextAction;
  assert.equal(beat.type, "clear-scene");
  act(state, "endShowScene", { id:beat.sceneId, outcome:"cancelled" });
  assert.equal(resolveDirector(state, events, { showControl:true }).nextAction.type, "replay-winner-scene");
});

/* ── 4. production result moment ── */
test("a result presentation splits every change into event award and bets, and names the new leader", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:"putt" });
  const contest = resolveCurrentContest(state, BUILTIN_EVENTS.find(e => e.id === "putt"));
  const wager = { kind:"outright", eventId:"putt", stake:200, pick:"Evan",
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
  assert.equal(adi.bets, 400);
  assert.equal(evan.rankAfter, 1);
  assert.deepEqual(model.revealOrder.map(item => item.place), [3, 2, 1]);
  assert.equal(model.leadChanged, true);
  assert.deepEqual(model.leader.players.sort(), ["Adi", "Evan"]);
  assert.equal(model.previousLeader, null);
});

test("the result moment sequence and its reduced-motion equivalent carry the same facts", () => {
  assert.deepEqual(resultMomentPhase(0, 100), { phase:"podium", revealed:1, sorted:false });
  assert.equal(resultMomentPhase(0, 3100).revealed, 3);
  assert.deepEqual(resultMomentPhase(0, 100, { reducedMotion:true }), { phase:"podium", revealed:3, sorted:false });
  assert.deepEqual(resultMomentPhase(0, 8200), { phase:"standings", revealed:3, sorted:false });
  assert.equal(resultMomentPhase(0, 8200, { reducedMotion:true }).sorted, true);
  assert.equal(resultMomentPhase(0, 9600).sorted, true);
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
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
    resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const tvModule = new Module(fileURLToPath(new URL("fix-tv.cjs", import.meta.url)));
tvModule.filename = tvModule.id;
tvModule.paths = Module._nodeModulePaths(root);
tvModule._compile(compiled.outputFiles[0].text, tvModule.filename);
const { TVMode, PlayerIdentityProvider } = tvModule.exports;

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
  act(frozen, "startShowScene", { kind:"champion" });
  const champ = renderTv(frozen, { now:frozen.showControl.active.startedAt + 1000 });
  assert.ok(champ.includes("tv-champion"));
  assert.ok(!champ.includes("tv-ticker"));
  assert.ok(!champ.includes("radial-gradient"));

  const css = readFileSync(new URL("../src/features/tv/tv.css", import.meta.url), "utf8");
  /* the Exit control sits outside the scaled canvas, in viewport pixels */
  const canvasCss = css.replace(/\.tv-exit \{[^}]*\}/, "");
  const sizes = [...canvasCss.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 20 && sizes.every(size => size >= 24), `TV text sizes ${sizes.filter(s => s < 24)}`);
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(|gradient/i.test(css), "tokens only, flat");
  const shell = readFileSync(new URL("../src/ui/shell.css", import.meta.url), "utf8");
  assert.ok(!shell.includes("si-glow"));
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(!app.includes("THE WEEKEND STARTS HERE"));
  assert.ok(!app.includes("SCOTTSDALE · 2026") && !app.includes("Scottsdale 2026"));
  assert.ok(!app.includes("10 is the chip quantum"));
});

test("the event intro overlays the live board for three seconds only", () => {
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
  assert.ok(live.includes("Up now · "));
  assert.ok(live.includes("tv-strip"));
  assert.ok(!live.includes("tv-ondeck"), "the header does not repeat the board");
  const contest = resolveCurrentContest(state, BUILTIN_EVENTS.find(e => e.id === "pong"));
  act(state, "recordContestWinner", { evId:"pong", winner:contest.sides[0].key, ...ref(state, "pong") }, gm(false));
  const decidedAt = state.eventOps.pong.lastContest.decidedAt;
  const moment = advanceMoment(state, BUILTIN_EVENTS.find(e => e.id === "pong"), decidedAt + 1000);
  assert.equal(moment.verb, "Advances");
  assert.equal(advanceMoment(state, BUILTIN_EVENTS.find(e => e.id === "pong"), decidedAt + 5001), null);
  assert.ok(renderTv(state, { now:decidedAt + 1000, showControl:false }).includes("tv-advance"));
  const strip = bracketStrip(state, BUILTIN_EVENTS.find(e => e.id === "pong"), null);
  assert.ok(strip.some(round => round.matches.some(match => match.sides.some(side => side.won))));
  assert.ok(nextOpenMatch(state.brackets.pong));
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
  assert.ok(html.includes("Starting chips"));
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
  assert.ok(items.some(item => item.tag === "Leader" && item.text.endsWith("chips")));
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
  assert.equal(body.error, "Reconnect Spotify in Audio Director");
  const status = await (await call(tournament, "status")).json();
  assert.equal(status.connected, false);
  assert.equal(status.reconnect, true);
  assert.equal(status.error, "Reconnect Spotify in Audio Director");
});
