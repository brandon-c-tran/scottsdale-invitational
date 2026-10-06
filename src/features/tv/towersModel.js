/* Chip Towers: the pure half. Tower heights, the transition between two
   boards, the drop schedule, the camera fit, and when the TV falls back to
   the flat standings. No three.js here, so the tests and the main bundle can
   read it; the WebGL scene lives in ChipTowers.jsx, a lazy TV-only chunk. */

import { PT } from "../../../shared/core.js";

/* world units: a chip is radius 1 and 0.2 thick (a real chip is ~0.17;
   0.2 reads better across a room). A tower keeps that proportion: the scale
   comes from the height the tallest needs, so a tall board stands narrower
   towers, never flatter chips, down to a legible floor (TOWER_LAYOUT). */
export const TOWER_GEOMETRY = Object.freeze({ radius:1, chip:0.2, elevationDeg:20, maxPxPerUnit:54, minPxPerUnit:4 });

/* ms, from the spec: a 300 hold after the broadcast, 420 per falling chip on
   a 110 stagger (a 1,600 award is 16 chips, about 2.2s), a 250 beat, a 900
   re-sort, then the lead ring slides for 600 */
export const TOWER_TIMING = Object.freeze({
  hold:300, drop:420, stagger:110, lift:380, liftStagger:60, sortDelay:250, sort:900, ring:600, fall:9,
});

/* failure: a frame over 50ms for 30 frames in a row means this TV cannot
   carry the scene, and it stays on the flat standings for the session */
export const TOWER_SLOW_FRAME_MS = 50;
export const TOWER_SLOW_FRAMES = 30;
/* more change than this at once is a reconnect or a batch, not a moment */
export const TOWER_MAX_ANIMATED_CHIPS = 160;

/* one chip per PT, never negative */
export const towerChips = pts => Math.max(0, Math.floor((Number(pts) || 0) / PT));

/* the tied top of the board; nobody leads while everyone is level */
export function towerLeaders(rows = []) {
  if (!rows.length) return [];
  const values = rows.map(row => Number(row.pts) || 0);
  const top = Math.max(...values);
  if (top === Math.min(...values)) return [];
  return rows.filter(row => (Number(row.pts) || 0) === top).map(row => row.player);
}

/* the board as the scene reads it: order left to right, chips per tower */
export const towerSignature = rows => (rows || []).map(row => `${row.player}:${towerChips(row.pts)}`).join("|");

/* What changes between two boards, and whether it is a moment worth moving
   for. First mount, a changed roster, reduced motion, or a batch too large to
   be one result all snap to the new board. */
export function towerTransition(prev, next, { reducedMotion = false } = {}) {
  const chips = Object.fromEntries((next || []).map(row => [row.player, towerChips(row.pts)]));
  const order = (next || []).map(row => row.player);
  const leadTo = towerLeaders(next || []);
  const base = { chips, order, leadTo, adds:{}, removes:{}, moves:[], reorder:false, leadFrom:[], leadMoved:false };
  if (!prev) return { ...base, mode:"snap", reason:"mount" };
  const before = Object.fromEntries(prev.map(row => [row.player, towerChips(row.pts)]));
  const prevOrder = prev.map(row => row.player);
  const leadFrom = towerLeaders(prev);
  const sameRoster = prevOrder.length === order.length && order.every(p => p in before);
  const adds = {}, removes = {};
  let total = 0;
  order.forEach(p => {
    const d = chips[p] - (before[p] ?? 0);
    if (d > 0) adds[p] = d;
    if (d < 0) removes[p] = -d;
    total += Math.abs(d);
  });
  const moves = order.map((p, to) => ({ player:p, from:prevOrder.indexOf(p), to })).filter(m => m.from !== m.to);
  const key = list => [...list].sort().join("+");
  const leadMoved = key(leadFrom) !== key(leadTo);
  const result = { ...base, adds, removes, moves, reorder:moves.length > 0, leadFrom, leadMoved, total };
  if (!sameRoster) return { ...result, mode:"snap", reason:"roster" };
  if (!total && !moves.length && !leadMoved) return { ...result, mode:"none", reason:"same" };
  if (reducedMotion) return { ...result, mode:"snap", reason:"reduced-motion" };
  if (total > TOWER_MAX_ANIMATED_CHIPS) return { ...result, mode:"snap", reason:"batch" };
  return { ...result, mode:"animate", reason:"moment" };
}

/* when each beat of an animated transition starts and ends, in ms from the
   broadcast. Every tower's chips fall in parallel with each other, one chip
   after another within a tower. */
