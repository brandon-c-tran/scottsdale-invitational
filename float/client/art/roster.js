/* The rest of the thirteen (the core four are in species.js). Each reads
   from its silhouette first: the jackrabbit's ears, the tortoise's shell,
   the gila's bands, the horned lizard's crown, the bighorn's curls, the
   quail's plume, the armadillo's armor, the coyote's ears and brush, the
   otter's whisker pads. */
import * as THREE from "three";
import { roundBox } from "./sculpt.js";
import { V, eyePoint, atDir, onShape, spikes, speckles, band, spiralHorn, shell, whiskerPads, ball, xf, tube, blob, blobGeometry, dirYawPitch } from "./features.js";

/* ── jackrabbit: the ears ── */
export function jackrabbit(k) {
  const C = { fur: "#cba57b", belly: "#f7efe1", muzzle: "#fcf7ee", tip: "#2a221e", inner: "#f4a9aa", nose: "#ec8392", teeth: "#ffffff", blush: "#f4a49a", paw: "#efe4cf" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  k.body({ r: [0.2, 0.205, 0.185], n: 2.1, color: C.fur, belly: C.belly });
  k.trunks();
  const H = k.head({ r: [0.222, 0.212, 0.212], n: 2.12, at: [0, 0.61, -0.02], color: C.fur,
    warp: p => { if (p.y < 0) p.x *= 1 + 0.1 * (-p.y / 0.212); } });
  const e = eyePoint(H, 0.53, 0.15);
  const mouth = [0, 0.492, -0.196];
  k.faceBones({ eyes: [0, e.y, e.z], mouth, ears: [0.082, 0.8, 0.035] });
  whiskerPads(k, { at: [0, 0.538, -0.188], r: 0.052, spread: 0.041, color: C.muzzle });
  k.add(xf(ball([0.032, 0.024, 0.022], { w: 12, h: 8 }), { at: [0, 0.583, -0.222] }), { color: C.nose, bind: "head" });
  for (const s of [-1, 1]) k.add(xf(roundBox([0.02, 0.03, 0.012], { n: 4, w: 8, h: 6 }), { at: [s * 0.0115, 0.497, -0.208] }), { color: C.teeth, bind: "head" });
  k.eyes(H, { yaw: 0.53, pitch: 0.15, w: 0.053, h: 0.062, depth: 0.033, lid: C.fur });
  k.mouth(H, { dir: [0, -0.56, -0.83], w: 0.026, curve: 0.008, radius: 0.0055, openW: 0.03, openH: 0.035 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.74, -0.08).toArray(), ax: 0.12, ay: 0.08, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "long", at: [0.082, 0.79, 0.035], size: [0.064, 0, 0.026], len: 0.37, color: C.fur, inner: C.inner, tip: C.tip, tilt: [0.18, 0, 0.2] });
  k.arms({ color: C.fur, paw: C.paw });
  k.legs({ color: C.fur, foot: C.paw, footR: [0.056, 0.046, 0.1], sole: "#e3b8a8" });
  k.add(ball([0.074, 0.07, 0.066], { w: k.seg.ball[0], h: k.seg.ball[1], at: [0, 0.14, 0.2] }), { color: C.belly, bind: "tail" });
  k.socket("hat", [0, 0.815, 0.005], { s: 0.97, tilt: -0.04, ears: true });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.93, w: 1.0 });
}

