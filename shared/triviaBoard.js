/* Trivia board: Trivia as the room's game show. The TV is the board
   (categories across, values down, Jeopardy's shape) and every phone is a
   buzzer. The commissioner picks the format on the Trivia desk
   (`state.triviaFormat`: "rounds", the default, or "board"); the same set
   list feeds both, a round becoming a column.

   A board game lives in `state.trivia` like any Trivia game, with
   `format:"board"` and its clues under `clues`. Its `questions` stays
   empty, so code written before the board ignores a board game entirely
   (a rollback leaves it inert; Restart or a progress reset clears it).

   The flow, every instant on the server clock:
     pick          whoever has control picks a cell on their phone; after
                   BOARD_PICK_MS the autopilot picks the lowest value of the
                   leftmost column (autoPickClue)
     clue          the cell fills the TV (BOARD_ZOOM_MS), the clue reads
                   (readMs), then the buzzers arm at `armAt`. Each phone
                   lights its buzzer on that instant and times its own
                   reaction from the frame it painted, so the network never
                   decides who was first. A tune's clip starts at `armAt`:
                   buzz as soon as you know it.
                   The buzzers close BUZZ_SETTLE_MS after the first buzz
                   reaches the server, or at `openUntil` with nobody in.
     answer        the fastest of the race answers: ANSWER_MS on the four
                   options on their own phone. Right: plus the value and
                   control of the board. Wrong, or out of time: minus the
                   value and that option is struck.
     clue again    the rebound: after a wrong answer the buzzers reopen for
                   everyone who has not answered this clue, armed
                   REBOUND_LEAD_MS on (reboundClock) and settled exactly as
                   the first race, the struck options standing; the fastest
                   of the new race answers. At most MAX_ATTEMPTS answers a
                   clue; nobody in, the answer stands.
     reveal        the right answer stamps; REVEAL_HOLD_MS, then the next pick
     dd-wager      the Daily Double (one hidden cell): only the picker plays,
                   wagering on their phone (DD_WAGER_MS)
     dd-clue       the clue reads and only the picker answers (DD_ANSWER_MS)
     final-wager   the board is clear: the Final's category shows and every
                   player wagers, unseen, 0 up to their score or the board's
                   top value, whichever is more (the Daily Double's floor)
     final-clue    everyone answers the Final on their own phone, unseen
     final-reveal  the TV turns each player's Final from the lowest score up
                   (finalRevealSchedule)
     final-board   the final standings; then the result posts like any
                   Trivia game (one winner, then the next two ranks)

   The game (state.trivia when format is "board"):
     { id, eventId, format:"board", startedAt, players:[player], questions:[],
       columns:[{ name, category?, clues:[clueId] }], top to bottom
       values?:[100..500],                           a question bank game's own
       clues:{ [clueId]:{ id, col, row, value, format, text, options, answer,
         photo?, clip?, source?,
         subject?, optionIds?, reveal?, media?, revealMedia?, category? } },
                   a question bank clue (docs/TRIVIA-QBANK.md, dealt by
                   shared/triviaQBank.js dealPlan) plays as "choice" with
                   its options' bank ids beside them and its media
       dd:clueId|null,                               hidden until picked
       final:{ id, category, format, text, options, answer, photo? }|null,
       control:player|null, phase, current:clueId|null, pickAt,
       played:[clueId],                              in pick order
       log:{ [clueId]:{ by, auto, pickedAt, shownAt, armAt, openUntil,
         buzzes:{ [player]:{ ms, at } }, closedAt, order:[player], turn,
         turnAt, attempts:[{ player, choice, at, right, timeout? }],
         races?:[{ armAt, openUntil, buzzes, closedAt, order }],
         mediaWait?:{ from }, mediaReadyAt?,   a media clue waiting on the TV
         mediaCue?:{ action:"replay"|"pause", at, n },   the host's last cue
         wager?, wagerAt?, revealedAt?, winner? } },
                   armAt..order are the race under way (the first, or the
                   latest rebound); `races` the ones before it, oldest
                   first; `turn` counts the clue's answers (0, 1, 2)
       finalAt:{ introAt, wagerUntil, clueAt, answerUntil, revealAt, boardAt },
       finalWagers:{ [player]:{ wager, at } },
       finalPicks:{ [player]:{ choice, at, locked, lockedAt } },
       finishedAt, ops (server only: retried writes) }

   A media clue (Oct 29): the TV shows its image, or plays its audio or
   video clip (`start` seconds in, `duration` long) from the arm, exactly
   as a tune's clip (a rebound plays it again from its own arm); phones
   never play it. The arm waits for the TV (boardMediaReady, or
   MEDIA_READY_CAP_MS). The host may replay or pause the clip
   (boardMediaCue); leaving the clue stops it. The reveal swaps in the
   clue's `revealMedia`.

   Points are trivia points, never chips, and may go below zero. Scores are
   derived from the log, never stored. Pure. */

