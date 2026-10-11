import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { BitLayer } from "../gags/BitStage.jsx";
import { Takeover } from "./TVTakeover.jsx";
import { bitCues, playBitCues } from "./bitSound.js";
import { attractHeard } from "./attractModel.js";
import "./tv-attract.css";

/* Attract mode (attractModel.js): one idle vignette over the TV's painting
   on its ambient turn, played once from the turn's start on the server
   clock. TVMode mounts this a moment ahead of the start; the layer comes
   up on the start's own instant and lifts at the vignette's end, and the
   chrome steps out only while it is up (data-moment "attract"). `fixed`
   (a rehearsal's held clock) draws the instant `now` stands at.

   Sound: the vignette's own foley on the room bus, ducked under a win song
   like any room sound (never open past it), only on a TV that saw the
   vignette start; a TV that joins late or reloads mid-vignette is silent.
   Reduced motion holds the punchline frame and plays its one summary. */

const stageAt = (attract, t) => t < attract.start ? "wait" : t < attract.end ? "on" : "done";

/* where this TV is on the vignette, moved by timers on the server clock
   (the TV's own tick is a second wide) */
function useStage(attract, fixed, now) {
  const [stage, setStage] = useState(() => stageAt(attract, fixed ? now : serverNow()));
  useEffect(() => {
    if (fixed) return undefined;
    let timer = null;
    const step = () => {
      const t = serverNow();
      const next = stageAt(attract, t);
      setStage(next);
      if (next !== "done") timer = setTimeout(step, Math.max(0, (next === "wait" ? attract.start : attract.end) - t) + 4);
    };
    step();
    return () => clearTimeout(timer);
  }, [attract.key, fixed]); // eslint-disable-line react-hooks/exhaustive-deps
  return fixed ? stageAt(attract, now) : stage;
}

export function TVAttract({ state, attract, phase = "fri", now = 0, fixed = false }) {
  const reduced = useReducedMotion();
  const stage = useStage(attract, fixed, now);
  /* how late this TV first drew it, fixed for the vignette */
  const joined = useRef(null);
  if (stage === "on" && joined.current === null) joined.current = fixed ? Number(now) - attract.start : serverNow() - attract.start;
  const heard = !fixed && stage === "on" && attractHeard(joined.current);
  useEffect(() => {
    if (!heard) return undefined;
    const handles = playBitCues(bitCues(attract.bit, { start:attract.start, reduced, key:attract.key })
      .map(cue => ({ ...cue, open:false })));
    return () => handles.forEach(handle => handle?.cancel?.());
  }, [heard, attract.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (stage !== "on") return null;
  const clock = fixed ? { at:Math.max(0, Number(now) - attract.start), frozen:true } : { start:attract.start };
  return (
    <Takeover kind="attract" className="tv-attract">
      <BitLayer bit={attract.bit} cast={attract.cast} state={state} phase={phase} runKey={attract.key} {...clock} />
    </Takeover>
  );
}
