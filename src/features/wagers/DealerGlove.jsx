/* The dealer's hand: the house hand (gags/neon, Oct 14), the one hand in
   the world, reaching in from off the felt. The same neon drawing the bits
   use (a bone tube over dark glass, a cyan cuff and sleeve), on its own so
   the betting table can sweep, rake and pay without loading the bits.
   `size` is the hand's drawn width in px, cuff to fingertips; its sleeve
   runs back off the felt behind it (the table clips it). Right hand,
   wrist at the left; `flip` mirrors it. */
import React from "react";
import { HandArt } from "../gags/neon/Neon.jsx";

/* the hand's own span in its art, cuff to fingertips, and its height */
const HAND_W = 300, HAND_H = 140, WRIST_X = 60;

export function DealerGlove({ pose = "flat", size = 64, flip = false, className = "" }) {
  const scale = size / HAND_W;
  /* a small hand keeps a tube that reads: at least 2 px */
  const weight = Math.max(1, Math.min(2.4, 2 / (4.62 * scale)));
  return (
    <span className={`fd-glove neon-scope${flip ? " is-flip" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true"
      style={{ width:size, height:Math.round(HAND_H * scale) }}>
      <span className="fd-glove-wrist" style={{ left:WRIST_X * scale, top:HAND_H / 2 * scale }}>
        <HandArt pose={pose} scale={scale} weight={weight} />
      </span>
    </span>
  );
}
