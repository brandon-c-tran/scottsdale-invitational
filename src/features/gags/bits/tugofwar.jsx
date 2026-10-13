import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { DUST_LOW, Dust, Emanata, SweatDrop } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./tugofwar.css";

const TW = bitById("tugofwar").beats;

/* tugofwar (team, versus, slapstick): a rope across a cactus patch. The
   underdogs (a) stand left facing right, the favorites (b) right facing
   left, each side one line along the rope, every chip holding it with
   both gloves in front of its own body (the rope runs through each fist:
   each chip carries its own length of it in its first glove, drawn behind
   the fingers, so the lengths abut into one rope). The favorites lean
   back, smug, and walk the rope their way; the underdogs, dragged, shake
   and sweat. They wind up; ONE yank: the rope zips out of the favorites'
   gloves and they are flung over the patch, tumbling, and land in it all
   at once, stuck: the front ones down in the low pads, the rest perched
   on the tall ones behind (staggered, so every face shows). A pause. Then
   a chorus of little ouch marks, one over each, left to right, each a
   jolt; then one of them hops straight up and comes back down. Ouch.

   The staging: both lines and the patch share one chip size, as big as
   lets the whole thing (the larger the sides, the smaller) span the
   shot's width; a line steps 0.85 of a chip, alternate chips a hair in
   front (as a real line stands either side of its rope), the gloves well
   inside each chip's own rim. The patch is as wide as the favorites'
   landing (two tiers, 0.6 of a chip apart). */
export const TW_STAGE = Object.freeze({ mid:960, floor:CAST.floor, span:1640, maxSize:190, max:7,
  /* in chips: a line's step, the free rope either side of the patch, the
     landing's step, the rope's height, its tail, the tug, the heave back */
  pitch:0.85, gap:0.3, slot:0.6, rope:0.3, tail:0.42, tug:0.14, back:0.24,
  /* the back tier: its depth, how high the tall pads hold it, its size */
  depth:18, raise:0.8, backK:0.86, front:10,
  /* the lean back (degrees): the favorites' smug lean, the underdogs' strain */
  lean:16 });

const r1 = n => Math.round(n * 10) / 10 || 0;
const px = n => `${r1(n)}px`;
/* a chip's centre to the far end of its front fist, and past a back chip
   (its rim, its lean, the rope's tail) */
const FRONT = 0.38, REACH = 0.86;
const TILTS = [6, -8, 4, -5, 9, -3, 7];
/* the favorites hold on until the rope goes, their gloves fly open, and
   they hang limp once they are stuck */
const LET_GO = Object.freeze({ l:[["grip", 0], ["open", TW.yank], ["rest", TW.land]], r:[["grip", 0], ["open", TW.yank], ["rest", TW.land]] });
/* the hopper's fly open again as it goes up, and drop as it comes down */
const HOPPER = Object.freeze({ l:[...LET_GO.l, ["open", TW.hop], ["rest", TW.sting]], r:[...LET_GO.r, ["open", TW.hop], ["rest", TW.sting]] });

