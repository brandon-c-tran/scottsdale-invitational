/* The game intro's one timeline (Oct 3 redo). Every phone and the TV play
   the same intro from the same server instant, the announcing write's
   eventOps[ev].announcedAt, so the room's backglass lights, the game plays
   its one move and the name lands together, and a screen that opens late
   joins mid-sequence. The draw reveal hands over at INTRO_MS on every
   screen (drawReveal.js DRAW_INTRO_MS and tvModel.js TV_INTRO_OVERLAY_MS
   are this number), and the room's intro sound (S2) is composed on these
   same beats. Pure: no imports, no DOM. */

/* ms from the announcement */
export const INTRO_TIMING = Object.freeze({
  flicker:0, flickerMs:560,   // lean-in: the glass is dark, the backlight warms up and catches
  dolly:120, dollyMs:1500,    // the painting's plates and the game's set push in, near plates most
  play:700,                   // the game's move starts (the wind-up, the toss, the break)
  hit:1800,                   // the hero beat lands: the drop, the swish, the stack
  nameMs:380,                 // the game's name stamps on the hit
  sweep:2200, sweepMs:800,    // light crosses the glass and the lettering
  ladder:2500, ladderMs:420,  // what it pays rises (TV)
  recede:3750, recedeMs:450,  // a draw behind it: the set dims, the name docks where the draw letters it
  total:4200,
});
export const INTRO_MS = INTRO_TIMING.total;
/* reduced motion: the finished frame, held briefly before the draw */
export const INTRO_REDUCED_MS = 650;

/* The scene a game introduces itself with. Basketball's two events are
   two different games on the court, so the variant picks; anything without
   its own scene (a commissioner-added event, a game borrowed from the
   library) plays the shared one around its GameMark. */
export const INTRO_SCENES = Object.freeze(["putting", "die", "where", "basketball:5v5", "pickleball",
  "basketball:1v1", "volleyball", "trivia", "8ball", "pong", "ragecage", "beerio", "poker"]);
export const FALLBACK_SCENE = "mark";
export function introScene(ev) {
  const game = ev?.game || null;
  if (!game) return FALLBACK_SCENE;
  if (game === "basketball") return ev?.variant === "1v1" ? "basketball:1v1" : "basketball:5v5";
  return INTRO_SCENES.includes(game) ? game : FALLBACK_SCENE;
}

/* how far into the intro a screen is, the total once it is over (a load,
   a late screen, reduced motion all show the end). A screen whose clock
   reads a little before the stamp waits for it (negative, at most
   INTRO_LEAD_MS), so it still lands the hit with the room. */
export const INTRO_LEAD_MS = 1000;
export function introElapsed(anchor, now, { reduced = false } = {}) {
  const a = Number(anchor), n = Number(now);
  if (reduced || !Number.isFinite(a) || a <= 0 || !Number.isFinite(n)) return reduced ? INTRO_MS : 0;
  return Math.max(-INTRO_LEAD_MS, Math.min(INTRO_MS, n - a));
}
