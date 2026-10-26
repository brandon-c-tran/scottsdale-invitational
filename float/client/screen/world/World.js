/* The 3D river (float/PROTOCOL.md "Components": the screen). Built once
   from the course, then drawn every frame at serverNow() - INTERP_MS from
   the store: riders from the rows (or staged when there are none), the
   moments as they come due, the camera director, the sky, and bloom when
   the device can afford it. Quality steps down on its own; a lost context
   or a renderer that cannot start hands over to the flat map (onFail). */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { NIGHT } from "./palette.js";
import { noiseTexture, dotTexture } from "./noiseTex.js";
import { terrainField, terrainMeshes } from "./terrain.js";
import { planLights } from "./lightsPlan.js";
import { buildRiver, buildFoamDecals, buildWhirlpools } from "./river.js";
import { buildSky, moonDirection } from "./sky.js";
import { buildDressing } from "./dressing.js";
import { buildBar, barSite } from "./bar.js";
import { createRiders } from "./riders.js";
import { createFx } from "./fx.js";
import { createDirector } from "../model/director.js";
import { gridPoses, lobbyPoses, takeoutPoses, podiumPoses } from "../model/staging.js";
import { raceOrder, legOf, cutOf } from "../model/hudModel.js";
import { indexList, throughFor } from "../model/cupShape.js";
import { FLAG } from "../../../shared/protocol.js";
import { floatEnvironment, disposeFloatEnvironment, setFloatArtQuality, disposeFloatArt } from "../../art/index.js";
import { portraitsBusy } from "../hud/identity.js";

export const TIERS = Object.freeze([
  { name:"high", ratio:1.5, post:true, msaa:4, detail:2 },
  { name:"medium", ratio:1, post:true, msaa:0, detail:2 },
  { name:"low", ratio:0.85, post:false, msaa:0, detail:1 },
  { name:"lowest", ratio:0.7, post:false, msaa:0, detail:0 },
]);

const SLOW_MS = 20.5;
/* the frame budget is judged only on settled frames: never while the world,
   a rider's art or the HUD's portraits are being built (shader compiles and
   the portraits' own renders read as a slow GPU, and a TV would step down
   for good at the start), and by the median, so a compile hitch is not a
   slow window */
const WARM_MS = 6000;
const SETTLE_MS = 2500;
const median = list => { const sorted = list.slice().sort((a, b) => a - b); return sorted[sorted.length >> 1]; };
const FOG_DENSITY = 0.0024;
/* how much of the art's night sky the vinyl reflects (and is lit by): only
   the physical materials read it (the riders, the podium, the balloons), so
   it lifts the toys off the darker canyon without touching the land */
const ENV_INTENSITY = 1.6;

