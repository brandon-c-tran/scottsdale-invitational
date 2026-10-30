/* The board plays the question bank (docs/TRIVIA-QBANK.md "Board
   changes"), through the real reducers on the fixture bank
   (worker/triviaQBank/_fixtures.json): the commissioner's plan dealt
   exactly (seven columns, 100 to 500, options in a seeded order with
   their ids), refused until it is full and ready; media clues projected
   only once picked, their answer, reveal and reveal media only at the
   reveal; media first (the arm waits for the TV, or the cap); the host's
   replay and pause; the rebound replaying the clip; the Daily Double and
   the Final on the board's top value; a room of 13 buzzing at once,
   repeated writes never scoring twice; a phone rebuilt mid-clue; the whole
   game to its result on the autopilot. */
import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_STATE, allEventsOf, presentPlayers, resolveCurrentContest } from "../shared/core.js";
import {
  BOARD_TUNE_LEAD_MS, BOARD_ZOOM_MS, BUZZ_SETTLE_MS, BUZZ_SHOW_MS, DD_MIN, DD_STING_MS, MEDIA_ARM_LEAD_MS, MEDIA_CUE_LEAD_MS,
  MEDIA_READY_CAP_MS, REBOUND_LEAD_MS, boardRace, boardResultSlots, boardStandings, boardTopValue, buzzCloseAt, cellsLeft,
  clipMs, clipStart, ddMax, finalEligible, finalMax, readMs, turnPlayer,
} from "../shared/triviaBoard.js";
import { QBANK_VALUES } from "../shared/triviaQBank.js";
import { triviaBeat, triviaConfigured } from "../shared/trivia.js";
import { autoBeat } from "../shared/autopilot.js";
import { publicState } from "../worker/publicState.js";
import { pickerOf } from "../worker/triviaBoard.js";
import { boardView, boardScreen, tvBoardScene } from "../src/features/trivia/boardModel.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { FIXTURES, FIXTURE_PLAN, withFixtureBank } from "./support/qbank.mjs";

let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = () => ({ ...GM, player:null, deviceId:"gm", actionId:`g${++serial}` });
const tv = () => ({ isGm:false, tv:true, player:null, deviceId:"tv", actionId:`t${++serial}` });
const auto = key => ({ isGm:true, auto:true, player:null, deviceId:"autopilot", actionId:key, environment:"local" });
const as = (player, actionId = `p${++serial}`) => ({ isGm:false, player, deviceId:`d-${player}`, actionId });
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
const at = (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
};
const trivia = state => allEventsOf(state).find(ev => ev.id === "trivia");
const record = id => FIXTURES.records.find(item => item.id === id);
/* the clue on the board dealt from a bank record */
const clueFor = (state, qid) => Object.values(state.trivia.clues).find(clue => clue.source === qid);

let BASE = null;
/* a room at Trivia with the board format and the fixture plan, locked and
   started (Lock and start deals the plan in its own write) */
function room({ plan = FIXTURE_PLAN, start = true, rounds = [] } = {}) {
  if (!BASE) {
    const state = structuredClone(EMPTY_STATE);
    act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
    BASE = state;
  }
  const state = structuredClone(BASE);
  act(state, "triviaSetFormat", { format:"board" });
  for (const round of rounds) act(state, "triviaSaveRound", { round });
  if (plan) act(state, "qbankImport", { plan:structuredClone(plan), edits:{}, marks:{} });
  if (start) {
    const contest = resolveCurrentContest(state, trivia(state));
    act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
  }
  return state;
}
const logOf = state => state.trivia.log[state.trivia.current];
const pick = (state, qid, when = state.trivia.pickAt + 100) =>
  at(when, () => act(state, "boardPick", { clueId:clueFor(state, qid).id }));
const ready = (state, when, ctx = tv()) => at(when, () => act(state, "boardMediaReady", { clueId:state.trivia.current }, ctx));
const buzz = (state, player, ms, when = logOf(state).armAt) =>
  at(when, () => act(state, "boardBuzz", { clueId:state.trivia.current, ms }, as(player)));
const close = (state, when = buzzCloseAt(logOf(state))) => at(when, () => act(state, "boardCloseBuzz", { clueId:state.trivia.current }));
const answer = (state, player, choice, when = logOf(state).turnAt) =>
  at(when, () => act(state, "boardAnswer", { clueId:state.trivia.current, choice }, as(player)));
