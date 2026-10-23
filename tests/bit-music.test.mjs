/* The win song and the bit (Oct 14, shared/bitMusic.js): a moment's bit
   plays at the moment and the winner's song arrives on a beat of it. The
   pure timing model (a bit's beat to the song's request, minus the
   speaker's latency; a music bit holding its wind-up until the speaker
   plays; the cues on its second clock), the "Tap on the beat" calibration
   reducer, the moment model's song (the Worker's cue, then the walkout
   that carries the bit) and the Worker that sends the request early, on
   the beat, after a songless bit, or not at all once the moment is taken
   back. Spotify is stubbed; nothing leaves the process. */
import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_STATE, ROSTER, allEventsOf, contestUndoAvailability, makeBracket, resolveCurrentContest } from "../shared/core.js";
import { walkoutOf, songCueOf, songLogOf, songPlayingAt, logSong, logSongStop } from "../shared/audio.js";
import {
  CALIBRATION_IDLE, CALIBRATION_ROUNDS, CUE_MAX_WAIT_MS, DEFAULT_LATENCY_MS, MAX_LATENCY_MS, SONG_AFTER_BIT_MS, TAP_WINDOW_MS,
  bitElapsed, bitOrigin, bitPhase, calibrationStep, cleanLatency, cueTime, holdBeatOf, latencyFromTaps, latencyOf, songBeatOf, songPlan,
} from "../shared/bitMusic.js";
import { BITS, bitById } from "../src/features/gags/bits/registry.js";
import { gagSong } from "../src/features/gags/gagModel.js";
import { bitCues } from "../src/features/tv/bitSound.js";
import { compactSpotifyTrack } from "../worker/spotify.js";
import { Tournament } from "../worker/tournament.js";
import { confirmStart } from "./support/confirmed-start.mjs";

const standoff = bitById("standoff"), headphones = bitById("headphones"), anvil = bitById("anvil");

/* ── the catalog's songs ── */

test("every bit says how the song meets it: music on its action after a hold, a punchline on its hit, a loss and idle songless", () => {
  for (const bit of BITS) {
    const at = `${bit.id}:`;
    if (bit.style === "music") {
      assert.equal(bit.shape, "win", `${at} music is a win's`);
      const hold = holdBeatOf(bit), beat = songBeatOf(bit);
      assert.ok(hold !== null && beat !== null, `${at} a hold and a beat`);
      assert.ok(hold < beat && beat - hold <= 600, `${at} the hold is the wind-up's end, just before the action`);
      assert.ok(bit.cues.some(cue => cue.unless === "song"), `${at} its own groove when no song comes`);
    } else if (bit.style === "punchline") {
      assert.ok(["versus", "win"].includes(bit.shape), `${at} a punchline is a win's or an upset's`);
      assert.ok(songBeatOf(bit) !== null, `${at} its punchline is a beat`);
      assert.equal(holdBeatOf(bit), null, `${at} never holds`);
    } else {
      assert.equal(bit.style, "songless", `${at} a style`);
      assert.equal(bit.song, null, `${at} no song`);
      assert.ok(["loss", "idle"].includes(bit.shape), `${at} a loss or an idle vignette`);
    }
    assert.equal(bit.cues.filter(cue => cue.unless).every(cue => cue.unless === "song"), true, `${at} unless:"song" only`);
  }
  assert.equal(songBeatOf(standoff), standoff.beats.hit);
  assert.equal(holdBeatOf(headphones), headphones.beats.hover);
  assert.equal(songBeatOf(headphones), headphones.beats.click);
  assert.equal(songBeatOf(anvil), null);
});

/* ── the plan: when the Worker sends the request ── */

