import React from "react";
import { unlockSound, useSoundUnlockNeeded } from "../../lib/sound.js";
import "./tv-sound.css";

/* A5: a TV whose browser has not allowed sound yet (no kiosk autoplay flag,
   or a reload for a new build) shows one small chip in the canvas corner
   until someone clicks. The kiosk shortcut in the commissioner menu keeps
   sound across reloads so it never shows. */
export function SoundUnlockChip() {
  const needed = useSoundUnlockNeeded();
  if (!needed) return null;
  return <button type="button" className="tv-sound-chip" onClick={() => unlockSound()}>
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
    Click for sound
  </button>;
}
