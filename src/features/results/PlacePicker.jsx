import React from "react";
import { Avatar, AvatarStack } from "../identity/PlayerIdentity.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { PLACE_NAMES } from "./placePickerModel.js";
import "./place-picker.css";

/* The place picker's pieces (ResultEntry.jsx owns the state and creates
   every control, so each one's `name` is its accessible name).

   The podium: each paid place a socket, standing 2nd, 1st, 3rd on one floor,
   its medallion in the place's color and its award on the step. The socket
   the next tap lands in is lit cyan (the info lamp: where you are) and
   flashes like any pending lamp. A filled socket that can take a tie carries
   a + on its step's corner; lit, it shows the open seat beside the faces.

   The field: everyone who can be placed, as photo tiles (or team tiles). A
   placed tile wears its place's ring and medallion; with nowhere left to
   land, the unplaced ones go quiet. */

const fmt = n => (Number(n) || 0).toLocaleString("en-US");
/* the step's share of the full height, by place; crew stands lowest */
const RISE = { 0:1, 1:.8, 2:.64, crew:.58 };
/* podium order: 2nd, 1st, 3rd */
export const podiumOrder = places => {
  const sorted = [...places].sort((a, b) => a - b);
  return sorted.length >= 2 && sorted[0] === 0 && sorted[1] === 1 ? [1, 0, ...sorted.slice(2)] : sorted;
};
/* faces shrink as a place fills, so a tie or a team stays on its step */
const seatFace = (count, team) => team ? (count > 1 ? 22 : 26) : count <= 1 ? 46 : count === 2 ? 36 : count <= 4 ? 30 : 26;

/* `still`: nothing on it is tapped into (two teams, a fixed winner), so
   its seats keep no room for a tie */
export function Podium({ columns, still = false, children }) {
  return <ol className={`fd-pp-podium${still ? " is-still" : ""}`} style={{ "--pp-cols":columns }}>{children}</ol>;
}

/* one place on the podium; `onClick` makes it the target */
export function Socket({ name, place, amount, target = false, filled = false, tieable = false, fixed = false, locked = false,
  owed = false, replacing = false, disabled = false, onClick = null, children }) {
  const cls = ["fd-pp-socket", `is-place-${place}`, target && "is-target", filled && "is-filled", fixed && "is-fixed",
    tieable && !fixed && "is-tieable", owed && "is-owed", replacing && "is-replacing"].filter(Boolean).join(" ");
  const tie = target && filled && tieable;
  const open = !filled || tie;
  return <li className={cls} style={{ "--rise":RISE[place] }} data-socket={place}>
    <div className="fd-pp-seat">
      {children}
      {open && !fixed && <span className={`fd-pp-open${filled ? " is-tie" : ""}`} aria-hidden="true"
        onClick={disabled || !onClick ? undefined : onClick} />}
    </div>
    {fixed || !onClick
      ? <div className="fd-pp-step" aria-label={`${PLACE_NAMES[place]} place, ${fmt(amount)}`}>
          <span className="fd-pp-medal" aria-hidden="true">{place + 1}</span>
          <b className="fd-pp-amount" aria-hidden="true">{fmt(amount)}</b>
          {locked && <span className="fd-pp-lock" aria-hidden="true"><Icon name="lock" size={13} /></span>}
        </div>
      : <button type="button" className="fd-pp-step" onClick={onClick} disabled={disabled}
          aria-pressed={target} aria-label={name}>
          <span className="fd-pp-medal" aria-hidden="true">{place + 1}</span>
          <b className="fd-pp-amount" aria-hidden="true">{fmt(amount)}</b>
        </button>}
    {filled && tieable && !fixed && onClick && <button type="button" className={`fd-pp-tie${tie ? " is-lit" : ""}`}
      onClick={onClick} disabled={disabled} aria-pressed={tie} aria-label={`Tie for ${PLACE_NAMES[place]}`}>
      <span aria-hidden="true"><Icon name="plus" size={14} /></span>
    </button>}
  </li>;
}

