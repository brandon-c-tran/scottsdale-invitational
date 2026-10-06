/* Arrivals (Oct 4) as redesigned the same day: the TV is the lobby until
   the first game is announced, a guest checks in by scanning the TV's code
   (in the app's own scanner, or a claimed browser opening the QR's link),
   and after the lobby the code rides a corner plate. The code is private
   to the Durable Object and TV sockets. These read the pure models, run
   the real reducer and the real Durable Object in memory, and render the
   real components. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_EVENTS, EDITION, EMPTY_STATE, ROSTER, computeStandings, isArriveCode } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { publicState } from "../worker/publicState.js";
import { Tournament } from "../worker/tournament.js";
import {
  arriveCodeFrom, arriveLinkStep, arrivalOffer, arrivalState, arrivalsBoard, arriveUrl, droppingSeats, etaOf, landedAt,
  lobbyOver, lobbySeats, stripArriveParam,
} from "../src/features/arrivals/arrivalsModel.js";
import { createScanSession, readArriveFrame } from "../src/features/arrivals/scanSession.js";
import { crewCheckModel, seatChoices } from "../src/features/director/crewCheck.js";
import { commissionerMenu } from "../src/features/director/menuModel.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = buildSync({
  stdin:{ contents:`
    export { GuestHome } from "./src/features/home/GuestHome.jsx";
    export { Leaderboard } from "./src/features/standings/Standings.jsx";
    export { TVLobby, TVArriveCorner, QrPlate, arriveNameSize, CORNER_W } from "./src/features/tv/TVArrivals.jsx";
    export { RosterSheet, rosterStateOf, doorCount } from "./src/features/roster/RosterSheet.jsx";
    export { TravelApparelSheet } from "./src/features/travel/Travel.jsx";
    export { cameraFailure } from "./src/features/arrivals/Scanner.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "three", "jsqr"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const componentModule = new Module(fileURLToPath(new URL("arrivals-ui.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const ui = componentModule.exports;

let serial = 0;
const gm = () => ({ isGm:true, player:"Brandon", deviceId:"gm", actionId:`g${++serial}`, environment:"local" });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const fresh = () => structuredClone(EMPTY_STATE);
const FRIDAY = Date.parse(EDITION.arriveFrom);
const TV_CODE = "FDTVK7QX";
const noop = () => {};
const Stub = () => null;
const render = (Component, props, state) => renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider,
  { profiles:state.profiles }, React.createElement(Component, props)));
/* the door open with the first `n` of the roster in (the commissioner marks them: no code) */
function door(n) {
  const state = fresh();
  act(state, "setArrivalsOpen", { open:true });
  ROSTER.slice(0, n).forEach(player => act(state, "setArrived", { player, arrived:true }));
  return state;
}
const count = (html, pattern) => (html.match(pattern) || []).length;

/* ── the pure model ── */

test("arrivals model: a Friday flight's time is a server instant at the house", () => {
  assert.equal(landedAt("00:00"), FRIDAY);
  assert.equal(landedAt("14:35"), FRIDAY + (14 * 60 + 35) * 60000);
  for (const bad of [null, "", "24:00", "9:5", "noon"]) assert.equal(landedAt(bad), null, String(bad));
  const state = { profiles:{ Ben:{ flightIn:{ time:"09:55" } } }, arrivals:{ landed:["Allan"] } };
  assert.equal(etaOf(state, "Allan"), null, "no time ever reaches another phone");
  assert.equal(etaOf(state, "Ben"), "09:55", "the profile's own leg, where this screen has it");
});

