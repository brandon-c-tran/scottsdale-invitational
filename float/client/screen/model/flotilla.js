/* The flotilla's layout (float/GROOVE.md "Rounds, elimination, positions"):
   every rider in the field always on screen, in 1 to 3 staggered rows, each
   rider's x drifting ahead (right, downstream) or behind by their score
   against the field's. Eliminated riders stand on the far bank as the
   crowd; the podium has its three blocks. Pure: stage pixels on the fixed
   1920 x 1080 canvas, nothing measured from the DOM. */

export const STAGE_W = 1920;
export const STAGE_H = 1080;
/* the art manifest's sprite box (GROOVE.md "The art manifest") */
export const BOX = 512;
/* a placeholder critter's anchors in that box: the waterline under the
   tube's middle and the top of the head (the art's own anchors win) */
export const ANCHOR = Object.freeze({ water:[256, 404], head:[256, 112], top:[256, 112], name:[256, 486], face:[256, 236], hand:[328, 372], fill:1 });
/* the share of the box a rider's visible width takes (the tube's span) */
export const BODY_W = 0.74;

/* How many ride in each row, back to front: 1 to 4 one row, 5 to 10 two,
   11 to 16 three. Rows next to each other differ by an odd count where
   they can (13 -> 4, 5, 4), so their riders sit in each other's gaps and a
   row's popups land between the heads of the row behind it. */
const THREE_ROWS = Object.freeze({ 11:[4, 3, 4], 12:[5, 4, 3], 13:[4, 5, 4], 14:[5, 4, 5], 15:[6, 5, 4], 16:[5, 6, 5] });
export function rowCounts(n) {
  const riders = Math.max(0, Math.floor(Number(n) || 0));
  if (!riders) return [];
  if (riders <= 4) return [riders];
  if (riders <= 10) return [Math.ceil(riders / 2), Math.floor(riders / 2)];
  return [...(THREE_ROWS[Math.min(16, riders)] || THREE_ROWS[16])];
}

/* each row's waterline and scale by the number of rows (index 0 is the
   back); every row keeps inside [lo, hi] (the back row clear of the host on
   the left bank, the front row clear of the corners' foreground) */
const ROW_SHAPES = Object.freeze({
  1:[{ y:850, scale:0.8, lo:330, hi:1840 }],
  2:[{ y:640, scale:0.5, lo:420, hi:1850 }, { y:882, scale:0.62, lo:200, hi:1800 }],
  3:[{ y:598, scale:0.42, lo:430, hi:1860 }, { y:748, scale:0.5, lo:300, hi:1840 }, { y:922, scale:0.6, lo:190, hi:1790 }],
});
/* the final three, big in one row */
const FINAL_SHAPE = Object.freeze([{ y:860, scale:0.9, lo:300, hi:1840 }]);
/* the lobby's riders, to the right of the code and the QR */
const LOBBY_SHAPES = Object.freeze({
  1:[{ y:760, scale:0.62, lo:740, hi:1870 }],
  2:[{ y:600, scale:0.44, lo:740, hi:1880 }, { y:830, scale:0.54, lo:720, hi:1870 }],
  3:[{ y:560, scale:0.36, lo:740, hi:1890 }, { y:712, scale:0.43, lo:730, hi:1880 }, { y:890, scale:0.5, lo:720, hi:1870 }],
});
/* the formation's middle, a little right of the stage's (the host stands left) */
export const CENTRE_X = 1080;
/* slot spacing in box units: a row's spacing is this times its scale, so
   the rows share one grid seen in perspective */
export const GRID = 568;

/* score drift: px per percentage point against the field, and its limit */
export const DRIFT = Object.freeze({ PER_POINT:13, MAX:300 });
/* two riders in a row never closer than this share of their width */
export const MIN_GAP = 0.9;

export const riderWidth = scale => BOX * scale * BODY_W;

/* the rows a field rides in: [{ y, scale, lo, hi, shift, members:[i...] }].
   `order` is the field's order (best first: the front row takes the top of
   it, so the leaders ride biggest); `kind` "song" | "final" | "lobby". */
export function rowsFor(order = [], { kind = "song" } = {}) {
  const field = order.filter(i => Number.isInteger(i));
  const counts = rowCounts(field.length);
  if (!counts.length) return [];
  const shapes = kind === "lobby" ? LOBBY_SHAPES[counts.length]
    : kind === "final" || field.length <= 3 ? FINAL_SHAPE : ROW_SHAPES[counts.length];
  const rows = counts.map((k, r) => ({ ...shapes[r], index:r, k, members:[], shift:0 }));
  /* rows with counts of the same parity would stack: the later one moves half a slot */
  for (let r = 1; r < rows.length; r += 1) rows[r].shift = rows[r - 1].shift + ((rows[r].k - rows[r - 1].k) % 2 === 0 ? 0.5 : 0);
  const mid = rows.reduce((sum, row) => sum + row.shift, 0) / rows.length;
  rows.forEach(row => { row.shift -= mid; });
  /* front row first from the order, then the rows behind it */
  let at = 0;
  for (let r = rows.length - 1; r >= 0; r -= 1) {
    rows[r].members = field.slice(at, at + counts[r]);
    at += counts[r];
  }
  return rows;
}

