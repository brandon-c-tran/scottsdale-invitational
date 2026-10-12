/* The Trivia board on a phone or the TV, as data, from the frame that
   viewer was sent (shared/triviaBoard.js projectBoard is the game; this
   only reads it). Pure: `now` is the server clock everywhere.

   boardView     the game as one viewer sees it: the cells, the clue up,
                 its clock, its race (the first, or a rebound), who
                 buzzed, the order, the turn, who has answered, the struck
                 options, the scores, the Final
   boardScreen   which phone screen a viewer is on
   tvBoardScene  which TV scene the room is on
   buzzerState   the phone's buzzer: off, locked, live, in, closed
   buzzReaction  a reaction timed from the frame that lit the buzzer
   boardInstants the instants the view changes on its own (screens wake on
                 them, so a lamp lights on the beat, never on a 1 s tick)
   railSlots     the TV's score rail
   deskBoard     the set list drawn as the board it will deal (the desk) */
import { isActivePlayer, isAway } from "../../../shared/core.js";
import {
  ANSWER_GRACE_MS, BOARD_CLIP_MS, BOARD_CLUE_FORMATS, BOARD_COLUMNS_MAX, BOARD_VALUES, BUZZ_SHOW_MS, DD_MIN, DD_STING_MS,
  DD_WAGER_MS, FINAL_INTRO_MS, FINAL_PHASES, WAGER_STEP, answeredOn, boardRace, boardStandings, boardTopValue, clampBuzzMs, ddDefault,
  ddMax, finalEligible, finalMax, finalRevealSchedule, isBoardGame, struckChoices, turnMs, turnPlayer,
} from "../../../shared/triviaBoard.js";

const num = value => Number(value) || 0;
export const fmtPoints = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "";
/* a score as the board letters it: a minus sign, never a hyphen */
export const signedPoints = n => `${n < 0 ? "−" : ""}${fmtPoints(Math.abs(num(n)))}`;
/* a reaction in seconds, as the order shows it: "0.214" */
export const fmtReaction = ms => Number.isFinite(Number(ms)) && Number(ms) > 0 ? (Number(ms) / 1000).toFixed(3) : "";

/* A Final reveal step turns in three beats from its own start: the pick
   lands, then the wager, then the total rolls to its new score */
export const FINAL_STEP = Object.freeze({ pick:350, wager:1100, total:1700 });
/* a quick step (nothing wagered) lands everything at once */
export const FINAL_STEP_QUICK = Object.freeze({ pick:250, wager:250, total:500 });
/* the order lands fastest first, a stamp a place */
export const ORDER_STAMP_MS = 120;
/* a buzzer that lit this late (a phone opened after the buzzers armed)
   times from the arm, not from its own frame */
export const BUZZ_LATE_PAINT_MS = 250;
/* the options light a beat before the turn so a fast thumb is never refused */
export const ANSWER_EARLY_MS = 300;

/* Where the board stands for `me` (null on the TV). Null when no board
   game is running. */
