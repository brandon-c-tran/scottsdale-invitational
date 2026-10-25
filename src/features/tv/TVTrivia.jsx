import React from "react";
import { disp } from "../../../shared/core.js";
import { TRIVIA_CLIP_MS } from "../../../shared/trivia.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { LETTERS, fmtNumber, nearestGuesses, numberLabel, ordinal, triviaPhotoSrc, triviaView } from "../trivia/triviaModel.js";
import { useTuneClip } from "../trivia/tuneClip.js";
import { teamRows } from "../moments/walkoutTeam.js";
import { isBoardGame } from "../../../shared/triviaBoard.js";
import { TVBoard } from "./TVBoard.jsx";
import { textUnits } from "../../ui/textUnits.js";
import "./tv-trivia.css";

/* the question's size by its length, so three lines always fit the stage */
export const triviaTextSize = (text = "", media = false) => {
  const n = text.length;
  if (media) return n > 90 ? 44 : n > 50 ? 52 : 60;
  return n > 110 ? 56 : n > 70 ? 64 : 76;
};

function Ring({ view, now }) {
  const left = Math.max(0, Math.min(view.duration, view.closesAt - now));
  const k = view.duration ? left / view.duration : 0;
  const seconds = Math.ceil(left / 1000);
  const r = 92, c = 2 * Math.PI * r;
  return <div className={`tv-trivia-ring${seconds <= 5 && !view.leading ? " is-low" : ""}`} role="timer" aria-label={`${seconds} seconds`}>
    <svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r={r} className="track" />
      <circle cx="110" cy="110" r={r} className="run" style={{ strokeDasharray:c, strokeDashoffset:c * (1 - k) }} /></svg>
    <b className="tv-display" key={seconds <= 5 ? seconds : "s"}>{seconds}</b>
  </div>;
}

/* The room while a question is live: every player's chip, lit as they
   lock in, never what they picked */
function Room({ state, view }) {
  const room = view.room.filter(lane => !lane.away);
  /* balanced rows (13 stand 5, 4, 4), each centred: the first of a shorter
     row starts half a column in, so no one is left alone on a row */
  const rows = teamRows(room.length, 5);
  const cols = Math.max(1, ...rows);
  const starts = new Map();
  rows.reduce((at, n) => { starts.set(at, cols - n + 1); return at + n; }, 0);
  return <ol className={`tv-trivia-room${room.length > 12 ? " is-full" : ""}`} aria-label={`${view.lockedCount} of ${view.roomCount} locked in`}
    style={{ gridTemplateColumns:`repeat(${cols * 2}, minmax(0, 1fr))` }}>
    {room.map((lane, i) => <li key={lane.player} className={lane.locked ? "is-locked" : lane.set ? "is-set" : ""}
      style={starts.has(i) ? { gridColumnStart:starts.get(i) } : undefined}>
      <span className="tv-trivia-room-chip"><ChipFace p={lane.player} size={76} />
        {lane.locked && <i className="tv-trivia-room-lock"><Icon name="lock" size={22} /></i>}</span>
      <span className="tv-trivia-room-name">{disp(state, lane.player)}</span>
    </li>)}
  </ol>;
}

/* overlapping faces of who chose an answer, then +N */
function Faces({ lanes, max = 7, size = 44 }) {
  const shown = lanes.slice(0, lanes.length > max ? max - 1 : max);
  return <span className="tv-trivia-faces">
    {shown.map((lane, i) => <span key={lane.player} style={{ "--i":i }}><ChipFace p={lane.player} size={size} /></span>)}
    {lanes.length > shown.length && <b className="tv-display">+{lanes.length - shown.length}</b>}
  </span>;
}

/* the four answers; on the reveal each carries how many chose it, the right
   one stamps with the faces of everyone who had it */
function Options({ view }) {
  const { question, revealed } = view;
  return <ol className={`tv-trivia-options${question.format === "tune" ? " is-tune" : ""}`}>
    {question.options.map((option, i) => {
      const right = revealed && question.answer === i;
      const who = view.chose[i] || [];
      return <li key={i} className={`${right ? "is-right" : ""}${revealed && !right ? " is-out" : ""}`} style={{ "--i":i }}>
        <span className="tv-display tv-trivia-letter">{right ? <Icon name="check" size={40} /> : LETTERS[i]}</span>
        <span className="tv-trivia-option">
          {typeof option === "string" ? <b>{option}</b> : <><b>{option.title}</b><small>{option.artist}</small></>}
          {right && !!who.length && <Faces lanes={who} />}
        </span>
        {revealed && <span className="tv-display tv-trivia-tally">{who.length}</span>}
      </li>;
    })}
  </ol>;
}

