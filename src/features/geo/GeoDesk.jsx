import React, { useEffect, useRef, useState } from "react";
import { GEO_CAPTION_MAX, GEO_MAX_ROUNDS, GEO_PLACE_MAX } from "../../../shared/geo.js";
import { geoDeleteRound, geoPhotoUrl, geoUploadPhoto } from "../../lib/client.js";
import { prepareMoment } from "../photos/prepareMoment.js";
import { GeoMap } from "./GeoMap.jsx";
import { whenLabel } from "./geoModel.js";
import { WhenPicker, formatWhen, parseWhen } from "./WhenPicker.jsx";
import { PlaceSearch, placeLabel } from "./PlaceSearch.jsx";
import { readPhotoFacts, reversePlace } from "./photoFacts.js";
import "./geo.css";
import { Icon } from "../../ui/Icon.jsx";
import { writeError } from "../../lib/writeErrors.js";

const newRoundId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* a photo not yet shown is the commissioner's: fetched with the token */
function DeskPhoto({ id, alt }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null, gone = false;
    geoPhotoUrl(id).then(found => { if (gone) { if (found) URL.revokeObjectURL(found); return; } url = found; setSrc(found); });
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt={alt} /> : <span className="fd-geo-desk-blank" aria-hidden="true" />;
}

/* A photo picked in the desk: what it knows about itself (GPS, the time
   it was taken) read from the original, the resized copy uploaded, and the
   place named from its coordinates. Fields the photo cannot answer stay
   blank for the commissioner. */
async function intakePhoto(picked) {
  const facts = await readPhotoFacts(picked);
  const prepared = await prepareMoment(picked);
  const result = await geoUploadPhoto(prepared.photo);
  if (!result.ok) return { ok:false, error:result.error || "Upload failed" };
  const hasPin = Number.isFinite(facts.lat) && Number.isFinite(facts.lng);
  const place = hasPin ? (await reversePlace(facts.lat, facts.lng, placeLabel)).slice(0, GEO_PLACE_MAX) : "";
  return { ok:true, photo:result.photo, preview:URL.createObjectURL(prepared.photo),
    ...(hasPin ? { lat:facts.lat, lng:facts.lng } : {}), ...(facts.when ? { when:facts.when } : {}), place,
    fromPhoto:{ pin:hasPin, when:!!facts.when, place:!!place } };
}

/* a field the photo filled in carries a small lit camera */
const FromPhoto = ({ on }) => on ? <span className="fd-geo-from-photo" role="img" aria-label="From the photo">
  <Icon name="camera" size={14} /></span> : null;

