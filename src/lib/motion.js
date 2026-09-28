/* Motion foundation (M0). Every animated surface imports from here, so the
   whole app moves on one set of timings and one set of rules.

   THE CONTRACT
   1. Only fresh changes animate. A change is fresh when the frame that
      brought it was a live broadcast on a settled socket, and it was not a
      correction (see frameGate.js for the exact rule). First mount, the first
      state after a connect or reconnect, the catch-up after returning to the
      foreground, and any correction or rewind render their end state at once.
      Use useFreshChange / useCountUp; never compare props yourself.
   2. Reduced motion shows the end state immediately. JS reads
      useReducedMotion(); CSS follows the pattern below. Static cues (a color,
      an arrow, a label) still appear; only movement is removed.
   3. Nothing blocks input. Animations are transform/opacity only, layers are
      pointer-events:none, and no write waits on an animation.
   4. Haptics are not motion: they follow the device toggle in haptics.js.

   CSS PATTERN (tokens live in src/ui/motion.css):
     .thing { animation: fd-delta-rise var(--motion-delta) var(--ease-out) both; }
     @media (prefers-reduced-motion: reduce) { .thing { animation: none; } }
   shell.css already removes every animation and transition under reduced
   motion; write the end state as the element's resting style, never only as
   an animation's last keyframe.

   API
     MOTION, EASE                      named durations (ms) and easings
     prefersReducedMotion(), useReducedMotion()
     useMotionFrame()                  the latest classified state frame
     useFreshChange(value, key?)       { fresh, animate, changeId, from, to }
     useCountUp(value, { key, step })  { value, delta, changeId, counting }
     countValueAt(from, to, p, step)   the stepped number at progress p
     signedChips(n)                    "+400" / "−500"
     fly(from, to, options)            Promise<boolean>: a clone flies between rects
     registerFlightTarget(name, el), useFlightTarget(name), flightTarget(name)
     MotionRoot                        mounted once in App: flight layer + heartbeat
     alignHeartbeat()                  re-phase every beat to the server clock */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PT } from "../../shared/core.js";
import { currentFrame, subscribeFrame } from "./frameGate.js";
import { onServerClock, serverPhase } from "./serverClock.js";

/* ── tokens ── (mirrored as custom properties in src/ui/motion.css) */
export const MOTION = Object.freeze({
  fast:140,          // presses, small state flips
  base:260,          // standard enter, sheet rise, lock wipe
  story:720,         // a composed beat
  count:750,         // a number counts in PT steps
  delta:1100,        // the change rises off a number and fades
  rowSlide:560,      // standings rows move to their new rank
  rowStagger:10,
  rankRoll:200,      // rank digits roll once rows land
  stamp:320,         // WON / CHAMPION stamps
  flight:340,        // a chip leaves the rack on an arc
  cardFlight:520,    // a drafted card flies to its seat
  pop:320,           // the catch-up pop when the link returns
  sheetIn:260,
  sheetOut:200,
  settleHold:2400,   // how long a settled result holds before the next beat
  beat:2000,         // the shared heartbeat period
});
export const EASE = Object.freeze({
  out:"cubic-bezier(.2,.8,.2,1)",
  land:"cubic-bezier(.3,.7,.35,1.25)",
  exit:"cubic-bezier(.5,0,.75,.4)",
});
/* A change must reach the screen within this long of its frame to count as
   caused by it; a later local re-render is not news. */
export const FRESH_WINDOW_MS = 1500;

/* ── reduced motion ── */
const QUERY = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY)?.matches;

/* Follows the system setting live, so turning it on mid-weekend stops
   motion without a reload. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const media = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : null;
    if (!media) return undefined;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/* ── easing math (pure) ── */
export function cubicBezier(x1, y1, x2, y2) {
  const a = (p1, p2) => 1 - 3 * p2 + 3 * p1, b = (p1, p2) => 3 * p2 - 6 * p1, c = p1 => 3 * p1;
  const at = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  const solve = x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      const next = t - (at(t, x1, x2) - x) / d;
      if (next < 0 || next > 1) break;
      t = next;
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < 30 && Math.abs(at(t, x1, x2) - x) > 1e-5; i++) {
      if (at(t, x1, x2) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return x => x <= 0 ? 0 : x >= 1 ? 1 : at(solve(x), y1, y2);
}
const parseBezier = css => {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css || "");
  const v = m ? m[1].split(",").map(Number) : null;
  return v && v.length === 4 && v.every(Number.isFinite) ? cubicBezier(...v) : null;
};
export const easeFn = {
  out:parseBezier(EASE.out),
  land:parseBezier(EASE.land),
  exit:parseBezier(EASE.exit),
  cubicOut:x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3),
};

