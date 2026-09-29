import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { momentSrc, photoFit, tvPhotoAt } from "./photoModel.js";
import "./tv-photos.css";

/* one photo layer: it fades in once its bytes are in, over the last photo
   (held underneath), so a turn never passes through an empty frame */
function Layer({ moment, shown = false, under = false, onReady }) {
  const fit = photoFit(moment);
  return (
    <div className={`tv-photo-layer is-${fit}${under ? " is-under" : shown ? " is-shown" : ""}`}>
      <img src={momentSrc(moment.id)} alt="" decoding="async"
        onLoad={onReady} onError={onReady} />
    </div>
  );
}

/* D11: the photo desk's ambient turn. The newest photos, full width under
   the masthead, one every TV_PHOTO_MS on the server clock so every TV in
   the house shows the same one, crossfading on the story fade; the author's
   photo chip and name in the corner. Reduced motion cuts (shell.css). */
export function TVPhotoCard({ state, list, now }) {
  const turn = tvPhotoAt(list, now);
  const current = turn?.moment || null;
  /* the photo this card showed before the current one, for the crossfade */
  const shownRef = useRef({ current:null, previous:null });
  if (current && shownRef.current.current !== current.id)
    shownRef.current = { current:current.id, previous:shownRef.current.current };
  const previous = shownRef.current.previous ? list.find(item => item.id === shownRef.current.previous) : null;
  const [readyId, setReadyId] = useState(null);

  /* the next turn's bytes load while this one shows */
  const nextId = turn?.next?.id;
  useEffect(() => {
    if (!nextId || typeof Image === "undefined") return;
    const image = new Image();
    image.decoding = "async";
    image.src = momentSrc(nextId);
  }, [nextId]);

  if (!current) return null;
  const ready = readyId === current.id;
  return (
    <div className="tv-photos" role="img" aria-label={`Photo by ${disp(state, current.by)}`}>
      {previous && previous.id !== current.id && <Layer key={previous.id} moment={previous} under />}
      <Layer key={current.id} moment={current} shown={ready} onReady={() => setReadyId(current.id)} />
      <div key={`by-${current.id}`} className={`tv-photo-caption${ready ? " is-shown" : ""}`}>
        <ChipFace p={current.by} size={56} flat />
        <span className="tv-photo-name">{disp(state, current.by)}</span>
      </div>
    </div>
  );
}
