/* Hats and shades. A hat is modelled once for a standard head (half a metre
   wide) and set on a species' crown by its hat socket (species.js: where,
   how big, how tilted). Shades are built per species from the eyes
   themselves: each lens sits just in front of its eye, the bridge crosses
   the face between them and the arms run back along the head, so they fit
   every face (the frog's turrets too). Geometry is cached by species and
   detail; the rider's color is a tint mesh (a hat band, a strap, stripes). */
import * as THREE from "three";
import { lathe, tube, ball, blob, blobGeometry, extrude, torus, xf, paint, merge, spline2, roundBox } from "./sculpt.js";
import { vinyl, gold, lens, geometry } from "./materials.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/* ── the hats, at standard size: origin on the crown of the head, y up, facing -z ── */
const HATS = {
  cowboy(hero) {
    const straw = "#e2b768", shade = "#c9974c";
    const crown = blob({ r: [0.138, 0.13, 0.16], n: 2.8, at: [0, 0.085, 0.005], warp: p => {
      if (p.y > 0) { p.y -= 0.022 * Math.exp(-((p.x / 0.045) ** 2)) * (p.y / 0.13); p.x *= 1 - 0.16 * Math.max(0, -p.z / 0.16) * (p.y / 0.13); }
      if (p.y < -0.05) p.y = -0.05 + (p.y + 0.05) * 0.3;
    } });
    const body = [paint(blobGeometry(crown, { w: hero ? 36 : 16, h: hero ? 20 : 10 }), straw)];
    /* the brim: a flat ring, curled up at the sides, dipping front and back */
    const brim = torus({ R: 0.215, r: 0.09, radial: hero ? 24 : 8, tubular: hero ? 56 : 24, squash: 0.12 });
    const p = brim.attributes.position, n = brim.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) + 1.9 * Math.max(0, Math.abs(x) - 0.13) ** 2 * 1.6 - 0.18 * Math.max(0, Math.abs(z) - 0.2) ** 1.2);
    }
    p.needsUpdate = true;
    brim.computeVertexNormals();
    void n;
    body.push(paint(xf(brim, { at: [0, -0.04, 0], scale: [1, 1, 1.08] }), shade));
    const band = blobGeometry(crown, { w: hero ? 36 : 16, h: 2, theta: [Math.PI * 0.6, 0.2], lift: 0.006 });
    return { body, tint: [band] };
  },
  bucket(hero) {
    const prof = spline2([[0.0, 0.118], [0.1, 0.116], [0.15, 0.104], [0.168, 0.07], [0.178, 0.025], [0.186, -0.005], [0.235, -0.04], [0.275, -0.066], [0.285, -0.074]], hero ? 24 : 10);
    const shellG = lathe(prof, { segments: hero ? 40 : 18 });
    const band = lathe([[0.181, 0.03], [0.187, 0.022], [0.19, -0.003], [0.186, -0.01]], { segments: hero ? 40 : 22 });
    const stitch = torus({ R: 0.235, r: 0.004, radial: 3, tubular: hero ? 40 : 22 });
    xf(stitch, { at: [0, -0.06, 0] });
    return { body: [paint(band, "#fbf7ee"), paint(stitch, "#fbf7ee")], tint: [shellG] };
  },
  visor(hero) {
    const ring = torus({ R: 0.2, r: 0.017, radial: hero ? 10 : 6, tubular: hero ? 40 : 24, squash: 1.7 });
    const shape = new THREE.Shape();
    shape.moveTo(-0.17, 0); shape.quadraticCurveTo(-0.16, -0.17, 0, -0.2); shape.quadraticCurveTo(0.16, -0.17, 0.17, 0); shape.lineTo(-0.17, 0);
    const bill = extrude(shape, { depth: 0.014, bevel: 0.008, bevelSegments: hero ? 3 : 1, curveSegments: hero ? 16 : 8 });
    xf(bill, { rot: [-Math.PI / 2 + 0.18, 0, 0], at: [0, 0.0, -0.15] });
    return { body: [paint(ring, "#fbf7ee")], tint: [bill] };
  },
  captain(hero) {
    const top = lathe(spline2([[0, 0.135], [0.12, 0.137], [0.205, 0.128], [0.226, 0.112], [0.222, 0.096], [0.19, 0.082]], hero ? 16 : 9), { segments: hero ? 40 : 24 });
    const wall = lathe([[0.19, 0.084], [0.176, 0.06], [0.17, 0.02], [0.172, -0.005]], { segments: hero ? 40 : 24 });
    const band = lathe([[0.178, 0.05], [0.185, 0.045], [0.186, 0.004], [0.179, -0.002]], { segments: hero ? 40 : 24 });
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0); shape.quadraticCurveTo(-0.13, -0.12, 0, -0.135); shape.quadraticCurveTo(0.13, -0.12, 0.15, 0); shape.lineTo(-0.15, 0);
    const bill = extrude(shape, { depth: 0.012, bevel: 0.006, bevelSegments: hero ? 3 : 1, curveSegments: hero ? 14 : 8 });
    xf(bill, { rot: [-Math.PI / 2 + 0.42, 0, 0], at: [0, 0.0, -0.15] });
    /* gold braid across the front and the anchor badge */
    const braid = tube([[-0.15, 0.012, -0.11], [0, 0.018, -0.19], [0.15, 0.012, -0.11]], { radius: 0.007, radial: 5, segments: hero ? 14 : 8 });
    const anchor = [];
    anchor.push(xf(ball([0.026, 0.026, 0.008], { w: 10, h: 8 }), { at: [0, 0.075, -0.188], rot: [0.15, 0, 0] }));
    return { body: [paint(top, "#fbfbf8"), paint(wall, "#f2f0ea"), paint(band, "#1d2440"), paint(bill, "#14161c")], gold: [braid, ...anchor] };
  },
  party(hero) {
    const seg = hero ? 6 : 4;
    const prof = [[0.135, 0.0], [0.11, 0.07], [0.075, 0.15], [0.04, 0.23], [0.006, 0.3], [0, 0.302]];
    const white = [], tint = [];
    for (let i = 0; i < 10; i++) {
      const g = lathe(prof, { segments: seg, phi: [(i / 10) * TAU, TAU / 10] });
      (i % 2 ? white : tint).push(g);
    }
    const pom = ball([0.04, 0.04, 0.04], { w: hero ? 16 : 10, h: hero ? 12 : 7, at: [0, 0.31, 0] });
    const rim = torus({ R: 0.136, r: 0.01, radial: 4, tubular: hero ? 36 : 20 });
    return { body: [...white.map(g => paint(g, "#fbf7ee")), paint(pom, "#ffd23e"), paint(rim, "#ffd23e")], tint };
  },
  flowers(hero) {
    const body = [];
    const colors = ["#ff7eb3", "#fff6e8", "#ffd23e", "#c7a4ff", "#ff9a6b", "#8fd3ff", "#ff7eb3"];
    const [bw, bh] = hero ? [12, 8] : [7, 5];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.2;
      const c = V(Math.sin(a) * 0.19, 0.0 + 0.02 * Math.cos(a), -Math.cos(a) * 0.19);
      const out = c.clone().setY(0).normalize();
      const up = V(0, 1, 0).addScaledVector(out, 0.5).normalize();
      const right = new THREE.Vector3().crossVectors(up, out).normalize();
      for (let k = 0; k < 5; k++) {
        const b = (k / 5) * TAU;
        const pc = c.clone().addScaledVector(right, Math.cos(b) * 0.04).addScaledVector(out, Math.sin(b) * 0.04).addScaledVector(up, 0.006);
        const petal = ball([0.031, 0.012, 0.031], { w: bw, h: bh });
        const m = new THREE.Matrix4().makeBasis(right, up, new THREE.Vector3().crossVectors(right, up)).setPosition(pc);
        petal.applyMatrix4(m);
        body.push(paint(petal, colors[i]));
      }
      body.push(paint(ball([0.021, 0.017, 0.021], { w: bw, h: bh, at: c.clone().addScaledVector(up, 0.016).toArray() }), "#ffb51e"));
      const la = a + TAU / 14;
      body.push(paint(xf(ball([0.03, 0.01, 0.016], { w: bw, h: bh }), { rot: [0, -la, 0], at: [Math.sin(la) * 0.2, -0.01, -Math.cos(la) * 0.2] }), "#5fb35a"));
    }
    return { body };
  },
  crown(hero) {
    const seg = hero ? 40 : 24;
    const band = lathe([[0.15, -0.01], [0.158, 0.0], [0.158, 0.075], [0.15, 0.085]], { segments: seg });
    const gold = [band];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const base = V(Math.sin(a) * 0.15, 0.075, -Math.cos(a) * 0.15);
      const tip = V(Math.sin(a) * 0.16, 0.19, -Math.cos(a) * 0.16);
      gold.push(tube([base, base.clone().lerp(tip, 0.5), tip], { radius: t => 0.04 * (1 - t) + 0.006, radial: hero ? 8 : 5, segments: 3, capRings: 1 }));
      gold.push(ball([0.02, 0.02, 0.02], { w: hero ? 12 : 7, h: hero ? 8 : 5, at: tip.toArray() }));
    }
    const gems = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + TAU / 10;
      gems.push(paint(xf(ball([0.018, 0.022, 0.012], { w: 10, h: 8 }), { rot: [0, -a, 0], at: [Math.sin(a) * 0.162, 0.04, -Math.cos(a) * 0.162] }), i % 2 ? "#2f7dff" : "#ff2d55"));
    }
    const cap = blobGeometry(blob({ r: [0.145, 0.085, 0.145], at: [0, 0.03, 0] }), { w: hero ? 28 : 16, h: hero ? 10 : 6, theta: [0, Math.PI / 2] });
    return { body: [...gems, paint(cap, "#c2183a")], gold };
  },
};

