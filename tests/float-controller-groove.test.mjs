/* The phone in the Groove (float/GROOVE.md "Judging", "The drink break",
   "The screen (TV) and the phone"): a tap is stamped on the room's clock
   with the touch's own time, matched to the nearest cue with the room's
   one offset and sent raw, one judgement a cue; the drink break's Done
   gates the pad; the cut's percent, place and verdict; the wake lock from
   joining to the podium; and song 1 played end to end by the phone's own
   pieces against the real room (float/worker/room.js, run in the mock). */
import test from "node:test";
import assert from "node:assert/strict";
import { CALIBRATION, MISS_AFTER_MS, WINDOW, chartOf, cueTime, drinkSection, popupOf } from "../float/shared/chart.js";
import { createPad, padTap, restamp, serverStamp, stampOf } from "../float/client/controller/rhythm.js";
import { WAKE_PHASES, cutView, drinkGate, pctText, placeOrder, screenOf, songAtOf, songKeyOf, songView, wakeFor }
  from "../float/client/controller/controllerModel.js";
import { EMPTY, foldFrame } from "../float/client/controller/useRoom.js";
import { createMockRoom } from "../float/client/controller/mockRoom.js";

const paddle = chartOf("paddle");
const SONG_AT = 1_000_000;
const at = (beat, ms = 0) => cueTime(SONG_AT, beat) + ms;
const cueAtBeat = (chart, beat) => chart.cues.find(cue => cue.beat === beat);

test("a tap is stamped with the touch's own time on the room's clock", () => {
  /* the touch landed 40 ms before the handler ran: the room's clock 40 ms back */
  assert.equal(serverStamp(960, { perfNow:1000, serverNow:5_000_000 }), 4_999_960);
  /* an old browser's epoch time stamp (or none) is now */
  assert.equal(serverStamp(1_700_000_000_000, { perfNow:1000, serverNow:5_000_000 }), 5_000_000);
  assert.equal(serverStamp(undefined, { perfNow:1000, serverNow:5_000_000 }), 5_000_000);
  assert.equal(stampOf({ timeStamp:960 }, 1000), 960);
  assert.equal(stampOf({ timeStamp:1200 }, 1000), 1000, "never after now");
  assert.equal(stampOf({ timeStamp:0 }, 1000), 1000);
});

test("tap to hit: the nearest cue within 300 ms, judged with the room's offset, sent raw", () => {
  const pad = createPad();
  pad.song("a");
  const cue = cueAtBeat(paddle, 12);
  /* 88 ms late on the server clock, the room's offset 18: the phone shows +0.07 Nice!, sends r 88 */
  const tap = pad.tap(at(12, 88), { chart:paddle, songAt:SONG_AT, offset:18 });
  assert.equal(tap.c, cue.id);
  assert.deepEqual(tap.hit, { t:"hit", c:cue.id, r:88 });
  assert.equal(tap.d, 70);
  assert.equal(tap.q, "nice");
  assert.deepEqual(tap.popup, popupOf("nice", 70));
  assert.deepEqual(tap.popup, { num:"+0.07", word:"Nice!", tone:"yellow" });
  /* the same offset moves every judgement: 18 ms raw is Perfect at 0.00 */
  assert.equal(pad.tap(at(14, 18), { chart:paddle, songAt:SONG_AT, offset:18 }).popup.num, "0.00");
  /* early and late past OK, up to 300 ms, with their sign */
  const late = createPad().tap(at(16, 240), { chart:paddle, songAt:SONG_AT });
  assert.deepEqual([late.q, late.popup.num, late.popup.word], ["late", "+0.24", "Late"]);
  const early = createPad().tap(at(16, -200), { chart:paddle, songAt:SONG_AT });
  assert.deepEqual([early.q, early.popup.num], ["early", "-0.20"]);
  /* nothing near: no cue, no hit (beat 5 is the intro) */
  assert.equal(createPad().tap(at(5), { chart:paddle, songAt:SONG_AT }), null);
  assert.equal(createPad().tap(at(16, WINDOW.MAX + 20), { chart:paddle, songAt:SONG_AT }), null);
});

