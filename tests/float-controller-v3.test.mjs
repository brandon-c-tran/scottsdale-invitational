/* The phone, v3 (kayaks: the paddle is in the sprites, stroke and stroke-r alternate) (float/GROOVE.md "v3 (Oct 28 evening: playtest 2 of the
   Groove)"): who you are (your fixed seat on the round card, its words, your
   critter in it), practice's four-beat counter read from the bar's cues
   (never in play), the number's tone on the shared scale (the contract's
   until the chart has its own, then the chart's), Last Call's place among
   everyone at the bar, and you at the bar behind the counter. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as CHART from "../float/shared/chart.js";
import { seatsFor, seatWords } from "../float/shared/seats.js";
import { beatCounter, contractTones, lastCallPlace, numberTone, seatView, songView } from "../float/client/controller/controllerModel.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const h = React.createElement;
const { chartOf, cueTime } = CHART;

async function bundle(contents, name) {
  const out = await build({ stdin:{ contents, resolveDir:ROOT, loader:"jsx", sourcefile:`${name}.jsx` }, bundle:true, platform:"node",
    format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", jsx:"automatic" });
  const mod = new Module(fileURLToPath(new URL(`float-controller-v3-${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return mod.exports;
}

const room13 = (extra = {}) => ({ phase:"song", round:0, rounds:4, field:[...Array(13).keys()],
  entrants:Array.from({ length:13 }, (_, i) => ({ name:`R${i}`, color:`#00${String(i).padStart(2, "0")}aa` })), ...extra });

test("who you are: your seat in the field (the TV's layout, front row first), its words, your mark; none when you are not in it", () => {
  const room = room13();
  const seats = seatsFor(room.field);
  for (const i of room.field) {
    const view = seatView({ room, idx:i });
    assert.equal(view.words, seatWords(seats.get(i)), `rider ${i}: the seat's own words`);
    assert.deepEqual(view.rows.map(row => row.length), [4, 5, 4], "13: front 4, middle 5, back 4");
    const marked = view.rows.flat().filter(seat => seat.me);
    assert.deepEqual(marked.map(seat => seat.i), [i], "exactly one seat is yours");
    const { row, col } = seats.get(i);
    assert.equal(view.rows[row][col].i, i, "yours where seats.js puts it (row 0 the front)");
  }
  assert.equal(seatView({ room, idx:0 }).words, "Front row, 1st from the left");
  /* a cut closes the gaps without anyone passing a neighbour */
  const after = room13({ field:[0, 2, 3, 5, 8, 9, 11, 12, 1] });
  const v = seatView({ room:after, idx:5 });
  assert.deepEqual(v.rows.map(row => row.map(seat => seat.i)), [[0, 1, 2, 3, 5], [8, 9, 11, 12]], "9: the front takes the odd rider");
  assert.equal(seatView({ room:room13({ field:[1, 2, 3] }), idx:0 }), null, "out of the field: no seat");
  assert.equal(seatView({ room:room13({ field:[] }), idx:0 }), null, "no field yet: no map");
  assert.equal(seatView({ room, idx:-1 }), null);
});

