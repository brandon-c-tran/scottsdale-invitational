/* Float's physics (float/shared/sim.js, tuning.js): strokes, stamina, the
   current, collisions, banks, rocks, flips, balloons and the drink rule.
   Most checks race on a synthetic straight channel so one effect shows at a
   time; the Drop's flips use the real river. */
import test from "node:test";
import assert from "node:assert/strict";
import { COURSE, frameAt, nearestS, legAt } from "../float/shared/course.js";
import { createRace, applyInput, stepRace, throwBalloon, rows, finishAt, riderOf, flagsOf, judgeBeat } from "../float/shared/sim.js";
import { FLAG, unpackRow, wrapAngle, levelOfFlags } from "../float/shared/protocol.js";
import { DT, RADIUS, FLIP, BALLOON, FLOOD, BEAT, physicsOf } from "../float/shared/tuning.js";
import { BEAT_MS, QUALITY_GAIN, LEVEL_GAIN, levelFloor } from "../float/shared/beat.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";

/* a straight channel along +x, `width` wide, the current `flow` m/s */
function channel({ width = 40, flow = 0, length = 600, rocks = [], zones = [] } = {}) {
  const line = [];
  for (let x = 0; x <= length; x += 4) line.push([x, 0, width]);
  return { id:"test", line, flow:[[0, flow], [length, flow]], elev:[[0, 0], [length, 0]], rocks, islands:[],
    zones:[{ k:"bar", s0:length - 40, s1:length, side:1 }, ...zones],
    legs:[{ id:"t", name:"Test", s0:0, s1:length, grid:40, finish:length - 30 }] };
}
const solo = (course, floatie = "classic", extra = {}) => createRace({ course, leg:0, seed:3, drinking:false,
  field:[{ i:0, floatie, drinks:true, ...extra }] });
const run = (race, course, seconds, each = () => {}) => {
  const end = race.t + seconds;
  while (race.t < end - 1e-9) { each(race); stepRace(race, course); }
};
/* a paddler: strokes at `rate` a second, sides from `side(n)` */
const paddler = (rate, side = n => (n % 2 ? "R" : "L"), p = 1, i = 0) => {
  let n = 0, next = 0;
  return race => {
    if (race.t + 1e-9 < next) return;
    applyInput(race, i, { t:"stroke", side:side(n), p });
    n += 1;
    next += 1 / rate;
  };
};
/* a paddler on the beat: one stroke a beat at offset d (ms), stamped as a
   phone stamps it */
const beatPaddler = ({ side = n => (n % 2 ? "R" : "L"), p = 1, i = 0, d = 0, from = 1 } = {}) => {
  let k = from, n = 0;
  return race => {
    if (race.t * 1000 + 1e-6 < k * BEAT_MS + d) return;
    applyInput(race, i, { t:"stroke", side:side(n), p, k, d });
    n += 1;
    k += 1;
  };
};

test("alternating strokes go straight, and paddling beats drifting", () => {
  const still = channel();
  const race = solo(still);
  const start = { ...race.riders[0] };
  run(race, still, 20, beatPaddler());
  const rider = race.riders[0];
  assert.ok(Math.abs(wrapAngle(rider.a - start.a)) < 0.35, `heading drifted ${rider.a}`);
  assert.ok(rider.x - start.x > 35, `went ${rider.x - start.x} m`);
  /* the mean heading sits half a stroke toward the first stroke's turn: a gentle drift, not a turn */
  assert.ok(Math.abs(rider.y - start.y) < 0.25 * (rider.x - start.x), "and straight");
  /* in a current: the paddler pulls well ahead of a drifter */
  const river = channel({ flow:2 });
  const two = createRace({ course:river, leg:0, seed:1, drinking:false,
    field:[{ i:0, floatie:"classic" }, { i:1, floatie:"classic" }] });
  two.riders[1].y = two.riders[0].y;
  two.riders[1].x = two.riders[0].x - 6;
  run(two, river, 25, beatPaddler());
  const [paddling, drifting] = two.riders;
  assert.ok(paddling.x - drifting.x > 40, `ahead by ${(paddling.x - drifting.x).toFixed(1)} m`);
  assert.ok(drifting.x - (two.riders[1].x - 0) <= 0 || drifting.vx > 1.5, "the drifter rides the current");
});