/* ── tortoise: the shell ── */
export function tortoise(k) {
  const C = { skin: "#a3a05e", spot: "#868444", shell: "#c88c45", seam: "#6c4724", plate: "#dca257", belly: "#ead58f", nail: "#f2ead2", blush: "#eba07e", beak: "#6f6a38" };
  k.skeleton({ head: [0, 0.44, -0.05] });
  k.body({ r: [0.2, 0.2, 0.18], n: 2.2, color: C.skin, belly: C.belly, bellyPatch: { dir: [0, -0.05, -1], ax: 0.72, ay: 0.78 } });
  k.trunks();
  const dome = shell(k, { r: [0.262, 0.256, 0.232], at: [0, 0.215, 0.03], color: C.plate, seam: C.seam, plates: true, bind: "chest", thetaBack: 1.86 });
  /* the rim: a rounded lip along the shell's front edge, round the shoulders */
  k.add(blobGeometry(dome, { w: k.seg.body[0] + 6, h: 2, axis: [0, 0, 1], theta: [1.8, 0.1], lift: 0.012 }), { color: C.shell, bind: "chest" });
  const H = k.head({ r: [0.212, 0.192, 0.204], n: 2.2, at: [0, 0.595, -0.075], color: C.skin });
  speckles(k, H, { count: 7, seed: "tort-head", color: C.spot, bind: "head", back: true, yaw: [-1.8, 1.8], pitch: [0.2, 0.95], size: [0.05, 0.08] });
  const e = eyePoint(H, 0.48, 0.17);
  const m = atDir(H, [0, -0.36, -1]);
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, m.y, m.z] });
  /* the beak: a hooked upper lip */
  const bk = onShape(H, [0, -0.2, -1], 0.004);
  k.add(xf(ball([0.05, 0.026, 0.026], { w: 12, h: 8 }), { at: bk.p.toArray(), rot: [0.3, 0, 0] }), { color: C.beak, bind: "head" });
  for (const s of [-1, 1]) k.add(xf(ball([0.008, 0.006, 0.005], { w: 6, h: 4 }), { at: [s * 0.022, bk.p.y + 0.03, bk.p.z + 0.012] }), { color: "#2c2a16", bind: "head" });
  k.eyes(H, { yaw: 0.48, pitch: 0.17, w: 0.047, h: 0.053, depth: 0.031, lid: C.skin });
  k.mouth(H, { dir: [0, -0.4, -1], w: 0.06, curve: 0.011, radius: 0.0062 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.7, -0.1).toArray(), ax: 0.12, ay: 0.08, lift: 0.0045 }, { color: C.blush });
  k.arms({ color: C.skin, paw: C.skin, fingers: 3, fingerColor: C.nail, pawR: 0.058 });
  k.legs({ color: C.skin, foot: C.skin, footR: [0.066, 0.06, 0.07], radius: 0.064 });
  k.tail([[0, 0.06, 0.16], [0, 0.05, 0.22], [0, 0.03, 0.26]], { radius: t => 0.03 * (1 - t * 0.85), color: C.skin });
  k.socket("hat", [0, 0.785, -0.06], { s: 0.92, tilt: -0.04 });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.9, w: 0.97 });
  k.socket("chain", [0, 0.3, 0], { front: 0.5 });
}

