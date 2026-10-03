/* Trivia on a phone or the TV, as data, from the frame that viewer was sent
   (shared/trivia.js projectTrivia). Pure; `now` is the server clock. */
import { isAway } from "../../../shared/core.js";
import {
  TRIVIA_CLIP_MS, durationOf, hasAnswer, scoreQuestion, triviaCurrent, triviaFinished, triviaLast, triviaRoundEnd, triviaRoundOf,
  triviaStandings, triviaTeamOf, triviaTotal,
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
/* a team's color is its first member's, as at the draw */
export const teamColor = (state, team) => state?.profiles?.[team?.players?.[0]]?.color || "var(--muted2)";

/* the current question, what this viewer may do, and once revealed how
   every team did; null when no game is running */
export function triviaView(state, me = null, now = Date.now()) {
  const game = state?.trivia;
  if (!game?.questions?.length) return null;
  const question = triviaCurrent(game);
  if (!question) return null;
  const time = game.times?.[question.id] || {};
  const duration = durationOf(question);
  const startsAt = Number(time.startsAt) || 0, closesAt = Number(time.closesAt) || 0;
  const team = triviaTeamOf(game, me);
  const picks = game.picks?.[question.id] || {};
  const revealed = game.phase !== "question" && question.answer !== undefined;
  const scores = revealed ? scoreQuestion(question, picks, game.teams, time) : null;
  const roundIndex = triviaRoundOf(game);
  const round = game.rounds?.[roundIndex] || null;
  const standings = triviaStandings(game);
  const lanes = game.teams.map(item => {
    const pick = picks[item.key] || null;
    return { ...item, pick, locked:!!pick?.locked, set:!!pick && (pick.set || hasAnswer(question, pick)),
      score:scores?.[item.key] || null, row:standings.find(row => row.key === item.key) || null, mine:team?.key === item.key };
  });
  const left = closesAt - now;
  return {
    game, question, phase:game.phase, index:game.index, n:game.index + 1, total:triviaTotal(game),
    round, roundIndex, rounds:game.rounds || [], roundN:round ? game.index - round.first + 1 : 1,
    duration, openedAt:Number(time.openedAt) || 0, startsAt, closesAt, revealedAt:Number(time.revealedAt) || 0,
    leading:now < startsAt, left, secondsLeft:Math.max(0, Math.ceil(Math.min(duration, left) / 1000)), timeUp:left <= 0,
    clipLive:question.format === "tune" && now >= startsAt && now < startsAt + TRIVIA_CLIP_MS && game.phase === "question",
    team, playing:!!team && !isAway(state, me), mine:team ? picks[team.key] || null : null,
    myScore:team && scores ? scores[team.key] : null,
    lanes, lockedCount:lanes.filter(lane => lane.locked).length,
    revealed, scores, standings, last:triviaLast(game), roundEnd:triviaRoundEnd(game), board:game.phase === "board",
    finished:triviaFinished(state),
  };
}

/* the reveal's order of teams: best this question first */
export const revealOrder = view => [...(view?.lanes || [])]
  .sort((a, b) => (b.score?.points || 0) - (a.score?.points || 0) || a.key - b.key);

/* a number spread over N digit wheels, and back */
export const toDigits = (value, digits) => String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(digits, "0").slice(-digits)
  .split("").map(Number);
export const fromDigits = list => Number(list.join("")) || 0;
