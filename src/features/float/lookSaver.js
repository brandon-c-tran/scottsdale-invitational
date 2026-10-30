/* The Locker's save rhythm (FloatLocker), pure so it runs in node: a change
   is owed and saves itself `delay` ms after the last one; flush saves what
   is owed at once (the section closing, the sheet going away) and the timer
   it replaces never fires; an owed look saves once. With no saver yet the
   look stays owed, never dropped. `target()` returns the current saver,
   `onStatus` hears "owed", "saving", "saved" and "error". */
export const LOOK_SAVE_AFTER_MS = 500;

export function lookSaver({ target, delay = LOOK_SAVE_AFTER_MS, onStatus = () => {}, timers = globalThis } = {}) {
  let owed = null, timer = null;
  const stop = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    stop();
    const look = owed, save = typeof target === "function" ? target() : null;
    if (!look || typeof save !== "function") return false;
    owed = null;
    onStatus("saving");
    Promise.resolve().then(() => save(look))
      .then(result => onStatus(result?.ok ? "saved" : "error"), () => onStatus("error"));
    return true;
  };
  const change = look => {
    owed = look;
    onStatus("owed");
    stop();
    timer = timers.setTimeout(flush, delay);
  };
  return { change, flush, owed:() => owed };
}
