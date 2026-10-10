import React from "react";
import { CAST } from "../cast/castGeometry.js";
import { CastChip, Swaps } from "../cast/CastChip.jsx";
import { DUST_LOW, Dust, Emanata, Roadrunner as Bird, SpeedLines } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./roadrunner.css";

/* roadrunner (loss, desert): the chip alone on the desert floor, the wind.
   A roadrunner comes in like a shot from the right and skids a long way to
   a stop beside it, heels dug in, leaning way back, dust going up behind
   it and spraying out ahead. It pitches forward and stands there. It leans
   in: beep beep. The chip turns to look at it. Gone, back the way it came,
   and the chip with it, in a burst of dust. When the dust clears only the
   chip's shadow is left on the floor. A beat. The shadow notices, pulls
   back, winds itself up on the spot (kicking dust), and runs off after it.

   The stage's camera shoots it (the registry's camera, in this stage's
   world x: the chip at 880, the bird stopping at 1330). */
const RR = bitById("roadrunner").beats;
export const RR_STAGE = Object.freeze({ x:880, bird:1330, floor:CAST.floor, slide:260, pull:90 });
/* the open beak's tip, from the bird's feet (Props.jsx Roadrunner), and
   its beep's marks fanned up and out over the chip's glove */
const BEAK = Object.freeze({ x:-188, y:-186 });
const BEEP_RAYS = Object.freeze([[-168, 14, 50], [-138, 16, 58], [-108, 14, 50]]);
/* the cloud the bird leaves where the chip stood: big puffs, slow to clear */
const CLOUD = Object.freeze([[-170, -70, 1.9], [-70, -150, 2.1], [70, -130, 2], [170, -60, 1.8], [0, -70, 2.3], [-250, -24, 1.5],
  [250, -30, 1.4], [-420, -40, 1.3], [-620, -30, 1.1]]);
/* the skid: dust ploughed up behind the heels along the slide, and a
   spray thrown out ahead of them at the stop */
const PLOUGH = Object.freeze([[50, -50, 1.05], [110, -86, 0.9], [20, -92, 0.8], [160, -40, 0.95], [90, -20, 0.85]]);
const SPRAY = Object.freeze([[-90, -26, 1.1], [-170, -52, 0.95], [-50, -70, 0.8], [-240, -20, 0.85], [-130, -12, 0.9]]);
/* the shadow revving: dust kicked out behind it */
const KICK = Object.freeze([[60, -30, 0.7], [110, -50, 0.6], [150, -18, 0.55]]);

export function Roadrunner({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, bird, floor, slide, pull } = RR_STAGE;
  const poses = [["run", 0], ["skid", RR.skid], ["stand", RR.stop + 150], ["beep", RR.beep], ["stand", RR.beep + 100],
    ["beep", RR.beep + 190], ["stand", RR.beep + 290], ["run", RR.leave]];
  const draw = pose => pose === "beep" ? <Bird pose="stand" beak="open" /> : <Bird pose={pose} />;
  /* the plough: four puffs of dust along the slide, each where the heels
     are at that instant (the slide eases out: most of it is early) */
  const along = [[0, 0], [0.3, 0.1], [0.58, 0.25], [0.82, 0.45]].map(([f, t], i) =>
    ({ x:bird + slide * (1 - f) - 10, at:RR.skid + Math.round((RR.stop - RR.skid) * t), i }));
  return (
    <div className="rr" style={{ "--slide":`translateX(${slide}px)`, "--pull":`${pull}px` }}>
      <CastChip player={player} x={x} y={floor} className="rr-chip" hands={{ l:"rest", r:"rest" }} />
      {along.map(({ x: at, at: ms, i }) => <Dust key={i} className="rr-plough" at={ms} puffs={PLOUGH} spread={0.55 + i * 0.12}
        size={0.62 + i * 0.1} style={{ left:at, top:floor - 4 }} />)}
      <Dust className="rr-spray" at={RR.stop - 40} puffs={SPRAY} spread={0.9} size={0.85} style={{ left:bird - 40, top:floor - 4 }} />
      <span className="rr-node rr-bird" style={{ left:bird, top:floor }}>
        <span className="rr-node rr-bird-x">
          <span className="rr-node rr-lines is-in" style={{ left:110, top:-130 }}><SpeedLines length={520} /></span>
          <span className="rr-node rr-lines is-out" style={{ left:110, top:-130 }}><SpeedLines length={520} /></span>
          <span className="rr-node rr-bird-in"><span className="rr-node rr-bird-pop">
            <Swaps layers={poses.map(([pose, ms]) => [draw(pose), ms])} />
            {[0, 190].map(d => <span key={d} className="rr-node rr-beep" style={{ left:BEAK.x, top:BEAK.y, "--d":`${d}ms` }}>
              <Emanata rays={BEEP_RAYS} scale={1.1} /></span>)}
          </span></span>
        </span>
      </span>
      <Dust className="rr-cloud" at={RR.leave + 40} puffs={CLOUD} spread={1} size={1} style={{ left:x, top:floor - 10 }} />
      {[0, 1, 2].map(i => <Dust key={i} className="rr-kick" at={RR.windup + 200 + i * 110} puffs={KICK} spread={0.8} size={0.6}
        style={{ left:x + pull + 70, top:floor - 2 }} />)}
      <Dust className="rr-zip-dust" at={RR.zip} puffs={DUST_LOW} spread={0.5} size={0.6} style={{ left:x + pull, top:floor - 2 }} />
    </div>
  );
}
