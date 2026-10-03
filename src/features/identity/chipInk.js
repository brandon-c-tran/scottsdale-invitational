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
