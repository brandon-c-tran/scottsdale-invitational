import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest, resolveWager,
  resolveWeekendOperation, contestUndoAvailability, suggestParticipants, teamFit, presentPlayers,
  validateEventParticipants, makeBracket, bracketOrder, refundText,
} from "../shared/core.js";
import { resolveDirector } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { Tournament } from "../worker/tournament.js";
import { pendingReveal, revealReady } from "../src/features/weekend/drawReveal.js";

let serial = 0;
const fresh = (order = []) => ({ ...structuredClone(EMPTY_STATE), eventOrder:order });
const eventOf = (s, id) => allEventsOf(s).find(ev => ev.id === id);
const current = (s, id) => resolveCurrentContest(s, eventOf(s, id));
const refs = contest => ({ contestId:contest.id, contestRevision:contest.revision });
const gm = (player = "Brandon") => ({ isGm:true, player, deviceId:"host", actionId:`fix-${++serial}` });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`chip-${++serial}` });
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
const chip = (s, id, key, stake = 100) => {
  const c = current(s, id), ev = eventOf(s, id), side = c.sides.find(item => item.key === key);
  const common = { eventId:id, evName:ev.name, stake, ...refs(c) };
  if (c.kind === "ffa") return c.drawId ? { ...common, kind:"outright", pickTeam:true, pickPlayers:side.players, drawId:c.drawId }
    : { ...common, kind:"outright", pick:key };
  if (c.kind === "match") return { ...common, kind:"match", match:c.match, teamIdx:key, drawId:c.drawId };
  return { ...common, kind:c.kind === "heat" ? "heat" : "stage", stagesId:c.stagesId, drawId:c.drawId,
    group:c.group, final:c.kind === "stage-final", pickKey:key };
};
const director = s => resolveDirector(s, allEventsOf(s), { showControl:false });

/* ── the actual App, rendered with retained refs (see announcement-app) ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const blocked = names => names.map(name => `export const ${name}=()=>{
  throw new Error("${name} must not run in the isolated App regression");
};`).join("\n");
const compiled = await build({
  stdin:{ contents:`export { default as App } from "./src/App.jsx";
    export { setTestSnapshot } from "./src/lib/client.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"isolated-commissioner-app", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
      let snapshot;
      export const setTestSnapshot=value=>{snapshot=value;};
      export const useTournament=()=>snapshot;
      export const localGet=key=>key==="si-onboard-v5"?"yes":key==="si-me"?snapshot.testPlayer:
        key==="si-gm"&&snapshot.testGm?"yes":null;
      export const hasGmToken=()=>true;
      ${blocked(["dispatch", "uploadPhoto", "downloadSnapshot", "localSet", "getDeviceId", "setGmToken",
        "spotifyStatus", "spotifyPlayer", "spotifySearch", "spotifyAuthorize", "spotifyDisconnect",
        "spotifyPlay", "spotifyPause", "spotifyDevice"])}
    ` }));
    builder.onLoad({ filter:/[\\/]features[\\/]check-in[\\/]install\.js$/ }, () => ({ loader:"js", contents:
      `export const installEvt=null;\n${blocked(["onInstallReady", "firstOnboardStep", "isStandalone", "isIOS"])}` }));
  } }],
});
const componentModule = new Module(fileURLToPath(new URL("fix-commissioner-app.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { App, setTestSnapshot } = componentModule.exports;
function phone({ gm:isGm = true, player = ROSTER[0] } = {}) {
  const cells = [];
  let onDeckRef;
  const render = (state, version = 1, lastAction = null) => {
    const useRef = React.useRef, useLayoutEffect = React.useLayoutEffect;
    let cursor = 0;
    React.useRef = initial => {
      const created = useRef(initial), index = cursor++;
      if (!cells[index]) cells[index] = created;
      if (initial === "UNSET") onDeckRef = cells[index];
      return cells[index];
    };
    React.useLayoutEffect = React.useEffect;
    setTestSnapshot({ state, ready:true, connected:false, version, lastAction,
      environment:"test", capabilities:{}, testGm:isGm, testPlayer:player });
    try { return renderToStaticMarkup(React.createElement(App)); }
    finally { React.useRef = useRef; React.useLayoutEffect = useLayoutEffect; }
  };
  return { render, commitOnDeck(value) { onDeckRef.current = value; } };
}

/* The App's two ceremony effects, in their order: a fresh announcement
   reserves its render for the intro; the next render hands the intro over
   to a reveal for the same event; the reveal plays after the hold. */
