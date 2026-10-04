/* Trivia: four teams of three answer on their phones, the TV asks. Every
   teammate sees the team's one answer card live and any of them can change
   it until one of them locks it in. Four formats: multiple choice, closest
   number, name that tune (the TV plays a clip) and picture (a photo on the
   TV). A right answer scores more the sooner the team locked.

   Two keys:
   - `state.triviaRounds` is the commissioner's set list, in play order:
       { id, source:"bank", category, picks:[bankQuestionId] }
       { id, source:"custom", name, questions:[question] }
     Configuration, kept by a progress reset like geoRounds. Bank questions
     live only in the Worker (worker/triviaBank.js), never in a client
     bundle; a bank round here is a reference.
   - `state.trivia` is the game in progress, its questions copied in at the
     start (answers and all, so editing the set list never changes a game):
       { id, eventId, startedAt, index, phase:"question"|"reveal"|"board",
         teams:[{ key, name, players }], rounds:[{ name, first, count }],
         questions:[{ id, round, format, text, options, answer, unit, digits,
           photo, clip }],
         times:{ [qid]:{ openedAt, startsAt, closesAt, revealedAt } },
         picks:{ [qid]:{ [teamKey]:{ choice|value, by, at, locked, lockedAt,
           lockedBy } } },
         ops (server only: retried writes), finishedAt }
     Progress, cleared by a reset.

   A question: choice and picture have four string options and an answer
   index; tune has four { title, artist } options and an answer index, and
   `clip` names the recording the TV plays; number has an integer answer, a
   unit and how many digit wheels the phone shows. Pure. */

export const TRIVIA_FORMATS = Object.freeze(["choice", "number", "tune", "picture"]);
export const TRIVIA_FORMAT_NAMES = Object.freeze({ choice:"Multiple choice", number:"Closest number", tune:"Name that tune",
  picture:"Picture" });
/* the clock, per format, once the question has stamped */
export const TRIVIA_MS = Object.freeze({ choice:20000, tune:20000, picture:20000, number:30000 });
/* the question number stamps and the room reads before the clock runs */
export const TRIVIA_LEAD_MS = 2500;
/* a pick that left the phone as time ran out still counts */
export const TRIVIA_GRACE_MS = 3000;
/* the TV plays this much of a tune, from its clip's start */
export const TRIVIA_CLIP_MS = 10000;
export const TRIVIA_BASE = 500;
export const TRIVIA_SPEED = 500;
/* closest number: the nearest team, the next nearest, and a bull's-eye */
export const TRIVIA_NEAR = Object.freeze([1000, 500]);
export const TRIVIA_EXACT = 250;
export const TRIVIA_MAX_ROUNDS = 12;
export const TRIVIA_MAX_QUESTIONS = 15;
export const TRIVIA_TEXT_MAX = 160;
export const TRIVIA_OPTION_MAX = 60;
export const TRIVIA_NAME_MAX = 32;
export const TRIVIA_UNIT_MAX = 24;
export const TRIVIA_DIGITS_MIN = 1;
export const TRIVIA_DIGITS_MAX = 7;

const ROUND_ID = /^t[a-z0-9]{6,32}$/;
const QUESTION_ID = /^q[a-z0-9]{6,32}$/;
const PHOTO_ID = /^p[a-z0-9]{6,40}$/;
export const triviaRoundId = value => typeof value === "string" && ROUND_ID.test(value);
export const triviaQuestionId = value => typeof value === "string" && QUESTION_ID.test(value);
export const triviaPhotoId = value => typeof value === "string" && PHOTO_ID.test(value);

const clip = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
export const digitsFor = n => Math.max(1, String(Math.abs(Math.trunc(Number(n) || 0))).length);
/* the wheels never give the answer's size away: four at least */
export const defaultDigits = n => Math.min(TRIVIA_DIGITS_MAX, Math.max(4, digitsFor(n)));

