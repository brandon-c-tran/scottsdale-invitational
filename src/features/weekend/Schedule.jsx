import React, { useRef, useState } from "react";
import { SESSIONS, disp, overflowRoleMeta, resolveWeekendOperation } from "../../../shared/core.js";
import { AvatarStack } from "../identity/PlayerIdentity.jsx";
import { PageHeading } from "../../ui/layout.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { eventRowModel, readFolds, sessionFold, writeFolds } from "./scheduleModel.js";
import { Icon } from "../../ui/Icon.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import "./weekend.css";
import "./events.css";

const LAMP_CLASS = { live:"fd-beat-dot", pending:"is-pending", done:"is-done", void:"is-void" };
const PLACE = ["1", "2", "3"];

/* your place in a posted event: a medallion, 1st lit amber; crew a hollow ring */
function PlaceMedal({ place }) {
  const crew = place === "crew";
  return <span className={`fd-events-medal${place === 0 ? " is-first" : ""}${crew ? " is-crew" : ""}`}
    aria-label={crew ? "You were crew" : `You placed ${["1st", "2nd", "3rd"][place]}`}>{crew ? "" : PLACE[place]}</span>;
}

/* The program keeps the same event ordering contract as the tournament:
   reordering moves within a session, with unassigned events in their own group.
   A row is the event's state as a lamp, its name, your part in it (your side
   as photo chips, a crew role, your place once it posts) and what it pays.
   Tapping in is for depth. */
