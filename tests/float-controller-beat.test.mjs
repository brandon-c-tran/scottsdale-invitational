/* The beat on the phone (float/client/controller/rhythm.js): a touch's own
   time stamped onto the room's clock, the gun (the band's predicted one on
   the grid), the call at a touch and its commit, too fast, the streak and
   its levels, a missed beat, practice, the room's truth correcting the
   count and the call, and the stamps. The phone's count is checked against
   the room's own simulation stroke for stroke. */
import test from "node:test";
import assert from "node:assert/strict";
import { POWER_OF, SETTLE_MS, STAMPS, beatGun, beatMode, createRhythm, dropLevel, meterOf, meterSteps, missedAt, nextBeatAt,
  serverStamp, settleFor, stampOfQ } from "../float/client/controller/rhythm.js";
import { predictedGun } from "../float/client/sound/index.js";
import { BEAT_MS, levelFloor } from "../float/shared/beat.js";
import { BEAT, TIMING } from "../float/shared/tuning.js";
import { createRace, applyInput, stepRace } from "../float/shared/sim.js";

const GUN = 100000;
const at = (k, d = 0) => GUN + k * BEAT_MS + d;

test("a touch is stamped on the room's clock at the moment it landed, not when it was handled", () => {
  /* the event landed 40 ms before the handler ran: the room's clock then */
  assert.equal(serverStamp(960, { perfNow:1000, serverNow:5000 }), 4960);
  assert.equal(serverStamp(NaN, { perfNow:1000, serverNow:5000 }), 5000, "no event time: now");
});

test("the gun: the room's in the countdown and the race, the band's predicted one on the grid, none elsewhere", () => {
  assert.equal(beatGun({ phase:"race", startAt:GUN, endsAt:GUN + 180000 }), GUN);
  assert.equal(beatGun({ phase:"countdown", s:GUN - 3000, startAt:GUN, endsAt:GUN }), GUN);
  const grid = { phase:"grid", startAt:GUN - 7000, endsAt:GUN - 3000 };
  assert.equal(beatGun(grid), GUN, "the grid's end plus the count-in");
  assert.equal(beatGun(grid), predictedGun(grid), "on the very beats the music plays");
  assert.equal(TIMING.COUNTDOWN_MS % BEAT_MS, 0, "the 3-2-1 lands on beats");
  for (const phase of ["lobby", "intro", "cut", "podium"]) assert.equal(beatGun({ phase, startAt:GUN, endsAt:GUN }), null, phase);
  assert.equal(beatGun(null), null);
  assert.equal(beatMode("race"), "live");
  assert.equal(beatMode("grid"), "practice");
  assert.equal(beatMode("countdown"), "practice");
  assert.equal(beatMode("cut"), null);
});

test("the call: on the beat Perfect, close Good, off it Early or Late; a peek claims nothing, a stroke claims its beat", () => {
  const r = createRhythm();
  assert.equal(r.peek(at(4), GUN).q, "perfect");
  assert.deepEqual(r.peek(at(4, 79), GUN), { k:4, d:79, q:"perfect", onBeat:true });
  assert.equal(r.peek(at(4, -120), GUN).q, "good");
  assert.equal(r.peek(at(5, -200), GUN).q, "early");
  assert.deepEqual(r.peek(at(5, 210), GUN), { k:5, d:210, q:"late", onBeat:false });
  assert.equal(r.peek(at(4), null), null, "no gun, no call");
  /* two thumbs land in one beat: both peek Perfect, the first to stroke takes it, the second is too fast */
  const a = r.peek(at(6, -10), GUN), b = r.peek(at(6, 30), GUN);
  assert.equal(a.q, "perfect");
  assert.equal(b.q, "perfect");
  assert.equal(r.commit(a, at(6, 100)).q, "perfect");
  assert.equal(r.commit(b, at(6, 140)).q, "fast");
  assert.equal(r.peek(at(6, 60), GUN).q, "fast", "the beat is taken");
  assert.equal(r.peek(at(7), GUN).q, "perfect", "the next one is free");
});

test("too fast is the room's reading: an early stroke in beat k makes the rest of beat k too fast", () => {
  const r = createRhythm();
  assert.equal(r.judge(at(3, -190), GUN).q, "early");
  assert.equal(r.judge(at(3, -20), GUN).q, "fast", "Perfect timing, but the beat was already stroked");
  assert.equal(r.lastBeat(), 3);
});

