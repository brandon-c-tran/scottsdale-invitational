/* D6: the ballot reducers (shared/prompts.js holds the model). Registered in
   worker/actions.js, so the WebSocket actions and the HTTP endpoints under
   /api/prompts and /api/admin/prompts run the same code on the same
   single-writer path.

   Every handler touches state.prompts, and promptReveal may retire a Show
   Control scene that has nothing left to say. Nothing else: no chips, no
   wagers, no results, no standings. Identical retries answer unchanged. */

import { ROSTER, isActivePlayer, allEventsOf } from "../shared/core.js";
import { finishShowScene, resolveShowScene, sceneAtLastStep } from "../shared/show.js";
import {
  PROMPT_BALLOTS_MAX, PROMPT_ID, awardsRevealBlocker, cleanBallotDraft, emptyPrompts, revealedCount, tallyBallot,
  voteError,
} from "../shared/prompts.js";

const ok = extra => ({ ok:true, extra });
const err = (error, extra) => ({ ok:false, error, extra });
const gmOnly = ctx => (ctx?.isGm ? null : err("Commissioner only"));
const unchanged = extra => ok({ unchanged:true, ...(extra || {}) });

/* the stored container, repaired in place on the working copy */
function promptsFor(state) {
  const stored = state.prompts;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) state.prompts = emptyPrompts();
  if (!Array.isArray(state.prompts.ballots)) state.prompts.ballots = [];
  if (!state.prompts.responses || typeof state.prompts.responses !== "object" || Array.isArray(state.prompts.responses))
    state.prompts.responses = {};
  return state.prompts;
}
const findBallot = (prompts, id) => typeof id === "string" && PROMPT_ID.test(id)
  ? prompts.ballots.find(ballot => ballot.id === id) || null : null;
const sameQuestions = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/* keep the list bounded: the oldest finished ballot (never an open one or a
   reveal in progress) leaves first */
function trimBallots(prompts) {
  while (prompts.ballots.length > PROMPT_BALLOTS_MAX) {
    const index = prompts.ballots.findIndex(ballot => ballot.status === "closed" && (!ballot.reveal || ballot.reveal.done));
    if (index < 0) return;
    const [gone] = prompts.ballots.splice(index, 1);
    delete prompts.responses[gone.id];
  }
}

/* Save a draft: a new ballot, or the questions of one not yet published. */
function saveDraft(prompts, input, now) {
  /* a new ballot may name its own id, so a retried save lands once */
  if (input?.id !== undefined && (typeof input.id !== "string" || !PROMPT_ID.test(input.id)))
    return { error:err("No such ballot") };
  const existing = input?.id !== undefined ? findBallot(prompts, input.id) : null;
  if (existing && existing.status !== "draft") return { error:err("Published ballots can't be edited") };
  const clean = cleanBallotDraft(input, existing);
  if (!clean.ok) return { error:err(clean.error) };
  if (existing) {
    const same = existing.kind === clean.kind && sameQuestions(existing.questions, clean.questions);
    if (!same) Object.assign(existing, { kind:clean.kind, questions:clean.questions, updatedAt:now });
    return { ballot:existing, changed:!same };
  }
  const ballot = { id:input?.id || `b${now.toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`, kind:clean.kind,
    status:"draft", rev:1, createdAt:now, updatedAt:now, publishedAt:null, closedAt:null,
    questions:clean.questions, tally:null, reveal:null };
  prompts.ballots.push(ballot);
  trimBallots(prompts);
  return { ballot, changed:true };
}

function publish(prompts, ballot, now) {
  const open = prompts.ballots.find(item => item.status === "open" && item.id !== ballot.id);
  if (open) return err("Close the open ballot first");
  ballot.status = "open";
  ballot.publishedAt = now;
  ballot.closedAt = null;
  ballot.tally = null;
  ballot.reveal = null;
  prompts.responses[ballot.id] = prompts.responses[ballot.id] || {};
  return null;
}

