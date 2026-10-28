/* What the phone shows, from what the room says (float/client/controller
   controllerModel.js, useRoom.js foldFrame; float/GROOVE.md "What the room
   sends"), and a whole Cup through the mock (the real FloatRoom run in the
   tab) read the way the controller reads it: the screen for every phase,
   the chart kept across frames, `me` and the room's word on this rider's
   cues kept for the song, and every held moment the shots open on. */
import test from "node:test";
import assert from "node:assert/strict";
import { SONG_LEAD_MS, chartOf, songForRound } from "../float/shared/chart.js";
import { chartFor, cutView, finalPlace, findMe, foldMine, inSong, ordinal, roundShape, roundSong, screenOf, songAtOf, songKeyOf }
  from "../float/client/controller/controllerModel.js";
import { EMPTY, foldFrame } from "../float/client/controller/useRoom.js";
import { MOCK_SCENES, READY_START_MS, createMockRoom } from "../float/client/controller/mockRoom.js";

const people = n => Array.from({ length:n }, (_, i) => ({ device:`d${i}`, name:`Rider ${i}` }));

test("the screen for every phase: lobby, intro, song or crowd, cut, podium, card, watching", () => {
  const entrants = people(13);
  assert.equal(screenOf({ room:null, idx:-1 }), "connecting");
  assert.equal(screenOf({ room:{ phase:"lobby", entrants }, idx:-1 }), "lobby", "anyone may wait in a lobby");
  assert.equal(screenOf({ room:{ phase:"intro", field:[0, 1, 2], out:[], entrants }, idx:1 }), "intro");
  assert.equal(screenOf({ room:{ phase:"song", field:[0, 1, 2], out:[], entrants }, idx:2 }), "song");
  assert.equal(screenOf({ room:{ phase:"song", field:[0, 1], out:[2], entrants }, idx:2 }), "crowd", "out: the crowd");
  assert.equal(screenOf({ room:{ phase:"song", field:[0, 1], out:[2], entrants }, idx:-1 }), "watch", "not in this Cup");
  /* the cut: whoever played the song sees it, through or out; one out before is the crowd */
  const cut = { phase:"cut", field:[0, 1], out:[3, 2], scores:[{ i:0 }, { i:1 }, { i:2 }], entrants };
  assert.equal(screenOf({ room:cut, idx:0 }), "cut");
  assert.equal(screenOf({ room:cut, idx:2 }), "cut");
  assert.equal(screenOf({ room:cut, idx:3 }), "crowd");
  /* a room without scores: the field, else the round this phone saw itself go out in */
  const bare = { phase:"cut", round:1, field:[0, 1], out:[2], entrants };
  assert.equal(screenOf({ room:bare, idx:0 }), "cut");
  assert.equal(screenOf({ room:bare, idx:2, memory:{ outRound:1 } }), "cut");
  assert.equal(screenOf({ room:bare, idx:2, memory:{ outRound:0 } }), "crowd");
  assert.equal(inSong(bare, -1), false);
  assert.equal(screenOf({ room:{ phase:"podium", entrants }, idx:4 }), "podium");
  assert.equal(screenOf({ room:{ phase:"feedback", entrants }, idx:4 }), "feedback");
  assert.equal(screenOf({ room:{ phase:"feedback", entrants }, idx:-1 }), "watch");
});

test("the song from the room: its beat 0, its key, its chart (the room's, kept, or the frozen one)", () => {
  assert.equal(songAtOf({ phase:"song", songAt:123 }), 123);
  assert.equal(songAtOf({ phase:"song", songAt:null, startAt:1000 }), 1000 + SONG_LEAD_MS);
  assert.equal(songAtOf({ phase:"intro", songAt:null, startAt:1000 }), null);
  assert.equal(songKeyOf({ phase:"cut", cupId:"c1", round:1, songAt:900 }), "c1:1:900");
  const full = chartOf("rock");
  assert.equal(chartFor({ chart:full }), full);
  assert.equal(chartFor({ chartId:"rock" }, full), full, "kept while the room names the same one");
  assert.equal(chartFor({ chartId:"spin" }, full).id, "spin", "another song: the frozen module's");
  assert.equal(chartFor({ song:"drop" }).id, "drop");
  assert.equal(chartFor({}), null);
  assert.deepEqual(roundSong({ round:3, rounds:4 }), { id:"drop", name:"The Drop" });
  assert.deepEqual(roundSong({ song:"rock" }), { id:"rock", name:"Rock Hop" });
  assert.equal(songForRound(0, 4), "paddle");
});

