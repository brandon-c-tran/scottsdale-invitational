import { useLayoutEffect, useMemo, useRef } from "react";
import { weekendPhase } from "./phase.js";
import { prefersReducedMotion } from "./motion.js";

/* Puts the weekend's session on the document root (data-phase), which
   swaps the surface tokens in experience.css for phones and the TV alike,
   and points <meta name="theme-color"> at the session's background so the
   iOS status bar and the installed app's chrome follow.

   A change while the app is open eases over PHASE_SHIFT_MS. Nothing eases
   on first load: the placeholder state before the first snapshot, and the
   first snapshot itself, apply at once. Reduced motion always applies at
   once. Staging keeps its electric-blue theme-color in every session. */

export const PHASE_SHIFT_MS = 1500;
export const PHASE_SHIFT_CLASS = "fd-phase-shift";
const STAGING = (() => { try { return import.meta.env?.MODE === "staging"; } catch { return false; } })();

/* Pure: whether applying `phase` should ease, given the last application
   ({ phase, settled } or null). Only a change after the first fresh state. */
export function phaseShouldEase(previous, phase, { reduced = false } = {}) {
  return !!previous && !!previous.settled && previous.phase !== phase && !reduced;
}

/* Applies a phase to a root element and its theme-color meta. `doc` is the
   document (injectable for tests). Returns the session background it set. */
export function applyPhase(doc, phase, { ease = false, staging = STAGING, timers = globalThis } = {}) {
  const root = doc?.documentElement;
  if (!root) return null;
  if (ease) {
    root.classList.add(PHASE_SHIFT_CLASS);
    timers.clearTimeout?.(applyPhase.timer);
    applyPhase.timer = timers.setTimeout?.(() => root.classList.remove(PHASE_SHIFT_CLASS), PHASE_SHIFT_MS + 100);
  }
  root.setAttribute("data-phase", phase);
  const bg = doc.defaultView?.getComputedStyle?.(root)?.getPropertyValue("--bg")?.trim() || null;
  const meta = doc.querySelector?.('meta[name="theme-color"]');
  if (meta && bg && !staging) meta.setAttribute("content", bg);
  return bg;
}

export function usePhaseTheme({ state, events, operationEvent, settled }) {
  const phase = useMemo(() => weekendPhase(state, events, { operationEvent }), [state, events, operationEvent]);
  const last = useRef(null);
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const previous = last.current;
    if (previous?.phase === phase && (previous.settled || !settled)) {
      last.current = { phase, settled:previous.settled || !!settled };
      return;
    }
    applyPhase(document, phase, { ease:phaseShouldEase(previous, phase, { reduced:prefersReducedMotion() }) });
    last.current = { phase, settled:!!settled };
  }, [phase, settled]);
  return phase;
}
