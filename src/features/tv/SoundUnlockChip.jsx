import React from "react";
import { unlockSound, useSoundUnlockNeeded } from "../../lib/sound.js";
import "./tv-sound.css";
import { Icon } from "../../ui/Icon.jsx";

/* A5: a TV whose browser has not allowed sound yet (no kiosk autoplay flag,
   or a reload for a new build) cannot be missed: a lit sign in its own slot
   of the masthead row, where the edition plate stands, its lamp flashing
   (the pending lamp state), until someone clicks. A missed click would mute
   the whole weekend. It steps out with the masthead for a takeover and is
   back when the masthead is. The kiosk shortcut in the commissioner menu
   keeps sound across reloads so it never shows. */
export function SoundUnlockChip() {
  const needed = useSoundUnlockNeeded();
  if (!needed) return null;
  return <button type="button" className="tv-sound-chip fd-lamp is-live is-pending" onClick={() => unlockSound()}>
    <Icon name="sound" size={36} lit />
    <span className="tv-sound-chip-text"><b className="fd-show">Click for sound</b></span>
  </button>;
}
