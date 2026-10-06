/* The Lit Flood Rule (DESIGN.md): a peak floods in its winner's color lit,
   never the raw paint. floodPlate keeps the hue, lifts OKLCH lightness and
   chroma to a floor, and reads its ink at 4.5:1 or better, for every chip
   color a guest can claim and the unclaimed gray. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHIP_COLORS, CHIP_GRAY } from "../shared/core.js";
import { CHIP_INKS, FLOOD, contrastRatio, floodColor, floodPlate, oklch } from "../src/features/identity/chipInk.js";

const ALL = [...CHIP_COLORS.map(color => color.hex), CHIP_GRAY];
const hueGap = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };

test("flood: every chip color floods lit, at or above the lightness floor and the chroma floor its own chroma earns", () => {
  assert.ok(ALL.length >= 31, "all the claimable colors and the gray");
  for (const hex of ALL) {
    const plate = floodPlate(hex, CHIP_INKS);
    assert.match(plate.color, /^#[0-9a-f]{6}$/i, hex);
    const [L, C] = oklch(plate.color);
    const [, C0] = oklch(hex);
    assert.ok(L >= FLOOD.light - 0.005, `${hex} floods at L ${L.toFixed(3)}`);
    /* a real color floods saturated; a near-neutral takes a tint of its own hue */
    const floor = C0 >= 0.08 ? 0.1 : FLOOD.neutral - 0.01;
    assert.ok(C >= floor, `${hex} floods at C ${C.toFixed(3)} (floor ${floor})`);
  }
});

test("flood: the hue stays the player's, and a color already lit passes through", () => {
  for (const hex of ALL) {
    const [, C0, h0] = oklch(hex);
    const [, , h1] = oklch(floodColor(hex));
    if (C0 > 0.03) assert.ok(hueGap(h0, h1) < 0.12, `${hex} keeps its hue (${(hueGap(h0, h1) * 57.3).toFixed(1)} deg off)`);
  }
  for (const hex of ["#E39A3B", "#D89C2F", "#D97742"]) assert.equal(floodColor(hex).toLowerCase(), hex.toLowerCase(), `${hex} is already lit`);
});

test("flood: the ink reads at 4.5:1 or better on every flood", () => {
  for (const hex of ALL) {
    const plate = floodPlate(hex, CHIP_INKS);
    assert.ok([CHIP_INKS.dark, CHIP_INKS.bone].includes(plate.ink), hex);
    assert.equal(plate.dark, plate.ink === CHIP_INKS.dark);
    assert.ok(contrastRatio(plate.color, plate.ink) >= 4.5, `${hex} ink ${contrastRatio(plate.color, plate.ink).toFixed(2)}:1`);
  }
});

test("flood: the dull families flood alive (brown, olive, khaki, gray are no longer dull fields)", () => {
  for (const hex of ["#7A5C43", "#8C6A54", "#6F6546", "#77804C", "#4E4A3C", "#9AA1A8", CHIP_GRAY]) {
    const [L0, C0] = oklch(hex), [L, C] = oklch(floodColor(hex));
    /* lit (lighter) or alive (more chroma), and never darker or duller */
    assert.ok(L >= L0 - 0.002 && C >= C0 - 0.002 && (L > L0 + 0.05 || C > C0 + 0.04),
      `${hex} lifts from L ${L0.toFixed(2)} C ${C0.toFixed(3)} to L ${L.toFixed(2)} C ${C.toFixed(3)}`);
  }
  /* anything that is not a hex passes through untouched, on bone */
  assert.deepEqual(floodPlate("var(--muted)", CHIP_INKS), { color:"var(--muted)", ink:CHIP_INKS.bone, dark:false });
});

test("flood: every peak in a winner's color reads the flood, not the raw paint", () => {
  const src = file => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  for (const file of ["features/tv/TVChampion.jsx", "features/tv/TVWalkout.jsx", "features/tv/TVPodium.jsx", "features/tv/TVClassPhoto.jsx",
    "features/moments/PhoneMoments.jsx", "features/results/LastCard.jsx", "features/awards/TVAwards.jsx"])
    assert.match(src(file), /flood(Plate|Color)\(/, `${file} floods through chipInk`);
  /* a name is never the Inline cut */
  for (const file of ["features/tv/TVChampion.jsx", "features/tv/TVWalkout.jsx", "features/tv/TVPodium.jsx", "features/moments/PhoneMoments.jsx"])
    assert.doesNotMatch(src(file), /is-marquee[^"]*(name|teamname)|tv-step-name\$\{first \? " is-marquee"/, `${file} letters names solid`);
});
