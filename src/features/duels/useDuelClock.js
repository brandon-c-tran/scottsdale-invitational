import { useEffect, useState } from "react";
import { duelPhase } from "../../../shared/core.js";

/* Offers lapse by derivation, not by a server write, so a surface showing
   one re-reads the clock every 15 seconds while any offer is waiting. */
export function useDuelClock(state) {
  const [, setTick] = useState(0);
  const waiting = (state?.duels || []).some(duel => duelPhase(duel) === "offered");
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => setTick(tick => tick + 1), 15000);
    return () => clearInterval(id);
  }, [waiting]);
  return Date.now();
}