export function towerSchedule(transition, timing = TOWER_TIMING) {
  const counts = [...Object.values(transition?.adds || {}), ...Object.values(transition?.removes || {})];
  const longest = counts.length ? Math.max(...counts) : 0;
  const falls = Object.values(transition?.adds || {});
  const lifts = Object.values(transition?.removes || {});
  const dropEnd = falls.length ? timing.hold + (Math.max(...falls) - 1) * timing.stagger + timing.drop : 0;
  const liftEnd = lifts.length ? timing.hold + (Math.max(...lifts) - 1) * timing.liftStagger + timing.lift : 0;
  const chipsEnd = longest ? Math.max(dropEnd, liftEnd) : 0;
  const sortStart = chipsEnd ? chipsEnd + timing.sortDelay : 0;
  const sortEnd = transition?.reorder ? sortStart + timing.sort : sortStart;
  const ringEnd = transition?.leadMoved ? sortEnd + timing.ring : sortEnd;
  return { chipsEnd, sortStart, sortEnd, ringStart:sortEnd, ringEnd, total:ringEnd };
}

/* What an animated transition sounds like, in ms from its start: a clack as
   each falling chip hits its tower (where dropEase reaches the table),
   panned to the tower, through the room's chip density rule; one "to the
   bank" as lost chips lift; the step as towers re-sort. */
export function towerSounds(transition, count, timing = TOWER_TIMING) {
  if (transition?.mode !== "animate") return { chips:[], cues:[] };
  const order = transition.order || [];
  const from = Object.fromEntries((transition.moves || []).map(move => [move.player, move.from]));
  const pan = player => {
    const slot = from[player] ?? order.indexOf(player);
    return count > 1 && slot >= 0 ? Math.round((-0.7 + 1.4 * slot / (count - 1)) * 100) / 100 : 0;
  };
  const chips = [];
  for (const [player, n] of Object.entries(transition.adds || {}))
    for (let i = 0; i < n; i++) chips.push({ offset:timing.hold + i * timing.stagger + timing.drop * 0.8, pan:pan(player) });
  chips.sort((a, b) => a.offset - b.offset);
  const cues = [];
  if (Object.keys(transition.removes || {}).length) cues.push({ id:"S11", offset:timing.hold });
  if (transition.reorder) cues.push({ id:"stepDown", offset:towerSchedule(transition, timing).sortStart });
  return { chips, cues };
}

/* the drop curve: accelerate to the table by 80%, then one small settle */
export const dropEase = t => t < 0.8 ? (t / 0.8) ** 2 : 1 - Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.04;
export const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export const easeOutCubic = t => 1 - (1 - t) ** 3;

/* The layout: every tower stands at the centre of its own fixed slot, one
   per standings row across the canvas between its safe edges, so names and
   counts never collide whatever the board holds or however many play. The
   chip keeps its true proportion (0.2 thick to a radius of 1, the camera's
   3D read): its scale is the largest at which the tallest tower fits the
   sky, at most FILL of the slot (and maxPxPerUnit), so a tall board stands
   narrower towers of chunky chips. Only when that would take the chip under
   `minDiameterPx` does the scale stop there and the chips get thinner
   instead: still one chip per 100, every tower on the same scale. The first
   KNEE chips of every tower (the opening 1,000) keep at least `minChipPx`
   each, so a 300 stack still reads as three chips; past the knee every chip
   is the same, so order and the gaps between the leaders stay true. */
export const TOWER_LAYOUT = Object.freeze({ edge:64, fill:0.7, gutter:12, labelMax:200, minDiameterPx:40, minChipPx:4, knee:10,
  floorPx:0.25 });
const EL_RAD = TOWER_GEOMETRY.elevationDeg * Math.PI / 180;
/* canvas px per world unit at which `tallest` chips and the top face stand in `room` */
const heightFit = (room, tallest) => {
  const g = TOWER_GEOMETRY;
  return Math.max(0, room) / (Math.max(1, tallest) * g.chip * Math.cos(EL_RAD) + 2 * g.radius * Math.sin(EL_RAD));
};
export function towerLayout({ width = 1920, baseY = 720, count = 1, tallest = 10, top = 40, edge = TOWER_LAYOUT.edge,
  fill = TOWER_LAYOUT.fill, minChipPx = TOWER_LAYOUT.minChipPx, minDiameterPx = TOWER_LAYOUT.minDiameterPx } = {}) {
  const g = TOWER_GEOMETRY, L = TOWER_LAYOUT;
  const n = Math.max(1, Math.floor(count) || 1);
  const slotPx = (width - 2 * edge) / n;
  const labelW = Math.max(0, Math.min(L.labelMax, slotPx - L.gutter));
  const slotK = Math.max(g.minPxPerUnit, Math.min(g.maxPxPerUnit, slotPx * fill / (2 * g.radius)));
  const floorK = Math.max(g.minPxPerUnit, Math.min(slotK, minDiameterPx / (2 * g.radius)));
  const fitK = heightFit(baseY - top, tallest);
  const k = Math.max(floorK, Math.min(slotK, fitK));
  const capPx = 2 * g.radius * Math.sin(EL_RAD) * k;
  const naturalPx = g.chip * Math.cos(EL_RAD) * k;
  const { small, big } = towerChipPx({ room:baseY - top - capPx, tallest, naturalPx, minChipPx });
  /* world units: the camera zooms with k, and only a board past the floor squashes its chips */
  const toWorld = px => px / (Math.cos(EL_RAD) * k);
  return { width, baseY, top, edge, count:n, slotPx, labelW, k, slotK, floorK, capPx, naturalPx, smallPx:small, bigPx:big,
    knee:L.knee, small:toWorld(small), big:toWorld(big), compressed:k <= floorK + 1e-9 && fitK < floorK };
}
/* How thick each chip is when `tallest` chips must fit `room` px: natural
   while they fit, else every chip alike, except that the first KNEE keep
   `minChipPx` (the flat horizon shares this) */
