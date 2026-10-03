import React, { useEffect, useRef } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { serverNow, useServerNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { runOfShow } from "./runOfShow.js";
import "./run-of-show.css";

/* D5: the commissioner's run of show. A hold on the pill (or its more
   button) opens the tray above the pill; this read-only card leads it: Now,
   Next, Then, how long the current event has run, who is away, and any
   winner replay the TV still owes. Every action stays on the pill. */

export const HOLD_MS = 450;
/* a finger that travels this far is scrolling, not holding */
const HOLD_SLOP = 10;

/* Press-and-hold on any element. `consume()` reports (once) that the
   click which ends a hold must not also act. */
export function useHold(onHold, ms = HOLD_MS) {
  const timer = useRef(null), start = useRef(null), fired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; start.current = null; };
  const bind = {
    onPointerDown:event => {
      fired.current = false;
      cancel();
      start.current = { x:event.clientX, y:event.clientY };
      timer.current = setTimeout(() => { timer.current = null; fired.current = true; tapTick(); onHold(); }, ms);
    },
    onPointerMove:event => {
      if (!start.current) return;
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > HOLD_SLOP) cancel();
    },
    onPointerUp:cancel, onPointerLeave:cancel, onPointerCancel:cancel,
    onContextMenu:event => { if (fired.current || timer.current) event.preventDefault(); },
  };
  const consume = () => { const was = fired.current; fired.current = false; return was; };
  return { bind, consume };
}


/* `embedded`: inside the pill's more tray, which owns the close */
export function RunOfShowPanel({ state, events, director = null, showControl = false, now = null, onClose, embedded = false }) {
  useServerNow(15000);
  const model = runOfShow(state, events, director, { showControl, now:now ?? serverNow() });
  /* in the pill's tray the pill itself is Now: the tray reads on from Next */
  const beats = embedded ? model.beats.filter(item => item.slot !== "Now") : model.beats;
  if (!beats.length) return null;
  const meta = [
    model.started && { key:"started", label:"Started", value:`${model.started.event}, ${model.started.text}` },
    model.away.length && { key:"away", label:"Away", value:model.away.map(item => item.name).join(", ") },
    model.replay && { key:"replay", label:"Replay owed", value:model.replay },
  ].filter(Boolean);
  return <section className={`fd-runshow${embedded ? " is-embedded" : ""}`} aria-label="Run of show">
    {!embedded && <header className="fd-runshow-head">
      <b>Run of show</b>
      <button type="button" className="fd-runshow-x" aria-label="Close run of show" onClick={onClose}><Icon name="close" size={18} /></button>
    </header>}
    <ol className="fd-runshow-beats">
      {beats.map(item => <li key={item.slot} className={item.slot === "Now" ? "is-now" : undefined}>
        <span className="fd-runshow-slot">{item.slot}</span>
        <span className="fd-runshow-beat"><b>{item.label}</b>
          {(item.blocked || item.subject) && <small>{item.blocked || item.subject}</small>}</span>
      </li>)}
    </ol>
    {!!meta.length && <dl className="fd-runshow-meta">
      {meta.map(row => <div key={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl>}
  </section>;
}
