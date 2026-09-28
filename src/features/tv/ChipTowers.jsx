/* Chip Towers, the TV's standings as the real thing: every player's tower
   of their own chip, one chip per 100, in rank order on a flat table.

   This file is the only importer of three.js and is loaded with a dynamic
   import from TowersBoard, so it ships as a TV-only chunk that phones never
   download. Everything stays flat: a three-step cel ramp with nearest
   filtering (hard steps, no gradient), an --ink0 inverted-hull outline, no
   shadows, no bloom, no environment. It renders on demand: frames run only
   while a chip falls or a tower moves, then the scene idles at 0 fps. */

import React, { useEffect, useLayoutEffect, useRef } from "react";
import {
  WebGLRenderer, Scene, OrthographicCamera, CylinderGeometry, RingGeometry, InstancedMesh, Mesh,
  MeshToonMaterial, MeshBasicMaterial, DataTexture, CanvasTexture, NearestFilter, RGBAFormat, BackSide,
  DirectionalLight, Object3D, SRGBColorSpace, Color,
} from "three";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { DISPLAY } from "../../ui/theme.js";
import {
  TOWER_GEOMETRY as G, TOWER_TIMING as T, towerTransition, towerSchedule, towerFit, towerSlotX, towerLeaders,
  towerSignature, towerChips, dropEase, easeInOutCubic, easeOutCubic, frameMonitor,
} from "./towersModel.js";

const TEX = 512;
/* 36 sides reads as round at TV size: 288 triangles a chip with its
   outline, so a Saturday-night board of ~450 chips is ~130k */
const SEGMENTS = 36;
const EL = G.elevationDeg * Math.PI / 180;
const TOP_YAW = Math.PI / 2; /* turns the stamp upright toward the room */

/* tokens, read once from :root so the scene never carries a raw color */
const token = (name, fallback) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
  catch { return fallback; }
};
const resolveVars = markup => markup.replace(/var\((--[\w-]+)\)/g, (_, name) => token(name, "currentColor"));

/* stable per-chip jitter and yaw, so a re-render never reshuffles a stack */
function seeded(player, j) {
  let h = 2166136261;
  for (const ch of `${player}#${j}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const a = (h & 0xffff) / 0xffff, b = ((h >>> 16) & 0xffff) / 0xffff;
  return { yaw:a * Math.PI * 2, jx:(b - 0.5) * 0.07, jz:(a - 0.5) * 0.05 };
}

/* The face is the player's actual ChipFace (edge skin and all) rasterized
   from the DOM, then the jersey number is set with the loaded display face,
   drawn last over the chip's own color as the 2D chip does. */
async function paintFace(svg, identity) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX;
  const g = canvas.getContext("2d");
  g.fillStyle = identity.color;
  g.fillRect(0, 0, TEX, TEX);
  try {
    const markup = resolveVars(new XMLSerializer().serializeToString(svg)).replace(/filter:[^;"]*;?/g, "");
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await img.decode();
    /* the chip circle (r 14.7 + half its stroke) fills the cap */
    const k = 16 / 15.42, size = TEX * k, off = (TEX - size) / 2;
    g.drawImage(img, off, off, size, size);
  } catch { /* the flat color face still reads */ }
  if (identity.num != null) {
    try { await document.fonts?.load?.(`700 64px ${DISPLAY}`); } catch { /* fallback face */ }
    const k = TEX / 32 * (16 / 15.42);
    g.fillStyle = identity.isLight ? token("--ink0", "#151c1c") : token("--bone", "#f2eddf");
    g.font = `700 ${Math.round(11.7 * k)}px ${DISPLAY}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(identity.num), TEX / 2, TEX / 2 + 0.8 * k);
  }
  return canvas;
}

