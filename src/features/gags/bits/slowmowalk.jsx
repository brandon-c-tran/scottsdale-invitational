import React from "react";
import { ChipCoin, Neon, NeonChip, useNeonColor } from "../neon/Neon.jsx";
import { Burst, LooseChip, NeonStack } from "../neon/NeonProps.jsx";
import { TUBE, circlePath, teamLine } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./slowmowalk.css";

const SW = bitById("slowmowalk").beats;

/* slowmowalk (team versus, punchline): the underdogs (a) walk toward us
   abreast in slow motion, a slow bob and sway, growing as they come.
   Behind them, small on the horizon, stand the favorites' (b) chip
   stacks, each in its owner's color with their chip on top. They go up
   one after another, left to right, in neon fireballs, the chips flung
   into the sky. The walkers stop close; the biggest stack, in the middle
   behind them, goes up last (the song). Nobody turns round.

   The six small blasts sit on the beat the kit's far blasts land on
   (bitBoomChain: the first at `first`, the rest every BLAST_MS), so the
   horizon is always seven stacks, the favorites owning them in turn. */
export const SW_STAGE = Object.freeze({ mid:960, floor:930, horizon:792, far:0.54, rise:-84, spread:600, blastMs:280 });
/* the horizon's stacks, left to right as they go up: [x across the
   spread, chips high, scale]; the big one last, in the middle */
const STACKS = [[-0.98, 7, 0.4], [-0.7, 9, 0.36], [-0.42, 6, 0.42], [0.42, 8, 0.38], [0.7, 6, 0.4], [0.98, 9, 0.36], [0, 16, 0.66]];
/* where each stack's flung chips land, relative to it (x, peak, spin) */
const FLING = [[-170, -300, -420], [150, -360, 380], [-60, -420, 260]];

const px = n => `${Math.round(n * 10) / 10}px`;
const ms = n => `${Math.round(n)}ms`;

export function slowmoStaging(na = 2) {
  const line = teamLine(Math.max(1, Math.min(7, na)));
  const { mid, spread } = SW_STAGE;
  return { ...line, xs:line.xs.map(x => mid + x), minX:Math.round(mid - Math.max(line.half, spread * 0.9) - 40),
    maxX:Math.round(mid + Math.max(line.half, spread * 0.9) + 40) };
}

function Stack({ owner, x, y, chips, scale, big, at, i }) {
  const color = useNeonColor(owner);
  const thick = 18, width = 150;
  const h = chips * thick;
  return (
    <span className={`neon-node sw-s${big ? " is-big" : ""}`} style={{ left:x, top:y, "--neon-player":color, "--t":ms(at), "--j":i }}>
      <span className="neon-node" style={{ transform:`scale(${scale})` }}>
        <span className="neon-node sw-stack"><NeonStack count={chips} width={width} thick={thick} top="player" /></span>
        {/* the owner's chip on top, flung off when it goes */}
        <span className="neon-node sw-coin" style={{ top:-h - 50, "--fx":px(FLING[i % 3][0] * 0.5), "--fy":px(-260 - (big ? 260 : 0)) }}>
          <span className="neon-node sw-coin-spin"><ChipCoin player={owner} size={88} /></span>
        </span>
        {big && <span className="neon-node sw-fuse" style={{ left:70, top:-h - 6 }}><Burst n={8} r0={8} r1={34} tone="amber" /></span>}
        {/* the blast: a flash ring, a fireball of spokes, smoke going up */}
        <span className="neon-node sw-boom" style={{ top:-h * 0.6 }}>
          <span className="neon-node sw-ring"><Neon box={[-140, -140, 280, 280]} tubes={[{ d:circlePath(0, 0, 120), tone:"ember", w:TUBE.w }]} /></span>
          <span className="neon-node sw-fire"><Burst n={12} r0={50} r1={170} tone="ember" /></span>
          <span className="neon-node sw-fire is-in"><Burst n={9} r0={24} r1={110} tone="amber" turn={20} /></span>
          {[0, 1].map(k => <span key={k} className={`neon-node sw-smoke is-${k}`} style={{ left:(k - 0.5) * 90, "--k":k }}>
            <Neon box={[-90, -90, 180, 180]} tubes={[{ d:circlePath(0, 0, 60 + k * 14), tone:"bone", w:TUBE.thin }]} /></span>)}
        </span>
        {/* chips flung out */}
        {FLING.slice(0, big ? 3 : 2).map(([fx, fy, spin], k) => (
          <span key={k} className="neon-node sw-fling" style={{ top:-h * 0.7, "--fx":px(fx * (big ? 1.4 : 1)), "--fy":px(fy * (big ? 1.3 : 1)),
            "--fs":`${spin}deg`, "--k":k }}><LooseChip width={110} thick={16} tone="player" /></span>
        ))}
      </span>
    </span>
  );
}

export function SlowmoWalk({ cast }) {
  const a = (cast?.a || []).slice(0, 7), b = (cast?.b || []).slice(0, 7);
  if (!a.length || !b.length) return null;
  const s = slowmoStaging(a.length);
  const { mid, floor, horizon, far, rise, spread, blastMs } = SW_STAGE;
  return (
    <div className="sw" style={{ "--sw-bob":px(-s.size * 0.09) }}>
      {/* the horizon: seven stacks, the favorites' in turn, the big one in the middle */}
      {STACKS.map(([u, chips, scale], j) => {
        const big = j === STACKS.length - 1;
        return <Stack key={j} owner={b[big ? 0 : (j + 1) % b.length]} x={Math.round(mid + u * spread)} y={horizon} chips={chips}
          scale={scale} big={big} i={j} at={big ? SW.boom - SW.first : j * blastMs} />;
      })}
      {/* the walkers, coming toward us; the middle ones in front */}
      {a.map((player, k) => ({ player, k, x:s.xs[k] }))
        .sort((p, q) => Math.abs(q.x - mid) - Math.abs(p.x - mid))
        .map(({ player, k, x }) => (
          <span key={player} className="neon-node sw-walk" style={{ left:x, top:floor,
            "--sw-from":`translate(${px((x - mid) * (far - 1))}, ${px(rise)}) scale(${far})`, "--i":k }}>
            <NeonChip player={player} size={s.size} x={0} y={0} className="sw-a" style={{ "--i":k }} />
          </span>
        ))}
    </div>
  );
}

/* the camera's anchors: the walkers where they stop, and the horizon */
SlowmoWalk.anchors = cast => {
  const s = slowmoStaging(Math.min(7, cast?.a?.length || 1));
  return { minX:s.minX, maxX:s.maxX, mid:SW_STAGE.mid };
};
