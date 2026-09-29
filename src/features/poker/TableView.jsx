import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { DenomStacks } from "./PokerChips.jsx";
import { LevelChip, PokerSeatChips, RollNumber, useLevelRoll } from "./PokerMotion.jsx";
import { levelAnchor } from "./pokerMotion.js";
import { blindsSize, createWakeLock, nextTickDelay, tableViewAvailable, tableViewKeepsOpen, tableViewModel } from "./tableView.js";
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
      <LevelChip level={model.level} roll={roll} size={40} />
      <span className="fd-table-view-level">Level {model.levelNumber} of {model.levelCount}</span>
      <button type="button" className="fd-table-view-exit" onClick={onClose}>Exit</button>
    </div>

    <div className="fd-table-view-blinds">
      <span className="fd-table-view-label">Blinds</span>
      <div className="fd-table-view-blinds-fit" style={{ fontSize:size }}>
        <RollNumber className="fd-table-view-blinds-num" text={model.blinds} roll={roll} /></div>
    </div>

    <div className="fd-table-view-clock">
      <b className={model.paused ? "is-paused" : model.late ? "is-late" : undefined}>{model.paused ? "Paused" : model.clock}</b>
      <span>{model.paused ? `${model.clock} left in this level` : model.next ? `Next ${model.next}` : "Last level"}</span>
    </div>

    <div className="fd-table-view-seat">
      {model.busted ? <p className="fd-table-view-out">Out · {ordinal(model.finish)}</p> : <>
        <div className="fd-table-view-stack"><span className="fd-table-view-label">Starting stack</span>
          <b>{model.stackText}</b></div>
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
        <span>Table view</span><span aria-hidden="true">↗</span></button>
    </div>}
    {view && (typeof document === "undefined" ? view : createPortal(view, document.body))}
  </>;
}
