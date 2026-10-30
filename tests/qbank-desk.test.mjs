/* The Question bank desk (docs/TRIVIA-QBANK.md "The desk"): its model over
   the fixture bank (dev/fit/qbankFixtures.js): the board's seven columns
   of five, labels and lamps, warnings by slot, the filters and search, a
   slot's alternatives, clip variants folded, edits checked by the bank's
   cleaner, the export and import round trip, the clip window; then the
   real desk rendered over the fixtures, its way in from the Trivia desk,
   and that it stays the commissioner's. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { QBANK_CATEGORIES, QBANK_VALUES, cleanQBankRecord, mergeQBankEdit, qbankWarnings } from "../src/features/trivia/qbankEngine.js";
import {
  EXPORT_KIND, NO_FILTERS, bankView, boardView, checkEdit, deskRecords, editPatch, groupVariants, matchesQuery, parseImport,
  exportPayload, planColumns, planSummary, qbankRowValue, slotAlternatives, slotChoices, slotLabel, slotTarget, statusCounts,
  warningLines, warningsBySlot, windowLabel,
} from "../src/features/trivia/qbankModel.js";
import { clipBounds, clipProgress } from "../src/features/trivia/qbankMedia.js";
import {
  QBANK_FIXTURE_RECOMMENDED, QBANK_FIXTURE_RECORDS, qbankFixtureResponse, qbankFixtureState, qbankReduce,
} from "../dev/fit/qbankFixtures.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(ROOT, path), "utf8");
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

const desk = (stage = "worked") => {
  const state = qbankFixtureState(stage);
  const records = deskRecords(QBANK_FIXTURE_RECORDS, { edits:state.triviaBankEdits, marks:state.triviaBankMarks, plan:state.triviaPlan });
  const byId = new Map(records.map(record => [record.id, record]));
  return { state, records, byId, plan:state.triviaPlan, warnings:qbankWarnings(state.triviaPlan, records) };
};

/* ── the fixtures are what the contract says a bank is ── */
test("the fixture bank: every record cleans, every category and media kind, a recommended board of 35", () => {
  assert.ok(QBANK_FIXTURE_RECORDS.length >= 40);
  for (const record of QBANK_FIXTURE_RECORDS) assert.equal(cleanQBankRecord(record).error, undefined, record.id);
  assert.deepEqual(new Set(QBANK_FIXTURE_RECORDS.map(record => record.category)), new Set(QBANK_CATEGORIES.map(category => category.id)));
  for (const kind of ["image", "audio", "video"]) assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.media?.kind === kind), kind);
  for (const status of ["ready", "confirm", "asset", "rejected"]) assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.status === status), status);
  assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.variantOf), "a clip variant");
  assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.surprise), "a wedding surprise");
  assert.equal(QBANK_FIXTURE_RECOMMENDED.columns.length, 7);
  assert.equal(QBANK_FIXTURE_RECOMMENDED.columns.flatMap(column => column.slots).filter(Boolean).length, 35);
  /* the fixtures stay out of the real bank and out of src/ */
  assert.doesNotMatch(read("dev/fit/qbankFixtures.js"), /from\s+["'][^"']*worker\//);
});

/* ── the board ── */
test("the board: seven columns of five, labels, lamps and warning dots by slot", () => {
  const { plan, byId, warnings, state } = desk("worked");
  const board = boardView(plan, byId, warnings);
  assert.equal(board.length, 7);
  assert.ok(board.every(column => column.cells.length === 5));
  assert.deepEqual(board[0].cells.map(cell => cell.value), [...QBANK_VALUES]);
  const nba = board[0];
  assert.equal(nba.name, "Who He Play For?");
  assert.equal(nba.cells[0].label, "Avery Lane", "a subject is the label");
  assert.equal(nba.cells[0].lamp, "ready");
  assert.equal(nba.cells[2].lamp, "confirm", "needs your answer");
  assert.equal(board[3].cells[4].lamp, "empty");
  assert.equal(board[5].cells[1].lamp, "rejected");
  /* a media clue's prompt is the same for every record: its answer labels it */
  assert.equal(board[3].cells[0].label, "Fixture Anthem");
  /* a text clue reads as its prompt's start, cut at a word */
  const text = board[1].cells[0];
  assert.ok(text.label.length <= 29 && text.label.endsWith("…"), text.label);
  /* the warning dots: the repeated answer and media on both aux slots, none on a clean slot */
  assert.ok(board[3].cells[0].warnings.some(warning => warning.code === "sameAnswer"));
  assert.ok(board[3].cells[1].warnings.some(warning => warning.code === "sameMedia"));
  assert.ok(board[4].cells[2].warnings.some(warning => warning.code === "revealing"));
  assert.deepEqual(board[6].cells[0].warnings, []);
  assert.deepEqual(board[3].cells[4].warnings, [], "an empty slot's own dot is its dashed cell");
  const summary = planSummary(plan, byId);
  assert.deepEqual(summary, { filled:34, ready:31, total:35 });
  assert.equal(qbankRowValue(state), "34 of 35");
  assert.equal(qbankRowValue({}), null);
  assert.equal(slotLabel(null), "");
  assert.equal(slotLabel({ label:"Own label", subject:"S", prompt:"P" }), "Own label");
});

