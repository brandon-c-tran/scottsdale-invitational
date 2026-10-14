/* The chip layer's pure rules (Oct 13, "chips you can feel"): where each
   bettor's stack stands inside its side's chip area, how many real chips
   it is, and when the dealer's glove reaches it. No three, no physics
   engine, no DOM: the TV, the phone and the tests all read the same
   numbers, so every screen scatters the same stacks to the same places.

   Geometry is in the host's own CSS px. A stack's place is its BASE: the
   centre of its bottom chip's bottom face as the room sees it. The camera
   looks down at the felt at CHIP3D.elevationDeg, so a chip's face is an
   ellipse r * sin(el) tall and each chip rises thick * r * cos(el). */
import { STACK_CAP, STACK_TOWER, stackChipCount, towerTiers } from "../wagers/betStacks.js";

export const CHIP3D = Object.freeze({
  /* a chip's thickness in radii (a real one is 3.3 mm on a 19.5 mm radius;
     a little thicker reads better from the couch) */
  thick:0.2,
  /* the camera: STACK_TILT's look (a face 0.6 as tall as it is wide) and a
     long lens, so the felt reads flat with a gentle perspective */
  elevationDeg:38,
  fovDeg:16,
  /* slow-motion gravity in radii per s²: a toss reads, it does not snap */
  gravity:60,
  /* real bodies on screen at once, merged into static stacks at rest */
  budget:Object.freeze({ tv:300, phone:120 }),
  /* between a stake's stack and the payout stacked beside it, in radii */
  pairGap:0.18,
  /* px kept clear between two stacks' footprints */
  pad:8,
  /* the tallest stack any area plans for: the cap plus its tower */
  tallest:STACK_CAP + STACK_TOWER,
});
const EL = CHIP3D.elevationDeg * Math.PI / 180;
const HALF_FOV = CHIP3D.fovDeg * Math.PI / 360;

/* the camera looks down at the host's centre at elevationDeg; a point
   higher on the host is seen lower (its stack stands taller, its face
   flatter), one lower steeper. `height` is the host's, px. */
export function elevationAt(y, height = 0) {
  if (!(height > 0)) return EL;
  return EL - Math.atan((1 - 2 * y / height) * Math.tan(HALF_FOV));
}

/* the chips a stake stands as: one per 100 to the cap, then the tower's
   one or two (1,000, 1,200 and 2,500 stand three different heights) */
export const stackBodies = stake => {
  const chips = stackChipCount(stake);
  return Math.min(chips, STACK_CAP) + towerTiers(chips);
};