test("songPlan: on the bit's beat minus the speaker's latency; after a songless bit; now with no moment", () => {
  const start = 1_000_000, now = start - 4000;
  const gag = { id:"g", bit:"standoff", start, players:["Khoa"] };
  const beat = songPlan({ gag, bit:standoff, singer:"Khoa", latencyMs:700, now });
  assert.deepEqual(beat, { mode:"beat", beat:standoff.beats.hit, audibleAt:start + standoff.beats.hit,
    requestAt:start + standoff.beats.hit - 700 });
  /* a speaker never measured: the default */
  assert.equal(songPlan({ gag, bit:standoff, singer:"Khoa", latencyMs:null, now }).requestAt, start + standoff.beats.hit - DEFAULT_LATENCY_MS);
  /* the beat is close: send it now, never in the past */
  assert.equal(songPlan({ gag, bit:standoff, singer:"Khoa", latencyMs:700, now:start + 5000 }).requestAt, start + 5000);
  /* a music bit: the song lands on its action */
  const music = songPlan({ gag:{ ...gag, bit:"headphones" }, bit:headphones, singer:"Khoa", latencyMs:900, now });
  assert.equal(music.audibleAt, start + headphones.beats.click);
  assert.equal(music.requestAt, start + headphones.beats.click - 900);
  /* a loss is songless: the write's song after the bit lifts off */
  const after = songPlan({ gag:{ ...gag, bit:"anvil" }, bit:anvil, singer:"Khoa", latencyMs:700, now });
  assert.deepEqual(after, { mode:"after", requestAt:start + anvil.span + SONG_AFTER_BIT_MS });
  /* a bit about someone else (a new leader who did not win the write) */
  assert.equal(songPlan({ gag, bit:standoff, singer:"Sahil", latencyMs:700, now }).mode, "after");
  assert.deepEqual(songPlan({ gag:null, bit:null, singer:"Khoa", now }), { mode:"now" });
});

/* ── the music bit's second clock ── */

test("a music bit holds its wind-up until the song: pending holds to the deadline, a late song moves the action onto it", () => {
  const start = 2_000_000, hold = headphones.beats.hover, beat = headphones.beats.click;
  assert.equal(bitOrigin(headphones, start, { status:"none" }), start, "no song coming: no hold");
  assert.equal(bitOrigin(headphones, start, null), start);
  assert.equal(bitOrigin(headphones, start, { status:"pending" }), start + CUE_MAX_WAIT_MS, "pending: held at most this long");
  assert.equal(bitOrigin(headphones, start, { status:"set", audibleAt:start + beat }), start, "on time: no hold at all");
  assert.equal(bitOrigin(headphones, start, { status:"set", audibleAt:start + beat + 700 }), start + 700, "late: the action waits");
  assert.equal(bitOrigin(headphones, start, { status:"set", audibleAt:start + beat - 5000 }), start - (beat - hold),
    "early: it cuts straight to the action at the hold");
  assert.equal(bitOrigin(standoff, start, { status:"set", audibleAt:start + 99999 }), start, "a punchline bit never holds");
  const origin = start + 700;
  assert.equal(bitElapsed(headphones, start, origin, start + 300), 300, "the wind-up runs");
  assert.equal(bitElapsed(headphones, start, origin, start + hold + 400), hold, "held on its hold beat");
  assert.equal(bitElapsed(headphones, start, origin, origin + beat), beat, "the action on the song");
  assert.deepEqual(bitPhase(headphones, start, origin, start + 100), { mode:"run", base:start, next:start + hold });
  assert.deepEqual(bitPhase(headphones, start, origin, start + hold + 10), { mode:"hold", at:hold, next:origin + hold });
  assert.deepEqual(bitPhase(headphones, start, origin, origin + hold + 10), { mode:"run", base:origin, next:null });
  assert.deepEqual(bitPhase(standoff, start, origin, start + 10), { mode:"run", base:start, next:null });
  /* the cues: the wind-up's on the start's clock, the rest on the origin's */
  const cue = headphones.cues.find(item => item.at >= hold);
  assert.equal(cueTime(headphones, cue.at, start, origin), origin + cue.at);
  assert.equal(cueTime(headphones, 0, start, origin), start);
  const cues = bitCues(headphones, { start, origin, song:true, key:"t" });
  assert.ok(cues.every(item => item.id !== "bitGroove"), "a song coming: no groove of its own");
  assert.ok(bitCues(headphones, { start, key:"t" }).some(item => item.id === "bitGroove"), "no song: its own groove");
  assert.ok(cues.filter(item => item.part === "post").every(item => item.key.includes(`:${origin}:`)), "post cues keyed by their clock");
  /* a punchline's foley: open to the hit, ducked under the song after it */
  const hit = bitCues(standoff, { start, song:true, key:"s" });
  standoff.cues.forEach((item, i) => assert.equal(hit[i].open, item.at <= standoff.beats.hit, `${item.sound} at ${item.at}`));
  assert.ok(bitCues(standoff, { start, key:"s" }).every(item => item.open), "no song: all open");
});

