import React, { useLayoutEffect, useRef, useState } from "react";
import { ROUND_NAMES, resolveSlot, teamLabel } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { bracketLayout, mirroredLayout } from "../weekend/CompetitionBracket.jsx";
import { EASE } from "../../lib/motion.js";
import { ADVANCE_TIMING as T, bracketGeometry, railPoints, railPath, tokenKeyframes, useTimeline } from "./tvMotion.js";
import { sideNameFit } from "./tvModel.js";
import { Icon } from "../../ui/Icon.jsx";
import { RenameText } from "../teams/RenameText.jsx";

/* ── the bracket, drawn, at TV scale ──
   The same layout the phones draw (bracketLayout), rounds as columns and
   each winner carried forward, with every pair named. The match being
   played carries the UP NOW outline. A match decided freshly (M14) fills
   gold and stamps, the loser steps back, the winners ride the connector
   into their next slot, and the outline travels on; everyone else, and
   every reload, sees the bracket as it stands. */
const BRACKET_SIZES = {
  strip:{ row:36, gap:10, colGap:30, faces:0, token:30, tab:false },
  full:{ row:62, gap:20, colGap:56, faces:40, token:40, tab:true },
};
/* A field past eight (four rounds) is drawn from both ends toward the final
   in the middle, so it keeps the height of a six-team bracket. Its columns
   are narrower: names only, and the round heads shortened to fit. */
const MIRRORED_SIZES = {
  strip:{ row:36, gap:10, colGap:26, faces:0, token:30, tab:false },
  full:{ row:52, gap:16, colGap:34, faces:0, token:36, tab:true },
};
const TALL_FULL = { row:52, gap:16, colGap:56, faces:36, token:36, tab:true };
/* Beside the live board the rows grow to fill the panel's glass (`fit`, in
   canvas pixels), and a pair's name takes two lines before it would shrink
   or be cut. */
const SIDE_SIZES = {
  plain:{ gap:18, colGap:30, faces:0, token:30, tab:false },
  mirror:{ gap:12, colGap:24, faces:0, token:30, tab:false },
};
/* A big bracket (seven entrants up) gets the stage's full width as a band
   under the current match (`band`): rows sized to the band's height, every
   name at 24px or more on one line, the round heads shortened only when
   their column is too narrow to letter them whole. */
const BAND_SIZES = {
  plain:{ gap:12, colGap:56, faces:0, token:30, tab:true },
  mirror:{ gap:10, colGap:34, faces:0, token:30, tab:true },
};
export function sideBracketDims({ units, cols, fit, mirror = false, band = false }) {
  const base = band ? (mirror ? BAND_SIZES.mirror : BAND_SIZES.plain) : mirror ? SIDE_SIZES.mirror : SIDE_SIZES.plain;
  const row = Math.floor(((fit.height + base.gap) / Math.max(1, units) - base.gap - 3) / 2);
  const rowH = Math.max(band ? 28 : 36, Math.min(band ? 60 : 80, row));
  const colW = Math.floor((fit.width - (cols - 1) * base.colGap) / Math.max(1, cols));
  /* the card's padding and the won tick come off the name's width; a row
     too short for two lines of 24px keeps its name on one */
  const twoLines = rowH >= 56;
  return { ...base, row:rowH, colW, nameW:Math.max(40, colW - 28 - 34), twoLines,
    nameMax:twoLines ? Math.max(24, Math.min(34, Math.floor((rowH - 8) / 2))) : Math.max(24, Math.min(34, Math.floor((rowH - 4) / 1.18))) };
}
/* A round's head says what the phones say ("Quarterfinals"): whole where
   its column letters it, from the label size down to the canvas's 24px
   floor, then the short word ("Quarters"), and the initials ("QF") only
   where even that would not fit. Big Shoulders 700 capitals with the
   label's tracking run about 0.62em a letter. */
