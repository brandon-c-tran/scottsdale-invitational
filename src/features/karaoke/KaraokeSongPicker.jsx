import React, { useEffect, useRef, useState } from "react";
import { karaokeVideo, karaokeVideos, spotifySearch } from "../../lib/client.js";
import { setPreviewSession } from "../../lib/sound.js";
import { loadYouTube, YT_STATE } from "../../lib/youtube.js";
import { writeError } from "../../lib/writeErrors.js";
import { songTitle } from "../../../shared/audio.js";
import { PlayArt, SongSearch, StillArt } from "../music/WinSongPicker.jsx";
import { clipStarting, onClipStart, stopPreview } from "../music/previewPlayer.js";
import {
  KARAOKE_CREDIT, LOOKUP_FAILED, NOT_A_LINK, SAVE_FAILED, karaokeChoice, previewProblem, sameSong, searchCredit,
  thumbOf, videoChoices, videoLength, youTubeIdFrom,
} from "./songPick.js";
import "./songPicker.css";

/* A guest's karaoke song (docs/KARAOKE.md): search Spotify as for the win
   song, pick it, and the server finds up to three karaoke uploads on
   YouTube; each thumbnail previews its video in YouTube's own player, Use
   saves the song with that video (the others ride along as alternates for
   the TV), and a pasted YouTube link works too. `muted` (the pick window):
   previews play with the sound off and the covers stay still, so the room
   never hears the song. `onChoose(track)` is the write; it answers the ack.
   The profile's Karaoke section and the pick window's Change share it. */

/* each song's lookup on this phone, kept while the page lives: a found
   answer and "none" (a failure is asked again) */
const looked = new Map();

export function KaraokeSongPicker({ value, enabled = true, muted = false, compact = false, active = true, onChoose,
  search = spotifySearch, findVideos = karaokeVideos, checkVideo = karaokeVideo }) {
  const [mode, setMode] = useState(value ? "saved" : "search");
  const [track, setTrack] = useState(null);
  const [found, setFound] = useState({ status:"idle", videos:[], error:"" });
  const [pasted, setPasted] = useState(null);
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState(null);
  const asked = useRef(0), live = useRef(true);
  const shown = recent || value || null;

  useEffect(() => { live.current = true; return () => { live.current = false; stopPreview(); }; }, []);
  /* the song just saved stands until a frame carries a different one */
  useEffect(() => { if (value) setRecent(current => current && !sameSong(current, value) ? null : current); }, [value]);
  useEffect(() => { if (mode === "saved" && !shown) setMode("search"); }, [mode, shown]);
  /* a hidden section never keeps playing */
  useEffect(() => { if (!active) { setOpen(null); stopPreview(); } }, [active]);

  if (!enabled) return shown ? <div className={`fd-song fd-ksong${compact ? " is-compact" : ""}`}>
    <SavedSong song={shown} muted={muted} compact={compact} open={open} setOpen={setOpen} />
    <p className="fd-song-credit">{KARAOKE_CREDIT}</p>
  </div> : null;

  const lookUp = async song => {
    const mine = ++asked.current;
    const kept = looked.get(song.trackId);
    if (kept) { setFound({ status:"done", ...kept }); return; }
    setFound({ status:"finding", videos:[], error:"" });
    const result = await findVideos({ trackId:song.trackId, name:song.name, artist:(song.artists || [])[0] || "",
      durationMs:song.durationMs });
    if (!live.current || mine !== asked.current) return;
    if (result?.ok && Array.isArray(result.videos)) {
      const answer = { videos:result.videos, error:"" };
      looked.set(song.trackId, answer);
      setFound({ status:"done", ...answer });
      return;
    }
    const answer = { videos:[], error:writeError(result, LOOKUP_FAILED) };
    if (result?.code === "none") { looked.set(song.trackId, answer); setFound({ status:"done", ...answer }); }
    else setFound({ status:"error", ...answer });
  };
  const pick = song => {
    stopPreview();
    setOpen(null); setError(""); setPasted(null);
    setTrack(song); setMode("videos");
    lookUp(song);
  };
  const change = () => { stopPreview(); setOpen(null); setError(""); setMode("search"); };
  const candidates = videoChoices(found.videos, pasted);
  const use = async video => {
    if (saving || !track) return;
    stopPreview();
    setOpen(null); setSaving(video.id); setError("");
    const song = karaokeChoice(track, video, candidates);
    let result;
    try { result = await onChoose(song); }
    catch (failure) { result = { ok:false, error:writeError(failure, SAVE_FAILED) }; }
    if (!live.current) return;
    setSaving(null);
    if (result?.ok !== true) { setError(writeError(result, SAVE_FAILED)); return; }
    setRecent(song); setTrack(null); setPasted(null); setMode("saved");
  };

  return <div className={`fd-song fd-ksong${compact ? " is-compact" : ""}`}>
    {mode === "search" && <SongSearch search={search} clips={!muted} credit={searchCredit(!muted)}
      onCancel={shown ? () => setMode("saved") : null} onPick={pick} />}
    {mode === "saved" && shown && <>
      <SavedSong song={shown} muted={muted} compact={compact} open={open} setOpen={setOpen} onChange={change} />
      <p className="fd-song-credit">{KARAOKE_CREDIT}</p>
    </>}
    {mode === "videos" && track && <VideoStep track={track} found={found} candidates={candidates} muted={muted}
      compact={compact} open={open} setOpen={setOpen} saving={saving} error={error} onChange={change}
      onRetry={() => lookUp(track)} onUse={use} check={checkVideo} onPasted={video => { setPasted(video); setError(""); }} />}
  </div>;
}

