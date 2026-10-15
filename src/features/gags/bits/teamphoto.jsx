import React from "react";
import { Neon, NeonChip } from "../neon/Neon.jsx";
import { Burst } from "../neon/NeonProps.jsx";
import { TUBE, circlePath, ellipsePath, teamLine } from "../neon/neonArt.js";
import "./teamphoto.css";

/* teamphoto (team win, punchline): a neon camera on a tripod at the
   right, its lens on the team. They hop into place (two rows, the back
   one a step up, from five), turned to the lens, and strike their poses,
   each its own (a lean, a model's turn, a power stance, a jump held in
   the air, a cocked head), and hold, dead still, while the self-timer's
   lamp blinks faster and faster. FLASH (the song). They hold. Then the
   camera, on its tripod, slowly tips over and lands with a clatter.
   Nobody moves.

   The lamp blinks on bitTimer's own blips (teamphoto.css tp-blink). */
export const TP_STAGE = Object.freeze({ mid:960, floor:930, shift:0.75, rise:0.6, back:0.9, camGap:1.0 });
/* the poses, by place in the line: what each one does on its beat */
const POSES = ["lean", "model", "power", "jump", "tilt", "cock", "lean2"];

const px = n => `${Math.round(n * 10) / 10}px`;
const r1 = n => Math.round(n * 10) / 10;
const rect = (x, y, w, h, r = 10) => `M${r1(x + r)} ${r1(y)}L${r1(x + w - r)} ${r1(y)}Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + r)}`
  + `L${r1(x + w)} ${r1(y + h - r)}Q${r1(x + w)} ${r1(y + h)} ${r1(x + w - r)} ${r1(y + h)}L${r1(x + r)} ${r1(y + h)}`
  + `Q${r1(x)} ${r1(y + h)} ${r1(x)} ${r1(y + h - r)}L${r1(x)} ${r1(y + r)}Q${r1(x)} ${r1(y)} ${r1(x + r)} ${r1(y)}Z`;

export function photoStaging(count = 3) {
  const n = Math.max(1, Math.min(7, count));
  /* five or more stand in two rows, the back one a step up */
  const two = n >= 5;
  const front = two ? Math.ceil(n / 2) : n;
  const line = teamLine(two ? front + 1 : n);
  const size = line.size, step = Math.round(size * 1.08);
  const spots = Array.from({ length:n }, (_, i) => {
    const back = i >= front, m = back ? n - front : front, j = back ? i - front : i;
    return { back, x:Math.round((j - (m - 1) / 2) * step), y:back ? -Math.round(size * TP_STAGE.rise) : 0 };
  });
  const half = Math.round((front - 1) / 2 * step + size / 2);
  const team = Math.round(TP_STAGE.mid - TP_STAGE.shift * size);
  /* the camera's scale: its lens about a chip high */
  const k = Math.round(Math.max(0.5, Math.min(0.75, size / 220 * 0.64)) * 100) / 100;
  const cam = Math.round(team + half + size * TP_STAGE.camGap + 40);
  return { n, size, step, spots, half, team, cam, k, minX:team - half - 50, maxX:Math.round(cam + 560 * k) };
}

/* the camera on its tripod, drawn about its middle foot on the floor */
function PhotoCamera() {
  const body = rect(-80, -420, 170, 116, 14);
  const lens = rect(-150, -398, 72, 72, 8);
  const flash = rect(-50, -470, 74, 44, 6);
  const legs = "M0 -300L-118 0M0 -300L104 0M0 -300L10 0";
  return (
    <>
      <Neon box={[-200, -500, 340, 520]} fills={[{ d:body }, { d:lens }, { d:flash }]} tubes={[
        { d:legs, tone:"bone", w:TUBE.w * 0.75 },
        { d:"M-26 -300L26 -300M0 -304L0 -250", tone:"bone", w:TUBE.w * 0.75 },
        { d:body, tone:"bone", w:TUBE.w * 0.85 },
        { d:"M10 -420L22 -436L60 -436L72 -420", tone:"bone", w:TUBE.thin },
        { d:lens, tone:"cyan", w:TUBE.w * 0.8 },
        { d:ellipsePath(-150, -362, 10, 32), tone:"cyan", w:TUBE.thin },
        { d:flash, tone:"bone", w:TUBE.thin },
      ]} />
      {/* the timer's lamp: its glass, and its light */}
      <span className="neon-node" style={{ left:46, top:-386 }}>
        <Neon box={[-50, -50, 100, 100]} tubes={[{ d:circlePath(0, 0, 15), tone:"clay", w:TUBE.w * 0.9, glass:true, g:"lamp" },
          { d:circlePath(0, 0, 30), tone:"clay", w:TUBE.thin, g:"lamp" }]} />
      </span>
      {/* the flash's face lit, and its burst from the lens */}
      <span className="neon-node tp-face" style={{ left:-13, top:-448 }}>
        <Neon box={[-50, -36, 100, 72]} fills={[{ d:rect(-30, -16, 60, 32, 4), fill:"var(--neon-bone)" }]}
          tubes={[{ d:rect(-30, -16, 60, 32, 4), tone:"bone", w:TUBE.thin }]} />
      </span>
      <span className="neon-node tp-pop" style={{ left:-13, top:-448 }}><Burst n={14} r0={46} r1={150} tone="bone" /></span>
    </>
  );
}

export function TeamPhoto({ cast }) {
  const team = (cast?.a || []).slice(0, 7);
  if (!team.length) return null;
  const s = photoStaging(team.length);
  const { size } = s;
  const floor = TP_STAGE.floor;
  return (
    <div className="tp" style={{ "--tp-up":px(-size * 0.3), "--tp-bump":px(-size * 0.07) }}>
      {/* the team, back row first, each hopping in from a little out of place */}
      {team.map((player, i) => ({ player, i, spot:s.spots[i] })).sort((p, q) => (q.spot.back ? 1 : 0) - (p.spot.back ? 1 : 0))
        .map(({ player, i, spot }) => (
          <NeonChip key={player} player={player} size={spot.back ? Math.round(size * TP_STAGE.back) : size}
            x={s.team + spot.x} y={floor + spot.y} className={`tp-c is-${POSES[i % POSES.length]}${spot.back ? " is-back" : ""}`}
            style={{ "--i":i, "--tp-from":`translate(${px((i % 2 ? 1 : -1) * size * (0.25 + (i % 3) * 0.12))}, 0px)`,
              "--tp-lean":`${spot.x < 0 ? 18 : -18}deg` }} />
        ))}
      {/* the camera, hung off its right foot so it tips over away from them */}
      <span className="neon-node tp-cam" style={{ left:s.cam + Math.round(104 * s.k), top:floor }}>
        <span className="neon-node" style={{ left:-Math.round(104 * s.k), transform:`scale(${s.k})` }}><PhotoCamera /></span>
      </span>
    </div>
  );
}

/* the camera's anchors: the team ("team"), the camera ("cam"), all ("mid") */
TeamPhoto.anchors = cast => {
  const s = photoStaging(Math.min(7, cast?.a?.length || 1));
  return { minX:s.minX, maxX:s.maxX, mid:Math.round((s.minX + s.maxX) / 2), team:s.team + Math.round(s.size * 0.4), cam:s.cam };
};
