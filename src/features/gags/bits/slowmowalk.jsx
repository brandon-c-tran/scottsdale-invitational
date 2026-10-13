import React from "react";
import { CAST, lineLayout } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { ChipStack, Fireball, Glint, LooseChip, MuzzleFlash, SmokeCloud, Spark, Sunglasses } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./slowmowalk.css";

/* slowmowalk (team, versus, action): the trailer shot, for a whole side.
   The underdogs walk toward us in a line abreast, in slow motion, every
   one in dark glasses, every one stepping. Behind them, small and far on
   the horizon, stand the favorites' chip stacks, one each in its owner's
   color. They go up one after another along the horizon: a flash, a
   fireball, smoke, that player's chips flung into the sky. All but one.
   The walkers stop close. A beat. A spark fizzes on the last stack. It
   goes up, the biggest of them. Nobody turns round. A glint runs along
   the line of lenses.

   Each walker is its own node, scaled about its own feet as it comes
   down the floor, so the line's gaps stay where they are and each glove
   stays its owner's; the stacks stand in those gaps (then just past the
   ends, then behind a walker if the favorites outnumber them), so the
   far horizon shows between the walkers. The chain runs over a fixed
   span whatever the count (the cues are static). Anchors: mid, minX,
   maxX (the line at its stop) and late (the last stack). */
const SM = bitById("slowmowalk").beats;
export const SM_STAGE = Object.freeze({ x:960, floor:CAST.floor, horizon:856, from:Object.freeze({ dy:-36, s:0.6 }), zoom:1.4 });

const px = n => `${Math.round(n * 10) / 10}px`;

/* the line, the stacks' places on the horizon and when each goes up */
export function slowmoStaging(cast) {
  const players = cast?.a || [], beaten = cast?.b || [];
  const line = lineLayout(Math.max(1, players.length));
  const xs = line.xs.map(x => SM_STAGE.x + x);
  const minX = SM_STAGE.x - line.half, maxX = SM_STAGE.x + line.half;
  /* the camera's widest at its base zoom: places past the line's ends
     are used only where that shot still holds them */
  const span = maxX - minX;
  const zoom = Math.min(SM_STAGE.zoom, (1920 - 128) / Math.max(1, span));
  const reach = 960 / zoom - 60;
  const gaps = xs.slice(1).map((x, i) => (x + xs[i]) / 2);
  const ends = [xs[0] - line.step / 2, xs[xs.length - 1] + line.step / 2].filter(x => Math.abs(x - SM_STAGE.x) <= reach);
  const open = [...gaps, ...ends].sort((p, q) => p - q);
  const n = beaten.length;
  let places;
  if (n <= open.length) places = Array.from({ length:n }, (_, j) => open[Math.floor((j + 0.5) * open.length / n)]);
  else {
    /* more favorites than gaps: the rest stand behind a walker (their
       fire still climbs over the heads) */
    const extra = n - open.length;
    places = [...open, ...Array.from({ length:extra }, (_, j) => xs[Math.floor((j + 0.5) * xs.length / extra)])];
  }
  places = places.sort((p, q) => p - q).map(Math.round);
  /* the last to go: the place nearest the middle, in a gap if it can */
  let late = 0;
  places.forEach((x, i) => { if (Math.abs(x - SM_STAGE.x) < Math.abs(places[late] - SM_STAGE.x)) late = i; });
  const chain = places.map((x, i) => i).filter(i => i !== late);
  const times = places.map(() => SM.late);
  chain.forEach((i, j) => { times[i] = Math.round(SM.boom + (chain.length > 1 ? j * (SM.last - SM.boom) / (chain.length - 1) : 0)); });
  const stacks = places.map((x, i) => ({ player:beaten[i], x, t:times[i], late:n > 0 && i === late }));
  return { line, xs, minX:Math.round(minX), maxX:Math.round(maxX), mid:SM_STAGE.x, stacks, lateX:places[late] ?? SM_STAGE.x };
}

