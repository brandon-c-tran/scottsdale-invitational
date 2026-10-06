/* Trivia: everyone present answers alone on their own phone, scored for
   being right and for being fast; closest-number questions score by
   distance. It is ranked player by player and posts as an ordinary
   free-for-all result. The commissioner builds the set list from the bank
   and his own questions; the game runs itself on the server clock
   (triviaAutoBeat) and the pill can take any beat early. Answers, upcoming
   questions and other players' picks never reach a phone early, and the
   bank never ships to a client. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, computeStandings, presentPlayers, resolveCurrentContest,
} from "../shared/core.js";
import {
  TRIVIA_ALL_IN_MS, TRIVIA_BOARD_HOLD_MS, TRIVIA_FINAL_HOLD_MS, TRIVIA_FIRST_LEAD_MS, TRIVIA_GRACE_MS, TRIVIA_LEAD_MS, TRIVIA_MS,
  TRIVIA_NUMBER_REVEAL_HOLD_MS, TRIVIA_REVEAL_HOLD_MS, cleanTriviaQuestion, projectTrivia, scoreQuestion, speedBonus, triviaAutoBeat,
  triviaBeat, triviaResultSlots, triviaStandings,
} from "../shared/trivia.js";
import { TRIVIA_BANK } from "../worker/triviaBank.js";
import { publicState } from "../worker/publicState.js";
import { resolveDirector } from "../shared/show.js";
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
const trivia = state => allEventsOf(state).find(ev => ev.id === "trivia");
/* Date.now pinned to `at` for one call */
const at = (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
};

const CUSTOM = { id:"tcustom01", source:"custom", name:"The groom", questions:[
  { id:"qgroom001", format:"choice", text:"Where did Brandon propose?", options:["Kyoto", "Paris", "Big Sur", "Tahoe"], answer:2 },
  { id:"qgroom002", format:"number", text:"How many days did they date before he proposed?", answer:1461, unit:"days", digits:4 },
  { id:"qgroom003", format:"picture", text:"Who is this?", photo:{ id:"pphoto0001", w:1600, h:1200 },
    options:["Evan", "Khoa", "Sahil", "Henry"], answer:0 },
  { id:"qgroom004", format:"tune", text:"", options:[{ title:"Mr. Brightside", artist:"The Killers" },
    { title:"Take Me Out", artist:"Franz Ferdinand" }, { title:"Last Nite", artist:"The Strokes" },
    { title:"The Middle", artist:"Jimmy Eat World" }], answer:0, clip:{ isrc:"USIR20400274" } },
] };
const BANK = { id:"tsports01", source:"bank", category:"sports", picks:["sports-01", "sports-10"] };

/* A room at Trivia, under way, with the set list saved after the start so
   the game waits for its Start beat (or starts it, `start`). */
function ready(rounds = [BANK, CUSTOM], { start = false, away = [] } = {}) {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
  for (const player of away) act(state, "setAway", { player, away:true });
  const contest = resolveCurrentContest(state, trivia(state));
  act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
  if (state.trivia) act(state, "triviaRestart", { evId:"trivia" });
  for (const round of rounds) act(state, "triviaSaveRound", { round:structuredClone(round) });
  if (start) act(state, "triviaStart", { evId:"trivia" });
  return state;
}
const current = state => state.trivia.questions[state.trivia.index];
const players = state => state.trivia.players;

test("Trivia is a solo free-for-all: no teams, no draw, no draft, the 1,600 ladder", () => {
  const ev = trivia(structuredClone(EMPTY_STATE));
  assert.equal(ev.kind, "solo");
  assert.equal(ev.teamCfg, undefined);
  assert.equal(ev.participation.type, "all");
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
  assert.equal(state.draws?.trivia, undefined, "nobody draws teams");
  const contest = resolveCurrentContest(state, trivia(state));
  assert.equal(contest.kind, "ffa");
  assert.equal(contest.sides.length, presentPlayers(state).length, "every player is a side: a wide field pays 2:1");
});

