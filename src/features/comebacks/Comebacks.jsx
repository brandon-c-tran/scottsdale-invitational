/* What each side pays, and the drawing of why. Since Oct 13 that is the
   pool's price (a reel, "3.4×", the long shot lit amber: chips); a contest
   opened before pools keeps its fixed "Winner pays 2:1" and the underdog
   drawing. */
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UNDERDOG_GAP, UNDERDOG_MULT } from "../../../shared/core.js";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import "./comebacks.css";

/* A price as a tote reel: the tenths roll the short way when the money
   moves, the × a fixed plate after them. Bone at rest, amber for the long
   shot (the side an upset would pay). */
export function PriceLamp({ price, long = false, cap = false, size = "md", className = "", label = null, motion = "fresh" }) {
  const tenths = Math.round(Number(price) * 10) || 0;
  const text = `${(tenths / 10).toFixed(1)}×`;
  return <span className={`fd-price is-${size}${long ? " is-long" : cap ? " is-cap" : ""} ${className}`} role="img" aria-label={label || `Pays ${text}`}>
    <ScoreReel value={tenths} tenths slim={size !== "xl"} tone={long ? "chip" : null} motion={motion} label={text} />
    <span className="fd-price-x" aria-hidden="true">×</span>
  </span>;
}

/* one side's terms row: its price (a pool) or its fixed payout (a legacy
   contest with odds); an empty row keeps every card the same height. On a
   phone a price is a tap that draws how the pool pays. */
export function SideTerms({ terms, className = "", tv = false, style, size }) {
  const cls = `fd-side-terms${tv ? " is-tv" : ""} ${className}`;
  if (!terms) return <div className={cls} style={style} />;
  if (terms.price !== undefined) return <div className={cls} style={style}>
    {tv ? <PriceLamp price={terms.price} long={terms.long} cap={terms.cap} size={size || "lg"} />
      : <TeachTap kind="pool" label={`Pays ${terms.text}. How the pool pays`}>
        <PriceLamp price={terms.price} long={terms.long} cap={terms.cap} size={size || "md"} /></TeachTap>}
  </div>;
  return <div className={cls} style={style}>
    {terms.payLine && (terms.underdog && !tv ? <TeachTap kind="underdog" label={terms.payLine}>
      <span className="fd-side-pays is-underdog">{terms.payLine}</span></TeachTap>
      : <span className={`fd-side-pays${terms.underdog ? " is-underdog" : ""}`}>{terms.payLine}</span>)}
  </div>;
}

/* A payout as a control: the price (or the words) with a cyan info lamp
   beside it (cyan is the info lamp's job), and a tap lays the drawing over
   the board beside it (a popover on the page's one fixed layer, so no card
   changes size); a tap anywhere puts it away. The first pool (or underdog)
   this phone ever shows opens it once by itself, when the price is on screen
   and nothing covers it (TAUGHT_KEYS, per device). */
export const TAUGHT_KEYS = { pool:"si-pool-taught", underdog:"si-underdog-taught" };
export const TAUGHT_KEY = TAUGHT_KEYS.underdog;
const TEACH_AFTER_MS = 900;
let teaching = false;
const taught = kind => { try { return localStorage.getItem(TAUGHT_KEYS[kind]) === "yes"; } catch { return true; } };
const markTaught = kind => { try { localStorage.setItem(TAUGHT_KEYS[kind], "yes"); } catch {} };
export function TeachTap({ kind = "pool", label, children }) {
  const ref = useRef(null);
  const [at, setAt] = useState(null);
  const id = useId();
  /* it rides with the price through a scroll or a resize (the toolbar
     settling, a rotation), and goes away once it leaves the screen */
  const open = !!at;
  useEffect(() => {
    if (!open) return undefined;
    const follow = () => {
      const box = ref.current?.getBoundingClientRect();
      if (!box || box.bottom < 0 || box.top > window.innerHeight) { setAt(null); return; }
      setAt(current => { const spot = current && place(); return spot ? { ...current, ...spot } : current; });
    };
    window.addEventListener("scroll", follow, { passive:true, capture:true });
    window.addEventListener("resize", follow);
    return () => { window.removeEventListener("scroll", follow, { capture:true }); window.removeEventListener("resize", follow); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = () => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const width = Math.min(300, window.innerWidth - 32);
    const left = Math.max(16, Math.min(window.innerWidth - 16 - width, box.left + box.width / 2 - width / 2));
    const below = box.bottom + 8 + 190 < window.innerHeight;
    return { left, width, top:below ? box.bottom + 8 : null, bottom:below ? null : window.innerHeight - box.top + 8 };
  };
  /* once per device: open by itself when the price is on screen and on top
     (a sheet over the board, such as the event's announcement, waits: it
     checks again each second while the price is mounted) */
  useEffect(() => {
    if (typeof window === "undefined" || taught(kind)) return undefined;
    const timer = setInterval(() => {
      if (taught(kind)) { clearInterval(timer); return; }
      const node = ref.current;
      if (!node || teaching || document.visibilityState === "hidden") return;
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.top < 0 || box.bottom > window.innerHeight) return;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!hit || !(hit === node || node.contains(hit))) return;
      const spot = place();
      if (!spot) return;
      clearInterval(timer);
      teaching = true;
      markTaught(kind);
      setAt({ ...spot, taught:true });
    }, TEACH_AFTER_MS);
    return () => clearInterval(timer);
  }, [kind]);
  useEffect(() => () => { if (at?.taught) teaching = false; }, [at]);
  const toggle = event => {
    event.stopPropagation();
    if (at) { setAt(null); return; }
    markTaught(kind);
    const spot = place();
    if (spot) setAt(spot);
  };
  return <>
    <button type="button" ref={ref} className={`fd-side-pays-tap is-${kind}`} aria-expanded={!!at} aria-controls={at ? id : undefined}
      aria-label={label} onClick={toggle}>{children}<InfoLamp /></button>
    {at && typeof document !== "undefined" && createPortal(<div className="fd-underdog-layer" onClick={() => setAt(null)} role="presentation">
      <div id={id} className={`fd-underdog-pop${at.taught ? " is-taught" : ""}`}
        style={{ left:at.left, width:at.width, top:at.top ?? "auto", bottom:at.bottom ?? "auto" }}>
        {kind === "pool" ? <PoolExplainer /> : <UnderdogExplainer />}
      </div>
    </div>, document.body)}
  </>;
}

