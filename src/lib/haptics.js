/* Haptics: Android phones only. iOS Safari has no Vibration API and desktop
   Chrome exposes one that does nothing useful, so both stay silent. Reduced
   motion, this device's Vibration opt-out, and the TV surface all mute it.
   Presentation only: nothing here reads or writes tournament state. */

export const VIBRATION_KEY = "si-vibration";

export const HAPTIC_PATTERNS = Object.freeze({
  place:8,
  retract:5,
  pick:[20, 40, 20],
  settle:15,
  lead:[15, 50, 15],
});

const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const vibrationOptedOut = () => {
  try { return storage()?.getItem(VIBRATION_KEY) === "off"; } catch { return false; }
};
export const setVibrationOptOut = off => {
  try { off ? storage()?.setItem(VIBRATION_KEY, "off") : storage()?.removeItem(VIBRATION_KEY); } catch {}
};

export function isAndroid({ userAgent = "", platform = "" } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}

export const isTvLocation = ({ pathname = "", search = "" } = {}) =>
  pathname === "/tv" || new URLSearchParams(search).has("tv");

/* The one gate, pure so every branch is testable. */
export function hapticsAllowed({ userAgent, platform, canVibrate, reducedMotion, optedOut, tv }) {
  return !!canVibrate && isAndroid({ userAgent, platform }) && !reducedMotion && !optedOut && !tv;
}

/* The toggle is offered only where vibration can actually happen. */
export function vibrationAvailable({ userAgent, platform, canVibrate, reducedMotion, tv }) {
  return hapticsAllowed({ userAgent, platform, canVibrate, reducedMotion, optedOut:false, tv });
}

/* App marks the TV surface; the URL check covers a TV that booted there. */
let tvSurface = false;
export const setHapticSurface = surface => { tvSurface = surface === "tv"; };

export function hapticEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  return {
    userAgent:navigator.userAgent || "",
    platform:navigator.userAgentData?.platform || "",
    canVibrate:typeof navigator.vibrate === "function",
    reducedMotion:!!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    tv:tvSurface || isTvLocation(window.location || {}),
  };
}

export function haptic(kind) {
  const pattern = HAPTIC_PATTERNS[kind];
  const env = hapticEnvironment();
  if (!pattern || !env || !hapticsAllowed({ ...env, optedOut:vibrationOptedOut() })) return false;
  try { return navigator.vibrate(pattern) !== false; } catch { return false; }
}
