import React, { createContext, useContext, useId } from "react";
import { floodColor } from "../../identity/chipInk.js";
import { usePlayerIdentity, usePlayerInitials } from "../../identity/PlayerIdentityContext.js";
import { CHIP_ART, HAND_BOX, HAND_CUFF, HAND_CUFF_EDGE, HAND_POSES, HAND_SLEEVE, HAND_SLEEVE_EDGES, NEON_TONES, TUBE, circlePath,
  spokesPath } from "./neonArt.js";
import "./neon.css";

/* The bits' neon (Oct 14). Everything in a bit is a sign: tubes of light
   bent over dark glass (neonArt.js holds the drawings). Three components:

     Neon        one drawing: its dark glass, its tubes lit (a wide soft
                 halo, a tight glow, the tube, its white-hot core), each
                 tube in a group (`g`) a scene can light or put out by
                 class (.ng-<g>), and, for a sign's frames, the unlit glass
                 tubes that stay visible while another frame is lit
     NeonChip    a player: their photo chip on its edge, a dark glass coin
                 rimmed in their own lit color. No hands, no eyes: it acts
                 by moving (hop, squash, tilt, roll, spin on its edge)
     HouseHand   the one hand in the world, a croupier's, reaching in from
                 off screen in its poses

   Every part is a node of no size, so a transform's origin is that node:
   a chip squashes about its feet, rolls about its middle, a hand swings
   about its wrist. A bit animates them by class on its own clock
   (bits.css: --ba from calc(var(--tl) + ...)). Transforms and opacity
   only, so the glow is drawn once and moved. */

/* a rehearsal's stand-in photos (no photo server): player -> URL */
const CastPhotos = createContext(null);
export const CastPhotosProvider = ({ photos = null, children }) =>
  <CastPhotos.Provider value={photos}>{children}</CastPhotos.Provider>;

/* "this many ms into the bit", on the bit's clock */
export const at = ms => `calc(var(--tl) + ${Math.round(Number(ms) || 0)}ms)`;

const toneOf = tone => NEON_TONES[tone] || tone || NEON_TONES.bone;
const groupsOf = tubes => {
  const out = new Map();
  for (const tube of tubes) {
    const g = tube.g || "main";
    if (!out.has(g)) out.set(g, []);
    out.get(g).push(tube);
  }
  return [...out];
};
const strokeOf = (tube, k, extra = {}) => ({ d:tube.d, fill:"none", strokeWidth:(tube.w || TUBE.w) * k, strokeLinecap:"round",
  strokeLinejoin:"round", ...extra });

/* One neon drawing. `box` is its art box [x, y, w, h] (0 0 is the node it
   hangs from), `scale` canvas px per art unit. `tubes` [{ d, tone, w, g,
   glass }], `fills` [{ d, fill }] (dark glass by default). A tube with
   `glass` also draws its unlit tube under it, so putting its group out
   leaves the bent glass showing, the way a real sign's off frames do. */
export function Neon({ box, scale = 1, tubes = [], fills = [], className = "", style, children }) {
  const [x, y, w, h] = box;
  const widest = Math.max(TUBE.fine, ...tubes.map(tube => tube.w || TUBE.w));
  const groups = groupsOf(tubes);
  const svg = (cls, body) => (
    <svg className={cls} viewBox={`${x} ${y} ${w} ${h}`} width={w * scale} height={h * scale} aria-hidden="true" focusable="false">{body}</svg>
  );
  const lit = (k, extra) => groups.map(([g, list]) => <g key={g} className={`ng ng-${g}`}>
    {list.map((tube, i) => <path key={i} {...strokeOf(tube, k, extra?.(tube) || { stroke:toneOf(tube.tone) })} />)}
  </g>);
  return (
    <span className={`neon${className ? ` ${className}` : ""}`}
      style={{ left:x * scale, top:y * scale, width:w * scale, height:h * scale, "--neon-px":`${Math.round(widest * scale * 10) / 10}px`, ...style }}>
      {svg("neon-halo", lit(2.6))}
      {svg("neon-glow", lit(1.55))}
      {svg("neon-body", <>
        {fills.map((fill, i) => <path key={`f${i}`} d={fill.d} className="neon-fill" style={fill.fill ? { fill:fill.fill } : undefined} />)}
        {tubes.some(tube => tube.glass) && <g className="neon-glass">
          {tubes.filter(tube => tube.glass).map((tube, i) => <path key={i} {...strokeOf(tube, 1, { stroke:toneOf(tube.tone) })} />)}
        </g>}
        {lit(1)}
        {groups.map(([g, list]) => <g key={`c${g}`} className={`ng ng-${g} neon-core`}>
          {list.map((tube, i) => <path key={i} {...strokeOf(tube, 0.36, { stroke:`color-mix(in srgb, ${toneOf(tube.tone)} 28%, #fff)` })} />)}
        </g>)}
      </>)}
      {children}
    </span>
  );
}

