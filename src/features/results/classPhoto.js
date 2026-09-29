/* D3: the class photo. All thirteen photo chips in final standings order,
   standing in tiers on the finale's desert under the edition's name: the
   champion (or a shared title) on top, everyone else in two rows below.
   One pure composition on a 1920x1080 frame, so the TV scene and the saved
   poster are the same picture: the TV lays it out with elements, the poster
   draws it on a canvas (posterImage.js). */

import { EDITION, disp } from "../../../shared/core.js";

export const CLASS_W = 1920, CLASS_H = 1080;
export const classTitle = () => ({ brand:"Field Day", edition:EDITION.label || `${EDITION.name} · ${EDITION.year}` });
export const posterFileName = () => `field-day-${String(EDITION.label || `${EDITION.name} ${EDITION.year}`)
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");

/* Everyone on the board, in its order (rank, then the board's own tie
   order). Nobody is left out: an away player's total carries. */
export function classPhotoModel(state, standings = []) {
  const people = standings.map(row => ({
    player:row.player, rank:row.rank, pts:row.pts,
    name:disp(state, row.player), stack:fmt(row.pts),
  }));
  const top = people.filter(person => person.rank === 1);
  const rest = people.filter(person => person.rank !== 1);
  const half = Math.ceil(rest.length / 2);
  return { title:classTitle(), people, tiers:[top, rest.slice(0, half), rest.slice(half)].filter(tier => tier.length) };
}

/* the tiers' geometry: chip centre and radius, then name and stack boxes
   (text tops, centred on the chip) */
const TIERS = [
  { cy:300, gap:44, nameSize:56, stackSize:40, radius:count => count > 2 ? 92 : count > 1 ? 110 : 120 },
  { cy:640, gap:30, nameSize:34, stackSize:30, radius:() => 68 },
  { cy:890, gap:30, nameSize:34, stackSize:30, radius:() => 68 },
];
const TITLE = { top:52, size:88 };
/* a display size that keeps a name inside its slot (Barlow Condensed caps
   run about half an em a letter) */
export const fitSize = (text, max, width, min = 24) =>
  Math.max(min, Math.min(max, Math.floor(width / (Math.max(4, String(text || "").length) * 0.52))));

export function classPhotoLayout(model, { width = CLASS_W } = {}) {
  const tiers = model.tiers.length === 1 ? [model.tiers[0]] : model.tiers;
  const slots = [];
  tiers.forEach((tier, t) => {
    /* a lone tier (a tiny test board) still sits on the top step */
    const spec = TIERS[Math.min(t, TIERS.length - 1)];
    const r = spec.radius(tier.length);
    const spacing = t === 0 ? Math.min(2 * r + 150, (width - 160) / Math.max(1, tier.length))
      : Math.min(290, (width - 160) / Math.max(1, tier.length));
    tier.forEach((person, i) => {
      const cx = Math.round(width / 2 + (i - (tier.length - 1) / 2) * spacing);
      const nameW = Math.round(Math.min(spacing - 24, t === 0 ? 560 : 270));
      const nameSize = fitSize(person.name.toUpperCase(), spec.nameSize, nameW);
      const nameTop = spec.cy + r + (t === 0 ? 26 : 16);
      slots.push({ ...person, tier:t, cx, cy:spec.cy, r, size:r * 2,
        name:{ top:nameTop, size:nameSize, width:nameW, text:person.name.toUpperCase() },
        stack:{ top:nameTop + nameSize + 6, size:spec.stackSize, text:person.stack },
        tag:{ cx:Math.round(cx - r * 0.74), cy:Math.round(spec.cy - r * 0.74), r:t === 0 ? 30 : 22, size:t === 0 ? 36 : 28,
          text:String(person.rank) } });
    });
  });
  /* the winners' stars keep to the sky under the title */
  const starBox = { left:60, right:width - 60, top:TITLE.top + TITLE.size + 40, bottom:540 };
  return { width, height:CLASS_H, title:{ ...TITLE, ...model.title }, slots, starBox };
}

/* fresh: the rows fill from the back of the photo to the front, the title
   last; ms from the step's write */
export const CLASS_TIMING = Object.freeze({ fade:0, fadeMs:400, chip:300, chipStagger:70, chipMs:420, title:1500,
  titleMs:400, total:2600 });
/* the order chips land in: the bottom row first, the champion last */
export function classEntrance(layout) {
  const order = [...layout.slots].sort((a, b) => b.tier - a.tier || a.cx - b.cx);
  return new Map(order.map((slot, i) => [slot.player, CLASS_TIMING.chip + i * CLASS_TIMING.chipStagger]));
}

/* The frozen TV's resting frame: the champion holds through the crown and
   one ambient period after it, then the champion and the class photo take
   turns on the server clock, the same on every TV. */
export function frozenAmbient({ now, crownAt = 0, crownMs = 0, period = 12000 } = {}) {
  const t = Number(now) || 0;
  if (Number(crownAt) > 0 && t - crownAt < crownMs + period) return "champion";
  return Math.floor(Math.max(0, t) / period) % 2 ? "class" : "champion";
}
