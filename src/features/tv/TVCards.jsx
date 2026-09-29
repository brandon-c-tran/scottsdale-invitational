import React from "react";
import { ROSTER, EDITION, disp, stageEntrantView } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { TrophyHero, TrophyPlates, trophyPlates } from "../weekend/Trophy.jsx";
import {
  fmt, signed, editionLabel, readableInk, phaseBand, placeName, stackRace, weekendProgress, duelBoard,
  playerWeekendStats,
} from "./tvModel.js";

export { TrophyHero };

/* The champion (M18) and the drawn bracket (M14) have their own modules. */
export { ChampionMoment } from "./TVChampion.jsx";
export { TVBracket } from "./TVBracket.jsx";

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
                  </> : row.status === "live" ? <span className="is-live"><i className="fd-beat-dot tv-beat" aria-hidden="true" />Live</span>
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

/* the trophy filling up: a plate per event, stamped as each result posts */
export function TrophyCard({ state, events }) {
  const plates = trophyPlates(state, events);
  const done = plates.filter(plate => plate.posted).length;
  return (
    <div className="tv-pane tv-trophy-pane">
      <div className="tv-card-head">
        <div className="tv-display tv-title" style={{ fontSize:56 }}>Trophy</div>
        <div className="tv-label">{done} of {plates.length}</div>
      </div>
      <div className="tv-trophy-stage"><TrophyPlates state={state} events={events} variant="tv" cup={330} /></div>
    </div>
  );
}
