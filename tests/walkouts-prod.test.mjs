/* Walkouts through the existing Spotify integration (A9b), the walkout
   silence contract's writer side (A6), and the cue chip fixes: Stop lasts as
   long as the song (G2) and stays reachable under a sheet (G3). */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, RESET_PROGRESS_CONFIRMATION } from "../shared/core.js";
import {
  WALKOUT_MAX_MS, WALKOUT_MIN_MS, buildWalkout, cleanWalkout, reconcileWalkout, walkoutLive, walkoutOf,
  walkoutRemainingMs,
} from "../shared/audio.js";
import { Tournament } from "../worker/tournament.js";
import { publicState } from "../worker/publicState.js";
import { compactSpotifyTrack } from "../worker/spotify.js";
import {
  CUE_BRIDGE_MS, DOCK_PLAY_LIMIT, cueRackItems, dockItems, effectiveWalkout, shouldPollWalkout, soundingWalkout,
} from "../src/features/director/walkout.js";

const TRACK_ID = "1234567890123456789012";
const OTHER_ID = "abcdefghijabcdefghij12";
const [EVAN, SAHIL, BEN] = ROSTER;
const savedTrack = compactSpotifyTrack({
  id:TRACK_ID, uri:`spotify:track:${TRACK_ID}`, name:"Entrance", artists:[{ name:"Band" }],
  duration_ms:200000, external_urls:{ spotify:`https://open.spotify.com/track/${TRACK_ID}` },
  album:{ images:[] },
}, 50000);

/* ── the shared contract ── */

test("a walkout lasts the rest of the song from its start point, bounded both ways", () => {
  assert.equal(walkoutRemainingMs({ durationMs:200000, positionMs:50000 }), 150000);
  assert.equal(walkoutRemainingMs({ durationMs:600000, positionMs:0 }), WALKOUT_MAX_MS);
  assert.equal(walkoutRemainingMs({ durationMs:200000, positionMs:199000 }), WALKOUT_MIN_MS);
  assert.equal(walkoutRemainingMs({ durationMs:"nope" }), WALKOUT_MAX_MS, "unknown length assumes the longest");
  assert.deepEqual(buildWalkout({ player:EVAN, trackId:TRACK_ID, startedAt:1000, durationMs:200000, positionMs:50000 }),
    { player:EVAN, trackId:TRACK_ID, startedAt:1000, until:151000 });
});

test("the validator drops anything malformed and knows the roster when asked", () => {
  const good = { player:EVAN, trackId:TRACK_ID, startedAt:10, until:20 };
  assert.deepEqual(cleanWalkout(good), good);
  assert.deepEqual(cleanWalkout({ ...good, extra:"x" }), good, "only the four contract fields survive");
  assert.equal(cleanWalkout({ ...good, until:10 }), null);
  assert.equal(cleanWalkout({ ...good, trackId:"short" }), null);
  assert.equal(cleanWalkout({ ...good, startedAt:-1 }), null);
  assert.equal(cleanWalkout({ ...good, player:"Nobody" }, { players:ROSTER }), null);
  assert.deepEqual(cleanWalkout({ ...good, player:null, trackId:null }), { ...good, player:null, trackId:null });
  assert.equal(cleanWalkout([good]), null);
  const state = { showControl:{ active:null, history:[], audio:{ walkout:good } } };
  assert.deepEqual(walkoutOf(state), good);
  assert.deepEqual(walkoutLive(state, 19), good);
  assert.equal(walkoutLive(state, 20), null, "until is exclusive");
  assert.equal(walkoutOf(structuredClone(EMPTY_STATE)), null, "an older state has no walkout");
});