function ceremony(state, seen = []) {
  const events = allEventsOf(state), steps = [];
  let intro = null;
  if (state.onDeck) { intro = state.onDeck; steps.push(["intro", intro]); }
  const { staleIds, next } = pendingReveal(state, events, seen, intro);
  if (staleIds.length) steps.push(["retire", staleIds]);
  if (next && (!intro || next.evId === intro)) steps.push(["reveal", next.evId, next.id]);
  return steps;
}

test("8-Ball through the real path: director crew, one write, intro then reveal", () => {
  const state = fresh(["8ball"]);
  const beat = director(state).nextAction;
  assert.equal(beat.type, "announce-draw");
  assert.equal(beat.label, "Announce and draw");
  assert.equal(beat.subject, "8-Ball Doubles");
  assert.deepEqual(beat.roles, [{ player:"Jeremy", role:"referee" }], "Crew prefilled with whoever sat out least");
  assert.equal(beat.players.length, 12);

  const device = phone({ player:"Evan" });
  const pill = device.render(state);
  assert.match(pill, /Announce and draw/);
  assert.match(pill, /8-Ball Doubles/);
  assert.match(pill, /Crew: Jeremy · Event official/);
  device.commitOnDeck(state.onDeck);

  act(state, "announceAndDraw", { evId:"8ball", players:beat.players, roles:beat.roles });
  assert.equal(state.onDeck, "8ball");
  assert.ok(state.draws["8ball"] && state.brackets["8ball"]);
  assert.deepEqual(state.draws["8ball"].roles, beat.roles);
  assert.deepEqual(ceremony(state), [["intro", "8ball"], ["reveal", "8ball", state.draws["8ball"].id]]);
  const html = device.render(state, 2, "announceAndDraw");
  assert.match(html, /Lock and start/);
  device.commitOnDeck(state.onDeck);
  assert.ok(device.render(state, 2, "announceAndDraw"), "A subsequent render still works");

  /* crew rotates: the next draw prefers someone who has not sat out */
  const pong = suggestParticipants(state, eventOf(state, "pong"));
  assert.equal(pong.roles[0].player, "Ben");
});

test("a draw prepared for a later event is held on every screen until it is announced", () => {
  const state = fresh(["putt", "pong"]);
  const players = suggestParticipants(state, eventOf(state, "pong")).players;
  act(state, "runDraw", { evId:"pong", players, roles:[{ player:"Jeremy", role:"referee" }] });
  assert.equal(revealReady(state, "pong"), false);
  assert.deepEqual(ceremony(state), [], "Nothing plays and nothing is marked seen");
  act(state, "announceEvent", { evId:"putt" });
  assert.deepEqual(ceremony(state), [["intro", "putt"]], "Another event's intro never pulls the held teams");
  act(state, "lockAndStart", { evId:"putt", ...refs(current(state, "putt")) });
  act(state, "beginResultEntry", { evId:"putt" });
  act(state, "saveResult", { evId:"putt", slots:[["Evan"], [], []], noScene:true });
  const device = phone();
  device.render(state); device.commitOnDeck(state.onDeck);
  act(state, "announceEvent", { evId:"pong" });
  assert.deepEqual(ceremony(state), [["intro", "pong"], ["reveal", "pong", state.draws.pong.id]]);
  assert.match(device.render(state, 3, "announceEvent"), /Lock and start/);
});

test("solo heats announce and draw in one write with the present players", () => {
  const state = fresh(["pingpong"]);
  act(state, "setAway", { player:"Khoa", away:true });
  const beat = director(state).nextAction;
  assert.equal(beat.type, "announce-draw");
  assert.equal(beat.players.includes("Khoa"), false);
  act(state, "announceAndDraw", { evId:"pingpong" });
  assert.equal(state.onDeck, "pingpong");
  const entrants = state.stages.pingpong.groups.flatMap(group => group.entrants);
  assert.equal(entrants.length, 12);
  assert.equal(entrants.includes("Khoa"), false);
  assert.deepEqual(ceremony(state), [["intro", "pingpong"], ["reveal", "pingpong", state.stages.pingpong.id]]);
});

