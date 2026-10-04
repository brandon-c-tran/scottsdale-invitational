/* Desert Clock and the constellation: which session the TV sky shows, where
   each winner's star sits, and the paper-cut horizon as flat paths for any
   band size. Pure, so every TV draws the same sky from the same state.
   The session itself comes from ui/phase.js, the same function that
   themes every phone, so the room's sky and the phones never disagree. */

import { PHASES, weekendPhase } from "../../ui/phase.js";

export const DESERT_PHASES = PHASES;
export const desertPhase = weekendPhase;
/* light skies carry --ink0 text; the rest keep bone */
export const DESERT_DAY = Object.freeze(["sam", "sap"]);
/* winners' stars show from Saturday night on */
export const DESERT_NIGHT = Object.freeze(["san", "fin"]);
export const isDaySky = phase => DESERT_DAY.includes(phase);
export const isNightSky = phase => DESERT_NIGHT.includes(phase);

/* FNV-1a, for a little stable jitter per event id */
function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/* One star per event winner, in their chip color (the view resolves it).
   The weekend crosses the sky in slate order: each event owns an even
   slice of the width, left to right, and sits on a low arch with a little
   stable lift from its id, so no two events share a column and a star never
   moves when another event posts. Teammates sit in a small ring around
   their event's anchor (a pair side by side), sized so a ring never reaches
   the next event. x and y are fractions of the sky; dx and dy are in the
   view's star spacing. */
export function constellationStars(state, events = []) {
  const stars = [];
  const count = Math.max(1, events.length);
  events.forEach((ev, order) => {
    const winners = state?.results?.[ev.id]?.slots?.[0] || [];
    if (!winners.length) return;
    const h = hash(ev.id);
    const t = (order + 0.5) / count;
    const x = 0.05 + t * 0.9;
    const lift = ((h & 0xff) / 0xff - 0.5) * 0.18;
    const y = Math.min(0.85, Math.max(0.15, 0.62 - 0.34 * Math.sin(Math.PI * t) + lift));
    const n = winners.length;
    /* a pair leans at most 25 degrees; a ring turns freely */
    const turn = (n === 2 ? ((h >>> 8) % 50) - 25 : (h >>> 8) % 360) * Math.PI / 180;
    /* neighbours on a ring sit a star's width apart at any team size */
    const ring = n <= 1 ? 0 : n === 2 ? 0.7 : 0.66 / Math.sin(Math.PI / n);
    winners.forEach((player, i) => {
      const angle = turn + (i * 2 * Math.PI) / n;
      stars.push({ id:`${ev.id}:${player}`, eventId:ev.id, player, order, x, y,
        dx:Math.round(Math.cos(angle) * ring * 100) / 100, dy:Math.round(Math.sin(angle) * ring * 100) / 100 });
    });
  });
  return stars;
}

/* a flat four-point star of radius r, centered on 0 0: the winner's mark
   (the fixed background stars stay dots) */
export function starPoints(r) {
  const k = r * 0.3;
  return [[0, -r], [k, -k], [r, 0], [k, k], [0, r], [-k, k], [-r, 0], [-k, -k]];
}
export const starPath = r => `M${starPoints(r).map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join("L")}Z`;

/* the champion's stars joined in event order; a shared title draws each */
export function constellationLines(stars = [], players = []) {
  return players.map(player => ({
    player,
    points:stars.filter(star => star.player === player).sort((a, b) => a.order - b.order),
  })).filter(line => line.points.length > 1);
}

/* ── the horizon ──
   Skylines as [x 0..1, height 0..1 of the band's peak]. The far range is the
   McDowells, the mid range is Camelback's hump and head. */
const FAR = [[0, .5], [.075, .625], [.131, .5625], [.206, .78], [.2625, .69], [.325, .84], [.4, .72], [.475, .81],
  [.55, .67], [.625, .78], [.706, .69], [.7875, .83], [.8625, .7], [.9375, .78], [1, .72]];
const MID = [[0, .25], [.1125, .34], [.1875, .5], [.2375, .69], [.28125, .78], [.325, .69], [.356, .59], [.4, .69],
  [.4375, .91], [.475, 1], [.5125, .94], [.55, .78], [.6, .56], [.6875, .41], [.8125, .375], [1, .31]];
/* three saguaros, drawn at a 160-unit trunk and scaled to the band */
export const SAGUAROS = [
  { d:"M-14 0V-160a14 14 0 0 1 28 0V0ZM-14-80h-30v-40a12 12 0 0 1 24 0v22h6ZM14-110h30v-40a12 12 0 0 0-24 0v22h-6Z" },
  { d:"M-17 0V-195a17 17 0 0 1 34 0V0ZM-17-105h-38v-56a14 14 0 0 1 28 0v34h10ZM17-75h36v-40a14 14 0 0 0-28 0v18h-8Z" },
  { d:"M-10 0V-92a10 10 0 0 1 20 0V0ZM10-52h20v-26a9 9 0 0 0-18 0v8h-2Z" },
];
/* the disc is the sun by day and the moon at night: where it sits per phase */
export const DISC = {
  fri:{ x:.7375, y:.42 }, sam:{ x:.225, y:.35 }, sap:{ x:.5125, y:.25 }, san:{ x:.825, y:1 }, fin:{ x:.1, y:.3 },
};
export const FIXED_STARS = [[.11, .13], [.26, .08], [.475, .17], [.63, .07], [.81, .14], [.925, .23], [.375, .27], [.725, .28]];

