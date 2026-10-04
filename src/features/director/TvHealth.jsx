import React, { useEffect, useState } from "react";
import { TV_STALE_MS, tvHealthLine } from "./tvHealth.js";
import { Icon } from "../../ui/Icon.jsx";

/* The room's TV, when it is muted or gone: one clay line inside the
   commissioner's pill (DirectorPill's `health`), never a chip of its own.
   It checks again on its own, since a TV that drops says nothing. */
export function TvHealth({ tvs, receivedAt, live }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Array.isArray(tvs)) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), Math.round(TV_STALE_MS / 4));
    return () => clearInterval(timer);
  }, [tvs, receivedAt]);
  const line = tvHealthLine({ tvs, receivedAt, live, now });
  if (!line) return null;
  return <span role="status" className="fd-tv-health">
    <Icon name="mute" size={14} lit />
    {line}
  </span>;
}