export function tugStaging(na = 3, nb = 3) {
  const A = Math.max(1, Math.min(TW_STAGE.max, na || 1)), B = Math.max(1, Math.min(TW_STAGE.max, nb || 1));
  const { pitch:p, gap, slot:q, mid, floor } = TW_STAGE;
  const land = (B - 1) * q + 1, patch = land + 0.5;
  const units = REACH + (A - 1) * p + FRONT + gap + patch + gap + FRONT + (B - 1) * p + REACH;
  const s = Math.min(TW_STAGE.maxSize, Math.floor(TW_STAGE.span / units));
  const left = mid - units * s / 2;
  const aBack = left + REACH * s, aFront = aBack + (A - 1) * p * s;
  const patchL = aFront + (FRONT + gap) * s, patchR = patchL + patch * s;
  const bFront = patchR + (gap + FRONT) * s, bBack = bFront + (B - 1) * p * s;
  const ax = Array.from({ length:A }, (_, i) => r1(aFront - i * p * s));
  const bx = Array.from({ length:B }, (_, i) => r1(bFront + i * p * s));
  /* the landing, left to right: front tier on the even slots, down in the
     low pads; the back tier on the odd ones, up on the tall pads */
  const slots = Array.from({ length:B }, (_, j) => {
    const back = j % 2 === 1;
    const k = back ? TW_STAGE.backK : 1;
    const x = r1(patchL + 0.75 * s + j * q * s);
    const ground = back ? floor - TW_STAGE.depth : floor + TW_STAGE.front;
    /* where the feet come to rest: the back tier up on its pads, the
       front tier sunk a little into its */
    const feet = back ? ground - TW_STAGE.raise * s : ground + 0.05 * s;
    return { j, back, k, x, ground, feet, top:r1(feet - castGeometry(s * k).size * (1 + 0.085)) };
  });
  /* the hopper: the front-tier one nearest the middle of the patch */
  const centre = (patchL + patchR) / 2;
  const hopper = slots.filter(slot => !slot.back).reduce((best, slot) => !best || Math.abs(slot.x - centre) < Math.abs(best.x - centre) ? slot : best, null).j;
  return { A, B, s, ax, bx, aBack, aFront, bFront, bBack, patchL, patchR, slots, hopper, rope:r1(floor - TW_STAGE.rope * s),
    minX:Math.round(left), maxX:Math.round(left + units * s), centre:Math.round(centre) };
}

/* a length of rope: flat cut ends so lengths abut, a rounded cap at a
   tail's end ("start" or "end", in its own box) */
const Rope = ({ x0, x1, y, h, cap = null, className = "", style }) => (
  <span className={`tw-rope${cap ? ` is-cap-${cap}` : ""}${className ? ` ${className}` : ""}`}
    style={{ left:r1(x0), top:r1(y - h / 2), width:r1(x1 - x0), height:r1(h), ...style }} />
);

/* ── the patch: prickly pear, flat pads in the desert's cactus inks ── */
const ellipse = (cx, cy, rx, ry, deg = 0) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
  const p = (x, y) => `${(cx + x * c - y * si).toFixed(1)},${(cy + x * si + y * c).toFixed(1)}`;
  return `M${p(-rx, 0)}A${rx},${ry} ${deg} 1 0 ${p(rx, 0)}A${rx},${ry} ${deg} 1 0 ${p(-rx, 0)}Z`;
};
/* one pad: inked, painted, lit down one side, spines as bone ticks, and
   maybe a fruit on its rim */
