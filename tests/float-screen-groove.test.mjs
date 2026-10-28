/* Float's TV screen, the Groove version (float/GROOVE.md "The screen (TV)
   and the phone"): the flotilla's layout for every field size (rows, the
   shared grid, x by score, nobody off screen, nobody on top of a row-mate),
   the popups' slots and timing, the moves, the song's words and the host's
   calls, the cut, the store's reading of the room's messages, both stand-in
   rooms, and a few moments rendered with React's server renderer. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { POPUP_MS, SONG_LEAD_MS, chartOf, popupOf } from "../float/shared/chart.js";
import { BEAT_MS } from "../float/shared/beat.js";
import {
  BOX, CROWD, MIN_GAP, PODIUM, POPUP_BOX, STAGE_W, crowdLayout, driftOf, fieldOrder, flotillaLayout, podiumLayout, popupSize, popupSlots,
  riderWidth, rowCounts, rowOrder, rowsFor, rowSlots, spreadRow,
} from "../float/client/screen/model/flotilla.js";
import { ACTIONS, PLEASED_MS, actionAt, bobAt, cheerAt, chugAt, follow, popupAt } from "../float/client/screen/model/motion.js";
import { bannerAt, chartFor, chuggingAt, hostAt, hostCalls, roundLabel, sceneFor, sceneMode, signAt, songStart } from "../float/client/screen/model/song.js";
import { cutField, cutOuts, cutRanking, cutRankingOf, cutTimeline, pctText } from "../float/client/screen/model/cut.js";
import { createScreenStore } from "../float/client/screen/model/store.js";
import { scriptCup, seenOf } from "../float/client/screen/mock/script.js";
import { MOCK_SHOTS, SHOTS, mockRider, mockSkills, shotTime } from "../float/client/screen/mock/shared.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const range = n => Array.from({ length:n }, (_, i) => i);
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

/* ── the layout ── */

test("rows: 1 to 4 ride in one, 5 to 10 in two, 11 to 16 in three; 13 is 4, 5, 4; every field fits", () => {
  for (let n = 0; n <= 16; n += 1) {
    const rows = rowCounts(n);
    assert.equal(rows.reduce((sum, k) => sum + k, 0), n, `${n} riders all seated`);
    assert.equal(rows.length, n === 0 ? 0 : n <= 4 ? 1 : n <= 10 ? 2 : 3, `${n}: rows`);
  }
  assert.deepEqual(rowCounts(13), [4, 5, 4]);
  assert.deepEqual(rowCounts(9), [4, 5]);
  assert.deepEqual(rowCounts(6), [3, 3]);
  assert.deepEqual(rowCounts(3), [3]);
  /* three rows: the middle one differs from both by an odd count, so each sits in the others' gaps */
  for (let n = 11; n <= 16; n += 1) {
    const [a, b, c] = rowCounts(n);
    assert.ok((b - a) % 2 !== 0 && (c - b) % 2 !== 0, `${n}: ${a}/${b}/${c} alternate`);
  }
});

test("the flotilla: every rider of every field size on the stage, never closer to a row-mate than the gap, rows interleaved", () => {
  for (let n = 1; n <= 16; n += 1) {
    const order = range(n);
    for (const lives of [new Map(), new Map(order.map(i => [i, (i * 37) % 100])), new Map(order.map(i => [i, i % 2 ? 100 : 0]))]) {
      const spots = flotillaLayout(order, lives);
      assert.equal(Object.keys(spots).length, n, `${n}: everyone placed`);
      const byRow = new Map();
      for (const [i, spot] of Object.entries(spots)) {
        const half = riderWidth(spot.scale) / 2;
        assert.ok(spot.x - half >= 0 && spot.x + half <= STAGE_W, `${n}: rider ${i} on the stage (${Math.round(spot.x)})`);
        assert.ok(spot.y > 432 && spot.y < 1080, `${n}: rider ${i} on the water`);
        if (!byRow.has(spot.row)) byRow.set(spot.row, []);
        byRow.get(spot.row).push(spot);
      }
      for (const row of byRow.values()) {
        const xs = row.map(s => s.x).sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k += 1) assert.ok(xs[k] - xs[k - 1] >= riderWidth(row[0].scale) * MIN_GAP - 0.5, `${n}: a row keeps its gap`);
      }
    }
  }
  /* 13 at rest: one centre, one spacing, the middle row exactly in the others' gaps */
  const rows = rowsFor(range(13));
  const slots = rows.map(rowSlots);
  assert.equal(new Set(rows.map(r => Math.round(r.spacing))).size, 1, "one spacing");
  for (const j of [0, 1, 2, 3]) {
    const gap = (slots[1][j] + slots[1][j + 1]) / 2;
    assert.ok(Math.abs(gap - slots[0][j]) < 1 && Math.abs(gap - slots[2][j]) < 1, `the back and front rows sit in the middle row's gaps (${j})`);
  }
  /* the final three: big, in one row */
  const final = flotillaLayout([4, 7, 9], new Map(), { kind:"final" });
  assert.equal(new Set(Object.values(final).map(s => s.y)).size, 1);
  assert.ok(Object.values(final).every(s => s.scale >= 0.85), "big");
  /* the front row takes the top of the order */
  const field = rowsFor(range(13));
  assert.deepEqual(field[field.length - 1].members, [0, 1, 2, 3]);
});