/* ── counting (pure) ── */
export const quantize = (value, step = PT) => step > 0 ? Math.round(value / step) * step : value;
/* The number shown at progress p (0..1) of a count from `from` to `to`.
   It only ever shows values that can exist: from + a whole number of steps. */
export function countValueAt(from, to, p, step = PT) {
  if (p >= 1) return to;
  if (p <= 0) return from;
  return from + quantize((to - from) * easeFn.cubicOut(p), step);
}
export const signedChips = n => {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")}`;
};

/* ── the fresh-change gate for components ── */
export function useMotionFrame() {
  return useSyncExternalStore(subscribeFrame, currentFrame, currentFrame);
}

/* Decide, during render, whether `value` just changed because of a fresh
   frame. `key` names the subject: when it changes (another player, another
   contest) the new value is a different thing, not a change. Pure so the
   rule is testable; the hook below is the only caller in the app. */
export function freshChangeStep(committed, { value, key = null, frame, now = Date.now(), equals = Object.is }) {
  if (!committed) return { fresh:false, changeId:0, from:value, to:value };
  if (key !== committed.key) return { fresh:false, changeId:committed.changeId, from:value, to:value };
  if (equals(value, committed.value)) return { fresh:false, changeId:committed.changeId, from:committed.from, to:committed.to };
  const byFrame = !!frame?.fresh && frame.seq !== committed.frameSeq && now - (frame.at || 0) <= FRESH_WINDOW_MS;
  return byFrame
    ? { fresh:true, changeId:committed.changeId + 1, from:committed.value, to:value }
    : { fresh:false, changeId:committed.changeId, from:value, to:value };
}

/* { fresh, animate, changeId, from, to }
   fresh:    this render carries a fresh change (use for static cues)
   animate:  fresh and motion allowed (use for movement)
   changeId: increments once per fresh change; key effects and float
             elements on it so a new change restarts them */
export function useFreshChange(value, key = null, { equals = Object.is } = {}) {
  const frame = useMotionFrame();
  const reduced = useReducedMotion();
  const committed = useRef(null);
  const step = freshChangeStep(committed.current, { value, key, frame, equals });
  useLayoutEffect(() => {
    committed.current = { value, key, frameSeq:frame.seq, changeId:step.changeId, from:step.from, to:step.to };
  });
  return { ...step, animate:step.fresh && !reduced };
}

/* A number that counts to its new value in PT steps when (and only when) the
   change is fresh. `delta` is { amount, id } for MOTION.delta after a fresh
   change so the caller can float "+400" off the number:
     const { value, delta } = useCountUp(pts, { key:player });
     {delta && <span key={delta.id} className={`fd-motion-delta ${delta.amount > 0 ? "is-up" : "is-down"}`}>
       {signedChips(delta.amount)}</span>} */
