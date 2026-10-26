/* Float's surfaces in Field Day (src/features/float): the river over the
   TV's whole canvas while the Cup races (a takeover), the TV's own board
   back when the room never took the Cup or the river cannot load; the
   controller over a rider's phone, through the room's podium and feedback,
   never a spectator's; Home's row; Profile > Locker and its save rhythm;
   the TV's riders turn and its stills; the commissioner's desk, menu row
   and Ready check row; the float/client parts loaded only from an effect,
   and those parts importing cleanly in node. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Module } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import { FLOAT_EVENT, FLOAT_GROOM } from "../shared/float.js";
import { FLOAT_LINGER_MS, floatDeskStatus, floatFeedbackSummary, floatLooksPicked, floatPhoneView, floatSheetHolds }
  from "../src/features/float/floatModel.js";
import { LOOK_SAVE_AFTER_MS, lookSaver } from "../src/features/float/lookSaver.js";
import { FLOAT_ROSTER_CARD, floatRosterRiders, portraitKey, portraitStore, rosterLayout, withFloatRoster }
  from "../src/features/float/floatRoster.js";
import { TV_AMBIENT_TURN_MS } from "../src/features/tv/tvModel.js";
import { commissionerMenu } from "../src/features/director/menuModel.js";
import { readyCheck, readyRows } from "../src/features/director/readyCheck.js";
import { applyAction } from "./support/confirmed-start.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(ROOT, path), "utf8");
const [me, evan, khoa] = ROSTER;
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

const refuse = names => names.map(name => `export const ${name}=()=>{ throw new Error("${name} must not run"); };`).join("\n");
const compiled = await build({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
    export { provideFloatPart, failFloatPart, floatPartFailed, FLOAT_PARTS } from "./src/features/float/floatParts.js";
    export { FloatPlaySheet, FloatHome } from "./src/features/float/FloatPlay.jsx";
    export { FloatLocker } from "./src/features/float/FloatLocker.jsx";
    export { FloatDesk } from "./src/features/float/FloatDesk.jsx";
    export { GameMark, GAME_MARK_IDS } from "./src/ui/GameMark.jsx";
    export { ProfileSheet } from "./src/App.jsx";`, resolveDir:ROOT, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three", "jsqr"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"float-ui-client", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
      export const useTournament=()=>({});
      export const localGet=()=>null, localSet=()=>{}, hasGmToken=()=>false, setGmToken=()=>{};
      ${refuse(["dispatch", "uploadPhoto", "downloadSnapshot", "spotifyStatus", "spotifyPlayer", "spotifySearch", "spotifyAuthorize",
        "spotifyDisconnect", "spotifyPlay", "spotifyPause", "spotifyDevice", "spotifyAutoWinSongs", "songPreview", "songSnippet",
        "spotifyRetry", "spotifyLatency", "spotifyCalibrate", "geoUploadPhoto", "geoDeleteRound", "geoPhotoUrl", "triviaUploadPhoto",
        "triviaBank", "triviaClip", "triviaClipCheck", "triviaPhotoUrl", "reportTvSound", "setTvView", "karaokeVideos", "karaokeVideo",
        "karaokeCheck", "reportTvVideo"])}` }));
  } }],
});
const ui = new Module(fileURLToPath(new URL("float-ui.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(ROOT);
ui._compile(compiled.outputFiles[0].text, ui.filename);
const {
  TVMode, PlayerIdentityProvider, provideFloatPart, failFloatPart, floatPartFailed, FLOAT_PARTS, FloatPlaySheet, FloatHome,
  FloatLocker, FloatDesk, GameMark, GAME_MARK_IDS, ProfileSheet,
} = ui.exports;

/* stand-ins for the room's own components, with their real props */
const ScreenStub = ({ room }) => React.createElement("div", { "data-stub":"screen", "data-room":room });
const ControllerStub = ({ room, rider, onExit }) => React.createElement("div", { "data-stub":"controller", "data-room":room,
  "data-rider":rider?.name, "data-pid":rider?.pid, "data-exit":typeof onExit });
