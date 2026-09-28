import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY)?.matches;

/* Follows the system setting live, so turning it on mid-weekend stops tilt
   and spin without a reload. */
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
