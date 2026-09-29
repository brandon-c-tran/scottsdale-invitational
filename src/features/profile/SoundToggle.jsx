import React, { useState } from "react";
import { playSound, setSoundOptOut, soundAvailable, soundOptedOut, unlockSound } from "../../lib/sound.js";
import { isTvLocation } from "../../lib/haptics.js";
import "./player-pass.css";

/* This device's Sound opt-out, beside Haptics. On by default; the iPhone's
   silent switch still mutes it. Turning it on plays one chip. */
export function SoundToggle({ available:availableProp }) {
  const [available] = useState(() => availableProp ?? (soundAvailable()
    && !(typeof window !== "undefined" && isTvLocation(window.location || {}))));
  const [on, setOn] = useState(() => !soundOptedOut());
  if (!available) return null;
  const toggle = () => {
    const next = !on;
    setSoundOptOut(!next);
    setOn(next);
    if (next) { unlockSound(); playSound("S5"); }
  };
  return <div className="fd-profile-vibration">
    <span id="fd-sound-label">Sound</span>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="fd-sound-label"
      className="fd-switch" onClick={toggle}><span aria-hidden="true" /></button>
  </div>;
}
