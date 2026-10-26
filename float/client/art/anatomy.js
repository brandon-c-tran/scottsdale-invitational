/* The body plan every critter shares, and the face kit. A species file
   (species.js) calls these with its own sizes, colors and features; the
   result is a RigBuilder template plus the sockets its hat, shades, chain
   and drink attach to.

   Critter space: metres, y up, facing -z, origin at the seat (the bottom of
   the critter where it sits in its floatie). The critter's own right is +x,
   so its LEFT arm is at -x ("L" strokes paddle on the -x side).

   Proportions are a vinyl toy's: a head about 1.35 times the body's width,
   short rubber-hose arms, stubby legs, big glossy eyes. */
import * as THREE from "three";
import { RigBuilder } from "./rig.js";
import { blob, blobGeometry, patchGeometry, tube, ball, xf, dirYawPitch, smooth, tangents } from "./sculpt.js";

export const SEG = {
  race: { head: [20, 14], body: [16, 10], limb: [6, 6], ball: [9, 6], small: [6, 4], tiny: [5, 3], patch: [2, 10], eye: [10, 7], cap: 1, line: [4, 6] },
  hero: { head: [40, 28], body: [32, 22], limb: [12, 16], ball: [18, 12], small: [12, 9], tiny: [8, 6], patch: [5, 24], eye: [20, 14], cap: 3, line: [7, 12] },
};

export const mix = (a, b, t) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* a frame (right, up, forward=out of the surface) at a surface point */
function surfaceFrame(n, upHint = V(0, 1, 0)) {
  const f = n.clone().normalize();
  const up = upHint.clone().addScaledVector(f, -upHint.dot(f));
  if (up.lengthSq() < 1e-6) up.set(0, 0, 1).addScaledVector(f, -f.z);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, f).normalize();
  return { right, up, f };
}
/* move a geometry built around the origin (x right, y up, z out) into a frame at p */
function place(geo, p, frame) {
  const m = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.f).setPosition(p);
  geo.applyMatrix4(m);
  return geo;
}

export class Kit {
  constructor({ detail = "race" } = {}) {
    this.detail = detail;
    this.seg = SEG[detail] || SEG.race;
    this.rig = new RigBuilder();
    this.sockets = {};
    this.info = {};
  }

  /* ── skeleton ── */
  skeleton({ hipY = 0.08, chestY = 0.22, neckY = 0.36, head = [0, 0.43, -0.01], shoulder = [0.165, 0.31, -0.01],
    arm = { a: 0.12, b: 0.12, dir: [0.55, -0.83, -0.08] }, leg = [0.085, 0.07, -0.07], tail = [0, 0.08, 0.16] } = {}) {
    const r = this.rig;
    r.bone("root", null, [0, 0, 0]);
    r.bone("hips", "root", [0, hipY, 0]);
    r.bone("chest", "hips", [0, chestY, 0]);
    r.bone("neck", "chest", [0, neckY, 0]);
    r.bone("head", "neck", head);
    for (const side of [-1, 1]) {
      const s = side < 0 ? "L" : "R";
      const dir = V(arm.dir[0] * side, arm.dir[1], arm.dir[2]).normalize();
      const sh = V(shoulder[0] * side, shoulder[1], shoulder[2]);
      r.bone(`shoulder${s}`, "chest", sh.toArray());
      r.bone(`elbow${s}`, `shoulder${s}`, sh.clone().addScaledVector(dir, arm.a).toArray());
      r.bone(`hand${s}`, `elbow${s}`, sh.clone().addScaledVector(dir, arm.a + arm.b).toArray());
      r.bone(`leg${s}`, "hips", [leg[0] * side, leg[1], leg[2]]);
      /* the bind pose's elbow bulge: back and out */
      const pole = V(side * 0.3, 0.15, 1).addScaledVector(dir, -V(side * 0.3, 0.15, 1).dot(dir)).normalize();
      this.info[`arm${s}`] = { dir, pole, a: arm.a, b: arm.b, shoulder: sh };
    }
    r.bone("tail", "hips", tail);
    r.bone("tail2", "tail", [tail[0], tail[1] + 0.06, tail[2] + 0.12]);
    this.info.hipY = hipY;
  }

