import React from "react";
import { CAST, RIG } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { DUST_LOW, Dust } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./dominoes.css";

const DM = bitById("dominoes").beats;

/* dominoes (team, versus, slapstick): the favorites (b) stand in a line on
   the left like dominoes, each turned three quarters toward the tapper,
   fists on hips, chins up. The underdogs (a) stand back on the right;
   their smallest, a size down, walks up to the first favorite, cocks one
   finger and taps it on the chest. It goes over backwards, stiff, onto
   the one behind it, and the line goes in a chain, each a beat after the
   last. The last is knocked back onto its heels, throws its gloves up and
   teeters there a long time, the whole leaning line riding with it,
   balances... and goes flat, the rest settling onto it in a fanned row.
   The underdogs nod once.

   A chip seen face on is a disc, and a disc falling sideways reads as
   rolling; turned three quarters and falling back in 3D it foreshortens,
   so it reads as falling flat (quickdraw's felled plank), and a fallen
   line lies shingled like a run of dominoes. Every lean is computed here
   from the chips' spacing (a chip leans on the next when its top meets
   that one's face) so they rest touching and the last lies on the floor.
   The chain spans the same time whatever its length (DM.chain to
   DM.last), each a step of span / (n - 1) after the one before. Every
   glove is its own chip's: the favorites' fists sit behind their own
   discs, the watchers' hands are clasped behind their backs, the
   tapper's one finger points ahead of it. */
export const DM_STAGE = Object.freeze({ mid:960, floor:CAST.floor, budget:1600, max:210,
  /* the three-quarter turn, and the gap between dominoes along their facing (in chips) */
  yaw:50, gap:0.68,
  /* the watchers' spacing, the tapper's size, its walk, its jab, in chips */
  wstep:1.16, tapper:0.78, walk:0.9, jab:0.1,
  /* a chip's top over its feet; how far back a fallen one lies (the last
     flat on the floor, the rest propped on the edge of the one behind) */
  top:RIG.lift + 1, flat:88, propped:84 });

/* the last one's teeter, from DM.last: [ms, degrees back] (the CSS keys,
   dominoes.css dm-teeter, are at these instants) */
export const DM_TEETER = Object.freeze([[0, 0], [160, 15], [330, 4], [520, 17], [690, 6.5], [850, 13.5], [980, 8.5], [1090, 11.5],
  [1380, 11]]);

const r2 = n => Math.round(n * 100) / 100;
const rad = deg => deg * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
/* how far back a domino leans on the next one leaning `next` degrees: its
   top on that one's face, `gap` behind it */
export function leanOn(next, { gap = DM_STAGE.gap, top = DM_STAGE.top, cap = DM_STAGE.propped } = {}) {
  return r2(Math.min(cap, next + deg(Math.asin(Math.min(1, gap * Math.cos(rad(next)) / top)))));
}
/* the line at rest with the last at `last` degrees: each leaning on the next */
export function chainAngles(n, last, opts) {
  const out = new Array(Math.max(0, n)).fill(0);
  if (!n) return out;
  out[n - 1] = last;
  for (let i = n - 2; i >= 0; i--) out[i] = leanOn(out[i + 1], opts);
  return out;
}

/* where everyone stands, in chip units, then in canvas px: the line on
   the left (the first favorite at its right end), the tapper's walk, the
   watchers on the right in a row and, four or more, a second row a step
   back between them */
export function dominoesStaging(na = 3, nb = 3) {
  const { yaw, gap, wstep, tapper, walk, jab } = DM_STAGE;
  const a = Math.max(1, Math.min(7, na)), b = Math.max(1, Math.min(7, nb));
  const step = gap / Math.sin(rad(yaw)), half = 0.5 * Math.cos(rad(yaw));
  /* the line: the last (leftmost) at 0, lying back to about a chip left of its feet */
  const unitXs = Array.from({ length:b }, (_, i) => (b - 1 - i) * step);
  const b0 = unitXs[0];
  const glove = RIG.glove / RIG.art;
  const reach = tapper * (RIG.handX + 95.5 * glove + jab);
  const tapAt = b0 + half + reach, tapStart = tapAt + walk;
  const m = a - 1;
  const back = m >= 4 ? Math.floor((m - 1) / 2) : 0, front = m - back;
  const fronts = Array.from({ length:front }, (_, i) => tapStart + 1.1 + i * wstep);
  const start = Math.floor((front - 1 - back) / 2);
  const backs = Array.from({ length:back }, (_, j) => tapStart + 1.1 + (start + j + 0.5) * wstep);
  const lo = -1.05, hi = (front ? fronts[front - 1] : tapStart) + 0.55;
  const units = hi - lo;
  const size = Math.round(Math.min(DM_STAGE.max, DM_STAGE.budget / units));
  const left = DM_STAGE.mid - units * size / 2;
  const at = u => Math.round(left + (u - lo) * size);
  return { a, b, m, size, tapSize:Math.round(size * tapper), half,
    fronts:fronts.map(at), backs:backs.map(at), tapStart:at(tapStart), tapAt:at(tapAt), xs:unitXs.map(at),
    minX:Math.round(left), maxX:Math.round(left + units * size), backRise:Math.round(Math.min(size * 0.6, 64)) };
}

