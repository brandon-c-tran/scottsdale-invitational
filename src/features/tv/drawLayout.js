/* The TV draw's layout (TVDrawReveal), pure: how any draw's cards stand on
   the 1920x1080 canvas. The event's name stays where the game intro docked
   it; the cards share the room under it, centered and balanced by count
   (two play-ins and their byes, three to eight bracket matches, two to four
   teams, heats of three or four, the 5v5's 7 v 6), every card of a row the
   same size, faces as large as the busiest card allows. Fits by
   construction: a name may wrap at a space to two lines, never more, so a
   face steps down before a name would.

   Measures are canvas px. Big Shoulders 900 (the show weight) runs under
   .46em a character, which is what the estimate assumes. */

import { disp, teamLabel } from "../../../shared/core.js";
import { drawRevealGroups } from "../weekend/drawReveal.js";

export const DRAW_TV = Object.freeze({
  left:64, width:1792,       // the safe sides
  top:212, height:716,       // under the docked name (y 37 to 175), over the foot
  gap:24,                    // between cards
  padX:28, padY:22,          // inside a card
  title:34,                  // a card's title (Play-in 1, Heat 2)
  vs:58,                     // the vs line between a matchup's sides
  faceGap:10, lineGap:12, nameGap:18, tilePad:12,
  members:28,                // a named team's members, under its name
  vsBadge:120,               // the versus layout's VS between two cards
});
const CH = 0.46, LH = 1.15;
const FACES = [176, 160, 144, 128, 112, 104, 96, 88, 80, 72, 64, 56, 48];
/* a face beside its name never dwarfs it */
const ROW_MAX = 120;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/* lines a text takes at `size` in `width` (0 when it will not fit in two) */
export function textLines(text, size, width, ch = CH) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  if (width <= 0) return 0;
  /* a greedy wrap at spaces: a word wider than the line never fits */
  let lines = 1, run = 0;
  for (const word of words) {
    const w = word.length * ch * size, space = ch * size * 0.6;
    if (w > width) return 0;
    if (run && run + space + w > width) { lines++; run = w; } else run = run ? run + space + w : w;
  }
  return lines <= 2 ? lines : 0;
}
const count = line => Math.max(1, (line.avatars || []).length);
const facesWide = (k, face) => k * face + (k - 1) * DRAW_TV.faceGap;
const named = line => (line.avatars || []).length > 2;
const memberText = line => line.members || "";

/* one side or entry, its faces beside its name (`row`) or over it (`stack`);
   its height at `face`, or 0 when it does not fit `width` */
export function lineHeight(line, face, width, mode, name) {
  const k = count(line);
  if (mode === "stack") {
    if (facesWide(k, face) > width) return 0;
    const nl = textLines(line.text, name, width);
    if (!nl) return 0;
    const ml = named(line) ? textLines(memberText(line), DRAW_TV.members, width, .55) : 0;
    if (named(line) && !ml) return 0;
    return face + 10 + nl * name * LH + (ml ? 6 + ml * DRAW_TV.members * 1.25 : 0);
  }
  const room = width - facesWide(k, face) - DRAW_TV.nameGap;
  if (room < name * 3) return 0;
  const nl = textLines(line.text, name, room);
  if (!nl) return 0;
  const ml = named(line) ? textLines(memberText(line), DRAW_TV.members, room, .55) : 0;
  if (named(line) && !ml) return 0;
  return Math.max(face, nl * name * LH + (ml ? 6 + ml * DRAW_TV.members * 1.25 : 0));
}
export const nameSize = (face, mode) => mode === "stack" ? clamp(Math.round(face * .42), 32, 64) : clamp(Math.round(face * .44), 28, 52);

const titleHeight = (group, inner) => {
  if (!group.title) return 0;
  const lines = textLines(group.title, DRAW_TV.title, inner) || 2;
  return lines * DRAW_TV.title * LH + 12;
};

/* a card's kind: a matchup (`vs`), the byes, or a roster (a team or heat
   listed one entry a line) */
