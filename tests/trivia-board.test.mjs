/* The Trivia board (Oct 8, docs/TRIVIA-BOARD.md): Jeopardy's shape on the
   TV, every phone a buzzer. The server side, through the real reducers:
   the board dealt from the set list, picks, buzzes and answers on the
   server clock, the Daily Double and the Final, the result through the
   ordinary write, the autopilot (and the Durable Object's alarm) and the
   pill, the format and the Final on the desk, QA, the photo and clip
   endpoints, and the bank's levels and Final pool. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, computeStandings, presentPlayers, resolveCurrentContest,
} from "../shared/core.js";
import {
  ANSWER_GAP_MS, ANSWER_GRACE_MS, ANSWER_MS, BOARD_COLUMNS_MAX, BOARD_PICK_MS, BOARD_VALUES, BOARD_ZOOM_MS, BUZZ_EARLY_MS,
  BUZZ_MS_MAX, BUZZ_MS_MIN, BUZZ_SETTLE_MS, BUZZ_SHOW_MS, DD_ANSWER_MS, DD_LOCKED_MS, DD_MIN, DD_STING_MS, DD_WAGER_MS,
  FINAL_ALL_IN_MS, FINAL_ANSWER_MS, FINAL_GRACE_MS, FINAL_INTRO_MS, FINAL_REVEAL_QUICK_MS, FINAL_REVEAL_STEP_MS,
  FINAL_REVEAL_TAIL_MS, FINAL_WAGER_MS, MAX_ATTEMPTS, REVEAL_HOLD_MS, autoPickClue, boardAutoBeat, boardResultSlots,
  boardScore, boardStandings, buzzCloseAt, cellsLeft, ddDefault, ddMax, finalEligible, finalRevealMs, finalRevealSchedule,
  readMs, turnPlayer,
} from "../shared/triviaBoard.js";
import { cleanTriviaQuestion, triviaBeat, triviaConfigured, triviaLive, triviaQuestionTotal } from "../shared/trivia.js";
import { autoBeat } from "../shared/autopilot.js";
import { resolveDirector } from "../shared/show.js";
import { TRIVIA_BANK, TRIVIA_FINALS } from "../worker/triviaBank.js";
import { TRIVIA_ACTION_TYPES, bankForDesk } from "../worker/trivia.js";
import { BOARD_ACTION_TYPES, boardShown, pickerOf } from "../worker/triviaBoard.js";
import { publicState } from "../worker/publicState.js";
import { buildSnapshot, validateSnapshot } from "../worker/snapshot.js";
import { hydrateStoredState } from "../worker/state.js";
import { ACTIONS } from "../worker/actions.js";
import { applyAction } from "./support/confirmed-start.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = (player = null) => ({ ...GM, player, deviceId:"gm", actionId:`g${++serial}` });
const auto = key => ({ isGm:true, auto:true, player:null, deviceId:"autopilot", actionId:key, environment:"local" });
const as = (player, actionId = `p${++serial}`, deviceId = `d-${player}`) => ({ isGm:false, player, deviceId, actionId });
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
/* Date.now pinned to `ms` for one call */
const at = (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
};
const atAsync = async (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
};
const trivia = state => allEventsOf(state).find(ev => ev.id === "trivia");

const q = (id, text, options, answer = 0) => ({ id, format:"choice", text, options, answer });
const SPORTS = { id:"tsports01", source:"bank", category:"sports",
  picks:["sports-16", "sports-01", "sports-10", "sports-06", "sports-02", "sports-15", "sports-03", "sports-04"] };
const MUSIC = { id:"tmusic001", source:"bank", category:"music", picks:["music-01", "music-04", "music-06", "music-15", "music-16"] };
const CUSTOM = { id:"tcustom01", source:"custom", name:"The groom", questions:[
  q("qgroom001", "Where did Brandon propose?", ["Kyoto", "Paris", "Big Sur", "Tahoe"], 2),
  { id:"qgroom002", format:"number", text:"How many days did they date before he proposed?", answer:1461, unit:"days", digits:4 },
  { id:"qgroom003", format:"picture", text:"Who is this?", photo:{ id:"pphoto0001", w:1600, h:1200 },
    options:["Evan", "Khoa", "Sahil", "Henry"], answer:0 },
  { id:"qgroom004", format:"tune", text:"", options:[{ title:"Mr. Brightside", artist:"The Killers" },
    { title:"Take Me Out", artist:"Franz Ferdinand" }, { title:"Last Nite", artist:"The Strokes" },
    { title:"The Middle", artist:"Jimmy Eat World" }], answer:0, clip:{ isrc:"USIR20400274" } },
  q("qgroom005", "What does he order at a bar?", ["Old Fashioned", "Negroni", "IPA", "Margarita"]),
] };
/* three cells, 200 to 600: the Daily Double is the 600 (the only deep one) */
const SMALL = { id:"tsmall001", source:"custom", name:"Warmup", questions:[
  q("qsmall001", "First?", ["A1", "B1", "C1", "D1"], 0),
  q("qsmall002", "Second?", ["A2", "B2", "C2", "D2"], 1),
  q("qsmall003", "Third?", ["A3", "B3", "C3", "D3"], 2),
] };
const FINAL = { id:"tfinal001", category:"The groom",
  questions:[q("qfinal001", "Where is the bachelor party?", ["Scottsdale", "Tahoe", "Austin", "Nashville"])] };

/* a room at Trivia: the event locked and started, no set list yet */
let BASE = null;
function base() {
  if (!BASE) {
    const state = structuredClone(EMPTY_STATE);
    act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
    const contest = resolveCurrentContest(state, trivia(state));
    act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
    assert.equal(state.trivia, null);
    BASE = state;
  }
  return structuredClone(BASE);
}
function board(rounds = [SPORTS, CUSTOM], { away = [], final = null, start = true, format = "board" } = {}) {
  const state = base();
  for (const player of away) act(state, "setAway", { player, away:true });
  act(state, "triviaSetFormat", { format });
  for (const round of rounds) act(state, "triviaSaveRound", { round:structuredClone(round) });
  if (final) act(state, "triviaSaveFinal", { final:structuredClone(final) });
  if (start) act(state, "triviaStart", { evId:"trivia" });
  return state;
}

const logOf = (state, id = state.trivia.current) => state.trivia.log[id];
const score = (state, player) => boardScore(state.trivia, player);
/* a cell that is not the Daily Double */
const ordinary = state => cellsLeft(state.trivia).find(id => id !== state.trivia.dd);
const pick = (state, clueId = ordinary(state), ctx = gm()) =>
  at(state.trivia.pickAt + 100, () => act(state, "boardPick", { clueId }, ctx));
const buzz = (state, player, ms, when = logOf(state).armAt) =>
  at(when, () => act(state, "boardBuzz", { clueId:state.trivia.current, ms }, as(player)));
const close = (state, when = buzzCloseAt(logOf(state))) =>
  at(when, () => act(state, "boardCloseBuzz", { clueId:state.trivia.current }));
const answer = (state, player, choice, when = logOf(state).turnAt) =>
  at(when, () => act(state, "boardAnswer", { clueId:state.trivia.current, choice }, as(player)));
const rightOf = state => state.trivia.clues[state.trivia.current].answer;
const wrongOf = (state, n = 1) => (rightOf(state) + n) % 4;
const next = state => at(logOf(state).revealedAt + 10, () => act(state, "boardNext", { clueId:state.trivia.current }));

/* ── the board ── */