/* A custom question as the desk sends it, cleaned, or { error }. */
export function cleanTriviaQuestion(input) {
  if (!input || typeof input !== "object") return { error:"Bad question" };
  const format = TRIVIA_FORMATS.includes(input.format) ? input.format : null;
  if (!format) return { error:"Pick a format" };
  if (!triviaQuestionId(input.id)) return { error:"Bad question" };
  const text = clip(input.text, TRIVIA_TEXT_MAX);
  const out = { id:input.id, format, text };
  if (format === "number") {
    if (!text) return { error:"Write the question" };
    const answer = Number(input.answer);
    if (!Number.isSafeInteger(answer) || answer < 0) return { error:"The answer is a whole number" };
    const digits = Math.trunc(Number(input.digits)) || defaultDigits(answer);
    if (digits < digitsFor(answer) || digits > TRIVIA_DIGITS_MAX) return { error:"Too few wheels for the answer" };
    if (answer >= 10 ** TRIVIA_DIGITS_MAX) return { error:"That number is too big" };
    return { question:{ ...out, answer, digits, unit:clip(input.unit, TRIVIA_UNIT_MAX) } };
  }
  const answer = Number(input.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return { error:"Mark the right answer" };
  if (!Array.isArray(input.options) || input.options.length !== 4) return { error:"Four answers" };
  if (format === "tune") {
    const options = input.options.map(option => ({ title:clip(option?.title, TRIVIA_OPTION_MAX),
      artist:clip(option?.artist, TRIVIA_OPTION_MAX) }));
    if (options.some(option => !option.title)) return { error:"Name all four songs" };
    if (new Set(options.map(option => option.title.toLowerCase())).size !== 4) return { error:"Four different songs" };
    const isrc = typeof input.clip?.isrc === "string" && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(input.clip.isrc) ? input.clip.isrc : null;
    return { question:{ ...out, text:"", options, answer,
      clip:{ title:options[answer].title, artist:options[answer].artist, ...(isrc ? { isrc } : {}) } } };
  }
  const options = input.options.map(option => clip(option, TRIVIA_OPTION_MAX));
  if (options.some(option => !option)) return { error:"Fill all four answers" };
  if (new Set(options.map(option => option.toLowerCase())).size !== 4) return { error:"Four different answers" };
  if (format === "picture") {
    const photo = input.photo;
    if (!photo || !triviaPhotoId(photo.id) || !(Number(photo.w) > 0) || !(Number(photo.h) > 0)) return { error:"Add the photo" };
    return { question:{ ...out, options, answer, photo:{ id:photo.id, w:Math.round(photo.w), h:Math.round(photo.h) } } };
  }
  if (!text) return { error:"Write the question" };
  return { question:{ ...out, options, answer } };
}

/* how many questions a set list plays */
export const triviaRoundCount = round => round?.source === "bank" ? (round.picks || []).length : (round?.questions || []).length;
export const triviaQuestionTotal = rounds => (rounds || []).reduce((sum, round) => sum + triviaRoundCount(round), 0);
export const triviaConfigured = state => triviaQuestionTotal(state?.triviaRounds) > 0;

/* the game the room is on (one at a time) */
export const triviaGame = (state, evId = null) => state?.trivia?.questions?.length && (!evId || state.trivia.eventId === evId)
  ? state.trivia : null;
export const triviaCurrent = game => game?.questions?.[game.index] || null;
export const triviaLast = game => !!game && game.index >= (Number(game.total) || game.questions.length) - 1;
export const triviaTotal = game => Number(game?.total) || game?.questions?.length || 0;
export const triviaRoundOf = (game, index = game?.index) => (game?.rounds || [])
  .findIndex(round => index >= round.first && index < round.first + round.count);
/* the current question is the last of its round */
export function triviaRoundEnd(game) {
  const round = game?.rounds?.[triviaRoundOf(game)];
  return !!round && game.index === round.first + round.count - 1;
}
export const triviaTeamOf = (game, player) => player ? (game?.teams || []).find(team => team.players.includes(player)) || null : null;
/* question indexes whose answer is out */
export const triviaRevealedUpTo = game => !game ? 0 : game.phase === "question" ? game.index : game.index + 1;
export const triviaRevealed = (game, index) => index < triviaRevealedUpTo(game);
/* a game is over for every screen once its result posts */
export const triviaFinished = state => !!state?.trivia?.eventId && !!state.results?.[state.trivia.eventId];

export const durationOf = question => TRIVIA_MS[question?.format] || TRIVIA_MS.choice;
const round10 = n => Math.round(n / 10) * 10;
/* the bonus for a lock with `left` ms on the clock */
export const speedBonus = (left, duration) => round10(TRIVIA_SPEED * Math.max(0, Math.min(1, left / duration)));
export const hasAnswer = (question, pick) => !!pick && (question?.format === "number"
  ? Number.isInteger(pick.value) : Number.isInteger(pick.choice));

/* One question scored for every team: { [key]:{ points, base, bonus,
   correct, near, off, ms } }. An unlocked answer counts as locked at the
   deadline (no bonus). `ms` is how long the team took, for the tie-break. */
export function scoreQuestion(question, picks = {}, teams = [], time = {}) {
  const duration = durationOf(question);
  const closesAt = Number(time.closesAt) || 0;
  const startsAt = Number(time.startsAt) || closesAt - duration;
  const out = {};
  const tookOf = pick => Math.max(0, Math.min(duration, (pick?.locked && Number(pick.lockedAt) ? Number(pick.lockedAt) : closesAt) - startsAt));
  for (const team of teams) out[team.key] = { points:0, base:0, bonus:0, correct:false, near:null, off:null, ms:null, answered:false };
  if (question?.format === "number") {
    const rows = teams.map(team => ({ key:team.key, pick:picks?.[team.key] }))
      .filter(row => hasAnswer(question, row.pick))
      .map(row => ({ ...row, off:Math.abs(row.pick.value - question.answer) }));
    const distances = [...new Set(rows.map(row => row.off))].sort((a, b) => a - b);
    for (const row of rows) {
      const place = distances.indexOf(row.off);
      const base = TRIVIA_NEAR[place] || 0;
      const bonus = row.off === 0 ? TRIVIA_EXACT : 0;
      out[row.key] = { points:base + bonus, base, bonus, correct:place === 0, near:place + 1, off:row.off,
        ms:base ? tookOf(row.pick) : null, answered:true };
    }
    return out;
  }
  for (const team of teams) {
    const pick = picks?.[team.key];
    if (!hasAnswer(question, pick)) continue;
    const correct = pick.choice === question?.answer;
    const left = pick.locked && Number(pick.lockedAt) ? closesAt - Number(pick.lockedAt) : 0;
    const bonus = correct ? speedBonus(left, duration) : 0;
    out[team.key] = { points:correct ? TRIVIA_BASE + bonus : 0, base:correct ? TRIVIA_BASE : 0, bonus, correct,
      near:null, off:null, ms:correct ? tookOf(pick) : null, answered:true };
  }
  return out;
}

/* Totals over the revealed questions, best first. A tie breaks on the
   faster sum of the scoring answers' lock times. */
export function triviaStandings(game) {
  const teams = game?.teams || [];
  const rows = teams.map(team => ({ key:team.key, name:team.name, players:team.players, total:0, correct:0, speed:0,
    answered:0, last:0 }));
  const byKey = new Map(rows.map(row => [row.key, row]));
  const upto = triviaRevealedUpTo(game);
  (game?.questions || []).slice(0, upto).forEach((question, i) => {
    if (!question || question.answer === undefined) return;
    const scores = scoreQuestion(question, game.picks?.[question.id], teams, game.times?.[question.id]);
    for (const [key, score] of Object.entries(scores)) {
      const row = byKey.get(Number(key));
      if (!row) continue;
      row.total += score.points;
      if (score.correct) row.correct += 1;
      if (score.answered) row.answered += 1;
      if (score.ms !== null) row.speed += score.ms;
      if (i === upto - 1) row.last = score.points;
    }
  });
  rows.sort((a, b) => b.total - a.total || a.speed - b.speed || a.key - b.key);
  let rank = 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    rank = prev && prev.total === row.total && prev.speed === row.speed ? rank : i + 1;
    row.rank = rank;
  });
  return rows;
}

