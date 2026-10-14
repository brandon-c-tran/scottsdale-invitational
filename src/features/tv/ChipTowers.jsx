/* Chip Towers, the TV's standings as the real thing: every player's tower
   of their own chip, one chip per 100, in rank order on a flat table.

   This file imports three.js and is loaded with a dynamic import from
   TowersBoard, so it ships as a TV-only chunk that phones never download
   (the table's chip layer, chips3d/ChipPhysics.jsx, is the only other
   importer, behind its own gate). Everything stays flat: a three-step cel ramp with nearest
   filtering (hard steps, no gradient), an --ink0 inverted-hull outline, no
   shadows, no bloom, no environment. It renders on demand: frames run only
   while a chip falls or a tower moves, then the scene idles at 0 fps. */

import React, { useEffect, useLayoutEffect, useRef } from "react";
import {
  WebGLRenderer, Scene, OrthographicCamera, CylinderGeometry, RingGeometry, CircleGeometry, InstancedMesh, Mesh, Group,
  MeshToonMaterial, MeshBasicMaterial, DataTexture, CanvasTexture, NearestFilter, RGBAFormat, BackSide,
  DirectionalLight, Object3D, SRGBColorSpace, Color, Matrix4,
} from "three";
import { FaceSource, token } from "../chips3d/chipPaint.jsx";
import {
  TOWER_GEOMETRY as G, TOWER_TIMING as T, TOWER_LAYOUT, TOWER_LABEL_GAP, towerTransition, towerSchedule, towerLayout,
  towerChipSpan, towerLeaders, towerSignature, towerChips, towerSounds, dropEase, easeInOutCubic, easeOutCubic, frameMonitor,
  towerSlotPx,
} from "./towersModel.js";
import { cueAt, freshFrameNow, roomChipsLanded } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";

/* 36 sides reads as round at TV size: 288 triangles a chip with its
   outline, so a Saturday-night board of ~450 chips is ~130k */
const SEGMENTS = 36;
const EL = G.elevationDeg * Math.PI / 180;
const TOP_YAW = Math.PI / 2; /* turns the stamp upright toward the room */

