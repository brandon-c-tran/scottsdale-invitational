/* The thirteen critters as sculpts (bake time only; float/shared/looks.js
   has their ids). Each is one soft plush mass on the shared body plan
   (plan.js): a big round head melted onto a pear of a body, stubby limbs,
   and what makes the species read at a glance from across the room: the
   capybara's loaf of a head, the javelina's pig snout and bristly collar,
   the frog's eyes on top, and so on. Colors melt the way the surfaces do.

   A species returns { sculpt, rig, head, face(features), hat, chain, fur,
   info }: head is the head's centre (the face is found by casting from it),
   face adds the eyes and mouths, hat and chain say where those sit. */
import { Sculpt, ellipsoid, ellipsoidB, frameAlong, roundCone, roundBox, chain, union, trim, smooth, rgb, lerp3, noise3, cells3, clamp, alongPath } from "./sdf.js";
import { skeleton, spine, arms, legs, trunks, patch, patchOn, shade, norm, add, seat, outFrom, grower, longEar, earBones, curl, alongShare } from "./plan.js";

const SPINE = spine();

/* the core: a soft pear of a body (a wide bottom melted into a narrower
   chest) and a round belly that jiggles. Exact primitives, so blends and
   occlusion behave */
function core(s, { color, bellyColor = null, width = 1, depth = 1, low = [0, 0.15, 0.012], lowR = [0.2, 0.155, 0.182], high = [0, 0.3, 0.0], highR = [0.166, 0.13, 0.15],
  belly = [0, 0.152, -0.07], bellyR = [0.156, 0.13, 0.122] } = {}) {
  const w = r => [r[0] * width, r[1], r[2] * depth];
  s.part("torso", union([ellipsoid(low, w(lowR)), ellipsoid(high, w(highR))], 0.035), { k: 0, bone: SPINE, color, group: "core" });
  s.part("belly", ellipsoid(belly, w(bellyR)), { k: 0.018, bone: [["belly", 0.75], ["hips", 0.25]], color: bellyColor || color, group: "core" });
}

/* ── capybara: NOT a bear. A big loaf of a head, flat on top, a deep blunt
   snout with the nose up front, tiny ears, a barrel of a body ── */
function capybara() {
  const s = new Sculpt("capybara");
  const C = { fur: "#b27947", top: "#94612f", muzzle: "#c8955f", belly: "#c08d5a", nose: "#3b2619", paw: "#76492b", inner: "#6c4126", blush: "#ea8f7a" };
  const G = grower(1.1, [0, 0.36, -0.03]);
  const H = G.p([0, 0.585, -0.06]);
  const rig = skeleton({ eyes: G.p([0, 0.66, -0.17]), mouth: G.p([0, 0.5, -0.33]), ears: G.p([0.15, 0.755, 0.075]), ear2: G.p([0.16, 0.79, 0.08]), cheeks: G.p([0.15, 0.52, -0.04]) });
  const furColor = shade(C.top, C.fur, 0.52, 0.85);
  core(s, { color: C.fur, bellyColor: C.belly, width: 1.04, depth: 1.04 });
  /* the loaf: a rounded brick, long front to back and flat on top, its sides
     drawing in toward a deep blunt snout, the chin rising to meet it */
  const brick = roundBox(G.p([0, 0.598, -0.075]), G.r([0.215, 0.175, 0.268]), G.s(0.13));
  const loaf = trim(brick, [G.plane([0.986, 0, -0.165, 0.182]), G.plane([-0.986, 0, -0.165, 0.182]), G.plane([0, 1, 0, 0.765]), G.plane([0, -0.94, -0.34, -0.326])], G.s(0.045));
  s.part("head", loaf, { k: 0.016, bone: "head", color: furColor, group: "core" });
  /* the back of the neck: thick, so the loaf sits on the barrel, not a stalk */
  s.part("nape", ellipsoid([0, 0.43, 0.075], [0.15, 0.1, 0.11]), { k: 0.03, bone: [["head", 0.5], ["chest", 0.5]], color: C.top, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.158, 0.515, -0.02]), G.r([0.08, 0.072, 0.1])), { k: 0.02, bone: `cheek${S}`, color: C.fur, group: "core" });
  }
  /* tiny round ears, set far back on the corners, seated on the loaf */
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    const st = seat(s, G.p([0, 0.6, 0.02]), [x * 0.62, 0.62, 0.48]);
    s.part(`ear${S}`, ellipsoid(outFrom(st, 0.012), G.r([0.031, 0.035, 0.02]), [0.25, x * 0.6, x * 0.45]), { k: 0.009, bone: `ear${S}`, color: C.fur, group: "ear" });
  }
  /* nostrils: two soft slits on the front of the snout's top */
  for (const x of [-1, 1]) { const st = seat(s, H, [x * 0.12, 0.4, -1]); s.cut(`nostril${x}`, ellipsoid(outFrom(st, 0.004), G.r([0.016, 0.009, 0.02]), [0.35, 0, x * 0.5]), { k: 0.004, color: "#20140d", width: 0.008, fur: 0, fuzz: 0.4 }); }
  arms(s, rig, { color: C.fur, pawColor: C.paw });
  legs(s, rig, { color: C.fur, footColor: C.paw });
  trunks(s);
  /* the muzzle a touch lighter, the nose pad dark across the snout's front */
  patchOn(s, H, [0, -0.15, -1], G.r([0.15, 0.13, 0.12]), C.muzzle, { edge: 0.6, sink: 0.03, only: (p, n, own, g) => g("core") });
  patchOn(s, H, [0, 0.36, -1], G.r([0.085, 0.04, 0.06]), C.nose, { edge: 0.35, fur: 0, fuzz: 0.35, rough: 0.55 });
  patch(s, [0, 0.2, -0.2], [0.16, 0.15, 0.12], C.belly, { edge: 0.7, only: (p, n, own, g) => g("core") });
  for (const x of [-1, 1]) patch(s, G.p([x * 0.16, 0.745, 0.1]), G.r([0.022, 0.026, 0.02]), C.inner, { edge: 0.5, fur: 0.3, only: (p, n, own, g) => g("ear") * Math.max(0, -n[2] * 0.6 + 0.4) });
  for (const x of [-1, 1]) patch(s, G.p([x * 0.19, 0.545, -0.12]), G.r([0.06, 0.045, 0.06]), C.blush, { edge: 0.85, strength: 0.7 });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: G.p([0, 0.6, -0.06]), yaw: 0.8, pitch: 0.36, w: G.s(0.036), h: G.s(0.041), depth: G.s(0.019), lid: true, lidColor: "#9a6534", lidCover: 0.36, lidTilt: 0.14 });
      f.mouth({ center: H, dir: [0, -0.42, -1], w: G.s(0.03), curve: G.s(0.008), radius: 0.0048, openW: G.s(0.036), openH: G.s(0.034) });
    },
    hat: { from: G.p([0, 0.6, -0.03]), skip: ["earL", "earR"], tilt: -0.05 },
    chain: { front: 0.345, back: 0.42 },
    fur: { length: 0.0075 },
    info: { chill: true },
  };
}