test("warnings: every kind the contract names, by slot and as summary lines", () => {
  const { plan, warnings } = desk("worked");
  const codes = new Set(warnings.map(warning => warning.code));
  for (const code of ["empty", "notReady", "sameAnswer", "sameMedia", "revealing"]) assert.ok(codes.has(code), code);
  assert.ok(desk("fresh").warnings.some(warning => warning.code === "narrowGroup"), "four clues aimed at one small group");
  /* two answers the same, through an edit */
  const records = deskRecords(QBANK_FIXTURE_RECORDS, { edits:{ "sil-fixture-1":{ options:[{ id:"a", text:"Same" }, { id:"b", text:"same" },
    { id:"c", text:"Other" }, { id:"d", text:"Fourth" }] } }, plan });
  assert.ok(qbankWarnings(plan, records).some(warning => warning.code === "dupOptions"));
  const bySlot = warningsBySlot(warnings);
  assert.ok(bySlot.get("3:0").length >= 2);
  assert.ok(warningsBySlot([{ code:"x", col:2, slot:3 }]).get("2:3"), "a warning naming one slot by col and slot");
  const lines = warningLines([...warnings, { code:"empty", slots:[{ col:0, slot:0 }] }]);
  assert.equal(lines.filter(line => line.code === "empty").length, 1, "empty slots are one line");
  assert.equal(lines[0].text, "2 empty slots");
  assert.equal(desk("empty").warnings.filter(warning => warning.code === "empty").length, 35);
});

/* ── the bank ── */
test("filters and search: category, value, status, mark, the board, and words on the record", () => {
  const { records } = desk("worked");
  const count = filters => bankView(records, { ...NO_FILTERS, ...filters }).reduce((n, group) => n + group.records.length, 0);
  assert.equal(count({}), records.length, "nothing filtered: every record, variants folded under their own card");
  assert.equal(count({ category:"aux" }), records.filter(record => record.category === "aux").length);
  assert.equal(count({ category:"nba", tier:"3" }), 3);
  assert.equal(count({ status:"confirm" }), records.filter(record => record.status === "confirm").length);
  assert.equal(count({ mark:"fav" }), 1);
  assert.equal(count({ mark:"short" }), 2);
  assert.equal(count({ mark:"reject" }), 1);
  assert.equal(count({ mark:"board" }), 34);
  assert.equal(count({ mark:"none" }), records.length - 4);
  /* search reads the subject, answers, topics, guests, notes and category */
  const find = query => records.filter(record => matchesQuery(record, query)).map(record => record.id);
  assert.deepEqual(find("avery"), ["nba-fixture-1"]);
  assert.ok(find("houston rockets").includes("nba-fixture-2"), "an answer");
  assert.ok(find("minecraft").includes("sound-fixture-3"), "a topic");
  assert.ok(find("Khoa").includes("sound-fixture-4"), "a guest likely to know it");
  assert.ok(find("deadline").includes("nba-fixture-4"), "notes");
  assert.ok(find("silhouette").length >= 6, "the category's name");
  assert.ok(find("edited by the host").includes("nba-fixture-2"), "an edit is searched as edited");
  assert.deepEqual(find("avery lane phoenix"), ["nba-fixture-1"], "every word must match");
  assert.equal(find("").length, records.length);
  /* the order: rejected last, then on the board, favorites, ready */
  const sound = bankView(records, { ...NO_FILTERS, category:"sound", tier:"2" });
  assert.equal(sound.at(-1).id, "sound-fixture-6");
  const counts = statusCounts(records);
  assert.equal(counts.ready + counts.confirm + counts.asset + counts.rejected, records.length);
});

