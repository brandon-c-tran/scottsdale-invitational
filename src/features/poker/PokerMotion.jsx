import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ChipStack } from "../wagers/BetStacks.jsx";
import { MOTION, useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { useFlip, useFreshHold } from "../../lib/motionKit.js";
import { levelAnchor, levelRoll, seatOrder } from "./pokerMotion.js";
import "./poker-motion.css";

/* M17 on the phone and the TV: the blinds roll when the level changes (by
   the clock or a commissioner nudge), the level chip flips, and a bust tips
   that player's chip flat and slides it after the players still in. Loads,
   reconnects and reduced motion show the end state. */

const ROLL_MS = 900;

/* { roll } while a level change plays: the level and text it rolled from. */
export function useLevelRoll(pk, level, text, now) {
  const key = pk?.id || null;
  const anchor = levelAnchor(pk);
  const change = useFreshChange(level, key);
  const reduced = useReducedMotion();
  const previous = useRef(null);
  const seq = useRef(0), timer = useRef(null);
  const [roll, setRoll] = useState(null);
  const before = previous.current && previous.current.key === key ? previous.current : null;
  const dir = before ? levelRoll({ prevIdx:before.level, idx:level, prevAt:before.at, at:now,
    sameAnchor:before.anchor === anchor, fresh:change.fresh }) : 0;
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = { key, level, text, anchor, at:now };
    const hidden = typeof document !== "undefined" && document.hidden;
    if (!dir || reduced || hidden) return;
    const id = ++seq.current;
    setRoll({ id, dir, level:from.level, text:from.text });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRoll(current => current?.id === id ? null : current), ROLL_MS);
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return roll;
}

/* A number that rolls: the old value leaves one way, the new one arrives
   from the other. */
export function RollNumber({ text, roll, className = "" }) {
  return (
    <span className={`fd-roll${className ? ` ${className}` : ""}`} data-dir={roll?.dir > 0 ? "up" : roll ? "down" : undefined}>
      {roll && <span className="fd-roll-out" aria-hidden="true">{roll.text}</span>}
      <span key={roll?.id || 0} className={roll ? "fd-roll-in" : undefined}>{text}</span>
    </span>
  );
}

const LevelFace = ({ n, size }) => <ChipFace size={size} stamp={n} color="var(--sun)" isLight skin="quad" flat />;
/* The level as a chip in sun, its number stamped; it flips on a change. */
export function LevelChip({ level, roll, size = 30 }) {
  return (
    <span className="fd-level-chip" style={{ width:size, height:size }} role="img" aria-label={`Level ${level + 1}`}>
      {roll && <span className="fd-level-face is-out"><LevelFace n={roll.level + 1} size={size} /></span>}
      <span key={roll?.id || 0} className={`fd-level-face${roll ? " is-in" : ""}`}><LevelFace n={level + 1} size={size} /></span>
    </span>
  );
}

/* Phone: the table card's blinds, level chip first. */
export function PokerBlinds({ pk, clk, now, alive }) {
  const blinds = `${clk.sb.toLocaleString("en-US")} / ${clk.bb.toLocaleString("en-US")}`;
  const roll = useLevelRoll(pk, clk.idx, blinds, now);
  return <>
    <LevelChip level={clk.idx} roll={roll} size={30} />
    <div className="fd-poker-blinds">
      <RollNumber className="fd-poker-blinds-num" text={blinds} roll={roll} />
      <span>Blinds, level {clk.idx + 1} of {pk.levels.length}. {alive} still in.</span>
    </div>
  </>;
}

/* A seat's chip: standing while they play, lying flat once they bust. */
export function SeatChip({ player, out, tipping, size }) {
  return out
    ? <span className={`fd-seat-chip is-flat${tipping ? " is-tipping" : ""}`} style={{ width:size, height:size }}>
      <ChipStack p={player} count={1} size={size} tag={false} /></span>
    : <span className="fd-seat-chip" style={{ width:size, height:size }}><ChipFace p={player} size={size} flat /></span>;
}

/* The newest bust while its tip plays, else null. */
export function useBustTip(pk) {
  const { out } = seatOrder(pk);
  const hold = useFreshHold(out.length, pk?.id || null, ROLL_MS);
  const change = useFreshChange(out.length, pk?.id || null);
  return { out, tipping:hold ? out[0]?.player || null : null, moved:change.animate && change.to > change.from };
}

/* Phone: the whole table in one row of chips, still in first, then the
   busted ones flat in finishing order. */
export function PokerSeatChips({ state, pk, size = 20 }) {
  const box = useRef(null);
  const { alive } = seatOrder(pk);
  const { out, tipping, moved } = useBustTip(pk);
  useFlip(box, { play:moved, delay:MOTION.stamp, duration:MOTION.rowSlide });
  if (!pk || !alive.length && !out.length) return null;
  const label = `Still in: ${alive.map(p => disp(state, p)).join(", ")}${out.length ? `. Out: ${out.map(o => disp(state, o.player)).join(", ")}` : ""}`;
  return (
    <div className="fd-seat-chips" ref={box} role="img" aria-label={label}>
      {alive.map(player => <span key={player} data-flip={player}><SeatChip player={player} size={size} /></span>)}
      {out.map(({ player }) => <span key={player} data-flip={player}>
        <SeatChip player={player} out tipping={tipping === player} size={size} /></span>)}
    </div>
  );
}
