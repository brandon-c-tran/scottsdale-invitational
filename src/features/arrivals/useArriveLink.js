/* A page opened from the TV's QR (iPhone's Camera opens the link in Safari,
   not the installed app). If this browser is a guest's own (the server
   knows its claim), the code checks them in; a stranger's browser does
   nothing special. Either way the parameter leaves the address, so a
   reload never checks in again. Read once, at load. */
import { useEffect, useRef } from "react";
import { arriveCodeFrom, arriveLinkStep, stripArriveParam } from "./arrivalsModel.js";

const atLoad = typeof window !== "undefined" ? window.location.href : "";
const LINK_CODE = arriveCodeFrom(atLoad);

function strip() {
  if (typeof window === "undefined") return;
  const next = stripArriveParam(window.location.href);
  if (next !== null) try { window.history.replaceState(window.history.state, "", next); } catch {}
}

/* `onArrive(player, code)` resolves the write's result */
export function useArriveLink({ ready, me, you, onArrive, code = LINK_CODE }) {
  const done = useRef(!code);
  const started = useRef(Date.now());
  useEffect(() => {
    if (done.current) return undefined;
    const step = arriveLinkStep({ code, ready, you, me, waited:Date.now() - started.current });
    if (step === "send") { done.current = true; strip(); onArrive(you, code); return undefined; }
    if (step === "drop" || step === "none") { done.current = true; strip(); return undefined; }
    /* still waiting on this device's re-claim: give up once its patience runs out */
    let timer = null;
    const check = () => {
      if (done.current) return;
      if (arriveLinkStep({ code, ready, you, me, waited:Date.now() - started.current }) === "drop") { done.current = true; strip(); }
      else timer = setTimeout(check, 1000);
    };
    timer = setTimeout(check, 1000);
    return () => clearTimeout(timer);
  });
}
