/* The Trivia board's screens (docs/TRIVIA-BOARD.md "UI"): the phone's
   screen by phase, role and the server clock; the buzzer (dark before the
   arm, locked out by an early tap, lit on the beat, latched once in) and
   its reaction timed from the painted frame, again on a rebound (Oct 12);
   the TV's scenes, its rail and its chase; the desk's board preview; the
   room's cues; the kit's new recipes; and the real components rendered
   over board games built from the contract (dev/fit/boardFixtures.js)
   through the real projection. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { ROSTER } from "../shared/core.js";
import {
  ANSWER_MS, BOARD_PICK_MS, BOARD_VALUES, BOARD_ZOOM_MS, BUZZ_LOCKOUT_MS, BUZZ_MS_MAX, BUZZ_MS_MIN, BUZZ_OPEN_MS, BUZZ_SHOW_MS,
  DD_MIN, DD_STING_MS, FINAL_ANSWER_MS, FINAL_INTRO_MS, REBOUND_LEAD_MS, ddMax, finalMax, readMs,
} from "../shared/triviaBoard.js";
import { triviaFinalEntry, triviaLive } from "../shared/trivia.js";
import { publicState } from "../worker/publicState.js";
import { bankForDesk } from "../worker/trivia.js";
import { BOARD_FIT_ROUNDS, BOARD_FIT_VIEWER, boardDeskStage, boardPlayed, boardStage } from "../dev/fit/boardFixtures.js";
import {
  ANSWER_EARLY_MS, BOARD_TV, BUZZ_LATE_PAINT_MS, DD_RANGE, FINAL_RANGE, boardInstants, boardScreen, boardStageBox, boardView,
  buzzReaction, buzzerState, cellRect, columnNameSize, deskBoard, finalStepOn, finalSteps, fmtReaction, headNameFit,
  lineNameFit, nextBoardInstant, railPan, railSlots, shownScore, signedPoints, turnState, tvBoardScene, wagerItems, wagerStart, zoomFrom,
} from "../src/features/trivia/boardModel.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
/* the server renderer's note about layout effects (the reels measure in the browser) */
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const NOW = 1_900_000_000_000;
const ME = BOARD_FIT_VIEWER;
const stage = (name, opts = {}) => boardStage(name, { now:NOW, ...opts });
const phone = (state, player = ME) => publicState(state, { player });
const tv = state => publicState(state, {});
const view = (state, player = ME, now = NOW) => boardView(player ? phone(state, player) : tv(state), player, now);
const away = (state, player) => ({ ...state, away:{ ...(state.away || {}), [player]:{ at:1 } } });

/* ── the phone's screen ── */
test("the phone's screen follows the phase and who it is for", () => {
  const pick = stage("pick");
  assert.equal(boardScreen(view(pick)), "pick-watch", "someone else's pick");
  assert.equal(boardScreen(view(stage("pick-mine"))), "pick", "your pick");
  assert.equal(boardScreen(view(pick, pick.trivia.control)), "pick", "the picker's own phone");
  assert.equal(boardScreen(view(stage("clue"))), "buzzer");
  assert.equal(boardScreen(view(away(stage("clue"), ME))), "clue-watch", "away: the buzzers, not a buzzer");
  const answer = stage("answer-mine");
  assert.equal(boardScreen(view(answer)), "answer", "second in order, the first struck: your turn");
  assert.equal(boardScreen(view(stage("answer"))), "answer-watch");
  assert.equal(boardScreen(view(stage("reveal"))), "reveal");
  assert.equal(boardScreen(view(stage("dd-wager"))), "dd-wager", "the picker wagers");
  assert.equal(boardScreen(view(stage("dd-wager"), "Evan")), "dd-watch", "everyone else watches");
  assert.equal(boardScreen(view(stage("dd-clue"))), "answer", "the Daily Double is the picker's alone");
  assert.equal(boardScreen(view(stage("dd-clue"), "Evan")), "answer-watch");
  /* the rebound: your buzzer again until you have answered the clue */
  assert.equal(boardScreen(view(stage("rebound"))), "buzzer", "second in the first race: the rebound is yours too");
  assert.equal(boardScreen(view(stage("rebound"), "Sahil")), "buzz-out", "the first race's fastest answered it: out");
  assert.equal(boardScreen(view(stage("rebound-out"))), "buzz-out");
  assert.equal(boardScreen(view(away(stage("rebound"), ME))), "clue-watch");
  const final = stage("final-wager");
  const v = view(final);
  assert.deepEqual(v.finalEligible, v.players, "everyone wagers on the Final");
  assert.equal(v.finalEligible.length, ROSTER.length);
  const broke = v.standings.find(row => row.preFinal <= 0).player;
  assert.equal(boardScreen(view(final, broke)), "final-wager", "a score at or below zero wagers too");
  assert.equal(boardScreen(view(away(final, broke), broke)), "final-watch", "away: no wager");
  assert.equal(boardScreen(view(stage("final-clue"), broke)), "final-clue", "everyone answers the Final");
  assert.equal(boardScreen(view(stage("final-reveal"))), "final-reveal");
  assert.equal(boardScreen(view(stage("final-board"))), "final-board");
  assert.equal(boardView({ trivia:null }, ME, NOW), null, "no board, no view");
});

