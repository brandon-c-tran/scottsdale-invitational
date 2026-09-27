import React from "react";
import { reloadForUpdate, useTournament } from "../lib/client.js";

/* A newer build is live. Phones also reload on their own the next time they
   come back to the foreground; the TV reloads itself when idle. */
export function UpdateReady() {
  const { updateReady } = useTournament();
  const tv = typeof window !== "undefined" && (window.location.pathname === "/tv"
    || new URLSearchParams(window.location.search).has("tv"));
  if (!updateReady || tv) return null;
  return <div role="status" style={{ position:"fixed", left:"50%", transform:"translateX(-50%)",
    bottom:"calc(100px + env(safe-area-inset-bottom))", zIndex:60, display:"flex", alignItems:"center",
    gap:12, padding:"4px 4px 4px 16px", borderRadius:99, background:"var(--paper2)",
    border:"1px solid var(--line)", boxShadow:"var(--shadow-2)", color:"var(--ink)",
    font:"600 13px/1.2 var(--fd-body)", whiteSpace:"nowrap" }}>
    <span>Update ready</span>
    <button type="button" onClick={reloadForUpdate} style={{ minHeight:44, padding:"0 18px", border:0,
      borderRadius:99, background:"var(--action-fill)", color:"var(--action-ink)", font:"inherit",
      cursor:"pointer" }}>Reload</button>
  </div>;
}
