import React, { useEffect, useRef } from "react";
import { serverNow, useServerNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { runOfShow } from "./runOfShow.js";
import "./run-of-show.css";

/* D5: the commissioner's run of show. A hold on the pill (or the list
   button beside it) opens a read-only card above the pill: Now, Next, Then,
   how long the current event has run, who is away, and any winner replay
   the TV still owes. Every action stays on the pill. */

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

const ListGlyph = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
  <circle cx="5" cy="6" r="2.2" fill="var(--sun)" />
  <circle cx="5" cy="12" r="1.8" fill="currentColor" />
  <circle cx="5" cy="18" r="1.8" fill="currentColor" />
  <path d="M10 6h10M10 12h10M10 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
</svg>;

export function RunOfShowToggle({ open, onToggle, disabled = false }) {
  return <button type="button" className={`fd-runshow-toggle${open ? " is-open" : ""}`} aria-expanded={open}
    aria-label="Run of show" disabled={disabled} onClick={onToggle}><ListGlyph /></button>;
}

export function RunOfShowPanel({ state, events, director = null, showControl = false, now = null, onClose }) {
  useServerNow(15000);
  const model = runOfShow(state, events, director, { showControl, now:now ?? serverNow() });
  if (!model.beats.length) return null;
  const meta = [
    model.started && { key:"started", label:"Started", value:`${model.started.event}, ${model.started.text}` },
    model.away.length && { key:"away", label:"Away", value:model.away.map(item => item.name).join(", ") },
    model.replay && { key:"replay", label:"Replay owed", value:model.replay },
  ].filter(Boolean);
  return <section className="fd-runshow" aria-label="Run of show">
    <header className="fd-runshow-head">
      <b>Run of show</b>
      <button type="button" className="fd-runshow-x" aria-label="Close run of show" onClick={onClose}>✕</button>
    </header>
    <ol className="fd-runshow-beats">
      {model.beats.map(item => <li key={item.slot} className={item.slot === "Now" ? "is-now" : undefined}>
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
