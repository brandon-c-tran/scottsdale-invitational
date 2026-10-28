/* Float's room (float/worker/room.js) over fake sockets and a fake clock,
   ticked every 100 ms as the Durable Object ticks itself: the Groove's
   messages, a whole bot Cup, a phone's hits judged on the room's offset, the
   calibration from people only, a restart that carries a song on by the
   clock, stand-ins, the drink rule, the Field Day bridge (float/GROOVE.md
   "What the room sends"; float/PROTOCOL.md "The room", "Field Day"). */
import test from "node:test";
import assert from "node:assert/strict";
import { FloatRoom } from "../float/worker/room.js";
import { PHASES, PALETTE, CODE_LETTERS, CODE_LENGTH, STANDALONE_CODE, EVENTS, SERVER } from "../float/shared/protocol.js";
import { CUP_TIMING } from "../float/shared/cup.js";
import { GROOVE } from "../float/shared/groove.js";
import { chartOf, cueTime, matchTap, practiceCues } from "../float/shared/chart.js";
import * as Cup from "../float/shared/cup.js";
import * as Join from "../float/client/join/joinModel.js";

class FakeSocket {
  constructor() { this.sent = []; this.listeners = {}; this.readyState = 1; }
  send(text) { if (this.readyState !== 1) throw new Error("closed"); this.sent.push(JSON.parse(text)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  accept() {}
  close() { this.readyState = 3; for (const fn of this.listeners.close || []) fn({}); }
  all(t) { return this.sent.filter(message => message.t === t); }
  last(t) { return this.all(t).at(-1); }
  events(e) { return this.all("ev").filter(message => message.e === e); }
}

const memory = () => {
  const entries = new Map();
  const storage = {
    alarm:null, alarms:0, quiet:[],
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value, options) { entries.set(key, structuredClone(value)); if (options?.allowUnconfirmed) storage.quiet.push(key); },
    async delete(key) { entries.delete(key); },
    async setAlarm(at) { storage.alarm = at; storage.alarms += 1; },
    async deleteAlarm() { storage.alarm = null; },
  };
  return { entries, storage, ctx:{ storage, blockConcurrencyWhile:fn => fn() } };
};
const fakeClock = (start = 1_700_000_000_000) => {
  const clock = { t:start, now:() => clock.t };
  return clock;
};
async function makeRoom({ mem = memory(), clock = fakeClock(), env = {} } = {}) {
  const room = new FloatRoom(mem.ctx, env, { clock, timers:false });
  await room.ready;
  return { room, mem, clock };
}
function connect(room, { role = "controller", device, rider, code = "abcd" } = {}) {
  const ws = new FakeSocket();
  room.attach(ws, new URL(`https://float.test/float/ws?room=${code}`));
  room.onMessage(ws, JSON.stringify({ t:"hello", role, device, ...(rider ? { rider } : {}) }));
  return ws;
}
const say = (room, ws, message) => room.onMessage(ws, JSON.stringify(message));
/* the room's clock forward, tick() every 100 ms (the Durable Object's own rate) */
async function run(room, clock, ms, until = () => false, each = null) {
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += 100;
    if (each) each(clock.t);
    room.tick();
    if (until()) return true;
  }
  return until();
}
const settle = async () => { for (let k = 0; k < 20; k += 1) await Promise.resolve(); };
/* phones that stay live: a ping every 2 s, as net.js sends */
const keepAlive = (room, sockets) => {
  let next = 0;
  return t => {
    if (t < next) return;
    next = t + 2000;
    for (const ws of sockets) if (ws.readyState === 1) say(room, ws, { t:"ping", c:t, rtt:90 });
  };
};
const LOOK = { critter:"otter", floatie:"classic", hat:"none", shades:"none", pose:"flex" };
const rider = (name, extra = {}) => ({ name, color:"#336699", look:LOOK, ...extra });

/* A phone that plays: from what the room sends it (the chart, songAt, the
   offset) it taps each cue `lag(cue)` ms after the cue's time on the server
   clock, judges the tap where it lands (matchTap, as controller/rhythm.js
   does) and sends hit { c, r }; `taps(cue)` says which cues it plays and
   `done` when it taps Done. */
function player(room, ws, { lag = () => 0, taps = () => true, done = null } = {}) {
  const state = { chart:null, songAt:null, offset:0, taken:new Set(), sent:new Set(), doneSent:false, phase:null };
  let read = 0;
  return t => {
    for (; read < ws.sent.length; read += 1) {
      const message = ws.sent[read];
      if (message.t !== "room") continue;
      if (message.chart) state.chart = message.chart;
      state.offset = message.offset;
      state.phase = message.phase;
      if (message.phase === "song" && message.songAt !== state.songAt) { state.songAt = message.songAt; state.taken = new Set(); state.sent = new Set(); state.doneSent = false; }
    }
    if (state.phase !== "song" || !state.chart) return;
    if (done !== null && !state.doneSent && t >= cueTime(state.songAt, 56) + done) { state.doneSent = true; say(room, ws, { t:"drink" }); }
    for (const cue of state.chart.cues) {
      if (state.sent.has(cue.id) || !taps(cue)) continue;
      const at = cueTime(state.songAt, cue.beat) + lag(cue);
      if (at > t) break;
      state.sent.add(cue.id);
      const match = matchTap(state.chart, state.songAt, at, { offset:state.offset, taken:state.taken });
      if (!match || match.cue.id !== cue.id) continue;
      state.taken.add(cue.id);
      say(room, ws, { t:"hit", c:match.cue.id, r:match.r });
    }
  };
}
const both = (...fns) => t => fns.forEach(fn => fn(t));