/* ── gila monster: the beaded bands ── */
export function gila(k) {
  const C = { black: "#2b2528", pink: "#ff8d68", coral: "#f7915f", belly: "#ffb08a", blush: "#ff7f86", tongue: "#ff7aa0" };
  k.skeleton({ head: [0, 0.42, -0.02] });
  const B = k.body({ r: [0.212, 0.198, 0.192], n: 2.25, color: C.coral, belly: C.belly });
  k.trunks();
  band(k, B, 0.42, 0.62, { color: C.black, bind: k.bodyBind });
  band(k, B, 1.0, 1.2, { color: C.black, bind: k.bodyBind });
  speckles(k, B, { count: 9, seed: "gila-body", color: C.black, bind: "chest", back: true, yaw: [-1.9, 1.9], pitch: [-0.1, 0.5], size: [0.06, 0.1] });
  const H = k.head({ r: [0.256, 0.172, 0.248], n: 2.4, at: [0, 0.575, -0.04], color: C.coral,
    warp: p => { const f = Math.max(0, -p.z / 0.248); p.y *= 1 - 0.12 * f * f; } });
  speckles(k, H, { count: 10, seed: "gila-head", color: C.black, bind: "head", back: true, yaw: [-2.3, 2.3], pitch: [0.2, 0.95], size: [0.06, 0.1] });
  k.patch(H, { dir: [0, 0.75, -0.66], ax: 0.42, ay: 0.13, lift: 0.004 }, { color: C.black });
  for (const [yaw, pitch, ax, ay] of [[0.95, 0.0, 0.17, 0.12], [-0.95, 0.0, 0.17, 0.12], [0.3, 0.55, 0.12, 0.08], [-0.3, 0.55, 0.12, 0.08], [0, 0.02, 0.1, 0.07]]) {
    k.patch(H, { dir: dirYawPitch(yaw, pitch).toArray(), ax, ay, lift: 0.004, spin: yaw }, { color: C.black });
  }
  const e = eyePoint(H, 0.6, 0.3);
  const m = atDir(H, [0, -0.25, -1]);
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, m.y, m.z] });
  k.eyes(H, { yaw: 0.6, pitch: 0.3, w: 0.048, h: 0.054, depth: 0.03, lid: C.coral });
  k.mouth(H, { dir: [0, -0.25, -1], w: 0.12, curve: 0.016, radius: 0.0075, inside: "#5a1f2b" });
  for (const s of [-1, 1]) k.add(xf(ball([0.008, 0.006, 0.005], { w: 6, h: 4 }), { at: [s * 0.03, 0.585, -0.282] }), { color: C.black, bind: "head" });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.72, -0.15).toArray(), ax: 0.12, ay: 0.08, lift: 0.0045 }, { color: C.blush });
  k.arms({ color: C.coral, paw: C.black, fingers: 3, fingerColor: C.black });
  k.legs({ color: C.coral, foot: C.black, footR: [0.062, 0.05, 0.07] });
  const tailPts = [[0, 0.08, 0.16], [0.04, 0.09, 0.3], [0.13, 0.12, 0.42], [0.24, 0.15, 0.46]];
  const t0 = V(...tailPts[0]);
  k.tail(tailPts, { radius: t => 0.074 * (1 - 0.72 * t), color: p => new THREE.Color(Math.floor(p.distanceTo(t0) / 0.075) % 2 ? C.pink : C.black) });
  k.socket("hat", [0, 0.735, -0.04], { s: 1.04, tilt: -0.03 });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 1.0, w: 1.08 });
}

