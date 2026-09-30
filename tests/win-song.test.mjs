/* Win songs: the write that records a win plays the winner's saved song on
   the speaker by itself, a 30-second clip (the champion's whole song), the
   alarm ends the clip, a take-back stops it, and the commissioner can turn
   it off. Spotify is stubbed; nothing leaves the process. */
import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_STATE, ROSTER, allEventsOf, contestUndoAvailability, makeBracket, resolveCurrentContest,
} from "../shared/core.js";
import { walkoutOf } from "../shared/audio.js";
import { compactSpotifyTrack } from "../worker/spotify.js";
import { WIN_SONG_CLIP_MS, singerFor, winSongFor } from "../worker/winSong.js";
import { Tournament } from "../worker/tournament.js";
import { applyAction, confirmStart } from "./support/confirmed-start.mjs";

const [HOST, P1, P2, P3] = ROSTER;
const trackFor = (id, name) => compactSpotifyTrack({
  id, uri:`spotify:track:${id}`, name, artists:[{ name:"Band" }], duration_ms:200000,
  external_urls:{ spotify:`https://open.spotify.com/track/${id}` }, album:{ images:[] },
}, 40000);
const SONGS = Object.fromEntries(ROSTER.map((player, index) =>
  [player, trackFor(`track${String(index).padStart(17, "0")}`, `Song ${index}`)]));

