import React, { useState } from "react";
import { ROSTER, cleanLeg, disp, legTime } from "../../../shared/core.js";
import { Sheet } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { HouseArt } from "../travel/Travel.jsx";
import { GameSteps, hasGameSteps } from "../rules/GameSteps.jsx";
import { RULE_SET_ORDER } from "../rules/gameSteps.js";
import { RULES_TITLES } from "../rules/rulesWords.js";
import { payoutRows, programAwards } from "./programModel.js";

/* The program's back page opens these: the house and the flights board,
   the weekend's rules, each game, the payouts and the awards. Every one is
   drawn first: pictures, chips, ladders and passes, the fewest words. */

/* Brandon books the house and flies in first; his legs are public (times
   only), everyone else's flights are private to them and the commissioner */
const HOST = ROSTER.includes("Brandon") ? "Brandon" : null;

export function HouseSheet({ state, me, onProfile, onClose }) {
  const lg = state?.logistics || {};
  const profile = (me && state?.profiles?.[me]) || {};
  const mapUrl = lg.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lg.venue)}` : null;
  const hostIn = cleanLeg(lg.hostIn), hostOut = cleanLeg(lg.hostOut);
  const mineIn = cleanLeg(profile.flightIn), mineOut = cleanLeg(profile.flightOut);
  const showHost = HOST && HOST !== me;
  return <Sheet title="The house" onClose={onClose} className="fd-program-sheet">
    <div className="fd-house">
      <div className="fd-house-photo"><HouseArt /></div>
      {lg.venue && <div className="fd-house-address">
        <p>{lg.venue}</p>
        {mapUrl && <a className="fd-house-map" href={mapUrl} target="_blank" rel="noreferrer"><Icon name="pin" size={20} />Maps</a>}
      </div>}
      {lg.venueNote && <p className="fd-house-note">{lg.venueNote}</p>}
      {(lg.checkIn || lg.checkOut) && <dl className="fd-house-times">
        <div><dt>Check in</dt><dd>{lg.checkIn || "TBD"}</dd></div>
        <div><dt>Checkout</dt><dd>{lg.checkOut || "TBD"}</dd></div>
      </dl>}
    </div>
    <section className="fd-house-flights" aria-label="Flights">
      {lg.airport && <div className="fd-house-airport"><Icon name="plane" size={22} lit /><b>{lg.airport}</b><span>{lg.airportName}</span></div>}
      {[["in", [showHost && hostIn && { p:HOST, leg:hostIn, codeless:true }, me && (mineIn || (HOST === me && hostIn))
          && { p:me, leg:mineIn || hostIn }]],
        ["out", [showHost && hostOut && { p:HOST, leg:hostOut, codeless:true }, me && (mineOut || (HOST === me && hostOut))
          && { p:me, leg:mineOut || hostOut }]]].map(([dir, rows]) => {
        const legs = rows.filter(Boolean);
        if (!legs.length) return null;
        return <section key={dir} className="fd-house-legs" aria-label={dir === "in" ? "Arrivals, Friday" : "Departures, Sunday"}>
          <h3 className="fd-house-legs-head" aria-hidden="true">
            <Icon name="plane" size={18} className={`fd-house-legs-plane is-${dir}`} />{dir === "in" ? "Fri" : "Sun"}</h3>
          <ol className="fd-house-board">{legs.map(row => <FlightRow key={row.p} state={state} me={me} dir={dir} {...row} />)}</ol>
        </section>;
      })}
      {me && onProfile && <button type="button" className="fd-program-link" onClick={onProfile}>
        {mineIn || mineOut ? "Edit your flights" : "Add your flights"}
        <Icon name="next" size={18} /></button>}
    </section>
  </Sheet>;
}

/* one leg of the flights board: the photo chip, the name, the time; the
   airline code only on your own legs (the host's codes never leave him) */
function FlightRow({ state, me, p, leg, dir, codeless = false }) {
  const clean = cleanLeg(leg);
  if (!clean) return null;
  const mine = p === me;
  const t = clean.time ? legTime(clean.time) : null;
  return <li className={`fd-house-leg${mine ? " is-you" : ""}`}>
    <ChipFace p={p} size={32} flat />
    <span className="fd-house-leg-who">
      <b>{mine ? "You" : disp(state, p)}</b>
      {mine && !codeless && (clean.air || clean.num) && <small>{[clean.air, clean.num].filter(Boolean).join(" ")}</small>}
      {clean.note && <small>{clean.note}</small>}
    </span>
    {t && <span className="fd-house-leg-time" aria-label={`${dir === "in" ? "Lands" : "Leaves"} ${t}`}>{t}</span>}
  </li>;
}

export function RulesSheet({ onClose }) {
  return <Sheet title="Rules" onClose={onClose} className="fd-program-sheet">
    {RULE_SET_ORDER.map(id => <section key={id} className="fd-program-rule" aria-labelledby={`fd-rule-${id}`}>
      <h3 id={`fd-rule-${id}`} className="fd-program-sub">{RULES_TITLES[id]}</h3>
      <GameSteps game={id} size="sheet" />
    </section>)}
  </Sheet>;
}

/* every game on the slate, then one game at a time in the same sheet */
export function GamesSheet({ events, GameMark, onClose, initial = null }) {
  const games = events.filter(ev => hasGameSteps(ev) || ev.desc);
  const [open, setOpen] = useState(initial);
  const ev = open ? games.find(item => item.id === open) : null;
  if (ev) return <Sheet title={ev.name} show onClose={onClose} onBack={() => setOpen(null)}
    className="fd-program-sheet">
    {hasGameSteps(ev) ? <GameSteps game={ev} size="sheet" /> : <p className="fd-program-desc">{ev.desc}</p>}
  </Sheet>;
  return <Sheet title="Games" onClose={onClose} className="fd-program-sheet">
    <ul className="fd-program-games">{games.map(item => <li key={item.id}>
      <button type="button" onClick={() => setOpen(item.id)}>
        {GameMark && <GameMark id={item.game} variant={item.variant} size={40} />}
        <strong className="fd-show"><EventName name={item.name} /></strong>
        <Icon name="next" size={20} />
      </button>
    </li>)}</ul>
  </Sheet>;
}

export function PayoutsSheet({ events, GameMark, onClose }) {
  const rows = payoutRows(events);
  return <Sheet title="Payouts" onClose={onClose} className="fd-program-sheet">
    <ol className="fd-program-payouts">{rows.map(row => <li key={row.id}>
      <div className="fd-program-payout-head">
        <h3>{row.own ? <EventName name={row.events[0].name} /> : row.session}</h3>
        <span className="fd-program-payout-marks" aria-label={row.events.map(ev => ev.name).join(", ")}>
          {GameMark && row.events.map(ev => <GameMark key={ev.id} id={ev.game} variant={ev.variant} size={28} />)}</span>
      </div>
      <PayoutLadder pays={row.pays} size="phone" />
    </li>)}</ol>
    <GameSteps game="payouts" size="sheet" />
  </Sheet>;
}

export function AwardsSheet({ state, onPlayer, onClose }) {
  const awards = programAwards(state);
  return <Sheet title="Awards" onClose={onClose} className="fd-program-sheet">
    <ul className="fd-program-awards">{awards.map(award => <li key={award.id}>
      <strong>{award.title}</strong>
      {award.winners.length > 0 && <span className="fd-program-award-winners">{award.winners.map(p =>
        <button key={p} type="button" onClick={() => onPlayer?.(p)} disabled={!onPlayer} aria-label={`${disp(state, p)}'s player card`}>
          <ChipFace p={p} size={30} flat /><span aria-hidden="true">{disp(state, p)}</span></button>)}</span>}
    </li>)}</ul>
  </Sheet>;
}

export const hasAwards = state => programAwards(state).length > 0;