/* ── javelina: the pig snout and the bristly pale collar ── */
function javelina() {
  const s = new Sculpt("javelina");
  const C = { fur: "#6f6676", dark: "#3e3745", collar: "#efe6d4", belly: "#7d7486", snout: "#776e7c", disc: "#d0969e", nostril: "#4a2630", tusk: "#fbf6ea", inner: "#d59aa1", blush: "#e8949b", hoof: "#2a262f" };
  const G = grower(1.1, [0, 0.36, -0.03]);
  const H = G.p([0, 0.58, -0.025]);
  const rig = skeleton({ eyes: G.p([0, 0.65, -0.19]), mouth: G.p([0, 0.5, -0.31]), ears: G.p([0.17, 0.77, 0.04]), ear2: G.p([0.19, 0.84, 0.05]), cheeks: G.p([0.16, 0.52, -0.08]), crest: G.p([0, 0.79, 0.04]) });
  core(s, { color: C.fur, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.238, 0.214, 0.226])), { k: 0.016, bone: "head", color: C.fur, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.155, 0.52, -0.08]), G.r([0.08, 0.072, 0.085])), { k: 0.02, bone: `cheek${S}`, color: C.fur, group: "core" });
  }
  /* short upright ears, rounded to a point, seated on the crown's sides */
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    const st = seat(s, H, [x * 0.62, 0.78, 0.2]);
    const c = outFrom(st, 0.035);
    const y0 = c[1] - 0.02;
    s.part(`ear${S}`, ellipsoid(c, G.r([0.045, 0.072, 0.02]), [0.15, x * 0.35, -x * 0.32]),
      { k: 0.012, bone: (xx, yy) => { const t = clamp((yy - y0) / 0.07, 0, 1); return [[`ear${S}`, 1 - t], [`ear${S}2`, t]]; }, color: C.fur, group: "ear" });
  }
  /* the snout: a short barrel, a flat pig disc at its end */
  s.part("snout", roundCone(G.p([0, 0.548, -0.13]), G.p([0, 0.522, -0.282]), G.s(0.098), G.s(0.074)), { k: 0.026, bone: "head", color: C.snout, group: "snout", fur: 0.5 });
  s.part("disc", roundBox(G.p([0, 0.52, -0.346]), G.r([0.07, 0.058, 0.02]), G.s(0.02)), { k: 0.012, bone: "head", color: C.disc, group: "disc", fur: 0, fuzz: 0.45, rough: 0.6 });
  for (const x of [-1, 1]) s.cut(`nostril${x}`, ellipsoid(G.p([x * 0.025, 0.522, -0.37]), G.r([0.012, 0.017, 0.012])), { k: 0.003, color: C.nostril, width: 0.006, fur: 0 });
  /* the mane: soft bristles from the brow back over the crown and down the back */
  for (let i = 0; i < 8; i++) {
    const a = 1.15 + i * 0.22;
    const st = seat(s, H, [0, Math.sin(a), Math.cos(a)]);
    const tip = add(st.p, norm([0, Math.sin(a) + 0.2, Math.cos(a) + 0.65]), 0.062 + 0.012 * Math.sin(i * 1.9));
    s.part(`mane${i}`, roundCone(outFrom(st, -0.012), tip, 0.027, 0.008), { k: 0.012, bone: i < 5 ? "crest" : "head", color: C.dark, fur: 1.5, group: "mane" });
  }
  for (let i = 0; i < 4; i++) {
    const a = 0.95 - i * 0.3;
    const base = [0, 0.22 + Math.sin(a) * 0.17, 0.01 + Math.cos(a) * 0.17];
    const tip = add(base, norm([0, Math.sin(a) + 0.4, Math.cos(a) + 0.6]), 0.05);
    s.part(`back${i}`, roundCone(base, tip, 0.022, 0.007), { k: 0.012, bone: "chest", color: C.dark, fur: 1.5, group: "mane" });
  }
  arms(s, rig, { color: C.fur, pawColor: C.dark });
  legs(s, rig, { color: C.fur, footColor: C.hoof });
  s.part("tail", roundCone([0, 0.11, 0.19], [0, 0.14, 0.25], 0.024, 0.014), { k: 0.01, bone: "tail", color: C.dark, movable: true, group: "tail" });
  trunks(s);
  /* the collar: a pale band round the shoulders, under the head */
  const collar = rgb(C.collar);
  s.paint((p, n, own, m, group) => {
    const g = group("core") * (1 - group("snout"));
    if (g <= 0) return;
    const ang = Math.atan2(p[0], -p[2]);
    const y0 = 0.31 + 0.03 * Math.cos(ang), y1 = 0.39 + 0.035 * Math.cos(ang);
    const t = g * smooth(y0 - 0.014, y0 + 0.014, p[1]) * (1 - smooth(y1 - 0.014, y1 + 0.014, p[1]));
    if (t <= 0) return;
    m.color = lerp3(m.color, collar, t);
    m.fur = m.fur + (1.7 - m.fur) * t;
  });
  /* a bristly coat: longer fur on the back and the crown */
  s.paint((p, n, own, m) => { const back = smooth(-0.1, 0.22, p[2]) * smooth(0.3, 0.7, p[1]); m.fur *= 1 + 0.6 * back; });
  patch(s, [0, 0.22, -0.18], [0.14, 0.12, 0.1], C.belly, { edge: 0.7 });
  for (const x of [-1, 1]) patch(s, G.p([x * 0.175, 0.8, 0.03]), G.r([0.026, 0.05, 0.03]), C.inner, { edge: 0.5, fur: 0.2, only: (p, n, own, g) => g("ear") * Math.max(0, -n[2]) });
  for (const x of [-1, 1]) patch(s, G.p([x * 0.19, 0.55, -0.14]), G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.65 });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.54, pitch: 0.2, w: G.s(0.032), h: G.s(0.037), depth: G.s(0.018) });
      f.mouth({ center: H, dir: [0, -0.66, -0.75], w: G.s(0.03), curve: G.s(0.009), radius: 0.0048, skip: p => p.group === "disc" });
      for (const x of [-1, 1]) f.spike([G.p([x * 0.066, 0.49, -0.27]), G.p([x * 0.086, 0.52, -0.288]), G.p([x * 0.084, 0.556, -0.292])], { r0: 0.015, r1: 0.004, color: C.tusk });
    },
    hat: { from: G.p([0, 0.6, -0.02]), skip: ["earL", "earR", ...Array.from({ length: 8 }, (_, i) => `mane${i}`)], tilt: -0.05 },
    chain: { front: 0.34, back: 0.43 },
    fur: { length: 0.009 },
    info: {},
  };
}

/* ── frog: wide, flat, eyes up top in their turrets, a wide grin ── */
function frog() {
  const s = new Sculpt("frog");
  const C = { skin: "#56b947", top: "#3e9c37", belly: "#f1e88f", spot: "#2f7c2b", mouth: "#264a22", blush: "#f39a86", web: "#79cd63" };
  const G = grower(1.08, [0, 0.35, -0.03]);
  const H = G.p([0, 0.525, -0.045]);
  const T = x => G.p([x * 0.138, 0.672, -0.11]);
  const rig = skeleton({ head: [0, 0.4, -0.02], shoulder: [0.162, 0.3, -0.01], eyes: G.p([0, 0.71, -0.15]), mouth: G.p([0, 0.47, -0.29]),
    ears: T(1), ear2: add(T(1), [0, 0.05, 0]), cheeks: G.p([0.18, 0.49, -0.1]) });
  const skin = shade(C.top, C.skin, 0.4, 0.78);
  core(s, { color: skin, bellyColor: C.belly, width: 1.1, low: [0, 0.14, 0.01], lowR: [0.205, 0.145, 0.18], high: [0, 0.28, 0], highR: [0.18, 0.12, 0.155] });
  /* a wide flat head, no neck at all */
  s.part("head", ellipsoid(H, G.r([0.295, 0.178, 0.258])), { k: 0.022, bone: "head", color: skin, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    /* the eye turrets: round domes up top */
    s.part(`turret${S}`, ellipsoid(T(x), G.r([0.092, 0.088, 0.088])), { k: 0.022, bone: `ear${S}`, color: skin, group: "turret" });
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.18, 0.48, -0.1]), G.r([0.085, 0.062, 0.09])), { k: 0.022, bone: `cheek${S}`, color: skin, group: "core" });
    /* big folded thighs at the sides of the seat */
    s.part(`thigh${S}`, ellipsoid([x * 0.2, 0.08, -0.03], [0.09, 0.075, 0.135], [0, x * 0.3, 0]), { k: 0.025, bone: `leg${S}`, color: skin, group: "core" });
  }
  arms(s, rig, { color: skin, pawColor: C.web, r0: 0.056, r1: 0.048,
    pawShape: (c, dir, S) => ellipsoid(c, [0.064, 0.034, 0.066], [0, 0, (S === "L" ? 1 : -1) * 0.6]) });
  legs(s, rig, { color: skin, footColor: C.web, len: 0.12,
    footShape: (c, d, S) => ellipsoid([c[0], c[1] - 0.01, c[2]], [0.09, 0.024, 0.1], [-0.15, (S === "L" ? -1 : 1) * 0.35, 0]) });
  trunks(s, { waist: 0.12 });
  /* the pale throat and belly */
  patch(s, G.p([0, 0.4, -0.22]), G.r([0.24, 0.13, 0.16]), C.belly, { edge: 0.5 });
  patch(s, [0, 0.2, -0.2], [0.17, 0.17, 0.12], C.belly, { edge: 0.6 });
  /* spots on the back and the crown */
  const spot = rgb(C.spot);
  s.paint((p, n, own, m, group) => {
    if (n[1] < -0.3) return;
    const back = smooth(-0.15, 0.15, p[2] + 0.12 * n[1]) + smooth(0.64, 0.72, p[1]) * 0.6;
    if (back <= 0) return;
    const [d] = cells3(p[0] * 12, p[1] * 12, p[2] * 12, 7);
    const t = Math.min(1, back) * (1 - smooth(0.26, 0.36, d)) * (1 - group("turret"));
    if (t > 0) m.color = lerp3(m.color, spot, t * 0.8);
  });
  for (const x of [-1, 1]) patch(s, G.p([x * 0.215, 0.5, -0.17]), G.r([0.06, 0.04, 0.05]), C.blush, { edge: 0.85, strength: 0.75 });
  /* frogs are velvet, not fur */
  s.paint((p, n, own, m) => { m.fur *= 0.4; });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      /* the eyes on the turrets' fronts, looking out and ahead */
      const surfaces = [-1, 1].map(x => f.surface(T(x), { x: x * 0.38, y: 0.3, z: -0.87 }));
      f.eyes({ surfaces, w: G.s(0.04), h: G.s(0.044), depth: G.s(0.02), sink: 0.45 });
      f.mouth({ center: H, dir: [0, -0.3, -1], w: G.s(0.13), curve: G.s(0.024), radius: 0.0058, color: C.mouth, openW: G.s(0.1), openH: G.s(0.065) });
    },
    hat: { from: G.p([0, 0.58, 0.06]), skip: ["turretL", "turretR"], tilt: 0.18, back: 0.25, overEyes: true, sink: 0.02, s: 0.92 },
    shadesOnEyes: true,
    chain: { front: 0.315, back: 0.39 },
    fur: { length: 0.004 },
    info: {},
  };
}