test("the board deals from the set list: a column a round (six at most), five a column easiest first, buzzer questions only", () => {
  const state = board([SPORTS, CUSTOM], { away:["Ben"] });
  const game = state.trivia;
  assert.equal(game.format, "board");
  assert.deepEqual(game.questions, [], "a board game keeps questions empty, so older code leaves it alone");
  assert.equal(triviaLive(state), true);
  assert.deepEqual(game.columns.map(column => column.name), ["Sports", "The groom"]);
  const sources = column => column.clues.map(id => game.clues[id].source);
  assert.deepEqual(sources(game.columns[0]), ["sports-06", "sports-03", "sports-01", "sports-04", "sports-15"],
    "the bank's levels, easiest first, five of the eight picks; the closest-number pick is skipped");
  assert.deepEqual(game.columns[0].clues.map(id => game.clues[id].value), BOARD_VALUES);
  assert.deepEqual(sources(game.columns[1]), ["qgroom001", "qgroom003", "qgroom004", "qgroom005"],
    "his own round keeps its written order; a closest number is not a buzzer question");
  assert.deepEqual(game.columns[1].clues.map(id => game.clues[id].value), BOARD_VALUES.slice(0, 4));
  const first = game.clues[game.columns[0].clues[0]];
  const bankFirst = TRIVIA_BANK.find(category => category.id === "sports").questions.find(item => item.id === "sports-06");
  assert.equal(first.options[first.answer], bankFirst.options[0], "options dealt, the answer following its option");
  assert.equal(first.level, undefined, "the level stays in the bank");
  assert.equal(game.clues[game.columns[1].clues[2]].clip.title, "Mr. Brightside", "a tune names the recording the TV plays");
  assert.ok(game.dd && game.clues[game.dd].value >= 600, "one Daily Double, worth 600 or more");
  const bankFinal = TRIVIA_FINALS.find(item => item.id === game.final.source);
  assert.ok(bankFinal, "with no Final of his own, one of the bank's");
  assert.equal(game.final.id, `${game.id}-final`);
  assert.equal(game.final.category, bankFinal.category);
  assert.equal(game.final.options[game.final.answer], bankFinal.options[0]);
  assert.deepEqual(game.players, presentPlayers(state));
  assert.ok(!game.players.includes("Ben"), "an away player is not seated");
  assert.ok(game.players.includes(game.control), "a player here holds the board first");
  assert.deepEqual([game.phase, game.current, game.played], ["pick", null, []]);
  assert.equal(act(state, "triviaStart", { evId:"trivia" }).extra.unchanged, true, "a second start is acknowledged");
  /* a phone sees each cell's place and value, nothing else, until it is picked */
  const view = publicState(state, { player:"Evan" }).trivia;
  for (const id of Object.keys(game.clues)) assert.deepEqual(Object.keys(view.clues[id]).sort(), ["col", "id", "row", "value"]);
  assert.deepEqual([view.dd, view.final, view.ops, view.total], [undefined, null, undefined, 9]);
  const text = JSON.stringify(publicState(state, { player:"Evan" }));
  for (const clue of Object.values(game.clues)) if (clue.text) assert.ok(!text.includes(clue.text), "no clue before its pick");
  assert.ok(!text.includes("Mr. Brightside") && !text.includes(game.final.text), "no tune, no Final");
  const tune = game.columns[1].clues[2];
  pick(state, tune);
  const picked = publicState(state, {}).trivia.clues[tune];
  assert.deepEqual([picked.format, picked.options.length, picked.answer, picked.clip], ["tune", 4, undefined, undefined],
    "picked: its options on every screen, never the recording or the answer");
  const blind = publicState(state, { isGm:true, player:game.players[0] }).trivia;
  assert.equal(blind.clues[game.columns[0].clues[0]].text, undefined, "the commissioner playing plays blind");
  const watching = publicState(state, { isGm:true, player:null }).trivia;
  assert.equal(watching.clues[game.columns[0].clues[0]].text, game.clues[game.columns[0].clues[0]].text, "watching, he sees it all");
  /* six columns at most */
  const seven = Array.from({ length:7 }, (_, i) => ({ id:`tround${i}xxx`, source:"custom", name:`Round ${i + 1}`,
    questions:[q(`qround${i}xxx`, `Question ${i + 1}?`, ["W", "X", "Y", "Z"])] }));
  assert.equal(board(seven).trivia.columns.length, BOARD_COLUMNS_MAX);
  /* his own Final */
  const own = board([SPORTS], { final:FINAL }).trivia.final;
  assert.deepEqual([own.category, own.text, own.source, own.options[own.answer]],
    ["The groom", "Where is the bachelor party?", "qfinal001", "Scottsdale"]);
  /* nothing a buzzer can answer */
  const numbers = board([{ id:"tnumber01", source:"bank", category:"sports", picks:["sports-10", "sports-11"] }], { start:false });
  assert.equal(refuse(numbers, "triviaStart", { evId:"trivia" }), "Add rounds in the Trivia desk first");
  assert.equal(numbers.trivia, null);
});

test("a pick: the player who holds the board, the commissioner for them, or the autopilot's next clue", () => {
  const state = board();
  const game = state.trivia;
  const control = game.control;
  const other = game.players.find(player => player !== control);
  const target = ordinary(state);
  assert.equal(at(game.pickAt + 50, () => refuse(state, "boardPick", { clueId:target }, as(other))), "Not your pick");
  assert.equal(refuse(state, "boardPick", { clueId:"nope" }, as(control)), "That clue isn't on the board");
  at(game.pickAt + 100, () => act(state, "boardPick", { clueId:target }, as(control, "pick-1")));
  const log = logOf(state, target);
  assert.deepEqual([game.phase, game.current, game.played], ["clue", target, [target]]);
  assert.deepEqual([log.by, log.auto, log.pickedAt], [control, false, game.pickAt + 100]);
  assert.equal(log.shownAt, log.pickedAt + BOARD_ZOOM_MS);
  assert.equal(log.armAt, log.shownAt + readMs(game.clues[target]));
  assert.equal(applyAction(state, "boardPick", { clueId:target }, as(control, "pick-1")).extra?.unchanged, true,
    "a retried pick is acknowledged");
  assert.equal(refuse(state, "boardPick", { clueId:cellsLeft(game)[0] }, as(control)), "The pick is in");
  /* nobody buzzes: the answer stands, the board comes back */
  close(state, log.openUntil);
  assert.deepEqual([game.phase, log.winner, log.order], ["reveal", null, []]);
  next(state);
  assert.equal(game.phase, "pick");
  assert.equal(at(game.pickAt + 10, () => refuse(state, "boardPick", { clueId:target }, as(control))), "That one is played");

  /* the commissioner picks any cell for whoever holds the board */
  const second = cellsLeft(game).filter(id => id !== game.dd).at(-1);
  pick(state, second);
  assert.deepEqual([logOf(state).by, logOf(state).auto], [control, true]);

  /* the autopilot: the next clue in reading order once the picker has waited */
  const waiting = board();
  const wait = waiting.trivia;
  const beat = boardAutoBeat(waiting);
  assert.deepEqual(beat, { at:wait.pickAt + BOARD_PICK_MS, from:wait.pickAt, type:"boardPick",
    payload:{ clueId:autoPickClue(wait), auto:true }, key:`board:${wait.id}:pick0` });
  assert.equal(autoPickClue(wait), wait.columns[0].clues[0], "the lowest value of the leftmost column");
  const before = JSON.stringify(wait);
  assert.equal(at(beat.at - 1000, () => act(waiting, beat.type, beat.payload, auto(beat.key))).extra.stale, true, "not yet due");
  assert.equal(at(beat.at, () => act(waiting, "boardPick", { clueId:wait.columns[1].clues[0], auto:true }, auto(beat.key))).extra.stale,
    true, "the autopilot picks only the next clue");
  assert.equal(JSON.stringify(wait), before);
  assert.equal(at(beat.at, () => refuse(waiting, "boardPick", { clueId:wait.columns[1].clues[0], auto:true })), "That clue isn't next",
    "the pill taking the autopilot's pick takes that clue");
  at(beat.at, () => act(waiting, beat.type, beat.payload, auto(beat.key)));
  assert.deepEqual([logOf(waiting).by, logOf(waiting).auto, wait.current], [wait.control, true, beat.payload.clueId]);
  assert.equal(at(beat.at + 5, () => act(waiting, beat.type, beat.payload, auto(beat.key))).extra.stale, true, "a retried beat");

  /* the picker stepped away: the board passes to the best score still here */
  const left = board();
  const holder = left.trivia.control;
  act(left, "setAway", { player:holder, away:true });
  const passed = pickerOf(left, left.trivia);
  assert.notEqual(passed, holder);
  assert.equal(passed, left.trivia.players.find(player => player !== holder), "everyone at 0: the order they joined");
  assert.equal(at(left.trivia.pickAt + 10, () => refuse(left, "boardPick", { clueId:ordinary(left) }, as(holder))), "You are marked away");
  pick(left);
  assert.deepEqual([logOf(left).by, left.trivia.control], [passed, passed]);
});

