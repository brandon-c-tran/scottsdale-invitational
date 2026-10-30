/* The Question bank desk (docs/TRIVIA-QBANK.md "The desk") over the fixture
   bank (dev/fit/qbankDeskFixtures.js) swapped in as the Worker's bank: its
   states built by the bank's real writes (worker/qbank.js), the bank read
   as GET /api/trivia/qbank answers. The model: the board's seven columns
   of five, labels and lamps, the bank's warnings by slot, the filters and
   search, a slot's alternatives, clip variants folded, edits checked the
   server's way, play anyway, the export and import round trip, the clip
   window; then the real desk rendered, its way in from the Trivia desk,
   and that it and the bank stay the commissioner's. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAction } from "../worker/actions.js";
import { publicState } from "../worker/publicState.js";
import { QBANK_CATEGORIES, QBANK_VALUES, cleanQBankRecord, mergeQBankEdit, qbankWarnings } from "../shared/triviaQBank.js";
import {
  EXPORT_KIND, NO_FILTERS, bankView, boardView, checkEdit, deskRecords, editPatch, groupVariants, matchesQuery, parseImport,
  exportPayload, planColumns, planSummary, qbankRowValue, recordsById, slotAlternatives, slotChoices, slotLabel, slotTarget,
  statusCounts, warningCount, warningLines, warningsBySlot, windowLabel,
} from "../src/features/trivia/qbankModel.js";
import { clipBounds, clipProgress } from "../src/features/trivia/qbankMedia.js";
import {
  QBANK_FIXTURE_RECOMMENDED, QBANK_FIXTURE_RECORDS, deskWrite, qbankFixtureResponse, qbankFixtureState, useDeskBank,
} from "../dev/fit/qbankDeskFixtures.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(ROOT, path), "utf8");
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);

/* the fixtures as the Worker's bank for this file (restored after) */
const restore = useDeskBank();
test.after(() => restore());
/* a desk as the commissioner's device sees it: the state the bank's real
   writes left, the bank as GET /api/trivia/qbank answers, merged again
   with the frame's edits */
const desk = (stage = "worked") => {
  const state = qbankFixtureState(stage);
  const response = qbankFixtureResponse(state);
  const records = deskRecords(response.records, { edits:state.triviaBankEdits, marks:state.triviaBankMarks, plan:state.triviaPlan });
  const byId = recordsById(records);
  return { state, response, records, byId, plan:state.triviaPlan, warnings:qbankWarnings(state.triviaPlan, byId) };
};

/* ── the fixtures are what the contract says a bank is ── */
test("the fixture bank: every record meets the bank's rules, every category and media kind, a recommended board of 35", () => {
  assert.ok(QBANK_FIXTURE_RECORDS.length >= 40);
  for (const record of QBANK_FIXTURE_RECORDS) assert.equal(cleanQBankRecord(record).error, undefined, record.id);
  for (const file of new Set(QBANK_FIXTURE_RECORDS.flatMap(record => [record.media?.src, record.revealMedia?.src]).filter(Boolean)))
    assert.ok(statSync(join(ROOT, "public", file)).size > 0, file);
  assert.deepEqual(new Set(QBANK_FIXTURE_RECORDS.map(record => record.category)), new Set(QBANK_CATEGORIES.map(category => category.id)));
  for (const kind of ["image", "audio", "video"]) assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.media?.kind === kind), kind);
  for (const status of ["ready", "confirm", "asset", "rejected"]) assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.status === status), status);
  assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.variantOf), "a clip variant");
  assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.surprise), "a wedding surprise");
  assert.ok(QBANK_FIXTURE_RECORDS.some(record => record.personal === "needs-brandon"), "waiting on Brandon");
  assert.equal(QBANK_FIXTURE_RECOMMENDED.columns.length, 7);
  assert.equal(QBANK_FIXTURE_RECOMMENDED.columns.flatMap(column => column.slots).filter(Boolean).length, 35);
  /* the fixtures stay out of the real bank: no fixture id in its files */
  const real = readdirSync(join(ROOT, "worker/triviaQBank")).filter(name => /\.json$/.test(name) && !name.startsWith("_"))
    .map(name => read(`worker/triviaQBank/${name}`)).join("\n");
  assert.doesNotMatch(real, /-fixture-/);
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
  /* a text clue reads as its prompt's start, cut at a word; shorter on a phone */
  const text = board[1].cells[0];
  assert.ok(text.label.length <= 29 && text.label.endsWith("…"), text.label);
  assert.ok(text.short.length <= 17, text.short);
  /* the warning dots: the repeated answer and file on both aux slots, the revealing clip, none on a clean slot */
  assert.ok(board[3].cells[0].warnings.some(warning => warning.kind === "same-answer"));
  assert.ok(board[3].cells[1].warnings.some(warning => warning.kind === "same-media"));
  assert.ok(board[4].cells[2].warnings.some(warning => warning.kind === "reveals"));
  assert.deepEqual(board[6].cells[0].warnings, []);
  assert.deepEqual(board[3].cells[4].warnings, [], "an empty slot's own dot is its dashed cell");
  assert.deepEqual(planSummary(plan, byId), { filled:34, ready:31, total:35 });
  assert.equal(qbankRowValue(state), "34 of 35");
  assert.equal(qbankRowValue({}), null);
  assert.equal(slotLabel(null), "");
  assert.equal(slotLabel({ subject:"S", prompt:"P" }), "S");
});