/* bird legs: thin, bare, three toes forward and one back */
const birdFoot = color => (c, d, S) => {
  const x = S === "L" ? -1 : 1;
  const toes = [[-0.5, 0.07], [0, 0.085], [0.5, 0.07], [Math.PI, 0.05]].map(([a, l]) => {
    const dir = [Math.sin(a) * x * 0.9 + d[0] * Math.cos(a), -0.15, -Math.cos(a) * 0.95];
    return roundCone(c, add(c, norm(dir), l), 0.016, 0.009);
  });
  return union(toes, 0.008);
};

/* ── roadrunner: the crest, the long tail, the long beak, speckles ── */
function roadrunner() {
  const s = new Sculpt("roadrunner");
  const C = { body: "#9c7650", top: "#6f5034", speck: "#4f3826", streak: "#f1e4c6", belly: "#f3e7cc", crest: "#2c2420", crestTip: "#4f78c8", beak: "#3d3a43", jaw: "#34313a", blue: "#4a9cf0", orange: "#ff8a3c", leg: "#9a9ea8", blush: "#f2a28f", tail: "#45342a", tip: "#fbf6ea" };
  const G = grower(1.08, [0, 0.36, -0.03]);
  const H = G.p([0, 0.59, -0.02]);
  const tailPts = [[0, 0.13, 0.15], [0, 0.27, 0.3], [0, 0.48, 0.4], [0, 0.66, 0.43]];
  const rig = skeleton({ eyes: G.p([0, 0.64, -0.17]), mouth: G.p([0, 0.55, -0.32]), jaw: G.p([0, 0.548, -0.2]), ears: G.p([0.16, 0.72, 0.02]), crest: G.p([0, 0.78, -0.02]),
    cheeks: G.p([0.15, 0.53, -0.07]), arm: { a: 0.112, b: 0.112, dir: [0.58, -0.8, -0.04] }, tail: tailPts[0], tail2: tailPts[1], tail3: tailPts[2] });
  const body = shade(C.top, C.body, 0.45, 0.85);
  core(s, { color: body, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.226, 0.21, 0.216])), { k: 0.017, bone: "head", color: body, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.15, 0.53, -0.07]), G.r([0.075, 0.068, 0.08])), { k: 0.02, bone: `cheek${S}`, color: body, group: "core" });
  }
  /* the upper beak: long, dark, curving down to its point (so a camera in
     front still sees its length), melted onto the face */
  const bst = seat(s, H, [0, -0.1, -1]);
  const b0 = outFrom(bst, -0.03);
  const bMid = add(b0, norm([0, -0.2, -1]), 0.17);
  s.part("beak", union([roundCone(b0, bMid, 0.056, 0.03), roundCone(bMid, add(bMid, norm([0, -0.5, -1]), 0.1), 0.03, 0.008)], 0.012),
    { k: 0.012, bone: "head", color: C.beak, fur: 0, fuzz: 0.15, rough: 0.45, group: "beak" });
  /* the crest: five slim dark feathers fanned back off the crown, blue at
     the tips, each its own (a hard join between them, a soft one at the head) */
  const crestBase = seat(s, H, [0, 1, 0.15]);
  const tipShare = (p, x, y, z) => smooth(0.5, 0.85, Math.hypot(x - p[0], y - p[1], z - p[2]) / 0.22);
  [[0, 0.24, 1.15], [-0.05, 0.2, 1.3], [0.05, 0.2, 1.3], [-0.085, 0.16, 1.5], [0.085, 0.16, 1.5]].forEach(([x, l, lean], i) => {
    const a = add(outFrom(crestBase, -0.018), [x * 0.6, 0, -0.02 + i * 0.008]);
    const dir = norm([x * 4.2, 1, lean]);
    const mid = add(add(a, dir, l * 0.5), [0, 0.018, -0.012]);
    const tip = add(a, dir, l);
    const col = (xx, yy, zz) => lerp3(rgb(C.crest), rgb(C.crestTip), tipShare(a, xx, yy, zz));
    s.part(`crest${i}`, union([roundCone(a, mid, 0.019, 0.016), roundCone(mid, tip, 0.016, 0.005)], 0.005), { k: i ? 0.003 : 0.008, bone: "crest", color: col, fur: 0.6, group: "crest" });
  });
  arms(s, rig, { color: body, pawColor: C.top, r0: 0.056, r1: 0.05,
    pawShape: (c, dir, S) => { const fr = frameAlong(dir, [0, 0, -1]); return ellipsoidB(add(c, dir, 0.03), [0.03, 0.075, 0.05], fr); } });
  legs(s, rig, { color: C.leg, footColor: C.leg, r: 0.022, len: 0.14, fur: 0, dir: [0.25, -0.25, -1], footShape: birdFoot(C.leg) });
  /* the long tail, held high over the back rim, pale-tipped */
  const tailAlong = alongShare(tailPts);
  s.part("tail", chain(tailPts, [0.038, 0.052, 0.05, 0.034], 0.012), { k: 0.014, bone: alongPath(tailPts, [["tail", 0], ["tail2", 0.4], ["tail3", 0.8]], 0.3),
    color: (x, y, z) => { const t = tailAlong(x, y, z).t; return t > 0.86 ? rgb(C.tip) : t > 0.8 ? rgb(C.speck) : rgb(C.tail); }, movable: true, group: "tail", fur: 1.2 });
  trunks(s);
  /* streaks down the back, the head and the wings: pale dashes, longer
     than they are wide, each with a dark edge above */
  const streak = rgb(C.streak), speck = rgb(C.speck);
  s.paint((p, n, own, m, group) => {
    if (group("core") + group("arm") < 0.4 || n[2] < -0.55 && p[1] < 0.5) return;
    const back = smooth(-0.25, 0.25, p[2] + n[1] * 0.3);
    if (back <= 0) return;
    const [d] = cells3(p[0] * 17, p[1] * 7, p[2] * 17, 11);
    const [e] = cells3(p[0] * 17, (p[1] - 0.03) * 7, p[2] * 17, 11);
    m.color = lerp3(m.color, speck, (1 - smooth(0.16, 0.24, e)) * back * 0.6);
    m.color = lerp3(m.color, streak, (1 - smooth(0.15, 0.22, d)) * back * 0.92);
  });
  /* the bare skin behind the eye: blue, then orange */
  for (const x of [-1, 1]) {
    patchOn(s, H, [x * 1.0, 0.18, -0.25], G.r([0.05, 0.035, 0.05]), C.blue, { edge: 0.5, fur: 0.1 });
    patchOn(s, H, [x * 1.0, 0.15, 0.25], G.r([0.04, 0.03, 0.04]), C.orange, { edge: 0.5, fur: 0.1 });
    patchOn(s, H, [x * 0.68, -0.12, -0.75], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.7 });
  }
  patchOn(s, H, [0, -0.7, -0.7], G.r([0.14, 0.1, 0.12]), C.belly, { edge: 0.6, only: (p, n, own, g) => g("core") });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.56, pitch: 0.16, w: G.s(0.034), h: G.s(0.04), depth: G.s(0.019) });
      /* the lower beak on the jaw */
      f.spike([outFrom(bst, -0.035).map((v, i) => v + [0, -0.034, 0][i]), add(outFrom(bst, -0.035), [0, -0.078, -0.12]), add(outFrom(bst, -0.035), [0, -0.105, -0.19])],
        { r0: 0.034, r1: 0.008, color: C.jaw, bone: "jaw" });
      f.anchors.mouth = { p: add(outFrom(bst, 0), [0, -0.04, -0.06]).map(v => +v.toFixed(5)) };
    },
    hat: { from: H, skip: ["crest0", "crest1", "crest2", "crest3", "crest4"], tilt: -0.05 },
    chain: { front: 0.34, back: 0.43 },
    fur: { length: 0.0085 },
    info: { crestOverHat: true },
    keepJaw: true,
  };
}

