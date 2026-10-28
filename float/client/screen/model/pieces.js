/* The scene's loud accent and its pieces (float/GROOVE.md "The look": one
   or two loud accents per scene), placed where riders and popups never go:
   Paddle Party's rainbow hoop and Rock Hop's buoy bob by the far bank at
   the right, past the last column; Rock Hop's small rocks drift along the
   far water, behind everyone; Spin Cycle's rainbow swirl lies on the water
   under the whole flotilla (everyone floats on it, nothing is ever behind
   it); The Drop's falls come up at the right in its last bars with a small
   rainbow over the far bank. Pure: stage pixels, the server clock, the art
   manifest's props. */
import { sceneMode } from "./song.js";

/* each scene's pieces: the prop ("accent" is scenes.<id>.accent), where its
   anchor sits, its drawn width; `drift` px a second right to left (offset
   by `phase` seconds), `bob` a little rise on the beat, `pulse` a breath on
   the beat, `under` lies under every rider, `falls` comes in with The Drop */
export const PIECES = Object.freeze({
  open:[{ prop:"accent", x:1836, y:440, w:140, bob:true }],
  rocks:[
    { prop:"accent", x:1840, y:442, w:112, bob:true },
    { prop:"rock", x:900, y:450, w:96, drift:40, phase:0 },
    { prop:"rock", x:300, y:454, w:118, drift:40, phase:31 },
  ],
  whirlpool:[{ prop:"accent", x:1100, y:770, w:1000, pulse:true, under:true }],
  falls:[
    { prop:"falls-lip", x:1760, y:438, w:520, falls:true },
    { prop:"accent", x:1832, y:440, w:170, falls:true },
  ],
});
/* the stage a drifting piece crosses (it wraps off the left back to the right) */
const SPAN = 2600, ENTER = 2140;

/* a piece with its prop's size and anchor: { ...piece, src, w, h, ax, ay } or null */
export function pieceArt(piece, manifest, propOf) {
  const id = piece.prop === "accent" ? manifest?.scenes?.[piece.scene]?.accent : piece.prop;
  const prop = id ? propOf(id, manifest) : null;
  if (!prop?.src) return null;
  const k = piece.w / (prop.w || piece.w);
  return { ...piece, src:prop.src, h:(prop.h || piece.w) * k, ax:(prop.anchor?.[0] ?? prop.w / 2) * k, ay:(prop.anchor?.[1] ?? prop.h) * k };
}

/* a scene's pieces with their art (scene id carried for the accent) */
export function scenePieces(scene, manifest, propOf) {
  return (PIECES[scene] || []).map(piece => pieceArt({ ...piece, scene }, manifest, propOf)).filter(Boolean);
}

/* how far The Drop's falls have come in at a beat (0 to 1) */
export function fallsAt(chart, beat) {
  if (!chart || chart.id !== "drop" || !Number.isFinite(beat)) return 0;
  const firstDrop = chart.modes.indexOf("drop");
  if (firstDrop < 0) return 0;
  const { mode } = sceneMode(chart, beat);
  if (mode !== "drop" && beat < firstDrop * 4) return 0;
  return Math.min(1, Math.max(0, (beat - firstDrop * 4) / 4));
}

/* where a piece is at server time t: { x, y, scale, opacity } */
export function pieceAt(piece, t, { beat = 0, fallsIn = 0 } = {}) {
  let x = piece.x, y = piece.y, scale = 1, opacity = 1;
  if (piece.drift) {
    const travel = ((t / 1000 + (piece.phase || 0)) * piece.drift) % SPAN;
    x = ENTER - ((travel + (ENTER - piece.x)) % SPAN);
  }
  const phase = beat - Math.floor(beat);
  if (piece.pulse) scale = 1 + 0.03 * Math.max(0, 1 - phase / 0.3);
  if (piece.bob) y += -4 * Math.sin(Math.PI * phase);
  if (piece.falls) {
    x = piece.x + (1 - fallsIn) * 900;
    opacity = fallsIn > 0 ? 1 : 0;
  }
  return { x, y, scale, opacity };
}

/* the rectangles popups keep clear of: the pieces that stand up out of the
   water and stay put (an accent by the bank, The Drop's rainbow once it is
   up), not the ones under everyone or drifting behind */
export function pieceRects(pieces = [], { fallsIn = 0 } = {}) {
  return pieces.filter(p => !p.under && !p.drift && (!p.falls || fallsIn > 0) && p.prop === "accent")
    .map(p => ({ x0:p.x - p.ax, x1:p.x - p.ax + p.w, y0:p.y - p.ay, y1:p.y - p.ay + p.h }));
}
