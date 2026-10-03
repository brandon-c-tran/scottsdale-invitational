import React, { useEffect, useRef, useState } from "react";
import { disp, resolveCurrentContest, resolveEventLifecycle, contestCorrectionAvailability, contestCorrections,
  correctionText, contestStackOf, awardTable, allEventsOf, resolveWager, wagerMatchesContest, bracketOrder, bracketMatchOpen,
  resolveSlot, stageFinalists, stageEntrantView } from "../../../shared/core.js";
import { contestName } from "../../../shared/show.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { CompetitionBracket } from "./CompetitionBracket.jsx";
import { contestIsFinal, lastWinnerUndo } from "../director/directorPill.js";
import { tapTick } from "../../lib/haptics.js";
import "./contest.css";
import { Icon } from "../../ui/Icon.jsx";

const nameOf = (state, side) => side.name || side.players.map(player => disp(state, player)).join(" & ");
/* A recorded winner can be taken back with one tap for this long. */
const UNDO_WINDOW_MS = 5000;
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const placesPaid = ev => awardTable(ev).filter(pts => pts > 0).length;

function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, onPlayNext, onRecorded, operationBusy, onBusy, blocked }) {
  const [winner, setWinner] = useState(null), [qualifiers, setQualifiers] = useState([]);
  const [order, setOrder] = useState([]);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const busy = useRef(false), retry = useRef(null);
  const open = contest.phase === "betting-open", locked = contest.phase === "betting-locked";
  const running = contest.phase === "in-progress" || contest.phase === "awaiting-result";
  const isFfa = contest.kind === "ffa", isBracket = contest.kind === "match";
  const advance = contest.kind === "heat" ? state.stages?.[ev.id]?.advance || 1 : 1;
  const reference = { contestId:contest.id, contestRevision:contest.revision };
  const final = contestIsFinal(state, ev, contest);
  /* a stage final of three or more records its paid places in finish order */
  const needed = Math.min(placesPaid(ev), contest.sides.length);
  const ordering = gm && contest.kind === "stage-final" && contest.sides.length >= 3 && needed >= 2;
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
  const submit = payload => async () => {
    /* runs synchronously inside the winner tap, after the busy guard */
    tapTick();
    const result = await onWinner({ ...reference, ...payload, ...(final ? { postResult:true } : {}) });
    if (result?.ok === true) onRecorded?.(sideName(payload.winner), !!result.extra?.posted);
    return result;
  };
  const record = key => act(submit({ winner:key, qualifiers:[key] }));
  const selectingQualifiers = advance > 1 && winner !== null;
  const unplaced = contest.sides.filter(side => !order.includes(side.key));
  const fullOrder = order.length >= needed ? order.slice(0, needed)
    : order.length === needed - 1 && unplaced.length === 1 ? [...order, unplaced[0].key] : null;
  /* another seated matchup can go first while this market is empty */
  const bracket = isBracket ? state.brackets?.[ev.id] : null;
  const chipsIn = open && (state.wagers || []).some(wager => wagerMatchesContest(wager, contest)
    && resolveWager(state, wager, allEventsOf(state)).status === "pending");
  const alternatives = gm && open && bracket && onPlayNext ? bracketOrder(bracket)
    .filter(([r, m]) => bracketMatchOpen(bracket, r, m) && (r !== contest.match[0] || m !== contest.match[1])) : [];
  const canChoose = gm && running && !!onWinner;
  /* the winner targets are their own rows; the bracket stays a picture */
  const showEntrants = !isFfa && (!isBracket || canChoose);
  /* no instruction line: each pick shows the place it will take, and the
     record button counts what is still owed */
  const owed = selectingQualifiers ? advance - 1 - qualifiers.length : 0;
  /* the sheet's title already names the event: the contest heads itself
     only when it is a part of it (a match, a heat). Your place in it reads
     first: playing, and what you have on it. */
  const heading = isBracket ? contestName(state, ev, contest) : contest.label && contest.label !== ev.name ? contest.label : null;
  const playing = !!me && !!contest.players?.includes(me);
  const yourBet = me ? (state.wagers || []).filter(wager => wager.player === me && wagerMatchesContest(wager, contest)
    && resolveWager(state, wager, allEventsOf(state)).status === "pending").reduce((sum, wager) => sum + (wager.stake || 0), 0) : 0;
  return <section className="fd-contest" aria-label="Current contest" aria-busy={pending}>
    <div className="fd-contest-toolbar">
      <div>{heading && <strong>{heading}</strong>}
        <span>{(open || running) && <i className="fd-beat-dot" aria-hidden="true" />}{open ? "Betting open" : locked ? "Betting locked" : running ? "In progress" : "Next contest"}</span>
        {!gm && (playing || yourBet > 0) && <span className="fd-contest-you">{playing && <span>You’re playing</span>}
          {yourBet > 0 && <b aria-label={`Your bet ${yourBet.toLocaleString("en-US")}`}><i className="fd-contest-chip" aria-hidden="true" />{yourBet.toLocaleString("en-US")}</b>}</span>}</div>
      {gm && (open || locked) && <button type="button" className="fd-contest-primary" disabled={pending || blocked || !onLock}
        onClick={() => act(() => onLock(reference))}>{pending ? "Starting…" : "Lock bets and start"}</button>}
      {!gm && onBets && <button type="button" className="fd-contest-primary" disabled={pending || blocked} onClick={onBets}>{open ? playing ? "Back yourself" : "Place chips" : "View bets"}</button>}
      {gm && running && isFfa && <button type="button" className="fd-contest-primary" disabled={pending || !onResult}
        onClick={() => act(async () => { const result = await onResult(); return result === true ? {ok:true} : result; })}>Enter result</button>}
    </div>
    {showEntrants && <div className="fd-contest-entrants" aria-label={contest.label}>
      {contest.sides.map(side => {
        const name = nameOf(state, side), selected = winner === side.key;
        const qualifier = selectingQualifiers && !selected;
        const place = order.indexOf(side.key);
        const label = !canChoose ? name
          : ordering ? place >= 0 ? `Remove ${name} from ${ORD[place]}` : `${ORD[order.length]}: ${name}`
            : `${qualifier ? "Also advances" : "Winner"}: ${name}`;
        return <div key={String(side.key)} className={`fd-contest-entrant ${side.players.includes(me) ? "is-you" : ""} ${selected || place === 0 ? "is-winner" : ""}`}>
          <button type="button" className="fd-contest-entrant-pick" disabled={pending || blocked || !canChoose
              || ordering && place < 0 && order.length >= needed}
            role={canChoose && qualifier ? "checkbox" : undefined} aria-checked={canChoose && qualifier ? qualifiers.includes(side.key) : undefined}
            aria-pressed={canChoose && (ordering ? place >= 0 : advance > 1 && !qualifier ? selected : undefined)}
            aria-label={label}
            onClick={() => {
              if (busy.current || operationBusy.current || !canChoose) return;
              if (ordering) { setOrder(current => place >= 0 ? current.slice(0, place)
                : current.length < needed ? [...current, side.key] : current); return; }
              if (advance === 1) return record(side.key);
              if (!selectingQualifiers || selected) { setWinner(side.key); setQualifiers([]); return; }
              setQualifiers(current => current.includes(side.key) ? current.filter(key => key !== side.key)
                : current.length < advance - 1 ? [...current,side.key] : current);
            }}>
            <span>{name}</span>{canChoose && <small>{ordering ? place >= 0 ? ORD[place] : order.length < needed ? ORD[order.length] : ""
              : selected ? "Winner" : qualifier ? <Icon name={qualifiers.includes(side.key) ? "check" : "plus"} size="1em" /> : "Win"}</small>}
          </button>
          <div className="fd-contest-entrant-players">{side.players.map(player => <button key={player} type="button"
            onClick={() => onPlayer?.(player)} disabled={pending || blocked || !onPlayer} aria-label={`View ${disp(state, player)}'s player card`}>
            <Avatar state={state} p={player} size={28} /></button>)}</div>
        </div>;
      })}
      {canChoose && advance > 1 && selectingQualifiers && <div className="fd-contest-qualifier-actions">
        <button type="button" className="fd-contest-secondary" disabled={pending} onClick={() => { setWinner(null);setQualifiers([]); }}>Change winner</button>
        <button type="button" className="fd-contest-primary" disabled={pending || qualifiers.length !== advance - 1 || !onWinner}
          onClick={() => act(submit({ winner, qualifiers:[winner, ...qualifiers] }))}>{pending ? "Saving…" : owed > 0 ? `Pick ${owed} more` : "Record winner"}</button>
      </div>}
      {canChoose && ordering && <div className="fd-contest-qualifier-actions">
        <button type="button" className="fd-contest-secondary" disabled={pending || !order.length} onClick={() => setOrder([])}>Start over</button>
        <button type="button" className="fd-contest-primary" disabled={pending || !fullOrder}
          onClick={() => act(submit({ winner:fullOrder[0], qualifiers:[fullOrder[0]], order:fullOrder }))}>
          {pending ? "Saving…" : fullOrder ? "Record order" : `Pick ${ORD[order.length]}`}</button>
      </div>}
    </div>}
    {isBracket && <CompetitionBracket state={state} ev={ev} me={me} gm={gm} pending={pending || blocked} onPlayer={onPlayer}
      pickable={false} />}
    {!!alternatives.length && <div className="fd-contest-reorder">
      {alternatives.map(([r, m]) => {
        const label = contestName(state, ev, { kind:"match", match:[r, m] });
        return <button key={`${r}:${m}`} type="button" className="fd-contest-secondary" disabled={pending || blocked || chipsIn}
          onClick={() => act(() => onPlayNext({ ...reference, match:[r, m] }))}>Play {label} next</button>;
      })}
      {chipsIn && <p>Chips are on this match.</p>}
    </div>}
    {error && <div className="fd-contest-failure"><p role="alert" className="fd-contest-error">{error}</p>
      <button type="button" className="fd-contest-secondary" disabled={pending} onClick={() => act(retry.current)}>Retry</button></div>}
    {pending && running && !isFfa && <p className="fd-contest-saving" role="status">Saving result…</p>}
  </section>;
}

