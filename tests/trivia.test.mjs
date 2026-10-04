/* Trivia: four teams of three answer on their phones, one shared answer per
   team, scored for being right and for being fast; closest-number questions
   score by distance. The commissioner builds the set list from the bank and
   his own questions and runs it from the pill; the result posts through the
   ordinary result write. Answers, upcoming questions and other teams' picks
   never reach a phone early, and the bank never ships to a client. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, computeStandings, resolveCurrentContest } from "../shared/core.js";
import {
  TRIVIA_GRACE_MS, TRIVIA_LEAD_MS, TRIVIA_MS, cleanTriviaQuestion, projectTrivia, scoreQuestion, speedBonus, triviaBeat,
  triviaResultSlots, triviaStandings,
} from "../shared/trivia.js";
import { TRIVIA_BANK } from "../worker/triviaBank.js";
import { publicState } from "../worker/publicState.js";
import { resolveDirector } from "../shared/show.js";
import { applyAction } from "./support/confirmed-start.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = (player = null) => ({ ...GM, player, deviceId:"gm", actionId:`g${++serial}` });
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

/* a room at Trivia, under way, with the set list saved */
function ready(rounds = [BANK, CUSTOM]) {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
  for (const round of rounds) act(state, "triviaSaveRound", { round:structuredClone(round) });
  const contest = resolveCurrentContest(state, trivia(state));
  act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
  return state;
}
const current = state => state.trivia.questions[state.trivia.index];
const team = (state, key) => state.trivia.teams[key];

test("scoring: right answers score 500 plus up to 500 for speed; closest number by distance", () => {
  assert.equal(speedBonus(20000, 20000), 500);
  assert.equal(speedBonus(10000, 20000), 250);
  assert.equal(speedBonus(0, 20000), 0);
  assert.equal(speedBonus(-500, 20000), 0, "a lock in the grace scores no bonus");
  const teams = [0, 1, 2, 3].map(key => ({ key, players:[`p${key}`] }));
  const time = { startsAt:1000, closesAt:21000 };
  const choice = { id:"q", format:"choice", answer:2 };
  const scored = scoreQuestion(choice, {
    0:{ choice:2, locked:true, lockedAt:6000 },
    1:{ choice:2 },
    2:{ choice:1, locked:true, lockedAt:2000 },
  }, teams, time);
  assert.deepEqual([scored[0].points, scored[0].bonus], [880, 380], "locked with 15 of 20 s left (to the nearest 10)");
  assert.deepEqual([scored[1].points, scored[1].bonus], [500, 0], "never locked: counted at the deadline, no bonus");
  assert.equal(scored[2].points, 0);
  assert.equal(scored[3].answered, false);
  const number = { id:"n", format:"number", answer:1000 };
  const near = scoreQuestion(number, { 0:{ value:1000 }, 1:{ value:990 }, 2:{ value:1010 }, 3:{ value:700 } }, teams, time);
  assert.deepEqual([0, 1, 2, 3].map(key => near[key].points), [1250, 500, 500, 0], "exact, then a tie for second shares it");
  const tied = scoreQuestion(number, { 0:{ value:995 }, 1:{ value:1005 }, 2:{ value:900 } }, teams, time);
  assert.deepEqual([0, 1, 2].map(key => tied[key].points), [1000, 1000, 500], "a tie for nearest shares 1st; the next is 2nd");
});

test("standings break a tie on the faster scoring answers; the result is one team, then the next two ranks", () => {
  const game = { index:0, phase:"reveal", teams:[0, 1, 2, 3].map(key => ({ key, name:`T${key}`, players:[`a${key}`, `b${key}`] })),
    questions:[{ id:"q1", format:"choice", answer:0 }], times:{ q1:{ startsAt:0, closesAt:20000 } },
    picks:{ q1:{ 0:{ choice:0, locked:true, lockedAt:10000 }, 1:{ choice:0, locked:true, lockedAt:10000 }, 2:{ choice:1 } } } };
  const rows = triviaStandings(game);
  assert.deepEqual(rows.map(row => [row.key, row.total, row.rank]), [[0, 750, 1], [1, 750, 1], [2, 0, 3], [3, 0, 3]]);
  game.picks.q1[1].lockedAt = 9990;
  assert.deepEqual(triviaStandings(game).map(row => row.key).slice(0, 2), [1, 0], "the faster lock wins the tie");
  const slots = triviaResultSlots(triviaStandings(game));
  assert.deepEqual(slots, [["a1", "b1"], ["a0", "b0"], ["a2", "b2"]], "a team that never answered places nowhere");
});

