/* Float's Cup (float/shared/cup.js): cut schedules, places and the drink
   rule, early ends and the cap, final places, swaps and balloons, and the
   phase clock (float/PROTOCOL.md "The Cup"). */
import test from "node:test";
import assert from "node:assert/strict";
import { cutSchedule, createCup, makeEntrant, addBots, startCup, advance, raceFor, placeRiders, roundStatus, finishRound,
  standingsOf, canSwap, noteSwap, beachDrink, canThrow, noteThrow, resumeCountdown, toLobby, raceTick, cutOf, LEG_COUNT } from "../float/shared/cup.js";
import { finishAt, stepRace, throwBalloon } from "../float/shared/sim.js";
import { cleanRider } from "../float/shared/protocol.js";
import { TIMING, BALLOON, DT, BEAT_MS as TUNING_BEAT_MS } from "../float/shared/tuning.js";
import { BEAT_MS } from "../float/shared/beat.js";
import { COURSE } from "../float/shared/course.js";

test("cutSchedule: one round a leg, monotonic, never below 3, the final always 3; 13 is 13, 9, 6, 3", () => {
  assert.deepEqual(cutSchedule(13), [13, 9, 6, 3]);
  for (let n = 1; n <= 16; n += 1) {
    const schedule = cutSchedule(n);
    assert.equal(schedule.length, LEG_COUNT, `n ${n}`);
    assert.equal(schedule[0], n);
    for (let k = 1; k < schedule.length; k += 1) assert.ok(schedule[k] <= schedule[k - 1], `n ${n} monotonic`);
    if (n >= 3) {
      assert.equal(schedule.at(-1), 3, `n ${n} final of 3`);
      assert.ok(schedule.every(size => size >= 3));
    } else assert.deepEqual(schedule, new Array(LEG_COUNT).fill(n), `n ${n}: no cuts`);
  }
  assert.deepEqual(cutSchedule(16), [16, 11, 7, 3]);
  assert.deepEqual(cutSchedule(4), [4, 3, 3, 3]);
});

/* a race whose riders are just results: { i, arriveAt, drinkAt, prog } */
const fakeRider = (i, arriveAt, drinkAt, prog = 300) => ({ i, arrived:arriveAt !== null, arriveAt, drinkAt, prog });

test("places go by max(arriveAt, drinkAt); a dry arrival waits; the rest by distance", () => {
  const order = placeRiders([
    fakeRider(0, 70, 30),     // finished at 70
    fakeRider(1, 65, 80),     // arrived first, drank at 80: finished 80
    fakeRider(2, 75, null),   // at the takeout, dry
    fakeRider(3, null, 20, 250),
    fakeRider(4, null, null, 280),
    fakeRider(5, 72, 72),     // drank on arrival
  ]).map(rider => rider.i);
  assert.deepEqual(order, [0, 5, 1, 2, 4, 3]);
  assert.equal(finishAt(fakeRider(1, 65, 80)), 80);
  assert.equal(finishAt(fakeRider(2, 75, null)), null);
});

function cupOf(n, { drinking = true } = {}) {
  const cup = createCup({ id:"t", seed:9, drinking });
  for (let i = 0; i < n; i += 1) cup.entrants.push(makeEntrant(cup, cleanRider({ name:`R${i}`, color:"#112233" }), { device:`d${i}` }));
  startCup(cup, 1000);
  return cup;
}
/* a round's race with these results, by grid order (field[k] gets times[k]) */
function fakeRace(cup, times, t = 120) {
  const race = raceFor(cup, COURSE);
  race.t = t;
  race.riders.forEach((rider, k) => {
    const [arriveAt, drinkAt, prog] = times[k] ?? [null, null, 100 - k];
    Object.assign(rider, { arrived:arriveAt !== null, arriveAt, drinkAt, prog:prog ?? race.len });
  });
  race.firstFinish = Math.min(...race.riders.map(finishAt).filter(v => v !== null));
  if (!Number.isFinite(race.firstFinish)) race.firstFinish = null;
  return race;
}