test("buzzers: open on the server clock, a beat early at most; once each; settle after the first; the order by reaction, not arrival", () => {
  const state = board([SPORTS, CUSTOM], { away:["Ben"] });
  pick(state);
  const game = state.trivia, id = game.current, log = logOf(state);
  const [a, b, c, d, e] = game.players;
  assert.equal(at(log.armAt - BUZZ_EARLY_MS - 1, () => refuse(state, "boardBuzz", { clueId:id, ms:200 }, as(a))),
    "Buzzers are not open yet");
  at(log.armAt - BUZZ_EARLY_MS, () => act(state, "boardBuzz", { clueId:id, ms:420 }, as(a)));
  const first = log.buzzes[a].at;
  assert.equal(at(first + 5, () => act(state, "boardBuzz", { clueId:id, ms:90 }, as(a))).extra.unchanged, true, "once a clue");
  assert.equal(log.buzzes[a].ms, 420);
  /* the phones see who is in, never how fast, until the buzzers close */
  const phone = publicState(state, { player:b }).trivia.log[id];
  assert.deepEqual(phone.buzzes, { [a]:{ in:true } });
  assert.deepEqual(publicState(state, { player:a }).trivia.log[id].buzzes[a], log.buzzes[a], "your own buzz is yours");
  at(first + 300, () => act(state, "boardBuzz", { clueId:id, ms:5 }, as(c)));
  at(first + 400, () => act(state, "boardBuzz", { clueId:id }, as(d)));
  assert.deepEqual([log.buzzes[c].ms, log.buzzes[d].ms], [BUZZ_MS_MIN, BUZZ_MS_MAX], "a reaction is held to its range");
  at(first + BUZZ_SETTLE_MS, () => act(state, "boardBuzz", { clueId:id, ms:250 }, as(b)));
  assert.equal(at(first + BUZZ_SETTLE_MS + 1, () => refuse(state, "boardBuzz", { clueId:id, ms:150 }, as(e))), "Buzzers closed",
    "the buzzers settle a beat after the first buzz lands");
  assert.equal(at(log.armAt, () => refuse(state, "boardBuzz", { clueId:id, ms:150 }, as("Ben"))), "You are marked away");
  assert.equal(refuse(state, "boardBuzz", { clueId:id, ms:150 }, { isGm:false, player:null }), "Check in first");
  assert.equal(at(log.armAt - 1, () => refuse(state, "boardCloseBuzz", { clueId:id })), "Buzzers are not open yet");
  const beat = boardAutoBeat(state);
  assert.deepEqual([beat.type, beat.at], ["boardCloseBuzz", first + BUZZ_SETTLE_MS]);
  at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key)));
  assert.deepEqual(log.order, [c, b, a, d], "fastest reaction first: b arrived last and answers second");
  assert.equal(log.closedAt, first + BUZZ_SETTLE_MS);
  assert.deepEqual([game.phase, log.turn, log.turnAt], ["answer", 0, log.closedAt + BUZZ_SHOW_MS]);
  assert.equal(at(log.closedAt + 1, () => refuse(state, "boardBuzz", { clueId:id, ms:150 }, as(e))), "Buzzers closed");
  assert.deepEqual(publicState(state, { player:e }).trivia.log[id].buzzes, log.buzzes, "closed: every reaction shows");
  /* a present player who was away at the start joins on their first buzz */
  act(state, "setAway", { player:"Ben", away:false });
  at(log.turnAt, () => act(state, "boardTimeout", { clueId:id, turn:0 }));
  answer(state, b, rightOf(state));
  next(state);
  pick(state);
  buzz(state, "Ben", 333);
  assert.ok(state.trivia.players.includes("Ben"));
  /* someone off the roster never joins */
  assert.equal(at(logOf(state).armAt, () => refuse(state, "boardBuzz", { clueId:state.trivia.current, ms:300 }, as("Nobody"))),
    "You are not playing");
});

test("answers: the turn's player only, struck options out, right takes the value and the board, wrong costs it and passes the turn", () => {
  const state = board();
  pick(state);
  const game = state.trivia, id = game.current, log = logOf(state), value = game.clues[id].value;
  const [a, b, c, d] = game.players.filter(player => player !== game.control);
  buzz(state, a, 300); buzz(state, b, 400); buzz(state, c, 500); buzz(state, d, 600);
  close(state);
  assert.deepEqual(log.order, [a, b, c, d]);
  assert.equal(at(log.turnAt, () => refuse(state, "boardAnswer", { clueId:id, choice:rightOf(state) }, as(b))), "Not your turn");
  assert.equal(at(log.turnAt - 301, () => refuse(state, "boardAnswer", { clueId:id, choice:rightOf(state) }, as(a))), "Not your turn yet");
  assert.equal(at(log.turnAt, () => refuse(state, "boardAnswer", { clueId:id, choice:7 }, as(a))), "Pick an answer");
  assert.equal(at(log.turnAt, () => refuse(state, "boardAnswer", { clueId:id }, as(a))), "Pick an answer", "no choice is not option 0");
  const struck = wrongOf(state, 1);
  at(log.turnAt - 300, () => act(state, "boardAnswer", { clueId:id, choice:struck }, as(a, "answer-a")));
  assert.equal(score(state, a), -value, "wrong: minus the value");
  assert.deepEqual([game.phase, log.turn, turnPlayer(log)], ["answer", 1, b]);
  assert.equal(log.turnAt, log.attempts[0].at + ANSWER_GAP_MS, "the next turn after a beat");
  assert.equal(applyAction(state, "boardAnswer", { clueId:id, choice:struck }, as(a, "answer-a")).extra?.unchanged, true,
    "a retried answer is acknowledged once");
  assert.equal(refuse(state, "boardAnswer", { clueId:id, choice:wrongOf(state, 2) }, as(a)), "Not your turn");
  assert.equal(at(log.turnAt, () => refuse(state, "boardAnswer", { clueId:id, choice:struck }, as(b))), "That one is out");
  /* b's turn runs out: wrong, nothing struck */
  const turn = log.turn;
  const due = boardAutoBeat(state);
  assert.deepEqual([due.type, due.payload, due.at], ["boardTimeout", { clueId:id, turn }, log.turnAt + ANSWER_MS + ANSWER_GRACE_MS]);
  at(due.at, () => act(state, due.type, due.payload, auto(due.key)));
  assert.deepEqual(log.attempts.at(-1), { player:b, choice:null, at:due.at, right:false, timeout:true });
  assert.equal(score(state, b), -value);
  assert.equal(act(state, "boardTimeout", { clueId:id, turn }).extra.unchanged, true, "a stale timeout changes nothing");
  assert.equal(at(log.turnAt + ANSWER_MS + ANSWER_GRACE_MS + 1, () => refuse(state, "boardAnswer", { clueId:id, choice:rightOf(state) },
    as(c))), "Time is up");
  /* c is right: the value and the board */
  answer(state, c, rightOf(state));
  assert.deepEqual([game.phase, log.winner, game.control, score(state, c)], ["reveal", c, c, value]);
  assert.equal(log.revealedAt, log.turnAt);
  assert.equal(score(state, d), 0, "d never answered");
  assert.equal(refuse(state, "boardAnswer", { clueId:id, choice:0 }, as(d)), "That turn is over");
  const revealed = publicState(state, { player:d }).trivia.clues[id];
  assert.equal(revealed.answer, game.clues[id].answer, "the answer reaches the phones once it stands");

  /* three wrong and the clue is done: the fourth in line never answers */
  next(state);
  pick(state);
  const second = state.trivia.current, log2 = logOf(state), value2 = state.trivia.clues[second].value;
  [a, b, c, d].forEach((player, i) => buzz(state, player, 200 + i * 10));
  close(state);
  for (const [i, player] of [a, b, c].entries()) answer(state, player, wrongOf(state, i + 1));
  assert.equal(MAX_ATTEMPTS, 3);
  assert.deepEqual([state.trivia.phase, log2.winner, log2.attempts.length], ["reveal", null, MAX_ATTEMPTS]);
  assert.equal(state.trivia.control, c, "nobody right: the board stays");
  assert.equal(score(state, d), 0);
  assert.equal(score(state, c), value - value2);
});

