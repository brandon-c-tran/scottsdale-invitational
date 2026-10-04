import React, { useEffect, useLayoutEffect, useRef } from "react";
import "./tv-moments.css";

/* The takeover grammar (Backglass): every peak on the TV clears the chrome,
   leans in (the glass dims and a sting turns heads), reveals, then settles.
   A moment marks the canvas it sits in with data-moment (a space list of
   who holds it), and tv-moments.css makes the masthead, the horizon, the
   rail, the ticker and the Now playing strip step out while one is on.
   TVMode owns data-takeover and the frame chase (stageChrome); moments
   also report there (momentTakeovers). Nothing here writes state. */
export const TAKEOVER_ATTR = "data-moment";
/* layout timing in the browser (the chrome steps out with the first frame), plain on the server */
const useMarkEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* the canvas's takeover list after `kind` joins (on) or leaves (off) */
export function takeoverList(current, kind, on) {
  const list = String(current || "").split(/\s+/).filter(Boolean).filter(item => item !== kind);
  if (on) list.push(kind);
  return list.join(" ");
}

function mark(el, kind, on) {
  const canvas = el?.closest?.("[data-tv-canvas]");
  if (!canvas) return;
  const next = takeoverList(canvas.getAttribute(TAKEOVER_ATTR), kind, on);
  if (next) canvas.setAttribute(TAKEOVER_ATTR, next);
  else canvas.removeAttribute(TAKEOVER_ATTR);
}

/* A full-canvas layer that holds the room while it is mounted. */
export function Takeover({ kind, className = "", style, children, label = null }) {
  const ref = useRef(null);
  useMarkEffect(() => {
    const el = ref.current;
    mark(el, kind, true);
    return () => mark(el, kind, false);
  }, [kind]);
  return <div ref={ref} className={`tv-takeover${className ? ` ${className}` : ""}`} style={style}
    role={label ? "status" : undefined} aria-label={label || undefined}>
    {children}
  </div>;
}
