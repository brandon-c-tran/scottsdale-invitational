/* The bits' sound (features/gags/bits): a bit's cues on the room's clock,
   from the bit's own start, so every TV in the house lands the hit on the
   frame that lights it, and a phone the bit is about lands it with them.
   Synthesized foley from the sound kit (its BIT_PARTS): on the room bus on
   the TV, on the owner's `you` bus on a phone (centred: a phone is one
   listener, never the room's stereo). A cue more than 300 ms late is
   dropped (sound.js), so a screen that joins a bit late hears only what is
   still ahead. Reduced motion plays the bit's one summary sound. `rate`
   slows the clock with the picture (the reel's 0.25x); each cue's own
   length (opts.ms) stretches with it. `cast` (the moment's sides) adds
   what a side's size plays (registry castBit).

   The win song (shared/bitMusic.js): a music bit's cues from its hold beat
   on (`post`) run on its second clock (`origin`), so the action's foley
   lands with the song; when the origin moves (the speaker took the song),
   only those are scheduled again, under keys that carry the origin. When a
   song comes in on the bit's beat (`song`), the foley up to that beat
   plays open (past the duck) and what follows ducks under the song like
   everything else; a cue marked `unless:"song"` (the bit's own little
   groove) plays only when no song is coming. */

import { useEffect, useRef } from "react";
import { playSound } from "../../lib/sound.js";
import { cueTime, holdBeatOf, songBeatOf } from "../../../shared/bitMusic.js";
import { bitById, castBit } from "../gags/bits/registry.js";

/* every cue as { id, at, pan, opts, key, open, bus, part }: `part` "pre"
   (on the start's clock) or "post" (on the origin's, a music bit's from its
   hold beat on) */
export function bitCues(bit, { start, origin, song = false, reduced = false, rate = 1, key = null, bus = "room", cast = null } = {}) {
  const b = castBit(typeof bit === "string" ? bitById(bit) : bit, cast);
  const t0 = Number(start);
  if (!b || !Number.isFinite(t0)) return [];
  const k = key ?? `bit:${b.id}:${Math.round(t0)}`;
  const r = Number(rate) > 0 ? Number(rate) : 1;
  const room = bus === "room";
  if (reduced) return b.summary ? [{ id:b.summary, at:t0, pan:0, opts:{}, key:`${k}:summary`, open:true, bus, part:"pre" }] : [];
  const beat = song ? songBeatOf(b) : null;
  const hold = r === 1 ? holdBeatOf(b) : null;
  const org = Number.isFinite(Number(origin)) ? Math.round(Number(origin)) : Math.round(t0);
  return b.cues.map((cue, i) => {
    if (cue.unless === "song" && song) return null;
    const opts = { ...(cue.opts || {}) };
    if (Number(opts.ms) > 0) opts.ms = opts.ms / r;
    const post = hold !== null && cue.at >= hold;
    const at = r === 1 ? cueTime(b, cue.at, t0, origin) : t0 + cue.at / r;
    return { id:cue.sound, at, pan:room ? Number(cue.pan) || 0 : 0, opts, key:post ? `${k}:${org}:${i}` : `${k}:${i}`,
      open:beat === null || cue.at <= beat, bus, part:post ? "post" : "pre" };
  }).filter(Boolean);
}

/* plays them; returns each one's handle ({ cancel }, or null) */
export const playBitCues = cues => cues.map(cue => playSound(cue.id, { bus:cue.bus || "room", at:cue.at, pan:cue.pan, key:cue.key,
  opts:cue.opts, open:cue.open }));

/* a bit's sound while `enabled`: what runs on its start's clock scheduled
   once per `key`, what runs on its second clock again whenever `origin`
   moves; all of it cancelled when the bit leaves the screen */
export function useBitSound({ bit, start, origin, song = false, enabled = false, reduced = false, rate = 1, key = null, bus = "room",
  cast = null }) {
  const pre = useRef([]), post = useRef([]);
  const cues = part => bitCues(bit, { start, origin, song, reduced, rate, key, bus, cast }).filter(cue => cue.part === part);
  useEffect(() => {
    if (!enabled || !bit) return undefined;
    pre.current = playBitCues(cues("pre"));
    return () => { pre.current.forEach(handle => handle?.cancel?.()); pre.current = []; };
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled || !bit) return undefined;
    post.current = playBitCues(cues("post"));
    return () => { post.current.forEach(handle => handle?.cancel?.()); post.current = []; };
  }, [enabled, key, origin, song]); // eslint-disable-line react-hooks/exhaustive-deps
}