test("hello: welcome first, then the room; the chart rides in full once a song is known, then only its id", async () => {
  const { room, clock } = await makeRoom();
  const screen = connect(room, { role:"screen", device:"tv-1" });
  assert.equal(screen.sent[0].t, "welcome");
  assert.deepEqual(screen.sent[0].you, { device:"tv-1", role:"screen" });
  const first = screen.sent[1];
  assert.equal(first.t, "room");
  assert.deepEqual([first.phase, first.mode, first.code, first.song, first.songAt, first.chartId], ["lobby", "party", "abcd", null, null, null]);
  assert.equal(first.chart, undefined, "no song, no chart");
  assert.deepEqual(first.scores, []);
  assert.ok(Number.isFinite(first.s));
  const phone = connect(room, { device:"p-1", rider:rider("Ann") });
  assert.equal(phone.sent[0].you.entrant, 0);
  const update = screen.last("room");
  assert.equal(update.entrants.length, 1);
  assert.equal(update.entrants[0].name, "Ann");
  assert.equal(update.entrants[0].connected, true);
  say(room, phone, { t:"ping", c:5, rtt:120 });
  assert.deepEqual({ t:phone.last("pong").t, c:phone.last("pong").c }, { t:"pong", c:5 });
  /* the Cup starts: the intro already knows the first song, and sends its chart once */
  say(room, screen, { t:"host", cmd:"start", bots:3, drinking:true });
  const intro = screen.last("room");
  assert.equal(intro.phase, "intro");
  assert.equal(intro.song, "paddle");
  assert.deepEqual(intro.chart, JSON.parse(JSON.stringify(chartOf("paddle"))));
  assert.equal(intro.songAt, null);
  await run(room, clock, 60000, () => room.cup.phase === "song" && clock.t > room.cup.songAt + 20000, keepAlive(room, [phone]));
  const rooms = screen.all("room").filter(message => message.song === "paddle");
  assert.equal(rooms.filter(message => message.chart).length, 1, "the chart once per socket a song");
  assert.ok(rooms.every(message => message.chartId === "paddle"));
  /* a screen that joins mid-song gets it with its first room */
  const late = connect(room, { role:"screen", device:"tv-2" });
  assert.equal(late.sent[1].chart.id, "paddle");
  assert.equal(late.sent[1].songAt, room.cup.songAt);
  /* the next song's chart goes to everyone once, when it goes up */
  await run(room, clock, 120000, () => room.cup.phase === "song" && room.cup.round === 1, keepAlive(room, [phone]));
  for (const ws of [screen, late, phone]) {
    const rock = ws.all("room").filter(message => message.song === "rock");
    assert.equal(rock.filter(message => message.chart).length, 1);
    assert.equal(rock.find(message => message.chart).chart.id, "rock");
  }
  assert.ok(screen.sent.every(message => Number.isFinite(message.s)), "every message carries s");
  assert.ok(screen.sent.every(message => SERVER.includes(message.t)), "only the contract's messages");
});

test("a whole bot Cup plays from start to the podium with the contract's messages", async () => {
  const { room, clock, mem } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phone = connect(room, { device:"me", rider:rider("Me", { drinks:false }) });
  say(room, tv, { t:"host", cmd:"start", bots:12, drinking:true });
  assert.equal(room.cup.entrants.length, 13);
  assert.deepEqual(room.cup.schedule, [13, 9, 6, 3]);
  const phases = new Set();

  const done = await run(room, clock, 20 * 60 * 1000, () => {
    phases.add(room.cup.phase);
    return room.cup.phase === "podium";
  });
  assert.ok(done, `reached the podium (stuck in ${room.cup.phase}, round ${room.cup.round})`);
  for (const phase of ["intro", "song", "cut", "podium"]) assert.ok(phases.has(phase), phase);
  for (const phase of phases) assert.ok(PHASES.includes(phase));
  assert.deepEqual(room.cup.history.map(item => [item.song, item.field.length]), [["paddle", 13], ["rock", 9], ["spin", 6], ["drop", 3]]);
  assert.equal(room.cup.final.length, 13);
  assert.equal(new Set(room.cup.final).size, 13);
  assert.deepEqual(room.cup.podium, room.cup.final.slice(0, 3));
  /* the room: its fields, every 4 s in a song at least */
  const rooms = tv.all("room");
  const inSong = rooms.filter(message => message.phase === "song" && message.round === 0);
  for (const key of ["phase", "mode", "code", "cupId", "drinking", "round", "rounds", "field", "out", "startAt", "endsAt", "cut",
    "lastRound", "entrants", "song", "songAt", "chartId", "offset", "scores", "results", "standings", "podium", "final", "history"])
    assert.ok(key in inSong[0], key);
  const span = inSong.at(-1).s - inSong[0].s;
  assert.ok(inSong.length >= Math.floor(span / GROOVE.SCORES_MS), `${inSong.length} rooms in ${span} ms`);
  for (let k = 1; k < inSong.length; k += 1) assert.ok(inSong[k].s - inSong[k - 1].s <= GROOVE.SCORES_MS + 100, "never 4 s without scores");
  const scores = inSong.at(-1).scores;
  assert.equal(scores.length, 13);
  assert.deepEqual(Object.keys(scores[0]).sort(), ["cup", "done", "i", "live", "n", "pct", "pts"]);
  assert.equal(inSong[0].songAt, inSong[0].startAt + 3000);
  assert.equal(inSong[0].endsAt, inSong[0].songAt + 64000 + 1500);
  assert.equal(inSong[0].cut, 9);

  /* the events: hits and misses with the contract's fields, Done, the cuts' outs */
  const hits = tv.events("hit");
  assert.ok(hits.length > 1000);
  for (const event of hits.slice(0, 200)) {
    assert.ok(Number.isInteger(event.i) && Number.isInteger(event.c) && typeof event.q === "string");
    if (event.q === "miss") assert.equal("d" in event, false);
    else assert.ok(Number.isInteger(event.d));
    assert.equal("at" in event, false, "the room's own time stays home");
  }
  assert.ok(tv.events("done").length >= 13 + 9 + 6 + 3 - 4, "bots tap Done");
  assert.deepEqual(tv.events("out").map(event => event.i).sort((a, b) => a - b), room.cup.out.slice().sort((a, b) => a - b));
  assert.ok(tv.all("ev").every(event => EVENTS.includes(event.e)));
  assert.equal(tv.all("snap").length, 0, "no snapshots: nothing moves by physics");
  /* the phone (a person who never taps) heard about itself */
  const me = phone.all("me");
  assert.ok(me.length > 40, "after each judgement and at phase changes");
  for (const key of ["i", "pts", "pct", "place", "of", "cut", "done", "c", "q"]) assert.ok(key in me.find(item => item.q), key);
  assert.equal(me.at(-1).out, true);
  /* the cup was saved */
  assert.equal(mem.entries.get("cup").phase, "podium");
  assert.ok(mem.entries.get(`stats:${room.cup.id}`).length === 4);
});