test("scoring: right answers score 500 plus up to 500 for speed; closest number by distance", () => {
  assert.equal(speedBonus(20000, 20000), 500);
  assert.equal(speedBonus(10000, 20000), 250);
  assert.equal(speedBonus(0, 20000), 0);
  assert.equal(speedBonus(-500, 20000), 0, "a lock in the grace scores no bonus");
  const room = ["Evan", "Khoa", "Sahil", "Henry"];
  const time = { startsAt:1000, closesAt:21000 };
  const choice = { id:"q", format:"choice", answer:2 };
  const scored = scoreQuestion(choice, {
    Evan:{ choice:2, locked:true, lockedAt:6000 },
    Khoa:{ choice:2 },
    Sahil:{ choice:1, locked:true, lockedAt:2000 },
  }, room, time);
  assert.deepEqual([scored.Evan.points, scored.Evan.bonus], [880, 380], "locked with 15 of 20 s left (to the nearest 10)");
  assert.deepEqual([scored.Khoa.points, scored.Khoa.bonus], [500, 0], "never locked: counted at the deadline, no bonus");
  assert.equal(scored.Sahil.points, 0);
  assert.equal(scored.Henry.answered, false);
  const number = { id:"n", format:"number", answer:1000 };
  const near = scoreQuestion(number, { Evan:{ value:1000 }, Khoa:{ value:990 }, Sahil:{ value:1010 }, Henry:{ value:700 } }, room, time);
  assert.deepEqual(room.map(p => near[p].points), [1250, 500, 500, 0], "exact, then a tie for second shares it");
  const tied = scoreQuestion(number, { Evan:{ value:995 }, Khoa:{ value:1005 }, Sahil:{ value:900 } }, room, time);
  assert.deepEqual(["Evan", "Khoa", "Sahil"].map(p => tied[p].points), [1000, 1000, 500], "a tie for nearest shares 1st; the next is 2nd");
});

test("standings rank players, a tie breaks on the faster scoring answers; the result is one winner, then the next two ranks", () => {
  const game = { index:0, phase:"reveal", players:["Evan", "Khoa", "Sahil", "Henry", "Ben"],
    questions:[{ id:"q1", format:"choice", answer:0 }], times:{ q1:{ startsAt:0, closesAt:20000 } },
    picks:{ q1:{ Evan:{ choice:0, locked:true, lockedAt:10000 }, Khoa:{ choice:0, locked:true, lockedAt:10000 }, Sahil:{ choice:1 },
      Henry:{ choice:1, locked:true, lockedAt:500 } } } };
  const rows = triviaStandings(game);
  assert.deepEqual(rows.map(row => [row.player, row.total, row.rank]),
    [["Evan", 750, 1], ["Khoa", 750, 1], ["Sahil", 0, 3], ["Henry", 0, 3], ["Ben", 0, 3]]);
  assert.deepEqual(triviaResultSlots(rows), [["Evan"], ["Khoa"], ["Sahil", "Henry"]],
    "a single 1st (a full tie falls to join order); a shared rank shares its slot; Ben never answered and places nowhere");
  game.picks.q1.Khoa.lockedAt = 9990;
  assert.deepEqual(triviaStandings(game).map(row => row.player).slice(0, 2), ["Khoa", "Evan"], "the faster lock wins the tie");
  assert.equal(triviaResultSlots([{ player:"Evan", answered:0, rank:1 }]), null, "nobody answered: no result");
});

test("the set list: commissioner only, bank picks and his own questions, checked; locked while a game runs", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(refuse(state, "triviaSaveRound", { round:BANK }, as("Evan")), "Commissioner only");
  assert.equal(refuse(state, "triviaSaveRound", { round:{ ...BANK, category:"nope" } }), "That category isn't in the bank. Pick another");
  assert.equal(refuse(state, "triviaSaveRound", { round:{ ...BANK, picks:["sports-99"] } }), "Pick at least one question");
  assert.match(refuse(state, "triviaSaveRound", { round:{ ...CUSTOM, questions:[{ ...CUSTOM.questions[0], answer:4 }] } }),
    /Question 1: Mark the right answer/);
  assert.match(refuse(state, "triviaSaveRound", { round:{ ...CUSTOM, questions:[{ ...CUSTOM.questions[2], photo:null }] } }),
    /Add the photo/);
  assert.equal(cleanTriviaQuestion({ ...CUSTOM.questions[1], digits:3 }).error, "Too few wheels for the answer");
  assert.equal(cleanTriviaQuestion({ ...CUSTOM.questions[0], options:["A", "a", "B", "C"] }).error, "Four different answers");
  act(state, "triviaSaveRound", { round:BANK });
  act(state, "triviaSaveRound", { round:CUSTOM });
  assert.equal(act(state, "triviaSaveRound", { round:CUSTOM }).extra.unchanged, true);
  act(state, "triviaMoveRound", { id:CUSTOM.id, by:-1 });
  assert.deepEqual(state.triviaRounds.map(round => round.id), [CUSTOM.id, BANK.id]);
  act(state, "triviaDeleteRound", { id:CUSTOM.id });
  assert.deepEqual(state.triviaRounds.map(round => round.id), [BANK.id]);
  const playing = ready([BANK, CUSTOM], { start:true });
  assert.match(refuse(playing, "triviaSaveRound", { round:{ ...BANK, picks:["sports-02"] } }), /Restart the game/);
});

