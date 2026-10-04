import React, { useEffect, useRef, useState } from "react";
import { dispatch } from "../../lib/client.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { freshFrameNow, playSound, unlockSound } from "../../lib/sound.js";
import { TRIVIA_BASE, TRIVIA_EXACT, TRIVIA_NEAR, TRIVIA_SPEED } from "../../../shared/trivia.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { Wheel } from "../geo/Wheel.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { LETTERS, fmtNumber, fromDigits, numberLabel, revealOrder, teamColor, toDigits, triviaPhotoSrc, triviaView } from "./triviaModel.js";
import "../geo/geo.css";
import "./trivia.css";

const sendPick = payload => dispatch("triviaPick", payload, { retry:true });
/* "The Sidewinders" reads as "Sidewinders" on a tag */
export const shortTeam = name => String(name || "").replace(/^the\s+/i, "");

function useTicking(active, ms = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick(n => n + 1), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
}

/* a number that runs up to its value once, after a delay */
export function useCountTo(target, { delay = 0, ms = 900, run = true } = {}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(run && !reduced ? 0 : target);
  useEffect(() => {
    if (!run || reduced) { setShown(target); return undefined; }
    let raf = 0;
    const timer = setTimeout(() => {
      const began = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - began) / ms);
        setShown(target * (1 - (1 - k) ** 3));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      step();
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, delay, ms, run, reduced]);
  return shown;
}

