/* Touches into strokes and hands (float/PROTOCOL.md: stroke, hands).

   Native listeners, not React's: React listens to touches passively, and
   only a listener that may cancel can stop iOS scrolling, zooming,
   selecting and calling out under two thumbs. Each touch is routed by where
   it landed in content space (turn.js): the left half paddles left, the
   right half right, and a thumb keeps its side wherever it slides. Anything
   marked data-ui (a button, an overlay) keeps its own touches.

   Each stroke, inside the handler that saw it: onStroke (the controller
   sends it, then plays its sound), the blade, then the haptic: tapTick on
   iPhone when the handler is a touch's start or end (the only places iOS
   lets the tick sound; a stroke found mid-move or by a stall ticks when its
   thumb lifts), and Android's vibration. Hands (hands.js) rise at once and
   drop after the grace, and are always checked against the touches the
   browser says are down, so a lost touchend cannot strand them. The page
   going away (hidden, blurred, closed) drops everything at once. */
import { useEffect, useRef } from "react";
import { haptic, tapTick } from "../../../src/lib/haptics.js";
import { createCadence } from "./cadence.js";
import { createHands } from "./hands.js";
import { createStrokes } from "./strokes.js";
import { toContent } from "./turn.js";

const KEYS = { ArrowLeft:"L", KeyA:"L", ArrowRight:"R", KeyD:"R" };
const clock = () => (globalThis.performance?.now?.() ?? Date.now());
/* when the finger moved, not when the handler ran: a busy frame delivers
   touches late, and a pull's speed must not read the delay. An old
   browser's epoch timeStamp falls back to the clock. */
export const stampOf = (event, now = clock()) => {
  const ts = Number(event?.timeStamp);
  return Number.isFinite(ts) && ts > 0 && Math.abs(now - ts) < 1000 ? Math.min(ts, now) : now;
};

