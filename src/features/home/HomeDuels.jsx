import React, { useRef, useState } from "react";
import { disp, resolveDuel, stacksPosted } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";

const actionStyle = {
  minWidth:0, minHeight:44, padding:"10px 8px", borderRadius:10,
  border:"1px solid var(--line)", background:"var(--paper2)", color:"var(--ink)",
  fontFamily:"var(--fd-body)", fontSize:12, fontWeight:600, cursor:"pointer",
};

function HomeDuel({ state, duel, me, gm, onPlay, onDecline, onVoid, onPlayer }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(null);
  const pending = useRef(null);
  const finished = useRef(false);
  const myTurn = !duel.runs?.[me];
  const other = duel.from === me ? duel.to : duel.from;
  const name = disp(state, other);
  const canDecline = myTurn && duel.to === me && !Object.keys(duel.runs || {}).length;
  const busy = !!pendingAction;
  const status = !myTurn ? "Waiting for their turn" : duel.to === me ? "Challenged you" : "Your turn";

  // Keep all actions on this challenge guarded until the server acknowledges.
  // A rejection leaves the same challenge and action available for retry.
  const submit = (action, handler) => {
    if (pending.current) return pending.current;
    if (finished.current || !handler) return;
    setPendingAction(action);
    setError("");
    const failure = `Couldn't ${action} the duel. Try again.`;
    pending.current = Promise.resolve().then(() => handler(duel.id))
      .then(result => {
        if (result?.ok !== true) {
          const rejected = { ok:false, error:result?.error || failure };
          setError(rejected.error);
          return rejected;
        }
        finished.current = true;
        setAcknowledged(action === "decline" ? "Declined" : "Voided");
        return result;
      })
      .catch(() => {
        setError(failure);
        return { ok:false, error:failure };
      })
      .finally(() => { pending.current = null; setPendingAction(null); });
    return pending.current;
  };
  const interact = callback => {
    if (!pending.current && !finished.current) callback?.();
  };
  const actions = [
    myTurn && { key:"play", label:"Play", callback:() => interact(() => onPlay?.(duel.id)), enabled:!!onPlay },
    canDecline && { key:"decline", label:pendingAction === "decline" ? "Declining…" : "Decline",
      callback:() => submit("decline", onDecline), enabled:!!onDecline },
    gm && { key:"void", label:pendingAction === "void" ? "Voiding…" : "Void",
      callback:() => submit("void", onVoid), enabled:!!onVoid },
  ].filter(Boolean);

  return <article aria-label={`Quick Draw with ${name}`} aria-busy={busy}
    style={{ padding:12, border:"1px solid var(--line)", borderRadius:14, marginBottom:8,
      background:myTurn ? "var(--sun-tint)" : "var(--paper)", minWidth:0 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
      <button type="button" aria-label={`View ${name}'s player card`} disabled={busy || !onPlayer || !!acknowledged}
        onClick={() => interact(() => onPlayer?.(other))}
        style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0, minHeight:44,
          border:0, padding:0, background:"none", color:"var(--ink)", textAlign:"left",
          cursor:busy ? "default" : "pointer", fontFamily:"var(--fd-body)" }}>
        <Avatar state={state} p={other} size={36} />
        <span style={{ flex:1, minWidth:0, overflowWrap:"anywhere" }}>
          <strong style={{ display:"block", fontSize:14, fontWeight:600, lineHeight:1.3 }}>{name}</strong>
          <span style={{ display:"block", marginTop:3, fontSize:11, lineHeight:1.4, color:"var(--muted2)" }}>{status}</span>
        </span>
      </button>
      <span style={{ flexShrink:0, textAlign:"right", color:"var(--ink)", fontFamily:"var(--fd-body)" }}>
        <strong style={{ fontFamily:"var(--fd-display)", fontSize:22, fontWeight:600 }}>{(duel.stake || 0).toLocaleString("en-US")}</strong>
        <small style={{ display:"block", color:"var(--muted)", fontSize:9, marginTop:2 }}>each</small>
      </span>
    </div>
    {acknowledged ? <p role="status" style={{ margin:"10px 0 0", color:"var(--muted2)", fontSize:12 }}>{acknowledged}</p>
      : !!actions.length && <div style={{ display:"grid", gridTemplateColumns:`repeat(${actions.length}, minmax(0, 1fr))`, gap:8, marginTop:10 }}>
        {actions.map(action => <button type="button" key={action.key}
          aria-label={action.key === "play" ? `Play Quick Draw with ${name}` : `${action.label.replace("…", "")} duel with ${name}`}
          disabled={busy || !action.enabled} onClick={action.callback}
          style={{ ...actionStyle,
            ...(action.key === "play" ? { background:"var(--action-fill)", color:"var(--action-ink)", borderColor:"var(--action-fill)" } : {}),
            ...(action.key === "void" ? { color:"var(--live2)", borderColor:"var(--danger-line)" } : {}),
            cursor:busy || !action.enabled ? "default" : "pointer", opacity:busy && pendingAction !== action.key ? .55 : 1 }}>
          {action.label}
        </button>)}
      </div>}
    {error && <p role="alert" style={{ margin:"10px 0 0", fontFamily:"var(--fd-body)", fontSize:12,
      color:"var(--live2)", lineHeight:1.5, overflowWrap:"anywhere" }}>{error}</p>}
  </article>;
}

export function HomeDuels({ state, me, gm, onPlay, onDecline, onVoid, onPlayer }) {
  const tableOpen = state.poker && !state.results?.[state.poker.id];
  if (!me || !state.live || state.frozen || tableOpen || stacksPosted(state)) return null;
  const mine = (state.duels || []).filter(duel => duel.status === "open"
    && !resolveDuel(duel).settled && (duel.from === me || duel.to === me));
  if (!mine.length) return null;
  return <section aria-label="Your duels" style={{ margin:"12px 0", minWidth:0 }}>
    {mine.map(duel => <HomeDuel key={`${me}:${duel.id}`} state={state} duel={duel} me={me} gm={gm}
      onPlay={onPlay} onDecline={onDecline} onVoid={onVoid} onPlayer={onPlayer} />)}
  </section>;
}
