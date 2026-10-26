/* A rider's portrait (riderPortrait through portrait.js): a disc in the
   rider's colour with the still on it, the rider's initial until it lands. */
import React, { useEffect, useState } from "react";
import { cachedPortrait, portraitKey, requestPortrait } from "./portrait.js";
import "./portrait.css";

const pixelRatio = () => {
  try { return Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 1)); } catch { return 1; }
};

export function usePortrait(entrant, size) {
  const px = Math.round(size * pixelRatio());
  const key = portraitKey(entrant, px);
  const [state, setState] = useState(() => ({ key, url:cachedPortrait(entrant, px) }));
  useEffect(() => {
    let live = true;
    const ready = cachedPortrait(entrant, px);
    setState({ key, url:ready });
    if (!ready) requestPortrait(entrant, px).then(url => { if (live) setState({ key, url }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.url : null;
}

export default function Portrait({ entrant, size = 64, className = "", label = null }) {
  const url = usePortrait(entrant || {}, size);
  const initial = String(entrant?.name || "").trim().charAt(0).toUpperCase();
  return <span className={`flp${url ? " is-drawn" : ""}${className ? ` ${className}` : ""}`}
    style={{ "--flp-c":entrant?.color || "#9aa39e", "--flp-size":`${size}px` }}
    role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
    {url ? <img src={url} alt="" draggable="false" decoding="async" /> : <span className="flp-initial">{initial}</span>}
  </span>;
}