/* ── jackrabbit: the huge ears ── */
function jackrabbit() {
  const s = new Sculpt("jackrabbit");
  const C = { fur: "#c8a179", top: "#b38b62", belly: "#f6eee0", muzzle: "#fbf6ee", tip: "#3a2e28", inner: "#f2a6a8", nose: "#ec8392", teeth: "#ffffff", blush: "#f4a49a", paw: "#efe4cf" };
  const G = grower(1.08, [0, 0.36, -0.03]);
  const H = G.p([0, 0.59, -0.02]);
  const earDir = x => [x * 0.18, 1, 0.16];
  const earBase = x => G.p([x * 0.085, 0.76, 0.0]);
  const rig = skeleton({ eyes: G.p([0, 0.63, -0.18]), mouth: G.p([0, 0.5, -0.2]), ears: earBase(1), ear2: add(earBase(1), norm(earDir(1)), 0.17), cheeks: G.p([0.14, 0.52, -0.1]), tail: [0, 0.14, 0.2] });
  const fur = shade(C.top, C.fur, 0.5, 0.85);
  core(s, { color: fur, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.222, 0.21, 0.212])), { k: 0.017, bone: "head", color: fur, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.14, 0.52, -0.1]), G.r([0.072, 0.065, 0.075])), { k: 0.02, bone: `cheek${S}`, color: fur, group: "core" });
    /* the muzzle: two puffy whisker pads */
    s.part(`pad${S}`, ellipsoid(G.p([x * 0.042, 0.535, -0.19]), G.r([0.054, 0.044, 0.043])), { k: 0.012, bone: "head", color: C.muzzle, group: "muzzle", fur: 0.7 });
    /* the ears: tall and broad, a long soft leaf each */
    const len = G.s(0.36);
    s.part(`ear${S}`, longEar(earBase(x), earDir(x), len, { width: G.s(0.064), thick: G.s(0.026), front: [x * 0.15, 0.1, -1] }),
      { k: 0.016, bone: earBones(S, earBase(x), earDir(x), len), color: fur, group: "ear" });
  }
  arms(s, rig, { color: fur, pawColor: C.paw });
  legs(s, rig, { color: fur, footColor: C.paw, foot: [0.06, 0.046, 0.105] });
  /* the cotton tail */
  s.part("tail", ellipsoid([0, 0.15, 0.21], [0.07, 0.068, 0.062]), { k: 0.012, bone: "tail", color: C.belly, fur: 1.8, movable: true, group: "tail" });
  trunks(s);
  /* the ears' pink insides and dark tips */
  const inner = rgb(C.inner), tipC = rgb(C.tip);
  for (const x of [-1, 1]) {
    const uy = norm(earDir(x)), b = earBase(x), len = G.s(0.36);
    s.paint((p, n, own, m, group) => {
      const g = group("ear");
      if (g < 0.2) return;
      const t = ((p[0] - b[0]) * uy[0] + (p[1] - b[1]) * uy[1] + (p[2] - b[2]) * uy[2]) / len;
      if (Math.sign(p[0]) !== x && Math.abs(p[0]) > 0.02) return;
      const front = smooth(0.2, 0.6, -n[2]) * smooth(0.12, 0.25, t) * (1 - smooth(0.8, 0.9, t));
      if (front > 0) { m.color = lerp3(m.color, inner, front * g * 0.9); m.fur *= 1 - 0.6 * front; }
      const tip = smooth(0.86, 0.94, t) * g;
      if (tip > 0) m.color = lerp3(m.color, tipC, tip);
    });
  }
  patchOn(s, H, [0, -0.6, -0.8], G.r([0.11, 0.09, 0.1]), C.muzzle, { edge: 0.6, only: (p, n, own, g) => g("core") });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.74, -0.08, -0.67], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.7 });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.58, pitch: 0.18, w: G.s(0.034), h: G.s(0.04), depth: G.s(0.019) });
      f.bead({ center: H, dir: [0, -0.05, -1], r: G.r([0.026, 0.019, 0.016]), color: C.nose, rough: 0.35 });
      f.mouth({ center: H, dir: [0, -0.62, -0.78], w: G.s(0.022), curve: G.s(0.006), radius: 0.0042, openW: G.s(0.03), openH: G.s(0.035) });
      for (const x of [-1, 1]) f.block(G.p([x * 0.0115, 0.497, -0.222]), [0.0105, 0.016, 0.0065], { color: C.teeth });
    },
    hat: { from: H, skip: ["earL", "earR"], tilt: -0.04 },
    chain: { front: 0.34, back: 0.43 },
    fur: { length: 0.0095 },
    info: {},
  };
}

/* ── tortoise: the domed shell ── */
function tortoise() {
  const s = new Sculpt("tortoise");
  const C = { skin: "#9db45e", spot: "#7d9443", belly: "#eedd9a", plastron: "#f3e4a2", plastronSeam: "#c7aa62", plate: "#d79b50", plateLo: "#c08038", seam: "#6c4724", rim: "#e6b46a", blush: "#eba07e", beak: "#73703a" };
  const G = grower(1.06, [0, 0.36, -0.06]);
  const H = G.p([0, 0.585, -0.08]);
  const rig = skeleton({ head: [0, 0.42, -0.05], eyes: G.p([0, 0.64, -0.24]), mouth: G.p([0, 0.52, -0.3]), cheeks: G.p([0.14, 0.53, -0.14]) });
  core(s, { color: C.skin, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.212, 0.196, 0.205])), { k: 0.017, bone: "head", color: C.skin, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.14, 0.53, -0.14]), G.r([0.07, 0.062, 0.075])), { k: 0.02, bone: `cheek${S}`, color: C.skin, group: "core" });
  }
  /* the shell: a dome over the back and sides, its front cut back to free
     the arms, a rounded rim, hexagonal plates */
  const dome = trim(ellipsoid([0, 0.245, 0.06], [0.305, 0.285, 0.27]), [[0, 0, -1, 0.02], [0, -1, 0, -0.02]], 0.05);
  const cellsAt = (x, y, z) => cells3(x * 7, y * 7, (z - 0.05) * 7, 3);
  s.part("shell", dome, { k: 0.008, bone: "chest", fur: 0, fuzz: 0.25, rough: 0.6, group: "shell",
    color: (x, y, z) => {
      const [a, b] = cellsAt(x, y, z);
      const seam = 1 - smooth(0.05, 0.11, b - a);
      const c = lerp3(rgb(C.rim), rgb(C.plateLo), smooth(0.1, 0.55, a));
      return lerp3(c, rgb(C.seam), seam);
    } });
  s.part("rim", trim(ellipsoid([0, 0.13, 0.06], [0.32, 0.072, 0.285]), [[0, 0, -1, 0.0]], 0.03), { k: 0.012, bone: "chest", color: C.rim, fur: 0, fuzz: 0.25, rough: 0.6, group: "shell" });
  arms(s, rig, { color: C.skin, pawColor: C.skin, r0: 0.062, r1: 0.054 });
  legs(s, rig, { color: C.skin, footColor: C.skin, r: 0.064, foot: [0.068, 0.058, 0.074] });
  s.part("tail", roundCone([0, 0.07, 0.2], [0, 0.05, 0.28], 0.032, 0.012), { k: 0.01, bone: "tail", color: C.skin, movable: true, group: "tail" });
  trunks(s, { waist: 0.12 });
  /* spots on the head, a pale chin */
  const spot = rgb(C.spot);
  s.paint((p, n, own, m, group) => {
    if (group("core") < 0.5 || p[1] < 0.5 || n[1] < -0.2) return;
    const [d] = cells3(p[0] * 18, p[1] * 18, p[2] * 18, 5);
    const t = (1 - smooth(0.18, 0.26, d)) * smooth(0.55, 0.7, p[1]);
    if (t > 0) m.color = lerp3(m.color, spot, t * 0.8);
  });
  patchOn(s, H, [0, -0.7, -0.7], G.r([0.12, 0.08, 0.1]), C.belly, { edge: 0.6 });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.72, -0.12, -0.68], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.7 });
  /* the plastron: a pale plate down the front, cut into scutes */
  const plastron = rgb(C.plastron), pseam = rgb(C.plastronSeam);
  s.paint((p, n, own, m, group) => {
    if (group("core") < 0.5 || m.tint > 0.5) return;
    const front = smooth(-0.45, -0.75, n[2]) * smooth(0.07, 0.11, p[1]) * (1 - smooth(0.36, 0.41, p[1])) * (1 - smooth(0.12, 0.16, Math.abs(p[0])));
    if (front <= 0) return;
    const line = Math.max(1 - smooth(0.004, 0.009, Math.abs(p[0])), 1 - smooth(0.004, 0.009, Math.abs(p[1] - 0.2)), 1 - smooth(0.004, 0.009, Math.abs(p[1] - 0.29)));
    m.color = lerp3(lerp3(m.color, plastron, front), pseam, front * line * 0.85);
    m.fur *= 1 - 0.6 * front;
  });
  /* tortoises are smooth: short velvet */
  s.paint((p, n, own, m) => { m.fur *= 0.45; });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.5, pitch: 0.17, w: G.s(0.033), h: G.s(0.038), depth: G.s(0.018) });
      f.mouth({ center: H, dir: [0, -0.4, -1], w: G.s(0.05), curve: G.s(0.011), radius: 0.0048 });
      for (const x of [-1, 1]) f.bead({ center: H, dir: [x * 0.12, 0.05, -1], r: [0.008, 0.006, 0.005], color: "#2c2a16", rough: 0.4 });
    },
    hat: { from: H, tilt: -0.04 },
    chain: { front: 0.36, back: 0.45 },
    fur: { length: 0.006 },
    info: {},
  };
}