const ROUND_SHORT = { "Round 1":"R1", Quarterfinals:"QF", Semifinals:"SF", Semifinal:"SF", "Play-in":"Play-in" };
const SHORT_ROUNDS = { Quarterfinals:"Quarters", Semifinals:"Semis" };
const HEAD_MAX = 28, HEAD_MIN = 24, HEAD_EM = 0.62;
export function roundHeadFit(name, colW) {
  const room = Number(colW) > 0 ? Number(colW) - 4 : Infinity;
  for (const text of [name, SHORT_ROUNDS[name], ROUND_SHORT[name]]) {
    if (!text) continue;
    const size = Math.min(HEAD_MAX, Math.floor(room / (String(text).length * HEAD_EM)));
    if (size >= HEAD_MIN) return { text, size };
  }
  return { text:ROUND_SHORT[name] || name, size:HEAD_MIN };
}
export const roundHead = (name, colW) => roundHeadFit(name, colW).text;
const MIRROR_FROM_ROUNDS = 4;
const OUTLINE = 6;
/* the up-now tab (tvScenes.css): 38px over the outline, about 140 wide */
const UPNOW_TAB_H = 44, UPNOW_TAB_W = 140;
const keyOf = (r, m) => `${r}-${m}`;
const sameMatch = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

/* H10, the first byes this TV shows: a key on open glass (the final's
   column first, then the nearest), the bye's own mark (the dashed info line
   into its lamp) over who gets one. Only where the column letters it whole
   at the 24px floor. */
const BYE_KEY_H = 76, BYE_KEY_MIN_W = 210;
function ByeKey({ left, width, top, teach, now }) {
  /* its entrance and exit, read once against the room's clock */
  const [times] = useState(() => ({ in:Math.round(teach.start - now), out:Math.round(teach.end - now - 500) }));
  return <div className="tv-bye-key" role="img" aria-label="Bye: fewest chips skip the first round"
    style={{ left, width, top, height:BYE_KEY_H, "--tk-in":`${times.in}ms`, "--tk-out":`${times.out}ms` }}>
    <span className="tv-bye-key-mark" aria-hidden="true"><svg viewBox="0 0 40 4" preserveAspectRatio="none"><path d="M0 2H40" /></svg>
      <i className="fd-insert tv-bracket-bye" />Bye</span>
    <span className="tv-bye-key-who" aria-hidden="true">Fewest chips</span>
  </div>;
}