/* FNV-1a, and a small seeded stream (mulberry32) */
export function hash32(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* a stack's screen extent around its base, px: up to its top face's far
   edge, down to its bottom face's near edge */
export function stackExtent(r, bodies, el = EL) {
  const half = r * Math.sin(el);
  return { up:Math.max(1, bodies) * CHIP3D.thick * r * Math.cos(el) + half, down:half };
}

/* each chip's own small offset and turn in its stack, in radii: a stack a
   hand built, never a machined column; the same on every screen */
export function chipJitter(seed, player, j) {
  const next = rng(hash32(`${seed}|${player}|${j}`));
  return { dx:(next() - 0.5) * 0.1, dz:(next() - 0.5) * 0.1, yaw:next() * Math.PI * 2 };
}

/* One spot's stacks, scattered inside its chip area.
   area   { x, y, w, h } host px
   keepouts [{ left, right, top, bottom }] host px the stacks stay clear of
          (the spot's faces, name and %: chips never cover what reads)
   stacks [{ player, stake, pay? }] biggest first (orderStacks); pay is the
          payout's chips when known (else a pair plans for 1:1)
   r      the chip radius wanted, px; it shrinks to rMin before any stack folds
   seed   contest + spot, so every screen agrees
   label  { w(item), h } the name plate under a stack, or null
   pair   keep room beside each stack for its payout
   height the host's height, px, for the camera's angle across it
   prev   Map player -> { x, y, pairDir } where stacks already stand: kept
          when they still fit, so a new bettor never moves anyone else
   Returns { r, items:[{ player, stake, bodies, x, y, pairDir, yaw, group?,
   players?, count? }], folded } with x, y the base in host px. Past the
   room, the smallest stacks fold into one "+N" group (group:true). */
export function scatterStacks({ area, keepouts = [], stacks = [], r = 24, rMin = 12, seed = "", label = null, pair = false, prev = null,
  height = 0 } = {}) {
  const list = (stacks || []).filter(item => item && item.stake > 0)
    .map(item => ({ ...item, bodies:stackBodies(item.stake) }));
  const fixed = (keepouts || []).filter(box => box && box.right > box.left && box.bottom > box.top);
  if (!area || !(area.w > 0) || !(area.h > 0) || !list.length) return { r, items:[], folded:0 };
  const radii = [];
  for (let rr = r; rr > rMin; rr *= 0.9) radii.push(rr);
  radii.push(Math.min(r, rMin));
  for (const rr of radii) {
    const placed = place(list, rr, { area, fixed, seed, label, pair, prev, height });
    if (placed) return { r:rr, items:placed, folded:0 };
  }
  /* too many for the room at the smallest chip: the tail folds into one "+N" */
  const rr = radii.at(-1);
  for (let shown = list.length - 1; shown >= 1; shown--) {
    const rest = list.slice(shown - 1);
    const stake = rest.reduce((sum, item) => sum + item.stake, 0);
    const group = { player:`+${rest.length}`, group:true, players:rest.map(item => item.player), count:rest.length,
      stake, bodies:stackBodies(stake) };
    const placed = place([...list.slice(0, shown - 1), group], rr, { area, fixed, seed, label, pair, prev, height });
    if (placed) return { r:rr, items:placed, folded:rest.length };
  }
  /* not even one stack fits: the biggest stands centred, whatever it touches */
  const only = list[0];
  return { r:rr, items:[{ ...only, x:area.x + area.w / 2, y:area.y + area.h - stackExtent(rr, only.bodies).down - (label ? label.h : 0),
    pairDir:1, yaw:0 }], folded:list.length - 1 };
}

/* the chips a stack plans its height for: its own, or its payout's beside it */
export const plannedBodies = (item, pair = false) => Math.max(1, item.bodies || 0,
  pair ? (item.pay ?? item.bodies ?? 0) : 0);
/* a stack's footprint (its pair beside it, its plate under it), px */
export function footprint(item, x, y, r, { label = null, pair = false, height = 0 } = {}) {
  const ext = stackExtent(r, plannedBodies(item, pair), elevationAt(y, height));
  const pw = pair ? r * (2 + CHIP3D.pairGap) : 0;
  let left = x - r - (item.pairDir < 0 ? pw : 0), right = x + r + (item.pairDir > 0 ? pw : 0);
  let bottom = y + ext.down;
  if (label) {
    const w = typeof label.w === "function" ? label.w(item) : Number(label.w) || 0;
    left = Math.min(left, x - w / 2); right = Math.max(right, x + w / 2);
    bottom += label.h;
  }
  return { left, right, top:y - ext.up, bottom };
}
const overlaps = (a, b, pad) => a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;
const inside = (box, area) => box.left >= area.x - 0.5 && box.right <= area.x + area.w + 0.5
  && box.top >= area.y - 0.5 && box.bottom <= area.y + area.h + 0.5;

function place(list, r, { area, fixed = [], seed, label, pair, prev, height }) {
  const pad = CHIP3D.pad;
  const out = [];
  const boxes = [...fixed];
  /* the ones already standing keep their places first, then the rest in an
     order of their own (tallest first, then by the seed) */
  const kept = prev ? list.filter(item => prev.has(item.player)) : [];
  const rest = list.filter(item => !kept.includes(item))
    .sort((a, b) => b.bodies - a.bodies || hash32(`${seed}|${a.player}`) - hash32(`${seed}|${b.player}`));
  for (const item of [...kept, ...rest]) {
    const next = rng(hash32(`${seed}|${item.player}|place`));
    const yaw = next() * Math.PI * 2;
    const wantDir = next() < 0.5 ? -1 : 1;
    const was = prev?.get(item.player);
    let best = null;
    if (was) {
      const it = { ...item, pairDir:was.pairDir || wantDir };
      const box = footprint(it, was.x, was.y, r, { label, pair, height });
      if (inside(box, area) && !boxes.some(b => overlaps(b, box, pad))) best = { x:was.x, y:was.y, pairDir:it.pairDir, box };
    }
    if (!best) {
      for (const pairDir of pair ? [wantDir, -wantDir] : [wantDir]) {
        const it = { ...item, pairDir };
        /* the range the base can stand in and keep the footprint inside */
        const probe = footprint(it, 0, 0, r, { label, pair, height });
        const x0 = area.x - probe.left, x1 = area.x + area.w - probe.right;
        const y0 = area.y - probe.top, y1 = area.y + area.h - probe.bottom;
        if (x1 < x0 - 0.5 || y1 < y0 - 0.5) continue;
        const pick = rng(hash32(`${seed}|${item.player}|${pairDir}`));
        /* anywhere across, nearer the felt's front than its back */
        const at = () => ({ x:x0 + pick() * Math.max(0, x1 - x0), y:y0 + (1 - (1 - pick()) ** 2) * Math.max(0, y1 - y0) });
        const want = at();
        let found = null, foundD = Infinity;
        for (let k = 0; k < 160; k++) {
          const c = k === 0 ? want : at();
          const box = footprint(it, c.x, c.y, r, { label, pair, height });
          if (!inside(box, area) || boxes.some(b => overlaps(b, box, pad))) continue;
          const d = (c.x - want.x) ** 2 + (c.y - want.y) ** 2;
          if (d < foundD) { found = { ...c, pairDir, box }; foundD = d; }
          if (k === 0) break;
        }
        if (found) { best = found; break; }
      }
    }
    if (!best) return null;
    boxes.push(best.box);
    out.push({ ...item, x:Math.round(best.x * 10) / 10, y:Math.round(best.y * 10) / 10, pairDir:best.pairDir, yaw });
  }
  return out;
}

/* Past the budget, every stack stands at most `cap` real chips (the
   tallest give first; a stack never drops under one). `counts` is every
   stack's chips (a payout counts as its own stack). */
export function bodyCap(counts = [], budget = CHIP3D.budget.tv) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total <= budget) return Infinity;
  let lo = 1, hi = Math.max(1, ...counts);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (counts.reduce((sum, n) => sum + Math.min(n, mid), 0) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/* a new bet's chips leave the room's edge one after another: each one's
   delay and flight, ms */
export function tossSchedule(n, seed = "") {
  const next = rng(hash32(`${seed}|toss`));
  return Array.from({ length:Math.max(0, n) }, (_, i) => ({ delay:Math.round(i * 90 + next() * 30), flight:Math.round(560 + next() * 140) }));
}

/* when a sweep (the dealer's glove: { at, ms, x0, x1 }, host px on the
   host's clock) passes x */
export function sweepHit(x, sweep) {
  if (!sweep) return 0;
  const span = (Number(sweep.x1) || 0) - (Number(sweep.x0) || 0);
  const k = span ? Math.max(0, Math.min(1, (x - sweep.x0) / span)) : 0;
  return (Number(sweep.at) || 0) + k * (Number(sweep.ms) || 0);
}

/* A stack's payout as chips: what it was paid, on the same rule */
export const payBodies = paid => stackBodies(paid);

/* The gate's mode (ChipPhysicsLayer): a TV always wants the layer (it has
   no switch), a phone only with its switch on; either needs WebGL, a table
   with chips and no failure this session, and draws it once the chunk is in. */
export function chipPhysicsMode({ tv = false, enabled = true, want = true, supported = false, loaded = false, failed = null } = {}) {
  if (!want || !supported || failed || (!tv && !enabled)) return { load:false, on:false };
  return { load:true, on:!!loaded };
}
