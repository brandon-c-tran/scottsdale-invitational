import React, { useRef, useState } from "react";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { duelView } from "./duelView.js";
import { tapTick } from "../../lib/haptics.js";

const actionStyle = {
  minWidth:0, minHeight:44, padding:"10px 8px", borderRadius:10,
  border:"1px solid var(--line)", background:"var(--paper2)", color:"var(--ink)",
  fontFamily:"var(--fd-body)", fontSize:12, fontWeight:600, cursor:"pointer",
};
const DONE = { decline:"Declined", withdraw:"Withdrawn", void:"Voided" };
const PENDING = { accept:"Accepting…", decline:"Declining…", withdraw:"Withdrawing…", void:"Voiding…" };

/* One duel with the actions its viewer actually has. Opponent identity and
   each action are separate targets. Every write is guarded until the server
   acknowledges it; a rejection leaves the same action available for retry. */
export function DuelCard({ state, duel, me, gm, now, onPlay, onAccept, onDecline, onWithdraw, onVoid, onPlayer, bare = false }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(null);
  const pending = useRef(null);
  const finished = useRef(false);
  const view = duelView(state, duel, me, now);
  const { other, name } = view;
  const busy = !!pendingAction;

  const submit = (action, handler) => {
    if (pending.current) return pending.current;
    if (finished.current || !handler) return;
    if (action === "accept") tapTick();
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
        if (DONE[action]) {
          finished.current = true;
          setAcknowledged(DONE[action]);
        }
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
  const label = key => (pendingAction === key ? PENDING[key] : null);
  const actions = [
    view.canAccept && { key:"accept", label:label("accept") || "Accept",
      aria:`Accept duel with ${name}`, callback:() => submit("accept", onAccept), enabled:!!onAccept, primary:true },
    view.canPlay && { key:"play", label:"Play", aria:`Play Quick Draw with ${name}`,
      callback:() => interact(() => onPlay?.(duel.id)), enabled:!!onPlay, primary:true },
    view.canDecline && { key:"decline", label:label("decline") || "Decline",
      aria:`Decline duel with ${name}`, callback:() => submit("decline", onDecline), enabled:!!onDecline },
    view.canWithdraw && { key:"withdraw", label:label("withdraw") || "Withdraw",
      aria:duel.open ? "Withdraw open challenge" : `Withdraw challenge to ${name}`,
      callback:() => submit("withdraw", onWithdraw), enabled:!!onWithdraw },
    gm && { key:"void", label:label("void") || "Void", aria:`Void duel with ${name}`,
      callback:() => submit("void", onVoid), enabled:!!onVoid, danger:true },
  ].filter(Boolean);
  const highlight = view.canPlay || view.canAccept;

  /* on its own, a duel is a painted glass field in the chips' amber (the
     viewport's one painting is elsewhere), its lamp lit while it wants you */
  return <article aria-label={`Quick Draw with ${name}`} aria-busy={busy}
    className={bare ? undefined : `fd-glass-field fd-field-chip fd-lamp is-chip${highlight ? " is-live" : ""}`}
    style={bare ? { minWidth:0 } : { padding:"12px 12px 12px", marginBottom:8, minWidth:0 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
      {other && onPlayer ? <button type="button" aria-label={`View ${name}'s player card`} disabled={busy || !onPlayer || !!acknowledged}
        onClick={() => interact(() => onPlayer?.(other))}
        style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0, minHeight:44,
          border:0, padding:0, background:"none", color:"var(--ink)", textAlign:"left",
          cursor:busy ? "default" : "pointer", fontFamily:"var(--fd-body)" }}>
        <Avatar state={state} p={other} size={36} />
        <span style={{ flex:1, minWidth:0, overflowWrap:"anywhere" }}>
          <strong style={{ display:"block", fontSize:14, fontWeight:600, lineHeight:1.3 }}>{name}</strong>
          <span style={{ display:"block", marginTop:3, fontSize:12, lineHeight:1.4, color:"var(--muted2)" }}>{view.status}</span>
        </span>
      </button> : <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0, minHeight:44,
        fontFamily:"var(--fd-body)", color:"var(--ink)" }}>
        {other && <Avatar state={state} p={other} size={36} />}
        <span style={{ flex:1, minWidth:0, overflowWrap:"anywhere" }}>
          <strong style={{ display:"block", fontSize:14, fontWeight:600, lineHeight:1.3 }}>{name}</strong>
          <span style={{ display:"block", marginTop:3, fontSize:12, lineHeight:1.4, color:"var(--muted2)" }}>{view.status}</span>
        </span>
      </div>}
      <span style={{ flexShrink:0, textAlign:"right", color:"var(--ink)", fontFamily:"var(--fd-body)" }}>
        <strong style={{ fontFamily:"var(--fd-display)", fontSize:24, fontWeight:800, color:"var(--sun)" }}>{(duel.stake || 0).toLocaleString("en-US")}</strong>
        <small style={{ display:"block", color:"var(--muted2)", fontSize:12, marginTop:2 }}>each</small>
      </span>
    </div>
    {acknowledged ? <p role="status" style={{ margin:"10px 0 0", color:"var(--muted2)", fontSize:12 }}>{acknowledged}</p>
      : !!actions.length && <div style={{ display:"grid", gridTemplateColumns:`repeat(${actions.length}, minmax(0, 1fr))`, gap:8, marginTop:10 }}>
        {actions.map(action => <button type="button" key={action.key} aria-label={action.aria}
          disabled={busy || !action.enabled} onClick={action.callback}
          style={{ ...actionStyle,
            ...(action.primary ? { background:"var(--action-fill)", color:"var(--action-ink)", borderColor:"var(--action-fill)" } : {}),
            ...(action.danger ? { color:"var(--live2)", borderColor:"var(--danger-line)" } : {}),
            cursor:busy || !action.enabled ? "default" : "pointer", opacity:busy && pendingAction !== action.key ? .55 : 1 }}>
          {action.label}
        </button>)}
      </div>}
    {error && <p role="alert" style={{ margin:"10px 0 0", fontFamily:"var(--fd-body)", fontSize:12,
      color:"var(--live2)", lineHeight:1.5, overflowWrap:"anywhere" }}>{error}</p>}
  </article>;
}