/* the event result: one winning team, then the next two ranks (a full tie
   shares its slot) */
export function triviaResultSlots(rows) {
  const order = (rows || []).filter(row => row.answered > 0);
  if (!order.length) return null;
  const rest = order.slice(1);
  const ranks = [...new Set(rest.map(row => row.rank))].slice(0, 2);
  return [[...order[0].players], ...ranks.map(rank => rest.filter(row => row.rank === rank).flatMap(row => row.players))];
}

/* The director's beat while a Trivia event is under way and has a set
   list. Null when the ordinary result entry applies. */
export function triviaBeat(state, ev) {
  if (ev?.game !== "trivia" || state?.results?.[ev.id]) return null;
  const game = triviaGame(state, ev.id);
  if (!game) return triviaConfigured(state) ? { type:"trivia-start", label:"Start trivia", subject:ev.name } : null;
  const question = triviaCurrent(game);
  const total = triviaTotal(game);
  const subject = `Question ${game.index + 1} of ${total}`;
  const roundName = game.rounds?.[triviaRoundOf(game)]?.name || ev.name;
  if (game.phase === "question") return { type:"trivia-reveal", label:"Reveal", subject, questionId:question.id };
  if (game.phase === "reveal") {
    if (triviaLast(game)) return { type:"trivia-board", label:"Final scores", subject:ev.name, questionId:question.id };
    if (triviaRoundEnd(game)) return { type:"trivia-board", label:"Scores", subject:roundName, questionId:question.id };
    return { type:"trivia-next", label:"Next question", subject:`Question ${game.index + 2} of ${total}`, questionId:question.id };
  }
  if (triviaLast(game)) return { type:"trivia-finish", label:"Post result", subject:ev.name };
  const next = game.rounds?.[triviaRoundOf(game, game.index + 1)]?.name || "";
  return { type:"trivia-next", label:"Next round", subject:next, questionId:question.id };
}

