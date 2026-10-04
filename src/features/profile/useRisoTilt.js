import { useEffect, useLayoutEffect, useRef } from "react";
import { TILT, canFollowOrientation, dragTilt, hoverTilt, orientationTilt, plateStrength, recenter, stepToward } from "./tilt.js";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* Drives --tx/--ty/--tm on the card. CSS turns those into transforms, so a
   frame only writes three custom properties and nothing lays out. rAF runs
   only while a pointer or the phone is leading; release is a CSS transition. */
export function useRisoTilt(ref, enabled) {
  const st = useRef(null);
  if (!st.current) st.current = { cur:{ x:0, y:0 }, target:{ x:0, y:0 }, raf:0, pointer:null, hover:null,
    orient:null, suppress:false, hold:0, timer:0, opened:false, visible:true };
  const s = st.current;

  const write = (x, y) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", x.toFixed(4));
    el.style.setProperty("--ty", y.toFixed(4));
    el.style.setProperty("--tm", plateStrength(x, y).toFixed(3));
  };
  const frame = () => {
    s.raf = 0;
    const rate = s.pointer || s.hover ? TILT.follow : TILT.orientationFollow;
    s.cur = stepToward(s.cur, s.target, rate);
    write(s.cur.x, s.cur.y);
    if (!s.cur.settled) s.raf = requestAnimationFrame(frame);
  };
  const follow = target => {
    const el = ref.current;
    if (!el) return;
    s.target = target;
    clearTimeout(s.timer);
    if (el.classList.contains("is-releasing")) {
      el.classList.remove("is-releasing");
      s.cur = { x:0, y:0 };
    }
    el.classList.add("is-tilting");
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  };
  const release = (ms = TILT.releaseMs) => {
    const el = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = 0;
    if (!el) return;
    if (s.orient?.target && Date.now() >= s.hold) { follow(s.orient.target); return; }
    s.target = { x:0, y:0 };
    s.cur = { x:0, y:0 };
    el.style.setProperty("--tilt-release", `${ms}ms`);
    el.classList.add("is-releasing");
    write(0, 0);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => el.classList.remove("is-releasing", "is-tilting"), ms + 60);
  };
  const reset = () => {
    const el = ref.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    clearTimeout(s.timer);
    s.raf = 0; s.pointer = null; s.hover = null; s.cur = { x:0, y:0 }; s.target = { x:0, y:0 };
    if (!el) return;
    el.classList.remove("is-releasing", "is-tilting");
    ["--tx", "--ty", "--tm", "--tilt-release"].forEach(name => el.style.removeProperty(name));
  };
  /* The card arrives leaning and relaxes, once per open. */
  const openSettle = () => {
    if (s.opened || !ref.current) return;
    s.opened = true;
    s.cur = { ...TILT.open };
    write(TILT.open.x, TILT.open.y);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!s.pointer && !s.hover) release(TILT.openMs);
    }));
  };

  useIsoLayoutEffect(() => {
    if (!enabled) { reset(); return undefined; }
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) openSettle();
    return undefined;
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Offscreen or inside a closed preview, the card listens to nothing. */
  useEffect(() => {
    if (!enabled) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return undefined;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      s.visible = visible;
      if (visible) openSettle();
      else if (s.orient) { s.orient = null; release(); }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const allowed = canFollowOrientation({ userAgent:navigator.userAgent, platform:navigator.userAgentData?.platform,
      OrientationEvent:window.DeviceOrientationEvent });
    if (!allowed) return undefined;
    const onOrient = event => {
      if (!s.visible || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
      const reading = { gamma:event.gamma, beta:event.beta };
      if (!s.orient) s.orient = { base:reading, target:{ x:0, y:0 } };
      s.orient.base = recenter(s.orient.base, reading);
      s.orient.target = orientationTilt(reading, s.orient.base);
      if (!s.pointer && !s.hover && Date.now() >= s.hold) follow(s.orient.target);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => { window.removeEventListener("deviceorientation", onOrient); s.orient = null; };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (s.raf) cancelAnimationFrame(s.raf); clearTimeout(s.timer); }, []); // eslint-disable-line

  const handlers = enabled ? {
    onPointerDown:event => {
      s.suppress = false;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      s.pointer = { id:event.pointerId, x0:event.clientX, y0:event.clientY, w:rect.width, h:rect.height, dragging:false };
    },
    onPointerMove:event => {
      if (s.pointer && event.pointerId === s.pointer.id) {
        const tilt = dragTilt(event.clientX - s.pointer.x0, event.clientY - s.pointer.y0, s.pointer.w, s.pointer.h);
        if (tilt.dragging) { s.pointer.dragging = true; follow(tilt); }
        return;
      }
      if (event.pointerType !== "mouse" || Date.now() < s.hold) return;
      if (!s.hover) s.hover = { rect:event.currentTarget.getBoundingClientRect() };
      follow(hoverTilt(event.clientX, event.clientY, s.hover.rect));
    },
    onPointerUp:event => {
      if (!s.pointer || event.pointerId !== s.pointer.id) return;
      if (s.pointer.dragging) { s.suppress = Date.now(); s.pointer = null; release(); }
      else s.pointer = null;
    },
    onPointerCancel:() => { s.pointer = null; release(); },
    onPointerLeave:event => {
      if (event.pointerType !== "mouse") return;
      s.hover = null;
      if (s.pointer) s.pointer = null;
      release();
    },
  } : {};

  return {
    handlers,
    /* true once for the click that ends a tilt drag */
    consumeClick() {
      const recent = s.suppress && Date.now() - s.suppress < 500;
      s.suppress = false;
      return !!recent;
    },
    /* the flip turns a level card */
    flip() {
      if (!enabled) return;
      s.hold = Date.now() + TILT.flipHoldMs;
      s.hover = null;
      release();
    },
  };
}
