import React, { useRef, useState } from "react";
import { disp, resolveCurrentContest, resolveEventLifecycle, contestUndoAvailability } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { CompetitionBracket } from "./CompetitionBracket.jsx";
import "./contest.css";

const nameOf = (state, side) => side.name || side.players.map(player => disp(state, player)).join(" & ");

function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, operationBusy, onBusy, blocked }) {
  const [winner, setWinner] = useState(null), [qualifiers, setQualifiers] = useState([]);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const busy = useRef(false), retry = useRef(null);
  const open = contest.phase === "betting-open", locked = contest.phase === "betting-locked";
  const running = contest.phase === "in-progress" || contest.phase === "awaiting-result";
  const isFfa = contest.kind === "ffa", isBracket = contest.kind === "match";
  const advance = contest.kind === "heat" ? state.stages?.[ev.id]?.advance || 1 : 1;
  const reference = { contestId:contest.id, contestRevision:contest.revision };
  const act = async callback => {
    if (busy.current || operationBusy.current) return;
    busy.current = true; operationBusy.current = true; onBusy(true); retry.current = callback; setPending(true); setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Change not saved. Try again.");
      return result;
    } catch (failure) { setError(failure?.message || "Change not saved. Try again."); }
    finally { busy.current = false; operationBusy.current = false; onBusy(false); setPending(false); }
  };
  const record = key => act(() => onWinner({ ...reference, winner:key, qualifiers:[key] }));
  const selectingQualifiers = advance > 1 && winner !== null;
  return <section className="fd-contest" aria-label="Current contest" aria-busy={pending}>
    <div className="fd-contest-toolbar">
      <div><strong>{isBracket ? "Bracket" : contest.label || ev.name}</strong>
        <span>{open ? "Betting open" : locked ? "Betting locked" : running ? "In progress" : "Next contest"}</span></div>
      {gm && (open || locked) && <button type="button" className="fd-contest-primary" disabled={pending || blocked || !onLock}
        onClick={() => act(() => onLock(reference))}>{pending ? "Starting…" : "Lock bets and start"}</button>}
      {!gm && onBets && <button type="button" className="fd-contest-primary" disabled={pending || blocked} onClick={onBets}>{open ? "Place chips" : "View bets"}</button>}
      {gm && running && isFfa && <button type="button" className="fd-contest-primary" disabled={pending || !onResult}
        onClick={() => act(async () => { const result = await onResult(); return result === true ? {ok:true} : result; })}>Enter result</button>}
    </div>
    {gm && running && !isFfa && <p className="fd-contest-instruction">{selectingQualifiers
      ? `Choose ${advance - 1} more to advance.` : isBracket ? "Tap the winning team." : "Tap the winner."}</p>}
    {isBracket ? <CompetitionBracket state={state} ev={ev} me={me} gm={gm} pending={pending || blocked} onPlayer={onPlayer}
      onPick={onWinner ? (_r, _m, key) => record(key) : undefined} />
      : !isFfa && <div className="fd-contest-entrants" aria-label={contest.label}>
        {contest.sides.map(side => {
          const name = nameOf(state, side), selected = winner === side.key;
          const canChoose = gm && running && !!onWinner;
          const qualifier = selectingQualifiers && !selected;
          return <div key={String(side.key)} className={`fd-contest-entrant ${side.players.includes(me) ? "is-you" : ""} ${selected ? "is-winner" : ""}`}>
            <button type="button" className="fd-contest-entrant-pick" disabled={pending || blocked || !canChoose}
              role={canChoose && qualifier ? "checkbox" : undefined} aria-checked={canChoose && qualifier ? qualifiers.includes(side.key) : undefined}
              aria-pressed={canChoose && advance > 1 && !qualifier ? selected : undefined}
              aria-label={canChoose ? `${qualifier ? "Also advances" : "Winner"}: ${name}` : name}
              onClick={() => {
                if (busy.current || operationBusy.current || !canChoose) return;
                if (advance === 1) return record(side.key);
                if (!selectingQualifiers || selected) { setWinner(side.key); setQualifiers([]); return; }
                setQualifiers(current => current.includes(side.key) ? current.filter(key => key !== side.key)
                  : current.length < advance - 1 ? [...current,side.key] : current);
              }}>
              <span>{name}</span>{canChoose && <small>{selected ? "Winner" : qualifier ? qualifiers.includes(side.key) ? "✓" : "+" : "Win"}</small>}
            </button>
            <div className="fd-contest-entrant-players">{side.players.map(player => <button key={player} type="button"
              onClick={() => onPlayer?.(player)} disabled={pending || blocked || !onPlayer} aria-label={`View ${disp(state, player)}'s player card`}>
              <Avatar state={state} p={player} size={28} /></button>)}</div>
          </div>;
        })}
        {gm && running && advance > 1 && selectingQualifiers && <div className="fd-contest-qualifier-actions">
          <button type="button" className="fd-contest-secondary" disabled={pending} onClick={() => { setWinner(null);setQualifiers([]); }}>Change winner</button>
          <button type="button" className="fd-contest-primary" disabled={pending || qualifiers.length !== advance - 1 || !onWinner}
            onClick={() => act(() => onWinner({...reference,winner,qualifiers:[winner,...qualifiers]}))}>{pending ? "Saving…" : "Record winner"}</button>
        </div>}
      </div>}
    {error && <div className="fd-contest-failure"><p role="alert" className="fd-contest-error">{error}</p>
      <button type="button" className="fd-contest-secondary" disabled={pending} onClick={() => act(retry.current)}>Retry</button></div>}
    {pending && running && !isFfa && <p className="fd-contest-saving" role="status">Saving result…</p>}
  </section>;
}

