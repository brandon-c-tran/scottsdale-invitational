import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ActionButton, IconButton, Sheet } from "../../ui/controls.jsx";
/* a namespace import: a component test that stubs the transport need not
   list the desk's calls, which run only on a tap or for a hidden photo */
import * as transport from "../../lib/client.js";
import { canDeleteMoment, deskMoments, momentSrc, momentWhen } from "./photoModel.js";
import "./photos.css";
import { Icon } from "../../ui/Icon.jsx";

/* A visible photo is a plain same-origin URL. A hidden one is served only to
   the commissioner, so it is fetched with the token into an object URL. */
export function useMomentSrc(moment, thumb = false) {
  const hidden = !!moment?.hidden;
  const id = moment?.id || null;
  const [held, setHeld] = useState(null);
  useEffect(() => {
    if (!hidden || !id) return undefined;
    let live = true, made = null;
    Promise.resolve(transport.hiddenMomentUrl?.(id, thumb) ?? null).then(url => {
      made = url;
      if (live) setHeld({ id, url });
      else if (url) URL.revokeObjectURL(url);
    });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id, hidden, thumb]);
  if (!id) return null;
  if (!hidden) return momentSrc(id, thumb);
  return held?.id === id ? held.url : null;
}

function Tile({ state, moment, onOpen }) {
  const src = useMomentSrc(moment, true);
  const name = disp(state, moment.by);
  return (
    <button type="button" className={`fd-photo-tile${moment.hidden ? " is-hidden" : ""}`}
      onClick={() => onOpen(moment)} aria-label={`Photo by ${name}${moment.hidden ? ", hidden" : ""}`}>
      {src && <img src={src} alt="" loading="lazy" decoding="async" />}
      <span className="fd-photo-tile-by" aria-hidden="true"><ChipFace p={moment.by} size={26} flat /></span>
      {moment.hidden && <span className="fd-photo-tile-flag">Hidden</span>}
    </button>
  );
}

/* One photo, large, with its author. The author's chip opens their player
   card; the author and the commissioner can delete it, the commissioner
   can hide it from everyone else. */
export function PhotoViewer({ state, moment, list = [moment], me = null, gm = false, onPlayer = null,
  onMove = null, onClose }) {
  const src = useMomentSrc(moment, false);
  const name = disp(state, moment.by);
  const index = list.findIndex(item => item.id === moment.id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const touch = useRef(null);
  useEffect(() => { setConfirming(false); setError(""); }, [moment.id]);

  const go = target => { if (target && onMove && !pending) onMove(target.id); };
  const remove = async () => {
    setPending(true); setError("");
    const result = await transport.deleteMoment(moment.id);
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    if (onMove && (next || prev)) onMove((next || prev).id); else onClose?.();
  };
  const toggleHidden = async () => {
    setPending(true); setError("");
    const result = await transport.setMomentHidden(moment.id, !moment.hidden);
    setPending(false);
    if (!result.ok) setError(result.error);
  };
  const deletable = canDeleteMoment(moment, { me, gm });
  const ratio = moment.w && moment.h ? `${moment.w} / ${moment.h}` : undefined;

  return (
    <Sheet title={name} subtitle={[momentWhen(moment), moment.hidden ? "Hidden" : ""].filter(Boolean).join(" · ")}
      onClose={onClose} busy={pending} className="fd-photo-sheet"
      headerActions={onPlayer ? <button type="button" className="fd-photo-author" aria-label={`${name}'s card`}
        onClick={() => onPlayer(moment.by)}><ChipFace p={moment.by} size={36} flat /></button> : null}>
      <div className="fd-photo-stage"
        onTouchStart={event => { touch.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={event => {
          const start = touch.current; touch.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start == null || end == null || Math.abs(end - start) < 48) return;
          go(end < start ? next : prev);
        }}>
        <div className="fd-photo-frame" style={{ aspectRatio:ratio }}>
          {src && <img key={moment.id} src={src} alt={`Photo by ${name}`} decoding="async" />}
        </div>
      </div>
      <div className="fd-photo-controls">
        {list.length > 1 && <div className="fd-photo-nav">
          <IconButton label="Previous photo" size={44} disabled={!prev || pending} onClick={() => go(prev)}><Icon name="back" size={22} /></IconButton>
          <span className="fd-photo-count">{index + 1} of {list.length}</span>
          <IconButton label="Next photo" size={44} disabled={!next || pending} onClick={() => go(next)}><Icon name="next" size={22} /></IconButton>
        </div>}
        {(deletable || gm) && !confirming && <div className="fd-photo-actions">
          {gm && <ActionButton variant="secondary" compact onClick={toggleHidden} pending={pending}>
            {moment.hidden ? "Show" : "Hide"}</ActionButton>}
          {deletable && <ActionButton variant="destructive" compact disabled={pending}
            onClick={() => setConfirming(true)}>Delete</ActionButton>}
        </div>}
      </div>
      {confirming && <div className="fd-photo-confirm" role="group" aria-label="Delete photo">
        <div className="fd-photo-actions">
          <ActionButton variant="tertiary" compact disabled={pending} onClick={() => setConfirming(false)}>Keep</ActionButton>
          <ActionButton variant="commit" compact pending={pending} onClick={remove}>Delete photo</ActionButton>
        </div>
      </div>}
      {error && <p className="fd-photo-error" role="alert">{error}</p>}
    </Sheet>
  );
}

/* The read-only grid: newest first, each tile opens the photo. Other
   surfaces (the kept weekend) can drop it in as is; `limit` trims it. */
export function PhotoGrid({ state, me = null, gm = false, onPlayer = null, limit = 0, onOpen = null, moments = null, onMore = null }) {
  const list = moments || deskMoments(state, { gm });
  /* trimmed with somewhere to go: the last tile is the way to the rest */
  const folded = !!(limit && onMore && list.length > limit);
  const shown = limit ? list.slice(0, folded ? limit - 1 : limit) : list;
  const [openId, setOpenId] = useState(null);
  const current = openId ? list.find(item => item.id === openId) || null : null;
  if (!shown.length) return null;
  return (
    <>
      <div className="fd-photo-grid">
        {shown.map(moment => <Tile key={moment.id} state={state} moment={moment}
          onOpen={item => onOpen ? onOpen(item) : setOpenId(item.id)} />)}
        {folded && <button type="button" className="fd-photo-tile fd-photo-more" onClick={onMore}
          aria-label={`All ${list.length} photos`}><span aria-hidden="true">+{list.length - shown.length}</span></button>}
      </div>
      {current && <PhotoViewer state={state} moment={current} list={list} me={me} gm={gm} onPlayer={onPlayer}
        onMove={setOpenId} onClose={() => setOpenId(null)} />}
    </>
  );
}
