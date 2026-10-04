/* Screen Wake Lock, where the browser has it (iOS 18.4+ Safari and home-
   screen apps, Chrome on the TV laptop). Used by poker's Table view and TV
   mode. The system drops the lock whenever the page is hidden, so
   it is asked for again when the page comes back, until released. Never
   throws; `held()` says whether a lock is live. */
export const wakeLockSupported = (nav = typeof navigator === "undefined" ? null : navigator) =>
  !!nav?.wakeLock && typeof nav.wakeLock.request === "function";

export function createWakeLock({ nav = typeof navigator === "undefined" ? null : navigator,
  doc = typeof document === "undefined" ? null : document } = {}) {
  let sentinel = null, wanted = false, pending = null;
  const acquire = async () => {
    if (!wanted || sentinel || pending || !wakeLockSupported(nav) || doc?.visibilityState === "hidden") return false;
    pending = Promise.resolve().then(() => nav.wakeLock.request("screen")).then(lock => {
      pending = null;
      if (!wanted) { Promise.resolve().then(() => lock?.release?.()).catch(() => {}); return false; }
      sentinel = lock;
      lock?.addEventListener?.("release", () => { if (sentinel === lock) sentinel = null; });
      return true;
    }, () => { pending = null; return false; });
    return pending;
  };
  const onVisible = () => { if (doc?.visibilityState === "visible") acquire(); };
  return {
    supported:wakeLockSupported(nav),
    start() {
      if (wanted) return acquire();
      wanted = true;
      doc?.addEventListener?.("visibilitychange", onVisible);
      return acquire();
    },
    async release() {
      wanted = false;
      doc?.removeEventListener?.("visibilitychange", onVisible);
      /* a request still in flight releases itself when it lands */
      const lock = sentinel;
      sentinel = null;
      try { await lock?.release?.(); } catch {}
    },
    held:() => !!sentinel,
  };
}
