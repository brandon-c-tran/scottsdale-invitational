/* The thirteen critters (float/shared/looks.js), each a function of the
   anatomy kit: its silhouette, its markings, its face, and where its hat
   and shades sit. One style for all of them: a big rounded head, glossy
   black eyes with two catch lights, a small pear body, rubber-hose arms,
   stubby legs. A species reads from its silhouette first (ears, horns,
   crest, shell, plume), then its colors. */
import * as THREE from "three";
import { Kit, mix } from "./anatomy.js";
import { blob, blobGeometry, patchGeometry, tube, ball, xf, dirYawPitch, lathe } from "./sculpt.js";
import { V, rng, eyePoint, atDir, spikes, speckles } from "./features.js";
import { jackrabbit, tortoise, gila, hornedlizard, bighorn, quail, armadillo, coyote, otter } from "./roster.js";

/* ── capybara: the boxy, unbothered one ── */
function capybara(k) {
  const C = { fur: "#c98a4f", back: "#b0733f", muzzle: "#e3b483", nose: "#4b3023", paw: "#7a5133", ear: "#9a6439", inner: "#6f4429", blush: "#f19a86", lid: "#c48448", tuft: "#a86a38" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  k.body({ r: [0.205, 0.2, 0.19], n: 2.35, color: C.fur, belly: C.muzzle });
  k.trunks();
  /* a long loaf of a head: flat on top, the snout narrowing and sloping
     down to a wide nose pad at the front */
  const RZ = 0.3;
  const H = k.head({ r: [0.225, 0.2, RZ], n: 3.1, at: [0, 0.6, -0.06], color: C.fur,
    warp: p => {
      const t = Math.max(0, -p.z / RZ);
      p.x *= 1 - 0.2 * t * t;
      if (p.y > 0) p.y *= 1 - 0.26 * t * t; else p.y *= 1 - 0.08 * t;
      if (p.z > 0) p.y *= 1 + 0.05 * (p.z / RZ);
    } });
  const e = eyePoint(H, 0.86, 0.3);
  const mouth = atDir(H, [0, -0.5, -1]);
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, mouth.y, mouth.z], ears: [0.135, 0.775, 0.12] });
  k.patch(H, { dir: [0, -0.3, -1], ax: 0.62, ay: 0.42, lift: 0.004 }, { color: C.muzzle });
  /* the nose pad, wide and dark, with two nostrils on top of it */
  const nd = new THREE.Vector3(0, 0.02, -1).normalize();
  const np = H.at(nd), nn = H.normal(nd);
  k.add(xf(ball([0.085, 0.042, 0.035], { w: 16, h: 10 }), { at: np.clone().addScaledVector(nn, 0.004).toArray(), rot: [-0.25, 0, 0] }), { color: C.nose, bind: "head" });
  for (const s of [-1, 1]) k.add(xf(ball([0.018, 0.011, 0.009], { w: 8, h: 6 }), { at: np.clone().addScaledVector(nn, 0.034).add(new THREE.Vector3(s * 0.034, 0.012, 0)).toArray(), rot: [0, 0, s * 0.4] }), { color: "#1d120d", bind: "head" });
  k.eyes(H, { yaw: 0.86, pitch: 0.3, w: 0.044, h: 0.05, depth: 0.03, lid: C.lid, lidTilt: 0, lidCover: 0.36 });
  k.mouth(H, { dir: [0, -0.5, -1], w: 0.034, curve: 0.01, radius: 0.0065 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.95, -0.05).toArray(), ax: 0.13, ay: 0.085, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "round", at: [0.135, 0.775, 0.12], size: [0.044, 0.046, 0.024], color: C.ear, inner: C.inner, tilt: [0.25, 0.4, 0.5] });
  /* a tuft on top */
  for (const [x, l] of [[-0.022, 0.05], [0.0, 0.065], [0.024, 0.048]]) {
    k.add(tube([[x, 0.78, 0.0], [x * 1.6, 0.78 + l * 0.6, -0.02], [x * 2.2 + 0.01, 0.78 + l, 0.0]], { radius: t => 0.013 * (1 - t) + 0.002, radial: 5, segments: 3, capRings: 1 }), { color: C.tuft, bind: "head" });
  }
  k.arms({ color: C.fur, paw: C.paw });
  k.legs({ color: C.fur, foot: C.paw, sole: "#3d281b" });
  k.socket("hat", [0, 0.79, 0.02], { s: 1.0, tilt: -0.04 });
  k.socket("shades", [0, e.y + 0.005, -0.27], { s: 0.92, w: 1.05 });
  k.socket("chain", [0, 0.31, 0], { spread: 1 });
  k.info.chill = true;
}

