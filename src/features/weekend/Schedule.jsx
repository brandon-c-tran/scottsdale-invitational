import React, { useRef, useState } from "react";
import { EDITION, SESSIONS, disp, resolveEventLifecycle } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { PageHeading, SectionHeading } from "../../ui/layout.jsx";
import "./weekend.css";

/* The program keeps the same event ordering contract as the tournament:
   reordering moves within a session, with unassigned events in their own group. */
export function Schedule({ state, events, gm, open, onAdd, onReorder, onPlayer, onBracket, GameMark, EventCrewCard }) {
  const [reorderMode, setReorderMode] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const shelved = events.filter(event => state.shelved?.[event.id]);
  const inSession = session => events.filter(event => event.session === session.id && !state.shelved?.[event.id]);
  const extras = events.filter(event => !SESSIONS.some(session => session.id === event.session) && !state.shelved?.[event.id]);
  const active = events.filter(event => !state.shelved?.[event.id]);
  const complete = active.filter(event => state.results?.[event.id]).length;

  const move = async (event, direction) => {
    if (pending.current) return;
    const groups = [...SESSIONS.map(session => inSession(session).map(item => item.id)), extras.map(item => item.id)];
    for (const ids of groups) {
      const index = ids.indexOf(event.id);
      if (index < 0) continue;
      const next = index + direction;
      if (next < 0 || next >= ids.length) return;
      [ids[index], ids[next]] = [ids[next], ids[index]];
      break;
    }
    pending.current = true;
    setMoving(true);
    setError("");
    try {
      const result = await onReorder(groups.flat());
      if (result?.ok === false) setError(result.error || "Couldn't reorder. Try again.");
    } catch { setError("Couldn't reorder. Try again."); }
    finally { pending.current = false; setMoving(false); }
  };

  const eventRows = (list, canMove = true) => list.map((event, index) => {
    const result = state.results?.[event.id];
    const draw = state.draws?.[event.id];
    const onDeck = state.onDeck === event.id;
    const reordering = reorderMode && gm && canMove;
    const lifecycle = resolveEventLifecycle(state, event);
    const status = lifecycle.phase === "scheduled" ? "" : lifecycle.label;
    return <li key={event.id} className={`fd-weekend-event${onDeck ? " is-on-deck" : ""}${event.finale ? " is-finale" : ""}`}>
      <div className="fd-weekend-event-line">
        <button type="button" className="fd-weekend-event-open" disabled={reordering}
          onClick={() => open(event)} aria-label={`${event.name}.${status ? ` ${status}.` : ""} Open event`}>
          <span className="fd-weekend-event-mark" aria-hidden="true">
            {GameMark ? <GameMark id={event.game} size={32} /> : String(index + 1).padStart(2, "0")}
          </span>
          <span className="fd-weekend-event-name"><strong>{event.name}</strong>
            {status && <span className={`fd-weekend-event-status${onDeck ? " is-live" : ""}`}>
              {onDeck && <i aria-hidden="true" />}{status}
            </span>}
          </span>
          {!reordering && <span className="fd-weekend-event-arrow" aria-hidden="true">{result ? "✓" : "↗"}</span>}
        </button>
        {!reordering && onBracket && state.brackets?.[event.id] && draw
          && <button type="button" className="fd-weekend-event-bracket" onClick={() => onBracket(event)}
            aria-label={`${event.name} bracket`}>Bracket</button>}
        {reordering && <div className="fd-weekend-reorder" aria-label={`Reorder ${event.name}`}>
          <button type="button" disabled={moving || index === 0} onClick={() => move(event, -1)}
            aria-label={`Move ${event.name} earlier`}>↑</button>
          <button type="button" disabled={moving || index === list.length - 1} onClick={() => move(event, 1)}
            aria-label={`Move ${event.name} later`}>↓</button>
        </div>}
      </div>
      {!!result?.slots?.[0]?.length && <div className="fd-weekend-winners" aria-label="Winners">
        <span className="fd-weekend-micro">Won by</span>
        {result.slots[0].map(player => <button type="button" key={player} className="fd-weekend-winner"
          disabled={!onPlayer} onClick={() => onPlayer?.(player)} aria-label={`View ${disp(state, player)}'s player card`}>
          <Avatar state={state} p={player} size={22} />{disp(state, player)}
        </button>)}
      </div>}
      {!reordering && !!draw?.roles?.length && EventCrewCard && <div className="fd-weekend-event-crew">
        <EventCrewCard state={state} roles={draw.roles} compact />
      </div>}
    </li>;
  });

  return <div className="fd-weekend fd-weekend-program">
    <PageHeading kicker={EDITION.long} title="Events" />
    {complete > 0 && <p className="fd-weekend-progress">{complete} of {active.length} complete</p>}
    {gm && <div className="fd-weekend-host-tools">
      <button type="button" onClick={onAdd} disabled={moving}>+ Add an event</button>
      <button type="button" aria-pressed={reorderMode} disabled={moving}
        onClick={() => setReorderMode(value => !value)}>{reorderMode ? "Done" : "Reorder"}</button>
    </div>}
    {error && <p className="fd-weekend-error" role="alert">{error}</p>}
    {SESSIONS.map(session => {
      const list = inSession(session);
      if (!list.length) return null;
      return <section key={session.id} className={`fd-weekend-session fd-weekend-session-${session.id}`} aria-labelledby={`fd-session-${session.id}`}>
        <header className="fd-weekend-session-heading">
          <div><h2 id={`fd-session-${session.id}`}>{session.label}</h2></div>
          <span className="fd-weekend-session-value">{session.tag}</span>
        </header>
        <ol className="fd-weekend-event-list">{eventRows(list)}</ol>
      </section>;
    })}
    {!!extras.length && <section className="fd-weekend-session">
      <SectionHeading title="Added events" detail={`${extras.length} events`} />
      <ol className="fd-weekend-event-list">{eventRows(extras)}</ol>
    </section>}
    {!!shelved.length && <section className="fd-weekend-session fd-weekend-shelved">
      <SectionHeading title="Shelved" />
      <ol className="fd-weekend-event-list">{eventRows(shelved, false)}</ol>
    </section>}
  </div>;
}
