/* Sheet enter and exit. A sheet rises over a fading scrim (motion.css). When
   it unmounts, however it was closed (X, scrim, Escape, a save that closes
   it, a state change), a non-interactive copy is left in its place for
   MOTION.sheetOut and falls away. The real sheet is already gone, so focus
   return, scroll locking, and pending-write guards behave exactly as before:
   a close blocked by a pending write never unmounts, so nothing falls.

   A sheet that replaces another in the same commit (the modal stack moving
   between sheets) does not rise and leaves no copy; its content fades in. */

import { useLayoutEffect } from "react";
import { MOTION, prefersReducedMotion } from "../lib/motion.js";

let mountSeq = 0;
let unmountedThisCommit = false;

function noteUnmount() {
  if (unmountedThisCommit) return;
  unmountedThisCommit = true;
  queueMicrotask(() => { unmountedThisCommit = false; });
}

/* A copy of the closing sheet that cannot be focused, read, or tapped. */
export function sheetGhost(overlay, scrollTop = 0) {
  const ghost = overlay.cloneNode(true);
  ghost.classList.remove("is-swap");
  ghost.classList.add("is-leaving");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  for (const el of ghost.querySelectorAll("[aria-modal],[role=dialog],[tabindex]")) {
    el.removeAttribute("aria-modal");
    el.removeAttribute("role");
    el.removeAttribute("tabindex");
  }
  const panel = ghost.querySelector(".si-sheet");
  return { ghost, panel, scrollTop };
}

export function useSheetPresence(overlayRef, panelRef) {
  useLayoutEffect(() => {
    const overlay = overlayRef.current, panel = panelRef.current;
    mountSeq++;
    if (unmountedThisCommit) overlay?.classList.add("is-swap");
    let scrollTop = 0;
    const onScroll = () => { scrollTop = panel.scrollTop; };
    panel?.addEventListener("scroll", onScroll, { passive:true });
    return () => {
      panel?.removeEventListener("scroll", onScroll);
      noteUnmount();
      if (!overlay || typeof document === "undefined" || prefersReducedMotion()) return;
      if (panel?.isConnected) scrollTop = panel.scrollTop;
      const { ghost, panel:ghostPanel } = sheetGhost(overlay, scrollTop);
      document.body.appendChild(ghost);
      if (ghostPanel) ghostPanel.scrollTop = scrollTop;
      const seq = mountSeq;
      /* after the commit: another sheet took this one's place, so skip */
      queueMicrotask(() => {
        if (mountSeq !== seq) { ghost.remove(); return; }
        /* gone when its fall ends; the timer covers a fall that never runs */
        const falling = ghostPanel || ghost;
        falling.addEventListener("animationend", event => { if (event.target === falling) ghost.remove(); });
        setTimeout(() => ghost.remove(), MOTION.sheetOut * 5);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
