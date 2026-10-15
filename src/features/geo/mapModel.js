/* Where and When's map, as data: which renderer draws it, the reveal's
   beats, the camera that frames the pins, and where the answer's card
   stands clear of them. Pure (no DOM, no map library), so every renderer
   (src/features/geo/maps/) plays the same game and the tests can read it. */

/* ── the renderer ──
   Google's map when the Worker hands out a browser key
   (capabilities.googleMaps + mapsKey on the frame), else MapLibre's vector
   map, else Leaflet's raster tiles on a device without WebGL. A key Google
   refused this session (gm_authFailure, a script that never loads) falls
   back as if there were none. */
export const MAP_RENDERERS = Object.freeze(["google", "gl", "leaflet"]);
export function mapsConfig(snapshot) {
  const key = snapshot?.capabilities?.googleMaps === true && typeof snapshot?.mapsKey === "string" ? snapshot.mapsKey.trim() : "";
  return { googleKey:key || null };
}
export function pickRenderer({ googleKey = null, webgl = true, googleFailed = false } = {}) {
  if (googleKey && !googleFailed) return "google";
  return webgl ? "gl" : "leaflet";
}

/* ── the adapter contract ──
   Every renderer is one object with these members (lat/lng points, pixels
   in the map's own box). GeoMap holds the game; an adapter only draws.
     kind              "google" | "gl" | "leaflet"
     size()            { width, height } of the map's box
     camera()          { lat, lng, zoom } now; zoom is a 256 px tile's
                       (Google's, Leaflet's; MapLibre's adapter converts)
     move(cam, ms, o)  to { lat, lng, zoom } over ms (0 jumps); o.fly lifts out on the way
     onClick(fn)       fn({ lat, lng }) on a tap of the map itself
     setPin(point, o)  the one pick pin: o.node, o.draggable, o.onDrag(point); null clears
     inView(point)     whether the point is on screen
     addMarker(n, p, o) a pin node at p, o.anchor "bottom" | "center": returns { remove() }
     setLines(segs, k) dashed lines from each seg.from toward seg.to, k of the way (0..1); [] clears
     types             the map types it offers (["map", "satellite"], or [])
     setType(type)     one of `types`
     remove()          tear down */
export const ADAPTER_MEMBERS = Object.freeze(["kind", "size", "camera", "move", "onClick", "setPin", "inView",
  "addMarker", "setLines", "types", "setType", "remove"]);

/* ── Web Mercator, shared by every renderer (all three are Mercator) ── */
const clampLat = lat => Math.max(-85.05112878, Math.min(85.05112878, lat));
/* a point on the world square at zoom 0, 0..1 each way */
export function toWorld({ lat, lng }) {
  const phi = clampLat(lat) * Math.PI / 180;
  return { x:(lng + 180) / 360, y:(1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 };
}
export function fromWorld({ x, y }) {
  const n = Math.PI - 2 * Math.PI * y;
  return { lat:180 / Math.PI * Math.atan(Math.sinh(n)), lng:x * 360 - 180 };
}
/* a point's pixel in a box of `size` showing `cam` */
export function project(point, cam, size, tileSize = 256) {
  const scale = tileSize * 2 ** cam.zoom;
  const p = toWorld(point), c = toWorld(cam);
  return { x:(p.x - c.x) * scale + size.width / 2, y:(p.y - c.y) * scale + size.height / 2 };
}

/* The camera that fits every point inside `size` less `pad` (each side's
   pixels kept clear), no closer than `maxZoom`; one point (or several on
   one spot) centers at `single`. */
export function fitCamera(points, size, pad = {}, { tileSize = 256, maxZoom = 13, single = 11, minZoom = 1 } = {}) {
  const p = { top:0, right:0, bottom:0, left:0, ...pad };
  if (!points.length) return null;
  const world = points.map(toWorld);
  const xs = world.map(w => w.x), ys = world.map(w => w.y);
  const box = { x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys) };
  const availW = Math.max(1, size.width - p.left - p.right), availH = Math.max(1, size.height - p.top - p.bottom);
  const dx = box.x1 - box.x0, dy = box.y1 - box.y0;
  const zoom = dx < 1e-9 && dy < 1e-9 ? Math.min(single, maxZoom)
    : Math.max(minZoom, Math.min(maxZoom, Math.log2(Math.min(dx > 1e-9 ? availW / (dx * tileSize) : Infinity,
      dy > 1e-9 ? availH / (dy * tileSize) : Infinity))));
  const scale = tileSize * 2 ** zoom;
  /* the box's middle sits in the middle of what the padding leaves */
  const cx = (box.x0 + box.x1) / 2 - (p.left - p.right) / 2 / scale;
  const cy = (box.y0 + box.y1) / 2 - (p.top - p.bottom) / 2 / scale;
  return { ...fromWorld({ x:cx, y:cy }), zoom };
}

/* the room a pin takes around its point: a guess stands on it (anchor
   bottom), the answer is centered on it */
export function pinBox(point, kind, pins) {
  const pin = pins[kind === "answer" ? "answer" : "guess"];
  return kind === "answer"
    ? { left:point.x - pin.w / 2, right:point.x + pin.w / 2, top:point.y - pin.h / 2, bottom:point.y + pin.h / 2 }
    : { left:point.x - pin.w / 2, right:point.x + pin.w / 2, top:point.y - pin.h, bottom:point.y };
}
/* padding grown by the pins' own reach past their points, so a pin's head
   never leaves the frame its point was fitted in */
