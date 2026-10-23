/* A fixed element that leaves (a toast) fades away instead of vanishing.
   Give the element exitGhost()'s callback as its ref, made once (a new
   callback each render would detach and reattach it every render). When
   React detaches the element, it is still in the document (refs detach
   before the node is removed), so a copy that cannot be read, focused or
   tapped is left on top of it and sinks away over MOTION.sheetOut on the
   exit ease; being position:fixed, the copy stands exactly where the
   original stood. Reduced motion: it simply goes. A replaced message
   (same element, new text) is not a leave and plays nothing. */
import { EASE, MOTION, prefersReducedMotion } from "../lib/motion.js";

export const EXIT_GHOST_PX = 8;

export function exitGhost({ ms = MOTION.sheetOut } = {}) {
  let node = null;
  return el => {
    if (el) { node = el; return; }
    const gone = node;
    node = null;
    if (!gone?.isConnected || typeof document === "undefined" || prefersReducedMotion()) return;
    const ghost = gone.cloneNode(true);
    ghost.removeAttribute("role");
    ghost.removeAttribute("aria-live");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    Object.assign(ghost.style, { animation:"none", pointerEvents:"none" });
    document.body.appendChild(ghost);
    const remove = () => ghost.remove();
    try {
      ghost.animate([{ opacity:1, transform:"none" }, { opacity:0, transform:`translateY(${EXIT_GHOST_PX}px)` }],
        { duration:ms, easing:EASE.exit, fill:"forwards" }).finished.then(remove, remove);
    } catch { remove(); return; }
    /* the copy never outlives its exit, whatever happens to the animation */
    setTimeout(remove, ms * 3);
  };
}