/* ── gila monster: a coral body with black bands ── */
function gila() {
  const s = new Sculpt("gila");
  const C = { coral: "#f5905e", pink: "#ff9d7a", black: "#2b2528", belly: "#ffb38c", blush: "#ff7f86" };
  const G = grower(1.08, [0, 0.36, -0.04]);
  const H = G.p([0, 0.57, -0.04]);
  const tailPts = [[0, 0.09, 0.15], [0.05, 0.1, 0.3], [0.15, 0.13, 0.42], [0.27, 0.16, 0.46]];
  const rig = skeleton({ eyes: G.p([0, 0.62, -0.2]), mouth: G.p([0, 0.5, -0.29]), cheeks: G.p([0.16, 0.52, -0.08]), tail: tailPts[0], tail2: tailPts[1], tail3: tailPts[2] });
  core(s, { color: C.coral, bellyColor: C.belly, width: 1.06 });
  /* a wide, flattish head */
  s.part("head", trim(ellipsoid(H, G.r([0.255, 0.19, 0.25])), [G.plane([0, 1, 0, 0.73])], 0.05), { k: 0.018, bone: "head", color: C.coral, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.165, 0.515, -0.09]), G.r([0.08, 0.065, 0.085])), { k: 0.02, bone: `cheek${S}`, color: C.coral, group: "core" });
  }
  arms(s, rig, { color: C.coral, pawColor: C.black });
  legs(s, rig, { color: C.coral, footColor: C.black });
  /* the thick tail, curling round to the side */
  s.part("tail", chain(tailPts, [0.075, 0.062, 0.045, 0.026], 0.01), { k: 0.014, bone: alongPath(tailPts, [["tail", 0], ["tail2", 0.45], ["tail3", 0.85]], 0.3), color: C.coral, movable: true, group: "tail" });
  trunks(s);
  /* the beaded pattern: black bands round the body and the tail, black
     blotches on the head, the coral showing through in beads */
  const black = rgb(C.black), pink = rgb(C.pink);
  const tailAlong = alongShare(tailPts);
  s.paint((p, n, own, m, group) => {
    if (m.tint > 0.5) return;
    let t = 0;
    const tail = group("tail");
    if (tail > 0.3) {
      const u = tailAlong(p[0], p[1], p[2]).at;
      t = smooth(0.35, 0.65, 0.5 + 0.5 * Math.sin(u * 42)) * tail;
    } else {
      const wob = 0.9 * (noise3(p[0] * 7, p[1] * 7, p[2] * 7, 4) - 0.5);
      const band = 0.5 + 0.5 * Math.sin(p[1] * 30 + 1.4 + wob);
      /* the bands wrap the body; only a narrow strip down the belly stays coral */
      const wrap = 1 - smooth(0.1, 0.05, Math.abs(p[0])) * smooth(-0.6, -0.85, n[2]);
      t = smooth(0.42, 0.54, band) * wrap * smooth(0.04, 0.09, p[1]);
      if (p[1] > 0.5) {
        const [d] = cells3(p[0] * 15, p[1] * 15, p[2] * 15, 8);
        const cap = smooth(0.52, 0.62, p[1] + 0.06 * n[1]) * smooth(-0.25, 0.05, p[2] + 0.25);
        t = Math.max(t * (1 - cap), cap * smooth(0.18, 0.26, d));
      }
    }
    if (t > 0) m.color = lerp3(m.color, black, t);
    const [d] = cells3(p[0] * 30, p[1] * 30, p[2] * 30, 13);
    const bead = (1 - smooth(0.2, 0.32, d)) * 0.18;
    m.color = lerp3(m.color, pink, bead * (1 - t));
  });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.72, -0.18, -0.67], G.r([0.055, 0.038, 0.05]), C.blush, { edge: 0.85, strength: 0.75 });
  /* beaded skin: short velvet */
  s.paint((p, n, own, m) => { m.fur *= 0.35; });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.62, pitch: 0.28, w: G.s(0.033), h: G.s(0.037), depth: G.s(0.018) });
      f.mouth({ center: H, dir: [0, -0.28, -1], w: G.s(0.11), curve: G.s(0.016), radius: 0.0055, inside: "#5a1f2b" });
      for (const x of [-1, 1]) f.bead({ center: H, dir: [x * 0.13, 0.05, -1], r: [0.008, 0.006, 0.005], color: C.black, rough: 0.4 });
    },
    hat: { from: H, tilt: -0.03 },
    chain: { front: 0.34, back: 0.42 },
    fur: { length: 0.006 },
    info: {},
  };
}

/* ── horned lizard: the crown of soft spikes ── */
function hornedlizard() {
  const s = new Sculpt("hornedlizard");
  const C = { sand: "#dbb27a", dark: "#8f5f3a", light: "#f5e2ba", belly: "#f8ecd2", horn: "#f4e3c0", blush: "#f2a383", stripe: "#9c6a45" };
  const G = grower(1.08, [0, 0.36, -0.03]);
  const H = G.p([0, 0.575, -0.03]);
  const rig = skeleton({ eyes: G.p([0, 0.63, -0.19]), mouth: G.p([0, 0.5, -0.27]), cheeks: G.p([0.16, 0.52, -0.08]), crest: G.p([0, 0.68, 0.14]) });
  core(s, { color: C.sand, bellyColor: C.belly, width: 1.1 });
  s.part("head", trim(ellipsoid(H, G.r([0.258, 0.195, 0.222])), [G.plane([0, 1, 0, 0.745])], 0.05), { k: 0.017, bone: "head", color: C.sand, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.17, 0.52, -0.06]), G.r([0.08, 0.066, 0.085])), { k: 0.02, bone: `cheek${S}`, color: C.sand, group: "core" });
  }
  /* the crown: two long horns at the back, smaller ones fanning round it */
  const horns = [[Math.PI - 0.32, 0.5, 0.17, 0.034], [Math.PI + 0.32, 0.5, 0.17, 0.034], [Math.PI - 0.78, 0.36, 0.12, 0.028], [Math.PI + 0.78, 0.36, 0.12, 0.028],
    [Math.PI - 1.22, 0.22, 0.095, 0.024], [Math.PI + 1.22, 0.22, 0.095, 0.024], [Math.PI, 0.72, 0.085, 0.024], [Math.PI - 1.62, 0.08, 0.075, 0.02], [Math.PI + 1.62, 0.08, 0.075, 0.02]];
  horns.forEach(([yaw, pitch, len, r], i) => {
    const d = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const st = seat(s, H, d);
    const base = outFrom(st, -0.015);
    const out = norm([st.n[0], st.n[1] + 0.45, st.n[2] + 0.15]);
    s.part(`horn${i}`, roundCone(base, add(base, out, len), r, 0.009), { k: 0.01, bone: "crest", color: C.horn, fur: 0.15, fuzz: 0.6, rough: 0.75, group: "horn" });
  });
  /* the fringe of little spikes down each side */
  for (const x of [-1, 1]) for (let i = 0; i < 4; i++) {
    const st = seat(s, [0, 0.2, 0.01], [x, -0.12 + i * 0.13, 0.12 - i * 0.05]);
    const base = outFrom(st, -0.01);
    s.part(`fringe${x}${i}`, roundCone(base, add(base, norm([st.n[0], st.n[1] + 0.2, st.n[2]]), 0.045), 0.018, 0.007), { k: 0.008, bone: "chest", color: C.light, fur: 0.2, group: "horn" });
  }
  arms(s, rig, { color: C.sand, pawColor: C.light });
  legs(s, rig, { color: C.sand, footColor: C.light });
  s.part("tail", roundCone([0, 0.08, 0.18], [0, 0.06, 0.29], 0.055, 0.016), { k: 0.012, bone: "tail", color: C.sand, movable: true, group: "tail" });
  trunks(s);
  /* dark spots down the back, a dark tear stripe under each eye */
  const dark = rgb(C.dark);
  s.paint((p, n, own, m, group) => {
    if (group("core") < 0.5 || m.tint > 0.5) return;
    const [d] = cells3(p[0] * 11, p[1] * 11, p[2] * 11, 9);
    const t = (1 - smooth(0.22, 0.32, d)) * smooth(-0.05, 0.25, p[2] + 0.2 * n[1]);
    if (t > 0) m.color = lerp3(m.color, dark, t * 0.75);
  });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.6, -0.12, -0.8], G.r([0.022, 0.05, 0.03]), C.stripe, { edge: 0.4 });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.76, -0.2, -0.62], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.7 });
  /* short velvet */
  s.paint((p, n, own, m) => { m.fur *= 0.5; });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.55, pitch: 0.2, w: G.s(0.034), h: G.s(0.038), depth: G.s(0.018) });
      f.mouth({ center: H, dir: [0, -0.3, -1], w: G.s(0.1), curve: G.s(0.016), radius: 0.0052 });
    },
    hat: { from: H, skip: horns.map((_, i) => `horn${i}`), tilt: -0.04 },
    chain: { front: 0.34, back: 0.42 },
    fur: { length: 0.006 },
    info: {},
  };
}

