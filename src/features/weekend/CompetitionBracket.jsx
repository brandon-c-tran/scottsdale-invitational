import React, { useEffect, useRef } from "react";
import { Icon } from "../../ui/Icon.jsx";
import { bracketMatchName, disp, resolveSlot, resolveCurrentContest, ROUND_NAMES, teamLabel } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import "./competition-bracket.css";

/* Where every match sits, read from the bracket's own feeds. Walking down from
   the final, a feeder match takes a full slot and a bye takes half of one, so
   each match is centred between the two things that feed it and byes read as
   a gap, the way a printed bracket draws them. Units are card heights. */
export function bracketLayout(bracket) {
  const rounds = bracket?.rounds || [];
  const centers = rounds.map(round => round.map(() => null));
  const at = { cursor:0 };
  const last = rounds.length - 1;
  if (last >= 0) rounds[last].forEach((_, m) => placeTree(rounds, centers, last, m, at));
  /* anything no final reaches (never in built brackets) still gets a row */
  rounds.forEach((round, r) => round.forEach((_, m) => {
    if (centers[r][m] === null) { centers[r][m] = at.cursor + 0.5; at.cursor += 1; }
  }));
  return { centers, units:Math.max(at.cursor, 1) };
}
function placeTree(rounds, centers, r, m, at) {
  const match = rounds[r]?.[m];
  if (!match) return at.cursor;
  const side = slot => {
    if (slot?.w) return placeTree(rounds, centers, slot.w[0], slot.w[1], at);
    const center = at.cursor + 0.25;
    at.cursor += 0.5;
    return center;
  };
  const leaf = !match.a?.w && !match.b?.w;
  let center;
  if (leaf) { center = at.cursor + 0.5; at.cursor += 1; }
  else center = (side(match.a) + side(match.b)) / 2;
  centers[r][m] = center;
  return center;
}

/* A wide bracket drawn from both ends toward a final in the middle, the way
   a TV draws a field of 16: each half is laid out as bracketLayout lays out
   a whole bracket, the left half reads left to right, the right half right
   to left, and the shorter half is centred on the taller. cols gives each
   match its column, dirs the way its winner travels (1 right, -1 left). */
export function mirroredLayout(bracket) {
  const rounds = bracket?.rounds || [];
  const R = rounds.length, final = rounds[R - 1]?.[0];
  if (R < 2 || rounds[R - 1].length !== 1 || !final?.a?.w || !final?.b?.w) return null;
  const centers = rounds.map(round => round.map(() => null));
  const cols = rounds.map(round => round.map(() => null));
  const dirs = rounds.map(round => round.map(() => 1));
  const colCount = 2 * (R - 1) + 1;
  const halves = [final.a.w, final.b.w].map(([r, m], half) => {
    const at = { cursor:0 }, members = [];
    placeTree(rounds, centers, r, m, at);
    const walk = (wr, wm) => {
      members.push([wr, wm]);
      cols[wr][wm] = half ? colCount - 1 - wr : wr;
      dirs[wr][wm] = half ? -1 : 1;
      const match = rounds[wr][wm];
      [match.a, match.b].forEach(slot => { if (slot?.w) walk(slot.w[0], slot.w[1]); });
    };
    walk(r, m);
    return { units:at.cursor, members };
  });
  const units = Math.max(1, ...halves.map(half => half.units));
  halves.forEach(half => half.members.forEach(([r, m]) => { centers[r][m] += (units - half.units) / 2; }));
  /* every match hangs off the final in a built bracket; anything else draws flat */
  if (cols.slice(0, R - 1).some(round => round.some(col => col === null))) return null;
  centers[R - 1][0] = (centers[final.a.w[0]][final.a.w[1]] + centers[final.b.w[0]][final.b.w[1]]) / 2;
  cols[R - 1][0] = R - 1;
  return { centers, cols, dirs, colCount, units };
}

