/* One server-anchored clock for every device. The blind clock, TV scene
   timers, and ambient rotation all read serverNow(), so a phone and two TVs
   agree even when their own clocks drift.

   Each broadcast carries the server's write time (state.updatedAt). A frame
   can only arrive AFTER it was written, so (serverTime - receivedAt) always
   underestimates the true offset by the delivery latency; the largest recent
   sample is the best estimate. A frame-level serverNow, when the transport
   provides one, is used the same way. */

import { useEffect, useState } from "react";

const SAMPLE_LIMIT = 8;
const MAX_PLAUSIBLE_OFFSET_MS = 12 * 60 * 60 * 1000;
let samples = [];
let offset = 0;

export function noteServerTime(serverTime, receivedAt = Date.now()) {
  const t = Number(serverTime);
  if (!Number.isFinite(t) || t <= 0) return offset;
  const estimate = t - receivedAt;
  if (Math.abs(estimate) > MAX_PLAUSIBLE_OFFSET_MS) return offset;
  samples = [...samples, estimate].slice(-SAMPLE_LIMIT);
  offset = Math.max(...samples);
  return offset;
}
export const serverOffset = () => offset;
export const serverNow = () => Date.now() + offset;
export function resetServerClock() { samples = []; offset = 0; }

/* Feed the clock from the transport snapshot. Only broadcasts (a frame with
   a lastAction) carry a fresh write time; the hello frame's updatedAt can be
   hours old and is ignored unless the frame itself states serverNow. */
export function useServerClockSync(tournament) {
  const { state, version, lastAction } = tournament || {};
  const frameNow = tournament?.serverNow ?? tournament?.serverTime;
  useEffect(() => {
    if (Number.isFinite(Number(frameNow)) && Number(frameNow) > 0) noteServerTime(frameNow);
    else if (lastAction && state?.updatedAt) noteServerTime(state.updatedAt);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* a ticking server-anchored now; period 0 disables the tick */
export function useServerNow(periodMs = 1000) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!periodMs) return undefined;
    const t = setInterval(() => setNow(serverNow()), periodMs);
    return () => clearInterval(t);
  }, [periodMs]);
  return now;
}
