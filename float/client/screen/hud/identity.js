/* A rider's identity on the HUD: the ink that reads on their colour, and
   their initials. (The 3D portraits are gone with the 3D screen; the critter
   itself is the face now, drawn by art.jsx.) */

/* the ink that reads on a colour: ink-black or bone, whichever contrasts more */
const lum = hex => {
  const v = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!v) return 0.2;
  const n = parseInt(v[1], 16);
  const ch = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(n >> 16 & 255) + 0.7152 * ch(n >> 8 & 255) + 0.0722 * ch(n & 255);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK = "#1d1a24", BONE = "#fffdf8";
export function inkOn(color) {
  const l = lum(color);
  return contrast(l, lum(INK)) >= contrast(l, lum(BONE)) ? INK : BONE;
}

/* a name lettered in its rider's colour over a dark outline: a dark colour
   is lifted toward white until it reads (luminance at least about 0.3) */
export function nameFill(color) {
  const v = /^#?([0-9a-f]{6})$/i.exec(String(color || ""));
  if (!v) return "#fffdf8";
  const n = parseInt(v[1], 16);
  let rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const lumOf = c => lum(`#${c.map(x => Math.round(x).toString(16).padStart(2, "0")).join("")}`);
  for (let k = 0; k < 8 && lumOf(rgb) < 0.3; k += 1) rgb = rgb.map(x => x + (255 - x) * 0.22);
  return `#${rgb.map(x => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

export const initials = name => String(name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/* no portrait art on the screen: the chip shows initials */
export const usePortrait = () => null;
