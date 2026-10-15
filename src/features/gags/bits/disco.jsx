import React from "react";
import { HouseHand, Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst } from "../neon/NeonProps.jsx";
import { HAND_POSES, TUBE, circlePath, ellipsePath, starPath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./disco.css";

const DC = bitById("disco").beats;

/* disco switch (win, music): the chip waits on a dark dance floor. On
   the right a neon panel on a post carries a big knife switch, open, its
   blades leaning out. The house hand comes in from the right, grips the
   switch's handle and winds it back a touch (the wind-up holds here, the
   hand straining on it). Throw: the blades slam home in their clips with
   a zap, the song starts, the panel's lamps go from clay to live, and a
   neon disco ball drops in from above on its chain, bounces, and lights:
   beams sweep the room, glints twinkle, the floor's tiles take turns on
   the beat, and the chip spins on its edge under the ball, on the beat.

   World: the chip at 900; the ball hangs over it at y 430; the panel from
   1230 to 1400, the switch hinged at (1315, 735). The switch turns about
   its hinge (.dc-lever); the hand rides a node on its handle turned back
   the other way (.dc-grip), so it keeps its angle as it throws. */
export const DC_STAGE = Object.freeze({
  x:900, floor:930, ball:Object.freeze({ x:900, y:420, r:98, chain:860 }),
  panel:Object.freeze({ x0:1230, x1:1400, y0:560, y1:770 }), hinge:Object.freeze({ x:1315, y:735 }), blade:150,
  grip:Object.freeze({ x:30, y:-150 }), hand:Object.freeze({ angle:198, scale:1.2 }),
});

const W = TUBE.w;
const r1 = n => Math.round(n * 10) / 10;

/* the switch's two cables, up out of the panel's top and over towards
   the ball's chain, off the top of the shot */
const cablesD = () => {
  const { y0 } = DC_STAGE.panel, { x:hx } = DC_STAGE.hinge;
  return [-14, 14].map(dx => `M${hx + dx} ${y0 + 14}L${hx + dx} ${y0 - 70}C${hx + dx} ${y0 - 150} ${hx + dx - 140} ${y0 - 150}`
    + ` ${hx + dx - 150} ${y0 - 260}L${hx + dx - 170} ${y0 - 700}`).join("");
};
const Cables = ({ tone, className }) => {
  const { y0 } = DC_STAGE.panel, { x:hx } = DC_STAGE.hinge;
  return <Neon box={[hx - 220, y0 - 720, 280, 760]} className={className} tubes={[{ d:cablesD(), tone, w:W * 0.45 }]} />;
};

function Panel() {
  const { x0, x1, y0, y1 } = DC_STAGE.panel;
  const { x:hx, y:hy } = DC_STAGE.hinge;
  const { floor } = DC_STAGE;
  const box = `M${x0 + 14} ${y0}L${x1 - 14} ${y0}Q${x1} ${y0} ${x1} ${y0 + 14}L${x1} ${y1 - 14}Q${x1} ${y1} ${x1 - 14} ${y1}L${x0 + 14} ${y1}`
    + `Q${x0} ${y1} ${x0} ${y1 - 14}L${x0} ${y0 + 14}Q${x0} ${y0} ${x0 + 14} ${y0}Z`;
  const clips = [-14, 14].map(dx => `M${hx + dx - 7} ${y0 + 14}L${hx + dx + 7} ${y0 + 14}L${hx + dx + 7} ${y0 + 34}L${hx + dx - 7} ${y0 + 34}Z`).join("");
  return <Neon box={[x0 - 30, y0 - 30, x1 - x0 + 60, floor - y0 + 50]} fills={[{ d:box }]} tubes={[
    /* the post and its foot */
    { d:`M${hx - 16} ${y1}L${hx - 16} ${floor}M${hx + 16} ${y1}L${hx + 16} ${floor}M${hx - 46} ${floor}L${hx + 46} ${floor}`, tone:"cyan", w:W * 0.6 },
    { d:box, tone:"cyan", w:W * 0.85 },
    { d:clips, tone:"bone", w:W * 0.6 },
    { d:[-14, 14].map(dx => circlePath(hx + dx, hy, 9)).join(""), tone:"bone", w:W * 0.55 },
    { d:[[x0 + 16, y0 + 16], [x1 - 16, y0 + 16]].map(([sx, sy]) => `M${sx - 4} ${sy}L${sx + 4} ${sy}`).join(""), tone:"cyan", w:W * 0.4 },
  ]} />;
}

/* the panel's two lamps: clay while it is off, live once it is on */
const Lamps = ({ tone, className }) => {
  const { x0, x1, y1 } = DC_STAGE.panel;
  return <Neon box={[x0, y1 - 80, x1 - x0, 80]} className={className}
    tubes={[{ d:`${circlePath(x0 + 26, y1 - 26, 9)}${circlePath(x1 - 26, y1 - 26, 9)}`, tone, w:W * 1.1 }]} />;
};

/* the switch, hinged at 0 0, its blades up */
function Lever() {
  const { blade } = DC_STAGE;
  return <Neon box={[-70, -blade - 40, 140, blade + 60]}
    fills={[{ d:`M-52 ${-blade - 11}L52 ${-blade - 11}L52 ${-blade + 11}L-52 ${-blade + 11}Z` }]}
    tubes={[
      { d:`M-14 0L-14 ${-blade + 6}M14 0L14 ${-blade + 6}`, tone:"bone", w:W * 0.9 },
      { d:"M-14 -96L14 -96", tone:"cyan", w:W * 0.7 },
      { d:`M-46 ${-blade}L46 ${-blade}`, tone:"amber", w:W * 1.6 },
    ]} />;
}

/* the disco ball, anchored at its middle: its body (the outline and the
   bands) and its facet lines in two frames that take turns (it turns) */
function Ball({ part = "body" }) {
  const { r } = DC_STAGE.ball;
  const bands = [-0.62, -0.31, 0, 0.31, 0.62].map(f => {
    const y = r * f, hw = Math.sqrt(r * r - y * y);
    return `M${r1(-hw)} ${r1(y)}Q0 ${r1(y + 10)} ${r1(hw)} ${r1(y)}`;
  }).join("");
  const box = [-r - 16, -r - 16, r * 2 + 32, r * 2 + 32];
  if (part === "body") return <Neon box={box} fills={[{ d:circlePath(0, 0, r) }]}
    tubes={[{ d:circlePath(0, 0, r), tone:"bone", w:W * 0.85 }, { d:bands, tone:"cyan", w:W * 0.42 }]} />;
  const meridians = (part === "b" ? [0.28, 0.72] : [0.5, 0.94]).map(k => ellipsePath(0, 0, r * k, r)).join("") + (part === "b" ? `M0 ${-r}L0 ${r}` : "");
  return <Neon box={box} tubes={[{ d:meridians, tone:"cyan", w:W * 0.42 }]} />;
}

/* beams off the ball, `angles` in degrees (90 is straight down) */
const Beams = ({ angles, className }) => {
  const { r } = DC_STAGE.ball;
  const tones = ["magenta", "amber", "cyan"];
  return <Neon box={[-900, -100, 1800, 1000]} className={className} tubes={angles.map(([a, t], i) => {
    const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
    return { d:`M${r1(c * (r + 10))} ${r1(s * (r + 10))}L${r1(c * 820)} ${r1(s * 820)}`, tone:tones[t], w:W * 0.55, g:`b${i}` };
  })} />;
};

/* the dance floor's tiles, in a little perspective: the even and the odd
   take turns once the music is on */
function Tiles({ odd = null }) {
  const { x, floor } = DC_STAGE;
  const top = floor + 4, bottom = floor + 52, vx = x, vy = floor - 330;
  const at = (px, py) => r1(vx + (px - vx) * (py - vy) / (top - vy));
  const xs = Array.from({ length:7 }, (_, i) => x - 330 + i * 110);
  const tiles = xs.slice(0, -1).map((a, i) => ({ i, d:`M${at(a + 6, top)} ${top}L${at(xs[i + 1] - 6, top)} ${top}`
    + `L${at(xs[i + 1] - 6, bottom)} ${bottom}L${at(a + 6, bottom)} ${bottom}Z` }));
  const mine = odd === null ? tiles : tiles.filter(tile => tile.i % 2 === (odd ? 1 : 0));
  const tone = odd ? "cyan" : "magenta";
  return <Neon box={[x - 420, top - 20, 840, bottom - top + 40]} className={odd === null ? "dc-tiles" : `dc-tiles is-${odd ? "odd" : "even"}`}
    fills={odd === null ? [] : mine.map(tile => ({ d:tile.d, fill:`color-mix(in srgb, var(--neon-${tone}) 30%, transparent)` }))}
    tubes={[{ d:mine.map(tile => tile.d).join(""), tone:odd === null ? "bone" : tone, w:W * (odd === null ? 0.3 : 0.5) }]} />;
}

const GLINTS = [[-150, -40], [130, -110], [-60, -170], [190, 40], [-230, 90], [70, 120], [-120, 60], [230, -60]];

export function Disco({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, ball, hinge, grip, hand } = DC_STAGE;
  const at = HAND_POSES.grip.at, a = hand.angle * Math.PI / 180;
  const wrist = { x:-(at.x * Math.cos(a) - at.y * Math.sin(a)) * hand.scale, y:-(at.x * Math.sin(a) + at.y * Math.cos(a)) * hand.scale };
  const links = Array.from({ length:Math.ceil(ball.chain / 22) }, (_, i) => ellipsePath(0, -ball.r - 12 - i * 22, i % 2 ? 3 : 6, 11)).join("");
  return (
    <div className="dc">
      <span className="neon-node" style={{ left:0, top:0 }}><Tiles /></span>
      <span className="neon-node" style={{ left:0, top:0 }}><Tiles odd={false} /><Tiles odd /></span>
      {/* the ball, hung from its chain's top (off screen); it drops in */}
      <span className="neon-node dc-hang" style={{ left:ball.x, top:ball.y - ball.chain }}>
        <span className="neon-node dc-sway">
          <span className="neon-node" style={{ top:ball.chain }}>
            <span className="neon-node dc-beams"><Beams className="dc-beams-a" angles={[[38, 0], [72, 1], [108, 0], [142, 1]]} /></span>
            <span className="neon-node dc-beams is-b"><Beams className="dc-beams-b" angles={[[55, 2], [90, 2], [125, 2]]} /></span>
            <Neon box={[-20, -ball.chain - 20, 40, ball.chain]} tubes={[{ d:links, tone:"bone", w:W * 0.4 }]} />
            <Ball />
            <span className="neon-node dc-turn is-a"><Ball part="a" /></span>
            <span className="neon-node dc-turn is-b"><Ball part="b" /></span>
            {GLINTS.slice(0, 4).map(([gx, gy], i) => <span key={i} className={`neon-node dc-glint is-${i}`}
              style={{ left:r1(gx * 0.32), top:r1(gy * 0.32) }}>
              <Neon box={[-20, -20, 40, 40]} tubes={[{ d:starPath(4, 16, 4), tone:"bone", w:W * 0.4 }]} /></span>)}
          </span>
        </span>
      </span>
      {/* glints thrown round the room */}
      {GLINTS.map(([gx, gy], i) => <span key={i} className={`neon-node dc-spark is-${i}`} style={{ left:ball.x + gx * 2.1, top:ball.y + 200 + gy * 1.6 }}>
        <Neon box={[-24, -24, 48, 48]} tubes={[{ d:starPath(4, 20, 5), tone:i % 3 === 0 ? "amber" : i % 3 === 1 ? "magenta" : "cyan", w:W * 0.45 }]} />
      </span>)}
      <NeonChip player={player} x={x} y={floor} className="dc-chip" />
      {/* the panel and its switch */}
      <span className="neon-node" style={{ left:0, top:0 }}><Cables tone="bone" className="dc-cables" /></span>
      <span className="neon-node dc-power" style={{ left:0, top:0 }}><Cables tone="amber" /></span>
      <span className="neon-node" style={{ left:0, top:0 }}><Panel /></span>
      <span className="neon-node dc-lamps is-off" style={{ left:0, top:0 }}><Lamps tone="clay" /></span>
      <span className="neon-node dc-lamps is-on" style={{ left:0, top:0 }}><Lamps tone="magenta" /></span>
      <span className="neon-node dc-zap" style={{ left:hinge.x, top:hinge.y - DC_STAGE.blade }}>
        <Burst n={10} r0={34} r1={96} tone="amber" />
        <Neon box={[-90, -90, 180, 120]} tubes={[{ d:"M-24 -8L-44 -30L-34 -34L-60 -62M24 -8L44 -30L34 -34L60 -62", tone:"cyan", w:W * 0.6 }]} />
      </span>
      <span className="neon-node dc-strain bit-hold-loop" style={{ left:hinge.x, top:hinge.y }}>
        <span className="neon-node dc-lever">
          <Lever />
          <span className="neon-node dc-grip" style={{ left:grip.x, top:grip.y }}>
            <HouseHand className="dc-hand" x={r1(wrist.x)} y={r1(wrist.y)} angle={hand.angle} scale={hand.scale}
              poses={[["flat", 0], ["grip", DC.grip]]} />
          </span>
        </span>
      </span>
    </div>
  );
}
