import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { Blast, CUPCAKE, Cupcake, FUSE, Flame, Fuse, MATCH, Match, PARTY_TABLE, PartyTable, Puff, Soot, Spark, SweatDrop }
  from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./dynamite.css";

const DY = bitById("dynamite").beats;

/* dynamite (loss, slapstick): the chip at a little party table with a
   cupcake. It strikes a match and lights the candle, which is a stick of
   dynamite; it shakes the match out and leans in, delighted, rocking a
   little while the fuse fizzes down. It stops. A sweat drop. It turns,
   slowly, and looks at the room. BOOM: a white frame, the fireball, smoke
   filling the middle. The smoke clears: the chip is black with soot, still
   in exactly the same pose, the table bare. It coughs one puff of smoke.
   One of its gloves drops off and lands in the dirt. Hold.

   The blast swaps the clean cast for a sooty twin in the same pose (and
   the table for a scorched one) under the white frame and the smoke. The
   stage's camera shoots it (the registry's camera, in this stage's world
   x: the chip at 820, the table at 1080). */
export const DY_STAGE = Object.freeze({ x:820, table:1080, floor:CAST.floor, sit:-128 });
/* smoke balls round the middle of the blast: [dx, dy, size] from the blast */
const SMOKE = Object.freeze([[-230, 70, 2.9], [-80, 90, 3.4], [80, 80, 3.2], [230, 70, 2.8], [-170, -70, 3], [20, -110, 3.4],
  [170, -60, 2.9], [-40, 20, 3.8], [310, 10, 2.3], [-320, 30, 2.2]]);

const r1 = n => Math.round(n * 10) / 10;
const px = n => `${r1(n)}px`;
const move = ({ x, y }) => `translate(${px(x)}, ${px(y)})`;

/* the front glove's marks, from its wrist: the match's flame on the fuse's
   tip, pulled back to shake it out, laid flat on the table's edge */
export function dynamiteMarks(size = CAST.size) {
  const g = castGeometry(size);
  const wrist = g.hands.r;
  const held = { x:GLOVE_POSES.grip.held.x * g.glove, y:GLOVE_POSES.grip.held.y * g.glove };
  const flame = { x:held.x + MATCH.head.x, y:held.y + MATCH.head.y - 14 };
  const base = { x:DY_STAGE.table - DY_STAGE.x + CUPCAKE.fuseBase.x, y:DY_STAGE.sit + CUPCAKE.fuseBase.y };
  const tip = { x:base.x + FUSE.points[0][0], y:base.y + FUSE.points[0][1] };
  return {
    g, base, tip,
    toFuse:{ x:tip.x - wrist.x - flame.x - 6, y:tip.y - wrist.y - flame.y + 12 },
    back:{ x:24, y:-46 },
    table:{ x:DY_STAGE.table - PARTY_TABLE.half - DY_STAGE.x - wrist.x - 22, y:PARTY_TABLE.top - wrist.y - 14 },
    /* the back glove, dropped: on its side in the dirt */
    drop:{ x:-6, y:-wrist.y - 30 },
  };
}

export function Dynamite({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, table, floor, sit } = DY_STAGE;
  const m = dynamiteMarks(CAST.size);
  const { g } = m;
  const burn = Math.round((DY.boom - DY.lit) / 4);
  const style = {
    "--to-fuse":move(m.toFuse), "--back":move(m.back), "--on-table":move(m.table), "--drop":move(m.drop), "--burn":`${burn}ms`,
  };
  const match = (
    <span className="dy-node dy-match">
      <Match />
      <span className="dy-node dy-flame" style={{ left:MATCH.head.x, top:MATCH.head.y - 6 }}><Flame scale={0.62} /></span>
    </span>
  );
  /* the same pose for both, so the swap under the smoke is seamless */
  const pose = { size:CAST.size, x, y:floor, facing:1 };
  const fuseAt = { left:table + CUPCAKE.fuseBase.x, top:floor + sit + CUPCAKE.fuseBase.y };
  return (
    <div className="dy" style={style}>
      <span className="dy-node dy-table is-clean" style={{ left:table, top:floor }}><PartyTable /></span>
      <span className="dy-node dy-table is-burnt" style={{ left:table, top:floor }}><PartyTable /></span>
      <span className="dy-node dy-cake" style={{ left:table, top:floor + sit }}><Cupcake /></span>
      <span className="dy-node dy-fuse" style={fuseAt}>
        <Fuse />
        <span className="dy-node dy-spark"><span className="dy-node dy-spark-in"><Spark scale={0.9} /></span></span>
      </span>
      <CastChip player={player} {...pose} className="dy-chip is-clean"
        hands={{ front:[["grip", 0], ["flat", DY.admire]], back:"rest" }} hold={{ front:{ grip:match } }}
        wear={<span className="dy-node dy-sweat" style={{ left:g.size * 0.1, top:g.size * 0.04 }}><SweatDrop scale={1.1} /></span>} />
      <CastChip player={player} {...pose} className="dy-chip is-soot" hands={{ front:"flat", back:"rest" }}
        wear={<span className="dy-node dy-soot"><Soot size={g.size} edge={g.edge} /></span>}>
        {/* one cough of smoke, from where a mouth would be */}
        <span className="dy-node dy-cough" style={{ left:12, top:g.center.y + 40 }}><Puff scale={1.05} /></span>
        {[0, 1].map(i => <span key={i} className="dy-node dy-wisp" style={{ left:-40 + i * 76, top:g.top + 10, "--d":`${i * 260}ms` }}>
          <Puff scale={0.75} /></span>)}
      </CastChip>
      {/* the blast, and the smoke that fills the middle */}
      <span className="dy-node dy-blast" style={{ left:table - 40, top:floor + sit - 90 }}><span className="dy-node dy-blast-in"><Blast r={210} /></span></span>
      {SMOKE.map(([dx, dy, s], i) => <span key={i} className="dy-node dy-smoke" style={{ left:table - 130 + dx, top:floor - 120 + dy,
        "--d":`${(i % 4) * 30}ms`, "--up":px(-30 - (i % 3) * 22), "--out":px(dx * 0.18) }}>
        <Puff scale={s} fill="var(--bit-smoke-dark)" shade="var(--bit-soot-lit)" /></span>)}
    </div>
  );
}

/* the camera's anchors: "chip" its face, "mid" the chip and the table */
Dynamite.anchors = () => ({ chip:DY_STAGE.x + 30, mid:Math.round((DY_STAGE.x + DY_STAGE.table) / 2) });