/* a stack's chips flung into the sky: [dx, dy, turn] at the top of the arc */
const FLUNG = Object.freeze([[-70, -250, 300], [30, -330, -380], [96, -210, 260], [-130, -170, -220], [150, -300, 340]]);

function Blast({ player, x, t, late, width }) {
  const fire = late ? 1.25 : 0.72;
  const chips = late ? FLUNG : FLUNG.slice(0, 3);
  const chip = Math.round(width * (late ? 0.62 : 0.5));
  return (
    <span className={`sm-node sm-blast${late ? " is-late" : ""}`} data-player={player} style={{ left:x, top:SM_STAGE.horizon, "--t":`${t}ms` }}>
      <span className="sm-node sm-smoke" style={{ top:-60 * fire }}><SmokeCloud scale={(late ? 0.95 : 0.78) * fire} fire /></span>
      <span className="sm-node sm-fire" style={{ top:-70 * fire }}>
        <span className="sm-node sm-boil"><Fireball scale={fire} /></span>
      </span>
      <span className="sm-node sm-stack"><span className="sm-node" style={{ transform:`scale(${width / 150})` }}>
        <ChipStack player={player} count={9} />
      </span></span>
      {late && <span className="sm-node sm-spark" style={{ top:-9 * 17 * width / 150 - 14 }}>
        <span className="sm-node sm-fizz"><Spark scale={0.9} /></span>
      </span>}
      {chips.map(([dx, dy, turn], i) => (
        <span key={i} className="sm-node sm-flung" style={{ top:-40, "--dx":px(dx * fire), "--dy":px(dy * fire), "--turn":`${turn}deg`, "--i":i }}>
          <span className="sm-node sm-flung-turn"><LooseChip player={player} size={chip} /></span>
        </span>
      ))}
      <span className="sm-node sm-flash" style={{ top:-50 * fire }}><MuzzleFlash scale={2.4 * fire} /></span>
    </span>
  );
}

export function Slowmowalk({ cast }) {
  const players = cast?.a || [];
  if (!players.length) return null;
  const s = slowmoStaging(cast);
  const { line } = s;
  const size = line.size, sk = size / CAST.size;
  const width = Math.round(Math.max(48, Math.min(80, size * 0.38)));
  const shown = players.slice(0, line.shown);
  const glintStep = shown.length > 1 ? 360 / (shown.length - 1) : 0;
  const style = { "--from":`translateY(${px(SM_STAGE.from.dy)}) scale(${SM_STAGE.from.s})`, "--bob":px(-size * 0.075) };
  return (
    <div className="sm" style={style}>
      {/* far off on the horizon: the favorites' stacks */}
      <div className="sm-far">
        {s.stacks.map(stack => <Blast key={stack.player || stack.x} {...stack} width={width} />)}
      </div>
      {/* the line abreast, each walker its own node, coming down the floor */}
      {shown.map((player, i) => (
        <span key={player} className="sm-node sm-walk" style={{ left:s.xs[i], top:SM_STAGE.floor }}>
          <CastChip player={player} size={size} x={0} y={0} facing={0} className="sm-walker" hands={{ l:"rest", r:"rest" }}
            wear={<span className="sm-node" style={{ left:size / 2, top:size * 0.45 }}>
              <Sunglasses scale={sk} />
              <span className="sm-node sm-glint" style={{ left:-38 * sk, top:-4 * sk, "--g":`${Math.round(SM.glint + i * glintStep)}ms` }}>
                <Glint scale={0.85 * sk} />
              </span>
            </span>} />
        </span>
      ))}
      {line.more > 0 && <span className="cast-more" style={{ left:s.maxX + 16, top:SM_STAGE.floor - size * 0.6 }}>
        <span className="cast-more-in fd-show" style={{ transform:"translate(0%, -50%)" }}>{`+${line.more}`}</span>
      </span>}
    </div>
  );
}

Slowmowalk.anchors = cast => {
  const s = slowmoStaging(cast);
  return { mid:s.mid, minX:s.minX, maxX:s.maxX, late:s.lateX };
};