const LockerStub = ({ look, groom }) => React.createElement("div", { "data-stub":"locker", "data-critter":look?.critter,
  "data-hat":look?.hat, "data-groom":String(!!groom) });

let serial = 0;
const gm = (extra = {}) => ({ isGm:true, player:me, deviceId:"gm", actionId:`u${++serial}`, environment:"local", ...extra });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refs = state => {
  const contest = resolveCurrentContest(state, allEventsOf(state).find(ev => ev.id === FLOAT_EVENT));
  return contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
};
function racing() {
  const state = structuredClone(EMPTY_STATE);
  act(state, "announceEvent", { evId:FLOAT_EVENT });
  act(state, "lockAndStart", { evId:FLOAT_EVENT, ...refs(state) }, gm({ float:true }));
  return state;
}
const wrap = (state, element) => React.createElement(PlayerIdentityProvider, { profiles:state.profiles }, element);
const tv = (state, extra = {}) => renderToStaticMarkup(wrap(state, React.createElement(TVMode, { standings:computeStandings(state), state,
  events:allEventsOf(state), onDeckEv:null, allTied:false, champion:null, coChamps:[], showControlEnabled:false,
  connection:{ ready:true, connected:true, status:"open", version:1 }, onExit:() => {}, now:Date.now(), ...extra })));
const canvasOf = html => /<div class="tv-canvas[^"]*"[^>]*>/.exec(html)?.[0] || "";

/* ── the TV ── */

test("the TV: the river over the whole canvas while the Cup races, the game's mark until it is in, a takeover", () => {
  const state = racing();
  const waiting = tv(state);
  assert.match(canvasOf(waiting), /data-takeover="float"/, "the chrome steps aside");
  assert.match(waiting, /class="tv-float" data-tv-float="cup[a-z0-9]+"/);
  assert.match(waiting, /class="tv-float-wait" aria-label="Float"/);
  assert.match(waiting, /fd-game-mark/);
  provideFloatPart("screen", ScreenStub);
  const html = tv(state);
  assert.match(html, /<div data-stub="screen" data-room="fd-float"><\/div>/, "FloatScreen with its room");
  assert.match(canvasOf(html), /data-takeover="float"/);
  assert.doesNotMatch(html, /tv-float-wait/);
});

