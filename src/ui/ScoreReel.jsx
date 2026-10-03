import React, { useEffect, useLayoutEffect, useRef } from "react";
import { playSound } from "../lib/sound.js";
import { tapTick } from "../lib/haptics.js";
import { prefersReducedMotion } from "../lib/motion.js";
import "./backglass.css";

/* A score reel: each digit sits on its own drum and rolls to its value, the
   way an electromechanical backglass counts. Give it the number on screen
   (useCountUp's value while a count runs) and each changed drum turns; the
   hundreds drum spins through a count, the higher drums click over once.
   Drums are keyed from the right so a number that gains a digit keeps its
   ones, tens and hundreds drums in place. Reduced motion shows the number.

   Two cuts of the same reel:
   - default: a flat strip behind each window, for every chip count that is
     not the hero (calm, roomy windows; backglass.css .fd-reel).
   - `drum`: hero numbers only (your own count in the You strip, the
     champion, a scene's one big number). Each digit is a real cylinder,
     ten faces set round a rotateX ring, the window showing the front face
     with the drum's curvature shading it. A count rolls each drum forward
     (never the long way round) with momentum and a short settle.
   - `spin` (with drum): your own reel can be flicked. A vertical flick
     spins every drum by the flick's speed; they land left to right back on
     the same number, each with the relay's dry click. Whole turns only, so
     it never shows a number that is not yours. */
const DIGITS = "0123456789";
/* the relay: one dry click as each counted step lands. Only while `clack`
   is true, which callers pass from useCountUp's `counting` (a fresh count),
   so a load, reconnect or catch-up that just shows a number never clicks. */
const CLACK_GAP_MS = 45;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();

/* ── drum math (pure, exported for tests) ── */
export const DRUM = Object.freeze({
  faceDeg:36,          // ten faces round the ring
  radius:1.5388,       // ring radius per face height: 1 / (2 tan 18deg)
  rollMs:260,          // one digit
  perStepMs:55,        // each further digit adds momentum
  maxRollMs:900,
  spinMs:720,          // a flicked drum's spin, plus a stagger per drum
  spinStaggerMs:150,
  maxTurns:3,
  flickPx:14,          // vertical travel before a press is a flick
});
/* The turn from one digit to the next, in faces: forward (up) for a
   number that grew, backward for one that fell, never the long way. */
export function drumSteps(from, to, direction) {
  const a = Number(from) || 0, b = Number(to) || 0;
  if (a === b) return 0;
  return direction < 0 ? -((a - b + 10) % 10) : (b - a + 10) % 10;
}
export const drumRollMs = steps => Math.min(DRUM.maxRollMs, DRUM.rollMs + Math.max(0, Math.abs(steps) - 1) * DRUM.perStepMs);
/* Whole turns for a flick of `speed` px/ms: at least one, at most three. */
export const flickTurns = speed => Math.max(1, Math.min(DRUM.maxTurns, Math.round(Math.abs(Number(speed) || 0) * 1.6)));

/* One drum. Its angle accumulates (a count of 90 to 100 rolls the tens
   drum forward one face, not back nine) and is written to the element in
   a layout effect, so a StrictMode double render never turns it twice. */
function DrumDigit({ digit, value, register, index }) {
  const ref = useRef(null);
  const st = useRef(null);
  if (!st.current) st.current = { digit, value, angle:Number(digit) * DRUM.faceDeg, timers:[], placed:false };
  useIsoLayoutEffect(() => {
    const el = ref.current, s = st.current;
    if (!el) return;
    if (!s.placed) {
      /* placed, not rolled, on mount */
      s.placed = true;
      el.style.transition = "none";
      el.style.setProperty("--a", `${s.angle}deg`);
      void el.offsetWidth;
      el.style.removeProperty("transition");
      return;
    }
    /* the whole number's change sets the way: a count up rolls forward,
       a loss rolls back */
    const direction = value < s.value ? -1 : 1;
    s.value = value;
    if (s.digit === digit) return;
    const steps = drumSteps(s.digit, digit, direction);
    s.digit = digit;
    s.angle += steps * DRUM.faceDeg;
    el.style.setProperty("--drum-ms", `${drumRollMs(steps)}ms`);
    el.style.setProperty("--a", `${s.angle}deg`);
  }, [digit, value]);
  useEffect(() => {
    if (!register) return undefined;
    return register(index, {
      spin(turns, delay, duration, sign) {
        const el = ref.current, s = st.current;
        if (!el) return;
        s.angle += sign * turns * 360;
        el.style.setProperty("--drum-ms", `${duration}ms`);
        el.style.setProperty("--drum-delay", `${delay}ms`);
        el.style.setProperty("--drum-ease", "var(--ease-drum-spin)");
        el.style.setProperty("--a", `${s.angle}deg`);
        /* the click lands as the drum reaches its face, before the settle */
        s.timers.push(setTimeout(() => playSound("detent", { bus:"you" }), delay + duration * .78));
        s.timers.push(setTimeout(() => {
          el.style.removeProperty("--drum-delay");
          el.style.removeProperty("--drum-ease");
        }, delay + duration + 40));
      },
    });
  }, [register, index]);
  useEffect(() => () => st.current?.timers.forEach(clearTimeout), []);
  const cur = String(digit);
  return <span className="fd-drum" ref={ref}>
    {[...DIGITS].map((d, i) => <span key={d} className={`fd-drum-face${d === cur ? " is-current" : ""}`}
      style={{ "--i":i }}>{d}</span>)}
  </span>;
}