test("warnings: every kind the bank names, dotted by slot, one summary line each", () => {
  const { warnings } = desk("worked");
  const kinds = new Set(warnings.map(warning => warning.kind));
  for (const kind of ["empty", "not-ready", "same-answer", "same-media", "same-variant", "reveals", "tier"]) assert.ok(kinds.has(kind), kind);
  const fresh = desk("fresh");
  const group = fresh.warnings.find(warning => warning.kind === "small-group");
  assert.ok(group, "four clues aimed at one small group");
  /* a warning over several slots dots each of them */
  const bySlot = warningsBySlot(fresh.warnings);
  for (const { col, slot } of group.slots) assert.ok(bySlot.get(`${col}:${slot}`).includes(group));
  /* two options the same (a record only a bad file could hold) */
  const twin = { ...fresh.byId.get("sil-fixture-1"), options:[{ id:"a", text:"Same" }, { id:"b", text:"same" }, { id:"c", text:"C" }, { id:"d", text:"D" }] };
  assert.ok(qbankWarnings(fresh.plan, new Map([...fresh.byId, [twin.id, twin]])).some(warning => warning.kind === "duplicate-options"));
  assert.ok(warningsBySlot(warnings).get("3:0").length >= 2);
  /* the summary: a repeat named once with both its slots, empty slots one line first */
  const lines = warningLines([...warnings, { kind:"empty", col:0, slot:0, text:"Empty" }]);
  assert.equal(lines.filter(line => line.kind === "empty").length, 1, "empty slots are one line");
  assert.equal(lines[0].text, "2 empty slots");
  assert.deepEqual(lines.find(line => line.kind === "same-answer").slots, [{ col:3, slot:0 }, { col:3, slot:1 }]);
  assert.equal(warningCount(lines), lines.length + 1);
  assert.equal(warningLines(desk("empty").warnings)[0].text, "35 empty slots");
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
  /* the order: rejected last */
  const sound = bankView(records, { ...NO_FILTERS, category:"sound", tier:"2" });
  assert.equal(sound.at(-1).id, "sound-fixture-6");
  const counts = statusCounts(records);
  assert.equal(counts.ready + counts.confirm + counts.asset + counts.rejected, records.length);
});