/* ── bighorn: the curled horns ── */
function bighorn() {
  const s = new Sculpt("bighorn");
  const C = { fur: "#93725a", top: "#775b48", muzzle: "#f5eee3", horn: "#ead9b1", ridge: "#a8865b", nose: "#3a2a23", inner: "#e9b9a3", hoof: "#2f2723", blush: "#f0a08a" };
  const G = grower(1.08, [0, 0.36, -0.03]);
  const H = G.p([0, 0.59, -0.025]);
  const rig = skeleton({ eyes: G.p([0, 0.64, -0.19]), mouth: G.p([0, 0.5, -0.3]), ears: G.p([0.2, 0.64, 0.04]), ear2: G.p([0.27, 0.62, 0.05]), cheeks: G.p([0.15, 0.53, -0.08]), tail: [0, 0.16, 0.19] });
  const fur = shade(C.top, C.fur, 0.45, 0.85);
  core(s, { color: fur, bellyColor: C.muzzle });
  s.part("head", ellipsoid(H, G.r([0.218, 0.207, 0.226])), { k: 0.017, bone: "head", color: fur, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.15, 0.53, -0.08]), G.r([0.072, 0.066, 0.078])), { k: 0.02, bone: `cheek${S}`, color: fur, group: "core" });
  }
  /* a pale muzzle, broad and soft */
  s.part("muzzle", ellipsoid(G.p([0, 0.535, -0.205]), G.r([0.122, 0.104, 0.108])), { k: 0.02, bone: "head", color: C.muzzle, group: "muzzle" });
  /* the horns: thick at the crown, curling back, down and forward round the ears */
  const curls = [];
  for (const x of [-1, 1]) {
    const st = seat(s, H, [x * 0.55, 0.8, 0.0]);
    const base = outFrom(st, -0.02);
    const pts = curl(base, { out: [x, 0, 0], turns: 0.9, grow: G.s(0.158) });
    const radii = pts.map((_, i) => G.s(0.076 + (0.026 - 0.076) * (i / (pts.length - 1)) ** 0.9));
    const along = alongShare(pts);
    s.part(`horn${x}`, chain(pts, radii, 0.006), { k: 0.008, bone: "head", fur: 0, fuzz: 0.05, rough: 0.42, group: "horn",
      color: (xx, yy, zz) => { const a = along(xx, yy, zz).at; return lerp3(rgb(C.horn), rgb(C.ridge), smooth(0.3, 0.7, 0.5 + 0.5 * Math.sin(a * 95))); } });
    curls.push(`horn${x}`);
  }
  /* small ears out to the sides under the horns */
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    const st = seat(s, H, [x, -0.05, 0.15]);
    const base = outFrom(st, -0.01);
    s.part(`ear${S}`, longEar(base, [x, -0.25, 0.1], G.s(0.1), { width: G.s(0.034), thick: G.s(0.016), front: [0, 0.4, -1] }), { k: 0.01, bone: earBones(S, base, [x, -0.25, 0.1], G.s(0.1)), color: fur, group: "ear" });
  }
  arms(s, rig, { color: fur, pawColor: C.hoof });
  legs(s, rig, { color: fur, footColor: C.hoof });
  s.part("tail", ellipsoid([0, 0.17, 0.19], [0.05, 0.045, 0.04]), { k: 0.01, bone: "tail", color: C.muzzle, movable: true, group: "tail" });
  trunks(s);
  for (const x of [-1, 1]) patchOn(s, H, [x * 1, -0.1, 0.2], G.r([0.03, 0.02, 0.03]), C.inner, { edge: 0.5, fur: 0.3, only: (p, n, own, g) => g("ear") });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.72, -0.08, -0.7], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.7 });
  patchOn(s, [0, 0.22, 0], [0, -0.1, -1], [0.15, 0.13, 0.1], C.muzzle, { edge: 0.7 });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.52, pitch: 0.17, w: G.s(0.033), h: G.s(0.038), depth: G.s(0.018) });
      f.bead({ center: G.p([0, 0.535, -0.205]), dir: [0, 0.35, -1], r: G.r([0.036, 0.024, 0.02]), color: C.nose, rough: 0.35 });
      f.mouth({ center: G.p([0, 0.535, -0.205]), dir: [0, -0.5, -0.86], w: G.s(0.032), curve: G.s(0.009), radius: 0.0048 });
    },
    hat: { from: H, skip: curls, tilt: -0.04 },
    chain: { front: 0.34, back: 0.43 },
    fur: { length: 0.0095 },
    info: {},
  };
}

/* ── quail: the teardrop topknot plume ── */
function quail() {
  const s = new Sculpt("quail");
  const C = { body: "#8892ab", wing: "#727d96", belly: "#f1e4c4", scale: "#c9b48c", face: "#262226", white: "#fbf7ee", crown: "#b9673c", plume: "#211d23", beak: "#57545f", flank: "#a05d38", leg: "#a2917f", blush: "#f4a49a" };
  const G = grower(1.08, [0, 0.36, -0.02]);
  const H = G.p([0, 0.6, -0.02]);
  const rig = skeleton({ eyes: G.p([0, 0.65, -0.17]), mouth: G.p([0, 0.56, -0.26]), jaw: G.p([0, 0.555, -0.2]), crest: G.p([0, 0.8, -0.06]), cheeks: G.p([0.14, 0.54, -0.07]),
    arm: { a: 0.112, b: 0.112, dir: [0.58, -0.8, -0.04] }, tail: [0, 0.14, 0.17] });
  core(s, { color: C.body, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.212, 0.203, 0.207])), { k: 0.017, bone: "head", color: C.body, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.14, 0.54, -0.07]), G.r([0.07, 0.064, 0.074])), { k: 0.02, bone: `cheek${S}`, color: C.body, group: "core" });
  }
  /* the little dark beak */
  const bst = seat(s, H, [0, -0.15, -1]);
  const b0 = outFrom(bst, -0.02);
  s.part("beak", roundCone(b0, add(b0, norm([0, -0.5, -1]), 0.088), 0.04, 0.012), { k: 0.01, bone: "head", color: C.beak, fur: 0, fuzz: 0.15, rough: 0.42, group: "beak" });
  /* the plume: a stalk curling forward off the crown, a teardrop at its end */
  const pst = seat(s, H, [0, 1, 0.12]);
  const p0 = outFrom(pst, -0.02);
  const stalk = [p0, add(p0, [0, G.s(0.08), -0.005]), add(p0, [0, G.s(0.15), -0.04]), add(p0, [0, G.s(0.18), -0.1])];
  const drop = add(p0, [0, G.s(0.17), -0.155]);
  s.part("plume", union([chain(stalk, [0.017, 0.014, 0.013, 0.013], 0.006), ellipsoidB(drop, [0.034, 0.054, 0.03], frameAlong([0, -0.45, -1], [0, 1, 0]))], 0.012),
    { k: 0.012, bone: "crest", color: C.plume, fur: 0.35, group: "plume" });
  arms(s, rig, { color: C.wing, pawColor: C.wing, r0: 0.058, r1: 0.05,
    pawShape: (c, dir, S) => { const fr = frameAlong(dir, [0, 0, -1]); return ellipsoidB(add(c, dir, 0.03), [0.03, 0.075, 0.05], fr); } });
  legs(s, rig, { color: C.leg, footColor: C.leg, r: 0.022, len: 0.14, fur: 0, dir: [0.25, -0.25, -1], footShape: birdFoot(C.leg) });
  s.part("tail", roundCone([0, 0.14, 0.17], [0, 0.22, 0.29], 0.05, 0.03), { k: 0.012, bone: "tail", color: C.wing, movable: true, group: "tail" });
  trunks(s);
  /* the chestnut crown, white brows, the scaled belly, the flanks */
  const scale = rgb(C.scale), flank = rgb(C.flank), white = rgb(C.white);
  patchOn(s, H, [0, 1, 0.2], G.r([0.17, 0.08, 0.17]), C.crown, { edge: 0.6, only: (p, n, own, g) => g("core") });
  /* the black bib on the throat, a thin white collar round it */
  for (const x of [-1, 1]) {
    patchOn(s, H, [x * 0.5, 0.42, -1], G.r([0.1, 0.016, 0.06]), C.white, { edge: 0.4 });
    patchOn(s, H, [x * 0.7, 0.0, -0.7], G.r([0.045, 0.032, 0.045]), C.blush, { edge: 0.85, strength: 0.6 });
  }
  s.paint((p, n, own, m, group) => {
    if (group("core") < 0.5 || m.tint > 0.5) return;
    /* scallops on the belly */
    const belly = smooth(-0.3, -0.6, n[2]) * (1 - smooth(0.3, 0.36, p[1]));
    if (belly > 0) {
      const [a, b] = cells3(p[0] * 22, p[1] * 22, p[2] * 22, 21);
      m.color = lerp3(m.color, scale, belly * (1 - smooth(0.04, 0.09, b - a)) * 0.25);
    }
    /* chestnut flanks with a few white streaks */
    const side = smooth(0.55, 0.8, Math.abs(n[0])) * (1 - smooth(0.3, 0.36, p[1])) * smooth(0.06, 0.12, p[1]) * smooth(-0.1, 0.05, p[2]);
    if (side > 0) {
      m.color = lerp3(m.color, flank, side * 0.85);
      const streak = smooth(0.9, 0.97, 0.5 + 0.5 * Math.sin((p[1] * 0.5 - p[2]) * 48));
      m.color = lerp3(m.color, white, side * streak * 0.85);
    }
  });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.55, pitch: 0.2, w: G.s(0.034), h: G.s(0.039), depth: G.s(0.019) });
      f.spike([add(b0, [0, -0.03, 0.01]), add(b0, [0, -0.044, -0.03]), add(b0, [0, -0.055, -0.055])], { r0: 0.022, r1: 0.006, color: C.beak, bone: "jaw" });
      f.anchors.mouth = { p: add(b0, [0, -0.03, -0.04]).map(v => +v.toFixed(5)) };
    },
    hat: { from: H, skip: ["plume"], tilt: -0.04 },
    chain: { front: 0.345, back: 0.43 },
    fur: { length: 0.0085 },
    info: { crestOverHat: true },
    keepJaw: true,
  };
}

