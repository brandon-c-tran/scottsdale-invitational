/* The Trivia board's writes (shared/triviaBoard.js is the model,
   docs/TRIVIA-BOARD.md the contract). Players pick a cell when they hold
   the board, buzz (again on a rebound, until they have answered the
   clue), answer on their turn, wager a Daily Double and the Final, and
   answer the Final; everything a clock decides (the pick when the picker
   waits too long, the buzzers closing, a turn running out, the next pick,
   each step of the Final, the result) is a commissioner write the
   autopilot makes on the game's own clock (boardAutoBeat) with a context
   marked `auto`, and the pill offers as a skip-ahead (boardBeat). An
   autopilot write that is no longer the game's next beat, or not yet due,
   is acknowledged and changes nothing.

   A player's retried write (the same device and action id) is
   acknowledged once and never undoes a newer one (`ops`, server only).

   Built by worker/trivia.js, which hands in its own set-list helpers
   (roundQuestions, dealOptions) and the ordinary result writes, so a board
   game starts from the same set list and posts through the same
   beginResultEntry and saveResult as every other result. Nothing here
   imports worker/trivia.js. */
import { isAbsent, isActivePlayer, isAway, resolveEventLifecycle } from "../shared/core.js";
import { autopilotHeld } from "../shared/show.js";
import {
  ANSWER_GRACE_MS, BOARD_FORMAT, BUZZ_EARLY_MS, BUZZ_SHOW_MS, DD_MIN, FINAL_ANSWER_MS, FINAL_GRACE_MS,
  FINAL_INTRO_MS, FINAL_PHASES, FINAL_WAGER_MS, WAGER_STEP, answeredOn, attemptsAllowed, autoPickClue, boardActive, boardAutoBeat,
  boardClue, boardLog, boardPlayed, boardPlayers, boardPlays, boardRace, boardResultSlots, boardScore, boardStandings, boardTopValue,
  buzzCloseAt, buzzOrder, cellsLeft, clampBuzzMs, clueClock, dealBoard, ddDefault, ddMax, finalEligible, finalMax, isBoardGame,
  raceBuzzes, readMs, reboundClock, reboundPlayers, struckChoices, turnPlayer, turnUntil, validWager,
  MEDIA_CUE_ACTIONS, MEDIA_CUE_LEAD_MS, clipMs, isClipClue, mediaReadyArm, openMs,
} from "../shared/triviaBoard.js";
import { dealPlan } from "../shared/triviaQBank.js";
import { TRIVIA_FINALS } from "./triviaBank.js";
import { effectiveQBank } from "./qbank.js";

export const BOARD_ACTION_TYPES = Object.freeze([
  "boardPick", "boardBuzz", "boardCloseBuzz", "boardAnswer", "boardTimeout", "boardNext", "boardWager", "boardDdClue",
  "boardFinalClue", "boardFinalPick", "boardFinalReveal", "boardFinalBoard", "boardSim", "boardMediaReady", "boardMediaCue",
]);

/* retried writes a player's own taps remember, per clue (and the Final) */
const OPS_KEPT = 8;
/* an autopilot beat may land this early on the alarm's clock */
const AUTO_EARLY_MS = 250;
/* an answer may leave a phone this early, as its turn lights */
const ANSWER_EARLY_MS = 300;
/* QA's simulated room (boardSim): who buzzes, how fast, how often right */
const SIM_BUZZ_SHARE = 0.5;
const SIM_REACTION_MS = Object.freeze([180, 900]);
const SIM_RIGHT = 0.55;

const num = value => Number(value) || 0;
const fmt = value => num(value).toLocaleString("en-US");
/* a choice or a wager as sent: a missing one is never read as 0 */
const given = value => value !== undefined && value !== null && value !== "";
const asNumber = value => given(value) ? Number(value) : NaN;
const opKeyOf = ctx => ctx?.deviceId && typeof ctx.actionId === "string" && ctx.actionId ? `${ctx.deviceId}:${ctx.actionId}` : null;

