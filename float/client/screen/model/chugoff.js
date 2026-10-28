/* The chug-off (float/GROOVE.md "The chug-off"): after each song but the
   final, the last rider through and the first rider out race to finish a
   drink in front of the room; the first Done keeps the spot, the other
   leaves with the song's slapstick exit. Pure: what the TV shows at a
   moment, from `room.chugoff` ({ a, b, goAt, doneAt:{ [i]: ms after goAt },
   winner, by }) and the Dones the screen has seen. */
import { CHUGOFF } from "../../../shared/chart.js";

export const CHUG_EXPLAINER = "Last one in against first one out. First to finish keeps the spot.";
export const CHUG_BY_SCORE = "Nobody finished. The better score keeps the spot.";

/* each contender's Done, ms after goAt: the room's, else the store's ev done */
export function chugDones(chugoff, seen = new Map()) {
  const out = {};
  for (const i of [chugoff?.a, chugoff?.b]) {
    if (!Number.isInteger(i)) continue;
    const ms = Number(chugoff?.doneAt?.[i]);
    if (Number.isFinite(ms)) out[i] = ms;
    else if (Number.isFinite(chugoff?.goAt) && Number.isFinite(seen.get?.(i)) && seen.get(i) >= chugoff.goAt) out[i] = seen.get(i) - chugoff.goAt;
  }
  return out;
}

/* The chug-off at server time `now`: { a, b, goAt, stage, count, clockMs,
   done, winner, by, winAt, exitAt, loser } where stage is "call" (the
   names), "count" (3 2 1), "chug" (racing), "won" (the stamp), "exit" (the
   loser's exit) and count the number up (3, 2, 1, or "Chug!" for a second
   after goAt). */
export function chugoffAt(chugoff, now, { seen = new Map(), startAt = null } = {}) {
  if (!chugoff || !Number.isInteger(chugoff.a) || !Number.isInteger(chugoff.b)) return null;
  const goAt = Number.isFinite(chugoff.goAt) ? chugoff.goAt : Number.isFinite(startAt) ? startAt + CHUGOFF.INTRO_MS : null;
  const done = chugDones({ ...chugoff, goAt }, seen);
  let winner = Number.isInteger(chugoff.winner) ? chugoff.winner : null;
  let by = chugoff.by || null;
  /* the first Done the screen saw, before the room's word */
  if (winner === null && Object.keys(done).length) {
    winner = Number(Object.entries(done).sort((x, y) => x[1] - y[1])[0][0]);
    by = "chug";
  }
  const winMs = winner !== null ? (Number.isFinite(done[winner]) ? done[winner] : null) : null;
  const winAt = winner !== null && goAt !== null ? (winMs !== null ? goAt + winMs : now) : null;
  const exitAt = winAt !== null ? winAt + CHUGOFF.REVEAL_MS : null;
  const loser = winner === null ? null : winner === chugoff.a ? chugoff.b : chugoff.a;
  let stage = "call", count = null;
  if (goAt !== null) {
    const left = goAt - now;
    if (left > 3000) stage = "call";
    else if (left > 0) { stage = "count"; count = String(Math.ceil(left / 1000)); }
    else { stage = "chug"; if (-left < 1100) count = "Chug!"; }
  }
  if (winAt !== null && now >= winAt) stage = exitAt !== null && now >= exitAt ? "exit" : "won";
  const clockMs = goAt === null ? 0 : Math.max(0, Math.min(now, winAt ?? now) - goAt);
  return { a:chugoff.a, b:chugoff.b, goAt, stage, count, clockMs, done, winner, by, winAt, exitAt, loser };
}

/* "4.2": seconds to one decimal */
export const chugClock = ms => (Math.max(0, ms) / 1000).toFixed(1);