test("the game copies its questions in and seats everyone present; the first question waits longer", () => {
  const state = ready([BANK, CUSTOM], { away:["Ben"] });
  assert.match(refuse(structuredClone(EMPTY_STATE), "triviaStart", { evId:"trivia" }), /Lock and start/);
  act(state, "triviaStart", { evId:"trivia" });
  const game = state.trivia;
  assert.equal(game.teams, undefined, "no teams");
  assert.deepEqual(players(state), presentPlayers(state), "everyone present plays");
  assert.ok(!players(state).includes("Ben"), "an away player is not seated");
  assert.equal(game.questions.length, 6);
  assert.deepEqual(game.rounds.map(round => [round.name, round.first, round.count]), [["Sports", 0, 2], ["The groom", 2, 4]]);
  const bankQ = TRIVIA_BANK.find(category => category.id === "sports").questions[0];
  assert.equal(game.questions[0].options[game.questions[0].answer], bankQ.options[0], "the answer follows its option");
  const first = game.times[game.questions[0].id];
  assert.equal(first.startsAt - first.openedAt, TRIVIA_FIRST_LEAD_MS, "phones get a moment to open");
  assert.equal(first.closesAt - first.startsAt, TRIVIA_MS.choice);
  assert.equal(game.questions[5].clip.title, "Mr. Brightside", "a tune names the recording it plays");
  assert.equal(act(state, "triviaStart", { evId:"trivia" }).extra.unchanged, true);
  act(state, "triviaReveal", { questionId:current(state).id });
  act(state, "triviaNext", { questionId:current(state).id });
  const second = game.times[current(state).id];
  assert.equal(second.startsAt - second.openedAt, TRIVIA_LEAD_MS);
  /* Ben is back: he joins on his first pick */
  act(state, "setAway", { player:"Ben", away:false });
  act(state, "triviaPick", { questionId:current(state).id, value:7 }, as("Ben"));
  assert.ok(players(state).includes("Ben"));
});

test("your own answer: set it, change it, lock it in, and then it stays; nobody else's moves", () => {
  const state = ready([BANK, CUSTOM], { start:true });
  const q = current(state);
  const [a, b, c] = players(state);
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a));
  act(state, "triviaPick", { questionId:q.id, choice:3 }, as(a));
  assert.equal(state.trivia.picks[q.id][a].choice, 3, "you change your mind");
  assert.equal(act(state, "triviaPick", { questionId:q.id, choice:3 }, as(a)).extra.unchanged, true, "the same answer changes nothing");
  act(state, "triviaPick", { questionId:q.id, choice:0 }, as(b));
  assert.equal(state.trivia.picks[q.id][a].choice, 3, "another player's pick is their own");
  act(state, "triviaPick", { questionId:q.id, lock:true }, as(a));
  assert.deepEqual([state.trivia.picks[q.id][a].choice, state.trivia.picks[q.id][a].locked], [3, true]);
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(a)), "You locked in");
  assert.equal(act(state, "triviaPick", { questionId:q.id, choice:3, lock:true }, as(a)).extra.unchanged, true,
    "a retried lock is acknowledged");
  assert.equal(refuse(state, "triviaPick", { questionId:"tgstale-1", choice:0 }, as(a)), "That question is closed");
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, lock:true }, as(c)), "Pick an answer first");
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:4 }, as(c)), "Pick an answer");
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as("Nobody")), "You are not playing");
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, { isGm:true, player:null }), "Check in first");
  state.away = { [c]:{ at:1 } };
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(c)), "You are marked away");
});

test("a retried pick is acknowledged once and never undoes a newer one", () => {
  const state = ready([BANK, CUSTOM], { start:true });
  const q = current(state);
  const [a] = players(state);
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a, "tap-1"));
  act(state, "triviaPick", { questionId:q.id, choice:2 }, as(a, "tap-2"));
  assert.equal(act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a, "tap-1")).extra.unchanged, true);
  assert.equal(state.trivia.picks[q.id][a].choice, 2);
  assert.ok(!JSON.stringify(publicState(state, { player:a })).includes("tap-1"), "the retry ledger never leaves the server");
});