test("clip variants fold under the record they vary; a slot's alternatives are its category and value, what sits there first", () => {
  const { records, plan } = desk("fresh");
  const aux = groupVariants(records.filter(record => record.category === "aux"));
  const anthem = aux.find(group => group.id === "aux-fixture-1");
  assert.deepEqual(anthem.records.map(record => record.id), ["aux-fixture-1", "aux-fixture-1b"]);
  assert.ok(!aux.some(group => group.id === "aux-fixture-1b"));
  /* a variant without its parent leads its own card */
  assert.equal(groupVariants(records.filter(record => record.id === "aux-fixture-1b"))[0].id, "aux-fixture-1b");
  const alts = slotAlternatives(records, plan, { col:0, slot:2 });
  assert.deepEqual(alts.map(group => group.id)[0], "nba-fixture-3", "the slot's own record first");
  assert.deepEqual(alts.map(group => group.id).sort(), ["nba-fixture-3", "nba-fixture-4", "nba-fixture-5"]);
  assert.deepEqual(slotAlternatives(records, plan, { col:9, slot:0 }), []);
  /* one tap: its column, its value's row; or any slot of its column */
  const record = records.find(item => item.id === "aux-fixture-6");
  assert.deepEqual(slotTarget(plan, record), { col:3, slot:2 });
  const choices = slotChoices(plan, record);
  assert.equal(choices.length, 5);
  assert.ok(choices.every(choice => choice.col === 3));
  assert.equal(choices.find(choice => choice.own), undefined);
  assert.equal(slotChoices(plan, records.find(item => item.id === "aux-fixture-1")).filter(choice => choice.own).length, 1);
  assert.deepEqual(planColumns(null).map(column => column.category), QBANK_CATEGORIES.map(category => category.id));
});

/* ── edits ── */
test("an edit is only what changed, checked by the bank's cleaner before it is sent", () => {
  const base = QBANK_FIXTURE_RECORDS.find(record => record.id === "aux-fixture-3");
  const draft = { ...base, options:base.options.map(option => ({ ...option })), media:{ start:base.media.start, duration:base.media.duration } };
  assert.equal(editPatch(base, draft), null, "nothing changed");
  assert.deepEqual(checkEdit(base, draft), { patch:null });
  assert.deepEqual(editPatch(base, { ...draft, reveal:"New reveal", media:{ start:6, duration:base.media.duration } }),
    { reveal:"New reveal", media:{ start:6 } });
  assert.deepEqual(editPatch(base, { ...draft, answer:"a", tier:5 }), { answer:"a", tier:5 });
  /* refused as the server will refuse it */
  assert.match(checkEdit(base, { ...draft, prompt:"" }).error, /Write the question/);
  assert.match(checkEdit(base, { ...draft, prompt:"x".repeat(141) }).error, /140/);
  assert.match(checkEdit(base, { ...draft, options:draft.options.map((option, i) => ({ ...option, text:i < 2 ? "Twin" : option.text })) }).error, /same/);
  assert.match(checkEdit(base, { ...draft, options:draft.options.map((option, i) => ({ ...option, text:i ? option.text : "" })) }).error, /all four/);
  assert.match(checkEdit(base, { ...draft, options:draft.options.map((option, i) => ({ ...option, text:i ? option.text : "x".repeat(51) })) }).error, /50/);
  assert.match(checkEdit(base, { ...draft, media:{ start:2, duration:0 } }).error, /1 to 60/);
  /* a media window merges into the record's media, never replaces the file */
  const merged = mergeQBankEdit(base, { media:{ start:6 } });
  assert.equal(merged.media.src, base.media.src);
  assert.equal(merged.media.start, 6);
  assert.equal(merged.media.duration, base.media.duration);
  assert.equal(windowLabel(merged.media), "0:06 to 0:14");
  assert.equal(windowLabel({ kind:"image" }), "");
});

