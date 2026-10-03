import React, { useEffect, useMemo, useRef, useState } from "react";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { EASE, LAND_SQUASH, flightTarget, useReducedMotion } from "../../lib/motion.js";
import { playSound } from "../../lib/sound.js";
import "./results.css";

/* M19, chip rain with gravity (Backglass): when YOU win (an event, a
   match, a bet), your own identity chips fall and pile at the bottom of
   your screen, bouncing as they land, one chip per 100 won. Each landing
   clacks one step higher up the D major ladder, the receipt's total ticks
   in time with them (rainPlan), and then the pile sweeps into the Home tab
   with a riffle. Other people's results only move numbers. Reduced motion
   shows nothing and plays the one payout sound. */
export const SHOWER_CHIPS = 16;
export const SHOWER_MS = 2200;
export const RAIN = Object.freeze({ min:4, max:SHOWER_CHIPS, first:420, gap:110, fall:620, bounce:280, hold:650, sweep:520 });

/* When each chip lands and when the pile leaves, from the win's amount
   (ms after the rain starts). ChipReceipt counts its total on the same
   landings. */
export function rainPlan(amount) {
  const n = Math.max(RAIN.min, Math.min(RAIN.max, Math.round((Number(amount) || 0) / 100) || 8));
  const lands = Array.from({ length:n }, (_, i) => RAIN.first + i * RAIN.gap);
  const settled = lands[n - 1] + RAIN.bounce;
  return { n, lands, settled, sweepAt:settled + RAIN.hold, total:settled + RAIN.hold + RAIN.sweep };
}

/* seeded so a re-render mid-fall never reshuffles the pieces: where each
   chip comes from, how it spins, and where it lands on the pile */
export function showerPieces(seed, count = SHOWER_CHIPS) {
  let s = (Number(seed) || 1) * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const columns = [0, -1, 1, -2, 2];
  return Array.from({ length:count }, (_, index) => {
    const column = columns[index % columns.length];
    const row = Math.floor(index / columns.length);
    return {
      id:index,
      left:Math.max(0, Math.min(100, 50 + column * 9 + (rand() - .5) * 3)),
      delay:Math.round(rand() * 420),
      duration:Math.round(1300 + rand() * 500),
      size:Math.round(36 + rand() * 8),
      spin:Math.round((rand() - .5) * 540),
      drift:Math.round((rand() - .5) * 60),
      /* the pile: a few columns, each chip a little higher than the last */
      pileY:row * 13 + Math.abs(column) * -4 + Math.round(rand() * 3),
      tilt:Math.round((rand() - .5) * 16),
    };
  });
}

export function ChipShower({ burst, p, amount = 0 }) {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(null);
  const pileRef = useRef(null);
  useEffect(() => {
    if (!burst || !p) return undefined;
    const plan = rainPlan(amount);
    if (reduced) {
      playSound("payout", { opts:{ n:plan.n }, key:`rain:${burst}` });
      return undefined;
    }
    setLive({ burst, plan });
    /* each landing one step up the ladder; the pile sweeps home */
    plan.lands.forEach((at, step) => playSound("rain", { delayMs:at, opts:{ step }, key:`rain:${burst}:${step}` }));
    const timers = [
      setTimeout(() => {
        playSound("sweep", { opts:{ n:Math.min(10, plan.n) }, key:`rain:${burst}:sweep` });
        const pile = pileRef.current, home = flightTarget("tab:home");
        const from = pile?.getBoundingClientRect?.(), to = home?.getBoundingClientRect?.();
        if (!pile?.animate || !from || !to || !to.width) return;
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height);
        try {
          pile.animate([{ transform:"none", opacity:1 }, { transform:`translate(${dx}px, ${dy}px) scale(.18)`, opacity:.35 }],
            { duration:RAIN.sweep, easing:EASE.exit, fill:"forwards" }).finished
            .then(() => { try { home.animate?.(LAND_SQUASH, { duration:320, easing:EASE.out }); } catch {} }, () => {});
        } catch {}
      }, plan.sweepAt),
      setTimeout(() => setLive(current => current?.burst === burst ? null : current), plan.total + 40),
    ];
    return () => timers.forEach(clearTimeout);
  }, [burst, reduced, p]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieces = useMemo(() => live ? showerPieces(live.burst, live.plan.n) : [], [live]);
  if (!live || !p) return null;
  return <div className="fd-shower" aria-hidden="true" key={live.burst}>
    <div className="fd-shower-pile" ref={pileRef}>
      {pieces.map((piece, i) => <span key={piece.id} className="fd-shower-chip" style={{ left:`${piece.left}%`,
        bottom:`${piece.pileY}px`, "--fd-shower-delay":`${live.plan.lands[i] - RAIN.fall}ms`,
        "--fd-shower-dur":`${RAIN.fall + RAIN.bounce}ms`, "--fd-shower-spin":`${piece.spin}deg`,
        "--fd-shower-tilt":`${piece.tilt}deg`, "--fd-shower-drift":`${piece.drift}px` }}>
        <BankChip p={p} size={piece.size} />
      </span>)}
    </div>
  </div>;
}