/* the edge skin on the actual rim, as inserts on a clay chip */
function paintSide(identity) {
  const w = 1024, h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  g.fillStyle = identity.color;
  g.fillRect(0, 0, w, h);
  const ink = identity.isLight ? token("--ink0", "#151c1c") : token("--bone", "#f2eddf");
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 4; g.lineJoin = "round";
  const each = (n, draw) => { for (let i = 0; i < n; i++) draw((i + 0.5) * w / n); };
  const skin = identity.skin;
  if (skin === "plain") return canvas;
  if (skin === "dots") each(12, x => { g.beginPath(); g.arc(x, h / 2, 6, 0, Math.PI * 2); g.fill(); });
  else if (skin === "quad") each(4, x => g.fillRect(x - 46, 6, 92, h - 12));
  else if (skin === "ring") { g.fillRect(0, h / 2 - 3, w, 6); }
  else if (skin === "dash") each(6, x => g.fillRect(x - 56, 9, 112, h - 18));
  else if (skin === "saw") {
    g.beginPath();
    for (let i = 0; i <= 44; i++) g.lineTo(i * w / 44, i % 2 ? 6 : h - 6);
    g.stroke();
  } else if (skin === "wave") {
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.sin(x / w * Math.PI * 28) * 8);
    g.stroke();
  } else if (skin === "flame" || skin === "star" || skin === "bolt" || skin === "crown") {
    each(skin === "crown" ? 4 : 6, x => {
      g.beginPath();
      if (skin === "star") { g.moveTo(x, 4); g.lineTo(x + 12, h / 2); g.lineTo(x, h - 4); g.lineTo(x - 12, h / 2); }
      else if (skin === "bolt") { g.moveTo(x - 14, 6); g.lineTo(x, h - 12); g.lineTo(x + 14, 6); g.lineTo(x + 14, 14); g.lineTo(x, h - 4); g.lineTo(x - 14, 14); }
      else if (skin === "crown") { g.moveTo(x - 22, h - 6); g.lineTo(x - 18, 6); g.lineTo(x - 8, 16); g.lineTo(x, 4); g.lineTo(x + 8, 16); g.lineTo(x + 18, 6); g.lineTo(x + 22, h - 6); }
      else { g.moveTo(x, 4); g.quadraticCurveTo(x + 12, h * 0.6, x, h - 4); g.quadraticCurveTo(x - 12, h * 0.6, x, 4); }
      g.closePath(); g.fill();
    });
  } else each(8, x => g.fillRect(x - 16, 6, 32, h - 12)); /* ticks, the default */
  return canvas;
}

/* one hidden ChipFace per player, the source of that player's textures */
function FaceSource({ p, onPaint }) {
  const identity = usePlayerIdentity(p);
  const ref = useRef(null);
  const sig = `${identity.color}|${identity.skin}|${identity.num}|${identity.isLight}`;
  useEffect(() => {
    let live = true;
    const svg = ref.current?.querySelector("svg");
    Promise.resolve(svg ? paintFace(svg, identity) : null).then(face => {
      if (live) onPaint.current(p, { face, side:paintSide(identity), identity, sig });
    });
    return () => { live = false; };
  }, [p, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}><ChipFace p={p} size={128} stamp="" /></span>;
}

const texture = canvas => {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/* â•â•â• the scene â•â•â• */
function createScene(canvas, { width, height, pixelRatio }) {
  const renderer = new WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:"high-performance" });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  camera.position.set(0, 120 * Math.sin(EL), 120 * Math.cos(EL));
  camera.lookAt(0, 0, 0);
  /* three hard bands: 47% / 78% / 100% of the chip's own color */
  const ramp = new DataTexture(new Uint8Array([48, 48, 48, 255, 148, 148, 148, 255, 255, 255, 255, 255]), 3, 1, RGBAFormat);
  ramp.minFilter = ramp.magFilter = NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  const light = new DirectionalLight(0xffffff, Math.PI);
  light.position.set(-10, 12, 6);
  scene.add(light);
  const chipGeo = new CylinderGeometry(G.radius, G.radius, G.chip, SEGMENTS, 1);
  /* the two caps share one group: two draw calls per tower, not three */
  const [side, top, bottom] = chipGeo.groups;
  chipGeo.clearGroups();
  chipGeo.addGroup(side.start, side.count, 0);
  chipGeo.addGroup(top.start, top.count + bottom.count, 1);
  const hullMat = new MeshBasicMaterial({ color:new Color(token("--ink0", "#151c1c")), side:BackSide });
  const ringMat = new MeshBasicMaterial({ color:new Color(token("--sun", "#e4d477")) });
  const ringGeo = new RingGeometry(1.15, 1.35, 64);
  ringGeo.rotateX(-Math.PI / 2);
  return { renderer, scene, camera, ramp, chipGeo, hullGeo:null, hullW:0, hullMat, ringMat, ringGeo,
    towers:new Map(), rings:[], k:48, rows:null, width, height };
}

