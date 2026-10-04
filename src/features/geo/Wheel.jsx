import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { haptic, tapTick } from "../../lib/haptics.js";
import { playSound } from "../../lib/sound.js";

export const WHEEL_ITEM = 44;
const ROWS = 5;
const CENTER = (ROWS - 1) / 2;
const easeOut = k => 1 - (1 - k) ** 3;

/* A ticker wheel. It moves only up and down (it owns its touches, so the
   page and the sides never move with it), follows the finger value by
   value, carries a flick's momentum, and settles on the value in the band.
   Every value it passes clicks (the "detent" sound; a short vibration on
   Android). iPhone's haptic tick only fires from a tap or a finger lift, so
   it ticks as you touch it and as you let go. Tap a row above or below the
   band to step to it; arrow keys and a mouse wheel step it too. */
export function Wheel({ items, value, onChange, label, className = "" }) {
  const box = useRef(null);
  const index = Math.max(0, items.findIndex(item => item.value === value));
  const [live, setLive] = useState(index);
  const pos = useRef(index), liveRef = useRef(index), drag = useRef(null), anim = useRef(0), busy = useRef(false);
  const last = items.length - 1;

  const paint = p => {
    pos.current = p;
    box.current?.style.setProperty("--pos", p.toFixed(3));
    const at = Math.max(0, Math.min(last, Math.round(p)));
    if (at !== liveRef.current) {
      liveRef.current = at;
      setLive(at);
      playSound("detent", { bus:"you" });
      haptic("retract");
    }
  };
  /* follow the value from outside (a saved guess, a day the month removed) */
  useLayoutEffect(() => {
    if (busy.current) return;
    cancelAnimationFrame(anim.current);
    pos.current = index; liveRef.current = index; setLive(index);
    box.current?.style.setProperty("--pos", String(index));
  }, [index, items.length]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const settle = target => {
    const to = Math.max(0, Math.min(last, target));
    const from = pos.current;
    const ms = Math.min(520, 160 + Math.abs(to - from) * 55);
    const began = performance.now();
    busy.current = true;
    cancelAnimationFrame(anim.current);
    const step = () => {
      const k = Math.min(1, (performance.now() - began) / ms);
      paint(from + (to - from) * easeOut(k));
      if (k < 1) anim.current = requestAnimationFrame(step);
      else {
        busy.current = false;
        if (items[to] && items[to].value !== value) onChange(items[to].value);
      }
    };
    step();
  };

  const onPointerDown = event => {
    if (event.button !== undefined && event.button !== 0) return;
    cancelAnimationFrame(anim.current);
    busy.current = true;
    box.current?.setPointerCapture?.(event.pointerId);
    drag.current = { y:event.clientY, from:pos.current, moved:false, samples:[{ y:event.clientY, t:performance.now() }] };
    tapTick();
  };
  const onPointerMove = event => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    let p = d.from - dy / WHEEL_ITEM;
    /* a little give past either end */
    if (p < 0) p = p / 3;
    if (p > last) p = last + (p - last) / 3;
    paint(p);
    d.samples.push({ y:event.clientY, t:performance.now() });
    if (d.samples.length > 5) d.samples.shift();
  };
  const onPointerUp = event => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    tapTick();
    if (!d.moved) {
      /* a tap on a row: step to it */
      const rect = box.current.getBoundingClientRect();
      const row = Math.floor((event.clientY - rect.top) / WHEEL_ITEM) - CENTER;
      settle(Math.round(pos.current) + row);
      return;
    }
    const first = d.samples[0], end = d.samples[d.samples.length - 1];
    const velocity = end.t > first.t ? -(end.y - first.y) / WHEEL_ITEM / (end.t - first.t) : 0; // items per ms
    settle(Math.round(pos.current + velocity * 180));
  };
  const onKey = event => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      settle(Math.round(pos.current) + (event.key === "ArrowUp" ? -1 : 1));
    }
  };
  const onWheel = event => { event.preventDefault?.(); settle(Math.round(pos.current) + Math.sign(event.deltaY)); };

  return <div className={`fd-wheel${className ? ` ${className}` : ""}`}>
    <div ref={box} className="fd-wheel-scroll" tabIndex={0} role="spinbutton" aria-label={label}
      aria-valuetext={items[live]?.label} onKeyDown={onKey} onWheel={onWheel}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ "--pos":String(index) }}>
      <div className="fd-wheel-track">
        {items.map((item, i) => <div key={item.value} className={`fd-wheel-item${i === live ? " is-live" : ""}`}
          style={{ "--i":i }} aria-hidden="true">{item.label}</div>)}
      </div>
    </div>
  </div>;
}