export const HAT_IDS_BUILT = Object.keys(HATS);

function hatParts(id, detail) {
  return geometry(`hat:${id}:${detail}`, () => {
    const parts = HATS[id](detail === "hero");
    const pack = list => (list && list.length ? merge(list.map(g => (g.attributes.color ? g : paint(g, "#ffffff")))) : null);
    return { body: pack(parts.body), tint: pack(parts.tint), gold: pack(parts.gold) };
  });
}

/* a hat as a group on the head bone, or null */
export function buildHat(id, { template, detail = "race", headAt, takeTint }) {
  if (!id || id === "none" || !HATS[id]) return null;
  const sock = template.sockets.hat || { at: V(0, 0.8, 0), s: 1, tilt: 0 };
  const g = hatParts(id, detail);
  const group = new THREE.Group();
  group.name = `hat:${id}`;
  if (g.body) group.add(new THREE.Mesh(g.body, vinyl()));
  if (g.tint) group.add(new THREE.Mesh(g.tint, takeTint()));
  if (g.gold) group.add(new THREE.Mesh(g.gold, gold()));
  const s = sock.s || 1;
  group.position.copy(sock.at).sub(headAt);
  group.rotation.set(sock.tilt || 0, 0, id === "party" ? -0.22 : id === "flowers" ? 0.08 : 0);
  if (id === "party") group.position.x += 0.04;
  group.scale.setScalar(s * 1.22 * (id === "visor" ? 1.05 : id === "flowers" ? 1.05 : 1));
  if (id === "visor" || id === "flowers") group.position.y -= 0.035 * s;
  return group;
}

