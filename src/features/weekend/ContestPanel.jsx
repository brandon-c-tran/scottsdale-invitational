import React, { useEffect, useRef, useState } from "react";
import { disp, resolveCurrentContest, resolveEventLifecycle, contestCorrectionAvailability, contestCorrections,
  correctionText, contestStackOf, awardTable, allEventsOf, resolveWager, wagerMatchesContest, bracketOrder, bracketMatchOpen,
  resolveSlot, stageFinalists, stageEntrantView } from "../../../shared/core.js";
import { contestName } from "../../../shared/show.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { CompetitionBracket } from "./CompetitionBracket.jsx";
import { contestIsFinal, lastWinnerUndo } from "../director/directorPill.js";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { Podium, Socket, SeatUnit, podiumOrder } from "../results/PlacePicker.jsx";
import "./contest.css";
import { Icon } from "../../ui/Icon.jsx";

const nameOf = (state, side) => side.name || side.players.map(player => disp(state, player)).join(" & ");
/* A recorded winner can be taken back with one tap for this long. */
const UNDO_WINDOW_MS = 10000; // the pill offers the same window (director/DirectorPill.jsx)
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const placesPaid = ev => awardTable(ev).filter(pts => pts > 0).length;

function CurrentContest({ state, ev, contest, me, gm, onPlayer, onBets, onLock, onWinner, onResult, onPlayNext, onRecorded, operationBusy, onBusy, blocked }) {
  const [winner, setWinner] = useState(null), [qualifiers, setQualifiers] = useState([]);
  const [order, setOrder] = useState([]);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [picking, setPicking] = useState(null);
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
  const sideOf = key => contest.sides.find(item => item.key === key);
  const sideName = key => { const side = sideOf(key); return side ? nameOf(state, side) : ""; };
  const submit = payload => async () => {
    /* runs synchronously inside the winner tap, after the busy guard */
    tapTick();
    setPicking(payload.winner);
    try {
      const result = await onWinner({ ...reference, ...payload, ...(final ? { postResult:true } : {}) });
      if (result?.ok === true) onRecorded?.(sideName(payload.winner), !!result.extra?.posted, [...(sideOf(payload.winner)?.players || [])]);
      return result;
    } finally { setPicking(null); }
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
        onClick={() => act(() => onLock(reference))}>{pending ? "Starting…" : open ? "Lock and start" : "Start"}</button>}
      {!gm && onBets && <button type="button" className="fd-contest-primary" disabled={pending || blocked} onClick={onBets}>{open ? playing ? "Back yourself" : "Place chips" : "View bets"}</button>}
      {gm && running && isFfa && <button type="button" className="fd-contest-primary" disabled={pending || !onResult}
        onClick={() => act(async () => { const result = await onResult(); return result === true ? {ok:true} : result; })}>Enter result</button>}
    </div>
    {showEntrants && canChoose && winnerPicker({ state, ev, contest, me, advance, ordering, needed, winner, qualifiers, order,
      fullOrder, owed, picking, selectingQualifiers, pending, blocked, onPlayer, canRecord:!!onWinner,
      onPick:side => {
        if (busy.current || operationBusy.current) return;
        const place = order.indexOf(side.key);
        if (ordering) { setOrder(current => place >= 0 ? current.slice(0, place)
          : current.length < needed ? [...current, side.key] : current); return; }
        if (advance === 1) return record(side.key);
        if (!selectingQualifiers || winner === side.key) { setWinner(side.key); setQualifiers([]); return; }
        setQualifiers(current => current.includes(side.key) ? current.filter(key => key !== side.key)
          : current.length < advance - 1 ? [...current,side.key] : current);
      },
      onChangeWinner:() => { setWinner(null); setQualifiers([]); },
      onRecordQualifiers:() => act(submit({ winner, qualifiers:[winner, ...qualifiers] })),
      onStartOver:() => setOrder([]),
      onRecordOrder:() => act(submit({ winner:fullOrder[0], qualifiers:[fullOrder[0]], order:fullOrder })) })}
    {showEntrants && !canChoose && <div className="fd-contest-entrants" aria-label={contest.label}>
      {contest.sides.map(side => <div key={String(side.key)} className={`fd-contest-entrant ${side.players.includes(me) ? "is-you" : ""}`}>
        <span className="fd-contest-entrant-pick"><span>{nameOf(state, side)}</span></span>
        <div className="fd-contest-entrant-players">{side.players.map(player => <button key={player} type="button"
          onClick={() => onPlayer?.(player)} disabled={pending || blocked || !onPlayer} aria-label={`View ${disp(state, player)}'s player card`}>
          <Avatar state={state} p={player} size={28} /></button>)}</div>
      </div>)}
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
    {pending && running && !isFfa && <p className="fd-contest-saving fd-sr" role="status">Saving result</p>}
  </section>;
}

/* faces shrink as a side fills, so a team stays inside its frame */
const tileFace = count => count <= 1 ? 52 : count === 2 ? 40 : count <= 4 ? 34 : 30;
/* columns by count: a matchup faces itself across VS, four stand two by
   two, three and five or more stand three across */
const tileCols = count => count === 2 || count === 4 ? 2 : Math.min(3, count);

/* One side as one framed unit, the director pill's grammar: its faces
   (each opens that player's card, never records anything) over one filled
   winner button lettered with the side's name. The frame and the gap are
   inert, so a stray tap there does nothing. Called as a function, not
   mounted as a component, so its taps belong to the contest's render. */
function winnerTile({ state, side, me, label, verb, tone, picking, disabled, cardsOff, role, checked, pressed, onPick, onPlayer }) {
  const name = nameOf(state, side);
  return <div key={String(side.key)} className={`fd-contest-tile is-${tone}${side.players.includes(me) ? " is-you" : ""}${picking ? " is-picking" : ""}`}>
    <div className="fd-contest-tile-faces">
      {side.players.map(player => <button type="button" key={player} disabled={cardsOff}
        aria-label={`View ${disp(state, player)}'s player card`} onClick={() => onPlayer?.(player)}>
        <Avatar state={state} p={player} size={tileFace(side.players.length)} /></button>)}
    </div>
    <button type="button" className="fd-contest-tile-pick" disabled={disabled} role={role} aria-checked={checked}
      aria-pressed={pressed} aria-label={label} onClick={onPick}>
      <span className="fd-contest-tile-name">{name}</span>
      <span className="fd-contest-tile-verb" aria-hidden="true">{picking ? "Saving" : verb}</span>
    </button>
  </div>;
}

/* The commissioner's winner entry for the contest being played, one
   picture for every kind: a matchup's two sides across VS, a heat's field
   as framed tiles (one tap records the winner; a heat sending more than
   one through takes the winner, then the rest, then Record winner), and a
   stage final's paid places as the place picker's podium, tapped in order
   1st, 2nd, 3rd, then Record order. A function of the contest's render
   (its taps set the contest's own state), not a component. */
function winnerPicker({ state, ev, contest, me, advance, ordering, needed, winner, qualifiers, order, fullOrder, owed, picking,
  selectingQualifiers, pending, blocked, canRecord, onPlayer, onPick, onChangeWinner, onRecordQualifiers, onStartOver, onRecordOrder }) {
  const sides = contest.sides;
  const cols = tileCols(sides.length);
  const cardsOff = pending || blocked || !onPlayer;
  const tile = side => {
    const name = nameOf(state, side), selected = winner === side.key, qualifier = selectingQualifiers && !selected;
    const place = order.indexOf(side.key), checked = qualifiers.includes(side.key);
    if (ordering) return winnerTile({ state, side, me, onPlayer, cardsOff,
      tone:place >= 0 ? `placed is-place-${place}` : order.length < needed ? "order" : "idle",
      label:place >= 0 ? `Remove ${name} from ${ORD[place]}` : `${ORD[order.length]}: ${name}`,
      verb:place >= 0 ? <b className="fd-contest-tile-medal">{place + 1}</b> : order.length < needed ? ORD[order.length] : "",
      disabled:pending || blocked || place < 0 && order.length >= needed, pressed:place >= 0, onPick:() => onPick(side) });
    return winnerTile({ state, side, me, onPlayer, cardsOff,
      tone:selected ? "won" : qualifier ? checked ? "through" : "maybe" : "win", picking:picking === side.key,
      label:`${qualifier ? "Also advances" : "Winner"}: ${name}`,
      verb:selected ? "Winner" : qualifier ? <Icon name={checked ? "check" : "plus"} size={18} /> : <Icon name="trophy" size={18} />,
      disabled:pending || blocked, role:qualifier ? "checkbox" : undefined, checked:qualifier ? checked : undefined,
      pressed:advance > 1 && !qualifier ? selected : undefined, onPick:() => onPick(side) });
  };
  const grid = <div className={`fd-contest-picks is-cols-${cols}${sides.length === 2 ? " is-versus" : ""}`}>
    {sides.length === 2 ? [tile(sides[0]), <span key="vs" className="fd-contest-vs" aria-hidden="true">vs</span>, tile(sides[1])]
      : sides.map(tile)}
  </div>;
  if (ordering) {
    const table = awardTable(ev);
    const places = podiumOrder(Array.from({ length:needed }, (_, i) => i));
    return <div className="fd-contest-picker fd-pp" aria-label={contest.label}>
      <Podium columns={places.length}>{places.map(place => {
        const key = order[place], side = key === undefined ? null : sides.find(item => item.key === key);
        return <Socket key={place} name={`${ORD[place]} place`} place={place} amount={table[place] || 0}
          target={place === order.length} filled={!!side}>
          {side && <SeatUnit state={state} players={side.players} label={nameOf(state, side)} team={side.players.length > 1}
            unitKey={String(side.key)} />}
        </Socket>;
      })}</Podium>
      {grid}
      <div className="fd-contest-qualifier-actions">
        <button type="button" className="fd-contest-secondary" disabled={pending || !order.length} onClick={onStartOver}>Start over</button>
        <button type="button" className="fd-contest-primary" disabled={pending || !fullOrder || !canRecord} onClick={onRecordOrder}>
          {pending ? "Saving…" : fullOrder ? "Record order" : `Pick ${ORD[order.length]}`}</button>
      </div>
    </div>;
  }
  return <div className="fd-contest-picker" aria-label={contest.label}>
    {grid}
    {advance > 1 && selectingQualifiers && <div className="fd-contest-qualifier-actions">
      <button type="button" className="fd-contest-secondary" disabled={pending} onClick={onChangeWinner}>Change winner</button>
      <button type="button" className="fd-contest-primary" disabled={pending || qualifiers.length !== advance - 1 || !canRecord}
        onClick={onRecordQualifiers}>{pending ? "Saving…" : owed > 0 ? `Pick ${owed} more` : "Record winner"}</button>
    </div>}
  </div>;
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
  const onRecorded = gm && onUndo ? (name, posted, players = []) => setRecent({ name, posted, players, at:Date.now() }) : null;
  const undoRecent = showContest && recent && gm && onUndo
    ? <RecentWinner {...props} {...operations} recent={recent} onDone={() => setRecent(null)} /> : null;
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

/* The winner just recorded, the pill's grammar: their faces and name with
   WON stamped on as the write lands, Undo beside it while the window
   drains along the foot. What the take-back would move reads under it. */
function RecentWinner(props) {
  const { state, ev, recent, blocked, onDone } = props;
  const reduced = useReducedMotion();
  const undo = lastWinnerUndo(state, ev);
  const correction = useCorrection(props, onDone);
  if (!undo.enabled) return null;
  const moved = correctionText(state, undo);
  const left = Math.max(0, recent.at + UNDO_WINDOW_MS - Date.now());
  return <div className={`fd-contest-recent${reduced ? " is-still" : ""}`} role="status">
    <div className="fd-contest-recent-row">
      {recent.players?.length > 0 && <span className="fd-contest-recent-faces" aria-hidden="true">
        {recent.players.slice(0, 3).map(player => <Avatar key={player} state={state} p={player} size={32} />)}</span>}
      <span className="fd-contest-recent-name">{recent.name}</span>
      <b className="fd-contest-stamp" aria-label={recent.posted ? "Won. Result posted" : "Won"}>Won</b>
      <button type="button" disabled={correction.pending || blocked} onClick={() => correction.run()}>
        <Icon name="undo" size={16} />{correction.pending ? "Undoing" : "Undo"}</button>
    </div>
    {moved && <p className="fd-contest-recent-note">{moved}</p>}
    {correction.error && <p role="alert" className="fd-contest-error">{correction.error}</p>}
    <span className="fd-contest-recent-drain" aria-hidden="true"
      style={{ "--undo-total":`${UNDO_WINDOW_MS}ms`, "--undo-elapsed":`${left - UNDO_WINDOW_MS}ms` }} />
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
