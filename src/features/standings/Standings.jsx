import React, { useMemo } from "react";
import { AWARDS, SESSIONS, computeStandings, disp, resolveEventLifecycle, resolveWeekendOperation } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { ActionButton } from "../../ui/controls.jsx";
import { PageHeading, SectionHeading } from "../../ui/layout.jsx";
import "./standings.css";

const fmt = value => (value ?? 0).toLocaleString("en-US");

/* The shared operation resolver distinguishes a prepared draw from an event
   that has actually started. The header owns the open betting announcement. */
function PlayerNames({ state, players, onPlayer }) {
  return <span className="fd-now-players">{players.map(player => <button type="button" key={player}
    className="fd-now-player" onClick={() => onPlayer(player)} aria-label={`View ${disp(state, player)}'s player card`}>
    <Avatar state={state} p={player} size={25} /><span>{disp(state, player)}</span>
  </button>)}</span>;
}

function NowCard({ state, standings, events, onOpen, onPlayer, GameMark, resultImpact, nextOpenMatch }) {
  const openEv = event => !state.results[event.id] && !state.shelved[event.id]
    && event.id !== state.onDeck;
  const running = events.filter(event => openEv(event)
    && ["in-progress", "result-entry"].includes(resolveEventLifecycle(state, event).phase));
  const operation = resolveWeekendOperation(state, running);
  const liveEv = operation.event;
  const latest = useMemo(() => {
    let result = null;
    const byId = new Map(events.map(event => [event.id, event]));
    Object.entries(state.results || {}).forEach(([id, res]) => {
      const ev = byId.get(id);
      if (ev && res?.slots?.[0]?.length && (!result || res.ts > result.res.ts)) result = { ev, res };
    });
    return result;
  }, [state, events]);
  const impact = useMemo(() => latest && !latest.res.stacks
    ? resultImpact(state, events, latest, standings) : "", [state, events, latest, standings, resultImpact]);

  if (liveEv) {
    const bracket = state.brackets[liveEv.id];
    const stages = state.stages[liveEv.id];
    const draw = state.draws[liveEv.id];
    let decided = 0, total = 0, round = null, progressLabel = "";
    if (bracket) {
      const matches = bracket.rounds.flat();
      decided = matches.filter(match => match.winner !== null && match.winner !== undefined).length;
      total = matches.length;
      round = nextOpenMatch(bracket);
      progressLabel = `${decided} of ${total} matches decided`;
    } else if (stages) {
      decided = stages.groups.filter(group => (group.through || []).length >= stages.advance).length;
      total = stages.groups.length;
      progressLabel = `${decided} of ${total} ${stages.kind === "heats" ? "heats" : "pools"} decided`;
    }
    const first = round && draw?.teams[round.a];
    const second = round && draw?.teams[round.b];
    const awaitingResult = operation.lifecycle.phase === "result-entry"
      || (!!(bracket || stages) && operation.lifecycle.nextAction?.type === "enter-result");
    const status = awaitingResult ? "Awaiting result" : operation.lifecycle.label;
    return <section className="fd-now-card fd-now-live" aria-label={`${liveEv.name}: ${status}`}>
      <button type="button" className="fd-now-event-link" onClick={() => onOpen(liveEv)}>
      <span className="fd-now-topline"><span className="fd-now-status"><i aria-hidden="true" />{status}</span>
        <span className="fd-now-open" aria-hidden="true">›</span></span>
      <span className="fd-now-title-row"><GameMark id={liveEv.game} size={46} />
        <span className="fd-now-event">{liveEv.name}</span></span>
      </button>
      {first && second && <span className="fd-now-matchup">
        <span className="fd-now-round">{round.roundName || "Up now"}</span>
        <PlayerNames state={state} players={first.players} onPlayer={onPlayer} />
        <span className="fd-now-versus">vs</span>
        <PlayerNames state={state} players={second.players} onPlayer={onPlayer} />
      </span>}
      <span className="fd-now-progress"><span>{progressLabel}</span>
        <button type="button" onClick={() => onOpen(liveEv)}>Open event ›</button>
        {total > 0 && <progress value={decided} max={total} aria-label={progressLabel} />}</span>
    </section>;
  }

  if (latest) {
    const stacks = latest.res.stacks;
    const winners = latest.res.slots[0];
    const award = stacks ? stacks[winners[0]] ?? 0 : AWARDS[latest.ev.value]?.[0] ?? 0;
    const resultNote = stacks ? "" : impact;
    return <section className="fd-now-card fd-now-result" aria-label="Latest result">
      <button type="button" className="fd-now-event-link" onClick={() => onOpen(latest.ev)}>
      <span className="fd-now-topline"><span className="fd-now-status">Result posted</span>
        <span className="fd-now-open" aria-hidden="true">›</span></span>
      <span className="fd-now-title-row"><GameMark id={latest.ev.game} size={40} />
        <span className="fd-now-event">{latest.ev.name}</span></span>
      </button>
      <span className="fd-now-result-body"><PlayerNames state={state} players={winners} onPlayer={onPlayer} />
        <span className="fd-now-award"><strong>{stacks ? "" : "+"}{fmt(award)}</strong>
        <span>{stacks ? "final chips" : "chips each"}</span></span></span>
      {resultNote && <span className="fd-now-impact">{resultNote}</span>}
    </section>;
  }

  const next = events.find(openEv);
  if (!next) return null;
  const session = SESSIONS.find(item => item.id === next.session);
  return <button type="button" className="fd-now-card fd-now-next" onClick={() => onOpen(next)}>
    <span className="fd-now-topline"><span className="fd-now-status">Next event</span>
      <span className="fd-now-open" aria-hidden="true">›</span></span>
    <span className="fd-now-title-row"><GameMark id={next.game} size={40} />
      <span className="fd-now-event">{next.name}</span></span>
    <span className="fd-now-next-detail"><span>{session?.label || "The weekend"}</span>
      <span>{next.value ? `${fmt(next.value)} chips` : "Poker finale"}</span></span>
  </button>;
}

