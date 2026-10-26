/* A rider's identity on the HUD: their portrait (the art's riderPortrait,
   made once per look and cached), the ink that reads on their colour, and
   their initials while the portrait is on its way. */
import { useEffect, useState } from "react";
import { riderPortrait } from "../../art/index.js";

const cache = new Map();
/* portraits being drawn right now (their renders share the GPU with the river) */
let inflight = 0;
export const portraitsBusy = () => inflight > 0;
const keyOf = e => JSON.stringify([e?.name, e?.color, e?.look, e?.photo, e?.number, e?.skin, !!e?.groom]);

export function portraitFor(entrant, size = 160) {
  if (!entrant) return Promise.resolve(null);
  const key = `${size}:${keyOf(entrant)}`;
  if (!cache.has(key)) {
    inflight++;
    const job = Promise.resolve()
      .then(() => riderPortrait(entrant, { size }))
      .then(url => { cache.set(key, url || null); return url || null; })
      .catch(() => { cache.set(key, null); return null; })
      .finally(() => { inflight = Math.max(0, inflight - 1); });
    cache.set(key, job);
  }
  const value = cache.get(key);
  return value instanceof Promise ? value : Promise.resolve(value);
}

export function usePortrait(entrant, size = 160) {
  const key = entrant ? `${size}:${keyOf(entrant)}` : null;
  const ready = key && cache.has(key) && !(cache.get(key) instanceof Promise) ? cache.get(key) : null;
  const [url, setUrl] = useState(ready);
  useEffect(() => {
    let alive = true;
    if (!entrant) { setUrl(null); return undefined; }
    portraitFor(entrant, size).then(value => { if (alive) setUrl(value); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

/* the ink that reads on a colour: ink-black or bone, whichever contrasts more */
const lum = hex => {
  const v = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!v) return 0.2;
  const n = parseInt(v[1], 16);
  const ch = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(n >> 16 & 255) + 0.7152 * ch(n >> 8 & 255) + 0.0722 * ch(n & 255);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK = "#0a0910", BONE = "#f4ecd8";
export function inkOn(color) {
  const l = lum(color);
  return contrast(l, lum(INK)) >= contrast(l, lum(BONE)) ? INK : BONE;
}

export const initials = name => String(name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