test("a left stroke yaws right, a right stroke yaws left; Turn sets how far", () => {
  const still = channel();
  const turnOf = (floatie, side) => {
    const race = solo(still, floatie);
    const a0 = race.riders[0].a;
    applyInput(race, 0, { t:"stroke", side, p:1 });
    run(race, still, 2);
    return wrapAngle(race.riders[0].a - a0);
  };
  assert.ok(turnOf("classic", "L") < -0.15, "left stroke: clockwise");
  assert.ok(turnOf("classic", "R") > 0.15, "right stroke: counter-clockwise");
  assert.ok(Math.abs(turnOf("flamingo", "R")) > Math.abs(turnOf("classic", "R")) * 1.15, "Turn 5 turns further");
  assert.ok(Math.abs(turnOf("pizza", "R")) < Math.abs(turnOf("classic", "R")), "Turn 2 less");
  /* one side only spins you round */
  const race = solo(still);
  let turned = 0, last = race.riders[0].a;
  const lefts = beatPaddler({ side:() => "L" });
  run(race, still, 6, r => {
    lefts(r);
    turned += wrapAngle(r.riders[0].a - last);
    last = r.riders[0].a;
  });
  assert.ok(turned < -2, `keeps turning clockwise: ${turned}`);
});

/* strokes on beats k = from.. with offsets d(k), the race stepped to each; returns the events */
function beatRun(race, course, { from = 1, to, d = () => 0, skip = () => false, i = 0 }) {
  const events = [];
  for (let k = from; k <= to; k += 1) {
    if (skip(k)) continue;
    const offset = d(k);
    while (race.t * 1000 + 1e-6 < k * BEAT_MS + offset) events.push(...stepRace(race, course));
    applyInput(race, i, { t:"stroke", side:k % 2 ? "L" : "R", p:1, k, d:offset });
  }
  events.push(...stepRace(race, course));
  return events;
}

test("the beat: on-beat strokes build the streak through Rhythm, Groove and Locked in; the flags carry the level", () => {
  const still = channel({ length:900 });
  const race = solo(still);
  const rider = race.riders[0];
  const events = beatRun(race, still, { to:16, d:k => (k % 4 ? 20 : -130) });
  assert.equal(rider.streak, 16);
  assert.equal(rider.level, 3);
  assert.equal(rider.q, "good", "the last stroke was 130 ms early: good");
  assert.deepEqual(events.filter(ev => ev.e === "groove").map(ev => [ev.i, ev.level]), [[0, 1], [0, 2], [0, 3]]);
  const f = flagsOf(rider, race.t);
  assert.equal(levelOfFlags(f), 3);
  assert.ok(f & FLAG.STREAK_1 && f & FLAG.STREAK_2);
  assert.equal(rows(race)[0][4] >> 8 & 3, 3, "the snapshot row too");
  assert.equal(rider.st.perfect + rider.st.good, 16);
  assert.equal(rider.st.maxStreak, 16);
});

test("the beat: an early, late, too fast or unbelievable stroke resets the streak", () => {
  const still = channel({ length:900 });
  for (const [label, stroke] of [
    ["early", { k:9, d:-200 }], ["late", { k:9, d:210 }],
    ["fast", { k:8, d:40 }],            /* a second stroke in beat 8 */
    ["stale", { k:30, d:0 }],           /* far from the room's clock */
    ["impossible", { k:9, d:400 }],     /* past half a beat */
  ]) {
    const race = solo(still);
    const rider = race.riders[0];
    beatRun(race, still, { to:8 });
    assert.equal(rider.level, 2, label);
    while (race.t * 1000 < 9 * BEAT_MS - 260) stepRace(race, still);
    applyInput(race, 0, { t:"stroke", side:"L", p:1, ...stroke });
    assert.equal(rider.streak, 0, label);
    assert.equal(rider.level, 0, label);
    assert.ok(["early", "late", "fast"].includes(rider.q), `${label}: ${rider.q}`);
  }
  /* judged on the room's terms */
  const race = solo(still);
  for (let k = 0; k < 9; k += 1) stepRace(race, still);
  assert.equal(judgeBeat(race, race.riders[0], { k:1, d:0 }).q, "perfect");
  assert.equal(judgeBeat(race, race.riders[0], { k:1 + BEAT.STALE + 1, d:0 }).onBeat, false, "more than 2 beats ahead");
  /* a stroke without a stamp is judged when it lands: exactly on beat 2 */
  while (race.t * 1000 + 1e-6 < 2 * BEAT_MS) stepRace(race, still);
  applyInput(race, 0, { t:"stroke", side:"R", p:1 });
  assert.equal(race.riders[0].q, "perfect");
});

