import React from "react";
import { GameMark } from "../../ui/GameMark.jsx";
import { FloatBoundary } from "./FloatBoundary.jsx";
import "./float.css";

/* The river on the TV (float/PROTOCOL.md "Components"): the room's own
   screen, FloatScreen, the whole canvas while the Cup races. TVMode hands
   it the part once its chunk is in (floatParts.js useFloatPart); until then
   the glass holds the game's mark. A part that fails is out for the
   session and TVMode goes back to its own live board. */
export function TVFloat({ state, Part = null }) {
  const cup = state?.float;
  if (!cup?.room) return null;
  return (
    <div className="tv-float" data-tv-float={cup.cupId}>
      {Part ? <FloatBoundary name="screen" fallback={<FloatWaiting />}>
        <Part room={cup.room} />
      </FloatBoundary> : <FloatWaiting />}
    </div>
  );
}

function FloatWaiting() {
  return <div className="tv-float-wait" aria-label="Float">
    <GameMark id="float" size={200} hero />
  </div>;
}
