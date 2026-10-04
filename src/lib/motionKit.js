/* Layout motion on top of the foundation (motion.js): a fresh change held
   long enough to finish its animation, a mount caused by a fresh frame, and
   FLIP for keyed children. Same contract: only fresh changes move, reduced
   motion shows end states, everything is transform/opacity and never waits
   on input. Used by the draft (M9) and the finale (M17). */

import { useLayoutEffect, useRef, useState } from "react";
import { EASE, FRESH_WINDOW_MS, MOTION, prefersReducedMotion, useFreshChange, useMotionFrame } from "./motion.js";

/* The changeId of the latest fresh (animatable) change for `ms` after it,
   else 0. A class or key built on it survives unrelated re-renders (a clock
   tick) while its animation plays, and is gone on the next load. */
export function useFreshHold(value, key = null, ms = MOTION.story, options) {
  const change = useFreshChange(value, key, options);
  const [held, setHeld] = useState(0);
  useLayoutEffect(() => {
    if (!change.animate) return undefined;
    setHeld(change.changeId);
    const t = setTimeout(() => setHeld(current => current === change.changeId ? 0 : current), ms);
    return () => clearTimeout(t);
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  return change.animate ? change.changeId : held;
}

/* Whether a component that is mounting now was put on screen by a fresh
   frame of one of `actions` (the table was just dealt). Pure. */
export function freshMount(frame, actions, now = Date.now()) {
  const names = Array.isArray(actions) ? actions : [actions];
  return !!frame?.fresh && names.includes(frame.lastAction) && now - (Number(frame.at) || 0) <= FRESH_WINDOW_MS;
}
/* Decided once, at mount: a later render, reconnect or reopen never
   replays it. */
export function useFreshMount(actions) {
  const frame = useMotionFrame();
  const [fresh] = useState(() => freshMount(frame, actions) && !prefersReducedMotion());
  return fresh;
}

/* Offsets of a container's keyed children, relative to the container and
   in its own CSS pixels, so they survive page scrolling and a scaled TV
   canvas. */
export function childOffsets(container, attr = "data-flip") {
  const map = new Map();
  if (!container || typeof container.getBoundingClientRect !== "function") return map;
  const box = container.getBoundingClientRect();
  const scale = container.offsetWidth ? box.width / container.offsetWidth || 1 : 1;
  for (const el of container.querySelectorAll(`[${attr}]`)) {
    const r = el.getBoundingClientRect();
    map.set(el.getAttribute(attr), { left:(r.left - box.left) / scale, top:(r.top - box.top) / scale,
      width:r.width / scale, height:r.height / scale });
  }
  return map;
}

/* The moves a FLIP plays: for every keyed child present before and after,
   how far it must start from its new place. Entering keys are listed apart.
   Pure. */
export function flipMoves(before, after, { threshold = 0.5 } = {}) {
  const moves = [], entering = [];
  for (const [key, to] of after) {
    const from = before?.get(key);
    if (!from) { entering.push(key); continue; }
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) moves.push({ key, dx, dy });
  }
  return { moves, entering };
}

/* FLIP for a container's [data-flip] children. Positions are recorded after
   every commit; on a commit where `play` is truthy (a fresh change, never a
   load or reconnect) each moved child starts from where it was and slides
   home, and entering children fade in. `onPlay(before, after, container)`
   runs on that commit first, while the old offsets (of children that just
   left, too) are still known: a flight starts from there. */
export function useFlip(ref, { play = false, attr = "data-flip", duration = MOTION.rowSlide, delay = 0,
  stagger = 0, easing = EASE.out, enter = true, onPlay = null } = {}) {
  const last = useRef(null);
  useLayoutEffect(() => {
    const container = ref.current;
    const before = last.current;
    const after = childOffsets(container, attr);
    last.current = after;
    if (!play || !before || !container || prefersReducedMotion()) return;
    try { onPlay?.(before, after, container); } catch {}
    const { moves, entering } = flipMoves(before, after);
    const find = key => container.querySelector(`[${attr}="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key}"]`);
    moves.forEach(({ key, dx, dy }, index) => {
      const el = find(key);
      if (typeof el?.animate !== "function") return;
      try {
        el.animate([{ transform:`translate(${dx}px, ${dy}px)` }, { transform:"translate(0, 0)" }],
          { duration, delay:delay + index * stagger, easing, fill:"backwards" });
      } catch {}
    });
    if (enter) entering.forEach((key, index) => {
      const el = find(key);
      if (typeof el?.animate !== "function") return;
      try {
        el.animate([{ opacity:0, transform:"translateX(12px)" }, { opacity:1, transform:"none" }],
          { duration:MOTION.base, delay:delay + (moves.length + index) * stagger, easing, fill:"backwards" });
      } catch {}
    });
  });
}
