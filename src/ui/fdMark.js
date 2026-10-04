/* The Field Day mark, "the chip, lit": the sun-gold betting chip with bone
   edge inserts, its middle a lit window of dark glass with the desert sun
   setting behind a butte (the session painting's language, Saturday
   evening's inks). One master drawing for the app (Brand.jsx FDMark) and
   every generated icon (scripts/icons.mjs), so the home screen, the favicon,
   the header and the TV can never drift apart.

   Pure string geometry on a 64 unit box, no DOM. Flat inks; the only
   gradient is the window's glass (its curvature), which is material.

   Three levels of detail, picked by rendered size:
   - "full" (> 72px): banded sky, the striped sun, the far range, a butte lit
     on its sunward face, a saguaro against the disc, the glass's reflection.
   - "mid" (33 to 72px): the window with two sky bands, the sun, the butte.
   - "small" (<= 32px): the chip and the setting sun only; edge inserts and
     the butte would close up into mush at favicon size. */

export const MARK_INKS = Object.freeze({
  chip:"#ffa630", ink:"#0a0910", bone:"#f4ecd8",
  /* sky, top to horizon: violet, violet-rose, rose, tangerine */
  sky:["#4a2690", "#953685", "#e0457a", "#ff6f2c"],
  sun:"#ffca78", far:"#7d295a", mesa:"#cb493f", shade:"#241034", floor:"#331914",
});

/* staging: the electric-blue chip on Friday night's glass (indigo sky, the
   cream moon, teal buttes), so the two installs never look alike */
export const MARK_INKS_STAGING = Object.freeze({
  chip:"#35c8f5", ink:"#101a33", bone:"#f7fbff",
  sky:["#12163b", "#18205e", "#1f3396", "#2c3fa6"],
  sun:"#ffe7b3", far:"#132c53", mesa:"#2c306b", shade:"#0b1f28", floor:"#0b1c25",
  badge:"#eb3f78",
});

export function markLevel(px) {
  return px <= 32 ? "small" : px <= 72 ? "mid" : "full";
}

const C = 32;
const f = n => +n.toFixed(2);

/* eight bone inserts round the rim, square to the chip like a real chip's
   edge spots, clipped inside the keyline */
function inserts(bone, clip) {
  return `<g clip-path="url(#${clip})" fill="${bone}">${Array.from({ length: 8 }, (_, i) =>
    `<rect x="${C - 2.7}" y="${C - 31}" width="5.4" height="9" rx="1.3" transform="rotate(${i * 45} ${C} ${C})"/>`
  ).join("")}</g>`;
}

/* the window's painting, in its own coordinates: horizon at y 38.8 */
const HORIZON = 38.8;
const SUN = { x: 36.4, y: 36.4, r: 8.8 };
const BUTTE = `M10 ${HORIZON}L15 32.6 15.8 29.2H24.4L25.2 32.4 32.6 ${HORIZON}Z`;
const BUTTE_LIT = `M22.2 29.2H24.4L25.2 32.4 32.6 ${HORIZON}H25.4L23.3 32.6Z`;
const FAR = `M13 ${HORIZON}L19 37 23 37.6 29 36.2 34 37.3 40 35.8 46 37 52 ${HORIZON}Z`;
/* a saguaro on the floor, standing against the disc */
const SAGUARO = "M42.5 42.6V32.4a.95.95 0 0 1 1.9 0v10.2Z"
  + "M42.5 38.4h-1.6a.8.8 0 0 1-.8-.8v-2.7a.75.75 0 0 1 1.5 0v2h.9Z"
  + "M44.4 36.8h1v-2.6a.75.75 0 0 1 1.5 0v3.4a.8.8 0 0 1-.8.8h-1.7Z";

function sky(inks, level, x0, x1, top) {
  const bands = level === "full"
    ? [[top, 26.2], [26.2, 31.6], [31.6, 35.8], [35.8, HORIZON]]
    : [[top, 31.4], [31.4, HORIZON]];
  const fills = level === "full" ? inks.sky : [inks.sky[1], inks.sky[2]];
  return bands.map(([y0, y1], i) =>
    `<rect x="${x0}" y="${f(y0)}" width="${f(x1 - x0)}" height="${f(y1 - y0 + 0.2)}" fill="${fills[i]}"/>`).join("");
}

/* the disc sinks into the horizon cut by bands of the sky behind it, as the
   painting's discs do (desertModel discStripes) */
