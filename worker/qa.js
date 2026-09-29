/* QA fast-forward. Reaches a target on the weekend's arc in ONE Durable
   Object write by running the real reducers (applyAction) on the working
   copy the action already holds: the same announce, draw, contest sequence,
   placeWager, duel and saveResult paths a commissioner and the guests use,
   with synthetic per-player contexts. Settlement stays derived, and
   awards, contest stacks, eventOps and showControl come out exactly as a
   played weekend leaves them. It never starts a Show Control scene (every
   write runs without showControl and every result posts with noScene), never
   touches Spotify, claims, photos or tokens, and never fills a profile field
   a guest has touched (and none at all in production).

   Deterministic for a seed: Math.random is swapped for a seeded generator
   for the duration of the synchronous run, so draws, heats, bets, winners
   and counts repeat. Ids do not. Date.now is swapped for a clock that
   moves one millisecond per write (a Worker's clock does not move inside a
   synchronous run), so every "latest" and every ordering by time reads the
   way a played weekend does; the run ends well under a second ahead. */
import {
  AWARDS, CHIP_COLORS, CHIP_MIN, CHIP_SKINS, DUEL_DAILY_LIMIT, EMPTY_STATE, PT, RATINGS, ROSTER,
  RESET_PROGRESS_PRESERVED_KEYS, SIZES, SPORTS,
  allEventsOf, atRisk, bracketChampion, computeStandings, contestBetEligibility, contestSideOf,
  contestStackOf, draftTurn, duelBetween, duelReserve, duelRoom, duelsSentToday, maxRisk,
  pokerSetupPreview, presentPlayers, resolveCurrentContest, resolveEventLifecycle, resolveSlot,
  resolveWager, resolveWeekendOperation, stageEntrantView, stageFinalists, wagerMatchesContest,
} from "../shared/core.js";
import { SHOW_HISTORY_LIMIT, championIdentity, finishShowScene } from "../shared/show.js";
import { parseQaTarget, qaEventStage, qaPokerStage, qaSlate } from "../shared/qa.js";

const QA_DEVICE = "qa-sim";
const QA_REQUEST_PREFIX = `request:${QA_DEVICE}:`;
const MAX_STEPS = 4000;

class QaStop extends Error {}

/* mulberry32: small, fast, good enough to make a rehearsal repeatable */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cleanSeed = value => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF ? value : null;

function rehearse(seed, fn) {
  const random = Math.random, now = Date.now;
  let clock = now();
  Math.random = seededRandom(seed);
  Date.now = () => clock;
  try { return fn(() => { clock += 1; }); }
  finally { Math.random = random; Date.now = now; }
}

/* A rewind is a game-progress reset: the same keys survive as
   resetTournament keeps. */
function resetProgress(state) {
  const preserved = Object.fromEntries(RESET_PROGRESS_PRESERVED_KEYS.map(key => [
    key,
    key === "onboardEpoch" ? Number(state[key] || 0) : structuredClone(state[key] ?? EMPTY_STATE[key]),
  ]));
  Object.assign(state, structuredClone(EMPTY_STATE), preserved);
}

/* Whether reaching this target means throwing away progress first: anything
   past it on the arc (a later event touched, the table dealt, a frozen
   board) cannot be played backwards. */
function qaNeedsRewind(state, target, events = allEventsOf(state)) {
  if (target.kind === "step" || target.kind === "finish") return false;
  const poker = qaPokerStage(state);
  if (target.kind === "crowned") return false;
  if (target.kind === "poker") return poker > { set:1, live:2, counted:3 }[target.phase];
  if (poker > 0 || state.frozen) return true;
  const slate = qaSlate(state, events);
  if (target.kind === "locker")
    return !!state.live || slate.some(ev => qaEventStage(state, ev) > 0);
  const index = slate.findIndex(ev => ev.id === target.evId);
  if (slate.slice(index + 1).some(ev => qaEventStage(state, ev) > 0)) return true;
  const stage = qaEventStage(state, slate[index]);
  return target.phase === "open" ? stage >= 2 : target.phase === "mid" ? stage >= 3 : false;
}

