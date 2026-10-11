import React, { useId } from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { ChipStack, Dust, DUST_LOW, Emanata, Fireball, FloorShadow, LooseChip, MuzzleFlash, Puff, SmokeCloud } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./dontlookback.css";

/* dontlookback (loss, action): the loser stands facing us, its own tall
   stack of chips just behind its shoulder. A fuse fizzes up the side of
   the stack; it does not notice. The fizz goes into the top. Nothing. The
   stack goes up: a white frame, a burst, a fireball, its chips shot up out
   of the frame. It does not turn round. It does not move. It is black from
   the middle down. Its chips come down all round it, one off the top of
   its head (it dips, and comes back), and the last one spins down slowly
   and lands flat on its head, like a hat.

   The stage's camera shoots it (the registry's camera, in this stage's
   world x: the chip at 860, the stack at 1052). */
const DL = bitById("dontlookback").beats;
export const DL_STAGE = Object.freeze({ x:860, floor:CAST.floor, stack:Object.freeze({ x:1052, y:896, count:16, width:152 }) });

const px = n => `${Math.round(n * 10) / 10}px`;

/* the fuse, from its loose end on the floor up the side of the stack and
   over the top's rim, in world px */
export const FUSE = Object.freeze([[1150, 920], [1134, 892], [1140, 850], [1126, 806], [1138, 760], [1124, 716], [1136, 672],
  [1118, 632], [1088, 608]]);
/* the chips raining down: [ms after the rain beat, x from the chip, where
   on the floor]; the registry's cues land on the same instants */
export const RAIN = Object.freeze([[0, -250, 944], [150, 214, 954], [250, -142, 962], [380, 306, 946], [560, -340, 956], [700, 136, 966]]);
/* the spark's sparks, all the way round it */
const SPARKS = Object.freeze([[-90, 20, 36], [-30, 22, 40], [30, 20, 34], [90, 22, 38], [150, 20, 34], [210, 22, 40]]);
/* the stack's chips, shot up out of the frame: [dx, dy, turn] */
const BURST = Object.freeze([[-160, -760, 500], [-40, -900, -420], [90, -820, 380], [220, -700, -520], [-260, -620, 300],
  [300, -880, 460], [10, -760, -300], [160, -940, 540]]);

/* black from the middle down: soot licked up the face by the blast, in
   round tongues, inside the chip's rim (drawn in a 240 px chip's units) */
const SOOT = "M0,240 L0,150 Q14,150 22,132 Q30,114 40,134 Q48,152 62,148 Q74,144 80,128 Q86,114 94,132 Q102,150 116,148"
  + " Q128,146 132,124 Q138,104 146,126 Q154,148 168,144 Q178,140 182,128 Q188,116 196,132 Q204,150 214,142 Q220,136 224,122"
  + " Q230,110 236,128 L240,140 L240,240 Z";
function Scorch({ size }) {
  const clip = `dl-scorch-${useId().replace(/:/g, "")}`;
  const s = size / 240;
  return (
    <svg className="dl-scorch" viewBox="0 0 240 240" width={size} height={size} aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="120" cy="120" r={240 * 14.7 / 32 - 1} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <path d={SOOT} style={{ fill:"var(--bit-scorch)" }} />
        {[[52, 196, 30], [150, 178, 24], [104, 214, 20]].map(([cx, cy, w], i) =>
          <path key={i} d={`M${cx - w / 2},${cy} q${w / 2},-6 ${w},0`} className="bit-line" strokeWidth={4 / s}
            style={{ stroke:"color-mix(in srgb, var(--bone) 16%, transparent)" }} />)}
      </g>
    </svg>
  );
}