test("arrivals model: the lobby runs from check-in opening to the first announcement, then the corner while anyone is out", () => {
  /* weeks early, nothing */
  assert.equal(arrivalsBoard(fresh(), FRIDAY - 60000).stage, "off");
  /* Friday at the house, the door untouched: the lobby with nobody in yet */
  const friday = arrivalsBoard(fresh(), FRIDAY + 60000);
  assert.equal(friday.stage, "lobby");
  assert.equal(friday.here, 0);
  /* the commissioner opened it early (staging): the lobby fills */
  const nine = door(9);
  const board = arrivalsBoard(nine, FRIDAY - 86400000 * 20);
  assert.equal(board.stage, "lobby");
  assert.equal(board.here, 9);
  assert.deepEqual(board.seats.map(seat => seat.player), ROSTER, "roster order, so a seat never moves");
  assert.deepEqual(board.onTheWay, ROSTER.slice(9));
  /* the first game announced ends the lobby; four still out: the corner */
  assert.equal(lobbyOver(nine), false);
  act(nine, "announceEvent", { evId:"putt" });
  assert.equal(lobbyOver(nine), true);
  assert.equal(arrivalsBoard(nine).stage, "corner");
  /* a mistaken start sent back to the locker room brings the lobby back */
  act(nine, "returnToLockerRoom", {});
  assert.equal(arrivalsBoard(nine).stage, "lobby");
  /* everyone in after the lobby: nothing; a closed door: nothing; frozen: nothing */
  const all = door(13);
  act(all, "announceEvent", { evId:"putt" });
  assert.equal(arrivalsBoard(all).stage, "off");
  const shut = door(4);
  act(shut, "setArrivalsOpen", { open:false });
  assert.equal(arrivalsBoard(shut, FRIDAY + 3600000).stage, "off", "a closed door stays closed, even on Friday");
  assert.equal(arrivalsBoard({ ...door(4), frozen:true }).stage, "off");
  /* the lobby with all thirteen in is full: the code steps aside */
  assert.equal(arrivalsBoard(door(13)).full, true);
});

test("arrivals model: Landed lights once a flight's time has passed, and only fresh arrivals drop", () => {
  const state = door(4);
  ROSTER.slice(0, 4).forEach((player, i) => { state.arrivals.at[player] = FRIDAY + i * 60000; });
  state.profiles.Jeremy = { flightIn:{ air:"AA", num:"1", time:"12:40" } };
  state.profiles.Ben = { flightIn:{ air:"AA", num:"2", time:"18:30" } };
  const board = arrivalsBoard(state, FRIDAY + 15 * 3600000);
  assert.equal(board.seats.find(seat => seat.player === "Jeremy").landed, true);
  assert.equal(board.seats.find(seat => seat.player === "Ben").landed, false, "still in the air");
  assert.equal(board.latest.player, ROSTER[3]);
  const live = door(5);
  const at = live.arrivals.at[ROSTER[4]];
  const fivesBoard = arrivalsBoard(live, at + 300);
  assert.deepEqual(droppingSeats(fivesBoard, at + 300, new Set(ROSTER.slice(0, 4))), [ROSTER[4]]);
  assert.deepEqual(droppingSeats(fivesBoard, at + 300, new Set(ROSTER.slice(0, 5))), [], "already here at load");
  assert.deepEqual(droppingSeats(fivesBoard, at + 5000, new Set()), [], "long landed");
  assert.equal(arrivalState(fresh(), ROSTER[0]), null);
  assert.equal(arrivalState(state, ROSTER[0]), "here");
  assert.equal(arrivalState(state, ROSTER[9]), "road");
});

test("arrivals model: Scan the TV is the lobby's pane, then a row, and never before check-in opens", () => {
  const me = ROSTER[3];
  assert.equal(arrivalOffer(fresh(), me, FRIDAY - 60000), null, "weeks early: nothing at all");
  assert.equal(arrivalOffer(fresh(), me, FRIDAY), "lobby", "Friday at the house");
  const state = door(0);
  assert.equal(arrivalOffer(state, me, FRIDAY - 86400000 * 20), "lobby", "the commissioner opened the door");
  act(state, "setArrived", { player:me, arrived:true });
  assert.equal(arrivalOffer(state, me), null, "already in");
  act(state, "announceEvent", { evId:"putt" });
  assert.equal(arrivalOffer(state, ROSTER[4]), "row", "a game announced: the compact row");
  act(state, "setArrivalsOpen", { open:false });
  assert.equal(arrivalOffer(state, ROSTER[4], FRIDAY + 3600000), null, "a closed door counts everyone as here");
  assert.equal(arrivalOffer({ ...door(0), frozen:true }, ROSTER[4]), null, "never on a frozen board");
  assert.equal(arrivalOffer(door(0), "Nobody"), null, "only the roster");
  assert.equal(arrivalOffer(door(0), null), null);
});

