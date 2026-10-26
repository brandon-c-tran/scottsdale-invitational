/* The two paddles: each half of the screen is one, its blade in the rider's
   colour. Drawing only: the input (usePaddleInput) drives these through the
   handle, straight on the DOM, so a thumb never waits for React.

     down(side, point)       a thumb lands: the zone lights under it
     drag(side, point, pull) the blade follows the thumb down, 1:1
     stroke(side, p, point)  a stroke: the blade pulls through and splashes
     up(side)                the thumb comes off: the blade swings back
     next(side, urge)        the other paddle glints: alternate to go straight */
import React, { forwardRef, memo, useImperativeHandle, useRef } from "react";

const SIDES = ["L", "R"];
const reducedMotion = () => { try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };

function PaddleArt() {
  return <svg className="flc-paddle-art" viewBox="0 0 80 300" aria-hidden="true" focusable="false">
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
    <div className="flc-flow" aria-hidden="true" />
    <div className="flc-touch" aria-hidden="true" />
    <div className="flc-paddle" aria-hidden="true">
      <div className="flc-paddle-pull"><div className="flc-paddle-tilt"><PaddleArt /></div></div>
    </div>
    <div className="flc-splashes" aria-hidden="true" />
  </div>;
});

function Paddles(_props, handle) {
  const zones = { L:useRef(null), R:useRef(null) };
  const nextTimer = useRef(null);
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
    const splash = (side, p, at) => {
      const layer = part(side, ".flc-splashes");
      if (!layer || typeof layer.animate !== "function") return;
      const ring = document.createElement("span");
      ring.className = "flc-ripple";
      const burst = document.createElement("span");
      burst.className = "flc-burst";
      for (let k = 0; k < 6; k++) burst.appendChild(document.createElement("i"));
      layer.append(ring, burst);
      const still = reducedMotion();
      const size = 0.55 + 0.75 * p;
      const place = `translate(${at.x}px, ${at.y}px)`;
      ring.animate([{ transform:`${place} scale(${still ? size : 0.25})`, opacity:0.9 }, { transform:`${place} scale(${size * 1.25})`, opacity:0 }],
        { duration:still ? 260 : 520, easing:"cubic-bezier(0.23, 1, 0.32, 1)" }).onfinish = () => ring.remove();
      const drops = burst.animate([{ transform:`${place} scale(${still ? size : 0.3}) rotate(0deg)`, opacity:1 },
        { transform:`${place} scale(${size * (still ? 1 : 1.35)}) rotate(${side === "L" ? -18 : 18}deg)`, opacity:0 }],
        { duration:still ? 220 : 430, easing:"cubic-bezier(0.23, 1, 0.32, 1)" });
      drops.onfinish = () => burst.remove();
      while (layer.childElementCount > 12) layer.firstElementChild?.remove();
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
        const glow = part(side, ".flc-touch"), blade = part(side, ".flc-paddle-pull");
        const at = local(side, point);
        if (glow) glow.style.transform = `translate(${at.x}px, ${at.y}px)`;
        if (blade && !reducedMotion()) blade.style.transform = `translateY(${Math.max(0, Math.min(at.h * 0.26, pull))}px)`;
      },
      stroke(side, p) {
        const zone = zones[side].current, blade = part(side, ".flc-paddle-pull"), paddle = part(side, ".flc-paddle");
        if (!zone || !blade || !paddle) return;
        const o = offsetIn(side);
        /* the blade's tip at rest: 92% down the paddle, swung outward by its 14 degree tilt about 30% down */
        const h = blade.offsetHeight, out = Math.sin(14 * Math.PI / 180) * 0.62 * h;
        const tip = { x:paddle.offsetLeft + blade.offsetLeft + blade.offsetWidth / 2 + (side === "L" ? -out : out),
          y:paddle.offsetTop + blade.offsetTop + h * 0.92 };
        splash(side, p, { x:tip.x, y:Math.min(o.h - 20, tip.y + o.h * (0.06 + 0.08 * p)) });
        zone.classList.remove("is-surge");
        void zone.offsetWidth;
        zone.classList.add("is-surge");
        if (!reducedMotion() && typeof blade.animate === "function") {
          const from = blade.style.transform || "translateY(0px)";
          const reach = o.h * (0.12 + 0.16 * p);
          blade.style.transform = "translateY(0px)";
          blade.animate([{ transform:from }, { transform:`translateY(${reach}px)`, offset:0.35 }, { transform:"translateY(0px)" }],
            { duration:300 + 120 * p, easing:"cubic-bezier(0.33, 1, 0.68, 1)" });
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
