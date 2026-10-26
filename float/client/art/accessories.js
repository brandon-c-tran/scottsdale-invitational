/* What a critter wears: the gold chain with the rider's chip, the drink, and
   (hats.js) the hats and shades. Geometry is cached by species and detail;
   the chip's face is the rider's badge texture. */
import * as THREE from "three";
import { torus, tube, ball, lathe, xf, paint, merge, indexed } from "./sculpt.js";
import { gold, vinyl, tint, geometry } from "./materials.js";
import { BADGE_UV } from "./badge.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const CHIP = Object.freeze({ r: 0.074, h: 0.017 });

/* the chip: a front face (facing -z), a back face and its edge, uv'd into
   the badge atlas (face left half, edge strip bottom right) */
export function chipGeometry(segments = 40) {
  return geometry(`chip:${segments}`, () => {
    const { r, h } = CHIP;
    const pos = [], nor = [], uv = [], idx = [];
    const F = BADGE_UV.face, E = BADGE_UV.edge;
    const face = (z, nz, mirror) => {
      const c = pos.length / 3;
      pos.push(0, 0, z); nor.push(0, 0, nz); uv.push((F.u0 + F.u1) / 2, (F.v0 + F.v1) / 2);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
        pos.push(x, y, z); nor.push(0, 0, nz);
        /* seen from the front (-z) the viewer's right is -x */
        const u = mirror ? 0.5 + x / (2 * r) : 0.5 - x / (2 * r);
        uv.push(F.u0 + u * (F.u1 - F.u0), F.v0 + (0.5 + y / (2 * r)) * (F.v1 - F.v0));
      }
      for (let i = 0; i < segments; i++) idx.push(c, c + 1 + i, c + 2 + i);
    };
    face(-h / 2, -1, false);
    face(h / 2, 1, true);
    const s = pos.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
      for (const zz of [-h / 2, h / 2]) {
        pos.push(x * r, y * r, zz); nor.push(x, y, 0);
        uv.push(E.u0 + (i / segments) * (E.u1 - E.u0), zz < 0 ? E.v0 + 0.02 : E.v1 - 0.02);
      }
    }
    for (let i = 0; i < segments; i++) { const a = s + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = indexed(pos, nor, idx);
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    /* wind each face outward */
    const ix = geo.index.array, p = geo.attributes.position, n = geo.attributes.normal;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    for (let t = 0; t < ix.length; t += 3) {
      a.fromBufferAttribute(p, ix[t]); b.fromBufferAttribute(p, ix[t + 1]); c.fromBufferAttribute(p, ix[t + 2]);
      m.fromBufferAttribute(n, ix[t]);
      if (b.sub(a).cross(c.sub(a)).dot(m) < 0) { const x = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = x; }
    }
    geo.computeBoundingSphere();
    return geo;
  });
}

/* the chain: chunky links round the top of the body, dipping to the chip
   on the chest; a bezel and a bail. In chest-bone space. */
export function chainGeometry(template, detail = "race") {
  return geometry(`chain:${template.id}:${detail}`, () => {
    const body = template.shapes.body;
    const chest = template.bones.find(b => b.name === "chest").at;
    const lf = template.sockets.chain?.front ?? 0.55, lb = template.sockets.chain?.back ?? 1.05;
    const hero = detail === "hero";
    const pts = [];
    const span = 2.1;
    const N = hero ? 26 : 11;
    for (let i = 0; i <= N; i++) {
      const phi = -span + (i / N) * 2 * span;
      const k = ((1 + Math.cos(phi)) / 2) ** 1.4;
      const lam = lb + (lf - lb) * k;
      const d = V(Math.sin(phi) * Math.cos(lam), Math.sin(lam), -Math.cos(phi) * Math.cos(lam)).normalize();
      pts.push({ p: body.at(d).addScaledVector(body.normal(d), 0.013), n: body.normal(d), phi });
    }
    const parts = [];
    const linkR = 0.021, linkr = 0.0072;
    const lr = hero ? 6 : 3, lt = hero ? 12 : 6;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(pts.length - 1, i + 1)].p;
      const t = b.clone().sub(a).normalize();
      const n = pts[i].n.clone();
      const axis = i % 2 ? n.clone().cross(t).normalize() : n;
      const link = torus({ R: linkR, r: linkr, radial: lr, tubular: lt });
      xf(link, { scale: [1.25, 1, 1] });
      /* the torus' axis is y; turn it onto `axis` with its long side along t */
      const m = new THREE.Matrix4();
      const y = axis.clone().normalize(), x = t.clone().addScaledVector(y, -t.dot(y)).normalize(), z = new THREE.Vector3().crossVectors(x, y);
      m.makeBasis(x, y, z).setPosition(pts[i].p);
      link.applyMatrix4(m);
      parts.push(paint(link, "#ffffff"));
    }
    /* the bail and the bezel round the chip */
    const front = pts[Math.round(N / 2)];
    const chipAt = chipPlace(template);
    const bail = torus({ R: 0.016, r: 0.0065, radial: lr, tubular: lt + 2 });
    xf(bail, { rot: [0, 0, Math.PI / 2], at: [front.p.x, front.p.y - 0.012, front.p.z - 0.004] });
    parts.push(paint(bail, "#ffffff"));
    const bezel = torus({ R: CHIP.r + 0.003, r: 0.0085, radial: lr, tubular: hero ? 48 : 18 });
    const bm = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    bm.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(chipAt.q)).setPosition(chipAt.p);
    bezel.applyMatrix4(bm);
    parts.push(paint(bezel, "#ffffff"));
    const geo = merge(parts);
    geo.translate(-chest.x, -chest.y, -chest.z);
    return geo;
  });
}