/* a row's home slots: on the shared grid, in perspective, the row kept
   inside its span (the grid narrows if a row would not fit) */
export function rowSlots(row, { centre = CENTRE_X } = {}) {
  const k = row.members.length;
  const w = riderWidth(row.scale);
  const lo = row.lo + w / 2, hi = row.hi - w / 2;
  if (k <= 0) return [];
  const fit = k > 1 ? (hi - lo) / (k - 1) : Infinity;
  const spacing = Math.max(w * MIN_GAP, Math.min(GRID * row.scale, fit));
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

/* a rider's drift from their home slot: ahead (+) or behind (-) */
export function driftOf(live, mean, { perPoint = DRIFT.PER_POINT, max = DRIFT.MAX } = {}) {
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

/* Every rider's place on the water: { [i]: { x, y, scale, row, z } }.
   `lives` maps a rider to their live score (0 to 100, or null before their
   first judgement). x is the waterline's middle, y the waterline. */
export function flotillaLayout(order = [], lives = new Map(), { kind = "song", drift = true } = {}) {
  const rows = rowsFor(order, { kind });
  const get = i => (lives instanceof Map ? lives.get(i) : lives?.[i]);
  const mean = drift ? fieldMean(order.map(get)) : null;
  const out = {};
  for (const row of rows) {
    const slots = rowSlots(row);
    const w = riderWidth(row.scale);
    const ideal = row.members.map((i, j) => slots[j] + (drift ? driftOf(get(i), mean) : 0));
    const shown = spreadRow(ideal, w * MIN_GAP, row.lo + w / 2, row.hi - w / 2);
    row.members.forEach((i, j) => {
      out[i] = { x:shown[j], y:row.y, scale:row.scale, row:row.index, rows:rows.length, z:row.index * 100 + j };
    });
  }
  return out;
}

/* the field in the order the rows take it: by Cup total (best first), then
   entrant index; a song keeps this order to its end (rows never reshuffle
   mid-song) */
export function fieldOrder(field = [], cupOf = () => 0) {
  return field.filter(i => Number.isInteger(i))
    .map(i => ({ i, cup:Number(cupOf(i)) || 0 }))
    .sort((a, b) => b.cup - a.cup || a.i - b.i)
    .map(item => item.i);
}

/* ── the crowd on the far bank ── */
export const CROWD = Object.freeze({ y:478, scale:0.34, lo:470, hi:1880 });

/* the crowd's spots, left to right in elimination order: { [i]: { x, y, scale } } */
export function crowdLayout(outs = [], { y = CROWD.y } = {}) {
  const list = outs.filter(i => Number.isInteger(i));
  const out = {};
  if (!list.length) return out;
  const w = riderWidth(CROWD.scale);
  const span = CROWD.hi - CROWD.lo - w;
  const spacing = list.length > 1 ? Math.min(w * 1.25, span / (list.length - 1)) : 0;
  const start = CROWD.hi - w / 2 - spacing * (list.length - 1);
  list.forEach((i, k) => { out[i] = { x:start + k * spacing, y:y + (k % 2 ? 6 : 0), scale:CROWD.scale, z:k }; });
  return out;
}

/* ── the podium ── */
/* the three blocks: 2nd left, 1st in the middle, 3rd right */
export const PODIUM = Object.freeze([
  { place:1, x:960, top:660, w:420, h:420, scale:0.84 },
  { place:2, x:520, top:760, w:400, h:320, scale:0.74 },
  { place:3, x:1400, top:820, w:400, h:260, scale:0.74 },
]);
export function podiumLayout(podium = []) {
  const out = {};
  PODIUM.forEach(block => {
    const i = podium[block.place - 1];
    if (Number.isInteger(i)) out[i] = { x:block.x, y:block.top + 18, scale:block.scale, place:block.place, z:4 - block.place };
  });
  return out;
}

/* a popup's spot over a rider's head, kept on the stage */
export function popupSpot(spot, anchor = ANCHOR, { lift = 18, half = 150 } = {}) {
  const head = (anchor.water[1] - (anchor.top || anchor.head)[1]) * spot.scale * (anchor.fill || 1);
  return {
    x:Math.max(half + 16, Math.min(STAGE_W - half - 16, spot.x)),
    y:Math.max(110, spot.y - head - lift),
  };
}