export function ContestPanel(props) {
  const { state, ev, gm, onResult } = props;
  const operationBusy = useRef(false), [blocked, onBusy] = useState(false);
  const operations = { operationBusy, blocked, onBusy };
  if (state.results?.[ev.id] || state.shelved?.[ev.id] || state.frozen || ev.finale) return null;
  const lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  if (!contest || !["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase)) {
    return gm && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type)
      ? <><ContestFinish key={ev.id} onResult={onResult} {...operations} /><ContestCorrection {...props} {...operations} /></>
      : null;
  }
  return <><CurrentContest key={`${ev.id}:${contest.id}:${contest.revision}:${contest.phase}`} {...props} {...operations} contest={contest} /><ContestCorrection {...props} {...operations} /></>;
}

function ContestFinish({ onResult, operationBusy, blocked, onBusy }) {
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const post = async () => {
    if (operationBusy.current || !onResult) return;
    operationBusy.current = true; onBusy(true); setPending(true); setError("");
    try {
      const result = await onResult();
      if (result !== true && result?.ok !== true) setError(result?.error || "Change not saved. Try again.");
      return result;
    } catch (failure) { setError(failure?.message || "Change not saved. Try again."); }
    finally { operationBusy.current = false; onBusy(false); setPending(false); }
  };
  return <section className="fd-contest" aria-busy={pending}>
    <div className="fd-contest-toolbar"><strong>Competition complete</strong>
      <button type="button" className="fd-contest-primary" disabled={blocked || pending || !onResult} onClick={post}>
        {pending ? "Opening result…" : "Post event result"}</button></div>
    {error && <div className="fd-contest-failure"><p role="alert" className="fd-contest-error">{error}</p>
      <button type="button" className="fd-contest-secondary" disabled={blocked || pending} onClick={post}>Retry</button></div>}
  </section>;
}

function ContestCorrection({ state, ev, gm, onUndo, operationBusy, blocked, onBusy }) {
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const busy = useRef(false), undo = contestUndoAvailability(state,ev);
  if (!gm || !onUndo || !state.eventOps?.[ev.id]?.lastContest) return null;
  return <div className="fd-contest-correction">
    <button type="button" disabled={pending || blocked || !undo.enabled} onClick={async()=>{
      if (busy.current || operationBusy.current) return;
      busy.current = true; operationBusy.current = true; onBusy(true); setPending(true); setError("");
      try {
        const result = await onUndo({contestId:undo.contestId,contestRevision:undo.contestRevision});
        if (!result?.ok) setError(result?.error || "Change not saved. Try again.");
      } catch (failure) { setError(failure?.message || "Change not saved. Try again."); }
      finally { busy.current = false; operationBusy.current = false; onBusy(false); setPending(false); }
    }}>{pending ? "Opening result…" : "Correct previous result"}</button>
    {!undo.enabled && <p>{undo.blocker}</p>}
    {error && <p role="alert" className="fd-contest-error">{error}</p>}
  </div>;
}
