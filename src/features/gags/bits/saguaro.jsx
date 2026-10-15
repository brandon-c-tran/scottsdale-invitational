import React from "react";
import { Neon, NeonChip, Swaps } from "../neon/Neon.jsx";
import { Alarm, Burst, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE, circlePath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./saguaro.css";

const SG = bitById("saguaro").beats;

/* saguaro (idle, songless): a neon saguaro with a blossom lit on top.
   The chip looks up at it. It hops: nowhere near. It hops higher, into
   the arm's spines (they flash), bounces off and shakes it off. It
   scoots over and leans on the arm to think: the spines again, and it
   jumps away. It backs right up, winds up, runs and leaps, and lands
   perched on the arm's tip, level with the blossom at last. The blossom
   closes for the night. The chip looks at us.

   World: the chip starts at x 620; the trunk stands at 1120 (100 wide,
   its top at y 520), its left arm's tip at x 930, y 660 (where the chip
   ends up), its right arm's at 1250, y 590. */
export const SG_STAGE = Object.freeze({ x:620, floor:930, chip:240, trunk:1120, tip:Object.freeze({ x:930, y:660 }) });

const W = TUBE.w;
/* the saguaro's outline: trunk, the left arm (low, out toward the chip)
   and the right arm (higher), in one tube */
const CACTUS = `M1070 930L1070 822L994 822Q898 822 898 758L898 692A32 32 0 0 1 962 692L962 742Q962 758 980 758L1070 758
  L1070 570A50 50 0 0 1 1170 570L1170 668L1200 668Q1218 668 1218 650L1218 622A32 32 0 0 1 1282 622L1282 672Q1282 732 1222 732
  L1170 732L1170 930`;
/* its ribs */
const RIBS = "M1103 560L1103 930M1137 560L1137 930M930 694L930 750M1250 624L1250 668M994 790L1066 790M1174 700L1222 700";
/* spines: little V's of two ticks off the outline, pointing out */
const SPINE_AT = [
  [1070, 610, -1, 0], [1070, 660, -1, 0], [1070, 710, -1, 0], [1070, 870, -1, 0],
  [1170, 610, 1, 0], [1170, 776, 1, 0], [1170, 830, 1, 0], [1170, 884, 1, 0], [1120, 534, 0, -1],
  [898, 706, -1, 0], [898, 746, -1, 0], [906, 790, -1, 1], [950, 822, 0, 1], [1030, 822, 0, 1], [930, 660, 0, -1],
  [1282, 640, 1, 0], [1270, 716, 1, 1], [1250, 590, 0, -1], [1200, 732, 0, 1],
];
const SPINES = SPINE_AT.map(([x, y, dx, dy]) => {
  const len = 15, s = 6, nx = -dy, ny = dx;
  return `M${x} ${y}L${x + dx * len + nx * s} ${y + dy * len + ny * s}M${x} ${y}L${x + dx * len - nx * s} ${y + dy * len - ny * s}`;
}).join("");
/* the blossom on top: open (five petals fanned up round its heart),
   closing, and shut (a bud) */
const BLOOM = Object.freeze({ x:1120, y:508 });
const petal = (deg, len, wide) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const p = (u, v) => `${Math.round((BLOOM.x + c * u - s * v) * 10) / 10} ${Math.round((BLOOM.y + s * u + c * v) * 10) / 10}`;
  return `M${p(6, 0)}C${p(len * 0.4, -wide)} ${p(len, -wide * 0.8)} ${p(len, 0)}C${p(len, wide * 0.8)} ${p(len * 0.4, wide)} ${p(6, 0)}`;
};
const PETALS = (len, wide) => [-170, -130, -90, -50, -10].map(deg => petal(deg, len, wide)).join("");
const BUD = `M${BLOOM.x} ${BLOOM.y + 10}C${BLOOM.x - 16} ${BLOOM.y - 4} ${BLOOM.x - 12} ${BLOOM.y - 26} ${BLOOM.x} ${BLOOM.y - 38}
  C${BLOOM.x + 12} ${BLOOM.y - 26} ${BLOOM.x + 16} ${BLOOM.y - 4} ${BLOOM.x} ${BLOOM.y + 10}`;
const BOX = [860, 440, 470, 510];

function Cactus() {
  return <span className="neon-node sg-cactus">
    <Neon box={BOX} fills={[{ d:CACTUS }]} tubes={[
      { d:CACTUS, tone:"cyan", w:W * 0.85 },
      { d:RIBS, tone:"cyan", w:W * 0.36 },
      { d:SPINES, tone:"bone", w:W * 0.28, g:"spines" },
    ]} />
    {/* the spines lit hot when pricked */}
    <span className="neon-node sg-hot">
      <Neon box={BOX} tubes={[{ d:SPINES, tone:"clay", w:W * 0.5 }]} />
    </span>
  </span>;
}

function Bloom() {
  const heart = circlePath(BLOOM.x, BLOOM.y, 9);
  const open = <span className="neon-node sg-open"><Neon box={BOX} tubes={[
    { d:PETALS(46, 15), tone:"magenta", w:W * 0.62 },
    { d:heart, tone:"amber", w:W * 0.62, g:"heart" },
  ]} /></span>;
  const closing = <Neon box={BOX} tubes={[{ d:PETALS(30, 8), tone:"magenta", w:W * 0.55 }, { d:heart, tone:"amber", w:W * 0.4 }]} />;
  const shut = <Neon box={BOX} tubes={[{ d:BUD, tone:"magenta", w:W * 0.55 }]} />;
  return <span className="neon-node sg-bloom">
    <Swaps layers={[[open, 0], [closing, SG.close], [shut, SG.close + 170]]} />
  </span>;
}

export function Saguaro({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip } = SG_STAGE;
  return (
    <div className="sg">
      <Cactus />
      <Bloom />
      <NeonChip player={player} x={x} y={floor} className="sg-chip"
        wear={<>
          <span className="neon-node sg-alarm"><Alarm r={chip / 2} tone="clay" /></span>
          <span className="neon-node sg-sweat" style={{ left:-chip * 0.4, top:-chip * 0.46 }}><SweatDrop scale={0.9} /></span>
        </>} />
      {/* where the spines get it */}
      <span className="neon-node sg-ouch is-1" style={{ left:892, top:740 }}><Burst n={8} r0={18} r1={64} tone="clay" /></span>
      <span className="neon-node sg-ouch is-2" style={{ left:890, top:790 }}><Burst n={8} r0={18} r1={64} tone="clay" /></span>
    </div>
  );
}
