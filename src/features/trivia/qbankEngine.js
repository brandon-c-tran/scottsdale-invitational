/* The question bank's rules as the desk reads them (docs/TRIVIA-QBANK.md).
   The engine's shared/triviaQBank.js is their home: the record cleaner,
   mergeQBankEdit, qbankWarnings, the categories and the values. Until its
   milestone lands this file stands in for it, to the contract; once it
   lands this file only re-exports it, so the desk imports from here alone.
   Pure. */

export const QBANK_VALUES = Object.freeze([100, 200, 300, 400, 500]);
export const QBANK_TIERS = Object.freeze([1, 2, 3, 4, 5]);
export const QBANK_SLOTS = 5;
export const QBANK_PROMPT_MAX = 140;
export const QBANK_OPTION_MAX = 50;
export const QBANK_REVEAL_MAX = 400;
export const QBANK_NOTES_MAX = 400;
export const QBANK_STATUSES = Object.freeze(["ready", "confirm", "asset", "rejected"]);
export const QBANK_MARKS = Object.freeze(["fav", "short", "reject"]);
export const QBANK_OPTION_IDS = Object.freeze(["a", "b", "c", "d"]);
export const QBANK_CATEGORIES = Object.freeze([
  { id:"nba", name:"Who He Play For?" },
  { id:"kim", name:"Kim & Winnie" },
  { id:"lore", name:"Brandon Lore" },
  { id:"aux", name:"Pass the Aux" },
  { id:"web", name:"Internet Archaeology" },
  { id:"sound", name:"You Know This Sound" },
  { id:"sil", name:"Silhouette Showdown" },
]);
const CATEGORY_IDS = new Set(QBANK_CATEGORIES.map(category => category.id));
/* the fields an edit may change */
export const QBANK_EDIT_KEYS = Object.freeze(["prompt", "options", "answer", "reveal", "tier", "media", "notes", "status"]);

const text = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const BANNED = /^(all|none|both|neither) of the above$/i;

/* a record as the bank keeps it, or why it is not one */
export function cleanQBankRecord(input) {
  const r = input && typeof input === "object" ? input : {};
  if (!/^[a-z0-9-]{1,48}$/.test(String(r.id || ""))) return { error:"That record has no usable id" };
  if (!CATEGORY_IDS.has(r.category)) return { error:"Pick one of the seven categories" };
  const tier = Number(r.tier);
  if (!QBANK_TIERS.includes(tier)) return { error:"Pick a value from 100 to 500" };
  const prompt = text(r.prompt);
  if (!prompt) return { error:"Write the question" };
  if (prompt.length > QBANK_PROMPT_MAX) return { error:`Keep the question to ${QBANK_PROMPT_MAX} characters` };
  const options = Array.isArray(r.options) ? r.options : [];
  if (options.length !== 4) return { error:"A clue has exactly four answers" };
  const cleanOptions = options.map((option, i) => ({ id:QBANK_OPTION_IDS[i], text:text(option?.text) }));
  if (cleanOptions.some(option => !option.text)) return { error:"Fill in all four answers" };
  if (cleanOptions.some(option => option.text.length > QBANK_OPTION_MAX)) return { error:`Keep each answer to ${QBANK_OPTION_MAX} characters` };
  if (cleanOptions.some(option => BANNED.test(option.text))) return { error:"No \"all of the above\" answers" };
  if (new Set(cleanOptions.map(option => option.text.toLowerCase())).size !== 4) return { error:"Two answers are the same" };
  /* the stored option ids follow their text, so an edit keeps the answer's id */
  const ids = options.map((option, i) => /^[a-z0-9]{1,8}$/.test(String(option?.id || "")) ? option.id : QBANK_OPTION_IDS[i]);
  if (new Set(ids).size !== 4) return { error:"Two answers share an id" };
  cleanOptions.forEach((option, i) => { option.id = ids[i]; });
  if (!ids.includes(r.answer)) return { error:"Mark the right answer" };
  const reveal = text(r.reveal);
  if (reveal.length > QBANK_REVEAL_MAX) return { error:`Keep the reveal to ${QBANK_REVEAL_MAX} characters` };
  const status = QBANK_STATUSES.includes(r.status) ? r.status : "confirm";
  const media = cleanMedia(r.media);
  if (media?.error) return media;
  const notes = text(r.notes);
  if (notes.length > QBANK_NOTES_MAX) return { error:`Keep the notes to ${QBANK_NOTES_MAX} characters` };
  return { record:{ ...r, tier, prompt, options:cleanOptions, answer:r.answer, reveal, status,
    ...(media ? { media } : {}), notes } };
}