test("the TV goes back to its own board when the room never took the Cup, the river failed, or the result posted", () => {
  provideFloatPart("screen", ScreenStub);
  const failed = racing();
  act(failed, "floatCupFailed", { cupId:failed.float.cupId, error:"Room is full" },
    { internal:"float", isGm:true, auto:true, deviceId:"float", actionId:"x" });
  const board = tv(failed);
  assert.doesNotMatch(board, /tv-float/);
  assert.doesNotMatch(canvasOf(board), /data-takeover="float"/);
  assert.match(board, /class="tv-live/, "the live board, entered by hand");

  failFloatPart("screen", "load");
  assert.equal(floatPartFailed("screen"), "load");
  const fellBack = tv(racing());
  assert.doesNotMatch(fellBack, /data-stub="screen"/);
  assert.doesNotMatch(canvasOf(fellBack), /data-takeover="float"/);
  provideFloatPart("screen", ScreenStub);
  assert.equal(floatPartFailed("screen"), null, "a part handed in again clears the failure");

  const posted = racing();
  act(posted, "floatFinish", { evId:FLOAT_EVENT, cupId:posted.float.cupId, order:[evan, khoa, me] },
    { internal:"float", isGm:true, auto:true, deviceId:"float", actionId:"y" });
  assert.doesNotMatch(tv(posted), /tv-float/, "the result scene takes over");
});

test("the riders turn: every rider coming, a turn of the gap while Float is ahead and the room is bound, chips until the art is in", () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[evan] = { display:"Evan", float:{ critter:"javelina", floatie:"donut", hat:"bucket", shades:"none", pose:"flex" } };
  const events = allEventsOf(state);
  assert.equal(floatRosterRiders(state, events), null, "the room not bound: no turn");
  const riders = floatRosterRiders(state, events, { float:true });
  assert.deepEqual(riders.map(rider => rider.pid), ROSTER);
  assert.equal(riders.find(rider => rider.pid === evan).look.critter, "javelina", "the look they picked");
  assert.ok(riders.every(rider => rider.look?.critter), "everyone else the room's own default");
  const out = structuredClone(state);
  act(out, "setOut", { player:khoa, out:true });
  assert.ok(!floatRosterRiders(out, allEventsOf(out), { float:true }).some(rider => rider.pid === khoa), "Not coming is not riding");
  /* no turn once the Cup starts, Float is skipped or played, or the board is frozen */
  assert.equal(floatRosterRiders(racing(), allEventsOf(racing()), { float:true }), null);
  const skipped = structuredClone(state);
  act(skipped, "shelve", { id:FLOAT_EVENT, on:true });
  assert.equal(floatRosterRiders(skipped, allEventsOf(skipped), { float:true }), null);
  assert.equal(floatRosterRiders({ ...state, results:{ [FLOAT_EVENT]:{ slots:[[evan]] } } }, events, { float:true }), null);
  assert.equal(floatRosterRiders({ ...state, frozen:true }, events, { float:true }), null);

  /* the turn after what is next, once */
  assert.deepEqual(withFloatRoster(["board", "next", "latest"], true), ["board", "next", FLOAT_ROSTER_CARD, "latest"]);
  assert.deepEqual(withFloatRoster(["board"], true), ["board", FLOAT_ROSTER_CARD]);
  assert.deepEqual(withFloatRoster(["board", "next"], false), ["board", "next"]);
  assert.deepEqual(withFloatRoster(withFloatRoster(["board"], true), true), ["board", FLOAT_ROSTER_CARD]);
  /* rows of at most seven, the longer first, columns as wide as the widest row allows */
  assert.deepEqual(rosterLayout(13).rows, [7, 6]);
  assert.deepEqual(rosterLayout(10).rows, [5, 5]);
  assert.deepEqual(rosterLayout(7).rows, [7]);
  assert.ok(rosterLayout(13).col >= 180 && rosterLayout(13).width <= 1680);
  assert.deepEqual([rosterLayout(10).col, rosterLayout(10).width], [200, 5 * 200 + 4 * 28 + 2 * 64], "a short roster's panel fits its riders");

  /* the TV: the turn in the rotation only with the room, one rider a figure, each their chip until the art is in */
  const base = Math.ceil(Date.now() / (TV_AMBIENT_TURN_MS * 2520)) * TV_AMBIENT_TURN_MS * 2520;
  const turns = props => Array.from({ length:8 }, (_, turn) => tv(state, { now:base + turn * TV_AMBIENT_TURN_MS + 4000, ...props }));
  assert.ok(turns({}).every(html => !/data-float-roster/.test(html)), "no turn without the room");
  const drawn = turns({ float:true }).filter(html => /data-float-roster/.test(html));
  assert.ok(drawn.length >= 1 && drawn.length <= 4, "one turn in the rotation");
  const html = drawn[0];
  assert.match(html, /<section class="tv-float-roster tv-glass" aria-label="Float" data-float-roster="13"/);
  assert.equal((html.match(/class="tv-float-rider"/g) || []).length, 13);
  assert.equal((html.match(/data-still="chip"/g) || []).length, 13, "chips while the art is not in");
  assert.match(html, /tv-float-rider-name[^>]*>Evan</);
  /* never while the Cup races */
  assert.ok(Array.from({ length:8 }, (_, turn) => tv(racing(), { now:base + turn * TV_AMBIENT_TURN_MS + 4000, float:true }))
    .every(page => !/data-float-roster/.test(page)));
});