/* stable per-chip jitter and yaw, so a re-render never reshuffles a stack */
function seeded(player, j) {
  let h = 2166136261;
  for (const ch of `${player}#${j}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const a = (h & 0xffff) / 0xffff, b = ((h >>> 16) & 0xffff) / 0xffff;
  return { yaw:a * Math.PI * 2, jx:(b - 0.5) * 0.07, jz:(a - 0.5) * 0.05 };
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
  const hullMat = new MeshBasicMaterial({ color:new Color(token("--ink0", "#0a0910")), side:BackSide });
  const ringMat = new MeshBasicMaterial({ color:new Color(token("--sun", "#ffa630")) });
  const ringGeo = new RingGeometry(1.15, 1.35, 64);
  ringGeo.rotateX(-Math.PI / 2);
  /* an empty stack: the chip's shadow pressed into the felt and its rim
     drawn as a keyline, so a player at 0 or below still has a place */
  const ghostDiscGeo = new CircleGeometry(1, SEGMENTS);
  ghostDiscGeo.rotateX(-Math.PI / 2);
  const ghostRimGeo = new RingGeometry(0.9, 1, SEGMENTS);
  ghostRimGeo.rotateX(-Math.PI / 2);
  const ghostDiscMat = new MeshBasicMaterial({ color:new Color(token("--ink0", "#0a0910")), transparent:true, opacity:0.55, depthWrite:false });
  const ghostRimMat = new MeshBasicMaterial({ color:new Color(token("--muted", "#b2abc2")), transparent:true, opacity:0.7, depthWrite:false });
  return { renderer, scene, camera, ramp, chipGeo, hullGeo:null, hullOpenGeo:null, hullW:0, hullMat, ringMat, ringGeo,
    ghostDiscGeo, ghostRimGeo, ghostDiscMat, ghostRimMat, towers:new Map(), rings:[], k:48, layout:null, rows:null, width, height };
}

function hullFor(s, k) {
  /* a 1.5px ink outline at the current scale. The open hull has no caps: a
     chip thinner than DENSE_PX keeps its outline down the stack's sides but
     not the ink ring under it, or a compressed tower would read as ink */
  const w = 1.5 / k;
  if (s.hullGeo && Math.abs(s.hullW - w) / w < 0.12) return;
  const geo = new CylinderGeometry(G.radius + w, G.radius + w, G.chip + 2 * w, SEGMENTS, 1);
  const open = new CylinderGeometry(G.radius + w, G.radius + w, G.chip + 2 * w, SEGMENTS, 1, true);
  s.towers.forEach(t => { t.hull.geometry = geo; t.hullOpen.geometry = open; });
  s.hullGeo?.dispose(); s.hullOpenGeo?.dispose();
  s.hullGeo = geo; s.hullOpenGeo = open; s.hullW = w;
}
const DENSE_PX = 2.5;
const ZERO = new Matrix4().makeScale(0, 0, 0);

const dummy = new Object3D();
/* a chip's place in its stack comes from the board's layout: narrower
   towers of true chips when the tallest would outgrow the sky, thinner
   chips only past the legible floor, never fewer of them */
function setChip(t, j, { lift = 0, scale = 1, top = false } = {}) {
  const r = seeded(t.player, j);
  const span = t.s.layout ? towerChipSpan(t.s.layout, j) : { y:j * G.chip, h:G.chip };
  /* a thin chip sits square on the one under it: the jitter shrinks with
     it, or each one's outline would peek out and darken a tall stack */
  const sit = Math.min(1, span.h / G.chip);
  dummy.position.set(r.jx * sit, span.y + span.h / 2 + lift, r.jz * sit);
  dummy.rotation.set(0, top ? TOP_YAW : r.yaw, 0);
  dummy.scale.set(scale, scale * span.h / G.chip, scale);
  dummy.updateMatrix();
  const dense = span.h * Math.cos(EL) * t.s.k < DENSE_PX;
  t.mesh.setMatrixAt(j, dummy.matrix);
  t.hull.setMatrixAt(j, dense ? ZERO : dummy.matrix);
  t.hullOpen.setMatrixAt(j, dense ? dummy.matrix : ZERO);
  t.mesh.instanceMatrix.needsUpdate = true;
  t.hull.instanceMatrix.needsUpdate = true;
  t.hullOpen.instanceMatrix.needsUpdate = true;
}
function setCount(t, n) {
  t.count = n;
  t.mesh.count = n;
  t.hull.count = n;
  t.hullOpen.count = n;
  if (t.ghost) t.ghost.visible = n === 0;
}
/* every resting chip of every tower, after the layout changes */
function restack(s) {
  s.towers.forEach(t => { for (let j = 0; j < t.count; j++) setChip(t, j, { top:j === t.count - 1 }); });
}

function buildTower(s, player, capacity) {
  const old = s.towers.get(player);
  const sideMat = old?.sideMat || new MeshToonMaterial({ color:0x888888, gradientMap:s.ramp });
  const faceMat = old?.faceMat || new MeshToonMaterial({ color:0x888888, gradientMap:s.ramp });
  const mesh = new InstancedMesh(s.chipGeo, [sideMat, faceMat], capacity);
  const hull = new InstancedMesh(s.hullGeo, s.hullMat, capacity);
  const hullOpen = new InstancedMesh(s.hullOpenGeo, s.hullMat, capacity);
  mesh.frustumCulled = false; hull.frustumCulled = false; hullOpen.frustumCulled = false;
  mesh.add(hull, hullOpen);
  const t = old || { player, x:0, z:0, lift:0, count:0, sideMat, faceMat, s };
  if (!t.ghost) {
    t.ghost = new Group();
    const disc = new Mesh(s.ghostDiscGeo, s.ghostDiscMat), rim = new Mesh(s.ghostRimGeo, s.ghostRimMat);
    disc.position.y = 0.002; rim.position.y = 0.003;
    t.ghost.add(disc, rim);
    t.ghost.visible = false;
    s.scene.add(t.ghost);
  }
  if (old) {
    for (let j = 0; j < old.count; j++) {
      old.mesh.getMatrixAt(j, dummy.matrix); mesh.setMatrixAt(j, dummy.matrix);
      old.hull.getMatrixAt(j, dummy.matrix); hull.setMatrixAt(j, dummy.matrix);
      old.hullOpen.getMatrixAt(j, dummy.matrix); hullOpen.setMatrixAt(j, dummy.matrix);
    }
    s.scene.remove(old.mesh);
    old.mesh.dispose(); old.hull.dispose(); old.hullOpen.dispose();
  }
  t.mesh = mesh; t.hull = hull; t.hullOpen = hullOpen; t.capacity = capacity;
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

/* the board's layout for this many towers and this tall a tallest one */
const tallestOf = rows => Math.max(1, ...rows.map(row => towerChips(row.pts)));
const layoutFor = (s, count, tallest) => towerLayout({ width:s.width, baseY:s.baseY, count, tallest, top:s.top,
  edge:s.edge, fill:s.fill, minChipPx:s.minChipPx });
function setLayout(s, layout) {
  s.layout = layout;
  if (Math.abs(layout.k - s.k) > 0.001) fitCamera(s, layout.k);
  hullFor(s, s.k);
}
/* between two layouts of the same board: the scale and the chips' thickness ease */
const mixLayout = (a, b, e) => ({ ...b, small:a.small + (b.small - a.small) * e, big:a.big + (b.big - a.big) * e,
  k:a.k + (b.k - a.k) * e });
const removeTower = (s, t, p) => {
  s.scene.remove(t.mesh); s.scene.remove(t.ghost);
  t.mesh.dispose(); t.hull.dispose(); t.hullOpen.dispose(); s.towers.delete(p);
};

/* the board as it stands, in one frame */
function snapTo(s, rows) {
  const count = rows.length;
  setLayout(s, layoutFor(s, count, tallestOf(rows)));
  const keep = new Set(rows.map(row => row.player));
  s.towers.forEach((t, p) => { if (!keep.has(p)) removeTower(s, t, p); });
  rows.forEach((row, slot) => {
    const n = towerChips(row.pts);
    const t = ensureTower(s, row.player, n);
    /* every tower in its own slot, in canvas pixels, whatever the scale */
    t.px = towerSlotPx(slot, count, s.layout.slotPx);
    t.x = t.px / s.k; t.z = 0; t.lift = 0;
    t.mesh.position.set(t.x, 0, 0);
    setCount(t, n);
    for (let j = 0; j < n; j++) setChip(t, j, { top:j === n - 1 });
  });
  ringsFor(s, towerLeaders(rows));
}

/* `sound`: "fresh" sounds a change only when it arrived on a fresh frame
   (the ambient board); "scene" sounds the step a directed scene takes on
   its own clock (the result's before/after). */
export default function ChipTowers({ rows, leaders = null, width = 1920, height = 882, baseY = 720, top = 40,
  edge = TOWER_LAYOUT.edge, fill = TOWER_LAYOUT.fill, minChipPx = TOWER_LAYOUT.minChipPx,
  pixelRatio = 1, reducedMotion = false, onFail = () => {}, labelFor = null, labelClass = null, sound = "fresh" }) {
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
    /* fixed slots: a tower's place is canvas pixels, whatever the scale */
    s.towers.forEach(t => { if (t.px !== null && t.px !== undefined) t.x = t.px / s.k; });
    s.rings.forEach(ring => {
      if (!ring.follow) return;
      const t = s.towers.get(ring.follow);
      if (t) ring.mesh.position.set(t.x, 0.004, t.z);
    });
    s.towers.forEach(t => { t.mesh.position.set(t.x, t.lift, t.z); t.ghost.position.set(t.x, 0, t.z); });
    /* labels ride under their towers, in canvas pixels: each one its slot's
       width, so neighbours never touch */
    s.towers.forEach(t => {
      const el = labels.current[t.player];
      if (!el) return;
      const x = s.width / 2 + t.x * s.k;
      const y = s.baseY + G.radius * Math.sin(EL) * s.k + TOWER_LABEL_GAP;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateX(-50%)`;
      /* every name rides its tower through a re-sort: one hopping back
         passes under the ones stepping aside, a winner's over them all */
      el.style.zIndex = el.classList.contains("is-win") ? "3" : t.z < -0.05 ? "1" : "2";
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
    s.baseY = baseY; s.top = top; s.edge = edge; s.fill = fill; s.minChipPx = minChipPx;
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
        t.mesh.dispose(); t.hull.dispose(); t.hullOpen.dispose();
        s.scene.remove(t.ghost);
        t.faceMat.map?.dispose(); t.sideMat.map?.dispose();
        t.faceMat.dispose(); t.sideMat.dispose();
      });
      s.chipGeo.dispose(); s.hullGeo?.dispose(); s.hullOpenGeo?.dispose(); s.ringGeo.dispose();
      s.ghostDiscGeo.dispose(); s.ghostRimGeo.dispose(); s.ghostDiscMat.dispose(); s.ghostRimMat.dispose();
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
    if (sound === "scene" || freshFrameNow()) {
      const start = serverNow(), heard = towerSounds(tr, rows.length);
      roomChipsLanded(heard.chips.map(chip => ({ at:start + chip.offset, pan:chip.pan })));
      heard.cues.forEach(cue => cueAt(cue.id, start + cue.offset, { key:`towers:${cue.id}:${start}` }));
    }
    kick();
  }, [signature, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(s, prev, next, tr) {
    const count = next.length;
    const sched = towerSchedule(tr);
    const afterTall = tallestOf(next);
    /* the towers narrow before one outgrows the sky (past the floor the
       chips thin; every resting chip, in the hold, before any falls), and
       settle after */
    const l0 = s.layout || layoutFor(s, count, tallestOf(prev));
    const l1 = layoutFor(s, count, Math.max(tallestOf(prev), afterTall));
    const lEnd = layoutFor(s, count, afterTall);
    const differs = (a, b) => Math.abs(a.small - b.small) > 1e-4 || Math.abs(a.big - b.big) > 1e-4 || Math.abs(a.k - b.k) > 0.01;
    if (differs(l0, l1))
      tween(0, Math.max(300, T.hold), e => { setLayout(s, mixLayout(l0, l1, easeInOutCubic(e))); restack(s); },
        { done:() => { setLayout(s, l1); restack(s); } });
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
        /* the hop runs in canvas pixels from slot to slot, the draw converts */
        const x1 = towerSlotPx(to, count, (s.layout || l0).slotPx);
        tween(sched.sortStart, T.sort, k => {
          const e = easeInOutCubic(k), arc = Math.sin(k * Math.PI);
          t.px = x0 + (x1 - x0) * e;
          t.z = x1 < x0 ? -2.4 * arc : 1 * arc;
          t.lift = 0.3 * arc;
        }, { start:() => { x0 = t.px; },
          done:() => { t.px = x1; t.z = 0; t.lift = 0; } });
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
    /* settle the chips to the new tallest, and the final state exactly */
    let from = null;
    tween(sched.total + 20, 240, e => {
      if (!from) from = s.layout || l1;
      if (differs(from, lEnd)) { setLayout(s, mixLayout(from, lEnd, e)); restack(s); }
    }, { done:() => { snapTo(s, next); } });
  }

  const leaderSet = new Set(leaders || towerLeaders(rows));
  /* the label's width is its slot's, less a gutter: it never depends on the board */
  const slot = towerLayout({ width, baseY, count:rows.length, top, edge, fill, minChipPx });
  const fit = { labelW:slot.labelW, count:rows.length };
  return (
    <div className="tv-towers" style={{ width, height, "--tower-label-w":`${Math.floor(slot.labelW)}px` }}>
      <canvas ref={canvasRef} className="tv-towers-canvas" style={{ width, height }} aria-hidden="true" />
      <div className="tv-towers-labels">
        {rows.map(row => (
          <div key={row.player} ref={el => { labels.current[row.player] = el; }}
            className={`tv-tower-label${leaderSet.has(row.player) ? " is-lead" : ""}${labelClass ? ` ${labelClass(row)}` : ""}`}>
            {labelFor ? labelFor(row, fit) : null}
          </div>
        ))}
      </div>
      <div className="tv-towers-sources" aria-hidden="true">
        {rows.map(row => <FaceSource key={row.player} p={row.player} onPaint={onPaint} />)}
      </div>
    </div>
  );
}