test("x by score: the leaders take a row's right (downstream), a rider passes only when clearly ahead, the drift is clamped", () => {
  const order = range(13);
  const lives = new Map(order.map(i => [i, 60 + i * 3]));
  const orders = new Map();
  const spots = flotillaLayout(order, lives, { orders });
  const front = Object.entries(spots).filter(([, s]) => s.row === 2).sort((a, b) => a[1].x - b[1].x).map(([i]) => Number(i));
  assert.deepEqual(front, [0, 1, 2, 3], "low to high, left to right");
  /* a level row keeps its order; a small lead does not reshuffle it */
  assert.deepEqual(rowOrder([0, 1, 2], i => [80, 81, 82][i], { prev:[2, 1, 0] }), [2, 1, 0]);
  assert.deepEqual(rowOrder([0, 1, 2], i => [80, 90, 82][i], { prev:[2, 1, 0] }), [2, 0, 1]);
  assert.equal(driftOf(100, 50, { max:30 }), 30);
  assert.equal(driftOf(0, 50, { max:30 }), -30);
  assert.equal(driftOf(null, 50), 0);
  assert.deepEqual(fieldOrder([3, 1, 2], i => ({ 1:10, 2:50, 3:10 })[i]), [2, 1, 3], "by Cup total, then index");
  const spread = spreadRow([500, 505, 510], 100, 0, 1920);
  assert.ok(spread[1] - spread[0] >= 99.5 && spread[2] - spread[1] >= 99.5, "a pile spreads apart");
  assert.ok(spreadRow([0, 10], 100, 50, 1000).every(x => x >= 50), "kept inside");
});

test("the crowd stands on the far bank, the podium's three on their blocks", () => {
  const crowd = crowdLayout([3, 8, 1, 12]);
  const xs = [3, 8, 1, 12].map(i => crowd[i].x);
  assert.ok(xs.every((x, k) => k === 0 || x > xs[k - 1]), "left to right in elimination order");
  assert.ok(Object.values(crowd).every(s => s.y >= CROWD.y && s.y < CROWD.y + 10 && s.x >= CROWD.lo && s.x <= CROWD.hi));
  const many = crowdLayout(range(13));
  assert.ok(Object.values(many).every(s => s.x - riderWidth(s.scale) / 2 >= CROWD.lo - 1 && s.x + riderWidth(s.scale) / 2 <= CROWD.hi + 1));
  const podium = podiumLayout([5, 2, 9]);
  assert.deepEqual([podium[5].place, podium[2].place, podium[9].place], [1, 2, 3]);
  assert.ok(podium[5].y < podium[2].y && podium[2].y < podium[9].y, "1st stands highest");
  assert.equal(PODIUM.length, 3);
});