test("the riders' stills: one drawing at a time, kept by look, a bad or slow one is the chip and not asked again, a cap", async () => {
  const store = portraitStore({ wait:40, cap:5 });
  let busy = 0, most = 0, landed = 0;
  const drew = [];
  const off = store.listen(() => { landed += 1; });
  const draw = async (rider, { size }) => {
    drew.push(`${rider.pid}@${size}`);
    if (rider.pid === "slow") return new Promise(() => {});
    busy += 1;
    most = Math.max(most, busy);
    await new Promise(resolve => setTimeout(resolve, 5));
    busy -= 1;
    if (rider.pid === "boom") throw new Error("no WebGL");
    return rider.pid === "bad" ? "javascript:alert(1)" : `data:image/png;base64,${rider.pid}`;
  };
  const rider = (pid, critter = "capybara") => ({ pid, name:pid, color:"#c05b33", look:{ critter }, photo:null, number:pid.length });
  assert.equal(store.request(draw, rider("a"), { size:320 }), true);
  assert.equal(store.request(draw, rider("a"), { size:320 }), false, "asked once while it draws");
  ["slow", "boom", "bad"].forEach(pid => store.request(draw, rider(pid), { size:320 }));
  await store.idle();
  assert.equal(store.get(rider("a")), "data:image/png;base64,a");
  for (const pid of ["slow", "boom", "bad"]) {
    assert.equal(store.get(rider(pid)), null, `${pid}: the chip stands in`);
    assert.ok(store.has(rider(pid)), `${pid}: not asked again`);
    assert.equal(store.request(draw, rider(pid), { size:320 }), false);
  }
  assert.equal(most, 1, "one drawing at a time");
  assert.equal(landed, 4);
  /* a new look is a new still; the same look is the one kept */
  assert.notEqual(portraitKey(rider("a")), portraitKey(rider("a", "javelina")));
  assert.equal(store.request(draw, rider("a", "javelina"), { size:320 }), true);
  await store.idle();
  assert.equal(store.get(rider("a", "javelina")), "data:image/png;base64,a");
  /* past the cap nothing more is drawn */
  assert.equal(store.request(draw, rider("z"), { size:320 }), false);
  assert.deepEqual(drew, ["a@320", "slow@320", "boom@320", "bad@320", "a@320"]);
  off();
});

/* ── the phone ── */

test("a rider's controller: their room and rider, opened once a Cup; a spectator gets nothing", () => {
  provideFloatPart("controller", ControllerStub);
  const state = racing();
  state.profiles[evan] = { display:"Evan", color:"#C05B33" };
  const sheet = (player, extra = {}) => renderToStaticMarkup(wrap(state, React.createElement(FloatPlaySheet, { state, me:player,
    initiallyOpen:true, now:Date.now(), ...extra })));
  const html = sheet(evan);
  assert.match(html, /<div class="fd-float-play" role="dialog" aria-modal="true" aria-label="Float">/);
  assert.match(html, /data-stub="controller" data-room="fd-float" data-rider="Evan" data-pid="Evan" data-exit="function"/);
  /* away when it started: not a rider */
  const away = racing();
  away.away = { [khoa]:true };
  const awayCup = structuredClone(away);
  awayCup.float.players = awayCup.float.players.filter(player => player !== khoa);
  assert.equal(floatPhoneView(awayCup, khoa), null);
  assert.equal(renderToStaticMarkup(wrap(awayCup, React.createElement(FloatPlaySheet, { state:awayCup, me:khoa, initiallyOpen:true }))), "");
  /* no claim, no rider */
  assert.equal(renderToStaticMarkup(wrap(state, React.createElement(FloatPlaySheet, { state, me:null, initiallyOpen:true }))), "");
  /* closed when the board ends the Cup (a skip, a take-back) */
  const skipped = structuredClone(state);
  act(skipped, "shelve", { id:FLOAT_EVENT, on:true });
  assert.equal(renderToStaticMarkup(wrap(skipped, React.createElement(FloatPlaySheet, { state:skipped, me:evan, initiallyOpen:true }))), "");
});