function hullFor(s, k) {
  /* a 1.5px ink outline at the current scale */
  const w = 1.5 / k;
  if (s.hullGeo && Math.abs(s.hullW - w) / w < 0.12) return;
  const geo = new CylinderGeometry(G.radius + w, G.radius + w, G.chip + 2 * w, SEGMENTS, 1);
  s.towers.forEach(t => { t.hull.geometry = geo; });
  s.hullGeo?.dispose();
  s.hullGeo = geo; s.hullW = w;
}

const dummy = new Object3D();
function setChip(t, j, { lift = 0, scale = 1, top = false } = {}) {
  const r = seeded(t.player, j);
  dummy.position.set(r.jx, G.chip / 2 + j * G.chip + lift, r.jz);
  dummy.rotation.set(0, top ? TOP_YAW : r.yaw, 0);
  dummy.scale.set(scale, scale, scale);
  dummy.updateMatrix();
  t.mesh.setMatrixAt(j, dummy.matrix);
  t.hull.setMatrixAt(j, dummy.matrix);
  t.mesh.instanceMatrix.needsUpdate = true;
  t.hull.instanceMatrix.needsUpdate = true;
}
function setCount(t, n) {
  t.count = n;
  t.mesh.count = n;
  t.hull.count = n;
}

function buildTower(s, player, capacity) {
  const old = s.towers.get(player);
  const sideMat = old?.sideMat || new MeshToonMaterial({ color:0x888888, gradientMap:s.ramp });
  const faceMat = old?.faceMat || new MeshToonMaterial({ color:0x888888, gradientMap:s.ramp });
  const mesh = new InstancedMesh(s.chipGeo, [sideMat, faceMat], capacity);
  const hull = new InstancedMesh(s.hullGeo, s.hullMat, capacity);
  mesh.frustumCulled = false; hull.frustumCulled = false;
  mesh.add(hull);
  const t = old || { player, x:0, z:0, lift:0, count:0, sideMat, faceMat };
  if (old) {
    for (let j = 0; j < old.count; j++) {
      old.mesh.getMatrixAt(j, dummy.matrix);
      mesh.setMatrixAt(j, dummy.matrix); hull.setMatrixAt(j, dummy.matrix);
    }
    s.scene.remove(old.mesh);
    old.mesh.dispose(); old.hull.dispose();
  }
  t.mesh = mesh; t.hull = hull; t.capacity = capacity;
  mesh.position.set(t.x, t.lift, t.z);
  setCount(t, t.count);
  s.scene.add(mesh);
  s.towers.set(player, t);
  return t;
}
function ensureTower(s, player, need) {
  const t = s.towers.get(player);
  if (t && t.capacity >= need) return t;
  return buildTower(s, player, Math.max(need + 24, 48, (t?.capacity || 0) * 2));
}

