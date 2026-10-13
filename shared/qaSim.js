/* QA's simulated room ("Sim players", state.qaSim): every present roster
   player but the commissioner's own (unless "Include me") plays on a human
   clock, through the ordinary player writes a phone sends, so the TV and
   every phone see exactly what a real room produces.

   Pure. The planner reads the state and says what each simulated player
   does next and when: { at, type, payload, player, key }. Every decision
   is a seeded hash of (seed, game, question or contest, player, field),
   never Math.random, so a recompute plans the same moves at the same
   instants, and each move has a stable key (its action id, so a retried
   move is acknowledged once). A move already made reads as made in the
   state and is never planned again. The Durable Object applies due moves
   on its alarm beside the autopilot (worker/tournament.js).

   SIM_PLANNERS is the per-game table: each entry plans one game's moves.
   A game added later (Karaoke) adds its planner there. */
import {
  PT, allEventsOf, atRisk, awardTable, computeStandings, contestBetEligibility, contestSideOf, draftTurn, duelReserve,
  isAbsent, isActivePlayer, maxRisk, playerStrength, rosterOf, resolveCurrentContest, resolveEventLifecycle,
  validateEventParticipants, wagerMatchesContest,
} from "./core.js";
import { cleanWhen, geoCurrentId, geoPlayers } from "./geo.js";
import { resolveDirector } from "./show.js";
import { triviaCurrent, triviaGame } from "./trivia.js";
import {
  KARAOKE_TIERS, hasKaraokeSong, karaokeLive, karaokeSinger, karaokeTurn, karaokeVoters,
} from "./karaoke.js";
import {
  BUZZ_EARLY_MS, DD_MIN, DD_STING_MS, FINAL_INTRO_MS, WAGER_STEP, answeredOn, boardActive, boardClue, boardLog,
  boardPlayers, boardRace, boardScore, boardStandings, boardTopValue, buzzCloseAt, cellsLeft, ddMax, finalMax,
  isBoardGame, struckChoices, turnPlayer, turnUntil,
} from "./triviaBoard.js";

/* ── the human clock and the room's habits ── */
export const SIM_TRIVIA = Object.freeze({
  /* an answer lands between 1.5 s in and 90% of the window */
  firstFrac:0.075, lastFrac:0.9,
  change:0.15, neverLock:0.10,
  /* right this often, by skill */
  skill:[0.35, 0.85],
});
export const SIM_BOARD = Object.freeze({
  pickMs:[2000, 6000],
  reactionMs:[220, 900],
  latencyMs:[30, 140],
  /* who buzzes: most of the room on the first race, fewer on a rebound */
  buzz:[0.45, 0.8], reboundBuzz:[0.3, 0.6],
  answerMs:[1500, 5000],
  ddAnswerMs:[2000, 7000],
  ddWagerMs:[2000, 7000],
  finalWagerMs:[2000, 16000],
  finalPickMs:[4000, 24000],
});
export const SIM_GEO = Object.freeze({
  pinMs:[4000, 24000], whenMs:[3000, 12000], lockMs:[1500, 6000],
  lock:0.85,
  /* the last save leaves a beat before the clock runs out */
  edgeMs:1500,
});
export const SIM_BETS = Object.freeze({
  share:0.6, twice:0.3,
  firstMs:[3000, 25000], againMs:[2000, 8000],
});
/* How a room of 13 bets a pool (Oct 13), for Sim players and QA's bets
   and fast-forward alike: most back the favorite by the standings (the
   side with the most chips a player, the one the bank seeds heaviest),
   the rest a long shot, one chip off the rack, the bigger chips rarer.
   A wide free-for-all spreads wider. So a pool comes out lopsided, and
   now and then a 3x long shot wins. */
export const ROOM_BETS = Object.freeze({
  rack:Object.freeze([PT, 2 * PT, 5 * PT, 10 * PT]),
  /* each rack chip's share, as a running total */
  rackOdds:Object.freeze([0.4, 0.75, 0.93, 1]),
  favorite:0.7,
  favoriteWide:0.35,
});
/* the side with the most chips a player, by the standings; null when the
   top is shared (a level board has no favorite) */
export function roomFavorite(contest, rows) {
  const pts = new Map(rows.map(row => [row.player, row.pts]));
  let best = null, shared = false;
  for (const side of contest?.sides || []) {
    const counted = side.players.filter(player => pts.has(player));
    const avg = counted.length ? counted.reduce((sum, player) => sum + pts.get(player), 0) / counted.length : 0;
    if (best && avg === best.avg) shared = true;
    else if (!best || avg > best.avg) { best = { key:side.key, avg }; shared = false; }
  }
  return best && !shared ? best.key : null;
}
/* One bettor's chip: `open` the sides they may back, `room` what they may
   still put at risk, u* three uniforms in [0, 1) (a seeded hash or the
   QA run's generator). Null when there is no room for a chip. */
