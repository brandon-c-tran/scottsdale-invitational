import React from "react";
import { CAST, PAIR_STEP, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { DUST_LOW, Dust, Fireball, Flame, Glint, LooseChip, MuzzleFlash, Puff, SmokeCloud, Sunglasses } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./explosionwalk.css";

/* explosionwalk (win, action): a trailer shot played dead straight. The
   winner walks toward us out of the middle distance in dark glasses,
   gloves swinging, a side walking abreast. Behind it the horizon goes up:
   a white frame, a fireball bigger than the buttes, black smoke climbing.
   It does not flinch, and the shot drops into slow motion: one long step.
   A burning chip tumbles down out of the sky and, as the speed snaps back,
   slams into the dirt beside it; it does not look. It walks on, stops
   close, hooks the glasses down with one finger and looks at us over
   them. A beat. Pushes them back up; a glint off the lens.

   The stage's camera shoots it (the registry's camera); the walk toward
   us is the side growing as its feet come down the floor (one node,
   scaled about the feet), the steps timed from the beats in
   explosionwalk.css. The scene names its anchors: "walk" (the side's
   middle) and "lead" (the lead at its stop). */
const EW = bitById("explosionwalk").beats;
const PAIR_LAG = bitById("explosionwalk").pairLag;
export const EW_STAGE = Object.freeze({ x:960, floor:CAST.floor, from:Object.freeze({ y:898, s:0.66 }), horizon:858,
  blast:Object.freeze({ x:1010, y:700, scale:2.5 }), slow:3.5 });

const px = n => `${Math.round(n * 10) / 10}px`;

/* how far along the walk it is at the boom, the land and the stop: steps
   at one speed, the slow one at a 3.5th of it */
export function walkProgress(beats = EW, slow = EW_STAGE.slow) {
  const normal = beats.boom + (beats.stop - beats.land);
  const total = normal + (beats.land - beats.boom) / slow;
  return { boom:beats.boom / total, land:(beats.boom + (beats.land - beats.boom) / slow) / total, stop:1 };
}
/* the walkers' feet and size at a point along the walk */
export const walkAt = p => {
  const { from, floor } = EW_STAGE;
  return { y:Math.round((from.y + (floor - from.y) * p) * 10) / 10, s:Math.round((from.s + (1 - from.s) * p) * 1000) / 1000 };
};

/* a side abreast: the lead nearest the middle, the rest either side of it,
   a little more than shoulder to shoulder so their gloves swing clear */
export function walkSquad(count = 1) {
  const layout = clusterLayout(Math.max(1, count), { max:4 });
  const step = Math.round(layout.size * (layout.pair ? PAIR_STEP : 1.12));
  const slots = [[0], [-0.5, 0.5], [0, -1, 1], [-0.5, 0.5, -1.5, 1.5]][layout.shown - 1] || [0];
  const xs = slots.map(slot => Math.round(slot * step));
  const reach = Math.round(layout.size * 0.82);
  return { ...layout, step, xs, left:Math.min(...xs) - reach, right:Math.max(...xs) + reach };
}

/* the lead's glove at the glasses: a finger hooked under the bridge, the
   fist over the cheek. The wrist's way from where it hangs, and the turn,
   for a chip of `size` */
export function shadesReach(size = CAST.size) {
  const g = castGeometry(size);
  const turn = -158, a = turn * Math.PI / 180;
  const tip = { x:GLOVE_POSES.point.held.x * g.glove, y:GLOVE_POSES.point.held.y * g.glove };
  const reach = { x:tip.x * Math.cos(a) - tip.y * Math.sin(a), y:tip.x * Math.sin(a) + tip.y * Math.cos(a) };
  /* the bridge sits 45% down the chip, over the photo's eyes; the finger
     goes just under it */
  const bridge = { x:0, y:g.top + size * 0.45 + size * 0.035 };
  /* down the nose far enough that the eyes clear the frames */
  return { turn, wrist:{ x:bridge.x - reach.x - g.hands.r.x, y:bridge.y - reach.y - g.hands.r.y }, drop:Math.round(size * 0.16) };
}

/* the burning chip: it comes down out of the top of the frame, tumbling
   slowly, and lands beside the side's outer glove, just clear of it, a
   fifth of it in the dirt. Its node is where it meets the floor. */
function emberMarks(squad, at) {
  const size = Math.round(144 * at.s);
  return { size, land:{ x:EW_STAGE.x + (squad.right + 64) * at.s, y:at.y }, center:-size * 0.3, from:{ x:330, y:-760 }, late:0.22 };
}

/* debris flung out of the fireball: [dx, dy] at the top of its arc, its turn */
const DEBRIS = Object.freeze([[-420, -330, 260], [-250, -470, -320], [300, -440, 400], [470, -260, -280], [120, -560, 220], [-560, -150, 300]]);

export function ExplosionWalk({ cast }) {
  const side = cast?.a || [];
  if (!side.length) return null;
  const squad = walkSquad(side.length);
  const shown = side.slice(0, squad.shown);
  /* a pair (Oct 13) both play the lead: both look over their glasses, a beat apart */
  const leads = i => i === 0 || squad.pair;
  const lagOf = i => squad.pair ? i * PAIR_LAG : 0;
  const p = walkProgress();
  const at = { start:walkAt(0), boom:walkAt(p.boom), land:walkAt(p.land), stop:walkAt(1) };
  const step = ({ y, s }) => `translateY(${px(y - EW_STAGE.floor)}) scale(${s})`;
  const size = squad.size, sk = size / CAST.size;
  const g = castGeometry(size);
  const shades = shadesReach(size);
  const ember = emberMarks(squad, at.land);
  const { blast } = EW_STAGE;
  const style = {
    "--ap0":step(at.start), "--ap1":step(at.boom), "--ap2":step(at.land), "--ap3":step(at.stop),
    "--to-shades":`translate(${px(shades.wrist.x)}, ${px(shades.wrist.y)}) rotate(${shades.turn}deg)`,
    "--shades-down":`translate(${px(shades.wrist.x)}, ${px(shades.wrist.y + shades.drop)}) rotate(${shades.turn}deg)`,
    "--shades-drop":`translateY(${px(shades.drop)})`, "--ember-from":`translate(${px(ember.from.x)}, ${px(ember.from.y)})`,
    /* where the slow motion lets go of it: the rest of the fall is at full speed */
    "--ember-late":`translate(${px(ember.from.x * ember.late)}, ${px(ember.from.y * ember.late)})`,
  };
  const wear = <span className="ew-node ew-shades-at" style={{ left:size / 2, top:size * 0.45 }}>
    <span className="ew-node ew-shades"><Sunglasses scale={sk} /></span>
  </span>;
  const leadWear = <span className="ew-node ew-shades-at" style={{ left:size / 2, top:size * 0.45 }}>
    <span className="ew-node ew-shades is-lead"><Sunglasses scale={sk} />
      <span className="ew-node ew-glint" style={{ left:-38 * sk, top:-4 * sk }}><Glint scale={0.9 * sk} /></span>
    </span>
  </span>;
  return (
    <div className="ew" style={style}>
      {/* far off, behind the horizon: the blast */}
      <div className="ew-far">
        {[[-120, 0.95, 0], [110, 1.05, 1], [0, 1.25, 2]].map(([dx, scale, i]) => (
          <span key={i} className="ew-node ew-stem" style={{ left:blast.x + dx, top:blast.y - 60, "--i":i }}>
            <SmokeCloud scale={scale} fire />
          </span>
        ))}
        <span className="ew-node ew-cap" style={{ left:blast.x, top:blast.y - 260 }}><SmokeCloud scale={2.1} fire /></span>
        <span className="ew-node ew-fireball" style={{ left:blast.x, top:blast.y }}>
          <span className="ew-node ew-boil"><Fireball scale={blast.scale} /></span>
        </span>
        {DEBRIS.map(([dx, dy, turn], i) => (
          <span key={i} className="ew-node ew-debris" style={{ left:blast.x, top:blast.y - 40, "--dx":px(dx), "--dy":px(dy),
            "--turn":`${turn}deg`, "--i":i }}>
            <svg className="ew-chunk" viewBox="-20 -16 40 32" width="40" height="32" aria-hidden="true">
              <path d={i % 2 ? "M-14,-8 L6,-12 L14,2 L2,12 L-12,6 Z" : "M-10,-10 L12,-6 L8,10 L-12,8 Z"} className="ew-chunk-ink" />
            </svg>
          </span>
        ))}
        <span className="ew-node ew-flash" style={{ left:blast.x, top:blast.y - 30 }}><MuzzleFlash scale={5} /></span>
      </div>
      {/* the burning chip, tumbling down, then stuck in the dirt beside it */}
      <span className="ew-node ew-ember" style={{ left:ember.land.x, top:ember.land.y }}>
        <span className="ew-node ew-ember-fall" style={{ top:ember.center }}>
          <span className="ew-node ew-ember-flame" style={{ top:-ember.size * 0.36 }}>
            <span className="ew-node ew-flicker"><Flame scale={0.95 * at.land.s} /></span>
          </span>
          <span className="ew-node ew-ember-turn"><LooseChip color="var(--bit-chip-red)" size={ember.size} /></span>
        </span>
        <span className="ew-node ew-ember-stuck">
          <span className="ew-node ew-ember-lean"><span className="ew-node" style={{ top:ember.center }}>
            <LooseChip color="var(--bit-chip-red)" size={ember.size} />
            {[[-0.26, 0.7, 0], [0.06, 1, 1], [0.32, 0.8, 2]].map(([dx, scale, i]) => (
              <span key={i} className="ew-node ew-ember-fire" style={{ left:dx * ember.size,
                top:-ember.size * Math.sqrt(Math.max(0, 0.25 - dx * dx)) + 4, "--i":i }}>
                <span className="ew-node ew-flicker"><Flame scale={scale * at.land.s} /></span>
              </span>
            ))}
          </span></span>
          {[0, 1].map(i => <span key={i} className="ew-node ew-smolder" style={{ left:ember.size * 0.02, top:ember.center - ember.size * 0.8, "--i":i }}>
            <Puff scale={0.8 * at.land.s} fill="var(--bit-soot-lit)" /></span>)}
          <svg className="ew-mound" viewBox="-80 -24 160 40" width={160 * at.land.s} height={40 * at.land.s}
            style={{ left:-80 * at.land.s, top:-24 * at.land.s }} aria-hidden="true">
            <path d="M-72,12 C-52,-12 -20,-18 0,-18 C20,-18 52,-12 72,12 Z" className="ew-mound-ink" strokeWidth={14 / at.land.s} />
            <path d="M-72,12 C-52,-12 -20,-18 0,-18 C20,-18 52,-12 72,12 Z" className="ew-mound-fill" />
          </svg>
        </span>
        <Dust className="ew-slam-dust" at={EW.land} puffs={DUST_LOW} spread={0.62 * at.land.s} size={0.72 * at.land.s} style={{ left:0, top:-4 }} />
      </span>
      {/* the side, walking toward us: one node, scaled about the feet */}
      <span className="ew-node ew-walk" style={{ left:EW_STAGE.x, top:EW_STAGE.floor }}>
        {shown.map((player, i) => ({ player, i })).reverse().map(({ player, i }) => (
          <CastChip key={player} player={player} size={size} x={squad.xs[i]} y={0} facing={0}
            className={`ew-walker ${leads(i) ? "is-lead" : "is-mate"}`} style={{ "--i":i, ...(squad.pair ? { "--pd":`${i * PAIR_LAG}ms` } : {}) }}
            hands={leads(i) ? { front:[["rest", 0], ["point", EW.lower - 120 + lagOf(i)], ["rest", EW.up + 240 + lagOf(i)]], back:"rest" }
              : { l:"rest", r:"rest" }}
            wear={leads(i) ? leadWear : wear} />
        ))}
        {squad.more > 0 && <span className="cast-more" style={{ left:squad.right + 24, top:g.center.y }}>
          <span className="cast-more-in fd-show" style={{ transform:"translate(0%, -50%)" }}>{`+${squad.more}`}</span>
        </span>}
      </span>
    </div>
  );
}

/* the camera's anchors: the side's middle as it walks, and the lead at
   its stop (the look) */
ExplosionWalk.anchors = cast => {
  const squad = walkSquad(cast?.a?.length || 1);
  /* a pair both look over their glasses: the look is the two of them */
  return { walk:EW_STAGE.x, lead:squad.pair ? EW_STAGE.x : EW_STAGE.x + squad.xs[0] };
};