/* ── javelina: the collared, bristly one ── */
function javelina(k) {
  const C = { fur: "#655d6c", dark: "#3e3846", collar: "#f1e8d6", belly: "#7c7484", snout: "#6d6474", disc: "#d39ea3", nostril: "#5a2f38", tusk: "#fdf8ec", inner: "#d9a0a7", blush: "#ec9aa0", hoof: "#2d2932" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  const B = k.body({ r: [0.212, 0.205, 0.2], n: 2.2, color: C.fur, belly: C.belly });
  k.trunks();
  /* the collar: a pale band round the shoulders, under the head */
  k.add(blobGeometry(B, { w: k.seg.body[0], h: 3, theta: [0.52, 0.34], lift: 0.007 }), { color: C.collar, bind: "chest" });
  const H = k.head({ r: [0.235, 0.205, 0.245], n: 2.45, at: [0, 0.6, -0.03], color: C.fur,
    warp: p => { if (p.z < 0) { const t = -p.z / 0.245; p.x *= 1 - 0.14 * t; p.y -= 0.03 * t * t; } } });
  const e = eyePoint(H, 0.47, 0.2);
  const S = blob({ r: [0.1, 0.082, 0.1], n: 2.3, at: [0, 0.545, -0.26] });
  const mouth = S.at(new THREE.Vector3(0, -0.7, -0.7).normalize());
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, mouth.y, mouth.z], ears: [0.14, 0.77, 0.04] });
  k.add(blobGeometry(S, { w: k.seg.ball[0] + 4, h: k.seg.ball[1] + 2 }), { color: C.snout, bind: "head" });
  /* the pig disc and its nostrils */
  k.add(xf(lathe([[0, 0.012], [0.05, 0.012], [0.066, 0.006], [0.07, -0.004], [0.06, -0.014], [0, -0.014]], { segments: 18 }), { rot: [Math.PI / 2, 0, 0], at: [0, 0.548, -0.352] }), { color: C.disc, bind: "head" });
  for (const s of [-1, 1]) k.add(xf(ball([0.013, 0.017, 0.008], { w: 8, h: 6 }), { at: [s * 0.024, 0.548, -0.368] }), { color: C.nostril, bind: "head" });
  for (const s of [-1, 1]) k.add(tube([[s * 0.072, 0.515, -0.28], [s * 0.088, 0.55, -0.295], [s * 0.084, 0.58, -0.3]], { radius: t => 0.012 * (1 - t) + 0.002, radial: 5, segments: 3, capRings: 1 }), { color: C.tusk, bind: "head" });
  k.eyes(H, { yaw: 0.47, pitch: 0.2, w: 0.04, h: 0.048, depth: 0.028, lid: C.fur });
  k.mouth(S, { dir: [0, -0.62, -0.78], w: 0.04, curve: 0.01, radius: 0.0062 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.72, -0.06).toArray(), ax: 0.11, ay: 0.075, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "leaf", at: [0.14, 0.765, 0.04], size: [0.042, 0, 0.02], len: 0.115, color: C.fur, inner: C.inner, tilt: [0.15, 0, 0.5] });
  /* the bristly mane from the brow over the head and down the back */
  const mane = [];
  for (let i = 0; i < 7; i++) { const a = 1.25 + i * 0.22; mane.push([[0, Math.sin(a), Math.cos(a)], 0.05 + 0.012 * Math.sin(i), 0.017]); }
  spikes(k, H, mane, { color: C.dark, lean: [0, 0.2, 0.5], flat: 0.55 });
  const back = [];
  for (let i = 0; i < 4; i++) { const a = 0.95 - i * 0.28; back.push([[0, Math.sin(a), Math.cos(a)], 0.045, 0.016]); }
  spikes(k, B, back, { color: C.dark, bind: "chest", lean: [0, 0.4, 0.6], flat: 0.55 });
  k.tail([[0, 0.1, 0.17], [0, 0.12, 0.22], [0, 0.1, 0.25]], { radius: t => 0.022 * (1 - t * 0.5), color: C.dark });
  k.arms({ color: C.fur, paw: C.dark });
  k.legs({ color: C.fur, foot: C.hoof, sole: "#57505c" });
  k.socket("hat", [0, 0.795, 0.02], { s: 0.97, tilt: -0.05 });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.028], { s: 0.88, w: 0.95 });
  k.socket("chain", [0, 0.31, 0], { spread: 1 });
}

