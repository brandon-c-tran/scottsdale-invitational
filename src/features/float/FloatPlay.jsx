import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cleanFloatLook } from "../../../shared/float.js";
import { serverNow } from "../../lib/serverClock.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { NowRow } from "../../ui/NowRow.jsx";
import { FloatBoundary } from "./FloatBoundary.jsx";
import { useFloatPart } from "./floatParts.js";
import { FLOAT_LINGER_MS, floatPhoneView, floatSheetHolds } from "./floatModel.js";
import { lookSaver } from "./lookSaver.js";
import "./float.css";

/* A rider's whole screen while Float races (float/PROTOCOL.md "Components":
   FloatController is the phone's game for one room). It opens by itself
   once a Cup (when the room has it and nothing else holds the screen),
   Home's row reopens it, and once open nothing in the app takes it down:
   it stays through the room's podium and feedback card, until the rider
   closes it (the controller's onExit) or the linger after the result has
   passed. A spectator gets nothing forced. A look the rider changes in the
   room (the lobby, a floatie between rounds) is saved to their profile the
   way the Locker saves it (`onLook`, lookSaver.js). */
export function FloatPlaySheet({ state, me, blocked = false, force = 0, now, initiallyOpen = false, onLook = null }) {
  const view = floatPhoneView(state, me);
  const key = view?.cupId || null;
  const [openFor, setOpenFor] = useState(() => initiallyOpen ? key : null);
  const [dismissed, setDismissed] = useState(null);
  const forced = useRef(force);
  useEffect(() => {
    if (force === forced.current) return;
    forced.current = force;
    if (key) { setDismissed(null); setOpenFor(key); }
  }, [force, key]);
  /* by itself, once a Cup, when nothing else holds the screen */
  useEffect(() => {
    if (view?.on && !blocked && dismissed !== key && openFor !== key) setOpenFor(key);
  }, [view?.on, blocked, dismissed, key, openFor]);
  const at = now ?? serverNow();
  const holds = floatSheetHolds(view, at);
  const open = !!view && openFor === key && dismissed !== key && holds;
  /* the linger runs out on its own */
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open || view.live || !view.finishedAt || now !== undefined) return undefined;
    const t = setTimeout(() => tick(n => n + 1), Math.max(0, view.finishedAt + FLOAT_LINGER_MS - at) + 50);
    return () => clearTimeout(t);
  }, [open, view?.live, view?.finishedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  /* one rider object while it says the same: the controller keys its hello on it */
  const riderKey = view ? JSON.stringify(view.rider) : "";
  const rider = useMemo(() => view?.rider || null, [riderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the room's look picks: the last one saved half a second after it, and
     at once when the sheet closes, so the profile's echo never undoes a
     pick still being made */
  const save = useRef(onLook), saver = useRef(null);
  save.current = onLook;
  if (!saver.current) saver.current = lookSaver({ target:() => save.current });
  const pickLook = useCallback(look => saver.current.change(cleanFloatLook(look, me)), [me]);
  useEffect(() => { if (!open) saver.current.flush(); }, [open]);
  useEffect(() => () => saver.current.flush(), []);
  const { Part, failed } = useFloatPart("controller", open);
  if (!open) return null;
  const close = () => { setDismissed(key); setOpenFor(null); };
  return <div className="fd-float-play" role="dialog" aria-modal="true" aria-label="Float">
    {Part ? <FloatBoundary name="controller" fallback={<Missing onClose={close} />}>
      <Part room={view.room} rider={rider} onExit={close} {...(onLook ? { onLook:pickLook } : {})} />
    </FloatBoundary> : failed ? <Missing onClose={close} /> : <div className="fd-float-wait"><GameMark id="float" size={120} hero /></div>}
  </div>;
}

function Missing({ onClose }) {
  return <div className="fd-float-missing" role="alert">
    <GameMark id="float" size={88} hero />
    <h2>Float didn't load</h2>
    <p>Reload the app to try again.</p>
    <button type="button" className="fd-float-close" onClick={onClose}>Close</button>
  </div>;
}

/* Home's row while the Cup races, for a rider who closed the controller */
export function FloatHome({ state, me, onOpen, inCard = false }) {
  const view = floatPhoneView(state, me);
  if (!view?.on) return null;
  if (inCard) return <NowRow className="fd-float-now" status="Racing" go="Play" primary onClick={onOpen}
    ariaLabel="Float. Racing. Play" />;
  return <button type="button" className="fd-float-home" onClick={onOpen} aria-label="Float. Racing. Play">
    <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Float</small><strong>Racing</strong></span>
  </button>;
}
