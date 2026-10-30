/* One server-anchored clock for every device. The blind clock, TV scene
   timers, ambient rotation, the shared heartbeat, and synced reveals all read
   serverNow(), so thirteen phones and two TVs agree even when their own
   clocks drift.

   Every state frame and pong carries the server's send time (`serverNow`),
   and each broadcast carries its write time (state.updatedAt). A frame can
   only arrive AFTER it was stamped, so (serverTime - receivedAt) always
   underestimates the true offset by the delivery latency; the largest recent
   sample is the best estimate. The transport feeds frames in directly
   (src/lib/client.js); useServerClockSync stays for surfaces that only have a
   tournament snapshot. */

import { useEffect, useState } from "react";

const SAMPLE_LIMIT = 8;
const MAX_PLAUSIBLE_OFFSET_MS = 12 * 60 * 60 * 1000;
let samples = [];
let offset = 0;
const listeners = new Set();

function publish(previous) {
  if (offset === previous) return;
  for (const listener of [...listeners]) { try { listener(offset); } catch {} }
}

export function noteServerTime(serverTime, receivedAt = Date.now()) {
  const t = Number(serverTime);
  if (!Number.isFinite(t) || t <= 0) return offset;
  const estimate = t - receivedAt;
  if (Math.abs(estimate) > MAX_PLAUSIBLE_OFFSET_MS) return offset;
  const previous = offset;
  samples = [...samples, estimate].slice(-SAMPLE_LIMIT);
  offset = Math.max(...samples);
  publish(previous);
  return offset;
}
export const serverOffset = () => offset;
export const serverNow = () => Date.now() + offset;
export function resetServerClock() { const previous = offset; samples = []; offset = 0; publish(previous); }

/* Called with the new offset whenever the estimate moves. Returns unsubscribe. */
export function onServerClock(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* Where a repeating period of `periodMs` sits right now on the server clock:
   0 at the start of a period, rising to periodMs. Every device computes the
   same phase for the same server instant. */
export function serverPhase(periodMs, now = serverNow()) {
  const period = Number(periodMs);
  if (!Number.isFinite(period) || period <= 0) return 0;
  return ((now % period) + period) % period;
}

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

/* A wake on a server instant that can't come early. A screen that wakes
   on the instants it changes by itself (a buzzer lighting, an answer turn
   opening) arms a timer for the gap on the server clock; when the timer
   fires a hair short of the instant (the clock's estimate moved back
   between arming and firing: the max of the last samples drops as its best
   one ages out, every few frames; or the timer itself ran early), a plain
   wake re-renders on the same instant and arms nothing more, and the
   screen sits on its last state until some frame happens along. In a
   solo game nothing does: the options never light and the turn times out
   (Oct 29 playtest). This one checks the server clock when it fires and
   arms again until the instant has come, then wakes once.

   armServerWake is the loop, pure over its clock and timers (tested);
   useServerWake re-renders at `at` (0: none), an instant after `drawnAt`,
   the server time the caller drew with, and arms again after every wake,
   so a render that still read short of `at` keeps waiting for it. An `at`
   the drawing already reached wakes nothing: it can never loop. */
export function armServerWake(at, onWake, { slack = 5, now = serverNow, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let live = true;
  const check = () => {
    timer = null;
    if (!live) return;
    const wait = Number(at) - now();
    if (wait <= 0) { onWake(); return; }
    timer = setTimer(check, wait + slack);
  };
  check();
  return () => { live = false; if (timer !== null) clearTimer(timer); };
}
export function useServerWake(at, { drawnAt = 0, slack = 5 } = {}) {
  const [woke, wake] = useState(0);
  const pending = !!at && !(Number(drawnAt) >= Number(at));
  useEffect(() => {
    if (!pending) return undefined;
    return armServerWake(at, () => wake(n => n + 1), { slack });
  }, [at, pending, woke, slack]);
  return woke;
}
