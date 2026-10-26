/* The floaties (float/shared/floaties.js): eight inflatables, each a shape
   that says what it is. Shiny PVC (pvc material, vertex colors), the rider's
   color as trim (one tint mesh), the rider's number on its sides and back
   (the badge texture's decal).

   A floatie: root (the screen moves it) > bob (bobbing, tilting) > hull
   (the meshes; it flips) and seat (where the critter sits, never flipped).
   Its origin is the water line under its centre, facing -z. seatInfo tells
   the critter how to sit: where its hands rest, how far out a stroke
   catches, how its legs lie. */
import * as THREE from "three";
import { torus, tube, ball, blob, blobGeometry, patchGeometry, lathe, extrude, xf, paint, merge, indexed, orient } from "./sculpt.js";
import { pvc, tint, releaseTint, geometry, normalHex } from "./materials.js";
import { BADGE_UV } from "./badge.js";
import { mulberry } from "./critter.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/* a patch on a torus' surface with uvs into the badge's decal: the number
   reads from outside, upright */
function torusDecal({ R, r, y = 0, u, du = 0.22, dv = 0.42, v = 0, lift = 0.004, n = 8 }) {
  const pos = [], nor = [], uv = [], idx = [];
  const { u0, u1, v0, v1 } = BADGE_UV.decal;
  for (let j = 0; j <= n; j++) {
    const tv = j / n, vv = v - dv / 2 + tv * dv;
    for (let i = 0; i <= n; i++) {
      const tu = i / n, uu = u - du / 2 + tu * du;
      const rr = r + lift;
      const cx = Math.cos(uu), cz = -Math.sin(uu);
      pos.push((R + rr * Math.cos(vv)) * cx, y + rr * Math.sin(vv), (R + rr * Math.cos(vv)) * cz);
      nor.push(Math.cos(vv) * cx, Math.sin(vv), Math.cos(vv) * cz);
      uv.push(u0 + tu * (u1 - u0), v0 + tv * (v1 - v0));
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + n + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = indexed(pos, nor, idx);
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return orient(geo);
}

/* a flat decal (a box side, a raft's edge): centre c, right and up unit vectors, size */
function flatDecal(c, right, up, w, h, lift = 0.003) {
  const n = new THREE.Vector3().crossVectors(right, up).normalize();
  const { u0, u1, v0, v1 } = BADGE_UV.decal;
  const p = [], nn = [], uv = [];
  for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    const q = c.clone().addScaledVector(right, a * w).addScaledVector(up, b * h).addScaledVector(n, lift);
    p.push(q.x, q.y, q.z); nn.push(n.x, n.y, n.z); uv.push(a < 0 ? u0 : u1, b < 0 ? v0 : v1);
  }
  const geo = indexed(p, nn, [0, 1, 2, 0, 2, 3]);
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

const SEG = { race: { R: 30, r: 12, ball: [11, 8], limb: [8, 9], extrude: [5, 1], hero: false }, hero: { R: 64, r: 24, ball: [20, 14], limb: [12, 16], extrude: [10, 2], hero: true } };

/* ── the eight ── each returns { body: [painted parts], trim: [parts], decals: [parts], seat, info } */

const RING_SEAT = { kind: "ring", seatY: 0.04, seatZ: 0.02, rest: [0.34, 0.2, -0.02], water: -0.04, out: 0.74, legRX: 0.34, lean: 0.07 };

function ringDecals(R, r, y, lift = 0.004) {
  return [0, Math.PI, Math.PI * 1.5].map(u => torusDecal({ R, r, y, u, du: 0.34, dv: 0.62, v: 0.08, lift }));
}

function classic(s) {
  const R = 0.5, r = 0.2, y = 0.07;
  const rubber = "#24262d";
  const body = [xf(paint(torus({ R, r, radial: s.r, tubular: s.R }), rubber), { at: [0, y, 0] })];
  /* the valve, back right on top */
  const vu = -0.45, vx = Math.cos(vu) * R, vz = -Math.sin(vu) * R;
  body.push(paint(xf(lathe([[0, 0], [0.032, 0], [0.032, 0.03], [0.022, 0.04], [0.018, 0.075], [0.022, 0.08], [0, 0.085]], { segments: 12 }), { at: [vx, y + r - 0.012, vz] }), "#2e3038"));
  body.push(paint(xf(ball([0.024, 0.012, 0.024], { w: 10, h: 6 }), { at: [vx, y + r + 0.07, vz] }), "#c7ccd4"));
  /* the rider's stripe round the top */
  const trim = [xf(torus({ R, r: r + 0.004, radial: 3, tubular: s.R, vArc: [1.18, 0.78] }), { at: [0, y, 0] })];
  return { body, trim, decals: ringDecals(R, r, y), seat: RING_SEAT };
}

function donut(s) {
  const R = 0.5, r = 0.215, y = 0.07;
  const dough = "#e4a75f", doughDark = "#c98a44";
  const rand = mulberry("donut");
  const body = [xf(paint(torus({ R, r, radial: s.r, tubular: s.R }), (p) => new THREE.Color(p.y < y - 0.05 ? doughDark : dough)), { at: [0, y, 0] })];
  /* frosting with drips over the outer side */
  const drip = u => 0.16 * Math.max(0, Math.sin(u * 7 + 0.4)) ** 3 + 0.05 * Math.sin(u * 13 + 1.3);
  const frosting = torus({ R, r: r + 0.014, radial: s.hero ? 16 : 8, tubular: s.hero ? s.R * 2 : s.R + 8, vArc: [-0.3, Math.PI + 0.5],
    vOf: (u, t, v) => (t === 0 ? -0.3 - drip(u) : t === 1 ? Math.PI + 0.2 + 0.06 * Math.sin(u * 9) : v) });
  body.push(xf(paint(frosting, "#ff8fc8"), { at: [0, y, 0] }));
  /* sprinkles: some in the rider's color */
  const sprinkleColors = ["#ffffff", "#ffe066", "#6fd3ff", "#a7f070", "#ff9f43", "#c39bff"];
  const trim = [];
  for (let i = 0; i < (s.hero ? 40 : 26); i++) {
    const u = rand() * TAU, v = 0.25 + rand() * 2.4;
    const rr = r + 0.024;
    const c = V((R + rr * Math.cos(v)) * Math.cos(u), y + rr * Math.sin(v), -(R + rr * Math.cos(v)) * Math.sin(u));
    const n = V(Math.cos(v) * Math.cos(u), Math.sin(v), -Math.cos(v) * Math.sin(u));
    const t1 = new THREE.Vector3().crossVectors(n, V(0, 1, 0.3)).normalize().applyAxisAngle(n, rand() * TAU);
    const g = tube([c.clone().addScaledVector(t1, -0.017), c.clone().addScaledVector(t1, 0.017)], { radius: 0.0075, radial: s.hero ? 6 : 4, segments: 1, capRings: s.hero ? 2 : 1 });
    if (i % 3 === 0) trim.push(g); else body.push(paint(g, sprinkleColors[i % sprinkleColors.length]));
  }
  return { body, trim, decals: ringDecals(R, r, y), seat: RING_SEAT };
}

function flamingo(s) {
  const R = 0.48, r = 0.2, y = 0.07;
  const pink = "#ff79b0", deep = "#f2589a", pale = "#ffc2dc";
  const body = [xf(paint(torus({ R, r, radial: s.r, tubular: s.R }), p => new THREE.Color(p.y > y + 0.12 ? pale : pink)), { at: [0, y, 0] })];
  /* the S neck from the front of the ring, the head, the beak */
  const neck = [[0, y + 0.12, -0.6], [0, y + 0.34, -0.72], [0, y + 0.56, -0.6], [0, y + 0.78, -0.62], [0, y + 0.9, -0.74]];
  body.push(paint(tube(neck, { radius: t => 0.078 - 0.022 * t, radial: s.limb[0] + 2, segments: s.limb[1] + 3, capRings: 1 }), pink));
  const hc = V(0, y + 0.94, -0.78);
  body.push(paint(ball([0.1, 0.092, 0.11], { w: s.ball[0], h: s.ball[1], at: hc.toArray() }), pink));
  body.push(paint(tube([[0, y + 0.95, -0.86], [0, y + 0.93, -0.95], [0, y + 0.86, -0.99], [0, y + 0.8, -0.97]], { radius: t => 0.04 * (1 - t * 0.7), radial: 8, segments: 8 }),
    p => new THREE.Color(p.y < y + 0.87 ? "#222128" : "#fff1e6")));
  for (const sx of [-1, 1]) {
    body.push(paint(ball([0.022, 0.026, 0.012], { w: 10, h: 8, at: [sx * 0.085, y + 0.975, -0.82] }), "#1a1720"));
    body.push(paint(ball([0.008, 0.009, 0.004], { w: 6, h: 4, at: [sx * 0.093, y + 0.985, -0.828] }), "#ffffff"));
    /* little wings on the ring's sides */
    const wing = ball([0.06, 0.05, 0.16], { w: s.ball[0], h: s.ball[1] });
    xf(wing, { rot: [0.1, sx * 0.2, sx * -0.35], at: [sx * 0.66, y + 0.18, 0.08] });
    body.push(paint(wing, deep));
  }
  /* tail feathers at the back */
  body.push(paint(xf(ball([0.08, 0.06, 0.13], { w: s.ball[0], h: s.ball[1] }), { rot: [0.5, 0, 0], at: [0, y + 0.2, 0.66] }), deep));
  /* the rider's bow tie at the neck */
  const trim = [];
  for (const sx of [-1, 1]) trim.push(xf(ball([0.055, 0.04, 0.02], { w: 10, h: 8 }), { rot: [0, 0, sx * 0.25], at: [sx * 0.05, y + 0.34, -0.79] }));
  trim.push(ball([0.022, 0.022, 0.018], { w: 8, h: 6, at: [0, y + 0.34, -0.8] }));
  return { body, trim, decals: ringDecals(R, r, y), seat: RING_SEAT };
}

function shark(s) {
  const R = 0.5, r = 0.21, y = 0.07;
  const top = "#6b8fae", belly = "#f1f4f6", inside = "#3a1424", gum = "#ef7f95";
  const shade = p => new THREE.Color(p.y < y - 0.02 ? belly : top);
  const body = [xf(paint(torus({ R, r, radial: s.r, tubular: s.R }), shade), { at: [0, y, 0] })];
  /* the head at the front, jaws open */
  const head = blob({ r: [0.24, 0.17, 0.24], n: 2.3, at: [0, y + 0.08, -0.62] });
  body.push(paint(blobGeometry(head, { w: s.ball[0] + 6, h: s.ball[1] + 3 }), shade));
  /* the open mouth: a dark grin on the head's front, teeth round its rim */
  const md = new THREE.Vector3(0, -0.32, -1).normalize();
  const t2 = new THREE.Vector3(0, 1, 0).addScaledVector(md, -md.y).normalize(), t1 = new THREE.Vector3().crossVectors(t2, md).normalize();
  const mouthEdge = th => { const sn = Math.sin(th); return sn > 0 ? 0.55 + 0.45 * (1 - sn) : 1; };
  body.push(paint(patchGeometry(head, { dir: md.toArray(), ax: 0.78, ay: 0.36, rings: s.hero ? 5 : 3, segs: s.hero ? 28 : 18, lift: 0.004, edge: mouthEdge }), inside));
  body.push(paint(patchGeometry(head, { dir: md.clone().addScaledVector(t2, -0.2).normalize().toArray(), ax: 0.42, ay: 0.12, rings: 2, segs: s.hero ? 20 : 12, lift: 0.0065 }), gum));
  const toothAt = (ex, ey, down) => {
    const d = md.clone().addScaledVector(t1, Math.tan(ex)).addScaledVector(t2, Math.tan(ey)).normalize();
    const p = head.at(d), n = head.normal(d);
    const tooth = lathe([[0.019, 0], [0.013, 0.02], [0.0, 0.046]], { segments: s.hero ? 8 : 5 });
    const up = (down ? t2.clone().negate() : t2.clone()).addScaledVector(n, -(down ? -t2.dot(n) : t2.dot(n))).normalize();
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, n).normalize(), up, n).setPosition(p.clone().addScaledVector(n, 0.004));
    tooth.applyMatrix4(m);
    body.push(paint(tooth, "#ffffff"));
  };
  for (let i = -3; i <= 3; i++) { toothAt(i * 0.2, 0.17 - Math.abs(i) * 0.012, true); toothAt(i * 0.2 + 0.1, -0.31 + Math.abs(i) * 0.01, false); }
  for (const sx of [-1, 1]) {
    body.push(paint(ball([0.03, 0.034, 0.016], { w: 10, h: 8, at: [sx * 0.15, y + 0.19, -0.74] }), "#121218"));
    body.push(paint(ball([0.01, 0.011, 0.005], { w: 6, h: 4, at: [sx * 0.16, y + 0.205, -0.752] }), "#ffffff"));
    for (let g = 0; g < 3; g++) body.push(paint(xf(ball([0.008, 0.045, 0.012], { w: s.hero ? 8 : 5, h: s.hero ? 6 : 4 }), { rot: [0, sx * 0.9, 0], at: [sx * (0.215 + g * 0.012), y + 0.09, -0.52 + g * 0.045] }), "#4e6e8b"));
    /* pectoral fins on the sides */
    const fin = ball([0.035, 0.12, 0.08], { w: s.ball[0], h: s.ball[1] });
    xf(fin, { rot: [0.3, 0, sx * 1.1], at: [sx * 0.68, y - 0.02, -0.18] });
    body.push(paint(fin, top));
  }
  /* the dorsal fin on the back of the ring, and the tail */
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.13, 0); finShape.quadraticCurveTo(-0.02, 0.06, 0.06, 0.3); finShape.quadraticCurveTo(0.09, 0.12, 0.15, 0); finShape.lineTo(-0.13, 0);
  const dorsal = extrude(finShape, { depth: 0.035, bevel: 0.016, bevelSegments: s.extrude[1], curveSegments: s.extrude[0] });
  xf(dorsal, { rot: [0, Math.PI / 2, 0], at: [0, y + r - 0.03, 0.52] });
  body.push(paint(dorsal, top));
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, -0.02); tailShape.quadraticCurveTo(0.12, 0.05, 0.2, 0.24); tailShape.quadraticCurveTo(0.1, 0.1, 0.06, 0.02);
  tailShape.quadraticCurveTo(0.12, -0.08, 0.17, -0.18); tailShape.quadraticCurveTo(0.06, -0.08, 0, -0.02);
  const tail = extrude(tailShape, { depth: 0.03, bevel: 0.012, bevelSegments: s.extrude[1], curveSegments: s.extrude[0] });
  xf(tail, { rot: [0, Math.PI / 2, 0], at: [0, y + 0.04, 0.7] });
  body.push(paint(tail, top));
  /* the rider's racing stripe on the dorsal fin */
  const stripeShape = new THREE.Shape();
  stripeShape.moveTo(-0.09, 0.07); stripeShape.lineTo(0.13, 0.07); stripeShape.lineTo(0.12, 0.12); stripeShape.lineTo(-0.05, 0.12); stripeShape.lineTo(-0.09, 0.07);
  const stripe = extrude(stripeShape, { depth: 0.074, bevel: 0.004, bevelSegments: 1, curveSegments: 4 });
  xf(stripe, { rot: [0, Math.PI / 2, 0], at: [0, y + r - 0.03, 0.52] });
  return { body, trim: [stripe], decals: ringDecals(R, r, y), seat: RING_SEAT };
}