test("the streak: on-beat strokes in a row reach Rhythm at 4, Groove at 8, Locked in at 16; any stroke off the beat starts over", () => {
  const r = createRhythm();
  r.setMode("practice");
  const levels = [];
  for (let k = 1; k <= 16; k++) { r.judge(at(k, k % 3 ? 20 : -130), GUN); levels.push(r.meter(at(k, 200), GUN).level); }
  assert.deepEqual(levels, [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3]);
  const top = r.meter(at(16, 200), GUN);
  assert.deepEqual({ name:top.name, top:top.top, fill:top.fill, streak:top.streak }, { name:"Locked in", top:true, fill:1, streak:16 });
  r.judge(at(17, 220), GUN);
  assert.equal(r.meter(at(17, 230), GUN).streak, 0, "late: back to nothing");
});

test("a pause costs one level, not everything: a missed beat drops to the level below's floor, once, shown when the room would judge it", () => {
  const r = createRhythm();
  r.setMode("practice");
  for (let k = 1; k <= 10; k++) r.judge(at(k), GUN);
  assert.equal(r.meter(at(10, 100), GUN).name, "Groove");
  /* beat 11 goes by unstroked: the room judges it missed BEAT.MISS_GRACE_MS after */
  assert.equal(r.dueAt(at(10, 100), GUN), missedAt(10, GUN));
  assert.equal(missedAt(10, GUN), at(11, BEAT.MISS_GRACE_MS));
  assert.equal(r.meter(missedAt(10, GUN) - 1, GUN).streak, 10);
  assert.equal(r.meter(missedAt(10, GUN), GUN).streak, levelFloor(1), "Rhythm's floor");
  assert.equal(r.meter(at(30), GUN).streak, levelFloor(1), "a long drink costs the same one level");
  r.judge(at(31), GUN);
  assert.equal(r.meter(at(31, 50), GUN).streak, levelFloor(1) + 1, "and the next stroke counts on from there");
  assert.equal(dropLevel(3), 0);
  assert.equal(dropLevel(20), 8);
});

test("practice is the phone's alone; a change of mode starts the count over", () => {
  const r = createRhythm();
  assert.equal(r.setMode("practice"), true);
  for (let k = 1; k <= 5; k++) r.judge(at(k), GUN);
  assert.equal(r.room({ streak:0, level:0, q:"late" }, at(5, 400)), null, "no room before the gun");
  assert.equal(r.meter(at(5, 400), GUN).streak, 5);
  assert.equal(r.setMode("practice"), false);
  assert.equal(r.setMode("live"), true, "the gun");
  assert.equal(r.meter(at(6), GUN).streak, 0);
  assert.equal(r.lastBeat(), null);
});

test("the room's truth: the phone's count at once, the room's once its `me` has caught up with the stroke", () => {
  const r = createRhythm({ settle:250 });
  r.setMode("live");
  /* an older room that says no streak: the phone's own count stands */
  r.judge(at(1), GUN);
  assert.equal(r.room({ place:3 }, at(1, 400)), null);
  assert.equal(r.meter(at(1, 400), GUN).streak, 1);
  /* the room speaks: a frame too soon after the stroke cannot carry it, a later one can */
  r.judge(at(2), GUN);
  r.room({ streak:1, level:0, q:"perfect" }, at(2, 100));
  assert.equal(r.meter(at(2, 120), GUN).streak, 2, "the room's count is behind the stroke");
  r.room({ streak:2, level:0, q:"perfect" }, at(2, 300));
  assert.equal(r.meter(at(2, 320), GUN).streak, 2);
  /* the room disagrees (it heard the stroke as off): its word wins and the next stroke counts from it */
  r.judge(at(3), GUN);
  assert.equal(r.meter(at(3, 10), GUN).streak, 3);
  r.room({ streak:0, level:0, q:"fast" }, at(3, 300));
  assert.equal(r.meter(at(3, 320), GUN).streak, 0);
  r.judge(at(4), GUN);
  assert.equal(r.meter(at(4, 10), GUN).streak, 1);
  /* the room's level is the level shown */
  r.room({ streak:9, level:2, q:"good" }, at(4, 300));
  assert.equal(r.meter(at(4, 320), GUN).name, "Groove");
});

