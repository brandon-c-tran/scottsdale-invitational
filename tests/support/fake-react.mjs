/* Just enough React to run one component's hooks in Node, deterministically:
   useState, useEffect (deps compared with Object.is, effects after each
   render, cleanups before a re-run) and useRef. A state update marks the
   component dirty; the test's loop renders it again. For hook tests that
   need effects and timers (react-dom/server runs no effects). */
let component = null;
let slots = [];
let cursor = 0;
let dirty = false;
let queued = [];

export function mount(fn) {
  unmount();
  component = fn;
  slots = [];
  return render();
}
export function render() {
  cursor = 0;
  dirty = false;
  queued = [];
  const out = component();
  const effects = queued;
  queued = [];
  for (const run of effects) run();
  return out;
}
export const isDirty = () => dirty;
export function unmount() {
  for (const slot of slots) if (slot?.kind === "effect") slot.cleanup?.();
  slots = [];
  component = null;
}

export function useState(initial) {
  const i = cursor++;
  if (!slots[i]) slots[i] = { kind:"state", value:typeof initial === "function" ? initial() : initial };
  const slot = slots[i];
  return [slot.value, next => {
    const value = typeof next === "function" ? next(slot.value) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    dirty = true;
  }];
}
export function useRef(initial) {
  const i = cursor++;
  if (!slots[i]) slots[i] = { kind:"ref", ref:{ current:initial } };
  return slots[i].ref;
}
export function useEffect(effect, deps) {
  const i = cursor++;
  const prev = slots[i];
  const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length
    || deps.some((dep, k) => !Object.is(dep, prev.deps[k]));
  if (!changed) return;
  const slot = { kind:"effect", deps, cleanup:prev?.cleanup || null };
  slots[i] = slot;
  queued.push(() => {
    slot.cleanup?.();
    const cleanup = effect();
    slot.cleanup = typeof cleanup === "function" ? cleanup : null;
  });
}
export const useLayoutEffect = useEffect;
export const useMemo = (fn) => fn();
export const useCallback = fn => fn;
export default { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback };
