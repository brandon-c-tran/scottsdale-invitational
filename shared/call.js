/* D9 "To the TV": the commissioner calls everyone to the TV for a ceremony.
   Presentation state, not tournament truth: `showControl.call` is written
   only by the commissioner's own action (callEveryone / endCall), never as
   part of an official write, and expires on its own after CALL_MS.

     showControl.call = { id, at, kind, eventId, label }

   The label is built here from the event, never taken from the client, so
   every phone reads the same words: "Cornhole draw", "Cornhole winner",
   "The champion". Pure: no storage, no clock beyond what it is given. */

import { allEventsOf, stacksPosted } from "./core.js";

export const CALL_MS = 90 * 1000;
/* a second tap on the same ceremony while its call is up is the same call */
export const CALL_KINDS = Object.freeze(["opening", "event", "draw", "winner", "crown", "tv"]);
const NEEDS_EVENT = new Set(["event", "draw", "winner"]);

const eventOf = (state, events, eventId) =>
  typeof eventId === "string" && eventId ? (events || allEventsOf(state)).find(ev => ev.id === eventId) || null : null;

/* What the bar says after "To the TV". Null reads as just "To the TV". */
export function callLabel(state, events, { kind, eventId = null } = {}) {
  const ev = eventOf(state, events, eventId);
  if (kind === "opening") return "Field Day";
  if (kind === "crown") return "The champion";
  if (kind === "draw") return ev ? `${ev.name} draw` : null;
  if (kind === "winner") return ev ? `${ev.name} winner` : null;
  return ev ? ev.name : null;
}

/* Server validation for a call request: a known kind, and for an event
   ceremony an event that exists and is not shelved. */
export function validateCall(state, events, request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return { ok:false, error:"Choose what to call" };
  const kind = typeof request.kind === "string" ? request.kind : "";
  if (!CALL_KINDS.includes(kind)) return { ok:false, error:"Choose what to call" };
  const list = events || allEventsOf(state);
  let eventId = null;
  if (NEEDS_EVENT.has(kind) || (kind === "tv" && request.eventId)) {
    const ev = eventOf(state, list, request.eventId);
    if (!ev) return { ok:false, error:"Choose a current event" };
    if (state.shelved?.[ev.id]) return { ok:false, error:"That event is shelved" };
    eventId = ev.id;
  }
  if (kind === "winner" && !state.results?.[eventId]?.slots?.[0]?.length)
    return { ok:false, error:"Post the result first" };
  if (kind === "crown" && !state.frozen && !stacksPosted(state))
    return { ok:false, error:"Post the counts first" };
  return { ok:true, call:{ kind, eventId, label:callLabel(state, list, { kind, eventId }) } };
}

export const sameCallTarget = (left, right) => !!left && !!right
  && left.kind === right.kind && (left.eventId || null) === (right.eventId || null);

/* The call every phone should be showing right now, or null. A record from
   a newer build (unknown kind) or a malformed one is ignored. */
export function liveCall(state, now = Date.now()) {
  const call = state?.showControl?.call;
  if (!call || typeof call !== "object" || typeof call.id !== "string") return null;
  const at = Number(call.at);
  if (!Number.isFinite(at) || !CALL_KINDS.includes(call.kind)) return null;
  return now < at + CALL_MS ? call : null;
}

export const callRemainingMs = (call, now = Date.now()) =>
  call ? Math.max(0, Number(call.at) + CALL_MS - now) : 0;

const DIRECTOR_CALLS = {
  "announce-draw":beat => ({ kind:"draw", eventId:beat.eventId }),
  announce:beat => ({ kind:"event", eventId:beat.eventId }),
  "replay-winner-scene":beat => ({ kind:"winner", eventId:beat.eventId }),
  "start-opening-scene":() => ({ kind:"opening", eventId:null }),
  "crown-champion":() => ({ kind:"crown", eventId:null }),
  "start-champion-scene":() => ({ kind:"crown", eventId:null }),
};

const hasDraw = (state, eventId) => !!(state.draws?.[eventId] || state.stages?.[eventId]);

/* The ceremony the commissioner is about to run, or is running now, as a
   call target: the director's next ceremony beat first (call the room
   before the intro plays), then the scene on the TV, then an announcement
   still in its first minutes. Null when nothing ceremonial is near; the
   commissioner can still call everyone by hand. */
export function callSuggestion(state, events, director, now = Date.now()) {
  const list = events || allEventsOf(state);
  const beat = director?.nextAction;
  const eventId = beat?.eventId || director?.event?.id || null;
  const fromBeat = beat && DIRECTOR_CALLS[beat.type]?.({ ...beat, eventId });
  const target = fromBeat || (() => {
    const active = state.showControl?.active;
    if (active?.kind === "winner" && active.eventId) return { kind:"winner", eventId:active.eventId };
    if (active?.kind === "champion") return { kind:"crown", eventId:null };
    if (active?.kind === "opening") return { kind:"opening", eventId:null };
    if (active?.kind === "event-intro" && active.eventId)
      return { kind:hasDraw(state, active.eventId) ? "draw" : "event", eventId:active.eventId };
    /* an announcement still playing out on the TV */
    for (const [id, op] of Object.entries(state.eventOps || {})) {
      const at = Number(op?.announcedAt);
      if (!at || op.startedAt || state.results?.[id] || now - at > CALL_MS) continue;
      return { kind:hasDraw(state, id) ? "draw" : "event", eventId:id };
    }
    return null;
  })();
  if (!target) return null;
  const checked = validateCall(state, list, target);
  return checked.ok ? checked.call : null;
}

/* The manual call: the event in play, or just the TV. */
export function manualCall(state, events, director) {
  const eventId = director?.event?.id || null;
  const checked = validateCall(state, events, { kind:"tv", eventId });
  return checked.ok ? checked.call : { kind:"tv", eventId:null, label:null };
}
