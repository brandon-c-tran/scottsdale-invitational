import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { DUST_LOW, Dust, Puff } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./teamphoto.css";

const TP = bitById("teamphoto").beats;

/* teamphoto (team, win, desert): the team lines up for its photo, facing
   an old camera on a wooden tripod at the side, in the foreground. The
   one nearest it stands behind the camera, presses the button, and the
   self-timer lamp starts blinking; it hurries back round into its place.
   On a count they strike their poses, each its own (a thumb up, a fist on
   a hip, a finger at the camera, a finger at the sky, a wave), and hold
   them, dead still, while the lamp blinks faster and faster. The flash.
   They hold. Then the camera, on its tripod, slowly tips over and lands
   with its legs in the air. Nobody moves.

   The staging: up to four stand in one row; five to seven stand in two,
   the back row up on a bench, smaller, each between two in front so every
   face shows. A row steps 1.7 chips, so each one's gloves (in any pose)
   stay plainly its own. The chip size is whatever lets the team and the
   fallen tripod span the shot's width. */
export const TP_STAGE = Object.freeze({ mid:960, floor:CAST.floor, span:1600, maxSize:220, max:7,
  /* in chips: a row's step, the bench's height, the back row's size and
     depth, the tripod's feet in front of the team's and its gap */
  pitch:1.7, bench:0.62, backK:0.86, depth:22, near:30, gap:0.62 });

const r1 = n => Math.round(n * 10) / 10 || 0;
const px = n => `${r1(n)}px`;

/* the poses, for a chip facing the camera (to its right), as where each
   wrist goes (in chips, from the feet), the glove's pose and its turn */
const HAND = {
  thumbR:{ pose:"thumb", x:0.6, y:-0.6, fx:"scaleX(1) rotate(0deg)" },
  thumbL:{ pose:"thumb", x:-0.6, y:-0.6, fx:"scaleX(1) rotate(0deg)" },
  /* raised beside the face: the back row, over the front row's heads */
  thumbUpR:{ pose:"thumb", x:0.6, y:-0.74, fx:"scaleX(1) rotate(0deg)" },
  thumbUpL:{ pose:"thumb", x:-0.6, y:-0.74, fx:"scaleX(1) rotate(0deg)" },
  hipR:{ pose:"fist", x:0.635, y:-0.465, fx:"scaleX(-1) rotate(40deg)" },
  hipL:{ pose:"fist", x:-0.635, y:-0.465, fx:"scaleX(-1) rotate(-40deg)" },
  pointR:{ pose:"point", x:0.62, y:-0.6, fx:"scaleX(1) rotate(-6deg)" },
  skyR:{ pose:"point", x:0.4, y:-1.075, fx:"scaleX(1) rotate(-78deg)" },
  waveR:{ pose:"open", x:0.68, y:-0.84, fx:"scaleX(1) rotate(12deg)" },
  waveL:{ pose:"open", x:-0.68, y:-0.84, fx:"scaleX(1) rotate(-12deg)" },
};
const POSES = {
  thumbHip:{ r:HAND.thumbR, l:HAND.hipL },
  pointHip:{ r:HAND.pointR, l:HAND.hipL },
  hips:{ r:HAND.hipR, l:HAND.hipL },
  twoThumbs:{ r:HAND.thumbR, l:HAND.thumbL },
  skyThumb:{ r:HAND.skyR, l:HAND.thumbUpL },
  twoWave:{ r:HAND.waveR, l:HAND.waveL },
  twoThumbsUp:{ r:HAND.thumbUpR, l:HAND.thumbUpL },
};
/* the front row from the camera's end (the one who ran last), the back
   row from the left */
const FRONT_POSES = ["pointHip", "thumbHip", "hips", "twoThumbs"];
const BACK_POSES = ["skyThumb", "twoWave", "twoThumbsUp"];
/* who strikes when (by place, left to right, front then back): a ripple
   that is not in order */
const STRIKE = [2, 0, 4, 1, 5, 3, 6];

