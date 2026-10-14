/* The TV's table (Oct 13, "your seat at the table"): the felt every phone
   is a seat at, drawn at room scale. Pure: the decided contest a recorded
   entry stood for, the felt's geometry on the fixed 1920x1080 canvas, and
   the server-anchored windows its two moments play in (the dealer's sweep
   at Lock and start, the settle once a contest is decided). What each spot
   shows comes from the phone's own model (wagers/tableModel.js). */
import { bracketMatchName, resolveSlot, stageEntrantView, stageFinalists } from "../../../shared/core.js";
import { GRID_COLS, gridRows } from "../wagers/tableModel.js";

/* ── a decided contest, as its table stood ──
   A recorded entry (eventOps[ev].contestStack) keeps its id and kind, not
   its sides: they are read back from the bracket's match, the heat's
   entrants or the stage's finalists, which a decision never changes. */
export function entryContest(state, ev, entry) {
  if (!ev || !entry) return null;
  const op = state.eventOps?.[ev.id] || {};
  const base = { id:entry.id, eventId:ev.id, kind:entry.kind, match:entry.match, group:entry.group,
    stagesId:entry.stagesId, drawId:entry.drawId, ...(op.pools?.[entry.id] ? { pool:true } : {}),
    ...(op.odds?.[entry.id]?.underdog !== null && op.odds?.[entry.id]?.underdog !== undefined ? { odds:op.odds[entry.id] } : {}) };
  if (entry.kind === "match") {
    const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
    const match = br?.rounds?.[entry.match?.[0]]?.[entry.match?.[1]];
    if (!match || !draw) return null;
    const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
    if (keys.some(key => key === null || key === undefined || !draw.teams?.[key])) return null;
    return { ...base, label:bracketMatchName(br, entry.match[0], entry.match[1]),
      sides:keys.map(key => ({ key, players:[...draw.teams[key].players] })) };
  }
  const st = state.stages?.[ev.id];
  if (!st) return null;
  const sides = keys => keys.map(key => ({ key, players:stageEntrantView(state, st, key).players }));
  if (entry.kind === "heat") {
    const group = st.groups?.[entry.group];
    return group ? { ...base, label:group.name, sides:sides(group.entrants || []) } : null;
  }
  const finalists = stageFinalists(st);
  return finalists ? { ...base, label:"Final", sides:sides(finalists) } : null;
}

/* ── the felt on the canvas ── */
/* the live row (between the masthead and the horizon, less its padding),
   and a big bracket's band (that row less the bracket and the gap) */
export const TABLE_H = 538;
export const BAND_TABLE_H = 174;
const PAD_X = 24, PAD_TOP = 16, PAD_BOTTOM = 18, HEAD_H = 46, HEAD_GAP = 10;
export const SPOT_GAP = { match:24, row:16, grid:12 };
/* the room's % is the spot's hero: as large as the spot allows */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Every size on the felt for a shape, a side count and the felt's box.
   `band`: the one-row strip above a big bracket. Text never under 24px. */
export function tableLayout({ shape, count, width, height = TABLE_H, band = false }) {
  const n = Math.max(1, count);
  if (band) {
    const center = 210, gap = 16;
    const spotW = Math.floor((width - 2 * 20 - center - 2 * gap) / 2);
    const spotH = height - 2 * 12;
    return { band:true, shape:"match", spotW, spotH, center, gap, face:64, pct:84, nameMax:52, nameMin:28, chip:40, chipMin:30 };
  }
  const bodyH = height - PAD_TOP - PAD_BOTTOM - HEAD_H - HEAD_GAP;
  const inner = width - 2 * PAD_X;
  if (shape === "grid") {
    const cols = Math.min(GRID_COLS, n), rows = gridRows(n);
    const spotW = Math.floor((inner - (GRID_COLS - 1) * SPOT_GAP.grid) / GRID_COLS);
    const spotH = Math.floor((bodyH - (rows - 1) * SPOT_GAP.grid) / rows);
    /* a cell: the face (and its backers) on top, the name, the % below */
    return { shape, cols, rows, spotW, spotH, bodyH, face:spotH >= 200 ? 56 : 48, pct:clamp(spotH - 136, 48, 84),
      name:clamp(Math.floor(spotW / 9), 24, 30), backer:36 };
  }
  if (shape === "row") {
    const spotW = Math.floor((inner - (n - 1) * SPOT_GAP.row) / n);
    return { shape, cols:n, rows:1, spotW, spotH:bodyH, bodyH, face:spotW >= 360 ? 72 : 56,
      pct:clamp(Math.floor(spotW * 0.3), 64, 112), nameMax:spotW >= 360 ? 48 : 36, nameMin:24, chip:spotW >= 360 ? 52 : 44, chipMin:30 };
  }
  const spotW = Math.floor((inner - SPOT_GAP.match) / 2);
  const wide = spotW >= 640;
  return { shape:"match", cols:2, rows:1, spotW, spotH:bodyH, bodyH, wide, face:wide ? 96 : 64,
    pct:wide ? 156 : 112, nameMax:wide ? 64 : 48, nameMin:wide ? 36 : 28, chip:wide ? 60 : 48, chipMin:30 };
}

