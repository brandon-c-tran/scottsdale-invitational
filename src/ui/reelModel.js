/* The score reel's arithmetic, pure so the rule is testable (ScoreReel.jsx
   draws it). One reel everywhere: the same window, the same roll.

   A reel is a strip of faces 0-9 repeated behind each window. A LIVE reel
   (a number that changes while it is on screen) turns each changed window
   the short way, forward on a count up and back on a loss. A LANDING reel
   (a number that arrives with its moment: a podium's award, a mover's new
   count, your draw) rolls each window like an odometer from `from` to the
   value: a window turns as many faces as its place really passed, so the
   low windows spin and the high ones click over, capped at two whole turns.
   The windows land left to right, each a beat after the one before, the
   longer rolls taking longer. Nothing here knows about frames: callers
   decide whether a change is fresh (motion.js) and pass the answer down. */
export const REEL = Object.freeze({
  faces:30,          // a live strip: three runs of 0-9
  band:10,           // where a live strip rests (the middle run)
  landMs:520,        // a landing window's roll
  perFaceMs:24,      // each face it passes adds momentum
  maxLandMs:1250,
  staggerMs:80,      // each window lands this long after the one to its left
  maxTurns:2,        // a landing window never spins more than two whole turns
  overshoot:0.14,    // faces past the detent before it settles
  freshMs:2600,      // a fresh frame lets a reel roll for this long (a count runs inside it)
});

/* the digits a value shows, without separators: 12,300 -> "12300" */
export const reelDigits = value => String(Math.abs(Math.round(Number(value) || 0)));

/* How each window of `to` lands when it rolls from `from`: one entry per
   digit, left to right, as strip indexes ({ start, end }) plus its roll
   (ms) and when it starts (delay, ms from the landing's start). A window
   that does not move has start === end and ms 0. */
export function reelLanding(from, to) {
  const a = Math.abs(Math.round(Number(from) || 0)), b = Math.abs(Math.round(Number(to) || 0));
  const digits = reelDigits(b);
  const down = b < a;
  return [...digits].map((ch, i) => {
    const place = 10 ** (digits.length - 1 - i);
    const passed = Math.abs(Math.floor(b / place) - Math.floor(a / place));
    const faces = passed % 10 + 10 * Math.min(REEL.maxTurns, Math.floor(passed / 10));
    const f = Math.floor(a / place) % 10;
    /* forward from the first run, backward from the last: never below 0 */
    const start = down ? 10 * (REEL.maxTurns + 1) + f : f;
    const end = down ? start - faces : start + faces;
    const ms = faces ? Math.min(REEL.maxLandMs, REEL.landMs + faces * REEL.perFaceMs) : 0;
    return { digit:Number(ch), start, end, faces, ms, delay:i * REEL.staggerMs };
  });
}
/* how long a landing takes, first window turning to last window landed */
export const reelLandingMs = cells => Math.max(0, ...cells.map(cell => cell.ms ? cell.delay + cell.ms : 0));
/* the strip a landing window needs: every face it passes plus one past
   the detent for the settle, never shorter than a live strip */
export const reelStripFaces = cells => Math.max(REEL.faces, ...cells.map(cell => Math.max(cell.start, cell.end) + 2));

/* A live window's next index: the short way from `prev` to `digit`
   (forward for a count up, back for a loss) from where it stands. A strip
   that would run off its end first snaps to the same digit on its middle
   run, so it can turn forever on a fixed strip. */
export function reelStep(index, prev, digit, direction, faces = REEL.faces) {
  const a = Number(prev) || 0, b = Number(digit) || 0;
  const steps = a === b ? 0 : direction < 0 ? -((a - b + 10) % 10) : (b - a + 10) % 10;
  let from = index;
  if (from + steps < 1 || from + steps > faces - 2) from = REEL.band + a;
  return { from, to:from + steps, steps, snapped:from !== index };
}

/* Whether a reel rolls this render. "fresh" (the default) rolls only inside
   the window a fresh frame opens (`animate`: useFreshChange's fresh change
   with motion allowed), so a load, reconnect, catch-up or correction is
   placed, not rolled; "always" is for a caller that already decided its
   moment is fresh; "never" always places. Reduced motion never rolls. */
export function reelMotion({ motion = "fresh", reduced = false, animate = false, now = 0, liveUntil = 0 } = {}) {
  const until = animate ? now + REEL.freshMs : liveUntil;
  const live = !reduced && (motion === "always" || (motion === "fresh" && now < until));
  return { live, liveUntil:until };
}
