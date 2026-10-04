import React from "react";
import { usePlayerIdentity } from "../features/identity/PlayerIdentityContext.js";

/* A chip as a coin: the flat chip face (children) on a body with real
   thickness, so a chip that leans, lifts or spins shows its edge. The edge
   is a short stack of discs behind the face in the owner's own color,
   darkened (backglass.css .fd-coin3d); the back is the same color. Turn it
   with a transform on the coin (rotateX/rotateY): the parent supplies the
   perspective. Decorative: the control around it carries the label.

   fly() (src/lib/motion.js) builds the same body around a flying chip when
   either end of the flight is marked data-fly-coin, so a chip placed from
   the rack spins on its edge as it flies and one taken back flips home. */
export const COIN_EDGE_LAYERS = 5;

export function Coin({ p = null, color = null, unlit = false, className = "", children }) {
  const identity = usePlayerIdentity(p);
  const tone = unlit ? null : color || identity.color;
  return <span className={`fd-coin3d${unlit ? " is-unlit" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true"
    style={tone ? { "--coin-color":tone } : undefined}>
    {Array.from({ length:COIN_EDGE_LAYERS }, (_, i) =>
      <span key={i} className="fd-coin3d-edge" style={{ "--z":i + 1 }} />)}
    <span className="fd-coin3d-face">{children}</span>
  </span>;
}
