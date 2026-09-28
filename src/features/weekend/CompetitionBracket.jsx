import React, { useEffect, useRef } from "react";
import { disp, resolveSlot, resolveCurrentContest, ROUND_NAMES, teamLabel } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import "./competition-bracket.css";

/* Where every match sits, read from the bracket's own feeds. Walking down from
   the final, a feeder match takes a full slot and a bye takes half of one, so
   each match is centred between the two things that feed it and byes read as
   a gap, the way a printed bracket draws them. Units are card heights. */
export function bracketLayout(bracket) {
  const rounds = bracket?.rounds || [];
  const centers = rounds.map(round => round.map(() => null));
  let cursor = 0;
  const place = (r, m) => {
    const match = rounds[r]?.[m];
    if (!match) return cursor;
    const side = slot => {
      if (slot?.w) return place(slot.w[0], slot.w[1]);
      const center = cursor + 0.25;
      cursor += 0.5;
      return center;
    };
    const leaf = !match.a?.w && !match.b?.w;
    let center;
    if (leaf) { center = cursor + 0.5; cursor += 1; }
    else center = (side(match.a) + side(match.b)) / 2;
    centers[r][m] = center;
    return center;
  };
  const last = rounds.length - 1;
  if (last >= 0) rounds[last].forEach((_, m) => place(last, m));
  /* anything no final reaches (never in built brackets) still gets a row */
  rounds.forEach((round, r) => round.forEach((_, m) => {
    if (centers[r][m] === null) { centers[r][m] = cursor + 0.5; cursor += 1; }
  }));
  return { centers, units:Math.max(cursor, 1) };
}

const SIZES = {
  full:{ head:22, row:48, gap:14, minCol:210, colGap:34 },
  compact:{ head:0, row:28, gap:10, minCol:0, colGap:18 },
};

const statusOf = (contest, isCurrent) => !isCurrent ? null
  : contest.phase === "in-progress" ? "Playing" : contest.phase === "betting-open" ? "Betting open"
    : contest.phase === "awaiting-result" ? "Awaiting result" : "Up next";

/* A real bracket: rounds are columns, lines carry each winner forward.
   Team targets and player-card targets are siblings: viewing a player can
   never record a winner. compact is a read-only picture sized to its column;
   its caller makes the whole thing one target that opens the full bracket. */
