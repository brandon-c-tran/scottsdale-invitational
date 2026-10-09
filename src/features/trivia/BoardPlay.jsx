import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dispatch } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { freshFrameNow, playSound, unlockSound } from "../../lib/sound.js";
import { disp } from "../../../shared/core.js";
import { BUZZ_LOCKOUT_MS, BOARD_PICK_MS, DD_STING_MS } from "../../../shared/triviaBoard.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { Wheel } from "../geo/Wheel.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { writeError } from "../../lib/writeErrors.js";
import { LETTERS, ordinal, triviaPhotoSrc } from "./triviaModel.js";
import {
  ANSWER_EARLY_MS, DD_RANGE, FINAL_RANGE, boardScreen, boardView, buzzReaction, buzzerState, columnNameSize, ddWagerUntil,
  finalSteps, fmtPoints, fmtReaction, nextBoardInstant, signedPoints, turnState, wagerItems,
} from "./boardModel.js";
import "../geo/geo.css";
import "./trivia.css";
import "./board.css";

/* the board's writes, each retried once with the same action id */
export const sendBoard = (type, payload) => dispatch(type, payload, { retry:true });
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* the phone's clock for the board: the server clock, woken on the
   instants the view changes by itself (the buzzer lighting on the beat) */
function useBoardNow(state, me, fixed) {
  const [, wake] = useState(0);
  const now = fixed ?? serverNow();
  const next = fixed === undefined ? nextBoardInstant(boardView(state, me, now), now) : 0;
  useEffect(() => {
    if (!next) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, next - serverNow()) + 5);
    return () => clearTimeout(timer);
  }, [next]);
  return now;
}
/* wake once at a local server instant (a lockout ending) */
function useWakeAt(at) {
  const [, wake] = useState(0);
  useEffect(() => {
    if (!at) return undefined;
    const wait = at - serverNow();
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), wait + 5);
    return () => clearTimeout(timer);
  }, [at]);
}

/* what is left of a window, draining on the server clock */
function Drain({ from, until, now, tone = "live", className = "" }) {
  const total = Math.max(1, until - from);
  const left = useRef(null);
  if (left.current === null) left.current = Math.max(0, Math.min(total, until - now));
  return <i className={`fd-board-drain is-${tone} ${className}`} aria-hidden="true"
    style={{ "--drain-left":(left.current / total).toFixed(4), "--drain-ms":`${Math.round(left.current)}ms`,
      "--drain-low":`${Math.max(0, Math.round(left.current - Math.min(3000, total * 0.25)))}ms` }} />;
}

/* the category and what it is worth, over every clue screen */
function ClueHead({ view }) {
  return <div className="fd-board-cluehead">
    <span className="fd-board-cat">{view.columnName}</span>
    {view.dd && <span className="fd-board-dd-tag">Daily Double</span>}
    <b className="fd-board-val">{fmtPoints(view.dd && view.wager !== null ? view.wager : view.value)}</b>
  </div>;
}

/* ── the pick ── */
/* The board as a grid of cells, the column names over it. Yours to pick:
   every lit value is a button. Someone else's: the board small and still. */
