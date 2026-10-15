import React from "react";
import { Neon, NeonChip, useNeonColor } from "../neon/Neon.jsx";
import { TUBE, circlePath, ellipsePath, spokesPath } from "../neon/neonArt.js";
import "./lowrider.css";

/* lowrider (win, music): a neon lowrider, side on and facing right, a
   convertible in the winner's own candy paint (tone "player"), the chip
   at the wheel, sitting up over the door. It rolls in from the left, its
   wire wheels turning, and stops with a nose dip. The engine idles: the
   body shudders, the tailpipe puffs, the chip leans in (the wind-up holds
   here, the car shuddering). Bass: the song starts, rings of bass come
   off the car, and it hops on its hydraulics to the beat: front up, back
   up, front up, then the whole car clean off the ground.

   World: the car's middle at 960 on the floor, 800 long, its wheels at
   705 and 1215. The body pitches about the rear axle (.lr-front, front
   up) and about the front axle (.lr-rear, back up); the whole car,
   wheels and all, leaves the floor on .lr-air. */
export const LR_STAGE = Object.freeze({ x:960, floor:930, axle:255, wheel:56, axleY:-56, seat:-60, chip:240, chipFeet:-140 });

const W = TUBE.w;

const BODY = "M-392 -58L-404 -68L-408 -132Q-404 -158 -370 -162L330 -160Q392 -158 404 -126L408 -76L400 -58L326 -58"
  + "A72 72 0 0 0 184 -58L-184 -58A72 72 0 0 0 -326 -58Z";

/* the body, drawn with its middle on the floor at 0 0: the paint (the
   player's own color), its chrome and its lamps */
function Body() {
  return <Neon box={[-440, -300, 880, 270]} fills={[{ d:BODY }]} tubes={[
    { d:BODY, tone:"player", w:W * 1.1 },
    { d:"M-396 -110C-150 -103 120 -117 398 -108", tone:"cyan", w:W * 0.45 },
    { d:"M-300 -136C-120 -132 120 -140 300 -134", tone:"player", w:W * 0.35 },
    /* the steering wheel, in front of the driver */
    { d:"M40 -214C56 -214 62 -170 48 -166C34 -164 26 -212 40 -214Z", tone:"cyan", w:W * 0.55 },
    { d:"M46 -190L80 -168", tone:"cyan", w:W * 0.4 },
    /* the windshield's frame */
    { d:"M150 -160L98 -262L82 -262L128 -160", tone:"cyan", w:W * 0.55 },
    /* the bumpers */
    { d:"M398 -84L424 -84Q430 -84 430 -78L430 -70Q430 -64 424 -64L404 -64M-398 -84L-424 -84Q-430 -84 -430 -78L-430 -70Q-430 -64 -424 -64L-404 -64",
      tone:"cyan", w:W * 0.6 },
    { d:ellipsePath(394, -140, 7, 11), tone:"amber", w:W * 0.8, g:"head" },
    { d:"M-404 -148L-404 -128", tone:"clay", w:W * 1.1, g:"tail" },
    /* the door's seam and handle */
    { d:"M-180 -156L-176 -66M-160 -132L-136 -132", tone:"player", w:W * 0.35 },
  ]} />;
}

/* a wire wheel, centred: the tire, the rim, the spokes and the hub */
function Wheel() {
  const { wheel } = LR_STAGE;
  return <Neon box={[-wheel - 14, -wheel - 14, (wheel + 14) * 2, (wheel + 14) * 2]} fills={[{ d:circlePath(0, 0, wheel) }]} tubes={[
    { d:circlePath(0, 0, wheel), tone:"bone", w:W * 0.85 },
    { d:circlePath(0, 0, 38), tone:"cyan", w:W * 0.6 },
    { d:spokesPath(12, 10, 37, 0, 0, 8), tone:"bone", w:W * 0.3 },
    { d:circlePath(0, 0, 9), tone:"amber", w:W * 0.6 },
  ]} />;
}

const Puff = () => <Neon box={[-30, -30, 60, 60]} tubes={[{ d:circlePath(0, 0, 16), tone:"bone", w:W * 0.4 }]} />;

export function Lowrider({ cast }) {
  const player = cast?.a?.[0];
  const color = useNeonColor(player);
  if (!player) return null;
  const { x, floor, axle, axleY, seat, chip, chipFeet } = LR_STAGE;
  return (
    <div className="lr" style={{ "--neon-player":color }}>
      <span className="neon-node lr-car" style={{ left:x, top:floor }}>
        <span className="neon-node lr-roll">
          {/* rings of bass off the car, behind it */}
          {[0, 1].map(i => <span key={i} className={`neon-node lr-ring is-${i}`} style={{ top:-160 }}>
            <Neon box={[-470, -150, 940, 300]} tubes={[{ d:ellipsePath(0, 0, 440, 130), tone:"magenta", w:W * 0.5 }]} /></span>)}
          <span className="neon-node lr-air">
            {/* the body: pitched about the rear axle, then the front */}
            <span className="neon-node lr-front" style={{ left:-axle, top:axleY }}>
              <span className="neon-node lr-rear" style={{ left:axle * 2 }}>
                <span className="neon-node lr-shudder bit-hold-loop" style={{ left:-axle, top:-axleY }}>
                  <NeonChip player={player} x={seat} y={chipFeet} size={chip} pool={false} className="lr-chip" />
                  <Body />
                  {[0, 1, 2].map(i => <span key={i} className={`neon-node lr-puff is-${i}`} style={{ left:-438, top:-70 }}><Puff /></span>)}
                </span>
              </span>
            </span>
            {[-axle, axle].map(wx => <span key={wx} className="neon-node lr-wheel" style={{ left:wx, top:axleY }}>
              <span className="neon-node lr-spin"><Wheel /></span></span>)}
          </span>
        </span>
      </span>
    </div>
  );
}
