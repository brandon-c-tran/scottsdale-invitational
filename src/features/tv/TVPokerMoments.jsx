import React, { useEffect, useRef, useState } from "react";
import { disp, pokerClock } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { freshFrameNow } from "../../lib/sound.js";
import { levelAnchor, levelRoll } from "../poker/pokerMotion.js";
import { nextLatch, useTimeline } from "./tvMotion.js";
import { Takeover } from "./TVTakeover.jsx";

/* The finale's two takeovers (the table itself is TVPoker's): a full-canvas
   bust card ("Henry, out in 11th": the chip spins flat, the card lands, the
   place stamps) and a three-second blinds-up. Fresh only: a reload, a late
   TV or a correction shows the table. Reduced motion shows the table. */
export const BUST_TIMING = Object.freeze({ spin:0, spinMs:1000, card:1000, place:1500, total:4800 });
export const BLINDS_TIMING = Object.freeze({ total:3000 });

const ordinal = n => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/* the newest bust at the live table, as the room reads it */
export function bustView(pk) {
  if (!pk?.startedAt || !Array.isArray(pk.outs) || !pk.outs.length) return null;
  const seats = Array.isArray(pk.seats) ? pk.seats : null;
  const last = pk.outs[pk.outs.length - 1];
  if (!last?.player) return null;
  const field = seats ? seats.length : null;
  const place = field ? field - pk.outs.length + 1 : null;
  return { key:`${pk.id}:${pk.outs.length}:${last.player}`, player:last.player, at:Number(last.ts) || 0,
    place, placeText:place ? `Out in ${ordinal(place)}` : "Out" };
}

function useBust(state) {
  const pk = state?.poker && !state.results?.[state.poker.id] ? state.poker : null;
  const view = bustView(pk);
  const change = useFreshChange(view?.key || null, pk?.id || "");
  const latch = useRef(null);
  latch.current = nextLatch(latch.current, { change, key:pk?.id || "", build:(from, to) => {
    if (!to || !view) return null;
    /* an un-bust (a correction) is a rewind: the count went down */
    const before = Number(String(from || "").split(":")[1]) || 0;
    if (Number(String(to).split(":")[1]) <= before) return null;
    return { ...view, anchor:serverNow() };
  } });
  const moment = latch.current?.moment || null;
  const valid = !!moment && moment.key === view?.key;
  const timeline = useTimeline(valid ? moment.id : null, moment?.anchor, BUST_TIMING.total);
  return valid && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}

function useBlindsUp(state, now) {
  const reduced = useReducedMotion();
  const pk = state?.poker && state.poker.startedAt && !state.results?.[state.poker.id] ? state.poker : null;
  const clock = pk ? pokerClock(pk, now) : null;
  const idx = clock ? clock.idx : null;
  const last = useRef(null);
  const [moment, setMoment] = useState(null);
  useEffect(() => {
    const before = last.current;
    last.current = pk ? { id:pk.id, idx, at:now, anchor:levelAnchor(pk), blinds:clock ? `${clock.sb}/${clock.bb}` : null } : null;
    if (!pk || !before || before.id !== pk.id || reduced) return;
    /* the clock rolling on its own, or a fresh level write (as S21) */
    const dir = levelRoll({ prevIdx:before.idx, idx, prevAt:before.at, at:now, sameAnchor:before.anchor === levelAnchor(pk),
      fresh:freshFrameNow() });
    if (dir > 0) setMoment({ id:`${pk.id}:${idx}:${now}`, anchor:serverNow(), from:before.blinds, to:`${clock.sb}/${clock.bb}` });
  }, [pk?.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useTimeline(moment?.id || null, moment?.anchor, BLINDS_TIMING.total);
  return moment && timeline.playing ? { ...moment, elapsed:timeline.elapsed } : null;
}

/* what the finale's takeovers play now: { bust, blinds } (TVMode lists
   them as takeovers) */
export function usePokerMoments(state, now = serverNow()) {
  const bust = useBust(state);
  const blinds = useBlindsUp(state, now);
  return { bust, blinds, takeover:bust ? "bust" : blinds ? "blinds" : null };
}

export function TVPokerMoments({ state, moments }) {
  const { bust = null, blinds = null } = moments || {};
  if (bust) return (
    <Takeover kind="bust" className="tv-bust" style={{ "--tl":`${-Math.round(bust.elapsed)}ms` }}
      label={`${disp(state, bust.player)}, ${bust.placeText.toLowerCase()}`}>
      <div className="tv-bust-card" aria-hidden="true">
        <span className="tv-bust-chip"><ChipFace p={bust.player} size={260} flat /></span>
        <div className="tv-bust-text">
          <div className="fd-show is-marquee tv-bust-name">{disp(state, bust.player)}</div>
          <div className="tv-bust-place">{bust.placeText}</div>
        </div>
        <span className="tv-bust-photo"><Avatar state={state} p={bust.player} size={150} /></span>
      </div>
    </Takeover>
  );
  if (blinds) return (
    <Takeover kind="blinds" className="tv-blinds-up" style={{ "--tl":`${-Math.round(blinds.elapsed)}ms` }}
      label={`Blinds up: ${blinds.to}`}>
      <div className="tv-blinds-level" aria-hidden="true">
        {blinds.from && <span className="tv-blinds-old">{blinds.from}</span>}
        <span className="fd-show tv-blinds-new">{blinds.to}</span>
      </div>
      <div className="tv-blinds-label" aria-hidden="true">Blinds up</div>
    </Takeover>
  );
  return null;
}
