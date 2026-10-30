/* The Question bank desk's writes (docs/TRIVIA-QBANK.md "Selection and
   edits"): the commissioner's board (state.triviaPlan), his edits to bank
   records (state.triviaBankEdits) and his marks (state.triviaBankMarks).
   Configuration: a progress reset keeps them, and only the commissioner's
   frames carry them (worker/publicState.js). Every write is whole and
   idempotent: the same write again is acknowledged and changes nothing, so
   a retry is always safe. A running board game never changes: it dealt
   its own copy (worker/triviaBoard.js).

   Also the desk's read, `qbankDesk(state)` (GET /api/trivia/qbank), and
   the plan the Worker deals (`effectiveQBank`). */
import {
  QBANK_COLUMNS, QBANK_MARKS, QBANK_SLOTS, cleanQBankPlan, emptyQBankPlan, isQBankId, qbankCategory, qbankEditPatch, qbankMerged,
  qbankPlanStatus, qbankWarnings, QBANK_CATEGORIES, QBANK_VALUES,
} from "../shared/triviaQBank.js";
import { qbank } from "./triviaQBank/index.js";

export const QBANK_ACTION_TYPES = Object.freeze(["qbankAssign", "qbankEdit", "qbankMark", "qbankPlanReset", "qbankImport"]);

const isObj = value => !!value && typeof value === "object" && !Array.isArray(value);
const today = () => new Date().toISOString().slice(0, 10);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* the recommended board as a plan the desk starts from, else the empty
   one; either stays `from:"recommended"` until the commissioner changes it */
export const recommendedPlan = (now = 0) => {
  const plan = qbank().recommended;
  return { ...(plan ? structuredClone(plan) : emptyQBankPlan()), from:"recommended", updatedAt:now };
};
/* The board as it stands: the commissioner's, or the recommended one he
   has not touched. worker/state.js keeps an untouched board following the
   recommended one on every load (`from:"recommended"`). */
export const currentPlan = state => isObj(state?.triviaPlan) && Array.isArray(state.triviaPlan.columns) ? state.triviaPlan : null;

/* every record merged with its edit, by id */
export function mergedBank(state) {
  const edits = isObj(state?.triviaBankEdits) ? state.triviaBankEdits : {};
  const byId = new Map();
  for (const record of qbank().records) byId.set(record.id, qbankMerged(record, edits[record.id]));
  return byId;
}

/* What a board game deals: { plan, byId, status } (plan null when none is
   set or every slot is empty, so the set list plays). */
export function effectiveQBank(state) {
  const plan = currentPlan(state);
  const byId = mergedBank(state);
  if (!plan || !plan.columns.some(column => (column?.slots || []).some(Boolean))) return { plan:null, byId, status:null };
  return { plan, byId, status:qbankPlanStatus(plan, byId) };
}

/* GET /api/trivia/qbank: everything the desk draws. Records carry their
   edits merged (`edited`, and `original` the bank's own), their mark. */
export function qbankDesk(state) {
  const edits = isObj(state?.triviaBankEdits) ? state.triviaBankEdits : {};
  const marks = isObj(state?.triviaBankMarks) ? state.triviaBankMarks : {};
  const byId = mergedBank(state);
  const records = qbank().records.map(record => {
    const merged = byId.get(record.id);
    return { ...merged, mark:marks[record.id] || null, edited:!!edits[record.id], ...(edits[record.id] ? { original:record } : {}) };
  });
  const plan = currentPlan(state) || recommendedPlan();
  return { ok:true, categories:QBANK_CATEGORIES, values:QBANK_VALUES, records, plan, recommended:qbank().recommended,
    edits, marks, status:qbankPlanStatus(plan, byId), warnings:qbankWarnings(plan, byId) };
}

/* a new patch over the edit already kept */
function combinePatch(prior, patch) {
  if (!isObj(prior) || !isObj(patch)) return patch;
  const out = { ...prior, ...patch };
  if (Array.isArray(prior.options) && Array.isArray(patch.options)) {
    const byId = new Map(prior.options.map(option => [option.id, option]));
    for (const option of patch.options) if (isObj(option)) byId.set(option.id, option);
    out.options = [...byId.values()];
  }
  if (isObj(prior.media) && isObj(patch.media)) out.media = { ...prior.media, ...patch.media };
  /* an edit that no longer marks it ready drops the stamp that came with it */
  if ("status" in patch && patch.status !== "ready") { if (!("verified" in patch)) delete out.verified; if (!("personal" in patch)) delete out.personal; }
  return out;
}

