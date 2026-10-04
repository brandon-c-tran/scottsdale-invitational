import React from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { LampChase } from "../../ui/ScoreReel.jsx";
import { TVWinLine, useContestWinLines } from "./TVCards.jsx";
import { FACEOFF_TIMING as F, faceOffChipSize } from "./faceOff.js";
import { Takeover } from "./TVTakeover.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { SideTerms } from "../comebacks/Comebacks.jsx";
import { contestTerms } from "../comebacks/comebacks.js";

/* a display size that keeps a side's name on one line in its half, so both
   halves stand at the same height: Big Shoulders 900 runs about 0.5em a letter */
export const faceOffNameSize = text =>
  Math.max(48, Math.min(120, Math.floor(740 / (Math.max(4, String(text || "").length) * 0.5))));

function FaceOffSide({ side, from, lines, terms = null }) {
  const size = faceOffChipSize(side.players.length);
  return (
    <div className={`tv-faceoff-side is-${from}`}>
      <div className={`tv-faceoff-chips${side.players.length > 4 ? " is-wrap" : ""}`}>
        {side.players.map(p => <ChipFace key={p} p={p} size={size} flat />)}
      </div>
      <div className="fd-show tv-faceoff-name" style={{ fontSize:faceOffNameSize(side.name) }}>{side.name}</div>
      <div className="tv-faceoff-line"><TVWinLine lines={lines} sideKey={side.key} /></div>
      {terms && <SideTerms tv terms={terms} className="tv-faceoff-terms" />}
    </div>
  );
}

/* D2, the broadcast sting (Backglass takeover grammar): the chrome leaves
   and the glass dims, both sides slam in from their own edges, VS hits and
   holds inside a lamp chase, their record types in a letter at a time, then
   the whole thing lifts off the betting board underneath. Every delay is
   "this long after the face-off's start" (--tl), on the server clock. */
export function FaceOff({ state, events, ev, contest, view, moment }) {
  const lines = useContestWinLines(state, ev, contest, events);
  const record = view.record || "";
  const terms = contestTerms(state, contest);
  const termsOf = side => terms?.any ? terms.sides[side.key] || null : null;
  return (
    <Takeover kind="faceoff" className="tv-faceoff" label={`${view.event}${view.label ? `, ${view.label}` : ""}: ${
      view.sides.map(side => side.name).join(" vs ")}`}
      style={{ "--tl":`${-Math.round(moment.elapsed)}ms`, "--faceoff-settle":`${F.settle}ms` }}>
      <div className="tv-faceoff-glass" aria-hidden="true" />
      <LampChase tone="live" className="tv-faceoff-chase" />
      <div className="tv-faceoff-head">
        <span className="fd-show tv-faceoff-round"><EventName name={view.label || view.event} /></span>
        {view.label && <span className="tv-faceoff-event">{view.event}</span>}
      </div>
      <div className="tv-faceoff-sides">
        <FaceOffSide side={view.sides[0]} from="left" lines={lines} terms={termsOf(view.sides[0])} />
        <div className="fd-show tv-faceoff-vs">VS</div>
        <FaceOffSide side={view.sides[1]} from="right" lines={lines} terms={termsOf(view.sides[1])} />
      </div>
      <div className="tv-display tv-faceoff-record" aria-label={record || undefined}>
        {[...record].map((ch, i) => <span key={i} aria-hidden="true"
          style={{ animationDelay:`calc(var(--tl) + ${F.h2h + i * F.typeMs}ms)` }}>{ch}</span>)}
      </div>
    </Takeover>
  );
}
