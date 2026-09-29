import React, { useEffect, useRef, useState } from "react";
import { shareCardImage } from "./cardImage.js";
import { posterFileName } from "./classPhoto.js";
import { renderPosterImage } from "./posterImage.js";

/* D3, the commissioner's "Save poster": the class photo as a 1920x1080 PNG
   for the group chat. It is drawn as soon as the button shows, so the tap
   can hand it to the share sheet at once; without one, the image opens to
   press and hold. */
export function SavePoster({ state, events, standings }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(null);
  const photos = standings.map(row => state.profiles?.[row.player]?.photoV || 0).join(",");
  useEffect(() => {
    let live = true;
    pending.current = renderPosterImage(state, { events, standings })
      .then(blob => { if (live) setImage(blob); return blob; });
    return () => { live = false; };
  }, [standings.map(row => `${row.player}:${row.pts}`).join(","), photos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const blob = image || await pending.current;
    const outcome = await shareCardImage(blob, posterFileName());
    setSaving(false);
    if (outcome === "preview" && blob) setPreview(URL.createObjectURL(blob));
  };
  return <>
    <button type="button" className="fd-crown-poster" onClick={save} disabled={saving}>
      {saving ? "Saving…" : "Save poster"}</button>
    {preview && <div className="fd-crown-preview" role="dialog" aria-label="Saved poster">
      <img src={preview} alt="Class photo poster" />
      <p>Press and hold the image to save it.</p>
      <button type="button" onClick={() => setPreview(null)}>Done</button>
    </div>}
  </>;
}