test("the view reads only what the projection sends: others' buzzes are just 'in' while open, the answer once revealed", () => {
  const armed = stage("armed-in");
  const mine = view(armed);
  assert.deepEqual(mine.myBuzz, { ms:281, at:armed.trivia.log[armed.trivia.current].armAt + 371 }, "your own reaction");
  const room = view(armed, null);
  assert.equal(room.myBuzz, null);
  assert.ok(room.buzzedIn.includes(ME) && room.buzzedIn.length === 4);
  assert.ok(Object.values(room.buzzes).every(buzz => buzz.in === true && buzz.ms === undefined), "the TV sees who, never how fast");
  assert.equal(room.answer, null, "no answer before the reveal");
  const reveal = view(stage("reveal"), null);
  assert.ok(Number.isInteger(reveal.answer) && reveal.winner === ME);
  assert.equal(reveal.stake, reveal.value);
  const order = view(stage("order"), null);
  assert.deepEqual(order.order.map(row => [row.place, row.ms]), [[1, 246], [2, 281], [3, 318], [4, 402]], "fastest first, with reactions");
  const answer = view(stage("answer"));
  assert.equal(answer.struck.size, 1, "the first answer struck");
  assert.deepEqual([answer.race, answer.rebound, answer.turn], [1, false, 1], "the rebound closed, its answer turn on");
  assert.equal(answer.answering, answer.order[0].player, "the rebound's fastest answers");
  assert.equal(answer.attempts[0].right, false);
  assert.deepEqual(answer.answered, [answer.attempts[0].player]);
  /* a rebound under way: its buzzes are just 'in' too, the first race's in full */
  const rebound = phone(stage("rebound-armed")).trivia;
  const log = rebound.log[rebound.current];
  assert.ok(Object.values(log.buzzes).every(buzz => buzz.in === true && buzz.ms === undefined));
  assert.ok(Object.values(log.races[0].buzzes).every(buzz => Number.isFinite(buzz.ms)), "a closed race is open to all");
});

test("the cells: played dark, the values by row, the Daily Double hidden until picked", () => {
  const v = view(stage("pick"), null);
  assert.equal(v.columns.length, 6, "six columns: the seventh round does not fit");
  assert.ok(v.columns.every(column => column.cells.map(cell => cell.value).join() === BOARD_VALUES.join()));
  assert.equal(v.cellsLeft, 30 - 9);
  assert.ok(v.columns.flatMap(column => column.cells).every(cell => !cell.dd), "the Daily Double never shows before it is picked");
  const dd = view(stage("dd-clue"), null);
  assert.equal(dd.dd, true);
  assert.equal(dd.stake, 600, "a Daily Double is worth its wager");
  assert.ok(dd.columns.flatMap(column => column.cells).some(cell => cell.dd && cell.played));
});

/* ── the buzzer ── */
test("the buzzer: dark until the arm, locked out by an early tap, lit on the beat, latched once in", () => {
  const armAt = 10_000;
  assert.equal(buzzerState({ armAt, now:9_999 }), "off");
  assert.equal(buzzerState({ armAt, now:10_000 }), "live", "lit on the server's instant");
  assert.equal(buzzerState({ armAt, now:9_000, lockoutUntil:9_000 + BUZZ_LOCKOUT_MS }), "locked");
  assert.equal(buzzerState({ armAt, now:10_100, lockoutUntil:9_800 + BUZZ_LOCKOUT_MS }), "locked", "a lockout outlasts the arm");
  assert.equal(buzzerState({ armAt, now:10_400, lockoutUntil:9_800 + BUZZ_LOCKOUT_MS }), "live");
  assert.equal(buzzerState({ armAt, now:11_000, buzzed:true }), "in");
  assert.equal(buzzerState({ armAt, now:11_000, open:false }), "closed");
  assert.equal(BUZZ_LOCKOUT_MS, 500);
});

test("a reaction is timed from the frame that lit the buzzer; a late light times from the arm", () => {
  const armAt = 50_000;
  /* on time: the painted frame decides, not the network or the clocks */
  assert.equal(buzzReaction({ paintedAt:1000, paintedServer:armAt + 16, tapAt:1214, tapServer:armAt + 900, armAt }), 214);
  assert.equal(buzzReaction({ paintedAt:1000, paintedServer:armAt + BUZZ_LATE_PAINT_MS, tapAt:1300, tapServer:armAt + 999, armAt }), 300);
  /* a phone opened after the arm (or asleep through it) buys no time */
  assert.equal(buzzReaction({ paintedAt:1000, paintedServer:armAt + 2000, tapAt:1100, tapServer:armAt + 2100, armAt }), 2100);
  assert.equal(buzzReaction({ paintedAt:null, paintedServer:null, tapAt:5, tapServer:armAt + 640, armAt }), 640, "not painted yet");
  assert.equal(buzzReaction({ paintedAt:1000, paintedServer:armAt, tapAt:1010, tapServer:armAt + 10, armAt }), BUZZ_MS_MIN, "held to the range");
  assert.equal(buzzReaction({ paintedAt:0, paintedServer:armAt, tapAt:99_000, tapServer:armAt, armAt }), BUZZ_MS_MAX);
  assert.equal(fmtReaction(214), "0.214");
  assert.equal(fmtReaction(1500), "1.500");
});

test("a rebound on a phone: the buzzer dark again until the new arm, an early tap locked out, the reaction timed from the new lamp", () => {
  const v = view(stage("rebound"));
  assert.deepEqual([v.phase, v.race, v.rebound, v.out], ["clue", 1, true, false]);
  const armAt = v.armAt;
  assert.equal(armAt, v.attempts[0].at + REBOUND_LEAD_MS, "armed a beat after the struck answer");
  assert.equal(v.openUntil, armAt + BUZZ_OPEN_MS);
  assert.equal(v.myBuzz, null, "your first race's buzz stays in it: the buzzer is yours to press again");
  assert.equal(nextBoardInstant(v, NOW), armAt, "the phone wakes on the new arm, to the millisecond");
  assert.ok(armAt > NOW);
  /* the same buzzer rules, on the new arm */
  assert.equal(buzzerState({ armAt, now:NOW }), "off");
  assert.equal(buzzerState({ armAt, now:armAt }), "live");
  assert.equal(buzzerState({ armAt, now:armAt + 100, lockoutUntil:armAt - 300 + BUZZ_LOCKOUT_MS }), "locked", "an early tap outlasts the arm");
  assert.equal(buzzerState({ armAt, now:armAt + 250, lockoutUntil:armAt - 300 + BUZZ_LOCKOUT_MS }), "live");
  assert.equal(buzzReaction({ paintedAt:5000, paintedServer:armAt + 16, tapAt:5233, tapServer:armAt + 600, armAt }), 233,
    "timed from the frame that lit it");
  assert.equal(buzzReaction({ paintedAt:5000, paintedServer:armAt + 900, tapAt:5050, tapServer:armAt + 950, armAt }), 950,
    "a late light times from the new arm");
  const live = view(stage("rebound-in"));
  assert.deepEqual([live.myBuzz.ms, buzzerState({ armAt:live.armAt, now:NOW, buzzed:!!live.myBuzz })], [300, "in"]);
  const out = view(stage("rebound-out"));
  assert.deepEqual([out.out, out.answered], [true, [ME]]);
});