/* name that tune: the room hears it, the glass shows it playing */
function Listening({ live }) {
  return <div className={`tv-trivia-listen${live ? " is-live" : ""}`}>
    <span className="tv-trivia-bars" aria-hidden="true">{Array.from({ length:15 }, (_, i) => <i key={i} style={{ "--i":i }} />)}</span>
  </div>;
}

function NumberStage({ view }) {
  const { question, revealed } = view;
  if (!revealed) return <div className="tv-trivia-number">
    <span className="tv-trivia-windows" aria-hidden="true">{Array.from({ length:question.digits || 4 }, (_, i) => <i key={i}>?</i>)}</span>
    {question.unit && <span className="tv-label tv-trivia-unit">{question.unit}</span>}
  </div>;
  return <div className="tv-trivia-number is-revealed">
    <span className="tv-display tv-trivia-answer">{numberLabel(question.answer)}</span>
    {question.unit && <span className="tv-label tv-trivia-unit">{question.unit}</span>}
  </div>;
}

/* A name in a row: one line as large as it fits its box (40px down to the
   TV's 24px floor), else two lines at 24, never cut short. The boxes: a
   reveal's row beside what the question added, a closest number's row
   beside the guess, the scores' rows; a podium step's (40 and 64 as the
   step's own size). */
export const TRIVIA_NAME_W = Object.freeze({ reveal:186, near:230, board:450, step:380, first:440 });
export function triviaNameFit(name, width, max = 40) {
  const one = Math.floor(width / Math.max(1, textUnits(name) * 0.47));
  return one >= 24 ? { size:Math.min(max, one), two:false } : { size:24, two:true };
}
function RowName({ name, width, className = "fd-show tv-trivia-row-name", max = 40 }) {
  const fit = triviaNameFit(name, width, max);
  return <span className={`${className}${fit.two ? " is-two" : ""}`} style={fit.size !== max ? { fontSize:fit.size } : undefined}>{name}</span>;
}

/* a row of the board: rank, chip, name, total, and on a reveal what this
   question added */
function Row({ state, row, view, size = 52, i = 0, nameW = TRIVIA_NAME_W.reveal }) {
  return <li className={`tv-trivia-row${row.rank === 1 ? " is-first" : ""}`} style={{ "--row":i }}>
    <span className="tv-display tv-trivia-row-rank">{row.rank}</span>
    <ChipFace p={row.player} size={size} />
    <RowName name={disp(state, row.player)} width={nameW} />
    {view.revealed && row.last > 0 && <span className="tv-display tv-trivia-row-plus">+{fmtNumber(row.last)}</span>}
    <span className="tv-display tv-trivia-row-total">{fmtNumber(row.total)}<small className="tv-unit">pts</small></span>
  </li>;
}

/* the reveal's side: the nearest guesses for a closest number, otherwise
   the top of the board with each player's points from this question */
function RevealSide({ state, view }) {
  if (view.question.format === "number") {
    const rows = nearestGuesses(view).slice(0, 7);
    return <ol className="tv-trivia-near">
      {rows.map((lane, i) => <li key={lane.player} className={lane.score.points ? "is-scored" : ""} style={{ "--row":i }}>
        <ChipFace p={lane.player} size={52} />
        <RowName name={disp(state, lane.player)} width={TRIVIA_NAME_W.near} />
        <span className="tv-display tv-trivia-near-guess">{numberLabel(lane.pick.value)}</span>
        <span className="tv-display tv-trivia-row-plus">{lane.score.points ? `+${fmtNumber(lane.score.points)}` : "0"}</span>
      </li>)}
    </ol>;
  }
  return <ol className="tv-trivia-rows">{view.standings.slice(0, 8).map((row, i) =>
    <Row key={row.player} state={state} row={row} view={view} i={i} />)}</ol>;
}

/* the scores: between rounds, the whole room in two columns; at the end,
   the podium the result scene takes over from */