test("arrivals model: the code rides the QR's link; only a well-formed arrive parameter counts", () => {
  assert.equal(arriveUrl("https://fielddayseries.com", TV_CODE), `https://fielddayseries.com/?arrive=${TV_CODE}`);
  assert.equal(arriveUrl("https://fielddayseries.com/", TV_CODE), `https://fielddayseries.com/?arrive=${TV_CODE}`);
  assert.equal(arriveCodeFrom(`https://fielddayseries.com/?arrive=${TV_CODE}`), TV_CODE);
  assert.equal(arriveCodeFrom(`https://staging.example/?tv=1&arrive=${TV_CODE.toLowerCase()}#x`), TV_CODE);
  for (const bad of ["", null, "https://fielddayseries.com/", "https://x.test/?arrive=SHORT", "https://x.test/?arrive=ABCDEFG0",
    "WIFI:S:house;T:WPA;P:secret;;", "hello world"]) assert.equal(arriveCodeFrom(bad), null, String(bad));
  assert.equal(stripArriveParam(`https://fielddayseries.com/?arrive=${TV_CODE}`), "/");
  assert.equal(stripArriveParam(`https://fielddayseries.com/?tv=1&arrive=${TV_CODE}#top`), "/?tv=1#top");
  assert.equal(stripArriveParam("https://fielddayseries.com/?tv=1"), null, "nothing to strip");
});