test("the beat: a beat with no stroke drops one level to its floor, and a pause costs one level, not everything", () => {
  const still = channel({ length:900 });
  const race = solo(still);
  const rider = race.riders[0];
  beatRun(race, still, { to:18 });
  assert.equal(rider.level, 3);
  /* a drink: beats 19 to 28 unstroked */
  beatRun(race, still, { from:19, to:29, skip:k => k < 29 });
  assert.equal(rider.level, 2, "one level down");
  assert.equal(rider.streak, levelFloor(2) + 1, "from the floor, plus the stroke that came back");
  /* Groove at 9: one missed beat drops it to Rhythm's floor */
  beatRun(race, still, { from:30, to:36, skip:k => k === 33 });
  assert.equal(rider.level, 1);
  assert.equal(rider.streak, levelFloor(1) + 3);
  /* at level 0 a miss clears what there is */
  const slow = solo(still);
  beatRun(slow, still, { to:3 });
  beatRun(slow, still, { from:4, to:6, skip:k => k === 4 });
  assert.equal(slow.riders[0].streak, 2);
});

test("thrust: PERFECT, GOOD and OFF push 1, 0.8 and 0.4; the level adds up to a quarter", () => {
  const still = channel({ length:900 });
  const pushOf = (d, { streak = 0 } = {}) => {
    const race = solo(still);
    const rider = race.riders[0];
    rider.streak = streak;
    rider.level = streak >= 16 ? 3 : streak >= 8 ? 2 : streak >= 4 ? 1 : 0;
    while (race.t * 1000 + 1e-6 < BEAT_MS + d) stepRace(race, still);
    const before = rider.push;
    applyInput(race, 0, { t:"stroke", side:"L", p:1, k:1, d });
    return rider.push - before;
  };
  const perfect = pushOf(0), good = pushOf(120), off = pushOf(-210);
  assert.ok(Math.abs(good / perfect - QUALITY_GAIN.good) < 1e-9);
  assert.ok(Math.abs(off / perfect - QUALITY_GAIN.early) < 1e-9);
  assert.ok(Math.abs(pushOf(0, { streak:20 }) / perfect - LEVEL_GAIN[3]) < 1e-9, "Locked in");
  assert.ok(Math.abs(pushOf(0, { streak:5 }) / perfect - LEVEL_GAIN[1]) < 1e-9, "Rhythm");
  /* steering is the same on the beat or off it */
  const yawOf = d => {
    const race = solo(still);
    while (race.t * 1000 + 1e-6 < BEAT_MS + d) stepRace(race, still);
    applyInput(race, 0, { t:"stroke", side:"R", p:1, k:1, d });
    return race.riders[0].yawQ;
  };
  assert.equal(yawOf(0), yawOf(-210));
});

