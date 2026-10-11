/* The bits' camera (Oct 10). A bit is shot, not staged wide: the stage
   zooms the session's painting and the cast together about the desert
   floor, so the buttes and saguaros grow with the cast, and the world's
   floor (y 930) sits near the foot of the screen (y 990).

   A bit's framing lives in its registry entry:
     camera: { zoom, x, fit, moves, shakes, washes }
       zoom    the base zoom (1.8 is a solo medium shot, a chip about 430 px)
       x       the world x on the screen's centre: a number, or an anchor
               the scene names ("a", "b", "mid", "chip"...)
       fit     cap the zoom so the scene's span (anchors.minX to maxX) fits
               between the title-safe sides: a versus as tight as both
               sides allow, whatever their size
       moves   [{ at, ms, zoom?, x?, ease? }]: from where the camera is at
               `at` to the new framing over `ms` (a push-in at the hit, a
               whip to the other side, a pull-back for the hold); a capped
               bit scales every move's zoom by the same factor
       shakes  [{ at, big? }]: the shot kicks (an impact; the lettering
               stays put)
       washes  [at]: one white frame over everything just before `at` (a
               gunshot), so the instant itself shows what lit it
   Every framing is clamped so the painting always covers the canvas.
   Pure: the stage turns the track into one keyframes animation. */

export const CAMERA = Object.freeze({ zoom:1.8, x:960, floor:930, screenFloor:990, width:1920, height:1080, safe:64,
  /* below this the painting's sky would show its top edge */
  minZoom:1.07, maxZoom:3 });
export const CAMERA_EASE = Object.freeze({ move:"cubic-bezier(.45,0,.55,1)", snap:"cubic-bezier(.2,.8,.2,1)",
  whip:"cubic-bezier(.7,0,.3,1)" });

const round = (n, d = 1000) => Math.round(n * d) / d;

/* keep a framing inside the painting: the zoom in range, the centre far
   enough from either edge that the canvas stays covered (rounded inward,
   so no hairline of the canvas ever shows) */
export function clampFraming({ zoom, x }) {
  const z = round(Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, Number(zoom) || CAMERA.zoom)));
  const half = CAMERA.width / 2 / z;
  const lo = Math.ceil(half * 10) / 10, hi = Math.floor((CAMERA.width - half) * 10) / 10;
  const want = Number.isFinite(Number(x)) ? Number(x) : CAMERA.x;
  return { zoom:z, x:round(Math.max(lo, Math.min(hi, want)), 10) };
}

/* the transform that puts world x at the screen's centre and the world's
   floor at the screen's floor */
export const framingTransform = ({ zoom, x }) =>
  `translate(${CAMERA.width / 2}px, ${CAMERA.screenFloor}px) scale(${zoom}) translate(${-x}px, ${-CAMERA.floor}px)`;
/* where a world point lands on the screen under a framing */
export const toScreen = ({ zoom, x }, point) => ({
  x:round(CAMERA.width / 2 + (point.x - x) * zoom, 10),
  y:round(CAMERA.screenFloor + ((point.y ?? CAMERA.floor) - CAMERA.floor) * zoom, 10),
});

/* The camera's path through a bit: framings at instants, each segment
   eased or held. `anchors` are the scene's named world xs (and its span). */
export function cameraTrack(bit, anchors = {}) {
  const cam = bit?.camera || {};
  const resolveX = x => typeof x === "number" ? x : Number.isFinite(anchors?.[x]) ? anchors[x] : CAMERA.x;
  const span = Number.isFinite(anchors?.minX) && Number.isFinite(anchors?.maxX) ? anchors.maxX - anchors.minX : 0;
  const base = Number(cam.zoom) || CAMERA.zoom;
  const fitted = cam.fit && span > 0 ? Math.min(base, (CAMERA.width - CAMERA.safe * 2) / span) : base;
  const factor = fitted / base;
  let state = clampFraming({ zoom:fitted, x:resolveX(cam.x ?? CAMERA.x) });
  const points = [{ at:0, ...state, ease:"linear" }];
  const moves = [...(cam.moves || [])].filter(move => Number.isFinite(move?.at)).sort((a, b) => a.at - b.at);
  for (const move of moves) {
    const at = Math.max(points[points.length - 1].at, move.at);
    const target = clampFraming({ zoom:move.zoom !== undefined ? move.zoom * factor : state.zoom,
      x:move.x !== undefined ? resolveX(move.x) : state.x });
    const last = points[points.length - 1];
    if (at > last.at) points.push({ at, ...state, ease:move.ease || CAMERA_EASE.move });
    else last.ease = move.ease || CAMERA_EASE.move;
    points.push({ at:at + Math.max(1, Number(move.ms) || 1), ...target, ease:"linear" });
    state = target;
  }
  return points;
}

/* the track as CSS: one @keyframes (named by its content, so two casts of
   one bit never share a name) and the resting transform (its end) */
export function cameraCss(bit, anchors = {}) {
  const track = cameraTrack(bit, anchors);
  const ms = Math.max(1, Number(bit?.ms) || 1);
  const last = track[track.length - 1];
  if (track.length < 2) return { name:null, css:"", rest:framingTransform(last), track };
  const frames = track.map(point => `${round(Math.min(100, point.at / ms * 100), 100)}% { transform:${framingTransform(point)};`
    + ` animation-timing-function:${point.ease}; }`).join(" ");
  let h = 0x811c9dc5;
  for (const ch of `${bit.id}:${frames}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const name = `bit-cam-${bit.id}-${h.toString(36)}`;
  return { name, css:`@keyframes ${name} { ${frames} 100% { transform:${framingTransform(last)}; } }`, rest:framingTransform(last), track };
}

/* the framing at an instant (the reel, tests): eased segments taken as
   linear, which is close enough to check what is in frame */
export function framingAt(track, ms) {
  const t = Number(ms) || 0;
  let i = 0;
  while (i < track.length - 1 && track[i + 1].at <= t) i++;
  const a = track[i], b = track[i + 1];
  if (!b) return { zoom:a.zoom, x:a.x };
  const p = Math.max(0, Math.min(1, (t - a.at) / Math.max(1, b.at - a.at)));
  return { zoom:a.zoom + (b.zoom - a.zoom) * p, x:a.x + (b.x - a.x) * p };
}
