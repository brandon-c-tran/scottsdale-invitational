import React from "react";
import { isTvLocation } from "../../lib/haptics.js";
import { setChipPhysics, useChipPhysicsEnabled, chipPhysicsOptedOut } from "../chips3d/chipPhysicsFlag.js";
import "./player-pass.css";

/* This device's Chip physics switch, beside Sound: the betting table's real
   3D chips, on by default. Off, the table keeps its flat chips. */
export function ChipPhysicsToggle() {
  useChipPhysicsEnabled();
  if (typeof window !== "undefined" && isTvLocation(window.location || {})) return null;
  const on = !chipPhysicsOptedOut();
  return <div className="fd-profile-vibration">
    <span id="fd-chips3d-label">Chip physics</span>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="fd-chips3d-label"
      className="fd-switch" onClick={() => setChipPhysics(!on)}><span aria-hidden="true" /></button>
  </div>;
}
