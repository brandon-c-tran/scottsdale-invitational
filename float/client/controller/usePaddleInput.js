/* Touches into strokes and hands (float/PROTOCOL.md: stroke, hands).

   Native listeners, not React's: React listens to touches passively, and
   only a listener that may cancel can stop iOS scrolling, zooming,
   selecting and calling out under two thumbs. Each touch is routed by where
   it landed in content space (turn.js): the left half paddles left, the
   right half right. Anything marked data-ui (a button, an overlay) keeps
   its own touches.

   Each stroke, inside the handler that saw it: onStroke (the controller
   sends it, then plays its sound), the blade, then the haptic: tapTick on
   iPhone when the handler is a touch's start or end (the only places iOS
   lets the tick sound; a stroke found mid-move or by a stall ticks when its
   thumb lifts), and Android's vibration. hands is the number of halves with
   a thumb down, reported on every change, and always checked against the
   touches the browser says are down, so a lost touchend cannot strand it. */
import { useEffect, useRef } from "react";
import { haptic, tapTick } from "../../../src/lib/haptics.js";
import { createStrokes } from "./strokes.js";
import { toContent } from "./turn.js";

const KEYS = { ArrowLeft:"L", KeyA:"L", ArrowRight:"R", KeyD:"R" };

export function usePaddleInput(rootRef, { geomRef, visualsRef, enabled = true, onStroke, onHands, onTouchEnd }) {
  const opts = useRef({});
  opts.current = { enabled, onStroke, onHands, onTouchEnd };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const strokes = createStrokes();
    const owesTick = new Set();
    const pullFrom = new Map();
    const run = { side:null, n:0 };
    let lastHands = -1, stallTimer = null, mouse = null;
    const now = () => (globalThis.performance?.now?.() ?? Date.now());
    const visuals = () => visualsRef.current;

    const point = t => {
      const g = geomRef.current || {};
      const rect = g.el?.getBoundingClientRect?.() || { left:0, top:0 };
      return toContent(t.clientX - rect.left, t.clientY - rect.top, g, g.turn || 0);
    };
    const sideAt = p => p.x < (geomRef.current?.cw || 0) / 2 ? "L" : "R";
    const report = () => {
      const n = strokes.hands();
      if (n === lastHands) return;
      lastHands = n;
      opts.current.onHands?.(n);
    };
    const release = (id, side) => {
      owesTick.delete(id);
      pullFrom.delete(id);
      if (side && !strokes.sides().has(side)) visuals()?.up(side);
    };
    /* drop touches the browser no longer has (a touchend we never saw) */
    const reconcile = live => {
      if (!live) return;
      const ids = new Set([...live].map(t => t.identifier));
      for (const id of [...pullFrom.keys()]) {
        if (id === "mouse" || ids.has(id)) continue;
        const side = strokes.sideOf(id);
        strokes.cancel(id);
        release(id, side);
      }
    };
    const handle = (stroke, gesture) => {
      if (!stroke) return;
      opts.current.onStroke?.(stroke);
      visuals()?.stroke(stroke.side, stroke.p);
      if (gesture) tapTick(); else owesTick.add(stroke.id);
      haptic(stroke.p >= 0.8 ? "settle" : stroke.kind === "tap" ? "retract" : "place");
      run.n = run.side === stroke.side ? run.n + 1 : 1;
      run.side = stroke.side;
      visuals()?.next(stroke.side === "L" ? "R" : "L", run.n >= 3);
    };
    const schedule = () => {
      clearTimeout(stallTimer);
      const at = strokes.stallAt();
      if (at === null) return;
      stallTimer = setTimeout(() => {
        for (const stroke of strokes.tick(now())) handle(stroke, false);
        schedule();
      }, Math.max(0, at - now()) + 2);
    };

    const onStart = event => {
      reconcile(event.touches);
      if (!opts.current.enabled) return;
      let mine = false;
      for (const t of event.changedTouches) {
        if (t.target?.closest?.("[data-ui]")) continue;
        const p = point(t);
        const side = strokes.down(t.identifier, sideAt(p), p.x, p.y, now());
        pullFrom.set(t.identifier, p.y);
        visuals()?.down(side, p);
        mine = true;
      }
      if (!mine) return;
      if (event.cancelable) event.preventDefault();
      report();
    };
    const onMove = event => {
      let mine = false;
      for (const t of event.changedTouches) {
        const side = strokes.sideOf(t.identifier);
        if (!side) continue;
        mine = true;
        const p = point(t);
        const stroke = strokes.move(t.identifier, p.x, p.y, now());
        visuals()?.drag(side, p, p.y - (pullFrom.get(t.identifier) ?? p.y));
        if (stroke) { handle(stroke, false); pullFrom.set(t.identifier, p.y); }
      }
      if (!mine) return;
      if (event.cancelable) event.preventDefault();
      schedule();
    };
    const onEnd = event => {
      let mine = false;
      for (const t of event.changedTouches) {
        const side = strokes.sideOf(t.identifier);
        if (!side) continue;
        mine = true;
        const p = point(t);
        const stroke = strokes.up(t.identifier, p.x, p.y, now());
        if (stroke) handle(stroke, true);
        else if (owesTick.has(t.identifier)) tapTick();
        release(t.identifier, side);
      }
      reconcile(event.touches);
      if (!mine) return;
      if (event.cancelable) event.preventDefault();
      opts.current.onTouchEnd?.();
      report();
      schedule();
    };
    const onCancel = event => {
      for (const t of event.changedTouches) {
        const side = strokes.sideOf(t.identifier);
        if (!side) continue;
        strokes.cancel(t.identifier);
        release(t.identifier, side);
      }
      reconcile(event.touches);
      report();
      schedule();
    };

    /* a mouse paddles too (a laptop rehearsal): one pointer, like one thumb */
    const onPointerDown = event => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !opts.current.enabled || mouse) return;
      if (event.target?.closest?.("[data-ui]")) return;
      const p = point(event);
      mouse = event.pointerId;
      const side = strokes.down("mouse", sideAt(p), p.x, p.y, now());
      pullFrom.set("mouse", p.y);
      visuals()?.down(side, p);
      try { root.setPointerCapture?.(event.pointerId); } catch {}
      report();
    };
    const onPointerMove = event => {
      if (event.pointerId !== mouse) return;
      const p = point(event), side = strokes.sideOf("mouse");
      const stroke = strokes.move("mouse", p.x, p.y, now());
      visuals()?.drag(side, p, p.y - (pullFrom.get("mouse") ?? p.y));
      if (stroke) { handle(stroke, false); pullFrom.set("mouse", p.y); }
      schedule();
    };
    const onPointerUp = event => {
      if (event.pointerId !== mouse) return;
      mouse = null;
      const p = point(event), side = strokes.sideOf("mouse");
      const stroke = event.type === "pointercancel" ? (strokes.cancel("mouse"), null) : strokes.up("mouse", p.x, p.y, now());
      if (stroke) handle(stroke, true);
      release("mouse", side);
      opts.current.onTouchEnd?.();
      report();
      schedule();
    };
    /* and keys: A or the left arrow, D or the right */
    const onKey = event => {
      const side = KEYS[event.code];
      if (!side || event.repeat || !opts.current.enabled || event.target?.closest?.("input, textarea, select")) return;
      event.preventDefault();
      handle({ id:"key", side, p:0.7, kind:"key", at:now() }, true);
    };
    /* the page went away mid-touch: nothing is held any more */
    const reset = () => {
      strokes.clear();
      owesTick.clear();
      pullFrom.clear();
      mouse = null;
      visuals()?.clear();
      report();
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") reset(); };

    const active = { passive:false };
    root.addEventListener("touchstart", onStart, active);
    root.addEventListener("touchmove", onMove, active);
    root.addEventListener("touchend", onEnd, active);
    root.addEventListener("touchcancel", onCancel, active);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", reset);
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", onVisibility);
    report();
    return () => {
      clearTimeout(stallTimer);
      root.removeEventListener("touchstart", onStart, active);
      root.removeEventListener("touchmove", onMove, active);
      root.removeEventListener("touchend", onEnd, active);
      root.removeEventListener("touchcancel", onCancel, active);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", reset);
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", onVisibility);
      /* the paddles are going: no thumbs on them */
      if (lastHands > 0) opts.current.onHands?.(0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
