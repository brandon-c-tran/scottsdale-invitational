/* The riders on the water: one art rider per entrant (float/client/art
   buildRider), carried by a screen-owned pivot (position, heading) and a
   bob (the water's swell, a gentle roll, squash and spin), so the art's own
   update() is never fought. The snapshot flags drive the critter: strokes,
   the flip (the critter swims, the floatie drifts upside down beside it),
   hands off for a drink, a bump's squash, a balloon's splash. */
import * as THREE from "three";
import { buildRider } from "../../art/index.js";
import { FLAG } from "../../../shared/protocol.js";
import { angleDelta } from "../model/courseGeom.js";

export const RIDER_SCALE = 1.4;
/* where a name tag points: a little over a seated critter's head */
const HEAD = 1.75;
const STROKE_REPEAT_MS = 340;
const has = (f, bit) => (f & bit) !== 0;

const lookKey = e => JSON.stringify([e?.name, e?.color, e?.look, e?.photo, e?.number, e?.skin, !!e?.groom]);

export function createRiders({ scene, geo, fx, shadowTex }) {
  const riders = new Map();
  const group = new THREE.Group();
  group.name = "riders";
  scene.add(group);
  const MAX = 24;
  const shadowMat = new THREE.MeshBasicMaterial({ map:shadowTex, color:"#000000", transparent:true, opacity:0.38, depthWrite:false });
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX);
  shadows.count = 0;
  shadows.renderOrder = 2;
  shadows.frustumCulled = false;
  scene.add(shadows);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
  const tmpNear = {};

  function make(i, entrant) {
    let art = null;
    try { art = buildRider(entrant); } catch (error) { console.error("Float rider", error); }
    const pivot = new THREE.Group();
    const bob = new THREE.Group();
    const swimmer = new THREE.Group();
    pivot.add(bob);
    pivot.add(swimmer);
    bob.scale.setScalar(RIDER_SCALE);
    swimmer.scale.setScalar(RIDER_SCALE);
    if (art?.root) bob.add(art.root);
    pivot.visible = false;
    group.add(pivot);
    return {
      i, key:lookKey(entrant), entrant, art, pivot, bob, swimmer,
      x:0, y:0, a:0, s:null, z:0, has:false, blend:null,
      phase:i * 1.37, flags:0, lastStrokeL:-1e9, lastStrokeR:-1e9,
      state:{ swim:false, handsOff:false, sad:false, celebrate:false }, celebrateUntil:0,
      squash:0, spin:0, flip:0, drift:new THREE.Vector3(), critterHome:null,
      head:new THREE.Vector3(), screen:{ x:0, y:0, z:0, on:false },
    };
  }

  function dispose(r) {
    group.remove(r.pivot);
    try { r.art?.dispose?.(); } catch {}
  }

  /* entrants change rarely: rebuild a rider only when its look does */
  function sync(entrants = []) {
    const seen = new Set();
    entrants.forEach((e, i) => {
      if (!e) return;
      seen.add(i);
      const key = lookKey(e);
      const old = riders.get(i);
      if (old && old.key === key) { old.entrant = e; return; }
      const next = make(i, e);
      if (old) {
        Object.assign(next, { x:old.x, y:old.y, a:old.a, s:old.s, z:old.z, has:old.has });
        dispose(old);
      }
      riders.set(i, next);
    });
    for (const [i, r] of riders) if (!seen.has(i)) { dispose(r); riders.delete(i); }
  }

  function setArtState(r, patch) {
    let moved = false;
    for (const k of Object.keys(patch)) if (r.state[k] !== patch[k]) { r.state[k] = patch[k]; moved = true; }
    if (moved) try { r.art?.critter?.setState?.({ ...r.state }); } catch {}
  }

  /* the critter leaves its seat to swim, and climbs back after */
  function toWater(r, on) {
    const critter = r.art?.critter?.root;
    if (!critter) return;
    if (on && critter.parent !== r.swimmer) {
      r.critterHome = { parent:critter.parent, position:critter.position.clone(), quaternion:critter.quaternion.clone() };
      r.swimmer.add(critter);
      critter.position.set(0, -0.32, 0);
      critter.quaternion.identity();
    } else if (!on && r.critterHome && critter.parent === r.swimmer) {
      r.critterHome.parent.add(critter);
      critter.position.copy(r.critterHome.position);
      critter.quaternion.copy(r.critterHome.quaternion);
      r.critterHome = null;
    }
  }

  /* where each rider is: `poses` Map i -> { x, y, a, f } (course coords), `show` the indexes drawn */
  function update(dt, time, poses, { show, sad = new Set(), rough = 0, now = 0, camera, width, height, scale = 1 } = {}) {
    let shadowCount = 0;
    for (const [i, r] of riders) {
      const pose = poses.get(i);
      const visible = !!pose && (!show || show.has(i));
      r.pivot.visible = visible;
      if (!visible) { r.screen.on = false; continue; }
      /* blend from a staged pose into the rows when they arrive */
      if (!r.has) { r.x = pose.x; r.y = pose.y; r.a = pose.a; r.has = true; }
      else if (pose.snap) { r.x = pose.x; r.y = pose.y; r.a = pose.a; }
      else {
        const jump = Math.hypot(pose.x - r.x, pose.y - r.y);
        const k = jump > 25 ? 1 : pose.ease ? 1 - Math.exp(-dt * pose.ease) : 1;
        r.x += (pose.x - r.x) * k;
        r.y += (pose.y - r.y) * k;
        r.a += angleDelta(r.a, pose.a) * k;
      }
      const near = geo.nearest(r.x, r.y, r.s, tmpNear);
      r.s = near.s;
      r.lat = geo.lateralOf(r.x, r.y, r.s);
      /* on land (the podium, a thrower on the bank) the pose says how high */
      const land = Number.isFinite(pose.z);
      const zw = land ? pose.z : geo.elevAt(r.s);
      const slope = land ? 0 : (geo.elevAt(r.s - 1) - geo.elevAt(r.s + 1)) / 2;
      r.z += r.z === 0 || pose.snap || Math.abs(zw - r.z) > 6 ? zw - r.z : (zw - r.z) * (1 - Math.exp(-dt * 14));
      const f = pose.f | 0;
      const prev = r.flags;
      r.flags = f;

      /* strokes: each pulse once, and again while the flag stays lit */
      const nowMs = time * 1000;
      if (has(f, FLAG.STROKE_L) && (!has(prev, FLAG.STROKE_L) || nowMs - r.lastStrokeL > STROKE_REPEAT_MS)) {
        r.lastStrokeL = nowMs; try { r.art?.critter?.setStroke?.("L"); } catch {}
        if (!has(f, FLAG.SWIM)) fx?.paddle(r, -1);
      }
      if (has(f, FLAG.STROKE_R) && (!has(prev, FLAG.STROKE_R) || nowMs - r.lastStrokeR > STROKE_REPEAT_MS)) {
        r.lastStrokeR = nowMs; try { r.art?.critter?.setStroke?.("R"); } catch {}
        if (!has(f, FLAG.SWIM)) fx?.paddle(r, 1);
      }
      const swim = has(f, FLAG.SWIM);
      if (swim && !has(prev, FLAG.SWIM)) { fx?.splash(r, 1.4); r.flip = 0.001; }
      if (has(f, FLAG.BUMP) && !has(prev, FLAG.BUMP)) { r.squash = 1; fx?.splash(r, 0.55); }
      if (has(f, FLAG.SPLASHED) && !has(prev, FLAG.SPLASHED)) { r.spin = 1; fx?.balloonSplash?.(r); }
      if (has(f, FLAG.ARRIVED) && !has(prev, FLAG.ARRIVED) && prev !== 0) r.celebrateUntil = now + 2600;
      setArtState(r, {
        swim,
        handsOff:has(f, FLAG.HANDS_OFF) && !swim,
        sad:sad.has(i),
        celebrate:now < r.celebrateUntil && !sad.has(i),
      });
      toWater(r, swim || r.flip > 0.02);

      /* the pivot: the water's surface, facing the heading (the art faces -z) */
      r.pivot.position.set(r.x, r.z, -r.y);
      r.pivot.rotation.set(0, r.a - Math.PI / 2, 0);
      /* the bob: swell, roll, pitch down a fall, squash after a bump */
      const t = time + r.phase;
      const swell = land ? 0.015 : 0.07 + rough * 0.12;
      r.squash = Math.max(0, r.squash - dt * 3.2);
      r.spin = Math.max(0, r.spin - dt * 1.6);
      const sq = Math.sin(r.squash * Math.PI) * 0.22;
      r.bob.position.y = Math.sin(t * 1.9) * swell + 0.02;
      r.bob.rotation.set(Math.sin(t * 1.3) * (0.05 + rough * 0.08) - Math.atan(slope) * 0.8,
        r.spin * 7.5, Math.sin(t * 1.7 + 0.6) * (0.06 + rough * 0.1));
      r.bob.scale.set(RIDER_SCALE * (1 + sq * 0.5), RIDER_SCALE * (1 - sq), RIDER_SCALE * (1 + sq * 0.5));
      /* the flip: the floatie turns over and drifts a little downstream, then comes back */
      const flipTarget = swim ? 1 : 0;
      r.flip += (flipTarget - r.flip) * (1 - Math.exp(-dt * (swim ? 6 : 2.2)));
      if (r.flip < 0.002 && !swim) r.flip = 0;
      const fl = r.flip;
      if (fl > 0) {
        r.bob.rotation.z += fl * Math.PI;
        r.bob.position.y += Math.sin(Math.min(1, fl * 1.4) * Math.PI) * 0.6 * (swim ? 1 : 0.3) - fl * 0.15;
        r.bob.position.x = fl * 1.3;
        r.bob.position.z = -fl * 0.9;
        r.swimmer.position.set(0, Math.sin(t * 3.1) * 0.05, 0);
        r.swimmer.rotation.set(0, Math.sin(t * 2.2) * 0.25, 0);
      } else { r.bob.position.x = 0; r.bob.position.z = 0; }
      try { r.art?.update?.(dt); } catch {}

      /* its shadow on the water */
      if (shadowCount < MAX) {
        const size = 2.2 * RIDER_SCALE;
        m4.compose(at.set(r.x, r.z + 0.03, -r.y), q.identity(), sc.set(size, 1, size));
        shadows.setMatrixAt(shadowCount++, m4);
      }
      /* where its name goes on screen */
      if (camera) {
        r.head.set(r.x, r.z + HEAD * RIDER_SCALE * scale, -r.y).project(camera);
        r.screen.on = r.head.z < 1 && Math.abs(r.head.x) < 1.15 && Math.abs(r.head.y) < 1.15;
        r.screen.x = (r.head.x * 0.5 + 0.5) * width;
        r.screen.y = (-r.head.y * 0.5 + 0.5) * height;
        r.screen.z = r.head.z;
      }
    }
    shadows.count = shadowCount;
    shadows.instanceMatrix.needsUpdate = true;
  }

  /* the podium's poses */
  function pose(i, id) {
    const r = riders.get(i);
    try { r?.art?.critter?.setPose?.(id); } catch {}
  }

  return {
    riders, sync, update, pose, group,
    get(i) { return riders.get(i); },
    dispose() {
      for (const r of riders.values()) dispose(r);
      riders.clear();
      scene.remove(group); scene.remove(shadows);
      shadowGeo.dispose(); shadowMat.dispose(); shadows.dispose();
    },
  };
}