test("an answer turn: waiting, live a beat early, then over until the server's timeout", () => {
  const v = view(stage("answer-mine"));
  assert.equal(turnState(v, v.turnAt - ANSWER_EARLY_MS - 1), "wait");
  assert.equal(turnState(v, v.turnAt - ANSWER_EARLY_MS), "live");
  assert.equal(turnState(v, v.turnAt + ANSWER_MS), "live");
  assert.equal(turnState(v, v.turnAt + ANSWER_MS + 1), "over");
  const order = view(stage("order"));
  assert.equal(order.turnAt, order.closedAt + BUZZ_SHOW_MS);
  assert.equal(turnState(order, NOW), "wait", "the order stands first");
});

test("screens wake on the board's own instants, never on a one-second tick", () => {
  const clue = view(stage("clue"), null);
  assert.equal(nextBoardInstant(clue, NOW), clue.armAt, "the arm, to the millisecond");
  assert.equal(clue.armAt, clue.pickedAt + BOARD_ZOOM_MS + readMs(clue.clue));
  const zoom = view(stage("zoom"), null);
  assert.equal(nextBoardInstant(zoom, NOW), zoom.shownAt);
  const answer = view(stage("answer"), null);
  assert.ok(boardInstants(answer, NOW).includes(answer.turnEnd));
  const final = view(stage("final-reveal"), null);
  const steps = finalSteps(final, NOW);
  assert.ok(boardInstants(final, NOW).includes(steps.find(step => step.state === "ahead").start), "the next Final turn");
  assert.deepEqual(boardInstants(view(stage("pick"), null), NOW), [], "the pick waits on a write");
});

/* ── the TV ── */
test("the TV's scenes: the zoom, the clue reading, the buzzers live, the order, the turn, the Daily Double's sting", () => {
  const scene = (name, at = NOW) => tvBoardScene(view(stage(name), null, at), at);
  assert.equal(scene("pick"), "pick");
  assert.equal(scene("zoom"), "zoom");
  assert.equal(scene("clue"), "clue");
  assert.equal(scene("armed"), "armed");
  assert.equal(scene("order"), "order");
  assert.equal(scene("answer"), "answer");
  assert.equal(scene("reveal"), "reveal");
  assert.equal(scene("dd-sting"), "dd-sting");
  assert.equal(scene("dd-sting", NOW + DD_STING_MS), "dd-wager", "the sting holds DD_STING_MS");
  assert.equal(scene("dd-clue"), "dd-clue");
  assert.equal(scene("final-intro"), "final-intro");
  assert.equal(scene("final-intro", NOW + FINAL_INTRO_MS), "final-wager");
  assert.equal(scene("final-clue"), "final-clue");
  assert.equal(scene("final-reveal"), "final-reveal");
  assert.equal(scene("final-board"), "final-board");
  /* the rebound: the answers stay up, then the buzzers go live again */
  assert.equal(scene("rebound"), "rebound");
  const rebound = view(stage("rebound"), null);
  assert.equal(scene("rebound", rebound.armAt), "rebound-armed");
  assert.equal(scene("rebound-armed"), "rebound-armed");
  assert.equal(scene("answer"), "answer", "the rebound closed: its fastest answering");
});

test("the TV's rebound: the frame chases again, who answered stands unlit, the struck answer stays struck", () => {
  const armed = view(stage("rebound-armed"), null);
  const slots = railSlots(armed, NOW, "rebound-armed");
  const first = armed.attempts[0].player;
  assert.deepEqual(slots.filter(slot => slot.spent).map(slot => slot.player), [first], "who answered, unlit");
  assert.deepEqual(slots.filter(slot => slot.buzzed).map(slot => slot.player).sort(), ["Chiang", "Khoa"], "this race's buzzes lit");
  assert.ok(slots.find(slot => slot.player === first).lastWrong);
  assert.equal(railSlots(view(stage("answer"), null), NOW, "answer").filter(slot => slot.spent).length, 0, "out of the rebound only");
  assert.equal(armed.struck.size, 1);
});

test("the rail: every player in the order they joined, lit by what the room is doing", () => {
  const pick = view(stage("pick"), null);
  const slots = railSlots(pick, NOW, "pick");
  assert.deepEqual(slots.map(slot => slot.player), pick.players, "a chip never moves");
  assert.equal(slots.filter(slot => slot.control).length, 1);
  assert.equal(slots.find(slot => slot.control).player, pick.control);
  assert.equal(railPan(0, 13), -0.8);
  assert.equal(railPan(12, 13), 0.8);
  const armed = view(stage("armed"), null);
  assert.deepEqual(railSlots(armed, NOW, "armed").filter(slot => slot.buzzed).map(slot => slot.player).sort(), ["Chiang", "Khoa", "Sahil"]);
  const answer = view(stage("answer"), null);
  const lit = railSlots(answer, NOW, "answer");
  assert.equal(lit.find(slot => slot.answering)?.player, answer.answering);
  assert.ok(lit.filter(slot => slot.place).length === answer.order.length);
  const wager = view(stage("final-wager"), null);
  const finals = railSlots(wager, NOW, "final-wager");
  assert.ok(finals.some(slot => slot.locked) && finals.some(slot => slot.eligible && !slot.locked), "lit as wagers lock, never how much");
  assert.ok(finals.filter(slot => !slot.eligible).every(slot => !slot.locked));
});

