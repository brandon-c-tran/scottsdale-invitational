import React, { useEffect, useState } from "react";
import { callRemainingMs, liveCall, CALL_MS } from "../../../shared/call.js";
import { localGet, localSet } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { useFreshChange } from "../../lib/motion.js";
import { playSound } from "../../lib/sound.js";
import "./call.css";

/* D9 on a guest's phone: one bar at the top while the commissioner's call
   is up, "To the TV: Cornhole draw", for CALL_MS or until dismissed. A
   fresh call slides in and knocks (S16, the phone's own-moment bus); a
   phone that opens mid-call shows it still, without either. A dismissal
   is remembered on this device for that call only. */
export const CALL_DISMISSED_KEY = "si-call-dismissed";

export const TvGlyph = ({ size = 22 }) => <svg className="fd-call-glyph" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
  <path d="M8.5 20.5h7M12 17v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  <rect className="fd-call-glyph-screen" x="5" y="6.5" width="14" height="8" rx=".8" fill="currentColor" />
</svg>;

/* re-render when the call's time is up */
function useCallExpiry(call) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!call) return undefined;
    const timer = setTimeout(() => setTick(n => n + 1), callRemainingMs(call, serverNow()) + 50);
    return () => clearTimeout(timer);
  }, [call?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function CallBar({ state, hidden = false, now:clockNow = serverNow }) {
  const call = liveCall(state, clockNow());
  const id = call?.id || null;
  const change = useFreshChange(id);
  const [dismissed, setDismissed] = useState(() => localGet(CALL_DISMISSED_KEY));
  useCallExpiry(call);
  const shown = !!call && !hidden && dismissed !== call.id;
  const arrived = shown && change.fresh && change.to === id;
  useEffect(() => {
    if (arrived) playSound("S16", { bus:"you", key:`call:${id}` });
  }, [arrived, id]);
  /* sheets make room under the bar while it shows */
  useEffect(() => {
    if (!shown || typeof document === "undefined") return undefined;
    document.documentElement.setAttribute("data-fd-call", "");
    return () => document.documentElement.removeAttribute("data-fd-call");
  }, [shown]);
  if (!shown) return null;
  const remaining = callRemainingMs(call, clockNow());
  const dismiss = () => { localSet(CALL_DISMISSED_KEY, call.id); setDismissed(call.id); };
  const text = call.label ? `To the TV: ${call.label}` : "To the TV";
  return <div className={`fd-call-bar${change.animate && change.to === id ? " is-arriving" : ""}`} role="status" aria-live="assertive">
    <div className="fd-call-inner">
      <TvGlyph />
      <p className="fd-call-text"><span>To the TV</span>{call.label && <b>{call.label}</b>}</p>
      <button type="button" className="fd-call-x" aria-label={`Dismiss ${text}`} onClick={dismiss}>✕</button>
      <i className="fd-call-time" aria-hidden="true"
        style={{ "--call-ms":`${CALL_MS}ms`, "--call-elapsed":`${-Math.round(CALL_MS - remaining)}ms` }} />
    </div>
  </div>;
}
