import React from "react";
import { Neon } from "./Neon.jsx";
import { TUBE, arcPath, circlePath, ellipsePath, spokesPath, starPath } from "./neonArt.js";

/* The bits' props, each a neon drawing hung off a node of no size: its
   anchor (named per prop) sits on that node, so a scene places the node
   and animates it. `scale` resizes a prop, tubes and glow together. Props
   come to the chip: the chips have no hands. */

const W = TUBE.w;

/* ── a tumbleweed: a scribbled ball of brush. Anchor: its middle. ── */
export function Tumbleweed({ scale = 1, className = "" }) {
  return <Neon box={[-70, -70, 140, 140]} scale={scale} className={className} tubes={[
    { d:circlePath(0, 0, 54), tone:"ember", w:W * 0.8 },
    { d:"M-40 -20C-10 -50 30 -40 36 -6C42 30 2 46 -24 30C-48 14 -30 -18 0 -14C26 -10 22 22 0 20", tone:"ember", w:W * 0.6 },
    { d:"M-46 18C-20 40 30 36 44 12M-20 -46C-30 -10 10 10 30 -40", tone:"ember", w:W * 0.5 },
  ]} />;
}

/* ── a stack of chips, side on, in the chips' amber: `count` chips of
   `thick` px. Anchor: the middle of its foot on the floor. ── */
export function NeonStack({ count = 10, width = 150, thick = 18, tone = "amber", top = "amber", scale = 1, className = "" }) {
  const h = count * thick, hw = width / 2;
  const tubes = [
    { d:`M${-hw} 0L${-hw} ${-h}M${hw} 0L${hw} ${-h}M${-hw} 0L${hw} 0`, tone, w:W * 0.7 },
    { d:Array.from({ length:count - 1 }, (_, i) => `M${-hw} ${-(i + 1) * thick}L${hw} ${-(i + 1) * thick}`).join(""), tone, w:W * 0.42 },
    /* the edge spots on every chip */
    { d:Array.from({ length:count }, (_, i) => [-0.55, 0, 0.55].map(f => `M${f * hw - 5} ${-(i + 0.5) * thick}L${f * hw + 5} ${-(i + 0.5) * thick}`).join("")).join(""),
      tone, w:W * 0.42, g:"spots" },
    { d:ellipsePath(0, -h, hw, thick * 0.55), tone:top, w:W * 0.7, g:"top" },
  ];
  return <Neon box={[-hw - 12, -h - thick - 12, width + 24, h + thick + 24]} scale={scale} className={className} tubes={tubes}
    fills={[{ d:`M${-hw} 0L${-hw} ${-h}A${hw} ${thick * 0.55} 0 0 1 ${hw} ${-h}L${hw} 0Z` }]} />;
}

/* one loose chip, side on (a stack's chip in flight). Anchor: its middle. */
export function LooseChip({ width = 150, thick = 18, tone = "amber", scale = 1, className = "" }) {
  const hw = width / 2, ht = thick / 2;
  return <Neon box={[-hw - 10, -ht - 10, width + 20, thick + 20]} scale={scale} className={className}
    fills={[{ d:`M${-hw} ${-ht}L${hw} ${-ht}L${hw} ${ht}L${-hw} ${ht}Z` }]}
    tubes={[{ d:`M${-hw} ${-ht}L${hw} ${-ht}L${hw} ${ht}L${-hw} ${ht}Z`, tone, w:W * 0.6 },
      { d:[-0.55, 0, 0.55].map(f => `M${f * hw - 5} 0L${f * hw + 5} 0`).join(""), tone, w:W * 0.42 }]} />;
}

