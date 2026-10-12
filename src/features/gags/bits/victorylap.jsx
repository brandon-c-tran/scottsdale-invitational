import React from "react";
import { usePlayerIdentity } from "../../identity/PlayerIdentityContext.js";
import { CAST, castGeometry, lineLayout } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { DUST_LOW, Dust } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./victorylap.css";

/* victorylap (team, win, action): the lap of honor, in slow motion. The
   team comes in from the right, small and far, round the back of the
   oval and the far turn, and down the straight toward us, every stride a
   long slow float. The lead carries a flag on a pole, a pennant in its
   own chip color rippling; the rest pump their fists, one and then the
   other. They pull up close; the lead plants the pole in the dirt and
   every fist goes up. They hold it. The wind drops: the pennant sags and
   hangs limp down the pole. The lead looks up at it.

   The team runs as one line on one path round the oval (keyframes
   computed here), every runner its own node scaled about its feet by its
   depth, its offset in the line scaled with it: a file down the far
   side, a line abreast down the straight, and never a clump. The line is
   lineLayout's, so each glove stays its owner's; every other runner from
   the lead drops a step back as they come near, so every face shows.
   Anchors: mid, minX, maxX (the line), lead and flag. */
const VL = bitById("victorylap").beats;
export const VL_STAGE = Object.freeze({ x:960, floor:CAST.floor, far:868, zoom:1.4, back:0.12, from:-0.2, keys:13 });

const r1 = n => Math.round(n * 10) / 10 || 0;
/* depth (0 far, 1 at the stop) to the feet's y and the size */
const depthAt = d => ({ y:VL_STAGE.far + (VL_STAGE.floor - VL_STAGE.far) * d, s:0.4 + 0.6 * d });
/* the oval, as the lead's feet: x from the middle and depth, by how far
   along the lap (u, 0 to 1; below 0 is still coming in from the right) */
function lapAt(u, rx) {
  const bend = 0.62, a0 = 15 * Math.PI / 180, a1 = 270 * Math.PI / 180;
  if (u < 0) return { x:rx * Math.cos(a0) - u * 3.2 * rx, d:0.3 - 0.3 * Math.sin(a0) - u * 0.5 };
  if (u <= bend) {
    const a = a0 + (a1 - a0) * u / bend;
    return { x:rx * Math.cos(a), d:0.3 - 0.3 * Math.sin(a) };
  }
  return { x:0, d:0.6 + 0.4 * (u - bend) / (1 - bend) };
}
/* the lap slows into the stop */
const easeLap = t => 1 - Math.pow(1 - t, 1.4);

export function lapStaging(cast) {
  const players = cast?.a || [];
  const line = lineLayout(Math.max(1, players.length));
  const n = line.shown;
  const lead = Math.floor((n - 1) / 2);
  const span = line.half * 2;
  const zoom = Math.min(VL_STAGE.zoom, (1920 - 128) / Math.max(1, span));
  /* the oval as wide as the shot holds the line at its far turn */
  const W = 960 / zoom;
  const rx = Math.max(120, Math.min(W * 0.62, W - line.half * depthAt(0.3).s - 40));
  /* every other runner from the lead a step back */
  const slots = line.xs.map((x, i) => {
    const back = Math.abs(i - lead) % 2 === 1 ? VL_STAGE.back : 0;
    return { x, d:1 - back };
  });
  const runners = slots.map((slot, i) => {
    const keys = Array.from({ length:VL_STAGE.keys }, (_, k) => {
      const u = VL_STAGE.from + (1 - VL_STAGE.from) * easeLap(k / (VL_STAGE.keys - 1));
      const head = lapAt(u, rx);
      /* the back runners drop back as the line comes near */
      const d = head.d - (1 - slot.d) * head.d;
      const { y, s } = depthAt(d);
      /* the line's spacing is the front's, so a runner a step back never
         closes on its neighbours */
      return { x:r1(head.x + slot.x * depthAt(head.d).s), y:r1(y - VL_STAGE.floor), s:Math.round(s * 1000) / 1000 };
    });
    return { slot, keys, lead:i === lead };
  });
  const size = line.size;
  const g = castGeometry(size);
  const leadX = VL_STAGE.x + slots[lead].x;
  const pole = leadX + g.hands.r.x + GLOVE_POSES.grip.held.x * g.glove;
  return { line, runners, lead, size, minX:Math.round(VL_STAGE.x - line.half), maxX:Math.round(VL_STAGE.x + line.half),
    mid:VL_STAGE.x, leadX:Math.round(leadX), pole:Math.round(pole) };
}

/* the flag: a pole and a pennant in the lead's own chip color, a bone
   stripe through it. Anchor: where the fist closes on the pole. */
