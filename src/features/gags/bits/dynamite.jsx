import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Alarm, Burst, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE, ellipsePath, starPath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./dynamite.css";

const DY = bitById("dynamite").beats;
const W = TUBE.w;

/* dynamite (loss, songless): the chip stands humming to itself; beside
   it a bundle of neon dynamite, its fuse fizzing down. It glances over,
   looks away (nothing there), then the double take, too late: BOOM (a
   white frame, the big shake). Smoke rings roll out, the smoke clears:
   the chip still standing, blackened, its rim stuttering like a dying
   tube, smoke curling off its top. A beat. A little puff of smoke. It
   topples flat on its face.

   World x: the chip at 860, the bundle's foot at 1130, the fuse curling
   off its top to the right. */
export const DY_STAGE = Object.freeze({ chip:860, stick:1130, floor:930, size:240, top:-196 });

/* the fuse: a curl off the bundle's top, burning back down it */
const FUSE = [[0, -196], [4, -228], [20, -258], [48, -278], [82, -278], [108, -258], [118, -226]];
export const fuseSegments = () => FUSE.slice(1).map((p, i) => ({ d:`M${FUSE[i][0]} ${FUSE[i][1]}L${p[0]} ${p[1]}`, n:i + 1 }));

/* the bundle: three sticks and a band, feet on the floor */
const STICKS = [-46, 0, 46].map(x => `M${x - 22} 0L${x - 22} -180C${x - 22} -192 ${x + 22} -192 ${x + 22} -180L${x + 22} 0Z`).join("");
const STICK_TOPS = [-46, 0, 46].map(x => ellipsePath(x, -182, 22, 7)).join("");
function Bundle() {
  return <Neon box={[-90, -300, 240, 316]} fills={[{ d:STICKS }]} tubes={[
    { d:STICKS, tone:"clay", w:W * 0.7 },
    { d:STICK_TOPS, tone:"clay", w:W * 0.45 },
    { d:"M-72 -132L72 -132M-72 -112L72 -112", tone:"bone", w:W * 0.55 },
    ...fuseSegments().map(seg => ({ d:seg.d, tone:"bone", w:W * 0.45, g:`f${seg.n}` })),
  ]} />;
}
/* the spark at the fuse's end */
const Fizz = () => <span className="neon-node dy-fizz"><Burst n={8} r0={7} r1={26} tone="amber" /><Burst n={6} r0={4} r1={16} turn={22} tone="bone" /></span>;

/* the blast: a jagged flash and its spokes. Anchor: its middle */
const Blast = () => <Neon box={[-380, -380, 760, 760]} fills={[{ d:starPath(12, 300, 160) }]} tubes={[
  { d:starPath(12, 300, 160), tone:"ember", w:W * 0.9 },
  { d:starPath(10, 190, 100, 0, 0, -72), tone:"amber", w:W * 0.8 },
  { d:starPath(8, 96, 52, 0, 0, -60), tone:"bone", w:W * 0.7 },
]} />;
const SMOKE = "M-58 0C-80 0 -82 -30 -58 -34C-56 -60 -22 -66 -10 -46C2 -68 38 -62 40 -38C62 -42 72 -10 52 0Z";
const Smoke = ({ scale = 1 }) => <Neon box={[-90, -80, 180, 90]} scale={scale} fills={[{ d:SMOKE }]} tubes={[{ d:SMOKE, tone:"bone", w:W * 0.45 }]} />;

export function Dynamite({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { chip, stick, floor, size } = DY_STAGE;
  const r = size / 2;
  const end = FUSE[FUSE.length - 1];
  /* the spark's path, end to foot, one stop per joint */
  const path = Object.fromEntries([...FUSE].reverse().map(([x, y], i) => [`--dy-p${i}`, `translate(${x - end[0]}px, ${y - end[1]}px)`]));
  return (
    <div className="dy" style={path}>
      <span className="neon-node dy-bundle" style={{ left:stick, top:floor }}>
        <Bundle />
        <span className="neon-node dy-spark" style={{ left:end[0], top:end[1] }}><Fizz /></span>
      </span>
      <NeonChip player={player} x={chip} y={floor} className="dy-chip"
        wear={<>
          <span className="dy-soot" style={{ left:-r * 0.95, top:-r * 0.95, width:r * 1.9, height:r * 1.9 }} />
          <span className="dy-rimout" style={{ left:-r * 0.96, top:-r * 0.96, width:r * 1.92, height:r * 1.92 }} />
          <span className="neon-node dy-alarm"><Alarm r={r} /></span>
          <span className="neon-node dy-sweat" style={{ left:-r * 0.66, top:-r * 0.62 }}><SweatDrop scale={1} /></span>
          {[[-30, 0], [26, 1]].map(([dx, i]) => <span key={i} className={`neon-node dy-wisp is-${i}`} style={{ left:dx, top:-r - 6 }}>
            <Neon box={[-30, -110, 60, 120]} tubes={[{ d:"M0 0C-16 -16 16 -30 0 -48C-16 -64 14 -80 0 -96", tone:"bone", w:W * 0.4 }]} />
          </span>)}
          <span className="neon-node dy-cough" style={{ top:-r - 10 }}><Neon box={[-60, -40, 120, 80]}
            tubes={[{ d:ellipsePath(0, 0, 34, 16), tone:"bone", w:W * 0.5 }]} /></span>
        </>} />
      {/* the blast and its smoke */}
      <span className="neon-node dy-blast" style={{ left:stick, top:floor - 110 }}><Blast /></span>
      {[0, 1, 2].map(i => <span key={i} className={`neon-node dy-ring is-${i}`} style={{ left:stick - 40, top:floor - 120 }}>
        <Neon box={[-200, -90, 400, 180]} tubes={[{ d:ellipsePath(0, 0, 120, 44), tone:"bone", w:W * 0.45 }]} />
      </span>)}
      {[[-110, -30, 1.6], [40, -10, 1.9], [160, -60, 1.4], [-30, -150, 1.5]].map(([dx, dy, s], i) =>
        <span key={i} className={`neon-node dy-smoke is-${i}`} style={{ left:chip + 120 + dx, top:floor + dy }}><Smoke scale={s} /></span>)}
      <span className="neon-node dy-landpuff" style={{ left:chip, top:floor }}>
        <Neon box={[-240, -40, 480, 80]} tubes={[{ d:ellipsePath(0, 0, 190, 22), tone:"bone", w:W * 0.4 }]} />
      </span>
    </div>
  );
}
