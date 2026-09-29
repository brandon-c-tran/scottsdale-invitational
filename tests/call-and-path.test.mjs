import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* D9 "To the TV" (the commissioner's call, its bar on every phone and the
   pocket alert to phones that are not looking) and D10 "Your path after
   the draw" (the one line a synced reveal ends on for the players in it). */
globalThis.__FD_BUILD_ID__ = "build-test";

const {
  EMPTY_STATE, ROSTER, BUILTIN_EVENTS, allEventsOf, bracketMatchName, computeStandings, defaultQaParticipants,
  makeBracket, resolveSlot,
} = await import("../shared/core.js");
const { applyAction, confirmStart } = await import("./support/confirmed-start.mjs");
const { resolveDirector } = await import("../shared/show.js");
const {
  CALL_KINDS, CALL_MS, callLabel, callRemainingMs, callSuggestion, liveCall, manualCall, validateCall,
} = await import("../shared/call.js");
const { alertsFor } = await import("../worker/pushAlerts.js");
const { publicState } = await import("../worker/publicState.js");
const { Tournament } = await import("../worker/tournament.js");
const { alertRoute } = await import("../src/features/alerts/pocketAlerts.js");
const { bracketDrawPath, drawPath, drawPathText, stageDrawPath } = await import("../src/features/weekend/drawPath.js");
const { buildEventReveal, drawRevealGroups } = await import("../src/features/weekend/drawReveal.js");

const HOST = ROSTER[0], P1 = ROSTER[1], P2 = ROSTER[2];
let seq = 0;
const gm = (player = HOST) => ({ isGm:true, player, deviceId:"call-test", actionId:`ct-${++seq}` });
const guest = player => ({ isGm:false, player, deviceId:`dev-${player}`, actionId:`cg-${++seq}` });
const eventOf = id => BUILTIN_EVENTS.find(ev => ev.id === id);
const fresh = () => structuredClone(EMPTY_STATE);
const without = (state, key) => { const copy = structuredClone(state); delete copy[key]; return copy; };

/* ── D9: the call model ── */
test("a call names its ceremony from the event, never from the client", () => {
  const s = fresh();
  assert.equal(callLabel(s, null, { kind:"draw", eventId:"pong" }), "Beer Pong Doubles draw");
  assert.equal(callLabel(s, null, { kind:"event", eventId:"putt" }), "Long Putt");
  assert.equal(callLabel(s, null, { kind:"winner", eventId:"putt" }), "Long Putt winner");
  assert.equal(callLabel(s, null, { kind:"crown" }), "The champion");
  assert.equal(callLabel(s, null, { kind:"opening" }), "Field Day");
  assert.equal(callLabel(s, null, { kind:"tv" }), null);
  assert.equal(callLabel(s, null, { kind:"tv", eventId:"putt" }), "Long Putt");
  for (const kind of CALL_KINDS) {
    const label = callLabel(s, null, { kind, eventId:"putt" }) || "";
    assert.doesNotMatch(label, /[—!]/);
  }
  /* validation */
  assert.equal(validateCall(s, null, null).ok, false);
  assert.equal(validateCall(s, null, { kind:"party" }).ok, false);
  assert.equal(validateCall(s, null, { kind:"draw" }).error, "Choose a current event");
  assert.equal(validateCall(s, null, { kind:"draw", eventId:"nope" }).ok, false);
  assert.equal(validateCall(s, null, { kind:"winner", eventId:"putt" }).error, "Post the result first");
  assert.equal(validateCall(s, null, { kind:"crown" }).error, "Post the counts first");
  const shelved = { ...fresh(), shelved:{ putt:true } };
  assert.equal(validateCall(shelved, null, { kind:"event", eventId:"putt" }).error, "That event is shelved");
  assert.deepEqual(validateCall(s, null, { kind:"draw", eventId:"pong", label:"<b>free text</b>" }).call,
    { kind:"draw", eventId:"pong", label:"Beer Pong Doubles draw" });
});