export function boardView(state, me = null, now = Date.now()) {
  const game = state?.trivia;
  if (!isBoardGame(game)) return null;
  const finished = !!state.results?.[game.eventId] || !!game.finishedAt;
  const players = Array.isArray(game.players) ? game.players : [];
  /* a present roster player missing from the list joins on their first buzz */
  const playing = !!me && !isAway(state, me) && Array.isArray(game.players) && (players.includes(me) || isActivePlayer(me, state));
  const played = new Set(game.played || []);
  const columns = (game.columns || []).map((column, col) => ({
    name:String(column?.name || ""), col,
    cells:(column?.clues || []).map(id => {
      const clue = game.clues?.[id] || {};
      return { id, col, row:num(clue.row), value:num(clue.value), played:played.has(id), current:game.current === id,
        dd:played.has(id) && game.dd === id };
    }),
  }));
  const rows = Math.max(0, ...columns.map(column => column.cells.length));
  const cellsLeft = columns.reduce((sum, column) => sum + column.cells.filter(cell => !cell.played).length, 0);
  const phase = game.phase || "pick";
  const clueId = game.current || null;
  const clue = clueId ? game.clues?.[clueId] || null : null;
  const log = clueId ? game.log?.[clueId] || null : null;
  const dd = !!clueId && game.dd === clueId;
  const pickedAt = num(log?.pickedAt), shownAt = num(log?.shownAt), armAt = num(log?.armAt), openUntil = num(log?.openUntil);
  const closedAt = num(log?.closedAt), turnAt = num(log?.turnAt), revealedAt = num(log?.revealedAt);
  const turnEnd = turnAt ? turnAt + turnMs(game, clueId) : 0;
  const buzzes = log?.buzzes || {};
  const buzzedIn = players.filter(player => buzzes[player]).concat(Object.keys(buzzes).filter(player => !players.includes(player)));
  const mine = me ? buzzes[me] : null;
  const myBuzz = mine && Number.isFinite(Number(mine.ms)) && Number(mine.ms) > 0 ? { ms:Number(mine.ms), at:num(mine.at) } : null;
  const order = (log?.order || []).map((player, i) => ({ player, place:i + 1,
    ms:Number.isFinite(Number(buzzes[player]?.ms)) ? Number(buzzes[player].ms) : null }));
  const attempts = (log?.attempts || []).map(attempt => ({ ...attempt }));
  const struck = struckChoices(log);
  const answering = phase === "answer" || phase === "dd-clue" ? turnPlayer(log) : null;
  /* the race the buzzers are on: a rebound reopens them, after a wrong
     answer, for everyone who has not answered this clue */
  const race = boardRace(log);
  const answered = [...answeredOn(log)];
  const standings = boardStandings(game);
  const rowOf = new Map(standings.map(row => [row.player, row]));
  const columnName = clue ? columns[clue.col]?.name || "" : "";
  const top = boardTopValue(game);
  const myScore = me ? rowOf.get(me)?.preFinal ?? 0 : 0;
  /* the Final */
  const t = game.finalAt || {};
  const finalOn = FINAL_PHASES.includes(phase);
  const eligible = finalOn ? finalEligible(state, game) : [];
  const schedule = phase === "final-reveal" || phase === "final-board" || !!game.finishedAt ? finalRevealSchedule(game) : [];
  const final = finalOn && game.final ? { ...game.final } : null;
  const wagers = game.finalWagers || {}, picks = game.finalPicks || {};
  return {
    game, me, phase, finished, players, playing, columns, rows, cellsLeft, total:num(game.total) || columns.reduce((s, c) => s + c.cells.length, 0),
    control:game.control || null,
    /* who picked the clue up (a Daily Double's only player) */
    picker:log?.by || null,
    clueId, clue, log, dd, columnName, value:num(clue?.value), stake:dd ? num(log?.wager) : num(clue?.value),
    wager:dd && log?.wager !== undefined ? num(log.wager) : null, wagerAt:num(log?.wagerAt),
    pickedAt, shownAt, armAt, openUntil, closedAt, turnAt, turnEnd, revealedAt, turn:num(log?.turn),
    race, rebound:phase === "clue" && race > 0, answered, out:!!me && answered.includes(me),
    buzzes, buzzedIn, myBuzz, order, attempts, struck, answering, winner:log?.winner ?? null,
    answer:Number.isInteger(clue?.answer) ? clue.answer : null,
    standings, rowOf, myRow:me ? rowOf.get(me) || null : null, myScore, top,
    ddMax:ddMax(myScore, top), ddDefault:ddDefault(myScore, top), finalMax:finalMax(myScore, top),
    final, finalAt:{ introAt:num(t.introAt), wagerUntil:num(t.wagerUntil), clueAt:num(t.clueAt), answerUntil:num(t.answerUntil),
      revealAt:num(t.revealAt), boardAt:num(t.boardAt) },
    finalEligible:eligible,
    finalWagers:wagers, finalPicks:picks,
    myFinalWager:me && Number.isFinite(Number(wagers[me]?.wager)) ? Number(wagers[me].wager) : null,
    myFinalPick:me ? picks[me] || null : null,
    wagersLocked:eligible.filter(player => wagers[player]),
    picksLocked:players.filter(player => picks[player]?.locked),
    schedule,
  };
}

