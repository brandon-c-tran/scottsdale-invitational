/* Sculpting: smooth procedural shapes for the vinyl toys. Build time only
   (allocation is fine here, nothing in this file runs per frame). Every
   builder returns an indexed BufferGeometry with position and normal; uv
   only where a texture needs it. Normals come from the shape's own function
   (finite differences), never from the triangles, so a seam never shades.

   A "blob" is a closed, star-shaped surface: a function from a unit direction
   to a point. A superellipsoid gives the chunky rounded-box heads, `warp`
   tapers, bends and bulges it, and patches and bands are cut from the same
   function, so markings, swimsuits and lids sit exactly on the surface. */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, -1);

/* ── blobs ─────────────────────────────────────────────────────────────── */

/* r: radii [x, y, z]; n: 2 is an ellipsoid, 2.5 to 4 rounder boxes; at: the
   centre; warp(p, d): bends the local point in place (before `at`); rot: an
   Euler [x, y, z] applied after warp, before `at`. */
export function blob({ r = [0.2, 0.2, 0.2], n = 2, at = [0, 0, 0], warp = null, rot = null } = {}) {
  const [rx, ry, rz] = r;
  const center = new THREE.Vector3(...at);
  const q = rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)) : null;
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const c = new THREE.Vector3(), e = new THREE.Vector3(), dd = new THREE.Vector3();
  const local = (d, out) => {
    const s = 1 / Math.pow(Math.abs(d.x / rx) ** n + Math.abs(d.y / ry) ** n + Math.abs(d.z / rz) ** n, 1 / n);
    out.set(d.x * s, d.y * s, d.z * s);
    if (warp) warp(out, d);
    if (q) out.applyQuaternion(q);
    return out;
  };
  const shape = {
    center, r, n,
    /* the surface point for a unit direction d (in the blob's own frame) */
    at(d, out = new THREE.Vector3()) { return local(d, out).add(center); },
    /* the outward normal there */
    normal(d, out = new THREE.Vector3()) {
      tangents(d, t1, t2);
      const h = 0.002;
      local(dd.copy(d).addScaledVector(t1, h).normalize(), a);
      local(dd.copy(d).addScaledVector(t1, -h).normalize(), b);
      a.sub(b);
      local(dd.copy(d).addScaledVector(t2, h).normalize(), c);
      local(dd.copy(d).addScaledVector(t2, -h).normalize(), e);
      c.sub(e);
      out.crossVectors(a, c).normalize();
      local(d, e);
      if (out.dot(e) < 0) out.negate();
      return out;
    },
  };
  return shape;
}

/* two unit tangents around a unit direction (any consistent pair) */
export function tangents(d, t1, t2) {
  const ref = Math.abs(d.y) < 0.9 ? UP : FWD;
  t1.crossVectors(ref, d).normalize();
  t2.crossVectors(d, t1).normalize();
}

/* a unit direction from yaw (around y, 0 is -z, positive toward +x) and pitch (up) */
export function dirYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
}

/* the whole closed surface. axis: the sphere's pole direction (default +y);
   theta [start, length] and phi [start, length] cut a region (bands, caps). */
export function blobGeometry(shape, { w = 24, h = 16, axis = null, theta = [0, Math.PI], phi = [0, Math.PI * 2], lift = 0, flip = false } = {}) {
  const q = axis ? new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...axis).normalize()) : null;
  const pos = [], nor = [], idx = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), nn = new THREE.Vector3();
  const [t0, tl] = theta, [p0, pl] = phi;
  for (let i = 0; i <= h; i++) {
    const th = t0 + (i / h) * tl;
    for (let j = 0; j <= w; j++) {
      const ph = p0 + (j / w) * pl;
      d.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
      if (q) d.applyQuaternion(q);
      d.normalize();
      shape.at(d, p);
      shape.normal(d, nn);
      if (lift) p.addScaledVector(nn, lift);
      pos.push(p.x, p.y, p.z);
      if (flip) nor.push(-nn.x, -nn.y, -nn.z); else nor.push(nn.x, nn.y, nn.z);
    }
  }
  const full = Math.abs(tl - Math.PI) < 1e-6 && t0 === 0;
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const a = i * (w + 1) + j, b = a + w + 1, c = b + 1, e = a + 1;
      const top = i === 0 && t0 === 0, bottom = i === h - 1 && full;
      if (flip) {
        if (!top) idx.push(a, e, b);
        if (!bottom) idx.push(e, c, b);
      } else {
        if (!top) idx.push(a, b, e);
        if (!bottom) idx.push(b, c, e);
      }
    }
  }
  return indexed(pos, nor, idx);
}