test("the Daily Double: the picker alone wagers, in 100s up to their score or the board's top, and answers once", () => {
  const state = board();
  const game = state.trivia;
  const picker = game.control;
  const other = game.players.find(player => player !== picker);
  /* the picker banks the biggest ordinary clue first */
  const big = cellsLeft(game).filter(id => id !== game.dd).sort((x, y) => game.clues[y].value - game.clues[x].value)[0];
  pick(state, big);
  buzz(state, picker, 300);
  close(state);
  answer(state, picker, rightOf(state));
  next(state);
  const banked = game.clues[big].value;
  assert.deepEqual([score(state, picker), game.control], [banked, picker]);
  const dd = game.dd;
  at(game.pickAt + 100, () => act(state, "boardPick", { clueId:dd }, as(picker)));
  const log = logOf(state);
  assert.deepEqual([game.phase, log.by, log.armAt], ["dd-wager", picker, undefined], "no buzzers on a Daily Double");
  const guest = publicState(state, { player:other }).trivia;
  assert.deepEqual([guest.dd, guest.clues[dd].dd], [dd, true], "revealed once picked");
  const beforeWager = boardAutoBeat(state);
  assert.deepEqual([beforeWager.type, beforeWager.at], ["boardDdClue", log.pickedAt + DD_STING_MS + DD_WAGER_MS]);
  const max = ddMax(banked, 1000);
  assert.equal(max, Math.max(1000, banked));
  assert.equal(refuse(state, "boardWager", { wager:500 }, as(other)), "Not your Daily Double");
  for (const wager of [0, 150, max + 100, null])
    assert.equal(refuse(state, "boardWager", { wager }, as(picker)), `Wager in 100s, up to ${max.toLocaleString("en-US")}`);
  at(log.pickedAt + 4000, () => act(state, "boardWager", { wager:max }, as(picker)));
  assert.deepEqual([log.wager, log.wagerAt], [max, log.pickedAt + 4000]);
  assert.equal(refuse(state, "boardWager", { wager:DD_MIN }, as(picker)), "You already wagered");
  assert.equal(act(state, "boardWager", { wager:max }, as(picker)).extra.unchanged, true);
  const locked = boardAutoBeat(state);
  assert.deepEqual([locked.type, locked.at], ["boardDdClue", log.wagerAt + DD_LOCKED_MS], "a breath after the lock");
  at(locked.at, () => act(state, locked.type, locked.payload, auto(locked.key)));
  assert.deepEqual([game.phase, log.order, log.turn, log.shownAt], ["dd-clue", [picker], 0, locked.at]);
  assert.equal(log.turnAt, log.shownAt + readMs(game.clues[dd]));
  assert.equal(at(log.turnAt, () => refuse(state, "boardAnswer", { clueId:dd, choice:rightOf(state) }, as(other))), "Not your turn");
  const timeout = boardAutoBeat(state);
  assert.equal(timeout.at, log.turnAt + DD_ANSWER_MS + ANSWER_GRACE_MS, "the Daily Double answers on a longer clock");
  answer(state, picker, wrongOf(state));
  assert.deepEqual([game.phase, log.winner, log.attempts.length], ["reveal", null, 1], "one attempt");
  assert.equal(score(state, picker), banked - max, "the stake, lost");
  assert.equal(score(state, other), 0, "nobody else answered");

  /* no wager in: half the most they could risk; right wins it */
  const quiet = board();
  const g2 = quiet.trivia;
  pick(quiet, g2.dd);
  const log2 = logOf(quiet);
  const due = boardAutoBeat(quiet);
  at(due.at, () => act(quiet, due.type, due.payload, auto(due.key)));
  assert.equal(log2.wager, ddDefault(0, 1000));
  assert.equal(log2.wagerAt, undefined, "never locked by the picker");
  answer(quiet, log2.by, rightOf(quiet));
  assert.deepEqual([score(quiet, log2.by), g2.control], [ddDefault(0, 1000), log2.by]);
  /* a Daily Double that only ran out is not playing */
  const idle = board();
  pick(idle, idle.trivia.dd);
  const idleLog = logOf(idle);
  at(boardAutoBeat(idle).at, () => act(idle, "boardDdClue", { clueId:idle.trivia.dd }, auto(boardAutoBeat(idle).key)));
  at(idleLog.turnAt + DD_ANSWER_MS + ANSWER_GRACE_MS, () => act(idle, "boardTimeout", { clueId:idle.trivia.dd, turn:0 }));
  const row = boardStandings(idle.trivia).find(item => item.player === idleLog.by);
  assert.deepEqual([row.score, row.played], [-ddDefault(0, 1000), false]);
});

/* Play SMALL to the Final: a right on the 200, b wrong on the 400, then a
   (holding the board) wagers 100 on the Daily Double 600 and is right:
   a 300, b -400, everyone else 0. */
function toFinal(final = FINAL) {
  const state = board([SMALL], { final });
  const game = state.trivia;
  const [, a, b, c] = game.players;
  const [one, two, three] = game.columns[0].clues;
  assert.equal(game.dd, three);
  pick(state, one);
  buzz(state, a, 300);
  close(state);
  answer(state, a, rightOf(state));
  next(state);
  pick(state, two);
  buzz(state, b, 300);
  close(state);
  answer(state, b, wrongOf(state));
  next(state);
  pick(state, three);
  assert.equal(logOf(state).by, a);
  act(state, "boardWager", { wager:100 }, as(a));
  at(logOf(state).wagerAt + DD_LOCKED_MS, () => act(state, "boardDdClue", { clueId:three }));
  answer(state, a, rightOf(state));
  next(state);
  return { state, game, a, b, c };
}

test("the Final: wagers from scores above zero, answers change until locked, all unseen until the TV turns them", () => {
  const { state, game, a, b, c } = toFinal();
  const commissioner = game.players[0];
  assert.deepEqual([score(state, a), score(state, b), score(state, c)], [300, -400, 0]);
  assert.equal(game.phase, "final-wager");
  assert.deepEqual(game.finalAt, { introAt:game.finalAt.introAt, wagerUntil:game.finalAt.introAt + FINAL_INTRO_MS + FINAL_WAGER_MS });
  assert.deepEqual(finalEligible(state, game), [a]);
  const guestView = publicState(state, { player:c }).trivia;
  assert.deepEqual(guestView.final, { id:game.final.id, category:"The groom" }, "the category stands; the clue waits");
  assert.equal(refuse(state, "boardWager", { wager:0 }, as(b)), "Only scores above zero wager");
  assert.equal(refuse(state, "boardWager", { wager:0 }, as(c)), "Only scores above zero wager");
  assert.equal(refuse(state, "boardWager", { wager:400 }, as(a)), "Wager in 100s, up to 300");
  assert.equal(refuse(state, "boardWager", { wager:150 }, as(a)), "Wager in 100s, up to 300");
  assert.equal(refuse(state, "boardFinalPick", { choice:0 }, as(a)), "The Final is not up yet");
  at(game.finalAt.introAt + 5000, () => act(state, "boardWager", { wager:300 }, as(a, "wager-a")));
  assert.equal(act(state, "boardWager", { wager:300 }, as(a, "wager-a")).extra.unchanged, true);
  assert.equal(refuse(state, "boardWager", { wager:200 }, as(a)), "You already wagered");
  assert.deepEqual(publicState(state, { player:c }).trivia.finalWagers, { [a]:{ locked:true } }, "a wager is in, never how much");
  /* everyone eligible is in: the clue goes up a beat later (after the intro) */
  const clueBeat = boardAutoBeat(state);
  assert.deepEqual([clueBeat.type, clueBeat.at], ["boardFinalClue",
    Math.max(game.finalAt.introAt + FINAL_INTRO_MS, game.finalWagers[a].at + FINAL_ALL_IN_MS)]);
  at(clueBeat.at, () => act(state, clueBeat.type, clueBeat.payload, auto(clueBeat.key)));
  assert.equal(game.phase, "final-clue");
  assert.equal(game.finalAt.answerUntil, game.finalAt.clueAt + FINAL_ANSWER_MS);
  assert.equal(refuse(state, "boardWager", { wager:100 }, as(c)), "Wagers are closed");
  /* answers: set, change, lock; a lock stays; a retry never undoes a newer pick */
  const t0 = game.finalAt.clueAt + 1000;
  const wrong = (game.final.answer + 1) % 4;
  at(t0, () => act(state, "boardFinalPick", { choice:wrong }, as(a, "fp-1")));
  at(t0 + 10, () => act(state, "boardFinalPick", { choice:game.final.answer }, as(a, "fp-2")));
  assert.equal(at(t0 + 20, () => act(state, "boardFinalPick", { choice:wrong }, as(a, "fp-1"))).extra.unchanged, true);
  assert.equal(game.finalPicks[a].choice, game.final.answer);
  at(t0 + 30, () => act(state, "boardFinalPick", { lock:true }, as(a)));
  assert.deepEqual(game.finalPicks[a], { choice:game.final.answer, at:t0 + 10, locked:true, lockedAt:t0 + 30 });
  assert.equal(refuse(state, "boardFinalPick", { choice:wrong }, as(a)), "You locked in");
  assert.equal(act(state, "boardFinalPick", { choice:game.final.answer, lock:true }, as(a)).extra.unchanged, true);
  at(t0 + 40, () => act(state, "boardFinalPick", { choice:wrong, lock:true }, as(c)));
  at(t0 + 50, () => act(state, "boardFinalPick", { choice:game.final.answer }, as(b)));
  assert.equal(refuse(state, "boardFinalPick", { lock:true }, as(game.players[4])), "Pick an answer first");
  assert.equal(at(game.finalAt.answerUntil + FINAL_GRACE_MS + 1, () => refuse(state, "boardFinalPick", { choice:0 }, as(game.players[4]))),
    "Time is up");
  /* unseen: a player, the commissioner playing, the TV; the commissioner watching sees it all */
  for (const viewer of [{ player:c }, { isGm:true, player:commissioner }, {}]) {
    const view = publicState(state, viewer).trivia;
    assert.equal(view.final.answer, undefined, JSON.stringify(viewer));
    assert.equal(view.final.text, "Where is the bachelor party?", "the Final reads on every phone");
    assert.deepEqual(view.finalPicks[a], { locked:true, set:true });
    assert.deepEqual(view.finalWagers[a], { locked:true });
  }
  assert.deepEqual(publicState(state, { player:c }).trivia.finalPicks[c], game.finalPicks[c], "your own answer is yours");
  const watching = publicState(state, { isGm:true, player:null }).trivia;
  assert.deepEqual([watching.final.answer, watching.finalPicks[a].choice, watching.finalWagers[a].wager],
    [game.final.answer, game.final.answer, 300]);
  assert.ok(!JSON.stringify(publicState(state, { player:c })).includes('"ops"'), "the retry ledger never leaves");
  /* the reveal: lowest score first, a zero wager turns quicker */
  const revealBeat = boardAutoBeat(state);
  assert.equal(revealBeat.at, game.finalAt.answerUntil + FINAL_GRACE_MS, "b never locked: the clock runs out");
  at(revealBeat.at, () => act(state, revealBeat.type, revealBeat.payload, auto(revealBeat.key)));
  assert.equal(game.phase, "final-reveal");
  const schedule = finalRevealSchedule(game);
  assert.deepEqual(schedule.map(item => item.player), [b, c, a], "from the lowest score up; nobody who never played");
  assert.deepEqual(schedule.map(item => [item.at, item.ms]), [[0, FINAL_REVEAL_QUICK_MS], [FINAL_REVEAL_QUICK_MS, FINAL_REVEAL_QUICK_MS],
    [2 * FINAL_REVEAL_QUICK_MS, FINAL_REVEAL_STEP_MS]]);
  const revealed = publicState(state, { player:c }).trivia;
  assert.equal(revealed.final.answer, game.final.answer);
  assert.deepEqual(revealed.finalWagers[a], game.finalWagers[a]);
  assert.deepEqual([score(state, a), score(state, b), score(state, c)], [600, -400, 0]);
  assert.match(refuse(state, "triviaFinish", { evId:"trivia" }), /Show the final scores first/);
  const boardBeat = boardAutoBeat(state);
  assert.equal(boardBeat.at, game.finalAt.revealAt + finalRevealMs(game) + FINAL_REVEAL_TAIL_MS);
  at(boardBeat.at, () => act(state, boardBeat.type, boardBeat.payload, auto(boardBeat.key)));
  assert.equal(game.phase, "final-board");
  /* the result: one winner, then the next two ranks, through the ordinary write */
  const before = computeStandings(state).find(row => row.player === a);
  const finish = boardAutoBeat(state);
  assert.deepEqual([finish.type, finish.payload], ["triviaFinish", { evId:"trivia" }]);
  const done = at(finish.at, () => act(state, finish.type, finish.payload, auto(finish.key)));
  assert.deepEqual(state.results.trivia.slots, [[a], [c], [b]]);
  assert.deepEqual(done.extra.slots, boardResultSlots(boardStandings(game)));
  assert.ok(game.finishedAt);
  const after = computeStandings(state).find(row => row.player === a);
  assert.equal(after.awardPts - before.awardPts, 1600, "the 1,600 ladder pays 1st like any result");
  assert.equal(triviaLive(state), false);
  assert.equal(boardAutoBeat(state), null);
  assert.equal(triviaBeat(state, trivia(state)), null);
  assert.match(refuse(state, "triviaRestart", { evId:"trivia" }), /Clear the result/);
});

