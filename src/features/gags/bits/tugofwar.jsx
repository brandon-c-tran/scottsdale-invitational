import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst, DizzyStars, SweatDrop } from "../neon/NeonProps.jsx";
import { TUBE } from "../neon/neonArt.js";
import "./tugofwar.css";

/* tugofwar (team versus, punchline): a neon line on the floor between
   the sides; each side stands in a file, a neon rope tied round it (a
   loop of tube, its back behind the chips and its front over them), the
   two loops tied together over the line, a magenta ribbon on the knot.
   Both sides lean back, straining. The favorites (b, right) gain: the
   rig slides their way in two tugs, the underdogs (a, left) dragged and
   sweating, the favorites bobbing, smug. The underdogs dig in (squash
   down, dust at their feet) and YANK: the rope whips out of the
   favorites' loop (it dies), and the favorites fly over the line,
   spinning, into a heap at the underdogs' feet (the song), stars going
   round it. The underdogs straighten up and bounce once.

   World x, in chips from the line (TW_STAGE.mid): the files stand `reach`
   either side, `file` apart; the rig gains `gain` and the underdogs are
   yanked back `yank`. Every side is sized so the whole scene fits. */
export const TW_STAGE = Object.freeze({ mid:960, floor:930, budget:1560, max:220,
  reach:1.45, file:0.72, gain:0.35, yank:1.3, ropeY:0.44, heapStep:0.8, heapRise:0.6 });

/* the heap's rows, bottom first, for a side of n */
const HEAP_ROWS = [[1], [2], [2, 1], [2, 2], [3, 2], [3, 2, 1], [3, 3, 1]];
/* how each lands: its turn, and a small offset (in chips) so the pile is a jumble */
const HEAP_LIE = [[-24, 0.04], [31, -0.06], [-52, 0.02], [14, 0.05], [-36, -0.04], [62, 0.03], [-12, 0]];

const px = n => `${Math.round(n * 10) / 10}px`;
const ms = n => `${Math.round(n)}ms`;
const r1 = n => Math.round(n * 10) / 10;

/* a loop round a file: its back (over the top) and its front (under) */
const loopBack = (cx, cy, rx, ry) => `M${r1(cx - rx)} ${r1(cy)}A${r1(rx)} ${r1(ry)} 0 0 1 ${r1(cx + rx)} ${r1(cy)}`;
const loopFront = (cx, cy, rx, ry) => `M${r1(cx + rx)} ${r1(cy)}A${r1(rx)} ${r1(ry)} 0 0 1 ${r1(cx - rx)} ${r1(cy)}`;

export function tugStaging(na = 2, nb = 2) {
  const { reach, file, gain, yank, budget, max, mid } = TW_STAGE;
  const a = Math.max(1, Math.min(7, na)), b = Math.max(1, Math.min(7, nb));
  const aU = Array.from({ length:a }, (_, k) => -reach - k * file);
  const bU = Array.from({ length:b }, (_, k) => reach + k * file);
  /* the heap, just past the line on the underdogs' side */
  const rows = HEAP_ROWS[b - 1];
  const heapU = [];
  rows.forEach((m, r) => {
    for (let j = 0; j < m; j++) heapU.push({ x:-0.15 - TW_STAGE.heapStep * (rows[0] - 1) / 2 - 0.42 + (j - (m - 1) / 2) * TW_STAGE.heapStep,
      y:-r * TW_STAGE.heapRise });
  });
  const lo = aU[a - 1] + gain - yank - 0.72, hi = bU[b - 1] + gain + 0.62;
  const units = hi - lo;
  const size = Math.round(Math.min(max, budget / units));
  /* the line sits where the span's middle puts it */
  const line = Math.round(mid + (-(lo + hi) / 2) * size);
  const at = u => Math.round(line + u * size);
  return { a, b, size, line, ax:aU.map(at), bx:bU.map(at), heap:heapU.map(p => ({ x:at(p.x), y:Math.round(p.y * size) })),
    gain:Math.round(gain * size), yank:Math.round(yank * size), minX:at(lo), maxX:at(hi), heapTop:rows.length };
}