/* Which phone screen a viewer is on. */
export function boardScreen(view) {
  if (!view || view.finished) return null;
  const me = view.me;
  switch (view.phase) {
    case "pick": return view.playing && view.control === me ? "pick" : "pick-watch";
    /* on a rebound, whoever answered this clue is out of it */
    case "clue": return !view.playing ? "clue-watch" : view.out ? "buzz-out" : "buzzer";
    case "answer": return view.answering === me ? "answer" : "answer-watch";
    case "reveal": return "reveal";
    case "dd-wager": return view.picker === me ? "dd-wager" : "dd-watch";
    case "dd-clue": return view.picker === me ? "answer" : "answer-watch";
    /* everyone plays the Final */
    case "final-wager": return view.playing ? "final-wager" : "final-watch";
    case "final-clue": return view.playing ? "final-clue" : "final-watch";
    case "final-reveal": return "final-reveal";
    case "final-board": return "final-board";
    default: return "pick-watch";
  }
}

/* Which TV scene the room is on. A rebound keeps the answers up, the
   struck ones standing: "rebound" until the buzzers arm again, then
   "rebound-armed". */
export function tvBoardScene(view, now) {
  if (!view) return null;
  switch (view.phase) {
    case "pick": return "pick";
    case "clue":
      if (view.rebound) return now < view.armAt ? "rebound" : "rebound-armed";
      return now < view.shownAt ? "zoom" : now < view.armAt ? "clue" : "armed";
    case "answer": return view.turn === 0 && (!view.turnAt || now < view.turnAt) ? "order" : "answer";
    case "reveal": return "reveal";
    case "dd-wager": return now < view.pickedAt + DD_STING_MS ? "dd-sting" : "dd-wager";
    case "dd-clue": return "dd-clue";
    case "final-wager": return now < view.finalAt.introAt + FINAL_INTRO_MS ? "final-intro" : "final-wager";
    case "final-clue": return "final-clue";
    case "final-reveal": return "final-reveal";
    case "final-board": return "final-board";
    default: return "pick";
  }
}

/* The phone's buzzer. `lockoutUntil` is when an early tap's lockout ends
   (server clock); `open` is false once the buzzers closed without you. */
export function buzzerState({ armAt = 0, now = 0, lockoutUntil = 0, buzzed = false, open = true } = {}) {
  if (buzzed) return "in";
  if (!open) return "closed";
  if (lockoutUntil > now) return "locked";
  if (!armAt || now < armAt) return "off";
  return "live";
}

/* A buzz's reaction. On time, it is timed from the frame that painted the
   lit buzzer (performance clock: `paintedAt`, `tapAt`), so the network and
   the clocks never decide who was first. A buzzer that lit late (the
   phone opened after the arm, or slept through it) times from the arm on
   the server clock instead, so opening late never buys a fast time. */
export function buzzReaction({ paintedAt = null, paintedServer = null, tapAt = 0, tapServer = 0, armAt = 0 } = {}) {
  const onTime = Number.isFinite(paintedAt) && Number.isFinite(paintedServer) && paintedServer - armAt <= BUZZ_LATE_PAINT_MS;
  const raw = onTime ? tapAt - paintedAt : tapServer - armAt;
  return clampBuzzMs(Math.max(1, raw));
}

/* The answer turn's state for whoever answers: waiting (the order still
   stands, or the beat after a struck answer), live, or over (waiting for
   the server's timeout). */
export function turnState(view, now) {
  if (!view?.turnAt) return "wait";
  if (now < view.turnAt - ANSWER_EARLY_MS) return "wait";
  if (now <= view.turnEnd) return "live";
  return "over";
}
/* what is left of a window, 0 to 1 */
export const drainLeft = (from, until, now) => until > from ? Math.max(0, Math.min(1, (until - now) / (until - from))) : 0;

/* The Daily Double's wager window: the sting, then DD_WAGER_MS */
export const ddWagerUntil = view => view?.pickedAt ? view.pickedAt + DD_STING_MS + DD_WAGER_MS : 0;

/* The Final's reveal, step by step: where each player's turn stands at
   `now`. { player, at, ms, beats:{ pick, wager, total }, state:"ahead"|"on"|"done",
   pickShown, wagerShown, totalShown }, plus the step on now (index). */
