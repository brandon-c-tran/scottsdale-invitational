import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/* A name under a tower (the standings horizon, the crown's hall): one line
   in its slot, as large as it goes (`max` down to `min`), and a name still
   wider at `min` is narrowed to the slot (measured in the browser; `squeeze`
   is the estimate), so every tower's count stands on one baseline; never two
   lines. Past TOWER_SQUEEZE it ends in an ellipsis inside the slot. */
export const TOWER_SQUEEZE = 0.72;
export function towerNameFit(name, width, { max = 30, min = 24 } = {}) {
  /* lettered as written; measured as capitals, the widest it could run */
  const text = String(name || "");
  const size = Math.max(min, Math.min(max, Math.floor(width / Math.max(1, text.length * 0.5))));
  const est = text.length * 0.5 * size;
  return { size, lines:[text], squeeze:est > width ? Math.max(TOWER_SQUEEZE, width / est) : 1 };
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function TowerName({ name, width, max = 30, min = 24, className = "tv-tower-name", textClassName = "tv-tower-name-text" }) {
  const fit = towerNameFit(name, width, { max, min });
  const ref = useRef(null);
  const [squeeze, setSqueeze] = useState(fit.squeeze);
  const [clip, setClip] = useState(false);
  useIsoLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const w = ref.current?.scrollWidth || 0;
      if (!live || !w) return;
      setSqueeze(Math.max(TOWER_SQUEEZE, Math.min(1, width / w)));
      setClip(width / w < TOWER_SQUEEZE);
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => { live = false; };
  }, [name, fit.size, width]);
  const style = squeeze < 1 ? { transform:`scaleX(${squeeze.toFixed(3)})` } : {};
  /* past the narrowest it goes, the name ends in an ellipsis inside the slot */
  if (clip) Object.assign(style, { maxWidth:Math.floor(width / TOWER_SQUEEZE), overflow:"hidden", textOverflow:"ellipsis" });
  return <b className={className} style={{ fontSize:fit.size }}>
    <span ref={ref} className={textClassName} style={style}>{name}</span></b>;
}
