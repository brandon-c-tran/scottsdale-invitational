/* The Cup (float/PROTOCOL.md "The Cup"): phases, rounds, cuts, places, the
   drink rule, balloons. Pure: every function takes the cup (plain JSON, the
   room saves it at every phase change) and the time, and changes or reads it.
   The room and scripts/float-sim.mjs drive the same functions.

     lobby -> intro -> [ grid -> countdown -> race -> cut ] x rounds -> podium -> feedback -> lobby

   One leg per round, in order; the field is cut after each round until three
   race the final (13 -> 9 -> 6 -> 3). Places in a round go by
   max(arriveAt, drinkAt). A round ends as soon as enough have finished to
   fill the next round, CAP_MS after its first finisher, or HARD_CAP_MS after
   the gun; anyone still out there is placed by distance. Final places: the
   final's order, then everyone else in reverse order of elimination.

   Times: phase times (startAt, endsAt, now) are wall-clock ms. Race times
   (arriveAt, drinkAt, firstFinish) are race seconds from the gun. In
   `countdown` and `race`, startAt is the gun. */
import { TIMING, BALLOON, MAX_RIDERS } from "./tuning.js";
import { COURSE } from "./course.js";
import { createRace, finishAt, riderOf, seedOf, nextRandom } from "./sim.js";
import { botSkills, botFloatie } from "./bots.js";
import { CRITTERS, defaultLook, cleanLook } from "./looks.js";
import { FLOATIE_IDS } from "./floaties.js";

export const LEG_COUNT = COURSE.legs.length;
/* colours for riders without one, distinct at TV distance */
export const PALETTE = Object.freeze(["#e4572e", "#2e86ab", "#f3a712", "#29bf12", "#a23b72", "#00b3b3", "#ff7aa2",
  "#7353ba", "#c0d461", "#ff9f1c", "#3d5a80", "#d81159", "#8fd694", "#ffd23f", "#5e6472", "#9b5de5"]);

/* the field for every round: one entry per leg, monotonic, never below 3,
   the final 3 once there are 3 or more; the cuts as even as they can be,
   bigger first (13: 13, 9, 6, 3). 1 to 3 riders race every leg uncut. */
export function cutSchedule(n, legs = LEG_COUNT) {
  const riders = Math.max(0, Math.min(MAX_RIDERS, n | 0));
  if (riders <= 3) return new Array(legs).fill(riders);
  const cuts = legs - 1, total = riders - 3;
  const schedule = [riders];
  for (let k = 0; k < cuts; k += 1) {
    const cut = Math.floor(total / cuts) + (k < total % cuts ? 1 : 0);
    schedule.push(schedule[k] - cut);
  }
  return schedule;
}

/* ---- the cup ---- */

export function createCup({ id = "cup", mode = "party", code = "", drinking = true, seed = 1, evId = null } = {}) {
  return {
    v:1, id, mode, code, drinking:drinking !== false, seed:seed >>> 0, evId,
    phase:"lobby", startAt:null, endsAt:null, swapUntil:null,
    round:0, rounds:LEG_COUNT, schedule:[],
    entrants:[], field:[], out:[], results:[], history:[], standings:[], podium:null, final:null,
    beach:{}, swaps:{}, thrown:{}, landed:{}, done:false,
  };
}

/* an entrant as the room keeps it; `rider` is cleaned already (protocol.js cleanRider) */
export function makeEntrant(cup, rider, { device = null, bot = false, skill = null } = {}) {
  const used = new Set(cup.entrants.map(entrant => entrant.color));
  const color = rider.color || PALETTE.find(item => !used.has(item)) || PALETTE[cup.entrants.length % PALETTE.length];
  const entrant = { device, name:rider.name, color, look:rider.look, bot, ready:false, drinks:rider.drinks !== false };
  if (bot) entrant.skill = skill ?? 0.6;
  for (const key of ["pid", "photo", "number", "skin", "groom"]) if (rider[key] !== undefined) entrant[key] = rider[key];
  return entrant;
}

