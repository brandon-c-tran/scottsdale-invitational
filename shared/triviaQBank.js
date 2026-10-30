/* The Trivia question bank (docs/TRIVIA-QBANK.md): Brandon's board of seven
   categories at 100 to 500, picked from a larger bank of prepared clues.
   This module is the record's contract as code, and pure: it never holds
   a record. The records (answers and all) live only in the Worker
   (worker/triviaQBank/*.json, loaded by worker/triviaQBank/index.js) and
   reach the commissioner over GET /api/trivia/qbank; nothing under src/ or
   shared/ imports them (tests/trivia-qbank.test.mjs scans).

   A record (worker/triviaQBank/<category>.json, one array each):
     { id, category, tier:1..5, format:"choice"|"image"|"audio"|"video",
       prompt, subject?, options:[{ id, text }] x4, answer:<option id>,
       reveal, media?, revealMedia?, variantOf?, sources:[{ url, note?, checkedAt? }],
       verified?:{ by:"web"|"provided"|"suggested", at, cutoff? },
       status:"ready"|"confirm"|"asset"|"rejected",
       personal?:"provided"|"needs-brandon", surprise?:true,
       tags:{ topics, likely, possible, reach }, notes?,
       flags?:["reveals-answer"] }   an asset the builder knows gives it away
   media:  { kind:"image"|"audio"|"video", src:"/tq/<12 hex>.<ext>", w?, h?,
             start?, duration?, mime?, poster? }
   revealMedia: { kind:"image", src, w, h }

   The commissioner's configuration (state, kept by a progress reset, sent
   to the commissioner only):
     state.triviaPlan = { columns:[{ category, name, slots:[qid|null] x5 }] x7,
       forced?:{ [qid]:true }, from?:"recommended", updatedAt }
     state.triviaBankEdits = { [qid]:patch }   (mergeQBankEdit)
     state.triviaBankMarks = { [qid]:"fav"|"short"|"reject" }

   A plan game (dealPlan) deals the plan exactly: column order, the slot's
   value (QBANK_VALUES), the record merged with its edits, its options in a
   seeded order kept with their ids (`optionIds`), the answer re-indexed.
   Every reducer and screen keeps reading `options:[text]` and
   `answer:index`. */
import { cleanFreeText } from "./freeText.js";

export const QBANK_CATEGORIES = Object.freeze([
  Object.freeze({ id:"nba", name:"Who He Play For?", short:"NBA" }),
  Object.freeze({ id:"kim", name:"Kim & Winnie", short:"Kim & Winnie" }),
  Object.freeze({ id:"lore", name:"Brandon Lore", short:"Lore" }),
  Object.freeze({ id:"aux", name:"Pass the Aux", short:"Aux" }),
  Object.freeze({ id:"web", name:"Internet Archaeology", short:"Old Web" }),
  Object.freeze({ id:"sound", name:"You Know This Sound", short:"Sounds" }),
  Object.freeze({ id:"sil", name:"Silhouette Showdown", short:"Shadows" }),
]);
export const QBANK_CATEGORY_IDS = Object.freeze(QBANK_CATEGORIES.map(category => category.id));
export const qbankCategory = id => QBANK_CATEGORIES.find(category => category.id === id) || null;
/* the categories whose clues are about Brandon and Kim: personal facts */
export const QBANK_PERSONAL = Object.freeze(["kim", "lore"]);
export const QBANK_VALUES = Object.freeze([100, 200, 300, 400, 500]);
export const QBANK_COLUMNS = QBANK_CATEGORIES.length;
export const QBANK_SLOTS = QBANK_VALUES.length;
export const QBANK_FORMATS = Object.freeze(["choice", "image", "audio", "video"]);
export const QBANK_STATUSES = Object.freeze(["ready", "confirm", "asset", "rejected"]);
export const QBANK_MARKS = Object.freeze(["fav", "short", "reject"]);
export const QBANK_REACH = Object.freeze(["broad", "shared", "deep"]);
export const QBANK_VERIFIED_BY = Object.freeze(["web", "provided", "suggested"]);
export const QBANK_FLAGS = Object.freeze(["reveals-answer"]);
/* a media file's kind and the extensions it may have */
export const QBANK_MEDIA_EXT = Object.freeze({ image:Object.freeze(["webp", "jpg", "png"]), audio:Object.freeze(["mp3", "m4a"]),
  video:Object.freeze(["mp4", "webm"]) });