/* the clock: a ring that runs out with the question */
function Clock({ view, now }) {
  const left = Math.max(0, Math.min(view.duration, view.closesAt - now));
  const k = view.duration ? left / view.duration : 0;
  const seconds = Math.ceil(left / 1000);
  const r = 17, c = 2 * Math.PI * r;
  return <span className={`fd-trivia-clock${seconds <= 5 ? " is-low" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r={r} className="track" />
      <circle cx="20" cy="20" r={r} className="run" style={{ strokeDasharray:c, strokeDashoffset:c * (1 - k) }} /></svg>
    <b>{seconds}</b>
  </span>;
}

/* a team named by its painted insert */
export function TeamTag({ state, team, mine = false }) {
  return <span className={`fd-trivia-tag${mine ? " is-mine" : ""}`} style={{ "--team":teamColor(state, team) }}>
    <i aria-hidden="true" />{shortTeam(team.name)}</span>;
}

/* the tune plays on the TV: its bars move while the clip runs */
export function Listening({ live }) {
  return <div className={`fd-trivia-listen${live ? " is-live" : ""}`} aria-label={live ? "Playing on the TV" : "On the TV"}>
    <span className="fd-trivia-bars" aria-hidden="true">{Array.from({ length:9 }, (_, i) => <i key={i} style={{ "--i":i }} />)}</span>
    <Icon name="tv" size={20} />
  </div>;
}

/* Four answers. Your team's pick is painted in its color with the face of
   whoever set it; on the reveal the right one stamps and every team's tag
   sits on the answer it gave. */
function Options({ state, view, pending, onChoose, disabled }) {
  const { question, revealed, mine } = view;
  const chosen = pending ?? mine?.choice ?? null;
  return <ol className="fd-trivia-options">
    {question.options.map((option, i) => {
      const picked = chosen === i;
      const right = revealed && question.answer === i;
      const teams = revealed ? view.lanes.filter(lane => lane.pick?.choice === i) : [];
      const setter = picked && !revealed && mine?.choice === i ? mine.by : null;
      const cls = ["fd-trivia-option", picked && "is-picked", picked && mine?.locked && "is-locked", right && "is-right",
        revealed && picked && !right && "is-wrong", revealed && !right && "is-out"].filter(Boolean).join(" ");
      return <li key={i}>
        <button type="button" className={cls} disabled={disabled} aria-pressed={picked}
          style={view.team ? { "--team":teamColor(state, view.team) } : undefined}
          onClick={() => onChoose?.(i)}>
          <span className="fd-trivia-letter" aria-hidden="true">{right ? <Icon name="check" size={18} /> : LETTERS[i]}</span>
          <span className="fd-trivia-option-text">
            {typeof option === "string" ? option : <><b>{option.title}</b><small>{option.artist}</small></>}
            {!!teams.length && <span className="fd-trivia-tags">{teams.map(lane =>
              <TeamTag key={lane.key} state={state} team={lane} mine={lane.mine} />)}</span>}
          </span>
          {setter && <span className="fd-trivia-setter" key={`${setter}:${mine.at}`}><ChipFace p={setter} size={30} /></span>}
          {picked && mine?.locked && !revealed && <span className="fd-trivia-lock" aria-label="Locked in"><Icon name="lock" size={16} /></span>}
        </button>
      </li>;
    })}
  </ol>;
}

/* Closest number: a wheel a digit. A teammate's turn moves your wheels. */
function NumberWheels({ view, value, onChange, disabled }) {
  const digits = view.question.digits || 4;
  const list = toDigits(value ?? 0, digits);
  const items = Array.from({ length:10 }, (_, d) => ({ value:d, label:String(d) }));
  return <div className={`fd-trivia-number${disabled ? " is-off" : ""}`} style={{ "--digits":digits }}>
    <div className="fd-trivia-wheels">
      {list.map((digit, i) => <Wheel key={i} items={items} value={digit} label={`Digit ${i + 1}`}
        onChange={next => { if (disabled) return; const copy = [...list]; copy[i] = next; onChange(fromDigits(copy)); }} />)}
    </div>
    {view.question.unit && <span className="fd-trivia-unit">{view.question.unit}</span>}
  </div>;
}

/* the photo of a picture question: tap to see it whole */
function Photo({ question }) {
  const [full, setFull] = useState(false);
  return <button type="button" className={`fd-trivia-photo${full ? " is-full" : ""}`} onClick={() => setFull(value => !value)}
    aria-label={full ? "Shrink the photo" : "Show the photo whole"}>
    <img src={triviaPhotoSrc(question.photo)} alt="" />
  </button>;
}

function QuestionText({ question }) {
  if (question.format === "tune") return <h2 className="fd-trivia-text">Name that tune</h2>;
  if (!question.text) return null;
  return <h2 className={`fd-trivia-text${question.text.length > 90 ? " is-long" : ""}`}>{question.text}</h2>;
}

/* The question, as your team plays it. A tap sets your team's answer for
   everyone on it; Lock in (anyone) makes it final. */
function Play({ state, view, now, onPick, me }) {
  const { question, mine } = view;
  const number = question.format === "number";
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [locking, setLocking] = useState(false);
  const [draft, setDraft] = useState(mine?.value ?? null);
  const timer = useRef(0);
  const locked = !!mine?.locked;
  const over = view.timeUp;
  /* the server's answer replaces the local one as it lands */
  useEffect(() => { setPending(null); }, [mine?.choice, mine?.at]);
  useEffect(() => { if (mine?.value !== undefined && mine?.by !== me) setDraft(mine.value); }, [mine?.value, mine?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  const send = async payload => {
    const result = await onPick({ questionId:question.id, ...payload });
    if (result?.ok !== true && !result?.uncertain) {
      setError(result?.error || "Not saved. Try again.");
      playSound("S26", { bus:"you" });
    } else setError("");
    return result;
  };
  const choose = i => {
    if (locked || over) return;
    unlockSound(); tapTick();
    playSound("S18", { bus:"you" });
    setPending(i);
    send({ choice:i }).then(result => { if (result?.ok !== true) setPending(null); });
  };
  const turn = value => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send({ value }), 350);
  };
  const lock = async () => {
    if (locked || over || locking) return;
    const payload = number ? { value:draft ?? 0 } : pending !== null ? { choice:pending } : {};
    if (!number && pending === null && !Number.isInteger(mine?.choice)) return;
    unlockSound(); tapTick();
    clearTimeout(timer.current);
    setLocking(true);
    const result = await send({ ...payload, lock:true });
    setLocking(false);
    if (result?.ok) playSound("stamp", { bus:"you" });
  };
  const hasPick = number ? draft !== null || mine?.value !== undefined : pending !== null || Number.isInteger(mine?.choice);
  return <>
    <main className="fd-trivia-body">
      <QuestionText question={question} />
      {question.format === "picture" && <Photo question={question} />}
      {question.format === "tune" && <Listening live={view.clipLive} />}
      {number ? <NumberWheels view={view} value={locked ? mine.value : draft ?? mine?.value ?? 0} onChange={turn}
        disabled={locked || over} />
        : <Options state={state} view={view} pending={pending} onChoose={choose} disabled={locked || over} />}
      {number && mine?.by && <p className="fd-trivia-who"><ChipFace p={locked ? mine.lockedBy || mine.by : mine.by} size={24} />
        <span>{numberLabel(mine.value, question.unit)}</span></p>}
    </main>
    <footer className="fd-trivia-foot">
      <TeamLamps state={state} view={view} />
      {error && <p className="fd-trivia-error" role="alert">{error}</p>}
      {locked ? <div className="fd-trivia-primary is-done" key="done"><Icon name="lock" size={18} />Locked in
        {mine.lockedBy && <ChipFace p={mine.lockedBy} size={28} />}</div>
        : over ? <div className="fd-trivia-primary is-over">Time's up</div>
          : <button type="button" className={`fd-trivia-primary${view.secondsLeft <= 5 && !view.leading ? " is-hurry" : ""}`}
            disabled={!hasPick || locking} onClick={lock}>
            {locking ? "Locking" : "Lock in"}{view.secondsLeft <= 5 && !view.leading && <b>{view.secondsLeft}s</b>}</button>}
    </footer>
  </>;
}

/* every team's lamp: lit once it locks, flashing while it has an answer
   and has not */
function TeamLamps({ state, view }) {
  return <ul className="fd-trivia-lamps" aria-label={`${view.lockedCount} of ${view.lanes.length} teams locked in`}>
    {view.lanes.map(lane => <li key={lane.key} className={`${lane.locked ? "is-locked" : lane.set ? "is-set" : ""}${lane.mine ? " is-mine" : ""}`}
      style={{ "--team":teamColor(state, lane) }}>
      <i className="fd-trivia-lamp" aria-hidden="true" /><span>{shortTeam(lane.name)}</span></li>)}
  </ul>;
}

/* the reveal, from your team's side: the right answer stamped, your points
   counting with the speed bonus as its own fill, then the four teams */
function Reveal({ state, view, me, fresh:arrived }) {
  const { question, myScore } = view;
  /* the count runs once, if the reveal landed while the sheet was up */
  const [fresh] = useState(arrived);
  const number = question.format === "number";
  const max = number ? TRIVIA_NEAR[0] + TRIVIA_EXACT : TRIVIA_BASE + TRIVIA_SPEED;
  const points = useCountTo(myScore?.points || 0, { delay:700, run:fresh });
  useEffect(() => {
    if (!fresh || !myScore?.points || !freshFrameNow()) return;
    playSound("payout", { bus:"you", delayMs:700, opts:{ n:Math.max(4, Math.round(myScore.points / 100)) } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* the reveal needs no action: one scroll, your points first */
  return <main className="fd-trivia-body is-reveal">
    {view.team && <div className={`fd-trivia-points${myScore?.points ? "" : myScore?.answered ? " is-wrong" : " is-none"}`}>
      <b>{myScore?.points ? `+${fmtNumber(Math.round(points / 10) * 10)}` : myScore?.answered ? "0" : "No answer"}</b>
      {myScore?.points > 0 && <span className="fd-trivia-split" aria-hidden="true">
        <i className="is-base" style={{ "--w":myScore.base / max }} /><i className="is-bonus" style={{ "--w":myScore.bonus / max }} /></span>}
      {myScore?.points > 0 && <small>{number ? myScore.bonus ? "Exact" : myScore.near === 1 ? "Closest" : "Second closest"
        : myScore.bonus ? `Speed +${myScore.bonus}` : "Right"}</small>}
      {myScore?.answered && !myScore.points && <small>{number ? "Not close enough" : "Wrong"}</small>}
    </div>}
    <QuestionText question={question} />
    {question.format === "picture" && <Photo question={question} />}
    {number ? <NumberReveal state={state} view={view} /> : <Options state={state} view={view} pending={null} disabled />}
    <Standings state={state} view={view} me={me} compact />
  </main>;
}

/* closest number: the answer, then every team's guess, nearest first */
function NumberReveal({ state, view }) {
  const { question } = view;
  const rows = view.lanes.filter(lane => lane.score?.answered).sort((a, b) => a.score.off - b.score.off);
  return <div className="fd-trivia-numreveal">
    <p className="fd-trivia-answer"><b>{numberLabel(question.answer)}</b>{question.unit && <span>{question.unit}</span>}</p>
    <ol>
      {rows.map(lane => <li key={lane.key} className={lane.mine ? "is-mine" : ""}>
        <TeamTag state={state} team={lane} mine={lane.mine} />
        <b>{numberLabel(lane.pick.value)}</b>
        <span>{lane.score.off === 0 ? "Exact" : `${fmtNumber(lane.score.off)} off`}</span>
        <em>{lane.score.points ? `+${fmtNumber(lane.score.points)}` : "0"}</em>
      </li>)}
      {!rows.length && <li className="is-none">No answers</li>}
    </ol>
  </div>;
}

/* the four teams by total; yours lit */
export function Standings({ state, view, compact = false }) {
  return <ol className={`fd-trivia-standings${compact ? " is-compact" : ""}`}>
    {view.standings.map(row => {
      const lane = view.lanes.find(item => item.key === row.key);
      return <li key={row.key} className={lane?.mine ? "is-mine" : ""} style={{ "--team":teamColor(state, row) }}>
        <span className="fd-trivia-rank">{row.rank}</span>
        <span className="fd-trivia-team"><i aria-hidden="true" /><b>{row.name}</b>
          {!compact && <span className="fd-trivia-faces">{row.players.map(player => <ChipFace key={player} p={player} size={28} />)}</span>}</span>
        <span className="fd-trivia-total">{fmtNumber(row.total)}{view.revealed && row.last > 0 && <small>+{fmtNumber(row.last)}</small>}</span>
      </li>;
    })}
  </ol>;
}

/* between rounds, and at the end */
function Board({ state, view, me }) {
  const title = view.last ? "Final" : "Scores";
  return <main className="fd-trivia-body is-board">
    <h2 className="fd-trivia-board-title">{title}</h2>
    <Standings state={state} view={view} me={me} />
  </main>;
}

/* A player's game, full screen. It opens by itself for each question, its
   reveal and the scores (once each), waits while a sheet is open, and
   Home's row reopens it. Spectators open it from Home. */
export function TriviaPlaySheet({ state, me, blocked = false, force = 0, onPick = sendPick, now, initiallyOpen = false }) {
  const at = now ?? serverNow();
  const view = triviaView(state, me, at);
  useTicking(!!view && view.phase === "question" && now === undefined);
  const key = view ? `${view.question.id}:${view.phase}` : null;
  const [dismissed, setDismissed] = useState(null);
  const [opened, setOpened] = useState(initiallyOpen);
  const forced = useRef(force);
  useEffect(() => {
    if (force !== forced.current) { forced.current = force; setDismissed(null); setOpened(true); }
  }, [force]);
  /* the reveal counts up only when it arrives while the sheet is up */
  const seen = useRef(null);
  const fresh = !!key && seen.current !== null && seen.current !== key;
  useEffect(() => { seen.current = key; });
  const open = !!view && !view.finished && !blocked && dismissed !== key && (view.playing || opened);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  if (!open) return null;
  const urgent = view.phase === "question" && !view.leading && !view.timeUp && view.secondsLeft <= 5;
  const close = () => { setDismissed(key); setOpened(false); };
  return <div className={`fd-trivia-game is-${view.phase}${urgent ? " is-urgent" : ""}`} role="dialog" aria-modal="true" aria-label="Trivia">
    <header className="fd-trivia-head">
      <span className="fd-trivia-count"><small>{view.round?.name || "Trivia"}</small>
        <b><OneSafe text={`Question ${view.n}`} /> <i><OneSafe text={`of ${view.total}`} /></i></b></span>
      {view.phase === "question" && <Clock view={view} now={at} />}
      <button type="button" className="fd-trivia-close" onClick={close} aria-label="Close"><Icon name="close" size={20} /></button>
      {view.phase === "question" && <span className="fd-trivia-timebar" aria-hidden="true">
        <i style={{ transform:`scaleX(${Math.max(0, Math.min(1, (view.closesAt - at) / view.duration))})` }} /></span>}
    </header>
    {view.phase === "question" && view.leading && <span className="fd-trivia-stamp" key={view.question.id} aria-hidden="true">
      {view.n}</span>}
    {view.phase === "question"
      ? (view.playing ? <Play key={view.question.id} state={state} view={view} now={at} onPick={onPick} me={me} />
        : <Watch state={state} view={view} />)
      : view.phase === "board" ? <Board state={state} view={view} me={me} />
        : <Reveal key={view.question.id} state={state} view={view} me={me} fresh={fresh} />}
  </div>;
}

/* the question for someone not on a team: read only */
function Watch({ state, view }) {
  const { question } = view;
  return <>
    <main className="fd-trivia-body">
      <QuestionText question={question} />
      {question.format === "picture" && <Photo question={question} />}
      {question.format === "tune" && <Listening live={view.clipLive} />}
      {question.format === "number"
        ? <p className="fd-trivia-unit is-watch">{question.unit || "A number"}</p>
        : <Options state={state} view={{ ...view, team:null, mine:null }} pending={null} disabled />}
    </main>
    <footer className="fd-trivia-foot"><TeamLamps state={state} view={view} /></footer>
  </>;
}

/* Home's row while a game runs, for whoever closed it or watches */
export function TriviaHome({ state, me, onOpen, now }) {
  const view = triviaView(state, me, now ?? serverNow());
  useTicking(!!view && view.phase === "question" && now === undefined, 1000);
  if (!view || view.finished) return null;
  const status = view.phase === "board" ? view.last ? "Final scores" : "Scores"
    : view.phase === "reveal" ? view.myScore?.points ? `+${fmtNumber(view.myScore.points)}` : "Revealed"
      : view.mine?.locked ? "Locked in" : view.playing ? view.timeUp ? "Time's up" : `${view.secondsLeft} s` : `${view.lockedCount} of ${view.lanes.length} locked in`;
  return <button type="button" className="fd-trivia-home" onClick={onOpen}>
    <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Trivia</small>
      <strong><OneSafe text={`Question ${view.n} of ${view.total}`} /></strong><em>{status}</em></span><Icon name="open" size="1em" />
  </button>;
}

