import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, GloveArt } from "../cast/CastChip.jsx";
import { ARM_TABLE, ArmTable, SweatDrop } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./armwrestle.css";

/* armwrestle (idle, action): two chips at a tiny café table, front
   gloves locked over it, the free ones clenched, everything trembling: a
   dead even stalemate. Sweat. The locked hands tip toward A (A leans back,
   B leans in), creep back to the middle, tip toward B, back to the
   middle. Dead centre. Then both turn to the room at the same moment and
   look at us, still locked, still shaking, and hold. A sweat drop runs
   down A and drips off.

   The locked hands are one node (the scene draws both front gloves in the
   rig's art, the rig's own front gloves hidden) that pivots on the middle
   of the table, so the struggle swings them through an arc over it. They
   face each other harder than the rig's facing (a wider turn), so the
   turn to the room reads from the couch. The stage's camera shoots it
   (the registry's camera, in this stage's world x: A at 750, B at 1170,
   the table at 960). The room's first two play (one alone wrestles a
   twin). */
const AW = bitById("armwrestle").beats;
export const AW_STAGE = Object.freeze({ a:750, b:1170, table:960, floor:CAST.floor });

export function Armwrestle({ cast }) {
  const room = cast?.a || [];
  const [a, b = a] = room;
  if (!a) return null;
  const { floor, table } = AW_STAGE;
  const g = castGeometry(CAST.size);
  const top = floor - ARM_TABLE.top;
  const glove = pose => <GloveArt pose={pose} scale={g.glove} />;
  const sweat = (cls, left, delay) => (
    <span className={`aw-node aw-sweat ${cls}`} style={{ left:g.size * left, top:g.size * 0.16, "--d":`${delay}ms` }}><SweatDrop scale={1.05} /></span>
  );
  return (
    <div className="aw">
      <span className="aw-node aw-table" style={{ left:table, top:floor }}><ArmTable /></span>
      <CastChip player={b} x={AW_STAGE.b} y={floor} facing={-1} className="aw-chip aw-b" hands={{ back:"fist" }} style={{ "--cast-turn":"rotateY(38deg)" }}
        wear={<>{sweat("is-b1", 0.78, AW.sweatB)}</>} />
      <CastChip player={a} x={AW_STAGE.a} y={floor} facing={1} className="aw-chip aw-a" hands={{ back:"fist" }} style={{ "--cast-turn":"rotateY(-38deg)" }}
        wear={<>{sweat("is-a1", 0.2, AW.sweatA)}{sweat("is-a2", 0.3, AW.drip - 1300)}</>} />
      {/* the locked hands: B's from the right behind, A's from the left over it */}
      <span className="aw-node aw-lock" style={{ left:table, top:top - 6 }}>
        <span className="aw-node aw-lock-tilt"><span className="aw-node aw-lock-shake">
          <span className="aw-node" style={{ left:26, top:-8, transform:"scaleX(-1) rotate(-78deg)" }}>{glove("fist")}</span>
          <span className="aw-node" style={{ left:-26, top:-8, transform:"rotate(-78deg)" }}>{glove("grip")}</span>
        </span></span>
      </span>
    </div>
  );
}
