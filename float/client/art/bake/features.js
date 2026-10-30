/* The small hard pieces on a plush critter (bake time only): glossy bead
   eyes with their catch lights, the happy and sleepy eye variants, the
   mouths, glossy noses, teeth, tusks, whiskers. Each piece is bound rigidly
   to one bone (expression variants sit on bones the runtime scales to
   nothing until shown), so they are built here as small meshes and merged
   into the critter's one mesh after its plush body. */
import * as THREE from "three";
import { ball, tube, patchGeometry, xf } from "../sculpt.js";

export const FEATURE_SEG = {
  race: { eye: [12, 8], glint: [6, 3], line: [4, 5], patch: [3, 12], cap: 1, small: [9, 6], lid: [10, 4] },
  hero: { eye: [28, 16], glint: [12, 6], line: [8, 14], patch: [5, 26], cap: 3, small: [18, 10], lid: [24, 8] },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* a view of the sculpt as a star-shaped surface round a centre, for pieces
   that follow the face (mouth lines, patches): at(d) is where a ray from the
   centre along d leaves the mass, normal(d) the surface's normal there */
export function surfaceFrom(sculpt, center, skip = null) {
  const c = V(...center);
  const cache = new Map();
  const hit = d => {
    const key = `${d.x.toFixed(6)},${d.y.toFixed(6)},${d.z.toFixed(6)}`;
    let h = cache.get(key);
    if (!h) {
      const p = sculpt.raycast(center, [d.x, d.y, d.z], { skip });
      if (!p) throw new Error(`features: no surface from ${center} along ${key}`);
      h = { p, n: sculpt.normal(p[0], p[1], p[2]) };
      cache.set(key, h);
    }
    return h;
  };
  return {
    center: c,
    at(d, out = new THREE.Vector3()) { const { p } = hit(d.clone().normalize()); return out.set(p[0], p[1], p[2]); },
    normal(d, out = new THREE.Vector3()) { const { n } = hit(d.clone().normalize()); return out.set(n[0], n[1], n[2]); },
  };
}

export const dirYawPitch = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();

/* a frame (right, up, out) on a surface normal */
export function frameOn(n, upHint = V(0, 1, 0)) {
  const f = n.clone().normalize();
  const up = upHint.clone().addScaledVector(f, -upHint.dot(f));
  if (up.lengthSq() < 1e-6) up.set(0, 0, 1).addScaledVector(f, -f.z);
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, f).normalize();
  return { right, up, f };
}
export function place(geo, p, fr) {
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(fr.right, fr.up, fr.f).setPosition(p));
  return geo;
}

export class Features {
  constructor(sculpt, detail = "race") {
    this.sculpt = sculpt;
    this.detail = detail;
    this.seg = FEATURE_SEG[detail] || FEATURE_SEG.race;
    this.pieces = [];
    this.anchors = {};
    /* places the plush keeps bare (no fur over an eye or a mouth): { p, r } */
    this.clearings = [];
  }

  /* a piece: its geometry, the bone it rides, its color and finish
     (rough 0 is a catch light: drawn pure white, unlit) */
  add(geo, { bone = "head", color = "#141216", fuzz = 0, rough = 0.2, fur = 0 } = {}) {
    if (!geo) return;
    if (geo.index === null) throw new Error("features: indexed geometry only");
    this.pieces.push({ geo, bone, color: new THREE.Color(color), fuzz, rough, fur });
  }

  /* where a ray from the head centre leaves the face */
  surface(center, dir, skip = null) {
    const p = this.sculpt.raycast(center, [dir.x, dir.y, dir.z], { skip });
    if (!p) throw new Error(`features: no face along ${dir.toArray()}`);
    const n = this.sculpt.normal(p[0], p[1], p[2]);
    return { p: V(...p), n: V(...n) };
  }