test("a round ends once enough have finished to fill the next, 30 s after the first finisher, or at the hard cap", () => {
  const cup = cupOf(13);
  const race = raceFor(cup, COURSE);
  assert.equal(cutOf(cup), 9);
  const finish = (k, at) => Object.assign(race.riders[k], { arrived:true, arriveAt:at, drinkAt:at });
  race.t = 60;
  assert.equal(roundStatus(cup, race).over, false);
  for (let k = 0; k < 8; k += 1) finish(k, 60 + k);
  race.firstFinish = 60;
  race.t = 70;
  assert.equal(roundStatus(cup, race).over, false, "8 of 9 in");
  /* one more at the takeout without a drink does not count yet */
  Object.assign(race.riders[8], { arrived:true, arriveAt:71, drinkAt:null });
  race.t = 72;
  assert.equal(roundStatus(cup, race).over, false);
  race.riders[8].drinkAt = 72;
  assert.deepEqual(roundStatus(cup, race), { over:true, why:"enough" });
  /* the cap: 30 s after the first finisher */
  const capped = raceFor(cup, COURSE);
  Object.assign(capped.riders[0], { arrived:true, arriveAt:50, drinkAt:50 });
  capped.firstFinish = 50;
  capped.t = 50 + TIMING.CAP_MS / 1000 - 0.1;
  assert.equal(roundStatus(cup, capped).over, false);
  capped.t = 50 + TIMING.CAP_MS / 1000;
  assert.deepEqual(roundStatus(cup, capped), { over:true, why:"cap" });
  /* nobody drinks: the hard cap still ends it */
  const stuck = raceFor(cup, COURSE);
  stuck.t = TIMING.HARD_CAP_MS / 1000;
  assert.deepEqual(roundStatus(cup, stuck), { over:true, why:"hard" });
});

test("a whole Cup of 13: cuts 4, 3, 3; out in elimination order; final places from the final, then out reversed", () => {
  const cup = cupOf(13);
  assert.equal(cup.phase, "intro");
  advance(cup, 2000);
  const fields = [];
  for (let round = 0; round < 4; round += 1) {
    assert.equal(cup.phase, "grid");
    fields.push(cup.field.slice());
    const n = cup.field.length;
    /* everyone in grid order: the k-th finishes at 60 + k */
    const race = fakeRace(cup, Array.from({ length:n }, (_, k) => [60 + k, 60 + k]));
    const { survivors, eliminated, last } = finishRound(cup, race, 5000 + round);
    assert.equal(cup.phase, "cut");
    assert.equal(survivors.length, cutSchedule(13)[round + 1] ?? 3);
    assert.deepEqual(survivors, race.riders.slice(0, survivors.length).map(rider => rider.i), "the next grid is this order");
    assert.deepEqual(eliminated, race.riders.slice(survivors.length).map(rider => rider.i));
    assert.equal(last, round === 3);
    advance(cup, 6000 + round);
  }
  assert.equal(cup.phase, "podium");
  assert.deepEqual(fields.map(field => field.length), [13, 9, 6, 3]);
  /* final: the final's order, then the last cut's best (4th) down to the first out */
  const [r1, r2, r3, final] = fields;
  assert.deepEqual(cup.final, [...final, ...r3.slice(3), ...r2.slice(6), ...r1.slice(9)]);
  assert.deepEqual(cup.podium, final);
  assert.equal(cup.out.length, 10);
  assert.deepEqual(cup.out.slice(0, 4), r1.slice(9).reverse(), "out: worst of a round first");
  assert.deepEqual(standingsOf(cup).map(item => item.i), cup.final);
  assert.equal(standingsOf(cup)[3].out, 2, "4th went out in round 3 (index 2)");
  advance(cup, 99000);
  assert.equal(cup.phase, "feedback");
  advance(cup, 99000 + TIMING.FEEDBACK_MS);
  assert.equal(cup.phase, "lobby");
});

test("1 to 3 riders race every leg without cuts; the last leg's order is the result", () => {
  for (const n of [1, 2, 3]) {
    const cup = cupOf(n);
    advance(cup, 2000);
    let lastOrder = null;
    for (let round = 0; round < 4; round += 1) {
      const times = Array.from({ length:n }, (_, k) => [80 - k * 2, 80 - k * 2]);
      const race = fakeRace(cup, times);
      finishRound(cup, race, 3000 + round);
      lastOrder = race.riders.slice().reverse().map(rider => rider.i);
      assert.equal(cup.field.length, n, "nobody is cut");
      advance(cup, 4000 + round);
    }
    assert.deepEqual(cup.final, lastOrder);
    assert.deepEqual(cup.out, []);
  }
});

