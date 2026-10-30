/* The Question bank desk's model (docs/TRIVIA-QBANK.md "The desk"): the
   bank's records with Brandon's edits and marks laid over them, the board
   he is picking (7 columns of 5), what the filters and search keep, a
   slot's alternatives, the warnings by slot, and the export he can carry
   to another device. The rules themselves (the cleaner, the merge, the
   warnings, what may play) are the bank's own, shared/triviaQBank.js.
   Pure. */
import {
  QBANK_CATEGORIES, QBANK_MARKS, QBANK_SLOTS, QBANK_VALUES, qbankEditPatch, qbankMerged, qbankPlayable,
} from "../../../shared/triviaQBank.js";

export const QBANK_TIERS = Object.freeze([1, 2, 3, 4, 5]);
/* what the desk's editor changes (the bank's QBANK_EDIT_FIELDS also lets
   the server stamp verified and personal when he marks one ready) */
export const DESK_EDIT_FIELDS = Object.freeze(["prompt", "options", "answer", "reveal", "tier", "media", "notes", "status"]);
export const STATUS_NAMES = Object.freeze({ ready:"Ready", confirm:"Needs your answer", asset:"Needs asset", rejected:"Rejected" });
/* the same, counted: "4 need your answer" */
export const STATUS_COUNTED = Object.freeze({ ready:"ready", confirm:"need your answer", asset:"need assets", rejected:"rejected" });
export const MARK_NAMES = Object.freeze({ fav:"Favorite", short:"Shortlist", reject:"Reject" });
export const REACH_NAMES = Object.freeze({ broad:"Broad", shared:"Shared", deep:"Deep cut" });
export const VERIFIED_NAMES = Object.freeze({ web:"Checked on the web", provided:"Brandon provided", suggested:"Suggested" });
export const PAGE_SIZE = 30;
export const LABEL_MAX = 28;
/* a phone's narrow slot */
export const LABEL_SHORT = 16;

export const categoryOf = id => QBANK_CATEGORIES.find(category => category.id === id) || null;
export const categoryName = id => categoryOf(id)?.name || id || "";
export const valueOfTier = tier => QBANK_VALUES[Number(tier) - 1] || 0;
export const tierOfSlot = slot => QBANK_TIERS[slot] || null;
export const answerOption = record => record?.options?.find(option => option.id === record.answer) || null;
export const slotKey = (col, slot) => `${col}:${slot}`;
export const revealsAnswer = record => !!record?.flags?.includes("reveals-answer");

/* "0:12" */
export function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/* the window a clip plays: "0:12 to 0:20" */
export function windowLabel(media) {
  if (!media || media.kind === "image") return "";
  const start = Number(media.start) || 0, duration = Number(media.duration) || 0;
  return duration > 0 ? `${clock(start)} to ${clock(start + duration)}` : `From ${clock(start)}`;
}

/* a slot's few words: the subject; a media clue's prompt is the same for
   every record ("Name the song."), so it reads as its answer (this desk is
   the host's); else the prompt's start, cut at a word */
