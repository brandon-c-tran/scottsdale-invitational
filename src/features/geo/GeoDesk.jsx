import React, { useEffect, useRef, useState } from "react";
import { GEO_CAPTION_MAX, GEO_MAX_ROUNDS, GEO_PLACE_MAX } from "../../../shared/geo.js";
import { geoDeleteRound, geoPhotoUrl, geoUploadPhoto } from "../../lib/client.js";
import { prepareMoment } from "../photos/prepareMoment.js";
import { GeoMap } from "./GeoMap.jsx";
import { whenLabel } from "./geoModel.js";
import { WhenPicker, formatWhen, parseWhen } from "./WhenPicker.jsx";
import "./geo.css";

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

/* a place search for the answer pin (OpenStreetMap's own geocoder) */
function PlaceSearch({ onFound }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const search = async event => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`,
        { headers:{ Accept:"application/json" } });
      const found = r.ok ? await r.json() : [];
      setResults(Array.isArray(found) ? found.slice(0, 5) : []);
    } catch { setResults([]); }
    finally { setBusy(false); }
  };
  return <form className="fd-geo-search" onSubmit={search}>
    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a place"
      aria-label="Search a place" />
    <button type="submit" disabled={busy}>{busy ? "…" : "Search"}</button>
    {results.length > 0 && <ul>{results.map(item => <li key={item.place_id}>
      <button type="button" onClick={() => {
        onFound({ lat:Number(item.lat), lng:Number(item.lon), name:String(item.name || item.display_name || "").split(",")[0] });
        setResults([]);
      }}>{item.display_name}</button></li>)}</ul>}
  </form>;
}

/* one round: the photo, the answer pin, the place's name, the date and hour */
function RoundEditor({ round, onSave, onCancel }) {
  const [photo, setPhoto] = useState(round?.photo || null);
  const [preview, setPreview] = useState(null);
  const [pin, setPin] = useState(round ? { lat:round.lat, lng:round.lng } : null);
  const [place, setPlace] = useState(round?.place || "");
  const [wall, setWall] = useState(() => parseWhen(round?.when));
  const [whenSet, setWhenSet] = useState(!!round);
  const [caption, setCaption] = useState(round?.caption || "");
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
      const prepared = await prepareMoment(picked);
      const result = await geoUploadPhoto(prepared.photo);
      if (!result.ok) { setError(result.error || "Upload failed"); return; }
      setPhoto(result.photo);
      setPreview(URL.createObjectURL(prepared.photo));
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
    if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
  };
  return <div className="fd-geo-editor">
    <div className="fd-geo-editor-photo">
      {preview ? <img src={preview} alt="The photo" /> : photo ? <DeskPhoto id={photo.id} alt="The photo" />
        : <span className="fd-geo-desk-blank" aria-hidden="true" />}
      <button type="button" disabled={!!busy} onClick={() => file.current?.click()}>
        {busy === "photo" ? "Uploading…" : photo ? "Change photo" : "Choose photo"}</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={choose} />
    </div>
    <PlaceSearch onFound={found => { setPin({ lat:found.lat, lng:found.lng }); if (!place) setPlace(found.name.slice(0, GEO_PLACE_MAX)); }} />
    <GeoMap mode="pick" pin={pin} onPick={setPin} className="fd-geo-pick" label="Drop the answer pin" />
    <label className="fd-geo-field"><span>Place</span><input value={place} maxLength={GEO_PLACE_MAX}
      onChange={event => setPlace(event.target.value)} placeholder="Shown at the reveal" /></label>
    <div className="fd-geo-field"><span>When it was taken</span>
      <WhenPicker value={wall} set={whenSet} onChange={(next, turned) => { setWall(next); if (turned) setWhenSet(true); }} />
    </div>
    <label className="fd-geo-field"><span>Caption · optional</span><input value={caption} maxLength={GEO_CAPTION_MAX}
      onChange={event => setCaption(event.target.value)} placeholder="Shown at the reveal" /></label>
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
  const save = async payload => {
    const result = await onAct("geoSaveRound", payload);
    if (result?.ok) setEditing(null);
    return result;
  };
  const remove = async id => {
    if (confirm !== id) { setConfirm(id); return; }
    setConfirm(null);
    const result = await geoDeleteRound(id);
    if (!result.ok) notify?.(result.error || "Couldn't delete. Try again.");
  };
  if (editing) return <RoundEditor round={editing === "new" ? null : rounds.find(round => round.id === editing)}
    onSave={save} onCancel={() => setEditing(null)} />;
  return <div className="fd-geo-desk">
    {running && <div className="fd-geo-running">
      <span>Game running · photo {state.geo.index + 1} of {state.geo.order.length}</span>
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
            onClick={() => onAct("geoMoveRound", { id:round.id, by:-1 })}>↑</button>
          <button type="button" aria-label={`Move ${round.place} down`} disabled={index === rounds.length - 1}
            onClick={() => onAct("geoMoveRound", { id:round.id, by:1 })}>↓</button>
          <button type="button" onClick={() => setEditing(round.id)}>Edit</button>
          <button type="button" className={confirm === round.id ? "is-confirm" : ""} onClick={() => remove(round.id)}>
            {confirm === round.id ? "Delete?" : "Delete"}</button>
        </span>}
      </li>)}
    </ol>
    {!running && rounds.length < GEO_MAX_ROUNDS && <button type="button" className="fd-geo-send"
      onClick={() => setEditing("new")}>Add photo</button>}
    <p className="fd-geo-hint">{rounds.length} of {GEO_MAX_ROUNDS} photos</p>
  </div>;
}