function sun(inks, level) {
  const disc = `<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="${inks.sun}"/>`;
  if (level !== "full") return disc;
  const stripes = [[33.7, 0.9, inks.sky[2]], [36, 1.3, inks.sky[3]]]
    .map(([y, h, fill]) => `<rect x="${SUN.x - SUN.r - 1}" y="${y}" width="${SUN.r * 2 + 2}" height="${h}" fill="${fill}"/>`);
  return disc + stripes.join("");
}

/* inner markup of the mark on a 0 0 64 64 box. `uid` keeps the clip and
   gradient ids unique when several marks share a page. `label` draws the
   staging badge across the chip's lower rim. */
export function markBody({ level = "full", inks = MARK_INKS, uid = "fd", label = "" } = {}) {
  const chipClip = `${uid}-chip`, winClip = `${uid}-win`, glass = `${uid}-glass`;
  const R = 30, SEAT = level === "small" ? 20.2 : 20.4, WIN = level === "small" ? 17.8 : 18.1;
  const defs = `<defs>
    <clipPath id="${chipClip}"><circle cx="${C}" cy="${C}" r="${R - 1}"/></clipPath>
    <clipPath id="${winClip}"><circle cx="${C}" cy="${C}" r="${WIN}"/></clipPath>
    ${level === "small" ? "" : `<radialGradient id="${glass}" cx="${C}" cy="${C - 3}" r="${WIN + 3}" gradientUnits="userSpaceOnUse">
      <stop offset=".62" stop-color="${inks.ink}" stop-opacity="0"/>
      <stop offset="1" stop-color="${inks.ink}" stop-opacity=".55"/>
    </radialGradient>`}
  </defs>`;
  const chip = `<circle cx="${C}" cy="${C}" r="${R}" fill="${inks.chip}" stroke="${inks.ink}" stroke-width="2"/>`;
  const seat = `<circle cx="${C}" cy="${C}" r="${SEAT}" fill="${inks.ink}"/>`;
  const top = C - WIN - 1, x0 = C - WIN - 1, x1 = C + WIN + 1;

  if (level === "small") {
    /* chip, the dark window, and a big sun half under the horizon */
    const sunSmall = `<g clip-path="url(#${winClip})">
      <rect x="${x0}" y="${top}" width="${x1 - x0}" height="${WIN * 2 + 2}" fill="${inks.sky[0]}"/>
      <circle cx="${C}" cy="${C + 4}" r="11.8" fill="${inks.sun}"/>
      <rect x="${x0}" y="${C + 6}" width="${x1 - x0}" height="${WIN}" fill="${inks.ink}"/>
    </g>`;
    return defs + chip + seat + sunSmall + badge(inks, label);
  }

  const painting = `<g clip-path="url(#${winClip})">
    ${sky(inks, level, x0, x1, top)}
    ${sun(inks, level)}
    ${level === "full" ? `<path d="${FAR}" fill="${inks.far}"/>` : ""}
    <path d="${BUTTE}" fill="${inks.shade}"/>
    ${level === "full" ? `<path d="${BUTTE_LIT}" fill="${inks.mesa}"/>` : ""}
    <rect x="${x0}" y="${HORIZON}" width="${x1 - x0}" height="${C + WIN - HORIZON + 1}" fill="${inks.floor}"/>
    ${level === "full" ? `<path d="${SAGUARO}" fill="${inks.ink}"/>` : ""}
    ${level === "full" ? `<path d="M${C - 15} ${C - 3}L${C - 4} ${C - 17}H${C + 1.2}L${C - 13.6} ${C + 4.4}Z" fill="${inks.bone}" opacity=".1"/>` : ""}
    <circle cx="${C}" cy="${C}" r="${WIN}" fill="url(#${glass})"/>
  </g>
  <circle cx="${C}" cy="${C}" r="${WIN - 0.3}" fill="none" stroke="${inks.bone}" stroke-opacity=".22" stroke-width=".6"/>`;
  return defs + chip + inserts(inks.bone, chipClip) + seat + painting + badge(inks, label);
}

function badge(inks, label) {
  if (!label) return "";
  return `<rect x="9.5" y="43.5" width="45" height="15" rx="4" fill="${inks.badge}" stroke="${inks.bone}" stroke-width="1.4"/>
    <text x="32" y="55" text-anchor="middle" fill="${inks.bone}" font-family="Arial, sans-serif"
      font-size="12" font-weight="900" letter-spacing="1.2">${label}</text>`;
}

/* a standalone svg document of the mark at `px` */
export function markSvg(px, opts = {}) {
  const level = opts.level || markLevel(px);
  return `<svg width="${px}" height="${px}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${markBody({ ...opts, level })}</svg>`;
}