/* The busy guard and the last one-tap winner, shared by every part of one
   contest's controls. The event sheet holds it so the commissioner's part
   (finish, corrections) can sit apart from the contest itself. */
export function useContestOperations() {
  const operationBusy = useRef(false), [blocked, onBusy] = useState(false);
  /* the last one-tap winner, undoable for a few seconds */
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    if (!recent) return;
    const timer = setTimeout(() => setRecent(null), Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [recent]);
  return { operationBusy, blocked, onBusy, recent, setRecent };
}

/* part: "contest" renders the contest (and the quick Undo); "commissioner"
   renders posting the result and the corrections; omitted renders both, in
   that order. Pass the same `operations` to both parts. */
export function ContestPanel(props) {
  const { state, ev, gm, onResult, onUndo, part = null } = props;
  const own = useContestOperations();
  const { operationBusy, blocked, onBusy, recent, setRecent } = props.operations || own;
  const operations = { operationBusy, blocked, onBusy };
  const showContest = part !== "commissioner", showDesk = part !== "contest";
  const onRecorded = gm && onUndo ? (name, posted) => setRecent({ name, posted, at:Date.now() }) : null;
  const undoRecent = showContest && recent && gm && onUndo
    ? <RecentWinner {...props} {...operations} name={recent.name} posted={recent.posted} onDone={() => setRecent(null)} /> : null;
  /* a final that posted the result keeps its Undo for the same few seconds */
  if (state.results?.[ev.id] || state.shelved?.[ev.id] || state.frozen || ev.finale) return undoRecent;
  /* while the quick Undo is up it is the one correction control shown */
  const correction = recent || !showDesk ? null : <ContestCorrection {...props} {...operations} />;
  const lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  if (!contest || !["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase)) {
    return gm && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type)
      ? <>{undoRecent}{showDesk && <ContestFinish key={ev.id} onResult={onResult} {...operations} />}{correction}</>
      : undoRecent;
  }
  return <>{undoRecent}{showContest && <CurrentContest key={`${ev.id}:${contest.id}:${contest.revision}:${contest.phase}`} {...props} {...operations}
    contest={contest} onRecorded={onRecorded} />}{correction}</>;
}