export const QBANK_MEDIA_KINDS = Object.freeze(Object.keys(QBANK_MEDIA_EXT));
/* the longest clip a clue plays, in seconds */
export const QBANK_CLIP_MAX_S = 30;
export const QBANK_LIMITS = Object.freeze({ id:48, prompt:140, subject:60, option:50, reveal:600, notes:1000, name:32,
  source:10, tag:24, tags:16, note:200 });
/* the patch fields a commissioner's edit may carry (verified and
   personal are the server's own stamps when he marks a clue ready himself) */
export const QBANK_EDIT_FIELDS = Object.freeze(["prompt", "subject", "options", "answer", "reveal", "tier", "media", "notes",
  "status", "verified", "personal"]);

const ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const OPTION_ID = /^[a-z0-9]{1,8}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const SRC = /^\/tq\/([0-9a-f]{12})\.([a-z0-9]+)$/;
const NOT_AN_OPTION = /\b(all|none|both|neither) of (the )?(above|these|them)\b/i;

export const isQBankId = value => typeof value === "string" && value.length <= QBANK_LIMITS.id && ID.test(value);
const isObj = value => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" ? cleanFreeText(value, Infinity) : "";
const validDate = value => typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(value));
const posInt = value => Number.isInteger(value) && value > 0;
/* seconds into a file, to the millisecond */
const seconds = value => Math.round(Number(value) * 1000) / 1000;

/* a media src: /tq/<12 hex>.<ext>, the extension one of its kind's */
export function qbankMediaSrc(src, kind) {
  const match = typeof src === "string" ? SRC.exec(src) : null;
  return !!match && !!QBANK_MEDIA_EXT[kind]?.includes(match[2]);
}

function cleanMedia(input, format, field) {
  if (!isObj(input)) return { error:`${field} is missing` };
  const kind = input.kind;
  if (!QBANK_MEDIA_KINDS.includes(kind)) return { error:`${field}.kind must be image, audio or video` };
  if (!qbankMediaSrc(input.src, kind)) return { error:`${field}.src must be /tq/<12 hex>.${QBANK_MEDIA_EXT[kind].join("|")}` };
  const out = { kind, src:input.src };
  if (kind !== "audio" || input.w !== undefined || input.h !== undefined) {
    if (!posInt(input.w) || !posInt(input.h)) return { error:`${field} needs its w and h in pixels` };
    out.w = input.w; out.h = input.h;
  }
  if (kind === "audio" || kind === "video") {
    const start = input.start === undefined ? 0 : seconds(input.start);
    const duration = seconds(input.duration);
    if (!Number.isFinite(start) || start < 0) return { error:`${field}.start must be 0 or more seconds` };
    if (!Number.isFinite(duration) || duration <= 0 || duration > QBANK_CLIP_MAX_S)
      return { error:`${field}.duration must be 0 to ${QBANK_CLIP_MAX_S} seconds` };
    out.start = start; out.duration = duration;
  } else if (input.start !== undefined || input.duration !== undefined) return { error:`${field}: an image has no start or duration` };
  if (input.mime !== undefined) {
    if (typeof input.mime !== "string" || !input.mime.startsWith(`${kind}/`)) return { error:`${field}.mime must be ${kind}/...` };
    out.mime = input.mime;
  }
  if (input.poster !== undefined) {
    if (kind !== "video" || !qbankMediaSrc(input.poster, "image")) return { error:`${field}.poster must be a video's /tq/ image` };
    out.poster = input.poster;
  }
  if (format && format !== kind) return { error:`${field}.kind must match the format (${format})` };
  return { media:out };
}

