import React, { useRef, useState } from "react";
import { DuelCard } from "../duels/DuelCard.jsx";
import { duelView, duelsForPlayer, duelsOpen } from "../duels/duelView.js";
import { useDuelClock } from "../duels/useDuelClock.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");

/* Your own offer waiting on someone else needs nothing from you, so it is
   one line with its Withdraw beside it. */
function WaitingOffer({ state, duel, me, now, onWithdraw }) {
  const view = duelView(state, duel, me, now);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const withdraw = async () => {
    if (busy.current || done || !onWithdraw) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onWithdraw(duel.id);
      if (result?.ok === true) setDone(true);
      else setError(result?.error || "Couldn't withdraw the duel. Try again.");
    } catch { setError("Couldn't withdraw the duel. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return <div className="fd-home-duel-waiting" aria-label={`Quick Draw with ${view.name}`} aria-busy={pending}>
    <span>{view.status.replace(/ · (\d+) min$/, "")}<small>{fmt(duel.stake)} · {view.minutesLeft} min</small></span>
    {done ? <span role="status">Withdrawn</span> : <button type="button" disabled={pending || !onWithdraw} onClick={withdraw}
      aria-label={duel.open ? "Withdraw open challenge" : `Withdraw challenge to ${view.name}`}>
      {pending ? "Withdrawing…" : "Withdraw"}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

/* Your offered and live duels, plus open challenges you could take. The
   ones waiting on you come first. */
export function HomeDuels({ state, me, gm, onPlay, onAccept, onDecline, onWithdraw, onVoid, onPlayer }) {
  const now = useDuelClock(state);
  if (!me || !duelsOpen(state)) return null;
  const mine = duelsForPlayer(state, me, now).map(duel => ({ duel, view:duelView(state, duel, me, now) }));
  if (!mine.length) return null;
  const rank = ({ view }) => view.canAccept || view.canPlay ? 0 : view.canWithdraw && !gm ? 2 : 1;
  const ordered = mine.map((item, index) => ({ ...item, index }))
    .sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  return <section aria-label="Your duels" className="fd-home-duels">
    {ordered.map(({ duel, view }) => view.canWithdraw && !gm
      ? <WaitingOffer key={`${me}:${duel.id}`} state={state} duel={duel} me={me} now={now} onWithdraw={onWithdraw} />
      : <DuelCard key={`${me}:${duel.id}`} state={state} duel={duel} me={me} gm={gm} now={now}
        onPlay={onPlay} onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw}
        onVoid={onVoid} onPlayer={onPlayer} />)}
  </section>;
}