test("a call lasts ninety seconds on the server's clock and ignores records it does not know", () => {
  const s = fresh();
  s.showControl.call = { id:"call-1", at:1_000_000, kind:"draw", eventId:"pong", label:"Beer Pong Doubles draw" };
  assert.equal(CALL_MS, 90_000);
  assert.equal(liveCall(s, 1_000_000)?.id, "call-1");
  assert.equal(liveCall(s, 1_000_000 + CALL_MS - 1)?.id, "call-1");
  assert.equal(liveCall(s, 1_000_000 + CALL_MS), null);
  assert.equal(callRemainingMs(s.showControl.call, 1_030_000), 60_000);
  assert.equal(liveCall({ ...s, showControl:{ call:{ id:"x", at:1_000_000, kind:"future" } } }, 1_000_001), null);
  assert.equal(liveCall({ ...s, showControl:{ call:{ id:"x", at:"soon", kind:"tv" } } }, 1_000_001), null);
  assert.equal(liveCall(fresh(), 1), null, "old states have no call");
});

test("the commissioner is offered the ceremony that comes next, or the one on the TV", () => {
  const s = fresh();
  const events = allEventsOf(s);
  /* Friday, nothing yet: the opening (with Show Control), else the first announcement */
  const opening = callSuggestion(s, events, resolveDirector(s, events, { showControl:true }), 0);
  assert.deepEqual(opening, { kind:"opening", eventId:null, label:"Field Day" });
  const first = callSuggestion(s, events, resolveDirector(s, events), 0);
  assert.equal(first.kind, "event");
  assert.equal(first.label, eventOf(first.eventId).name);
  /* a draw event: the announce-and-draw beat */
  const ev = eventOf("8ball");
  const director = { event:ev, nextAction:{ type:"announce-draw", eventId:ev.id } };
  assert.deepEqual(callSuggestion(s, events, director, 0), { kind:"draw", eventId:"8ball", label:"8-Ball Doubles draw" });
  /* once announced, the announcement stays callable while it plays out */
  assert.equal(applyAction(s, "announceAndDraw", { evId:"8ball", players:defaultQaParticipants(ev) }, gm()).ok, true);
  const at = s.eventOps["8ball"].announcedAt;
  assert.equal(callSuggestion(s, events, null, at + 10_000)?.kind, "draw");
  assert.equal(callSuggestion(s, events, null, at + CALL_MS + 1), null);
  /* a winner scene on the TV, and the crown */
  const scene = { ...fresh(), results:{ putt:{ slots:[[P1]], revision:1, ts:1 } },
    showControl:{ active:{ id:"s", kind:"winner", eventId:"putt", step:0 }, history:[] } };
  assert.deepEqual(callSuggestion(scene, events, null, 0), { kind:"winner", eventId:"putt", label:"Long Putt winner" });
  const crown = { ...fresh(), frozen:true };
  assert.equal(callSuggestion(crown, events, { nextAction:{ type:"start-champion-scene" } }, 0)?.kind, "crown");
  /* nothing ceremonial near: no suggestion, and the manual call names the event in play */
  const quiet = { ...fresh(), live:true };
  assert.equal(callSuggestion(quiet, events, { event:eventOf("putt"), nextAction:{ type:"lock-start" } }, 0), null);
  assert.deepEqual(manualCall(quiet, events, { event:eventOf("putt") }), { kind:"tv", eventId:"putt", label:"Long Putt" });
  assert.deepEqual(manualCall(quiet, events, null), { kind:"tv", eventId:null, label:null });
});