test("practice's counter: the bar's beats with a tap lit (Hey! on 4 over the paddles), the host's demo beat his, the beat now; never in play", () => {
  const paddle = chartOf("paddle");
  const practice = paddle.sections.find(item => item.kind === "practice");
  const lit = beat => beatCounter(paddle, { moment:"practice", beat }).beats.filter(slot => slot.on).map(slot => slot.n);
  for (let beat = practice.from; beat < practice.to; beat += 4) {
    const bar = beatCounter(paddle, { moment:"practice", beat:beat + 0.2 });
    const want = new Set(CHART.cuesBetween(paddle, beat, beat + 4).filter(cue => !cue.scored).map(cue => Math.floor(cue.beat - beat) + 1));
    assert.deepEqual(new Set(lit(beat + 0.2)), want, `bar ${bar.bar}: lit from the bar's own cues`);
    assert.equal(bar.now, 0);
    assert.equal(beatCounter(paddle, { moment:"practice", beat:beat + 2.6 }).now, 2, "the beat now");
  }
  /* the strokes on 1 and 3 every bar of practice, marked as rowing (v3 item 10), not as a move */
  for (let beat = practice.from; beat < practice.to; beat += 4) {
    assert.ok([1, 3].every(n => lit(beat).includes(n)), "paddle on 1 and 3");
    const one = beatCounter(paddle, { moment:"practice", beat }).beats[0];
    assert.deepEqual([one.row, one.move, one.word], [true, null, "Row"]);
  }
  /* a bar with a Hey! says it on its beat, over the paddle */
  const hey = paddle.cues.find(cue => !cue.scored && cue.kind === "hey");
  if (hey) {
    const from = Math.floor(hey.beat / 4) * 4;
    const slot = beatCounter(paddle, { moment:"practice", beat:from }).beats[Math.floor(hey.beat - from)];
    assert.equal(slot.word, "Hey!");
    assert.equal(slot.move, "hey", "the move is its own mark");
    assert.equal(slot.demo, !!hey.demo, "the host's demo is marked his");
  }
  /* every song's practice has something lit; play, the card and the intro have no counter */
  for (const id of CHART.SONG_IDS) {
    const chart = chartOf(id);
    const p = chart.sections.find(item => item.kind === "practice");
    assert.ok(beatCounter(chart, { moment:"practice", beat:p.from + 4.1 }).beats.some(slot => slot.on), `${id}: practice lights its taps`);
  }
  for (const moment of ["card", "intro", "play", "breakdown", "outro", "after"]) assert.equal(beatCounter(paddle, { moment, beat:40 }), null, moment);
  /* songView agrees: practice's moment is practice */
  const songAt = 1_000_000;
  assert.equal(songView(paddle, songAt, cueTime(songAt, practice.from + 1)).moment, "practice");
});

test("the number's tone: the shared scale (songs gold, green, yellow, red; Last Call green, yellow, orange, red; a miss grey), the chart's when it has one", () => {
  /* the contract's thresholds */
  const song = contractTones.offset, count = contractTones.count;
  assert.deepEqual([0, 50, 51, 100, 101, 160, 161, 299].map(song), ["gold", "gold", "green", "green", "yellow", "yellow", "red", "red"]);
  assert.deepEqual([0, 100, 101, 300, 301, 700, 701, 3000].map(count), ["green", "green", "yellow", "yellow", "orange", "orange", "red", "red"]);
  /* the chart's own scale, once the engine ships it, must say the same */
  if (typeof CHART.offsetTone === "function") for (const ms of [0, 50, 51, 100, 101, 160, 161, 299]) assert.equal(CHART.offsetTone(ms), song(ms), `offsetTone(${ms})`);
  if (typeof CHART.countTone === "function") for (const ms of [0, 100, 101, 300, 301, 700, 701, 3000]) assert.equal(CHART.countTone(ms), count(ms), `countTone(${ms})`);
  /* signed offsets judge by distance; a miss is grey */
  assert.equal(numberTone("late", 30), "gold");
  assert.equal(numberTone("early", -90), "green");
  assert.equal(numberTone("ok", -140), "yellow");
  assert.equal(numberTone("late", 220), "red");
  assert.equal(numberTone("miss", null), "grey");
  assert.equal(numberTone("late", 730, { count:true }), "red");
  assert.equal(numberTone("late", 250, { count:true }), "yellow");
  assert.equal(numberTone("early", -600, { count:true }), "orange");
  assert.equal(numberTone("perfect", 20, { count:true }), "green");
});

test("Last Call's place: closest first among everyone at the bar, ties share; the room's word when it gives one", () => {
  const room = { lastCall:{ totals:[{ i:0, ms:730, d:730 }, { i:1, ms:20, d:-20 }, { i:2, ms:730, d:-730 }, { i:3, ms:3000, d:null }, { i:4, ms:150, d:150 }] } };
  assert.deepEqual(lastCallPlace({ room, idx:1 }), { place:1, of:5, text:"Closest of 5" });
  assert.deepEqual(lastCallPlace({ room, idx:4 }), { place:2, of:5, text:"2nd closest of 5" });
  assert.equal(lastCallPlace({ room, idx:0 }).text, "3rd closest of 5", "a tie shares the place");
  assert.equal(lastCallPlace({ room, idx:2 }).text, "3rd closest of 5");
  assert.equal(lastCallPlace({ room, idx:3 }).text, "Farthest of 5", "no tap: 3000, the far end");
  assert.equal(lastCallPlace({ room, idx:9 }), null, "not at the bar");
  assert.equal(lastCallPlace({ room:{}, idx:0 }), null);
  assert.equal(lastCallPlace({ room, me:{ lastCall:{ ms:730, d:730, place:4, of:9 } }, idx:0 }).text, "4th closest of 9", "the room's word first");
});