test("a phone's hit: judged on the room's offset, told to everyone, `me` to that phone; once a cue; a flood is dropped", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phone = connect(room, { device:"me", rider:rider("Me") });
  const other = connect(room, { device:"you", rider:rider("You") });
  say(room, tv, { t:"host", cmd:"start", bots:2, drinking:false });
  const live = keepAlive(room, [phone, other]);
  await run(room, clock, 60000, () => room.cup.phase === "song", live);
  room.cup.song.offset = room.cup.song.base = 120;
  const chart = chartOf(room.cup.songId);
  const cue = chart.cues.find(item => item.scored);
  const at = cueTime(room.cup.songAt, cue.beat) + 120 + 20;
  await run(room, clock, at - clock.t - 50, () => false, live);
  const i = room.cup.entrants.findIndex(entrant => entrant.device === "me");
  clock.t = at + 60;
  say(room, phone, { t:"hit", c:cue.id, r:140 });
  const event = tv.events("hit").find(item => item.i === i && item.c === cue.id);
  assert.deepEqual(event, { t:"ev", e:"hit", i, c:cue.id, q:"perfect", d:20, s:clock.t });
  assert.ok(other.events("hit").some(item => item.i === i && item.c === cue.id), "the other phones hear it too");
  const mine = phone.last("me");
  assert.deepEqual([mine.i, mine.c, mine.q, mine.d], [i, cue.id, "perfect", 20]);
  assert.ok(mine.pts >= 100 && mine.place >= 1 && mine.of === 4);
  /* a second hit on the cue changes nothing */
  const count = tv.events("hit").length;
  say(room, phone, { t:"hit", c:cue.id, r:120 });
  assert.equal(tv.events("hit").filter(item => item.i === i && item.c === cue.id).length, 1);
  assert.equal(tv.events("hit").length, count);
  /* sixteen hits a second a socket, then the rest of that second is dropped */
  const next = chart.cues.find(item => item.scored && item.id > cue.id);
  const nextAt = cueTime(room.cup.songAt, next.beat) + 120;
  clock.t = nextAt - 200;
  for (let k = 0; k < 16; k += 1) say(room, phone, { t:"hit", c:99999, r:0 });
  clock.t = nextAt + 10;
  say(room, phone, { t:"hit", c:next.id, r:130 });
  assert.equal(tv.events("hit").filter(item => item.i === i && item.c === next.id).length, 0, "dropped");
  clock.t = nextAt + 300;
  room.tick();
  /* a new second: heard again (this one too late for the cue: it is out of its window) */
  const later = chart.cues.find(item => item.scored && item.id > next.id + 1);
  const laterAt = cueTime(room.cup.songAt, later.beat) + 120;
  await run(room, clock, laterAt - clock.t, () => false, live);
  clock.t = laterAt + 50;
  say(room, phone, { t:"hit", c:later.id, r:120 - 30 });
  assert.equal(tv.events("hit").find(item => item.i === i && item.c === later.id)?.d, -30);
  /* junk never throws and never lands */
  for (const junk of [{ t:"hit" }, { t:"hit", c:"x", r:1 }, { t:"hit", c:later.id + 1, r:Infinity }, { t:"stroke", side:"L" }, { t:"balloon", at:1 }])
    say(room, phone, junk);
  room.onMessage(phone, "not json");
  room.onMessage(phone, "x".repeat(5000));
  /* a watcher's hit (no entrant) is nothing */
  const watcher = connect(room, { device:"w", rider:rider("W") });
  say(room, watcher, { t:"hit", c:later.id + 1, r:0 });
  assert.equal(tv.events("hit").filter(item => item.i === undefined).length, 0);
});

