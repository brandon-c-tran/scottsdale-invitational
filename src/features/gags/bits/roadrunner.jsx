import React from "react";
import { Neon, NeonChip, Swaps } from "../neon/Neon.jsx";
import { SpeedLines, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE, arcPath, circlePath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./roadrunner.css";

const RR = bitById("roadrunner").beats;
const W = TUBE.w;

/* roadrunner (loss, songless): the chip alone on the floor. A neon
   roadrunner streaks in from the right, skids to a stop beside it in a
   spray of dust and leans in, its beak an inch off the chip's face: beep
   beep (the chip jolts on each). It spins its legs up into a wheel and is
   gone in a streak, right past the chip, which spins like a top in its
   wake, wobbles and keels over flat. One feather comes down on it.

   World x: the chip at 860, the bird stops at 1200 (its beak, leaned in,
   reaches the chip's rim). The bird faces left; its feet are its node. */
export const RR_STAGE = Object.freeze({ chip:860, bird:1250, floor:930, size:240, hips:-130 });

/* ── the bird, a sign in a few frames: facing left, feet at 0 0 ── */
const BODY = "M-62 -178C-66 -214 -34 -236 4 -230C40 -224 70 -204 92 -184L106 -170C80 -150 40 -132 0 -130C-36 -128 -58 -148 -62 -178Z";
const TAIL = "M86 -194L208 -312C220 -322 242 -308 232 -294L108 -170Z";
const NECK = "M-56 -200C-70 -232 -76 -258 -78 -276M-26 -224C-34 -246 -40 -264 -42 -280";
const HEAD = circlePath(-62, -298, 30);
const CREST = "M-52 -326L-34 -376M-40 -322L-4 -362M-32 -312L14 -334";
const WING = "M-26 -202C14 -208 56 -196 86 -180M-6 -186C26 -188 52 -180 70 -170";
const EYE = circlePath(-70, -304, 10);
const PUPIL = circlePath(-76, -305, 2.6);
const BEAK_SHUT = "M-90 -306L-184 -296L-90 -288";
const BEAK_OPEN = "M-90 -306L-178 -332M-90 -290L-172 -262";
/* the beep: two little arcs off the beak's tip */
const BEEP = `${arcPath(-184, -296, 26, 150, 210)}${arcPath(-184, -296, 46, 146, 214)}`;
const LEGS_STAND = "M-16 -134L-26 -70L-14 0M-14 0L-52 0M-14 0L-36 9M-14 0L4 3M14 -134L22 -70L30 0M30 0L-6 0M30 0L-14 8M30 0L46 3";
const LEGS_SKID = "M-14 -134L-70 -56L-116 -6M-116 -6L-150 -14M-116 -6L-142 2M14 -134L-36 -60L-78 -2M-78 -2L-110 -10M-78 -2L-104 4";
/* running: the legs a blur of a wheel */
const WHEEL = circlePath(-6, -64, 62);
const WHEEL_IN = `${arcPath(-6, -64, 40, 200, 320)}${arcPath(-6, -64, 40, 20, 140)}M-10 -130L-8 -126`;

const upper = beakOpen => [
  { d:TAIL, tone:"magenta", w:W * 0.7 },
  { d:"M100 -184L220 -302", tone:"magenta", w:W * 0.4 },
  { d:BODY, tone:"cyan", w:W * 0.8 },
  { d:WING, tone:"cyan", w:W * 0.45 },
  { d:NECK, tone:"cyan", w:W * 0.7 },
  { d:HEAD, tone:"cyan", w:W * 0.75 },
  { d:CREST, tone:"magenta", w:W * 0.6 },
  { d:EYE, tone:"bone", w:W * 0.45 },
  { d:PUPIL, tone:"bone", w:W * 0.6 },
  { d:beakOpen ? BEAK_OPEN : BEAK_SHUT, tone:"ember", w:W * 0.6 },
];
const UPPER_FILLS = [{ d:BODY }, { d:TAIL }, { d:HEAD }];
const BIRD_BOX = [-200, -390, 450, 410];
const Upper = ({ open }) => <Neon box={BIRD_BOX} tubes={upper(open)} fills={UPPER_FILLS} />;
const Legs = ({ d }) => <Neon box={BIRD_BOX} tubes={[{ d, tone:"ember", w:W * 0.55 }]} />;
/* the wheel turns about its own middle, forever (only lit while running) */
const Wheel = () => (
  <span className="neon-node" style={{ left:-6, top:-64 }}>
    <span className="neon-node rr-wheel">
      <span className="neon-node" style={{ left:6, top:64 }}>
        <Neon box={BIRD_BOX} tubes={[{ d:WHEEL, tone:"ember", w:W * 0.45 }, { d:WHEEL_IN, tone:"ember", w:W * 0.45 }]} />
      </span>
    </span>
  </span>
);

/* a puff of dust, bone. Anchor: its foot */
const PUFF = "M-58 0C-80 0 -82 -30 -58 -34C-56 -60 -22 -66 -10 -46C2 -68 38 -62 40 -38C62 -42 72 -10 52 0Z";
const Puff = ({ scale = 1 }) => <Neon box={[-90, -80, 180, 90]} scale={scale} tubes={[{ d:PUFF, tone:"bone", w:W * 0.5 }]} fills={[{ d:PUFF }]} />;
/* a feather, cyan, drifting. Anchor: its middle */
const FEATHER = "M-46 4C-20 -16 18 -18 46 -4C20 10 -18 14 -46 4Z";
const Feather = () => <Neon box={[-60, -30, 120, 60]} tubes={[{ d:FEATHER, tone:"cyan", w:W * 0.45 },
  { d:"M-56 6L44 -4M-10 -6L4 -14M10 -6L22 -12M-10 6L0 12M10 4L20 10", tone:"cyan", w:W * 0.3 }]} fills={[{ d:FEATHER }]} />;

export function Roadrunner({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { chip, bird, floor, size, hips } = RR_STAGE;
  const r = size / 2;
  return (
    <div className="rr">
      {/* skid marks on the floor where it braked */}
      <span className="neon-node rr-marks" style={{ left:bird - 60, top:floor + 4 }}>
        <Neon box={[-10, -10, 380, 30]} tubes={[{ d:"M0 0L300 0M30 10L340 10", tone:"ember", w:W * 0.4 }]} />
      </span>
      <NeonChip player={player} x={chip} y={floor} className="rr-chip"
        wear={<span className="neon-node rr-sweat" style={{ left:r * 0.62, top:-r * 0.62 }}><SweatDrop scale={1} /></span>} />
      {/* the dust: a spray at the skid, the cloud it leaves behind */}
      {[[-30, 0.9, 0], [40, 0.7, 1], [110, 1.1, 2]].map(([dx, s, i]) =>
        <span key={i} className={`neon-node rr-dust is-${i}`} style={{ left:bird + dx - 80, top:floor }}><Puff scale={s} /></span>)}
      {[[0, 1, 0], [-80, 0.8, 1], [70, 0.7, 2]].map(([dx, s, i]) =>
        <span key={i} className={`neon-node rr-cloud is-${i}`} style={{ left:bird + dx, top:floor }}><Puff scale={s} /></span>)}
      <span className="neon-node rr-bird" style={{ left:bird, top:floor }}>
        <span className="neon-node rr-run">
          <span className="neon-node rr-trail" style={{ left:150, top:-170 }}>
            <span className="neon-node" style={{ transform:"scaleX(-1)" }}><SpeedLines length={420} rows={[[-90, 0.7], [-40, 1], [10, 0.8], [60, 0.55]]} /></span>
          </span>
          <span className="neon-node rr-streak">
            <Swaps className="rr-legs" layers={[[<Wheel key="w" />, 0], [<Legs key="k" d={LEGS_SKID} />, RR.skid],
              [<Legs key="s" d={LEGS_STAND} />, RR.stop], [<Wheel key="w2" />, RR.windup]]} />
            {/* the upper body leans about the hips */}
            <span className="neon-node rr-lean" style={{ top:hips }}>
              <span className="neon-node" style={{ top:-hips }}>
                <Swaps className="rr-beak" layers={[[<Upper key="s" open={false} />, 0], [<Upper key="o" open />, RR.beep - 60],
                  [<Upper key="s2" open={false} />, RR.beep + 70], [<Upper key="o2" open />, RR.beep2 - 60], [<Upper key="s3" open={false} />, RR.beep2 + 90]]} />
                <span className="neon-node rr-beep is-1"><Neon box={BIRD_BOX} tubes={[{ d:BEEP, tone:"cyan", w:W * 0.5 }]} /></span>
                <span className="neon-node rr-beep is-2"><Neon box={BIRD_BOX} tubes={[{ d:BEEP, tone:"cyan", w:W * 0.5 }]} /></span>
              </span>
            </span>
          </span>
        </span>
      </span>
      <span className="neon-node rr-feather" style={{ left:chip + 30, top:floor - 18 }}>
        <span className="neon-node rr-feather-sway"><Feather /></span>
      </span>
    </div>
  );
}
