/* The Question bank desk's model (docs/TRIVIA-QBANK.md "The desk"): the
   bank's records with Brandon's edits and marks laid over them, the board
   he is picking (7 columns of 5), what the filters and search keep, a
   slot's alternatives, the warnings by slot, and the export he can carry
   to another device. The rules themselves (the cleaner, the merge, the
   warnings) are the engine's, read through qbankEngine.js. Pure. */
import {
  QBANK_CATEGORIES, QBANK_EDIT_KEYS, QBANK_MARKS, QBANK_SLOTS, QBANK_TIERS, QBANK_VALUES, cleanQBankRecord, mergeQBankEdit,
} from "./qbankEngine.js";

export const STATUS_NAMES = Object.freeze({ ready:"Ready", confirm:"Needs your answer", asset:"Needs asset", rejected:"Rejected" });
/* the same, counted: "4 need your answer" */
export const STATUS_COUNTED = Object.freeze({ ready:"ready", confirm:"need your answer", asset:"need assets", rejected:"rejected" });
export const MARK_NAMES = Object.freeze({ fav:"Favorite", short:"Shortlist", reject:"Reject" });
export const KIND_NAMES = Object.freeze({ image:"Image", audio:"Audio", video:"Video" });
export const REACH_NAMES = Object.freeze({ broad:"Broad", shared:"Shared", deep:"Deep cut" });
export const VERIFIED_NAMES = Object.freeze({ web:"Checked on the web", provided:"Brandon provided", suggested:"Suggested" });
export const PAGE_SIZE = 30;
export const LABEL_MAX = 28;

export const categoryOf = id => QBANK_CATEGORIES.find(category => category.id === id) || null;
export const categoryName = id => categoryOf(id)?.name || id || "";
export const valueOfTier = tier => QBANK_VALUES[Number(tier) - 1] || 0;
export const tierOfSlot = slot => QBANK_TIERS[slot] || null;
export const answerOption = record => record?.options?.find(option => option.id === record.answer) || null;
export const slotKey = (col, slot) => `${col}:${slot}`;

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

/* a slot's few words: its own label or subject; a media clue's prompt is
   the same for every record ("Name the song."), so it reads as its answer
   (this desk is the host's); else the prompt's start, cut at a word */
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
/* every slot of a record's category column, the target first */
export function slotChoices(plan, record) {
  const columns = planColumns(plan);
  const col = columns.findIndex(column => column.category === record?.category);
  if (col < 0) return [];
  return columns[col].slots.map((qid, slot) => ({ col, slot, value:QBANK_VALUES[slot], qid, own:qid === record.id }));
}

/* ── the records ── */
/* the bank as the desk reads it: each record merged with its edit, with
   its mark, whether it is edited and where it sits */
export function deskRecords(records, { edits = {}, marks = {}, plan = null } = {}) {
  const placed = placements(plan);
  return (records || []).map(base => {
    const patch = edits?.[base.id];
    const record = patch ? mergeQBankEdit(base, patch) : base;
    return { ...record, base, edited:!!patch && Object.keys(patch).length > 0, mark:marks?.[base.id] || null,
      placed:placed.get(base.id) || [] };
  });
}

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
   there first, then the bank's order */
export function slotAlternatives(records, plan, { col, slot }) {
  const column = planColumns(plan)[col];
  if (!column) return [];
  const tier = tierOfSlot(slot);
  const current = column.slots[slot];
  const list = records.filter(record => record.category === column.category && Number(record.tier) === tier);
  return groupVariants(sortRecords(list, { byCategory:false }).sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : 0)));
}

