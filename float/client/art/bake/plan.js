/* The body plan every critter shares (bake time only): one soft plush mass,
   Party Animals proportions. A pear of a body with a big round head melted
   on top (no neck to speak of), short stubby arms and legs melted into it,
   and a skeleton laid through it the way the animation runtime
   (critter.js) expects: the same bone names as the first pass, plus jiggle
   bones for the cheeks and belly and second joints for long ears and tails.

   Critter space: metres, y up, facing -z, the seat at the origin. The
   critter's LEFT arm is at -x ("L" strokes paddle on the -x side). */
import { ellipsoid, roundCone, smooth, alongBones, rgb, lerp3, clamp } from "./sdf.js";

export const V3 = (x, y, z) => [x, y, z];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/* the skeleton: [name, parent, at] in critter space */
export function skeleton({ hipY = 0.08, chestY = 0.24, neckY = 0.36, head = [0, 0.41, -0.02], shoulder = [0.152, 0.322, -0.01],
  arm = { a: 0.115, b: 0.115, dir: [0.62, -0.76, -0.14] }, leg = [0.088, 0.075, -0.07], tail = [0, 0.09, 0.17], tail2 = null, tail3 = null,
  ears = null, ear2 = null, crest = null, jaw = null, eyes, mouth, cheeks = null, belly = [0, 0.17, -0.12] } = {}) {
  const bones = [];
  const bone = (name, parent, at) => bones.push({ name, parent, at: at.map(v => +v.toFixed(5)) });
  bone("root", null, [0, 0, 0]);
  bone("hips", "root", [0, hipY, 0]);
  bone("chest", "hips", [0, chestY, 0]);
  bone("neck", "chest", [0, neckY, 0]);
  bone("head", "neck", head);
  const info = { hipY };
  for (const side of [-1, 1]) {
    const s = side < 0 ? "L" : "R";
    const dir = norm([arm.dir[0] * side, arm.dir[1], arm.dir[2]]);
    const sh = [shoulder[0] * side, shoulder[1], shoulder[2]];
    bone(`shoulder${s}`, "chest", sh);
    bone(`elbow${s}`, `shoulder${s}`, add(sh, dir, arm.a));
    bone(`hand${s}`, `elbow${s}`, add(sh, dir, arm.a + arm.b));
    bone(`leg${s}`, "hips", [leg[0] * side, leg[1], leg[2]]);
    /* the bind pose's elbow bulge: back and out */
    const hint = [side * 0.3, 0.15, 1];
    const d = hint[0] * dir[0] + hint[1] * dir[1] + hint[2] * dir[2];
    const pole = norm([hint[0] - dir[0] * d, hint[1] - dir[1] * d, hint[2] - dir[2] * d]);
    info[`arm${s}`] = { dir, pole, a: arm.a, b: arm.b, shoulder: sh };
  }
  bone("tail", "hips", tail);
  bone("tail2", "tail", tail2 || [tail[0], tail[1] + 0.06, tail[2] + 0.12]);
  bone("tail3", "tail2", tail3 || add(tail2 || [tail[0], tail[1] + 0.06, tail[2] + 0.12], [0, 0.06, 0.12]));
  bone("belly", "hips", belly);
  /* face and feature bones on the head */
  bone("eyes", "head", eyes);
  bone("happy", "head", eyes);
  bone("lids", "head", eyes);
  bone("mSmile", "head", mouth);
  bone("mOpen", "head", mouth);
  bone("mFrown", "head", mouth);
  bone("jaw", "head", jaw || mouth);
  const e = ears || [Math.abs(eyes[0]) + 0.1, eyes[1] + 0.1, eyes[2] + 0.15];
  bone("earL", "head", [-e[0], e[1], e[2]]);
  bone("earR", "head", e);
  const e2 = ear2 || [e[0] + 0.02, e[1] + 0.06, e[2] + 0.02];
  bone("earL2", "earL", [-e2[0], e2[1], e2[2]]);
  bone("earR2", "earR", e2);
  bone("crest", "head", crest || [0, e[1], e[2]]);
  const c = cheeks || [0.15, eyes[1] - 0.09, eyes[2] + 0.04];
  bone("cheekL", "head", [-c[0], c[1], c[2]]);
  bone("cheekR", "head", c);
  return { bones, info };
}

