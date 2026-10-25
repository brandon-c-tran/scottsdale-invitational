/* Where and When in the room's voice (TV only, the room bus). Three kinds
   of cue, all on the server clock:

     state  a fresh frame's step (roomSound.js roomCues calls geoCues): a
            photo going up (geoPhoto, the slide projector, at startedAt; the
            first photo's lands just after Lock and start's knock), and each
            player locking in (geoLock, from their seat in the room, a step
            up the ladder per lock). A load, a reconnect or a correction
            sounds nothing (roomStep's fresh gate).
     clock  what the photo's minute owes while it stands
            (useGeoRoomClock, from useRoomSound): the guessing bed a bar at
            a time (geoBed, two seconds a bar, the last bar ending on
            closesAt, its last ten seconds tense), a tick each of the last
            ten seconds (geoTick, climbing) and the knock at zero (S8).
            Laid when the photo stands on this TV and cancelled when it
            moves on; a bar already ringing fades out (a cut recipe), so an
            early reveal stops the bed clean. A TV that joins late hears
            only what is still ahead (its first bar on the next bar line).
     reveal the map's own beats (useGeoRevealSound, from TVGeo; GeoMap's
            onBeats says when they run): a drop per guess pin as it meets
            the map, the lines running in, the answer landing, then the
            scores settling with the rows (the last photo resolves the
            motif). Only when the reveal reached this TV on a fresh frame.

   The bed and the reveal's motion are skipped under reduced motion: the
   reveal plays its one summary sound (the answer landing); the clock's
   ticks and knock stay, like Trivia's. Never S14: the posted result rings
   it. Pure apart from the hooks. */
import { useEffect, useRef } from "react";
import { cueAt, freshFrameNow } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { REVEAL, revealPlan } from "../geo/mapModel.js";
import { geoView } from "../geo/geoModel.js";

/* one bar of the bed (soundKit GEO_BAR_S) */
export const GEO_BAR_MS = 2000;
/* the photo's sting has the minute's first bar to itself */
export const GEO_BED_LEAD_MS = 2000;
/* the last ten seconds: ticks, and the bed's tense bars */
export const GEO_TENSE_MS = 10 * 1000;
/* the sting lands after Lock and start's knock in the same write */
export const GEO_PHOTO_STING_MS = 300;
/* a guess pin meets the map 55% into its .62 s drop (geo.css fd-geo-drop);
   the answer's head has grown most of the way at 200 ms (fd-geo-land) */
export const GEO_DROP_HIT_MS = 340;
export const GEO_ANSWER_HIT_MS = 200;
/* the round's rows slide in 2.6 s into the reveal (tv-geo.css .tv-geo-results li) */
export const GEO_ROWS_MS = 2600;
/* a reveal only sounds on a TV that saw it this soon after it showed */
export const GEO_REVEAL_FRESH_MS = 5000;

/* a player's seat in the room, left to right by their place in the field */
export const geoPan = (index, count) => count > 1 && index >= 0
  ? Math.round((-0.7 + 1.4 * index / (count - 1)) * 100) / 100 : 0;

/* the game, reduced to what can sound */
export function geoRoomSnapshot(state) {
  const geo = state?.geo;
  if (!geo?.order?.length || state.results?.[geo.eventId]) return null;
  const view = geoView(state, null, 0);
  if (!view) return null;
  const pans = Object.fromEntries(view.players.map((player, i) => [player, geoPan(i, view.players.length)]));
  return {
    id:geo.eventId || "geo", roundId:view.roundId, phase:view.phase,
    startedAt:Number(geo.startedAt) || 0, closesAt:Number(geo.closesAt) || 0, revealedAt:Number(geo.revealedAt) || 0,
    last:view.last, locked:[...view.lockedIn].sort(), pans,
  };
}

/* the cues one fresh step of the game owes the room */
export function geoCues(prev, next, { now = serverNow(), reduced = false } = {}) {
  const g = next?.geo, was = prev?.geo;
  if (!g?.roundId) return [];
  const cues = [];
  const key = `geo:${g.id}:${g.roundId}:${g.startedAt}`;
  const samePhoto = was?.id === g.id && was.roundId === g.roundId && was.startedAt === g.startedAt;
  /* a photo goes up */
  if (g.phase === "guess" && !samePhoto)
    cues.push({ id:"geoPhoto", at:(g.startedAt || now) + GEO_PHOTO_STING_MS, key:`${key}:photo`, opts:reduced ? { summary:true } : {} });
  /* a player locks in: a pin pushed home from their seat, each a step higher */
  if (g.phase === "guess" && samePhoto && was.phase === "guess") {
    const before = new Set(was.locked || []);
    (g.locked || []).filter(player => !before.has(player)).forEach((player, i) =>
      cues.push({ id:"geoLock", at:now + i * 90, pan:g.pans?.[player] || 0, opts:{ step:before.size + i }, key:`${key}:lock:${player}` }));
  }
  return cues;
}

/* What the photo's minute owes the room from `now` while it stands: the
   bed's bars (none under reduced motion), the last ten seconds' ticks and
   the knock at zero. The bars are laid back from closesAt so the last one
   ends on the knock; the turn's last bar is its fifth chord, so the knock
   lands where the turn comes home. */