test("the flood cap: one stroke a beat never reaches it; mashing fills it and pushes nothing", () => {
  const still = channel({ length:900 });
  /* every on-beat stroke adds to the push */
  const beat = solo(still);
  let added = 0;
  for (let k = 1; k <= 40; k += 1) {
    while (beat.t * 1000 + 1e-6 < k * BEAT_MS) stepRace(beat, still);
    const before = beat.riders[0].push;
    applyInput(beat, 0, { t:"stroke", side:k % 2 ? "L" : "R", p:1, k, d:0 });
    if (beat.riders[0].push > before) added += 1;
  }
  assert.equal(added, 40, "never capped");
  assert.ok(beat.riders[0].heat <= FLOOD.CAP);
  /* six taps a second: within a second or two nothing more pushes */
  const mash = solo(still);
  let late = 0;
  for (let n = 0; n < 60; n += 1) {
    const at = n / 6;
    while (mash.t + 1e-9 < at) stepRace(mash, still);
    const before = mash.riders[0].push;
    applyInput(mash, 0, { t:"stroke", side:n % 2 ? "L" : "R", p:1 });
    if (n >= 18 && mash.riders[0].push > before) late += 1;
  }
  assert.equal(late, 0, "a flood pushes nothing");
  assert.equal(mash.riders[0].level, 0, "and never finds the groove");
  /* over the water: the beat beats the masher, who is no better than a drifter */
  const river = channel({ flow:1.5, length:900 });
  const trio = createRace({ course:river, leg:0, seed:4, drinking:false,
    field:[{ i:0, floatie:"classic" }, { i:1, floatie:"classic" }, { i:2, floatie:"classic" }] });
  /* the beat paddler mid-river (alternate strokes hold a heading half a stroke to one side) */
  trio.riders.forEach((rider, k) => { rider.y = [0, -8, 8][k]; rider.x = 60; });
  const onBeat = beatPaddler({ i:0 }), masher = paddler(6, n => (n % 2 ? "L" : "R"), 1, 1);
  run(trio, river, 30, r => { onBeat(r); masher(r); });
  const [b, m, dr] = trio.riders;
  assert.ok(b.x - m.x > 25, `the beat is well ahead: ${(b.x - m.x).toFixed(1)} m`);
  assert.ok(Math.abs(m.x - dr.x) < 0.2 * (b.x - dr.x), `the masher stays near the drifter: ${m.x.toFixed(1)} vs ${dr.x.toFixed(1)}`);
});

test("bumps: they push apart, momentum survives, and the shark hits harder", () => {
  const still = channel();
  const crash = (a, b) => {
    const race = createRace({ course:still, leg:0, seed:1, drinking:false, field:[{ i:0, floatie:a }, { i:1, floatie:b }] });
    const [p, q] = race.riders;
    p.x = 100; p.y = 0; p.vx = 2; p.vy = 0; p.a = 0;
    q.x = 103; q.y = 0.3; q.vx = -2; q.vy = 0; q.a = Math.PI;
    let bumped = false, closest = Infinity;
    const momentum = () => physicsOf(a).mass * p.vx + physicsOf(b).mass * q.vx;
    const before = momentum();
    for (let k = 0; k < 30; k += 1) {
      const events = stepRace(race, still);
      if (events.some(event => event.e === "bump" && event.j !== undefined)) bumped = true;
      closest = Math.min(closest, Math.hypot(q.x - p.x, q.y - p.y));
      for (const rider of race.riders) for (const key of ["x", "y", "vx", "vy", "a", "w"]) assert.ok(Number.isFinite(rider[key]));
    }
    return { race, p, q, bumped, closest, before, after:momentum() };
  };
  const plain = crash("classic", "classic");
  assert.ok(plain.bumped, "a bump event");
  assert.ok(plain.closest > 2 * RADIUS - 0.25, `never deep inside each other: ${plain.closest}`);
  assert.ok(plain.p.vx < 0.5 && plain.q.vx > -0.5, "bounced apart");
  assert.ok(Math.abs(plain.before) < 1 && Math.abs(plain.after) < 20, "equal and opposite stays balanced");
  assert.ok(plain.p.st.bumpsGiven + plain.q.st.bumpsGiven === 1 && plain.p.st.bumpsTaken + plain.q.st.bumpsTaken === 1);
  /* glancing (offset) hits spin both */
  assert.ok(Math.abs(plain.p.w) > 0.05 || Math.abs(plain.q.w) > 0.05, "a glancing hit spins");
  const shark = crash("shark", "classic");
  assert.ok(shark.q.vx > plain.q.vx + 0.3, `the shark sends riders flying: ${shark.q.vx} vs ${plain.q.vx}`);
});

test("banks hold you in and rocks bounce you off; neither holds you", () => {
  const narrow = channel({ width:12 });
  const race = solo(narrow);
  race.riders[0].a = Math.PI / 2;
  const across = paddler(2.8);
  run(race, narrow, 15, r => {
    across(r);
    const near = nearestS(narrow, r.riders[0].x, r.riders[0].y, r.riders[0].s);
    assert.ok(Math.abs(near.d) <= near.w / 2 - RADIUS + 0.05, `inside: ${near.d}`);
  });
  const rocky = channel({ flow:2, rocks:[[120, 0, 1.2]] });
  const hit = solo(rocky);
  hit.riders[0].x = 100;
  hit.riders[0].y = 0;
  let bumped = false;
  run(hit, rocky, 25, r => {
    const rider = r.riders[0];
    assert.ok(Math.hypot(rider.x - 120, rider.y) >= RADIUS + 1.2 - 0.05, "never inside the rock");
    if (r.events.some(event => event.e === "bump")) bumped = true;
  });
  assert.ok(hit.riders[0].x > 135, `slid off the rock and on downstream: ${hit.riders[0].x}`);
  void bumped;
});

