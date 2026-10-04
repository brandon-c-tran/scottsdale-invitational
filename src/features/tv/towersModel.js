/* Chip Towers: the pure half. Tower heights, the transition between two
   boards, the drop schedule, the camera fit, and when the TV falls back to
   the flat standings. No three.js here, so the tests and the main bundle can
   read it; the WebGL scene lives in ChipTowers.jsx, a lazy TV-only chunk. */

import { PT } from "../../../shared/core.js";

/* world units: a chip is 1 across and 0.2 thick (a real chip is ~0.17; 0.2
   reads better across a room), towers stand 2.9 apart in rank order */
export const TOWER_GEOMETRY = Object.freeze({ radius:1, chip:0.2, spacing:2.9, elevationDeg:20, maxPxPerUnit:64 });

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

/* Pixels per world unit so thirteen towers fit across and the tallest tower
   (one chip per PT, plus its top face) clears the space above the table. */
export function towerFit({ width, baseY, count = 13, tallest = 10, top = 40, pad = 64, slotPx = 0 } = {}) {
  const g = TOWER_GEOMETRY;
  const el = g.elevationDeg * Math.PI / 180;
  const span = Math.max(1, count - 1) * g.spacing + 2 * g.radius;
  /* fixed slots (the horizon): a chip is at most TOWER_SLOT_FILL of its slot */
  const across = slotPx > 0 ? slotPx * TOWER_SLOT_FILL / (2 * g.radius) : (width - 2 * pad) / span;
  const rise = Math.max(1, tallest) * g.chip * Math.cos(el) + 2 * g.radius * Math.sin(el);
  const up = (baseY - top) / rise;
  return Math.max(4, Math.min(g.maxPxPerUnit, across, up));
}
export const towerSlotX = (slot, count, spacing = TOWER_GEOMETRY.spacing) => (slot - (count - 1) / 2) * spacing;
/* The horizon keeps every tower in its own fixed slot of the canvas, so
   names and reels never collide however tall the tallest tower grows: the
   slot is in canvas pixels, and the chip shrinks inside it instead. */
export const TOWER_SLOT_FILL = 0.56;
export const towerSlotPx = (slot, count, slotPx) => (slot - (count - 1) / 2) * slotPx;

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

/* the ambient board as towers: all thirteen, rank order */
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
