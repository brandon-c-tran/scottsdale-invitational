import React, { useRef, useState } from "react";
/* a namespace import: a component test that stubs the transport need not
   list the desk's calls, which run only on a tap */
import * as transport from "../../lib/client.js";
import { PHOTO_PREP, batchLine, deskMoments } from "./photoModel.js";
import { prepareMoment } from "./prepareMoment.js";
import { PhotoGrid } from "./PhotoGrid.jsx";
import { Icon } from "../../ui/Icon.jsx";
import "./photos.css";

/* errors that end a batch: the rest would only fail the same way */
const STOP_STATUSES = new Set([403, 409, 429]);

/* Send the chosen files one at a time. `prepare` and `upload` are the real
   resize and transport unless a test hands in its own. */
export async function sendBatch(files, { prepare = prepareMoment, upload = item => transport.uploadMoment(item),
  onStep = () => {} } = {}) {
  const all = [...(files || [])];
  const chosen = all.slice(0, PHOTO_PREP.perBatch);
  const tally = { added:0, failed:0, error:"", skipped:all.length - chosen.length };
  for (let index = 0; index < chosen.length; index++) {
    onStep(index + 1, chosen.length);
    let result;
    try { result = await upload(await prepare(chosen[index])); }
    catch (error) { result = { ok:false, error:error?.message || "That photo could not be opened" }; }
    if (result?.ok) { tally.added++; continue; }
    tally.failed++;
    tally.error ||= result?.error || "Upload failed";
    if (STOP_STATUSES.has(result?.status)) { tally.failed += chosen.length - index - 1; break; }
  }
  return tally;
}

/* The one way a photo gets added: the camera roll or the camera, then one
   at a time up the wire. Returns the button's state and the hidden input
   the button opens. Only a checked-in guest can add. */
export function usePhotoAdd() {
  const input = useRef(null);
  const [step, setStep] = useState(null);
  const [line, setLine] = useState("");
  const add = async files => {
    if (!files?.length || step) return;
    setLine("");
    const tally = await sendBatch(files, { onStep:(at, total) => setStep({ at, total }) });
    setStep(null);
    setLine(batchLine(tally));
  };
  const field = <input ref={input} type="file" accept="image/*" multiple hidden
    onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ""; add(files); }} />;
  return { step, line, field, open:() => input.current?.click() };
}

/* the add action: a camera and its words, amber (the page's one primary
   action); while sending, the count */
export function PhotoAddButton({ adder, label = "Add photos", className = "" }) {
  const { step } = adder;
  return <button type="button" className={`fd-photo-add${className ? ` ${className}` : ""}`} disabled={!!step}
    aria-busy={!!step || undefined} onClick={adder.open}>
    <Icon name="camera" size={20} />{step ? `Adding ${step.at} of ${step.total}` : label}</button>;
}

/* Every photo: the add action, then the grid. Weekend's all-photos sheet. */
export function PhotoDesk({ state, me = null, gm = false, onPlayer = null }) {
  const list = deskMoments(state, { gm });
  const adder = usePhotoAdd();
  return (
    <section className="fd-weekend-guide-section fd-photo-desk" aria-label="Photos">
      <div className="fd-photo-desk-head">
        <span className="fd-photo-desk-count">
          {list.length ? `${list.length} photo${list.length === 1 ? "" : "s"}` : "No photos yet"}</span>
        {me && <PhotoAddButton adder={adder} />}
        {me && adder.field}
      </div>
      {adder.line && <p className="fd-photo-line" role="status">{adder.line}</p>}
      <PhotoGrid state={state} moments={list} me={me} gm={gm} onPlayer={onPlayer} />
    </section>
  );
}
