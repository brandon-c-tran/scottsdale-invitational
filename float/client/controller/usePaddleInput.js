/* Touches into strokes, hands and the beat (float/PROTOCOL.md: stroke,
   hands, "The beat").

   Native listeners, not React's: React listens to touches passively, and
   only a listener that may cancel can stop iOS scrolling, zooming,
   selecting and calling out under two thumbs. Each touch is routed by where
   it landed in content space (turn.js): the left half paddles left, the
   right half right, and a thumb keeps its side wherever it slides. Anything
   marked data-ui (a button, an overlay) keeps its own touches.

   The beat: a stroke is judged at the moment the thumb lands (judgeAt, the
   controller's peek on the room's clock), and the call is stamped near the
   thumb at once with a haptic tick (iOS ticks only in a touch's start or
   end, and a landing is a start). A pull that begins later than PULL_GRACE
   after its thumb landed (a resting thumb that swipes, or a thumb scrubbing
   down again) is judged when it begins; its tick waits for the thumb to
   lift. A thumb that only rests is shown and then faded: it is never sent.
   When the pull ends the stroke fires: onStroke commits the call (the
   controller sends it with the pull's power) and returns the final word,
   which restamps the thumb if a stroke that fired first took the beat.

   Hands (hands.js) rise at once and drop after the grace, and are always
   checked against the touches the browser says are down, so a lost
   touchend cannot strand them. The page going away (hidden, blurred,
   closed) drops everything at once. */
import { useEffect, useRef } from "react";
import { haptic, tapTick } from "../../../src/lib/haptics.js";
import { QUALITY_GAIN } from "../../shared/beat.js";
import { createHands } from "./hands.js";
import { STROKE, createStrokes } from "./strokes.js";
import { toContent } from "./turn.js";

const KEYS = { ArrowLeft:"L", KeyA:"L", ArrowRight:"R", KeyD:"R" };
const clock = () => (globalThis.performance?.now?.() ?? Date.now());
/* a pull that begins this soon after its thumb landed is the landing's stroke */
export const PULL_GRACE = 300;
const HAPTIC_OF = { perfect:"settle", good:"place" };

/* when the finger moved, not when the handler ran: a busy frame delivers
   touches late, and a pull's speed must not read the delay. An old
   browser's epoch timeStamp falls back to the clock. */
export const stampOf = (event, now = clock()) => {
  const ts = Number(event?.timeStamp);
  return Number.isFinite(ts) && ts > 0 && Math.abs(now - ts) < 1000 ? Math.min(ts, now) : now;
};

/* the splash a stroke makes: its power as the river will count it */
export const feltOf = (p, final) => {
  const gain = final ? (QUALITY_GAIN[final.q] ?? 0.4) : 1;
  return Math.round(Math.max(0.12, p * gain) * 100) / 100;
};