  /* expression and feature bones on the head, at critter-space points */
  faceBones({ eyes, mouth, ears = null, crest = null, jaw = null }) {
    const r = this.rig;
    r.bone("eyes", "head", eyes);
    r.bone("happy", "head", eyes);
    r.bone("lids", "head", eyes);
    r.bone("mSmile", "head", mouth);
    r.bone("mOpen", "head", mouth);
    r.bone("mFrown", "head", mouth);
    r.bone("jaw", "head", jaw || mouth);
    if (ears) { r.bone("earL", "head", [-ears[0], ears[1], ears[2]]); r.bone("earR", "head", ears); }
    else { r.bone("earL", "head", eyes); r.bone("earR", "head", eyes); }
    r.bone("crest", "head", crest || eyes);
  }

  add(geo, opts) { return this.rig.add(geo, opts); }

  /* ── the body: a pear blob blended between hips and chest ── */
  body({ r = [0.2, 0.2, 0.18], at = [0, 0.19, 0], n = 2.2, taper = 0.12, color, belly = null, bellyPatch = { dir: [0, -0.05, -1], ax: 0.62, ay: 0.68 } }) {
    const [ , ry] = r;
    const shape = blob({ r, n, at, warp: p => {
      const k = 1 + taper * (-p.y / ry);
      p.x *= k; p.z *= k;
      if (p.y < -0.72 * ry) p.y = -0.72 * ry + (p.y + 0.72 * ry) * 0.35;
    } });
    const [w, h] = this.seg.body;
    const chestW = this.info.hipY + 0.12;
    const bind = p => { const t = smooth(chestW - 0.06, chestW + 0.1, p.y); return [["hips", 1 - t], ["chest", t]]; };
    this.add(blobGeometry(shape, { w, h }), { color, bind });
    if (belly) {
      const [pr, ps] = this.seg.patch;
      this.add(patchGeometry(shape, { ...bellyPatch, rings: pr, segs: ps, lift: 0.0035 }), { color: belly, bind });
    }
    this.bodyShape = shape;
    this.bodyBind = bind;
    this.info.body = { r, at };
    return shape;
  }

  /* swim trunks in the rider's color: the body's bottom up to `top` (body
     height share, 0 = centre), a white waistband, a drawstring bow */
  trunks({ top = -0.18, band = "#fbf7ee", legCuff = true } = {}) {
    const shape = this.bodyShape;
    const [rx, ry] = this.info.body.r;
    const th0 = Math.acos(THREE.MathUtils.clamp(top, -0.99, 0.99));
    const [w] = this.seg.body;
    this.add(blobGeometry(shape, { w, h: this.detail === "hero" ? 7 : 4, theta: [th0, Math.PI - th0], lift: 0.006 }), { layer: "tint", color: "#ffffff", bind: this.bodyBind });
    this.add(blobGeometry(shape, { w, h: 2, theta: [th0 - 0.07, 0.13], lift: 0.009 }), { color: band, bind: this.bodyBind });
    /* the bow at the front of the waistband */
    const d = V(0, Math.cos(th0 - 0.01), -Math.sin(th0 - 0.01)).normalize();
    const p = shape.at(d), n = shape.normal(d);
    const fr = surfaceFrame(n);
    const [bw, bh] = this.seg.tiny;
    const knot = place(ball([0.012, 0.011, 0.008], { w: bw, h: bh }), p.clone().addScaledVector(n, 0.012), fr);
    this.add(knot, { color: band, bind: "hips" });
    for (const s of [-1, 1]) {
      const loop = tube([[0, 0, 0], [s * 0.022, -0.006, 0.004], [s * 0.03, -0.026, 0.002]], { radius: 0.0045, radial: 4, segments: this.detail === "hero" ? 5 : 2, capRings: 1 });
      this.add(place(loop, p.clone().addScaledVector(n, 0.012), fr), { color: band, bind: "hips" });
    }
    this.info.trunks = { legCuff, rx, top };
  }

  /* ── the head ── */
  head({ r = [0.25, 0.21, 0.24], at = [0, 0.6, -0.02], n = 2.2, warp = null, color, bind = "head" }) {
    const shape = blob({ r, n, at, warp });
    const [w, h] = this.seg.head;
    this.add(blobGeometry(shape, { w, h }), { color, bind });
    this.headShape = shape;
    this.info.head = { r, at };
    return shape;
  }