export function geoClockCues(snap, now, { reduced = false } = {}) {
  if (!snap || snap.phase !== "guess" || !(snap.closesAt > 0) || !(snap.startedAt > 0)) return [];
  const { closesAt, startedAt } = snap;
  const cues = [];
  const ahead = at => at > now - 200;
  if (!reduced) {
    const bars = Math.max(0, Math.floor((closesAt - startedAt - GEO_BED_LEAD_MS) / GEO_BAR_MS));
    const tenseFrom = closesAt - GEO_TENSE_MS;
    for (let i = 0; i < bars; i++) {
      const at = closesAt - (bars - i) * GEO_BAR_MS;
      if (!ahead(at)) continue;
      const tense = at >= tenseFrom ? Math.floor((at - tenseFrom) / GEO_BAR_MS) + 1 : 0;
      const turn = (((i - (bars - 1)) % 4) + 4 + 3) % 4;
      cues.push({ id:"geoBed", at, opts:{ bar:turn, tense, last:i === bars - 1 } });
    }
  }
  for (let s = 10; s >= 1; s--) {
    const at = closesAt - s * 1000;
    if (at > startedAt && ahead(at)) cues.push({ id:"geoTick", at, opts:{ s } });
  }
  if (ahead(closesAt)) cues.push({ id:"S8", at:closesAt });
  return cues;
}

/* The reveal on the map's beats (mapModel revealPlan), from `start`, the
   server instant the beats run from on this TV: each guess pin's drop as
   it meets the map (panned to its player's seat, a step up each), the
   lines running in, the answer landing, then the scores settling as the
   rows slide in (never before the answer has landed). `rows` is how many
   scored rows the panel shows; the last photo resolves. Reduced motion:
   the answer's landing alone. */
export function geoRevealCues({ start, count = 0, pans = [], revealedAt = 0, rows = 0, last = false, reduced = false }) {
  if (!Number.isFinite(Number(start))) return [];
  const t0 = Number(start);
  const plan = revealPlan(Math.max(0, count));
  const answerAt = t0 + plan.answer + GEO_ANSWER_HIT_MS;
  if (reduced) return [{ id:"geoAnswer", at:t0 }];
  const cues = [];
  for (let i = 0; i < count; i++) cues.push({ id:"geoDrop", at:t0 + plan.drops[i] + GEO_DROP_HIT_MS, pan:pans[i] || 0, opts:{ step:i } });
  if (count) cues.push({ id:"geoLines", at:t0 + plan.lines, opts:{ ms:REVEAL.lines } });
  cues.push({ id:"geoAnswer", at:answerAt });
  if (rows > 0 || last) cues.push({ id:"geoSettle", at:Math.max((Number(revealedAt) || t0) + GEO_ROWS_MS + 100, answerAt + 500),
    opts:{ n:Math.min(6, Math.max(3, rows)), last:!!last } });
  return cues;
}

const reducedNow = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* the photo's clock cues: laid when its minute stands on this TV,
   cancelled when it moves on (a bar ringing fades out). The handle, not a
   key, keeps each one single (a key outlives a cancel). */
export function useGeoRoomClock(snap) {
  const stand = snap?.phase === "guess" && snap.closesAt ? `${snap.id}:${snap.roundId}:${snap.startedAt}:${snap.closesAt}` : null;
  useEffect(() => {
    if (!stand) return undefined;
    const handles = geoClockCues(snap, serverNow(), { reduced:reducedNow() })
      .map(cue => cueAt(cue.id, cue.at, { pan:cue.pan || 0, opts:cue.opts || {} }));
    return () => handles.forEach(handle => handle?.cancel?.());
  }, [stand]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* TVGeo's reveal sound. Returns GeoMap's onBeats: called as the map's
   reveal beats run, `elapsed` ms into them. The reveal owes the room only
   when it reached this TV on a fresh frame, latched as it is first drawn
   (the map may take its time to start). One play per reveal. */
export function useGeoRevealSound(view) {
  const key = view?.revealed ? `${view.roundId}:${view.revealedAt}` : null;
  const memo = useRef({ key:null, fresh:false, played:null, handles:[], view:null });
  const m = memo.current;
  if (key !== m.key) {
    m.key = key;
    m.fresh = !!key && freshFrameNow() && serverNow() - (Number(view.revealedAt) || 0) < GEO_REVEAL_FRESH_MS;
  }
  m.view = view;
  useEffect(() => () => memo.current.handles.forEach(handle => handle?.cancel?.()), []);
  const onBeats = useRef(null);
  if (!onBeats.current) onBeats.current = elapsed => {
    const s = memo.current, v = s.view;
    if (!s.key || !s.fresh || s.played === s.key || !v?.revealed) return;
    s.played = s.key;
    const guessed = v.results.filter(row => row.miles !== null);
    /* the score rows enter with the beats (TVGeo), so the settle rides them too */
    const start = serverNow() - Math.max(0, Number(elapsed) || 0);
    const cues = geoRevealCues({ start, count:guessed.length,
      pans:guessed.map(row => geoPan(v.players.indexOf(row.player), v.players.length)),
      revealedAt:start, rows:v.results.length, last:v.last, reduced:reducedNow() });
    s.handles.forEach(handle => handle?.cancel?.());
    s.handles = cues.map(cue => cueAt(cue.id, cue.at, { pan:cue.pan || 0, opts:cue.opts || {} }));
  };
  return onBeats.current;
}
