/* The frame driver: one requestAnimationFrame loop for the whole screen.
   Every moving thing registers a function that reads the server clock and
   writes transforms and opacity straight to its nodes (no React render, no
   layout read per frame). It counts frames for the shots script
   (window.__floatFrames) and measures the frame rate for ?debug=1 and
   onStats. Paused (Field Day's scene over the screen): nothing runs. */

export function createDriver({ serverNow, onFps = null } = {}) {
  const fns = new Set();
  let raf = 0;
  let running = false;
  let paused = false;
  let last = 0;
  let windowStart = 0, windowFrames = 0;

  const frame = ts => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const now = serverNow();
    const dt = last ? Math.min(120, Math.max(0, ts - last)) : 16;
    last = ts;
    for (const fn of fns) {
      try { fn(now, dt); } catch (error) { console.error("Float frame", error); }
    }
    try { window.__floatFrames = (window.__floatFrames || 0) + 1; } catch {}
    windowFrames += 1;
    if (!windowStart) windowStart = ts;
    else if (ts - windowStart >= 1000) {
      const fps = Math.round((windowFrames * 1000) / (ts - windowStart));
      windowStart = ts; windowFrames = 0;
      try { onFps?.(fps); } catch {}
    }
  };

  const driver = {
    add(fn) { fns.add(fn); return () => fns.delete(fn); },
    start() {
      if (running || paused || typeof requestAnimationFrame !== "function") return;
      running = true; last = 0; windowStart = 0; windowFrames = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf); },
    setPaused(next) {
      paused = !!next;
      if (paused) driver.stop();
      else driver.start();
    },
    /* run every function once now (a mount, a phase change) */
    tick() { const now = serverNow(); for (const fn of fns) { try { fn(now, 0); } catch (error) { console.error("Float frame", error); } } },
    serverNow,
  };
  return driver;
}
