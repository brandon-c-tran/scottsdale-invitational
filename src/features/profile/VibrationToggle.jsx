import React, { useState } from "react";
import { haptic, hapticEnvironment, setVibrationOptOut, vibrationAvailable, vibrationOptedOut } from "../../lib/haptics.js";
import "./player-pass.css";

/* This device's opt-out. Offered only where the phone can vibrate at all. */
export function VibrationToggle({ environment }) {
  const [available] = useState(() => {
    const env = environment ?? hapticEnvironment();
    return !!env && vibrationAvailable(env);
  });
  const [on, setOn] = useState(() => !vibrationOptedOut());
  if (!available) return null;
  const toggle = () => {
    const next = !on;
    setVibrationOptOut(!next);
    setOn(next);
    if (next) haptic("place");
  };
  return <div className="fd-profile-vibration">
    <span id="fd-vibration-label">Vibration</span>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="fd-vibration-label"
      className="fd-switch" onClick={toggle}><span aria-hidden="true" /></button>
  </div>;
}
