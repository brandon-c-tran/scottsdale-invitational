import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY_STATE, ROSTER, allEventsOf, computeStandings, makeBracket, resolveCurrentContest } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { chipSnapshot, receiptDock, receiptDockStyle, resultMoment, RECEIPT_GAP } from "../src/features/results/resultMoment.js";
import { buildEventReveal } from "../src/features/weekend/drawReveal.js";
import { MAX_STAGE_HOLD_MS, holdStage, stageHeld } from "../src/lib/motion.js";

/* Integration of the Living Field Day pass: the pieces that only go wrong
   when two features meet. The receipt waits for the Bets board to settle a
   contest in place and never covers the Home leaderboard; a corrected
   contest reads as a correction, not a voided bet; numbered rounds read
   singular in the draw reveal. */
const src = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let serial = 0;
const event = (s, id) => allEventsOf(s).find(e => e.id === id);
const current = (s, id) => resolveCurrentContest(s, event(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = () => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:`host-${++serial}` });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`chip-${++serial}` });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const bracketEvent = size => {
  const s = structuredClone(EMPTY_STATE);
  s.draws["8ball"] = { id:"draw-1", ts:1,
    teams:Array.from({ length:size }, (_, key) => ({ name:`Team ${key}`, players:ROSTER.slice(key * 2, key * 2 + 2) })) };
  s.brackets["8ball"] = makeBracket(size);
  return s;
};

test("a stage hold claims the stage until released, and never outlives its cap", () => {
  assert.equal(stageHeld(), false);
  const release = holdStage("bets:held:a", { now:1000 });
  assert.equal(stageHeld(1000), true, "the held board has the stage");
  release();
  assert.equal(stageHeld(1000), false, "releasing hands it back");
  const again = holdStage("bets:held:b", { now:1000 });
  const reclaimed = holdStage("bets:held:b", { now:1000 });
  again();
  assert.equal(stageHeld(1000), true, "a stale release of a reclaimed id does not end the newer hold");
  reclaimed();
  holdStage("bets:held:c", { now:1000 });
  assert.equal(stageHeld(1000 + MAX_STAGE_HOLD_MS + 1), false, "a hold whose owner never released it expires");
});

test("the receipt waits for the Bets hold and is never drawn over the Home leaderboard", () => {
  assert.equal(receiptDock({ tab:"board" }), "top", "Home: under the header, the leaderboard stays in view");
  assert.equal(receiptDock({ tab:"board", modal:{ type:"standings" } }), "bottom", "a sheet keeps its header clear");
  assert.equal(receiptDock({ tab:"bets" }), "bottom", "Bets: the next contest's sides stay clear");
  assert.equal(receiptDock({ tab:"events" }), "bottom");
  assert.deepEqual(receiptDockStyle({ dock:"top", headerBottom:80 }), { top:`${80 + RECEIPT_GAP}px` },
    "the top dock follows the real header, staging bar included");
  assert.deepEqual(receiptDockStyle({ dock:"bottom", rackTop:640, viewportHeight:844 }),
    { bottom:`${844 - 640 + RECEIPT_GAP}px` }, "above the rack when one shows");
  assert.equal(receiptDockStyle({ dock:"bottom", rackTop:null, viewportHeight:844 }), null);
  assert.equal(receiptDockStyle({ dock:"top", headerBottom:null }), null);

  const app = src("src/App.jsx");
  assert.match(app, /\{moment && !stageHeld && <ChipReceipt/, "App defers the receipt while a surface holds the stage");
  assert.match(app, /dock=\{receiptDock\(\{ tab, modal \}\)\}/);
  const wagers = src("src/features/wagers/Wagers.jsx");
  assert.match(wagers, /function HeldBoard[\s\S]{0,300}useStageHold\(`bets:held:\$\{held\.id\}`, true\)/,
    "the Bets board holds the stage for exactly as long as it shows the decided contest");
});

test("correcting a decided contest reads as a correction, not as a voided bet", () => {
  const s = bracketEvent(6);
  act(s, "announceEvent", { evId:"8ball" });
  const first = current(s, "8ball");
  const playing = new Set(first.sides.flatMap(side => side.players));
  const bettor = ROSTER.find(player => !playing.has(player));
  const side = first.sides[0];
  act(s, "placeWager", { wager:{ eventId:"8ball", evName:"8-Ball Doubles", stake:200, ...refs(first),
    kind:"match", match:first.match, teamIdx:side.key, drawId:first.drawId } }, guest(bettor));
  act(s, "lockAndStart", { evId:"8ball", ...refs(current(s, "8ball")) });
  act(s, "recordContestWinner", { evId:"8ball", ...refs(current(s, "8ball")), winner:side.key });
  const won = structuredClone(s);
  const stack = s.eventOps["8ball"].contestStack;
  act(s, "correctContest", { evId:"8ball", contestId:stack.at(-1).id, contestRevision:s.eventOps["8ball"].contestRevision });

  const snap = state => chipSnapshot(state, bettor, allEventsOf(state), computeStandings(state));
  const notice = resultMoment({ prev:snap(won), next:snap(s), prevState:won, state:s,
    frame:{ fresh:false, live:true, correction:true } });
  assert.deepEqual(notice, { kind:"notice", delta:-200, text:"Result corrected: −200" });
});

test("numbered bracket rounds read singular in the draw reveal", () => {
  const four = bracketEvent(4);
  const titles = buildEventReveal(four, event(four, "8ball"), "draw").groups.map(group => group.title);
  assert.deepEqual(titles.slice(0, 2), ["Semifinal 1", "Semifinal 2"]);
  const six = bracketEvent(6);
  assert.deepEqual(buildEventReveal(six, event(six, "8ball"), "draw").groups.slice(0, 2).map(group => group.title),
    ["Play-in 1", "Play-in 2"]);
});

test("the TV podium names the finale once, and a settled slot card keeps a pair's name on one line", () => {
  const tv = src("src/features/tv/TVMode.jsx");
  assert.doesNotMatch(tv, /· final stacks/);
  assert.match(tv, /className=\{`tv-advance is-slot\$\{chips \? " has-settle" : ""\}`\}/);
  const css = src("src/features/tv/tvScenes.css");
  assert.match(css, /\.tv-advance\.is-slot\.has-settle \.tv-advance-name \{[^}]*white-space:nowrap/);
  /* the settled chips are one row under the winner, clipped to the card */
  assert.match(css, /\.tv-advance\.is-slot\.has-settle \{[^}]*flex-direction:column[^}]*overflow:hidden/);
  assert.match(src("src/features/tv/tv.css"), /\.tv-settle \.tv-stacks \{[^}]*flex-wrap:nowrap/);
  assert.match(tv, /slots=\{fit\.won\}/);
  assert.match(tv, /slots=\{fit\.lost\}/);
});

test("a captain's turn nudge leaves with the turn and stays quiet over the open draft", () => {
  const app = src("src/App.jsx");
  assert.match(app, /modalRef\.current\?\.type === "draft" && modalRef\.current\.ev\?\.id === eid/);
  assert.match(app, /const retire = \(\) => setToast\(t => t\?\.draftTurn \? null : t\)/);
});