function Flag({ player, size }) {
  const identity = usePlayerIdentity(player);
  const below = Math.round(size * 0.66), above = Math.round(size * 1.62);
  const w = Math.round(size * 0.92), h = Math.round(size * 0.5), pw = Math.max(8, Math.round(size * 0.05));
  const line = CAST.line;
  const pennant = `M0,0 C${w * 0.3},${h * 0.06} ${w * 0.6},${h * 0.3} ${w},${h * 0.48} C${w * 0.6},${h * 0.62} ${w * 0.3},${h * 0.86} 0,${h} Z`;
  const stripe = `M0,${h * 0.36} C${w * 0.3},${h * 0.4} ${w * 0.55},${h * 0.46} ${w * 0.82},${h * 0.49} C${w * 0.55},${h * 0.54} ${w * 0.3},${h * 0.6} 0,${h * 0.64} Z`;
  const box = { x:-pw - line * 2, y:-above - pw - line * 2, w:w + pw * 2 + line * 4, h:above + below + pw * 2 + line * 4 };
  return (
    <span className="vl-node vl-flag">
      <svg className="vl-pole" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width={box.w} height={box.h}
        style={{ left:box.x, top:box.y }} aria-hidden="true">
        <path d={`M0,${below} L0,${-above}`} className="vl-ink" strokeWidth={pw + line * 2} />
        <path d={`M0,${below} L0,${-above}`} className="vl-pole-paint" strokeWidth={pw} />
        <circle cx="0" cy={-above - pw * 0.4} r={pw * 0.95} className="vl-knob" strokeWidth={line} />
      </svg>
      {/* the pennant hangs off the pole's top: it ripples, and then it sags */}
      <span className="vl-node vl-pennant-at" style={{ left:pw / 2, top:-above + pw * 0.6 }}>
        <span className="vl-node vl-sag"><span className="vl-node vl-ripple">
          <svg className="vl-pennant" viewBox={`${-line} ${-line} ${w + line * 2} ${h + line * 2}`} width={w + line * 2} height={h + line * 2}
            style={{ left:-line, top:-line }} aria-hidden="true">
            <path d={pennant} className="vl-ink" strokeWidth={line * 2} />
            <path d={pennant} style={{ fill:identity.color }} />
            <path d={stripe} style={{ fill:"var(--bone)" }} />
            <path d={`M0,${h * 0.7} C${w * 0.3},${h * 0.8} ${w * 0.4},${h * 0.66} ${w * 0.7},${h * 0.56} C${w * 0.4},${h * 0.76} ${w * 0.25},${h * 0.92} 0,${h} Z`}
              style={{ fill:`color-mix(in srgb, ${identity.color} 60%, var(--ink0))` }} />
          </svg>
        </span></span>
      </span>
    </span>
  );
}

export function Victorylap({ cast }) {
  const players = cast?.a || [];
  if (!players.length) return null;
  const s = lapStaging(cast);
  const { line, size } = s;
  const shown = players.slice(0, line.shown);
  /* the back runners first, the lead last (nearest, on top) */
  const drawn = shown.map((player, i) => ({ player, i, runner:s.runners[i] }))
    .sort((p, q) => p.runner.slot.d - q.runner.slot.d || Number(p.runner.lead) - Number(q.runner.lead));
  return (
    <div className="vl" style={{ "--bob":`${r1(-size * 0.16)}px`, "--pump":`translate(${r1(-size * 0.06)}px, ${r1(-size * 0.34)}px) rotate(-24deg) scale(1.08)`,
      "--raise-r":`translate(${r1(-size * 0.1)}px, ${r1(-size * 0.5)}px) rotate(-62deg)`,
      "--raise-l":`translate(${r1(size * 0.1)}px, ${r1(-size * 0.5)}px) rotate(-62deg)`,
      "--tuck-r":`translate(${r1(-size * 0.2)}px, ${r1(size * 0.03)}px) rotate(0deg)`, "--tuck-l":`translate(${r1(size * 0.2)}px, ${r1(size * 0.03)}px) rotate(0deg)`,
      "--thrust":`translateY(${r1(size * 0.05)}px)` }}>
      {drawn.map(({ player, i, runner }) => (
        <span key={player} className={`vl-node vl-run${runner.lead ? " is-lead" : ""}`}
          style={{ left:VL_STAGE.x, top:VL_STAGE.floor, ...Object.fromEntries(runner.keys.map((key, k) =>
            [`--k${k}`, `translate(${key.x}px, ${key.y}px) scale(${key.s})`])) }}>
          <CastChip player={player} size={size} x={0} y={0} facing={0} className={`vl-runner ${runner.lead ? "is-lead" : "is-mate"}`}
              style={{ "--i":i }}
              hands={runner.lead ? { r:"grip", l:"fist" } : { l:"fist", r:"fist" }}
              hold={runner.lead ? { r:<Flag player={player} size={size} /> } : {}} />
        </span>
      ))}
      {/* the pole goes into the dirt */}
      <span className="vl-node" style={{ left:s.pole, top:VL_STAGE.floor }}>
        <Dust className="vl-plant-dust" at={VL.plant} puffs={DUST_LOW} spread={size / 520} size={size / 340} style={{ left:0, top:-2 }} />
      </span>
      {line.more > 0 && <span className="cast-more" style={{ left:s.maxX + 16, top:VL_STAGE.floor - size * 0.6 }}>
        <span className="cast-more-in fd-show" style={{ transform:"translate(0%, -50%)" }}>{`+${line.more}`}</span>
      </span>}
    </div>
  );
}

Victorylap.anchors = cast => {
  const s = lapStaging(cast);
  return { mid:s.mid, minX:s.minX, maxX:s.maxX, lead:s.leadX, flag:Math.round((s.leadX + s.pole) / 2 + s.size * 0.3) };
};
