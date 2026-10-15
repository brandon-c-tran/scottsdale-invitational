import React from "react";
import { HouseHand, Neon, NeonChip } from "../neon/Neon.jsx";
import { Alarm, Burst } from "../neon/NeonProps.jsx";
import { TUBE, ellipsePath } from "../neon/neonArt.js";
import "./rake.css";

const W = TUBE.w;

/* rake (loss, songless): the casino's revenge. The chip sits on its bet
   spot on the felt. The house hand reaches in with a croupier's rake and
   sets it behind the chip like a losing bet. It pushes; the chip digs in,
   leaning back into the rake, and slides anyway, all the way to the edge
   of the table, where it teeters on the rim. One little nudge and it goes
   over, out of the bottom of the frame. The rake taps the felt twice.

   World x: the chip on its spot at 1020, the table's edge at 1300 (past
   it, the dark). The hand points right (angle 0), so its reach is a
   straight push along the felt; the rake hangs from its fist (the grip
   pose's hold, at (600, 754)), its blade standing on the felt at 894. */
export const RK_STAGE = Object.freeze({ chip:1020, edge:1300, floor:930, size:240, wrist:{ x:444, y:744 }, scale:1.3 });

/* the felt's own green lamp (rake.css --rk-felt): the table, not a job */
const FELT = "var(--rk-felt)";
/* the rake in world px, from the fist: the stick runs down to the felt,
   its blade a bar standing on it */
const STICK = "M-70 -30L294 118";
const BLADE = "M294 96L294 176L274 176";

export function Rake({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { chip, edge, floor, size, wrist, scale } = RK_STAGE;
  const r = size / 2;
  const k = Math.round(1000 / scale) / 1000;
  /* how far the hand pushes, in the hand's own units (its scale) */
  const push = n => `translateX(${Math.round(n / scale * 10) / 10}px)`;
  const style = { "--rk-dig":push(40), "--rk-slide":push(edge - 6 - chip), "--rk-back":push(edge - 6 - chip - 36),
    "--rk-nudge":push(edge - 6 - chip + 34), "--rk-c-dig":"translateX(40px)", "--rk-c-edge":`translateX(${edge - 6 - chip}px)` };
  const rake = (
    <span className="neon-node" style={{ transform:`scale(${k})` }}>
      <Neon box={[-90, -50, 400, 240]} tubes={[{ d:STICK, tone:"amber", w:W * 0.7 }, { d:BLADE, tone:"amber", w:W * 0.85 }]} />
    </span>
  );
  return (
    <div className="rk" style={style}>
      {/* the table: dark under the felt and past its edge, the felt's line,
          the rail under it, the edge going down into the dark */}
      <span className="neon-node" style={{ left:0, top:0 }}>
        <Neon box={[-600, 900, 3200, 600]} fills={[{ d:`M-600 ${floor - 2}L3200 ${floor - 2}L3200 1500L-600 1500Z` }]} tubes={[
          { d:`M-600 ${floor}L${edge - 30} ${floor}C${edge - 12} ${floor} ${edge} ${floor + 10} ${edge} ${floor + 30}L${edge} 1400`, tone:FELT, w:W * 0.8 },
          { d:`M-600 ${floor + 40}L${edge - 16} ${floor + 40}`, tone:"amber", w:W * 0.4 },
        ]} />
      </span>
      {/* the bet spot it sits on */}
      <span className="neon-node" style={{ left:chip, top:floor }}>
        <Neon box={[-180, -40, 360, 80]} tubes={[{ d:ellipsePath(0, 0, 150, 22), tone:"amber", w:W * 0.5 },
          { d:ellipsePath(0, 0, 118, 15), tone:"amber", w:W * 0.3 }]} />
      </span>
      <NeonChip player={player} x={chip} y={floor} className="rk-chip"
        wear={<span className="neon-node rk-alarm"><Alarm r={r} /></span>} />
      <span className="neon-node rk-scuff" style={{ left:chip - r - 20, top:floor - 30 }}><Burst n={6} r0={14} r1={40} tone="bone" /></span>
      <HouseHand className="rk-hand" x={wrist.x} y={wrist.y} angle={0} scale={scale} poses="grip" hold={{ grip:rake }} />
    </div>
  );
}
