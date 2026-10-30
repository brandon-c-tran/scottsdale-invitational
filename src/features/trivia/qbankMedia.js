/* The Question bank desk's clip preview: a record's audio or video plays
   exactly its window (media.start for media.duration seconds), the window
   the TV will play. One clip at a time across the app: an audio clip runs
   on the app's one media element (src/lib/sound.js), a video in its card's
   own element, and starting either stops a song preview or a YouTube
   player (features/music/previewPlayer.js). Start it straight from the tap
   so iOS lets it sound. A tiny store for useSyncExternalStore. */
import { useSyncExternalStore } from "react";
import { previewAudioElement, setPreviewSession } from "../../lib/sound.js";
import { clipStarting, onClipStart, stopPreview } from "../music/previewPlayer.js";

let state = { key:null, status:"idle", progress:0, error:"" };
const listeners = new Set();
const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
let current = null;

/* the window in seconds: where it starts and where it stops */
export function clipBounds(media, fileDuration = Infinity) {
  const start = Math.max(0, Number(media?.start) || 0);
  const length = Number(media?.duration) > 0 ? Number(media.duration) : Math.max(0, fileDuration - start);
  return { start, end:Math.min(fileDuration, start + length), length };
}
/* how far through its window a clip is, 0 to 1 */
export function clipProgress(currentTime, media) {
  const { start, length } = clipBounds(media);
  return length > 0 ? Math.min(1, Math.max(0, (currentTime - start) / length)) : 0;
}

export function stopClip() {
  const playing = current;
  current = null;
  if (playing) {
    playing.detach();
    try { playing.el.pause(); } catch {}
  }
  if (state.key) emit({ key:null, status:"idle", progress:0, error:"" });
}
/* a song preview or a YouTube player starting stops this clip too */
onClipStart(() => stopClip());

/* Play `media` under `key`, or stop it if it is the one playing. `video` is
   the card's <video> element for a video clip. */
export function toggleClip(key, media, video = null) {
  if (state.key === key && current) { stopClip(); return; }
  stopClip();
  stopPreview();
  clipStarting();
  const el = media?.kind === "video" ? video : previewAudioElement();
  if (!el || !media?.src) { emit({ key, status:"error", error:"Can't play here" }); return; }
  if (media.kind !== "video") setPreviewSession(true);
  const { start } = clipBounds(media);
  const seek = () => { try { el.currentTime = start; } catch {} };
  const onTime = () => {
    if (current?.el !== el) return;
    const { end } = clipBounds(media, Number.isFinite(el.duration) ? el.duration : Infinity);
    if (el.currentTime >= end - 0.03) { stopClip(); return; }
    emit({ progress:clipProgress(el.currentTime, media) });
  };
  const onEnded = () => { if (current?.el === el) stopClip(); };
  const onError = () => { if (current?.el === el) { stopClip(); emit({ key, status:"error", error:"Can't load the clip" }); } };
  const onMeta = () => { if (Math.abs(el.currentTime - start) > 0.25) seek(); };
  let guard = 0;
  const onPlaying = () => {
    clearTimeout(guard);
    const { length } = clipBounds(media);
    /* a timeupdate that never comes (a background tab) still stops it */
    if (length > 0) guard = setTimeout(() => { if (current?.el === el) stopClip(); }, (length + 1.5) * 1000);
    emit({ status:"playing" });
  };
  el.addEventListener("timeupdate", onTime);
  el.addEventListener("ended", onEnded);
  el.addEventListener("error", onError);
  el.addEventListener("loadedmetadata", onMeta);
  el.addEventListener("playing", onPlaying);
  current = { el, key, detach:() => {
    clearTimeout(guard);
    el.removeEventListener("timeupdate", onTime);
    el.removeEventListener("ended", onEnded);
    el.removeEventListener("error", onError);
    el.removeEventListener("loadedmetadata", onMeta);
    el.removeEventListener("playing", onPlaying);
  } };
  const src = new URL(media.src, typeof location !== "undefined" ? location.href : "http://local/").href;
  if (el.src !== src) { el.src = media.src; el.preload = "auto"; }
  if (el.readyState >= 1) seek();
  emit({ key, status:"loading", progress:0, error:"" });
  const played = el.play();
  played?.catch?.(() => { if (current?.el === el) { stopClip(); emit({ key, status:"error", error:"Tap again to play" }); } });
}

export function useClip(key) {
  const snap = useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => state);
  const mine = snap.key === key;
  return { status:mine ? snap.status : "idle", progress:mine ? snap.progress : 0, error:mine ? snap.error : "" };
}
