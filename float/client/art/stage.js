/* The showcase's stages (the /float/art page only): a night river in the
   desert (moonlight, warm string lights, canyon walls, a slow glassy
   current) and a neutral studio (a warm grey cyclorama). Each is a group
   with its own lights and an update(dt) for the water. */
import * as THREE from "three";
import { floatLights } from "./environment.js";

const TAU = Math.PI * 2;

/* a tileable normal map: a few crossing swells and a fine chop */
function waterNormals(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const waves = [[3, 1, 0.9, 0.2], [1, 4, 0.6, 1.3], [5, -2, 0.35, 2.1], [-2, 7, 0.22, 0.7], [9, 5, 0.12, 2.9], [-7, 11, 0.09, 1.7]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, a, ph] of waves) {
      const arg = (kx * x / size + ky * y / size) * TAU + ph;
      const c = Math.cos(arg) * a;
      dx += c * kx; dy += c * ky;
    }
    const n = new THREE.Vector3(-dx * 0.05, -dy * 0.05, 1).normalize();
    const i = (y * size + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* a soft radial glow, for bulbs, the moon's halo and ripple rings */
function glowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)", ring = false) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring) {
    grad.addColorStop(0, outer); grad.addColorStop(0.62, outer); grad.addColorStop(0.78, inner); grad.addColorStop(0.86, "rgba(255,255,255,0.25)"); grad.addColorStop(1, outer);
  } else { grad.addColorStop(0, inner); grad.addColorStop(0.35, "rgba(255,255,255,0.35)"); grad.addColorStop(1, outer); }
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyDome(stops, radius = 260) {
  const geo = new THREE.SphereGeometry(radius, 48, 24);
  const colors = [];
  const c = new THREE.Color(), a = new THREE.Color(), b = new THREE.Color();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / radius;
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
    const t = THREE.MathUtils.clamp((y - stops[k][0]) / (stops[k + 1][0] - stops[k][0]), 0, 1);
    a.set(stops[k][1]); b.set(stops[k + 1][1]);
    c.copy(a).lerp(b, t * t * (3 - 2 * t));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/* a ridge of canyon wall: a jagged silhouette band at the horizon */
function ridge({ z, width = 220, height = 14, color, seed = 1, base = -1 }) {
  const shape = new THREE.Shape();
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  shape.moveTo(-width / 2, base);
  const steps = 46;
  for (let i = 0; i <= steps; i++) {
    const x = -width / 2 + (i / steps) * width;
    const mesa = Math.sin(i * 0.37 + seed) * 0.5 + 0.5;
    const h = height * (0.35 + 0.65 * mesa) * (0.75 + rand() * 0.25);
    shape.lineTo(x, h);
    if (rand() < 0.3) shape.lineTo(x + width / steps * 0.6, h);
  }
  shape.lineTo(width / 2, base);
  const geo = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: true }));
  mesh.position.set(0, 0, z);
  return mesh;
}

