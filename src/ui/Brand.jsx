import React, { useId, useMemo } from "react";
import { markBody } from "./fdMark.js";

/* The FD mark in the app: the same master drawing as every app icon
   (fdMark.js), the chip lit with the desert sun in its window. The app
   picks its detail by CSS size against phone pixel density: the header's
   30px chip still carries the butte; below 22px it is the chip and the sun.
   `variant` is accepted from older call sites and no longer changes it. */
function appLevel(size) {
  return size < 22 ? "small" : size < 64 ? "mid" : "full";
}

function FDMark({ size=28, level }) {
  const uid = `fdm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lvl = level || appLevel(size);
  const html = useMemo(() => markBody({ level:lvl, uid }), [lvl, uid]);
  return <svg className="fd-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false"
    style={{ flexShrink:0, display:"block" }} dangerouslySetInnerHTML={{ __html:html }} />;
}

export { FDMark };
