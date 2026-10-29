/* The Cup (float/GROOVE.md "Rounds, elimination, positions", "What the room
   sends"; float/PROTOCOL.md "The Cup", "Field Day"): phases, rounds, the
   cut, standings. Pure: every function takes the cup (plain JSON: the room
   saves it at every phase change and, in a song, every 2 s) and the time.
   The room, scripts/float-sim.mjs and the tests drive the same functions;
   the song itself is float/shared/groove.js.

     lobby -> intro -> [ song -> cut -> chugoff -> lastcall ] x rounds -> podium -> feedback -> lobby

   One song a round (chart.js songForRound: Paddle Party, Rock Hop, Spin
   Cycle, then The Drop). After each song but the last the lowest round
   percents are out (13 -> 9 -> 6 -> 3), ties by the Cup total (the rider's
   earlier percents), then perfects, then the field's order (the last
   round's ranking). The final's percent orders the podium; 4th and down
   are the riders cut, the last cut first, each cut in its own round's order.
   With 1 to 3 riders nobody is cut and the last song is the result.

   After a song the cut is a show (GROOVE.md "After a song"): every rider's
   grade (gradeOf), the song's awards (awardsOf), each phone's line
   (feedbackOf), then the riders out one by one (cutShowOf: the beats).

   The chug-off (GROOVE.md "The chug-off") follows every cut but the last,
   when the room drinks and someone goes out: the last rider through and the
   first rider out (the cut's order, its ties included) race to finish a
   drink; the first Done keeps the spot. The cut reveals the outs below them;
   the chug-off settles the spot, the round's `out` and the next field.

   Last Call (GROOVE.md "Last Call: the countdown") follows every cut but
   the last, when the room drinks (with drinking off there is none):
   everyone in the Cup at the bar, the field and the riders out, one tap on
   the countdown's zero (chartOf(lastCallId(round)): lights, slow, ticks),
   the farthest off drinks. Never scored in the Cup; who drank goes in that
   round's history. The cut before it is shorter (CUT_BEFORE_LAST_CALL_MS).

   Times are server ms. In `song`, startAt is when the round card goes up,
   songAt = startAt + SONG_LEAD_MS is beat 0 and endsAt = songAt + SONG_MS +
   SONG_TAIL_MS. A phase that ends on time hands its endsAt to the next, so
   the schedule never drifts; one that ends late (a room that slept) starts
   the next from now. */
import { CRITTERS, defaultLook, cleanLook } from "./looks.js";
import { FLOATIE_IDS } from "./floaties.js";
import { PALETTE, PHASES } from "./protocol.js";
import { CHUGOFF, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS, awardsOf, chartOf, feedbackOf, gradeOf, lastCallId, songForRound }
  from "./chart.js";
import { addTenths, botChugAfter, botSkills, closeSong, createBar, createSong, cupTotal, excusedAtBar, hitsOf, lastCallOf, rand01,
  rankSong, riderScore, riderStats, seedOf, songScores, stepSong } from "./groove.js";