test("one hit a cue: a second tap goes to the next cue or to none; the room's word takes a cue too", () => {
  const pad = createPad();
  pad.song("a");
  const first = pad.tap(at(12, 10), { chart:paddle, songAt:SONG_AT });
  assert.equal(first.c, cueAtBeat(paddle, 12).id);
  /* the same moment again: beat 12 is taken, and beat 14 is 1 s away */
  assert.equal(pad.tap(at(12, 20), { chart:paddle, songAt:SONG_AT }), null);
  /* Hey! Hey! on 4 and its "and" (play B): one finger each, the second the next cue */
  const playB = paddle.cues.filter(cue => cue.kind === "hey" && cue.beat >= 88);
  const double = playB.find((cue, k) => playB[k + 1]?.beat === cue.beat + 0.5);
  const one = pad.tap(at(double.beat, 5), { chart:paddle, songAt:SONG_AT }), two = pad.tap(at(double.beat, 5), { chart:paddle, songAt:SONG_AT });
  assert.equal(one.c, double.id);
  assert.equal(two.c, double.id + 1);
  assert.equal(two.q, "early", "250 ms ahead of the and");
  /* a cue the room judged (its miss, a hit heard before a reload) is taken */
  pad.take(cueAtBeat(paddle, 16).id);
  assert.equal(pad.tap(at(16), { chart:paddle, songAt:SONG_AT }), null);
});

test("the taken set is the song's: a reconnect keeps it, the next song starts it over", () => {
  const pad = createPad();
  assert.equal(pad.song("cup:0:1000000"), true);
  pad.tap(at(12), { chart:paddle, songAt:SONG_AT });
  assert.equal(pad.song("cup:0:1000000"), false, "the same song after a reconnect");
  assert.equal(pad.size(), 1);
  assert.equal(pad.tap(at(12), { chart:paddle, songAt:SONG_AT }), null);
  assert.equal(pad.song("cup:1:1100000"), true);
  assert.equal(pad.size(), 0);
  assert.equal(songKeyOf({ phase:"song", cupId:"c", round:2, songAt:5 }), "c:2:5");
  assert.equal(songKeyOf({ phase:"song", cupId:"c", round:2, startAt:5 }), "c:2:3005", "songAt from startAt and the lead");
  assert.equal(songKeyOf({ phase:"intro", cupId:"c", round:0, songAt:null }), null);
  assert.equal(songAtOf({ phase:"cut", songAt:null, startAt:5 }), null);
});

test("the room's word on the cue up restamps the popup once, only when it differs", () => {
  const popup = { c:7, q:"nice", d:70, popup:popupOf("nice", 70) };
  assert.equal(restamp(popup, { c:7, q:"nice", d:70 }), null);
  assert.equal(restamp(popup, { c:8, q:"perfect", d:10 }), null, "some other cue's word");
  const again = restamp(popup, { c:7, q:"perfect", d:40 });
  assert.deepEqual([again.q, again.popup.num, again.popup.word], ["perfect", "+0.04", "Perfect"]);
});

test("the drink break: Done owed from its first beat, the pad shut until it is tapped, through play B too", () => {
  const drink = drinkSection(paddle);
  const gateAt = (beat, { owes = true, done = false } = {}) => drinkGate({ view:songView(paddle, SONG_AT, at(beat)), chart:paddle, owes, done });
  assert.deepEqual(gateAt(40), { owed:false, inBreak:false, resting:false, drank:false, pad:true });
  assert.equal(gateAt(drink.from - 0.1).owed, false, "not before the break");
  assert.deepEqual(gateAt(drink.from + 1), { owed:true, inBreak:true, resting:false, drank:false, pad:false });
  /* Done: "Done" while the pad waits for the beat */
  assert.deepEqual(gateAt(drink.from + 6, { done:true }), { owed:false, inBreak:true, resting:true, drank:true, pad:true });
  /* the beat came back before Done: Done stays up, the pad stays shut */
  assert.deepEqual(gateAt(drink.to + 2), { owed:true, inBreak:false, resting:false, drank:false, pad:false });
  assert.equal(gateAt(drink.to + 2, { done:true }).pad, true);
  /* a rider who doesn't drink, or a room with drinking off: a break, nothing owed */
  assert.deepEqual(gateAt(drink.from + 1, { owes:false }), { owed:false, inBreak:true, resting:true, drank:false, pad:true });
  /* the pad itself: closed while Done is owed (no cue, no hit, nothing), open after */
  const pad = createPad();
  pad.song("x");
  const firstB = paddle.cues.find(cue => cue.beat >= drink.to);
  const shut = padTap(pad, at(firstB.beat), { chart:paddle, songAt:SONG_AT, owes:true, done:false });
  assert.deepEqual([shut.open, shut.found], [false, null]);
  assert.equal(pad.size(), 0, "a shut pad takes no cue");
  const open = padTap(pad, at(firstB.beat), { chart:paddle, songAt:SONG_AT, owes:true, done:true });
  assert.equal(open.open, true);
  assert.equal(open.found.c, firstB.id);
  /* in the intro the pad is open and simply finds nothing */
  assert.deepEqual(padTap(createPad(), at(3), { chart:paddle, songAt:SONG_AT, owes:true }).open, true);
});