/* ── horned lizard: the crown of horns ── */
export function hornedlizard(k) {
  const C = { sand: "#dcb47b", dark: "#8f5f3a", light: "#f5e2ba", belly: "#f8ecd2", horn: "#f6e7c8", blush: "#f2a383", stripe: "#9c6a45" };
  k.skeleton({ head: [0, 0.42, -0.02] });
  const B = k.body({ r: [0.226, 0.19, 0.192], n: 2.3, color: C.sand, belly: C.belly });
  k.trunks();
  speckles(k, B, { count: 8, seed: "horny-back", color: C.dark, bind: "chest", back: true, yaw: [-1.5, 1.5], pitch: [-0.05, 0.6], size: [0.07, 0.1] });
  /* the fringe of small spikes down each side */
  const fringe = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) fringe.push([[s, -0.05 + i * 0.22, 0.35], 0.03, 0.012]);
  spikes(k, B, fringe, { color: C.light, bind: "chest" });
  const H = k.head({ r: [0.258, 0.19, 0.218], n: 2.5, at: [0, 0.58, -0.03], color: C.sand,
    warp: p => { if (p.z > 0) p.x *= 1 + 0.12 * (p.z / 0.218); const f = Math.max(0, -p.z / 0.218); p.x *= 1 - 0.12 * f * f; } });
  speckles(k, H, { count: 6, seed: "horny-head", color: C.dark, bind: "head", back: true, yaw: [-1.4, 1.4], pitch: [0.3, 0.9], size: [0.05, 0.07] });
  const e = eyePoint(H, 0.52, 0.18);
  const m = atDir(H, [0, -0.3, -1]);
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, m.y, m.z], crest: [0, 0.72, 0.12] });
  k.eyes(H, { yaw: 0.52, pitch: 0.18, w: 0.05, h: 0.056, depth: 0.032, lid: C.sand });
  /* the dark tear stripe under each eye */
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.58, -0.08).toArray(), ax: 0.05, ay: 0.11, lift: 0.003, spin: -s * 0.3 }, { color: C.stripe });
  k.mouth(H, { dir: [0, -0.3, -1], w: 0.11, curve: 0.016, radius: 0.0072 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.74, -0.15).toArray(), ax: 0.11, ay: 0.075, lift: 0.0045 }, { color: C.blush });
  /* the crown: two long horns at the back, smaller ones fanning round */
  const crown = [];
  for (const [yaw, pitch, len, r] of [[Math.PI - 0.3, 0.55, 0.14, 0.026], [Math.PI + 0.3, 0.55, 0.14, 0.026], [Math.PI - 0.75, 0.42, 0.11, 0.022], [Math.PI + 0.75, 0.42, 0.11, 0.022],
    [Math.PI - 1.2, 0.28, 0.09, 0.019], [Math.PI + 1.2, 0.28, 0.09, 0.019], [Math.PI, 0.78, 0.07, 0.019], [Math.PI - 1.62, 0.12, 0.07, 0.016], [Math.PI + 1.62, 0.12, 0.07, 0.016]]) {
    crown.push([dirYawPitch(yaw, pitch).toArray(), len, r]);
  }
  spikes(k, H, crown, { color: C.horn, bind: "crest", lean: [0, 0.5, 0.1] });
  spikes(k, H, [[dirYawPitch(Math.PI - 0.75, 0.62).toArray(), 0.16, 0.03], [dirYawPitch(Math.PI + 0.75, 0.62).toArray(), 0.16, 0.03]], { color: C.horn, bind: "crest", lean: [0, 1.2, 0.2] });
  k.arms({ color: C.sand, paw: C.light, fingers: 3, fingerColor: C.light });
  k.legs({ color: C.sand, foot: C.light, footR: [0.06, 0.046, 0.07] });
  k.tail([[0, 0.07, 0.16], [0, 0.06, 0.24], [0, 0.04, 0.3]], { radius: t => 0.06 * (1 - t * 0.8), color: C.sand, flat: 0.6, side: [1, 0, 0] });
  k.socket("hat", [0, 0.765, -0.04], { s: 1.05, tilt: -0.04 });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.98, w: 1.06 });
}

/* ── bighorn: the curls ── */
export function bighorn(k) {
  const C = { fur: "#a97e55", back: "#8f6846", muzzle: "#f5eee3", horn: "#e2c897", ridge: "#c7aa79", nose: "#3a2a23", inner: "#e9b9a3", hoof: "#2f2723", blush: "#f0a08a" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  k.body({ r: [0.205, 0.2, 0.19], n: 2.2, color: C.fur, belly: C.muzzle });
  k.trunks();
  const H = k.head({ r: [0.218, 0.205, 0.226], n: 2.3, at: [0, 0.6, -0.025], color: C.fur });
  const S = blob({ r: [0.122, 0.104, 0.105], n: 2.2, at: [0, 0.54, -0.205] });
  k.add(blobGeometry(S, { w: k.seg.ball[0] + 4, h: k.seg.ball[1] + 2 }), { color: C.muzzle, bind: "head" });
  const e = eyePoint(H, 0.5, 0.16);
  const m = S.at(V(0, -0.55, -0.83).normalize());
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, m.y, m.z], ears: [0.19, 0.65, 0.04] });
  k.add(xf(ball([0.04, 0.026, 0.022], { w: 12, h: 8 }), { at: [0, 0.572, -0.302] }), { color: C.nose, bind: "head" });
  k.eyes(H, { yaw: 0.5, pitch: 0.16, w: 0.047, h: 0.054, depth: 0.031, lid: C.fur });
  k.mouth(S, { dir: [0, -0.5, -0.86], w: 0.034, curve: 0.009, radius: 0.006 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.72, -0.08).toArray(), ax: 0.11, ay: 0.075, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "leaf", at: [0.19, 0.645, 0.04], size: [0.04, 0, 0.018], len: 0.085, color: C.fur, inner: C.inner, tilt: [0.1, 0, 1.25] });
  for (const s of [-1, 1]) {
    spiralHorn(k, { base: V(s * 0.12, 0.765, 0.0), out: V(s, 0, 0), up: V(0, 1, 0), back: V(0, 0, 1), turns: 0.82, r0: 0.066, r1: 0.024, grow: 0.125, color: C.horn, ridge: C.ridge });
  }
  k.arms({ color: C.fur, paw: C.hoof });
  k.legs({ color: C.fur, foot: C.hoof, footR: [0.058, 0.05, 0.066] });
  k.add(ball([0.05, 0.045, 0.04], { w: k.seg.ball[0], h: k.seg.ball[1], at: [0, 0.16, 0.19] }), { color: C.muzzle, bind: "tail" });
  k.socket("hat", [0, 0.805, -0.03], { s: 0.9, tilt: -0.04 });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.92, w: 1.0 });
}

