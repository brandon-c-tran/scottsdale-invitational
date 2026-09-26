import React, { useEffect, useState } from "react";
import { Btn } from "../../ui/controls.jsx";
import { DISPLAY, SANS } from "../../ui/theme.js";
import { installEvt, onInstallReady, isIOS } from "./install.js";

export function InstallHint() {
  const [, bump] = useState(0);
  useEffect(() => onInstallReady(() => bump(x => x + 1)), []);
  if (installEvt) return <Btn onClick={() => installEvt.prompt()} style={{ alignSelf:"flex-start" }}>Add to home screen</Btn>;
  if (isIOS()) return (
    <div>
      {[["1","Tap the Share button in Safari"],["2","Tap Add to Home Screen"]].map(([n,t]) => (
        <div key={n} style={{ display:"flex", gap:12, alignItems:"center", padding:"7px 0" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--accent2)" }}>{n}</span>
          <span style={{ fontFamily:SANS, fontSize:16, color:"var(--ink)" }}>{t}</span>
        </div>
      ))}
    </div>
  );
  return <div style={{ fontFamily:SANS, fontSize:16, color:"var(--ink)" }}>
    In your browser menu, choose Add to Home Screen.</div>;
}