function applyPaint(s, player, paint) {
  const t = s.towers.get(player);
  if (!t) return;
  const swap = (mat, canvas) => {
    if (!canvas) { mat.color.set(paint.identity.color); return; }
    mat.map?.dispose();
    mat.map = texture(canvas);
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  };
  swap(t.faceMat, paint.face);
  swap(t.sideMat, paint.side);
}

function fitCamera(s, k) {
  const c = s.camera;
  c.left = -s.width / (2 * k); c.right = s.width / (2 * k);
  c.top = s.baseY / k; c.bottom = -(s.height - s.baseY) / k;
  c.updateProjectionMatrix();
  s.k = k;
}

function ringsFor(s, leaders) {
  while (s.rings.length < leaders.length) {
    const ring = new Mesh(s.ringGeo, s.ringMat);
    ring.position.y = 0.004;
    s.scene.add(ring);
    s.rings.push({ mesh:ring, follow:null });
  }
  while (s.rings.length > leaders.length) s.scene.remove(s.rings.pop().mesh);
  s.rings.forEach((ring, i) => { ring.follow = leaders[i]; });
}

/* the board as it stands, in one frame */
function snapTo(s, rows) {
  const count = rows.length;
  const tallest = Math.max(1, ...rows.map(row => towerChips(row.pts)));
  fitCamera(s, towerFit({ width:s.width, baseY:s.baseY, count, tallest, top:s.top }));
  hullFor(s, s.k);
  const keep = new Set(rows.map(row => row.player));
  s.towers.forEach((t, p) => { if (!keep.has(p)) { s.scene.remove(t.mesh); t.mesh.dispose(); t.hull.dispose(); s.towers.delete(p); } });
  rows.forEach((row, slot) => {
    const n = towerChips(row.pts);
    const t = ensureTower(s, row.player, n);
    t.x = towerSlotX(slot, count); t.z = 0; t.lift = 0;
    t.mesh.position.set(t.x, 0, 0);
    setCount(t, n);
    for (let j = 0; j < n; j++) setChip(t, j, { top:j === n - 1 });
  });
  ringsFor(s, towerLeaders(rows));
}