/* What a rewind would throw away, for the confirm. */
function qaProgressCost(state) {
  const results = Object.keys(state.results || {}).length;
  const bets = (state.wagers || []).filter(wager => wager.status !== "void").length;
  const duels = (state.duels || []).length;
  return { results, bets, duels, live:!!state.live, poker:!!state.poker };
}

function createRunner(state, baseCtx, tick = () => {}) {
  const events = () => allEventsOf(state);
  const stats = { writes:0, events:0, contests:0, bets:0, duels:0, profiles:0 };
  let seq = 0;
  const gmCtx = { ...baseCtx, isGm:true, player:null, deviceId:null, actionId:null, showControl:false };
  const gm = (type, payload = {}) => {
    if (++seq > MAX_STEPS) throw new QaStop("Too many steps");
    tick();
    const result = baseCtx.applyAction(state, type, { ...payload, startWeekend:true }, gmCtx);
    if (!result.ok) throw new QaStop(`${type}: ${result.error}`);
    if (!result.extra?.unchanged) stats.writes += 1;
    return result;
  };
  /* a guest write that may be refused (a cap, a duel limit): skipped, never fatal */
  const as = (player, type, payload = {}) => {
    if (++seq > MAX_STEPS) throw new QaStop("Too many steps");
    tick();
    const result = baseCtx.applyAction(state, type, payload, { ...baseCtx, isGm:false, player,
      deviceId:`${QA_DEVICE}:${player}`, actionId:`qa-${seq}`, showControl:false });
    if (result.ok && !result.extra?.unchanged) stats.writes += 1;
    return result;
  };
  return { state, events, stats, gm, as, rng:() => Math.random() };
}