export function useCountUp(value, { key = null, step = PT, duration = MOTION.count, delay = 0 } = {}) {
  const change = useFreshChange(value, key);
  const anim = useRef(null);
  const painted = useRef(value);
  const [, rerender] = useState(0);
  const [delta, setDelta] = useState(null);
  const running = anim.current && anim.current.to === value ? anim.current : null;
  const display = running
    ? countValueAt(running.from, running.to, (clock() - running.start - delay) / duration, step)
    : value;

  useLayoutEffect(() => {
    if (!change.fresh) {
      if (anim.current) { anim.current = null; rerender(n => n + 1); }
      setDelta(null);
      return undefined;
    }
    setDelta({ amount:change.to - change.from, id:change.changeId });
    const from = painted.current;
    if (!change.animate || from === value || typeof requestAnimationFrame !== "function") return undefined;
    anim.current = { from, to:value, start:clock() };
    let raf = 0;
    const loop = () => {
      const current = anim.current;
      if (!current || current.to !== value) return;
      if (clock() - current.start >= duration + delay) anim.current = null;
      rerender(n => n + 1);
      if (anim.current) raf = requestAnimationFrame(loop);
    };
    rerender(n => n + 1);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [change.changeId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  /* declared after the effect above so it reads the previous paint */
  useLayoutEffect(() => { painted.current = display; });

  useEffect(() => {
    if (!delta) return undefined;
    const t = setTimeout(() => setDelta(current => current?.id === delta.id ? null : current), MOTION.delta + delay);
    return () => clearTimeout(t);
  }, [delta, delay]);

  return { value:display, delta, changeId:change.changeId, counting:!!running };
}
const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* ── flight ──
   One fixed layer, pointer-events:none, above every sheet. A flight clones a
   DOM node (or renders a React element through MotionRoot's portal), pins it
   over the source rect, and animates transform/opacity to the target rect
   with WAAPI. It never rejects: it resolves true when it flew and false when
   it was skipped (reduced motion, hidden page, missing or offscreen rect,
   too many in the air), so callers can always `await` it. */
const targets = new Map();
const MAX_FLIGHTS = 24;
let flightsInAir = 0;

export function registerFlightTarget(name, el) {
  if (!name || !el) return () => {};
  const set = targets.get(name) || new Set();
  set.add(el);
  targets.set(name, set);
  return () => { set.delete(el); if (!set.size && targets.get(name) === set) targets.delete(name); };
}
/* The most recently registered target with this name that is on screen. */
export function flightTarget(name) {
  const set = targets.get(name);
  if (!set) return null;
  const list = [...set].reverse();
  return list.find(el => el.isConnected && rectVisible(rectOf(el))) || null;
}
/* A ref callback that registers the element under `name` while mounted:
     <span ref={useFlightTarget("tab:home")} /> */
export function useFlightTarget(name) {
  const release = useRef(null);
  return useCallback(el => {
    release.current?.();
    release.current = el ? registerFlightTarget(name, el) : null;
  }, [name]);
}

const rectOf = source => {
  if (!source) return null;
  if (typeof source === "string") { const el = flightTarget(source); return el ? rectOf(el) : null; }
  if (typeof source.getBoundingClientRect === "function") return source.isConnected === false ? null : source.getBoundingClientRect();
  if (["left", "top", "width", "height"].every(k => Number.isFinite(source[k]))) return source;
  return null;
};
const viewport = () => typeof window === "undefined" ? { width:0, height:0 }
  : { width:window.innerWidth || 0, height:window.innerHeight || 0 };
export function rectVisible(rect, view = viewport()) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false;
  return rect.left < view.width && rect.top < view.height && rect.left + rect.width > 0 && rect.top + rect.height > 0;
}

/* Keyframes for a flight from one rect to another: a quadratic arc lifted by
   `arc` px at its middle, sampled with the easing baked in so the arc stays
   smooth in every browser (the animation itself runs linear). Pure. */
export function flightKeyframes(from, to, { arc = 0, scale = "fit", fade = false, easing = EASE.out, frames = 16 } = {}) {
  const ease = parseBezier(easing) || easeFn.out;
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  const end = scale === "fit"
    ? Math.min(to.width / from.width, to.height / from.height)
    : Number.isFinite(scale) ? scale : 1;
  const lift = Number(arc) || 0;
  return Array.from({ length:frames + 1 }, (_, i) => {
    const t = i / frames, e = ease(t);
    /* quadratic bezier: start (0,0), control (dx/2, dy/2 - 2*lift), end (dx,dy) */
    const x = dx * e;
    const y = dy * e - 4 * lift * e * (1 - e);
    const s = 1 + (end - 1) * e;
    const frame = { offset:t, transform:`translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})` };
    if (fade) frame.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    return frame;
  });
}

/* Keyframes for a second leg: the shell still sits on `base` (its own rect)
   and already wears the transform that put it on `a`; this moves it on to
   `b`. Scale is relative to `base`, fitted to each rect. Pure. */
export function legKeyframes(base, a, b, { arc = 0, fade = false, easing = EASE.out, frames = 12 } = {}) {
  const ease = parseBezier(easing) || easeFn.out;
  const cx = r => r.left + r.width / 2, cy = r => r.top + r.height / 2;
  const fit = r => Math.min(r.width / base.width, r.height / base.height);
  const sa = fit(a), sb = fit(b), lift = Number(arc) || 0;
  return Array.from({ length:frames + 1 }, (_, i) => {
    const t = i / frames, e = ease(t);
    const x = cx(a) + (cx(b) - cx(a)) * e - cx(base);
    const y = cy(a) + (cy(b) - cy(a)) * e - 4 * lift * e * (1 - e) - cy(base);
    const s = sa + (sb - sa) * e;
    const frame = { offset:t, transform:`translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)})` };
    if (fade) frame.opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    return frame;
  });
}
/* the longest a flight waits on its `hold` before it simply leaves */
export const MAX_HOLD_MS = 20000;

let layerEl = null;
function flightLayer() {
  if (typeof document === "undefined") return null;
  if (layerEl?.isConnected) return layerEl;
  layerEl = document.getElementById("fd-flight-layer");
  if (!layerEl) {
    layerEl = document.createElement("div");
    layerEl.id = "fd-flight-layer";
    layerEl.className = "fd-flight-layer";
    layerEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(layerEl);
  }
  return layerEl;
}

/* MotionRoot registers here so a React element can fly inside the app's
   providers (player identity, theme). */
let portalHost = null;

/* fly(from, to, options) → Promise<boolean>
   from, to:  an Element, a flight target name ("tab:home"), or a rect
   options:
     node      what flies: an Element, a React element, or omitted to clone `from`
     duration  ms, default MOTION.flight
     delay     ms before it leaves
     arc       px the path lifts at its middle (default 0: a straight line)
     scale     "fit" (default: land at the target's size) or a number
     fade      fade out over the last 30%
     easing    a cubic-bezier() string, default EASE.out
     land      pulse the target element when the flight arrives
     hold      a Promise: on arrival the clone hovers (gently bobbing) until
               it settles. It resolves to nothing (the clone leaves where it
               is) or to a second leg { to, duration, arc, fade, easing, land }
               flown from the hover spot. Capped at MAX_HOLD_MS. */
export function fly(from, to, options = {}) {
  const { node = null, duration = MOTION.flight, delay = 0, arc = 0, scale = "fit",
    fade = false, easing = EASE.out, land = false, hold = null } = options;
  const skip = Promise.resolve(false);
  if (typeof document === "undefined" || typeof window === "undefined") return skip;
  if (prefersReducedMotion() || document.hidden) return skip;
  if (flightsInAir >= MAX_FLIGHTS) return skip;
  const fromRect = rectOf(from), toRect = rectOf(to);
  if (!rectVisible(fromRect) || !rectVisible(toRect)) return skip;
  const layer = flightLayer();
  if (!layer) return skip;

  const shell = document.createElement("div");
  shell.className = "fd-flight";
  Object.assign(shell.style, { left:`${fromRect.left}px`, top:`${fromRect.top}px`,
    width:`${fromRect.width}px`, height:`${fromRect.height}px` });
  let unmountReact = null, mounted = Promise.resolve();
  if (node && React.isValidElement(node)) {
    if (!portalHost) return skip;
    const host = portalHost.add(shell, node);
    unmountReact = host.remove;
    /* a host that never renders it (unmounted mid-flight) skips the flight */
    mounted = Promise.race([host.ready.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 500))]);
  } else {
    const source = node || (typeof from?.cloneNode === "function" ? from : null);
    if (!source) return skip;
    const copy = node ? source : source.cloneNode(true);
    copy.removeAttribute?.("id");
    shell.appendChild(copy);
  }
  layer.appendChild(shell);
  flightsInAir++;
  const frames = flightKeyframes(fromRect, toRect, { arc, scale, fade, easing });
  const done = () => {
    flightsInAir = Math.max(0, flightsInAir - 1);
    unmountReact?.();
    shell.remove();
  };
  /* until the first frame applies, the shell sits on the source rect */
  shell.style.transform = frames[0].transform;
  return mounted.then(ok => new Promise(resolve => {
    if (ok === false) { done(); resolve(false); return; }
    let animation;
    try {
      animation = shell.animate(frames, { duration, delay, easing:"linear", fill:"forwards" });
    } catch { done(); resolve(false); return; }
    const pulse = (dest, on) => {
      const target = typeof dest === "string" ? flightTarget(dest) : dest;
      if (on && typeof target?.animate === "function" && !prefersReducedMotion()) {
        try {
          target.animate([{ transform:"scale(1)" }, { transform:"scale(1.14)" }, { transform:"scale(1)" }],
            { duration:MOTION.pop, easing:EASE.land });
        } catch {}
      }
    };
    animation.finished.then(() => {
      if (!hold) { done(); pulse(to, land); resolve(true); return; }
      shell.classList.add("is-hover");
      let timer = 0;
      const capped = new Promise(settle => { timer = setTimeout(() => settle(null), MAX_HOLD_MS); });
      Promise.race([Promise.resolve(hold).catch(() => null), capped]).then(next => {
        clearTimeout(timer);
        shell.classList.remove("is-hover");
        const toRect2 = next?.to ? rectOf(next.to) : null;
        if (!toRect2 || !rectVisible(toRect2) || document.hidden || !shell.isConnected) {
          done(); resolve(true); return;
        }
        let second;
        try {
          second = shell.animate(legKeyframes(fromRect, toRect, toRect2, next),
            { duration:next.duration ?? MOTION.flight, easing:"linear", fill:"forwards" });
        } catch { done(); resolve(true); return; }
        second.finished.then(() => { done(); pulse(next.to, next.land); resolve(true); },
          () => { done(); resolve(true); });
      });
    }, () => { done(); resolve(false); });
  }));
}

/* ── heartbeat ──
   Every .fd-beat / .fd-beat-dot (src/ui/motion.css) runs one CSS animation
   whose phase is pinned to the server clock: each animation's startTime is
   set so its local time equals serverNow() % MOTION.beat. A CSS delay alone
   cannot do this (a delay counts from each element's own mount), so new
   beats are aligned as they start and all of them again when the clock
   estimate moves. The result: every phone and the TV pulse together. */
export const BEAT_ANIMATIONS = Object.freeze(new Set(["fd-beat", "fd-beat-dot", "fd-beat-fill"]));
/* The startTime (document timeline ms) that puts a beat at the server phase. */
export const beatStartTime = (timelineNow, phase) => timelineNow - phase;

function alignAnimation(animation, timelineNow, phase) {
  if (!animation || !BEAT_ANIMATIONS.has(animation.animationName)) return;
  try { animation.startTime = beatStartTime(timelineNow, phase); } catch {}
}
export function alignHeartbeat() {
  if (typeof document === "undefined" || typeof document.getAnimations !== "function") return 0;
  const timelineNow = document.timeline?.currentTime;
  if (!Number.isFinite(timelineNow)) return 0;
  const phase = serverPhase(MOTION.beat);
  const list = document.getAnimations().filter(a => BEAT_ANIMATIONS.has(a.animationName));
  list.forEach(a => alignAnimation(a, timelineNow, phase));
  return list.length;
}
let alignQueued = false;
function queueAlign() {
  if (alignQueued || typeof requestAnimationFrame !== "function") return;
  alignQueued = true;
  requestAnimationFrame(() => { alignQueued = false; alignHeartbeat(); });
}
function startHeartbeat() {
  if (typeof document === "undefined") return () => {};
  const onStart = event => { if (BEAT_ANIMATIONS.has(event.animationName)) queueAlign(); };
  document.addEventListener("animationstart", onStart, true);
  const stopClock = onServerClock(queueAlign);
  queueAlign();
  return () => { document.removeEventListener("animationstart", onStart, true); stopClock(); };
}

/* The link state the heartbeat shows: live (beating), down (still, hollow),
   back (one catch-up pop, then live), wait (before the first state). */
export function linkState({ loaded, connected }) {
  return !loaded ? "wait" : connected ? "live" : "down";
}

function useLinkAttribute(link) {
  const previous = useRef(link);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const wasDown = previous.current === "down";
    previous.current = link;
    if (link === "live" && wasDown && !prefersReducedMotion()) {
      root.dataset.fdLink = "back";
      const t = setTimeout(() => { if (root.dataset.fdLink === "back") root.dataset.fdLink = "live"; }, MOTION.pop);
      return () => clearTimeout(t);
    }
    root.dataset.fdLink = link;
    return undefined;
  }, [link]);
}

/* Mounted once in App, inside the providers: the flight layer's portal host,
   the heartbeat, and the link attribute on <html>. */
export function MotionRoot({ connected = true, loaded = true }) {
  const [flights, setFlights] = useState([]);
  const waiting = useRef(new Map());
  useEffect(() => {
    let seq = 0;
    portalHost = {
      add(container, element) {
        const id = ++seq;
        const ready = new Promise(resolve => waiting.current.set(id, resolve));
        setFlights(list => [...list, { id, container, element }]);
        return { ready, remove:() => setFlights(list => list.filter(item => item.id !== id)) };
      },
    };
    flightLayer();
    return () => { portalHost = null; };
  }, []);
  /* a React flight leaves once its element is actually in the layer */
  useLayoutEffect(() => {
    for (const item of flights) {
      const resolve = waiting.current.get(item.id);
      if (resolve) { waiting.current.delete(item.id); resolve(); }
    }
  }, [flights]);
  useEffect(() => startHeartbeat(), []);
  useLinkAttribute(linkState({ loaded, connected }));
  return React.createElement(React.Fragment, null,
    flights.map(item => createPortal(item.element, item.container, `flight-${item.id}`)));
}
