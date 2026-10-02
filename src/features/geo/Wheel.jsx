import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tapTick } from "../../lib/haptics.js";

export const WHEEL_ITEM = 44;

/* An iOS-style wheel: a column that scroll-snaps one item at a time, tilts
   its items away from the center, ticks under the thumb as each value
   passes, and settles on the one in the band. Tap an item to spin to it;
   arrow keys step it. */
export function Wheel({ items, value, onChange, label, className = "" }) {
  const box = useRef(null);
  const index = Math.max(0, items.findIndex(item => item.value === value));
  const [live, setLive] = useState(index);
  const liveRef = useRef(index), settle = useRef(null), frame = useRef(0), touched = useRef(false);

  /* follow the value from outside (a saved guess, a day the month removed) */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || touched.current) return;
    el.scrollTop = index * WHEEL_ITEM;
    el.style.setProperty("--pos", String(index));
    liveRef.current = index; setLive(index);
  }, [index, items.length]);

  useEffect(() => () => { clearTimeout(settle.current); cancelAnimationFrame(frame.current); }, []);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const pos = el.scrollTop / WHEEL_ITEM;
      el.style.setProperty("--pos", pos.toFixed(3));
      const at = Math.max(0, Math.min(items.length - 1, Math.round(pos)));
      if (at !== liveRef.current) { liveRef.current = at; setLive(at); tapTick(); }
    });
    touched.current = true;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      touched.current = false;
      const at = liveRef.current;
      if (items[at] && items[at].value !== value) onChange(items[at].value);
    }, 110);
  };
  const spinTo = at => {
    const el = box.current;
    if (!el || !items[at]) return;
    el.scrollTo({ top:at * WHEEL_ITEM, behavior:"smooth" });
  };
  const onKey = event => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      spinTo(Math.max(0, Math.min(items.length - 1, liveRef.current + (event.key === "ArrowUp" ? -1 : 1))));
    }
  };
  return <div className={`fd-wheel${className ? ` ${className}` : ""}`}>
    <div ref={box} className="fd-wheel-scroll" onScroll={onScroll} tabIndex={0} role="spinbutton"
      aria-label={label} aria-valuetext={items[live]?.label} onKeyDown={onKey}
      style={{ "--pos":String(index) }}>
      {items.map((item, i) => <div key={item.value} className={`fd-wheel-item${i === live ? " is-live" : ""}`}
        style={{ "--i":i }} onClick={() => spinTo(i)} aria-hidden="true">{item.label}</div>)}
    </div>
  </div>;
}
