import React from "react";
import { HouseHand, Neon, NeonChip, Swaps } from "../neon/Neon.jsx";
import { TUBE, circlePath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./losttourist.css";

const LT = bitById("losttourist").beats;

/* losttourist (idle, songless): a chip wanders in and stops under a
   Vegas arrow sign on a post, chaser bulbs running round it. It looks
   up: the arrow points right. It rolls off right. The arrow cuts to
   left; it stops, looks back, and rolls back left. The arrow cuts to
   right again. It stops, looks one way and the other, wobbling, a
   question mark lit in its own color over it. The house hand reaches in
   from the right and points: that way. It rolls off, back the way it
   came. A beat later the arrow cuts to left.

   World x: the post at 1060, the arrow lit at y 520 above it; the chip
   stops at 820, rolls to 1300, back to 760, and off past 120. The hand
   is drawn mirrored (it comes in from the right, pointing left). */
export const LT_STAGE = Object.freeze({ x:820, floor:930, chip:240, post:1060, sign:520 });

const W = TUBE.w;
/* the arrow, pointing right, about its middle; `dir` -1 mirrors it */
const arrowPath = dir => {
  const p = (x, y) => `${x * dir} ${y}`;
  return `M${p(-118, -30)}L${p(36, -30)}L${p(36, -62)}L${p(120, 0)}L${p(36, 62)}L${p(36, 30)}L${p(-118, 30)}Z`;
};
/* chaser bulbs round it, in three groups that take turns */
const BULBS = [[-100, -46], [-60, -46], [-20, -46], [20, -46], [54, -82], [92, -48], [138, 0], [92, 48], [54, 82], [20, 46], [-20, 46],
  [-60, 46], [-100, 46], [-136, 0]];
function Arrow({ dir }) {
  const groups = [0, 1, 2].map(g => BULBS.filter((_, i) => i % 3 === g)
    .map(([x, y]) => circlePath(x * dir, y, 5.5)).join(""));
  return <Neon box={[-160, -100, 320, 200]} fills={[{ d:arrowPath(dir) }]} tubes={[
    { d:arrowPath(dir), tone:"cyan", w:W * 0.9 },
    { d:`M${-84 * dir} 0L${44 * dir} 0`, tone:"cyan", w:W * 0.42 },
    ...groups.map((d, g) => ({ d, tone:"amber", w:W * 0.5, g:`bulb${g}` })),
  ]} />;
}
/* the question mark, bent from one tube, and its dot */
const QUESTION = "M-26 -40C-26 -74 26 -80 28 -44C30 -18 0 -14 0 14L0 24";
function Question() {
  return <Neon box={[-44, -96, 88, 160]} tubes={[
    { d:QUESTION, tone:"player", w:W * 0.8 },
    { d:circlePath(0, 46, 5), tone:"player", w:W * 0.8 },
  ]} />;
}

export function LostTourist({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, post, sign } = LT_STAGE;
  /* the hand, mirrored: its wrist at world (1000, 652), under the sign,
     pointing left and a touch down, its finger out over the chip's head */
  const wrist = { x:1000, y:652 };
  return (
    <div className="lt">
      {/* the post and its foot */}
      <span className="neon-node lt-post">
        <Neon box={[post - 40, sign + 40, 80, floor - sign - 30]} fills={[{ d:`M${post - 7} ${sign + 58}L${post + 7} ${sign + 58}L${post + 7} ${floor}L${post - 7} ${floor}Z` }]}
          tubes={[{ d:`M${post - 7} ${floor}L${post - 7} ${sign + 58}L${post + 7} ${sign + 58}L${post + 7} ${floor}`, tone:"bone", w:W * 0.5 },
            { d:`M${post - 30} ${floor}L${post + 30} ${floor}`, tone:"bone", w:W * 0.5 }]} />
      </span>
      {/* the sign, its frames cut in on the clock; it swings on each cut */}
      <span className="neon-node lt-sign" style={{ left:post, top:sign + 58 }}>
        <span className="neon-node lt-sign-swing">
          <span className="neon-node lt-sign-face" style={{ top:-58 }}>
            <Swaps layers={[[<Arrow dir={1} />, 0], [<Arrow dir={-1} />, LT.flip1], [<Arrow dir={1} />, LT.flip2], [<Arrow dir={-1} />, LT.flip3]]} />
          </span>
        </span>
      </span>
      <NeonChip player={player} x={x} y={floor} className="lt-chip"
        wear={<span className="neon-node lt-q" style={{ top:-chip / 2 - 110 }}><span className="neon-node lt-q-rock"><Question /></span></span>} />
      <span className="neon-node lt-mirror">
        <HouseHand className="lt-hand" x={-wrist.x} y={wrist.y} angle={6} scale={1.25} poses="point" />
      </span>
    </div>
  );
}