test("the calibration is people's own: solo QA's one phone sets the room's offset in practice, at most once a beat, fixed from the first play bar", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phone = connect(room, { device:"me", rider:rider("Me") });
  say(room, tv, { t:"host", cmd:"start", bots:12, drinking:false });
  /* the TV's sound is 150 ms late: the phone taps to what it hears, a little either side */
  const jitter = cue => ((cue.id * 37) % 21) - 10;
  const play = player(room, phone, { lag:cue => 150 + jitter(cue) });
  const live = keepAlive(room, [phone]);
  await run(room, clock, 120000, () => room.cup.phase === "song" && clock.t > room.cup.songAt + 30000, both(live, play));
  const song = room.cup.song;
  assert.equal(song.frozen, true);
  assert.ok(Math.abs(song.offset - 150) <= 6, `the offset found the TV's delay (${song.offset})`);
  const practice = practiceCues(chartOf(song.id));
  assert.ok(song.samples.length >= practice.length - 1, `the phone's practice taps (${song.samples.length})`);
  assert.ok(song.samples.every(r => Math.abs(r - 150) <= 12), "and only them: bots never calibrate");
  /* what the screens heard: the offset moving in practice, at most once a beat, never after */
  const rooms = tv.all("room").filter(message => message.phase === "song" && message.round === 0);
  const moves = [];
  for (let k = 1; k < rooms.length; k += 1) if (rooms[k].offset !== rooms[k - 1].offset) moves.push(rooms[k]);
  assert.ok(moves.length >= 2, "it settles over practice");
  const beatOfMove = message => Math.floor((message.s - room.cup.songAt) / 500);
  assert.equal(new Set(moves.map(beatOfMove)).size, moves.length, "at most once a beat");
  assert.ok(moves.every(message => beatOfMove(message) < 24), "fixed from the first play bar");
  assert.equal(rooms.at(-1).offset, song.offset);
  /* the phone's scored taps are judged on it: centred */
  const i = room.cup.entrants.findIndex(entrant => entrant.device === "me");
  const mine = tv.events("hit").filter(event => event.i === i && chartOf(song.id).cues[event.c].scored);
  assert.ok(mine.length > 10);
  assert.ok(mine.every(event => event.q === "perfect" && Math.abs(event.d) <= 20), "scored on the room's offset");
});

test("a restarted room carries the song on by the clock: songAt in the save, the judgements to the last save, nothing restarts", async () => {
  const mem = memory();
  const clock = fakeClock();
  const first = (await makeRoom({ mem, clock })).room;
  const tv = connect(first, { role:"screen", device:"tv" });
  say(first, tv, { t:"host", cmd:"start", bots:8, drinking:true });
  await run(first, clock, 120000, () => first.cup.phase === "song" && clock.t > first.cup.songAt + 21000);
  const { songAt, endsAt, round } = first.cup;
  const saved = mem.entries.get("cup");
  assert.equal(saved.phase, "song");
  assert.equal(saved.songAt, songAt);
  assert.ok(Object.values(saved.song.judged).some(judged => Object.keys(judged).length > 20), "the judgements are saved");
  assert.ok(mem.storage.quiet.includes("cup"), "saves in a song never hold the room's messages");
  assert.ok(mem.storage.alarm > clock.t && mem.storage.alarm <= clock.t + 5000, "a watchdog alarm in a song");
  const savedCount = Object.values(saved.song.judged).reduce((sum, judged) => sum + Object.keys(judged).length, 0);
  const liveCount = Object.values(first.cup.song.judged).reduce((sum, judged) => sum + Object.keys(judged).length, 0);
  assert.ok(liveCount - savedCount <= 9 * 8, "at most 2 s behind");
  /* the object dies; a new one loads the same storage three seconds later */
  clock.t += 3000;
  const { room } = await makeRoom({ mem, clock });
  assert.equal(room.cup.phase, "song");
  assert.equal(room.cup.songAt, songAt, "no countdown, no restart");
  assert.equal(room.cup.endsAt, endsAt);
  const screen = connect(room, { role:"screen", device:"tv2" });
  assert.equal(screen.sent[1].phase, "song");
  assert.equal(screen.sent[1].songAt, songAt);
  assert.equal(screen.sent[1].chart.id, room.cup.songId);
  /* it catches up, then plays on: every cue of every rider judged once, the cut on time */
  const before = structuredClone(room.cup.song.judged);
  await run(room, clock, 200000, () => room.cup.phase === "cut");
  assert.equal(room.cup.round, round);
  assert.ok(Math.abs(room.cup.startAt - endsAt) <= 100, "the cut came when the song was due to end");
  const item = room.cup.history[0];

  for (const i of item.field) {
    const counts = item.stats[i];
    assert.equal(counts.perfects + counts.nice + counts.ok + counts.early + counts.late + counts.misses,
      chartOf(item.song).cues.filter(cue => cue.scored).length);
  }
  const keys = screen.events("hit").map(event => `${event.i}:${event.c}`);
  assert.equal(new Set(keys).size, keys.length, "no cue judged twice");
  for (const [i, judged] of Object.entries(before)) for (const c of Object.keys(judged))
    assert.ok(!keys.includes(`${i}:${c}`), "a saved judgement is never sent again");

});