test("the screens: the round card maps your seat, practice counts 1 2 3 4, the pad wears your colour, Last Call ranks and you stand behind the counter", async () => {
  const { SongScreen, LastCall } = await bundle(`
    export { default as SongScreen } from "./float/client/controller/SongScreen.jsx";
    export { default as LastCall } from "./float/client/controller/LastCall.jsx";`, "screens");
  const paddle = chartOf("paddle");
  const songAt = 5_000_000;
  const entrant = { name:"Brandon", color:"#e4572e", look:{ critter:"capybara" } };
  const room = room13();
  const shape = { round:0, rounds:4, of:13, final:false, through:9 };
  const draw = (now, extra = {}) => renderToStaticMarkup(h(SongScreen, { serverNow:() => now, chart:paddle, songAt, entrant, shape, name:"Paddle Party",
    seats:seatView({ room, idx:6 }), onTap:() => {}, ...extra }));
  const card = draw(songAt - 1500);
  assert.match(card, /flc-seats/);
  assert.match(card, new RegExp(seatView({ room, idx:6 }).words));
  assert.equal((card.match(/flc-seat is-me/g) || []).length, 1, "one seat is yours");
  assert.equal((card.match(/class="flc-seat"/g) || []).length, 12, "the other twelve");
  assert.match(card, /flc-tint/, "the pad wears your colour");
  const practice = draw(cueTime(songAt, 12.2));
  assert.match(practice, /flc-counter/);
  assert.doesNotMatch(practice, /flc-seats/, "the map is the card's");
  assert.equal((practice.match(/flc-count is-on/g) || []).length >= 2, true);
  assert.match(practice, /flc-count is-on is-row/, "a stroke is marked as rowing");
  assert.match(practice, /flc-count-paddle/);
  /* the paddle is in the sprites: a paddle tap strokes (stroke-r falls back to stroke until the art has it), a miss flubs */
  assert.match(draw(cueTime(songAt, 40.2), { act:{ key:7, kind:"paddle", q:"nice", at:globalThis.performance.now() } }), /data-pose="stroke"/);
  assert.match(draw(cueTime(songAt, 40.2), { act:{ key:8, kind:"miss", q:"miss", at:globalThis.performance.now() } }), /data-pose="miss"/);
  const play = draw(cueTime(songAt, 40.2));
  assert.doesNotMatch(play, /flc-counter/, "never in play");
  /* the popup's number takes its tone */
  const popped = draw(cueTime(songAt, 40.2), { popup:{ key:1, q:"nice", d:80, at:globalThis.performance.now() } });
  assert.match(popped, /is-num-green/);
  /* Last Call: the reveal ranks you; the verdict stamps; you stand behind the counter */
  const bar = chartOf(CHART.lastCallId(0));
  const cd = bar.countdown;
  const lcRoom = { phase:"lastcall", round:0, songAt, entrants:room.entrants, lastCall:{ totals:[{ i:0, ms:730, d:730 }, { i:1, ms:20, d:20 }, { i:2, ms:90, d:-90 }], worst:null } };
  const lc = (now, r = lcRoom) => renderToStaticMarkup(h(LastCall, { serverNow:() => now, room:r, idx:0, chart:bar, songAt, entrant,
    judged:{ 0:{ q:"late", d:730 } }, onTap:() => {} }));
  const reveal = lc(songAt + cd.revealAt + 10);
  assert.match(reveal, /Farthest of 3/);
  assert.match(reveal, /is-num-red/, "730 ms off is red on Last Call's scale");
  assert.match(reveal, /flc-barseat/, "behind the counter, not in a tube on the floor");
  assert.doesNotMatch(reveal, /You drink|Safe/);
  const verdict = lc(songAt + cd.verdictAt + 10, { ...lcRoom, lastCall:{ ...lcRoom.lastCall, worst:[0] } });
  assert.match(verdict, /You drink/);
  assert.ok(verdict.indexOf("Farthest of 3") < verdict.indexOf("You drink"), "the offset, your place, then the verdict");
});

