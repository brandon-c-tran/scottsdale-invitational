/* D6 Awards night, the pure half: the TV reveal's choreography on the server
   clock, its sounds, and what a phone shows. Everything reads the projected
   state (shared/prompts.js projectPrompts), where totals exist only for
   awards the TV has already revealed. */

import { ROSTER } from "../../../shared/core.js";
import { PROMPT_RESULTS_WINDOW_MS, awardResults, nomineesOf, openBallot } from "../../../shared/prompts.js";

/* One award on the TV, from the tap that revealed it (ms after reveal.at):
   the title, then the nominees' photo chips, then the anonymous ballot chips
   land one at a time, round by round so the leader shows last, then the
   winner stamps. */
export const AWARD_TIMING = Object.freeze({
  title:0,
  nominees:500,
  nomineeStagger:45,
  chips:1500,
  chipMin:200,
  chipMax:420,
  chipSpread:3000,
  stampAfter:900,
  settleAfter:600,
});

/* The order ballot chips land: every nominee still owed a chip gets one per
   round, in nominee order, so a stack stops growing when its votes run out
   and the winner is the last one still climbing. */
export function chipOrder(nominees, counts) {
  const owed = new Map(nominees.map(player => [player, Math.max(0, Math.floor(Number(counts?.[player]) || 0))]));
  const order = [];
  for (let round = 0; ; round++) {
    const next = nominees.filter(player => owed.get(player) > round);
    if (!next.length) break;
    order.push(...next);
  }
  return order;
}

export function chipStep(votes) {
  if (!votes) return AWARD_TIMING.chipMax;
  return Math.max(AWARD_TIMING.chipMin, Math.min(AWARD_TIMING.chipMax, Math.round(AWARD_TIMING.chipSpread / votes)));
}

/* offsets from the reveal: when each chip lands, when the winner stamps,
   when the award is at rest */
export function awardTimeline(view) {
  const nominees = view?.nominees || [];
  const order = chipOrder(nominees, view?.counts);
  const step = chipStep(order.length);
  const chips = order.map((player, index) => ({ player, at:AWARD_TIMING.chips + index * step }));
  const lastChip = chips.length ? chips[chips.length - 1].at : AWARD_TIMING.chips;
  const stamp = lastChip + AWARD_TIMING.stampAfter;
  return { chips, step, stamp, settled:stamp + AWARD_TIMING.settleAfter };
}

/* Where the award stands at `now` (server ms). A reveal older than its own
   sequence, a TV that joins late, and reduced motion all show the end state;
   a TV that joins mid-sequence joins it where the room is. */
export function awardPhase(view, now, { reducedMotion = false } = {}) {
  const timeline = awardTimeline(view);
  const elapsed = Number(now) - Number(view?.at || 0);
  const settled = reducedMotion || !Number.isFinite(elapsed) || elapsed >= timeline.settled;
  const at = settled ? Infinity : Math.max(0, elapsed);
  const landed = {};
  for (const player of view?.nominees || []) landed[player] = 0;
  for (const chip of timeline.chips) if (chip.at <= at) landed[chip.player] = (landed[chip.player] || 0) + 1;
  return {
    elapsed:settled ? timeline.settled : at,
    settled,
    nomineesIn:settled || at >= AWARD_TIMING.nominees,
    landed,
    stamped:settled || at >= timeline.stamp,
    timeline,
  };
}

/* where each nominee's column sits across the canvas, as a stereo pan */
export function nomineePans(nominees) {
  const n = nominees?.length || 0;
  if (n <= 1) return new Array(n).fill(0);
  return nominees.map((_, index) => Math.round((-0.6 + 1.2 * index / (n - 1)) * 100) / 100);
}

/* The room's sounds for one award, from the reveal's server time: the
   ballot chips (through the chip density rule), then the stamp and the
   result bell. Reduced motion: the bell alone, at the reveal. */
export function awardCues(view, { reduced = false } = {}) {
  if (!view?.at) return [];
  const key = `award:${view.ballotId}:${view.index}`;
  const at = ms => Number(view.at) + ms;
  if (reduced) return [{ id:"S14", at:at(0), key:`${key}:bell` }];
  const timeline = awardTimeline(view);
  const pans = new Map((view.nominees || []).map((player, index) => [player, nomineePans(view.nominees)[index]]));
  const cues = timeline.chips.map(chip => ({ id:"chip", at:at(chip.at), pan:pans.get(chip.player) || 0 }));
  if (view.winners?.length) cues.push({ id:"S10", at:at(timeline.stamp), key:`${key}:stamp` });
  cues.push({ id:"S14", at:at(timeline.stamp + 60), key:`${key}:bell` });
  return cues;
}

/* the TV's column sizes for a field of `n` nominees on the 1920 canvas */
export function awardLayout(n) {
  if (n <= 3) return { face:184, chip:128, name:60, gap:140 };
  if (n <= 5) return { face:164, chip:120, name:52, gap:80 };
  if (n <= 8) return { face:136, chip:112, name:44, gap:40 };
  if (n <= 10) return { face:120, chip:100, name:36, gap:20 };
  return { face:108, chip:92, name:32, gap:10 };
}

/* ── the phone ──
   The open ballot for this player, question by question, and the awards
   the TV has already revealed. A player's own chip is not a target unless
   the award allows it. */
export function ballotModel(state, me) {
  const ballot = openBallot(state);
  if (!ballot) return null;
  const mine = ballot.mine || {};
  const questions = ballot.questions.map(question => {
    const nominees = nomineesOf(question);
    return { ...question, nominees, choice:mine[question.id] || null,
      selfBlocked:!!me && nominees.includes(me) && !question.allowSelf };
  });
  const picked = questions.filter(question => question.choice).length;
  return { id:ballot.id, questions, picked, count:questions.length, voted:ballot.voted || 0, of:ballot.of || ROSTER.length,
    canVote:!!me };
}

/* the next question still unanswered after `index`, wrapping; -1 when all are */
export function nextUnanswered(questions, index) {
  const n = questions.length;
  for (let k = 1; k <= n; k++) {
    const i = (index + k) % n;
    if (!questions[i].choice) return i;
  }
  return -1;
}

/* When a phone may show an award's winner: at once for anything the TV has
   finished, else when the TV stamps it (the reveal's own timeline). */
export const stampTime = row => row?.onTvSince
  ? row.onTvSince + awardTimeline({ nominees:row.nominees || [], counts:row.counts }).stamp : 0;
export const rowShown = (row, now) => Number(now) >= stampTime(row);

/* the next moment a held row appears, or null */
export function nextStampAt(rows, now) {
  const waiting = rows.map(stampTime).filter(at => at > Number(now));
  return waiting.length ? Math.min(...waiting) : null;
}

/* revealed awards worth a place on Home: while the reveal runs (each one
   once the TV has stamped it), and for a while after it ends */
export function homeResults(state, now) {
  const rows = awardResults(state);
  if (!rows.length) return [];
  const ballotId = rows[0].ballotId;
  const latest = rows.filter(row => row.ballotId === ballotId);
  const doneAt = latest[0].doneAt;
  if (doneAt && Number(now) - doneAt > PROMPT_RESULTS_WINDOW_MS) return [];
  return latest.filter(row => rowShown(row, now));
}