/* ── an anvil, cold iron in bone. Anchor: the middle of its foot. ── */
export const ANVIL = Object.freeze({ w:300, h:150 });
export function NeonAnvil({ scale = 1, className = "" }) {
  const body = `M-150 -150L104 -150C128 -150 146 -142 150 -130L150 -120C116 -120 96 -112 74 -96L60 -84L60 -40L96 -12L96 0L-96 0
    L-96 -12L-60 -40L-60 -84C-90 -100 -122 -112 -150 -116Z`;
  return <Neon box={[-170, -170, 340, 186]} scale={scale} className={className} fills={[{ d:body }]} tubes={[
    { d:body, tone:"bone", w:W * 0.85 },
    { d:"M-130 -136L120 -136", tone:"cyan", w:W * 0.42, g:"shine" },
    { d:"M-44 -60L44 -60", tone:"bone", w:W * 0.45 },
  ]} />;
}

/* ── where something is about to land: a ring on the floor with its
   cross, flat in perspective. Anchor: its middle. ── */
export function Target({ rx = 200, ry = 30, tone = "clay", scale = 1, className = "" }) {
  return <Neon box={[-rx - 20, -ry - 20, rx * 2 + 40, ry * 2 + 40]} scale={scale} className={className} tubes={[
    { d:ellipsePath(0, 0, rx, ry), tone, w:W * 0.6 },
    { d:ellipsePath(0, 0, rx * 0.5, ry * 0.5), tone, w:W * 0.45, g:"in" },
    { d:`M${-rx * 0.22} ${-ry * 0.22}L${rx * 0.22} ${ry * 0.22}M${rx * 0.22} ${-ry * 0.22}L${-rx * 0.22} ${ry * 0.22}`, tone, w:W * 0.45, g:"in" },
  ]} />;
}

/* ── stars: one five-point star. Anchor: its middle. ── */
export function NeonStar({ r = 26, tone = "amber", scale = 1, className = "" }) {
  return <Neon box={[-r - 10, -r - 10, r * 2 + 20, r * 2 + 20]} scale={scale} className={className}
    tubes={[{ d:starPath(5, r, r * 0.45), tone, w:W * 0.55 }]} />;
}
/* stars going round a head: `count` on an ellipse rx by ry, each a node
   (.neon-orbit > .neon-orbit-x > .neon-orbit-y) the scene's CSS spins */
export function DizzyStars({ count = 3, rx = 130, ry = 26, r = 22, tone = "amber", className = "" }) {
  return <span className={`neon-node neon-dizzy${className ? ` ${className}` : ""}`} style={{ "--rx":`${rx}px`, "--ry":`${ry}px` }}>
    {Array.from({ length:count }, (_, i) => <span key={i} className="neon-node neon-orbit" style={{ "--k":i, "--n":count }}>
      <span className="neon-node neon-orbit-x"><span className="neon-node neon-orbit-y"><NeonStar r={r} tone={tone} /></span></span>
    </span>)}
  </span>;
}

/* ── a sweat drop. Anchor: its tip. ── */
export function SweatDrop({ scale = 1, className = "" }) {
  const d = "M0 0C10 18 18 30 18 40C18 52 10 60 0 60C-10 60 -18 52 -18 40C-18 30 -10 18 0 0Z";
  return <Neon box={[-30, -10, 60, 80]} scale={scale} className={className} fills={[{ d }]} tubes={[{ d, tone:"cyan", w:W * 0.55 }]} />;
}

/* ── a burst: an impact's spokes. Anchor: its middle. ── */
export function Burst({ n = 10, r0 = 50, r1 = 110, tone = "amber", turn = 0, scale = 1, className = "" }) {
  return <Neon box={[-r1 - 12, -r1 - 12, r1 * 2 + 24, r1 * 2 + 24]} scale={scale} className={className}
    tubes={[{ d:spokesPath(n, r0, r1, 0, 0, turn), tone, w:W * 0.6 }]} />;
}
/* ── speed lines, trailing to the left of the node ── */
export function SpeedLines({ length = 360, rows = [[-60, 1], [-20, 0.7], [20, 1], [60, 0.6]], tone = "bone", scale = 1, className = "" }) {
  return <Neon box={[-length - 10, -90, length + 20, 180]} scale={scale} className={className}
    tubes={rows.map(([y, f]) => ({ d:`M${-length * f} ${y}L0 ${y}`, tone, w:W * 0.45 }))} />;
}
/* ── a ricochet's spark: a small star of spokes. Anchor: its middle. ── */
export const Spark = ({ scale = 1, tone = "bone", className = "" }) =>
  <Burst n={8} r0={14} r1={46} tone={tone} scale={scale} className={className} />;