export function createWorld({ canvas, store, quality = "auto", onFrame, onFail, onStats }) {
  let renderer;
  try {
    /* ?power=low asks for the integrated GPU on a two-GPU machine (a laptop's worst case) */
    let power = "high-performance";
    try { if (new URLSearchParams(window.location.search).get("power") === "low") power = "low-power"; } catch {}
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:power, stencil:false, preserveDrawingBuffer:false });
  } catch (error) {
    onFail?.("webgl");
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.info.autoReset = false;
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "") : "";
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu);
  const forced = TIERS.findIndex(t => t.name === quality);
  let tier = forced >= 0 ? forced : software ? 2 : 0;
  const auto = forced < 0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(NIGHT.fog, FOG_DENSITY);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 9000);
  camera.position.set(0, 40, 40);

  const noise = noiseTexture();
  const glowTex = dotTexture(64, { power:2.2 });
  const shadowTex = dotTexture(64, { power:1.6 });

  const moonLight = new THREE.DirectionalLight(NIGHT.moonLight, 1.25);
  const hemi = new THREE.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, 0.8);
  scene.add(moonLight, moonLight.target, hemi);

  let built = null;
  let width = 1920, height = 1080;
  let composer = null, bloom = null;
  let envSet = false;
  const clock = new THREE.Timer();
  clock.connect(document);
  let running = true;
  let lost = false;

  const disposeBuilt = () => {
    if (!built) return;
    scene.remove(built.root);
    scene.remove(built.sky.group);
    built.riders.dispose();
    built.fx.dispose();
    built.sky.dispose();
    built.dressing.dispose();
    built.bar?.dispose();
    built.river.meshes.forEach(m => m.geometry.dispose());
    built.river.material.dispose();
    built.terrain.meshes.forEach(m => m.geometry.dispose());
    built.terrain.material.dispose();
    built.foam?.mesh.geometry.dispose(); built.foam?.material.dispose(); built.foam?.mesh.dispose();
    built.whirl?.group.children.forEach(c => c.geometry.dispose()); built.whirl?.material.dispose();
    built = null;
  };

  function build(geo) {
    disposeBuilt();
    const t0 = performance.now();
    const root = new THREE.Group();
    const moonDir = moonDirection(geo);
    moonLight.position.copy(moonDir).multiplyScalar(400);
    const field = terrainField(geo);
    const site = barSite(geo);
    const plan = planLights(geo, { bankZ:(x, y) => field.heightAt(x, y), barS:site.s, barSide:site.side });
    const river = buildRiver(geo, { glowAt:plan.glowAt, noise, moonDir });
    river.meshes.forEach(m => root.add(m));
    const terrain = terrainMeshes(field, { glowAt:plan.glowAt, noise });
    terrain.meshes.forEach(m => root.add(m));
    const foam = buildFoamDecals(geo, { noise });
    if (foam) root.add(foam.mesh);
    const whirl = buildWhirlpools(geo, { noise });
    if (whirl) root.add(whirl.group);
    const sky = buildSky({ moonDir });
    scene.add(sky.group);
    const dressing = buildDressing(geo, field, plan, { glowTex });
    root.add(dressing.group);
    const bar = buildBar(geo, field);
    root.add(bar.group);
    scene.add(root);
    const fx = createFx({ scene, dotTex:glowTex, geo, falls:river.falls });
    const riders = createRiders({ scene, geo, fx, shadowTex, noise });
    const director = createDirector(geo, { wallAt:s => field.wallAt(s), groundAt:(x, y) => field.heightAt(x, y), falls:river.falls });
    if (!envSet) {
      try { scene.environment = floatEnvironment(renderer, "night"); scene.environmentIntensity = ENV_INTENSITY; envSet = true; } catch {}
    }
    built = { geo, root, field, plan, river, terrain, foam, whirl, sky, dressing, bar, fx, riders, director,
      buildMs:performance.now() - t0, appear:new Map(), lastPhase:null };
    applyTier();
    return built;
  }

  function applyTier() {
    const t = TIERS[tier];
    const dpr = Math.min(window.devicePixelRatio || 1, t.ratio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    if (composer) { composer.dispose?.(); composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose(); composer = null; bloom = null; }
    if (t.post) {
      const rt = new THREE.WebGLRenderTarget(width * dpr, height * dpr, { type:THREE.HalfFloatType, samples:t.msaa });
      composer = new EffectComposer(renderer, rt);
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.62, 0.55, 0.88);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    built?.dressing.setDetail(t.detail);
    /* the vinyl's clear coat is the art's most expensive pass: off on the slow tiers */
    setFloatArtQuality(t.name === "low" || t.name === "lowest" ? "low" : "high");
    onStats?.({ tier:t.name });
  }

  function resize(w, h) {
    width = Math.max(2, Math.round(w)); height = Math.max(2, Math.round(h));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
  }

  /* ── per frame ── */
  const poses = new Map();
  const earlier = new Map();
  const replayRows = new Map();
  let replaying = null;
  const staged = new Map();
  const shown = new Set();
  const sadSet = new Set();
  let frameTimes = [];
  const statTimes = [];
  let warmUntil = performance.now() + WARM_MS;
  let slowWindows = 0;
  let lastStats = 0;
  const tagInfo = [];
  const projected = new THREE.Vector3();

  function stageFor(st, room, geo, time) {
    staged.clear(); shown.clear(); sadSet.clear();
    replaying = null;
    const phase = st.phase;
    const leg = legOf(geo, room);
    const entrants = room?.entrants || [];
    const field = indexList(room?.field);
    const rows = store.sample(store.drawTime(), poses);
    if (phase === "lobby" || phase === "connecting") {
      lobbyPoses(geo, geo.legs[0] || leg, entrants.length, time, staged);
      entrants.forEach((_, i) => shown.add(i));
      return staged;
    }
    const legIndex = room?.leg | 0;
    if (phase === "intro" || phase === "grid" || phase === "countdown") {
      gridPoses(geo, legIndex, field, staged);
      if (rows.size) for (const [i, r] of rows) staged.set(i, { ...r, ease:4 });
      field.forEach(i => shown.add(i));
      return staged;
    }
    if (phase === "race") {
      gridPoses(geo, legIndex, field, staged);
      /* the first second of rows eases the riders off their staged grid */
      const settling = Number.isFinite(st.phaseStart) && store.serverNow() - st.phaseStart < 1200;
      /* each rider's velocity from the rows themselves (150 ms back), for wakes */
      const before = store.sample(store.drawTime() - 150, earlier);
      for (const [i, r] of rows) {
        const b = before.get(i);
        const vx = b && !r.stale ? (r.x - b.x) / 0.15 : 0, vy = b && !r.stale ? (r.y - b.y) / 0.15 : 0;
        staged.set(i, { ...r, vx, vy, ease:r.stale > 400 ? 2 : settling ? 6 : 0 });
      }
      field.forEach(i => shown.add(i));
      /* the beach's balloon throwers, standing on the bank for their throw */
      for (const [i, ap] of built.appear) {
        if (time * 1000 > ap.until) { built.appear.delete(i); continue; }
        staged.set(i, { x:ap.x, y:ap.y, z:ap.z, a:ap.a, f:0, snap:true });
        shown.add(i);
      }
      return staged;
    }
    if (phase === "cut") {
      /* The Drop's instant replay: the clip's rows, slowed, on the falls cam */
      const win = store.replayWindow();
      const now = store.serverNow();
      if (win && now >= win.from && now < win.to) {
        const clipAt = win.clipFrom + (now - win.from) * win.rate;
        const clip = store.state.replay.buffer.sample(clipAt, replayRows);
        for (const [i, r] of clip) { staged.set(i, { ...r, ease:0 }); shown.add(i); }
        replaying = win;
        return staged;
      }
      const { cut, through, order } = cutOf(room, st.raceField);
      if (rows.size) for (const [i, r] of rows) staged.set(i, { ...r, ease:2 });
      else takeoutPoses(geo, legIndex, order, staged);
      [...cut, ...through].forEach(i => shown.add(i));
      cut.forEach(i => sadSet.add(i));
      return staged;
    }
    if (phase === "podium" || phase === "feedback") {
      const podium = indexList(room?.podium);
      const others = entrants.map((_, i) => i).filter(i => !podium.includes(i));
      podiumPoses(geo, built.bar, podium, others, staged);
      entrants.forEach((_, i) => shown.add(i));
      return staged;
    }
    return staged;
  }

  function frame() {
    if (!running || lost) return;
    clock.update();
    const dt = Math.min(0.1, clock.getDelta());
    const time = clock.getElapsed();
    const st = store.state;
    const room = st.room;
    const geo = st.geo;
    if (!geo) { renderer.setClearColor(NIGHT.zenith); renderer.clear(); return; }
    if (!built || built.geo !== geo) build(geo);
    const B = built;
    const now = store.serverNow();
    const drawAt = now - 100;
    /* entrants and their art */
    /* the top three step up to the podium in hero detail */
    const hero = st.phase === "podium" || st.phase === "feedback" ? new Set(indexList(room?.podium).slice(0, 3)) : null;
    if (B.riders.sync(room?.entrants || [], { hero }) > 0) unsettled();
    const posesNow = stageFor(st, room, geo, time);
    /* moments due at the draw time */
    for (const e of store.takeEvents(drawAt)) handleEvent(e, B, time, room);
    /* the race order, for the director and the HUD */
    const leg = legOf(geo, room);
    const field = indexList(room?.field);
    const sticky = st.phase === "race" ? B.shownOrder : null;
    const order = raceOrder({ field, rows:poses, results:room?.results || [], arrivals:st.arrivals, prev:sticky, stick:0.6 });
    B.lastOrder = order;
    B.shownOrder = st.phase === "race" ? order.map(o => o.i) : null;
    const through = throughFor(room);
    const phaseElapsed = Number.isFinite(st.phaseStart) ? now - st.phaseStart : 0;
    const phaseDur = Number.isFinite(room?.endsAt) && Number.isFinite(room?.startAt) && room.endsAt > room.startAt ? room.endsAt - room.startAt : null;
    B.riders.update(dt, time, posesNow, { show:shown, sad:sadSet, rough:0, now:time * 1000, camera, width, height });
    const riderList = order.map(o => {
      const r = B.riders.get(o.i);
      return { ...o, s:r?.s, lat:r?.lat, x:r?.x, y:r?.y };
    });
    const nextLeg = geo.legs[Math.min(geo.legs.length - 1, (room?.leg | 0) + 1)];
    /* a race resumed after the room restarted counts down where the riders are, not at the grid */
    const dirPhase = replaying ? "replay" : st.phase === "countdown" && room?.resume === true ? "race" : st.phase;
    const cam = B.director.update(dt, {
      phase:dirPhase, t:phaseElapsed, dur:phaseDur, leg, riders:riderList, through, round:room?.round | 0, now:time * 1000,
      replay:replaying,
      nextLeg:(room?.leg | 0) + 1 < geo.legs.length ? nextLeg : null,
      podiumAt:B.bar?.anchor, aspect:width / height,
    });
    camera.position.set(cam.eye.x, cam.eye.z, -cam.eye.y);
    /* the fog thins as the camera climbs: the overview sees the whole river */
    const above = cam.eye.z - geo.elevAt(geo.length / 2);
    scene.fog.density = FOG_DENSITY * Math.min(1, Math.max(0.05, 70 / Math.max(70, above)));
    camera.lookAt(cam.look.x, cam.look.z, -cam.look.y);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    /* the world's clocks */
    B.river.material.uniforms.uTime.value = time;
    if (B.foam) B.foam.material.uniforms.uTime.value = time;
    if (B.whirl) B.whirl.material.uniforms.uTime.value = time;
    B.sky.update(camera, time, height);
    B.bar?.update(time);
    B.fx.update(dt, time, { camera, height, riderOf:i => B.riders.get(i) });
    /* draw */
    renderer.info.reset();
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    /* the HUD's per-frame view: names over heads, the order */
    tagInfo.length = 0;
    for (const o of riderList) {
      const r = B.riders.get(o.i);
      if (!r) continue;
      tagInfo.push({ i:o.i, x:r.screen.x, y:r.screen.y, z:r.screen.z, on:r.screen.on && r.pivot.visible, rank:o.rank, state:o.state, f:o.f, p:o.p });
    }
    if (st.phase === "lobby" || st.phase === "podium" || st.phase === "feedback") {
      for (const i of shown) {
        if (tagInfo.some(t => t.i === i)) continue;
        const r = B.riders.get(i);
        if (r) tagInfo.push({ i, x:r.screen.x, y:r.screen.y, z:r.screen.z, on:r.screen.on && r.pivot.visible, rank:0, state:"idle", f:0, p:0 });
      }
    }
    let podiumSpots = null;
    if ((st.phase === "podium" || st.phase === "feedback") && B.bar) {
      const onTop = indexList(room?.podium);
      podiumSpots = B.bar.tops.map(top => {
        /* the place and name ride just over whoever stands there */
        const r = B.riders.get(onTop[top.place - 1]);
        const over = r ? r.headY * (r.scale || 1) + 0.1 : 2.15;
        projected.set(top.x, top.z + over, -top.y).project(camera);
        return { place:top.place, x:Math.round((projected.x * 0.5 + 0.5) * width), y:Math.round((-projected.y * 0.5 + 0.5) * height), on:projected.z < 1 };
      });
    }
    /* the intro's map: where each leg's name goes */
    let legLabels = null;
    if (st.phase === "intro" && cam.key === "intro:map") {
      legLabels = B.director.legMarks().map(m => {
        projected.set(m.x, m.z, -m.y).project(camera);
        return { k:m.k, x:Math.round((projected.x * 0.5 + 0.5) * width), y:Math.round((-projected.y * 0.5 + 0.5) * height), on:projected.z < 1 };
      });
    }
    onFrame?.({ tags:tagInfo, order, through, leg, now, drawAt, shot:cam.shot, camKey:cam.key, width, height, podium:podiumSpots,
      replay:replaying ? { i:replaying.i } : null, legLabels, cutGroup:cam.cutGroup });
    /* step down when the frame budget will not hold */
    const t = performance.now();
    if (portraitsBusy() || B.riders.busy?.()) unsettled();
    statTimes.push(dt * 1000);
    if (statTimes.length > 90) statTimes.shift();
    frameTimes.push(dt * 1000);
    if (frameTimes.length > 90) frameTimes.shift();
    if (auto && t > warmUntil && frameTimes.length >= 90 && document.visibilityState === "visible") {
      const typical = median(frameTimes);
      if (typical > SLOW_MS) {
        slowWindows++;
        frameTimes = [];
        if (slowWindows >= 2 && tier < TIERS.length - 1) { tier++; slowWindows = 0; warmUntil = t + 3000; applyTier(); }
        else if (slowWindows >= 3 && tier === TIERS.length - 1 && typical > 55) onFail?.("slow");
      } else if (frameTimes.length >= 90) slowWindows = Math.max(0, slowWindows - 1);
    }
    if (t - lastStats > 1000) {
      lastStats = t;
      const avg = statTimes.length ? statTimes.reduce((a, b) => a + b, 0) / statTimes.length : 16.7;
      onStats?.({ tier:TIERS[tier].name, fps:Math.round(1000 / Math.max(1, avg)), calls:renderer.info.render.calls,
        triangles:renderer.info.render.triangles, gpu, buildMs:Math.round(B.buildMs), textures:renderer.info.memory.textures,
        geometries:renderer.info.memory.geometries });
    }
  }

  /* something is being built: the next frames do not count toward the budget */
  function unsettled() {
    warmUntil = Math.max(warmUntil, performance.now() + SETTLE_MS);
    frameTimes = [];
  }

  function handleEvent(e, B, time, room) {
    const r = Number.isInteger(e.i) ? B.riders.get(e.i) : null;
    switch (e.e) {
      case "balloon": {
        const target = Number.isInteger(e.j) ? B.riders.get(e.j) : null;
        if (!target) break;
        /* the thrower stands on the nearer bank, a little upstream of the target */
        const geo = B.geo;
        const s = Math.max(0, (target.s ?? 0) - 7);
        const p = geo.sample(s);
        const side = (target.lat ?? 0) >= 0 ? 1 : -1;
        const x = p.x + p.nx * side * (p.w / 2 + 2.2), y = p.y + p.ny * side * (p.w / 2 + 2.2);
        const z = B.field.heightAt(x, y) + 0.1;
        const a = Math.atan2(target.y - y, target.x - x);
        if (Number.isInteger(e.i)) B.appear.set(e.i, { x, y, z, a, until:time * 1000 + 2600 });
        const color = room?.entrants?.[e.i]?.color;
        B.fx.throwBalloon({ from:{ x, y, z:z + 2.2 }, target:e.j, color, at:time * 1000, ms:1200 });
        break;
      }
      case "flip":
        /* the Drop is the falls cam's; a riffle flip near the front gets a punch-in */
        if (r && e.why !== "drop" && !B.geo.zonesAt(r.s ?? 0).includes("drop")) {
          const rank = B.lastOrder?.find(o => o.i === e.i)?.rank ?? 99;
          if (rank <= 3) B.director.punch({ i:e.i, kind:"flip", now:time * 1000 });
        }
        break;
      case "bump":
        if (Number.isFinite(e.x) && r) {
          const recent = (B.bumps = (B.bumps || []).filter(b => time - b.t < 1.4));
          recent.push({ t:time, x:e.x, y:e.y, i:e.i });
          const near = recent.filter(b => Math.hypot(b.x - e.x, b.y - e.y) < 8);
          if (near.length >= 3) B.director.punch({ i:e.i, kind:"pileup", now:time * 1000 });
        }
        break;
      case "arrive":
        if (r) B.fx.splash(r, 0.6);
        break;
      default: break;
    }
  }

  renderer.setAnimationLoop(frame);
  let paused = false;

  const onLost = event => { event.preventDefault(); lost = true; renderer.setAnimationLoop(null); onFail?.("lost"); };
  canvas.addEventListener("webglcontextlost", onLost);

  return {
    resize,
    /* mounted but hidden: no frames at all; back, the clock skips the gap and
       the frame budget starts fresh (a long first frame is not a slow GPU) */
    setPaused(on) {
      on = !!on;
      if (on === paused || lost || !running) return;
      paused = on;
      if (on) { renderer.setAnimationLoop(null); return; }
      clock.reset?.();
      frameTimes = []; slowWindows = 0; warmUntil = performance.now() + 3000;
      renderer.setAnimationLoop(frame);
    },
    get tier() { return TIERS[tier].name; },
    setTier(name) { const k = TIERS.findIndex(t => t.name === name); if (k >= 0) { tier = k; applyTier(); } },
    renderer, scene, camera,
    built:() => built,
    podiumBurst(place) {
      const top = built?.bar?.tops.find(t => t.place === place);
      if (top) built.fx.burst(new THREE.Vector3(top.x, top.z, -top.y), place === 1 ? 160 : 60, place === 1 ? 8 : 5);
    },
    pose(i, id) { built?.riders.pose(i, id); },
    dispose() {
      running = false;
      renderer.setAnimationLoop(null);
      canvas.removeEventListener("webglcontextlost", onLost);
      disposeBuilt();
      composer?.renderTarget1?.dispose(); composer?.renderTarget2?.dispose();
      if (envSet) { scene.environment = null; disposeFloatEnvironment(renderer); envSet = false; }
      /* the art's quality is global: the Locker's and the TV roster's portraits keep their clear coat */
      setFloatArtQuality("high");
      disposeFloatArt();
      noise.dispose(); glowTex.dispose(); shadowTex.dispose();
      clock.dispose?.();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch {}
    },
  };
}

export { FLAG };