export function usePaddleInput(rootRef, { geomRef, visualsRef, enabled = true, onStroke, onHands, onTouchEnd, judgeAt, onLand }) {
  const opts = useRef({});
  opts.current = { enabled, onStroke, onHands, onTouchEnd, judgeAt, onLand };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const hands = createHands();
    const tracked = new Set();
    const owesTick = new Set();
    /* the call each touch's current pull carries: { j, stamp, at } */
    const calls = new Map();
    const restTimers = new Map();
    const lastPoint = new Map();
    const run = { side:null, n:0 };
    let stallTimer = null, handsTimer = null, mouse = null;
    const visuals = () => visualsRef.current;

    const point = t => {
      const g = geomRef.current || {};
      const rect = g.el?.getBoundingClientRect?.() || { left:0, top:0 };
      return toContent(t.clientX - rect.left, t.clientY - rect.top, g, g.turn || 0);
    };
    const sideAt = p => p.x < (geomRef.current?.cw || 0) / 2 ? "L" : "R";

    /* the beat's call at a moment (performance clock): stamped, felt and heard */
    const call = (id, side, at, gesture) => {
      const j = opts.current.judgeAt?.(at) || null;
      if (!j) return null;
      const stamp = visuals()?.judge(side, lastPoint.get(id), j.q) || null;
      if (gesture) tapTick(); else owesTick.add(id);
      haptic(HAPTIC_OF[j.q] || "retract");
      opts.current.onLand?.(side, j);
      calls.set(id, { j, stamp, at });
      return j;
    };
    /* a thumb that lands and stays still is resting, not stroking: its stamp fades */
    const restLater = id => {
      clearTimeout(restTimers.get(id));
      restTimers.set(id, setTimeout(() => {
        restTimers.delete(id);
        const held = calls.get(id);
        if (held && strokes.sideOf(id) && !strokes.pullOf(id)) { visuals()?.dropStamp(held.stamp); held.stamp = null; held.rest = true; }
      }, STROKE.TAP_MS + 30));
    };

    const strokes = createStrokes({
      onPull:pull => {
        clearTimeout(restTimers.get(pull.id));
        const held = calls.get(pull.id);
        /* the landing's own pull keeps the landing's call */
        if (pull.first && held && !held.rest && pull.at - pull.t0 <= PULL_GRACE) return;
        call(pull.id, pull.side, pull.at, false);
      },
    });

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
      lastPoint.set(id, p);
      hands.down(id, side, at);
      visuals()?.down(side, p);
      return side;
    };
    const lift = (id, side) => {
      tracked.delete(id);
      owesTick.delete(id);
      lastPoint.delete(id);
      /* a call that never became a stroke (a press that lifted late, a sideways slide): nothing was sent, so it goes */
      const held = calls.get(id);
      if (held?.stamp) visuals()?.dropStamp(held.stamp);
      calls.delete(id);
      clearTimeout(restTimers.get(id));
      restTimers.delete(id);
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

    /* a stroke fired: the controller commits its call and sends it; the
       splash is its power as counted, the stamp corrected if the call moved
       (a stroke that fired first took the beat, or the stroke was held back) */
    const handle = (stroke, gesture) => {
      if (!stroke) return;
      const held = calls.get(stroke.id);
      calls.delete(stroke.id);
      const final = opts.current.onStroke?.({ ...stroke, j:held?.j || null }) || null;
      const felt = feltOf(stroke.p, final);
      if (held?.stamp && final && final.q !== held.j.q) visuals()?.restamp(held.stamp, final.q);
      visuals()?.stroke(stroke.side, felt, !!final && !final.onBeat);
      /* without a beat (no gun yet) the stroke itself ticks, as before */
      if (!held) { if (gesture) tapTick(); else owesTick.add(stroke.id); haptic(stroke.p >= 0.8 ? "settle" : "place"); }
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
        const side = land(t.identifier, point(t), at);
        if (call(t.identifier, side, at, true)) restLater(t.identifier);
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
        lastPoint.set(t.identifier, p);
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
        lastPoint.set(t.identifier, p);
        const stroke = strokes.up(t.identifier, p.x, p.y, at);
        if (stroke) handle(stroke, true);
        if (owesTick.has(t.identifier)) tapTick();
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
      const at = stampOf(event);
      const side = land("mouse", point(event), at);
      if (call("mouse", side, at, true)) restLater("mouse");
      try { root.setPointerCapture?.(event.pointerId); } catch {}
      reportHands();
    };
    const onPointerMove = event => {
      if (event.pointerId !== mouse) return;
      const p = point(event), side = strokes.sideOf("mouse");
      lastPoint.set("mouse", p);
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
    /* and keys: A or the left arrow, D or the right (judged as they are pressed) */
    const onKey = event => {
      const side = KEYS[event.code];
      if (!side || event.repeat || !opts.current.enabled || event.target?.closest?.("input, textarea, select")) return;
      event.preventDefault();
      const at = stampOf(event);
      const cw = geomRef.current?.cw || 0, ch = geomRef.current?.ch || 0;
      lastPoint.set("key", { x:side === "L" ? cw * 0.25 : cw * 0.75, y:ch * 0.55 });
      call("key", side, at, true);
      handle({ id:"key", side, p:0.7, kind:"key", at, t0:at, from:at }, true);
    };
    /* the page went away mid-touch: nothing is held any more, at once */
    const reset = () => {
      strokes.clear();
      hands.clear();
      tracked.clear();
      owesTick.clear();
      calls.clear();
      lastPoint.clear();
      for (const timer of restTimers.values()) clearTimeout(timer);
      restTimers.clear();
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
      for (const timer of restTimers.values()) clearTimeout(timer);
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
