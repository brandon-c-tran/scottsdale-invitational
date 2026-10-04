import React, { useEffect, useLayoutEffect, useState } from "react";
import { useFreshChange } from "../../lib/motion.js";
import "./teams.css";

/* How long a renamed team's lettering takes to re-letter (the sweep's length) */
export const RELETTER_MS = 900;

/* A team's name that re-letters when it changes on a fresh frame: the new
   letters flip up into place under one lamp sweep. A load, a reconnect, a
   catch-up or reduced motion shows the new name still. */
export function RenameText({ name, as: Tag = "span", className = "", style, children }) {
  const change = useFreshChange(name);
  const [flash, setFlash] = useState(0);
  useLayoutEffect(() => {
    if (change.animate) setFlash(change.changeId);
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(0), RELETTER_MS + 200);
    return () => clearTimeout(timer);
  }, [flash]);
  return <Tag key={flash || "rest"} className={`${className}${flash ? " fd-relettered" : ""}`.trim() || undefined}
    style={style}>{children ?? name}</Tag>;
}
