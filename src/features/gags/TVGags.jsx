import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { serverNow } from "../../lib/serverClock.js";
import { Takeover } from "../tv/TVTakeover.jsx";
import { BitLayer } from "./BitStage.jsx";
import { bitElapsed, holdBeatOf } from "../../../shared/bitMusic.js";
import { bitById } from "./bits/registry.js";
import { gagAt, gagCast, gagPlan, nextGagEdge } from "./gagModel.js";
import "./gags.css";

/* The room's moments on the TV (features/gags, gagModel.js): one bit at a
   time as a full-canvas takeover, shot on the session's painting
   (BitStage.jsx BitLayer), the name and the fact lettered on its sky. The
   board and the chrome step out while it plays. Everything runs on the
   server clock from the moment's own start: a TV that joins late joins the
   bit where the room is, and reduced motion holds the bit's still. The
   room's sound is TVMode's (roomSound.js useGagSound), from a fresh frame
   only. */

const ms = n => `${Math.round(Number(n) || 0)}ms`;

/* ── which moment, when ── */

/* The moment whose window holds now on this TV (the newest write's, or a
   QA test), woken exactly at each window's edges rather than on the TV's
   one-second tick. `now` holds an instant (a rehearsal, the fit audit). */
export function useGagWindow(state, events, { now: nowOverride } = {}) {
  const plan = useMemo(() => gagPlan(state, events), [state, events]);
  const now = nowOverride ?? serverNow();
  const edge = nowOverride === undefined ? nextGagEdge(plan, now) : null;
  const [, wake] = useState(0);
  useEffect(() => {
    if (!edge) return undefined;
    const timer = setTimeout(() => wake(n => n + 1), Math.max(0, edge - serverNow()) + 20);
    return () => clearTimeout(timer);
  }, [edge]);
  const gag = gagAt(plan, now);
  /* how far in (a music bit held for its song counts its hold), and whether
     the instant is held (a rehearsal's `now`) */
  return { plan, gag:gag ? { ...gag, elapsed:Math.max(0, bitElapsed(bitById(gag.bit), gag.start, gag.origin, now)),
    fixed:nowOverride !== undefined } : null };
}

/* Whether this TV plays the moment in its window: decided as the window
   first opens here, so one another takeover is holding the room for is
   skipped for good (never queued), and given up if one takes the room
   while it plays. A moment plays once: once on screen, leaving it (its
   window over, moved, or given away) is for good, so a window that moves
   after it began (a slow speaker's walkout) never plays it twice. */
export const gagVerdict = (verdict, gag, { blocked = false } = {}) => {
  if (!gag) return verdict.shown ? { ...verdict, play:false } : verdict;
  const next = verdict.id === gag.id ? { ...verdict } : { id:gag.id, play:!blocked, shown:false };
  if (blocked) next.play = false;
  if (next.play) next.shown = true;
  return next;
};
export function useGagShown(gag, { blocked = false } = {}) {
  const verdict = useRef({ id:null, play:false, shown:false });
  verdict.current = gagVerdict(verdict.current, gag, { blocked });
  return gag && verdict.current.play ? gag : null;
}

/* the ms already gone at a moment's start when this TV first drew it,
   fixed per moment so the bit's clock never restarts on a re-render */
function useJoined(id, elapsed) {
  const ref = useRef({ id:null, elapsed:0 });
  if (ref.current.id !== id) ref.current = { id, elapsed:Math.max(0, Math.round(Number(elapsed) || 0)) };
  return ref.current.elapsed;
}

/* ── the takeover ── */

/* the board steps out while a bit holds the room, on the bit's own clock
   (gags.css .tv-main under data-moment~="gag"): its start and length ride
   the canvas, set before the first paint and cleared with the bit */
const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
function useCanvasClock(ref, gag, joined) {
  useLayout(() => {
    const canvas = ref.current?.closest?.("[data-tv-canvas]");
    if (!canvas || !gag) return undefined;
    canvas.style.setProperty("--gag-tl", `${-joined}ms`);
    canvas.style.setProperty("--gag-ms", ms(gag.ms));
    return () => { canvas.style.removeProperty("--gag-tl"); canvas.style.removeProperty("--gag-ms"); };
  }, [gag?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* The moment's bit over the whole canvas, `phase` the session's painting,
   `lamp` the light behind its lettering and on the frame (gagLamp). */
export function TVGag({ state, gag, phase = "fri" }) {
  const joined = useJoined(gag?.id, gag?.elapsed);
  const anchor = useRef(null);
  useCanvasClock(anchor, gag, joined);
  const bit = gag ? bitById(gag.bit) : null;
  if (!gag || !bit) return null;
  const label = [gag.name, gag.fact].filter(Boolean).join(", ");
  /* a music bit with its song on the way runs on the server clock, so it
     can hold its wind-up until the speaker plays (shared/bitMusic.js) */
  const song = !!gag.song && gag.song.status !== "none";
  const clock = song && !gag.fixed && holdBeatOf(bit) !== null && Number.isFinite(Number(gag.start))
    ? { start:gag.start, origin:gag.origin } : { at:joined };
  return (
    <Takeover kind="gag" className={`tv-gag is-${bit.shape}`} label={label}>
      <span ref={anchor} hidden />
      <BitLayer bit={bit} cast={gagCast(gag)} state={state} phase={phase} name={gag.name || null} fact={gag.fact || null}
        song={song} {...clock} runKey={gag.id} />
    </Takeover>
  );
}
