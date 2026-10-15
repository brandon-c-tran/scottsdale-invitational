import React from "react";
import { NeonChip } from "../neon/Neon.jsx";
import { Burst } from "../neon/NeonProps.jsx";
import { bitById } from "./registry.js";
import "./dominoes.css";

const DM = bitById("dominoes").beats;

/* dominoes (team versus, punchline): the favorites (b) stand in a line on
   the left like dominoes, each turned three quarters toward the
   underdogs. The underdogs (a) stand in a row on the right, turned to
   watch; the nearest hops up to the first domino and taps it (a bump).
   It goes over backwards onto the next, and the line goes in a chain,
   each a beat after the last. The last is knocked onto its heel and
   teeters there a long time, the whole leaning line riding with it,
   the underdogs craning... then it goes flat (the song) and the line
   settles onto it. The underdogs bounce once.

   A chip face on is a disc, and a disc falling sideways reads as rolling;
   turned three quarters and falling back in 3D it foreshortens, so it
   reads as falling flat, and a fallen line lies shingled like a run of
   dominoes. Each lean is computed from the spacing (a chip leans on the
   next when its top meets that one's face), so they rest touching.
   The chain spans chain to last whatever its length (a step of at most
   STEP_MS); a short line leaves the last teetering longer. */
export const DM_STAGE = Object.freeze({ mid:960, floor:930, budget:1560, max:210,
  /* the three-quarter turn; the gap between dominoes along their facing (chips) */
  yaw:50, gap:0.68,
  /* the underdogs' spacing, the tapper's stop and the room it starts back from (chips) */
  wstep:1.12, reach:0.84, back:1.75,
  /* how far back a fallen one lies: the last flat, the rest propped on it */
  flat:86, propped:82, stepMs:240 });

/* the last one's teeter, as [fraction of the teeter, degrees back] (the
   CSS keys, dominoes.css dm-teeter, sit at these fractions) */
export const DM_TEETER = Object.freeze([[0, 0], [0.12, 22], [0.24, 7], [0.38, 26], [0.5, 10], [0.62, 22], [0.71, 13], [0.79, 19],
  [1, 17]]);

const r2 = n => Math.round(n * 100) / 100;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const px = n => `${Math.round(n * 10) / 10}px`;
const ms = n => `${Math.round(n)}ms`;

/* how far back a domino leans resting on the next leaning `next` degrees */
export function leanOn(next, { gap = DM_STAGE.gap, cap = DM_STAGE.propped } = {}) {
  return r2(Math.min(cap, next + deg(Math.asin(Math.min(1, gap * Math.cos(rad(next)))))));
}
/* the line with the last at `last` degrees, each leaning on the next */
export function chainAngles(n, last) {
  const out = new Array(Math.max(0, n)).fill(0);
  if (!n) return out;
  out[n - 1] = last;
  for (let i = n - 2; i >= 0; i--) out[i] = leanOn(out[i + 1]);
  return out;
}

/* where everyone stands: in chip units from the last domino, then in
   canvas px, every side sized so the whole scene fits the TV */
export function dominoesStaging(na = 2, nb = 2) {
  const { yaw, gap, wstep, reach, back, budget, max, mid } = DM_STAGE;
  const a = Math.max(1, Math.min(7, na)), b = Math.max(1, Math.min(7, nb));
  const step = gap / Math.sin(rad(yaw));
  /* the line: the last (leftmost) at 0, the first at its right end */
  const lineU = Array.from({ length:b }, (_, i) => (b - 1 - i) * step);
  const first = lineU[0];
  const tapU = first + reach, startU = first + back;
  /* four or more: a front row and, between them a step back, a back row */
  const front = a >= 4 ? Math.ceil(a / 2) : a;
  const rowU = Array.from({ length:a }, (_, k) => k < front ? startU + k * wstep : startU + (k - front + 0.5) * wstep);
  const lo = -1.05, hi = startU + (front - 1) * wstep + 0.62;
  const units = hi - lo;
  const size = Math.round(Math.min(max, budget / units));
  const left = mid - units * size / 2;
  const at = u => Math.round(left + (u - lo) * size);
  return { a, b, size, front, rise:Math.round(size * 0.34), step:Math.round(step * size), xs:lineU.map(at), tap:at(tapU), row:rowU.map(at),
    minX:Math.round(left), maxX:Math.round(left + units * size) };
}

