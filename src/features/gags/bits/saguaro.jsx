import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { Blossom, Emanata, FloorShadow, SAGUARO, STEPLADDER, Saguaro as SaguaroArt, Stepladder } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./saguaro.css";

/* saguaro (idle, desert): a saguaro far taller than the chip, a blossom on
   top; the chip looks up at it. It reaches out and takes hold of the near
   arm: pricked, a hop back, the glove shaken out. It steps in and tries
   the other glove, across its face: pricked. It walks off, comes back with
   a stepladder (two steps), sets it down by the trunk, gets up on it and
   reaches up with both gloves, on its toes: nowhere near. It gives up,
   turns round and leans back against the cactus: pricked. The leap takes
   it all the way to the top, the ladder going over behind it; the blossom
   pops up off the top and lands on its head. It turns and looks at us.

   The stage's camera shoots it (the registry's camera, in this stage's
   world x: the chip at 730, the ladder at 990, the cactus at 1160); for
   the leap it pulls right out to show the whole of the saguaro. */
const SG = bitById("saguaro").beats;
export const SG_STAGE = Object.freeze({ x:730, ladder:990, cactus:1160, floor:CAST.floor });

const px = n => `${Math.round(n * 10) / 10}px`;
/* the pricks' strokes, flung out from the spines */
const OUCH = Object.freeze([[-150, 30, 66], [-110, 28, 70], [-70, 30, 66], [150, 30, 62], [110, 28, 64]]);

export function Saguaro({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, ladder, cactus, floor } = SG_STAGE;
  const g = castGeometry(CAST.size);
  /* the near arm's left edge, where the first two grabs land; where its
     back meets the trunk, leaning; the top it lands on */
  const arm = { x:cactus + SAGUARO.l.out - SAGUARO.armW / 2, y:floor + SAGUARO.l.at };
  const top = floor - SAGUARO.h;
  const onLadder = { x:ladder - x, y:-STEPLADDER.top };
  const onTop = { x:cactus - x, y:-SAGUARO.h };
  const style = {
    "--on-ladder":`translate(${px(onLadder.x)}, ${px(onLadder.y)})`, "--on-top":`translate(${px(onTop.x)}, ${px(onTop.y)})`,
    "--leap-peak":`translate(${px(onLadder.x + (onTop.x - onLadder.x) * 0.62)}, ${px(onTop.y - 120)})`,
    /* the blossom lands on its rim (the top of the chip standing on the top) */
    "--bloom-land":`translate(-6px, ${px(-(g.lift + g.size) - 4)}) rotate(346deg)`,
  };
  const front = [["rest", 0], ["open", SG.reach1 - 60], ["rest", SG.prick1 + 750], ["grip", SG.enter - 50], ["rest", SG.set + 150],
    ["open", SG.reach - 50], ["rest", SG.giveup + 50], ["open", SG.prick3], ["rest", SG.top + 100]];
  const back = [["rest", 0], ["open", SG.reach2 - 60], ["rest", SG.prick2 + 650], ["open", SG.reach - 50], ["rest", SG.giveup + 50],
    ["open", SG.prick3], ["rest", SG.top + 100]];
  return (
    <div className="sg" style={style}>
      <span className="sg-node" style={{ left:cactus, top:floor }}><SaguaroArt bloom={false} /></span>
      <span className="sg-node sg-ladder-shadow" style={{ left:ladder, top:floor }}><FloorShadow w={124} h={20} /></span>
      <span className="sg-node sg-ladder" style={{ left:ladder, top:floor }}>
        <span className="sg-node sg-ladder-tip"><Stepladder /></span>
      </span>
      <CastChip player={player} x={x} y={floor} facing={1} className="sg-chip" hands={{ front, back }} />
      {/* the pricks: at the near arm twice, then at its back against the trunk */}
      <span className="sg-node sg-ouch is-1" style={{ left:arm.x, top:arm.y - 34 }}><Emanata rays={OUCH} width={8} /></span>
      <span className="sg-node sg-ouch is-2" style={{ left:arm.x, top:arm.y - 70 }}><Emanata rays={OUCH} width={8} /></span>
      <span className="sg-node sg-ouch is-3" style={{ left:cactus - SAGUARO.w / 2 + 2, top:floor - STEPLADDER.top - 150 }}>
        <Emanata rays={OUCH} width={8} scale={1.15} />
      </span>
      {/* the blossom, off the top and onto its head */}
      <span className="sg-node sg-bloom" style={{ left:cactus, top:top - 8 }}><Blossom scale={1.5} /></span>
    </div>
  );
}