test("the controller stays through the room's podium and feedback, then its linger runs out", () => {
  provideFloatPart("controller", ControllerStub);
  const state = racing();
  act(state, "floatFinish", { evId:FLOAT_EVENT, cupId:state.float.cupId, order:[evan, khoa, me] },
    { internal:"float", isGm:true, auto:true, deviceId:"float", actionId:"z" });
  const view = floatPhoneView(state, evan);
  assert.equal(view.live, false);
  assert.ok(floatSheetHolds(view, view.finishedAt + 1000));
  assert.ok(!floatSheetHolds(view, view.finishedAt + FLOAT_LINGER_MS + 1));
  const at = now => renderToStaticMarkup(wrap(state, React.createElement(FloatPlaySheet, { state, me:evan, initiallyOpen:true, now })));
  assert.match(at(view.finishedAt + 1000), /data-stub="controller"/);
  assert.equal(at(view.finishedAt + FLOAT_LINGER_MS + 1), "");
});

test("Home's row: Racing, Play, for a rider while the room has the Cup; nothing for a spectator or a Cup that never started", () => {
  const state = racing();
  const row = (s, player) => renderToStaticMarkup(wrap(s, React.createElement(FloatHome, { state:s, me:player, inCard:true,
    onOpen:() => {} })));
  const html = row(state, evan);
  assert.match(html, /class="fd-now-row is-live is-primary fd-float-now"/);
  assert.match(html, /aria-label="Float\. Racing\. Play"/);
  assert.match(html, /<span>Racing<\/span>/);
  const spectator = structuredClone(state);
  spectator.float.players = spectator.float.players.filter(player => player !== khoa);
  assert.equal(row(spectator, khoa), "");
  const failed = structuredClone(state);
  failed.float.error = { at:1, text:"x" };
  assert.equal(row(failed, evan), "");
});

/* ── the Locker ── */

test("Profile > Locker: the room's picker with the saved look, the crown offered to the groom alone, no Save of its own", () => {
  provideFloatPart("locker", LockerStub);
  const state = structuredClone(EMPTY_STATE);
  state.profiles[evan] = { display:"Evan", float:{ critter:"otter", floatie:"donut", hat:"cowboy", shades:"none", pose:"flex" } };
  state.profiles[FLOAT_GROOM] = { display:"Brandon" };
  const locker = player => renderToStaticMarkup(wrap(state, React.createElement(FloatLocker, { state, me:player, active:true,
    onSave:async () => ({ ok:true }) })));
  const evans = locker(evan);
  assert.match(evans, /data-stub="locker" data-critter="otter" data-hat="cowboy" data-groom="false"/);
  assert.match(evans, /class="fd-float-locker-status is-saved"[^>]*>Saved</);
  assert.match(locker(FLOAT_GROOM), /data-groom="true"/);
  /* the profile's tab, with Float on; Use-less: the section has no Save */
  const sheet = (props = {}) => renderToStaticMarkup(wrap(state, React.createElement(ProfileSheet, { state, me:evan, onClose:() => {},
    save:async () => ({ ok:true }), onChip:async () => ({ ok:true }), spotifyCatalogEnabled:false, ...props })));
  assert.match(sheet({ float:true, onFloatLook:async () => ({ ok:true }) }), /aria-pressed="false"[^>]*>Locker<\/button>/);
  const bare = structuredClone(state);
  delete bare.profiles[evan].float;
  assert.doesNotMatch(renderToStaticMarkup(wrap(bare, React.createElement(ProfileSheet, { state:bare, me:evan, onClose:() => {},
    save:async () => ({ ok:true }), onChip:async () => ({ ok:true }) }))), />Locker</, "off and nothing saved: no tab");
  const open = sheet({ float:true, onFloatLook:async () => ({ ok:true }), initialSection:"locker" });
  assert.match(open, /data-stub="locker"/);
  assert.doesNotMatch(open, />Save<\/button>/, "the Locker saves itself");
});