/* Runs one correction behind the shared busy guard. With no contest id it
   corrects the most recent recorded contest. */
function useCorrection({ state, ev, onUndo, operationBusy, onBusy }, after) {
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const busy = useRef(false);
  const run = async (contestId = null) => {
    if (busy.current || operationBusy.current) return;
    /* no id: the most recent winner, including a final that posted the result */
    const undo = contestId ? contestCorrectionAvailability(state, ev, contestId) : lastWinnerUndo(state, ev);
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
  const { state, ev, name, posted, blocked, onDone } = props;
  const undo = lastWinnerUndo(state, ev);
  const correction = useCorrection(props, onDone);
  if (!undo.enabled) return null;
  const moved = correctionText(state, undo);
  return <div className="fd-contest-recent" role="status">
    <span>Winner recorded: {name}{posted ? ". Result posted" : ""}{moved ? `. ${moved}` : ""}</span>
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

/* A recorded contest by its real name, its sides, and who won it. */
export function lastContestView(state, ev, last) {
  if (!last) return null;
  const draw = state.draws?.[ev.id], stages = state.stages?.[ev.id];
  const team = key => draw?.teams?.[key]?.players || [];
  const players = key => last.kind === "match" ? team(key) : stages ? stageEntrantView(state, stages, key).players : [];
  const named = key => players(key).map(player => disp(state, player)).join(" & ");
  let keys = [];
  if (last.kind === "match") {
    const match = state.brackets?.[ev.id]?.rounds?.[last.match?.[0]]?.[last.match?.[1]];
    if (match) keys = [resolveSlot(state.brackets[ev.id], match.a), resolveSlot(state.brackets[ev.id], match.b)];
  } else if (last.kind === "heat") keys = stages?.groups?.[last.group]?.entrants || [];
  else keys = (stages && stageFinalists(stages)) || [];
  const sides = keys.filter(key => key !== null && key !== undefined).map(named);
  return { name:contestName(state, ev, { kind:last.kind, match:last.match, group:last.group }),
    matchup:sides.length === 2 ? sides.join(" vs ") : sides.join(", "), winner:named(last.winner) };
}

/* Any recorded contest can be corrected, newest first: "Fix Play-in 1".
   The confirm names the teams, who loses the win, and everything else the
   write moves (later contests rewound, chips returned, duels voided). */
function ContestCorrection(props) {
  const { state, ev, gm, onUndo, blocked } = props;
  const [confirming, setConfirming] = useState(null);
  const correction = useCorrection(props, () => setConfirming(null));
  const options = contestCorrections(state, ev);
  if (!gm || !onUndo || !options.length) return null;
  const stack = contestStackOf(state, ev.id);
  return <div className="fd-contest-correction">
    {options.map(option => {
      const view = lastContestView(state, ev, stack.find(entry => entry.id === option.contestId));
      const name = view?.name || option.contest;
      const moved = correctionText(state, option);
      return <React.Fragment key={option.contestId}>
        {confirming === option.contestId ? <div className="fd-contest-confirm">
          <p>Reopens {name}{view?.matchup ? `: ${view.matchup}` : ""}.{view?.winner ? ` ${view.winner} loses the win.` : ""}
            {moved ? ` ${moved}` : ""}</p>
          <button type="button" disabled={correction.pending || blocked || !option.enabled}
            onClick={() => correction.run(option.contestId)}>{correction.pending ? "Undoing…" : `Reopen ${name}`}</button>
          <button type="button" disabled={correction.pending} onClick={() => setConfirming(null)}>Keep it</button>
        </div> : <button type="button" disabled={correction.pending || blocked || !option.enabled}
          onClick={() => setConfirming(option.contestId)}>Fix {name}</button>}
      </React.Fragment>;
    })}
    {!options[0].enabled && <p>{options[0].blocker}</p>}
    {correction.error && <p role="alert" className="fd-contest-error">{correction.error}</p>}
  </div>;
}
