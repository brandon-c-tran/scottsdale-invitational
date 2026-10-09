/* Trivia board fixtures (docs/TRIVIA-BOARD.md): board games built straight
   from the contract for the rehearsal page (dev/trivia-preview.jsx) and the
   fit audit (dev/fit/scenarios.js), while the server's board writes live on
   their own branch. The base is real (qaAdvance to Trivia, Lock and start
   through the real reducers); the board itself is dealt by the shared model
   (dealBoard, clueClock, buzzOrder) and its log written the way the writes
   would write it: a played history so the scores are a Saturday night's,
   then the moment asked for, every instant relative to `now`.

   boardStage(stage, { now, viewer }) -> state
     pick          the board up, someone else picking
     pick-mine     the viewer picking
     zoom          a cell flying up (0.5 s in)
     clue          the clue reading, the buzzers dark
     armed         the buzzers live, three in (the viewer not)
     armed-in      the same, the viewer in
     tune          a tune's clip playing, the buzzers live
     picture       a picture clue reading
     order         the buzzers closed, the order standing
     answer        the second in order answering, the first's answer struck
     answer-mine   the same, the viewer answering
     reveal        the second in order right, the value on their score
     dd-sting      the Daily Double's sting, the viewer's pick
     dd-wager      its wager, not yet locked (the viewer's)
     dd-clue       its clue, the viewer answering alone
     final-intro   the board clear, "Final" standing
     final-wager   the category, wagers locking (not the viewer's)
     final-clue    the Final's clue, picks locking (not the viewer's)
     final-reveal  the reveal mid-way: two turned, the third turning
     final-board   the final standings
   Pure apart from the reducers it calls; deterministic (a seeded stream). */
import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, presentPlayers, resolveCurrentContest } from "../../shared/core.js";
import {
  ANSWER_GAP_MS, BOARD_ZOOM_MS, BUZZ_SETTLE_MS, BUZZ_SHOW_MS, DD_STING_MS, FINAL_ANSWER_MS, FINAL_INTRO_MS, FINAL_WAGER_MS,
  MAX_ATTEMPTS, boardAutoBeat, buzzOrder, clueClock, dealBoard, finalMax, finalRevealSchedule, readMs, boardStandings,
} from "../../shared/triviaBoard.js";
import { applyAction } from "../../worker/actions.js";
import { TRIVIA_BANK } from "../../worker/triviaBank.js";

export const BOARD_FIT_VIEWER = "Richard";
const PICKER = "Evan";

/* the set list: five bank rounds and the commissioner's own, a seventh
   that will not fit the board, and his Final */
export const BOARD_FIT_ROUNDS = Object.freeze([
  { id:"tbfitsport", source:"bank", category:"sports", picks:["sports-01", "sports-02", "sports-06", "sports-09", "sports-04", "sports-10"] },
  { id:"tbfitscrn1", source:"bank", category:"screen", picks:["screen-03", "screen-05", "screen-01", "screen-07", "screen-11"] },
  { id:"tbfittune1", source:"bank", category:"tunes-2000s", picks:["tunes-2000s-01", "tunes-2000s-04", "tunes-2000s-05",
    "tunes-2000s-08", "tunes-2000s-11"] },
  { id:"tbfitgeo01", source:"bank", category:"geography", picks:["geography-08", "geography-04", "geography-01", "geography-06",
    "geography-11"] },
  { id:"tbfitaz001", source:"bank", category:"arizona", picks:["arizona-01", "arizona-06", "arizona-03", "arizona-04", "arizona-07"] },
  { id:"tbfitgroom", source:"custom", name:"The groom", questions:[
    { id:"qbfitgrm01", format:"choice", text:"Which of these did Brandon order the first time he took everyone to the diner after the fantasy draft in 2019?",
      options:["Chicken and waffles", "A patty melt with extra pickles", "Two breakfasts", "Nothing, he left early"], answer:1 },
    { id:"qbfitgrm02", format:"picture", text:"Where was this taken?", photo:{ id:"pbfitphoto01", w:1600, h:1200 },
      options:["Lake Tahoe", "Big Sur", "Zion", "Sedona"], answer:3 },
    { id:"qbfitgrm03", format:"choice", text:"What was the first concert Brandon went to?",
      options:["Blink-182", "Green Day", "Linkin Park", "Weezer"], answer:0 },
    { id:"qbfitgrm04", format:"tune", text:"", options:[{ title:"Mr. Brightside", artist:"The Killers" },
      { title:"Take Me Out", artist:"Franz Ferdinand" }, { title:"Somebody Told Me", artist:"The Killers" },
      { title:"The Middle", artist:"Jimmy Eat World" }], answer:0, clip:{ title:"Mr. Brightside", artist:"The Killers" } },
    { id:"qbfitgrm05", format:"choice", text:"How many fantasy titles has Brandon won?", options:["Two", "None", "One", "Three"], answer:1 },
    { id:"qbfitgrm06", format:"number", text:"How many miles is it from the house to Sky Harbor?", answer:18, unit:"miles", digits:4 },
  ] },
  { id:"tbfitmusic", source:"bank", category:"music", picks:["music-01", "music-03", "music-04", "music-05", "music-08"] },
  { id:"tbfitfinal", source:"final", category:"Landmarks", questions:[
    { id:"qbfitfinal", format:"choice", text:"The world's tallest building, the Burj Khalifa, stands in which city?",
      options:["Dubai", "Abu Dhabi", "Doha", "Riyadh"], answer:0 },
  ] },
]);