function cleanMedia(media) {
  if (!media) return null;
  if (!["image", "audio", "video"].includes(media.kind) || typeof media.src !== "string") return { error:"That clue's media is not usable" };
  if (media.kind === "image") return media;
  const start = Number(media.start ?? 0), duration = Number(media.duration ?? 0);
  if (!Number.isFinite(start) || start < 0) return { error:"Start the clip at 0 seconds or later" };
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60) return { error:"Play the clip for 1 to 60 seconds" };
  return { ...media, start:Math.round(start * 10) / 10, duration:Math.round(duration * 10) / 10 };
}

/* a record with its edit laid over it; the media window merges into the
   record's media, never replaces the file */
export function mergeQBankEdit(record, patch) {
  if (!record || !patch || typeof patch !== "object") return record;
  const next = { ...record };
  for (const key of QBANK_EDIT_KEYS) {
    if (!(key in patch)) continue;
    if (key === "media") {
      if (record.media) next.media = { ...record.media,
        ...(patch.media && "start" in patch.media ? { start:patch.media.start } : {}),
        ...(patch.media && "duration" in patch.media ? { duration:patch.media.duration } : {}) };
    } else next[key] = patch[key];
  }
  return next;
}

const answerText = record => record?.options?.find(option => option.id === record.answer)?.text || "";
const key = value => text(value).toLowerCase();

/* What is wrong with the board: each warning names its slots
   ({ col, slot } pairs) and says it in a line. */
export function qbankWarnings(plan, records) {
  const byId = records instanceof Map ? records : new Map((records || []).map(record => [record.id, record]));
  const columns = plan?.columns || [];
  const placed = [];
  const out = [];
  columns.forEach((column, col) => (column?.slots || []).forEach((qid, slot) => {
    const record = qid ? byId.get(qid) : null;
    if (!qid) { out.push({ code:"empty", slots:[{ col, slot }], text:"Empty slot" }); return; }
    if (!record) { out.push({ code:"missing", slots:[{ col, slot }], qids:[qid], text:"Not in the bank" }); return; }
    placed.push({ col, slot, record });
    if (record.status !== "ready") out.push({ code:"notReady", slots:[{ col, slot }], qids:[qid],
      text:record.status === "asset" ? "Needs its asset" : record.status === "rejected" ? "Rejected" : "Needs your answer" });
    const options = (record.options || []).map(option => key(option.text));
    if (new Set(options).size !== options.length) out.push({ code:"dupOptions", slots:[{ col, slot }], qids:[qid], text:"Two answers are the same" });
    if (record.media?.revealing === true)
      out.push({ code:"revealing", slots:[{ col, slot }], qids:[qid], text:"Its asset gives the answer away" });
  }));
  const repeats = (code, valueOf, line) => {
    const groups = new Map();
    for (const item of placed) {
      const value = valueOf(item.record);
      if (!value) continue;
      groups.set(value, [...(groups.get(value) || []), item]);
    }
    for (const group of groups.values()) if (group.length > 1)
      out.push({ code, slots:group.map(({ col, slot }) => ({ col, slot })), qids:group.map(item => item.record.id), text:line(group[0].record) });
  };
  repeats("sameAnswer", record => key(answerText(record)), record => `"${answerText(record)}" is the answer twice`);
  repeats("sameSubject", record => key(record.subject), record => `${record.subject} is on the board twice`);
  repeats("sameMedia", record => record.media?.src || "", () => "The same media twice");
  /* the same small group of likely knowers aimed at on four or more slots */
  const groups = new Map();
  for (const item of placed) {
    const likely = [...(item.record.tags?.likely || [])].sort();
    if (!likely.length || likely.length > 4) continue;
    const id = likely.join("+");
    groups.set(id, [...(groups.get(id) || []), item]);
  }
  for (const [id, group] of groups) if (group.length >= 4)
    out.push({ code:"narrowGroup", slots:group.map(({ col, slot }) => ({ col, slot })), qids:group.map(item => item.record.id),
      text:`${group.length} clues aimed at ${id.split("+").join(", ")}` });
  return out;
}