/* computer riders: critter names, spread skills, any floatie */
export function addBots(cup, count, seed = cup.seed) {
  const room = Math.max(0, Math.min(count | 0, MAX_RIDERS - cup.entrants.length));
  const skills = botSkills(room, seed);
  const taken = new Set(cup.entrants.map(entrant => entrant.name));
  const holder = { rng:seedOf(`bots:${seed}:${cup.entrants.length}`) };
  const names = CRITTERS.map(item => item.name).filter(name => !taken.has(name));
  for (let k = 0; k < room; k += 1) {
    const at = Math.floor(nextRandom(holder) * names.length);
    const name = names.length ? names.splice(at, 1)[0] : `Bot ${k + 1}`;
    const key = `bot-${cup.entrants.length + 1}-${seed}`;
    const look = cleanLook({ ...defaultLook(key, FLOATIE_IDS), floatie:botFloatie(key) }, { floatieIds:FLOATIE_IDS, seed:key });
    const critter = CRITTERS.find(item => item.name === name);
    if (critter) look.critter = critter.id;
    cup.entrants.push(makeEntrant(cup, { name, color:null, look, drinks:true }, { device:key, bot:true, skill:skills[k] }));
  }
  return room;
}

const setPhase = (cup, phase, now, ms) => {
  cup.phase = phase;
  cup.startAt = now;
  cup.endsAt = ms === null ? null : now + ms;
};

