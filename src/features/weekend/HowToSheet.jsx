import React from "react";
import { GAMES } from "../../../shared/core.js";
import { Sheet } from "../../ui/controls.jsx";
import { GameSteps, hasGameSteps } from "../rules/GameSteps.jsx";
import "./weekend.css";

/* How to play, drawn (GameSteps): the game's steps as pictures with a few
   words, its notes under them, for the event's own format (1v1 and 5v5
   basketball are two events, each its own set; no format switch). An added
   event with no drawn game falls back to its own description. */
export function HowToSheet({ gameId, variant, ev, onClose }) {
  const game = GAMES[gameId];
  const title = ev?.name || game?.name;
  if (!hasGameSteps(gameId, variant)) return ev?.desc ? <Sheet title={ev.name} onClose={onClose} show>
    <article className="fd-weekend-howto"><p className="fd-weekend-howto-objective">{ev.desc}</p></article>
  </Sheet> : null;
  return <Sheet title={title} onClose={onClose} show>
    <article className="fd-weekend-howto"><GameSteps game={gameId} variant={variant} size="sheet" /></article>
  </Sheet>;
}
