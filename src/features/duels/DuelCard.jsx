import React, { useRef, useState } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ChipStack, HOUSE_CHIP } from "../wagers/BetStacks.jsx";
import { duelView } from "./duelView.js";
import { tapTick } from "../../lib/haptics.js";
import "./duel-card.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const DONE = { decline:"Declined", withdraw:"Withdrawn", void:"Voided" };
const PENDING = { accept:"Accepting…", decline:"Declining…", withdraw:"Withdrawing…", void:"Voiding…" };

/* the lamp beside a duel's state: flashing while it waits on you, steady
   once your opponent is ready (the showdown), none otherwise */
const lampFor = view => view.canAccept || (view.canPlay && !view.meReady) ? "pending"
  : view.otherReady || view.mode === "showdown" ? "on" : null;

/* One duel with the actions its viewer actually has: a painted glass field
   in the chips' amber, the opponent's chip and name, its state on a lamp,
   the ante as the house's chips. Opponent identity and each action are
   separate targets. Every write is guarded until the server acknowledges
   it; a rejection leaves the same action available for retry. */
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
    view.canPlay && { key:"play", label:"Play",
      aria:`Play Quick Draw with ${name}`,
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
  const lamp = lampFor(view);

  const who = <>
    {other ? <ChipFace p={other} size={44} flat /> : <ChipFace size={44} empty />}
    <span className="fd-duel-who">
      <strong className="fd-show">{name}</strong>
      <span className="fd-duel-status">{lamp && <i className={`fd-insert${lamp === "pending" ? " is-pending" : ""}`} aria-hidden="true" />}
        {view.status}</span>
    </span>
  </>;
  return <article aria-label={`Quick Draw with ${name}`} aria-busy={busy}
    className={`fd-duel-card${bare ? " is-bare" : ` fd-glass-field fd-field-chip fd-lamp is-chip${highlight ? " is-live" : ""}`}`}>
    <div className="fd-duel-head">
      {other && onPlayer ? <button type="button" className="fd-duel-person" aria-label={`View ${name}'s player card`}
        disabled={busy || !onPlayer || !!acknowledged} onClick={() => interact(() => onPlayer?.(other))}>{who}</button>
        : <div className="fd-duel-person">{who}</div>}
      <span className="fd-duel-ante" aria-label={`${fmt(duel.stake)} each`}>
        <ChipStack p={null} stake={duel.stake || 0} size={24} chip={HOUSE_CHIP} tag={false} />
        <strong>{fmt(duel.stake || 0)}</strong>
      </span>
    </div>
    {acknowledged ? <p role="status" className="fd-duel-done"><i className="fd-insert is-void" aria-hidden="true" />{acknowledged}</p>
      : !!actions.length && <div className="fd-duel-actions" style={{ "--duel-actions":actions.length }}>
        {actions.map(action => <button type="button" key={action.key} aria-label={action.aria}
          disabled={busy || !action.enabled} onClick={action.callback}
          className={`fd-duel-act${action.primary ? " is-primary" : ""}${action.danger ? " is-danger" : ""}${
            busy && pendingAction !== action.key ? " is-waiting" : ""}`}>
          {action.label}
        </button>)}
      </div>}
    {error && <p role="alert" className="fd-duel-error">{error}</p>}
  </article>;
}