const SIZES = {
  /* two rounds stand side by side on a 390px phone: a round past them is a swipe, landing on its column */
  full:{ head:22, row:48, gap:14, minCol:160, colGap:28 },
  compact:{ head:0, row:28, gap:10, minCol:0, colGap:18 },
  /* a field past eight: the same picture at a glance, tighter rows */
  compactTall:{ head:0, row:22, gap:6, minCol:0, colGap:14 },
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

  const rounds = bracket.rounds;
  const R = rounds.length;
  const { centers, units } = bracketLayout(bracket);
  const dims = SIZES[!compact ? "full" : R >= 4 ? "compactTall" : "compact"];
  const cardH = dims.head + dims.row * 2 + 1 + 2;
  const unit = cardH + dims.gap;
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
    /* a bye (v3.1: the bottom of the board) enters already advanced: its
       line runs in from the round it skipped */
    if (slot?.t !== undefined && r > 0) {
      const y = rowY(r, m, index);
      connectors.push(<svg key={`${r}-${m}-${index}-bye`} className="fd-bracket-line is-bye" aria-hidden="true"
        viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ left:`calc(${colLeft(r)} - ${dims.colGap}px)`, width:dims.colGap, top:y - 1, height:2 }}>
        <path d="M0 50 H100" vectorEffect="non-scaling-stroke" />
      </svg>);
      return;
    }
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
        {!compact && <div className="fd-bracket-match-label"><span>{bracketMatchName(bracket, r, m)}</span>
          {/* the state is the lamp (the card is already lit live); the word stays for a reader */}
          {status && <strong className="fd-bracket-lamp"><i className={`fd-insert${status === "Betting open" ? " is-pending"
            : status === "Up next" ? " is-done" : ""}`} aria-hidden="true" /><span className="fd-bracket-sr fd-sr">{status}</span></strong>}</div>}
        {sides.map((key, index) => {
          const team = key === null || key === undefined ? null : draw.teams[key];
          const won = decided && match.winner === key, lost = decided && !!team && !won;
          const name = team ? teamLabel(state, team) : "TBD";
          const fullName = team?.players.map(player => disp(state, player)).join(" & ");
          const mine = !!team?.players.includes(me);
          const bye = r > 0 && [match.a, match.b][index]?.t !== undefined && !!team;
          const className = `fd-bracket-team${won ? " is-winner" : ""}${lost ? " is-loser" : ""}${mine ? " is-you" : ""}${team ? "" : " is-empty"}${bye ? " is-bye" : ""}`;
          const byeLamp = bye && <i className="fd-insert fd-bracket-bye" role="img" aria-label="Bye" />;
          if (compact) return <div key={index} className={className}>
            {byeLamp}
            {team && <span className="fd-bracket-faces" aria-hidden="true">{team.players.slice(0, 3).map(player =>
              <Avatar key={player} state={state} p={player} size={20} />)}</span>}
            <span className="fd-bracket-name">{name}</span>
            {won && <span className="fd-bracket-outcome" aria-hidden="true"><Icon name="check" size="1em" /></span>}
          </div>;
          const selectable = canRecord && isCurrent && !decided && sides.every(side => side !== null && side !== undefined);
          return <div key={index} className={className}>
            {byeLamp}
            {team && <div className="fd-bracket-players">{team.players.map(player => <button key={player} type="button"
              aria-label={`View ${disp(state, player)}'s player card`} disabled={pending || !onPlayer}
              onClick={() => onPlayer?.(player)}><Avatar state={state} p={player} size={26} /></button>)}</div>}
            <button type="button" className="fd-bracket-pick" disabled={!selectable || pending}
              aria-label={selectable ? `Winner: ${fullName}` : `${fullName || "To be determined"}${won ? ", winner" : ""}`}
              onClick={() => selectable && onPick(r, m, key)}>
              <span className="fd-bracket-name">{name}</span>
              {won && <span className="fd-bracket-outcome" aria-hidden="true"><Icon name="check" size="1em" /></span>}
              {selectable && <span className="fd-bracket-pick-hint">{pending ? "Saving…" : "Win"}</span>}
            </button>
          </div>;
        })}
      </div>;
    }))}
  </div>;

  const heads = <div className="fd-bracket-heads" style={{ minWidth:compact ? 0 : R * dims.minCol + (R - 1) * dims.colGap }}>
    {rounds.map((_, r) => <span key={r} style={{ left:colLeft(r), width:`calc(${colW})` }}>
      {/* one naming scheme everywhere: the round's own name (Round 1,
          Quarterfinals, Semifinals, Final), set tight enough to fit its column */}
      {names[r] || `Round ${r + 1}`}</span>)}
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
    <span className="fd-bracket-peek-head"><span>{label}</span><span>Full bracket <Icon name="open" size={16} /></span></span>
    <CompetitionBracket state={state} ev={ev} me={me} size="compact" />
  </button>;
}
