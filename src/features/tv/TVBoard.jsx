import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { BOARD_CLIP_MS, DD_STING_MS, FINAL_INTRO_MS } from "../../../shared/triviaBoard.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { useTuneClip } from "../trivia/tuneClip.js";
import { LETTERS, ordinal, triviaPhotoSrc } from "../trivia/triviaModel.js";
import {
  BOARD_TV, NAME_SQUEEZE, ORDER_STAMP_MS, boardStageBox, boardView, clueTextSize, ddWagerUntil, finalStepOn, finalSteps,
  fmtPoints, fmtReaction, headNameFit, lineNameFit, nextBoardInstant, railSlots, signedPoints, tvBoardScene, zoomFrom,
} from "../trivia/boardModel.js";
import { useBoardRoomClock } from "./boardSound.js";
import { Takeover } from "./TVTakeover.jsx";
import "./tv-board.css";

const STAGE = boardStageBox();

/* minus the ms already gone since `anchor` when this TV first drew it,
   fixed per anchor so a re-render never restarts a server-clock animation */
function useAnchor(anchor, now) {
  const ref = useRef({ anchor:null, tl:0 });
  if (ref.current.anchor !== anchor) ref.current = { anchor, tl:anchor ? Math.round(anchor - now) : 0 };
  return ref.current.tl;
}
const at = ms => `calc(var(--tl) + ${ms}ms)`;

