import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Alarm } from "../neon/NeonProps.jsx";
import { TUBE, ellipsePath } from "../neon/neonArt.js";
import "./nap.css";

/* nap (idle, songless): the chip stands on the floor, nodding off; it
   nods once, twice, and keels over backwards flat on the floor, rattling
   down. It sleeps: breathing, Z's drifting up off it. A moth finds its
   light, circles it and lands on it. The chip twitches; the moth lifts
   off, circles, and lands again. It sleeps on.

   World x: the chip at 940. The moth lands on its face (it lies flat, so
   the face is a thin ellipse on the floor) a little right of its middle. */
export const NP_STAGE = Object.freeze({ x:940, floor:930, chip:240, perch:{ x:58, y:-44 } });

const W = TUBE.w;
/* a moth seen from above, its body upright: a wing a node per side so
   each flaps about the body */
const MOTH_BODY = "M0 -24C7 -24 8 -12 8 0C8 16 5 30 0 34C-5 30 -8 16 -8 0C-8 -12 -7 -24 0 -24Z";
const MOTH_HEAD = "M-4 -26C-10 -40 -20 -46 -28 -46M4 -26C10 -40 20 -46 28 -46";
const WING = "M6 -16C26 -40 62 -46 70 -26C76 -10 58 4 34 6C52 12 58 28 46 38C34 46 16 34 6 14Z";
const WING_SPOT = ellipsePath(46, -20, 7, 6);
function MothWing({ side }) {
  return <span className={`neon-node np-wing is-${side < 0 ? "l" : "r"}`}>
    <span className="neon-node" style={{ transform:side < 0 ? "scaleX(-1)" : undefined }}>
      <Neon box={[-4, -56, 90, 104]} fills={[{ d:WING }]} tubes={[
        { d:WING, tone:"bone", w:W * 0.5 },
        { d:WING_SPOT, tone:"amber", w:W * 0.4, g:"spot" },
      ]} />
    </span>
  </span>;
}
export function Moth({ scale = 0.8 }) {
  return <span className="neon-node" style={{ transform:`scale(${scale})` }}>
    <MothWing side={-1} />
    <MothWing side={1} />
    <Neon box={[-34, -54, 68, 96]} fills={[{ d:MOTH_BODY }]} tubes={[
      { d:MOTH_BODY, tone:"bone", w:W * 0.5 },
      { d:MOTH_HEAD, tone:"bone", w:W * 0.32 },
    ]} />
  </span>;
}

/* one Z, bent from a single tube */
const zPath = s => `M${-s} ${-s}L${s} ${-s}L${-s} ${s}L${s} ${s}`;

export function Nap({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, perch } = NP_STAGE;
  return (
    <div className="np">
      <NeonChip player={player} x={x} y={floor} className="np-chip"
        wear={<span className="neon-node np-startle"><Alarm r={chip / 2} /></span>} />
      {/* a first small z while it nods */}
      <span className="neon-node np-doze" style={{ left:x + 150, top:floor - chip - 10 }}>
        <Neon box={[-26, -26, 52, 52]} tubes={[{ d:zPath(14), tone:"cyan", w:W * 0.55 }]} />
      </span>
      {/* the Z's rise off it, one after another, while it sleeps */}
      <span className="neon-node np-zees" style={{ left:x + 70, top:floor - 70 }}>
        {[[0, 16], [1, 24], [2, 32]].map(([i, s]) => <span key={i} className={`neon-node np-z is-${i}`}>
          <Neon box={[-s - 12, -s - 12, s * 2 + 24, s * 2 + 24]} tubes={[{ d:zPath(s), tone:"cyan", w:W * 0.62 }]} />
        </span>)}
      </span>
      {/* the moth: one path through the night to its perch on the chip */}
      <span className="neon-node np-moth" style={{ left:x + perch.x, top:floor + perch.y }}>
        <span className="neon-node np-moth-fly">
          <span className="neon-node np-moth-bank">
            <span className="neon-node np-moth-art is-fly"><span className="neon-node np-moth-fx"><Moth scale={0.72} /></span></span>
            <span className="neon-node np-moth-art is-rest"><Moth scale={0.62} /></span>
          </span>
        </span>
      </span>
    </div>
  );
}
