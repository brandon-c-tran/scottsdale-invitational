import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Alarm, Burst, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE, arcPath, circlePath, ellipsePath } from "../neon/neonArt.js";
import "./quicksand.css";

const W = TUBE.w;

/* quicksand (loss, songless): the chip stands on a patch of neon sand,
   its swirl turning slowly. It sinks a little; it looks down. It wiggles,
   it hops in place trying to get out (no hands, so it can't), going down
   a bit more with every landing, ripples running out each time. Sunk to
   its rim, it tips back to look at the sky; one last little hop; gone.
   A beat. One bubble comes up and pops.

   World x: the chip and the patch at 960. Everything of the chip below
   the sand's surface (the floor, y 930) is cut away by a clip, and the
   patch's front lip is drawn over it. */
export const QS_STAGE = Object.freeze({ x:960, floor:930, chip:240, rx:310, ry:48 });

const r1 = n => Math.round(n * 10) / 10;
/* the swirl: a spiral out from the middle, drawn round, flattened onto
   the floor by its node */
function spiral(turns = 3.2, r0 = 10, rMax = 270, steps = 140) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = t * turns * Math.PI * 2, rr = r0 + (rMax - r0) * t;
    pts.push(`${r1(Math.cos(a) * rr)} ${r1(Math.sin(a) * rr)}`);
  }
  return `M${pts.join("L")}`;
}
const SWIRL = spiral();
/* grains on the sand, flattened with it */
const GRAINS = [[-200, 40], [-120, -150], [60, 190], [190, -90], [230, 110], [-240, -60], [120, -210], [-60, 230], [20, -240], [-180, 160]]
  .map(([x, y]) => `M${x - 4} ${y}L${x + 4} ${y}`).join("");

export function Quicksand({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, rx, ry } = QS_STAGE;
  const r = chip / 2;
  const flat = ry / rx;
  return (
    <div className="qs">
      {/* the patch: its back rim, the swirl turning in it */}
      <span className="neon-node" style={{ left:x, top:floor }}>
        <Neon box={[-rx - 20, -ry - 20, rx * 2 + 40, ry * 2 + 40]} fills={[{ d:ellipsePath(0, 0, rx, ry) }]}
          tubes={[{ d:`M${-rx} 0A${rx} ${ry} 0 0 1 ${rx} 0`, tone:"ember", w:W * 0.75 }]} />
        <span className="neon-node" style={{ transform:`scaleY(${r1(flat * 1000) / 1000})` }}>
          <span className="neon-node qs-swirl">
            <Neon box={[-300, -300, 600, 600]} tubes={[{ d:SWIRL, tone:"amber", w:W * 0.42 }, { d:GRAINS, tone:"ember", w:W * 0.6 }]} />
          </span>
        </span>
      </span>
      {/* the ripples each landing sends out */}
      {["settle", "h1", "h2", "h3", "gone"].map(k =>
        <span key={k} className={`neon-node qs-ripple is-${k}`} style={{ left:x, top:floor }}>
          <Neon box={[-rx, -ry, rx * 2, ry * 2]} tubes={[{ d:ellipsePath(0, 0, rx * 0.62, ry * 0.62), tone:"amber", w:W * 0.5 }]} />
        </span>)}
      {/* the chip, cut off at the sand's surface */}
      <div className="qs-clip" style={{ height:floor }}>
        <NeonChip player={player} x={x} y={floor} pool={false} className="qs-chip"
          wear={<>
            <span className="neon-node qs-alarm"><Alarm r={r} /></span>
            <span className="neon-node qs-sweat" style={{ left:-r * 0.7, top:-r * 0.55 }}><SweatDrop scale={1} /></span>
          </>} />
      </div>
      {/* the patch's front lip, over the chip */}
      <span className="neon-node" style={{ left:x, top:floor }}>
        <Neon box={[-rx - 20, -ry - 20, rx * 2 + 40, ry * 2 + 40]}
          tubes={[{ d:`M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0`, tone:"ember", w:W * 0.75 }]} />
      </span>
      {/* one bubble, and its pop */}
      <span className="neon-node qs-bubble" style={{ left:x + 40, top:floor - 6 }}>
        <span className="neon-node qs-bubble-up">
          <Neon box={[-44, -44, 88, 88]} tubes={[{ d:circlePath(0, 0, 28), tone:"bone", w:W * 0.55 },
            { d:arcPath(0, 0, 17, 200, 255), tone:"bone", w:W * 0.4 }]} />
        </span>
      </span>
      <span className="neon-node qs-pop" style={{ left:x + 40, top:floor - 66 }}><Burst n={8} r0={22} r1={56} tone="bone" /></span>
    </div>
  );
}
