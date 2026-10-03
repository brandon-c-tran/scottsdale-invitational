/* The Spotify status this commissioner device last read, shared by the
   menu's Speaker row and the Speaker sheet: the menu asks again each time it
   opens, the sheet writes what it changes (the speaker, auto win songs, a
   disconnect) so the row agrees without another request. */
import { useEffect, useSyncExternalStore } from "react";
import { spotifyStatus } from "../../lib/client.js";

let current = null;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const read = () => current;

export function setSpeakerStatus(next) {
  current = typeof next === "function" ? next(current) : next;
  listeners.forEach(listener => listener());
}

export async function refreshSpeakerStatus() {
  const result = await spotifyStatus();
  setSpeakerStatus(result);
  return result;
}

/* `active`: read it now (the menu just opened) */
export function useSpeakerStatus(active) {
  const status = useSyncExternalStore(subscribe, read, read);
  useEffect(() => { if (active) refreshSpeakerStatus(); }, [active]);
  return status;
}
