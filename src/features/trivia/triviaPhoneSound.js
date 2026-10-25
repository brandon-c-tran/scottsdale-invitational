/* Trivia on your own phone (the you bus): your own taps (TriviaPlay: S18
   as you choose, the stamp as Lock in is taken, S26 when it is refused)
   and your points landing on the reveal, once their count has run. Points
   are never a loss sound: a wrong answer, or none, lands silent. The
   reveal sounds only when it reached this phone on a fresh frame while
   the game was up; a reopen from Home, a load or a catch-up shows it
   quietly. The clock's last seconds stay silent on a phone (the TV ticks
   for the room). */
import { useEffect } from "react";
import { freshFrameNow, playSound } from "../../lib/sound.js";

/* your points count up from here (ms from the reveal) for this long (Points, useCountTo) */
export const TRIVIA_COUNT = Object.freeze({ delay:700, ms:900 });

/* how bright your points land: none for 0, one note under 700, two, then the motif from 900
   (a right answer is 500 plus up to 500 for speed; a closest number 500, 1,000, or 1,250 exact) */
export function triviaScoreTier(points) {
  const n = Number(points) || 0;
  if (n <= 0) return 0;
  return n >= 900 ? 3 : n >= 700 ? 2 : 1;
}
/* when your points' chime lands, ms from the reveal (as the count stops); null when silent */
export function triviaScoreCue(points, { reduced = false } = {}) {
  const tier = triviaScoreTier(points);
  if (!tier) return null;
  return { tier, delayMs:reduced ? 0 : TRIVIA_COUNT.delay + TRIVIA_COUNT.ms };
}

/* your points' chime, once a reveal, only for one that arrived fresh with the game up */
export function useTriviaScoreSound(questionId, points, { fresh = false, reduced = false } = {}) {
  useEffect(() => {
    if (!fresh || !questionId || !freshFrameNow()) return undefined;
    const cue = triviaScoreCue(points, { reduced });
    if (!cue) return undefined;
    const handle = playSound("triviaScore", { bus:"you", delayMs:cue.delayMs, opts:{ tier:cue.tier } });
    return () => handle?.cancel?.();
  }, [questionId]); // eslint-disable-line react-hooks/exhaustive-deps
}
