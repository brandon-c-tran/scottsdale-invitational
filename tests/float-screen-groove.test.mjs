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

import { CHUGOFF, POPUP_MS, SONG_LEAD_MS, chartOf, demoCues, popupOf } from "../float/shared/chart.js";
import { BEAT_MS } from "../float/shared/beat.js";
import {
  BOX, CROWD, MIN_GAP, NAME_H, PODIUM, POPUP_BOX, STAGE_W, crowdLayout, driftOf, flotillaLayout, nameSlots, nameWidth, podiumLayout,
  popupSize, popupSlots,
  riderWidth, rowCounts, rowsFor, rowSlots, seatOrder, spreadRow,
} from "../float/client/screen/model/flotilla.js";
import { ACTIONS, PLEASED_MS, actionAt, bobAt, cheerAt, chugAt, follow, hopToBank, popupAt } from "../float/client/screen/model/motion.js";
import { actionKind, bannerAt, chartFor, demoAt, hostAt, hostCalls, lineShownAt, lineSpot, rankStripOn, roundLabel, sceneFor, sceneMode, signAt, songStart, timedLines }
  from "../float/client/screen/model/song.js";
import { cutField, cutOuts, cutRanking, cutRankingOf, cutShow, pctText } from "../float/client/screen/model/cut.js";
import { belowCut, createRanker, extrasSince, liveOrder, throughOf } from "../float/client/screen/model/rank.js";
import { EXIT_MS, exitAt, exitKind } from "../float/client/screen/model/exits.js";
import { CHUG_EXPLAINER, chugCaption, chugClock, chugLayout, chugoffAt, firstChugoff } from "../float/client/screen/model/chugoff.js";
import { rankMarks, rankSlots } from "../float/client/screen/model/rank.js";
import { awardValue } from "../float/client/screen/model/cut.js";
import { createScreenStore } from "../float/client/screen/model/store.js";
import { scriptCup, seenOf } from "../float/client/screen/mock/script.js";
import { MOCK_SHOTS, SHOTS, mockRider, mockSkills, shotTime } from "../float/client/screen/mock/shared.js";
import { seatsFor } from "../float/shared/seats.js";

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