test("the ?arrive= link on load: a claimed browser checks in, a stranger's does nothing, a re-claim is waited for", () => {
  assert.equal(arriveLinkStep({ code:null, ready:true, you:"Ben" }), "none");
  assert.equal(arriveLinkStep({ code:TV_CODE, ready:false, you:null }), "wait", "the first state is not in yet");
  assert.equal(arriveLinkStep({ code:TV_CODE, ready:true, you:"Ben" }), "send");
  assert.equal(arriveLinkStep({ code:TV_CODE, ready:true, you:null, me:null }), "drop", "unclaimed: nothing special");
  assert.equal(arriveLinkStep({ code:TV_CODE, ready:true, you:null, me:"Ben", waited:1000 }), "wait", "the re-claim is on its way");
  assert.equal(arriveLinkStep({ code:TV_CODE, ready:true, you:null, me:"Ben", waited:9000 }), "drop", "it never landed");
  /* App wires the hook once, and it strips the parameter with replaceState */
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /useArriveLink\(\{ ready, me, you:serverYou, onArrive/);
  const hook = fs.readFileSync(new URL("../src/features/arrivals/useArriveLink.js", import.meta.url), "utf8");
  assert.match(hook, /history\.replaceState/);
});

test("the TV lobby's thirteen seats stand round the code as a horseshoe, apart and inside the safe area", () => {
  const seats = lobbySeats(13);
  assert.equal(seats.length, 13);
  for (let i = 1; i < seats.length; i++)
    assert.ok(Math.hypot(seats[i].x - seats[i - 1].x, seats[i].y - seats[i - 1].y) >= 170, `seats ${i - 1} and ${i} apart`);
  for (const seat of seats) {
    assert.ok(seat.x - 92 >= 64 && seat.x + 92 <= 1856, "inside the sides");
    assert.ok(seat.y - 62 >= 124 && seat.y + 62 + 52 <= 1026, "under the masthead, over the title-safe foot");
    /* the code's pane: 480 wide at the center, 150 to about 760 */
    assert.ok(!(seat.x + 62 > 720 && seat.x - 62 < 1200 && seat.y - 62 < 770), "clear of the code's pane");
  }
  assert.deepEqual(seats[6], { x:960, y:904 }, "the middle seat at the foot");
  assert.equal(lobbySeats(10).length, 10, "a short roster spreads the same arc");
  assert.deepEqual(lobbySeats(0), []);
});

/* ── the scanner: frames in, one check-in out ── */

test("scanner: a decoded TV code dispatches once; another QR is ignored; a refusal resumes without resending", async () => {
  const image = { data:new Uint8ClampedArray(16), width:2, height:2 };
  let text = "https://example.com/menu";
  const decode = (data, width, height, options) => {
    assert.equal(options.inversionAttempts, "dontInvert");
    return text ? { data:text } : null;
  };
  assert.equal(readArriveFrame(decode, image), null, "a QR that is not the TV's");
  assert.equal(readArriveFrame(() => { throw new Error("bad frame"); }, image), null);
  const sent = [], phases = [];
  let answer = { ok:false, error:"Scan the code on the TV" };
  const session = createScanSession({ decode, submit:async code => { sent.push(code); return answer; },
    onChange:({ phase }) => phases.push(phase) });
  assert.equal(await session.frame(image), null);
  assert.equal(sent.length, 0);
  /* an old code: refused, says why, keeps scanning, never sends it again */
  text = "https://fielddayseries.com/?arrive=PLDCQDE2";
  await session.frame(image);
  assert.deepEqual(sent, ["PLDCQDE2"]);
  assert.equal(session.phase, "scanning");
  assert.equal(session.error, "Scan the code on the TV");
  await session.frame(image);
  assert.equal(sent.length, 1, "the refused code is not sent twice");
  /* the TV's code: one write, frames meanwhile ignored, then done */
  text = `https://fielddayseries.com/?arrive=${TV_CODE}`;
  let release;
  answer = new Promise(resolve => { release = resolve; });
  const first = session.frame(image);
  assert.equal(session.phase, "sending");
  await session.frame(image);
  assert.equal(sent.length, 2, "nothing more goes out while one write is in flight");
  release({ ok:true });
  await first;
  assert.equal(session.phase, "done");
  await session.frame(image);
  assert.deepEqual(sent, ["PLDCQDE2", TV_CODE]);
  assert.deepEqual(phases, ["sending", "scanning", "sending", "done"]);
  /* a timed-out write is settled by the next state */
  const late = createScanSession({ decode:() => ({ data:`/?arrive=${TV_CODE}` }),
    submit:async () => ({ ok:false, uncertain:true, settled:Promise.resolve({ ok:true, late:true }) }) });
  await late.frame(image);
  assert.equal(late.phase, "done");
});

test("scanner: a blocked camera reads as blocked, anything else as no camera; jsQR loads only inside it", () => {
  assert.equal(ui.cameraFailure({ name:"NotAllowedError" }), "denied");
  assert.equal(ui.cameraFailure({ name:"SecurityError" }), "denied");
  assert.equal(ui.cameraFailure({ name:"NotFoundError" }), "nocamera");
  assert.equal(ui.cameraFailure(new Error("x")), "nocamera");
  const scanner = fs.readFileSync(new URL("../src/features/arrivals/Scanner.jsx", import.meta.url), "utf8");
  assert.match(scanner, /import\("jsqr"\)/, "the decoder is a dynamic import");
  assert.doesNotMatch(scanner, /^import .*jsqr/m);
  assert.match(scanner, /facingMode:\{ ideal:"environment" \}/, "the rear camera");
  assert.match(scanner, /playsInline/, "inline on iPhone");
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /lazyPart\(\(\) => import\("\.\/features\/arrivals\/Scanner\.jsx"\), "ArriveScanner"\)/);
  for (const file of fs.readdirSync(new URL("../src/", import.meta.url), { recursive:true })) {
    if (!/\.(jsx?|mjs)$/.test(file) || file.replace(/\\/g, "/") === "features/arrivals/Scanner.jsx") continue;
    assert.doesNotMatch(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), /["']jsqr["']/, file);
  }
});

/* ── the server: a scan proves presence ── */

test("server: a guest's check-in needs the TV's current code; the commissioner needs none", () => {
  const state = fresh();
  act(state, "setArrivalsOpen", { open:true });
  const me = ROSTER[4];
  const withCode = (code, arriveCode = TV_CODE) => applyAction(structuredClone(state), "setArrived",
    { player:me, ...(code === undefined ? {} : { code }) }, { ...as(me), arriveCode });
  assert.match(String(withCode(undefined).error), /Scan the code on the TV/, "no code");
  assert.match(String(withCode("WRONGQQQ").error), /Scan the code on the TV/, "the wrong code");
  assert.match(String(withCode("not a code").error), /Scan the code on the TV/);
  assert.match(String(withCode(TV_CODE, null).error), /Scan the code on the TV/, "no TV has a code yet");
  assert.equal(withCode(TV_CODE).ok, true, "the TV's code");
  /* someone else's code cannot check you in, and nobody checks in for another */
  assert.equal(applyAction(structuredClone(state), "setArrived", { player:ROSTER[5], code:TV_CODE },
    { ...as(me), arriveCode:TV_CODE }).ok, false);
  /* the commissioner marks anyone, no code */
  act(state, "setArrived", { player:ROSTER[6] });
  assert.ok(state.arrivals.at[ROSTER[6]]);
  /* a closed door refuses a scan */
  act(state, "setArrivalsOpen", { open:false });
  assert.match(String(withCode(TV_CODE).error), /opens Friday/);
  /* an arrived guest's retry is an acknowledged no-op */
  const again = door(0);
  act(again, "setArrived", { player:me, code:TV_CODE }, { ...as(me), arriveCode:TV_CODE });
  assert.equal(applyAction(again, "setArrived", { player:me, code:TV_CODE }, { ...as(me), arriveCode:"QQQQQQQQ" }).extra?.unchanged, true);
});

/* the Durable Object in memory: storage, sockets with attachments */
function memoryTournament() {
  const entries = new Map(), sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])); },
    async transaction(fn) { return fn(storage); },
  };
  const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage }, { APP_ENV:"local" });
  const socket = () => {
    let attachment = null;
    const ws = { raw:[], send(frame) { ws.raw.push(frame); }, serializeAttachment(v) { attachment = structuredClone(v); },
      deserializeAttachment() { return attachment; }, close() {},
      get frames() { return ws.raw.map(frame => JSON.parse(frame)); } };
    sockets.push(ws);
    return ws;
  };
  return { tournament, entries, socket };
}
const DEVICE = name => `device-${name}-7f1c2a9e-0000-4000-8000-00000000000${name.length % 10}`;
let msgSeq = 0;
const say = (tournament, ws, device, type, payload = {}, gmToken = null) => tournament.webSocketMessage(ws,
  JSON.stringify({ actionId:`m${++msgSeq}`, type, payload, deviceId:device, ...(gmToken ? { gmToken } : {}) }));