test("a mis-tapped winner can be undone after the next contest starts; its chips go back named", () => {
  const state = fresh(["8ball"]);
  act(state, "announceAndDraw", { evId:"8ball" });
  const opening = current(state, "8ball");
  act(state, "lockAndStart", { evId:"8ball", ...refs(opening) });
  act(state, "recordContestWinner", { evId:"8ball", ...refs(current(state, "8ball")), winner:opening.sides[0].key }, gm("Evan"));
  assert.equal(state.eventOps["8ball"].lastContest.by, "Evan");
  assert.equal(state.eventOps["8ball"].contestLog.at(-1).by, "Evan");
  const next = current(state, "8ball");
  act(state, "placeWager", { wager:chip(state, "8ball", next.sides[0].key, 200) }, guest("Jeremy"));
  act(state, "lockAndStart", { evId:"8ball", ...refs(next) });
  assert.equal(current(state, "8ball").phase, "in-progress");
  const undo = contestUndoAvailability(state, eventOf(state, "8ball"));
  assert.equal(undo.enabled, true);
  assert.equal(refundText(state, undo.refunds), "Returns Jeremy 200");
  const result = act(state, "undoLastContest", { evId:"8ball", contestId:undo.contestId, contestRevision:undo.contestRevision });
  assert.deepEqual(result.extra.refunds, [{ player:"Jeremy", stake:200 }]);
  assert.equal(resolveWager(state, state.wagers[0], allEventsOf(state)).status, "void");
  assert.equal(computeStandings(state).find(row => row.player === "Jeremy").pts, 1000);
  const restored = current(state, "8ball");
  assert.equal(restored.id, opening.id);
  assert.equal(restored.phase, "in-progress");
  act(state, "recordContestWinner", { evId:"8ball", ...refs(restored), winner:opening.sides[1].key });
  assert.equal(state.brackets["8ball"].rounds[0][0].winner, opening.sides[1].key);
});

test("away players leave draws, FFA sides and poker seats; chips are untouched and it reverses", () => {
  const state = fresh();
  refuse(state, "setAway", { player:"Nobody", away:true }, /Unknown player/);
  refuse(state, "setAway", { player:"Evan", away:"yes" }, /away or here/);
  refuse(state, "setAway", { player:"Evan", away:true }, /Commissioner only/, guest("Evan"));
  act(state, "setAway", { player:"Evan", away:true });
  assert.equal(presentPlayers(state).includes("Evan"), false);
  assert.equal(current(state, "putt").sides.some(side => side.key === "Evan"), false, "FFA board skips away players");
  const ffaBoard = phone({ gm:false, player:"Khoa" });
  act(state, "announceEvent", { evId:"putt" });
  refuse(state, "placeWager", { wager:{ ...chip(state, "putt", "Khoa"), pick:"Evan" } }, /yourself|re-pick|current contest/, guest("Khoa"));
  assert.ok(ffaBoard.render(state));
  act(state, "setAway", { player:"Evan", away:false });
  assert.equal(current(state, "putt").sides.some(side => side.key === "Evan"), true);

  /* short rooms: 11 here plays five pairs (play-in into a four-team bracket) */
  const short = fresh(["8ball"]);
  for (const player of ["Evan", "Khoa"]) act(short, "setAway", { player, away:true });
  assert.deepEqual(teamFit(eventOf(short, "8ball"), 11), { teams:5, size:2, bracket:5, reduced:true });
  act(short, "announceAndDraw", { evId:"8ball" });
  assert.equal(short.draws["8ball"].teams.length, 5);
  assert.equal(short.draws["8ball"].roles.length, 1);
  assert.equal(short.brackets["8ball"].size, 5);
  assert.ok(short.draws["8ball"].teams.every(team => !team.players.includes("Evan") && !team.players.includes("Khoa")));
  assert.match(current(short, "8ball").label, /Play-in/);
  /* two-sided team games shrink evenly: 11 here plays 5 v 5 with one crew */
  assert.deepEqual(teamFit(eventOf(short, "volley"), 11), { teams:2, size:5, bracket:null, reduced:true });
  assert.equal(validateEventParticipants(eventOf(short, "volley"), presentPlayers(short).slice(0, 10), presentPlayers(short)).ok, true);

  /* heats accept any selection with at least two a heat */
  const heats = fresh();
  refuse(heats, "runStages", { evId:"pingpong", cfg:{ kind:"heats", nGroups:3, advance:1, players:ROSTER.slice(0, 5) } }, /at least 2/);
  act(heats, "runStages", { evId:"pingpong", cfg:{ kind:"heats", nGroups:3, advance:1, players:ROSTER.slice(0, 6),
    roles:[{ player:ROSTER[6], role:"scorekeeper" }] } });
  assert.equal(heats.stages.pingpong.roles.find(item => item.player === ROSTER[6]).role, "scorekeeper");

  /* poker: away players are not dealt in and carry their board total */
  const table = fresh(); table.live = true;
  act(table, "adjust", { player:"Evan", delta:300, reason:"test" });
  act(table, "setAway", { player:"Evan", away:true });
  act(table, "pokerSetup", {});
  assert.equal(table.poker.seats.includes("Evan"), false);
  assert.equal(table.poker.unseated.Evan, 1300);
  act(table, "pokerStart", {});
  refuse(table, "pokerCount", { player:"Evan", count:500 }, /Not seated/);
  table.poker.seats.forEach((player, index) => act(table, "pokerCount", { player, count:index === 0 ? 3000 : 900 }));
  act(table, "pokerResult", { noScene:true });
  assert.equal(computeStandings(table).find(row => row.player === "Evan").pts, 1300);
  assert.deepEqual(table.results.poker.slots[0], [table.poker.seats[0]]);
});

