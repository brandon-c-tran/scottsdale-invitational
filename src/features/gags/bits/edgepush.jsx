import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE, circlePath } from "../neon/neonArt.js";
import "./edgepush.css";

/* edgepush (idle, songless; two chips): a sumo push. Two chips square up
   across the floor, each stamps once, they crouch and charge, and meet
   rim to rim with a spark. They lean into each other, trembling, sweat
   flying, the contact point sliding one way, then the other, then back
   to the middle. Then, at the same instant, both turn from each other to
   the room, and hold there, still locked, still shaking.

   World x: A's feet at 845, B's at 1075, the contact at 960; they start
   160 out each way and the push slides the whole lock up to 80 either
   way. While they push each faces the other (turned on its edge), and the
   turn to the room squares both up, shouldering each other apart a little. */
export const EP_STAGE = Object.freeze({ a:845, b:1075, floor:930, chip:240, out:160, push:80 });

const W = TUBE.w;
/* a stamp's dust: two puffs kicked out either side of the feet. Anchor: the feet. */
const DUST = [[-46, -14, 13], [-68, -28, 9], [-30, -30, 7], [46, -14, 13], [68, -28, 9], [30, -30, 7]].map(([x, y, r]) => circlePath(x, y, r)).join("");
const Dust = ({ className = "" }) => <span className={`neon-node ${className}`}>
  <Neon box={[-82, -56, 164, 64]} tubes={[{ d:DUST, tone:"bone", w:W * 0.45 }]} />
</span>;

const anchors = () => {
  const { a, b, out, push, chip } = EP_STAGE;
  const minX = a - out - chip * 0.6, maxX = b + out + chip * 0.6;
  return { a, b, mid:Math.round((a + b) / 2), minX:Math.min(minX, a - push - chip), maxX:Math.max(maxX, b + push + chip) };
};

function Pusher({ player, x, side, floor, chip }) {
  /* side -1 is A (on the left, pushing right), 1 is B */
  const r = chip / 2;
  return (
    <NeonChip player={player} x={x} y={floor} className={`ep-chip is-${side < 0 ? "a" : "b"}`}>
      <Dust className="ep-dust is-stamp" />
      <Dust className="ep-dust is-skid" />
      {[0, 1, 2].map(i => <span key={i} className={`neon-node ep-sweat is-${i}`} style={{ left:side * r * 0.62, top:-chip * 0.92 }}>
        <SweatDrop scale={0.9} /></span>)}
    </NeonChip>
  );
}

export function EdgePush({ cast }) {
  const a = cast?.a?.[0], b = cast?.a?.[1];
  if (!a || !b) return null;
  const { a:ax, b:bx, floor, chip } = EP_STAGE;
  const mid = (ax + bx) / 2;
  return (
    <div className="ep">
      <Pusher player={a} x={ax} side={-1} floor={floor} chip={chip} />
      <Pusher player={b} x={bx} side={1} floor={floor} chip={chip} />
      {/* where they meet: sparks while they grind, riding the push */}
      <span className="neon-node ep-contact" style={{ left:mid, top:floor - chip * 0.48 }}>
        <span className="neon-node ep-slide">
          <span className="neon-node ep-clash"><Burst n={10} r0={26} r1={92} tone="amber" /></span>
          <span className="neon-node ep-grind"><Burst n={6} r0={18} r1={50} tone="amber" turn={15} /></span>
        </span>
      </span>
    </div>
  );
}
EdgePush.anchors = anchors;
