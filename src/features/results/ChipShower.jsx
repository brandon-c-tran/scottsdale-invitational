import React, { useEffect, useMemo, useState } from "react";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { useReducedMotion } from "../../lib/motion.js";
import "./results.css";

/* M19: a short shower of YOUR OWN identity chips, only on your phone and
   only when you won (an event, a match, a bet). Other people's results
   move numbers, never this. Flat chips, no confetti palette. */
export const SHOWER_CHIPS = 16;
export const SHOWER_MS = 2200;

/* seeded so a re-render mid-fall never reshuffles the pieces */
export function showerPieces(seed, count = SHOWER_CHIPS) {
  let s = (Number(seed) || 1) * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({ length:count }, (_, index) => ({
    id:index,
    left:4 + (index + rand() * .8) * (92 / count),
    delay:Math.round(rand() * 420),
    duration:Math.round(1300 + rand() * 500),
    size:Math.round(22 + rand() * 14),
    spin:Math.round((rand() - .5) * 540),
    drift:Math.round((rand() - .5) * 60),
  }));
}

export function ChipShower({ burst, p }) {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(0);
  useEffect(() => {
    if (!burst || reduced || !p) return undefined;
    setLive(burst);
    const timer = setTimeout(() => setLive(current => current === burst ? 0 : current), SHOWER_MS);
    return () => clearTimeout(timer);
  }, [burst, reduced, p]);
  const pieces = useMemo(() => live ? showerPieces(live) : [], [live]);
  if (!live || !p) return null;
  return <div className="fd-shower" aria-hidden="true" key={live}>
    {pieces.map(piece => <span key={piece.id} className="fd-shower-chip" style={{ left:`${piece.left}%`,
      "--fd-shower-delay":`${piece.delay}ms`, "--fd-shower-dur":`${piece.duration}ms`,
      "--fd-shower-spin":`${piece.spin}deg`, "--fd-shower-drift":`${piece.drift}px` }}>
      <BankChip p={p} size={piece.size} />
    </span>)}
  </div>;
}