test("popup slots: a whole field's popups (all at once on a cue) never cover each other, stay over their riders and on the stage", () => {
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  for (const n of [3, 6, 9, 13, 16]) {
    const order = range(n);
    const spots = flotillaLayout(order, new Map(order.map(i => [i, 70 + (i * 13) % 30])));
    const riders = Object.entries(spots).map(([i, s]) => ({ i:Number(i), x:s.x, y:s.y, scale:s.scale, top:s.y - 240 * s.scale * 1.45 }));
    const slots = popupSlots(riders);
    const rects = riders.map(r => {
      const slot = slots[r.i], w = POPUP_BOX.w * slot.size, h = POPUP_BOX.h * slot.size;
      return { i:r.i, r, slot, x0:slot.x - w / 2, x1:slot.x + w / 2, y0:slot.y - h, y1:slot.y };
    });
    for (const a of rects) {
      assert.ok(a.x0 >= 0 && a.x1 <= STAGE_W && a.y0 >= 0, `${n}: popup ${a.i} on the stage`);
      assert.ok(Math.abs(a.slot.x - a.r.x) <= POPUP_BOX.w * a.slot.size * 0.55, `${n}: popup ${a.i} over its rider`);
      assert.ok(a.slot.y <= a.r.top + 40, `${n}: popup ${a.i} above the head`);
      for (const b of rects) if (b.i > a.i) assert.ok(overlap(a, b) < 0.08 * (a.x1 - a.x0) * (a.y1 - a.y0), `${n}: popups ${a.i} and ${b.i} apart`);
    }
  }
  assert.ok(popupSize(0.42) < popupSize(0.6) && popupSize(0.6) <= popupSize(0.9), "the back rows' a little smaller");
});

/* ── the moves and the popup ── */

test("the popup: the latest judgement for POPUP_MS from its stamp, fading at its end; nothing before or after", () => {
  const hit = { at:10_000, q:"late", d:30 };
  assert.equal(popupAt(hit, 9_999), null);
  assert.ok(popupAt(hit, 10_000));
  assert.equal(popupAt(hit, 10_000 + POPUP_MS - 1).opacity < 0.1, true, "faded by its end");
  assert.equal(popupAt(hit, 10_000 + POPUP_MS), null);
  assert.equal(popupAt(hit, 10_300).opacity, 1);
  assert.deepEqual(popupOf("late", 30), { num:"+0.03", word:"Late", tone:"salmon" });
  assert.deepEqual(popupOf("miss"), { num:null, word:"Miss", tone:"grey" });
});

test("a hit's move by its cue: stroke, hey, a hop that leaves the water, a spin that turns the critter round, the drop; a miss flubs", () => {
  const at = 5000;
  assert.equal(actionAt({ at, q:"perfect", kind:"paddle" }, at + 100).pose, "stroke");
  assert.equal(actionAt({ at, q:"ok", kind:"hey" }, at + 100).pose, "hey");
  assert.ok(actionAt({ at, q:"ok", kind:"hop" }, at + ACTIONS.hop.ms * 0.4).dy < -40, "a hop goes up");
  assert.ok(actionAt({ at, q:"ok", kind:"spin" }, at + ACTIONS.spin.ms * 0.2).sx < 0, "a spin turns round (fast, then settles)");
  assert.ok(actionAt({ at, q:"ok", kind:"spin" }, at + ACTIONS.spin.ms * 0.9).sx > 0.9, "and faces front again");
  assert.ok(actionAt({ at, q:"ok", kind:"drop" }, at + ACTIONS.drop.ms * 0.45).dy > 60, "over the falls");
  assert.equal(actionAt({ at, q:"miss", kind:"hop" }, at + 50).pose, "miss", "a miss is the flub whatever the cue");
  assert.equal(actionAt({ at, q:"perfect", kind:"paddle" }, at + ACTIONS.paddle.ms + 10).pose, "nice", "pleased after a good one");
  assert.equal(actionAt({ at, q:"perfect", kind:"paddle" }, at + PLEASED_MS + 1), null);
  assert.equal(actionAt({ at, q:"ok", kind:"paddle" }, at + ACTIONS.paddle.ms + 1), null, "an OK is not pleased");
  assert.ok(Math.abs(actionAt({ at, q:"late", kind:"paddle" }, at + 160).rot) > Math.abs(actionAt({ at, q:"perfect", kind:"paddle" }, at + 160).rot), "off the beat stumbles");
  assert.equal(chugAt(3.1).pose, "chug");
  assert.equal(cheerAt(1000, 1200).pose, "cheer");
  assert.equal(cheerAt(1000, 5000), null);
  const bob = bobAt(4);
  assert.ok(bob.sy < 1 && bob.sx > 1, "squashed on the beat");
  assert.ok(bobAt(4.5).dy < bobAt(4).dy, "up between beats");
  assert.equal(Math.round(follow(0, 100, 260, 260)), 63);
});

/* ── the song ── */