test("riders still on the water when a round ends are placed by distance, dry arrivals ahead of them", () => {
  const cup = cupOf(6);
  advance(cup, 2000);
  assert.equal(cutOf(cup), 5);
  const race = fakeRace(cup, [[60, 61], [62, null], [null, null, 300], [65, 66], [null, 10, 310], [null, null, 200]]);
  race.t = 61 + TIMING.CAP_MS / 1000;
  assert.equal(roundStatus(cup, race).why, "cap");
  finishRound(cup, race, 9000);
  const g = race.riders.map(rider => rider.i);
  assert.deepEqual(cup.results.map(result => result.i), [g[0], g[3], g[1], g[4], g[2], g[5]]);
  assert.deepEqual(cup.out, [g[5]]);
  assert.equal(cup.results[2].time, null, "a dry arrival has no time");
});

test("the drink rule's bookkeeping: an out rider drinks on the beach, then throws one balloon every 12 s", () => {
  const cup = cupOf(5);
  advance(cup, 2000);
  const race = fakeRace(cup, [[60, 60], [61, 61], [62, 62], [63, 63], [null, null, 100]]);
  const loser = race.riders[4].i;
  finishRound(cup, race, 10000);
  assert.deepEqual(cup.out, [loser]);
  assert.equal(cup.beach[loser].drank, false, "never drank this round");
  advance(cup, 30000);
  const next = raceFor(cup, COURSE);
  cup.phase = "race";
  const target = next.riders[0].i;
  assert.equal(canThrow(cup, next, loser, target, 31000), false, "drink first");
  assert.equal(beachDrink(cup, loser, 31000), true);
  assert.equal(beachDrink(cup, loser, 31000), false, "once");
  assert.equal(canThrow(cup, next, loser, target, 31000), true);
  assert.equal(canThrow(cup, next, target, loser, 31000), false, "only the out throw, only at racers");
  noteThrow(cup, loser, 31000);
  throwBalloon(next, loser, target);
  assert.equal(canThrow(cup, next, loser, target, 31000 + BALLOON.EVERY_MS - 1), false);
  assert.equal(canThrow(cup, next, loser, target, 31000 + BALLOON.EVERY_MS), true);
  next.riders[0].arrived = true;
  assert.equal(canThrow(cup, next, loser, target, 50000), false, "not at someone already in");
  cup.phase = "cut";
  assert.equal(canThrow(cup, next, loser, next.riders[1].i, 50000), false, "only during a race");
  /* a rider who drank in their last race is ready at once */
  const cup2 = cupOf(4);
  advance(cup2, 2000);
  finishRound(cup2, fakeRace(cup2, [[60, 60], [61, 61], [62, 62], [null, 20, 100]]), 10000);
  assert.equal(cup2.beach[cup2.out[0]].drank, true);
  /* no drinking: the beach drink is automatic */
  const dry = cupOf(4, { drinking:false });
  advance(dry, 2000);
  finishRound(dry, fakeRace(dry, [[60, 60], [61, 61], [62, 62], [null, null, 100]]), 10000);
  assert.equal(dry.beach[dry.out[0]].drank, true);
});

test("swaps: survivors only, in the first 15 s of a cut, never after the last race", () => {
  const cup = cupOf(5);
  advance(cup, 2000);
  finishRound(cup, fakeRace(cup, [[60, 60], [61, 61], [62, 62], [63, 63], [64, 64]]), 10000);
  const [survivor] = cup.field;
  const out = cup.out[0];
  assert.equal(canSwap(cup, survivor, 10000 + TIMING.SWAP_MS), true);
  assert.equal(canSwap(cup, survivor, 10000 + TIMING.SWAP_MS + 1), false);
  assert.equal(canSwap(cup, out, 10001), false);
  noteSwap(cup, survivor);
  assert.equal(cup.swaps[survivor], 1);
  for (let round = 1; round < 4; round += 1) {
    advance(cup, 40000 * round);
    finishRound(cup, fakeRace(cup, cup.field.map((_, k) => [60 + k, 60 + k])), 40000 * round + 1);
  }
  assert.equal(cup.done, true);
  assert.equal(canSwap(cup, cup.field[0], 40000 * 3 + 2), false, "after the final, nothing to swap");
  assert.equal(cup.endsAt - cup.startAt, TIMING.CUT_LAST_MS);
});

