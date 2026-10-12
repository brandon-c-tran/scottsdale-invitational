/* A moment on the phones of the players it is about (Oct 10): the bit the
   TV plays (gagModel latestGag) on each audience phone (gagAudience: both
   sides of an upset, a win's winners, a loss's loser), at the same server
   instant. Only a write that reached this phone on a fresh frame plays it:
   a phone that opens, reloads, reconnects or catches up after the write
   shows nothing. Its start follows the state until it plays (the write's
   win song walks out first, in a later write), then holds; once on screen
   it plays to its end or a tap. From the fresh frame to its end it holds
   the stage (motion.js holdStage), so the chip receipt that write owes
   this phone docks after the bit, never over it. Light: the drawing loads
   on first use (PhoneBit.jsx through lazyPart). */

import { useEffect, useMemo, useRef, useState } from "react";
import { holdStage, useFreshChange } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { gagForPlayer } from "./gagModel.js";

/* the receipt waits this long past the bit's end, and never longer than
   the cap (a walkout and a result's podium before it included) */
export const PHONE_BIT_HOLD_SLACK_MS = 600;
export const PHONE_BIT_HOLD_MAX_MS = 40000;
/* how long, from `now`, a latched moment holds the stage */
export const phoneBitHoldMs = (moment, now) => !moment ? 0
  : Math.max(1000, Math.min(PHONE_BIT_HOLD_MAX_MS, Number(moment.end) - Number(now) + PHONE_BIT_HOLD_SLACK_MS));

/* One step of the phone's memory of its moment, pure:
     latch     { id, start, held, moment } once a fresh change made it this
               phone's, else null
     owed      the moment the state owes this phone now (gagForPlayer)
     fresh     the id that just arrived on a fresh frame, or null
   A moment latches only on its fresh arrival; until it starts its window
   follows `owed`, and once started (now >= start) it is held, so a write
   landing after (the next contest locked) never takes it off this screen.
   One that leaves `owed` before it started is gone. */
export function phoneBitStep(latch, { owed = null, fresh = null, now = 0, dismissed = null } = {}) {
  let next = latch;
  if (fresh && owed?.id === fresh && latch?.id !== fresh) next = { id:fresh, held:false, moment:owed };
  if (!next) return null;
  if (!next.held) {
    if (owed?.id !== next.id) return null;
    next = { ...next, moment:owed, held:Number(now) >= Number(owed.start) };
  }
  const { moment } = next;
  if (dismissed === next.id || Number(now) >= Number(moment.end)) return { ...next, done:true };
  return { ...next, done:false };
}

/* the phone's moment: { moment (with elapsed) | null while it waits or is
   done, pending (latched and not over: the stage is held), dismiss } */
export function usePhoneBit(state, events, me, { active = true } = {}) {
  const owed = useMemo(() => active && me ? gagForPlayer(state, events, me) : null, [state, events, me, active]);
  const change = useFreshChange(owed?.id || null, me || null);
  const [dismissed, setDismissed] = useState(null);
  const [, wake] = useState(0);
  const latch = useRef(null);
  const now = serverNow();
  latch.current = phoneBitStep(latch.current, { owed, fresh:change.fresh ? change.to : null, now, dismissed });
  const step = latch.current;
  const pending = !!step && !step.done;
  const moment = pending ? step.moment : null;
  const due = !!moment && now >= moment.start;
  /* wake for its start and its end, not on any clock tick */
  const edge = !moment ? null : due ? moment.end : moment.start;
  useEffect(() => {
    if (!edge) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, edge - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [edge, moment?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the receipt waits for it: held from the fresh frame to its end */
  useEffect(() => pending ? holdStage(`bit:${step.id}`, { maxMs:phoneBitHoldMs(moment, serverNow()) }) : undefined,
    [pending, step?.id, moment?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    moment:due ? { ...moment, elapsed:Math.max(0, now - moment.start) } : null,
    pending,
    dismiss:() => { if (step?.id) setDismissed(step.id); },
  };
}