test("Durable Object: the code reaches TV sockets only, never state or a snapshot, and retires with the door", async () => {
  const { tournament, entries, socket } = memoryTournament();
  await tournament.hydrateFromStorage();
  tournament.gmToken = "gm-secret";
  const me = ROSTER[4];
  const tv = socket(), phone = socket(), boss = socket();
  await say(tournament, phone, DEVICE("phone"), "hello", { nonce:1 });
  await say(tournament, phone, DEVICE("phone"), "claim", { player:me });
  await say(tournament, boss, DEVICE("boss"), "hello", { nonce:1 }, "gm-secret");
  /* before check-in opens a TV gets no code, and none is made */
  await say(tournament, tv, DEVICE("tv"), "hello", { view:"tv", nonce:1 });
  assert.equal(tv.frames.at(-1).arrive, null);
  assert.equal(entries.has("private:arrive:code"), false);
  /* the commissioner opens check-in: every TV frame carries the code */
  await say(tournament, boss, DEVICE("boss"), "setArrivalsOpen", { open:true }, "gm-secret");
  const code = tv.frames.filter(frame => frame.type === "state").at(-1).arrive;
  assert.ok(isArriveCode(code), String(code));
  assert.equal(entries.get("private:arrive:code"), code, "kept privately");
  for (const ws of [phone, boss]) for (const raw of ws.raw) assert.equal(raw.includes(code), false, "never in a non-TV frame");
  assert.equal(JSON.stringify(tournament.state).includes(code), false, "never in state");
  assert.equal(JSON.stringify(await tournament.createSnapshot()).includes(code), false, "never in a snapshot");
  /* a TV's ping hears it too (a TV left on picks it up when check-in opens) */
  await say(tournament, tv, DEVICE("tv"), "ping", { view:"tv" });
  assert.equal(tv.frames.at(-1).type, "pong");
  assert.equal(tv.frames.at(-1).arrive, code);
  await say(tournament, phone, DEVICE("phone"), "ping", {});
  assert.equal("arrive" in phone.frames.at(-1), false);
  /* a guest's scan without the code, or with an old one, is refused; the TV's code checks them in */
  await say(tournament, phone, DEVICE("phone"), "setArrived", { player:me });
  assert.match(phone.frames.at(-1).error, /Scan the code on the TV/);
  await say(tournament, phone, DEVICE("phone"), "setArrived", { player:me, code:"QQQQQQQQ" });
  assert.equal(phone.frames.at(-1).ok, false);
  await say(tournament, phone, DEVICE("phone"), "setArrived", { player:me, code });
  assert.equal(phone.frames.filter(frame => frame.type === "ack").at(-1).ok, true);
  assert.ok(tournament.state.arrivals.at[me]);
  /* New code: commissioner only; the TV hears the new one and the old one stops working */
  await say(tournament, phone, DEVICE("phone"), "arriveRotate", {});
  assert.equal(phone.frames.at(-1).ok, false);
  await say(tournament, boss, DEVICE("boss"), "arriveRotate", {}, "gm-secret");
  const fresh2 = tv.frames.filter(frame => frame.type === "arrive").at(-1).code;
  assert.ok(isArriveCode(fresh2) && fresh2 !== code);
  const other = ROSTER[5], otherPhone = socket();
  await say(tournament, otherPhone, DEVICE("other"), "hello", { nonce:1 });
  await say(tournament, otherPhone, DEVICE("other"), "claim", { player:other });
  await say(tournament, otherPhone, DEVICE("other"), "setArrived", { player:other, code });
  assert.match(otherPhone.frames.at(-1).error, /Scan the code on the TV/, "the old code is retired");
  /* closing the door drops the code: TV frames carry none, the key is gone */
  await say(tournament, boss, DEVICE("boss"), "setArrivalsOpen", { open:false }, "gm-secret");
  assert.equal(tv.frames.filter(frame => frame.type === "state").at(-1).arrive, null);
  assert.equal(entries.has("private:arrive:code"), false);
  /* reopened: a new code */
  await say(tournament, boss, DEVICE("boss"), "setArrivalsOpen", { open:true }, "gm-secret");
  const third = tv.frames.filter(frame => frame.type === "state").at(-1).arrive;
  assert.ok(isArriveCode(third) && third !== fresh2);
  /* the app's own TV mode switching on hears the code at once */
  const phoneTv = socket();
  await say(tournament, phoneTv, DEVICE("ptv"), "hello", { nonce:1 });
  await say(tournament, phoneTv, DEVICE("ptv"), "presence", { view:"tv", visible:true });
  assert.deepEqual(phoneTv.frames.at(-1), { type:"arrive", code:third });
});