test("the speaker's answer keeps, moves, or ends the record", () => {
  const walkout = { player:EVAN, trackId:TRACK_ID, startedAt:0, until:150000 };
  const playing = (progressMs, trackId = TRACK_ID, durationMs = 200000) =>
    ({ playing:true, progressMs, track:{ trackId, durationMs } });
  assert.deepEqual(reconcileWalkout(walkout, playing(52000), 2000), walkout, "on schedule: no write");
  assert.equal(reconcileWalkout(walkout, playing(80000), 2000).until, 122000, "drifted: follow the song");
  assert.equal(reconcileWalkout(walkout, { ...playing(80000), playing:false }, 2000), null, "paused");
  assert.equal(reconcileWalkout(walkout, null, 2000), null, "nothing playing");
  assert.equal(reconcileWalkout(walkout, playing(1000, OTHER_ID), 2000), null, "another song");
  const unknown = { ...walkout, trackId:null };
  assert.equal(reconcileWalkout(unknown, playing(1000, OTHER_ID), 2000).trackId, OTHER_ID, "a resume learns its song");
  const long = { ...walkout, until:WALKOUT_MAX_MS };
  const kept = reconcileWalkout(long, playing(0, TRACK_ID, 900000), 60000);
  assert.equal(kept.until, WALKOUT_MAX_MS, "a long song is not rewritten every poll");
  assert.equal(reconcileWalkout(long, playing(0, TRACK_ID, 900000), 200000).until, 200000 + WALKOUT_MAX_MS,
    "and is extended past its half-life while it keeps playing");
});

/* ── the Worker writer ── */

const memoryContext = () => {
  const entries = new Map();
  const sockets = [];
  const alarms = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
    async setAlarm(at) { alarms.push(at); },
  };
  return { entries, sockets, alarms, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage } };
};
const socketOf = memory => {
  let attachment = null;
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
const ENV = { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true", M2_SHOW_CONTROL_ENABLED:"true",
  M2_AUDIO_CATALOG_ENABLED:"true", M2_AUDIO_PLAYBACK_ENABLED:"true",
  SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret" };
async function spotifyTournament() {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { ...ENV });
  await tournament.hydrateFromStorage();
  tournament.state.profiles[EVAN] = { display:"Evan", walkoutTrack:savedTrack };
  tournament.gmToken = "gm";
  memory.entries.set("private:spotify:session", { accessToken:"a", refreshToken:"r",
    expiresAt:Date.now() + 3600000, account:{ product:"premium" } });
  memory.entries.set("private:spotify:device", { id:"speaker-1", name:"Living room" });
  return { tournament, memory };
}
const call = (tournament, path, body) => {
  const request = new Request(`https://fielddayseries.com/api/spotify/${path}`, {
    method:body ? "POST" : "GET", headers:{ Authorization:"Bearer gm", "Content-Type":"application/json" },
    ...(body ? { body:JSON.stringify(body) } : {}) });
  return tournament.handleSpotify(request, new URL(request.url));
};
const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status });
async function withSpotify(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = `${init.method || "GET"} ${String(url).replace("https://api.spotify.com/v1", "")}`;
    calls.push(path);
    return handler(path);
  };
  try { return { result:await run(), calls }; } finally { globalThis.fetch = original; }
}
const playback = (trackId, progressMs, playing = true) => json(200, { is_playing:playing, progress_ms:progressMs,
  device:{ id:"speaker-1", name:"Living room" },
  item:{ id:trackId, uri:`spotify:track:${trackId}`, name:"Entrance", artists:[{ name:"Band" }], duration_ms:200000,
    external_urls:{ spotify:`https://open.spotify.com/track/${trackId}` }, album:{ images:[] } } });

test("a cue that plays stamps the walkout from the saved track, broadcasts it, and arms the alarm", async () => {
  const { tournament, memory } = await spotifyTournament();
  const tv = socketOf(memory);
  const before = tournament.version;
  const startedAt = Date.now();
  const { result } = await withSpotify(() => json(204, null), () => call(tournament, "play", {
    uri:savedTrack.uri, positionMs:savedTrack.startMs, player:EVAN, durationMs:999 }));
  const body = await result.json();
  assert.equal(body.ok, true);
  const stored = walkoutOf(tournament.state);
  assert.equal(stored.player, EVAN);
  assert.equal(stored.trackId, TRACK_ID);
  assert.ok(stored.startedAt >= startedAt);
  assert.equal(stored.until - stored.startedAt, 150000, "the saved track's length wins over the client's");
  assert.deepEqual(body.walkout, stored);
  assert.equal(tournament.version, before + 1, "its own write");
  const frame = tv.frames.at(-1);
  assert.equal(frame.lastAction, "walkoutStart");
  assert.deepEqual(frame.state.showControl.audio.walkout, stored, "every viewer receives it");
  assert.deepEqual(memory.alarms, [stored.until + 250]);
  assert.deepEqual(memory.entries.get("state").showControl.audio.walkout, stored, "persisted");
});