test("the song's words: the round card through the lead, Practice, Go! at each play, a big Drink!; the scene for each phase", () => {
  const chart = chartOf("paddle");
  assert.deepEqual([bannerAt(chart, -5).kind, bannerAt(chart, -5).text, bannerAt(chart, -5).sub], ["card", "Round 1", "Paddle Party"]);
  assert.equal(bannerAt(chart, 2, { round:3, rounds:4 }).text, "Final");
  assert.equal(bannerAt(chart, 5), null, "the count-in: the music's");
  assert.equal(bannerAt(chart, 12).kind, "practice");
  assert.equal(bannerAt(chart, 24.2).text, "Go!");
  assert.equal(bannerAt(chart, 88.5).text, "Go!", "the beat back after the drink");
  assert.equal(bannerAt(chart, 57).text, "Drink!");
  assert.equal(bannerAt(chart, 70), null, "no Drinking label: the chug says it");
  assert.equal(roundLabel(1, 4), "Round 2");
  assert.equal(sceneFor("lobby"), "lobby");
  assert.equal(sceneFor("song", chartOf("rock")), "rocks");
  assert.equal(sceneFor("song", chartOf("spin")), "whirlpool");
  assert.equal(sceneFor("cut", chartOf("drop")), "falls");
  assert.equal(sceneFor("podium"), "podium");
  assert.equal(sceneFor("feedback"), "podium");
  assert.equal(sceneFor("intro"), "open");
  assert.deepEqual(sceneMode(chartOf("drop"), 29 * 4 + 1), { section:"play", mode:"drop" });
});

test("the host calls every cue on its beat (Ready, Ba, Spin; The Drop counts 3, 2, 1) and holds The Drop's sign a bar before each switch", () => {
  const paddle = chartOf("paddle");
  const hey = paddle.cues.find(c => c.kind === "hey");
  assert.deepEqual(hostAt(paddle, hey.call + 0.1).call.word, "Ready");
  assert.equal(hostAt(paddle, hey.call + 0.1).pose, "call");
  assert.equal(hostAt(paddle, hey.call - 0.1).pose, "idle");
  assert.equal(hostAt(paddle, 130).pose, "cheer", "the song's end");
  assert.ok(hostCalls(paddle).every(c => c.kind === "hey"), "a paddle's call is the pulse");
  assert.ok(hostCalls(chartOf("rock")).every(c => c.word === "Ba"));
  assert.ok(hostCalls(chartOf("spin")).every(c => c.word === "Spin"));
  const drop = chartOf("drop");
  const countdown = hostCalls(drop).filter(c => c.kind === "drop").map(c => c.word);
  assert.deepEqual(countdown, ["3", "2", "1"]);
  const signs = [];
  for (let bar = 0; bar < drop.bars; bar += 1) { const s = signAt(drop, bar * 4 + 1); if (s) signs.push([bar, s.mode]); }
  assert.ok(signs.length >= 6, "a sign before each switch");
  for (const [bar, mode] of signs) assert.equal(drop.modes[bar + 1], mode);
  assert.equal(signAt(paddle, 9), null, "only The Drop");
});

test("the drink break: a rider chugs from its first beat until they tap Done, on into the second half if they don't", () => {
  const chart = chartOf("paddle");
  const songAt = 100_000;
  const from = songAt + 56 * BEAT_MS;
  assert.equal(chuggingAt(chart, songAt, from - 1, null), false);
  assert.equal(chuggingAt(chart, songAt, from + 1000, null), true);
  assert.equal(chuggingAt(chart, songAt, from + 9000, from + 8000), false, "done");
  assert.equal(chuggingAt(chart, songAt, songAt + 92 * BEAT_MS, null), true, "still at it after the beat comes back");
  assert.equal(chuggingAt(chart, songAt, from + 1000, songAt), false, "a rider who doesn't drink");
});

/* ── the cut ── */