test("the Final's reveal turns each player from the lowest score up, their total rolling on their own beat", () => {
  const v = view(stage("final-reveal"), null);
  const steps = finalSteps(v, NOW);
  const on = finalStepOn(steps);
  assert.ok(on > 0, "mid-way: some turned, one turning");
  assert.ok(steps.slice(0, on).every(step => step.state === "done" && step.totalShown));
  assert.ok(steps.slice(on + 1).every(step => step.state === "ahead" && !step.pickShown));
  const pre = steps.map(step => step.row.preFinal);
  assert.deepEqual(pre, [...pre].sort((a, b) => a - b), "lowest first");
  const ahead = steps[on + 1];
  assert.equal(shownScore(v, ahead.player, NOW, steps), ahead.row.preFinal, "not turned: the score before the Final");
  const done = steps[0];
  assert.equal(shownScore(v, done.player, NOW, steps), done.row.score);
  const board = view(stage("final-board"), null);
  assert.ok(finalSteps(board, NOW).every(step => step.totalShown), "the standings show everything");
});

test("the zoom stands the panel on its cell, from the same layout the board draws", () => {
  const box = boardStageBox();
  assert.equal(box.w, 1920 - 2 * BOARD_TV.edge);
  assert.equal(box.h, BOARD_TV.bottom - BOARD_TV.top - BOARD_TV.railH - BOARD_TV.railGap);
  const first = cellRect({ col:0, row:0 }, { columns:6, rows:5 });
  assert.deepEqual([first.x, first.y], [0, BOARD_TV.head + BOARD_TV.gap]);
  const last = cellRect({ col:5, row:4 }, { columns:6, rows:5 });
  assert.equal(last.x + last.w, box.w, "the last column ends at the stage's edge");
  assert.ok(Math.abs(last.y + last.h - box.h) <= 1, "the last row ends at the stage's foot");
  const zoom = zoomFrom({ col:2, row:3 }, { columns:6, rows:5 });
  const cell = cellRect({ col:2, row:3 }, { columns:6, rows:5 });
  assert.deepEqual([zoom.x, zoom.y], [cell.x, cell.y]);
  assert.ok(Math.abs(zoom.sx * box.w - cell.w) < 1 && Math.abs(zoom.sy * box.h - cell.h) < 1);
});

test("names fit their slots: one line narrowed, a category on one line or two", () => {
  assert.equal(lineNameFit("Evan", 126).size, 30);
  const long = lineNameFit("Henry Nguyen", 126);
  assert.equal(long.size, 24);
  assert.ok(long.squeeze < 1 && long.squeeze >= 0.72);
  assert.deepEqual(headNameFit("Sports", 270).lines, ["Sports"]);
  const tune = headNameFit("Name that tune: anthems", 270);
  assert.equal(tune.lines.length, 2);
  assert.ok(tune.size >= 28 && tune.size <= 40);
  assert.equal(columnNameSize("Geography", 53), 12, "never under the phone's floor");
  assert.equal(columnNameSize("Music", 53), 15);
});

test("wagers: the Daily Double from 100 to its max, the Final from 0 to your score or 1,000, in 100s", () => {
  const dd = view(stage("dd-wager"));
  const range = DD_RANGE(dd);
  assert.equal(range.min, DD_MIN);
  assert.equal(range.max, ddMax(dd.myScore, dd.top));
  assert.ok(range.start >= range.min && range.start <= range.max && range.start % 100 === 0);
  const items = wagerItems(range.min, range.max);
  assert.equal(items[0].value, DD_MIN);
  assert.equal(items.at(-1).value, range.max);
  assert.ok(items.every((item, i) => !i || item.value - items[i - 1].value === 100));
  const final = view(stage("final-wager"), view(stage("final-wager"), null).finalEligible[0]);
  assert.deepEqual(FINAL_RANGE(final), { min:0, max:finalMax(final.myScore, final.top), start:0 });
  const room = view(stage("final-wager"), null);
  const broke = room.standings.find(row => row.preFinal <= 0).player;
  assert.deepEqual(FINAL_RANGE(view(stage("final-wager"), broke)), { min:0, max:1000, start:0 }, "at or below zero: up to 1,000");
  const rich = room.standings.find(row => row.preFinal > 1000);
  assert.equal(FINAL_RANGE(view(stage("final-wager"), rich.player)).max, rich.preFinal, "above 1,000: up to the score");
  assert.equal(wagerStart(450, 100, 1000), 500);
  assert.equal(wagerStart(5000, 100, 1000), 1000);
  assert.equal(signedPoints(-1200), "−1,200");
});

/* ── the desk ── */
test("the desk draws the set list as the board it will deal", () => {
  const board = deskBoard(BOARD_FIT_ROUNDS, bankForDesk());
  assert.equal(board.columns.length, 6);
  assert.equal(board.cells, 30);
  assert.deepEqual(board.out.map(item => [item.name, item.reason]), [["Music", "full"]], "a seventh round stands beside it");
  const sports = board.columns.find(column => column.name === "Sports");
  assert.equal(sports.unusable.length, 1, "a closest number a buzzer cannot answer");
  assert.equal(sports.unusable[0].format, "number");
  const groom = board.columns.find(column => column.name === "The groom");
  assert.deepEqual(groom.cells.map(cell => cell.value), BOARD_VALUES);
  assert.equal(triviaFinalEntry(BOARD_FIT_ROUNDS).category, "Landmarks", "his Final rides in the set list, not as a column");
  assert.ok(board.columns.every(column => column.round.source !== "final"));
  const loading = deskBoard(BOARD_FIT_ROUNDS, []);
  assert.ok(loading.out.some(item => item.reason === "loading"), "bank rounds wait for the bank");
  assert.equal(deskBoard([{ id:"tx", source:"custom", name:"Numbers", questions:[{ id:"qx", format:"number", text:"?", answer:3 }] }], []).out[0].reason, "none");
});