test("the walkout is public presentation state for every viewer", async () => {
  const { tournament } = await spotifyTournament();
  await withSpotify(() => json(204, null), () => call(tournament, "play", { uri:savedTrack.uri, player:EVAN }));
  for (const viewer of [{ isGm:false, player:null }, { isGm:false, player:SAHIL }, { isGm:true, player:null }])
    assert.deepEqual(publicState(tournament.state, viewer).showControl.audio.walkout, walkoutOf(tournament.state));
});

test("a failed play leaves nothing set, and a bad player never reaches Spotify", async () => {
  const { tournament, memory } = await spotifyTournament();
  const before = tournament.version;
  const { result } = await withSpotify(() => json(403, { error:{ status:403, reason:"PREMIUM_REQUIRED",
    message:"Premium required" } }), () => call(tournament, "play", { uri:savedTrack.uri, player:EVAN }));
  assert.equal(result.status, 403);
  assert.equal(walkoutOf(tournament.state), null);
  assert.equal(tournament.version, before, "no write");
  assert.deepEqual(memory.alarms, []);

  const { result:bad, calls } = await withSpotify(() => json(204, null),
    () => call(tournament, "play", { uri:savedTrack.uri, player:"Somebody" }));
  assert.equal(bad.status, 400);
  assert.deepEqual(calls, []);
  assert.equal(walkoutOf(tournament.state), null);

  /* a live walkout survives a failed play of another cue: its song is still on */
  await withSpotify(() => json(204, null), () => call(tournament, "play", { uri:savedTrack.uri, player:EVAN }));
  const live = walkoutOf(tournament.state);
  await withSpotify(() => json(502, { error:{ status:502, message:"down" } }),
    () => call(tournament, "play", { uri:`spotify:track:${OTHER_ID}`, player:SAHIL }));
  assert.deepEqual(walkoutOf(tournament.state), live);
});

test("a searched track stamps with no player and its own length; a resume reads the speaker once", async () => {
  const { tournament } = await spotifyTournament();
  await withSpotify(() => json(204, null), () => call(tournament, "play", {
    uri:`spotify:track:${OTHER_ID}`, durationMs:90000, positionMs:30000 }));
  const searched = walkoutOf(tournament.state);
  assert.equal(searched.player, null);
  assert.equal(searched.until - searched.startedAt, 60000);

  await withSpotify(() => json(204, null), () => call(tournament, "pause", {}));
  const { calls } = await withSpotify(path => path.startsWith("GET /me/player") ? playback(TRACK_ID, 120000)
    : json(204, null), () => call(tournament, "play", {}));
  assert.deepEqual(calls, ["PUT /me/player/play?device_id=speaker-1", "GET /me/player"]);
  const resumed = walkoutOf(tournament.state);
  assert.equal(resumed.player, EVAN, "the song is Evan's saved walkout");
  assert.equal(resumed.until - resumed.startedAt, 80000);
});

test("stop clears the walkout; a failed stop keeps it", async () => {
  const { tournament, memory } = await spotifyTournament();
  const tv = socketOf(memory);
  await withSpotify(() => json(204, null), () => call(tournament, "play", { uri:savedTrack.uri, player:EVAN }));
  const live = walkoutOf(tournament.state);
  const { result:failed } = await withSpotify(() => json(502, { error:{ status:502, message:"down" } }),
    () => call(tournament, "pause", {}));
  assert.equal(failed.status, 502);
  assert.deepEqual(walkoutOf(tournament.state), live);
  const { result } = await withSpotify(() => json(204, null), () => call(tournament, "pause", {}));
  assert.deepEqual(await result.json(), { ok:true, walkout:null });
  assert.equal(walkoutOf(tournament.state), null);
  assert.deepEqual(tournament.state.showControl.audio, { walkout:null });
  assert.equal(tv.frames.at(-1).lastAction, "walkoutStop");
  const version = tournament.version;
  await withSpotify(() => json(204, null), () => call(tournament, "pause", {}));
  assert.equal(tournament.version, version, "a second stop writes nothing");
});