const rightOf = state => state.trivia.clues[state.trivia.current].answer;

test("a plan game deals the plan exactly: seven columns in order, 100 to 500, each record merged with its edit, options seeded with their ids", () => {
  const restore = withFixtureBank();
  try {
    const state = room({ start:false });
    act(state, "qbankEdit", { qid:"fx-lore-2", patch:{ prompt:"Edited before the deal?" } });
    assert.equal(triviaConfigured(state), true, "a plan alone is something to start");
    assert.equal(triviaBeat(state, trivia(state))?.type, "trivia-start", "the pill's beat once the event is under way");
    const contest = resolveCurrentContest(state, trivia(state));
    act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
    const game = state.trivia;
    assert.equal(game.format, "board", "Lock and start dealt the plan in its own write");
    assert.deepEqual(game.values, QBANK_VALUES);
    assert.equal(game.columns.length, 7);
    assert.deepEqual(game.columns.map(column => column.category), FIXTURE_PLAN.columns.map(column => column.category));
    assert.deepEqual(game.columns.map(column => column.name), ["Who He Play For?", "Kim & Winnie", "Brandon Lore", "Pass the Aux",
      "Internet Archaeology", "You Know This Sound", "Silhouette Showdown"]);
    game.columns.forEach((column, col) => column.clues.forEach((id, row) => {
      const clue = game.clues[id];
      const source = record(FIXTURE_PLAN.columns[col].slots[row]);
      assert.deepEqual([clue.source, clue.value, clue.format], [source.id, QBANK_VALUES[row], "choice"]);
      assert.equal(clue.optionIds[clue.answer], source.answer);
    }));
    assert.equal(clueFor(state, "fx-lore-2").text, "Edited before the deal?");
    assert.equal(boardTopValue(game), 500);
    assert.ok(game.clues[game.dd].row >= 2, "the Daily Double is worth 300 or more");
    assert.deepEqual(game.questions, []);
    /* editing the bank mid-game never moves the dealt board */
    act(state, "qbankEdit", { qid:"fx-lore-3", patch:{ prompt:"Too late?" } });
    assert.notEqual(clueFor(state, "fx-lore-3").text, "Too late?");
    /* the Daily Double's and the Final's most read 500 */
    assert.equal(ddMax(0, boardTopValue(game)), 500);
    assert.equal(finalMax(1200, boardTopValue(game)), 1200);
    assert.equal(finalMax(-300, boardTopValue(game)), 500);
  } finally { restore(); }
});

test("a plan that is not full or not ready is refused, never a silent set-list game; an empty plan plays the set list", () => {
  const restore = withFixtureBank();
  try {
    const short = structuredClone(FIXTURE_PLAN);
    short.columns[4].slots[3] = null;
    const state = room({ plan:short, start:false });
    const contest = resolveCurrentContest(state, trivia(state));
    act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
    assert.equal(state.trivia, null, "Lock and start leaves a short board for the commissioner");
    assert.equal(triviaBeat(state, trivia(state))?.type, "trivia-start", "the pill offers Start trivia");
    assert.equal(refuse(state, "triviaStart", { evId:"trivia" }), "Fill all 35 slots in the Question bank first");
    act(state, "qbankAssign", { col:4, slot:3, qid:"fx-web-4" });
    act(state, "qbankAssign", { col:1, slot:1, qid:"fx-kim-6" });
    assert.equal(refuse(state, "triviaStart", { evId:"trivia" }), "1 clue isn't ready");
    act(state, "qbankAssign", { col:1, slot:1, qid:"fx-kim-2" });
    act(state, "triviaStart", { evId:"trivia" });
    assert.deepEqual(state.trivia.values, QBANK_VALUES);
    /* an empty plan: the set list as before */
    const list = room({ plan:null, start:true, rounds:[{ id:"tcustom01", source:"custom", name:"Warmup", questions:[
      { id:"qwarm0001", format:"choice", text:"First?", options:["A", "B", "C", "D"], answer:0 }] }] });
    assert.equal(list.trivia.values, undefined);
    assert.equal(list.trivia.columns[0].name, "Warmup");
    assert.equal(list.trivia.clues[list.trivia.columns[0].clues[0]].value, 200);
  } finally { restore(); }
});

