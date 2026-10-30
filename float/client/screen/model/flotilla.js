/* The flotilla's layout (float/GROOVE.md "Rounds, elimination, positions"):
   every rider in the field always on screen, in 1 to 3 staggered rows, each
   in a FIXED seat for the whole Cup (float/shared/seats.js: the field in
   entrant order, front row first, left to right; GROOVE.md v3 "Who you
   are"), drifting a little ahead (right, downstream) or behind by their
   score against the field's, never past a neighbour. Eliminated riders stand on the far bank as the
   crowd; the podium has its three blocks. Pure: stage pixels on the fixed
   1920 x 1080 canvas, nothing measured from the DOM. */

import { rowCounts, seatsFor } from "../../../shared/seats.js";

export const STAGE_W = 1920;
export const STAGE_H = 1080;
/* the art manifest's sprite box (GROOVE.md "The art manifest") */
export const BOX = 512;
/* a placeholder critter's anchors in that box: the waterline under the
   tube's middle and the top of the head (the art's own anchors win) */
export const ANCHOR = Object.freeze({ water:[256, 404], head:[256, 112], top:[256, 112], name:[256, 486], face:[256, 236], hand:[328, 372], fill:1 });
/* the share of the box a rider's visible width takes (the tube's span) */
export const BODY_W = 0.74;

/* How many ride in each row, back to front (the seat map's own) */
export { rowCounts };

/* each row's waterline and scale by the number of rows (index 0 is the
   back); every row keeps inside [lo, hi] (the back row clear of the host on
   the left bank, the front row clear of the corners' foreground) */
const ROW_SHAPES = Object.freeze({
  1:[{ y:850, scale:0.8, lo:330, hi:1840 }],
  2:[{ y:640, scale:0.48, lo:400, hi:1890 }, { y:950, scale:0.58, lo:190, hi:1860 }],
  /* 13 is the normal room (v4 item 3): three rows a cell apart, each rider's
     popup over their own head and tag under their own hull, the rows'
     faces in each other's gaps */
  3:[{ y:604, scale:0.4, lo:430, hi:1900 }, { y:784, scale:0.46, lo:240, hi:1900 }, { y:982, scale:0.53, lo:170, hi:1880 }],
});
/* the final three, big in one row */
const FINAL_SHAPE = Object.freeze([{ y:860, scale:0.9, lo:300, hi:1840 }]);
/* the lobby's riders, to the right of the code and the QR */
const LOBBY_SHAPES = Object.freeze({
  1:[{ y:760, scale:0.62, lo:720, hi:1880 }],
  2:[{ y:640, scale:0.44, lo:720, hi:1890 }, { y:840, scale:0.54, lo:700, hi:1880 }],
  3:[{ y:566, scale:0.34, lo:720, hi:1890 }, { y:724, scale:0.4, lo:700, hi:1890 }, { y:884, scale:0.45, lo:690, hi:1880 }],
});
/* the formation's middle, a little right of the stage's (the host stands
   left); the lobby's, right of its card */
export const CENTRE_X = 1075;
export const CENTRE_LOBBY = 1300;
/* the grid's widest spacing (stage px); a bigger field narrows it to fit
   its widest row */
export const GRID = 620;

/* score drift on top of the order: px per percentage point against the
   field, and its limit as a share of the row's spacing (a drifted rider
   stays clear of the faces in the rows around it) */
export const DRIFT = Object.freeze({ PER_POINT:5, MAX:0.1 });
/* two riders in a row never closer than this share of their width */
export const MIN_GAP = 0.9;

export const riderWidth = scale => BOX * scale * BODY_W;

/* the rows a field rides in: [{ y, scale, lo, hi, shift, spacing, centre,
   members:[i...] }], back row first (index 0), each row's members left to
   right. The seats are the seat map's (float/shared/seats.js seatsFor:
   row 0 the FRONT, col 0 the LEFT), so a rider keeps their place whatever
   the scores; `kind` "song" | "final" | "lobby". One grid for every row:
   as wide as the tightest row allows, every row centred on it, a row with
   the same parity as the one in front moved half a slot, so each row's
   riders sit in the gaps of the rows next to it. */
