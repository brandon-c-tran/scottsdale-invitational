import React, { useId } from "react";

/* The Backglass icon set: one family on a 24 unit grid (live area 3 to 21),
   round caps and joins, currentColor. Lines are the unlit state; `lit` fills
   the same silhouette and cuts its detail out of it (a mask, so it reads on
   any glass), the way a lamp insert lights: the active tab, a done check, a
   chosen control. The stroke steps with the rendered size (optical sizing)
   so a 14px glyph keeps its weight and a 44px one does not go heavy.
   Always decorative: the control carries the name.

   "open" (the arrow out of the corner) marks only a link that opens another
   view; "next" is the chevron for a row that drills in; "then" is a step in
   a sequence. */

/* a chip's edge: six short dashes between the rim and the inlay */
const CHIP_TICKS = [30, 90, 150, 210, 270, 330].map(deg => {
  const a = deg * Math.PI / 180;
  const p = r => `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
  return `M${p(5.5)}L${p(6.6)}`;
}).join("");

const HOUSE = "M4.5 10.3 12 4.2l7.5 6.1v8.2a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z";
const SPEAKER = "M4 9.4h3.1L12 5.6v12.8l-4.9-3.8H4z";
const CAMERA = "M3.5 8.6A2.1 2.1 0 0 1 5.6 6.5h2.1l1.7-2.4h5.2l1.7 2.4h2.1a2.1 2.1 0 0 1 2.1 2.1v9.3a2.1 2.1 0 0 1-2.1 2.1H5.6a2.1 2.1 0 0 1-2.1-2.1z";
const STAR = "M12 3.7l2.55 5.2 5.7.82-4.13 4.03.98 5.68L12 16.75l-5.1 2.68.98-5.68L3.75 9.72l5.7-.82z";
const PIN = "M12 20.8s-6.4-5.5-6.4-10.7a6.4 6.4 0 0 1 12.8 0c0 5.2-6.4 10.7-6.4 10.7z";
const PLANE = "M12 3.2c.85 0 1.35.95 1.35 2.2v4.3l6.9 4.1v1.9l-6.9-2.1v4.1l2.1 1.6v1.5L12 20l-3.45.8v-1.5l2.1-1.6v-4.1l-6.9 2.1v-1.9l6.9-4.1V5.4c0-1.25.5-2.2 1.35-2.2z";
const BOOK = "M12 6.6C10 5.1 7 4.6 4 5.2v13.6c3-.6 6-.1 8 1.4 2-1.5 5-2 8-1.4V5.2c-3-.6-6-.1-8 1.4z";
const CUP = "M7.5 4.4h9v4.9a4.5 4.5 0 0 1-9 0z";
const STACK_TOP = "M5 8.2c0-1.66 3.13-3 7-3s7 1.34 7 3-3.13 3-7 3-7-1.34-7-3z";

/* name: { line, lit:{ fill, cut } }. `fill` draws the lit silhouette in
   currentColor; `cut` is drawn in black inside the mask and removed. */
const ICONS = {
  /* the tab bar */
  home:{
    line:<><path d={HOUSE} /><path d="M10 20v-4.4a2 2 0 0 1 4 0V20" /></>,
    lit:{ fill:<path d={HOUSE} />, cut:<path d="M10.1 21v-5.3a1.9 1.9 0 0 1 3.8 0V21z" fill="#000" stroke="none" /> },
  },
  events:{
    line:<><circle cx="5.6" cy="6.5" r="1.7" /><circle cx="5.6" cy="12" r="1.7" /><circle cx="5.6" cy="17.5" r="1.7" />
      <path d="M10.2 6.5h9.3M10.2 12h9.3M10.2 17.5h6.3" /></>,
    lit:{ fill:<><circle cx="5.6" cy="6.5" r="2.1" /><circle cx="5.6" cy="12" r="2.1" /><circle cx="5.6" cy="17.5" r="2.1" />
      <path d="M10.2 6.5h9.3M10.2 12h9.3M10.2 17.5h6.3" fill="none" strokeWidth="2.4" /></>, cut:null },
  },
  bets:{
    line:<><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="12" r="2.9" /><path d={CHIP_TICKS} /></>,
    lit:{ fill:<circle cx="12" cy="12" r="8.6" />, cut:<><circle cx="12" cy="12" r="2.9" /><path d={CHIP_TICKS} /></> },
  },
  weekend:{
    line:<><path d="M6.6 16.4a5.4 5.4 0 0 1 10.8 0" /><path d="M3.5 16.4h17M7.5 20h9M12 5.2v2M5.9 8.1l1.4 1.4M18.1 8.1l-1.4 1.4" /></>,
    lit:{ fill:<><path d="M6.2 16.4a5.8 5.8 0 0 1 11.6 0z" /><path d="M3.5 16.4h17M7.5 20h9M12 5.2v2M5.9 8.1l1.4 1.4M18.1 8.1l-1.4 1.4" fill="none" /></>, cut:null },
  },

  /* movement */
  next:{ line:<path d="m9.5 5.5 6.5 6.5-6.5 6.5" /> },
  back:{ line:<path d="m14.5 5.5-6.5 6.5 6.5 6.5" /> },
  expand:{ line:<path d="m5.5 9.5 6.5 6.5 6.5-6.5" /> },
  collapse:{ line:<path d="m5.5 14.5 6.5-6.5 6.5 6.5" /> },
  open:{ line:<><path d="M7.4 16.6 16.4 7.6" /><path d="M9.2 7.6h7.2v7.2" /></> },
  then:{ line:<><path d="M4.5 12h14.6" /><path d="m13.6 6.5 5.5 5.5-5.5 5.5" /></> },
  up:{ line:<><path d="M12 19.5V4.9" /><path d="m6.5 10.4 5.5-5.5 5.5 5.5" /></> },
  down:{ line:<><path d="M12 4.5v14.6" /><path d="m6.5 13.6 5.5 5.5 5.5-5.5" /></> },

  /* marks */
  check:{
    line:<path d="m4.9 12.7 4.5 4.5 9.7-9.9" />,
    lit:{ fill:<circle cx="12" cy="12" r="9.2" />, cut:<path d="m7.6 12.4 3 3 5.9-6.1" /> },
  },
  close:{
    line:<path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4" />,
    lit:{ fill:<circle cx="12" cy="12" r="9.2" />, cut:<path d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8" /> },
  },
  plus:{
    line:<path d="M12 5v14M5 12h14" />,
    lit:{ fill:<circle cx="12" cy="12" r="9.2" />, cut:<path d="M12 7.6v8.8M7.6 12h8.8" /> },
  },
  minus:{ line:<path d="M5 12h14" /> },
  more:{ line:<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" /></g> },
  /* the app's menu (the header's More options): three bars, never the
     pill's dots, which open the next step's alternatives */
  menu:{ line:<path d="M4.5 7h15M4.5 12h15M4.5 17h10" /> },
  star:{ line:<path d={STAR} />, lit:{ fill:<path d={STAR} />, cut:null } },
  search:{ line:<><circle cx="10.6" cy="10.6" r="6.1" /><path d="m15.2 15.2 4.9 4.9" /></> },

  /* media and sound */
  song:{
    line:<><path d="M9 17.4V5.9l10-2v11.4" /><circle cx="6.5" cy="17.4" r="2.5" /><circle cx="16.5" cy="15.3" r="2.5" /></>,
    lit:{ fill:<><path d="M9 17.4V5.9l10-2v11.4" fill="none" /><circle cx="6.5" cy="17.4" r="2.5" /><circle cx="16.5" cy="15.3" r="2.5" /><path d="M9 6l10-2v3.2L9 9.2z" /></>, cut:null },
  },
  sound:{
    line:<><path d={SPEAKER} /><path d="M15.4 9.3a3.9 3.9 0 0 1 0 5.4M18.2 6.7a7.6 7.6 0 0 1 0 10.6" /></>,
    lit:{ fill:<><path d={SPEAKER} /><path d="M15.4 9.3a3.9 3.9 0 0 1 0 5.4M18.2 6.7a7.6 7.6 0 0 1 0 10.6" fill="none" /></>, cut:null },
  },
  mute:{
    line:<><path d={SPEAKER} /><path d="m15.6 9.5 5 5M20.6 9.5l-5 5" /></>,
    lit:{ fill:<><path d={SPEAKER} /><path d="m15.6 9.5 5 5M20.6 9.5l-5 5" fill="none" /></>, cut:null },
  },
  play:{ line:<path d="M8 5.6v12.8l10.2-6.4z" fill="currentColor" /> },
  pause:{ line:<path d="M7.6 5.6h2.4v12.8H7.6zM14 5.6h2.4v12.8H14z" fill="currentColor" /> },
  stop:{ line:<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="1.6" fill="currentColor" /> },
  camera:{
    line:<><path d={CAMERA} /><circle cx="12" cy="13.1" r="3.5" /></>,
    lit:{ fill:<path d={CAMERA} />, cut:<circle cx="12" cy="13.1" r="3.5" /> },
  },
  photo:{
    line:<><rect x="3.5" y="4.6" width="17" height="14.8" rx="2.1" /><path d="m3.8 16.6 4.6-4.6 4 4 2.6-2.6 5.2 5.2" /><circle cx="15.6" cy="9.4" r="1.5" /></>,
    lit:{ fill:<rect x="3.5" y="4.6" width="17" height="14.8" rx="2.1" />, cut:<><path d="m3.8 16.6 4.6-4.6 4 4 2.6-2.6 5.2 5.2" /><circle cx="15.6" cy="9.4" r="1.5" fill="#000" /></> },
  },
  tv:{
    line:<><rect x="3" y="7" width="18" height="12.4" rx="2.1" /><path d="m8.5 2.9 3.5 3.5 3.5-3.5" /></>,
    lit:{ fill:<><rect x="3" y="7" width="18" height="12.4" rx="2.1" /><path d="m8.5 2.9 3.5 3.5 3.5-3.5" fill="none" /></>, cut:null },
  },

  /* the weekend */
  trophy:{
    line:<><path d={CUP} /><path d="M7.5 6.5H5.4a2.6 2.6 0 0 0 2.6 4M16.5 6.5h2.1a2.6 2.6 0 0 1-2.6 4M12 13.8v3.2M8.6 20h6.8" /></>,
    lit:{ fill:<><path d={CUP} /><path d="M7.5 6.5H5.4a2.6 2.6 0 0 0 2.6 4M16.5 6.5h2.1a2.6 2.6 0 0 1-2.6 4M12 13.8v3.2M8.6 20h6.8" fill="none" /></>, cut:null },
  },
  pin:{
    line:<><path d={PIN} /><circle cx="12" cy="10.1" r="2.4" /></>,
    lit:{ fill:<path d={PIN} />, cut:<circle cx="12" cy="10.1" r="2.4" fill="#000" stroke="none" /> },
  },
  plane:{ line:<path d={PLANE} />, lit:{ fill:<path d={PLANE} />, cut:null } },
  /* the house: adobe, flat roof, its vigas and an arched door */
  house:{
    line:<><path d="M5 20V10.4a1.6 1.6 0 0 1 1.6-1.6h10.8a1.6 1.6 0 0 1 1.6 1.6V20" /><path d="M3.4 20h17.2M3.6 11.6H5M19 11.6h1.4" /><path d="M10 20v-3.8a2 2 0 0 1 4 0V20" /></>,
    lit:{ fill:<><path d="M5 20V10.4a1.6 1.6 0 0 1 1.6-1.6h10.8a1.6 1.6 0 0 1 1.6 1.6V20z" /><path d="M3.4 20h17.2M3.6 11.6H5M19 11.6h1.4" fill="none" /></>,
      cut:<path d="M10.1 19.2v-3a1.9 1.9 0 0 1 3.8 0v3z" fill="#000" stroke="none" /> },
  },
  rules:{
    line:<><path d={BOOK} /><path d="M12 6.6v13.6" /></>,
    lit:{ fill:<path d={BOOK} />, cut:<path d="M12 6.2v14.4" /> },
  },
  games:{
    line:<><rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" /><g fill="currentColor" stroke="none"><circle cx="8.7" cy="8.7" r="1.35" /><circle cx="12" cy="12" r="1.35" /><circle cx="15.3" cy="15.3" r="1.35" /></g></>,
    lit:{ fill:<rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" />,
      cut:<g fill="#000" stroke="none"><circle cx="8.7" cy="8.7" r="1.45" /><circle cx="12" cy="12" r="1.45" /><circle cx="15.3" cy="15.3" r="1.45" /></g> },
  },
  payouts:{
    line:<><path d={STACK_TOP} /><path d="M5 8.2v3.9c0 1.66 3.13 3 7 3s7-1.34 7-3V8.2M5 12.1V16c0 1.66 3.13 3 7 3s7-1.34 7-3v-3.9" /></>,
    lit:{ fill:<path d="M5 8.2c0-1.66 3.13-3 7-3s7 1.34 7 3V16c0 1.66-3.13 3-7 3s-7-1.34-7-3z" />,
      cut:<path d="M5 8.2c0 1.66 3.13 3 7 3s7-1.34 7-3M5 12.1c0 1.66 3.13 3 7 3s7-1.34 7-3" /> },
  },
  awards:{
    line:<><circle cx="12" cy="14.6" r="5" /><path d="M8.9 10.7 6.6 3.8h3.6l1.8 5M15.1 10.7l2.3-6.9h-3.6l-1.8 5" /></>,
    lit:{ fill:<><circle cx="12" cy="14.6" r="5" /><path d="M8.9 10.7 6.6 3.8h3.6l1.8 5M15.1 10.7l2.3-6.9h-3.6l-1.8 5" fill="none" /></>,
      cut:<circle cx="12" cy="14.6" r="2" fill="#000" stroke="none" /> },
  },

  /* the menus and the commissioner's controls */
  person:{
    line:<><circle cx="12" cy="8.4" r="3.9" /><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0" /></>,
    lit:{ fill:<><circle cx="12" cy="8.4" r="3.9" /><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0z" /></>, cut:null },
  },
  people:{ line:<><circle cx="9" cy="8.6" r="3.4" /><path d="M2.9 19.6a6.1 6.1 0 0 1 12.2 0" /><path d="M15.4 5.5a3.3 3.3 0 0 1 0 6.3M17.6 13.9a6.1 6.1 0 0 1 3.5 5.7" /></> },
  /* skip: a step past the line */
  skip:{ line:<><path d="m5.5 6 6.5 6-6.5 6" /><path d="m12 6 6.5 6-6.5 6" /><path d="M20.5 5.5v13" /></> },
  undo:{ line:<><path d="M8.6 5.4 4.4 9.6l4.2 4.2" /><path d="M4.6 9.6h9.6a5.4 5.4 0 0 1 0 10.8H9.6" /></> },
  /* the next suggestions (team names) */
  shuffle:{ line:<><path d="M3.8 7.4h3.4c2.2 0 3.6 1.2 4.8 3.4l1 1.9c1.2 2.2 2.6 3.4 4.8 3.4h2.4" /><path d="M3.8 16.6h3.4c1.5 0 2.6-.5 3.5-1.5" />
    <path d="M13.5 8.9c.9-1 2-1.5 3.5-1.5h2.4" /><path d="m17.6 4.9 2.6 2.5-2.6 2.5M17.6 14.1l2.6 2.5-2.6 2.5" /></> },
  /* write your own */
  pencil:{ line:<><path d="M15.6 4.8a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L9 18.6l-4.4 1 1-4.4z" /><path d="m13.8 6.6 3.6 3.6" /></> },
  /* the rehearsal flask */
  flask:{
    line:<><path d="M9.4 3.6h5.2M10.2 3.6v5.6L4.9 18.3a1.4 1.4 0 0 0 1.2 2.1h11.8a1.4 1.4 0 0 0 1.2-2.1l-5.3-9.1V3.6" /><path d="M7.2 14.4h9.6" /></>,
    lit:{ fill:<path d="M10.2 3.6h3.6v5.6l5.3 9.1a1.4 1.4 0 0 1-1.2 2.1H6.1a1.4 1.4 0 0 1-1.2-2.1l5.3-9.1z" />, cut:<path d="M7.2 14.4h9.6" /> },
  },
  exit:{ line:<><path d="M13.4 4.4H6.6a1.6 1.6 0 0 0-1.6 1.6v12a1.6 1.6 0 0 0 1.6 1.6h6.8" /><path d="M10.4 12h10M16.6 8.2l3.8 3.8-3.8 3.8" /></> },
  lock:{
    line:<><rect x="5" y="10.4" width="14" height="10" rx="2" /><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" /></>,
    lit:{ fill:<><rect x="5" y="10.4" width="14" height="10" rx="2" /><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" fill="none" /></>, cut:null },
  },
};
/* names kept from the first set */
ICONS.list = ICONS.events;

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/* optical sizing: the drawn stroke lands near 1.5px from 14 to 24px and
   lightens on big glyphs */
function opticalStroke(size) {
  const px = typeof size === "number" ? size : 18;
  return px <= 14 ? 2.1 : px <= 18 ? 1.95 : px <= 26 ? 1.8 : px <= 36 ? 1.65 : 1.5;
}

export function Icon({ name, size = 16, className = "", strokeWidth, lit = false }) {
  const def = ICONS[name];
  const mask = `fd-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!def) return null;
  const on = lit && def.lit;
  return <svg className={`fd-icon${on ? " is-lit" : ""}${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? opticalStroke(size)} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    {!on ? def.line : def.lit.cut ? <>
      <defs><mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" stroke="none" />
        <g stroke="#000" fill="none">{def.lit.cut}</g>
      </mask></defs>
      <g mask={`url(#${mask})`} fill="currentColor">{def.lit.fill}</g>
    </> : <g fill="currentColor">{def.lit.fill}</g>}
  </svg>;
}

/* A bracket path reads "Play-in ✓ → Semifinal vs Khoa". The words stay as
   the model writes them (the accessible name keeps them); the ✓ and → are
   drawn. */
export function PathText({ text }) {
  const steps = String(text || "").split(" → ");
  return <>{steps.map((step, index) => <React.Fragment key={index}>
    {index > 0 && <Icon name="then" size={14} className="fd-icon-then" />}
    {step.endsWith(" ✓") ? <>{step.slice(0, -2)}<Icon name="check" size={14} className="fd-icon-done" /></> : step}
  </React.Fragment>)}</>;
}