test("a phone sees a clue's media once picked, its answer, reveal text and reveal media only at the reveal", () => {
  const restore = withFixtureBank();
  try {
    const state = room();
    const nba = clueFor(state, "fx-nba-1");
    const before = JSON.stringify(publicState(state, { player:"Evan" }));
    for (const clue of Object.values(state.trivia.clues)) {
      if (clue.media) assert.ok(!before.includes(clue.media.src), "no media before its pick");
      assert.ok(!before.includes(clue.text) && !before.includes(clue.options[0]), "no clue before its pick");
    }
    pick(state, "fx-nba-1");
    const picked = publicState(state, { player:"Evan" }).trivia.clues[nba.id];
    assert.deepEqual([picked.media.src, picked.subject, picked.optionIds], [nba.media.src, "Fixture Player", nba.optionIds]);
    assert.deepEqual([picked.answer, picked.reveal, picked.revealMedia], [undefined, undefined, undefined]);
    const text = JSON.stringify(publicState(state, { player:"Evan" }));
    assert.ok(!text.includes(nba.revealMedia.src) && !text.includes(nba.reveal), "the reveal never rides early");
    assert.ok(!text.includes("example.com") && !text.includes("TEST FIXTURE"), "sources and notes never leave the bank");
    const tvFrame = publicState(state, {}).trivia.clues[nba.id];
    assert.equal(tvFrame.revealMedia, undefined, "the TV's frame neither");
    ready(state, logOf(state).mediaWait.from - 200);
    buzz(state, "Evan", 300);
    close(state);
    answer(state, "Evan", nba.answer);
    const shown = publicState(state, { player:"Khoa" }).trivia.clues[nba.id];
    assert.deepEqual([shown.answer, shown.reveal, shown.revealMedia.src], [nba.answer, nba.reveal, nba.revealMedia.src]);
  } finally { restore(); }
});

test("media first: the arm waits for the TV (a beat after its ready, never before the clue has read) or the cap", () => {
  const restore = withFixtureBank();
  try {
    const state = room();
    const image = clueFor(state, "fx-sil-1");
    pick(state, "fx-sil-1", state.trivia.pickAt + 10);
    const log = logOf(state);
    const read = log.pickedAt + BOARD_ZOOM_MS + readMs(image);
    assert.deepEqual(log.mediaWait, { from:read });
    assert.equal(log.armAt, read + MEDIA_READY_CAP_MS, "no TV: the cap");
    assert.equal(refuse(state, "boardMediaReady", { clueId:image.id }, as("Evan")), "The TV reports this");
    /* ready during the zoom: the arm is the reading time */
    ready(state, log.pickedAt + 300);
    assert.equal(logOf(state).armAt, read);
    assert.equal(logOf(state).mediaWait, undefined);
    assert.equal(logOf(state).openUntil, read + 6000);
    assert.equal(ready(state, log.pickedAt + 400).extra.unchanged, true, "a second TV changes nothing");
    /* ready late: a beat after it */
    const late = room();
    pick(late, "fx-sound-1", late.trivia.pickAt + 10);
    const audio = clueFor(late, "fx-sound-1");
    const lateLog = logOf(late);
    const lateRead = lateLog.pickedAt + BOARD_ZOOM_MS + readMs(audio);
    assert.ok(readMs(audio) >= BOARD_TUNE_LEAD_MS && readMs(audio) <= 3500, "a clip's prompt reads short");
    ready(late, lateRead + 1000);
    assert.equal(logOf(late).armAt, lateRead + 1000 + MEDIA_ARM_LEAD_MS);
    assert.equal(logOf(late).openUntil, logOf(late).armAt + clipMs(audio) + 2000, "a clip keeps the buzzers open to its end and two more");
    assert.deepEqual(clipStart(late.trivia), { at:logOf(late).armAt, ms:1000, paused:false, cue:0 }, "the clip plays from the arm");
    /* after the cap, or once anyone buzzed: nothing moves */
    const capped = room();
    pick(capped, "fx-web-1", capped.trivia.pickAt + 10);
    const arm = logOf(capped).armAt;
    buzz(capped, "Evan", 400, arm);
    assert.equal(ready(capped, arm + 10).extra.unchanged, true);
    assert.equal(logOf(capped).armAt, arm);
    /* the commissioner may report it too (the in-app TV on his phone) */
    const mine = room();
    pick(mine, "fx-nba-1", mine.trivia.pickAt + 10);
    ready(mine, logOf(mine).pickedAt + 100, gm());
    assert.equal(logOf(mine).mediaWait, undefined);
  } finally { restore(); }
});