function cleanTags(input) {
  if (!isObj(input)) return { error:"tags are missing" };
  const list = (value, name) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > QBANK_LIMITS.tags) return null;
    const out = value.map(item => text(item)).filter(Boolean);
    return out.length === value.length && out.every(item => item.length <= QBANK_LIMITS.tag) ? out : null;
  };
  const topics = list(input.topics), likely = list(input.likely), possible = list(input.possible);
  if (!topics || !likely || !possible) return { error:`tags: topics, likely and possible are lists of words up to ${QBANK_LIMITS.tag} characters` };
  if (!QBANK_REACH.includes(input.reach)) return { error:"tags.reach must be broad, shared or deep" };
  return { tags:{ topics, likely, possible, reach:input.reach } };
}

/* is the answer verified: a dated source, or provided by Brandon */
export const qbankVerified = record => record?.verified?.by === "provided" && validDate(record.verified.at)
  || (record?.verified?.by === "web" && validDate(record.verified.at) && (record.sources || []).some(source => URL_RE.test(source?.url || "")))
  || (record?.sources || []).some(source => URL_RE.test(source?.url || "") && validDate(source?.checkedAt));
/* every media file a record plays or reveals */
export const qbankMediaFiles = record => [record?.media?.src, record?.media?.poster, record?.revealMedia?.src].filter(Boolean);

/* One bank record, every rule the contract sets that a record can be held
   to on its own: { record } (text trimmed, nothing extra) or { error }.
   `mediaExists(src)` (optional) checks a ready record's files are there. */