/* an elliptical patch on a blob around centre direction `dir`, `ax` and `ay`
   radians across and up (exponential map, so big patches stay round).
   shape(theta) scales the edge (1 = ellipse); lift raises it off the surface. */
export function patchGeometry(shapeFn, { dir = [0, 0, -1], up = [0, 1, 0], ax = 0.4, ay = 0.4, rings = 5, segs = 20, lift = 0.004, edge = null, spin = 0 } = {}) {
  const c = new THREE.Vector3(...dir).normalize();
  const u = new THREE.Vector3(...up).normalize();
  const t2 = u.clone().addScaledVector(c, -u.dot(c)).normalize();
  const t1 = new THREE.Vector3().crossVectors(t2, c).normalize();
  if (spin) { t1.applyAxisAngle(c, spin); t2.applyAxisAngle(c, spin); }
  const pos = [], nor = [], idx = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), v = new THREE.Vector3();
  const put = (ex, ey) => {
    const ang = Math.hypot(ex, ey);
    if (ang < 1e-9) d.copy(c);
    else {
      v.copy(t1).multiplyScalar(ex / ang).addScaledVector(t2, ey / ang);
      d.copy(c).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang)).normalize();
    }
    shapeFn.at(d, p);
    shapeFn.normal(d, n);
    p.addScaledVector(n, lift);
    pos.push(p.x, p.y, p.z);
    nor.push(n.x, n.y, n.z);
  };
  put(0, 0);
  for (let k = 1; k <= rings; k++) {
    const rho = k / rings;
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const m = edge ? edge(th) : 1;
      put(-Math.cos(th) * ax * rho * m, Math.sin(th) * ay * rho * m);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let k = 1; k < rings; k++) {
    const r0 = 1 + (k - 1) * segs, r1 = 1 + k * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(r0 + s, r1 + s, r1 + s1, r0 + s, r1 + s1, r0 + s1);
    }
  }
  return orient(indexed(pos, nor, idx));
}

/* ── sweeps ─────────────────────────────────────────────────────────────── */

/* A tube along points (Catmull-Rom), radius a number or f(t) for t in 0..1,
   rounded caps, analytic normals. side: a direction the cross-section's
   first axis leans toward (for flat things: wings, ears, feathers); flat:
   the cross-section's second axis as a share of the first. */
