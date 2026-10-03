import React from "react";
import { MVP_PTS, allEventsOf, disp, mvpStands, overflowRoleMeta, presentPlayers, resolveEventLifecycle,
  resolveWager, resultAwards, teamLabel } from "../../../shared/core.js";
import { Avatar, AvatarStack } from "../identity/PlayerIdentity.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import "./event-sheet.css";

/* The event sheet changes with the event: before it starts it shows who is
   playing, how to play and what it pays; live, your match, the bracket or
   heats, betting and what is riding; after, the result, who won what and
   your chips from it. These are the guest parts; the commissioner's
   controls sit apart at the bottom of the sheet (App.jsx EventSheet). */
const BEFORE = new Set(["scheduled", "setup", "draw-pending", "draw-revealed"]);
export function eventStage(state, ev) {
  if (state.results?.[ev.id]) return "after";
  if (state.shelved?.[ev.id] || BEFORE.has(resolveEventLifecycle(state, ev).phase)) return "before";
  return "live";
}

const fmt = n => (Number(n) || 0).toLocaleString("en-US");
const signed = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;

/* a person: their photo chip and name, one target for their card */
function Person({ state, p, me, size = 30, onPlayer }) {
  return <button type="button" className={`fd-es-person${p === me ? " is-you" : ""}`} disabled={!onPlayer}
    onClick={() => onPlayer?.(p)} aria-label={`View ${disp(state, p)}'s player card`}>
    <Avatar state={state} p={p} size={size} /><span>{disp(state, p)}</span>
  </button>;
}

/* Who is playing. Teams are windows in one pane, each named once, its
   people as photo chips with names; yours is marked as yours. */
export function EventTeams({ state, ev, draw, me, onPlayer }) {
  if (!draw?.teams?.length) return null;
  const two = draw.teams.length === 2;
  return <section className={`fd-es-pane fd-es-teams${two ? " is-versus" : ""}`} aria-label="Teams">
    {draw.teams.map((team, i) => {
      const mine = !!me && team.players.includes(me);
      return <React.Fragment key={i}>
        {two && i === 1 && <span className="fd-es-vs" aria-hidden="true">vs</span>}
        <div className={`fd-es-team${mine ? " is-you" : ""}`}>
          {team.players.length > 1 && <h3 className="fd-show">{teamLabel(state, team)}</h3>}
          <div className="fd-es-people">{team.players.map(p => <Person key={p} state={state} p={p} me={me} onPlayer={onPlayer} />)}</div>
        </div>
      </React.Fragment>;
    })}
  </section>;
}

/* An everyone-plays field (no draw): everyone present, as photo chips. */
export function EventField({ state, ev, me, onPlayer }) {
  const roles = new Set((state.draws?.[ev.id]?.roles || []).map(item => item.player));
  const field = presentPlayers(state).filter(p => !roles.has(p));
  if (!field.length) return null;
  return <section className="fd-es-pane fd-es-field" aria-label="Playing">
    <div className="fd-es-people">{field.map(p => <Person key={p} state={state} p={p} me={me} onPlayer={onPlayer} />)}</div>
  </section>;
}

/* the crew: their chips and roles; they take the 3rd-place award */
export function EventCrew({ state, roles, me, onPlayer }) {
  const crew = (roles || []).filter(item => item?.player);
  if (!crew.length) return null;
  return <section className="fd-es-crew" aria-label="Crew">
    <span className="fd-es-crew-medal" aria-hidden="true" />
    <div className="fd-es-people">{crew.map(({ player, role }) => <span key={player} className="fd-es-crew-person">
      <Person state={state} p={player} me={me} size={26} onPlayer={onPlayer} /><small>{overflowRoleMeta(role).short}</small>
    </span>)}</div>
  </section>;
}

/* What is riding on the event right now: the chips in play and who put them there. */
export function EventRiding({ state, ev }) {
  const events = allEventsOf(state);
  const open = (state.wagers || []).filter(w => w.eventId === ev.id && resolveWager(state, w, events).status === "pending");
  const total = open.reduce((sum, w) => sum + (w.stake || 0), 0);
  if (!total) return null;
  const bettors = [...new Set(open.map(w => w.player))];
  return <section className="fd-es-riding" aria-label={`${fmt(total)} in play`}>
    <i className="fd-es-chip" aria-hidden="true" />
    <b>{fmt(total)}</b>
    <span className="fd-es-riding-label">In play</span>
    <AvatarStack state={state} players={bettors} size={24} max={6} />
  </section>;
}

/* your chips from a posted event: your place or crew award, your team MVP,
   and what your bets on it did */