export function cleanQBankRecord(input, { mediaExists = null } = {}) {
  if (!isObj(input)) return { error:"a record is an object" };
  const fail = error => ({ error:`${typeof input.id === "string" ? input.id : "record"}: ${error}` });
  if (!isQBankId(input.id)) return fail(`id must be lowercase a-z, 0-9 and dashes, up to ${QBANK_LIMITS.id}`);
  if (!QBANK_CATEGORY_IDS.includes(input.category)) return fail(`category must be one of ${QBANK_CATEGORY_IDS.join(", ")}`);
  if (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > 5) return fail("tier must be 1 to 5");
  if (!QBANK_FORMATS.includes(input.format)) return fail("format must be choice, image, audio or video");
  const prompt = text(input.prompt);
  if (!prompt) return fail("prompt is missing");
  if (prompt.length > QBANK_LIMITS.prompt) return fail(`prompt is over ${QBANK_LIMITS.prompt} characters`);
  const record = { id:input.id, category:input.category, tier:input.tier, format:input.format, prompt };
  if (input.subject !== undefined && input.subject !== null && input.subject !== "") {
    const subject = text(input.subject);
    if (!subject || subject.length > QBANK_LIMITS.subject) return fail(`subject is up to ${QBANK_LIMITS.subject} characters`);
    record.subject = subject;
  }
  if (!Array.isArray(input.options) || input.options.length !== 4) return fail("exactly four options");
  const options = [];
  for (const option of input.options) {
    if (!isObj(option) || !OPTION_ID.test(option.id || "")) return fail("each option is { id, text } with a short lowercase id");
    const value = text(option.text);
    if (!value) return fail(`option ${option.id} has no text`);
    if (value.length > QBANK_LIMITS.option) return fail(`option ${option.id} is over ${QBANK_LIMITS.option} characters`);
    if (NOT_AN_OPTION.test(value)) return fail(`option ${option.id}: no "all/none of the above"`);
    options.push({ id:option.id, text:value });
  }
  if (new Set(options.map(option => option.id)).size !== 4) return fail("option ids must differ");
  if (new Set(options.map(option => option.text.toLowerCase())).size !== 4) return fail("two options say the same thing");
  record.options = options;
  if (!options.some(option => option.id === input.answer)) return fail("answer must be one option's id");
  record.answer = input.answer;
  const reveal = text(input.reveal);
  if (reveal.length > QBANK_LIMITS.reveal) return fail(`reveal is over ${QBANK_LIMITS.reveal} characters`);
  record.reveal = reveal;
  if (input.format === "choice") {
    if (input.media) return fail("a choice clue has no media (use the image format for a photo)");
  } else {
    const media = cleanMedia(input.media, input.format, "media");
    if (media.error) return fail(media.error);
    record.media = media.media;
  }
  if (input.revealMedia !== undefined && input.revealMedia !== null) {
    const media = cleanMedia(input.revealMedia, null, "revealMedia");
    if (media.error) return fail(media.error);
    if (media.media.kind !== "image") return fail("revealMedia is an image");
    record.revealMedia = media.media;
  }
  if (input.variantOf !== undefined && input.variantOf !== null) {
    if (!isQBankId(input.variantOf) || input.variantOf === input.id) return fail("variantOf names another record's id");
    record.variantOf = input.variantOf;
  }
  if (!Array.isArray(input.sources) || input.sources.length > QBANK_LIMITS.source) return fail(`sources is a list (up to ${QBANK_LIMITS.source})`);
  const sources = [];
  for (const source of input.sources) {
    if (!isObj(source) || !URL_RE.test(source.url || "")) return fail("each source has an http(s) url");
    const out = { url:source.url };
    if (source.note !== undefined) { const note = text(source.note); if (note.length > QBANK_LIMITS.note) return fail("a source note is too long"); if (note) out.note = note; }
    if (source.checkedAt !== undefined) { if (!validDate(source.checkedAt)) return fail("a source's checkedAt is YYYY-MM-DD"); out.checkedAt = source.checkedAt; }
    sources.push(out);
  }
  record.sources = sources;
  if (input.verified !== undefined && input.verified !== null) {
    const v = input.verified;
    if (!isObj(v) || !QBANK_VERIFIED_BY.includes(v.by) || !validDate(v.at)) return fail("verified is { by:web|provided|suggested, at:YYYY-MM-DD }");
    if (v.cutoff !== undefined && !validDate(v.cutoff)) return fail("verified.cutoff is YYYY-MM-DD");
    record.verified = { by:v.by, at:v.at, ...(v.cutoff ? { cutoff:v.cutoff } : {}) };
  }
  if (!QBANK_STATUSES.includes(input.status)) return fail("status must be ready, confirm, asset or rejected");
  record.status = input.status;
  if (input.personal !== undefined && input.personal !== null) {
    if (!["provided", "needs-brandon"].includes(input.personal)) return fail("personal must be provided or needs-brandon");
    if (!QBANK_PERSONAL.includes(input.category)) return fail("personal is for Kim & Winnie and Brandon Lore only");
    if (input.personal === "needs-brandon" && !["confirm", "rejected"].includes(input.status)) return fail("a needs-brandon record stays confirm");
    record.personal = input.personal;
  }
  if (input.surprise !== undefined) {
    if (input.surprise !== true) return fail("surprise is true or absent");
    record.surprise = true;
  }
  const tags = cleanTags(input.tags);
  if (tags.error) return fail(tags.error);
  record.tags = tags.tags;
  if (input.notes !== undefined && input.notes !== null) {
    const notes = cleanFreeText(typeof input.notes === "string" ? input.notes : "", Infinity, { lines:true });
    if (notes.length > QBANK_LIMITS.notes) return fail(`notes are over ${QBANK_LIMITS.notes} characters`);
    if (notes) record.notes = notes;
  }
  if (input.flags !== undefined) {
    if (!Array.isArray(input.flags) || !input.flags.every(flag => QBANK_FLAGS.includes(flag))) return fail(`flags may hold ${QBANK_FLAGS.join(", ")}`);
    if (input.flags.length) record.flags = [...new Set(input.flags)];
  }
  if (record.status === "ready") {
    if (!qbankVerified(record)) return fail("ready needs a dated source (checkedAt) or verified by provided");
    if (!record.reveal) return fail("ready needs its reveal text");
    if (mediaExists) for (const src of qbankMediaFiles(record)) if (!mediaExists(src)) return fail(`ready, but ${src} is not in public/tq/`);
  }
  for (const extra of Object.keys(input)) if (!RECORD_KEYS.has(extra)) return fail(`unknown field ${extra}`);
  return { record };
}
const RECORD_KEYS = new Set(["id", "category", "tier", "format", "prompt", "subject", "options", "answer", "reveal", "media", "revealMedia",
  "variantOf", "sources", "verified", "status", "personal", "surprise", "tags", "notes", "flags"]);

