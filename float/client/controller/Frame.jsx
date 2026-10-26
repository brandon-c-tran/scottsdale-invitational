/* The frame every controller screen draws in (turn.js). It measures the
   viewport, and for a sideways screen in a portrait viewport turns the
   content a quarter about the centre, so it reads correctly held sideways
   with rotation lock on. A flip (90 to -90) spins the half turn; going
   sideways or upright fades the new layout in with a small twist, which
   is the cue to turn the phone. geomRef carries the geometry to the touch
   input; children may be a function of { turn }. */
import React, { useLayoutEffect, useRef, useState } from "react";
import { frameBox, frameTurn, insetVars } from "./turn.js";

const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };
const measureOf = el => ({ w:el?.clientWidth || globalThis.innerWidth || 0, h:el?.clientHeight || globalThis.innerHeight || 0 });

export default function Frame({ sideways, prefer = 90, geomRef, children }) {
  const boxRef = useRef(null), frameRef = useRef(null), lastTurn = useRef(null);
  const [vp, setVp] = useState(() => ({ w:globalThis.innerWidth || 390, h:globalThis.innerHeight || 844 }));

  useLayoutEffect(() => {
    const el = boxRef.current;
    const measure = () => setVp(prev => {
      const next = measureOf(el);
      return prev.w === next.w && prev.h === next.h ? prev : next;
    });
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const turn = frameTurn(vp, sideways, prefer);
  const box = frameBox(vp, turn);
  if (geomRef) geomRef.current = { w:vp.w, h:vp.h, turn, cw:box.cw, ch:box.ch, el:boxRef.current };

  useLayoutEffect(() => {
    const frame = frameRef.current, was = lastTurn.current;
    lastTurn.current = turn;
    if (!frame || was === null || was === turn || reducedMotion() || typeof frame.animate !== "function") return;
    if (was && turn && was !== turn) {
      frame.animate([{ transform:`rotate(${was}deg)` }, { transform:`rotate(${turn}deg)` }],
        { duration:460, easing:"cubic-bezier(0.65, 0, 0.35, 1)" });
    } else {
      const to = box.transform === "none" ? "" : box.transform;
      frame.animate([{ opacity:0, transform:`${to} rotate(${turn ? -10 : 10}deg) scale(0.94)` }, { opacity:1, transform:to || "none" }],
        { duration:320, easing:"cubic-bezier(0.23, 1, 0.32, 1)" });
    }
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={boxRef} className="flc-viewport">
    <div ref={frameRef} className="flc-frame" data-turn={turn} data-orient={box.cw >= box.ch ? "wide" : "tall"}
      style={{ width:box.cw, height:box.ch, left:box.left, top:box.top, transform:box.transform, ...insetVars(turn) }}>
      {typeof children === "function" ? children({ turn }) : children}
    </div>
  </div>;
}
