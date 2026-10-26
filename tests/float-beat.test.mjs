/* The beat (float/PROTOCOL.md "The beat"): one judgement for the phone and the room. */
import test from "node:test";
import assert from "node:assert/strict";
import { BEAT_MS, judge, judgeStroke, levelOf, levelFloor, beatAt, beatPhase } from "../float/shared/beat.js";

test("the grid: a beat every 500 ms from the gun", () => {
  assert.equal(BEAT_MS, 500);
  assert.deepEqual(beatAt(10_000 + 1000 + 30, 10_000), { k:2, d:30 });
  assert.deepEqual(beatAt(10_000 + 760, 10_000), { k:2, d:-240 });
  assert.equal(beatPhase(10_000, 10_000), 0);
  assert.equal(beatPhase(10_250, 10_000), 0.5);
});

test("the judgement: perfect, good, early, late, and too fast in the same beat", () => {
  assert.equal(judge(4, 0).q, "perfect");
  assert.equal(judge(4, -80).q, "perfect");
  assert.equal(judge(4, 120).q, "good");
  assert.equal(judge(4, -200).q, "early");
  assert.equal(judge(4, 200).q, "late");
  assert.deepEqual(judge(4, 10, { lastBeat:4 }), { q:"fast", onBeat:false });
  assert.equal(judge(5, 10, { lastBeat:4 }).onBeat, true);
  assert.equal(judgeStroke(5000 + 2000 + 40, 5000).q, "perfect");
});

test("the levels: 4 Rhythm, 8 Groove, 16 Locked in; a missed beat drops to the level's floor", () => {
  assert.deepEqual([0, 3, 4, 7, 8, 15, 16, 40].map(levelOf), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(levelFloor(2), 8);
  assert.equal(levelFloor(levelOf(11) - 1), 4);
});