/* ── quail: the plume ── */
export function quail(k) {
  const C = { body: "#8792aa", wing: "#727d95", belly: "#f1e4c4", patch: "#2a2629", crown: "#bb653a", face: "#262226", white: "#fbf7ee", plume: "#211d23", beak: "#2f2c33", flank: "#a05d38", leg: "#a2917f", blush: "#f4a49a" };
  k.skeleton({ head: [0, 0.43, -0.02], arm: { a: 0.115, b: 0.115, dir: [0.5, -0.86, 0.02] } });
  const B = k.body({ r: [0.208, 0.205, 0.202], n: 2.0, color: C.body, belly: C.belly, bellyPatch: { dir: [0, -0.15, -1], ax: 0.62, ay: 0.7 } });
  k.trunks();
  k.patch(B, { dir: [0, -0.32, -1], ax: 0.22, ay: 0.18, lift: 0.006 }, { color: C.patch, bind: k.bodyBind });
  for (const s of [-1, 1]) {
    k.patch(B, { dir: dirYawPitch(s * 1.35, 0.05).toArray(), ax: 0.34, ay: 0.4, lift: 0.004 }, { color: C.flank, bind: k.bodyBind });
    for (let i = 0; i < 3; i++) k.patch(B, { dir: dirYawPitch(s * (1.2 + i * 0.16), 0.15 - i * 0.12).toArray(), ax: 0.03, ay: 0.12, lift: 0.006, spin: s * 0.6 }, { color: C.white, bind: k.bodyBind });
  }
  const H = k.head({ r: [0.21, 0.2, 0.206], n: 2.0, at: [0, 0.605, -0.02], color: C.body });
  k.patch(H, { dir: [0, 1, 0.15], ax: 0.82, ay: 0.72, lift: 0.004 }, { color: C.crown });
  /* the black face and throat, edged in white */
  const e = eyePoint(H, 0.5, 0.2);
  const jaw = [0, 0.548, -0.2];
  k.faceBones({ eyes: [0, e.y, e.z], mouth: jaw, jaw, crest: [0, 0.79, -0.07] });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.46, 0.43).toArray(), ax: 0.2, ay: 0.035, lift: 0.0045, spin: -s * 0.25 }, { color: C.white });
  k.eyes(H, { yaw: 0.5, pitch: 0.2, w: 0.05, h: 0.058, depth: 0.031, lid: C.body });
  /* the beak, small and dark: upper on the head, lower on the jaw */
  k.add(tube([[0, 0.588, -0.19], [0, 0.578, -0.245], [0, 0.552, -0.28]], { radius: t => 0.036 * (1 - t) ** 0.8 + 0.005, radial: 8, segments: 6, flat: 0.8, side: [1, 0, 0] }), { color: C.beak, bind: "head" });
  k.add(tube([[0, 0.553, -0.19], [0, 0.548, -0.23]], { radius: t => 0.018 * (1 - t) + 0.003, radial: 7, segments: 3 }), { color: C.beak, bind: "jaw" });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.7, 0.0).toArray(), ax: 0.1, ay: 0.07, lift: 0.0045 }, { color: C.blush });
  /* the topknot: a stalk curling forward to a teardrop */
  const stalk = [V(0, 0.785, -0.06), V(0, 0.86, -0.07), V(0, 0.93, -0.11), V(0, 0.955, -0.17)];
  k.add(tube(stalk, { radius: t => 0.013 * (1 - t * 0.4), radial: 6, segments: k.detail === "hero" ? 10 : 6, capRings: 1 }), { color: C.plume, bind: "crest" });
  k.add(xf(ball([0.034, 0.05, 0.03], { w: k.seg.ball[0], h: k.seg.ball[1] }), { rot: [-0.9, 0, 0], at: [0, 0.95, -0.21] }), { color: C.plume, bind: "crest" });
  k.arms({ color: C.wing, wing: { root: 0.058, tip: 0.048, feather: "#5f6880" } });
  k.legs({ bird: { r: 0.02, color: C.leg }, len: 0.15, dir: [0.25, -0.25, -1] });
  k.tail([[0, 0.12, 0.17], [0, 0.18, 0.25], [0, 0.22, 0.3]], { radius: t => 0.045 * (1 - t * 0.4), flat: 0.35, side: [1, 0, 0], color: C.wing });
  k.socket("hat", [0, 0.8, 0.0], { s: 0.92, tilt: -0.04, plume: true });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.92, w: 1.0 });
}

