/* The QA strip: one row in the commissioner's dock. Its left half is where
   the rehearsal stands (the event and its phase) and opens the console;
   the right half is the two taps a rehearsal repeats: Bets (everyone bets
   on the contest taking bets, shown only while one is) and Sim (the current
   contest, once). A running live driver takes the row with its Stop; a
   write that needs a confirm takes it with Confirm and Cancel. */
import React from "react";
import { Icon } from "../../ui/Icon.jsx";
import { useQaFast } from "./useQaFast.js";
import "./qa.css";

const ENV = { local:"Local", staging:"Staging", production:"Production" };

export function QABar({ status, sim, onStop, guestLens, onLens, onOpen, market = null,
  dispatch, environment, notify }) {
  const qa = useQaFast({ dispatch, environment, notify });
  const finished = status.current === "No active event";
  const production = status.environment === "production";
  const env = ENV[status.environment] || status.environment;
  const body = sim ? <>
      <span className="fd-qa-pulse" aria-hidden="true" />
      <p className="fd-qa-strip-text">{sim}</p>
      <button type="button" className="fd-qa-strip-btn is-stop" onClick={onStop}><Icon name="stop" size={16} />Stop</button>
    </>
    : qa.prompt ? <>
      <p className="fd-qa-strip-text">{qa.prompt.message}</p>
      <button type="button" className="fd-qa-strip-btn is-commit" onClick={qa.confirm}>Confirm</button>
      <button type="button" className="fd-qa-strip-btn" onClick={qa.cancel} aria-label="Cancel"><Icon name="close" size={16} /></button>
    </>
    : <>
      <button type="button" data-qa-open className="fd-qa-strip-open" onClick={onOpen} aria-label={`QA console, ${env}`}>
        <span className="fd-qa-badge"><Icon name="flask" size={16} lit />{env}</span>
        <span className="fd-qa-where"><b>{status.current}</b><small>{status.phase}</small></span>
      </button>
      {guestLens && <button type="button" className="fd-qa-strip-btn is-on" aria-pressed="true" onClick={onLens}>
        <Icon name="person" size={16} lit />Guest</button>}
      {market && <button type="button" className="fd-qa-strip-btn" disabled={!!qa.pending}
        aria-busy={qa.pending === "bets:everyone" || undefined} aria-label="Everyone bets"
        onClick={() => qa.bets("everyone", market)}><Icon name="bets" size={16} />Bets</button>}
      <button type="button" className="fd-qa-strip-btn" disabled={!!qa.pending || finished}
        aria-busy={qa.pending === "step" || undefined} aria-label="Sim contest"
        onClick={() => qa.jump("step", "Contest simmed")}><Icon name="then" size={16} />Sim</button>
    </>;
  return <div className={`fd-qa-strip${production ? " is-production" : ""}`} role="group" aria-label="QA">{body}</div>;
}
