/* Where and When on your own phone (the you bus): your own taps and your
   own score, nothing of anyone else's. Your pin going in (a tap on the
   map, a drag let go, a place searched), Lock in stamping as the server
   takes it, and your score landing on the reveal, once its two reels have
   rolled in. A score is never a loss sound: a low one lands silent. The
   reveal sounds only when it reached this phone on a fresh frame; a
   reopen from Home, a load or a catch-up shows it quietly. The clock's
   last seconds stay silent on a phone (the TV ticks for the room, as in
   Trivia). */
import { useEffect, useRef } from "react";
import { freshFrameNow, playSound } from "../../lib/sound.js";
import { reelLanding, reelLandingMs } from "../../ui/reelModel.js";

/* YourReveal's two ScoreReels start landing here (ms from the reveal) */
export const GEO_SCORE_REELS = Object.freeze({ where:1700, when:1900 });
/* the chime waits a beat past the last reel's landing */
export const GEO_SCORE_AFTER_MS = 80;

/* how bright your score lands: none under 1,500 (of 10,000), one note, two, then the motif from 8,000 */
export function geoScoreTier(total) {
  const n = Number(total) || 0;
  if (n < 1500) return 0;
  return n >= 8000 ? 3 : n >= 5000 ? 2 : 1;
}
/* when your score's chime lands, ms from the reveal; null when it is silent */
export function geoScoreCue(score, { reduced = false } = {}) {
  const tier = geoScoreTier(score?.total);
  if (!tier) return null;
  if (reduced) return { tier, delayMs:0 };
  const landed = (from, value) => from + reelLandingMs(reelLanding(0, Math.max(0, Number(value) || 0)));
  return { tier, delayMs:Math.max(landed(GEO_SCORE_REELS.where, score.where), landed(GEO_SCORE_REELS.when, score.when)) + GEO_SCORE_AFTER_MS };
}

/* your pin goes in */
export const geoPinSound = () => playSound("geoPin", { bus:"you" });
/* Lock in, as the server takes it (or not) */
export function geoLockSound(result) {
  if (result?.ok === true) playSound("stamp", { bus:"you" });
  else if (result && !result.uncertain) playSound("S26", { bus:"you" });
}

/* your score's chime, once a round, only for a reveal that arrived fresh */
export function useGeoScoreSound(roundId, score, { reduced = false } = {}) {
  const fresh = useRef(null);
  if (fresh.current === null) fresh.current = freshFrameNow();
  useEffect(() => {
    if (!fresh.current || !roundId) return undefined;
    const cue = geoScoreCue(score, { reduced });
    if (!cue) return undefined;
    const handle = playSound("geoScore", { bus:"you", delayMs:cue.delayMs, opts:{ tier:cue.tier } });
    return () => handle?.cancel?.();
  }, [roundId]); // eslint-disable-line react-hooks/exhaustive-deps
}