/* the spine's weights for the core mass, by height: hips low, chest up to the
   shoulders, the head above the chin */
export const spine = ({ chestLo = 0.1, chestHi = 0.26 } = {}) => (x, y) => {
  const c = smooth(chestLo, chestHi, y);
  return [["hips", 1 - c], ["chest", c]];
};

/* arms: stubby, thick at the shoulder, melted into the body, ending in a
   round mitten paw */
export function arms(s, rig, { r0 = 0.06, r1 = 0.05, paw = 0.055, k = 0.012, color, pawColor = null, pawSize = 0.05, fur = 1, inset = 0.03, pawShape = null } = {}) {
  for (const S of ["L", "R"]) {
    const info = rig.info[`arm${S}`];
    const sh = info.shoulder, dir = info.dir, L = info.a + info.b;
    const a = add(sh, dir, -inset), b = add(sh, dir, L - paw * 0.25);
    const bones = alongBones(sh, add(sh, dir, L), [[`shoulder${S}`, 0.08], [`elbow${S}`, 0.5], [`hand${S}`, 0.95]], 0.36);
    s.part(`arm${S}`, roundCone(a, b, r0, r1), { k, bone: bones, color, fur, movable: true, group: "arm" });
    const pc = add(sh, dir, L);
    const pawPart = pawShape ? pawShape(pc, dir, S) : ellipsoid(pc, [paw, paw * 0.92, paw]);
    s.part(`paw${S}`, pawPart, { k: 0.01, bone: `hand${S}`, color: pawColor || color, fur, movable: true, group: "paw" });
  }
}

/* legs: stubby, out front over the floatie's rim, round feet */
export function legs(s, rig, { len = 0.13, r = 0.06, dir = [0.2, -0.12, -1], foot = [0.064, 0.052, 0.078], k = 0.014, color, footColor = null, fur = 1, footShape = null } = {}) {
  for (const S of ["L", "R"]) {
    const side = S === "L" ? -1 : 1;
    const base = rig.bones.find(b => b.name === `leg${S}`).at;
    const d = norm([dir[0] * side, dir[1], dir[2]]);
    const end = add(base, d, len);
    s.part(`leg${S}`, roundCone(add(base, d, -0.02), end, r, r * 0.9), { k, bone: `leg${S}`, color, fur, movable: true, group: "leg" });
    const fc = add(end, d, foot[2] * 0.35);
    const shape = footShape ? footShape(fc, d, S) : ellipsoid([fc[0], fc[1] + foot[1] * 0.2, fc[2]], foot, [-0.5, 0, 0]);
    s.part(`foot${S}`, shape, { k: 0.01, bone: `leg${S}`, color: footColor || color, fur, movable: true, group: "foot" });
  }
}

/* the swim trunks in the rider's color: everything below the waist, a pale
   waistband over it, the legs' tops. Applied as a paint layer */