export default function ChipTowers({ rows, leaders = null, width = 1920, height = 882, baseY = 720, top = 40,
  pixelRatio = 1, reducedMotion = false, onFail = () => {}, labelFor = null }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const labels = useRef({});
  const paints = useRef({});
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const loop = useRef({ raf:0, last:0, tweens:[], monitor:frameMonitor() });

  const draw = () => {
    const s = sceneRef.current;
    if (!s) return;
    s.rings.forEach(ring => {
      if (!ring.follow) return;
      const t = s.towers.get(ring.follow);
      if (t) ring.mesh.position.set(t.x, 0.004, t.z);
    });
    s.towers.forEach(t => t.mesh.position.set(t.x, t.lift, t.z));
    /* labels ride under their towers, in canvas pixels */
    s.towers.forEach(t => {
      const el = labels.current[t.player];
      if (!el) return;
      const x = s.width / 2 + t.x * s.k;
      const y = s.baseY + G.radius * Math.sin(EL) * s.k;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + 10)}px) translateX(-50%)`;
      /* a tower hopping back behind the others sets its label down again
         where it lands; the ones stepping aside carry theirs */
      el.style.visibility = t.z < -0.05 ? "hidden" : "";
    });
    s.renderer.render(s.scene, s.camera);
  };
  const fail = reason => {
    const l = loop.current;
    if (l.raf) cancelAnimationFrame(l.raf);
    l.raf = 0; l.tweens = [];
    failRef.current(reason);
  };
  const frame = now => {
    const l = loop.current;
    l.raf = 0;
    if (l.last && l.tweens.length && l.monitor(now - l.last)) { fail("slow"); return; }
    l.last = l.tweens.length ? now : 0;
    for (const tw of [...l.tweens]) {
      const k = (now - tw.t0) / tw.ms;
      if (k < 0) continue;
      if (!tw.started) { tw.started = true; tw.start?.(); }
      tw.fn(Math.min(1, k));
      if (k >= 1) { l.tweens.splice(l.tweens.indexOf(tw), 1); tw.done?.(); }
    }
    draw();
    if (l.tweens.length) l.raf = requestAnimationFrame(frame);
    else l.last = 0;
  };
  const kick = () => { const l = loop.current; if (!l.raf) l.raf = requestAnimationFrame(frame); };
  const tween = (delay, ms, fn, { start, done } = {}) =>
    loop.current.tweens.push({ t0:performance.now() + delay, ms, fn, start, done });
  const finishAll = () => {
    const l = loop.current;
    const pending = l.tweens;
    l.tweens = [];
    pending.forEach(tw => { if (!tw.started) tw.start?.(); tw.fn(1); tw.done?.(); });
  };

  const onPaint = useRef(null);
  onPaint.current = (player, paint) => {
    paints.current[player] = paint;
    const s = sceneRef.current;
    if (s) { applyPaint(s, player, paint); kick(); }
  };

  /* mount: the renderer, the board as it stands, no animation */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    let s;
    try {
      s = createScene(canvas, { width, height, pixelRatio });
    } catch {
      failRef.current("init");
      return undefined;
    }
    s.baseY = baseY; s.top = top;
    hullFor(s, s.k);
    sceneRef.current = s;
    const lost = event => { event.preventDefault(); fail("lost"); };
    canvas.addEventListener("webglcontextlost", lost);
    try {
      snapTo(s, rows);
      s.rows = rows;
      Object.entries(paints.current).forEach(([player, paint]) => applyPaint(s, player, paint));
      draw();
    } catch {
      failRef.current("init");
    }
    return () => {
      const l = loop.current;
      if (l.raf) cancelAnimationFrame(l.raf);
      l.raf = 0; l.tweens = [];
      canvas.removeEventListener("webglcontextlost", lost);
      s.towers.forEach(t => {
        t.mesh.dispose(); t.hull.dispose();
        t.faceMat.map?.dispose(); t.sideMat.map?.dispose();
        t.faceMat.dispose(); t.sideMat.dispose();
      });
      s.chipGeo.dispose(); s.hullGeo?.dispose(); s.ringGeo.dispose();
      s.hullMat.dispose(); s.ringMat.dispose(); s.ramp.dispose();
      s.renderer.dispose();
      s.renderer.forceContextLoss();
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.renderer.setPixelRatio(pixelRatio);
    s.renderer.setSize(width, height, false);
    kick();
  }, [pixelRatio, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  /* a new board: snap, or play the moment */
  const signature = towerSignature(rows);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const prev = s.rows;
    s.rows = rows;
    if (prev === rows) return;
    const tr = towerTransition(prev, rows, { reducedMotion });
    if (tr.mode === "none") { kick(); return; }
    finishAll();
    if (tr.mode !== "animate") { snapTo(s, rows); draw(); return; }
    play(s, prev, rows, tr);
    kick();
  }, [signature, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(s, prev, next, tr) {
    const count = next.length;
    const sched = towerSchedule(tr);
    const beforeTall = Math.max(1, ...prev.map(row => towerChips(row.pts)));
    const afterTall = Math.max(1, ...next.map(row => towerChips(row.pts)));
    /* the camera widens before a tower outgrows it, narrows after */
    const k0 = s.k;
    const k1 = towerFit({ width:s.width, baseY:s.baseY, count, tallest:Math.max(beforeTall, afterTall), top:s.top });
    const kEnd = towerFit({ width:s.width, baseY:s.baseY, count, tallest:afterTall, top:s.top });
    if (Math.abs(k1 - k0) > 0.01)
      tween(0, Math.max(300, T.hold), t => { fitCamera(s, k0 + (k1 - k0) * easeInOutCubic(t)); }, { done:() => hullFor(s, s.k) });
    /* chips fall onto the winners, one after another, towers in parallel */
    Object.entries(tr.adds).forEach(([player, n]) => {
      const t = ensureTower(s, player, (s.towers.get(player)?.count || 0) + n);
      const base = t.count;
      for (let i = 0; i < n; i++) {
        const j = base + i;
        tween(T.hold + i * T.stagger, T.drop, k => setChip(t, j, { lift:T.fall * (1 - dropEase(k)), top:true }), {
          start:() => { setCount(t, Math.max(t.count, j + 1)); setChip(t, j, { lift:T.fall, top:true }); },
          done:() => { if (j > 0) setChip(t, j - 1); setChip(t, j, { top:true }); },
        });
      }
    });
    /* chips lost lift off the top */
    Object.entries(tr.removes).forEach(([player, n]) => {
      const t = s.towers.get(player);
      if (!t) return;
      const base = t.count;
      for (let i = 0; i < n; i++) {
        const j = base - 1 - i;
        if (j < 0) break;
        tween(T.hold + i * T.liftStagger, T.lift, k => setChip(t, j, { lift:3 * easeOutCubic(k), scale:1 - k, top:true }), {
          start:() => { if (j > 0) setChip(t, j - 1, { top:true }); },
          done:() => { setCount(t, Math.min(t.count, j)); },
        });
      }
    });
    /* towers that changed rank hop around each other into their places */
    if (tr.reorder) {
      tr.moves.forEach(({ player, to }) => {
        const t = s.towers.get(player);
        if (!t) return;
        let x0 = 0;
        const x1 = towerSlotX(to, count);
        tween(sched.sortStart, T.sort, k => {
          const e = easeInOutCubic(k), arc = Math.sin(k * Math.PI);
          t.x = x0 + (x1 - x0) * e;
          t.z = x1 < x0 ? -2.4 * arc : 1 * arc;
          t.lift = 0.3 * arc;
        }, { start:() => { x0 = t.x; }, done:() => { t.x = x1; t.z = 0; t.lift = 0; } });
      });
    }
    /* the lead ring rides with the old leader, then slides to the new one */
    const leaders = towerLeaders(next);
    if (tr.leadMoved && s.rings.length === 1 && leaders.length === 1) {
      const ring = s.rings[0];
      let from = null;
      tween(sched.ringStart, T.ring, k => {
        const t = s.towers.get(leaders[0]);
        if (!t || !from) return;
        const e = easeInOutCubic(k);
        ring.mesh.position.set(from.x + (t.x - from.x) * e, 0.004, from.z + (t.z - from.z) * e);
      }, { start:() => { from = { x:ring.mesh.position.x, z:ring.mesh.position.z }; ring.follow = null; },
        done:() => { ring.follow = leaders[0]; } });
    } else if (tr.leadMoved) {
      tween(sched.ringStart, 1, () => {}, { done:() => ringsFor(s, leaders) });
    }
    /* settle the camera to the new tallest, and the final state exactly */
    tween(sched.total + 20, 240, t => {
      if (Math.abs(kEnd - s.k) > 0.01) fitCamera(s, s.k + (kEnd - s.k) * t);
    }, { done:() => { snapTo(s, next); } });
  }

  const leaderSet = new Set(leaders || towerLeaders(rows));
  return (
    <div className="tv-towers" style={{ width, height }}>
      <canvas ref={canvasRef} className="tv-towers-canvas" style={{ width, height }} aria-hidden="true" />
      <div className="tv-towers-labels">
        {rows.map(row => (
          <div key={row.player} ref={el => { labels.current[row.player] = el; }}
            className={`tv-tower-label${leaderSet.has(row.player) ? " is-lead" : ""}`}>
            {labelFor ? labelFor(row) : null}
          </div>
        ))}
      </div>
      <div className="tv-towers-sources" aria-hidden="true">
        {rows.map(row => <FaceSource key={row.player} p={row.player} onPaint={onPaint} />)}
      </div>
    </div>
  );
}