/* ── D9: the server write ── */
test("callEveryone is the commissioner's own write: validated, labelled, and nothing else moves", () => {
  const s = fresh();
  s.live = true;
  assert.equal(applyAction(s, "callEveryone", { kind:"event", eventId:"putt" }, guest(P1)).error, "Commissioner only");
  assert.equal(applyAction(s, "callEveryone", { kind:"bogus" }, gm()).ok, false);
  assert.equal(applyAction(s, "callEveryone", { kind:"winner", eventId:"putt" }, gm()).error, "Post the result first");
  const before = structuredClone(s);
  const t0 = Date.now();
  const result = applyAction(s, "callEveryone", { kind:"event", eventId:"putt", label:"ignored" }, gm());
  assert.equal(result.ok, true, result.error);
  const call = s.showControl.call;
  assert.equal(call.id, result.extra.callId);
  assert.equal(call.kind, "event");
  assert.equal(call.eventId, "putt");
  assert.equal(call.label, "Long Putt");
  assert.ok(call.at >= t0 && call.at <= Date.now());
  /* presentation only: the tournament is untouched */
  assert.deepEqual(without(s, "showControl"), without(before, "showControl"));
  assert.deepEqual(s.showControl.active, before.showControl.active);
  assert.deepEqual(computeStandings(s), computeStandings(before));

  /* a second tap on the same ceremony is the same call */
  const again = applyAction(s, "callEveryone", { kind:"event", eventId:"putt" }, gm());
  assert.equal(again.extra.unchanged, true);
  assert.equal(s.showControl.call.id, call.id);
  /* another ceremony replaces it */
  const other = applyAction(s, "callEveryone", { kind:"tv" }, gm());
  assert.equal(other.ok, true);
  assert.notEqual(s.showControl.call.id, call.id);
  assert.equal(s.showControl.call.label, null);
  /* ending it: only the call up now, only the commissioner */
  assert.equal(applyAction(s, "endCall", { id:s.showControl.call.id }, guest(P1)).ok, false);
  assert.equal(applyAction(s, "endCall", { id:"call-stale" }, gm()).extra.unchanged, true);
  assert.equal(applyAction(s, "endCall", { id:s.showControl.call.id }, gm()).ok, true);
  assert.equal(s.showControl.call, null);
  assert.equal(applyAction(s, "endCall", {}, gm()).extra.unchanged, true);
  /* an expired call is not the same call: tapping again calls afresh */
  applyAction(s, "callEveryone", { kind:"event", eventId:"putt" }, gm());
  s.showControl.call.at -= CALL_MS + 1;
  const old = s.showControl.call.id;
  assert.equal(applyAction(s, "callEveryone", { kind:"event", eventId:"putt" }, gm()).extra.unchanged, undefined);
  assert.notEqual(s.showControl.call.id, old);
});

test("a call works on a frozen board and while the poker table holds it, and every view receives it", () => {
  const s = fresh();
  s.frozen = true;
  assert.equal(applyAction(s, "callEveryone", { kind:"crown" }, gm()).ok, true);
  assert.equal(s.showControl.call.label, "The champion");
  for (const viewer of [{ isGm:true }, { player:P1 }, {}]) {
    const view = publicState(s, viewer);
    assert.deepEqual(view.showControl.call, s.showControl.call, "the call is public presentation state");
    assert.doesNotMatch(JSON.stringify(view.showControl.call), /device|requestKey/);
  }
  /* the dealt poker table blocks every other board write, not the call */
  const table = fresh();
  const dealt = applyAction(table, "pokerSetup", {}, gm());
  assert.equal(dealt.ok, true, dealt.error);
  assert.equal(applyAction(table, "announceEvent", { evId:"putt" }, gm()).ok, false, "the table holds the board");
  assert.equal(applyAction(table, "callEveryone", { kind:"tv" }, gm()).ok, true);
  assert.equal(applyAction(table, "endCall", {}, gm()).ok, true);
  /* a call never touches or starts a scene, and a scene write keeps the call */
  const show = fresh();
  show.results = { putt:{ slots:[[P1]], revision:1, ts:1 } };
  applyAction(show, "callEveryone", { kind:"winner", eventId:"putt" }, gm());
  const ctx = { ...gm(), showControl:true };
  assert.equal(applyAction(show, "startShowScene", { kind:"winner", eventId:"putt" }, ctx).ok, true);
  assert.equal(show.showControl.call.kind, "winner");
});

