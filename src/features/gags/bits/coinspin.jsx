import React from "react";
import { NeonChip } from "../neon/Neon.jsx";
import { Spark } from "../neon/NeonProps.jsx";
import "./coinspin.css";

/* coinspin (idle, songless; two chips): a coin spin contest. Two chips
   side by side size each other up, wind up, and set themselves spinning
   on their edges at the same instant, sparks off their rims where they
   touch the floor. The first wobbles, slows, wobbles wider and goes down
   flat, rattling out. The other spins on, smug, giving a couple of
   little hops; then it slows too, stops square to the room, takes a bow,
   and the bow tips it over flat on its face.

   World x: A at 760, B at 1160. */
export const CS_STAGE = Object.freeze({ a:760, b:1160, floor:930, chip:240, drift:-70 });

const anchors = () => {
  const { a, b, chip, drift } = CS_STAGE;
  return { a, b:b + drift, mid:Math.round((a + b) / 2), minX:a - chip * 0.75, maxX:b + chip * 0.75 };
};

function Spinner({ player, x, floor, side }) {
  return (
    <NeonChip player={player} x={x} y={floor} className={`cs-chip is-${side}`}>
      {/* sparks thrown off the rim where it grinds on the floor */}
      <span className="neon-node cs-sparks">
        <span className="neon-node cs-spark is-l" style={{ left:-34, top:-14 }}><Spark scale={0.62} tone="amber" /></span>
        <span className="neon-node cs-spark is-r" style={{ left:34, top:-10 }}><Spark scale={0.5} tone="bone" /></span>
      </span>
    </NeonChip>
  );
}

export function CoinSpin({ cast }) {
  const a = cast?.a?.[0], b = cast?.a?.[1];
  if (!a || !b) return null;
  const { a:ax, b:bx, floor } = CS_STAGE;
  return (
    <div className="cs">
      <Spinner player={a} x={ax} floor={floor} side="a" />
      <Spinner player={b} x={bx} floor={floor} side="b" />
    </div>
  );
}
CoinSpin.anchors = anchors;
