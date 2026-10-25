import React, { useEffect, useRef, useState } from "react";
import { cleanFloatLook, floatGroom, floatLookOf } from "../../../shared/float.js";
import { FloatBoundary } from "./FloatBoundary.jsx";
import { useFloatPart } from "./floatParts.js";
import "./float.css";

/* Profile > Locker: the rider's look for Float (float/PROTOCOL.md "Looks"),
   on the room's own picker (LockerPicker, its own chunk, loaded when the
   section opens). No Save: a change saves itself half a second after the
   last one (floatLook), and once more when the section closes. The crown
   is the groom's alone. */
const SAVE_AFTER_MS = 500;
export function FloatLocker({ state, me, active = true, onSave }) {
  const [draft, setDraft] = useState(() => floatLookOf(state?.profiles?.[me], me));
  const [status, setStatus] = useState(state?.profiles?.[me]?.float ? "saved" : "idle");
  const owed = useRef(null), timer = useRef(null), save = useRef(onSave);
  save.current = onSave;
  const flush = () => {
    clearTimeout(timer.current);
    const look = owed.current;
    if (!look || typeof save.current !== "function") return;
    owed.current = null;
    setStatus("saving");
    Promise.resolve().then(() => save.current(look)).then(result => setStatus(result?.ok ? "saved" : "error"), () => setStatus("error"));
  };
  /* leaving the section, or the sheet, saves what is owed */
  useEffect(() => { if (!active) flush(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = next => {
    const look = cleanFloatLook(next, me);
    setDraft(look);
    owed.current = look;
    setStatus("owed");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  };
  const { Part, failed } = useFloatPart("locker", active);
  const missing = <p className="fd-float-locker-note" role="alert">The locker didn't load. Reload the app to try again.</p>;
  return <section className="fd-float-locker" aria-label="Locker">
    {Part ? <FloatBoundary name="locker" fallback={missing}>
      <Part look={draft} onChange={change} groom={floatGroom(me)} />
    </FloatBoundary> : failed ? missing : <div className="fd-float-locker-wait" aria-hidden="true" />}
    <p className={`fd-float-locker-status is-${status}`} aria-live="polite">
      {status === "saving" || status === "owed" ? "Saving…" : status === "saved" ? "Saved"
        : status === "error" ? "Didn't save. Change it again to retry." : ""}</p>
  </section>;
}
