import React from "react";
import { CAST } from "../cast/castGeometry.js";
import { CastChip, Swaps } from "../cast/CastChip.jsx";
import { DUST_LOW, Dust, Roadrunner as Bird, SpeedLines } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./roadrunner.css";

/* roadrunner (loss, desert): the chip alone on the desert floor, the wind.
   A roadrunner comes in like a shot from the right and stops dead beside
   it, heels in. It stands there. Beep beep. The chip turns to look at it.
   Gone, back the way it came, and the chip with it, in a burst of dust.
   When the dust clears only the chip's shadow is left on the floor. A
   beat. The shadow notices, gathers itself, and runs off after it. */
const RR = bitById("roadrunner").beats;
export const RR_STAGE = Object.freeze({ x:880, bird:1265, floor:CAST.floor });
/* the cloud the bird leaves where the chip stood: big puffs, slow to clear */
const CLOUD = Object.freeze([[-170, -70, 1.9], [-70, -150, 2.1], [70, -130, 2], [170, -60, 1.8], [0, -70, 2.3], [-250, -24, 1.5],
  [250, -30, 1.4], [-420, -40, 1.3], [-620, -30, 1.1]]);

export function Roadrunner({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, bird, floor } = RR_STAGE;
  const poses = [["run", 0], ["skid", RR.stop], ["stand", RR.stop + 150], ["beep", RR.beep], ["stand", RR.beep + 100],
    ["beep", RR.beep + 190], ["stand", RR.beep + 290], ["run", RR.leave]];
  const draw = pose => pose === "beep" ? <Bird pose="stand" beak="open" /> : <Bird pose={pose} />;
  return (
    <div className="rr">
      <div className="rr-cam">
        <CastChip player={player} x={x} y={floor} className="rr-chip" hands={{ l:"rest", r:"rest" }} />
        <Dust className="rr-skid" at={RR.stop} puffs={DUST_LOW} spread={0.55} size={0.7} style={{ left:bird - 20, top:floor - 4 }} />
        <span className="rr-node rr-bird" style={{ left:bird, top:floor }}>
          <span className="rr-node rr-bird-x">
            <span className="rr-node rr-lines is-in" style={{ left:110, top:-130 }}><SpeedLines length={520} /></span>
            <span className="rr-node rr-lines is-out" style={{ left:110, top:-130 }}><SpeedLines length={520} /></span>
            <span className="rr-node rr-bird-in"><Swaps layers={poses.map(([pose, ms]) => [draw(pose), ms])} /></span>
          </span>
        </span>
        <Dust className="rr-cloud" at={RR.leave + 40} puffs={CLOUD} spread={1} size={1} style={{ left:x, top:floor - 10 }} />
        <Dust className="rr-zip-dust" at={RR.zip} puffs={DUST_LOW} spread={0.5} size={0.6} style={{ left:x + 60, top:floor - 2 }} />
      </div>
    </div>
  );
}