export function trunks(s, { waist = 0.135, band = "#fbf7ee", legTop = 0.06, legSpan = 0.065 } = {}) {
  const bandC = rgb(band);
  s.paint((p, n, own, m, group) => {
    const core = group("core");
    const leg = group("leg");
    const y = p[1];
    /* the waist dips a little at the front and sits higher at the back */
    const w = waist - 0.012 * Math.max(0, -p[2] / 0.2) + 0.01 * Math.max(0, p[2] / 0.2);
    const below = 1 - smooth(w - 0.004, w + 0.004, y);
    /* the trunks' legs: the top of each leg near the body */
    let onLeg = 0;
    if (leg > 0.05) {
      const reach = Math.hypot(p[0], p[2] + 0.02);
      onLeg = leg * (1 - smooth(legSpan + 0.12, legSpan + 0.13, reach + Math.max(0, -p[2] - 0.08) * 1.5));
    }
    const t = clamp(below * core + onLeg, 0, 1);
    if (t > 0) { m.tint = Math.max(m.tint, t); m.fur *= 1 - t; m.fuzz = m.fuzz * (1 - t) + 0.65 * t; m.rough = m.rough * (1 - t) + 0.85 * t; }
    const bandT = core * (smooth(w - 0.004, w, y) - smooth(w + 0.013, w + 0.017, y));
    if (bandT > 0) { m.color = lerp3(m.color, bandC, bandT); m.tint *= 1 - bandT; m.fur *= 1 - bandT; m.fuzz = m.fuzz * (1 - bandT) + 0.6 * bandT; }
  });
}

/* a soft colored patch around a point (muzzles, bellies, blush, ear insides):
   r the radii of an ellipsoidal falloff, edge its softness (0..1) */
export function patch(s, center, r, color, { edge = 0.35, only = null, fur = null, fuzz = null, rough = null, strength = 1 } = {}) {
  const c = typeof color === "function" ? color : rgb(color);
  s.paint((p, n, own, m, group) => {
    const dx = (p[0] - center[0]) / r[0], dy = (p[1] - center[1]) / r[1], dz = (p[2] - center[2]) / r[2];
    const q = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let t = (1 - smooth(1 - edge, 1, q)) * strength;
    if (only) t *= only(p, n, own, group);
    if (t <= 0) return;
    const col = typeof c === "function" ? c(p, n) : c;
    m.color = lerp3(m.color, col, t);
    if (fur != null) m.fur = m.fur + (fur - m.fur) * t;
    if (fuzz != null) m.fuzz = m.fuzz + (fuzz - m.fuzz) * t;
    if (rough != null) m.rough = m.rough + (rough - m.rough) * t;
  });
}

/* a gentle top-to-bottom shade on a color (darker back, lighter belly) */
export function shade(top, bottom, y0, y1) {
  const a = rgb(top), b = rgb(bottom);
  return (x, y) => lerp3(b, a, smooth(y0, y1, y));
}

export { norm, add };

/* where the mass built so far ends along a ray from inside it (to seat ears,
   horns and turrets on it): { p, n } */
export function seat(s, from, dir, skip = null) {
  const p = s.raycast(from, dir, { skip });
  if (!p) throw new Error(`plan: nothing to seat on from ${from} along ${dir}`);
  return { p, n: s.normal(p[0], p[1], p[2]) };
}
/* a point out from a seat (a negative distance sinks it into the mass) */
export const outFrom = (st, d) => [st.p[0] + st.n[0] * d, st.p[1] + st.n[1] * d, st.p[2] + st.n[2] * d];

/* scale a region of a sculpt (a head and everything on it) about a pivot:
   p(point), r(radii), s(length), plane([nx, ny, nz, d]) */
export function grower(K, pivot) {
  const p = q => [pivot[0] + (q[0] - pivot[0]) * K, pivot[1] + (q[1] - pivot[1]) * K, pivot[2] + (q[2] - pivot[2]) * K];
  return {
    K, p,
    r: r => r.map(v => v * K),
    s: v => v * K,
    plane: ([nx, ny, nz, d]) => { const dp = nx * pivot[0] + ny * pivot[1] + nz * pivot[2]; return [nx, ny, nz, dp + K * (d - dp)]; },
  };
}

/* a patch centred where a ray from inside meets the surface (so a nose or a
   blush lands on the face however the head was trimmed): sink moves the
   centre in along the normal */
export function patchOn(s, from, dir, r, color, opts = {}) {
  const st = seat(s, from, dir, opts.skip || null);
  const c = outFrom(st, -(opts.sink ?? 0.004));
  patch(s, c, r, color, opts);
  return st;
}