/* ── D9: pocket alerts ── */
test("a new call alerts every present player but the caller, once per call", () => {
  const prev = fresh();
  const next = structuredClone(prev);
  next.away = { [P2]:true };
  assert.equal(applyAction(next, "callEveryone", { kind:"draw", eventId:"pong" }, gm()).ok, true);
  const got = alertsFor(prev, next, { actor:HOST }).filter(alert => alert.reason === "call");
  const expected = ROSTER.filter(player => player !== HOST && player !== P2).sort();
  assert.deepEqual(got.map(alert => alert.player).sort(), expected);
  for (const alert of got) {
    assert.equal(alert.key, `call:${alert.player}:${next.showControl.call.id}`);
    assert.equal(alert.message.title, "To the TV");
    assert.equal(alert.message.body, "Beer Pong Doubles draw");
    assert.equal(alert.message.url, "/?alert=call");
    assert.deepEqual(alertRoute(`https://fielddayseries.com${alert.message.url}`), { reason:"call", ev:null });
  }
  /* the same call on both sides of a later write owes nothing */
  const later = structuredClone(next);
  later.live = true;
  assert.deepEqual(alertsFor(next, later).filter(alert => alert.reason === "call"), []);
  /* ending it owes nothing either */
  const ended = structuredClone(next);
  applyAction(ended, "endCall", {}, gm());
  assert.deepEqual(alertsFor(next, ended).filter(alert => alert.reason === "call"), []);
  /* a manual call without a label still says where */
  const bare = structuredClone(prev);
  applyAction(bare, "callEveryone", { kind:"tv" }, gm());
  const one = alertsFor(prev, bare, { actor:HOST }).find(alert => alert.reason === "call");
  assert.equal(one.message.title, "To the TV");
  assert.equal(one.message.body, "");
});

