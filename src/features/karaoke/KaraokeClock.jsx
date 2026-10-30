import React, { useEffect, useRef, useState } from "react";
import { serverNow, useServerWake } from "../../lib/serverClock.js";
import { clockText, nextKaraokeInstant } from "./karaokeModel.js";

/* The phone's clock for karaoke: the server clock, woken on the game's own
   instants (karaokeInstants: the window's end, each walk-up, song, end and
   close, the reveal's steps), never ticking through a song. `fixed` holds
   an instant (tests, rehearsals). The wake can't land short and stay
   there (useServerWake, the board's Oct 29 fix): a phone with no frame
   coming would otherwise sit on its last screen. */
export function useKaraokeNow(game, fixed) {
  const now = fixed ?? serverNow();
  const next = fixed === undefined ? nextKaraokeInstant(game, now) : 0;
  useServerWake(next, { drawnAt:now });
  return now;
}

/* the seconds left of a short window (the pick, a walk-up, a vote's
   grace): only this number ticks, once a second, and stops at zero */
export function Countdown({ until, fixed, className = "" }) {
  const [, tick] = useState(0);
  const now = fixed ?? serverNow();
  const left = until - now;
  useEffect(() => {
    if (fixed !== undefined || left <= 0) return undefined;
    const timer = setTimeout(() => tick(n => n + 1), (left % 1000 || 1000) + 5);
    return () => clearTimeout(timer);
  });
  const seconds = Math.max(0, Math.ceil(left / 1000));
  return <span className={`fd-karaoke-clock${seconds <= 10 ? " is-low" : ""}${className ? ` ${className}` : ""}`} role="timer"
    aria-label={`${seconds} seconds`}>{clockText(left)}</span>;
}

/* what is left of a window, draining on the server clock (read once as it
   mounts; one drawn before its window opens waits for it). Key it on the
   window's end, so More time or a cut redraws it. */
export function Drain({ from, until, now, className = "" }) {
  const total = Math.max(1, until - from);
  const at = useRef(null);
  if (at.current === null) at.current = { left:Math.max(0, Math.min(total, until - now)), wait:Math.max(0, Math.round(from - now)) };
  const { left, wait } = at.current;
  return <i className={`fd-karaoke-drain${className ? ` ${className}` : ""}`} aria-hidden="true"
    style={{ "--drain-left":(left / total).toFixed(4), "--drain-ms":`${Math.round(left)}ms`, "--drain-wait":`${wait}ms`,
      "--drain-low":`${wait + Math.max(0, Math.round(left - Math.min(10000, total * 0.25)))}ms` }} />;
}
