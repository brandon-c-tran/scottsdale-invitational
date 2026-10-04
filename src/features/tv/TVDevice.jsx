import React, { useEffect } from "react";
import { createWakeLock } from "../../lib/wakeLock.js";
import {
  TV_EARLY_MAX_MS, TV_EARLY_STEP_MS, setSoundEarlyMs, soundEarlyMs, useSoundEarlyMs, useTvSoundStatus,
} from "../../lib/sound.js";
import "./tv-sound.css";
import { Icon } from "../../ui/Icon.jsx";

/* The TV laptop's own upkeep, none of it tournament state. */

/* The screen stays awake while TV mode is up (Screen Wake Lock where the
   browser has it; asked again when the page comes back; released on exit). */
export function useTvWakeLock() {
  useEffect(() => {
    const lock = createWakeLock();
    lock.start();
    return () => { lock.release(); };
  }, []);
}

/* Whether this TV's sound runs, handed to the transport so the
   commissioner sees a muted TV (client.js reportTvSound, passed in by App
   so TV mode never imports the transport). */
export function useTvSoundReport(onStatus) {
  const status = useTvSoundStatus();
  useEffect(() => { onStatus?.(status); }, [status, onStatus]);
}

/* "Sound early by": a TV or soundbar that delays audio lands the room's
   sounds late against the picture; this plays them that much sooner.
   Device-local (sound.js). Shows and hides with Exit TV. */
export function SoundEarlyControl({ idle = false }) {
  const ms = useSoundEarlyMs();
  return <div className={`tv-early${idle ? " is-idle" : ""}`} role="group" aria-label="Sound early by">
    <span>Sound early by <output aria-live="polite">{ms}</output> ms</span>
    <button type="button" aria-label="10 ms less" disabled={ms <= 0}
      onClick={() => setSoundEarlyMs(soundEarlyMs() - TV_EARLY_STEP_MS)}><Icon name="minus" size={28} /></button>
    <button type="button" aria-label="10 ms more" disabled={ms >= TV_EARLY_MAX_MS}
      onClick={() => setSoundEarlyMs(soundEarlyMs() + TV_EARLY_STEP_MS)}><Icon name="plus" size={28} /></button>
  </div>;
}
