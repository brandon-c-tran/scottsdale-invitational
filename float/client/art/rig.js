/* The rig: a critter is one skinned mesh per finish (vinyl, the rider's
   tint, the eye glints) over one skeleton, so a whole critter is three draw
   calls however many parts it has, and arms bend like rubber hoses.

   RigBuilder collects painted parts with their bone weights at build time
   (bind pose: bones at rest positions, no rest rotation, so a point in
   critter space minus a bone's rest position is that point in the bone's
   space). instantiate() turns a template into bones and meshes for one
   critter. Expression variants (happy eyes, lids, mouths) are parts bound
   to leaf bones that sit at scale 0 until shown.

   solveArm() is the two-bone IK every arm pose goes through, allocation
   free. */
import * as THREE from "three";
import { paint, merge } from "./sculpt.js";

export class RigBuilder {
  constructor() {
    this.bones = [];
    this.index = new Map();
    this.parts = { vinyl: [], tint: [], glint: [] };
  }

  bone(name, parent, at) {
    if (this.index.has(name)) throw new Error(`rig: bone ${name} twice`);
    const i = this.bones.length;
    this.bones.push({ name, parent: parent == null ? -1 : this.idx(parent), at: new THREE.Vector3(...at) });
    this.index.set(name, i);
    return i;
  }

  idx(name) {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`rig: no bone ${name}`);
    return i;
  }

  has(name) { return this.index.has(name); }

  /* a bone's rest position (critter space) */
  at(name) { return this.bones[this.idx(name)].at; }

  /* add a part. color: a hex or a per-vertex fn (sculpt.paint); bind: a bone
     name, or fn(p) -> [[bone, weight], ...] (up to four) */
  add(geo, { layer = "vinyl", color = "#ffffff", bind = "root" } = {}) {
    if (!geo) return null;
    paint(geo, color);
    const n = geo.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    if (typeof bind === "string") {
      const b = this.idx(bind);
      for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    } else {
      const p = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        p.fromBufferAttribute(geo.attributes.position, i);
        const list = bind(p).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = list.reduce((s, [, w]) => s + w, 0) || 1;
        list.forEach(([name, w], k) => { si[i * 4 + k] = this.idx(name); sw[i * 4 + k] = w / total; });
        if (!list.length) sw[i * 4] = 1;
      }
    }
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    this.parts[layer].push(geo);
    return geo;
  }

  build() {
    const geos = {};
    for (const [layer, list] of Object.entries(this.parts)) geos[layer] = list.length ? merge(list) : null;
    return {
      bones: this.bones.map(b => ({ name: b.name, parent: b.parent, at: b.at.clone() })),
      geos,
    };
  }
}

const IDENTITY = new THREE.Matrix4();

/* one critter's bones and meshes from a template */
export function instantiate(template, materials) {
  const root = new THREE.Group();
  const bones = template.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  template.bones.forEach((b, i) => {
    if (b.parent >= 0) {
      bones[i].position.copy(b.at).sub(template.bones[b.parent].at);
      bones[b.parent].add(bones[i]);
    } else {
      bones[i].position.copy(b.at);
      root.add(bones[i]);
    }
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const meshes = {};
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.45, 0.2), 2.1);
  for (const [layer, geo] of Object.entries(template.geos)) {
    if (!geo || !materials[layer]) continue;
    const mesh = new THREE.SkinnedMesh(geo, materials[layer]);
    mesh.name = `critter-${layer}`;
    mesh.boundingSphere = sphere.clone();
    root.add(mesh);
    mesh.bind(skeleton, IDENTITY);
    meshes[layer] = mesh;
  }
  const byName = {};
  bones.forEach(b => { byName[b.name] = b; });
  return { root, bones: byName, list: bones, skeleton, meshes };
}

/* ── two-bone IK ─────────────────────────────────────────────────────────
   In the shoulder's parent space (the chest): shoulder S, hand target T,
   pole hint P (where the elbow should bulge). bind: { dir, pole, a, b }
   where dir is the arm's rest direction and pole its rest bulge direction
   (unit, perpendicular). Writes the shoulder and elbow quaternions and
   returns the stretch (1 when the target is in reach). */
const _v = new THREE.Vector3(), _vn = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3();
const _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _mb = new THREE.Matrix4(), _md = new THREE.Matrix4(), _qb = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _bz = new THREE.Vector3();

export function solveArm(S, T, P, bind, outShoulder, outElbow, maxStretch = 1.45) {
  const { dir, pole, a, b } = bind;
  _v.subVectors(T, S);
  let d = _v.length();
  if (d < 1e-5) { _v.copy(dir); d = 1e-5; }
  _vn.copy(_v).divideScalar(d);
  const reach = (a + b) * 0.995;
  let k = 1;
  if (d > reach) { k = Math.min(d / reach, maxStretch); }
  const A = a * k, B = b * k;
  const dd = Math.min(d, (A + B) * 0.999);
  const cosA = THREE.MathUtils.clamp((A * A + dd * dd - B * B) / (2 * A * dd), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  /* the bulge direction: the pole hint, square to the reach line */
  _u.copy(P).addScaledVector(_vn, -P.dot(_vn));
  if (_u.lengthSq() < 1e-8) _u.copy(pole).addScaledVector(_vn, -pole.dot(_vn));
  if (_u.lengthSq() < 1e-8) _u.set(0, 0, 1).addScaledVector(_vn, -_vn.z);
  _u.normalize();
  _e.copy(S).addScaledVector(_vn, A * cosA).addScaledVector(_u, A * sinA);
  _u1.subVectors(_e, S).normalize();
  _u2.copy(S).addScaledVector(_vn, dd).sub(_e).normalize();
  /* shoulder: the bind frame (dir, pole) onto (u1, bulge) */
  _bz.crossVectors(dir, pole).normalize();
  _mb.makeBasis(dir, pole, _bz);
  _y.copy(_u).addScaledVector(_u1, -_u.dot(_u1)).normalize();
  _z.crossVectors(_u1, _y).normalize();
  _md.makeBasis(_u1, _y, _z);
  _qb.setFromRotationMatrix(_mb);
  outShoulder.setFromRotationMatrix(_md).multiply(_qi.copy(_qb).invert());
  /* elbow: the forearm, seen from the shoulder, from dir to u2 */
  _qi.copy(outShoulder).invert();
  _u2.applyQuaternion(_qi);
  outElbow.setFromUnitVectors(dir, _u2);
  return k;
}