/* the real river: a rider a few metres above the Drop's lip */
function atTheLip(floatie, offDegrees, { speed = 4 } = {}) {
  const drop = COURSE.zones.find(zone => zone.k === "drop");
  const legIndex = COURSE.legs.findIndex(leg => leg.s0 <= drop.s0 && leg.s1 >= drop.s1);
  const race = createRace({ course:COURSE, leg:legIndex, seed:1, drinking:false, field:[{ i:0, floatie }] });
  const f = frameAt(COURSE, drop.s0 - 3);
  const rider = race.riders[0];
  const a = Math.atan2(f.ty, f.tx);
  Object.assign(rider, { x:f.x, y:f.y, s:drop.s0 - 3, a:a + offDegrees * Math.PI / 180, w:0, vx:f.tx * speed, vy:f.ty * speed });
  let flipped = false;
  for (let k = 0; k < 45; k += 1) if (stepRace(race, COURSE).some(event => event.e === "flip")) flipped = true;
  return { flipped, rider, race };
}

test("the Drop: straight over is fine, sideways flips you; Grip sets how far is too far; the lounger never flips", () => {
  assert.equal(atTheLip("classic", 0).flipped, false, "straight");
  assert.equal(atTheLip("classic", 10).flipped, false, "a little off");
  assert.equal(atTheLip("classic", 75).flipped, true, "sideways");
  assert.equal(atTheLip("classic", 180).flipped, true, "backwards");
  /* 36 degrees off: tippy unicorn (Grip 2) goes over, the pizza raft (Grip 4, hard to flip) does not */
  assert.equal(atTheLip("unicorn", 36).flipped, true);
  assert.equal(atTheLip("pizza", 36).flipped, false);
  assert.ok(physicsOf("unicorn").dropAngle < physicsOf("classic").dropAngle);
  assert.ok(physicsOf("classic").dropAngle < physicsOf("pizza").dropAngle);
  for (const off of [60, 90, 180]) assert.equal(atTheLip("lounge", off).flipped, false, `lounger at ${off}`);
  /* a flip: in the water for SWIM_MS, flagged, then back in facing downstream */
  const { rider, race } = atTheLip("classic", 90);
  assert.ok(rider.swim > 0);
  assert.ok(flagsOf(rider, race.t) & FLAG.SWIM);
  assert.equal(applyInput(race, 0, { t:"stroke", side:"L", p:1 }), false, "no paddling while swimming");
  assert.equal(rider.st.dropFlips, 1);
  let back = null;
  for (let k = 0; k < 120 && back === null; k += 1) { stepRace(race, COURSE); if (rider.swim === 0) back = race.t; }
  assert.ok(back !== null && back <= FLIP.SWIM_MS / 1000 + 1.5 + 0.1);
  const f = frameAt(COURSE, rider.s);
  assert.ok(Math.abs(wrapAngle(rider.a - Math.atan2(f.ty, f.tx))) < 0.6, "facing downstream again");
});

test("riffles: waves shove everyone, flip only the sideways (by Grip), never the lounger", () => {
  const rough = channel({ flow:3, zones:[{ k:"riffle", s0:60, s1:560, power:1.2 }] });
  const flipsOf = (floatie, offDegrees) => {
    let flips = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const race = createRace({ course:rough, leg:0, seed, drinking:false, field:[{ i:0, floatie }] });
      const rider = race.riders[0];
      Object.assign(rider, { x:80, y:0, s:80 });
      for (let k = 0; k < 150; k += 1) {
        if (rider.swim === 0) { rider.a = offDegrees * Math.PI / 180; rider.w = 0; rider.y = 0; }
        stepRace(race, rough);
      }
      flips += rider.st.flips;
    }
    return flips;
  };
  assert.equal(flipsOf("classic", 0), 0, "nose downstream: no flips");
  assert.ok(flipsOf("classic", 90) > 0, "sideways: flips");
  assert.ok(flipsOf("unicorn", 52) > flipsOf("pizza", 52), "Grip");
  assert.equal(flipsOf("lounge", 90), 0, "never");
});

