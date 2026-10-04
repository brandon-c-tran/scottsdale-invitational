import React from "react";
import { awardTable } from "../../shared/core.js";
import { ChipStack } from "../features/wagers/BetStacks.jsx";
import { Avatar } from "../features/identity/PlayerIdentity.jsx";
import "./payout-ladder.css";

/* What an event pays, drawn rather than written: a podium. Each paid place
   is one unit standing on one floor: a real chip stack (one chip per 100,
   scaled so the tallest keeps to `maxChips`) whose top chip is stamped with
   the place, on a glass step whose height steps down by place, the amount
   lettered on the step. 2nd stands left of 1st and 3rd right of it, the way
   a podium stands; crew, where a draw has one, is a low dashed step at the
   end. The podium spreads across its container's width (equal columns, up
   to a comfortable step width), never a small cluster in a wide sheet.
   Filled: pass `winners` (players per place, index 0 = 1st) and `state`, and
   each step carries its winners' photo chips (their names under one or two;
   a team its label) in front of it, so the posted result reads off the
   podium. awardTable(ev) is the source; `pays` overrides it.
   Sizes: "tv" (the intro, the next-up card, the live board), "phone"
   (sheets, the announcement, Weekend), "ticker" (one line on the TV),
   "tiny" (a row: 1st's chip and its amount only). */
const fmt = n => (Number(n) || 0).toLocaleString("en-US");
const SIZES = {
  tv:{ chip:76, maxChips:9, step:132, avatar:56, podium:true },
  phone:{ chip:42, maxChips:8, step:72, avatar:36, podium:true },
  ticker:{ medal:48, podium:false },
  tiny:{ medal:24, podium:false },
};
const PLACE_LABEL = ["1st", "2nd", "3rd"];
/* the step's share of the full height, by place; crew stands lowest */
const STEP_RISE = { 1:1, 2:.78, 3:.6, crew:.52 };
const PLACE_CHIP = {
  1:{ color:"var(--sun)", isLight:true, skin:"plain" },
  2:{ color:"var(--silver)", isLight:true, skin:"plain" },
  3:{ color:"var(--bronze)", isLight:true, skin:"plain" },
  crew:{ color:"var(--muted)", isLight:false, skin:"plain" },
};

export function payoutSteps(pays, { crew = null } = {}) {
  const table = Array.isArray(pays) ? pays : [0, 0, 0];
  const places = table.map((amount, i) => ({ place:i + 1, amount:Number(amount) || 0 })).filter(step => step.amount > 0);
  if (crew && Number(crew) > 0) places.push({ place:null, amount:Number(crew), crew:true });
  return places;
}
/* one chip per 100, scaled so the tallest stack keeps to `max` chips */
export function ladderChips(amount, top, max) {
  if (!max) return 0;
  const unit = Math.max(100, Math.ceil(top / max / 100) * 100);
  return Math.max(1, Math.round(amount / unit));
}
/* podium order: 2nd, 1st, 3rd, then crew */
export function podiumOrder(steps) {
  const by = place => steps.find(step => step.place === place);
  const order = steps.length >= 2 && by(2) ? [by(2), by(1), ...steps.filter(step => step.place !== 1 && step.place !== 2)]
    : steps;
  return order.filter(Boolean);
}

function Winners({ state, players = [], label = null, size, me = null, onPlayer = null }) {
  if (!state || !players.length) return null;
  const named = players.length <= 2;
  const name = p => state.profiles?.[p]?.display || p;
  return <span className="fd-ladder-winners">
    <span className="fd-ladder-faces">{players.map(p => onPlayer
      ? <button key={p} type="button" className={`fd-ladder-face${p === me ? " is-you" : ""}`} onClick={() => onPlayer(p)}
        aria-label={`View ${name(p)}'s player card`}><Avatar state={state} p={p} size={size} /></button>
      : <Avatar key={p} state={state} p={p} size={size} />)}</span>
    <span className="fd-ladder-who">{named ? players.map(name).join(" & ") : label || `${players.length} players`}</span>
  </span>;
}

export function PayoutLadder({ ev = null, pays = null, size = "phone", crew = null, className = "", state = null,
  winners = null, labels = null, me = null, onPlayer = null }) {
  const table = pays || awardTable(ev);
  const steps = payoutSteps(table, { crew });
  if (!steps.length) return null;
  const s = SIZES[size] || SIZES.phone;
  const label = steps.map(step => `${step.crew ? "Crew" : PLACE_LABEL[step.place - 1]} ${fmt(step.amount)}`).join(", ");
  if (!s.podium) {
    const shown = size === "tiny" ? steps.slice(0, 1) : steps;
    return <ol className={`fd-ladder is-${size}${className ? ` ${className}` : ""}`} aria-label={label}>
      {shown.map(step => <li key={step.crew ? "crew" : step.place}
        className={`fd-ladder-step is-place-${step.crew ? "crew" : step.place}`}>
        <span className="fd-ladder-medal" style={{ width:s.medal, height:s.medal, fontSize:Math.round(s.medal * .5) }}
          aria-hidden="true">{step.crew ? "" : step.place}</span>
        <b className="fd-ladder-amount" aria-hidden="true">{fmt(step.amount)}</b>
      </li>)}
    </ol>;
  }
  const top = Math.max(...steps.map(step => step.amount));
  const order = podiumOrder(steps);
  const filled = !!winners && !!state;
  return <ol className={`fd-ladder is-podium is-${size}${filled ? " is-filled" : ""}${className ? ` ${className}` : ""}`}
    aria-label={label} style={{ "--ladder-cols":order.length, "--ladder-step":`${s.step}px` }}>
    {order.map(step => {
      const key = step.crew ? "crew" : step.place;
      const chips = ladderChips(step.amount, top, s.maxChips);
      const who = filled ? step.crew ? winners.crew || [] : winners[step.place - 1] || [] : [];
      return <li key={key} className={`fd-ladder-step is-place-${key}`} style={{ "--rise":STEP_RISE[key] }}>
        <span className="fd-ladder-stand" aria-hidden="true">
          <ChipStack chip={{ ...PLACE_CHIP[key], stamp:step.crew ? "" : String(step.place) }} count={chips} size={s.chip}
            cap={s.maxChips} tag={false} />
          <span className="fd-ladder-plinth"><b className="fd-ladder-amount">{fmt(step.amount)}</b></span>
        </span>
        {filled && <Winners state={state} players={who} label={labels?.[step.crew ? "crew" : step.place - 1]} size={s.avatar}
          me={me} onPlayer={onPlayer} />}
      </li>;
    })}
  </ol>;
}
