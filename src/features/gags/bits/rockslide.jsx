import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Alarm, Burst, SpeedLines, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE } from "../neon/neonArt.js";
import "./rockslide.css";

/* rockslide (versus, punchline): a mesa in neon at the left, its cliff
   dropping sheer to the floor on the right. The long shot (A) stands on
   top beside a boulder bigger than it is; the favorite (B) stands smug at
   the foot of the cliff. A leans over and looks down at it. Then the
   tiniest nudge: a hop, a bump, no hands. The boulder creeps to the edge
   and teeters there (the silence: B notices, tips back to look up, alarm,
   a sweat drop), goes over, and lands on B (the song comes in here):
   B is a pancake under it, dust puffing out both ways. A leans over the
   edge to look, and gives one small hop.

   World x: the mesa from 250 to its cliff at 880 (its top at y 580), A on
   top at 486, the boulder beside it at 740, B at 1010 under the edge. */
export const RK_STAGE = Object.freeze({ floor:930, chip:240, top:580, edge:880, a:486, rock:{ x:740, r:130 }, teeter:880, b:1010 });
export const RK_PANCAKE = Object.freeze({ x:1.55, y:0.17 });

const r1 = n => Math.round(n * 10) / 10;

/* the mesa: a talus slope on the left, the flat top, the sheer cliff on
   the right; strata across it, cracks down the cliff. Anchor: world 0 0. */
function Mesa() {
  const { floor, top, edge } = RK_STAGE;
  const cap = top + 118;
  const body = `M228 ${floor}L330 ${cap + 40}L352 ${cap}L360 ${top}L${edge} ${top}L${edge + 4} ${cap}L${edge + 10} ${floor}Z`;
  return <Neon box={[210, top - 30, edge - 160, floor - top + 50]} fills={[{ d:body }]} tubes={[
    { d:body, tone:"ember", w:TUBE.w },
    /* the caprock's band and the talus line under the cliff */
    { d:`M366 ${top + 24}L${edge - 6} ${top + 24}M352 ${cap}L${edge + 4} ${cap}`, tone:"ember", w:TUBE.thin, g:"cap" },
    /* the cliff's fluting, and scree down the talus */
    { d:[420, 480, 560, 620, 700, 760, 830].map((x, i) => `M${x} ${top + 40 + (i % 2) * 14}L${x + (i % 3) - 1} ${cap - 14 - (i % 2) * 20}`).join("")
      + `M${edge - 22} ${cap + 30}L${edge - 18} ${floor - 40}`, tone:"clay", w:TUBE.fine },
    { d:`M300 ${cap + 120}L340 ${cap + 120}M400 ${cap + 70}L452 ${cap + 70}M520 ${cap + 150}L590 ${cap + 150}M660 ${cap + 90}L720 ${cap + 90}`
      + `M268 ${floor - 30}L330 ${floor - 30}M760 ${cap + 170}L820 ${cap + 170}`, tone:"clay", w:TUBE.fine },
  ]} />;
}
/* the boulder: a lumpy rock in bone, its cracks. Anchor: its middle. */
const ROCK = "M-118 -30L-96 -92L-40 -128L30 -124L92 -96L126 -40L128 22L104 86L48 124L-22 128L-86 104L-124 50Z";
function Boulder() {
  return <Neon box={[-150, -150, 300, 300]} fills={[{ d:ROCK }]} tubes={[
    { d:ROCK, tone:"bone", w:TUBE.w },
    { d:"M-60 -70L-20 -30L-34 10M40 30L70 60M10 -96L20 -60", tone:"bone", w:TUBE.fine },
    { d:"M-80 -66C-60 -96 -20 -110 14 -108", tone:"cyan", w:TUBE.fine, g:"shine" },
  ]} />;
}
/* a puff of dust: three scallops, rolling out from the impact. Anchor:
   its foot on the floor. */
