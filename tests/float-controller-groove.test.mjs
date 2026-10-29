/* The phone in the Groove (float/GROOVE.md "Judging", "Practice, narrated",
   "The breakdown", "After a song", "Who's ahead", "The chug-off", "Last
   Call: the countdown"): a tap is stamped on the room's clock with the
   touch's own time, matched to the nearest cue with the room's one offset
   and sent raw, one judgement a cue; the breakdown's copies and the
   host's demos; the cut's grade, verdict and its beats; your place in
   play; the chug-off; Last Call's one tap; the wake lock; and song 1
   played end to end by the phone's own pieces against the real room
   (float/worker/room.js, run in the mock). */
import test from "node:test";
/* v3 (wave A) rides with this file in npm test */
import "./float-controller-v3.test.mjs";
import assert from "node:assert/strict";
import { CALIBRATION, CHUGOFF, MISS_AFTER_MS, WINDOW, breakdownSection, chartOf, cueTime, lastCallId, popupOf } from "../float/shared/chart.js";
import { createPad, padTap, restamp, serverStamp, stampOf } from "../float/client/controller/rhythm.js";
import { CALL_WORDS, CUT_SHOW, WAKE_PHASES, chugCount, chugoffView, countdownView, cutShow, cutView, demoAt, lastCallJudged, narrationAt,
  pctText, pendingCalls, placeOrder, rankView, roundShape, screenOf, songAtOf, songKeyOf, songView, wakeFor }
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
  const late = createPad().tap(at(20, 240), { chart:paddle, songAt:SONG_AT });
  assert.deepEqual([late.q, late.popup.num, late.popup.word], ["late", "+0.24", "Late"]);
  const early = createPad().tap(at(20, -200), { chart:paddle, songAt:SONG_AT });
  assert.deepEqual([early.q, early.popup.num], ["early", "-0.20"]);
  /* nothing near: no cue, no hit (beat 5 is the intro) */
  assert.equal(createPad().tap(at(5), { chart:paddle, songAt:SONG_AT }), null);
  assert.equal(createPad().tap(at(20, WINDOW.MAX + 20), { chart:paddle, songAt:SONG_AT }), null);
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

test("the breakdown: copy the host a bar later (echo cues, ordinary taps), Copy me over its first bar; practice narrated, the host's demos Watch", () => {
  const breakdown = breakdownSection(paddle);
  assert.ok(breakdown, "every song has its breakdown");
  const echoes = paddle.cues.filter(cue => cue.kind === "echo");
  assert.ok(echoes.length > 0 && echoes.every(cue => cue.beat >= breakdown.from && cue.beat < breakdown.to && cue.call === cue.beat - 4));
  assert.equal(narrationAt(paddle, breakdown.from), "Copy me");
  /* the host's bar shows its rhythm in the bubble, one note a hit */
  const first = echoes[0];
  assert.equal(pendingCalls(paddle, first.call + 0.1)[0].word, CALL_WORDS.echo);
  /* an echo is an ordinary tap */
  const pad = createPad();
  pad.song("x");
  const tap = padTap(pad, at(first.beat, 20), { chart:paddle, songAt:SONG_AT });
  assert.deepEqual([tap.open, tap.found.c, tap.found.q], [true, first.id, "perfect"]);
  /* practice is narrated; while the host shows a cue it says Watch, and no tap takes it */
  assert.ok(narrationAt(paddle, 8));
  const demo = paddle.cues.find(cue => cue.demo);
  assert.equal(narrationAt(paddle, demo.beat), "Watch");
  assert.equal(demoAt(paddle, Number.isFinite(demo.call) ? demo.call : demo.beat - 0.5)?.id, demo.id, "a demo stroke has no call: shown from the beat before");
  assert.equal(demoAt(paddle, demo.beat + 0.6), null);
  assert.equal(padTap(createPad(), at(demo.beat), { chart:paddle, songAt:SONG_AT }).found, null);
  assert.equal(narrationAt(paddle, 40), null, "play has no narration");
  /* in the intro the pad is open and simply finds nothing */
  assert.deepEqual(padTap(createPad(), at(3), { chart:paddle, songAt:SONG_AT }), { open:true, found:null });
});

