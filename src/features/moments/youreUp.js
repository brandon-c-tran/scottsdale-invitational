/* "You're up" (Backglass signature moment 2): when a two-sided contest
   becomes the current contest with betting open (the D2 face-off's own
   trigger), each competitor's phone takes over in their identity color at
   the same server instant the TV's sides slam in: "You're up", who against,
   a two-note sting on the VS, and one tap to back yourself (Bets, where
   caps and pending guards live). Spectators get a compact banner with both
   sides. Fresh frames only: a reload, a reconnect or a catch-up shows the
   Home card instead. Pure model here; the hook latches it. */

import { useEffect, useMemo, useRef, useState } from "react";
import { allEventsOf, resolveCurrentContest } from "../../../shared/core.js";
import { useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { playSound } from "../../lib/sound.js";
import { FACEOFF_TIMING as F, faceOffKey, faceOffPlays, faceOffStart, faceOffView } from "../tv/faceOff.js";
import { nextLatch, useTimeline } from "../tv/tvMotion.js";

/* ms from the takeover's start (the TV's left side slamming in) */
export const UP_TIMING = Object.freeze({
  flood:0, floodMs:700,          // your color floods up from your chip
  word:250, wordMs:380,          // YOU'RE UP stamps
  sting:F.vs - F.slide,          // the two-note sting, on the TV's VS
  vs:F.vs - F.slide + 80,        // their chip lands opposite yours
  total:7000,                    // it leaves on its own
  banner:5000,                   // a spectator's banner
});

/* the event whose current contest is two-sided with its market open */
export function currentFaceOff(state, events = allEventsOf(state)) {
  for (const ev of events) {
    if (state?.results?.[ev.id] || state?.shelved?.[ev.id]) continue;
    let contest = null;
    try { contest = resolveCurrentContest(state, ev); } catch { contest = null; }
    if (faceOffKey(ev, contest)) return { ev, contest };
  }
  return null;
}

/* whether this player's phone takes the sting for a contest (GuestHome
   then leaves its own "You're playing" sound to it) */
export const youreUpTakes = (contest, me) => !!me && contest?.sides?.length === 2 && contest.phase === "betting-open"
  && !!contest.players?.includes(me);

/* What the takeover shows for this phone, or null. */
export function youreUpView(state, events, found, me) {
  if (!found || !me) return null;
  const view = faceOffView(state, found.ev, found.contest, events);
  if (!view) return null;
  const mineIndex = view.sides.findIndex(side => side.players.includes(me));
  const base = { key:faceOffKey(found.ev, found.contest), event:found.ev.name, label:view.label, record:view.record,
    sides:view.sides, contestId:found.contest.id, evId:found.ev.id };
  if (mineIndex < 0) return { ...base, role:"spectator" };
  return { ...base, role:"player", mine:view.sides[mineIndex], other:view.sides[1 - mineIndex],
    partners:view.sides[mineIndex].players.filter(player => player !== me) };
}

/* The takeover to draw now ({ ...view, elapsed }), or null. */
export function useYoureUp(state, me, { active = true } = {}) {
  const reduced = useReducedMotion();
  const events = useMemo(() => allEventsOf(state), [state]);
  const found = useMemo(() => active ? currentFaceOff(state, events) : null, [state, events, active]);
  const key = found ? faceOffKey(found.ev, found.contest) : null;
  const change = useFreshChange(key, `up:${me || ""}`);
  /* reduced motion: no takeover, the one sting on the TV's beat */
  const rung = useRef(null);
  useEffect(() => {
    if (!change.fresh || !change.to || !reduced || rung.current === change.to) return;
    rung.current = change.to;
    if (youreUpTakes(found?.contest, me))
      playSound("youUp", { at:faceOffStart(state, found.ev) + F.vs, key:`up:${change.to}` });
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key:`up:${me || ""}`, build:(from, to) => {
    if (!faceOffPlays(from, to)) return null;
    const view = youreUpView(state, events, found, me);
    return view ? { ...view, anchor:faceOffStart(state, found.ev) + F.slide } : null;
  } });
  const moment = latch.current?.moment || null;
  const valid = !!moment && moment.key === key;
  /* the TV's face-off may still be ahead (the intro and draw first) */
  const due = valid && serverNow() >= moment.anchor;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!valid || due) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, moment.anchor - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [moment?.id, valid, due]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the sting lands on the TV's VS, on the room's clock */
  useEffect(() => {
    if (!valid || moment.role !== "player") return;
    playSound("youUp", { at:moment.anchor + UP_TIMING.sting, key:`up:${moment.key}` });
  }, [moment?.id, valid]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = moment?.role === "player" ? UP_TIMING.total : UP_TIMING.banner;
  const timeline = useTimeline(due ? moment.id : null, moment?.anchor, total);
  return due && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}