export function slotLabel(record, max = LABEL_MAX) {
  if (!record) return "";
  const source = String(record.label || record.subject || (record.media && answerOption(record)?.text) || record.prompt || "")
    .replace(/\s+/g, " ").trim();
  if (source.length <= max) return source;
  const cut = source.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : source.slice(0, max)).replace(/[\s,.;:?!-]+$/, "")}…`;
}

/* ── the plan ── */
/* the board as seven columns of five, whatever the frame carried */
export function planColumns(plan) {
  const given = Array.isArray(plan?.columns) ? plan.columns : [];
  return QBANK_CATEGORIES.map((category, col) => {
    const column = given[col] || {};
    const slots = Array.from({ length:QBANK_SLOTS }, (_, slot) => (Array.isArray(column.slots) && column.slots[slot]) || null);
    return { category:column.category || category.id, name:column.name || categoryName(column.category || category.id), slots };
  });
}
/* where each record sits: qid -> [{ col, slot }] */
export function placements(plan) {
  const out = new Map();
  planColumns(plan).forEach((column, col) => column.slots.forEach((qid, slot) => {
    if (qid) out.set(qid, [...(out.get(qid) || []), { col, slot }]);
  }));
  return out;
}
/* the slot a record goes to in one tap: its category's column, its tier's row */
export function slotTarget(plan, record) {
  if (!record) return null;
  const col = planColumns(plan).findIndex(column => column.category === record.category);
  const slot = Number(record.tier) - 1;
  return col >= 0 && slot >= 0 && slot < QBANK_SLOTS ? { col, slot } : null;
}
/* every slot of a record's category column */
export function slotChoices(plan, record) {
  const columns = planColumns(plan);
  const col = columns.findIndex(column => column.category === record?.category);
  if (col < 0) return [];
  return columns[col].slots.map((qid, slot) => ({ col, slot, value:QBANK_VALUES[slot], qid, own:qid === record.id }));
}

/* ── the records ── */
/* The bank as the desk reads it: each record (GET /api/trivia/qbank sends
   it merged with its edit, the bank's `original` beside it) merged again
   with the edits in the commissioner's frame, so an edit from his other
   device shows at once; with its mark, whether it is edited, where it sits
   and whether it plays by force. `base` is the bank's own record. */
export function deskRecords(records, { edits = {}, marks = {}, plan = null } = {}) {
  const placed = placements(plan);
  return (records || []).map(input => {
    const { original, mark:_mark, edited:_edited, ...rest } = input;
    const base = original || rest;
    const patch = edits?.[base.id];
    const record = patch ? qbankMerged(base, patch) : base;
    return { ...record, base, edited:!!patch && Object.keys(patch).length > 0, mark:marks?.[base.id] || null,
      placed:placed.get(base.id) || [], forced:plan?.forced?.[base.id] === true };
  });
}
export const recordsById = records => new Map(records.map(record => [record.id, record]));

const fold = value => String(value || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
/* every word the search reads on a record: its subject and prompt, the
   four answers, the reveal, its topics, the guests it is aimed at, notes,
   the category and the id */
export function searchText(record) {
  const tags = record?.tags || {};
  return fold([record?.subject, record?.prompt, ...(record?.options || []).map(option => option.text), record?.reveal,
    ...(tags.topics || []), ...(tags.likely || []), ...(tags.possible || []), tags.reach, record?.notes, record?.id,
    categoryName(record?.category), record?.variantOf].filter(Boolean).join(" "));
}
export function matchesQuery(record, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = searchText(record);
  return words.every(word => hay.includes(word));
}

export const NO_FILTERS = Object.freeze({ category:"all", tier:"all", status:"all", mark:"all", query:"" });

export function matchesFilters(record, filters = NO_FILTERS) {
  const f = { ...NO_FILTERS, ...filters };
  if (f.category !== "all" && record.category !== f.category) return false;
  if (f.tier !== "all" && Number(record.tier) !== Number(f.tier)) return false;
  if (f.status !== "all" && record.status !== f.status) return false;
  if (f.mark === "none" ? !!record.mark : f.mark === "board" ? !record.placed?.length
    : f.mark !== "all" && record.mark !== f.mark) return false;
  return matchesQuery(record, f.query);
}

const CATEGORY_ORDER = new Map(QBANK_CATEGORIES.map((category, i) => [category.id, i]));
const STATUS_ORDER = { ready:0, confirm:1, asset:2, rejected:3 };
const MARK_ORDER = { fav:0, short:1 };
/* the bank's order: on the board, then favorites and the shortlist, then
   ready before not, a rejection last; within that category then value */
export function rankRecord(record) {
  return [record.mark === "reject" || record.status === "rejected" ? 1 : 0, record.placed?.length ? 0 : 1,
    MARK_ORDER[record.mark] ?? 2, STATUS_ORDER[record.status] ?? 4];
}
export function sortRecords(list, { byCategory = true } = {}) {
  return [...list].sort((a, b) => {
    if (byCategory) {
      const c = (CATEGORY_ORDER.get(a.category) ?? 9) - (CATEGORY_ORDER.get(b.category) ?? 9)
        || Number(a.tier) - Number(b.tier);
      if (c) return c;
    }
    const ra = rankRecord(a), rb = rankRecord(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return String(a.id).localeCompare(String(b.id));
  });
}

/* Clip variants fold under the record they vary: one card, its variants a
   switch on it. A variant whose parent the filters left out leads its own
   card. Order follows the list given. */
export function groupVariants(list) {
  const ids = new Set(list.map(record => record.id));
  const groups = new Map();
  const order = [];
  for (const record of list) {
    const head = record.variantOf && ids.has(record.variantOf) ? record.variantOf : record.id;
    if (!groups.has(head)) { groups.set(head, []); order.push(head); }
    groups.get(head).push(record);
  }
  return order.map(head => {
    const records = groups.get(head);
    records.sort((a, b) => (a.id === head ? -1 : b.id === head ? 1 : 0));
    return { id:head, records };
  });
}

/* the bank through the filters, ordered, variants folded */
export function bankView(records, filters = NO_FILTERS) {
  const kept = records.filter(record => matchesFilters(record, filters));
  return groupVariants(sortRecords(kept));
}

/* a slot's alternatives: the bank at that category and value, what sits
   there first (even at another value), then the bank's order */
export function slotAlternatives(records, plan, { col, slot }) {
  const column = planColumns(plan)[col];
  if (!column) return [];
  const tier = tierOfSlot(slot);
  const current = column.slots[slot];
  const list = records.filter(record => record.id === current || (record.category === column.category && Number(record.tier) === tier));
  return groupVariants(sortRecords(list, { byCategory:false }).sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : 0)));
}

/* ── warnings ── */
const kindOf = warning => warning?.kind || warning?.code || "";
const slotsOf = warning => Array.isArray(warning?.slots) ? warning.slots
  : Number.isInteger(warning?.col) && Number.isInteger(warning?.slot) ? [{ col:warning.col, slot:warning.slot }] : [];
/* the bank's warnings by slot: "col:slot" -> [warning]. A warning names
   one slot (col, slot) or several (`slots`) */
export function warningsBySlot(warnings) {
  const out = new Map();
  for (const warning of warnings || []) for (const { col, slot } of slotsOf(warning)) {
    const k = slotKey(col, slot);
    out.set(k, [...(out.get(k) || []), warning]);
  }
  return out;
}
/* The summary's lines: one per problem with every slot it names (the bank
   names a repeat once per slot), empty slots first as one line */
export function warningLines(warnings) {
  const lines = new Map();
  for (const warning of warnings || []) {
    const kind = kindOf(warning);
    const key = kind === "empty" ? "empty" : `${kind}|${warning.text}`;
    const line = lines.get(key) || { kind, text:warning.text || kind, slots:[] };
    for (const at of slotsOf(warning)) if (!line.slots.some(s => s.col === at.col && s.slot === at.slot)) line.slots.push(at);
    lines.set(key, line);
  }
  const out = [...lines.values()];
  for (const line of out) if (line.kind === "empty") line.text = line.slots.length === 1 ? "1 empty slot" : `${line.slots.length} empty slots`;
  return out.sort((a, b) => (b.kind === "empty") - (a.kind === "empty"));
}
/* how many things are wrong: every empty slot, and each other problem once */
export const warningCount = lines => lines.reduce((n, line) => n + (line.kind === "empty" ? line.slots.length : 1), 0);

/* The board as the desk draws it: per slot its record, label, lamp and
   whether it is warned. Lamps: ready lit cyan, needs your answer flashing
   amber, needs asset unlit, rejected struck; an empty slot has none. */
export function boardView(plan, byId, warnings) {
  const warned = warningsBySlot(warnings);
  return planColumns(plan).map((column, col) => ({
    ...column,
    cells:column.slots.map((qid, slot) => {
      const record = qid ? byId.get(qid) || null : null;
      const own = (warned.get(slotKey(col, slot)) || []).filter(warning => kindOf(warning) !== "empty");
      return { col, slot, qid, record, value:QBANK_VALUES[slot], label:record ? slotLabel(record) : qid ? "Missing" : "",
        short:record ? slotLabel(record, LABEL_SHORT) : qid ? "Missing" : "",
        lamp:!qid ? "empty" : !record ? "rejected" : record.mark === "reject" ? "rejected" : record.status,
        forced:!!record && plan?.forced?.[qid] === true, warnings:own };
    }),
  }));
}

/* filled slots, and how many of them the board can deal (ready, or put on
   to play anyway) */
export function planSummary(plan, byId) {
  let filled = 0, ready = 0;
  for (const column of planColumns(plan)) for (const qid of column.slots) {
    if (!qid) continue;
    filled += 1;
    if (qbankPlayable(byId.get(qid), plan)) ready += 1;
  }
  return { filled, ready, total:QBANK_CATEGORIES.length * QBANK_SLOTS };
}

export function statusCounts(records) {
  const out = { ready:0, confirm:0, asset:0, rejected:0 };
  for (const record of records) if (record.status in out) out[record.status] += 1;
  return out;
}

/* ── edits ── */
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/* What an edit sends: every field that differs from the bank's record, and
   every field the edit already kept (set back to the bank's value, so the
   server drops it); options by id, only those that changed; a clip only
   its start and length. Null when there is nothing to send. */
export function editPatch(base, draft, prior = null) {
  const patch = {};
  const kept = key => !!prior && key in prior;
  for (const k of DESK_EDIT_FIELDS) {
    if (k === "media") {
      if (!base.media || base.media.kind === "image" || !draft.media) continue;
      const media = {};
      for (const part of ["start", "duration"]) {
        const value = Number(draft.media[part]);
        if (value !== Number(base.media[part] || 0) || (kept("media") && part in prior.media)) media[part] = value;
      }
      if (Object.keys(media).length) patch.media = media;
    } else if (k === "options") {
      const changed = (draft.options || []).filter((option, i) => option.text !== base.options[i]?.text
        || (kept("options") && prior.options.some(own => own.id === option.id)));
      if (changed.length) patch.options = changed.map(({ id, text }) => ({ id, text }));
    } else if (k === "notes" ? (draft.notes || "") !== (base.notes || "") || kept("notes") : !same(draft[k], base[k]) || kept(k))
      patch[k] = draft[k];
  }
  return Object.keys(patch).length ? patch : null;
}
/* an edit checked the way the server will (qbankEditPatch: the record with
   the edit laid on it must meet every rule) */
export function checkEdit(base, draft, prior = null) {
  const patch = editPatch(base, draft, prior);
  if (!patch) return { patch:null };
  const checked = qbankEditPatch(base, patch, { today:new Date().toISOString().slice(0, 10) });
  if (checked.error) return { error:checked.error };
  return { patch };
}

/* ── export and import ── */
export const EXPORT_KIND = "field-day-trivia-plan";
export function exportPayload({ plan, edits, marks }, now = Date.now()) {
  return { kind:EXPORT_KIND, v:1, exportedAt:new Date(now).toISOString(),
    plan:{ columns:planColumns(plan).map(({ category, name, slots }) => ({ category, name, slots })),
      ...(plan?.forced && Object.keys(plan.forced).length ? { forced:plan.forced } : {}) },
    edits:edits || {}, marks:marks || {} };
}
export const exportFileName = (now = Date.now()) => `field-day-trivia-board-${new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;

const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
/* a file's text as the import write's payload, or what is wrong with it.
   The server checks it whole; this only catches a wrong file. */
export function parseImport(raw, { knownIds = null } = {}) {
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return { error:"That file isn't a saved board" }; }
  if (!isObject(data) || (data.kind && data.kind !== EXPORT_KIND)) return { error:"That file isn't a saved board" };
  const columns = data.plan?.columns;
  if (!Array.isArray(columns) || columns.length !== QBANK_CATEGORIES.length
    || columns.some(column => !Array.isArray(column?.slots) || column.slots.length !== QBANK_SLOTS))
    return { error:"That board isn't 7 columns of 5" };
  if (columns.some(column => !categoryOf(column.category))) return { error:"That board has a category the bank doesn't" };
  const edits = data.edits ?? {}, marks = data.marks ?? {};
  if (!isObject(edits) || !isObject(marks)) return { error:"That file's edits can't be read" };
  if (Object.values(marks).some(mark => !QBANK_MARKS.includes(mark))) return { error:"That file's marks can't be read" };
  if (knownIds) {
    const unknown = [...columns.flatMap(column => column.slots.filter(Boolean)), ...Object.keys(edits), ...Object.keys(marks)]
      .filter(id => !knownIds.has(id));
    if (unknown.length) return { error:`${unknown.length === 1 ? "1 question" : `${unknown.length} questions`} in that file aren't in the bank` };
  }
  return { plan:{ columns:columns.map(({ category, name, slots }) => ({ category, name:typeof name === "string" ? name : categoryName(category),
    slots:slots.map(qid => (typeof qid === "string" && qid) || null) })), ...(isObject(data.plan.forced) ? { forced:data.plan.forced } : {}) },
    edits, marks };
}

/* the Trivia desk's way in: how full the board is ("31 of 35"), or nothing
   before a plan exists */
export function qbankRowValue(state) {
  if (!state?.triviaPlan?.columns) return null;
  const filled = planColumns(state.triviaPlan).reduce((n, column) => n + column.slots.filter(Boolean).length, 0);
  return `${filled} of ${QBANK_CATEGORIES.length * QBANK_SLOTS}`;
}
