/* Rider portraits: a flattering 3/4 bust of a look, rendered offscreen on
   one shared renderer (one WebGL context however many portraits a lobby
   asks for), one at a time, cached by look and color. A transparent PNG
   data URL. Without WebGL, a flat disc in the rider's color with the
   critter's initial. */
import * as THREE from "three";
import { buildCritter } from "./index.js";
import { floatEnvironment } from "./environment.js";
import { hasDom, labelOf } from "./badge.js";
import { normalHex } from "./materials.js";

let stage = null;
const cache = new Map();
let queue = Promise.resolve();

export function portraitKey(entrant = {}, size = 256) {
  const look = entrant.look || {};
  return [look.critter || "capybara", look.hat || "none", look.shades || "none", normalHex(entrant.color), entrant.skin || "ticks",
    labelOf(entrant), entrant.photo || "", entrant.groom ? "g" : "", size].join("|");
}

export function portrait(entrant = {}, { size = 256 } = {}) {
  if (!hasDom()) return Promise.resolve(null);
  const px = Math.max(32, Math.min(1024, Math.round(size) || 256));
  const key = portraitKey(entrant, px);
  if (cache.has(key)) return cache.get(key);
  const job = queue.then(() => render(entrant, px)).catch(() => fallback(entrant, px));
  queue = job.then(() => {}, () => {});
  cache.set(key, job);
  return job;
}

function makeStage() {
  const canvas = document.createElement("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  } catch { return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = floatEnvironment(renderer, "studio");
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight("#fff4e6", 2.4); key.position.set(-2.5, 3.5, -4);
  const rim = new THREE.DirectionalLight("#dbe6ff", 2.6); rim.position.set(3, 2.5, 3.5);
  const fill = new THREE.DirectionalLight("#ffe6d0", 0.8); fill.position.set(3, 0.5, -3);
  scene.add(key, rim, fill, new THREE.HemisphereLight("#ffffff", "#8a7f74", 0.6));
  const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
  return { renderer, scene, camera, canvas };
}

async function render(entrant, size) {
  if (!stage) stage = makeStage();
  if (!stage) return fallback(entrant, size);
  const look = entrant.look || {};
  const critter = buildCritter({ critter: look.critter, color: entrant.color, hat: look.hat, shades: look.shades, entrant, detail: "hero",
    seed: "portrait", groom: !!entrant.groom });
  try {
    /* a baked critter's mesh first (it may still be loading), then the chip's photo */
    await Promise.race([critter.meshReady || Promise.resolve(true), new Promise(r => setTimeout(r, 10000))]);
    await Promise.race([critter.ready, new Promise(r => setTimeout(r, 1500))]);
    const rt = critter.runtime;
    rt.look.next = 1e9; rt.look.yaw = -0.18; rt.look.pitch = 0.06;
    rt.blinkAt = 1e9;
    for (let i = 0; i < 40; i++) critter.update(1 / 60);
    const { renderer, scene, camera } = stage;
    scene.add(critter.root);
    const ss = Math.min(2048, size * 2);
    renderer.setPixelRatio(1);
    renderer.setSize(ss, ss, false);
    /* frame the bust: from the chip to the top of whatever it wears (the
       hat, the ears, the plume), as wide as the head and its brim */
    critter.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const head = rt.b.head;
    const v = new THREE.Vector3();
    head.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      for (const x of [g.boundingBox.min.x, g.boundingBox.max.x]) for (const y of [g.boundingBox.min.y, g.boundingBox.max.y]) for (const z of [g.boundingBox.min.z, g.boundingBox.max.z]) box.expandByPoint(v.set(x, y, z).applyMatrix4(o.matrixWorld));
    });
    const hd = rt.template.info.head;
    const body = (rt.meshes.plush || rt.meshes.vinyl).geometry;
    if (!body.boundingBox) body.computeBoundingBox();
    const crown = Math.max(hd.at[1] + hd.r[1] + 0.03, body.boundingBox.max.y);
    box.expandByPoint(v.set(hd.at[0] - hd.r[0], crown, hd.at[2]));
    box.expandByPoint(v.set(hd.at[0] + hd.r[0], crown, hd.at[2]));
    const top = Math.min(box.max.y + 0.03, 1.25);
    const bottom = 0.16;
    const halfW = Math.min(0.42, Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) + 0.03);
    const cy = (top + bottom) / 2 + 0.01, h = Math.max((top - bottom) * 1.05, halfW * 2);
    const dist = (h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const yaw = 0.42, pitch = 0.1;
    camera.position.set(Math.sin(yaw) * dist, cy + Math.sin(pitch) * dist, -Math.cos(yaw) * dist);
    camera.lookAt(0, cy, -0.02);
    renderer.render(scene, camera);
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(renderer.domElement, 0, 0, size, size);
    scene.remove(critter.root);
    return out.toDataURL("image/png");
  } finally {
    critter.dispose();
  }
}

function fallback(entrant, size) {
  if (!hasDom()) return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = normalHex(entrant.color);
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); ctx.fill();
  const name = String(entrant.look?.critter || "?");
  ctx.fillStyle = "#fbf7ee";
  ctx.font = `900 ${Math.round(size * 0.36)}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(name[0].toUpperCase(), size / 2, size / 2 + size * 0.02);
  return c.toDataURL("image/png");
}

/* free the portrait renderer (the cache of finished images stays) */
export function disposePortraits() {
  if (!stage) return;
  stage.renderer.dispose();
  stage.renderer.forceContextLoss?.();
  stage = null;
}