export function Schedule({ state, events, me = null, gm, open, onAdd, onReorder, onPlayer, onBracket, GameMark }) {
  const [reorderMode, setReorderMode] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [opened, setOpened] = useState(readFolds);
  const shelved = events.filter(event => state.shelved?.[event.id]);
  const inSession = session => events.filter(event => event.session === session.id && !state.shelved?.[event.id]);
  const extras = events.filter(event => !SESSIONS.some(session => session.id === event.session) && !state.shelved?.[event.id]);
  const nextId = resolveWeekendOperation(state, events).event?.id;
  const toggleSession = (id, open) => {
    const next = { ...opened, [id]:open };
    setOpened(next);
    writeFolds(next);
  };

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
    const draw = state.draws?.[event.id];
    const reordering = reorderMode && gm && canMove;
    const row = eventRowModel(state, event, me, nextId, { gm });
    /* every team event waits on a draw (and heats on setup); that is news
       only for the next one, which is the row whose lamp flashes */
    const status = row.status;
    const { players, role, place } = row.mine;
    const done = row.lamp === "done";
    const crewRole = role ? overflowRoleMeta(role).short : "";
    return <li key={event.id} className={`fd-events-row${row.lamp ? ` is-${row.lamp}` : ""}${event.finale ? " is-finale" : ""}`}>
      <button type="button" className="fd-events-open" disabled={reordering}
        onClick={() => open(event)} aria-label={`${event.name}.${status ? ` ${status}.` : done ? gm ? " Complete." : " Done." : ""} Open event`}>
        <span className="fd-events-lamp" aria-hidden="true">
          {row.lamp && <i className={`fd-insert ${LAMP_CLASS[row.lamp]}`} />}
        </span>
        <span className="fd-events-mark" aria-hidden="true">
          {GameMark ? <GameMark id={event.game} variant={event.variant} size={34} /> : null}
        </span>
        <span className="fd-events-body">
          <strong className="fd-show"><EventName name={event.name} /></strong>
          {(status || players.length > 0) && <span className="fd-events-part">
            {status && <span className="fd-events-status">{status}</span>}
            {players.length > 0 && <span className="fd-events-you" aria-label={role ? `You: ${overflowRoleMeta(role).label}`
              : players.length > 1 ? `Your side: ${players.map(player => disp(state, player)).join(", ")}` : "You're in it"}>
              <AvatarStack state={state} players={players} size={24} max={4} />
              {crewRole && <small>{crewRole}</small>}
            </span>}
          </span>}
        </span>
        {!reordering && <span className="fd-events-pays">
          {done ? <>
            {place !== null && <PlaceMedal place={place} />}
            {!!row.winners.length && <span className="fd-events-winners" aria-label={`Won by ${row.winners.map(player => disp(state, player)).join(", ")}`}>
              <AvatarStack state={state} players={row.winners} size={28} max={3} /></span>}
          </> : !event.finale && row.lamp !== "void" && <PayoutLadder ev={event} size="tiny" />}
        </span>}
      </button>
      {!reordering && onBracket && state.brackets?.[event.id] && draw
        && <button type="button" className="fd-events-bracket" onClick={() => onBracket(event)}
          aria-label={`${event.name} bracket`}>Bracket</button>}
      {reordering && <div className="fd-weekend-reorder" aria-label={`Reorder ${event.name}`}>
        <button type="button" disabled={moving || index === 0} onClick={() => move(event, -1)}
          aria-label={`Move ${event.name} earlier`}><Icon name="up" size={18} /></button>
        <button type="button" disabled={moving || index === list.length - 1} onClick={() => move(event, 1)}
          aria-label={`Move ${event.name} later`}><Icon name="down" size={18} /></button>
      </div>}
    </li>;
  });

  return <div className="fd-weekend fd-weekend-program fd-events">
    <PageHeading title="Events" />
    {gm && <div className="fd-weekend-host-tools">
      <button type="button" onClick={onAdd} disabled={moving}><Icon name="plus" size={14} /> Add event</button>
      <button type="button" aria-pressed={reorderMode} disabled={moving}
        onClick={() => setReorderMode(value => !value)}>{reorderMode ? "Done" : "Reorder"}</button>
    </div>}
    {error && <p className="fd-weekend-error" role="alert">{error}</p>}
    {SESSIONS.map(session => {
      const list = inSession(session);
      if (!list.length) return null;
      /* reordering shows every row, so a folded session never hides one */
      const fold = reorderMode && gm ? null : sessionFold(state, list, nextId);
      if (fold) {
        const folded = opened[session.id] !== true;
        const listId = `fd-session-list-${session.id}`;
        return <section key={session.id} className={`fd-events-session is-done${folded ? " is-folded" : ""}`}
          aria-labelledby={`fd-session-${session.id}`}>
          <h2 id={`fd-session-${session.id}`} className="fd-events-session-fold">
            <button type="button" className="fd-events-session-toggle" aria-expanded={!folded}
              aria-controls={folded ? undefined : listId} aria-label={`${session.label}, ${fold.played} played`}
              onClick={() => toggleSession(session.id, folded)}>
              <span className="fd-events-session-name">{session.label}</span>
              {folded && !!fold.winners.length && <span className="fd-events-session-winners" aria-hidden="true">
                <AvatarStack state={state} players={fold.winners} size={24} max={5} />
              </span>}
              <Icon name={folded ? "expand" : "collapse"} size={18} />
            </button>
          </h2>
          {!folded && <ol id={listId} className="fd-events-list">{eventRows(list)}</ol>}
        </section>;
      }
      return <section key={session.id} className="fd-events-session" aria-labelledby={`fd-session-${session.id}`}>
        <h2 id={`fd-session-${session.id}`} className="fd-events-session-heading">{session.label}</h2>
        <ol className="fd-events-list">{eventRows(list)}</ol>
      </section>;
    })}
    {!!extras.length && <section className="fd-events-session">
      <h2 className="fd-events-session-heading">Added</h2>
      <ol className="fd-events-list">{eventRows(extras)}</ol>
    </section>}
    {!!shelved.length && <section className="fd-events-session is-shelved">
      <h2 className="fd-events-session-heading">Shelved</h2>
      <ol className="fd-events-list">{eventRows(shelved, false)}</ol>
    </section>}
  </div>;
}
