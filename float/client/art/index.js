/* The art API (float/PROTOCOL.md "Art"). This file is a STUB: plain beans
   in plain tubes, so the screen and the Locker can be built against the real
   signatures. The art build replaces the bodies, never the signatures.

   Everything returns three.js objects in metres, y up, the rider facing -z
   (downstream when the screen turns it). Nothing here reads the network. */
import * as THREE from "three";

const mat = color => new THREE.MeshStandardMaterial({ color, roughness:0.45, metalness:0 });

/* A floatie: { root, seat, update(dt), dispose() }. `seat` is where a
   critter sits. */
export function buildFloatie({ floatie = "classic", color = "#e8b04a" } = {}) {
  const root = new THREE.Group();
  root.name = `floatie:${floatie}`;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 16, 32), mat(color));
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const seat = new THREE.Object3D();
  seat.position.y = 0.1;
  root.add(seat);
  return { root, seat, update() {}, dispose() { ring.geometry.dispose(); ring.material.dispose(); } };
}

/* A critter: { root, setStroke(side), setState(state), setPose(pose), update(dt), dispose() }.
   state: { swim, handsOff, sad, celebrate } (booleans). setStroke("L"|"R")
   plays one paddle stroke on that side. setPose(id) plays a victory pose. */
export function buildCritter({ critter = "capybara", color = "#9aa39e" } = {}) {
  const root = new THREE.Group();
  root.name = `critter:${critter}`;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.35, 8, 16), mat(color));
  body.position.y = 0.45;
  root.add(body);
  return { root, setStroke() {}, setState() {}, setPose() {}, update() {},
    dispose() { body.geometry.dispose(); body.material.dispose(); } };
}

/* A rider: a critter seated in its floatie, wearing the chip medallion.
   entrant: { name, color, look:{ critter, floatie, hat, shades, pose }, photo?, number?, skin?, groom? } */
export function buildRider(entrant = {}) {
  const look = entrant.look || {};
  const floatie = buildFloatie({ floatie:look.floatie, color:entrant.color });
  const critter = buildCritter({ critter:look.critter, color:entrant.color });
  floatie.seat.add(critter.root);
  return {
    root:floatie.root, critter, floatie,
    update(dt) { floatie.update(dt); critter.update(dt); },
    dispose() { critter.dispose(); floatie.dispose(); },
  };
}

/* A still of a look for the Locker and the lobby: resolves to a PNG data URL. */
export async function riderPortrait(entrant = {}, { size = 256 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = entrant.color || "#9aa39e";
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2); ctx.fill();
  return canvas.toDataURL("image/png");
}