/* ── shades, built on a species' own eyes ── */
function heart(w) {
  const s = new THREE.Shape();
  s.moveTo(0, -w * 0.62);
  s.bezierCurveTo(w * 0.9, -w * 0.05, w * 0.62, w * 0.62, 0, w * 0.3);
  s.bezierCurveTo(-w * 0.62, w * 0.62, -w * 0.9, -w * 0.05, 0, -w * 0.62);
  return s;
}
function star(w) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? w * 0.45 : w;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}
function oval(w, h, tear = 0, n = 28) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const y = Math.sin(a) * h * (Math.sin(a) < 0 ? 1 + tear : 1);
    const x = Math.cos(a) * w * (1 + (Math.sin(a) < 0 ? -0.12 * tear : 0));
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  return s;
}
function ring(shape, depth, r, hero) {
  const pts = shape.getSpacedPoints(hero ? 40 : 14).map(p => V(p.x, p.y, 0));
  return tube(pts, { radius: r, radial: hero ? 6 : 3, segments: hero ? 40 : 14, caps: [false, false], closed: true });
}

const SHADES = {
  aviators: (w, hero) => ({ lensShape: oval(w * 1.0, w * 0.82, 0.35, hero ? 28 : 14), lens: "#2a2f4a", tintTop: "#4a6bd8", frame: "#d9a93b", frameR: 0.0055, bridgeDouble: true }),
  hearts: w => ({ lensShape: heart(w * 1.15), lens: "#ff3d7f", frame: "#fff1f5", frameR: 0.0075 }),
  stars: w => ({ lensShape: star(w * 1.18), lens: "#ffc93a", frame: "#ff8a1f", frameR: 0.0065 }),
  goggles: (w, hero) => ({ lensShape: oval(w * 0.98, w * 0.78, 0, hero ? 28 : 14), lens: "#35b9ff", frame: "#1d3b63", frameR: 0.012, strap: true, cup: true }),
};
export const SHADE_IDS_BUILT = Object.keys(SHADES);