test("timing: picks land through the grace after the clock, a late lock scores no bonus, then the question closes", () => {
  const state = ready([BANK, CUSTOM], { start:true });
  const q = current(state);
  const time = state.trivia.times[q.id];
  const [a, b] = players(state);
  at(time.closesAt + TRIVIA_GRACE_MS - 10, () => act(state, "triviaPick", { questionId:q.id, choice:q.answer, lock:true }, as(a)));
  assert.equal(state.trivia.picks[q.id][a].lockedAt, time.closesAt, "a lock in the grace counts at the deadline");
  assert.equal(at(time.closesAt + TRIVIA_GRACE_MS + 10, () => refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(b))), "Time is up");
  act(state, "triviaReveal", { questionId:q.id });
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(b)), "That question is closed");
  const scores = scoreQuestion(state.trivia.questions[0], state.trivia.picks[q.id], players(state), state.trivia.times[q.id]);
  assert.deepEqual([scores[a].points, scores[a].bonus], [500, 0]);
});

test("the director runs it by hand: start, reveal, next, scores at a round's end, final scores, post result", () => {
  const state = ready();
  const pill = () => resolveDirector(state, allEventsOf(state)).nextAction;
  assert.deepEqual([pill().type, pill().label], ["trivia-start", "Start trivia"]);
  act(state, "triviaStart", { evId:"trivia" });
  const beats = [];
  for (let guard = 0; guard < 40 && pill()?.type?.startsWith("trivia-"); guard++) {
    const beat = pill();
    beats.push(beat.label);
    const q = current(state);
    if (beat.type === "trivia-reveal") {
      players(state).forEach((player, i) => act(state, "triviaPick", q.format === "number"
        ? { questionId:q.id, value:q.answer + i * 10, lock:i % 2 === 0 } : { questionId:q.id, choice:i % 3 ? (q.answer + 1) % 4 : q.answer,
          lock:true }, as(player)));
      assert.match(refuse(state, "triviaNext", { questionId:q.id }), /Reveal this question first/);
      act(state, "triviaReveal", { questionId:beat.questionId });
    } else if (beat.type === "trivia-board") act(state, "triviaBoard", { questionId:beat.questionId });
    else if (beat.type === "trivia-next") act(state, "triviaNext", { questionId:beat.questionId });
    else if (beat.type === "trivia-finish") {
      const winner = triviaStandings(state.trivia)[0];
      const before = computeStandings(state).find(row => row.player === winner.player);
      const done = act(state, "triviaFinish", { evId:"trivia" });
      assert.deepEqual(state.results.trivia.slots[0], [winner.player], "one winner");
      assert.deepEqual(done.extra.slots, state.results.trivia.slots);
      const after = computeStandings(state).find(row => row.player === winner.player);
      /* the award alone (bets may ride on the same result) */
      assert.equal(after.awardPts - before.awardPts, 1600, "the 1,600 ladder pays 1st");
    }
  }
  assert.deepEqual(beats, ["Reveal", "Next question", "Reveal", "Scores", "Next round", "Reveal", "Next question", "Reveal",
    "Next question", "Reveal", "Next question", "Reveal", "Final scores", "Post result"]);
  assert.equal(triviaBeat(state, trivia(state)), null, "nothing left to direct");
  assert.equal(triviaAutoBeat(state), null, "nothing left to run");
  assert.match(refuse(state, "triviaRestart", { evId:"trivia" }), /Clear the result/);
});

test("the pill's note counts the room locking in", async () => {
  const { directorPill } = await import("../src/features/director/directorPill.js");
  const state = ready([BANK], { start:true });
  const q = current(state);
  act(state, "triviaPick", { questionId:q.id, choice:0, lock:true }, as(players(state)[0]));
  const events = allEventsOf(state);
  const pill = directorPill(state, events, resolveDirector(state, events));
  assert.deepEqual([pill.type, pill.label], ["trivia-reveal", "Reveal"]);
  assert.ok(pill.lines.includes(`1 of ${players(state).length} locked in`), JSON.stringify(pill.lines));
  assert.deepEqual(pill.run, { write:"triviaReveal", payload:{ questionId:q.id } });
});

