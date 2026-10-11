import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, GloveArt, Swaps } from "../cast/CastChip.jsx";
import { ChipFace } from "../../identity/PlayerIdentity.jsx";
import { DUST_LOW, Dust, SweatDrop } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./pushups.css";

/* pushups (idle, slapstick): push-ups to the room. Its gloves are planted
   wide on the floor in front of it and the chip is held up between them;
   it dips down toward the floor, tipping toward us, and pushes back up.
   Again, slower. The third comes up shaking, sweat flying. The fourth goes
   down, tries, gets nowhere, and it goes flat on its face in the dirt, the
   gloves sliding out. It stays there. One glove comes up a little: a
   thumbs up, a weak one.

   The chip is the rig without its shoes (its feet are out behind it),
   held a little off the floor and tipped about its middle; the scene
   plants its own gloves so they stay put while the chip goes up and down
   between them. The stage's camera shoots it (the registry's camera, in
   this stage's world x: the chip at 960). */
const PU = bitById("pushups").beats;
export const PU_STAGE = Object.freeze({ x:960, floor:CAST.floor, spread:168 });

export function Pushups({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, spread } = PU_STAGE;
  const g = castGeometry(CAST.size, { shoes:false });
  /* a planted glove: the hanging pose, its fingertips on the floor just in front */
  const wristY = floor + 22 - 79 * g.glove;
  const glove = pose => <GloveArt pose={pose} scale={g.glove} />;
  const mirrored = node => <span className="pu-node" style={{ transform:"scaleX(-1)" }}>{node}</span>;
  return (
    <div className="pu" style={{ "--mid":`${-g.size / 2}px` }}>
      {/* face down, what shows is its back: the chip without the photo */}
      <CastChip player={player} x={x} y={floor} shoes={false} className="pu-chip" hands={{ l:"rest", r:"rest" }}
        wear={<span className="pu-back"><ChipFace p={player} size={g.size} flat stamp="" /></span>} />
      {/* the gloves: each takes the weight (pressed flatter on the floor at
         the bottom of each one), shakes, slides out; the near one's thumb */}
      <span className="pu-node pu-hand is-l" style={{ left:x - spread, top:wristY, "--tips":`${Math.round(79 * g.glove)}px` }}>
        <span className="pu-node pu-hand-slide"><span className="pu-node pu-hand-press"><span className="pu-node pu-hand-shake">
          {mirrored(glove("rest"))}
        </span></span></span>
      </span>
      <span className="pu-node pu-hand is-r" style={{ left:x + spread, top:wristY, "--tips":`${Math.round(79 * g.glove)}px` }}>
        <span className="pu-node pu-hand-slide"><span className="pu-node pu-hand-thumb"><span className="pu-node pu-hand-press">
          <span className="pu-node pu-hand-shake"><Swaps layers={[[glove("rest"), 0], [glove("thumb"), PU.thumb]]} /></span>
        </span></span></span>
      </span>
      {/* sweat flicked off the third one */}
      {[[-1, 0], [1, 110]].map(([side, d]) => (
        <span key={side} className="pu-node pu-sweat" style={{ left:x + side * 96, top:floor - 200, "--side":side, "--d":`${d}ms` }}>
          <SweatDrop scale={0.95} />
        </span>
      ))}
      {/* face down in the dirt */}
      <Dust className="pu-dust" at={PU.flat} puffs={DUST_LOW} spread={0.8} size={0.8} style={{ left:x, top:floor - 2 }} />
    </div>
  );
}