export function rowsFor(field = [], { kind = "song" } = {}) {
  const seats = seatsFor(field);
  const counts = rowCounts(seats.size);
  if (!counts.length) return [];
  const shapes = kind === "lobby" ? LOBBY_SHAPES[counts.length]
    : kind === "final" || seats.size <= 3 ? FINAL_SHAPE : ROW_SHAPES[counts.length];
  const rows = counts.map((k, r) => ({ ...shapes[r], index:r, k, members:new Array(k), shift:0 }));
  /* the seat map's row 0 is the front: the last of ours */
  for (const [i, seat] of seats) rows[rows.length - 1 - seat.row].members[seat.col] = i;
  /* rows with counts of the same parity would stack: the later one moves half a slot */
  for (let r = 1; r < rows.length; r += 1) rows[r].shift = rows[r - 1].shift + ((rows[r].k - rows[r - 1].k) % 2 === 0 ? 0.5 : 0);
  const mid = rows.reduce((sum, row) => sum + row.shift, 0) / rows.length;
  rows.forEach(row => { row.shift -= mid; });
  /* the grid: one centre and one spacing for every row (on screen, so each
     row sits exactly in the gaps of the next), the widest every row (with
     its half-slot shift) still fits */
  const centre = kind === "lobby" ? CENTRE_LOBBY : CENTRE_X;
  let grid = GRID;
  for (const row of rows) {
    const half = Math.min(centre - row.lo, row.hi - centre) - riderWidth(row.scale) / 2;
    const reach = (row.k - 1) / 2 + Math.abs(row.shift);
    if (reach > 0) grid = Math.min(grid, half / reach);
  }
  rows.forEach(row => {
    row.spacing = Math.max(riderWidth(row.scale) * MIN_GAP, grid);
    row.centre = centre;
  });
  return rows;
}

/* a row's home slots on the shared grid, the row kept inside its span */
export function rowSlots(row, { centre = row.centre ?? CENTRE_X } = {}) {
  const k = row.members.length;
  const w = riderWidth(row.scale);
  const lo = row.lo + w / 2, hi = row.hi - w / 2;
  if (k <= 0) return [];
  const fit = k > 1 ? (hi - lo) / (k - 1) : Infinity;
  const spacing = Math.max(w * MIN_GAP, Math.min(row.spacing ?? GRID * row.scale, fit));
  const span = spacing * (k - 1);
  let start = centre - span / 2 + (row.shift || 0) * spacing;
  start = Math.max(lo, Math.min(hi - span, start));
  return Array.from({ length:k }, (_, j) => start + j * spacing);
}

