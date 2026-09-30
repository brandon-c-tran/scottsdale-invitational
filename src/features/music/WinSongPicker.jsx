import React, { useEffect, useRef, useState } from "react";
import { spotifySearch } from "../../lib/client.js";
import { ensurePreview, stopPreview, togglePreview, usePreview } from "./previewPlayer.js";
import { SnippetPreview } from "./SnippetPreview.jsx";
import { NUDGE_MS, SEARCH_DEBOUNCE_MS, clampStart, clipWindow, maxStart, searchQuery, songClock } from "./winSongModel.js";
import "./winSong.css";

/* answers this phone already has, so retyping a word costs no search */
const searched = new Map();
const artistsOf = track => (track.artists || []).join(", ");

/* The album art is the play button: tap to hear the song's 30-second clip
   on this phone, tap again to pause. A ring fills as it plays. */
function PlayArt({ track, size }) {
  const preview = usePreview(track);
  const playing = preview.status === "playing", loading = preview.status === "loading";
  const r = size / 2 - 2, around = 2 * Math.PI * r;
  return <button type="button" className={`fd-song-play is-${preview.status}`} style={{ width:size, height:size }}
    onClick={() => togglePreview(track)} aria-pressed={playing}
    aria-label={`${playing ? "Pause" : "Play"} a preview of ${track.name}`}>
    {track.imageUrl ? <img src={track.imageUrl} alt="" width={size} height={size} />
      : <span className="fd-song-play-blank" aria-hidden="true" />}
    <span className="fd-song-play-glyph" aria-hidden="true">{playing ? <PauseGlyph /> : loading ? null : <PlayGlyph />}</span>
    {(playing || loading || preview.status === "paused") && <svg className="fd-song-ring" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="fd-song-ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className={`fd-song-ring-fill${loading ? " is-loading" : ""}`}
        strokeDasharray={around} strokeDashoffset={loading ? around * 0.75 : around * (1 - preview.progress)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>}
  </button>;
}
const PlayGlyph = () => <svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 2.5v11l9-5.5z" /></svg>;
const PauseGlyph = () => <svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" /></svg>;

/* Results arrive as the guest types; the list stays put while the next
   answer loads, and a slower, older answer never replaces a newer one. */
function SongSearch({ onPick, onCancel, search }) {
  const [text, setText] = useState("");
  const [found, setFound] = useState({ status:"idle", tracks:[], error:"" });
  const input = useRef(null);
  useEffect(() => { input.current?.focus({ preventScroll:true }); }, []);
  useEffect(() => {
    const query = searchQuery(text);
    if (!query) { setFound({ status:"idle", tracks:[], error:"" }); return undefined; }
    const key = query.toLowerCase();
    if (searched.has(key)) { setFound({ status:"done", tracks:searched.get(key), error:"" }); return undefined; }
    setFound(current => ({ ...current, status:"loading", error:"" }));
    let live = true;
    const timer = setTimeout(async () => {
      const result = await search(query);
      if (!live) return;
      if (!result?.ok) { setFound({ status:"error", tracks:[], error:result?.error || "Search failed. Try again." }); return; }
      const tracks = result.tracks || [];
      searched.set(key, tracks);
      setFound({ status:"done", tracks, error:"" });
    }, SEARCH_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [text, search]);

  return <div className="fd-song-search">
    <div className="fd-song-field">
      <input ref={input} type="search" value={text} maxLength={80} placeholder="Song or artist"
        aria-label="Search Spotify" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
        onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      {text && <button type="button" className="fd-song-clear" aria-label="Clear search" onClick={() => {
        setText(""); input.current?.focus(); }}>×</button>}
      {onCancel && <button type="button" className="fd-song-cancel" onClick={onCancel}>Cancel</button>}
    </div>
    <div className="fd-song-status" role="status" aria-live="polite">
      {found.status === "loading" ? "Searching"
        : found.status === "error" ? <span className="is-error">{found.error}</span>
          : found.status === "done" && !found.tracks.length ? "No songs match" : ""}
    </div>
    {!!found.tracks.length && <ul className={`fd-song-results${found.status === "loading" ? " is-stale" : ""}`}>
      {found.tracks.map(track => <li key={track.trackId} className="fd-song-row">
        <PlayArt track={track} size={52} />
        <button type="button" className="fd-song-use" onClick={() => onPick(track)}
          aria-label={`Use ${track.name} by ${artistsOf(track)}`}>
          <span className="fd-song-text"><strong>{track.name}{track.explicit && <i className="fd-song-e">E</i>}</strong>
            <small>{artistsOf(track)} · {songClock(track.durationMs)}</small></span>
          <span className="fd-song-use-pill" aria-hidden="true">Use</span>
        </button>
      </li>)}
    </ul>}
    <p className="fd-song-credit">Songs from Spotify. Previews from Deezer.</p>
  </div>;
}

/* The start point: the whole song as a timeline with the 30-second window
   the room hears, dragged into place, and five-second nudges. */
function StartWindow({ value, onChange, snippets }) {
  const strip = useRef(null);
  const grab = useRef(null);
  const duration = Math.max(1000, Number(value.durationMs) || 0);
  const { from, to, text } = clipWindow(value);
  const set = ms => onChange({ ...value, startMs:clampStart(value, ms) });
  const at = event => {
    const rect = strip.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))) * duration;
  };
  const down = event => {
    event.preventDefault();
    try { strip.current.setPointerCapture(event.pointerId); } catch {}
    const point = at(event);
    /* grabbing the window keeps its hold point; a tap elsewhere centres it there */
    grab.current = point >= from && point <= to ? point - from : (to - from) / 2;
    set(point - grab.current);
  };
  const move = event => { if (grab.current !== null) set(at(event) - grab.current); };
  const up = () => { grab.current = null; };
  const key = event => {
    const step = event.key === "ArrowRight" ? 1000 : event.key === "ArrowLeft" ? -1000 : 0;
    if (step) { event.preventDefault(); set(from + step); }
  };
  const minutes = Array.from({ length:Math.floor(duration / 60000) + 1 }, (_, i) => i * 60000);
  const ticks = Array.from({ length:Math.floor(duration / 5000) + 1 }, (_, i) => i * 5000);
  return <div className="fd-song-start">
    <div className="fd-song-start-head"><span>Start point</span><strong>{songClock(from)}</strong></div>
    <div ref={strip} className="fd-song-strip" role="slider" tabIndex={0} aria-label="Win song start point"
      aria-valuemin={0} aria-valuemax={maxStart(value)} aria-valuenow={from} aria-valuetext={text}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      {ticks.map(ms => <i key={ms} className={ms % 60000 === 0 ? "is-minute" : undefined}
        style={{ left:`${ms / duration * 100}%` }} />)}
      <span className="fd-song-window" style={{ left:`${from / duration * 100}%`, width:`${(to - from) / duration * 100}%` }} />
    </div>
    <div className="fd-song-minutes" aria-hidden="true">
      {minutes.map(ms => <span key={ms} style={{ left:`${ms / duration * 100}%` }}>{songClock(ms)}</span>)}
    </div>
    <div className="fd-song-start-foot">
      <button type="button" onClick={() => set(from - NUDGE_MS)} disabled={from <= 0} aria-label="Back 5 seconds">−5 s</button>
      <span>{text}</span>
      <button type="button" onClick={() => set(from + NUDGE_MS)} disabled={from >= maxStart(value)} aria-label="Forward 5 seconds">+5 s</button>
    </div>
    {snippets && <SnippetPreview track={value} from={from} to={to} />}
  </div>;
}

