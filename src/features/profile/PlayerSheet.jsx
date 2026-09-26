import React, { useEffect, useRef, useState } from "react";
import { PT, atRisk, disp, maxRisk, pokerLive, resolveDuel, stacksPosted } from "../../../shared/core.js";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { PlayerPass } from "./PlayerPass.jsx";
import "./player-sheet.css";

const ANTES = [PT, 2 * PT, 5 * PT, 10 * PT];
const fmt = n => (n ?? 0).toLocaleString("en-US");
const signed = n => `${n > 0 ? "+" : ""}${fmt(n)}`;

/* Public identity has the same destination wherever a player is selected.
   Ratings and travel answers belong to the editor and commissioner views. */
export function PlayerSheet({ state, me, p, standings, events = [], onClose, onBack, onEdit, onDuel }) {
  const [ante, setAnte] = useState(PT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const row = standings.find(item => item.player === p);
  const duels = state.duels || [];
  const openDuels = duels.filter(d => d.status === "open" && !resolveDuel(d).settled);
  const settled = duels.map(d => resolveDuel(d)).filter(result => result.settled && !result.push);
  const duelWins = settled.filter(result => result.winner === p).length;
  const duelLosses = settled.filter(result => result.loser === p).length;
  const wins = events.filter(event => state.results[event.id]?.slots?.[0]?.includes(p));
  const existingDuel = openDuels.some(d => (d.from === me && d.to === p) || (d.from === p && d.to === me));
  const tableOpen = state.poker && !state.results[state.poker.id];
  const canDuel = !!(onDuel && me && me !== p && state.live && !state.frozen
    && !tableOpen && !pokerLive(state) && !stacksPosted(state));

  // Mirror sendDuel: wagers and open duel antes both reserve the balance.
  const spendable = player => {
    const pts = standings.find(item => item.player === player)?.pts ?? 0;
    const committed = openDuels.filter(d => d.from === player || d.to === player)
      .reduce((total, d) => total + d.stake, 0);
    const exposure = atRisk(state, player, events) + committed;
    return Math.min(maxRisk(pts) - exposure, pts - exposure);
  };
  const anteMax = canDuel ? Math.min(spendable(me), spendable(p)) : 0;
  const dailyLimit = duels.filter(d => d.from === me && d.status !== "declined"
    && d.ts > Date.now() - 24 * 60 * 60 * 1000).length >= 3;
  const unavailable = existingDuel ? "A challenge between you two is already open."
    : dailyLimit ? "Three challenges a day, max."
      : anteMax < PT ? "Not enough chips for an ante." : "";

  useEffect(() => {
    setAnte(current => current <= anteMax ? current : ANTES.filter(value => value <= anteMax).at(-1) || PT);
  }, [anteMax]);
  useEffect(() => { setAnte(PT); setError(""); }, [p]);

  const challenge = async () => {
    if (sending.current || !canDuel || unavailable || ante > anteMax) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onDuel(ante);
      if (result?.ok) onClose();
      else setError(result?.error || "Challenge wasn't sent. Try again.");
    } catch (cause) {
      setError(cause?.message || "Challenge wasn't sent. Try again.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return <Sheet title={disp(state, p)} onClose={onClose} onBack={onBack} busy={pending}>
    <div className="fd-player-sheet">
      <PlayerPass key={p} state={state} p={p} compact />

      {state.live && row && <dl className="fd-player-stats" aria-label="Tournament stats">
        <div><dt>Position</dt><dd>{row.rank}</dd></div>
        <div><dt>Chips</dt><dd>{fmt(row.pts)}</dd></div>
        <div><dt>Wins</dt><dd>{row.wins}</dd></div>
      </dl>}
      {state.live && row && (row.betNet !== 0 || duelWins > 0 || duelLosses > 0) && <dl className="fd-player-record">
        {row.betNet !== 0 && <div><dt>Wagers</dt><dd>{signed(row.betNet)}</dd></div>}
        {(duelWins > 0 || duelLosses > 0) && <div><dt>Duels</dt>
          <dd>{duelWins} won · {duelLosses} lost<span>{signed(row.duelNet)} chips</span></dd></div>}
      </dl>}
      {wins.length > 0 && <section className="fd-player-wins" aria-label="Event wins">
        <h2>Event wins</h2>
        <ul>{wins.map(event => <li key={event.id}>{event.name}</li>)}</ul>
      </section>}

      {me === p && onEdit && <ActionButton type="button" variant="secondary" onClick={onEdit}
        style={{ width:"100%" }}>Edit your profile</ActionButton>}

      {canDuel && <section className="fd-player-duel" aria-label="Quick Draw challenge">
        <details className="fd-player-duel-rules"><summary><h2>Quick Draw</h2><span>How to play +</span></summary>
          <p>You both play on your own phone whenever you want. The screen flashes after a random
            wait, tap it. Fastest tap wins the pot. Tapping early is a foul.</p>
        </details>
        {unavailable ? <p className="fd-player-unavailable" role="status">{unavailable}</p> : <>
          <fieldset className="fd-player-antes" disabled={pending}>
            <legend>Ante, each</legend>
            {ANTES.map(value => <button type="button" key={value} disabled={value > anteMax || pending}
              aria-pressed={ante === value} aria-label={`Ante ${fmt(value)} chips each`}
              onClick={() => setAnte(value)}>
              <BankChip p={me} size={44} val={value} />
            </button>)}
          </fieldset>
          {error && <p className="fd-player-error" role="alert">{error}</p>}
          <ActionButton type="button" onClick={challenge} disabled={pending || ante > anteMax}
            pending={pending} style={{ width:"100%" }}>
            {pending ? "Sending…" : `Challenge ${disp(state, p)} for ${fmt(ante)}`}
          </ActionButton>
        </>}
      </section>}
    </div>
  </Sheet>;
}
