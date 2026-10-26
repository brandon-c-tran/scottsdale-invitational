/* The banks' dressing, all instanced or merged so it costs a handful of
   draws: rocks in the river and boulders on the banks, saguaros and scrub,
   the string lights (poles, wires, bulbs and their halos), the pools'
   floating lanterns, the bar's torches, and the mesas on the skyline. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm, noise2, rng } from "./cpuNoise.js";
import { NIGHT } from "./palette.js";
import { FAR_TINT } from "./terrain.js";

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);

function rockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const n = 1 + noise2(x * 1.7 + seed, z * 1.7 - seed, seed) * 0.42 + noise2(y * 3.1, x * 3.1, seed + 3) * 0.12;
    pos.setXYZ(k, x * n, y * n * (y < 0 ? 0.7 : 1), z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function saguaroGeometry() {
  const parts = [];
  const add = (geo, x, y, z, rx = 0, rz = 0) => {
    geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z); parts.push(geo);
  };
  /* low enough in polygons for a few hundred, round enough at a distance */
  const trunk = new THREE.CylinderGeometry(0.34, 0.4, 5.2, 7, 1, true);
  add(trunk, 0, 2.6, 0);
  add(new THREE.SphereGeometry(0.34, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, 5.2, 0);
  /* left arm: out, then up */
  add(new THREE.CylinderGeometry(0.22, 0.24, 1.0, 6, 1, true), -0.55, 2.4, 0, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.22, 0.22, 1.7, 6, 1, true), -1.0, 3.2, 0);
  add(new THREE.SphereGeometry(0.22, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), -1.0, 4.05, 0);
  add(new THREE.SphereGeometry(0.235, 6, 4), -1.0, 2.4, 0);
  /* right arm, higher */
  add(new THREE.CylinderGeometry(0.2, 0.22, 0.8, 6, 1, true), 0.5, 3.3, 0, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6, 1, true), 0.85, 3.9, 0);
  add(new THREE.SphereGeometry(0.2, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0.85, 4.5, 0);
  add(new THREE.SphereGeometry(0.215, 6, 4), 0.85, 3.3, 0);
  const merged = mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g), false);
  parts.forEach(g => g.dispose());
  merged.computeVertexNormals();
  return merged;
}

