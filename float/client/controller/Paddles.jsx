/* The two paddles: each half of the screen is one, its blade in the rider's
   colour. Drawing only: the input (usePaddleInput) drives these through the
   handle, straight on the DOM, so a thumb never waits for React.

     down(side, point)        a thumb lands: the water lights under it
     drag(side, point, pull)  the blade follows the pull down, 1:1
     judge(side, point, q)    the beat's call, stamped over the thumb
                              (Perfect gold and biggest, Good white, Early,
                              Late and Too fast red and smaller); returns
                              the stamp
     restamp(stamp, q)        the call moved (a stroke that fired first took
                              the beat): the same stamp, the new word
     restampLast(q)           the room's word on the last call, while it shows
     dropStamp(stamp)         the touch only rested: its call fades
     stroke(side, p, off)     a stroke: the blade pulls through, the water
                              rushes past and splashes, harder with p; off
                              the beat it is foam
     up(side)                 the thumb comes off: the blade swings back
     next(side, urge)         the other paddle glints: alternate to go straight

   Each paddle has a rim the beat lights (RaceScreen's pulse animates it).
   Everything that moves is a transform or an opacity, and nothing moves on
   its own: the water is still until you paddle, so a phone spends its
   frames on your thumbs. */
import React, { forwardRef, memo, useImperativeHandle, useRef } from "react";
import { stampOfQ } from "./rhythm.js";

const SIDES = ["L", "R"];
const LINE_PX = 48;
/* the stamp sits this far over the thumb (content px), clear of it, inside the paddle */
const STAMP_LIFT = 84, STAMP_HALF_W = 74, STAMP_HALF_H = 40;
const STAMP_MS = 760;
const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };
const translateYOf = el => {
  try {
    const m = getComputedStyle(el).transform;
    if (!m || m === "none") return 0;
    const v = m.match(/matrix(3d)?\(([^)]+)\)/);
    const n = v ? v[2].split(",").map(Number) : [];
    return (v?.[1] ? n[13] : n[5]) || 0;
  } catch { return 0; }
};

/* a stamp's word and weight */
const paint = (el, q) => {
  const look = stampOfQ(q);
  el.className = `flc-mark is-${look.tone} is-${q}`;
  el.firstChild.textContent = look.text;
};
/* the word pops in over the thumb, floats up a little and goes */
const pop = (el, { again = false } = {}) => {
  const word = el.firstChild;
  if (!word || typeof word.animate !== "function") { el.remove(); return; }
  word.getAnimations?.().forEach(a => a.cancel());
  const still = reducedMotion();
  const out = "cubic-bezier(0.2, 0.8, 0.3, 1)";
  const frames = still
    ? [{ opacity:0 }, { opacity:1, offset:0.08 }, { opacity:1, offset:0.75 }, { opacity:0 }]
    : [{ transform:`translateY(6px) scale(${again ? 0.85 : 0.55})`, opacity:again ? 1 : 0, easing:out },
      { transform:"translateY(0) scale(1.12)", opacity:1, offset:0.14, easing:"ease-out" },
      { transform:"translateY(-4px) scale(1)", opacity:1, offset:0.28, easing:"linear" },
      { transform:"translateY(-16px) scale(1)", opacity:1, offset:0.72, easing:"ease-in" },
      { transform:"translateY(-26px) scale(0.96)", opacity:0 }];
  const life = word.animate(frames, { duration:STAMP_MS, fill:"forwards" });
  life.onfinish = () => el.remove();
};
const fade = (el, ms = 140) => {
  if (!el?.isConnected || el.dataset.gone) return;
  el.dataset.gone = "1";
  if (typeof el.animate !== "function") { el.remove(); return; }
  el.animate([{ opacity:1 }, { opacity:0 }], { duration:ms, fill:"forwards" }).onfinish = () => el.remove();
};

function PaddleArt({ side }) {
  const shade = `flc-shade-${side}`;
  return <svg className="flc-paddle-art" viewBox="0 0 80 320" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={shade}><stop offset="0" stopColor="#000" stopOpacity="0.42" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx={side === "L" ? 46 : 34} cy="270" rx="40" ry="50" fill={`url(#${shade})`} />
    <rect className="flc-paddle-wood" x="20" y="4" width="40" height="17" rx="8.5" />
    <rect className="flc-paddle-wood" x="34.5" y="12" width="11" height="186" rx="5.5" />
    <rect className="flc-paddle-shine" x="37" y="20" width="3" height="170" rx="1.5" />
    <path className="flc-paddle-blade" d="M40 186 C 67 192 75 230 69 262 C 64 287 52 297 40 297 C 28 297 16 287 11 262 C 5 230 13 192 40 186 Z" />
    <path className="flc-paddle-gloss" d="M26 212 C 22 234 24 260 33 281" />
    <rect className="flc-paddle-collar" x="33" y="182" width="14" height="16" rx="5" />
  </svg>;
}

