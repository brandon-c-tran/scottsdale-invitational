import React, { useRef, useState } from "react";
import { SESSIONS, AWARDS, GAMES, disp, overflowRoleMeta } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { cardInk } from "../profile/PlayerPass.jsx";
import { SectionHeading } from "../../ui/layout.jsx";
import { Leaderboard } from "../standings/Standings.jsx";
import { bracketPath, deriveHomeModel } from "./homeModel.js";
import { DraftEntry } from "../draft/DraftSheet.jsx";
import "./home.css";

const fmt = value => (value ?? 0).toLocaleString("en-US");
const ord = n => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
const sessionOf = event => SESSIONS.find(session => session.id === event?.session)?.label;
const Arrow = () => <span className="fd-home-arrow" aria-hidden="true">↗</span>;

function People({ state, players, onPlayer }) {
  return <span className="fd-home-player-links">{players.map(player => <button type="button" key={player}
    onClick={() => onPlayer(player)} aria-label={`View ${disp(state, player)}'s player card`}>
    <Avatar state={state} p={player} size={30} /><span>{disp(state, player)}</span>
  </button>)}</span>;
}

function Assignment({ current, state, onPlayer }) {
  const a = current.assignment;
  if (!a || a.kind === "spectator") return null;
  if (a.kind === "pending" || a.kind === "crew") return <div className="fd-home-assignment">
    <small>{a.kind === "crew" ? "Your role" : "The draw"}</small><strong>{a.label}</strong>
    {a.role && <p>{overflowRoleMeta(a.role).detail}</p>}
  </div>;
  if (a.kind === "solo" && !a.group) return null;
  const status = { "up-now":"Your match", next:"Your next match", waiting:"Waiting for an opponent",
    out:"Eliminated", won:"Winner", through:"Through to the final", final:"Final", playing:"Your group" }[a.status];
  return <div className="fd-home-assignment">
    {a.partners.length > 0 && <div><small>{a.label}</small>
      <People state={state} players={a.partners} onPlayer={onPlayer} /></div>}
    {a.opponents.length > 0 && <div><small>{status || "Against"}{a.match?.roundName ? ` · ${a.match.roundName}` : ""}</small>
      <span className="fd-home-opponents"><span>vs</span><People state={state} players={a.opponents} onPlayer={onPlayer} /></span></div>}
    {a.group && <div><small>{a.group.name || status}</small><People state={state}
      players={a.group.players.filter(player => !a.players.includes(player))} onPlayer={onPlayer} /></div>}
    {status && (!a.opponents.length || ["out", "won", "through"].includes(a.status))
      && <p className="fd-home-assignment-status">{current.awaitingResult ? "Awaiting result" : status}</p>}
  </div>;
}

/* Added events may have no game. Their rules are the event description,
   which the event sheet already carries, so no dead Rules target renders. */
export const hasGameRules = event => {
  const game = GAMES[event?.game];
  return !!(game?.howto || game?.variants?.some(variant => variant.howto));
};

const names = (state, players) => players.map(player => disp(state, player)).join(" & ");

/* One line of personal state under the room's matchup: where you stand in
   this event even when the contest on screen is someone else's. */
export function personalLine({ current, state }) {
  const a = current?.assignment;
  if (!a) return null;
  if (a.kind === "crew") return `Your role · ${a.label}`;
  if (a.kind !== "team" && a.kind !== "solo") return null;
  const partner = a.partners?.length ? ` · with ${names(state, a.partners)}` : "";
  const round = a.match?.roundName?.replace(/s$/, "");
  if (a.status === "out") return "You’re out";
  if (a.status === "won") return `You won${partner}`;
  if (a.status === "through") return `You’re through to the final${partner}`;
  if (a.status === "final") return `You’re in the final${partner}`;
  if (a.status === "up-now") return partner ? `You’re up${partner}` : null;
  if (a.match) {
    if (a.opponents.length) return `Next: ${round} vs ${names(state, a.opponents)}${partner}`;
    if (a.match.feeder) return `Next: ${round} vs winner of ${a.match.feeder}${partner}`;
    return `Next: ${round}${partner}`;
  }
  if (a.group?.name) return `You’re in ${a.group.name}${partner}`;
  return a.partners?.length ? `With ${names(state, a.partners)}` : null;
}

