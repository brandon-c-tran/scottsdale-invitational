/* The weekend's session phase: which surface palette the phones wear
   (data-phase on the root, experience.css) and which sky the TV's Desert
   Clock draws. One pure function over authoritative state, so every phone
   and every TV agree. Nothing here imports TV code. */

import { eventInPlay, resolveWeekendOperation } from "../../shared/core.js";

/* fri = Friday, sam = Saturday morning, sap = Saturday afternoon,
   san = Saturday night, fin = the finale */
export const PHASES = Object.freeze(["fri", "sam", "sap", "san", "fin"]);
export const isPhase = phase => PHASES.includes(phase);

export const openEvent = (state, ev) => !!ev && !state.results?.[ev.id] && !state.shelved?.[ev.id];

/* The event being played right now: the on-deck event, then the operation
   event once it is in play, then any other event in play. The finale is
   never "live" here; the poker table has its own phase. */
export function liveEventOf(state, events = [], operationEvent = null) {
  const playable = ev => openEvent(state, ev) && !ev.finale;
  if (!state.frozen) {
    const onDeck = events.find(ev => ev.id === state.onDeck);
    if (playable(onDeck)) return onDeck;
  }
  if (playable(operationEvent) && eventInPlay(state, operationEvent)) return operationEvent;
  return events.find(ev => playable(ev) && eventInPlay(state, ev)) || null;
}

const posted = res => Number(res?.confirmedAt || res?.ts) || 0;

/* The session the weekend is in: the finale once the table is dealt or the
   board is frozen; Friday until the weekend goes live; then the event in
   play, then the last event posted, then the one being prepared.
   `operationEvent` and `liveEvent` default to what the state resolves, so a
   caller that already has them (the TV) passes them and gets the same answer. */
export function weekendPhase(state, events = [], { liveEvent, operationEvent } = {}) {
  if (state?.frozen || state?.poker) return "fin";
  if (!state?.live) return "fri";
  if (events.some(ev => ev.finale && state.results?.[ev.id])) return "fin";
  const operation = operationEvent === undefined ? resolveWeekendOperation(state, events).event : operationEvent;
  const live = liveEvent === undefined ? liveEventOf(state, events, operation) : liveEvent;
  if (isPhase(live?.session)) return live.session;
  let latest = null;
  for (const ev of events) {
    const res = state.results?.[ev.id];
    if (res?.slots?.[0]?.length && isPhase(ev.session) && (!latest || posted(res) > latest.at))
      latest = { session:ev.session, at:posted(res) };
  }
  if (latest) return latest.session;
  if (isPhase(operation?.session)) return operation.session;
  return "fri";
}
