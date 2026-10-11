import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, GloveArt } from "../cast/CastChip.jsx";
import { Boulder, DUST_LOW, Dust, Emanata, FoldedMap, MAP_SHEET, PaperBall, PaperMap, Roadrunner, SpeedLines } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./map.css";

/* map (idle, desert): lost. The chip unfolds a road map, panel by panel,
   till it is wider than the chip itself, and peers over the top of it.
   The map is upside down. It turns it (sideways: now it can see nothing
   at all), turns it again: right way up. A roadrunner goes by along the
   horizon. The chip watches it go, crumples the map into a ball and
   flicks it away; it comes back off a rock and bonks it on the head,
   and drops at its feet. It looks down at it.

   The map and the gloves holding its corners are one node that turns
   (the scene's gloves, in the rig's art; the rig's own come back once the
   map is a ball). The stage's camera shoots it (the registry's camera,
   in this stage's world x: the chip at 900, the rock at 1360). */
const MP = bitById("map").beats;
export const MP_STAGE = Object.freeze({ x:900, rock:1360, floor:CAST.floor, sheet:0.76 });

const px = n => `${Math.round(n * 10) / 10}px`;

export function MapBit({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, rock, floor, sheet } = MP_STAGE;
  const g = castGeometry(CAST.size);
  const w = MAP_SHEET.w * sheet, h = MAP_SHEET.h * sheet;
  /* held in front, its top edge a little over the middle of the chip, so the
     top of its face shows over it */
  const center = { x, y:floor + g.center.y - 14 + h / 2 };
  const style = { "--half":px(w / 2), "--hh":px(h / 2) };
  const glove = <GloveArt pose="grip" scale={g.glove} />;
  return (
    <div className="mp" style={style}>
      {/* the roadrunner, far off along the horizon */}
      <span className="mp-node mp-runner" style={{ left:1700, top:floor - 66 }}>
        <span className="mp-node" style={{ left:60, top:-40 }}><SpeedLines length={360} rows={[[-14, 1], [0, 0.7], [14, 0.85]]} /></span>
        <Roadrunner pose="run" scale={0.5} />
      </span>
      <Dust className="mp-runner-dust" at={MP.runner + 120} puffs={DUST_LOW} spread={0.35} size={0.45} style={{ left:980, top:floor - 66 }} />
      <span className="mp-node" style={{ left:rock, top:floor }}><Boulder scale={1.05} /></span>
      <CastChip player={player} x={x} y={floor} className="mp-chip" hands={{ l:"rest", r:"rest" }} />
      {/* the map, turning in its gloves */}
      <span className="mp-node mp-map" style={{ left:center.x, top:center.y }}>
        <span className="mp-node mp-crumple">
          <span className="mp-node mp-packet"><FoldedMap scale={sheet} /></span>
          <span className="mp-node mp-sheet-at" style={{ top:-h / 2 }}>
            <span className="mp-node mp-sheet"><span className="mp-node" style={{ top:h / 2 }}><PaperMap scale={sheet} /></span></span>
          </span>
          {/* the gloves on its top corners, fists round the edge */}
          {[-1, 1].map(side => (
            <span key={side} className="mp-node mp-glove" style={{ top:-h / 2 + 6, "--side":side }}>
              <span className="mp-node" style={{ transform:`${side < 0 ? "scaleX(-1) " : ""}rotate(-90deg)`, left:0, top:0 }}>
                <span className="mp-node" style={{ left:-38 * g.glove, top:0 }}>{glove}</span>
              </span>
            </span>
          ))}
        </span>
      </span>
      {/* the ball: crumpled in its gloves, flicked off the rock and back */}
      <span className="mp-node mp-ball" style={{ left:center.x, top:center.y }}>
        <span className="mp-node mp-ball-spin"><PaperBall scale={1.1} /></span>
      </span>
      <span className="mp-node mp-bonk" style={{ left:x, top:floor + g.top - 40 }}>
        <Emanata rays={[[-150, 34, 70], [-110, 32, 72], [-70, 34, 70], [-30, 32, 66], [-200, 32, 64]]} width={8} />
      </span>
    </div>
  );
}
