import React from "react";
import { NeonChip } from "../neon/Neon.jsx";
import { Alarm, Burst, DizzyStars, NeonAnvil, SweatDrop, Target } from "../neon/NeonProps.jsx";
import "./anvil.css";

/* anvil (loss, songless): the chip gives a happy little hop. A ring lights
   on the floor under it and grows to a falling whistle. It tips back to
   look up (alarm ticks, a sweat drop). CLANG: a neon anvil, and the chip
   is a pancake under it, stars going round. The anvil hops off into the
   dirt; the chip boings back up, dazed, wobbles, turns to the room for a
   beat, and keels over backwards flat on the floor, rattling down like a
   dropped coin.

   World x: the chip at 960; the anvil lands on its head, then on the
   pancake, and hops off to 1290. The registry's camera shoots it. */
export const AN_STAGE = Object.freeze({ x:960, floor:930, chip:240, off:330 });
/* the pancake: as wide as it goes and nearly no height */
export const PANCAKE = Object.freeze({ x:1.55, y:0.17 });

const px = n => `${Math.round(n * 10) / 10}px`;

export function Anvil({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, off } = AN_STAGE;
  const head = floor - chip;
  const flat = floor - chip * PANCAKE.y;
  /* the hop off runs from the pancake's top to the floor beside it */
  const style = { "--an-sink":`translateY(${px(flat - head)})`, "--an-off":`translate(${px(off)}, ${px(floor - flat)})`,
    "--an-lift":`translate(${px(off * 0.45)}, ${px(-150)})`, "--an-squash":`scale(${PANCAKE.x}, ${PANCAKE.y})` };
  return (
    <div className="an" style={style}>
      <span className="neon-node an-target" style={{ left:x, top:floor }}><Target rx={170} ry={28} /></span>
      <NeonChip player={player} x={x} y={floor} className="an-chip"
        wear={<>
          <span className="neon-node an-alarm"><Alarm r={chip / 2} /></span>
          <span className="neon-node an-sweat" style={{ left:chip * 0.36, top:-chip * 0.5 }}><SweatDrop scale={1.1} /></span>
        </>} />
      <span className="neon-node an-burst" style={{ left:x, top:flat - 10 }}><Burst n={12} r0={150} r1={250} tone="bone" /></span>
      <span className="neon-node an-stars" style={{ left:x, top:flat - 50 }}><DizzyStars count={3} rx={150} ry={26} r={24} /></span>
      <span className="neon-node an-anvil" style={{ left:x, top:head }}>
        <span className="neon-node an-anvil-hop"><span className="neon-node an-anvil-rock"><NeonAnvil scale={1.05} /></span></span>
      </span>
    </div>
  );
}