export function roomBet(contest, open, favoriteKey, room, { side:uSide, pick:uPick, stake:uStake }) {
  if (!open.length || room < PT) return null;
  const favorite = open.find(item => item.key === favoriteKey) || null;
  const others = open.filter(item => item !== favorite);
  const lean = contest.sides.length > 2 ? ROOM_BETS.favoriteWide : ROOM_BETS.favorite;
  const side = favorite && (!others.length || uSide < lean) ? favorite
    : others[Math.min(others.length - 1, Math.floor(uPick * others.length))];
  const chip = ROOM_BETS.rack[ROOM_BETS.rackOdds.findIndex(edge => uStake < edge)] ?? PT;
  const stake = Math.min(Math.floor(room / PT) * PT, chip);
  return stake >= PT ? { side, stake } : null;
}
export const SIM_DRAFT = Object.freeze({ pickMs:[3000, 8000] });
/* writes the Durable Object applies per alarm before it re-arms */
export const SIM_WRITES_PER_ALARM = 32;

/* ── the seeded hash: [0, 1) from any parts ── */
export function simHash(...parts) {
  const text = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const between = ([low, high], u) => low + (high - low) * u;
const num = value => Number(value) || 0;

/* the sim's own state, when it is on */
export const qaSimOf = state => state?.qaSim?.on === true ? state.qaSim : null;

/* Who acts: every present roster player, never the commissioner's own
   player unless "Include me" is on. Absent players never act. */
export function simPlayers(state) {
  const sim = qaSimOf(state);
  if (!sim) return [];
  return rosterOf(state).filter(player => isActivePlayer(player, state) && !isAbsent(state, player)
    && (sim.includeMe || player !== sim.me));
}

/* a player's knack for a game, fixed for the seed: 0 to 1 */
const knack = (sim, game, player) => simHash(sim.seed, "knack", game, player);
const skillOf = (sim, game, player, [low, high] = SIM_TRIVIA.skill) => low + (high - low) * knack(sim, game, player);
/* a window's start, never before the sim was switched on, so turning it on
   mid-question spreads the room over what is left instead of firing at once */
const startOf = (sim, at) => Math.max(num(at), num(sim.at));

/* ── Trivia, the rounds format ── */
function planTrivia(state, sim, players) {
  const game = triviaGame(state);
  if (!game || game.finishedAt || state.results?.[game.eventId] || game.phase !== "question") return [];
  const question = triviaCurrent(game);
  if (!question) return [];
  const time = game.times?.[question.id] || {};
  const opens = startOf(sim, time.startsAt), closes = num(time.closesAt);
  const window = Math.max(0, closes - opens);
  if (!closes || window < 1000) return [];
  const picks = game.picks?.[question.id] || {};
  const number = question.format === "number";
  const moves = [];
  for (const player of players) {
    const prior = picks[player] || null;
    if (prior?.locked) continue;
    const h = field => simHash(sim.seed, game.id, question.id, player, field);
    const skill = skillOf(sim, "trivia", player);
    const willLock = h("lock") >= SIM_TRIVIA.neverLock;
    const changes = h("change") < SIM_TRIVIA.change;
    /* faster with skill: a steeper curve toward the window's start */
    const frac = SIM_TRIVIA.firstFrac + (SIM_TRIVIA.lastFrac - SIM_TRIVIA.firstFrac)
      * Math.pow(h("when"), 0.8 + 1.6 * skill);
    const first = Math.min(closes - 800, opens + window * frac);
    const second = Math.min(closes - 400, first + between([1500, 5000], h("again")));
    let final, opening;
    if (number) {
      const most = 10 ** Math.max(1, num(question.digits) || 4) - 1;
      const answer = num(question.answer);
      const guess = (salt, spread) => {
        if (h(`exact${salt}`) < skill * 0.12) return answer;
        const tri = h(`e1${salt}`) + h(`e2${salt}`) - 1;
        const off = answer * (1 - skill) * spread * tri + (answer < 20 ? Math.round(tri * 3) : 0);
        return Math.max(0, Math.min(most, Math.round(answer + off)));
      };
      final = guess("", 0.9);
      opening = guess("first", 1.4);
      if (opening === final) opening = Math.max(0, Math.min(most, final + (final > 0 ? -1 : 1)));
    } else {
      const answer = num(question.answer);
      final = h("right") < skill ? answer : (answer + 1 + Math.floor(h("wrong") * 3)) % 4;
      /* the first thought: any other option */
      opening = (final + 1 + Math.floor(h("first") * 3)) % 4;
    }
    const field = number ? "value" : "choice";
    const pick = (at, value, lock, step) => ({ at:Math.round(at), type:"triviaPick", player,
      payload:{ questionId:question.id, [field]:value, ...(lock ? { lock:true } : {}) },
      key:`sim:${game.id}:${question.id}:${player}:${step}` });
    if (!prior) {
      moves.push(changes ? pick(first, opening, false, "a") : pick(first, final, willLock, "a"));
      continue;
    }
    if (changes && prior[field] !== final) moves.push(pick(second, final, willLock, "b"));
    else if (willLock) moves.push({ ...pick(Math.max(first, second), prior[field], true, "lock"),
      payload:{ questionId:question.id, lock:true } });
  }
  return moves;
}

/* ── Trivia, the board ── */
/* who holds the board: worker/triviaBoard.js pickerOf, read the same way */
function boardPicker(state, game) {
  const here = boardPlayers(game).filter(player => !isAbsent(state, player));
  if (here.includes(game?.control)) return game.control;
  return boardStandings(game).find(row => here.includes(row.player))?.player || null;
}
function planBoard(state, sim, players) {
  const game = state?.trivia;
  if (!isBoardGame(game) || game.finishedAt || state.results?.[game.eventId]) return [];
  const sims = new Set(players);
  const id = game.current;
  const log = boardLog(game);
  const key = (...parts) => ["sim", game.id, ...parts].join(":");
  const h = (...parts) => simHash(sim.seed, game.id, ...parts);
  const skill = player => skillOf(sim, "trivia", player);
  const moves = [];
  switch (game.phase) {
    case "pick": {
      const picker = boardPicker(state, game);
      const cells = cellsLeft(game);
      if (!picker || !sims.has(picker) || !cells.length) break;
      const turn = (game.played || []).length;
      /* down the same column most of the time, the way a room plays */
      const lastCol = boardClue(game, (game.played || []).at(-1))?.col;
      const same = cells.filter(cell => game.clues?.[cell]?.col === lastCol);
      const pool = same.length && h(turn, "stay") < 0.6 ? same : cells;
      const clueId = pool[Math.floor(h(turn, "cell") * pool.length)];
      moves.push({ at:Math.round(startOf(sim, game.pickAt) + between(SIM_BOARD.pickMs, h(turn, "pickMs"))),
        type:"boardPick", payload:{ clueId }, player:picker, key:key("pick", turn) });
      break;
    }
    case "clue": {
      if (!log) break;
      const race = boardRace(log);
      const answered = answeredOn(log);
      const closes = buzzCloseAt(log);
      const arm = num(log.armAt);
      const share = race ? SIM_BOARD.reboundBuzz : SIM_BOARD.buzz;
      for (const player of players) {
        if (answered.has(player) || log.buzzes?.[player]) continue;
        const s = knack(sim, "trivia", player);
        if (h(id, race, player, "buzz") >= between(share, s)) continue;
        const reaction = Math.round(between(SIM_BOARD.reactionMs, Math.pow(h(id, race, player, "ms"), 1 + 1.5 * s)));
        const at = Math.max(startOf(sim, arm) + reaction + between(SIM_BOARD.latencyMs, h(id, race, player, "net")),
          arm - BUZZ_EARLY_MS);
        /* the buzzers close a beat after the first buzz: a slower hand is out */
        if (at > closes) continue;
        moves.push({ at:Math.round(at), type:"boardBuzz", payload:{ clueId:id, ms:reaction, race }, player,
          key:key(id, "buzz", race, player) });
      }
      break;
    }
    case "answer":
    case "dd-clue": {
      const player = turnPlayer(log);
      if (!player || !sims.has(player) || !log?.turnAt) break;
      const clue = boardClue(game);
      const n = (log.attempts || []).length;
      const daily = game.phase === "dd-clue";
      const at = Math.min(turnUntil(game) - 300,
        startOf(sim, log.turnAt) + between(daily ? SIM_BOARD.ddAnswerMs : SIM_BOARD.answerMs, h(id, n, player, "answerMs")));
      const struck = struckChoices(log);
      const open = [0, 1, 2, 3].filter(choice => choice !== clue.answer && !struck.has(choice));
      /* the deeper the row, the likelier a miss (and the rebound after it) */
      const odds = Math.max(0.15, Math.min(0.92, skill(player) + 0.15 - 0.1 * num(clue.row)));
      const right = h(id, n, player, "right") < odds || !open.length;
      const choice = right ? clue.answer : open[Math.floor(h(id, n, player, "wrong") * open.length)];
      moves.push({ at:Math.round(at), type:"boardAnswer", payload:{ clueId:id, choice }, player,
        key:key(id, "answer", n, player) });
      break;
    }
    case "dd-wager": {
      if (!log?.by || !sims.has(log.by) || log.wager !== undefined) break;
      const max = ddMax(boardScore(game, log.by), boardTopValue(game));
      const steps = Math.floor((max - DD_MIN) / WAGER_STEP);
      const wager = DD_MIN + WAGER_STEP * Math.round(steps * Math.pow(h(id, "ddWager"), 0.8));
      moves.push({ at:Math.round(startOf(sim, num(log.pickedAt) + DD_STING_MS) + between(SIM_BOARD.ddWagerMs, h(id, "ddMs"))),
        type:"boardWager", payload:{ wager }, player:log.by, key:key(id, "dd") });
      break;
    }
    case "final-wager": {
      const t = game.finalAt || {};
      const until = num(t.wagerUntil);
      const top = boardTopValue(game);
      const rows = new Map(boardStandings(game).map(row => [row.player, row.preFinal]));
      for (const player of players) {
        if (game.finalWagers?.[player]) continue;
        const max = finalMax(rows.get(player) ?? 0, top);
        /* the leaders guard their lead; the room behind goes big */
        const bold = h("final", player, "bold");
        const wager = WAGER_STEP * Math.floor((max / WAGER_STEP) * Math.min(1, bold * (0.5 + h("final", player, "nerve"))));
        const at = Math.min(until - 500, startOf(sim, num(t.introAt) + FINAL_INTRO_MS)
          + between(SIM_BOARD.finalWagerMs, h("final", player, "wagerMs")));
        moves.push({ at:Math.round(at), type:"boardWager", payload:{ wager }, player, key:key("final", "wager", player) });
      }
      break;
    }
    case "final-clue": {
      const t = game.finalAt || {};
      const answer = num(game.final?.answer);
      for (const player of players) {
        if (game.finalPicks?.[player]?.locked) continue;
        const right = h("final", player, "right") < skill(player);
        const choice = right ? answer : (answer + 1 + Math.floor(h("final", player, "wrong") * 3)) % 4;
        const at = Math.min(num(t.answerUntil) - 500, startOf(sim, t.clueAt) + between(SIM_BOARD.finalPickMs, h("final", player, "pickMs")));
        moves.push({ at:Math.round(at), type:"boardFinalPick", payload:{ choice, lock:true }, player,
          key:key("final", "pick", player) });
      }
      break;
    }
    default: break;
  }
  return moves;
}

/* ── Where and When ── */
const EARTH_MI = 3958.8;
/* the point `miles` from the answer on a bearing */
function offsetPoint(lat, lng, miles, bearing) {
  const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  const d = miles / EARTH_MI, b = rad(bearing), p1 = rad(lat), l1 = rad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  const lngOut = ((deg(l2) + 540) % 360) - 180;
  return { lat:Math.round(Math.max(-85, Math.min(85, deg(p2))) * 1e5) / 1e5, lng:Math.round(lngOut * 1e5) / 1e5 };
}
const WHEN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;
const pad = n => String(n).padStart(2, "0");
/* a wall clock `hours` off the answer, kept inside the wheels' years */
function offsetWhen(when, hours) {
  const match = WHEN.exec(when || "");
  if (!match) return null;
  const [, y, m, d, hh] = match.map(Number);
  const shift = sign => {
    const date = new Date(Date.UTC(y, m - 1, d, hh) + sign * hours * 3_600_000);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}`;
  };
  return [shift(1), shift(-1), when].find(value => cleanWhen(value)) || null;
}
/* a guess shaped by skill: some pins within 20 miles, some hundreds, some
   across the country; dates from days to years off */
export function geoSimGuess(sim, round, player, salt = "") {
  const h = field => simHash(sim.seed, "geo", round.id, player, field, salt);
  const skill = knack(sim, "geo", player);
  const near = 0.15 + 0.45 * skill, far = 0.35 * (1 - skill);
  const u = h("class");
  const miles = u < near ? between([0.5, 20], h("mi"))
    : u > 1 - far ? between([400, 2500], h("mi"))
      : Math.exp(between([Math.log(20), Math.log(400)], h("mi")));
  const pin = offsetPoint(round.lat, round.lng, miles, 360 * h("bearing"));
  const hours = Math.round((((1 - skill) * 3 + 0.1) * 8760) * Math.pow(h("hours"), 3)) + Math.floor(h("hour") * 12);
  const when = offsetWhen(round.when, h("sign") < 0.5 ? hours : -hours);
  return { ...pin, when, miles };
}
function planGeo(state, sim, players) {
  const geo = state?.geo;
  if (!geo?.order || geo.finishedAt || geo.phase !== "guess" || state.results?.[geo.eventId]) return [];
  const roundId = geoCurrentId(geo);
  const round = (state.geoRounds || []).find(item => item.id === roundId);
  if (!round) return [];
  const playing = new Set(geoPlayers(state, rosterOf(state),
    { isActivePlayer:id => isActivePlayer(id, state), isAway:isAbsent }));
  const closes = num(geo.closesAt);
  const last = closes - SIM_GEO.edgeMs;
  const opens = startOf(sim, geo.startedAt);
  if (last - opens < 2000) return [];
  const moves = [];
  for (const player of players) {
    if (!playing.has(player)) continue;
    const prior = geo.guesses?.[roundId]?.[player] || null;
    if (prior?.done) continue;
    const h = field => simHash(sim.seed, "geo", geo.startedAt, roundId, player, field);
    const skill = knack(sim, "geo", player);
    const span = (last - opens) / 60000;
    const pinAt = Math.min(last - 2000, opens + between(SIM_GEO.pinMs, Math.pow(h("pinMs"), 0.7 + skill)) * Math.min(1, span));
    const whenAt = Math.min(last - 1000, pinAt + between(SIM_GEO.whenMs, h("whenMs")) * Math.min(1, span));
    const lockAt = Math.min(last, whenAt + between(SIM_GEO.lockMs, h("lockMs")));
    const guess = geoSimGuess(sim, round, player);
    const key = step => `sim:geo:${geo.eventId}:${geo.startedAt}:${roundId}:${player}:${step}`;
    const move = (at, payload, step) => ({ at:Math.round(at), type:"geoGuess", player, payload:{ roundId, ...payload }, key:key(step) });
    const pin = prior && Number.isFinite(prior.lat) ? { lat:prior.lat, lng:prior.lng } : { lat:guess.lat, lng:guess.lng };
    if (!prior) { moves.push(move(pinAt, pin, "pin")); continue; }
    if (!prior.when && guess.when) { moves.push(move(whenAt, { ...pin, when:guess.when }, "when")); continue; }
    if (h("lock") < SIM_GEO.lock)
      moves.push(move(lockAt, { ...pin, ...(prior.when ? { when:prior.when } : {}), done:true }, "lock"));
  }
  return moves;
}

/* ── bets on the contest taking them ── */
/* the wager a phone sends for a side (worker/qa.js wagerFor) */
export function simWager(ev, contest, side, stake) {
  const wager = { eventId:ev.id, evName:ev.name, contestId:contest.id, contestRevision:contest.revision,
    pickPlayers:[...side.players], pickTeam:!!contest.drawId, drawId:contest.drawId, stake };
  if (contest.kind === "ffa") return Object.assign(wager, { kind:"outright", pick:side.key });
  if (contest.kind === "match") return Object.assign(wager, { kind:"match", match:[...contest.match],
    matchName:contest.label, teamIdx:side.key });
  return Object.assign(wager, { kind:contest.kind === "heat" ? "heat" : "stage", stagesId:contest.stagesId,
    group:contest.group, groupName:contest.label, final:contest.kind === "stage-final", pickKey:side.key });
}
function planBets(state, sim, players, now) {
  if (!state?.onDeck || state.frozen) return [];
  const events = allEventsOf(state);
  const ev = events.find(item => item.id === state.onDeck);
  if (!ev || state.results?.[ev.id]) return [];
  const contest = resolveCurrentContest(state, ev);
  if (contest?.phase !== "betting-open") return [];
  const opened = startOf(sim, state.eventOps?.[ev.id]?.bettingOpenedAt);
  let rows = null, favorite;
  const moves = [];
  for (const player of players) {
    const h = field => simHash(sim.seed, "bet", ev.id, contest.id, contest.revision, player, field);
    if (h("bets") >= SIM_BETS.share) continue;
    const want = h("twice") < SIM_BETS.twice ? 2 : 1;
    const placed = (state.wagers || []).filter(wager => wager.player === player && wager.status !== "void"
      && wagerMatchesContest(wager, contest))
      .reduce((sum, wager) => sum + (Array.isArray(wager.chips) ? wager.chips.length : 1), 0);
    if (placed >= want) continue;
    rows = rows || computeStandings(state);
    const pts = rows.find(row => row.player === player)?.pts ?? 0;
    const exposure = atRisk(state, player, events) + duelReserve(state, player, now);
    const room = Math.min(maxRisk(pts) - exposure, pts - exposure);
    if (room < PT) continue;
    const held = contestSideOf(state, contest, player, events);
    const open = contest.sides.filter(side => contestBetEligibility(contest, player, side.key)
      && (held === null || held === side.key));
    if (!open.length) continue;
    if (favorite === undefined) favorite = roomFavorite(contest, rows);
    const chip = roomBet(contest, open, favorite, room, { side:simHash(sim.seed, "bet", contest.id, player, "side"),
      pick:simHash(sim.seed, "bet", contest.id, player, "pick"), stake:h(`stake${placed}`) });
    if (!chip) continue;
    const { side, stake } = chip;
    const first = opened + between(SIM_BETS.firstMs, h("firstMs"));
    const at = placed ? first + between(SIM_BETS.againMs, h("againMs")) : first;
    moves.push({ at:Math.round(at), type:"placeWager", player, payload:{ wager:simWager(ev, contest, side, stake) },
      key:`sim:bet:${ev.id}:${contest.id}:${contest.revision}:${player}:${placed}` });
  }
  return moves;
}

/* ── a captains draft: the captain on the clock picks ── */
function planDraft(state, sim, players) {
  const sims = new Set(players);
  const moves = [];
  for (const [evId, draft] of Object.entries(state?.drafts || {})) {
    if (!draft || state.draws?.[evId]) continue;
    const turn = draftTurn(draft);
    if (!turn || turn.complete || !sims.has(turn.captain) || !draft.pool?.length) continue;
    const ev = allEventsOf(state).find(item => item.id === evId);
    if (!ev) continue;
    const rows = computeStandings(state);
    /* the best player left, by the board's own strength, with a captain's taste */
    const player = draft.pool.map(p => ({ p, score:playerStrength(state, p, ev.sport, rows)
      * (0.75 + 0.5 * simHash(sim.seed, draft.id, turn.pickIndex, p, "taste")) }))
      .sort((a, b) => b.score - a.score || a.p.localeCompare(b.p))[0].p;
    const since = startOf(sim, draft.turnAt || draft.ts);
    moves.push({ at:Math.round(since + between(SIM_DRAFT.pickMs, simHash(sim.seed, draft.id, turn.pickIndex, "ms"))),
      type:"pickDraftPlayer", player:turn.captain,
      payload:{ evId, draftId:turn.draftId, pickIndex:turn.pickIndex, draftRevision:turn.draftRevision, player },
      key:`sim:draft:${draft.id}:${turn.pickIndex}:${turn.draftRevision}` });
  }
  return moves;
}

/* ── Karaoke (docs/KARAOKE.md): the pick window and the room's votes ──
   In the window a simulated player with a profile song keeps it
   (karaokeReady); one without takes a practice song in the game only
   (karaokeSimSong, its roster place choosing the song, never a profile). Over each song, every simulated voter
   votes Build Battle's way, while they watch: most during the song, some
   in the grace after it, a few changing their mind once. A singer's
   knack sets where the room's tiers sit, so the night has a winner and
   now and then a Legendary rain. */
export const SIM_KARAOKE = Object.freeze({
  pickMs:[4000, 40000],
  /* when a vote lands, as a share of the song; past 1 it is in the grace */
  voteFrac:[0.3, 1],
  graceMs:[1000, 12000], grace:0.2,
  change:0.15, changeMs:[4000, 20000],
  /* a vote lands at least this long before the vote closes */
  edgeMs:1500,
});
/* a voter's tier for a singer: the singer's knack, a voter's taste around it */
export function karaokeSimTier(sim, singer, voter, salt = "") {
  const quality = knack(sim, "karaoke", singer);
  const noise = simHash(sim.seed, "karaoke", singer, voter, "n1", salt) + simHash(sim.seed, "karaoke", singer, voter, "n2", salt) - 1;
  return Math.max(1, Math.min(KARAOKE_TIERS.length, Math.round(1 + 5.4 * quality + 1.8 * noise)));
}
function planKaraoke(state, sim, players) {
  const game = state?.karaoke;
  if (!game?.id || !karaokeLive(state) || game.empty) return [];
  const moves = [];
  if (game.phase === "pick") {
    const opens = startOf(sim, game.startedAt);
    const last = num(game.pickUntil) - SIM_KARAOKE.edgeMs;
    for (const player of players) {
      if (game.ready?.[player]) continue;
      const h = field => simHash(sim.seed, "karaoke", game.id, player, field);
      const at = Math.min(last, opens + between(SIM_KARAOKE.pickMs, h("pick")));
      const keep = hasKaraokeSong(state, player) && game.broken?.[player] === undefined;
      moves.push(keep
        ? { at:Math.round(at), type:"karaokeReady", player, payload:{ gameId:game.id }, key:`sim:karaoke:${game.id}:${player}:pick` }
        : { at:Math.round(at), type:"karaokeSimSong", player,
          payload:{ gameId:game.id, k:Math.max(0, rosterOf(state).indexOf(player)) },
          key:`sim:karaoke:${game.id}:${player}:pick` });
    }
    return moves;
  }
  if (game.phase !== "turns") return [];
  const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
  if (!singer || !turn || turn.closedAt || turn.skipped || !Number.isFinite(turn.songAt)) return [];
  const songAt = startOf(sim, turn.songAt), endAt = num(turn.endAt), closeAt = num(turn.closeAt);
  const last = closeAt - SIM_KARAOKE.edgeMs;
  if (last <= songAt) return [];
  const voters = new Set(karaokeVoters(state, singer));
  for (const voter of players) {
    if (!voters.has(voter)) continue;
    const prior = game.votes?.[singer]?.[voter] || null;
    const h = field => simHash(sim.seed, "karaoke", game.id, singer, voter, field);
    const tier = karaokeSimTier(sim, singer, voter);
    const changes = h("change") < SIM_KARAOKE.change;
    const len = Math.max(0, endAt - songAt);
    const first = Math.min(last, h("grace") < SIM_KARAOKE.grace ? Math.max(songAt, endAt) + between(SIM_KARAOKE.graceMs, h("graceMs"))
      : songAt + len * between(SIM_KARAOKE.voteFrac, h("when")));
    const vote = (at, value, step) => ({ at:Math.round(at), type:"karaokeVote", player:voter,
      payload:{ gameId:game.id, index:game.index, singer, tier:value }, key:`sim:karaoke:${game.id}:${singer}:${voter}:${step}` });
    if (!prior) {
      /* a change of mind starts a tier off */
      const down = tier === KARAOKE_TIERS.length || (tier > 1 && h("way") < 0.5);
      moves.push(vote(first, changes ? tier + (down ? -1 : 1) : tier, "a"));
    } else if (changes && Number(prior.tier) !== tier) {
      moves.push(vote(Math.min(last, Math.max(first, num(prior.at)) + between(SIM_KARAOKE.changeMs, h("changeMs"))), tier, "b"));
    }
  }
  return moves;
}

/* ── Run the night: the commissioner's beats on a human clock ──
   With qaSim.night on, the director pill's own beats (resolveDirector, the
   lifecycle without Show Control's scene steps, which the autopilot runs)
   are taken as the pill's writes: announce a little after the last result
   settles, lock after a betting window, record a played contest's winner
   after a play time, post a free-for-all's finish, start a captains draft
   with default captains and confirm it once picked. In-app games play on
   the autopilot. It stops before the poker finale and never crowns. A
   commissioner move carries `gm:true`. */
export const SIM_NIGHT = Object.freeze({
  /* the winner scene and the song have the room first */
  announceMs:[30000, 45000],
  bettingMs:[35000, 50000],
  playMs:[45000, 90000],
  entryMs:[3000, 6000],
  draftStartMs:[4000, 8000],
  confirmMs:[3000, 6000],
  /* a captain who is not simulated (you) gets this long before the
     commissioner picks for them */
  stallMs:15000,
});
const NIGHT_BEATS = new Set(["announce", "announce-draw", "captains-draft", "continue-draft", "lock-start",
  "record-contest-winner", "enter-result", "post-result"]);
const latestResultAt = state => Math.max(0, ...Object.values(state.results || {}).map(result => num(result?.ts)));
/* who wins: a coin weighted a little toward the stronger side */
function nightOrder(state, sim, ev, sides, salt) {
  const rows = computeStandings(state);
  const strength = side => side.players.reduce((sum, p) => sum + playerStrength(state, p, ev.sport, rows), 0)
    / Math.max(1, side.players.length);
  return [...sides].map(side => ({ side, score:simHash(sim.seed, "night", ev.id, salt, side.key ?? side.players.join("+"))
    + 0.05 * strength(side) })).sort((a, b) => b.score - a.score).map(item => item.side);
}
function nightPodium(state, sim, ev, sides, salt) {
  const table = awardTable(ev);
  const order = nightOrder(state, sim, ev, sides, salt);
  return [0, 1, 2].map(i => i === 0 || table[i] > 0 ? [...(order[i]?.players || [])] : []);
}
function planNight(state, sim, players) {
  if (!sim.night || state.frozen) return [];
  const events = allEventsOf(state);
  const director = resolveDirector(state, events, { showControl:false });
  const beat = director?.nextAction;
  const ev = director?.event || null;
  if (!beat || !ev || ev.finale || !NIGHT_BEATS.has(beat.type) || beat.enabled === false) return [];
  const contest = resolveCurrentContest(state, ev);
  const op = state.eventOps?.[ev.id] || {};
  const reference = contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
  const h = (...parts) => simHash(sim.seed, "night", ev.id, ...parts);
  const move = (at, type, payload, step) => ({ at:Math.round(at), type, payload, gm:true, player:null,
    key:`sim:night:${ev.id}:${step}` });
  const since = at => startOf(sim, at);
  const sims = new Set(players);
  switch (beat.type) {
    case "announce":
      return [move(since(latestResultAt(state)) + between(SIM_NIGHT.announceMs, h("announce")), "announceEvent",
        { evId:ev.id, ...reference, startWeekend:true }, "announce")];
    case "announce-draw":
      return [move(since(latestResultAt(state)) + between(SIM_NIGHT.announceMs, h("announce")), "announceAndDraw",
        { evId:ev.id, ...(beat.players ? { players:[...beat.players], roles:(beat.roles || []).map(item => ({ ...item })) } : {}),
          startWeekend:true }, "announce")];
    case "captains-draft": {
      const pool = beat.players || [];
      const fit = validateEventParticipants(ev, pool, rosterOf(state).filter(p => !isAbsent(state, p))).fit || ev.teamCfg;
      const rows = computeStandings(state);
      /* the strongest of the room captain, simulated players first */
      const captains = [...pool].sort((a, b) => (sims.has(b) - sims.has(a))
        || playerStrength(state, b, ev.sport, rows) - playerStrength(state, a, ev.sport, rows) || a.localeCompare(b))
        .slice(0, fit?.teams || 2);
      return [move(since(latestResultAt(state)) + between(SIM_NIGHT.draftStartMs, h("draft")), "startDraft",
        { evId:ev.id, captains, players:[...pool], roles:(beat.roles || []).map(item => ({ ...item })) }, "draft")];
    }
    case "continue-draft": {
      const draft = state.drafts?.[ev.id];
      const turn = draftTurn(draft);
      if (!turn) return [];
      const ref = { evId:ev.id, draftId:turn.draftId, pickIndex:turn.pickIndex, draftRevision:turn.draftRevision };
      if (turn.complete)
        return [move(since(draft.turnAt || draft.ts) + between(SIM_NIGHT.confirmMs, h("confirm")), "finalizeDraft", ref, "confirm")];
      if (sims.has(turn.captain)) return [];
      return [move(since(draft.turnAt || draft.ts) + SIM_NIGHT.stallMs, "pickDraftPlayer",
        { ...ref, player:draft.pool[Math.floor(h("stall", turn.pickIndex) * draft.pool.length)] }, `stall:${turn.pickIndex}`)];
    }
    case "lock-start": {
      if (!contest) return [];
      const opened = contest.phase === "betting-open" ? num(op.bettingOpenedAt) : num(op.bettingLockedAt);
      const wait = contest.phase === "betting-open" ? between(SIM_NIGHT.bettingMs, h("lock", contest.id, contest.revision)) : 3000;
      return [move(since(opened) + wait, "lockAndStart", { evId:ev.id, ...reference, startWeekend:true },
        `lock:${contest.id}:${contest.revision}`)];
    }
    case "record-contest-winner":
    case "enter-result":
    case "post-result": {
      const started = since(Math.max(num(op.bettingLockedAt), num(op.startedAt)));
      const play = between(SIM_NIGHT.playMs, h("play", contest?.id, contest?.revision));
      if (contest && contest.kind !== "ffa" && contest.phase === "in-progress") {
        const keys = nightOrder(state, sim, ev, contest.sides, `${contest.id}:${contest.revision}`).map(side => side.key);
        const advance = contest.kind === "heat" ? Math.max(1, num(state.stages?.[ev.id]?.advance)) : 1;
        const rounds = state.brackets?.[ev.id]?.rounds || [];
        const final = contest.kind === "stage-final" || contest.kind === "match" && contest.match?.[0] === rounds.length - 1;
        return [move(started + play, "recordContestWinner", { evId:ev.id, ...reference, winner:keys[0],
          qualifiers:keys.slice(0, advance), ...(contest.kind === "stage-final" ? { order:keys } : {}),
          ...(final ? { postResult:true } : {}) }, `winner:${contest.id}:${contest.revision}`)];
      }
      /* a free-for-all played off the app: the scorecard, then its finish */
      const lifecycle = resolveEventLifecycle(state, ev);
      if (lifecycle.phase === "in-progress")
        return [move(started + play, "beginResultEntry", { evId:ev.id }, "entry")];
      const sides = contest?.sides?.length ? contest.sides
        : (state.draws?.[ev.id]?.teams || rosterOf(state).filter(p => !isAbsent(state, p)).map(p => ({ players:[p] })));
      return [move(since(op.resultEntryAt || started) + between(SIM_NIGHT.entryMs, h("entry")), "saveResult",
        { evId:ev.id, slots:nightPodium(state, sim, ev, sides, "result") }, "result")];
    }
    default: return [];
  }
}

/* One planner per game: (state, sim, players, now) => moves */
export const SIM_PLANNERS = Object.freeze({
  trivia:planTrivia,
  board:planBoard,
  geo:planGeo,
  karaoke:planKaraoke,
  bets:planBets,
  draft:planDraft,
  /* the commissioner's beats, only with "Run the night" */
  night:planNight,
});

/* Every move the room still owes, earliest first (any time). `spent` holds
   keys the server refused or found already made: never planned again. */
export function simMoves(state, now = 0, spent = null) {
  const sim = qaSimOf(state);
  if (!sim) return [];
  const players = simPlayers(state);
  const moves = [];
  for (const plan of Object.values(SIM_PLANNERS)) {
    try { moves.push(...plan(state, sim, players, now)); }
    catch { /* one game's planner never stops the others */ }
  }
  return moves.filter(move => Number.isFinite(move.at) && !spent?.has?.(move.key))
    .sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
/* the moves due now, earliest first */
export const simDue = (state, now, spent = null) => simMoves(state, now, spent).filter(move => move.at <= now);
/* the earliest move still to come, or null */
export const simNext = (state, now, spent = null) => simMoves(state, now, spent).find(move => move.at > now) || null;

/* the context a simulated player's write runs under */
/* the context a simulated write runs under: a player's own phone, or (Run
   the night) the commissioner's */
export const simContext = move => move.gm
  ? { isGm:true, sim:true, player:null, deviceId:"sim:night", actionId:move.key }
  : { isGm:false, sim:true, player:move.player, deviceId:`sim:${move.player}`, actionId:move.key };

