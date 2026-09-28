import React, { useEffect, useRef, useState } from "react";
import { CHIP_GRAY } from "../../../shared/core.js";
import { useReducedMotion } from "../../ui/motion.js";
import { ChipFace } from "./PlayerIdentity.jsx";
import { usePlayerIdentity } from "./PlayerIdentityContext.js";
import { COIN_DEG_PER_PX, COIN_TAP_SLOP, coinGeometry, coinSettle, edgeInserts } from "./chipCoin.js";
import "./chip-coin.css";

/* A rotateY matrix3d carries -sin(a) in its third value. */
const angleOf = transform => {
  const values = /matrix3d\(([^)]+)\)/.exec(transform || "")?.[1]?.split(",").map(Number);
  return values ? Math.atan2(-values[2], values[0]) * 180 / Math.PI : 0;
};

/* The identity chip as a coin with thickness: two ChipFace faces over a rim
   of flat facets. Drag spins it on its axis; release lands it face up. A
   claim mints it (drop, two turns, land). Reduced motion is the flat face.
   A tap is left alone so a card around the coin still flips. */
export function ChipCoin({ p, size = 48, stamp, mint = false, mintOnMount = false, className = "" }) {
  const identity = usePlayerIdentity(p);
  const reduced = useReducedMotion();
  const spinRef = useRef(null);
  const drag = useRef(null);
  const angle = useRef(0);
  const frame = useRef(0);
  const settle = useRef(0);
  const dragged = useRef(false);
  const claimed = identity.color !== CHIP_GRAY;
  const key = `${identity.color}|${identity.skin}`;
  const seen = useRef(key);
  const [mints, setMints] = useState(() => mintOnMount && claimed ? 1 : 0);

  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    if (mint && claimed && !reduced) {
      angle.current = 0;
      setMints(count => count + 1);
    }
  }, [key, mint, claimed, reduced]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(settle.current); }, []);

  if (reduced) return <span className={`fd-coin is-static ${className}`} style={{ width:size, height:size }} aria-hidden="true">
    <ChipFace p={p} size={size} stamp={stamp} />
  </span>;

  const paint = () => {
    frame.current = 0;
    if (spinRef.current) spinRef.current.style.transform = `rotateY(${angle.current.toFixed(2)}deg)`;
  };
  const onPointerDown = event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    dragged.current = false;
    const el = spinRef.current;
    if (!el) return;
    if (settle.current) {
      clearTimeout(settle.current);
      settle.current = 0;
      angle.current = angleOf(getComputedStyle(el).transform);
    }
    el.style.transition = "none";
    paint();
    drag.current = { id:event.pointerId, x0:event.clientX, a0:angle.current, at:performance.now(), last:angle.current, v:0 };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* capture is optional */ }
  };
  const onPointerMove = event => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    event.stopPropagation();
    const dx = event.clientX - d.x0;
    if (Math.abs(dx) >= COIN_TAP_SLOP) dragged.current = true;
    if (!dragged.current) return;
    const now = performance.now();
    angle.current = d.a0 + dx * COIN_DEG_PER_PX;
    const dt = Math.max(1, now - d.at);
    d.v = d.v * .6 + ((angle.current - d.last) / dt) * .4;
    d.last = angle.current; d.at = now;
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };
  const onPointerEnd = event => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    drag.current = null;
    if (!dragged.current) return;
    event.stopPropagation();
    cancelAnimationFrame(frame.current); frame.current = 0;
    const el = spinRef.current;
    if (!el) return;
    const idle = performance.now() - d.at > 90;
    const { target, duration } = coinSettle(angle.current, idle ? 0 : d.v);
    el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
    el.style.transform = `rotateY(${target}deg)`;
    settle.current = setTimeout(() => {
      settle.current = 0;
      angle.current = 0;
      el.style.transition = "none";
      el.style.transform = "rotateY(0deg)";
    }, duration + 30);
  };

  const g = coinGeometry(size);
  const inserts = edgeInserts(identity.skin);
  return (
    <span className={`fd-coin${identity.isLight ? " is-light" : ""} ${className}`} aria-hidden="true"
      style={{ width:size, height:size, perspective:`${size * 6}px`, "--coin-color":identity.color,
        "--coin-h":`${g.thickness}px`, "--coin-chord":`${g.chord.toFixed(2)}px`, "--coin-apothem":`${g.apothem.toFixed(2)}px`,
        "--coin-step":`${g.step}deg` }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
      onClickCapture={event => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}>
      <span key={mints} className={`fd-coin-drop${mints ? " is-minting" : ""}`}>
        <span className="fd-coin-spin" ref={spinRef}>
          {inserts.map((ink, index) => <span key={index} className={`fd-coin-facet${ink ? " is-ink" : ""}`}
            style={{ "--i":index }} />)}
          <span className="fd-coin-face is-front"><ChipFace p={p} size={size} stamp={stamp} /></span>
          <span className="fd-coin-face is-back"><ChipFace p={p} size={size} stamp={stamp} /></span>
        </span>
      </span>
    </span>
  );
}
