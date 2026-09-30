import { resolveEventLifecycle } from "../../../shared/core.js";

/* A session whose every event is complete folds into one row while anything
   is still left to play, so the event in play and what follows sit near the
   top of Events. Once nothing is left (nextId is null) every session stays
   open. `list` is the session's events without shelved ones. */
export function sessionFold(state, list, nextId) {
  if (!nextId || !list.length) return null;
  if (!list.every(event => resolveEventLifecycle(state, event).phase === "complete")) return null;
  const winners = [...new Set(list.flatMap(event => state.results?.[event.id]?.slots?.[0] || []))];
  return { played:list.length, winners };
}

/* This visit's explicit open/closed choices, by session id. sessionStorage so a
   session opened to look up a winner folds again on the next launch. */
export const FOLD_KEY = "si-events-open";
export function readFolds() {
  try {
    const value = JSON.parse(sessionStorage.getItem(FOLD_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function writeFolds(value) {
  try { sessionStorage.setItem(FOLD_KEY, JSON.stringify(value)); } catch {}
}
