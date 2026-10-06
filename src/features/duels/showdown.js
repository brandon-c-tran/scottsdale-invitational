/* The live showdown, as a scene. Once both duelists are ready the server
   stamps `armedAt` and a random `fireAt` (shared/core.js duelReady); from
   there every phone and the TV play one composition on the server clock:
   the two chips square off with the antes between them, three lamps light,
   then nothing (the wait is random, so the lamps never predict it) until
   the glass flashes DRAW at fireAt. When the second run lands (the duel
   settles, `resultAt` is that run's server stamp) both times roll in on
   reels (the winner's on the drum), WON stamps and the antes slide to the
   winner. Pure: no clock beyond the `now` passed in, so a late screen joins
   mid-scene and the fit audit can stand at any instant. */

import {
  DUEL_LATE_MS, DUEL_READY_MS, disp, duelMode, duelPhase, duelReadyUntil, resolveDuel,
} from "../../../shared/core.js";

/* ms after armedAt (the lean-in and the lamps) and after resultAt (the
   result). The lamps are done by 1.7 s, before the earliest draw (2 s). */
export const SHOWDOWN = Object.freeze({
  dimMs:700,
  slamA:200, slamB:420, slamMs:420,
  antes:820, antesMs:360,
  lamps:Object.freeze([1000, 1350, 1700]),
  flashMs:900,
  reel:250, reelGap:200, stamp:1250, slide:1700, slideMs:650,
  hold:6000,
  noResult:9000,
  liftMs:500,
});

/* a phone keeps the stance this much past the server's window before it
   offers the solo draw, so a run never reaches the server inside it */
export const STANCE_GRACE_MS = 1500;

const EARLY_RESULT_MS = 1000;
const runTs = (duel, p) => Number(duel?.runs?.[p]?.ts) || 0;
/* the server instant the duel settled: the second run's stamp */
export const showdownResultAt = duel => duel && resolveDuel(duel).settled
  ? Math.max(runTs(duel, duel.from), runTs(duel, duel.to)) || null : null;

/* The scene's window on the server clock, or null for a duel that was never
   armed. A result that lands long after the flash (a duelist who missed it
   drew alone later) is not this scene's: it goes to the ticker. */
export function showdownWindow(duel) {
  const armedAt = Number(duel?.armedAt) || 0, fireAt = Number(duel?.fireAt) || 0;
  if (!armedAt || !fireAt || !duel.to) return null;
  if (duel.status !== "open") return null;
  const settledAt = showdownResultAt(duel);
  /* settled well before the draw (both fouled early, or a QA rehearsal's
     instant runs): there is no draw left to show */
  if (settledAt && settledAt < fireAt - EARLY_RESULT_MS) return null;
  const resultAt = settledAt && settledAt <= fireAt + SHOWDOWN.noResult ? settledAt : null;
  const end = resultAt ? resultAt + SHOWDOWN.hold : fireAt + SHOWDOWN.noResult;
  return { id:duel.id, armedAt, fireAt, resultAt, end };
}

/* the armed duel the room is watching at `now`, newest first */
export function activeShowdown(state, now) {
  let best = null;
  for (const duel of state?.duels || []) {
    const win = showdownWindow(duel);
    if (!win || now < win.armedAt || now >= win.end) continue;
    if (!best || win.armedAt > best.win.armedAt) best = { duel, win };
  }
  return best;
}

/* where in the scene `now` stands */
export function showdownBeat(win, now) {
  if (!win) return null;
  const t = now - win.armedAt;
  if (win.resultAt && now >= win.resultAt) return "result";
  if (now >= win.fireAt + SHOWDOWN.flashMs) return "waiting";
  if (now >= win.fireAt) return "draw";
  if (t >= SHOWDOWN.lamps[SHOWDOWN.lamps.length - 1]) return "steady";
  if (t >= SHOWDOWN.lamps[0]) return "lamps";
  return "lean";
}

/* how many countdown lamps are lit `t` ms after armedAt */
export const lampsLit = t => SHOWDOWN.lamps.filter(at => t >= at).length;

/* The two sides as the scene draws them: `left` first (the viewer on a
   phone, the challenger on the TV). A run the viewer may not see yet is
   { played:true } (redactDuelsForViewer); it lights that side's lamp and
   shows no time. */
export function showdownSides(state, duel, left = duel?.from) {
  if (!duel?.to) return null;
  const order = left === duel.to ? [duel.to, duel.from] : [duel.from, duel.to];
  const res = resolveDuel(duel);
  const decided = res.settled && !res.push;
  return order.map(p => {
    const run = duel.runs?.[p] || null;
    const shown = run && !run.played ? run : null;
    return {
      p, name:disp(state, p), ready:!!duel.ready?.[p], played:!!run,
      ms:shown && !shown.foul && Number.isFinite(Number(shown.ms)) ? Number(shown.ms) : null,
      foul:!!shown?.foul,
      won:decided && res.winner === p, lost:decided && res.loser === p,
    };
  });
}

/* the result in one reading: who won, the push, what moved */
export function showdownResult(duel) {
  const res = duel ? resolveDuel(duel) : { settled:false };
  if (!res.settled) return null;
  return { push:!!res.push, winner:res.winner || null, loser:res.loser || null, stake:Number(duel.stake) || 0 };
}

/* What the duel screen shows `me` at `now`, given whether this phone
   already holds a captured reaction:
   offer   the challenge, before acceptance (duelView says whose move)
   stance  accepted, waiting for both Readys (my lamp, theirs)
   armed   both ready, the draw not yet flashed
   go      the flash, fireAt reached (a phone that opens the duel more than
           DUEL_LATE_MS after it draws alone instead)
   solo    each side draws alone: the window passed, a legacy duel, or a
           missed flash
   done    my reaction is in (or captured on this phone)
   closed  anything else (declined, withdrawn, lapsed, void, not mine) */
export function duelScreen(duel, me, { now, captured = false } = {}) {
  if (!duel) return "closed";
  const phase = duelPhase(duel, now);
  const mine = !!me && (duel.from === me || (!!duel.to && duel.to === me));
  if (phase === "offered") return "offer";
  if (phase === "settled") return mine ? "done" : "closed";
  if (phase !== "live" || !mine) return "closed";
  if (captured || duel.runs?.[me]) return "done";
  const mode = duelMode(duel, now);
  if (mode === "showdown") {
    const fireAt = Number(duel.fireAt);
    if (now < fireAt) return "armed";
    return now - fireAt <= DUEL_LATE_MS ? "go" : "solo";
  }
  if (mode === "stance") return "stance";
  /* the server's window just closed: hold the stance a beat longer */
  const until = duelReadyUntil(duel);
  if (until && !Object.keys(duel.runs || {}).length && now < until + STANCE_GRACE_MS) return "stance";
  return "solo";
}

/* ms left in the Ready window, for the drain under the stance */
export function readyLeft(duel, now) {
  const until = duelReadyUntil(duel);
  return until ? Math.max(0, Math.min(DUEL_READY_MS, until - now)) : 0;
}

/* The TV decides how the room sees an armed duel: the whole scene in a gap
   (nothing live, drawn, posting or playing a moment), else nothing over the
   live pane; the result then rides the ticker (tickerItems puts a fresh
   duel first). */
export const showdownStage = ({ armed, gap }) => !armed ? null : gap ? "scene" : "ticker";

/* a settled duel is fresh news for the ticker this long */
export const DUEL_TICKER_FRESH_MS = 90000;
