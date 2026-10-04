import React, { memo, useId, useSyncExternalStore } from "react";
import { backglassScene, discStripes, GLASS_DISC } from "../features/tv/desertModel.js";
import { isPhase } from "./phase.js";
import "./glass-art.css";

/* The phone's piece of the backglass painting: the TV's own geometry
   (desertModel's backglassScene: banded sky, the session's sun or moon cut
   by stripes, the far range, Camelback, two buttes lit on one face,
   saguaros, the floor), cropped to the horizon around the session's disc so
   a panel carries the same painted glass the room sees. Flat inks only. The
   session is the root's data-phase (TH1, usePhaseTheme) unless a preview
   passes one, so a phase change relamps every panel with the TV.
   Decorative: aria-hidden.

   It is the whole painting, sky to floor, for the one lit piece of a
   viewport: it fills its scene (glass-art.css .fd-glass-scene), cut from
   the bottom, and the content is lettered on it. */
const SCENE = backglassScene();
/* the slice of the 1920-wide glass a phone panel shows: centred so the
   session's disc and a butte are both in it */
const CENTER = { fri:1330, sam:620, sap:1290, san:1290, fin:960 };
const SPAN = 1100;
/* a phone scene is cut to the last few hundred units above its floor, so the
   session's disc rides a little higher than on the TV, clear of the butte
   it would otherwise sit behind */
const LIFT = { fri:50, sam:40, sap:50, san:60 };

function readPhase() {
  const phase = typeof document === "undefined" ? null : document.documentElement.getAttribute("data-phase");
  return isPhase(phase) ? phase : "fri";
}
function subscribe(onChange) {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes:true, attributeFilter:["data-phase"] });
  return () => observer.disconnect();
}
const useRootPhase = () => useSyncExternalStore(subscribe, readPhase, () => "fri");

/* `clear`: the scene is lettered (an event or champion name on the
   horizon, a line in a window), so no saguaro stands behind a letter.
   true keeps the whole width clear (a lettered horizon runs edge to edge,
   chevron included); { from, to } keeps that share of the panel's width
   clear (0 is its left edge, 1 its right) and lets saguaros stand outside
   it. A saguaro is kept out when any part of its arms reaches the zone. */
const SAGUARO_HALF = 56;
function clearZone(clear) {
  if (!clear) return null;
  if (clear === true) return { from:0, to:1 };
  return { from:Math.max(0, Number(clear.from) || 0), to:Math.min(1, clear.to ?? 1) };
}
const standsClear = (cactus, left, zone) => {
  if (!zone) return true;
  const half = SAGUARO_HALF * cactus.scale;
  const a = (cactus.x - half - left) / SPAN, b = (cactus.x + half - left) / SPAN;
  return b < zone.from || a > zone.to;
};

function GlassArtView({ phase = null, className = "", depth = false, clear = false }) {
  const rootPhase = useRootPhase();
  const session = isPhase(phase) ? phase : rootPhase;
  const clip = `fd-glass-clip-${useId().replace(/:/g, "")}`;
  const span = SPAN, top = 0;
  const { width, horizon, floor:h } = SCENE;
  const left = Math.max(0, Math.min(width - span, CENTER[session] - span / 2));
  const tv = GLASS_DISC[session];
  const disc = tv?.r > 0 ? { ...tv, y:tv.y - (LIFT[session] || 0) } : null;
  const stripes = disc?.r > 0 ? discStripes(disc) : [];
  const zone = clearZone(clear);
  const box = { viewBox:`${left} ${top} ${span} ${h}`, preserveAspectRatio:"xMidYMax slice", "aria-hidden":"true", focusable:"false" };
  const sky = <>
    {SCENE.bands.map(band => <rect key={band.layer} className={`fd-glass-${band.layer}`} y={band.y} width={width} height={band.h} />)}
    <g className="fd-glass-stars">
      {SCENE.stars.filter(star => star.y > top - 6).map((star, i) =>
        <circle key={i} cx={star.x} cy={star.y} r={star.r * 2.2} opacity={star.dim ? .5 : 1} />)}
    </g>
    {disc?.r > 0 && <g className="fd-glass-disc" clipPath={`url(#${clip})`}>
      <circle cx={disc.x} cy={disc.y} r={disc.r} />
      {stripes.map(stripe => <rect key={stripe.y} className={`fd-glass-${stripe.band}`}
        x={disc.x - disc.r - 2} y={stripe.y} width={disc.r * 2 + 4} height={stripe.h} />)}
    </g>}
  </>;
  const range = <>
    <path className="fd-glass-far" d={SCENE.far} />
    <path className="fd-glass-mid" d={SCENE.hump} />
  </>;
  const buttes = SCENE.buttes.map((butte, i) => <g key={i}>
    <path className="fd-glass-mesa" d={butte.lit} />
    <path className="fd-glass-shade" d={butte.shade} />
  </g>);
  /* in depth, the floor runs on below the frame so a layer that rides up
     never shows an edge */
  const below = depth ? 80 : 0;
  const floor = <>
    <rect className="fd-glass-ground" y={horizon} width={width} height={SCENE.floor - horizon + below} />
    <rect className="fd-glass-rim" y={horizon} width={width} height={6} />
    <g className="fd-glass-cactus">
      {SCENE.cacti.filter(c => standsClear(c, left, zone))
        .map((c, i) => <path key={i} d={c.d} transform={`translate(${c.x} ${c.y}) scale(${c.scale})`} />)}
    </g>
  </>;
  const clipDef = <defs><clipPath id={clip}><rect y={top} width={width} height={horizon - top} /></clipPath></defs>;
  if (!depth) return (
    <svg className={`fd-glass-art${className ? ` ${className}` : ""}`} data-phase={phase ? session : undefined} {...box}>
      {clipDef}{sky}{range}{buttes}{floor}
    </svg>
  );
  /* Depth: the same painting cut into the backglass's printed layers, sky,
     far range, buttes, floor, each its own plate. Inside a pane with
     useGlassTilt they part as the pane leans (near plates slide most), and
     where scroll-driven animation runs they drift a few px with scroll,
     the sky least. At rest they register exactly as the flat painting. */
  return (
    <span className={`fd-glass-art fd-glass-depth${className ? ` ${className}` : ""}`} data-phase={phase ? session : undefined}
      aria-hidden="true">
      <svg data-glass-depth="0" {...box}>{clipDef}{sky}</svg>
      {/* the range's own ink runs under the horizon, so the floor plate
          sliding down shows the range's foot, never the sky */}
      <svg data-glass-depth="1" {...box}>
        <rect className="fd-glass-far" y={horizon} width={width} height={SCENE.floor - horizon + 80} />
        {range}
      </svg>
      <svg data-glass-depth="2" {...box}>{buttes}</svg>
      <svg data-glass-depth="3" {...box}>{floor}</svg>
    </span>
  );
}

export const GlassArt = memo(GlassArtView);
