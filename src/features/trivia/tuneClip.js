/* Name that tune on the TV: the question's 30-second clip (Deezer, looked up
   by the Worker once the question is up) plays its first ten seconds from
   the question's own start on the server clock, through the app's one media
   element (src/lib/sound.js). A TV that arrives late joins mid-clip; one
   that arrives after the window stays quiet. Phones never play it. The
   TV's Sound switch and "Sound early by" apply. */
import { useEffect } from "react";
import { triviaClip } from "../../lib/client.js";
import { previewAudioElement, soundEarlyMs, soundOptedOut } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { TRIVIA_CLIP_MS } from "../../../shared/trivia.js";

const FADE_MS = 500;
const ready = (el, ms = 4000) => new Promise(resolve => {
  if (el.readyState >= 3) { resolve(true); return; }
  const done = ok => { el.removeEventListener("canplay", yes); clearTimeout(timer); resolve(ok); };
  const yes = () => done(true);
  const timer = setTimeout(() => done(false), ms);
  el.addEventListener("canplay", yes);
});

/* the clip's window for a question: where it starts, how far in a late TV is */
export function clipWindow(startsAt, now, early = 0, length = TRIVIA_CLIP_MS) {
  const begin = startsAt - early;
  const into = now - begin;
  if (into >= length - FADE_MS) return null;
  return { wait:Math.max(0, -into), offset:Math.max(0, into) / 1000, left:length - Math.max(0, into) };
}

export function useTuneClip({ id = null, active = false, startsAt = 0, length = TRIVIA_CLIP_MS }) {
  useEffect(() => {
    if (!id || !active || soundOptedOut()) return undefined;
    const el = previewAudioElement();
    if (!el) return undefined;
    let gone = false, fader = 0;
    const timers = [];
    const fade = (to, ms, then) => {
      clearInterval(fader);
      const from = el.volume, began = Date.now();
      fader = setInterval(() => {
        const k = Math.min(1, (Date.now() - began) / ms);
        try { el.volume = from + (to - from) * k; } catch {}
        if (k >= 1) { clearInterval(fader); then?.(); }
      }, 40);
    };
    (async () => {
      const found = await triviaClip(id);
      if (gone || !found?.ok || !found.url) return;
      el.src = found.url;
      el.preload = "auto";
      if (!await ready(el) || gone) return;
      const win = clipWindow(startsAt, serverNow(), soundEarlyMs(), length);
      if (!win) return;
      timers.push(setTimeout(() => {
        if (gone) return;
        const now = clipWindow(startsAt, serverNow(), soundEarlyMs(), length);
        if (!now) return;
        try { el.currentTime = now.offset; } catch {}
        el.volume = 0;
        el.play().then(() => fade(1, FADE_MS)).catch(() => {});
        timers.push(setTimeout(() => fade(0, FADE_MS, () => el.pause()), Math.max(0, now.left - FADE_MS)));
      }, win.wait));
    })();
    return () => {
      gone = true;
      timers.forEach(clearTimeout);
      if (!el.paused) fade(0, 300, () => el.pause());
    };
  }, [id, active, startsAt, length]);
}
