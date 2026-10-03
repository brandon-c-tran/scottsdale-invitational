import React, { useEffect, useRef, useState } from "react";
import { songSnippet } from "../../lib/client.js";
import { setPreviewSession } from "../../lib/sound.js";
import { onClipStart, stopPreview } from "./previewPlayer.js";
import { songClock } from "./winSongModel.js";

/* "Preview 1:05 to 1:35": the song's album upload on YouTube (worker/
   youtube.js), played in YouTube's own visible player from the start point
   to the end of the room's 30 seconds. Moving the window re-cues it. iOS
   may want the first play tapped on the video itself; after that the
   button plays it. The 30-second clip on the cover and this never play
   together. */
const API_URL = "https://www.youtube.com/iframe_api";
let apiPromise = null;
function loadYouTube() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { earlier?.(); } catch {} resolve(window.YT); };
    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onerror = () => { apiPromise = null; reject(new Error("YouTube unavailable")); };
    document.head.appendChild(script);
  });
  return apiPromise;
}
const PLAYING = 1;

export function SnippetPreview({ track, from, to, find = songSnippet }) {
  const [view, setView] = useState({ status:"idle", error:"" });
  const host = useRef(null), player = useRef(null), video = useRef(null), playing = useRef(false);
  const bounds = () => ({ videoId:video.current, startSeconds:Math.floor(from / 1000), endSeconds:Math.ceil(to / 1000) });

  /* a new song forgets the old upload */
  useEffect(() => () => {
    try { player.current?.destroy(); } catch {}
    player.current = null; video.current = null; playing.current = false;
    if (host.current) host.current.textContent = "";
    setView({ status:"idle", error:"" });
  }, [track.trackId]);
  useEffect(() => onClipStart(() => { try { player.current?.pauseVideo(); } catch {} }), []);
  /* the window moved: cue the new bounds (a playing snippet restarts there) */
  useEffect(() => {
    if (!player.current?.cueVideoById || !video.current) return undefined;
    const timer = setTimeout(() => {
      try { playing.current ? player.current.loadVideoById(bounds()) : player.current.cueVideoById(bounds()); } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = async () => {
    stopPreview();
    setPreviewSession(true);
    if (player.current?.loadVideoById && video.current) {
      if (playing.current) { player.current.pauseVideo(); return; }
      player.current.loadVideoById(bounds());
      return;
    }
    if (view.status === "finding") return;
    setView({ status:"finding", error:"" });
    const result = await find({ trackId:track.trackId, name:track.name, artist:(track.artists || [])[0] || "",
      durationMs:track.durationMs });
    if (!result?.ok || !result.videoId) { setView({ status:"error", error:result?.error || "Preview unavailable" }); return; }
    video.current = result.videoId;
    let YT;
    try { YT = await loadYouTube(); } catch { setView({ status:"error", error:"YouTube did not load. Try again" }); return; }
    if (!host.current || video.current !== result.videoId) return;
    const slot = document.createElement("div");
    host.current.appendChild(slot);
    const start = bounds();
    player.current = new YT.Player(slot, {
      videoId:result.videoId, width:"100%", height:"100%",
      playerVars:{ start:start.startSeconds, end:start.endSeconds, playsinline:1, rel:0, fs:0, controls:1 },
      events:{
        onReady:event => { try { event.target.playVideo(); } catch {} },
        onStateChange:event => {
          playing.current = event.data === PLAYING;
          if (playing.current) { stopPreview(); setPreviewSession(true); }
          setView(current => ({ ...current, status:playing.current ? "playing" : "ready" }));
        },
      },
    });
    setView({ status:"ready", error:"" });
  };

  const shown = view.status === "ready" || view.status === "playing";
  return <div className="fd-song-snippet">
    <button type="button" className={`fd-song-snippet-go is-${view.status}`} onClick={play} aria-busy={view.status === "finding"}>
      {view.status === "playing" ? "Pause" : view.status === "finding" ? "Finding the song"
        : `Preview ${songClock(from)} to ${songClock(to)}`}</button>
    {view.status === "error" && <p className="fd-song-snippet-note is-error" role="alert">{view.error}</p>}
    <div ref={host} className="fd-song-snippet-video" hidden={!shown} />
  </div>;
}
