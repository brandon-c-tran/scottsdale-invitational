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

export const initials = name => String(name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/* no portrait art on the screen: the chip shows initials */
export const usePortrait = () => null;