export function finalSteps(view, now) {
  const revealAt = view?.finalAt?.revealAt || 0;
  const board = view?.phase === "final-board" || view?.finished;
  return (view?.schedule || []).map(step => {
    const start = revealAt + step.at;
    const beats = step.ms > FINAL_STEP.total + 600 ? FINAL_STEP : FINAL_STEP_QUICK;
    const row = view.rowOf.get(step.player) || null;
    const shown = ms => board || (revealAt > 0 && now >= start + ms);
    return { ...step, start, beats, row, state:board || now >= start + step.ms ? "done" : now >= start ? "on" : "ahead",
      pickShown:shown(beats.pick), wagerShown:shown(beats.wager), totalShown:shown(beats.total) };
  });
}
export const finalStepOn = steps => steps.findIndex(step => step.state === "on");

/* A player's score as the room should see it now: during the Final's
   reveal, their total before the Final until their own turn rolls it */
export function shownScore(view, player, now, steps = null) {
  const row = view?.rowOf?.get(player);
  if (!row) return 0;
  if (view.phase !== "final-reveal") return row.score;
  const step = (steps || finalSteps(view, now)).find(item => item.player === player);
  return step && !step.totalShown ? row.preFinal : row.score;
}

/* Every instant after `now` at which the view changes by itself (a lamp
   lights, a turn opens or closes, a Final step lands), soonest first. */
export function boardInstants(view, now) {
  if (!view || view.finished) return [];
  const marks = [];
  const add = at => { if (at > now) marks.push(at); };
  switch (view.phase) {
    case "clue":
      add(view.shownAt); add(view.armAt); add(view.armAt + BOARD_CLIP_MS); add(view.openUntil);
      break;
    case "answer":
    case "dd-clue":
      add(view.shownAt); add(view.turnAt - ANSWER_EARLY_MS); add(view.turnAt); add(view.turnEnd); add(view.turnEnd + ANSWER_GRACE_MS);
      if (view.closedAt) add(view.closedAt + BUZZ_SHOW_MS);
      break;
    case "dd-wager":
      add(view.pickedAt + DD_STING_MS); add(ddWagerUntil(view));
      break;
    case "final-wager":
      add(view.finalAt.introAt + FINAL_INTRO_MS); add(view.finalAt.wagerUntil);
      break;
    case "final-clue":
      add(view.finalAt.answerUntil);
      break;
    case "final-reveal":
      for (const step of finalSteps(view, now)) {
        add(step.start); add(step.start + step.beats.pick); add(step.start + step.beats.wager); add(step.start + step.beats.total);
        add(step.start + step.ms);
      }
      break;
    default:
  }
  return [...new Set(marks)].sort((a, b) => a - b);
}
export const nextBoardInstant = (view, now) => boardInstants(view, now)[0] || 0;

/* stereo place by the rail's slot, left to right */
export const railPan = (index, count) => count > 1 ? Math.round((-0.8 + 1.6 * index / (count - 1)) * 100) / 100 : 0;

/* the scenes the buzzers stand in: a clue reading or live, and a rebound */
export const BUZZ_SCENES = Object.freeze(["clue", "armed", "rebound", "rebound-armed"]);

/* The TV's score rail: every player in the order they joined (a player's
   chip never moves), lit by what the room is doing. On a rebound whoever
   answered the clue stands unlit (`spent`). */