function Puff({ flip = false }) {
  const d = "M-70 0C-90 -30 -60 -60 -30 -46C-24 -84 26 -84 30 -48C60 -66 92 -34 70 0";
  return <Neon box={[-100, -96, 200, 110]} style={flip ? { transform:"scaleX(-1)" } : undefined}
    tubes={[{ d, tone:"bone", w:TUBE.thin }, { d:"M-40 0C-36 -16 -20 -20 -8 -12", tone:"bone", w:TUBE.fine }]} />;
}
/* a pebble kicked out by the landing. Anchor: its middle. */
function Pebble() {
  const d = "M-14 -6L-4 -14L12 -10L14 6L2 14L-12 8Z";
  return <Neon box={[-24, -24, 48, 48]} fills={[{ d }]} tubes={[{ d, tone:"ember", w:TUBE.thin }]} />;
}

const anchors = () => {
  const minX = 230, maxX = RK_STAGE.b + 150;
  return { minX, maxX, mid:Math.round((minX + maxX) / 2), top:760, drop:900, hit:RK_STAGE.b - 50, after:940 };
};

export function Rockslide({ cast }) {
  const a = cast?.a?.[0], b = cast?.b?.[0];
  if (!a || !b) return null;
  const { floor, chip, top, a:ax, rock, teeter, b:bx } = RK_STAGE;
  const r = chip / 2;
  /* the boulder's middle: at rest on the top, teetering on the edge, on
     B's head, and down on the pancake */
  const rest = { x:rock.x, y:top - rock.r };
  const edge = { x:teeter, y:rest.y };
  const head = { x:bx, y:floor - chip - rock.r + 8 };
  const flat = { x:bx, y:floor - chip * RK_PANCAKE.y - rock.r + 10 };
  const at = q => `translate(${r1(q.x - flat.x)}px, ${r1(q.y - flat.y)}px)`;
  const style = {
    "--rk-rest":at(rest), "--rk-edge":at(edge), "--rk-arc":at({ x:(edge.x + head.x) / 2 + 20, y:edge.y + 6 }), "--rk-head":at(head),
    "--rk-squash":`scale(${RK_PANCAKE.x}, ${RK_PANCAKE.y})`,
    /* A out to the brink at the end, its front over the edge */
    "--rk-scoot":`translate(${r1((RK_STAGE.edge - r - ax + 40) * 0.6)}px, -18px)`, "--rk-brink":`translate(${RK_STAGE.edge - r - ax + 40}px, 0px)`,
  };
  return (
    <div className="rks" style={style}>
      <span className="neon-node"><Mesa /></span>
      <NeonChip player={a} x={ax} y={top} className="rks-a" pool={false} />
      <NeonChip player={b} x={bx} y={floor} className="rks-b"
        wear={<>
          <span className="neon-node rks-alarm"><Alarm r={r} /></span>
          <span className="neon-node rks-sweat" style={{ left:-chip * 0.4, top:-chip * 0.46 }}><SweatDrop scale={1.1} /></span>
        </>} />
      {/* the dust and the pebbles out of the landing */}
      <span className="neon-node rks-puff is-l" style={{ left:bx - 180, top:floor }}><Puff flip /></span>
      <span className="neon-node rks-puff is-r" style={{ left:bx + 180, top:floor }}><Puff /></span>
      {[0, 1, 2].map(i => <span key={i} className={`neon-node rks-pebble is-${i}`} style={{ left:bx + (i - 1) * 60, top:floor - 40 }}><Pebble /></span>)}
      <span className="neon-node rks-hit" style={{ left:bx, top:floor - 40 }}><Burst n={14} r0={190} r1={290} tone="bone" /></span>
      {/* the boulder: placed where it ends, on the pancake */}
      <span className="neon-node rks-rock" style={{ left:flat.x, top:flat.y }}>
        <span className="neon-node rks-fall" style={{ top:-rock.r + 20 }}>
          <span className="neon-node" style={{ transform:"rotate(90deg)" }}><SpeedLines length={220} rows={[[-90, 0.8], [-30, 1], [30, 0.9], [90, 0.7]]} /></span>
        </span>
        <span className="neon-node rks-roll"><Boulder /></span>
      </span>
    </div>
  );
}
Rockslide.anchors = anchors;
