/* The singer's own "You're up" (karaoke): when your turn comes up on a
   fresh frame, your phone takes over in your color at the walk-up's start
   (after a Legendary rain, when the rain ends), your chip and your song,
   with the sting. It holds the takeover's own length or the walk-up,
   whichever is shorter, and drops the moment its turn moves (Start song
   cuts the walk-up short, Later sends you to the end). Fresh frames only: a
   load, a reconnect or a catch-up shows the sheet's own You're up instead.
   Reduced motion: the sting alone. */
import { useEffect, useRef, useState } from "react";
import { useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { playSound } from "../../lib/sound.js";
import { KARAOKE_UP_MS } from "../../../shared/karaoke.js";
import { UP_TIMING } from "../moments/youreUp.js";
import { nextLatch, useTimeline } from "../tv/tvMotion.js";
import { singerUpKey, singerUpMoment } from "./karaokeModel.js";

/* how long the takeover holds, from the walk-up's start */
export const SINGER_UP_MS = Math.min(UP_TIMING.total, KARAOKE_UP_MS);

/* The takeover to draw now ({ key, player, anchor, song, id, elapsed }), or null. */
export function useSingerUp(state, me, { active = true } = {}) {
  const reduced = useReducedMotion();
  const key = active ? singerUpKey(state, me) : null;
  const change = useFreshChange(key, `sing:${me || ""}`);
  /* reduced motion: no takeover, the one sting at the walk-up's start */
  const rung = useRef(null);
  useEffect(() => {
    if (!change.fresh || !change.to || !reduced || rung.current === change.to) return;
    rung.current = change.to;
    const moment = singerUpMoment(state, me);
    if (moment) playSound("youUp", { at:moment.anchor + UP_TIMING.word, key:`sing:${moment.key}` });
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key:`sing:${me || ""}`,
    build:(from, to) => to ? singerUpMoment(state, me) : null });
  const moment = latch.current?.moment || null;
  /* the turn it was latched for is still the one up, its song not started */
  const valid = !!moment && moment.key === key;
  const anchor = valid ? moment.anchor : 0;
  const now = serverNow();
  const due = valid && now >= anchor;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!valid || due) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, anchor - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [moment?.id, valid, due, anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the sting as YOU'RE UP stamps, on the room's clock */
  useEffect(() => {
    if (!valid || !due) return;
    playSound("youUp", { at:anchor + UP_TIMING.word, key:`sing:${moment.key}` });
  }, [moment?.id, valid, due]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useTimeline(due ? moment.id : null, anchor, SINGER_UP_MS);
  return due && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}