export function CompetitionBracket({ state, ev, me, gm=false, onPick, onPlayer, size="md", hot, pending=false, pickable=true }) {
  const bracket = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  const scroller = useRef(null);
  const compact = size === "compact";
  const contest = bracket && draw ? resolveCurrentContest(state, ev) : null;
  const active = contest?.kind === "match" ? contest.match : null;
  /* open on the match that matters: scroll the current column into view */
  useEffect(() => {
    const el = scroller.current;
    if (!el || compact || !active || el.scrollWidth <= el.clientWidth) return;
    const card = el.querySelector(".fd-bracket-match.is-current");
    if (card) el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
  }, [compact, active?.[0], active?.[1]]); // eslint-disable-line
  if (!bracket || !draw) return null;

  const dims = SIZES[compact ? "compact" : "full"];
  const cardH = dims.head + dims.row * 2 + 1 + 2;
  const unit = cardH + dims.gap;
  const rounds = bracket.rounds;
  const R = rounds.length;
  const { centers, units } = bracketLayout(bracket);
  const height = Math.ceil(units * unit);
  /* columns share the stage width; a full bracket never squeezes below minCol */
  const colW = `((100% - ${(R - 1) * dims.colGap}px) / ${R})`;
  const colLeft = r => `calc(${colW} * ${r} + ${r * dims.colGap}px)`;
  const topOf = (r, m) => centers[r][m] * unit - cardH / 2;
  const rowY = (r, m, index) => topOf(r, m) + 1 + dims.head + dims.row / 2 + index * (dims.row + 1);
  /* pickable=false: the caller draws its own winner targets beside it */
  const canRecord = pickable && gm && !!onPick && contest?.phase === "in-progress"
    && !state.frozen && !state.results?.[ev.id] && !state.poker && !state.shelved?.[ev.id];
  const names = ROUND_NAMES[bracket.size] || [];

  /* one elbow per fed slot, from the feeder's right edge to the slot it fills */
  const connectors = [];
  rounds.forEach((round, r) => round.forEach((match, m) => [match.a, match.b].forEach((slot, index) => {
    if (!slot?.w) return;
    const [fr, fm] = slot.w;
    const y1 = centers[fr][fm] * unit, y2 = rowY(r, m, index);
    const top = Math.min(y1, y2) - 1, h = Math.abs(y2 - y1) + 2;
    const decided = rounds[fr][fm].winner !== null && rounds[fr][fm].winner !== undefined;
    const a = ((y1 - top) / h) * 100, b = ((y2 - top) / h) * 100;
    connectors.push(<svg key={`${r}-${m}-${index}`} className={`fd-bracket-line${decided ? " is-advanced" : ""}`}
      aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ left:`calc(${colLeft(fr)} + ${colW})`, width:dims.colGap, top, height:h }}>
      <path d={`M0 ${a} H50 V${b} H100`} vectorEffect="non-scaling-stroke" />
    </svg>);
  })));

  const stage = <div className="fd-bracket-stage" style={{ height,
    minWidth:compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap }}>
    {connectors}
    {rounds.map((round, r) => round.map((match, m) => {
      const sides = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
      const isCurrent = active?.[0] === r && active?.[1] === m;
      const highlighted = isCurrent || hot?.[0] === r && hot?.[1] === m;
      const decided = match.winner !== null && match.winner !== undefined;
      const status = statusOf(contest, isCurrent);
      return <div key={`${r}-${m}`} className={`fd-bracket-match${highlighted ? " is-current" : ""}${decided ? " is-decided" : ""}`}
        style={{ left:colLeft(r), width:`calc(${colW})`, top:topOf(r, m), height:cardH }}
        aria-label={`${names[r] || `Round ${r + 1}`}, match ${m + 1}${status ? `, ${status.toLowerCase()}` : ""}`}>
        {!compact && <div className="fd-bracket-match-label"><span>{round.length > 1
          ? `${(names[r] || "Match").replace(/s$/, "")} ${m + 1}` : names[r] || "Match"}</span>
          {status && <strong>{status}</strong>}</div>}
        {sides.map((key, index) => {
          const team = key === null || key === undefined ? null : draw.teams[key];
          const won = decided && match.winner === key, lost = decided && !!team && !won;
          const name = team ? teamLabel(state, team) : "TBD";
          const fullName = team?.players.map(player => disp(state, player)).join(" & ");
          const mine = !!team?.players.includes(me);
          const className = `fd-bracket-team${won ? " is-winner" : ""}${lost ? " is-loser" : ""}${mine ? " is-you" : ""}${team ? "" : " is-empty"}`;
          if (compact) return <div key={index} className={className}>
            {team && <span className="fd-bracket-faces" aria-hidden="true">{team.players.slice(0, 3).map(player =>
              <Avatar key={player} state={state} p={player} size={20} />)}</span>}
            <span className="fd-bracket-name">{name}</span>
            {won && <span className="fd-bracket-outcome" aria-hidden="true">✓</span>}
          </div>;
          const selectable = canRecord && isCurrent && !decided && sides.every(side => side !== null && side !== undefined);
          return <div key={index} className={className}>
            {team && <div className="fd-bracket-players">{team.players.map(player => <button key={player} type="button"
              aria-label={`View ${disp(state, player)}'s player card`} disabled={pending || !onPlayer}
              onClick={() => onPlayer?.(player)}><Avatar state={state} p={player} size={26} /></button>)}</div>}
            <button type="button" className="fd-bracket-pick" disabled={!selectable || pending}
              aria-label={selectable ? `Winner: ${fullName}` : `${fullName || "To be determined"}${won ? ", winner" : ""}`}
              onClick={() => selectable && onPick(r, m, key)}>
              <span className="fd-bracket-name">{name}</span>
              {won && <span className="fd-bracket-outcome" aria-hidden="true">✓</span>}
              {selectable && <span className="fd-bracket-pick-hint">{pending ? "Saving…" : "Win"}</span>}
            </button>
          </div>;
        })}
      </div>;
    }))}
  </div>;

  const heads = <div className="fd-bracket-heads" style={{ minWidth:compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap }}>
    {rounds.map((_, r) => <span key={r} style={{ left:colLeft(r), width:`calc(${colW})` }}>{names[r] || `Round ${r + 1}`}</span>)}
  </div>;

  if (compact) return <div className="fd-competition-bracket is-compact" aria-hidden="true">
    <div className="fd-bracket-scroll">{heads}{stage}</div>
  </div>;
  return <section className="fd-competition-bracket" aria-label={`${ev.name} bracket`} aria-busy={pending}>
    <div className="fd-bracket-scroll" ref={scroller}>{heads}{stage}</div>
  </section>;
}

/* The bracket at a glance, wherever the live game is: one target that opens
   the full bracket. Nothing inside it is separately tappable. */
export function BracketPeek({ state, ev, me, onOpen, label = "Bracket", card = false }) {
  if (!state.brackets?.[ev?.id] || !state.draws?.[ev.id]) return null;
  return <button type="button" className={`fd-bracket-peek${card ? " is-card" : ""}`} onClick={() => onOpen(ev)}
    aria-label={`Open the full ${ev.name} bracket`}>
    <span className="fd-bracket-peek-head"><span>{label}</span><span>Full bracket <span aria-hidden="true">↗</span></span></span>
    <CompetitionBracket state={state} ev={ev} me={me} size="compact" />
  </button>;
}