/* one round: the photo, the answer pin, the place's name, the date and hour */
function RoundEditor({ round, draft = null, onSave, onCancel }) {
  const seed = round || draft;
  const [photo, setPhoto] = useState(seed?.photo || null);
  const [preview, setPreview] = useState(draft?.preview || null);
  const [pin, setPin] = useState(Number.isFinite(seed?.lat) ? { lat:seed.lat, lng:seed.lng } : null);
  const [focus, setFocus] = useState(() => Number.isFinite(seed?.lat) ? { lat:seed.lat, lng:seed.lng, zoom:13, key:"saved" } : null);
  const [place, setPlace] = useState(seed?.place || "");
  const [wall, setWall] = useState(() => parseWhen(seed?.when));
  const [whenSet, setWhenSet] = useState(!!round || !!draft?.when);
  const [caption, setCaption] = useState(round?.caption || "");
  const [from, setFrom] = useState(draft?.fromPhoto || {});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const file = useRef(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const choose = async event => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setBusy("photo"); setError("");
    try {
      const taken = await intakePhoto(picked);
      if (!taken.ok) { setError(taken.error); return; }
      setPhoto(taken.photo);
      setPreview(taken.preview);
      /* the photo's own answers fill only what is still blank */
      const filled = {};
      if (taken.fromPhoto.pin && !pin) {
        setPin({ lat:taken.lat, lng:taken.lng });
        setFocus({ lat:taken.lat, lng:taken.lng, zoom:13, key:`photo:${Date.now()}` });
        filled.pin = true;
      }
      if (taken.fromPhoto.place && !place) { setPlace(taken.place); filled.place = true; }
      if (taken.fromPhoto.when && !whenSet) { setWall(parseWhen(taken.when)); setWhenSet(true); filled.when = true; }
      setFrom(filled);
    } catch (failure) { setError(failure?.message || "That photo could not be opened"); }
    finally { setBusy(""); }
  };
  const save = async () => {
    if (busy) return;
    setBusy("save"); setError("");
    if (!whenSet) { setBusy(""); setError("Set the date and hour"); return; }
    const result = await onSave({ id:round?.id || newRoundId(), photo, lat:pin?.lat, lng:pin?.lng, place,
      when:formatWhen(wall), caption });
    setBusy("");
    if (result?.ok !== true) setError(writeError(result));
  };
  return <div className="fd-geo-editor">
    <div className="fd-geo-editor-photo">
      {preview ? <img src={preview} alt="The photo" /> : photo ? <DeskPhoto id={photo.id} alt="The photo" />
        : <span className="fd-geo-desk-blank" aria-hidden="true" />}
      <button type="button" disabled={!!busy} onClick={() => file.current?.click()}>
        {busy === "photo" ? "Uploading…" : photo ? "Change photo" : "Choose photo"}</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={choose} />
    </div>
    <FromPhoto on={from.pin && !!pin} />
    <PlaceSearch onPick={found => {
      setFrom(current => ({ ...current, pin:false }));
      setPin({ lat:found.lat, lng:found.lng });
      setFocus({ lat:found.lat, lng:found.lng, zoom:found.zoom, key:`${found.key}:${Date.now()}` });
      if (!place) setPlace(found.name.slice(0, GEO_PLACE_MAX));
    }} />
    <GeoMap mode="pick" pin={pin} onPick={next => { setFrom(current => ({ ...current, pin:false })); setPin(next); }}
      focus={focus} className="fd-geo-pick" label="Drop the answer pin" />
    <label className="fd-geo-field"><span>Place<FromPhoto on={from.place} /></span><input value={place} maxLength={GEO_PLACE_MAX}
      onChange={event => { setFrom(current => ({ ...current, place:false })); setPlace(event.target.value); }} /></label>
    <div className="fd-geo-field"><span>When it was taken<FromPhoto on={from.when} /></span>
      <WhenPicker value={wall} set={whenSet} onChange={(next, turned) => {
        setWall(next); if (turned) { setWhenSet(true); setFrom(current => ({ ...current, when:false })); } }} />
    </div>
    <label className="fd-geo-field"><span>Caption</span><input value={caption} maxLength={GEO_CAPTION_MAX}
      onChange={event => setCaption(event.target.value)} placeholder="Optional" /></label>
    {error && <p className="fd-geo-error" role="alert">{error}</p>}
    <div className="fd-geo-editor-actions">
      <button type="button" className="fd-geo-send" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save photo"}</button>
      <button type="button" className="fd-geo-secondary" disabled={!!busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

/* Commissioner > Where and When: the photos and their answers, in play
   order. Locked while a game runs; Restart clears the guesses, never the
   photos. */
export function GeoDesk({ state, onAct, notify }) {
  const rounds = state.geoRounds || [];
  const running = !!state.geo?.order;
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  /* several photos at once: the complete ones go straight on the list, the
     rest wait here and open in the editor one after another */
  const [queue, setQueue] = useState([]);
  const [adding, setAdding] = useState(null);
  const many = useRef(null);
  const nextDraft = rest => { setQueue(rest); setEditing(rest.length ? "draft" : null); };
  const save = async payload => {
    const result = await onAct("geoSaveRound", payload);
    if (result?.ok) { if (editing === "draft") nextDraft(queue.slice(1)); else setEditing(null); }
    return result;
  };
  const addMany = async event => {
    const files = [...(event.target.files || [])].slice(0, Math.max(0, GEO_MAX_ROUNDS - rounds.length));
    event.target.value = "";
    if (!files.length) return;
    const waiting = [];
    let saved = 0, failed = 0;
    for (const [index, picked] of files.entries()) {
      setAdding({ at:index + 1, of:files.length });
      try {
        const taken = await intakePhoto(picked);
        if (!taken.ok) { failed += 1; continue; }
        const draft = { id:newRoundId(), ...taken, caption:"" };
        if (taken.fromPhoto.pin && taken.fromPhoto.when && taken.fromPhoto.place) {
          const result = await onAct("geoSaveRound", { id:draft.id, photo:draft.photo, lat:draft.lat, lng:draft.lng,
            place:draft.place, when:draft.when, caption:"" });
          if (result?.ok) { saved += 1; URL.revokeObjectURL(draft.preview); continue; }
        }
        waiting.push(draft);
      } catch { failed += 1; }
    }
    setAdding(null);
    if (saved || failed) notify?.([saved ? `${saved} added` : "", failed ? `${failed} couldn't be opened` : ""].filter(Boolean).join(". "));
    if (waiting.length) { setQueue(waiting); setEditing("draft"); }
  };
  const remove = async id => {
    if (confirm !== id) { setConfirm(id); return; }
    setConfirm(null);
    const result = await geoDeleteRound(id);
    if (!result.ok) notify?.(result.error || "Couldn't delete. Try again.");
  };
  if (editing === "draft" && queue[0]) return <RoundEditor key={queue[0].id} draft={queue[0]}
    onSave={save} onCancel={() => nextDraft(queue.slice(1))} />;
  if (editing && editing !== "draft") return <RoundEditor round={editing === "new" ? null : rounds.find(round => round.id === editing)}
    onSave={save} onCancel={() => setEditing(null)} />;
  return <div className="fd-geo-desk">
    {running && <div className="fd-geo-running">
      <span>Photo {state.geo.index + 1} of {state.geo.order.length} live</span>
      <button type="button" onClick={async () => {
        if (confirm !== "restart") { setConfirm("restart"); return; }
        setConfirm(null);
        const result = await onAct("geoRestart", { evId:state.geo.eventId });
        if (!result?.ok) notify?.(result?.error || "Couldn't restart");
      }}>{confirm === "restart" ? "Clear every guess?" : "Restart game"}</button>
    </div>}
    <ol className="fd-geo-list">
      {rounds.map((round, index) => <li key={round.id}>
        <span className="fd-geo-thumb"><DeskPhoto id={round.photo.id} alt={round.place} /></span>
        <span className="fd-geo-list-text"><strong>{index + 1}. {round.place}</strong><small>{whenLabel(round.when)}</small>
          {round.caption && <small>{round.caption}</small>}</span>
        {!running && <span className="fd-geo-list-actions">
          <button type="button" aria-label={`Move ${round.place} up`} disabled={index === 0}
            onClick={() => onAct("geoMoveRound", { id:round.id, by:-1 })}><Icon name="up" size={18} /></button>
          <button type="button" aria-label={`Move ${round.place} down`} disabled={index === rounds.length - 1}
            onClick={() => onAct("geoMoveRound", { id:round.id, by:1 })}><Icon name="down" size={18} /></button>
          <button type="button" onClick={() => setEditing(round.id)}>Edit</button>
          <button type="button" className={confirm === round.id ? "is-confirm" : ""} onClick={() => remove(round.id)}>
            {confirm === round.id ? "Delete?" : "Delete"}</button>
        </span>}
      </li>)}
    </ol>
    {!running && rounds.length < GEO_MAX_ROUNDS && <div className="fd-geo-add">
      <button type="button" className="fd-geo-send" disabled={!!adding} onClick={() => many.current?.click()}>
        {adding ? `Adding ${adding.at} of ${adding.of}` : "Add photos"}</button>
      <button type="button" className="fd-geo-secondary" disabled={!!adding} onClick={() => setEditing("new")}>One by hand</button>
      <input ref={many} type="file" accept="image/*" multiple hidden onChange={addMany} />
    </div>}
    <p className="fd-geo-hint">{rounds.length} of {GEO_MAX_ROUNDS} photos</p>
  </div>;
}