/* the field's reference score (the mean of those who have one) */
export function fieldMean(lives) {
  const values = [...lives].filter(v => Number.isFinite(v));
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/* a rider's drift from their home slot: ahead (+) or behind (-), at most `max` px */
export function driftOf(live, mean, { perPoint = DRIFT.PER_POINT, max = 240 } = {}) {
  if (!Number.isFinite(live) || !Number.isFinite(mean)) return 0;
  return Math.max(-max, Math.min(max, (live - mean) * perPoint));
}

/* Faces that would overlap spread along the line as a group, centred on
   where they would be, kept inside [lo, hi]; every item at least `space`
   from the next. Returns the shown positions in the input's order. */
export function spreadRow(xs, space, lo, hi) {
  const order = xs.map((x, k) => ({ x, k })).sort((a, b) => a.x - b.x || a.k - b.k);
  let groups = order.map(item => ({ items:[item], centre:item.x }));
  const half = g => ((g.items.length - 1) * space) / 2;
  const clampCentre = g => {
    const h = half(g);
    g.centre = hi - lo < 2 * h ? (lo + hi) / 2 : Math.min(hi - h, Math.max(lo + h, g.centre));
  };
  for (let pass = 0; pass < 12; pass += 1) {
    groups.forEach(clampCentre);
    let merged = false;
    for (let k = 0; k < groups.length - 1; k += 1) {
      const a = groups[k], b = groups[k + 1];
      if (b.centre - half(b) - (a.centre + half(a)) < space - 0.5) {
        const items = [...a.items, ...b.items];
        groups.splice(k, 2, { items, centre:items.reduce((sum, item) => sum + item.x, 0) / items.length });
        merged = true;
        k -= 1;
      }
    }
    if (!merged) break;
  }
  groups.forEach(clampCentre);
  const out = new Array(xs.length);
  for (const g of groups) g.items.forEach((item, n) => { out[item.k] = g.centre - half(g) + n * space; });
  return out;
}

/* Every rider's place on the water: { [i]: { x, y, scale, row, rows, z } }.
   `lives` maps a rider to their live score (0 to 100, or null before their
   first judgement). Each rider keeps their seat's slot on the shared grid
   (so faces stay clear of the rows around), drifting a little ahead (right)
   or behind by how far ahead or behind the field they are; the drift is a
   tenth of a slot at most, so a rider never passes a neighbour (the rank
   strip says who leads). x is the waterline's middle, y the waterline. */
export function flotillaLayout(field = [], lives = new Map(), { kind = "song", drift = true } = {}) {
  const rows = rowsFor(field, { kind });
  const get = i => (lives instanceof Map ? lives.get(i) : lives?.[i]);
  const mean = drift ? fieldMean(rows.flatMap(row => row.members).map(get)) : null;
  const out = {};
  for (const row of rows) {
    const slots = rowSlots(row);
    const w = riderWidth(row.scale);
    const reach = DRIFT.MAX * (row.spacing ?? w * 1.5);
    const ideal = row.members.map((i, j) => slots[j] + (drift ? driftOf(get(i), mean, { max:reach }) : 0));
    const shown = spreadRow(ideal, w * MIN_GAP, row.lo + w / 2, row.hi - w / 2);
    row.members.forEach((i, j) => {
      out[i] = { x:shown[j], y:row.y, scale:row.scale, row:row.index, rows:rows.length, col:j, z:row.index * 100 + j };
    });
  }
  return out;
}

/* the field in seat order (entrant order): the same list whatever the scores */
export const seatOrder = (field = []) => [...new Set(field.filter(i => Number.isInteger(i)))].sort((a, b) => a - b);

/* ── the crowd on the far bank ── */
/* the crowd stands on the sand at the water's edge (the scene's waterline
   is 0.4 of the height), small, right of the host */
export const CROWD = Object.freeze({ y:428, scale:0.34, lo:440, hi:1880 });

/* the crowd's spots, left to right in elimination order, spread along the
   bank (never wider apart than a step and a half): { [i]: { x, y, scale } } */
export function crowdLayout(outs = [], { y = CROWD.y } = {}) {
  const list = outs.filter(i => Number.isInteger(i));
  const out = {};
  if (!list.length) return out;
  const w = riderWidth(CROWD.scale);
  const span = CROWD.hi - CROWD.lo - w;
  const spacing = list.length > 1 ? Math.min(w * 1.6, span / (list.length - 1)) : 0;
  const mid = (CROWD.lo + CROWD.hi) / 2 + 120;
  const start = Math.max(CROWD.lo + w / 2, Math.min(CROWD.hi - w / 2 - spacing * (list.length - 1), mid - (spacing * (list.length - 1)) / 2));
  list.forEach((i, k) => { out[i] = { x:start + k * spacing, y:y + (k % 2 ? 5 : 0), scale:CROWD.scale, z:k }; });
  return out;
}

/* ── the podium ── */
/* the three blocks drawn here: 2nd left, 1st in the middle, 3rd right */
export const PODIUM = Object.freeze([
  { place:1, x:960, top:660, w:420, h:420, scale:0.84 },
  { place:2, x:520, top:760, w:400, h:320, scale:0.74 },
  { place:3, x:1400, top:820, w:400, h:260, scale:0.74 },
]);
/* the art's podium prop on the stage: its bottom's middle, its width */
export const PODIUM_FRAME = Object.freeze({ x:960, bottom:1066, width:1120 });
/* the steps' tops on the stage, from the art's prop (`steps` the tops of
   the 1st, 2nd and 3rd blocks in its own pixels), else the drawn blocks':
   [{ place, x, y, w }] */
export function podiumSteps(prop = null, frame = PODIUM_FRAME) {
  if (prop?.steps?.length >= 3 && prop.w && prop.h) {
    const k = frame.width / prop.w;
    const [ax, ay] = prop.anchor || [prop.w / 2, prop.h];
    return prop.steps.slice(0, 3).map(([x, y], n) => ({ place:n + 1, x:frame.x + (x - ax) * k, y:frame.bottom - (ay - y) * k, w:prop.w * k / 3 }));
  }
  return PODIUM.map(block => ({ place:block.place, x:block.x, y:block.top, w:block.w }));
}
export function podiumLayout(podium = [], steps = podiumSteps()) {
  const out = {};
  for (const step of steps) {
    const i = podium[step.place - 1];
    if (Number.isInteger(i)) out[i] = { x:step.x, y:step.y + 26, scale:step.place === 1 ? 0.8 : 0.7, place:step.place, z:4 - step.place };
  }
  return out;
}

/* a popup's spot over a rider's head, kept on the stage */
export function popupSpot(spot, anchor = ANCHOR, { lift = 14, half = 150 } = {}) {
  const head = (anchor.water[1] - (anchor.top || anchor.head)[1]) * spot.scale * (anchor.fill || 1);
  return {
    x:Math.max(half + 16, Math.min(STAGE_W - half - 16, spot.x)),
    y:Math.max(110, spot.y - head - lift),
  };
}

/* the popup's box at size 1 (stage px): the art's Popup at size 40, the
   offset over the word, Perfect's plate included */
export const POPUP_BOX = Object.freeze({ w:188, h:100 });
/* a popup's size over a row of this scale: a little smaller at the back */
/* compact (v4 item 3): never under 0.75, where the word is 24 px */
export const popupSize = scale => Math.max(0.75, Math.min(1.05, 0.55 + 0.5 * (Number(scale) || 0.6)));

const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/* where a popup may go, as shares of its own box: over the head, higher,
   a little to a side, higher still, further to a side */
const POPUP_TRIES = Object.freeze([[0, 0], [0, -0.55], [-0.34, -0.25], [0.34, -0.25], [0, -1.1], [-0.42, -0.8], [0.42, -0.8],
  [-0.5, 0.15], [0.5, 0.15], [-0.5, -0.1], [0.5, -0.1], [-0.45, 0.35], [0.45, 0.35], [0, -1.6], [-0.45, -1.4], [0.45, -1.4]]);
/* a face's box: the middle of the critter, its head down to its tube */
const faceBox = r => {
  const half = riderWidth(r.scale) * 0.38;
  return { i:r.i, x0:r.x - half, x1:r.x + half, y0:r.top, y1:r.top + 0.72 * Math.max(0, (r.y ?? r.top + 100) - r.top) };
};

/* Every rider's popup slot, reserved for the whole field (all of them pop
   at once on a cue), so no two popups overlap and none sits on another
   rider's face, a face in the crowd or the scene's accent where there is
   any other room. Each starts right over its own head; a taken spot tries
   higher, then to a side; the cheapest wins (a popup over a popup costs
   most, then the crowd and the accent, then a face in the field, then
   moving). riders: [{ i, x, top (the head's top), y (the waterline),
   scale }] (stage px; scale the row's); `others` faces with no popup of
   their own (the crowd on the bank); `avoid` rectangles ({ x0, x1, y0, y1 });
   `names` the names' rectangles under the tubes ({ i, x0, x1, y0, y1 }).
   Returns { [i]: { x, y (the popup's bottom), size } }, front rows first. */
export function popupSlots(riders = [], { box = POPUP_BOX, lift = 14, w = STAGE_W, others = [], avoid = [], names = [], stagger = false, tierExtra = 0 } = {}) {
  const list = riders.filter(r => r && Number.isFinite(r.x) && Number.isFinite(r.top));
  /* one line of riders closer than a popup is wide (Last Call's bar): each
     popup right over its own rider, alternating two heights left to right */
  if (stagger) {
    const out = {};
    list.slice().sort((a, b) => a.x - b.x).forEach((r, k) => {
      const size = popupSize(r.scale);
      const bw = box.w * size, bh = box.h * size;
      /* the upper tier clears the lower's stamp (Closest, Drinks) too */
      out[r.i] = { x:Math.max(bw / 2 + 12, Math.min(w - bw / 2 - 12, r.x)), y:Math.max(bh + 96, r.top - lift - (k % 2) * (bh + 8 + tierExtra)), size };
    });
    return out;
  }
  const faces = list.map(faceBox);
  /* the crowd: the whole critter, head to waterline (small, and nothing behind them) */
  const crowd = others.filter(r => r && Number.isFinite(r.x) && Number.isFinite(r.top))
    .map(r => ({ ...faceBox(r), y1:Number.isFinite(r.y) ? r.y : r.top + 100 }));
  const placed = [];
  const out = {};
  const order = list.slice().sort((a, b) => b.scale - a.scale || a.x - b.x);
  for (const r of order) {
    const size = popupSize(r.scale);
    const bw = box.w * size, bh = box.h * size;
    let best = null;
    for (const [fx, fy] of POPUP_TRIES) {
      const cx = Math.max(bw / 2 + 12, Math.min(w - bw / 2 - 12, r.x + fx * bw));
      const bottom = Math.max(bh + 96, r.top - lift + fy * bh);
      const rect = { x0:cx - bw / 2, x1:cx + bw / 2, y0:bottom - bh, y1:bottom };
      let cost = (Math.abs(fx) * 0.9 + Math.abs(fy) * 0.7) * bw * bh * 0.12;
      for (const p of placed) cost += 14 * overlap(rect, p);
      for (const f of faces) if (f.i !== r.i) cost += 4 * overlap(rect, f);
      for (const f of crowd) cost += 3 * overlap(rect, f);
      for (const a of avoid) cost += 12 * overlap(rect, a);
      /* the names (a player's own, under each tube) stay readable */
      for (const n of names) if (n.i !== r.i) cost += 10 * overlap(rect, n);
      if (!best || cost < best.cost - 1e-6) best = { cost, cx, bottom, rect };
    }
    placed.push(best.rect);
    out[r.i] = { x:best.cx, y:best.bottom, size };
  }
  return out;
}

/* a name tag's box at the TV's lettering (24 px pixel face on a tag in the
   rider's colour, a dark keyline): its width from its letters when it has
   not been measured */
export const NAME_H = 36;
export const nameWidth = name => 14 * String(name || "").length + 32;
/* where a name may go, as shares of its own box: right under its tube,
   lower, to a side, a touch higher */
const NAME_TRIES = Object.freeze([[0, 0], [0, 0.7], [-0.32, 0.35], [0.32, 0.35], [0, -0.45], [-0.55, 0], [0.55, 0], [0, 1.4]]);

/* Every name's spot under its own tube, on the layer over everything, so a
   player always finds themself: names never overlap each other, and keep
   off another rider's face and the popups where there is room. names:
   [{ i, x, y (the name's centre right under the tube), w, h, scale }];
   faces: [{ i, x, top, y, scale }]; popups: rectangles. Returns
   { [i]: { dx, dy } }, front rows placed first. */
export function nameSlots(names = [], { faces = [], popups = [] } = {}) {
  const list = names.filter(n => n && Number.isFinite(n.x) && Number.isFinite(n.y));
  const boxes = faces.filter(f => f && Number.isFinite(f.x) && Number.isFinite(f.top)).map(faceBox);
  const placed = [];
  const out = {};
  const order = list.slice().sort((a, b) => (b.scale || 0) - (a.scale || 0) || a.x - b.x);
  for (const n of order) {
    const w = n.w || nameWidth(n.name), h = n.h || NAME_H;
    let best = null;
    for (const [fx, fy] of NAME_TRIES) {
      const cx = Math.max(w / 2 + 8, Math.min(STAGE_W - w / 2 - 8, n.x + fx * w)), cy = Math.min(1080 - h / 2 - 4, n.y + fy * h);
      const rect = { x0:cx - w / 2, x1:cx + w / 2, y0:cy - h / 2, y1:cy + h / 2 };
      let cost = (Math.abs(fx) * 1.2 + Math.abs(fy) * 0.8) * w * h * 0.35;
      for (const p of placed) cost += 40 * overlap(rect, p);
      for (const f of boxes) if (f.i !== n.i) cost += 8 * overlap(rect, f);
      for (const p of popups) cost += 3 * overlap(rect, p);
      if (!best || cost < best.cost - 1e-6) best = { cost, dx:cx - n.x, dy:cy - n.y, rect };
    }
    placed.push(best.rect);
    out[n.i] = { dx:best.dx, dy:best.dy };
  }
  return out;
}