/* What a phone or the TV is sent. The commissioner gets everything, unless
   they are on a team in the running game: then they play it like anyone.
   Everyone else gets the questions shown so far (an answer only once
   revealed, never which recording a tune plays), their own team's live
   pick, every team's locked or not, and every pick once revealed. */
export function projectTrivia(game, rounds, { isGm = false, player = null } = {}) {
  const playing = !!triviaTeamOf(game, player);
  if (isGm && !playing) {
    if (!game) return { trivia:null, triviaRounds:rounds || [] };
    const { ops, ...rest } = game;
    return { trivia:{ ...rest, total:game.questions.length }, triviaRounds:rounds || [] };
  }
  const configured = isGm ? rounds || [] : [];
  if (!game?.questions?.length) return { trivia:null, triviaRounds:configured };
  const mine = triviaTeamOf(game, player);
  const shown = game.questions.slice(0, Math.min(game.questions.length, game.index + 1)).map((question, i) => {
    const base = { id:question.id, n:i + 1, round:question.round, format:question.format, text:question.text,
      ...(question.options ? { options:question.options } : {}),
      ...(question.format === "number" ? { unit:question.unit || "", digits:question.digits } : {}),
      ...(question.photo ? { photo:question.photo } : {}) };
    return triviaRevealed(game, i) ? { ...base, answer:question.answer } : base;
  });
  const picks = {}, times = {};
  shown.forEach((question, i) => {
    if (game.times?.[question.id]) times[question.id] = game.times[question.id];
    const byTeam = game.picks?.[question.id] || {};
    if (triviaRevealed(game, i)) { picks[question.id] = byTeam; return; }
    const out = {};
    for (const [key, pick] of Object.entries(byTeam)) {
      if (mine && Number(key) === mine.key) out[key] = pick;
      else out[key] = { locked:!!pick?.locked, set:hasAnswer(question, pick) };
    }
    picks[question.id] = out;
  });
  const { ops, questions, picks:_p, times:_t, ...rest } = game;
  return { trivia:{ ...rest, total:game.questions.length, questions:shown, picks, times }, triviaRounds:configured };
}
