/* The floating QA bar: the console, one-tap Sim contest (a single server
   write), the guest lens, and the live driver's progress with its Stop. */
import React from "react";
import { Tag } from "../../ui/controls.jsx";
import { useQaFast } from "./useQaFast.js";
import "./qa.css";

export function QABar({ me, status, onExit, sim, onStop, guestLens, onLens, onOpen,
  minimized, onMin, top, onPos, dispatch, environment, notify }) {
  const qa = useQaFast({ dispatch, environment, notify });
  const finished = status.current === "No active event";
  if (minimized) return (
    <button type="button" className="fd-qa-mini" onClick={onMin}
      style={{ bottom:"calc(74px + env(safe-area-inset-bottom))" }}>
      {sim && <span className="fd-qa-pulse" />}
      QA · {status.environment.toUpperCase()}</button>
  );
  return (
    <div className="fd-qa-bar" style={top ? { top:"calc(64px + env(safe-area-inset-top))" }
      : { bottom:"calc(66px + env(safe-area-inset-bottom))" }}>
      <div className="fd-night fd-qa-bar-card">
        <div className="fd-qa-bar-head">
          <b>QA</b>
          <Tag tone={status.environment === "production" ? "flame" : "gold"}>{status.environment}</Tag>
          <span>{status.current} · {status.phase}</span>
          <button type="button" className="fd-qa-bar-icon" onClick={onPos}
            aria-label={top ? "Dock bottom" : "Dock top"}>{top ? "▾" : "▴"}</button>
          <button type="button" className="fd-qa-bar-icon" onClick={onMin} aria-label="Minimize">–</button>
          <button type="button" className="fd-qa-bar-icon" onClick={onExit} aria-label="Exit QA">✕</button>
        </div>
        {sim ? (
          <div className="fd-qa-bar-row">
            <span className="fd-qa-pulse" />
            <p>{sim}</p>
            <button type="button" className="fd-qa-bar-btn is-primary" onClick={onStop}>Stop</button>
          </div>
        ) : qa.prompt ? (
          <div className="fd-qa-bar-row">
            <p>{qa.prompt.message}</p>
            <button type="button" className="fd-qa-bar-btn is-primary" onClick={qa.confirm}>Confirm</button>
            <button type="button" className="fd-qa-bar-btn" onClick={qa.cancel}>Cancel</button>
          </div>
        ) : (
          <div className="fd-qa-bar-row">
            <button type="button" className="fd-qa-bar-btn is-primary" onClick={onOpen}>Console</button>
            <button type="button" className="fd-qa-bar-btn" disabled={!!qa.pending || finished}
              aria-busy={!!qa.pending || undefined}
              onClick={() => qa.jump("step", "Contest simmed")}>Sim contest</button>
            <button type="button" className="fd-qa-bar-btn" onClick={onLens}
              aria-pressed={guestLens}>{guestLens ? "Guest view on" : "Guest view"}</button>
            <small>As <b>{me || "nobody"}</b></small>
          </div>
        )}
      </div>
    </div>
  );
}