const Zone = forwardRef(function Zone({ side }, ref) {
  return <div ref={ref} className={`flc-zone is-${side}`} data-side={side}>
    <div className="flc-water" aria-hidden="true"><i className="flc-lines" /></div>
    <div className="flc-touch" aria-hidden="true" />
    <div className="flc-paddle" aria-hidden="true">
      <div className="flc-paddle-pull"><div className="flc-paddle-tilt"><PaddleArt side={side} /><i className="flc-glint" /></div></div>
    </div>
    <div className="flc-splashes" aria-hidden="true" />
    <i className="flc-rim" aria-hidden="true" />
    <div className="flc-stamps" aria-hidden="true" />
  </div>;
});

function Paddles(_props, handle) {
  const zones = { L:useRef(null), R:useRef(null) };
  const nextTimer = useRef(null);
  const lastStamp = useRef(null);
  const part = (side, selector) => zones[side].current?.querySelector(selector) || null;

  useImperativeHandle(handle, () => {
    const offsetIn = side => {
      const zone = zones[side].current;
      let x = 0, y = 0, el = zone;
      const stop = zone?.closest(".flc-frame");
      while (el && el !== stop) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      return { x, y, w:zone?.clientWidth || 0, h:zone?.clientHeight || 0 };
    };
    const local = (side, point) => {
      const o = offsetIn(side);
      return { x:point.x - o.x, y:point.y - o.y, w:o.w, h:o.h };
    };
    const splash = (side, p, at, off = false) => {
      const layer = part(side, ".flc-splashes");
      if (!layer || typeof layer.animate !== "function") return;
      const ring = document.createElement("span");
      ring.className = `flc-ripple${off ? " is-off" : ""}`;
      const burst = document.createElement("span");
      burst.className = `flc-burst${off ? " is-off" : ""}`;
      for (let k = 0; k < 6; k++) burst.appendChild(document.createElement("i"));
      layer.append(ring, burst);
      const still = reducedMotion();
      const size = 0.55 + 0.75 * p;
      const place = `translate(${at.x}px, ${at.y}px)`;
      ring.animate([{ transform:`${place} scale(${still ? size : 0.25})`, opacity:0.9 }, { transform:`${place} scale(${size * 1.25})`, opacity:0 }],
        { duration:still ? 260 : 520, easing:"cubic-bezier(0.23, 1, 0.32, 1)" }).onfinish = () => ring.remove();
      burst.animate([{ transform:`${place} scale(${still ? size : 0.3}) rotate(0deg)`, opacity:1 },
        { transform:`${place} scale(${size * (still ? 1 : 1.35)}) rotate(${side === "L" ? -18 : 18}deg)`, opacity:0 }],
        { duration:still ? 220 : 430, easing:"cubic-bezier(0.23, 1, 0.32, 1)" }).onfinish = () => burst.remove();
      while (layer.childElementCount > 12) layer.firstElementChild?.remove();
    };
    /* the water rushes past the paddle: further for a harder stroke, from wherever it is now */
    const rush = (side, p) => {
      const lines = part(side, ".flc-lines");
      if (!lines || typeof lines.animate !== "function" || reducedMotion()) return;
      const from = ((translateYOf(lines) % LINE_PX) + LINE_PX) % LINE_PX;
      const to = from + 18 + 54 * p;
      lines.getAnimations?.().forEach(a => a.cancel());
      lines.style.transform = `translateY(${to % LINE_PX}px)`;
      lines.animate([{ transform:`translateY(${from}px)` }, { transform:`translateY(${to}px)` }],
        { duration:520 + 220 * p, easing:"cubic-bezier(0.16, 1, 0.3, 1)" });
    };
    const restamp = (stamp, q) => {
      if (!stamp?.isConnected || stamp.dataset.gone || !stamp.firstChild) return;
      paint(stamp, q);
      pop(stamp, { again:true });
    };
    return {
      down(side, point) {
        const zone = zones[side].current, glow = part(side, ".flc-touch");
        if (!zone || !glow) return;
        const at = local(side, point);
        glow.style.transform = `translate(${at.x}px, ${at.y}px)`;
        zone.classList.add("is-down");
        part(side, ".flc-paddle-pull")?.classList.add("is-held");
      },
      drag(side, point, pull) {
        if (!side) return;
        const glow = part(side, ".flc-touch"), blade = part(side, ".flc-paddle-pull");
        if (point && glow) { const at = local(side, point); glow.style.transform = `translate(${at.x}px, ${at.y}px)`; }
        if (blade && !reducedMotion()) {
          const h = zones[side].current?.clientHeight || 0;
          blade.style.transform = `translateY(${Math.max(0, Math.min(h * 0.24, pull))}px)`;
        }
      },
      judge(side, point, q) {
        const zone = zones[side].current, layer = part(side, ".flc-stamps");
        if (!zone || !layer) return null;
        const w = zone.clientWidth, h = zone.clientHeight;
        const at = point ? local(side, point) : { x:w / 2, y:h * 0.62 };
        /* the newest call is the one to read */
        for (const old of [...layer.children]) fade(old, 120);
        const stamp = document.createElement("span");
        stamp.appendChild(document.createElement("b"));
        paint(stamp, q);
        const x = Math.max(STAMP_HALF_W, Math.min(w - STAMP_HALF_W, at.x));
        const over = at.y - STAMP_LIFT;
        const y = Math.max(STAMP_HALF_H, Math.min(h - STAMP_HALF_H, over >= STAMP_HALF_H ? over : at.y + STAMP_LIFT));
        stamp.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        layer.appendChild(stamp);
        pop(stamp);
        lastStamp.current = stamp;
        return stamp;
      },
      restamp,
      restampLast(q) { restamp(lastStamp.current, q); },
      dropStamp(stamp) { fade(stamp); },
      stroke(side, p, off = false) {
        const zone = zones[side].current, blade = part(side, ".flc-paddle-pull"), paddle = part(side, ".flc-paddle");
        if (!zone || !blade || !paddle) return;
        const o = offsetIn(side);
        /* the blade's tip at rest: 92% down the paddle, swung outward by its 14 degree tilt about 30% down */
        const h = blade.offsetHeight, out = Math.sin(14 * Math.PI / 180) * 0.62 * h;
        const tip = { x:paddle.offsetLeft + blade.offsetLeft + blade.offsetWidth / 2 + (side === "L" ? -out : out),
          y:paddle.offsetTop + blade.offsetTop + h * 0.92 };
        splash(side, p, { x:tip.x, y:Math.min(o.h - 20, tip.y + o.h * (0.04 + 0.08 * p)) }, off);
        rush(side, p);
        zone.classList.remove("is-surge");
        void zone.offsetWidth;
        zone.classList.add("is-surge");
        if (!reducedMotion() && typeof blade.animate === "function") {
          const from = blade.style.transform || "translateY(0px)";
          const reach = o.h * (0.1 + 0.14 * p);
          blade.style.transform = "translateY(0px)";
          blade.animate([{ transform:from }, { transform:`translateY(${reach}px)`, offset:0.3 }, { transform:"translateY(0px)" }],
            { duration:320 + 140 * p, easing:"cubic-bezier(0.33, 1, 0.68, 1)" });
        }
      },
      up(side) {
        const zone = zones[side].current, blade = part(side, ".flc-paddle-pull");
        zone?.classList.remove("is-down");
        if (blade) { blade.classList.remove("is-held"); blade.style.transform = "translateY(0px)"; }
      },
      next(side, urge = false) {
        for (const s of SIDES) zones[s].current?.classList.remove("is-next", "is-urge");
        clearTimeout(nextTimer.current);
        const zone = zones[side].current;
        if (!zone) return;
        void zone.offsetWidth;
        zone.classList.add("is-next");
        if (urge) zone.classList.add("is-urge");
        nextTimer.current = setTimeout(() => zone.classList.remove("is-next", "is-urge"), urge ? 1400 : 700);
      },
      clear() { for (const s of SIDES) this.up(s); },
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="flc-zones">
    <Zone ref={zones.L} side="L" />
    <Zone ref={zones.R} side="R" />
  </div>;
}

export default memo(forwardRef(Paddles));