test("no Final: the board goes straight to the final scores", () => {
  const state = board([SMALL]);
  state.trivia.final = null;
  for (const clueId of [...state.trivia.columns[0].clues]) {
    pick(state, clueId);
    if (state.trivia.phase === "dd-wager") act(state, "boardDdClue", { clueId });
    else close(state, logOf(state).openUntil);
    if (state.trivia.phase !== "reveal") act(state, "boardTimeout", { clueId, turn:0 });
    next(state);
  }
  assert.equal(state.trivia.phase, "final-board");
  assert.ok(state.trivia.finalAt.boardAt);
});

/* ── the autopilot ── */

/* every beat on the autopilot's own clock, the room doing `room(state)`
   first; stops at the first refused beat */
function runOnAutopilot(state, room = () => false) {
  const seen = [];
  for (let guard = 0; guard < 600; guard++) {
    if (room(state)) continue;
    const beat = autoBeat(state);
    if (!beat) return { seen, refused:null };
    const result = at(beat.at, () => applyAction(state, beat.type, beat.payload, auto(beat.key)));
    if (!result.ok) return { seen, refused:{ type:beat.type, error:result.error } };
    assert.notEqual(result.extra?.unchanged, true, `${beat.type} at its own time changed nothing`);
    seen.push(beat.type);
  }
  throw new Error("the autopilot never finished");
}

test("the autopilot alone: nobody touching anything, every clock runs out, and there is nothing to post", () => {
  const state = board([SPORTS, MUSIC]);
  const { seen, refused } = runOnAutopilot(state);
  const game = state.trivia;
  assert.equal(game.played.length, 10, "every cell played");
  assert.equal(game.phase, "final-board");
  assert.deepEqual(refused, { type:"triviaFinish", error:"Nobody played" }, "nobody played: no result, the finish refused once");
  assert.equal(state.results.trivia, undefined);
  assert.ok(seen.includes("boardFinalClue") && seen.includes("boardFinalReveal") && seen.includes("boardFinalBoard"));
  assert.ok(boardStandings(game).every(row => !row.played));
});

test("the autopilot with players who buzz and never answer: every turn runs out, and the result still posts", () => {
  const state = board([SMALL]);
  const [, a, b] = state.trivia.players;
  const done = new Set();
  const room = s => {
    const game = s.trivia, log = game.current && game.log[game.current];
    if (game.phase !== "clue" || done.has(game.current)) return false;
    done.add(game.current);
    buzz(s, a, 300);
    buzz(s, b, 500);
    return true;
  };
  const { refused } = runOnAutopilot(state, room);
  assert.equal(refused, null);
  assert.ok(state.results.trivia, "the result posts");
  const rows = boardStandings(state.trivia);
  assert.ok(rows.filter(row => row.played).every(row => [a, b].includes(row.player) || row.player === state.trivia.log[state.trivia.dd].by));
  assert.ok(state.results.trivia.slots[0].length === 1);
});

test("the autopilot runs a whole game with everyone playing: picks, buzzes, answers, the Daily Double, the Final, the result", () => {
  const state = board([SPORTS, CUSTOM]);
  const game = state.trivia;
  const acted = new Set();
  let wrong = false;
  const room = s => {
    const g = s.trivia, log = g.current ? g.log[g.current] : null;
    const key = `${g.phase}:${g.current}:${log?.turn ?? ""}`;
    if (acted.has(key)) return false;
    acted.add(key);
    if (g.phase === "pick") {
      at(g.pickAt + 2000, () => act(s, "boardPick", { clueId:cellsLeft(g).at(-1) }, as(pickerOf(s, g))));
      return true;
    }
    if (g.phase === "clue") {
      g.players.slice(0, 4).forEach((player, i) => buzz(s, player, 250 + 37 * i));
      return true;
    }
    if (g.phase === "answer" || g.phase === "dd-clue") {
      wrong = !wrong;
      answer(s, turnPlayer(log), wrong ? wrongOf(s) : rightOf(s));
      return true;
    }
    if (g.phase === "dd-wager") {
      at(log.pickedAt + DD_STING_MS + 1000, () => act(s, "boardWager", { wager:DD_MIN }, as(log.by)));
      return true;
    }
    if (g.phase === "final-wager") {
      for (const player of finalEligible(s, g))
        at(g.finalAt.introAt + 4000, () => act(s, "boardWager", { wager:100 }, as(player)));
      return finalEligible(s, g).length > 0;
    }
    if (g.phase === "final-clue") {
      g.players.forEach((player, i) => at(g.finalAt.clueAt + 2000 + i, () => act(s, "boardFinalPick",
        { choice:i % 2 ? g.final.answer : (g.final.answer + 1) % 4, lock:true }, as(player))));
      return true;
    }
    return false;
  };
  const { seen, refused } = runOnAutopilot(state, room);
  assert.equal(refused, null);
  assert.equal(game.played.length, 9, "every cell");
  assert.ok(state.results.trivia, "the result posts on the autopilot");
  assert.deepEqual(state.results.trivia.slots, boardResultSlots(boardStandings(game)));
  assert.ok(game.finishedAt);
  /* everyone locked in: the reveal came a beat after the last lock, not at the deadline */
  assert.ok(game.finalAt.revealAt < game.finalAt.answerUntil, "the Final reveals once everyone is in");
  assert.ok(seen.includes("boardDdClue"), "the Daily Double played");
  assert.ok(seen.filter(type => type === "boardTimeout").length === 0, "nobody ran out of time");
  assert.equal(seen.at(-1), "triviaFinish");
});