  /* bead eyes: small, glossy black, a crisp catch light; the happy ^ arcs and
     the sleepy lids as variants. Returns the eyes' centres and normals */
  eyes({ center, yaw = 0.5, pitch = 0.1, w = 0.03, h = 0.036, depth = 0.016, sink = 0.55, color = "#120f13", tilt = 0, lid = null, lidColor = null,
    lidCover = 0.48, lidTilt = 0.18, happyColor = "#1c1416", skip = null, glint = 1, surfaces = null }) {
    const [ew, eh] = this.seg.eye;
    const eyes = [];
    for (const side of [-1, 1]) {
      const hit = surfaces ? surfaces[side < 0 ? 0 : 1] : this.surface(center, dirYawPitch(yaw * side, pitch), skip);
      const fr = frameOn(hit.n);
      if (tilt) { fr.right.applyAxisAngle(fr.f, tilt * side); fr.up.applyAxisAngle(fr.f, tilt * side); }
      const c = hit.p.clone().addScaledVector(fr.f, -depth * sink);
      this.add(place(ball([w, h, depth], { w: ew, h: eh }), c, fr), { bone: "eyes", color, rough: 0.1 });
      /* catch lights: up and out, as one key light from above would put them */
      const front = (gx, gy) => depth * Math.sqrt(Math.max(0, 1 - (gx / w) ** 2 - (gy / h) ** 2)) + 0.0012;
      const [gw, gh] = this.seg.glint;
      const g1x = -side * w * 0.28, g1y = h * 0.34;
      this.add(place(ball([w * 0.34 * glint, h * 0.3 * glint, 0.003], { w: gw, h: gh }), c.clone().addScaledVector(fr.right, g1x).addScaledVector(fr.up, g1y).addScaledVector(fr.f, front(g1x, g1y)), fr), { bone: "eyes", color: "#ffffff", rough: 0 });
      const g2x = side * w * 0.3, g2y = -h * 0.36;
      this.add(place(ball([w * 0.14 * glint, h * 0.12 * glint, 0.002], { w: gw, h: gh }), c.clone().addScaledVector(fr.right, g2x).addScaledVector(fr.up, g2y).addScaledVector(fr.f, front(g2x, g2y)), fr), { bone: "eyes", color: "#ffffff", rough: 0 });
      /* happy: a ^ where the eye was */
      const arc = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, a = Math.PI * (0.95 - 0.9 * t);
        arc.push(c.clone().addScaledVector(fr.right, Math.cos(a) * w * 1.15).addScaledVector(fr.up, Math.sin(a) * h * 0.62 - h * 0.18).addScaledVector(fr.f, depth * (1 - sink) + 0.003));
      }
      const [lr, ls] = this.seg.line;
      this.add(tube(arc, { radius: Math.max(0.0055, w * 0.2), radial: lr, segments: ls, capRings: this.seg.cap }), { bone: "happy", color: happyColor, rough: 0.35 });
      /* the lid: the face's own plush over the top of the eye */
      if (lid) {
        const [lw, lh] = this.seg.lid;
        const shell = new THREE.SphereGeometry(1, lw, lh, 0, Math.PI * 2, 0, Math.PI * lidCover);
        shell.deleteAttribute("uv");
        xf(shell, { scale: [w * 1.16, h * 1.14, depth * 1.25] });
        xf(shell, { rot: [0, 0, -side * lidTilt] });
        /* SphereGeometry's pole is +y: the cap covers the top of the eye, its
           open rim faces down */
        this.add(place(shell, c.clone().addScaledVector(fr.f, depth * 0.08), fr), { bone: "lids", color: lidColor || "#888888", fuzz: 0.9, rough: 1, fur: 0 });
      }
      eyes.push({ c: c.toArray().map(v => +v.toFixed(5)), n: fr.f.toArray().map(v => +v.toFixed(5)), p: hit.p.toArray().map(v => +v.toFixed(5)) });
      this.clearings.push({ p: hit.p.toArray(), r: Math.max(w, h) * 1.7 });
    }
    this.anchors.eyes = eyes;
    this.anchors.eyeSize = { w, h, depth };
    return eyes;
  }

  /* the mouths on a face: a small smile, a frown, an open D with a tongue */
  mouth({ center, dir = [0, -0.4, -1], w = 0.024, curve = 0.008, radius = 0.0045, color = "#2a1614", inside = "#5c1f2a", tongue = "#ec8b96",
    openW = null, openH = null, skip = null }) {
    const shape = surfaceFrom(this.sculpt, center, skip);
    const c = V(...dir).normalize();
    const t2 = V(0, 1, 0).addScaledVector(c, -c.y).normalize();
    const t1 = new THREE.Vector3().crossVectors(t2, c).normalize();
    const p = shape.at(c);
    const scale = p.distanceTo(shape.center);
    const onSurface = (x, y, lift = 0.0035) => {
      const d = c.clone().addScaledVector(t1, x / scale).addScaledVector(t2, y / scale).normalize();
      return shape.at(d).addScaledVector(shape.normal(d), lift);
    };
    const [lr, ls] = this.seg.line;
    const line = (sign, bone) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = (i / 8) * 2 - 1; pts.push(onSurface(t * w, sign * curve * (t * t - 1) + sign * curve * 0.5)); }
      this.add(tube(pts, { radius, radial: lr, segments: ls, capRings: this.seg.cap }), { bone, color, rough: 0.45 });
    };
    line(1, "mSmile");
    line(-1, "mFrown");
    const ow = openW || w * 0.9, oh = openH || w * 0.85;
    const [rings, segs] = this.seg.patch;
    const dOpen = c.clone().addScaledVector(t2, -oh * 0.35 / scale).normalize();
    const edge = th => { const s = Math.sin(th); return s > 0 ? Math.min(1, 0.36 / Math.max(0.01, s)) : 1; };
    this.add(patchGeometry(shape, { dir: dOpen.toArray(), up: [0, 1, 0], ax: ow / scale, ay: oh / scale, rings, segs, lift: 0.004, edge }), { bone: "mOpen", color: inside, rough: 0.4 });
    const dTongue = c.clone().addScaledVector(t2, -oh * 0.7 / scale).normalize();
    this.add(patchGeometry(shape, { dir: dTongue.toArray(), up: [0, 1, 0], ax: ow * 0.55 / scale, ay: oh * 0.3 / scale, rings: 2, segs, lift: 0.0055 }), { bone: "mOpen", color: tongue, rough: 0.4 });
    this.anchors.mouth = { p: p.toArray().map(v => +v.toFixed(5)) };
    this.clearings.push({ p: p.toArray(), r: Math.max(w, ow) * 1.5 });
    return p;
  }

  /* a glossy bead on the surface (noses) */
  bead({ center, dir, r = [0.03, 0.02, 0.016], sink = 0.4, color = "#2b1d1a", rough = 0.25, rot = null, bone = "head", skip = null, up = null }) {
    const hit = this.surface(center, V(...dir).normalize(), skip);
    const fr = frameOn(hit.n, up ? V(...up) : V(0, 1, 0));
    const c = hit.p.clone().addScaledVector(fr.f, -r[2] * sink);
    const [bw, bh] = this.seg.small;
    const g = ball(r, { w: bw, h: bh });
    if (rot) xf(g, { rot });
    this.add(place(g, c, fr), { bone, color, rough });
    this.clearings.push({ p: hit.p.toArray(), r: Math.max(r[0], r[1]) * 1.6 });
    return { p: hit.p, n: hit.n };
  }

  /* a tapered horn of a piece (tusks, teeth, claws) along points */
  spike(points, { r0 = 0.01, r1 = 0.003, color = "#fbf6ea", rough = 0.35, bone = "head" } = {}) {
    const [lr, ls] = this.seg.line;
    this.add(tube(points.map(p => V(...p)), { radius: t => r0 + (r1 - r0) * t, radial: Math.max(5, lr), segments: Math.max(3, ls >> 1), capRings: this.seg.cap }), { bone, color, rough });
  }

  /* a thin line (whiskers) */
  line(points, { r = 0.0024, color = "#fffaf0", rough = 0.4, bone = "head" } = {}) {
    const [lr, ls] = this.seg.line;
    this.add(tube(points.map(p => V(...p)), { radius: r, radial: Math.min(5, lr), segments: ls, capRings: 1 }), { bone, color, rough });
  }

  /* a small rounded block (teeth) */
  block(center, size, { color = "#ffffff", rough = 0.3, bone = "head", rot = null } = {}) {
    const [bw, bh] = this.seg.small;
    const g = ball(size, { w: bw, h: bh, n: 3.2 });
    if (rot) xf(g, { rot });
    xf(g, { at: center });
    this.add(g, { bone, color, rough });
  }
}