function EventFocus({ model, state, me, onOpen, onRules, onBets, onBracket, onPlayer, GameMark }) {
  const current = model.current;
  if (!current) return null;
  const event = current.event;
  const before = model.mode === "before";
  const rules = hasGameRules(event);
  const betHere = model.betting?.open && model.betting.event.id === event.id;
  const bettingLabel = model.betting?.canPlace ? "Place chips" : "View bets";
  const running = ["in-progress", "result-entry"].includes(current.lifecycle.phase);
  const away = !!(me && state.away?.[me]);
  /* a bracket game reads as one line: your path, or the next match */
  const path = !before && onBracket ? bracketPath(state, event, me) : null;
  const a = current.assignment;
  const role = a?.kind === "crew" && a.role ? overflowRoleMeta(a.role).detail : null;
  /* in the contest on screen, "You're playing" already says it; a bracket
     path already says what is next */
  const mine = !before && !away && current.contest?.kind !== "ffa" && current.contest?.sides?.length > 0
    && !current.contest.players?.includes(me) && !(path?.mine && a?.match)
    ? personalLine({ current, state, model }) : null;
  return <section className={`fd-home-focus${running ? " is-running" : ""}`} aria-label={`${event.name}: ${current.status}`}>
    <div className="fd-home-focus-top"><span className="fd-home-eyebrow">{(running || current.lifecycle.phase === "betting-open")
      && <i className="fd-beat-dot" aria-hidden="true" />}{current.status}</span>
      {before ? <span>{sessionOf(event)}</span> : rules && <button type="button" className="fd-home-text-link"
        aria-label={`${event.name} rules`} onClick={() => onRules(event)}>Rules <Arrow /></button>}</div>
    <button type="button" className="fd-home-event-title" onClick={() => onOpen(event)} aria-label={`Open ${event.name}`}>
      <span><h2>{event.name}</h2>{event.value && <small>{fmt(AWARDS[event.value]?.[0] ?? event.value)} chips to win</small>}</span>
      <span className="fd-home-event-mark"><GameMark id={event.game} size={72} /></span>
    </button>
    {before && event.desc && <p className="fd-home-event-description">{event.desc}</p>}
    {!before && current.contest?.kind !== "ffa" && current.contest?.sides?.length > 0
      ? <div className="fd-home-assignment"><div className="fd-home-contest-label">{current.contest.label}
          {current.contest.players?.includes(me) && <span>You’re playing</span>}</div>
          {current.contest.sides.map((side,index) => <div className="fd-home-side" key={String(side.key)}>
            {index > 0 && current.contest.kind === "match" && <span className="fd-home-versus">vs</span>}
            <People state={state} players={side.players} onPlayer={onPlayer} /></div>)}
          {away ? <p className="fd-home-personal">You are marked away</p>
            : mine && <p className="fd-home-personal">{mine}{role && <small>{role}</small>}</p>}
        </div>
      : !before && (away ? <div className="fd-home-assignment"><p className="fd-home-personal">You are marked away</p></div>
        : <Assignment current={current} state={state} onPlayer={onPlayer} />)}
    {path && <button type="button" className="fd-home-path" onClick={() => onBracket(event)}
      aria-label={`${path.text}. Open the full ${event.name} bracket`}>
      <span>{path.text}</span><span className="fd-home-path-link">Full bracket <Arrow /></span></button>}
    <div className="fd-home-event-actions">
      {betHere && <button type="button" className="fd-home-primary" onClick={onBets}>{bettingLabel}<Arrow /></button>}
      <button type="button" className={betHere ? "fd-home-secondary" : "fd-home-primary"} onClick={() => before && rules ? onRules(event) : onOpen(event)}>
        {before ? rules ? "How to play" : "Open event" : current.awaitingResult ? "View event" : "Open event"}<Arrow /></button>
    </div>
  </section>;
}