function shadeParts(id, template, detail) {
  return geometry(`shades:${id}:${template.version || 1}:${template.id}:${detail}`, () => {
    const hero = detail === "hero";
    const eyes = template.info.eyes;
    const headAt = template.bones.find(b => b.name === "head").at;
    const sock = template.sockets.shades || {};
    const baked = template.version === 2;
    const head = baked ? null : template.shapes.head;
    const sorted = [...eyes].sort((a, b) => a.c.x - b.c.x);
    const eyeY = (eyes[0].c.y + eyes[1].c.y) / 2;
    /* lenses across the front of the face at the eyes' height (side-set eyes
       too: shades are worn in front), or on the eyes themselves (turrets) */
    const span = THREE.MathUtils.clamp(Math.abs(sorted[1].c.x - sorted[0].c.x), 0.15, baked ? 0.3 : 0.235) * (sock.w || 1);
    const lensW = THREE.MathUtils.clamp(span * (baked ? 0.34 : 0.37), 0.05, baked ? 0.088 : 0.08);
    const spec = SHADES[id](lensW, hero);
    const lensParts = [], frameParts = [], tintParts = [];
    const ends = [];
    for (const e of sorted) {
      let c, f;
      if (sock.onEyes) {
        f = e.n.clone().normalize();
        c = e.c.clone().addScaledVector(f, (template.info.eyeSize?.depth || 0.03) + 0.03);
      } else if (baked) {
        /* a baked face: each lens right before its eye, turned to face ahead */
        f = e.n.clone().add(V(0, 0, -1.6)).normalize();
        c = e.p.clone().addScaledVector(f, 0.03);
        c.x = Math.sign(e.c.x) * Math.max(Math.abs(c.x), span / 2);
      } else {
        const x = Math.sign(e.c.x) * span / 2, hc = head.center, r = head.r;
        const ux = (x - hc.x) / r[0], uy = (eyeY - hc.y) / r[1];
        const d = V(ux, uy, -Math.sqrt(Math.max(0.1, 1 - ux * ux - uy * uy))).normalize();
        const P = head.at(d), N = head.normal(d);
        f = N.clone().add(V(0, 0, -1.6)).normalize();
        c = P.addScaledVector(f, 0.034);
      }
      const up = V(0, 1, 0).addScaledVector(f, -f.y).normalize();
      const right = new THREE.Vector3().crossVectors(up, f).normalize();
      const m = new THREE.Matrix4().makeBasis(right, up, f).setPosition(c);
      const lensG = extrude(spec.lensShape, { depth: spec.cup ? 0.03 : 0.008, bevel: spec.cup ? 0.008 : 0.004, bevelSegments: hero ? 2 : 1, curveSegments: hero ? 16 : 8 });
      lensG.applyMatrix4(m);
      lensParts.push(paint(lensG, p => new THREE.Color(spec.tintTop && p.y > c.y + lensW * 0.15 ? spec.tintTop : spec.lens)));
      const rim = ring(spec.lensShape, 0, spec.frameR, hero);
      rim.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, spec.cup ? 0.02 : 0.006).premultiply(m));
      frameParts.push(paint(rim, spec.frame));
      ends.push({ c, right, up, f, x: e.c.x });
    }
    const [L, R] = ends[0].x < ends[1].x ? ends : [ends[1], ends[0]];
    /* the bridge across the face */
    const li = L.c.clone().add(V(lensW * 0.92, lensW * 0.25, 0)), ri = R.c.clone().add(V(-lensW * 0.92, lensW * 0.25, 0));
    const mid = li.clone().lerp(ri, 0.5).add(V(0, lensW * 0.12, -0.012));
    frameParts.push(paint(tube([li, mid, ri], { radius: spec.frameR * 1.05, radial: 5, segments: hero ? 10 : 6, capRings: 1 }), spec.frame));
    if (spec.bridgeDouble) frameParts.push(paint(tube([li.clone().add(V(0, lensW * 0.4, 0)), mid.clone().add(V(0, lensW * 0.36, 0)), ri.clone().add(V(0, lensW * 0.4, 0))], { radius: spec.frameR * 0.9, radial: 5, segments: hero ? 10 : 6, capRings: 1 }), spec.frame));
    /* the arms (or the strap) back along the head */
    for (const E of [L, R]) {
      const s = Math.sign(E.x) || 1;
      const start = E.c.clone().add(V(s * lensW * 0.95, lensW * 0.2, 0.004));
      let end, strapSide, strapBack;
      if (baked) {
        /* the bake measured where the arms meet the head and where a strap runs */
        const A = template.anchors;
        end = V(...A.temple[s < 0 ? 0 : 1]);
        strapSide = V(...A.strap[s < 0 ? 0 : 1]);
        strapBack = V(...A.strap[2]);
      } else {
        const dEnd = new THREE.Vector3(s * 0.97, 0.05, 0.25).normalize();
        end = head.at(dEnd).addScaledVector(head.normal(dEnd), 0.01);
        const dSide = new THREE.Vector3(s * 0.6, 0.05, 0.8).normalize(), dBack = new THREE.Vector3(0, 0.05, 1);
        strapSide = head.at(dSide).addScaledVector(head.normal(dSide), 0.012);
        strapBack = head.at(dBack).addScaledVector(head.normal(dBack), 0.012);
      }
      const midA = start.clone().lerp(end, 0.5).addScaledVector(V(s, 0, 0), 0.02);
      if (spec.strap) tintParts.push(tube([start, midA, end, strapSide, strapBack], { radius: 0.012, radial: 5, segments: hero ? 18 : 10, flat: 0.5, side: [0, 1, 0], capRings: 1 }));
      else frameParts.push(paint(tube([start, midA, end], { radius: spec.frameR * 0.9, radial: 5, segments: hero ? 10 : 5, capRings: 1 }), spec.frame));
    }
    const shift = g => { g.translate(-headAt.x, -headAt.y, -headAt.z); return g; };
    return {
      lens: shift(merge([...lensParts, ...frameParts])),
      tint: tintParts.length ? shift(merge(tintParts.map(g => paint(g, "#ffffff")))) : null,
    };
  });
}

/* shades as a group on the head bone, or null */
export function buildShades(id, { template, detail = "race", takeTint }) {
  if (!id || id === "none" || !SHADES[id] || !template.info.eyes) return null;
  const g = shadeParts(id, template, detail);
  const group = new THREE.Group();
  group.name = `shades:${id}`;
  group.add(new THREE.Mesh(g.lens, lens()));
  if (g.tint) group.add(new THREE.Mesh(g.tint, takeTint()));
  return group;
}

export { roundBox };
