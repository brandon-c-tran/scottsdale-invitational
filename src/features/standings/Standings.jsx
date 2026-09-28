import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AWARDS, SESSIONS, computeStandings, disp, duelReserve, resolveEventLifecycle, resolveWeekendOperation } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { EASE, MOTION, signedChips, useCountUp, useFreshChange } from "../../lib/motion.js";
import { BOARD_BEATS, barScale, chipBar, rowMoves, soleLeader } from "./boardModel.js";
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
      <span className="fd-now-topline"><span className="fd-now-status"><i className="fd-beat-dot" aria-hidden="true" />{status}</span>
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

/* X1: one unit per 100 chips (a coarser unit once the leader is far ahead)
   in the player's identity color. Your own chips riding on bets are the
   gold outlined units at the end of your bar, duel antes the muted ones:
   what is at risk is what would leave it. */
export function ChipBar({ p, pts, scale, bets = 0, duels = 0 }) {
  const identity = usePlayerIdentity(p);
  const bar = chipBar({ pts, scale, bets, duels });
  return <svg className="fd-chip-bar" viewBox={`0 0 ${bar.slots} 1`} preserveAspectRatio="none"
    aria-hidden="true" focusable="false">
    {bar.cells.map(cell => cell.kind === "held"
      ? <rect key={cell.x} x={cell.x} y={0} width={cell.w} height={1} fill={identity.color} />
      : <rect key={cell.x} x={cell.x + 0.05} y={0.1} width={Math.max(0.1, cell.w - 0.1)} height={0.8}
        className={cell.kind === "bets" ? "is-bets" : "is-duels"} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

/* M2: a fresh rank change rolls the old digits out and the new ones in,
   once the rows have landed */
function RankCell({ label, text, roll, index }) {
  return <span className="fd-standing-position" aria-label={label}>
    {roll ? <span className={`fd-rank-roll${roll.up ? " is-up" : " is-down"}`} key={roll.id} aria-hidden="true"
      style={{ "--roll-delay":`${BOARD_BEATS.roll + index * BOARD_BEATS.rollStagger}ms` }}>
      <span className="fd-rank-old">{roll.from}</span><span className="fd-rank-new">{text}</span>
    </span> : text}
  </span>;
}

const rankText = (row, starting, tied) => starting || tied ? "·" : String(row.rank).padStart(2, "0");

function BoardRow({ state, row, index, me, starting, tied, deltas, out, adjustment, scoreLabel, scale,
  onPlayer, onAdjust, StatPills, myAtRisk, myDuels, newLeader, rowRef }) {
  const isMe = row.player === me;
  const leading = !starting && row.rank === 1 && !tied;
  /* M2: the total counts in 100s and the change rises off it */
  const count = useCountUp(row.pts, { key:row.player, delay:BOARD_BEATS.count });
  const text = rankText(row, starting, tied);
  const rankChange = useFreshChange(text, row.player);
  const [roll, setRoll] = useState(null);
  useLayoutEffect(() => {
    if (!rankChange.animate || rankChange.from === rankChange.to) return undefined;
    const up = rankChange.from === "·" || Number(rankChange.to) < Number(rankChange.from);
    setRoll({ id:rankChange.changeId, from:rankChange.from, up });
    const timer = setTimeout(() => setRoll(current => current?.id === rankChange.changeId ? null : current),
      BOARD_BEATS.settle);
    return () => clearTimeout(timer);
  }, [rankChange.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const delta = !starting && !tied && deltas?.[row.player];
  const chipDescription = starting || scoreLabel === "STARTING CHIPS" ? "starting chips" : "chips";
  const rise = count.delta && count.delta.amount !== 0 ? count.delta : null;
  return <li ref={rowRef} className={`${isMe ? "is-you" : ""}${leading ? " is-leading" : ""}${adjustment ? " has-adjust" : ""}`}>
    {newLeader && <i className="fd-lead-sweep" key={newLeader} aria-hidden="true" />}
    <button type="button" onClick={() => onPlayer(row.player)} className="fd-standings-row"
      data-new-leader={newLeader ? "" : undefined}
      aria-label={`View ${disp(state, row.player)}'s player card, ${fmt(row.pts)} ${chipDescription}`}>
      <RankCell label={starting ? "Not started" : tied ? "Tied" : `Position ${row.rank}`} text={text} roll={roll} index={index} />
      <Avatar state={state} p={row.player} size={28} />
      <span className="fd-standing-player">
        <span className="fd-standing-line"><span className="fd-standing-name">{disp(state, row.player)}</span>
          {(isMe || out) && <span className="fd-standing-flags">
            {isMe && <span className="fd-standing-you">YOU</span>}
            {out && <span className="fd-standing-out">OUT</span>}
          </span>}
          {!starting && StatPills && <span className="fd-standing-stats"><StatPills row={row} atRisk={isMe ? myAtRisk : 0} /></span>}
        </span>
        <ChipBar p={row.player} pts={count.value} scale={scale}
          bets={isMe ? myAtRisk : 0} duels={isMe ? myDuels : 0} />
      </span>
      <span className="fd-standing-score"><strong>{fmt(count.value)}</strong>
        {rise && <span key={rise.id} aria-hidden="true"
          className={`fd-motion-delta fd-standing-rise ${rise.amount > 0 ? "is-up" : "is-down"}`}>{signedChips(rise.amount)}</span>}
        {!!delta && <span className={`fd-standing-delta${delta < 0 ? " is-down" : ""}${roll ? " is-popping" : ""}`}
          aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} positions`}>
          <span aria-hidden="true">{delta > 0 ? "↑" : "↓"}</span>{Math.abs(delta)}
        </span>}
      </span>
    </button>
    {adjustment && <button type="button" className="fd-standing-adjust" onClick={() => onAdjust(row.player)}
      aria-label={`Adjust chips for ${disp(state, row.player)}`}>Adjust</button>}
  </li>;
}

/* M3: after a fresh change the rows slide to their new places (FLIP) once
   the numbers have counted, risers lifted over fallers. Until then each row
   holds its old place; a first load, reconnect or correction just lands. */
const mapOf = ref => ref.current instanceof Map ? ref.current : (ref.current = new Map());
function useRowSlide(order, key) {
  const els = useRef(new Map());
  const tops = useRef(new Map());
  const played = useRef(0);
  const move = useFreshChange(order, key);
  useLayoutEffect(() => {
    const next = new Map();
    mapOf(els).forEach((el, player) => { if (el?.isConnected) next.set(player, el.offsetTop); });
    if (move.animate && played.current !== move.changeId) {
      played.current = move.changeId;
      const moves = rowMoves(String(move.from || "").split("|"), String(move.to || "").split("|"));
      for (const [player, { from, to }] of Object.entries(moves)) {
        const el = mapOf(els).get(player);
        const was = mapOf(tops).get(player), now = next.get(player);
        if (!el || was === undefined || now === undefined || was === now || typeof el.animate !== "function") continue;
        const dy = was - now, rising = to < from;
        const classes = ["is-moving", rising ? "is-rising" : "is-falling"];
        const done = () => el.classList.remove(...classes);
        el.classList.add(...classes);
        try {
          el.animate([
            { transform:`translateY(${dy}px)` },
            { transform:`translateY(${(dy / 2).toFixed(1)}px) scale(${rising ? 1.015 : 1})`, offset:0.5 },
            { transform:"none" },
          ], { duration:MOTION.rowSlide, delay:BOARD_BEATS.slide + to * MOTION.rowStagger,
            easing:EASE.out, fill:"backwards" }).finished.then(done, done);
        } catch { done(); }
      }
    }
    tops.current = next;
  });
  const refs = useRef(new Map());
  return useCallback(player => {
    if (!mapOf(refs).has(player)) mapOf(refs).set(player, el => {
      if (el) mapOf(els).set(player, el); else mapOf(els).delete(player);
    });
    return mapOf(refs).get(player);
  }, []);
}

/* M2: a new sole leader's row warms to gold once, after the rows land. */
function useNewLeader(leader) {
  const change = useFreshChange(leader, "leader");
  const [shown, setShown] = useState(null);
  useLayoutEffect(() => {
    if (!change.animate || !change.to || change.to === change.from) return undefined;
    setShown({ player:change.to, id:change.changeId });
    const timer = setTimeout(() => setShown(current => current?.id === change.changeId ? null : current),
      BOARD_BEATS.settle + 400);
    return () => clearTimeout(timer);
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

/* Home and the full standings sheet share player rows. The surrounding screen
   owns event/champion content and decides whether commissioner actions exist. */
export function Leaderboard({ state, standings = computeStandings(state), me, deltas, allTied,
  onPlayer, onAdjust, StatPills, myAtRisk = 0, starting = false, scoreLabel, ariaLabel }) {
  const tied = allTied ?? standings.every(row => row.pts === standings[0]?.pts);
  const adjustment = !!onAdjust;
  const scale = barScale(standings);
  /* your exposure is drawn only while the economy moves */
  const economy = !starting && !!state.live && !state.frozen;
  const myDuels = me && economy ? duelReserve(state, me) : 0;
  const bets = economy ? myAtRisk : 0;
  const order = standings.map(row => row.player).join("|");
  const refFor = useRowSlide(order, starting ? "starting" : "board");
  const leader = useNewLeader(soleLeader(standings, starting || tied));
  return <div className={`fd-leaderboard${adjustment ? " has-adjustments" : ""}`}>
    <div className="fd-standings-column-head" aria-hidden="true"><span>POS.</span><span>PLAYER</span>
      <span>{scoreLabel || (starting ? "STARTING CHIPS" : "CHIPS")}</span></div>
    <ol className="fd-standings-list" aria-label={ariaLabel || (starting ? "Starting chips" : "Tournament standings")}>
      {standings.map((row, index) => <BoardRow key={row.player} rowRef={refFor(row.player)} state={state} row={row}
        index={index} me={me} starting={starting} tied={tied} deltas={deltas} adjustment={adjustment}
        scoreLabel={scoreLabel} scale={scale} onPlayer={onPlayer} onAdjust={onAdjust} StatPills={StatPills}
        myAtRisk={bets} myDuels={myDuels} newLeader={leader?.player === row.player ? leader.id : null}
        out={!!(state.poker?.startedAt && !state.results?.[state.poker.id]
          && state.poker.outs?.some(item => item.player === row.player))} />)}
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
        {!champion && <i className={state.live ? "fd-beat-dot" : undefined} aria-hidden="true" />}{champion ? "Final" : "Live"}</span>} />}
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