test("the moment's song from the record: none, the Worker's cue (pending), then the walkout that carries the bit (set)", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.deepEqual(gagSong(state, "contest:die:c1:upset"), { status:"none" });
  state.showControl = { active:null, history:[], audio:{ cue:{ gag:"contest:die:c1:upset", player:"Khoa", at:5000 } } };
  assert.deepEqual(gagSong(state, "contest:die:c1:upset"), { status:"pending", at:5000 });
  assert.deepEqual(gagSong(state, "another"), { status:"none" });
  state.showControl.audio.walkout = { player:"Khoa", trackId:null, startedAt:5100, until:35100, auto:true, bit:"contest:die:c1:upset",
    audibleAt:5100 };
  assert.deepEqual(gagSong(state, "contest:die:c1:upset"), { status:"set", audibleAt:5100 });
  assert.equal(walkoutOf(state).bit, "contest:die:c1:upset");
  assert.equal(songCueOf(state).gag, "contest:die:c1:upset");
  state.showControl.audio.cue = { gag:"no spaces allowed!", at:1 };
  assert.equal(songCueOf(state), null, "a bad cue reads as none");
});

test("the song log: what played, cut short when stopped; a loss may cut a song playing through its write", () => {
  const w = { player:"Evan", startedAt:1000, until:31000 };
  let log = logSong([], w);
  assert.deepEqual(log, [{ player:"Evan", startedAt:1000, until:31000 }]);
  assert.deepEqual(logSong(log, w), log, "once");
  assert.equal(songPlayingAt(log, 5000, 4000), true);
  assert.equal(songPlayingAt(log, 28000, 4000), false, "too near its end to be cut");
  log = logSongStop(log, w, 6000);
  assert.equal(log[0].until, 6000);
  assert.equal(songPlayingAt(log, 5000, 4000), false, "stopped early: no song to cut");
  assert.equal(songLogOf({ showControl:{ audio:{ songs:[{ startedAt:5, until:2 }, ...log] } } }).length, 1, "a bad entry is dropped");
});

/* ── Tap on the beat ── */

test("calibration: the speaker's latency is its taps' median less the clicks', the reaction cancelling out", () => {
  const taps = (heard, delays) => delays.map(d => ({ heard, at:heard + d }));
  assert.equal(latencyFromTaps({ clicks:taps(0, [210, 190, 250]), speaker:taps(1000, [1050, 1110, 1090]) }), 880);
  assert.equal(latencyFromTaps({ clicks:[], speaker:taps(0, [900]) }), null, "no reference, no reading");
  assert.equal(latencyFromTaps({ clicks:taps(0, [300]), speaker:taps(0, [200]) }), 0, "never below zero");
  assert.equal(cleanLatency(912), 910);
  assert.equal(cleanLatency(-1), null);
  assert.equal(cleanLatency(MAX_LATENCY_MS + 1), null);
  assert.equal(latencyOf(null), DEFAULT_LATENCY_MS);
  let s = calibrationStep(CALIBRATION_IDLE, { type:"start" });
  assert.equal(s.step, "clicks");
  assert.equal(calibrationStep(s, { type:"tap", at:5 }), s, "a tap before the sound is nothing");
  for (let round = 0; round < CALIBRATION_ROUNDS; round++) {
    s = calibrationStep(s, { type:"sound", at:10000 * (round + 1) });
    assert.equal(calibrationStep(s, { type:"tap", at:10000 * (round + 1) + TAP_WINDOW_MS + 1 }), s, "too late to answer it");
    s = calibrationStep(s, { type:"tap", at:10000 * (round + 1) + 200 });
  }
  assert.equal(s.step, "speaker", "three clicks, then the speaker");
  assert.equal(s.clicks.length, CALIBRATION_ROUNDS);
  s = calibrationStep(s, { type:"sound", at:50000 });
  assert.equal(calibrationStep(s, { type:"retry" }).heard, null, "nobody tapped: the round again");
  for (let round = 0; round < CALIBRATION_ROUNDS; round++) {
    s = calibrationStep(s, { type:"sound", at:100000 * (round + 1) });
    s = calibrationStep(s, { type:"tap", at:100000 * (round + 1) + 1100 });
  }
  assert.equal(s.step, "done");
  assert.equal(s.latency, 900);
  assert.equal(calibrationStep(s, { type:"reset" }), CALIBRATION_IDLE);
  assert.equal(calibrationStep(CALIBRATION_IDLE, { type:"fail", error:"x" }).error, "x");
});