/* ── the room's sounds ── */
test("the room hears the board on fresh frames: the zoom, each buzz panned, the order, right and wrong", async () => {
  const room = await import("../src/features/tv/roomSound.js");
  const sounds = await import("../src/features/tv/boardSound.js");
  const snap = state => room.roomSnapshot(tv(state), []);
  const pick = stage("pick");
  const clue = stage("clue");
  const cues = room.roomCues(snap(pick), snap(clue), { now:NOW });
  assert.deepEqual(cues.filter(cue => cue.id === "boardZoom").map(cue => cue.at), [clue.trivia.log[clue.trivia.current].pickedAt]);
  assert.deepEqual(room.roomStep(snap(pick), snap(clue), { fresh:false, now:NOW }), [], "a reconnect or a correction owes nothing");
  const armed = stage("armed");
  const armedIn = stage("armed-in");
  const buzz = room.roomCues(snap(armed), snap(armedIn), { now:NOW }).filter(cue => cue.id === "buzzIn");
  assert.equal(buzz.length, 1, "the one new buzz");
  assert.equal(buzz[0].opts.step, 3, "a step higher than the three before it");
  assert.equal(buzz[0].pan, railPan(armedIn.trivia.players.indexOf(ME), armedIn.trivia.players.length));
  /* the same clue closing: the order stamps, fastest first, a beat apart */
  const order = stage("order");
  assert.equal(order.trivia.current, armedIn.trivia.current);
  const closed = room.roomCues(snap(armedIn), snap(order), { now:NOW }).filter(cue => cue.id === "orderStamp");
  assert.deepEqual(closed.map(cue => cue.opts.place), [1, 2, 3, 4]);
  const closedAt = order.trivia.log[order.trivia.current].closedAt;
  assert.deepEqual(closed.map(cue => cue.at - closedAt), [0, 120, 240, 360]);
  /* a new clue's first frame is its zoom, never a close */
  const elsewhere = stage("tune");
  assert.equal(room.roomCues(snap(armedIn), snap(elsewhere), { now:NOW }).filter(cue => cue.id === "orderStamp").length, 0);
  const answer = stage("answer");
  const wrongFirst = structuredClone(answer);
  wrongFirst.trivia.log[wrongFirst.trivia.current].attempts = [];
  assert.deepEqual(room.roomCues(snap(wrongFirst), snap(answer), { now:NOW }).map(cue => cue.id), ["boardWrong"]);
  const dd = room.roomCues(snap(pick), snap(stage("dd-sting")), { now:NOW });
  assert.ok(dd.some(cue => cue.id === "ddSting"));
  assert.ok(room.roomCues(snap(pick), snap(stage("dd-sting")), { now:NOW, reduced:true }).find(cue => cue.id === "ddSting").opts.summary);
  assert.equal(sounds.THINK_BAR_MS, 2000);
  /* the rebound: its buzzes land from the bottom of the ladder again, its order stamps as it closes */
  const lead = stage("rebound"), live = stage("rebound-armed");
  const again = room.roomCues(snap(lead), snap(live), { now:NOW }).filter(cue => cue.id === "buzzIn");
  assert.deepEqual(again.map(cue => cue.opts.step), [0, 1]);
  assert.ok(again.every(cue => cue.key.includes(":1:buzz:")), "keyed by the race, so a second race's buzz is never taken for the first's");
  const coalesced = room.roomCues(snap(order), snap(live), { now:NOW }).filter(cue => cue.id === "buzzIn");
  assert.deepEqual(coalesced.map(cue => cue.opts.step), [0, 1], "a frame that skipped the rebound's opening still counts it afresh");
  assert.equal(room.roomCues(snap(order), snap(live), { now:NOW }).filter(cue => cue.id === "orderStamp").length, 0);
  const shut = room.roomCues(snap(live), snap(stage("answer")), { now:NOW }).filter(cue => cue.id === "orderStamp");
  assert.deepEqual(shut.map(cue => cue.opts.place), [1, 2], "the rebound's own order stamps");
  const wrong = room.roomCues(snap(stage("order")), snap(lead), { now:NOW });
  assert.deepEqual(wrong.map(cue => cue.id), ["boardWrong"], "the strike sounds; the arm waits for its instant");
});

test("the board's clock owes the room the arm, a turn's last seconds, the thinking loop and each Final turn", async () => {
  const { boardClockCues, THINK_BAR_MS } = await import("../src/features/tv/boardSound.js");
  const clue = view(stage("clue"), null);
  assert.deepEqual(boardClockCues(clue, NOW).map(cue => [cue.id, cue.at]), [["boardArm", clue.armAt]]);
  assert.deepEqual(boardClockCues(view(stage("armed"), null), NOW), [], "an arm already past is never late-played");
  const rebound = view(stage("rebound"), null);
  assert.deepEqual(boardClockCues(rebound, NOW).map(cue => [cue.id, cue.at, cue.key.endsWith(":1:arm")]), [["boardArm", rebound.armAt, true]],
    "the rebound arms on the room's sound, like the first race");
  const answer = view(stage("answer"), null);
  assert.deepEqual(boardClockCues(answer, NOW).map(cue => cue.at), [answer.turnEnd - 3000, answer.turnEnd - 2000, answer.turnEnd - 1000]);
  const finalClue = view(stage("final-clue"), null);
  const bars = boardClockCues(finalClue, NOW);
  assert.ok(bars.every(cue => cue.id === "think"));
  assert.equal(bars.at(-1).at, finalClue.finalAt.clueAt + (FINAL_ANSWER_MS / THINK_BAR_MS - 1) * THINK_BAR_MS);
  assert.equal(bars.at(-1).opts.last, true);
  assert.ok(bars[0].at > NOW - 200, "only what is still ahead");
  const reveal = view(stage("final-reveal"), null);
  const turns = boardClockCues(reveal, NOW);
  assert.ok(turns.some(cue => cue.id === "finalTurn") && turns.some(cue => cue.id === "boardRight" || cue.id === "boardWrong"));
  assert.ok(boardClockCues(reveal, NOW, { reduced:true }).every(cue => cue.id !== "finalTurn" && cue.id !== "tally"));
});