test("the cut: your percent and place, Through or Out, and after the final the Cup's place", () => {
  const scores = [{ i:0, pct:81.5, cup:0 }, { i:1, pct:90, cup:0 }, { i:2, pct:81.5, cup:12 }, { i:3, pct:40, cup:0 }];
  assert.deepEqual(placeOrder(scores).map(s => s.i), [1, 2, 0, 3], "a tie goes to the higher Cup total");
  const room = { phase:"cut", round:0, rounds:4, field:[1, 2, 0], out:[3], scores, entrants:[{}, {}, {}, {}] };
  assert.deepEqual(cutView({ room, idx:0 }), { pct:81.5, place:3, of:4, through:true, out:false, final:false, cupPlace:null });
  assert.deepEqual(cutView({ room, idx:3 }), { pct:40, place:4, of:4, through:false, out:true, final:false, cupPlace:null });
  /* the room's own `me` is the truth when it has one */
  assert.equal(cutView({ room, idx:0, me:{ pct:82, place:2, of:4 } }).place, 2);
  /* after the final: no verdict, the Cup's place */
  const last = { ...room, round:3, lastRound:true, final:[1, 2, 0, 3], podium:[1, 2, 0] };
  assert.deepEqual(cutView({ room:last, idx:2 }), { pct:81.5, place:2, of:4, through:false, out:false, final:true, cupPlace:2 });
  assert.equal(pctText(81.5), "81.5%");
  assert.equal(pctText(100), "100%");
  assert.equal(pctText(null), "");
  /* the screens: in the cut a rider who played sees it; one out before is the crowd */
  assert.equal(screenOf({ room, idx:3 }), "cut");
  assert.equal(screenOf({ room:{ ...room, out:[3, 5], scores, entrants:[{}, {}, {}, {}, {}, {}] }, idx:5 }), "crowd");
});

test("the wake lock: held from joining to the podium, let go for the card", () => {
  assert.deepEqual([...WAKE_PHASES], ["lobby", "intro", "song", "cut", "podium"]);
  for (const phase of [null, undefined, "lobby", "intro", "song", "cut", "podium"]) assert.equal(wakeFor(phase), true, String(phase));
  assert.equal(wakeFor("feedback"), false);
});

/* ---- song 1, end to end: the phone's own pieces against the real room ---- */

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

