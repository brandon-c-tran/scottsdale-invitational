/* Each side's payout when a contest carries underdog odds, and the drawing
   of that rule. Amber: chips. */
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UNDERDOG_GAP, UNDERDOG_MULT } from "../../../shared/core.js";
import "./comebacks.css";

/* one side's terms row: its payout (when the contest carries odds); an
   empty row keeps every card the same height. On a phone the underdog's
   "Winner pays 2:1" is a tap that draws why. */
export function SideTerms({ terms, className = "", tv = false, style }) {
  const cls = `fd-side-terms${tv ? " is-tv" : ""} ${className}`;
  if (!terms) return <div className={cls} style={style} />;
  return <div className={cls} style={style}>
    {terms.payLine && (terms.underdog && !tv ? <UnderdogPays line={terms.payLine} />
      : <span className={`fd-side-pays${terms.underdog ? " is-underdog" : ""}`}>{terms.payLine}</span>)}
  </div>;
}

/* the underdog's payout as a control: the words with a cyan info lamp
   beside them (cyan is the info lamp's job), and a tap lays the drawing over
   the board beside it (a popover on the page's one fixed layer, so no card
   changes size); a tap anywhere puts it away. The first underdog this phone
   ever shows opens it once by itself, when the words are on screen and
   nothing covers them (TAUGHT_KEY, per device). */
export const TAUGHT_KEY = "si-underdog-taught";
const TEACH_AFTER_MS = 900;
let teaching = false;
const taught = () => { try { return localStorage.getItem(TAUGHT_KEY) === "yes"; } catch { return true; } };
const markTaught = () => { try { localStorage.setItem(TAUGHT_KEY, "yes"); } catch {} };
function UnderdogPays({ line }) {
  const ref = useRef(null);
  const [at, setAt] = useState(null);
  const id = useId();
  /* it rides with the words through a scroll or a resize (the toolbar
     settling, a rotation), and goes away once they leave the screen */
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
    const below = box.bottom + 8 + 170 < window.innerHeight;
    return { left, width, top:below ? box.bottom + 8 : null, bottom:below ? null : window.innerHeight - box.top + 8 };
  };
  /* once per device: open by itself when the words are on screen and on
     top (a sheet over the board, such as the event's announcement, waits:
     it checks again each second while the words are mounted) */
  useEffect(() => {
    if (typeof window === "undefined" || taught()) return undefined;
    const timer = setInterval(() => {
      if (taught()) { clearInterval(timer); return; }
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
      markTaught();
      setAt({ ...spot, taught:true });
    }, TEACH_AFTER_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => () => { if (at?.taught) teaching = false; }, [at]);
  const toggle = event => {
    event.stopPropagation();
    if (at) { setAt(null); return; }
    markTaught();
    const spot = place();
    if (spot) setAt(spot);
  };
  return <>
    <button type="button" ref={ref} className="fd-side-pays is-underdog fd-side-pays-tap" aria-expanded={!!at} aria-controls={at ? id : undefined}
      onClick={toggle}>{line}<InfoLamp /></button>
    {at && typeof document !== "undefined" && createPortal(<div className="fd-underdog-layer" onClick={() => setAt(null)} role="presentation">
      <div id={id} className={`fd-underdog-pop${at.taught ? " is-taught" : ""}`}
        style={{ left:at.left, width:at.width, top:at.top ?? "auto", bottom:at.bottom ?? "auto" }}>
        <UnderdogExplainer />
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

/* The underdog rule as a drawing, three labels: two sides' stacks standing
   apart, the gap between them measured (1,000+), the side ahead paying
   1:1 and the side behind 2:1, lit amber. The TV draws it larger (`tv`),
   its labels on the canvas's 24px floor and up. */
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