test("the cut: your percent and place, Through, Out or the chug-off, and after the final the Cup's place", () => {
  const scores = [{ i:0, pct:81.5, cup:0 }, { i:1, pct:90, cup:0 }, { i:2, pct:81.5, cup:12 }, { i:3, pct:40, cup:0 }];
  assert.deepEqual(placeOrder(scores).map(s => s.i), [1, 2, 0, 3], "a tie goes to the higher Cup total");
  const room = { phase:"cut", round:0, rounds:4, field:[1, 2, 0], out:[3], scores, entrants:[{}, {}, {}, {}] };
  assert.deepEqual(cutView({ room, idx:0 }), { pct:81.5, place:3, of:4, through:true, out:false, bubble:false, final:false, cupPlace:null });
  assert.deepEqual(cutView({ room, idx:3 }), { pct:40, place:4, of:4, through:false, out:true, bubble:false, final:false, cupPlace:null });
  /* the room's own `me` is the truth when it has one */
  assert.equal(cutView({ room, idx:0, me:{ pct:82, place:2, of:4 } }).place, 2);
  /* on the bubble: me.through null until the chug-off settles */
  const bubble = cutView({ room:{ ...room, show:{ outs:[], bubble:[0, 3] } }, idx:0, me:{ through:null, out:false, bubble:true } });
  assert.deepEqual([bubble.bubble, bubble.through, bubble.out], [true, false, false]);
  assert.equal(cutView({ room, idx:0, me:{ through:true, out:false, bubble:true } }).bubble, false, "settled: Through");
  /* after the final: no verdict, the Cup's place */
  const last = { ...room, round:3, lastRound:true, final:[1, 2, 0, 3], podium:[1, 2, 0] };
  assert.deepEqual(cutView({ room:last, idx:2 }), { pct:81.5, place:2, of:4, through:false, out:false, bubble:false, final:true, cupPlace:2 });
  assert.equal(pctText(81.5), "81.5%");
  assert.equal(pctText(100), "100%");
  assert.equal(pctText(null), "");
  /* the screens: in the cut a rider who played sees it; one out before is the crowd */
  assert.equal(screenOf({ room, idx:3 }), "cut");
  assert.equal(screenOf({ room:{ ...room, out:[3, 5], scores, entrants:[{}, {}, {}, {}, {}, {}] }, idx:5 }), "crowd");
});

test("after a song: the grade and the judge's line first, then Through or Out on the room's beat", () => {
  const t0 = 5_000_000;
  const room = { phase:"cut", round:0, startAt:t0, results:[{ i:0, grade:"ok" }, { i:1, grade:"superb" }, { i:2, grade:"tryagain" }],
    show:{ grades:t0 + 400, line:t0 + 6000, outs:[{ i:2, at:t0 + 6800 }, { i:3, at:t0 + 8200 }] } };
  const me = { feedback:{ grade:"superb", line:"Every Hey on the beat." } };
  const mine = cutShow({ room, me, idx:1, now:t0 + 1000 });
  assert.deepEqual([mine.grade, mine.word, mine.line, mine.told], ["superb", "Superb", "Every Hey on the beat.", false]);
  assert.equal(mine.at, t0 + 8200 + CUT_SHOW.gap, "Through after the last out");
  assert.equal(cutShow({ room, me, idx:1, now:t0 + 8700 }).told, true);
  /* an out on their own beat */
  assert.equal(cutShow({ room, idx:2, now:t0 + 6799 }).told, false);
  assert.deepEqual([cutShow({ room, idx:2, now:t0 + 6800 }).told, cutShow({ room, idx:2, now:t0 }).grade], [true, "tryagain"]);
  /* nobody out: told on the cut line */
  assert.equal(cutShow({ room:{ ...room, show:{ grades:t0 + 400, line:t0 + 6000, outs:[] } }, idx:0, now:t0 }).at, t0 + 6000);
});