test("song 1 end to end: practice calibrates the room, every tap a hit, Done opens play B, the cut", async () => {
  const timers = manualTimers();
  const net = createMockRoom({ hello:{ rider:{ name:"Brandon", color:"#e4572e", drinks:true, look:{ critter:"capybara" } } },
    freeze:true, timers, lag:0 });
  let state = EMPTY;
  for (const type of ["welcome", "room", "me", "ev"]) net.on(type, msg => { state = foldFrame(state, msg, { device:net.device }); });
  await net.mock.go("lobby");
  for (let k = 0; k < 20 && net.status() !== "open"; k += 1) { await new Promise(resolve => setTimeout(resolve, 5)); timers.flush(); }
  timers.flush();
  assert.equal(net.status(), "open");
  assert.equal(screenOf({ room:state.room, idx:state.idx }), "lobby");
  assert.equal(state.room.entrants.length, 13, "the weekend's phones fill the lobby");
  /* the host starts the Cup (a held lobby never starts on its own) */
  const live = net.mock.room();
  for (const [ws, meta] of live.sockets) if (meta.role === "screen") live.onMessage(ws, JSON.stringify({ t:"host", cmd:"start", drinking:true }));
  timers.flush();
  assert.equal(state.room.phase, "intro");
  assert.equal(screenOf({ room:state.room, idx:state.idx }), "intro");
  net.mock.advance(9000);
  timers.flush();
  assert.equal(state.room.phase, "song");
  assert.equal(screenOf({ room:state.room, idx:state.idx }), "song");
  assert.ok(state.chart?.cues?.length, "the chart came with the song");
  const chart = state.chart, songAt = songAtOf(state.room);
  assert.equal(songAt, state.room.startAt + 3000);
  const pad = createPad();
  pad.song(state.songKey);
  const drink = drinkSection(chart);
  const sent = [];
  /* every cue tapped 25 ms late on the room's clock; Done 2 s into the break */
  let doneSent = false;
  for (const cue of chart.cues) {
    const t = cueTime(songAt, cue.beat) + 25;
    if (!doneSent && cue.beat >= drink.to) {
      net.mock.advance(cueTime(songAt, drink.from) + 2000 - net.mock.clock());
      timers.flush();
      assert.equal(drinkGate({ view:songView(chart, songAt, net.serverNow()), chart, owes:true, done:false }).owed, true);
      net.send({ t:"drink" });
      timers.flush();
      doneSent = true;
      assert.equal(state.memory.done, true, "the room heard Done");
    }
    net.mock.advance(t - net.mock.clock());
    timers.flush();
    const tap = padTap(pad, net.serverNow(), { chart, songAt, offset:Number(state.room.offset) || 0, owes:true, done:state.memory.done });
    assert.equal(tap.open, true);
    assert.ok(tap.found, `beat ${cue.beat} found its cue`);
    assert.equal(tap.found.c, cue.id);
    net.send(tap.found.hit);
    sent.push(tap.found.hit);
    timers.flush();
  }
  /* the room judged every one, and calibrated on the practice taps */
  const judged = state.memory.judged;
  assert.equal(Object.keys(judged).length, chart.cues.length);
  assert.ok(Object.values(judged).every(v => v.q === "perfect"), "25 ms late everywhere is Perfect once the offset is 25");
  assert.equal(Number(state.room.offset), 25);
  assert.ok(sent.filter((hit, k) => !chart.cues[k].scored).length >= CALIBRATION.MIN, "practice taps went to the room");
  assert.equal(state.me.pct, 100);
  /* the song ends: the cut, through */
  net.mock.advance(cueTime(songAt, chart.beats) + 2000 - net.mock.clock());
  timers.flush();
  assert.equal(state.room.phase, "cut");
  assert.equal(screenOf({ room:state.room, idx:state.idx, memory:state.memory }), "cut");
  const cut = cutView({ room:state.room, me:state.me, idx:state.idx });
  assert.equal(cut.pct, 100);
  assert.equal(cut.through, true);
  assert.ok(cut.place >= 1 && cut.place <= 13);
  assert.equal(cut.of, 13);
  net.close();
});

test("a phone that never taps Done: play B's cues are the room's misses until it does", async () => {
  const timers = manualTimers();
  const net = createMockRoom({ hello:{ rider:{ name:"Brandon", color:"#e4572e", drinks:true } }, freeze:true, timers, lag:0 });
  let state = EMPTY;
  for (const type of ["welcome", "room", "me", "ev"]) net.on(type, msg => { state = foldFrame(state, msg, { device:net.device }); });
  await net.mock.go("drink-late");
  for (let k = 0; k < 20 && net.status() !== "open"; k += 1) { await new Promise(resolve => setTimeout(resolve, 5)); timers.flush(); }
  timers.flush();
  const chart = state.chart, songAt = songAtOf(state.room), drink = drinkSection(chart);
  assert.ok(net.serverNow() > cueTime(songAt, drink.to), "play B has begun");
  assert.equal(state.memory.done, false);
  /* the next cue, Done still owed: the room calls it missed */
  const owedCue = chart.cues.find(cue => cueTime(songAt, cue.beat) > net.mock.clock());
  assert.ok(owedCue.beat >= drink.to);
  net.mock.advance(cueTime(songAt, owedCue.beat) + Number(state.room.offset) + MISS_AFTER_MS + 100 - net.mock.clock());
  timers.flush();
  assert.equal(state.memory.judged[owedCue.id]?.q, "miss");
  /* a hit sent anyway (the phone would not send one) is no hit */
  const next = chart.cues.find(cue => cueTime(songAt, cue.beat) > net.mock.clock());
  net.mock.advance(cueTime(songAt, next.beat) - net.mock.clock());
  net.send({ t:"hit", c:next.id, r:0 });
  timers.flush();
  assert.equal(state.memory.judged[next.id], undefined, "locked out until Done");
  /* Done: the next cue counts */
  net.send({ t:"drink" });
  timers.flush();
  assert.equal(state.memory.done, true);
  const after = chart.cues.find(cue => cueTime(songAt, cue.beat) > net.mock.clock() + 100);
  net.mock.advance(cueTime(songAt, after.beat) - net.mock.clock());
  net.send({ t:"hit", c:after.id, r:0 });
  timers.flush();
  assert.equal(state.memory.judged[after.id]?.q, "perfect");
  net.close();
});
