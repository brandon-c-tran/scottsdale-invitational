/* The thirteen critters as sculpts (bake time only; float/shared/looks.js
   has their ids). Each is one soft plush mass on the shared body plan
   (plan.js): a big round head melted onto a pear of a body, stubby limbs,
   and what makes the species read at a glance from across the room: the
   capybara's loaf of a head, the javelina's pig snout and bristly collar,
   the frog's eyes on top, and so on. Colors melt the way the surfaces do.

   A species returns { sculpt, rig, head, face(features), hat, chain, fur,
   info }: head is the head's centre (the face is found by casting from it),
   face adds the eyes and mouths, hat and chain say where those sit. */
import { Sculpt, ellipsoid, roundCone, roundBox, chain, warp, union, trim, smooth, rgb, lerp3, noise3, fbm3, cells3, clamp } from "./sdf.js";
import { skeleton, spine, arms, legs, trunks, patch, patchOn, shade, norm, add, seat, outFrom, grower } from "./plan.js";

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
    hat: { from: G.p([0, 0.6, -0.03]), skip: ["earL", "earR"], s: 1.12, tilt: -0.05, sink: 0.03 },
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
    hat: { from: G.p([0, 0.6, -0.02]), skip: ["earL", "earR", ...Array.from({ length: 8 }, (_, i) => `mane${i}`)], s: 1.12, tilt: -0.05, sink: 0.04 },
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
    hat: { from: G.p([0, 0.6, 0.02]), skip: ["turretL", "turretR"], s: 1.06, tilt: 0.1, back: 0.05, sink: 0.02 },
    chain: { front: 0.315, back: 0.39 },
    fur: { length: 0.004 },
    info: {},
  };
}

export const SPECIES = { capybara, javelina, frog };
export const BAKED = Object.keys(SPECIES);