test("the autopilot: each beat's time, an early reveal once everyone is in, and the game played to its result", () => {
  const state = ready([BANK, { ...CUSTOM, questions:CUSTOM.questions.slice(0, 2) }], { start:true });
  const game = state.trivia;
  const q1 = current(state);
  const t1 = game.times[q1.id];
  let beat = triviaAutoBeat(state);
  assert.deepEqual(beat, { at:t1.closesAt + TRIVIA_GRACE_MS, type:"triviaReveal", payload:{ questionId:q1.id },
    key:`trivia:${game.id}:${q1.id}:reveal` }, "the clock and its grace");
  /* everyone in the room locks early: the reveal comes a beat after the last lock, never before the clock starts */
  const room = players(state);
  room.slice(0, -1).forEach(player => act(state, "triviaPick", { questionId:q1.id, choice:q1.answer, lock:true }, as(player)));
  assert.equal(triviaAutoBeat(state).at, t1.closesAt + TRIVIA_GRACE_MS, "one still thinking");
  state.away = { [room.at(-1)]:{ at:1 } };
  assert.equal(triviaAutoBeat(state).at, t1.startsAt, "an away player is not waited for; locks during the lead wait for the clock");
  state.away = {};
  at(t1.startsAt + 4000, () => act(state, "triviaPick", { questionId:q1.id, choice:0, lock:true }, as(room.at(-1))));
  beat = triviaAutoBeat(state);
  assert.equal(beat.at, t1.startsAt + 4000 + TRIVIA_ALL_IN_MS);
  /* an early alarm, or a beat the commissioner already took, changes nothing */
  const before = JSON.stringify(state.trivia);
  assert.equal(at(beat.at - 2000, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.stale, true);
  assert.equal(JSON.stringify(state.trivia), before);
  at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key)));
  assert.equal(state.trivia.phase, "reveal");
  assert.equal(at(beat.at + 10, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.unchanged, true, "a retried beat");
  beat = triviaAutoBeat(state);
  assert.deepEqual([beat.type, beat.at], ["triviaNext", state.trivia.times[q1.id].revealedAt + TRIVIA_REVEAL_HOLD_MS]);
  /* the commissioner skips ahead: the old beat is stale */
  act(state, "triviaNext", { questionId:q1.id });
  assert.equal(at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key))).extra.stale, true);
  assert.equal(state.trivia.index, 1, "the room moved once");
  /* run the rest on the autopilot alone, at each beat's own time */
  const seen = [];
  for (let guard = 0; guard < 30; guard++) {
    beat = triviaAutoBeat(state);
    if (!beat) break;
    seen.push(beat.type);
    const q = current(state);
    if (beat.type === "triviaReveal") {
      assert.equal(beat.at, state.trivia.times[q.id].closesAt + TRIVIA_GRACE_MS);
      at(state.trivia.times[q.id].startsAt + 1000, () => act(state, "triviaPick", q.format === "number"
        ? { questionId:q.id, value:q.answer + 3 } : { questionId:q.id, choice:q.answer }, as(room[1])));
    }
    if (beat.type === "triviaNext" && state.trivia.phase === "reveal" && q.format === "number")
      assert.equal(beat.at, state.trivia.times[q.id].revealedAt + TRIVIA_NUMBER_REVEAL_HOLD_MS, "a closest number holds longer");
    if (beat.type === "triviaNext" && state.trivia.phase === "board") assert.equal(beat.at, state.trivia.boardAt + TRIVIA_BOARD_HOLD_MS);
    if (beat.type === "triviaFinish") assert.equal(beat.at, state.trivia.boardAt + TRIVIA_FINAL_HOLD_MS);
    at(beat.at, () => act(state, beat.type, beat.payload, auto(beat.key)));
  }
  assert.deepEqual(seen, ["triviaReveal", "triviaBoard", "triviaNext", "triviaReveal", "triviaNext", "triviaReveal", "triviaBoard",
    "triviaFinish"]);
  assert.ok(state.results.trivia, "the autopilot posts the result");
  assert.equal(state.results.trivia.slots[0].length, 1);
  assert.equal(triviaAutoBeat(state), null);
});

