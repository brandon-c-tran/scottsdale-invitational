/* Trivia on a phone or the TV, as data, from the frame that viewer was sent
   (shared/trivia.js projectTrivia). Pure; `now` is the server clock. */
import { isActivePlayer, isAway } from "../../../shared/core.js";
import {
  TRIVIA_CLIP_MS, durationOf, hasAnswer, scoreQuestion, triviaCurrent, triviaFinished, triviaLast, triviaPlayers, triviaRoundEnd,
  triviaRoundOf, triviaStandings, triviaTotal,
} from "../../../shared/trivia.js";

export const LETTERS = Object.freeze(["A", "B", "C", "D"]);
/* a frame's photo is { id, w, h } (the Worker keeps nothing else); a
   rehearsal page may hand a stand-in `src` */
export const triviaPhotoSrc = photo => photo?.src || (photo?.id ? `/api/trivia/photo/${encodeURIComponent(photo.id)}` : null);
export const fmtNumber = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "";
/* "29,032 feet", or a year as written */
export function numberLabel(value, unit = "") {
  if (!Number.isFinite(Number(value))) return "";
  const plain = !unit && value >= 1000 && value <= 2100 ? String(value) : fmtNumber(value);
  return unit ? `${plain} ${unit}` : plain;
}
export const ordinal = n => {
  const k = n % 100;
  return `${n}${k >= 11 && k <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
};

/* The current question, what this viewer may do, and once revealed how the
   room did; null when no game is running. `room` is every player in the
   game in the order they joined, each with their pick (or only locked/set
   before the reveal), their score on this question and their row. */
export function triviaView(state, me = null, now = Date.now()) {
  const game = state?.trivia;
  if (!game?.questions?.length) return null;
  const question = triviaCurrent(game);
  if (!question) return null;
  const time = game.times?.[question.id] || {};
  const duration = durationOf(question);
  const startsAt = Number(time.startsAt) || 0, closesAt = Number(time.closesAt) || 0;
  const players = triviaPlayers(game);
  const picks = game.picks?.[question.id] || {};
  const revealed = game.phase !== "question" && question.answer !== undefined;
  const scores = revealed ? scoreQuestion(question, picks, players, time) : null;
  const roundIndex = triviaRoundOf(game);
  const round = game.rounds?.[roundIndex] || null;
  const standings = triviaStandings(game);
  const rowOf = new Map(standings.map(row => [row.player, row]));
  const room = players.map(player => {
    const pick = picks[player] || null;
    return { player, pick, locked:!!pick?.locked, set:!!pick && (pick.set || hasAnswer(question, pick)),
      away:isAway(state, player), score:scores?.[player] || null, row:rowOf.get(player) || null, mine:player === me };
  });
  const inRoom = room.filter(lane => !lane.away);
  /* a present player missing from the list joins on their first pick */
  const playing = !!me && !isAway(state, me) && Array.isArray(game.players)
    && (players.includes(me) || isActivePlayer(me, state));
  /* the reveal: who chose each option */
  const chose = question.options ? question.options.map((_, i) => room.filter(lane => revealed && lane.pick?.choice === i)) : [];
  const left = closesAt - now;
  return {
    game, question, phase:game.phase, index:game.index, n:game.index + 1, total:triviaTotal(game),
    round, roundIndex, rounds:game.rounds || [], roundN:round ? game.index - round.first + 1 : 1,
    duration, openedAt:Number(time.openedAt) || 0, startsAt, closesAt, revealedAt:Number(time.revealedAt) || 0,
    leading:now < startsAt, left, secondsLeft:Math.max(0, Math.ceil(Math.min(duration, left) / 1000)), timeUp:left <= 0,
    clipLive:question.format === "tune" && now >= startsAt && now < startsAt + TRIVIA_CLIP_MS && game.phase === "question",
    playing, mine:me ? picks[me] || null : null, myScore:me && scores ? scores[me] || null : null, myRow:me ? rowOf.get(me) || null : null,
    room, chose, lockedCount:inRoom.filter(lane => lane.locked).length, roomCount:inRoom.length,
    revealed, scores, standings, last:triviaLast(game), roundEnd:triviaRoundEnd(game), board:game.phase === "board",
    finished:triviaFinished(state),
  };
}

/* A closest-number reveal: every guess, nearest first */
export const nearestGuesses = view => view.room.filter(lane => lane.score?.answered)
  .sort((a, b) => a.score.off - b.score.off || (a.score.ms ?? Infinity) - (b.score.ms ?? Infinity));

/* The top of a board, and your row below it when you are further down:
   { top, mine } (mine is null when you are in the top or not playing). */
export function boardTop(standings, me, n = 5) {
  const top = standings.slice(0, n);
  const mine = me && !top.some(row => row.player === me) ? standings.find(row => row.player === me) || null : null;
  return { top, mine };
}

/* a number spread over N digit wheels, and back */
export const toDigits = (value, digits) => String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(digits, "0").slice(-digits)
  .split("").map(Number);
export const fromDigits = list => Number(list.join("")) || 0;
