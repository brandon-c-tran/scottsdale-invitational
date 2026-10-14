/* The gate in front of the chip layer (Oct 13): small and in the main
   bundle. The layer itself (ChipPhysics.jsx: three and cannon-es) is a
   dynamic import that only a screen with WebGL, a table with chips on it
   and, on a phone, the "Chip physics" switch on ever requests. Missing
   WebGL, a failed load, a render error, a lost context or a slow device
   falls back to the flat DOM stacks for the rest of the session
   (chipPhysicsFellBack), with no error.

     const on = useChipPhysics({ tv, want })   true once the layer can draw
     <ChipPhysicsLayer {...props} />           render it inside the host
                                               element; props in ChipPhysics.jsx

   While `on` is false the host draws its DOM stacks as before. */
import React, { Component, useEffect, useState } from "react";
import { chipPhysicsFellBack, useChipPhysicsEnabled } from "./chipPhysicsFlag.js";
import { chipPhysicsMode } from "./chipScatter.js";

let support = null;
let Layer = null;
let loading = null;
let failed = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

export function chipWebgl() {
  if (support !== null) return support;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
    support = !!gl;
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext();
  } catch {
    support = false;
  }
  return support;
}

export function loadChipPhysics() {
  if (Layer || loading || failed) return loading;
  loading = import("./ChipPhysics.jsx").then(mod => { Layer = mod.default; notify(); return Layer; },
    () => { failChipPhysics("load"); return null; });
  return loading;
}

/* the layer could not run here: flat chips for the session, on every table */
export function failChipPhysics(reason = "error") {
  if (failed) return;
  failed = reason;
  chipPhysicsFellBack();
  notify();
}
export const chipPhysicsFailure = () => failed;

export { chipPhysicsMode };

export function useChipPhysics({ tv = false, want = true } = {}) {
  const [, bump] = useState(0);
  const enabled = useChipPhysicsEnabled();
  const mode = chipPhysicsMode({ tv, enabled, want, supported:chipWebgl(), loaded:!!Layer, failed });
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  useEffect(() => { if (mode.load) loadChipPhysics(); }, [mode.load]);
  return mode.on;
}

class LayerBoundary extends Component {
  constructor(props) { super(props); this.state = { error:false }; }
  static getDerivedStateFromError() { return { error:true }; }
  componentDidCatch() { failChipPhysics("render"); this.props.onFallback?.("render"); }
  render() { return this.state.error ? null : this.props.children; }
}

/* the layer, once loaded; nothing until then or after a failure */
export function ChipPhysicsLayer({ onFallback, ...props }) {
  if (!Layer || failed) return null;
  const fail = reason => { failChipPhysics(reason); onFallback?.(reason); };
  return (
    <LayerBoundary onFallback={onFallback}>
      <Layer {...props} onFallback={fail} />
    </LayerBoundary>
  );
}