test("arrivals projection: a landed flag only, never a time, while the door is open", () => {
  const state = door(2);
  state.profiles[ROSTER[0]] = { flightIn:{ air:"WN", num:"4663", time:"08:40" } };
  state.profiles[ROSTER[5]] = { flightIn:{ air:"AA", num:"2214", time:"11:05" }, size:"L" };
  state.profiles[ROSTER[6]] = { flightIn:{ note:"Driving" } };
  const frame = publicState(state, { isGm:false, player:null });
  assert.equal(frame.arrivals.eta, undefined, "no landing time reaches another phone");
  assert.doesNotMatch(JSON.stringify(frame.arrivals), /11:05|08:40/);
  assert.equal(frame.arrivals.landed, undefined, "before Friday nobody has landed");
  assert.equal(frame.profiles[ROSTER[5]].flightIn, undefined, "the flight itself stays private");
  assert.doesNotMatch(JSON.stringify(frame.arrivals), /2214|AA/);
  act(state, "setArrivalsOpen", { open:false });
  assert.equal(publicState(state, { isGm:false, player:null }).arrivals.eta, undefined, "a shut door says nothing");
  assert.equal(state.arrivals.eta, undefined, "never stored");
});

/* ── the phone ── */

const homeProps = (state, me, extra = {}) => ({ state, me, events:BUILTIN_EVENTS.filter(ev => ev.id === "putt"),
  standings:computeStandings(state), GameMark:Stub, StatPills:Stub, onOpen:noop, onRules:noop, onBets:noop, onBracket:noop,
  onPlayer:noop, onStandings:noop, onEvents:noop, onScan:noop, ...extra });

test("Home: in the lobby a guest still on the way gets Scan the TV at the top, their chip over an empty seat", () => {
  const state = door(4);
  const html = render(ui.GuestHome, homeProps(state, ROSTER[8], { events:[] }), state);
  assert.match(html, /class="fd-arrive fd-glass-scene"/, "on its own it carries the painting");
  assert.match(html, /aria-label="Scan the TV"/);
  assert.match(html, />Scan the TV</);
  assert.match(html, /fd-arrive-seat/);
  assert.ok(html.indexOf("fd-arrive") < html.indexOf("fd-home-leaderboard"), "the top of Home");
  /* with the first event on Home it is lettered into the event's painting */
  const inset = render(ui.GuestHome, homeProps(state, ROSTER[8]), state);
  assert.match(inset, /fd-home-scene fd-glass-scene has-you[\s\S]*?class="fd-arrive is-inset"/);
  assert.doesNotMatch(inset, /fd-you-strip/);
  /* their row on the board is unlit until they arrive */
  assert.match(html, /is-road[^>]*>[\s\S]*?on the way/);
});

