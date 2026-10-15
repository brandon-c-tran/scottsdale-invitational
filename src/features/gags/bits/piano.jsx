import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Alarm, Note } from "../neon/NeonProps.jsx";
import { TUBE, ellipsePath } from "../neon/neonArt.js";
import "./piano.css";

/* saloon piano (win, music): a neon upright, its wood in ember, a mug of
   beer on its lid. The chip hops over from the left, crouches and leaps
   for the keys; at the top of the leap it hangs in the air, cartoon style
   (the wind-up holds here, the chip treading air). Land: it slams down on
   the keys, the first chord lights magenta under it, the song starts, the
   mug jumps; then it hops along the keyboard on the beat, right and back,
   each landing lighting the keys under it, notes rising off the lid.

   World: the piano from 720 to 1360, its lid at 430, its keys' top 592 to
   640 (sixteen white keys, 752 to 1328); the chip ends at 940, its foot on the keys at 624, drawn behind
   them so the keyboard's lip hides its edge. */
export const PN_STAGE = Object.freeze({ x:960, floor:930, x0:720, x1:1360, lid:430, keyBack:592, keyFront:640, k0:752, keyW:36, keys:16,
  /* where it lands on each beat, from the first chord on */
  landings:Object.freeze([820, 940, 1060, 1180, 1060, 940]) });

const W = TUBE.w;
const BLACK = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14];

/* the piano's case, its legs, its desk, in world units */
function Case() {
  const { x0, x1, lid, keyBack, keyFront, floor } = PN_STAGE;
  const body = `M${x0 + 8} ${lid + 16}L${x1 - 8} ${lid + 16}L${x1 - 8} ${keyBack - 14}L${x0 + 8} ${keyBack - 14}Z`;
  const lidD = `M${x0 - 16} ${lid}L${x1 + 16} ${lid}L${x1 + 16} ${lid + 16}L${x0 - 16} ${lid + 16}Z`;
  const cheeks = [[x0 + 8, x0 + 32], [x1 - 32, x1 - 8]].map(([a, b]) =>
    `M${a} ${keyBack - 14}L${b - 6} ${keyBack - 14}Q${b} ${keyBack - 14} ${b} ${keyBack - 8}L${b} ${keyFront + 18}L${a} ${keyFront + 18}Z`).join("");
  const rail = `M${x0 + 8} ${keyFront + 18}L${x1 - 8} ${keyFront + 18}L${x1 - 8} ${keyFront + 42}L${x0 + 8} ${keyFront + 42}Z`;
  const panel = `M${x0 + 70} ${keyFront + 66}L${x1 - 70} ${keyFront + 66}L${x1 - 70} ${floor - 66}L${x0 + 70} ${floor - 66}Z`;
  const leg = side => {
    const lx = side < 0 ? x0 + 28 : x1 - 28, s = side;
    return `M${lx} ${keyFront + 42}C${lx - s * 34} ${keyFront + 90} ${lx + s * 30} ${keyFront + 130} ${lx} ${keyFront + 170}L${lx} ${floor - 30}`
      + `M${lx - 20} ${floor - 30}L${lx + 20} ${floor - 30}L${lx + 20} ${floor}L${lx - 20} ${floor}Z`;
  };
  const sheet = "M900 462L1020 462L1020 548L900 548Z";
  const staff = [0, 1, 2, 3, 4].map(i => `M912 ${484 + i * 9}L1008 ${484 + i * 9}`).join("")
    + [0, 1, 2, 3, 4].map(i => `M912 ${520 + i * 5}L1008 ${520 + i * 5}`).join("");
  return <Neon box={[x0 - 40, lid - 30, x1 - x0 + 80, floor - lid + 50]}
    fills={[{ d:lidD }, { d:body }, { d:cheeks }, { d:rail }, { d:`M${x0 + 8} ${keyFront + 42}L${x1 - 8} ${keyFront + 42}L${x1 - 8} ${floor}L${x0 + 8} ${floor}Z` }]}
    tubes={[
      { d:lidD, tone:"ember", w:W * 0.8 },
      { d:body, tone:"ember", w:W * 0.8 },
      { d:`${ellipsePath(800, 512, 64, 38)}${ellipsePath(1120, 512, 64, 38)}`, tone:"magenta", w:W * 0.5 },
      { d:"M840 556L1080 556", tone:"ember", w:W * 0.6 },
      { d:sheet, tone:"bone", w:W * 0.45 },
      { d:staff, tone:"bone", w:W * 0.2 },
      { d:cheeks, tone:"ember", w:W * 0.7 },
      { d:rail, tone:"ember", w:W * 0.7 },
      { d:panel, tone:"ember", w:W * 0.45 },
      { d:`${leg(-1)}${leg(1)}`, tone:"ember", w:W * 0.75 },
      { d:"M1000 916L1022 916M1052 916L1074 916", tone:"amber", w:W * 0.8 },
    ]} />;
}