test("a phone gone 5 s is played by a stand-in until it speaks again; botDriven says so", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phone = connect(room, { device:"a", rider:rider("Ann") });
  say(room, tv, { t:"host", cmd:"start", bots:3, drinking:false });
  const live = keepAlive(room, [phone]);
  await run(room, clock, 60000, () => room.cup.phase === "song" && clock.t > room.cup.songAt + 4000, live);
  const i = room.cup.entrants.findIndex(entrant => entrant.device === "a");
  assert.equal(room.driven(i), false);
  assert.equal(tv.last("room").entrants[i].botDriven, false);
  /* quiet: within 5 s (and a second for the lamp) the room says a stand-in plays */
  const quietAt = room.lastHeard("a");
  await run(room, clock, 6500);
  assert.equal(room.driven(i), true);
  const lamp = tv.all("room").find(message => message.entrants[i]?.botDriven);
  assert.ok(lamp && lamp.s - quietAt >= GROOVE.STALE_MS && lamp.s - quietAt <= GROOVE.STALE_MS + 1200, `the room says so (${lamp && lamp.s - quietAt} ms after it last heard the phone)`);
  await run(room, clock, 20000);
  const stood = tv.events("hit").filter(event => event.i === i && event.q !== "miss");
  assert.ok(stood.length > 5, "the stand-in taps");
  /* it speaks: control comes back at once */
  say(room, phone, { t:"ping", c:1 });
  assert.equal(room.driven(i), false);
  await run(room, clock, 1200, () => false, live);
  assert.equal(tv.last("room").entrants[i].botDriven, false);
  /* a closed phone: a stand-in after the same 5 s, not at once */
  phone.close();
  assert.equal(room.driven(i), false);
  assert.equal(tv.last("room").entrants[i].connected, false);
  await run(room, clock, 5100);
  assert.equal(room.driven(i), true);
  await run(room, clock, 120000, () => room.cup.phase === "cut");
  const share = room.cup.history[0].stats[i].botShare;
  assert.ok(share > 0.3 && share < 1, `the stand-in's share (${share})`);
});

test("the drink rule: Done before the break is nothing; Done in it tells everyone; no Done, every cue after it a miss; who skips the drink stays private", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const yes = connect(room, { device:"yes", rider:rider("Yes") });
  const never = connect(room, { device:"never", rider:rider("Never") });
  const dry = connect(room, { device:"dry", rider:rider("Dry", { drinks:false }) });
  say(room, tv, { t:"host", cmd:"start", bots:0, drinking:true });
  const index = device => room.cup.entrants.findIndex(entrant => entrant.device === device);
  const [Y, N, D] = ["yes", "never", "dry"].map(index);
  const players = both(keepAlive(room, [yes, never, dry]),
    player(room, yes, { done:5000 }), player(room, never), player(room, dry));
  await run(room, clock, 60000, () => room.cup.phase === "song" && clock.t > room.cup.songAt + 20000, players);
  say(room, yes, { t:"drink" });
  assert.equal(tv.events("done").length, 0, "not before the break");
  await run(room, clock, 120000, () => room.cup.phase === "cut", players);
  const song = room.cup.history[0];
  const after = chartOf(song.song).cues.filter(cue => cue.scored && cue.beat >= 88);
  const dones = tv.events("done");
  assert.ok(dones.some(event => event.i === Y));
  assert.ok(dones.some(event => event.i === D), "the TV sees the one who skips it finish like anyone");
  assert.ok(!dones.some(event => event.i === N));
  assert.equal(song.stats[Y].misses, 0);
  assert.equal(song.stats[D].misses, 0);
  assert.equal(song.stats[N].misses, after.length, "never Done: every cue after the break");
  assert.ok(tv.events("hit").filter(event => event.i === N && chartOf(song.song).cues[event.c].beat >= 88).every(event => event.q === "miss"));
  /* nobody but the rider's own phone hears who drinks */
  const answers = message => message.entrants.filter(entrant => "drinks" in entrant);
  assert.ok(tv.all("room").every(message => answers(message).length === 0), "screens never");
  assert.ok(dry.all("room").every(message => answers(message).length === 1 && answers(message)[0].drinks === false), "its own phone only");
  assert.ok(yes.all("room").every(message => answers(message).every(entrant => entrant.device === "yes")));
  assert.equal(tv.last("room").scores.find(row => row.i === D).done, true);
  /* its own phone owes no Done from the start; the screens saw it done only when a bot would be */
  const dryMe = dry.all("me").filter(message => message.round === 0 && "pts" in message);
  assert.ok(dryMe.length > 10 && dryMe.every(message => message.done === true));
  assert.ok(yes.all("me").some(message => message.round === 0 && message.done === false), "a drinker owes it");
  const dryDone = dones.find(event => event.i === D).s - cueTime(room.cup.songAt, 56);
  assert.ok(dryDone >= GROOVE.DONE_FROM_MS && dryDone <= GROOVE.DONE_FROM_MS + GROOVE.DONE_SPAN_MS + 100, `${dryDone} ms into the break`);
});

test("options.ids makes a Cup repeatable: the same ids and clock, the same bots and the same taps", async () => {
  const cupWith = async () => {
    let n = 0;
    const clock = fakeClock();
    const room = new FloatRoom(memory().ctx, {}, { clock, timers:false, ids:prefix => `${prefix}fixed${(n += 1)}` });
    await room.ready;
    const tv = connect(room, { role:"screen", device:"tv" });
    say(room, tv, { t:"host", cmd:"start", bots:6 });
    await run(room, clock, 40000, () => room.cup.phase === "song" && clock.t > room.cup.songAt + 20000);
    return { room, tv };
  };
  const a = await cupWith(), b = await cupWith();
  assert.equal(a.room.cup.id, b.room.cup.id);
  assert.deepEqual(a.room.cup.entrants, b.room.cup.entrants);
  assert.deepEqual(a.tv.events("hit"), b.tv.events("hit"));
});

/* ---- Field Day ---- */

function tournament({ failFirst = 0 } = {}) {
  const calls = [];
  let failures = failFirst;
  const env = { TOURNAMENT:{
    idFromName:name => `id:${name}`,
    get:id => ({ fetch:async (url, init) => {
      calls.push({ id, url:String(url), body:JSON.parse(init.body) });
      if (failures > 0) { failures -= 1; return new Response("nope", { status:503 }); }
      return new Response(JSON.stringify({ ok:true }), { status:200 });
    } }),
  } };
  return { env, calls };
}
const postCup = (room, body) => room.fetch(new Request("https://fd.internal/internal/cup?room=fd-float", {
  method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) }));
