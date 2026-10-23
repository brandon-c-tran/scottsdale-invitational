/* A sheet put away by dragging its header down (ui/useSheetDrag.js): the
   numbers a finger turns into, pure so they can be tested. Distances are
   px, times ms, velocities px per ms (positive is down).

   Down, the sheet follows the finger one to one; up, it gives a little
   against its rest and resists more the further it goes (a rubber band,
   never a wall). On release the finger's momentum is projected the way a
   scroll view coasts (Apple's deceleration, 0.998): a sheet whose
   projected rest lies past half its height goes, anything short of that
   comes home. A sheet that cannot close right now gives a little and
   always comes home. */
export const SHEET_DRAG = Object.freeze({
  slop:8,            // movement before a press on the header is a drag
  minFling:24,       // a drag shorter than this never puts the sheet away
  upLimit:48,        // the most it ever lifts against its rest
  lockedLimit:56,    // the most a sheet that cannot close gives downward
  rate:.998,         // the projection's deceleration
  share:.5,          // a projected rest past this share of its height puts it away
  window:100,        // the release velocity reads the drag's last 100ms
  still:60,          // a finger held still this long before it lifts releases at rest
  response:.3,       // the spring home (s), critically damped
  flungFrom:.3,      // released faster than this, the fall keeps the finger's speed
  fallMin:140, fallMax:300,
});

/* resistance past a bound: x px of finger gives less and less sheet,
   approaching `limit` and never reaching it */
export function rubberband(x, limit, constant = .55) {
  if (!(x > 0) || !(limit > 0)) return 0;
  return x * limit * constant / (limit + constant * x);
}
/* the finger distance that rubber-bands to y (a sheet caught mid-spring) */
export function unband(y, limit, constant = .55) {
  if (!(y > 0) || !(limit > 0)) return 0;
  const capped = Math.min(y, limit * .999);
  return capped * limit / (constant * (limit - capped));
}

/* where the sheet stands for a finger `raw` px from its rest */
export function dragOffset(raw, { locked = false } = {}) {
  if (!Number.isFinite(raw) || raw === 0) return 0;
  if (raw < 0) return -rubberband(-raw, SHEET_DRAG.upLimit);
  return locked ? rubberband(raw, SHEET_DRAG.lockedLimit) : raw;
}
/* the inverse: the finger distance a standing offset stands for */
export function rawOffset(offset, { locked = false } = {}) {
  if (!Number.isFinite(offset) || offset === 0) return 0;
  if (offset < 0) return -unband(-offset, SHEET_DRAG.upLimit);
  return locked ? unband(offset, SHEET_DRAG.lockedLimit) : offset;
}

/* how far momentum carries a release, as a scroll view coasts */
export function project(velocity, rate = SHEET_DRAG.rate) {
  return Number.isFinite(velocity) ? velocity * rate / (1 - rate) : 0;
}

/* the finger's speed as it lifted: the last SHEET_DRAG.window ms of
   samples [{ t, y }]; a finger that stopped before lifting has none */
export function releaseVelocity(samples, liftedAt) {
  const list = (samples || []).filter(s => Number.isFinite(s?.t) && Number.isFinite(s?.y));
  if (list.length < 2) return 0;
  const last = list[list.length - 1];
  if (Number.isFinite(liftedAt) && liftedAt - last.t > SHEET_DRAG.still) return 0;
  const first = list.find(s => last.t - s.t <= SHEET_DRAG.window) || last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/* What a release does: { dismiss, fallMs }. `fallMs` is set when the fall
   should keep the finger's speed (a flick), else the sheet's own fall. */
export function releasePlan({ offset, velocity, height, locked = false }) {
  const stay = { dismiss:false, fallMs:null };
  if (locked || !(height > 0) || !(offset > SHEET_DRAG.minFling)) return stay;
  if (offset + project(velocity) <= height * SHEET_DRAG.share) return stay;
  if (!(velocity > SHEET_DRAG.flungFrom)) return { dismiss:true, fallMs:null };
  const left = Math.max(0, height - offset);
  const ms = Math.round(Math.min(SHEET_DRAG.fallMax, Math.max(SHEET_DRAG.fallMin, left / velocity)));
  return { dismiss:true, fallMs:ms };
}

/* the scrim's share of its dark while the sheet stands `offset` down */
export function scrimShare(offset, height) {
  if (!(height > 0) || !(offset > 0)) return 1;
  return Math.max(0, 1 - offset / height);
}

/* the spring home: Apple's damping ratio and response mapped to a unit
   mass's stiffness and damping */
export function springFor(response = SHEET_DRAG.response, dampingRatio = 1) {
  return { stiffness:(2 * Math.PI / response) ** 2, damping:4 * Math.PI * dampingRatio / response };
}
export const homeSettled = (offset, velocityPerSecond) => Math.abs(offset) < .5 && Math.abs(velocityPerSecond) < 20;
