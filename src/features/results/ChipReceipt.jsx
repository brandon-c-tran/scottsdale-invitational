import React, { useEffect, useLayoutEffect, useRef } from "react";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { ChipStack } from "../wagers/BetStacks.jsx";
import { MOTION, fly, useCountBetween, useReducedMotion } from "../../lib/motion.js";
import { playSound } from "../../lib/sound.js";
import { RECEIPT_HOLD_MS, flightChips, ordinal, rankMove, receiptDockStyle, signedAmount } from "./resultMoment.js";
import "./results.css";

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
/* each line lands this long after the one before it */
export const LINE_STAGGER = 140;
const Arrow = () => <span aria-hidden="true">↗</span>;

/* X2: a docked card on YOUR phone when a fresh result moves YOUR chips.
   Each line settles in turn, won chips fly into the total, and the total
   counts to the new number. It never blocks: a swipe or a tap puts it
   away, and it leaves on its own once it has been read. */
export function ChipReceipt({ moment, onDismiss, onStandings, onSettled, dock = "bottom" }) {
  const reduced = useReducedMotion();
  const animate = !!moment?.animate && !reduced;
  const rootRef = useRef(null), totalRef = useRef(null);
  const stackRefs = useRef(new Map());
  const flown = useRef(new Set());
  const drag = useRef(null);
  const lines = moment?.lines || [];
  const version = moment?.version || 0;
  /* the total starts counting as the first won chip lands */
  const firstWin = lines.findIndex(line => line.delta > 0);
  const countDelay = animate ? (firstWin < 0 ? lines.length : firstWin) * LINE_STAGGER + MOTION.flight + 160 : 0;
  const total = useCountBetween(moment?.from ?? 0, moment?.to ?? 0, { play:animate, delay:countDelay,
    duration:Math.max(MOTION.count, lines.length * LINE_STAGGER) });

  /* won chips leave each line's stack for the total, once per line */
  useLayoutEffect(() => {
    /* S12, or S17 for a duel: one riffle as the first won chips land (losses
       are silent; reduced motion keeps the riffle, not the flight) */
    const won = moment?.animate ? lines.findIndex(line => line.delta > 0 && !flown.current.has(line.id)) : -1;
    if (won >= 0) playSound(lines.slice(won).every(line => line.delta <= 0 || line.kind === "duel") ? "S17" : "S12",
      { delayMs:animate ? won * LINE_STAGGER + 120 + MOTION.flight + 180 : 0, key:`receipt:${moment.id}:${version}` });
    if (!animate || !moment) return undefined;
    const timers = [];
    lines.forEach((line, index) => {
      if (flown.current.has(line.id)) return;
      flown.current.add(line.id);
      const count = flightChips(line.delta);
      for (let k = 0; k < count; k++) {
        timers.push(setTimeout(() => {
          const from = stackRefs.current.get(line.id), to = totalRef.current;
          if (!from || !to) return;
          fly(from, to, { node:<BankChip p={moment.me} size={22} />, arc:34, duration:MOTION.flight + 180,
            scale:0.9, fade:true, land:k === count - 1 });
        }, index * LINE_STAGGER + 120 + k * 90));
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [moment?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  /* dock against the chrome actually on screen: below the header (which
     grows with the staging bar), or above the Bets rack when it shows */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof document === "undefined") return;
    const header = document.querySelector(".fd-header")?.getBoundingClientRect();
    const rack = document.querySelector(".fd-wagers-rack")?.getBoundingClientRect();
    const place = receiptDockStyle({ dock, headerBottom:header?.bottom ?? null,
      rackTop:rack && rack.height ? rack.top : null, viewportHeight:window.innerHeight });
    el.style.top = place?.top || "";
    el.style.bottom = place?.bottom || "";
  }, [dock, moment?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  /* it leaves after it has been read; a new line restarts the clock */
  const hold = RECEIPT_HOLD_MS + countDelay;
  useEffect(() => {
    if (!moment) return undefined;
    const timer = setTimeout(() => onDismiss?.(), hold);
    return () => clearTimeout(timer);
  }, [moment?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!moment || moment.kind !== "receipt") return null;
  const move = rankMove(moment.rankFrom, moment.rankTo);
  const hasBets = lines.some(line => line.kind === "bet");
  const summary = `${moment.title}. ${lines.map(line => `${line.label} ${signedAmount(line.delta)}`).join(", ")}. ${
    fmt(moment.to)} chips, ${ordinal(moment.rankTo)}`;

  /* a swipe down or a tap on the card (not its buttons) puts it away */
  const down = event => {
    if (event.target.closest?.("button")) return;
    drag.current = { y:event.clientY, dy:0 };
  };
  const move_ = event => {
    if (!drag.current) return;
    drag.current.dy = event.clientY - drag.current.y;
    const dy = dock === "top" ? Math.min(0, drag.current.dy) : Math.max(0, drag.current.dy);
    if (rootRef.current) rootRef.current.style.transform = dy ? `translateY(${dy}px)` : "";
  };
  const up = () => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const away = dock === "top" ? current.dy < -40 : current.dy > 40;
    if (away || Math.abs(current.dy) < 6) { onDismiss?.(); return; }
    if (rootRef.current) rootRef.current.style.transform = "";
  };

  return <section ref={rootRef} className={`fd-receipt is-${dock}${animate ? " is-live" : ""}`}
    role="status" aria-live="polite" aria-label={summary}
    onPointerDown={down} onPointerMove={move_} onPointerUp={up} onPointerCancel={() => { drag.current = null; up(); }}>
    <div className="fd-receipt-timer" aria-hidden="true">
      <i key={version} style={{ animationDuration:`${hold}ms` }} />
    </div>
    <header className="fd-receipt-top">
      <span className="fd-receipt-mark"><BankChip p={moment.chip || moment.me} size={34} /></span>
      <span className="fd-receipt-title"><b>{moment.title}</b>{moment.subtitle && <small>{moment.subtitle}</small>}</span>
      <button type="button" className="fd-receipt-x" aria-label="Dismiss" onClick={() => onDismiss?.()}>✕</button>
    </header>
    <ol className="fd-receipt-lines">
      {lines.map((line, index) => <li key={line.id} className={`fd-receipt-line ${line.delta >= 0 ? "is-up" : "is-down"}`}
        style={{ "--fd-line-delay":`${index * LINE_STAGGER}ms` }}>
        <span className="fd-receipt-stack" aria-hidden="true"
          ref={el => { if (el) stackRefs.current.set(line.id, el); else stackRefs.current.delete(line.id); }}>
          {line.delta > 0 ? <ChipStack p={moment.me} stake={line.delta} size={22} cap={6} tag={false} />
            : <span className="fd-receipt-ghost"><i /><i /></span>}
        </span>
        <span className="fd-receipt-what">{line.label}{line.detail && <small>{line.detail}</small>}</span>
        <span className="fd-receipt-amount">{signedAmount(line.delta)}</span>
      </li>)}
    </ol>
    <div className="fd-receipt-total">
      {moment.from !== moment.to && <s className="fd-receipt-from">{fmt(moment.from)}</s>}
      <strong ref={totalRef} className="fd-receipt-to">{fmt(total)}</strong>
      <span className="fd-receipt-rank"><b>{ordinal(moment.rankTo)}</b>
        {move && <small className={move.up ? "is-up" : "is-down"}>{move.text}</small>}</span>
    </div>
    {(onStandings || (hasBets && onSettled)) && <div className="fd-receipt-actions">
      {onStandings && <button type="button" onClick={onStandings}>Standings <Arrow /></button>}
      {hasBets && onSettled && <button type="button" onClick={onSettled}>Settled bets <Arrow /></button>}
    </div>}
  </section>;
}