/* ── the Worker: the request on the beat ── */

const trackFor = (id, name) => compactSpotifyTrack({
  id, uri:`spotify:track:${id}`, name, artists:[{ name:"Band" }], duration_ms:200000,
  external_urls:{ spotify:`https://open.spotify.com/track/${id}` }, album:{ images:[] },
}, 40000);
const SONGS = Object.fromEntries(ROSTER.map((player, index) => [player, trackFor(`track${String(index).padStart(17, "0")}`, `Song ${index}`)]));
const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status });
function memoryContext() {
  const entries = new Map(), sockets = [], alarms = [], pending = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])); },
    async transaction(fn) { return fn(storage); },
    async setAlarm(at) { alarms.push(at); },
  };
  return { entries, sockets, alarms, pending,
    context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil:p => pending.push(p) } };
}
const ENV = { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true", M2_SHOW_CONTROL_ENABLED:"true",
  M2_AUDIO_CATALOG_ENABLED:"true", M2_AUDIO_PLAYBACK_ENABLED:"true", SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret" };
async function room({ latency = null } = {}) {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { ...ENV });
  await tournament.hydrateFromStorage();
  const s = tournament.state;
  s.draws["8ball"] = { id:"draw-1", ts:1, teams:Array.from({ length:6 }, (_, key) => ({ name:null, players:ROSTER.slice(key * 2, key * 2 + 2) })) };
  s.brackets["8ball"] = makeBracket(6);
  for (const player of ROSTER) s.profiles[player] = { ...(s.profiles[player] || {}), walkoutTrack:SONGS[player] };
  tournament.gmToken = "gm";
  memory.entries.set("private:spotify:session", { accessToken:"a", refreshToken:"r", expiresAt:Date.now() + 3600000, account:{ product:"premium" } });
  memory.entries.set("private:spotify:device", { id:"speaker-1", name:"Living room" });
  if (latency !== null) memory.entries.set("private:spotify:latency", latency);
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); }, serializeAttachment(v) { ws.attachment = structuredClone(v); },
    deserializeAttachment() { return ws.attachment; }, close() {} };
  memory.sockets.push(ws);
  let seq = 0;
  const say = async (type, payload) => {
    const actionId = `m${++seq}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, type, deviceId:"gm-device-0000-4000-8000-000000000001", gmToken:"gm",
      ...(payload !== undefined ? { payload:confirmStart(type, payload) } : {}) }));
    const ack = ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
    assert.equal(ack?.ok, true, `${type}: ${ack?.error}`);
  };
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", deviceId:"gm-device-0000-4000-8000-000000000001", payload:{ view:"app", visible:true } }));
  const settle = async () => { while (memory.pending.length) await memory.pending.shift(); };
  const waits = [];
  tournament.sleep = async ms => { waits.push(ms); };
  const ev = () => allEventsOf(tournament.state).find(item => item.id === "8ball");
  const current = () => resolveCurrentContest(tournament.state, ev());
  const win = async () => {
    await say("announceEvent", { evId:"8ball" });
    const first = current();
    await say("lockAndStart", { evId:"8ball", contestId:first.id, contestRevision:first.revision });
    await say("recordContestWinner", { evId:"8ball", contestId:first.id, contestRevision:first.revision, winner:first.sides[0].key });
    return first;
  };
  return { tournament, memory, ws, say, settle, waits, win, current };
}
async function withSpotify(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ path:`${init.method || "GET"} ${String(url).replace("https://api.spotify.com/v1", "")}`, body:init.body ? JSON.parse(init.body) : null,
      at:Date.now() });
    return handler(calls.at(-1).path);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
  return calls;
}
/* the write's moment, as the moment model would read it, held still for the test */
const fakeMoment = (world, bit, players) => {
  let gag = null;
  world.tournament.momentOf = () => {
    if (!gag) return null;
    return gag;
  };
  return {
    set:at => { gag = { id:`contest:8ball:fake:${bit}`, bit, start:at, at:Date.now(), players, ms:bitById(bit).span }; return gag; },
    clear:() => { gag = null; },
    get gag() { return gag; },
  };
};

test("the Worker: a punchline bit's song goes to the speaker early by its latency and stamps the bit and when it is heard", async () => {
  const world = await room({ latency:700 });
  const moment = fakeMoment(world, "standoff", [...ROSTER]);
  const calls = await withSpotify(() => json(204, null), async () => {
    const original = world.tournament.queueWinSong.bind(world.tournament);
    world.tournament.queueWinSong = (before, after, type) => {
      if (type === "recordContestWinner") moment.set(Date.now() + 5000);
      return original(before, after, type);
    };
    await world.win();
    await world.settle();
  });
  const gag = moment.gag;
  const cueFrame = world.ws.frames.find(frame => frame.lastAction === "songCue");
  assert.ok(cueFrame, "the cue is written as soon as the Worker means to play");
  const play = calls.find(call => call.path.startsWith("PUT /me/player/play"));
  assert.ok(play, "the song plays");
  assert.ok(!calls.some(call => call.path.startsWith("PUT /me/player/volume?volume_percent=0")), "on the beat: no fade from silence");
  const walkout = walkoutOf(world.tournament.state);
  assert.equal(walkout.bit, gag.id, "the walkout carries the bit");
  assert.equal(walkout.audibleAt, walkout.startedAt, "its start is when the room hears it");
  assert.ok(Math.abs(walkout.audibleAt - (play.at + 700)) <= 5, "heard the speaker's latency after the request");
  assert.equal(songCueOf(world.tournament.state), null, "the walkout takes over from the cue");
  /* it waited for the beat: the request's mark is the hit minus the latency */
  const expected = gag.start + standoff.beats.hit - 700;
  assert.ok(world.waits.some(ms => ms > 0), "it waited for the beat");
  /* (the test's sleeps return at once, so the last wait is measured from the start) */
  assert.ok(world.waits.some(ms => Math.abs(ms - (expected - Date.now())) < 300), "it sends on the beat's mark");
});

test("the Worker: a songless bit's song plays after it lifts off; with no moment, at once", async () => {
  const world = await room({ latency:600 });
  const moment = fakeMoment(world, "anvil", [...ROSTER]);
  await withSpotify(() => json(204, null), async () => {
    const original = world.tournament.queueWinSong.bind(world.tournament);
    world.tournament.queueWinSong = (before, after, type) => {
      if (type === "recordContestWinner") moment.set(Date.now() + 5000);
      return original(before, after, type);
    };
    await world.win();
    await world.settle();
  });
  assert.equal(world.ws.frames.some(frame => frame.lastAction === "songCue"), false, "no cue: nothing waits on a loss");
  const walkout = walkoutOf(world.tournament.state);
  assert.ok(walkout && !walkout.bit, "a plain walkout, after the bit");
  assert.ok(world.waits.some(ms => ms >= anvil.span), "it waited out the bit");
});

test("the Worker: a take-back while the song waits for its beat drops it and clears the cue", async () => {
  const world = await room({ latency:600 });
  const moment = fakeMoment(world, "standoff", [...ROSTER]);
  let first;
  const calls = await withSpotify(() => json(204, null), async () => {
    const original = world.tournament.queueWinSong.bind(world.tournament);
    world.tournament.queueWinSong = (before, after, type) => {
      if (type === "recordContestWinner") moment.set(Date.now() + 5000);
      return original(before, after, type);
    };
    /* the wait holds until the take-back has landed */
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    world.tournament.sleep = async ms => { world.waits.push(ms); if (ms > 1000) await gate; };
    first = await world.win();
    await new Promise(resolve => setTimeout(resolve, 0));
    moment.clear();
    const undo = contestUndoAvailability(world.tournament.state, allEventsOf(world.tournament.state).find(item => item.id === "8ball"));
    await world.say("undoLastContest", { evId:"8ball", contestId:undo.contestId, contestRevision:undo.contestRevision });
    release();
    await world.settle();
  });
  assert.ok(first);
  assert.equal(calls.filter(call => call.path.startsWith("PUT /me/player/play")).length, 0, "never played");
  assert.equal(songCueOf(world.tournament.state), null, "the cue is gone");
  assert.equal(walkoutOf(world.tournament.state), null);
});

/* the song waits twice: off the lane until a little before its beat, then
   on the lane while the speaker gets ready; `during` runs in the second */
async function beatSong(world, during) {
  const moment = fakeMoment(world, "standoff", [...ROSTER]);
  let sleeps = 0;
  world.tournament.sleep = async ms => { world.waits.push(ms); if (++sleeps === 2) await during(moment); };
  return withSpotify(() => json(204, null), async () => {
    const original = world.tournament.queueWinSong.bind(world.tournament);
    let wins = 0;
    world.tournament.queueWinSong = (before, after, type) => {
      /* the first win carries the moment; any later one carries none */
      if (type === "recordContestWinner" && ++wins === 1) moment.set(Date.now() + 5000);
      return original(before, after, type);
    };
    await world.win();
    await world.settle();
  });
}

test("the Worker: a moment ended by a later write while the speaker gets ready still plays the song, off the beat", async () => {
  const world = await room({ latency:600 });
  const calls = await beatSong(world, async moment => moment.clear());
  assert.equal(calls.filter(call => call.path.startsWith("PUT /me/player/play")).length, 1, "the win's song plays");
  const walkout = walkoutOf(world.tournament.state);
  assert.ok(walkout && !walkout.bit, "a plain walkout: no beat to land on");
  assert.equal(songCueOf(world.tournament.state), null, "the cue is gone");
  assert.equal(world.tournament.pendingSong, null);
});

test("the Worker: a take-back while the speaker gets ready drops the song", async () => {
  const world = await room({ latency:600 });
  const calls = await beatSong(world, async moment => {
    moment.clear();
    const undo = contestUndoAvailability(world.tournament.state, allEventsOf(world.tournament.state).find(item => item.id === "8ball"));
    await world.say("undoLastContest", { evId:"8ball", contestId:undo.contestId, contestRevision:undo.contestRevision });
  });
  assert.equal(calls.filter(call => call.path.startsWith("PUT /me/player/play")).length, 0, "never played");
  assert.equal(songCueOf(world.tournament.state), null, "the cue is gone");
  assert.equal(walkoutOf(world.tournament.state), null);
});

test("the Worker: a later win while the speaker gets ready plays instead of the earlier song", async () => {
  const world = await room({ latency:600 });
  let second;
  const calls = await beatSong(world, async moment => {
    moment.clear();
    second = world.current();
    await world.say("lockAndStart", { evId:"8ball", contestId:second.id, contestRevision:second.revision });
    await world.say("recordContestWinner", { evId:"8ball", contestId:second.id, contestRevision:second.revision,
      winner:second.sides[0].key });
  });
  const plays = calls.filter(call => call.path.startsWith("PUT /me/player/play"));
  assert.equal(plays.length, 1, "one song, the later win's");
  assert.ok(second.sides[0].players.includes(walkoutOf(world.tournament.state).player));
});

test("the Worker: a later win drops an earlier song still waiting for its beat", async () => {
  const world = await room({ latency:600 });
  const moment = fakeMoment(world, "standoff", [...ROSTER]);
  let release, second;
  const gate = new Promise(resolve => { release = resolve; });
  world.tournament.sleep = async ms => { world.waits.push(ms); if (ms > 1000) await gate; };
  const calls = await withSpotify(() => json(204, null), async () => {
    const original = world.tournament.queueWinSong.bind(world.tournament);
    let wins = 0;
    world.tournament.queueWinSong = (before, after, type) => {
      /* the first win carries a moment and waits for its beat; the second carries none and plays at once */
      if (type === "recordContestWinner") { if (++wins === 1) moment.set(Date.now() + 5000); else moment.clear(); }
      return original(before, after, type);
    };
    await world.win();
    await new Promise(resolve => setTimeout(resolve, 0));
    second = world.current();
    await world.say("lockAndStart", { evId:"8ball", contestId:second.id, contestRevision:second.revision });
    await world.say("recordContestWinner", { evId:"8ball", contestId:second.id, contestRevision:second.revision,
      winner:second.sides[0].key });
    release();
    await world.settle();
  });
  const plays = calls.filter(call => call.path.startsWith("PUT /me/player/play"));
  assert.equal(plays.length, 1, "only the later win plays");
  const walkout = walkoutOf(world.tournament.state);
  assert.ok(second.sides[0].players.includes(walkout.player), "the speaker is left on the later winner's song");
  assert.equal(world.tournament.pendingSong, null);
});

test("the Worker: the latency is saved from the Speaker sheet, read back in the status, and Tap on the beat plays a saved song", async () => {
  const world = await room();
  const call = (path, body) => world.tournament.handleSpotify(new Request(`https://x.test/api/spotify/${path}`, {
    method:body === undefined ? "GET" : "POST", headers:{ Authorization:"Bearer gm", "Content-Type":"application/json" },
    ...(body !== undefined ? { body:JSON.stringify(body) } : {}) }), new URL(`https://x.test/api/spotify/${path}`));
  world.tournament.gmAuthorized = async () => true;
  assert.deepEqual(await (await call("latency", { ms:812 })).json(), { ok:true, latencyMs:810 });
  assert.equal(world.memory.entries.get("private:spotify:latency"), 810);
  assert.equal((await call("latency", { ms:99999 })).status, 400);
  const status = await (await withSpotify(() => json(204, null), async () => {})
    .then(() => call("status"))).json();
  assert.equal(status.latencyMs, 810);
  assert.equal(status.latencyDefault, DEFAULT_LATENCY_MS);
  assert.deepEqual(await (await call("latency", { ms:null })).json(), { ok:true, latencyMs:null });
  let answer;
  const calls = await withSpotify(() => json(204, null), async () => {
    answer = await (await call("calibrate", {})).json();
    await world.settle();
  });
  assert.equal(answer.ok, true);
  assert.ok(answer.at > Date.now() - 100, "the request's instant, ahead");
  assert.ok(calls.some(item => item.path.startsWith("PUT /me/player/play")), "the speaker plays");
  assert.ok(calls.some(item => item.path.startsWith("PUT /me/player/pause")), "and stops");
  assert.equal(walkoutOf(world.tournament.state), null, "no walkout: nothing on the TV");
  world.tournament.state.showControl = { ...(world.tournament.state.showControl || {}), audio:{ walkout:{ player:"Evan", trackId:null,
    startedAt:Date.now(), until:Date.now() + 30000, auto:true } } };
  assert.equal((await call("calibrate", {})).status, 409, "never over a win song");
});