/* the pose layers' timing: each shows from its own ms to the next one's;
   at rest (reduced motion, a finished bit) only the last shows. A switch
   is one step at its START (tests/stepped-fill.test.mjs). */
export function swapTimeline(spec, known = null) {
  const ok = name => !known || Object.hasOwn(known, name);
  const list = Array.isArray(spec) ? spec.filter(item => ok(item?.[0])).map(([name, ms]) => [name, Number(ms) || 0])
    : [[spec, 0]];
  return (list.length ? list : [[Array.isArray(spec) ? null : spec, 0]]).sort((a, b) => a[1] - b[1]);
}
export function swapStyle(list, i) {
  const last = i === list.length - 1;
  const [, from] = list[i];
  const parts = [];
  const shows = i > 0 || from > 0;
  if (shows) parts.push(`neon-on 1ms step-start ${at(from)} both`);
  if (!last) parts.push(`neon-off 1ms step-start ${at(list[i + 1][1])} ${shows ? "forwards" : "both"}`);
  return parts.length ? { opacity:last ? 1 : 0, "--ba":parts.join(", "), animation:"var(--ba)" } : { opacity:1 };
}
/* Drawings that take turns on the bit's clock (a sign's frames, a prop's
   states): [[node, ms], ...], each shown from its ms to the next one's,
   cut in like a sign's next frame; at rest only the last. */
export function Swaps({ layers = [], className = "" }) {
  const list = layers.map(([node, ms]) => [node, Number(ms) || 0]).sort((a, b) => a[1] - b[1]);
  return list.map(([node], i) => <span key={i} className={`neon-swap${className ? ` ${className}` : ""}`} style={swapStyle(list, i)}>{node}</span>);
}

/* ── the chip ── */