export function TVBracket({ state, ev, hot = null, size = "strip", motion = null, fit = null, teachBye = null, now = 0 }) {
  const bracket = state.brackets?.[ev?.id], draw = state.draws?.[ev?.id];
  const mirror = (bracket?.rounds?.length || 0) >= MIRROR_FROM_ROUNDS ? mirroredLayout(bracket) : null;
  const layout = mirror || (bracket ? bracketLayout(bracket) : null);
  const sizes = mirror ? MIRRORED_SIZES : BRACKET_SIZES;
  /* a full eight-team bracket (four first-round rows) steps its rows down to
     stay under a winner banner */
  const tall = !mirror && size === "full" && layout?.units > 3.5;
  const side = (size === "side" || size === "band") && !!fit && !!layout;
  const dims = side
    ? sideBracketDims({ units:layout.units, cols:mirror ? mirror.colCount : bracket.rounds.length, fit, mirror:!!mirror,
      band:size === "band" })
    : tall ? TALL_FULL : sizes[size] || sizes.strip;
  const timeline = useTimeline(bracket && draw && motion ? motion.id : null, motion?.anchor, T.total);
  const stage = useRef(null);
  const [width, setWidth] = useState(0);
  const playing = timeline.playing && !!motion;
  useLayoutEffect(() => {
    if (playing && stage.current) setWidth(stage.current.offsetWidth || 0);
  }, [playing, motion?.id]);
  /* the stage's width on the canvas (fixed), so a round's head and the bye
     key can be fitted to their column before the first paint */
  const [stageW, setStageW] = useState(0);
  useLayoutEffect(() => {
    const w = stage.current?.offsetWidth || 0;
    if (w && w !== stageW) setStageW(w);
  });
  if (!bracket || !draw) return null;

  const rounds = bracket.rounds;
  const R = rounds.length;
  const { centers } = layout;
  /* columns, not rounds: a mirrored bracket has every round but the final twice */
  const C = mirror ? mirror.colCount : R;
  const geo = bracketGeometry({ rounds:C, centers, units:layout.units, cols:mirror?.cols, dirs:mirror?.dirs }, dims, width);
  const { cardH, height } = geo;
  const colW = `((100% - ${(C - 1) * dims.colGap}px) / ${C})`;
  const colLeft = (c, px = 0) => `calc(${colW} * ${c} + ${c * dims.colGap + px}px)`;
  const names = ROUND_NAMES[bracket.size] || [];
  /* a column's width in canvas pixels: the side panel's own sizing, else
     the measured stage (unmeasured, as in a server render, it keeps the
     short words a mirrored bracket always fits) */
  const colPx = side ? dims.colW : stageW ? (stageW - (C - 1) * dims.colGap) / C : 0;
  /* the up-now tab stands over its match; on a column's top match it would
     rise into the round's head, so it hangs under the match instead where
     nothing is there, else the head letters the room left of it */
  let tabBelow = false, tabCol = -1;
  if (hot && dims.tab) {
    const [hr, hm] = hot, top = geo.top(hr, hm), col = geo.col(hr, hm);
    if (top - UPNOW_TAB_H < 0) {
      const reach = top + cardH + OUTLINE + UPNOW_TAB_H;
      const crowded = reach > height || rounds.some((round, r) => round.some((_, m) => (r !== hr || m !== hm)
        && geo.col(r, m) === col && geo.top(r, m) > top && geo.top(r, m) < reach + 4));
      if (crowded) tabCol = col; else tabBelow = true;
    }
  }
  const heads = Array.from({ length:C }, (_, c) => {
    const r = c < R ? c : C - 1 - c;
    const name = names[r] || `Round ${r + 1}`;
    if (colPx) return roundHeadFit(name, c === tabCol ? colPx - UPNOW_TAB_W - 8 : colPx);
    return { text:mirror ? SHORT_ROUNDS[name] || name : name, size:null };
  });

  /* what this step moves, by match */
  const moving = new Map(), arriving = new Map();
  if (playing) motion.matches.forEach(item => {
    moving.set(keyOf(item.r, item.m), item);
    if (item.target) arriving.set(keyOf(item.target.r, item.target.m), { ...item.target, from:item });
  });
  const style = playing ? { "--tl":`${-Math.round(timeline.elapsed)}ms` } : undefined;

  const lines = [];
  rounds.forEach((round, r) => round.forEach((match, m) => [match.a, match.b].forEach((slot, index) => {
    /* a bye (v3.1: the bottom of the board) enters already advanced */
    if (slot?.t !== undefined && r > 0) {
      const y = geo.rowY(r, m, index), leftward = geo.dir(r, m) < 0;
      lines.push(<svg key={`${r}-${m}-${index}-bye`} className="tv-bracket-line is-on is-bye" aria-hidden="true"
        viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ left:leftward ? `calc(${colLeft(geo.col(r, m))} + ${colW})` : colLeft(geo.col(r, m), -dims.colGap),
          width:dims.colGap, top:y - 2, height:4 }}>
        <path d="M0 50 H100" vectorEffect="non-scaling-stroke" />
      </svg>);
      return;
    }
    if (!slot?.w) return;
    const [fr, fm] = slot.w;
    const y1 = geo.center(fr, fm), y2 = geo.rowY(r, m, index);
    const top = Math.min(y1, y2) - 2, h = Math.abs(y2 - y1) + 4;
    const a = ((y1 - top) / h) * 100, b = ((y2 - top) / h) * 100;
    const decided = rounds[fr][fm].winner !== null && rounds[fr][fm].winner !== undefined;
    /* the rail the winners are riding draws itself on top */
    const riding = moving.has(keyOf(fr, fm)) && width > 0;
    /* a right-half connector leaves its card's left edge */
    const leftward = geo.dir(fr, fm) < 0;
    lines.push(<svg key={`${r}-${m}-${index}`} className={`tv-bracket-line${decided && !riding ? " is-on" : ""}`} aria-hidden="true"
      viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ left:leftward ? colLeft(geo.col(fr, fm), -dims.colGap) : `calc(${colLeft(geo.col(fr, fm))} + ${colW})`,
        width:dims.colGap, top, height:h }}>
      <path d={leftward ? `M100 ${a} H50 V${b} H0` : `M0 ${a} H50 V${b} H100`} vectorEffect="non-scaling-stroke" />
    </svg>);
  })));

  /* the bye key takes the first open stretch of glass, the final's column
     first, then the columns nearest it: nothing there but the stage */
  let byeKey = null;
  if (teachBye?.active && colPx >= BYE_KEY_MIN_W) {
    const taken = Array.from({ length:C }, () => []);
    rounds.forEach((round, r) => round.forEach((_, m) => {
      const isHot = !!hot && hot[0] === r && hot[1] === m;
      const top = geo.top(r, m) - OUTLINE - (isHot && !tabBelow ? UPNOW_TAB_H : 0);
      const bottom = geo.top(r, m) + cardH + OUTLINE + (isHot && tabBelow ? UPNOW_TAB_H : 0);
      taken[geo.col(r, m)].push([top, bottom]);
    }));
    const fc = geo.col(R - 1, 0);
    const order = Array.from({ length:C }, (_, c) => c).sort((a, b) => Math.abs(a - fc) - Math.abs(b - fc) || a - b);
    for (const c of order) {
      const spans = taken[c].sort((a, b) => a[0] - b[0]);
      let from = 0, top = null;
      for (const [t, b] of [...spans, [height + 12, height + 12]]) {
        if (t - 12 - from >= BYE_KEY_H) { top = Math.round(from + (t - 12 - from - BYE_KEY_H) / 2); break; }
        from = Math.max(from, b + 12);
      }
      if (top !== null) {
        byeKey = <ByeKey key={teachBye.key} left={colLeft(c)} width={`calc(${colW})`} top={top} teach={teachBye} now={now} />;
        break;
      }
    }
  }
  const hotFrom = playing ? motion.hotFrom : null;
  const outlineMoves = playing && !sameMatch(hotFrom, hot);
  return (
    <div className={`tv-bracket is-${size}${mirror ? " is-mirrored" : ""}${playing ? " is-advancing" : ""}`}
      aria-label={`${ev.name} bracket`} style={style}>
      <div className="tv-bracket-heads">
        {heads.map((head, c) => <span key={c} className="tv-label"
          style={{ left:colLeft(c), width:`calc(${colW})`, ...(head.size ? { fontSize:head.size } : {}) }}>{head.text}</span>)}
      </div>
      <div ref={stage} className="tv-bracket-stage" style={{ height }}>
        {lines}
        {rounds.map((round, r) => round.map((match, m) => {
          const decided = match.winner !== null && match.winner !== undefined;
          const step = moving.get(keyOf(r, m));
          const landing = arriving.get(keyOf(r, m));
          const isHot = !!hot && hot[0] === r && hot[1] === m;
          return (
            <div key={`${r}-${m}`} className={`tv-bracket-match${isHot ? " is-up" : ""}${landing ? " is-landing" : ""}`}
              style={{ left:colLeft(geo.col(r, m)), width:`calc(${colW})`, top:geo.top(r, m), height:cardH }}>
              {[resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)].map((key, index) => {
                const team = key === null || key === undefined ? null : draw.teams[key];
                const won = decided && match.winner === key, lost = decided && !!team && !won;
                const winMoment = !!step && won;
                const loseMoment = !!step && lost;
                const arrive = !!landing && landing.index === index && !!team;
                const bye = r > 0 && [match.a, match.b][index]?.t !== undefined && !!team;
                const content = <>
                  {bye && <i className="fd-insert tv-bracket-bye" role="img" aria-label="Bye" />}
                  {dims.faces > 0 && team && <span className="tv-bracket-faces">
                    {team.players.slice(0, 3).map(p => <ChipFace key={p} p={p} size={dims.faces} />)}</span>}
                  <BracketName text={team ? teamLabel(state, team) : "TBD"} dims={side ? dims : null} />
                </>;
                return (
                  <div key={index} className={`tv-bracket-team${won ? " is-won" : ""}${lost ? " is-lost" : ""}${team ? "" : " is-empty"}${loseMoment ? " is-lose-moment" : ""}${arrive ? " is-arriving" : ""}`}
                    style={{ height:dims.row }}>
                    {content}
                    {won && <span className="tv-bracket-won" role="img" aria-label="won"><Icon name="check" size="1em" /></span>}
                    {arrive && <span className="tv-br-was" aria-hidden="true"><span className="tv-bracket-name">TBD</span></span>}
                    {winMoment && <span className="tv-br-win" aria-hidden="true">
                      {content}<span className="tv-br-stamp">Won</span></span>}
                  </div>
                );
              })}
            </div>
          );
        }))}
        {byeKey}
        {hot && <UpNowOutline key="up" at={hot} tabBelow={tabBelow} from={outlineMoves ? hotFrom : null} geo={geo} dims={dims} colLeft={colLeft}
          colW={colW} playing={playing} elapsed={timeline.elapsed} width={width} motionId={motion?.id} />}
        {outlineMoves && !hot && hotFrom && <UpNowOutline key="gone" at={hotFrom} leaving geo={geo} dims={dims} colLeft={colLeft}
          colW={colW} playing elapsed={timeline.elapsed} width={width} motionId={motion?.id} />}
        {playing && width > 0 && motion.matches.filter(item => item.target).map(item => {
          const team = draw.teams[item.winner];
          return team ? <Ride key={keyOf(item.r, item.m)} state={state} item={item} team={team} geo={geo} dims={dims}
            elapsed={timeline.elapsed} /> : null;
        })}
      </div>
    </div>
  );
}