/* ── headphones, oversized, sized to a chip of radius `r`: the band over
   its top and a cup on each side. Anchor: the chip's middle. The cups'
   lights are group "cups", the band "band". ── */
export function Headphones({ r = 120, scale = 1, className = "" }) {
  const cx = r + 12, cupW = 46, cupH = r * 0.95, band = r + 34;
  const cup = side => {
    const x = side * cx;
    return `M${x - cupW / 2} ${-cupH / 2 + 18}C${x - cupW / 2} ${-cupH / 2} ${x + cupW / 2} ${-cupH / 2} ${x + cupW / 2} ${-cupH / 2 + 18}`
      + `L${x + cupW / 2} ${cupH / 2 - 18}C${x + cupW / 2} ${cupH / 2} ${x - cupW / 2} ${cupH / 2} ${x - cupW / 2} ${cupH / 2 - 18}Z`;
  };
  const pad = side => `M${side * (cx - cupW / 2 - 8)} ${-cupH / 2 + 22}L${side * (cx - cupW / 2 - 8)} ${cupH / 2 - 22}`;
  return <Neon box={[-cx - 50, -band - 30, (cx + 50) * 2, band + cupH / 2 + 50]} scale={scale} className={className}
    fills={[{ d:cup(-1) }, { d:cup(1) }]} tubes={[
      { d:arcPath(0, 0, band, 196, 344), tone:"magenta", w:W * 0.9, g:"band" },
      { d:arcPath(0, 0, band - 14, 200, 340), tone:"magenta", w:W * 0.4, g:"band" },
      { d:`${cup(-1)}${cup(1)}`, tone:"magenta", w:W * 0.8, g:"cups" },
      { d:`${pad(-1)}${pad(1)}`, tone:"amber", w:W * 0.7, g:"pads" },
      { d:`M${-cx} -14L${-cx} 14M${cx} -14L${cx} 14`, tone:"amber", w:W * 0.55, g:"lights" },
    ]} />;
}

/* ── a music note: an eighth (one) or a beamed pair (two). Anchor: the
   foot of its head. ── */
export function Note({ two = false, tone = "cyan", scale = 1, className = "" }) {
  const head = (x, y) => ellipsePath(x, y, 15, 11);
  const tubes = two
    ? [{ d:`${head(0, 0)}${head(52, -12)}`, tone, w:W * 0.6 }, { d:"M14 -2L14 -74M66 -14L66 -86M14 -74L66 -86M14 -60L66 -72", tone, w:W * 0.6 }]
    : [{ d:head(0, 0), tone, w:W * 0.6 }, { d:"M14 -2L14 -80C24 -66 42 -60 40 -36", tone, w:W * 0.6 }];
  return <Neon box={[-30, -100, 120, 130]} scale={scale} className={className} tubes={tubes} />;
}

/* ── an emanata's lines: a surprised (or alarmed) chip's three ticks.
   Anchor: the chip's middle; the ticks sit above its top. ── */
export function Alarm({ r = 120, tone = "bone", scale = 1, className = "" }) {
  const ticks = [-34, 0, 34].map(a => {
    const t = (a - 90) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return `M${Math.round(c * (r + 28))} ${Math.round(s * (r + 28))}L${Math.round(c * (r + 70))} ${Math.round(s * (r + 70))}`;
  }).join("");
  return <Neon box={[-r - 80, -r - 90, (r + 80) * 2, r + 90]} scale={scale} className={className} tubes={[{ d:ticks, tone, w:W * 0.6 }]} />;
}
