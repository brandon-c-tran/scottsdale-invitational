import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { DenomStacks } from "./PokerChips.jsx";
import { LevelChip, PokerSeatChips, RollNumber, useLevelRoll } from "./PokerMotion.jsx";
import { levelAnchor } from "./pokerMotion.js";
import { blindsSize, createWakeLock, nextTickDelay, tableViewAvailable, tableViewKeepsOpen, tableViewModel } from "./tableView.js";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { Icon } from "../../ui/Icon.jsx";
import "./table-view.css";

/* D8: the phone laid on the felt. The level and blinds as large as the
   screen allows, the clock, and the stack this player was dealt. The level
   turns (M17's roll) on the server instant the stored level start says, the
   same beat the TV turns on. The screen stays awake while it is open where
   the browser allows it; closing releases it. */

const ordinal = n => {
  const tens = n % 100;
  return `${n}${tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
};

/* The clock on drums: each digit rolls to its value as the second turns
   (backglass.css .fd-reel). The words ("Final level") stay words. */
const DIGITS = [..."0123456789"];
function ClockReel({ text, className = "" }) {
  const cells = [...String(text)];
  if (!/\d/.test(text)) return <span className={className}>{text}</span>;
  return <span className={`fd-reel${className ? ` ${className}` : ""}`} role="timer" aria-label={text}>
    {cells.map((ch, i) => {
      const key = cells.length - i;
      return /\d/.test(ch)
        ? <span className="fd-reel-cell" key={`d${key}`} aria-hidden="true">
            <span className="fd-reel-strip" style={{ "--d":ch }}>{DIGITS.map(d => <span key={d}>{d}</span>)}</span>
            <span className="fd-reel-sizer">{ch}</span>
          </span>
        : <span className="fd-reel-sep" key={`s${key}`} aria-hidden="true">{ch}</span>;
    })}
  </span>;
}

/* The level's chip inside a ring that runs out with the level, the same
   boundary the TV turns on. */
function LevelRing({ model, roll }) {
  const size = 56, r = 25, c = 2 * Math.PI * r;
  const left = model.levelMs > 0 && !model.final ? Math.max(0, Math.min(1, model.msLeft / model.levelMs)) : 1;
  return <span className={`fd-table-view-ring${model.paused ? " is-paused" : ""}`}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="run" style={{ strokeDasharray:c, strokeDashoffset:c * (1 - left) }} />
    </svg>
    <LevelChip level={model.level} roll={roll} size={38} />
  </span>;
}

function useTableNow(state, me, fixed) {
  const [now, setNow] = useState(() => fixed ?? serverNow());
  const latest = useRef(state);
  latest.current = state;
  const anchor = levelAnchor(state?.poker);
  useEffect(() => {
    if (fixed != null) return undefined;
    let timer = null;
    const tick = () => {
      const at = serverNow();
      setNow(at);
      timer = setTimeout(tick, nextTickDelay(tableViewModel(latest.current, me, at)));
    };
    tick();
    return () => clearTimeout(timer);
  }, [anchor, me, fixed]);
  return fixed ?? now;
}

export function TableView({ state, me, onClose, now: fixedNow = null, width = null }) {
  const now = useTableNow(state, me, fixedNow);
  const model = tableViewModel(state, me, now);
  const pk = state?.poker;
  const roll = useLevelRoll(pk, model?.level ?? 0, model?.blinds || "", now);
  const root = useRef(null);
  const open = tableViewKeepsOpen(state, me);

  useEffect(() => {
    const lock = createWakeLock();
    lock.start();
    return () => { lock.release(); };
  }, []);
  useEffect(() => { if (!open) onClose?.(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus({ preventScroll:true });
    const keys = event => { if (event.key === "Escape") { event.preventDefault(); onClose?.(); } };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll:true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!model || !open) return null;
  const screen = width ?? (typeof window === "undefined" ? 390 : Math.min(window.innerWidth || 390, 560));
  const size = blindsSize(model.blinds, screen - 40);
  return <div ref={root} tabIndex={-1} className="fd-table-view fd-night" role="dialog" aria-modal="true" aria-label="Table view">
    <div className="fd-table-view-bar">
      <LevelRing model={model} roll={roll} />
      <span className="fd-table-view-level"><OneSafe text={`Level ${model.levelNumber} of ${model.levelCount}`} /></span>
      <button type="button" className="fd-table-view-exit" onClick={onClose}>Exit</button>
    </div>

    <div className="fd-table-view-blinds">
      <span className="fd-table-view-label">Blinds</span>
      <div className="fd-table-view-blinds-fit" style={{ fontSize:size }}>
        <RollNumber className="fd-table-view-blinds-num" text={model.blinds} roll={roll} /></div>
    </div>

    <div className="fd-table-view-clock">
      <b className={model.paused ? "is-paused" : model.late ? "is-late" : undefined}>{model.paused ? "Paused"
        : <ClockReel text={model.clock} />}</b>
      <span>{model.paused ? `${model.clock} left` : model.next ? `Next ${model.next}` : "Last level"}</span>
    </div>

    <div className="fd-table-view-seat">
      {model.busted ? <p className="fd-table-view-out">Out <b>{ordinal(model.finish)}</b></p> : <>
        <div className="fd-table-view-stack"><span className="fd-table-view-label">Starting stack</span>
          <b><ScoreReel value={model.stack} tone="chip" label={model.stackText} /></b></div>
        <DenomStacks stack={model.stack} size={30} className="fd-table-view-denoms" />
      </>}
      <div className="fd-table-view-in">
        <PokerSeatChips state={state} pk={pk} size={24} />
        <span>{model.alive} still in</span>
      </div>
    </div>
  </div>;
}

/* The one control on a seated player's table card, and the view it opens. */
export function TableViewEntry({ state, me }) {
  const [open, setOpen] = useState(false);
  const available = tableViewAvailable(state, me);
  if (!available && !open) return null;
  const view = open && <TableView state={state} me={me} onClose={() => setOpen(false)} />;
  return <>
    {available && <div className="fd-table-view-entry">
      <button type="button" onClick={() => { tapTick(); setOpen(true); }}>
        <span>Table view</span><Icon name="open" size={18} /></button>
    </div>}
    {view && (typeof document === "undefined" ? view : createPortal(view, document.body))}
  </>;
}
