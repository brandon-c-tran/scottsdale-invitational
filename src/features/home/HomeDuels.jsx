import React from "react";
import { DuelCard } from "../duels/DuelCard.jsx";
import { duelsForPlayer, duelsOpen } from "../duels/duelView.js";
import { useDuelClock } from "../duels/useDuelClock.js";

/* Your offered and live duels, plus open challenges you could take. */
export function HomeDuels({ state, me, gm, onPlay, onAccept, onDecline, onWithdraw, onVoid, onPlayer }) {
  const now = useDuelClock(state);
  if (!me || !duelsOpen(state)) return null;
  const mine = duelsForPlayer(state, me, now);
  if (!mine.length) return null;
  return <section aria-label="Your duels" style={{ margin:"12px 0", minWidth:0 }}>
    {mine.map(duel => <DuelCard key={`${me}:${duel.id}`} state={state} duel={duel} me={me} gm={gm} now={now}
      onPlay={onPlay} onAccept={onAccept} onDecline={onDecline} onWithdraw={onWithdraw}
      onVoid={onVoid} onPlayer={onPlayer} />)}
  </section>;
}
