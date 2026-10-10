import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, ShoeArt } from "../cast/CastChip.jsx";
import { Anvil as AnvilArt, ChipStack, DUST_LOW, DizzyStars, Dust, FloorShadow, SweatDrop } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./anvil.css";

/* anvil (loss, slapstick): the chip stands beside its own stack of chips,
   a glove resting on top of it, admiring it (a pat or two). A shadow grows
   under it to a falling whistle. Silence. It looks up; a sweat drop; both
   gloves go up. CLANG: flattened to a pancake, the anvil hopping off it
   into the dirt, stars going round. Held there. It peels itself off the
   floor from one edge like a sticker and boings back into shape, one shoe
   still flat on the floor. It turns to the room and looks at us, a beat,
   then turns away and limps off on the other shoe.

   The stage's camera shoots it (the registry's camera, in this stage's
   world x: the chip at 820, the stack at 1180). */
const AN = bitById("anvil").beats;
export const ANVIL_STAGE = Object.freeze({ x:820, stack:1180, floor:CAST.floor, anvilTo:-230, hop:80 });
/* the pancake: the chip as wide as it can go and nearly no height */
export const PANCAKE = Object.freeze({ x:1.42, y:0.2 });

const px = n => `${Math.round(n * 10) / 10}px`;

export function Anvil({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const g = castGeometry(CAST.size);
  const { x, floor } = ANVIL_STAGE;
  /* the front glove laid flat on the stack's top */
  const onStack = { x:ANVIL_STAGE.stack - x - 284, y:-76 };
  /* the anvil lands on the chip's head, then on the pancake's top */
  const head = floor + g.top;
  const flat = floor - (g.lift + g.size) * PANCAKE.y;
  /* where the left shoe lies once the rest of it gets up */
  const shoe = { x:x + g.shoes.l.x * PANCAKE.x, y:floor };
  const style = {
    "--on-stack":`translate(${px(onStack.x)}, ${px(onStack.y)})`, "--hands-up":"translate(12px, -42px)",
    "--squash":`scale(${PANCAKE.x}, ${PANCAKE.y})`, "--sink":`translateY(${px(flat - head)})`,
    "--anvil-to":`translateX(${px(ANVIL_STAGE.anvilTo)})`, "--hop-peak":`translateY(${px(-ANVIL_STAGE.hop)})`,
    "--hop-land":`translateY(${px(floor - flat)})`, "--peel-at":`${px((g.size / 2 + 6) * PANCAKE.x)} 0px`,
  };
  return (
    <div className="an" style={style}>
      <span className="an-node an-shadow" style={{ left:x, top:floor }}><FloorShadow w={430} h={62} className="is-falling" /></span>
      <span className="an-node an-stack" style={{ left:ANVIL_STAGE.stack, top:floor }}><ChipStack player={player} count={11} width={156} /></span>
      <span className="an-node an-flatshoe" style={{ left:shoe.x, top:shoe.y }}>
        <span className="an-node" style={{ transform:`scale(${PANCAKE.x}, ${PANCAKE.y})` }}><ShoeArt scale={g.scale} /></span>
      </span>
      <CastChip player={player} x={x} y={floor} facing={1} className="an-chip"
        hands={{ front:[["flat", 0], ["open", AN.notice], ["rest", AN.pop]], back:[["rest", 0], ["open", AN.notice + 40], ["rest", AN.pop]] }}
        wear={<span className="an-node an-sweat" style={{ left:g.size * 0.1, top:g.size * 0.02 }}><SweatDrop scale={1.1} /></span>} />
      <Dust className="an-dust" at={AN.hit} puffs={DUST_LOW} spread={1.1} style={{ left:x, top:floor - 8 }} />
      <span className="an-node an-stars" style={{ left:x, top:floor - 74 }}>
        <DizzyStars count={3} rx={150} ry={26} at={AN.stars} scale={1.25} />
      </span>
      <span className="an-node an-anvil" style={{ left:x, top:head }}>
        <span className="an-node an-anvil-x"><span className="an-node an-anvil-y"><span className="an-node an-anvil-rock">
          <AnvilArt scale={1.3} />
        </span></span></span>
      </span>
      <Dust className="an-dust-2" at={AN.thud} puffs={DUST_LOW} spread={0.6} size={0.8} style={{ left:x + ANVIL_STAGE.anvilTo, top:floor - 4 }} />
    </div>
  );
}