test("the room's word on the call: the first `me` that has caught up and calls the last stroke otherwise corrects it, once", () => {
  const r = createRhythm({ settle:250 });
  r.setMode("live");
  assert.equal(r.judge(at(1), GUN).q, "perfect");
  assert.equal(r.room({ streak:0, level:0, q:"late" }, at(1, 100)), null, "too soon to be about this stroke");
  assert.equal(r.room({ streak:0, level:0, q:"late" }, at(1, 300)), "late");
  assert.equal(r.room({ streak:0, level:0, q:"late" }, at(1, 400)), null, "said once");
  r.judge(at(2), GUN);
  assert.equal(r.room({ streak:1, level:0, q:"perfect" }, at(2, 300)), null, "the same call");
  /* a stroke the room will not hear (practice) waits for no word */
  const p = createRhythm({ settle:250 });
  p.setMode("live");
  p.commit(p.peek(at(1), GUN), at(1), { heard:false });
  assert.equal(p.room({ streak:0, level:0, q:"late" }, at(1, 300)), null);
  /* subscribers hear every change */
  let heard = 0;
  const off = r.subscribe(() => { heard += 1; });
  r.judge(at(3), GUN);
  off();
  r.judge(at(4), GUN);
  assert.equal(heard, 1);
  assert.ok(r.version() > 0);
});

test("the phone's count is the room's: the same strokes through the room's own simulation", () => {
  const course = { id:"beat", line:Array.from({ length:151 }, (_, n) => [n * 4, 0, 40]), flow:[[0, 0], [600, 0]],
    elev:[[0, 0], [600, 0]], rocks:[], islands:[], zones:[{ k:"bar", s0:560, s1:600, side:1 }],
    legs:[{ id:"t", name:"Test", s0:0, s1:600, grid:40, finish:570 }] };
  const race = createRace({ course, leg:0, seed:3, drinking:false, field:[{ i:0, floatie:"classic", drinks:true }] });
  const rider = race.riders[0];
  const phone = createRhythm();
  phone.setMode("practice");
  /* [k, d]: a run into Groove, an early stroke and a too fast one in its beat, a gap, a run back, a late one, a missed beat */
  const plan = [];
  for (let k = 1; k <= 12; k++) plan.push([k, (k * 37) % 150 - 70]);
  plan.push([13, -200], [13, -10], [14, 30]);
  for (let k = 18; k <= 30; k++) plan.push([k, k % 2 ? 60 : -60]);
  plan.push([31, 205]);
  for (let k = 32; k <= 37; k++) plan.push([k, 0]);
  plan.push([39, 10], [40, -150], [40, 100], [41, 0]);
  for (const [k, d] of plan) {
    while (race.t * 1000 + 1e-6 < k * BEAT_MS + d) stepRace(race, course);
    applyInput(race, 0, { t:"stroke", side:k % 2 ? "L" : "R", p:1, k, d });
    const call = phone.judge(k * BEAT_MS + d, 0);
    assert.equal(call.q, rider.q, `beat ${k} ${d}: the call`);
    assert.equal(phone.meter(k * BEAT_MS + d, 0).streak, rider.streak, `beat ${k} ${d}: the streak`);
    assert.equal(phone.meter(k * BEAT_MS + d, 0).level, rider.level, `beat ${k} ${d}: the level`);
  }
  /* and a pause, judged on the room's clock */
  const last = plan[plan.length - 1][0];
  while (race.t * 1000 < missedAt(last, 0) + 100) stepRace(race, course);
  assert.equal(phone.meter(race.t * 1000, 0).streak, rider.streak, "after a pause");
});

test("the meter: three steps filling toward Rhythm, Groove and Locked in", () => {
  assert.deepEqual(meterSteps(0).map(s => s.fill), [0, 0, 0]);
  assert.deepEqual(meterSteps(6).map(s => s.fill), [1, 0.5, 0]);
  assert.deepEqual(meterSteps(12).map(s => s.fill), [1, 1, 0.5]);
  assert.deepEqual(meterSteps(40).map(s => s.fill), [1, 1, 1]);
  assert.deepEqual(meterSteps(0).map(s => s.name), ["Rhythm", "Groove", "Locked in"]);
  assert.deepEqual(meterOf(6), { streak:6, level:1, name:"Rhythm", top:false, fill:0.5 });
  assert.equal(meterOf(0).name, "", "no name below Rhythm");
  assert.equal(meterOf(3, 2).name, "Groove", "the room's level, when it says one");
});

test("the stamps, the clock and the sound's weight", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(STAMPS).map(([q, s]) => [q, `${s.text}/${s.tone}`])),
    { perfect:"Perfect/gold", good:"Good/white", early:"Early/red", late:"Late/red", fast:"Too fast/red" });
  assert.equal(stampOfQ("nonsense").tone, "red");
  assert.ok(POWER_OF.perfect > POWER_OF.good && POWER_OF.good > POWER_OF.early);
  assert.equal(nextBeatAt(at(3, 1), GUN), at(4));
  assert.equal(nextBeatAt(at(3), GUN), at(3));
  assert.equal(settleFor(null), 260);
  assert.equal(settleFor(10), SETTLE_MS);
  assert.equal(settleFor(5000), 700);
});
