import { useCallback, useEffect, useState } from "react";
import { useFreshChange } from "../../lib/motion.js";
import { crownKey } from "./lastCard.js";

/* When the board is crowned, every phone plays the champion and then its
   own last card, once. A phone that was away for the crown opens straight
   to its card the first time it is back (no champion motion: that change is
   not fresh), so nobody misses it. Afterwards Home reopens it. */
export const LAST_CARD_SEEN = "si-last-card-v1";

/* Pure: what to open for a crown this device has or has not shown. */
export function crownOpening({ key, seen, fresh, ready = true, active = true }) {
  if (!ready || !active || !key || seen === key) return null;
  return fresh ? "moment" : "card";
}

const storage = {
  get(name) { try { return globalThis.localStorage?.getItem(name) ?? null; } catch { return null; } },
  set(name, value) { try { globalThis.localStorage?.setItem(name, value); } catch {} },
};

export function useCrownMoment({ state, standings, me, ready, active }) {
  const key = crownKey(state, standings);
  const change = useFreshChange(key);
  const [open, setOpen] = useState(null);
  const seenName = `${LAST_CARD_SEEN}:${me || "guest"}`;
  useEffect(() => {
    if (!key) { setOpen(null); return; }
    const mode = crownOpening({ key, seen:storage.get(seenName), fresh:change.fresh, ready, active });
    if (!mode) return;
    storage.set(seenName, key);
    setOpen({ mode, key });
  }, [key, ready, active, change.fresh, seenName]);
  const show = useCallback(() => { if (key) setOpen({ mode:"card", key }); }, [key]);
  const close = useCallback(() => setOpen(null), []);
  return { open, show, close, crowned:!!key };
}