/* colours for riders without one (protocol.js owns the list) */
export { PALETTE };
export const ROUNDS = 4;
export const MAX_RIDERS = 16;
/* the Cup's clock (a song's own length is chart.js's) */
export const CUP_TIMING = Object.freeze({
  INTRO_MS:8000,
  /* the cut's show: grades, awards, the riders out one by one (CUT_SHOW) */
  CUT_MS:15000,
  /* after the final there is no one to cut: the grades and awards */
  CUT_LAST_MS:7000,
  /* a cut with the chug-off and Last Call after it (the room drinking) */
  CUT_BEFORE_LAST_CALL_MS:12000,
  /* the chug-off, at its longest: the call (the Cup's first says its rule:
     INTRO_FIRST_MS), the window, the reveal, the exit (chart.js CHUGOFF); a
     Done ends the window early. The first one's (chugoffPhaseMs: a later one) */
  CHUGOFF_MAX_MS:CHUGOFF.INTRO_FIRST_MS + CHUGOFF.WINDOW_MS + CHUGOFF.REVEAL_MS + CHUGOFF.EXIT_MS,
  /* the cut's beats from its start (cutShowOf): the grades' stamp, the
     awards a card apart, the cut line after the last, then the riders out
     from the bottom, at most OUT_GAP_MS apart and done END_MS before the end */
  CUT_SHOW:Object.freeze({ GRADES_MS:400, AWARDS_MS:2400, AWARD_GAP_MS:1200, OUTS_AFTER_LINE_MS:800, OUT_GAP_MS:1400, END_MS:1200 }),
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
/* a chug-off's call, and its phase at its longest: the Cup's first says its rule */
export const chugoffIntroMs = first => first ? CHUGOFF.INTRO_FIRST_MS : CHUGOFF.INTRO_MS;
export const chugoffPhaseMs = first => chugoffIntroMs(first) + CHUGOFF.WINDOW_MS + CHUGOFF.REVEAL_MS + CHUGOFF.EXIT_MS;
/* the Last Call after round k: the lead, its chart (the countdown, the first
   one's intro the longer), the same tail as a song's */
export const lastCallPhaseMs = round => CUP_TIMING.LAST_CALL_LEAD_MS + chartOf(lastCallId(round)).ms + SONG_TAIL_MS;

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
    /* the chug-off's pair while the cut leads to it ([a, b]), the chug-off
       while it runs, Last Call's state while it plays (groove.js createBar) */
    bubble:null, chugoff:null, bar:null,
    /* the room's calibration, carried from song to song (0 at the first) */
    offset:0,
    /* each rider's earlier songs' percents, summed */
    totals:{},
    /* the last song's awards and each rider's line, for its cut */
    awards:[], feedback:{},
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
  cup.awards = [];
  cup.feedback = {};
  cup.offset = 0;
  cup.song = null;
  cup.bubble = null;
  cup.chugoff = null;
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
  cup.song = createSong({ cup, round:cup.round, songAt, field:cup.field, base:cup.offset });
  setPhase(cup, "song", at, SONG_PHASE_MS);
}

/* the song is over: places, the cut, on to `cut`. With a chug-off to come,
   its pair (a the last through, b the first out, by the cut's order and its
   ties) stays undecided: neither is in the field or out until it settles. */
function endSong(cup, at, driven) {
  const song = cup.song;
  const { ranking, events } = closeSong(cup, song, { driven });
  const last = isLastRound(cup);
  const through = last ? ranking.length : Math.min(ranking.length, cutOf(cup) ?? ranking.length);
  const bubble = cup.drinking !== false && !last && through > 0 && through < ranking.length
    ? [ranking[through - 1].i, ranking[through].i] : null;
  const survivors = ranking.slice(0, through).map(row => row.i).filter(i => !bubble?.includes(i));
  const eliminated = ranking.slice(through).map(row => row.i).filter(i => !bubble?.includes(i));
  /* out: elimination order, a round's worst first, so the last cut's best
     is the last entry (4th place); a chug-off's loser joins after them */
  cup.out.push(...eliminated.slice().reverse());
  const results = ranking.map(row => ({ ...row, grade:gradeOf(row.pct), out:eliminated.includes(row.i),
    ...(bubble?.includes(row.i) ? { bubble:true } : {}) }));
  cup.scores = songScores(cup, song);
  const stats = Object.fromEntries(song.field.map(i => [i, riderStats(cup, song, i)]));
  /* the show's: the song's awards, each rider's line */
  const chart = chartOf(song.id);
  const hits = song.field.map(i => ({ i, hits:hitsOf(song, i) }));
  cup.awards = awardsOf(chart, hits);
  const pctOf = Object.fromEntries(ranking.map(row => [row.i, row.pct]));
  cup.feedback = Object.fromEntries(hits.map(({ i, hits:own }) => [i, feedbackFor(chart, own, pctOf[i])]));
  for (const row of ranking) cup.totals[row.i] = addTenths(cupTotal(cup, row.i), row.pct);
  cup.offset = song.offset;
  cup.history.push({ round:cup.round, song:song.id, field:song.field.slice(), results, out:eliminated,
    offset:song.offset, samples:song.samples.length, stats, awards:cup.awards });
  cup.results = results;
  cup.field = survivors;
  cup.bubble = bubble;
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

/* A rider's line after a song (chart.js feedbackOf), with the song's own
   grade (every cue). chart.js's words have no name for the breakdown's echo
   cues yet (feedbackOf throws, or says "undefined", when echo is a rider's
   best or worst): until they do, such a line is made without them. */
function feedbackFor(chart, hits, pct) {
  const lineOf = view => {
    try {
      const line = feedbackOf(view, hits).line;
      return /undefined/.test(line) ? null : line;
    } catch { return null; }
  };
  const line = lineOf(chart) ?? lineOf({ ...chart, cues:chart.cues.filter(cue => cue.kind !== "echo") }) ?? "";
  return { grade:gradeOf(pct), line };
}

/* ---- the chug-off ---- */

/* the chug-off goes up at `at`: the call, then the go */
function enterChugoff(cup, at) {
  const [a, b] = cup.bubble;
  const first = !cup.history.some(item => item.chugoff);
  cup.chugoff = { round:cup.round, a, b, first, goAt:at + chugoffIntroMs(first), doneAt:{}, winner:null, loser:null, by:null, decidedAt:null };
  setPhase(cup, "chugoff", at, chugoffPhaseMs(first));
}

/* The spot is settled: the winner is the last through (the next field's
   last), the loser the round's best out; the reveal and the exit follow.
   Returns { winner, loser, by, at }. */
function settleChugoff(cup, winner, by, at) {
  const chug = cup.chugoff;
  const loser = winner === chug.a ? chug.b : chug.a;
  Object.assign(chug, { winner, loser, by, decidedAt:Math.round(at) });
  cup.field.push(winner);
  cup.out.push(loser);
  cup.bubble = null;
  const item = cup.history.find(entry => entry.round === chug.round);
  if (item) item.out = [loser, ...item.out.filter(i => i !== loser)];
  for (const rows of [cup.results, item?.results]) for (const row of rows || []) {
    if (row.i === loser) row.out = true;
    if (row.i === winner) row.out = false;
  }
  cup.standings = standingsOf(cup);
  cup.endsAt = Math.min(cup.endsAt, Math.round(at) + CHUGOFF.REVEAL_MS + CHUGOFF.EXIT_MS);
  return { winner, loser, by, at:Math.round(at) };
}

/* The window closed with nobody Done: a contender whose phone is gone can't
   win (the other keeps the spot: "forfeit"); both here or both gone, the
   better score does (a: the cut's order, ties included). */
function settleByWindow(cup, at, driven) {
  const { a, b } = cup.chugoff;
  const gone = i => cup.entrants[i]?.bot !== true && driven(i, at);
  if (gone(a) !== gone(b)) return settleChugoff(cup, gone(a) ? b : a, "forfeit", at);
  return settleChugoff(cup, a, "score", at);
}

/* drink in a chug-off: a contender's Done, from the go to the window's
   close (once each). The first keeps the spot; a later one is kept for the
   record. Returns { events, decided } or null when it doesn't count. */
export function chugDone(cup, i, now) {
  const chug = cup.chugoff;
  if (cup.phase !== "chugoff" || !chug || (i !== chug.a && i !== chug.b)) return null;
  if (now < chug.goAt || now > chug.goAt + CHUGOFF.WINDOW_MS || chug.doneAt[i] !== undefined) return null;
  chug.doneAt[i] = Math.round(now - chug.goAt);
  return { events:[{ e:"done", i, at:Math.round(now) }], decided:chug.winner === null ? settleChugoff(cup, i, "chug", now) : null };
}

/* the chug-off up to `now`: bots finish their drink 4 to 12 s after the go
   (a stand-in never chugs for a phone gone), then the window's close */
function stepChugoff(cup, now, driven) {
  const chug = cup.chugoff;
  const out = { events:[], decided:null };
  if (!chug) return out;
  const close = chug.goAt + CHUGOFF.WINDOW_MS;
  const due = [chug.a, chug.b].filter(i => cup.entrants[i]?.bot && chug.doneAt[i] === undefined)
    .map(i => ({ i, at:chug.goAt + botChugAfter(cup.seed, chug.round, i) }))
    .filter(item => item.at <= now && item.at <= close).sort((x, y) => x.at - y.at || x.i - y.i);
  for (const { i, at } of due) {
    chug.doneAt[i] = at - chug.goAt;
    out.events.push({ e:"done", i, at });
    if (chug.winner === null) out.decided = settleChugoff(cup, i, "chug", at);
  }
  if (chug.winner === null && now >= close) out.decided = settleByWindow(cup, close, driven);
  return out;
}

/* the chug-off is over: its record in the round's history */
function endChugoff(cup, driven) {
  const chug = cup.chugoff;
  let decided = null;
  if (chug.winner === null) decided = settleByWindow(cup, chug.goAt + CHUGOFF.WINDOW_MS, driven);
  const record = { round:chug.round, a:chug.a, b:chug.b, goAt:chug.goAt, doneAt:{ ...chug.doneAt }, winner:chug.winner,
    loser:chug.loser, by:chug.by };
  const item = cup.history.find(entry => entry.round === chug.round);
  if (item) item.chugoff = record;
  cup.chugoff = null;
  return { chugoff:record, decided };
}

/* `chugoff` in its phase: { a, b, goAt, doneAt:{ [i]: ms after goAt }, winner, by }, and once
   it is decided its loser and decidedAt (server ms: the first Done, or the window's close) (else null) */
export function chugoffSummary(cup) {
  const chug = cup.phase === "chugoff" ? cup.chugoff : null;
  if (!chug) return null;
  return { a:chug.a, b:chug.b, goAt:chug.goAt, doneAt:{ ...chug.doneAt }, winner:chug.winner, by:chug.by,
    ...(chug.winner !== null ? { loser:chug.loser, decidedAt:chug.decidedAt } : {}) };
}

/* Last Call goes up at `at`: everyone in the Cup, on the last song's
   offset, the round's countdown */
function enterLastCall(cup, at) {
  cup.bar = createBar({ cup, round:cup.round, songAt:at + CUP_TIMING.LAST_CALL_LEAD_MS, players:barPlayers(cup), offset:cup.offset });
  setPhase(cup, "lastcall", at, lastCallPhaseMs(cup.round));
}

/* Last Call is over: no tap is a miss; the totals, who drank and who a
   stand-in counted for (excused) go in this round's history. Returns
   { events, lastCall }. */
function endLastCall(cup, driven) {
  const bar = cup.bar;
  const { events } = closeSong(cup, bar, { driven });
  const { totals, worst } = lastCallOf(bar, Infinity);
  const lastCall = { round:bar.round, id:bar.id, trick:chartOf(bar.id).countdown.trick, players:bar.field.slice(),
    offset:bar.offset, totals, worst, excused:excusedAtBar(bar) };
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
      if (cup.bubble) { enterChugoff(cup, at); return { phase:"chugoff" }; }
      if (lastCallAfter(cup)) { enterLastCall(cup, at); return { phase:"lastcall" }; }
      cup.round += 1;
      enterSong(cup, at);
      return { phase:"song" };
    case "chugoff": {
      const ended = cup.chugoff ? endChugoff(cup, driven) : {};
      if (lastCallAfter(cup)) { enterLastCall(cup, at); return { phase:"lastcall", ...ended }; }
      cup.round += 1;
      enterSong(cup, at);
      return { phase:"song", ...ended };
    }
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

/* Everything due by `now`: the song's (or Last Call's) taps and misses, a
   chug-off's bots and its window, then any phase whose end has come.
   `driven(i, t)` says whether nobody's phone plays rider i at time t (a bot
   entrant, a kicked rider, a phone gone). Returns { events (groove.js's,
   and the chug-off's { e:"done", i, at }, in time order), phases (each
   phase entered, in order), eliminated (this tick's cut, in place order),
   decided (a chug-off settled: { winner, loser, by, at }), offset (whether
   the room's offset changed), lastCall and chugoff (a record just closed) }. */
export function tick(cup, now, { driven = () => true } = {}) {
  const out = { events:[], phases:[], eliminated:[], decided:null, offset:false, lastCall:null, chugoff:null };
  for (let guard = 0; guard < 8; guard += 1) {
    const playing = playingOf(cup);
    if (playing) {
      const step = stepSong(cup, playing, Math.min(now, cup.endsAt ?? now), { driven });
      out.events.push(...step.events);
      if (step.offset) out.offset = true;
    }
    if (cup.phase === "chugoff" && cup.chugoff) {
      const step = stepChugoff(cup, Math.min(now, cup.endsAt ?? now), driven);
      out.events.push(...step.events);
      if (step.decided) out.decided = step.decided;
    }
    if (cup.phase === "lobby" || !Number.isFinite(cup.endsAt) || now < cup.endsAt) break;
    const moved = advance(cup, now, { driven });
    out.events.push(...(moved.events || []));
    out.eliminated.push(...(moved.eliminated || []));
    if (moved.lastCall) out.lastCall = moved.lastCall;
    if (moved.chugoff) out.chugoff = moved.chugoff;
    if (moved.decided) out.decided = moved.decided;
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
  cup.song = createSong({ cup, round:cup.round, songAt, field:cup.field, base:cup.offset });
  return cup.song;
}

/* a lastcall phase without its state: a fresh bar by the clock (the round's countdown) */
export function ensureBar(cup) {
  if (cup.bar && cup.bar.round === cup.round && cup.bar.id === lastCallId(cup.round)) return cup.bar;
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
  cup.awards = [];
  cup.feedback = {};
  cup.round = 0;
  cup.song = null;
  cup.bubble = null;
  cup.chugoff = null;
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

/* `scores` for the field: [{ i, pts, pct, live, n, cup }]: the song
   so far, its final scores through its cut (and on to the podium), zeros
   before the first */
export function scoresOf(cup, now) {
  if (cup.phase === "lobby") return [];
  if (cup.phase === "song" && cup.song) return songScores(cup, cup.song);
  if (cup.phase === "intro") return cup.field.map(i => ({ i, pts:0, pct:0, live:0, n:0, cup:cupTotal(cup, i) }));
  return cup.scores || [];
}

/* `lastCall` in Last Call: { totals:[{ i, ms, d }], worst } (groove.js
   lastCallOf; worst null until the zero's miss deadline), else null */
export function lastCallSummary(cup, now) {
  return cup.phase === "lastcall" && cup.bar ? lastCallOf(cup.bar, now) : null;
}

/* `awards` in the cut: the song's (chart.js awardsOf: [{ id, i, value, label }]), else null */
export const awardsSummary = cup => cup.phase === "cut" ? cup.awards || [] : null;

/* The cut's show (GROOVE.md "After a song") as beats every screen, phone
   and speaker can land on (server ms; null outside the cut): { grades,
   awards:[at, ...] (one a card, in awards' order), line (the cut line, null
   after the final), outs:[{ i, at }] (this round's riders out, from the
   bottom; with a chug-off to come, the ones below its pair), bubble (the
   chug-off's pair [a, b], or null) }. The outs spread over what the cut has
   left, at most CUT_SHOW.OUT_GAP_MS apart. */
export function cutShowOf(cup) {
  if (cup.phase !== "cut" || !Number.isFinite(cup.startAt) || !Number.isFinite(cup.endsAt)) return null;
  const S = CUP_TIMING.CUT_SHOW;
  const t0 = cup.startAt;
  const awards = (cup.awards || []).map((_, k) => t0 + S.AWARDS_MS + k * S.AWARD_GAP_MS);
  const out = (cup.results || []).filter(row => row.out).map(row => row.i).reverse();
  const bubble = cup.bubble ? cup.bubble.slice() : null;
  const line = out.length || bubble ? t0 + S.AWARDS_MS + awards.length * S.AWARD_GAP_MS : null;
  if (!out.length) return { grades:t0 + S.GRADES_MS, awards, line, outs:[], bubble };
  const from = line + S.OUTS_AFTER_LINE_MS;
  const gap = Math.max(0, Math.min(S.OUT_GAP_MS, (cup.endsAt - S.END_MS - from) / out.length));
  return { grades:t0 + S.GRADES_MS, awards, line, outs:out.map((i, k) => ({ i, at:Math.round(from + k * gap) })), bubble };
}

/* `results`: the round's ranking, live in a song, final from its cut with
   each rider's grade: [{ i, place, pts, pct, perfects, misses, cup, grade?, out? }] */
export function resultsOf(cup) {
  if (cup.phase === "song" && cup.song) return rankSong(cup, cup.song);
  return cup.phase === "lobby" ? [] : cup.results || [];
}

/* `me`: one rider's own state for their phone. In a song: pts, pct, live,
   place so far, of, cut and the last judgement (c, q, d); through its cut
   and chug-off: the round's result with through or out and their feedback
   { grade, line } (feedbackOf), a chug-off's pair `bubble` and neither
   through nor out (through null) until it settles; at Last Call: their
   lastCall { ms, d } and the tap's judgement (c, q, d), out if they are; a
   rider out earlier: out with their place in the Cup so far; before and
   after: their place. */
export function meOf(cup, i, now) {
  const base = { i, round:cup.round, cut:cutOf(cup), lastRound:isLastRound(cup) };
  if (cup.phase === "song" && cup.song?.judged?.[i]) {
    const ranking = rankSong(cup, cup.song);
    const row = ranking.find(item => item.i === i);
    const score = riderScore(cup.song, i);
    const last = cup.song.last[i];
    return { ...base, pts:score.pts, pct:score.pct, live:score.live, n:score.n, place:row.place, of:ranking.length,
      ...(last ? { c:last.c, q:last.q, ...(last.d === undefined ? {} : { d:last.d }) } : {}) };
  }
  if (cup.phase === "lastcall" && cup.bar?.judged?.[i]) {
    const own = lastCallOf(cup.bar, now).totals.find(item => item.i === i);
    const last = cup.bar.last[i];
    const standing = cup.standings.find(item => item.i === i);
    return { ...base, ...(cup.out.includes(i) ? { out:true } : {}), place:standing?.place ?? null, of:cup.standings.length,
      lastCall:{ ms:own.ms, d:own.d }, ...(last ? { c:last.c, q:last.q, ...(last.d === undefined ? {} : { d:last.d }) } : {}) };
  }
  const row = cup.phase === "cut" || cup.phase === "chugoff" ? cup.results.find(item => item.i === i) : null;
  if (row) {
    const open = cup.bubble?.includes(i) || (cup.chugoff?.winner === null && (i === cup.chugoff.a || i === cup.chugoff.b));
    return { ...base, pts:row.pts, pct:row.pct, live:row.pct, place:row.place, of:cup.results.length,
      through:open ? null : !row.out, out:row.out === true, ...(row.bubble ? { bubble:true } : {}),
      feedback:cup.feedback?.[i] ?? { grade:row.grade, line:"" } };
  }
  const standing = cup.standings.find(item => item.i === i);
  const place = standing?.place ?? null;
  if (cup.out.includes(i)) return { ...base, out:true, place, of:cup.standings.length };
  return { ...base, place, of:cup.phase === "intro" ? cup.field.length : cup.standings.length };
}
