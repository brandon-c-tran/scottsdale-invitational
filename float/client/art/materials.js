/* The finishes, and the caches that let thirteen riders share them.

   One glossy vinyl material carries every critter, floatie and hat: their
   colors live in vertex colors, so a whole species is one program and a
   handful of draw calls. A rider's own color (swim trunks, floatie trim, hat
   band) is a separate "tint" material cached by hex and counted, so riders
   of a color share it and the last one out disposes it. Shared materials and
   geometries live until disposeFloatArt().

   The gloss needs an environment to reflect: floatEnvironment(renderer)
   (environment.js) is what the screen, the portrait and the showcase set as
   scene.environment. */
import * as THREE from "three";

const shared = new Map();
const counted = new Map();
const geometries = new Map();

/* a shared material (or anything disposable), made once */
export function once(key, make) {
  let value = shared.get(key);
  if (!value) { value = make(); shared.set(key, value); if (quality === "low") applyQuality(value); }
  return value;
}

/* a cached geometry, made once (never disposed by a rider) */
export function geometry(key, make) {
  let value = geometries.get(key);
  if (!value) { value = make(); geometries.set(key, value); }
  return value;
}

/* a counted resource: acquire() returns it and adds a reference; release()
   drops one and disposes it with the last */
export function acquire(key, make) {
  let entry = counted.get(key);
  if (!entry) {
    entry = { value: make(), refs: 0 };
    counted.set(key, entry);
    if (quality === "low") applyQuality(entry.value?.isMaterial ? entry.value : entry.value?.material);
  }
  entry.refs++;
  return entry.value;
}
export function release(key) {
  const entry = counted.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    counted.delete(key);
    disposeValue(entry.value);
  }
}

function disposeValue(value) {
  if (!value) return;
  if (value.isMaterial) { for (const v of Object.values(value)) if (v?.isTexture) v.dispose(); value.dispose(); return; }
  if (value.isBufferGeometry || typeof value.dispose === "function") { value.dispose(); return; }
  if (typeof value === "object") for (const v of Object.values(value)) if (v?.isBufferGeometry) v.dispose();
}

/* everything the art made: call when the screen unmounts for good */
export function disposeFloatArt() {
  for (const value of shared.values()) disposeValue(value);
  for (const entry of counted.values()) disposeValue(entry.value);
  for (const value of geometries.values()) disposeValue(value);
  shared.clear(); counted.clear(); geometries.clear();
}

export const cacheSizes = () => ({ shared: shared.size, counted: counted.size, geometries: geometries.size });

/* "high" (default): clear coats on the floaties and toys, sheen on the
   plush, fur on the critters. "low" (a slow integrated GPU): no clear coat,
   no sheen, no fur shells; the toys keep their color and a softer shine.
   Applies to everything built, before and after. */
let quality = "high";
const COATS = new WeakMap();
const SHEENS = new WeakMap();
function applyQuality(material) {
  if (!material) return;
  if (material.userData?.fur) { material.visible = quality !== "low"; return; }
  if (!material.isMeshPhysicalMaterial) return;
  if (!COATS.has(material)) COATS.set(material, material.clearcoat);
  const coat = quality === "low" ? 0 : COATS.get(material);
  if (material.clearcoat !== coat) { material.clearcoat = coat; material.needsUpdate = true; }
  if (material.userData?.plush) {
    if (!SHEENS.has(material)) SHEENS.set(material, material.sheen);
    const sheen = quality === "low" ? 0 : SHEENS.get(material);
    if (material.sheen !== sheen) { material.sheen = sheen; material.needsUpdate = true; }
  }
}
export function setFloatArtQuality(level = "high") {
  quality = level === "low" ? "low" : "high";
  for (const value of shared.values()) applyQuality(value);
  for (const entry of counted.values()) applyQuality(entry.value?.isMaterial ? entry.value : entry.value?.material);
  return quality;
}
export const floatArtQuality = () => quality;
export const qualityOf = material => { applyQuality(material); return material; };

/* ── the finishes ── */

/* soft glossy vinyl: a satin base under a sharp clear coat */
export const vinyl = () => once("vinyl", () => new THREE.MeshPhysicalMaterial({
  name: "float-vinyl", vertexColors: true, roughness: 0.42, metalness: 0,
  clearcoat: 1, clearcoatRoughness: 0.09, ior: 1.5, specularIntensity: 0.6,
}));

/* inflatable PVC: a touch shinier than the toys */
export const pvc = () => once("pvc", () => new THREE.MeshPhysicalMaterial({
  name: "float-pvc", vertexColors: true, roughness: 0.3, metalness: 0,
  clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 0.7,
}));

/* the rider's own color */
export function tint(hex) {
  const color = normalHex(hex);
  return acquire(`tint:${color}`, () => new THREE.MeshPhysicalMaterial({
    name: `float-tint-${color}`, color: new THREE.Color(color), roughness: 0.34, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.06, specularIntensity: 0.7,
  }));
}
export const releaseTint = hex => release(`tint:${normalHex(hex)}`);

export const gold = () => once("gold", () => new THREE.MeshPhysicalMaterial({
  name: "float-gold", color: new THREE.Color("#ffc94d"), metalness: 1, roughness: 0.2,
  clearcoat: 0.5, clearcoatRoughness: 0.1, emissive: new THREE.Color("#2b1a00"), emissiveIntensity: 1,
}));

/* lenses and their frames: wet-glossy, a little mirrored */
export const lens = () => once("lens", () => new THREE.MeshPhysicalMaterial({
  name: "float-lens", vertexColors: true, metalness: 0.35, roughness: 0.1,
  clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1,
}));

/* the catch light in an eye: always white, never shaded */
export const glint = () => once("glint", () => new THREE.MeshBasicMaterial({ name: "float-glint", color: 0xffffff, toneMapped: false }));

export function normalHex(hex) {
  const s = String(hex || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : "#e8b04a";
}
