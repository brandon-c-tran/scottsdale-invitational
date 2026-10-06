import React, { useRef, useState } from "react";
import { ROSTER, arrivalsOpen, disp, hasArrived, isAway, isOut, rosterOf } from "../../../shared/core.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { tapTick } from "../../lib/haptics.js";
import "./roster.css";
import { writeError } from "../../lib/writeErrors.js";

/* Who is coming: every invited player in one of three states. Here plays
   everything; Away sits out new draws, contests and the poker table and
   keeps their chips; Not coming takes them off the weekend (board, check-in,
   draws, counts) until it is taken back. The server refuses Not coming for
   anyone the weekend already has a record of, and says why on that row.

   Arrivals (Oct 4): while check-in is open, a player still on the way has
   their lamp flashing, their face unlit in a dashed seat, and Mark here
   under their name (for someone without a phone: the commissioner needs no
   code). Checking in is otherwise the guest's own scan of the TV. Check-in
   itself is one small control at the top (Open, Close, and New code, which
   gives the TV a fresh code and retires the old one). */
const STATES = [
  { id:"here", label:"Here" },
  { id:"away", label:"Away" },
  { id:"out", label:"Not coming" },
];
export const rosterStateOf = (state, player) => isOut(state, player) ? "out" : isAway(state, player) ? "away" : "here";
/* on the way: here for the weekend, not checked in, check-in open */
export const onTheWayIn = (state, player) => rosterStateOf(state, player) === "here" && arrivalsOpen(state) && !hasArrived(state, player);

/* check-in's count: who is in, of everyone coming */
export const doorCount = state => {
  const roster = rosterOf(state);
  return { here:roster.filter(player => hasArrived(state, player)).length, total:roster.length };
};

export function RosterSheet({ state, onAway, onOut, onArrived, onDoor, onNewCode = null, onClose, onBack }) {
  const [pending, setPending] = useState(null);
  const [errors, setErrors] = useState({});
  const busy = useRef(false);
  const coming = ROSTER.filter(player => !isOut(state, player)).length;
  const door = arrivalsOpen(state) && !!onArrived;
  const count = doorCount(state);

  const run = async (key, write) => {
    if (busy.current) return;
    busy.current = true;
    tapTick();
    setPending(key);
    setErrors(all => ({ ...all, [key]:null }));
    try {
      const result = await write();
      if (!result?.ok && !result?.extra?.unchanged)
        setErrors(all => ({ ...all, [key]:writeError(result) }));
    } catch (failure) {
      setErrors(all => ({ ...all, [key]:writeError(failure) }));
    } finally {
      busy.current = false;
      setPending(null);
    }
  };

  const choose = (player, next) => {
    const current = rosterStateOf(state, player);
    if (next === current) return;
    run(player, async () => {
      /* one state at a time: leaving Not coming lands on Here first */
      let result = { ok:true };
      if (current === "out") result = await onOut(player, false);
      if (result?.ok && next === "out") return onOut(player, true);
      if (!result?.ok) return result;
      if (next === "away") return isAway(state, player) ? result : onAway(player, true);
      if (isAway(state, player) || current === "out") result = await onAway(player, false);
      return result;
    });
  };

  return <Sheet title="Who is coming" onClose={onClose} onBack={onBack} busy={!!pending}>
    <div className="fd-roster-head">
      <div className="fd-roster-count" aria-label={`${coming} of ${ROSTER.length} coming`}>
        <strong>{coming}</strong><span>of {ROSTER.length}</span>
      </div>
      {onDoor && <div className={`fd-roster-door${door ? " is-open" : ""}`}>
        <span className="fd-roster-door-count" aria-label={door ? `Check-in open, ${count.here} of ${count.total} in` : "Check-in closed"}>
          <i className={`fd-insert is-info${door ? count.here < count.total ? " is-pending" : "" : " is-done"}`} aria-hidden="true" />
          <span>Check-in</span>{door && <strong>{count.here}/{count.total}</strong>}</span>
        {door && onNewCode && <button type="button" className="fd-roster-door-link" disabled={!!pending}
          onClick={() => run("code", onNewCode)}>New code</button>}
        <ActionButton variant="secondary" compact className="fd-roster-door-go" pending={pending === "door"}
          disabled={!!pending && pending !== "door"} onClick={() => run("door", () => onDoor(!door))}>
          {door ? "Close" : "Open"}</ActionButton>
        {(errors.door || errors.code) && <p className="fd-roster-error" role="alert">{errors.door || errors.code}</p>}
      </div>}
    </div>
    <ul className="fd-roster" aria-label="Invited players">
      {ROSTER.map(player => {
        const now = rosterStateOf(state, player);
        const road = door && onTheWayIn(state, player);
        const error = errors[player] || errors[`mark:${player}`];
        return <li key={player} className={`fd-roster-row is-${now}${road ? " is-road" : ""}${pending === player ? " is-pending" : ""}`}>
          <span className="fd-roster-who">
            <i className={`fd-insert${now === "out" ? " is-void" : road ? " is-pending" : ""}${pending === player ? " is-pending" : ""}`}
              style={{ "--lamp-on":now === "away" ? "var(--sun)" : "var(--lamp-info)" }} aria-hidden="true" />
            <span className="fd-roster-face"><Avatar state={state} p={player} size={36} /></span>
            <span className="fd-roster-name">{disp(state, player)}</span>
          </span>
          <span className="fd-roster-switch" role="radiogroup" aria-label={disp(state, player)}>
            {STATES.map(option => <button key={option.id} type="button" role="radio" aria-checked={now === option.id}
              disabled={!!pending} onClick={() => choose(player, option.id)}>{option.label}</button>)}
          </span>
          {road && <span className="fd-roster-arrive">
            <span className="fd-roster-arrive-word">On the way</span>
            <ActionButton variant="secondary" compact pending={pending === `mark:${player}`} disabled={!!pending && pending !== `mark:${player}`}
              onClick={() => run(`mark:${player}`, () => onArrived(player, true))} aria-label={`Mark ${disp(state, player)} here`}>
              Mark here</ActionButton>
          </span>}
          {error && <p className="fd-roster-error" role="alert">{error}</p>}
        </li>;
      })}
    </ul>
  </Sheet>;
}