test("the Worker: Tap on the beat never plays over a win song queued just before it", async () => {
  const world = await room();
  const call = path => world.tournament.handleSpotify(new Request(`https://x.test/api/spotify/${path}`, {
    method:"POST", headers:{ Authorization:"Bearer gm", "Content-Type":"application/json" }, body:"{}" }),
  new URL(`https://x.test/api/spotify/${path}`));
  world.tournament.gmAuthorized = async () => true;
  let release, answer;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = await withSpotify(() => json(204, null), async () => {
    /* a win song on the lane, its walkout not stamped yet when the round is asked for */
    world.tournament.songQueue(async () => {
      await gate;
      await world.tournament.setWalkout({ player:ROSTER[1], trackId:SONGS[ROSTER[1]].trackId, startedAt:Date.now(),
        until:Date.now() + 30000, auto:true }, "walkoutStart");
    });
    answer = await call("calibrate");
    release();
    await world.settle();
  });
  assert.equal(answer.status, 200, "nothing on the record said a song was coming");
  assert.equal(calls.filter(item => item.path.startsWith("PUT /me/player/play")).length, 0, "the round never plays");
  assert.equal(calls.filter(item => item.path.startsWith("PUT /me/player/pause")).length, 0, "and never pauses the win song");
  assert.equal(walkoutOf(world.tournament.state)?.player, ROSTER[1]);
});
