import React, { useEffect, useLayoutEffect, useRef } from "react";
import { playSound } from "../lib/sound.js";
import { tapTick } from "../lib/haptics.js";
import { prefersReducedMotion, useFreshChange, useReducedMotion } from "../lib/motion.js";
import { REEL, reelLanding, reelMotion, reelStep, reelStripFaces } from "./reelModel.js";
import "./backglass.css";

/* A score reel: each digit sits on its own drum and rolls to its value, the
   way an electromechanical backglass counts. Give it the number on screen
   (useCountUp's value while a count runs) and each changed window turns the
   short way (forward on a count up, back on a loss); the hundreds window
   spins through a count, the higher ones click over once. Windows are
   keyed from the right so a number that gains a digit keeps its ones, tens
   and hundreds windows in place. Reduced motion shows the number.

   THE RULE: a reel wherever a number lands or changes as a moment; plain
   numerals wherever people scan a list. A reel rolls only for a fresh
   change (`motion="fresh"`, the default: a live broadcast on a settled
   socket, and the count that follows it), so a load, reconnect, catch-up
   or correction shows the end state. A caller that already decided its
   moment is fresh (a receipt, a scene on the server clock) passes
   motion="always"; reduced motion never rolls.

   Two ways a reel moves:
   - live: the number changes while the reel is on screen (above).
   - landing (`from`): the number arrives with its moment and rolls in from
     `from` like an odometer (reelModel.js: low windows spin, high ones
     click over, left to right), starting `at` (a CSS time, so a scene on
     the server clock passes calc(var(--tl) + ...) and a late TV joins
     mid-roll).

   Two cuts of the same reel:
   - default: a flat strip behind each window, for every chip count that is
     not the hero (calm, roomy windows; backglass.css .fd-reel). `slim`
     tightens the windows for a narrow slot.
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
const cssTime = at => typeof at === "number" ? `${Math.round(at)}ms` : at || "0ms";
/* move without rolling: a change that is not a moment */
function place(el, prop, value) {
  el.style.transition = "none";
  el.style.setProperty(prop, value);
  void el.offsetWidth;
  el.style.removeProperty("transition");
}

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

/* One flat window: a strip of faces (0-9 repeated) behind it. Its index
   accumulates so a count of 90 to 100 turns the tens window forward one
   face, not back nine, and is written to the element in a layout effect,
   so a StrictMode double render never turns it twice. A landing window
   carries its roll in CSS (backglass.css fd-reel-land) and rests on its
   end index, which is also the reduced-motion end state. */
function StripDigit({ digit, value, live, land, faces }) {
  const ref = useRef(null);
  const st = useRef(null);
  if (!st.current) {
    const index = land ? land.end : REEL.band + Number(digit);
    st.current = { digit, value, index, init:index };
  }
  useIsoLayoutEffect(() => {
    const el = ref.current, s = st.current;
    const prev = s.value;
    s.value = value;
    if (!el || s.digit === digit) return;
    if (!live) {
      s.index = REEL.band + Number(digit);
      s.digit = digit;
      place(el, "--d", s.index);
      return;
    }
    const step = reelStep(s.index, s.digit, digit, value < prev ? -1 : 1, faces);
    if (step.snapped) place(el, "--d", step.from);
    el.style.setProperty("--strip-ms", `${drumRollMs(step.steps)}ms`);
    el.style.setProperty("--d", step.to);
    s.index = step.to;
    s.digit = digit;
  }, [digit, value]);
  const rolling = !!land?.faces;
  const style = { "--d":st.current.init };
  if (rolling) Object.assign(style, { "--s":land.start, "--e":land.end, "--land-ms":`${land.ms}ms`,
    "--land-delay":`${land.delay}ms`, "--ov":(land.end > land.start ? 1 : -1) * REEL.overshoot });
  return <span ref={ref} className={`fd-reel-strip${rolling ? " is-rolling" : ""}`} style={style}>
    {Array.from({ length:faces }, (_, i) => <span key={i}>{i % 10}</span>)}
  </span>;
}

