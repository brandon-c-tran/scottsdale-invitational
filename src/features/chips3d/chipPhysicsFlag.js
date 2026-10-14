/* This device's "Chip physics" switch (Oct 13): real 3D chips on the
   betting table, on by default. Device-local (like Haptics and Sound), never
   in state. A device that fell back (no WebGL, a lost context, a slow
   frame) reads as off for the session without touching the stored choice.
   No three or physics import here: the phone reads this before deciding
   to load the chip layer at all. */
import { useSyncExternalStore } from "react";

export const CHIP_PHYSICS_KEY = "si-chips3d";
let fellBack = false;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function chipPhysicsOptedOut() {
  try { return localStorage.getItem(CHIP_PHYSICS_KEY) === "off"; } catch { return false; }
}
export function setChipPhysics(on) {
  try { localStorage.setItem(CHIP_PHYSICS_KEY, on ? "on" : "off"); } catch {}
  if (on) fellBack = false;
  emit();
}
/* the chip layer could not run here: flat chips for the rest of the session */
export function chipPhysicsFellBack() { fellBack = true; emit(); }
export const chipPhysicsEnabled = () => !fellBack && !chipPhysicsOptedOut();
export const useChipPhysicsEnabled = () => useSyncExternalStore(subscribe, chipPhysicsEnabled, () => false);
