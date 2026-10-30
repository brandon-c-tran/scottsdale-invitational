/* Trivia's question bank (docs/TRIVIA-QBANK.md): every record in
   worker/triviaQBank/ meets the contract (four distinct options with ids,
   one answer, a prompt that fits, a tier, a status, media under /tq/ with
   neutral names, a ready record verified with its files in public/tq/),
   the recommended board fits the bank, the data never reaches src/ or
   shared/, and the commissioner's board, edits and marks: the writes,
   their retries, the projection (his alone), a progress reset, the
   recommended board on load, the desk's read. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION } from "../shared/core.js";
import {
  QBANK_CATEGORY_IDS, QBANK_COLUMNS, QBANK_SLOTS, QBANK_VALUES, cleanQBankPlan, cleanQBankRecord, dealPlan, emptyQBankPlan,
  mergeQBankEdit, qbankEditPatch, qbankOptionOrder, qbankPlanStatus, qbankWarnings,
} from "../shared/triviaQBank.js";
import { publicState } from "../worker/publicState.js";
import { hydrateStoredState } from "../worker/state.js";
import { QBANK_ACTION_TYPES, qbankDesk } from "../worker/qbank.js";
import { ACTIONS } from "../worker/actions.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { FIXTURES, FIXTURE_PLAN, fixture, withFixtureBank } from "./support/qbank.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BANK_DIR = path.join(ROOT, "worker", "triviaQBank");
/* not record files: the board, Brandon's facts (Content A) */
const NOT_RECORDS = new Set(["recommended.json", "facts.json", "a-picks.json"]);
const mediaExists = src => existsSync(path.join(ROOT, "public", src));

let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = () => ({ ...GM, player:null, deviceId:"gm", actionId:`g${++serial}` });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  return result.error;
};
const fresh = () => structuredClone(EMPTY_STATE);

/* every record file: { file, records } (the fixtures file holds { records, plan }) */
function bankFiles() {
  return readdirSync(BANK_DIR).filter(file => file.endsWith(".json") && !NOT_RECORDS.has(file)).map(file => {
    const data = JSON.parse(readFileSync(path.join(BANK_DIR, file), "utf8"));
    return { file, records:file.startsWith("_") ? data.records : data };
  });
}

/* ── the bank ── */

test("every bank record meets the contract; ready ones are verified with their files in public/tq/", () => {
  const errors = [];
  const ids = new Map();
  let count = 0;
  for (const { file, records } of bankFiles()) {
    assert.ok(Array.isArray(records), `${file} is an array of records`);
    /* "aux" is a Windows device name: Pass the Aux keeps aux-bank.json */
    const category = file.replace(/\.json$/, "").replace(/-bank$/, "");
    if (!file.startsWith("_")) assert.ok(QBANK_CATEGORY_IDS.includes(category), `${file}: a file per category (${QBANK_CATEGORY_IDS.join(", ")})`);
    for (const record of records) {
      count += 1;
      const { error } = cleanQBankRecord(record, { mediaExists });
      if (error) errors.push(`${file}: ${error}`);
      if (!file.startsWith("_") && record?.category !== category) errors.push(`${file}: ${record?.id} is a ${record?.category} record`);
      if (ids.has(record?.id)) errors.push(`${file}: ${record?.id} is also in ${ids.get(record.id)}`);
      ids.set(record?.id, file);
    }
  }
  for (const { file, records } of bankFiles()) for (const record of records)
    if (record?.variantOf && !ids.has(record.variantOf)) errors.push(`${file}: ${record.id} is a variant of ${record.variantOf}, not in the bank`);
  assert.deepEqual(errors, [], `${errors.length} of ${count} records break the contract`);
});

