import React, { memo, useId, useMemo, useRef } from "react";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import {
  desertScene, FIXED_STARS, isNightSky, skyBoxClearOfDisc, skyStarLayout, starPath, backglassScene, discStripes,
  GLASS_DISC, GLASS_STARRY,
} from "./desertModel.js";

/* The Desert Clock: a paper-cut Scottsdale horizon, every layer one flat
   fill from the --desert-* tokens. A phase change swaps fills in six hard
   steps and slides the disc; nothing moves between beats. Reduced motion
   applies the phase at once (the global rule drops every transition). */

/* a winner's four-point star in their chip color; the pop scales the inner
   path so it never fights the placement */
function WinnerStar({ star, x, y, r, fresh }) {
  const identity = usePlayerIdentity(star.player);
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className={`tv-desert-star is-winner${fresh ? " is-new" : ""}`} d={starPath(r)}
        style={{ fill:identity.color }} />
    </g>
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
  const box = skyBoxClearOfDisc(starBox || { left:0, right:width, top:scene.sky.top, bottom:scene.sky.bottom },
    disc, scene.discR);
  const { at, starR, fixed, fixedR } = skyStarLayout(box);
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
        {FIXED_STARS.map((point, i) => {
          const [cx, cy] = fixed(point);
          return <circle key={i} className="tv-desert-star" cx={cx} cy={cy} r={fixedR} style={{ opacity:0.35 + (i % 3) * 0.2 }} />;
        })}
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

/* ── the backglass: the whole TV canvas, painted for the session ──
   Banded sky, the sun or moon (striped where it sinks), the far range,
   Camelback, two buttes lit on one face, saguaros and the dark desert
   floor the towers stand on. Stars on the night skies; winners' stars
   from Saturday night. A session change swaps every fill in six hard
   steps, the way a backglass relamps. */
function BackglassView({ phase = "fri", stars = [], className = "" }) {
  const scene = useMemo(() => backglassScene(), []);
  const disc = GLASS_DISC[phase] || GLASS_DISC.fri;
  const starry = GLASS_STARRY.includes(phase);
  const stripes = discStripes(disc);
  const clip = `tv-glass-disc-${useId().replace(/:/g, "")}`;
  const { at, starR } = skyStarLayout(scene.starBox);
  const seen = useRef(null);
  if (seen.current === null) seen.current = new Set(stars.map(star => star.id));
  const fresh = new Set(stars.filter(star => !seen.current.has(star.id)).map(star => star.id));
  fresh.forEach(id => seen.current.add(id));
  const { width, height, horizon, floor } = scene;
  return (
    <svg className={`tv-desert is-glass${className ? ` ${className}` : ""}`} data-phase={phase}
      width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <clipPath id={clip}><rect width={width} height={horizon} /></clipPath>
      </defs>
      {scene.bands.map(band => <rect key={band.layer} className={`tv-desert-${band.layer}`} y={band.y} width={width} height={band.h} />)}
      <g className={`tv-desert-stars${starry ? " is-on" : ""}`}>
        {scene.stars.map((star, i) => <circle key={i} className={`tv-desert-star${star.dim ? " is-dim" : ""}`}
          cx={star.x} cy={star.y} r={star.r} />)}
      </g>
      {isNightSky(phase) && stars.length > 0 && (
        <g className="tv-desert-constellation">
          {stars.map(star => {
            const [x, y] = at(star);
            return <WinnerStar key={star.id} star={star} x={x} y={y} r={starR * 1.6} fresh={fresh.has(star.id)} />;
          })}
        </g>
      )}
      {disc.r > 0 && (
        <g className="tv-desert-disc" clipPath={`url(#${clip})`}>
          <circle cx={disc.x} cy={disc.y} r={disc.r} />
          {stripes.map(stripe => <rect key={stripe.y} className={`tv-desert-${stripe.layer || stripe.band}`}
            x={disc.x - disc.r - 2} y={stripe.y} width={disc.r * 2 + 4} height={stripe.h} />)}
        </g>
      )}
      <path className="tv-desert-far" d={scene.far} />
      <path className="tv-desert-mid" d={scene.hump} />
      {scene.buttes.map((butte, i) => <g key={i}>
        <path className="tv-desert-mesa" d={butte.lit} />
        <path className="tv-desert-shade" d={butte.shade} />
      </g>)}
      <rect className="tv-desert-ground" y={horizon} width={width} height={floor - horizon} />
      <rect className="tv-desert-rim" y={horizon} width={width} height={4} />
      <g className="tv-desert-cactus">
        {scene.cacti.map((c, i) => <path key={i} d={c.d} transform={`translate(${c.x} ${c.y}) scale(${c.scale})`} />)}
      </g>
      <rect className="tv-desert-near" y={floor} width={width} height={height - floor} />
    </svg>
  );
}

export const Backglass = memo(BackglassView);