export function qbankActions({ ok, err, gmOnly }) {
  const plan = state => structuredClone(currentPlan(state) || recommendedPlan());
  const save = (state, next) => {
    delete next.from;
    if (next.forced && !Object.keys(next.forced).length) delete next.forced;
    next.updatedAt = Date.now();
    state.triviaPlan = next;
  };
  return {
    /* A slot gets a clue (one of its column's category), or is emptied
       (`qid` null). A clue already elsewhere on the board moves here.
       `force` puts a clue that is not ready on the board to play anyway. */
    qbankAssign(state, { col, slot, qid = null, force } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!Number.isInteger(col) || col < 0 || col >= QBANK_COLUMNS || !Number.isInteger(slot) || slot < 0 || slot >= QBANK_SLOTS)
        return err("That slot isn't on the board");
      const next = plan(state);
      const column = next.columns[col];
      const was = column.slots[slot];
      let moved = null;
      if (qid === null || qid === "") {
        if (!was) return ok({ unchanged:true });
        column.slots[slot] = null;
        if (next.forced) delete next.forced[was];
      } else {
        if (!isQBankId(qid)) return err("That clue isn't in the bank");
        const record = qbank().byId.get(qid);
        if (!record) return err("That clue isn't in the bank");
        if (record.category !== column.category) return err(`That isn't a ${qbankCategory(column.category)?.name || "column"} clue`);
        const forced = force === undefined ? !!next.forced?.[qid] : force === true;
        if (was === qid && forced === !!next.forced?.[qid]) return ok({ unchanged:true });
        next.columns.forEach((other, c) => other.slots.forEach((id, s) => {
          if (id === qid && (c !== col || s !== slot)) { other.slots[s] = null; moved = { col:c, slot:s }; }
        }));
        if (was && was !== qid && next.forced) delete next.forced[was];
        column.slots[slot] = qid;
        if (forced) next.forced = { ...(next.forced || {}), [qid]:true };
        else if (next.forced) delete next.forced[qid];
      }
      save(state, next);
      return ok(moved ? { moved } : {});
    },
    /* The commissioner's edit to a record (`patch` null takes it back): the
       record with it must still meet every rule. Marking one ready himself
       stamps it verified by him. */
    qbankEdit(state, { qid, patch } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const base = isQBankId(qid) ? qbank().byId.get(qid) : null;
      if (!base) return err("That clue isn't in the bank");
      const edits = isObj(state.triviaBankEdits) ? state.triviaBankEdits : {};
      const prior = edits[qid] || null;
      /* a patch lands on the edit already there, field by field (options
         by id, the clip's start and length each); a field set back to the
         bank's own value drops out; `patch` null takes the whole edit back */
      const result = qbankEditPatch(base, patch === null || patch === undefined ? null : combinePatch(prior, patch), { today:today() });
      if (result.error) return err(result.error);
      if (same(prior, result.patch)) return ok({ unchanged:true });
      const next = { ...edits };
      if (result.patch) next[qid] = result.patch; else delete next[qid];
      state.triviaBankEdits = next;
      return ok({ record:result.record });
    },
    qbankMark(state, { qid, mark = null } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      if (!isQBankId(qid) || !qbank().byId.has(qid)) return err("That clue isn't in the bank");
      if (mark !== null && !QBANK_MARKS.includes(mark)) return err("Mark it Favorite, Shortlist or Reject");
      const marks = isObj(state.triviaBankMarks) ? state.triviaBankMarks : {};
      if ((marks[qid] || null) === mark) return ok({ unchanged:true });
      const next = { ...marks };
      if (mark) next[qid] = mark; else delete next[qid];
      state.triviaBankMarks = next;
      return ok();
    },
    /* back to the recommended board (the empty board without one) */
    qbankPlanReset(state, payload, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const next = recommendedPlan(Date.now());
      const current = currentPlan(state);
      if (current && current.from === next.from && same(current.columns, next.columns) && same(current.forced, next.forced))
        return ok({ unchanged:true });
      state.triviaPlan = next;
      return ok();
    },
    /* A board, edits and marks exported earlier, checked whole: any part
       that does not fit refuses the import, and nothing changes. */
    qbankImport(state, { plan:input, edits = {}, marks = {} } = {}, ctx) {
      const g = gmOnly(ctx); if (g) return g;
      const bank = qbank().byId;
      const cleaned = cleanQBankPlan(input, bank);
      if (cleaned.error) return err(cleaned.error);
      if (!isObj(edits) || !isObj(marks)) return err("That file didn't come through whole");
      const nextEdits = {};
      for (const [qid, patch] of Object.entries(edits)) {
        const base = bank.get(qid);
        if (!base) return err(`${qid} isn't in the bank`);
        const result = qbankEditPatch(base, patch, { today:today() });
        if (result.error) return err(`${qid}: ${result.error}`);
        if (result.patch) nextEdits[qid] = result.patch;
      }
      const nextMarks = {};
      for (const [qid, mark] of Object.entries(marks)) {
        if (!bank.has(qid)) return err(`${qid} isn't in the bank`);
        if (mark === null) continue;
        if (!QBANK_MARKS.includes(mark)) return err(`${qid}: mark it fav, short or reject`);
        nextMarks[qid] = mark;
      }
      const current = currentPlan(state);
      if (current && same(current.columns, cleaned.plan.columns) && same(current.forced, cleaned.plan.forced) && !current.from
          && same(state.triviaBankEdits || {}, nextEdits) && same(state.triviaBankMarks || {}, nextMarks))
        return ok({ unchanged:true });
      const next = cleaned.plan;
      next.updatedAt = Date.now();
      state.triviaPlan = next;
      state.triviaBankEdits = nextEdits;
      state.triviaBankMarks = nextMarks;
      return ok();
    },
  };
}
