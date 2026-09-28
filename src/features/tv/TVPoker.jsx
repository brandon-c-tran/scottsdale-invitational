import React, { useRef } from "react";
import { disp, pokerClock } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { DenomStacks } from "../poker/PokerChips.jsx";
import { LevelChip, RollNumber, SeatChip, useBustTip, useLevelRoll } from "../poker/PokerMotion.jsx";
import { MOTION } from "../../lib/motion.js";
import { useFlip } from "../../lib/motionKit.js";
import { fmt, mmss, pokerTableRows, pokerSeats } from "./tvModel.js";

/* The finale on the TV (M17): the starting stacks build chip by chip when
   the table is freshly dealt, seat by seat; once play starts the blinds roll
   and the level chip flips on a new level, and a bust tips that player's
   chip flat and slides their row under the players still in. */

const SEAT_STAGGER = 90;

/* seated players' dealt starting chips, busts under them in finishing
   order, anyone away apart */
function PokerRail({ state, standings }) {
  const box = useRef(null);
  const pk = state.poker;
  const { out, tipping, moved } = useBustTip(pk);
  useFlip(box, { play:moved, delay:MOTION.stamp, duration:MOTION.rowSlide });
  const rows = pokerTableRows(state, standings);
  const finish = new Map(out.map((item, index) => [item.player, index]));
  const seated = rows.filter(r => !r.away && !r.busted);
  const busted = rows.filter(r => !r.away && r.busted).sort((a, b) => finish.get(a.player) - finish.get(b.player));
  const away = rows.filter(r => r.away);
  return (
    <aside className="tv-rail" ref={box}>
      <div className="tv-rail-head tv-label">Starting chips</div>
      {[...seated, ...busted].map(r => (
        <div key={r.player} data-flip={r.player} className={`tv-rail-row${r.busted ? " is-out" : ""}`}>
          <SeatChip player={r.player} out={r.busted} tipping={tipping === r.player} size={36} />
          <span className="tv-name">{disp(state, r.player)}</span>
          {r.busted ? <span className="tv-out-tag">Out</span> : <span className="tv-pts">{fmt(r.starting)}</span>}
        </div>
      ))}
      {away.length > 0 && <>
        <div className="tv-rail-head tv-label is-sub">Away</div>
        {away.map(r => (
          <div key={r.player} className="tv-rail-row is-away">
            <Avatar state={state} p={r.player} size={36} />
            <span className="tv-name">{disp(state, r.player)}</span>
            <span className="tv-away-tag">Away</span>
          </div>
        ))}
      </>}
    </aside>
  );
}

function TVPokerLive({ state, standings, now }) {
  const pk = state.poker;
  const clk = pokerClock(pk, now);
  const blinds = `${fmt(clk.sb)} / ${fmt(clk.bb)}`;
  const roll = useLevelRoll(pk, clk.idx, blinds, now);
  return (
    <>
      <div className="tv-pane tv-center" style={{ gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <LevelChip level={clk.idx} roll={roll} size={72} />
          <span className="tv-label">Level {clk.idx + 1} of {pk.levels.length}</span>
        </div>
        <div className="tv-display tv-blinds"><RollNumber text={blinds} roll={roll} /></div>
        <div className="tv-label">Blinds</div>
        <div className={`tv-clock${!clk.paused && !clk.final && clk.msLeft < 60000 ? " is-late" : ""}`}>
          {clk.paused ? "Paused" : clk.final ? "Final level" : mmss(clk.msLeft)}</div>
        {clk.paused && <div className="tv-body">{mmss(clk.msLeft)} left in this level</div>}
        <div className="tv-body">{pokerSeats(pk).length - pk.outs.length} still in</div>
      </div>
      <PokerRail state={state} standings={standings} />
    </>
  );
}

export function TVPoker({ state, standings, now }) {
  const pk = state.poker;
  if (!pk) return null;
  if (pk.startedAt) return <TVPokerLive state={state} standings={standings} now={now} />;
  const rows = pokerTableRows(state, standings);
  const away = rows.filter(r => r.away);
  return (
    <div className="tv-pane">
      <div style={{ display:"flex", alignItems:"center", gap:24, marginBottom:18 }}>
        <GameMark id="poker" size={84} />
        <div>
          <div className="tv-label">Championship Poker</div>
          <div className="tv-display" style={{ fontSize:56, color:"var(--bone)" }}>Starting chips</div>
        </div>
        <div style={{ marginLeft:"auto", textAlign:"right" }}>
          <div className="tv-display" style={{ fontSize:64, color:"var(--sun)" }}>{fmt(pk.total)}</div>
          <div className="tv-label">chips in play</div>
        </div>
      </div>
      <div className="tv-buyin-grid">
        {rows.filter(r => !r.away).map((r, index) => (
          <div key={r.player} className="tv-buyin-cell">
            <Avatar state={state} p={r.player} size={48} />
            <div className="tv-buyin-who">
              <div className="tv-name">{disp(state, r.player)}</div>
              <div className="tv-display tv-buyin-total">{fmt(r.starting)}</div>
            </div>
            <DenomStacks stack={r.starting} size={40} className="tv-buyin-stacks" build buildDelay={index * SEAT_STAGGER} />
          </div>
        ))}
      </div>
      {away.length > 0 && (
        <div className="tv-away-group">
          <span className="tv-label">Away</span>
          {away.map(r => <span key={r.player} className="tv-away-name">
            <Avatar state={state} p={r.player} size={40} />{disp(state, r.player)}</span>)}
        </div>
      )}
    </div>
  );
}