/* ── armadillo: the armor ── */
export function armadillo(k) {
  const C = { skin: "#c7a08c", shell: "#8f7a6c", band: "#b29c8b", seam: "#6e5a4f", inner: "#f2b6a9", nose: "#5d403a", belly: "#f2d0bd", blush: "#f39a8a" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  k.body({ r: [0.2, 0.2, 0.18], n: 2.2, color: C.skin, belly: C.belly });
  k.trunks();
  shell(k, { r: [0.245, 0.242, 0.218], at: [0, 0.2, 0.035], color: C.band, seam: C.seam, bands: 7, bind: "chest", thetaBack: 1.58 });
  const H = k.head({ r: [0.205, 0.195, 0.205], n: 2.15, at: [0, 0.6, -0.02], color: C.skin });
  /* the head shield and the long snout */
  k.patch(H, { dir: [0, 0.8, -0.6], ax: 0.36, ay: 0.85, lift: 0.011 }, { color: C.shell });
  for (const pitch of [0.55, 0.85, 1.15]) k.patch(H, { dir: dirYawPitch(0, pitch).toArray(), ax: 0.3, ay: 0.06, lift: 0.0145 }, { color: C.seam });
  k.add(tube([[0, 0.565, -0.16], [0, 0.54, -0.29], [0, 0.522, -0.39]], { radius: t => 0.07 - 0.034 * t, radial: k.seg.limb[0] + 2, segments: k.detail === "hero" ? 10 : 6, capRings: 1 }), { color: C.skin, bind: "head" });
  k.add(xf(ball([0.036, 0.031, 0.026], { w: 12, h: 8 }), { at: [0, 0.523, -0.412] }), { color: C.nose, bind: "head" });
  const e = eyePoint(H, 0.5, 0.17);
  const m = atDir(H, [0, -0.5, -1]);
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, m.y, m.z], ears: [0.125, 0.775, 0.05] });
  k.eyes(H, { yaw: 0.5, pitch: 0.17, w: 0.046, h: 0.053, depth: 0.031, lid: C.skin });
  k.mouth(H, { dir: [0, -0.52, -1], w: 0.04, curve: 0.01, radius: 0.006 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.72, -0.1).toArray(), ax: 0.12, ay: 0.08, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "round", at: [0.13, 0.765, 0.06], size: [0.048, 0.072, 0.02], color: C.skin, inner: C.inner, tilt: [-0.05, 0.45, 0.42] });
  k.arms({ color: C.skin, paw: C.skin, fingers: 3, fingerColor: "#f7e7dc" });
  k.legs({ color: C.skin, foot: C.skin, footR: [0.056, 0.046, 0.072] });
  const tailPts = [[0, 0.07, 0.17], [0, 0.05, 0.3], [0.05, 0.05, 0.43], [0.12, 0.07, 0.5]];
  const t0 = V(...tailPts[0]);
  k.tail(tailPts, { radius: t => 0.048 * (1 - 0.78 * t), color: p => new THREE.Color(Math.floor(p.distanceTo(t0) / 0.05) % 2 ? C.band : C.seam) });
  k.socket("hat", [0, 0.79, 0.0], { s: 0.9, tilt: -0.04, ears: true });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.9, w: 0.97 });
  k.socket("chain", [0, 0.3, 0], { front: 0.5 });
}