test("the cut: the room's ranking with its outs, stamped from the last place up, then the hops; squeezed into a short cut", () => {
  const room = { phase:"cut", round:0, field:[0, 2, 3], out:[1, 4],
    results:[{ i:2, place:1, pct:98 }, { i:0, place:2, pct:91 }, { i:3, place:3, pct:88 }, { i:4, place:4, pct:70, out:true }, { i:1, place:5, pct:61, out:true }],
    history:[{ round:0, field:[0, 1, 2, 3, 4], out:[4, 1] }], scores:[] };
  const ranking = cutRankingOf(room);
  assert.deepEqual(ranking.map(r => r.i), [2, 0, 3, 4, 1]);
  assert.deepEqual(cutOuts(ranking), [1, 4], "the last place first");
  assert.deepEqual(cutField(room), [0, 1, 2, 3, 4], "the field that played, from the room's record");
  const fallback = cutRanking([{ i:0, pct:50, cup:0 }, { i:1, pct:80, cup:0 }, { i:2, pct:50, cup:10 }], { out:[0] });
  assert.deepEqual(fallback.map(r => [r.i, r.out]), [[1, false], [2, false], [0, true]], "ties by the Cup");
  const t = cutTimeline(4, 20000);
  assert.ok(t.stampAt(0) < t.stampAt(3) && t.stampAt(3) < t.boardOut && t.boardOut < t.hopAt(0) && t.hopAt(3) < t.reform && t.reform < t.next);
  assert.ok(t.next < 20000 - 3000, "the next song's card has time");
  const short = cutTimeline(4, 7000);
  assert.ok(short.next < 7000, "a short cut fits");
  /* each Out on its sting: the sound's drumroll hit, then one a gap */
  const sound = { roll:500, reveal:2500, gap:500 };
  assert.deepEqual([0, 1, 2, 3].map(cutTimeline(4, 20000, sound).stampAt), [2500, 3000, 3500, 4000]);
  assert.deepEqual([0, 1].map(cutTimeline(4, 12000, sound).stampAt), [2500, 3000], "the same beats in the short cut");
  assert.ok(cutTimeline(4, 12000, sound).next <= 12000 - 3000, "the next card stands three seconds before Last Call");
  assert.equal(pctText(97.36), "97.4%");
  assert.equal(pctText(100), "100%");
});

/* ── Last Call ── */

test("Last Call: the glass waits at the bartender, steps down the bar on each slide, reaches the end on the grab, then waits for the next", async () => {
  const { BARTENDER, COUNTER, barLayout, barPlayersOf, bartenderPose, drinkersOf, glassAt, readoutUntil, totalText } = await import("../float/client/screen/model/lastcall.js");
  const chart = chartOf("lastcall");
  assert.equal(chart.scene, "bar");
  assert.equal(sceneFor("lastcall", chart), "bar");
  const [one, two, three] = chart.cues;
  assert.deepEqual(glassAt(chart, 1).x, COUNTER.from, "waiting at the bartender's hand");
  assert.ok(glassAt(chart, 1).visible);
  const steps = [one.slides[0] + 0.5, one.slides[1] + 0.5, one.slides[2] + 0.5, one.beat + 0.3].map(b => glassAt(chart, b).x);
  assert.ok(steps.every((x, k) => k === 0 || x > steps[k - 1]), "each slide a step down the bar");
  assert.equal(Math.round(glassAt(chart, one.beat + 0.4).x), COUNTER.to, "the end on the grab");
  assert.equal(glassAt(chart, one.beat + 0.8).visible, true, "back at the bartender for the next");
  assert.equal(glassAt(chart, one.beat + 0.8).x, COUNTER.from);
  assert.equal(glassAt(chart, three.beat + 1).visible, false, "gone after the last");
  assert.equal(readoutUntil(chart, one.id), two.slides[0], "a grab's readouts stay up until the next slides");
  assert.equal(readoutUntil(chart, three.id), chart.bars * 4);
  assert.equal(bartenderPose(chart, one.slides[1] + 0.1), "slide");
  assert.equal(bartenderPose(chart, 2), "idle");
  assert.equal(bartenderPose(chart, 30, { revealed:true }), "cheer");
  const seats = barLayout(range(13));
  assert.equal(Object.keys(seats).length, 13);
  assert.ok(Object.values(seats).every(s => s.x > 0 && s.x < STAGE_W && s.y > COUNTER.y), "everyone in front of the counter");
  assert.ok(BARTENDER.x < COUNTER.from);
  assert.deepEqual(barPlayersOf({ field:[2, 5], out:[1, 7] }), [2, 5, 7, 1], "the field, then the riders out, the last out first");
  assert.equal(drinkersOf({ totals:[], worst:null }), null);
  assert.deepEqual(drinkersOf({ totals:[], worst:[3] }), [3]);
  assert.equal(totalText(1234), "1.23");
});

/* ── the store ── */