export function TugOfWar({ cast }) {
  const a = (cast?.a || []).slice(0, 7), b = (cast?.b || []).slice(0, 7);
  if (!a.length || !b.length) return null;
  const s = tugStaging(a.length, b.length);
  const { size, line } = s;
  const floor = TW_STAGE.floor;
  const cy = -Math.round(size * TW_STAGE.ropeY);
  /* the loops, in the rig's frame (0 0 is the line on the floor) */
  const aMin = s.ax[s.a - 1] - line, aMax = s.ax[0] - line, bMin = s.bx[0] - line, bMax = s.bx[s.b - 1] - line;
  const ry = size * 0.2;
  const la = { cx:(aMin + aMax) / 2, rx:(aMax - aMin) / 2 + size * 0.58 };
  const lb = { cx:(bMin + bMax) / 2, rx:(bMax - bMin) / 2 + size * 0.58 };
  const ropeL = la.cx + la.rx, ropeR = lb.cx - lb.rx;
  /* once yanked, the rope lies slack from the underdogs' loop across the
     floor past the line (the rig has moved gain - yank by then) */
  const shift = s.gain - s.yank;
  const lineLocal = -shift;
  const slack = `M${r1(ropeL)} ${cy}C${r1(ropeL + size * 0.5)} ${r1(cy + size * 0.1)} ${r1(ropeL + size * 0.4)} ${r1(-size * 0.04)}`
    + ` ${r1(ropeL + size * 0.9)} ${r1(-size * 0.03)}S${r1(lineLocal + size * 0.1)} ${r1(size * 0.05)} ${r1(lineLocal + size * 0.7)} ${r1(size * 0.02)}`;
  const knot = x => `M${r1(x)} ${cy}l${r1(-size * 0.1)} ${r1(size * 0.26)}l${r1(size * 0.2)} 0Z`;
  const wRope = TUBE.w * Math.max(0.7, size / 200);
  const box = [la.cx - la.rx - size, cy - size * 0.6, lb.cx + lb.rx - (la.cx - la.rx) + size * 2, size * 1.4];
  const back = [
    { d:loopBack(la.cx, cy, la.rx, ry), tone:"bone", w:wRope * 0.8 },
    { d:loopBack(lb.cx, cy, lb.rx, ry), tone:"bone", w:wRope * 0.8, g:"bl" },
  ];
  const front = [
    { d:loopFront(la.cx, cy, la.rx, ry), tone:"bone", w:wRope },
    { d:loopFront(lb.cx, cy, lb.rx, ry), tone:"bone", w:wRope, g:"bl" },
    { d:`M${r1(ropeL)} ${cy}L${r1(ropeR)} ${cy}`, tone:"bone", w:wRope, g:"taut" },
    { d:knot(0), tone:"magenta", w:wRope * 0.8, g:"taut" },
    { d:slack, tone:"bone", w:wRope, g:"slack" },
    { d:`M${r1(lineLocal + size * 0.7)} ${r1(size * 0.02)}l${r1(size * 0.24)} ${r1(-size * 0.07)}l0 ${r1(size * 0.13)}Z`, tone:"magenta",
      w:wRope * 0.8, g:"slack" },
  ];
  const nH = s.heap.length;
  const flyMs = Math.max(240, 430 - 20 * (nH - 1));
  return (
    <div className="tw" style={{ "--tw-gain":px(s.gain), "--tw-yanked":px(shift), "--tw-fly":ms(flyMs),
      "--tw-dig":px(size * 0.08), "--tw-bob":px(-size * 0.12), "--tw-hop":px(-size * 0.3) }}>
      {/* the line on the floor, running toward us */}
      <span className="neon-node tw-line" style={{ left:line, top:floor }}>
        <Neon box={[-30, -40, 60, 150]} tubes={[{ d:`M-4 -26L8 ${r1(size * 0.34)}`, tone:"cyan", w:TUBE.w * 0.9 }]} />
      </span>
      {/* the rope's back, behind the chips */}
      <span className="neon-node tw-rig is-back" style={{ left:line, top:floor }}><Neon box={box} tubes={back} /></span>
      {/* the favorites: smug, then flung into the heap */}
      <div className="neon-node tw-team is-b">
        {b.map((player, k) => {
          const slot = s.heap[k], lie = HEAP_LIE[k];
          const start = s.bx[k] + s.gain;
          const dx = slot.x + lie[1] * size - start, dy = slot.y;
          const peak = -size * (1.25 + 0.12 * k);
          return <NeonChip key={player} player={player} size={size} x={s.bx[k]} y={floor} className={`tw-b${slot.y ? " is-up" : ""}`}
            style={{ "--i":k, "--tw-mid":`translate(${px(dx * 0.5)}, ${px(peak)})`, "--tw-end":`translate(${px(dx)}, ${px(dy)})`,
              "--tw-lie":`rotate(${lie[0] + (k % 2 ? 360 : -360)}deg)` }} />;
        })}
      </div>
      {/* the underdogs, the anchor at the back drawn first */}
      <div className="neon-node tw-team is-a">
        {a.map((player, k) => ({ player, k })).reverse().map(({ player, k }) => (
          <NeonChip key={player} player={player} size={size} x={s.ax[k]} y={floor} className="tw-a" style={{ "--i":k }}
            wear={<span className="neon-node tw-sweat" style={{ left:size * 0.4, top:-size * 0.42 }}><SweatDrop scale={size / 260} /></span>}>
            <span className="neon-node tw-dust" style={{ left:size * 0.1 }}><Burst n={6} r0={size * 0.1} r1={size * 0.3} tone="ember" turn={-90} /></span>
          </NeonChip>
        ))}
      </div>
      {/* the rope's front, over the chips */}
      <span className="neon-node tw-rig is-front" style={{ left:line, top:floor }}><Neon box={box} tubes={front} /></span>
      {/* stars round the heap */}
      <span className="neon-node tw-stars" style={{ left:s.heap[nH - 1].x, top:floor + s.heap[nH - 1].y - size * 1.1 }}>
        <DizzyStars count={3} rx={size * 0.62} ry={size * 0.12} r={Math.max(14, size * 0.1)} />
      </span>
    </div>
  );
}

/* the camera's anchors: "line" the knot at the start, "pull" where it is
   dragged, "a" the underdogs digging in, "heap" the pile, "mid" all */
TugOfWar.anchors = cast => {
  const s = tugStaging(Math.min(7, cast?.a?.length || 1), Math.min(7, cast?.b?.length || 1));
  const heapX = Math.round(s.heap.reduce((t, p) => t + p.x, 0) / s.heap.length);
  return { minX:s.minX, maxX:s.maxX, mid:Math.round((s.minX + s.maxX) / 2), line:s.line, pull:s.line + s.gain,
    a:Math.round((s.ax[0] + s.ax[s.a - 1]) / 2 + s.gain - s.size * 0.4), heap:heapX,
    end:Math.round((heapX + (s.ax[0] + s.ax[s.a - 1]) / 2 + s.gain - s.yank) / 2) };
};