test("reading the speaker clears a stopped walkout and follows a playing one", async () => {
  const { tournament } = await spotifyTournament();
  const devices = json(200, { devices:[] });
  await withSpotify(() => json(204, null), () => call(tournament, "play", { uri:savedTrack.uri, positionMs:50000, player:EVAN }));
  const stamped = walkoutOf(tournament.state);

  /* the song jumped ahead: the record moves to the song's real end */
  const { result } = await withSpotify(path => path === "GET /me/player/devices" ? devices
    : playback(TRACK_ID, 170000), () => call(tournament, "player"));
  const body = await result.json();
  const moved = walkoutOf(tournament.state);
  assert.ok(moved.until < stamped.until - 100000);
  assert.deepEqual(body.walkout, moved);

  /* paused from the Spotify app: the record ends */
  await withSpotify(path => path === "GET /me/player/devices" ? json(200, { devices:[] })
    : playback(TRACK_ID, 171000, false), () => call(tournament, "player"));
  assert.equal(walkoutOf(tournament.state), null);

  /* nothing stored: a read never invents a walkout */
  const version = tournament.version;
  await withSpotify(path => path === "GET /me/player/devices" ? json(200, { devices:[] })
    : playback(TRACK_ID, 1000), () => call(tournament, "player"));
  assert.equal(walkoutOf(tournament.state), null);
  assert.equal(tournament.version, version);
});

test("the alarm ends a walkout at until, and re-arms when it fires early", async () => {
  const { tournament, memory } = await spotifyTournament();
  await withSpotify(() => json(204, null), () => call(tournament, "play", { uri:savedTrack.uri, player:EVAN }));
  const live = walkoutOf(tournament.state);
  await tournament.alarm();
  assert.deepEqual(walkoutOf(tournament.state), live, "early: still playing");
  assert.equal(memory.alarms.at(-1), live.until + 250);
  tournament.state.showControl.audio.walkout = { ...live, until:Date.now() - 1 };
  await tournament.alarm();
  assert.equal(walkoutOf(tournament.state), null);
  const version = tournament.version;
  await tournament.alarm();
  assert.equal(tournament.version, version, "nothing to clear");
});

