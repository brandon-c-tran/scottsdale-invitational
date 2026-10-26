/* Thumbs on the paddles, as the room hears them (float/PROTOCOL.md
   {t:"hands", n}: 0, 1 or 2). Pure, so it is tested without a browser.

   n is how many of the two halves hold a thumb. A paddling thumb lifts
   between strokes, so a half stays held for GRACE_MS after its last thumb
   comes off: a rise is reported at once, a drop only when the grace runs
   out with that half still empty. Without the grace every stroke would
   flicker HANDS_OFF on the TV and in the room's physics, as if everyone
   were drinking between strokes.

     down(id, side, t)   a thumb lands on side "L" or "R"
     up(id, t)           it lifts (or the system took it: touchcancel)
     clear()             the page went away: nothing is held, at once
     report(t)           the count to send now, or null when unchanged
     nextAt(t)           when a drop could next come due, or null */

export const HANDS_GRACE_MS = 800;

export function createHands({ graceMs = HANDS_GRACE_MS } = {}) {
  const down = { L:new Set(), R:new Set() };
  const liftAt = { L:-Infinity, R:-Infinity };
  const sideOf = new Map();
  let reported = 0;

  const held = (side, t) => down[side].size > 0 || t - liftAt[side] < graceMs;
  const count = t => (held("L", t) ? 1 : 0) + (held("R", t) ? 1 : 0);

  return {
    down(id, side, t) {
      const s = side === "R" ? "R" : "L";
      const was = sideOf.get(id);
      if (was && was !== s) down[was].delete(id);
      sideOf.set(id, s);
      down[s].add(id);
      return s;
    },
    up(id, t) {
      const side = sideOf.get(id);
      if (!side) return null;
      sideOf.delete(id);
      down[side].delete(id);
      if (!down[side].size) liftAt[side] = t;
      return side;
    },
    clear() {
      down.L.clear(); down.R.clear(); sideOf.clear();
      liftAt.L = liftAt.R = -Infinity;
    },
    count,
    /* the thumbs down right now, no grace (the paddles' own drawing) */
    touching:side => down[side === "R" ? "R" : "L"].size > 0,
    report(t) {
      const n = count(t);
      if (n === reported) return null;
      reported = n;
      return n;
    },
    reported:() => reported,
    nextAt(t) {
      let at = null;
      for (const side of ["L", "R"]) {
        if (down[side].size) continue;
        const due = liftAt[side] + graceMs;
        if (due > t) at = at === null ? due : Math.min(at, due);
      }
      return at;
    },
  };
}
