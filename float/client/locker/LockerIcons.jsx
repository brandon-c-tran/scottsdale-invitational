/* The Locker's chip glyphs: one small drawing per hat, pair of shades and
   pose (float/shared/looks.js), stroked in currentColor on a 32 grid. The
   art module draws the real accessories on the rider; these only name
   them at a glance. */
import React from "react";

const NONE = <><circle cx="16" cy="16" r="10" /><path d="M9 23 23 9" /></>;

const GLYPHS = {
  hat:{
    none:NONE,
    cowboy:<><path d="M3 20c4 3 22 3 26 0" /><path d="M9 19c0-5 1-10 3-10 1.5 0 2.5 1.5 4 1.5S18.5 9 20 9c2 0 3 5 3 10" /></>,
    bucket:<><path d="M10 9h12l2 10H8z" /><path d="M5 19c3 3 19 3 22 0" /></>,
    visor:<><path d="M6 15c3-3 17-3 20 0" /><path d="M6 15c0 2 1 3 3 3h17c2 0 3-1.5 1-3" /></>,
    captain:<><path d="M6 14c0-4 20-4 20 0v2H6z" /><path d="M6 16h20" /><path d="M8 16c2 3 9 4 14 1" /><circle cx="16" cy="12" r="1.6" /></>,
    party:<><path d="M10 25 16 6l6 19z" /><path d="M12 19h8M13 14h6" /><circle cx="16" cy="5" r="2" /></>,
    flowers:<><path d="M5 19c4 3 18 3 22 0" /><circle cx="9" cy="15" r="3" /><circle cx="16" cy="13" r="3" /><circle cx="23" cy="15" r="3" /></>,
    crown:<><path d="M6 22h20l2-12-6 5-6-8-6 8-6-5z" /><path d="M7 26h18" /></>,
  },
  shades:{
    none:NONE,
    aviators:<><path d="M4 13h24" /><path d="M5 13c0 5 2 8 5 8s4-3 4-8" /><path d="M18 13c0 5 1 8 4 8s5-3 5-8" /></>,
    hearts:<><path d="M10 22 5 16c-2-3 1-6 3-5 1 0 2 1 2 2 0-1 1-2 2-2 2-1 5 2 3 5z" /><path d="M22 22l-5-6c-2-3 1-6 3-5 1 0 2 1 2 2 0-1 1-2 2-2 2-1 5 2 3 5z" /></>,
    stars:<><path d="m9 9 1.6 3.4 3.7.4-2.8 2.5.8 3.7L9 17l-3.3 2 .8-3.7-2.8-2.5 3.7-.4z" /><path d="m23 9 1.6 3.4 3.7.4-2.8 2.5.8 3.7L23 17l-3.3 2 .8-3.7-2.8-2.5 3.7-.4z" /></>,
    goggles:<><path d="M3 16h3M26 16h3" /><circle cx="11" cy="16" r="5" /><circle cx="21" cy="16" r="5" /><path d="M16 16h0" /></>,
  },
  pose:{
    flex:<><path d="M6 26v-6c0-3 2-5 5-5h3" /><path d="M14 15c1-4 0-8-3-9-2 0-3 2-2 4l2 3" /><path d="M14 15c4-1 9 1 10 5 1 3-1 6-5 6H6" /></>,
    chug:<><path d="m11 8 10 2-2 15-8-1z" /><path d="M11.5 13l9 1.6" /><path d="M21 12c3 0 4 2 3 5" /></>,
    airguitar:<><path d="M20 12 27 5" /><path d="M25 3l4 4" /><circle cx="13" cy="20" r="6" /><path d="M17 15c2-2 4-1 3 1" /><circle cx="13" cy="20" r="1.6" /></>,
    backflip:<><path d="M8 22c-3-6 1-14 8-14s11 8 8 14" /><path d="m21 20 3 2 2-3" /><circle cx="16" cy="18" r="2" /></>,
  },
};

export function LookGlyph({ kind, id }) {
  const glyph = GLYPHS[kind]?.[id] || NONE;
  return <svg className={`fll-look-glyph is-${kind}-${id}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">{glyph}</svg>;
}

export function CheckBadge() {
  return <svg className="fll-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
