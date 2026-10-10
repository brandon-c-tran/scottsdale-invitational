import React from "react";
import { CAST, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastSide } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { DUST_LOW, Dust, FloorShadow, MuzzleFlash, Puff, REVOLVER, Revolver, Tumbleweed, Whirl } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./quickdraw.css";

const QD = bitById("quickdraw").beats;

/* quickdraw (versus, action): high noon on the desert floor. A (the
   winner) stands left facing right, B (the beaten) right facing left, far
   apart. The wind; a tumbleweed rolls through between them; the hold.
   B's hand twitches. A's hand whips up a revolver far too small: BANG.
   Nothing happens. Then B goes over backwards, stiff as a board, and lands
   in the dust. A blows the smoke off the barrel, spins the revolver on a
   finger... and fumbles it. A side of more than one stands shoulder to
   shoulder; B's go over one after another.

   The front hand's marks are offsets from its wrist at rest, scaled with
   the chip; the loose revolver takes over from the held one at the fumble
   exactly where the finger is (the same pivot, the same turn). */
export const QD_STAGE = Object.freeze({ a:540, b:1380, floor:CAST.floor, weed:968 });

const rot = ({ x, y }, deg) => {
  const a = deg * Math.PI / 180;
  return { x:x * Math.cos(a) - y * Math.sin(a), y:x * Math.sin(a) + y * Math.cos(a) };
};
const px = n => `${Math.round(n * 10) / 10}px`;
/* every mark is translate then rotate, so any two interpolate */
const move = ({ x, y }, deg = 0) => `translate(${px(x)}, ${px(y)}) rotate(${deg}deg)`;

/* where the leads stand: their marks, moved in so a side of four fits the
   canvas, and how far the camera may lean in with both sides in frame */
export function quickdrawStaging(a = 1, b = 1) {
  const la = clusterLayout(a, { dir:-1 }), lb = clusterLayout(b, { dir:1 });
  const ax = Math.max(QD_STAGE.a, 70 + la.reach), bx = Math.min(QD_STAGE.b, 1850 - lb.reach);
  const half = Math.max(960 - (ax - la.reach), bx + lb.reach - 960);
  const zoom = Math.round(Math.min(1.2, 900 / half) * 1000) / 1000;
  return { la, lb, ax, bx, zoom };
}

export function quickdrawMarks(size = CAST.size, ax = QD_STAGE.a) {
  const k = size / CAST.size;
  const g = castGeometry(size);
  const wrist = { x:ax + g.hands.r.x, y:QD_STAGE.floor + g.hands.r.y };
  const rs = REVOLVER.scale * k;
  const gl = g.glove;
  const grip = GLOVE_POSES.grip.held, point = GLOVE_POSES.point.held;
  /* the muzzle from the wrist, in the grip pose */
  const muzzleOff = { x:grip.x * gl + REVOLVER.muzzle.x * rs, y:grip.y * gl + REVOLVER.muzzle.y * rs };
  const aim = { x:34 * k, y:-40 * k };
  const blowTurn = -72;
  const blow = { x:-6 * k, y:-18 * k };
  const spin = { x:30 * k, y:-34 * k };
  const tip = { x:wrist.x + spin.x + point.x * gl, y:wrist.y + spin.y + point.y * gl };
  /* the toss peaks over the finger; the open glove's middle fingertip
     (87 art px over its wrist) meets it there */
  const toss = { x:14 * k, y:-150 * k };
  const peak = { x:tip.x + toss.x, y:tip.y + toss.y };
  const grab = { x:peak.x - wrist.x, y:peak.y + 87 * gl - wrist.y };
  const muzzleAim = { x:wrist.x + aim.x + muzzleOff.x, y:wrist.y + aim.y + muzzleOff.y };
  const raised = rot(muzzleOff, blowTurn);
  const muzzleBlow = { x:wrist.x + blow.x + raised.x, y:wrist.y + blow.y + raised.y };
  /* where it lies: a little way out in front, the grip on the floor */
  const land = { x:126 * k, y:QD_STAGE.floor - 20 * k - tip.y };
  return { k, g, wrist, rs, aim, blow, blowTurn, spin, grab, tip, toss, land, muzzleAim, muzzleBlow };
}

export function Quickdraw({ cast }) {
  const a = cast?.a || [], b = cast?.b || [];
  const { la, lb, ax, bx, zoom } = quickdrawStaging(a.length, b.length);
  const m = quickdrawMarks(la.size, ax);
  const kb = lb.size / CAST.size;
  const front = [["ready", 0], ["grip", QD.draw], ["point", QD.spin], ["open", QD.fumble]];
  const style = {
    "--cam-from":`scale(${Math.round(zoom * 0.92 * 1000) / 1000})`, "--cam-to":`scale(${zoom})`,
    "--aim":move(m.aim), "--recoil":move(m.aim, -28), "--blow":move(m.blow, m.blowTurn), "--spin":move(m.spin), "--grab":move(m.grab),
    "--toss":move(m.toss), "--land":move(m.land), "--land-up":move({ x:m.land.x - 10 * m.k, y:m.land.y - 22 * m.k }),
  };
  /* the gun on the finger: the blur of the twirl round the fingertip */
  const twirl = <><span className="qd-whirl"><Whirl r={54 * m.k} /></span><Revolver scale={m.rs} pivot="guard" /></>;
  return (
    <div className="qd" style={style}>
      <div className="qd-cam"><div className="qd-shake">
        <span className="qd-node qd-weed">
          <span className="qd-node qd-weed-shadow"><FloorShadow w={92} h={16} /></span>
          <span className="qd-node qd-weed-hop"><span className="qd-node qd-weed-spin"><Tumbleweed scale={0.86} /></span></span>
        </span>
        <CastSide players={b} x={bx} dir={1} facing={-1} className="qd-b"
          lead={{ hands:{ front:"ready", back:"ready" } }} mates={{ hands:{ front:"ready", back:"ready" } }} />
        <CastSide players={a} x={ax} dir={-1} facing={1} className="qd-a"
          lead={{ hands:{ front, back:"ready" }, hold:{ front:{ grip:<Revolver scale={m.rs} />, point:twirl } } }}
          mates={{ hands:{ front:"ready", back:"ready" } }} />
        <span className="qd-node qd-flash" style={{ left:m.muzzleAim.x + 34 * m.k, top:m.muzzleAim.y }}><MuzzleFlash scale={m.k} /></span>
        {[0, 1].map(i => <span key={i} className="qd-node qd-wisp" style={{ left:m.muzzleAim.x + 4, top:m.muzzleAim.y - 4, "--d":`${i * 220}ms` }}>
          <Puff scale={0.6 * m.k} /></span>)}
        <span className="qd-node qd-blowpuff" style={{ left:m.muzzleBlow.x, top:m.muzzleBlow.y - 6 }}><Puff scale={0.7 * m.k} /></span>
        <span className="qd-node qd-loose" style={{ left:m.tip.x, top:m.tip.y }}>
          <span className="qd-node qd-loose-turn"><Revolver scale={m.rs} pivot="guard" /></span>
        </span>
        {/* flat on its back: the dust squeezed out both sides */}
        <Dust className="qd-dust" at={QD.land} puffs={DUST_LOW} spread={kb} size={kb} style={{ left:bx, top:QD_STAGE.floor - 12 * kb }} />
      </div></div>
    </div>
  );
}
