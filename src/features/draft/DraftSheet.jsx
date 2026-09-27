import React, { useEffect, useRef, useState } from "react";
import { disp, draftTurn, shuffle, snakeTeam, overflowRoleMeta, playerStrength, teamFit } from "../../../shared/core.js";
import { Sheet, ActionButton } from "../../ui/controls.jsx";
import { Avatar, BankChip } from "../identity/PlayerIdentity.jsx";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import "./draft.css";

const identityStyle = (state, player) => ({ "--draft-color":resolvePlayerIdentity(state.profiles, player).color });
const reference = turn => ({ draftId:turn.draftId, pickIndex:turn.pickIndex, draftRevision:turn.draftRevision });

function PlayerLink({ state, player, onPlayer, children, disabled }) {
  return <button type="button" className="fd-draft-person" disabled={disabled || !onPlayer}
    onClick={() => onPlayer?.(player)} aria-label={`View ${disp(state, player)}'s player card`}>
    <Avatar state={state} p={player} size={30}/><span>{children || disp(state, player)}</span>
  </button>;
}

export function DraftEntry({ state, ev, me, onOpen }) {
  const draft = state.drafts?.[ev?.id];
  if (!draft || state.draws?.[ev.id]) return null;
  const turn = draftTurn(draft), mine = turn.captain === me;
  return <button type="button" className={`fd-draft-entry${mine ? " is-mine" : ""}`} onClick={onOpen}
    aria-label={`Open ${ev.name} draft`}>
    <BankChip p={turn.captain || draft.teams[0].captain} size={44}/>
    <span><small>{turn.complete ? "Teams picked" : mine ? "Your pick" : "Draft in progress"}</small>
      <strong>{ev.name}</strong><span>{turn.complete ? "Waiting for teams to be confirmed"
        : `Pick ${turn.pickIndex + 1} · ${disp(state, turn.captain)}`}</span></span>
    <b aria-hidden="true">↗</b>
  </button>;
}

