/* The riders on the water: one art rider per entrant (float/client/art
   buildRider, race detail; hero on the podium), carried by a screen-owned
   pivot (position, heading) and a bob (the water's swell, a gentle roll,
   squash and spin), so the art's own update() is never fought. The snapshot
   flags drive the critter: strokes, swimming (the art capsizes the floatie
   and paddles its critter beside it), hands off for a drink; the screen adds
   a bump's squash and a balloon's spin. A hand entering the water splashes
   (the critter's onCatch). */
import * as THREE from "three";
import { buildRider } from "../../art/index.js";
import { FLAG } from "../../../shared/protocol.js";
import { angleDelta } from "../model/courseGeom.js";

/* the art is life size (a ring about 1.45 m across, a seated rider about
   1 m over the water); a little larger reads from the couch, and a ring of
   about 1.8 m still matches the engine's 0.8 m bump radius */
export const RIDER_SCALE = 1.25;
/* where a name tag points: a little over a seated critter's head */
const HEAD = 1.3;
const STROKE_REPEAT_MS = 340;
const has = (f, bit) => (f & bit) !== 0;

const lookKey = (e, detail) => JSON.stringify([e?.name, e?.color, e?.look, e?.photo, e?.number, e?.skin, !!e?.groom, detail]);

/* a rider's wake: a V of foam opening behind it, longer the faster it goes */
function wakeMaterial(noise) {
  return new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise:{ value:noise }, uTime:{ value:0 }, uFoam:{ value:new THREE.Color("#dfe9f2") } }]),
    vertexShader:/* glsl */ `
      attribute vec2 aWake;
      varying vec2 vUv;
      varying vec2 vWake;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vWake = aWake;
        vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */ `
      uniform sampler2D uNoise;
      uniform float uTime;
      uniform vec3 uFoam;
      varying vec2 vUv;
      varying vec2 vWake;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        /* x: 0 at the rider, 1 at the wake's end; y: -1..1 across */
        float x = 1.0 - vUv.x;
        float y = vUv.y * 2.0 - 1.0;
        float spread = 0.22 + x * 0.78;
        float fade = (1.0 - x) * (1.0 - x);
        float arms = smoothstep(0.09, 0.0, abs(abs(y) - spread)) * fade;
        float trail = smoothstep(0.22 * spread, 0.0, abs(y)) * fade * 0.4;
        float n = texture(uNoise, vec2(vUv.x * 0.7 + uTime * 0.5 + vWake.y, y * 0.3)).a;
        float a = (arms + trail) * smoothstep(0.18, 0.62, n) * vWake.x * smoothstep(0.0, 0.1, x);
        if (a < 0.02) discard;
        gl_FragColor = vec4(uFoam, min(1.0, a) * 0.4);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent:true, depthWrite:false, fog:true, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3,
  });
}