test("custom 2, 3 and 4 team events floor their size, put the remainder on crew, and can be played", () => {
  for (const [teams, size] of [[2, 6], [3, 4], [4, 3]]) {
    const state = fresh();
    const id = `custom-${teams}`;
    act(state, "addEvent", { ev:{ id, name:`${teams} teams`, value:400, kind:"team", teamCfg:{ teams, size } } });
    act(state, "announceAndDraw", { evId:id });
    assert.equal(state.draws[id].teams.length, teams);
    assert.ok(state.draws[id].teams.every(team => team.players.length === size));
    assert.equal(state.draws[id].roles.length, 13 - teams * size);
    assert.equal(state.onDeck, id);
  }
  refuse(fresh(), "addEvent", { ev:{ id:"big", name:"Too big", value:400, kind:"team", teamCfg:{ teams:4, size:4 } } }, /need 16 players/);
  /* a custom event that looks like poker is still a normal event */
  const state = fresh(["cash"]);
  act(state, "addEvent", { ev:{ id:"cash", name:"Cash game", value:400, kind:"solo", game:"poker", finale:true } });
  assert.equal(eventOf(state, "cash").finale, undefined);
  act(state, "announceEvent", { evId:"cash" });
  assert.equal(current(state, "cash").kind, "ffa");
  refuse(state, "setOnDeck", { id:"poker" }, /No betting on the finale|Close the current/);
});

test("the director offers Skip beside an unstarted event and points only at the crown after the finale", () => {
  const state = fresh(); state.live = true;
  assert.deepEqual(director(state).secondary, { type:"skip-event", label:"Skip Long Putt", eventId:"putt" });
  act(state, "announceEvent", { evId:"putt" });
  assert.equal(director(state).secondary?.type, "skip-event");
  act(state, "lockAndStart", { evId:"putt", ...refs(current(state, "putt")) });
  assert.equal(director(state).secondary, null, "No skip once play has started");

  const finale = fresh(); finale.live = true;
  act(finale, "pokerSetup", {});
  assert.equal(resolveWeekendOperation(finale).event.id, "poker", "The dealt table is the operation");
  assert.equal(director(finale).secondary, null);
  act(finale, "pokerStart", {});
  ROSTER.forEach((player, index) => act(finale, "pokerCount", { player, count:index === 0 ? 5000 : 675 }));
  act(finale, "pokerResult", { noScene:true });
  const operation = resolveWeekendOperation(finale);
  assert.equal(operation.event, null);
  assert.equal(operation.nextAction.type, "crown-champion");
  assert.equal(director(finale).nextAction.type, "crown-champion");
});