function Pad({ x, y, rx, ry, deg = 0, fruit = false }) {
  const a = deg * Math.PI / 180;
  const along = (t, u) => [x + (t * rx) * Math.cos(a) - (u * ry) * Math.sin(a), y + (t * rx) * Math.sin(a) + (u * ry) * Math.cos(a)];
  const spines = [[-0.5, -0.4], [0.35, -0.55], [-0.2, 0.1], [0.5, 0.2], [0, 0.6], [-0.55, 0.45]].map(([t, u]) => along(t, u));
  const [fx, fy] = along(0.25, -0.98);
  return <g>
    <path d={ellipse(x, y, rx, ry, deg)} className="tw-ink" strokeWidth={CAST.line * 2} />
    <path d={ellipse(x, y, rx, ry, deg)} className="tw-pad" />
    <path d={ellipse(...along(-0.42, -0.1), rx * 0.32, ry * 0.7, deg)} className="tw-pad-lit" />
    {spines.map(([sx, sy], i) => <path key={i} d={`M${sx.toFixed(1)},${sy.toFixed(1)} l${i % 2 ? 6 : -6},-5`} className="tw-spine" />)}
    {fruit && <><path d={ellipse(fx, fy - 6, 9, 12, deg)} className="tw-ink" strokeWidth={10} />
      <path d={ellipse(fx, fy - 6, 9, 12, deg)} className="tw-fruit" /></>}
  </g>;
}
function Patch({ st, layer }) {
  const { s, slots, patchL, patchR } = st;
  const floor = TW_STAGE.floor;
  const pads = [];
  if (layer === "back") {
    /* a tall stack under each back-tier landing, its top pad just under the feet */
    for (const slot of slots.filter(slot => slot.back)) {
      const g = slot.ground, h = g - slot.feet, x = slot.x;
      pads.push({ x:x - 0.05 * s, y:g - h * 0.27, rx:0.2 * s, ry:h * 0.29, deg:-7 });
      pads.push({ x:x + 0.07 * s, y:g - h * 0.6, rx:0.17 * s, ry:h * 0.24, deg:13, fruit:slot.j % 4 === 1 });
      pads.push({ x:x - 0.02 * s, y:g - h * 0.86, rx:0.15 * s, ry:h * 0.17, deg:-4 });
    }
    /* low pads behind, at either end */
    pads.push({ x:patchL + 0.2 * s, y:floor - TW_STAGE.depth - 0.16 * s, rx:0.16 * s, ry:0.2 * s, deg:-20, fruit:true });
    pads.push({ x:patchR - 0.18 * s, y:floor - TW_STAGE.depth - 0.18 * s, rx:0.15 * s, ry:0.22 * s, deg:18 });
  } else {
    /* low pads along the front, round each front-tier landing's feet */
    for (const slot of slots.filter(slot => !slot.back)) {
      const g = slot.ground, x = slot.x;
      pads.push({ x:x - 0.25 * s, y:g - 0.1 * s, rx:0.17 * s, ry:0.14 * s, deg:-28 });
      pads.push({ x:x + 0.24 * s, y:g - 0.1 * s, rx:0.16 * s, ry:0.13 * s, deg:24, fruit:slot.j % 4 === 0 });
      pads.push({ x:x + 0.02 * s, y:g - 0.02 * s, rx:0.24 * s, ry:0.1 * s, deg:-3 });
    }
    pads.push({ x:patchL + 0.12 * s, y:floor + TW_STAGE.front - 0.06 * s, rx:0.13 * s, ry:0.1 * s, deg:-12 });
    pads.push({ x:patchR - 0.12 * s, y:floor + TW_STAGE.front - 0.07 * s, rx:0.14 * s, ry:0.11 * s, deg:15 });
  }
  return (
    <svg className={`tw-patch is-${layer}`} viewBox="0 0 1920 1080" width="1920" height="1080" aria-hidden="true">
      {layer === "back" && <ellipse cx={r1((patchL + patchR) / 2)} cy={floor + 4} rx={r1((patchR - patchL) / 2 + 0.1 * s)} ry={r1(0.11 * s)}
        className="tw-patch-ground" />}
      {pads.map((pad, i) => <Pad key={i} {...pad} />)}
    </svg>
  );
}