test("the store: the chart by id, beat 0, one judgement a cue (the first), live scores between the room's, Done, cheers", () => {
  let now = 1_000_000;
  const store = createScreenStore();
  store.attach({ on:() => () => {}, serverNow:() => now, status:() => "open" });
  const startAt = now;
  store.onRoom({ t:"room", s:now, phase:"song", round:0, rounds:4, song:"paddle", chartId:"paddle", startAt, field:[0, 1],
    scores:[{ i:0, pts:0, pct:0, live:0, n:0, cup:0, done:false }] });
  assert.equal(store.state.chart.id, "paddle", "the shared chart by id");
  assert.equal(store.state.songAt, startAt + SONG_LEAD_MS, "beat 0 from the lead");
  assert.equal(songStart({ songAt:5 }), 5);
  const cue = store.state.chart.cues.find(c => c.scored);
  now += 30_000;
  store.onEv({ t:"ev", s:now, e:"hit", i:0, c:cue.id, q:"perfect", d:4 });
  store.onEv({ t:"ev", s:now + 10, e:"hit", i:0, c:cue.id, q:"miss" });
  assert.equal(store.state.last.get(0).q, "perfect", "the first judgement stands");
  assert.equal(store.liveOf(0), 100);
  const next = store.state.chart.cues.find(c => c.scored && c.id > cue.id);
  now += 500;
  store.onEv({ t:"ev", s:now, e:"hit", i:0, c:next.id, q:"ok", d:-120 });
  assert.equal(store.liveOf(0), 70, "(100 + 40) / 2");
  assert.equal(store.state.last.get(0).kind, next.kind);
  now += 100;
  store.onRoom({ t:"room", s:now, phase:"song", round:0, rounds:4, song:"paddle", chartId:"paddle", startAt, field:[0, 1],
    scores:[{ i:0, pts:140, pct:3, live:70, n:2, cup:0, done:false }, { i:1, pts:300, pct:6, live:100, n:3, cup:0, done:true }] });
  assert.equal(store.liveOf(1), 100, "a rider the screen saw no hits for: the room's word");
  assert.ok(store.state.done.has(1), "Done from the scores");
  now += 100;
  store.onEv({ t:"ev", s:now, e:"done", i:0 });
  assert.ok(store.state.done.has(0), "Done from the event");
  now += 100;
  store.onEv({ t:"ev", s:now, e:"cheer", i:5 });
  assert.equal(store.state.cheers.get(5), now);
  store.onEv({ t:"ev", s:now + 5000, e:"cheer", i:6 });
  assert.equal(store.state.cheers.get(6), now, "a stamp ahead of the clock counts as now");
  now += 100;
  store.onRoom({ t:"room", s:now, phase:"song", round:1, rounds:4, song:"rock", chartId:"rock", startAt:now, field:[0] });
  assert.equal(store.state.last.size, 0, "a new song starts clean");
  assert.equal(chartFor({ chartId:"spin" }).id, "spin");
});

/* ── the stand-in rooms ── */

test("the scripted Cup speaks the contract: phases in order, hits with a quality and an offset (a miss has none), scores rows, 13 to 9 to 6 to 3", () => {
  const skills = mockSkills(13, 3);
  const riders = range(13).map(k => ({ ...mockRider(k), device:`p${k}`, skill:skills[k] }));
  const { msgs, marks, rounds } = scriptCup({ riders, startAt:1_000_000, seed:3 });
  assert.equal(rounds, 4);
  const phases = msgs.filter(m => m.msg.t === "room").map(m => m.msg.phase).filter((p, k, all) => p !== all[k - 1]);
  assert.deepEqual(phases, ["intro", "song", "cut", "song", "cut", "song", "cut", "song", "cut", "podium", "feedback", "lobby"]);
  for (let k = 1; k < msgs.length; k += 1) assert.ok(msgs[k].s >= msgs[k - 1].s, "in time order");
  const hits = msgs.filter(m => m.msg.t === "ev" && m.msg.e === "hit").map(m => m.msg);
  assert.ok(hits.length > 1000);
  for (const hit of hits) {
    assert.ok(["perfect", "nice", "ok", "early", "late", "miss"].includes(hit.q));
    assert.equal(hit.q === "miss", hit.d === undefined, "a miss has no offset");
  }
  const fields = msgs.filter(m => m.msg.t === "room" && m.msg.phase === "song").map(m => m.msg.field.length).filter((n, k, all) => n !== all[k - 1]);
  assert.deepEqual(fields, [13, 9, 6, 3]);
  const row = msgs.find(m => m.msg.t === "room" && m.msg.phase === "song" && m.msg.scores?.length).msg.scores[0];
  assert.deepEqual(Object.keys(row).sort(), ["cup", "done", "i", "live", "n", "pct", "pts"]);
  /* (the scripted Cup has no Last Call; the real room's does) */
  for (const shot of MOCK_SHOTS) if (!SHOTS[shot].lobby && SHOTS[shot].phase !== "lastcall")
    assert.ok(Number.isFinite(shotTime(shot, seenOf(marks), rounds)), `${shot} has a moment`);
});