test("preparing or announcing another event never hijacks one being played", () => {
  const state = fresh(["8ball"]);
  act(state, "announceAndDraw", { evId:"8ball" });
  act(state, "lockAndStart", { evId:"8ball", ...refs(current(state, "8ball")) });
  refuse(state, "announceEvent", { evId:"putt" }, /Finish 8-Ball Doubles first/);
  refuse(state, "announceAndDraw", { evId:"pong" }, /Finish 8-Ball Doubles first/);
  act(state, "runDraw", { evId:"pong", ...suggestParticipants(state, eventOf(state, "pong")) });
  act(state, "startDraft", { evId:"volley", captains:["Evan", "Khoa"],
    players:ROSTER.slice(0, 12), roles:[{ player:ROSTER[12], role:"referee" }] });
  const beat = director(state);
  assert.equal(beat.event.id, "8ball");
  assert.equal(beat.nextAction.type, "record-contest-winner");
  assert.equal(beat.nextAction.label, "Record winner");
  assert.equal(beat.nextAction.subject, "Play-in 1");
  /* the pill shows both sides as winner targets and says who is playing */
  const contest = current(state, "8ball");
  const player = contest.players[0];
  const html = phone({ player }).render(state);
  assert.match(html, /Record winner/);
  assert.match(html, /Play-in 1/);
  for (const side of contest.sides) assert.ok(html.includes(`aria-label="Winner: ${side.players.join(" &amp; ")}"`));
  assert.match(html, /You’re playing/);
  /* an explicit override is still possible */
  const forced = structuredClone(state);
  act(forced, "announceEvent", { evId:"putt", force:true });
  assert.equal(forced.onDeck, "putt");
});

test("Play Match N next moves the one open market to another seated matchup while it is empty", () => {
  const state = fresh(["8ball"]);
  act(state, "announceAndDraw", { evId:"8ball" });
  const first = current(state, "8ball");
  assert.deepEqual(first.match, [0, 0]);
  refuse(state, "playContestNext", { evId:"8ball", ...refs(first), match:[1, 0] }, /not ready/);
  act(state, "playContestNext", { evId:"8ball", ...refs(first), match:[0, 1] });
  const moved = current(state, "8ball");
  assert.deepEqual(moved.match, [0, 1]);
  assert.equal(moved.phase, "betting-open");
  assert.ok(moved.revision > first.revision);
  assert.equal(state.onDeck, "8ball");
  assert.deepEqual(bracketOrder(state.brackets["8ball"])[0], [0, 1]);
  act(state, "placeWager", { wager:chip(state, "8ball", moved.sides[0].key) }, guest("Jeremy"));
  refuse(state, "playContestNext", { evId:"8ball", ...refs(moved), match:[0, 0] }, /Reorder once the chips on this match come off/);
  act(state, "lockAndStart", { evId:"8ball", ...refs(moved) });
  act(state, "recordContestWinner", { evId:"8ball", ...refs(current(state, "8ball")), winner:moved.sides[0].key });
  assert.equal(state.brackets["8ball"].next, undefined);
  assert.deepEqual(current(state, "8ball").match, [0, 0], "The bracket order resumes");
});

