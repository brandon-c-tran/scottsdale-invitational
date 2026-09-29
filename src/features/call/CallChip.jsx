import React, { useEffect, useRef, useState } from "react";
import { callRemainingMs, callSuggestion, liveCall, manualCall } from "../../../shared/call.js";
import { dispatch } from "../../lib/client.js";
import { serverNow, useServerNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { TvGlyph } from "./CallBar.jsx";
import "./call.css";

const clock = ms => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* D9 beside the director pill. Near a ceremony (the next beat announces,
   draws, plays a winner or crowns, or one is on the TV now) it offers
   "Call everyone" for that ceremony in one tap. Otherwise it is a small TV
   button: the first tap shows what it will call, the second calls. While a
   call is up it counts down and can be ended. The call is its own write,
   never part of the beat. */
export function CallChip({ state, events, director, notify, now:clockNow = serverNow, send = dispatch }) {
  useServerNow(1000);
  const now = clockNow();
  const call = liveCall(state, now);
  const suggestion = call ? null : callSuggestion(state, events, director, now);
  const [armed, setArmed] = useState(false), [pending, setPending] = useState(false);
  const busy = useRef(false);
  useEffect(() => { if (call || suggestion) setArmed(false); }, [call?.id, suggestion?.kind, suggestion?.eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const write = async (type, payload) => {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const result = await send(type, payload);
      if (result?.ok !== true) notify?.(result?.uncertain ? "Not confirmed yet" : result?.error || "Not saved. Try again.");
      else setArmed(false);
    } catch { notify?.("Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  const callFor = target => { tapTick(); return write("callEveryone", { kind:target.kind, eventId:target.eventId }); };

  if (call) return <div className="fd-call-chip is-live" role="status">
    <TvGlyph size={18} />
    <span className="fd-call-chip-text"><b>Called</b><small>{call.label || "To the TV"} · {clock(callRemainingMs(call, now))}</small></span>
    <button type="button" className="fd-call-chip-end" disabled={pending} onClick={() => write("endCall", { id:call.id })}>End</button>
  </div>;

  const target = suggestion || (armed ? manualCall(state, events, director) : null);
  if (!target) return <button type="button" className="fd-call-chip is-compact" aria-label="Call everyone to the TV"
    onClick={() => setArmed(true)}><TvGlyph size={20} /></button>;
  return <div className="fd-call-chip-row">
    {!suggestion && <button type="button" className="fd-call-chip-cancel" aria-label="Cancel" onClick={() => setArmed(false)}>✕</button>}
    <button type="button" className="fd-call-chip" disabled={pending} aria-busy={pending || undefined}
      onClick={() => callFor(target)}>
      <TvGlyph size={18} />
      <span className="fd-call-chip-text"><b>{pending ? "Calling…" : "Call everyone"}</b>
        <small>{target.label ? `To the TV: ${target.label}` : "To the TV"}</small></span>
    </button>
  </div>;
}