test("autopilot writes: stale or early is a no-op; held, nothing runs and the pill offers each beat by hand", async () => {
  const { directorPill } = await import("../src/features/director/directorPill.js");
  const state = board();
  const game = state.trivia;
  const events = allEventsOf(state);
  let beat = autoBeat(state);
  assert.deepEqual(beat, boardAutoBeat(state), "the board's beat is the autopilot's");
  let pill = directorPill(state, events, resolveDirector(state, events));
  assert.deepEqual([pill.type, pill.label, pill.run], ["board-step", "Pick",
    { write:"boardPick", payload:{ clueId:autoPickClue(game), auto:true } }]);
  assert.deepEqual(pill.auto, { at:beat.at, from:beat.from, key:beat.key }, "the pill draws the autopilot's wait on the same write");
  /* the commissioner takes it early from the pill: the autopilot's beat is stale */
  act(state, pill.run.write, pill.run.payload);
  const picked = game.current;
  assert.equal(picked, game.columns[0].clues[0], "the top-left 200, never the Daily Double");
  assert.equal(at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.stale, true);
  assert.equal(game.current, picked);
  /* an old clue's beat after the room moved on */
  const closing = autoBeat(state);
  assert.equal(at(closing.at, () => act(state, "boardCloseBuzz", { clueId:"tbold-00" }, auto(closing.key))).extra.stale, true);
  /* held: nothing moves on its own */
  act(state, "setAutopilot", { hold:true });
  assert.equal(autoBeat(state), null);
  assert.equal(at(closing.at, () => act(state, closing.type, closing.payload, auto(closing.key))).extra.stale, true,
    "an auto write while held is stale");
  pill = directorPill(state, events, resolveDirector(state, events));
  assert.deepEqual([pill.label, pill.run, pill.auto, pill.held], ["Close buzzers",
    { write:"boardCloseBuzz", payload:{ clueId:picked } }, null, true]);
  assert.equal(pill.extras[0].label, "Resume autopilot");
  at(logOf(state).armAt, () => act(state, pill.run.write, pill.run.payload));
  assert.equal(game.phase, "reveal", "the commissioner closes by hand");
  act(state, "setAutopilot", { hold:false });
  assert.equal(autoBeat(state).type, "boardNext");
  /* the pill's beats through the rest: every one is a board-step with its own write */
  const labels = [];
  for (let guard = 0; guard < 80 && !state.results.trivia; guard++) {
    const director = resolveDirector(state, events);
    const step = directorPill(state, events, director);
    labels.push(step.label);
    if (step.type === "board-step") {
      const when = Math.max(game.current ? Number(logOf(state).armAt) || 0 : 0, Date.now());
      at(when, () => act(state, step.run.write, step.run.payload));
    } else {
      assert.deepEqual([step.type, step.run], ["trivia-finish", { write:"triviaFinish", payload:{ evId:"trivia" } }]);
      assert.equal(refuse(state, step.run.write, step.run.payload), "Nobody played");
      break;
    }
  }
  assert.ok(labels.includes("Show the Final") && labels.includes("Reveal") && labels.includes("Final scores"));
});

test("the Durable Object's alarm runs every board beat through the reducer; early or held, nothing; a refused finish stops asking", async () => {
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
  tournament.state = board([SMALL]);
  const first = tournament.nextAutoBeat();
  assert.equal(first.type, "boardPick");
  await atAsync(first.at - 1000, () => tournament.runAutopilot());
  assert.equal(tournament.state.trivia.phase, "pick", "not due: nothing");
  tournament.state.autopilot = { hold:true };
  await atAsync(first.at, () => tournament.runAutopilot());
  assert.equal(tournament.state.trivia.phase, "pick", "held: nothing");
  delete tournament.state.autopilot;
  await atAsync(first.at, () => tournament.runAutopilot());
  assert.equal(tournament.state.trivia.phase, "clue", "the pick, persisted");
  assert.equal(entries.get("state").trivia.phase, "clue");
  for (let guard = 0; guard < 60; guard++) {
    const due = tournament.nextAutoBeat();
    if (!due) break;
    await atAsync(due.at, () => tournament.runAutopilot());
  }
  const game = tournament.state.trivia;
  assert.equal(game.phase, "final-board", "the alarm alone carried the board through the Final");
  assert.equal(tournament.autoRefused, `board:${game.id}:finish`, "nobody played: the finish refused once");
  assert.equal(tournament.nextAutoBeat(), null, "and the alarm stops asking");
});

/* ── the format and the Final on the desk ── */

test("the format: commissioner only, Rounds or Board, never while a game runs, kept by a reset, public", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(state.triviaFormat, "rounds");
  assert.equal(refuse(state, "triviaSetFormat", { format:"board" }, as("Evan")), "Commissioner only");
  assert.equal(refuse(state, "triviaSetFormat", { format:"jeopardy" }), "Pick Rounds or Board");
  assert.equal(act(state, "triviaSetFormat", { format:"rounds" }).extra.unchanged, true);
  act(state, "triviaSetFormat", { format:"board" });
  assert.equal(state.triviaFormat, "board");
  assert.equal(publicState(state, { player:"Evan" }).triviaFormat, "board", "the format is public");
  const playing = board();
  assert.equal(refuse(playing, "triviaSetFormat", { format:"rounds" }), "Restart the game before changing the format");
  act(playing, "triviaRestart", { evId:"trivia" });
  assert.equal(playing.trivia, null, "Restart clears a board game");
  act(playing, "triviaSetFormat", { format:"rounds" });
  act(playing, "triviaStart", { evId:"trivia" });
  assert.ok(playing.trivia.questions.length > 0, "a rounds game");
  assert.equal(refuse(playing, "triviaSetFormat", { format:"board" }), "Restart the game before changing the format");
  /* a reset keeps the set list and the format, clears the game */
  const reset = board([SPORTS], { final:FINAL });
  act(reset, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.deepEqual([reset.triviaFormat, reset.trivia], ["board", null]);
  assert.ok(reset.triviaRounds.some(round => round.source === "final"));
  /* snapshots carry it; an older state hydrates to Rounds */
  const snapshot = buildSnapshot(new Map([["state", reset], ["version", 4], ["claims", {}]]),
    { environment:"local", applicationVersion:"test" });
  assert.deepEqual(validateSnapshot(snapshot).errors, []);
  const { triviaFormat, ...old } = structuredClone(EMPTY_STATE);
  assert.equal(triviaFormat, "rounds");
  assert.equal(hydrateStoredState(old).triviaFormat, "rounds");
  assert.equal(hydrateStoredState(reset).triviaFormat, "board");
});