/* the board game under way: started, not finished, its result not posted */
export function liveBoard(state, evId = null) {
  const game = state?.trivia;
  return isBoardGame(game) && !game.finishedAt && !state.results?.[game.eventId] && (!evId || game.eventId === evId) ? game : null;
}

/* Who picks: the player with control while they are still here, else the
   best score still here (the order they joined breaks a tie), so a picker
   who stepped away never holds the board. Null with nobody here. */
export function pickerOf(state, game = state?.trivia) {
  const here = boardPlayers(game).filter(player => !isAbsent(state, player));
  if (here.includes(game?.control)) return game.control;
  return boardStandings(game).find(row => here.includes(row.player))?.player || null;
}

/* What a board game has put up: each clue once it is picked, the Final once
   its clue reads. worker/tournament.js serves a clue's photo or a tune's
   clip only once shown; the commissioner may read any (`all`). */
export function boardShown(game, { all = false } = {}) {
  if (!isBoardGame(game)) return [];
  const played = new Set(game.played || []);
  const clues = Object.values(game.clues || {}).filter(clue => all || played.has(clue?.id));
  const finalUp = all || FINAL_PHASES.indexOf(game.phase) >= 1 || !!game.finishedAt;
  return game.final && finalUp ? [...clues, game.final] : clues;
}