/* the tripod, in chips from the middle of its feet: the head the legs
   meet at, the camera on it, its lens to the left at the team, the flash
   dish over it, the self-timer lamp on its face, the button on top; it
   tips over on its right foot. Drawn TS chips to the unit. */
const TS = 1.3;
const TRIPOD = Object.freeze({ head:0.8, foot:0.32, body:{ x0:-0.26, x1:0.24, y0:-1.1, y1:-0.8 }, lens:{ x0:-0.46, y:-0.95, r:0.085 },
  dish:{ x:-0.13, y:-1.3, r:0.13 }, lamp:{ x:-0.2, y:-1.03, r:0.05 }, button:{ x:0.13, y:-1.12 } });

export function photoStaging(n = 3) {
  const N = Math.max(1, Math.min(TP_STAGE.max, n || 1));
  const two = N >= 5;
  const nf = two ? Math.ceil(N / 2) : N, nb = N - nf;
  const P = TP_STAGE.pitch;
  /* in chips, the front row's middle at 0 */
  const front = Array.from({ length:nf }, (_, i) => (i - (nf - 1) / 2) * P);
  /* the back row between the front's: one fewer, or as many with the
     extra at the left end */
  const back = Array.from({ length:nb }, (_, i) => nb < nf ? front[i] + P / 2 : front[i] - P / 2);
  const left = Math.min(front[0], back[0] ?? Infinity) - 0.95;
  const right = front[nf - 1] + 0.9;
  const tx = right + TP_STAGE.gap + 0.3 * TS;
  /* the runner starts behind the camera; the fallen tripod reaches past it */
  const end = tx + (TRIPOD.foot + 1.5) * TS;
  const units = end - left;
  const s = Math.min(TP_STAGE.maxSize, Math.floor(TP_STAGE.span / units));
  const origin = TP_STAGE.mid - (left + end) / 2 * s;
  const X = u => r1(origin + u * s);
  const F = TP_STAGE.floor, k = TP_STAGE.backK;
  const benchTop = F - TP_STAGE.depth - TP_STAGE.bench * s;
  const members = [
    ...front.map((u, i) => ({ row:"front", i, x:X(u), y:F, size:s, pose:FRONT_POSES[(nf - 1 - i) % FRONT_POSES.length] })),
    ...back.map((u, i) => ({ row:"back", i, x:X(u), y:r1(benchTop), size:Math.round(s * k), pose:BACK_POSES[i % BACK_POSES.length] })),
  ];
  const tripod = { x:X(tx), y:F + TP_STAGE.near };
  const lampX = tripod.x + TRIPOD.lamp.x * s * TS;
  return { N, nf, nb, s, members, tripod, benchTop:r1(benchTop),
    bench:nb ? { x0:X(back[0] - 0.62), x1:X(back[nb - 1] + 0.62) } : null,
    runner:nf - 1, minX:Math.round(X(left)), maxX:Math.round(X(end)), lampX:Math.round(lampX) };
}

/* the tripod and its camera, drawn in canvas px from the middle of its
   feet: wooden legs, a black camera with a brass lens rim, a silver flash
   dish */
