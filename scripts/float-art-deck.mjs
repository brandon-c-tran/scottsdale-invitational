/* Float Groove art, the photo on the kayak (float/GROOVE.md v4 polish): on
   a kayak the paddle and the deck cover most of the tee, so the photo tee's
   print read as a sliver. The photo now also rides the kayak's side, the
   one thing every pose shows whole: for every pose of the tee set (and
   the portrait), the biggest window inside the hull's mask near the middle
   of its front: an ellipse ASPECT times as wide as tall, turned with the
   hull, written as anchor.deck, deckR (its half height, box px) and
   deckTilt (degrees). The painter prints the photo's middle there in an
   inked white rim.

     node scripts/float-art-deck.mjs [ids...] [--dry] */
import fs from "node:fs";
import path from "node:path";
import { OUT, loadRGBA, editManifest } from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const only = args.filter(a => !a.startsWith("--"));
/* the decal's radius: the hull's inscribed circle less a margin, within these (box px, scaled for a portrait) */
export const DECK_R = { min:14, max:34, margin:2 };

/* chamfer distance (3-4) to the nearest pixel outside the mask, in px */
function distance(mask, W, H) {
  const INF = 1e9, d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = mask[k] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!d[k]) continue;
    d[k] = Math.min(d[k], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x;
    if (!d[k]) continue;
    d[k] = Math.min(d[k], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
  }
  for (let k = 0; k < W * H; k++) d[k] /= 3;
  return d;
}

/* the hull's biggest window near [cx, water]: an ellipse rx = ASPECT x ry, turned by up to 14 degrees with the hull,
   every sampled point of it inside the mask: { at, ry, rx, tilt } in the image's px (k: image px per box px) */
export const ASPECT = 1.7;
export async function deckOf(tubeFile, water, k = 1) {
  const img = await loadRGBA(path.join(OUT, tubeFile));
  const { width:W, height:H, data } = img;
  const solid = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] > 110; };
  const d = (() => { const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = data[i * 4 + 3] > 110 ? 1 : 0; return distance(m, W, H); })();
  const [wx, wy] = water;
  const fits = (cx, cy, ry, t) => {
    const rx = ry * ASPECT, c = Math.cos(t), s = Math.sin(t);
    for (const f of [1, 0.6]) for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, ex = Math.cos(a) * rx * f, ey = Math.sin(a) * ry * f;
      if (!solid(cx + ex * c - ey * s, cy + ex * s + ey * c)) return false;
    }
    return solid(cx, cy);
  };
  let best = null;
  for (let y = Math.round(wy - 100 * k); y <= Math.round(wy - 8 * k); y += Math.max(1, Math.round(2 * k))) for (let x = Math.round(wx - 70 * k); x <= Math.round(wx + 70 * k); x += Math.max(1, Math.round(2 * k))) {
    const r0 = d[y * W + x];
    if (!r0 || (best && r0 * 1.1 < best.ry * 0.6)) continue;
    for (let t = -14; t <= 14; t += 4) {
      const tr = t * Math.PI / 180;
      let lo = best ? best.ry : 4 * k, hi = 60 * k;
      if (!fits(x, y, lo, tr)) continue;
      while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(x, y, mid, tr)) lo = mid; else hi = mid; }
      const score = lo - Math.abs(x - wx) * 0.02;
      if (!best || score > best.score) best = { score, at:[x, y], ry:lo, tilt:t };
    }
  }
  return best ? { at:best.at, r:best.ry, tilt:best.tilt } : null;
}

/* how much of the chest print the shirt shows (the paddle, paws and deck cover the rest) */
async function chestShown(shirtFile, at, r) {
  if (!shirtFile || !at || !r) return 0;
  const img = await loadRGBA(path.join(OUT, shirtFile));
  let n = 0, inside = 0;
  for (let y = Math.floor(at[1] - r); y <= at[1] + r; y++) for (let x = Math.floor(at[0] - r); x <= at[0] + r; x++) {
    if ((x - at[0]) ** 2 + (y - at[1]) ** 2 > r * r) continue;
    n++;
    if (x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 120) inside++;
  }
  return n ? inside / n : 0;
}

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
const out = {};
for (const [id, c] of Object.entries(manifest.critters)) {
  if (only.length && !only.includes(id)) continue;
  if (!c.tee?.poses) continue;
  out[id] = { poses:{} };
  const radii = [];
  for (const [pose, art] of Object.entries(c.tee.poses)) {
    const water = art.anchor?.water || c.anchor.water;
    const deck = await deckOf(art.tube, water);
    if (!deck) { console.log(`${id} ${pose}: no deck`); continue; }
    const r = Math.max(DECK_R.min, Math.min(DECK_R.max, Math.round(deck.r - DECK_R.margin)));
    const shown = await chestShown(art.shirt, art.anchor?.chest, art.chestR);
    out[id].poses[pose] = { deck:deck.at, deckR:r, deckTilt:deck.tilt, chestShown:Math.round(shown * 100) / 100 };
    radii.push(`${pose} ${r}/${Math.round(shown * 100)}%`);
  }
  /* one size a critter (a decal that grows and shrinks from pose to pose reads as a jitter): the poses' middle, kept to the hull by the mask */
  const rs = Object.values(out[id].poses).map(v => v.deckR).sort((a, b) => a - b);
  const one = rs[rs.length >> 1];
  /* ... but never past what a pose's hull holds (a slumped out sits low) */
  for (const v of Object.values(out[id].poses)) v.deckR = Math.min(one, v.deckR + 1);
  if (c.portrait?.tube) {
    const k = (c.portrait.w || 1024) / 512 * 1.25;
    const deck = await deckOf(c.portrait.tube, c.portrait.anchor.water, k);
    if (deck) out[id].portrait = { deck:deck.at, deckTilt:deck.tilt, deckR:Math.max(DECK_R.min * k, Math.min(DECK_R.max * k, Math.round(deck.r - DECK_R.margin * k))) };
  }
  console.log(`${id.padEnd(13)} ${radii.join(", ")}${out[id].portrait ? ` | portrait ${Math.round(out[id].portrait.deckR)}` : ""}`);
}
if (!DRY) {
  editManifest(m => {
    for (const [id, o] of Object.entries(out)) {
      const c = m.critters[id];
      for (const [pose, v] of Object.entries(o.poses)) { const p = c.tee.poses[pose]; p.anchor = { ...p.anchor, deck:v.deck }; p.deckR = v.deckR; p.deckTilt = v.deckTilt; p.chestShown = v.chestShown; }
      if (o.portrait) { c.portrait.anchor = { ...c.portrait.anchor, deck:o.portrait.deck }; c.portrait.deckR = Math.round(o.portrait.deckR); c.portrait.deckTilt = o.portrait.deckTilt; }
    }
  });
  console.log("manifest written");
}