test("privacy: no answer, later question or other player's pick reaches a phone before its reveal", () => {
  const state = ready();
  assert.equal(publicState(state, { player:"Evan" }).trivia, null);
  assert.deepEqual(publicState(state, { player:"Evan" }).triviaRounds, [], "the set list is the commissioner's");
  act(state, "triviaStart", { evId:"trivia" });
  const q = current(state);
  const [me, them] = players(state);
  act(state, "triviaPick", { questionId:q.id, choice:2 }, as(me));
  act(state, "triviaPick", { questionId:q.id, choice:1, lock:true }, as(them));
  const phone = publicState(state, { player:me }).trivia;
  assert.equal(phone.questions.length, 1, "only the question up");
  assert.equal(phone.questions[0].answer, undefined, "no answer before the reveal");
  assert.deepEqual(phone.picks[q.id][me], state.trivia.picks[q.id][me], "your own live pick");
  assert.deepEqual(phone.picks[q.id][them], { locked:true, set:true }, "another player: locked or not, never what");
  assert.equal(phone.total, 6);
  assert.equal(phone.ops, undefined);
  const text = JSON.stringify(publicState(state, { player:me }));
  for (const later of state.trivia.questions.slice(1)) if (later.text) assert.ok(!text.includes(later.text), "no later question");
  assert.ok(!text.includes("Mr. Brightside") && !text.includes("Big Sur"), "no later answers, no tune names");
  const tv = publicState(state, {}).trivia;
  assert.deepEqual(tv.picks[q.id][me], { locked:false, set:true }, "the TV sees who has answered, never what");
  /* the commissioner playing plays it blind; one watching sees it all */
  const blind = publicState(state, { isGm:true, player:me });
  assert.equal(blind.trivia.questions[0].answer, undefined);
  assert.deepEqual(blind.trivia.picks[q.id][them], { locked:true, set:true });
  assert.equal(blind.triviaRounds.length, 2, "the desk keeps his own set list");
  const full = publicState(state, { isGm:true, player:null }).trivia;
  assert.equal(full.questions.length, 6);
  assert.equal(full.questions[0].answer, state.trivia.questions[0].answer);
  assert.equal(full.ops, undefined);
  act(state, "triviaReveal", { questionId:q.id });
  const after = publicState(state, { player:them }).trivia;
  assert.equal(after.questions[0].answer, state.trivia.questions[0].answer);
  assert.equal(after.picks[q.id][me].choice, 2, "every pick once revealed");
  assert.deepEqual(projectTrivia(null, [], { player:"Evan" }), { trivia:null, triviaRounds:[] });
  /* a tune never names its recording to a guest, even revealed */
  act(state, "triviaNext", { questionId:q.id });
  act(state, "triviaReveal", { questionId:current(state).id });
  act(state, "triviaBoard", { questionId:current(state).id });
  for (let i = 0; i < 4; i++) {
    act(state, "triviaNext", { questionId:current(state).id });
    act(state, "triviaReveal", { questionId:current(state).id });
  }
  assert.equal(current(state).format, "tune");
  const tune = publicState(state, { player:"Evan" }).trivia.questions.at(-1);
  assert.equal(tune.clip, undefined);
});

test("the bank lives only in the Worker: nothing under src/ or shared/ imports it", () => {
  const walk = dir => readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  const offenders = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "shared"))]
    .filter(file => /\.(m?js|jsx)$/.test(file))
    .filter(file => /(from\s*|import\(\s*)["'][^"']*(triviaBank|worker\/trivia)(\.js)?["']/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
  /* and no bank question is written into a client file */
  const client = walk(path.join(ROOT, "src")).filter(file => /\.(m?js|jsx)$/.test(file)).map(file => readFileSync(file, "utf8")).join("\n");
  for (const category of TRIVIA_BANK)
    for (const question of category.questions.filter(item => item.text))
      assert.ok(!client.includes(question.text), `${question.id} is in a client file`);
  /* every bank question deals cleanly */
  for (const category of TRIVIA_BANK) for (const question of category.questions) {
    const { id, ...rest } = question;
    const checked = cleanTriviaQuestion({ ...rest, id:"qbankcheck", ...(question.format === "number"
      ? { digits:Math.max(4, String(question.answer).length) } : {}) });
    assert.equal(checked.error, undefined, `${id}: ${checked.error}`);
  }
});

test("a progress reset keeps the set list and clears the game; Restart drops the answers", () => {
  const state = ready([BANK, CUSTOM], { start:true });
  act(state, "triviaRestart", { evId:"trivia" });
  assert.equal(state.trivia, null);
  assert.equal(state.triviaRounds.length, 2);
  act(state, "triviaStart", { evId:"trivia" });
  act(state, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(state.trivia, null);
  assert.equal(state.triviaRounds.length, 2);
});

test("QA: a jump through Trivia plays the configured game for real; Sim answers is QA only", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "triviaSaveRound", { round:BANK });
  act(state, "qaAdvance", { target:"event:trivia:done", seed:3 });
  assert.ok(state.results.trivia);
  assert.equal(state.trivia.eventId, "trivia");
  assert.ok(state.trivia.finishedAt, "the game posted the result");
  assert.deepEqual(state.results.trivia.slots[0], [triviaStandings(state.trivia)[0].player]);
  const live = ready([BANK, CUSTOM], { start:true });
  assert.equal(refuse(live, "triviaSimAnswers", { questionId:current(live).id }, { ...gm(), qa:false }), "QA is unavailable");
  act(live, "triviaSimAnswers", { questionId:current(live).id });
  assert.ok(players(live).every(player => live.trivia.picks[current(live).id][player]?.locked));
  assert.equal(refuse(live, "triviaSimAnswers", { questionId:current(live).id }), "Everyone has locked in");
});