export function yourTake(state, ev, me) {
  if (!me) return null;
  const res = state.results?.[ev.id];
  if (!res) return null;
  const events = allEventsOf(state);
  const award = res.stacks ? 0 : resultAwards(state, ev, res).filter(item => item.player === me).reduce((sum, item) => sum + item.pts, 0);
  const mvp = state.mvp?.[ev.id]?.closedAt && state.mvp[ev.id].winner === me && mvpStands(state, ev.id) ? MVP_PTS : 0;
  const bets = (state.wagers || []).filter(w => w.player === me && w.eventId === ev.id)
    .map(w => resolveWager(state, w, events)).filter(r => r.status === "won" || r.status === "lost")
    .reduce((sum, r) => sum + (r.delta || 0), 0);
  const had = award || mvp || (state.wagers || []).some(w => w.player === me && w.eventId === ev.id);
  return had ? { total:award + mvp + bets, award, mvp, bets } : null;
}

const PLACES = ["1st", "2nd", "3rd"];
/* The posted result: a medallion per paid place with its people and what
   each took (the finale: each seat's counted stack), crew last, then your
   chips from it and, if it was corrected, the reason. */
export function EventResult({ state, ev, me, onPlayer }) {
  const res = state.results?.[ev.id];
  if (!res?.slots) return null;
  const awards = resultAwards(state, ev, res);
  const crew = awards.filter(award => award.place === "crew");
  const take = yourTake(state, ev, me);
  const correction = (state.eventOps?.[ev.id]?.corrections || []).at(-1);
  const reason = (res.correctedAt || correction) ? res.correctionReason || correction?.reason : null;
  const rows = res.slots.map((players, i) => ({ i, players:players || [] })).filter(row => row.players.length);
  /* a posted place reads off the podium: its winners on their step; the
     finale's counted stacks keep their list */
  const draw = state.draws?.[ev.id];
  const labelOf = players => {
    const teams = (draw?.teams || []).filter(team => team.players.some(p => players.includes(p)));
    return teams.length ? teams.map(team => teamLabel(state, team)).join(", ") : null;
  };
  const podium = !res.stacks && <div className="fd-es-pane fd-es-podium-pane">
    <PayoutLadder ev={ev} size="phone" state={state} me={me} onPlayer={onPlayer} crew={crew.length ? crew[0].pts : null}
      winners={Object.assign(res.slots.map(players => players || []), { crew:crew.map(award => award.player) })}
      labels={Object.assign(res.slots.map(players => labelOf(players || [])), { crew:null })} />
  </div>;
  return <section className="fd-es-result" aria-label="Result">
    {podium}
    {res.stacks && <ol className="fd-es-pane fd-es-podium">
      {rows.map(({ i, players }) => {
        const pts = res.stacks ? null : awards.find(award => award.place === i)?.pts ?? 0;
        return <li key={i} className={`fd-es-place${i === 0 ? " is-first" : ""}`}>
          <span className="fd-es-medal" aria-label={PLACES[i] || `${i + 1}th`}>{i + 1}</span>
          <div className="fd-es-people">{players.map(p => <Person key={p} state={state} p={p} me={me} size={i === 0 ? 36 : 30} onPlayer={onPlayer} />)}</div>
          {res.stacks ? <b className="fd-es-amount">{fmt(res.stacks[players[0]] ?? 0)}</b>
            : pts > 0 && <b className="fd-es-amount">+{fmt(pts)}</b>}
        </li>;
      })}
      {crew.length > 0 && <li className="fd-es-place is-crew">
        <span className="fd-es-medal is-crew" aria-label="Crew" />
        <div className="fd-es-people">{crew.map(({ player }) => <Person key={player} state={state} p={player} me={me} size={26} onPlayer={onPlayer} />)}</div>
        <b className="fd-es-amount">+{fmt(crew[0].pts)}</b>
      </li>}
    </ol>}
    {take && <div className={`fd-es-take${take.total > 0 ? " is-won" : take.total < 0 ? " is-lost" : ""}`}
      aria-label={`Your chips from ${ev.name}: ${signed(take.total)}`}>
      <Avatar state={state} p={me} size={28} /><span>You</span>
      <b>{signed(take.total)}</b>
    </div>}
    {reason && <p className="fd-es-corrected">Corrected: {reason}</p>}
  </section>;
}

/* what an event pays, drawn (the PayoutLadder), crew as a hollow fourth */
export function EventPays({ ev, crew = null }) {
  return <section className="fd-es-pays" aria-label="Pays"><PayoutLadder ev={ev} size="phone" crew={crew} /></section>;
}
