import React from "react";
import { Neon, NeonChip, Swaps } from "../neon/Neon.jsx";
import { Spark, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE, ellipsePath, starPath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./vulture.css";

const VU = bitById("vulture").beats;
const W = TUBE.w;

/* vulture (loss, songless): the chip alone, glum. A neon vulture glides
   in and lands on a dead tree beside it. They look at each other. The
   chip scoots away; the vulture hops down after it. They look again; the
   chip scoots; the vulture hops. The vulture tucks in a napkin and brings
   up a knife and fork. Hold on the chip.

   World x: the chip from 900 (it scoots to 720, then 540); the tree at
   1330, the perch at 1240 (y 762); the vulture hops down to 990, then
   810. The bird faces left; its feet are its node. */
export const VU_STAGE = Object.freeze({ chip:[900, 720, 540], perch:{ x:1240, y:762 }, ground:[990, 810], floor:930, size:240 });

/* ── the bird: a black vulture in bone tubes, its bald head and neck in
   clay (a turkey vulture's), a bone ruff ── */
const BODY = "M-34 -70C-48 -120 -52 -180 -28 -214C-14 -232 12 -234 32 -222C72 -200 106 -150 114 -100C118 -72 98 -52 62 -48C24 -44 -14 -50 -34 -70Z";
const FOLD = "M-6 -206C34 -186 74 -146 96 -96M4 -164C34 -146 58 -120 72 -92M80 -64L120 -30M96 -78L136 -48";
const TAIL = "M86 -64L136 -14L116 -10L70 -48";
const RUFF = starPath(9, 30, 18, -40, -150, -90);
const NECK = "M-56 -162C-66 -166 -76 -166 -86 -164M-56 -138C-66 -140 -76 -144 -88 -148";
const HEAD = ellipsePath(-102, -156, 22, 17);
const BEAK = "M-122 -162C-142 -164 -154 -150 -148 -134C-144 -140 -136 -146 -124 -146";
const EYE = "M-106 -162L-104 -162";
const BROW = "M-118 -172L-94 -166";
const LEGS = "M-12 -50L-14 0M18 -48L22 0M-14 0L-34 2M-14 0L-28 7M-14 0L-2 3M22 0L2 2M22 0L8 7M22 0L34 3";
/* the head, separate so it can tilt about the neck's top */
const HEAD_AT = { x:-84, y:-152 };
function Head() {
  return <span className="neon-node" style={{ left:HEAD_AT.x, top:HEAD_AT.y }}>
    <span className="neon-node vu-head">
      <span className="neon-node" style={{ left:-HEAD_AT.x, top:-HEAD_AT.y }}>
        <Neon box={[-170, -200, 110, 90]} fills={[{ d:HEAD }]} tubes={[
          { d:HEAD, tone:"clay", w:W * 0.6 },
          { d:BEAK, tone:"bone", w:W * 0.6 },
          { d:EYE, tone:"bone", w:W * 0.9 },
          { d:BROW, tone:"bone", w:W * 0.45 },
        ]} />
      </span>
    </span>
  </span>;
}
const perchTubes = [
  { d:TAIL, tone:"bone", w:W * 0.55 },
  { d:BODY, tone:"bone", w:W * 0.75 },
  { d:FOLD, tone:"bone", w:W * 0.4 },
  { d:LEGS, tone:"ember", w:W * 0.5 },
  { d:NECK, tone:"clay", w:W * 0.7 },
  { d:RUFF, tone:"bone", w:W * 0.45 },
];
const BOX = [-260, -360, 520, 380];
function Perch({ children }) {
  return <span className="neon-node"><Neon box={BOX} tubes={perchTubes} fills={[{ d:BODY }, { d:RUFF }]} /><Head />{children}</span>;
}
/* wings up and out: landing, hopping */
const WING_BACK = "M30 -216C60 -270 100 -310 160 -330C150 -310 168 -304 158 -288C172 -282 166 -266 154 -260C164 -250 156 -236 142 -232L80 -190";
const WING_FRONT = "M0 -214C-10 -270 0 -330 40 -360C46 -338 64 -340 64 -320C80 -318 80 -300 70 -290C82 -284 78 -268 66 -262L50 -200";
function Land() {
  return <span className="neon-node"><Neon box={BOX} fills={[{ d:BODY }, { d:RUFF }, { d:`${WING_BACK}Z` }, { d:`${WING_FRONT}Z` }]} tubes={[
    { d:`${WING_BACK}Z`, tone:"bone", w:W * 0.6 },
    ...perchTubes,
    { d:`${WING_FRONT}Z`, tone:"bone", w:W * 0.65 },
    { d:"M30 -300L50 -286M26 -268L48 -258", tone:"bone", w:W * 0.35 },
  ]} /><Head /></span>;
}
/* gliding: wings spread wide, legs tucked */
const GLIDE_L = "M-24 -150C-84 -176 -150 -196 -212 -204L-236 -196L-220 -186L-246 -180L-226 -170L-250 -162L-230 -154L-244 -144C-176 -126 -90 -120 -24 -124Z";
const GLIDE_R = "M24 -156C80 -186 146 -210 206 -222L230 -216L216 -204L242 -200L222 -188L246 -182L226 -172L240 -162C172 -140 90 -130 24 -128Z";
const GLIDE_BODY = ellipsePath(0, -138, 50, 22);
function Glide() {
  return <span className="neon-node"><Neon box={BOX} fills={[{ d:GLIDE_R }, { d:GLIDE_L }, { d:GLIDE_BODY }]} tubes={[
    { d:GLIDE_R, tone:"bone", w:W * 0.6 },
    { d:GLIDE_L, tone:"bone", w:W * 0.65 },
    { d:"M-200 -194L-60 -150M200 -210L60 -158", tone:"bone", w:W * 0.3 },
    { d:GLIDE_BODY, tone:"bone", w:W * 0.65 },
    { d:"M46 -140L92 -128L86 -118L44 -128", tone:"bone", w:W * 0.5 },
    { d:"M-48 -142C-60 -150 -70 -154 -80 -154", tone:"clay", w:W * 0.7 },
    { d:ellipsePath(-96, -154, 18, 14), tone:"clay", w:W * 0.55 },
    { d:"M-112 -158C-128 -160 -136 -150 -130 -138", tone:"bone", w:W * 0.55 },
  ]} /></span>;
}
/* at the table: a napkin tucked under the beak; then the knife and fork,
   held up in its wing tips */
const NAPKIN = "M-84 -134L-26 -134L-56 -66Z";
const Napkin = () => <Neon box={BOX} fills={[{ d:NAPKIN }]} tubes={[{ d:NAPKIN, tone:"bone", w:W * 0.55 },
  { d:"M-84 -134L-98 -146M-26 -134L-14 -148", tone:"bone", w:W * 0.45 }]} />;
/* the knife up in front of it, the fork up behind */
const KNIFE = "M-166 -226L-166 -340C-150 -334 -146 -300 -150 -264L-152 -226Z";
const FORK = "M156 -250L156 -300M138 -300L138 -356M150 -300L150 -356M162 -300L162 -356M174 -300L174 -356M138 -300C138 -312 174 -312 174 -300";
const Cutlery = () => <Neon box={BOX} fills={[{ d:KNIFE }]} tubes={[
  /* the wing tips, up and out like arms */
  { d:"M-24 -200C-70 -222 -120 -230 -158 -218M96 -180C124 -196 144 -214 156 -238", tone:"bone", w:W * 0.6 },
  { d:KNIFE, tone:"cyan", w:W * 0.55 },
  { d:"M-159 -226L-159 -188", tone:"cyan", w:W * 0.9 },
  { d:FORK, tone:"cyan", w:W * 0.55 },
  { d:"M156 -250L156 -214", tone:"cyan", w:W * 0.9 },
]} />;

/* the dead tree */
const TREE = "M1350 932C1342 860 1346 800 1336 730L1326 670M1338 774C1310 766 1272 760 1196 766M1252 764L1236 732M1332 706L1360 672M1343 860L1384 826";

export function Vulture({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { chip, perch, ground, floor, size } = VU_STAGE;
  const r = size / 2;
  const p = (x, y) => `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  const style = {
    "--vu-sky":p(560, -460), "--vu-swoop":p(220, -130),
    "--vu-g1":p(ground[0] - perch.x, floor - perch.y), "--vu-g1up":p((ground[0] - perch.x) * 0.5, -70),
    "--vu-g2":p(ground[1] - perch.x, floor - perch.y), "--vu-g2up":p((ground[0] + ground[1]) / 2 - perch.x, floor - perch.y - 100),
    "--vu-c1":`translateX(${chip[1] - chip[0]}px)`, "--vu-c2":`translateX(${chip[2] - chip[0]}px)`,
  };
  return (
    <div className="vu" style={style}>
      <span className="neon-node"><Neon box={[1150, 640, 260, 310]} tubes={[{ d:TREE, tone:"ember", w:W * 0.7 }]} /></span>
      <NeonChip player={player} x={chip[0]} y={floor} className="vu-chip"
        wear={<span className="neon-node vu-sweat" style={{ left:r * 0.62, top:-r * 0.6 }}><SweatDrop scale={1} /></span>} />
      <span className="neon-node vu-bird" style={{ left:perch.x, top:perch.y }}>
        <span className="neon-node vu-fly">
          <span className="neon-node vu-bob">
            <Swaps layers={[[<Glide key="g" />, 0], [<Land key="l" />, VU.land - 160], [<Perch key="p" />, VU.perch],
              [<Land key="l1" />, VU.hop1], [<Perch key="p1" />, VU.hop1 + 360], [<Land key="l2" />, VU.hop2],
              [<Perch key="p2" />, VU.hop2 + 360], [<Perch key="n"><Napkin /></Perch>, VU.napkin],
              [<Perch key="c"><Napkin /><Cutlery /></Perch>, VU.cutlery]]} />
            <span className="neon-node vu-glint" style={{ left:-160, top:-336 }}><Spark scale={0.7} tone="cyan" /></span>
          </span>
        </span>
      </span>
    </div>
  );
}
