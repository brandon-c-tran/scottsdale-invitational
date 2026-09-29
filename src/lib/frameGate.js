/* The fresh-change gate. Pure and React-free: the transport (client.js)
   classifies every state frame here, and motion hooks (motion.js) read the
   latest classification to decide whether a changed value may animate.

   A frame is `fresh` (animatable) only when ALL of these hold:
     1. it is a broadcast of somebody's action (it names a lastAction),
     2. it is not the answer to a hello (a hello answer is a resync),
     3. this socket had already delivered a state before it (the first state
        after a connect or reconnect is a catch-up, never news),
     4. the phone is not settling after a return to the foreground (from the
        foreground probe until that probe's hello is answered),
     5. the page is visible,
     6. it is not a rehearsal jump (JUMP_ACTIONS), and
     7. it is not a correction: a result overwrite or clear, a contest
        correction or undo, a void, a removed ruling, a take-back, a poker
        cancel, or any frame that adds a correction entry to eventOps.
   Everything else renders its end state at once. */

/* Actions whose whole purpose is to rewind or repair. Their frames never
   animate, whatever else changed in them. */
export const REWIND_ACTIONS = Object.freeze(new Set([
  "clearResult", "correctContest", "undoLastContest", "voidWager", "voidDuel", "voidOpenDuels",
  "removeAdjustment", "undoDraftPick", "cancelDraft", "takeBackAnnouncement", "returnToLockerRoom",
  "resetTournament", "restoreEvent", "pokerCancel", "pokerUnbust", "clearDraw", "clearStages",
]));

/* Rehearsal jumps: one write that plays many reducers to land on a named
   point of the weekend (the QA console). Their frames are a teleport, not
   news: the screens show where the board landed, silently. */
export const JUMP_ACTIONS = Object.freeze(new Set(["qaAdvance", "qaRestore"]));

/* The newest correction stamp in state: the count of entries and the latest
   `at` across every event's correction history. Entries are capped per event,
   so both parts are compared. */
export function correctionMark(state) {
  let count = 0, latest = 0;
  const ops = state?.eventOps;
  if (ops && typeof ops === "object") {
    for (const op of Object.values(ops)) {
      const list = Array.isArray(op?.corrections) ? op.corrections : [];
      count += list.length;
      for (const entry of list) latest = Math.max(latest, Number(entry?.at) || 0);
    }
  }
  return `${count}:${latest}`;
}

/* True when the step from prevState to nextState repairs something rather
   than moving the weekend forward. */
export function isCorrectionFrame(prevState, nextState, lastAction) {
  if (lastAction && REWIND_ACTIONS.has(lastAction)) return true;
  if (!prevState || !nextState) return false;
  if (correctionMark(prevState) !== correctionMark(nextState)) return true;
  /* a posted result whose revision moved, or that disappeared */
  const before = prevState.results || {}, after = nextState.results || {};
  for (const [id, result] of Object.entries(before)) {
    const next = after[id];
    if (!next) return true;
    if (Number(next.revision || 1) !== Number(result?.revision || 1)) return true;
  }
  return false;
}

/* Classify one inbound state frame.
   msg:        the raw frame ({ version, lastAction, hello?, state })
   prevState:  the state this device showed before the frame
   hadState:   this socket had already delivered a state before this frame
   settling:   a foreground probe is still waiting for its hello answer
   hidden:     the page is hidden
   accepted:   the frame replaced the snapshot (not an older version) */
export function classifyFrame({ msg, prevState = null, hadState = false, settling = false,
  hidden = false, accepted = true } = {}) {
  const lastAction = typeof msg?.lastAction === "string" ? msg.lastAction : null;
  const resync = typeof msg?.hello === "number";
  const jump = !!lastAction && JUMP_ACTIONS.has(lastAction);
  const live = accepted && !!lastAction && !resync && hadState && !settling && !hidden && !jump;
  const correction = accepted && isCorrectionFrame(prevState, msg?.state, lastAction);
  const reason = !accepted ? "stale" : !hadState ? "first" : resync ? "resync"
    : settling ? "settling" : hidden ? "hidden" : !lastAction ? "quiet" : jump ? "jump"
      : correction ? "correction" : "fresh";
  return { live, correction, fresh:live && !correction, reason, lastAction };
}

/* ── the frame store ──
   The transport publishes every accepted frame; motion hooks subscribe. A
   preview or test with no transport can publish frames itself. */
const INITIAL = Object.freeze({ version:0, seq:0, fresh:false, live:false, correction:false,
  reason:"first", lastAction:null, at:0 });
let frame = INITIAL;
let seq = 0;
const listeners = new Set();

export function publishFrame({ version = 0, fresh = false, live = fresh, correction = false,
  reason = fresh ? "fresh" : "quiet", lastAction = null, at = Date.now() } = {}) {
  frame = Object.freeze({ version, seq:++seq, fresh:!!fresh, live:!!live, correction:!!correction,
    reason, lastAction, at });
  for (const listener of [...listeners]) { try { listener(frame); } catch {} }
  return frame;
}
export const currentFrame = () => frame;
export function subscribeFrame(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function resetFrames() { frame = INITIAL; seq = 0; }