function Tripod({ s }) {
  const u = n => r1(n * s);
  const { head, foot, body, lens, dish, button } = TRIPOD;
  const L = CAST.line;
  const leg = (x, cls) => <>
    <path d={`M0,${u(-head)} L${u(x)},0`} className="tp-ink" fill="none" strokeWidth={u(0.07) + L * 2} />
    <path d={`M0,${u(-head)} L${u(x)},0`} className={cls} fill="none" strokeWidth={u(0.07)} />
  </>;
  const box = `M${u(body.x0)},${u(body.y1)} L${u(body.x0)},${u(body.y0) + 6} Q${u(body.x0)},${u(body.y0)} ${u(body.x0) + 6},${u(body.y0)}`
    + ` L${u(body.x1) - 6},${u(body.y0)} Q${u(body.x1)},${u(body.y0)} ${u(body.x1)},${u(body.y0) + 6} L${u(body.x1)},${u(body.y1)} Z`;
  const barrel = `M${u(body.x0)},${u(lens.y - 0.075)} L${u(lens.x0)},${u(lens.y - 0.085)} L${u(lens.x0)},${u(lens.y + 0.085)} L${u(body.x0)},${u(lens.y + 0.075)} Z`;
  const dishPath = `M${u(dish.x - dish.r)},${u(dish.y - 0.02)} A${u(dish.r)},${u(dish.r * 0.8)} 0 0 0 ${u(dish.x + dish.r)},${u(dish.y - 0.02)} Z`;
  const W = u(2.2), H = u(1.6);
  return (
    <svg className="tp-tripod-art" viewBox={`${-W / 2} ${-H} ${W} ${H + u(0.1)}`} width={W} height={H + u(0.1)} style={{ left:-W / 2, top:-H }}
      aria-hidden="true">
      {leg(0.06, "tp-leg-back")}
      {leg(-foot, "tp-leg")}
      {leg(foot, "tp-leg")}
      {/* the flash on its stalk */}
      <path d={`M${u(dish.x)},${u(body.y0)} L${u(dish.x)},${u(dish.y)}`} className="tp-ink" fill="none" strokeWidth={u(0.035) + L * 2} />
      <path d={`M${u(dish.x)},${u(body.y0)} L${u(dish.x)},${u(dish.y)}`} className="tp-metal" fill="none" strokeWidth={u(0.035)} />
      <path d={dishPath} className="tp-ink" strokeWidth={L * 2} />
      <path d={dishPath} className="tp-dish" />
      {/* the head plate, the body, the lens */}
      <path d={`M${u(-0.12)},${u(-head + 0.02)} L${u(0.12)},${u(-head + 0.02)} L${u(0.1)},${u(-head - 0.04)} L${u(-0.1)},${u(-head - 0.04)} Z`}
        className="tp-ink" strokeWidth={L * 2} />
      <path d={barrel} className="tp-ink" strokeWidth={L * 2} />
      <path d={box} className="tp-ink" strokeWidth={L * 2} />
      <path d={`M${u(button.x - 0.04)},${u(body.y0)} L${u(button.x - 0.04)},${u(button.y - 0.03)} L${u(button.x + 0.04)},${u(button.y - 0.03)} L${u(button.x + 0.04)},${u(body.y0)} Z`}
        className="tp-ink" strokeWidth={L * 2} />
      <path d={`M${u(button.x - 0.04)},${u(body.y0)} L${u(button.x - 0.04)},${u(button.y - 0.03)} L${u(button.x + 0.04)},${u(button.y - 0.03)} L${u(button.x + 0.04)},${u(body.y0)} Z`}
        className="tp-button" />
      <path d={box} className="tp-body" />
      <path d={`M${u(body.x0)},${u(body.y0 + 0.08)} L${u(body.x1)},${u(body.y0 + 0.08)}`} className="tp-band" fill="none" strokeWidth={u(0.05)} />
      <path d={barrel} className="tp-barrel" />
      <ellipse cx={u(lens.x0)} cy={u(lens.y)} rx={u(0.04)} ry={u(lens.r)} className="tp-ink" strokeWidth={L * 2} />
      <ellipse cx={u(lens.x0)} cy={u(lens.y)} rx={u(0.04)} ry={u(lens.r)} className="tp-glass" />
      {/* the lamp, unlit */}
      <circle cx={u(TRIPOD.lamp.x)} cy={u(TRIPOD.lamp.y)} r={u(TRIPOD.lamp.r)} className="tp-ink" strokeWidth={L} />
      <circle cx={u(TRIPOD.lamp.x)} cy={u(TRIPOD.lamp.y)} r={u(TRIPOD.lamp.r)} className="tp-lamp-off" />
    </svg>
  );
}
/* the lamp lit (it blinks over the unlit one) */
function Lamp({ s }) {
  const r = TRIPOD.lamp.r * s, R = r * 2.4;
  return (
    <svg className="tp-lamp-art" viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} width={R * 2} height={R * 2} style={{ left:-R, top:-R }} aria-hidden="true">
      <circle cx={0} cy={0} r={R} className="tp-lamp-halo" />
      <circle cx={0} cy={0} r={r} className="tp-lamp-on" />
      <circle cx={-r * 0.3} cy={-r * 0.3} r={r * 0.35} className="tp-lamp-hot" />
    </svg>
  );
}
/* the flash: a burst off the dish, hot in its heart */
function Burst({ s }) {
  const R = 0.95 * s, ri = 0.38 * s, n = 12;
  const pts = Array.from({ length:n * 2 }, (_, i) => {
    const a = (i * 180 / n - 90) * Math.PI / 180, rr = i % 2 ? ri : R * (i % 4 === 0 ? 1 : 0.78);
    return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
  });
  return (
    <svg className="tp-burst-art" viewBox={`${-R - 10} ${-R - 10} ${R * 2 + 20} ${R * 2 + 20}`} width={R * 2 + 20} height={R * 2 + 20}
      style={{ left:-R - 10, top:-R - 10 }} aria-hidden="true">
      <path d={`M${pts.join("L")}Z`} className="tp-ink" strokeWidth={CAST.line} />
      <path d={`M${pts.join("L")}Z`} className="tp-burst" />
      <circle cx={0} cy={0} r={ri * 0.9} className="tp-burst-hot" />
    </svg>
  );
}

