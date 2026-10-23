import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../lib/motion.js";
import { springStep } from "./useGlassTilt.js";
import { SHEET_DRAG, dragOffset, homeSettled, rawOffset, releasePlan, releaseVelocity, scrimShare, springFor } from "./sheetDragModel.js";

/* A sheet goes the way an iOS sheet goes: drag its header down. Touch only,
   and only where a sheet is a bottom sheet (under 700px; above, it is a
   centred dialog). The sheet follows the finger from where it was grabbed,
   lifts a little against its rest, and the scrim thins as it goes down.
   On release (sheetDragModel.js) it either goes, through the same onClose
   as the close button, its fall (sheetMotion.js) starting where the finger
   left it and at the finger's speed, or springs home, critically damped,
   from wherever it stands. A finger can catch it mid-spring.

   It refuses exactly when the sheet does: while `busy` (a write in
   flight) it gives against the finger and always comes home, and when
   onClose declines (an unsaved photo asks first) the sheet is still there
   on the next frame and comes home. The header only: the body scrolls as
   it always has. Reduced motion: it still follows the finger, and lands
   at once. A drag never also taps the button it started on. */
const DIALOG = "(min-width: 700px)";

export function useSheetDrag({ overlay, panel, grip, busy, onClose }) {
  const live = useRef(null);
  live.current = { busy, onClose };
  useEffect(() => {
    const scrim = overlay.current, sheet = panel.current, handle = grip.current;
    if (!scrim || !sheet || !handle || typeof window === "undefined") return undefined;
    const s = { pointer:null, offset:0, vel:0, raf:0, last:0, dim:null, swallow:false };
    const spring = springFor();

    /* the scrim's ::before thins with the drag; skipped where Web Animations
       cannot reach a pseudo-element */
    const thin = () => {
      if (s.dim !== null) return;
      s.dim = undefined;
      if (typeof KeyframeEffect === "undefined" || !("pseudoElement" in KeyframeEffect.prototype)) return;
      try {
        s.dim = scrim.animate([{ opacity:1 }, { opacity:0 }], { duration:1000, fill:"both", pseudoElement:"::before" });
        s.dim.pause();
      } catch { s.dim = undefined; }
    };
    const write = (offset, height) => {
      s.offset = offset;
      sheet.style.transform = offset ? `translate3d(0, ${offset.toFixed(2)}px, 0)` : "";
      if (s.dim) s.dim.currentTime = (1 - scrimShare(offset, height)) * 1000;
    };
    const rest = () => {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0; s.last = 0; s.vel = 0;
      write(0);
      s.dim?.cancel?.();
      s.dim = null;
      sheet.classList.remove("is-dragging");
    };
    const home = (velocity, height) => {
      if (prefersReducedMotion()) { rest(); return; }
      s.vel = velocity * 1000;
      s.last = 0;
      const frame = now => {
        const dt = s.last ? (now - s.last) / 1000 : 1 / 60;
        s.last = now;
        const next = springStep(s.offset, s.vel, 0, dt, spring);
        s.vel = next.vel;
        if (homeSettled(next.pos, next.vel)) { rest(); return; }
        write(next.pos, height);
        s.raf = requestAnimationFrame(frame);
      };
      s.raf = requestAnimationFrame(frame);
    };

    const down = event => {
      s.swallow = false;
      if (event.pointerType === "mouse" || !event.isPrimary || s.pointer) return;
      if (window.matchMedia?.(DIALOG).matches) return;
      s.pointer = { id:event.pointerId, x:event.clientX, y:event.clientY, dragging:false, samples:[], height:0, base:0 };
    };
    const move = event => {
      const p = s.pointer;
      if (!p || event.pointerId !== p.id) return;
      if (!p.dragging) {
        const dx = event.clientX - p.x, dy = event.clientY - p.y;
        if (Math.hypot(dx, dy) < SHEET_DRAG.slop) return;
        if (Math.abs(dx) > Math.abs(dy)) { s.pointer = null; return; }
        /* caught: take the sheet where it stands (mid-spring too), and
           follow from here so it never jumps by the slop */
        if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
        p.dragging = true;
        p.y = event.clientY;
        p.base = rawOffset(s.offset, { locked:live.current.busy });
        p.height = sheet.getBoundingClientRect().height || 1;
        sheet.getAnimations?.().forEach(animation => animation.finish?.());
        try { handle.setPointerCapture(event.pointerId); } catch { /* the drag still follows */ }
        sheet.classList.add("is-dragging");
        thin();
      }
      p.samples.push({ t:event.timeStamp, y:event.clientY });
      if (p.samples.length > 24) p.samples.splice(0, p.samples.length - 24);
      write(dragOffset(p.base + event.clientY - p.y, { locked:live.current.busy }), p.height);
    };
    const lift = (event, cancelled) => {
      const p = s.pointer;
      if (!p || event.pointerId !== p.id) return;
      s.pointer = null;
      if (!p.dragging) return;
      /* only the click this lift makes: one that comes later without a
         pointer (VoiceOver, a keyboard) is a real tap */
      const lifted = s.swallow = Symbol("lift");
      setTimeout(() => { if (s.swallow === lifted) s.swallow = false; }, 400);
      sheet.classList.remove("is-dragging");
      const velocity = cancelled ? 0 : releaseVelocity(p.samples, event.timeStamp);
      const plan = cancelled ? { dismiss:false } : releasePlan({ offset:s.offset, velocity, height:p.height, locked:live.current.busy });
      if (!plan.dismiss) { home(velocity, p.height); return; }
      /* the fall starts where the finger left the sheet, the scrim from its
         thinned dark, and a flick keeps its speed (motion.css) */
      sheet.style.setProperty("--fd-sheet-drag", `${s.offset.toFixed(2)}px`);
      if (s.dim) scrim.style.setProperty("--fd-sheet-dim", scrimShare(s.offset, p.height).toFixed(3));
      if (plan.fallMs) { scrim.style.setProperty("--fd-fling-ms", `${plan.fallMs}ms`); scrim.classList.add("is-flung"); }
      live.current.onClose?.();
      /* still here a frame later: the close was declined, so it comes home */
      requestAnimationFrame(() => {
        if (!sheet.isConnected) return;
        sheet.style.removeProperty("--fd-sheet-drag");
        scrim.style.removeProperty("--fd-sheet-dim");
        scrim.style.removeProperty("--fd-fling-ms");
        scrim.classList.remove("is-flung");
        home(0, p.height);
      });
    };
    const up = event => lift(event, false);
    const cancel = event => lift(event, true);
    /* the lift that ends a drag is not a tap on the button under it */
    const click = event => {
      if (!s.swallow) return;
      s.swallow = false;
      event.preventDefault();
      event.stopPropagation();
    };
    handle.addEventListener("pointerdown", down);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("click", click, true);
    return () => {
      handle.removeEventListener("pointerdown", down);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("click", click, true);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.dim?.cancel?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
