/* Float's balancing bench (float/PROTOCOL.md "Floaties"): runs seeded bot
   races and whole Cups headlessly through the room's own race tick
   (float/shared/cup.js raceTick) and prints what tuning.js has to answer:

     1. time trials, one rider alone on each leg: strong to sloppy bots, and a
        drifter who never paddles (a strong paddler should take 60 to 80 s,
        a drifter about twice that)
     2. Cups of equal-skill bots: per leg, winning and median times, flips
        (the Drop and riffles), bumps, when riders drink, balloons
     3. win rates per floatie with equal-skill bots (no floatie may dominate)
     4. Cups of mixed skill: where each skill finishes (elimination spread)

     node scripts/float-sim.mjs [--cups 200] [--seed 1] [--skill 0.7] [--trials 6] [--only 1,2,3,4]

   Deterministic: the same flags print the same numbers. */
import { COURSE, legLength } from "../float/shared/course.js";
import { createRace, stepRace, applyInput, finishAt } from "../float/shared/sim.js";
import { createBot, botInputs } from "../float/shared/bots.js";
import { createCup, addBots, startCup, raceFor, raceTick, roundStatus, finishRound, advance } from "../float/shared/cup.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";
import { DT } from "../float/shared/tuning.js";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const CUPS = Number(option("--cups", 200));
const SEED = Number(option("--seed", 1));
const SKILL = Number(option("--skill", 0.7));
const TRIALS = Number(option("--trials", 6));
const ONLY = new Set(String(option("--only", "1,2,3,4")).split(",").map(Number));
const LEGS = COURSE.legs.length;

