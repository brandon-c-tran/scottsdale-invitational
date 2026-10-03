/* Trivia's writes (shared/trivia.js is the model). The commissioner builds
   the set list (bank categories and his own rounds) and runs the game from
   the director pill: start, reveal each question, the scores between
   rounds, next, then the result, which posts through the ordinary result
   write. Players only pick and lock, one shared answer per team.

   Built by actions.js with its own helpers, so a finish runs the same
   beginResultEntry and saveResult every other result does. */
import { allEventsOf, isAway, resolveEventLifecycle } from "../shared/core.js";
import {
  TRIVIA_DIGITS_MAX, TRIVIA_GRACE_MS, TRIVIA_LEAD_MS, TRIVIA_MAX_QUESTIONS, TRIVIA_MAX_ROUNDS, TRIVIA_NAME_MAX,
  cleanTriviaQuestion, durationOf, hasAnswer, triviaCurrent, triviaGame, triviaLast, triviaQuestionTotal, triviaResultSlots,
  triviaRoundEnd, triviaRoundId, triviaStandings, triviaTeamOf,
} from "../shared/trivia.js";
import { TRIVIA_BANK, bankCategory } from "./triviaBank.js";

export const TRIVIA_ACTION_TYPES = Object.freeze([
  "triviaSaveRound", "triviaDeleteRound", "triviaMoveRound", "triviaStart", "triviaPick", "triviaReveal", "triviaBoard",
  "triviaNext", "triviaFinish", "triviaRestart", "triviaSimAnswers",
]);

/* retried writes a team's pick remembers, per question */
const OPS_KEPT = 8;
const clip = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/* deal four options in a fresh order, the answer following its option */
function deal(question, random = Math.random) {
  if (!Array.isArray(question.options)) return question;
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...question, options:order.map(i => question.options[i]), answer:order.indexOf(question.answer) };
}

/* one set-list round as the questions a game plays */
export function roundQuestions(round) {
  if (round?.source === "bank") {
    const category = bankCategory(round.category);
    if (!category) return { name:"", questions:[] };
    const byId = new Map(category.questions.map(question => [question.id, question]));
    const questions = (round.picks || []).map(id => byId.get(id)).filter(Boolean).map(question => {
      const out = { ...question, ...(question.format === "number" ? { digits:question.digits || Math.max(4, String(question.answer).length),
        unit:question.unit || "" } : {}) };
      return question.format === "tune" ? { ...out, clip:{ title:question.options[0].title, artist:question.options[0].artist } }
        : { ...out, options:out.options ? [...out.options] : undefined };
    });
    return { name:category.name, questions:questions.map(question => deal(question)) };
  }
  return { name:round?.name || "", questions:(round?.questions || []).map(question => structuredClone(question)) };
}

/* every question the bank holds, for the desk */
export const bankForDesk = () => TRIVIA_BANK.map(category => ({ id:category.id, name:category.name,
  questions:category.questions }));

/* a bank round's default picks: the first `count` of its category */
export const bankDefaultPicks = (categoryId, count = 5) => (bankCategory(categoryId)?.questions || []).slice(0, count).map(q => q.id);