export function pinPadding(pad, pins) {
  const g = pins.guess, a = pins.answer;
  const side = Math.max(g.w, a.w) / 2;
  return { top:pad.top + Math.max(g.h, a.h / 2), bottom:pad.bottom + a.h / 2, left:pad.left + side, right:pad.right + side };
}
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
/* the card's rectangle in a corner ("tl", "tr") */
export function cardRect(corner, card, size, inset) {
  const left = corner === "tr" ? size.width - inset - card.w : inset;
  return { left, right:left + card.w, top:inset, bottom:inset + card.h };
}

/* The reveal's final camera and where its card stands, the card never
   over a pin. For each top corner (top left first) three framings are
   tried: the pins over the whole map, the pins beside a column the card
   keeps clear, the pins under a band it keeps clear; of those that leave
   the card clear, the closest wins (the open map first on a tie). `card`
   is { w, h } (null: no card), `pins` each kind's { w, h }; `corners` the
   corners to try, in order. */
export const CARD_CORNERS = Object.freeze(["tl", "tr"]);
export function placeReveal({ points, kinds, size, pad, pins, card = null, inset = 28, gap = 16, tileSize = 256, maxZoom = 13,
  single = 11, corners = CARD_CORNERS }) {
  const fitPad = pinPadding(pad, pins);
  const fit = cam => points.map((point, i) => pinBox(project(point, cam, size, tileSize), kinds[i], pins));
  const frame = extra => fitCamera(points, size, { ...fitPad, ...extra }, { tileSize, maxZoom, single });
  const open = frame({});
  if (!open) return { camera:null, corner:card ? corners[0] : null, boxes:[] };
  if (!card) return { camera:open, corner:null, boxes:fit(open) };
  const clearOf = (corner, boxes) => {
    const rect = cardRect(corner, card, size, inset);
    const grown = { left:rect.left - gap, right:rect.right + gap, top:rect.top - gap, bottom:rect.bottom + gap };
    return boxes.every(box => overlap(box, grown) === 0);
  };
  const side = Math.max(pins.guess.w, pins.answer.w) / 2;
  const column = inset + card.w + gap + side;
  const band = inset + card.h + gap + Math.max(pins.guess.h, pins.answer.h / 2);
  let best = null;
  for (const corner of corners) {
    const tries = [open, frame(corner === "tr" ? { right:Math.max(fitPad.right, column) } : { left:Math.max(fitPad.left, column) }),
      frame({ top:Math.max(fitPad.top, band) })];
    for (const camera of tries) {
      const boxes = fit(camera);
      if (clearOf(corner, boxes) && (!best || camera.zoom > best.camera.zoom + 1e-6)) best = { camera, corner, boxes };
    }
  }
  if (best) return best;
  /* nothing clears it (a map too small for the pins): the band, as close as it goes */
  const banded = frame({ top:Math.max(fitPad.top, band) });
  return { camera:banded, corner:corners[0], boxes:fit(banded) };
}
/* how much of the card a set of pin boxes covers, in square pixels (the tests' measure) */
export const cardCovered = (corner, card, size, inset, boxes) =>
  boxes.reduce((sum, box) => sum + overlap(cardRect(corner, card, size, inset), box), 0);

/* ── the reveal's beats ──
   The guesses drop one by one, framed; the lines run from each to the
   answer as the camera opens to hold everything; the answer lands. Times
   in ms from the reveal's start. */
export const REVEAL = Object.freeze({ first:300, drop:110, toLines:250, lines:1100, camera:1300, answerAfter:1000, land:620 });
export function revealPlan(count, R = REVEAL) {
  const drops = Array.from({ length:count }, (_, i) => R.first + i * R.drop);
  const lines = R.first + count * R.drop + R.toLines;
  const answer = lines + R.answerAfter;
  return { drops, lines, answer, end:Math.max(lines + R.camera, lines + R.lines, answer + R.land) };
}
/* The reveal `elapsed` ms in (a screen that joins late, on the server
   clock): each pin's drop `delay` (negative: already falling, joined
   mid-fall; null: already landed), the lines' start and progress, the
   camera's remaining move, and whether it is all over. */
export function revealAt(plan, elapsed, R = REVEAL) {
  const e = Math.max(0, elapsed || 0);
  if (e >= plan.end) return { over:true };
  const pin = t => t - e > -R.land ? t - e : null;
  return {
    over:false,
    drops:plan.drops.map(pin),
    answer:pin(plan.answer),
    linesIn:Math.max(0, plan.lines - e),
    linesFrom:Math.min(1, Math.max(0, (e - plan.lines) / R.lines)),
    cameraIn:Math.max(0, plan.lines - e),
    cameraMs:Math.max(0, Math.min(R.camera, plan.lines + R.camera - e)),
  };
}
/* a line `k` of the way from a guess to the answer */
export const along = (from, to, k) => ({ lat:from.lat + (to.lat - from.lat) * k, lng:from.lng + (to.lng - from.lng) * k });
export const easeOut = k => 1 - (1 - k) ** 3;
/* a camera `k` of the way between two (zoom in log space, so a fly reads even) */
export const cameraAlong = (a, b, k) => ({ lat:a.lat + (b.lat - a.lat) * k, lng:a.lng + (b.lng - a.lng) * k,
  zoom:a.zoom + (b.zoom - a.zoom) * k });