/* the info lamp: a small cyan ring with an "i" drawn in it */
function InfoLamp() {
  return <svg className="fd-info-lamp" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6.75" /><path d="M8 7.2v4.3" /><circle className="is-dot" cx="8" cy="4.7" r="1.1" />
  </svg>;
}

/* a chip tower in the drawing: n amber chips, the top face lit */
function Tower({ n, scale = 1 }) {
  const w = 36, t = 6, ry = 5, h = n * t + ry * 2 + 2;
  const chips = Array.from({ length:n }, (_, i) => {
    const y = h - ry - 1 - (i + 1) * t;
    return <path key={i} className="fd-ux-rim" d={`M2 ${y}v${t}a16 ${ry} 0 0 0 32 0v${-t}`} />;
  });
  return <svg className="fd-ux-tower" viewBox={`0 0 ${w} ${h}`} width={w * scale} height={h * scale} aria-hidden="true" focusable="false">
    {chips}<ellipse className="fd-ux-top" cx="18" cy={h - ry - 1 - n * t} rx="16" ry={ry} />
  </svg>;
}

/* The pool as a drawing: the two sides' chips standing under one brace,
   the whole pool lettered over it (600), each side's chips under its tower
   (400, 200) and what it pays, the pool over its own chips (1.5×, 3.0×,
   the short tower's lit amber). The TV draws it larger (`tv`). */
const POOL_EXAMPLE = [{ chips:400, n:6 }, { chips:200, n:2 }];
export function PoolExplainer({ className = "", tv = false }) {
  const total = POOL_EXAMPLE.reduce((sum, side) => sum + side.chips, 0);
  const scale = tv ? 1.6 : 1;
  const fmt = n => n.toLocaleString("en-US");
  return <figure className={`fd-pool-explain${tv ? " is-tv" : ""} ${className}`}
    aria-label={`Winners split the whole pool. ${fmt(total)} in the pool: ${fmt(POOL_EXAMPLE[0].chips)} on one side pays ${(total / POOL_EXAMPLE[0].chips).toFixed(1)} times, ${fmt(POOL_EXAMPLE[1].chips)} on the other pays ${(total / POOL_EXAMPLE[1].chips).toFixed(1)} times.`}>
    <span className="fd-px-total" aria-hidden="true"><small>Pool</small>{fmt(total)}</span>
    <svg className="fd-px-brace" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M4 14 V8 Q4 4 8 4 H92 Q100 4 100 0 Q100 4 108 4 H192 Q196 4 196 8 V14" /></svg>
    {POOL_EXAMPLE.map((side, i) => <span key={side.chips} className={`fd-ux-col${i === 1 ? " is-under" : ""}`} aria-hidden="true">
      <Tower n={side.n} scale={scale} />
      <small>{fmt(side.chips)}</small>
      <small className={i === 1 ? "fd-ux-pays" : "fd-px-pays"}>{(total / side.chips).toFixed(1)}×</small>
    </span>)}
  </figure>;
}

/* The underdog rule as a drawing (contests opened before pools), three
   labels: two sides' stacks standing apart, the gap between them measured
   (1,000+), the side ahead paying 1:1 and the side behind 2:1, lit amber. */
export function UnderdogExplainer({ className = "", tv = false }) {
  const gap = UNDERDOG_GAP.toLocaleString("en-US");
  const scale = tv ? 1.6 : 1;
  return <figure className={`fd-underdog-explain${tv ? " is-tv" : ""} ${className}`}
    aria-label={`When the two sides open ${gap} chips or more apart, the side behind pays ${UNDERDOG_MULT}:1 and the side ahead 1:1.`}>
    <span className="fd-ux-col"><Tower n={7} scale={scale} /><small>1:1</small></span>
    <span className="fd-ux-col is-gap">
      <svg className="fd-ux-measure" viewBox="0 0 24 40" aria-hidden="true" focusable="false">
        <path d="M12 3v34M6 9l6-6 6 6M6 31l6 6 6-6" /></svg>
      <small>{gap}+</small>
    </span>
    <span className="fd-ux-col is-under"><Tower n={2} scale={scale} /><small className="fd-ux-pays">{UNDERDOG_MULT}:1</small></span>
  </figure>;
}