const fdRider = (pid, extra = {}) => ({ name:pid, color:"#aa3300", pid, number:7, photo:`/api/photo/${pid}?v=1`,
  look:{ critter:"coyote", floatie:"shark", hat:"none", shades:"none", pose:"chug" }, ...extra });

test("Field Day: the Tournament reserves a Cup by player, phones take their entrants, the result goes back once, real players only", async () => {
  const { env, calls } = tournament({ failFirst:1 });
  const clock = fakeClock();
  const { room } = await makeRoom({ clock, env });
  const startAt = clock.t + 10000;
  const response = await postCup(room, { evId:"float", cupId:"cup-1", mode:"fieldday", drinking:true, startAt, bots:13,
    entrants:[fdRider("Brandon", { groom:true }), fdRider("Evan"), fdRider("Eyob", { drinks:false })] });
  const reply = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual([reply.ok, reply.entrants, reply.startAt], [true, 13, startAt]);
  assert.equal(room.cup.mode, "fieldday");
  assert.equal(room.cup.phase, "lobby");
  assert.deepEqual(room.cup.entrants.slice(0, 3).map(entrant => entrant.pid), ["Brandon", "Evan", "Eyob"]);
  assert.equal(room.cup.entrants[0].groom, true);
  assert.equal(room.cup.entrants.filter(entrant => entrant.bot).length, 10);
  /* the same cupId again changes nothing */
  const again = await (await postCup(room, { evId:"float", cupId:"cup-1", startAt, bots:13, entrants:[fdRider("Brandon")] })).json();
  assert.equal(again.already, true);
  assert.equal(room.cup.entrants.length, 13);
  /* a phone saying pid takes its entrant; a stranger only watches; screens cannot start a Field Day cup */
  const tv = connect(room, { role:"screen", device:"tv", code:"fd-float" });
  const evan = connect(room, { device:"evan-phone", rider:fdRider("Evan", { look:{ critter:"otter", floatie:"pizza" } }), code:"fd-float" });
  assert.equal(evan.sent[0].you.entrant, 1);
  assert.equal(room.cup.entrants[1].device, "evan-phone");
  assert.equal(room.cup.entrants[1].look.critter, "otter", "the phone's look counts in the lobby");
  assert.equal(room.cup.entrants[1].name, "Evan", "identity stays Field Day's");
  const stranger = connect(room, { device:"x", rider:rider("Xavier"), code:"fd-float" });
  assert.equal(stranger.sent[0].you.entrant, undefined);
  say(room, tv, { t:"host", cmd:"start", bots:2 });
  assert.equal(room.cup.phase, "lobby", "the Tournament starts it, not a screen");
  const lobby = tv.last("room");
  assert.equal(lobby.startPlanned, startAt);
  assert.equal(lobby.entrants[1].botDriven, false);
  /* at startAt it starts by itself, on its moment; Evan plays, Brandon and Eyob are stood in for */
  const evanPlays = player(room, evan, { lag:() => 30 });
  const resultCalls = () => calls.filter(call => call.url.endsWith("/internal/float/result"));
  const done = await run(room, clock, 25 * 60 * 1000, () => room.cup.phase === "podium", both(keepAlive(room, [evan]), evanPlays));
  assert.ok(done, `reached the podium (in ${room.cup.phase})`);
  assert.equal(room.cup.history[0].field.length, 13);
  assert.equal(tv.all("room").find(message => message.phase === "intro").startAt, startAt, "the planned moment");
  /* the podium plays first: nothing posts until it ends */
  await settle();
  assert.equal(resultCalls().length, 0, "not during the podium");
  const finalPids = room.cup.final.map(i => room.cup.entrants[i].pid).filter(Boolean);
  await run(room, clock, CUP_TIMING.PODIUM_MS + 100, () => room.cup.phase === "feedback");
  await settle();
  assert.equal(resultCalls().length, 1, "posted when the podium ended");
  assert.equal(room.outbox.find(item => item.id === "result:cup-1").done, false, "the first post failed");
  clock.t += 1000;
  await room.alarm();
  await settle();
  const results = resultCalls();
  assert.equal(results.length, 2, "retried on the alarm");
  assert.equal(results[0].id, "id:main");
  const body = results.at(-1).body;
  assert.deepEqual([body.evId, body.cupId], ["float", "cup-1"]);
  assert.deepEqual(body.order.slice().sort(), ["Brandon", "Evan", "Eyob"], "real players only");
  assert.deepEqual(body.order, finalPids, "in their relative order");
  assert.equal(body.rounds.length, 4);
  assert.deepEqual(body.rounds.map(item => item.song), ["paddle", "rock", "spin", "drop"]);
  assert.deepEqual(Object.keys(body.rounds[0].results[0]).sort(), ["bot", "cup", "misses", "out", "pct", "perfects", "pid", "place", "pts", "who"]);
  /* the stats: per round the offset, and each rider's percent, perfects, misses and how much a stand-in played */
  assert.equal(body.stats.rounds.length, 4);
  assert.ok("offset" in body.stats.rounds[0] && "samples" in body.stats.rounds[0]);
  const brandon = body.stats.rounds[0].riders.Brandon;
  for (const key of ["pct", "perfects", "misses", "botShare"]) assert.ok(key in brandon, key);
  assert.equal(brandon.botShare, 1, "never connected: a stand-in played it all");
  assert.equal(body.stats.rounds[0].riders.Evan.botShare, 0);
  assert.equal(body.stats.botShare.Brandon, 1);
  assert.equal(body.stats.botShare.Evan, 0);
  assert.ok(body.stats.rounds[0].samples > 0, "Evan's practice calibrated the room");
  /* once it landed it never posts again */
  assert.equal(room.outbox.find(item => item.id === "result:cup-1").done, true);
  /* feedback goes to the Tournament too */
  await room.onMessage(evan, JSON.stringify({ t:"feedback", answers:{ fun:5, again:true, better:"More songs", junk:{ x:1 } } }));
  await settle();
  await room.alarm();
  await settle();
  const feedback = calls.find(call => call.url.endsWith("/internal/float/feedback"));
  assert.deepEqual(feedback.body, { cupId:"cup-1", pid:"Evan", answers:{ fun:5, again:true, better:"More songs" } });
  clock.t += 3600000;
  await room.alarm();
  await settle();
  assert.equal(room.cup.phase, "lobby");
  assert.equal(resultCalls().length, 2, "never again");
});

