/* Which ink reads on a chip color: the dark ink (--ink0) or bone (--bone),
   whichever has the higher WCAG contrast against it. The one rule for every
   player chip (initials, numbers, edge marks, the TV towers, the color
   picker). In a browser the two inks are read once from the live :root
   tokens (src/ui/experience.css), so a palette change carries; CHIP_INKS
   is the fallback where there is no stylesheet (tests, a worker). */
export const CHIP_INKS = Object.freeze({ dark:"#151c1c", bone:"#f2eddf" });
const HEX = /^#[0-9a-f]{6}$/i;
let live = null;
export function chipInks() {
  if (live) return live;
  try {
    const root = globalThis.document?.documentElement;
    const css = root && globalThis.getComputedStyle?.(root);
    const dark = css?.getPropertyValue("--ink0")?.trim(), bone = css?.getPropertyValue("--bone")?.trim();
    if (HEX.test(dark || "") && HEX.test(bone || "")) live = Object.freeze({ dark, bone });
  } catch {}
  return live || CHIP_INKS;
}
export const __resetChipInks = () => { live = null; };

function channels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
export function luminance(hex) {
  const c = channels(hex);
  if (!c) return null;
  const [r, g, b] = c.map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/* true when the dark ink reads better than bone on `color` (a 6-digit hex);
   false for anything else, which keeps bone */
export function chipInkIsDark(color, inks = chipInks()) {
  const dark = contrastRatio(color, inks.dark), bone = contrastRatio(color, inks.bone);
  return dark !== null && bone !== null && dark > bone;
}

/* Small lettering on a chip color (initials on an avatar or a chip face)
   must hold 4.5:1. Mid-tone colors hold neither ink that well, so the fill
   steps toward the side the chosen ink is not on (darker under bone,
   lighter under the dark ink) until it does; the hue stays the player's. */
const toHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
export function letterPlate(color, inks = chipInks(), min = 4.5) {
  const c = channels(color);
  if (!c) return { fill:color, ink:inks.bone, dark:false };
  const dark = chipInkIsDark(color, inks);
  const ink = dark ? inks.dark : inks.bone;
  let fill = toHex(c);
  for (let step = 1; step <= 20 && (contrastRatio(fill, ink) || 0) < min; step++) {
    const t = step * 0.04;
    fill = toHex(c.map(v => dark ? v + (1 - v) * t : v * (1 - t)));
  }
  return { fill, ink, dark };
}

/* ── the peak flood: the glass lit in a player's color ──
   A win floods the screen in its winner's color (the crown, the walkout).
   Painted inserts keep the raw color; a flood is light, so the color is the
   same hue lit from behind: OKLCH lightness and chroma lifted to a floor, so
   a brown floods amber, an olive floods lime and a gray floods steel instead
   of laying a dull field over the room. Colors already that lit pass
   through unchanged. Its ink is whichever of the two inks reads better and
   always holds 4.5:1 (the lightness steps up further if it ever would not). */
export const FLOOD = Object.freeze({ light:0.67, chroma:0.13, neutral:0.075, maxLight:0.86, minContrast:4.5 });
const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
/* sRGB hex to OKLCH [L, C, h radians] (Ottosson's OKLab) */
export function oklch(hex) {
  const c = channels(hex);
  if (!c) return null;
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToLinear([L, C, h]) {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
/* the most chroma up to `C` that sRGB can show at this lightness and hue */
function lchHex(L, C, h) {
  let chroma = C;
  if (!inGamut(oklchToLinear([L, chroma, h]))) {
    let lo = 0, hi = chroma;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinear([L, mid, h]))) lo = mid; else hi = mid; }
    chroma = lo;
  }
  return toHex(oklchToLinear([L, chroma, h]).map(v => gam(Math.max(0, Math.min(1, v)))));
}
/* the chroma floor eases in from the near-neutrals (a gray takes a tint of
   its own hue, never a new color) to the full floor for a real color */
const chromaFloor = C => FLOOD.neutral + (FLOOD.chroma - FLOOD.neutral) * Math.max(0, Math.min(1, (C - 0.02) / 0.06));
export function floodPlate(color, inks = chipInks()) {
  const lch = oklch(color);
  if (!lch) return { color, ink:inks.bone, dark:false };
  const [L0, C0, h] = lch;
  let L = Math.min(FLOOD.maxLight, Math.max(L0, FLOOD.light));
  const C = Math.max(C0, chromaFloor(C0));
  let fill = lchHex(L, C, h);
  const pick = hex => (chipInkIsDark(hex, inks) ? inks.dark : inks.bone);
  for (let step = 0; step < 20 && (contrastRatio(fill, pick(fill)) || 0) < FLOOD.minContrast; step++) {
    L = Math.min(0.97, L + 0.02);
    fill = lchHex(L, C, h);
  }
  const ink = pick(fill);
  return { color:fill, ink, dark:ink === inks.dark };
}
/* the flood's color alone (a hex; anything that is not a 6-digit hex passes through) */
export const floodColor = color => floodPlate(color).color;
