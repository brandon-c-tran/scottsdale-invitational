import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, GloveArt } from "../cast/CastChip.jsx";
import { BROOM, Broom, Dust, FloorShadow, SandPile, SpeedLines, Tumbleweed } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./sweep.css";

/* sweep (idle, desert): the chip sweeps the desert floor with a straw
   broom, four strokes, each pushing dust into a neat little heap that
   grows; it pats the heap tidy with the broom and leans back to look at
   it. The wind gets up: a gust takes the heap back across the floor the
   way it came, a tumbleweed bowling through with it. It stares at the
   empty spot. Then it starts sweeping again.

   The broom and both gloves on it are one node (the scene's own gloves,
   in the rig's art, the rig's hidden), so a stroke moves them together
   along the floor. The stage's camera shoots it (the registry's camera,
   in this stage's world x: the chip at 800, the heap at 1140). */
const SW = bitById("sweep").beats;
export const SW_STAGE = Object.freeze({ x:800, pile:1140, floor:CAST.floor });
/* the broom: held at its top in front of the chip, leaning out to the
   right so its straw sweeps the floor short of the heap */
const LEAN = -40;
const BROOM_SCALE = 0.86;

/* the gust's dust: the heap streamed back across the floor to the left */
const BLOWN = Object.freeze([[-620, -30, 1.2], [-500, -80, 1], [-400, -20, 1.15], [-300, -60, 0.95], [-720, -12, 1.05], [-200, -30, 0.9],
  [-560, -110, 0.8], [-120, -70, 0.75]]);
/* a stroke's dust, pushed on ahead of the straw */
const PUSHED = Object.freeze([[60, -16, 0.6], [100, -30, 0.5], [30, -26, 0.45]]);

export function Sweep({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, pile, floor } = SW_STAGE;
  const g = castGeometry(CAST.size);
  /* the top of the handle, where the upper glove holds it; the broom from
     there along its lean; where the lower glove holds it; the straw's tip */
  const rad = LEAN * Math.PI / 180;
  const along = d => ({ x:-Math.sin(rad) * d, y:Math.cos(rad) * d });
  const tip = along(BROOM.foot * BROOM_SCALE);
  const grip = { x:x + 70, y:floor - tip.y };
  const lower = along(BROOM.lower * BROOM_SCALE);
  /* a fist round the handle: the fist (side on, cuff toward the chip)
     turned with the broom, its middle on the handle (38 art px out from
     the wrist) */
  const fist = (key, at) => (
    <span key={key} className={`sw-node sw-fist is-${key}`} style={{ left:at.x, top:at.y, transform:`rotate(${LEAN}deg)` }}>
      <span className="sw-node" style={{ left:-38 * g.glove, top:0 }}><GloveArt pose="fist" scale={g.glove} /></span>
    </span>
  );
  return (
    <div className="sw">
      <span className="sw-node sw-pile" style={{ left:pile, top:floor }}><span className="sw-node sw-pile-in"><SandPile scale={1.25} /></span></span>
      <CastChip player={player} x={x} y={floor} facing={1} className="sw-chip" hands={{ l:"rest", r:"rest" }} />
      {/* the broom and the gloves on it, sweeping together */}
      <span className="sw-node sw-broom" style={{ left:grip.x, top:grip.y }}>
        <span className="sw-node sw-stroke"><span className="sw-node sw-pat">
          <span className="sw-node" style={{ transform:`rotate(${LEAN}deg)` }}><Broom scale={BROOM_SCALE} /></span>
          {fist("top", { x:0, y:0 })}
          {fist("low", lower)}
        </span></span>
      </span>
      {/* each stroke's dust, pushed on toward the heap */}
      {[SW.stroke1, SW.stroke2, SW.stroke3, SW.stroke4, SW.again, SW.again2].map((at, i) => (
        <Dust key={i} className="sw-push" at={at + 60} puffs={PUSHED} spread={1} size={0.7} style={{ left:grip.x + tip.x - 10, top:floor - 6 }} />
      ))}
      {/* the gust: the heap streamed away, the wind's lines, the tumbleweed */}
      <Dust className="sw-blown" at={SW.gust + 40} puffs={BLOWN} spread={1} size={1} style={{ left:pile, top:floor - 10 }} />
      {[[-170, 0], [-90, 120], [-20, 60]].map(([y, d], i) => (
        <span key={i} className="sw-node sw-wind" style={{ left:1800, top:floor + y, "--d":`${d}ms` }}><SpeedLines length={520} rows={[[0, 1], [26, 0.6]]} /></span>
      ))}
      <span className="sw-node sw-weed" style={{ left:1960, top:floor - 44 }}>
        <span className="sw-node sw-weed-shadow" style={{ top:44 }}><FloorShadow w={92} h={16} /></span>
        <span className="sw-node sw-weed-hop"><span className="sw-node sw-weed-spin"><Tumbleweed scale={0.8} /></span></span>
      </span>
    </div>
  );
}