import { disp } from "./core.js";

export const BOARD_FORMAT = "board";
export const TRIVIA_GAME_FORMATS = Object.freeze(["rounds", BOARD_FORMAT]);
export const BOARD_VALUES = Object.freeze([200, 400, 600, 800, 1000]);
/* seven: Brandon's question bank board (docs/TRIVIA-QBANK.md) */
export const BOARD_COLUMNS_MAX = 7;
/* what a buzzer can answer: four options on a phone */
export const BOARD_CLUE_FORMATS = Object.freeze(["choice", "picture", "tune"]);

/* A media clue (a bank clue's `media`: image, audio or video) is media
   first: the buzzers arm once the TV has it ready (boardMediaReady), and
   never later than MEDIA_READY_CAP_MS past their reading time. A TV's
   ready moves the arm to MEDIA_ARM_LEAD_MS after it (never before the
   reading time), so every phone hears of it before its lamp lights. */
export const MEDIA_READY_CAP_MS = 2500;
export const MEDIA_ARM_LEAD_MS = 500;
/* a clip plays at most this long; the host's replay starts this far ahead
   so every TV starts it together */
export const MEDIA_CLIP_MAX_MS = 30000;
export const MEDIA_CUE_LEAD_MS = 400;
export const MEDIA_CUE_ACTIONS = Object.freeze(["replay", "pause"]);

/* the picker's time before the autopilot picks for them */
export const BOARD_PICK_MS = 15000;
/* the picked cell fills the TV before its clue reads */
export const BOARD_ZOOM_MS = 1200;
/* a tune: the clip starts (and the buzzers arm) this long after it shows */
export const BOARD_TUNE_LEAD_MS = 1500;
/* the TV plays this much of a tune (TRIVIA_CLIP_MS) */
export const BOARD_CLIP_MS = 10000;
/* buzzers stay open this long with nobody in (a tune: its clip and two
   seconds more) */
export const BUZZ_OPEN_MS = 6000;
/* the buzzers close this long after the first buzz reaches the server, so a
   faster thumb on a slower network still counts */
export const BUZZ_SETTLE_MS = 700;
/* a phone that buzzes before its lamp locks itself out this long (local) */
export const BUZZ_LOCKOUT_MS = 500;
/* a buzz may reach the server this early on a phone whose clock runs fast */
export const BUZZ_EARLY_MS = 250;
/* a reported reaction is held to this range */
export const BUZZ_MS_MIN = 60;
export const BUZZ_MS_MAX = 15000;
/* the buzz order stands on the TV before the answer turn */
export const BUZZ_SHOW_MS = 1500;
/* one answer turn */
export const ANSWER_MS = 8000;
/* an answer that left the phone as its turn ran out still counts */
export const ANSWER_GRACE_MS = 1000;
/* the rebound: the struck answer stands this long, then the buzzers arm
   again for everyone who has not answered */
export const REBOUND_LEAD_MS = 2000;
/* answers a clue takes at most (the first race's and two rebounds') */
export const MAX_ATTEMPTS = 3;
export const REVEAL_HOLD_MS = 4500;
/* the Daily Double: the sting, the wager, a beat once it is locked, the answer */
export const DD_STING_MS = 2600;
export const DD_WAGER_MS = 15000;
export const DD_LOCKED_MS = 900;
export const DD_ANSWER_MS = 12000;
export const WAGER_STEP = 100;
export const DD_MIN = 100;
/* the Final: its category stands, the wagers, the answer, the reveal */
export const FINAL_INTRO_MS = 3000;
export const FINAL_WAGER_MS = 25000;
export const FINAL_ANSWER_MS = 30000;
export const FINAL_GRACE_MS = 2000;
export const FINAL_ALL_IN_MS = 1500;
export const FINAL_REVEAL_STEP_MS = 3200;
/* a player who wagered nothing turns quicker */
export const FINAL_REVEAL_QUICK_MS = 1400;
export const FINAL_REVEAL_TAIL_MS = 1500;
export const FINAL_BOARD_HOLD_MS = 12000;
export const FINAL_PHASES = Object.freeze(["final-wager", "final-clue", "final-reveal", "final-board"]);
export const BOARD_PHASES = Object.freeze(["pick", "clue", "answer", "reveal", "dd-wager", "dd-clue", ...FINAL_PHASES]);

