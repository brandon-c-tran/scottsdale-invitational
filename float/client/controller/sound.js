/* The phone's sound calls (float/GROOVE.md "Sound (the Groove)": the phone
   plays your own tap at once, Done, Through and Out; never music). The
   sound builder's module (float/client/sound) is read through its namespace,
   so a name it does not export yet is a quiet no-op rather than a broken
   import: floatTapSound(q, kind) (q null for a tap that matched no cue,
   kind the cue's),
   floatDoneSound(), floatCheerSound(), unlockFloatSound(), and the hook
   useFloatControllerSound(net, { me }) for what the room's frames sound. */
import * as floatSound from "../sound/index.js";

const call = (name, ...args) => {
  const fn = floatSound[name];
  if (typeof fn !== "function") return undefined;
  try { return fn(...args); } catch { return undefined; }
};

export const tapSound = (q, kind = null) => call("floatTapSound", q ?? null, kind ?? null);
export const doneSound = () => call("floatDoneSound");
export const cheerSound = () => call("floatCheerSound");
export const unlockSound = () => call("unlockFloatSound");

/* the room's moments on the you bus (the sound builder's hook; its return is not read) */
const hookName = "useFloatControllerSound";
const noHook = () => null;
export const useControllerSound = typeof floatSound[hookName] === "function" ? floatSound[hookName] : noHook;
