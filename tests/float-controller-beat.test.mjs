/* The beat on the phone (float/client/controller: rhythm.js, controllerModel.js):
   the host's calls as the bubble shows them, each word on its own beat, a
   phrase together until its last answer (Paddle Party's Ready, Rock Hop's
   ba notes, Spin Cycle's spins, The Drop's countdown); where the song is at
   any moment (the round card, the intro, practice, play A and B, the
   breakdown, the outro, after); and the cheer's gate. */
import test from "node:test";
import assert from "node:assert/strict";
import { SONG_IDS, breakdownSection, chartOf, cueTime, sectionsOf } from "../float/shared/chart.js";
import { ANSWER_HOLD, CALL_WORDS, pendingCalls, songView } from "../float/client/controller/controllerModel.js";
import { createGate } from "../float/client/controller/rhythm.js";

const SONG_AT = 2_000_000;
const words = (chart, beat) => pendingCalls(chart, beat).map(call => `${call.word}${call.answered ? "~" : ""}`).join(" ");

test("Paddle Party: Ready on its beat, two beats before your Hey!; the paddles have no call", () => {
  const paddle = chartOf("paddle");
  /* practice's last bar is P.PH: your first hey on beat 23, called on 21 (the host's demo of it was beat 19) */
  assert.equal(words(paddle, 20.9), "");
  assert.equal(words(paddle, 21), "Ready");
  assert.equal(words(paddle, 22.9), "Ready");
  assert.equal(words(paddle, 23 + ANSWER_HOLD - 0.01), "Ready", "held a quarter beat past its answer");
  assert.equal(words(paddle, 23 + ANSWER_HOLD), "");
  /* a paddle bar: nothing */
  assert.equal(words(paddle, 9), "");
  /* Hey! Hey! on 4 and its "and": Ready, Ready a half beat apart, one bubble */
  const double = paddle.cues.find((cue, k) => cue.kind === "hey" && paddle.cues[k + 1]?.kind === "hey" && paddle.cues[k + 1].beat === cue.beat + 0.5);
  assert.equal(words(paddle, double.call), "Ready");
  assert.equal(words(paddle, double.call + 0.5), "Ready Ready");
  assert.equal(words(paddle, double.beat + 0.3), "Ready~ Ready", "the first answered, the phrase still up");
  assert.equal(words(paddle, double.beat + 0.5 + ANSWER_HOLD), "");
  assert.equal(CALL_WORDS.hey, "Ready");
});

test("Rock Hop: the host's ba notes, then your hops two beats later (the strokes under them have no call)", () => {
  const rock = chartOf("rock");
  const hops = rock.cues.filter(cue => cue.kind === "hop" && !cue.demo);
  const double = hops.find((cue, k) => hops[k + 1]?.beat === cue.beat + 0.5);
  assert.ok(double, "a pair of hops on a beat and its and");
  assert.equal(double.call, double.beat - 2);
  assert.equal(words(rock, double.call), "Ba");
  assert.equal(words(rock, double.call + 0.5), "Ba Ba");
  assert.equal(words(rock, double.beat + 0.3), "Ba~ Ba");
  assert.equal(words(rock, double.beat + 0.5 + ANSWER_HOLD), "");
});

test("Spin Cycle: the host spins, you echo a beat later", () => {
  const spin = chartOf("spin");
  const first = spin.cues.find(cue => cue.kind === "spin");
  assert.equal(words(spin, first.call - 0.1), "");
  assert.equal(words(spin, first.call), "Spin");
  assert.equal(words(spin, first.beat + ANSWER_HOLD), "");
});

test("The Drop: the music cuts, three, two, one, and one tap on the drop", () => {
  const drop = chartOf("drop");
  const cue = drop.cues.find(item => item.kind === "drop");
  assert.equal(words(drop, cue.beat - 3), "3");
  assert.equal(words(drop, cue.beat - 2), "3 2");
  assert.equal(words(drop, cue.beat - 1), "3 2 1");
  assert.equal(words(drop, cue.beat + 0.1), "3 2 1", "up until a quarter beat past the drop");
  assert.deepEqual(pendingCalls(drop, cue.beat - 1).map(call => call.kind), ["drop", "drop", "drop"]);
  assert.equal(words(drop, cue.beat + ANSWER_HOLD), "");
});

test("no chart, no beat: no bubble", () => {
  assert.deepEqual(pendingCalls(null, 4), []);
  assert.deepEqual(pendingCalls(chartOf("paddle"), NaN), []);
});

test("where the song is: the card in the lead, the intro, practice, play A, the breakdown, play B, the outro, after", () => {
  for (const id of SONG_IDS) {
    const chart = chartOf(id);
    const at = beat => songView(chart, SONG_AT, cueTime(SONG_AT, beat));
    const card = songView(chart, SONG_AT, SONG_AT - 1200);
    assert.equal(card.moment, "card", id);
    assert.equal(card.lead, 1200);
    const sections = sectionsOf();
    const breakdown = breakdownSection(chart);
    assert.deepEqual([at(0).moment, at(7.9).moment], ["intro", "intro"], id);
    assert.equal(at(sections[1].from).moment, "practice", id);
    assert.deepEqual([at(sections[2].from).moment, at(sections[2].from).half], ["play", "A"], id);
    assert.equal(at(breakdown.from).moment, "breakdown", id);
    assert.equal(at(breakdown.to - 0.01).moment, "breakdown", id);
    assert.deepEqual([at(breakdown.to).moment, at(breakdown.to).half], ["play", "B"], id);
    assert.equal(at(chart.beats - 1).moment, "outro", id);
    assert.equal(at(chart.beats).moment, "after", id);
  }
  assert.equal(songView(null, SONG_AT, SONG_AT).moment, "card", "a song with no chart yet waits on the card");
});

test("the cheer: at most twice a second", () => {
  const gate = createGate(2);
  assert.equal(gate.allow(1000), true);
  assert.equal(gate.allow(1100), false);
  assert.equal(gate.allow(1499), false);
  assert.equal(gate.allow(1500), true);
  assert.equal(gate.allow(NaN), false);
  gate.reset();
  assert.equal(gate.allow(1501), true);
});