export function railSlots(view, now, scene = tvBoardScene(view, now)) {
  if (!view) return [];
  const steps = view.phase === "final-reveal" ? finalSteps(view, now) : null;
  const orderOf = new Map(view.order.map(row => [row.player, row]));
  const lastAttempt = view.attempts[view.attempts.length - 1] || null;
  const leaders = leaderSet(view, now, steps);
  const rebound = scene === "rebound" || scene === "rebound-armed";
  return view.players.map((player, index) => {
    const row = view.rowOf.get(player) || null;
    const score = shownScore(view, player, now, steps);
    const final = view.final && ["final-wager", "final-clue"].includes(view.phase);
    return {
      player, index, pan:railPan(index, view.players.length), score, row,
      control:view.phase === "pick" && view.control === player,
      buzzed:BUZZ_SCENES.includes(scene) && !!view.buzzes[player],
      spent:rebound && view.answered.includes(player),
      place:["order", "answer", "reveal"].includes(scene) && !view.dd ? orderOf.get(player)?.place || null : null,
      answering:(scene === "answer" || scene === "dd-clue") && view.answering === player && view.turnAt > 0 && now >= view.turnAt - ANSWER_EARLY_MS,
      right:scene === "reveal" && view.winner === player,
      wrong:["answer", "reveal", "dd-clue"].includes(scene) && view.attempts.some(attempt => attempt.player === player && !attempt.right),
      lastWrong:!!lastAttempt && !lastAttempt.right && lastAttempt.player === player,
      picker:(scene === "dd-sting" || scene === "dd-wager" || scene === "dd-clue") && view.picker === player,
      eligible:view.phase !== "final-wager" || view.finalEligible.includes(player),
      locked:final ? view.phase === "final-wager" ? !!view.finalWagers[player] : !!view.finalPicks[player]?.locked : false,
      final,
      leader:leaders.has(player),
    };
  });
}
/* the board's leaders: everyone tied on the top score above zero; nobody
   while every score is level */
function leaderSet(view, now, steps) {
  const scores = view.players.map(player => shownScore(view, player, now, steps));
  const top = Math.max(0, ...scores);
  if (top <= 0 || scores.every(score => score === scores[0])) return new Set();
  return new Set(view.players.filter((player, i) => scores[i] === top));
}

/* the wheel's values: every WAGER_STEP from `min` to `max` */
export function wagerItems(min, max, step = WAGER_STEP) {
  const out = [];
  for (let value = Math.max(0, min); value <= max; value += step) out.push({ value, label:fmtPoints(value) });
  return out;
}
/* the wheel's starting value: the default, held inside the range */
export const wagerStart = (value, min, max) => Math.max(min, Math.min(max, Math.round(num(value) / WAGER_STEP) * WAGER_STEP));
export const DD_RANGE = view => ({ min:DD_MIN, max:view?.ddMax || DD_MIN, start:wagerStart(view?.ddDefault, DD_MIN, view?.ddMax || DD_MIN) });
/* the Final: 0 up to the score or the board's top value (everyone plays it) */
export const FINAL_RANGE = view => ({ min:0, max:view?.finalMax || 0, start:0 });

/* A column's name on a phone: one size for the column, its longest word
   on one line (Big Shoulders 900 runs about half an em a letter) */
export function columnNameSize(name, width, { max = 15, min = 12, advance = 0.5 } = {}) {
  const longest = Math.max(1, ...String(name || "").split(/\s+/).filter(Boolean).map(word => word.length));
  return Math.max(min, Math.min(max, Math.floor(width / (longest * advance))));
}
/* The clue's size on the TV by its length (three to five lines fill the
   stage); `compact` is the clue over the answer's options */
export function clueTextSize(text = "", { media = false, compact = false } = {}) {
  const n = String(text || "").length;
  if (compact) return n > 120 ? 40 : n > 80 ? 46 : 54;
  if (media) return n > 90 ? 48 : n > 50 ? 56 : 64;
  return n > 140 ? 72 : n > 100 ? 80 : n > 60 ? 92 : 104;
}

/* The TV's board (canvas pixels). The masthead stands above (124), the
   content keeps the 64px sides and the 54px title-safe foot; the stage is
   the board (and every clue over it), the rail of scores under it. */
export const BOARD_TV = Object.freeze({ edge:64, top:138, bottom:1026, railH:180, railGap:14, head:104, gap:10 });
export const boardStageBox = (tv = BOARD_TV) => ({ x:0, y:0, w:1920 - 2 * tv.edge,
  h:tv.bottom - tv.top - tv.railH - tv.railGap, head:tv.head, gap:tv.gap });
/* The cell's place on the TV board, for the zoom: { x, y, w, h } in canvas
   pixels inside the board's frame (`frame` is the board's own box) */