export function Tugofwar({ cast }) {
  const a = (cast?.a || []).slice(0, TW_STAGE.max), b = (cast?.b || []).slice(0, TW_STAGE.max);
  const st = tugStaging(a.length, b.length);
  const { s, slots } = st;
  const g = castGeometry(s);
  const gl = g.glove;
  const held = GLOVE_POSES.grip.held;
  const hx = held.x * gl, hy = held.y * gl;
  const p = TW_STAGE.pitch * s, tail = TW_STAGE.tail * s, ropeH = Math.max(10, Math.round(0.08 * s)) + 10;
  const ropeUp = TW_STAGE.rope * s;
  /* where the gloves go on the rope (the wrists, from the feet): each
     chip's two fists side by side in front of its own body */
  const wrist = { a:{ l:-0.36 * s, r:0.04 * s }, b:{ l:-0.04 * s, r:0.36 * s } };
  const onRope = (x, side) => `translate(${px(x - g.hands[side].x)}, ${px(-ropeUp - g.hands[side].y)}) rotate(0deg)`;
  /* the favorites' gloves fly up open as the rope goes, and hang limp in
     front of their own chip once it is stuck */
  const sign = side => side === "l" ? -1 : 1;
  const upB = side => `translate(${px(sign(side) * 0.64 * s - g.hands[side].x)}, ${px(-0.98 * s - g.hands[side].y)}) rotate(${sign(side) * 14}deg)`;
  const cheekB = side => `translate(${px(sign(side) * 0.4 * s - g.hands[side].x)}, ${px(-0.4 * s - g.hands[side].y)}) rotate(${sign(side) * -8}deg)`;
  const tug = TW_STAGE.tug * s;
  /* the rope each chip carries in its first (left) glove: its share of the
     line, the back one's with the tail, in the glove's own box (the
     underdogs' left glove is turned back to face the patch; the
     favorites' faces it already, mirrored) */
  const stub = (team, back) => {
    const w = wrist[team].l;
    const c0 = team === "a" ? -p / 2 - (back ? tail : 0) : -p / 2;
    const c1 = team === "a" ? p / 2 : p / 2 + (back ? tail : 0);
    const [x0, x1] = team === "a" ? [c0 - w - hx, c1 - w - hx] : [-(c1 - w) - hx, -(c0 - w) - hx];
    return <Rope x0={x0} x1={x1} y={-hy} h={ropeH} cap={back ? "start" : null} />;
  };
  const leanShift = ropeUp * Math.sin(TW_STAGE.lean * Math.PI / 180);
  /* the rope across the patch, from fist to fist, and the one that zips:
     the patch's rope and the favorites' share, yanked left */
  const patchRope = { x0:st.aFront + 0.33 * s, x1:st.bFront - 0.33 * s };
  const zip = { x0:patchRope.x0 + tug, x1:st.bBack + p / 2 + tail + tug + leanShift };
  const zipBy = zip.x1 - (st.aFront + 0.2 * s);
  /* the chorus: each landing's ouch, left to right, over 640 ms */
  const chorus = j => st.B > 1 ? Math.round(j * 640 / (st.B - 1)) : 0;
  const teamVars = {
    "--tug":px(tug), "--heave":px(tug - TW_STAGE.back * s),
  };
  const aVars = { "--rope-l":onRope(wrist.a.l, "l"), "--rope-r":onRope(wrist.a.r, "r") };
  const bVars = { "--rope-l":onRope(wrist.b.l, "l"), "--rope-r":onRope(wrist.b.r, "r"), "--up-l":upB("l"), "--up-r":upB("r"),
    "--cheek-l":cheekB("l"), "--cheek-r":cheekB("r"), "--lean":`${TW_STAGE.lean}deg` };
  const sweat = <span className="tw-sweat" style={{ left:r1(0.82 * s), top:r1(0.16 * s) }}><SweatDrop scale={s / 240 * 1.05} /></span>;
  /* the underdogs: alternate chips a hair in front (drawn last) */
  const aOrder = a.map((player, i) => ({ player, i })).sort((x, y) => (y.i % 2) - (x.i % 2));
  /* the favorites, drawn back tier first so the front tier lands in front */
  const bOrder = b.map((player, i) => ({ player, i, slot:slots[st.B - 1 - i] })).sort((x, y) => Number(y.slot.back) - Number(x.slot.back));
  return (
    <div className="tw" style={teamVars}>
      <Patch st={st} layer="back" />
      <div className="tw-a" style={aVars}>
        {aOrder.map(({ player, i }) => (
          <CastChip key={player} player={player} size={s} x={st.ax[i]} y={TW_STAGE.floor} facing={1} className="tw-pull"
            hands={{ l:"grip", r:"grip" }} hold={{ l:stub("a", i === st.A - 1) }} wear={sweat} style={{ "--i":i }} />
        ))}
      </div>
      <div className="tw-b" style={bVars}>
        {bOrder.map(({ player, i, slot }) => {
          const dx = slot.x - st.bx[i], dy = (slot.back ? slot.ground : slot.feet) - TW_STAGE.floor;
          const raise = slot.back ? (slot.ground - slot.feet) / slot.k : 0;
          const peak = (0.75 * s + Math.abs(dx) * 0.2) / slot.k;
          const tumble = -360 + TILTS[slot.j % TILTS.length];
          const c = g.center.y;
          return (
            <CastChip key={player} player={player} size={s} x={st.bx[i]} y={TW_STAGE.floor} facing={-1}
              className={`tw-fav${slot.back ? " is-back" : " is-front"}${slot.j === st.hopper ? " is-hopper" : ""}`}
              hands={slot.j === st.hopper ? HOPPER : LET_GO} hold={{ l:stub("b", i === st.B - 1) }}
              style={{ "--i":i, "--o":`${chorus(slot.j)}ms`, "--land":`translate(${px(dx)}, ${px(dy)}) scale(${slot.k})`,
                "--rz":px(-raise), "--pk":px(-raise - peak), "--jz":px(-raise - 0.12 * s), "--hz":px(-raise - 0.95 * s),
                "--tumble":`${tumble}deg`, "--c":px(-c), "--cn":px(c) }} />
          );
        })}
      </div>
      <Rope className="tw-patch-rope" x0={patchRope.x0} x1={patchRope.x1} y={st.rope} h={ropeH} />
      <Rope className="tw-zip" x0={zip.x0} x1={zip.x1} y={st.rope} h={ropeH} cap="end" style={{ "--zip":px(-zipBy) }} />
      <Patch st={st} layer="front" />
      <Dust className="tw-dust" at={TW.land} puffs={DUST_LOW} spread={(st.patchR - st.patchL) / 560} size={s / 240}
        style={{ left:st.centre, top:TW_STAGE.floor + 2 }} />
      {/* a little heel dust as the underdogs are dragged */}
      <Dust className="tw-drag" at={TW.lean + 120} puffs={DRAG} spread={s / 240} size={0.55 * s / 240}
        style={{ left:st.aFront, top:TW_STAGE.floor - 4 }} />
      {/* the ouches: one over each, left to right; the hopper's a big one when it comes down */}
      {slots.map(slot => {
        const k = s / 240 * slot.k;
        return <span key={slot.j} className={`tw-node tw-ouch${slot.j === st.hopper ? " is-hopper" : ""}`}
          style={{ left:r1(slot.x - 0.18 * s * slot.k), top:r1(slot.top + 0.02 * s), "--o":`${chorus(slot.j)}ms` }}>
          <Emanata rays={OUCH} width={8} scale={1.25 * k} />
        </span>;
      })}
      {(() => {
        const slot = slots[st.hopper], k = s / 240;
        return <span className="tw-node tw-sting" style={{ left:r1(slot.x), top:r1(slot.top - 0.04 * s) }}>
          <Emanata rays={STING} width={10} scale={1.5 * k} />
        </span>;
      })()}
    </div>
  );
}
/* the ouch: little strokes fanned up and out over a head */
const OUCH = Object.freeze([[-160, 22, 44], [-125, 24, 52], [-90, 26, 56], [-55, 24, 52], [-20, 22, 44]]);
const STING = Object.freeze([[-170, 30, 62], [-140, 32, 72], [-110, 34, 80], [-70, 34, 80], [-40, 32, 72], [-10, 30, 62]]);
/* heels ploughing toward the patch */
const DRAG = Object.freeze([[-40, -26, 0.8], [-80, -14, 0.65], [-10, -38, 0.6], [-110, -24, 0.5]]);

/* the camera's anchors: "mid" both lines and the patch, "a" the
   underdogs, "patch" the landing; minX to maxX the span */
Tugofwar.anchors = cast => {
  const st = tugStaging(cast?.a?.length || 1, cast?.b?.length || 1);
  return { mid:Math.round((st.minX + st.maxX) / 2), minX:st.minX, maxX:st.maxX, patch:st.centre,
    a:Math.round((st.aBack + st.aFront) / 2) };
};
