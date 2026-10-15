import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst } from "../neon/NeonProps.jsx";
import { TUBE, teamLine } from "../neon/neonArt.js";
import "./victorylap.css";

/* victorylap (team win, punchline): a neon oval track, a stadium in
   perspective, its far straight up on the horizon and its near straight
   on the floor, a checkered finish line across it and a checkered flag on
   a pole beside it. The team rolls a lap in a file, rolling on their
   edges: up round the right bend (edge on at its turn), small along the
   far straight, round the left bend and down the near straight; the
   leader crosses the line (the song), the flag whips, and each one rolls
   on past it and pulls up, the file closing into a row.

   Every chip runs the one path (victorylap.css vl-lap, in px from the
   finish line) on its own delay, a chip's width behind the one ahead at
   the near straight's speed, so the file is in motion from the first
   frame; the leader crosses on VL.cross. */
export const VL_STAGE = Object.freeze({ finish:740, floor:930, left:260, right:1640, far:-210, rx:150, lane:38, step:0.86, past:150,
  lapMs:3800, speed:0.78 });

const px = n => `${Math.round(n * 10) / 10}px`;
const ms = n => `${Math.round(n)}ms`;
const r1 = n => Math.round(n * 10) / 10;

/* one edge of the track: a stadium `off` px out from the lane's middle
   (the far side foreshortened), in px from the finish on the floor */
function trackEdge(off) {
  const { finish, left, right, far, rx } = VL_STAGE;
  const k = 0.5;
  const yn = off, yf = far - off * k, ry = (yn - yf) / 2, rxx = rx + off * 1.6;
  const L = left - finish, R = right - finish;
  return `M${r1(L)} ${r1(yn)}L${r1(R)} ${r1(yn)}A${r1(rxx)} ${r1(ry)} 0 0 0 ${r1(R)} ${r1(yf)}L${r1(L)} ${r1(yf)}`
    + `A${r1(rxx)} ${r1(ry)} 0 0 0 ${r1(L)} ${r1(yn)}Z`;
}

/* checkered squares: `cols` by `rows` of `w` x `h`, from x y, alternate filled */
function checks(x, y, cols, rows, w, h) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ((r + c) % 2) continue;
    out.push(`M${r1(x + c * w)} ${r1(y + r * h)}l${r1(w)} 0l0 ${r1(h)}l${r1(-w)} 0Z`);
  }
  return out.join("");
}

export function lapStaging(count = 3) {
  const n = Math.max(1, Math.min(7, count));
  const { size } = teamLine(n);
  const step = Math.round(size * VL_STAGE.step);
  /* where each pulls up past the line: the leader furthest */
  const slots = Array.from({ length:n }, (_, i) => VL_STAGE.past + (n - 1 - i) * step);
  /* a chip and a little behind the one ahead, at the near straight's speed */
  const gap = Math.round(size * 1.08 / VL_STAGE.speed);
  return { n, size, step, slots, gap };
}

export function VictoryLap({ cast }) {
  const team = (cast?.a || []).slice(0, 7);
  if (!team.length) return null;
  const s = lapStaging(team.length);
  const { finish, floor, lane } = VL_STAGE;
  const { size } = s;
  /* the pull up: as fast as it crossed (about 870 px a second), easing to a stop */
  const pullMs = d => Math.max(260, Math.round(d / VL_STAGE.speed * 1.9));
  const pole = { x:-70, y:lane + 8, top:-370 };
  const flag = { w:168, h:108 };
  return (
    <div className="vl" style={{ "--vl-gap":ms(s.gap) }}>
      {/* the track and its finish line, hung off the finish on the floor */}
      <span className="neon-node" style={{ left:finish, top:floor }}>
        <Neon box={[-700, -260, 1700, 340]} tubes={[
          { d:trackEdge(lane), tone:"magenta", w:TUBE.w * 0.8 },
          { d:trackEdge(-lane), tone:"magenta", w:TUBE.thin },
        ]} />
        <Neon box={[-40, -lane - 20, 80, lane * 2 + 40]}
          fills={[{ d:checks(-21, -lane, 3, 6, 14, lane / 3), fill:"var(--neon-bone)" }]}
          tubes={[{ d:`M-21 ${-lane}L21 ${-lane}L21 ${lane}L-21 ${lane}Z`, tone:"bone", w:TUBE.thin }]} />
        <span className="neon-node vl-cross" style={{ top:-size * 0.5 }}><Burst n={14} r0={size * 0.6} r1={size * 1.15} tone="amber" /></span>
        <span className="neon-node vl-cross is-in" style={{ top:-size * 0.5 }}><Burst n={10} r0={size * 0.3} r1={size * 0.7} tone="bone" turn={18} /></span>
      </span>
      {/* the team, the leader drawn last */}
      {team.map((player, i) => ({ player, i })).reverse().map(({ player, i }) => {
        const d = s.slots[i];
        return (
          <span key={player} className="neon-node vl-run" style={{ left:finish, top:floor, "--i":i }}>
            <NeonChip player={player} size={size} x={0} y={0} className="vl-c"
              style={{ "--i":i, "--vl-slot":px(d), "--vl-pull":ms(pullMs(d)), "--vl-roll":`${Math.round(d / (size / 2) * 57.3)}deg` }} />
          </span>
        );
      })}
      {/* the flag on its pole at the line, in front of the track */}
      <span className="neon-node" style={{ left:finish + pole.x, top:floor + pole.y }}>
        <Neon box={[-20, pole.top - 20, 40, -pole.top + 40]} tubes={[{ d:`M0 0L0 ${pole.top}`, tone:"bone", w:TUBE.w * 0.7 }]} />
        <span className="neon-node vl-flag" style={{ top:pole.top + 4 }}>
          <span className="neon-node vl-wave">
            <Neon box={[-10, -10, flag.w + 20, flag.h + 20]}
              fills={[{ d:`M0 0L${flag.w} 0L${flag.w} ${flag.h}L0 ${flag.h}Z` }, { d:checks(0, 0, 6, 4, flag.w / 6, flag.h / 4), fill:"var(--neon-bone)" }]}
              tubes={[{ d:`M0 0L${flag.w} 0L${flag.w} ${flag.h}L0 ${flag.h}Z`, tone:"bone", w:TUBE.thin }]} />
          </span>
        </span>
      </span>
    </div>
  );
}

/* the camera's anchors: the whole track, the line, and the row as it pulls up */
VictoryLap.anchors = cast => {
  const s = lapStaging(Math.min(7, cast?.a?.length || 1));
  const { finish, left, right, rx } = VL_STAGE;
  return { minX:left - rx - 40, maxX:right + rx + 40, mid:Math.round((left + right) / 2), line:finish + 40,
    row:Math.round(finish + (s.slots[0] + s.slots[s.n - 1]) / 2) };
};