/* a name on one line in its slot, narrowed to fit (measured here) */
function FitName({ name, width, max = 30, min = 24, className = "" }) {
  const fit = lineNameFit(name, width, { max, min });
  const ref = useRef(null);
  const [squeeze, setSqueeze] = useState(fit.squeeze);
  const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIso(() => {
    let live = true;
    const measure = () => {
      const w = ref.current?.scrollWidth || 0;
      if (live && w) setSqueeze(Math.max(NAME_SQUEEZE, Math.min(1, width / w)));
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => { live = false; };
  }, [name, fit.size, width]);
  return <span className={`fd-show tv-board-fit ${className}`} style={{ fontSize:fit.size, maxWidth:width }}>
    <span ref={ref} style={squeeze < 1 ? { transform:`scaleX(${squeeze.toFixed(3)})` } : undefined}>{name}</span>
  </span>;
}

/* what is left of a window, draining on the server clock (CSS from its
   start, so a late TV joins mid-drain) */
function Drain({ from, until, now, className = "", tone = "live" }) {
  const total = Math.max(1, until - from);
  const left = useRef(null);
  if (left.current === null) left.current = Math.max(0, Math.min(total, until - now));
  return <i className={`tv-board-drain is-${tone} ${className}`} aria-hidden="true"
    style={{ "--drain-left":(left.current / total).toFixed(4), "--drain-ms":`${Math.round(left.current)}ms`,
      "--drain-low":`${Math.max(0, Math.round(left.current - Math.min(3000, total * 0.25)))}ms` }} />;
}

/* name that tune: a speaker on the glass, its cone pumping while the clip plays */
function Speaker({ live }) {
  return <div className={`tv-board-speaker${live ? " is-live" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 320 240" width="420" height="315">
      <g className="tv-board-waves">
        {[0, 1, 2].map(i => <path key={i} style={{ "--i":i }} d={`M${214 + i * 30} ${78 - i * 22}q${36 + i * 14} ${42 + i * 22} 0 ${84 + i * 44}`}
          fill="none" strokeWidth="14" strokeLinecap="round" />)}
      </g>
      <g className="tv-board-cone">
        <path d="M46 88h46l70-52v168l-70-52H46z" strokeWidth="10" strokeLinejoin="round" />
        <circle cx="70" cy="120" r="10" />
      </g>
    </svg>
  </div>;
}

/* the board: the categories across the top, the values down, played cells dark */
function Grid({ view }) {
  const n = Math.max(1, view.columns.length);
  const width = (STAGE.w - STAGE.gap * (n - 1)) / n - 24;
  const cells = [];
  for (let row = 0; row < view.rows; row++) view.columns.forEach(column => {
    const cell = column.cells[row];
    cells.push(cell ? <div key={cell.id} className={`tv-board-cell${cell.played ? " is-played" : ""}${cell.current ? " is-current" : ""}`}>
      {!cell.played && <b className="tv-display">{fmtPoints(cell.value)}</b>}
    </div> : <div key={`${column.col}:${row}`} className="tv-board-cell is-empty" aria-hidden="true" />);
  });
  return <div className="tv-board-grid" style={{ "--cols":n, "--rows":Math.max(1, view.rows), "--head":`${BOARD_TV.head}px`,
    "--gap":`${BOARD_TV.gap}px` }}>
    {view.columns.map(column => {
      const fit = headNameFit(column.name, width);
      return <div key={column.col} className="tv-board-head">
        <span className="fd-show" style={{ fontSize:fit.size }}>{fit.lines.map((line, i) => <span key={i}>{line}</span>)}</span>
      </div>;
    })}
    {cells}
  </div>;
}

/* the four answers: a struck one goes dark with its bar, the right one
   stamps green; `who` puts the faces of the ones who chose it beside it */
function Options({ state, options = [], struck = new Set(), answer = null, struckBy = {}, revealed = false, who = null, compact = false }) {
  return <ol className={`tv-board-options${compact ? " is-compact" : ""}`}>
    {options.map((option, i) => {
      const right = revealed && answer === i;
      const out = struck.has(i);
      const cls = [right && "is-right", out && "is-struck", revealed && !right && !out && "is-out"].filter(Boolean).join(" ");
      return <li key={i} className={cls || undefined} style={{ "--i":i }}>
        <span className="tv-display tv-board-letter">{LETTERS[i]}</span>
        <span className="tv-board-option">
          {typeof option === "string" ? <b>{option}</b> : <><b>{option?.title}</b><small>{option?.artist}</small></>}
        </span>
        {out && struckBy[i] && <span className="tv-board-struck-by"><ChipFace p={struckBy[i]} size={48} /></span>}
        {who?.[i]?.length > 0 && <span className="tv-board-option-faces">
          {who[i].slice(0, 6).map((player, k) => <span key={player} style={{ "--k":k }}><ChipFace p={player} size={44} /></span>)}
          {who[i].length > 6 && <b className="tv-display">+{who[i].length - 6}</b>}
        </span>}
      </li>;
    })}
  </ol>;
}

/* the buzz order as it lands: fastest first, each with its reaction */
function Order({ state, view, compact = false, now }) {
  const tl = useAnchor(view.closedAt, now);
  const tried = new Map(view.attempts.map(attempt => [attempt.player, attempt]));
  const size = compact ? 56 : view.order.length > 5 ? 72 : 96;
  return <ol className={`tv-board-order${compact ? " is-compact" : ""}`} style={{ "--tl":`${tl}ms` }}
    aria-label={view.order.map(row => `${row.place} ${disp(state, row.player)} ${fmtReaction(row.ms)}`).join(", ")}>
    {view.order.map((row, i) => {
      const attempt = tried.get(row.player);
      const on = compact && view.answering === row.player && !attempt;
      const cls = [on && "is-on", attempt && !attempt.right && "is-struck", attempt?.right && "is-right"].filter(Boolean).join(" ");
      return <li key={row.player} className={cls || undefined}
        style={{ "--i":i, animationDelay:compact ? undefined : at(i * ORDER_STAMP_MS) }}>
        <span className="tv-display tv-board-place">{row.place}</span>
        <ChipFace p={row.player} size={size} />
        {!compact && <FitName name={disp(state, row.player)} width={200} max={40} min={28} className="tv-board-order-name" />}
        <span className="tv-display tv-board-ms">{fmtReaction(row.ms)}</span>
      </li>;
    })}
  </ol>;
}

/* who answers now: their chip large, their name, the turn draining */
function Answerer({ state, view, now }) {
  const player = view.answering;
  if (!player) return null;
  const live = view.turnAt && now >= view.turnAt - 300;
  return <div className={`tv-board-answerer${live ? " is-live" : ""}`} key={`${view.clueId}:${view.turn}`}>
    <span className="tv-board-answerer-chip"><ChipFace p={player} size={176} /></span>
    <FitName name={disp(state, player)} width={400} max={60} min={36} className="tv-board-answerer-name" />
    {view.turnAt > 0 && <Drain from={view.turnAt} until={view.turnEnd} now={now} />}
  </div>;
}

/* the reveal's card: who took it and what it paid, or the struck ones */
function Taker({ state, view, now }) {
  const tl = useAnchor(view.revealedAt, now);
  const winner = view.winner;
  if (winner) return <div className="tv-board-answerer is-won" style={{ "--tl":`${tl}ms` }}>
    <span className="tv-board-answerer-chip"><ChipFace p={winner} size={176} /></span>
    <FitName name={disp(state, winner)} width={400} max={60} min={36} className="tv-board-answerer-name" />
    <span className="tv-display tv-board-gain">+{fmtPoints(view.stake)}</span>
  </div>;
  const tried = view.attempts.map(attempt => attempt.player);
  return <div className="tv-board-answerer is-nobody" style={{ "--tl":`${tl}ms` }}>
    {tried.length ? <span className="tv-board-tried">{tried.slice(0, 3).map(player =>
      <span key={player}><ChipFace p={player} size={96} /></span>)}</span> : <i className="fd-insert is-void tv-board-void" aria-hidden="true" />}
  </div>;
}

/* a struck answer remembers who struck it */
const struckByOf = attempts => Object.fromEntries(attempts.filter(a => !a.right && Number.isInteger(a.choice)).map(a => [a.choice, a.player]));

/* The clue: the cell flies up and fills the stage (the value, then the
   clue in large type), the buzzers arm on the frame's lamps, the order
   lands; then whoever answers, the options and their clock; then the
   answer stamped. The Daily Double's clue is the picker's alone. */
function Clue({ state, view, scene, now }) {
  const tl = useAnchor(view.pickedAt, now);
  const { clue } = view;
  if (!clue) return null;
  const zoom = view.dd ? null : zoomFrom(clue, { columns:view.columns.length, rows:view.rows });
  const tune = clue.format === "tune";
  const picture = clue.format === "picture";
  const live = scene === "armed";
  const answering = scene === "answer" || scene === "reveal" || scene === "dd-clue";
  const text = tune ? (/tune/i.test(view.columnName) ? "" : "Name that tune") : clue.text || "";
  const clipLive = tune && scene === "armed" && now < view.armAt + BOARD_CLIP_MS;
  const head = <header className="tv-board-panel-head">
    <FitName name={view.columnName} width={900} max={44} min={30} className="tv-board-cat" />
    {view.dd && <span className="fd-show tv-board-dd-tag">Daily Double</span>}
    <span className="tv-display tv-board-val">{fmtPoints(view.stake)}</span>
  </header>;
  /* the cell's numeral rides up at its own size: 78px on the cell, the
     panel scaled to it, so it fills the stage as the panel does */
  const style = { "--tl":`${tl}ms`, ...(zoom ? { "--zx":`${zoom.x}px`, "--zy":`${zoom.y}px`, "--zsx":zoom.sx, "--zsy":zoom.sy,
    "--zfont":`${Math.round(78 / Math.max(zoom.sx, zoom.sy))}px` } : {}) };
  if (answering) {
    const revealed = scene === "reveal";
    return <section className={`tv-board-panel tv-glass is-answer is-${scene}`} style={style}>
      {head}
      <div className="tv-board-answer">
        {text ? <h2 className="fd-show tv-board-text is-compact" style={{ fontSize:clueTextSize(text, { compact:true }) }}>{text}</h2>
          : tune ? <div className="tv-board-answer-tune"><Speaker live={false} /></div> : null}
        <div className="tv-board-answer-row">
          {revealed ? <Taker state={state} view={view} now={now} /> : <Answerer state={state} view={view} now={now} />}
          <Options state={state} options={clue.options} struck={view.struck} answer={view.answer} revealed={revealed}
            struckBy={struckByOf(view.attempts)} />
        </div>
        {!view.dd && view.order.length > 0 && <Order state={state} view={view} compact now={now} />}
      </div>
    </section>;
  }
  return <section className={`tv-board-panel tv-glass is-${scene}${zoom ? " is-zooming" : ""}${live ? " is-live" : ""}${picture ? " is-picture" : ""}`}
    style={style}>
    {zoom && <div className="tv-board-zoomvalue tv-display" aria-hidden="true">{fmtPoints(view.value)}</div>}
    <div className="tv-board-panel-in">
      {head}
      <div className="tv-board-clue-body">
        {text && <h2 className="fd-show tv-board-text" style={{ fontSize:clueTextSize(text, { media:picture || tune }) }}>{text}</h2>}
        {picture && <div className="tv-board-photo"><img src={triviaPhotoSrc(clue.photo)} alt="" /></div>}
        {tune && <Speaker live={clipLive} />}
      </div>
      {scene === "order" && <Order state={state} view={view} now={now} />}
    </div>
  </section>;
}

/* The Daily Double: the sting holds the room, silly in its motion, then
   the picker's wager on the reels and the clue for them alone */
const DD_WORDS = Object.freeze(["Daily", "Double"]);
function DailyDoubleSting({ state, view, now }) {
  const tl = useAnchor(view.pickedAt, now);
  let k = 0;
  return <Takeover kind="board-dd" className="tv-dd" label={`Daily Double, ${disp(state, view.picker)}`}
    style={{ "--tl":`${tl}ms`, "--out":`${DD_STING_MS - 350}ms` }}>
    <div className="tv-dd-glass" aria-hidden="true" />
    <svg className="tv-dd-burst" viewBox="-500 -500 1000 1000" width="1500" height="1500" aria-hidden="true">
      {Array.from({ length:16 }, (_, i) => <path key={i} d="M0 0L-60 -520L60 -520Z" transform={`rotate(${i * 22.5})`}
        className={i % 2 ? "is-b" : "is-a"} />)}
    </svg>
    <svg className="tv-dd-bulbs" viewBox="0 0 1000 1000" width="980" height="980" aria-hidden="true">
      <circle cx="500" cy="500" r="470" pathLength="48" className="tv-dd-bulbs-off" />
      <circle cx="500" cy="500" r="470" pathLength="48" className="tv-dd-bulbs-on" />
    </svg>
    <div className="tv-dd-words" aria-hidden="true">
      {DD_WORDS.map(word => <div key={word} className="fd-show is-marquee tv-dd-word">
        {[...word].map(ch => { const i = k++; return <span key={i} style={{ "--i":i, "--r":`${(i % 3 - 1) * 14}deg` }}>{ch}</span>; })}
      </div>)}
    </div>
    <div className="tv-dd-who">
      <ChipFace p={view.picker} size={150} />
      <FitName name={disp(state, view.picker)} width={700} max={72} min={44} className="tv-dd-name" />
    </div>
  </Takeover>;
}

function DailyDoubleWager({ state, view, now }) {
  const tl = useAnchor(view.wagerAt || 0, now);
  const locked = view.wager !== null && view.wagerAt > 0;
  return <section className="tv-board-panel tv-glass is-dd-wager">
    <header className="tv-board-panel-head">
      <FitName name={view.columnName} width={900} max={44} min={30} className="tv-board-cat" />
      <span className="fd-show tv-board-dd-tag">Daily Double</span>
    </header>
    <div className="tv-board-dd-body">
      <div className="tv-board-dd-who">
        <ChipFace p={view.picker} size={220} />
        <FitName name={disp(state, view.picker)} width={560} max={72} min={44} className="tv-board-dd-name" />
      </div>
      <div className={`tv-board-dd-wager${locked ? " is-locked" : ""}`} style={{ "--tl":`${tl}ms` }}>
        {locked ? <ScoreReel value={view.wager} drum tone="chip" label={fmtPoints(view.wager)} motion="always" from={0} at="calc(var(--tl) + 0ms)" />
          : <span className="tv-board-dd-pending" aria-label="Wagering">{[0, 1, 2, 3].map(i => <i key={i} aria-hidden="true">?</i>)}
            <span className="fd-insert is-pending tv-board-dd-lamp" aria-hidden="true" /></span>}
      </div>
    </div>
    {!locked && <Drain from={view.pickedAt + DD_STING_MS} until={ddWagerUntil(view)} now={now} className="is-foot" tone="chip" />}
  </section>;
}

/* The Final: its category stands, the wagers lock unseen (the rail
   lights), the clue with its long clock, then each player turned from the
   lowest score up, then the standings */
function FinalStage({ state, view, scene, now }) {
  const tl = useAnchor(view.finalAt.introAt, now);
  const category = view.final?.category || "Final";
  if (scene === "final-intro" || scene === "final-wager") {
    return <section className={`tv-board-final is-${scene}`} style={{ "--tl":`${tl}ms` }}>
      {scene === "final-intro" ? <div className="fd-show is-marquee tv-board-final-mark">Final</div>
        : <span className="tv-board-final-label"><i className="fd-insert tv-board-final-lamp" aria-hidden="true" />Final</span>}
      <div className="tv-board-final-plate tv-glass">
        <FitName name={category} width={1500} max={128} min={64} className="tv-board-final-cat" />
      </div>
      {scene === "final-wager" && <Drain from={view.finalAt.introAt + FINAL_INTRO_MS} until={view.finalAt.wagerUntil} now={now}
        className="is-final" tone="chip" />}
    </section>;
  }
  if (scene === "final-clue") {
    const text = view.final?.text || "";
    return <section className="tv-board-panel tv-glass is-final-clue is-live">
      <header className="tv-board-panel-head">
        <span className="tv-board-final-label"><i className="fd-insert tv-board-final-lamp" aria-hidden="true" />Final</span>
        <FitName name={category} width={1100} max={44} min={30} className="tv-board-cat" />
      </header>
      <div className="tv-board-answer">
        {text && <h2 className="fd-show tv-board-text is-final"
          style={{ fontSize:Math.min(80, clueTextSize(text, { media:view.final?.format === "picture" })) }}>{text}</h2>}
        {view.final?.format === "picture" && <div className="tv-board-photo is-final"><img src={triviaPhotoSrc(view.final.photo)} alt="" /></div>}
        <Options state={state} options={view.final?.options || []} />
      </div>
      <Drain from={view.finalAt.clueAt} until={view.finalAt.answerUntil} now={now} className="is-foot" />
    </section>;
  }
  if (scene === "final-reveal") return <FinalReveal state={state} view={view} now={now} />;
  return <FinalPodium state={state} view={view} />;
}

/* each player's Final turned: their pick stamped or struck, their wager,
   their total rolling; their face lands on the answer they chose */
function FinalReveal({ state, view, now }) {
  const tl = useAnchor(view.finalAt.revealAt, now);
  const steps = finalSteps(view, now);
  const on = finalStepOn(steps);
  const step = steps[on] || steps.filter(item => item.state === "done").pop() || null;
  const final = view.final || {};
  const who = (final.options || []).map((_, i) => steps.filter(item => item.pickShown && item.row?.final?.choice === i).map(item => item.player));
  return <section className="tv-board-panel tv-glass is-final-reveal" style={{ "--tl":`${tl}ms` }}>
    <header className="tv-board-panel-head">
      <span className="tv-board-final-label"><i className="fd-insert tv-board-final-lamp" aria-hidden="true" />Final</span>
      <FitName name={final.category || "Final"} width={1100} max={44} min={30} className="tv-board-cat" />
    </header>
    <div className="tv-board-final-reveal">
      <div className="tv-board-final-left">
        {final.text && <h2 className="fd-show tv-board-text is-compact" style={{ fontSize:clueTextSize(final.text, { compact:true }) }}>{final.text}</h2>}
        <Options state={state} options={final.options || []} answer={final.answer} revealed who={who} compact />
      </div>
      {step && <FinalTurn key={step.player} state={state} step={step} now={now} />}
    </div>
  </section>;
}
function FinalTurn({ state, step, now }) {
  const tl = useAnchor(step.start, now);
  const final = step.row?.final || { wager:0, choice:null, right:false };
  const answered = Number.isInteger(final.choice);
  return <div className={`tv-board-turn${final.right ? " is-right" : answered ? " is-wrong" : " is-none"}`} style={{ "--tl":`${tl}ms`,
    "--pick":`${step.beats.pick}ms`, "--wager":`${step.beats.wager}ms`, "--total":`${step.beats.total}ms` }}>
    <ChipFace p={step.player} size={190} />
    <FitName name={disp(state, step.player)} width={520} max={64} min={40} className="tv-board-turn-name" />
    <div className="tv-board-turn-pick">
      {answered ? <><span className="tv-display tv-board-letter">{LETTERS[final.choice]}</span>
        <span className="tv-board-turn-mark"><Icon name={final.right ? "check" : "close"} size={56} /></span></>
        : <i className="fd-insert is-void tv-board-void" aria-label="No answer" />}
    </div>
    <div className="tv-board-turn-wager">
      <span className="tv-label">Wager</span>
      <span className="tv-display">{final.wager ? `${final.right ? "+" : "−"}${fmtPoints(final.wager)}` : "0"}</span>
    </div>
    <div className={`tv-board-turn-total${step.row?.score < 0 ? " is-neg" : ""}`}>
      <ScoreReel value={step.row?.score || 0} from={step.row?.preFinal || 0} motion="always" label={signedPoints(step.row?.score || 0)}
        at={`calc(var(--tl) + var(--total))`} />
    </div>
  </div>;
}

/* the final standings: 2nd, 1st, 3rd, then everyone else */
function FinalPodium({ state, view }) {
  const rows = view.standings.filter(row => row.played);
  const order = [rows[1], rows[0], rows[2]].filter(Boolean);
  const step = row => row === rows[0] ? "first" : row === rows[1] ? "second" : "third";
  return <section className="tv-board-podium">
    <div className="tv-board-steps">
      {order.map(row => <div key={row.player} className={`tv-board-step is-${step(row)}`}>
        <ChipFace p={row.player} size={row === rows[0] ? 168 : 120} />
        <FitName name={disp(state, row.player)} width={row === rows[0] ? 520 : 420} max={row === rows[0] ? 64 : 48} min={32}
          className="tv-board-step-name" />
        <span className={`tv-display tv-board-step-total${row.score < 0 ? " is-neg" : ""}`}>{signedPoints(row.score)}
          <small className="tv-unit">pts</small></span>
        <span className="tv-display tv-board-step-place"><OneSafe text={ordinal(row.rank)} /></span>
      </div>)}
    </div>
  </section>;
}

/* The rail: every player's chip, name and score along the foot, in the
   order they joined (a chip never moves). A buzz lights its chip; the
   order, the picker, whoever answers and the Final's locks all show here,
   so the stage never repeats the room. */
/* where the reveal's card stands (TV canvas), for the value's flight */
const CARD_AT = Object.freeze({ x:BOARD_TV.edge + 36 + 210, y:BOARD_TV.top + 470 });
function Rail({ state, view, scene, now }) {
  const slots = railSlots(view, now, scene);
  const slotW = (STAGE.w - 12) / Math.max(1, slots.length);
  const width = Math.floor(slotW) - 12;
  const flying = scene === "reveal" && view.winner ? view.winner : null;
  const tl = useAnchor(view.revealedAt || 0, now);
  const railTop = BOARD_TV.top + STAGE.h + BOARD_TV.railGap;
  const flight = index => ({ "--fx":`${Math.round(CARD_AT.x - (BOARD_TV.edge + 6 + (index + 0.5) * slotW))}px`,
    "--fy":`${Math.round(CARD_AT.y - (railTop + 36))}px` });
  return <ol className="tv-board-rail tv-glass" style={{ "--slots":slots.length, "--tl":`${tl}ms` }} aria-label="Scores">
    {slots.map(slot => {
      const cls = ["tv-board-slot", slot.control && "is-control", slot.buzzed && "is-buzzed", slot.place && "is-placed",
        slot.answering && "is-answering", slot.right && "is-right", slot.lastWrong && scene !== "pick" && "is-wrong",
        slot.picker && "is-picker", slot.final && (slot.locked ? "is-locked" : slot.eligible ? "is-waiting" : "is-out"),
        state.away?.[slot.player] && "is-away"].filter(Boolean).join(" ");
      return <li key={slot.player} className={cls} style={{ "--x":slot.index }}>
        <span className="tv-board-slot-top">
          {slot.control && <><i className="fd-insert tv-board-slot-lamp" aria-hidden="true" /><span className="tv-label">Picks</span></>}
          {!slot.control && slot.place && <span className="tv-display tv-board-slot-place">{slot.place}</span>}
          {!slot.control && !slot.place && (slot.buzzed || (slot.final && slot.locked)) &&
            <i className="fd-insert tv-board-slot-lamp" aria-hidden="true" />}
        </span>
        <span className="tv-board-slot-chip"><ChipFace p={slot.player} size={60} /></span>
        <FitName name={disp(state, slot.player)} width={width} className="tv-board-slot-name" />
        <span className={`tv-board-slot-score${slot.score < 0 ? " is-neg" : ""}`}>
          <ScoreReel value={slot.score} slim label={signedPoints(slot.score)} />
        </span>
        {flying === slot.player && <span className="tv-display tv-board-fly" style={flight(slot.index)} aria-hidden="true">
          +{fmtPoints(view.stake)}</span>}
      </li>;
    })}
  </ol>;
}

/* The board's own clock: it reads the server clock as it draws and wakes
   on the instants it changes by itself (a lamp lighting, a turn opening),
   never only on the TV's one-second tick. `fixed` holds a still. */
function useBoardNow(state, tick, fixed) {
  const [, wake] = useState(0);
  const now = fixed ? tick : Math.max(tick || 0, serverNow());
  const next = nextBoardInstant(boardView(state, null, now), now);
  useEffect(() => {
    if (fixed || !next) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, next - serverNow()) + 10);
    return () => clearTimeout(timer);
  }, [next, fixed]);
  return now;
}

/* Trivia as the room's game show (shared/triviaBoard.js). The board fills
   the stage, the rail of scores stands along the foot in the ticker's
   place; a picked cell flies up into its clue, and every moment after it
   plays on the stage over the board. */
export function TVBoard({ state, now: tick, fixed = false }) {
  const now = useBoardNow(state, tick, fixed);
  const view = boardView(state, null, now);
  const scene = view ? tvBoardScene(view, now) : null;
  const tune = view?.clue?.format === "tune";
  useTuneClip({ id:view?.clueId, active:!!view && tune && view.phase === "clue" && now < view.armAt + BOARD_CLIP_MS,
    startsAt:view?.armAt || 0, length:BOARD_CLIP_MS });
  useBoardRoomClock(view, now);
  if (!view || view.finished) return null;
  const finalScene = scene?.startsWith("final");
  return <div className={`tv-board is-${scene}`}>
    <div className="tv-board-stage" style={{ width:STAGE.w, height:STAGE.h }}>
      {!finalScene && <Grid view={view} />}
      {["zoom", "clue", "armed", "order", "answer", "reveal", "dd-clue"].includes(scene) &&
        <Clue key={view.clueId} state={state} view={view} scene={scene} now={now} />}
      {scene === "dd-wager" && <DailyDoubleWager state={state} view={view} now={now} />}
      {finalScene && <FinalStage state={state} view={view} scene={scene} now={now} />}
    </div>
    <Rail state={state} view={view} scene={scene} now={now} />
    {scene === "dd-sting" && <DailyDoubleSting state={state} view={view} now={now} />}
  </div>;
}

/* the frame's chase while the board holds the room: magenta while the
   buzzers are live, the Daily Double's amber run, the Final's clock */
export function boardChrome(state, now) {
  const view = boardView(state, null, now);
  if (!view || view.finished) return null;
  const scene = tvBoardScene(view, now);
  if (scene === "armed") return { chase:{ color:"var(--lamp-live)", pace:"run" } };
  if (scene === "dd-sting") return { chase:{ color:"var(--sun)", pace:"run" } };
  if (scene === "final-clue") return { chase:{ color:"var(--lamp-live)", pace:"rest" } };
  return null;
}
/* TVMode's hook: the chase changes on the board's own instants */
export function useBoardChrome(state, fixedNow) {
  const [, wake] = useState(0);
  const fixed = fixedNow !== undefined;
  const now = fixed ? fixedNow : serverNow();
  const view = boardView(state, null, now);
  const next = view ? nextBoardInstant(view, now) : 0;
  useEffect(() => {
    if (fixed || !next) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, next - serverNow()) + 10);
    return () => clearTimeout(timer);
  }, [next, fixed]);
  return boardChrome(state, now);
}
