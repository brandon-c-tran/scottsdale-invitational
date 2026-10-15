import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { TUBE, arcPath } from "../neon/neonArt.js";
import "./sunset.css";

/* sunset (win, punchline): a big neon sunset sign on the horizon, its
   tubes dark glass. The chip rolls in on its edge from the left, rolls a
   touch past its mark (a tape X on the floor in front of the sun), rolls
   back onto it and settles. One deliberate hop onto the mark: the sun's
   bands light bottom to top, the disc comes on full (the song comes in
   here) and its rays ignite one after another across the sky. It ends
   on the chip standing on its mark in front of the lit sun.

   World x: the sun's middle and the mark at 1000; the chip starts off
   the left edge. */
export const SN_STAGE = Object.freeze({ floor:930, chip:240, x:1000, from:-260, over:70, R:400, rays:9 });
/* the bands: heights over the horizon, bottom first, and their lamps */
const BANDS = Object.freeze([[36, "magenta"], [84, "magenta"], [140, "ember"], [204, "ember"], [276, "amber"]]);

const r1 = n => Math.round(n * 10) / 10;

function Sun() {
  const { R } = SN_STAGE;
  const chord = h => { const w = Math.sqrt(R * R - h * h); return `M${r1(-w + 10)} ${-h}L${r1(w - 10)} ${-h}`; };
  const disc = `M${-R} 0A${R} ${R} 0 0 1 ${R} 0Z`;
  return <Neon box={[-R - 30, -R - 30, R * 2 + 60, R + 40]} fills={[{ d:disc }]} tubes={[
    ...BANDS.map(([h, tone], i) => ({ d:chord(h), tone, w:TUBE.w * (1.25 - i * 0.08), g:`b${i}`, glass:true })),
    { d:arcPath(0, 0, R, 180, 360), tone:"amber", w:TUBE.w * 1.1, g:"rim", glass:true },
    { d:arcPath(0, 0, R - 22, 200, 340), tone:"amber", w:TUBE.fine, g:"rim", glass:true },
  ]} />;
}
/* the warm light inside the disc once it is on */
function Glow() {
  const { R } = SN_STAGE;
  return <Neon box={[-R, -R, R * 2, R]} fills={[{ d:`M${-R} 0A${R} ${R} 0 0 1 ${R} 0Z`,
    fill:"color-mix(in srgb, var(--neon-ember) 20%, transparent)" }]} />;
}
/* one ray, pointing out at `deg` (180 is the left horizon, 270 straight up) */
function Ray({ deg }) {
  const { R } = SN_STAGE, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const r0 = R + 44, r2 = R + 128 - Math.abs(deg - 270) * 0.3;
  return <Neon box={[-R - 220, -R - 220, R * 2 + 440, R + 240]} tubes={[
    { d:`M${r1(c * r0)} ${r1(s * r0)}L${r1(c * r2)} ${r1(s * r2)}`, tone:"amber", w:TUBE.w * 0.8, g:"lit", glass:true }]} />;
}
/* the mark: a tape X on the floor, flat in perspective. Anchor: its middle. */
function Mark() {
  const d = "M-46 -12L46 12M46 -12L-46 12";
  return <Neon box={[-60, -24, 120, 48]} tubes={[{ d, tone:"bone", w:TUBE.thin, g:"lit" }]} />;
}
/* the horizon's line, lit across the sun's foot once it is on */
function Horizon() {
  const { R } = SN_STAGE;
  return <Neon box={[-R - 260, -12, R * 2 + 520, 24]} tubes={[{ d:`M${-R - 240} 0L${R + 240} 0`, tone:"ember", w:TUBE.thin }]} />;
}

export function Sunset({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { floor, x, from, over, rays } = SN_STAGE;
  const style = { "--sn-from":`translateX(${from - x}px)`, "--sn-over":`translateX(${over}px)` };
  return (
    <div className="sns" style={style}>
      {/* the sky warms behind the sun once it is on */}
      <span className="sns-sky" style={{ left:x - 1000, top:floor - 760, width:2000, height:760 }} />
      <span className="neon-node sns-sun" style={{ left:x, top:floor }}><Sun /></span>
      <span className="neon-node sns-glow" style={{ left:x, top:floor }}><Glow /></span>
      {Array.from({ length:rays }, (_, i) => <span key={i} className="neon-node sns-ray" style={{ left:x, top:floor, "--i":i }}>
        <Ray deg={190 + i * 160 / (rays - 1)} /></span>)}
      <span className="neon-node sns-horizon" style={{ left:x, top:floor }}><Horizon /></span>
      <span className="neon-node sns-mark" style={{ left:x, top:floor + 14 }}><Mark /></span>
      <NeonChip player={player} x={x} y={floor} className="sns-chip" />
    </div>
  );
}