/* a strand of warm bulbs on a sagging wire */
function strand({ from, to, sag = 0.9, bulbs = 16, glow }) {
  const group = new THREE.Group();
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    pts.push(p);
  }
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#1b1820" }));
  group.add(wire);
  const bulbGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc27a").multiplyScalar(2.2), toneMapped: false });
  const haloMat = new THREE.SpriteMaterial({ map: glow, color: "#ffad5c", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (let i = 1; i < bulbs; i++) {
    const t = i / bulbs;
    const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag + 0.12;
    const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.copy(p);
    const halo = new THREE.Sprite(haloMat); halo.position.copy(p); halo.scale.setScalar(0.9);
    group.add(bulb, halo);
  }
  return group;
}

export function buildStage(mood = "night") {
  const group = new THREE.Group();
  group.name = `stage:${mood}`;
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };
  let water = null, rippleTex = null;
  const t0 = { t: 0 };
  if (mood === "studio") {
    group.add(skyDome([[-1, "#cfc9bf"], [0, "#d8d3ca"], [0.3, "#e6e2da"], [1, "#efece6"]]));
    /* the cyclorama: a floor that curves up into the wall */
    const cyc = new THREE.PlaneGeometry(80, 40, 1, 40);
    const p = cyc.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = (p.getY(i) + 20) / 40;
      const z = 12 - v * 40;
      const bend = Math.max(0, -z - 6);
      p.setXYZ(i, p.getX(i), bend > 0 ? (bend * bend) / 14 : 0, Math.max(z, -6 - Math.sqrt(bend * 14)));
    }
    cyc.computeVertexNormals();
    const floor = new THREE.Mesh(cyc, keep(new THREE.MeshStandardMaterial({ color: "#d9d4cb", roughness: 0.92 })));
    floor.position.y = -0.02;
    group.add(floor);
    group.add(floatLights("studio"));
    const shadowTex = keep(glowTexture("rgba(40,32,24,0.55)", "rgba(40,32,24,0)"));
    return { group, mood, fog: new THREE.Fog("#ddd8cf", 18, 60), background: new THREE.Color("#ddd8cf"), shadowTex, update() {}, dispose() { disposables.forEach(d => d.dispose?.()); } };
  }
  /* night river */
  group.add(skyDome([[-1, "#05060b"], [-0.02, "#0d0c16"], [0.0, "#3b2533"], [0.035, "#a2573a"], [0.08, "#5a3b62"], [0.22, "#22285a"], [0.55, "#0f1840"], [1, "#070c24"]]));
  /* stars */
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 900; i++) {
    const az = rnd() * TAU, el = Math.asin(0.12 + rnd() * 0.88);
    sp.push(Math.cos(az) * Math.cos(el) * 240, Math.sin(el) * 240, Math.sin(az) * Math.cos(el) * 240);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  group.add(new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: "#dfe6ff", size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }))));
  /* the moon and its halo */
  const glow = keep(glowTexture());
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color("#f3f1ff").multiplyScalar(1.3), fog: false, toneMapped: false })));
  moon.position.set(-70, 95, -170);
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: "#9fb2ff", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  halo.position.copy(moon.position); halo.scale.setScalar(70);
  group.add(moon, halo);
  /* canyon walls, far to near */
  group.add(ridge({ z: -150, height: 30, color: "#1d1530", seed: 3 }), ridge({ z: -110, height: 18, color: "#140f22", seed: 11 }), ridge({ z: -70, height: 9, color: "#0c0a14", seed: 5 }));
  /* the river */
  const normals = keep(waterNormals());
  normals.repeat.set(36, 36);
  water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), keep(new THREE.MeshPhysicalMaterial({
    color: "#0a1a28", roughness: 0.05, metalness: 0, normalMap: normals, normalScale: new THREE.Vector2(0.32, 0.32),
    clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1,
  })));
  water.rotation.x = -Math.PI / 2;
  group.add(water);
  /* string lights across the back of the set, warm lamps under them */
  for (const [from, to, sag] of [[[-15, 3.6, -9], [-4.5, 3.9, -10], 0.75], [[-4.6, 3.9, -10], [5.5, 3.7, -10], 0.8], [[5.4, 3.7, -10], [16, 3.4, -8], 0.7]]) {
    group.add(strand({ from, to, sag, bulbs: 14, glow }));
  }
  const lights = floatLights("night");
  group.add(lights);
  for (const [x, z] of [[-7, -6], [1, -7], [8, -6]]) {
    const lamp = new THREE.PointLight("#ffb066", 6, 20, 1.6);
    lamp.position.set(x, 3.2, z);
    group.add(lamp);
  }
  rippleTex = keep(glowTexture("rgba(190,215,255,0.7)", "rgba(190,215,255,0)", true));
  return {
    group, mood, water, rippleTex,
    fog: new THREE.FogExp2("#120f22", 0.022),
    background: new THREE.Color("#070c24"),
    update(dt) {
      t0.t += dt;
      normals.offset.set(t0.t * 0.012, -t0.t * 0.02);
    },
    dispose() { disposables.forEach(d => d.dispose?.()); },
  };
}

/* a ring of ripples (night) or a soft contact shadow (studio) under a floatie */
export function buildPuddle(stage, radius = 0.95) {
  const tex = stage.rippleTex || stage.shadowTex;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: stage.rippleTex ? 0.32 : 0.75, fog: false,
    blending: stage.rippleTex ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  mesh.scale.setScalar(radius * (stage.rippleTex ? 2.6 : 2.3));
  mesh.renderOrder = -1;
  let t = Math.random() * 3;
  return {
    mesh,
    update(dt) {
      if (!stage.rippleTex) return;
      t += dt;
      const k = (t % 2.6) / 2.6;
      mesh.scale.setScalar(radius * (2.2 + k * 0.9));
      mat.opacity = 0.34 * (1 - k);
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