test("the set list: commissioner only, bank picks and his own questions, checked; locked while a game runs", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.equal(refuse(state, "triviaSaveRound", { round:BANK }, as("Evan")), "Commissioner only");
  assert.equal(refuse(state, "triviaSaveRound", { round:{ ...BANK, category:"nope" } }), "No such category");
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
  const playing = ready();
  act(playing, "triviaStart", { evId:"trivia" });
  assert.match(refuse(playing, "triviaSaveRound", { round:{ ...BANK, picks:["sports-02"] } }), /Restart the game/);
});

test("the game copies its questions in: bank options dealt fresh with the answer following, teams from the draw", () => {
  const state = ready();
  assert.match(refuse(structuredClone(EMPTY_STATE), "triviaStart", { evId:"trivia" }), /Lock and start/);
  act(state, "triviaStart", { evId:"trivia" });
  const game = state.trivia;
  assert.equal(game.questions.length, 6);
  assert.deepEqual(game.rounds.map(round => [round.name, round.first, round.count]), [["Sports", 0, 2], ["The groom", 2, 4]]);
  const bankQ = TRIVIA_BANK.find(category => category.id === "sports").questions[0];
  assert.equal(game.questions[0].options[game.questions[0].answer], bankQ.options[0], "the answer follows its option");
  assert.deepEqual(game.teams.map(item => item.players), state.draws.trivia.teams.map(item => item.players));
  const time = game.times[game.questions[0].id];
  assert.equal(time.startsAt - time.openedAt, TRIVIA_LEAD_MS);
  assert.equal(time.closesAt - time.startsAt, TRIVIA_MS.choice);
  assert.equal(game.questions[5].clip.title, "Mr. Brightside", "a tune names the recording it plays");
  assert.equal(act(state, "triviaStart", { evId:"trivia" }).extra.unchanged, true);
});

test("one shared answer: any teammate sets or changes it, any teammate locks it, and then it stays", () => {
  const state = ready();
  act(state, "triviaStart", { evId:"trivia" });
  const q = current(state);
  const [a, b, c] = team(state, 0).players;
  const outsider = team(state, 1).players[0];
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a));
  assert.deepEqual([state.trivia.picks[q.id][0].choice, state.trivia.picks[q.id][0].by], [1, a]);
  act(state, "triviaPick", { questionId:q.id, choice:3 }, as(b));
  assert.deepEqual([state.trivia.picks[q.id][0].choice, state.trivia.picks[q.id][0].by], [3, b], "a teammate moves the pick");
  assert.equal(act(state, "triviaPick", { questionId:q.id, choice:3 }, as(c)).extra.unchanged, true, "the same answer changes nothing");
  act(state, "triviaPick", { questionId:q.id, lock:true }, as(c));
  const locked = state.trivia.picks[q.id][0];
  assert.deepEqual([locked.choice, locked.locked, locked.lockedBy, locked.by], [3, true, c, b]);
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(a)), "Your team locked in");
  assert.equal(act(state, "triviaPick", { questionId:q.id, choice:3, lock:true }, as(a)).extra.unchanged, true,
    "a retried lock is acknowledged");
  assert.equal(state.trivia.picks[q.id][1], undefined, "another team's answer is its own");
  act(state, "triviaPick", { questionId:q.id, choice:0 }, as(outsider));
  assert.equal(state.trivia.picks[q.id][1].choice, 0);
  const crew = state.draws.trivia.roles?.[0]?.player;
  if (crew) assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(crew)), "You are not on a team");
  assert.equal(refuse(state, "triviaPick", { questionId:"tgstale-1", choice:0 }, as(a)), "That question is closed");
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, lock:true }, as(team(state, 2).players[0])), "Pick an answer first");
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:4 }, as(team(state, 2).players[0])), "Pick an answer");
  state.away = { [team(state, 3).players[0]]:{ at:1 } };
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(team(state, 3).players[0])), "You are marked away");
});

test("a retried pick never undoes a teammate's newer one", () => {
  const state = ready();
  act(state, "triviaStart", { evId:"trivia" });
  const q = current(state);
  const [a, b] = team(state, 0).players;
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a, "tap-1"));
  act(state, "triviaPick", { questionId:q.id, choice:2 }, as(b, "tap-2"));
  assert.equal(act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a, "tap-1")).extra.unchanged, true);
  assert.equal(state.trivia.picks[q.id][0].choice, 2);
  assert.ok(!JSON.stringify(publicState(state, { player:a })).includes("tap-1"), "the retry ledger never leaves the server");
});

