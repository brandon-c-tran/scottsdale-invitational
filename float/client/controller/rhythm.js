/* The pad (float/GROOVE.md "Judging"): a touch stamped on the room's clock,
   matched to the song's cues, sent as {t:"hit", c, r}. Pure, so the stamping
   and the matching are tested without a browser.

   - A tap counts from the touch event's own time (the performance clock),
     carried onto the room's clock: serverNow - (perfNow - event time). A
     busy frame that delivers the touch late never moves it. An event time
     far from now (an old browser's epoch stamp) falls back to now.
   - matchTap (chart.js) finds the nearest cue not yet taken within 300 ms,
     judged with the room's one offset: d = r - offset. The phone shows d
     (the popup) and sends r (raw), which the room judges with its own
     offset, so a phone and the room can only differ while that offset is
     moving (practice).
   - One judgement a cue: a matched cue is taken for the rest of the song,
     and so is one the room has judged (its miss, or a hit it heard before
     a reload). The taken set is the song's: a new song (another songAt)
     starts it over, a reconnect keeps it.
   - Practice taps go too: the room calibrates on them. */
import { matchTap, popupOf, qualityOf } from "../../shared/chart.js";
import { drinkGate, songView } from "./controllerModel.js";

/* a touch event's own time on the performance clock, or now */
export const EVENT_SLACK_MS = 1000;
export function stampOf(event, now) {
  const ts = Number(event?.timeStamp);
  return Number.isFinite(ts) && ts > 0 && Number.isFinite(now) && Math.abs(now - ts) < EVENT_SLACK_MS ? Math.min(ts, now) : now;
}

/* a touch's own time (performance clock) on the room's clock */
export const serverStamp = (eventAt, { perfNow, serverNow }) =>
  Number.isFinite(eventAt) && Number.isFinite(perfNow) && Number.isFinite(serverNow) && Math.abs(perfNow - eventAt) < EVENT_SLACK_MS
    ? serverNow - (perfNow - eventAt) : serverNow;

export function createPad() {
  let key = null;
  let taken = new Set();
  const api = {
    /* the song the pad is on: another one starts the taken set over */
    song(next) {
      if (next === key) return false;
      key = next;
      taken = new Set();
      return true;
    },
    key:() => key,
    /* a cue the room has judged (a miss, or a hit from before a reload) */
    take(c) { if (Number.isInteger(c)) taken.add(c); },
    has:c => taken.has(c),
    size:() => taken.size,
    /* A tap at server time t: null when it matches no cue, else the cue,
       the judgement as the phone sees it (d, q, the popup's lettering) and
       the hit to send. The cue is taken at once. */
    tap(t, { chart, songAt, offset = 0 }) {
      const off = Number.isFinite(offset) ? offset : 0;
      const match = matchTap(chart, songAt, t, { offset:off, taken });
      if (!match) return null;
      taken.add(match.cue.id);
      const q = qualityOf(match.d);
      return { cue:match.cue, c:match.cue.id, d:match.d, r:match.r, q, popup:popupOf(q, match.d), hit:{ t:"hit", c:match.cue.id, r:match.r } };
    },
  };
  return api;
}

/* A tap on the pad at server time t, as the controller calls it in the
   touch handler: closed while Done is owed (nothing happens at all), else
   the cue it matched (taken at once) with the hit to send and the popup,
   or found null (a tap with no cue near: the sound and the tick only).
   { open, found, gate } */
export function padTap(pad, t, { chart, songAt, offset = 0, owes = false, done = false } = {}) {
  const gate = drinkGate({ view:songView(chart, songAt, t), chart, owes, done });
  if (!gate.pad) return { open:false, found:null, gate };
  return { open:true, found:pad.tap(t, { chart, songAt, offset }), gate };
}

/* the popup the phone shows: its own call at once; the room's word on the
   same cue replaces it once, when it differs (only while the offset moves) */
export function restamp(popup, word) {
  if (!popup || !word || word.c !== popup.c || !word.q || word.q === popup.q) return null;
  const d = Number.isFinite(word.d) ? word.d : null;
  return { ...popup, q:word.q, d, popup:popupOf(word.q, d), restamped:true };
}

/* at most `perSecond` taps of a button that sends (Cheer): a gap of 1000 / perSecond ms */
export function createGate(perSecond = 2) {
  const gap = 1000 / perSecond;
  let last = -Infinity;
  return {
    allow(now) {
      if (!Number.isFinite(now) || now - last < gap) return false;
      last = now;
      return true;
    },
    reset() { last = -Infinity; },
  };
}