/* A pair's name: one line where it fits; beside the live board, two lines
   broken at the "&" before it would shrink or be cut. */
function BracketName({ text, dims = null }) {
  if (!dims) return <RenameText name={text} className="tv-bracket-name" />;
  const fit = dims.twoLines === false
    ? { size:Math.max(24, Math.min(dims.nameMax, Math.floor(dims.nameW / Math.max(1, String(text).length * 0.52)))), lines:[text] }
    : sideNameFit(text, dims.nameW, { max:dims.nameMax, min:Math.min(dims.nameMax, 28), caps:true });
  return (
    <RenameText name={text} className={`tv-bracket-name${fit.lines.length > 1 ? " is-two" : ""}`} style={{ fontSize:fit.size }}>
      {fit.lines.length > 1 ? <>{fit.lines[0]}<br />{fit.lines[1]}</> : text}</RenameText>
  );
}

/* The gold outline around the match being played. At rest it sits on its
   match by the same percentages as the cards; when it moves, it slides
   there from the match just decided. */
function UpNowOutline({ at, from = null, leaving = false, tabBelow = false, geo, dims, colLeft, colW, playing, elapsed, width, motionId }) {
  const el = useRef(null);
  const [r, m] = at;
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !playing || typeof node.animate !== "function") return undefined;
    let animation = null;
    const timing = { duration:T.upNowMs, delay:T.upNow - elapsed, easing:EASE.out, fill:"both" };
    try {
      if (leaving) animation = node.animate([{ opacity:1 }, { opacity:0 }], timing);
      else if (!from) animation = node.animate([{ opacity:0 }, { opacity:1 }], timing);
      else if (width > 0) {
        const dx = geo.left(from[0], from[1]) - geo.left(r, m), dy = geo.top(from[0], from[1]) - geo.top(r, m);
        animation = node.animate([{ transform:`translate(${dx}px, ${dy}px)` }, { transform:"translate(0px, 0px)" }], timing);
      }
    } catch { animation = null; }
    return () => animation?.cancel();
  }, [motionId, playing, width]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={el} className={`tv-bracket-upnow${leaving ? " is-leaving" : ""}${tabBelow ? " is-tab-below" : ""}`} aria-hidden="true"
      style={{ left:colLeft(geo.col(r, m), -OUTLINE), width:`calc(${colW} + ${OUTLINE * 2}px)`, top:geo.top(r, m) - OUTLINE,
        height:geo.cardH + OUTLINE * 2 }}>
      {dims.tab && <span className="tv-bracket-upnow-tab"><i className="fd-beat-dot tv-beat" />Up now</span>}
    </div>
  );
}

