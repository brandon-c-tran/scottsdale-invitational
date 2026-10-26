/* What the vinyl reflects. A clear coat with nothing to reflect looks like
   matte clay, so whoever draws the riders sets this as scene.environment:

     scene.environment = floatEnvironment(renderer, "night");

   "night": a desert sky after dark (navy overhead, violet at the horizon, a
   warm band where the string lights and the town glow, a hard white moon) so
   every rider carries a cool moon glint and a warm rim. "studio": three's
   RoomEnvironment, neutral, for the showcase and the portraits. One texture
   per renderer and mood; floatLights(mood) is the matching key light rig. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const made = new WeakMap();

export function floatEnvironment(renderer, mood = "night") {
  if (!renderer) return null;
  let byMood = made.get(renderer);
  if (!byMood) { byMood = new Map(); made.set(renderer, byMood); }
  if (byMood.has(mood)) return byMood.get(mood);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = mood === "studio" ? new RoomEnvironment() : nightSky();
  const target = pmrem.fromScene(scene, mood === "studio" ? 0.035 : 0.02);
  pmrem.dispose();
  scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  byMood.set(mood, target.texture);
  return target.texture;
}

export function disposeFloatEnvironment(renderer) {
  const byMood = made.get(renderer);
  if (!byMood) return;
  for (const tex of byMood.values()) tex.dispose();
  made.delete(renderer);
}

/* the night sky as a scene of glowing shapes (HDR: colors above 1 glow) */
function nightSky() {
  const scene = new THREE.Scene();
  const sky = new THREE.SphereGeometry(50, 48, 24);
  const colors = [];
  const stops = [
    [-1.0, "#07060a", 0.6], [-0.18, "#1a1018", 0.8], [-0.02, "#5a3426", 1.6], [0.03, "#d27a45", 2.4],
    [0.09, "#6d4a74", 1.5], [0.25, "#2d3264", 1.15], [0.6, "#16204a", 1.0], [1.0, "#0a1230", 0.9],
  ];
  const c = new THREE.Color(), a = new THREE.Color(), b = new THREE.Color();
  const p = sky.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
    const [y0, h0, s0] = stops[k], [y1, h1, s1] = stops[k + 1];
    const t = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
    a.set(h0).multiplyScalar(s0); b.set(h1).multiplyScalar(s1);
    c.copy(a).lerp(b, t);
    colors.push(c.r, c.g, c.b);
  }
  sky.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  /* the moon: high, behind the left shoulder of a camera looking downstream;
     big and soft, so a glossy toy carries one clean highlight, not a pinprick */
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfe9ff").multiplyScalar(7) }));
  moon.position.set(-22, 30, 26);
  scene.add(moon);
  /* a soft cool panel opposite the moon: the river's reflected sky */
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color("#7f97d8").multiplyScalar(0.8), side: THREE.DoubleSide }));
  panel.position.set(30, 8, -20); panel.lookAt(0, 0, 0);
  scene.add(panel);
  /* the string lights' glow: a few broad warm pools low on the horizon
     (many small bright bulbs reflect as a dotted seam on every toy) */
  const pool = new THREE.SphereGeometry(7, 16, 10);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffad5e").multiplyScalar(1.5) });
  for (let i = 0; i < 7; i++) {
    const az = (i / 7) * Math.PI * 2 + 0.35;
    const m = new THREE.Mesh(pool, warm);
    m.position.set(Math.cos(az) * 44, 6 + (i % 3), Math.sin(az) * 44);
    m.scale.set(1.6, 0.55, 1.6);
    scene.add(m);
  }
  return scene;
}

/* the lights that go with each environment (the showcase and the portrait
   use them; the screen may) */
export function floatLights(mood = "night") {
  const group = new THREE.Group();
  group.name = `float-lights:${mood}`;
  if (mood === "studio") {
    const key = new THREE.DirectionalLight("#fff3e2", 2.6); key.position.set(-3, 5, -4);
    const fill = new THREE.DirectionalLight("#dfe8ff", 0.9); fill.position.set(4, 2, -3);
    const rim = new THREE.DirectionalLight("#ffffff", 2.2); rim.position.set(1.5, 4, 5);
    group.add(key, fill, rim, new THREE.HemisphereLight("#f4f1ea", "#6f6a62", 0.7));
  } else {
    const moon = new THREE.DirectionalLight("#c4d4ff", 3.2); moon.position.set(-5, 7, 5);
    const lamp = new THREE.DirectionalLight("#ffbf80", 2.4); lamp.position.set(5, 3, -4);
    const front = new THREE.DirectionalLight("#ffe2c4", 1.3); front.position.set(-2, 4, -6);
    group.add(moon, lamp, front, new THREE.HemisphereLight("#5868a8", "#2a1a22", 1.25));
  }
  return group;
}
