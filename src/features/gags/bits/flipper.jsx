import React from "react";
import { HouseHand, Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst, DizzyStars, SpeedLines } from "../neon/NeonProps.jsx";
import { HAND_POSES, TUBE, circlePath, spokesPath } from "../neon/neonArt.js";
import "./flipper.css";

/* flipper (versus, punchline): a pinball backglass. A flipper rests on
   the floor at the left, its arcade button beside it; the favorite (B)
   stands across the floor under two pop bumpers, smug. The long shot (A)
   drops out of the sky onto the flipper like a ball put in play, bounces
   and rolls down it toward the tip. The house hand comes down over the
   button, waits for it, and presses: the flipper snaps up and fires A
   across the floor, lighting the lane arrows, straight into B (the smash:
   the song comes in here). B pings off the first bumper, DING, up into
   the second, DING, and drops to the floor seeing stars while every lamp
   on the table chases. A comes down where B stood.

   World x: the button at 128, the flipper's pivot at 250 (its tip rests
   on the floor at 660), B at 1320, A ends at 1080, the bumpers at 1650
   and 1400 in the air. */
export const FP_STAGE = Object.freeze({ floor:930, chip:240, button:128, pivot:{ x:250, y:820 }, len:420, rest:13, fired:-32,
  a:1080, b:1320, bump1:{ x:1650, y:600, r:76 }, bump2:{ x:1400, y:430, r:70 }, land:1500 });

const r1 = n => Math.round(n * 10) / 10;
const rad = deg => deg * Math.PI / 180;
/* the flipper's half thickness at `s` along it, and the point a chip of
   radius r rolling on its top surface has its middle at */
const FLIP = { R:42, tip:18 };
const halfAt = s => FLIP.R - (FLIP.R - FLIP.tip) * s / FP_STAGE.len;
function onFlipper(s, deg, r) {
  const { pivot } = FP_STAGE, a = rad(deg), off = r + halfAt(s);
  return { x:pivot.x + s * Math.cos(a) + off * Math.sin(a), y:pivot.y + s * Math.sin(a) - off * Math.cos(a) };
}

/* the flipper, pivot at 0 0, pointing right: a tapered bat of bone with
   its magenta rubber inside, the pivot's cyan post */
const flipperPath = (L, R, t, x0 = 0) => `M${x0} ${-R}L${L} ${-t}A${t} ${t} 0 0 1 ${L} ${t}L${x0} ${R}A${R} ${R} 0 0 1 ${x0} ${-R}Z`;
function FlipperArt() {
  const { len } = FP_STAGE;
  const body = flipperPath(len, FLIP.R, FLIP.tip);
  return <Neon box={[-60, -60, len + 90, 120]} fills={[{ d:body }]} tubes={[
    { d:body, tone:"bone", w:TUBE.w },
    { d:flipperPath(len - 4, FLIP.R - 14, FLIP.tip - 9, 4), tone:"magenta", w:TUBE.thin, g:"rubber" },
    { d:circlePath(0, 0, 13), tone:"cyan", w:TUBE.thin },
  ]} />;
}
/* the post the pivot stands on: from the pivot to the floor, a foot */
function PostArt({ h }) {
  return <Neon box={[-60, -10, 120, h + 20]} tubes={[
    { d:`M0 0L0 ${h}M-46 ${h}L46 ${h}`, tone:"cyan", w:TUBE.thin },
  ]} />;
}
/* the arcade button: a ring base on the floor, the dome (its own node, it
   goes down when pressed). Anchor: the base's middle on the floor. */
function ButtonBase() {
  const d = "M-64 0L-64 -26L64 -26L64 0Z";
  return <Neon box={[-80, -40, 160, 50]} fills={[{ d }]} tubes={[{ d, tone:"bone", w:TUBE.thin }]} />;
}
function ButtonDome() {
  const d = "M-44 -26C-44 -78 44 -78 44 -26Z";
  return <Neon box={[-60, -90, 120, 74]} fills={[{ d }]} tubes={[{ d, tone:"magenta", w:TUBE.w * 0.8 },
    { d:"M-22 -52C-14 -62 0 -64 10 -62", tone:"magenta", w:TUBE.fine, g:"shine" }]} />;
}
/* a pop bumper, face on: its ring, its skirt's spokes and its cap.
   Anchor: its middle. Its lamps (group "lit") flash on a hit. */
function Bumper({ r }) {
  return <Neon box={[-r - 20, -r - 20, r * 2 + 40, r * 2 + 40]} fills={[{ d:circlePath(0, 0, r) }]} tubes={[
    { d:circlePath(0, 0, r), tone:"cyan", w:TUBE.w * 0.85 },
    { d:spokesPath(10, r * 0.74, r * 0.92, 0, 0, 18), tone:"amber", w:TUBE.thin, g:"lit", glass:true },
    { d:circlePath(0, 0, r * 0.6), tone:"magenta", w:TUBE.w * 0.7, g:"cap" },
    { d:circlePath(0, 0, r * 0.24), tone:"amber", w:TUBE.thin, g:"lit", glass:true },
  ]} />;
}
/* a lane's arrow lamp on the floor, pointing right. Anchor: its middle. */
function Arrow() {
  const d = "M-16 -24L12 0L-16 24";
  return <Neon box={[-30, -36, 56, 72]} tubes={[{ d, tone:"amber", w:TUBE.w * 0.8, g:"lit", glass:true }]} />;
}