test("the phase clock: intro 8 s, grid 4 s, countdown 3 s with startAt the gun, race capped, cut 20 s, podium 15 s", () => {
  const cup = cupOf(13);
  assert.equal(cup.endsAt - cup.startAt, TIMING.INTRO_MS);
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "grid");
  assert.equal(cup.endsAt - cup.startAt, TIMING.GRID_MS);
  const gridEnds = cup.endsAt;
  advance(cup, gridEnds);
  assert.equal(cup.phase, "countdown");
  assert.equal(cup.startAt, gridEnds + TIMING.COUNTDOWN_MS, "startAt is the gun");
  assert.equal(cup.endsAt, cup.startAt);
  const gun = cup.startAt;
  advance(cup, gun);
  assert.equal(cup.phase, "race");
  assert.equal(cup.startAt, gun);
  assert.equal(cup.endsAt, gun + TIMING.HARD_CAP_MS);
  finishRound(cup, fakeRace(cup, cup.field.map((_, k) => [60 + k, 60 + k])), gun + 70000);
  assert.equal(cup.endsAt - cup.startAt, TIMING.CUT_MS);
  assert.equal(cup.swapUntil - cup.startAt, TIMING.SWAP_MS);
  /* a restarted room: a short countdown whose startAt is when it goes again, then the race clock carries on */
  const now = 500000;
  resumeCountdown(cup, now, 42.5);
  assert.equal(cup.phase, "countdown");
  assert.equal(cup.startAt, now + TIMING.RESUME_MS);
  assert.equal(cup.resume, true);
  advance(cup, now + TIMING.RESUME_MS);
  assert.equal(cup.phase, "race");
  assert.equal(cup.startAt, now + TIMING.RESUME_MS - 42500, "race clock: now - startAt is the saved race time");
  toLobby(cup, now);
  assert.equal(cup.phase, "lobby");
  assert.equal(cup.endsAt, null);
});

test("addBots fills with named computer riders; raceTick runs a round with bots to its end", () => {
  const cup = createCup({ id:"bots", seed:4 });
  cup.entrants.push(makeEntrant(cup, cleanRider({ name:"Ann" }), { device:"a" }));
  assert.equal(addBots(cup, 12), 12);
  assert.equal(cup.entrants.length, 13);
  assert.equal(addBots(cup, 10), 3, "never past 16");
  cup.entrants.length = 13;
  const bots = cup.entrants.filter(entrant => entrant.bot);
  assert.equal(new Set(bots.map(entrant => entrant.name)).size, 12);
  assert.ok(bots.every(entrant => entrant.skill > 0 && entrant.skill <= 1 && entrant.color));
  startCup(cup, 0);
  advance(cup, 0);
  const race = raceFor(cup, COURSE);
  cup.phase = "race";
  let now = 0, events = 0;
  while (!roundStatus(cup, race).over) {
    now += DT * 1000;
    events += raceTick(cup, race, { now, driven:() => true }).length;
  }
  assert.ok(race.t < TIMING.HARD_CAP_MS / 1000, `round over at ${race.t}`);
  assert.ok(events > 13);
  finishRound(cup, race, now);
  assert.equal(cup.field.length, 9);
  void stepRace;
});

/* The music's band lands the grid's start on a beat only because the grid and
   the countdown together are whole beats (the sound builder's note); the
   3-2-1 and the gun fall on beats, and a resumed race counts in whole beats too */
test("the grid, the countdown and a resume's countdown are whole beats", () => {
  assert.equal(TUNING_BEAT_MS, BEAT_MS, "one beat for tuning.js and beat.js");
  assert.equal(BEAT_MS, 500);
  assert.equal((TIMING.GRID_MS + TIMING.COUNTDOWN_MS) % BEAT_MS, 0, "grid plus countdown");
  assert.equal(TIMING.COUNTDOWN_MS % BEAT_MS, 0, "the countdown");
  assert.equal(TIMING.RESUME_MS % BEAT_MS, 0, "a resumed race's countdown");
  /* and the Cup lays them out that way: the gun is a whole number of beats after the grid begins */
  const cup = createCup({ id:"beats", seed:3 });
  cup.entrants.push(makeEntrant(cup, cleanRider({ name:"A" }), { device:"a" }));
  startCup(cup, 1000);
  advance(cup, cup.endsAt);
  const gridStart = cup.startAt;
  advance(cup, cup.endsAt);
  assert.equal(cup.phase, "countdown");
  assert.equal((cup.startAt - gridStart) % BEAT_MS, 0);
});