test("the host replays or pauses a clip; the rebound plays it again from its own arm; the clue leaving stops it", () => {
  const restore = withFixtureBank();
  try {
    const state = room();
    const audio = clueFor(state, "fx-aux-2");
    pick(state, "fx-aux-2", state.trivia.pickAt + 10);
    ready(state, logOf(state).pickedAt + 200);
    const arm = logOf(state).armAt;
    assert.deepEqual(triviaBeat(state, trivia(state)).tray.map(item => [item.label, item.write, item.payload.action]),
      [["Replay clip", "boardMediaCue", "replay"], ["Pause clip", "boardMediaCue", "pause"]], "the pill's tray carries the cues");
    assert.equal(refuse(state, "boardMediaCue", { clueId:audio.id, action:"replay" }, as("Evan")), "Commissioner only");
    assert.equal(refuse(state, "boardMediaCue", { clueId:audio.id, action:"rewind" }), "Replay or pause");
    const ctx = gm();
    at(arm + 900, () => act(state, "boardMediaCue", { clueId:audio.id, action:"replay" }, ctx));
    const cue = logOf(state).mediaCue;
    assert.deepEqual(cue, { action:"replay", at:arm + 900 + MEDIA_CUE_LEAD_MS, n:1 });
    assert.equal(at(arm + 950, () => applyAction(state, "boardMediaCue", { clueId:audio.id, action:"replay" }, ctx)).extra.unchanged, true,
      "a retried cue is one cue");
    assert.ok(logOf(state).openUntil >= cue.at + clipMs(audio) + 2000, "a replay before any buzz keeps the buzzers open to its end");
    assert.deepEqual(clipStart(state.trivia), { at:cue.at, ms:600, paused:false, cue:1 });
    at(arm + 1200, () => act(state, "boardMediaCue", { clueId:audio.id, action:"pause" }));
    assert.equal(clipStart(state.trivia).paused, true);
    /* the rebound: the clip plays again from the new arm */
    buzz(state, "Evan", 300, arm + 1300);
    close(state);
    at(logOf(state).turnAt, () => act(state, "boardMediaCue", { clueId:audio.id, action:"replay" }));
    assert.equal(clipStart(state.trivia).paused, false, "a replay while they answer");
    answer(state, "Evan", (rightOf(state) + 1) % 4);
    assert.equal(boardRace(logOf(state)), 1);
    assert.equal(logOf(state).armAt, logOf(state).attempts[0].at + REBOUND_LEAD_MS);
    assert.deepEqual(clipStart(state.trivia), { at:logOf(state).armAt, ms:600, paused:false, cue:3 }, "the rebound's arm replays it");
    /* a clue without a clip, or one not up, refuses a cue */
    const picture = room();
    pick(picture, "fx-nba-1", picture.trivia.pickAt + 10);
    assert.equal(refuse(picture, "boardMediaCue", { clueId:picture.trivia.current, action:"replay" }), "That clue has no clip");
    assert.equal(triviaBeat(picture, trivia(picture)).tray, undefined, "no clip, no cues");
    assert.equal(refuse(picture, "boardMediaCue", { clueId:clueFor(picture, "fx-aux-2").id, action:"replay" }), "That clue isn't up");
  } finally { restore(); }
});