test("a finished Field Day Cup left early still posts its result, once; a party rerun in its room posts nothing", async () => {
  const { env, calls } = tournament();
  const clock = fakeClock();
  const { room } = await makeRoom({ clock, env });
  await postCup(room, { evId:"float", cupId:"cup-2", startAt:clock.t, bots:4, entrants:[fdRider("Evan")] });
  const tv = connect(room, { role:"screen", device:"tv", code:"fd-float" });
  say(room, tv, { t:"host", cmd:"lobby" });
  assert.equal(room.cup.phase, "lobby", "a reserved Cup stays reserved");
  assert.ok(room.cup.startPlanned);
  await run(room, clock, 25 * 60 * 1000, () => room.cup.phase === "cut" && room.cup.done);
  assert.equal(room.cup.done, true);
  say(room, tv, { t:"host", cmd:"lobby" });
  assert.equal(room.cup.phase, "lobby", "a finished Cup may be left");
  await settle();
  const results = () => calls.filter(call => call.url.endsWith("/internal/float/result"));
  assert.equal(results().length, 1);
  assert.deepEqual(results()[0].body.order, ["Evan"]);
  say(room, tv, { t:"host", cmd:"start", bots:3 });
  assert.equal(room.cup.mode, "party");
  await run(room, clock, 25 * 60 * 1000, () => room.cup.phase === "feedback");
  await settle();
  assert.equal(results().length, 1);
});

test("a failing Tournament is retried with backoff from the alarm, never blocking the room", async () => {
  const { env, calls } = tournament({ failFirst:3 });
  const clock = fakeClock();
  const { room, mem } = await makeRoom({ clock, env });
  room.code = "fd-x";
  room.newCup({ mode:"fieldday", id:"cup-9", evId:"float" });
  room.queue("result:cup-9", "/internal/float/result", { cupId:"cup-9", order:[] });
  await settle();
  assert.equal(calls.length, 1);
  const item = room.outbox[0];
  assert.equal(item.tries, 1);
  assert.equal(item.nextAt, clock.t + 1000);
  assert.ok(mem.storage.alarm <= item.nextAt + 1, "the alarm comes back for it");
  clock.t += 1000;
  await room.alarm();
  assert.equal(calls.length, 2);
  assert.equal(room.outbox[0].nextAt, clock.t + 5000);
  clock.t += 5000;
  await room.alarm();
  clock.t += 30000;
  await room.alarm();
  assert.equal(calls.length, 4);
  assert.equal(room.outbox[0].done, true);
  const { room:again } = await makeRoom({ mem, clock, env });
  assert.equal(again.outbox[0].done, true, "it survives a restart as sent");
});

test("host commands: start with drinking off, kick (a stand-in plays the kicked mid-Cup), back to the lobby", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const a = connect(room, { device:"a", rider:rider("Ann") });
  connect(room, { device:"b", rider:rider("Bo") });
  say(room, tv, { t:"host", cmd:"kick", device:"b" });
  assert.deepEqual(room.cup.entrants.map(entrant => entrant.name), ["Ann"]);
  say(room, a, { t:"ready", on:true });
  assert.equal(tv.last("room").entrants[0].ready, true);
  say(room, a, { t:"look", look:{ critter:"frog", floatie:"unicorn", hat:"crown", shades:"stars", pose:"backflip" } });
  assert.equal(room.cup.entrants[0].look.critter, "frog");
  assert.equal(room.cup.entrants[0].look.hat, "none", "the crown is the groom's");
  /* a phone cannot host */
  say(room, a, { t:"host", cmd:"start", bots:3 });
  assert.equal(room.cup.phase, "lobby");
  say(room, tv, { t:"host", cmd:"start", bots:3, drinking:false });
  assert.equal(room.cup.phase, "intro");
  assert.equal(room.cup.drinking, false);
  assert.equal(room.cup.entrants.length, 4);
  /* the look is the lobby's */
  say(room, a, { t:"look", look:{ critter:"otter" } });
  assert.equal(room.cup.entrants[0].look.critter, "frog");
  const live = keepAlive(room, [a]);
  await run(room, clock, 60000, () => room.cup.phase === "song" && clock.t > room.cup.songAt + 10000, live);
  assert.ok(tv.last("room").scores.every(row => row.done), "drinking off: everyone is done from the start");
  /* a kick mid-Cup hands the rider to a stand-in; its phone's hits are ignored */
  say(room, tv, { t:"host", cmd:"kick", device:"a" });
  assert.equal(room.cup.entrants[0].kicked, true);
  assert.equal(room.driven(0), true);
  const cue = chartOf(room.cup.songId).cues.find(item => cueTime(room.cup.songAt, item.beat) > clock.t + 1000);
  clock.t = cueTime(room.cup.songAt, cue.beat) + 10;
  say(room, a, { t:"hit", c:cue.id, r:10 });
  assert.ok(!tv.events("hit").some(event => event.i === 0 && event.c === cue.id && event.d === 10));
  say(room, tv, { t:"host", cmd:"lobby" });
  assert.equal(room.cup.phase, "lobby");
  assert.deepEqual(room.cup.entrants.map(entrant => entrant.name), ["Ann"], "bots leave with the Cup");
  assert.equal(room.cup.entrants[0].kicked, undefined);
  assert.equal(room.loop, null);
  /* a phone that watched the last Cup joins the next lobby */
  connect(room, { device:"late", rider:rider("Late") });

  assert.equal(room.cup.entrants.length, 2);
});

