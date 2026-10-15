import React from "react";
import { HouseHand, Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst, Note } from "../neon/NeonProps.jsx";
import { HAND_POSES, TUBE, circlePath, ellipsePath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./needledrop.css";

const ND = bitById("needledrop").beats;

/* needle drop (win, music): a neon turntable on the floor, seen from a
   little above. The chip hops up onto the platter and falls flat on it
   like a record (rotateX on .nc-body), its photo the label. The house
   hand comes in from the upper right, pinches the tone arm's head off its
   rest, swings it over the record and lowers it until the needle hovers
   just over the groove (the wind-up holds here, the arm trembling in the
   hand). Drop: the needle lands with a spark, the song starts, the hand
   lets go and goes, the record spins in its own plane, the arm rides it,
   the meter on the front jumps and notes rise off the record.

   World: the plinth from 650 to 1270, its top face 662 (back) to 840
   (front); the platter centred at (900, 748); the arm's pivot at (1190,
   690). The arm turns about its pivot (.nd-rig); the hand rides a node on
   the arm's head turned back the other way (.nd-grip), so it keeps its
   angle while it carries the arm round. */
export const ND_STAGE = Object.freeze({
  floor:930, chip:240, plinth:Object.freeze({ x0:650, x1:1270, back:662, front:840, base:912 }),
  platter:Object.freeze({ x:900, y:748, rx:150, ry:74 }), feet:803, pivot:Object.freeze({ x:1190, y:690 }),
  /* where the hand pinches the arm (its head), in the arm's own frame */
  head:Object.freeze({ x:-150, y:17 }), hand:Object.freeze({ angle:112, scale:1.05 }),
});

const W = TUBE.w;
const r1 = n => Math.round(n * 10) / 10;

/* the plinth, the platter and the arm's rest, in world units */
function Deck() {
  const { x0, x1, back, front, base } = ND_STAGE.plinth;
  const { x, y, rx, ry } = ND_STAGE.platter;
  const top = `M${x0 + 12} ${front}L${x1 - 12} ${front}Q${x1} ${front} ${x1 - 3} ${front - 12}L${x1 - 36} ${back + 10}Q${x1 - 40} ${back}`
    + ` ${x1 - 52} ${back}L${x0 + 52} ${back}Q${x0 + 40} ${back} ${x0 + 36} ${back + 10}L${x0 + 3} ${front - 12}Q${x0} ${front} ${x0 + 12} ${front}Z`;
  const face = `M${x0 + 2} ${front - 4}L${x0 + 2} ${base - 12}Q${x0 + 2} ${base} ${x0 + 14} ${base}L${x1 - 14} ${base}Q${x1 - 2} ${base}`
    + ` ${x1 - 2} ${base - 12}L${x1 - 2} ${front - 4}`;
  const feet = [x0 + 40, x1 - 80].map(fx => `M${fx} ${base}L${fx} ${base + 14}L${fx + 40} ${base + 14}L${fx + 40} ${base}`).join("");
  /* the platter's rim and its edge (the front half, a little thick) */
  const edge = `M${x - rx} ${y}L${x - rx} ${y + 12}A${rx} ${ry} 0 0 0 ${x + rx} ${y + 12}L${x + rx} ${y}`;
  return <Neon box={[x0 - 30, back - 30, x1 - x0 + 60, base - back + 60]}
    fills={[{ d:top }, { d:`${face}Z` }, { d:`${edge}A${rx} ${ry} 0 0 1 ${x - rx} ${y}Z` }, { d:ellipsePath(x, y, rx, ry) }]}
    tubes={[
      { d:top, tone:"cyan", w:W * 0.8 },
      { d:face, tone:"cyan", w:W * 0.8 },
      { d:feet, tone:"cyan", w:W * 0.55 },
      { d:edge, tone:"magenta", w:W * 0.6 },
      { d:ellipsePath(x, y, rx, ry), tone:"magenta", w:W * 0.85 },
      /* the knobs and the power lamp on the front */
      { d:`${circlePath(1150, 876, 13)}${circlePath(1206, 876, 13)}`, tone:"bone", w:W * 0.5 },
      { d:circlePath(1094, 876, 5), tone:"magenta", w:W * 0.8 },
      /* the arm's rest */
      { d:"M1040 822L1040 836L1068 836L1068 822", tone:"cyan", w:W * 0.5 },
    ]} />;
}

/* the platter's strobe dots on its front edge: two sets, taking turns
   once it spins, so the light chases round */
function Strobe({ odd }) {
  const { x, y, rx, ry } = ND_STAGE.platter;
  const d = Array.from({ length:9 }, (_, i) => {
    const a = (16 + (i * 2 + (odd ? 1 : 0)) * 8.6) * Math.PI / 180;
    const px = x + Math.cos(a) * rx, py = y + 6 + Math.sin(a) * ry;
    return `M${r1(px)} ${r1(py)}L${r1(px)} ${r1(py + 0.5)}`;
  }).join("");
  return <Neon box={[x - rx - 20, y - 20, rx * 2 + 40, ry + 60]} className={`nd-strobe is-${odd ? "odd" : "even"}`}
    tubes={[{ d, tone:"amber", w:W * 0.9 }]} />;
}

/* the tone arm, drawn lowered (the needle on the record) with its pivot
   at 0 0 */
function Arm() {
  return <Neon box={[-232, -46, 300, 110]}
    fills={[{ d:circlePath(0, 0, 26) }, { d:"M-160 10L-202 16Q-208 17 -207 24L-206 30Q-205 36 -198 35L-162 31Z" }]}
    tubes={[
      { d:circlePath(0, 0, 26), tone:"cyan", w:W * 0.55 },
      { d:"M12 -11L44 -11Q52 -11 52 -3L52 3Q52 11 44 11L12 11", tone:"cyan", w:W * 0.7 },
      { d:"M0 0C-52 -12 -112 8 -164 21", tone:"bone", w:W * 0.85 },
      { d:"M-160 10L-202 16Q-208 17 -207 24L-206 30Q-205 36 -198 35L-162 31Z", tone:"amber", w:W * 0.6 },
      { d:"M-190 35L-190 41", tone:"bone", w:W * 0.45 },
      { d:circlePath(0, 0, 9), tone:"bone", w:W * 0.6 },
    ]} />;
}

/* the meter on the front: bars that jump to the beat */
const BARS = [0.55, 0.9, 0.7, 1, 0.6, 0.85, 0.5];

export function NeedleDrop({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { feet, pivot, head, hand, platter } = ND_STAGE;
  /* the hand's wrist, so the pinch lands on the arm's head */
  const pinch = HAND_POSES.pinch.at, a = hand.angle * Math.PI / 180;
  const wrist = { x:-(pinch.x * Math.cos(a) - pinch.y * Math.sin(a)) * hand.scale, y:-(pinch.x * Math.sin(a) + pinch.y * Math.cos(a)) * hand.scale };
  return (
    <div className="nd">
      <span className="neon-node" style={{ left:0, top:0 }}><Deck /></span>
      <span className="neon-node" style={{ left:0, top:0 }}><Strobe /><Strobe odd /></span>
      {BARS.map((peak, i) => <span key={i} className={`neon-node nd-bar is-${i}`} style={{ left:692 + i * 24, top:898, "--pk":peak }}>
        <Neon box={[-10, -50, 20, 60]} tubes={[{ d:"M0 0L0 -40", tone:i > 4 ? "magenta" : "amber", w:W * 0.8 }]} />
      </span>)}
      {/* the music's rings off the platter, on the beat */}
      {[0, 1].map(i => <span key={i} className={`neon-node nd-ring is-${i}`} style={{ left:platter.x, top:platter.y + 6 }}>
        <Neon box={[-platter.rx - 20, -platter.ry - 20, platter.rx * 2 + 40, platter.ry * 2 + 40]}
          tubes={[{ d:ellipsePath(0, 0, platter.rx, platter.ry), tone:"magenta", w:W * 0.5 }]} /></span>)}
      {/* the record: the chip, flat on the platter */}
      <NeonChip player={player} x={platter.x} y={feet} pool={false} className="nd-chip" />
      {/* notes rise off the record once it plays */}
      {[[40, 0], [110, 1], [-10, 2], [150, 3]].map(([dx, i]) =>
        <span key={i} className={`neon-node nd-note is-${i}`} style={{ left:platter.x + dx, top:platter.y - 100 }}>
          <Note two={i % 2 === 1} scale={0.85} tone={i % 2 ? "amber" : "cyan"} /></span>)}
      <span className="neon-node nd-spark" style={{ left:pivot.x - 190, top:pivot.y + 40 }}><Burst n={10} r0={20} r1={64} tone="bone" /></span>
      {/* the arm, and the hand that carries it */}
      <span className="neon-node nd-hover bit-hold-loop" style={{ left:pivot.x, top:pivot.y }}>
        <span className="neon-node nd-rig">
          <Arm />
          <span className="neon-node nd-grip" style={{ left:head.x, top:head.y }}>
            <HouseHand className="nd-hand" x={r1(wrist.x)} y={r1(wrist.y)} angle={hand.angle} scale={hand.scale}
              poses={[["point", 0], ["pinch", ND.grab], ["point", ND.drop + 40]]} />
          </span>
        </span>
      </span>
    </div>
  );
}
