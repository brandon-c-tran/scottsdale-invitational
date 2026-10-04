import React, { useLayoutEffect, useRef } from "react";

/* The commissioner's shelf on the tab bar. Its height is published as
   --fd-dock-h on the root, and everything that clears the tab bar (the page's
   end, your sticky leaderboard row, the bets rack, the toast) clears this
   too, so the dock never covers what it sits under. */
export function CommissionerDock({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, root = typeof document === "undefined" ? null : document.documentElement;
    if (!el || !root) return undefined;
    const measure = () => root.style.setProperty("--fd-dock-h", `${Math.ceil(el.offsetHeight)}px`);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => { observer?.disconnect(); root.style.removeProperty("--fd-dock-h"); };
  }, []);
  return <div className="fd-gm-dock" aria-label="Commissioner">
    <div className="fd-gm-dock-inner" ref={ref}>{children}</div>
  </div>;
}