export const PROMPT_ACTIONS = {
  /* payload: { id?, kind, questions:[{ id?, title, nominees:null|[...], allowSelf }] } */
  promptSave(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    const saved = saveDraft(prompts, payload, Date.now());
    if (saved.error) return saved.error;
    return saved.changed ? ok({ id:saved.ballot.id }) : unchanged({ id:saved.ballot.id });
  },

  /* payload: { id } for a saved draft, or { ballot } to save and publish in one write */
  promptPublish(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    const now = Date.now();
    let ballot;
    if (payload?.ballot) {
      if (payload.ballot.id !== undefined) {
        const current = findBallot(prompts, payload.ballot.id);
        if (current?.status === "open") return unchanged({ id:current.id });
      }
      const saved = saveDraft(prompts, payload.ballot, now);
      if (saved.error) return saved.error;
      ballot = saved.ballot;
    } else {
      ballot = findBallot(prompts, payload?.id);
      if (!ballot) return err("No such ballot");
      if (ballot.status === "open") return unchanged({ id:ballot.id });
      if (ballot.status !== "draft") return err("That ballot already ran");
    }
    const blocked = publish(prompts, ballot, now);
    if (blocked) return blocked;
    return ok({ id:ballot.id });
  },

  /* voting ends: the answers are counted into the ballot */
  promptClose(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    const ballot = findBallot(prompts, payload?.id);
    if (!ballot) return err("No such ballot");
    if (ballot.status === "closed") return unchanged({ id:ballot.id });
    if (ballot.status !== "open") return err("That ballot is not open");
    ballot.status = "closed";
    ballot.closedAt = Date.now();
    ballot.tally = tallyBallot(ballot, prompts.responses);
    return ok({ id:ballot.id, voted:ballot.tally.turnout });
  },

  /* a mistaken close, before anything is shown: the answers are still there */
  promptReopen(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    const ballot = findBallot(prompts, payload?.id);
    if (!ballot) return err("No such ballot");
    if (ballot.status === "open") return unchanged({ id:ballot.id });
    if (ballot.status !== "closed") return err("That ballot is not closed");
    if (ballot.reveal) return err("The reveal has started");
    const blocked = publish(prompts, ballot, Number(ballot.publishedAt) || Date.now());
    if (blocked) return blocked;
    return ok({ id:ballot.id });
  },

  /* payload: { id, questionId, choice } where choice is a nominee, or null to
     take the vote back. One answer per player per question. */
  promptRespond(state, payload, ctx) {
    const voter = isActivePlayer(ctx?.player) ? ctx.player : null;
    if (!voter) return err("Check in first");
    const prompts = promptsFor(state);
    const ballot = findBallot(prompts, payload?.id);
    if (!ballot) return err("No such ballot");
    if (ballot.status !== "open") return err("Voting is closed");
    const question = ballot.questions.find(item => item.id === payload?.questionId);
    if (!question) return err("No such award");
    const choice = payload?.choice ?? null;
    const byBallot = prompts.responses[ballot.id] = prompts.responses[ballot.id] || {};
    const record = byBallot[voter];
    const current = record?.answers?.[question.id] ?? null;
    if (choice === current) return unchanged({ id:ballot.id, questionId:question.id, choice });
    if (choice !== null) {
      const problem = voteError(question, voter, choice);
      if (problem) return err(problem);
    }
    const answers = { ...(record?.answers || {}) };
    if (choice === null) delete answers[question.id];
    else answers[question.id] = choice;
    if (Object.keys(answers).length) byBallot[voter] = { answers, at:Date.now() };
    else delete byBallot[voter];
    return ok({ id:ballot.id, questionId:question.id, choice });
  },

  /* payload: { id, step } where step is the award to show, 1-based. The TV
     turns to it on the server clock. The first award discards every
     per-voter answer: from here only the totals exist. */
  promptReveal(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    const ballot = findBallot(prompts, payload?.id);
    if (!ballot) return err("No such ballot");
    if (ballot.status !== "closed" || !ballot.tally) return err("Close voting first");
    if (ballot.reveal?.done) return err("The awards are over");
    const shown = revealedCount(ballot);
    const step = Math.floor(Number(payload?.step));
    if (!Number.isInteger(step) || step < 1 || step > ballot.questions.length) return err("No such award");
    if (step <= shown) return unchanged({ id:ballot.id, step });
    if (step !== shown + 1) return err("Show the awards in order");
    const events = allEventsOf(state);
    const blocker = awardsRevealBlocker(state, events);
    if (blocker) return err(blocker);
    /* the TV has to be free: a scene that has said everything retires, a
       scene still mid-sequence is the commissioner's to finish */
    if (ctx?.showControl && state.showControl?.active) {
      const scene = resolveShowScene(state, events);
      if (scene?.staleReason) finishShowScene(state.showControl, "cancelled");
      else if (sceneAtLastStep(state.showControl.active)) finishShowScene(state.showControl, "completed");
      else return err("Finish the scene on the TV first");
    }
    const now = Date.now();
    ballot.reveal = { shown:step, at:now, done:false, doneAt:null };
    if (prompts.responses[ballot.id]) delete prompts.responses[ballot.id];
    return ok({ id:ballot.id, step });
  },

  /* The reveal ends (after the last award, or as Skip): every total is
     public and the TV goes back to the board. */
  promptRevealEnd(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    const ballot = findBallot(prompts, payload?.id);
    if (!ballot) return err("No such ballot");
    if (ballot.status !== "closed" || !ballot.tally) return err("Close voting first");
    if (ballot.reveal?.done) return unchanged({ id:ballot.id });
    const now = Date.now();
    ballot.reveal = { shown:ballot.questions.length, at:Number(ballot.reveal?.at) || now, done:true, doneAt:now };
    if (prompts.responses[ballot.id]) delete prompts.responses[ballot.id];
    return ok({ id:ballot.id });
  },

  /* a draft, or a closed ballot the commissioner no longer wants */
  promptDiscard(state, payload, ctx) {
    const g = gmOnly(ctx); if (g) return g;
    const prompts = promptsFor(state);
    if (typeof payload?.id !== "string" || !PROMPT_ID.test(payload.id)) return err("No such ballot");
    const index = prompts.ballots.findIndex(ballot => ballot.id === payload.id);
    if (index < 0) return unchanged({ id:payload.id });
    const ballot = prompts.ballots[index];
    if (ballot.status === "open") return err("Close voting first");
    if (ballot.reveal && !ballot.reveal.done) return err("End the reveal first");
    prompts.ballots.splice(index, 1);
    delete prompts.responses[ballot.id];
    return ok({ id:ballot.id });
  },
};

export const PROMPT_ACTION_TYPES = Object.freeze(Object.keys(PROMPT_ACTIONS));
export const PROMPT_ROSTER_SIZE = ROSTER.length;
