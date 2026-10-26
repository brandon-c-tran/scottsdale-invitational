/* The takeout bar at the end of the river: a plank deck on the bank, a
   shack with a tin roof, a neon BAR sign that buzzes, and the podium on the
   deck's edge facing the water (1st in the middle, highest). */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* the letters as stroked polylines on a 1 x 1.4 cell */
const LETTERS = {
  B:[[[0, 0], [0, 1.4], [0.62, 1.4], [0.84, 1.22], [0.84, 0.88], [0.62, 0.72], [0, 0.72]], [[0.62, 0.72], [0.9, 0.52], [0.9, 0.18], [0.66, 0], [0, 0]]],
  A:[[[0, 0], [0.45, 1.4], [0.9, 0]], [[0.18, 0.55], [0.72, 0.55]]],
  R:[[[0, 0], [0, 1.4], [0.62, 1.4], [0.86, 1.18], [0.86, 0.9], [0.62, 0.7], [0, 0.7]], [[0.5, 0.7], [0.92, 0]]],
};

function tubeFor(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, "catmullrom", 0.05);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 6, false);
}

/* where the bar stands: the last leg's takeout bar (a zone "bar", on its side) */
export function barSite(geo) {
  const legs = geo.legs;
  const last = legs[legs.length - 1] || { s0:0, s1:geo.length, finish:geo.length - 30 };
  const zone = geo.zones.find(z => z.k === "bar" && z.s0 >= (last.s0 ?? 0) && z.s1 <= (last.s1 ?? geo.length) + 1);
  const s = zone ? Math.min(geo.length - 6, (zone.s0 + zone.s1) / 2 + 2) : Math.min(geo.length - 6, last.finish + 12);
  return { s, side:zone?.side === -1 ? -1 : 1 };
}

export function buildBar(geo, field) {
  const { s, side } = barSite(geo);
  const p = geo.sample(s);
  const back = p.w / 2 + 9;
  const x = p.x + p.nx * side * back, y = p.y + p.ny * side * back;
  const ground = field ? field.heightAt(x, y) : geo.elevAt(s) + 1;
  const deckZ = ground + 0.55;
  /* the podium faces the river */
  const fx = -p.nx * side, fy = -p.ny * side;
  const heading = Math.atan2(fy, fx);
  const group = new THREE.Group();
  group.name = "bar";
  group.position.set(x, deckZ, -y);
  /* local frame: +x toward the river, +z along the river (downstream left) */
  group.rotation.y = heading;
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };
  const wood = keep(new THREE.MeshLambertMaterial({ color:"#6b4128" }));
  const woodDark = keep(new THREE.MeshLambertMaterial({ color:"#3d2416" }));
  const tin = keep(new THREE.MeshLambertMaterial({ color:"#5d6a78" }));
  const box = (w, h, d, mat, px, py, pz) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(px, py, pz);
    group.add(m);
    return m;
  };
  /* deck on stilts, the shack behind, a roof */
  box(10, 0.35, 15, wood, 0, -0.18, 0);
  for (const sx of [-4.6, 4.6]) for (const sz of [-7, 0, 7]) box(0.3, 1.6, 0.3, woodDark, sx, -1.0, sz);
  box(4.6, 3.4, 9, woodDark, -3.2, 1.7, 0);
  const roof = box(6.2, 0.18, 10.4, tin, -2.6, 3.65, 0);
  roof.rotation.z = -0.16;
  box(0.9, 1.1, 8, wood, -0.4, 0.55, 0); /* the counter */
  /* the podium, front of the deck: 2nd at -z (left from the water), 1st centre, 3rd +z */
  const gold = keep(new THREE.MeshStandardMaterial({ color:"#ffa630", roughness:0.35, metalness:0.15 }));
  const silver = keep(new THREE.MeshStandardMaterial({ color:"#a9b4c2", roughness:0.35, metalness:0.2 }));
  const bronze = keep(new THREE.MeshStandardMaterial({ color:"#d08a52", roughness:0.4, metalness:0.15 }));
  const steps = [
    { place:1, h:1.5, z:0, mat:gold },
    { place:2, h:1.05, z:2.6, mat:silver },
    { place:3, h:0.7, z:-2.6, mat:bronze },
  ];
  steps.forEach(st => box(2.4, st.h, 2.4, st.mat, 3.2, st.h / 2, st.z));
  /* the neon sign over the shack, facing the water */
  const neonBase = new THREE.Color("#ff3fa4").multiplyScalar(2.1);
  const neonMat = keep(new THREE.MeshBasicMaterial({ color:neonBase.clone(), toneMapped:false }));
  const frameMat = keep(new THREE.MeshBasicMaterial({ color:new THREE.Color("#5fdcf0").multiplyScalar(2.6), toneMapped:false }));
  const parts = [];
  "BAR".split("").forEach((ch, k) => {
    for (const stroke of LETTERS[ch]) {
      const tube = tubeFor(stroke, 0.07);
      tube.translate(k * 1.25, 0, 0);
      parts.push(tube);
    }
  });
  const letters = new THREE.Mesh(keep(mergeGeometries(parts, false)), neonMat);
  parts.forEach(g => g.dispose());
  const sign = new THREE.Group();
  sign.add(letters);
  letters.position.set(-1.75, -0.7, 0);
  const frameCurve = [[-2.25, -1.0], [2.25, -1.0], [2.25, 1.0], [-2.25, 1.0], [-2.25, -1.0]];
  const frame = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(frameCurve.map(([a, b]) => new THREE.Vector3(a, b, -0.05)), false, "catmullrom", 0), 60, 0.05, 6, false)), frameMat);
  sign.add(frame);
  const signBack = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.9, 2.4)), keep(new THREE.MeshLambertMaterial({ color:"#1a1020" })));
  signBack.position.z = -0.12;
  sign.add(signBack);
  /* the sign faces the river: local +x */
  sign.rotation.y = Math.PI / 2;
  sign.scale.setScalar(1.25);
  sign.position.set(-1.6, 6.6, 0);
  group.add(sign);
  const light = new THREE.PointLight("#ff4fae", 26, 26, 1.6);
  light.position.set(1.5, 6.2, 0);
  group.add(light);
  /* the deck's lamp hangs out over the water, in front of the steps, so it
     lights the winners' faces instead of burning a spot on the first */
  const deckLight = new THREE.PointLight("#ffb468", 22, 24, 1.6);
  deckLight.position.set(8.5, 5.2, 0);
  group.add(deckLight);

  /* world positions of the podium tops, and the way they face */
  const tops = steps.map(st => {
    const local = new THREE.Vector3(3.2, st.h, st.z);
    const c = Math.cos(heading), sn = Math.sin(heading);
    /* rotation.y = heading maps local (lx, lz) to world (lx cos + lz sin, -lx sin + lz cos) in three's x,z */
    const wx = local.x * c + local.z * sn, wz = -local.x * sn + local.z * c;
    return { place:st.place, x:x + wx, y:y - wz, z:deckZ + st.h };
  });
  const front = tops[0];
  return {
    group, tops,
    anchor:{ x:front.x, y:front.y, z:deckZ + 1.5, fx, fy, heading },
    update(time) {
      /* the neon buzzes: a flicker now and then */
      const k = Math.sin(time * 37) > 0.97 || (Math.sin(time * 0.7) > 0.995) ? 0.35 : 1;
      neonMat.color.copy(neonBase).multiplyScalar(k);
      light.intensity = 26 * (0.6 + 0.4 * k);
    },
    dispose() { disposables.forEach(o => o.dispose?.()); light.dispose?.(); deckLight.dispose?.(); },
  };
}
