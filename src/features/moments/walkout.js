/* The Walkout (Backglass signature moment 1). When a win song starts on the
   speaker (state.showControl.audio.walkout, written only by the Worker, an
   `auto` record), the TV and the winner's own phone take over for about nine
   seconds: their identity color floods out from their chip, the album art
   and their photo stand huge, the name stamps in marquee lettering as the clip
   fades in (startedAt on the server clock), the lamps chase in their
   color, and the TV docks it into the Now playing strip. A pair's or a
   team's win walks out as the team (walkoutTeam.js): its name, every
   member's chip, its color, the song credited to the one whose pick it is,
   on the TV and on every teammate's phone. The crown plays its own sequence over the champion's song,
   so a frozen board never walks out.

   The pure model is walkoutModel.js; the hook here latches it on a fresh
   frame only, so a reload, a reconnect, a catch-up or a song already
   running shows the strip. A win song timed to a bit's beat (walkout.bit)
   walks out nowhere: the bit was the moment. */

import { useEffect, useRef, useState } from "react";
import { useFreshChange } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { nextLatch, useTimeline } from "../tv/tvMotion.js";
import { WALKOUT_TIMING, walkoutKey, walkoutPlays, walkoutView } from "./walkoutModel.js";
import { walkoutReaches } from "./walkoutTeam.js";

export { teamColorPlayer, teamRows, walkoutReaches, walkoutTeam } from "./walkoutTeam.js";
/* the pure model (what the takeover shows, its window, what waits for it) */
export { WALKOUT_CLEAR_MS, WALKOUT_JOIN_MS, WALKOUT_TIMING, afterWalkout, podiumHoldUntil, walkoutKey, walkoutPlays, walkoutSpan,
  walkoutView } from "./walkoutModel.js";

/* The takeover to draw now, or null. `delayTo` (server ms) holds the start
   back, e.g. until the TV's podium has turned 1st place; the clip has begun
   by then, so the stamp lands on the reveal instead. `forPlayer` limits it
   to one player's own phone: the singer's, or a teammate's on a team win. */
export function useWalkoutMoment(state, events, { forPlayer = null, delayTo = null, total = WALKOUT_TIMING.total } = {}) {
  const key = walkoutKey(state);
  const change = useFreshChange(key, "walkout");
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key:"walkout", build:(from, to) => {
    const view = walkoutView(state, events);
    if (!view || (forPlayer && !walkoutReaches(view, forPlayer))) return null;
    if (!walkoutPlays({ from, to, startedAt:view.startedAt, now:serverNow() })) return null;
    const anchor = Math.max(view.startedAt, Number(delayTo) || 0);
    return { ...view, key:to, anchor };
  } });
  const moment = latch.current?.moment || null;
  const valid = !!moment && moment.key === key;
  /* a start still ahead (held for the podium) waits for its instant */
  const due = valid && serverNow() >= moment.anchor;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!valid || due) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, moment.anchor - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [moment?.id, valid, due]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useTimeline(due ? moment.id : null, moment?.anchor, total);
  return due && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}
