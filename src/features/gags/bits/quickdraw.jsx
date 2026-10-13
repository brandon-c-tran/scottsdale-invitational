import React from "react";
import { CAST, PAIR_TIGHT, RIG, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastSide } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { DUST_LOW, Dust, FloorShadow, MuzzleFlash, Puff, REVOLVER, Revolver, Tumbleweed, Whirl } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./quickdraw.css";

const QD = bitById("quickdraw").beats;
const PAIR_LAG = bitById("quickdraw").pairLag;

/* quickdraw (versus, action): high noon on the desert floor. A (the
   winner) stands left facing right, B (the beaten) right facing left. The
   wind; a tumbleweed rolls through between them; the hold. B's hand
   twitches. A's hand whips up a revolver far too small: BANG, a flash
   bigger than A for three frames, then the kick shoves A back a step,
   heels skidding, its side bumped back after it. On B: nothing happens. Then B goes over
   backwards, stiff as a board, and lands in the dust. A blows the smoke
   off the barrel, spins the revolver on a finger... and fumbles it. A side
   of more than one stands shoulder to shoulder; B's go over one after
   another. A pair (Oct 13) stands apart and both partners act: two
   revolvers, the second held up over its partner's head, two BANGs a
   beat apart (the registry's pairLag), two kicks, two fumbles; a beaten
   pair both go over.

   The stage's camera shoots it (the registry's camera: a two-shot as
   tight as both sides allow, a punch-in on the shot, a whip to B, back
   out); the scene names its anchors. The leads stand closer for smaller
   chips, so a big side still gets a medium shot. The front hand's marks
   are offsets from its wrist, scaled with the chip; the loose revolver
   takes over from the held one at the fumble exactly where the finger is. */
export const QD_STAGE = Object.freeze({ mid:960, gap:320, floor:CAST.floor, recoil:72 });

const rot = ({ x, y }, deg) => {
  const a = deg * Math.PI / 180;
  return { x:x * Math.cos(a) - y * Math.sin(a), y:x * Math.sin(a) + y * Math.cos(a) };
};
const px = n => `${Math.round(n * 10) / 10}px`;
/* every mark is translate then rotate, so any two interpolate */
const move = ({ x, y }, deg = 0) => `translate(${px(x)}, ${px(y)}) rotate(${deg}deg)`;

/* where the leads stand (far enough apart for a flash bigger than A
   between them) and how far everything reaches: A's side once the kick
   has shoved it back, B's side and its "+N" (the camera fits the span
   between the title-safe sides; a side's reach already runs past its
   outer glove) */
export function quickdrawStaging(a = 1, b = 1) {
  const la = clusterLayout(a, { dir:-1, ...PAIR_TIGHT }), lb = clusterLayout(b, { dir:1, ...PAIR_TIGHT });
  const ka = la.size / CAST.size, kb = lb.size / CAST.size;
  const ax = QD_STAGE.mid - QD_STAGE.gap * ka, bx = QD_STAGE.mid + QD_STAGE.gap * kb;
  const recoil = Math.round(QD_STAGE.recoil * ka);
  const minX = Math.round(ax - recoil - la.reach - (la.more ? 110 : 0));
  const maxX = Math.round(bx + lb.reach + (lb.more ? 110 : 0));
  return { la, lb, ka, kb, ax, bx, recoil, minX, maxX, mid:Math.round((minX + maxX) / 2) };
}

/* a pair's second shooter stands behind its partner and holds the gun up
   over its partner's head (the aim, in chips of 240) */
export const QD_HIGH_AIM = Object.freeze({ x:50, y:-135 });

