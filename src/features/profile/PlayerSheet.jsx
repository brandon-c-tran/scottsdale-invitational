import React, { useEffect, useRef, useState } from "react";
import { PT, DUEL_DAILY_LIMIT, DUEL_LAPSE_MS, disp, duelBetween, duelPhase, duelRoom, duelsSentToday, resolveDuel } from "../../../shared/core.js";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { DuelCard } from "../duels/DuelCard.jsx";
import { ANTES, duelRecord, duelResult, duelView, duelsOpen, signedChips } from "../duels/duelView.js";
import { PlayerPass } from "./PlayerPass.jsx";
import { serverNow } from "../tv/serverClock.js";
import "./player-sheet.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const signed = n => `${n > 0 ? "+" : ""}${fmt(n)}`;
const OUTCOME = { won:"Won", lost:"Lost", push:"Push", void:"Void" };

/* Public identity has the same destination wherever a player is selected.
   Ratings and travel answers belong to the editor and commissioner views. */
export function PlayerSheet({ state, me, p, standings, events = [], onClose, onBack, onEdit, onDuel, onSent,
  onPlay, onAccept, onDecline, onWithdraw }) {
  const [ante, setAnte] = useState(PT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const now = serverNow();
  const row = standings.find(item => item.player === p);
  const duels = state.duels || [];
  const settled = duels.map(d => resolveDuel(d)).filter(result => result.settled && !result.push);
  const duelWins = settled.filter(result => result.winner === p).length;
  const duelLosses = settled.filter(result => result.loser === p).length;
  const wins = events.filter(event => state.results[event.id]?.slots?.[0]?.includes(p));
  const own = !!me && me === p;
  /* nobody away from the venue sends or receives a challenge */
  const away = !!(state.away?.[p] || (me && state.away?.[me]));
  const canDuel = !!(onDuel && me && duelsOpen(state));

  /* the card of someone you share a duel with carries that duel's controls;
     your own card carries your open challenge */
  const current = !me ? null : own
    ? duels.find(d => d.open && d.from === me && duelPhase(d, now) === "offered") || null
    : duelBetween(state, me, p, now)
      || duels.find(d => d.from === p && d.open && duelView(state, d, me, now).takeable) || null;
  const record = me && !own ? duelRecord(state, me, p) : null;
  const history = own ? duels.map(d => duelResult(state, d, me)).filter(Boolean)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0)) : record?.lines || [];
  const last = !own ? history[0] : null;

  // Mirror sendDuel: wagers and reserved duel antes both hold the balance back.
  const room = player => duelRoom(state, player, { events, rows:standings, now }).room;
  const anteMax = canDuel && !away && !current ? Math.min(room(me), own ? Infinity : room(p)) : 0;
  const dailyLimit = !!me && duelsSentToday(state, me, now) >= DUEL_DAILY_LIMIT;
  const unavailable = dailyLimit ? "Daily limit of 3 challenges reached."
    : anteMax < PT ? "Not enough chips for an ante." : "";
  const rematch = !!last && last.outcome !== "void" && ante === last.stake;

  useEffect(() => {
    setAnte(currentAnte => currentAnte <= anteMax ? currentAnte : ANTES.filter(value => value <= anteMax).at(-1) || PT);
  }, [anteMax]);
  useEffect(() => {
    setAnte(last && last.stake <= anteMax ? last.stake : PT);
    setError("");
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const challenge = async () => {
    if (sending.current || !canDuel || away || current || unavailable || ante > anteMax) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const result = own ? await onDuel(ante, true) : await onDuel(ante);
      if (result?.ok) (onSent ? onSent(result) : onClose());
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

      {own && onEdit && <ActionButton type="button" variant="secondary" onClick={onEdit}
        style={{ width:"100%" }}>Edit your profile</ActionButton>}

      {canDuel && (current || !away) && <section className="fd-player-duel" aria-label="Quick Draw challenge">
        <details className="fd-player-duel-rules"><summary><h2>Quick Draw</h2><span>How to play +</span></summary>
          <p>Once accepted, each of you plays on your own phone. Tap when the screen flashes. Fastest tap
            wins both antes. Tapping early is a foul. An unanswered challenge lapses
            after {DUEL_LAPSE_MS / 60000} minutes.</p>
        </details>
        {current ? <DuelCard bare state={state} duel={current} me={me} now={now}
          onPlay={onPlay} onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} />
          : unavailable ? <p className="fd-player-unavailable" role="status">{unavailable}</p> : <>
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
              {pending ? "Sending…" : own ? `Challenge anyone for ${fmt(ante)}`
                : rematch ? `Rematch for ${fmt(ante)}` : `Challenge ${disp(state, p)} for ${fmt(ante)}`}
            </ActionButton>
          </>}
      </section>}

      {!!me && history.length > 0 && <section className="fd-player-duel-results" aria-label="Quick Draw results">
        <h2>{own ? "Your duels" : `You vs ${disp(state, p)}`}</h2>
        {record && <p className="fd-player-duel-score">
          <strong>{record.won}-{record.lost}</strong><span>{signedChips(record.net)}</span></p>}
        <ul>{history.map(line => <li key={line.id} className={`is-${line.outcome}`}>
          <span>{own ? `vs ${line.name}` : `${fmt(line.stake)} each`}{line.times && <small>{line.times}</small>}</span>
          <strong>{OUTCOME[line.outcome]}{line.delta !== 0 && ` ${signedChips(line.delta)}`}</strong>
        </li>)}</ul>
      </section>}
    </div>
  </Sheet>;
}
