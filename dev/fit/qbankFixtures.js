/* The question bank's board, played by the real writes on the TEST
   fixtures (worker/triviaQBank/_fixtures.json, scripts/tq/fixtures.mjs):
   a plan game dealt by Lock and start, then one clue of each kind taken to
   the moment a stage names, the server clock pinned for each write. For
   the dev previews (/dev/trivia-preview.html "Bank:" steps), the fit
   views and tests; never the Worker.

     bankStage(name, { now })   { state, now }: the moment `name` with its
                                 clock at `now` (default: the real now, so
                                 a preview plays on from there)

   Stages: pick (the board, seven columns), text, image, image-reveal,
   audio, audio-answer, audio-replay, video, sil, sil-reveal, crop,
   crop-reveal. */
import { EMPTY_STATE, RESET_PROGRESS_CONFIRMATION, allEventsOf, resolveCurrentContest } from "../../shared/core.js";
import { BOARD_ZOOM_MS, buzzCloseAt, readMs } from "../../shared/triviaBoard.js";
import { applyAction } from "../../worker/actions.js";
import { useQBank } from "../../worker/triviaQBank/index.js";
import FIXTURES from "../../worker/triviaQBank/_fixtures.json" with { type:"json" };

export const BANK_FIXTURES = FIXTURES;
export const BANK_STAGES = Object.freeze(["pick", "text", "image", "image-reveal", "audio", "audio-answer", "audio-replay", "video",
  "sil", "sil-reveal", "crop", "crop-reveal"]);
/* which record each stage puts up */
const STAGE_CLUE = Object.freeze({ text:"fx-lore-2", image:"fx-nba-1", "image-reveal":"fx-nba-1", audio:"fx-sound-1",
  "audio-answer":"fx-aux-2", "audio-replay":"fx-aux-2", video:"fx-web-1", sil:"fx-sil-1", "sil-reveal":"fx-sil-1", crop:"fx-web-2",
  "crop-reveal":"fx-web-2" });
const BUZZ = Object.freeze({ Sahil:262, Khoa:318, Evan:405 });

let serial = 0;
const ctx = (extra = {}) => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:null, deviceId:"fit-bank",
  actionId:`bank-${++serial}`, showControl:false, ...extra });
const as = player => ({ isGm:false, player, deviceId:`fit-${player}`, actionId:`bank-${++serial}` });
function write(state, type, payload, at, who = ctx()) {
  const real = Date.now;
  Date.now = () => at;
  try {
    const result = applyAction(state, type, payload, who);
    if (!result.ok) throw new Error(`${type}: ${result.error}`);
    return result;
  } finally { Date.now = real; }
}

/* the plan game, dealt at `at` by Lock and start, the fixture bank swapped in for the deal */
function dealt(at) {
  const restore = useQBank({ records:FIXTURES.records, recommended:FIXTURES.plan });
  try {
    const state = structuredClone(EMPTY_STATE);
    write(state, "qaAdvance", { target:"event:trivia:open", seed:7, confirm:RESET_PROGRESS_CONFIRMATION, confirmPokerLive:true }, at - 5000);
    write(state, "triviaSetFormat", { format:"board" }, at - 4000);
    write(state, "qbankImport", { plan:FIXTURES.plan, edits:{}, marks:{} }, at - 3000);
    const ev = allEventsOf(state).find(item => item.id === "trivia");
    const contest = resolveCurrentContest(state, ev);
    write(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision, startWeekend:true }, at - 2000);
    if (state.trivia?.format !== "board") throw new Error("the plan did not deal");
    return state;
  } finally { restore(); }
}

const clueOf = (state, qid) => Object.values(state.trivia.clues).find(clue => clue.source === qid);
const logOf = state => state.trivia.log[state.trivia.current];

/* The moment `name`, its clock at `now`: every write lands at the time it
   would have, counted back from `now`. */
export function bankStage(name, { now = Date.now(), viewer = null } = {}) {
  if (!BANK_STAGES.includes(name)) throw new Error(`no bank stage ${name}`);
  const done = state => { state.updatedAt = now; return { state, now }; };
  if (name === "pick") {
    const state = dealt(now - 1000);
    /* the viewer's own pick, for a phone's still */
    if (viewer) state.trivia.control = viewer;
    return done(state);
  }
  const qid = STAGE_CLUE[name];
  const reveal = name.endsWith("-reveal");
  const answering = name === "audio-answer" || name === "audio-replay";
  /* how far back the pick was: the clue armed (a clip a beat into its
     window), or a reveal standing, or a turn under way */
  const state = dealt(now - 60000);
  const clue = clueOf(state, qid);
  const clip = !reveal && !answering && ["audio", "video"].includes(clue.media?.kind);
  const back = reveal ? 16000 : answering ? 11000 : clip ? BOARD_ZOOM_MS + readMs(clue) + 300 : 6200;
  const pickAt = now - back;
  write(state, "boardPick", { clueId:clue.id }, pickAt);
  /* the TV had it ready during the zoom */
  if (logOf(state).mediaWait) write(state, "boardMediaReady", { clueId:state.trivia.current }, pickAt + 400, ctx({ isGm:false, tv:true }));
  if (!reveal && !answering) return done(state);
  const arm = logOf(state).armAt;
  for (const [player, ms] of Object.entries(BUZZ)) write(state, "boardBuzz", { clueId:state.trivia.current, ms }, arm + ms + 60, as(player));
  write(state, "boardCloseBuzz", { clueId:state.trivia.current }, buzzCloseAt(logOf(state)));
  const turnAt = logOf(state).turnAt;
  if (answering) {
    if (name === "audio-replay") write(state, "boardMediaCue", { clueId:state.trivia.current, action:"replay" }, Math.min(now - 300, turnAt + 500));
    return done(state);
  }
  write(state, "boardAnswer", { clueId:state.trivia.current, choice:state.trivia.clues[state.trivia.current].answer }, turnAt + 1800,
    as(logOf(state).order[0]));
  return done(state);
}
