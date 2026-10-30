/* A question bank clue's media on the board (docs/TRIVIA-QBANK.md): the
   image the TV shows (and a phone, small), the audio or video clip only the
   TV plays, exactly its window (`start` seconds in, `duration` long), from
   the instant the server set (shared/triviaBoard.js clipStart: the arm, a
   rebound's arm, the host's replay; his pause stops it). A TV that joins
   late joins mid-clip; one that joins after the window stays quiet. The
   clue leaving (the reveal, the next pick) stops it. Audio plays through
   the app's one media element (src/lib/sound.js), video through the
   clue's own <video>; the TV's Sound switch and "Sound early by" apply.

   The TV reports the clue's media ready (boardMediaReady) once it has the
   file, so the buzzers arm on the media rather than a guess; once per clue,
   only while the server waits for it, never from a still (fit) frame. */
import { useEffect, useRef } from "react";
import { clipStart } from "../../../shared/triviaBoard.js";
import { dispatch } from "../../lib/client.js";
import { previewAudioElement, soundEarlyMs, soundOptedOut } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { clipWindow } from "./tuneClip.js";

/* the clue's media and, once revealed, what replaces it */
export const clueMediaOf = clue => clue?.media?.src ? clue.media : null;
export const shownMediaOf = (clue, revealed = false) => (revealed && clue?.revealMedia?.src ? clue.revealMedia : clueMediaOf(clue));

/* What the TV's clip does now: null, or { key, kind, src, start, ms, at,
   active } where `at` is when it plays on the server clock and `active`
   whether it should be heard now. It plays while the buzzers wait for a
   buzz (each race's own arm), through a Daily Double's turn, and on the
   host's replay while someone answers. */
export function boardClipPlan(view, now) {
  if (!view?.clue || !view.game) return null;
  const media = clueMediaOf(view.clue);
  if (!media || (media.kind !== "audio" && media.kind !== "video")) return null;
  const clip = clipStart(view.game, view.clueId);
  if (!clip) return null;
  const phase = view.phase;
  const replay = (clip.cue || 0) > 0 && clip.at > (view.dd ? view.turnAt : view.armAt);
  const inPhase = phase === "clue" || phase === "dd-clue" || (phase === "answer" && replay);
  const active = inPhase && !clip.paused && now < clip.at + clip.ms;
  return { key:`${view.clueId}:${clip.at}`, kind:media.kind, src:media.src, start:Number(media.start) || 0, ms:clip.ms, at:clip.at,
    active, paused:!!clip.paused, replay };
}

const canPlay = (el, ms = 4000) => new Promise(resolve => {
  if (el.readyState >= 3) { resolve(true); return; }
  const done = ok => { el.removeEventListener("canplay", yes); clearTimeout(timer); resolve(ok); };
  const yes = () => done(true);
  const timer = setTimeout(() => done(false), ms);
  el.addEventListener("canplay", yes);
});

/* Play `plan` on a media element: seek to its window (late: further in),
   start on its instant, stop at its end; a short clip fades only a hair. */
function playWindow(el, plan, { onStop } = {}) {
  let gone = false, fader = 0;
  const timers = [];
  const fadeMs = Math.min(150, plan.ms / 8);
  const fade = (to, ms, then) => {
    clearInterval(fader);
    const from = el.volume, began = Date.now();
    if (ms <= 0) { try { el.volume = to; } catch {} then?.(); return; }
    fader = setInterval(() => {
      const k = Math.min(1, (Date.now() - began) / ms);
      try { el.volume = from + (to - from) * k; } catch {}
      if (k >= 1) { clearInterval(fader); then?.(); }
    }, 20);
  };
  (async () => {
    if (!await canPlay(el) || gone) return;
    const win = clipWindow(plan.at, serverNow(), soundEarlyMs(), plan.ms);
    if (!win) return;
    timers.push(setTimeout(() => {
      if (gone) return;
      const now = clipWindow(plan.at, serverNow(), soundEarlyMs(), plan.ms);
      if (!now) return;
      try { el.currentTime = plan.start + now.offset; } catch {}
      el.volume = 0;
      const started = el.play();
      const begin = () => fade(1, fadeMs);
      /* a video the browser will not start with sound plays its picture */
      started?.then?.(begin).catch(() => {
        if (el.tagName !== "VIDEO" || gone) return;
        el.muted = true;
        el.play()?.catch?.(() => {});
      });
      timers.push(setTimeout(() => fade(0, fadeMs, () => { el.pause(); onStop?.(); }), Math.max(0, now.left - fadeMs)));
    }, win.wait));
  })();
  return () => {
    gone = true;
    timers.forEach(clearTimeout);
    clearInterval(fader);
    if (!el.paused) { try { el.pause(); } catch {} }
    try { el.volume = 1; } catch {}
  };
}

/* the TV's audio clip, through the app's one media element */
export function useAudioClip(plan, { fixed = false } = {}) {
  const live = !fixed && plan?.kind === "audio" && plan.active;
  const key = live ? plan.key : null;
  const ref = useRef(plan);
  ref.current = plan;
  useEffect(() => {
    if (!key || soundOptedOut()) return undefined;
    const el = previewAudioElement();
    if (!el) return undefined;
    const current = ref.current;
    if (!el.src.endsWith(current.src)) { el.src = current.src; el.preload = "auto"; }
    return playWindow(el, current);
  }, [key]);
}

/* the TV's video clip, on the clue's own element; paused (or the clue
   moving on) it holds its frame */
export function useVideoClip(videoRef, plan, { fixed = false } = {}) {
  const live = !fixed && plan?.kind === "video" && plan.active;
  const key = live ? plan.key : null;
  const ref = useRef(plan);
  ref.current = plan;
  useEffect(() => {
    const el = videoRef.current;
    if (!key || !el) return undefined;
    el.muted = soundOptedOut();
    return playWindow(el, ref.current);
  }, [key, videoRef]);
}

/* the TV's report that a clue's media is ready to show or play */
const reported = new Set();
export function reportMediaReady(clueId) {
  if (!clueId || reported.has(clueId)) return;
  reported.add(clueId);
  if (reported.size > 200) reported.delete(reported.values().next().value);
  dispatch("boardMediaReady", { clueId });
}
/* whether the server is waiting on this TV for the clue's media */
export const mediaWaiting = view => !!view?.clueId && view.phase === "clue" && view.race === 0 && !!view.log?.mediaWait
  && !!clueMediaOf(view.clue);

/* Fetch the clue's file (an image decoded), then report it ready. */
export function useMediaReady(view, { fixed = false, report = reportMediaReady } = {}) {
  const waiting = !fixed && mediaWaiting(view);
  const clueId = waiting ? view.clueId : null;
  const src = waiting ? clueMediaOf(view.clue).src : null;
  const kind = waiting ? clueMediaOf(view.clue).kind : null;
  useEffect(() => {
    if (!clueId || !src) return undefined;
    let gone = false;
    const done = () => { if (!gone) report(clueId); };
    if (kind === "image" && typeof Image !== "undefined") {
      const img = new Image();
      img.src = src;
      (img.decode ? img.decode() : new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; })).then(done, () => {});
    } else if (typeof fetch === "function") {
      fetch(src).then(res => res.ok ? res.blob() : null).then(blob => { if (blob) done(); }, () => {});
    }
    return () => { gone = true; };
  }, [clueId, src, kind, report]);
}
