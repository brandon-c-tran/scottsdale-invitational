import React, { useEffect, useRef, useState } from "react";
import { disp, resolveCurrentContest, resolveEventLifecycle, contestUndoAvailability, contestCorrectionAvailability,
  contestCorrections, correctionText,
  allEventsOf, resolveWager, wagerMatchesContest, bracketOrder, bracketMatchOpen, ROUND_NAMES } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { CompetitionBracket } from "./CompetitionBracket.jsx";
import "./contest.css";

const nameOf = (state, side) => side.name || side.players.map(player => disp(state, player)).join(" & ");
/* A recorded winner can be taken back with one tap for this long. */
const UNDO_WINDOW_MS = 5000;

function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, onPlayNext, onRecorded, operationBusy, onBusy, blocked }) {
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
  const sideName = key => { const side = contest.sides.find(item => item.key === key); return side ? nameOf(state, side) : ""; };
  const recorded = key => async () => {
    const result = await onWinner({ ...reference, winner:key, qualifiers:[key] });
    if (result?.ok === true) onRecorded?.(sideName(key));
    return result;
  };
  const record = key => act(recorded(key));
  const selectingQualifiers = advance > 1 && winner !== null;
  /* another seated matchup can go first while this market is empty */
  const bracket = isBracket ? state.brackets?.[ev.id] : null;
  const chipsIn = open && (state.wagers || []).some(wager => wagerMatchesContest(wager, contest)
    && resolveWager(state, wager, allEventsOf(state)).status === "pending");
  const alternatives = gm && open && bracket && onPlayNext ? bracketOrder(bracket)
    .filter(([r, m]) => bracketMatchOpen(bracket, r, m) && (r !== contest.match[0] || m !== contest.match[1])) : [];
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
            onClick={() => act(async () => {
              const result = await onWinner({...reference,winner,qualifiers:[winner,...qualifiers]});
              if (result?.ok === true) onRecorded?.(sideName(winner));
              return result;
            })}>{pending ? "Saving…" : "Record winner"}</button>
        </div>}
      </div>}
    {!!alternatives.length && <div className="fd-contest-reorder">
      {alternatives.map(([r, m]) => {
        const label = `${ROUND_NAMES[bracket.size]?.[r] || `Round ${r + 1}`} · Match ${m + 1}`;
        return <button key={`${r}:${m}`} type="button" className="fd-contest-secondary" disabled={pending || blocked || chipsIn}
          onClick={() => act(() => onPlayNext({ ...reference, match:[r, m] }))}>Play {label} next</button>;
      })}
      {chipsIn && <p>Reorder once the chips on this match come off.</p>}
    </div>}
    {error && <div className="fd-contest-failure"><p role="alert" className="fd-contest-error">{error}</p>
      <button type="button" className="fd-contest-secondary" disabled={pending} onClick={() => act(retry.current)}>Retry</button></div>}
    {pending && running && !isFfa && <p className="fd-contest-saving" role="status">Saving result…</p>}
  </section>;
}

export function ContestPanel(props) {
  const { state, ev, gm, onResult, onUndo } = props;
  const operationBusy = useRef(false), [blocked, onBusy] = useState(false);
  /* the last one-tap winner, undoable for a few seconds */
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    if (!recent) return;
    const timer = setTimeout(() => setRecent(null), Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [recent]);
  const operations = { operationBusy, blocked, onBusy };
  if (state.results?.[ev.id] || state.shelved?.[ev.id] || state.frozen || ev.finale) return null;
  const onRecorded = gm && onUndo ? name => setRecent({ name, at:Date.now() }) : null;
  const undoRecent = recent && gm && onUndo
    ? <RecentWinner {...props} {...operations} name={recent.name} onDone={() => setRecent(null)} /> : null;
  /* while the quick Undo is up it is the one correction control shown */
  const correction = undoRecent ? null : <ContestCorrection {...props} {...operations} />;
  const lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  if (!contest || !["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase)) {
    return gm && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type)
      ? <>{undoRecent}<ContestFinish key={ev.id} onResult={onResult} {...operations} />{correction}</>
      : undoRecent;
  }
  return <>{undoRecent}<CurrentContest key={`${ev.id}:${contest.id}:${contest.revision}:${contest.phase}`} {...props} {...operations}
    contest={contest} onRecorded={onRecorded} />{correction}</>;
}

/* Runs one correction behind the shared busy guard. With no contest id it
   corrects the most recent recorded contest. */
function useCorrection({ state, ev, onUndo, operationBusy, onBusy }, after) {
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const busy = useRef(false);
  const run = async (contestId = null) => {
    if (busy.current || operationBusy.current) return;
    const undo = contestCorrectionAvailability(state,ev,contestId);
    busy.current = true; operationBusy.current = true; onBusy(true); setPending(true); setError("");
    try {
      const result = await onUndo({contestId:undo.contestId,contestRevision:undo.contestRevision});
      if (!result?.ok) setError(result?.error || "Change not saved. Try again.");
      else after?.();
    } catch (failure) { setError(failure?.message || "Change not saved. Try again."); }
    finally { busy.current = false; operationBusy.current = false; onBusy(false); setPending(false); }
  };
  return { pending, error, run };
}

function RecentWinner(props) {
  const { state, ev, name, blocked, onDone } = props;
  const undo = contestUndoAvailability(state, ev);
  const correction = useCorrection(props, onDone);
  if (!undo.enabled) return null;
  const moved = correctionText(state, undo);
  return <div className="fd-contest-recent" role="status">
    <span>Winner recorded: {name}{moved ? `. ${moved}` : ""}</span>
    <button type="button" disabled={correction.pending || blocked} onClick={() => correction.run()}>
      {correction.pending ? "Undoing…" : "Undo"}</button>
    {correction.error && <p role="alert" className="fd-contest-error">{correction.error}</p>}
  </div>;
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

/* Any recorded contest can be corrected. The most recent one keeps its
   "Correct previous result" control; earlier ones are named ("Correct
   Play-in 1") and rewind everything recorded after them. The confirm names
   what moves before anything does. */
function ContestCorrection(props) {
  const { state, ev, gm, onUndo, blocked } = props;
  const [confirming, setConfirming] = useState(null);
  const correction = useCorrection(props, () => setConfirming(null));
  const options = contestCorrections(state, ev);
  if (!gm || !onUndo || !options.length) return null;
  return <div className="fd-contest-correction">
    {options.map((option, index) => {
      const moved = correctionText(state, option);
      const label = correction.pending ? "Opening result…" : index === 0 ? "Correct previous result" : option.label;
      return <React.Fragment key={option.contestId}>
        {confirming === option.contestId && moved ? <div className="fd-contest-confirm">
          <p>{moved}</p>
          <button type="button" disabled={correction.pending || blocked || !option.enabled}
            onClick={() => correction.run(option.contestId)}>{label}</button>
          <button type="button" disabled={correction.pending} onClick={() => setConfirming(null)}>Keep it</button>
        </div> : <button type="button" disabled={correction.pending || blocked || !option.enabled}
          onClick={() => moved ? setConfirming(option.contestId) : correction.run(option.contestId)}>{label}</button>}
      </React.Fragment>;
    })}
    {!options[0].enabled && <p>{options[0].blocker}</p>}
    {correction.error && <p role="alert" className="fd-contest-error">{correction.error}</p>}
  </div>;
}