test("rowing: your paddle taps alternate stroke and stroke-r, a miss is miss; stroke-r is stroke until the art has it", async () => {
  const { strokeStep, poseFor } = await bundle(`
    export { strokeStep } from "./float/client/controller/SongScreen.jsx";
    export { poseFor } from "./float/client/controller/art.jsx";`, "rowing");
  const memo = { key:null, n:0, stroke:null };
  const sides = [1, 2, 3, 4].map(k => strokeStep(memo, { key:k, kind:"paddle" }).side);
  assert.deepEqual(sides, ["left", "right", "left", "right"], "stroke, stroke-r, stroke, stroke-r");
  assert.equal(strokeStep(memo, { key:4, kind:"paddle" }).side, "right", "the same act is the same stroke");
  assert.equal(strokeStep(memo, { key:5, kind:"miss" }).flub, true);
  assert.equal(strokeStep(memo, { key:6, kind:"hey" }), null);
  assert.equal(strokeStep(memo, { key:7, kind:"paddle" }).side, "left");
  const withArt = { critters:{ capybara:{ poses:{ stroke:{}, "stroke-r":{} } } } };
  assert.equal(poseFor(withArt, "capybara", "stroke-r"), "stroke-r");
  assert.equal(poseFor({ critters:{ capybara:{ poses:{ stroke:{} } } } }, "capybara", "stroke-r"), "stroke", "falls back until the art lands");
  assert.equal(poseFor(withArt, "capybara", "wave"), "idle");
});

test("wave B: rockets call Launch, blackout bars show no calls (the pad still judges), five rounds, Fireworks the final", async () => {
  const { CALL_WORDS, darkAt, pendingCalls, roundSong, roundShape } = await import("../float/client/controller/controllerModel.js");
  const { padTap, createPad } = await import("../float/client/controller/rhythm.js");
  const fw = chartOf("fireworks");
  assert.equal(CALL_WORDS.rocket, "Launch");
  const rocket = fw.cues.find(cue => cue.kind === "rocket" && cue.scored && !darkAt(fw, cue.call));
  assert.deepEqual(pendingCalls(fw, rocket.call + 0.1).map(call => call.word), ["Launch"]);
  assert.ok(fw.dark.length > 0, "Fireworks has its blackout bars");
  const darkBar = fw.dark[0];
  for (let beat = darkBar * 4; beat < darkBar * 4 + 4; beat += 0.25) assert.deepEqual(pendingCalls(fw, beat), [], `no calls at ${beat}`);
  const inDark = fw.cues.find(cue => cue.scored && Math.floor(cue.beat / 4) === darkBar);
  const songAt = 2_000_000;
  const tap = padTap(createPad(), cueTime(songAt, inDark.beat, fw.beatMs) + 10, { chart:fw, songAt });
  assert.equal(tap.found?.c, inDark.id, "the pad judges in the dark");
  assert.deepEqual(roundSong({ round:4, rounds:5 }), { id:"fireworks", name:"Fireworks" });
  assert.equal(roundShape({ round:4, rounds:5, field:[0, 1, 2] }).final, true);
  assert.equal(roundShape({ round:3, rounds:5, field:[0, 1, 2, 3, 4], cut:3 }).final, false);
  const { SongScreen } = await bundle(`export { default as SongScreen } from "./float/client/controller/SongScreen.jsx";`, "waveb");
  const entrant = { name:"B", color:"#3355ff", look:{ critter:"capybara" } };
  const shape = { round:4, rounds:5, of:3, final:true, through:null };
  const card = renderToStaticMarkup(h(SongScreen, { serverNow:() => songAt - 1000, chart:fw, songAt, entrant, shape, name:"Fireworks", onTap:() => {} }));
  assert.match(card, />Final</);
  assert.match(card, />Fireworks</);
  assert.match(card, /data-scene="night"/);
  const dark = renderToStaticMarkup(h(SongScreen, { serverNow:() => cueTime(songAt, darkBar * 4 + 1.2, fw.beatMs), chart:fw, songAt, entrant, shape,
    name:"Fireworks", onTap:() => {} }));
  assert.match(dark, /flc-song is-play[^"]*is-dark/);
  assert.doesNotMatch(dark, /flc-call is-on/);
  const launched = renderToStaticMarkup(h(SongScreen, { serverNow:() => cueTime(songAt, 40, fw.beatMs), chart:fw, songAt, entrant, shape, name:"Fireworks",
    act:{ key:3, kind:"rocket", q:"perfect", at:globalThis.performance.now() }, onTap:() => {} }));
  assert.match(launched, /flc-burst is-perfect/, "a launch bursts in your colour");
});