export function cellRect({ col, row }, { columns, rows }, frame = boardStageBox()) {
  const { x, y, w, h, head, gap } = frame;
  const cw = (w - gap * (columns - 1)) / Math.max(1, columns);
  const ch = (h - head - gap * rows) / Math.max(1, rows);
  return { x:Math.round(x + col * (cw + gap)), y:Math.round(y + head + gap + row * (ch + gap)), w:Math.round(cw), h:Math.round(ch) };
}
/* the zoom: a transform that stands the full panel on the cell */
export function zoomFrom(cell, shape, frame = boardStageBox()) {
  const r = cellRect(cell, shape, frame);
  return { x:r.x, y:r.y, sx:+(r.w / frame.w).toFixed(4), sy:+(r.h / frame.h).toFixed(4) };
}
/* A name on one line in a slot: as large as it goes (`max` down to
   `min`), and a name still wider at `min` narrowed to the slot (`squeeze`,
   the browser measures the real one); Big Shoulders 900 runs about half an
   em a letter. */
export const NAME_SQUEEZE = 0.72;
export function lineNameFit(name, width, { max = 30, min = 24, advance = 0.5 } = {}) {
  const text = String(name || "");
  const size = Math.max(min, Math.min(max, Math.floor(width / Math.max(1, text.length * advance))));
  const est = text.length * advance * size;
  return { size, squeeze:est > width ? Math.max(NAME_SQUEEZE, width / est) : 1 };
}
/* a category over its column: one or two lines, as large as fits */
export function headNameFit(name, width, { max = 40, min = 28, advance = 0.47 } = {}) {
  const text = String(name || "");
  const one = Math.floor(width / Math.max(1, text.length * advance));
  if (one >= min || !text.includes(" ")) return { size:Math.max(24, Math.min(max, one)), lines:[text] };
  /* break where the two lines come out most even */
  const words = text.split(" ");
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const longest = Math.max(...lines.map(line => line.length));
    if (!best || longest < best.longest) best = { lines, longest };
  }
  return { size:Math.max(24, Math.min(max, Math.floor(width / (best.longest * advance)))), lines:best.lines };
}

/* ── the desk ──
   A set-list round as the questions a board would deal (the Worker's
   roundQuestions, without dealing the options). Null for the Final's
   own entry. */
export function deskRoundQuestions(round, bank = []) {
  if (!round || round.source === "final") return null;
  if (round.source === "bank") {
    const category = (bank || []).find(item => item.id === round.category);
    if (!category) return { name:"", questions:[], loading:true };
    const byId = new Map(category.questions.map(question => [question.id, question]));
    return { name:category.name, questions:(round.picks || []).map(id => byId.get(id)).filter(Boolean) };
  }
  return { name:round.name || "", questions:round.questions || [] };
}
const buzzable = question => BOARD_CLUE_FORMATS.includes(question?.format) && Array.isArray(question.options)
  && question.options.length === 4 && Number.isInteger(question.answer);
const levelOf = question => Number.isFinite(Number(question?.level)) ? Number(question.level) : 3;
/* The board the set list would deal: { columns, out, cells } where each
   column is a round on the board ({ round, name, cells:[{ question, value }],
   extra:[question] (rated or written past five), unusable:[question] (no
   four options: a closest number) }), `out` the rounds that do not make it
   (past six columns, or nothing a buzzer can answer), `cells` the count. */
export function deskBoard(rounds, bank = []) {
  const columns = [], out = [];
  for (const round of (rounds || []).filter(item => item?.source !== "final")) {
    const dealt = deskRoundQuestions(round, bank);
    const questions = dealt?.questions || [];
    const usable = questions.filter(buzzable);
    const unusable = questions.filter(question => !buzzable(question));
    const ordered = usable.map((question, i) => ({ question, i }))
      .sort((a, b) => levelOf(a.question) - levelOf(b.question) || a.i - b.i).map(item => item.question);
    const entry = { round, name:dealt?.name || "", loading:!!dealt?.loading, unusable,
      cells:ordered.slice(0, BOARD_VALUES.length).map((question, row) => ({ question, value:BOARD_VALUES[row] })),
      extra:ordered.slice(BOARD_VALUES.length) };
    if (!usable.length) out.push({ ...entry, reason:dealt?.loading ? "loading" : "none" });
    else if (columns.length >= BOARD_COLUMNS_MAX) out.push({ ...entry, reason:"full" });
    else columns.push(entry);
  }
  return { columns, out, cells:columns.reduce((sum, column) => sum + column.cells.length, 0) };
}
