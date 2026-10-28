/* The Cup (float/GROOVE.md "Rounds, elimination, positions", "What the room
   sends"; float/PROTOCOL.md "The Cup", "Field Day"): phases, rounds, the
   cut, standings. Pure: every function takes the cup (plain JSON: the room
   saves it at every phase change and, in a song, every 2 s) and the time.
   The room, scripts/float-sim.mjs and the tests drive the same functions;
   the song itself is float/shared/groove.js.

     lobby -> intro -> [ song -> cut -> lastcall ] x rounds -> podium -> feedback -> lobby

   One song a round (chart.js songForRound: Paddle Party, Rock Hop, Spin
   Cycle, then The Drop). After each song but the last the lowest round
   percents are out (13 -> 9 -> 6 -> 3), ties by the Cup total (the rider's
   earlier percents), then perfects, then the field's order (the last
   round's ranking). The final's percent orders the podium; 4th and down
   are the riders cut, the last cut first, each cut in its own round's order.
   With 1 to 3 riders nobody is cut and the last song is the result.

   Last Call (GROOVE.md "Last Call") follows every cut but the last, when the
   room drinks (with drinking off there is none): everyone in the Cup at the
   bar, the field and the riders out, three grabs, the worst total drinks.
   Never scored in the Cup; who drank goes in that round's history. The cut
   before it is shorter (CUT_BEFORE_LAST_CALL_MS).

   Times are server ms. In `song`, startAt is when the round card goes up,
   songAt = startAt + SONG_LEAD_MS is beat 0 and endsAt = songAt + SONG_MS +
   SONG_TAIL_MS. A phase that ends on time hands its endsAt to the next, so
   the schedule never drifts; one that ends late (a room that slept) starts
   the next from now. */
import { CRITTERS, defaultLook, cleanLook } from "./looks.js";
import { FLOATIE_IDS } from "./floaties.js";
import { PALETTE, PHASES } from "./protocol.js";
import { LAST_CALL_ID, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS, chartOf, songForRound } from "./chart.js";
import { addTenths, botSkills, closeSong, createBar, createSong, cupTotal, drinksNow, excusedAtBar, isDone, lastCallOf, rand01,
  rankSong, riderScore, riderStats, seedOf, songScores, stepSong } from "./groove.js";

/* colours for riders without one (protocol.js owns the list) */
export { PALETTE, drinksNow };
export const ROUNDS = 4;
export const MAX_RIDERS = 16;
/* the Cup's clock (a song's own length is chart.js's) */
export const CUP_TIMING = Object.freeze({
  INTRO_MS:8000,
  CUT_MS:20000,
  /* after the final there is no one to cut: a short results beat */
  CUT_LAST_MS:7000,
  /* a cut with Last Call after it */
  CUT_BEFORE_LAST_CALL_MS:12000,
  /* Last Call goes up this long before its beat 0 */
  LAST_CALL_LEAD_MS:3000,
  PODIUM_MS:15000,
  FEEDBACK_MS:45000,
  /* a Field Day cup whose startAt has passed starts this soon */
  START_SOON_MS:1500,
  /* a phase that ends later than this after its endsAt starts the next from now */
  LATE_MS:1000,
});
export const SONG_PHASE_MS = SONG_LEAD_MS + SONG_MS + SONG_TAIL_MS;
/* Last Call's phase: the lead, its 16 s, the same tail as a song's */
export const LAST_CALL_PHASE_MS = CUP_TIMING.LAST_CALL_LEAD_MS + chartOf(LAST_CALL_ID).ms + SONG_TAIL_MS;

/* the field for every round: monotonic, never below 3, the final 3 once
   there are 3 or more; the cuts as even as they can be, bigger first (13:
   13, 9, 6, 3). 1 to 3 riders play every round uncut. */
