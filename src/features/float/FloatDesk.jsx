/* The commissioner's Float desk (Commissioner > Games > Float): the Cup on
   the board now (racing, finished, or why the room never took it, with
   Start Float again), how many riders have picked their look, and the
   riders' feedback cards from the room (POST /internal/float/feedback),
   read over the commissioner's own socket (floatFeedback): never in state
   or a frame. Loaded on first use (lazyPart). */
import React, { useEffect, useState } from "react";
import { disp, rosterOf } from "../../../shared/core.js";
import { dispatch } from "../../lib/client.js";
import { writeError } from "../../lib/writeErrors.js";
import { ActionButton } from "../../ui/controls.jsx";
import { floatDeskStatus, floatFeedbackSummary, floatLooksPicked } from "./floatModel.js";
import "./float.css";

const readFeedback = () => dispatch("floatFeedback", {}, { retry:true });
const startAgain = evId => dispatch("floatStart", { evId, restart:true }, { retry:true });

export function FloatDesk({ state, load = readFeedback, onRestart = startAgain, initialFeedback = null }) {
  const [cards, setCards] = useState(initialFeedback);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (initialFeedback) return undefined;
    let gone = false;
    Promise.resolve().then(load).then(result => {
      if (gone) return;
      if (result?.ok) setCards(Array.isArray(result.extra?.feedback) ? result.extra.feedback : []);
      else setError(writeError(result, "Couldn't read the feedback. Try again."));
    }, () => { if (!gone) setError("Couldn't read the feedback. Try again."); });
    return () => { gone = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = floatDeskStatus(state);
  const coming = rosterOf(state).length;
  const summary = floatFeedbackSummary(cards || []);
  const restart = async () => {
    setPending(true); setError("");
    try {
      const result = await onRestart(status.cup.evId);
      if (result?.ok !== true && !result?.uncertain) setError(writeError(result));
    } finally { setPending(false); }
  };
  return <div className="fd-float-desk">
    <section className={`fd-float-desk-now is-${status.lamp}`} aria-label="The game">
      <i className="fd-insert" aria-hidden="true" />
      <span className="fd-float-desk-text">{status.text}</span>
      {status.cup?.error && <ActionButton compact disabled={pending} pending={pending} onClick={restart}>Start Float again</ActionButton>}
    </section>
    <div className="fd-float-desk-stats">
      <span><strong>{floatLooksPicked(state)}</strong><small>of {coming} critters picked</small></span>
      <span><strong>{summary.count}</strong><small>{summary.count === 1 ? "card" : "cards"}</small></span>
      {summary.fun !== null && <span><strong>{summary.fun}</strong><small>fun of 5</small></span>}
      {summary.asked > 0 && <span><strong>{summary.again}</strong><small>of {summary.asked} would play again</small></span>}
    </div>
    {error && <p className="fd-float-desk-error" role="alert">{error}</p>}
    {cards && cards.length > 0 && <ul className="fd-float-desk-cards">
      {cards.map(card => <li key={`${card.cupId}:${card.pid || card.at}`} className="fd-float-desk-card">
        <span className="fd-float-desk-who">{card.pid ? disp(state, card.pid) : "A rider"}</span>
        <span className="fd-float-desk-answers">
          {Number.isInteger(card.fun) && <b>{card.fun} of 5</b>}
          {typeof card.again === "boolean" && <b>{card.again ? "Again: yes" : "Again: no"}</b>}
        </span>
        {card.better && <p className="fd-float-desk-better">{card.better}</p>}
      </li>)}
    </ul>}
  </div>;
}