/* the crew's low dashed step: paid the 3rd-place award, set by the draw */
export function CrewStep({ state, players, amount }) {
  const size = players.length <= 2 ? 30 : 24;
  return <li className="fd-pp-socket is-place-crew is-fixed" style={{ "--rise":RISE.crew }}>
    <div className="fd-pp-seat">
      {players.map(p => <span key={p} className="fd-pp-unit is-static">
        <span className="fd-pp-face"><Avatar state={state} p={p} size={size} /></span>
        {players.length <= 2 && <span className="fd-pp-name">{state.profiles?.[p]?.display || p}</span>}
      </span>)}
    </div>
    <div className="fd-pp-step" aria-label={`Crew, ${fmt(amount)} each`}>
      <span className="fd-pp-crew" aria-hidden="true">Crew</span>
      <b className="fd-pp-amount" aria-hidden="true">{fmt(amount)}</b>
    </div>
  </li>;
}

/* a unit standing in a socket; `onClick` takes it back out */
export function SeatUnit({ name, state, players, label, team = false, count = 1, arriving = false, unitKey,
  disabled = false, onClick = null }) {
  const size = seatFace(count, team);
  const face = team
    ? <AvatarStack state={state} players={players} size={size} max={count > 1 ? 3 : 4} />
    : <Avatar state={state} p={players[0]} size={size} />;
  const body = <>
    <span className="fd-pp-face" data-fly="">{face}</span>
    <span className="fd-pp-name">{label}</span>
  </>;
  const cls = `fd-pp-unit${team ? " is-team" : ""}${arriving ? " is-arriving" : ""}`;
  if (!onClick) return <span className={`${cls} is-static`} data-seat={unitKey}>{body}</span>;
  return <button type="button" className={cls} data-seat={unitKey} onClick={onClick} disabled={disabled} aria-label={name}>
    {body}
  </button>;
}

/* one player in the field */
export function FieldTile({ name, state, player, place = -1, idle = false, crew = false, unitKey, disabled = false, onClick }) {
  const placed = place >= 0;
  const cls = ["fd-pp-tile", placed && `is-placed is-place-${place}`, idle && !placed && "is-idle", crew && "is-crew"]
    .filter(Boolean).join(" ");
  return <button type="button" className={cls} data-tile={unitKey} data-place={placed ? place : undefined}
    onClick={onClick} disabled={disabled} aria-pressed={placed} aria-label={name}>
    <span className="fd-pp-face" data-fly="">
      <Avatar state={state} p={player} size={54} />
      {placed && <span className="fd-pp-badge" aria-hidden="true">{place + 1}</span>}
    </span>
    <span className="fd-pp-name">{name}</span>
  </button>;
}

/* one team in the field */
export function TeamTile({ name, state, players, place = -1, idle = false, unitKey, wide = false, big = false,
  disabled = false, onClick }) {
  const placed = place >= 0;
  const cls = ["fd-pp-team", placed && `is-placed is-place-${place}`, idle && !placed && "is-idle", wide && "is-wide",
    big && "is-big"].filter(Boolean).join(" ");
  return <button type="button" className={cls} data-tile={unitKey} data-place={placed ? place : undefined}
    onClick={onClick} disabled={disabled} aria-pressed={placed} aria-label={name}>
    <span className="fd-pp-face" data-fly=""><AvatarStack state={state} players={players} size={big ? 30 : 26} max={4} /></span>
    <span className="fd-pp-team-name">{name}</span>
    {placed && <span className="fd-pp-badge is-corner" aria-hidden="true">{place + 1}</span>}
  </button>;
}

/* teams or players, for a team event's lower places */
export function FieldModes({ mode, teamsOnly = false, disabled = false, onTeams, onPlayers }) {
  return <div className="fd-pp-modes" role="group" aria-label="Pick by">
    <button type="button" aria-pressed={mode === "teams"} disabled={disabled} onClick={onTeams}>
      <Icon name="people" size={16} />Teams</button>
    <button type="button" aria-pressed={mode === "players"} disabled={disabled || teamsOnly} onClick={onPlayers}>
      <Icon name="person" size={16} />Players</button>
  </div>;
}