  /* any extra blob (snout, cheeks, bulges), on a bone */
  lump(shapeOpts, { color, bind = "head", seg = "ball" } = {}) {
    const shape = blob(shapeOpts);
    const [w, h] = this.seg[seg] || this.seg.ball;
    this.add(blobGeometry(shape, { w, h }), { color, bind });
    return shape;
  }

  /* a patch on any blob */
  patch(shape, opts, { color, bind = "head", layer = "vinyl" } = {}) {
    const [rings, segs] = this.seg.patch;
    return this.add(patchGeometry(shape, { rings, segs, ...opts }), { color, bind, layer });
  }

  /* ── eyes: big glossy ovals with catch lights, happy arcs and lids ── */
  eyes(shapes, { yaw = 0.42, pitch = 0.1, w = 0.05, h = 0.06, depth = 0.032, sink = 0.45, color = "#131116",
    lid = null, lidTilt = 0.22, lidCover = 0.5, tilt = 0, happyColor = "#1d1414", upHint = null }) {
    const eyes = [];
    const [ew, eh] = this.seg.eye;
    for (const side of [-1, 1]) {
      /* one shape for both eyes, or [left, right] (the frog's turrets) */
      const shape = Array.isArray(shapes) ? shapes[side < 0 ? 0 : 1] : shapes;
      const d = dirYawPitch(yaw * side, pitch);
      const p = shape.at(d), n = shape.normal(d);
      const fr = surfaceFrame(n, upHint ? V(...upHint) : V(0, 1, 0));
      /* a little inward roll keeps both eyes looking at you */
      if (tilt) { fr.right.applyAxisAngle(fr.f, tilt * side); fr.up.applyAxisAngle(fr.f, tilt * side); }
      const c = p.clone().addScaledVector(fr.f, -depth * sink);
      const eye = place(ball([w, h, depth], { w: ew, h: eh }), c, fr);
      this.add(eye, { color, bind: "eyes" });
      /* catch lights: both on the same side, as one light would put them */
      const glint = (gx, gy, gw, gh) => {
        const z = depth * Math.sqrt(Math.max(0, 1 - (gx / w) ** 2 - (gy / h) ** 2)) + 0.0015;
        const gp = c.clone().addScaledVector(fr.right, gx).addScaledVector(fr.up, gy).addScaledVector(fr.f, z);
        const [tw, th] = this.seg.tiny;
        this.add(place(ball([gw, gh, 0.004], { w: tw + 2, h: th }), gp, fr), { layer: "glint", color: "#ffffff", bind: "eyes" });
      };
      glint(w * 0.3, h * 0.36, w * 0.3, h * 0.27);
      glint(-w * 0.32, -h * 0.34, w * 0.13, h * 0.11);
      /* happy: a ^ arc where the eye was */
      const arc = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, ang = Math.PI * (0.95 - 0.9 * t);
        const ax = Math.cos(ang) * w * 1.05, ay = Math.sin(ang) * h * 0.55 - h * 0.12;
        arc.push(c.clone().addScaledVector(fr.right, ax).addScaledVector(fr.up, ay).addScaledVector(fr.f, depth * (1 - sink) + 0.004));
      }
      this.add(tube(arc, { radius: Math.max(0.0085, w * 0.17), radial: this.seg.line[0], segments: this.seg.line[1], capRings: this.seg.cap }), { color: happyColor, bind: "happy" });
      /* lids: the head's color over the top of the eye, tilted down at the outer corner */
      if (lid) {
        const lidShape = blob({ r: [w * 1.12, h * 1.1, depth * 1.12], at: [0, 0, 0] });
        const g = blobGeometry(lidShape, { w: ew, h: Math.max(4, eh >> 1), theta: [0, Math.PI * lidCover] });
        xf(g, { rot: [0, 0, -side * lidTilt] });
        this.add(place(g, c.clone(), fr), { color: lid, bind: "lids" });
      }
      eyes.push({ p, n, c, fr });
    }
    this.info.eyes = eyes;
    this.info.eyeSize = { w, h, depth };
    return eyes;
  }

  /* ── mouths: smile, open, frown, on any blob ── */
  mouth(shape, { dir = [0, -0.25, -1], w = 0.05, curve = 0.018, color = "#2b1716", inside = "#7a2630", tongue = "#ef8f98",
    radius = 0.0075, openW = null, openH = null, smileUp = 1 }) {
    const c = new THREE.Vector3(...dir).normalize();
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    /* horizontal and vertical tangents on the face */
    t2.set(0, 1, 0).addScaledVector(c, -c.y).normalize();
    t1.crossVectors(t2, c).normalize();
    const p = shape.at(c);
    const scale = p.distanceTo(shape.center);
    const onSurface = (x, y, lift = 0.004) => {
      const d = c.clone().addScaledVector(t1, x / scale).addScaledVector(t2, y / scale).normalize();
      return shape.at(d).addScaledVector(shape.normal(d), lift);
    };
    /* sign 1: a smile (corners up), -1: a frown */
    const line = (sign, bone) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = (i / 8) * 2 - 1;
        pts.push(onSurface(t * w, sign * curve * smileUp * (t * t - 1) + sign * curve * 0.5));
      }
      this.add(tube(pts, { radius, radial: this.seg.line[0], segments: this.seg.line[1], capRings: this.seg.cap }), { color, bind: bone });
    };
    line(1, "mSmile");
    line(-1, "mFrown");
    /* open: a D, dark inside, a tongue */
    const ow = openW || w * 0.95, oh = openH || w * 0.9;
    const [rings, segs] = this.seg.patch;
    const n0 = shape.normal(c);
    const dOpen = c.clone().addScaledVector(t2, -oh * 0.35 / scale).normalize();
    const edge = th => { const s = Math.sin(th); return s > 0 ? Math.min(1, 0.32 / Math.max(0.01, s)) : 1; };
    this.add(patchGeometry(shape, { dir: dOpen.toArray(), up: [0, 1, 0], ax: ow / scale, ay: oh / scale, rings, segs, lift: 0.0045, edge }), { color: inside, bind: "mOpen" });
    const dTongue = c.clone().addScaledVector(t2, -oh * 0.72 / scale).normalize();
    this.add(patchGeometry(shape, { dir: dTongue.toArray(), up: [0, 1, 0], ax: ow * 0.55 / scale, ay: oh * 0.32 / scale, rings: 3, segs, lift: 0.0062 }), { color: tongue, bind: "mOpen" });
    this.info.mouth = { p, n: n0 };
  }

  /* ── arms: rubber hoses from the shoulder to a paw ── */
  arms({ color, paw = null, radius = [0.057, 0.05], pawR = 0.061, wing = null, fingers = 0, fingerColor = null }) {
    const [lr, ls] = this.seg.limb;
    for (const s of ["L", "R"]) {
      const info = this.info[`arm${s}`];
      const side = s === "L" ? -1 : 1;
      const S = info.shoulder, L = info.a + info.b;
      const pts = [S.clone().addScaledVector(info.dir, -0.02), S.clone().addScaledVector(info.dir, L * 0.5), S.clone().addScaledVector(info.dir, L)];
      const sh = `shoulder${s}`, el = `elbow${s}`, hd = `hand${s}`;
      const bind = p => {
        const t = THREE.MathUtils.clamp(p.clone().sub(S).dot(info.dir) / L, 0, 1);
        const we = smooth(0.18, 0.62, t), wh = smooth(0.8, 0.98, t);
        return [[sh, 1 - we], [el, we * (1 - wh)], [hd, wh]];
      };
      if (wing) {
        /* a wing: flat, feathered at the tip */
        const g = tube(pts, { radius: t => THREE.MathUtils.lerp(wing.root, wing.tip, t), radial: lr, segments: ls, capRings: this.seg.cap, flat: 0.42, side: [0, 0, 1] });
        this.add(g, { color, bind });
        const H = S.clone().addScaledVector(info.dir, L);
        for (let f = 0; f < 3; f++) {
          const spread = (f - 1) * 0.42;
          const fd = info.dir.clone().applyAxisAngle(V(0, 0, 1), spread * side * 0.6).applyAxisAngle(V(1, 0, 0), spread * 0.3);
          const tip = H.clone().addScaledVector(fd, 0.07 - Math.abs(f - 1) * 0.012);
          this.add(tube([H.clone().addScaledVector(info.dir, -0.02), tip], { radius: t => 0.024 * (1 - t * 0.75), radial: Math.min(lr, 6), segments: 3, capRings: this.seg.cap, flat: 0.45, side: [0, 0, 1] }), { color: wing.feather || color, bind: hd });
        }
      } else {
        this.add(tube(pts, { radius: t => THREE.MathUtils.lerp(radius[0], radius[1], t), radial: lr, segments: ls, caps: [true, false], capRings: 1 }), { color, bind });
        const H = S.clone().addScaledVector(info.dir, L + pawR * 0.35);
        const [bw, bh] = this.seg.ball;
        this.add(ball([pawR, pawR * 0.92, pawR], { w: bw, h: bh, at: H.toArray() }), { color: paw || color, bind: hd });
        for (let f = 0; f < fingers; f++) {
          const spread = (f - (fingers - 1) / 2) * 0.55;
          const fd = info.dir.clone().applyAxisAngle(V(0, 0, 1), spread * side).add(V(0, 0, -0.35)).normalize();
          const [tw, th] = this.seg.small;
          this.add(ball([0.022, 0.02, 0.022], { w: tw, h: th, at: H.clone().addScaledVector(fd, pawR * 0.95).toArray() }), { color: fingerColor || paw || color, bind: hd });
        }
      }
    }
  }

  /* ── legs: stubby, forward, a foot each ── */
  legs({ color, foot = null, sole = null, len = 0.15, radius = 0.056, footR = [0.06, 0.05, 0.072], dir = [0.22, -0.1, -1], bird = null, flatFoot = null }) {
    const [lr, ls] = this.seg.limb;
    for (const s of ["L", "R"]) {
      const side = s === "L" ? -1 : 1;
      const base = this.rig.at(`leg${s}`);
      const d = V(dir[0] * side, dir[1], dir[2]).normalize();
      const end = base.clone().addScaledVector(d, len);
      const bone = `leg${s}`;
      if (bird) {
        this.add(tube([base, base.clone().addScaledVector(d, len * 0.5), end], { radius: bird.r, radial: Math.min(lr, 6), segments: 4, capRings: 1 }), { color: bird.color, bind: bone });
        for (const [ax, l] of [[-0.5, 0.06], [0, 0.07], [0.5, 0.06], [Math.PI, 0.045]]) {
          const td = d.clone().applyAxisAngle(V(0, 1, 0), ax * side).add(V(0, 0.35, 0)).normalize();
          this.add(tube([end, end.clone().addScaledVector(td, l)], { radius: bird.r * 0.8, radial: 4, segments: 2, capRings: 1 }), { color: bird.color, bind: bone });
        }
        continue;
      }
      this.add(tube([base.clone().addScaledVector(d, -0.03), base.clone().addScaledVector(d, len * 0.5), end], { radius, radial: lr, segments: this.detail === "hero" ? 6 : 3, caps: [true, false], capRings: 1 }), { color, bind: bone });
      if (this.info.trunks?.legCuff) {
        this.add(tube([base.clone().addScaledVector(d, -0.01), base.clone().addScaledVector(d, len * 0.42)], { radius: radius + 0.007, radial: lr, segments: 2, caps: [false, false] }), { layer: "tint", color: "#ffffff", bind: bone });
      }
      const [bw, bh] = this.seg.ball;
      if (flatFoot) {
        /* a big webbed foot, splayed */
        const f = ball(flatFoot.r, { w: bw, h: bh });
        xf(f, { rot: [-0.9, side * 0.35, 0], at: end.clone().addScaledVector(d, flatFoot.r[2] * 0.6).toArray() });
        this.add(f, { color: foot || color, bind: bone });
        continue;
      }
      const fp = end.clone().addScaledVector(d, footR[2] * 0.45).add(V(0, footR[1] * 0.25, 0));
      const g = ball(footR, { w: bw, h: bh });
      xf(g, { rot: [-0.55, 0, 0], at: fp.toArray() });
      this.add(g, { color: foot || color, bind: bone });
      if (sole && this.detail === "hero") {
        /* the sole faces forward: a pad and three toe beans */
        const front = fp.clone().addScaledVector(d, footR[2] * 0.78).add(V(0, footR[1] * 0.35, 0));
        const fr = surfaceFrame(d.clone().add(V(0, 0.55, 0)).normalize());
        const [tw, th] = this.seg.small;
        this.add(place(ball([footR[0] * 0.5, footR[1] * 0.42, 0.012], { w: tw, h: th }), front.clone().addScaledVector(fr.up, -footR[1] * 0.15), fr), { color: sole, bind: bone });
        for (let k = -1; k <= 1; k++) {
          const bp = front.clone().addScaledVector(fr.right, k * footR[0] * 0.48).addScaledVector(fr.up, footR[1] * 0.55 - Math.abs(k) * 0.008);
          this.add(place(ball([0.013, 0.012, 0.008], { w: tw, h: th }), bp, fr), { color: sole, bind: bone });
        }
      }
    }
  }

  /* ── ears ── */
  ears({ kind = "round", at = [0.16, 0.78, 0.04], size = [0.05, 0.055, 0.022], color, inner = null, tip = null, tilt = [0, 0, 0.35], len = 0.2 }) {
    const [bw, bh] = this.seg.ball;
    for (const side of [-1, 1]) {
      const s = side < 0 ? "L" : "R";
      const base = V(at[0] * side, at[1], at[2]);
      const bone = `ear${s}`;
      if (kind === "round") {
        const g = ball(size, { w: bw, h: bh });
        xf(g, { rot: [tilt[0], tilt[1] * side, tilt[2] * side], at: base.toArray() });
        this.add(g, { color, bind: bone });
        if (inner) {
          const gi = ball([size[0] * 0.62, size[1] * 0.6, size[2] * 0.6], { w: bw, h: bh });
          xf(gi, { rot: [tilt[0], tilt[1] * side, tilt[2] * side], at: base.clone().add(V(0, -size[1] * 0.08, -size[2] * 0.62)).toArray() });
          this.add(gi, { color: inner, bind: bone });
        }
      } else {
        /* a leaf: pointed (coyote, javelina) or long (jackrabbit) */
        const dirUp = V(Math.sin(tilt[2]) * side, Math.cos(tilt[2]), Math.sin(tilt[0])).normalize();
        const tipP = base.clone().addScaledVector(dirUp, len);
        const mid = base.clone().addScaledVector(dirUp, len * 0.5);
        const shapeR = kind === "long"
          ? t => size[0] * (0.62 + 0.38 * Math.sin(Math.PI * (0.08 + 0.92 * t))) * (1 - 0.9 * t ** 3) + 0.005
          : t => size[0] * (1 - t ** 1.5) * (0.72 + 0.28 * Math.sin(Math.PI * t)) + 0.004;
        const [lr] = this.seg.limb;
        const colorFn = tip ? (p) => new THREE.Color(p.clone().sub(base).dot(dirUp) > len * 0.78 ? tip : color) : color;
        this.add(tube([base, mid, tipP], { radius: shapeR, radial: lr, segments: this.detail === "hero" ? 12 : 7, flat: 0.38, side: [0, 0, 1], caps: [true, true], capRings: this.seg.cap }), { color: colorFn, bind: bone });
        if (inner) {
          const fwd = V(0, 0, -size[2] * 0.85);
          const ib = base.clone().addScaledVector(dirUp, len * 0.08).add(fwd), it = base.clone().addScaledVector(dirUp, len * 0.8).add(fwd);
          this.add(tube([ib, ib.clone().lerp(it, 0.5), it], { radius: t => shapeR(t) * 0.6, radial: Math.min(lr, 6), segments: this.detail === "hero" ? 8 : 5, flat: 0.3, side: [0, 0, 1], capRings: 1 }), { color: inner, bind: bone });
        }
      }
    }
  }

  /* a tail: a tapered tube from the rump, two bones */
  tail(points, { radius = t => 0.05 * (1 - t * 0.6), color, flat = 1, side = null, radial = null } = {}) {
    const [lr] = this.seg.limb;
    const P0 = V(...points[0]);
    const total = points.reduce((s, p, i) => (i ? s + V(...p).distanceTo(V(...points[i - 1])) : 0), 0);
    const bind = p => { const t = THREE.MathUtils.clamp(p.distanceTo(P0) / total, 0, 1); const w = smooth(0.25, 0.7, t); return [["tail", 1 - w], ["tail2", w]]; };
    return this.add(tube(points, { radius, radial: radial || lr, segments: this.detail === "hero" ? 14 : 9, flat, side, capRings: this.seg.cap }), { color, bind });
  }

  /* sockets: where the hat, the shades, the chain and the drink go */
  socket(name, at, extra = {}) { this.sockets[name] = { at: new THREE.Vector3(...at), ...extra }; }

  build() {
    const template = this.rig.build();
    template.sockets = this.sockets;
    template.info = this.info;
    template.shapes = { body: this.bodyShape, head: this.headShape };
    template.dispose = () => { for (const g of Object.values(template.geos)) g?.dispose(); };
    return template;
  }
}

export { surfaceFrame, place, V, tangents };
