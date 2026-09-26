import { EMPTY_STATE, cleanLeg, cleanLogistics } from "../shared/core.js";

/* Storage hydration is deliberately pure and additive. A pre-M1 state keeps
   every persisted domain value; absent fields receive current defaults and
   the existing edition-aware logistics/flight normalizers still run. */
function hydrateStoredState(stored) {
  const state = stored && typeof stored === "object" && !Array.isArray(stored)
    ? structuredClone(stored)
    : structuredClone(EMPTY_STATE);

  for (const [key, value] of Object.entries(EMPTY_STATE))
    if (state[key] === undefined) state[key] = structuredClone(value);
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

export { hydrateStoredState };
