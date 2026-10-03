import React from "react";
import { disp, pokerClock } from "../../../shared/core.js";
import { DenomStacks } from "../poker/PokerChips.jsx";
import { LevelChip, RollNumber, SeatChip, useBustTip, useLevelRoll } from "../poker/PokerMotion.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { fmt, mmss, placeName, pokerTableRows, pokerSeats } from "./tvModel.js";

/* The finale on the TV: a broadcast table. An oval felt with every seated
   player on its rail (photo chip, name, the stack they were dealt), the
   blinds large in the middle with the level's clock as a draining ring and
   how many are left. When the table is freshly dealt each seat's stack
   builds chip by chip (M17); a new level rolls the blinds and lights the
   rail; a bust tips that seat's chip flat and strikes the seat, where it
   sat. Away players never sat down and are named under the table. */

const SEAT_STAGGER = 90;
/* The ring is built from the seat's own box, so thirteen seats never touch
   each other, the safe area or the ticker: every seat is SEAT.w wide and
   at most its h tall (taller while dealing, with the denominations), the
   ring's centres keep half a seat inside the stage's 64px sides and its
   836px height, and the felt sits inside the ring. Board pixels. */
const STAGE = { w:1920, h:836, edge:64, pad:6 };
export const SEAT = Object.freeze({ w:266, live:96, deal:128 });
export function tableRing(dealing = false) {
  const h = dealing ? SEAT.deal : SEAT.live;
  const seatRx = STAGE.w / 2 - STAGE.edge - SEAT.w / 2;
  const seatRy = STAGE.h / 2 - h / 2 - STAGE.pad;
  return { cx:STAGE.w / 2, cy:STAGE.h / 2, seatRx, seatRy, seatH:h,
    feltRx:seatRx - SEAT.w / 2 - 26, feltRy:seatRy - h / 2 - 22 };
}
const TABLE = tableRing(false);
const RING_R = 96, RING_C = 2 * Math.PI * RING_R;

/* seat i of n around the rail, clockwise from the top */
export function seatPoint(i, n, table = TABLE) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  return { x:Math.round(table.cx + table.seatRx * Math.cos(a)), y:Math.round(table.cy + table.seatRy * Math.sin(a)) };
}

/* a seat's name fits the seat: one line, as large as 30px goes */
const seatNameSize = name => Math.max(24, Math.min(30, Math.floor((SEAT.w - 64 - 14 - 30) / Math.max(1, String(name).length * 0.56))));
function Seat({ state, row, at, index, dealing, tipping }) {
  const out = row.busted;
  const name = disp(state, row.player);
  return (
    <div className={`tv-seat${out ? " is-out" : ""}${dealing ? " is-dealing" : ""}`} data-seat={row.player}
      style={{ left:at.x, top:at.y, width:SEAT.w, height:dealing ? SEAT.deal : SEAT.live }}>
      <SeatChip player={row.player} out={out} tipping={tipping === row.player} size={64} />
      <div className="tv-seat-copy">
        <span className="tv-seat-name" style={{ fontSize:seatNameSize(name) }}>{name}</span>
        {out ? <span className="tv-seat-out">Out <b>{placeName(row.finish)}</b></span>
          : <span className="tv-seat-stack">{fmt(row.starting)}</span>}
        {/* the deal builds each stack chip by chip; the counts are the dealer's, on the phone */}
        {dealing && <DenomStacks stack={row.starting} size={18} counts={false} className="tv-seat-denoms" build buildDelay={index * SEAT_STAGGER} />}
      </div>
    </div>
  );
}

