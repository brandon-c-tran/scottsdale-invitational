import { EMPTY_STATE, cleanLeg, cleanLogistics } from "../shared/core.js";

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

/* Storage hydration is deliberately pure and additive. A pre-M1 state keeps
   every persisted domain value; absent fields receive current defaults and
   the existing edition-aware logistics/flight normalizers still run. */
function hydrateStoredState(stored, storedWagerOps) {
  const state = stored && typeof stored === "object" && !Array.isArray(stored)
    ? structuredClone(stored)
    : structuredClone(EMPTY_STATE);

  for (const [key, value] of Object.entries(EMPTY_STATE))
    if (state[key] === undefined) state[key] = structuredClone(value);
  if (storedWagerOps !== undefined)
    state.wagerOps = mergeWagerOps(structuredClone(storedWagerOps), state.wagerOps);
  /* v9 adds explicit contest operations only when a host opens/advances one.
     Never invent a group winner or reopen an in-progress legacy market while
     hydrating: its original results, advancement and wagers remain intact. */
  if (Number(state.v || 0) < EMPTY_STATE.v) state.v = EMPTY_STATE.v;

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
