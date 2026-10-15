import React from "react";
import { NeonChip } from "../neon/Neon.jsx";
import { Burst, NeonStar } from "../neon/NeonProps.jsx";
import { teamLine } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./pyramid.css";

const PY = bitById("pyramid").beats;

/* pyramid (team win, punchline): the team stands in a line. The base row
   hops into place, shoulder to shoulder; then each row above hops up onto
   the one below, the chips under it squashing as it lands; the last one
   leaps from the end of the line to the top (the song), wobbles, wobbles,
   holds, the whole pyramid swaying with it, sparkles lighting round it.

   Rows by team size: 2 is one on one, 3 is 2 + 1, 4 is 3 + 1, 5 is 3 + 2,
   6 is 3 + 2 + 1, 7 is 4 + 2 + 1. The base is the middle of the line; the
   climbers come from its ends, the top one last. Each row lands a
   CLIMB_MS before the next, the top on PY.top. */
export const PY_STAGE = Object.freeze({ mid:960, floor:930, rise:0.87, gap:1.02, climbMs:540, hopMs:470 });
export const PY_ROWS = Object.freeze([[1], [1, 1], [2, 1], [3, 1], [3, 2], [3, 2, 1], [4, 2, 1]]);

const px = n => `${Math.round(n * 10) / 10}px`;
const ms = n => `${Math.round(n)}ms`;

/* the slots, bottom row first: x offsets in chips from the middle, and
   how high each row stands (a chip over a gap nests into it; one right
   on top of another stands a whole chip up) */
export function pyramidStaging(count = 3) {
  const n = Math.max(1, Math.min(7, count));
  const { size } = teamLine(n);
  const rows = PY_ROWS[n - 1];
  const { mid, floor, gap, rise } = PY_STAGE;
  let y = floor;
  const ys = rows.map((m, r) => {
    if (r > 0) y -= size * ((m - rows[r - 1]) % 2 ? rise : 0.97);
    return Math.round(y);
  });
  /* the base stands in the middle (a little loose, it hops in tight);
     the climbers wait outside it, left and right in turn, the first to
     climb nearest, the top one furthest out */
  const step = size * 1.12;
  const slots = [];
  rows.forEach((m, r) => {
    for (let j = 0; j < m; j++) slots.push({ row:r, j, m, x:Math.round(mid + (j - (m - 1) / 2) * size * gap), y:ys[r] });
  });
  const base = slots.filter(slot => slot.row === 0);
  base.forEach(slot => { slot.from = Math.round(mid + (slot.j - (slot.m - 1) / 2) * step); });
  const climbers = slots.filter(slot => slot.row > 0);
  const edge = (rows[0] - 1) / 2 * step;
  climbers.forEach((slot, k) => {
    const side = (k + (climbers.length % 2 ? 0 : 1)) % 2 ? 1 : -1;
    const out = Math.floor(k / 2) + 1;
    slot.from = Math.round(mid + side * (edge + out * step));
  });
  /* the line, left to right: who stands where */
  const byFrom = [...slots].sort((p, q) => p.from - q.from);
  byFrom.forEach((slot, idx) => { slot.idx = idx; });
  const xs = slots.map(slot => slot.from);
  const half = Math.round((Math.max(...xs) - Math.min(...xs)) / 2 + size / 2);
  return { n, size, rows, slots, half, top:Math.round(ys[ys.length - 1] - size / 2) };
}

/* when a slot's chip lands, before PY.top */
const landBefore = (slot, rows) => slot.row === 0 ? null
  : (rows.length - 1 - slot.row) * PY_STAGE.climbMs + (slot.m - 1 - slot.j) * 90;

export function Pyramid({ cast }) {
  const team = (cast?.a || []).slice(0, 7);
  if (!team.length) return null;
  const s = pyramidStaging(team.length);
  const { size } = s;
  const R = s.rows.length;
  const topX = s.slots[s.slots.length - 1].x;
  const stars = [[-1.05, -0.35, 1], [1.08, -0.5, 0.8], [-0.7, -1.0, 0.7], [0.75, -1.05, 1.05], [0, -1.3, 0.75], [-1.2, 0.35, 0.65],
    [1.2, 0.3, 0.7]];
  return (
    <div className="py" style={{ "--py-hop":ms(PY_STAGE.hopMs), "--py-bob":px(-size * 0.14), "--py-climb":ms(PY_STAGE.climbMs) }}>
      {s.slots.map(slot => {
        const player = team[slot.idx];
        const from = slot.from;
        const dx = slot.x - from, dy = slot.y - PY_STAGE.floor;
        /* a team of one just leaps up in place, on the top's beat */
        const solo = s.n === 1, climb = slot.row > 0 || solo;
        const before = solo ? 0 : landBefore(slot, s.rows);
        const under = R - 1 - slot.row;
        const height = !climb ? size * 0.3 : size * (0.38 + 0.2 * Math.max(1, slot.row)) + Math.abs(dx) * 0.06;
        return (
          <NeonChip key={player} player={player} size={size} x={from} y={PY_STAGE.floor}
            className={`py-c${climb ? " is-climb" : " is-base"}${slot.row === R - 1 ? " is-top" : ""} is-under${Math.min(2, under)}`}
            style={{ "--i":slot.idx, "--j":slot.j, "--r":slot.row, "--py-before":ms(before ?? 0),
              /* eager bobs while it waits its turn, as many as fit before its crouch */
              "--py-bobs":climb ? Math.max(1, Math.floor((PY.top - (before ?? 0) - PY_STAGE.hopMs - 260 - (PY.gather + 260 + slot.idx * 70)) / 300)) : 0,
              "--py-to":`translate(${px(dx)}, ${px(dy)})`, "--py-mid":`translate(${px(dx * 0.5)}, ${px(dy - height)})` }} />
        );
      })}
      {/* the sparkle round the top */}
      <span className="neon-node py-shine" style={{ left:topX, top:s.top }}>
        <span className="neon-node py-burst"><Burst n={14} r0={size * 0.62} r1={size * 0.95} tone="amber" /></span>
        {stars.map(([u, v, k], i) => <span key={i} className="neon-node py-star" style={{ left:u * size, top:v * size, "--k":i }}>
          <NeonStar r={Math.round(size * 0.12 * k + 6)} tone={i % 3 === 1 ? "cyan" : "amber"} /></span>)}
      </span>
    </div>
  );
}

/* the camera's anchors: the line, and the pyramid's middle */
Pyramid.anchors = cast => {
  const s = pyramidStaging(Math.min(7, cast?.a?.length || 1));
  return { minX:Math.round(PY_STAGE.mid - s.half - 60), maxX:Math.round(PY_STAGE.mid + s.half + 60), mid:PY_STAGE.mid };
};
