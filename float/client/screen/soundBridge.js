/* The sound's beats the picture lands on (float/client/sound: CUT_BEATS,
   PODIUM_BEATS), read by the screen at run time. The sound module loads
   lazily (stage/ScreenSound.jsx) so the screen never fails with it; until
   it is in, or if it never is, the screen's own beats stand in. */
export const soundBeats = { cut:null, podium:null };

export function setSoundBeats(mod = {}) {
  soundBeats.cut = mod.CUT_BEATS || null;
  soundBeats.podium = mod.PODIUM_BEATS || null;
}

/* the podium's reveal (ms from its start) when the sound does not say */
export const PODIUM_FALLBACK = Object.freeze({ third:1450, second:2200, first:2700, pose:3400 });
export const podiumBeats = () => soundBeats.podium || PODIUM_FALLBACK;