test("a room of 13: buzzes at once order by each phone's reaction; one answers; repeated writes never score twice", () => {
  const restore = withFixtureBank();
  try {
    const state = room();
    const players = state.trivia.players;
    assert.ok(players.length >= 12, `${players.length} here`);
    /* a 200 (the Daily Double hides on 300 and up: a 300 picked here was it one deal in 21) */
    pick(state, "fx-kim-2", state.trivia.pickAt + 10);
    const log = logOf(state);
    /* every buzz reaches the server at the same instant; the reactions decide */
    const reactions = players.map((player, i) => ({ player, ms:180 + ((i * 37) % 13) * 11 + i }));
    for (const { player, ms } of reactions) buzz(state, player, ms, log.armAt + 50);
    for (const { player, ms } of reactions) assert.equal(buzz(state, player, ms, log.armAt + 60).extra.unchanged, true, "a second buzz");
    close(state, log.armAt + 50 + BUZZ_SETTLE_MS);
    const fastest = [...reactions].sort((a, b) => a.ms - b.ms)[0].player;
    assert.equal(turnPlayer(logOf(state)), fastest);
    assert.equal(logOf(state).order.length, players.length);
    const other = players.find(player => player !== fastest);
    assert.equal(at(logOf(state).turnAt, () => refuse(state, "boardAnswer", { clueId:state.trivia.current, choice:0 }, as(other))), "Not your turn");
    const right = rightOf(state);
    const tap = as(fastest, "the-one-tap");
    at(logOf(state).turnAt + 100, () => act(state, "boardAnswer", { clueId:state.trivia.current, choice:right }, tap));
    assert.equal(at(logOf(state).turnAt + 200, () => applyAction(state, "boardAnswer", { clueId:state.trivia.current, choice:right },
      tap)).extra.unchanged, true, "the retried tap");
    assert.equal(at(logOf(state).turnAt + 300, () => applyAction(state, "boardAnswer", { clueId:state.trivia.current, choice:right },
      as(fastest))).extra.unchanged, true, "the same answer again");
    const id = state.trivia.current;
    assert.equal(at(logOf(state).revealedAt + 10, () => act(state, "boardNext", { clueId:id })).ok, true);
    assert.equal(at(logOf(state)?.revealedAt ?? Date.now(), () => applyAction(state, "boardNext", { clueId:id }, gm())).extra.unchanged, true);
    const row = boardStandings(state.trivia).find(item => item.player === fastest);
    assert.deepEqual([row.score, row.right], [200, 1], "the value once");
    assert.equal(boardStandings(state.trivia).filter(item => item.score !== 0).length, 1);
  } finally { restore(); }
});

test("a phone reconnecting mid-clue rebuilds the clue, its media and its clock from the frame alone", () => {
  const restore = withFixtureBank();
  try {
    const state = room();
    pick(state, "fx-web-2", state.trivia.pickAt + 10);
    ready(state, logOf(state).pickedAt + 200);
    const armAt = logOf(state).armAt;
    const frame = publicState(state, { player:"Khoa" });
    const view = boardView(frame, "Khoa", armAt + 100);
    assert.equal(boardScreen(view), "buzzer");
    assert.equal(view.clue.media.kind, "image");
    assert.equal(view.clue.revealMedia, undefined);
    assert.equal(view.armAt, armAt);
    const tvView = boardView(publicState(state, {}), null, armAt + 100);
    assert.equal(tvBoardScene(tvView, armAt + 100), "armed");
    assert.equal(tvBoardScene(tvView, armAt - 100), "clue");
  } finally { restore(); }
});

test("the autopilot plays a plan game to its result: every cell, media clues ready on the TV, the Daily Double, the Final", () => {
  const restore = withFixtureBank();
  try {
    const state = room();
    const game = state.trivia;
    const done = new Set();
    let wrong = false;
    const move = s => {
      const g = s.trivia, log = g.current ? g.log[g.current] : null;
      const key = `${g.phase}:${g.current}:${log?.turn ?? ""}:${boardRace(log)}`;
      if (done.has(key)) return false;
      done.add(key);
      if (g.phase === "pick") { at(g.pickAt + 1500, () => act(s, "boardPick", { clueId:cellsLeft(g).at(-1) }, as(pickerOf(s, g)))); return true; }
      if (g.phase === "clue") {
        if (log.mediaWait) ready(s, log.pickedAt + 400);
        g.players.filter(player => !(log.attempts || []).some(attempt => attempt.player === player)).slice(0, 3)
          .forEach((player, i) => buzz(s, player, 240 + 41 * i));
        return true;
      }
      if (g.phase === "answer" || g.phase === "dd-clue") {
        wrong = !wrong;
        answer(s, turnPlayer(log), wrong ? (rightOf(s) + 1) % 4 : rightOf(s));
        return true;
      }
      if (g.phase === "dd-wager") { at(log.pickedAt + DD_STING_MS + 500, () => act(s, "boardWager", { wager:DD_MIN }, as(log.by))); return true; }
      if (g.phase === "final-wager") {
        for (const player of finalEligible(s, g)) at(g.finalAt.introAt + 4000, () => act(s, "boardWager", { wager:100 }, as(player)));
        return true;
      }
      if (g.phase === "final-clue") {
        g.players.forEach((player, i) => at(g.finalAt.clueAt + 2000 + i, () => act(s, "boardFinalPick",
          { choice:i % 2 ? g.final.answer : (g.final.answer + 1) % 4, lock:true }, as(player))));
        return true;
      }
      return false;
    };
    let guard = 0;
    for (; guard < 2000; guard++) {
      if (move(state)) continue;
      const beat = autoBeat(state);
      if (!beat) break;
      const result = at(beat.at, () => applyAction(state, beat.type, beat.payload, auto(beat.key)));
      assert.equal(result.ok, true, `${beat.type}: ${result.error}`);
    }
    assert.ok(guard < 2000);
    assert.equal(game.played.length, 35, "every cell");
    assert.ok(state.results.trivia, "the result posted");
    assert.deepEqual(state.results.trivia.slots, boardResultSlots(boardStandings(game)));
    const media = game.played.filter(id => game.clues[id].media);
    assert.ok(media.length >= 6 && media.every(id => game.log[id].mediaReadyAt), "every media clue armed on the TV's ready");
    assert.ok(game.played.some(id => boardRace(game.log[id]) > 0), "rebounds played");
    assert.ok(boardStandings(game).every(row => Math.abs(row.preFinal) % 100 === 0));
  } finally { restore(); }
});