export function boardActions({ ok, err, gmOnly, run, roundQuestions, dealOptions }) {
  const rounds = state => Array.isArray(state.triviaRounds) ? state.triviaRounds : [];
  /* An autopilot write runs only while it is still the game's next beat,
     its time has come and the autopilot is not held; anything else (a beat
     the commissioner already took, an old clue, an early alarm) is
     acknowledged and changes nothing. */
  const autoStale = (state, type, payload, ctx) => {
    if (!ctx?.auto) return null;
    const beat = autopilotHeld(state) ? null : boardAutoBeat(state);
    const same = !!beat && beat.type === type
      && Object.entries(beat.payload || {}).every(([key, value]) => payload?.[key] === value);
    return same && beat.at <= Date.now() + AUTO_EARLY_MS ? null : ok({ unchanged:true, stale:true });
  };
  const seen = (game, scope, who, key) => !!key && (game?.ops?.[scope]?.[who] || []).includes(key);
  const remember = (game, scope, who, key) => {
    if (!key) return;
    const kept = game.ops?.[scope]?.[who] || [];
    game.ops = { ...(game.ops || {}), [scope]:{ ...(game.ops?.[scope] || {}), [who]:[...kept, key].slice(-OPS_KEPT) } };
  };
  /* a player's own write: checked in and here. A present roster player not
     in the game yet joins on their first buzz, Final wager or Final answer
     (`join`), never into QA's solo game (`solo`). */
  const seat = (state, game, ctx, join = false) => {
    const player = ctx?.player;
    if (!player) return { error:err("Check in first") };
    if (isAbsent(state, player)) return { error:err(isAway(state, player) ? "You are marked away" : "Scan the TV first") };
    if (boardPlays(game, player)) return { player, joining:false };
    if (!join || !Array.isArray(game.players) || game.solo || !isActivePlayer(player, state)) return { error:err("You are not playing") };
    return { player, joining:true };
  };
  /* One answer recorded (a timeout is a wrong one). Right takes the value
     and the board. Wrong costs the value and strikes the option, and the
     buzzers reopen (the rebound): the race just run is kept in `races`, a
     new one arms REBOUND_LEAD_MS on for everyone here who has not answered,
     and the clue is back in phase clue, so it closes and answers exactly
     as the first race did. The answer stands once the clue has taken
     MAX_ATTEMPTS answers (a Daily Double: one), or nobody is left to buzz. */
  const settle = (state, game, id, attempt, now) => {
    const log = game.log[id];
    log.attempts = [...(log.attempts || []), attempt];
    if (attempt.right) {
      Object.assign(log, { winner:attempt.player, revealedAt:now });
      game.control = attempt.player;
      game.phase = "reveal";
      return;
    }
    if (log.attempts.length < attemptsAllowed(game, id) && reboundPlayers(state, game, id).length) {
      const { armAt, openUntil, buzzes, closedAt, order } = log;
      log.races = [...(log.races || []), { armAt, openUntil, buzzes:buzzes || {}, closedAt, order:order || [] }];
      Object.assign(log, reboundClock(game.clues[id], now), { buzzes:{}, order:[] });
      delete log.closedAt;
      game.phase = "clue";
      return;
    }
    Object.assign(log, { winner:null, revealedAt:now });
    game.phase = "reveal";
  };
  /* the Final: the commissioner's own (the set list's final entry), else
     one of the bank's at random, its options dealt */
  const dealFinal = (state, gameId) => {
    const own = rounds(state).find(round => round?.source === "final");
    const question = own?.questions?.[0];
    if (question && ["choice", "picture"].includes(question.format) && Array.isArray(question.options)
        && question.options.length === 4 && Number.isInteger(question.answer)) {
      const { id:source, ...rest } = structuredClone(question);
      return { ...rest, id:`${gameId}-final`, category:own.category || "Final", ...(source ? { source } : {}) };
    }
    if (!TRIVIA_FINALS.length) return null;
    const { id:source, ...rest } = dealOptions(TRIVIA_FINALS[Math.floor(Math.random() * TRIVIA_FINALS.length)]);
    return { ...rest, id:`${gameId}-final`, source };
  };

  /* triviaStart in the board format: worker/trivia.js has checked the
     event, its lifecycle, the set list and who is here. The question bank's
     board (state.triviaPlan, docs/TRIVIA-QBANK.md) deals exactly as the
     commissioner set it once any slot holds a clue, and only when every
     slot is filled and ready (or forced); with an empty plan every round
     of the set list but the Final becomes a column (shared/triviaBoard.js
     dealBoard). A random player here holds the board first. */
  const start = (state, ev, players) => {
    const now = Date.now();
    const id = `tb${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const bank = effectiveQBank(state);
    const board = bank.plan ? dealPlan(bank.plan, bank.byId, { gameId:id })
      : dealBoard(rounds(state).filter(round => round?.source !== "final").map(round => roundQuestions(round)), { gameId:id });
    if (board.error) return err(board.error);
    if (!board.columns.length) return err("Add rounds in the Trivia desk first");
    const final = dealFinal(state, id);
    const control = players[Math.floor(Math.random() * players.length)];
    state.trivia = { id, eventId:ev.id, format:BOARD_FORMAT, startedAt:now, players:[...players], questions:[],
      ...(board.values ? { values:board.values } : {}),
      columns:board.columns, clues:board.clues, dd:board.dd, final, control, phase:"pick", current:null, pickAt:now,
      played:[], log:{}, finalAt:{}, finalWagers:{}, finalPicks:{}, ops:{} };
    return ok({ game:id });
  };

  /* triviaFinish for a board game: the final standings post the event's
     result (one winner, then the next two ranks) through the ordinary
     result write, so payouts, bets and the win song follow */
  const finish = (state, ev, ctx) => {
    const game = state.trivia;
    if (state.results?.[ev.id]) return ok({ unchanged:true });
    if (game.phase !== "final-board") return err("Show the final scores first");
    const slots = boardResultSlots(boardStandings(game));
    if (!slots) return err("Nobody played");
    if (resolveEventLifecycle(state, ev).phase === "in-progress") {
      const entered = run("beginResultEntry", state, { evId:ev.id }, ctx);
      if (!entered.ok) return entered;
    }
    const posted = run("saveResult", state, { evId:ev.id, slots }, ctx);
    if (!posted.ok) return posted;
    game.finishedAt = Date.now();
    return ok({ slots, ...(posted.extra || {}) });
  };

  const actions = {
    /* A cell: the player who holds the board picks any, the commissioner
       any for them; the autopilot (or the pill taking its beat, `auto`)
       picks the next one in reading order once the picker has waited too
       long. A Daily Double goes to its wager, anything else to the room. */
    boardPick(state, { clueId, auto } = {}, ctx) {
      const stale = autoStale(state, "boardPick", { clueId, auto }, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      const who = ctx.player || "commissioner";
      const opKey = opKeyOf(ctx);
      if (seen(game, "pick", who, opKey)) return ok({ unchanged:true });
      if (game.phase !== "pick") return game.current === clueId ? ok({ unchanged:true }) : err("The pick is in");
      const picker = pickerOf(state, game);
      if (!ctx.isGm) {
        const checked = seat(state, game, ctx);
        if (checked.error) return checked.error;
        if (checked.player !== picker) return err("Not your pick");
      }
      const forPicker = !!ctx.isGm && (auto === true || ctx.auto === true);
      const clue = game.clues?.[clueId];
      if (!clue) return err("That clue isn't on the board");
      if (boardPlayed(game, clueId)) return err("That one is played");
      if (forPicker && clueId !== autoPickClue(game)) return err("That clue isn't next");
      const now = Date.now();
      game.control = picker;
      /* nobody here to play a Daily Double: it plays as an ordinary clue */
      if (game.dd === clueId && !picker) game.dd = null;
      const daily = game.dd === clueId;
      const base = { by:picker, auto:!(ctx.player && ctx.player === picker && !forPicker), pickedAt:now, buzzes:{}, attempts:[] };
      game.log = { ...(game.log || {}), [clueId]:daily ? base : { ...base, ...clueClock(clue, now) } };
      game.played = [...(game.played || []), clueId];
      game.current = clueId;
      game.phase = daily ? "dd-wager" : "clue";
      remember(game, "pick", who, opKey);
      return ok({ clueId });
    },
    /* A buzz: any player here who has not answered the clue, once a race,
       from a beat before the lamp lights on the server clock until the
       buzzers close. The phone times its own reaction from the frame that
       lit it (`ms`) and names the race it lit for (`race`, the first when
       missing); the order goes by the reaction, not by arrival. A second
       buzz in the race is acknowledged and changes nothing; one for a race
       that is over never counts in the next. */
    boardBuzz(state, { clueId, ms, race } = {}, ctx) {
      const game = liveBoard(state);
      const log = game?.log?.[clueId];
      const current = boardRace(log);
      const asked = given(race) ? Number(race) : current;
      if (ctx?.player && log && Number.isInteger(asked) && raceBuzzes(log, asked)[ctx.player]) return ok({ unchanged:true });
      if (!game || game.phase !== "clue" || game.current !== clueId || asked !== current) return err("Buzzers closed");
      const checked = seat(state, game, ctx, true);
      if (checked.error) return checked.error;
      if (answeredOn(log).has(checked.player)) return err("You already answered");
      const now = Date.now();
      if (now < num(log.armAt) - BUZZ_EARLY_MS) return err("Buzzers are not open yet");
      if (now > buzzCloseAt(log)) return err("Buzzers closed");
      if (checked.joining) game.players = [...game.players, checked.player];
      log.buzzes = { ...(log.buzzes || {}), [checked.player]:{ ms:clampBuzzMs(ms), at:now } };
      return ok();
    },
    /* The buzzers close (a beat after the first buzz, or nobody in): the
       race's order stands, fastest first, and its first answers once it
       has shown; nobody in reveals the answer. A rebound's close names its
       race; a close for a race that is over changes nothing. */
    boardCloseBuzz(state, { clueId, race } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardCloseBuzz", { clueId, race }, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.phase !== "clue" || game.current !== clueId) return ok({ unchanged:true });
      const log = game.log[clueId];
      if (given(race) && Number(race) !== boardRace(log)) return ok({ unchanged:true });
      const now = Date.now();
      if (now < num(log.armAt)) return err("Buzzers are not open yet");
      log.closedAt = now;
      log.order = buzzOrder(log);
      if (!log.order.length) {
        Object.assign(log, { winner:null, revealedAt:now });
        game.phase = "reveal";
      } else {
        const attempts = log.attempts || [];
        Object.assign(log, { turn:attempts.length, turnAt:now + BUZZ_SHOW_MS, attempts });
        game.phase = "answer";
      }
      return ok();
    },
    /* An answer: only whoever's turn it is (the Daily Double: its picker),
       from a beat before the turn lights until it runs out (and a beat
       after, for one already sent). One tap, final; a struck option is
       refused. */
    boardAnswer(state, { clueId, choice } = {}, ctx) {
      const player = ctx?.player;
      if (!player) return err("Check in first");
      const game = liveBoard(state);
      const log = game?.log?.[clueId];
      const answer = asNumber(choice);
      const opKey = opKeyOf(ctx);
      /* a retried tap after the turn moved on is acknowledged once */
      const answered = !!log && (seen(game, clueId, player, opKey)
        || (log.attempts || []).some(attempt => attempt.player === player && !attempt.timeout && attempt.choice === answer));
      if (answered) return ok({ unchanged:true });
      if (!game || game.current !== clueId || !["answer", "dd-clue"].includes(game.phase)) return err("That turn is over");
      if (turnPlayer(log) !== player) return err("Not your turn");
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) return err("Pick an answer");
      const now = Date.now();
      if (now < num(log.turnAt) - ANSWER_EARLY_MS) return err("Not your turn yet");
      if (now > turnUntil(game, clueId) + ANSWER_GRACE_MS) return err("Time is up");
      if (struckChoices(log).has(answer)) return err("That one is out");
      const right = answer === game.clues[clueId].answer;
      settle(state, game, clueId, { player, choice:answer, at:now, right }, now);
      remember(game, clueId, player, opKey);
      return ok();
    },
    /* the turn ran out: a wrong answer with no option struck (and the
       rebound, as after any wrong one). A turn that is no longer the
       current one changes nothing. */
    boardTimeout(state, { clueId, turn } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardTimeout", { clueId, turn }, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.current !== clueId || !["answer", "dd-clue"].includes(game.phase)) return ok({ unchanged:true });
      const log = game.log[clueId];
      if (!given(turn) || Number(turn) !== num(log.turn)) return ok({ unchanged:true });
      const now = Date.now();
      settle(state, game, clueId, { player:turnPlayer(log), choice:null, at:now, right:false, timeout:true }, now);
      return ok();
    },
    /* after the answer stands: the next pick, or once the board is clear
       the Final (its category first), or with no Final the final scores */
    boardNext(state, { clueId } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardNext", { clueId }, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.phase !== "reveal" || game.current !== clueId) return ok({ unchanged:true });
      const now = Date.now();
      game.current = null;
      if (cellsLeft(game).length) {
        game.phase = "pick";
        game.pickAt = now;
        game.control = pickerOf(state, game);
      } else if (game.final) {
        game.phase = "final-wager";
        game.finalAt = { introAt:now, wagerUntil:now + FINAL_INTRO_MS + FINAL_WAGER_MS };
      } else {
        game.phase = "final-board";
        game.finalAt = { boardAt:now };
      }
      return ok();
    },
    /* A wager, once. The Daily Double: its picker, 100 up to their score
       (or the board's top value when that is more). The Final: every player
       here, whatever their score, 0 up to the same most (a present roster
       player not in the game joins on it); nobody sees another's until the
       reveal. */
    boardWager(state, { wager } = {}, ctx) {
      const game = liveBoard(state);
      if (!game) return err("Wagers are closed");
      const player = ctx?.player;
      if (!player) return err("Check in first");
      const amount = asNumber(wager);
      const opKey = opKeyOf(ctx);
      const scope = game.phase === "dd-wager" || game.phase === "dd-clue" ? game.current : "final";
      if (seen(game, scope, player, opKey)) return ok({ unchanged:true });
      if (game.phase === "dd-wager") {
        const log = boardLog(game);
        if (!log || player !== log.by) return err("Not your Daily Double");
        if (log.wager !== undefined) return log.wager === amount ? ok({ unchanged:true }) : err("You already wagered");
        const max = ddMax(boardScore(game, player), boardTopValue(game));
        if (!validWager(amount, DD_MIN, max)) return err(`Wager in 100s, up to ${fmt(max)}`);
        Object.assign(log, { wager:amount, wagerAt:Date.now() });
        remember(game, scope, player, opKey);
        return ok();
      }
      if (game.phase === "final-wager") {
        const prior = game.finalWagers?.[player];
        if (prior) return prior.wager === amount ? ok({ unchanged:true }) : err("You already wagered");
        const checked = seat(state, game, ctx, true);
        if (checked.error) return checked.error;
        const score = checked.joining ? 0 : boardStandings(game).find(row => row.player === player)?.preFinal;
        const max = finalMax(score, boardTopValue(game));
        if (!validWager(amount, 0, max)) return err(`Wager in 100s, up to ${fmt(max)}`);
        if (checked.joining) game.players = [...game.players, player];
        game.finalWagers = { ...(game.finalWagers || {}), [player]:{ wager:amount, at:Date.now() } };
        remember(game, scope, player, opKey);
        return ok();
      }
      return err("Wagers are closed");
    },
    /* the Daily Double's clue: the wager stands (half the most they could
       risk when none came in) and only the picker answers */
    boardDdClue(state, { clueId } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardDdClue", { clueId }, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.phase !== "dd-wager" || game.current !== clueId) return ok({ unchanged:true });
      const log = game.log[clueId];
      const now = Date.now();
      if (log.wager === undefined) log.wager = ddDefault(boardScore(game, log.by), boardTopValue(game));
      Object.assign(log, { shownAt:now, order:[log.by], turn:0, turnAt:now + readMs(game.clues[clueId]), attempts:log.attempts || [] });
      game.phase = "dd-clue";
      return ok();
    },
    /* the Final's clue goes up on every phone; a wager not in is 0 */
    boardFinalClue(state, payload, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardFinalClue", payload, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.phase !== "final-wager") return ok({ unchanged:true });
      const now = Date.now();
      game.finalAt = { ...(game.finalAt || {}), clueAt:now, answerUntil:now + FINAL_ANSWER_MS };
      game.phase = "final-clue";
      return ok();
    },
    /* A player's Final: set it, change it, lock it in, and a locked answer
       stays. Anyone here answers (a wager of 0 risks nothing). */
    boardFinalPick(state, { choice, lock } = {}, ctx) {
      const player = ctx?.player;
      if (!player) return err("Check in first");
      const game = liveBoard(state);
      const opKey = opKeyOf(ctx);
      if (seen(game, "final", player, opKey)) return ok({ unchanged:true });
      if (!game || game.phase !== "final-clue") return err(game?.phase === "final-wager" ? "The Final is not up yet" : "The Final is closed");
      const checked = seat(state, game, ctx, true);
      if (checked.error) return checked.error;
      const now = Date.now();
      const until = num(game.finalAt?.answerUntil);
      if (now > until + FINAL_GRACE_MS) return err("Time is up");
      const has = given(choice);
      const answer = Number(choice);
      if (has && (!Number.isInteger(answer) || answer < 0 || answer > 3)) return err("Pick an answer");
      const prior = game.finalPicks?.[player] || null;
      if (prior?.locked) {
        if (!has || prior.choice === answer) return ok({ unchanged:true });
        return err("You locked in");
      }
      if (!has && !Number.isInteger(prior?.choice)) return err("Pick an answer first");
      const changed = has && prior?.choice !== answer;
      if (!changed && lock !== true) return ok({ unchanged:true });
      const next = changed ? { choice:answer, at:now } : { ...prior };
      if (lock === true) Object.assign(next, { locked:true, lockedAt:Math.min(now, until || now) });
      if (checked.joining) game.players = [...game.players, player];
      game.finalPicks = { ...(game.finalPicks || {}), [player]:next };
      remember(game, "final", player, opKey);
      return ok();
    },
    /* the TV turns each player's Final, lowest score first */
    boardFinalReveal(state, payload, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardFinalReveal", payload, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.phase !== "final-clue") return ok({ unchanged:true });
      game.finalAt = { ...(game.finalAt || {}), revealAt:Date.now() };
      game.phase = "final-reveal";
      return ok();
    },
    /* the final standings; triviaFinish posts them */
    boardFinalBoard(state, payload, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const stale = autoStale(state, "boardFinalBoard", payload, ctx); if (stale) return stale;
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      if (game.phase !== "final-reveal") return ok({ unchanged:true });
      game.finalAt = { ...(game.finalAt || {}), boardAt:Date.now() };
      game.phase = "final-board";
      return ok();
    },
    /* A TV has the clue's media ready (its image painted, its clip able to
       play): the buzzers arm a beat on, never before the clue has read,
       never later than they stood. A TV or the commissioner reports it;
       only the first race of a clue waiting on its media, before anyone
       buzzed; any other report changes nothing. */
    boardMediaReady(state, { clueId } = {}, ctx) {
      if (!ctx?.tv && !ctx?.isGm) return err("The TV reports this");
      const game = liveBoard(state);
      const log = game?.log?.[clueId];
      if (!game || game.phase !== "clue" || game.current !== clueId || !log?.mediaWait || boardRace(log) > 0
          || Object.keys(log.buzzes || {}).length) return ok({ unchanged:true });
      const now = Date.now();
      const armAt = mediaReadyArm(log, now);
      const clue = game.clues[clueId];
      delete log.mediaWait;
      log.mediaReadyAt = now;
      if (armAt < num(log.armAt)) Object.assign(log, { armAt, openUntil:armAt + openMs(clue) });
      return ok({ armAt:log.armAt });
    },
    /* The host replays or pauses the clue's clip on the TV (audio or
       video), while the clue is up or being answered; a replay starts a
       beat on so every TV starts it together, and while the buzzers wait
       for the first buzz it keeps them open to the clip's end. The clue
       leaving (the reveal, the next pick) stops it on the TV by itself. */
    boardMediaCue(state, { clueId, action } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!MEDIA_CUE_ACTIONS.includes(action)) return err("Replay or pause");
      const game = liveBoard(state);
      if (!game) return err("The board is closed");
      const opKey = opKeyOf(ctx);
      if (seen(game, "cue", "commissioner", opKey)) return ok({ unchanged:true });
      const clue = game.clues?.[clueId];
      if (game.current !== clueId || !["clue", "answer", "dd-clue"].includes(game.phase)) return err("That clue isn't up");
      if (!isClipClue(clue)) return err("That clue has no clip");
      const log = game.log[clueId];
      const now = Date.now();
      const at = action === "replay" ? now + MEDIA_CUE_LEAD_MS : now;
      log.mediaCue = { action, at, n:num(log.mediaCue?.n) + 1 };
      if (action === "replay" && game.phase === "clue" && !Object.keys(log.buzzes || {}).length && now >= num(log.armAt))
        log.openUntil = Math.max(num(log.openUntil), at + clipMs(clue) + 2000);
      remember(game, "cue", "commissioner", opKey);
      return ok();
    },
    /* QA: the moves the room is waiting on, for every player but the
       commissioner's own (with none, everyone), through the real writes: a
       pick for whoever holds the board, buzzes from about half the room once
       the buzzers are live (on a rebound, half of whoever has not answered),
       the current turn's answer (about 55% right), the Daily Double's wager,
       the Final's wagers (everyone's) and answers. */
    boardSim(state, payload, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!ctx.qa) return err("QA is unavailable");
      const game = liveBoard(state);
      if (!game) return err("No board game is running");
      const actor = ctx.player || null;
      const as = player => ({ isGm:false, player, deviceId:null, actionId:null });
      const rand = n => Math.floor(Math.random() * n);
      const wrongFor = (answer, struck = new Set()) => {
        const open = [0, 1, 2, 3].filter(choice => choice !== answer && !struck.has(choice));
        return open.length ? open[rand(open.length)] : answer;
      };
      const now = Date.now();
      let moved = 0;
      const log = boardLog(game);
      switch (game.phase) {
        case "pick": {
          const picker = pickerOf(state, game);
          const cells = cellsLeft(game);
          if (picker && picker !== actor && cells.length
              && actions.boardPick(state, { clueId:cells[rand(cells.length)] }, as(picker)).ok) moved += 1;
          break;
        }
        case "clue": {
          if (!log || now < num(log.armAt)) break;
          const answered = answeredOn(log);
          const room = boardActive(state, game).filter(player => player !== actor && !log.buzzes?.[player] && !answered.has(player)
            && !isAbsent(state, player));
          for (let i = room.length - 1; i > 0; i--) { const j = rand(i + 1); [room[i], room[j]] = [room[j], room[i]]; }
          const [low, high] = SIM_REACTION_MS;
          const race = boardRace(log);
          for (const player of room.slice(0, Math.max(1, Math.round(room.length * SIM_BUZZ_SHARE))))
            if (actions.boardBuzz(state, { clueId:game.current, ms:low + rand(high - low + 1), race }, as(player)).ok) moved += 1;
          break;
        }
        case "answer":
        case "dd-clue": {
          const player = turnPlayer(log);
          if (!player || player === actor || now < num(log.turnAt) - ANSWER_EARLY_MS) break;
          const clue = boardClue(game);
          const choice = Math.random() < SIM_RIGHT ? clue.answer : wrongFor(clue.answer, struckChoices(log));
          if (actions.boardAnswer(state, { clueId:game.current, choice }, as(player)).ok) moved += 1;
          break;
        }
        case "dd-wager": {
          if (!log?.by || log.by === actor || log.wager !== undefined) break;
          const max = ddMax(boardScore(game, log.by), boardTopValue(game));
          const wager = DD_MIN + WAGER_STEP * rand(Math.floor((max - DD_MIN) / WAGER_STEP) + 1);
          if (actions.boardWager(state, { wager }, as(log.by)).ok) moved += 1;
          break;
        }
        case "final-wager": {
          const rows = new Map(boardStandings(game).map(row => [row.player, row.preFinal]));
          const top = boardTopValue(game);
          for (const player of finalEligible(state, game)) {
            if (player === actor || game.finalWagers?.[player] || isAbsent(state, player)) continue;
            const wager = WAGER_STEP * rand(Math.floor(finalMax(rows.get(player), top) / WAGER_STEP) + 1);
            if (actions.boardWager(state, { wager }, as(player)).ok) moved += 1;
          }
          break;
        }
        case "final-clue": {
          const answer = game.final?.answer;
          for (const player of boardActive(state, game)) {
            if (player === actor || game.finalPicks?.[player]?.locked || isAbsent(state, player)) continue;
            const choice = Math.random() < SIM_RIGHT ? answer : wrongFor(answer);
            if (actions.boardFinalPick(state, { choice, lock:true }, as(player)).ok) moved += 1;
          }
          break;
        }
        default: break;
      }
      return moved ? ok({ moved }) : err("Nothing to play right now");
    },
  };
  return { actions, start, finish };
}