export function tube(points, { radius = 0.05, radial = 8, segments = 12, caps = [true, true], capRings = 2, side = null, flat = 1, closed = false, tension = 0.5 } = {}) {
  const pts = points.map(p => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, closed, "catmullrom", tension);
  const rad = typeof radius === "function" ? radius : () => radius;
  const len = curve.getLength();
  const P = [], T = [], N = [], B = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    P.push(curve.getPointAt(t));
    T.push(curve.getTangentAt(t).normalize());
  }
  /* frames: toward `side` when asked, else parallel transport */
  const sideV = side ? new THREE.Vector3(...side).normalize() : null;
  let n0;
  if (sideV) n0 = sideV.clone().addScaledVector(T[0], -sideV.dot(T[0]));
  if (!n0 || n0.lengthSq() < 1e-6) {
    const ref = Math.abs(T[0].y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
    n0 = new THREE.Vector3().crossVectors(T[0], ref);
  }
  n0.normalize();
  for (let i = 0; i <= segments; i++) {
    let n;
    if (i === 0) n = n0.clone();
    else if (sideV) {
      n = sideV.clone().addScaledVector(T[i], -sideV.dot(T[i]));
      if (n.lengthSq() < 1e-6) n = N[i - 1].clone();
    } else {
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      n = N[i - 1].clone();
      if (axis.lengthSq() > 1e-10) n.applyAxisAngle(axis.normalize(), Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1)));
    }
    n.addScaledVector(T[i], -n.dot(T[i])).normalize();
    N.push(n);
    B.push(new THREE.Vector3().crossVectors(T[i], n).normalize());
  }
  const pos = [], nor = [], idx = [];
  const ring = (c, t, n, b, r, along) => {
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(c.x + (n.x * ca + b.x * sa * flat) * r, c.y + (n.y * ca + b.y * sa * flat) * r, c.z + (n.z * ca + b.z * sa * flat) * r);
      /* the ellipse's normal, tilted by the taper */
      const nx = n.x * ca / 1 + b.x * sa / flat, ny = n.y * ca + b.y * sa / flat, nz = n.z * ca + b.z * sa / flat;
      const l = Math.hypot(nx, ny, nz) || 1;
      const tx = nx / l - t.x * along, ty = ny / l - t.y * along, tz = nz / l - t.z * along;
      const l2 = Math.hypot(tx, ty, tz) || 1;
      nor.push(tx / l2, ty / l2, tz / l2);
    }
  };
  let rowCount = 0;
  const capOf = (end) => {
    const i = end ? segments : 0;
    const dir = end ? 1 : -1;
    const r = rad(end ? 1 : 0);
    const rows = [];
    for (let s = capRings; s >= 1; s--) {
      const phi = (s / capRings) * (Math.PI / 2);
      rows.push({ c: P[i].clone().addScaledVector(T[i], dir * r * Math.sin(phi) * 0.9), r: r * Math.cos(phi), along: -dir * Math.sin(phi) / Math.max(1e-3, Math.cos(phi)) });
    }
    return end ? rows.reverse() : rows;
  };
  const dr = i => {
    const t0 = Math.max(0, i / segments - 0.01), t1 = Math.min(1, i / segments + 0.01);
    return (rad(t1) - rad(t0)) / ((t1 - t0) * len);
  };
  const emitRow = (c, t, n, b, r, along) => { ring(c, t, n, b, r, along); rowCount++; };
  const clampAlong = v => Math.max(-8, Math.min(8, v));
  if (caps[0]) for (const row of capOf(false)) emitRow(row.c, T[0], N[0], B[0], Math.max(row.r, 1e-4), clampAlong(row.along));
  for (let i = 0; i <= segments; i++) emitRow(P[i], T[i], N[i], B[i], rad(i / segments), dr(i));
  if (caps[1]) for (const row of capOf(true)) emitRow(row.c, T[segments], N[segments], B[segments], Math.max(row.r, 1e-4), clampAlong(row.along));
  for (let i = 0; i < rowCount - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return orient(indexed(pos, nor, idx));
}

/* a lathe around y from [radius, y] points, with normals from the profile */
export function lathe(profile, { segments = 24, phi = [0, Math.PI * 2] } = {}) {
  const geo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), segments, phi[0], phi[1]);
  geo.deleteAttribute("uv");
  return geo;
}

/* a smooth profile through points, sampled n times (for lathes) */
export function spline2(points, n = 24) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getSpacedPoints(n).map(v => [v.x, v.y]);
}

/* a flat shape extruded with a rounded bevel, centred on its depth */
export function extrude(shape, { depth = 0.02, bevel = 0.008, bevelSegments = 2, curveSegments = 10 } = {}) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.deleteAttribute("uv");
  return mergeVertices(geo, 1e-6);
}

/* a torus lying flat (axis y), u around the ring (0 at +x, pi/2 at -z),
   v around the tube (0 at the outer equator, pi/2 on top). rOf(u, v) may
   vary the tube; vArc cuts a band (stripes, frosting); vOf(u, t) bends the
   band's edges (t 0..1 across it), for drips. */