/* The star box with the sun or moon taken out: when the disc sits inside
   the box, the box keeps the wider side of it, so no star is drawn over the
   disc. The TV band and the saved poster both use it. */
export function skyBoxClearOfDisc(box, disc, r, gap = 14) {
  if (!disc || !(r > 0)) return box;
  if (disc.y + r < box.top || disc.y - r > box.bottom || disc.x + r < box.left || disc.x - r > box.right) return box;
  const leftRoom = disc.x - r - gap - box.left, rightRoom = box.right - (disc.x + r + gap);
  return rightRoom >= leftRoom ? { ...box, left:Math.round(disc.x + r + gap) } : { ...box, right:Math.round(disc.x - r - gap) };
}

/* where stars sit in a band: the sky box (the whole sky, or the TV
   backdrop's fixed patch); a small box packs stars and belts tighter.
   Shared with the saved poster so both draw the same sky. */
export function skyStarLayout(box) {
  const small = box.bottom - box.top < 80;
  const spread = small ? 7 : 11;
  return {
    small,
    /* a four-point star's reach, not a dot's radius */
    starR:small ? 5 : 8,
    fixedR:small ? 1.6 : 2,
    at:star => [Math.round(box.left + star.x * (box.right - box.left) + star.dx * spread),
      Math.round(box.top + star.y * (box.bottom - box.top) + star.dy * spread)],
    fixed:([x, y]) => [Math.round(box.left + x * (box.right - box.left)), Math.round(box.top + y * 3 * (box.bottom - box.top))],
  };
}