test("HTTP: the commissioner uploads and reads; a photo is served once its question is up; clips come from the Worker", async () => {
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
  const calls = [];
  tournament.previewFetch = async url => {
    calls.push(String(url));
    return Response.json({ data:[{ preview:"https://cdnt-preview.dzcdn.net/stream/c-1.mp3" }] });
  };
  const exif = [0xFF, 0xE1, 0x00, 0x11, ...Buffer.from("GPS 37.8 -122.4")];
  const sof = [0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x02, 0x58, 0x03, 0x20, 0x01, 0x01, 0x11, 0x00];
  const jpeg = new Uint8Array([0xFF, 0xD8, ...exif, ...sof, 0xFF, 0xDA, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xFF, 0xD9]);
  const call = (pathname, { token = null, method = "GET", body } = {}) => tournament.fetch(new Request(`http://localhost${pathname}`,
    { method, headers:token ? { Authorization:`Bearer ${token}` } : {}, body }));
  const form = () => { const data = new FormData(); data.append("photo", new Blob([jpeg], { type:"image/jpeg" }), "photo.jpg"); return data; };
  assert.equal((await call("/api/trivia/photo", { method:"POST", body:form() })).status, 403);
  const uploaded = await (await call("/api/trivia/photo", { method:"POST", token:"gm", body:form() })).json();
  assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
  assert.ok(!Buffer.from([...entries].find(([key]) => key.startsWith("moment:trivia:"))[1]).includes("GPS"), "EXIF stripped");
  const photoPath = `/api/trivia/photo/${uploaded.photo.id}`;
  assert.equal((await call(photoPath)).status, 404, "not shown yet: the commissioner only");
  assert.equal((await call(photoPath, { token:"gm" })).status, 200);
  assert.equal((await call("/api/trivia/bank")).status, 403);
  const bank = await (await call("/api/trivia/bank", { token:"gm" })).json();
  assert.ok(bank.categories.length >= 8 && bank.categories.every(category => category.questions.length >= 10));
  tournament.state.trivia = { id:"tgx", eventId:"trivia", index:0, phase:"question", players:[], rounds:[],
    questions:[{ id:"tgx-1", format:"picture", photo:uploaded.photo, options:["a", "b", "c", "d"], answer:0 },
      { id:"tgx-2", format:"tune", options:[], answer:0, clip:{ title:"Mr. Brightside", artist:"The Killers" } }] };
  assert.equal((await call(photoPath)).status, 200, "on the TV now: anyone");
  assert.equal((await call("/api/trivia/clip/tgx-2")).status, 404, "a tune not up yet is nobody's");
  tournament.state.trivia.index = 1;
  const clip = await (await call("/api/trivia/clip/tgx-2")).json();
  assert.deepEqual(clip, { ok:true, url:"https://cdnt-preview.dzcdn.net/stream/c-1.mp3" });
  assert.ok(calls.every(url => url.startsWith("https://api.deezer.com/")), "Deezer only, through the stub");
  const check = await (await call("/api/trivia/clip?title=Africa&artist=Toto", { token:"gm" })).json();
  assert.equal(check.ok, true);
  assert.equal((await call("/api/trivia/clip?title=Africa&artist=Toto")).status, 403);
});