test("media files are named neutrally: never a word of the answer or the subject", () => {
  const bad = [];
  for (const { file, records } of bankFiles()) for (const record of records) {
    const answer = record.options?.find(option => option.id === record.answer)?.text || "";
    /* a hash can spell a hex word ("cafe") by chance: those are not names */
    const words = `${answer} ${record.subject || ""}`.toLowerCase().split(/[^a-z0-9]+/)
      .filter(word => word.length >= 3 && !/^[0-9a-f]+$/.test(word));
    for (const src of [record.media?.src, record.media?.poster, record.revealMedia?.src].filter(Boolean)) {
      const base = path.basename(src).toLowerCase();
      assert.match(base, /^[0-9a-f]{12}\.[a-z0-9]+$/, `${file}: ${record.id} ${src}`);
      const stem = src.toLowerCase().replace(/\.[a-z0-9]+$/, "");
      if (words.some(word => stem.includes(word))) bad.push(`${file}: ${record.id} ${src}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("the recommended board, when there is one, fits the bank: seven columns of five, each its column's category", () => {
  const raw = JSON.parse(readFileSync(path.join(BANK_DIR, "recommended.json"), "utf8"));
  if (raw === null) return;
  const byId = new Map();
  for (const { file, records } of bankFiles()) if (!file.startsWith("_")) for (const record of records) byId.set(record.id, record);
  const cleaned = cleanQBankPlan(raw, byId);
  assert.equal(cleaned.error, undefined, cleaned.error);
});

test("the cleaner refuses what the contract forbids", () => {
  const good = fixture("fx-lore-2");
  assert.ok(cleanQBankRecord(good).record);
  const bad = (change, match) => {
    const record = structuredClone(good);
    change(record);
    const { error } = cleanQBankRecord(record);
    assert.ok(error, `should refuse: ${match}`);
    assert.match(error, match);
  };
  bad(r => { r.id = "Bad Id"; }, /id/);
  bad(r => { r.category = "sports"; }, /category/);
  bad(r => { r.tier = 6; }, /tier/);
  bad(r => { r.format = "tune"; }, /format/);
  bad(r => { r.prompt = "x".repeat(141); }, /prompt/);
  bad(r => { r.options.pop(); }, /four options/);
  bad(r => { r.options[1].text = r.options[0].text.toUpperCase(); }, /same thing/);
  bad(r => { r.options[1].id = r.options[0].id; }, /ids must differ/);
  bad(r => { r.options[2].text = "y".repeat(51); }, /over 50/);
  bad(r => { r.options[3].text = "None of the above"; }, /all\/none/);
  bad(r => { r.answer = "z"; }, /answer/);
  bad(r => { r.status = "done"; }, /status/);
  bad(r => { r.sources = []; r.verified = { by:"suggested", at:"2026-10-29" }; }, /ready needs/);
  bad(r => { r.reveal = ""; }, /reveal/);
  bad(r => { r.media = { kind:"image", src:"/tq/abc.webp", w:1, h:1 }; }, /choice clue has no media/);
  bad(r => { r.personal = "needs-brandon"; }, /needs-brandon record stays confirm/);
  bad(r => { r.tags.reach = "everyone"; }, /reach/);
  bad(r => { r.extra = 1; }, /unknown field extra/);
  const image = fixture("fx-nba-1");
  const badMedia = (change, match) => {
    const record = structuredClone(image);
    change(record);
    assert.match(cleanQBankRecord(record).error || "", match);
  };
  badMedia(r => { r.media.src = "/tq/dillon-brooks.webp"; }, /12 hex/);
  badMedia(r => { r.media.src = "/img/0123456789ab.webp"; }, /12 hex/);
  badMedia(r => { r.media.src = "/tq/0123456789ab.mp3"; }, /12 hex/);
  badMedia(r => { r.media.kind = "audio"; }, /12 hex|kind/);
  badMedia(r => { delete r.media.w; }, /w and h/);
  badMedia(r => { r.revealMedia = { kind:"audio", src:"/tq/0123456789ab.mp3", start:0, duration:1 }; }, /revealMedia is an image/);
  const audio = fixture("fx-sound-1");
  const badClip = (change, match) => {
    const record = structuredClone(audio);
    change(record);
    assert.match(cleanQBankRecord(record).error || "", match);
  };
  badClip(r => { r.media.duration = 0; }, /duration/);
  badClip(r => { r.media.duration = 31; }, /duration/);
  badClip(r => { r.media.start = -1; }, /start/);
  badClip(r => { r.media.mime = "video/mp4"; }, /mime/);
  /* a ready record needs its files */
  assert.match(cleanQBankRecord(audio, { mediaExists:() => false }).error, /not in public\/tq/);
  assert.ok(cleanQBankRecord({ ...structuredClone(audio), status:"asset" }, { mediaExists:() => false }).record, "an asset record may wait for its file");
  /* the provided route to ready */
  const provided = { ...structuredClone(good), sources:[], verified:{ by:"provided", at:"2026-10-29" } };
  assert.ok(cleanQBankRecord(provided).record);
});

test("the bank never leaves the Worker: nothing under src/ or shared/ imports worker/triviaQBank or worker/qbank", () => {
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(m?js|jsx)$/.test(name)) files.push(file);
    }
  };
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "shared"));
  const offenders = files.filter(file => /(from\s*|import\(\s*)["'][^"']*(triviaQBank\/|triviaQBank["']|worker\/qbank)/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
  /* and no fixture or bank prompt is spelled in a client source */
  const client = files.map(file => readFileSync(file, "utf8")).join("\n");
  for (const record of FIXTURES.records.slice(0, 5)) assert.ok(!client.includes(record.prompt), record.id);
});

/* ── the deal, pure ── */

test("a plan deals exactly: column order, 100 to 500, options in a seeded order with their ids, the answer re-indexed", () => {
  const byId = new Map(FIXTURES.records.map(record => [record.id, record]));
  assert.equal(qbankPlanStatus(FIXTURE_PLAN, byId).full, true);
  const dealt = dealPlan(FIXTURE_PLAN, byId, { gameId:"tbfixture", random:() => 0 });
  assert.equal(dealt.columns.length, QBANK_COLUMNS);
  assert.deepEqual(dealt.values, QBANK_VALUES);
  assert.deepEqual(dealt.columns.map(column => column.category), QBANK_CATEGORY_IDS);
  dealt.columns.forEach((column, col) => column.clues.forEach((id, row) => {
    const clue = dealt.clues[id];
    const record = byId.get(FIXTURE_PLAN.columns[col].slots[row]);
    assert.equal(clue.source, record.id);
    assert.equal(clue.value, QBANK_VALUES[row]);
    assert.equal(clue.format, "choice", "every bank clue plays on four options");
    assert.deepEqual([...clue.optionIds].sort(), ["a", "b", "c", "d"]);
    assert.equal(clue.optionIds[clue.answer], record.answer, "the answer follows its option");
    clue.options.forEach((text, i) => assert.equal(text, record.options.find(option => option.id === clue.optionIds[i]).text));
    assert.equal(clue.text, record.prompt);
    assert.equal(clue.sources, undefined, "sources stay in the bank");
    assert.equal(clue.tags, undefined);
  }));
  assert.equal(dealt.clues[dealt.dd].row >= 2, true, "the Daily Double is worth 300 or more");
  const again = dealPlan(FIXTURE_PLAN, byId, { gameId:"tbfixture", random:() => 0 });
  assert.deepEqual(again, dealt, "the same game id deals the same order");
  const orders = new Set(FIXTURES.records.map(record => qbankOptionOrder(`tbfixture:${record.id}`).join("")));
  assert.ok(orders.size > 4, "orders vary clue to clue");
  /* media rides the clue, reveal media too */
  const image = Object.values(dealt.clues).find(clue => clue.source === "fx-nba-1");
  assert.deepEqual([image.media.kind, image.revealMedia.kind, image.subject], ["image", "image", "Fixture Player"]);
  const audio = Object.values(dealt.clues).find(clue => clue.source === "fx-aux-2");
  assert.deepEqual([audio.media.start, audio.media.duration], [0.2, 0.6]);
  /* not full: refused */
  const short = structuredClone(FIXTURE_PLAN);
  short.columns[3].slots[4] = null;
  assert.match(dealPlan(short, byId).error, /Fill all 35/);
  const unready = structuredClone(FIXTURE_PLAN);
  unready.columns[1].slots[1] = "fx-kim-6";
  assert.match(dealPlan(unready, byId).error, /1 clue isn't ready/);
  assert.match(dealPlan({ ...unready, forced:{ "fx-kim-6":true } }, byId).error, /isn't ready/, "a clue waiting on his answer never plays");
  const confirm = new Map(byId);
  confirm.set("fx-kim-2", { ...byId.get("fx-kim-2"), status:"confirm" });
  assert.match(dealPlan(FIXTURE_PLAN, confirm).error, /isn't ready/);
  assert.equal(dealPlan({ ...FIXTURE_PLAN, forced:{ "fx-kim-2":true } }, confirm).error, undefined, "forced, it plays");
});

test("the board's warnings: empty, not ready, the same answer, subject or file twice, two cuts of one clue, one small group", () => {
  const byId = new Map(FIXTURES.records.map(record => [record.id, structuredClone(record)]));
  const plan = structuredClone(FIXTURE_PLAN);
  assert.deepEqual(qbankWarnings(plan, byId).filter(w => w.kind !== "tier"), []);
  plan.columns[0].slots[4] = null;
  plan.columns[1].slots[1] = "fx-kim-6";
  byId.get("fx-lore-1").options.find(o => o.id === byId.get("fx-lore-1").answer).text = "Same Answer";
  byId.get("fx-aux-1").options.find(o => o.id === byId.get("fx-aux-1").answer).text = "same answer";
  byId.get("fx-sil-2").media = structuredClone(byId.get("fx-sil-1").media);
  byId.get("fx-sound-3").variantOf = "fx-sound-2";
  byId.get("fx-web-4").flags = ["reveals-answer"];
  for (const id of ["fx-nba-2", "fx-nba-3", "fx-kim-1", "fx-lore-4"]) byId.get(id).tags.likely = ["Evan", "Eyob"];
  const kinds = qbankWarnings(plan, byId).map(w => `${w.kind}:${w.qid || ""}`);
  for (const want of ["empty:", "not-ready:fx-kim-6", "same-answer:fx-lore-1", "same-answer:fx-aux-1", "same-media:fx-sil-1",
    "same-media:fx-sil-2", "same-variant:fx-sound-2", "same-variant:fx-sound-3", "reveals:fx-web-4", "small-group:"])
    assert.ok(kinds.includes(want), `${want} in ${kinds.join(" ")}`);
});

test("an edit merges by field, options by id, the clip's window only; it must still meet every rule", () => {
  const base = fixture("fx-aux-2");
  const merged = mergeQBankEdit(base, { prompt:"New prompt?", options:[{ id:"b", text:"Bravo changed" }], media:{ start:0.1, src:"/tq/x.mp3" } });
  assert.equal(merged.prompt, "New prompt?");
  assert.equal(merged.options.find(option => option.id === "b").text, "Bravo changed");
  assert.equal(merged.media.start, 0.1);
  assert.equal(merged.media.src, base.media.src, "the file never changes by edit");
  const reduced = qbankEditPatch(base, { prompt:base.prompt, reveal:"Changed reveal." });
  assert.deepEqual(reduced.patch, { reveal:"Changed reveal." }, "only what differs is kept");
  assert.equal(qbankEditPatch(base, { prompt:base.prompt }).patch, null);
  assert.match(qbankEditPatch(base, { prompt:"" }).error, /prompt/);
  assert.match(qbankEditPatch(base, { media:{ duration:40 } }).error, /duration/);
  assert.match(qbankEditPatch(base, { media:{ src:"/tq/000000000000.mp3" } }).error, /start and length/);
  assert.match(qbankEditPatch(base, { options:[{ id:"z", text:"New" }] }).error, /keep their ids/);
  assert.match(qbankEditPatch(base, { sources:[] }).error, /Can't edit sources/);
  assert.match(qbankEditPatch(fixture("fx-lore-1"), { media:{ start:1 } }).error, /no clip/);
  /* his own "ready" is his word */
  const waiting = fixture("fx-kim-6");
  const ready = qbankEditPatch(waiting, { status:"ready" }, { today:"2026-10-30" });
  assert.deepEqual(ready.patch, { status:"ready", verified:{ by:"provided", at:"2026-10-30" }, personal:"provided" });
});

/* ── the writes ── */

test("qbankAssign: the commissioner fills, moves, forces and clears slots; a clue only in its own category; retries change nothing", () => {
  const restore = withFixtureBank();
  try {
    const state = fresh();
    assert.equal(state.triviaPlan, null);
    assert.equal(refuse(state, "qbankAssign", { col:0, slot:0, qid:"fx-nba-1" }, as("Evan")), "Commissioner only");
    act(state, "qbankAssign", { col:0, slot:0, qid:"fx-nba-1" });
    assert.equal(state.triviaPlan.columns.length, QBANK_COLUMNS);
    assert.deepEqual(state.triviaPlan.columns[0].slots, ["fx-nba-1", null, null, null, null]);
    assert.equal(state.triviaPlan.columns[0].category, "nba");
    assert.equal(state.triviaPlan.from, undefined, "a touched board is his");
    assert.ok(state.triviaPlan.updatedAt > 0);
    assert.equal(act(state, "qbankAssign", { col:0, slot:0, qid:"fx-nba-1" }).extra.unchanged, true, "a retry is acknowledged");
    assert.equal(refuse(state, "qbankAssign", { col:1, slot:0, qid:"fx-nba-2" }), "That isn't a Kim & Winnie clue");
    assert.equal(refuse(state, "qbankAssign", { col:0, slot:0, qid:"nope-nope" }), "That clue isn't in the bank");
    assert.equal(refuse(state, "qbankAssign", { col:7, slot:0, qid:"fx-nba-1" }), "That slot isn't on the board");
    assert.deepEqual(act(state, "qbankAssign", { col:0, slot:3, qid:"fx-nba-1" }).extra.moved, { col:0, slot:0 }, "a clue moves");
    assert.deepEqual(state.triviaPlan.columns[0].slots, [null, null, null, "fx-nba-1", null]);
    act(state, "qbankAssign", { col:1, slot:1, qid:"fx-kim-6", force:true });
    assert.deepEqual(state.triviaPlan.forced, { "fx-kim-6":true });
    act(state, "qbankAssign", { col:1, slot:1, qid:null });
    assert.equal(state.triviaPlan.forced, undefined, "clearing the slot drops its force");
    assert.equal(act(state, "qbankAssign", { col:1, slot:1, qid:null }).extra.unchanged, true);
  } finally { restore(); }
});

test("qbankEdit and qbankMark: kept per clue, retried safely, refused when the record would break the rules", () => {
  const restore = withFixtureBank();
  try {
    const state = fresh();
    act(state, "qbankEdit", { qid:"fx-lore-1", patch:{ prompt:"Edited prompt?" } });
    assert.deepEqual(state.triviaBankEdits, { "fx-lore-1":{ prompt:"Edited prompt?" } });
    assert.equal(act(state, "qbankEdit", { qid:"fx-lore-1", patch:{ prompt:"Edited prompt?" } }).extra.unchanged, true);
    act(state, "qbankEdit", { qid:"fx-lore-1", patch:{ reveal:"Edited reveal." } });
    assert.deepEqual(state.triviaBankEdits["fx-lore-1"], { prompt:"Edited prompt?", reveal:"Edited reveal." }, "a patch lands on the edit");
    act(state, "qbankEdit", { qid:"fx-lore-1", patch:{ prompt:fixture("fx-lore-1").prompt } });
    assert.deepEqual(state.triviaBankEdits["fx-lore-1"], { reveal:"Edited reveal." }, "back to the bank's own drops out");
    assert.match(refuse(state, "qbankEdit", { qid:"fx-lore-1", patch:{ answer:"q" } }), /answer/);
    assert.equal(refuse(state, "qbankEdit", { qid:"fx-lore-1", patch:{ prompt:"x" } }, as("Evan")), "Commissioner only");
    act(state, "qbankEdit", { qid:"fx-lore-1", patch:null });
    assert.deepEqual(state.triviaBankEdits, {});
    act(state, "qbankEdit", { qid:"fx-kim-6", patch:{ status:"ready" } });
    assert.equal(state.triviaBankEdits["fx-kim-6"].verified.by, "provided");
    act(state, "qbankEdit", { qid:"fx-kim-6", patch:{ status:"confirm" } });
    assert.equal(state.triviaBankEdits["fx-kim-6"], undefined, "unmarking ready takes the stamp back");
    act(state, "qbankMark", { qid:"fx-lore-1", mark:"fav" });
    assert.equal(act(state, "qbankMark", { qid:"fx-lore-1", mark:"fav" }).extra.unchanged, true);
    act(state, "qbankMark", { qid:"fx-lore-2", mark:"reject" });
    assert.deepEqual(state.triviaBankMarks, { "fx-lore-1":"fav", "fx-lore-2":"reject" });
    act(state, "qbankMark", { qid:"fx-lore-1", mark:null });
    assert.deepEqual(state.triviaBankMarks, { "fx-lore-2":"reject" });
    assert.equal(refuse(state, "qbankMark", { qid:"fx-lore-1", mark:"love" }), "Mark it Favorite, Shortlist or Reject");
  } finally { restore(); }
});

test("qbankPlanReset and qbankImport: back to the recommended board; an import is checked whole", () => {
  const restore = withFixtureBank({ recommended:FIXTURE_PLAN });
  try {
    const state = fresh();
    act(state, "qbankPlanReset", {});
    assert.equal(state.triviaPlan.from, "recommended");
    assert.deepEqual(state.triviaPlan.columns.map(column => column.slots), FIXTURE_PLAN.columns.map(column => column.slots));
    assert.equal(act(state, "qbankPlanReset", {}).extra.unchanged, true);
    act(state, "qbankAssign", { col:2, slot:2, qid:"fx-lore-6" });
    assert.equal(state.triviaPlan.columns[2].slots[2], "fx-lore-6");
    const exported = { plan:structuredClone(state.triviaPlan), edits:{ "fx-lore-6":{ reveal:"Imported." } }, marks:{ "fx-lore-6":"short" } };
    act(state, "qbankPlanReset", {});
    assert.equal(state.triviaPlan.columns[2].slots[2], "fx-lore-3");
    act(state, "qbankImport", exported);
    assert.equal(state.triviaPlan.columns[2].slots[2], "fx-lore-6");
    assert.deepEqual([state.triviaBankEdits, state.triviaBankMarks], [exported.edits, exported.marks]);
    assert.equal(act(state, "qbankImport", exported).extra.unchanged, true);
    const before = structuredClone(state);
    const broken = structuredClone(exported);
    broken.plan.columns[0].slots[0] = "fx-kim-1";
    assert.equal(refuse(state, "qbankImport", broken), "fx-kim-1 isn't a Who He Play For? clue");
    const twice = structuredClone(exported);
    twice.plan.columns[0].slots[1] = twice.plan.columns[0].slots[0];
    assert.match(refuse(state, "qbankImport", twice), /twice/);
    assert.match(refuse(state, "qbankImport", { ...exported, edits:{ "fx-lore-1":{ answer:"q" } } }), /fx-lore-1/);
    assert.match(refuse(state, "qbankImport", { ...exported, marks:{ "nope-nope":"fav" } }), /isn't in the bank/);
    assert.deepEqual(state, before, "a refused import changes nothing");
  } finally { restore(); }
});

test("the board, edits and marks are the commissioner's alone: never in a guest's, a player's or the TV's frame", () => {
  const restore = withFixtureBank();
  try {
    const state = fresh();
    act(state, "qbankAssign", { col:2, slot:0, qid:"fx-lore-1" });
    act(state, "qbankEdit", { qid:"fx-lore-1", patch:{ options:[{ id:"a", text:"Secret Answer Text" }], answer:"a" } });
    act(state, "qbankMark", { qid:"fx-lore-1", mark:"fav" });
    for (const viewer of [{}, { player:"Evan" }, { isGm:false, player:"Brandon" }]) {
      const frame = publicState(state, viewer);
      for (const key of ["triviaPlan", "triviaBankEdits", "triviaBankMarks"]) assert.equal(key in frame, false, `${key} for ${JSON.stringify(viewer)}`);
      const text = JSON.stringify(frame);
      assert.ok(!text.includes("Secret Answer Text") && !text.includes("fx-lore-1"), "no edit, no qid");
    }
    const mine = publicState(state, { isGm:true });
    assert.equal(mine.triviaPlan.columns[2].slots[0], "fx-lore-1");
    assert.equal(mine.triviaBankEdits["fx-lore-1"].options[0].text, "Secret Answer Text");
    assert.deepEqual(mine.triviaBankMarks, { "fx-lore-1":"fav" });
  } finally { restore(); }
});

test("a progress reset keeps the board, edits and marks; the recommended board loads into an untouched state and follows it", () => {
  const restore = withFixtureBank({ recommended:FIXTURE_PLAN });
  try {
    const state = fresh();
    act(state, "qbankAssign", { col:2, slot:2, qid:"fx-lore-6" });
    act(state, "qbankEdit", { qid:"fx-lore-6", patch:{ reveal:"Kept." } });
    act(state, "qbankMark", { qid:"fx-lore-6", mark:"fav" });
    const kept = structuredClone([state.triviaPlan, state.triviaBankEdits, state.triviaBankMarks]);
    act(state, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
    assert.deepEqual([state.triviaPlan, state.triviaBankEdits, state.triviaBankMarks], kept);
    /* load: an untouched (or missing) board is the recommended one */
    const loaded = hydrateStoredState({ ...fresh(), triviaPlan:undefined });
    assert.equal(loaded.triviaPlan.from, "recommended");
    assert.deepEqual(loaded.triviaPlan.columns.map(column => column.slots), FIXTURE_PLAN.columns.map(column => column.slots));
    const touched = hydrateStoredState(structuredClone(state));
    assert.deepEqual(touched.triviaPlan, kept[0], "his own board is never replaced");
    const stale = hydrateStoredState({ ...fresh(), triviaPlan:{ ...emptyQBankPlan(), from:"recommended" } });
    assert.equal(stale.triviaPlan.columns[0].slots[0], "fx-nba-1", "an untouched board follows the recommended one");
  } finally { restore(); }
  const none = hydrateStoredState(fresh());
  assert.equal(none.triviaPlan.from, "recommended");
  assert.equal(none.triviaPlan.columns.length, QBANK_COLUMNS);
  /* the shipped recommended board when there is one, else the empty one; either way still following */
  const shipped = JSON.parse(readFileSync(new URL("../worker/triviaQBank/recommended.json", import.meta.url), "utf8"));
  assert.ok(none.triviaPlan.columns.every((column, col) => column.slots.length === QBANK_SLOTS
    && column.slots.every((slot, k) => slot === (shipped ? shipped.columns[col].slots[k] : null))),
    "the recommended board (or the empty one), still following");
});

test("GET /api/trivia/qbank: the commissioner's desk, every record with its edit and mark, the board, its status and warnings", async () => {
  const restore = withFixtureBank({ recommended:FIXTURE_PLAN });
  try {
    const { Tournament } = await import("../worker/tournament.js");
    const entries = new Map();
    const storage = {
      async get(key) { return entries.get(key); }, async put(key, value) {
        if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, v); else entries.set(key, value);
      },
      async delete(keys) { for (const key of [].concat(keys)) entries.delete(key); },
      async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix))); },
      async transaction(fn) { return fn(storage); }, async setAlarm() {}, async getAlarm() { return null; }, async deleteAlarm() {},
    };
    const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => [], storage, waitUntil() {} },
      { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true" });
    await tournament.hydrateFromStorage();
    tournament.gmTokenId = async token => token === "gm" ? "gm" : null;
    const call = (token = null) => tournament.fetch(new Request("http://localhost/api/trivia/qbank",
      { headers:token ? { Authorization:`Bearer ${token}` } : {} }));
    assert.equal((await call()).status, 403);
    const state = tournament.state;
    act(state, "qbankEdit", { qid:"fx-lore-1", patch:{ prompt:"Edited for the desk?" } });
    act(state, "qbankMark", { qid:"fx-lore-1", mark:"short" });
    const desk = await (await call("gm")).json();
    assert.equal(desk.ok, true);
    assert.equal(desk.records.length, FIXTURES.records.length);
    const edited = desk.records.find(record => record.id === "fx-lore-1");
    assert.deepEqual([edited.prompt, edited.edited, edited.mark, edited.original.prompt],
      ["Edited for the desk?", true, "short", fixture("fx-lore-1").prompt]);
    assert.equal(desk.plan.from, "recommended", "the board starts as the recommended one");
    assert.equal(desk.status.full, true);
    assert.deepEqual(desk.values, QBANK_VALUES);
    assert.deepEqual(desk.categories.map(category => category.id), QBANK_CATEGORY_IDS);
    assert.ok(Array.isArray(desk.warnings));
    assert.deepEqual(desk, qbankDesk(state));
  } finally { restore(); }
});

test("the desk's writes are registered", () => {
  for (const type of QBANK_ACTION_TYPES) assert.ok(Object.hasOwn(ACTIONS, type), type);
});