test("timing: picks land through the grace after the clock, a late lock scores no bonus, then the question closes", () => {
  const state = ready();
  act(state, "triviaStart", { evId:"trivia" });
  const q = current(state);
  const time = state.trivia.times[q.id];
  const real = Date.now;
  try {
    Date.now = () => time.closesAt + TRIVIA_GRACE_MS - 10;
    act(state, "triviaPick", { questionId:q.id, choice:q.answer, lock:true }, as(team(state, 0).players[0]));
    assert.equal(state.trivia.picks[q.id][0].lockedAt, time.closesAt, "a lock in the grace counts at the deadline");
    Date.now = () => time.closesAt + TRIVIA_GRACE_MS + 10;
    assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(team(state, 1).players[0])), "Time is up");
  } finally { Date.now = real; }
  act(state, "triviaReveal", { questionId:q.id });
  assert.equal(refuse(state, "triviaPick", { questionId:q.id, choice:0 }, as(team(state, 1).players[0])), "That question is closed");
  const scores = scoreQuestion(state.trivia.questions[0], state.trivia.picks[q.id], state.trivia.teams, state.trivia.times[q.id]);
  assert.deepEqual([scores[0].points, scores[0].bonus], [500, 0]);
});

test("the director runs it: start, reveal, next, scores at a round's end, final scores, post result", () => {
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
      state.trivia.teams.forEach((item, i) => act(state, "triviaPick", q.format === "number"
        ? { questionId:q.id, value:q.answer + i * 10, lock:i % 2 === 0 } : { questionId:q.id, choice:i % 2 ? (q.answer + 1) % 4 : q.answer,
          lock:true }, as(item.players[0])));
      assert.match(refuse(state, "triviaNext", { questionId:q.id }), /Reveal this question first/);
      act(state, "triviaReveal", { questionId:beat.questionId });
    } else if (beat.type === "trivia-board") act(state, "triviaBoard", { questionId:beat.questionId });
    else if (beat.type === "trivia-next") act(state, "triviaNext", { questionId:beat.questionId });
    else if (beat.type === "trivia-finish") {
      const winner = triviaStandings(state.trivia)[0];
      const before = computeStandings(state).find(row => row.player === winner.players[0]);
      const done = act(state, "triviaFinish", { evId:"trivia" });
      assert.deepEqual(state.results.trivia.slots[0], winner.players);
      assert.deepEqual(done.extra.slots, state.results.trivia.slots);
      const after = computeStandings(state).find(row => row.player === winner.players[0]);
      /* a leader bounty (v3.1) may ride on the same result */
      assert.equal(after.pts - (after.bountyPts - before.bountyPts), before.pts + 1600, "the payout follows");
      assert.ok(state.mvp.trivia, "a winning team of three votes its MVP");
    }
  }
  assert.deepEqual(beats, ["Reveal", "Next question", "Reveal", "Scores", "Next round", "Reveal", "Next question", "Reveal",
    "Next question", "Reveal", "Next question", "Reveal", "Final scores", "Post result"]);
  assert.equal(triviaBeat(state, trivia(state)), null, "nothing left to direct");
  assert.match(refuse(state, "triviaRestart", { evId:"trivia" }), /Clear the result/);
});