/* a bench, two planks on two legs, for the back row to stand on */
function Bench({ x0, x1, top, floor, s }) {
  const h = floor - top, L = CAST.line, t = Math.max(14, 0.09 * s);
  const legW = Math.max(16, 0.11 * s);
  return (
    <svg className="tp-bench" viewBox={`${x0 - 10} ${top - 10} ${x1 - x0 + 20} ${h + 20}`} width={x1 - x0 + 20} height={h + 20}
      style={{ left:x0 - 10, top:top - 10 }} aria-hidden="true">
      {[x0 + 0.2 * s, x1 - 0.2 * s].map((x, i) => <React.Fragment key={i}>
        <rect x={x - legW / 2} y={top + t} width={legW} height={h - t} className="tp-ink" strokeWidth={L * 2} />
        <rect x={x - legW / 2} y={top + t} width={legW} height={h - t} className="tp-wood-dark" />
      </React.Fragment>)}
      <rect x={x0} y={top} width={x1 - x0} height={t} className="tp-ink" strokeWidth={L * 2} />
      <rect x={x0} y={top} width={x1 - x0} height={t} className="tp-wood" />
      <path d={`M${x0 + 6},${top + t * 0.32} L${x1 - 6},${top + t * 0.32}`} className="tp-wood-lit" fill="none" strokeWidth={3} />
    </svg>
  );
}

