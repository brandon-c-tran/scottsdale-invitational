import React from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { HOUSE_CHIP } from "../wagers/BetStacks.jsx";
import { RACK_DENOMS } from "../wagers/Wagers.jsx";
import { Coin } from "../../ui/Coin.jsx";
import { ActionButton } from "../../ui/controls.jsx";
import { tapTick } from "../../lib/haptics.js";
import "./duel-card.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const COIN = 44;

/* a denomination past what you can put up: an unlit lamp of dark glass,
   its value still legible (the Bets rack's unlit chip) */
function UnlitCoin({ value }) {
  return <svg className="fd-duel-unlit" viewBox="0 0 46 46" width={COIN} height={COIN} aria-hidden="true" focusable="false">
    <circle cx="23" cy="23" r="21.5" className="fd-duel-unlit-body" />
    {Array.from({ length:8 }, (_, i) => <rect key={i} x="21" y="2.5" width="4" height="7" rx="1"
      className="fd-duel-unlit-tick" transform={`rotate(${i * 45} 23 23)`} />)}
    <circle cx="23" cy="23" r="12.5" className="fd-duel-unlit-face" />
    <text x="23" y="23" className="fd-duel-unlit-value" textAnchor="middle" dominantBaseline="central">{value}</text>
  </svg>;
}

/* The challenge from a player card: you and them face to face, the Bets
   rack's chips as the ante (each denomination a house coin; past your cap
   or theirs it is unlit), the cap said once when it binds, then Send. */
export function DuelSend({ me, p, own, name, ante, anteMax, onAnte, pending, error, rematch, onSend }) {
  const capBinds = anteMax < RACK_DENOMS[RACK_DENOMS.length - 1];
  return <div className="fd-duel-send fd-glass-field fd-field-chip">
    <div className="fd-duel-send-face" aria-hidden="true">
      <ChipFace p={me} size={48} flat />
      <span className="fd-show fd-duel-send-vs">vs</span>
      {own ? <ChipFace size={48} empty /> : <ChipFace p={p} size={48} flat />}
    </div>
    <div className="fd-duel-rack" role="group" aria-label="Ante, each">
      {RACK_DENOMS.map(value => {
        const off = value > anteMax || pending;
        return <button type="button" key={value} disabled={off} aria-pressed={ante === value}
          aria-label={`Ante ${fmt(value)} chips each`} className={ante === value && !off ? "is-selected" : ""}
          onClick={() => { tapTick(); onAnte(value); }}>
          <Coin color={HOUSE_CHIP.color} unlit={value > anteMax}>
            {value > anteMax ? <UnlitCoin value={value} />
              : <ChipFace size={COIN} stamp={value} valueRing color={HOUSE_CHIP.color} isLight={HOUSE_CHIP.isLight} skin={HOUSE_CHIP.skin} />}
          </Coin>
        </button>;
      })}
    </div>
    {capBinds && <span className="fd-duel-max">Max {fmt(anteMax)}</span>}
    {error && <p className="fd-duel-error" role="alert">{error}</p>}
    <ActionButton type="button" data-duel-send="" onClick={onSend} disabled={pending || ante > anteMax} pending={pending}
      aria-label={rematch ? undefined : own ? `Challenge anyone for ${fmt(ante)}` : `Challenge ${name} for ${fmt(ante)}`}
      style={{ width:"100%" }}>
      {pending ? "Sending…" : rematch ? `Rematch for ${fmt(ante)}` : `Send ${fmt(ante)}`}
    </ActionButton>
  </div>;
}