/* A record with the commissioner's patch on it (not yet checked: clean it
   with cleanQBankRecord). Options merge by id (a patch may give all four,
   or just the texts it changes); a media patch moves only the clip's
   window, never its file. */
export function mergeQBankEdit(record, patch) {
  if (!record) return null;
  if (!isObj(patch)) return structuredClone(record);
  const out = structuredClone(record);
  for (const key of QBANK_EDIT_FIELDS) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const value = patch[key];
    if (key === "options") {
      if (!Array.isArray(value)) continue;
      const byId = new Map(value.filter(isObj).map(option => [option.id, option]));
      out.options = (out.options || []).map(option => byId.has(option.id) ? { id:option.id, text:byId.get(option.id).text } : option);
    } else if (key === "media") {
      if (!isObj(value) || !out.media) continue;
      if (value.start !== undefined) out.media.start = value.start;
      if (value.duration !== undefined) out.media.duration = value.duration;
    } else if (key === "subject" && (value === null || value === "")) delete out.subject;
    else if (key === "notes" && (value === null || value === "")) delete out.notes;
    else out[key] = structuredClone(value);
  }
  return out;
}

/* The commissioner's edit to one record, checked: the patch reduced to
   the fields that differ from the bank record, and the merged record,
   which must still meet every rule. Marking a clue ready himself stamps it
   verified by "provided" when it had no verification (`today`, YYYY-MM-DD),
   and a personal clue waiting on him as "provided".
   { patch, record } (patch null: nothing differs) or { error }. */
export function qbankEditPatch(base, patch, { today = null } = {}) {
  if (!base) return { error:"That clue isn't in the bank" };
  if (patch === null) return { patch:null, record:base };
  if (!isObj(patch)) return { error:"That edit didn't come through whole. Save it again" };
  const unknown = Object.keys(patch).find(key => !QBANK_EDIT_FIELDS.includes(key));
  if (unknown) return { error:`Can't edit ${unknown}` };
  if (patch.media !== undefined && (!isObj(patch.media) || Object.keys(patch.media).some(key => key !== "start" && key !== "duration")))
    return { error:"Only the clip's start and length can change" };
  if (patch.media !== undefined && !["audio", "video"].includes(base.media?.kind)) return { error:"That clue has no clip" };
  if (patch.options !== undefined && (!Array.isArray(patch.options)
      || patch.options.some(option => !isObj(option) || !(base.options || []).some(own => own.id === option.id))))
    return { error:"Options keep their ids" };
  const stamped = { ...patch };
  /* his own "ready" is his word: verified by him, and a personal clue that
     waited on his answer has it */
  if (patch.status === "ready" && !qbankVerified(mergeQBankEdit(base, patch)) && validDate(today))
    stamped.verified = { by:"provided", at:today };
  if (patch.status === "ready" && base.personal === "needs-brandon" && patch.personal === undefined) stamped.personal = "provided";
  const merged = mergeQBankEdit(base, stamped);
  const cleaned = cleanQBankRecord(merged);
  if (cleaned.error) return { error:cleaned.error.replace(/^[^:]+: /, "") };
  const record = cleaned.record;
  const out = {};
  for (const key of QBANK_EDIT_FIELDS) {
    if (key === "options") {
      const changed = record.options.filter((option, i) => option.text !== base.options[i]?.text);
      if (changed.length) out.options = changed;
    } else if (key === "media") {
      if (!record.media || !base.media) continue;
      const window = {};
      if (record.media.start !== base.media.start) window.start = record.media.start;
      if (record.media.duration !== base.media.duration) window.duration = record.media.duration;
      if (Object.keys(window).length) out.media = window;
    } else if (JSON.stringify(record[key] ?? null) !== JSON.stringify(base[key] ?? null)) out[key] = record[key] ?? null;
  }
  return { patch:Object.keys(out).length ? out : null, record };
}