export function DontLookBack({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, stack } = DL_STAGE;
  const g = castGeometry(CAST.size);
  const head = floor + g.top;
  const climb = DL.top - DL.fuse;
  /* the spark's path, as offsets from the fuse's loose end */
  const [x0, y0] = FUSE[0];
  const sparkVars = Object.fromEntries(FUSE.map(([fx, fy], i) => [`--p${i}`, `translate(${px(fx - x0)}, ${px(fy - y0)})`]));
  const blast = { x:stack.x, y:stack.y - 140 };
  const style = { "--bonk-off":`translate(${px(-226)}, ${px(floor + 22 - head)})`, "--hat-from":`translate(${px(90)}, ${px(-420)})`,
    "--climb":`${climb}ms` };
  return (
    <div className="dl" style={style}>
      {/* where the stack stood, after */}
      <span className="dl-node dl-scar" style={{ left:stack.x, top:stack.y + 4 }}><FloorShadow w={250} h={40} className="is-falling" /></span>
      <span className="dl-node dl-stack" style={{ left:stack.x, top:stack.y }}>
        <ChipStack player={player} count={stack.count} width={stack.width} />
      </span>
      {/* the fuse, burning away behind its spark */}
      <svg className="dl-fuse" viewBox="0 0 1920 1080" width="1920" height="1080" aria-hidden="true">
        {FUSE.slice(1).map(([fx, fy], i) => {
          const [ax, ay] = FUSE[i];
          const d = `M${ax},${ay} L${fx},${fy}`;
          return <g key={i} className="dl-fuse-seg" style={{ "--burn":`${Math.round(climb * (i + 1) / (FUSE.length - 1))}ms` }}>
            <path d={d} className="dl-fuse-ink" />
            <path d={d} className="dl-fuse-cord" />
          </g>;
        })}
      </svg>
      <span className="dl-node dl-spark-at" style={{ left:x0, top:y0, ...sparkVars }}>
        <span className="dl-node dl-spark">
          <span className="dl-node dl-spark-rays"><Emanata rays={SPARKS} width={6} scale={0.9} color="var(--bit-fire)" /></span>
          <span className="dl-node dl-spark-flash"><MuzzleFlash scale={0.5} /></span>
        </span>
      </span>
      <span className="dl-node dl-snuff" style={{ left:FUSE[FUSE.length - 1][0], top:FUSE[FUSE.length - 1][1] + 6 }}><Puff scale={0.55} /></span>
      {/* the stack going up: a burst, a fireball, its chips shot out of the top of the frame */}
      <span className="dl-node dl-fireball" style={{ left:blast.x, top:blast.y }}><Fireball scale={1.55} /></span>
      {/* the smoke that comes out of it, climbing out of the top of the frame */}
      {[[0, -190, 1.5, 0], [-90, -120, 1.1, 1], [96, -140, 1.2, 2]].map(([dx, dy, scale, i]) => (
        <span key={i} className="dl-node dl-smoke" style={{ left:blast.x + dx, top:blast.y + dy, "--i":i }}>
          <SmokeCloud scale={scale} fire={i < 2} />
        </span>
      ))}
      {BURST.map(([dx, dy, turn], i) => (
        <span key={i} className="dl-node dl-burst" style={{ left:blast.x, top:blast.y, "--dx":px(dx), "--dy":px(dy), "--turn":`${turn}deg` }}>
          <LooseChip player={player} size={96} />
        </span>
      ))}
      <span className="dl-node dl-flash" style={{ left:blast.x, top:blast.y - 20 }}><MuzzleFlash scale={3.6} /></span>
      {/* it does not move */}
      <CastChip player={player} x={x} y={floor} facing={0} className="dl-chip" hands={{ l:"rest", r:"rest" }}
        wear={<span className="dl-node dl-scorched"><Scorch size={g.size} /></span>}>
        {[-1, 1].map(side => <span key={side} className="dl-node dl-sooty" style={{ left:g.shoes[side < 0 ? "l" : "r"].x + side * 4, top:-12 }} />)}
      </CastChip>
      {[[-1, 0], [1, 1]].map(([side, i]) => (
        <span key={i} className="dl-node dl-fume" style={{ left:x + side * g.size * 0.4, top:floor - g.size * 0.4, "--i":i }}>
          <Puff scale={0.8} />
        </span>
      ))}
      {/* its chips, coming back down */}
      {RAIN.map(([dt, dx, y], i) => (
        <span key={i} className="dl-node dl-rain" style={{ left:x + dx, top:y, "--at":`${dt}ms`, "--i":i }}>
          <span className="dl-node dl-rain-fall"><span className="dl-node dl-rain-turn"><LooseChip player={player} size={104} /></span></span>
          <span className="dl-node dl-rain-flat"><ChipStack player={player} count={1} width={104} thick={15} /></span>
        </span>
      ))}
      {/* the one off its head: lands on the top, bounces off into the dirt */}
      <span className="dl-node dl-bonk" style={{ left:x + 6, top:head }}>
        <span className="dl-node dl-bonk-fly"><span className="dl-node dl-bonk-turn"><LooseChip player={player} size={104} /></span></span>
        <span className="dl-node dl-bonk-flat" style={{ left:-226, top:floor + 22 - head }}>
          <ChipStack player={player} count={1} width={104} thick={15} /></span>
      </span>
      <Dust className="dl-bonk-dust" at={DL.bonk + 380} puffs={DUST_LOW} spread={0.3} size={0.42} style={{ left:x - 220, top:floor + 18 }} />
      {/* the last one: spinning down, flat on its head */}
      <span className="dl-node dl-hat" style={{ left:x, top:head + 4 }}>
        <span className="dl-node dl-hat-fall"><span className="dl-node dl-hat-spin"><LooseChip player={player} size={118} /></span></span>
        <span className="dl-node dl-hat-on"><ChipStack player={player} count={1} width={118} thick={15} /></span>
      </span>
    </div>
  );
}