/* ── coyote: the ears and the brush ── */
export function coyote(k) {
  const C = { fur: "#c98f57", back: "#a28d7b", cream: "#f6e8cd", nose: "#1f1a1a", inner: "#f5dcc0", tip: "#2b2320", blush: "#f2a08a", paw: "#ead6b3" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  k.body({ r: [0.2, 0.2, 0.185], n: 2.15, color: C.fur, belly: C.cream });
  k.trunks();
  const H = k.head({ r: [0.222, 0.2, 0.212], n: 2.2, at: [0, 0.605, -0.015], color: C.fur,
    warp: p => { if (p.y < 0.02) p.x *= 1 + 0.12 * Math.max(0, (0.02 - p.y) / 0.2); } });
  k.patch(H, { dir: [0, 1, 0.5], ax: 0.62, ay: 0.55, lift: 0.0035 }, { color: C.back });
  const S = blob({ r: [0.105, 0.084, 0.13], n: 2.15, at: [0, 0.548, -0.215], warp: p => { const f = Math.max(0, -p.z / 0.13); p.x *= 1 - 0.25 * f; p.y *= 1 - 0.15 * f; } });
  k.add(blobGeometry(S, { w: k.seg.ball[0] + 4, h: k.seg.ball[1] + 2 }), { color: C.cream, bind: "head" });
  k.add(xf(ball([0.037, 0.028, 0.026], { w: 12, h: 8 }), { at: [0, 0.566, -0.34] }), { color: C.nose, bind: "head" });
  const e = eyePoint(H, 0.48, 0.17);
  const m = S.at(V(0, -0.6, -0.8).normalize());
  k.faceBones({ eyes: [0, e.y, e.z], mouth: [0, m.y, m.z], ears: [0.125, 0.775, 0.02] });
  k.eyes(H, { yaw: 0.48, pitch: 0.17, w: 0.047, h: 0.055, depth: 0.031, lid: C.fur });
  k.mouth(S, { dir: [0, -0.62, -0.78], w: 0.036, curve: 0.009, radius: 0.006 });
  /* fluffy cheeks */
  for (const s of [-1, 1]) spikes(k, H, [[dirYawPitch(s * 1.15, -0.35).toArray(), 0.05, 0.03], [dirYawPitch(s * 1.3, -0.15).toArray(), 0.045, 0.028]], { color: C.cream, lean: [0, -0.4, 0], flat: 0.6 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.74, -0.08).toArray(), ax: 0.11, ay: 0.075, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "leaf", at: [0.125, 0.77, 0.02], size: [0.072, 0, 0.026], len: 0.19, color: C.fur, inner: C.inner, tip: C.tip, tilt: [0.05, 0, 0.3] });
  k.arms({ color: C.fur, paw: C.paw });
  k.legs({ color: C.fur, foot: C.paw, sole: "#3a2a22" });
  /* the brush: thick, up behind, black-tipped */
  const tailPts = [[0, 0.1, 0.16], [0.06, 0.16, 0.3], [0.1, 0.32, 0.38], [0.08, 0.5, 0.36]];
  const t0 = V(...tailPts[0]);
  k.tail(tailPts, { radius: t => 0.04 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), color: p => new THREE.Color(p.distanceTo(t0) > 0.44 ? C.tip : C.fur) });
  k.socket("hat", [0, 0.8, 0.0], { s: 0.95, tilt: -0.04, ears: true });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.93, w: 1.0 });
}

