import React, { useRef, useState } from "react";
import { duelOpen, duelPhase } from "../../../shared/core.js";
import { ActionButton } from "../../ui/controls.jsx";
import { minutesLeft } from "./duelView.js";
import { useDuelClock } from "./useDuelClock.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");

/* Commissioner copy uses roster names, never display names. */
export function duelDeskLine(duel, now = Date.now()) {
  const stake = fmt(duel.stake);
  if (duelPhase(duel, now) === "offered") return duel.open
    ? `${duel.from} vs anyone, ${stake}, not taken, ${minutesLeft(duel, now)} min left`
    : `${duel.from} vs ${duel.to}, ${stake}, ${duel.to} has not accepted`;
  const waiting = [duel.from, duel.to].filter(player => !duel.runs?.[player]);
  const tail = waiting.length === 2 ? "neither has drawn" : `${waiting[0]} has not drawn`;
  return `${duel.from} vs ${duel.to}, ${stake}, ${tail}`;
}

export const openDuelsForDesk = (state, now = Date.now()) => (state?.duels || []).filter(duel => duelOpen(duel, now));

/* Every duel still waiting on someone, each with Void, plus one write that
   voids them all. The finale setup voids whatever is left here. */
export function DuelDesk({ state, onVoid, onVoidAll }) {
  const now = useDuelClock(state);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const inFlight = useRef(null);
  const open = openDuelsForDesk(state, now);
  if (!open.length) return null;
  const run = (key, handler) => {
    if (inFlight.current || !handler) return inFlight.current;
    setPending(key);
    setError("");
    inFlight.current = Promise.resolve().then(handler)
      .then(result => { if (result?.ok !== true) setError(result?.error || "Void failed. Try again."); return result; },
        () => { setError("Void failed. Try again."); return { ok:false }; })
      .finally(() => { inFlight.current = null; setPending(null); });
    return inFlight.current;
  };
  return <section className="fd-duel-desk" aria-label="Open duels"
    style={{ margin:"16px 0", padding:12, border:"1px solid var(--line)", borderRadius:14, background:"var(--paper)" }}>
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
      <h2 style={{ margin:0, font:"700 18px/1.1 var(--fd-display)", textTransform:"uppercase", color:"var(--ink)" }}>
        Open duels · {open.length}</h2>
      <ActionButton type="button" variant="destructive" compact disabled={!!pending || !onVoidAll}
        pending={pending === "all"} onClick={() => run("all", onVoidAll)}>
        {pending === "all" ? "Voiding…" : "Void all open duels"}</ActionButton>
    </div>
    <ul style={{ listStyle:"none", margin:"8px 0 0", padding:0 }}>
      {open.map(duel => <li key={duel.id} style={{ display:"flex", alignItems:"center", gap:10,
        padding:"6px 0", borderTop:"1px solid var(--line)" }}>
        <span style={{ flex:1, minWidth:0, fontSize:12.5, lineHeight:1.4, color:"var(--ink)", overflowWrap:"anywhere" }}>
          {duelDeskLine(duel, now)}</span>
        <ActionButton type="button" variant="destructive" compact disabled={!!pending || !onVoid}
          pending={pending === duel.id} aria-label={`Void ${duel.from} vs ${duel.to || "anyone"}`}
          onClick={() => run(duel.id, () => onVoid(duel.id))}>
          {pending === duel.id ? "Voiding…" : "Void"}</ActionButton>
      </li>)}
    </ul>
    {error && <p role="alert" style={{ margin:"8px 0 0", color:"var(--live2)", fontSize:12, fontWeight:600 }}>{error}</p>}
  </section>;
}
