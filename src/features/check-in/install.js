/* PWA install: stash the browser's install prompt when offered. iOS never
   fires it. Chrome usually fires AFTER first paint, so subscribers get a
   nudge to re-render once the native button becomes possible. */
let installEvt = null;
const installSubs = new Set();
const onInstallReady = fn => { installSubs.add(fn); return () => installSubs.delete(fn); };
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); installEvt = e; installSubs.forEach(fn => fn());
  });
}
const isStandalone = () => typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);

export const firstOnboardStep = () => (isStandalone() || !isMobile() ? 0 : -1);
export { installEvt, onInstallReady, isStandalone, isIOS };
