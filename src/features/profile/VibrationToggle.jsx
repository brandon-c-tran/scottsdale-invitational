import React, { useState } from "react";
import { haptic, hapticEnvironment, hapticsToggleAvailable, setVibrationOptOut, tapTick, vibrationOptedOut } from "../../lib/haptics.js";
import "./player-pass.css";

/* This device's Haptics opt-out. Offered on iPhone (the tap tick) and on
   Android phones that can vibrate; on by default. */
export function HapticsToggle({ environment }) {
  const [available] = useState(() => hapticsToggleAvailable(environment ?? hapticEnvironment()));
  const [on, setOn] = useState(() => !vibrationOptedOut());
  if (!available) return null;
  const toggle = () => {
    const next = !on;
    setVibrationOptOut(!next);
    setOn(next);
    if (next) { tapTick(); haptic("place"); }
  };
  return <div className="fd-profile-vibration">
    <span id="fd-haptics-label">Haptics</span>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="fd-haptics-label"
      className="fd-switch" onClick={toggle}><span aria-hidden="true" /></button>
  </div>;
}
/* the name App and older tests import */
export const VibrationToggle = HapticsToggle;
