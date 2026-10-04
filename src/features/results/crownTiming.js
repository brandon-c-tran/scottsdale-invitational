/* D1: the whole room floods on the crown. Every phone plays its champion
   moment on the TV's own server instant (CROWN_TIMING), so thirteen phones
   and the TV turn the champion's color on the same beat, hold it, and then
   each phone turns to its own last card. Pure: the anchor comes from state
   and the plan from the server clock the caller passes in.

   The produced crown (Backglass, Oct 2) runs about a minute. A phone opens
   on its own player's chip and final stack, stamps its place the instant
   the TV's tower for it goes dark, then the champion's face rises with the
   TV's tower, the flood lands on every phone together, and each phone
   sounds its note of the room's chord (chordNote by final position). */

import { CROWN_TIMING as C, crownOutAt } from "../tv/tvMotion.js";

/* the phone holds the champion this long after the TV's crown has landed,
   then its own card turns over */
export const CROWN_CARD_HOLD_MS = 1400;
export const PHONE_CROWN = Object.freeze({
  night:C.night, title:C.title,          // the glass dims; "Final" lights
  you:C.towers, youMs:C.towersMs,        // your own chip and final stack stand up
  rise:C.rise, riseMs:C.riseMs,          // the champion's face rises with their tower
  flood:C.flood, floodMs:C.floodMs,      // the room goes one color; your note sounds
  chip:C.chip, chipMs:C.chipMs,          // their chip drops and turns twice
  tag:C.tag, name:C.name, nameStagger:C.nameStagger,
  stats:C.stats, count:C.count, countMs:C.countMs,
  turn:C.total + CROWN_CARD_HOLD_MS,     // this phone's own last card
});

/* When this phone's place stamps: the instant the TV's tower for the same
   final position goes dark (null for the champion, who rises instead). */
export function phonePlaceAt(index, count) {
  return index > 0 ? crownOutAt(index, count) : null;
}

/* a champion scene counts as the crown's own when the crowning write
   started it (the same write, so the same few ms) */
const SAME_WRITE_MS = 5000;

/* The instant the TV plays the crown from: the champion scene's start when
   the crowning write started one (Show Control on), else the crowning
   write's own time. Read from the frame that crowned. */
export function crownAnchor(state) {
  const updated = Number(state?.updatedAt) || 0;
  const active = state?.showControl?.active;
  const started = active?.kind === "champion" && state?.frozen ? Number(active.startedAt) || 0 : 0;
  if (started > 0 && (!updated || Math.abs(updated - started) <= SAME_WRITE_MS)) return started;
  return updated > 0 ? updated : null;
}

/* What this phone opens. A crown it did not see happen (reload, reconnect,
   catch-up), reduced motion, or a frame that reached it after the flood has
   already gone out opens straight to its card. Otherwise it joins the
   room's timeline wherever it stands. A tie floods nobody. */
export function crownPhonePlan({ anchor = null, now, fresh = false, reduced = false, tied = false } = {}) {
  const card = reason => ({ mode:"card", elapsed:PHONE_CROWN.turn, turnIn:0, flood:false, reason });
  if (!fresh) return card("missed");
  if (reduced) return card("reduced");
  const a = Number(anchor);
  const elapsed = Number.isFinite(a) && a > 0 ? Math.max(0, Number(now) - a) : 0;
  if (elapsed >= PHONE_CROWN.flood + PHONE_CROWN.floodMs) return card("late");
  return { mode:"moment", elapsed, turnIn:Math.max(0, PHONE_CROWN.turn - elapsed), flood:!tied, reason:"live" };
}
