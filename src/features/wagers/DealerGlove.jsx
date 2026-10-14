/* The dealer's hand: the gags' white cartoon glove (gags/cast/gloveArt.js,
   the same drawing, keyline and paint) on its own, so the betting table
   can sweep, rake and pay without loading the bits' rig. Right hand, wrist
   at the left; `flip` mirrors it. */
import React from "react";
import { GLOVE_BOX, GLOVE_POSES } from "../gags/cast/gloveArt.js";

const LINE = 7;
const inked = (parts, k, key) => parts.map(([kind, d, w], i) => kind === "cap"
  ? <path key={`${key}${i}`} d={d} className="fd-glove-ink" fill="none" strokeWidth={w + LINE * k * 2} />
  : <path key={`${key}${i}`} d={d} className="fd-glove-ink" strokeWidth={LINE * k * 2} />);
const painted = (parts, key) => parts.map(([kind, d, w], i) => kind === "cap"
  ? <path key={`${key}${i}`} d={d} className="fd-glove-paint is-cap" fill="none" strokeWidth={w} />
  : <path key={`${key}${i}`} d={d} className="fd-glove-paint" />);

/* `size` is the glove's drawn width in px */
export function DealerGlove({ pose = "flat", size = 64, flip = false, className = "" }) {
  const art = GLOVE_POSES[pose] || GLOVE_POSES.flat;
  const { x, y, w, h } = GLOVE_BOX;
  const scale = size / w;
  const shadeAfter = art.shadeAt ?? 0;
  return (
    <svg className={`fd-glove${flip ? " is-flip" : ""}${className ? ` ${className}` : ""}`} viewBox={`${x} ${y} ${w} ${h}`}
      width={size} height={Math.round(h * scale)} aria-hidden="true" focusable="false">
      {art.groups.map((parts, g) => <g key={g}>
        {inked(parts, 1, `i${g}:`)}{painted(parts, `p${g}:`)}
        {g === shadeAfter && (art.shade || []).map((d, i) => <path key={`s${i}`} d={d} className="fd-glove-shade" />)}
      </g>)}
    </svg>
  );
}