test("his own Final: one multiple-choice or picture question under a category, the set list's one final entry", () => {
  const state = structuredClone(EMPTY_STATE);
  const save = final => applyAction(state, "triviaSaveFinal", { final }, gm());
  assert.equal(applyAction(state, "triviaSaveFinal", { final:FINAL }, as("Evan")).error, "Commissioner only");
  assert.equal(save("x").error, "That Final didn't come through whole. Save it again");
  assert.equal(save({ ...FINAL, questions:[] }).error, "The Final is one question");
  assert.equal(save({ ...FINAL, questions:[FINAL.questions[0], { ...FINAL.questions[0], id:"qfinal002" }] }).error,
    "The Final is one question");
  assert.equal(save({ ...FINAL, questions:[{ id:"qfinal003", format:"number", text:"How many?", answer:3, digits:4 }] }).error,
    "The Final is multiple choice or a picture");
  assert.equal(save({ ...FINAL, questions:[CUSTOM.questions[3]] }).error, "The Final is multiple choice or a picture");
  assert.equal(save({ ...FINAL, questions:[{ ...FINAL.questions[0], options:["A", "B", "C"] }] }).error, "Four answers");
  assert.equal(save({ ...FINAL, questions:[{ ...FINAL.questions[0], answer:9 }] }).error, "Mark the right answer");
  assert.equal(save({ ...FINAL, questions:[{ ...CUSTOM.questions[2], photo:null }] }).error, "Add the photo");
  assert.equal(save(FINAL).ok, true);
  assert.deepEqual(state.triviaRounds, [{ id:"tfinal001", source:"final", category:"The groom", questions:[FINAL.questions[0]] }]);
  assert.equal(save(FINAL).extra.unchanged, true);
  /* a new save replaces it: one final entry, a category by default, at most 32 characters */
  assert.equal(save({ questions:[{ ...FINAL.questions[0], id:undefined }], category:"" }).ok, true);
  assert.equal(state.triviaRounds.length, 1);
  const kept = state.triviaRounds[0];
  assert.deepEqual([kept.id, kept.category, kept.questions[0].id], ["tfinal001", "Final", "qfinal001"],
    "the entry and its question keep their ids when the desk sends none");
  save({ ...FINAL, category:"A category name that runs well past thirty-two letters" });
  assert.equal(state.triviaRounds[0].category.length, 32);
  /* a picture Final */
  assert.equal(save({ id:FINAL.id, category:FINAL.category, question:CUSTOM.questions[2] }).ok, true,
    "a single `question` is accepted too");
  assert.equal(state.triviaRounds[0].questions[0].photo.id, "pphoto0001");
  /* it is not a round: the rounds format skips it, the desk's round writes step around it */
  assert.equal(triviaQuestionTotal(state.triviaRounds), 0);
  assert.equal(triviaConfigured(state), false, "a set list holding only a Final has nothing to start");
  assert.equal(applyAction(state, "triviaSaveRound", { round:{ ...SPORTS, id:"tfinal001" } }, gm()).error,
    "That round didn't come through whole. Save it again");
  act(state, "triviaSaveRound", { round:SPORTS });
  act(state, "triviaSaveRound", { round:MUSIC });
  assert.deepEqual(state.triviaRounds.map(round => round.id), ["tfinal001", "tsports01", "tmusic001"]);
  act(state, "triviaMoveRound", { id:"tsports01", by:-1 });
  assert.deepEqual(state.triviaRounds.map(round => round.id), ["tfinal001", "tsports01", "tmusic001"], "nothing above but the Final");
  act(state, "triviaMoveRound", { id:"tmusic001", by:-1 });
  assert.deepEqual(state.triviaRounds.map(round => round.id), ["tfinal001", "tmusic001", "tsports01"]);
  assert.deepEqual(publicState(state, { player:"Evan" }).triviaRounds, [], "the Final is the commissioner's, like the set list");
  /* null removes it */
  assert.equal(save(null).ok, true);
  assert.ok(!state.triviaRounds.some(round => round.source === "final"));
  assert.equal(save(null).extra.unchanged, true);
  /* never while a game runs */
  const playing = board();
  assert.equal(applyAction(playing, "triviaSaveFinal", { final:FINAL }, gm()).error, "Restart the game before changing the Final");
});

test("the rounds format skips the board's Final and plays as before", () => {
  const state = board([SPORTS], { final:FINAL, format:"rounds" });
  const game = state.trivia;
  assert.equal(game.format, undefined, "a rounds game");
  assert.equal(game.questions.length, SPORTS.picks.length);
  assert.deepEqual(game.rounds.map(round => round.name), ["Sports"]);
  assert.ok(!JSON.stringify(game.questions).includes("bachelor party"), "the Final is not a question here");
  assert.equal(triviaBeat(state, trivia(state)).type, "trivia-reveal");
});

test("Lock and start opens the board in its own write; a board player is on the weekend's record", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "triviaSetFormat", { format:"board" });
  act(state, "triviaSaveRound", { round:SMALL });
  act(state, "announceEvent", { evId:"trivia" });
  const contest = resolveCurrentContest(state, trivia(state));
  act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
  assert.deepEqual([state.trivia?.format, state.trivia?.phase], ["board", "pick"], "the board is up in the same write");
  const player = state.trivia.players.at(-1);
  assert.match(refuse(state, "setOut", { player, out:true }), /is playing Trivia/);
});

/* ── QA ── */

test("QA: the console offers Sim board while a board game runs", async () => {
  const { buildSync } = await import("esbuild");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = buildSync({ stdin:{ contents:'export { QASheet } from "./src/features/qa/QASheet.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";',
    resolveDir:ROOT, loader:"jsx" }, bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("trivia-board-qa.cjs", import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  const { QASheet, PlayerIdentityProvider } = mod.exports;
  const noop = () => {};
  const status = { environment:"staging", version:3, schema:9, profiles:13, completed:8, total:17, pendingWagers:0, openDuels:0,
    current:"Trivia", phase:"In progress", next:"Pick", blockers:[] };
  const render = raw => {
    const view = publicState(raw, { isGm:true, player:"Brandon" });
    return renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:view.profiles || {} },
      React.createElement(QASheet, { state:view, status, me:"Brandon", guestLens:false, busy:false, market:null, environment:"staging",
        dispatch:async () => ({ ok:true }), notify:noop, onSwitch:noop, onLens:noop, onPlayLive:noop, onDuelMe:noop, onDuels:noop,
        pokerOn:false, onBustOne:noop, onCountRest:noop, onRerun:noop, onReplayMine:noop, qaOn:true, onStrip:noop, onClose:noop })));
  };
  assert.match(render(board()), />Sim board</);
  const rounds = render(board([SPORTS], { format:"rounds" }));
  assert.doesNotMatch(rounds, /Sim board/);
  assert.match(rounds, />Sim answers</, "the rounds game keeps its own");
  assert.doesNotMatch(render(base()), /Sim board/, "no game, no button");
});

test("QA: Sim board makes the room's moves through the real writes, never the commissioner's own", () => {
  const state = board();
  const game = state.trivia;
  const me = game.players.find(player => player !== game.control);
  assert.equal(refuse(state, "boardSim", {}, { ...gm(me), qa:false }), "QA is unavailable");
  assert.equal(refuse(state, "boardSim", {}, as(me)), "Commissioner only");
  assert.equal(at(game.pickAt + 10, () => refuse(state, "boardSim", {}, gm(game.control))), "Nothing to play right now",
    "the commissioner holds the board: his pick is his");
  at(game.pickAt + 10, () => act(state, "boardSim", {}, gm(me)));
  assert.ok(["clue", "dd-wager"].includes(game.phase));
  assert.deepEqual([logOf(state).by, logOf(state).auto], [game.control, false], "picked as the player who holds the board");
  if (game.phase === "dd-wager") {
    act(state, "boardSim", {}, gm(me));
    assert.ok(logOf(state).wager >= DD_MIN);
    act(state, "boardDdClue", { clueId:game.current });
    at(logOf(state).turnAt, () => act(state, "boardSim", {}, gm(me)));
    assert.equal(game.phase, "reveal");
    next(state);
    pick(state);
  }
  const log = logOf(state);
  assert.equal(at(log.armAt - 1, () => refuse(state, "boardSim", {}, gm(me))), "Nothing to play right now", "only once armed");
  buzz(state, me, 100);
  at(log.armAt, () => act(state, "boardSim", {}, gm(me)));
  const others = Object.keys(log.buzzes).filter(player => player !== me);
  const room = game.players.filter(player => player !== me).length;
  assert.ok(others.length >= Math.floor(room / 2) - 1 && others.length <= Math.ceil(room / 2) + 1, `about half buzz: ${others.length}`);
  assert.ok(Object.values(log.buzzes).every(buzzIn => buzzIn.ms >= 100 && buzzIn.ms <= 900));
  close(state);
  assert.equal(turnPlayer(log), me, "the fastest: the commissioner");
  assert.equal(at(log.turnAt, () => refuse(state, "boardSim", {}, gm(me))), "Nothing to play right now", "his turn is his");
  answer(state, me, wrongOf(state));
  at(log.turnAt, () => act(state, "boardSim", {}, gm(me)));
  assert.equal(log.attempts.length, 2);
  assert.notEqual(log.attempts[1].player, me);
  /* with no actor (a QA jump), the sim plays everyone */
  const jump = board([SMALL]);
  const g2 = jump.trivia;
  at(g2.pickAt + 10, () => act(jump, "boardSim", {}, gm()));
  assert.equal(logOf(jump).by, g2.control);
});