export function towerChipPx({ room, tallest = 1, naturalPx, minChipPx = TOWER_LAYOUT.minChipPx, knee = TOWER_LAYOUT.knee } = {}) {
  const L = TOWER_LAYOUT;
  const chips = Math.max(1, Math.floor(tallest) || 1);
  const space = Math.max(0, room);
  if (chips * naturalPx <= space + 1e-6) return { small:naturalPx, big:naturalPx, knee };
  const even = space / chips;
  const under = Math.min(chips, knee);
  const floor = Math.min(naturalPx, minChipPx, space / under);
  let small = even, big = even;
  if (even < floor) {
    small = floor;
    big = chips > under ? (space - under * small) / (chips - under) : small;
  }
  return { small:Math.max(L.floorPx, small), big:Math.max(L.floorPx, big), knee };
}
/* chip j's bottom and thickness, in world units (or px with `px`) */
export function towerChipSpan(layout, j, { px = false } = {}) {
  const s = px ? layout.smallPx : layout.small, b = px ? layout.bigPx : layout.big;
  const under = Math.min(j, layout.knee);
  return { y:under * s + Math.max(0, j - layout.knee) * b, h:j < layout.knee ? s : b };
}
/* a tower of `chips` in canvas px above the floor, its top face included */
export const towerStackPx = (layout, chips) => {
  const n = Math.max(0, Math.floor(chips) || 0);
  return (n ? towerChipSpan(layout, n - 1, { px:true }).y + towerChipSpan(layout, n - 1, { px:true }).h : 0) + layout.capPx;
};
/* the count under a tower as large as its label allows: 34px, down to the
   TV's 24px floor (Big Shoulders' numerals run under half an em) */
export const TOWER_COUNT_EM = 0.46;
export const towerCountSize = (text, width) =>
  Math.max(24, Math.min(34, Math.floor(width / Math.max(1, String(text).length * TOWER_COUNT_EM))));
/* a slot's center, from the canvas's center, in canvas px */
export const towerSlotPx = (slot, count, slotPx) => (slot - (count - 1) / 2) * slotPx;
/* where each label stands: its slot's center, the label's width, under the
   tower's front edge */
export const TOWER_LABEL_GAP = 8;
export function towerLabelBoxes(layout) {
  const y = layout.baseY + TOWER_GEOMETRY.radius * Math.sin(EL_RAD) * layout.k + TOWER_LABEL_GAP;
  return Array.from({ length:layout.count }, (_, slot) => {
    const x = layout.width / 2 + towerSlotPx(slot, layout.count, layout.slotPx);
    return { x, y, l:x - layout.labelW / 2, r:x + layout.labelW / 2 };
  });
}

/* A running count of slow frames. Idle frames never reach it: the scene
   renders on demand and only times frames while something moves. A TV so
   slow that one moment never reaches 30 frames trips on time instead: a
   second of nothing but slow frames. */
export const TOWER_SLOW_RUN_MS = 1000;
export function frameMonitor({ limit = TOWER_SLOW_FRAME_MS, frames = TOWER_SLOW_FRAMES, runMs = TOWER_SLOW_RUN_MS } = {}) {
  let run = 0, spent = 0;
  return dt => {
    if (dt > limit) { run += 1; spent += dt; } else { run = 0; spent = 0; }
    return run >= frames || spent >= runMs;
  };
}

/* The 3D board needs WebGL, a scene that has not failed this session, and
   chip-denominated values (the poker finale's final stacks move in 25s, so
   that one stays the flat list with its busts and away seats). Loading is
   its own state: the flat board shows until the chunk is in. */
export function towersMode({ supported = false, loaded = false, failed = null, kind = "awards" } = {}) {
  if (!supported || failed) return "2d";
  if (kind === "stacks") return "2d";
  return loaded ? "3d" : "2d";
}

/* the ambient board as towers: everyone on the board, rank order */
export const standingsTowerRows = (standings = []) => standings.map(row => ({ player:row.player, pts:row.pts, rank:row.rank }));

/* A result's standings step as towers: the board before this event and its
   bets, then after, with each change split into the event award and bets. */
export function resultTowerRows(model, sorted) {
  if (!model) return [];
  const byPlayer = Object.fromEntries(model.rows.map(row => [row.player, row]));
  const order = sorted ? model.rows.map(row => row.player) : model.beforeOrder;
  return order.filter(p => byPlayer[p]).map(p => {
    const row = byPlayer[p];
    return { player:p, pts:sorted ? row.after : row.before, rank:sorted ? row.rankAfter : row.rankBefore,
      award:sorted ? row.award : 0, bets:sorted ? row.bets : 0, move:sorted ? row.move : 0 };
  });
}
