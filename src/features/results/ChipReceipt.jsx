import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { ChipStack } from "../wagers/BetStacks.jsx";
import { EASE, MOTION, fly, prefersReducedMotion, useCountBetween, useReducedMotion } from "../../lib/motion.js";
import { playSound } from "../../lib/sound.js";
import { RECEIPT_HOLD_MS, flightChips, ordinal, rankMove, receiptDockStyle, receiptDragOffset, receiptRelease,
  receiptVelocity, signedAmount } from "./resultMoment.js";
import { rainPlan } from "./ChipShower.jsx";
import "./results.css";

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
/* each line lands this long after the one before it */
export const LINE_STAGGER = 140;
/* leaving, the card travels this much further toward its edge as it fades */
const LEAVE_PX = 48;
const Arrow = () => <Icon name="open" size="1em" />;

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
  /* the total starts counting as the first won chip lands; when your own
     win rains chips (ChipShower), it ticks with each one landing on the pile */
  const firstWin = lines.findIndex(line => line.delta > 0);
  const net = (moment?.to ?? 0) - (moment?.from ?? 0);
  const rain = animate && moment?.celebrate && net > 0 ? rainPlan(net) : null;
  const countDelay = !animate ? 0 : rain ? rain.lands[0]
    : (firstWin < 0 ? lines.length : firstWin) * LINE_STAGGER + MOTION.flight + 160;
  const total = useCountBetween(moment?.from ?? 0, moment?.to ?? 0, { play:animate, delay:countDelay,
    duration:rain ? Math.max(MOTION.fast, rain.lands[rain.n - 1] - rain.lands[0] + 60)
      : Math.max(MOTION.count, lines.length * LINE_STAGGER) });

  /* won chips leave each line's stack for the total, once per line */
  useLayoutEffect(() => {
    /* the payout rings by its size (S17 for a duel alone) as the first won
       chips land; your own win's chip rain carries its own ladder, so the
       receipt stays quiet then. A loss has its own quiet sound as its
       stack slides off to the bank. Reduced motion keeps the sound, not
       the flight. */
    const won = moment?.animate ? lines.findIndex(line => line.delta > 0 && !flown.current.has(line.id)) : -1;
    const gained = lines.filter(line => line.delta > 0 && !flown.current.has(line.id)).reduce((sum, line) => sum + line.delta, 0);
    if (won >= 0 && !(moment.celebrate && animate)) {
      const duel = lines.slice(won).every(line => line.delta <= 0 || line.kind === "duel");
      playSound(duel ? "S17" : "payout", { opts:{ n:Math.round(gained / 100) },
        delayMs:animate ? won * LINE_STAGGER + 120 + MOTION.flight + 180 : 0, key:`receipt:${moment.id}:${version}` });
    }
    const lost = moment?.animate ? lines.findIndex(line => line.delta < 0 && !flown.current.has(line.id)) : -1;
    if (lost >= 0) playSound("loss", { delayMs:animate ? lost * LINE_STAGGER + 260 : 0,
      key:`receipt:${moment.id}:${version}:loss` });
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
      /* the Bets rack sits at the board's head now; only a rack in the lower
         half of the screen is something a bottom receipt must clear */
      rackTop:rack && rack.height && rack.top > window.innerHeight / 2 ? rack.top : null, viewportHeight:window.innerHeight });
    el.style.top = place?.top || "";
    el.style.bottom = place?.bottom || "";
  }, [dock, moment?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  /* leaving: the card carries on toward its own edge and fades
     (MOTION.sheetOut), then it is gone. A flick keeps its speed (ease
     out); a card at rest falls away (ease exit). Reduced motion: gone at
     once. Inline styles only, so a re-render never fights them. */
  const leaving = useRef(0);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const leave = (fromDy = 0) => {
    if (leaving.current) return;
    drag.current = null;
    const el = rootRef.current;
    if (!el || prefersReducedMotion()) { dismissRef.current?.(); return; }
    const sign = dock === "top" ? -1 : 1, ease = fromDy ? EASE.out : EASE.exit;
    Object.assign(el.style, { transition:`transform ${MOTION.sheetOut}ms ${ease}, opacity ${MOTION.sheetOut}ms ${ease}`,
      transform:`translateY(${(sign * (Math.abs(fromDy) + LEAVE_PX)).toFixed(1)}px)`, opacity:"0", pointerEvents:"none" });
    leaving.current = setTimeout(() => { leaving.current = 0; dismissRef.current?.(); }, MOTION.sheetOut);
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  /* it leaves after it has been read; a new line restarts the clock and
     calls back a card that had started to leave */
  const hold = RECEIPT_HOLD_MS + countDelay;
  useEffect(() => {
    if (!moment) return undefined;
    if (leaving.current) {
      clearTimeout(leaving.current);
      leaving.current = 0;
      for (const prop of ["transition", "transform", "opacity", "pointer-events"]) rootRef.current?.style.removeProperty(prop);
    }
    const timer = setTimeout(() => leaveRef.current(), hold);
    return () => clearTimeout(timer);
  }, [moment?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(leaving.current), []);

  if (!moment || moment.kind !== "receipt") return null;
  const move = rankMove(moment.rankFrom, moment.rankTo);
  const hasBets = lines.some(line => line.kind === "bet");
  const summary = `${moment.title}. ${lines.map(line => `${line.label} ${signedAmount(line.delta)}`).join(", ")}. ${
    fmt(moment.to)} chips, ${ordinal(moment.rankTo)}${moment.fact ? `. ${moment.fact}` : ""}`;

  /* a swipe toward its edge, a flick that way, or a tap on the card (not
     its buttons) puts it away. Held, the card follows the finger 1:1 (no
     transition), gives less the other way, and springs back if let go
     short. */
  const down = event => {
    if (leaving.current || event.target.closest?.("button")) return;
    const el = rootRef.current;
    drag.current = { y:event.clientY, dy:0, h:el?.offsetHeight || 200, samples:[{ t:event.timeStamp, y:event.clientY }] };
    if (el) el.style.transition = "none";
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
  };
  const move_ = event => {
    const d = drag.current;
    if (!d) return;
    d.dy = event.clientY - d.y;
    d.samples.push({ t:event.timeStamp, y:event.clientY });
    if (d.samples.length > 12) d.samples.shift();
    const dy = receiptDragOffset(d.dy, dock, d.h);
    if (rootRef.current) rootRef.current.style.transform = Math.abs(dy) >= 0.5 ? `translateY(${dy.toFixed(1)}px)` : "";
  };
  const settleBack = () => {
    rootRef.current?.style.removeProperty("transition");
    rootRef.current?.style.removeProperty("transform");
  };
  const up = event => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const verdict = receiptRelease({ dy:d.dy, vy:receiptVelocity(d.samples, event?.timeStamp), dock });
    if (verdict === "back") { settleBack(); return; }
    leave(verdict === "away" ? receiptDragOffset(d.dy, dock, d.h) : 0);
  };
  const cancel = () => { if (!drag.current) return; drag.current = null; settleBack(); };

  return <section ref={rootRef} className={`fd-receipt is-${dock}${animate ? " is-live" : ""}`}
    role="status" aria-live="polite" aria-label={summary}
    onPointerDown={down} onPointerMove={move_} onPointerUp={up} onPointerCancel={cancel}>
    <div className="fd-receipt-timer" aria-hidden="true">
      <i key={version} style={{ animationDuration:`${hold}ms` }} />
    </div>
    <header className="fd-receipt-top">
      <span className="fd-receipt-mark"><BankChip p={moment.chip || moment.me} size={34} /></span>
      <span className="fd-receipt-title"><b>{moment.title}</b>{moment.subtitle && <small>{moment.subtitle}</small>}</span>
      <button type="button" className="fd-receipt-x" aria-label="Dismiss" onClick={() => leave()}><Icon name="close" size={18} /></button>
    </header>
    <ol className="fd-receipt-lines">
      {lines.map((line, index) => <li key={line.id} className={`fd-receipt-line ${line.delta >= 0 ? "is-up" : "is-down"}`}
        style={{ "--fd-line-delay":`${index * LINE_STAGGER}ms` }}>
        <span className="fd-receipt-stack" aria-hidden="true"
          ref={el => { if (el) stackRefs.current.set(line.id, el); else stackRefs.current.delete(line.id); }}>
          {line.delta > 0 ? <ChipStack p={moment.me} stake={line.delta} size={22} cap={6} tag={false} />
            : <span className="fd-receipt-ghost"><i /><i />
              {/* the stack that was here slides off to the bank */}
              {animate && line.delta < 0 && <span className="fd-receipt-lost">
                <ChipStack p={moment.me} stake={-line.delta} size={22} cap={6} tag={false} /></span>}</span>}
        </span>
        <span className="fd-receipt-what">{line.label}{line.detail && <small>{line.detail}</small>}</span>
        <span className="fd-receipt-amount">{signedAmount(line.delta)}</span>
      </li>)}
    </ol>
    <div className="fd-receipt-total">
      {moment.from !== moment.to && <s className="fd-receipt-from">{fmt(moment.from)}</s>}
      {/* the new number counts in on its reel as the won chips land */}
      <strong ref={totalRef} className="fd-receipt-to"><ScoreReel value={total} tone="chip" motion={animate ? "always" : "never"}
        label={fmt(moment.to)} /></strong>
      <span className="fd-receipt-rank"><b>{ordinal(moment.rankTo)}</b>
        {move && <small className={move.up ? "is-up" : "is-down"}>{move.text}</small>}</span>
    </div>
    {moment.fact && <p className="fd-receipt-fact" style={{ "--fd-line-delay":`${countDelay}ms` }}>{moment.fact}</p>}
    {(onStandings || (hasBets && onSettled)) && <div className="fd-receipt-actions">
      {onStandings && <button type="button" onClick={onStandings}>Standings <Arrow /></button>}
      {hasBets && onSettled && <button type="button" onClick={onSettled}>Settled bets <Arrow /></button>}
    </div>}
  </section>;
}