function memoryContext() {
  const entries = new Map(), sockets = [], pending = [];
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
  return { entries, sockets, pending,
    context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil:p => pending.push(p) } };
}
async function vapidPair() {
  const b64u = bytes => Buffer.from(bytes).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey:b64u(raw), privateKey:(await crypto.subtle.exportKey("jwk", pair.privateKey)).d };
}
async function browserKeys() {
  const pair = await crypto.subtle.generateKey({ name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { p256dh:Buffer.from(raw).toString("base64url"),
    auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") };
}

test("the Durable Object sends a call's alert to pockets only, once, and never lets it touch the write", async () => {
  const memory = memoryContext();
  const vapid = await vapidPair();
  const tournament = new Tournament(memory.context, { APP_ENV:"local", VAPID_PUBLIC_KEY:vapid.publicKey,
    VAPID_PRIVATE_KEY:vapid.privateKey, VAPID_SUBJECT:"https://fielddayseries.com" });
  await tournament.hydrateFromStorage();
  tournament.gmToken = "gm-token-call";
  const sent = [];
  tournament.pushFetch = async url => { sent.push(url); return new Response(null, { status:201 }); };
  let n = 0;
  const say = async (ws, deviceId, message, gmMode = false) => {
    const actionId = `c${++n}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, ...message,
      ...(message.payload !== undefined ? { payload:confirmStart(message.type, message.payload) } : {}),
      deviceId, ...(gmMode ? { gmToken:"gm-token-call" } : {}) }));
    return ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
  };
  const phones = {};
  for (const [index, player] of ROSTER.slice(0, 5).entries()) {
    let attachment = null;
    const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
      serializeAttachment(value) { attachment = structuredClone(value); }, deserializeAttachment() { return attachment; }, close() {} };
    memory.sockets.push(ws);
    const deviceId = `device-${player}-0000-4000-8000-${String(index).padStart(12, "0")}`;
    /* the host and P1 are looking at the app; the rest are pocketed */
    await say(ws, deviceId, { type:"hello", payload:{ view:"app", visible:player === HOST || player === P1 } });
    await say(ws, deviceId, { type:"claim", payload:{ player } });
    const keys = await browserKeys();
    const endpoint = `https://web.push.apple.com/${player}`;
    const ack = await say(ws, deviceId, { type:"pushSubscribe", payload:{ endpoint, keys } });
    assert.equal(ack.ok, true, ack.error);
    phones[player] = { ws, deviceId, endpoint };
  }
  const host = phones[HOST];
  const ack = await say(host.ws, host.deviceId, { type:"callEveryone", payload:{ kind:"event", eventId:"putt" } }, true);
  assert.equal(ack.ok, true, ack.error);
  while (memory.pending.length) await memory.pending.shift();
  const pocketed = ROSTER.slice(0, 5).filter(player => player !== HOST && player !== P1);
  assert.deepEqual([...sent].sort(), pocketed.map(player => phones[player].endpoint).sort());
  /* every phone received the call in its frame */
  const frame = phones[P1].ws.frames.filter(item => item.type === "state").at(-1);
  assert.equal(frame.state.showControl.call.label, "Long Putt");
  /* the same tap again: acknowledged, no second broadcast, no second alert */
  const frames = phones[P1].ws.frames.length;
  const repeat = await say(host.ws, host.deviceId, { type:"callEveryone", payload:{ kind:"event", eventId:"putt" } }, true);
  assert.equal(repeat.ok, true);
  while (memory.pending.length) await memory.pending.shift();
  assert.equal(sent.length, pocketed.length);
  assert.equal(phones[P1].ws.frames.length, frames);
  /* a guest cannot call */
  const refused = await say(phones[P2].ws, phones[P2].deviceId, { type:"callEveryone", payload:{ kind:"tv" } });
  assert.equal(refused.ok, false);
});

/* ── D10: the path model ── */
const soloBracket = n => {
  const s = fresh();
  const players = ROSTER.slice(0, n);
  s.draws.bball1 = { id:`d-${n}`, teams:players.map(player => ({ players:[player] })), ts:1 };
  s.brackets.bball1 = makeBracket(n);
  return { s, players };
};

test("a bracket of 4 to 13 draws every player's path from their first match to the final, byes included", () => {
  for (let n = 4; n <= 13; n++) {
    const { s, players } = soloBracket(n);
    const bracket = s.brackets.bball1, finalRound = bracket.rounds.length - 1;
    for (const [team, player] of players.entries()) {
      const path = bracketDrawPath(s, "bball1", player);
      assert.ok(path, `${n}: ${player}`);
      assert.equal(path.team, team);
      const first = path.steps[0];
      const [r0, m0] = first.id.split(":").map(Number);
      const match = bracket.rounds[r0][m0];
      assert.ok(resolveSlot(bracket, match.a) === team || resolveSlot(bracket, match.b) === team, "starts where seated");
      /* a first-round bye enters later: everyone plays in round 1 only if seated there */
      const inRoundOne = bracket.rounds[0].some(item => resolveSlot(bracket, item.a) === team || resolveSlot(bracket, item.b) === team);
      assert.equal(r0 === 0, inRoundOne, `${n}: ${player} bye`);
      assert.equal(path.steps.length, finalRound - r0 + 1, "one stop per round to the final");
      assert.equal(path.steps.at(-1).final, true);
      assert.equal(path.steps.at(-1).label, "Final");
      path.steps.forEach((step, index) => {
        const [r, m] = step.id.split(":").map(Number);
        assert.equal(r, r0 + index);
        assert.equal(step.label, bracketMatchName(bracket, r, m));
        assert.ok(step.opponents?.length || step.from, "an opponent or the match that decides it");
        if (step.opponents) assert.ok(!step.opponents.includes(player));
        if (step.from) assert.match(step.from, /\S/);
        for (const team of step.candidates) assert.ok(team.length && !team.includes(player));
      });
      /* the first opponent is named, unless you wait on a match */
      const other = resolveSlot(bracket, match.a) === team ? match.b : match.a;
      if (other.t !== undefined) assert.deepEqual(first.opponents, [players[other.t]]);
      else assert.equal(first.from, bracketMatchName(bracket, other.w[0], other.w[1]));
      assert.doesNotMatch(drawPathText(path), /[—!]|undefined|null/);
    }
    assert.equal(bracketDrawPath(s, "bball1", ROSTER[13] || "Nobody"), null, "not in the draw");
  }
});

test("a decided match reads as won or lost, and a loss ends the path", () => {
  const { s, players } = soloBracket(4);
  const bracket = s.brackets.bball1;
  const a = resolveSlot(bracket, bracket.rounds[0][0].a), b = resolveSlot(bracket, bracket.rounds[0][0].b);
  bracket.rounds[0][0].winner = a;
  const winner = bracketDrawPath(s, "bball1", players[a]);
  assert.equal(winner.steps[0].won, true);
  assert.equal(winner.steps.length, 2);
  const loser = bracketDrawPath(s, "bball1", players[b]);
  assert.equal(loser.steps.length, 1);
  assert.equal(loser.steps[0].lost, true);
  /* the other semifinal's winner now knows exactly whom the final might bring */
  const c = resolveSlot(bracket, bracket.rounds[0][1].a);
  const final = bracketDrawPath(s, "bball1", players[c]).steps[1];
  assert.deepEqual(final.opponents, [players[a]]);
});

test("the real 8-ball draw: pairs, byes to the semifinals, and candidates for the next round", () => {
  const s = fresh();
  const ev = eventOf("8ball");
  assert.equal(applyAction(s, "announceAndDraw", { evId:ev.id, players:defaultQaParticipants(ev) }, gm()).ok, true);
  const reveal = buildEventReveal(s, ev);
  const draw = s.draws["8ball"];
  for (const [index, team] of draw.teams.entries()) {
    const path = drawPath(s, reveal, team.players[0]);
    assert.equal(path.kind, "bracket");
    assert.equal(path.team, index);
    const bye = !s.brackets["8ball"].rounds[0].some(match => [match.a.t, match.b.t].includes(index));
    assert.equal(path.steps.length, bye ? 2 : 3);
    if (bye) {
      assert.match(path.steps[0].label, /^Semifinal/);
      assert.equal(path.steps[0].candidates.length, 2, "the play-in's two pairs");
      assert.ok(path.steps[0].candidates.every(pair => pair.length === 2));
    } else {
      assert.match(path.steps[0].label, /^Play-in/);
      assert.equal(path.steps[0].opponents.length, 2);
      assert.equal(path.steps[1].opponents.length, 2, "the seed waiting in the semifinal is known");
    }
  }
  /* the crew and anyone left out get nothing new */
  const outside = ROSTER.find(player => !draw.teams.some(team => team.players.includes(player)));
  if (outside) assert.equal(drawPath(s, reveal, outside), null);
  assert.equal(drawPath(s, { ...reveal, id:"old-draw" }, draw.teams[0].players[0]), null, "a stale reveal has no path");
});

test("heats and pools: your group, its rivals, who goes through, then the final", () => {
  const players = ROSTER.slice(0, 12);
  const heats = fresh();
  heats.stages.pingpong = { id:"st-1", eventId:"pingpong", kind:"heats", advance:1, entrantType:"solo",
    groups:[{ name:"Heat 1", entrants:players.slice(0, 4) }, { name:"Heat 2", entrants:players.slice(4, 8) },
      { name:"Heat 3", entrants:players.slice(8, 12) }] };
  const path = drawPath(heats, { id:"st-1", evId:"pingpong" }, players[5]);
  assert.equal(path.kind, "stage");
  assert.deepEqual(path.steps.map(step => step.label), ["Heat 2", "Final"]);
  assert.deepEqual(path.steps[0].opponents, [players[4], players[6], players[7]]);
  assert.equal(path.steps[0].note, "Winner goes through");
  assert.equal(path.steps[1].final, true);
  assert.equal(path.steps[1].from, "3 heat winners");
  assert.equal(drawPathText(path), `Heat 2 vs ${players[4]} & ${players[6]} & ${players[7]} (Winner goes through), then Final vs 3 heat winners`);
  /* two through */
  heats.stages.pingpong.advance = 2;
  assert.equal(stageDrawPath(heats, "pingpong", players[0]).steps[0].note, "Top 2 go through");
  /* knocked out in the heat: the final drops away */
  heats.stages.pingpong.advance = 1;
  heats.stages.pingpong.groups[1].through = [players[4]];
  const out = stageDrawPath(heats, "pingpong", players[5]);
  assert.equal(out.steps.length, 1);
  assert.equal(out.steps[0].lost, true);
  assert.equal(stageDrawPath(heats, "pingpong", players[4]).steps[0].won, true);
  assert.equal(drawPath(heats, { id:"st-1", evId:"pingpong" }, ROSTER[12]), null, "a spectator");

  /* pools of pairs, from the real spikeball setup */
  const pools = fresh();
  const spike = eventOf("spike");
  assert.equal(applyAction(pools, "announceAndDraw", { evId:"spike", players:defaultQaParticipants(spike) }, gm()).ok, true);
  const stage = pools.stages.spike;
  assert.ok(stage, "announce and draw sets up the pools");
  const me = pools.draws.spike.teams[0].players[0];
  const partner = pools.draws.spike.teams[0].players[1];
  for (const reveal of [{ id:stage.id, evId:"spike" }, { id:pools.draws.spike.id, evId:"spike" }]) {
    const poolPath = drawPath(pools, reveal, me);
    assert.equal(poolPath.kind, "stage");
    assert.match(poolPath.steps[0].label, /\S/);
    assert.equal(poolPath.steps[0].opponents.includes(partner), false, "your partner is not your rival");
    assert.equal(poolPath.steps[0].opponents.length % 2, 0, "rival pairs");
    assert.equal(poolPath.steps[1].from, `${stage.groups.length} pool winner${stage.groups.length === 1 ? "" : "s"}`);
  }
  /* a two-team game has no path beyond the matchup on screen */
  const volley = fresh();
  assert.equal(applyAction(volley, "announceAndDraw", { evId:"volley", players:defaultQaParticipants(eventOf("volley")) }, gm()).ok, true);
  const vr = buildEventReveal(volley, eventOf("volley"));
  assert.equal(drawPath(volley, vr, volley.draws.volley.teams[0].players[0]), null);
});

/* ── components ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`export { DrawAnnouncement } from "./src/features/weekend/EventAnnouncement.jsx";
    export { CallBar } from "./src/features/call/CallBar.jsx";
    export { CallChip } from "./src/features/call/CallChip.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("call-and-path.cjs", import.meta.url)));
mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { DrawAnnouncement, CallBar, CallChip, PlayerIdentityProvider } = mod.exports;
function render(Component, props) {
  const buttons = [], create = React.createElement;
  React.createElement = (type, attributes, ...children) => {
    if (type === "button") buttons.push(attributes);
    return create(type, attributes, ...children);
  };
  try {
    return { html:renderToStaticMarkup(create(PlayerIdentityProvider, { profiles:props.state.profiles }, create(Component, props))), buttons };
  } finally { React.createElement = create; }
}

test("the phone bar says where and what, counts down, and stays out of the commissioner's way", () => {
  const s = fresh();
  s.showControl.call = { id:"call-9", at:500_000, kind:"draw", eventId:"pong", label:"Beer Pong Doubles draw" };
  const { html, buttons } = render(CallBar, { state:s, now:() => 530_000 });
  assert.match(html, /fd-call-bar/);
  assert.match(html, /<span>To the TV<\/span><b>Beer Pong Doubles draw<\/b>/);
  assert.match(html, /--call-ms:90000ms;--call-elapsed:-30000ms/, "the drain starts part-way for a late phone");
  assert.doesNotMatch(html, /is-arriving/, "a bar found on load does not slide in");
  const dismiss = buttons.find(button => /Dismiss/.test(button["aria-label"] || ""));
  assert.equal(dismiss["aria-label"], "Dismiss To the TV: Beer Pong Doubles draw");
  assert.equal(render(CallBar, { state:s, hidden:true, now:() => 530_000 }).html, "");
  assert.equal(render(CallBar, { state:s, now:() => 500_000 + CALL_MS }).html, "", "gone when time is up");
  const bare = structuredClone(s);
  bare.showControl.call.label = null;
  assert.match(render(CallBar, { state:bare, now:() => 530_000 }).html, /<span>To the TV<\/span><\/p>/);
  assert.doesNotMatch(html, /[—!]/);
});

test("the commissioner's chip: one tap near a ceremony, two taps by hand, and End while it is up", async () => {
  const s = fresh();
  const events = allEventsOf(s);
  const sent = [];
  const send = async (type, payload) => { sent.push([type, payload]); return { ok:true }; };
  const ev = eventOf("8ball");
  const director = { event:ev, nextAction:{ type:"announce-draw", eventId:ev.id } };
  const near = render(CallChip, { state:s, events, director, send, now:() => 0 });
  assert.match(near.html, /Call everyone/);
  assert.match(near.html, /To the TV: 8-Ball Doubles draw/);
  const tap = near.buttons.find(button => button.className === "fd-call-chip");
  await tap.onClick();
  assert.deepEqual(sent.pop(), ["callEveryone", { kind:"draw", eventId:"8ball" }]);

  /* nothing near: a small TV button with a clear name */
  const quiet = render(CallChip, { state:{ ...s, live:true }, events, director:{ event:eventOf("putt"), nextAction:{ type:"lock-start" } },
    send, now:() => 0 });
  const compact = quiet.buttons.find(button => button["aria-label"] === "Call everyone to the TV");
  assert.ok(compact, "the manual call is always within reach");
  assert.equal(quiet.buttons.length, 1);
  assert.equal(sent.length, 0, "the first tap only shows what it will call");

  /* a call is up: it counts down and can be ended */
  const live = structuredClone(s);
  live.showControl.call = { id:"call-5", at:1_000, kind:"draw", eventId:"8ball", label:"8-Ball Doubles draw" };
  const up = render(CallChip, { state:live, events, director, send, now:() => 1_000 + 18_000 });
  assert.match(up.html, /Called/);
  assert.match(up.html, /8-Ball Doubles draw · 1:12/);
  await up.buttons.find(button => button.children === "End" || button.className === "fd-call-chip-end").onClick();
  assert.deepEqual(sent.pop(), ["endCall", { id:"call-5" }]);
});

function eightBall() {
  const state = fresh();
  const ev = eventOf("8ball");
  assert.equal(applyAction(state, "announceAndDraw", { evId:ev.id, players:defaultQaParticipants(ev) }, gm()).ok, true);
  return { state, ev, reveal:buildEventReveal(state, ev) };
}

test("the synced reveal ends on your path; spectators and replays end as before", () => {
  const { state, reveal } = eightBall();
  const me = state.draws["8ball"].teams[0].players[0];
  const later = () => Number(state.eventOps["8ball"].announcedAt) + 60_000;
  const mine = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:false, now:later, onClose:() => {},
    onBets:() => {} });
  assert.match(mine.html, /class="fd-draw-footer"/, "joined after the end: the path is simply there");
  assert.doesNotMatch(mine.html, /is-drawing/);
  assert.match(mine.html, /role="img" aria-label="Your path: (Play-in|Semifinal) \d vs /);
  assert.match(mine.html, /<b>You<\/b>/);
  assert.match(mine.html, /<b>Final<\/b>/);
  /* the hand-off to Bets sits right under it */
  assert.match(mine.html, /fd-draw-footer[\s\S]*Place chips[\s\S]*Done/);

  /* a spectator (or the crew) sees the reveal end as before */
  const outside = ROSTER.find(player => !state.draws["8ball"].teams.some(team => team.players.includes(player)));
  if (outside) {
    const spectator = render(DrawAnnouncement, { state, reveal, me:outside, synced:true, reducedMotion:false, now:later, onClose:() => {} });
    assert.doesNotMatch(spectator.html, /fd-draw-path|fd-draw-footer/);
  }
  /* a replay from the event sheet is not the ceremony */
  const replay = render(DrawAnnouncement, { state, reveal, me, initialComplete:true, reducedMotion:false, onClose:() => {} });
  assert.doesNotMatch(replay.html, /fd-draw-path/);
  /* reduced motion: the line as it lies */
  const reduced = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:true, onClose:() => {} });
  assert.match(reduced.html, /class="fd-draw-footer"/);
  assert.doesNotMatch(reduced.html, /is-drawing/);
  /* covered cards never show a path early */
  const early = render(DrawAnnouncement, { state, reveal, me, synced:true, reducedMotion:false,
    now:() => Number(state.eventOps["8ball"].announcedAt), onClose:() => {} });
  assert.doesNotMatch(early.html, /fd-draw-path/);
  /* the path names only real people */
  const groups = drawRevealGroups(state, reveal);
  assert.ok(groups.length);
  assert.doesNotMatch(mine.html, /undefined|null winner/);
});
