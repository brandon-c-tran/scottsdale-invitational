/* One audio element for the whole app's song previews: tapping another song
   stops the first, like a music picker. iOS only lets a page start audio
   inside a tap, so play() unlocks the element synchronously in the tap, then
   the clip's address arrives and plays on the same (now unlocked) element.
   The state is a tiny store for useSyncExternalStore. */
import { useSyncExternalStore } from "react";
import { songPreview } from "../../lib/client.js";
import { previewAudioElement, setPreviewSession } from "../../lib/sound.js";

/* a tenth of a second of silence as a WAV: what the tap plays to unlock the
   element before the clip's address arrives */
function silentWav(samples = 800, rate = 8000) {
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at, value) => [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, "data"); view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `data:audio/wav;base64,${btoa(binary)}`;
}
let silence = null;

let audio = null;
let state = { key:null, status:"idle", progress:0, error:"" };
const listeners = new Set();
const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => state;
/* answers already fetched on this phone (the address expires; reuse for a few minutes) */
const known = new Map();
const KNOWN_MS = 8 * 60 * 1000;
let request = 0;

function element() {
  if (audio) return audio;
  audio = previewAudioElement();
  if (!audio) return null;
  audio.preload = "auto";
  /* back to "ambient" only once nothing is playing or on its way (a swap
     to the next clip, or the unlock silence ending, is not a stop) */
  const settle = () => { if (state.status !== "playing" && state.status !== "loading") setPreviewSession(false); };
  audio.addEventListener("pause", settle);
  audio.addEventListener("timeupdate", () => {
    if (state.status !== "playing" || !audio.duration) return;
    emit({ progress:Math.min(1, audio.currentTime / audio.duration) });
  });
  /* only the clip's end resets; the unlock silence ending does not */
  audio.addEventListener("ended", () => {
    if (state.status === "playing") emit({ status:"idle", progress:0, key:null });
    settle();
  });
  audio.addEventListener("error", () => {
    if (state.status === "loading" || state.status === "playing") emit({ status:"error", error:"Preview unavailable" });
  });
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopPreview(); });
  return audio;
}

export const trackKey = track => track?.trackId || null;

/* the snippet player (SnippetPlayer.jsx) and the clip never play together */
let stopSnippet = null;
export const onClipStart = stop => { stopSnippet = stop; return () => { if (stopSnippet === stop) stopSnippet = null; }; };

/* Call straight from the tap. The same song toggles; another song replaces. */
export function togglePreview(track) {
  const el = element();
  const key = trackKey(track);
  if (!el || !key) return;
  if (state.key === key && state.status === "playing") { el.pause(); emit({ status:"paused" }); return; }
  /* the session switches before play, inside the tap, or iOS mutes the start */
  setPreviewSession(true);
  try { stopSnippet?.(); } catch {}
  if (state.key === key && state.status === "paused") { el.play().catch(() => {}); emit({ status:"playing" }); return; }
  const mine = ++request;
  el.pause();
  const cached = known.get(key);
  if (cached && Date.now() - cached.at < KNOWN_MS) { start(el, key, cached.url); return; }
  /* unlock inside the tap, then fetch the clip */
  silence = silence || silentWav();
  el.src = silence;
  el.play().catch(() => {});
  emit({ key, status:"loading", progress:0, error:"" });
  songPreview({ isrc:track.isrc || "", name:track.name || "", artist:(track.artists || [])[0] || "" }).then(result => {
    if (mine !== request) return;
    if (!result?.ok || !result.url) { emit({ status:"error", error:result?.error || "Preview unavailable" }); return; }
    known.set(key, { url:result.url, at:Date.now() });
    start(el, key, result.url);
  });
}

function start(el, key, url) {
  el.src = url;
  emit({ key, status:"playing", progress:0, error:"" });
  el.play().catch(() => emit({ status:"error", error:"Tap play again" }));
}

/* play this song unless it is already playing or on its way */
export function ensurePreview(track) {
  const key = trackKey(track);
  if (key && state.key === key && (state.status === "playing" || state.status === "loading")) return;
  togglePreview(track);
}

export function stopPreview() {
  request++;
  if (audio) audio.pause();
  if (state.status !== "idle") emit({ key:null, status:"idle", progress:0, error:"" });
}

/* what one song's button shows: idle, loading, playing, paused or error */
export function usePreview(track) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const mine = current.key && current.key === trackKey(track);
  return mine ? current : { key:null, status:"idle", progress:0, error:"" };
}