/* The song picked, then its videos: the server looking (nothing else
   waits on it), up to three candidates, YouTube's refusal or "none", a
   pasted link, and a save's failure. Drawn from props alone. */
export function VideoStep({ track, found, candidates = videoChoices(found?.videos), muted = false, compact = false,
  open = null, setOpen = () => {}, saving = null, error = "", onChange, onRetry, onUse, check, onPasted }) {
  const size = compact ? 52 : 64;
  return <>
    <div className="fd-song-pick fd-ksong-song">
      {muted ? <StillArt track={track} size={size} /> : <PlayArt track={track} size={size} />}
      <span className="fd-song-text"><strong data-fit="ellipsis">{songTitle(track.name)}</strong>
        <small data-fit="ellipsis">{(track.artists || []).join(", ")}</small></span>
      <button type="button" className="fd-song-change" onClick={onChange}>Change</button>
    </div>
    <div className="fd-ksong-status" role="status" aria-live="polite">
      {found?.status === "finding" ? <span className="fd-ksong-finding">Finding karaoke versions</span>
        : found?.error ? <span className={found.status === "error" ? "is-error" : undefined}>{found.error}</span> : ""}
    </div>
    {found?.status === "error" && <button type="button" className="fd-ksong-retry" onClick={onRetry}>Try again</button>}
    {!!candidates.length && <ul className="fd-ksong-videos" aria-label="Karaoke videos">
      {candidates.map(video => <VideoRow key={video.id} video={video} muted={muted} open={open === video.id}
        onToggle={() => setOpen(current => current === video.id ? null : video.id)}
        saving={saving} onUse={() => onUse(video)} />)}
    </ul>}
    <PasteLink check={check} onVideo={onPasted} />
    {error && <p className="fd-ksong-error" role="alert">{error}</p>}
    <p className="fd-song-credit">{KARAOKE_CREDIT}</p>
  </>;
}

/* the saved song: its cover (the clip, unless muted), its name, and the
   video the TV will play, which previews like any candidate */
function SavedSong({ song, muted, compact, open, setOpen, onChange = null }) {
  const size = compact ? 52 : 84;
  return <>
    <div className="fd-song-pick fd-ksong-song">
      {muted || !song.trackId ? <StillArt track={song} size={size} /> : <PlayArt track={song} size={size} />}
      <span className="fd-song-text"><strong data-fit="ellipsis">{songTitle(song.name)}</strong>
        <small data-fit="ellipsis">{(song.artists || []).join(", ")}</small></span>
      {onChange && <button type="button" className="fd-song-change" onClick={onChange}>Change</button>}
    </div>
    {song.video && <ul className="fd-ksong-videos" aria-label="Karaoke video">
      <VideoRow video={song.video} muted={muted} open={open === song.video.id}
        onToggle={() => setOpen(current => current === song.video.id ? null : song.video.id)} />
    </ul>}
  </>;
}

/* one upload: its thumbnail starts and closes the preview (YouTube's rule:
   a thumbnail that plays is at least 120x70), its channel and length, Use */