test("the round's shape, a place, an ordinal", () => {
  assert.deepEqual(roundShape({ round:0, rounds:4, field:people(13).map((_, i) => i), cut:9 }), { round:0, rounds:4, of:13, final:false, through:9 });
  assert.deepEqual(roundShape({ round:3, rounds:4, field:[0, 1, 2], cut:null, lastRound:true }), { round:3, rounds:4, of:3, final:true, through:null });
  assert.equal(finalPlace({ final:[4, 2, 0, 1] }, 0), 3);
  assert.equal(finalPlace({ standings:[{ i:3, place:1 }, { i:0, place:2 }] }, 0), 2);
  assert.equal(finalPlace({ podium:[1, 0, 2] }, 0), 2);
  assert.equal(finalPlace({ podium:[1, 2, 3], out:[5, 0, 4] }, 0), 5, "out: places after the podium, last out first");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  assert.equal(findMe({ room:{ entrants:people(3) }, device:"d2" }), 2);
  assert.equal(findMe({ room:null, device:"d2", welcome:{ entrant:5 } }), 5);
});

test("the room's frames folded: the chart kept, `me` the song's, the room's word on this rider's cues and Done", () => {
  const entrants = people(4);
  let s = foldFrame(EMPTY, { t:"welcome", you:{ device:"d1", entrant:1 } }, { device:"d1" });
  assert.equal(s.idx, 1);
  const chart = chartOf("paddle");
  const room = { t:"room", phase:"song", cupId:"c", round:0, songAt:10_000, startAt:7000, field:[0, 1, 2, 3], out:[], entrants, song:"paddle",
    chartId:"paddle", chart, offset:12 };
  s = foldFrame(s, room, { device:"d1" });
  assert.equal(s.chart, chart);
  assert.equal(s.songKey, "c:0:10000");
  /* the next frame names the chart only: kept */
  const { chart:_, ...next } = room;
  s = foldFrame(s, { ...next, offset:18 }, { device:"d1" });
  assert.equal(s.chart, chart);
  s = foldFrame(s, { t:"me", i:1, pct:40, place:2, of:4, c:3, q:"nice", d:60, done:false }, { device:"d1" });
  assert.equal(s.me.pct, 40);
  assert.deepEqual(s.memory.judged[3], { q:"nice", d:60 });
  s = foldFrame(s, { t:"ev", e:"hit", i:1, c:4, q:"miss" }, { device:"d1" });
  s = foldFrame(s, { t:"ev", e:"hit", i:2, c:5, q:"perfect", d:3 }, { device:"d1" });
  assert.deepEqual(Object.keys(s.memory.judged), ["3", "4"], "only this rider's cues");
  assert.equal(s.memory.done, false);
  s = foldFrame(s, { t:"ev", e:"done", i:1 }, { device:"d1" });
  assert.equal(s.memory.done, true);
  /* the next song: `me`, the word on the cues and Done start over */
  s = foldFrame(s, { ...next, round:1, songAt:200_000, startAt:197_000, song:"rock", chartId:"rock" }, { device:"d1" });
  assert.equal(s.me, null);
  assert.equal(s.chart.id, "rock", "a room that names another chart without sending it: the frozen one");
  assert.deepEqual(s.memory.judged, {});
  assert.equal(s.memory.done, false);
  /* `me.done` from the start: a rider who doesn't drink owes no Done */
  s = foldFrame(s, { t:"me", i:1, done:true }, { device:"d1" });
  assert.equal(s.memory.done, true);
  /* out at this cut, in a room that sends no scores: remembered */
  s = foldFrame(s, { ...next, phase:"cut", round:1, songAt:200_000, out:[1], field:[0, 2] }, { device:"d1" });
  assert.equal(s.memory.outRound, 1);
  /* a new Cup forgets it all */
  s = foldFrame(s, { ...next, cupId:"c2", phase:"intro", songAt:null }, { device:"d1" });
  assert.equal(s.memory.outRound, undefined);
  assert.equal(foldMine(null, null, { songKey:"k" }).song, "k");
});

test("the cut reads the room's `me` (through, out) before its out list", () => {
  const room = { phase:"cut", out:[1], scores:[{ i:0, pct:90 }, { i:1, pct:50 }] };
  assert.equal(cutView({ room, idx:1 }).out, true);
  assert.equal(cutView({ room, idx:1, me:{ through:true, pct:50 } }).through, true, "the room's own word wins");
  assert.equal(cutView({ room, idx:0, me:{ out:true, pct:90 } }).out, true);
});

