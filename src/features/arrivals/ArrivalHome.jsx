/* Scan the TV on Home (Oct 4, redesigned the same day): a guest not yet
   checked in, once check-in opens (the door, or Friday at the house).

   In the lobby (before the first game is announced) it is the top of Home:
   the session's painting, an empty seat cut in the glass with your chip
   just over it, "Scan the TV" lettered on the sky, the scan mark at its
   side. One tap opens the scanner (Scanner.jsx), which drops the chip
   into its seat when the TV's code checks you in. Once a game is announced
   it is a compact row (your chip over a small seat, the words, the mark),
   lettered into the contest's painting in the You strip's place when a
   contest holds Home. Before check-in opens it is nothing at all, so
   production guests never see it weeks early. */
import React, { useEffect, useRef, useState } from "react";
import { EDITION } from "../../../shared/core.js";
import { ChipCoin } from "../identity/ChipCoin.jsx";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { useGlassTilt } from "../../ui/useGlassTilt.js";
import { tapTick } from "../../lib/haptics.js";
import { serverNow } from "../../lib/serverClock.js";
import { arrivalOffer } from "./arrivalsModel.js";
import "./arrivals.css";

/* Home re-reads the offer when Friday at the house arrives, so it appears
   without a reload on a phone left open */
function useCheckInHour() {
  const [, tick] = useState(0);
  useEffect(() => {
    const wait = Date.parse(EDITION.arriveFrom) - serverNow();
    if (wait <= 0 || wait > 0x7fffffff) return undefined;
    const timer = setTimeout(() => tick(n => n + 1), wait + 250);
    return () => clearTimeout(timer);
  }, []);
}

/* "lobby", "row" or null (arrivalsModel's arrivalOffer), when there is a scanner to open */
export function useScanOffer({ state, me, onScan }) {
  useCheckInHour();
  return onScan ? arrivalOffer(state, me, serverNow()) : null;
}

/* the lobby's pane: glass you press with its own painting, or lettered
   into the contest's painting (inset) when the first event holds Home */
export function ScanPane({ me, onScan, inset = false }) {
  const paneRef = useRef(null);
  useGlassTilt(paneRef, { enabled:!inset });
  return <button ref={paneRef} type="button" className={`fd-arrive ${inset ? "is-inset" : "fd-glass-scene"}`}
    onClick={() => { tapTick(); onScan(); }} aria-label="Scan the TV">
    {!inset && <GlassArt depth clear />}
    <span className="fd-arrive-seat" aria-hidden="true">
      <i className="fd-arrive-shadow" />
      <span className="fd-arrive-chip"><ChipCoin p={me} size={inset ? 60 : 72} /></span>
    </span>
    <strong className="fd-show fd-glass-letter fd-arrive-word" aria-hidden="true">Scan the TV</strong>
    <span className="fd-arrive-mark" aria-hidden="true"><Icon name="scan" size={30} /></span>
  </button>;
}

/* after the lobby: one row, or lettered into the contest's painting (inset) */
export function ScanRow({ me, onScan, inset = false }) {
  return <button type="button" className={`fd-arrive-row${inset ? " is-inset" : " fd-glass-field fd-field-info fd-lamp is-info is-pending"}`}
    onClick={() => { tapTick(); onScan(); }} aria-label="Scan the TV">
    <span className="fd-arrive-seat is-small" aria-hidden="true">
      <span className="fd-arrive-chip"><ChipCoin p={me} size={34} /></span>
    </span>
    <strong className="fd-show">Scan the TV</strong>
    <Icon name="scan" size={24} className="fd-arrive-row-mark" />
  </button>;
}