test("the kit's board recipes: each playable, every node released when its last source ends", async () => {
  const kit = await import("../src/lib/soundKit.js");
  class Param { constructor(v = 0) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {}
    cancelScheduledValues() {} setTargetAtTime() {} }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind;
      for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"]) this[name] = new Param(1); }
    connect(node) { return node; } disconnect() { this.disconnected = (this.disconnected || 0) + 1; } start() {} stop() {}
  }
  const ctx = { currentTime:10, sampleRate:8000, destination:{}, nodes:[],
    node(kind) { const n = new Node(this, kind); this.nodes.push(n); return n; },
    createGain() { return this.node("gain"); }, createBiquadFilter() { return this.node("filter"); },
    createDynamicsCompressor() { return this.node("comp"); }, createConvolver() { return this.node("conv"); },
    createStereoPanner() { return this.node("pan"); }, createOscillator() { return this.node("osc"); },
    createBufferSource() { return this.node("src"); },
    createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; } };
  const E = kit.makeEngine(ctx, { listen:"tv" });
  const base = ctx.nodes.length;
  const ids = kit.BOARD_PARTS.map(part => part.id);
  assert.deepEqual(ids, ["boardZoom", "boardArm", "buzzIn", "orderStamp", "boardRight", "boardWrong", "ddSting", "think", "finalTurn", "tally",
    "buzzPress", "buzzDead"]);
  for (const id of ids) for (const opts of [{}, { summary:true, bar:3, last:true, step:2, place:2, up:false }]) {
    ctx.nodes.length = base;
    assert.equal(kit.isSound(id), true, id);
    assert.ok(kit.playRecipe(E, id, 10, opts), id);
    const made = ctx.nodes.slice(base);
    const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, `${id} makes sound`);
    sources.forEach(n => n.onended());
    assert.ok(made.every(n => n.disconnected === 1), `${id}: every node released once`);
  }
  assert.deepEqual(kit.SOUND_IDS, Array.from({ length:26 }, (_, i) => `S${i + 1}`), "the 26 stay 26");
});

