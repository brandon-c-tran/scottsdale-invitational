/* The backdrop (float/GROOVE.md "The look": soft pastel gradients, a
   checkered water that fades into the distance, flat mesas, saguaros, a big
   sun, lots of empty space). Layers back to front, each drifting by its
   depth as the flotilla floats downstream; the frame driver moves them
   (transform only), from the server clock, so every screen agrees and a
   frozen frame holds. Drawn here in CSS and SVG until the art module's
   painted scenes land (sceneOf in art.jsx). */
import React from "react";
import { useSceneArt } from "../art.jsx";

/* a strip of mesas, 1920 wide, drawn twice for the loop */
const MESAS_FAR = "M0 200 L0 150 L60 150 L80 120 L210 120 L230 150 L330 150 L360 96 L520 96 L548 150 L700 150 L720 132 L800 132 L820 150 "
  + "L980 150 L1010 108 L1170 108 L1198 150 L1340 150 L1360 124 L1460 124 L1480 150 L1600 150 L1630 88 L1790 88 L1818 150 L1920 150 L1920 200 Z";
const MESAS_NEAR = "M0 220 L0 186 L140 186 L170 140 L330 140 L362 186 L560 186 L600 160 L690 160 L716 186 L900 186 L930 130 L1110 130 "
  + "L1146 186 L1300 186 L1326 162 L1420 162 L1446 186 L1640 186 L1676 146 L1820 146 L1850 186 L1920 186 L1920 220 Z";

function Saguaro({ x, h = 120, flip = false }) {
  const s = h / 120;
  return <g transform={`translate(${x} 0) scale(${flip ? -s : s} ${s})`}>
    <path d="M-10 0 L-10 -108 Q-10 -122 0 -122 Q10 -122 10 -108 L10 0 Z M10 -58 L24 -58 Q30 -58 30 -66 L30 -86 Q30 -96 38 -96 Q46 -96 46 -86 L46 -60 Q46 -44 30 -44 L10 -44 Z M-10 -40 L-22 -40 Q-28 -40 -28 -48 L-28 -66 Q-28 -76 -36 -76 Q-44 -76 -44 -66 L-44 -42 Q-44 -26 -28 -26 L-10 -26 Z"
      fill="#6fae7c" stroke="#2c3b33" strokeWidth="4" strokeLinejoin="round" />
  </g>;
}
function Bush({ x, w = 70 }) {
  return <path d={`M${x - w / 2} 0 q${w * 0.1} -${w * 0.42} ${w * 0.3} -${w * 0.3} q${w * 0.12} -${w * 0.36} ${w * 0.32} -${w * 0.2} q${w * 0.2} -${w * 0.2} ${w * 0.38} ${w * 0.5} Z`}
    fill="#93b878" stroke="#2c3b33" strokeWidth="4" strokeLinejoin="round" />;
}

/* the far bank, 1920 wide: sand, cacti, bushes, a few pebbles */
function BankStrip() {
  return <svg className="sc-strip" viewBox="0 0 1920 120" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 120 L0 74 Q240 60 480 70 T960 66 T1440 72 T1920 74 L1920 120 Z" fill="#f2c79a" />
    <path d="M0 74 Q240 60 480 70 T960 66 T1440 72 T1920 74" fill="none" stroke="#2c3b33" strokeWidth="4" />
    <g transform="translate(0 72)">
      <Saguaro x={300} h={96} /><Saguaro x={1180} h={120} flip /><Saguaro x={1760} h={84} />
      <Bush x={120} w={80} /><Bush x={620} w={64} /><Bush x={880} w={96} /><Bush x={1460} w={70} />
    </g>
  </svg>;
}

function Strip({ className, children, depth }) {
  /* two copies side by side; the driver translates the pair by -(drift mod 1920) */
  return <div className={`sc-layer ${className}`} data-depth={depth}>
    <div className="sc-copy">{children}</div>
    <div className="sc-copy">{children}</div>
  </div>;
}

/* the water's rocks (Rock Hop), drifting by */
function Rocks() {
  return <svg className="sc-strip" viewBox="0 0 1920 600" preserveAspectRatio="none" aria-hidden="true">
    {[[180, 120, 70], [760, 60, 50], [1320, 150, 84], [1680, 40, 44], [520, 420, 96], [1080, 330, 64]].map(([x, y, r], k) => <g key={k} transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy={r * 0.18} rx={r * 1.25} ry={r * 0.28} fill="rgba(255,255,255,0.55)" />
      <path d={`M${-r} ${r * 0.1} C${-r} ${-r * 0.5} ${-r * 0.4} ${-r * 0.8} 0 ${-r * 0.78} C${r * 0.5} ${-r * 0.8} ${r} ${-r * 0.4} ${r} ${r * 0.1} Z`}
        fill="#d9b394" stroke="#2c3b33" strokeWidth="4" strokeLinejoin="round" />
      <path d={`M${-r * 0.45} ${-r * 0.42} q${r * 0.25} ${-r * 0.18} ${r * 0.5} 0`} fill="none" stroke="#fff1e0" strokeWidth="6" strokeLinecap="round" />
    </g>)}
  </svg>;
}

