import React, { memo, useId, useMemo, useRef } from "react";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { desertScene, FIXED_STARS, isNightSky } from "./desertModel.js";

/* The Desert Clock: a paper-cut Scottsdale horizon, every layer one flat
   fill from the --desert-* tokens. A phase change swaps fills in six hard
   steps and slides the disc; nothing moves between beats. Reduced motion
   applies the phase at once (the global rule drops every transition). */

function WinnerStar({ star, x, y, r, fresh }) {
  const identity = usePlayerIdentity(star.player);
  return (
    <circle className={`tv-desert-star is-winner${fresh ? " is-new" : ""}`} cx={x} cy={y} r={r}
      style={{ fill:identity.color, transformOrigin:`${x}px ${y}px` }} />
  );
}

function DesertBandView({ phase = "fri", width = 1920, height = 118, variant = "strip", stars = [], lines = [],
  showStars = null, starBox = null, className = "" }) {
  const grainId = `tv-grain-${useId().replace(/:/g, "")}`;
  const scene = useMemo(() => desertScene({ width, height, variant }), [width, height, variant]);
  const night = showStars ?? isNightSky(phase);
  const disc = scene.disc[phase] || scene.disc.fri;
  /* where stars may sit: the whole sky, or (on the TV backdrop) one fixed
     patch clear of the masthead type, the same in every view */
  const box = starBox || { left:0, right:width, top:scene.sky.top, bottom:scene.sky.bottom };
  const small = box.bottom - box.top < 80;
  const at = star => {
    const spread = small ? 7 : 12;
    return [Math.round(box.left + star.x * (box.right - box.left) + star.dx * spread),
      Math.round(box.top + star.y * (box.bottom - box.top) + star.dy * spread)];
  };
  const starR = small ? 3.5 : 5.5;
  /* stars that arrive after this band mounted pop in; a refreshed TV
     shows them already there */
  const seen = useRef(null);
  if (seen.current === null) seen.current = new Set(stars.map(star => star.id));
  const fresh = stars.filter(star => !seen.current.has(star.id)).map(star => star.id);
  fresh.forEach(id => seen.current.add(id));
  const freshSet = new Set(fresh);
  return (
    <svg className={`tv-desert is-${variant}${className ? ` ${className}` : ""}`} data-phase={phase}
      width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="4" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0" />
        </filter>
      </defs>
      <rect className="tv-desert-sky" width={width} height={height} />
      <g className={`tv-desert-stars${night ? " is-on" : ""}`}>
        {FIXED_STARS.map(([x, y], i) => (
          <circle key={i} className="tv-desert-star" cx={Math.round(box.left + x * (box.right - box.left))}
            cy={Math.round(box.top + y * 3 * (box.bottom - box.top))}
            r={small ? 1.6 : 2} style={{ opacity:0.35 + (i % 3) * 0.2 }} />
        ))}
      </g>
      <g className="tv-desert-disc" style={{ transform:`translate(${disc.x}px, ${disc.y}px)` }}>
        <circle r={scene.discR} />
      </g>
      {night && stars.length > 0 && (
        <g className="tv-desert-constellation">
          {lines.map(line => line.points.slice(1).map((point, i) => {
            const [x1, y1] = at(line.points[i]), [x2, y2] = at(point);
            return <line key={`${line.player}-${i}`} className="tv-desert-line" x1={x1} y1={y1} x2={x2} y2={y2}
              pathLength="1" style={{ animationDelay:`${i * 180}ms` }} />;
          }))}
          {stars.map(star => {
            const [x, y] = at(star);
            return <WinnerStar key={star.id} star={star} x={x} y={y} r={starR} fresh={freshSet.has(star.id)} />;
          })}
        </g>
      )}
      <path className="tv-desert-far" d={scene.far} />
      <path className="tv-desert-mid" d={scene.mid} />
      <path className="tv-desert-ground" d={scene.ground} />
      <g className="tv-desert-cactus">
        {scene.cacti.map((c, i) => (
          <path key={i} d={c.d} transform={`translate(${c.x} ${c.y}) scale(${c.scale})`} />
        ))}
      </g>
      {scene.nearTop < height && <rect className="tv-desert-near" y={scene.nearTop} width={width} height={height - scene.nearTop} />}
      <rect width={width} height={height} filter={`url(#${grainId})`} opacity=".05" style={{ mixBlendMode:"screen" }} />
    </svg>
  );
}

export const DesertBand = memo(DesertBandView);