export function torus({ R = 0.5, r = 0.2, radial = 12, tubular = 32, rOf = null, squash = 1, arc = Math.PI * 2, u0 = 0, vArc = null, vOf = null } = {}) {
  const pos = [], nor = [], idx = [];
  for (let j = 0; j <= radial; j++) {
    const tj = j / radial;
    const vBase = vArc ? vArc[0] + tj * vArc[1] : tj * Math.PI * 2;
    for (let i = 0; i <= tubular; i++) {
      const u = u0 + (i / tubular) * arc;
      const v = vOf ? vOf(u, tj, vBase) : vBase;
      const rr = rOf ? rOf(u, v) : r;
      const cx = Math.cos(u), cz = -Math.sin(u);
      const x = (R + rr * Math.cos(v)) * cx, y = rr * Math.sin(v) * squash, z = (R + rr * Math.cos(v)) * cz;
      pos.push(x, y, z);
      const nx = Math.cos(v) * cx, ny = Math.sin(v) / squash, nz = Math.cos(v) * cz;
      const l = Math.hypot(nx, ny, nz);
      nor.push(nx / l, ny / l, nz / l);
    }
  }
  for (let j = 0; j < radial; j++) {
    for (let i = 0; i < tubular; i++) {
      const a = j * (tubular + 1) + i, b = (j + 1) * (tubular + 1) + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return orient(indexed(pos, nor, idx));
}

/* a plain sphere/ellipsoid (rx, ry, rz) */
export function ball(r = [0.05, 0.05, 0.05], { w = 10, h = 8, n = 2, at = [0, 0, 0], rot = null } = {}) {
  const rr = Array.isArray(r) ? r : [r, r, r];
  return blobGeometry(blob({ r: rr, n, at, rot }), { w, h });
}

/* a rounded box via the superellipsoid */
export function roundBox([x, y, z], { n = 6, w = 16, h = 12, at = [0, 0, 0] } = {}) {
  return blobGeometry(blob({ r: [x / 2, y / 2, z / 2], n, at }), { w, h });
}

/* ── geometry plumbing ─────────────────────────────────────────────────── */

export function indexed(pos, nor, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/* make every triangle wind counter-clockwise seen from its normals' side */
export function orient(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, index = geo.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3(), m = new THREE.Vector3();
  let agree = 0, disagree = 0;
  for (let t = 0; t < index.length; t += 3) {
    a.fromBufferAttribute(p, index[t]); b.fromBufferAttribute(p, index[t + 1]); c.fromBufferAttribute(p, index[t + 2]);
    f.subVectors(b, a).cross(c.sub(a));
    if (f.lengthSq() < 1e-14) continue;
    m.fromBufferAttribute(n, index[t]);
    if (f.dot(m) >= 0) agree++; else disagree++;
  }
  if (disagree > agree) {
    for (let t = 0; t < index.length; t += 3) { const x = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = x; }
    geo.index.needsUpdate = true;
  }
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/* move, turn (Euler radians) and scale a geometry in place; returns it */
export function xf(geo, { at = null, rot = null, scale = null, order = "XYZ" } = {}) {
  _p.set(...(at || [0, 0, 0]));
  _q.setFromEuler(_e.set(...(rot || [0, 0, 0]), order));
  _s.set(...(scale ? (Array.isArray(scale) ? scale : [scale, scale, scale]) : [1, 1, 1]));
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  if (_s.x * _s.y * _s.z < 0) flipWinding(geo);
  return geo;
}

export function flipWinding(geo) {
  const index = geo.index.array;
  for (let t = 0; t < index.length; t += 3) { const x = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = x; }
  geo.index.needsUpdate = true;
  return geo;
}

/* a copy mirrored across x (left from right), winding kept outward */
export function mirrorX(geo) {
  return xf(geo.clone(), { scale: [-1, 1, 1] });
}

const _c = new THREE.Color();
/* paint every vertex one color, or color(p, n, out:Color) per vertex */
export function paint(geo, color) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  if (typeof color === "function") {
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(geo.attributes.position, i);
      n.fromBufferAttribute(geo.attributes.normal, i);
      const out = color(p, n, _c.set(0xffffff)) || _c;
      arr[i * 3] = out.r; arr[i * 3 + 1] = out.g; arr[i * 3 + 2] = out.b;
    }
  } else {
    _c.set(color);
    for (let i = 0; i < count; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* merge painted parts into one geometry (same attributes on every part) */
export function merge(parts) {
  const list = parts.filter(Boolean);
  if (!list.length) return null;
  const names = Object.keys(list[0].attributes);
  for (const g of list) {
    for (const name of Object.keys(g.attributes)) if (!names.includes(name)) g.deleteAttribute(name);
    if (!g.index) throw new Error("sculpt.merge: every part must be indexed");
  }
  const geo = mergeGeometries(list, false);
  if (!geo) throw new Error("sculpt.merge: parts disagree on attributes");
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export const triangles = geo => (geo ? (geo.index ? geo.index.count : geo.attributes.position.count) / 3 : 0);

/* a smooth step and an ease used by warps */
export const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* points along a circle arc in the xy plane, for tubes */
export function arcPoints(cx, cy, r, a0, a1, n = 6, z = 0) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
  return out;
}

export { mergeVertices };
