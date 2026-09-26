import React, { useState } from "react";
import { GAMES } from "../../../shared/core.js";
import { Sheet, Tag } from "../../ui/controls.jsx";
import "./weekend.css";

/* Instructions are a reference, so every step is readable immediately.
   The keyed content also resets a variant when another game is opened. */
export function HowToSheet({ gameId, variant, onClose }) {
  const game = GAMES[gameId];
  if (!game) return null;
  return <Sheet title={game.name} onClose={onClose}>
    <GameInstructions key={`${gameId}:${variant || ""}`} gameId={gameId} game={game} variant={variant} />
  </Sheet>;
}

function GameInstructions({ gameId, game, variant }) {
  const variants = game.variants || [];
  const [selected, setSelected] = useState(() => variants.some(item => item.id === variant) ? variant : variants[0]?.id);
  const howto = variants.length ? variants.find(item => item.id === selected)?.howto : game.howto;
  if (!howto) return null;
  return <article className="fd-weekend-howto">
    {!!variants.length && <div className="fd-weekend-howto-variants" role="group" aria-label={`${game.name} format`}>
      {variants.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id}
        onClick={() => setSelected(item.id)}>{item.label}</button>)}
    </div>}
    {howto.objective && <p className="fd-weekend-howto-objective">{howto.objective}</p>}
    <div className="fd-weekend-howto-equipment">
      {howto.players && <Tag tone="gold">{howto.players}</Tag>}
      {(howto.gear || []).map(item => <Tag key={item}>{item}</Tag>)}
    </div>
    <section className="fd-weekend-howto-steps" aria-label="How to play">
      <ol>{(howto.steps || []).map((step, index) => <li key={index}>
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{step}</p>
      </li>)}</ol>
    </section>
    {howto.win && <section className="fd-weekend-howto-win" aria-labelledby={`fd-howto-win-${gameId}`}>
      <h3 id={`fd-howto-win-${gameId}`}>To win</h3><p>{howto.win}</p>
    </section>}
    {howto.house && <aside className="fd-weekend-howto-house"><h3>House rule</h3><p>{howto.house}</p></aside>}
  </article>;
}
