import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst } from "../neon/NeonProps.jsx";
import { TUBE, arcPath, circlePath, ellipsePath } from "../neon/neonArt.js";
import "./victoryspin.css";

/* victoryspin (win, punchline): the chip winds up, twisting back on its
   edge, and lets go: it spins on its edge, faster and faster, sparks
   starting to spray from where it touches the floor and a ring scorching
   into it. At full speed (the song comes in here) it is a blur, a lit
   orb lifted off the floor, throwing a shower of sparks both ways. Then
   it stops dead, facing the room, drops onto the scorched ring and leans
   back, pleased with itself.

   World x: the chip at 960. */
export const VS_STAGE = Object.freeze({ x:960, floor:930, chip:240 });
/* the sparks: [end dx, peak dy, delay ms, lamp], the first four from the
   first sparks, the rest at full speed */
const SPARKS = Object.freeze([
  [-200, -90, 0, "amber"], [190, -110, 120, "ember"], [-150, -150, 240, "ember"], [240, -70, 330, "amber"],
  [-320, -190, 0, "amber"], [330, -210, 60, "amber"], [-260, -260, 140, "ember"], [280, -150, 200, "ember"],
  [-380, -120, 260, "bone"], [400, -170, 90, "bone"], [-120, -230, 310, "amber"], [150, -280, 180, "amber"],
]);

const r1 = n => Math.round(n * 10) / 10;

/* the blur: the coin spinning faster than the eye, a lit orb with its
   meridians. Anchor: the chip's middle. */
function Orb({ r }) {
  return <Neon box={[-r - 40, -r - 40, r * 2 + 80, r * 2 + 80]} tubes={[
    { d:circlePath(0, 0, r - 4), tone:"player", w:TUBE.w * 0.8 },
    { d:ellipsePath(0, 0, r * 0.62, r - 6), tone:"player", w:TUBE.thin, g:"m1" },
    { d:ellipsePath(0, 0, r * 0.24, r - 8), tone:"player", w:TUBE.thin, g:"m2" },
    { d:`${arcPath(0, 0, r + 26, 150, 210)}${arcPath(0, 0, r + 26, -30, 30)}`, tone:"bone", w:TUBE.thin, g:"whirl" },
  ]} />;
}
/* one spark: a short streak. Anchor: its tail. */
function SparkLine({ tone }) {
  return <Neon box={[-12, -12, 64, 24]} tubes={[{ d:"M0 0L38 0", tone, w:TUBE.thin }]} />;
}
/* the ring it burns into the floor */
function Scorch() {
  return <Neon box={[-160, -34, 320, 68]} tubes={[{ d:ellipsePath(0, 0, 130, 18), tone:"ember", w:TUBE.thin },
    { d:ellipsePath(0, 0, 76, 10), tone:"clay", w:TUBE.fine }]} />;
}

export function Victoryspin({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip } = VS_STAGE;
  const r = chip / 2;
  return (
    <div className="vsp">
      <span className="neon-node vsp-scorch" style={{ left:x, top:floor + 4 }}><Scorch /></span>
      <NeonChip player={player} x={x} y={floor} className="vsp-chip">
        <span className="neon-node vsp-orb" style={{ top:-r }}><Orb r={r} /></span>
      </NeonChip>
      <span className="neon-node vsp-flash" style={{ left:x, top:floor - r - 26 }}><Burst n={14} r0={150} r1={224} tone="amber" /></span>
      {SPARKS.map(([dx, dy, d, tone], i) => {
        const deg = Math.atan2(dy, dx) * 180 / Math.PI;
        return <span key={i} className={`neon-node vsp-spark${i < 4 ? " is-early" : ""}`}
          style={{ left:x, top:floor - 4, "--dx":`${dx}px`, "--dy":`${dy}px`, "--d":`${d}ms`, "--a":`${r1(deg)}deg` }}>
          <span className="neon-node vsp-spark-turn"><SparkLine tone={tone} /></span>
        </span>;
      })}
    </div>
  );
}
