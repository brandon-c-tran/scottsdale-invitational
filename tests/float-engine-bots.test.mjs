/* Float's computer paddlers (float/shared/bots.js): they finish every leg in
   sane times by skill, keep off the rocks, drink in calm water or at the
   takeout, and do it all the same way for the same seed. */
import test from "node:test";
import assert from "node:assert/strict";
import { COURSE, frameAt, islandSpan, legAt } from "../float/shared/course.js";
import { createRace, applyInput, stepRace, finishAt } from "../float/shared/sim.js";
import { createBot, botInputs, botBalloon, racingLine, lineAt, botSkills, botFloatie } from "../float/shared/bots.js";
import { RADIUS, TIMING } from "../float/shared/tuning.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";

const SKILLS = [1, 0.8, 0.6, 0.4, 0.2];

function raceLeg(leg, seed, { drinking = true, floaties = null } = {}) {
  const field = SKILLS.map((_, i) => ({ i, floatie:floaties ? floaties[i % floaties.length] : "classic", drinks:true }));
  const race = createRace({ course:COURSE, leg, seed, drinking, field });
  const bots = SKILLS.map((skill, i) => createBot({ i, skill, seed, leg, course:COURSE }));
  const inputs = [];
  while (race.t < TIMING.HARD_CAP_MS / 1000 && !race.riders.every(rider => finishAt(rider) !== null)) {
    for (const bot of bots) for (const input of botInputs(race, COURSE, bot)) {
      applyInput(race, bot.i, input);
      inputs.push(input.t);
    }
    stepRace(race, COURSE);
  }
  return { race, bots, inputs };
}

test("bots finish every leg inside the cap, strong ones in 55 to 90 s, the sloppy within reason", () => {
  for (let leg = 0; leg < COURSE.legs.length; leg += 1) {
    for (const seed of [1, 2]) {
      const { race } = raceLeg(leg, seed);
      const times = race.riders.map(finishAt);
      assert.ok(times.every(time => time !== null), `leg ${leg} seed ${seed}: everyone placed (${times})`);
      assert.ok(times[0] >= 55 && times[0] <= 90, `leg ${leg} strong ${times[0]}`);
      assert.ok(times[4] <= 150, `leg ${leg} sloppy ${times[4]}`);
      const ranked = times.slice().sort((a, b) => a - b);
      assert.ok(times[0] <= ranked[2], `leg ${leg}: the strongest is among the leaders`);
    }
  }
});

test("bots are deterministic for a seed, and different seeds race differently", () => {
  const a = raceLeg(1, 7), b = raceLeg(1, 7), c = raceLeg(1, 8);
  assert.deepEqual(a.race.riders.map(finishAt), b.race.riders.map(finishAt));
  assert.notDeepEqual(a.race.riders.map(finishAt), c.race.riders.map(finishAt));
});

test("bots send a phone's messages: strokes, thumbs off to drink, the drink; most drink in calm water", () => {
  let midRace = 0, atTakeout = 0, total = 0;
  for (let leg = 0; leg < COURSE.legs.length; leg += 1) {
    const { race, inputs } = raceLeg(leg, 3);
    assert.ok(inputs.includes("stroke") && inputs.includes("hands") && inputs.includes("drink"));
    for (const rider of race.riders) {
      total += 1;
      if (rider.drinkAt < rider.arriveAt) midRace += 1;
      else {
        atTakeout += 1;
        assert.ok(rider.drinkAt - rider.arriveAt <= 3.6, "a dry arrival drinks within a few seconds");
      }
    }
  }
  assert.ok(midRace / total >= 0.7, `${midRace} of ${total} drank on the water`);
  void atTakeout;
});

test("the racing line keeps off rocks, the island and the whirlpool; each variant takes its channel", () => {
  const pool = COURSE.zones.find(zone => zone.k === "whirlpool");
  const split = COURSE.zones.find(zone => zone.k === "split");
  for (const variant of ["left", "right"]) {
    const line = racingLine(COURSE, variant);
    assert.equal(line, racingLine(COURSE, variant), "cached");
    for (const [s, d] of line) {
      const f = frameAt(COURSE, s);
      const x = f.x + f.nx * d, y = f.y + f.ny * d;
      assert.ok(Math.abs(d) <= f.w / 2 - RADIUS, `inside at ${s}`);
      for (const [rx, ry, r] of COURSE.rocks) assert.ok(Math.hypot(x - rx, y - ry) >= r + RADIUS + 0.2, `${variant} clear of a rock at s ${s}`);
      for (const [ix, iy, r] of COURSE.islands) assert.ok(Math.hypot(x - ix, y - iy) >= r + RADIUS, `${variant} off the island at s ${s}`);
      if (s >= pool.s0 && s <= pool.s1) assert.ok(Math.hypot(x - pool.x, y - pool.y) >= pool.r * 0.8, `${variant} wide of the whirlpool`);
    }
    const mid = (split.s0 + split.s1) / 2;
    const span = islandSpan(COURSE, mid);
    const d = lineAt(line, mid);
    assert.ok(variant === "left" ? d > span[1] : d < span[0], `${variant} channel`);
  }
});

test("eliminated bots throw at someone still racing; skills spread from sloppy to strong; any floatie", () => {
  const { race } = raceLeg(0, 4);
  const fresh = createRace({ course:COURSE, leg:1, seed:4, field:[{ i:2, floatie:"classic" }, { i:5, floatie:"shark" }] });
  const bot = createBot({ i:9, skill:0.5, seed:4, leg:1 });
  let target = null;
  for (let t = 0; t < 20 && target === null; t += 0.5) target = botBalloon(bot, fresh, t);
  assert.ok([2, 5].includes(target));
  /* nobody left on the water: nothing to throw at */
  const empty = botBalloon(createBot({ i:9, skill:0.5, seed:4 }), race, 9999);
  assert.ok(empty === null || race.riders.some(rider => !rider.arrived));
  const skills = botSkills(12, 3);
  assert.equal(skills.length, 12);
  assert.ok(Math.min(...skills) <= 0.25 && Math.max(...skills) >= 0.9);
  assert.deepEqual(botSkills(12, 3), skills);
  assert.ok(FLOATIE_IDS.includes(botFloatie("x")));
  assert.equal(botFloatie("x"), botFloatie("x"));
  void legAt;
});
