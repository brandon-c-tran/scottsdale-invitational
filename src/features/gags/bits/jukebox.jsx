import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst, Note } from "../neon/NeonProps.jsx";
import { TUBE, arcPath, circlePath, ellipsePath } from "../neon/neonArt.js";
import "./jukebox.css";

/* jukebox (win, music): a neon jukebox stands dark on the floor, only its
   outline lit. The chip hops over and hip-checks it (a sideways bump, no
   hands): it rocks, sputters (its dome and window stutter on and off) and
   coughs up two notes that flop to the floor. The chip backs off and
   leans away for a harder one (the wind-up holds here, the jukebox
   flickering). Bump: it kicks in, the song starts, every tube lights,
   bubbles run up its tubes, it thumps to the beat, notes stream out of its
   dome and the chip bobs beside it.

   World: the jukebox's middle at 1062, drawn at 0.88 (its sides 895 and
   1229, its arch's top at 402); the chip at 760, hard by its left side. The jukebox rocks
   about its right foot (.jb-rock) and thumps about its foot (.jb-pump). */
export const JB_STAGE = Object.freeze({ x:760, floor:930, juke:1062, r:190, h:410, k:0.88 });

const W = TUBE.w;
const r1 = n => Math.round(n * 10) / 10;

/* the jukebox's tubes, drawn with its foot's middle at 0 0 */
function jukeTubes() {
  const { r, h } = JB_STAGE;
  const arch = rr => `M${-rr} ${rr === r ? 0 : -40}L${-rr} ${-h}A${rr} ${rr} 0 0 1 ${rr} ${-h}L${rr} ${rr === r ? 0 : -40}`;
  const rays = Array.from({ length:11 }, (_, i) => {
    const a = (195 + i * 15) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return `M${r1(c * 46)} ${r1(-h + s * 46)}L${r1(c * 128)} ${r1(-h + s * 128)}`;
  }).join("");
  const keys = Array.from({ length:6 }, (_, i) => {
    const x = -110 + i * 40;
    return `M${x} -252L${x + 20} -252L${x + 20} -236L${x} -236Z`;
  }).join("");
  const bars = Array.from({ length:9 }, (_, i) => `M${-96 + i * 24} -196L${-96 + i * 24} -74`).join("");
  return [
    { d:`${arch(r)}Z`, tone:"magenta", w:W * 1.05, g:"main" },
    { d:arch(175), tone:"cyan", w:W * 1.4, g:"tube" },
    { d:arch(150), tone:"amber", w:W * 0.55, g:"inner" },
    { d:`${rays}${arcPath(0, -h, 46, 180, 360)}M-128 ${-h}L128 ${-h}`, tone:"amber", w:W * 0.5, g:"dome" },
    { d:"M-120 -390L120 -390L120 -276L-120 -276Z", tone:"bone", w:W * 0.6, g:"window" },
    { d:`${ellipsePath(0, -326, 74, 20)}${ellipsePath(0, -326, 14, 4)}M70 -372L40 -334`, tone:"bone", w:W * 0.42, g:"record" },
    { d:keys, tone:"amber", w:W * 0.5, g:"keys" },
    { d:"M-122 -212L122 -212L122 -58L-122 -58Z", tone:"cyan", w:W * 0.6, g:"grille" },
    { d:bars, tone:"cyan", w:W * 0.42, g:"bars" },
  ];
}
const OUTLINE = () => `M${-JB_STAGE.r} 0L${-JB_STAGE.r} ${-JB_STAGE.h}A${JB_STAGE.r} ${JB_STAGE.r} 0 0 1 ${JB_STAGE.r} ${-JB_STAGE.h}L${JB_STAGE.r} 0Z`;
const BOX = [-230, -JB_STAGE.h - JB_STAGE.r - 40, 460, JB_STAGE.h + JB_STAGE.r + 60];

/* dark: the outline lit, every other tube its bent glass */
const JukeOff = () => <Neon box={BOX} className="jb-off" fills={[{ d:OUTLINE() }]}
  tubes={jukeTubes().map(tube => tube.g === "main" ? tube : { ...tube, glass:true })} />;
/* the sputter: its dome, its inner arch and its window catching */
const JukeSputter = () => <Neon box={BOX} tubes={jukeTubes().filter(tube => ["dome", "inner", "window", "record"].includes(tube.g))} />;
/* on: every tube lit */
const JukeOn = () => <Neon box={BOX} tubes={jukeTubes()} />;

const Bubble = () => <Neon box={[-12, -12, 24, 24]} tubes={[{ d:circlePath(0, 0, 6), tone:"bone", w:W * 0.42 }]} />;

export function Jukebox({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, juke, r, h, k } = JB_STAGE;
  return (
    <div className="jb">
      {/* the jukebox: rocks about its right foot, thumps about its own */}
      <span className="neon-node jb-rock" style={{ left:juke + r * k, top:floor }}>
        <span className="neon-node" style={{ transform:`scale(${k})` }}><span className="neon-node jb-pump" style={{ left:-r }}>
          <JukeOff />
          <span className="neon-node jb-sput bit-hold-loop"><JukeSputter /></span>
          <span className="neon-node jb-on"><JukeOn /></span>
          {[-175, 175].flatMap(bx => [0, 1, 2, 3].map(i =>
            <span key={`${bx}:${i}`} className={`neon-node jb-bubble is-${i}`} style={{ left:bx, top:-56 }}><Bubble /></span>))}
          {/* notes stream out of the dome once it plays */}
          {[[-120, 0], [110, 1], [-60, 2], [150, 3]].map(([nx, i]) =>
            <span key={i} className={`neon-node jb-note is-${i}`} style={{ left:nx, top:-h - 60 }}>
              <Note two={i % 2 === 1} scale={0.9} tone={i % 2 ? "amber" : "cyan"} /></span>)}
          <span className="neon-node jb-kick" style={{ left:-r, top:-160 }}><Burst n={8} r0={26} r1={70} tone="bone" turn={22} /></span>
        </span></span>
      </span>
      {/* the two notes it coughs up, which flop to the floor */}
      <span className="neon-node jb-cough is-0" style={{ left:juke + 40, top:floor - (h + 150) * k }}><Note scale={0.8} tone="magenta" /></span>
      <span className="neon-node jb-cough is-1" style={{ left:juke + 90, top:floor - (h + 130) * k }}><Note two scale={0.8} tone="magenta" /></span>
      <NeonChip player={player} x={x} y={floor} className="jb-chip" />
    </div>
  );
}