/* ── warnings ── */
/* the engine's warnings by slot: "col:slot" -> [warning] */
export function warningsBySlot(warnings) {
  const out = new Map();
  for (const warning of warnings || []) {
    const slots = Array.isArray(warning?.slots) ? warning.slots
      : Number.isInteger(warning?.col) && Number.isInteger(warning?.slot) ? [{ col:warning.col, slot:warning.slot }] : [];
    for (const { col, slot } of slots) {
      const k = slotKey(col, slot);
      out.set(k, [...(out.get(k) || []), warning]);
    }
  }
  return out;
}
/* the summary's lines: empty slots in one line, every other warning its own */
export function warningLines(warnings) {
  const list = warnings || [];
  const empty = list.filter(warning => warning.code === "empty");
  const rest = list.filter(warning => warning.code !== "empty");
  return [
    ...(empty.length ? [{ code:"empty", text:empty.length === 1 ? "1 empty slot" : `${empty.length} empty slots`,
      slots:empty.flatMap(warning => warning.slots || []) }] : []),
    ...rest.map(warning => ({ code:warning.code, text:warning.text || warning.code, slots:warning.slots || [] })),
  ];
}

/* The board as the desk draws it: per slot its record, label, lamp and
   whether it is warned. Lamps: ready lit cyan, needs your answer flashing
   amber, needs asset unlit, rejected struck; an empty slot has none. */
export function boardView(plan, byId, warnings) {
  const warned = warningsBySlot(warnings);
  return planColumns(plan).map((column, col) => ({
    ...column,
    cells:column.slots.map((qid, slot) => {
      const record = qid ? byId.get(qid) || null : null;
      const own = (warned.get(slotKey(col, slot)) || []).filter(warning => warning.code !== "empty");
      return { col, slot, qid, record, value:QBANK_VALUES[slot], label:record ? slotLabel(record) : qid ? "Missing" : "",
        lamp:!qid ? "empty" : !record ? "rejected" : record.mark === "reject" ? "rejected" : record.status,
        warnings:own };
    }),
  }));
}

export function planSummary(plan, byId) {
  let filled = 0, ready = 0;
  for (const column of planColumns(plan)) for (const qid of column.slots) {
    if (!qid) continue;
    filled += 1;
    if (byId.get(qid)?.status === "ready") ready += 1;
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
/* what an edit changes from the bank's record: only the keys that differ
   (a media window only its start and duration); null when nothing does */
export function editPatch(base, draft) {
  const patch = {};
  for (const k of QBANK_EDIT_KEYS) {
    if (k === "media") {
      if (!base.media || base.media.kind === "image" || !draft.media) continue;
      const media = {};
      if (Number(draft.media.start) !== Number(base.media.start || 0)) media.start = Number(draft.media.start);
      if (Number(draft.media.duration) !== Number(base.media.duration || 0)) media.duration = Number(draft.media.duration);
      if (Object.keys(media).length) patch.media = media;
    } else if (k === "notes" ? (draft.notes || "") !== (base.notes || "") : !same(draft[k], base[k])) patch[k] = draft[k];
  }
  return Object.keys(patch).length ? patch : null;
}
/* an edit checked the way the server will: the bank's cleaner over the
   record with the edit laid on it */
export function checkEdit(base, draft) {
  const patch = editPatch(base, draft);
  const checked = cleanQBankRecord(patch ? mergeQBankEdit(base, patch) : base);
  if (checked.error) return { error:checked.error };
  return { patch };
}

/* ── export and import ── */
export const EXPORT_KIND = "field-day-trivia-plan";
export function exportPayload({ plan, edits, marks }, now = Date.now()) {
  return { kind:EXPORT_KIND, v:1, exportedAt:new Date(now).toISOString(),
    plan:{ columns:planColumns(plan).map(({ category, name, slots }) => ({ category, name, slots })) },
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
    slots:slots.map(qid => (typeof qid === "string" && qid) || null) })) }, edits, marks };
}

/* the Trivia desk's way in: how full the board is ("31 of 35"), or nothing
   before a plan exists */
export function qbankRowValue(state) {
  if (!state?.triviaPlan?.columns) return null;
  const filled = planColumns(state.triviaPlan).reduce((n, column) => n + column.slots.filter(Boolean).length, 0);
  return `${filled} of ${QBANK_CATEGORIES.length * QBANK_SLOTS}`;
}