export function usePaddleInput(rootRef, { geomRef, visualsRef, enabled = true, onStroke, onHands, onTouchEnd }) {
  const opts = useRef({});
  opts.current = { enabled, onStroke, onHands, onTouchEnd };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const strokes = createStrokes();
    const hands = createHands();
    const cadence = createCadence();
    const tracked = new Set();
    const owesTick = new Set();
    const run = { side:null, n:0 };
    let stallTimer = null, handsTimer = null, mouse = null;
    const visuals = () => visualsRef.current;

    const point = t => {
      const g = geomRef.current || {};
      const rect = g.el?.getBoundingClientRect?.() || { left:0, top:0 };
      return toContent(t.clientX - rect.left, t.clientY - rect.top, g, g.turn || 0);
    };
    const sideAt = p => p.x < (geomRef.current?.cw || 0) / 2 ? "L" : "R";

    /* hands: a rise reports now, a drop when its grace runs out */
    const reportHands = () => {
      clearTimeout(handsTimer);
      handsTimer = null;
      const t = clock();
      const n = hands.report(t);
      if (n !== null) opts.current.onHands?.(n);
      const at = hands.nextAt(t);
      if (at !== null) handsTimer = setTimeout(reportHands, Math.max(0, at - clock()) + 4);
    };
    const land = (id, p, at) => {
      const side = strokes.down(id, sideAt(p), p.x, p.y, at);
      tracked.add(id);
      hands.down(id, side, at);
      visuals()?.down(side, p);
      return side;
    };
    const lift = (id, side) => {
      tracked.delete(id);
      owesTick.delete(id);
      hands.up(id, clock());
      if (side && !strokes.sides().has(side)) visuals()?.up(side);
    };
    /* drop touches the browser no longer has (a touchend we never saw) */
    const reconcile = live => {
      if (!live) return;
      const ids = new Set([...live].map(t => t.identifier));
      for (const id of [...tracked]) {
        if (id === "mouse" || ids.has(id)) continue;
        const side = strokes.sideOf(id);
        strokes.cancel(id);
        lift(id, side);
      }
    };

    /* felt: the pull's power as the river will count it (cadence.js), for
       the splash and the dip; the room is sent the pull's own power */
    const handle = (stroke, gesture) => {
      if (!stroke) return;
      const lands = cadence.stroke(stroke.at);
      const felt = Math.round(stroke.p * Math.max(0.15, lands) * 100) / 100;
      opts.current.onStroke?.({ ...stroke, felt, rushed:lands < 0.75 });
      visuals()?.stroke(stroke.side, felt, lands < 0.75);
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
        for (const stroke of strokes.tick(clock())) handle(stroke, false);
        schedule();
      }, Math.max(0, at - clock()) + 2);
    };

    const onStart = event => {
      reconcile(event.touches);
      if (!opts.current.enabled) return;
      const at = stampOf(event);
      let mine = false;
      for (const t of event.changedTouches) {
        if (t.target?.closest?.("[data-ui]")) continue;
        land(t.identifier, point(t), at);
        mine = true;
      }
      if (!mine) return;
      if (event.cancelable) event.preventDefault();
      reportHands();
    };
    const onMove = event => {
      const at = stampOf(event);
      let mine = false;
      for (const t of event.changedTouches) {
        const side = strokes.sideOf(t.identifier);
        if (!side) continue;
        mine = true;
        const p = point(t);
        const stroke = strokes.move(t.identifier, p.x, p.y, at);
        if (stroke) handle(stroke, false);
        visuals()?.drag(side, p, strokes.pullOf(t.identifier));
      }
      if (!mine) return;
      if (event.cancelable) event.preventDefault();
      schedule();
    };
    const onEnd = event => {
      const at = stampOf(event);
      let mine = false;
      for (const t of event.changedTouches) {
        const side = strokes.sideOf(t.identifier);
        if (!side) continue;
        mine = true;
        const p = point(t);
        const stroke = strokes.up(t.identifier, p.x, p.y, at);
        if (stroke) handle(stroke, true);
        else if (owesTick.has(t.identifier)) tapTick();
        lift(t.identifier, side);
      }
      reconcile(event.touches);
      if (!mine) return;
      if (event.cancelable) event.preventDefault();
      opts.current.onTouchEnd?.();
      reportHands();
      schedule();
    };
    const onCancel = event => {
      for (const t of event.changedTouches) {
        const side = strokes.sideOf(t.identifier);
        if (!side) continue;
        strokes.cancel(t.identifier);
        lift(t.identifier, side);
      }
      reconcile(event.touches);
      reportHands();
      schedule();
    };

    /* a mouse paddles too (a laptop rehearsal): one pointer, like one thumb */
    const onPointerDown = event => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !opts.current.enabled || mouse !== null) return;
      if (event.target?.closest?.("[data-ui]")) return;
      mouse = event.pointerId;
      land("mouse", point(event), stampOf(event));
      try { root.setPointerCapture?.(event.pointerId); } catch {}
      reportHands();
    };
    const onPointerMove = event => {
      if (event.pointerId !== mouse) return;
      const p = point(event), side = strokes.sideOf("mouse");
      const stroke = strokes.move("mouse", p.x, p.y, stampOf(event));
      if (stroke) handle(stroke, false);
      visuals()?.drag(side, p, strokes.pullOf("mouse"));
      schedule();
    };
    const onPointerUp = event => {
      if (event.pointerId !== mouse) return;
      mouse = null;
      const p = point(event), side = strokes.sideOf("mouse");
      const stroke = event.type === "pointercancel" ? (strokes.cancel("mouse"), null) : strokes.up("mouse", p.x, p.y, stampOf(event));
      if (stroke) handle(stroke, true);
      lift("mouse", side);
      opts.current.onTouchEnd?.();
      reportHands();
      schedule();
    };
    /* and keys: A or the left arrow, D or the right */
    const onKey = event => {
      const side = KEYS[event.code];
      if (!side || event.repeat || !opts.current.enabled || event.target?.closest?.("input, textarea, select")) return;
      event.preventDefault();
      handle({ id:"key", side, p:0.7, kind:"key", at:clock() }, true);
    };
    /* the page went away mid-touch: nothing is held any more, at once */
    const reset = () => {
      strokes.clear();
      hands.clear();
      cadence.clear();
      tracked.clear();
      owesTick.clear();
      mouse = null;
      clearTimeout(stallTimer);
      visuals()?.clear();
      reportHands();
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
    return () => {
      clearTimeout(stallTimer);
      clearTimeout(handsTimer);
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
      if (hands.reported() > 0) opts.current.onHands?.(0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