test("balloons land 1.2 s after the throw: a spin and a splash, never a flip, at most once in 6 s", () => {
  const still = channel({ flow:1 });
  const race = createRace({ course:still, leg:0, seed:5, drinking:false, field:[{ i:3, floatie:"classic" }] });
  const rider = riderOf(race, 3);
  run(race, still, 1);
  assert.equal(throwBalloon(race, 9, 3), true);
  const thrown = race.t;
  let landed = null;
  run(race, still, 2, r => {
    for (const event of r.events) if (event.e === "splash" && event.j === 3) landed = r.t;
  });
  assert.equal(race.balloons.length, 0);
  assert.ok(rider.st.splashed === 1, "hit");
  assert.ok(landed === null || landed >= thrown + BALLOON.FLIGHT_MS / 1000 - DT);
  assert.ok(Math.abs(rider.w) > 0.5 || rider.hitAt > 0, "spun");
  assert.equal(rider.swim, 0, "never a flip");
  assert.ok(rider.st.flips === 0);
  /* a second balloon inside 6 s splashes harmlessly */
  throwBalloon(race, 9, 3);
  run(race, still, 2);
  assert.equal(rider.st.splashed, 1, "immune");
  run(race, still, 4);
  throwBalloon(race, 9, 3);
  run(race, still, 2);
  assert.equal(rider.st.splashed, 2, "after 6 s, hit again");
  /* the splash flag shows for 600 ms */
  assert.ok(!(flagsOf(rider, race.t + 1) & FLAG.SPLASHED));
});

test("the drink rule in the race: placed at max(arrive, drink); drinks:false and drinking off drink on arrival", () => {
  const short = channel({ flow:3, length:200 });
  const race = createRace({ course:short, leg:0, seed:2, drinking:true,
    field:[{ i:0, floatie:"classic", drinks:true }, { i:1, floatie:"classic", drinks:true }, { i:2, floatie:"classic", drinks:false }] });
  race.riders.forEach((rider, k) => { rider.y = (k - 1) * 3; rider.x = 40; });
  run(race, short, 5);
  applyInput(race, 0, { t:"drink" });
  const early = riderOf(race, 0).drinkAt;
  assert.ok(Math.abs(early - race.t) < 1e-6, "drinkAt is the race time");
  assert.equal(applyInput(race, 0, { t:"drink" }), false, "once a round");
  run(race, short, 80);
  const [a, b, c] = [0, 1, 2].map(i => riderOf(race, i));
  assert.ok(a.arrived && b.arrived && c.arrived);
  assert.equal(finishAt(a), a.arriveAt, "drank on the way: placed on arrival");
  assert.equal(b.drinkAt, null, "arrived dry: waiting at the takeout");
  assert.equal(finishAt(b), null);
  assert.equal(c.drinkAt, c.arriveAt, "drinks:false drinks on arrival");
  applyInput(race, 1, { t:"drink" });
  assert.ok(finishAt(b) > b.arriveAt, "placed when the drink is done");
  const dry = createRace({ course:short, leg:0, seed:2, drinking:false, field:[{ i:0, floatie:"classic", drinks:true }] });
  run(dry, short, 80);
  assert.equal(dry.riders[0].drinkAt, dry.riders[0].arriveAt, "the room's drinking off");
  assert.equal(race.firstFinish, Math.min(finishAt(a), finishAt(c)));
  /* arrived riders glide onto the bar and stay out of the way */
  assert.ok(a.x > short.legs[0].finish);
});

