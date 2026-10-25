/* The gate in front of Float's own components (float/client): the TV's
   river (FloatScreen), the phone's controller (FloatController) and the
   profile's locker (LockerPicker). Everything here is small and in the main
   bundle; each part is its own chunk, fetched only when a TV, a rider's
   phone or an open Locker asks for it, and only from an effect, never
   during a render (a server render or a test never loads it).

   The loaders are Vite's import.meta.glob, so each part is a lazy chunk in
   the build while a plain bundler (esbuild in the tests) never follows
   them into float/client: Field Day's own suites stay insulated from the
   river's code, which is built in parallel. A part that fails to load or
   to render is marked failed for the session (failFloatPart), and every
   surface then falls back to Field Day's own: the TV's live board, the
   result entered by hand. */
import { useEffect, useState } from "react";

const LOADERS = {
  screen:() => import.meta.glob("../../../float/client/screen/FloatScreen.jsx")["../../../float/client/screen/FloatScreen.jsx"](),
  controller:() => import.meta.glob("../../../float/client/controller/FloatController.jsx")["../../../float/client/controller/FloatController.jsx"](),
  locker:() => import.meta.glob("../../../float/client/locker/LockerPicker.jsx")["../../../float/client/locker/LockerPicker.jsx"](),
};
export const FLOAT_PARTS = Object.freeze(Object.keys(LOADERS));

const loaded = {}, pending = {}, failed = {};
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

export function loadFloatPart(name) {
  if (!LOADERS[name]) return Promise.resolve(null);
  if (loaded[name]) return Promise.resolve(loaded[name]);
  if (failed[name]) return Promise.resolve(null);
  if (pending[name]) return pending[name];
  pending[name] = Promise.resolve().then(LOADERS[name]).then(mod => {
    if (typeof mod?.default !== "function") throw new Error(`${name} has no component`);
    loaded[name] = mod.default;
    return loaded[name];
  }).catch(error => {
    failed[name] = String(error?.message || error || "load").slice(0, 120);
    return null;
  }).finally(() => { pending[name] = null; notify(); });
  return pending[name];
}

/* a part that threw while it rendered (FloatBoundary) is out for the session */
export function failFloatPart(name, reason = "render") {
  if (failed[name]) return;
  failed[name] = reason;
  notify();
}
export const floatPartFailed = name => failed[name] || null;

/* The part, once it is in: { Part, failed }. `want` false loads nothing.
   Tests and fit views may hand a part in ahead (`provideFloatPart`). */
export function useFloatPart(name, want = true) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!want) return undefined;
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    loadFloatPart(name);
    return () => { listeners.delete(fn); };
  }, [name, want]);
  return { Part:loaded[name] || null, failed:failed[name] || null };
}

/* a rehearsal's own part (a stand-in, or the real one loaded ahead) */
export function provideFloatPart(name, Component) {
  if (!LOADERS[name] || typeof Component !== "function") return;
  loaded[name] = Component;
  delete failed[name];
  notify();
}