/* the Cup starts: everyone in the lobby rides */
export function startCup(cup, now) {
  const n = cup.entrants.length;
  cup.schedule = cutSchedule(n);
  cup.rounds = LEG_COUNT;
  cup.round = 0;
  cup.out = [];
  cup.results = [];
  cup.history = [];
  cup.podium = null;
  cup.final = null;
  cup.done = false;
  cup.beach = {};
  cup.swaps = {};
  cup.thrown = {};
  cup.landed = {};
  /* the first grid: drawn by the cup's seed */
  const order = cup.entrants.map((_, i) => i);
  const holder = { rng:seedOf(`grid:${cup.seed}:${cup.id}`) };
  for (let k = order.length - 1; k > 0; k -= 1) {
    const j = Math.floor(nextRandom(holder) * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  cup.field = order;
  cup.standings = standingsOf(cup);
  setPhase(cup, "intro", now, TIMING.INTRO_MS);
}

/* the leg this round races */
export const legOf = cup => Math.min(LEG_COUNT - 1, cup.round);
export const isLastRound = cup => cup.round >= cup.rounds - 1;
/* how many go through this round (the next round's field), or null in the last */
export const cutOf = cup => isLastRound(cup) ? null : cup.schedule[cup.round + 1];

/* a fresh race for this round, the field on the grid in order */
export function raceFor(cup, course = COURSE) {
  return createRace({
    course, leg:legOf(cup), seed:seedOf(`${cup.seed}:${cup.id}:${cup.round}`), drinking:cup.drinking,
    field:cup.field.map(i => ({ i, floatie:cup.entrants[i].look.floatie, drinks:cup.entrants[i].drinks !== false })),
  });
}

/* ---- places ---- */

/* riders in place order: finished (by max(arriveAt, drinkAt)), then those at
   the takeout who have not drunk (by arrival), then the rest by distance */
export function placeRiders(riders) {
  const done = riders.filter(rider => finishAt(rider) !== null)
    .sort((a, b) => finishAt(a) - finishAt(b) || a.arriveAt - b.arriveAt || a.i - b.i);
  const waiting = riders.filter(rider => rider.arrived && finishAt(rider) === null)
    .sort((a, b) => a.arriveAt - b.arriveAt || a.i - b.i);
  const racing = riders.filter(rider => !rider.arrived).sort((a, b) => b.prog - a.prog || a.i - b.i);
  return [...done, ...waiting, ...racing];
}

/* the round's results so far: [{ i, place, time, drinkAt }] (time null until placed) */
export const resultsOf = race => placeRiders(race.riders).map((rider, k) =>
  ({ i:rider.i, place:k + 1, time:finishAt(rider), drinkAt:rider.drinkAt }));

/* is the round over? { over, why } */
export function roundStatus(cup, race) {
  const target = cutOf(cup) ?? cup.field.length;
  const placed = race.riders.filter(rider => finishAt(rider) !== null).length;
  if (placed >= race.riders.length) return { over:true, why:"all" };
  if (placed >= target) return { over:true, why:"enough" };
  if (race.firstFinish !== null && race.t >= race.firstFinish + TIMING.CAP_MS / 1000) return { over:true, why:"cap" };
  if (race.t >= TIMING.HARD_CAP_MS / 1000) return { over:true, why:"hard" };
  return { over:false, why:null };
}

/* the round is over: places, the cut, on to `cut` */
export function finishRound(cup, race, now) {
  const order = placeRiders(race.riders);
  const results = order.map((rider, k) => ({ i:rider.i, place:k + 1, time:finishAt(rider), drinkAt:rider.drinkAt,
    arriveAt:rider.arriveAt, prog:Math.round(Math.max(0, Math.min(race.len, rider.prog)) * 10) / 10 }));
  const last = isLastRound(cup);
  const through = last ? order.length : Math.min(order.length, cutOf(cup));
  const survivors = order.slice(0, through).map(rider => rider.i);
  const eliminated = order.slice(through).map(rider => rider.i);
  /* out: elimination order, the worst of a round first, so the last cut's
     best is the last entry (4th place) */
  cup.out.push(...eliminated.slice().reverse());
  for (const i of eliminated) {
    const rider = riderOf(race, i);
    cup.beach[i] = { drank:rider?.drinkAt !== null || !drinksNow(cup, i), next:now };
  }
  const stats = {};
  for (const rider of race.riders) {
    const arrivedAt = rider.arriveAt, drankAt = rider.drinkAt;
    stats[rider.i] = { time:finishAt(rider), arriveAt:arrivedAt, drinkAt:drankAt,
      drinkWait:arrivedAt !== null && drankAt !== null ? Math.max(0, Math.round((drankAt - arrivedAt) * 1000) / 1000) : null,
      ...rider.st, swaps:cup.swaps[rider.i] || 0 };
  }
  /* balloons this round, by thrower */
  const balloons = {};
  for (const i of new Set([...Object.keys(cup.thrown), ...Object.keys(cup.landed)]))
    balloons[i] = { thrown:cup.thrown[i] || 0, landed:cup.landed[i] || 0 };
  cup.thrown = {};
  cup.landed = {};
  cup.history.push({ round:cup.round, leg:legOf(cup), field:cup.field.slice(), results, out:eliminated, stats, balloons });
  cup.results = results;
  cup.field = survivors;
  cup.swaps = {};
  if (last) {
    cup.final = [...survivors, ...cup.out.slice().reverse()];
    cup.podium = survivors.slice(0, 3);
    cup.done = true;
  }
  cup.standings = standingsOf(cup);
  setPhase(cup, "cut", now, last ? TIMING.CUT_LAST_MS : TIMING.CUT_MS);
  cup.swapUntil = last ? null : now + TIMING.SWAP_MS;
  return { survivors, eliminated, last };
}

/* the Cup so far: [{ i, place, out }] (out: the round they went out in, or null) */
export function standingsOf(cup) {
  const outRound = {};
  for (const item of cup.history) for (const i of item.out) outRound[i] = item.round;
  const order = cup.final || [...cup.field, ...cup.out.slice().reverse()];
  return order.map((i, k) => ({ i, place:k + 1, out:outRound[i] ?? null }));
}

/* drinks this round? (drinks:false, or the room's drinking off, drink on arrival) */
export const drinksNow = (cup, i) => cup.drinking && cup.entrants[i]?.drinks !== false;

/* ---- the clock between races ---- */

/* the phase after a timed one ends; the room calls it when endsAt passes.
   Returns the new phase (race is entered by the room, which owns the race). */
export function advance(cup, now) {
  switch (cup.phase) {
    case "intro":
      setPhase(cup, "grid", now, TIMING.GRID_MS);
      cup.results = [];
      return "grid";
    case "grid": {
      /* in countdown, startAt is the gun */
      cup.phase = "countdown";
      cup.startAt = now + TIMING.COUNTDOWN_MS;
      cup.endsAt = cup.startAt;
      return "countdown";
    }
    case "countdown":
      cup.phase = "race";
      /* a resumed race: startAt moves back to its own gun, so the race clock
         (now - startAt) carries on from the save */
      if (cup.resume) { cup.startAt -= Math.round((cup.resumeT || 0) * 1000); cup.resume = false; cup.resumeT = 0; }
      cup.endsAt = cup.startAt + TIMING.HARD_CAP_MS;
      return "race";
    case "cut":
      cup.swapUntil = null;
      if (cup.done) { setPhase(cup, "podium", now, TIMING.PODIUM_MS); return "podium"; }
      cup.round += 1;
      cup.results = [];
      setPhase(cup, "grid", now, TIMING.GRID_MS);
      return "grid";
    case "podium":
      setPhase(cup, "feedback", now, TIMING.FEEDBACK_MS);
      return "feedback";
    case "feedback":
      toLobby(cup, now);
      return "lobby";
    default:
      return cup.phase;
  }
}

/* back to the lobby: bots leave, everyone else stays, nobody is ready */
export function toLobby(cup, now, { keepBots = false } = {}) {
  setPhase(cup, "lobby", now, null);
  cup.swapUntil = null;
  if (!keepBots) cup.entrants = cup.entrants.filter(entrant => !entrant.bot);
  for (const entrant of cup.entrants) entrant.ready = false;
  cup.field = [];
  cup.out = [];
  cup.results = [];
  cup.round = 0;
  cup.standings = [];
}

/* a restarted room resumes its race: a short countdown (startAt is the
   moment it goes again, as for any countdown), then on from the save */
export function resumeCountdown(cup, now, raceT) {
  cup.phase = "countdown";
  cup.startAt = now + TIMING.RESUME_MS;
  cup.endsAt = cup.startAt;
  cup.resume = true;
  cup.resumeT = raceT;
}

/* ---- swaps and balloons ---- */

/* may entrant i change floatie now? (survivors, in the first SWAP_MS of a cut) */
export const canSwap = (cup, i, now) => cup.phase === "cut" && cup.swapUntil !== null && now <= cup.swapUntil
  && cup.field.includes(i);

export function noteSwap(cup, i) { cup.swaps[i] = (cup.swaps[i] || 0) + 1; }

/* an eliminated rider finished their drink on the beach */
export function beachDrink(cup, i, now) {
  const spot = cup.beach[i];
  if (!spot || spot.drank) return false;
  spot.drank = true;
  spot.next = now;
  return true;
}

/* may entrant i throw a balloon now, at racer `at`? */
export function canThrow(cup, race, i, at, now) {
  const spot = cup.beach[i];
  if (cup.phase !== "race" || !race || !spot || !spot.drank || now < spot.next) return false;
  const target = riderOf(race, at);
  return !!target && !target.arrived;
}
export function noteThrow(cup, i, now) {
  cup.beach[i].next = now + BALLOON.EVERY_MS;
  cup.thrown[i] = (cup.thrown[i] || 0) + 1;
}
export function noteLanded(cup, i) { cup.landed[i] = (cup.landed[i] || 0) + 1; }