const pick = (run, list) => list[Math.floor(run.rng() * list.length)];
const shuffled = (run, list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(run.rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/* Fill a check-in for every roster slot nobody has touched. Once the invite
   is out a half-filled profile is a real guest's answer and a plausible fake
   is worse than a blank, so any touched slot is skipped, and production is
   never filled at all. */
function fillEmptyCheckIns(run, { production }) {
  if (production) return [];
  const { state } = run;
  const filled = [];
  for (const player of ROSTER) {
    const prof = state.profiles?.[player] || {};
    const touched = prof.display || prof.num !== undefined || prof.size || prof.color || prof.skin
      || prof.flightsBooked !== undefined || prof.flightIn || prof.flightOut || prof.photoV || state.seeds?.[player];
    if (touched) continue;
    const taken = new Set(Object.values(state.profiles || {}).map(item => item?.num).filter(n => n !== undefined));
    let num = ROSTER.indexOf(player) + 1;
    while (taken.has(num)) num = (num + 1) % 100;
    run.gm("saveProfile", { player, display:player, num, size:pick(run, SIZES), flightsBooked:false });
    run.gm("saveSeeds", { player, ratings:Object.fromEntries(SPORTS.map(sport => [sport.id, pick(run, RATINGS).v])) });
    const used = new Set(Object.values(state.profiles || {}).map(item => item?.color));
    const open = CHIP_COLORS.filter(color => !used.has(color.hex));
    if (open.length) run.gm("pickChip", { player, color:pick(run, open).hex, skin:pick(run, CHIP_SKINS) });
    filled.push(player);
  }
  run.stats.profiles = filled.length;
  return filled;
}

/* Several players put realistic chips on the current contest: random sides
   they may back, stakes in 100s inside their cap and balance. A refusal
   skips that player. Only a contest nobody has backed yet gets filler. */
function placeFillerBets(run, ev, contest) {
  const { state } = run;
  const list = run.events();
  const backed = (state.wagers || []).some(wager => wagerMatchesContest(wager, contest)
    && resolveWager(state, wager, list).status === "pending");
  if (backed) return 0;
  const rows = computeStandings(state);
  const bettors = shuffled(run, presentPlayers(state)).slice(0, 4 + Math.floor(run.rng() * 4));
  let placed = 0;
  for (const player of bettors) {
    const pts = rows.find(row => row.player === player)?.pts ?? 0;
    const exposure = atRisk(state, player, list) + duelReserve(state, player);
    const room = Math.min(maxRisk(pts) - exposure, pts - exposure);
    if (room < PT) continue;
    const held = contestSideOf(state, contest, player, list);
    const sides = contest.sides.filter(side => contestBetEligibility(contest, player, side.key)
      && (held === null || held === side.key));
    if (!sides.length) continue;
    const side = pick(run, sides);
    const stake = Math.min(Math.floor(room / PT) * PT, pick(run, [PT, PT, 2 * PT, 2 * PT, 3 * PT, 5 * PT]));
    const wager = { eventId:ev.id, evName:ev.name, contestId:contest.id, contestRevision:contest.revision,
      pickPlayers:[...side.players], pickTeam:!!contest.drawId, drawId:contest.drawId, stake };
    if (contest.kind === "ffa") Object.assign(wager, { kind:"outright", pick:side.key });
    else if (contest.kind === "match") Object.assign(wager, { kind:"match", match:[...contest.match],
      matchName:contest.label, teamIdx:side.key });
    else Object.assign(wager, { kind:contest.kind === "heat" ? "heat" : "stage", stagesId:contest.stagesId,
      group:contest.group, groupName:contest.label, final:contest.kind === "stage-final", pickKey:side.key });
    if (run.as(player, "placeWager", { wager }).ok) placed += 1;
  }
  run.stats.bets += placed;
  return placed;
}

/* One quick draw between two players with room for the ante, played out. */
function playFillerDuel(run) {
  const { state } = run;
  if (!state.live || state.frozen) return false;
  const rows = computeStandings(state);
  const list = run.events();
  const room = player => duelRoom(state, player, { events:list, rows }).room;
  const present = presentPlayers(state);
  const senders = shuffled(run, present.filter(player => room(player) >= PT
    && duelsSentToday(state, player) < DUEL_DAILY_LIMIT));
  for (const from of senders) {
    const opponents = present.filter(player => player !== from && room(player) >= PT && !duelBetween(state, from, player));
    if (!opponents.length) continue;
    const to = pick(run, opponents);
    const stake = Math.min(Math.floor(Math.min(room(from), room(to)) / PT) * PT, pick(run, [PT, PT, 2 * PT]));
    const sent = run.as(from, "sendDuel", { to, game:"quickdraw", stake });
    if (!sent.ok || !sent.extra?.id) continue;
    const id = sent.extra.id;
    if (!run.as(to, "acceptDuel", { id }).ok) return false;
    const draw = () => run.rng() < 0.08 ? { ms:null, foul:true } : { ms:160 + Math.floor(run.rng() * 320) };
    run.as(to, "playDuel", { id, ...draw() });
    run.as(from, "playDuel", { id, ...draw() });
    run.stats.duels += 1;
    return true;
  }
  return false;
}

/* A captains draft someone left running is finished the way a commissioner
   would: picks for each captain on the clock, then confirmed. */
function finishDraft(run, ev) {
  const { state } = run;
  for (let guard = 0; guard < 40; guard++) {
    const draft = state.drafts?.[ev.id];
    if (!draft || state.draws?.[ev.id]) return;
    const turn = draftTurn(draft);
    const reference = { evId:ev.id, draftId:turn.draftId, pickIndex:turn.pickIndex, draftRevision:turn.draftRevision };
    if (turn.complete) { run.gm("finalizeDraft", reference); return; }
    run.gm("pickDraftPlayer", { ...reference, player:pick(run, draft.pool) });
  }
  throw new QaStop(`${ev.name}: draft did not finish`);
}

const announced = (state, ev) => {
  const op = state.eventOps?.[ev.id] || {};
  return state.onDeck === ev.id || !!op.contest || !!op.startedAt || !!op.resultEntryAt
    || !!op.bettingLockedAt || !!op.bettingOpenedAt;
};
/* the last contest of the event, whose winner decides it */
const deciding = (state, ev, contest) => contest.kind === "ffa" || contest.kind === "stage-final"
  || contest.kind === "match" && contest.match[0] === (state.brackets?.[ev.id]?.rounds?.length || 1) - 1;

function announce(run, ev) {
  const { state } = run;
  if (state.drafts?.[ev.id] && !state.draws?.[ev.id]) finishDraft(run, ev);
  if (announced(state, ev)) return;
  if (ev.teamCfg || ev.stageCfg?.kind === "heats") run.gm("announceAndDraw", { evId:ev.id });
  else run.gm("announceEvent", { evId:ev.id });
}

/* The podium for an event nobody's contest sequence posted: a free-for-all
   finish order, or (for older in-progress events) the finished bracket or
   stages, exactly as the commissioner's result entry would read them. */
function podium(run, ev) {
  const { state } = run;
  const table = AWARDS[ev.value] || [0, 0, 0];
  const place = (sides, i) => i === 0 || table[i] > 0 ? [...(sides[i]?.players || [])] : [];
  const contest = resolveCurrentContest(state, ev);
  if (contest?.kind === "ffa") {
    const order = shuffled(run, contest.sides);
    return [0, 1, 2].map(i => place(order, i));
  }
  const draw = state.draws?.[ev.id], br = state.brackets?.[ev.id], st = state.stages?.[ev.id];
  if (st && stageFinalists(st) && st.finalWinner !== null && st.finalWinner !== undefined) {
    const order = [st.finalWinner, ...shuffled(run, stageFinalists(st).filter(key => key !== st.finalWinner))]
      .map(key => ({ players:stageEntrantView(state, st, key).players }));
    return [0, 1, 2].map(i => place(order, i));
  }
  if (br && draw && bracketChampion(br) !== null) {
    const champion = bracketChampion(br);
    const final = br.rounds[br.rounds.length - 1][0];
    const runner = [resolveSlot(br, final.a), resolveSlot(br, final.b)].find(key => key !== champion);
    const third = br.rounds.length > 1 ? br.rounds[br.rounds.length - 2]
      .map(match => [resolveSlot(br, match.a), resolveSlot(br, match.b)].find(key => key !== null && key !== match.winner))
      .filter(key => key !== null && key !== undefined && key !== runner) : [];
    return [[...draw.teams[champion].players],
      table[1] > 0 && runner !== undefined && runner !== null ? [...draw.teams[runner].players] : [],
      table[2] > 0 ? third.flatMap(key => draw.teams[key].players) : []];
  }
  const sides = draw ? draw.teams.map(team => ({ players:team.players }))
    : presentPlayers(state).map(player => ({ players:[player] }));
  const order = shuffled(run, sides);
  return [0, 1, 2].map(i => place(order, i));
}

function postResult(run, ev) {
  const { state } = run;
  if (state.results?.[ev.id]) return;
  const lifecycle = resolveEventLifecycle(state, ev);
  if (lifecycle.phase === "in-progress" && lifecycle.nextAction?.type === "enter-result")
    run.gm("beginResultEntry", { evId:ev.id });
  run.gm("saveResult", { evId:ev.id, slots:podium(run, ev), noScene:true });
}

/* Play one event forward. stop: "open" (first contest betting, bets down),
   "mid" (a contest decided and the next one open with bets, or the only
   contest under way), "contest" (the current contest decided, once) or
   "done" (result posted). */
function playEvent(run, ev, stop) {
  const { state } = run;
  if (state.results?.[ev.id]) return;
  announce(run, ev);
  let decided = 0;
  for (let guard = 0; guard < 80; guard++) {
    if (state.results?.[ev.id]) break;
    const contest = resolveCurrentContest(state, ev);
    if (!contest || contest.phase === "awaiting-result") break;
    const reference = { evId:ev.id, contestId:contest.id, contestRevision:contest.revision };
    const recorded = contestStackOf(state, ev.id).length;
    if (contest.phase === "scheduled") { run.gm("setOnDeck", { id:ev.id }); continue; }
    if (contest.phase === "betting-open") {
      placeFillerBets(run, ev, contest);
      if (stop === "open" && !recorded) return;
      if (stop === "mid" && recorded) return;
      run.gm("lockAndStart", reference);
      continue;
    }
    if (contest.phase === "betting-locked") { run.gm("lockAndStart", reference); continue; }
    if (stop === "mid" && deciding(state, ev, contest)) return;
    if (contest.kind === "ffa") break;
    const sides = shuffled(run, contest.sides.map(side => side.key));
    const advance = contest.kind === "heat" ? state.stages[ev.id].advance : 1;
    run.gm("recordContestWinner", { ...reference, winner:sides[0], noScene:true, postResult:true,
      ...(contest.kind === "heat" ? { qualifiers:sides.slice(0, advance) } : {}),
      ...(contest.kind === "stage-final" ? { order:sides } : {}) });
    run.stats.contests += 1;
    decided += 1;
    if (stop === "contest") {
      /* the next contest opens by itself; if that was the last, the result posted with it */
      if (!state.results?.[ev.id] && !resolveCurrentContest(state, ev)) postResult(run, ev);
      return;
    }
  }
  if (stop === "open" || stop === "mid") return;
  if (!state.results?.[ev.id]) {
    postResult(run, ev);
    if (!decided) run.stats.contests += 1;
  }
  run.stats.events += 1;
  /* a duel now and then, between events, the way the room plays them */
  if (run.rng() < 0.5) playFillerDuel(run);
}

/* The finale, one stage at a time up to the one asked for. */
function playPoker(run, phase) {
  const { state } = run;
  const want = { set:1, live:2, counted:3, crowned:4 }[phase];
  if (qaPokerStage(state) >= want) return;
  if (!state.poker) {
    const list = run.events();
    const preview = pokerSetupPreview(state);
    if (!preview.ok && (state.wagers || []).some(wager => resolveWager(state, wager, list).status === "pending"))
      (state.wagers || []).filter(wager => resolveWager(state, wager, list).status === "pending")
        .forEach(wager => run.gm("voidWager", { id:wager.id }));
    run.gm("pokerSetup");
  }
  if (want === 1) return;
  const pk = state.poker;
  const seats = Array.isArray(pk.seats) ? pk.seats : ROSTER;
  const alive = () => seats.filter(player => !state.poker.outs.some(out => out.player === player));
  if (!pk.startedAt) {
    run.gm("pokerStart");
    for (const player of shuffled(run, alive()).slice(0, Math.min(3, Math.max(0, alive().length - 3))))
      run.gm("pokerBust", { player });
  }
  if (!state.results?.[pk.id]) {
    const open = () => alive().filter(player => state.poker.counts?.[player] === undefined);
    if (want === 2) {
      if (!Object.keys(state.poker.counts || {}).length)
        for (const player of shuffled(run, open()).slice(0, 2))
          run.gm("pokerCount", { player, count:(12 + Math.floor(run.rng() * 40)) * 4 * CHIP_MIN });
      return;
    }
    /* the rest of the dealt chips, split unevenly, in 25s, summing exactly */
    const todo = shuffled(run, open());
    const counted = Object.values(state.poker.counts || {}).reduce((sum, count) => sum + count, 0);
    let left = Math.max(0, Math.floor((state.poker.total - counted) / CHIP_MIN));
    const weights = todo.map(() => 0.2 + run.rng());
    let weight = weights.reduce((sum, item) => sum + item, 0);
    todo.forEach((player, index) => {
      const share = index === todo.length - 1 ? left : Math.min(left, Math.round(left * weights[index] / weight));
      left -= share;
      weight -= weights[index];
      /* a zero here would be a bust; everyone still in keeps at least one chip */
      run.gm("pokerCount", { player, count:Math.max(1, share) * CHIP_MIN });
    });
    run.gm("pokerResult", { noScene:true });
  }
  if (want === 4 && !state.frozen) {
    const champions = computeStandings(state).filter(row => row.rank === 1).map(row => row.player);
    run.gm("crownChampion", { champions });
  }
}

/* Past ceremonies a jump skipped are recorded as skipped, so the director
   points at the next official action instead of owing the room a winner
   scene or a champion scene for moments nobody watched. */
function settleCeremonies(state, now) {
  const control = state.showControl || (state.showControl = { active:null, history:[] });
  if (!Array.isArray(control.history)) control.history = [];
  if (control.active) finishShowScene(control, "skipped", now);
  const skipped = [];
  const entry = (kind, extra = {}) => ({ id:`show-${now}-qa-${kind}-${skipped.length}`, kind, eventId:null,
    startedAt:now, endedAt:now, outcome:"skipped", retryOf:null, revision:null, commands:[], ...extra });
  const latest = Object.entries(state.results || {})
    .filter(([, result]) => result?.slots?.[0]?.length)
    .sort((a, b) => Number(b[1].ts) - Number(a[1].ts))[0];
  if (latest) {
    const revision = Number(latest[1].revision || 1);
    if (!control.history.some(item => item.kind === "winner" && item.eventId === latest[0]
        && Number(item.revision ?? 0) === revision))
      skipped.push(entry("winner", { eventId:latest[0], revision }));
  }
  if (state.frozen) skipped.push(entry("champion", { champion:championIdentity(state) }));
  control.history = [...skipped, ...control.history].slice(0, SHOW_HISTORY_LIMIT);
}

/* The guests' retry ledger is for their own taps; synthetic ones can never
   be retried, so they leave with the run. */
function dropSyntheticLedger(state) {
  for (const key of Object.keys(state.wagerOps || {}))
    if (key.startsWith(QA_REQUEST_PREFIX)) delete state.wagerOps[key];
}

/* The fast-forward itself. Mutates state (the Durable Object's working
   copy) and returns what it did, or throws QaStop with the refusal. */
function runQaAdvance(state, target, { applyAction, ctx, seed, production = false }) {
  const started = performance.now();
  const events = allEventsOf(state);
  const rewound = qaNeedsRewind(state, target, events);
  let run = null;
  const advance = () => {
    if (rewound) resetProgress(state);
    fillEmptyCheckIns(run, { production });
    if (target.kind === "locker") return;
    if (target.kind === "step" || target.kind === "finish") {
      const operation = resolveWeekendOperation(state, run.events());
      const ev = operation.event;
      if (!ev) {
        if (target.kind === "step" && operation.nextAction?.type === "crown-champion") playPoker(run, "crowned");
        else throw new QaStop("Nothing left to play");
        return;
      }
      if (ev.finale) {
        const stage = qaPokerStage(state);
        playPoker(run, target.kind === "finish" ? "counted" : ["set", "live", "counted", "crowned"][Math.min(3, stage)]);
        return;
      }
      if (target.kind === "step" && !announced(state, ev)) { playEvent(run, ev, "open"); return; }
      playEvent(run, ev, target.kind === "step" ? "contest" : "done");
      return;
    }
    const slate = qaSlate(state, run.events());
    /* anything already under way before the target finishes first, so no
       announcement collides with a market still open */
    const upTo = target.kind === "event" ? slate.findIndex(ev => ev.id === target.evId) : slate.length;
    for (const ev of slate.slice(0, upTo))
      if (qaEventStage(state, ev) > 0 && qaEventStage(state, ev) < 3) playEvent(run, ev, "done");
    for (const ev of slate.slice(0, upTo)) if (!state.results?.[ev.id]) playEvent(run, ev, "done");
    if (target.kind === "event") { playEvent(run, slate[upTo], target.phase); return; }
    playPoker(run, target.kind === "crowned" ? "crowned" : target.phase);
  };
  rehearse(seed, tick => {
    run = createRunner(state, { ...ctx, applyAction }, tick);
    advance();
    tick();
    if (run.stats.writes || rewound) settleCeremonies(state, Date.now());
  });
  dropSyntheticLedger(state);
  return { rewound, seed, ...run.stats, ms:Math.round(performance.now() - started) };
}

export {
  QA_DEVICE, QaStop, cleanSeed, parseQaTarget, qaNeedsRewind, qaProgressCost, resetProgress,
  runQaAdvance, seededRandom,
};