/* ── roadrunner: the crested, speckled, fast one ── */
function roadrunner(k) {
  const C = { body: "#ad7f4f", dark: "#5c4231", speck: "#3f2c21", belly: "#f3e7cc", crest: "#3a2f2a", crestTip: "#6f86b8", beak: "#6d6a74", blue: "#3d95ea", orange: "#ff7f3c", leg: "#9a9ea8", blush: "#f2a28f", tail: "#4d3a2c", tip: "#fbf6ea" };
  k.skeleton({ head: [0, 0.43, -0.02], arm: { a: 0.115, b: 0.115, dir: [0.5, -0.86, 0.02] } });
  const B = k.body({ r: [0.19, 0.205, 0.19], n: 2.0, color: C.body, belly: C.belly, bellyPatch: { dir: [0, -0.1, -1], ax: 0.58, ay: 0.72 } });
  k.trunks();
  speckles(k, B, { count: 12, seed: "rr-body", color: C.speck, bind: "chest", back: true, yaw: [-1.6, 1.6], pitch: [-0.2, 0.75], size: [0.06, 0.09] });
  const H = k.head({ r: [0.228, 0.218, 0.226], n: 2.05, at: [0, 0.605, -0.02], color: C.body });
  speckles(k, H, { count: 8, seed: "rr-head", color: C.speck, bind: "head", back: true, yaw: [-1.8, 1.8], pitch: [0.1, 0.9], size: [0.05, 0.075] });
  const e = eyePoint(H, 0.5, 0.15);
  const jaw = [0, 0.548, -0.2];
  k.faceBones({ eyes: [0, e.y, e.z], mouth: jaw, jaw, ears: null, crest: [0, 0.79, -0.02] });
  /* the bare skin behind the eye: blue, then orange */
  for (const s of [-1, 1]) {
    k.patch(H, { dir: dirYawPitch(s * 0.98, 0.17).toArray(), ax: 0.14, ay: 0.085, lift: 0.004 }, { color: C.blue });
    k.patch(H, { dir: dirYawPitch(s * 1.24, 0.15).toArray(), ax: 0.1, ay: 0.07, lift: 0.0042 }, { color: C.orange });
  }
  /* the long beak: upper on the head, lower on the jaw */
  k.add(tube([[0, 0.585, -0.19], [0, 0.578, -0.31], [0, 0.558, -0.42]], { radius: t => 0.052 * (1 - t) ** 0.8 + 0.006, radial: 10, segments: 10, flat: 0.72, side: [1, 0, 0] }), { color: C.beak, bind: "head" });
  k.add(tube([[0, 0.55, -0.19], [0, 0.545, -0.29], [0, 0.546, -0.38]], { radius: t => 0.034 * (1 - t) ** 0.9 + 0.005, radial: 8, segments: 8, flat: 0.6, side: [1, 0, 0] }), { color: mix(C.beak, "#000000", 0.3), bind: "jaw" });
  k.eyes(H, { yaw: 0.5, pitch: 0.15, w: 0.05, h: 0.058, depth: 0.031, lid: C.body });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.66, -0.08).toArray(), ax: 0.1, ay: 0.07, lift: 0.0045 }, { color: C.blush });
  /* the crest: dark feathers swept back, blue at the tips */
  const crest = [[-0.05, 0.14, 0.12], [0.05, 0.14, 0.12], [-0.025, 0.17, 0.155], [0.025, 0.17, 0.155], [0, 0.155, 0.175], [0, 0.11, 0.1]];
  crest.forEach(([x, h, l], i) => {
    const base = new THREE.Vector3(x, 0.78 - Math.abs(x) * 0.4, -0.04 + i * 0.012);
    const tip = base.clone().add(new THREE.Vector3(x * 1.4, h * 0.85, l * 0.75));
    const mid = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.025, -0.02));
    const colorFn = p => new THREE.Color(p.distanceTo(base) > base.distanceTo(tip) * 0.7 ? C.crestTip : C.crest);
    k.add(tube([base, mid, tip], { radius: t => 0.024 * (1 - t) ** 0.8 + 0.002, radial: 6, segments: k.detail === "hero" ? 7 : 4, capRings: 1, flat: 0.5, side: [1, 0, 0] }), { color: colorFn, bind: "crest" });
  });
  k.arms({ color: C.body, wing: { root: 0.056, tip: 0.046, feather: C.dark } });
  k.legs({ bird: { r: 0.02, color: C.leg }, len: 0.15, dir: [0.25, -0.25, -1] });
  /* the long tail, held high over the back rim, pale-tipped */
  const tailPts = [[0, 0.12, 0.15], [0, 0.26, 0.3], [0, 0.48, 0.4], [0, 0.66, 0.44]];
  const base = new THREE.Vector3(...tailPts[0]);
  k.tail(tailPts, { radius: t => 0.03 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + (t > 0.95 ? -0.02 : 0), flat: 0.34, side: [1, 0, 0],
    color: p => new THREE.Color(p.distanceTo(base) > 0.52 ? C.tip : p.distanceTo(base) > 0.46 ? C.speck : C.tail) });
  k.socket("hat", [0, 0.81, 0.0], { s: 0.92, tilt: -0.04, crest: true });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.92, w: 1.0 });
  k.socket("chain", [0, 0.31, 0], { spread: 1 });
}