function scrubGeometry() {
  const parts = [];
  const r = rng(5);
  for (let k = 0; k < 4; k++) {
    const g = new THREE.IcosahedronGeometry(0.42 + r() * 0.25, 0);
    g.scale(1, 0.62, 1);
    g.translate((r() - 0.5) * 0.7, 0.25, (r() - 0.5) * 0.7);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}

export function buildDressing(geo, field, plan, { glowTex }) {
  const group = new THREE.Group();
  group.name = "dressing";
  const disposables = [];
  const keep = (...items) => { disposables.push(...items); return items[0]; };
  const r = rng(77);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3(), color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  /* rocks in the river, boulders on the banks */
  /* instance colours multiply the material's: keep it white */
  const rockMat = keep(new THREE.MeshLambertMaterial({ color:"#ffffff" }));
  const rockGeo = keep(rockGeometry(3));
  const boulders = [];
  for (let k = 0; k < 520 && boulders.length < 170; k++) {
    const s = r() * geo.length;
    const p = geo.sample(s);
    const side = r() < 0.5 ? 1 : -1;
    const off = side * (p.w / 2 + 0.4 + r() * 3.5);
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (geo.islands.some(([ix, iy, ir]) => Math.hypot(x - ix, y - iy) < ir + 2)) continue;
    boulders.push({ x, y, z:field.heightAt(x, y) - 0.2, r:0.5 + r() * 1.1 });
  }
  const rockItems = [
    ...geo.rocks.map(([x, y, rr]) => ({ x, y, z:geo.elevAt(geo.nearest(x, y).s) - rr * 0.32, r:rr, river:true })),
    ...boulders,
  ];
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockItems.length);
  rockItems.forEach((it, k) => {
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    sc.set(it.r * (0.9 + r() * 0.3), it.r * (0.62 + r() * 0.25), it.r * (0.9 + r() * 0.3));
    m4.compose(at.copy(v3(it.x, it.y, it.z)), q, sc);
    rocks.setMatrixAt(k, m4);
    color.set(it.river ? "#7d5038" : "#8c5e40").multiplyScalar(0.85 + r() * 0.3);
    rocks.setColorAt(k, color);
  });
  rocks.computeBoundingSphere();
  rocks.name = "rocks";
  group.add(rocks);

  /* saguaros and scrub on the beaches and the rims */
  const cactusGeo = keep(saguaroGeometry());
  const cactusMat = keep(new THREE.MeshLambertMaterial({ color:"#ffffff" }));
  const scrubGeo = keep(scrubGeometry());
  const scrubMat = keep(new THREE.MeshLambertMaterial({ color:"#ffffff" }));
  const cacti = [], scrub = [];
  const { bounds } = geo;
  for (let k = 0; k < 9000 && (cacti.length < 260 || scrub.length < 700); k++) {
    const x = bounds.minX - 110 + r() * (bounds.maxX - bounds.minX + 220);
    const y = bounds.minY - 110 + r() * (bounds.maxY - bounds.minY + 220);
    const info = field.bankInfo(x, y);
    if (info.d < 4 || info.d > 135) continue;
    if (geo.islands.some(([ix, iy, ir]) => Math.hypot(x - ix, y - iy) < ir + 1)) continue;
    const kind = field.kindAt(x, y);
    if (kind === 4 || kind <= 1) continue;
    const z = field.heightAt(x, y);
    const dense = 0.35 + 0.65 * (fbm(x * 0.012, y * 0.012, 2, 21) + 0.5);
    if (cacti.length < 260 && r() < 0.22 * dense) cacti.push({ x, y, z, s:0.75 + r() * 0.65, a:r() * Math.PI * 2 });
    else if (scrub.length < 700 && r() < 0.6) scrub.push({ x, y, z, s:0.6 + r() * 0.9, a:r() * Math.PI * 2 });
  }
  const cactusMesh = new THREE.InstancedMesh(cactusGeo, cactusMat, Math.max(1, cacti.length));
  cacti.forEach((it, k) => {
    q.setFromAxisAngle(up, it.a);
    sc.setScalar(it.s);
    m4.compose(at.copy(v3(it.x, it.y, it.z - 0.15)), q, sc);
    cactusMesh.setMatrixAt(k, m4);
    color.set(NIGHT.cactus).multiplyScalar(0.8 + r() * 0.4);
    cactusMesh.setColorAt(k, color);
  });
  cactusMesh.count = cacti.length;
  cactusMesh.computeBoundingSphere();
  cactusMesh.name = "saguaros";
  group.add(cactusMesh);
  const scrubMesh = new THREE.InstancedMesh(scrubGeo, scrubMat, Math.max(1, scrub.length));
  scrub.forEach((it, k) => {
    q.setFromAxisAngle(up, it.a);
    sc.set(it.s, it.s * (0.7 + r() * 0.5), it.s);
    m4.compose(at.copy(v3(it.x, it.y, it.z - 0.08)), q, sc);
    scrubMesh.setMatrixAt(k, m4);
    color.set(r() < 0.3 ? "#6a6a3a" : NIGHT.scrub).multiplyScalar(0.75 + r() * 0.5);
    scrubMesh.setColorAt(k, color);
  });
  scrubMesh.count = scrub.length;
  scrubMesh.computeBoundingSphere();
  scrubMesh.name = "scrub";
  group.add(scrubMesh);

  /* the string lights */
  const poleGeo = keep(new THREE.CylinderGeometry(0.07, 0.09, 1, 6, 1).translate(0, 0.5, 0));
  const poleMat = keep(new THREE.MeshLambertMaterial({ color:"#3b2a20" }));
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, plan.poles.length));
  plan.poles.forEach((p, k) => {
    m4.compose(at.copy(v3(p.x, p.y, p.z - 0.3)), q.identity(), sc.set(1, p.h + 0.3, 1));
    poles.setMatrixAt(k, m4);
  });
  poles.count = plan.poles.length;
  poles.computeBoundingSphere();
  group.add(poles);
  const wirePos = [];
  for (const wire of plan.wires) for (let k = 1; k < wire.length; k++) {
    const a = wire[k - 1], b = wire[k];
    wirePos.push(a.x, a.z, -a.y, b.x, b.z, -b.y);
  }
  const wireGeo = keep(new THREE.BufferGeometry());
  wireGeo.setAttribute("position", new THREE.Float32BufferAttribute(wirePos, 3));
  const wires = new THREE.LineSegments(wireGeo, keep(new THREE.LineBasicMaterial({ color:"#20160f", transparent:true, opacity:0.75 })));
  group.add(wires);

  const bulbGeo = keep(new THREE.IcosahedronGeometry(0.12, 0));
  const bulbMat = keep(new THREE.MeshBasicMaterial({ toneMapped:false }));
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, Math.max(1, plan.bulbs.length));
  const haloPos = new Float32Array(plan.bulbs.length * 3), haloCol = new Float32Array(plan.bulbs.length * 3);
  plan.bulbs.forEach((b, k) => {
    m4.compose(at.copy(v3(b.x, b.y, b.z)), q.identity(), sc.setScalar(1));
    bulbs.setMatrixAt(k, m4);
    color.set(b.color).multiplyScalar(2.2);
    bulbs.setColorAt(k, color);
    haloPos[k * 3] = b.x; haloPos[k * 3 + 1] = b.z; haloPos[k * 3 + 2] = -b.y;
    color.set(b.color);
    haloCol[k * 3] = color.r; haloCol[k * 3 + 1] = color.g; haloCol[k * 3 + 2] = color.b;
  });
  bulbs.count = plan.bulbs.length;
  bulbs.computeBoundingSphere();
  bulbs.name = "bulbs";
  group.add(bulbs);
  const haloGeo = keep(new THREE.BufferGeometry());
  haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
  haloGeo.setAttribute("color", new THREE.BufferAttribute(haloCol, 3));
  const haloMat = keep(new THREE.PointsMaterial({ size:2.6, map:glowTex, vertexColors:true, transparent:true, depthWrite:false,
    blending:THREE.AdditiveBlending, opacity:0.55, sizeAttenuation:true, toneMapped:false }));
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.name = "halos";
  halos.renderOrder = 3;
  group.add(halos);

  /* floating lanterns and the bar's torches: small warm lamps that flicker */
  const lampGeo = keep(new THREE.IcosahedronGeometry(0.3, 1));
  const lampMat = keep(new THREE.MeshBasicMaterial({ toneMapped:false }));
  const lamps = [...plan.lanterns.map(l => ({ ...l, z:geo.elevAt(l.s) + 0.25, kind:"lantern" })),
    ...plan.torches.map(t => ({ ...t, z:t.z + 1.7, kind:"torch", color:"#ff9a3c" }))];
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, Math.max(1, lamps.length));
  const lampHaloPos = new Float32Array(lamps.length * 3), lampHaloCol = new Float32Array(lamps.length * 3);
  lamps.forEach((l, k) => {
    m4.compose(at.copy(v3(l.x, l.y, l.z)), q.identity(), sc.setScalar(l.kind === "torch" ? 0.8 : 1));
    lampMesh.setMatrixAt(k, m4);
    color.set(l.color).multiplyScalar(2.4);
    lampMesh.setColorAt(k, color);
    lampHaloPos[k * 3] = l.x; lampHaloPos[k * 3 + 1] = l.z; lampHaloPos[k * 3 + 2] = -l.y;
    color.set(l.color);
    lampHaloCol[k * 3] = color.r; lampHaloCol[k * 3 + 1] = color.g; lampHaloCol[k * 3 + 2] = color.b;
  });
  lampMesh.count = lamps.length;
  lampMesh.computeBoundingSphere();
  group.add(lampMesh);
  const lampHaloGeo = keep(new THREE.BufferGeometry());
  lampHaloGeo.setAttribute("position", new THREE.BufferAttribute(lampHaloPos, 3));
  lampHaloGeo.setAttribute("color", new THREE.BufferAttribute(lampHaloCol, 3));
  const lampHaloMat = keep(new THREE.PointsMaterial({ size:5.5, map:glowTex, vertexColors:true, transparent:true, depthWrite:false,
    blending:THREE.AdditiveBlending, opacity:0.5, sizeAttenuation:true, toneMapped:false }));
  const lampHalos = new THREE.Points(lampHaloGeo, lampHaloMat);
  lampHalos.renderOrder = 3;
  group.add(lampHalos);

  /* mesas on the skyline: dark, flat-topped, unfogged, a moonlit rim */
  const mesaParts = [];
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const mr = rng(91);
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2 + mr() * 0.3;
    const dist = 1500 + mr() * 900;
    const width = 160 + mr() * 380, depth = 120 + mr() * 160, height = 70 + mr() * 150;
    const shape = new THREE.Shape();
    const pts = 9;
    for (let j = 0; j < pts; j++) {
      const t = (j / pts) * Math.PI * 2;
      const rr = 1 + (mr() - 0.5) * 0.35;
      const px = Math.cos(t) * width / 2 * rr, py = Math.sin(t) * depth / 2 * rr;
      if (j === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth:height, bevelEnabled:true, bevelThickness:height * 0.35, bevelSize:Math.min(width, depth) * 0.22, bevelSegments:1, steps:1 });
    g.rotateX(-Math.PI / 2);
    g.rotateY(ang);
    g.translate(cx + Math.cos(ang) * dist, -20, -(cy + Math.sin(ang) * dist));
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    const pos = ng.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const base = new THREE.Color(NIGHT.mesa), rim = new THREE.Color("#3c3f78");
    for (let j = 0; j < pos.count; j++) {
      const t = THREE.MathUtils.clamp((pos.getY(j) + 20) / (height * 1.35), 0, 1);
      color.copy(base).lerp(rim, Math.pow(t, 3));
      col[j * 3] = color.r; col[j * 3 + 1] = color.g; col[j * 3 + 2] = color.b;
    }
    ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
    ng.deleteAttribute("uv");
    mesaParts.push(ng);
  }
  const mesaGeo = keep(mergeGeometries(mesaParts, false));
  mesaParts.forEach(g => g.dispose());
  const mesas = new THREE.Mesh(mesaGeo, keep(new THREE.MeshBasicMaterial({ vertexColors:true, fog:false })));
  mesas.name = "mesas";
  mesas.renderOrder = -5;
  group.add(mesas);

  /* the desert past the canyon, under the fog */
  /* the plain past the canyon's field: a sheet with the field cut out of it,
     so it never covers the river, at the level the field's edges fall to */
  const fx0 = field.x0, fy0 = field.y0, fx1 = field.x0 + (field.nx - 1) * field.step, fy1 = field.y0 + (field.ny - 1) * field.step;
  const outer = new THREE.Shape([[-6000, -6000], [6000, -6000], [6000, 6000], [-6000, 6000]].map(([x, y]) => new THREE.Vector2(cx + x, cy + y)));
  outer.holes.push(new THREE.Path([[fx0 + 4, fy0 + 4], [fx0 + 4, fy1 - 4], [fx1 - 4, fy1 - 4], [fx1 - 4, fy0 + 4]].map(([x, y]) => new THREE.Vector2(x, y))));
  const floorGeo = keep(new THREE.ShapeGeometry(outer));
  /* the shape is in (x, y); lay it down as (x, plain, -y) */
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, keep(new THREE.MeshLambertMaterial({ color:FAR_TINT })));
  /* just under the field's edge, which eases to this level (terrain.js) */
  floor.position.y = field.edge - 0.15;
  floor.renderOrder = -4;
  group.add(floor);

  return {
    group,
    update(time) {
      void time;
    },
    setDetail(level) {
      scrubMesh.visible = level >= 2;
      halos.visible = level >= 1;
      lampHalos.visible = level >= 1;
    },
    dispose() {
      disposables.forEach(item => item.dispose?.());
      [rocks, cactusMesh, scrubMesh, poles, bulbs, lampMesh].forEach(mesh => mesh.dispose?.());
    },
  };
}