/* the winners' faces riding the connector into their next slot, and the
   connector drawing sun behind them */
function Ride({ state, item, team, geo, dims, elapsed }) {
  const token = useRef(null);
  const faces = team.players.slice(0, 3);
  const w = faces.length * dims.token + (faces.length - 1) * 4 + 16, h = dims.token + 16;
  const pts = railPoints(geo, dims, item, item.target, 14 + w / 2);
  useLayoutEffect(() => {
    const node = token.current;
    if (!node || typeof node.animate !== "function") return undefined;
    const { keyframes, duration } = tokenKeyframes(pts, { w, h });
    let animation = null;
    try { animation = node.animate(keyframes, { duration, delay:T.lift - elapsed, easing:"linear", fill:"both" }); } catch {}
    return () => animation?.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const wide = Math.ceil(Math.max(...pts.map(p => p[0]))) + 4, tall = Math.ceil(Math.max(...pts.map(p => p[1]))) + 4;
  return <>
    <svg className="tv-br-rail" width={wide} height={tall} viewBox={`0 0 ${wide} ${tall}`} aria-hidden="true">
      <path d={railPath(pts)} pathLength="1" />
    </svg>
    <div ref={token} className="tv-br-token" aria-hidden="true" style={{ width:w, height:h }}>
      {faces.map(p => <ChipFace key={p} p={p} size={dims.token} />)}
    </div>
  </>;
}