/* ── frog: the wide-mouthed, bulge-eyed one ── */
function frog(k) {
  const C = { skin: "#58c047", dark: "#3f9a38", belly: "#f3ec97", spot: "#3c8c36", mouth: "#264a22", blush: "#f8a08e", web: "#86d872", hand: "#7ad064" };
  k.skeleton({ head: [0, 0.41, -0.02], shoulder: [0.17, 0.3, -0.01] });
  const B = k.body({ r: [0.215, 0.19, 0.2], n: 2.2, color: C.skin, belly: C.belly, bellyPatch: { dir: [0, -0.15, -1], ax: 0.66, ay: 0.66 } });
  k.trunks();
  speckles(k, B, { count: 6, seed: "frog-back", color: C.spot, bind: "chest", back: true, yaw: [-1.4, 1.4], pitch: [0.0, 0.7], size: [0.07, 0.1] });
  const H = k.head({ r: [0.29, 0.165, 0.25], n: 2.35, at: [0, 0.555, -0.04], color: C.skin,
    warp: p => { if (p.y > 0) p.y *= 0.92; const f = Math.max(0, -p.z / 0.25); p.x *= 1 + 0.04 * f; } });
  /* the eye turrets */
  const bulges = [-1, 1].map(s => blob({ r: [0.088, 0.084, 0.082], n: 2, at: [s * 0.148, 0.675, -0.105] }));
  bulges.forEach(b => k.add(blobGeometry(b, { w: k.seg.ball[0] + 2, h: k.seg.ball[1] + 1 }), { color: C.skin, bind: "head" }));
  const e = bulges[1].at(dirYawPitch(0.22, 0.32));
  const mouth = atDir(H, [0, -0.3, -1]);
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, mouth.y, mouth.z] });
  k.eyes(bulges, { yaw: 0.22, pitch: 0.32, w: 0.058, h: 0.064, depth: 0.034, lid: C.skin });
  /* the throat and the grin */
  k.patch(H, { dir: [0, -0.85, -0.5], ax: 0.62, ay: 0.42, lift: 0.004 }, { color: C.belly });
  k.mouth(H, { dir: [0, -0.3, -1], w: 0.16, curve: 0.024, radius: 0.0085, color: C.mouth, openW: 0.11, openH: 0.075 });
  for (const s of [-1, 1]) k.add(xf(ball([0.011, 0.008, 0.007], { w: 8, h: 6 }), { at: [s * 0.04, 0.6, -0.29] }), { color: C.mouth, bind: "head" });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.62, -0.12).toArray(), ax: 0.13, ay: 0.085, lift: 0.0045 }, { color: C.blush });
  speckles(k, H, { count: 5, seed: "frog-head", color: C.spot, bind: "head", back: true, yaw: [-1.6, 1.6], pitch: [0.25, 0.9], size: [0.06, 0.09] });
  k.arms({ color: C.skin, paw: C.hand, fingers: 3, pawR: 0.05 });
  k.legs({ color: C.skin, foot: C.web, flatFoot: { r: [0.085, 0.022, 0.1] }, len: 0.16 });
  k.socket("hat", [0, 0.7, 0.085], { s: 1.0, tilt: 0.16, frog: true });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 1.04, w: 1.1, onEyes: true });
  k.socket("chain", [0, 0.3, 0], { spread: 1 });
}

export const SPECIES = { capybara, javelina, roadrunner, jackrabbit, tortoise, gila, hornedlizard, bighorn, quail, armadillo, coyote, otter, frog };
export const BUILT_SPECIES = Object.keys(SPECIES);

/* a species' template (cached by the caller) */
export function buildSpecies(id, { detail = "race" } = {}) {
  const make = SPECIES[id] || SPECIES.capybara;
  const k = new Kit({ detail });
  make(k);
  const template = k.build();
  template.id = SPECIES[id] ? id : "capybara";
  return template;
}