export function ScoreReel({ value, tone = null, label = null, className = "", clack = false, drum = false, spin = false }) {
  const n = Number(value) || 0;
  const last = useRef({ value:n, at:0 });
  useEffect(() => {
    const prev = last.current;
    if (prev.value === n) return;
    const at = now();
    if (clack && at - prev.at >= CLACK_GAP_MS) {
      playSound("detent", { bus:"you" });
      last.current = { value:n, at };
    } else last.current = { value:n, at:prev.at };
  }, [n, clack]);
  /* the flick: drums register by their position from the left */
  const drums = useRef(new Map());
  const register = useRef((index, api) => {
    drums.current.set(index, api);
    return () => { if (drums.current.get(index) === api) drums.current.delete(index); };
  }).current;
  const flick = useRef(null);
  const spinnable = drum && spin;
  const text = `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`;
  const cells = [...text];
  const spinAll = (speed, sign) => {
    const order = [...drums.current.keys()].sort((a, b) => a - b);
    const turns = flickTurns(speed);
    order.forEach((index, at) => drums.current.get(index)?.spin(turns + (at > 1 ? 1 : 0),
      at * DRUM.spinStaggerMs, DRUM.spinMs + at * DRUM.spinStaggerMs, sign));
  };
  const handlers = spinnable ? {
    onPointerDown:event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      flick.current = { id:event.pointerId, y:event.clientY, t:now(), spun:false };
    },
    onPointerMove:event => {
      const f = flick.current;
      if (!f || f.id !== event.pointerId || f.spun) return;
      const dy = event.clientY - f.y;
      if (Math.abs(dy) < DRUM.flickPx) return;
      f.spun = true;
      if (prefersReducedMotion()) return;
      tapTick();
      /* a flick down turns the drums the way a count does: up and over */
      spinAll(Math.abs(dy) / Math.max(16, now() - f.t), dy > 0 ? 1 : -1);
    },
    onPointerUp:event => { if (flick.current?.id === event.pointerId && !flick.current.spun) flick.current = null; },
    onPointerCancel:() => { flick.current = null; },
    /* a flick is not a tap on whatever the reel sits in */
    onClickCapture:event => {
      if (flick.current?.spun) { event.preventDefault(); event.stopPropagation(); }
      flick.current = null;
    },
  } : {};
  return (
    <span className={`fd-reel${drum ? " is-drum" : ""}${spinnable ? " is-spinnable" : ""}${tone ? ` is-${tone}` : ""}${className ? ` ${className}` : ""}`}
      role="img" aria-label={label ?? text} {...handlers}>
      {cells.map((ch, i) => {
        const key = cells.length - i;
        if (!/\d/.test(ch)) return <span className="fd-reel-sep" key={`s${key}`} aria-hidden="true">{ch}</span>;
        return <span className="fd-reel-cell" key={`d${key}`} aria-hidden="true">
          {drum
            ? <DrumDigit digit={ch} value={n} register={spinnable ? register : null} index={i} />
            : <span className="fd-reel-strip" style={{ "--d":ch }}>
                {[...DIGITS].map(d => <span key={d}>{d}</span>)}
              </span>}
          {/* sizes the cell to this digit's own width */}
          <span className="fd-reel-sizer">{ch}</span>
        </span>;
      })}
    </span>
  );
}

/* A ring of lamp bulbs chasing around whatever it sits in (position the
   parent relative). Tone picks the lamp; `color` lights it in a player's own
   identity color for their win. Static and lit under reduced motion. */
export function LampChase({ tone = "live", color = null, running = true, className = "" }) {
  return (
    <svg className={`fd-chase is-${tone}${running ? " is-running" : ""}${className ? ` ${className}` : ""}`}
      style={color ? { "--chase":color } : undefined} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100%" height="100%" pathLength="400" />
    </svg>
  );
}
