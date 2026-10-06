import React, { useEffect, useMemo, useRef, useState } from "react";
import { PT, DUEL_DAILY_LIMIT, disp, duelBetween, duelPhase, duelRoom, duelsSentToday, resolveDuel } from "../../../shared/core.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { DuelCard } from "../duels/DuelCard.jsx";
import { DuelSend } from "../duels/DuelSend.jsx";
import { ANTES, duelRecord, duelResult, duelView, duelsOpen, signedChips } from "../duels/duelView.js";
import { PlayerPass } from "./PlayerPass.jsx";
import { headToHead } from "./seasonStats.js";
import { useReducedMotion } from "../../ui/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import "./player-sheet.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const signed = n => `${n > 0 ? "+" : ""}${fmt(n)}`;
const OUTCOME = { won:"Won", lost:"Lost", push:"Push", void:"Void" };

/* Rematch sits with your record against a player: you have met, and a duel
   could be sent between you right now (live, neither away, not frozen, no
   poker table, and no duel already open between you). */
export function rematchAvailable(state, me, p, { events = [], now = serverNow() } = {}) {
  if (!me || !p || me === p || !duelsOpen(state)) return false;
  if (state.away?.[me] || state.away?.[p] || duelBetween(state, me, p, now)) return false;
  return headToHead(state, me, p, events.length ? events : undefined).count > 0;
}

/* Public identity has the same destination wherever a player is selected.
   Ratings and travel answers belong to the editor and commissioner views. */
export function PlayerSheet({ state, me, p, standings, events = [], onClose, onBack, onEdit, onDuel, onSent,
  onPlay, onAccept, onDecline, onWithdraw, openDuel = false }) {
  const [ante, setAnte] = useState(PT);
  /* "Duel" opens the stake picker in place, under the card */
  const [picking, setPicking] = useState(!!openDuel);
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
  /* the turned card shows your record against this player; Rematch opens
     the challenge below with the last ante, and only while one can be sent */
  const [turned, setTurned] = useState(false);
  const duelRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const canRematch = useMemo(() => !!onDuel && rematchAvailable(state, me, p, { events, now }),
    [state, me, p, events, onDuel]); // eslint-disable-line react-hooks/exhaustive-deps
  const openRematch = () => {
    if (last && last.outcome !== "void" && last.stake <= anteMax) setAnte(last.stake);
    setPicking(true);
    const section = duelRef.current;
    section?.scrollIntoView?.({ block:"center", behavior:reducedMotion ? "auto" : "smooth" });
    section?.querySelector?.("[data-duel-send]")?.focus?.({ preventScroll:true });
  };

  useEffect(() => {
    setAnte(currentAnte => currentAnte <= anteMax ? currentAnte : ANTES.filter(value => value <= anteMax).at(-1) || PT);
  }, [anteMax]);
  useEffect(() => {
    setAnte(last && last.stake <= anteMax ? last.stake : PT);
    setError("");
    setPicking(!!openDuel);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const challenge = async () => {
    if (sending.current || !canDuel || away || current || unavailable || ante > anteMax) return;
    tapTick();
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

  return <Sheet title={disp(state, p)} onClose={onClose} onBack={onBack} busy={pending} show>
    <div className="fd-player-sheet">
      <PlayerPass key={p} state={state} p={p} compact viewer={me || null} own={!!me && me === p} events={events.length ? events : undefined}
        standings={standings} onFlip={setTurned} />
      {turned && canRematch && <ActionButton type="button" className="fd-player-rematch"
        onClick={openRematch}>Rematch</ActionButton>}

      {/* the card carries rank, chips, bets, duels and every placement: nothing repeats under it */}
      {own && onEdit && <ActionButton type="button" variant="secondary" onClick={onEdit}
        style={{ width:"100%" }}>Edit your profile</ActionButton>}

      {/* Quick Draw: a duel you share sits here with its controls; else
          "Duel" opens the Bets rack as the ante, then Send */}
      {canDuel && (current || !away) && <section ref={duelRef} className="fd-player-duel" aria-label="Quick Draw challenge">
        {current ? <DuelCard bare state={state} duel={current} me={me} now={now}
          onPlay={onPlay} onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw} />
          : unavailable ? <p className="fd-player-unavailable" role="status">{unavailable}</p>
            : picking ? <DuelSend me={me} p={p} own={own} name={disp(state, p)} ante={ante} anteMax={anteMax}
              onAnte={setAnte} pending={pending} error={error} rematch={rematch} onSend={challenge} />
              : <ActionButton type="button" variant="secondary" onClick={() => setPicking(true)} style={{ width:"100%" }}>
                {own ? "Duel anyone" : `Duel ${disp(state, p)}`}</ActionButton>}
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
