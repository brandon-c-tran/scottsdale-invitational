/* D6 Awards night, on the reusable prompt/response feature planned in
   docs/REFOUNDATION.md ("Later questions, votes, and polls").

   A ballot is one published set of questions (for awards: superlatives whose
   options are players). Guests answer each question once and may change the
   answer until the commissioner closes the ballot. Closing counts the votes
   into the ballot; the first award revealed on the TV then discards every
   per-voter answer, so from that point only totals exist anywhere.

   HONORS ARE STANDALONE. Nothing in this module (or its reducers in
   worker/prompts.js) reads or writes chips, wagers, markets, results,
   rulings or standings, and nothing in the economy reads it. The one read
   of the weekend is a counted award (`source:"mvps"`, "Most MVPs"): its
   totals are each player's standing team MVPs at close, not votes.

   Stored at state.prompts = { ballots:[...], responses:{ [ballotId]:{
   [player]:{ answers:{ [questionId]:player }, at } } } }. The per-viewer
   projection (projectPrompts) is the only way any of it leaves the Worker:
   responses never do; a viewer gets their own answers back, everyone gets
   the turnout count, and a question's totals appear only once the TV has
   revealed it. */

import { ROSTER, isActivePlayer, allEventsOf, eventInPlay, mvpAwards, pokerLive } from "./core.js";

const PROMPT_KINDS = Object.freeze(["awards"]);
/* awards the weekend counts instead of the room voting */
const PROMPT_SOURCES = Object.freeze(["mvps"]);
const PROMPT_TITLE_MAX = 40;
const PROMPT_QUESTIONS_MIN = 1;
const PROMPT_QUESTIONS_MAX = 6;
/* drafts plus history; the oldest finished ballot leaves first */
const PROMPT_BALLOTS_MAX = 12;
const PROMPT_ID = /^[a-z][a-z0-9-]{2,40}$/;
/* revealed awards stay on Home this long after the reveal ends */
const PROMPT_RESULTS_WINDOW_MS = 12 * 60 * 60 * 1000;

const emptyPrompts = () => ({ ballots:[], responses:{} });
const plainObject = value => !!value && typeof value === "object" && !Array.isArray(value);

/* a read-only view of whatever is stored, never throwing on an old state */
function promptsOf(state) {
  const stored = state?.prompts;
  return {
    ballots:Array.isArray(stored?.ballots) ? stored.ballots.filter(plainObject) : [],
    responses:plainObject(stored?.responses) ? stored.responses : {},
  };
}