/* each chip's rim buzzes on its own phase (a stable number from its player) */
const buzzOf = player => [...String(player || "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 4300;

/* the player's own color as light: their flood (identity/chipInk.js) */
export function useNeonColor(player) {
  const identity = usePlayerIdentity(player || null);
  return floodColor(identity.color);
}

/* the coin itself, centred on its node */
export function ChipCoin({ player, photo, size = 240, dim = false }) {
  const identity = usePlayerIdentity(player);
  const initials = usePlayerInitials(player);
  const photos = useContext(CastPhotos);
  const uid = useId().replace(/:/g, "");
  const src = photo !== undefined ? photo : photos?.[player] ?? identity.photo ?? null;
  const k = size / (CHIP_ART.r * 2);
  const { body, rim, inner, photo:pr, spots, spot } = CHIP_ART;
  return (
    <span className={`nc-coin${dim ? " is-dim" : ""}`} style={{ left:-size / 2, top:-size / 2, width:size, height:size }}>
      <svg className="nc-face" viewBox="-50 -50 100 100" width={size} height={size} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`ncp-${uid}`}><circle cx="0" cy="0" r={pr} /></clipPath>
          <radialGradient id={`ncg-${uid}`} cx="40%" cy="32%" r="70%">
            <stop offset="0" stopColor="#1d2236" /><stop offset="1" stopColor="#06070d" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r={body} fill={`url(#ncg-${uid})`} />
        {src ? <image href={src} x={-pr} y={-pr} width={pr * 2} height={pr * 2} preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#ncp-${uid})`} />
          : <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" className="nc-initials">{initials || ""}</text>}
      </svg>
      <span className="neon-node" style={{ left:size / 2, top:size / 2 }}>
        <Neon box={[-50, -50, 100, 100]} scale={k} className="nc-rim" tubes={[
          { d:circlePath(0, 0, rim), tone:"player", w:3.4 },
          { d:circlePath(0, 0, inner), tone:"player", w:1.3, g:"inner" },
          { d:spokesPath(spots, spot[0], spot[1], 0, 0, 22.5), tone:"player", w:2.4, g:"spots" },
        ]} />
      </span>
    </span>
  );
}

/* One player: their chip standing on its edge, feet at (x, y). Layers,
   each a node of no size (neon.css):
     .nc                 placed at the feet
       .nc-move          locomotion: slides, runs, flights
         .nc-pool        its light on the floor (stays down when it hops)
         .nc-hop         hops and bobs
           .nc-body      squash and stretch about the feet
             .nc-tilt    leans, wobbles, falls about the feet
               .nc-roll  turns about its middle (rolling, a flick's spin)
                 .nc-spin    spins on its edge (rotateY), tips back (rotateX)
               .nc-wear  what sits on it (headphones, shades), at its middle
   `size` the chip's width; the light pool and the color ride --neon-player. */
export function NeonChip({ player, photo, size = 240, x = 0, y = 930, pool = true, wear = null, className = "", style, children }) {
  const color = useNeonColor(player);
  return (
    <div className={`nc${className ? ` ${className}` : ""}`} data-player={player}
      style={{ left:x, top:y, "--neon-player":color, "--nc-size":`${size}px`, "--nc-buzz":`${-(buzzOf(player) % 4300)}ms`, ...style }}>
      <div className="nc-move">
        {pool && <span className="nc-pool" style={{ left:-size * 0.7, top:-size * 0.09, width:size * 1.4, height:size * 0.18 }} />}
        <div className="nc-hop"><div className="nc-body"><div className="nc-tilt">
          <div className="nc-roll" style={{ top:-size / 2 }}>
            <div className="nc-spin"><ChipCoin player={player} photo={photo} size={size} /></div>
          </div>
          {wear && <div className="nc-wear" style={{ top:-size / 2 }}>{wear}</div>}
          {children}
        </div></div></div>
      </div>
    </div>
  );
}

/* ── the house hand ── */

const HAND_TUBES = pose => {
  const art = HAND_POSES[pose] || HAND_POSES.point;
  return [
    { d:art.d, tone:"bone", w:TUBE.w * 0.66 },
    ...art.lines.map(d => ({ d, tone:"bone", w:TUBE.w * 0.42 })),
    { d:HAND_CUFF_EDGE, tone:"cyan", w:TUBE.w * 0.6, g:"cuff" },
    { d:HAND_SLEEVE_EDGES, tone:"cyan", w:TUBE.w * 0.46, g:"cuff" },
  ];
};
const HAND_FILLS = pose => [{ d:HAND_SLEEVE }, { d:HAND_CUFF }, { d:(HAND_POSES[pose] || HAND_POSES.point).d }];

/* one pose of the hand, drawn in its look, wrist on the node */
export function HandArt({ pose = "point", look = "neon", scale = 1 }) {
  const uid = useId().replace(/:/g, "");
  const art = HAND_POSES[pose] || HAND_POSES.point;
  if (look === "glove") {
    const [x, y, w, h] = HAND_BOX;
    return (
      <span className="hh-art is-glove" style={{ left:x * scale, top:y * scale, width:w * scale, height:h * scale }}>
        <svg viewBox={`${x} ${y} ${w} ${h}`} width={w * scale} height={h * scale} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`hhs-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a4055" /><stop offset=".22" stopColor="#151925" /><stop offset=".6" stopColor="#080a10" />
              <stop offset="1" stopColor="#040508" />
            </linearGradient>
          </defs>
          <path d={HAND_SLEEVE} fill="#0a0c13" />
          <path d="M-1400 -41L-58 -41" stroke="var(--neon-amber)" strokeOpacity=".55" strokeWidth="2" />
          <path d={HAND_CUFF} fill="var(--bone)" />
          <circle cx="-32" cy="2" r="7" fill="var(--neon-amber)" /><circle cx="-34" cy="0" r="2.6" fill="#fff6d8" />
          <path d={art.d} fill={`url(#hhs-${uid})`} stroke="#ffd9a0" strokeOpacity=".4" strokeWidth="1.5" />
          {art.lines.map((d, i) => <path key={i} d={d} fill="none" stroke="#2f3549" strokeWidth="2.5" strokeLinecap="round" />)}
          <path d="M4 -38C26 -45 56 -51 100 -50" fill="none" stroke="#ffe2b0" strokeWidth="2.6" strokeLinecap="round" opacity=".9" />
        </svg>
      </span>
    );
  }
  return <Neon box={HAND_BOX} scale={scale} className="hh-art" tubes={HAND_TUBES(pose)} fills={HAND_FILLS(pose)} />;
}

/* The house hand, wrist at (x, y), pointing along `angle` degrees (0 is
   right, 90 down), its sleeve running back off screen. `poses` is a pose
   or [[pose, ms], ...] on the bit's clock; `hold` a node held where the
   pose holds things (each pose's `at`), drawn behind the fingers. Layers:
     .hh                 placed at the wrist
       .hh-rot           turned to `angle`, sized by `scale` (static)
         .hh-reach       in and out along the arm (translateX: negative
                         is back up the sleeve, off screen)
           .hh-fx        a gesture: a flick's kick, a jiggle, a press
             .hh-pose.is-<pose>   one layer per pose it takes */
export function HouseHand({ poses = "point", angle = 0, scale = 1, x = 0, y = 0, look = "neon", hold = null, className = "", style }) {
  const list = swapTimeline(poses, HAND_POSES);
  return (
    <div className={`hh${className ? ` ${className}` : ""}`} style={{ left:x, top:y, ...style }}>
      <div className="hh-rot" style={{ transform:`rotate(${Math.round(angle * 10) / 10}deg) scale(${scale})` }}>
        <div className="hh-reach"><div className="hh-fx">
          {list.map(([pose], i) => {
            const spot = (HAND_POSES[pose] || HAND_POSES.point).at;
            const held = !hold ? null : typeof hold === "function" ? hold(pose) : React.isValidElement(hold) ? hold : hold[pose] ?? null;
            return (
              <div key={`${pose}:${i}`} className={`hh-pose is-${pose}`} style={swapStyle(list, i)}>
                {held && <div className="hh-held" style={{ left:spot.x, top:spot.y }}>{held}</div>}
                <HandArt pose={pose} look={look} />
              </div>
            );
          })}
        </div></div>
      </div>
    </div>
  );
}
