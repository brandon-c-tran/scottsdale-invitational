import React from "react";
import { HouseHand, NeonChip } from "../neon/Neon.jsx";
import { Headphones as HeadphonesArt, Note } from "../neon/NeonProps.jsx";
import { HAND_POSES } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./headphones.css";

const HP = bitById("headphones").beats;

/* headphones (win, music): the chip idles on the floor. The house hand
   comes down from above with a pair of oversized neon headphones held by
   the band and holds them just over it; the chip tips back to look. (The
   wind-up holds here, the hand jiggling them, until the speaker plays.)
   Click: the hand presses them on, the song starts on that click, the
   cups light, the hand lets go and goes, and the chip bobs to it, notes
   rising off the cups.

   World x: the chip at 960. The hand points down and a little across; the
   headphones hang from its fist (neonArt HAND_POSES.grip.at), drawn upright, and
   at the click the pair on the chip takes over from the pair in hand. */
const r1 = n => Math.round(n * 10) / 10;
/* the press runs straight down onto the chip: in the hand's turned frame */
export const HP_STAGE = Object.freeze({ x:960, floor:930, chip:240, scale:1.2, hover:70, angle:70 });

export function Headphones({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, scale, hover, angle } = HP_STAGE;
  const r = chip / 2;
  const center = floor - r;
  const band = r + 34;
  /* the fist holds the band's top, `hover` over where it will sit; the
     hand points down at `angle`, so its grip is `at` turned and scaled */
  const grip = HAND_POSES.grip.at, a = angle * Math.PI / 180;
  const turned = { x:(grip.x * Math.cos(a) - grip.y * Math.sin(a)) * scale, y:(grip.x * Math.sin(a) + grip.y * Math.cos(a)) * scale };
  const wrist = { x:Math.round(x - turned.x), y:Math.round(center - hover - band - turned.y) };
  const held = (
    <span className="neon-node" style={{ transform:`rotate(${-angle}deg) scale(${Math.round(1000 / scale) / 1000}) translate(0px, ${band}px)` }}>
      <HeadphonesArt r={r} />
    </span>
  );
  return (
    <div className="hp" style={{ "--hp-press":`translate(${r1(hover * Math.sin(a) / scale)}px, ${r1(hover * Math.cos(a) / scale)}px)` }}>
      <NeonChip player={player} x={x} y={floor} className="hp-chip"
        wear={<span className="neon-node hp-cans"><HeadphonesArt r={r} /></span>}>
        {/* the notes rise off the cups once the music is on */}
        {[[-r - 46, 0], [r + 30, 1], [-r - 24, 2], [r + 52, 3]].map(([dx, i]) =>
          <span key={i} className={`neon-node hp-note is-${i}`} style={{ left:dx, top:-r - 20 }}>
            <Note two={i % 2 === 1} scale={0.85} tone={i % 2 ? "amber" : "cyan"} /></span>)}
      </NeonChip>
      <HouseHand className="hp-hand bit-hold-loop" x={wrist.x} y={wrist.y} angle={angle} scale={scale}
        poses={[["grip", 0], ["flat", HP.click]]} hold={{ grip:held }} />
    </div>
  );
}
