import React from "react";
import { CAST, lineLayout } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import "./teamphoto.css";

/* teamphoto (team, win): a STUB standing the cast in line until its
   scene is drawn. */
const MID = 960;
const VERSUS = false;
function staging(cast) {
  const a = lineLayout(cast?.a?.length || 0), b = lineLayout(cast?.b?.length || 0);
  const ax = VERSUS ? MID - b.half - 60 : MID, bx = MID + a.half + 60;
  const minX = Math.round(ax - a.half), maxX = Math.round(VERSUS ? bx + b.half : ax + a.half);
  return { a, b, ax, bx, minX, maxX, mid:Math.round((minX + maxX) / 2) };
}

export function Teamphoto({ cast }) {
  const s = staging(cast);
  const line = (players, layout, x, facing) => players.slice(0, layout.shown).map((player, i) => (
    <CastChip key={player} player={player} size={layout.size} x={x + layout.xs[i]} y={CAST.floor} facing={facing} />));
  return (
    <div className="teamphoto">
      {line(cast?.a || [], s.a, s.ax, VERSUS ? 1 : 0)}
      {VERSUS && line(cast?.b || [], s.b, s.bx, -1)}
    </div>
  );
}

Teamphoto.anchors = cast => {
  const s = staging(cast);
  return { mid:s.mid, minX:s.minX, maxX:s.maxX, };
};
