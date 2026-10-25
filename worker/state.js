import { EMPTY_STATE, allEventsOf, cleanLeg, cleanLogistics, migrateAwardLadder } from "../shared/core.js";
import { FLOAT_EVENT, FLOAT_STANDBY, floatSlate } from "../shared/float.js";

/* The wager retry ledger lives under its own storage key. At its 2048-entry
   cap it is the largest single part of the tournament, and keeping it out of
   "state" keeps that value well under the Durable Object's per-value limit.
   In memory it stays at state.wagerOps so actions read it unchanged. */
const WAGER_OPS_KEY = "wagerOps";
const WAGER_OPS_LIMIT = 2048;

const plainObject = value => !!value && typeof value === "object" && !Array.isArray(value);

/* A state stored before the split (or by a rolled-back build) embeds its
   ledger; the separate key holds what this build wrote. Keep both, newest
   first, under the same cap the actions enforce. */
function mergeWagerOps(separate, embedded) {
  const merged = { ...(plainObject(separate) ? separate : {}), ...(plainObject(embedded) ? embedded : {}) };
  const keys = Object.keys(merged);
  if (keys.length <= WAGER_OPS_LIMIT) return merged;
  keys.sort((left, right) => (merged[left]?.at || 0) - (merged[right]?.at || 0));
  for (const key of keys.slice(0, keys.length - WAGER_OPS_LIMIT)) delete merged[key];
  return merged;
}

/* Karaoke joined Friday night (Oct 12). A slate the commissioner reordered
   before then (a Reorder saves every event's id) has no place for it, and
   an id missing from a saved order sorts after everything, the poker finale
   included. So it takes its place after Where and When, else after the
   order's last Friday event, else first. Karaoke alone, and not while it is
   skipped (a Reorder leaves a skipped event out). */
function placeKaraoke(state) {
  const order = state.eventOrder;
  if (!Array.isArray(order) || !order.length || order.includes("karaoke") || state.shelved?.karaoke) return;
  const events = allEventsOf({ ...state, eventOrder:[] });
  if (!events.some(ev => ev.id === "karaoke")) return;
  const friday = new Set(events.filter(ev => ev.session === "fri").map(ev => ev.id));
  let after = order.indexOf("where");
  for (let k = order.length - 1; after < 0 && k >= 0; k--) if (friday.has(order[k])) after = k;
  order.splice(after + 1, 0, "karaoke");
}

/* Float took Beerio Kart's slot (Oct 25). A slate saved before then has no
   place for it, and a missing id would sort after the poker finale. It
   takes Beerio Kart's place in the order (Beerio one step later), else
   comes after the order's last Saturday-night event, else just before the
   finale, else last. Not while Float is skipped, never twice. */
function placeFloat(state) {
  const order = state.eventOrder;
  if (!Array.isArray(order) || !order.length || order.includes(FLOAT_EVENT) || state.shelved?.[FLOAT_EVENT]) return;
  const events = allEventsOf({ ...state, eventOrder:[] });
  if (!events.some(ev => ev.id === FLOAT_EVENT)) return;
  let at = order.indexOf(FLOAT_STANDBY);
  if (at < 0) {
    const night = new Set(events.filter(ev => ev.session === "san").map(ev => ev.id));
    for (let k = order.length - 1; at < 0 && k >= 0; k--) if (night.has(order[k])) at = k + 1;
  }
  if (at < 0) {
    const finale = new Set(events.filter(ev => ev.finale).map(ev => ev.id));
    at = order.findIndex(id => finale.has(id));
  }
  order.splice(at < 0 ? order.length : at, 0, FLOAT_EVENT);
}

/* Storage hydration is deliberately pure and additive. A pre-M1 state keeps
   every persisted domain value; absent fields receive current defaults and
   the existing edition-aware logistics/flight normalizers still run. */
function hydrateStoredState(stored, storedWagerOps) {
  const state = stored && typeof stored === "object" && !Array.isArray(stored)
    ? structuredClone(stored)
    : structuredClone(EMPTY_STATE);

  /* Oct 14: the award ladder went x1.5. A stored custom event or value edit
     on the old ladder (400/800/1200/1600) moves to the new one once, before
     the defaults below mark the state as on it; an unmoved 400 would pay
     nothing. Posted results are derived and pay the new table. */
  migrateAwardLadder(state);
  for (const [key, value] of Object.entries(EMPTY_STATE))
    if (state[key] === undefined) state[key] = structuredClone(value);
  if (storedWagerOps !== undefined)
    state.wagerOps = mergeWagerOps(structuredClone(storedWagerOps), state.wagerOps);
  /* v9 adds explicit contest operations only when a host opens/advances one.
     Never invent a group winner or reopen an in-progress legacy market while
     hydrating: its original results, advancement and wagers remain intact. */
  if (Number(state.v || 0) < EMPTY_STATE.v) state.v = EMPTY_STATE.v;
  placeKaraoke(state);
  placeFloat(state);
  /* Float plays, Beerio Kart stands by: once a board, while Beerio has
     nothing on it (shared/float.js floatSlate) */
  floatSlate(state);

  state.logistics = cleanLogistics(state.logistics);
  for (const profile of Object.values(state.profiles || {})) {
    for (const key of ["flightIn", "flightOut"]) {
      if (profile[key] === undefined) continue;
      const leg = cleanLeg(profile[key]);
      if (leg) profile[key] = leg;
      else delete profile[key];
    }
  }

  return state;
}

/* The stored shape: "state" without its ledger, and the ledger alone. */
function splitStoredState(state) {
  const { wagerOps, ...rest } = state || {};
  return { state:rest, wagerOps:plainObject(wagerOps) ? wagerOps : {} };
}

export { WAGER_OPS_KEY, WAGER_OPS_LIMIT, hydrateStoredState, mergeWagerOps, splitStoredState };