export function createRiders({ scene, geo, fx, shadowTex, noise }) {
  const riders = new Map();
  let meshesPending = 0, meshLandedAt = -Infinity;
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
  const wakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const wakeAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  wakeGeo.setAttribute("aWake", wakeAttr);
  const wakeMat = noise ? wakeMaterial(noise) : null;
  const wakes = wakeMat ? new THREE.InstancedMesh(wakeGeo, wakeMat, MAX) : null;
  if (wakes) { wakes.count = 0; wakes.frustumCulled = false; wakes.renderOrder = 2; scene.add(wakes); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const tmpNear = {};

  function make(i, entrant, detail = "race") {
    let art = null;
    try { art = buildRider(entrant, { detail }); } catch (error) { console.error("Float rider", error); }
    /* the baked mesh lands after the build, and its shaders compile on the
       next draw: busy() keeps the frame budget out of that */
    if (art?.ready && typeof art.ready.then === "function") {
      meshesPending += 1;
      art.ready.then(() => {}, () => {}).finally(() => { meshesPending -= 1; meshLandedAt = performance.now(); });
    }
    const pivot = new THREE.Group();
    const bob = new THREE.Group();
    pivot.add(bob);
    bob.scale.setScalar(RIDER_SCALE);
    if (art?.root) bob.add(art.root);
    pivot.visible = false;
    group.add(pivot);
    /* the name tag points just over the top of this rider (a hat included) */
    let headY = HEAD * RIDER_SCALE;
    try {
      if (art?.root) {
        const box = new THREE.Box3().setFromObject(art.root);
        if (Number.isFinite(box.max.y) && box.max.y > 0.3) headY = box.max.y * RIDER_SCALE + 0.35;
      }
    } catch {}
    const r = {
      headY, detail,
      i, key:lookKey(entrant, detail), entrant, art, pivot, bob,
      x:0, y:0, a:0, s:null, z:0, has:false, blend:null, vx:0, vy:0, speed:0,
      phase:i * 1.37, flags:0, lastStrokeL:-1e9, lastStrokeR:-1e9,
      state:{ swim:false, handsOff:false, sad:false, celebrate:false }, celebrateUntil:0, poseId:null,
      squash:0, spin:0, swimFor:0,
      head:new THREE.Vector3(), screen:{ x:0, y:0, z:0, on:false },
    };
    /* a paddle's splash lands as the hand goes in, not when the phone taps */
    if (art?.critter) art.critter.onCatch = side => { if (r.pivot.visible && !has(r.flags, FLAG.SWIM)) fx?.paddle(r, side === "L" ? -1 : 1); };
    return r;
  }

  function dispose(r) {
    group.remove(r.pivot);
    try { r.art?.dispose?.(); } catch {}
  }

  /* entrants change rarely: rebuild a rider only when its look does, or
     when it steps up to the podium (hero detail for the close-ups) */
  function sync(entrants = [], { hero = null } = {}) {
    const seen = new Set();
    let builtNow = 0;
    entrants.forEach((e, i) => {
      if (!e) return;
      seen.add(i);
      const detail = hero?.has(i) ? "hero" : "race";
      const key = lookKey(e, detail);
      const old = riders.get(i);
      if (old && old.key === key) { old.entrant = e; return; }
      const next = make(i, e, detail);
      builtNow++;
      if (old) {
        Object.assign(next, { x:old.x, y:old.y, a:old.a, s:old.s, z:old.z, has:old.has, flags:old.flags, celebrateUntil:old.celebrateUntil });
        if (old.poseId) { next.poseId = old.poseId; try { next.art?.critter?.setPose?.(old.poseId); } catch {} }
        dispose(old);
      }
      riders.set(i, next);
    });
    for (const [i, r] of riders) if (!seen.has(i)) { dispose(r); riders.delete(i); }
    /* how many riders were (re)built: their first frames compile shaders */
    return builtNow;
  }

  function setArtState(r, patch) {
    let moved = false;
    for (const k of Object.keys(patch)) if (r.state[k] !== patch[k]) { r.state[k] = patch[k]; moved = true; }
    if (moved) try { r.art?.critter?.setState?.({ ...r.state }); } catch {}
  }

  /* where each rider is: `poses` Map i -> { x, y, a, f } (course coords), `show` the indexes drawn */
  function update(dt, time, poses, { show, sad = new Set(), rough = 0, now = 0, camera, width, height, scale = 1 } = {}) {
    let shadowCount = 0;
    for (const [i, r] of riders) {
      const pose = poses.get(i);
      const visible = !!pose && (!show || show.has(i));
      r.pivot.visible = visible;
      if (!visible) { r.screen.on = false; continue; }
      const px = r.x, py = r.y;
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
      /* how fast it moves, for its wake */
      if (Number.isFinite(pose.vx)) { r.vx = pose.vx; r.vy = pose.vy; r.speed = Math.hypot(r.vx, r.vy); }
      else if (dt > 0) {
        const k = 1 - Math.exp(-dt * 5);
        const jump = Math.hypot(r.x - px, r.y - py);
        const vx = jump > 6 ? 0 : (r.x - px) / dt, vy = jump > 6 ? 0 : (r.y - py) / dt;
        r.vx += (vx - r.vx) * k; r.vy += (vy - r.vy) * k;
        r.speed = Math.hypot(r.vx, r.vy);
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

      /* strokes: each pulse once, and again while the flag stays lit (the
         art counts calls inside a stroke's first 0.28 s as that stroke) */
      const nowMs = time * 1000;
      if (has(f, FLAG.STROKE_L) && (!has(prev, FLAG.STROKE_L) || nowMs - r.lastStrokeL > STROKE_REPEAT_MS)) {
        r.lastStrokeL = nowMs; try { r.art?.critter?.setStroke?.("L"); } catch {}
      }
      if (has(f, FLAG.STROKE_R) && (!has(prev, FLAG.STROKE_R) || nowMs - r.lastStrokeR > STROKE_REPEAT_MS)) {
        r.lastStrokeR = nowMs; try { r.art?.critter?.setStroke?.("R"); } catch {}
      }
      const swim = has(f, FLAG.SWIM);
      if (swim && !has(prev, FLAG.SWIM)) fx?.splash(r, 1.4);
      r.swimFor = swim ? Math.min(1, r.swimFor + dt * 3) : Math.max(0, r.swimFor - dt * 2);
      if (has(f, FLAG.BUMP) && !has(prev, FLAG.BUMP)) { r.squash = 1; fx?.splash(r, 0.55); }
      if (has(f, FLAG.SPLASHED) && !has(prev, FLAG.SPLASHED)) { r.spin = 1; fx?.balloonSplash?.(r); }
      if (has(f, FLAG.ARRIVED) && !has(prev, FLAG.ARRIVED) && prev !== 0) r.celebrateUntil = now + 2600;
      setArtState(r, {
        swim,
        handsOff:has(f, FLAG.HANDS_OFF) && !swim,
        sad:sad.has(i),
        celebrate:now < r.celebrateUntil && !sad.has(i),
      });

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
      const k = Number.isFinite(pose.scale) ? pose.scale : 1;
      r.scale = k;
      r.bob.scale.set(RIDER_SCALE * k * (1 + sq * 0.5), RIDER_SCALE * k * (1 - sq), RIDER_SCALE * k * (1 + sq * 0.5));
      try { r.art?.update?.(dt); } catch {}

      /* its wake: relative to the water, so a rider carried by the current leaves little */
      if (wakes && shadowCount < MAX && !land) {
        const flow = geo.flowAt(r.s ?? 0);
        const tx = Math.cos(r.a), ty = Math.sin(r.a);
        const rel = Math.max(0, r.speed - flow * 0.55);
        const strength = Math.min(1, rel / 2.2) * (swim ? 0.3 : 1);
        const dir = r.speed > 0.3 ? Math.atan2(r.vy, r.vx) : r.a;
        const len = (1.6 + Math.min(2.4, rel) * 1.05) * RIDER_SCALE;
        const width = (1.9 + Math.min(2.4, rel) * 0.3) * RIDER_SCALE;
        const cx = r.x - Math.cos(dir) * (len / 2 - 0.6), cy = r.y - Math.sin(dir) * (len / 2 - 0.6);
        q.setFromAxisAngle(yAxis, dir);
        m4.compose(at.set(cx, r.z + 0.04, -cy), q, sc.set(len, 1, width));
        wakes.setMatrixAt(shadowCount, m4);
        wakeAttr.setXY(shadowCount, strength, (i * 0.37) % 1);
        void tx; void ty;
      }
      /* its shadow on the water */
      if (shadowCount < MAX) {
        const size = 1.9 * RIDER_SCALE;
        m4.compose(at.set(r.x, r.z + 0.03, -r.y), q.identity(), sc.set(size, 1, size));
        shadows.setMatrixAt(shadowCount++, m4);
      }
      /* where its name goes on screen */
      if (camera) {
        r.head.set(r.x, r.z + r.headY * scale * k - r.swimFor * 0.55 * RIDER_SCALE, -r.y).project(camera);
        /* a rider under the frame's foot shows no tag hanging off the bottom edge */
        r.screen.on = r.head.z < 1 && Math.abs(r.head.x) < 1.08 && r.head.y > -0.92 && r.head.y < 1.05;
        r.screen.x = (r.head.x * 0.5 + 0.5) * width;
        r.screen.y = (-r.head.y * 0.5 + 0.5) * height;
        r.screen.z = r.head.z;
      }
    }
    shadows.count = shadowCount;
    shadows.instanceMatrix.needsUpdate = true;
    if (wakes) {
      wakes.count = shadowCount;
      wakes.instanceMatrix.needsUpdate = true;
      wakeAttr.needsUpdate = true;
      wakeMat.uniforms.uTime.value = time;
    }
  }

  /* the podium's poses (kept, so a rebuilt rider strikes it again) */
  function pose(i, id) {
    const r = riders.get(i);
    if (!r) return;
    r.poseId = id || null;
    try { r.art?.critter?.setPose?.(id || null); } catch {}
  }

  return {
    riders, sync, update, pose, group,
    get(i) { return riders.get(i); },
    /* a rider's mesh is still on its way, or landed a moment ago (its first draw compiles) */
    busy() { return meshesPending > 0 || performance.now() - meshLandedAt < 1500; },
    dispose() {
      for (const r of riders.values()) dispose(r);
      riders.clear();
      scene.remove(group); scene.remove(shadows);
      shadowGeo.dispose(); shadowMat.dispose(); shadows.dispose();
      if (wakes) { scene.remove(wakes); wakeGeo.dispose(); wakeMat.dispose(); wakes.dispose(); }
    },
  };
}