const r1 = n => Math.round(n * 10) / 10;
function skyline(points, { width, horizon, amp, x0 = 0, x1 = 1, envelope = () => 1, bottom }) {
  const at = ([x, h]) => [r1((x0 + x * (x1 - x0)) * width), r1(horizon - h * amp * envelope(x0 + x * (x1 - x0)))];
  const pts = points.map(at);
  const first = pts[0], last = pts[pts.length - 1];
  const lead = x0 > 0 ? [[0, first[1]]] : [];
  const tail = x1 < 1 ? [[width, last[1]]] : [];
  const all = [...lead, ...pts, ...tail];
  return `M${all.map(([x, y]) => `${x} ${y}`).join("L")}V${bottom}H0Z`;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* The scene for one band. "strip" is the masthead: a low horizon with the
   mountains kept to the right so the masthead reads on sky. "full" is the
   whole range behind the towers or the champion's trophy. */
export function desertScene({ width = 1920, height = 118, variant = "strip" } = {}) {
  const strip = variant === "strip";
  const horizon = strip ? height - 4 : Math.round(height * 0.84);
  const amp = strip ? Math.min(74, height * 0.62) : Math.round(Math.min(height * 0.42, width * 0.2));
  const envelope = strip ? x => 0.22 + 0.78 * smooth(0.36, 0.62, x) : () => 1;
  const far = skyline(FAR, { width, horizon, amp:amp * 0.92, envelope, bottom:height });
  const mid = skyline(MID, { width, horizon, amp, x0:strip ? 0.46 : 0, x1:strip ? 1.08 : 1, envelope, bottom:height });
  const swell = strip ? 0 : Math.max(3, height * 0.012);
  const ground = `M0 ${horizon}Q${width * 0.25} ${horizon - swell} ${width * 0.5} ${horizon}T${width} ${horizon}V${height}H0Z`;
  const nearTop = strip ? height : Math.round(horizon + (height - horizon) * 0.5);
  const scale = (strip ? amp / 250 : amp / 330);
  const cacti = (strip ? [[0.62, 0.9, 1], [0.795, 0.62, 2], [0.93, 1, 0]] : [[0.14, 1, 0], [0.675, 0.62, 2], [0.825, 1.05, 1]])
    .map(([x, size, shape]) => ({ x:r1(x * width), y:horizon + (strip ? 0 : 2), scale:r1(scale * size * 100) / 100, d:SAGUAROS[shape].d }));
  const skyTop = strip ? 4 : Math.round(height * 0.04);
  const skyBottom = Math.round(horizon - amp * (strip ? 0.9 : 1.02));
  const discR = strip ? Math.round(Math.min(26, height * 0.22)) : Math.round(Math.min(74, amp * 0.34));
  const disc = Object.fromEntries(Object.entries(DISC).map(([phase, at]) => {
    const x = strip ? width * (0.52 + at.x * 0.42) : width * at.x;
    const y = strip ? skyTop + discR + (height * 0.45 - discR) * Math.min(1, at.y) : skyTop + (horizon - skyTop) * at.y * 0.9;
    return [phase, { x:r1(x), y:r1(y) }];
  }));
  return { width, height, horizon, amp, far, mid, ground, nearTop, cacti, disc, discR, sky:{ top:skyTop, bottom:skyBottom } };
}

/* ── the backglass painting ──
   The whole TV canvas is one reverse-painted backglass: banded sky, the
   session's sun or moon (cut by stripes where it sinks into the horizon),
   the McDowells far off, Camelback's hump, two flat-topped buttes with a
   lit face and a shade face, saguaros, and the desert floor the chip
   towers stand on. Flat shapes only; every fill is a session token. The
   floor (ground and near) is always dark, because the towers' names and
   reels sit on it. */
export const GLASS = Object.freeze({ width:1920, height:1080, horizon:856, floor:944 });
/* skies that carry the fixed stars */
export const GLASS_STARRY = Object.freeze(["fri", "san", "fin"]);
const GLASS_BANDS = [[0, 300, "sky"], [300, 500, "sky2"], [500, 650, "sky3"], [650, 760, "sky4"], [760, GLASS.horizon, "glow"]];
/* where the disc sits per session: low, in the window between the live
   board and the floor, so the room sees it during play */
export const GLASS_DISC = Object.freeze({
  fri:{ x:1580, y:770, r:76, stripes:false },
  sam:{ x:430, y:GLASS.horizon, r:220, stripes:true },
  sap:{ x:1500, y:800, r:104, stripes:false },
  san:{ x:1480, y:GLASS.horizon, r:160, stripes:true },
  fin:{ x:960, y:GLASS.horizon, r:0, stripes:false },
});
const BUTTES = [
  { lit:[[40, 856], [150, 716], [176, 700], [430, 700], [452, 716], [520, 856]],
    shade:[[430, 700], [470, 700], [500, 716], [620, 856], [520, 856], [452, 716]] },
  { lit:[[1250, 856], [1360, 740], [1384, 728], [1640, 728], [1662, 740], [1760, 856]],
    shade:[[1640, 728], [1700, 728], [1726, 740], [1900, 856], [1760, 856], [1662, 740]] },
];
const GLASS_CACTI = [[300, 1.25, 1], [760, 0.8, 0], [1180, 0.95, 2], [1830, 1.35, 0]];
const poly = points => `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;

/* the fixed stars: a stable scatter over the upper sky */
export function glassStars(count = 46, { width = GLASS.width, top = 16, bottom = 640 } = {}) {
  let seed = 0x2f6b9d;
  const next = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 0xffffffff; };
  return Array.from({ length:count }, () => ({
    x:Math.round(16 + next() * (width - 32)), y:Math.round(top + next() * (bottom - top)),
    r:Math.round((1.4 + next() * 1.8) * 10) / 10, dim:next() > 0.6,
  }));
}

/* the stripes that cut a setting disc: horizontal bars, thicker toward the
   horizon, each painted in the sky band it crosses */
export function discStripes(disc, horizon = GLASS.horizon) {
  if (!disc?.stripes || !(disc.r > 0)) return [];
  const out = [];
  const top = disc.y - disc.r * 0.15;
  let y = top, gap = 10, k = 0;
  while (y < Math.min(horizon, disc.y + disc.r)) {
    const h = 5 + k * 3;
    const band = GLASS_BANDS.find(([from, to]) => y + h / 2 >= from && y + h / 2 < to)?.[2] || "glow";
    out.push({ y:Math.round(y), h, band });
    y += h + gap; gap = Math.max(5, gap - 1); k += 1;
  }
  return out;
}

export function backglassScene({ width = GLASS.width, height = GLASS.height } = {}) {
  const horizon = GLASS.horizon;
  const bands = GLASS_BANDS.map(([from, to, layer]) => ({ y:from, h:to - from, layer }));
  const far = skyline(FAR, { width, horizon, amp:190, bottom:horizon + 2 });
  const hump = skyline(MID, { width, horizon, amp:120, x0:0.34, x1:0.7, envelope:x => smooth(0.3, 0.42, x) * (1 - smooth(0.6, 0.74, x)),
    bottom:horizon + 2 });
  const buttes = BUTTES.map(b => ({ lit:poly(b.lit), shade:poly(b.shade) }));
  const cacti = GLASS_CACTI.map(([x, scale, shape]) => ({ x, y:horizon + 18, scale, d:SAGUAROS[shape].d }));
  return { width, height, horizon, floor:GLASS.floor, bands, far, hump, buttes, cacti, stars:glassStars(),
    starBox:{ left:140, right:width - 140, top:120, bottom:560 } };
}
