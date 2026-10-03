import { useEffect } from "react";
import { prefersReducedMotion } from "../lib/motion.js";

/* Glass you can feel: the player card's physics for any pane of the
   backglass. A finger on the pane presses the glass in where it touches (a
   lean of a few degrees toward the finger and a small sink), a drag leads
   it, and on release it springs back level with one small overshoot. One
   hard reflection band rides the glass: it brightens and slides as the pane
   leans, and (scroll-driven, backglass.css .fd-tilt-glare) slides across as
   the pane travels the viewport, so glass reads as glass while scrolling.
   A GlassArt painting inside the pane (GlassArt depth) parts into its
   layers as the pane leans.

   Touch only drives it; never device orientation, so iOS never shows a
   motion-permission prompt. Reduced motion: the pane stays still and level.
   Every frame writes transforms only (inline `transform` on the pane,
   `translate` on the band and the painting's layers): nothing lays out,
   and will-change lives only while a finger is down or the spring runs.

   API: useGlassTilt(ref, { enabled, max, sink, glare })
     ref      a ref object to the pane (any positioned element)
     enabled  false turns it off (default true)
     max      degrees of lean at full reach (default GLASS_TILT.maxDeg)
     sink     px the glass sinks under a press (default GLASS_TILT.sinkPx)
     glare    false skips the reflection band (default true)
   A pane that already carries a CSS transform (the fixed rack's centring)
   keeps it: the lean is composed after it. Pure helpers are exported for
   tests. */
export const GLASS_TILT = Object.freeze({
  maxDeg:3,
  press:.45,          // a still press leans this much of the way
  dragPx:6,           // movement before a press becomes a drag
  sinkPx:5,
  perspective:1100,
  stiffness:240,      // the spring back: one small overshoot, then level
  damping:24,
  /* the painting's layers slide by depth per unit lean, far to near, so
     the near floor moves most and the sky least */
  depthPx:Object.freeze([-1.5, 0, 2.5, 4.5]),
  /* the band slides this share of its pane per unit lean */
  glareTravel:.22,
});

export const clampUnit = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

/* Where the finger sits on the pane, as a lean target in [-1, 1]. A still
   press leans part way; a drag leans all the way to the finger. */
export function leanToward(clientX, clientY, rect, { dragging = false } = {}) {
  if (!rect?.width || !rect?.height) return { x:0, y:0 };
  const reach = dragging ? 1 : GLASS_TILT.press;
  return {
    x:clampUnit((clientX - rect.left - rect.width / 2) / (rect.width / 2)) * reach,
    y:clampUnit((clientY - rect.top - rect.height / 2) / (rect.height / 2)) * reach,
  };
}

/* One step of a damped spring toward a target (semi-implicit Euler, dt in
   seconds, clamped so a slow frame cannot blow it up). Pure. */
export function springStep(pos, vel, target, dt, { stiffness = GLASS_TILT.stiffness, damping = GLASS_TILT.damping } = {}) {
  const step = Math.min(Math.max(dt, 0), 1 / 30);
  const next = vel + (-(pos - target) * stiffness - vel * damping) * step;
  return { pos:pos + next * step, vel:next };
}
export const springSettled = (pos, vel, target) => Math.abs(pos - target) < .002 && Math.abs(vel) < .01;

/* The pane's transform for a lean: the pressed point recedes (rotateY
   follows +x, rotateX follows -y), the glass sinks by z. */
export function paneTransform({ x, y, z }, { base = "", max = GLASS_TILT.maxDeg, sink = GLASS_TILT.sinkPx } = {}) {
  return `${base ? `${base} ` : ""}perspective(${GLASS_TILT.perspective}px) rotateX(${(-y * max).toFixed(3)}deg) `
    + `rotateY(${(x * max).toFixed(3)}deg) translateZ(${(-z * sink).toFixed(2)}px)`;
}

/* 3D transforms render where preserve-3d does; elsewhere the pane stays
   flat and only the reflection answers the finger. */
export function supports3d() {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  return CSS.supports("transform-style", "preserve-3d");
}