export const cardKind = group => group.vs ? "vs" : group.bye ? "bye" : "roster";
/* a matchup of pairs or teams stacks each side's faces over its name; a
   matchup of one-player sides does too when its card is wide enough to
   hold it, else each player stands beside their name */
const WIDE = 700;
const cardMode = (group, cardW = 0) => cardKind(group) === "vs"
  && (Math.max(...group.lines.map(count)) >= 2 || cardW >= WIDE) ? "stack" : "row";

/* a card's height at `face`, or 0 when its content does not fit `cardW` */
function cardHeight(group, face, cardW, tileCols = 1) {
  const inner = cardW - 2 * DRAW_TV.padX;
  const kind = cardKind(group), mode = cardMode(group, cardW), name = nameSize(face, mode);
  const head = titleHeight(group, inner);
  if (kind === "vs") {
    const h = Math.max(...group.lines.map(line => lineHeight(line, face, inner, mode, name)));
    if (!h || group.lines.some(line => !lineHeight(line, face, inner, mode, name))) return 0;
    return 2 * DRAW_TV.padY + head + group.lines.length * h + (group.lines.length - 1) * DRAW_TV.vs;
  }
  if (kind === "bye") {
    const tileW = (inner - (tileCols - 1) * DRAW_TV.lineGap) / tileCols - 2 * DRAW_TV.tilePad;
    const hs = group.lines.map(line => lineHeight(line, face, tileW, "row", name));
    if (hs.some(h => !h)) return 0;
    const rows = Math.ceil(group.lines.length / tileCols);
    const tile = Math.max(...hs) + 2 * DRAW_TV.tilePad;
    return 2 * DRAW_TV.padY + head + rows * tile + (rows - 1) * DRAW_TV.lineGap;
  }
  const hs = group.lines.map(line => lineHeight(line, face, inner, "row", name));
  if (hs.some(h => !h)) return 0;
  return 2 * DRAW_TV.padY + head + hs.reduce((a, b) => a + b, 0) + (hs.length - 1) * DRAW_TV.lineGap;
}

/* the largest face (and, for byes, the tile columns) that fits `cardH` */
function fitCard(group, cardW, cardH, limit = FACES[0]) {
  const cap = cardMode(group, cardW) === "row" ? Math.min(limit, ROW_MAX) : limit;
  const cols = cardKind(group) === "bye" ? [1, 2, 3].filter(n => n <= group.lines.length) : [1];
  let best = null;
  for (const tileCols of cols) for (const face of FACES) {
    if (face > cap) continue;
    const h = cardHeight(group, face, cardW, tileCols);
    if (h && h <= cardH) { if (!best || face > best.face) best = { face, tileCols, h }; break; }
  }
  return best || { face:FACES.at(-1), tileCols:cols.at(-1), h:cardH };
}

/* The cards as the TV letters them: the phone's groups (drawRevealGroups),
   a two-team draw's card under its team's name, and a named team's members
   listed under that name. */
export function tvDrawGroups(state, reveal) {
  if (!reveal) return [];
  const members = line => (line.avatars || []).length > 2 ? line.avatars.map(player => disp(state, player)).join(", ") : "";
  if (reveal.versus) return reveal.versus.map(team => {
    const line = { avatars:[...team.players], text:teamLabel(state, team) };
    return { title:null, team:true, lines:[{ ...line, members:members(line) }] };
  });
  return drawRevealGroups(state, reveal).map(group => ({ ...group,
    lines:group.lines.map(line => ({ ...line, members:members(line) })) }));
}

/* rows of a grid by count: one row to four, then two balanced rows, then three */
export function drawGrid(n) {
  if (n <= 4) return { cols:Math.max(1, n), rows:1 };
  if (n <= 8) return { cols:Math.ceil(n / 2), rows:2 };
  return { cols:Math.ceil(n / 3), rows:3 };
}

