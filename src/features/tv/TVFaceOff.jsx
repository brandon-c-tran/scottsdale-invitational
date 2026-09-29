import React from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { TVWinLine, useContestWinLines } from "./TVCards.jsx";
import { FACEOFF_TIMING as F, faceOffChipSize } from "./faceOff.js";

/* a display size that keeps a side's name on one line in its half, so both
   halves stand at the same height */
export const faceOffNameSize = text =>
  Math.max(48, Math.min(96, Math.floor(600 / (Math.max(4, String(text || "").length) * 0.5))));

function FaceOffSide({ side, from, lines }) {
  const size = faceOffChipSize(side.players.length);
  return (
    <div className={`tv-faceoff-side is-${from}`}>
      <div className={`tv-faceoff-chips${side.players.length > 4 ? " is-wrap" : ""}`}>
        {side.players.map(p => <ChipFace key={p} p={p} size={size} flat />)}
      </div>
      <div className="tv-display tv-faceoff-name" style={{ fontSize:faceOffNameSize(side.name) }}>{side.name}</div>
      <div className="tv-faceoff-line"><TVWinLine lines={lines} sideKey={side.key} /></div>
    </div>
  );
}

/* D2: both sides, face to face, over the live pane until it settles into
   the betting board underneath. Every delay is "this long after the
   face-off's start" (--tl, as the crown and the bracket advance use it). */
export function FaceOff({ state, events, ev, contest, view, moment }) {
  const lines = useContestWinLines(state, ev, contest, events);
  return (
    <div className="tv-faceoff" role="status" style={{ "--tl":`${-Math.round(moment.elapsed)}ms`,
      "--faceoff-settle":`${F.settle}ms` }}>
      <div className="tv-faceoff-head">
        <span className="tv-label">{view.event}</span>
        {view.label && <span className="tv-display tv-faceoff-round">{view.label}</span>}
      </div>
      <div className="tv-faceoff-sides">
        <FaceOffSide side={view.sides[0]} from="left" lines={lines} />
        <div className="tv-faceoff-vs">VS</div>
        <FaceOffSide side={view.sides[1]} from="right" lines={lines} />
      </div>
      <div className="tv-display tv-faceoff-record">{view.record || ""}</div>
    </div>
  );
}