test("who's ahead: your place and the field in play, Safe or Below the cut; nothing in practice; the final's place alone", () => {
  const view = moment => ({ moment });
  const shape = { final:false };
  assert.deepEqual(rankView({ me:{ place:4, of:13, cut:8 }, view:view("play"), shape }),
    { place:4, of:13, text:"4th of 13", status:"Safe", safe:true });
  assert.deepEqual(rankView({ me:{ place:9, of:13, cut:8 }, view:view("breakdown"), shape }),
    { place:9, of:13, text:"9th of 13", status:"Below the cut", safe:false });
  for (const moment of ["card", "intro", "practice"]) assert.equal(rankView({ me:{ place:1, of:13, cut:8 }, view:view(moment), shape }), null, moment);
  assert.equal(rankView({ me:null, view:view("play"), shape }), null, "until me arrives");
  assert.deepEqual(rankView({ me:{ place:2, of:4, cut:null, lastRound:true }, view:view("play"), shape:{ final:true } }),
    { place:2, of:4, text:"2nd", status:null, safe:null });
});

test("the wake lock: held from joining to the podium, let go for the card", () => {
  assert.deepEqual([...WAKE_PHASES], ["lobby", "intro", "song", "cut", "chugoff", "lastcall", "podium"]);
  for (const phase of [null, undefined, "lobby", "intro", "song", "cut", "chugoff", "lastcall", "podium"]) assert.equal(wakeFor(phase), true, String(phase));
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

async function openPhone(scene = null, rider = { name:"Brandon", color:"#e4572e", drinks:true, look:{ critter:"capybara" } }) {
  const timers = manualTimers();
  const net = createMockRoom({ hello:{ rider }, freeze:true, timers, lag:0 });
  const box = { state:EMPTY };
  for (const type of ["welcome", "room", "me", "ev"]) net.on(type, msg => { box.state = foldFrame(box.state, msg, { device:net.device }); });
  if (scene) await net.mock.go(scene);
  for (let k = 0; k < 20 && net.status() !== "open"; k += 1) { await new Promise(resolve => setTimeout(resolve, 5)); timers.flush(); }
  timers.flush();
  return { net, timers, box };
}

test("song 1 end to end: practice calibrates the room, every played cue a hit (demos are the host's), your place, the cut", async () => {
  const { net, timers, box } = await openPhone("lobby");
  assert.equal(net.status(), "open");
  assert.equal(screenOf({ room:box.state.room, idx:box.state.idx }), "lobby");
  assert.equal(box.state.room.entrants.length, 13, "the weekend's phones fill the lobby");
  /* the host starts the Cup (a held lobby never starts on its own) */
  const live = net.mock.room();
  for (const [ws, meta] of live.sockets) if (meta.role === "screen") live.onMessage(ws, JSON.stringify({ t:"host", cmd:"start", drinking:true }));
  timers.flush();
  assert.equal(box.state.room.phase, "intro");
  net.mock.advance(9000);
  timers.flush();
  assert.equal(box.state.room.phase, "song");
  assert.ok(box.state.chart?.cues?.length, "the chart came with the song");
  const chart = box.state.chart, songAt = songAtOf(box.state.room);
  assert.equal(songAt, box.state.room.startAt + 3000);
  const pad = createPad();
  pad.song(box.state.songKey);
  const played = chart.cues.filter(cue => !cue.demo);
  const sent = [];
  let ranked = null;
  /* every played cue tapped 25 ms late on the room's clock */
  for (const cue of played) {
    net.mock.advance(cueTime(songAt, cue.beat) + 25 - net.mock.clock());
    timers.flush();
    const tap = padTap(pad, net.serverNow(), { chart, songAt, offset:Number(box.state.room.offset) || 0 });
    assert.ok(tap.found, `beat ${cue.beat} found its cue`);
    assert.equal(tap.found.c, cue.id);
    net.send(tap.found.hit);
    sent.push(tap.found.hit);
    timers.flush();
    if (!ranked && cue.scored) ranked = rankView({ me:box.state.me, view:songView(chart, songAt, net.serverNow()), shape:roundShape(box.state.room) });
  }
  /* the room judged every one, and calibrated on the practice taps */
  const judged = box.state.memory.judged;
  assert.equal(Object.keys(judged).length, played.length);
  assert.ok(Object.values(judged).every(v => v.q === "perfect"), "25 ms late everywhere is Perfect once the offset is 25");
  assert.equal(Number(box.state.room.offset), 25);
  assert.ok(sent.filter((hit, k) => !played[k].scored).length >= CALIBRATION.MIN, "practice taps went to the room");
  assert.equal(box.state.me.pct, 100);
  /* your place as the room has it, in the corner from the first scored cue */
  assert.ok(ranked && ranked.place >= 1 && ranked.of === 13, "a place from me");
  const end = rankView({ me:box.state.me, view:songView(chart, songAt, net.serverNow()), shape:roundShape(box.state.room) });
  assert.equal(end.status, "Safe");
  /* the song ends: the cut, through */
  net.mock.advance(cueTime(songAt, chart.beats) + 2000 - net.mock.clock());
  timers.flush();
  assert.equal(box.state.room.phase, "cut");
  assert.equal(screenOf({ room:box.state.room, idx:box.state.idx, memory:box.state.memory }), "cut");
  const cut = cutView({ room:box.state.room, me:box.state.me, idx:box.state.idx });
  assert.equal(cut.pct, 100);
  assert.equal(cut.through, true);
  assert.equal(cut.of, 13);
  assert.equal(cutShow({ room:box.state.room, me:box.state.me, idx:box.state.idx, chart, judged, now:net.serverNow() }).grade, "superb");
  net.close();
});

/* ---- the chug-off (GROOVE.md "The chug-off") ---- */

test("the chug-off: the two get the call, the count, one Done; the room the names; who keeps the spot and why", () => {
  const goAt = 7_000_000;
  const entrants = [{ name:"Brandon" }, { name:"Evan" }, { name:"Khoa" }];
  const room = { phase:"chugoff", round:0, startAt:goAt - CHUGOFF.INTRO_MS, entrants, chugoff:{ a:0, b:1, goAt, doneAt:{}, winner:null, by:null } };
  const intro = chugoffView({ room, idx:0, now:goAt - 3500 });
  assert.deepEqual([intro.moment, intro.contender, intro.first, intro.names], ["intro", true, true, ["Brandon", "Evan"]]);
  assert.equal(chugoffView({ room:{ ...room, round:1 }, idx:0, now:goAt }).first, false, "only the Cup's first says what it is");
  assert.equal(chugoffView({ room, idx:2, now:goAt }).contender, false);
  assert.deepEqual([chugCount(goAt, goAt - 3500), chugCount(goAt, goAt - 2500), chugCount(goAt, goAt - 1), chugCount(goAt, goAt + 100),
    chugCount(goAt, goAt + 1000)], [null, "3", "1", "Chug!", null]);
  const go = chugoffView({ room, idx:0, now:goAt + 100 });
  assert.deepEqual([go.moment, go.done], ["go", false]);
  assert.equal(chugoffView({ room, idx:0, now:goAt + 100, sent:true }).done, true, "Waiting once this phone sent Done");
  assert.equal(chugoffView({ room:{ ...room, chugoff:{ ...room.chugoff, doneAt:{ 0:4200 } } }, idx:0, now:goAt + 4300 }).done, true);
  const decided = by => ({ ...room, chugoff:{ ...room.chugoff, winner:0, by } });
  const kept = chugoffView({ room:decided("chug"), idx:0, now:goAt + 5000 });
  assert.deepEqual([kept.moment, kept.kept, kept.why], ["told", true, "You finished first"]);
  assert.deepEqual([chugoffView({ room:decided("chug"), idx:1, now:goAt }).kept, chugoffView({ room:decided("chug"), idx:1, now:goAt }).why],
    [false, "Brandon finished first"]);
  assert.equal(chugoffView({ room:decided("score"), idx:2, now:goAt }).why, "Nobody finished. The better score keeps the spot.");
  assert.equal(chugoffView({ room:decided("forfeit"), idx:2, now:goAt }).why, "Evan's phone dropped");
  assert.equal(chugoffView({ room:decided("forfeit"), idx:1, now:goAt }).why, "Your phone dropped");
  assert.equal(screenOf({ room, idx:2 }), "chugoff", "everyone in the Cup watches it, with the Cheer");
  assert.equal(screenOf({ room, idx:-1 }), "watch");
});

/* ---- Last Call: the countdown (GROOVE.md "Last Call: the countdown") ---- */

test("Last Call: one tap on zero (a 3 s window), Locked, the offset held until the reveal, then who drinks", () => {
  const bar = chartOf(lastCallId(0));
  const cd = bar.countdown;
  assert.equal(cd.first, true, "the Cup's first Last Call says what it is");
  assert.equal(chartOf(lastCallId(1)).countdown.first, false);
  const songAt = 9_000_000;
  const zero = songAt + cd.zeroAt;
  /* the pad: 730 ms late is the one tap, Late; nothing a window away */
  const pad = createPad();
  pad.song("bar");
  assert.equal(padTap(pad, zero - 3100, { chart:bar, songAt }).found, null);
  const late = padTap(pad, zero + 730, { chart:bar, songAt });
  assert.deepEqual([late.found.c, late.found.q, late.found.popup.num, late.found.popup.word], [0, "late", "+0.73", "Late"]);
  assert.ok(pad.has(0), "taken: a second tap does nothing");
  /* the moments: the intro, the count (Tap on zero), the reveal, the verdict */
  const room = { phase:"lastcall", round:0, songAt, entrants:[{}, {}, {}], lastCall:{ worst:null } };
  const view = (now, extra = {}) => countdownView({ room, idx:0, chart:bar, songAt, now, ...extra });
  assert.deepEqual([view(songAt + 100).moment, view(songAt + 100).first], ["intro", true]);
  const counting = view(zero - 2000);
  assert.deepEqual([counting.moment, counting.locked, counting.offset], ["count", false, null]);
  /* the room says your offset at once (me.lastCall); the phone holds it: Locked, nothing more */
  const game = { memory:{}, me:{ lastCall:{ ms:730, d:730 } } };
  const judged = lastCallJudged(game, "bar");
  assert.deepEqual(judged[0], { q:"late", d:730 });
  const locked = view(zero + 1000, { judged });
  assert.deepEqual([locked.moment, locked.locked, locked.offset], ["count", true, null]);
  assert.deepEqual(view(songAt + cd.revealAt, { judged }).offset, { q:"late", d:730 }, "shown at revealAt");
  assert.deepEqual(view(songAt + cd.revealAt).offset, { q:"miss", d:null }, "no tap: a miss");
  assert.equal(view(songAt + cd.verdictAt, { judged }).drinks, null, "the room has not said");
  const told = { ...room, lastCall:{ worst:[0, 2] } };
  assert.equal(countdownView({ room:told, idx:0, chart:bar, songAt, now:songAt + cd.verdictAt, judged }).drinks, true);
  assert.equal(countdownView({ room:told, idx:1, chart:bar, songAt, now:songAt + cd.verdictAt }).drinks, false);
  assert.equal(countdownView({ room:told, idx:0, chart:bar, songAt, now:songAt + cd.verdictAt - 1, judged }).drinks, null, "not before verdictAt");
  /* everyone in the Cup is at the bar, the riders out too */
  assert.equal(screenOf({ room:{ ...room, out:[2] }, idx:2 }), "lastcall");
  assert.equal(screenOf({ room, idx:-1 }), "watch");
});
