/* The bits' sound (features/gags/bits): a bit's cues on the room's clock,
   from the bit's own start, so every TV in the house lands the gun crack
   on the frame the flash lights. Synthesized foley from the sound kit
   (its BIT_PARTS), on the room bus, open past a win song like the
   gags. A cue more than 300 ms late is dropped (sound.js), so a TV that
   joins a bit late hears only what is still ahead. Reduced motion plays
   the bit's one summary sound. `rate` slows the clock with the picture
   (the reel's 0.25x); each cue's own length (opts.ms) stretches with it. */

import { useEffect, useRef } from "react";
import { cueAt } from "../../lib/sound.js";
import { bitById } from "../gags/bits/registry.js";

export function bitCues(bit, { start, reduced = false, rate = 1, key = null } = {}) {
  const b = typeof bit === "string" ? bitById(bit) : bit;
  const t0 = Number(start);
  if (!b || !Number.isFinite(t0)) return [];
  const k = key ?? `bit:${b.id}:${Math.round(t0)}`;
  const r = Number(rate) > 0 ? Number(rate) : 1;
  if (reduced) return b.summary ? [{ id:b.summary, at:t0, pan:0, opts:{}, key:`${k}:summary`, open:true }] : [];
  return b.cues.map((cue, i) => {
    const opts = { ...(cue.opts || {}) };
    if (Number(opts.ms) > 0) opts.ms = opts.ms / r;
    return { id:cue.sound, at:t0 + cue.at / r, pan:Number(cue.pan) || 0, opts, key:`${k}:${i}`, open:true };
  });
}

/* plays them; returns each one's handle ({ cancel }, or null) */
export const playBitCues = cues => cues.map(cue => cueAt(cue.id, cue.at, { pan:cue.pan, key:cue.key, opts:cue.opts, open:cue.open }));

/* a bit's sound, scheduled once per `key` while `enabled`, cancelled
   when the bit leaves the screen */
export function useBitSound({ bit, start, enabled = false, reduced = false, rate = 1, key = null }) {
  const handles = useRef([]);
  useEffect(() => {
    if (!enabled || !bit) return undefined;
    handles.current = playBitCues(bitCues(bit, { start, reduced, rate, key }));
    return () => { handles.current.forEach(handle => handle?.cancel?.()); handles.current = []; };
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