/* ── export and import ── */
test("export and import: the plan, edits and marks round trip; a wrong file says what is wrong", () => {
  const { state } = desk("worked");
  const out = exportPayload({ plan:state.triviaPlan, edits:state.triviaBankEdits, marks:state.triviaBankMarks }, Date.UTC(2026, 9, 29));
  assert.equal(out.kind, EXPORT_KIND);
  const ids = new Set(QBANK_FIXTURE_RECORDS.map(record => record.id));
  const back = parseImport(JSON.stringify(out), { knownIds:ids });
  assert.equal(back.error, undefined);
  assert.deepEqual(back.plan.columns.map(column => column.slots), state.triviaPlan.columns.map(column => column.slots));
  assert.deepEqual(back.edits, state.triviaBankEdits);
  assert.deepEqual(back.marks, state.triviaBankMarks);
  /* through the fixture write: a fresh desk takes the file whole */
  const fresh = qbankFixtureState("fresh");
  assert.equal(qbankReduce(fresh, "qbankImport", back).ok, true);
  assert.deepEqual(fresh.triviaPlan.columns.map(column => column.slots), state.triviaPlan.columns.map(column => column.slots));
  assert.deepEqual(fresh.triviaBankMarks, state.triviaBankMarks);
  assert.match(parseImport("not json").error, /isn't a saved board/);
  assert.match(parseImport(JSON.stringify({ kind:"other" })).error, /isn't a saved board/);
  assert.match(parseImport(JSON.stringify({ ...out, plan:{ columns:out.plan.columns.slice(1) } })).error, /7 columns of 5/);
  assert.match(parseImport(JSON.stringify({ ...out, marks:{ "nba-fixture-1":"love" } })).error, /marks/);
  assert.match(parseImport(JSON.stringify({ ...out, edits:{ "nope-1":{ reveal:"x" } } }), { knownIds:ids }).error, /1 question/);
});

test("the fixture writes: assign, clear, edit, mark, reset, refusals", () => {
  const state = qbankFixtureState("fresh");
  assert.equal(qbankReduce(state, "qbankAssign", { col:0, slot:2, qid:"nba-fixture-5" }).ok, true);
  assert.equal(state.triviaPlan.columns[0].slots[2], "nba-fixture-5");
  assert.match(qbankReduce(state, "qbankAssign", { col:0, slot:2, qid:"aux-fixture-1" }).error, /another column/);
  assert.equal(qbankReduce(state, "qbankAssign", { col:0, slot:2, qid:null }).ok, true);
  assert.equal(state.triviaPlan.columns[0].slots[2], null);
  assert.match(qbankReduce(state, "qbankEdit", { qid:"nba-fixture-1", patch:{ prompt:"" } }).error, /Write the question/);
  assert.equal(qbankReduce(state, "qbankEdit", { qid:"nba-fixture-1", patch:{ reveal:"x" } }).ok, true);
  assert.equal(qbankReduce(state, "qbankEdit", { qid:"nba-fixture-1", patch:null }).ok, true);
  assert.deepEqual(state.triviaBankEdits, {});
  assert.equal(qbankReduce(state, "qbankMark", { qid:"nba-fixture-1", mark:"fav" }).ok, true);
  assert.equal(qbankReduce(state, "qbankMark", { qid:"nba-fixture-1", mark:null }).ok, true);
  assert.deepEqual(state.triviaBankMarks, {});
  assert.equal(qbankReduce(state, "qbankPlanReset", {}).ok, true);
  assert.equal(state.triviaPlan.columns[0].slots[2], "nba-fixture-3");
});

/* ── the clip window ── */
test("a clip plays exactly its window", () => {
  assert.deepEqual(clipBounds({ start:12, duration:8 }), { start:12, end:20, length:8 });
  assert.deepEqual(clipBounds({ start:12, duration:8 }, 15), { start:12, end:15, length:8 }, "never past the file's end");
  assert.deepEqual(clipBounds({ start:3 }, 10), { start:3, end:10, length:7 }, "no duration: to the end");
  assert.equal(clipProgress(16, { start:12, duration:8 }), 0.5);
  assert.equal(clipProgress(4, { start:12, duration:8 }), 0);
  assert.equal(clipProgress(30, { start:12, duration:8 }), 1);
});

/* ── the desk rendered ── */
let ui = null;
async function components() {
  if (ui) return ui;
  const { buildSync } = await import("esbuild");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = buildSync({ stdin:{ contents:[
    'export { QBankDesk } from "./src/features/trivia/QBankDesk.jsx";',
    'export { TriviaDesk } from "./src/features/trivia/TriviaDesk.jsx";'].join("\n"),
  resolveDir:ROOT, loader:"jsx" }, bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("qbank-desk.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  ui = { ...mod.exports, React, renderToStaticMarkup };
  return ui;
}

test("the desk renders the board, the bank's cards and a slot's alternatives", async () => {
  const { React, renderToStaticMarkup, QBankDesk } = await components();
  const state = qbankFixtureState("worked");
  const html = renderToStaticMarkup(React.createElement(QBankDesk, { state, onAct:async () => ({ ok:true }), preloaded:qbankFixtureResponse() }));
  assert.equal((html.match(/class="fd-qb-cell( is-[a-z]+)*"/g) || []).length, 35);
  assert.match(html, /34<\/b>\/35/);
  assert.match(html, /warnings/);
  assert.match(html, /Reset to recommended/);
  assert.match(html, /Export/);
  assert.match(html, /Import/);
  assert.match(html, /Avery Lane/);
  assert.match(html, /Put in 100|Take off board/);
  assert.match(html, /Favorite/);
  assert.match(html, /Shortlist/);
  assert.match(html, /Reject/);
  assert.match(html, /Sources and audience/);
  assert.match(html, /\(right answer\)/);
  assert.ok((html.match(/<article class="fd-qb-card/g) || []).length <= 30, "a page at a time");
  assert.match(html, /Show \d+ more/);
  const alts = renderToStaticMarkup(React.createElement(QBankDesk, { state, onAct:async () => ({ ok:true }), preloaded:qbankFixtureResponse(),
    initial:{ slot:{ col:0, slot:2 } } }));
  assert.match(alts, /3 alternatives/);
  assert.match(alts, /Whole bank/);
  assert.match(alts, /Clear slot/);
  assert.equal((alts.match(/<article class="fd-qb-card/g) || []).length, 3);
  const loading = renderToStaticMarkup(React.createElement(QBankDesk, { state, onAct:async () => ({ ok:true }), loadQBank:async () => ({ ok:true, records:[] }) }));
  assert.match(loading, /Loading the question bank/);
  /* a frame without the plan reads the bank's answer, then the recommended board */
  const bare = renderToStaticMarkup(React.createElement(QBankDesk, { state:{}, onAct:async () => ({ ok:true }), preloaded:qbankFixtureResponse() }));
  assert.match(bare, /35<\/b>\/35/);
});

test("the way in: Trivia's desk opens the question bank; only a commissioner's view renders it", async () => {
  const { React, renderToStaticMarkup, TriviaDesk } = await components();
  const state = { ...qbankFixtureState("fresh"), triviaRounds:[], trivia:null };
  const html = renderToStaticMarkup(React.createElement(TriviaDesk, { state, onAct:async () => ({ ok:true }), loadBank:async () => ({ ok:true, categories:[] }),
    onOpenBank:() => {} }));
  assert.match(html, /Question bank/);
  assert.match(html, /35 of 35/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(TriviaDesk, { state, onAct:async () => ({ ok:true }),
    loadBank:async () => ({ ok:true, categories:[] }) })), /Question bank/);
  const app = read("src/App.jsx");
  assert.match(app, /lazyPart\(\(\) => import\("\.\/features\/trivia\/QBankDesk\.jsx"\), "QBankDesk"\)/, "loaded on first use");
  assert.match(app, /COMMISSIONER_PARTS = \[[^\]]*QBankDesk/);
  assert.match(app, /\{gmView && modal\?\.type === "qbankDesk" &&/, "never outside the commissioner's view");
  assert.match(app, /onOpenBank=\{\(\) => pushModal\(\{ type:"qbankDesk" \}\)\}/, "Back returns to Trivia");
  /* nothing a phone loads up front imports the desk */
  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(jsx?|mjs)$/.test(name) ? [path] : [];
  });
  const importers = walk(join(ROOT, "src")).filter(file => /from\s+["'][^"']*QBankDesk(\.jsx)?["']/.test(readFileSync(file, "utf8")))
    .map(file => relative(ROOT, file).replaceAll("\\", "/"));
  assert.deepEqual(importers, []);
  /* the desk never reaches into the Worker or the real bank's files */
  for (const file of ["QBankDesk.jsx", "qbankModel.js", "qbankMedia.js", "qbankEngine.js"])
    assert.doesNotMatch(read(`src/features/trivia/${file}`), /from\s+["'][^"']*worker\//, file);
});
