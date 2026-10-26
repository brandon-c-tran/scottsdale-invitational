import React, { useEffect, useRef, useState } from "react";
import { cleanFloatLook, floatGroom, floatLookOf, floatRider } from "../../../shared/float.js";
import { FloatBoundary } from "./FloatBoundary.jsx";
import { useFloatPart } from "./floatParts.js";
import { lookSaver } from "./lookSaver.js";
import "./float.css";

/* Profile > Locker: the rider's look for Float (float/PROTOCOL.md "Looks"),
   on the room's own picker (LockerPicker, its own chunk, loaded when the
   section opens). No Save: a change saves itself half a second after the
   last one (floatLook), and once more when the section closes
   (lookSaver.js). The crown is the groom's alone. The preview stands in
   the rider's own identity, as the room will draw them (floatRider: their
   chip colour and skin, name, number and photo). */
export function FloatLocker({ state, me, active = true, onSave }) {
  const [draft, setDraft] = useState(() => floatLookOf(state?.profiles?.[me], me));
  const [status, setStatus] = useState(state?.profiles?.[me]?.float ? "saved" : "idle");
  const save = useRef(onSave), saver = useRef(null);
  save.current = onSave;
  if (!saver.current) saver.current = lookSaver({ target:() => save.current, onStatus:setStatus });
  /* leaving the section, or the sheet, saves what is owed */
  useEffect(() => { if (!active) saver.current.flush(); }, [active]);
  useEffect(() => () => saver.current.flush(), []);
  const change = next => {
    const look = cleanFloatLook(next, me);
    setDraft(look);
    saver.current.change(look);
  };
  const { Part, failed } = useFloatPart("locker", active);
  const rider = floatRider(state, me);
  const missing = <p className="fd-float-locker-note" role="alert">The locker didn't load. Reload the app to try again.</p>;
  return <section className="fd-float-locker" aria-label="Locker">
    {Part ? <FloatBoundary name="locker" fallback={missing}>
      <Part look={draft} onChange={change} groom={floatGroom(me)} color={rider.color} name={rider.name} photo={rider.photo}
        number={rider.number} skin={rider.skin} />
    </FloatBoundary> : failed ? missing : <div className="fd-float-locker-wait" aria-hidden="true" />}
    <p className={`fd-float-locker-status is-${status}`} aria-live="polite">
      {status === "saving" || status === "owed" ? "Saving…" : status === "saved" ? "Saved"
        : status === "error" ? "Didn't save. Change it again to retry." : ""}</p>
  </section>;
}
