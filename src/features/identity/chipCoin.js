/* Your Chip, Turned: pure geometry for the coin built from ChipFace. The
   rim is a ring of flat facets; every skin prints its inserts on that rim the
   way a clay chip carries them through its edge. Presentation only. */

export const COIN_FACETS = 24;

/* Which rim facets carry the skin ink. Facet 0 sits at the top of the chip,
   facet 6 at the right edge, which is the one seen edge-on. */
export function edgeInserts(skin, n = COIN_FACETS) {
  const every = (step, width = 1, offset = 0) => Array.from({ length:n },
    (_, i) => ((i - offset + n) % n) % step < width);
  switch (skin) {
    case "plain":
    case "ring": return Array(n).fill(false);
    case "dash": return every(4, 2);
    case "quad": return every(6, 2, 5);
    case "dots":
    case "saw": return every(2);
    case "flame":
    case "star":
    case "bolt": return every(4, 1, 2);
    case "wave": return every(3, 2);
    case "crown": return Array.from({ length:n }, (_, i) => i === 0 || i === 1 || i === n - 1);
    default: return every(3); // ticks: eight inserts
  }
}

/* Geometry for a coin of `size` px: the rim sits under the face's outer
   stroke (r 14.7 + half the 1.45 stroke, of 32). */
export function coinGeometry(size, n = COIN_FACETS) {
  const radius = size * (15.4 / 32);
  const thickness = Math.max(4, Math.round(size * .1));
  const chord = 2 * radius * Math.sin(Math.PI / n) + .6;
  const apothem = radius * Math.cos(Math.PI / n);
  return { radius, thickness, chord, apothem, step:360 / n };
}

/* A release keeps its momentum and lands face up: the nearest whole turn
   past where the fling would carry it. */
export function coinSettle(angle, velocity = 0) {
  const a = Number.isFinite(angle) ? angle : 0;
  const v = Number.isFinite(velocity) ? Math.max(-3, Math.min(3, velocity)) : 0;
  const projected = a + v * 240;
  const target = Math.round(projected / 360) * 360;
  const duration = Math.round(Math.max(380, Math.min(1200, Math.abs(target - a) * 1.6)));
  return { target:target === 0 ? 0 : target, duration };
}

export const COIN_DEG_PER_PX = .9;
export const COIN_TAP_SLOP = 4;