const num = value => Number(value) || 0;

export const isBoardGame = game => game?.format === BOARD_FORMAT && !!game.clues && typeof game.clues === "object";
/* the format a new game would start in */
export const triviaFormatOf = state => state?.triviaFormat === BOARD_FORMAT ? BOARD_FORMAT : "rounds";
export const boardPlayers = game => Array.isArray(game?.players) ? game.players : [];
export const boardPlays = (game, player) => !!player && boardPlayers(game).includes(player);
/* the game's players still in the room */
export const boardActive = (state, game = state?.trivia) => boardPlayers(game).filter(player => !state?.away?.[player]);
export const boardClue = (game, id = game?.current) => (id && game?.clues?.[id]) || null;
export const boardLog = (game, id = game?.current) => (id && game?.log?.[id]) || null;
export const isDailyDouble = (game, id = game?.current) => !!id && game?.dd === id;
export const boardPlayed = (game, id) => (game?.played || []).includes(id);

/* every clue in reading order: the top row left to right, then the next */
export function boardCells(game) {
  const columns = Array.isArray(game?.columns) ? game.columns : [];
  const rows = Math.max(0, ...columns.map(column => (column?.clues || []).length));
  const out = [];
  for (let row = 0; row < rows; row++) columns.forEach(column => { const id = column?.clues?.[row]; if (id) out.push(id); });
  return out;
}
export const cellsLeft = game => boardCells(game).filter(id => !boardPlayed(game, id));
/* the autopilot's pick: the lowest value left, leftmost first */
export const autoPickClue = game => cellsLeft(game)[0] || null;
/* the game's values down a column: its own (a question bank board plays
   100 to 500), else the set list's 200 to 1,000 */
export const boardValues = game => Array.isArray(game?.values) && game.values.length ? game.values : BOARD_VALUES;
export const boardTopValue = game => Math.max(Math.max(...boardValues(game)) || 0,
  ...Object.values(game?.clues || {}).map(clue => num(clue?.value)));

/* a clue's media (a bank clue's image, audio or video), and a clip: the
   audio or video the TV plays, `start` seconds in for `duration` */
export const clueMedia = clue => clue?.media && typeof clue.media === "object" && clue.media.src ? clue.media : null;
export const isClipClue = clue => ["audio", "video"].includes(clueMedia(clue)?.kind);
export const clipMs = clue => isClipClue(clue)
  ? Math.max(500, Math.min(MEDIA_CLIP_MAX_MS, Math.round(num(clue.media.duration) * 1000) || BOARD_CLIP_MS)) : 0;

/* how long a clue reads before its buzzers arm */
export function readMs(clue) {
  if (!clue) return 0;
  if (clue.format === "tune") return BOARD_TUNE_LEAD_MS;
  const length = String(clue.text || "").length;
  /* a clip: the prompt (it says what kind of answer) reads, then it plays */
  if (isClipClue(clue)) return Math.max(BOARD_TUNE_LEAD_MS, Math.min(3500, 1000 + 30 * length));
  if (clue.format === "picture" || clueMedia(clue)) return Math.min(5000, 2500 + 30 * length);
  return Math.max(3000, Math.min(7000, 2000 + 45 * length));
}
/* how long the buzzers stay open with nobody in (a clip: all of it and
   two seconds more) */
export const openMs = clue => clue?.format === "tune" ? BOARD_CLIP_MS + 2000 : isClipClue(clue) ? clipMs(clue) + 2000 : BUZZ_OPEN_MS;

/* A clue's clock from the instant it was picked (the pick write stamps
   these into the log): { shownAt, armAt, openUntil }. A media clue arms
   at the cap and waits for the TV (`mediaWait`: from its reading time;
   boardMediaReady brings the arm forward). */
export function clueClock(clue, pickedAt) {
  const shownAt = num(pickedAt) + BOARD_ZOOM_MS;
  const read = shownAt + readMs(clue);
  if (!clueMedia(clue)) return { shownAt, armAt:read, openUntil:read + openMs(clue) };
  const armAt = read + MEDIA_READY_CAP_MS;
  return { shownAt, armAt, openUntil:armAt + openMs(clue), mediaWait:{ from:read } };
}
/* The arm once the TV reports the media ready at `at`: a beat on, never
   before the reading time, never later than it stood. */