/* a seeded stream, so every screen and every run deals alike */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* four options in a fresh order, the answer following its option */
function deal(question, random) {
  if (!Array.isArray(question.options)) return question;
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...question, options:order.map(i => question.options[i]), answer:order.indexOf(question.answer) };
}
/* a set-list round as the questions a game plays (the Worker's roundQuestions) */
function roundOf(round, random) {
  if (round.source === "bank") {
    const category = TRIVIA_BANK.find(item => item.id === round.category);
    const byId = new Map(category.questions.map(question => [question.id, question]));
    const questions = round.picks.map(id => byId.get(id)).filter(Boolean).map(question => question.format === "tune"
      ? { ...question, clip:{ title:question.options[0].title, artist:question.options[0].artist } } : question);
    return { name:category.name, questions:questions.map(question => deal(question, random)) };
  }
  return { name:round.name, questions:round.questions.map(question => deal(structuredClone(question), random)) };
}

let serial = 0;
const gm = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:"Brandon", deviceId:"fit-board",
  actionId:`board-${++serial}`, showControl:false });
function run(state, type, payload) {
  const result = applyAction(state, type, payload, gm());
  if (!result.ok) throw new Error(`${type}: ${result.error}`);
}
/* Trivia live: betting locked and the event started, nothing in the app yet */
function base() {
  const state = structuredClone(EMPTY_STATE);
  run(state, "qaAdvance", { target:"event:trivia:open", seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true });
  const ev = allEventsOf(state).find(item => item.id === "trivia");
  const contest = resolveCurrentContest(state, ev);
  run(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision, startWeekend:true });
  return state;
}

/* the played history: [col, row], reactions in ms by player, and the
   answers down the buzz order (true right, false wrong, null out of time) */
const HISTORY = Object.freeze([
  { cell:[0, 0], buzz:{ Evan:312, Khoa:405, Richard:521 }, answers:[true] },
  { cell:[0, 1], buzz:{ Khoa:288, Sahil:349 }, answers:[false, true] },
  { cell:[1, 0], buzz:{ Richard:233, Evan:301, Adi:455 }, answers:[true] },
  { cell:[2, 0], buzz:{ Henry:402, Brandon:470 }, answers:[true] },
  { cell:[3, 0], buzz:{ Chinh:350, Jeremy:610 }, answers:[false, null] },
  { cell:[1, 1], buzz:{ Richard:260, Eyob:299 }, answers:[true] },
  { cell:[4, 0], buzz:{ Sahil:330 }, answers:[true] },
  { cell:[5, 0], buzz:{ Brandon:301, Ben:420 }, answers:[false, true] },
  { cell:[0, 2], buzz:{ Jeremy:280, Allan:390, Chiang:510 }, answers:[false, false, true] },
]);
/* the live clue's buzzers (the viewer is added where a moment needs them) */
const LIVE_BUZZ = Object.freeze({ Sahil:246, Chiang:318, Khoa:402 });
const LIVE_CELL = [1, 2];
/* a tune and a picture, for the clue's other faces */
const TUNE_CELL = [2, 2];
const PICTURE_CELL = [5, 1];
const DD_CELL = [3, 3];

