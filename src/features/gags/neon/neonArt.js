/* The bits' neon (Oct 14): every bit is drawn like an animated Vegas
   sign, single glowing tubes on the dark glass. This module is the pure
   part: the tubes' tones, the house hand's drawing, the chip's geometry
   and a few path builders. Neon.jsx draws them. Pure: no DOM.

   A tube is { d, tone, w } in art units: `d` an SVG path, `tone` a lamp
   (NEON_TONES) or "player" (the cast member's own lit color), `w` the
   tube's width. A drawing is a list of tubes and, under them, dark glass
   fills (the backing a sign's tubes are bent over), so a prop occludes
   what is behind it. */

/* The lamps a tube can be. Magenta is live, amber chips and money, cyan
   information (DESIGN.md's fixed jobs); bone is the plain white tube a
   sign's lettering and its house hand are bent from; clay a loss's red;
   ember a fire's orange. Filament yellow stays "you" alone and is never a
   tube. "player" is the cast member's own color, lit (floodColor). */
export const NEON_TONES = Object.freeze({
  magenta:"var(--neon-magenta)",
  amber:"var(--neon-amber)",
  cyan:"var(--neon-cyan)",
  bone:"var(--neon-bone)",
  clay:"var(--neon-clay)",
  ember:"var(--neon-ember)",
  player:"var(--neon-player, var(--neon-bone))",
});
export const isTone = tone => Object.hasOwn(NEON_TONES, tone);

/* a tube's standard widths, in canvas px at scale 1 */
export const TUBE = Object.freeze({ w:7, thin:4.5, fine:3 });

const r1 = n => Math.round(n * 10) / 10 || 0;