/* Your own place under the champion, in your identity color. */
function OwnFinish({ row, me }) {
  const identity = usePlayerIdentity(me);
  return <p className="fd-home-own-finish" style={{ "--finish-color":identity.color, "--finish-ink":cardInk(identity.color) }}>
    You finished {ord(row.rank)} · {fmt(row.pts)}</p>;
}

/* Before the weekend: the one travel answer still missing, asked outright.
   Not yet saves through the same profile write and pending guard. */
function FlightsQuestion({ onYes, onNotYet }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const notYet = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onNotYet();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return <section className="fd-home-flights" aria-label="Flights" aria-busy={pending}>
    <span>Booked your flights?</span>
    <button type="button" disabled={pending} onClick={onYes}>Yes</button>
    <button type="button" disabled={pending} onClick={notYet}>{pending ? "Saving…" : "Not yet"}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function GuestHome({ state, me, events, standings, onPlayer, onEvents,
  onOpen, onRules = onOpen, onBets, onBracket, onStandings, onDraft, deltas, GameMark, pokerContent, duelContent,
  since, onSince, onSinceDismiss, flightsAnswered = false, onFlightsYes, onFlightsNotYet, onLastCard }) {
  const model = deriveHomeModel({ state, me, events, standings });
  const before = model.mode === "before", finale = model.mode === "finale", complete = model.mode === "complete";
  const leaders = (standings || []).filter(row => row.rank === 1);
  const ownRow = (standings || []).find(row => row.player === me);
  const latest = events.filter(event => state.results?.[event.id]?.slots?.[0]?.length && !state.shelved?.[event.id])
    .sort((a, b) => (state.results[b.id].ts || 0) - (state.results[a.id].ts || 0))[0];
  const bettingElsewhere = model.betting?.open && model.betting.event.id !== model.current?.event.id;
  const sinceText = typeof since === "string" ? since : since?.text;
  const sinceRoute = typeof since === "string" ? { type:"settled" } : since?.route;
  const sinceDetail = (typeof since === "object" && since?.detail) || sinceText;
  const profile = me ? state.profiles?.[me] || {} : null;
  const askFlights = before && !!profile && !!onFlightsNotYet && !flightsAnswered && profile.flightsBooked !== true
    && !profile.flightIn && !profile.flightOut;

  return <div className={`fd-home is-${model.mode}`}>
    {(finale || complete) ? <div className="fd-home-heading"><h1>{complete ? "Final standings" : "The finale"}</h1></div>
      : <h1 className="fd-home-sr">Home</h1>}

    {!finale && !complete && events.filter(event => state.drafts?.[event.id] && !state.draws?.[event.id]
      && !state.shelved?.[event.id] && !state.results?.[event.id]).map(event =>
      <DraftEntry key={event.id} state={state} ev={event} me={me} onOpen={() => (onDraft || onOpen)(event)}/>)}

    {complete ? <section className="fd-home-finish" aria-label={state.frozen ? "Champion" : "Final chip counts"}>
      <span className="fd-home-eyebrow">{state.frozen ? leaders.length > 1 ? "Tied for the championship" : "Champion" : "Final chip counts"}</span>
      {leaders.map(row => <button type="button" key={row.player} onClick={() => onPlayer(row.player)}
        className="fd-home-winner" aria-label={`View ${disp(state, row.player)}'s player card`}>
        <Avatar state={state} p={row.player} size={68} /><strong>{disp(state, row.player)}</strong></button>)}
      {leaders[0] && <p><strong>{fmt(leaders[0].pts)}</strong> chips</p>}
      {ownRow && !leaders.some(row => row.player === me) && <OwnFinish row={ownRow} me={me} />}
      {state.frozen && onLastCard && <button type="button" className="fd-lastcard-entry" onClick={onLastCard}>
        {me ? "Your last card" : "The champion's card"}<Arrow /></button>}
    </section> : finale ? <section className="fd-home-poker" aria-label="Championship Poker">
      {pokerContent}<button type="button" className="fd-home-text-link" onClick={() => onRules(model.finale.event)}>Poker rules<Arrow /></button>
    </section> : <EventFocus model={model} state={state} me={me} onOpen={onOpen} onRules={onRules} onBets={onBets} onBracket={onBracket} onPlayer={onPlayer} GameMark={GameMark} />}

    {askFlights && <FlightsQuestion onYes={onFlightsYes} onNotYet={onFlightsNotYet} />}

    {model.mode === "live" && duelContent}
    {bettingElsewhere && <button type="button" className="fd-home-betting" onClick={onBets}>
      <GameMark id={model.betting.event.game} size={32} /><span><small><i className="fd-beat-dot" aria-hidden="true" />Betting open</small><strong>{model.betting.event.name}</strong></span>
      <span>{model.betting.canPlace ? "Place chips" : "View bets"}<Arrow /></span></button>}

    {/* the since line already names the result it reports */}
    {!before && !finale && !complete && latest && !sinceText && <section className="fd-home-result" aria-label="Latest result">
      <button type="button" className="fd-home-result-event" onClick={() => onOpen(latest)} aria-label={`Latest result: ${latest.name}`}>
        <small>Latest result</small><strong>{latest.name}</strong></button>
      <People state={state} players={state.results[latest.id].slots[0]} onPlayer={onPlayer} />
      <span className="fd-home-result-award">+{fmt(AWARDS[latest.value]?.[0])}</span>
    </section>}

    <section className="fd-home-leaderboard" aria-label="Leaderboard">
      <SectionHeading title="Leaderboard" action={<button type="button" onClick={onStandings} className="fd-home-text-link">Standings <Arrow /></button>} />
      {sinceText && <div className="fd-home-since">
        <button type="button" onClick={() => onSince?.(sinceRoute)} aria-label={`${sinceDetail}. ${
          sinceRoute?.type === "event" ? "Open the event" : sinceRoute?.type === "settled" ? "View settled bets" : "View standings"}`}>
          <span>{sinceText}</span><Arrow /></button>
        {onSinceDismiss && <button type="button" className="fd-home-since-dismiss" onClick={onSinceDismiss}
          aria-label="Dismiss">✕</button>}
      </div>}
      {!!model.standing?.exposure && !finale && !complete && <div className="fd-home-exposure">
        {!!model.standing.atRisk && <button type="button" onClick={onBets}>{fmt(model.standing.atRisk)} in bets ↗</button>}
        {!!model.standing.duelAntes && <span>{fmt(model.standing.duelAntes)} in duels</span>}
      </div>}
      <Leaderboard state={state} standings={standings} me={me} onPlayer={onPlayer} starting={before} deltas={deltas}
        scoreLabel={finale ? "STARTING CHIPS" : undefined} ariaLabel={finale ? "Poker starting stacks" : undefined} />
    </section>

    {model.upcoming.length > 0 && <section className="fd-home-upcoming" aria-label="Coming up">
      <SectionHeading title="Coming up" action={<button type="button" className="fd-home-text-link" onClick={onEvents}>All events <Arrow /></button>} />
      {model.upcoming.slice(0, 2).map(event => <button type="button" key={event.id} className="fd-home-next" onClick={() => onOpen(event)}>
        <GameMark id={event.game} size={34} /><span><strong>{event.name}</strong><small>{sessionOf(event)}</small></span>
        <Arrow /></button>)}
    </section>}
  </div>;
}
