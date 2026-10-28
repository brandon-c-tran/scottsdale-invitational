/* Float's sound (float/GROOVE.md "Sound (the Groove)"). Everything sounds
   through Field Day's engine (src/lib/sound.js playSound / cueAt, the only
   module that touches Web Audio), from the recipes in Float's block at the
   end of the engine's kit: the room bus on the TV, the you bus on the
   phone. The phone never plays music.

     useFloatScreenSound(net)              the TV: the song bar by bar from
                                           room.songAt (the band, the host's
                                           calls, the answers), the stings,
                                           the flubs, the lobby's loop
     useFloatControllerSound(net, { me })  the phone: Through and Out at the
                                           cut, your place, Done's echo;
                                           returns the taps below
     floatTapSound(q, kind)                the controller's own taps: call
     floatDoneSound(), floatCheerSound()   them inside its touch handler (q a
                                           quality from chart.js, or null for
                                           a tap that matched no cue)
     unlockFloatSound()                    inside a tap, so iOS lets sound start
     useFloatSoundUnlockNeeded()           the TV still needs a click
     PODIUM_BEATS, CUT_BEATS, TITLE_BEATS  the moments' beats (ms from the
                                           phase's start, or from songAt),
                                           so the screen reveals on them

   groove.js plans a song from its chart; grooveScreen.js and
   groovePhone.js run the TV and the phone; voices.js names the host's
   clips. The 3D race's sound (screen.js, controller.js, music.js,
   river.js, cup.js) is parked here with the 3D river (float/proto) and
   is not imported. */
import { unlockSound, useSoundUnlockNeeded } from "../../../src/lib/sound.js";

export { useFloatScreenSound, createGrooveScreenSound as createFloatScreenSound, screenStep, grooveView, loadGrooveVoice } from "./grooveScreen.js";
export { useFloatControllerSound, createGroovePhoneSound as createFloatControllerSound, phoneStep as controllerStep,
  floatTapSound, floatDoneSound, floatCheerSound, floatStrokeSound, floatDrinkSound, floatThrowSound, GROOVE_TAPS as FLOAT_TAPS } from "./groovePhone.js";
export { PODIUM_BEATS, CUT_BEATS, TITLE_BEATS, GROOVE_PRE_MS, chartFor, songEvents, songSlots } from "./groove.js";

/* the race's count-in and gun (parked), for the screens not yet on the Groove */
export const COUNT_BEATS = Object.freeze([3000, 2000, 1000]);
export const COUNT_TICKS = Object.freeze([2500, 1500, 500]);
export const predictedGun = view => view?.phase === "grid" && Number.isFinite(view.endsAt) ? view.endsAt + 3000 : null;

/* Call inside a tap, so iOS lets sound start. */
export function unlockFloatSound() {
  try { return unlockSound(); } catch { return false; }
}

/* The TV still needs a click before it can sound (its context waits for a
   gesture, and Sound is on). */
export function useFloatSoundUnlockNeeded() {
  return useSoundUnlockNeeded();
}