export function Teamphoto({ cast }) {
  const a = (cast?.a || []).slice(0, TP_STAGE.max);
  const st = photoStaging(a.length);
  const { s, tripod } = st;
  const T = s * TS;
  const people = st.members.map((m, k) => ({ ...m, player:a[k] })).filter(m => m.player);
  /* the order they strike in */
  const strikeAt = new Map(STRIKE.filter(k => k < people.length).map((k, n) => [k, n * 70]));
  const runner = st.runner;
  /* where the runner starts: behind the camera, its left glove on the button */
  const runFrom = tripod.x + TRIPOD.body.x1 * T + 0.5 * s;
  const button = { x:tripod.x + TRIPOD.button.x * T, y:tripod.y + (TRIPOD.button.y - 0.03) * T };
  const member = (m, k) => {
    const g = castGeometry(m.size);
    const spec = POSES[m.pose];
    const go = side => {
      const h = spec[side];
      return `translate(${px(h.x * m.size - g.hands[side].x)}, ${px(h.y * m.size - g.hands[side].y)})`;
    };
    const isRunner = m.row === "front" && m.i === runner;
    const vars = { "--i":k, "--t":`${strikeAt.get(k) ?? 0}ms`, "--hr":go("r"), "--hl":go("l"), "--fr":spec.r.fx, "--fl":spec.l.fx };
    let hands = { r:[["rest", 0], [spec.r.pose, TP.pose + (strikeAt.get(k) ?? 0)]], l:[["rest", 0], [spec.l.pose, TP.pose + (strikeAt.get(k) ?? 0)]] };
    if (isRunner) {
      /* the mirrored point's fingertip is 88 art px out and 13 up from the wrist */
      const tip = { x:-88 * g.glove, y:-13 * g.glove };
      const wrist = { x:button.x - tip.x - runFrom, y:button.y - tip.y - TP_STAGE.floor };
      const press = `translate(${px(wrist.x - g.hands.l.x)}, ${px(wrist.y - g.hands.l.y)})`;
      const poke = `translate(${px(wrist.x - g.hands.l.x)}, ${px(wrist.y - g.hands.l.y + 0.05 * m.size)})`;
      Object.assign(vars, { "--run":px(runFrom - m.x), "--press":press, "--poke":poke });
      hands = { r:hands.r, l:[["point", 0], ["rest", TP.run], ...hands.l.slice(1)] };
    }
    return <CastChip key={m.player} player={m.player} size={m.size} x={m.x} y={m.y} facing={1}
      className={`tp-m is-${m.row}${isRunner ? " is-runner" : ""}`} hands={hands} style={vars} />;
  };
  const dish = { x:tripod.x + TRIPOD.dish.x * T, y:tripod.y + (TRIPOD.dish.y - 0.06) * T };
  return (
    <div className="tp">
      {st.bench && <Bench x0={st.bench.x0} x1={st.bench.x1} top={st.benchTop} floor={TP_STAGE.floor - TP_STAGE.depth + 8} s={s} />}
      {/* the back row first, then the front row */}
      {people.map((m, k) => m.row === "back" ? member(m, k) : null)}
      {people.map((m, k) => m.row === "front" ? member(m, k) : null)}
      {/* the tripod, in the foreground; it tips over on its right foot */}
      <span className="tp-node tp-shadow" style={{ left:r1(tripod.x - 0.5 * T), top:r1(tripod.y - 0.05 * T), width:r1(T), height:r1(0.1 * T) }} />
      <span className="tp-node tp-tripod" style={{ left:r1(tripod.x + TRIPOD.foot * T), top:tripod.y }}>
        <span className="tp-node tp-tip">
          <span className="tp-node" style={{ left:r1(-TRIPOD.foot * T), top:0 }}>
            <Tripod s={T} />
            <span className="tp-node tp-lamp" style={{ left:r1(TRIPOD.lamp.x * T), top:r1(TRIPOD.lamp.y * T) }}><Lamp s={T} /></span>
          </span>
        </span>
      </span>
      <span className="tp-node tp-flash" style={{ left:r1(dish.x), top:r1(dish.y) }}><Burst s={T} /></span>
      <span className="tp-node tp-smoke" style={{ left:r1(dish.x), top:r1(dish.y - 0.1 * s) }}><Puff scale={s / 240 * 0.8} /></span>
      <Dust className="tp-dust" at={TP.crash} puffs={DUST_LOW} spread={s / 300} size={s / 260}
        style={{ left:r1(tripod.x + (TRIPOD.foot + 0.85) * T), top:tripod.y - 6 }} />
    </div>
  );
}

/* the camera's anchors: "mid" everything (the fallen tripod too), "shot"
   the team and the blinking lamp; minX to maxX the span */
Teamphoto.anchors = cast => {
  const st = photoStaging(cast?.a?.length || 1);
  return { mid:Math.round((st.minX + st.maxX) / 2), shot:Math.round((st.minX + st.lampX) / 2), minX:st.minX, maxX:st.maxX };
};