const idAt = (game, [col, row]) => game.columns[col].clues[row];
/* a wrong pick that is not struck yet */
function wrongChoice(clue, log, k) {
  const struck = new Set(log.attempts.filter(a => Number.isInteger(a.choice)).map(a => a.choice));
  const options = [0, 1, 2, 3].filter(i => i !== clue.answer && !struck.has(i));
  return options[k % options.length];
}

/* a clue played to its end, its log written the way the writes write it */
function playClue(game, id, { at, by, buzz = {}, answers = [], wager = 0 }) {
  const clue = game.clues[id];
  const log = { by, auto:false, pickedAt:at, buzzes:{}, attempts:[] };
  game.played.push(id);
  game.log[id] = log;
  if (game.dd === id) {
    Object.assign(log, { wager, wagerAt:at + 5000, shownAt:at + 6000, order:[by], turn:0 });
    log.turnAt = log.shownAt + readMs(clue);
    const right = answers[0] === true;
    log.attempts.push({ player:by, choice:right ? clue.answer : wrongChoice(clue, log, 0), at:log.turnAt + 2600, right });
    log.revealedAt = log.turnAt + 2600;
    log.winner = right ? by : null;
    return log;
  }
  Object.assign(log, clueClock(clue, at));
  Object.entries(buzz).forEach(([player, ms]) => { log.buzzes[player] = { ms, at:log.armAt + ms + 90 }; });
  const firsts = Object.values(log.buzzes).map(item => item.at);
  log.closedAt = firsts.length ? Math.min(...firsts) + BUZZ_SETTLE_MS : log.openUntil;
  log.order = buzzOrder(log);
  if (!log.order.length) { log.revealedAt = log.closedAt; log.winner = null; return log; }
  log.turn = 0;
  log.turnAt = log.closedAt + BUZZ_SHOW_MS;
  let t = log.turnAt;
  const turns = Math.min(MAX_ATTEMPTS, log.order.length, answers.length);
  for (let i = 0; i < turns; i++) {
    const player = log.order[i], answer = answers[i];
    const timeout = answer === null;
    log.turn = i; log.turnAt = t;
    log.attempts.push({ player, choice:timeout ? null : answer ? clue.answer : wrongChoice(clue, log, i), at:t + 2100, right:answer === true,
      ...(timeout ? { timeout:true } : {}) });
    if (answer === true) { log.winner = player; log.revealedAt = t + 2100; return log; }
    t += 2100 + ANSWER_GAP_MS;
  }
  log.revealedAt = t;
  log.winner = null;
  return log;
}

/* every cell the history did not play, played on a seeded stream: about
   half the clues taken first time, a few struck, a few nobody knew */
function playRest(game, players, start, random) {
  let at = start, by = game.control;
  for (const column of game.columns) for (const id of column.clues) {
    if (game.played.includes(id)) continue;
    if (game.dd === id) {
      playClue(game, id, { at, by, answers:[random() < 0.6], wager:1000 });
    } else {
      const n = Math.floor(random() * 4);
      const buzz = {};
      for (let k = 0; k < n; k++) buzz[players[Math.floor(random() * players.length)]] = 200 + Math.floor(random() * 600);
      playClue(game, id, { at, by, buzz, answers:[random() < 0.55, random() < 0.6, true] });
    }
    by = game.log[id].winner || by;
    at += 26000;
  }
  game.control = by;
  return at;
}