const anchors = () => {
  const { button, b } = FP_STAGE;
  const minX = button - 74, maxX = b + 140;
  return { minX, maxX, mid:Math.round((minX + maxX) / 2), flip:520, b, end:1240 };
};

export function Flipper({ cast }) {
  const a = cast?.a?.[0], b = cast?.b?.[0];
  if (!a || !b) return null;
  const { floor, chip, button, pivot, rest, a:ax, b:bx, bump1, bump2, land } = FP_STAGE;
  const r = chip / 2;
  /* A's middle at each moment, then its feet's offset from where it ends */
  const p = {
    sky:{ x:onFlipper(120, rest, r).x, y:-420 },
    drop:onFlipper(120, rest, r),
    tip:onFlipper(330, rest, r),
    apex:{ x:860, y:630 },
    hit:{ x:bx - chip + 5, y:floor - r - 22 },
    pop:{ x:1010, y:610 },
  };
  const feet = q => `translate(${r1(q.x - ax)}px, ${r1(q.y + r - floor)}px)`;
  /* B pings: into the first bumper, up into the second, down to the floor */
  const touch = (from, bump) => {
    const dx = bump.x - from.x, dy = bump.y - from.y, n = Math.hypot(dx, dy) || 1, k = bump.r + r;
    return { x:bump.x - dx / n * k, y:bump.y - dy / n * k };
  };
  const b0 = { x:bx, y:floor - r }, b1 = touch(b0, bump1), b2 = touch(b1, bump2);
  const bfeet = q => `translate(${r1(q.x - bx)}px, ${r1(q.y + r - floor)}px)`;
  const style = {
    "--flp-sky":feet(p.sky), "--flp-drop":feet(p.drop), "--flp-bounce":feet({ x:p.drop.x + 14, y:p.drop.y - 60 }),
    "--flp-tip":feet(p.tip), "--flp-apex":feet(p.apex), "--flp-hit":feet(p.hit), "--flp-pop":feet(p.pop),
    "--flp-b1":bfeet(b1), "--flp-b2":bfeet(b2), "--flp-bpeak":bfeet({ x:(b2.x + land) / 2 + 30, y:b2.y - 60 }),
    "--flp-bland":`translate(${land - bx}px, 0px)`, "--flp-bhop":`translate(${land - bx + 16}px, -50px)`,
  };
  /* the hand comes down over the button from the upper left, pointing */
  const scale = 1.25, angle = 78, tip = HAND_POSES.point.at;
  const ca = Math.cos(rad(angle)), sa = Math.sin(rad(angle));
  const lx = (tip.x + 4) * scale, ly = (tip.y + 4) * scale;
  const wrist = { x:Math.round(button - (lx * ca - ly * sa)), y:Math.round(floor - 84 - (lx * sa + ly * ca)) };
  return (
    <div className="flp" style={style}>
      {/* the bumpers, up in the air over B */}
      {[bump1, bump2].map((bump, i) => <span key={i} className={`neon-node flp-bump is-${i + 1}`} style={{ left:bump.x, top:bump.y }}>
        <span className="neon-node flp-bump-kick"><Bumper r={bump.r} /></span>
        <span className="neon-node flp-ding"><Burst n={12} r0={bump.r + 18} r1={bump.r + 70} tone="amber" /></span>
      </span>)}
      {/* the lane's arrows on the floor */}
      {[740, 810, 880].map((x, i) => <span key={x} className={`neon-node flp-arrow is-${i}`} style={{ left:x, top:floor - 34 }}><Arrow /></span>)}
      {/* the flipper on its post, and the button */}
      <span className="neon-node" style={{ left:pivot.x, top:pivot.y }}><PostArt h={floor - pivot.y} /></span>
      <span className="neon-node flp-flip" style={{ left:pivot.x, top:pivot.y }}><FlipperArt /></span>
      <span className="neon-node flp-button" style={{ left:button, top:floor, transform:"scale(1.15)", transformOrigin:"0 0" }}>
        <span className="neon-node flp-dome"><ButtonDome /></span>
        <ButtonBase />
      </span>
      <NeonChip player={b} x={bx} y={floor} className="flp-b"
        wear={<span className="neon-node flp-stars" style={{ top:-r - 30 }}><DizzyStars count={3} rx={130} ry={24} r={22} /></span>} />
      <NeonChip player={a} x={ax} y={floor} className="flp-a">
        <span className="neon-node flp-trail" style={{ top:-r }}><SpeedLines length={320} rows={[[-64, 0.8], [-20, 1], [24, 0.7], [66, 0.5]]} /></span>
      </NeonChip>
      {/* the smash */}
      <span className="neon-node flp-smash" style={{ left:bx - r, top:floor - r - 20 }}><Burst n={12} r0={60} r1={170} tone="amber" /></span>
      <HouseHand className="flp-hand" x={wrist.x} y={wrist.y} angle={angle} scale={scale} poses="point" />
    </div>
  );
}
Flipper.anchors = anchors;
