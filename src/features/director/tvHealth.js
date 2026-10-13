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

/* A karaoke video the TV could not start or play (its `video` report,
   docs/KARAOKE.md "The TV report"): blocked or an error, for the turn now.
   `videoKey` is that turn's key when the caller knows it; without it any
   report counts, since a TV settles its own report once the turn moves on. */
const videoStuck = (tv, videoKey) => (tv.video?.state === "blocked" || tv.video?.state === "error")
  && (!videoKey || tv.video?.key === videoKey);

/* One line or null. `live` is whether the weekend is on (no TV before
   then is expected). A TV that never reported (an older build) is not
   called muted. A video that will not play outranks the sound. */
export function tvHealthLine({ tvs, receivedAt = 0, live = false, now = Date.now(), videoKey = null } = {}) {
  const on = liveTvs(tvs, receivedAt, now);
  if (!on) return null;
  if (!on.length) return live ? "No TV connected" : null;
  const stuck = on.filter(tv => videoStuck(tv, videoKey)).length;
  if (stuck) return stuck === on.length ? "Video blocked on the TV" : `Video blocked on ${stuck} of ${on.length} TVs`;
  const off = on.filter(tv => tv.sound === "blocked").length;
  if (!off) return null;
  return off === on.length ? "TV sound off" : `TV sound off on ${off} of ${on.length}`;
}