test("a walkout never gates an official write and outlives a progress reset", async () => {
  const { tournament, memory } = await spotifyTournament();
  await withSpotify(() => json(204, null), () => call(tournament, "play", { uri:savedTrack.uri, player:EVAN }));
  const live = walkoutOf(tournament.state);
  const ws = socketOf(memory);
  const send = (type, payload) => tournament.webSocketMessage(ws, JSON.stringify({
    actionId:`a-${type}`, type, payload, deviceId:"device-gm-0000", gmToken:"gm" }));
  await send("setLive", { on:true });
  const ack = ws.frames.find(frame => frame.type === "ack" && frame.actionId === "a-setLive");
  assert.equal(ack?.ok, true, "acknowledged");
  assert.equal(tournament.state.live, true);
  await send("resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(ws.frames.find(frame => frame.actionId === "a-resetTournament")?.ok, true);
  assert.deepEqual(walkoutOf(tournament.state), live, "the song is still on the speaker");
});

test("production gets Audio Director from its flags and plays only once its secrets exist", () => {
  const production = flags => new Tournament(memoryContext().context,
    { APP_ENV:"production", M2_AUDIO_CATALOG_ENABLED:"true", M2_AUDIO_PLAYBACK_ENABLED:"true", ...flags }).capabilities;
  const unset = production({});
  assert.equal(unset.audioDirector, true, "the setup screen names what is missing");
  assert.equal(unset.audioCatalog, false);
  assert.equal(unset.audioPlayback, false);
  const ready = production({ SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret" });
  assert.equal(ready.audioCatalog, true);
  assert.equal(ready.audioPlayback, true);
});

/* ── the commissioner's chips (G2, G3) ── */

test("Stop follows the server record, with this device's own answer bridging the broadcast", () => {
  const stored = { player:EVAN, trackId:TRACK_ID, startedAt:1000, until:9000 };
  assert.deepEqual(effectiveWalkout(stored, null, 0), stored);
  const newer = { ...stored, player:SAHIL, startedAt:2000 };
  assert.deepEqual(effectiveWalkout(stored, { walkout:newer, serverAt:2000, clientAt:100 }, 200), newer);
  assert.deepEqual(effectiveWalkout(stored, { walkout:newer, serverAt:2000, clientAt:100 }, 100 + CUE_BRIDGE_MS), stored,
    "the bridge lapses");
  assert.equal(effectiveWalkout(stored, { walkout:null, serverAt:1500, clientAt:100 }, 200), null, "just stopped");
  assert.deepEqual(effectiveWalkout(newer, { walkout:null, serverAt:1500, clientAt:100 }, 200), newer,
    "a newer walkout shows through a stop");
  assert.deepEqual(soundingWalkout(stored, 8999), stored);
  assert.equal(soundingWalkout(stored, 9000), null);
  assert.equal(shouldPollWalkout({ showControl:{ audio:{ walkout:stored } } }, null, 0), true);
  assert.equal(shouldPollWalkout(structuredClone(EMPTY_STATE), null, 0), false);
});

test("a playing walkout keeps its Stop chip after the cue window closes (G2)", () => {
  const state = { profiles:{ [EVAN]:{ walkoutTrack:savedTrack }, [SAHIL]:{ walkoutTrack:savedTrack }, [BEN]:{} } };
  const sounding = { player:EVAN, trackId:TRACK_ID, startedAt:0, until:10 };
  assert.deepEqual(cueRackItems(state, [], sounding).map(item => [item.player, item.sounding]), [[EVAN, true]]);
  assert.deepEqual(cueRackItems(state, [SAHIL, BEN, EVAN], sounding).map(item => [item.player, item.sounding]),
    [[SAHIL, false], [EVAN, true]], "players without a saved track get no chip");
  assert.deepEqual(cueRackItems(state, [], { ...sounding, player:null }).map(item => [item.player, item.sounding]),
    [[null, true]], "a searched song still has a Stop");
  const items = cueRackItems(state, [SAHIL, EVAN], null);
  assert.deepEqual(dockItems(items), items, `up to ${DOCK_PLAY_LIMIT} play chips fit in a header`);
  const many = ROSTER.slice(0, 5).map(player => ({ player, track:savedTrack, sounding:false }));
  assert.deepEqual(dockItems(many), []);
  assert.deepEqual(dockItems([...many, { player:EVAN, track:savedTrack, sounding:true }]).map(item => item.player), [EVAN]);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:`
    export { CueRack, resetCueState, cueStateForTest } from "./src/features/director/CueRack.jsx";
    export { Sheet, SheetDock } from "./src/ui/controls.jsx";
  `, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"cue-client", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
      export const spotifyPlay = body => globalThis.__cueCalls.push(["play", body]) && globalThis.__cueAnswer("play");
      export const spotifyPause = body => globalThis.__cueCalls.push(["pause", body]) && globalThis.__cueAnswer("pause");
      export const spotifyPlayer = () => globalThis.__cueCalls.push(["player"]) && globalThis.__cueAnswer("player");
    ` }));
  } }],
});
const componentModule = new Module(fileURLToPath(new URL("walkouts-prod.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { CueRack, resetCueState, cueStateForTest, Sheet, SheetDock } = componentModule.exports;

const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");
function renderButtons(element) {
  const buttons = [];
  const createElement = React.createElement;
  const useLayoutEffect = React.useLayoutEffect;
  React.useLayoutEffect = React.useEffect;
  React.createElement = (type, props, ...children) => {
    if (type === "button" && props?.onClick)
      buttons.push({ name:props["aria-label"] || textOf(children), text:textOf(children), click:props.onClick,
        disabled:!!props.disabled });
    return createElement(type, props, ...children);
  };
  let html;
  try { html = renderToStaticMarkup(element); } finally {
    React.createElement = createElement;
    React.useLayoutEffect = useLayoutEffect;
  }
  return { html, buttons };
}
const liveState = (walkout, extra = {}) => ({ ...structuredClone(EMPTY_STATE),
  profiles:{ [EVAN]:{ display:"Evan", walkoutTrack:savedTrack }, [SAHIL]:{ display:"Sahil", walkoutTrack:savedTrack } },
  showControl:{ active:null, history:[], audio:{ walkout } }, ...extra });

test("tapping a playing walkout's chip stops it and never restarts the song (G2)", async () => {
  resetCueState();
  globalThis.__cueCalls = [];
  globalThis.__cueAnswer = kind => Promise.resolve(kind === "pause" ? { ok:true, walkout:null } : { ok:true });
  const now = Date.now();
  const state = liveState({ player:EVAN, trackId:TRACK_ID, startedAt:now - 100000, until:now + 60000 });
  const { buttons } = renderButtons(React.createElement(CueRack, { state, candidates:[] }));
  assert.deepEqual(buttons.map(button => button.name), ["Stop Evan's song"],
    "Stop outlasts the 90 second guess and the cue window");
  await buttons[0].click();
  assert.deepEqual(globalThis.__cueCalls.map(([kind]) => kind), ["pause"]);
  assert.equal(cueStateForTest().bridge.walkout, null);
  const after = renderButtons(React.createElement(CueRack, { state, candidates:[EVAN] }));
  assert.deepEqual(after.buttons.map(button => button.name), ["Play Evan's song"],
    "the stop shows at once, before the broadcast");

  resetCueState();
  const ended = liveState({ player:EVAN, trackId:TRACK_ID, startedAt:now - 200000, until:now - 1 });
  assert.deepEqual(renderButtons(React.createElement(CueRack, { state:ended, candidates:[EVAN] }))
    .buttons.map(button => button.name), ["Play Evan's song"], "the song is over");
});

test("a cue tap sends the player and track length and shows Stop from its own answer", async () => {
  resetCueState();
  globalThis.__cueCalls = [];
  const now = Date.now();
  const walkout = { player:SAHIL, trackId:TRACK_ID, startedAt:now, until:now + 150000 };
  globalThis.__cueAnswer = () => Promise.resolve({ ok:true, walkout });
  const toasts = [];
  const state = liveState(null);
  const { buttons } = renderButtons(React.createElement(CueRack, { state, candidates:[SAHIL],
    notify:text => toasts.push(text) }));
  await buttons.find(button => button.name === "Play Sahil's song").click();
  assert.deepEqual(globalThis.__cueCalls, [["play", { uri:savedTrack.uri, positionMs:savedTrack.startMs,
    player:SAHIL, durationMs:savedTrack.durationMs }]]);
  assert.deepEqual(toasts, ["Sahil's song playing"]);
  const bridged = renderButtons(React.createElement(CueRack, { state, candidates:[SAHIL] }));
  assert.deepEqual(bridged.buttons.map(button => button.name), ["Stop Sahil's song"]);
  resetCueState();
});

test("an open sheet docks the Stop chip in its header (G3)", () => {
  resetCueState();
  const now = Date.now();
  const state = liveState({ player:EVAN, trackId:TRACK_ID, startedAt:now, until:now + 60000 });
  const dock = React.createElement(CueRack, { state, candidates:[], docked:true });
  const { html, buttons } = renderButtons(React.createElement(SheetDock.Provider, { value:dock },
    React.createElement(Sheet, { title:"Putting", onClose:() => {} }, React.createElement("p", null, "Body"))));
  assert.match(html, /class="fd-sheet-header"[^]*class="fd-sheet-dock"[^]*aria-label="Close"/,
    "between the title and Close, inside the header");
  const stop = buttons.find(button => button.name === "Stop Evan's song");
  assert.ok(stop);
  assert.equal(stop.text.trim().replace(/\s+/g, " "), "■Stop Evan");

  const plain = renderButtons(React.createElement(Sheet, { title:"Putting", onClose:() => {} }, "Body")).html;
  assert.equal(plain.includes("fd-sheet-dock"), false, "nothing docked by default");
});