const px = n => `${Math.round(n * 10) / 10}px`;
const ms = n => `${Math.round(n)}ms`;

export function Dominoes({ cast }) {
  const a = (cast?.a || []).slice(0, 7), b = (cast?.b || []).slice(0, 7);
  const s = dominoesStaging(a.length || 1, b.length || 1);
  const { size, tapSize:tap } = s;
  const n = b.length;
  const dt = n > 1 ? (DM.last - DM.chain) / (n - 1) : 0;
  const tipAt = i => dt * i;
  /* every pose of a favorite is the same two turns: three quarters to
     face the tapper, then back about its feet */
  const turn = back => `rotateY(${-DM_STAGE.yaw}deg) rotateX(${r2(back)}deg)`;
  const upright = leanOn(0);
  const keys = DM_TEETER.map(([, w]) => chainAngles(n, w));
  const down = chainAngles(n, 50), flat = chainAngles(n, DM_STAGE.flat), bounce = chainAngles(n, DM_STAGE.flat - 10);
  /* the tapper is a[0]; the rest watch, in front and (four or more) back rows */
  const tapper = a[0];
  const rows = a.slice(1).map((player, i) => i < s.fronts.length ? { player, x:s.fronts[i], back:false }
    : { player, x:s.backs[i - s.fronts.length], back:true });
  const lastX = s.xs[n - 1] ?? s.xs[0];
  const watcher = k => ({ "--fold":px(Math.round(size * k * 0.8)), "--low":px(Math.round(size * k * 0.06)) });
  return (
    <div className="dm" style={{ "--hips":px(Math.round(size * 0.32)), "--hip-y":px(-Math.round(size * 0.02)),
      "--up-x":px(Math.round(size * 0.22)), "--up-y":px(-Math.round(size * 0.5)),
      "--persp":px(size * 4.2), "--persp-y":px(-size * 1.7) }}>
      {/* the watchers: the back row first, a step up the floor, a size down */}
      {rows.filter(row => row.back).map(({ player, x }) => (
        <CastChip key={player} player={player} size={Math.round(size * 0.9)} x={x} y={DM_STAGE.floor - s.backRise} facing={-1}
          className="dm-a dm-watch is-back" style={watcher(0.9)} hands="fist" />
      ))}
      {rows.filter(row => !row.back).map(({ player, x }) => (
        <CastChip key={player} player={player} size={size} x={x} y={DM_STAGE.floor} facing={-1} className="dm-a dm-watch"
          style={watcher(1)} hands="fist" />
      ))}
      {/* the favorites, the last (leftmost) drawn first, so each lies over the one behind it */}
      {b.map((player, i) => ({ player, i })).reverse().map(({ player, i }) => {
        const last = i === n - 1;
        const style = {
          "--t":ms(tipAt(i)), "--dt":ms(Math.max(1, dt)), "--sag-at":ms(tipAt(i + 1)),
          "--sag":ms(Math.max(1, DM.last - DM.chain - tipAt(i + 1))),
          "--r0":turn(0), "--u":turn(upright), "--kd":turn(down[i]), "--kf":turn(flat[i]), "--kb":turn(bounce[i]),
          ...Object.fromEntries(keys.map((k, j) => [`--k${j}`, turn(k[i])])),
        };
        return <CastChip key={player} player={player} size={size} x={s.xs[i]} y={DM_STAGE.floor} facing={0}
          className={`dm-b${last ? " is-last" : " is-link"}`} style={style}
          hands={last ? [["fist", 0], ["open", DM.last + 100]] : "fist"} />;
      })}
      {/* the tapper: walks up, cocks a finger, taps */}
      {tapper && <CastChip player={tapper} size={tap} x={s.tapStart} y={DM_STAGE.floor} facing={-1} className="dm-a dm-tapper"
        style={{ "--walk":px(s.tapAt - s.tapStart), "--hop":px(-Math.round(tap * 0.12)),
          "--aim":`translate(${px(tap * 0.14)}, ${px(-tap * 0.06)}) rotate(10deg)`,
          "--jab":`translate(${px(-tap * DM_STAGE.jab)}, 0px) rotate(0deg)`, "--rest":"translate(0px, 0px) rotate(0deg)" }}
        hands={{ front:[["rest", 0], ["point", DM.raise], ["rest", DM.nod - 300]], back:"rest" }} />}
      {/* the dust where the last one lands flat */}
      <Dust className="dm-dust" at={DM.flat} puffs={DUST_LOW} spread={size / CAST.size * 0.7} size={size / CAST.size * 0.9}
        style={{ left:lastX - size * 0.55, top:DM_STAGE.floor - size * 0.2 }} />
    </div>
  );
}

/* the camera's anchors: "tap" between the tapper and the first favorite,
   "last" the last favorite as it teeters, "mid" the line and the
   watchers, minX to maxX everything (the last one lying flat included) */
Dominoes.anchors = cast => {
  const s = dominoesStaging(Math.min(7, cast?.a?.length || 1), Math.min(7, cast?.b?.length || 1));
  const last = s.xs[s.xs.length - 1];
  return { mid:Math.round((s.minX + s.maxX) / 2), minX:s.minX, maxX:s.maxX,
    tap:Math.round((s.tapAt + s.xs[0]) / 2), last:Math.round(last + s.size * 0.2) };
};
