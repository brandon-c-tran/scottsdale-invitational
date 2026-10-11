import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, GloveArt, Swaps } from "../cast/CastChip.jsx";
import { Emanata, Moth, Pillow, SleepMark } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./nap.css";

/* nap (idle, desert): the chip asleep on its back in the middle of the
   floor, its head on a little pillow, its gloves flopped either side,
   breathing slow; sleep marks drift up off it. A moth comes fluttering in,
   goes round once and lands on its face, riding the breaths. The near
   glove twitches, then comes up off the floor, slowly, and hangs there.
   SWAT: its own face. The moth was already off; it goes round again and
   settles on the glove. The chip sighs and sleeps on.

   Lying down is the rig tipped back about its feet (rotateX, a long
   perspective from above, so the far rim recedes); its own gloves would
   lie flattened in that plane, so the scene draws them itself, in the
   same art, laid on the floor (squashed the same way) where it can lift
   one. The stage's camera shoots it (the registry's camera, in this
   stage's world x: the chip at 960). */
const NP = bitById("nap").beats;
export const NAP_STAGE = Object.freeze({ x:960, floor:CAST.floor });

const px = n => `${Math.round(n * 10) / 10}px`;
/* the smack's strokes, all the way round */
const SMACK = Object.freeze([[-160, 70, 104], [-120, 62, 96], [-60, 62, 96], [-20, 70, 104], [20, 70, 100], [160, 70, 100]]);

export function Nap({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor } = NAP_STAGE;
  const g = castGeometry(CAST.size);
  /* the gloves lying either side of it; the face, lying down; the swat
     lands on its upper half, where the moth sits */
  const hand = { l:{ x:x - 150, y:floor - 52 }, r:{ x:x + 150, y:floor - 52 } };
  const face = { x:x + 4, y:floor - 96 };
  const swat = { x:face.x - hand.r.x + 2, y:face.y - hand.r.y + 34 };
  const style = {
    "--swat":`translate(${px(swat.x)}, ${px(swat.y)}) rotate(-4deg)`,
    "--hover":`translate(${px(swat.x + 46)}, ${px(swat.y - 170)}) rotate(-12deg)`,
    "--hover2":`translate(${px(swat.x + 30)}, ${px(swat.y - 190)}) rotate(-4deg)`,
  };
  const glove = pose => <GloveArt pose={pose} scale={g.glove} />;
  const mirrored = node => <span className="np-node" style={{ transform:"scaleX(-1)" }}>{node}</span>;
  return (
    <div className="np" style={style}>
      <span className="np-node np-pillow" style={{ left:x, top:floor - 128 }}><Pillow scale={0.86} /></span>
      <CastChip player={player} x={x} y={floor} className="np-chip" hands={{ l:"rest", r:"rest" }} />
      {/* the far glove, laid flat on the floor (a left hand: mirrored) */}
      <span className="np-node np-hand is-back" style={{ left:hand.l.x, top:hand.l.y }}>
        <span className="np-node" style={{ transform:"rotate(-10deg)" }}>{mirrored(glove("flat"))}</span>
      </span>
      {/* the near glove: laid on the floor, up, and down flat on its own face */}
      <span className="np-node np-hand is-front" style={{ left:hand.r.x, top:hand.r.y }}>
        <span className="np-node np-hand-lift"><span className="np-node np-hand-twitch"><span className="np-node np-hand-squash">
          <Swaps layers={[[<span className="np-node" style={{ transform:"rotate(10deg)" }}>{glove("flat")}</span>, 0],
            [mirrored(glove("open")), NP.lift]]} />
        </span></span></span>
      </span>
      {/* the smack: strokes flung out round the glove for a moment */}
      <span className="np-node np-smack" style={{ left:hand.r.x + swat.x - 30, top:hand.r.y + swat.y - 40 }}>
        <Emanata rays={SMACK} width={8} scale={1.2} />
      </span>
      {/* sleep marks: a small one and a bigger one each time */}
      {[NP.mark1, NP.mark1 + 760, NP.mark2, NP.mark2 + 760, NP.mark3, NP.mark3 + 760].map((at, i) => (
        <span key={i} className="np-node np-mark" style={{ left:x + 60, top:floor - 160, "--at":`${at}ms`, "--s":i % 2 ? 1.5 : 1.05 }}>
          <SleepMark />
        </span>
      ))}
      {/* the moth: in, round, onto the face (riding its breaths), off at
         the swat, round again, onto the glove */}
      <span className="np-node np-moth" style={{ left:face.x, top:face.y }}>
        <span className="np-node np-moth-ride"><span className="np-node np-moth-bob"><Moth scale={1.1} /></span></span>
      </span>
    </div>
  );
}
