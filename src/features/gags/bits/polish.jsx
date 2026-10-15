import React from "react";
import { HouseHand, Neon, NeonChip } from "../neon/Neon.jsx";
import { NeonStar } from "../neon/NeonProps.jsx";
import { CHIP_ART, HAND_POSES, TUBE, circlePath, starPath } from "../neon/neonArt.js";
import "./polish.css";

/* polish (idle, songless): the chip stands there gone dull, a film of
   dust over it. The house hand reaches in with a cloth and buffs it in
   circles; the chip turns a little with the rubbing, the dust puffs off
   and the film clears. The hand draws back to look. The rim comes up
   bright, a glint runs across the face, a sparkle catches the edge. The
   chip, pleased, hops once. The hand comes back for one last flick of a
   buff, and goes.

   World x: the chip at 1000. The hand comes in from the upper left, a wad of
   cloth in its fist (held at the grip pose's `at`, behind the fingers)
   bulging out past the knuckles onto the chip's face. */
export const PL_STAGE = Object.freeze({ x:1000, floor:930, chip:240, angle:26, scale:1.15 });

const W = TUBE.w;
/* the cloth, bunched in the fist (about the grip pose's `at`): a lumpy
   wad bulging out past the knuckles, its folds, the rest of it hanging
   down below in a drape.
   Its middle, where it rubs, is RAG_MID along the fist. */
const RAG = "M10 -40C30 -58 60 -60 78 -50C96 -58 112 -46 112 -30C130 -20 130 8 112 22C122 44 98 66 72 56C52 72 18 68 4 48C-10 24 -8 -18 10 -40Z";
const RAG_FOLDS = "M58 -48C66 -16 52 12 68 52M104 -26C84 -6 88 18 112 22M24 -30C34 -16 30 4 40 14";
/* the rest of it hanging down below the fist in a drape, its hem wavy */
const RAG_TAIL = "M14 50C10 74 8 98 10 122C24 114 36 126 50 116C62 124 76 114 90 120C88 98 86 74 90 46";
const RAG_HEM = "M30 70C28 88 30 102 32 116M64 64C62 82 64 98 68 116";
export const RAG_MID = Object.freeze({ x:66, y:2 });
function Rag() {
  return <span className="neon-node pl-rag">
    <Neon box={[-24, -80, 170, 226]} fills={[{ d:RAG_TAIL }, { d:RAG }]} tubes={[
      { d:RAG_TAIL, tone:"magenta", w:W * 0.55 },
      { d:RAG_HEM, tone:"magenta", w:W * 0.32, g:"folds" },
      { d:RAG, tone:"magenta", w:W * 0.62 },
      { d:RAG_FOLDS, tone:"magenta", w:W * 0.34, g:"folds" },
    ]} />
  </span>;
}

export function Polish({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, angle, scale } = PL_STAGE;
  const r = chip / 2;
  const center = floor - r;
  /* the wrist, so the cloth's middle lands on the chip's middle */
  const at = { x:HAND_POSES.grip.at.x + RAG_MID.x, y:HAND_POSES.grip.at.y + RAG_MID.y }, a = angle * Math.PI / 180;
  const turned = { x:(at.x * Math.cos(a) - at.y * Math.sin(a)) * scale, y:(at.x * Math.sin(a) + at.y * Math.cos(a)) * scale };
  const wrist = { x:Math.round(x - turned.x), y:Math.round(center - turned.y) };
  const k = chip / (CHIP_ART.r * 2);
  return (
    <div className="pl">
      <NeonChip player={player} x={x} y={floor} className="pl-chip"
        wear={<>
          {/* the dust film, cleared by the rubbing */}
          <span className="neon-node pl-film" style={{ left:-r, top:-r, width:chip, height:chip }} />
          {/* the rim come up bright: a second, hotter rim over its own */}
          <span className="neon-node pl-shine">
            <Neon box={[-50, -50, 100, 100]} scale={k} tubes={[
              { d:circlePath(0, 0, CHIP_ART.rim), tone:"player", w:5.2 },
              { d:circlePath(0, 0, CHIP_ART.r + 3), tone:"player", w:1.6 },
            ]} />
          </span>
          {/* the glint across the face */}
          <span className="neon-node pl-glint"><span className="neon-node pl-glint-run">
            <Neon box={[-60, -60, 120, 120]} tubes={[{ d:"M-34 34L34 -34", tone:"bone", w:W * 0.9 }, { d:"M-6 52L52 -6", tone:"bone", w:W * 0.4 }]} />
          </span></span>
          {/* the sparkle on the edge */}
          <span className="neon-node pl-spark" style={{ left:r * 0.7, top:-r * 0.72 }}>
            <span className="neon-node pl-spark-spin">
              <Neon box={[-50, -50, 100, 100]} tubes={[{ d:starPath(4, 44, 8), tone:"bone", w:W * 0.62 }]} />
            </span>
          </span>
          <span className="neon-node pl-spark2" style={{ left:-r * 0.62, top:r * 0.5 }}><NeonStar r={14} tone="amber" /></span>
        </>}>
        {/* dust puffed off by the cloth */}
        {[[-r * 0.9, -r * 1.2, 0], [r * 0.95, -r * 1.5, 1], [-r * 0.7, -r * 1.75, 2], [r * 0.8, -r * 0.7, 3]].map(([dx, dy, i]) =>
          <span key={i} className={`neon-node pl-puff is-${i}`} style={{ left:dx, top:dy }}>
            <Neon box={[-40, -40, 80, 80]} tubes={[{ d:`${circlePath(-10, 4, 13)}${circlePath(12, -6, 10)}${circlePath(6, 14, 8)}`,
              tone:"bone", w:W * 0.4 }]} />
          </span>)}
      </NeonChip>
      <HouseHand className="pl-hand" x={wrist.x} y={wrist.y} angle={angle} scale={scale} poses="grip"
        hold={{ grip:<Rag /> }} />
    </div>
  );
}