/* The profile's Win song: search as you type, tap any song's art to hear
   its clip on this phone, tap the row to use it, then drag the 30 seconds
   the room hears into place. */
export function WinSongPicker({ value, onChange, enabled = true, search = spotifySearch, snippets = false }) {
  const [changing, setChanging] = useState(!value);
  useEffect(() => () => stopPreview(), []);
  if (!enabled) return value ? <p className="fd-song-note">{value.name}</p> : null;
  const searching = changing || !value;
  const pick = track => {
    onChange({ ...track, startMs:0 });
    setChanging(false);
    /* the song just chosen plays (or keeps playing), inside this tap */
    ensurePreview(track);
  };

  return <div className="fd-song">
    <p className="fd-song-note">Plays in the room when you win. A team plays its MVP's song; a duo, one partner's.</p>
    {searching ? <SongSearch search={search} onCancel={value ? () => setChanging(false) : null} onPick={pick} />
      : <>
        <div className="fd-song-pick">
          <PlayArt track={value} size={84} />
          <span className="fd-song-text"><strong>{value.name}</strong>
            <small>{artistsOf(value)} · {songClock(value.durationMs)}</small>
            {value.url && <a href={value.url} target="_blank" rel="noreferrer">Open in Spotify</a>}</span>
          <button type="button" className="fd-song-change" onClick={() => { stopPreview(); setChanging(true); }}>Change</button>
        </div>
        <StartWindow value={value} onChange={onChange} snippets={snippets} />
        <button type="button" className="fd-song-remove" onClick={() => { stopPreview(); onChange(null); setChanging(true); }}>
          Remove song</button>
      </>}
  </div>;
}