/* One drum. Its angle accumulates (a count of 90 to 100 rolls the tens
   drum forward one face, not back nine) and is written to the element in
   a layout effect, so a StrictMode double render never turns it twice. A
   landing drum rests on its last face and carries its spin from the first
   in CSS (backglass.css fd-drum-land), like a flat window. */
function DrumDigit({ digit, value, live, land, register, index }) {
  const ref = useRef(null);
  const st = useRef(null);
  if (!st.current) st.current = { digit, value, angle:(land ? land.end : Number(digit)) * DRUM.faceDeg, timers:[], placed:false };
  useIsoLayoutEffect(() => {
    const el = ref.current, s = st.current;
    if (!el) return;
    if (!s.placed) {
      /* placed, not rolled, on mount */
      s.placed = true;
      place(el, "--a", `${s.angle}deg`);
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
    if (!live) { place(el, "--a", `${s.angle}deg`); return; }
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
  const rolling = !!land?.faces;
  return <span className={`fd-drum${rolling ? " is-rolling" : ""}`} ref={ref} style={rolling ? { "--a0":`${land.start * DRUM.faceDeg}deg`,
    "--land-ms":`${land.ms}ms`, "--land-delay":`${land.delay}ms` } : undefined}>
    {[...DIGITS].map((d, i) => <span key={d} className={`fd-drum-face${d === cur ? " is-current" : ""}`}
      style={{ "--i":i }}>{d}</span>)}
  </span>;
}

export function ScoreReel({ value, tone = null, label = null, className = "", clack = false, drum = false, spin = false,
  motion = "fresh", from = null, at = 0, landKey = null, slim = false }) {
  const n = Number(value) || 0;
  const reduced = useReducedMotion();
  /* the fresh gate: a change carried by a fresh frame opens a short window
     in which this reel rolls (the count that follows the frame runs inside
     it); any other change is placed */
  const change = useFreshChange(n);
  const liveUntil = useRef(0);
  const gate = reelMotion({ motion, reduced, animate:change.animate, now:now(), liveUntil:liveUntil.current });
  liveUntil.current = gate.liveUntil;
  const live = gate.live;
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
  /* a landing is fixed when it mounts (or when its key changes) */
  const landing = useRef(null);
  const landId = String(landKey ?? "");
  if (from === null || from === undefined) landing.current = null;
  else if (!landing.current || landing.current.id !== landId) {
    const cells = reelLanding(from, n);
    landing.current = { id:landId, cells, faces:reelStripFaces(cells) };
  }
  const land = landing.current;
  const spinnable = drum && spin;
  const text = `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`;
  const cells = [...text];
  const digitCount = cells.filter(ch => /\d/.test(ch)).length;
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
  const style = land ? { "--land-at":cssTime(at) } : undefined;
  let digitAt = -1;
  return (
    <span className={`fd-reel${drum ? " is-drum" : ""}${spinnable ? " is-spinnable" : ""}${tone ? ` is-${tone}` : ""}${
      slim ? " is-slim" : ""}${land ? " is-landing" : ""}${className ? ` ${className}` : ""}`}
      role="img" aria-label={label ?? text} style={style} {...handlers}>
      {cells.map((ch, i) => {
        const key = `${land ? `${landId}:` : ""}${cells.length - i}`;
        if (!/\d/.test(ch)) return <span className="fd-reel-sep" key={`s${key}`} aria-hidden="true">{ch}</span>;
        digitAt += 1;
        /* a landing's windows line up with the value's digits; a digit
           the value gained later is a live window */
        const cell = land && land.cells.length === digitCount ? land.cells[digitAt] : null;
        return <span className="fd-reel-cell" key={`d${key}`} aria-hidden="true">
          {drum
            ? <DrumDigit digit={ch} value={n} live={live} land={cell} register={spinnable ? register : null} index={i} />
            : <StripDigit digit={ch} value={n} live={live} land={cell} faces={land ? land.faces : REEL.faces} />}
          {/* sizes every window alike (a 0's width), so a digit rolling
              over never changes the number's width */}
          <span className="fd-reel-sizer">0</span>
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
