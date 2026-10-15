import React from "react";
import { Neon, NeonChip, Swaps } from "../neon/Neon.jsx";
import { Alarm } from "../neon/NeonProps.jsx";
import { TUBE, ellipsePath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./statue.css";

const ST = bitById("statue").beats;

/* statue (win, punchline): the chip stands on the floor. A seam lights
   in the floor under it; it looks down. Ka-chunk, ka-chunk, ka-chunk: a
   marble plinth comes up out of the floor in three cuts, like a sign's
   frames, the chip riding up on it, startled. At the top it looks round,
   lost. Then a spotlight up in the rig at the right clunks on and finds
   it (the song comes in here): the chip strikes a pose, chin up, turned
   three quarters to the room, and sparkles go off round it.

   World x: the chip and the plinth at 1100, the lamp straight over it at y 310. */
export const ST_STAGE = Object.freeze({ x:1100, floor:930, chip:240, H:270, cuts:[90, 180, 270], lamp:{ y:310 } });

const r1 = n => Math.round(n * 10) / 10;
const rect = (x0, y0, x1, y1) => `M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`;

/* The plinth `h` tall out of the floor (the rest still under it): a
   base slab, a fluted shaft with a blank brass plaque, a cap. Each part
   is cut at the floor. Anchor: the middle of its foot on the floor. */
const PARTS = Object.freeze([
  { x:172, y0:0, y1:24 },
  { x:148, y0:24, y1:46 },
  { x:116, y0:46, y1:222, flutes:true },
  { x:140, y0:222, y1:244 },
  { x:166, y0:244, y1:270 },
]);
function Plinth({ h }) {
  const { H } = ST_STAGE, sink = H - h;
  const tubes = [], fills = [];
  for (const part of PARTS) {
    const top = part.y1 - sink, bot = Math.max(0, part.y0 - sink);
    if (top <= 0) continue;
    /* cut at the floor: no bottom edge there, it runs on under it */
    const cut = part.y0 - sink < 0;
    fills.push({ d:rect(-part.x, -top, part.x, -bot) });
    tubes.push({ d:cut ? `M${-part.x} ${-bot}L${-part.x} ${-top}L${part.x} ${-top}L${part.x} ${-bot}` : rect(-part.x, -top, part.x, -bot),
      tone:"bone", w:TUBE.w * 0.8 });
    if (part.flutes) {
      tubes.push({ d:[-76, -38, 38, 76].map(fx => `M${fx} ${-Math.min(top - 12, top)}L${fx} ${-Math.max(bot + 12, 0)}`).join(""),
        tone:"bone", w:TUBE.fine });
      /* the plaque, blank brass, mid shaft */
      const py = 150 - sink;
      if (py - 22 > 0) tubes.push({ d:rect(-34, -py - 22, 34, -py + 22), tone:"amber", w:TUBE.thin, g:"plaque" });
    }
  }
  return <Neon box={[-190, -290, 380, 300]} fills={fills} tubes={tubes} />;
}
/* the seam in the floor before it comes up: the cap's outline, flat */
function Seam() {
  return <Neon box={[-190, -30, 380, 50]} tubes={[{ d:ellipsePath(0, 0, 165, 14), tone:"amber", w:TUBE.thin, g:"lit" }]} />;
}
/* the spotlight: a can hung in the rig, pointing straight down, its rod
   up out of the shot. Anchor: the can's pivot. Its lens is group "lens". */
function Lamp() {
  const can = rect(-74, -36, 36, 36);
  return <>
    <Neon box={[-20, -700, 40, 640]} tubes={[{ d:"M0 -700L0 -74", tone:"cyan", w:TUBE.thin }]} />
    <span className="neon-node" style={{ transform:"rotate(90deg)" }}>
      <Neon box={[-90, -70, 160, 140]} fills={[{ d:can }, { d:rect(36, -46, 54, 46) }]} tubes={[
        { d:can, tone:"cyan", w:TUBE.w * 0.8 },
        { d:"M-50 -36L-50 36M-26 -36L-26 36", tone:"cyan", w:TUBE.fine },
        { d:rect(36, -46, 54, 46), tone:"cyan", w:TUBE.w * 0.7 },
        { d:"M54 -38L54 38", tone:"bone", w:TUBE.w, g:"lens", glass:true },
      ]} />
    </span>
  </>;
}
/* the beam: a cone from the lens down to the plinth's top. Anchor:
   the lens. */
function Beam({ drop, half, spread }) {
  const cone = `M${-half} 0L${-spread} ${drop}L${spread} ${drop}L${half} 0Z`;
  return <Neon box={[-spread - 20, -20, spread * 2 + 40, drop + 40]} fills={[{ d:cone, fill:"color-mix(in srgb, var(--neon-bone) 20%, transparent)" }]}
    tubes={[{ d:`M${-half} 0L${-spread} ${drop}M${half} 0L${spread} ${drop}`, tone:"bone", w:TUBE.fine }]} />;
}
/* a four-point sparkle. Anchor: its middle. */
function Sparkle({ s = 26, tone = "amber" }) {
  const k = s * 0.22;
  const d = `M0 ${-s}L${k} ${-k}L${s} 0L${k} ${k}L0 ${s}L${-k} ${k}L${-s} 0L${-k} ${-k}Z`;
  return <Neon box={[-s - 10, -s - 10, s * 2 + 20, s * 2 + 20]} tubes={[{ d, tone, w:TUBE.thin }]} />;
}

export function Statue({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, chip, H, cuts, lamp } = ST_STAGE;
  const r = chip / 2, top = floor - H, lens = lamp.y + 56;
  const style = { "--st-1":`translateY(${-cuts[0]}px)`, "--st-2":`translateY(${-cuts[1]}px)`, "--st-3":`translateY(${-cuts[2]}px)` };
  return (
    <div className="stt" style={style}>
      <span className="neon-node stt-plinth" style={{ left:x, top:floor }}>
        <Swaps layers={[[<span className="neon-node stt-seam"><Seam /></span>, 0], [<Plinth h={cuts[0]} />, ST.rise1],
          [<Plinth h={cuts[1]} />, ST.rise2], [<Plinth h={cuts[2]} />, ST.rise3]]} />
      </span>
      <span className="neon-node stt-beam" style={{ left:x, top:lens }}><Beam drop={top - lens} half={38} spread={176} /></span>
      <span className="neon-node stt-spot" style={{ left:x, top }}>
        <Neon box={[-200, -40, 400, 80]} fills={[{ d:ellipsePath(0, 0, 176, 20), fill:"color-mix(in srgb, var(--neon-bone) 24%, transparent)" }]}
          tubes={[{ d:ellipsePath(0, 0, 176, 20), tone:"bone", w:TUBE.fine }]} />
      </span>
      <NeonChip player={player} x={x} y={floor} className="stt-chip"
        wear={<span className="neon-node stt-alarm"><Alarm r={r} /></span>}>
        {[[-r - 80, -r - 30, 40, "amber"], [r + 74, -r - 96, 30, "bone"], [r + 46, -r * 2 + 6, 44, "amber"], [-r - 36, -r * 2 - 4, 28, "bone"],
          [r + 104, -r + 44, 26, "amber"], [-r - 110, -r + 70, 24, "bone"]].map(([sx, sy, s, tone], i) =>
          <span key={i} className={`neon-node stt-sparkle is-${i}`} style={{ left:sx, top:sy }}><Sparkle s={s} tone={tone} /></span>)}
      </NeonChip>
      <span className="neon-node stt-lamp" style={{ left:x, top:lamp.y }}><Lamp /></span>
    </div>
  );
}
