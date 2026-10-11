import React from "react";
import { CAST } from "../cast/castGeometry.js";
import { CastChip, Swaps } from "../cast/CastChip.jsx";
import { DUST_LOW, Dust, Fork, Knife, Napkin, VULTURE, Vulture as Bird } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./vulture.css";

/* vulture (loss, desert): the chip alone on the desert floor, glum. A
   turkey vulture glides in from the right, wings up, and lands beside it
   in a puff of dust, folding its wings like an undertaker's coat. They
   look at each other (the chip turns to it, the bird leans in). The chip
   scoots a little way off; the vulture scoots after it. Again, faster.
   The vulture tucks a napkin under its beak and comes up with a knife and
   fork, held up ready. The chip turns and looks at us. Hold.

   The stage's camera shoots it (the registry's camera, in this stage's
   world x: the chip at 820, the bird landing at 1170). */
const VU = bitById("vulture").beats;
export const VU_STAGE = Object.freeze({ x:820, bird:1170, floor:CAST.floor, scoot:56, scoot2:70, scale:1.12 });

const r1 = n => Math.round(n * 10) / 10;

export function Vulture({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, bird, floor, scale } = VU_STAGE;
  const step1 = VU_STAGE.scoot, step2 = VU_STAGE.scoot + VU_STAGE.scoot2;
  /* in on the air: wings up, a beat or two, the landing flare; down, the
     fold; the wings forward to hold the knife and fork */
  const poses = [["glide", 0], ["flap", VU.glide + 180], ["glide", VU.glide + 300], ["flap", VU.glide + 480], ["glide", VU.glide + 580],
    ["flap", VU.land], ["stand", VU.fold], ["hold", VU.cutlery]];
  const at = p => ({ left:r1(p.x * scale), top:r1(p.y * scale) });
  const style = { "--step1":`translateX(${-step1}px)`, "--step2":`translateX(${-step2}px)` };
  return (
    <div className="vu" style={style}>
      <CastChip player={player} x={x} y={floor} className="vu-chip" hands={{ l:"rest", r:"rest" }} />
      <Dust className="vu-dust" at={VU.land} puffs={DUST_LOW} spread={0.8} size={0.85} style={{ left:bird, top:floor - 6 }} />
      <span className="vu-node vu-bird" style={{ left:bird, top:floor }}>
        <span className="vu-node vu-fly-x"><span className="vu-node vu-scoot">
          <span className="vu-shadow" />
          <span className="vu-node vu-fly-y"><span className="vu-node vu-hop"><span className="vu-node vu-lean">
            <Swaps layers={poses.map(([pose, ms]) => [<Bird pose={pose} scale={scale} />, ms])} />
            {/* the napkin under its beak, the knife and fork in its wingtips */}
            <span className="vu-node vu-napkin" style={at(VULTURE.neck)}><Napkin scale={scale * 0.95} /></span>
            <span className="vu-node vu-knife" style={at(VULTURE.knife)}><Knife scale={scale * 1.05} /></span>
            <span className="vu-node vu-fork" style={at(VULTURE.fork)}><Fork scale={scale * 1.05} /></span>
          </span></span></span>
        </span></span>
      </span>
    </div>
  );
}