export function cutSchedule(n, rounds = ROUNDS) {
  const riders = Math.max(0, Math.min(MAX_RIDERS, n | 0));
  if (riders <= 3) return new Array(rounds).fill(riders);
  const cuts = rounds - 1, total = riders - 3;
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
    v:2, id, mode, code, drinking:drinking !== false, seed:seed >>> 0, evId,
    phase:"lobby", startAt:null, endsAt:null, startPlanned:null,
    round:0, rounds:ROUNDS, schedule:[],
    entrants:[], field:[], out:[],
    /* the song: its state while it plays (groove.js), its id and beat 0 through its cut */
    song:null, songId:null, songAt:null,
    /* Last Call's state while it plays (groove.js createBar) */
    bar:null,
    /* the room's calibration, carried from song to song (0 at the first) */
    offset:0,
    /* each rider's earlier songs' percents, summed */
    totals:{},
    scores:[], results:[], history:[], standings:[], podium:null, final:null, done:false,
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

/* computer riders: critter names, spread skills, any floatie for a tube */
export function addBots(cup, count, seed = cup.seed) {
  const room = Math.max(0, Math.min(count | 0, MAX_RIDERS - cup.entrants.length));
  const skills = botSkills(room, seed);
  const taken = new Set(cup.entrants.map(entrant => entrant.name));
  const names = CRITTERS.map(item => item.name).filter(name => !taken.has(name));
  for (let k = 0; k < room; k += 1) {
    const at = Math.floor(rand01(seed, 0xb07, cup.entrants.length) * names.length);
    const name = names.length ? names.splice(at, 1)[0] : `Bot ${k + 1}`;
    const key = `bot-${cup.entrants.length + 1}-${seed}`;
    const floatie = FLOATIE_IDS[Math.floor(rand01(seedOf(key), 0xf1) * FLOATIE_IDS.length)];
    const look = cleanLook({ ...defaultLook(key, FLOATIE_IDS), floatie }, { floatieIds:FLOATIE_IDS, seed:key });
    const critter = CRITTERS.find(item => item.name === name);
    if (critter) look.critter = critter.id;
    cup.entrants.push(makeEntrant(cup, { name, color:null, look, drinks:true }, { device:key, bot:true, skill:skills[k] }));
  }
  return room;
}

const setPhase = (cup, phase, at, ms) => {
  cup.phase = phase;
  cup.startAt = at;
  cup.endsAt = ms === null ? null : at + ms;
};
/* where the next phase starts: the last one's end when on time, else now */
const nextStart = (cup, now) => Number.isFinite(cup.endsAt) && now - cup.endsAt < CUP_TIMING.LATE_MS ? cup.endsAt : now;

/* the Cup starts: everyone in the lobby rides */
export function startCup(cup, now) {
  cup.schedule = cutSchedule(cup.entrants.length);
  cup.rounds = ROUNDS;
  cup.round = 0;
  cup.out = [];
  cup.results = [];
  cup.scores = [];
  cup.history = [];
  cup.podium = null;
  cup.final = null;
  cup.done = false;
  cup.totals = {};
  cup.offset = 0;
  cup.song = null;
  cup.bar = null;
  cup.songId = songForRound(0, cup.rounds);
  cup.songAt = null;
  delete cup.resultQueued;
  /* the first field's order, drawn by the cup's seed (it breaks a first round's last tie) */
  const order = cup.entrants.map((_, i) => i);
  for (let k = order.length - 1; k > 0; k -= 1) {
    const j = Math.floor(rand01(cup.seed, seedOf(cup.id), 0x0f1e1d, k) * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  cup.field = order;
  cup.standings = standingsOf(cup);
  setPhase(cup, "intro", now, CUP_TIMING.INTRO_MS);
}

export const isLastRound = cup => cup.round >= cup.rounds - 1;
/* how many go through this round (the next round's field), or null in the last */
export const cutOf = cup => isLastRound(cup) ? null : cup.schedule[cup.round + 1] ?? null;
/* is there a Last Call after this round's cut? (every cut but the last, the room drinking) */
export const lastCallAfter = cup => cup.drinking !== false && !isLastRound(cup);
/* everyone in the Cup at the bar: the field, then the riders out, the last out first */
export const barPlayers = cup => [...cup.field, ...cup.out.slice().reverse()];

/* the song for this round goes up at `at` */
function enterSong(cup, at) {
  const songAt = at + SONG_LEAD_MS;
  cup.songId = songForRound(cup.round, cup.rounds);
  cup.songAt = songAt;
  cup.results = [];
  cup.scores = [];
  cup.song = createSong({ cup, round:cup.round, songAt, field:cup.field, base:cup.offset, startAt:at });
  setPhase(cup, "song", at, SONG_PHASE_MS);
}

/* the song is over: places, the cut, on to `cut` */
function endSong(cup, at, driven) {
  const song = cup.song;
  const { ranking, events } = closeSong(cup, song, { driven });
  const last = isLastRound(cup);
  const through = last ? ranking.length : Math.min(ranking.length, cutOf(cup) ?? ranking.length);
  const survivors = ranking.slice(0, through).map(row => row.i);
  const eliminated = ranking.slice(through).map(row => row.i);
  /* out: elimination order, a round's worst first, so the last cut's best
     is the last entry (4th place) */
  cup.out.push(...eliminated.slice().reverse());
  const results = ranking.map(row => ({ ...row, out:eliminated.includes(row.i) }));
  cup.scores = songScores(cup, song, Infinity);
  const stats = Object.fromEntries(song.field.map(i => [i, riderStats(cup, song, i)]));
  for (const row of ranking) cup.totals[row.i] = addTenths(cupTotal(cup, row.i), row.pct);
  cup.offset = song.offset;
  cup.history.push({ round:cup.round, song:song.id, field:song.field.slice(), results, out:eliminated,
    offset:song.offset, samples:song.samples.length, stats });
  cup.results = results;
  cup.field = survivors;
  cup.song = null;
  if (last) {
    cup.final = [...survivors, ...cup.out.slice().reverse()];
    cup.podium = survivors.slice(0, 3);
    cup.done = true;
  }
  cup.standings = standingsOf(cup);
  setPhase(cup, "cut", at, last ? CUP_TIMING.CUT_LAST_MS : lastCallAfter(cup) ? CUP_TIMING.CUT_BEFORE_LAST_CALL_MS : CUP_TIMING.CUT_MS);
  return { survivors, eliminated, last, events };
}

/* Last Call goes up at `at`: everyone in the Cup, on the last song's offset */
function enterLastCall(cup, at) {
  cup.bar = createBar({ cup, round:cup.round, songAt:at + CUP_TIMING.LAST_CALL_LEAD_MS, players:barPlayers(cup), offset:cup.offset });
  setPhase(cup, "lastcall", at, LAST_CALL_PHASE_MS);
}

/* Last Call is over: any grab still open is a miss; the totals, who drank
   and who a stand-in grabbed for (excused) go in this round's history.
   Returns { events, lastCall }. */
function endLastCall(cup, driven) {
  const bar = cup.bar;
  const { events } = closeSong(cup, bar, { driven });
  const { totals, worst } = lastCallOf(bar, Infinity);
  const lastCall = { round:bar.round, players:bar.field.slice(), offset:bar.offset, totals, worst, excused:excusedAtBar(bar) };
  const item = cup.history.find(entry => entry.round === bar.round);
  if (item) item.lastCall = lastCall;
  cup.bar = null;
  return { events, lastCall };
}

/* the phase after a timed one ends; the room calls it (through tick) when
   endsAt passes. Returns { phase, events?, eliminated?, survivors?, last? }. */
export function advance(cup, now, { driven = () => true } = {}) {
  const at = nextStart(cup, now);
  switch (cup.phase) {
    case "intro":
      enterSong(cup, at);
      return { phase:"song" };
    case "song":
      if (!cup.song) ensureSong(cup);
      return { phase:"cut", ...endSong(cup, at, driven) };
    case "cut":
      if (cup.done) { setPhase(cup, "podium", at, CUP_TIMING.PODIUM_MS); return { phase:"podium" }; }
      if (lastCallAfter(cup)) { enterLastCall(cup, at); return { phase:"lastcall" }; }
      cup.round += 1;
      enterSong(cup, at);
      return { phase:"song" };
    case "lastcall": {
      if (!cup.bar) ensureBar(cup);
      const ended = endLastCall(cup, driven);
      cup.round += 1;
      enterSong(cup, at);
      return { phase:"song", ...ended };
    }
    case "podium":
      setPhase(cup, "feedback", at, CUP_TIMING.FEEDBACK_MS);
      return { phase:"feedback" };
    case "feedback":
      toLobby(cup, now);
      return { phase:"lobby" };
    default:
      return { phase:cup.phase };
  }
}

/* Everything due by `now`: the song's taps, misses and Done, then any
   phase whose end has come. `driven(i, t)` says whether nobody's phone
   plays rider i at time t (a bot entrant, a kicked rider, a phone gone).
   Returns { events (groove.js's, in time order), phases (each phase
   entered, in order), eliminated (this tick's cut, in place order), offset
   (whether the room's offset changed) }. */
export function tick(cup, now, { driven = () => true } = {}) {
  const out = { events:[], phases:[], eliminated:[], offset:false, lastCall:null };
  for (let guard = 0; guard < 8; guard += 1) {
    const playing = playingOf(cup);
    if (playing) {
      const step = stepSong(cup, playing, Math.min(now, cup.endsAt ?? now), { driven });
      out.events.push(...step.events);
      if (step.offset) out.offset = true;
    }
    if (cup.phase === "lobby" || !Number.isFinite(cup.endsAt) || now < cup.endsAt) break;
    const moved = advance(cup, now, { driven });
    out.events.push(...(moved.events || []));
    out.eliminated.push(...(moved.eliminated || []));
    if (moved.lastCall) out.lastCall = moved.lastCall;
    out.phases.push(cup.phase);
    if (cup.phase === "lobby") break;
  }
  return out;
}

/* what is being played now: the song in `song`, the bar in `lastcall` (made
   afresh by the clock if a save lost it), else null */
export function playingOf(cup) {
  if (cup.phase === "song") return cup.song || ensureSong(cup);
  if (cup.phase === "lastcall") return cup.bar || ensureBar(cup);
  return null;
}

/* a song phase without its state (an old save): a fresh one by the clock */
export function ensureSong(cup) {
  if (cup.song && cup.song.round === cup.round && cup.song.songAt === cup.songAt) return cup.song;
  const songAt = Number.isFinite(cup.songAt) ? cup.songAt : (cup.startAt ?? 0) + SONG_LEAD_MS;
  cup.songAt = songAt;
  cup.songId = songForRound(cup.round, cup.rounds);
  cup.song = createSong({ cup, round:cup.round, songAt, field:cup.field, base:cup.offset, startAt:songAt - SONG_LEAD_MS });
  return cup.song;
}

/* a lastcall phase without its state: a fresh bar by the clock */
export function ensureBar(cup) {
  if (cup.bar && cup.bar.round === cup.round) return cup.bar;
  cup.bar = createBar({ cup, round:cup.round, songAt:(cup.startAt ?? 0) + CUP_TIMING.LAST_CALL_LEAD_MS, players:barPlayers(cup),
    offset:cup.offset });
  return cup.bar;
}

/* back to the lobby: bots leave, everyone else stays, nobody is ready. The
   last Cup's rounds go with it (its indexes were the bots' too); a finished
   Field Day Cup keeps `done` (it may be rerun as a party) and posts its
   result before it gets here (the room's postResultOnce). */
export function toLobby(cup, now, { keepBots = false } = {}) {
  setPhase(cup, "lobby", now, null);
  if (!keepBots) cup.entrants = cup.entrants.filter(entrant => !entrant.bot);
  for (const entrant of cup.entrants) { entrant.ready = false; delete entrant.kicked; }
  cup.field = [];
  cup.out = [];
  cup.results = [];
  cup.scores = [];
  cup.history = [];
  cup.podium = null;
  cup.final = null;
  cup.totals = {};
  cup.round = 0;
  cup.song = null;
  cup.bar = null;
  cup.songId = null;
  cup.songAt = null;
  cup.standings = [];
}

/* A cup saved by another version (the parked 3D river's phases): back to
   its lobby with its entrants. A Field Day cup that was under way starts
   over by itself, soon. */
export function migrate(cup, now) {
  if (cup?.v === 2 && PHASES.includes(cup.phase)) return cup;
  const next = createCup({ id:cup?.id || "cup", mode:cup?.mode === "fieldday" ? "fieldday" : "party", code:cup?.code || "",
    drinking:cup?.drinking !== false, seed:Number(cup?.seed) >>> 0, evId:cup?.evId ?? null });
  next.entrants = (Array.isArray(cup?.entrants) ? cup.entrants : []).filter(entrant => entrant && typeof entrant === "object");
  const underway = cup?.phase && cup.phase !== "lobby";
  toLobby(next, now, { keepBots:next.mode === "fieldday" && !cup?.done });
  if (next.mode === "fieldday" && !cup?.done)
    next.startPlanned = underway ? now + CUP_TIMING.START_SOON_MS : cup?.startPlanned ?? null;
  if (cup?.done) { next.done = true; if (cup.resultQueued) next.resultQueued = true; }
  return next;
}

/* the Cup so far: [{ i, place, out }] (out: the round they went out in, or null) */
export function standingsOf(cup) {
  const outRound = {};
  for (const item of cup.history) for (const i of item.out) outRound[i] = item.round;
  const order = cup.final || [...cup.field, ...cup.out.slice().reverse()];
  return order.map((i, k) => ({ i, place:k + 1, out:outRound[i] ?? null }));
}

/* ---- what the room sends ---- */

/* the room's offset now: the song's while one plays, else the last song's */
export const offsetOf = cup => cup.phase === "song" && cup.song ? cup.song.offset : cup.offset || 0;

/* `scores` for the field: [{ i, pts, pct, live, n, cup, done }]: the song
   so far, its final scores through its cut (and on to the podium), zeros
   before the first */
export function scoresOf(cup, now) {
  if (cup.phase === "lobby") return [];
  if (cup.phase === "song" && cup.song) return songScores(cup, cup.song, now);
  if (cup.phase === "intro") return cup.field.map(i => ({ i, pts:0, pct:0, live:0, n:0, cup:cupTotal(cup, i), done:false }));
  return cup.scores || [];
}

/* `lastCall` in Last Call: { totals:[{ i, ms, grabs }], worst } (groove.js
   lastCallOf; worst null until the last grab's miss deadline), else null */
export function lastCallSummary(cup, now) {
  return cup.phase === "lastcall" && cup.bar ? lastCallOf(cup.bar, now) : null;
}

/* `results`: the round's ranking, live in a song, final from its cut:
   [{ i, place, pts, pct, perfects, misses, cup, out? }] */
export function resultsOf(cup) {
  if (cup.phase === "song" && cup.song) return rankSong(cup, cup.song);
  return cup.phase === "lobby" ? [] : cup.results || [];
}

/* `me`: one rider's own state for their phone. In a song: pts, pct, live,
   place so far, of, cut, done and the last judgement (c, q, d); in its
   cut: the round's result with through or out; at Last Call: their
   lastCall { ms, grabs } and last grab (c, q, d), out if they are; a rider
   out earlier: out with their place in the Cup so far; before and after:
   their place. */
export function meOf(cup, i, now) {
  const base = { i, round:cup.round, cut:cutOf(cup), lastRound:isLastRound(cup) };
  if (cup.phase === "song" && cup.song?.judged?.[i]) {
    const ranking = rankSong(cup, cup.song);
    const row = ranking.find(item => item.i === i);
    const score = riderScore(cup.song, i);
    const last = cup.song.last[i];
    /* done: Done tapped; for a rider who skips the drink, always (their own
       phone only: the room's scores show them done when a bot would be) */
    return { ...base, pts:score.pts, pct:score.pct, live:score.live, n:score.n, place:row.place, of:ranking.length,
      done:isDone(cup.song, i, now) || !drinksNow(cup, i), ...(last ? { c:last.c, q:last.q, ...(last.d === undefined ? {} : { d:last.d }) } : {}) };
  }
  if (cup.phase === "lastcall" && cup.bar?.judged?.[i]) {
    const own = lastCallOf(cup.bar, now).totals.find(item => item.i === i);
    const last = cup.bar.last[i];
    const standing = cup.standings.find(item => item.i === i);
    return { ...base, ...(cup.out.includes(i) ? { out:true } : {}), place:standing?.place ?? null, of:cup.standings.length,
      lastCall:{ ms:own.ms, grabs:own.grabs }, ...(last ? { c:last.c, q:last.q, ...(last.d === undefined ? {} : { d:last.d }) } : {}) };
  }
  const row = cup.phase === "cut" ? cup.results.find(item => item.i === i) : null;
  if (row) return { ...base, pts:row.pts, pct:row.pct, live:row.pct, place:row.place, of:cup.results.length, done:true,
    through:!row.out, out:row.out === true };
  const standing = cup.standings.find(item => item.i === i);
  const place = standing?.place ?? null;
  if (cup.out.includes(i)) return { ...base, out:true, place, of:cup.standings.length };
  return { ...base, place, of:cup.phase === "intro" ? cup.field.length : cup.standings.length };
}
