import React from "react";
import { TRIVIA_CLIP_MS } from "../../../shared/trivia.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { LETTERS, fmtNumber, numberLabel, teamColor, triviaPhotoSrc, triviaView } from "../trivia/triviaModel.js";
import { useTuneClip } from "../trivia/tuneClip.js";
import { useTriviaClock } from "./roomSound.js";
import "./tv-trivia.css";

const shortTeam = name => String(name || "").replace(/^the\s+/i, "");
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

/* a team's lane: its name, its three faces lit once it locks; on the
   reveal its answer and what it scored */
function Lane({ state, lane, view }) {
  const { question, revealed } = view;
  const score = lane.score;
  const answer = revealed && lane.pick && (question.format === "number" ? numberLabel(lane.pick.value)
    : Number.isInteger(lane.pick.choice) ? LETTERS[lane.pick.choice] : null);
  const cls = ["tv-trivia-lane", lane.locked && "is-locked", !lane.locked && lane.set && "is-set",
    revealed && score?.points > 0 && "is-scored", revealed && score?.answered && !score.points && "is-missed"].filter(Boolean).join(" ");
  return <li className={cls} style={{ "--team":teamColor(state, lane) }}>
    <div className="tv-trivia-lane-head">
      <i className="tv-trivia-lane-lamp" aria-hidden="true" />
      <span className="fd-show tv-trivia-lane-name">{lane.name}</span>
      {revealed ? <span className="tv-display tv-trivia-lane-points" key={view.question.id}>
        {score?.points ? `+${fmtNumber(score.points)}` : "0"}</span>
        : lane.locked && <span className="tv-trivia-lane-lock"><Icon name="lock" size={28} /></span>}
    </div>
    <div className="tv-trivia-lane-row">
      <span className="tv-trivia-lane-faces">{lane.players.map(player =>
        <span key={player} className={lane.locked || revealed ? "is-in" : ""}><ChipFace p={player} size={52} /></span>)}</span>
      {answer && <span className={`tv-display tv-trivia-lane-answer${score?.correct ? " is-right" : ""}`}>{answer}</span>}
      {revealed && <span className="tv-display tv-trivia-lane-total">{fmtNumber(lane.row?.total || 0)}</span>}
    </div>
  </li>;
}

function Options({ state, view }) {
  const { question, revealed } = view;
  return <ol className={`tv-trivia-options${question.format === "tune" ? " is-tune" : ""}`}>
    {question.options.map((option, i) => {
      const right = revealed && question.answer === i;
      const teams = revealed ? view.lanes.filter(lane => lane.pick?.choice === i) : [];
      return <li key={i} className={`${right ? "is-right" : ""}${revealed && !right ? " is-out" : ""}`} style={{ "--i":i }}>
        <span className="tv-display tv-trivia-letter">{right ? <Icon name="check" size={40} /> : LETTERS[i]}</span>
        <span className="tv-trivia-option">
          {typeof option === "string" ? <b>{option}</b> : <><b>{option.title}</b><small>{option.artist}</small></>}
          {!!teams.length && <span className="tv-trivia-tags">{teams.map(lane =>
            <span key={lane.key} className="tv-trivia-tag" style={{ "--team":teamColor(state, lane) }}><i />{shortTeam(lane.name)}</span>)}</span>}
        </span>
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

/* the scores: between rounds, the four teams in order; at the end, the
   podium the result scene takes over from */
function Board({ state, view }) {
  const rows = view.standings;
  if (view.last) {
    const order = [rows[1], rows[0], rows[2]].filter(Boolean);
    return <div className="tv-trivia is-board is-final">
      <div className="tv-trivia-podium">
        {order.map(row => <div key={row.key} className={`tv-trivia-step is-${row.rank === 1 ? "first" : row.rank === 2 ? "second" : "third"}`}
          style={{ "--team":teamColor(state, row) }}>
          <span className="tv-trivia-step-faces">{row.players.map(player => <ChipFace key={player} p={player} size={row.rank === 1 ? 96 : 76} />)}</span>
          <span className="fd-show tv-trivia-step-name">{row.name}</span>
          <span className="tv-display tv-trivia-step-total">{fmtNumber(row.total)}</span>
          <span className="tv-display tv-trivia-step-place">{row.rank === 1 ? "1st" : row.rank === 2 ? "2nd" : "3rd"}</span>
        </div>)}
      </div>
      {rows.slice(3).map(row => <div key={row.key} className="tv-trivia-rest" style={{ "--team":teamColor(state, row) }}>
        <span className="tv-display">{row.rank}</span><span className="fd-show">{row.name}</span>
        <span className="tv-display">{fmtNumber(row.total)}</span></div>)}
    </div>;
  }
  return <div className="tv-trivia is-board">
    <div className="tv-trivia-board tv-glass">
      <div className="tv-trivia-board-head"><span className="fd-show tv-trivia-board-title">{view.round?.name || "Trivia"}</span>
        <span className="tv-label">After question {view.n} of {view.total}</span></div>
      <ol>
        {rows.map((row, i) => <li key={row.key} style={{ "--team":teamColor(state, row), "--row":i }}>
          <span className="tv-display tv-trivia-board-rank">{row.rank}</span>
          <i className="tv-trivia-lane-lamp" aria-hidden="true" />
          <span className="fd-show tv-trivia-board-name">{row.name}</span>
          <span className="tv-trivia-lane-faces is-board">{row.players.map(player => <span key={player} className="is-in">
            <ChipFace p={player} size={60} /></span>)}</span>
          <span className="tv-display tv-trivia-board-total">{fmtNumber(row.total)}</span>
        </li>)}
      </ol>
    </div>
  </div>;
}

/* Trivia on the TV: the question with its clock and every team's lane
   (who has locked in, never what), then the reveal (the right answer
   stamps, each team's answer on its lane, the points into its total), the
   scores between rounds and the final podium. */
export function TVTrivia({ state, now }) {
  const view = triviaView(state, null, now);
  const tune = view?.question.format === "tune";
  useTuneClip({ id:view?.question.id, active:!!view && tune && view.phase === "question" && now < view.startsAt + TRIVIA_CLIP_MS,
    startsAt:view?.startsAt || 0 });
  useTriviaClock({ id:view?.question.id, live:view?.phase === "question" && !view.leading, secondsLeft:view?.secondsLeft || 0,
    closesAt:view?.closesAt || 0 });
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
        <span className="tv-display tv-trivia-count">Question {view.n} of {view.total}</span>
      </div>
      {text && <h2 className="fd-show tv-trivia-text" style={{ fontSize:triviaTextSize(text, media) }}>{text}</h2>}
      {picture && <div className="tv-trivia-photo"><img src={triviaPhotoSrc(question.photo)} alt="" /></div>}
      {tune && <Listening live={view.clipLive} />}
      {question.format === "number" ? <NumberStage view={view} /> : <Options state={state} view={view} />}
      {view.phase === "question" && view.leading && <span className="tv-display tv-trivia-stamp" key={question.id} aria-hidden="true">
        {view.n}</span>}
    </section>
    <aside className="tv-trivia-side">
      {view.phase === "question" && <Ring view={view} now={now} />}
      <ol className="tv-trivia-lanes">{(view.revealed ? [...view.lanes].sort((a, b) => (a.row?.rank || 9) - (b.row?.rank || 9)) : view.lanes)
        .map(lane => <Lane key={lane.key} state={state} lane={lane} view={view} />)}</ol>
    </aside>
  </div>;
}