let serial = 0;
const gm = () => ({ isGm:true, player:HOST, deviceId:"host", actionId:`host-${++serial}` });
const act = (state, type, payload) => {
  const result = applyAction(state, type, payload, gm());
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const step = (state, type, payload) => {
  const before = structuredClone(state);
  act(state, type, payload);
  return winSongFor(before, state);
};
const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const contestOf = (state, id) => resolveCurrentContest(state, eventOf(state, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const withSongs = (state, players = ROSTER) => {
  for (const player of players) state.profiles[player] = { ...(state.profiles[player] || {}), walkoutTrack:SONGS[player] };
  return state;
};
const pairsBracket = (captains = false) => {
  const s = structuredClone(EMPTY_STATE);
  s.draws["8ball"] = { id:"draw-1", ts:1, teams:Array.from({ length:6 }, (_, key) => {
    const players = ROSTER.slice(key * 2, key * 2 + 2);
    return { name:null, players, ...(captains ? { captain:players[1] } : {}) };
  }) };
  s.brackets["8ball"] = makeBracket(6);
  return s;
};
const playToWinner = (s, pick = 0) => {
  act(s, "announceEvent", { evId:"8ball" });
  const first = contestOf(s, "8ball");
  act(s, "lockAndStart", { evId:"8ball", ...refs(first) });
  return { first, song:step(s, "recordContestWinner", { evId:"8ball", ...refs(first), winner:first.sides[pick].key }) };
};

test("a recorded contest winner plays the winning side's song as a clip", () => {
  const s = withSongs(pairsBracket());
  const { first, song } = playToWinner(s);
  const side = first.sides[0].players;
  assert.ok(side.includes(song.player), "one of the winning duo");
  assert.equal(song.track.trackId, SONGS[song.player].trackId);
  assert.equal(song.clipMs, WIN_SONG_CLIP_MS);
  assert.match(song.key, new RegExp(`^contest:8ball:${first.id}:`));
  /* opening the next contest, locking it: no win, no song */
  const second = contestOf(s, "8ball");
  assert.equal(step(s, "lockAndStart", { evId:"8ball", ...refs(second) }), null);
});

test("a duo plays one partner's song, drawn by the win so a retry draws the same one", () => {
  const s = withSongs(structuredClone(EMPTY_STATE), [P1, P2]);
  assert.equal(singerFor(s, [P1, P2], "contest:8ball:c1:5"), singerFor(s, [P1, P2], "contest:8ball:c1:5"));
  const drawn = new Set(Array.from({ length:40 }, (_, index) => singerFor(s, [P1, P2], `contest:8ball:c${index}:5`)));
  assert.deepEqual([...drawn].sort(), [P1, P2].sort(), "across wins, both partners get heard");
  const one = withSongs(structuredClone(EMPTY_STATE), [P2]);
  assert.equal(singerFor(one, [P1, P2], "any"), P2, "only one saved a song");
  assert.equal(singerFor(structuredClone(EMPTY_STATE), [P1, P2], "any"), null, "nobody saved one");
});

test("nobody on the winning side saved a song: silence", () => {
  const { song } = playToWinner(pairsBracket());
  assert.equal(song, null);
});

test("a free-for-all result plays first place's song", () => {
  const before = withSongs(structuredClone(EMPTY_STATE));
  const after = structuredClone(before);
  after.results.putt = { slots:[[P2], [P1], [P3]], ts:5 };
  const song = winSongFor(before, after);
  assert.equal(song.player, P2);
  assert.equal(song.clipMs, WIN_SONG_CLIP_MS);
  assert.equal(song.key, "result:putt:5");
  /* the same result again is not a new win */
  assert.equal(winSongFor(after, structuredClone(after)), null);
  /* the poker count is not a win song; the crown is */
  const counted = structuredClone(before);
  counted.results.poker = { stacks:{ [P1]:5000 }, slots:[[P1]], ts:9 };
  assert.equal(winSongFor(before, counted), null);
});

test("the crown plays the champion's whole song; a tie plays nothing", () => {
  const before = withSongs(structuredClone(EMPTY_STATE));
  before.live = true;
  const crowned = structuredClone(before);
  crowned.frozen = true;
  crowned.adjustments = [{ id:"a1", player:P3, delta:500, reason:"test", ts:1 }];
  const song = winSongFor(before, crowned);
  assert.equal(song.player, P3);
  assert.equal(song.clipMs, null);
  const tied = structuredClone(before);
  tied.frozen = true;
  assert.equal(winSongFor(before, tied), null, "everyone on 1,000 is a tie");
});

/* ── the Worker: plays after the write, ends the clip, takes it back ── */

const memoryContext = () => {
  const entries = new Map(), sockets = [], alarms = [], pending = [];
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
  return { entries, sockets, alarms, pending,
    context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil:p => pending.push(p) } };
};
const ENV = { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true", M2_SHOW_CONTROL_ENABLED:"true",
  M2_AUDIO_CATALOG_ENABLED:"true", M2_AUDIO_PLAYBACK_ENABLED:"true", SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret" };
const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status });

async function room({ connected = true } = {}) {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { ...ENV });
  await tournament.hydrateFromStorage();
  const bracket = pairsBracket();
  Object.assign(tournament.state, { draws:bracket.draws, brackets:bracket.brackets });
  withSongs(tournament.state);
  tournament.gmToken = "gm";
  if (connected) memory.entries.set("private:spotify:session", { accessToken:"a", refreshToken:"r",
    expiresAt:Date.now() + 3600000, account:{ product:"premium" } });
  memory.entries.set("private:spotify:device", { id:"speaker-1", name:"Living room" });
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { ws.attachment = structuredClone(value); },
    deserializeAttachment() { return ws.attachment; }, close() {} };
  memory.sockets.push(ws);
  let seq = 0;
  const say = async (type, payload) => {
    const actionId = `w${++seq}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, type, deviceId:"gm-device-0000-4000-8000-000000000001",
      gmToken:"gm", ...(payload !== undefined ? { payload:confirmStart(type, payload) } : {}) }));
    const ack = ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
    assert.equal(ack?.ok, true, `${type}: ${ack?.error}`);
    return ack;
  };
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", deviceId:"gm-device-0000-4000-8000-000000000001",
    payload:{ view:"app", visible:true } }));
  const settle = async () => { while (memory.pending.length) await memory.pending.shift(); };
  const current = () => resolveCurrentContest(tournament.state, eventOf(tournament.state, "8ball"));
  /* fades wait between volume steps; the tests do not */
  tournament.sleep = async () => {};
  return { tournament, memory, say, settle, current };
}
async function withSpotify(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = `${init.method || "GET"} ${String(url).replace("https://api.spotify.com/v1", "")}`;
    calls.push({ path, body:init.body ? JSON.parse(init.body) : null });
    return handler(path);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
  return calls;
}
const recordFirstWinner = async ({ say, current }) => {
  await say("announceEvent", { evId:"8ball" });
  const first = current();
  await say("lockAndStart", { evId:"8ball", ...refs(first) });
  await say("recordContestWinner", { evId:"8ball", ...refs(first), winner:first.sides[0].key });
  return first;
};

test("the winner tap plays their song on the speaker after the write, marked as a clip", async () => {
  const world = await room();
  let winner;
  const calls = await withSpotify(() => json(204, null), async () => {
    const first = await recordFirstWinner(world);
    await world.settle();
    const walkout = walkoutOf(world.tournament.state);
    winner = walkout.player;
    assert.ok(first.sides[0].players.includes(winner), "one of the winning duo");
    assert.equal(walkout.auto, true);
    assert.equal(walkout.until - walkout.startedAt, WIN_SONG_CLIP_MS);
    assert.ok(world.memory.alarms.includes(walkout.until - 3000), "the alarm starts the fade out before the clip ends");
  });
  const plays = calls.filter(call => call.path.startsWith("PUT /me/player/play"));
  assert.equal(plays.length, 1, "announcing and locking play nothing; the win plays once");
  assert.match(plays[0].path, /device_id=speaker-1/);
  assert.deepEqual(plays[0].body, { uris:[SONGS[winner].uri], position_ms:40000 });
});

test("the alarm stops the speaker at the clip's end, only while that song still plays", async () => {
  const world = await room();
  await withSpotify(() => json(204, null), async () => { await recordFirstWinner(world); await world.settle(); });
  const walkout = walkoutOf(world.tournament.state);
  world.tournament.state.showControl.audio.walkout = { ...walkout, startedAt:walkout.startedAt - 60000,
    until:Date.now() - 1 };
  const playing = trackId => path => path === "GET /me/player"
    ? json(200, { is_playing:true, progress_ms:70000, device:{ id:"speaker-1" },
      item:{ id:trackId, uri:`spotify:track:${trackId}`, name:"x", artists:[{ name:"y" }], duration_ms:200000,
        external_urls:{ spotify:"https://open.spotify.com/track/x" }, album:{ images:[] } } })
    : json(204, null);
  const stopped = await withSpotify(playing(walkout.trackId), () => world.tournament.alarm());
  assert.ok(stopped.some(call => call.path.startsWith("PUT /me/player/pause")), "the clip ends");
  assert.equal(walkoutOf(world.tournament.state), null);

  /* someone put on another song since: leave it */
  world.tournament.state.showControl.audio.walkout = { ...walkout, startedAt:walkout.startedAt - 60000,
    until:Date.now() - 1 };
  const other = await withSpotify(playing("otherotherotherother12"), () => world.tournament.alarm());
  assert.ok(!other.some(call => call.path.startsWith("PUT /me/player/pause")));
});

test("a win song fades in from silence to the room's level, and fades out before its clip ends", async () => {
  const world = await room();
  const song = { current:null };
  const speaker = (playing, volume) => json(200, { is_playing:playing, progress_ms:45000,
    device:{ id:"speaker-1", name:"Living room", volume_percent:volume, supports_volume:true },
    item:song.current ? { id:song.current, uri:`spotify:track:${song.current}`, name:"x", artists:[{ name:"y" }],
      duration_ms:200000, external_urls:{ spotify:"https://open.spotify.com/track/x" }, album:{ images:[] } } : null });
  let volume = 60;
  const handler = path => {
    const set = /PUT \/me\/player\/volume\?volume_percent=(\d+)/.exec(path);
    if (set) { volume = Number(set[1]); return json(204, null); }
    if (path === "GET /me/player") return speaker(!!song.current, volume);
    const play = /PUT \/me\/player\/play/.test(path);
    if (play) song.current = null;
    return json(204, null);
  };
  const volumes = calls => calls.map(call => /volume_percent=(\d+)/.exec(call.path)?.[1]).filter(Boolean).map(Number);
  const started = await withSpotify(handler, async () => { await recordFirstWinner(world); await world.settle(); });
  const order = started.map(call => call.path.replace(/\?.*$/, ""));
  assert.ok(order.indexOf("PUT /me/player/volume") < order.indexOf("PUT /me/player/play"), "silence first, then play");
  assert.deepEqual(volumes(started), [0, 10, 20, 30, 40, 50, 60], "up to the level the room had, in six steps");
  const walkout = walkoutOf(world.tournament.state);
  assert.deepEqual(world.memory.entries.get("private:spotify:fade"), { trackId:walkout.trackId, volume:60, device:"speaker-1" });

  /* 3 seconds before the clip ends */
  song.current = walkout.trackId;
  world.tournament.state.showControl.audio.walkout = { ...walkout, until:Date.now() + 2000 };
  const ended = await withSpotify(handler, () => world.tournament.alarm());
  assert.deepEqual(volumes(ended), [50, 40, 30, 20, 10, 0, 60], "down to silence, then the room's level back");
  const endOrder = ended.map(call => call.path.replace(/\?.*$/, ""));
  assert.ok(endOrder.indexOf("PUT /me/player/pause") > endOrder.indexOf("PUT /me/player/volume"), "pauses at silence");
  assert.equal(walkoutOf(world.tournament.state), null);
  assert.equal(world.memory.entries.has("private:spotify:fade"), false);
});

test("a speaker that refuses volume plays and stops with no fade", async () => {
  const world = await room();
  const calls = await withSpotify(path => path === "GET /me/player"
    ? json(200, { is_playing:false, device:{ id:"speaker-1", volume_percent:70, supports_volume:false } })
    : json(204, null), async () => { await recordFirstWinner(world); await world.settle(); });
  assert.equal(calls.filter(call => call.path.includes("/volume")).length, 0);
  assert.equal(calls.filter(call => call.path.startsWith("PUT /me/player/play")).length, 1);
});

test("Undo on the winner stops the song it started", async () => {
  const world = await room();
  let first;
  await withSpotify(() => json(204, null), async () => { first = await recordFirstWinner(world); await world.settle(); });
  const walkout = walkoutOf(world.tournament.state);
  const calls = await withSpotify(path => path === "GET /me/player"
    ? json(200, { is_playing:true, progress_ms:45000, device:{ id:"speaker-1" },
      item:{ id:walkout.trackId, uri:`spotify:track:${walkout.trackId}`, name:"x", artists:[{ name:"y" }],
        duration_ms:200000, external_urls:{ spotify:"https://open.spotify.com/track/x" }, album:{ images:[] } } })
    : json(204, null), async () => {
    const undo = contestUndoAvailability(world.tournament.state, eventOf(world.tournament.state, "8ball"));
    assert.equal(undo.contestId, first.id);
    await world.say("undoLastContest", { evId:"8ball", contestId:undo.contestId, contestRevision:undo.contestRevision });
    await world.settle();
  });
  assert.ok(calls.some(call => call.path.startsWith("PUT /me/player/pause")));
  assert.equal(walkoutOf(world.tournament.state), null);
});

test("turned off, or Spotify not connected: the win plays nothing and the write still lands", async () => {
  const off = await room();
  const status = await off.tournament.handleSpotify(new Request("https://fielddayseries.com/api/spotify/auto", {
    method:"POST", headers:{ Authorization:"Bearer gm", "Content-Type":"application/json" },
    body:JSON.stringify({ on:false }) }), new URL("https://fielddayseries.com/api/spotify/auto"));
  assert.deepEqual(await status.json(), { ok:true, autoWinSongs:false });
  const offCalls = await withSpotify(() => json(204, null), async () => { await recordFirstWinner(off); await off.settle(); });
  assert.equal(offCalls.length, 0);
  assert.equal(walkoutOf(off.tournament.state), null);

  const unplugged = await room({ connected:false });
  const calls = await withSpotify(() => json(204, null), async () => {
    await recordFirstWinner(unplugged); await unplugged.settle();
  });
  assert.equal(calls.length, 0);
  assert.equal(unplugged.tournament.state.eventOps["8ball"].contestStack.length, 1);

  /* a speaker that refuses is a log line, not a failed write */
  const refused = await room();
  await withSpotify(() => json(502, { error:{ message:"down" } }), async () => {
    await recordFirstWinner(refused); await refused.settle();
  });
  assert.equal(walkoutOf(refused.tournament.state), null);
  assert.equal(refused.tournament.state.eventOps["8ball"].contestStack.length, 1);
});