test("clip variants fold under the record they vary; a slot's alternatives are its category and value, what sits there first", () => {
  const { records, plan } = desk("fresh");
  const aux = groupVariants(records.filter(record => record.category === "aux"));
  assert.deepEqual(aux.find(group => group.id === "aux-fixture-1").records.map(record => record.id), ["aux-fixture-1", "aux-fixture-1b"]);
  assert.ok(!aux.some(group => group.id === "aux-fixture-1b"));
  /* a variant without its parent leads its own card */
  assert.equal(groupVariants(records.filter(record => record.id === "aux-fixture-1b"))[0].id, "aux-fixture-1b");
  const alts = slotAlternatives(records, plan, { col:0, slot:2 });
  assert.equal(alts[0].id, "nba-fixture-3", "the slot's own record first");
  assert.deepEqual(alts.map(group => group.id).sort(), ["nba-fixture-3", "nba-fixture-4", "nba-fixture-5"]);
  assert.deepEqual(slotAlternatives(records, plan, { col:9, slot:0 }), []);
  /* what sits there at another value still leads */
  const worked = desk("worked");
  assert.equal(slotAlternatives(worked.records, worked.plan, { col:3, slot:1 })[0].records[0].id, "aux-fixture-1b");
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
test("an edit sends only what changed, checked the way the server checks it", () => {
  const base = cleanQBankRecord(QBANK_FIXTURE_RECORDS.find(record => record.id === "aux-fixture-3")).record;
  const draft = { ...base, options:base.options.map(option => ({ ...option })), media:{ start:base.media.start, duration:base.media.duration } };
  assert.equal(editPatch(base, draft), null, "nothing changed");
  assert.deepEqual(checkEdit(base, draft), { patch:null });
  assert.deepEqual(editPatch(base, { ...draft, reveal:"New reveal", media:{ start:6, duration:base.media.duration } }),
    { reveal:"New reveal", media:{ start:6 } });
  assert.deepEqual(editPatch(base, { ...draft, answer:"a", tier:5 }), { answer:"a", tier:5 });
  /* only the options that changed, by id */
  assert.deepEqual(editPatch(base, { ...draft, options:draft.options.map((option, i) => ({ ...option, text:i === 2 ? "Neon Lights" : option.text })) }),
    { options:[{ id:"c", text:"Neon Lights" }] });
  /* a field the edit kept, set back to the bank's own, is still sent (so the server drops it) */
  assert.deepEqual(editPatch(base, draft, { reveal:"Old edit" }), { reveal:base.reveal });
  /* refused as the server will refuse it */
  const error = changes => checkEdit(base, { ...draft, ...changes }).error;
  const option = (i, text) => ({ options:draft.options.map((own, k) => k === i ? { ...own, text } : own) });
  assert.match(error({ prompt:"" }), /prompt is missing/);
  assert.match(error({ prompt:"x".repeat(141) }), /140/);
  assert.match(error({ options:draft.options.map((own, k) => ({ ...own, text:k < 2 ? "Twin" : own.text })) }), /same thing/);
  assert.match(error(option(0, "")), /no text/);
  assert.match(error(option(0, "x".repeat(51))), /50/);
  assert.match(error({ media:{ start:2, duration:0 } }), /duration/);
  assert.match(error({ media:{ start:2, duration:31 } }), /30 seconds/);
  /* a media window merges into the record's media, never replaces the file */
  const merged = mergeQBankEdit(base, { media:{ start:6 } });
  assert.equal(merged.media.src, base.media.src);
  assert.equal(merged.media.start, 6);
  assert.equal(merged.media.duration, base.media.duration);
  assert.equal(windowLabel(merged.media), "0:06 to 0:14");
  assert.equal(windowLabel({ kind:"image" }), "");
});

/* ── export and import ── */
test("export and import: the plan, edits and marks round trip through the bank's import; a wrong file says what is wrong", () => {
  const { state } = desk("worked");
  const out = exportPayload({ plan:state.triviaPlan, edits:state.triviaBankEdits, marks:state.triviaBankMarks }, Date.UTC(2026, 9, 29));
  assert.equal(out.kind, EXPORT_KIND);
  const ids = new Set(QBANK_FIXTURE_RECORDS.map(record => record.id));
  const back = parseImport(JSON.stringify(out), { knownIds:ids });
  assert.equal(back.error, undefined);
  assert.deepEqual(back.plan.columns.map(column => column.slots), state.triviaPlan.columns.map(column => column.slots));
  assert.deepEqual(back.edits, state.triviaBankEdits);
  assert.deepEqual(back.marks, state.triviaBankMarks);
  const fresh = qbankFixtureState("fresh");
  assert.equal(deskWrite(fresh, "qbankImport", back).ok, true);
  assert.deepEqual(fresh.triviaPlan.columns.map(column => column.slots), state.triviaPlan.columns.map(column => column.slots));
  assert.deepEqual(fresh.triviaBankEdits, state.triviaBankEdits);
  assert.deepEqual(fresh.triviaBankMarks, state.triviaBankMarks);
  /* a played-anyway clue rides the file too */
  const forced = { ...state.triviaPlan, forced:{ "nba-fixture-4":true } };
  assert.deepEqual(parseImport(JSON.stringify(exportPayload({ plan:forced, edits:{}, marks:{} }))).plan.forced, { "nba-fixture-4":true });
  assert.match(parseImport("not json").error, /isn't a saved board/);
  assert.match(parseImport(JSON.stringify({ kind:"other" })).error, /isn't a saved board/);
  assert.match(parseImport(JSON.stringify({ ...out, plan:{ columns:out.plan.columns.slice(1) } })).error, /7 columns of 5/);
  assert.match(parseImport(JSON.stringify({ ...out, marks:{ "nba-fixture-1":"love" } })).error, /marks/);
  assert.match(parseImport(JSON.stringify({ ...out, edits:{ "nope-1":{ reveal:"x" } } }), { knownIds:ids }).error, /1 question/);
});

test("the desk's writes on the bank's real reducers: assign, play anyway, clear, edit and undo, mark, reset, refusals", () => {
  const state = qbankFixtureState("fresh");
  assert.equal(deskWrite(state, "qbankAssign", { col:0, slot:2, qid:"nba-fixture-5" }).ok, true);
  assert.equal(state.triviaPlan.columns[0].slots[2], "nba-fixture-5");
  assert.match(deskWrite(state, "qbankAssign", { col:0, slot:2, qid:"aux-fixture-1" }).error, /isn't a Who He Play For\? clue/);
  /* a clue not ready, put on to play anyway */
  assert.equal(deskWrite(state, "qbankAssign", { col:0, slot:2, qid:"nba-fixture-4", force:true }).ok, true);
  assert.equal(state.triviaPlan.forced["nba-fixture-4"], true);
  const response = qbankFixtureResponse(state);
  const records = deskRecords(response.records, { plan:state.triviaPlan });
  assert.equal(records.find(record => record.id === "nba-fixture-4").forced, true);
  assert.equal(boardView(state.triviaPlan, recordsById(records), [])[0].cells[2].lamp, "ready", "a clue played anyway lights as one that plays");
  assert.equal(planSummary(state.triviaPlan, recordsById(records)).ready, 34, "played anyway counts; the clue waiting on Brandon never does");
  assert.equal(deskWrite(state, "qbankAssign", { col:0, slot:2, qid:null }).ok, true);
  assert.equal(state.triviaPlan.columns[0].slots[2], null);
  assert.match(deskWrite(state, "qbankEdit", { qid:"nba-fixture-1", patch:{ prompt:"" } }).error, /prompt is missing/);
  /* the desk's own patch through the real write, then set back */
  const base = records.find(record => record.id === "nba-fixture-1").base;
  assert.equal(deskWrite(state, "qbankEdit", { qid:"nba-fixture-1", patch:checkEdit(base, { ...base, reveal:"x" }).patch }).ok, true);
  assert.deepEqual(state.triviaBankEdits, { "nba-fixture-1":{ reveal:"x" } });
  const back = checkEdit(base, { ...base }, state.triviaBankEdits["nba-fixture-1"]).patch;
  assert.equal(deskWrite(state, "qbankEdit", { qid:"nba-fixture-1", patch:back }).ok, true);
  assert.deepEqual(state.triviaBankEdits, {});
  assert.equal(deskWrite(state, "qbankEdit", { qid:"nba-fixture-1", patch:{ reveal:"y" } }).ok, true);
  assert.equal(deskWrite(state, "qbankEdit", { qid:"nba-fixture-1", patch:null }).ok, true, "Undo my edits");
  assert.deepEqual(state.triviaBankEdits, {});
  /* an edit on another device shows on this one from the frame alone */
  const live = deskRecords(response.records, { edits:{ "nba-fixture-1":{ reveal:"From the laptop" } }, plan:state.triviaPlan });
  assert.equal(live.find(record => record.id === "nba-fixture-1").reveal, "From the laptop");
  assert.equal(deskWrite(state, "qbankMark", { qid:"nba-fixture-1", mark:"fav" }).ok, true);
  assert.equal(deskWrite(state, "qbankMark", { qid:"nba-fixture-1", mark:null }).ok, true);
  assert.deepEqual(state.triviaBankMarks, {});
  assert.equal(deskWrite(state, "qbankPlanReset", {}).ok, true);
  assert.equal(state.triviaPlan.columns[0].slots[2], "nba-fixture-3");
  /* never a guest's */
  assert.equal(applyAction(state, "qbankMark", { qid:"nba-fixture-1", mark:"fav" }, { isGm:false, player:"Evan", deviceId:"x", actionId:"g1" }).ok, false);
});

test("the board, edits and marks never reach a player's or the TV's frame", () => {
  const state = { ...qbankFixtureState("worked"), profiles:{} };
  for (const frame of [publicState(state, { isGm:false, player:"Evan" }), publicState(state, {})]) {
    for (const key of ["triviaPlan", "triviaBankEdits", "triviaBankMarks"]) assert.ok(!(key in frame), key);
    assert.doesNotMatch(JSON.stringify(frame), /Edited by the host|nba-fixture/);
  }
  const gm = publicState(state, { isGm:true, player:null });
  assert.ok(gm.triviaPlan && gm.triviaBankEdits && gm.triviaBankMarks);
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
  const render = props => renderToStaticMarkup(React.createElement(QBankDesk, { state, onAct:async () => ({ ok:true }),
    preloaded:qbankFixtureResponse(state), ...props }));
  const html = render();
  assert.equal((html.match(/class="fd-qb-cell( is-[a-z]+)*"/g) || []).length, 35);
  /* what the board can deal, and what is missing */
  assert.match(html, /31<\/b>\/35/);
  assert.match(html, /ready · 1 empty · 3 not ready/);
  /* the warnings the bank finds, counted as the summary says them, dotted only where they are */
  const { warnings } = desk("worked");
  assert.ok(html.includes(`${warningCount(warningLines(warnings))} warnings`));
  assert.match(html, /aria-label="Who He Play For\? 100: Avery Lane, ready"/);
  assert.match(html, /aria-label="Pass the Aux 100: Fixture Anthem, ready, \d warnings"/);
  /* a board with clues in it is what Trivia plays: no format switch to flip */
  assert.doesNotMatch(html, /role="radio"[^>]*>Rounds/);
  for (const text of ["Reset to recommended", "Export", "Import", "Avery Lane", "Favorite", "Shortlist", "Reject", "Sources and audience",
    "(right answer)", "Wedding surprise", "Asset gives it away", "Edited"]) assert.ok(html.includes(text), text);
  assert.match(html, /Put in 100|Take off board/);
  assert.ok((html.match(/<article class="fd-qb-card/g) || []).length <= 30, "a page at a time");
  assert.match(html, /Show \d+ more/);
  /* a slot not ready on the board offers to play it anyway; one waiting on Brandon never does */
  const alts = render({ initial:{ slot:{ col:0, slot:2 } } });
  assert.match(alts, /2 others/);
  assert.match(alts, /Whole bank/);
  assert.match(alts, /Take off board/, "what sits there leads, and comes off in one tap");
  assert.match(alts, /Play anyway/);
  assert.equal((alts.match(/<article class="fd-qb-card/g) || []).length, 3);
  assert.doesNotMatch(render({ initial:{ slot:{ col:1, slot:3 } } }), /Play anyway/);
  const loading = render({ preloaded:null, loadQBank:async () => ({ ok:true, records:[] }) });
  assert.match(loading, /Loading the question bank/);
  /* a frame without a plan reads the bank's answer */
  const bare = renderToStaticMarkup(React.createElement(QBankDesk, { state:{}, onAct:async () => ({ ok:true }),
    preloaded:qbankFixtureResponse({}) }));
  assert.match(bare, /34<\/b>\/35/);
});

test("the way in: Trivia's desk opens the question bank; only a commissioner's view renders it", async () => {
  const { React, renderToStaticMarkup, TriviaDesk } = await components();
  const state = { ...qbankFixtureState("fresh"), triviaRounds:[], trivia:null };
  const html = renderToStaticMarkup(React.createElement(TriviaDesk, { state, onAct:async () => ({ ok:true }), loadBank:async () => ({ ok:true, categories:[] }),
    onOpenBank:() => {} }));
  assert.match(html, /Your board/, "a board in the bank: it leads, the old set list folds away");
  assert.match(html, /35 of 35/);
  assert.match(html, /Old set list/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(TriviaDesk, { state, onAct:async () => ({ ok:true }),
    loadBank:async () => ({ ok:true, categories:[] }) })), /Question bank|Your board/);
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
  for (const file of ["QBankDesk.jsx", "qbankModel.js", "qbankMedia.js"])
    assert.doesNotMatch(read(`src/features/trivia/${file}`), /from\s+["'][^"']*worker\//, file);
});
