/* The screen's sound (float/client/sound, the sound builder's): the room
   bus runner on the connection, and the page's "Click for sound". Loaded
   lazily by FloatScreen behind an error boundary, so a sound module that
   fails to load leaves the picture running (silent) instead of taking the
   TV down. It hands the sound's beats to the picture (soundBridge.js). */
import React from "react";
import { CUT_BEATS, PODIUM_BEATS, unlockFloatSound, useFloatScreenSound, useFloatSoundUnlockNeeded } from "../../sound/index.js";
import { setSoundBeats } from "../soundBridge.js";

setSoundBeats({ CUT_BEATS, PODIUM_BEATS });

function SoundIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z" />
    <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>;
}

export default function ScreenSound({ net, options, showUnlock = false }) {
  useFloatScreenSound(net, options);
  const unlockNeeded = useFloatSoundUnlockNeeded();
  if (!unlockNeeded || !showUnlock) return null;
  /* Field Day's TV has its own Click for sound; the /float page needs this one */
  return <button type="button" className="fs-sound" onClick={() => unlockFloatSound()}><SoundIcon />Click for sound</button>;
}