/* each card's column box in a grid of `n`: rows from drawGrid, the last
   row centered (depends on the count alone) */
export function gridBoxes(n) {
  const T = DRAW_TV, { cols } = drawGrid(n);
  const cardW = Math.floor((T.width - (cols - 1) * T.gap) / cols);
  return Array.from({ length:n }, (_, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const rowW = inRow * cardW + (inRow - 1) * T.gap;
    return { row, x:T.left + Math.round((T.width - rowW) / 2) + col * (cardW + T.gap), w:cardW };
  });
}

/* The whole layout. Versus (two teams): two cards across a VS. Otherwise a
   grid: cards per row from drawGrid, the last row centered. Every card of
   one kind takes the same face; byes never outsize the matchups. Cards are
   as tall as the tallest card needs (never past the room), and the grid
   sits centered in the room. Returns each card's box on the canvas, so the
   room's sound pans by where a card really stands. */
export function drawLayout(reveal, groups) {
  const T = DRAW_TV;
  if (reveal?.versus) {
    const cardW = Math.floor((T.width - T.vsBadge - 2 * T.gap) / 2);
    const inner = cardW - 2 * T.padX;
    const sides = groups.map(group => group.lines[0]);
    let face = FACES.at(-1), name = 56, h = 0;
    for (const f of FACES) {
      const k = Math.max(...sides.map(count));
      const n = k >= 3 ? 72 : clamp(Math.round(f * .45), 48, 80);
      const hs = sides.map(line => lineHeight(line, f, inner, "stack", n));
      const need = Math.max(...hs) + 2 * T.padY + 24;
      if (hs.every(Boolean) && need <= T.height) { face = f; name = n; h = need; break; }
    }
    const cardH = Math.max(h, 420);
    const top = T.top + Math.round((T.height - cardH) / 2);
    const boxes = [0, 1].map(i => ({ x:T.left + i * (cardW + T.vsBadge + 2 * T.gap), y:top, w:cardW, h:cardH }));
    return { kind:"versus", face, name, cardW, cardH, boxes, cards:groups.map(() => ({ face, name, mode:"stack", tileCols:1 })) };
  }
  const n = groups.length;
  const { cols, rows } = drawGrid(n);
  const cardW = Math.floor((T.width - (cols - 1) * T.gap) / cols);
  const avail = Math.floor((T.height - (rows - 1) * T.gap) / rows);
  const kinds = groups.map(cardKind);
  const fits = groups.map(group => fitCard(group, cardW, avail));
  const shared = kind => Math.min(...fits.filter((_, i) => kinds[i] === kind).map(fit => fit.face));
  const vsFace = kinds.includes("vs") ? shared("vs") : FACES[0];
  const rosterFace = kinds.includes("roster") ? shared("roster") : FACES[0];
  const cards = groups.map((group, i) => {
    const kind = kinds[i];
    const fit = kind === "bye" ? fitCard(group, cardW, avail, vsFace) : fitCard(group, cardW, avail, kind === "vs" ? vsFace : rosterFace);
    const mode = cardMode(group, cardW);
    return { kind, face:fit.face, tileCols:fit.tileCols, mode, name:nameSize(fit.face, mode), h:fit.h };
  });
  const cardH = Math.min(avail, Math.max(...cards.map(card => card.h)));
  const gridH = rows * cardH + (rows - 1) * T.gap;
  const top = T.top + Math.round((T.height - gridH) / 2);
  const boxes = gridBoxes(n).map((box, i) => ({ x:box.x, y:top + box.row * (cardH + T.gap), w:box.w, h:cardH }));
  return { kind:"grid", cols, rows, cardW, cardH, boxes, cards };
}

/* where each card stands, as a stereo pan (-0.6 left to 0.6 right) */
export function drawPans(layout) {
  return (layout?.boxes || []).map(box => {
    const x = (box.x + box.w / 2 - 960) / 960;
    return Math.round(clamp(x * 0.75, -0.6, 0.6) * 100) / 100;
  });
}