test("the phone and the TV: the game opens for every player, your pick lit, the room lighting as it locks; gone once posted", async () => {
  const { buildSync } = await import("esbuild");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = buildSync({ stdin:{ contents:'export { TriviaHome, TriviaPlaySheet } from "./src/features/trivia/TriviaPlay.jsx"; export { TVTrivia } from "./src/features/tv/TVTrivia.jsx"; export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";', resolveDir:ROOT, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("trivia-ui.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  const { TriviaHome, TriviaPlaySheet, TVTrivia, PlayerIdentityProvider } = mod.exports;
  const wrap = (s, node) => renderToStaticMarkup(React.createElement(PlayerIdentityProvider, { profiles:s.profiles || {} }, node));
  const state = ready([BANK], { start:true });
  const q = current(state);
  const [a, b, c] = players(state);
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a));
  act(state, "triviaPick", { questionId:q.id, choice:q.answer, lock:true }, as(b));
  const now = state.trivia.times[q.id].startsAt + 5000;
  const phone = player => publicState(state, { player });
  const sheet = (player, s = phone(player)) => wrap(s, React.createElement(TriviaPlaySheet, { state:s, me:player, now, onPick:async () => ({ ok:true }) }));
  const html = sheet(a);
  assert.match(html, /fd-trivia-game is-question/);
  assert.equal((html.match(/class="fd-trivia-option( [^"]*)?"/g) || []).length, 4);
  assert.match(html, /fd-trivia-option is-picked/, "your own pick is lit");
  assert.match(html, />Lock in</);
  const seated = players(state).length;
  assert.match(html, new RegExp(`class="fd-trivia-room" aria-label="1 of ${seated} locked in"`), "the room's chips light as each locks");
  assert.match(sheet(c), /fd-trivia-game is-question/, "it opens for every player, not just some");
  /* a spectator (away) opens it from Home, not by itself */
  const watching = { ...structuredClone(state), away:{ [c]:{ at:1 } } };
  assert.equal(sheet(c, publicState(watching, { player:c })), "");
  assert.match(wrap(phone(a), React.createElement(TriviaHome, { state:phone(a), me:a, now, onOpen() {} })), /fd-trivia-home/);
  const tvQuestion = wrap(publicState(state, {}), React.createElement(TVTrivia, { state:publicState(state, {}), now }));
  assert.match(tvQuestion, /tv-trivia is-question/);
  assert.equal((tvQuestion.match(/tv-trivia-room-name/g) || []).length, seated, "the room on the TV: every player");
  assert.equal((tvQuestion.match(/<li class="is-locked">/g) || []).length, 1, "lit as they lock, never what");
  act(state, "triviaReveal", { questionId:q.id });
  const reveal = sheet(a);
  assert.match(reveal, /fd-trivia-option is-picked is-wrong|fd-trivia-option is-picked is-right/);
  assert.match(reveal, /fd-trivia-tally/, "how many chose each answer");
  assert.match(reveal, /fd-trivia-standings/);
  const tvReveal = wrap(publicState(state, {}), React.createElement(TVTrivia, { state:publicState(state, {}), now }));
  assert.match(tvReveal, /tv-trivia-tally/);
  assert.match(tvReveal, /tv-trivia-faces/, "faces on the right answer");
  act(state, "triviaNext", { questionId:q.id });
  act(state, "triviaPick", { questionId:current(state).id, value:300, lock:true }, as(a));
  act(state, "triviaReveal", { questionId:current(state).id });
  act(state, "triviaBoard", { questionId:current(state).id });
  assert.match(wrap(publicState(state, {}), React.createElement(TVTrivia, { state:publicState(state, {}), now })), /tv-trivia-podium/);
  assert.match(sheet(a), /fd-trivia-standings/);
  act(state, "triviaFinish", { evId:"trivia" });
  assert.equal(sheet(a), "", "the game's sheet does not reopen once the result posts");
  assert.equal(wrap(phone(a), React.createElement(TriviaHome, { state:phone(a), me:a, now, onOpen() {} })), "");
  /* a game saved in the old team shape renders and runs nothing until Restart */
  const legacy = ready([BANK], { start:true });
  const old = legacy.trivia;
  delete old.players;
  old.teams = [{ key:0, name:"Brains", players:[a, b, c] }];
  old.picks = { [current(legacy).id]:{ 0:{ choice:1, by:a, locked:true, lockedAt:1 } } };
  assert.equal(triviaAutoBeat(legacy), null);
  assert.doesNotThrow(() => wrap(publicState(legacy, { player:a }), React.createElement(TriviaPlaySheet,
    { state:publicState(legacy, { player:a }), me:a, now, initiallyOpen:true })));
  assert.doesNotThrow(() => wrap(publicState(legacy, {}), React.createElement(TVTrivia, { state:publicState(legacy, {}), now })));
  assert.equal(refuse(legacy, "triviaPick", { questionId:current(legacy).id, choice:0 }, as(a)), "You are not playing");
  act(legacy, "triviaRestart", { evId:"trivia" });
  assert.equal(legacy.trivia, null);
});
