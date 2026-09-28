import { SESSIONS } from "../../../shared/core.js";

/* The trophy's plates: one per event on the slate (the finale is the cup
   itself), blank until that event's result posts, then stamped with the
   winners. A skipped event has no plate. A correction restamps it, because
   the plate reads the official result every time. */
export function trophyPlates(state, events = []) {
  return events.filter(ev => !ev.finale && !state?.shelved?.[ev.id]).map(ev => {
    const winners = state?.results?.[ev.id]?.slots?.[0] || [];
    return { eventId:ev.id, name:ev.name, session:ev.session, winners:[...winners], posted:winners.length > 0 };
  });
}

/* plates grouped into the plinth's tiers, one per session, Friday on top */
export function plateTiers(plates = []) {
  const known = new Set(SESSIONS.map(session => session.id));
  const tiers = SESSIONS.map(session => ({ session:session.id, plates:plates.filter(plate => plate.session === session.id) }));
  tiers.push({ session:"other", plates:plates.filter(plate => !known.has(plate.session)) });
  return tiers.filter(tier => tier.plates.length);
}