test("Swap in keeps the draw and team indices; only outright tickets on the player leaving are voided", () => {
  const state = fresh(["8ball"]);
  act(state, "announceAndDraw", { evId:"8ball" });
  const draw = state.draws["8ball"], contest = current(state, "8ball");
  const teamIdx = contest.sides[0].key, leaving = draw.teams[teamIdx].players[0];
  act(state, "placeWager", { wager:chip(state, "8ball", teamIdx) }, guest("Jeremy"));
  act(state, "swapPlayer", { evId:"8ball", out:leaving, into:"Jeremy" });
  assert.equal(state.draws["8ball"].id, draw.id);
  assert.ok(state.draws["8ball"].teams[teamIdx].players.includes("Jeremy"));
  assert.equal(state.draws["8ball"].roles.some(item => item.player === "Jeremy"), false);
  assert.equal(resolveWager(state, state.wagers[0], allEventsOf(state)).status, "pending");
  assert.ok(state.wagers[0].pickPlayers.includes("Jeremy"));
  act(state, "lockAndStart", { evId:"8ball", ...refs(current(state, "8ball")) });
  const other = current(state, "8ball").sides[1].key;
  refuse(state, "swapPlayer", { evId:"8ball", out:state.draws["8ball"].teams[other].players[0], into:leaving },
    /already started/);

  /* a two-team game: team tickets naming the player leaving are voided (one side per bettor) */
  const volley = fresh(["volley"]);
  act(volley, "announceAndDraw", { evId:"volley" });
  const crew = volley.draws.volley.roles[0].player;
  const team0 = volley.draws.volley.teams[0].players, team1 = volley.draws.volley.teams[1].players;
  act(volley, "placeWager", { wager:chip(volley, "volley", 0) }, guest(crew));
  act(volley, "placeWager", { wager:chip(volley, "volley", 1) }, guest(team1[0]));
  const result = act(volley, "swapPlayer", { evId:"volley", out:team0[0], into:crew });
  assert.equal(result.extra.voided, 1);
  const statuses = volley.wagers.map(wager => [wager.pickPlayers.includes(team1[0]), resolveWager(volley, wager, allEventsOf(volley)).status]);
  assert.deepEqual(statuses.sort(), [[false, "void"], [true, "pending"]]);

  /* solo heats: heat tickets on the player leaving are voided */
  const heats = fresh(["pingpong"]);
  act(heats, "announceAndDraw", { evId:"pingpong", players:ROSTER.slice(0, 12) });
  const heat = current(heats, "pingpong"), out = heat.sides[0].key;
  act(heats, "placeWager", { wager:chip(heats, "pingpong", out) }, guest(ROSTER[12]));
  act(heats, "swapPlayer", { evId:"pingpong", out, into:ROSTER[12] });
  assert.equal(resolveWager(heats, heats.wagers[0], allEventsOf(heats)).status, "void");
  assert.ok(heats.stages.pingpong.groups[heat.group].entrants.includes(ROSTER[12]));
});

test("check-in cannot rerun and the weekend cannot go back to the locker room once play starts", () => {
  const state = fresh();
  act(state, "setLive", { on:true });
  refuse(state, "rerunOnboarding", { force:true }, /weekend is live/);
  act(state, "setLive", { on:false }, gm());
  act(state, "announceEvent", { evId:"putt" });
  act(state, "lockAndStart", { evId:"putt", ...refs(current(state, "putt")) });
  refuse(state, "setLive", { on:false }, /stays live/);
});

test("per-device commissioner tokens: each unlock mints its own, exit and revoke sign one device out", async () => {
  const entries = new Map();
  const context = {
    blockConcurrencyWhile() {},
    getWebSockets() { return []; },
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
  tournament.gmToken = "earlier-shared-token";
  const send = async (deviceId, type, payload = {}, gmToken = null) => {
    const frames = [];
    await tournament.webSocketMessage({ send(frame) { frames.push(JSON.parse(frame)); } },
      JSON.stringify({ actionId:`t-${++serial}`, type, payload, deviceId, gmToken }));
    return frames.at(-1);
  };
  const a = (await send("phone-a", "gmUnlock", { pin:"unit-test-pin" })).extra.gmToken;
  const b = (await send("phone-b", "gmUnlock", { pin:"unit-test-pin" })).extra.gmToken;
  assert.ok(a && b && a !== b);
  assert.equal(JSON.stringify([...entries]).includes("unit-test-pin"), false, "The PIN is never stored");
  assert.ok(await tournament.gmTokenId(a));
  assert.ok(await tournament.gmTokenId("earlier-shared-token"), "The earlier shared token keeps working");
  const listed = await send("phone-a", "gmDevices", {}, a);
  assert.equal(listed.ok, true);
  assert.equal(listed.extra.devices.filter(device => device.current).length, 1);
  assert.equal(listed.extra.devices.some(device => device.legacy), true);
  assert.equal(JSON.stringify(listed.extra).includes(a), false, "Tokens never leave the server");
  assert.equal((await send("phone-c", "gmDevices", {}, "guess")).ok, false);
  await send("phone-b", "gmExit", {}, b);
  assert.equal(await tournament.gmTokenId(b), null);
  assert.ok(await tournament.gmTokenId(a));
  const other = listed.extra.devices.find(device => device.legacy);
  assert.equal((await send("phone-a", "gmRevoke", { id:other.id }, a)).ok, true);
  assert.equal(await tournament.gmTokenId("earlier-shared-token"), null);
  const again = (await send("phone-a", "gmUnlock", { pin:"unit-test-pin" })).extra.gmToken;
  assert.equal(await tournament.gmTokenId(a), null, "A new unlock replaces this device's old token");
  assert.ok(await tournament.gmTokenId(again));
  assert.equal(makeBracket(5).size, 5);
});