test("fixed seats: every rider keeps the seat map's seat whatever the scores; the drift never passes a neighbour", () => {
  for (let n = 1; n <= 16; n += 1) {
    const field = range(n).map(i => i * 2 + 1);
    const seats = seatsFor(field);
    const order = arrangement => Object.entries(arrangement).sort((a, b) => a[1].row - b[1].row || a[1].x - b[1].x).map(([i]) => Number(i));
    const rest = order(flotillaLayout(field, new Map()));
    for (const lives of [new Map(field.map((i, k) => [i, k % 2 ? 100 : 0])), new Map(field.map((i, k) => [i, 100 - k * 6])), new Map(field.map((i, k) => [i, k * 6]))]) {
      const spots = flotillaLayout(field.slice().reverse(), lives);
      assert.deepEqual(order(spots), rest, `${n}: the same seats left to right whatever the scores or the list's order`);
      for (const [key, spot] of Object.entries(spots)) {
        const seat = seats.get(Number(key));
        assert.equal(spot.rows - 1 - spot.row, seat.row, `${n}: rider ${key} in the seat map's row (row 0 the front)`);
        assert.equal(spot.col, seat.col, `${n}: rider ${key} in the seat map's column`);
      }
    }
  }
  /* the drift: a little ahead or behind, clamped */
  assert.equal(driftOf(100, 50, { max:30 }), 30);
  assert.equal(driftOf(0, 50, { max:30 }), -30);
  assert.equal(driftOf(null, 50), 0);
  const level = flotillaLayout(range(13), new Map()), led = flotillaLayout(range(13), new Map(range(13).map(i => [i, i === 5 ? 100 : 60])));
  assert.ok(led[5].x > level[5].x, "the leader drifts downstream (right)");
  assert.ok(led[5].x - level[5].x <= 0.1 * 620 + 1, "but only a little");
  assert.deepEqual(seatOrder([9, 3, 3, 7]), [3, 7, 9], "the field in entrant order");
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

test("names: on top, each under its own tube, never over another name; popups keep off them", () => {
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const names = ["Horned Lizard", "Gila Monster", "Roadrunner", "Brandon", "Jackrabbit", "Armadillo", "Bighorn", "Coyote", "Tortoise", "Javelina",
    "Capybara", "Quail", "Otter", "Frog", "Winnie", "Evan"];
  for (const n of [3, 6, 9, 13, 16]) {
    const order = range(n);
    const spots = flotillaLayout(order, new Map(order.map(i => [i, 70 + (i * 13) % 30])));
    const spotsOf = Object.entries(spots).map(([i, sp]) => ({ i:Number(i), x:sp.x, y:sp.y + 52 * sp.scale * 1.45, w:nameWidth(names[i]), h:NAME_H, scale:sp.scale }));
    const faces = Object.entries(spots).map(([i, sp]) => ({ i:Number(i), x:sp.x, y:sp.y, scale:sp.scale, top:sp.y - 240 * sp.scale * 1.45 }));
    const nameRects = spotsOf.map(m => ({ i:m.i, x0:m.x - m.w / 2, x1:m.x + m.w / 2, y0:m.y - m.h / 2, y1:m.y + m.h / 2 }));
    const slots = popupSlots(faces, { names:nameRects });
    const popups = Object.values(slots).map(sl => ({ x0:sl.x - 94 * sl.size, x1:sl.x + 94 * sl.size, y0:sl.y - 100 * sl.size, y1:sl.y }));
    const nudges = nameSlots(spotsOf, { faces, popups });
    const placed = spotsOf.map(m => {
      const d = nudges[m.i];
      assert.ok(Math.abs(d.dx) <= m.w * 0.6 && Math.abs(d.dy) <= NAME_H * 1.5, `${n}: name ${m.i} stays under its own tube`);
      return { i:m.i, x0:m.x + d.dx - m.w / 2, x1:m.x + d.dx + m.w / 2, y0:m.y + d.dy - m.h / 2, y1:m.y + d.dy + m.h / 2 };
    });
    for (const a of placed) for (const b of placed) if (b.i > a.i) assert.equal(overlap(a, b), 0, `${n}: names ${a.i} and ${b.i} apart`);
    const covered = placed.filter(a => popups.some(p => overlap(a, p) > 0.25 * (a.x1 - a.x0) * (a.y1 - a.y0))).length;
    assert.ok(covered <= Math.ceil(n / 8), `${n}: names clear of the popups (${covered} grazed)`);
  }
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
  /* out: a small hop in place (about the critter's height), then a waddle to the sand */
  const from = { x:900, y:925, scale:0.6 }, to = { x:1200, y:428, scale:0.34 };
  const hop = [0.05, 0.13, 0.2].map(t => hopToBank(from, to, t, { height:200 }));
  assert.ok(hop.every(h => h.x === from.x && h.y === from.y), "the hop is in place");
  assert.ok(Math.min(...hop.map(h => h.lift)) >= -200 && Math.min(...hop.map(h => h.lift)) < -120, "about the critter's height, no higher");
  const slide = [0.4, 0.6, 0.8].map(t => hopToBank(from, to, t, { height:200 }));
  assert.ok(slide.every(h => h.lift >= -30), "then low to the water");
  assert.ok(slide[0].y > slide[1].y && slide[1].y > slide[2].y, "back toward the bank");
  const end = hopToBank(from, to, 1, { height:200 });
  assert.deepEqual([Math.round(end.x), Math.round(end.y), end.scale], [to.x, to.y, to.scale]);
  assert.equal(chugAt(3.1).pose, "chug");
  assert.equal(cheerAt(1000, 1200).pose, "cheer");
  assert.equal(cheerAt(1000, 5000), null);
  const bob = bobAt(4);
  assert.ok(bob.sy < 1 && bob.sx > 1, "squashed on the beat");
  assert.ok(bobAt(4.5).dy < bobAt(4).dy, "up between beats");
  assert.equal(Math.round(follow(0, 100, 260, 260)), 63);
});

/* ── the song ── */

test("the song's words: the round card through the lead, the count-in, Go! at each play; no Practice or Drink; the scene for each phase", () => {
  const chart = chartOf("paddle");
  assert.deepEqual([bannerAt(chart, -5).kind, bannerAt(chart, -5).text, bannerAt(chart, -5).sub], ["card", "Round 1", "Paddle Party"]);
  assert.equal(bannerAt(chart, 2, { round:3, rounds:4 }).text, "Final");
  assert.deepEqual([4, 5.5, 6, 7.9].map(b => bannerAt(chart, b).text), ["1", "2", "3", "4"]);
  assert.notEqual(bannerAt(chart, 4.2).key, bannerAt(chart, 5.2).key, "each number pops on its own beat");
  assert.equal(bannerAt(chart, 12), null, "practice has the narration box instead");
  assert.equal(bannerAt(chart, 24.2).text, "Go!");
  assert.equal(bannerAt(chart, 88.5).text, "Go!", "the beat back after the breakdown");
  assert.equal(bannerAt(chart, 57), null, "the breakdown: no Drink!");
  assert.equal(bannerAt(chart, 70), null);
  assert.equal(roundLabel(1, 4), "Round 2");
  assert.equal(sceneFor("lobby"), "lobby");
  assert.equal(sceneFor("song", chartOf("rock")), "rocks");
  assert.equal(sceneFor("song", chartOf("spin")), "whirlpool");
  assert.equal(sceneFor("cut", chartOf("drop")), "falls");
  assert.equal(sceneFor("chugoff", chartOf("rock")), "rocks", "the chug-off stays on the song's water");
  assert.equal(sceneFor("lastcall", chartOf("lastcall-lights")), "bar");
  assert.equal(sceneFor("podium"), "podium");
  assert.equal(sceneFor("feedback"), "podium");
  assert.equal(sceneFor("intro"), "open");
  assert.deepEqual(sceneMode(chartOf("drop"), 29 * 4 + 1), { section:"play", mode:"drop" });
});

test("the host calls every cue on its beat (Ready, Ba, Spin; The Drop counts 3, 2, 1), the demos too, and the breakdown's rhythm as notes", () => {
  const paddle = chartOf("paddle");
  const hey = paddle.cues.find(c => c.kind === "hey" && c.scored);
  assert.deepEqual(hostAt(paddle, hey.call + 0.1).call.word, "Ready");
  assert.equal(hostAt(paddle, hey.call + 0.1).pose, "call");
  assert.equal(hostAt(paddle, hey.call - 0.1).pose, "idle");
  assert.equal(hostAt(paddle, 130).pose, "cheer", "the song's end");
  /* the demos: the Hey called like any Hey; a demo paddle's call is the pulse (call null), so no word */
  const demoHey = demoCues(paddle).find(c => c.kind === "hey");
  assert.ok(hostCalls(paddle).some(c => c.cue === demoHey.id && c.word === "Ready"), "the host calls the demo");
  assert.ok(demoCues(paddle).filter(c => c.kind === "paddle").every(c => !hostCalls(paddle).some(h => h.cue === c.id)), "a demo paddle rows on the pulse");
  const echoes = hostCalls(paddle).filter(c => c.kind === "echo");
  assert.ok(echoes.length >= 8 && echoes.every(c => c.word === "" && c.beat >= 56 && c.beat < 88), "the breakdown's rhythm, a note a beat (no word)");
  assert.ok(hostCalls(paddle).every(c => c.kind === "hey" || c.kind === "echo"), "a paddle's call is the pulse");
  assert.ok(hostCalls(chartOf("rock")).filter(c => c.kind === "hop").every(c => c.word === "Ba"));
  assert.ok(hostCalls(chartOf("spin")).filter(c => c.kind === "spin").every(c => c.word === "Spin"));
  const drop = chartOf("drop");
  assert.deepEqual(hostCalls(drop).filter(c => c.kind === "drop").map(c => c.word), ["3", "2", "1"]);
  const signs = [];
  for (let bar = 0; bar < drop.bars; bar += 1) { const s = signAt(drop, bar * 4 + 1); if (s) signs.push([bar, s.mode]); }
  assert.ok(signs.length >= 3, "a sign before each switch in play A");
  for (const [bar, mode] of signs) assert.equal(drop.modes[bar + 1], mode);
  const breakdown = drop.sections.find(x => x.kind === "breakdown");
  assert.ok(signs.every(([bar]) => bar + 1 < breakdown.bar), "play B: no signs (keep the pattern in your head)");
  assert.equal(signAt(paddle, 9), null, "only The Drop");
});

test("practice, narrated: each line up when the host says it, until the next; the demo acted out by everyone; the copies move like the song", () => {
  const chart = chartOf("paddle");
  /* the chart's own beats without the sound */
  const plain = timedLines(chart);
  assert.deepEqual(plain.map(l => l.text), chart.lines.map(l => l.text));
  for (let k = 1; k < plain.length; k += 1) assert.ok(plain[k - 1].until <= plain[k].from, "one line at a time");
  /* the sound's timing: up when it is said */
  const spoken = [{ text:"Paddle on 1 and 3", from:0.94, to:3 }, { text:"Copy me", from:58.6, to:59.5, show:55 }];
  const timed = timedLines(chart, spoken);
  assert.equal(lineShownAt(timed, 0.5), null, "not before it is said");
  assert.equal(lineShownAt(timed, 1).text, "Paddle on 1 and 3");
  assert.equal(lineShownAt(timed, 58), null, "up until its own until");
  assert.equal(lineShownAt(timed, 58.7).text, "Copy me");
  assert.equal(lineSpot(chart, lineShownAt(timed, 1)), "top", "over the scene in practice");
  assert.equal(lineSpot(chart, lineShownAt(timed, 58.7)), "low", "under the rank strip in the breakdown");
  /* the demo bar: the host's strokes and Hey, every critter acting each out on its beat; nobody taps them */
  const demos = demoCues(chart);
  assert.equal(demoAt(chart, demos[0].beat - 0.1), null);
  for (const demo of demos) assert.equal(demoAt(chart, demo.beat + 0.2).id, demo.id);
  assert.equal(demoAt(chart, demos[demos.length - 1].beat + 2), null);
  /* the breakdown's copies move like the song's own */
  const echo = chart.cues.find(c => c.kind === "echo");
  assert.equal(actionKind(chart, echo), "paddle");
  assert.equal(actionKind(chartOf("rock"), chartOf("rock").cues.find(c => c.kind === "echo")), "hop");
  assert.equal(actionKind(chartOf("spin"), chartOf("spin").cues.find(c => c.kind === "echo")), "spin");
  assert.equal(actionKind(chart, chart.cues.find(c => c.kind === "hey")), "hey");
  /* the rank strip: from the first play bar, never in practice */
  assert.equal(rankStripOn(chart, 20), false);
  assert.equal(rankStripOn(chart, 24), true);
  assert.equal(rankStripOn(chart, 100), true);
});

/* ── who's ahead ── */

test("who's ahead: the engine's order (percent, the Cup, Perfects, field), moved by the hits since the room's frame, at most once a beat", () => {
  const field = [0, 1, 2, 3];
  const results = [{ i:0, pts:300, pct:100, perfects:3, cup:0 }, { i:1, pts:300, pct:100, perfects:3, cup:150 },
    { i:2, pts:210, pct:70, perfects:0, cup:0 }, { i:3, pts:210, pct:70, perfects:1, cup:0 }];
  assert.deepEqual(liveOrder({ results, field }), [1, 0, 3, 2], "ties by the Cup, then Perfects");
  /* hits after the frame move it */
  const chart = chartOf("paddle");
  const scored = chart.cues.filter(c => c.scored).slice(0, 2);
  const judged = new Map([[2, new Map(scored.map(c => [c.id, { q:"perfect", d:0, at:5000 }]))]]);
  assert.equal(extrasSince(judged, 4000, chart).get(2).pts, 200);
  assert.equal(extrasSince(judged, 6000, chart).get(2).pts, 0, "hits before the frame are in it already");
  const live = new Map([[0, 75], [1, 74], [2, 99], [3, 10]]);
  assert.deepEqual(liveOrder({ results, field, liveOf:i => live.get(i) }), [2, 0, 1, 3], "the store's live percent");
  assert.deepEqual(liveOrder({ results:[], field:[5, 6] }), [5, 6], "nobody judged yet: the field's order");
  /* re-ranked at most once a beat */
  const ranker = createRanker();
  let made = 0;
  const make = () => ({ order:[made += 1] });
  ranker.update({ beat:4.1, key:"a", make });
  ranker.update({ beat:4.9, key:"a", make });
  assert.equal(made, 1, "the same beat: the same order");
  ranker.update({ beat:5.0, key:"a", make });
  assert.equal(made, 2);
  /* the cut line: after the next field; none in the final */
  assert.equal(throughOf({ cut:9 }, 13), 9);
  assert.equal(throughOf({ cut:3, lastRound:true }, 3), null);
  assert.equal(throughOf({ cut:null }, 6), null);
  assert.equal(belowCut([4, 2, 7, 1], 2, 7), true);
  assert.equal(belowCut([4, 2, 7, 1], 2, 2), false);
  assert.equal(belowCut([4, 2, 7, 1], null, 1), false, "nobody sinks in the final");
  /* the strip's marks and slots */
  assert.deepEqual(rankMarks([4, 2, 7]), { 4:"1st" });
  assert.deepEqual(rankMarks([4, 2, 7, 1], { final:true }), { 4:"1st", 2:"2nd", 7:"3rd" });
  const slots = rankSlots(13);
  assert.ok(slots.x(0) >= 340 && slots.x(12) + slots.w <= 1910, "13 chips across the top, clear of the host (his hat ends near x 310)");
  assert.ok(slots.w >= 112, "room for a 24 px name under every chip (Brandon, Richard, Chiang, Jeremy)");
  assert.ok(slots.w >= 100, "room for a name and a percent");
});

/* ── after a song ── */

test("the cut as a show: grades at once, up to three award cards a beat apart, the line, the outs from the bottom; the bubble waits", () => {
  const start = 1_000_000;
  const results = range(13).map(i => ({ i, place:i + 1, pct:99 - i * 3, grade:i < 4 ? "superb" : i < 9 ? "ok" : "tryagain",
    out:i >= 9, ...(i === 8 || i === 9 ? { bubble:true, out:false } : {}) }));
  results[8].out = false;
  const show = { grades:start + 400, awards:[start + 2400, start + 3600, start + 4800], line:start + 6000,
    outs:[{ i:12, at:start + 6800 }, { i:11, at:start + 8200 }, { i:10, at:start + 9600 }], bubble:[8, 9] };
  const room = { phase:"cut", round:0, rounds:4, startAt:start, endsAt:start + 12000, field:range(8), out:[12, 11, 10], cut:9, lastRound:false,
    results, awards:[{ id:"perfects", i:0, value:40, label:"Most Perfects" }, { id:"streak", i:1, value:22, label:"Longest streak" },
      { id:"early", i:5, value:48, label:"Always early" }, { id:"late", i:6, value:44, label:"Always late" }], show,
    history:[{ round:0, song:"paddle", field:range(13), out:[12, 11, 10], results }] };
  const cut = cutShow(room);
  assert.equal(cut.gradesAt, start + 400);
  assert.equal(cut.grades[0], "superb");
  assert.equal(cut.awards.length, 3, "three cards at most");
  assert.deepEqual(cut.awards.map(a => a.at), show.awards);
  assert.deepEqual(cut.outs.map(o => o.i), [12, 11, 10], "from the bottom, on the room's beats");
  assert.deepEqual(cut.chugoff, { a:8, b:9 }, "the bubble: the last through and the first out");
  assert.ok(cut.callAt > cut.outs[2].at, "the call after the outs");
  /* the room's row for the bubble's out rider says out:false until the chug-off */
  assert.equal(cut.ranking.find(r => r.i === 9).out, false);
  /* without the room's beats: the same shape from the cut's start */
  const bare = cutShow({ ...room, show:undefined, chugoff:undefined });
  assert.ok(bare.gradesAt < bare.awards[0].at && bare.awards[2].at < bare.line && bare.line < bare.outs[0].at, "grades, cards, line, outs");
  assert.ok(bare.outs.every((o, k) => k === 0 || o.at > bare.outs[k - 1].at));
  assert.deepEqual(bare.chugoff, { a:8, b:9 }, "the bubble from its rows");
  const final = cutShow({ ...room, lastRound:true, cut:null, show:{ grades:start + 400, awards:[], line:null, outs:[] }, results:results.map(r => ({ ...r, out:false, bubble:undefined })) });
  assert.equal(final.chugoff, null);
  assert.equal(final.outs.length, 0);
  assert.equal(awardValue({ id:"streak", value:22 }), "22 in a row");
  assert.equal(awardValue({ id:"early", value:48 }), "48 ms early");
  assert.equal(awardValue({ id:"splashes", value:1 }), "1 miss");
  assert.equal(awardValue({ id:"perfects", value:40 }), "40 Perfects");
  assert.equal(pctText(97.36), "97.4%");
  assert.equal(pctText(100), "100%");
  /* the room's ranking with its outs, the field from the record */
  const plain = { phase:"cut", round:0, field:[0, 2, 3], out:[1, 4],
    results:[{ i:2, place:1, pct:98 }, { i:0, place:2, pct:91 }, { i:3, place:3, pct:88 }, { i:4, place:4, pct:70, out:true }, { i:1, place:5, pct:61, out:true }],
    history:[{ round:0, field:[0, 1, 2, 3, 4], out:[4, 1] }], scores:[] };
  assert.deepEqual(cutRankingOf(plain).map(r => r.i), [2, 0, 3, 4, 1]);
  assert.deepEqual(cutOuts(cutRankingOf(plain)), [1, 4], "the last place first");
  assert.deepEqual(cutField(plain), [0, 1, 2, 3, 4]);
  const fallback = cutRanking([{ i:0, pct:50, cup:0 }, { i:1, pct:80, cup:0 }, { i:2, pct:50, cup:10 }], { out:[0] });
  assert.deepEqual(fallback.map(r => [r.i, r.out]), [[1, false], [2, false], [0, true]], "ties by the Cup");
});

test("the exits: Paddle Party's pelican, Rock Hop's bonk, Spin Cycle's flush; every one lands on the bank", () => {
  assert.equal(exitKind("open"), "pelican");
  assert.equal(exitKind("rocks"), "bonk");
  assert.equal(exitKind("whirlpool"), "flush");
  assert.equal(exitKind("falls"), "hop");
  const from = { x:900, y:800, scale:0.5 }, to = { x:1500, y:428, scale:0.34 };
  for (const kind of ["pelican", "bonk", "flush", "hop"]) {
    const end = exitAt(kind, from, to, 1, { height:150 });
    assert.ok(Math.abs(end.x - to.x) < 1 && Math.abs(end.y - to.y) < 1 && Math.abs(end.scale - to.scale) < 0.01, `${kind}: on the bank`);
    assert.equal(end.opacity, 1);
    assert.equal(end.pose, "out");
    const start = exitAt(kind, from, to, 0, { height:150 });
    assert.equal(start.x, from.x, `${kind}: from its spot`);
  }
  const swoop = exitAt("pelican", from, to, 0.1);
  assert.ok(swoop.pelican && swoop.pelican.x > from.x, "the pelican swoops in from the right");
  const carried = exitAt("pelican", from, to, 0.65);
  assert.ok(carried.lift < 0 && carried.x > from.x && carried.x < to.x, "carried over the water");
  const bonked = exitAt("bonk", from, to, 0.3);
  assert.ok(bonked.rock && bonked.stars, "the rock and the stars");
  const sunk = exitAt("bonk", from, to, 0.7);
  assert.ok(sunk.bubbles && sunk.lift > 0, "sinking in bubbles");
  const flushed = exitAt("flush", from, to, 0.5);
  assert.ok(flushed.swirl && flushed.scale < from.scale, "round and down");
  assert.ok(EXIT_MS >= 1500 && EXIT_MS <= 3000);
});

test("the chug-off: the call, 3 2 1, Chug!, the first Done keeps the spot, the other leaves; a caption for each way it ends", () => {
  const goAt = 2_000_000;
  const chug = { round:0, a:4, b:7, goAt, doneAt:{}, winner:null, by:null };
  assert.equal(chugoffAt(chug, goAt - 3500).stage, "call");
  assert.deepEqual([chugoffAt(chug, goAt - 2500).count, chugoffAt(chug, goAt - 1500).count, chugoffAt(chug, goAt - 500).count], ["3", "2", "1"]);
  assert.equal(chugoffAt(chug, goAt + 200).count, "Chug!");
  assert.equal(chugoffAt(chug, goAt + 200).stage, "chug");
  assert.equal(chugoffAt(chug, goAt + 4200).clockMs, 4200);
  /* the screen's own ev done, before the room's word */
  const seen = new Map([[7, goAt + 5100]]);
  const won = chugoffAt(chug, goAt + 5500, { seen });
  assert.deepEqual([won.winner, won.loser, won.stage, won.by, won.clockMs], [7, 4, "won", "chug", 5100]);
  assert.equal(chugoffAt(chug, goAt + 5100 + CHUGOFF.REVEAL_MS + 10, { seen }).stage, "exit", "the other leaves after the reveal");
  /* the room's word */
  const room = { ...chug, doneAt:{ 4:6000 }, winner:4, by:"chug" };
  assert.equal(chugoffAt(room, goAt + 7000).winAt, goAt + 6000);
  /* by score: no Done; the decision timed by when it was heard */
  const score = { ...chug, winner:4, by:"score" };
  assert.equal(chugoffAt(score, goAt + 31_000, { decidedAt:goAt + 30_100 }).winAt, goAt + 30_100);
  assert.equal(chugoffAt(score, goAt + 40_000, { decidedAt:goAt + 30_100 }).stage, "exit");
  assert.equal(chugCaption("chug"), "First to finish");
  assert.match(chugCaption("score"), /Nobody finished/);
  assert.equal(chugCaption("forfeit"), "Won by forfeit");
  assert.equal(CHUG_EXPLAINER, "Last one in against first one out. First to finish keeps the spot.");
  /* the Cup's first chug-off: a longer intro, for its rule */
  assert.equal(chugoffAt({ a:1, b:2 }, 0, { startAt:0, first:true }).goAt, CHUGOFF.INTRO_FIRST_MS ?? CHUGOFF.INTRO_MS);
  assert.equal(chugoffAt({ a:1, b:2 }, 0, { startAt:0 }).goAt, CHUGOFF.INTRO_MS);
  assert.equal(firstChugoff({ round:0, chugoff:{ round:0 }, history:[{ round:0, results:[{ i:1, bubble:true }] }] }), true);
  assert.equal(firstChugoff({ round:1, chugoff:{ round:1 }, history:[{ round:0, results:[{ i:1, bubble:true }] }, { round:1, results:[] }] }), false);
  const stage = chugLayout(4, 7);
  assert.ok(stage[4].x < 960 && stage[7].x > 960 && stage[4].y === stage[7].y, "centre stage, either side of the clock");
  assert.equal(chugClock(4210), "4.2");
});

/* ── Last Call ── */

test("Last Call, the countdown: shown and said until the trick hides it, nothing after; every offset at the reveal; the farthest drinks", async () => {
  const { BARTENDER, BAR_LINE, COUNTER, LAST_CALL_EXPLAINER, barLayout, barPlayersOf, barRanking, bartenderPose, closestOf, countWord, countdownAt, readoutOf, verdictShown } =
    await import("../float/client/screen/model/lastcall.js");
  const lights = chartOf("lastcall-lights").countdown;
  assert.equal(countdownAt(lights, 100).stage, "intro");
  const ten = lights.steps[0];
  assert.deepEqual([countdownAt(lights, ten.at + 100).show, countdownAt(lights, ten.at + 100).say], [10, 10]);
  assert.equal(countdownAt(lights, ten.at + 800).say, null, "said for a moment");
  assert.equal(countdownAt(lights, ten.at + 800).show, 10, "shown until the next");
  const four = lights.steps.find(s => s.n === 4);
  assert.equal(countdownAt(lights, four.at + 10).show, 4);
  for (const t of [lights.hideAt, lights.hideAt + 500, lights.zeroAt, lights.revealAt - 1]) {
    const cd = countdownAt(lights, t);
    assert.deepEqual([cd.show, cd.say, cd.tick, cd.hidden, cd.stage], [null, null, null, true, "dark"], `nothing tells the count at ${t}`);
  }
  assert.equal(countdownAt(lights, lights.revealAt).stage, "reveal");
  assert.equal(countdownAt(lights, lights.verdictAt).stage, "verdict");
  assert.ok(lights.first && lights.introMs === 7000, "the first Last Call says what it is");
  assert.equal(LAST_CALL_EXPLAINER, "The bar closes at zero. Tap on zero. Farthest off drinks.");
  const ticks = chartOf("lastcall-ticks").countdown;
  const six = ticks.steps.find(s => s.n === 6);
  assert.deepEqual([countdownAt(ticks, six.at + 50).say, countdownAt(ticks, six.at + 50).tick], [null, 6], "ticks: the voice stops, ticks only");
  assert.equal(countWord(7), "Seven");
  /* the verdict at the later of its moment and the room naming who drinks */
  const songAt = 9_000_000;
  const named = { songAt, countdown:lights, lastCall:{ totals:[], worst:[3] }, lastCallAt:songAt + lights.revealAt };
  assert.equal(verdictShown(named, songAt + lights.verdictAt - 1), null);
  assert.deepEqual(verdictShown(named, songAt + lights.verdictAt), [3]);
  assert.equal(verdictShown({ ...named, lastCallAt:songAt + lights.verdictAt + 700 }, songAt + lights.verdictAt + 300), null, "a late verdict waits for itself");
  assert.equal(verdictShown({ ...named, lastCall:{ totals:[], worst:null } }, songAt + 99_999), null);
  assert.deepEqual(closestOf([{ i:1, d:-80 }, { i:2, d:40 }, { i:3, d:-40 }, { i:4 }]), [2, 3], "the closest, ties all");
  assert.deepEqual(readoutOf({ i:4 }), { q:"miss", d:null });
  assert.equal(bartenderPose(lights, lights.hideAt + 200), "slide", "he pulls the cord");
  assert.equal(bartenderPose(ticks, ticks.hideAt + 200), "idle", "the foam needs no hand");
  assert.equal(bartenderPose(lights, 100, { revealed:true }), "cheer");
  for (const n of [2, 9, 13, 16]) {
    const seats = barLayout(range(n));
    assert.equal(Object.keys(seats).length, n);
    const ys = new Set(Object.values(seats).map(s => s.y));
    assert.equal(ys.size, 1, `${n}: one line-up`);
    assert.ok(Object.values(seats).every(s => s.x - 125 * s.scale * 1.45 > 0 && s.x + 125 * s.scale * 1.45 < STAGE_W), `${n}: on the stage`);
    /* behind the counter, waist up: the ring's top (about 62 box px over the waterline: the kayak hull tops out near 50) under the counter's top */
    assert.ok(Object.values(seats).every(s => s.y - 62 * s.scale * 1.45 >= COUNTER.top && s.y < 1080), `${n}: no tubes over the counter`);
    assert.ok(BAR_LINE.lo > 0 && BAR_LINE.hi < STAGE_W);
  }
  /* the reveal ranks the line-up: closest left, farthest right, a tie shares a place in rider order, no tap last */
  const reads = { 4:{ q:"late", d:820 }, 1:{ q:"nice", d:-80 }, 9:{ q:"miss", d:null }, 2:{ q:"nice", d:80 }, 6:{ q:"perfect", d:10 } };
  const ranked = barRanking([4, 1, 9, 2, 6], i => reads[i]);
  assert.deepEqual(ranked.map(r => r.i), [6, 1, 2, 4, 9]);
  assert.deepEqual(ranked.map(r => r.place), [1, 2, 2, 4, 5]);
  const line = barLayout(ranked.map(r => r.i));
  assert.ok(line[6].x < line[1].x && line[2].x < line[4].x && line[4].x < line[9].x, "left to right, closest to farthest");
  assert.ok(BARTENDER.x < 600);
  assert.deepEqual(barPlayersOf({ field:[2, 5], out:[1, 7] }), [2, 5, 7, 1], "the field, then the riders out, the last out first");
});

/* ── the store ── */

test("the store: the chart by id, beat 0, one judgement a cue (the first), live scores, the song's results, the chug-off's Dones and decision", () => {
  let now = 1_000_000;
  const store = createScreenStore();
  store.attach({ on:() => () => {}, serverNow:() => now, status:() => "open" });
  const startAt = now;
  store.onRoom({ t:"room", s:now, phase:"song", round:0, rounds:4, song:"paddle", chartId:"paddle", startAt, field:[0, 1],
    scores:[{ i:0, pts:0, pct:0, live:0, n:0, cup:0 }], results:[{ i:0, pts:0, pct:0, perfects:0, cup:0, place:1 }] });
  assert.equal(store.state.chart.id, "paddle", "the shared chart by id");
  assert.equal(store.state.songAt, startAt + SONG_LEAD_MS, "beat 0 from the lead");
  assert.equal(store.state.results.length, 1, "the room's live ranking");
  assert.equal(store.state.resultsAt, now);
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
  const echo = store.state.chart.cues.find(c => c.kind === "echo");
  store.onEv({ t:"ev", s:now, e:"hit", i:1, c:echo.id, q:"nice", d:20 });
  assert.equal(store.state.last.get(1).kind, "paddle", "a copy moves like the song");
  now += 100;
  store.onEv({ t:"ev", s:now, e:"cheer", i:5 });
  assert.equal(store.state.cheers.get(5), now);
  store.onEv({ t:"ev", s:now + 5000, e:"cheer", i:6 });
  assert.equal(store.state.cheers.get(6), now, "a stamp ahead of the clock counts as now");
  now += 100;
  store.onRoom({ t:"room", s:now, phase:"song", round:1, rounds:4, song:"rock", chartId:"rock", startAt:now, field:[0] });
  assert.equal(store.state.last.size, 0, "a new song starts clean");
  assert.equal(chartFor({ chartId:"spin" }).id, "spin");
  /* the chug-off: its own Dones, and when it was heard decided */
  now += 30_000;
  const chugoff = { a:0, b:1, goAt:now + 4000, doneAt:{}, winner:null, by:null };
  store.onRoom({ t:"room", s:now, phase:"chugoff", round:1, rounds:4, startAt:now, field:[0], chugoff });
  assert.equal(store.state.done.size, 0);
  assert.equal(store.state.chugoffDecidedAt, null);
  now += 9000;
  store.onEv({ t:"ev", s:now, e:"done", i:1 });
  assert.equal(store.state.done.get(1), now);
  store.onRoom({ t:"room", s:now + 50, phase:"chugoff", round:1, rounds:4, startAt:now - 9000, field:[0, 1], chugoff:{ ...chugoff, winner:1, by:"chug", doneAt:{ 1:5000 } } });
  assert.equal(store.state.chugoffDecidedAt, now + 50);
  /* Last Call: when the room first named who drinks */
  now += 1000;
  store.onRoom({ t:"room", s:now, phase:"lastcall", round:1, rounds:4, song:"lastcall-slow", chartId:"lastcall-slow", songAt:now + 3000, field:[0],
    lastCall:{ totals:[{ i:0, ms:120, d:120 }], worst:null } });
  assert.equal(store.state.chart.countdown.trick, "slow");
  assert.equal(store.state.lastCallAt, null);
  now += 12_000;
  store.onRoom({ t:"room", s:now, phase:"lastcall", round:1, rounds:4, song:"lastcall-slow", chartId:"lastcall-slow", songAt:now - 9000, field:[0],
    lastCall:{ totals:[{ i:0, ms:120, d:120 }], worst:[0] } });
  const namedAt = now;
  assert.equal(store.state.lastCallAt, namedAt);
  now += 500;
  store.onRoom({ t:"room", s:now, phase:"lastcall", round:1, rounds:4, song:"lastcall-slow", chartId:"lastcall-slow", songAt:now - 9500, field:[0],
    lastCall:{ totals:[{ i:0, ms:120, d:120 }], worst:[0] } });
  assert.equal(store.state.lastCallAt, namedAt, "the first arrival stands");
});

/* ── the stand-in rooms ── */

test("the scripted Cup speaks the contract: the cut, the chug-off and Last Call after each song but the final; demos never tapped", () => {
  const skills = mockSkills(13, 3);
  const riders = range(13).map(k => ({ ...mockRider(k), device:`p${k}`, skill:skills[k] }));
  const { msgs, marks, rounds } = scriptCup({ riders, startAt:1_000_000, seed:3 });
  assert.equal(rounds, 5);
  const phases = msgs.filter(m => m.msg.t === "room").map(m => m.msg.phase).filter((p, k, all) => p !== all[k - 1]);
  assert.deepEqual(phases, ["intro", "song", "cut", "chugoff", "lastcall", "song", "cut", "chugoff", "lastcall", "song", "cut", "chugoff", "lastcall",
    "song", "cut", "chugoff", "lastcall", "song", "cut", "podium", "feedback", "lobby"]);
  const songs = msgs.filter(m => m.msg.t === "room" && m.msg.phase === "song").map(m => m.msg.song).filter((x, k, all) => x !== all[k - 1]);
  assert.deepEqual(songs, ["paddle", "rock", "spin", "drop", "fireworks"], "the five songs, Fireworks the final");
  for (let k = 1; k < msgs.length; k += 1) assert.ok(msgs[k].s >= msgs[k - 1].s, "in time order");
  const hits = msgs.filter(m => m.msg.t === "ev" && m.msg.e === "hit").map(m => m.msg);
  assert.ok(hits.length > 1000);
  for (const hit of hits) {
    assert.ok(["perfect", "nice", "ok", "early", "late", "miss"].includes(hit.q));
    assert.equal(hit.q === "miss", hit.d === undefined, "a miss has no offset");
  }
  const demoIds = new Set(demoCues(chartOf("paddle")).map(c => c.id));
  const firstSong = msgs.filter(m => m.msg.t === "room" && m.msg.phase === "song" && m.msg.round === 0);
  const songEnd = msgs.findIndex(m => m.msg.t === "room" && m.msg.phase === "cut");
  assert.ok(!msgs.slice(0, songEnd).some(m => m.msg.t === "ev" && m.msg.e === "hit" && demoIds.has(m.msg.c)), "nobody taps the host's demo");
  assert.ok(firstSong.some(m => Array.isArray(m.msg.results) && m.msg.results.length === 13), "the live ranking in the song");
  /* the cut: grades, the show's beats, the bubble out:false */
  const cut = msgs.find(m => m.msg.t === "room" && m.msg.phase === "cut").msg;
  assert.ok(cut.results.every(r => ["superb", "ok", "tryagain"].includes(r.grade)));
  assert.ok(cut.awards.length <= 3);
  assert.equal(cut.show.bubble.length, 2);
  assert.ok(cut.results.filter(r => r.bubble).every(r => r.out === false), "the bubble is neither out nor through until the chug-off");
  assert.ok(!cut.field.includes(cut.show.bubble[0]) && !cut.out.includes(cut.show.bubble[1]));
  /* the chug-off settles: the loser's ev out at the decision */
  const chug = msgs.filter(m => m.msg.t === "room" && m.msg.phase === "chugoff" && m.msg.round === 0).map(m => m.msg);
  const decided = chug.find(m => Number.isInteger(m.chugoff.winner));
  assert.equal(decided.chugoff.by, "chug");
  assert.ok(msgs.some(m => m.msg.t === "ev" && m.msg.e === "out" && m.msg.i === decided.chugoff.loser && m.s === decided.s));
  assert.equal(chug[0].chugoff.goAt - chug[0].startAt, CHUGOFF.INTRO_FIRST_MS ?? CHUGOFF.INTRO_MS, "the Cup's first chug-off: the long intro");
  const fields = msgs.filter(m => m.msg.t === "room" && m.msg.phase === "song").map(m => m.msg.field.length).filter((n, k, all) => n !== all[k - 1]);
  assert.deepEqual(fields, [13, 10, 7, 5, 3]);
  for (const shot of MOCK_SHOTS) if (!SHOTS[shot].lobby) assert.ok(Number.isFinite(shotTime(shot, seenOf(marks), rounds)), `${shot} has a moment`);
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

test("the real room reaches the chug-off: its go and its decision are shots", async () => {
  const { connectRoom } = await import("../float/client/screen/mock/room.js");
  const net = connectRoom({ room:"bcdf", options:{ shot:"keeps", freeze:"1" } });
  const got = [];
  net.on("room", msg => got.push(msg));
  await net.ready;
  await new Promise(resolve => setTimeout(resolve, 30));
  const last = got[got.length - 1];
  assert.equal(last.phase, "chugoff");
  assert.ok(Number.isInteger(last.chugoff.winner), "decided");
  net.close();
});

/* ── a few moments, rendered ── */

/* the sound is the sound builder's: the test's bundle stands it in, so the picture is tested alone */
const stubSound = {
  name:"stub-sound",
  setup(b) {
    b.onResolve({ filter:/sound\/index\.js$/ }, args => ({ path:args.path, namespace:"stub-sound" }));
    b.onLoad({ filter:/.*/, namespace:"stub-sound" }, () => ({ contents:`export const CUT_BEATS = null, PODIUM_BEATS = null, narration = null;
      export const useFloatScreenSound = () => {}, useFloatSoundUnlockNeeded = () => false, unlockFloatSound = () => {};`, loader:"js" }));
  },
};
const bundle = await build({
  stdin:{ contents:`export { default as FloatScreen } from "./float/client/screen/FloatScreen.jsx";
    export { SongBanner, Narration, RankStrip, CutShow, ChugHud, LastCallHud, PodiumBlocks, IntroTitle, Feedback } from "./float/client/screen/hud/Hud.jsx";
    export { default as Lobby } from "./float/client/screen/hud/Lobby.jsx";
    export { default as Scene } from "./float/client/screen/stage/Scene.jsx";
    export { default as Cast, castPlan, rollCallAt, ROLL, barLineUp } from "./float/client/screen/stage/Cast.jsx";
    export { default as Host } from "./float/client/screen/stage/Host.jsx";
    export { default as Bar, boardOf, darkAt } from "./float/client/screen/stage/Bar.jsx";
    export { PlaceholderCritter, Critter } from "./float/client/screen/art.jsx";`, resolveDir:ROOT, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent", plugins:[stubSound],
});
const ui = new Module(fileURLToPath(new URL("float-screen-groove.cjs", import.meta.url)));
ui.filename = ui.id;
ui.paths = Module._nodeModulePaths(ROOT);
ui._compile(bundle.outputFiles[0].text, ui.filename);
const { FloatScreen, SongBanner, Narration, RankStrip, CutShow, ChugHud, LastCallHud, PodiumBlocks, IntroTitle, Feedback, Lobby, Scene, Cast, Host, Bar,
  PlaceholderCritter, castPlan, rollCallAt, ROLL, barLineUp } = ui.exports;
const html = element => renderToStaticMarkup(element);
const fakeDriver = now => ({ add:() => () => {}, serverNow:() => now, tick() {} });
const entrants = range(13).map(k => ({ ...mockRider(k), device:`p${k}`, ready:k % 2 === 0 }));

test("the screen renders in node with its real props (no window at module scope), on the fixed 1920 x 1080 stage", () => {
  const markup = html(React.createElement(FloatScreen, { room:"bcdf", hosting:true, joinUrl:"https://x/float/play?room=bcdf" }));
  assert.match(markup, /class="fs-root"/);
  assert.match(markup, /class="fs-stage"/);
  assert.doesNotMatch(markup, /<canvas/, "no WebGL");
});

test("rendered: the round card, Go!, the narration box, the rank strip; the podium, the lobby's code and controls", () => {
  const chart = chartOf("paddle");
  const songAt = 1_000_000;
  const storeAt = beat => ({ state:{ chart, songAt, songField:range(13), phaseStart:songAt - SONG_LEAD_MS, judged:new Map(), results:[] },
    serverNow:() => songAt + beat * BEAT_MS, liveOf:() => null });
  const banner = beat => html(React.createElement(SongBanner, { store:storeAt(beat), driver:fakeDriver(songAt + beat * BEAT_MS), room:{ round:0, rounds:4 } }));
  assert.match(banner(-2), /Round 1[\s\S]*Paddle Party/);
  assert.equal(banner(12), "", "no Practice banner");
  assert.match(banner(24.3), /Go!/);
  assert.equal(banner(57), "", "no Drink!");
  const line = beat => html(React.createElement(Narration, { store:storeAt(beat), driver:fakeDriver(songAt + beat * BEAT_MS) }));
  assert.match(line(8), /hd-line is-top[\s\S]*Paddle on 1 and 3/);
  assert.match(line(16), /Watch/);
  assert.match(line(55.5), /hd-line is-low[\s\S]*Copy me/);
  assert.equal(line(40), "");
  const strip = html(React.createElement(RankStrip, { store:storeAt(30), driver:fakeDriver(songAt + 30 * BEAT_MS), room:{ cut:9, field:range(13) }, entrants, mode:"song" }));
  assert.equal((strip.match(/class="hd-rank-chip/g) || []).length, 13, "every rider a chip");
  for (const e of entrants) assert.ok(strip.includes(`>${e.name}<`), e.name);
  assert.match(strip, /hd-rank-cut/);
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

test("rendered: the cut's award cards and its call, the ringed bubble in the strip; the chug-off's call with its rule, the stamp and its caption", () => {
  const start = 2_000_000;
  const results = range(13).map(i => ({ i, place:i + 1, pct:99 - i * 2.5, grade:"ok", out:i >= 10, ...(i === 8 || i === 9 ? { bubble:true } : {}) }));
  const room = { phase:"cut", round:0, rounds:4, drinking:true, startAt:start, endsAt:start + 12000, song:"paddle", field:range(8), out:[12, 11, 10], cut:9, lastRound:false,
    results, awards:[{ id:"perfects", i:2, value:40, label:"Most Perfects" }],
    show:{ grades:start + 400, awards:[start + 2400], line:start + 3600, outs:[{ i:12, at:start + 4400 }, { i:11, at:start + 5800 }, { i:10, at:start + 7200 }], bubble:[8, 9] },
    history:[{ round:0, song:"paddle", field:range(13), out:[12, 11, 10], results }] };
  const store = { state:{ songField:range(13), phaseStart:start } };
  const show = at => html(React.createElement(CutShow, { store, driver:fakeDriver(start + at), room, entrants }));
  assert.doesNotMatch(show(1000), /hd-award/, "no card before its beat");
  assert.match(show(2600), /Most Perfects[\s\S]*Eyob[\s\S]*40/);
  assert.doesNotMatch(show(4000), /hd-award"/, "the cards leave as the line comes");
  assert.match(show(11_000), /Chug-off![\s\S]*Richard[\s\S]*vs[\s\S]*Allan/);
  const strip = html(React.createElement(RankStrip, { store, driver:fakeDriver(start + 5000), room, entrants, mode:"cut" }));
  assert.equal((strip.match(/is-bubble/g) || []).length, 2, "the bubble's pair ringed");
  /* the chug-off */
  const goAt = start + 20_000;
  const chugStore = (chugoff, extra = {}) => ({ state:{ chugoff, done:new Map(), phaseStart:goAt - 7000, chugoffDecidedAt:null, ...extra } });
  const chugRoom = { phase:"chugoff", round:0, history:room.history, chugoff:{ round:0, a:8, b:9, goAt } };
  const chug = (at, chugoff = chugRoom.chugoff) => html(React.createElement(ChugHud, { store:chugStore(chugoff), driver:fakeDriver(at), room:{ ...chugRoom, chugoff }, entrants }));
  assert.match(chug(goAt - 5000), /Chug-off![\s\S]*Last one in against first one out\. First to finish keeps the spot\./, "the first explains itself");
  assert.match(chug(goAt - 1500), /Last one in against first one out/, "for the whole intro");
  assert.match(chug(goAt - 1500), /hd-chugclock is-count[\s\S]*>2</, "3 2 1 in the clock");
  assert.match(chug(goAt + 300), /Chug!/);
  const decided = { ...chugRoom.chugoff, doneAt:{ 9:6000 }, winner:9, by:"chug" };
  assert.match(chug(goAt + 7000, decided), /Keeps the spot[\s\S]*First to finish/);
  assert.match(chug(goAt + 31_000, { ...chugRoom.chugoff, winner:8, by:"forfeit", decidedAt:goAt + 30_000 }), /Won by forfeit/);
  const later = { ...chugRoom, round:1, chugoff:{ round:1, a:3, b:4, goAt }, history:[...room.history, { round:1, results:[{ i:3, bubble:true }] }] };
  assert.doesNotMatch(html(React.createElement(ChugHud, { store:chugStore(later.chugoff), driver:fakeDriver(goAt - 3500), room:later, entrants })), /Last one in/,
    "said once a Cup");
});

test("rendered: Last Call's title (the first says what it is), the board and the bartender, the dark; then who drinks", () => {
  const chart = chartOf("lastcall-lights");
  const cd = chart.countdown;
  const songAt = 3_000_000;
  const hud = (t, lastCall = null) => html(React.createElement(LastCallHud, {
    store:{ state:{ chart, songAt, lastCall, lastCallAt:lastCall?.worst ? songAt + cd.revealAt : null } }, driver:fakeDriver(songAt + t), entrants }));
  assert.match(hud(-2000), /Last Call[\s\S]*The bar closes at zero\. Tap on zero\. Farthest off drinks\./);
  assert.match(hud(cd.introMs - 100), /Farthest off drinks/, "for the whole intro");
  assert.equal(hud(cd.introMs + 500), "");
  assert.equal(hud(cd.verdictAt - 100, { totals:[], worst:[1, 4] }), "", "named by the room, not yet its moment");
  assert.match(hud(cd.verdictAt + 100, { totals:[], worst:[1, 4] }), /Evan and Khoa[\s\S]*drink/);
  assert.match(hud(cd.verdictAt + 100, { totals:[], worst:[2] }), /Eyob[\s\S]*drinks/);
  const slow = chartOf("lastcall-slow");
  assert.doesNotMatch(html(React.createElement(LastCallHud, { store:{ state:{ chart:slow, songAt, lastCall:null } }, driver:fakeDriver(songAt), entrants })), /closes at zero/,
    "said once a Cup");
  const bar = html(React.createElement(Bar, { store:{ state:{ chart, songAt } }, driver:fakeDriver(songAt) }));
  assert.match(bar, /lc-bartender/);
  assert.match(bar, /lc-board is-chalkboard/);
  assert.match(bar, /lc-cord/, "the lights trick hangs its cord");
  assert.match(bar, /lc-dark/);
  assert.match(html(React.createElement(Bar, { store:{ state:{ chart:slow, songAt } }, driver:fakeDriver(songAt) })), /lc-board is-clock/, "the slow trick's clock");
  assert.match(html(React.createElement(Bar, { store:{ state:{ chart:chartOf("lastcall-ticks"), songAt } }, driver:fakeDriver(songAt) })), /lc-foam/);
  const { darkAt, boardOf } = ui.exports;
  assert.equal(darkAt(cd, cd.hideAt - 10), 0);
  assert.ok(darkAt(cd, cd.hideAt + 1000) > 0.9, "dark after the cord");
  assert.equal(darkAt(cd, cd.revealAt), 0, "the lights back for the reveal");
  assert.equal(darkAt(slow.countdown, slow.countdown.hideAt + 1000), 0, "only the lights trick goes dark");
  const board = boardOf("lights");
  assert.ok(board.face.x > board.left && board.face.x < board.left + board.w, "the number on the board's face");
});

test("rendered: the cast has every rider with their name and the exits' props in the cut, the eyes at Last Call, the host, the clean scene", async () => {
  const store = createScreenStore();
  const cast = html(React.createElement(Cast, { store, driver:fakeDriver(0), entrants, phase:"song", room:{ phase:"song", field:range(13), out:[] }, version:1 }));
  for (const e of entrants) assert.ok(cast.includes(`>${e.name}<`), e.name);
  assert.equal((cast.match(/class="fl-rider"/g) || []).length, 13);
  assert.doesNotMatch(cast, /fl-fx/, "no gags in a song");
  const cut = html(React.createElement(Cast, { store, driver:fakeDriver(0), entrants, phase:"cut", room:{ phase:"cut", field:range(9), out:[], results:[] }, version:1 }));
  assert.equal((cut.match(/class="fl-fx"/g) || []).length, 13, "a gag's props for anyone who might leave");
  assert.match(cut, /is-pelican/);
  const bar = html(React.createElement(Cast, { store, driver:fakeDriver(0), entrants, phase:"lastcall", room:{ phase:"lastcall", field:range(4), out:[] }, version:1 }));
  assert.equal((bar.match(/class="fl-eye"/g) || []).length, 13, "eyes for the dark");
  assert.match(html(React.createElement(Host, { store, driver:fakeDriver(0), phase:"song" })), /fl-note/, "the breakdown's note");
  assert.match(html(React.createElement(Scene, { id:"open" })), /sc-water/);
  for (const id of ["open", "rocks", "whirlpool", "falls", "lobby", "podium"]) {
    const scene = html(React.createElement(Scene, { id }));
    assert.doesNotMatch(scene, /sc-piece|sc-whirl|sc-falls|sc-rocks|accent/, `${id}: nothing but the scene`);
  }
  const { readFileSync } = await import("node:fs");
  for (const file of ["float/client/screen/FloatScreen.jsx", "float/client/screen/stage/Cast.jsx"])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /Pieces|accent|scenePieces/, `${file}: no accents`);
  /* no drink break anywhere on the screen */
  for (const file of ["hud/Hud.jsx", "stage/Cast.jsx", "stage/Bar.jsx", "model/song.js", "model/store.js"])
    assert.doesNotMatch(readFileSync(new URL(`../float/client/screen/${file}`, import.meta.url), "utf8"), /Drink!|chuggingAt|drinkSection|drink break/i, `${file}: no drink break`);
  assert.match(html(React.createElement(PlaceholderCritter, { color:"#ff5a4e", critter:"jackrabbit", groom:true })), /cr-crown/);
});

test("a cut re-forms the rows once, after the last out has left, keeping the seat order", () => {
  const room = { phase:"cut", round:0, field:range(13), out:[], cut:9, results:range(13).map(i => ({ i, pct:100 - i * 3, place:i + 1 })) };
  const plan = castPlan({ phase:"cut", room, state:{ songField:range(13) }, entrants });
  assert.deepEqual(plan.water, range(13), "the song's seats until the outs have gone");
  assert.ok(plan.nextWater.every((i, k) => k === 0 || i > plan.nextWater[k - 1]), "the survivors in entrant order");
  assert.ok(Number.isFinite(plan.reform) || plan.reform === null);
  const song = castPlan({ phase:"song", room:{ phase:"song", field:[8, 2, 5], out:[1] }, state:{ songField:[8, 2, 5], scores:new Map([[8, { cup:300 }], [2, { cup:10 }]]) }, entrants });
  assert.deepEqual(song.water, [2, 5, 8], "a song's rows never sort by the Cup");
});

test("the roll call: each name tag pops in seat order in the intro and each song's lead, then stays", () => {
  const songAt = 100000;
  const t0 = songAt - SONG_LEAD_MS + ROLL.SONG_AT;
  assert.equal(rollCallAt({ phase:"song", songAt, seat:0, now:t0 - 10 }), 0, "not called yet");
  assert.equal(rollCallAt({ phase:"song", songAt, seat:3, now:t0 + 2 * ROLL.GAP_MS }), 0, "the fourth waits its turn");
  assert.ok(rollCallAt({ phase:"song", songAt, seat:0, now:t0 + ROLL.POP_MS * 0.6 }) > 1, "pops a little past full size");
  assert.equal(rollCallAt({ phase:"song", songAt, seat:12, now:t0 + 12 * ROLL.GAP_MS + ROLL.POP_MS }), null, "then simply shown");
  assert.equal(rollCallAt({ phase:"song", songAt, seat:0, now:songAt + 20000 }), null, "a screen joining mid-song shows every name");
  assert.equal(rollCallAt({ phase:"cut", songAt, seat:0, now:t0 }), null);
  assert.equal(rollCallAt({ phase:"intro", phaseStart:0, seat:1, now:ROLL.INTRO_AT }), 0);
});


test("Last Call's line-up: the Cup's order until the room ranks it, then its order (closest first)", () => {
  const players = [3, 1, 7, 5];
  assert.deepEqual(barLineUp(players, { totals:[] }, () => null), players, "nothing moves before the room knows");
  assert.deepEqual(barLineUp(players, { totals:[], order:[5, 3, 7, 1] }, () => null), [5, 3, 7, 1]);
  assert.deepEqual(barLineUp(players, { totals:[], order:[5, 3] }, () => null), [5, 3, 1, 7], "anyone it leaves out at the end");
  const reads = { 3:{ q:"late", d:400 }, 1:{ q:"nice", d:-60 }, 7:{ q:"miss", d:null }, 5:{ q:"perfect", d:5 } };
  assert.deepEqual(barLineUp(players, { worst:[7] }, i => reads[i]), [5, 1, 3, 7], "a room without an order: the screen ranks it");
});

test("the offset number's tone: a song's by offsetTone (gold, green, yellow, red; a miss grey), Last Call's by countTone", async () => {
  const { numberTone, countNumberTone } = await import("../float/client/screen/model/tone.js");
  assert.deepEqual([numberTone("perfect", -40), numberTone("nice", 90), numberTone("ok", -150), numberTone("late", 220), numberTone("miss", null)],
    ["gold", "green", "yellow", "red", "grey"]);
  assert.deepEqual([countNumberTone("nice", 80), countNumberTone("ok", -250), countNumberTone("late", 600), countNumberTone("early", -1500), countNumberTone("miss", null)],
    ["green", "yellow", "orange", "red", "red"]);
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../float/client/screen/screen.css", import.meta.url), "utf8");
  for (const tone of ["gold", "green", "yellow", "orange", "red", "grey"]) assert.match(css, new RegExp(`data-tone="${tone}"`), `${tone} drawn`);
});

test("wave B: the blackout bars, every rocket hit a firework sized by its judgement (a miss fizzles), the sky filling after the finale; the same numbers as the sound", async () => {
  const fw = await import("../float/client/screen/model/fireworks.js");
  const sound = await import("../float/client/sound/groove.js");
  assert.equal(fw.ROCKET_BURST_MS, sound.ROCKET_BURST_MS);
  assert.deepEqual({ ...fw.BURST_SIZE }, { ...sound.BURST_SIZE });
  const night = chartOf("fireworks"), drop = chartOf("drop");
  assert.equal(fw.skyBeat(night), sound.skyBeat(night));
  assert.equal(fw.skyBeat(drop), null, "only a song that ends on rockets");
  assert.deepEqual([...fw.darkBars(drop)], [...sound.darkBars(drop)]);
  for (const bar of drop.dark) {
    assert.ok(fw.darkAt(drop, bar * 4 + 0.1) && fw.darkAt(drop, bar * 4 + 3.9), `Drop bar ${bar} dark`);
    assert.ok(!fw.darkAt(drop, (bar + 1) * 4 + 0.1) || drop.dark.includes(bar + 1), "back on the next bar");
  }
  assert.equal(fw.darkAt(chartOf("paddle"), 50), false);
  const songAt = 100000;
  const rocket = night.cues.find(c => c.kind === "rocket" && c.scored);
  const burstAt = songAt + rocket.beat * 500 + fw.ROCKET_BURST_MS;
  const judged = new Map([[0, new Map([[rocket.id, { q:"perfect", at:songAt + rocket.beat * 500 + 30 }]])], [1, new Map([[rocket.id, { q:"late", at:burstAt + 120 }]])],
    [2, new Map([[rocket.id, { q:"miss", at:songAt + rocket.beat * 500 + 550 }]])]]);
  const at = now => fw.fireworksAt({ chart:night, songAt, judged, field:[0, 1, 2], now }).filter(f => !String(f.key).includes(":d"));
  assert.equal(at(songAt + rocket.beat * 500 - 10).length, 0, "nothing before the launch");
  const up = at(burstAt + 200);
  const mine = up.find(f => f.i === 0), late = up.find(f => f.i === 1);
  assert.equal(mine.at, burstAt, "a Perfect bursts a beat after its launch");
  assert.equal(mine.size, 1, "the biggest");
  assert.equal(late.at, burstAt + 120, "or as its hit arrives, if that is later");
  assert.equal(late.size, fw.BURST_SIZE.late, "early and late still pop, small");
  assert.equal(up.find(f => f.i === 2).kind, "fizzle", "a miss fizzles");
  assert.equal(at(burstAt + fw.FIRE.BURST_MS + 200).filter(f => f.kind === "burst").length, 0, "then gone");
  assert.equal(fw.skyAt(night, songAt, songAt + (fw.skyBeat(night) - 0.1) * 500), null);
  const sky = fw.skyAt(night, songAt, songAt + fw.skyBeat(night) * 500 + 2000);
  assert.ok(sky.fill === 1 && sky.bursts.length > 0, "the sky fills, a volley of the winner's bursts");
});

test("practice's four-beat counter: the bar's taps lit by kind, the playhead, and a beat the next bar adds previewed (Keep paddling. Hey! on 4)", async () => {
  const { beatCounterAt, countWord } = await import("../float/client/screen/model/song.js");
  const chart = chartOf("paddle");
  const first = beatCounterAt(chart, 9.3);
  assert.deepEqual(first.beats.map(b => b.kind), ["paddle", null, "paddle", null], "Paddle on 1 and 3");
  assert.equal(first.now, 1, "the beat being played");
  const keep = beatCounterAt(chart, 12.2);
  assert.deepEqual(keep.beats.map(b => [b.kind, b.next]), [["paddle", false], [null, false], ["paddle", false], ["hey", true]], "the Hey on 4 previewed");
  const watch = beatCounterAt(chart, 19.2);
  assert.ok(watch.beats.filter(b => b.kind).every(b => b.demo), "the host's bar");
  assert.equal(beatCounterAt(chart, 40), null, "never in play");
  assert.equal(countWord(chart, "paddle"), "Paddle");
  assert.equal(countWord(chartOf("rock"), "paddle"), "Row");
  assert.equal(countWord(chart, "hey"), "Hey!");
});

test("rowing: a paddle hit alternates stroke and stroke-r along the chart's strokes; a miss slaps flat; the paddle is away to chug, cheer or sulk", async () => {
  const { PADDLE, PADDLE_AWAY, paddleAt, strokeSide } = await import("../float/client/screen/model/motion.js");
  const chart = chartOf("paddle");
  const strokes = chart.cues.filter(c => c.kind === "paddle").slice(0, 6);
  const sides = strokes.map(c => strokeSide(chart, c.id));
  assert.deepEqual(sides, [-1, 1, -1, 1, -1, 1], "left (stroke), right (stroke-r), in turn");
  const pose = side => (side > 0 ? "stroke-r" : "stroke");
  assert.deepEqual(sides.map(pose).slice(0, 2), ["stroke", "stroke-r"]);
  const hit = { c:strokes[0].id, kind:"paddle", q:"perfect", at:1000 };
  const mid = paddleAt(hit, 1000 + PADDLE.MS * 0.3, { side:-1 });
  assert.ok(mid.side === -1 && mid.splash > 0.3 && mid.dy > 0, "the blade bites with a splash");
  assert.equal(paddleAt(hit, 1000 + PADDLE.MS + 1, { side:-1 }).side, 0, "then rests");
  const miss = paddleAt({ ...hit, q:"miss" }, 1000 + 100);
  assert.ok(miss.flat > 0 && miss.side === 0, "a miss slaps flat");
  assert.equal(paddleAt({ ...hit, kind:"hop" }, 1100).side, 0, "another move leaves it at rest");
  for (const pose of ["chug", "cheer", "out"]) assert.ok(PADDLE_AWAY.has(pose));
});

test("v4 auto-rowing: every rider rows on 1 and 3 by the clock (1 left, 3 right) in practice, play and the breakdown; a beat with a cue is the cue's; dark bars and the intro don't", async () => {
  const { autoStrokeAt, PADDLE } = await import("../float/client/screen/model/motion.js");
  const rock = chartOf("rock");
  const taken = new Set(rock.cues.map(c => c.beat));
  const play = rock.sections.find(s => s.kind === "play");
  let rows = 0;
  for (let b = play.from; b < play.to; b += 1) {
    const auto = autoStrokeAt(rock, b + 0.05);
    if (b % 4 !== 0 && b % 4 !== 2) { assert.equal(auto, null, `beat ${b}: only 1 and 3`); continue; }
    if (taken.has(b)) { assert.equal(auto, null, `beat ${b}: the cue's`); continue; }
    assert.deepEqual(auto, { beat:b, side:b % 4 === 0 ? -1 : 1 });
    rows += 1;
    assert.equal(autoStrokeAt(rock, b + (PADDLE.MS + 20) / 500), null, "the stroke ends");
  }
  assert.ok(rows >= 6, "Rock Hop rows through its play (on 1: its hops take 3)");
  assert.equal(autoStrokeAt(rock, 2.05), null, "not in the intro");
  const drop = chartOf("drop");
  for (const bar of drop.dark) assert.equal(autoStrokeAt(drop, bar * 4 + 2.05), null, "not seen in a blackout bar");
  const paddle = chartOf("paddle");
  for (const c of paddle.cues.filter(q => q.kind === "paddle")) assert.equal(autoStrokeAt(paddle, c.beat + 0.05), null, "Paddle Party's strokes are judged, not auto");
});

test("v4 streaks: the badge only at 10, 20 and 30 in a row (Nice or better); Early, Late or a Miss breaks the run, OK holds it", () => {
  const store = createScreenStore();
  const chart = chartOf("rock");
  store.onRoom({ t:"room", phase:"song", round:0, field:[0], chart, songAt:0, s:0 });
  const scored = chart.cues.filter(c => c.scored);
  const hit = (k, q) => store.onEv({ t:"ev", e:"hit", i:0, c:scored[k].id, q, d:q === "miss" ? undefined : 10, s:1000 + k });
  for (let k = 0; k < 9; k += 1) hit(k, "perfect");
  assert.equal(store.state.badges.get(0), undefined);
  hit(9, "ok");
  assert.equal(store.state.badges.get(0), undefined, "OK holds the run, no badge");
  hit(10, "nice");
  assert.equal(store.state.badges.get(0)?.n, 10, "the tenth Nice or better");
  hit(11, "late");
  assert.equal(store.state.streaks.get(0), 0, "broken");
});

test("v4: thirteen is the normal room: in the 4 / 5 / 4 flotilla no name tag sits on another rider's face, and 13 popups at once keep off the faces and tags", () => {
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const real = ["Adi", "Brandon", "Allan", "Evan", "Richard", "Ben", "Chinh", "Jeremy", "Chiang", "Henry", "Khoa", "Eyob", "Sahil"];
  const spots = flotillaLayout(range(13), new Map(range(13).map(i => [i, 60 + (i * 29) % 40])));
  assert.deepEqual([0, 1, 2].map(r => Object.values(spots).filter(s => s.row === r).length), [4, 5, 4]);
  /* a kayak critter: head 240 box px over the waterline, its face a little right of the hull's middle */
  const faces = Object.entries(spots).map(([i, s]) => ({ i:Number(i), x:s.x + 40 * s.scale, y:s.y, scale:s.scale, top:s.y - 240 * s.scale * 1.45 }));
  const faceRect = f => { const half = riderWidth(f.scale) * 0.3; return { i:f.i, x0:f.x - half, x1:f.x + half, y0:f.top + 20 * f.scale, y1:f.top + 0.65 * (f.y - f.top) }; };
  const names = Object.entries(spots).map(([i, s]) => ({ i:Number(i), x:s.x, y:s.y + 30, w:nameWidth(real[i]), h:NAME_H, scale:s.scale }));
  const nameRects = names.map(n => ({ i:n.i, x0:n.x - n.w / 2, x1:n.x + n.w / 2, y0:n.y - n.h / 2, y1:n.y + n.h / 2 }));
  const slots = popupSlots(faces, { names:nameRects });
  const popups = Object.entries(slots).map(([i, sl]) => ({ i:Number(i), x0:sl.x - POPUP_BOX.w * sl.size / 2, x1:sl.x + POPUP_BOX.w * sl.size / 2, y0:sl.y - POPUP_BOX.h * sl.size, y1:sl.y }));
  const nudges = nameSlots(names, { faces, popups });
  const placed = names.map(n => ({ i:n.i, x0:n.x + nudges[n.i].dx - n.w / 2, x1:n.x + nudges[n.i].dx + n.w / 2, y0:n.y + nudges[n.i].dy - n.h / 2, y1:n.y + nudges[n.i].dy + n.h / 2 }));
  for (const tag of placed) {
    for (const f of faces.filter(f => f.i !== tag.i).map(faceRect)) {
      assert.ok(overlap(tag, f) < 0.15 * (tag.x1 - tag.x0) * (tag.y1 - tag.y0), `${real[tag.i]}'s tag clear of ${real[f.i]}'s face`);
    }
    for (const other of placed) if (other.i > tag.i) assert.equal(overlap(tag, other), 0, `${real[tag.i]} and ${real[other.i]} tags apart`);
  }
  for (const p of popups) {
    assert.ok(POPUP_BOX.w * slots[p.i].size <= 160, "compact");
    for (const f of faces.filter(f => f.i !== p.i).map(faceRect)) assert.ok(overlap(p, f) < 0.12 * (p.x1 - p.x0) * (p.y1 - p.y0), `${real[p.i]}'s popup clear of ${real[f.i]}'s face`);
    for (const t of placed) assert.ok(overlap(p, t) < 0.1 * (t.x1 - t.x0) * (t.y1 - t.y0), `${real[p.i]}'s popup clear of ${real[t.i]}'s tag`);
    for (const q of popups) if (q.i > p.i) assert.ok(overlap(p, q) < 0.05 * (p.x1 - p.x0) * (p.y1 - p.y0), "popups apart");
  }
});
