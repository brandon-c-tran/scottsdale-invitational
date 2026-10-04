/* The commissioner's TV check. Each TV socket reports whether its sound
   runs (client.js reportTvSound); the Worker sends commissioner devices the
   list with each TV's age since it last spoke (worker/tournament.js
   tvSummary). A TV that has not spoken for TV_STALE_MS (two missed pings)
   counts as gone. Pure; presence only, never tournament state. */
export const TV_STALE_MS = 60 * 1000;

export function liveTvs(tvs, receivedAt = 0, now = Date.now()) {
  if (!Array.isArray(tvs)) return null;
  const since = Math.max(0, now - (Number(receivedAt) || 0));
  return tvs.filter(tv => tv && Number.isFinite(Number(tv.ageMs)) && Number(tv.ageMs) + since < TV_STALE_MS);
}

/* One line or null. `live` is whether the weekend is on (no TV before
   then is expected). A TV that never reported (an older build) is not
   called muted. */
export function tvHealthLine({ tvs, receivedAt = 0, live = false, now = Date.now() } = {}) {
  const on = liveTvs(tvs, receivedAt, now);
  if (!on) return null;
  if (!on.length) return live ? "No TV connected" : null;
  const off = on.filter(tv => tv.sound === "blocked").length;
  if (!off) return null;
  return off === on.length ? "TV sound off" : `TV sound off on ${off} of ${on.length}`;
}