/* a spot's left edge on the felt (the rake starts on the first loser's) */
export function spotX(layout, index, width) {
  if (layout.band) return 20 + (index ? layout.spotW + layout.gap * 2 + layout.center : 0);
  const gap = SPOT_GAP[layout.shape] || 16;
  const used = layout.cols * layout.spotW + (layout.cols - 1) * gap;
  const left = Math.max(PAD_X, Math.round((width - used) / 2));
  return left + (index % (layout.cols || 1)) * (layout.spotW + gap);
}

/* ── the dealer's sweep: "No more bets" ──
   Played once from the lock's server time (eventOps[ev].bettingLockedAt),
   so every TV sweeps together; a TV that arrives late joins mid-sweep and
   one that arrives after it sees the table as it stands. */
export const SWEEP_MS = 2600;
export const SWEEP = Object.freeze({ glove:0, gloveMs:1300, words:320, wordsMs:340, out:2100 });
export function sweepWindow(lockAt, now) {
  const at = Number(lockAt) || 0;
  if (!at) return null;
  const elapsed = Number(now) - at;
  return elapsed >= -1500 && elapsed < SWEEP_MS ? { at, elapsed:Math.max(0, elapsed) } : null;
}

/* ── the settle: a decided contest's table ──
   Offsets from the decision's own write time, on the beats roomSound
   already cues (S10 won at ADVANCE_TIMING.stamp, S11 to the bank and S12
   payout at SETTLE_SOUND): the winner's spot floods, WON stamps, the glove
   rakes the losing spots' chips to the bank, the winners' stacks grow, and
   a long shot's price lights last. */
export const SETTLE = Object.freeze({ flood:0, floodMs:700, won:120, rake:700, rakeMs:900, pay:1300, paid:1700 });

/* the bettors a spot's grid cell shows as a pile of faces: the biggest
   first, the rest one "+N" */
export function backerPile(stacks = [], room = 4) {
  const list = stacks || [];
  if (list.length <= room) return { shown:list.map(item => item.player), more:0 };
  return { shown:list.slice(0, room - 1).map(item => item.player), more:list.length - (room - 1) };
}

/* ── the chip layer (features/chips3d) on this felt ──
   The chip a shape's stacks start at, the smallest before the smallest
   fold into "+N", and whether each stack keeps room beside it for its
   payout and a plate under it. A grid cell's chips are small and plain
   (its backers' faces already say whose). */
export function chipLayer(layout) {
  if (layout.shape === "grid" && !layout.band) return { chip:28, min:18, pairs:false, labels:false };
  return { chip:layout.chip || 48, min:layout.chipMin || 30, pairs:true, labels:true };
}
/* the dealer's glove as the chip layer meets it: its centre's path across
   the felt (the sweep's glove is 220 wide, the rake's 180, the band's 120) */
export const glovePath = Object.freeze({
  sweep:width => ({ x0:-260 + 110, x1:width + 60 + 110 }),
  rake:(x0, x1, band = false) => { const half = band ? 60 : 90; return { x0:x0 - 60 + half, x1:x1 + half }; },
});