export function Dominoes({ cast }) {
  const a = (cast?.a || []).slice(0, 7), b = (cast?.b || []).slice(0, 7);
  if (!a.length || !b.length) return null;
  const s = dominoesStaging(a.length, b.length);
  const { size } = s, floor = DM_STAGE.floor;
  const n = b.length;
  /* each step of the chain, and when the last is reached */
  const dt = n > 1 ? Math.min(DM_STAGE.stepMs, (DM.last - DM.chain) / (n - 1)) : 0;
  const lastAt = dt * (n - 1);
  const turn = back => `rotateY(${-DM_STAGE.yaw}deg) rotateX(${r2(back)}deg)`;
  const upright = leanOn(0);
  const keys = DM_TEETER.map(([, w]) => chainAngles(n, w));
  const down = chainAngles(n, 52), flat = chainAngles(n, DM_STAGE.flat), bounce = chainAngles(n, DM_STAGE.flat - 9);
  const lastX = s.xs[n - 1];
  const rootStyle = { "--persp":px(size * 4.2), "--persp-y":px(-size * 1.7), "--dm-lt":ms(lastAt), "--dm-dt":ms(Math.max(1, dt)),
    "--dm-hop":px(-size * 0.42), "--dm-bump":px(-size * 0.06), "--dm-recoil":px(size * 0.32), "--dm-bounce":px(-size * 0.3) };
  return (
    <div className="dm" style={rootStyle}>
      {/* the favorites, the last (leftmost) drawn first, so each lies over the one behind it */}
      {b.map((player, i) => ({ player, i })).reverse().map(({ player, i }) => {
        const last = i === n - 1;
        const style = { "--i":i, "--t":ms(dt * i), "--sag-at":ms(dt * (i + 1)), "--sag":ms(Math.max(1, lastAt - dt * (i + 1))),
          "--r0":turn(0), "--u":turn(upright), "--kd":turn(down[i]), "--kf":turn(flat[i]), "--kb":turn(bounce[i]),
          ...Object.fromEntries(keys.map((k, j) => [`--k${j}`, turn(k[i])])) };
        return <NeonChip key={player} player={player} size={size} x={s.xs[i]} y={floor}
          className={`dm-b${last ? " is-last" : " is-link"}`} style={style} />;
      })}
      {/* the slap of the last one landing flat */}
      <span className="neon-node dm-slap" style={{ left:lastX - size * 0.5, top:floor - size * 0.12 }}>
        <Burst n={10} r0={size * 0.42} r1={size * 0.85} tone="bone" turn={18} />
      </span>
      {/* the underdogs, the back row first: the nearest in front is the tapper */}
      {a.map((player, k) => ({ player, k })).sort((p, q) => (q.k >= s.front) - (p.k >= s.front)).map(({ player, k }) => {
        const tapper = k === 0, back = k >= s.front;
        return <NeonChip key={player} player={player} size={back ? Math.round(size * 0.88) : size} x={s.row[k]}
          y={back ? floor - s.rise : floor} className={`dm-a${tapper ? " is-tapper" : ""}${back ? " is-back" : ""}`}
          style={{ "--i":k, ...(tapper ? { "--dm-walk":px(s.tap - s.row[0]) } : {}) }} />;
      })}
    </div>
  );
}

/* the camera's anchors: "tap" between the tapper and the first domino,
   "last" the last one as it teeters, "watch" the line from the last to
   the tapper, "mid" everything */
Dominoes.anchors = cast => {
  const s = dominoesStaging(Math.min(7, cast?.a?.length || 1), Math.min(7, cast?.b?.length || 1));
  const last = s.xs[s.xs.length - 1];
  return { mid:Math.round((s.minX + s.maxX) / 2), minX:s.minX, maxX:s.maxX,
    tap:Math.round((s.tap + s.xs[0]) / 2), last:Math.round(last - s.size * 0.15),
    watch:Math.round((last - s.size * 0.6 + s.tap + s.size * 0.6) / 2) };
};
