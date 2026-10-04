/* Haptics, two paths, one device toggle ("Haptics" on the profile).
   - Android: navigator.vibrate patterns (haptic). Reduced motion, the
     opt-out, and the TV surface mute it. Desktop Chrome exposes a vibrate
     that does nothing useful, so it stays silent.
   - iPhone: iOS 18 Safari has no Vibration API, but it plays a light system
     tick when a user gesture toggles an <input type=checkbox switch>.
     tapTick() toggles a hidden one through its label, synchronously, inside
     the tap that called it. Only the opt-out and the TV mute it: a tick is
     not motion. Call it from the user's OWN tap handler before any await,
     never for a remote event, and never on Quick Draw's reaction tap.
   Presentation only: nothing here reads or writes tournament state. */

/* The stored key predates the rename to Haptics; existing opt-outs carry over. */
export const VIBRATION_KEY = "si-vibration";
export const HAPTICS_KEY = VIBRATION_KEY;

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

/* iPhone, iPad, and iPadOS (which reports a Mac with touch). */
export function isIOS({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && Number(maxTouchPoints) > 1 && !/Android/i.test(platform);
}

export function isAndroid({ userAgent = "", platform = "" } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}

export const isTvLocation = ({ pathname = "", search = "" } = {}) =>
  pathname === "/tv" || new URLSearchParams(search).has("tv");

/* The one Android gate, pure so every branch is testable. */
export function hapticsAllowed({ userAgent, platform, canVibrate, reducedMotion, optedOut, tv }) {
  return !!canVibrate && isAndroid({ userAgent, platform }) && !reducedMotion && !optedOut && !tv;
}

/* Android vibration can happen on this device (ignoring the opt-out). */
export function vibrationAvailable({ userAgent, platform, canVibrate, reducedMotion, tv }) {
  return hapticsAllowed({ userAgent, platform, canVibrate, reducedMotion, optedOut:false, tv });
}

/* The iOS tick gate: an iPhone (or iPad), not opted out, not the TV. */
export function tickAllowed({ userAgent, platform, maxTouchPoints, optedOut, tv }) {
  return isIOS({ userAgent, platform, maxTouchPoints }) && !optedOut && !tv;
}

/* The Haptics toggle shows wherever either path can fire. */
export function hapticsToggleAvailable(env) {
  return !!env && (vibrationAvailable(env) || tickAllowed({ ...env, optedOut:false }));
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
    maxTouchPoints:Number(navigator.maxTouchPoints) || 0,
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

/* A fresh label+switch per tick, attached to <head> with display:none so it
   never takes focus, layout, or a screen reader's attention, and removed at
   once. Its clicks stop at the label so no app listener sees them. */
function tickSwitch(doc) {
  const label = doc.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = doc.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  label.addEventListener("click", event => event.stopPropagation());
  return label;
}

/* The iOS tap tick. Returns true when it toggled the switch. */
export function tapTick() {
  const env = hapticEnvironment();
  if (!env || !tickAllowed({ ...env, optedOut:vibrationOptedOut() })) return false;
  try {
    const doc = globalThis.document;
    const host = doc?.head || doc?.body;
    if (!host) return false;
    const label = tickSwitch(doc);
    host.appendChild(label);
    label.click();
    label.remove();
    return true;
  } catch { return false; }
}