export function quickdrawMarks(size = CAST.size, ax = QD_STAGE.mid - QD_STAGE.gap, recoil = QD_STAGE.recoil, { high = false } = {}) {
  const k = size / CAST.size;
  const g = castGeometry(size);
  const gl = g.glove;
  /* the front wrist at the shot, and once the kick has shoved A back */
  const shot = { x:ax + g.hands.r.x, y:QD_STAGE.floor + g.hands.r.y };
  const wrist = { x:shot.x - recoil, y:shot.y };
  const rs = REVOLVER.scale * k;
  const grip = GLOVE_POSES.grip.held, point = GLOVE_POSES.point.held;
  /* the muzzle from the wrist, in the grip pose */
  const muzzleOff = { x:grip.x * gl + REVOLVER.muzzle.x * rs, y:grip.y * gl + REVOLVER.muzzle.y * rs };
  const aim = high ? { x:QD_HIGH_AIM.x * k, y:QD_HIGH_AIM.y * k } : { x:34 * k, y:-40 * k };
  /* the kick throws the hand up and back, and it hangs there a moment */
  const kick = { x:aim.x - 30 * k, y:aim.y - 52 * k }, hang = { x:aim.x - 20 * k, y:aim.y - 36 * k };
  const blowTurn = -72;
  const blow = { x:-6 * k, y:-18 * k };
  const spin = { x:30 * k, y:-34 * k };
  const tip = { x:wrist.x + spin.x + point.x * gl, y:wrist.y + spin.y + point.y * gl };
  /* the toss peaks over the finger; the open glove's middle fingertip
     (87 art px over its wrist) meets it there */
  const toss = { x:14 * k, y:-150 * k };
  const peak = { x:tip.x + toss.x, y:tip.y + toss.y };
  const grab = { x:peak.x - wrist.x, y:peak.y + 87 * gl - wrist.y };
  const muzzleAim = { x:shot.x + aim.x + muzzleOff.x, y:shot.y + aim.y + muzzleOff.y };
  const smoke = { x:muzzleAim.x - recoil, y:muzzleAim.y };
  const raised = rot(muzzleOff, blowTurn);
  const muzzleBlow = { x:wrist.x + blow.x + raised.x, y:wrist.y + blow.y + raised.y };
  /* where it lies: a little way out in front, the grip on the floor */
  const land = { x:126 * k, y:QD_STAGE.floor - 20 * k - tip.y };
  /* the back heel, where a skid digs in */
  const heel = -size * RIG.shoeX;
  return { k, g, wrist, rs, aim, kick, hang, blow, blowTurn, spin, grab, tip, toss, land, muzzleAim, smoke, muzzleBlow, heel };
}

/* one shooter's marks as the CSS reads them */
const shooterVars = (m, recoil) => ({
  "--aim":move(m.aim), "--recoil":move(m.kick, -62), "--recoil-hang":move(m.hang, -44), "--blow":move(m.blow, m.blowTurn),
  "--spin":move(m.spin), "--grab":move(m.grab), "--toss":move(m.toss), "--land":move(m.land),
  "--land-up":move({ x:m.land.x - 10 * m.k, y:m.land.y - 22 * m.k }),
  "--kick":`translateX(${px(-recoil)})`, "--heel":px(m.heel), "--heel-back":px(-m.heel),
});

/* A's shooters: the lead, and a pair's second (behind it, the gun up over
   its partner's head, its shot `lag` ms after the first) */
export function quickdrawShooters(a = 1, b = 1) {
  const s = quickdrawStaging(a, b);
  const count = s.la.pair ? 2 : 1;
  return Array.from({ length:count }, (_, i) => {
    const x = s.ax + s.la.xs[i];
    return { i, x, lag:i * PAIR_LAG, m:quickdrawMarks(s.la.size, x, s.recoil, { high:i > 0 }) };
  });
}

/* the skid: dust ploughed up off the floor along the way back, and a
   little thrown out ahead of the heels as they stop */
const PLOUGH = Object.freeze([[70, -20, 0.8], [130, -40, 0.66], [30, -34, 0.6], [190, -22, 0.55], [100, -10, 0.7]]);
const STOP = Object.freeze([[-60, -26, 0.62], [-110, -14, 0.5], [-24, -40, 0.46]]);