const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN;
const median = list => { if (!list.length) return NaN; const s = list.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : "-";
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : "-";
const pct = v => Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "-";
const pad = (v, n) => String(v).padStart(n);

/* ---- 1. time trials ---- */
function trial(leg, skill, seed, { drinking, floatie = "classic" }) {
  const race = createRace({ course:COURSE, leg, seed, drinking, field:[{ i:0, floatie, drinks:true }] });
  const bot = skill === null ? null : createBot({ i:0, skill, seed, leg, course:COURSE });
  while (race.t < 400 && finishAt(race.riders[0]) === null) {
    if (bot) for (const input of botInputs(race, COURSE, bot)) applyInput(race, 0, input);
    stepRace(race, COURSE);
  }
  const rider = race.riders[0];
  return { time:finishAt(rider) ?? race.t, arrive:rider.arriveAt ?? race.t, flips:rider.st.flips };
}

if (ONLY.has(1)) {
  console.log("\n1. Time trials: one rider alone, mean of", TRIALS, "seeds (arrive / with the drink)");
  console.log("   leg              len   skill 1.0     0.8     0.6     0.4     0.2   drifter  drifter/strong");
  for (let leg = 0; leg < LEGS; leg += 1) {
    const cells = [];
    let strong = NaN;
    for (const skill of [1, 0.8, 0.6, 0.4, 0.2]) {
      const dry = [], wet = [];
      for (let k = 0; k < TRIALS; k += 1) {
        dry.push(trial(leg, skill, SEED + k, { drinking:false }).arrive);
        wet.push(trial(leg, skill, SEED + k, { drinking:true }).time);
      }
      if (skill === 1) strong = mean(dry);
      cells.push(`${f1(mean(dry))}/${f1(mean(wet))}`);
    }
    const drift = mean([0, 1, 2].map(k => trial(leg, null, SEED + k, { drinking:false }).arrive));
    console.log(`   ${COURSE.legs[leg].name.padEnd(16)} ${pad(legLength(COURSE, leg), 4)}  ${cells.map(c => c.padStart(11)).join(" ")}  ${pad(f1(drift), 7)}  ${pad(f2(drift / strong), 6)}`);
  }
}

/* ---- a whole Cup of bots, headless ---- */
function runCup(seed, { n = 13, skill = null, drinking = true } = {}) {
  const cup = createCup({ id:`sim-${seed}`, seed, drinking });
  addBots(cup, n, seed);
  if (skill !== null) for (const entrant of cup.entrants) entrant.skill = skill;
  startCup(cup, 0);
  let now = 0;
  const legs = [];
  advance(cup, now); // intro -> grid
  for (;;) {
    const race = raceFor(cup, COURSE);
    race.bots = {};
    cup.phase = "race";
    const thrown = { n:0 };
    for (;;) {
      now += DT * 1000;
      const events = raceTick(cup, race, { now, driven:() => true, course:COURSE });
      for (const event of events) if (event.e === "balloon") thrown.n += 1;
      if (roundStatus(cup, race).over) break;
    }
    legs.push({ leg:race.leg, race, thrown:thrown.n, landed:race.riders.reduce((sum, rider) => sum + rider.st.splashed, 0) });
    const { last } = finishRound(cup, race, now);
    if (last) break;
    advance(cup, now); // cut -> grid
  }
  return { cup, legs };
}

if (ONLY.has(2) || ONLY.has(3)) {
  const perLeg = Array.from({ length:LEGS }, () => ({ win:[], med:[], flips:0, drop:0, riders:0, bumps:0, drinkAt:[], wait:[], thrown:0, landed:0 }));
  const byFloatie = Object.fromEntries(FLOATIE_IDS.map(id => [id, { entries:0, wins:0, podium:0, places:[] }]));
  const t0 = Date.now();
  for (let k = 0; k < CUPS; k += 1) {
    const { cup, legs } = runCup(SEED * 1000 + k, { skill:SKILL });
    for (const { leg, race, thrown, landed } of legs) {
      const stat = perLeg[leg];
      const times = race.riders.map(finishAt).filter(v => v !== null).sort((a, b) => a - b);
      stat.win.push(times[0]);
      stat.med.push(median(times));
      stat.riders += race.riders.length;
      stat.thrown += thrown;
      stat.landed += landed;
      for (const rider of race.riders) {
        stat.flips += rider.st.flips;
        stat.drop += rider.st.dropFlips;
        stat.bumps += rider.st.bumpsTaken;
        if (rider.drinkAt !== null && (rider.arriveAt === null || rider.drinkAt < rider.arriveAt)) stat.drinkAt.push(rider.drinkAt);
        else if (rider.drinkAt !== null) stat.wait.push(rider.drinkAt - rider.arriveAt);
      }
    }
    cup.final.forEach((i, place) => {
      const item = byFloatie[cup.entrants[i].look.floatie];
      item.entries += 1;
      item.places.push(place + 1);
      if (place === 0) item.wins += 1;
      if (place < 3) item.podium += 1;
    });
  }
  const ms = Date.now() - t0;
  if (ONLY.has(2)) {
    console.log(`\n2. ${CUPS} Cups of 13 bots at skill ${SKILL} (${(ms / CUPS).toFixed(0)} ms a Cup)`);
    console.log("   leg              winner  median  flips/rider  at the Drop  bumps/rider  drank mid-race at  drank at takeout  balloons thrown/landed per race");
    perLeg.forEach((stat, leg) => {
      const races = stat.win.length;
      console.log(`   ${COURSE.legs[leg].name.padEnd(16)} ${pad(f1(mean(stat.win)), 6)}  ${pad(f1(mean(stat.med)), 6)}  ${pad(f2(stat.flips / stat.riders), 11)}  ${pad(f2(stat.drop / stat.riders), 11)}  ${pad(f2(stat.bumps / stat.riders), 11)}  ${pad(`${f1(median(stat.drinkAt))} s (${pct(stat.drinkAt.length / stat.riders)})`, 17)}  ${pad(`+${f1(mean(stat.wait))} s (${pct(stat.wait.length / stat.riders)})`, 16)}  ${pad(`${f1(stat.thrown / races)}/${f1(stat.landed / races)}`, 10)}`);
    });
  }
  if (ONLY.has(3)) {
    console.log(`\n3. Floaties, equal skill (${SKILL}), ${CUPS} Cups: fair is ${pct(1 / 13)} wins and ${pct(3 / 13)} podiums an entry, mean place 7.0`);
    console.log("   floatie      entries   wins/entry  podium/entry  mean place");
    for (const [id, item] of Object.entries(byFloatie))
      console.log(`   ${id.padEnd(12)} ${pad(item.entries, 7)}   ${pad(pct(item.wins / item.entries), 10)}  ${pad(pct(item.podium / item.entries), 12)}  ${pad(f2(mean(item.places)), 10)}`);
  }
}

/* ---- 4. mixed skill ---- */
if (ONLY.has(4)) {
  const buckets = new Map();
  let bestWins = 0;
  const cups = Math.max(20, Math.round(CUPS / 2));
  for (let k = 0; k < cups; k += 1) {
    const { cup } = runCup(SEED * 7919 + k, {});
    const best = cup.entrants.reduce((top, entrant, i) => entrant.skill > cup.entrants[top].skill ? i : top, 0);
    if (cup.final[0] === best) bestWins += 1;
    cup.final.forEach((i, place) => {
      const key = Math.round(cup.entrants[i].skill * 10) / 10;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(place + 1);
    });
  }
  console.log(`\n4. ${cups} Cups of 13 bots, skills spread 0.2 to 0.95: mean final place by skill`);
  for (const key of [...buckets.keys()].sort((a, b) => b - a))
    console.log(`   skill ${key.toFixed(1)}   mean place ${f2(mean(buckets.get(key)))}   wins ${pct(buckets.get(key).filter(place => place === 1).length / buckets.get(key).length)}`);
  console.log(`   the strongest bot wins ${pct(bestWins / cups)} of Cups`);
}
