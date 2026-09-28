import React, { Component, useEffect, useState } from "react";
import { towersMode } from "./towersModel.js";

/* The gate in front of the 3D standings. Everything here is small and in
   the main bundle; the scene itself (and three.js) is a dynamic import that
   only a TV with WebGL ever requests. Missing WebGL, a failed load, a render
   error, a lost context, or a slow TV all land on the flat standings with no
   error, and the TV stays there for the rest of the session. */

let support = null;
let Towers = null;
let loading = null;
let failed = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

export function webglSupported() {
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

export function loadTowers() {
  if (Towers || loading || failed) return loading;
  loading = import("./ChipTowers.jsx").then(mod => { Towers = mod.default; notify(); return Towers; },
    () => { failed = "load"; notify(); return null; });
  return loading;
}

export function failTowers(reason = "error") {
  if (failed) return;
  failed = reason;
  notify();
}
export const towersFailure = () => failed;

/* "3d" once the chunk is in and nothing has failed; the flat board until then */
export function useTowersMode(kind = "awards") {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    if (webglSupported()) loadTowers();
    return () => { listeners.delete(fn); };
  }, []);
  return towersMode({ supported:webglSupported(), loaded:!!Towers, failed, kind });
}

class TowersBoundary extends Component {
  constructor(props) { super(props); this.state = { error:false }; }
  static getDerivedStateFromError() { return { error:true }; }
  componentDidCatch() { failTowers("render"); }
  render() { return this.state.error ? this.props.fallback : this.props.children; }
}

export function TowersBoard({ fallback, ...props }) {
  if (!Towers || failed) return fallback;
  return (
    <TowersBoundary fallback={fallback}>
      <Towers {...props} onFail={failTowers} />
    </TowersBoundary>
  );
}