test("privacy: no answer, later question or other team's pick reaches a phone before its reveal", () => {
  const state = ready();
  assert.equal(publicState(state, { player:"Evan" }).trivia, null);
  assert.deepEqual(publicState(state, { player:"Evan" }).triviaRounds, [], "the set list is the commissioner's");
  act(state, "triviaStart", { evId:"trivia" });
  const q = current(state);
  const mine = team(state, 0), theirs = team(state, 1);
  act(state, "triviaPick", { questionId:q.id, choice:2 }, as(mine.players[1]));
  act(state, "triviaPick", { questionId:q.id, choice:1, lock:true }, as(theirs.players[0]));
  const phone = publicState(state, { player:mine.players[0] }).trivia;
  assert.equal(phone.questions.length, 1, "only the question up");
  assert.equal(phone.questions[0].answer, undefined, "no answer before the reveal");
  assert.deepEqual(phone.picks[q.id][0], state.trivia.picks[q.id][0], "your team's live pick, and who set it");
  assert.deepEqual(phone.picks[q.id][1], { locked:true, set:true }, "another team: locked or not, never what");
  assert.equal(phone.total, 6);
  const text = JSON.stringify(publicState(state, { player:mine.players[0] }));
  for (const later of state.trivia.questions.slice(1)) if (later.text) assert.ok(!text.includes(later.text), "no later question");
  assert.ok(!text.includes("Mr. Brightside") && !text.includes("Big Sur"), "no later answers, no tune names");
  const tv = publicState(state, {}).trivia;
  assert.deepEqual(tv.picks[q.id][0], { locked:false, set:true }, "the TV sees who has answered, never what");
  /* the commissioner on a team plays it blind; one watching sees it all */
  const blind = publicState(state, { isGm:true, player:mine.players[0] });
  assert.equal(blind.trivia.questions[0].answer, undefined);
  assert.equal(blind.triviaRounds.length, 2, "the desk keeps his own set list");
  const full = publicState(state, { isGm:true, player:null }).trivia;
  assert.equal(full.questions.length, 6);
  assert.equal(full.questions[0].answer, state.trivia.questions[0].answer);
  assert.equal(full.ops, undefined);
  act(state, "triviaReveal", { questionId:q.id });
  const after = publicState(state, { player:theirs.players[1] }).trivia;
  assert.equal(after.questions[0].answer, state.trivia.questions[0].answer);
  assert.equal(after.picks[q.id][0].choice, 2, "every team's pick once revealed");
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
  const state = ready();
  act(state, "triviaStart", { evId:"trivia" });
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
  assert.deepEqual(state.results.trivia.slots[0], triviaStandings(state.trivia)[0].players);
  const live = ready();
  act(live, "triviaStart", { evId:"trivia" });
  assert.equal(refuse(live, "triviaSimAnswers", { questionId:current(live).id }, { ...gm(), qa:false }), "QA is unavailable");
  act(live, "triviaSimAnswers", { questionId:current(live).id });
  assert.ok(live.trivia.teams.every(item => live.trivia.picks[current(live).id][item.key]?.locked));
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
    async transaction(fn) { return fn(storage); }, async setAlarm() {},
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
  tournament.state.trivia = { id:"tgx", eventId:"trivia", index:0, phase:"question", teams:[], rounds:[],
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

test("the phone: the game opens for a player on a team, follows the shared pick, and is gone once the result posts", async () => {
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
  const state = ready([BANK]);
  act(state, "triviaStart", { evId:"trivia" });
  const q = current(state);
  const [a, b] = team(state, 0).players;
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(b));
  const now = state.trivia.times[q.id].startsAt + 5000;
  const phone = player => publicState(state, { player });
  const sheet = (player, s = phone(player)) => wrap(s, React.createElement(TriviaPlaySheet, { state:s, me:player, now, onPick:async () => ({ ok:true }) }));
  const html = sheet(a);
  assert.match(html, /fd-trivia-game is-question/);
  assert.equal((html.match(/class="fd-trivia-option( [^"]*)?"/g) || []).length, 4);
  assert.match(html, /fd-trivia-option is-picked/, "the team's pick, set by a teammate, is lit on your phone");
  assert.match(html, /fd-trivia-setter/, "with the face of who set it");
  assert.match(html, />Lock in</);
  const crew = state.draws.trivia.roles?.[0]?.player;
  if (crew) assert.equal(sheet(crew), "", "a spectator opens it from Home, not by itself");
  assert.match(wrap(phone(a), React.createElement(TriviaHome, { state:phone(a), me:a, now, onOpen() {} })), /fd-trivia-home/);
  assert.match(wrap(publicState(state, {}), React.createElement(TVTrivia, { state:publicState(state, {}), now })), /tv-trivia is-question/);
  act(state, "triviaReveal", { questionId:q.id });
  assert.match(sheet(a), /fd-trivia-option is-picked is-wrong|is-right/);
  act(state, "triviaNext", { questionId:q.id });
  act(state, "triviaPick", { questionId:current(state).id, value:300, lock:true }, as(a));
  act(state, "triviaReveal", { questionId:current(state).id });
  act(state, "triviaBoard", { questionId:current(state).id });
  assert.match(wrap(publicState(state, {}), React.createElement(TVTrivia, { state:publicState(state, {}), now })), /tv-trivia-podium/);
  act(state, "triviaFinish", { evId:"trivia" });
  assert.equal(sheet(a), "", "the game's sheet does not reopen once the result posts");
  assert.equal(wrap(phone(a), React.createElement(TriviaHome, { state:phone(a), me:a, now, onOpen() {} })), "");
});
