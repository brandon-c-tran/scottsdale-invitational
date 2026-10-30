/* A state where the named events are up first, in that order. The slate
   reads by day before the stored order (shared/core.js allEventsOf, so an
   event moved to another day takes that day's turn), so a bare order of
   Saturday ids no longer pulls them ahead of Friday: these put them on
   Friday night, which is what "up first" is on a fresh board. */
export function firstUp(state, ids = []) {
  state.eventOrder = [...ids];
  state.eventEdits = { ...(state.eventEdits || {}), ...Object.fromEntries(ids.map(id => [id, { ...(state.eventEdits?.[id] || {}), session:"fri" }])) };
  return state;
}