test("QA: a jump through Trivia plays the board to its posted result; the run's clock comes back", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "triviaSetFormat", { format:"board" });
  act(state, "triviaSaveRound", { round:SPORTS });
  act(state, "triviaSaveRound", { round:CUSTOM });
  act(state, "qaAdvance", { target:"event:trivia:done", seed:3 });
  const game = state.trivia;
  assert.ok(state.results.trivia, "the result posted");
  assert.deepEqual([game.format, game.phase], ["board", "final-board"]);
  assert.ok(game.finishedAt);
  assert.equal(game.played.length, 9, "every cell played");
  assert.ok(Object.keys(game.finalPicks || {}).length > 0, "the Final played");
  assert.deepEqual(state.results.trivia.slots, boardResultSlots(boardStandings(game)));
  assert.ok(state.results.trivia.ts <= Date.now() + 1000, "the result is on the run's own clock, not the board's");
  assert.ok(Math.abs(Date.now() - new Date().getTime()) < 50, "the real clock is back");
  assert.ok(!JSON.stringify(state.wagerOps || {}).includes("qa-sim"), "no synthetic retry ledger");
  /* Finish event from the middle of a live board */
  const live = board([SMALL]);
  pick(live, live.trivia.columns[0].clues[0]);
  act(live, "qaAdvance", { target:"finish", seed:5 });
  assert.ok(live.results.trivia);
  assert.ok(live.trivia.finishedAt);
  assert.deepEqual(live.results.trivia.slots, boardResultSlots(boardStandings(live.trivia)));
  /* a board with nothing a buzzer can answer: the ordinary result entry */
  const numbers = structuredClone(EMPTY_STATE);
  act(numbers, "triviaSetFormat", { format:"board" });
  act(numbers, "triviaSaveRound", { round:{ id:"tnumber01", source:"bank", category:"sports", picks:["sports-10", "sports-11"] } });
  act(numbers, "qaAdvance", { target:"event:trivia:done", seed:3 });
  assert.ok(numbers.results.trivia);
  assert.equal(numbers.trivia, null);
});

/* ── the endpoints ── */

test("HTTP: a board clue's photo and clip are served once it is picked, the Final's once its clue reads; the commissioner always", async () => {
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
  tournament.previewFetch = async () => Response.json({ data:[{ preview:"https://cdnt-preview.dzcdn.net/stream/c-1.mp3" }] });
  const sof = [0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x02, 0x58, 0x03, 0x20, 0x01, 0x01, 0x11, 0x00];
  const jpeg = new Uint8Array([0xFF, 0xD8, ...sof, 0xFF, 0xDA, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xFF, 0xD9]);
  const call = (pathname, { token = null, method = "GET", body } = {}) => tournament.fetch(new Request(`http://localhost${pathname}`,
    { method, headers:token ? { Authorization:`Bearer ${token}` } : {}, body }));
  const upload = async () => {
    const data = new FormData();
    data.append("photo", new Blob([jpeg], { type:"image/jpeg" }), "photo.jpg");
    return (await (await call("/api/trivia/photo", { method:"POST", token:"gm", body:data })).json()).photo;
  };
  const clue = await upload(), finalPhoto = await upload();
  const round = { ...CUSTOM, questions:[{ ...CUSTOM.questions[2], photo:clue }, CUSTOM.questions[3], CUSTOM.questions[0]] };
  const final = { id:"tfinal002", category:"Faces", questions:[{ ...CUSTOM.questions[2], id:"qfinal009", photo:finalPhoto }] };
  const state = board([round], { final });
  tournament.state = state;
  const game = state.trivia;
  const [picture, tune] = game.columns[0].clues;
  assert.equal(game.clues[picture].photo.id, clue.id);
  assert.equal((await call(`/api/trivia/photo/${clue.id}`)).status, 404, "not picked: the commissioner's only");
  assert.equal((await call(`/api/trivia/photo/${clue.id}`, { token:"gm" })).status, 200);
  assert.equal((await call(`/api/trivia/clip/${tune}`)).status, 404, "a tune not picked is nobody's");
  assert.equal((await call(`/api/trivia/clip/${tune}`, { token:"gm" })).status, 200, "the commissioner checks it");
  pick(state, picture);
  assert.equal((await call(`/api/trivia/photo/${clue.id}`)).status, 200, "picked: on the TV, anyone");
  close(state, logOf(state).openUntil);
  next(state);
  pick(state, tune);
  assert.deepEqual(await (await call(`/api/trivia/clip/${tune}`)).json(), { ok:true, url:"https://cdnt-preview.dzcdn.net/stream/c-1.mp3" });
  assert.deepEqual(boardShown(game).map(item => item.id), [picture, tune]);
  /* the Final's photo: its clue phase, not its category */
  game.phase = "final-wager";
  assert.equal((await call(`/api/trivia/photo/${finalPhoto.id}`)).status, 404, "the category alone");
  assert.equal((await call(`/api/trivia/photo/${finalPhoto.id}`, { token:"gm" })).status, 200);
  game.phase = "final-clue";
  assert.equal((await call(`/api/trivia/photo/${finalPhoto.id}`)).status, 200, "the Final reads: anyone");
  assert.equal(boardShown(game).at(-1).id, game.final.id);
});

/* ── the director ── */

test("the run of show lists a board game plainly: Start trivia, the board, the Final, Post result", async () => {
  const { projectBeats } = await import("../src/features/director/runOfShow.js");
  const ready = board([SPORTS], { final:FINAL, start:false });
  const events = allEventsOf(ready);
  assert.deepEqual(projectBeats(ready, events, null, { limit:4 }).map(beat => [beat.label, beat.subject]),
    [["Start trivia", "Trivia"], ["The board", "Trivia"], ["The Final", "The groom"], ["Post result", "Trivia"]]);
  act(ready, "triviaStart", { evId:"trivia" });
  assert.deepEqual(projectBeats(ready, events, null, { limit:3 }).map(beat => beat.label), ["Pick", "The Final", "Post result"]);
  const final = toFinal().state;
  assert.deepEqual(projectBeats(final, events, null, { limit:2 }).map(beat => beat.label), ["Show the Final", "Post result"]);
  /* a rounds set list with a Final entry plans its rounds only */
  const rounds = board([SPORTS], { final:FINAL, format:"rounds", start:false });
  const plan = projectBeats(rounds, events, null, { limit:3 });
  assert.deepEqual(plan.map(beat => beat.label), ["Start trivia", "Reveal", "Next question"]);
  assert.equal(plan[1].subject, `Question 1 of ${SPORTS.picks.length}`);
});

/* ── the bank ── */

test("the bank: a level on every choice and tune, each category's first five span 1 to 5, a Final pool apart from the desk", () => {
  for (const category of TRIVIA_BANK) {
    for (const question of category.questions)
      if (question.format !== "number") assert.ok([1, 2, 3, 4, 5].includes(question.level), `${question.id} has a level`);
      else assert.equal(question.level, undefined);
    assert.deepEqual(category.questions.slice(0, 5).map(question => question.level).sort(), [1, 2, 3, 4, 5],
      `${category.id}: the default picks climb 1 to 5`);
  }
  assert.ok(TRIVIA_FINALS.length >= 8 && TRIVIA_FINALS.length <= 14, "about ten");
  for (const final of TRIVIA_FINALS) {
    assert.deepEqual([final.format, final.answer], ["choice", 0], final.id);
    assert.ok(final.category && final.category.length <= 32, final.id);
    const { id, category, ...rest } = final;
    assert.equal(cleanTriviaQuestion({ ...rest, id:"qfinalcheck" }).error, undefined, id);
  }
  const ids = [...TRIVIA_BANK.flatMap(category => category.questions.map(question => question.id)), ...TRIVIA_FINALS.map(final => final.id)];
  assert.equal(new Set(ids).size, ids.length, "every id once");
  const desk = bankForDesk();
  assert.ok(!desk.some(category => category.questions.some(question => question.id.startsWith("final-"))), "not a desk category");
  /* and never in a client file */
  const walk = dir => readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  const client = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "shared"))]
    .filter(file => /\.(m?js|jsx)$/.test(file)).map(file => readFileSync(file, "utf8")).join("\n");
  for (const final of TRIVIA_FINALS) assert.ok(!client.includes(final.text), `${final.id} is in a client file`);
  assert.ok(!/(from\s*|import\(\s*)["'][^"']*worker\/triviaBoard(\.js)?["']/.test(client), "the board's writes stay in the Worker");
  /* every write is registered with the trivia actions */
  for (const type of BOARD_ACTION_TYPES) assert.ok(TRIVIA_ACTION_TYPES.includes(type) && Object.hasOwn(ACTIONS, type), type);
  assert.ok(TRIVIA_ACTION_TYPES.includes("triviaSetFormat") && TRIVIA_ACTION_TYPES.includes("triviaSaveFinal"));
});
