import React, { useRef, useState } from "react";
/* a namespace import: a component test that stubs the transport need not
   list the desk's calls, which run only on a tap */
import * as transport from "../../lib/client.js";
import { PHOTO_PREP, batchLine, deskMoments } from "./photoModel.js";
import { prepareMoment } from "./prepareMoment.js";
import { PhotoGrid } from "./PhotoGrid.jsx";
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

/* Weekend's Photos section: add from the camera roll or the camera, then
   the grid. Only a checked-in guest can add. */
export function PhotoDesk({ state, me = null, gm = false, onPlayer = null }) {
  const list = deskMoments(state, { gm });
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
  return (
    <section className="fd-weekend-guide-section fd-photo-desk" aria-label="Photos">
      <div className="fd-photo-desk-head">
        <span className="fd-photo-desk-count">
          {list.length ? `${list.length} photo${list.length === 1 ? "" : "s"}` : "No photos yet"}</span>
        {me && <button type="button" className="fd-photo-add" disabled={!!step} aria-busy={!!step || undefined}
          onClick={() => input.current?.click()}>{step ? `Adding ${step.at} of ${step.total}` : "Add photos"}</button>}
        {me && <input ref={input} type="file" accept="image/*" multiple hidden
          onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ""; add(files); }} />}
      </div>
      {line && <p className="fd-photo-line" role="status">{line}</p>}
      <PhotoGrid state={state} moments={list} me={me} gm={gm} onPlayer={onPlayer} />
    </section>
  );
}