function VideoRow({ video, muted, open, onToggle, saving = null, onUse = null }) {
  const busy = saving === video.id;
  return <li className={`fd-ksong-video${open ? " is-open" : ""}`}>
    <div className="fd-ksong-video-row">
      <button type="button" className="fd-ksong-thumb" aria-pressed={open} onClick={onToggle}
        aria-label={`${open ? "Close" : "Preview"} ${video.title || video.channel || "the video"}`}>
        <img src={thumbOf(video)} alt="" width={128} height={72} loading="lazy" decoding="async" />
        <span className="fd-ksong-thumb-glyph" aria-hidden="true">{open ? <CloseGlyph /> : <PlayGlyph />}</span>
      </button>
      <span className="fd-ksong-video-text"><strong data-fit="ellipsis">{video.channel || "YouTube"}</strong>
        <small>{videoLength(video.seconds)}</small></span>
      {onUse && <button type="button" className="fd-ksong-use" onClick={onUse} disabled={!!saving} aria-busy={busy}
        aria-label={`Use the ${video.channel || "YouTube"} video`}>{busy ? "Saving" : "Use"}</button>}
    </div>
    {open && <VideoPreview video={video} muted={muted} />}
  </li>;
}
const PlayGlyph = () => <svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 2.5v11l9-5.5z" /></svg>;
const CloseGlyph = () => <svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" /></svg>;

/* YouTube's own visible player, one at a time: it starts as it opens
   (an iPhone may want the first play tapped on the video itself), pauses
   when a clip or another preview starts, and is gone once closed. Muted,
   the sound stays off so only the lyrics show. */
function VideoPreview({ video, muted }) {
  const host = useRef(null), player = useRef(null);
  const [problem, setProblem] = useState("");
  const pause = useRef(() => { try { player.current?.pauseVideo(); } catch {} });
  useEffect(() => onClipStart(pause.current), []);
  useEffect(() => {
    const hide = () => { if (document.hidden) pause.current(); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    let alive = true;
    setProblem("");
    host.current?.scrollIntoView?.({ block:"nearest", behavior:"smooth" });
    loadYouTube().then(YT => {
      if (!alive || !host.current) return;
      const slot = document.createElement("div");
      host.current.appendChild(slot);
      player.current = new YT.Player(slot, {
        videoId:video.id, width:"100%", height:"100%",
        playerVars:{ playsinline:1, rel:0, fs:0, controls:1 },
        events:{
          onReady:event => { try { if (muted) event.target.mute(); event.target.playVideo(); } catch {} },
          onStateChange:event => {
            if (event.data !== YT_STATE.PLAYING) return;
            stopPreview();
            clipStarting(pause.current);
            if (!muted) setPreviewSession(true);
          },
          onError:event => { if (alive) setProblem(previewProblem(Number(event?.data))); },
        },
      });
    }, () => { if (alive) setProblem("YouTube did not load. Try again"); });
    return () => {
      alive = false;
      try { player.current?.destroy(); } catch {}
      player.current = null;
      if (host.current) host.current.textContent = "";
    };
  }, [video.id, muted]);
  return <div className="fd-ksong-preview">
    <div ref={host} className="fd-ksong-player" />
    {problem && <p className="fd-ksong-error" role="alert">{problem}</p>}
  </div>;
}

/* a YouTube link of the guest's own: checked as it lands (one read on the
   server), then it stands first among the candidates */
function PasteLink({ check, onVideo }) {
  const [text, setText] = useState("");
  const [state, setState] = useState({ status:"idle", error:"" });
  const asked = useRef(0);
  useEffect(() => {
    const mine = ++asked.current;
    const raw = text.trim();
    if (!raw) { setState({ status:"idle", error:"" }); return undefined; }
    const timer = setTimeout(async () => {
      const id = youTubeIdFrom(raw);
      if (!id) { setState({ status:"error", error:NOT_A_LINK }); return; }
      setState({ status:"checking", error:"" });
      const result = await check(id);
      if (mine !== asked.current) return;
      if (result?.ok && result.video?.id) { onVideo(result.video); setText(""); return; }
      setState({ status:"error", error:writeError(result, "That link didn't check out. Try another.") });
    }, 400);
    return () => clearTimeout(timer);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="fd-ksong-paste">
    <input type="url" inputMode="url" value={text} maxLength={300} placeholder="Paste a YouTube link"
      aria-label="Paste a YouTube link" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
      enterKeyHint="done" onChange={event => setText(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    <div className="fd-ksong-status" role="status" aria-live="polite">
      {state.status === "checking" ? "Checking the link"
        : state.status === "error" ? <span className="is-error">{state.error}</span> : ""}
    </div>
  </div>;
}