export function mediaReadyArm(log, at) {
  const from = num(log?.mediaWait?.from);
  return Math.min(num(log?.armAt), Math.max(from, num(at) + MEDIA_ARM_LEAD_MS));
}
/* When the clue's clip starts playing on the TV (server clock), or 0: from
   the arm of the race under way (a rebound plays it again from its own
   arm), the Daily Double's from its answer turn, the host's replay from
   his cue; his pause stops it. { at, from, ms, paused } */
export function clipStart(game, id = game?.current) {
  const clue = boardClue(game, id), log = boardLog(game, id);
  if (!isClipClue(clue) || !log) return null;
  const anchor = isDailyDouble(game, id) ? num(log.turnAt) : num(log.armAt);
  const cue = log.mediaCue;
  const ms = clipMs(clue);
  if (cue && num(cue.at) >= anchor) return { at:num(cue.at), ms, paused:cue.action === "pause", cue:num(cue.n) };
  return anchor ? { at:anchor, ms, paused:false, cue:num(cue?.n) } : null;
}
/* A rebound's clock from the wrong answer (or the turn running out) that
   opened it: the buzzers arm again a beat later and stay open as long as
   the first race's (a tune's clip plays again from the new arm). */
export function reboundClock(clue, at) {
  const armAt = num(at) + REBOUND_LEAD_MS;
  return { armAt, openUntil:armAt + openMs(clue) };
}

/* which race the buzzers are on: 0 the first, 1 and 2 the rebounds */
export const boardRace = log => Array.isArray(log?.races) ? log.races.length : 0;
export const isRebound = log => boardRace(log) > 0;
/* a race's buzzes: the one under way, or an earlier one by its number */
export const raceBuzzes = (log, race = boardRace(log)) => (race === boardRace(log) ? log?.buzzes : log?.races?.[race]?.buzzes) || {};
/* who has answered this clue (a turn that ran out included): they never
   buzz on it again */
export const answeredOn = log => new Set((log?.attempts || []).map(attempt => attempt.player));
/* who may still buzz on a rebound: everyone here in the game who has not
   answered it */
export const reboundPlayers = (state, game = state?.trivia, id = game?.current) => {
  const answered = answeredOn(boardLog(game, id));
  return boardActive(state, game).filter(player => !answered.has(player));
};

/* when the buzzers close: a beat after the first buzz reached the server,
   or when the window runs out with nobody in (the race under way) */
export function buzzCloseAt(log) {
  if (!log) return 0;
  const first = Math.min(...Object.values(log.buzzes || {}).map(buzz => num(buzz?.at)).filter(Boolean));
  const until = num(log.openUntil);
  return Number.isFinite(first) ? Math.min(until, first + BUZZ_SETTLE_MS) : until;
}
/* the buzz order: the fastest reaction first, a tie to whoever reached the
   server first (the race under way) */
export function buzzOrder(log) {
  return Object.entries(log?.buzzes || {})
    .map(([player, buzz]) => ({ player, ms:num(buzz?.ms), at:num(buzz?.at) }))
    .sort((a, b) => a.ms - b.ms || a.at - b.at || a.player.localeCompare(b.player))
    .map(row => row.player);
}
/* a player's buzz on a clue: the race under way's, else their latest */
export function buzzOf(log, player) {
  if (log?.buzzes?.[player]) return log.buzzes[player];
  for (const race of [...(log?.races || [])].reverse()) if (race?.buzzes?.[player]) return race.buzzes[player];
  return null;
}
export const clampBuzzMs = ms => Math.round(Math.max(BUZZ_MS_MIN, Math.min(BUZZ_MS_MAX, num(ms) || BUZZ_MS_MAX)));
/* Who answers now: the fastest of the race (the Daily Double: the picker).
   A log from before the rebound (no `races`) passed the turn down its one
   order, so `turn` still indexes it there. */
export const turnPlayer = log => log?.order?.[Array.isArray(log.races) ? 0 : num(log.turn)] || null;
export const turnMs = (game, id = game?.current) => isDailyDouble(game, id) ? DD_ANSWER_MS : ANSWER_MS;
export function turnUntil(game, id = game?.current) {
  const log = boardLog(game, id);
  return log?.turnAt ? num(log.turnAt) + turnMs(game, id) : 0;
}
/* how many answers a clue takes: MAX_ATTEMPTS (a Daily Double: one) */
export const attemptsAllowed = (game, id = game?.current) => isDailyDouble(game, id) ? 1 : MAX_ATTEMPTS;
/* options already struck on this clue */
export const struckChoices = log => new Set((log?.attempts || []).filter(attempt => !attempt.right && Number.isInteger(attempt.choice))
  .map(attempt => attempt.choice));