/* ── armadillo: the soft banded armour ── */
function armadillo() {
  const s = new Sculpt("armadillo");
  const C = { skin: "#d4a995", band: "#a39181", bandLo: "#8c7a69", seam: "#5c4a40", inner: "#f2b6a9", nose: "#5d403a", belly: "#f2d0bd", blush: "#f39a8a" };
  const G = grower(1.06, [0, 0.36, -0.03]);
  const H = G.p([0, 0.585, -0.03]);
  const rig = skeleton({ eyes: G.p([0, 0.63, -0.19]), mouth: G.p([0, 0.5, -0.3]), ears: G.p([0.13, 0.76, 0.05]), ear2: G.p([0.16, 0.85, 0.06]), cheeks: G.p([0.14, 0.53, -0.08]), tail: [0, 0.07, 0.18], tail2: [0.0, 0.05, 0.3], tail3: [0.05, 0.05, 0.42] });
  core(s, { color: C.skin, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.205, 0.195, 0.205])), { k: 0.017, bone: "head", color: C.skin, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.135, 0.53, -0.08]), G.r([0.068, 0.062, 0.072])), { k: 0.02, bone: `cheek${S}`, color: C.skin, group: "core" });
    /* tall oval ears */
    const st = seat(s, H, [x * 0.55, 0.82, 0.25]);
    const base = outFrom(st, -0.012);
    s.part(`ear${S}`, longEar(base, [x * 0.35, 1, 0.1], G.s(0.13), { width: G.s(0.048), thick: G.s(0.018), front: [x * 0.4, 0, -1], taper: 0.8 }),
      { k: 0.012, bone: earBones(S, base, [x * 0.35, 1, 0.1], G.s(0.13)), color: C.skin, group: "ear" });
  }
  /* the long tapered snout, a nose at its tip */
  s.part("snout", roundCone(G.p([0, 0.565, -0.12]), G.p([0, 0.525, -0.37]), G.s(0.092), G.s(0.042)), { k: 0.024, bone: "head", color: C.skin, group: "snout" });
  /* the head shield */
  s.part("shield", ellipsoid(G.p([0, 0.74, -0.045]), G.r([0.15, 0.062, 0.17]), [0.22, 0, 0]), { k: 0.01, bone: "head", fur: 0, fuzz: 0.35, rough: 0.66, group: "armour",
    color: (x, y, z) => lerp3(rgb(C.band), rgb(C.seam), smooth(0.6, 0.95, Math.cos((z + 0.05) * 58))) });
  /* the shell: a dome over the back in soft transverse bands */
  const dome = trim(ellipsoid([0, 0.245, 0.06], [0.29, 0.27, 0.255]), [[0, 0, -1, 0.0], [0, -1, 0, -0.06]], 0.05);
  const bandsAt = (x, y, z) => Math.atan2(y - 0.1, z - 0.05);
  const banded = { lo: dome.lo, hi: dome.hi, f: (x, y, z) => dome.f(x, y, z) + 0.006 * (1 - Math.cos(bandsAt(x, y, z) * 22)) };
  s.part("shell", banded, { k: 0.008, bone: "chest", fur: 0.05, fuzz: 0.45, rough: 0.7, group: "armour",
    color: (x, y, z) => { const c = Math.cos(bandsAt(x, y, z) * 22); return lerp3(lerp3(rgb(C.band), rgb(C.bandLo), smooth(-0.2, 0.6, Math.sin(bandsAt(x, y, z) * 11))), rgb(C.seam), smooth(0.55, 0.95, c)); } });
  arms(s, rig, { color: C.skin, pawColor: C.skin });
  legs(s, rig, { color: C.skin, footColor: C.skin });
  const tailPts = [[0, 0.07, 0.18], [0, 0.05, 0.3], [0.05, 0.05, 0.42], [0.12, 0.07, 0.5]];
  const tailAlong = alongShare(tailPts);
  s.part("tail", chain(tailPts, [0.05, 0.04, 0.026, 0.012], 0.008), { k: 0.012, bone: alongPath(tailPts, [["tail", 0], ["tail2", 0.45], ["tail3", 0.85]], 0.3), movable: true, group: "tail", fur: 0, fuzz: 0.45,
    color: (x, y, z) => lerp3(rgb(C.band), rgb(C.seam), smooth(0.5, 0.9, Math.cos(tailAlong(x, y, z).at * 75))) });
  trunks(s, { waist: 0.12 });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.55, 0.82, 0.25], G.r([0.028, 0.06, 0.03]), C.inner, { edge: 0.5, fur: 0.2, only: (p, n, own, g) => g("ear") * smooth(0.1, 0.5, -n[2]) });
  /* the shoulders' armour: banded plates over the tops of the arms */
  const armBand = rgb(C.band), armSeam = rgb(C.seam);
  s.paint((p, n, own, m, group) => {
    const arm = group("arm");
    if (arm < 0.3) return;
    const top = smooth(0.19, 0.25, p[1]) * arm;
    if (top <= 0) return;
    const seam = smooth(0.55, 0.92, Math.cos(Math.hypot(p[0], p[2]) * 75));
    m.color = lerp3(m.color, lerp3(armBand, armSeam, seam), top);
    m.fur *= 1 - 0.85 * top;
    m.fuzz = m.fuzz * (1 - 0.4 * top);
  });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.72, -0.1, -0.7], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.7 });
  /* soft skin: short velvet */
  s.paint((p, n, own, m) => { m.fur *= 0.45; });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.52, pitch: 0.2, w: G.s(0.032), h: G.s(0.037), depth: G.s(0.018) });
      f.bead({ center: G.p([0, 0.53, -0.3]), dir: [0, 0, -1], r: G.r([0.036, 0.03, 0.024]), color: C.nose, rough: 0.35 });
      f.mouth({ center: G.p([0, 0.54, -0.2]), dir: [0, -0.7, -0.6], w: G.s(0.03), curve: G.s(0.008), radius: 0.0046 });
    },
    hat: { from: H, skip: ["earL", "earR"], tilt: -0.04 },
    chain: { front: 0.36, back: 0.45 },
    fur: { length: 0.006 },
    info: {},
  };
}