test("the Locker's rhythm: the last change saves once after a pause, closing saves what is owed at once, nothing twice", async () => {
  /* a clock the test turns by hand */
  let clock = 0, next = 0;
  const due = new Map();
  const timers = { setTimeout:(fn, ms) => { due.set(++next, { fn, at:clock + ms }); return next; }, clearTimeout:id => due.delete(id) };
  const tick = ms => {
    clock += ms;
    for (const [id, job] of [...due].sort((a, b) => a[1].at - b[1].at)) if (job.at <= clock) { due.delete(id); job.fn(); }
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const saves = [], heard = [];
  let answer = { ok:true };
  const saver = lookSaver({ target:() => look => { saves.push(look.critter); return answer; }, timers, onStatus:s => heard.push(s) });
  const look = critter => ({ critter, floatie:"donut", hat:"none", shades:"none", pose:"wave" });

  /* three quick changes: one save, the last look, half a second after the last */
  saver.change(look("otter"));
  tick(300);
  saver.change(look("frog"));
  tick(300);
  saver.change(look("duck"));
  tick(LOOK_SAVE_AFTER_MS - 1);
  await settle();
  assert.deepEqual(saves, [], "still owed while the changes keep coming");
  tick(1);
  await settle();
  assert.deepEqual(saves, ["duck"]);
  assert.deepEqual(heard.slice(-2), ["saving", "saved"]);

  /* a change, then the section closes (or the sheet goes) inside the pause:
     saved at once, and the pause's own save never follows */
  saver.change(look("bear"));
  tick(100);
  assert.equal(saver.flush(), true);
  tick(LOOK_SAVE_AFTER_MS * 4);
  await settle();
  assert.deepEqual(saves, ["duck", "bear"]);

  /* closing and opening again with nothing owed saves nothing */
  assert.equal(saver.flush(), false);
  assert.equal(saver.flush(), false);
  tick(LOOK_SAVE_AFTER_MS * 2);
  await settle();
  assert.deepEqual(saves, ["duck", "bear"]);

  /* a refused or failed save says so; the next change tries again */
  answer = { ok:false, error:"x" };
  saver.change(look("cat"));
  tick(LOOK_SAVE_AFTER_MS);
  await settle();
  assert.equal(heard.at(-1), "error");
  answer = { ok:true };
  saver.change(look("cat"));
  tick(LOOK_SAVE_AFTER_MS);
  await settle();
  assert.equal(heard.at(-1), "saved");
  assert.deepEqual(saves, ["duck", "bear", "cat", "cat"]);

  /* no saver yet: the look stays owed, never dropped, and saves once one is there */
  let late = null;
  const waiting = lookSaver({ target:() => late, timers });
  waiting.change(look("owl"));
  tick(LOOK_SAVE_AFTER_MS);
  assert.equal(waiting.owed()?.critter, "owl");
  const caught = [];
  late = l => { caught.push(l.critter); return { ok:true }; };
  assert.equal(waiting.flush(), true);
  await settle();
  assert.deepEqual(caught, ["owl"]);
  assert.equal(waiting.owed(), null);
});

/* ── the commissioner ── */

test("the desk: the Cup now, the looks picked, the riders' cards; Start Float again when the room never took it", () => {
  const state = racing();
  state.profiles[evan] = { display:"Evan", float:{ critter:"otter", floatie:"donut", hat:"none", shades:"none", pose:"flex" } };
  const cards = [{ cupId:"c1", pid:evan, fun:5, again:true, better:"A longer river", at:2 },
    { cupId:"c1", pid:khoa, fun:3, again:false, better:null, at:1 }, { cupId:"c1", pid:null, fun:null, again:true, better:null, at:0 }];
  assert.deepEqual(floatFeedbackSummary(cards), { count:3, fun:4, again:2, asked:3 });
  assert.equal(floatLooksPicked(state), 1);
  const desk = s => renderToStaticMarkup(wrap(s, React.createElement(FloatDesk, { state:s, initialFeedback:cards })));
  const html = desk(state);
  assert.match(html, /class="fd-float-desk-now is-live"/);
  assert.match(html, new RegExp(`Racing, ${state.float.players.length} riders`));
  assert.match(html, /<strong>1<\/strong><small>of 13 floaties<\/small>/);
  assert.match(html, /<strong>4<\/strong><small>fun of 5<\/small>/);
  assert.match(html, /<strong>2<\/strong><small>of 3 would play again<\/small>/);
  assert.match(html, /Evan<\/span>[\s\S]*5 of 5[\s\S]*Again: yes[\s\S]*A longer river/);
  assert.match(html, /A rider/);
  assert.doesNotMatch(html, />Start Float again</);
  const failed = structuredClone(state);
  failed.float.error = { at:1, text:"Room is full" };
  assert.deepEqual(floatDeskStatus(failed).text, "Didn't start: Room is full");
  assert.match(desk(failed), />Start Float again</);
  assert.equal(floatDeskStatus(structuredClone(EMPTY_STATE)).text, "Not started");
  const text = html.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(text, /—|!/);
});

test("the menu's Float desk and the Ready check's Floaties row, only with the room, only while Float is ahead", () => {
  const games = f => commissionerMenu(f).find(section => section.id === "games").items.map(item => [item.id, item.value]);
  assert.ok(!games({}).some(([id]) => id === "float"));
  const items = games({ float:true, floaties:3, coming:13, triviaQuestions:2 });
  assert.deepEqual(items.find(([id]) => id === "float"), ["float", "3 of 13 floaties"]);
  assert.ok(items.findIndex(([id]) => id === "float") === items.findIndex(([id]) => id === "trivia") + 1, "after Trivia, as on the slate");
  const row = (state, caps) => readyRows(readyCheck(state, { capabilities:caps })).find(item => item.id === "floaties");
  const state = structuredClone(EMPTY_STATE);
  state.profiles[evan] = { float:{ critter:"otter" } };
  assert.equal(row(state, {}), undefined);
  const floaties = row(state, { float:true });
  assert.deepEqual([floaties.have, floaties.of, floaties.state, floaties.opens], [1, 13, "partial", "float"]);
  state.results = { float:{ slots:[[evan]] } };
  assert.equal(row(state, { float:true }), undefined, "Float played: the row is gone");
});

test("the mark: a floatie on a wave of its own, never offered under Looks like", () => {
  const draw = id => renderToStaticMarkup(React.createElement(GameMark, { id, size:54 }));
  assert.notEqual(draw("float"), draw("no-such-game"));
  assert.ok(!GAME_MARK_IDS.includes("float") && !GAME_MARK_IDS.includes("karaoke"));
});

/* ── the parts ── */

test("Float's parts load from an effect through import.meta.glob, one chunk each; nothing else in src imports float/client", () => {
  assert.deepEqual([...FLOAT_PARTS].sort(), ["controller", "locker", "screen"]);
  const gate = read("src/features/float/floatParts.js");
  for (const path of ["screen/FloatScreen.jsx", "controller/FloatController.jsx", "locker/LockerPicker.jsx", "art/index.js"])
    assert.match(gate, new RegExp(`import\\.meta\\.glob\\("\\.\\./\\.\\./\\.\\./float/client/${path.replace(/[./]/g, "\\$&")}"\\)`), path);
  assert.match(gate, /useEffect\(\(\) => \{[\s\S]*loadFloatPart\(name\)/, "loaded from an effect");
  assert.match(gate, /useEffect\(\(\) => \{[\s\S]*loadFloatArt\(\)/, "the art too");
  assert.match(read("src/features/tv/TVMode.jsx"), /return withFloatRoster\(s, rosterTurn\);/, "the riders turn among the gap's own cards");
  const files = [];
  const walk = dir => readdirSync(join(ROOT, dir)).forEach(name => {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) walk(path);
    else if (/\.(jsx?|mjs)$/.test(name)) files.push(path);
  });
  walk("src");
  const importers = files.filter(path => /from\s*["'][^"']*float\/client\/|import\(\s*["'][^"']*float\/client\//.test(read(path)));
  assert.deepEqual(importers, [], "only the gate names float/client, and only through import.meta.glob");
  const app = read("src/App.jsx");
  assert.match(app, /lazyPart\(\(\) => import\("\.\/features\/float\/FloatDesk\.jsx"\), "FloatDesk"\)/);
  assert.match(app, /<FloatPlaySheet state=\{state\} me=\{me\} blocked=\{!!modal\} force=\{floatForce\} \/>/);
  assert.match(app, /<FloatHome state=\{state\} me=\{me\} inCard onOpen=\{\(\) => setFloatForce\(n => n \+ 1\)\} \/>/);
  assert.match(app, /case "float": return sheet\("floatDesk"\);/);
  const css = read("src/features/float/float.css");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css) && !/rgba?\(/.test(css), "tokens only");
  /* the controller sits where Trivia's game does: over the sheets, under a
     result's receipt and toast and under a moment that takes the screen */
  const layer = (path, selector) => Number(new RegExp(`${selector.replace(/[.-]/g, "\\$&")} \\{[^}]*z-index:(\\d+)`).exec(read(path))?.[1]);
  const play = layer("src/features/float/float.css", ".fd-float-play");
  assert.equal(play, layer("src/features/trivia/trivia.css", ".fd-trivia-game"));
  assert.ok(play > 100, "over a sheet");
  assert.ok(play < layer("src/features/results/results.css", ".fd-receipt"), "under the receipt");
  assert.ok(play < layer("src/ui/experience.css", ".fd-toast"), "under a toast");
  assert.ok(play < layer("src/features/moments/moments.css", ".fd-moment"), "under a moment");
});

/* The room's own components are built in parallel (float/PROTOCOL.md
   "Components"); Field Day embeds them, so each must import cleanly in node
   (no window or document at module scope) with its real props' default */
test("float/client: the screen, the controller and the locker import cleanly in node and export a component", async () => {
  for (const path of ["float/client/screen/FloatScreen.jsx", "float/client/controller/FloatController.jsx",
    "float/client/locker/LockerPicker.jsx"]) {
    const out = await build({ entryPoints:[join(ROOT, path)], bundle:true, platform:"node", format:"cjs",
      external:["react", "react-dom", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
    const part = new Module(fileURLToPath(new URL(`float-part-${path.split("/").pop()}.cjs`, import.meta.url)));
    part.filename = part.id;
    part.paths = Module._nodeModulePaths(ROOT);
    part._compile(out.outputFiles[0].text, part.filename);
    assert.equal(typeof part.exports.default, "function", `${path}: a default component`);
  }
  /* and the art the TV's riders turn draws its stills with */
  const out = await build({ entryPoints:[join(ROOT, "float/client/art/index.js")], bundle:true, platform:"node", format:"cjs",
    external:["react", "react-dom", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const art = new Module(fileURLToPath(new URL("float-part-art.cjs", import.meta.url)));
  art.filename = art.id;
  art.paths = Module._nodeModulePaths(ROOT);
  art._compile(out.outputFiles[0].text, art.filename);
  assert.equal(typeof art.exports.riderPortrait, "function", "art: riderPortrait");
});