/* the keyboard: the white keys' tops and fronts, the black keys over them */
function Keys() {
  const { keyBack, keyFront, k0, keyW, keys } = PN_STAGE;
  const whites = Array.from({ length:keys }, (_, i) => {
    const a = k0 + i * keyW + 1.5, b = k0 + (i + 1) * keyW - 1.5;
    return `M${a} ${keyBack}L${b} ${keyBack}L${b} ${keyFront + 14}L${a} ${keyFront + 14}Z`;
  }).join("");
  const blacks = BLACK.map(i => {
    const c = k0 + (i + 1) * keyW;
    return `M${c - 11} ${keyBack - 2}L${c + 11} ${keyBack - 2}L${c + 11} ${keyBack + 24}L${c - 11} ${keyBack + 24}Z`;
  }).join("");
  return <Neon box={[k0 - 20, keyBack - 20, keys * keyW + 40, keyFront - keyBack + 50]} fills={[{ d:blacks, fill:"#03040a" }]} tubes={[
    { d:whites, tone:"bone", w:W * 0.4 },
    { d:`M${k0} ${keyFront}L${k0 + keys * keyW} ${keyFront}`, tone:"bone", w:W * 0.3 },
    { d:blacks, tone:"bone", w:W * 0.28 },
  ]} />;
}

/* the keys lit under a landing at `cx` */
function Lit({ cx, wide = false }) {
  const { keyBack, keyFront, k0, keyW, keys } = PN_STAGE;
  const reach = wide ? 100 : 76;
  const lit = Array.from({ length:keys }, (_, i) => i).filter(i => Math.abs(k0 + (i + 0.5) * keyW - cx) <= reach);
  const d = lit.map(i => {
    const a = k0 + i * keyW + 3, b = k0 + (i + 1) * keyW - 3;
    return `M${a} ${keyBack + 26}L${b} ${keyBack + 26}L${b} ${keyFront + 12}L${a} ${keyFront + 12}Z`;
  }).join("");
  return <Neon box={[k0 - 20, keyBack - 20, keys * keyW + 40, keyFront - keyBack + 50]}
    fills={[{ d, fill:"color-mix(in srgb, var(--neon-magenta) 55%, transparent)" }]} tubes={[{ d, tone:"magenta", w:W * 0.5 }]} />;
}

/* a mug of beer, its foot's middle on the node */
function Mug() {
  const body = "M-26 0L-26 -64L26 -64L26 0Z";
  return <Neon box={[-50, -100, 110, 110]} fills={[{ d:body }]} tubes={[
    { d:body, tone:"amber", w:W * 0.7 },
    { d:"M26 -50C50 -50 50 -14 26 -14", tone:"amber", w:W * 0.6 },
    { d:"M-30 -64C-34 -80 -16 -84 -10 -74C-4 -88 14 -86 16 -74C24 -82 36 -74 30 -64", tone:"bone", w:W * 0.55 },
    { d:"M-12 -48L-12 -14M6 -48L6 -14", tone:"amber", w:W * 0.3 },
  ]} />;
}

export function Piano({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, lid, landings } = PN_STAGE;
  return (
    <div className="pn">
      <span className="neon-node" style={{ left:0, top:0 }}><Case /></span>
      {/* the chip, then the keys over its foot: once it lands it stands on them */}
      <span className="neon-node pn-float bit-hold-loop">
        <NeonChip player={player} x={x} y={floor} className="pn-chip"
          wear={<span className="neon-node pn-alarm"><Alarm r={120} /></span>} />
      </span>
      <span className="neon-node" style={{ left:0, top:0 }}><Keys /></span>
      {landings.map((cx, i) => <span key={i} className={`neon-node pn-lit is-${i}`} style={{ left:0, top:0, "--d":`${i * 480}ms` }}>
        <Lit cx={cx} wide={i === 0} /></span>)}
      <span className="neon-node pn-mug" style={{ left:1336, top:lid }}><Mug /></span>
      {/* notes rise off the lid */}
      {[[860, 0], [1020, 1], [1160, 2], [940, 3]].map(([nx, i]) =>
        <span key={i} className={`neon-node pn-note is-${i}`} style={{ left:nx, top:lid - 30 }}>
          <Note two={i % 2 === 1} scale={0.9} tone={i % 2 ? "amber" : "magenta"} /></span>)}
    </div>
  );
}