/* what a clue is worth to whoever answers it: its value, or the wager */
export const clueStake = (game, id) => isDailyDouble(game, id) ? num(game?.log?.[id]?.wager) : num(game?.clues?.[id]?.value);
/* one clue's effect on each player who answered it */
export function clueDeltas(game, id) {
  const stake = clueStake(game, id);
  const out = {};
  for (const attempt of game?.log?.[id]?.attempts || []) out[attempt.player] = (out[attempt.player] || 0) + (attempt.right ? stake : -stake);
  return out;
}

/* the Final counts once the TV starts turning it */
export const finalShown = game => game?.phase === "final-reveal" || game?.phase === "final-board" || !!game?.finishedAt;
const floorStep = value => Math.floor(num(value) / WAGER_STEP) * WAGER_STEP;
/* A Daily Double risks up to the score, or the board's top value when the
   score is lower. The Final the same, from 0: everyone plays it, so a
   score at or below zero can still win up to the board's top value. */
export const ddMax = (score, top = BOARD_VALUES[BOARD_VALUES.length - 1]) => Math.max(top, floorStep(score));
export const ddDefault = (score, top) => Math.max(DD_MIN, floorStep(ddMax(score, top) / 2));
export const finalMax = (score, top = BOARD_VALUES[BOARD_VALUES.length - 1]) => ddMax(score, top);
export const validWager = (wager, min, max) => Number.isInteger(wager) && wager >= min && wager <= max && wager % WAGER_STEP === 0;

/* Totals, best first: { player, order, score, preFinal, right, wrong,
   buzzes, speed, final, played, rank }. `preFinal` is the score before the
   Final, which counts once it is shown (finalShown). `played`: the player
   did something themselves (buzzed, answered, picked a cell, wagered a
   Daily Double, answered the shown Final); a turn that only ran out on
   them, like a Daily Double the autopilot picked for an idle picker, is
   not playing. A tie breaks on more right answers, then the faster sum of
   the reactions that won a clue, then the order players joined. */
export function boardStandings(game) {
  const rows = boardPlayers(game).map((player, order) => ({ player, order, score:0, preFinal:0, right:0, wrong:0, buzzes:0,
    speed:0, final:null, played:false }));
  const by = new Map(rows.map(row => [row.player, row]));
  const acted = new Set();
  for (const id of game?.played || []) {
    const log = game.log?.[id];
    if (!log) continue;
    const stake = clueStake(game, id);
    if (log.by && (!log.auto || log.wagerAt)) acted.add(log.by);
    /* a buzz in any race of the clue (a clue counts once) */
    const buzzed = new Set([...(log.races || []).flatMap(race => Object.keys(race?.buzzes || {})), ...Object.keys(log.buzzes || {})]);
    for (const player of buzzed) { const row = by.get(player); if (row) { row.buzzes += 1; acted.add(player); } }
    for (const attempt of log.attempts || []) {
      const row = by.get(attempt.player);
      if (!row) continue;
      if (Number.isInteger(attempt.choice)) acted.add(attempt.player);
      if (attempt.right) {
        row.score += stake; row.right += 1;
        row.speed += num(buzzOf(log, attempt.player)?.ms);
      } else { row.score -= stake; row.wrong += 1; }
    }
  }
  for (const row of rows) row.preFinal = row.score;
  if (finalShown(game) && game.final) {
    const top = boardTopValue(game);
    for (const row of rows) {
      const pick = game.finalPicks?.[row.player];
      const answered = Number.isInteger(pick?.choice);
      const wager = Math.min(finalMax(row.preFinal, top), num(game.finalWagers?.[row.player]?.wager));
      const right = answered && pick.choice === game.final.answer;
      row.final = { wager, choice:answered ? pick.choice : null, right };
      row.score += right ? wager : -wager;
      if (answered) { if (right) row.right += 1; else row.wrong += 1; }
    }
  }
  for (const row of rows) row.played = acted.has(row.player) || Number.isInteger(row.final?.choice);
  rows.sort((a, b) => b.score - a.score || b.right - a.right || a.speed - b.speed || a.order - b.order);
  let rank = 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    rank = prev && prev.score === row.score && prev.right === row.right && prev.speed === row.speed ? rank : i + 1;
    row.rank = rank;
  });
  return rows;
}
/* one player's score as it stands (the Final not yet shown: before it) */
export const boardScore = (game, player) => boardStandings(game).find(row => row.player === player)?.score || 0;