test("cheer: riders out of the Cup cheer from the bank, one in 300 ms; riders still in, and strangers, cannot", async () => {
  const { room, clock } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  const phones = ["a", "b", "c", "d", "e"].map(device => connect(room, { device, rider:rider(device.toUpperCase()) }));
  say(room, tv, { t:"host", cmd:"start", bots:0, drinking:false });
  /* nobody taps: every percent is 0 and the field's order decides who goes */
  await run(room, clock, 200000, () => room.cup.phase === "cut", keepAlive(room, phones));
  const [outI] = room.cup.out;
  const outPhone = phones.find(ws => ws.sent[0].you.entrant === outI);
  const inPhone = phones.find(ws => ws.sent[0].you.entrant === room.cup.field[0]);
  say(room, outPhone, { t:"cheer" });
  say(room, outPhone, { t:"cheer" });
  assert.deepEqual(tv.events("cheer").map(event => event.i), [outI], "one in 300 ms");
  clock.t += 300;
  say(room, outPhone, { t:"cheer" });
  assert.equal(tv.events("cheer").length, 2);
  assert.ok(phones[0].events("cheer").length === 2, "everyone hears it");
  say(room, inPhone, { t:"cheer" });
  assert.equal(tv.events("cheer").length, 2, "only from the bank");
  assert.equal(outPhone.last("me").out, true, "the out phone knows it is out");
});

test("the watchdog alarm in a song moves only when it must; the timers drive themselves in a live room", async () => {
  const { room, clock, mem } = await makeRoom();
  const tv = connect(room, { role:"screen", device:"tv" });
  say(room, tv, { t:"host", cmd:"start", bots:5, drinking:true });
  await run(room, clock, 60000, () => room.cup.phase === "song");
  const before = mem.storage.alarms;
  let late = 0;
  await run(room, clock, 20000, () => false, t => { if (mem.storage.alarm < t - 100) late += 1; });
  const writes = mem.storage.alarms - before;
  assert.ok(writes <= 20000 / GROOVE.SAVE_MS + 2, `${writes} alarm writes in 20 s, not one a tick`);
  assert.equal(late, 0, "never left in the past");
  assert.ok(mem.storage.alarm - clock.t <= 5000);
  assert.ok(mem.storage.quiet.length > 0, "and never holding the room's messages");
  /* with real timers: an interval in a song, a timeout otherwise */
  const timers = [];
  const timed = { now:() => clock.t, setInterval:(fn, ms) => { timers.push({ kind:"interval", ms }); return timers.length; },
    clearInterval:() => {}, setTimeout:(fn, ms) => { timers.push({ kind:"timeout", ms }); return timers.length; }, clearTimeout:() => {} };
  const live = new FloatRoom(memory().ctx, {}, { clock:timed });
  await live.ready;
  const screen = new FakeSocket();
  live.attach(screen, new URL("https://float.test/float/ws?room=abcd"));
  say(live, screen, { t:"hello", role:"screen", device:"tv" });
  say(live, screen, { t:"host", cmd:"start", bots:2 });
  assert.ok(timers.some(item => item.kind === "timeout" && item.ms === CUP_TIMING.INTRO_MS), "a timeout for the intro's end");
  assert.ok(!timers.some(item => item.kind === "interval"), "no loop in the intro");
  clock.t += CUP_TIMING.INTRO_MS;
  live.tick();
  assert.ok(timers.some(item => item.kind === "interval" && item.ms === GROOVE.TICK_MS), "the light timer in a song");
});

test("a saved 3D Cup comes back as a Groove lobby; the shared palette and room-code letters live in protocol.js", async () => {
  const mem = memory();
  mem.entries.set("cup", { v:1, id:"c-old", mode:"party", code:"brkt", drinking:true, seed:7, phase:"race", startAt:1, endsAt:2,
    round:2, entrants:[{ device:"a", name:"Ann", color:"#112233", look:LOOK, bot:false, ready:true }], field:[0], out:[] });
  mem.entries.set("race", { tick:900 });
  const { room } = await makeRoom({ mem });
  assert.equal(room.cup.v, 2);
  assert.equal(room.cup.phase, "lobby");
  assert.deepEqual(room.cup.entrants.map(entrant => entrant.name), ["Ann"]);
  await settle();
  assert.equal(mem.entries.has("race"), false, "the river's checkpoint goes");
  assert.equal(mem.entries.get("cup").v, 2);
  assert.equal(Cup.PALETTE, PALETTE);
  assert.equal(PALETTE.length, 16);
  assert.equal(Join.CODE_LETTERS, CODE_LETTERS);
  assert.equal(Join.STANDALONE_CODE, STANDALONE_CODE);
  assert.equal(Join.CODE_LENGTH, CODE_LENGTH);

});
