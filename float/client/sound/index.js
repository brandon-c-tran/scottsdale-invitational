/* Float's sound (float/PROTOCOL.md "Sound"). Everything sounds through
   Field Day's engine (src/lib/sound.js playSound / cueAt, the only module
   that touches Web Audio), from the recipes in Float's block at the end of
   the engine's kit: the room bus on the screen, the you bus on the phone.

     useFloatScreenSound(net)              the river, the band, every moment
     useFloatControllerSound(net, { me })  your own strokes, flip, finish,
                                           drink, "through", balloons;
                                           returns the taps below
     floatStrokeSound(side, power),        the controller's own taps: call
     floatDrinkSound(), floatThrowSound()  them inside its touch handlers
     unlockFloatSound()                    inside a tap, so iOS lets sound start
     useFloatSoundUnlockNeeded()           the screen still needs a click
     PODIUM_BEATS, COUNT_BEATS             the moments' beats, so the
                                           screen's reveal lands on them

   screen.js and controller.js say what plays when; music.js and river.js
   are the beds; cup.js reads the room. */
import { unlockSound, useSoundUnlockNeeded } from "../../../src/lib/sound.js";

export { useFloatScreenSound, createFloatScreenSound, screenStep, PODIUM_BEATS, COUNT_BEATS } from "./screen.js";
export { useFloatControllerSound, createFloatControllerSound, controllerStep, floatStrokeSound, floatDrinkSound,
  floatThrowSound, FLOAT_TAPS } from "./controller.js";

/* Call inside a tap, so iOS lets sound start. */
export function unlockFloatSound() {
  try { return unlockSound(); } catch { return false; }
}

/* The screen still needs a click before it can sound (its context waits
   for a gesture, and Sound is on). */
export function useFloatSoundUnlockNeeded() {
  return useSoundUnlockNeeded();
}
