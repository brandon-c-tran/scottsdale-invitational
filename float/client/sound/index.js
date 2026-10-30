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
     floatMissSound(), floatStreakBreakSound(n), floatStreakSound(n)
                                           v4: your miss, your streak broken,
                                           its milestones (streakStep(streak, q)
                                           the rule; STREAK_MILESTONES)
     floatTapSound(q, kind)                the controller's own taps: call
     floatDoneSound(), floatCheerSound()   them inside its touch handler (q a
                                           quality from chart.js, or null for
                                           a tap that matched no cue)
     unlockFloatSound()                    inside a tap, so iOS lets sound start
     useFloatSoundUnlockNeeded()           the TV still needs a click
     the beats the picture lands on:
       TITLE_BEATS        ms from songAt: the round card, its sting, the title
       CUT_BEATS          the cut's show when the room sends no room.show (the
                          sound lands on room.show's own beats when it does);
                          cutBeats(n, awards) spells them out
       CHUGOFF_BEATS      the chug-off's call and count (ms from its start and
                          goAt); chugoffPlan(intro, { first }) what plays
       LAST_CALL_BEATS    ms from songAt: the bell, "Last call!", the first
                          one's rule; lastCallBeats(chart) every moment (the
                          numbers on their steps, the trick at hideAt, the
                          bell at revealAt, the verdict at verdictAt)
       PODIUM_BEATS       ms from the podium's startAt
       narration(chart)   where the host says each line (beats it is heard
                          over), so the text box can go up as it is said
       ROCKET_BURST_MS    Fireworks: a rider's firework bursts this long after
                          its rocket's beat (the launch on the beat); BURST_SIZE
                          its size by the judgement (a Perfect 1); a miss fizzles
                          as the room calls it
       skyBeat(chart)     the beat (from songAt) the sky fills after the finale
                          (null for a song that doesn't end on rockets)
       darkBars(chart)    the blackout bars: a bare hi-hat, no calls, no answers

   groove.js plans a song from its chart; grooveScreen.js and
   groovePhone.js run the TV and the phone; voices.js names the host's
   clips. The 3D race's sound (screen.js, controller.js, music.js,
   river.js, cup.js) is parked here with the 3D river (float/proto) and
   is not imported. */
import { unlockSound, useSoundUnlockNeeded } from "../../../src/lib/sound.js";

export { useFloatScreenSound, createGrooveScreenSound as createFloatScreenSound, screenStep, grooveView, loadGrooveVoice } from "./grooveScreen.js";
export { useFloatControllerSound, createGroovePhoneSound as createFloatControllerSound, phoneStep as controllerStep,
  floatTapSound, floatDoneSound, floatCheerSound, floatStrokeSound, floatDrinkSound, floatThrowSound, GROOVE_TAPS as FLOAT_TAPS,
  floatMissSound, floatStreakBreakSound, floatStreakSound, streakStep, STREAK_MILESTONES, STREAK_BREAK_MIN, isStreakMilestone } from "./groovePhone.js";
export { PODIUM_BEATS, CUT_BEATS, TITLE_BEATS, LAST_CALL_BEATS, CHUGOFF_BEATS, GROOVE_PRE_MS, chartFor, songEvents, songSlots,
  cutBeats, lastCallBeats, chugoffPlan, narration, ROCKET_BURST_MS, BURST_SIZE, skyBeat, darkBars } from "./groove.js";

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
