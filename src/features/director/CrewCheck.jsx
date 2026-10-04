/* Before the draw: one screen, every player as a photo chip. A brush picks
   what a tap does (Crew or Away); the suggestion is preselected and shown.
   Away writes at once (setAway); the crew rides on the one confirm. */
import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { tapTick } from "../../lib/haptics.js";
import { crewCheckModel, cycleRole, suggestedCrew, toggleCrew } from "./crewCheck.js";
import "./crew-check.css";

export function CrewCheck({ state, ev, roles = null, confirmLabel = "Announce and draw", onConfirm, onAway, onClose, onBack }) {
  const [crew, setCrew] = useState(() => (roles || suggestedCrew(state, ev)).map(item => ({ ...item })));
  const [brush, setBrush] = useState("crew");
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const edited = useRef(false);
  const busy = useRef(false);
  const awayKey = Object.keys(state.away || {}).filter(player => state.away[player]).sort().join("|");
  /* who is here changed: until the crew was touched, follow the suggestion */
  useEffect(() => {
    if (!edited.current) setCrew(suggestedCrew(state, ev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awayKey]);
  const model = crewCheckModel(state, ev, crew);
  const away = model.roster.filter(item => item.state === "away").length;

  const tap = async player => {
    if (busy.current) return;
    const entry = model.roster.find(item => item.player === player);
    tapTick();
    setError("");
    if (brush === "crew") {
      if (entry.state === "away") return;
      edited.current = true;
      setCrew(current => toggleCrew(ev, current, player));
      return;
    }
    busy.current = true; setPending(player);
    try {
      const result = await onAway?.(player, entry.state !== "away");
      if (result && !result.ok) setError(result.error || "Not saved. Try again.");
      else if (entry.state !== "away") setCrew(current => current.filter(item => item.player !== player));
    } finally { busy.current = false; setPending(null); }
  };
  const confirm = async () => {
    if (busy.current || !model.fit.ok) return;
    busy.current = true; setPending("confirm"); setError("");
    try {
      const result = await onConfirm(model.playing, model.crew);
      if (result && !result.ok) setError(result.error || "Not saved. Try again.");
    } catch (failure) { setError(failure?.message || "Not saved. Try again."); }
    finally { busy.current = false; setPending(null); }
  };

  return (
    <Sheet title="Before the draw" subtitle={ev.name}
      onClose={onClose} onBack={onBack} busy={pending === "confirm"} className="fd-crew-check">
      <div className="fd-crew-brush" role="radiogroup" aria-label="Mark">
        {[["crew", "Crew", model.crew.length], ["away", "Away", away]].map(([key, label, count]) => (
          <button key={key} type="button" role="radio" aria-checked={brush === key}
            className={`fd-crew-brush-option is-${key}${brush === key ? " is-on" : ""}`}
            disabled={!!pending} onClick={() => setBrush(key)}>
            <i className={`fd-insert${count ? "" : " is-done"}`} aria-hidden="true" />
            <span>{label}</span><b>{count}</b>
          </button>
        ))}
        {model.shape && <span className="fd-crew-shape">{model.shape}</span>}
      </div>
      <ul className="fd-crew-grid">
        {model.roster.map(item => (
          <li key={item.player} className={`fd-crew-seat is-${item.state}${pending === item.player ? " is-pending" : ""}`}>
            <button type="button" className="fd-crew-chip" disabled={!!pending || (brush === "crew" && item.state === "away")}
              aria-pressed={brush === "crew" ? item.state === "crew" : item.state === "away"}
              aria-label={`${disp(state, item.player)}: ${item.state === "crew" ? `crew, ${item.roleLabel}` : item.state}`}
              onClick={() => tap(item.player)}>
              <span className="fd-crew-face"><Avatar state={state} p={item.player} size={46} /></span>
              <span className="fd-crew-name">{disp(state, item.player)}</span>
            </button>
            {item.state === "crew" && (
              <button type="button" className="fd-crew-role" disabled={!!pending}
                aria-label={`${disp(state, item.player)} role: ${item.roleLabel}`}
                onClick={() => { edited.current = true; setCrew(current => cycleRole(ev, current, item.player)); }}>
                {item.roleLabel}</button>
            )}
          </li>
        ))}
      </ul>
      {!model.fit.ok && <p role="alert" className="fd-crew-error">{model.fit.error}</p>}
      {error && <p role="alert" className="fd-crew-error">{error}</p>}
      <ActionButton className="fd-crew-confirm" disabled={!model.fit.ok || !!pending} onClick={confirm}
        style={{ width:"100%", fontSize:16, padding:"14px" }}>
        {pending === "confirm" ? "Drawing…" : confirmLabel}</ActionButton>
    </Sheet>
  );
}