test("the real room in the tab: a shot runs the engine to its moment and the screen gets the room, the chart and the hits", async () => {
  const { connectRoom } = await import("../float/client/screen/mock/room.js");
  const net = connectRoom({ room:"bcdf", options:{ shot:"play", freeze:"1" } });
  const got = [];
  for (const t of ["welcome", "room", "ev"]) net.on(t, msg => got.push(msg));
  await net.ready;
  await new Promise(resolve => setTimeout(resolve, 30));
  const rooms = got.filter(m => m.t === "room");
  assert.ok(rooms.length > 0 && got[0].t === "welcome");
  const last = rooms[rooms.length - 1];
  assert.equal(last.phase, "song");
  assert.equal(last.song, "paddle");
  assert.ok(rooms.some(m => m.chart?.id === "paddle"), "the chart in full once");
  assert.ok(Math.abs((net.serverNow() - last.songAt) / BEAT_MS - SHOTS.play.beat) < 0.01, "at the moment");
  assert.ok(got.some(m => m.t === "ev" && m.e === "hit"), "the hits in flight");
  assert.ok(last.offset > 20, "calibrated on the people's late taps");
  net.close();
});

/* ── a few moments, rendered ── */

const bundle = await build({
  stdin:{ contents:`export { default as FloatScreen } from "./float/client/screen/FloatScreen.jsx";
    export { CutBoard, SongBanner, PodiumBlocks, IntroTitle, Feedback, LastCallBanner } from "./float/client/screen/hud/Hud.jsx";
    export { default as Lobby } from "./float/client/screen/hud/Lobby.jsx";
    export { default as Scene } from "./float/client/screen/stage/Scene.jsx";
    export { default as Cast } from "./float/client/screen/stage/Cast.jsx";
    export { default as Host } from "./float/client/screen/stage/Host.jsx";
    export { PlaceholderCritter, Critter } from "./float/client/screen/art.jsx";`, resolveDir:ROOT, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent",
});
const ui = new Module(fileURLToPath(new URL("float-screen-groove.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(ROOT);
ui._compile(bundle.outputFiles[0].text, ui.filename);
const { FloatScreen, CutBoard, SongBanner, PodiumBlocks, IntroTitle, Feedback, Lobby, Scene, Cast, Host, PlaceholderCritter } = ui.exports;
const html = element => renderToStaticMarkup(element);
const fakeDriver = now => ({ add:() => () => {}, serverNow:() => now, tick() {} });
const entrants = range(13).map(k => ({ ...mockRider(k), device:`p${k}`, ready:k % 2 === 0 }));

test("the screen renders in node with its real props (no window at module scope), on the fixed 1920 x 1080 stage", () => {
  const markup = html(React.createElement(FloatScreen, { room:"bcdf", hosting:true, joinUrl:"https://x/float/play?room=bcdf" }));
  assert.match(markup, /class="fs-root"/);
  assert.match(markup, /class="fs-stage"/);
  assert.doesNotMatch(markup, /<canvas/, "no WebGL");
});

test("rendered: the round card and the song's shouts, the cut board with its line and stamps, the podium, the lobby's code and controls", () => {
  const chart = chartOf("paddle");
  const songAt = 1_000_000;
  const storeAt = beat => ({ state:{ chart, songAt, songField:range(13), phaseStart:songAt - SONG_LEAD_MS }, serverNow:() => songAt + beat * BEAT_MS });
  const banner = beat => html(React.createElement(SongBanner, { store:storeAt(beat), driver:fakeDriver(songAt + beat * BEAT_MS), room:{ round:0, rounds:4 } }));
  assert.match(banner(-2), /Round 1[\s\S]*Paddle Party/);
  assert.match(banner(12), /Practice/);
  assert.match(banner(24.3), /Go!/);
  assert.match(banner(57), /Drink!/);
  const cutStart = 2_000_000;
  const room = { phase:"cut", round:0, rounds:4, drinking:false, startAt:cutStart, endsAt:cutStart + 20000, song:"paddle", field:range(9), out:[9, 10, 11, 12], cut:9, lastRound:false,
    results:range(13).map(i => ({ i, place:i + 1, pct:99 - i * 2.5, out:i >= 9 })), history:[{ round:0, song:"paddle", field:range(13), out:[12, 11, 10, 9] }] };
  const board = at => html(React.createElement(CutBoard, { store:{ state:{ songField:range(13), phaseStart:cutStart } }, driver:fakeDriver(cutStart + at), room, entrants }));
  const early = board(1000);
  assert.match(early, /Round 1/);
  assert.match(early, /Paddle Party/);
  assert.match(early, /99\.0%/);
  assert.match(early, /hd-cutline/);
  assert.doesNotMatch(early, /hd-stamp/, "no stamps yet");
  assert.equal((board(6200).match(/hd-stamp/g) || []).length, 4, "four out");
  assert.match(board(15000), /Next[\s\S]*Round 2[\s\S]*Rock Hop[\s\S]*9 riders/);
  const podium = html(React.createElement(PodiumBlocks, { store:{ state:{} }, driver:fakeDriver(5_000_000 + 5000), room:{ startAt:5_000_000, podium:[0, 4, 7] }, entrants }));
  assert.match(podium, /1st[\s\S]*Brandon/);
  assert.match(podium, /hd-confetti/);
  const intro = html(React.createElement(IntroTitle, { room:{ field:range(13), rounds:4 } }));
  assert.match(intro, /Float/);
  assert.doesNotMatch(intro, /·/, "no A · B line");
  assert.match(html(React.createElement(Feedback)), /Check your phone/);
  const lobby = html(React.createElement(Lobby, { room:{ code:"bcdf", mode:"party", drinking:true }, entrants, hosting:true, joinUrl:"https://x/float/play?room=bcdf", send:() => {} }));
  assert.match(lobby, /BCDF/);
  assert.match(lobby, /aria-label="Join BCDF"/, "the QR");
  assert.match(lobby, /aria-label="More bots"/);
  assert.match(lobby, /class="fs-start"/);
  const fieldday = html(React.createElement(Lobby, { room:{ code:"fd-float", mode:"fieldday", startPlanned:Date.now() + 60_000 }, entrants, hosting:false, joinUrl:null }));
  assert.match(fieldday, /Starts in/);
  assert.doesNotMatch(fieldday, /fs-start/);
});

test("rendered: the cast has every rider with their name, the host, the scene; a placeholder critter wears the groom's crown", () => {
  const store = createScreenStore();
  const cast = html(React.createElement(Cast, { store, driver:fakeDriver(0), entrants, phase:"song", room:{ phase:"song", field:range(13), out:[] }, version:1 }));
  for (const e of entrants) assert.ok(cast.includes(`>${e.name}<`), e.name);
  assert.equal((cast.match(/class="fl-rider"/g) || []).length, 13);
  assert.match(html(React.createElement(Host, { store, driver:fakeDriver(0), phase:"song" })), /fl-host/);
  assert.match(html(React.createElement(Scene, { id:"open" })), /sc-water/);
  assert.match(html(React.createElement(PlaceholderCritter, { color:"#ff5a4e", critter:"jackrabbit", groom:true })), /cr-crown/);
});

test("rendered: Last Call's card, then who drinks; the cut before it points to Last Call", () => {
  const { LastCallBanner, CutBoard: Board } = ui.exports;
  const chart = chartOf("lastcall");
  const songAt = 3_000_000;
  const at = (beat, lastCall = null) => html(React.createElement(LastCallBanner, {
    store:{ state:{ chart, songAt, lastCall } }, driver:fakeDriver(songAt + beat * BEAT_MS), entrants }));
  assert.match(at(-2), /Last Call/);
  assert.equal(at(10), "");
  assert.match(at(27, { totals:[], worst:[1, 4] }), /Evan and Khoa drink/);
  assert.match(at(27, { totals:[], worst:[2] }), /Eyob drinks/);
  const cutStart = 4_000_000;
  const room = { phase:"cut", round:0, rounds:4, drinking:true, startAt:cutStart, endsAt:cutStart + 12000, song:"paddle", field:range(9), out:[9, 10, 11, 12],
    cut:9, lastRound:false, results:range(13).map(i => ({ i, place:i + 1, pct:99 - i * 2.5, out:i >= 9 })),
    history:[{ round:0, song:"paddle", field:range(13), out:[12, 11, 10, 9] }] };
  const late = html(React.createElement(Board, { store:{ state:{ songField:range(13), phaseStart:cutStart } }, driver:fakeDriver(cutStart + 10500), room, entrants }));
  assert.match(late, /Next[\s\S]*Last Call/);
  assert.doesNotMatch(late, /Rock Hop/);
});
