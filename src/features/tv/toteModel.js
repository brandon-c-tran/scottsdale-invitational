/* The tote board: the TV's betting board for a contest of three sides or
   more (a free-for-all, a heat). Pure, so the geometry is testable and
   every TV draws the same board.

   The sides with money stand as rows ranked by their total (a tie keeps
   the contest's own order): the side's photo chips and name, an amber bar
   scaled to the biggest total, the total, and the backers' photo chips
   (most money first, "+N" past what the row holds). Every side nobody has
   backed folds into one strip of unlit chips under the rows; with no bets
   at all the strip is the whole field. Thirteen rows fit in two columns
   ranked down the first, then the second.

   Every width is fixed here, in canvas pixels, so a bet landing moves
   nothing but the bars, the totals and the order. */

import { chipNotch } from "../standings/boardModel.js";
import { DISC_OVERLAP } from "../identity/discLetters.js";

/* Big Shoulders' advance per character at show weight (tvModel's ADVANCE) */
const ADVANCE = 0.47;
export const TOTE = Object.freeze({
  oneCol:6,          // up to six rows stand in one column
  twoColMin:1400,    // a board this wide splits seven rows or more in two
  colGap:28,
  rowGap:10,
  maxRow:92,
  minRow:52,
  pad:16,            // a row's inner side padding
  gap:18,            // between a row's parts
  nameMin:24,        // the TV floor
  stripGap:14,       // between the rows and the strip
  strip:{ chip:48, name:24, label:24, gap:10, slotMax:150 },
  field:{ chip:72, name:28, gap:16, slotMax:180 },
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const facesWidth = (count, face) => face + Math.max(0, count - 1) * face * (1 - DISC_OVERLAP);

/* the strip's (or the field's) slots: one per side, on one line or up to
   `lines` balanced lines, the first that lets every name stand under its
   chips at the floor; else one line of chips alone */
function stripLayout(sides, width, spec, label, lines = 1) {
  const labelW = label ? Math.ceil(String(label).length * 0.62 * TOTE.strip.label) + 8 : 0;
  const room = width - labelW - (label ? spec.gap * 2 : 0);
  const most = Math.max(1, ...sides.map(side => side.players.length));
  const chip = spec.chip;
  const facesW = Math.ceil(facesWidth(most, chip));
  const longest = Math.max(1, ...sides.map(side => String(side.name || "").length));
  const at = count => {
    const perLine = Math.ceil(sides.length / count);
    const slot = clamp(Math.floor((room - (perLine - 1) * spec.gap) / Math.max(1, perLine)), facesW, Math.max(facesW, spec.slotMax));
    return { slot, perLine, lines:count, nameSize:Math.min(spec.name, Math.floor(slot / (longest * ADVANCE))) };
  };
  let pick = null;
  for (let count = 1; count <= Math.max(1, lines) && !pick; count++) {
    const fit = at(count);
    if (fit.nameSize >= TOTE.nameMin) pick = fit;
  }
  const use = pick || at(1);
  const lineH = chip + (pick ? 6 + Math.ceil(use.nameSize * 1.2) : 0);
  return { chip, slot:use.slot, perLine:use.perLine, lines:use.lines, gap:spec.gap,
    width:use.perLine * use.slot + (use.perLine - 1) * spec.gap, labelW, names:!!pick, nameSize:pick ? use.nameSize : 0,
    height:use.lines * lineH + (use.lines - 1) * spec.gap };
}

/* `sides`: [{ key, name, players, total, stacks:[{ player, stake }] }] in
   the contest's order. `width`, `height`: the board's body in canvas px. */
export function toteBoard(sides = [], { width = 1792, height = 440, prices = false } = {}) {
  const indexed = sides.map((side, index) => ({ ...side, index, total:Math.max(0, Number(side.total) || 0) }));
  const money = indexed.filter(side => side.total > 0).sort((a, b) => b.total - a.total || a.index - b.index);
  const idle = indexed.filter(side => !(side.total > 0));
  const top = money[0]?.total || 0;

  if (!money.length) {
    const field = stripLayout(idle, width, TOTE.field, null, 2);
    return { any:false, top:0, rows:[], idle:idle.map(sideKey), strip:{ ...field, kind:"field" }, cols:1, perCol:0, row:null };
  }

  /* a short board has room for the strip's names on two lines */
  const strip = idle.length ? { ...stripLayout(idle, width, TOTE.strip, STRIP_LABEL, money.length <= 3 ? 2 : 1), kind:"strip" } : null;
  const cols = money.length > TOTE.oneCol && width >= TOTE.twoColMin ? 2 : 1;
  const perCol = Math.ceil(money.length / cols);
  const room = height - (strip ? strip.height + TOTE.stripGap : 0);
  const rowH = clamp(Math.floor((room - (perCol - 1) * TOTE.rowGap) / perCol), TOTE.minRow, TOTE.maxRow);
  const colW = Math.floor((width - (cols - 1) * TOTE.colGap) / cols);

  /* the parts of a row, the same widths in every row */
  const most = Math.max(1, ...money.map(side => side.players.length));
  const face = clamp(rowH - 18, 40, 64);
  const facesW = Math.ceil(facesWidth(most, face));
  const reelSize = clamp(Math.round(rowH * 0.5), 30, 46);
  const reelW = Math.ceil(Math.max(5, ...money.map(side => side.total.toLocaleString("en-US").length)) * 0.72 * reelSize) + 12;
  /* a pool's price after the total, the tote's own column ("10.0×" at most) */
  const priceW = prices ? Math.ceil(5 * 0.62 * reelSize) + 8 : 0;
  const backer = clamp(rowH - 26, 34, 48);
  const slots = cols === 2 ? 4 : width >= TOTE.twoColMin ? 7 : 4;
  const backersW = slots * backer + (slots - 1) * 6;
  const longest = Math.max(6, ...money.map(side => String(side.name || "").length));
  const nameMax = clamp(Math.round(rowH * 0.48), 28, 44);
  const nameW = Math.min(Math.ceil(longest * ADVANCE * nameMax) + 4, Math.floor(colW * 0.24));
  const nameSize = Math.max(TOTE.nameMin, Math.min(nameMax, Math.floor(nameW / (longest * ADVANCE))));
  const barW = colW - TOTE.pad * 2 - facesW - nameW - reelW - backersW - TOTE.gap * 4 - (prices ? priceW + TOTE.gap : 0);
  const notch = chipNotch(top);
  const notchPx = notch ? Math.round((notch.pct / 100) * barW * 100) / 100 : 0;

  const rows = money.map((side, rank) => {
    const backers = side.stacks || [];
    const shown = backers.length <= slots ? backers.length : slots - 1;
    return {
      key:side.key, rank, col:cols === 2 ? Math.floor(rank / perCol) : 0, total:side.total,
      /* a sliver for the smallest bet beside the biggest, never an empty bar */
      share:Math.max(0.02, side.total / top),
      backers:backers.slice(0, shown).map(item => item.player), more:backers.length - shown,
    };
  });
  return {
    any:true, top, rows, idle:idle.map(sideKey), strip, cols, perCol,
    row:{ height:rowH, colW, face, facesW, nameW, nameSize, barW, notchPx, reelSize, reelW, priceW, backer, backersW, slots },
  };
}
const sideKey = side => side.key;

/* the strip's label: what sets its chips apart */
export const STRIP_LABEL = "No bets";