function Board({ state, view }) {
  const rows = view.standings;
  if (view.last) {
    const order = [rows[1], rows[0], rows[2]].filter(Boolean);
    const step = row => row === rows[0] ? "first" : row === rows[1] ? "second" : "third";
    return <div className="tv-trivia is-board is-final">
      <div className="tv-trivia-podium">
        {order.map(row => <div key={row.player} className={`tv-trivia-step is-${step(row)}`}>
          <ChipFace p={row.player} size={row === rows[0] ? 168 : 124} />
          <RowName name={disp(state, row.player)} className="fd-show tv-trivia-step-name"
            width={row === rows[0] ? TRIVIA_NAME_W.first : TRIVIA_NAME_W.step} max={row === rows[0] ? 64 : 40} />
          <span className="tv-display tv-trivia-step-total">{fmtNumber(row.total)}<small className="tv-unit">pts</small></span>
          <span className="tv-display tv-trivia-step-place"><OneSafe text={ordinal(row.rank)} /></span>
        </div>)}
      </div>
      {rows.length > 3 && <ol className="tv-trivia-rest">{rows.slice(3).map(row => <li key={row.player}>
        <ChipFace p={row.player} size={48} /><span className="tv-display">{row.rank}</span>
        <span className="tv-display tv-trivia-rest-total">{fmtNumber(row.total)}<small className="tv-unit">pts</small></span></li>)}</ol>}
    </div>;
  }
  const half = Math.ceil(rows.length / 2);
  return <div className="tv-trivia is-board">
    <div className="tv-trivia-board tv-glass">
      <div className="tv-trivia-board-head"><span className="fd-show tv-trivia-board-title">{view.round?.name || "Trivia"}</span>
        <span className="tv-label"><OneSafe text={`After question ${view.n} of ${view.total}`} /></span></div>
      <div className="tv-trivia-board-cols">
        {[rows.slice(0, half), rows.slice(half)].map((list, c) => <ol key={c} className="tv-trivia-rows is-board">
          {list.map((row, i) => <Row key={row.player} state={state} row={row} view={{ ...view, revealed:false }} size={60} i={c * half + i}
            nameW={TRIVIA_NAME_W.board} />)}
        </ol>)}
      </div>
    </div>
  </div>;
}

/* Trivia on the TV: a board game is the board's (TVBoard.jsx); the rounds
   format is below. `fixed`: the caller holds the clock (a still). */
export function TVTrivia({ state, now, fixed = false }) {
  return isBoardGame(state?.trivia) ? <TVBoard state={state} now={now} fixed={fixed} /> : <TVRounds state={state} now={now} />;
}

/* The rounds format on the TV: the question with its clock and the room
   (who has locked in, never what), then the reveal (the right answer
   stamps, how many chose each answer, the points onto the board), the
   scores between rounds and the final podium. */
function TVRounds({ state, now }) {
  const view = triviaView(state, null, now);
  const tune = view?.question.format === "tune";
  useTuneClip({ id:view?.question.id, active:!!view && tune && view.phase === "question" && now < view.startsAt + TRIVIA_CLIP_MS,
    startsAt:view?.startsAt || 0 });
  if (!view || view.finished) return null;
  if (view.phase === "board") return <Board state={state} view={view} />;
  const { question } = view;
  const picture = question.format === "picture";
  const media = picture || tune || question.format === "number";
  const text = tune ? "Name that tune" : question.text;
  return <div className={`tv-trivia is-${view.phase} is-${question.format}`}>
    <section className="tv-trivia-stage tv-glass">
      <div className="tv-trivia-head">
        <span className="fd-show tv-trivia-round">{view.round?.name || "Trivia"}</span>
        <span className="tv-display tv-trivia-count"><OneSafe text={`Question ${view.n} of ${view.total}`} /></span>
      </div>
      {text && <h2 className="fd-show tv-trivia-text" style={{ fontSize:triviaTextSize(text, media) }}>{text}</h2>}
      {picture && <div className="tv-trivia-photo"><img src={triviaPhotoSrc(question.photo)} alt="" /></div>}
      {tune && <Listening live={view.clipLive} />}
      {question.format === "number" ? <NumberStage view={view} /> : <Options view={view} />}
      {view.phase === "question" && view.leading && <span className="tv-display tv-trivia-stamp" key={question.id} aria-hidden="true">
        {view.n}</span>}
    </section>
    <aside className="tv-trivia-side">
      {view.phase === "question" ? <><Ring view={view} now={now} /><Room state={state} view={view} /></>
        : <RevealSide state={state} view={view} />}
    </aside>
  </div>;
}