/* the art's painted scene: its layers back to front, a looping layer drawn
   twice so it can drift by its depth */
function PaintedScene({ scene }) {
  return <div className="sc sc-art" data-scene={scene.id}>
    {scene.layers.map((layer, k) => layer.loop && layer.depth > 0
      ? <div key={k} className="sc-layer sc-art-layer" data-depth={layer.depth}>
        <img className="sc-copy" src={layer.src} alt="" draggable={false} /><img className="sc-copy" src={layer.src} alt="" draggable={false} />
      </div>
      : <img key={k} className="sc-art-still" src={layer.src} alt="" draggable={false} />)}
  </div>;
}

export default function Scene({ id = "open", mode = null }) {
  const art = useSceneArt(id);
  if (art) return <PaintedScene scene={art} />;
  if (id === "bar") return <div className="sc sc-bar-drawn" data-scene="bar" />;
  return <div className="sc" data-scene={id} data-mode={mode || undefined}>
    <div className="sc-sky" />
    <div className="sc-sun" />
    <Strip className="sc-clouds" depth={0.04}>
      <svg className="sc-strip" viewBox="0 0 1920 300" aria-hidden="true">
        {[[200, 90, 1], [760, 60, 0.8], [1240, 120, 1.15], [1660, 70, 0.7]].map(([x, y, s], k) => <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M-90 20 Q-90 -6 -60 -6 Q-50 -36 -14 -30 Q6 -52 40 -36 Q70 -36 74 -8 Q100 -6 100 20 Z" fill="#fffaf0" opacity="0.9" />
        </g>)}
      </svg>
    </Strip>
    <Strip className="sc-mesas-far" depth={0.1}><svg className="sc-strip" viewBox="0 0 1920 200" preserveAspectRatio="none" aria-hidden="true"><path d={MESAS_FAR} fill="var(--mesa-far)" /></svg></Strip>
    <Strip className="sc-mesas" depth={0.2}><svg className="sc-strip" viewBox="0 0 1920 220" preserveAspectRatio="none" aria-hidden="true">
      <path d={MESAS_NEAR} fill="var(--mesa)" stroke="#5a3a3a" strokeWidth="3" strokeLinejoin="round" opacity="0.95" /></svg></Strip>
    <Strip className="sc-bank" depth={0.42}><BankStrip /></Strip>
    <div className="sc-water">
      <div className="sc-checker-wrap"><div className="sc-checker" data-depth="0.7" /></div>
      <Strip className="sc-ripples" depth={0.85}>
        <svg className="sc-strip" viewBox="0 0 1920 620" preserveAspectRatio="none" aria-hidden="true">
          {[[120, 60, 90], [520, 30, 60], [980, 80, 120], [1460, 40, 80], [300, 200, 140], [820, 260, 100], [1300, 220, 160], [1720, 300, 110],
            [160, 420, 180], [700, 470, 120], [1180, 400, 200], [1640, 520, 150]].map(([x, y, w], k) =>
            <path key={k} d={`M${x} ${y} q${w / 4} -8 ${w / 2} 0 t${w / 2} 0`} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="5" strokeLinecap="round" />)}
        </svg>
      </Strip>
      {id === "rocks" && <Strip className="sc-rocks" depth={0.75}><Rocks /></Strip>}
      {id === "whirlpool" && <div className="sc-whirl"><i /><i /><i /></div>}
      {id === "falls" && <div className="sc-falls"><div className="sc-falls-lip" /><div className="sc-falls-mist" /></div>}
    </div>
    <div className="sc-near">
      <svg className="sc-near-left" viewBox="0 0 420 220" aria-hidden="true">
        <path d="M0 220 L0 120 Q40 70 110 92 Q150 40 220 76 Q290 70 330 130 Q380 150 400 220 Z" fill="#e9b588" stroke="#2c3b33" strokeWidth="5" strokeLinejoin="round" />
        <path d="M40 130 q30 -50 60 -10 M60 104 l-10 -56 M90 112 l14 -60 M120 120 l26 -46" fill="none" stroke="#5f9a6a" strokeWidth="12" strokeLinecap="round" />
      </svg>
      <svg className="sc-near-right" viewBox="0 0 420 220" aria-hidden="true">
        <path d="M420 220 L420 110 Q370 70 300 96 Q250 50 190 90 Q130 96 100 150 Q60 170 40 220 Z" fill="#e9b588" stroke="#2c3b33" strokeWidth="5" strokeLinejoin="round" />
        <path d="M330 120 l-6 -70 M352 124 l20 -66 M308 126 l-30 -50 M374 128 l40 -40" fill="none" stroke="#5f9a6a" strokeWidth="12" strokeLinecap="round" />
      </svg>
    </div>
  </div>;
}

/* the drift a layer of this depth has made by server time t (px) */
export const DRIFT_PX_PER_S = 64;
export function layerOffset(t, depth, { speed = DRIFT_PX_PER_S, period = 1920 } = {}) {
  if (!Number.isFinite(t) || !Number.isFinite(depth)) return 0;
  const x = ((t / 1000) * speed * depth) % period;
  return -(x < 0 ? x + period : x);
}