/* ── otter: the whisker pads ── */
export function otter(k) {
  const C = { fur: "#7d5437", dark: "#5f3e28", face: "#efdcbd", belly: "#a98260", nose: "#2b1c17", whisker: "#fffaf0", blush: "#f2a08a", inner: "#4a3022" };
  k.skeleton({ head: [0, 0.43, -0.02] });
  k.body({ r: [0.2, 0.205, 0.188], n: 2.1, color: C.fur, belly: C.belly });
  k.trunks();
  const H = k.head({ r: [0.234, 0.2, 0.214], n: 2.15, at: [0, 0.6, -0.02], color: C.fur,
    warp: p => { if (p.y < 0) p.x *= 1 + 0.06 * (-p.y / 0.2); } });
  k.patch(H, { dir: [0, -0.32, -1], ax: 0.78, ay: 0.55, lift: 0.004 }, { color: C.face });
  const e = eyePoint(H, 0.47, 0.18);
  const mouth = [0, 0.495, -0.2];
  k.faceBones({ eyes: [0, e.y, e.z], mouth, ears: [0.17, 0.73, 0.05] });
  whiskerPads(k, { at: [0, 0.54, -0.196], r: 0.058, spread: 0.048, color: C.face });
  k.add(xf(ball([0.044, 0.028, 0.026], { w: 12, h: 8 }), { at: [0, 0.584, -0.238], rot: [-0.2, 0, 0] }), { color: C.nose, bind: "head" });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.22;
    k.add(tube([[s * 0.075, 0.545 + i * 0.008, -0.225], [s * 0.15, 0.55 + a * 0.12, -0.22], [s * 0.2, 0.545 + a * 0.3, -0.2]], { radius: 0.0032, radial: 4, segments: 4, capRings: 1 }), { color: C.whisker, bind: "head" });
  }
  k.eyes(H, { yaw: 0.47, pitch: 0.18, w: 0.048, h: 0.055, depth: 0.031, lid: C.fur });
  k.mouth(H, { dir: [0, -0.62, -0.8], w: 0.03, curve: 0.009, radius: 0.0058 });
  for (const s of [-1, 1]) k.patch(H, { dir: dirYawPitch(s * 0.74, -0.06).toArray(), ax: 0.11, ay: 0.075, lift: 0.0045 }, { color: C.blush });
  k.ears({ kind: "round", at: [0.17, 0.73, 0.05], size: [0.034, 0.034, 0.018], color: C.fur, inner: C.inner, tilt: [0.1, 0.6, 0.7] });
  k.arms({ color: C.fur, paw: C.dark, fingers: 3, fingerColor: C.dark });
  k.legs({ color: C.fur, foot: C.dark, footR: [0.062, 0.042, 0.078] });
  k.tail([[0, 0.08, 0.16], [0.02, 0.06, 0.3], [0.08, 0.06, 0.42], [0.16, 0.08, 0.47]], { radius: t => 0.062 * (1 - 0.8 * t), color: C.dark, flat: 0.7, side: [0, 1, 0] });
  k.socket("hat", [0, 0.795, 0.0], { s: 0.98, tilt: -0.04 });
  k.socket("shades", [0, e.y + 0.004, e.z - 0.03], { s: 0.94, w: 1.02 });
}