export function useGlassTilt(ref, { enabled = true, max = GLASS_TILT.maxDeg, sink = GLASS_TILT.sinkPx, glare = true } = {}) {
  useEffect(() => {
    const el = ref?.current;
    if (!enabled || !el || typeof window === "undefined" || typeof document === "undefined") return undefined;
    const lean3d = supports3d();
    const s = { x:0, y:0, z:0, vx:0, vy:0, vz:0, tx:0, ty:0, tz:0, raf:0, last:0, pointer:null, base:"", active:false };
    /* the reflection band: a clip that takes the pane's corners and one
       hard band inside it. Skipped on a static pane, where an absolute
       child would cover an ancestor instead. */
    let glareEl = null, band = null;
    if (glare && window.getComputedStyle(el).position !== "static") {
      glareEl = document.createElement("span");
      glareEl.className = "fd-tilt-glare";
      glareEl.setAttribute("aria-hidden", "true");
      band = document.createElement("span");
      glareEl.appendChild(band);
      el.appendChild(glareEl);
    }
    el.setAttribute("data-glass-tilt", "rest");
    let layers = [];

    const write = () => {
      if (lean3d) el.style.transform = paneTransform(s, { base:s.base, max, sink });
      const [far, , , near] = GLASS_TILT.depthPx;
      layers.forEach(layer => {
        const k = GLASS_TILT.depthPx[layer.depth] ?? (layer.depth > 0 ? near : far);
        layer.el.style.translate = `${(s.x * k).toFixed(2)}px ${(s.y * k * .6).toFixed(2)}px`;
      });
      if (band) {
        band.style.translate = `${(-s.x * GLASS_TILT.glareTravel * 100 / .28).toFixed(2)}% 0`;
        glareEl.style.opacity = (.5 + .5 * Math.min(1, Math.hypot(s.x, s.y) * 1.6 + s.z * .3)).toFixed(3);
      }
    };
    const rest = () => {
      s.active = false;
      el.setAttribute("data-glass-tilt", "rest");
      el.style.removeProperty("transform");
      layers.forEach(layer => layer.el.style.removeProperty("translate"));
      if (band) { band.style.removeProperty("translate"); glareEl.style.removeProperty("opacity"); }
    };
    const frame = now => {
      const dt = s.last ? (now - s.last) / 1000 : 1 / 60;
      s.last = now;
      const x = springStep(s.x, s.vx, s.tx, dt), y = springStep(s.y, s.vy, s.ty, dt), z = springStep(s.z, s.vz, s.tz, dt);
      s.x = x.pos; s.vx = x.vel; s.y = y.pos; s.vy = y.vel; s.z = z.pos; s.vz = z.vel;
      const settled = springSettled(s.x, s.vx, s.tx) && springSettled(s.y, s.vy, s.ty) && springSettled(s.z, s.vz, s.tz);
      if (settled && !s.pointer && !s.tx && !s.ty && !s.tz) { s.raf = 0; s.last = 0; s.x = s.y = s.z = 0; rest(); return; }
      write();
      s.raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!s.active) {
        /* compose after whatever transform the pane already wears */
        const own = window.getComputedStyle(el).transform;
        s.base = own && own !== "none" ? own : "";
        layers = [...el.querySelectorAll("[data-glass-depth]")].map(node => ({ el:node, depth:Number(node.getAttribute("data-glass-depth")) || 0 }));
        s.active = true;
        el.setAttribute("data-glass-tilt", "on");
      }
      if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(frame); }
    };
    const aim = (target, z) => { s.tx = target.x; s.ty = target.y; s.tz = z; start(); };
    const release = () => { s.pointer = null; s.tx = 0; s.ty = 0; s.tz = 0; if (s.active) start(); };

    const onDown = event => {
      if (prefersReducedMotion() || (event.pointerType === "mouse" && event.button !== 0)) return;
      const rect = el.getBoundingClientRect();
      s.pointer = { id:event.pointerId, x0:event.clientX, y0:event.clientY, rect, dragging:false };
      aim(leanToward(event.clientX, event.clientY, rect), 1);
    };
    const onMove = event => {
      const p = s.pointer;
      if (!p || event.pointerId !== p.id) return;
      if (!p.dragging && Math.hypot(event.clientX - p.x0, event.clientY - p.y0) >= GLASS_TILT.dragPx) p.dragging = true;
      aim(leanToward(event.clientX, event.clientY, p.rect, { dragging:p.dragging }), 1);
    };
    const onUp = event => { if (s.pointer && event.pointerId === s.pointer.id) release(); };
    const onLeave = event => { if (s.pointer && event.pointerId === s.pointer.id && event.pointerType === "mouse") release(); };
    el.addEventListener("pointerdown", onDown, { passive:true });
    el.addEventListener("pointermove", onMove, { passive:true });
    el.addEventListener("pointerup", onUp, { passive:true });
    el.addEventListener("pointercancel", release, { passive:true });
    el.addEventListener("pointerleave", onLeave, { passive:true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("pointerleave", onLeave);
      if (s.raf) cancelAnimationFrame(s.raf);
      rest();
      el.removeAttribute("data-glass-tilt");
      glareEl?.remove();
    };
  }, [ref, enabled, max, sink, glare]);
}