export function triviaActions({ ok, err, gmOnly, run }) {
  const gameEvent = (state, evId) => {
    const ev = allEventsOf(state).find(item => item.id === evId);
    return ev?.game === "trivia" ? ev : null;
  };
  /* a game under way: started and its result not posted */
  const running = state => !!triviaGame(state) && !state.results?.[state.trivia.eventId];
  const rounds = state => Array.isArray(state.triviaRounds) ? state.triviaRounds : [];
  const open = (game, now) => {
    const question = triviaCurrent(game);
    const startsAt = now + TRIVIA_LEAD_MS;
    game.times = { ...(game.times || {}), [question.id]:{ openedAt:now, startsAt, closesAt:startsAt + durationOf(question) } };
    game.phase = "question";
  };
  const actions = {
    /* add or replace one round of the set list */
    triviaSaveRound(state, { round }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (running(state)) return err("Restart the game before changing rounds");
      if (!round || !triviaRoundId(round.id)) return err("Bad round");
      const list = rounds(state);
      const existing = list.find(item => item.id === round.id);
      if (!existing && list.length >= TRIVIA_MAX_ROUNDS) return err(`Up to ${TRIVIA_MAX_ROUNDS} rounds`);
      let clean;
      if (round.source === "bank") {
        const category = bankCategory(round.category);
        if (!category) return err("No such category");
        const ids = new Set(category.questions.map(question => question.id));
        const picks = [...new Set(Array.isArray(round.picks) ? round.picks : [])].filter(id => ids.has(id));
        if (!picks.length) return err("Pick at least one question");
        if (picks.length > TRIVIA_MAX_QUESTIONS) return err(`Up to ${TRIVIA_MAX_QUESTIONS} questions a round`);
        clean = { id:round.id, source:"bank", category:category.id, picks };
      } else if (round.source === "custom") {
        const name = clip(round.name, TRIVIA_NAME_MAX);
        if (!name) return err("Name the round");
        const questions = Array.isArray(round.questions) ? round.questions : [];
        if (!questions.length) return err("Add a question");
        if (questions.length > TRIVIA_MAX_QUESTIONS) return err(`Up to ${TRIVIA_MAX_QUESTIONS} questions a round`);
        const cleaned = [];
        for (const [i, input] of questions.entries()) {
          const result = cleanTriviaQuestion(input);
          if (result.error) return err(`Question ${i + 1}: ${result.error}`);
          cleaned.push(result.question);
        }
        if (new Set(cleaned.map(question => question.id)).size !== cleaned.length) return err("Bad question");
        clean = { id:round.id, source:"custom", name, questions:cleaned };
      } else return err("Bad round");
      if (existing && JSON.stringify(existing) === JSON.stringify(clean)) return ok({ unchanged:true });
      state.triviaRounds = existing ? list.map(item => item.id === clean.id ? clean : item) : [...list, clean];
      return ok({ round:clean.id });
    },
    triviaDeleteRound(state, { id }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!rounds(state).some(round => round.id === id)) return ok({ unchanged:true });
      if (running(state)) return err("Restart the game before changing rounds");
      state.triviaRounds = rounds(state).filter(round => round.id !== id);
      return ok();
    },
    triviaMoveRound(state, { id, by }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (running(state)) return err("Restart the game before changing rounds");
      const list = [...rounds(state)];
      const from = list.findIndex(round => round.id === id);
      const to = from + (by === -1 ? -1 : 1);
      if (from < 0 || to < 0 || to >= list.length) return ok({ unchanged:true });
      [list[from], list[to]] = [list[to], list[from]];
      state.triviaRounds = list;
      return ok();
    },
    /* the first question goes up, once the event is under way */
    triviaStart(state, { evId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const ev = gameEvent(state, evId);
      if (!ev) return err("No such game");
      if (triviaGame(state, evId) && running(state)) return ok({ unchanged:true });
      if (state.results?.[evId]) return err("The result is already posted");
      if (resolveEventLifecycle(state, ev).phase !== "in-progress") return err(`Lock and start ${ev.name} first`);
      if (!triviaQuestionTotal(rounds(state))) return err("Add rounds in the Trivia desk first");
      const draw = state.draws?.[evId];
      if (!draw?.teams?.length || draw.teams.length < 2) return err("Draw the teams first");
      const now = Date.now();
      const id = `tg${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const played = [], questions = [];
      rounds(state).forEach(round => {
        const { name, questions:list } = roundQuestions(round);
        if (!list.length) return;
        played.push({ name, first:questions.length, count:list.length });
        list.forEach(question => {
          const { id:source, ...rest } = question;
          questions.push({ ...rest, id:`${id}-${questions.length + 1}`, source, round:played.length - 1 });
        });
      });
      if (!questions.length) return err("Add rounds in the Trivia desk first");
      const game = { id, eventId:evId, startedAt:now, index:0, phase:"question",
        teams:draw.teams.map((team, key) => ({ key, name:team.name || `Team ${key + 1}`, players:[...team.players] })),
        rounds:played, questions, times:{}, picks:{}, ops:{} };
      open(game, now);
      state.trivia = game;
      return ok({ game:id });
    },
    /* A team's one answer: any teammate sets it or changes it, any teammate
       locks it in, and a locked answer stays. A retried write (the same
       device and action id) is acknowledged once. */
    triviaPick(state, { questionId, choice, value, lock }, ctx) {
      const game = triviaGame(state);
      const question = triviaCurrent(game);
      if (!game || !running(state) || game.phase !== "question" || question?.id !== questionId) return err("That question is closed");
      if (!ctx.player) return err("Check in first");
      const team = triviaTeamOf(game, ctx.player);
      if (!team) return err("You are not on a team");
      if (isAway(state, ctx.player)) return err("You are marked away");
      const now = Date.now();
      const time = game.times?.[questionId] || {};
      if (now > Number(time.closesAt) + TRIVIA_GRACE_MS) return err("Time is up");
      const opKey = ctx.deviceId && typeof ctx.actionId === "string" && ctx.actionId ? `${ctx.deviceId}:${ctx.actionId}` : null;
      const ops = game.ops?.[questionId]?.[team.key] || [];
      if (opKey && ops.includes(opKey)) return ok({ unchanged:true });
      const number = question.format === "number";
      const given = number ? value !== undefined && value !== null : choice !== undefined && choice !== null;
      let answer = null;
      if (given) {
        answer = Number(number ? value : choice);
        if (number ? !Number.isSafeInteger(answer) || answer < 0 || answer >= 10 ** Math.min(TRIVIA_DIGITS_MAX, question.digits || TRIVIA_DIGITS_MAX)
          : !Number.isInteger(answer) || answer < 0 || answer > 3) return err("Pick an answer");
      }
      const prior = game.picks?.[questionId]?.[team.key] || null;
      const field = number ? "value" : "choice";
      if (prior?.locked) {
        if (!given || prior[field] === answer) return ok({ unchanged:true });
        return err("Your team locked in");
      }
      if (!given && !hasAnswer(question, prior)) return err("Pick an answer first");
      const changed = given && prior?.[field] !== answer;
      if (!changed && lock !== true) return ok({ unchanged:true });
      const next = changed ? { [field]:answer, by:ctx.player, at:now } : { ...prior };
      if (lock === true) Object.assign(next, { locked:true, lockedAt:Math.min(now, Number(time.closesAt) || now), lockedBy:ctx.player });
      game.picks = { ...(game.picks || {}), [questionId]:{ ...(game.picks?.[questionId] || {}), [team.key]:next } };
      if (opKey) game.ops = { ...(game.ops || {}), [questionId]:{ ...(game.ops?.[questionId] || {}),
        [team.key]:[...ops, opKey].slice(-OPS_KEPT) } };
      return ok();
    },
    triviaReveal(state, { questionId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const game = triviaGame(state);
      if (!game || !running(state) || triviaCurrent(game)?.id !== questionId) return err("That question is not up");
      if (game.phase !== "question") return ok({ unchanged:true });
      game.phase = "reveal";
      game.times[questionId] = { ...game.times[questionId], revealedAt:Date.now() };
      return ok();
    },
    /* the standings between rounds, and at the end */
    triviaBoard(state, { questionId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const game = triviaGame(state);
      if (!game || !running(state)) return err("The game has not started");
      if (triviaCurrent(game)?.id !== questionId) return ok({ unchanged:true });
      if (game.phase === "board") return ok({ unchanged:true });
      if (game.phase !== "reveal") return err("Reveal this question first");
      if (!triviaRoundEnd(game) && !triviaLast(game)) return err("The round is not over");
      game.phase = "board";
      game.boardAt = Date.now();
      return ok();
    },
    triviaNext(state, { questionId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const game = triviaGame(state);
      if (!game || !running(state)) return err("The game has not started");
      /* a retried tap after the room moved on */
      if (triviaCurrent(game)?.id !== questionId) return ok({ unchanged:true });
      if (game.phase === "question") return err("Reveal this question first");
      if (triviaLast(game)) return err("That was the last question");
      if (game.phase === "reveal" && triviaRoundEnd(game)) return err("Show the scores first");
      game.index += 1;
      delete game.boardAt;
      open(game, Date.now());
      return ok();
    },
    /* the final standings post the event's result: 1st, 2nd and 3rd */
    triviaFinish(state, { evId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const ev = gameEvent(state, evId);
      const game = triviaGame(state, evId);
      if (!ev || !game) return err("No game to finish");
      if (state.results?.[evId]) return ok({ unchanged:true });
      if (!triviaLast(game) || game.phase === "question") return err("Reveal the last question first");
      const slots = triviaResultSlots(triviaStandings(game));
      if (!slots) return err("Nobody answered");
      if (resolveEventLifecycle(state, ev).phase === "in-progress") {
        const entered = run("beginResultEntry", state, { evId }, ctx);
        if (!entered.ok) return entered;
      }
      const posted = run("saveResult", state, { evId, slots }, ctx);
      if (!posted.ok) return posted;
      game.phase = "board";
      game.finishedAt = Date.now();
      return ok({ slots, ...(posted.extra || {}) });
    },
    /* start over: every answer goes, the set list stays */
    triviaRestart(state, { evId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!triviaGame(state, evId)) return ok({ unchanged:true });
      if (state.results?.[evId]) return err("Clear the result first");
      state.trivia = null;
      return ok();
    },
    /* QA: every team that has not locked picks and locks, about half of
       them right, through the real pick write */
    triviaSimAnswers(state, { questionId }, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!ctx.qa) return err("QA is unavailable");
      const game = triviaGame(state);
      const question = triviaCurrent(game);
      if (!game || !running(state) || game.phase !== "question" || question?.id !== questionId) return err("That question is closed");
      let answered = 0;
      for (const team of game.teams) {
        if (game.picks?.[questionId]?.[team.key]?.locked) continue;
        const player = team.players.find(member => !isAway(state, member));
        if (!player) continue;
        const right = Math.random() < 0.5;
        const payload = question.format === "number"
          ? { value:Math.min(10 ** question.digits - 1, Math.max(0, Math.round(question.answer * (right ? 1 : 0.7 + Math.random() * 0.6)))) }
          : { choice:right ? question.answer : (question.answer + 1 + Math.floor(Math.random() * 3)) % 4 };
        const result = actions.triviaPick(state, { questionId, ...payload, lock:true }, { isGm:false, player, deviceId:null, actionId:null });
        if (result.ok) answered += 1;
      }
      return answered ? ok({ answered }) : err("Every team has locked in");
    },
  };
  return actions;
}