export function DraftSheet({ ev, state, gm, me, standings = [], pool, roles = [], onClose, onPlayer,
  onStart, onPick, onUndo, onFinalize, onCancel }) {
  const draft = state.drafts?.[ev.id];
  const [captains, setCaptains] = useState([]), [method, setMethod] = useState("pick");
  const [pending, setPending] = useState(""), [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const saving = useRef(false), board = useRef(null), focusAfterPick = useRef(false);
  const turn = draft ? draftTurn(draft) : null;
  const blocked = !!state.frozen || !!state.poker && !state.results?.[state.poker.id]
    || !!state.results?.[ev.id] || !!state.shelved?.[ev.id] || state.onDeck === ev.id
    || !!state.eventOps?.[ev.id]?.bettingOpenedAt || !!state.eventOps?.[ev.id]?.startedAt;
  const myTurn = !!turn?.captain && turn.captain === me;
  const canPick = !!turn && !turn.complete && (gm || myTurn) && !blocked;
  const submit = async (name, action, after) => {
    if (saving.current) return { ok:false, error:"Still saving." };
    saving.current = true; setPending(name); setError("");
    try {
      const result = await action();
      if (result?.ok !== true) { setError(result?.error || "Couldn't save. Try again."); return result; }
      after?.();
      return result;
    } catch (failure) {
      const result = { ok:false, error:failure?.message || "Couldn't save. Try again." };
      setError(result.error); return result;
    } finally { saving.current = false; setPending(""); }
  };
  useEffect(() => {
    if (!pending && focusAfterPick.current) {
      board.current?.focus({ preventScroll:true }); focusAfterPick.current = false;
    }
  }, [pending, turn?.draftRevision]);

  /* a running draft keeps the shape it started with; setup reads the room */
  const fit = draft?.fit || (pool ? teamFit(ev, pool.length + roles.length) : null) || ev.teamCfg;
  const n = fit?.teams || 2, size = fit?.size || 2;
  const chooseMethod = next => {
    if (saving.current) return;
    setMethod(next);
    if (next === "random") setCaptains(shuffle(pool || []).slice(0, n));
    /* the same live blend the balanced draw uses, never a raw self-rating */
    else if (next === "seed") setCaptains([...(pool || [])].sort((a,b) =>
      playerStrength(state, b, ev.sport, standings.length ? standings : undefined)
        - playerStrength(state, a, ev.sport, standings.length ? standings : undefined)).slice(0, n));
    else setCaptains([]);
  };
  const toggleCaptain = player => {
    if (saving.current) return;
    setMethod("pick");
    setCaptains(previous => previous.includes(player) ? previous.filter(p => p !== player)
      : previous.length < n ? [...previous, player] : previous);
  };
  const crew = draft?.roles || roles;
  const shell = children => <Sheet title={ev.name} subtitle="Captains draft" onClose={onClose}
    busy={!!pending} wide className="fd-draft-sheet">{children}</Sheet>;
  const confirmed = state.draws?.[ev.id];
  if (!draft && confirmed?.sourceDraftId && (!pool || !gm)) return shell(<ConfirmedTeams state={state}
    draw={confirmed} me={me} size={size} onPlayer={onPlayer} />);
  if (!draft && (!pool || !gm)) return shell(<p>Draft closed.</p>);

  if (!draft) return shell(<div className="fd-draft">
    <div className="fd-draft-section-title"><h2>Choose {n} captains</h2><span>{n} teams of {size}</span></div>
    <p className="fd-draft-note">Captain order is pick order. It reverses each round.</p>
    <div className="fd-draft-methods" aria-label="Choose captains">
      {[["pick","Choose"],["seed","Balanced"],["random","Random"]].map(([id,text]) =>
        <button type="button" key={id} aria-pressed={method === id} disabled={!!pending}
          onClick={() => chooseMethod(id)}>{text}</button>)}
    </div>
    <ol className="fd-draft-captain-order" aria-label="Captain pick order">
      {Array.from({ length:n }, (_, index) => <li key={`${index}:${captains[index] || "empty"}`} className={captains[index] ? "is-filled" : ""}>
        <small>{index + 1}</small>{captains[index] ? <button type="button" disabled={!!pending}
          onClick={() => toggleCaptain(captains[index])} aria-label={`Remove ${disp(state, captains[index])} as captain`}>
          <BankChip p={captains[index]} size={36}/><span>{disp(state, captains[index])}</span><b aria-hidden="true">×</b>
        </button> : <span>Captain {index + 1}</span>}
      </li>)}
    </ol>
    <div className="fd-draft-pool" aria-label="Players">
      {(pool || []).map(player => <div className="fd-draft-candidate" key={player}>
        <button type="button" className="fd-draft-select" aria-label={`Choose ${disp(state, player)} as captain`}
          aria-pressed={captains.includes(player)} disabled={!!pending || !captains.includes(player) && captains.length === n}
          onClick={() => toggleCaptain(player)}>
          <Avatar state={state} p={player} size={36}/><span>{disp(state, player)}</span>
          <b aria-hidden="true">{captains.includes(player) ? captains.indexOf(player) + 1 : "+"}</b>
        </button>
      </div>)}
    </div>
    {!!crew.length && <DraftCrew state={state} roles={crew} onPlayer={onPlayer} disabled={!!pending}/>}
    {error && <p className="fd-draft-error" role="alert">{error}</p>}
    <div className="fd-draft-footer"><ActionButton disabled={captains.length !== n || blocked} pending={!!pending}
      onClick={() => submit("start", () => onStart(captains, pool))}>
      {pending ? "Starting…" : "Start the draft"}</ActionButton></div>
  </div>);

  const last = draft.picks.at(-1), ref = reference(turn);
  const remainingOrder = Array.from({ length:Math.min(turn.remaining, n + 1) }, (_, offset) => ({
    pick:turn.pickIndex + offset, team:snakeTeam(turn.pickIndex + offset, n),
  }));
  const pick = player => {
    if (!canPick || saving.current) return;
    focusAfterPick.current = true;
    return submit(`pick:${player}`, () => onPick(player, ref));
  };
  return shell(<div className="fd-draft" ref={board} tabIndex={-1}>
    <section className={`fd-draft-turn${myTurn ? " is-mine" : ""}${turn.complete ? " is-complete" : ""}`}
      aria-label="Current pick" style={identityStyle(state, turn.captain || draft.teams[0].captain)}>
      <div className="fd-draft-turn-copy" key={`${draft.id}:${turn.draftRevision}`}>
        <small>{turn.complete ? `${draft.teams.length} teams · ${size} players each` : `Round ${turn.round} · Pick ${turn.pickIndex + 1} of ${turn.totalPicks}`}</small>
        <h2>{turn.complete ? "Teams picked" : myTurn ? "Your pick" : `${disp(state, turn.captain)}'s pick`}</h2>
        <p>{turn.complete ? gm ? "Confirm the teams to reveal the draw." : "Waiting for the commissioner to confirm."
          : canPick ? gm && !myTurn ? `Picking for ${disp(state, turn.captain)}` : "Choose a player."
            : "Only captains pick."}</p>
      </div>
      <span className="fd-draft-turn-chip" key={`${draft.id}:${turn.captain || "done"}`} aria-hidden="true">
        <BankChip p={turn.captain || draft.teams[0].captain} size={64}/>
      </span>
      <div className="fd-draft-progress" role="progressbar" aria-label="Draft picks"
        aria-valuenow={turn.pickIndex} aria-valuemin={0} aria-valuemax={turn.totalPicks}>
        <span style={{ width:`${turn.totalPicks ? turn.pickIndex / turn.totalPicks * 100 : 100}%` }}/>
      </div>
    </section>
    <p className="fd-draft-sr" role="status" aria-live="polite" aria-atomic="true">
      {last ? `${disp(state,last.player)} joined ${disp(state,draft.teams[last.team].captain)}. ` : ""}
      {turn.complete ? "All players picked." : `Pick ${turn.pickIndex + 1}. ${disp(state,turn.captain)} to choose.`}
    </p>
    {!turn.complete && <ol className="fd-draft-queue" aria-label="Upcoming pick order">
      {remainingOrder.map(({ pick:pickIndex, team }, index) => <li key={pickIndex} aria-current={index === 0 ? "step" : undefined}>
        <small>{index === 0 ? "Now" : `Pick ${pickIndex + 1}`}</small><span>{disp(state,draft.teams[team].captain)}</span>
      </li>)}
    </ol>}
    {last && <div className="fd-draft-latest" key={`${draft.id}:${draft.picks.length}:${last.player}`}>
      <span className="fd-draft-pick-stamp">{String(draft.picks.length).padStart(2,"0")}</span>
      <PlayerLink state={state} player={last.player} onPlayer={onPlayer} disabled={!!pending}/>
      <span>→ {disp(state,draft.teams[last.team].captain)}</span>
    </div>}
    {blocked && <p className="fd-draft-error" role="status">Draft paused.</p>}
    {error && <p className="fd-draft-error" role="alert">{error}</p>}
    <div className={`fd-draft-body${turn.complete ? " is-complete" : ""}`}>
    {!turn.complete && <section className="fd-draft-available" aria-label="Available players">
      <div className="fd-draft-section-title"><h3>{canPick ? "Make your pick" : "Available"}</h3><span>{turn.remaining} left</span></div>
      <div className="fd-draft-pool">
        {draft.pool.map(player => <div className="fd-draft-candidate" key={player} style={identityStyle(state,player)}>
          <button type="button" className="fd-draft-avatar-link" disabled={!!pending || !onPlayer}
            onClick={() => onPlayer?.(player)} aria-label={`View ${disp(state,player)}'s player card`}>
            <Avatar state={state} p={player} size={36}/>
          </button>
          <button type="button" className="fd-draft-pick" disabled={!canPick || !!pending}
            aria-label={`Draft ${disp(state,player)}`} onClick={() => pick(player)}>
            <span>{disp(state,player)}</span><small>{pending === `pick:${player}` ? "Picking…" : canPick ? "Pick +" : "Available"}</small>
          </button>
        </div>)}
      </div>
    </section>}
    <section aria-label="Draft teams">
      <div className="fd-draft-section-title"><h3>Teams</h3><span>{turn.pickIndex}/{turn.totalPicks} picks</span></div>
      <div className="fd-draft-teams" style={{ "--draft-columns":Math.min(n,3) }}>
        {draft.teams.map((team,index) => <section key={team.captain}
          className={`fd-draft-team${turn.teamIndex === index && !turn.complete ? " is-picking" : ""}${team.players.includes(me) ? " is-yours" : ""}`}
          style={identityStyle(state,team.captain)} aria-label={`${disp(state,team.captain)}'s team`}>
          <header><small>{team.players.includes(me) ? "Your team" : `Team ${index + 1}`}</small>
            <span>{team.players.length}/{size}</span></header>
          <PlayerLink state={state} player={team.captain} onPlayer={onPlayer} disabled={!!pending}/>
          <small className="fd-draft-captain-label">Captain</small>
          <ol>{Array.from({ length:size - 1 }, (_,slot) => {
            const player = team.players[slot + 1];
            return <li key={player || `empty:${slot}`} className={player ? `is-seated${player === last?.player ? " is-latest" : ""}` : "is-empty"}>
              {player ? <PlayerLink state={state} player={player} onPlayer={onPlayer} disabled={!!pending}/>
                : <><span className="fd-draft-empty-chip" aria-hidden="true"/><span>Pick {Array.from({ length:turn.totalPicks }, (_,k) => k).filter(k => snakeTeam(k,n) === index)[slot] + 1}</span></>}
            </li>;
          })}</ol>
        </section>)}
      </div>
    </section>
    </div>
    {!!crew.length && <DraftCrew state={state} roles={crew} onPlayer={onPlayer} disabled={!!pending}/>}
    {gm && <div className="fd-draft-footer">
      {turn.complete && <ActionButton disabled={blocked} pending={!!pending}
        onClick={() => submit("finish", () => onFinalize(ref), onClose)}>Confirm teams</ActionButton>}
      <div className="fd-draft-secondary-actions">
        <ActionButton compact variant="secondary" disabled={!draft.picks.length || blocked || !!pending}
          onClick={() => submit("undo", () => onUndo(ref))}>Undo last pick</ActionButton>
        <ActionButton compact variant="tertiary" disabled={blocked || !!pending} onClick={() => setConfirmCancel(value => !value)}>Cancel draft</ActionButton>
      </div>
      {confirmCancel && <div className="fd-draft-cancel"><p>Discard this draft and its picks?</p>
        <ActionButton compact variant="destructive" pending={!!pending}
          onClick={() => submit("cancel", () => onCancel(ref), onClose)}>Discard draft</ActionButton>
        <ActionButton compact variant="secondary" disabled={!!pending} onClick={() => setConfirmCancel(false)}>Keep drafting</ActionButton>
      </div>}
    </div>}
  </div>);
}

/* After confirmation the sheet stays useful: every captain and player lands
   on their own team first, with the rest of the teams and crew below. */
function ConfirmedTeams({ state, draw, me, size, onPlayer }) {
  const order = draw.teams.map((team, index) => ({ team, index }))
    .sort((a, b) => Number(b.team.players.includes(me)) - Number(a.team.players.includes(me)));
  const role = (draw.roles || []).find(item => item.player === me);
  return <div className="fd-draft">
    <div className="fd-draft-section-title"><h2>Teams confirmed</h2><span>{draw.teams.length} teams of {size}</span></div>
    {role && <p className="fd-draft-note">Your role · {overflowRoleMeta(role.role).label}</p>}
    <div className="fd-draft-teams" style={{ "--draft-columns":Math.min(draw.teams.length, 3) }}>
      {order.map(({ team, index }) => {
        const captain = team.captain || team.players[0];
        const yours = team.players.includes(me);
        return <section key={captain} className={`fd-draft-team${yours ? " is-yours" : ""}`}
          style={identityStyle(state, captain)} aria-label={yours ? "Your team" : `${disp(state, captain)}'s team`}>
          <header><small>{yours ? "Your team" : team.name || `Team ${index + 1}`}</small><span>{team.players.length}/{size}</span></header>
          {yours && team.name && <strong className="fd-draft-team-name">{team.name}</strong>}
          <PlayerLink state={state} player={captain} onPlayer={onPlayer}/>
          <small className="fd-draft-captain-label">Captain</small>
          <ol>{team.players.filter(player => player !== captain).map(player =>
            <li key={player} className="is-seated"><PlayerLink state={state} player={player} onPlayer={onPlayer}/></li>)}</ol>
        </section>;
      })}
    </div>
    {!!draw.roles?.length && <DraftCrew state={state} roles={draw.roles} onPlayer={onPlayer}/>}
  </div>;
}

function DraftCrew({ state, roles, onPlayer, disabled }) {
  return <div className="fd-draft-crew"><small>Crew</small>{roles.map(({ player,role }) =>
    <div key={player}><PlayerLink state={state} player={player} onPlayer={onPlayer} disabled={disabled}/>
      <span>{overflowRoleMeta(role).label}</span></div>)}</div>;
}