/* every record with the commissioner's edits on it; an edit the bank no
   longer accepts (the record changed under it) leaves the record as it is */
export function qbankMerged(record, patch) {
  if (!patch) return record;
  const cleaned = cleanQBankRecord(mergeQBankEdit(record, patch));
  return cleaned.record || record;
}

/* ── the plan ── */

/* the empty board: the seven categories in order, every slot open */
export const emptyQBankPlan = (updatedAt = 0) => ({ columns:QBANK_CATEGORIES.map(category => ({ category:category.id,
  name:category.name, slots:Array(QBANK_SLOTS).fill(null) })), updatedAt });

/* A plan checked whole (an import, the recommended board): seven columns of
   five slots, each slot a record of its column's category or empty, no
   record twice. `recordsById` is a Map or an object of the bank. */
export function cleanQBankPlan(input, recordsById = null, { updatedAt = 0 } = {}) {
  const get = id => recordsById instanceof Map ? recordsById.get(id) : recordsById?.[id];
  if (!isObj(input) || !Array.isArray(input.columns)) return { error:"That board didn't come through whole" };
  if (input.columns.length !== QBANK_COLUMNS) return { error:`The board has ${QBANK_COLUMNS} columns` };
  const seen = new Set();
  const columns = [];
  for (const [col, column] of input.columns.entries()) {
    if (!isObj(column) || !QBANK_CATEGORY_IDS.includes(column.category)) return { error:`Column ${col + 1} needs a category` };
    if (!Array.isArray(column.slots) || column.slots.length !== QBANK_SLOTS) return { error:`Column ${col + 1} has ${QBANK_SLOTS} slots` };
    const name = cleanFreeText(typeof column.name === "string" ? column.name : "", QBANK_LIMITS.name) || qbankCategory(column.category).name;
    const slots = [];
    for (const qid of column.slots) {
      if (qid === null || qid === undefined || qid === "") { slots.push(null); continue; }
      if (!isQBankId(qid)) return { error:`Column ${col + 1} has a bad clue id` };
      if (recordsById) {
        const record = get(qid);
        if (!record) return { error:`${qid} isn't in the bank` };
        if (record.category !== column.category) return { error:`${qid} isn't a ${qbankCategory(column.category).name} clue` };
      }
      if (seen.has(qid)) return { error:`${qid} is on the board twice` };
      seen.add(qid);
      slots.push(qid);
    }
    columns.push({ category:column.category, name, slots });
  }
  const forced = {};
  if (input.forced !== undefined && input.forced !== null) {
    if (!isObj(input.forced)) return { error:"That board didn't come through whole" };
    for (const [qid, on] of Object.entries(input.forced)) if (on === true && seen.has(qid)) forced[qid] = true;
  }
  return { plan:{ columns, ...(Object.keys(forced).length ? { forced } : {}), updatedAt:Number(input.updatedAt) || updatedAt } };
}