function ChampionPanel({ state, champion, coChamps, onPlayer }) {
  const leaders = coChamps.length ? coChamps : [champion];
  const tied = leaders.length > 1;
  return <section className="fd-leader-panel is-champion" aria-label={tied ? "Tied for the championship" : "Champion"}>
    <div className="fd-leader-topline"><span>{tied ? "Tied for the championship" : "Champion"}</span><span>FIELD DAY</span></div>
    {leaders.map(row => <button type="button" key={row.player} className="fd-leader-identity"
      onClick={() => onPlayer(row.player)} aria-label={`View ${disp(state, row.player)}'s player card`}>
      <span>{disp(state, row.player)}</span><Avatar state={state} p={row.player} size={52} />
    </button>)}
    <div className="fd-leader-score">
      <strong>{fmt(leaders[0].pts)}</strong><span>tournament<br />chips</span>
    </div>
  </section>;
}

/* Home and the full standings sheet share player rows. The surrounding screen
   owns event/champion content and decides whether commissioner actions exist. */
export function Leaderboard({ state, standings = computeStandings(state), me, deltas, allTied,
  onPlayer, onAdjust, StatPills, myAtRisk = 0, starting = false, scoreLabel, ariaLabel }) {
  const tied = allTied ?? standings.every(row => row.pts === standings[0]?.pts);
  const adjustment = !!onAdjust;
  return <div className={`fd-leaderboard${adjustment ? " has-adjustments" : ""}`}>
    <div className="fd-standings-column-head" aria-hidden="true"><span>POS.</span><span>PLAYER</span>
      <span>{scoreLabel || (starting ? "STARTING CHIPS" : "CHIPS")}</span></div>
    <ol className="fd-standings-list" aria-label={ariaLabel || (starting ? "Starting chips" : "Tournament standings")}>
      {standings.map(row => {
        const isMe = row.player === me;
        const leading = !starting && row.rank === 1 && !tied;
        const out = state.poker?.startedAt && !state.results?.[state.poker.id]
          && state.poker.outs?.some(item => item.player === row.player);
        const delta = !starting && !tied && deltas?.[row.player];
        const chipDescription = starting || scoreLabel === "STARTING CHIPS" ? "starting chips" : "chips";
        return <li key={row.player} className={`${isMe ? "is-you" : ""}${leading ? " is-leading" : ""}${adjustment ? " has-adjust" : ""}`}>
          <button type="button" onClick={() => onPlayer(row.player)} className="fd-standings-row"
            aria-label={`View ${disp(state, row.player)}'s player card, ${fmt(row.pts)} ${chipDescription}`}>
            <span className="fd-standing-position" aria-label={starting ? "Not started" : tied ? "Tied" : `Position ${row.rank}`}>
              {starting || tied ? "·" : String(row.rank).padStart(2, "0")}</span>
            <Avatar state={state} p={row.player} size={34} />
            <span className="fd-standing-player"><span className="fd-standing-name">{disp(state, row.player)}</span>
              {(isMe || out) && <span className="fd-standing-flags">
                {isMe && <span className="fd-standing-you">YOU</span>}
                {out && <span className="fd-standing-out">OUT</span>}
              </span>}
            </span>
            <span className="fd-standing-score"><strong key={row.pts}>{fmt(row.pts)}</strong>
              {!!delta && <span className={`fd-standing-delta${delta < 0 ? " is-down" : ""}`}
                aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} positions`}>
                <span aria-hidden="true">{delta > 0 ? "↑" : "↓"}</span>{Math.abs(delta)}
              </span>}
            </span>
            {!starting && StatPills && <span className="fd-standing-stats"><StatPills row={row} atRisk={isMe ? myAtRisk : 0} /></span>}
          </button>
          {adjustment && <button type="button" className="fd-standing-adjust" onClick={() => onAdjust(row.player)}
            aria-label={`Adjust chips for ${disp(state, row.player)}`}>Adjust</button>}
        </li>;
      })}
    </ol>
  </div>;
}

export function postedLine(state, events) {
  const active = events.filter(event => !state.shelved?.[event.id]);
  return `${active.filter(event => state.results?.[event.id]).length} of ${active.length} events posted`;
}

export function Board({ state, standings, me, deltas, allTied, champion, coChamps, gm,
  events, myAtRisk, onOpen, onAdjust, onPlayer, onFreeze, onUnfreeze, finaleDone, crownReady = false,
  GameMark, StatPills, resultImpact, nextOpenMatch, embedded=false }) {
  /* rulings exist only while the board can move; Crown only when it is the next step */
  const adjustable = gm && state.live && !state.frozen;
  const commissioner = gm && (champion ? !!onUnfreeze : crownReady && !!onFreeze);
  return <div className={`fd-standings-page${gm ? " is-gm" : ""}${embedded ? " is-embedded" : ""}`}>
    {!embedded && <PageHeading title={champion ? "Final standings" : "The board"}
      aside={<span className={`fd-board-state${champion ? " is-final" : ""}`}>
        {!champion && <i aria-hidden="true" />}{champion ? "Final" : "Live"}</span>} />}
    {champion && <ChampionPanel state={state} champion={champion} coChamps={coChamps || []} onPlayer={onPlayer} />}
    {!embedded && !champion && <NowCard state={state} standings={standings} events={events} onOpen={onOpen} onPlayer={onPlayer}
      GameMark={GameMark} resultImpact={resultImpact} nextOpenMatch={nextOpenMatch} />}
    {/* in the sheet, its header carries the title and this count once */}
    {!embedded && <SectionHeading title="Standings" detail={postedLine(state, events)} />}
    <Leaderboard state={state} standings={standings} me={me} deltas={deltas} allTied={allTied}
      onPlayer={onPlayer} onAdjust={adjustable ? onAdjust : undefined} StatPills={StatPills} myAtRisk={myAtRisk}
      starting={!state.live && !champion} />
    {commissioner && <div className="fd-board-commissioner">
      <span>Commissioner</span>
      <ActionButton type="button" variant={champion ? "destructive" : finaleDone ? "primary" : "secondary"}
        onClick={champion ? onUnfreeze : onFreeze}>{champion ? "Unfreeze board" : "Crown the champion"}</ActionButton>
    </div>}
  </div>;
}