function manualTimers() {
  let seq = 0;
  const queue = new Map();
  return {
    setTimeout(fn) { const id = ++seq; queue.set(id, fn); return id; },
    clearTimeout(id) { queue.delete(id); },
    setInterval() { return ++seq; },
    clearInterval() {},
    flush() {
      for (let round = 0; round < 100 && queue.size; round += 1) {
        const due = [...queue.values()];
        queue.clear();
        for (const fn of due) fn();
      }
    },
  };
}
async function phone(options = {}) {
  const timers = manualTimers();
  const net = createMockRoom({ hello:{ rider:{ name:"Brandon", color:"#e4572e", drinks:true, look:{ critter:"capybara" } } }, timers, lag:0, ...options });
  let state = EMPTY;
  for (const type of ["welcome", "room", "me", "ev"]) net.on(type, msg => { state = foldFrame(state, msg, { device:net.device }); });
  for (let k = 0; k < 40 && net.status() !== "open"; k += 1) { await new Promise(resolve => setTimeout(resolve, 5)); timers.flush(); }
  timers.flush();
  return { net, timers, state:() => state, screen:() => screenOf({ room:state.room, idx:state.idx, memory:state.memory }) };
}

test("the mock: a live party lobby fills with the weekend's phones, and Ready starts the Cup on the real room", async () => {
  const p = await phone();
  assert.equal(p.screen(), "lobby");
  const room = p.state().room;
  assert.equal(room.entrants.length, 13);
  assert.equal(room.mode, "party");
  assert.ok(room.entrants.filter(e => e.ready).length >= 9);
  assert.equal(p.state().idx, 12, "this phone joined last");
  p.net.send({ t:"ready", on:true });
  p.timers.flush();
  assert.equal(p.state().room.entrants[12].ready, true);
  assert.equal(p.state().room.phase, "lobby");
  p.net.mock.advance(READY_START_MS);
  p.timers.flush();
  assert.equal(p.state().room.phase, "intro");
  assert.equal(p.screen(), "intro");
  p.net.mock.advance(9000);
  p.timers.flush();
  assert.equal(p.screen(), "song");
  assert.equal(p.state().chart.id, "paddle");
  assert.equal(songAtOf(p.state().room), p.state().room.startAt + SONG_LEAD_MS);
  /* the other phones ride as bots */
  assert.ok(p.state().room.entrants.filter((e, i) => i !== 12).every(e => e.bot));
  p.net.close();
});

test("the mock: every held moment opens on its phase, this phone where the shots expect it", async () => {
  const p = await phone({ freeze:true });
  const expect = {
    lobby:["lobby", "lobby"], "lobby-ready":["lobby", "lobby"], "lobby-fieldday":["lobby", "lobby"], intro:["intro", "intro"],
    card:["song", "song"], count:["song", "song"], practice:["song", "song"], hey:["song", "song"], play:["song", "song"],
    "play-late":["song", "song"], "play-miss":["song", "song"], drink:["song", "song"], "drink-done":["song", "song"],
    "drink-dry":["song", "song"], "drink-late":["song", "song"], outro:["song", "song"], after:["song", "song"], rock:["song", "song"],
    spin:["song", "song"], drop:["song", "song"], cut:["cut", "cut"], "cut-out":["cut", "cut"], "cut-final":["cut", "cut"],
    lastcall:["lastcall", "lastcall"], "lastcall-grab":["lastcall", "lastcall"], "lastcall-drink":["lastcall", "lastcall"],
    "lastcall-safe":["lastcall", "lastcall"],
    crowd:["song", "crowd"], podium:["podium", "podium"], "podium-win":["podium", "podium"], "podium-out":["podium", "podium"],
    feedback:["feedback", "feedback"], watch:["song", "watch"],
  };
  assert.deepEqual(Object.keys(expect).sort(), [...MOCK_SCENES].sort());
  for (const scene of MOCK_SCENES) {
    await p.net.mock.go(scene);
    p.timers.flush();
    const [phase, screen] = expect[scene];
    assert.equal(p.state().room.phase, phase, scene);
    assert.equal(p.screen(), screen, scene);
  }
  /* a few moments in detail */
  await p.net.mock.go("lobby-fieldday");
  p.timers.flush();
  assert.equal(p.state().room.mode, "fieldday");
  await p.net.mock.go("cut-out");
  p.timers.flush();
  assert.equal(cutView({ room:p.state().room, me:p.state().me, idx:p.state().idx }).out, true);
  await p.net.mock.go("cut");
  p.timers.flush();
  assert.equal(cutView({ room:p.state().room, me:p.state().me, idx:p.state().idx }).through, true);
  await p.net.mock.go("podium-win");
  p.timers.flush();
  assert.equal(finalPlace(p.state().room, p.state().idx), 1);
  await p.net.mock.go("drink-dry");
  p.timers.flush();
  assert.equal(p.state().memory.done, true, "a rider who doesn't drink owes no Done");
  await p.net.mock.go("drop");
  p.timers.flush();
  assert.equal(p.state().chart.id, "drop");
  assert.equal(p.state().room.lastRound, true);
  p.net.close();
});
