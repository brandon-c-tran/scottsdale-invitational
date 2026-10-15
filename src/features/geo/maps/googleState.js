/* Whether Google's map failed this session (a refused key, a script that
   failed or never answered). Tiny and static, so GeoMap can ask without
   pulling in the loader: every map after a failure is MapLibre's. */
let failed = false;
const failures = new Set();
export const googleFailed = () => failed;
/* fn() once Google has failed; returns the unsubscribe */
export function onGoogleFailure(fn) {
  failures.add(fn);
  return () => failures.delete(fn);
}
export function failGoogle() {
  if (failed) return;
  failed = true;
  [...failures].forEach(fn => { try { fn(); } catch {} });
}
/* the tests' reset */
export function resetGoogleState() { failed = false; failures.clear(); }
