/* Feature helpers the species share: deterministic scatter, points on a
   shape, spikes and bristles, speckles, bands, spiral horns, armored
   shells. Build time only. */
import * as THREE from "three";
import { blob, blobGeometry, patchGeometry, tube, ball, xf, dirYawPitch } from "./sculpt.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* a deterministic scatter, so every screen draws the same spots */
export function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const eyePoint = (shape, yaw, pitch) => shape.at(dirYawPitch(yaw, pitch));
export const atDir = (shape, d) => shape.at(new THREE.Vector3(...d).normalize());
/* a point on a shape lifted along its normal, and that normal */
export function onShape(shape, d, lift = 0) {
  const dv = Array.isArray(d) ? new THREE.Vector3(...d).normalize() : d.clone().normalize();
  const n = shape.normal(dv);
  return { p: shape.at(dv).addScaledVector(n, lift), n };
}

/* spikes or bristles following a shape's normal (manes, frills, crowns) */
export function spikes(k, shape, dirs, { len = 0.05, r = 0.016, color, bind = "head", lean = null, flat = 1, layer = "vinyl" }) {
  const [lr] = k.seg.limb;
  for (const [d, l = len, rr = r] of dirs) {
    const dv = new THREE.Vector3(...d).normalize();
    const p = shape.at(dv), n = shape.normal(dv);
    const out = n.clone();
    if (lean) out.add(new THREE.Vector3(...lean)).normalize();
    k.add(tube([p.clone().addScaledVector(n, -0.01), p.clone().addScaledVector(out, l * 0.55), p.clone().addScaledVector(out, l)],
      { radius: t => rr * (1 - t) ** 0.9 + 0.0015, radial: Math.max(5, lr - 2), segments: k.detail === "hero" ? 5 : 3, capRings: 1, flat, side: [1, 0, 0] }), { color, bind, layer });
  }
}

/* speckles: small patches scattered over a region of a shape */
export function speckles(k, shape, { count = 10, seed = "s", color, bind, yaw = [-Math.PI, Math.PI], pitch = [-0.4, 0.6], size = [0.05, 0.08], back = false, lift = 0.0035 }) {
  const rand = rng(seed);
  const hero = k.detail === "hero";
  for (let i = 0; i < count; i++) {
    let y = yaw[0] + rand() * (yaw[1] - yaw[0]);
    if (back) y = Math.PI + (rand() - 0.5) * (yaw[1] - yaw[0]);
    const p = pitch[0] + rand() * (pitch[1] - pitch[0]);
    const s = size[0] + rand() * (size[1] - size[0]);
    k.add(patchGeometry(shape, { dir: dirYawPitch(y, p).toArray(), ax: s, ay: s * (0.7 + rand() * 0.5), lift, spin: rand() * 3, rings: hero ? 3 : 1, segs: hero ? 16 : 9 }), { color, bind });
  }
}

/* a band round a shape (pole axis y): theta from the top, radians */
export function band(k, shape, from, to, { color, bind, lift = 0.005, phi = [0, Math.PI * 2], h = 3, layer = "vinyl" }) {
  const [w] = k.seg.body;
  return k.add(blobGeometry(shape, { w: Math.max(12, Math.round(w * phi[1] / (Math.PI * 2))), h, theta: [from, to - from], phi, lift }), { color, bind, layer });
}

/* a horn curling in a spiral: base point, the axis it curls round, turns,
   radius from thick to thin */
export function spiralHorn(k, { base, out, up, back, turns = 1.05, r0 = 0.07, r1 = 0.02, grow = 0.13, color, ridge = null, bind = "head" }) {
  const pts = [];
  const n = 20;
  /* from the crown: up, out and back, down, then forward under the ear;
     the curl's plane faces three quarters forward, so the front sees it */
  const side = back.clone().multiplyScalar(0.55).addScaledVector(out, 0.84).normalize();
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2;
    const rr = grow * (1 - 0.45 * t);
    const c = base.clone().addScaledVector(up, -grow * 0.92);
    pts.push(c.addScaledVector(up, Math.cos(a) * rr).addScaledVector(side, Math.sin(a) * rr).addScaledVector(out, t * 0.03));
  }
  const [lr] = k.seg.limb;
  const colorFn = ridge ? (p, nn, c) => {
    let best = 0, bi = 0;
    for (let i = 0; i < pts.length; i++) { const d = -pts[i].distanceToSquared(p); if (i === 0 || d > best) { best = d; bi = i; } }
    return c.set(bi % 2 ? ridge : color);
  } : color;
  k.add(tube(pts, { radius: t => r0 + (r1 - r0) * t ** 0.9, radial: lr + 2, segments: k.detail === "hero" ? 30 : 16, capRings: k.seg.cap + 1 }), { color: colorFn, bind });
}

/* an armored shell over the back: a dome cut from a blob, in bands
   (armadillo) or plates (tortoise) */
export function shell(k, { r, at, color, seam, bands = 0, plates = false, bind, thetaBack = 1.5 }) {
  const dome = blob({ r, n: 2.4, at });
  const [w, h] = k.seg.body;
  /* the back half (pole toward +z): a cap reaching round to the sides */
  k.add(blobGeometry(dome, { w: w + 4, h: h + 2, axis: [0, 0, 1], theta: [0, thetaBack] }), { color: seam, bind });
  if (bands) {
    /* transverse bands from the shoulders down: rings round y, back half only */
    for (let i = 0; i < bands; i++) {
      const t0 = 0.45 + i * (1.95 / bands), t1 = t0 + (1.95 / bands) * 0.78;
      k.add(blobGeometry(dome, { w: w + 2, h: 2, theta: [t0, t1 - t0], phi: [0.12, Math.PI - 0.24], lift: 0.008 }), { color, bind });
    }
  }
  if (plates) {
    /* hexagonal-ish plates: domes on the shell, a ring and a spine */
    const rand = rng("shell");
    const spots = [[Math.PI, 0.55], [Math.PI, 0.1], [Math.PI, -0.35], [Math.PI - 0.62, 0.38], [Math.PI + 0.62, 0.38], [Math.PI - 0.66, -0.12], [Math.PI + 0.66, -0.12],
      [Math.PI - 1.15, 0.12], [Math.PI + 1.15, 0.12]];
    for (const [yaw, pitch] of spots) {
      const sz = 0.3 + rand() * 0.04;
      k.add(patchGeometry(dome, { dir: dirYawPitch(yaw, pitch).toArray(), ax: sz, ay: sz * 0.9, lift: 0.012, rings: k.detail === "hero" ? 4 : 2, segs: 6,
        edge: th => 1 / Math.max(0.86, Math.cos(((th % (Math.PI / 3)) - Math.PI / 6))) }), { color, bind });
    }
  }
  return dome;
}

/* whisker pads: two puffy cheeks under a nose */
export function whiskerPads(k, { at, r = 0.055, spread = 0.045, color, bind = "head" }) {
  const [bw, bh] = k.seg.ball;
  for (const s of [-1, 1]) k.add(ball([r, r * 0.82, r * 0.8], { w: bw, h: bh, at: [at[0] + s * spread, at[1], at[2]] }), { color, bind });
}

export { ball, xf, tube, blob, blobGeometry, patchGeometry, dirYawPitch };