/* the event result: one winner (the ranking already broke ties), then the
   next two ranks; nobody who never played places */
export function boardResultSlots(rows) {
  const order = (rows || []).filter(row => row.played);
  if (!order.length) return null;
  const rest = order.slice(1);
  const ranks = [...new Set(rest.map(row => row.rank))].slice(0, 2);
  return [[order[0].player], ...ranks.map(rank => rest.filter(row => row.rank === rank).map(row => row.player))];
}

/* who wagers on the Final: everyone in the game still here, whatever their
   score (a present roster player not in it yet joins on their wager) */
export function finalEligible(state, game = state?.trivia) {
  return boardActive(state, game);
}

/* The Final turns player by player from the lowest score up, a player who
   wagered nothing quicker; anyone who never played and gave no Final is
   left out. [{ player, at, ms }] with `at` from finalAt.revealAt. */
export function finalRevealSchedule(game) {
  const top = boardTopValue(game);
  const rows = boardStandings({ ...game, phase:"final-clue", finishedAt:null })
    .filter(row => row.played || Number.isInteger(game?.finalPicks?.[row.player]?.choice) || game?.finalWagers?.[row.player])
    .sort((a, b) => a.preFinal - b.preFinal || a.order - b.order);
  let at = 0;
  return rows.map(row => {
    const wager = Math.min(finalMax(row.preFinal, top), num(game?.finalWagers?.[row.player]?.wager));
    const ms = wager > 0 ? FINAL_REVEAL_STEP_MS : FINAL_REVEAL_QUICK_MS;
    const step = { player:row.player, at, ms };
    at += ms;
    return step;
  });
}
export const finalRevealMs = game => finalRevealSchedule(game).reduce((sum, step) => sum + step.ms, 0);

/* The board from the set list's rounds, each already turned into its
   questions (worker/trivia.js roundQuestions, options dealt): a column per
   round, up to BOARD_COLUMNS_MAX; each its first BOARD_VALUES.length
   questions a buzzer can answer, easiest first where the bank rated them
   (`level`; a round of his own keeps its written order); values by row. One
   Daily Double, on a cell worth 600 or more where there is one.
   Returns { columns, clues, dd }. */
const levelOf = question => Number.isFinite(Number(question?.level)) ? Number(question.level) : 3;
export function dealBoard(rounds, { gameId = "tb", random = Math.random } = {}) {
  const columns = [], clues = {};
  for (const round of rounds || []) {
    if (columns.length >= BOARD_COLUMNS_MAX) break;
    const usable = (round?.questions || []).filter(question => BOARD_CLUE_FORMATS.includes(question?.format)
      && Array.isArray(question.options) && question.options.length === 4 && Number.isInteger(question.answer));
    const ordered = usable.map((question, i) => ({ question, i }))
      .sort((a, b) => levelOf(a.question) - levelOf(b.question) || a.i - b.i)
      .slice(0, BOARD_VALUES.length).map(item => item.question);
    if (!ordered.length) continue;
    const col = columns.length;
    const ids = ordered.map((question, row) => {
      const id = `${gameId}-${col}${row}`;
      const { id:source, level, round:_round, ...rest } = question;
      clues[id] = { ...rest, id, col, row, value:BOARD_VALUES[row], ...(source ? { source } : {}) };
      return id;
    });
    columns.push({ name:String(round?.name || "").slice(0, 32), clues:ids });
  }
  const all = columns.flatMap(column => column.clues);
  const deep = all.filter(id => clues[id].row >= 2);
  const pool = deep.length ? deep : all;
  const dd = pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
  return { columns, clues, dd };
}

/* the buzzers' close for a race: the first race's as it always was, a
   rebound's with its number */
const closePayload = (clueId, race) => race ? { clueId, race } : { clueId };

/* The next write the game makes on its own, and when: { at, from, type,
   payload, key }, or null. Every beat is a commissioner write the pill
   also offers (boardBeat), so a tap takes it early; `key` names it once. */