/* ── path builders ── */
export const circlePath = (cx, cy, r) => `M${r1(cx - r)} ${r1(cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(r * 2)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-r * 2)} 0Z`;
/* an arc of a circle from `a0` to `a1` degrees (0 is right, clockwise) */
export function arcPath(cx, cy, r, a0, a1) {
  const p = a => [r1(cx + Math.cos(a * Math.PI / 180) * r), r1(cy + Math.sin(a * Math.PI / 180) * r)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r1(r)} ${r1(r)} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1} ${y1}`;
}
export const ellipsePath = (cx, cy, rx, ry) =>
  `M${r1(cx - rx)} ${r1(cy)}a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(rx * 2)} 0a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(-rx * 2)} 0Z`;
/* a star of `points` points, outer radius r, inner ri */
export function starPath(points, r, ri, cx = 0, cy = 0, turn = -90) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (turn + i * 180 / points) * Math.PI / 180, rr = i % 2 ? ri : r;
    out.push(`${r1(cx + Math.cos(a) * rr)} ${r1(cy + Math.sin(a) * rr)}`);
  }
  return `M${out.join("L")}Z`;
}
/* `n` short spokes between radii r0 and r1 (a burst, a chip's edge spots) */
export function spokesPath(n, r0, rOut, cx = 0, cy = 0, turn = 0) {
  return Array.from({ length:n }, (_, i) => {
    const a = (turn + i * 360 / n) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return `M${r1(cx + c * r0)} ${r1(cy + s * r0)}L${r1(cx + c * rOut)} ${r1(cy + s * rOut)}`;
  }).join("");
}

/* ── the chip ──
   A player is their photo chip standing on its edge: a dark glass coin,
   the photo in the middle, the rim one tube in their own lit color with
   the edge spots of a casino chip between it and an inner ring. Drawn in
   a 100-unit box centred on 0 0; NeonChip scales it to its size. */
export const CHIP_ART = Object.freeze({ r:50, body:48, rim:45, inner:37.5, photo:33, spots:8, spot:[39.5, 43] });

/* ── the house hand ──
   The one hand in the world: a croupier's, reaching in from off screen,
   bent from one bone tube over dark glass, its shirt cuff and sleeve in
   cyan (a neon pointing-hand sign; HOUSE_LOOK "glove" draws the same hand
   as black satin with a lamp's glint). Drawn with the wrist at 0 0 and the
   hand pointing right (+x), the sleeve running off to the left. Poses:
     point  the sign's pointing hand (press, poke, flick through)
     cock   index loaded behind the thumb (a flick about to go)
     flat   palm down, fingers together (sweep, rake, push, buff)
     pinch  thumb and index together at the front (holds a needle, a band)
     grip   a fist round a handle (a rake, a lever)
   `at` is where a pose holds something, in the same units. */
export const HAND_POSES = Object.freeze({
  point:Object.freeze({
    d:`M-4 -40C14 -44 30 -50 48 -52C68 -54 92 -56 108 -52C121 -49 121 -35 108 -33L98 -32L216 -31C233 -31 233 -9 216 -9L118 -9
      C144 -9 150 13 126 15C148 16 150 37 124 38C141 41 139 59 116 59C84 61 40 58 -4 44Z`,
    lines:Object.freeze(["M40 -40C62 -42 84 -40 100 -35", "M118 -9C108 -4 108 8 124 14", "M124 16C112 20 112 32 124 37"]),
    at:Object.freeze({ x:226, y:-20 }) }),
  cock:Object.freeze({
    d:`M-4 -40C20 -46 60 -50 96 -50C124 -54 158 -56 170 -40C180 -26 172 -8 156 -6C150 -5 146 -6 144 -4C162 0 164 18 142 20
      C162 22 162 38 140 40C158 42 154 58 130 58C96 62 44 58 -4 44Z`,
    lines:Object.freeze(["M30 -28C70 -24 110 -18 146 -10", "M158 -30C158 -38 146 -40 142 -33C138 -26 150 -20 156 -26",
      "M142 20C130 24 130 36 140 40"]),
    at:Object.freeze({ x:170, y:-28 }) }),
  flat:Object.freeze({
    d:`M-4 -40C30 -46 70 -46 104 -44L220 -38C240 -37 240 -12 220 -12L136 -10C160 -8 176 0 176 8C176 16 162 18 146 16L104 12
      C80 22 50 46 24 50C12 52 2 50 -4 44Z`,
    lines:Object.freeze(["M116 -26L214 -25", "M104 12C120 10 132 -4 136 -10"]),
    at:Object.freeze({ x:200, y:-8 }) }),
  pinch:Object.freeze({
    d:`M-4 -40C14 -44 30 -50 48 -52C68 -54 92 -56 108 -52C121 -49 121 -35 108 -33L98 -32L200 -31C214 -31 220 -24 218 -16
      C216 -10 210 -8 204 -10L196 -12L132 -12C150 -8 168 -6 196 -6C212 -6 214 10 198 10L130 12C148 14 150 34 126 36
      C142 39 140 57 116 57C84 60 40 57 -4 44Z`,
    lines:Object.freeze(["M40 -40C62 -42 84 -40 100 -35", "M128 -12C116 -10 114 6 130 12"]),
    at:Object.freeze({ x:212, y:-6 }) }),
  grip:Object.freeze({
    d:`M-4 -40C20 -46 60 -50 100 -48C130 -46 150 -40 156 -28C162 -16 150 -6 138 -6C160 -4 162 14 142 16C162 18 162 36 140 38
      C158 40 156 58 132 58C100 62 46 58 -4 44Z`,
    lines:Object.freeze(["M40 -36C70 -40 104 -40 130 -30", "M138 -6C126 -2 126 10 140 15", "M140 17C128 21 128 33 140 37"]),
    at:Object.freeze({ x:120, y:8 }) }),
});
export const HAND_POSE_NAMES = Object.freeze(Object.keys(HAND_POSES));
/* the cuff (a shirt's, under the sleeve) and the sleeve, off to the left */
export const HAND_CUFF = "M-60 -46L-6 -44C2 -44 2 46 -6 46L-60 46Z";
export const HAND_CUFF_EDGE = "M-6 -44C2 -44 2 46 -6 46";
export const HAND_SLEEVE = "M-1400 -42L-58 -42L-58 42L-1400 42Z";
export const HAND_SLEEVE_EDGES = "M-1400 -42L-60 -42M-1400 42L-60 42M-60 -46L-60 46";
/* the drawing's box: the sleeve runs 1400 units back, far enough that a
   hand reaching in from any edge never shows where it ends */
export const HAND_BOX = Object.freeze([-1400, -70, 1650, 140]);
/* the house hand's two looks; the bits and the betting table draw "neon" */
export const HOUSE_LOOKS = Object.freeze(["neon", "glove"]);
export const HOUSE_LOOK = "neon";

/* ── the stage ──
   The desert floor the cast stands on (world y), a solo chip's size (a
   solo medium shot at the camera's 1.8 is a 432 px chip) and the middle. */
export const STAGE = Object.freeze({ floor:930, chip:240, mid:960 });

/* A side in a line (the team bits): up to `max` chips abreast, centred on
   0, feet `step` chips apart (no hands, so they can stand close), smaller
   chips for a bigger side so the full court's seven still fit the TV. A
   side past `max` letters "+N". `half` is how far the line reaches either
   side of its middle. */
export const LINE_SIZES = Object.freeze([240, 220, 200, 184, 168, 152, 140]);
export function teamLine(count, { max = 7, step = 1.12, sizes = LINE_SIZES } = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const shown = Math.min(n, max);
  const size = sizes[Math.max(0, Math.min(sizes.length - 1, shown - 1))] || STAGE.chip;
  const gap = Math.round(size * step);
  return {
    shown, more:Math.max(0, n - shown), size, step:gap,
    xs:Array.from({ length:shown }, (_, i) => Math.round((i - (shown - 1) / 2) * gap) || 0),
    half:shown ? Math.round((shown - 1) / 2 * gap + size / 2) : 0,
  };
}

/* stereo place for a canvas x: the room hears it where it happens */
export const panAt = x => {
  const at = Number.isFinite(Number(x)) ? Number(x) : 960;
  return Math.round(Math.max(-1, Math.min(1, (at - 960) / 960 * 0.9)) * 100) / 100 || 0;
};