const newId = prefix => `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;

function cleanTitle(value) {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PROMPT_TITLE_MAX).trim();
}

/* The commissioner's draft, validated the same way on every write. Nominees
   are null (everyone, fixed to the roster at publish) or an explicit list of
   at least two players. */
function cleanBallotDraft(input, existing = null) {
  if (!plainObject(input)) return { ok:false, error:"Add an award" };
  const kind = input.kind === undefined ? existing?.kind || "awards" : input.kind;
  if (!PROMPT_KINDS.includes(kind)) return { ok:false, error:"Unknown ballot" };
  const questions = Array.isArray(input.questions) ? input.questions : [];
  if (questions.length < PROMPT_QUESTIONS_MIN) return { ok:false, error:"Add an award" };
  if (questions.length > PROMPT_QUESTIONS_MAX) return { ok:false, error:`Up to ${PROMPT_QUESTIONS_MAX} awards` };
  const seen = new Set();
  const out = [];
  for (const [index, question] of questions.entries()) {
    if (!plainObject(question)) return { ok:false, error:"Add an award" };
    const title = cleanTitle(question.title);
    if (!title) return { ok:false, error:`Name award ${index + 1}` };
    const source = PROMPT_SOURCES.includes(question.source) ? question.source : null;
    let nominees = null;
    if (!source && question.nominees !== null && question.nominees !== undefined) {
      if (!Array.isArray(question.nominees)) return { ok:false, error:"Pick the nominees" };
      const picked = [...new Set(question.nominees)];
      if (picked.some(player => !isActivePlayer(player))) return { ok:false, error:"Pick the nominees" };
      if (picked.length < 2) return { ok:false, error:`${title} needs two nominees` };
      /* roster order, so every screen lays them out the same way */
      nominees = picked.length === ROSTER.length ? null : ROSTER.filter(player => picked.includes(player));
    }
    const given = typeof question.id === "string" && PROMPT_ID.test(question.id) && !seen.has(question.id)
      ? question.id : null;
    const id = given || newId("q");
    seen.add(id);
    out.push(source ? { id, title, nominees:null, allowSelf:false, source }
      : { id, title, nominees, allowSelf:question.allowSelf === true });
  }
  return { ok:true, kind, questions:out };
}

/* who can be voted for; everyone means the whole roster */
const nomineesOf = question => Array.isArray(question?.nominees) && question.nominees.length
  ? question.nominees.filter(isActivePlayer) : [...ROSTER];

/* Whether `voter` may pick `choice` on this question. */
function voteError(question, voter, choice) {
  if (!question) return "No such award";
  if (question.source) return "This award is counted, not voted";
  if (!nomineesOf(question).includes(choice)) return "Pick a nominee";
  if (choice === voter && !question.allowSelf) return "Vote for someone else";
  return null;
}

/* the players with the most votes; empty when nobody voted */
function winnersOf(counts, order = ROSTER) {
  const best = Math.max(0, ...Object.values(counts || {}).map(Number).filter(Number.isFinite));
  if (!best) return [];
  return order.filter(player => Number(counts?.[player]) === best);
}

const answersOf = (responses, ballotId) => plainObject(responses?.[ballotId]) ? responses[ballotId] : {};

/* players who answered at least one question */
function turnoutOf(ballot, responses) {
  const ids = new Set((ballot?.questions || []).map(question => question.id));
  return Object.entries(answersOf(responses, ballot?.id))
    .filter(([player, record]) => isActivePlayer(player)
      && Object.keys(record?.answers || {}).some(id => ids.has(id))).length;
}

/* Close counts every answer into the ballot (stored as ballot.tally):
   totals per nominee, and how many people voted. Answers that are no longer
   valid are left out. A counted award takes its totals from `state`. */
function tallyBallot(ballot, responses, state = null) {
  const answers = answersOf(responses, ballot?.id);
  const questions = {};
  for (const question of ballot?.questions || []) {
    const counts = {};
    let votes = 0;
    if (question.source === "mvps") {
      for (const { player } of mvpAwards(state)) if (isActivePlayer(player)) { counts[player] = (counts[player] || 0) + 1; votes += 1; }
      questions[question.id] = { counts, votes };
      continue;
    }
    for (const [voter, record] of Object.entries(answers)) {
      const choice = record?.answers?.[question.id];
      if (!isActivePlayer(voter) || !choice || voteError(question, voter, choice)) continue;
      counts[choice] = (counts[choice] || 0) + 1;
      votes += 1;
    }
    questions[question.id] = { counts, votes };
  }
  return { turnout:turnoutOf(ballot, responses), questions };
}

/* how many of this ballot's questions the room has seen */
function revealedCount(ballot) {
  const n = ballot?.questions?.length || 0;
  if (!ballot?.reveal) return 0;
  if (ballot.reveal.done) return n;
  return Math.max(0, Math.min(n, Math.floor(Number(ballot.reveal.shown) || 0)));
}

/* ── the projection: the only shape a ballot takes in a frame ──
   Drafts are the commissioner's. Everyone else sees published ballots, the
   turnout, their own answers while voting runs, and a question's totals only
   after the TV has shown it. Voters never appear anywhere. */
function projectBallot(ballot, responses, { isGm = false, player = null } = {}) {
  if (!ballot || (ballot.status === "draft" && !isGm)) return null;
  const shown = revealedCount(ballot);
  const open = ballot.status === "open";
  const results = {};
  ballot.questions.slice(0, shown).forEach(question => {
    const row = ballot.tally?.questions?.[question.id] || { counts:{}, votes:0 };
    results[question.id] = { counts:{ ...row.counts }, votes:Number(row.votes) || 0,
      winners:winnersOf(row.counts, nomineesOf(question)) };
  });
  const mine = player ? answersOf(responses, ballot.id)[player]?.answers : null;
  return {
    id:ballot.id,
    kind:ballot.kind,
    status:ballot.status,
    rev:Number(ballot.rev) || 1,
    createdAt:Number(ballot.createdAt) || 0,
    publishedAt:Number(ballot.publishedAt) || null,
    closedAt:Number(ballot.closedAt) || null,
    questions:ballot.questions.map(question => ({ id:question.id, title:question.title,
      nominees:question.nominees ? [...question.nominees] : null, allowSelf:!!question.allowSelf,
      ...(question.source ? { source:question.source } : {}) })),
    voted:open ? turnoutOf(ballot, responses) : Number(ballot.tally?.turnout) || 0,
    of:ROSTER.length,
    ...(player && plainObject(mine) ? { mine:{ ...mine } } : {}),
    reveal:ballot.reveal ? { shown, at:Number(ballot.reveal.at) || 0, done:!!ballot.reveal.done,
      doneAt:Number(ballot.reveal.doneAt) || null } : null,
    results,
  };
}

function projectPrompts(prompts, viewer = {}) {
  const { ballots, responses } = promptsOf({ prompts });
  return { ballots:ballots.map(ballot => projectBallot(ballot, responses, viewer)).filter(Boolean) };
}

/* ── reading a projected (or stored) state on any screen ── */
const ballotsOf = state => promptsOf(state).ballots;
const openBallot = state => ballotsOf(state).find(ballot => ballot.status === "open") || null;
/* the ballot whose awards are being revealed (or were last revealed) */
const revealBallot = state => ballotsOf(state).filter(ballot => ballot.status === "closed" && ballot.reveal)
  .sort((a, b) => (Number(b.reveal.at) || 0) - (Number(a.reveal.at) || 0))[0] || null;

/* What would stop the room from turning to the TV for the awards: a hand of
   poker, an event being played or bet on. Ending a reveal is never blocked. */
function awardsRevealBlocker(state, events = allEventsOf(state)) {
  if (pokerLive(state)) return "Cards are live at the table";
  const playing = events.find(ev => eventInPlay(state, ev));
  if (playing) return `${playing.name} is being played`;
  if (state?.onDeck) {
    const ev = events.find(item => item.id === state.onDeck);
    return `Betting is open on ${ev?.name || "an event"}`;
  }
  return null;
}

/* The award on the TV right now: the reveal is running and the room is free.
   { ballot, index, count, question, nominees, counts, votes, winners, at } */
function awardOnTv(state, events = allEventsOf(state)) {
  const ballot = revealBallot(state);
  if (!ballot || ballot.reveal.done) return null;
  const shown = revealedCount(ballot);
  if (shown < 1 || awardsRevealBlocker(state, events)) return null;
  const index = shown - 1;
  const question = ballot.questions[index];
  if (!question) return null;
  const row = ballot.results?.[question.id] || ballot.tally?.questions?.[question.id] || { counts:{}, votes:0 };
  const nominees = nomineesOf(question);
  return {
    ballotId:ballot.id,
    index,
    count:ballot.questions.length,
    question,
    nominees,
    counts:{ ...(row.counts || {}) },
    votes:Number(row.votes) || 0,
    winners:row.winners || winnersOf(row.counts, nominees),
    at:Number(ballot.reveal.at) || 0,
  };
}

/* Every award the room has seen, newest ballot first, for any surface that
   keeps the weekend (Home, the keepsake): [{ ballotId, questionId, title,
   nominees, winners, counts, votes, index, count, doneAt, onTvSince }].
   onTvSince is the reveal's server time for the award the TV is turning
   right now (null otherwise): a phone holds its winner until the TV stamps. */
function awardResults(state) {
  return ballotsOf(state).filter(ballot => ballot.reveal && revealedCount(ballot) > 0)
    .sort((a, b) => (Number(b.reveal.at) || 0) - (Number(a.reveal.at) || 0))
    .flatMap(ballot => ballot.questions.slice(0, revealedCount(ballot)).map((question, index) => {
      const row = ballot.results?.[question.id] || ballot.tally?.questions?.[question.id] || { counts:{}, votes:0 };
      const onTv = !ballot.reveal.done && index === revealedCount(ballot) - 1;
      return { ballotId:ballot.id, questionId:question.id, title:question.title, index,
        count:ballot.questions.length, nominees:nomineesOf(question), counts:{ ...(row.counts || {}) },
        votes:Number(row.votes) || 0, winners:row.winners || winnersOf(row.counts, nomineesOf(question)),
        doneAt:Number(ballot.reveal.doneAt) || null, onTvSince:onTv ? Number(ballot.reveal.at) || null : null };
    }));
}

/* the commissioner's one-line status for a ballot */
function ballotStatusLine(ballot) {
  if (!ballot) return "No ballot";
  const n = ballot.questions?.length || 0;
  const awards = `${n} award${n === 1 ? "" : "s"}`;
  if (ballot.status === "draft") return `Draft · ${awards}`;
  if (ballot.status === "open") return `Voting · ${ballot.voted ?? 0} of ${ballot.of ?? ROSTER.length} voted`;
  const shown = revealedCount(ballot);
  if (ballot.reveal?.done) return "Revealed";
  if (shown) return `On TV · ${shown} of ${n}`;
  return `Voting closed · ${ballot.voted ?? ballot.tally?.turnout ?? 0} voted`;
}

export {
  PROMPT_KINDS,
  PROMPT_SOURCES,
  PROMPT_TITLE_MAX,
  PROMPT_QUESTIONS_MIN,
  PROMPT_QUESTIONS_MAX,
  PROMPT_BALLOTS_MAX,
  PROMPT_ID,
  PROMPT_RESULTS_WINDOW_MS,
  emptyPrompts,
  promptsOf,
  cleanTitle,
  cleanBallotDraft,
  nomineesOf,
  voteError,
  winnersOf,
  turnoutOf,
  tallyBallot,
  revealedCount,
  projectBallot,
  projectPrompts,
  ballotsOf,
  openBallot,
  revealBallot,
  awardsRevealBlocker,
  awardOnTv,
  awardResults,
  ballotStatusLine,
};