export function boardAutoBeat(state) {
  const game = state?.trivia;
  if (!isBoardGame(game) || game.finishedAt || state.results?.[game.eventId] || !Array.isArray(game.players)) return null;
  const beat = (at, type, payload, step, from = null) => ({ at:num(at), from:from ? num(from) : null, type, payload,
    key:`board:${game.id}:${step}` });
  const id = game.current;
  const log = boardLog(game);
  const t = game.finalAt || {};
  switch (game.phase) {
    case "pick": {
      const next = autoPickClue(game);
      return next ? beat(num(game.pickAt) + BOARD_PICK_MS, "boardPick", { clueId:next, auto:true },
        `pick${(game.played || []).length}`, game.pickAt) : null;
    }
    case "clue": {
      /* each race closes on its own write: a rebound names its race, so an
         earlier race's close can never close it */
      const race = boardRace(log);
      return log ? beat(buzzCloseAt(log), "boardCloseBuzz", closePayload(id, race), race ? `${id}:close${race}` : `${id}:close`,
        log.armAt) : null;
    }
    case "answer":
    case "dd-clue":
      return log?.turnAt ? beat(turnUntil(game) + ANSWER_GRACE_MS, "boardTimeout", { clueId:id, turn:num(log.turn) },
        `${id}:turn${num(log.turn)}`, log.turnAt) : null;
    case "reveal":
      return log ? beat(num(log.revealedAt) + REVEAL_HOLD_MS, "boardNext", { clueId:id }, `${id}:next`, log.revealedAt) : null;
    case "dd-wager":
      return log ? beat(log.wagerAt ? num(log.wagerAt) + DD_LOCKED_MS : num(log.pickedAt) + DD_STING_MS + DD_WAGER_MS,
        "boardDdClue", { clueId:id }, `${id}:dd`, log.pickedAt) : null;
    case "final-wager": {
      const eligible = finalEligible(state, game);
      const wagers = game.finalWagers || {};
      let at = num(t.wagerUntil);
      if (!eligible.length) at = num(t.introAt) + FINAL_INTRO_MS;
      else if (eligible.every(player => wagers[player])) at = Math.min(at, Math.max(num(t.introAt) + FINAL_INTRO_MS,
        Math.max(...eligible.map(player => num(wagers[player].at))) + FINAL_ALL_IN_MS));
      return beat(at, "boardFinalClue", {}, "final:clue", t.introAt);
    }
    case "final-clue": {
      const active = boardActive(state, game);
      const picks = game.finalPicks || {};
      let at = num(t.answerUntil) + FINAL_GRACE_MS;
      if (active.length && active.every(player => picks[player]?.locked)) at = Math.min(at, Math.max(num(t.clueAt),
        Math.max(...active.map(player => num(picks[player].lockedAt))) + FINAL_ALL_IN_MS));
      return beat(at, "boardFinalReveal", {}, "final:reveal", t.clueAt);
    }
    case "final-reveal":
      return beat(num(t.revealAt) + finalRevealMs(game) + FINAL_REVEAL_TAIL_MS, "boardFinalBoard", {}, "final:board", t.revealAt);
    case "final-board":
      return beat(num(t.boardAt) + FINAL_BOARD_HOLD_MS, "triviaFinish", { evId:game.eventId }, "finish", t.boardAt);
    default:
      return null;
  }
}

/* The director pill's beat for a board game under way: each the write the
   autopilot would make, as a skip-ahead. { type:"board-step", label,
   subject, write, payload }, or the ordinary "trivia-finish" at the end. */
export function boardBeat(state, ev) {
  const game = state?.trivia;
  if (!isBoardGame(game) || game.eventId !== ev?.id || state.results?.[ev.id]) return null;
  const name = player => player ? disp(state, player) : "";
  const id = game.current, log = boardLog(game), clue = boardClue(game);
  const cell = clue ? `${game.columns?.[clue.col]?.name || "Trivia"} ${clue.value}` : "";
  /* a clip clue up: the host's Replay clip and Pause clip in the tray */
  const clip = ["clue", "answer", "dd-clue"].includes(game.phase) && isClipClue(clue)
    ? [{ label:"Replay clip", write:"boardMediaCue", payload:{ clueId:id, action:"replay" } },
      { label:"Pause clip", write:"boardMediaCue", payload:{ clueId:id, action:"pause" } }] : null;
  const step = (label, subject, write, payload) => ({ type:"board-step", label, subject, write, payload, ...(clip ? { tray:clip } : {}) });
  switch (game.phase) {
    case "pick": {
      /* the autopilot's own pick (its payload too), so the pill draws its
         wait and a tap takes exactly that write early */
      const next = autoPickClue(game);
      return next ? step("Pick", `${name(game.control)}'s pick`, "boardPick", { clueId:next, auto:true }) : null;
    }
    case "clue": return step("Close buzzers", cell, "boardCloseBuzz", closePayload(id, boardRace(log)));
    case "answer": return step("Time", `${name(turnPlayer(log))} answering`, "boardTimeout", { clueId:id, turn:num(log?.turn) });
    case "dd-wager": return step("Show the clue", `Daily Double, ${name(log?.by)}`, "boardDdClue", { clueId:id });
    case "dd-clue": return step("Time", `${name(log?.by)} answering`, "boardTimeout", { clueId:id, turn:0 });
    case "reveal": {
      const left = cellsLeft(game).length;
      return step("Next", left ? `${left} left` : game.final ? "Final" : "Final scores", "boardNext", { clueId:id });
    }
    case "final-wager": return step("Show the Final", game.final?.category || "Final", "boardFinalClue", {});
    case "final-clue": return step("Reveal", "Final", "boardFinalReveal", {});
    case "final-reveal": return step("Final scores", ev.name, "boardFinalBoard", {});
    case "final-board": return { type:"trivia-finish", label:"Post result", subject:ev.name };
    default: return null;
  }
}

