import React, { useEffect, useRef, useState } from "react";
import { EventName } from "../../ui/OneSafe.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { BitStage } from "./BitStage.jsx";
import { bitById } from "./bits/registry.js";
import { gagCast } from "./gagModel.js";
import "./highlights.css";

/* A highlights turn (highlights.js): one of the weekend's moments replayed
   in a window of glass in the TV's gap, the event it came from and a Replay
   lamp under it. The bit plays from the turn's start (a TV that draws the
   turn within a tick of it plays it whole, one that joins later joins it
   there) and holds on its punchline (`still`) for the rest of the turn,
   name and fact lettered. Silent; reduced motion holds the still. Shot on
   the painting of the session it happened in. */

/* canvas px: the window, a 16:9 cut of the canvas */
export const HIGHLIGHT_SCREEN = Object.freeze({ width:1200, height:675 });
/* a turn first drawn this soon after it began plays its whole entrance
   (the TV's clock ticks once a second) */
export const HIGHLIGHT_GRACE_MS = 1100;

/* how far into the bit this TV first drew the turn, fixed for the turn */
function useTurnClock(key, turnAt, now) {
  const ref = useRef({ key:undefined });
  if (ref.current.key !== key) {
    const late = Math.max(0, Math.round(Number(now) - Number(turnAt)) || 0);
    ref.current = { key, elapsed:late < HIGHLIGHT_GRACE_MS ? 0 : late, drawnAt:serverNow() };
  }
  return ref.current;
}

export function TVHighlight({ state, entry, turnAt = 0, now = 0, phase = "fri" }) {
  const bit = bitById(entry?.bit);
  const key = `${entry?.id}@${turnAt}`;
  const clock = useTurnClock(key, turnAt, now);
  /* the bit plays to its punchline, then holds there */
  const [held, setHeld] = useState(null);
  const stillAt = bit ? bit.still : 0;
  const holding = held === key || clock.elapsed >= stillAt;
  useEffect(() => {
    if (!bit || holding) return undefined;
    const wait = stillAt - clock.elapsed - (serverNow() - clock.drawnAt);
    const timer = setTimeout(() => setHeld(key), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [key, holding]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!entry || !bit) return null;
  const label = ["Replay", entry.evName, entry.name, entry.fact].filter(Boolean).join(", ");
  return (
    <div className="tv-pane tv-highlight-pane">
      <section className="tv-highlight tv-glass" aria-label={label} data-highlight={bit.id}
        style={{ "--tl":`${-Math.min(clock.elapsed, 600)}ms` }}>
        <div className="tv-highlight-screen" style={{ width:HIGHLIGHT_SCREEN.width, height:HIGHLIGHT_SCREEN.height }}>
          <BitStage phase={entry.session || phase} bit={bit} cast={gagCast(entry)} state={state}
            name={entry.name || null} fact={entry.fact || null}
            {...(holding ? { at:stillAt, frozen:true, runKey:`${key}:still` } : { at:clock.elapsed, runKey:key })} />
        </div>
        <div className="tv-highlight-foot">
          <span className="tv-status is-next"><i className="fd-insert" />Replay</span>
          <span className="tv-highlight-event"><EventName name={entry.evName} /></span>
        </div>
      </section>
    </div>
  );
}