/* the board game at the start, dealt from the set list */
function newGame(state, now, random) {
  const rounds = BOARD_FIT_ROUNDS.filter(round => round.source !== "final").map(round => roundOf(round, random));
  const dealt = dealBoard(rounds, { gameId:"tbfit", random });
  const final = BOARD_FIT_ROUNDS.find(round => round.source === "final");
  const finalQ = deal(final.questions[0], random);
  const game = {
    id:"tbfit01", eventId:"trivia", format:"board", startedAt:now - 15 * 60000, players:presentPlayers(state), questions:[],
    columns:dealt.columns, clues:dealt.clues, dd:null,
    final:{ id:finalQ.id, category:final.category, format:finalQ.format, text:finalQ.text, options:finalQ.options, answer:finalQ.answer },
    control:PICKER, phase:"pick", current:null, pickAt:now - 15 * 60000, played:[], log:{}, finalAt:{}, finalWagers:{}, finalPicks:{},
  };
  game.dd = idAt(game, DD_CELL);
  return game;
}

/* the history, the last clue's winner in control */
function history(game, now) {
  let at = now - 6 * 60000;
  for (const item of HISTORY) {
    const id = idAt(game, item.cell);
    playClue(game, id, { at, by:game.control, buzz:item.buzz, answers:item.answers });
    game.control = game.log[id].winner || game.control;
    at += 26000;
  }
  return at;
}

/* the live clue picked at `pickedAt` (its own clock from the pick) */
function pick(game, id, pickedAt) {
  game.played.push(id);
  game.current = id;
  game.phase = "clue";
  game.log[id] = { by:game.control, auto:false, pickedAt, buzzes:{}, attempts:[], ...clueClock(game.clues[id], pickedAt) };
  return game.log[id];
}

const FINAL_PICKS = Object.freeze([0, 0, 2, 0, 1, 0, 3, 0, 0, 2, 0, 1, 0]);

/* the desk before the game: the set list, the Board format, nothing dealt */
export function boardDeskStage() {
  const state = base();
  state.triviaFormat = "board";
  state.triviaRounds = structuredClone(BOARD_FIT_ROUNDS);
  return state;
}

/* ── the same game through the real writes (worker/triviaBoard.js) ──
   The set list saved and the format set by the desk's own writes, the board
   dealt by triviaStart, then played the way QA plays it (worker/qa.js
   playBoard): at each step the room's moves (boardSim, no actor: everyone),
   then the autopilot's next beat when its clock comes. Math.random runs on a
   seeded stream and Date.now on the run's own clock, so a build is the same
   every time; the game stops at the moment asked for and every stamp in it
   moves so that moment stands `ago` ms before `now`. */
const PLAYED = Object.freeze({
  /* the buzzers live, the room's buzzes in */
  armed:{ stop:game => game.phase === "clue" && Object.keys(game.log?.[game.current]?.buzzes || {}).length > 0, ago:500 },
  /* the first turn a second in */
  answer:{ stop:game => game.phase === "answer" && Number(game.log?.[game.current]?.turnAt) > 0, ago:BUZZ_SHOW_MS + 1000 },
  /* the right answer stamped */
  reveal:{ stop:game => game.phase === "reveal", ago:1500 },
  /* the board up, a few clues in */
  pick:{ stop:game => game.phase === "pick" && (game.played || []).length >= 8, ago:3000 },
  /* the Final's clue, the room's answers in */
  "final-clue":{ stop:game => game.phase === "final-clue" && Object.keys(game.finalPicks || {}).length > 0, ago:9000 },
  /* the Final turning */
  "final-reveal":{ stop:game => game.phase === "final-reveal", ago:6000 },
});
const autoCtx = key => ({ isGm:true, auto:true, player:null, deviceId:"autopilot", actionId:key, environment:"local" });
const simCtx = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:null, deviceId:"fit-board-sim",
  actionId:`board-sim-${++serial}` });