function PickGrid({ view, onPick, pending, mine }) {
  const n = Math.max(1, view.columns.length);
  const width = Math.floor(358 / n) - 6;
  /* one size for every column's name, the longest word's */
  const size = Math.min(...view.columns.map(column => columnNameSize(column.name, width)));
  return <div className={`fd-board-grid${mine ? " is-mine" : ""}`} style={{ "--cols":n }}>
    {view.columns.map(column => <span key={column.col} className="fd-board-colname" style={{ fontSize:size }}>{column.name}</span>)}
    {Array.from({ length:view.rows }, (_, row) => view.columns.map(column => {
      const cell = column.cells[row];
      if (!cell) return <span key={`${column.col}:${row}`} className="fd-board-cell is-empty" aria-hidden="true" />;
      if (cell.played || !mine) return <span key={cell.id} className={`fd-board-cell${cell.played ? " is-played" : ""}`}
        aria-label={cell.played ? undefined : `${column.name} ${cell.value}`}>{!cell.played && fmtPoints(cell.value)}</span>;
      return <button key={cell.id} type="button" className={`fd-board-cell is-live${pending === cell.id ? " is-pending" : ""}`}
        disabled={!!pending} onClick={() => onPick(cell.id)} aria-label={`${column.name} ${cell.value}`}>{fmtPoints(cell.value)}</button>;
    }))}
  </div>;
}
function Pick({ state, view, me, onAct, now }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const mine = view.playing && view.control === me;
  const pick = async id => {
    if (pending) return;
    tapTick(); unlockSound();
    playSound("S18", { bus:"you" });
    setPending(id); setError("");
    const result = await onAct("boardPick", { clueId:id });
    if (result?.ok !== true && !result?.uncertain) { setError(writeError(result)); setPending(null); playSound("S26", { bus:"you" }); }
  };
  const pickAt = Number(view.game.pickAt) || 0;
  return <main className="fd-board-body is-pick">
    {mine ? <div className="fd-board-turnlamp"><i className="fd-insert fd-board-lamp" aria-hidden="true" /><span>Your pick</span></div>
      : view.control && <div className="fd-board-picker">
        <ChipFace p={view.control} size={44} />
        <span className="fd-board-picker-name">{disp(state, view.control)}</span>
        <span className="fd-board-turnlamp is-quiet"><i className="fd-insert fd-board-lamp" aria-hidden="true" /><span>Picks</span></span>
      </div>}
    <div className={`fd-board-gridwrap${mine ? " is-mine" : ""}`}>
      <PickGrid view={view} onPick={pick} pending={pending} mine={mine} />
      {mine && pickAt > 0 && <Drain from={pickAt} until={pickAt + BOARD_PICK_MS} now={now} className="is-grid" />}
    </div>
    {error && <p className="fd-board-error" role="alert">{error}</p>}
  </main>;
}

/* ── the buzzer ── */
/* One big arcade button under glass. Dark until the buzzers arm on the
   server clock; a tap before that locks it out (a shake, a dead thunk).
   At the arm it lights, and the reaction is timed from the frame that
   painted it lit; the tap sends at once. Latched down once you are in. */
export function Buzzer({ view, onBuzz, now }) {
  const [lockUntil, setLockUntil] = useState(0);
  const [sent, setSent] = useState(null);
  const [shake, setShake] = useState(0);
  const painted = useRef({ perf:null, server:null });
  useWakeAt(lockUntil);
  const mine = view.myBuzz || sent;
  const state = buzzerState({ armAt:view.armAt, now, lockoutUntil:lockUntil, buzzed:!!mine, open:view.phase === "clue" });
  /* the reaction clock starts on the frame that paints the lit buzzer */
  const live = state === "live";
  useIso(() => {
    if (!live) return undefined;
    painted.current = { perf:null, server:null };
    const raf = requestAnimationFrame(() => { painted.current = { perf:performance.now(), server:serverNow() }; });
    return () => cancelAnimationFrame(raf);
  }, [live, view.clueId]);
  const press = event => {
    event.preventDefault?.();
    if (state === "in" || state === "closed") return;
    tapTick(); unlockSound();
    if (state === "off" || state === "locked") {
      setLockUntil(serverNow() + BUZZ_LOCKOUT_MS);
      setShake(n => n + 1);
      playSound("buzzDead", { bus:"you" });
      return;
    }
    const ms = buzzReaction({ paintedAt:painted.current.perf, paintedServer:painted.current.server, tapAt:performance.now(),
      tapServer:serverNow(), armAt:view.armAt });
    setSent({ ms });
    playSound("buzzPress", { bus:"you" });
    onBuzz({ clueId:view.clueId, ms });
  };
  const label = { off:"Buzzer, not live yet", locked:"Buzzer locked", live:"Buzz", in:"In", closed:"Buzzers closed" }[state];
  return <div className={`fd-buzzer is-${state}`}>
    <button type="button" className="fd-buzzer-button" onPointerDown={press} onClick={event => event.preventDefault()}
      aria-label={label} aria-pressed={state === "in"} key={`shake-${shake}`}>
      <svg className="fd-buzzer-bulbs" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="141" pathLength="36" className="is-off" />
        <circle cx="150" cy="150" r="141" pathLength="36" className="is-on" />
      </svg>
      <span className="fd-buzzer-bezel" aria-hidden="true">
        <span className="fd-buzzer-skirt" />
        <span className="fd-buzzer-cap"><span className="fd-buzzer-glint" /></span>
      </span>
    </button>
    <div className="fd-buzzer-under" aria-live="polite">
      {state === "in" && <b className="fd-buzzer-ms">{fmtReaction(mine?.ms)}</b>}
    </div>
  </div>;
}

