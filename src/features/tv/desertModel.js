/* Desert Clock and the constellation: which session the TV sky shows, where
   each winner's star sits, and the paper-cut horizon as flat paths for any
   band size. Pure, so every TV draws the same sky from the same state. */

export const DESERT_PHASES = ["fri", "sam", "sap", "san", "fin"];
/* light skies carry --ink0 text; the rest keep bone */
export const DESERT_DAY = Object.freeze(["sam", "sap"]);
/* winners' stars show from Saturday night on */
export const DESERT_NIGHT = Object.freeze(["san", "fin"]);
export const isDaySky = phase => DESERT_DAY.includes(phase);
export const isNightSky = phase => DESERT_NIGHT.includes(phase);

const posted = res => Number(res?.confirmedAt || res?.ts) || 0;

/* The session the weekend is in: the finale once the table is dealt or the
   weekend is frozen, then the event in play, then the last event posted,
   then the one being prepared. Before any of that it is Friday. */
export function desertPhase(state, events = [], { liveEvent = null, operationEvent = null } = {}) {
  const valid = session => DESERT_PHASES.includes(session);
  if (state?.frozen || state?.poker) return "fin";
  if (events.some(ev => ev.finale && state?.results?.[ev.id])) return "fin";
  if (valid(liveEvent?.session)) return liveEvent.session;
  let latest = null;
  for (const ev of events) {
    const res = state?.results?.[ev.id];
    if (res?.slots?.[0]?.length && valid(ev.session) && (!latest || posted(res) > latest.at))
      latest = { session:ev.session, at:posted(res) };
  }
  if (latest) return latest.session;
  if (state?.live && valid(operationEvent?.session)) return operationEvent.session;
  return "fri";
}

/* FNV-1a, for a little stable jitter per event id */
function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const frac = n => n - Math.floor(n);

/* One star per event winner, in their chip color (the view resolves it).
   An event's stars sit together: its anchor comes from the slate position
   (an even R2 spread) nudged by its id, teammates in a small ring around it.
   x and y are fractions of the sky; dx and dy scale by the view's radius. */
export function constellationStars(state, events = []) {
  const stars = [];
  events.forEach((ev, order) => {
    const winners = state?.results?.[ev.id]?.slots?.[0] || [];
    if (!winners.length) return;
    const h = hash(ev.id);
    const jitter = ((h & 0xff) / 0xff - 0.5) * 0.05;
    const x = 0.06 + frac(0.5 + (order + 1) * 0.7548776662) * 0.88 + jitter;
    const y = 0.12 + frac(0.5 + (order + 1) * 0.5698402910) * 0.7;
    /* teammates sit in a short tilted belt, a real asterism, not a ring */
    const tilt = (((h >>> 8) % 60) - 30) / 60;
    winners.forEach((player, i) => {
      const n = winners.length;
      const k = i - (n - 1) / 2;
      stars.push({ id:`${ev.id}:${player}`, eventId:ev.id, player, order,
        x:Math.min(0.97, Math.max(0.03, x)), y, dx:k * 1.1, dy:k * tilt + (i % 2 ? 0.35 : -0.35) * (n > 2 ? 1 : 0) });
    });
  });
  return stars;
}

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