/* ── coyote: the tall ears and the brush tail ── */
function coyote() {
  const s = new Sculpt("coyote");
  const C = { fur: "#c98f57", back: "#a8907c", cream: "#f6e8cd", nose: "#1f1a1a", inner: "#f5dcc0", tip: "#2b2320", blush: "#f2a08a", paw: "#ead6b3" };
  const G = grower(1.08, [0, 0.36, -0.03]);
  const H = G.p([0, 0.59, -0.015]);
  const earBase = x => G.p([x * 0.13, 0.755, 0.02]);
  const earDir = x => [x * 0.3, 1, 0.08];
  const tailPts = [[0, 0.1, 0.16], [0.06, 0.17, 0.3], [0.1, 0.33, 0.38], [0.08, 0.51, 0.36]];
  const rig = skeleton({ eyes: G.p([0, 0.64, -0.19]), mouth: G.p([0, 0.51, -0.3]), ears: earBase(1), ear2: add(earBase(1), norm(earDir(1)), 0.1), cheeks: G.p([0.15, 0.53, -0.07]),
    tail: tailPts[0], tail2: tailPts[1], tail3: tailPts[2] });
  const fur = (x, y, z) => lerp3(rgb(C.fur), rgb(C.back), smooth(0.0, 0.25, z) * smooth(0.25, 0.6, y) * 0.8);
  core(s, { color: fur, bellyColor: C.cream });
  s.part("head", ellipsoid(H, G.r([0.222, 0.202, 0.212])), { k: 0.017, bone: "head", color: C.fur, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.158, 0.525, -0.06]), G.r([0.08, 0.068, 0.08])), { k: 0.02, bone: `cheek${S}`, color: C.cream, group: "core", fur: 1.3 });
    /* tall pointed ears */
    const len = G.s(0.2);
    s.part(`ear${S}`, union([longEar(earBase(x), earDir(x), len * 0.8, { width: G.s(0.072), thick: G.s(0.028), front: [x * 0.2, 0, -1], taper: 0.55 }),
      roundCone(add(earBase(x), norm(earDir(x)), len * 0.55), add(earBase(x), norm(earDir(x)), len), G.s(0.034), 0.006)], 0.02),
      { k: 0.016, bone: earBones(S, earBase(x), earDir(x), len), color: C.fur, group: "ear" });
  }
  /* the snout: tapered, cream, a glossy nose at its tip */
  s.part("snout", roundCone(G.p([0, 0.56, -0.13]), G.p([0, 0.53, -0.315]), G.s(0.1), G.s(0.05)), { k: 0.024, bone: "head", color: C.cream, group: "snout" });
  arms(s, rig, { color: C.fur, pawColor: C.paw });
  legs(s, rig, { color: C.fur, footColor: C.paw });
  /* the brush: thick, held up behind, black-tipped */
  const tailAlong = alongShare(tailPts);
  s.part("tail", chain(tailPts, [0.05, 0.085, 0.09, 0.05], 0.02), { k: 0.016, bone: alongPath(tailPts, [["tail", 0], ["tail2", 0.4], ["tail3", 0.8]], 0.3), movable: true, group: "tail", fur: 2.2,
    color: (x, y, z) => { const t = tailAlong(x, y, z).t; return t > 0.82 ? rgb(C.tip) : lerp3(rgb(C.fur), rgb(C.back), 0.3); } });
  trunks(s);
  const inner = rgb(C.inner), tipC = rgb(C.tip);
  for (const x of [-1, 1]) {
    const uy = norm(earDir(x)), b = earBase(x), len = G.s(0.2);
    s.paint((p, n, own, m, group) => {
      const g = group("ear");
      if (g < 0.2 || (Math.sign(p[0]) !== x && Math.abs(p[0]) > 0.02)) return;
      const t = ((p[0] - b[0]) * uy[0] + (p[1] - b[1]) * uy[1] + (p[2] - b[2]) * uy[2]) / len;
      const front = smooth(0.2, 0.6, -n[2]) * smooth(0.1, 0.25, t) * (1 - smooth(0.75, 0.85, t));
      if (front > 0) { m.color = lerp3(m.color, inner, front * g); m.fur *= 1 + front * 0.4; }
      const tip = smooth(0.82, 0.92, t) * g;
      if (tip > 0) m.color = lerp3(m.color, tipC, tip);
    });
  }
  patchOn(s, [0, 0.24, 0], [0, 0.1, -1], [0.14, 0.15, 0.1], C.cream, { edge: 0.7 });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.72, -0.08, -0.7], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.6 });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.5, pitch: 0.18, w: G.s(0.032), h: G.s(0.038), depth: G.s(0.018) });
      f.bead({ center: G.p([0, 0.55, -0.2]), dir: [0, 0.15, -1], r: G.r([0.036, 0.027, 0.025]), color: C.nose, rough: 0.25 });
      f.mouth({ center: G.p([0, 0.55, -0.2]), dir: [0, -0.62, -0.78], w: G.s(0.034), curve: G.s(0.009), radius: 0.0046 });
    },
    hat: { from: H, skip: ["earL", "earR"], tilt: -0.04 },
    chain: { front: 0.34, back: 0.43 },
    fur: { length: 0.01 },
    info: {},
  };
}

/* ── otter: the sleek round head and the whiskers ── */
function otter() {
  const s = new Sculpt("otter");
  const C = { fur: "#7d5437", dark: "#5f3e28", face: "#efdcbd", belly: "#a98260", nose: "#2b1c17", whisker: "#fffaf0", blush: "#f2a08a", inner: "#4a3022" };
  const G = grower(1.08, [0, 0.36, -0.03]);
  const H = G.p([0, 0.59, -0.02]);
  const tailPts = [[0, 0.08, 0.16], [0.02, 0.06, 0.3], [0.08, 0.06, 0.42], [0.16, 0.08, 0.48]];
  const rig = skeleton({ eyes: G.p([0, 0.63, -0.19]), mouth: G.p([0, 0.49, -0.2]), ears: G.p([0.19, 0.7, 0.04]), cheeks: G.p([0.15, 0.53, -0.08]), tail: tailPts[0], tail2: tailPts[1], tail3: tailPts[2] });
  core(s, { color: C.fur, bellyColor: C.belly });
  s.part("head", ellipsoid(H, G.r([0.236, 0.2, 0.214])), { k: 0.017, bone: "head", color: C.fur, group: "core" });
  for (const S of ["L", "R"]) {
    const x = S === "L" ? -1 : 1;
    s.part(`cheek${S}`, ellipsoid(G.p([x * 0.155, 0.525, -0.08]), G.r([0.078, 0.066, 0.078])), { k: 0.02, bone: `cheek${S}`, color: C.fur, group: "core" });
    /* the whisker pads */
    s.part(`pad${S}`, ellipsoid(G.p([x * 0.05, 0.535, -0.2]), G.r([0.06, 0.049, 0.047])), { k: 0.012, bone: "head", color: C.face, group: "muzzle", fur: 0.6 });
    /* tiny round ears low on the sides */
    const st = seat(s, H, [x * 0.9, 0.42, 0.25]);
    s.part(`ear${S}`, ellipsoid(outFrom(st, 0.004), G.r([0.034, 0.034, 0.018]), [0.1, x * 0.6, x * 0.7]), { k: 0.008, bone: `ear${S}`, color: C.fur, group: "ear" });
  }
  arms(s, rig, { color: C.fur, pawColor: C.dark });
  legs(s, rig, { color: C.fur, footColor: C.dark, foot: [0.064, 0.042, 0.08] });
  s.part("tail", chain(tailPts, [0.062, 0.05, 0.034, 0.016], 0.01), { k: 0.012, bone: alongPath(tailPts, [["tail", 0], ["tail2", 0.45], ["tail3", 0.85]], 0.3), movable: true, group: "tail", color: C.dark });
  trunks(s);
  patchOn(s, H, [0, -0.38, -1], G.r([0.17, 0.12, 0.12]), C.face, { edge: 0.6, only: (p, n, own, g) => g("core") + g("muzzle") });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.9, 0.42, 0.25], G.r([0.02, 0.02, 0.02]), C.inner, { edge: 0.5, only: (p, n, own, g) => g("ear") });
  for (const x of [-1, 1]) patchOn(s, H, [x * 0.74, -0.06, -0.67], G.r([0.05, 0.035, 0.05]), C.blush, { edge: 0.85, strength: 0.6 });
  /* sleek: short fur */
  s.paint((p, n, own, m) => { m.fur *= 0.6; });
  return {
    sculpt: s, rig, head: H,
    face(f) {
      f.eyes({ center: H, yaw: 0.5, pitch: 0.2, w: G.s(0.033), h: G.s(0.038), depth: G.s(0.018) });
      f.bead({ center: H, dir: [0, -0.03, -1], r: G.r([0.044, 0.028, 0.024]), color: C.nose, rough: 0.3, rot: [-0.2, 0, 0] });
      f.mouth({ center: H, dir: [0, -0.6, -0.8], w: G.s(0.028), curve: G.s(0.008), radius: 0.0044 });
      for (const x of [-1, 1]) for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.22;
        f.line([G.p([x * 0.075, 0.545 + i * 0.008, -0.232]), G.p([x * 0.155, 0.55 + a * 0.12, -0.226]), G.p([x * 0.21, 0.545 + a * 0.3, -0.2])], { r: 0.0026, color: C.whisker });
      }
    },
    hat: { from: H, tilt: -0.04 },
    chain: { front: 0.34, back: 0.43 },
    fur: { length: 0.0065 },
    info: {},
  };
}

export const SPECIES = { capybara, javelina, roadrunner, jackrabbit, tortoise, gila, hornedlizard, bighorn, quail, armadillo, coyote, otter, frog };
export const BAKED = Object.keys(SPECIES);
