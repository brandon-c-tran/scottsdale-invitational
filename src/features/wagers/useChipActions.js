/* One spot's chip writes, the engine every betting surface shares (moved
   out of the old MarketPick, Oct 13): place and take back with the tap's
   own tick and sound, one write at a time with a short queue of roulette
   taps behind it, a timed-out write held as "Checking…" until the
   transport settles it, and the chip's flight from the rack to the spot (a
   failure flies it home). Presentation never gates a write. */
import { useEffect, useRef, useState } from "react";
import React from "react";
import { haptic, tapTick } from "../../lib/haptics.js";
import { playSound, unlockSound } from "../../lib/sound.js";
import { EASE, MOTION, fly, flightTarget, prefersReducedMotion } from "../../lib/motion.js";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { faceRect, hoverRect, rackTargetFor } from "./betStacks.js";

export const PLACE_QUEUE = 4;
export const RACK_COIN = 44;

/* A timed-out write may still have landed. The transport may say so
   explicitly (uncertain); older transports only report "No response". */
export const isUncertainResult = result => result?.ok !== true && (result?.uncertain === true
  || result?.status === "uncertain" || /no response/i.test(String(result?.error || "")));

/* refs: { mine, anchor } elements: your stack on the spot (its top chip is
   where a placed chip lands) and the spot itself (where the first chip
   lands). `mineTotal` and `mineChips` are your chips on this spot now. */
