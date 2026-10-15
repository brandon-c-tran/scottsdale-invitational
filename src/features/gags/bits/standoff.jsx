import React from "react";
import { HouseHand, NeonChip, useNeonColor } from "../neon/Neon.jsx";
import { Burst, LooseChip, NeonStack, SpeedLines, Spark, Tumbleweed } from "../neon/NeonProps.jsx";
import { bitById } from "./registry.js";
import "./standoff.css";

const SO = bitById("standoff").beats;

/* standoff (versus, punchline): high noon in neon. A (the long shot) at
   left, B (the favorite) at right with its own tall stack of chips. A
   tumbleweed rolls through between them; they lean in. The house hand
   reaches in behind A, cocks a finger and flicks: A skims across the
   floor spinning, glances off B (B spins on its edge from the knock) and
   ricochets up into the top of B's stack (the hit: the song comes in
   here). The stack goes over like a felled tree, flat on top of B, a
   couple of chips spilling. A comes down on the pile and spins itself
   out like a coin settling.

   World x: A at 640, B at 1180, the stack's foot at 1400 (it falls about
   its left corner, 1325). The registry's camera shoots it. */
export const SO_STAGE = Object.freeze({ a:640, b:1180, stack:1400, floor:930, chip:240, stackW:150, stackN:14, thick:20 });

const anchors = () => {
  const { a, stack, stackW } = SO_STAGE;
  const minX = a - 200, maxX = stack + stackW / 2 + 90;
  return { a, b:SO_STAGE.b, stack, pile:SO_STAGE.b, minX, maxX, mid:Math.round((minX + maxX) / 2) };
};

export function Standoff({ cast }) {
  const a = cast?.a?.[0], b = cast?.b?.[0];
  /* the stack is B's: its top chip in B's own color */
  const bColor = useNeonColor(b);
  if (!a || !b) return null;
  const { a:ax, b:bx, stack, floor, chip, stackW, stackN, thick } = SO_STAGE;
  const r = chip / 2;
  const corner = stack - stackW / 2;
  /* A's path, from its feet: the skim to B, the ricochet up into the
     stack's top, the bounce off it, and down onto the fallen pile */
  const ping = { x:(bx - chip) - ax, y:0 };
  const hit = { x:(corner - r - 6) - ax, y:-(stackN * thick - r - 30) };
  /* up and over B's head on the way (its top is a chip off the floor) */
  const over = { x:(bx - r * 0.2) - ax, y:-chip - 70 };
  const pop = { x:hit.x - 40, y:hit.y - 190 };
  const rest = { x:bx - 10 - ax, y:-stackW + 2 };
  const px = p => `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  const style = { "--so-ping":px(ping), "--so-over":px(over), "--so-hit":px(hit), "--so-pop":px(pop), "--so-rest":px(rest) };
  return (
    <div className="so" style={style}>
      {/* the tumbleweed passes behind them */}
      <span className="neon-node so-weed" style={{ left:1720, top:floor - 66 }}>
        <span className="neon-node so-weed-hop"><span className="neon-node so-weed-spin"><Tumbleweed scale={0.95} /></span></span>
      </span>
      {/* B's stack, hung off its left corner so it falls like a tree */}
      <span className="neon-node so-stack" style={{ left:corner, top:floor, "--neon-player":bColor }}>
        <span className="neon-node" style={{ left:stackW / 2 }}><NeonStack count={stackN} width={stackW} thick={thick} top="player" /></span>
      </span>
      <NeonChip player={b} x={bx} y={floor} className="so-b" />
      {/* two chips that spill off the stack as it lands */}
      <span className="neon-node so-loose is-1" style={{ left:corner - stackN * thick + 10, top:floor - 60 }}><LooseChip width={120} thick={16} /></span>
      <span className="neon-node so-loose is-2" style={{ left:corner - stackN * thick + 60, top:floor - 80 }}><LooseChip width={120} thick={16} /></span>
      <NeonChip player={a} x={ax} y={floor} className="so-a">
        <span className="neon-node so-trail" style={{ top:-r }}><SpeedLines length={300} rows={[[-60, 0.8], [-18, 1], [26, 0.7], [64, 0.5]]} /></span>
      </NeonChip>
      {/* the glance off B, and the hit on the stack */}
      <span className="neon-node so-spark is-ping" style={{ left:bx - r, top:floor - r }}><Spark scale={1.4} /></span>
      <span className="neon-node so-spark is-hit" style={{ left:corner, top:floor - stackN * thick + 30 }}><Burst n={12} r0={40} r1={130} /></span>
      {/* the house hand, in behind A from the upper left */}
      <HouseHand className="so-hand" x={ax - r - 10 - 244} y={floor - r - 41} angle={20} scale={1.6}
        poses={[["cock", 0], ["point", SO.flick]]} />
    </div>
  );
}
Standoff.anchors = anchors;