test("Home: after the lobby it is one compact row; once in, with the door shut, or with no scanner, Home is Home", () => {
  const live = door(9);
  act(live, "announceEvent", { evId:"putt" });
  const row = render(ui.GuestHome, homeProps(live, ROSTER[11]), live);
  assert.match(row, /class="fd-arrive-row is-inset"/);
  assert.doesNotMatch(row, /class="fd-arrive[ "]/, "never the lobby's pane");
  const here = door(9);
  assert.doesNotMatch(render(ui.GuestHome, homeProps(here, ROSTER[2]), here), /fd-arrive/);
  const shut = fresh();
  shut.arrivals = { open:false, openedAt:1, at:{} };
  assert.doesNotMatch(render(ui.GuestHome, homeProps(shut, ROSTER[2]), shut), /fd-arrive/);
  const open = door(0);
  assert.doesNotMatch(render(ui.GuestHome, homeProps(open, ROSTER[2], { onScan:null }), open), /fd-arrive/);
  assert.doesNotMatch(render(ui.GuestHome, homeProps(open, null), open), /fd-arrive/, "a spectator device");
});

test("Leaderboard: everyone still on the way sits unlit; nobody once the door is shut", () => {
  const state = door(9);
  const html = render(ui.Leaderboard, { state, standings:computeStandings(state), me:ROSTER[0], onPlayer:noop }, state);
  assert.equal(count(html, /class="[^"]*is-road/g), 4);
  const shut = fresh();
  const plain = render(ui.Leaderboard, { state:shut, standings:computeStandings(shut), me:ROSTER[0], onPlayer:noop }, shut);
  assert.equal(count(plain, /is-road/g), 0);
});

/* ── the TV ── */

const URL_OF = `https://fielddayseries.com/?arrive=${TV_CODE}`;