function Table({ state, standings, center, dealing = false, caption, blindsUp = null }) {
  const pk = state.poker;
  const { tipping } = useBustTip(pk);
  const rows = pokerTableRows(state, standings);
  const byPlayer = new Map(rows.map(row => [row.player, row]));
  const seated = pokerSeats(pk).filter(p => byPlayer.has(p) && !byPlayer.get(p).away);
  const away = rows.filter(row => row.away);
  const ring = tableRing(dealing);
  return (
    <div className={`tv-pane tv-table${blindsUp ? " is-blinds-up" : ""}`}>
      <div className="tv-table-stage">
        <svg className="tv-table-felt" width="1920" height="836" viewBox="0 0 1920 836" aria-hidden="true">
          <ellipse className="tv-table-rail" cx={ring.cx} cy={ring.cy} rx={ring.feltRx + 22} ry={ring.feltRy + 22} />
          <ellipse key={blindsUp?.id || "rim"} className="tv-table-rim" cx={ring.cx} cy={ring.cy} rx={ring.feltRx + 6} ry={ring.feltRy + 6} />
          <ellipse className="tv-table-cloth" cx={ring.cx} cy={ring.cy} rx={ring.feltRx} ry={ring.feltRy} />
          <ellipse className="tv-table-line" cx={ring.cx} cy={ring.cy} rx={ring.feltRx - 50} ry={ring.feltRy - 40} />
        </svg>
        <div className="tv-table-center">{center}</div>
        <div className="tv-table-caption tv-label" style={{ top:ring.cy + ring.feltRy - 56 }}>{caption}</div>
        {seated.map((p, index) => <Seat key={p} state={state} row={byPlayer.get(p)} at={seatPoint(index, seated.length, ring)}
          index={index} dealing={dealing} tipping={tipping} />)}
      </div>
      {away.length > 0 && <div className="tv-table-away">
        <span className="tv-label">Away</span>
        {away.map(row => <span key={row.player} className="tv-table-away-name">{disp(state, row.player)}</span>)}
      </div>}
    </div>
  );
}

/* the level's clock as a ring that drains, the time left inside it */
function LevelRing({ clk }) {
  const total = Math.max(1, (Number(clk.mins) || 0) * 60000);
  const left = clk.final ? 1 : Math.max(0, Math.min(1, clk.msLeft / total));
  const late = !clk.paused && !clk.final && clk.msLeft < 60000;
  return (
    <div className={`tv-level-ring${late ? " is-late" : ""}${clk.paused ? " is-paused" : ""}`}>
      <svg width="196" height="196" viewBox="0 0 236 236" aria-hidden="true">
        <circle className="tv-level-track" cx="118" cy="118" r={RING_R} />
        <circle className="tv-level-left" cx="118" cy="118" r={RING_R} strokeDasharray={RING_C.toFixed(1)}
          strokeDashoffset={(RING_C * (1 - left)).toFixed(1)} transform="rotate(-90 118 118)" />
      </svg>
      <span className="tv-level-time tv-display">{clk.paused ? "Paused" : clk.final ? "Final" : mmss(clk.msLeft)}</span>
    </div>
  );
}

function TVPokerLive({ state, standings, now }) {
  const pk = state.poker;
  const clk = pokerClock(pk, now);
  const blinds = `${fmt(clk.sb)} / ${fmt(clk.bb)}`;
  const roll = useLevelRoll(pk, clk.idx, blinds, now);
  const left = pokerSeats(pk).length - pk.outs.length;
  const center = <>
    <div className="tv-display tv-blinds"><RollNumber text={blinds} roll={roll} /></div>
    <div className="tv-table-level">
      <LevelChip level={clk.idx} roll={roll} size={68} />
      <span className="tv-label"><OneSafe text={`Level ${clk.idx + 1} of ${pk.levels.length}`} /></span>
    </div>
    <div className="tv-table-clock">
      <LevelRing clk={clk} />
      <div className="tv-table-left"><b className="tv-display">{left}</b><span className="tv-label">left</span></div>
    </div>
  </>;
  return <Table state={state} standings={standings} center={center} caption="Stacks as dealt" blindsUp={roll} />;
}

export function TVPoker({ state, standings, now }) {
  const pk = state.poker;
  if (!pk) return null;
  if (pk.startedAt) return <TVPokerLive state={state} standings={standings} now={now} />;
  const first = pokerClock(pk, now);
  /* the masthead names the game: the felt carries only the numbers */
  const center = <>
    <div className="tv-table-total"><ScoreReel value={pk.total} tone="chip" /><span className="tv-label">in play</span></div>
    <div className="tv-table-first"><span className="tv-label">Blinds</span> {fmt(first.sb)} / {fmt(first.bb)}</div>
  </>;
  return <Table state={state} standings={standings} center={center} caption="Starting chips" dealing />;
}
