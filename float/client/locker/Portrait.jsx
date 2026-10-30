/* A rider's portrait (riderPortrait through portrait.js): a disc in the
   rider's colour with the still on it, the rider's initial until the first
   one lands. When the look changes, the last still stays up until the new
   one is drawn, so a pick never flashes back to the initial. */
import React, { useEffect, useState } from "react";
import { cachedPortrait, portraitKey, requestPortrait } from "./portrait.js";
import "./portrait.css";

const pixelRatio = () => {
  try { return Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 1)); } catch { return 1; }
};

export function usePortrait(entrant, size, frame = "full") {
  const px = Math.round(size * pixelRatio());
  const key = portraitKey(entrant, px, frame);
  const [state, setState] = useState(() => ({ key, url:cachedPortrait(entrant, px, frame) }));
  useEffect(() => {
    let live = true;
    const ready = cachedPortrait(entrant, px, frame);
    if (ready) setState({ key, url:ready });
    else requestPortrait(entrant, px, frame).then(url => { if (live) setState({ key, url }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the current still, else the last one while the new one draws */
  return state.key === key ? state.url : (cachedPortrait(entrant, px, frame) || state.url);
}

/* frame "head": the head close up (a hat or glasses chip); neutral: a grey disc, so a hat in the rider's colour never vanishes into it */
export default function Portrait({ entrant, size = 64, className = "", label = null, frame = "full", neutral = false }) {
  const url = usePortrait(entrant || {}, size, frame);
  const initial = String(entrant?.name || "").trim().charAt(0).toUpperCase();
  return <span className={`flp${url ? " is-drawn" : ""}${neutral ? " is-neutral" : ""}${className ? ` ${className}` : ""}`}
    style={{ "--flp-c":entrant?.color || "#9aa39e", "--flp-size":`${size}px` }}
    role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
    {url ? <img src={url} alt="" draggable="false" decoding="async" />
      : <span className="flp-initial">{initial}</span>}
  </span>;
}