test("TV lobby: the code at the center, thirteen seats round it, who is in seated, Landed lit, the count", () => {
  const state = door(9);
  state.profiles[ROSTER[10]] = { flightIn:{ time:"12:40" } };
  state.profiles[ROSTER[11]] = { flightIn:{ time:"23:30" } };
  const now = FRIDAY + 15 * 3600000;
  const board = arrivalsBoard(state, now);
  const html = render(ui.TVLobby, { state, board, now, url:URL_OF }, state);
  assert.match(html, /aria-label="Check-in code"/);
  assert.match(html, /<path d="M\d+ \d+h1v1h-1z/, "the code's modules");
  assert.equal(count(html, /class="tv-lobby-seat is-/g), 13);
  assert.equal(count(html, /tv-lobby-seat is-here/g), 9);
  assert.equal(count(html, /tv-lobby-seat is-road/g), 4);
  assert.equal(count(html, /tv-lobby-chip"/g), 9, "a loaded screen seats them: no drop");
  assert.equal(count(html, />Landed</g), 1);
  assert.match(html, /aria-label="9 of 13 here"/);
  assert.match(html, /of 13/);
  assert.match(html, /left:960px;top:904px/, "the middle seat at the foot");
  assert.ok(ui.arriveNameSize("Squilliam") >= 24 && ui.arriveNameSize("Bo") === 30, "names fit their plate at the floor or more");
  /* everyone in: the mark in the code's place */
  const full = door(13);
  const fullHtml = render(ui.TVLobby, { state:full, board:arrivalsBoard(full), now:Date.now(), url:URL_OF }, full);
  assert.doesNotMatch(fullHtml, /Check-in code/);
  assert.match(fullHtml, /tv-lobby-pane tv-glass is-full/);
  /* no code yet (the frame has not brought it): the mark holds the pane */
  assert.doesNotMatch(render(ui.TVLobby, { state, board, now, url:null }, state), /Check-in code/);
});

test("TV corner: the code over the faces still out, four at most, the rest counted", () => {
  const state = door(9);
  act(state, "announceEvent", { evId:"putt" });
  const html = render(ui.TVArriveCorner, { board:arrivalsBoard(state), url:URL_OF }, state);
  assert.match(html, /aria-label="4 on the way"/);
  assert.match(html, /aria-label="Check-in code"/);
  assert.equal(count(html, /tv-arrive-corner-face"/g), 4);
  const many = door(6);
  act(many, "announceEvent", { evId:"putt" });
  const crowd = render(ui.TVArriveCorner, { board:arrivalsBoard(many), url:URL_OF }, many);
  assert.equal(count(crowd, /tv-arrive-corner-face"/g), 3);
  assert.match(crowd, />\+4</);
  /* TVMode lays it out: the standings and ticker narrow, and the plate leaves with any takeover */
  const tv = fs.readFileSync(new URL("../src/features/tv/TVMode.jsx", import.meta.url), "utf8");
  assert.match(tv, /width=\{cornerShown \? cornerWidth : 1920\}/);
  assert.doesNotMatch(tv, /TVArrivalsMini|arrivalHolding/, "no masthead strip, no arrivals turn");
  const css = fs.readFileSync(new URL("../src/features/tv/tv-arrivals.css", import.meta.url), "utf8");
  assert.match(css, /\[data-takeover\], \[data-moment\]\) \.tv-arrive-corner \{ opacity:0/);
});

/* ── the commissioner ── */

test("Who is coming: Here, Away, Not coming as before; Mark here under anyone still on the way; check-in is one small control", () => {
  const open = door(9);
  const html = render(ui.RosterSheet, { state:open, onAway:noop, onOut:noop, onArrived:noop, onDoor:noop, onNewCode:noop, onClose:noop }, open);
  assert.equal(count(html, /role="radio"/g), 13 * 3, "the three-state switch, never four");
  assert.equal(count(html, />Mark here</g), 4);
  assert.equal(count(html, />On the way</g), 4);
  assert.match(html, /aria-label="Mark [^"]+ here"/);
  assert.match(html, />Close</);
  assert.match(html, />New code</);
  assert.match(html, /aria-label="Check-in open, 9 of 13 in"/);
  assert.equal(ui.rosterStateOf(open, ROSTER[12]), "here");
  assert.deepEqual(ui.doorCount(open), { here:9, total:13 });
  const shut = fresh();
  const closed = render(ui.RosterSheet, { state:shut, onAway:noop, onOut:noop, onArrived:noop, onDoor:noop, onClose:noop }, shut);
  assert.doesNotMatch(closed, /On the way|Mark here|New code/);
  assert.match(closed, />Open</);
  assert.match(closed, /aria-label="Check-in closed"/);
});

test("Crew check: a face still on the way is its own state, out of the draw, and offers Here", () => {
  const state = door(9);
  const ev = BUILTIN_EVENTS.find(item => item.id === "die");
  const model = crewCheckModel(state, ev);
  const road = model.roster.filter(item => item.state === "road").map(item => item.player);
  assert.deepEqual(road, ROSTER.slice(9));
  assert.ok(road.every(player => !model.playing.includes(player) && !model.crew.some(item => item.player === player)));
  assert.deepEqual(seatChoices(model, model.roster.find(item => item.state === "road")), ["here", "away"]);
  assert.deepEqual(seatChoices(model, model.roster.find(item => item.state === "playing")).slice(0, 2), ["playing", "crew"]);
});

test("Travel board and menu: who is in, so pickups know", () => {
  const state = door(9);
  state.profiles[ROSTER[10]] = { display:ROSTER[10], flightIn:{ air:"AA", num:"2214", time:"00:05" } };
  const html = render(ui.TravelApparelSheet, { state, onSize:noop, onLock:noop, onNotify:noop }, state);
  assert.match(html, />Here</);
  assert.match(html, />9\/13</);
  assert.ok(count(html, />On the way</g) >= 3);
  const people = commissionerMenu({ arrivals:{ here:9, total:13 } }).find(section => section.id === "people");
  assert.equal(people.items.find(item => item.id === "attendance").value, "9 of 13 here");
  const shut = commissionerMenu({}).find(section => section.id === "people");
  assert.equal(shut.items.find(item => item.id === "attendance").value, "Everyone");
});