function BuzzScreen({ state, view, me, onAct, now }) {
  const [error, setError] = useState("");
  const buzz = async payload => {
    const result = await onAct("boardBuzz", payload);
    if (result?.ok !== true && !result?.uncertain) setError(writeError(result));
  };
  return <main className="fd-board-body is-buzz">
    <ClueHead view={view} />
    {view.playing ? <Buzzer key={view.clueId} view={view} onBuzz={buzz} now={now} />
      : <InRow state={state} view={view} />}
    {error && <p className="fd-board-error" role="alert">{error}</p>}
  </main>;
}
/* who is in, as they buzz (a spectator's view of the buzzers) */
function InRow({ state, view }) {
  return <ul className="fd-board-in" aria-label={`${view.buzzedIn.length} in`}>
    {view.players.filter(player => !state.away?.[player]).map(player =>
      <li key={player} className={view.buzzes[player] ? "is-in" : ""}><ChipFace p={player} size={30} /></li>)}
  </ul>;
}

/* ── the answer ── */
/* the order as it stands: fastest first, yours lit, the struck out */
function OrderStrip({ state, view, me }) {
  const tried = new Map(view.attempts.map(attempt => [attempt.player, attempt]));
  return <ol className="fd-board-order">
    {view.order.map(row => {
      const attempt = tried.get(row.player);
      return <li key={row.player} className={`${row.player === me ? "is-mine" : ""}${view.answering === row.player && !attempt ? " is-on" : ""}${
        attempt && !attempt.right ? " is-struck" : ""}${attempt?.right ? " is-right" : ""}`}>
        <span className="fd-board-place">{row.place}</span>
        <ChipFace p={row.player} size={32} />
        <span className="fd-board-order-name">{row.player === me ? "You" : disp(state, row.player)}</span>
        <span className="fd-board-ms">{fmtReaction(row.ms)}</span>
      </li>;
    })}
  </ol>;
}

/* the four answers: yours to tap on your turn; otherwise they strike as
   they go, and the right one stamps on the reveal */
function Options({ view, onChoose, live = false, chosen = null, revealed = false }) {
  const options = view.clue?.options || [];
  return <ol className={`fd-board-options${live ? " is-live" : ""}`}>
    {options.map((option, i) => {
      const struck = view.struck.has(i);
      const right = revealed && view.answer === i;
      const cls = ["fd-board-option", struck && "is-struck", right && "is-right", chosen === i && "is-chosen",
        revealed && !right && "is-out"].filter(Boolean).join(" ");
      return <li key={i}><button type="button" className={cls} disabled={!live || struck || chosen !== null}
        onClick={() => onChoose?.(i)} aria-pressed={chosen === i}>
        <span className="fd-board-letter" aria-hidden="true">{right ? <Icon name="check" size={20} /> : LETTERS[i]}</span>
        <span className="fd-board-option-text">{typeof option === "string" ? option : <><b>{option?.title}</b><small>{option?.artist}</small></>}</span>
      </button></li>;
    })}
  </ol>;
}

function Answer({ state, view, me, onAct, now }) {
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState("");
  const turn = turnState(view, now);
  const live = turn === "live";
  useEffect(() => { setChosen(null); setError(""); }, [view.clueId, view.turn]);
  const choose = async i => {
    if (!live || chosen !== null) return;
    tapTick(); unlockSound();
    playSound("S18", { bus:"you" });
    setChosen(i); setError("");
    const result = await onAct("boardAnswer", { clueId:view.clueId, choice:i });
    if (result?.ok !== true && !result?.uncertain) { setError(writeError(result)); setChosen(null); playSound("S26", { bus:"you" }); }
  };
  return <main className={`fd-board-body is-answer${live ? " is-live" : ""}`}>
    <div className="fd-board-prompt">
      <ClueHead view={view} />
      {!view.dd && view.order.length > 1 && <OrderStrip state={state} view={view} me={me} />}
    </div>
    {/* the answers dock at the foot, in the thumb's reach, lit while yours */}
    <div className={`fd-board-dock${live ? " is-live" : ""}`}>
      <div className="fd-board-yourturn">
        <span className="fd-board-turnlamp"><i className="fd-insert fd-board-lamp" aria-hidden="true" /><span>Your turn</span></span>
        {view.turnAt > 0 && <Drain key={`${view.clueId}:${view.turn}`} from={view.turnAt} until={view.turnEnd} now={now} className="is-turn" />}
      </div>
      <Options view={view} onChoose={choose} live={live} chosen={chosen} />
      {error && <p className="fd-board-error" role="alert">{error}</p>}
    </div>
  </main>;
}

