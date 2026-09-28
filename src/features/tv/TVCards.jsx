import React from "react";
import { ROSTER, ROUND_NAMES, EDITION, disp, resolveSlot, teamLabel, stageEntrantView } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { bracketLayout } from "../weekend/CompetitionBracket.jsx";
import {
  fmt, signed, editionLabel, readableInk, phaseBand, placeName, stackRace, weekendProgress, duelBoard,
  playerWeekendStats,
} from "./tvModel.js";

/* ─────────── the prize ───────────
   An actually-turned trophy: every part is a real solid of revolution built
   from a ring of facets, back faces culled. Flat facet tones, no glow. */
function trophyRing({ key, topR, botR, h, yTop, n, hue, lo = 0.72 }) {
  const slant = Math.hypot(h, topR - botR);
  const tilt = Math.atan2(topR - botR, h) * 180 / Math.PI;
  const wTop = 2 * topR * Math.tan(Math.PI / n) + 0.6;
  const wBot = 2 * botR * Math.tan(Math.PI / n) + 0.6;
  const w = Math.max(wTop, wBot);
  const rMid = (topR + botR) / 2;
  const inset = t => 50 - 50 * (t / w);
  return Array.from({ length:n }, (_, i) => {
    const mix = Math.round(100 - (100 - lo * 100) * (1 - Math.cos(i * 2 * Math.PI / n)) / 2);
    return (
      <div key={`${key}${i}`} style={{
        position:"absolute", left:"50%", top:0, width:w, height:slant, marginLeft:-w / 2,
        backgroundColor:`var(${hue})`,
        background:`color-mix(in srgb, var(${hue}) ${mix}%, var(--ink0))`,
        backfaceVisibility:"hidden",
        clipPath:`polygon(${inset(wTop)}% 0%, ${100 - inset(wTop)}% 0%, ${100 - inset(wBot)}% 100%, ${inset(wBot)}% 100%)`,
        transform:`translateY(${yTop + h / 2 - slant / 2}px) rotateY(${i * 360 / n}deg) `
          + `translateZ(${rMid}px) rotateX(${-tilt}deg)`,
      }} />
    );
  });
}
export function TrophyHero({ size = 190, plate = "FIELD DAY" }) {
  const S = size;
  const cupTop = 0.27 * S, cupBot = 0.115 * S;
  const parts = [
    { key:"rim",  topR:0.285 * S, botR:0.275 * S, h:0.045 * S, yTop:0.04 * S, n:20, hue:"--sun", lo:0.8 },
    { key:"cup",  topR:cupTop,    botR:cupBot,    h:0.29 * S,  yTop:0.085 * S, n:20, hue:"--sun" },
    { key:"neck", topR:cupBot,    botR:0.045 * S, h:0.045 * S, yTop:0.375 * S, n:16, hue:"--sun", lo:0.62 },
    { key:"stem", topR:0.042 * S, botR:0.042 * S, h:0.115 * S, yTop:0.42 * S,  n:14, hue:"--sun", lo:0.6 },
    { key:"coll", topR:0.05 * S,  botR:0.15 * S,  h:0.05 * S,  yTop:0.535 * S, n:18, hue:"--sun", lo:0.68 },
    { key:"base", topR:0.16 * S,  botR:0.16 * S,  h:0.045 * S, yTop:0.585 * S, n:20, hue:"--sun", lo:0.7 },
    { key:"blk",  topR:0.185 * S, botR:0.185 * S, h:0.1 * S,   yTop:0.63 * S,  n:22, hue:"--accent", lo:0.66 },
  ];
  return (
    <div style={{ width:S, height:S * 0.82, perspective:5.5 * S, flexShrink:0 }} aria-hidden="true">
      <div data-trophy style={{ position:"relative", width:"100%", height:"100%", transformStyle:"preserve-3d",
        transform:"rotateX(-8deg)", animation:"si-trophy 16s linear infinite" }}>
        {parts.map(p => trophyRing(p))}
        <div style={{ position:"absolute", left:"50%", top:0, width:0.55 * S, height:0.55 * S,
          marginLeft:-0.275 * S, borderRadius:"50%", backgroundColor:"var(--ink0)",
          transform:`translateY(${0.045 * S - 0.275 * S}px) rotateX(90deg)` }} />
        {[1, -1].map(dir => (
          <svg key={dir} width={S} height={S * 0.82} viewBox="0 0 100 82"
            style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--ink0)" strokeWidth="6.4" strokeLinecap="round"/>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--sun)" strokeWidth="3.4" strokeLinecap="round"/>
          </svg>
        ))}
        {[0, 180].map(deg => (
          <div key={deg} style={{ position:"absolute", left:"50%", top:0, width:0.3 * S, height:0.1 * S,
            marginLeft:-0.15 * S, display:"flex", alignItems:"center", justifyContent:"center",
            backfaceVisibility:"hidden", fontFamily:"var(--fd-display)", fontWeight:700, fontSize:Math.max(24, 0.052 * S),
            letterSpacing:"0.06em", color:"var(--bone)", whiteSpace:"nowrap",
            transform:`translateY(${0.63 * S}px) rotateY(${deg}deg) translateZ(${0.187 * S}px)` }}>
            {plate}</div>
        ))}
      </div>
    </div>
  );
}