/* a chip on its own: the gold bezel and bail round the chip (chip space,
   facing -z), for the HUD, the podium and the showcase */
export function bezelGeometry(detail = "race") {
  return geometry(`bezel:${detail}`, () => {
    const hero = detail === "hero";
    const bezel = xf(torus({ R: CHIP.r + 0.003, r: 0.0085, radial: hero ? 6 : 4, tubular: hero ? 48 : 22 }), { rot: [Math.PI / 2, 0, 0] });
    const bail = xf(torus({ R: 0.016, r: 0.0065, radial: hero ? 6 : 4, tubular: hero ? 14 : 8 }), { rot: [0, 0, Math.PI / 2], at: [0, CHIP.r + 0.02, 0] });
    return merge([paint(bezel, "#ffffff"), paint(bail, "#ffffff")]);
  });
}

/* where the chip hangs (critter space): below the chain's front, resting on the belly */
export function chipPlace(template) {
  const body = template.shapes.body;
  const lf = template.sockets.chain?.front ?? 0.55;
  const top = body.at(V(0, Math.sin(lf), -Math.cos(lf)).normalize());
  const dir = V(0, Math.sin(lf - 0.5), -Math.cos(lf - 0.5)).normalize();
  const n = body.normal(dir);
  const p = V(0, top.y - CHIP.r - 0.022, 0);
  const onBody = body.at(dir);
  p.z = onBody.z - 0.018;
  const facing = n.clone().add(V(0, 0.15, 0)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), facing);
  return { p, q };
}

/* the drink: a can in a koozie in the rider's color (the koozie is the tint mesh) */
export function drinkGeometry(detail = "race") {
  return geometry(`drink:${detail}`, () => {
    const seg = detail === "hero" ? 24 : 14;
    const k = 1.4;
    const sc = pts => pts.map(([x, y]) => [x * k, y * k]);
    const can = lathe(sc([[0, 0.066], [0.022, 0.066], [0.028, 0.062], [0.031, 0.056], [0.034, 0.05], [0.034, -0.05], [0.03, -0.058], [0.022, -0.062], [0, -0.062]]), { segments: seg });
    const top = lathe(sc([[0, 0.067], [0.02, 0.067], [0.024, 0.069], [0.027, 0.0645]]), { segments: seg });
    const tab = xf(ball([0.009 * k, 0.003 * k, 0.014 * k], { w: 8, h: 4 }), { at: [0, 0.07 * k, 0.004 * k] });
    const band = lathe(sc([[0.0405, 0.012], [0.0412, 0.008], [0.0412, -0.012], [0.0405, -0.016]]), { segments: seg });
    const body = merge([paint(can, "#d9dde3"), paint(top, "#aeb4bd"), paint(tab, "#c3c8cf"), paint(band, "#fbf7ee")]);
    const koozie = lathe(sc([[0.0372, 0.034], [0.04, 0.03], [0.04, -0.05], [0.036, -0.057], [0, -0.058]]), { segments: seg });
    return { body, koozie: merge([paint(koozie, "#ffffff")]) };
  });
}

/* the drink's group (it rides the paw); the koozie takes a tint reference
   the caller releases */
export function buildDrink(color, detail = "race") {
  const g = drinkGeometry(detail);
  const group = new THREE.Group();
  group.name = "drink";
  const inner = new THREE.Group();
  inner.position.set(0, 0.018, -0.006);
  group.add(inner);
  inner.add(new THREE.Mesh(g.body, vinyl()), new THREE.Mesh(g.koozie, tint(color)));
  return group;
}