/* ── end to end, through the Durable Object's sockets ── */

test("end to end over the sockets: the host picks each kind of clue, the TV readies it, a phone buzzes and answers, the reveal, the score, the board", async () => {
  const restore = withFixtureBank();
  const realNow = Date.now;
  const clock = { t:realNow() };
  Date.now = () => clock.t;
  try {
    const { Tournament } = await import("../worker/tournament.js");
    const entries = new Map(), sockets = [];
    const storage = {
      async get(key) { return structuredClone(entries.get(key)); },
      async put(key, value) {
        if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
        else entries.set(key, structuredClone(value));
      },
      async delete(key) { for (const item of [].concat(key)) entries.delete(item); },
      async list({ prefix = "" } = {}) { return new Map([...entries].filter(([k]) => k.startsWith(prefix))); },
      async transaction(fn) { return fn(storage); }, async setAlarm() {}, async getAlarm() { return null; }, async deleteAlarm() {},
    };
    const tournament = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil() {} },
      { APP_ENV:"local" });
    await tournament.hydrateFromStorage();
    tournament.gmToken = "gm-secret";
    const socket = () => {
      let attachment = null;
      const ws = { raw:[], send(frame) { ws.raw.push(frame); }, serializeAttachment(v) { attachment = structuredClone(v); },
        deserializeAttachment() { return attachment; }, close() {} };
      sockets.push(ws);
      return ws;
    };
    const frames = ws => ws.raw.map(frame => JSON.parse(frame));
    const lastState = ws => frames(ws).filter(frame => frame.type === "state").at(-1).state;
    const lastAck = ws => frames(ws).filter(frame => frame.type === "ack").at(-1);
    let seq = 0;
    const send = (ws, device, type, payload = {}, { gm = false, actionId = `e${++seq}` } = {}) => tournament.webSocketMessage(ws,
      JSON.stringify({ actionId, type, payload, deviceId:device, ...(gm ? { gmToken:"gm-secret" } : {}) }));
    const DEV = name => `device-${name}-7f1c2a9e-0000-4000-8000-000000000001`;

    /* a plan game under way */
    const built = room();
    tournament.state = built;
    const player = built.trivia.players.find(item => item !== "Brandon");
    const tv = socket(), phone = socket(), host = socket();
    await send(tv, DEV("tv"), "hello", { view:"tv", nonce:1 });
    await send(phone, DEV("phone"), "hello", { nonce:1 });
    await send(phone, DEV("phone"), "claim", { player });
    await send(host, DEV("host"), "hello", { nonce:1 }, { gm:true });

    const kinds = [["fx-lore-2", "text"], ["fx-nba-1", "image"], ["fx-sound-1", "audio"], ["fx-web-1", "video"], ["fx-sil-1", "image"],
      ["fx-web-2", "image"]];
    let expected = 0;
    for (const [qid, kind] of kinds) {
      const game = () => tournament.state.trivia;
      const clue = Object.values(game().clues).find(item => item.source === qid);
      clock.t = Math.max(clock.t, game().pickAt) + 200;
      await send(host, DEV("host"), "boardPick", { clueId:clue.id }, { gm:true });
      assert.equal(lastAck(host).ok, true, `${qid} pick: ${lastAck(host).error}`);
      const log = () => game().log[clue.id];
      if (kind !== "text") {
        /* only the TV (or the host) says the media is ready */
        await send(phone, DEV("phone"), "boardMediaReady", { clueId:clue.id });
        assert.equal(lastAck(phone).ok, false);
        const capped = log().armAt;
        clock.t += 300;
        await send(tv, DEV("tv"), "boardMediaReady", { clueId:clue.id });
        assert.equal(lastAck(tv).ok, true, `${qid} ready: ${lastAck(tv).error}`);
        assert.ok(log().armAt < capped, "the TV's ready brought the arm forward");
        const seen = lastState(phone).trivia.clues[clue.id];
        assert.equal(seen.media.src, clue.media.src, "the phone has the media once picked");
        assert.equal(seen.revealMedia, undefined);
        assert.equal(seen.answer, undefined);
        assert.equal(lastState(tv).trivia.clues[clue.id].media.kind, kind);
      }
      /* a phone reconnecting mid-clue rebuilds it from its first frame */
      const again = socket();
      await send(again, DEV("phone"), "hello", { nonce:2 });
      assert.equal(lastState(again).trivia.current, clue.id);
      assert.equal(boardScreen(boardView(lastState(again), player, log().armAt + 50)), "buzzer");
      /* the buzz, the close, the answer (sent twice: one tap) */
      clock.t = log().armAt + 120;
      await send(phone, DEV("phone"), "boardBuzz", { clueId:clue.id, ms:233, race:0 });
      assert.equal(lastAck(phone).ok, true, `${qid} buzz: ${lastAck(phone).error}`);
      clock.t = buzzCloseAt(log());
      await send(host, DEV("host"), "boardCloseBuzz", { clueId:clue.id }, { gm:true });
      clock.t = log().turnAt + 400;
      const tap = { actionId:`tap-${qid}` };
      await send(phone, DEV("phone"), "boardAnswer", { clueId:clue.id, choice:clue.answer }, tap);
      await send(phone, DEV("phone"), "boardAnswer", { clueId:clue.id, choice:clue.answer }, tap);
      expected += clue.value;
      const revealed = lastState(phone).trivia;
      assert.equal(revealed.phase, "reveal");
      assert.equal(revealed.clues[clue.id].answer, clue.answer);
      assert.equal(revealed.clues[clue.id].reveal, clue.reveal);
      if (clue.revealMedia) assert.equal(revealed.clues[clue.id].revealMedia.src, clue.revealMedia.src, "the reveal image at the reveal");
      assert.equal(boardStandings(revealed).find(row => row.player === player).score, expected, "the value once");
      clock.t = log().revealedAt + 500;
      await send(host, DEV("host"), "boardNext", { clueId:clue.id }, { gm:true });
      assert.equal(lastState(tv).trivia.phase, "pick", "back to the board");
    }
    assert.equal(lastState(tv).trivia.played.length, kinds.length);
    /* the TV and the phones never saw an unplayed clue's media or anything the bank keeps */
    const tvText = JSON.stringify(lastState(tv));
    const unplayed = Object.values(tournament.state.trivia.clues).filter(clue => !tournament.state.trivia.played.includes(clue.id) && clue.media);
    for (const clue of unplayed) assert.ok(!tvText.includes(clue.media.src));
    assert.ok(!tvText.includes("example.com") && !tvText.includes("triviaBankEdits"));
  } finally {
    Date.now = realNow;
    restore();
  }
});

test("QA: a jump through Trivia plays the plan game to its posted result (media clues arm at the cap with no TV)", () => {
  const restore = withFixtureBank();
  try {
    const state = room({ start:false });
    act(state, "qaAdvance", { target:"event:trivia:done", seed:7 });
    assert.ok(state.results.trivia, "the result posted");
    assert.deepEqual(state.trivia.values, QBANK_VALUES, "the plan was the game");
    assert.equal(state.trivia.played.length, 35);
  } finally { restore(); }
});