const BUILDERS = { classic, donut, flamingo, shark };
export const BUILT_FLOATIES = Object.keys(BUILDERS);

/* a floatie's geometries, cached by id and detail */
function floatieGeometry(id, detail) {
  const key = `floatie:${id}:${detail}`;
  return geometry(key, () => {
    const make = BUILDERS[id] || BUILDERS.classic;
    const parts = make(SEG[detail] || SEG.race);
    const body = merge(parts.body.map(g => (g.attributes.color ? g : paint(g, "#ffffff"))).map(stripUv));
    const trim = parts.trim.length ? merge(parts.trim.map(g => paint(stripUv(g), "#ffffff"))) : null;
    const decal = parts.decals.length ? merge(parts.decals) : null;
    return { body, trim, decal, seat: parts.seat };
  });
}
const stripUv = g => { if (g.attributes.uv) g.deleteAttribute("uv"); return g; };

export function buildFloatieArt({ floatie = "classic", color = "#e8b04a", badge = null, detail = "race", seed = "floatie" } = {}) {
  const id = BUILDERS[floatie] ? floatie : "classic";
  const hex = normalHex(color);
  const geo = floatieGeometry(id, detail);
  const root = new THREE.Group();
  root.name = `floatie:${id}`;
  const bob = new THREE.Group(); bob.name = "bob";
  const hull = new THREE.Group(); hull.name = "hull";
  root.add(bob); bob.add(hull);
  const body = new THREE.Mesh(geo.body, pvc());
  body.name = "floatie-body";
  hull.add(body);
  let trimMat = null;
  if (geo.trim) { trimMat = tint(hex); const trim = new THREE.Mesh(geo.trim, trimMat); trim.name = "floatie-trim"; hull.add(trim); }
  if (geo.decal && badge?.texture) { const decal = new THREE.Mesh(geo.decal, badge.material); decal.name = "floatie-number"; hull.add(decal); }
  const seat = new THREE.Object3D();
  seat.name = "seat";
  seat.position.set(0, geo.seat.seatY, geo.seat.seatZ || 0);
  bob.add(seat);
  const rand = mulberry(seed);
  const phase = rand() * TAU;
  const st = { t: 0, flip: 0, flipV: 0, flipped: false, dip: 0, dipV: 0, roll: 0, rollV: 0, lean: 0 };
  const api = {
    root, seat, bob, hull, seatInfo: geo.seat, id,
    /* flipped: upside down on the water (its rider swimming) */
    setState(next = {}) { if (next && "flipped" in next) st.flipped = !!next.flipped; if (next && "swim" in next) st.flipped = !!next.swim; },
    /* a push from the rider: lean (signed, toward -x positive), dip (0..1) */
    kick({ lean = 0, dip = 0 } = {}) { st.lean = lean; if (dip > 0) st.dipV -= dip * 1.4; },
    update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      st.t += dt;
      const n = Math.min(4, Math.max(1, Math.ceil(dt * 60))), h = dt / n;
      for (let i = 0; i < n; i++) {
        const ft = st.flipped ? Math.PI : 0;
        st.flipV += (90 * (ft - st.flip) - 2 * 0.42 * 9.5 * st.flipV) * h; st.flip += st.flipV * h;
        st.dipV += (140 * (0 - st.dip) - 2 * 0.25 * 11.8 * st.dipV) * h; st.dip += st.dipV * h;
        const rt = 0.07 * st.lean;
        st.rollV += (110 * (rt - st.roll) - 2 * 0.5 * 10.5 * st.rollV) * h; st.roll += st.rollV * h;
      }
      const t = st.t;
      bob.position.y = 0.012 * Math.sin(t * 1.5 + phase) + st.dip * 0.12;
      bob.rotation.set(0.018 * Math.sin(t * 1.1 + phase * 0.7), 0, 0.022 * Math.sin(t * 0.9 + phase) + st.roll, "YXZ");
      const f = st.flip;
      hull.rotation.z = f;
      hull.position.y = Math.sin(Math.min(Math.PI, Math.max(0, f))) * 0.22 + (f > 1.6 ? 0.14 : 0) * Math.min(1, (f - 1.6) / 1.4);
    },
    dispose() {
      root.parent?.remove(root);
      if (trimMat) releaseTint(hex);
    },
  };
  return api;
}