/* The champion, full frame, in their own identity color the way their
   player card wears it: a trophy with a plate for every event winner, the
   final stack, wins, and the path to the title. A tie stays on night. */
export function ChampionMoment({ state, view }) {
  const lead = view.players[0];
  const identity = usePlayerIdentity(lead);
  const color = view.tied ? null : identity.color;
  const ink = color ? readableInk(color) : "var(--bone)";
  const names = view.players.map(p => disp(state, p));
  return (
    <div className="tv-pane tv-champ-pane">
      <div className={`tv-champ${view.tied ? " is-tied" : ""}`}
        style={color ? { background:color, color:ink, "--champ-ink":ink } : undefined}>
        <div className="tv-champ-prize">
          <TrophyHero size={view.plates.length > 7 ? 330 : 420} plate="FIELD DAY" />
          <div className="tv-plates" style={{ gridTemplateColumns:view.plates.length > 7 ? "1fr 1fr" : "1fr" }}>
            {view.plates.map(plate => (
              <div key={plate.eventId} className="tv-plate"><b>{plate.name}</b><span>{plate.winner}</span></div>
            ))}
          </div>
        </div>
        <div className="tv-champ-body">
          <div className="tv-champ-tag">Champion</div>
          <div className="tv-champ-faces">
            {view.players.map(p => <Avatar key={p} state={state} p={p} size={view.players.length > 1 ? 180 : 230}
              style={{ border:"5px solid var(--champ-ink, var(--bone))" }} />)}
          </div>
          <div className="tv-champ-name" style={{ fontSize:names.join(" & ").length > 18 ? 104 : 150 }}>
            {names.join(" & ")}</div>
          <div className="tv-champ-stats">
            <span><b>{fmt(view.pts)}</b> final stack</span>
            <span><b>{view.wins}</b> win{view.wins === 1 ? "" : "s"}</span>
            {view.betNet !== 0 && <span><b>{signed(view.betNet)}</b> bets</span>}
          </div>
          {view.tied ? <div className="tv-champ-path">Tied. One pressure putt decides it.</div>
            : view.path.length > 0 && (
              <div className="tv-champ-path">
                {view.path.map(item => <span key={item.eventId}>{item.label}</span>)}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/* ── the bracket, drawn, at TV scale ──
   The same layout the phones draw (bracketLayout), rounds as columns and
   each winner carried forward, with every pair named. */
const BRACKET_SIZES = {
  strip:{ row:36, gap:10, colGap:30, faces:0 },
  full:{ row:62, gap:20, colGap:56, faces:40 },
};
export function TVBracket({ state, ev, hot = null, size = "strip" }) {
  const bracket = state.brackets?.[ev?.id], draw = state.draws?.[ev?.id];
  if (!bracket || !draw) return null;
  const dims = BRACKET_SIZES[size];
  const cardH = dims.row * 2 + 3;
  const unit = cardH + dims.gap;
  const rounds = bracket.rounds;
  const R = rounds.length;
  const { centers, units } = bracketLayout(bracket);
  const height = Math.ceil(units * unit - dims.gap);
  const colW = `((100% - ${(R - 1) * dims.colGap}px) / ${R})`;
  const colLeft = r => `calc(${colW} * ${r} + ${r * dims.colGap}px)`;
  const topOf = (r, m) => centers[r][m] * unit - unit / 2;
  const rowY = (r, m, index) => topOf(r, m) + 1 + dims.row / 2 + index * (dims.row + 1);
  const names = ROUND_NAMES[bracket.size] || [];
  const lines = [];
  rounds.forEach((round, r) => round.forEach((match, m) => [match.a, match.b].forEach((slot, index) => {
    if (!slot?.w) return;
    const [fr, fm] = slot.w;
    const y1 = centers[fr][fm] * unit - unit / 2 + cardH / 2, y2 = rowY(r, m, index);
    const top = Math.min(y1, y2) - 2, h = Math.abs(y2 - y1) + 4;
    const a = ((y1 - top) / h) * 100, b = ((y2 - top) / h) * 100;
    const decided = rounds[fr][fm].winner !== null && rounds[fr][fm].winner !== undefined;
    lines.push(<svg key={`${r}-${m}-${index}`} className={`tv-bracket-line${decided ? " is-on" : ""}`} aria-hidden="true"
      viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ left:`calc(${colLeft(fr)} + ${colW})`, width:dims.colGap, top, height:h }}>
      <path d={`M0 ${a} H50 V${b} H100`} vectorEffect="non-scaling-stroke" />
    </svg>);
  })));
  return (
    <div className={`tv-bracket is-${size}`} aria-label={`${ev.name} bracket`}>
      <div className="tv-bracket-heads">
        {rounds.map((_, r) => <span key={r} className="tv-label" style={{ left:colLeft(r), width:`calc(${colW})` }}>
          {names[r] || `Round ${r + 1}`}</span>)}
      </div>
      <div className="tv-bracket-stage" style={{ height }}>
        {lines}
        {rounds.map((round, r) => round.map((match, m) => {
          const decided = match.winner !== null && match.winner !== undefined;
          const isHot = !!hot && hot[0] === r && hot[1] === m;
          return (
            <div key={`${r}-${m}`} className={`tv-bracket-match${isHot ? " is-hot" : ""}`}
              style={{ left:colLeft(r), width:`calc(${colW})`, top:topOf(r, m), height:cardH }}>
              {[resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)].map((key, index) => {
                const team = key === null || key === undefined ? null : draw.teams[key];
                const won = decided && match.winner === key, lost = decided && !!team && !won;
                return (
                  <div key={index} className={`tv-bracket-team${won ? " is-won" : ""}${lost ? " is-lost" : ""}${team ? "" : " is-empty"}`}
                    style={{ height:dims.row }}>
                    {dims.faces > 0 && team && <span className="tv-bracket-faces">
                      {team.players.slice(0, 3).map(p => <Avatar key={p} state={state} p={p} size={dims.faces} />)}</span>}
                    <span className="tv-bracket-name">{team ? teamLabel(state, team) : "TBD"}</span>
                    {won && <span className="tv-bracket-won" aria-label="won">✓</span>}
                  </div>
                );
              })}
            </div>
          );
        }))}
      </div>
    </div>
  );
}

/* heats and pools with every entrant named; qualifiers stay bright */
export function StageGroups({ state, ev }) {
  const st = state.stages?.[ev?.id];
  if (!st) return null;
  return (
    <div className="tv-stage-groups" aria-label={st.kind === "heats" ? "Heats" : "Pools"}>
      {st.groups.map((group, gi) => (
        <div key={gi} className="tv-stage-group">
          <div className="tv-label">{group.name}</div>
          <div className="tv-stage-names">
            {group.entrants.map(key => {
              const view = stageEntrantView(state, st, key);
              const through = (group.through || []).includes(key);
              return <span key={String(key)} className={group.through?.length ? (through ? "is-through" : "is-out") : ""}>
                {view.name}</span>;
            })}
          </div>
        </div>
      ))}
      {st.finalWinner !== null && st.finalWinner !== undefined && (
        <div className="tv-stage-group">
          <div className="tv-label">Final</div>
          <div className="tv-stage-names"><span className="is-through">{stageEntrantView(state, st, st.finalWinner).name}</span></div>
        </div>
      )}
    </div>
  );
}

/* ── idle cards ── */

/* the weekend so far: every event, each winner's chip */
export function WeekendProgressCard({ state, events }) {
  const rows = weekendProgress(state, events);
  const half = Math.ceil(rows.length / 2);
  const done = rows.filter(row => row.status === "done").length;
  return (
    <div className="tv-pane">
      <div className="tv-card-head">
        <div className="tv-display tv-title" style={{ fontSize:56 }}>The weekend</div>
        <div className="tv-label">{done} of {rows.filter(row => row.status !== "skipped").length} played</div>
      </div>
      <div className="tv-progress">
        {[rows.slice(0, half), rows.slice(half)].map((col, ci) => (
          <div key={ci} className="tv-progress-col">
            {col.map(row => (
              <div key={row.id} className={`tv-progress-row is-${row.status}`}>
                <span className="tv-progress-band" style={{ background:phaseBand(row) }} />
                <GameMark id={row.game} size={44} />
                <span className="tv-progress-name">{row.name}</span>
                <span className="tv-progress-result">
                  {row.status === "done" ? <>
                    {row.winners.slice(0, 3).map(p => <ChipFace key={p} p={p} size={40} />)}
                    <span>{row.winnerName}</span>
                  </> : row.status === "live" ? <span className="is-live">Live</span>
                    : row.status === "skipped" ? <span>Skipped</span> : null}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RaceRow({ state, row }) {
  const identity = usePlayerIdentity(row.player);
  return (
    <div className="tv-race-row">
      <span className="tv-rank">{row.rank}</span>
      <span className="tv-race-name">{disp(state, row.player)}</span>
      <span className="tv-race-track">
        <span className="tv-race-bar" style={{ width:`${Math.max(2, row.share * 100)}%`, background:identity.color }} />
        <ChipFace p={row.player} size={42} />
      </span>
      <span className="tv-race-pts">{fmt(row.pts)}</span>
    </div>
  );
}
/* every stack as a flat bar against the leader */
export function StackRaceCard({ state, standings }) {
  const rows = stackRace(standings);
  return (
    <div className="tv-pane">
      <div className="tv-card-head">
        <div className="tv-display tv-title" style={{ fontSize:56 }}>Chip stacks</div>
      </div>
      <div className="tv-race">{rows.map(row => <RaceRow key={row.player} state={state} row={row} />)}</div>
    </div>
  );
}

/* Quick Draw: who is up on duels, and the latest ones */
export function DuelBoardCard({ state }) {
  const board = duelBoard(state);
  return (
    <div className="tv-pane">
      <div className="tv-card-head">
        <div className="tv-display tv-title" style={{ fontSize:56 }}>Quick Draw</div>
        {board.open > 0 && <div className="tv-label">{board.open} open</div>}
      </div>
      <div className="tv-duels">
        <div className="tv-duel-records">
          {board.records.slice(0, 10).map(item => (
            <div key={item.player} className="tv-duel-record">
              <Avatar state={state} p={item.player} size={48} />
              <span className="tv-name">{disp(state, item.player)}</span>
              <span className="tv-duel-wl">{item.won}-{item.lost}{item.tied ? `-${item.tied}` : ""}</span>
              <span className={`tv-duel-net${item.net > 0 ? " is-up" : item.net < 0 ? " is-down" : ""}`}>{signed(item.net)}</span>
            </div>
          ))}
        </div>
        <div className="tv-duel-recent">
          {board.recent.slice(0, 7).map(item => (
            <div key={item.id} className="tv-duel-line">
              {item.push ? <>
                <Avatar state={state} p={item.from} size={44} /><Avatar state={state} p={item.to} size={44} />
                <span>{disp(state, item.from)} and {disp(state, item.to)} tied</span>
              </> : <>
                <Avatar state={state} p={item.winner} size={44} />
                <span>{disp(state, item.winner)} beat {disp(state, item.loser)}
                  {item.foul ? ", on a foul" : item.winMs != null && item.loseMs != null ? `, ${item.winMs} to ${item.loseMs}ms` : ""}</span>
                <b>{fmt(item.stake)}</b>
              </>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* the public face of a player card at TV scale, in their identity color */
function TVCardFace({ state, p }) {
  const identity = usePlayerIdentity(p);
  const ink = readableInk(identity.color);
  const name = disp(state, p);
  const number = identity.num;
  const longest = Math.max(4, ...name.split(/\s+/).map(word => word.length));
  return (
    <div className="tv-cardface" style={{ background:identity.color, color:ink, "--face-ink":ink }}>
      <div className="tv-cardface-top"><span>FIELD DAY</span><span>{EDITION.name.toUpperCase()} / {EDITION.year}</span></div>
      <div className="tv-cardface-art">
        <span className="tv-cardface-number">{number == null ? "FD" : String(number).padStart(2, "0")}</span>
        <Avatar state={state} p={p} size={300} style={{ border:"6px solid var(--face-ink)" }} />
        <span className="tv-cardface-chip"><ChipFace p={p} size={120} /></span>
      </div>
      <div className="tv-cardface-name" style={{ fontSize:Math.min(110, Math.floor(520 / (longest * 0.5))) }}>{name}</div>
    </div>
  );
}
/* one player, their public card and their weekend in numbers */
export function SpotlightCard({ state, events, standings, player }) {
  const identity = usePlayerIdentity(player);
  const stats = playerWeekendStats(state, events, standings, player);
  const facts = [
    stats.rank != null && state.live ? ["Rank", String(stats.rank)] : null,
    ["Chips", fmt(stats.pts)],
    ["Wins", String(stats.wins)],
    ["Podiums", String(stats.podiums)],
    stats.betNet ? ["Bets", signed(stats.betNet)] : null,
    stats.duels.won + stats.duels.lost + stats.duels.tied ? ["Quick Draw", `${stats.duels.won}-${stats.duels.lost}`] : null,
  ].filter(Boolean);
  return (
    <div className="tv-pane tv-spotlight">
      <TVCardFace state={state} p={player} />
      <div className="tv-spotlight-body">
        {identity.num != null && <div className="tv-label">Player {identity.num}</div>}
        <div className="tv-display tv-spotlight-name">{disp(state, player)}</div>
        <div className="tv-spotlight-facts">
          {facts.map(([label, value]) => <div key={label}><span className="tv-label">{label}</span><b>{value}</b></div>)}
        </div>
        {stats.places.length > 0 && (
          <div className="tv-spotlight-places">
            {stats.places.map(item => <span key={item.eventId}>{placeName(item.place)} {item.name}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
/* the Opening scene's room step: all thirteen chips on the wall */
export function RosterWall({ state }) {
  return (
    <div className="tv-pane tv-center tv-roster-pane">
      <div className="tv-roster-head">
        <FDMark size={72} variant="night" />
        <span className="tv-mast-edition" style={{ fontSize:30 }}>{editionLabel()}</span>
      </div>
      <div className="tv-roster">
        {ROSTER.map(p => (
          <div key={p} className="tv-roster-chip">
            <ChipFace p={p} size={176} />
            <span className="tv-roster-name">{disp(state, p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