/* every qid on the board, in reading order of the columns */
export const planQids = plan => (plan?.columns || []).flatMap(column => (column?.slots || []).filter(Boolean));
export const planFilled = plan => planQids(plan).length;
export const planHasAny = plan => planFilled(plan) > 0;
/* a clue the board may deal: ready, or put on the board by force */
export const qbankPlayable = (record, plan) => !!record && (record.status === "ready" || plan?.forced?.[record.id] === true)
  && record.personal !== "needs-brandon";

/* Where a plan stands: { total, filled, empty:[{ col, slot }], missing:[qid]
   (not in the bank), unready:[qid], full } where `full` means every slot
   holds a playable record (`records` are already merged with edits). */
export function qbankPlanStatus(plan, recordsById) {
  const get = id => recordsById instanceof Map ? recordsById.get(id) : recordsById?.[id];
  const empty = [], missing = [], unready = [];
  (plan?.columns || []).forEach((column, col) => (column?.slots || []).forEach((qid, slot) => {
    if (!qid) { empty.push({ col, slot }); return; }
    const record = get(qid);
    if (!record) missing.push(qid);
    else if (!qbankPlayable(record, plan)) unready.push(qid);
  }));
  const total = QBANK_COLUMNS * QBANK_SLOTS;
  const filled = planFilled(plan);
  const shaped = (plan?.columns || []).length === QBANK_COLUMNS && plan.columns.every(column => (column?.slots || []).length === QBANK_SLOTS);
  return { total, filled, empty, missing, unready, full:shaped && filled === total && !missing.length && !unready.length };
}

/* ── the board's warnings (the desk) ── */

const answerText = record => record?.options?.find(option => option.id === record.answer)?.text || "";
const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* What the desk flags on the board, each { col, slot, qid, kind, text }
   (col/slot null for the board as a whole): an empty slot, a clue not
   ready, missing from the bank, the same answer, subject or media twice,
   two variants of one clue, an option repeated, too many clues for one
   small group (the same `likely` set on 4+ slots), an asset flagged as
   giving its answer away, a tier off its slot's value. */