export function Quickdraw({ cast }) {
  const a = cast?.a || [], b = cast?.b || [];
  const { la, lb, kb, bx, recoil } = quickdrawStaging(a.length, b.length);
  const shooters = quickdrawShooters(a.length, b.length);
  const floor = QD_STAGE.floor;
  /* the lead's marks ride the scene; a pair's second carries its own */
  const lead = shooters[0];
  const front = lag => [["ready", 0], ["grip", QD.draw], ["point", QD.spin + lag], ["open", QD.fumble + lag]];
  /* the gun on the finger: the blur of the twirl round the fingertip */
  const twirl = m => <><span className="qd-whirl"><Whirl r={54 * m.k} /></span><Revolver scale={m.rs} pivot="guard" /></>;
  const shooterProps = i => {
    const { m, lag } = shooters[i] || lead;
    return { hands:{ front:front(lag), back:"ready" }, hold:{ front:{ grip:<Revolver scale={m.rs} />, point:twirl(m) } },
      style:i ? shooterVars(m, recoil) : {} };
  };
  return (
    <div className="qd" style={shooterVars(lead.m, recoil)}>
      {shooters.map(({ i, x, m }) => [-1, 1].map(side => {
        const at = x + side * la.size * RIG.shoeX;
        return <span key={`${i}:${side}`} className="qd-mark" style={{ left:at - recoil, top:floor - 3 + (side + 1) * 2, width:recoil + 10 * m.k,
          ...(i ? { "--pd":`${shooters[i].lag}ms` } : {}) }} />;
      }))}
      <CastSide players={b} x={bx} dir={1} facing={-1} className="qd-b" {...PAIR_TIGHT}
        lead={{ hands:{ front:"ready", back:"ready" } }} mates={{ hands:{ front:"ready", back:"ready" } }} />
      <CastSide players={a} x={lead.x} dir={-1} facing={1} className="qd-a" lag={PAIR_LAG} {...PAIR_TIGHT}
        lead={shooterProps} mates={{ hands:{ front:"ready", back:"ready" } }} />
      {/* the tumbleweed rolls through in front of them */}
      <span className="qd-node qd-weed">
        <span className="qd-node qd-weed-shadow"><FloorShadow w={92} h={16} /></span>
        <span className="qd-node qd-weed-hop"><span className="qd-node qd-weed-spin"><Tumbleweed scale={0.86} /></span></span>
      </span>
      {/* each shooter's own: the skid's dust, the flash, the smoke, the fumbled gun */}
      {shooters.map(({ i, x, m, lag }) => (
        <div key={i} className="qd-shot" style={i ? { ...shooterVars(m, recoil), "--pd":`${lag}ms` } : undefined}>
          <Dust className="qd-plough" at={QD.kick + 10 + lag} puffs={PLOUGH} spread={m.k} size={0.8 * m.k} style={{ left:x - recoil / 2, top:floor - 4 }} />
          <Dust className="qd-stop" at={QD.kick + 180 + lag} puffs={STOP} spread={m.k} size={0.7 * m.k}
            style={{ left:x - recoil + m.heel, top:floor - 4 }} />
          {/* the flash: bigger than the one who fired it */}
          <span className="qd-node qd-flash" style={{ left:m.muzzleAim.x + 34 * m.k, top:m.muzzleAim.y }}>
            <span className="qd-node qd-flash-in"><MuzzleFlash scale={2.25 * m.k} /></span>
          </span>
          {[0, 1].map(j => <span key={j} className="qd-node qd-wisp" style={{ left:m.smoke.x + 4, top:m.smoke.y - 4, "--d":`${j * 220}ms` }}>
            <Puff scale={0.6 * m.k} /></span>)}
          <span className="qd-node qd-blowpuff" style={{ left:m.muzzleBlow.x, top:m.muzzleBlow.y - 6 }}><Puff scale={0.7 * m.k} /></span>
          <span className="qd-node qd-loose" style={{ left:m.tip.x, top:m.tip.y }}>
            <span className="qd-node qd-loose-turn"><Revolver scale={m.rs} pivot="guard" /></span>
          </span>
        </div>
      ))}
      {/* flat on its back: the dust squeezed out both sides (a pair's each) */}
      {(lb.pair ? [0, 1] : [0]).map(i => <Dust key={i} className="qd-dust" at={QD.land + i * 90} puffs={DUST_LOW} spread={kb} size={kb}
        style={{ left:bx + lb.xs[i], top:floor - 12 * kb }} />)}
    </div>
  );
}

/* the camera's anchors (the registry's camera.x and its moves): "a" is
   the shot (A's gun hand and the flash; a pair's two, between them), "b"
   is B with the smoking barrel still at the edge of the frame, "mid" the
   two-shot, minX to maxX the span it fits */
Quickdraw.anchors = cast => {
  const s = quickdrawStaging(cast?.a?.length || 1, cast?.b?.length || 1);
  const shot = s.ax + (s.la.pair ? s.la.xs[1] / 2 : 0);
  return { a:Math.round(shot + 110 * s.ka), b:Math.round(s.bx - 90 * s.kb), mid:s.mid, minX:s.minX, maxX:s.maxX };
};