/* What a phone or the TV is sent. The commissioner gets everything unless
   he plays in it: then he plays blind like anyone. Everyone else gets:
   every cell's place and value; a picked clue's text, options and photo
   (a tune's recording never); its answer once revealed; the Daily Double
   once picked; each clue's log, a live buzz window carrying only who is in
   (your own reaction yours); the Final's category in its wager phase, the
   clue from its answer phase, the answer from the reveal; Final wagers and
   picks your own until the reveal, everyone's from then. */
export function projectBoard(game, { isGm = false, player = null } = {}) {
  if (!isBoardGame(game)) return null;
  const { ops, ...rest } = game;
  const total = boardCells(game).length;
  if (isGm && !boardPlays(game, player)) return { ...rest, questions:[], total };
  const played = new Set(game.played || []);
  const clues = {};
  for (const [id, clue] of Object.entries(game.clues || {})) {
    const base = { id, col:clue.col, row:clue.row, value:clue.value };
    if (!played.has(id)) { clues[id] = base; continue; }
    /* a bank clue: its subject, media and option ids once picked; the
       answer, its reveal text and reveal media once revealed */
    const revealed = !!game.log?.[id]?.revealedAt;
    clues[id] = { ...base, format:clue.format, text:clue.text || "", options:clue.options,
      ...(clue.optionIds ? { optionIds:clue.optionIds } : {}), ...(clue.subject ? { subject:clue.subject } : {}),
      ...(clue.media ? { media:clue.media } : {}),
      ...(clue.photo ? { photo:clue.photo } : {}), ...(game.dd === id ? { dd:true } : {}),
      ...(revealed ? { answer:clue.answer, ...(clue.reveal ? { reveal:clue.reveal } : {}),
        ...(clue.revealMedia ? { revealMedia:clue.revealMedia } : {}) } : {}) };
  }
  const log = {};
  for (const id of game.played || []) {
    const entry = game.log?.[id];
    if (!entry) continue;
    const open = game.current === id && game.phase === "clue" && !entry.closedAt;
    log[id] = open ? { ...entry, buzzes:Object.fromEntries(Object.entries(entry.buzzes || {})
      .map(([who, buzz]) => [who, who === player ? buzz : { in:true }])) } : entry;
  }
  const stage = FINAL_PHASES.indexOf(game.phase);
  const shown = finalShown(game);
  const final = !game.final || stage < 0 ? null
    : stage === 0 ? { id:game.final.id, category:game.final.category }
      : { id:game.final.id, category:game.final.category, format:game.final.format, text:game.final.text || "",
        options:game.final.options, ...(game.final.photo ? { photo:game.final.photo } : {}),
        ...(shown ? { answer:game.final.answer } : {}) };
  const mine = (map, cover) => Object.fromEntries(Object.entries(map || {})
    .map(([who, value]) => [who, shown || who === player ? value : cover(value)]));
  const { dd, clues:_c, log:_l, final:_f, finalWagers, finalPicks, ...open } = rest;
  return { ...open, questions:[], total, clues, log, final,
    ...(dd && played.has(dd) ? { dd } : {}),
    finalWagers:mine(finalWagers, () => ({ locked:true })),
    finalPicks:mine(finalPicks, value => ({ locked:!!value?.locked, set:Number.isInteger(value?.choice) })) };
}