const readyAt = game => {
  const log = game.current ? game.log?.[game.current] : null;
  if (game.phase === "clue") return Number(log?.armAt) || 0;
  if (game.phase === "answer" || game.phase === "dd-clue") return Number(log?.turnAt) || 0;
  return 0;
};
/* every server stamp in the game (and the write time) moved by `by` ms */
function shiftStamps(node, by) {
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "number" && value > 1.6e12 && value < 2.2e12) node[key] = value + by;
    else if (value && typeof value === "object") shiftStamps(value, by);
  }
}
export function boardPlayed(moment = "armed", { now = Date.now(), seed = 1031 } = {}) {
  const spec = PLAYED[moment];
  if (!spec) throw new Error(`Unknown board moment ${moment}`);
  const state = base();
  const realNow = Date.now, realRandom = Math.random;
  let clock = now - 60 * 60000;
  Date.now = () => clock;
  Math.random = stream(seed);
  try {
    run(state, "triviaSetFormat", { format:"board" });
    BOARD_FIT_ROUNDS.filter(round => round.source !== "final")
      .forEach(round => run(state, "triviaSaveRound", { round:structuredClone(round) }));
    const final = BOARD_FIT_ROUNDS.find(round => round.source === "final");
    run(state, "triviaSaveFinal", { final:{ id:final.id, category:final.category, questions:structuredClone(final.questions) } });
    run(state, "triviaStart", { evId:"trivia" });
    let step = null;
    for (let guard = 0; guard < 3000; guard++) {
      const game = state.trivia;
      if (spec.stop(game)) break;
      const here = `${game.phase}:${game.current || ""}:${game.log?.[game.current]?.turn ?? ""}`;
      if (here !== step) {
        step = here;
        clock = Math.max(clock, readyAt(game));
        if (applyAction(state, "boardSim", {}, simCtx()).ok) continue;
      }
      const beat = boardAutoBeat(state);
      if (!beat || beat.type === "triviaFinish") break;
      clock = Math.max(clock, beat.at);
      const result = applyAction(state, beat.type, beat.payload, autoCtx(beat.key));
      if (!result.ok) throw new Error(`${beat.type}: ${result.error}`);
    }
    if (!spec.stop(state.trivia)) throw new Error(`The board never reached ${moment}`);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
  shiftStamps(state.trivia, now - spec.ago - clock);
  state.updatedAt = now;
  return state;
}

export function boardStage(stage = "pick", { now = Date.now(), viewer = BOARD_FIT_VIEWER } = {}) {
  const state = base();
  const random = stream(20261031);
  const game = newGame(state, now, random);
  state.trivia = game;
  state.triviaFormat = "board";
  state.triviaRounds = structuredClone(BOARD_FIT_ROUNDS);
  state.updatedAt = now;
  const players = game.players;
  history(game, now);
  game.pickAt = now - 4000;

  if (stage === "pick") return state;
  if (stage === "pick-mine") { game.control = viewer; return state; }

  const live = idAt(game, stage === "tune" ? TUNE_CELL : stage === "picture" ? PICTURE_CELL : LIVE_CELL);
  const clue = game.clues[live];
  const reading = BOARD_ZOOM_MS + readMs(clue);
  if (stage === "zoom") { pick(game, live, now - 500); return state; }
  if (stage === "clue" || stage === "picture") { pick(game, live, now - BOARD_ZOOM_MS - 1200); return state; }
  if (stage === "armed" || stage === "armed-in" || stage === "tune") {
    const log = pick(game, live, now - reading - 1300);
    Object.entries(LIVE_BUZZ).forEach(([player, ms]) => { log.buzzes[player] = { ms, at:log.armAt + ms + 90 }; });
    if (stage === "armed-in") log.buzzes[viewer] = { ms:281, at:log.armAt + 371 };
    return state;
  }
  /* the buzzers closed: the viewer second in order where the moment is theirs */
  const closedPick = (closedAt, mine) => {
    const log = pick(game, live, closedAt - BUZZ_SETTLE_MS - 400 - reading);
    const buzz = mine ? { Sahil:246, [viewer]:281, Chiang:318, Khoa:402 } : LIVE_BUZZ;
    Object.entries(buzz).forEach(([player, ms]) => { log.buzzes[player] = { ms, at:log.armAt + ms + 90 }; });
    log.closedAt = closedAt;
    log.order = buzzOrder(log);
    log.turn = 0;
    log.turnAt = closedAt + BUZZ_SHOW_MS;
    game.phase = "answer";
    return log;
  };
  if (stage === "order") { closedPick(now - 600, true); return state; }
  if (stage === "answer" || stage === "answer-mine" || stage === "reveal") {
    const log = closedPick(now - 9000, stage === "answer-mine" || stage === "reveal");
    const first = log.order[0];
    log.attempts.push({ player:first, choice:wrongChoice(clue, log, 0), at:now - 3100, right:false });
    log.turn = 1;
    log.turnAt = now - 3100 + ANSWER_GAP_MS;
    if (stage === "reveal") {
      log.attempts.push({ player:log.order[1], choice:clue.answer, at:now - 1400, right:true });
      log.winner = log.order[1];
      log.revealedAt = now - 1400;
      game.control = log.winner;
      game.phase = "reveal";
    }
    return state;
  }
  if (stage.startsWith("dd-")) {
    const id = game.dd;
    game.control = viewer;
    game.played.push(id);
    game.current = id;
    game.phase = "dd-wager";
    const log = game.log[id] = { by:viewer, auto:false, buzzes:{}, attempts:[] };
    if (stage === "dd-sting") { log.pickedAt = now - 500; return state; }
    log.pickedAt = now - DD_STING_MS - 3400;
    if (stage === "dd-wager") return state;
    Object.assign(log, { wager:600, wagerAt:now - 5200, shownAt:now - 4300, order:[viewer], turn:0 });
    log.turnAt = log.shownAt + readMs(game.clues[id]);
    game.phase = "dd-clue";
    return state;
  }
  /* the Final: every cell played */
  playRest(game, players, now - 4 * 60000, random);
  game.current = null;
  const eligible = boardStandings(game).filter(row => row.preFinal > 0).map(row => row.player);
  const wager = (player, i) => Math.min(finalMax(boardStandings(game).find(row => row.player === player)?.preFinal || 0),
    [1000, 400, 0, 1200, 600, 200, 800][i % 7]);
  if (stage === "final-intro" || stage === "final-wager") {
    game.phase = "final-wager";
    const introAt = stage === "final-intro" ? now - 1300 : now - FINAL_INTRO_MS - 9000;
    game.finalAt = { introAt, wagerUntil:introAt + FINAL_INTRO_MS + FINAL_WAGER_MS };
    if (stage === "final-wager") eligible.filter(player => player !== viewer).slice(0, 5).forEach((player, i) => {
      game.finalWagers[player] = { wager:wager(player, i), at:now - 4000 + i * 600 };
    });
    return state;
  }
  const introAt = now - 3 * 60000;
  game.finalAt = { introAt, wagerUntil:introAt + FINAL_INTRO_MS + FINAL_WAGER_MS };
  eligible.forEach((player, i) => { game.finalWagers[player] = { wager:wager(player, i), at:introAt + 9000 + i * 900 }; });
  const pickFor = (player, i) => ({ choice:(game.final.answer + FINAL_PICKS[i % FINAL_PICKS.length]) % 4, at:0, locked:true, lockedAt:0 });
  if (stage === "final-clue") {
    game.phase = "final-clue";
    const clueAt = now - 11000;
    Object.assign(game.finalAt, { clueAt, answerUntil:clueAt + FINAL_ANSWER_MS });
    players.filter(player => player !== viewer).slice(0, 6).forEach((player, i) => {
      game.finalPicks[player] = { ...pickFor(player, i), at:clueAt + 4000 + i * 700, lockedAt:clueAt + 4000 + i * 700 };
    });
    return state;
  }
  const clueAt = introAt + 40000;
  Object.assign(game.finalAt, { clueAt, answerUntil:clueAt + FINAL_ANSWER_MS });
  players.forEach((player, i) => {
    game.finalPicks[player] = { ...pickFor(player, i), at:clueAt + 3000 + i * 800, lockedAt:clueAt + 3000 + i * 800 };
  });
  game.phase = "final-reveal";
  if (stage === "final-reveal") {
    /* the reveal mid-way: the second player who wagered something, part
       way through their turn (the ones before turned already) */
    const steps = finalRevealSchedule({ ...game, finalAt:{ ...game.finalAt, revealAt:now } });
    const wagered = steps.filter(step => game.finalWagers[step.player]?.wager > 0);
    const step = wagered[1] || wagered[0] || steps[Math.min(2, steps.length - 1)];
    game.finalAt.revealAt = now - step.at - Math.round(step.ms * 0.6);
    return state;
  }
  game.finalAt.revealAt = now - 60000;
  game.finalAt.boardAt = now - 2500;
  game.phase = "final-board";
  return state;
}