test("determinism: the same race and inputs step the same, and a saved race resumes exactly", () => {
  const go = () => {
    const race = createRace({ course:COURSE, leg:1, seed:42, drinking:true,
      field:FLOATIE_IDS.map((floatie, i) => ({ i, floatie })) });
    const strokes = FLOATIE_IDS.map((_, i) => paddler(2 + i * 0.1, n => (n % 3 ? "L" : "R"), 0.9, i));
    return { race, each:r => strokes.forEach(stroke => stroke(r)) };
  };
  const one = go(), two = go();
  run(one.race, COURSE, 20, one.each);
  run(two.race, COURSE, 10, two.each);
  const saved = JSON.parse(JSON.stringify(two.race));
  run(two.race, COURSE, 10, two.each);
  assert.deepEqual(rows(one.race), rows(two.race));
  /* the copy, stepped without inputs, matches the original stepped without inputs */
  const copy = JSON.parse(JSON.stringify(saved));
  run(saved, COURSE, 5);
  run(copy, COURSE, 5);
  assert.deepEqual(rows(saved), rows(copy));
});

test("snapshot rows: [i, x, y, a, f, p], rounded as the contract says", () => {
  const race = createRace({ course:COURSE, leg:0, seed:1, field:[{ i:4, floatie:"donut" }, { i:7, floatie:"shark" }] });
  applyInput(race, 4, { t:"hands", n:1 });
  applyInput(race, 4, { t:"stroke", side:"L", p:1 });
  stepRace(race, COURSE);
  const packed = rows(race);
  assert.equal(packed.length, 2);
  const row = unpackRow(packed[0]);
  assert.equal(row.i, 4);
  assert.equal(packed[0].length, 6);
  assert.equal(Math.round(row.x * 100) / 100, row.x);
  assert.equal(Math.round(row.a * 1000) / 1000, row.a);
  assert.equal(Math.round(row.p * 10) / 10, row.p);
  assert.ok(row.f & FLAG.HANDS_OFF);
  assert.ok(row.f & FLAG.STROKE_L);
  assert.ok(!(row.f & FLAG.STROKE_R));
  assert.ok(row.p >= 0 && row.p <= legAt(COURSE, 0).finish - legAt(COURSE, 0).grid);
});

test("the whirlpool lets go: a drifter dropped in its core is out within a few turns", () => {
  const pool = COURSE.zones.find(zone => zone.k === "whirlpool");
  const legIndex = COURSE.legs.findIndex(leg => leg.s0 <= pool.s0 && leg.s1 >= pool.s1);
  const race = createRace({ course:COURSE, leg:legIndex, seed:1, drinking:false, field:[{ i:0, floatie:"donut" }] });
  const rider = race.riders[0];
  Object.assign(rider, { x:pool.x + 1, y:pool.y, s:nearestS(COURSE, pool.x, pool.y).s, vx:0, vy:0 });
  let out = null;
  for (let k = 0; k < 30 * 25 && out === null; k += 1) {
    stepRace(race, COURSE);
    if (Math.hypot(rider.x - pool.x, rider.y - pool.y) > pool.r + 2) out = race.t;
  }
  assert.ok(out !== null && out < 20, `out after ${out} s`);
});

test("a rock by the bank is no trap: the water takes a drifter round its open side", () => {
  const drop = COURSE.zones.find(zone => zone.k === "drop");
  const legIndex = COURSE.legs.findIndex(leg => leg.s0 <= drop.s0 && leg.s1 >= drop.s1);
  const tight = COURSE.rocks.map(([x, y, r]) => ({ r, ...nearestS(COURSE, x, y) }))
    .filter(rock => Math.abs(rock.s - drop.s0) < 6 && rock.w / 2 - Math.abs(rock.d) - rock.r < 1.6);
  assert.ok(tight.length >= 2, "the lip rocks sit close to both banks");
  for (const rock of tight) {
    const race = createRace({ course:COURSE, leg:legIndex, seed:2, drinking:false, field:[{ i:0, floatie:"classic" }] });
    const rider = race.riders[0];
    const f = frameAt(COURSE, rock.s - 2.4);
    const d = Math.sign(rock.d) * (f.w / 2 - RADIUS - 0.05);
    Object.assign(rider, { x:f.x + f.nx * d, y:f.y + f.ny * d, s:rock.s - 2.4, vx:0, vy:0, a:Math.atan2(f.ty, f.tx), w:0 });
    run(race, COURSE, 12);
    assert.ok(rider.s > drop.s1, `carried round the rock by the ${rock.d > 0 ? "left" : "right"} bank and over: s ${rider.s.toFixed(1)}`);
  }
});