function AnswerWatch({ state, view, me, now }) {
  const on = view.answering;
  return <main className="fd-board-body is-watch">
    <div className="fd-board-prompt">
      <ClueHead view={view} />
      {on && <div className="fd-board-answerer">
        <ChipFace p={on} size={56} />
        <span className="fd-board-answerer-name">{disp(state, on)}</span>
        {view.turnAt > 0 && now >= view.turnAt - ANSWER_EARLY_MS && <Drain key={`${view.clueId}:${view.turn}`} from={view.turnAt}
          until={view.turnEnd} now={now} className="is-turn" />}
      </div>}
      {!view.dd && view.order.length > 0 && <OrderStrip state={state} view={view} me={me} />}
    </div>
    <Options view={view} />
  </main>;
}

/* the reveal: the right answer, and what it did to your score */
function Reveal({ state, view, me }) {
  const mine = view.attempts.filter(attempt => attempt.player === me);
  const delta = mine.reduce((sum, attempt) => sum + (attempt.right ? view.stake : -view.stake), 0);
  const fresh = useRef(freshFrameNow()).current;
  useEffect(() => {
    if (!fresh || !mine.length) return;
    playSound(delta > 0 ? "boardRight" : "boardWrong", { bus:"you" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* what it did to you; your score itself rolls in the header */
  return <main className="fd-board-body is-reveal">
    <ClueHead view={view} />
    {mine.length > 0 && <div className={`fd-board-delta ${delta > 0 ? "is-up" : "is-down"}`}>
      <b>{delta > 0 ? "+" : "−"}{fmtPoints(Math.abs(delta))}</b>
    </div>}
    {!mine.length && view.winner && <div className="fd-board-answerer is-won">
      <ChipFace p={view.winner} size={56} />
      <span className="fd-board-answerer-name">{disp(state, view.winner)}</span>
      <b className="fd-board-gain">+{fmtPoints(view.stake)}</b>
    </div>}
    <Options view={view} revealed />
  </main>;
}

/* ── wagers: the Daily Double's and the Final's, on a wheel ── */
function WagerWheel({ range, onLock, locked = null, children }) {
  const [value, setValue] = useState(range.start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const items = wagerItems(range.min, range.max);
  const lock = async () => {
    if (busy || locked !== null) return;
    tapTick(); unlockSound();
    setBusy(true); setError("");
    const result = await onLock(value);
    setBusy(false);
    if (result?.ok) playSound("stamp", { bus:"you" });
    else if (!result?.uncertain) { setError(writeError(result)); playSound("S26", { bus:"you" }); }
  };
  if (locked !== null) return <div className="fd-board-wager is-locked">
    {children}
    <div className="fd-board-wager-reel"><ScoreReel value={locked} drum tone="chip" label={fmtPoints(locked)} /></div>
    <div className="fd-board-primary is-done"><Icon name="lock" size={18} />Locked</div>
  </div>;
  return <div className="fd-board-wager">
    {children}
    <div className="fd-board-wheel">
      <Wheel items={items} value={value} onChange={setValue} label="Wager" className="fd-board-wheel-drum" />
      <div className="fd-board-wheel-ends">
        <button type="button" onClick={() => { tapTick(); setValue(range.min); }} disabled={busy}>{fmtPoints(range.min)}</button>
        <button type="button" onClick={() => { tapTick(); setValue(range.max); }} disabled={busy}>{fmtPoints(range.max)}</button>
      </div>
    </div>
    {error && <p className="fd-board-error" role="alert">{error}</p>}
    <button type="button" className="fd-board-primary" disabled={busy} onClick={lock}>{busy ? "Locking" : "Lock in"}</button>
  </div>;
}

function DailyDouble({ state, view, me, onAct, now }) {
  const mine = view.picker === me;
  const sting = now < view.pickedAt + DD_STING_MS;
  return <main className="fd-board-body is-dd">
    <div className={`fd-board-dd${sting ? " is-sting" : ""}`}>
      <span className="fd-board-dd-word">Daily Double</span>
      <span className="fd-board-cat">{view.columnName}</span>
    </div>
    {mine ? <WagerWheel key={view.clueId} range={DD_RANGE(view)} locked={view.wager !== null && view.wagerAt ? view.wager : null}
      onLock={wager => onAct("boardWager", { wager })}>
      {ddWagerUntil(view) > now && view.wagerAt === 0 && <Drain from={view.pickedAt + DD_STING_MS} until={ddWagerUntil(view)} now={now}
        tone="chip" className="is-wager" />}
    </WagerWheel>
      : <div className="fd-board-answerer is-dd">
        <ChipFace p={view.picker} size={72} />
        <span className="fd-board-answerer-name">{disp(state, view.picker)}</span>
        {view.wager !== null && view.wagerAt > 0 && <div className="fd-board-wager-reel is-small"><ScoreReel value={view.wager} tone="chip"
          label={fmtPoints(view.wager)} /></div>}
      </div>}
  </main>;
}

/* ── the Final ── */
function FinalHead({ view }) {
  return <div className="fd-board-finalhead">
    <span className="fd-board-turnlamp is-chip"><i className="fd-insert fd-board-lamp" aria-hidden="true" /><span>Final</span></span>
    <span className="fd-board-final-cat">{view.final?.category || "Final"}</span>
  </div>;
}
function FinalWager({ view, onAct, now }) {
  return <main className="fd-board-body is-final">
    <FinalHead view={view} />
    <WagerWheel key="final" range={FINAL_RANGE(view)} locked={view.myFinalWager} onLock={wager => onAct("boardWager", { wager })}>
      {view.myFinalWager === null && <Drain from={view.finalAt.introAt} until={view.finalAt.wagerUntil} now={now} tone="chip" className="is-wager" />}
    </WagerWheel>
  </main>;
}
function FinalWatch({ state, view }) {
  const locks = view.phase === "final-wager" ? view.wagersLocked : view.picksLocked;
  const who = view.phase === "final-wager" ? view.finalEligible : view.players.filter(player => !state.away?.[player]);
  return <main className="fd-board-body is-final">
    <FinalHead view={view} />
    <ul className="fd-board-in is-final" aria-label={`${locks.length} of ${who.length} locked in`}>
      {who.map(player => <li key={player} className={locks.includes(player) ? "is-in" : ""}><ChipFace p={player} size={30} /></li>)}
    </ul>
  </main>;
}
function FinalClue({ view, onAct, now }) {
  const pick = view.myFinalPick;
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = !!pick?.locked;
  const over = now > view.finalAt.answerUntil;
  const chosen = pending ?? (Number.isInteger(pick?.choice) ? pick.choice : null);
  useEffect(() => { setPending(null); }, [pick?.choice, pick?.at]);
  const send = async payload => {
    const result = await onAct("boardFinalPick", payload);
    if (result?.ok !== true && !result?.uncertain) { setError(writeError(result)); playSound("S26", { bus:"you" }); }
    else setError("");
    return result;
  };
  const choose = i => {
    if (locked || over) return;
    tapTick(); unlockSound();
    playSound("S18", { bus:"you" });
    setPending(i);
    send({ choice:i }).then(result => { if (result?.ok !== true) setPending(null); });
  };
  const lock = async () => {
    if (locked || over || busy || chosen === null) return;
    tapTick(); unlockSound();
    setBusy(true);
    const result = await send({ choice:chosen, lock:true });
    setBusy(false);
    if (result?.ok) playSound("stamp", { bus:"you" });
  };
  const final = view.final || {};
  return <>
    <main className="fd-board-body is-final is-clue">
      <div className="fd-board-prompt">
        <FinalHead view={view} />
        {final.text && <h2 className={`fd-board-final-text${final.text.length > 90 ? " is-long" : ""}`}>{final.text}</h2>}
        {final.format === "picture" && <div className="fd-board-photo"><img src={triviaPhotoSrc(final.photo)} alt="" /></div>}
      </div>
      <ol className="fd-board-options is-live">
        {(final.options || []).map((option, i) => <li key={i}>
          <button type="button" className={`fd-board-option${chosen === i ? " is-chosen" : ""}${chosen === i && locked ? " is-locked" : ""}`}
            disabled={locked || over} aria-pressed={chosen === i} onClick={() => choose(i)}>
            <span className="fd-board-letter" aria-hidden="true">{LETTERS[i]}</span>
            <span className="fd-board-option-text">{typeof option === "string" ? option : option?.title}</span>
            {chosen === i && locked && <span className="fd-board-lock" aria-label="Locked in"><Icon name="lock" size={16} /></span>}
          </button></li>)}
      </ol>
    </main>
    <footer className="fd-board-foot">
      {!locked && !over && <Drain from={view.finalAt.clueAt} until={view.finalAt.answerUntil} now={now} className="is-foot" />}
      {error && <p className="fd-board-error" role="alert">{error}</p>}
      {locked ? <div className="fd-board-primary is-done"><Icon name="lock" size={18} />Locked in</div>
        : over ? <div className="fd-board-primary is-over">Time's up</div>
          : <button type="button" className="fd-board-primary" disabled={chosen === null || busy} onClick={lock}>{busy ? "Locking" : "Lock in"}</button>}
    </footer>
  </>;
}
/* your Final, turning on the TV's beat: your pick, your wager, your total */
function FinalReveal({ view, me, now }) {
  const steps = finalSteps(view, now);
  const step = steps.find(item => item.player === me);
  const row = view.myRow;
  const final = row?.final || null;
  const shown = step ? step.totalShown : true;
  const answered = Number.isInteger(final?.choice);
  const score = shown ? row?.score ?? 0 : row?.preFinal ?? 0;
  return <main className="fd-board-body is-final is-reveal">
    <FinalHead view={view} />
    {view.final?.options && <ol className="fd-board-options">{view.final.options.map((option, i) => {
      const right = view.final.answer === i;
      const yours = answered && final.choice === i && (!step || step.pickShown);
      return <li key={i}><span className={`fd-board-option${right ? " is-right" : " is-out"}${yours ? " is-chosen" : ""}${yours && !right ? " is-struck" : ""}`}>
        <span className="fd-board-letter" aria-hidden="true">{right ? <Icon name="check" size={20} /> : LETTERS[i]}</span>
        <span className="fd-board-option-text">{typeof option === "string" ? option : option?.title}</span>
      </span></li>;
    })}</ol>}
    {row && <div className={`fd-board-final-you${shown ? " is-shown" : ""}`}>
      {final && final.wager > 0 && (!step || step.wagerShown) && <b className={final.right ? "is-up" : "is-down"}>
        {final.right ? "+" : "−"}{fmtPoints(final.wager)}</b>}
      <span className={`fd-board-score${score < 0 ? " is-neg" : ""}`}><ScoreReel value={score} tone={score >= 0 ? "you" : null}
        label={signedPoints(score)} /></span>
    </div>}
  </main>;
}
function FinalBoard({ state, view, me }) {
  const rows = view.standings.filter(row => row.played || row.player === me);
  return <main className="fd-board-body is-standings">
    <h2 className="fd-board-standings-title">Final</h2>
    <ol className="fd-trivia-standings">
      {rows.map(row => <li key={row.player} className={row.player === me ? "is-mine" : ""}>
        <span className="fd-trivia-rank">{row.rank}</span>
        <ChipFace p={row.player} size={30} />
        <span className="fd-trivia-name">{disp(state, row.player)}</span>
        <span className={`fd-trivia-total${row.score < 0 ? " is-neg" : ""}`}>{signedPoints(row.score)}</span>
      </li>)}
    </ol>
  </main>;
}

/* your score in the header: your filament reel, or a clay one under zero */
function YourScore({ view }) {
  if (!view.playing || !view.myRow) return null;
  const score = view.phase === "final-reveal" ? view.myRow.preFinal : view.myRow.score;
  return <span className={`fd-board-yours${score < 0 ? " is-neg" : ""}`}>
    <ScoreReel value={score} tone={score >= 0 ? "you" : null} label={signedPoints(score)} /></span>;
}

/* when this phone opens by itself: once for each pick, clue, turn and
   Final step a player is needed at */
export const boardOpenKey = view => !view ? null
  : `${view.game.id}:${view.phase}:${view.clueId || (view.phase === "pick" ? (view.game.played || []).length : "")}:${view.turn}`;

/* The board on a phone, full screen. It opens by itself for each moment
   the game needs this player (a pick, a buzzer, a turn, a wager, the
   Final), waits while a sheet is open, and Home's row reopens it. The
   clue's text stays on the TV; the phone is the controller. */
export function BoardPlaySheet({ state, me, blocked = false, force = 0, onAct = sendBoard, now: fixed, initiallyOpen = false }) {
  const now = useBoardNow(state, me, fixed);
  const view = boardView(state, me, now);
  const screen = boardScreen(view);
  const key = boardOpenKey(view);
  const [dismissed, setDismissed] = useState(null);
  const [opened, setOpened] = useState(initiallyOpen);
  const forced = useRef(force);
  useEffect(() => {
    if (force !== forced.current) { forced.current = force; setDismissed(null); setOpened(true); }
  }, [force]);
  const open = !!view && !view.finished && !blocked && dismissed !== key && (view.playing || opened);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  if (!open) return null;
  const close = () => { setDismissed(key); setOpened(false); };
  const props = { state, view, me, onAct, now };
  return <div className={`fd-board-game is-${screen}`} role="dialog" aria-modal="true" aria-label="Trivia">
    <header className="fd-board-head">
      <span className="fd-board-title">Trivia</span>
      <YourScore view={view} />
      <button type="button" className="fd-trivia-close" onClick={close} aria-label="Close"><Icon name="close" size={20} /></button>
    </header>
    {screen === "pick" || screen === "pick-watch" ? <Pick {...props} />
      : screen === "buzzer" || screen === "clue-watch" ? <BuzzScreen {...props} />
        : screen === "answer" ? <Answer {...props} />
          : screen === "answer-watch" ? <AnswerWatch {...props} />
            : screen === "reveal" ? <Reveal key={view.clueId} {...props} />
              : screen === "dd-wager" || screen === "dd-watch" ? <DailyDouble {...props} />
                : screen === "final-wager" ? <FinalWager {...props} />
                  : screen === "final-watch" ? <FinalWatch {...props} />
                    : screen === "final-clue" ? <FinalClue {...props} />
                      : screen === "final-reveal" ? <FinalReveal {...props} />
                        : <FinalBoard {...props} />}
  </div>;
}

/* Home's row while a board game runs: where it stands for you */
export function boardHomeStatus(view, now) {
  if (!view || view.finished) return null;
  const me = view.me;
  const screen = boardScreen(view);
  if (screen === "pick") return "Your pick";
  if (screen === "buzzer") return now >= view.armAt ? "Buzzers live" : view.columnName;
  if (screen === "answer") return "Your turn";
  if (screen === "dd-wager") return "Daily Double";
  if (screen === "final-wager") return view.myFinalWager === null ? "Final wager" : "Locked in";
  if (screen === "final-clue") return view.myFinalPick?.locked ? "Locked in" : "Final";
  if (view.myRow && view.playing) return `${signedPoints(view.phase === "final-reveal" ? view.myRow.preFinal : view.myRow.score)} pts`;
  return view.phase.startsWith("final") ? "Final" : null;
}
export function BoardHome({ state, me, onOpen, now: fixed }) {
  const now = useBoardNow(state, me, fixed);
  const view = boardView(state, me, now);
  if (!view || view.finished) return null;
  const status = boardHomeStatus(view, now);
  const place = view.myRow && view.playing ? view.myRow.rank : null;
  return <button type="button" className="fd-trivia-home" onClick={onOpen}>
    <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Trivia</small>
      <strong>{place ? <OneSafe text={ordinal(place)} /> : `${view.cellsLeft} left`}</strong>{status && <em>{status}</em>}</span>
    <Icon name="open" size="1em" />
  </button>;
}