/* ── the real components ── */
let ui = null;
async function components() {
  if (ui) return ui;
  const { buildSync } = await import("esbuild");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = buildSync({ stdin:{ contents:[
    'export { TriviaHome, TriviaPlaySheet } from "./src/features/trivia/TriviaPlay.jsx";',
    'export { BoardPlaySheet, BoardHome, Buzzer, boardOpenKey } from "./src/features/trivia/BoardPlay.jsx";',
    'export { TriviaDesk } from "./src/features/trivia/TriviaDesk.jsx";',
    'export { TVTrivia } from "./src/features/tv/TVTrivia.jsx";',
    'export { TVBoard, boardChrome } from "./src/features/tv/TVBoard.jsx";',
    'export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";'].join("\n"),
  resolveDir:ROOT, loader:"jsx" }, bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("trivia-board-ui.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  const wrap = (s, node) => renderToStaticMarkup(React.createElement(mod.exports.PlayerIdentityProvider, { profiles:s.profiles || {} }, node));
  ui = { ...mod.exports, React, wrap };
  return ui;
}

test("the TV draws every board moment: the board, the clue, the order, the turn, the sting, the Final", async () => {
  const { React, wrap, TVTrivia, TVBoard, boardChrome } = await components();
  const draw = (name, at = NOW) => { const s = tv(stage(name)); return wrap(s, React.createElement(TVTrivia, { state:s, now:at, fixed:true })); };
  const pick = draw("pick");
  assert.match(pick, /tv-board is-pick/);
  assert.equal((pick.match(/class="tv-board-cell( is-[a-z]+)*"/g) || []).length, 30, "thirty cells");
  assert.equal((pick.match(/tv-board-cell is-played/g) || []).length, 9, "the nine played dark");
  assert.equal((pick.match(/<li class="tv-board-slot/g) || []).length, ROSTER.length, "the rail: every player");
  assert.match(pick, /tv-board-slot is-control/);
  assert.match(pick, />Picks</);
  assert.match(draw("zoom"), /tv-board-panel tv-glass is-zoom is-zooming/);
  const reading = stage("clue");
  const text = reading.trivia.clues[reading.trivia.current].text;
  assert.ok(draw("clue").includes(`>${text.replaceAll("'", "&#x27;")}</h2>`), "the clue in large type");
  const armed = draw("armed");
  assert.match(armed, /is-armed is-zooming is-live/);
  assert.equal((armed.match(/tv-board-slot is-buzzed/g) || []).length, 3, "each buzz lights its chip");
  assert.match(draw("tune"), /tv-board-speaker is-live/);
  const order = draw("order");
  assert.match(order, /tv-board-order/);
  assert.match(order, />0\.246</);
  const answer = draw("answer");
  assert.match(answer, /tv-board-answerer is-live/);
  assert.equal((answer.match(/tv-board-struck-by/g) || []).length, 1, "the wrong answer struck, its striker's chip on it");
  assert.match(answer, /<li class="is-struck"[^>]*><span class="tv-display tv-board-letter">/);
  assert.match(draw("reveal"), /class="is-right"/);
  assert.match(draw("reveal"), /tv-board-fly/);
  const sting = draw("dd-sting");
  assert.match(sting, /tv-dd/);
  assert.match(sting, /Daily Double/);
  assert.match(draw("dd-wager"), /tv-board-dd-pending/);
  assert.match(draw("dd-clue"), /tv-board-dd-tag/);
  assert.match(draw("final-intro"), /fd-show is-marquee tv-board-final-mark/);
  assert.match(draw("final-wager"), /tv-board-slot is-locked/);
  assert.match(draw("final-clue"), /tv-board-panel tv-glass is-final-clue/);
  assert.match(draw("final-reveal"), /tv-board-turn/);
  assert.match(draw("final-board"), /tv-board-steps/);
  /* the rebound: the answers up, the struck one out with its striker, a lamp in the answerer's place */
  const lead = draw("rebound");
  assert.match(lead, /tv-board-panel tv-glass is-answer is-rebound"/, "unlit through the beat after the strike");
  assert.match(lead, /tv-board-answerer tv-board-rebound"/);
  assert.doesNotMatch(lead, /tv-board-answerer is-live/, "nobody answering");
  assert.equal((lead.match(/tv-board-struck-by/g) || []).length, 1);
  assert.equal((lead.match(/tv-board-slot[^"]*is-spent/g) || []).length, 1, "who answered stands unlit on the rail");
  const relit = draw("rebound-armed");
  assert.match(relit, /is-answer is-rebound-armed is-live"/, "the buzzers live again: the panel lit");
  assert.match(relit, /tv-board-rebound is-live/);
  assert.equal((relit.match(/tv-board-slot is-buzzed/g) || []).length, 2, "this race's buzzes light their chips");
  assert.match(relit, /tv-board-drain/);
  /* the frame's lamps: magenta while the buzzers are live (again on a rebound), amber for the sting */
  assert.deepEqual(boardChrome(tv(stage("armed")), NOW), { chase:{ color:"var(--lamp-live)", pace:"run" } });
  assert.deepEqual(boardChrome(tv(stage("rebound-armed")), NOW), { chase:{ color:"var(--lamp-live)", pace:"run" } });
  assert.equal(boardChrome(tv(stage("rebound")), NOW), null, "dark until the rebound arms");
  assert.deepEqual(boardChrome(tv(stage("dd-sting")), NOW), { chase:{ color:"var(--sun)", pace:"run" } });
  assert.equal(boardChrome(tv(stage("pick")), NOW), null);
  /* posted: the board leaves the room to the result */
  const posted = tv(stage("final-board"));
  posted.results = { ...posted.results, trivia:{ slots:[[ME]] } };
  assert.equal(triviaLive(posted), false);
  assert.equal(wrap(posted, React.createElement(TVBoard, { state:posted, now:NOW, fixed:true })), "");
});

test("the phone: the board view opens itself for each moment, the buzzer lit on the beat, the answers yours on your turn", async () => {
  const { React, wrap, TriviaPlaySheet, TriviaHome, BoardPlaySheet, boardOpenKey } = await components();
  const sheet = (state, player = ME, at = NOW, extra = {}) => {
    const s = phone(state, player);
    return wrap(s, React.createElement(TriviaPlaySheet, { state:s, me:player, now:at, onAct:async () => ({ ok:true }), ...extra }));
  };
  const mine = sheet(stage("pick-mine"));
  assert.match(mine, /fd-board-game is-pick/);
  assert.equal((mine.match(/<button type="button" class="fd-board-cell is-live/g) || []).length, 21, "every lit value a button");
  assert.match(mine, />Your pick</);
  assert.match(sheet(stage("pick")), /fd-board-picker/, "someone else's pick: who picks, the board still");
  const ready = sheet(stage("clue"));
  assert.match(ready, /fd-buzzer is-off/, "dark until the arm");
  const clue = stage("clue");
  const armAt = clue.trivia.log[clue.trivia.current].armAt;
  assert.match(sheet(clue, ME, armAt), /fd-buzzer is-live/, "lit on the server's instant");
  assert.match(sheet(stage("armed")), /fd-buzzer is-live/);
  const latched = sheet(stage("armed-in"));
  assert.match(latched, /fd-buzzer is-in/);
  assert.match(latched, />0\.281</, "your own time");
  /* the rebound: dark again under the struck letters, lit on its arm; out once you answered */
  const again = sheet(stage("rebound"));
  assert.match(again, /fd-board-body is-buzz is-rebound/);
  assert.match(again, /fd-buzzer is-off/, "dark until the new arm");
  assert.equal((again.match(/<li class="is-struck"><span class="fd-board-letter">/g) || []).length, 1, "the struck letter barred");
  assert.match(again, /aria-label="3 of 4 left"/);
  const rebound = stage("rebound");
  const reArm = rebound.trivia.log[rebound.trivia.current].armAt;
  assert.match(sheet(rebound, ME, reArm), /fd-buzzer is-live/, "lit on the rebound's instant");
  assert.match(sheet(stage("rebound-in")), /fd-buzzer is-in/);
  const out = sheet(stage("rebound-out"));
  assert.match(out, /fd-buzzer is-out/);
  assert.match(out, />Out</);
  assert.doesNotMatch(out, /<button type="button" class="fd-buzzer-button"/, "nothing to press");
  const answer = sheet(stage("answer-mine"));
  assert.match(answer, /fd-board-body is-answer is-live/);
  assert.match(answer, /fd-board-dock is-live/);
  assert.match(answer, /fd-board-option is-struck/);
  assert.equal((answer.match(/<button type="button" class="fd-board-option"/g) || []).length, 3, "three still to choose");
  assert.match(sheet(stage("answer")), /fd-board-answerer/, "not your turn: who answers");
  assert.match(sheet(stage("reveal")), /fd-board-delta is-up/);
  assert.match(sheet(stage("dd-wager")), /fd-wheel/, "the Daily Double's wheel");
  assert.match(sheet(stage("dd-wager"), "Evan"), /fd-board-answerer is-dd/);
  const finalWager = stage("final-wager");
  const eligible = view(finalWager, null).finalEligible.find(player => !finalWager.trivia.finalWagers[player]);
  assert.match(sheet(finalWager, eligible), />Lock in</);
  const finalClue = sheet(stage("final-clue"));
  assert.match(finalClue, /fd-board-final-text/, "the Final's text is on the phone");
  assert.match(finalClue, /fd-board-primary" disabled/, "Lock in waits for a pick");
  assert.match(sheet(stage("final-reveal")), /fd-board-body is-final is-reveal/);
  assert.match(sheet(stage("final-board")), /fd-trivia-standings/);
  /* a spectator opens it from Home, not by itself */
  assert.equal(sheet(away(stage("clue"), "Henry"), "Henry"), "");
  assert.match(sheet(away(stage("clue"), "Henry"), "Henry", NOW, { initiallyOpen:true }), /fd-board-in/);
  const home = s => wrap(s, React.createElement(TriviaHome, { state:s, me:ME, now:NOW, onOpen() {} }));
  assert.match(home(phone(stage("pick-mine"))), />Your pick</);
  assert.match(home(phone(stage("armed"))), />Buzzers live</);
  assert.match(home(phone(stage("rebound-armed"))), />Buzzers live</);
  assert.doesNotMatch(home(phone(stage("rebound-out"))), />Buzzers live</, "out of it: no call to buzz");
  const posted = stage("final-board");
  posted.results = { ...posted.results, trivia:{ slots:[[ME]] } };
  assert.equal(sheet(posted), "", "gone once the result posts");
  assert.equal(home(phone(posted)), "");
  assert.ok(BoardPlaySheet);
  /* the sheet opens itself again for a rebound, even closed on the first race */
  const first = boardOpenKey(view(stage("armed")));
  assert.notEqual(boardOpenKey(view(stage("rebound"))), first);
  assert.notEqual(boardOpenKey(view(stage("rebound"))), boardOpenKey(view(stage("answer"))));
});

test("the desk: Rounds | Board, the board it will deal, its Final", async () => {
  const { React, wrap, TriviaDesk } = await components();
  const state = publicState(boardDeskStage(), { isGm:true });
  const desk = wrap(state, React.createElement(TriviaDesk, { state, onAct:async () => ({ ok:true }), notify() {},
    loadBank:() => new Promise(() => {}) }));
  assert.match(desk, /role="radio" aria-checked="true"[^>]*>Board</);
  assert.match(desk, /fd-board-desk/);
  assert.match(desk, /fd-board-finalcard is-own/);
  assert.match(desk, />Landmarks</);
  assert.equal((desk.match(/fd-trivia-round-n/g) || []).length, BOARD_FIT_ROUNDS.length - 1,
    "the round list stays under the board: its order is the columns' order");
  assert.ok(desk.indexOf("fd-board-desk") < desk.indexOf("fd-trivia-rounds") && desk.indexOf("fd-trivia-rounds") < desk.indexOf("fd-board-finalcard"));
  const rounds = publicState({ ...boardDeskStage(), triviaFormat:"rounds" }, { isGm:true });
  const list = wrap(rounds, React.createElement(TriviaDesk, { state:rounds, onAct:async () => ({ ok:true }), notify() {},
    loadBank:() => new Promise(() => {}) }));
  assert.match(list, /fd-trivia-rounds/);
  assert.equal((list.match(/fd-trivia-round-n/g) || []).length, BOARD_FIT_ROUNDS.length - 1, "the Final is not a round");
  assert.doesNotMatch(list, /fd-board-finalcard/);
});

test("the real writes: a board played through the reducers reads as the same screens the fixtures draw", async () => {
  const { React, wrap, TVTrivia, TriviaPlaySheet } = await components();
  const moments = { pick:["pick", "pick-watch"], armed:["armed", "buzzer"], answer:["answer", null], reveal:["reveal", "reveal"],
    "final-clue":["final-clue", "final-clue"], "final-reveal":["final-reveal", "final-reveal"] };
  for (const [moment, [scene, screen]] of Object.entries(moments)) {
    const state = boardPlayed(moment, { now:NOW });
    const room = view(state, null);
    assert.equal(tvBoardScene(room, NOW), scene, moment);
    const mine = view(state);
    if (screen) assert.equal(boardScreen(mine), screen, moment);
    else assert.ok(["answer", "answer-watch"].includes(boardScreen(mine)), moment);
    const s = tv(state);
    assert.match(wrap(s, React.createElement(TVTrivia, { state:s, now:NOW, fixed:true })), new RegExp(`tv-board is-${scene}`), moment);
    const p = phone(state);
    assert.match(wrap(p, React.createElement(TriviaPlaySheet, { state:p, me:ME, now:NOW, onAct:async () => ({ ok:true }) })), /fd-board-game/, moment);
  }
  /* a rebound through the real writes: the first race kept, the room buzzing again */
  const rebound = boardPlayed("rebound", { now:NOW });
  const room = view(rebound, null);
  assert.deepEqual([tvBoardScene(room, NOW), room.race, room.rebound], ["rebound-armed", 1, true]);
  assert.ok(room.answered.length === 1 && room.buzzedIn.length > 0 && !room.buzzedIn.includes(room.answered[0]));
  assert.ok(["buzzer", "buzz-out"].includes(boardScreen(view(rebound))));
  const relit = tv(rebound);
  assert.match(wrap(relit, React.createElement(TVTrivia, { state:relit, now:NOW, fixed:true })), /tv-board is-rebound-armed/);
  /* the same moment the same every build: the seeded room and the run's clock */
  assert.deepEqual(boardPlayed("armed", { now:NOW }).trivia, boardPlayed("armed", { now:NOW }).trivia);
  /* the real buzzes are the projection's: the TV sees who, never how fast */
  const armed = view(boardPlayed("armed", { now:NOW }), null);
  assert.ok(armed.buzzedIn.length > 0 && Object.values(armed.buzzes).every(buzz => buzz.in === true));
  assert.equal(nextBoardInstant(armed, NOW) > NOW, true);
});

test("the board fixtures are the contract's: a dealt board, a log a write would write, every instant on the clock", () => {
  const state = stage("armed");
  const game = state.trivia;
  assert.equal(game.format, "board");
  assert.deepEqual(game.questions, []);
  assert.equal(game.players.length, ROSTER.length);
  const log = game.log[game.current];
  assert.equal(log.shownAt, log.pickedAt + BOARD_ZOOM_MS);
  assert.ok(log.armAt < NOW && NOW < log.openUntil);
  assert.equal(stage("pick").trivia.pickAt + BOARD_PICK_MS > NOW, true);
  assert.ok(triviaLive(state));
});
