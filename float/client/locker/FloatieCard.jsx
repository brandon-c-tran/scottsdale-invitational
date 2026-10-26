/* One floatie as a card (float/shared/floaties.js): its name, its twist,
   and its four stats as bars of five, so two cards compare at a glance.
   Used by the Locker and the cut's swap picker. */
import React from "react";
import { STATS } from "../../shared/floaties.js";
import "./locker.css";

export function StatBars({ floatie, compact = false }) {
  return <dl className={`fll-stats${compact ? " is-compact" : ""}`}>
    {STATS.map(stat => <div key={stat.id} className="fll-stat">
      <dt>{stat.name}</dt>
      <dd aria-label={`${stat.name} ${floatie[stat.id]} of 5`}>
        {[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= floatie[stat.id] ? "is-on" : ""} />)}
      </dd>
    </div>)}
  </dl>;
}

export function FloatieGlyph({ id }) {
  /* a tiny top-down ring per floatie: the art module draws the real ones */
  const shapes = {
    classic:<circle cx="24" cy="24" r="15" />, donut:<circle cx="24" cy="24" r="15" />,
    unicorn:<path d="M24 8c9 0 16 7 16 16s-7 16-16 16S8 33 8 24 15 8 24 8zm6-4 4-3-1 6z" />,
    flamingo:<path d="M24 9c8 0 15 6 15 15s-7 15-15 15S9 32 9 24c0-6 3-11 8-13l-2-6 5 4z" />,
    shark:<path d="M24 9c8 0 15 7 15 15s-7 15-15 15S9 32 9 24 16 9 24 9zm-3-2 6-6 2 8z" />,
    pizza:<path d="M24 6 42 38H6z" />, lounge:<rect x="11" y="6" width="26" height="36" rx="9" />,
    cooler:<rect x="9" y="11" width="30" height="26" rx="5" />,
  };
  return <svg className={`fll-glyph is-${id}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <g className="fll-glyph-ring">{shapes[id] || shapes.classic}</g>
    {id !== "pizza" && id !== "lounge" && id !== "cooler" && <circle className="fll-glyph-hole" cx="24" cy="24" r="6.5" />}
  </svg>;
}

export default function FloatieCard({ floatie, selected = false, compact = false }) {
  return <span className={`fll-floatie${selected ? " is-selected" : ""}${compact ? " is-compact" : ""}`}>
    <span className="fll-floatie-head">
      <FloatieGlyph id={floatie.id} />
      <span className="fll-floatie-name">{floatie.name}</span>
    </span>
    <StatBars floatie={floatie} compact={compact} />
    <span className="fll-floatie-twist">{floatie.twist}</span>
  </span>;
}