export function useChipActions({ state, me, tapStake, mineTotal, mineChips, chipSize, denoms, capped = false, mineRef, anchorRef }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [checking, setChecking] = useState(null);
  const pendingRef = useRef(false);
  const pendingKindRef = useRef(null), queueRef = useRef([]);
  /* a write held as "Checking…": a tap then is refused, never queued (a
     queued tap would go out after some later, unrelated chip) */
  const heldRef = useRef(false);
  const [queued, setQueued] = useState(0);
  const flightRef = useRef(null);
  const myColor = usePlayerIdentity(me).color;
  const live = useRef({ state, mineTotal });
  live.current = { state, mineTotal };
  const landed = (kind, before, total) => kind === "place" ? total > before : total < before;
  /* a chip landing or leaving answers any earlier error on this spot */
  const shownTotal = useRef(mineTotal);
  useEffect(() => {
    if (shownTotal.current === mineTotal) return;
    shownTotal.current = mineTotal;
    setActionError(null);
  }, [mineTotal]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; flightRef.current?.cancel(); }, []);
  /* a transport without a settled promise falls back to the next broadcast */
  useEffect(() => {
    if (!checking || checking.settled || state === checking.state) return;
    if (!landed(checking.kind, checking.before, mineTotal)) {
      setActionError(checking.kind === "place" ? "Not placed" : "Not removed");
      checking.flight?.back();
    } else checking.flight?.land();
    pendingRef.current = false;
    heldRef.current = false;
    setChecking(null);
  }, [state, mineTotal, checking]);
  const mineFace = () => mineRef?.current?.querySelector(".fd-stack > svg")?.getBoundingClientRect() || null;
  /* the rack's chip lifts and arcs to hover over the spot; the answer drops
     it in or flies it home */
  const placeFlight = stake => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const source = flightTarget(`bets:rack:${stake}`);
    const face = mineFace();
    const anchor = face || mineRef?.current?.getBoundingClientRect() || anchorRef?.current?.getBoundingClientRect();
    if (!source || !anchor) return null;
    let release = () => {};
    const hold = new Promise(resolve => { release = resolve; });
    try { source.animate([{ transform:"scale(1)" }, { transform:"scale(.9)" }, { transform:"scale(1)" }],
      { duration:MOTION.fast * 2, easing:EASE.out }); } catch {}
    fly(source, hoverRect(anchor, chipSize, face ? 10 : 6), { node:React.createElement(BankChip, { p:me, size:RACK_COIN, val:stake }),
      coinColor:myColor, arc:64, hold });
    let settled = false;
    const finish = next => { if (!settled) { settled = true; release(next); } };
    return {
      land:() => requestAnimationFrame(() => {
        const now = mineFace();
        const onLand = () => playSound("chipLand");
        if (now) finish({ to:faceRect(now), duration:MOTION.fast, settle:true, onLand });
        else if (mineRef?.current) finish({ to:mineRef.current, duration:MOTION.fast * 1.5, land:true, onLand });
        else finish(null);
      }),
      back:() => finish({ to:flightTarget(`bets:rack:${stake}`) || source, arc:40, duration:MOTION.flight }),
      cancel:() => finish(null),
    };
  };
  /* your last chip leaves the top of your stack for its rack slot */
  const retractFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const face = mineFace();
    const from = face ? faceRect(face) : mineRef?.current?.getBoundingClientRect();
    if (!from) return null;
    const value = mineChips[mineChips.length - 1];
    return {
      land:() => {
        const to = flightTarget(rackTargetFor(value, denoms, tapStake));
        if (to) fly(from, to, { node:React.createElement(BankChip, { p:me, size:Math.round(from.width), val:value }), coinColor:myColor, arc:48, land:true });
      },
      back:() => {}, cancel:() => {},
    };
  };
  const chipSound = (kind, stake) => {
    unlockSound();
    playSound(kind === "place" ? capped ? "S7" : "S5" : "S6",
      { opts:{ denom:stake, height:Array.isArray(mineChips) ? mineChips.length : 0 } });
  };
  /* act(kind, callback, { stake }): one write; a + tapped while a chip is
     saving queues behind it (still one write at a time), up to PLACE_QUEUE */
  const act = (kind, callback, { stake = tapStake, queuedTap = false } = {}) => {
    if (pendingRef.current) {
      if (kind === "place" && pendingKindRef.current === "place" && !heldRef.current && !queuedTap && queueRef.current.length < PLACE_QUEUE) {
        tapTick();
        chipSound(kind, stake);
        queueRef.current.push({ callback, stake });
        setQueued(queueRef.current.length);
      }
      return undefined;
    }
    if (!queuedTap) { tapTick(); chipSound(kind, stake); }
    pendingRef.current = true;
    pendingKindRef.current = kind;
    const before = live.current.mineTotal;
    setPendingAction(kind);
    setActionError(null);
    const flight = kind === "place" ? placeFlight(stake) : retractFlight();
    flightRef.current = flight;
    let holding = false, saved = false;
    const finish = () => {
      if (!holding) { pendingRef.current = false; pendingKindRef.current = null; }
      setPendingAction(null);
      const next = saved && !holding && alive.current ? queueRef.current.shift() : null;
      if (!next) queueRef.current = [];
      setQueued(queueRef.current.length);
      if (next) act("place", next.callback, { stake:next.stake, queuedTap:true });
    };
    const check = result => {
      if (isUncertainResult(result)) {
        if (!landed(kind, before, live.current.mineTotal)) {
          holding = true;
          heldRef.current = true;
          const settled = typeof result?.settled?.then === "function";
          setChecking({ kind, before, state:live.current.state, settled, flight });
          if (settled) result.settled.then(outcome => outcome, () => ({ ok:false })).then(outcome => {
            if (!alive.current) return;
            if (outcome?.ok === true) { haptic(kind === "place" ? "place" : "retract"); flight?.land(); }
            else if (!landed(kind, before, live.current.mineTotal)) {
              setActionError(kind === "place" ? "Not placed" : "Not removed");
              playSound("S26");
              flight?.back();
            } else flight?.land();
            pendingRef.current = false;
            heldRef.current = false;
            setChecking(null);
          });
        } else flight?.land();
        return result;
      }
      if (result?.ok === false) { setActionError(result.error || "Bet not saved."); playSound("S26"); flight?.back(); }
      else if (result?.ok === true) { saved = true; haptic(kind === "place" ? "place" : "retract"); flight?.land(); }
      else flight?.cancel();
      return result;
    };
    const fail = error => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      playSound("S26");
      flight?.back();
      return { ok:false, error:message };
    };
    try {
      const result = callback();
      if (result?.then) return Promise.resolve(result).then(check, fail).finally(finish);
      const checked = check(result);
      finish();
      return checked;
    } catch (error) { finish(); return fail(error); }
  };
  const busyKind = pendingAction || checking?.kind || null;
  /* a place tap can still queue while a place is saving */
  const busyPlace = !!busyKind && !(pendingAction === "place" && !checking && queued < PLACE_QUEUE);
  return { act, busyKind, busyPlace, checking, actionError, queued, pendingAction };
}