export function qbankWarnings(plan, recordsById) {
  const get = id => recordsById instanceof Map ? recordsById.get(id) : recordsById?.[id];
  const out = [];
  const placed = [];
  (plan?.columns || []).forEach((column, col) => (column?.slots || []).forEach((qid, slot) => {
    const at = { col, slot, qid:qid || null };
    if (!qid) { out.push({ ...at, kind:"empty", text:"Empty" }); return; }
    const record = get(qid);
    if (!record) { out.push({ ...at, kind:"missing", text:"Not in the bank" }); return; }
    placed.push({ ...at, record });
    if (!qbankPlayable(record, plan)) out.push({ ...at, kind:"not-ready", text:record.personal === "needs-brandon" ? "Needs your answer"
      : record.status === "asset" ? "Needs its asset" : record.status === "rejected" ? "Rejected" : "Not confirmed" });
    if (record.flags?.includes("reveals-answer")) out.push({ ...at, kind:"reveals", text:"Asset gives the answer away" });
    const answer = norm(answerText(record));
    /* a hash can spell a hex word ("cafe") by chance: not a name */
    const words = answer.split(" ").filter(word => word.length >= 3 && !/^[0-9a-f]+$/.test(word));
    const files = qbankMediaFiles(record).map(src => src.toLowerCase().replace(/\.[a-z0-9]+$/, "")).join(" ");
    if (words.some(word => files.includes(word))) out.push({ ...at, kind:"reveals", text:"File name has the answer" });
    const texts = (record.options || []).map(option => norm(option.text));
    if (new Set(texts).size !== texts.length) out.push({ ...at, kind:"duplicate-options", text:"Two options match" });
    if (record.tier !== slot + 1) out.push({ ...at, kind:"tier", text:`Rated ${record.tier * 100}` });
  }));
  const twice = (key, kind, label) => {
    const groups = new Map();
    for (const item of placed) {
      const keys = [].concat(key(item.record)).filter(Boolean);
      for (const k of new Set(keys)) groups.set(k, [...(groups.get(k) || []), item]);
    }
    for (const items of groups.values()) if (items.length > 1)
      for (const item of items) out.push({ col:item.col, slot:item.slot, qid:item.qid, kind, text:label });
  };
  twice(record => norm(answerText(record)), "same-answer", "Same answer twice");
  twice(record => norm(record.subject), "same-subject", "Same subject twice");
  twice(record => qbankMediaFiles(record), "same-media", "Same file twice");
  twice(record => record.variantOf || record.id, "same-variant", "Two cuts of one clue");
  const groups = new Map();
  for (const item of placed) {
    const likely = [...(item.record.tags?.likely || [])].map(norm).sort();
    if (!likely.length || likely.length > 3) continue;
    const key = likely.join("|");
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  for (const [key, items] of groups) if (items.length >= 4)
    out.push({ col:null, slot:null, qid:null, kind:"small-group", text:`${items.length} clues aimed at ${key.split("|").join(", ")}`,
      slots:items.map(item => ({ col:item.col, slot:item.slot })) });
  return out;
}

/* ── the deal ── */

function hash(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* a record's four options in the order a game deals them: seeded by the
   game and the clue, so a rehearsal with the same game id deals the same */
export function qbankOptionOrder(seed, count = 4) {
  const random = rng(hash(String(seed)));
  const order = Array.from({ length:count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

/* One record as a board clue: the prompt, the shown subject, the options
   in their dealt order with their ids, the answer as an index, the reveal
   and the media. Sources, tags, notes and status stay in the bank. */
export function qbankClue(record, { id, col, row, value, seed }) {
  const order = qbankOptionOrder(`${seed}:${record.id}`);
  const options = order.map(i => record.options[i]);
  return { id, col, row, value, format:"choice", text:record.prompt, ...(record.subject ? { subject:record.subject } : {}),
    options:options.map(option => option.text), optionIds:options.map(option => option.id),
    answer:options.findIndex(option => option.id === record.answer), source:record.id, category:record.category,
    ...(record.reveal ? { reveal:record.reveal } : {}),
    ...(record.media ? { media:structuredClone(record.media) } : {}),
    ...(record.revealMedia ? { revealMedia:structuredClone(record.revealMedia) } : {}) };
}

/* The plan as a board: { columns, clues, dd, values } or { error }. The
   plan must be full (qbankPlanStatus); `recordsById` holds the records
   already merged with the commissioner's edits. The Daily Double hides on
   a cell worth 300 or more. */
export function dealPlan(plan, recordsById, { gameId = "tb", random = Math.random } = {}) {
  const get = id => recordsById instanceof Map ? recordsById.get(id) : recordsById?.[id];
  const status = qbankPlanStatus(plan, recordsById);
  if (!status.full) return { error:status.empty.length || status.missing.length ? `Fill all ${status.total} slots in the Question bank first`
    : `${status.unready.length} ${status.unready.length === 1 ? "clue isn't" : "clues aren't"} ready` };
  const columns = [], clues = {};
  plan.columns.forEach((column, col) => {
    const ids = column.slots.map((qid, row) => {
      const id = `${gameId}-${col}${row}`;
      clues[id] = qbankClue(get(qid), { id, col, row, value:QBANK_VALUES[row], seed:gameId });
      return id;
    });
    columns.push({ name:String(column.name || qbankCategory(column.category)?.name || "").slice(0, QBANK_LIMITS.name),
      category:column.category, clues:ids });
  });
  const deep = columns.flatMap(column => column.clues).filter(id => clues[id].row >= 2);
  const dd = deep.length ? deep[Math.min(deep.length - 1, Math.floor(random() * deep.length))] : null;
  return { columns, clues, dd, values:[...QBANK_VALUES] };
}
