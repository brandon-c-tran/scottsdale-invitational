/* The chip layer (Oct 13, "chips you can feel"): the bettors' chips as
   real bodies on the table, on the TV and (with its switch on) the phone.
   three draws them, cannon-es moves them; both live in this chunk only,
   loaded through ChipPhysicsLayer.jsx, so a screen without WebGL, or a
   phone with the switch off, never downloads either.

   The HTML stays the readable layer (spots, faces, the %, fills, labels,
   the dealer's glove); this canvas covers the host element and stands each
   bettor's stack inside its side's chip area, scattered on a seed (contest
   + spot + player) so every screen agrees. Each chip is a thin cylinder in
   its owner's identity (their ChipFace as the face, the edge skin on the
   rim), cel-shaded like ChipTowers, casting a soft shadow on the felt.

   Moments (fresh frames only; a load, a reconnect, a correction or reduced
   motion places everything at rest):
     a bet      its chips leave the room's edge one after another, arc in,
                land on the bettor's stack, bounce, slide a little, clack
                (onLand: the TV's room bus, its density rule) and settle
     a retract  the top chips lift off
     the lock   as the dealer's glove passes each stack it is squared up,
                and everything freezes at rest
     a result   the glove's rake knocks the losing chips toward the bank,
                and the winners' payout rains onto a stack beside theirs
   Bodies at rest are static (they cost nothing until something lands on
   them), the scene renders only while something moves, and the whole
   table holds at most CHIP3D.budget bodies (tv 300, phone 120).

   Props (render it as a child of the host element, position:relative):
     host          ref to the element holding the [data-spot] spots (default:
                   the layer's parent); render the layer as a direct child of
                   a position:relative element: the canvas covers its padding box
     spots         [{ key, stacks:[{ player, stake, status?, paid? }] }]:
                   status "won" | "lost" and paid on a settled table
     contestId     a new id clears the table
     phase         "open" | "locked" | "settled"
     fresh         true / false, or undefined to read the frame gate
     reducedMotion everything at rest, no tossing
     quality       "tv" | "phone" (the budget, the slow-frame rule, the DPR)
     chip          the chip diameter wanted, px (it shrinks to fit, then folds)
     chipMin       the smallest diameter before the smallest stacks fold
     areaSelector  each spot's chip area inside [data-spot="<key>"]
                   (default "[data-chips3d-area]"; else the spot's lower 45%)
     keepoutSelector what the stacks stay clear of inside a spot
                   (default "[data-chips3d-keepout]": its faces, name, %)
     pairs         keep room beside each stack for its payout (default true)
     label         { render(item), w(item), h } a plate under each stack, or
                   null; item is { player, stake, group, players, count,
                   status, paid }
     clock         () => ms, the clock lockSweep and settle are on
     lockSweep     { at, ms, x0, x1 } the glove crossing the host, host px
     settle        { rake:{ at, ms, x0, x1, to:{ x, y } }, payAt }
     pixelRatio    default: tv 1, phone devicePixelRatio capped at 2
     onLand        (landings) a tossed chip's first touch, [{ at, pan }] with
                   at on the server clock and pan -1..1 across the host: the
                   TV hands them to roomChipsLanded (the density rule); a
                   fresh toss only, never a placed or raked chip
     onFallback    (reason) the layer cannot run here; the host goes flat */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  WebGLRenderer, Scene, PerspectiveCamera, CylinderGeometry, InstancedMesh, MeshToonMaterial, MeshBasicMaterial,
  DataTexture, CanvasTexture, NearestFilter, RGBAFormat, BackSide, DirectionalLight, SRGBColorSpace, Color,
  PlaneGeometry, ShadowMaterial, Mesh, Raycaster, Vector2, Vector3, Plane, PCFShadowMap, Quaternion, Euler, Matrix4,
} from "three";
import { World, Body, Cylinder, Plane as FloorShape, Vec3, Material, ContactMaterial, SAPBroadphase } from "cannon-es";
import { FaceSource, token } from "./chipPaint.jsx";
import { CHIP3D, bodyCap, chipJitter, elevationAt, hash32, payBodies, rng, scatterStacks, stackExtent, sweepHit, tossSchedule } from "./chipScatter.js";
import { freshFrameNow } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import "./chips3d.css";

const FLOOR = 1, CHIP = 2, RAKED = 4;
const SEGMENTS = { tv:32, phone:24 };
const COLLIDE_SEGMENTS = 12;
const STEP = 1 / 120;
const PER_OWNER = 96;
/* a sustained run of slow frames while chips move: tv like ChipTowers,
   a phone stricter (it has a battery and a hand on it) */
const SLOW = { tv:{ limit:45, frames:20, runMs:1200 }, phone:{ limit:22, frames:30, runMs:900 } };
/* ms: a moment this far past when the layer sees it is placed, not played */
const LATE = 900;
/* px kept clear inside a chip area's edge; a plate gone this long is not drawn */
const AREA_INSET = 6, PLATE_GONE = 450;
/* a chip that has barely moved for STILL_MS is at rest (sooner than the
   engine's own sleep), and none stays loose past SETTLE_MAX */
const STILL_MS = 180, SETTLE_MAX = 2200, ASSIST_MS = 900, RAKE_TTL = 720, FADE_MS = 260, SQUARE_MS = 240;
const EL = CHIP3D.elevationDeg * Math.PI / 180;
const HALF_FOV = CHIP3D.fovDeg * Math.PI / 360;
const UP = new Vector3(0, 1, 0);
const FLOOR_PLANE = new Plane(UP, 0);

const monitorFor = quality => {
  const { limit, frames, runMs } = SLOW[quality] || SLOW.tv;
  let run = 0, spent = 0;
  return dt => {
    if (dt > limit) { run += 1; spent += dt; } else { run = 0; spent = 0; }
    return run >= frames || spent >= runMs;
  };
};
const texture = canvas => {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const yawQuat = (yaw, tilt = 0, roll = 0) => new Quaternion().setFromEuler(new Euler(tilt, yaw, roll, "YXZ"));

/* ═══ the engine: one renderer, one world, every chip on the table ═══ */
class ChipEngine {
  constructor(canvas, { quality, pixelRatio }) {
    this.quality = quality;
    const renderer = new WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:quality === "tv" ? "high-performance" : "default" });
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(CHIP3D.fovDeg, 1, 1, 1000);
    /* ChipTowers' three hard bands, the same light */
    this.ramp = new DataTexture(new Uint8Array([48, 48, 48, 255, 148, 148, 148, 255, 255, 255, 255, 255]), 3, 1, RGBAFormat);
    this.ramp.minFilter = this.ramp.magFilter = NearestFilter;
    this.ramp.generateMipmaps = false;
    this.ramp.needsUpdate = true;
    /* the key light shades the chips as ChipTowers does (front left); a
       second, dark one is the room's overhead lamp: it lights nothing and
       only lays each stack's shadow forward and right across the felt */
    const key = new DirectionalLight(0xffffff, Math.PI);
    key.position.set(-10, 12, 6);
    this.scene.add(key);
    const light = new DirectionalLight(0xffffff, 0);
    light.castShadow = true;
    const map = quality === "tv" ? 2048 : 1024;
    light.shadow.mapSize.set(map, map);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 5;
    this.light = light;
    this.scene.add(light, light.target);
    /* the felt only catches the chips' shadows; the HTML is the felt */
    this.shadowPlane = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new ShadowMaterial({ color:new Color(token("--ink0", "#0a0910")), opacity:0.62 }));
    this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);
    const seg = SEGMENTS[quality] || SEGMENTS.tv;
    this.segments = seg;
    const chipGeo = new CylinderGeometry(1, 1, CHIP3D.thick, seg, 1);
    const [side, top, bottom] = chipGeo.groups;
    chipGeo.clearGroups();
    chipGeo.addGroup(side.start, side.count, 0);
    chipGeo.addGroup(top.start, top.count + bottom.count, 1);
    this.chipGeo = chipGeo;
    this.hullGeo = null;
    this.hullMat = new MeshBasicMaterial({ color:new Color(token("--ink0", "#0a0910")), side:BackSide });
    this.silver = new Color(token("--silver", "#b9b4c6"));

    const world = new World({ gravity:new Vec3(0, -CHIP3D.gravity, 0), allowSleep:true });
    world.broadphase = new SAPBroadphase(world);
    world.solver.iterations = 12;
    this.chipMat = new Material("chip");
    this.feltMat = new Material("felt");
    this.rakedMat = new Material("raked");
    world.addContactMaterial(new ContactMaterial(this.chipMat, this.chipMat, { friction:0.45, restitution:0.16 }));
    world.addContactMaterial(new ContactMaterial(this.chipMat, this.feltMat, { friction:0.55, restitution:0.22 }));
    world.addContactMaterial(new ContactMaterial(this.rakedMat, this.feltMat, { friction:0.1, restitution:0.1 }));
    world.addContactMaterial(new ContactMaterial(this.rakedMat, this.rakedMat, { friction:0.2, restitution:0.2 }));
    const floor = new Body({ mass:0, type:Body.STATIC, shape:new FloorShape(), material:this.feltMat,
      collisionFilterGroup:FLOOR, collisionFilterMask:CHIP | RAKED });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);
    /* tossed and paid chips are guided onto their stack once they touch */
    world.addEventListener("preStep", () => this.assist());
    this.world = world;
    this.shapes = new Map();
    this.owners = new Map();
    this.chips = [];
    this.stacks = new Map();
    this.events = [];
    this.tweens = [];
    this.landings = [];
    this.monitor = monitorFor(quality);
    this.raf = 0; this.last = 0; this.wake = 0;
    this.paused = false; this.dead = false;
    this.W = 0; this.H = 0; this.U = 0;
    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.matrix = new Matrix4();
    this.scale = new Vector3();
    this.tick = this.tick.bind(this);
    this.onFail = () => {};
    /* what the frames cost, read by the dev rehearsals (layer.chipStats) */
    this.stats = { frames:0, stepMs:0, drawMs:0, bodies:0 };
  }

  /* ── the camera on the host's box: U px per world unit at its centre ── */
  frame(W, H, U) {
    if (W === this.W && H === this.H && Math.abs(U - this.U) < 1e-6) return false;
    this.W = W; this.H = H; this.U = U;
    this.renderer.setSize(W, H, false);
    const cam = this.camera;
    cam.aspect = W / H;
    const D = H / (2 * U * Math.tan(HALF_FOV));
    cam.position.set(0, D * Math.sin(EL), D * Math.cos(EL));
    cam.near = D * 0.2; cam.far = D * 4;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.camDir = new Vector3(); cam.getWorldDirection(this.camDir);
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => this.toFloor(x, y));
    const R = Math.max(...corners.map(p => Math.hypot(p.x, p.z))) + 6;
    this.light.position.set(-0.42, 1, -0.5).normalize().multiplyScalar(R * 2);
    this.light.target.position.set(0, 0, 0);
    const sc = this.light.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = R * 4;
    sc.updateProjectionMatrix();
    this.shadowPlane.scale.set(R * 3, 1, R * 3);
    /* the ink outline, ~1.25px at the table's scale; a chip thinner than
       3px on screen keeps its outline down the stack's sides only, or a
       small stack would read as ink */
    const w = 1.25 / U;
    const capped = CHIP3D.thick * U * Math.cos(EL) >= 3;
    const hull = new CylinderGeometry(1 + w, 1 + w, CHIP3D.thick + 2 * w, this.segments, 1, !capped);
    this.owners.forEach(o => { o.hull.geometry = hull; });
    this.hullGeo?.dispose();
    this.hullGeo = hull;
    return true;
  }
  toFloor(px, py, out = new Vector3()) {
    this.ndc.set(px / this.W * 2 - 1, 1 - py / this.H * 2);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(FLOOR_PLANE, out) || out.set(0, 0, 0);
  }
  /* px per world unit at a point on the felt */
  unitPx(p) {
    const depth = new Vector3().subVectors(p, this.camera.position).dot(this.camDir);
    return (this.H / 2) / (Math.max(0.001, depth) * Math.tan(HALF_FOV));
  }

  /* ── owners: one instanced mesh (and its outline) per player's chip ── */
  owner(id) {
    let o = this.owners.get(id);
    if (o) return o;
    const group = String(id).startsWith("+");
    const make = () => new MeshToonMaterial({ color:group ? this.silver : 0x888888, gradientMap:this.ramp });
    const sideMat = make(), faceMat = make();
    const mesh = new InstancedMesh(this.chipGeo, [sideMat, faceMat], PER_OWNER);
    const hull = new InstancedMesh(this.hullGeo || this.chipGeo, this.hullMat, PER_OWNER);
    mesh.castShadow = true;
    mesh.frustumCulled = false; hull.frustumCulled = false;
    mesh.count = 0; hull.count = 0;
    this.scene.add(mesh, hull);
    o = { id, mesh, hull, sideMat, faceMat, n:0 };
    this.owners.set(id, o);
    if (this.paints?.has(id)) this.paint(id, this.paints.get(id));
    return o;
  }
  paint(id, paint) {
    (this.paints ||= new Map()).set(id, paint);
    const o = this.owners.get(id);
    if (!o) return;
    const swap = (mat, canvas) => {
      if (!canvas) { mat.color.set(paint.identity.color); return; }
      mat.map?.dispose();
      mat.map = texture(canvas);
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    };
    swap(o.faceMat, paint.face);
    swap(o.sideMat, paint.side);
    this.kick();
  }

  shape(s) {
    const key = Math.round(s * 100) / 100;
    if (!this.shapes.has(key)) this.shapes.set(key, new Cylinder(key, key, CHIP3D.thick * key, COLLIDE_SEGMENTS));
    return this.shapes.get(key);
  }
  body(chip, { dynamic = false, raked = false } = {}) {
    const b = new Body({ mass:dynamic ? 1 : 0, type:dynamic ? Body.DYNAMIC : Body.STATIC, shape:this.shape(chip.s),
      material:raked ? this.rakedMat : this.chipMat, collisionFilterGroup:raked ? RAKED : CHIP,
      collisionFilterMask:raked ? FLOOR | RAKED : FLOOR | CHIP, allowSleep:true, sleepSpeedLimit:0.35, sleepTimeLimit:0.3,
      linearDamping:0.05, angularDamping:0.1 });
    b.position.set(chip.pos.x, chip.pos.y, chip.pos.z);
    b.quaternion.set(chip.quat.x, chip.quat.y, chip.quat.z, chip.quat.w);
    b.chip = chip;
    return b;
  }
  attach(chip, opts) {
    this.detach(chip);
    chip.body = this.body(chip, opts);
    this.world.addBody(chip.body);
    return chip.body;
  }
  detach(chip) {
    if (!chip.body) return;
    chip.pos.set(chip.body.position.x, chip.body.position.y, chip.body.position.z);
    chip.quat.set(chip.body.quaternion.x, chip.body.quaternion.y, chip.body.quaternion.z, chip.body.quaternion.w);
    this.world.removeBody(chip.body);
    chip.body = null;
  }
  /* a dynamic chip at rest becomes part of the furniture */
  toStatic(chip) {
    const b = chip.body;
    if (!b) return;
    b.type = Body.STATIC; b.mass = 0; b.updateMassProperties();
    b.velocity.setZero(); b.angularVelocity.setZero(); b.force.setZero(); b.torque.setZero();
    b.linearDamping = 0.05; b.angularDamping = 0.1;
    b.aabbNeedsUpdate = true;
    chip.state = "rest";
  }

  /* ── stacks ── */
  makeStack(id, spot, item, r, seed) {
    const base = this.toFloor(item.x, item.y);
    const s = r / this.unitPx(base);
    /* the payout's pile stands beside the stake, or (no room kept) on top of it */
    const paired = this.pairs !== false;
    const payBase = paired ? this.toFloor(item.x + item.pairDir * r * (2 + CHIP3D.pairGap), item.y) : base;
    const st = { paired, id, spot, player:item.player, owner:item.group ? "+group" : item.player, item, r, s, seed, base, payBase,
      px:{ x:item.x, y:item.y }, pairDir:item.pairDir, yaw:item.yaw, chips:[], pay:[], gone:false };
    this.stacks.set(id, st);
    return st;
  }
  newChip(st, pay) {
    const chip = { stack:st, pay, owner:st.owner, s:st.s, state:"rest", body:null, pos:new Vector3(), quat:new Quaternion(),
      scale:1, born:performance.now(), contacted:false };
    (pay ? st.pay : st.chips).push(chip);
    this.chips.push(chip);
    return chip;
  }
  restPose(st, j, pay, chip) {
    const base = pay ? st.payBase : st.base;
    const jit = chipJitter(st.seed, `${st.player}${pay ? "$" : ""}`, j);
    const under = pay && !st.paired ? st.chips.length : 0;
    chip.pos.set(base.x + jit.dx * st.s, st.s * CHIP3D.thick * (j + under + 0.5), base.z + jit.dz * st.s);
    chip.quat.copy(yawQuat(jit.yaw));
    return jit;
  }
  /* a chip standing in its stack, at rest */
  place(st, pay = false) {
    const list = pay ? st.pay : st.chips;
    const chip = this.newChip(st, pay);
    this.restPose(st, list.length - 1, pay, chip);
    this.attach(chip);
    return chip;
  }
  /* a chip from the room's edge onto the stack's top, `delay` ms from now */
  toss(st, delay, flight, sounded) {
    const j = st.chips.length;
    const chip = this.newChip(st, false);
    const jit = this.restPose(st, j, false, chip);
    const to = chip.pos.clone();
    to.y += st.s * 0.7;
    const next = rng(hash32(`${st.seed}|${st.player}|toss|${j}`));
    const edge = this.toFloor(st.px.x + (next() - 0.5) * 160, this.H + 40);
    const from = new Vector3(edge.x, 0, edge.z);
    const reach = from.clone().sub(st.base);
    if (reach.length() > 12) from.copy(st.base).add(reach.setLength(12));
    from.y = 2.4;
    chip.state = "wait";
    chip.sounded = sounded;
    chip.arc = { t0:performance.now() + delay, ms:flight, from, to, h:1.6 + from.distanceTo(to) * 0.08,
      spin:(next() < 0.5 ? -1 : 1) * (7 + next() * 5), yaw:jit.yaw, tilt0:0.9 + next() * 0.4, tilt1:(next() - 0.5) * 0.22,
      roll1:(next() - 0.5) * 0.22, drift:new Vector3(to.x - from.x, 0, to.z - from.z).normalize() };
    return chip;
  }
  /* a payout chip falling onto the pile beside the stake */
  rain(st, k, delay) {
    const chip = this.newChip(st, true);
    const next = rng(hash32(`${st.seed}|${st.player}|pay|${k}`));
    const base = st.payBase;
    chip.pos.set(base.x + (next() - 0.5) * 0.35 * st.s, st.s * (CHIP3D.thick * (k + (st.paired ? 0 : st.chips.length) + 0.5) + 2.2 + next() * 0.9), base.z + (next() - 0.5) * 0.35 * st.s);
    chip.quat.copy(yawQuat(next() * Math.PI * 2, (next() - 0.5) * 0.5, (next() - 0.5) * 0.5));
    chip.state = "wait";
    chip.drop = { t0:performance.now() + delay, spin:(next() - 0.5) * 6 };
    return chip;
  }
  /* the top chip of a stack lifts off; a change that is not a moment (a
     load, a catch-up, a correction, reduced motion) just takes it, as drop does */
  lift(st, pay = false, animate = true) {
    const list = pay ? st.pay : st.chips;
    if (!list.length) return;
    let top = 0;
    list.forEach((chip, i) => { if (this.yOf(chip) > this.yOf(list[top])) top = i; });
    const [chip] = list.splice(top, 1);
    if (animate) this.fade(chip); else this.remove(chip);
  }
  yOf(chip) { return chip.body ? chip.body.position.y : chip.pos.y; }
  fade(chip, ms = FADE_MS) {
    this.detach(chip);
    if (chip.state === "wait") { this.remove(chip); return; }
    chip.state = "fade";
    chip.fade = { t0:performance.now(), ms, y0:chip.pos.y, from:chip.scale };
  }
  remove(chip) {
    this.detach(chip);
    const i = this.chips.indexOf(chip);
    if (i >= 0) this.chips.splice(i, 1);
    const st = chip.stack;
    for (const list of [st.chips, st.pay]) { const k = list.indexOf(chip); if (k >= 0) list.splice(k, 1); }
  }
  drop(st, animate) {
    [...st.chips, ...st.pay].forEach(chip => { animate ? this.fade(chip) : this.remove(chip); });
    st.chips = []; st.pay = [];
    this.stacks.delete(st.id);
  }
  clear() {
    [...this.chips].forEach(chip => this.remove(chip));
    this.stacks.clear();
    this.events = []; this.tweens = [];
  }

  /* the glove's rake: the losing stack's chips, top first, knocked toward the bank */
  rake(st, toward) {
    const list = [...st.chips, ...st.pay].sort((a, b) => this.yOf(b) - this.yOf(a));
    st.chips = []; st.pay = [];
    list.forEach((chip, i) => this.at(performance.now() + i * 14, () => {
      if (!this.chips.includes(chip)) return;
      const b = this.attach(chip, { dynamic:true, raked:true });
      const next = rng(hash32(`${st.seed}|${st.player}|rake|${i}`));
      const dir = new Vector3(toward.x - b.position.x, 0, toward.z - b.position.z).normalize();
      const spread = (next() - 0.5) * 0.7;
      const c = Math.cos(spread), s = Math.sin(spread);
      const speed = 9 + next() * 5;
      b.velocity.set((dir.x * c - dir.z * s) * speed, 2.5 + next() * 2.5, (dir.x * s + dir.z * c) * speed);
      b.angularVelocity.set((next() - 0.5) * 10, (next() - 0.5) * 8, (next() - 0.5) * 10);
      chip.state = "raked";
      chip.born = performance.now();
    }));
  }
  /* the dealer squares a stack as the glove passes: every chip on its axis, flat */
  square(st) {
    const list = st.chips.filter(chip => chip.state === "rest" && chip.body
      && Math.hypot(chip.body.position.x - st.base.x, chip.body.position.z - st.base.z) < st.s * 0.8)
      .sort((a, b) => a.body.position.y - b.body.position.y);
    list.forEach((chip, j) => {
      const from = { pos:new Vector3().copy(chip.body.position), quat:new Quaternion().copy(chip.body.quaternion) };
      const jit = chipJitter(st.seed, st.player, j);
      const to = { pos:new Vector3(st.base.x + jit.dx * st.s * 0.4, st.s * CHIP3D.thick * (j + 0.5), st.base.z + jit.dz * st.s * 0.4),
        quat:yawQuat(new Euler().setFromQuaternion(from.quat, "YXZ").y) };
      this.tween(j * 12, SQUARE_MS, k => {
        const b = chip.body;
        if (!b) return;
        const e = 1 - (1 - k) ** 3;
        const p = from.pos.clone().lerp(to.pos, e), q = from.quat.clone().slerp(to.quat, e);
        b.position.set(p.x, p.y, p.z); b.quaternion.set(q.x, q.y, q.z, q.w); b.aabbNeedsUpdate = true;
      });
    });
  }

  /* ── time ── */
  at(t, fn) { this.events.push({ t, fn }); this.kick(); }
  tween(delay, ms, fn) { this.tweens.push({ t0:performance.now() + delay, ms, fn }); this.kick(); }
  active() {
    return this.tweens.length > 0 || this.chips.some(chip => chip.state !== "rest");
  }
  kick() {
    if (this.raf || this.paused || this.dead || !this.W) return;
    clearTimeout(this.wake); this.wake = 0;
    this.raf = requestAnimationFrame(this.tick);
  }
  pause(on) {
    this.paused = on;
    if (on) { cancelAnimationFrame(this.raf); this.raf = 0; clearTimeout(this.wake); this.wake = 0; this.last = 0; }
    else this.kick();
  }
  tick(now) {
    this.raf = 0;
    if (this.dead || this.paused) return;
    const moving = this.active();
    if (this.last && moving && this.monitor(now - this.last)) { this.onFail("slow"); return; }
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = moving ? now : 0;
    const t = performance.now();
    if (this.events.length) {
      const due = this.events.filter(e => e.t <= t).sort((a, b) => a.t - b.t);
      this.events = this.events.filter(e => e.t > t);
      due.forEach(e => e.fn());
    }
    for (const tw of [...this.tweens]) {
      const k = (t - tw.t0) / tw.ms;
      if (k < 0) continue;
      tw.fn(Math.min(1, k));
      if (k >= 1) this.tweens.splice(this.tweens.indexOf(tw), 1);
    }
    this.advance(t);
    const t0 = performance.now();
    const dynamic = this.chips.filter(chip => chip.body && chip.body.type === Body.DYNAMIC).length;
    if (dynamic) this.world.step(STEP, dt, 4);
    const t1 = performance.now();
    this.settle(t, dt);
    if (this.landings.length) { const heard = this.landings; this.landings = []; this.onLand?.(heard); }
    this.draw();
    const st = this.stats;
    st.frames += 1; st.stepMs += t1 - t0; st.drawMs += performance.now() - t1; st.bodies = Math.max(st.bodies, dynamic);
    if (this.active() || this.events.some(e => e.t <= t + 40)) this.raf = requestAnimationFrame(this.tick);
    else if (this.events.length) {
      this.last = 0;
      const next = Math.min(...this.events.map(e => e.t));
      this.wake = setTimeout(() => { this.wake = 0; this.kick(); }, Math.max(0, next - performance.now() - 20));
    }
  }
  /* chips on their scripted part: waiting, arcing in, fading out */
  advance(t) {
    for (const chip of [...this.chips]) {
      if (chip.state === "wait" && chip.arc && t >= chip.arc.t0) chip.state = "arc";
      if (chip.state === "wait" && chip.drop && t >= chip.drop.t0) {
        const b = this.attach(chip, { dynamic:true });
        b.velocity.set(0, -2.5, 0);
        b.angularVelocity.set(chip.drop.spin, 0, -chip.drop.spin);
        this.watch(chip, false);
        chip.state = "air"; chip.born = t;
      }
      if (chip.state === "arc") {
        const a = chip.arc;
        const k = Math.min(1, (t - a.t0) / a.ms);
        const e = 1 - (1 - k) ** 2;
        chip.pos.lerpVectors(a.from, a.to, e);
        chip.pos.y = a.from.y + (a.to.y - a.from.y) * k + a.h * 4 * k * (1 - k);
        chip.quat.copy(yawQuat(a.yaw + a.spin * (k - 1) * a.ms / 1000, a.tilt0 + (a.tilt1 - a.tilt0) * k, a.roll1 * k));
        chip.scale = Math.min(1, 0.4 + k * 4);
        if (k >= 1) {
          chip.scale = 1;
          const b = this.attach(chip, { dynamic:true });
          /* the hand lets go just above the stack: down, a little forward, still turning */
          b.velocity.set(a.drift.x * 1.6, -6.5, a.drift.z * 1.6);
          b.angularVelocity.set((Math.random() - 0.5) * 1.5, a.spin * 0.25, (Math.random() - 0.5) * 1.5);
          this.watch(chip, chip.sounded);
          chip.state = "air"; chip.born = t;
        }
      }
      if (chip.state === "fade") {
        const f = chip.fade;
        const k = Math.min(1, (t - f.t0) / f.ms);
        chip.scale = f.from * (1 - k);
        chip.pos.y = f.y0 + chip.s * 0.8 * k;
        if (k >= 1) this.remove(chip);
      }
    }
  }
  watch(chip, sounded) {
    chip.body.addEventListener("collide", event => {
      if (chip.contacted) return;
      chip.contacted = performance.now();
      const b = chip.body;
      if (b) { b.linearDamping = 0.6; b.angularDamping = 0.6; }
      if (sounded && Math.abs(event.contact?.getImpactVelocityAlongNormal?.() || 0) > 1.5)
        this.landings.push({ at:serverNow(), pan:Math.max(-1, Math.min(1, chip.stack.px.x / (this.W || 1) * 2 - 1)) });
    });
  }
  /* a chip that touched down drifts back toward its stack's axis: the
     slide stays a slide, never a chip lost off the felt */
  assist() {
    for (const chip of this.chips) {
      const b = chip.body;
      if (chip.state !== "air" || !b || !chip.contacted || performance.now() - chip.contacted > ASSIST_MS) continue;
      const base = chip.pay ? chip.stack.payBase : chip.stack.base;
      const dx = b.position.x - base.x, dz = b.position.z - base.z;
      const d = Math.hypot(dx, dz);
      if (d < chip.s * 0.12 || d > chip.s * 3) continue;
      const f = Math.min(30, 38 * d);
      b.applyForce(new Vec3(-dx / d * f, 0, -dz / d * f));
    }
  }
  /* what came to rest freezes; what the rake took leaves */
  settle(t, dt) {
    for (const chip of [...this.chips]) {
      const b = chip.body;
      if (chip.state === "air" && b) {
        const still = chip.contacted && b.velocity.lengthSquared() < 0.09 && b.angularVelocity.lengthSquared() < 0.36;
        chip.still = still ? (chip.still || 0) + dt * 1000 : 0;
        if (chip.still > STILL_MS || b.sleepState === Body.SLEEPING || t - chip.born > SETTLE_MAX) this.toStatic(chip);
      }
      if (chip.state === "raked" && t - chip.born > RAKE_TTL) this.fade(chip, FADE_MS);
    }
  }
  draw() {
    this.owners.forEach(o => { o.n = 0; });
    const m = this.matrix, p = new Vector3(), q = new Quaternion();
    for (const chip of this.chips) {
      if (chip.state === "wait") continue;
      const o = this.owner(chip.owner);
      if (o.n >= PER_OWNER) continue;
      if (chip.body) { p.set(chip.body.position.x, chip.body.position.y, chip.body.position.z); q.set(chip.body.quaternion.x, chip.body.quaternion.y, chip.body.quaternion.z, chip.body.quaternion.w); }
      else { p.copy(chip.pos); q.copy(chip.quat); }
      const k = chip.s * chip.scale;
      m.compose(p, q, this.scale.set(k, k, k));
      o.mesh.setMatrixAt(o.n, m);
      o.hull.setMatrixAt(o.n, m);
      o.n += 1;
    }
    this.owners.forEach(o => {
      o.mesh.count = o.n; o.hull.count = o.n;
      o.mesh.instanceMatrix.needsUpdate = true; o.hull.instanceMatrix.needsUpdate = true;
    });
    this.renderer.render(this.scene, this.camera);
  }

  /* ── the table as it now stands ── */
  sync({ spots, contestId, phase, chip, chipMin, pairs, label, areas, animate, settle, lockSweep, clock, reduced, budget, onLand }) {
    this.onLand = onLand;
    this.pairs = pairs;
    const nowClock = clock(), nowPerf = performance.now();
    const toPerf = at => nowPerf + (at - nowClock);
    if (contestId !== this.contestId) {
      this.clear(); this.contestId = contestId; this.settled = new Set(); this.lockKey = null;
      /* when each plate lands and leaves, on the host's clock */
      this.inAt = new Map(); this.outAt = new Map();
    }
    const targets = [];
    for (const spot of spots || []) {
      const key = String(spot.key);
      const area = areas.get(key);
      if (!area) continue;
      const prev = new Map([...this.stacks.values()].filter(st => st.spot === key).map(st => [st.player, { ...st.px, pairDir:st.pairDir }]));
      const seed = `${contestId}|${key}`;
      const stacks = (spot.stacks || []).map(s => s.status === "won" && s.paid > 0 ? { ...s, pay:payBodies(s.paid) } : s);
      const sc = scatterStacks({ area:area.box, keepouts:area.keepouts, stacks, r:chip / 2, height:this.H, rMin:(chipMin || chip * 0.55) / 2, seed, label, pair:pairs, prev });
      for (const item of sc.items) {
        const members = item.group ? spot.stacks.filter(s => item.players.includes(s.player)) : [spot.stacks.find(s => s.player === item.player)];
        const status = members[0]?.status || null;
        const paid = members.reduce((sum, s) => sum + (Number(s?.paid) || 0), 0);
        targets.push({ id:`${key}|${item.player}`, spot:key, item:{ ...item, status, paid }, r:sc.r, seed });
      }
    }
    const settled = phase === "settled";
    const cap = bodyCap(targets.flatMap(t => [t.item.bodies, settled && t.item.status === "won" ? payBodies(t.item.paid) : 0]).filter(Boolean),
      budget);
    const keep = new Set(targets.map(t => t.id));
    [...this.stacks.values()].forEach(st => { if (!keep.has(st.id)) this.drop(st, animate); });
    const labels = [];
    for (const target of targets) {
      const { id, spot, item, r, seed } = target;
      let st = this.stacks.get(id);
      if (st && (Math.abs(st.px.x - item.x) > 0.5 || Math.abs(st.px.y - item.y) > 0.5 || Math.abs(st.r - r) > 0.01 || st.pairDir !== item.pairDir)) {
        this.drop(st, false);
        this.settled.delete(id);
        st = null;
      }
      const fresh = !st;
      if (!st) st = this.makeStack(id, spot, item, r, seed);
      st.item = item;
      const done = settled && this.settled.has(id);
      if (fresh && done) {
        /* a settled stack stood again (a new size): its final state, at rest */
        if (item.status === "lost") st.gone = true;
        else {
          for (let j = 0; j < Math.min(item.bodies, cap); j++) this.place(st);
          if (item.status === "won" && item.paid > 0) for (let k = 0; k < Math.min(payBodies(item.paid), cap); k++) this.place(st, true);
        }
      } else if (!st.gone && !done) {
        const want = Math.min(item.bodies, cap);
        const have = st.chips.length;
        if (want > have) {
          if (animate) {
            const plan = tossSchedule(want - have, `${seed}|${item.player}|${have}`);
            plan.forEach(step => this.toss(st, step.delay, step.flight, !!onLand));
            if (fresh) this.inAt.set(id, nowClock + plan[0].delay + plan[0].flight);
          } else for (let j = have; j < want; j++) this.place(st);
        } else for (let j = want; j < have; j++) this.lift(st, false, animate);
      }
      let out = null;
      if (settled && !this.settled.has(id)) {
        this.settled.add(id);
        if (item.status === "lost") {
          const hit = settle?.rake ? sweepHit(item.x, settle.rake) : nowClock - LATE - 1;
          if (reduced || nowClock - hit > LATE) {
            [...st.chips, ...st.pay].forEach(chip => this.remove(chip));
            st.gone = true;
            this.outAt.set(id, nowClock - PLATE_GONE);
          }
          else {
            const toward = this.toFloor(settle.rake.to?.x ?? this.W, settle.rake.to?.y ?? 0);
            this.at(toPerf(Math.max(hit, nowClock)), () => { this.rake(st, toward); st.gone = true; });
            this.outAt.set(id, hit);
          }
        } else if (item.status === "won" && item.paid > 0) {
          const n = Math.min(payBodies(item.paid), cap);
          const payAt = settle?.payAt ?? nowClock - LATE - 1;
          if (reduced || nowClock - payAt > LATE) for (let k = 0; k < n; k++) this.place(st, true);
          else for (let k = 0; k < n; k++) this.rain(st, k, Math.max(0, payAt - nowClock) + k * 60);
        }
      }
      if (this.outAt.has(id)) {
        if (nowClock - this.outAt.get(id) >= PLATE_GONE) continue;
        out = Math.max(0, this.outAt.get(id) - nowClock);
      }
      const landAt = this.inAt.has(id) ? this.inAt.get(id) - nowClock : 0;
      labels.push({ id, x:item.x, y:item.y + stackExtent(r, 1, elevationAt(item.y, this.H)).down + 6, item, r,
        in:landAt > 0 ? landAt : null, out });
    }
    /* "No more bets": the glove squares each stack as it passes */
    if (phase !== "open" && lockSweep && !reduced) {
      const key = `${contestId}|${lockSweep.at}`;
      if (this.lockKey !== key) {
        this.lockKey = key;
        this.stacks.forEach(st => {
          const hit = sweepHit(st.px.x, lockSweep);
          if (hit >= nowClock - 150) this.at(toPerf(hit), () => this.square(st));
        });
      }
    }
    this.kick();
    return labels;
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf); clearTimeout(this.wake);
    this.clear();
    this.owners.forEach(o => {
      o.faceMat.map?.dispose(); o.sideMat.map?.dispose(); o.faceMat.dispose(); o.sideMat.dispose();
      o.mesh.dispose(); o.hull.dispose();
    });
    this.chipGeo.dispose(); this.hullGeo?.dispose(); this.hullMat.dispose(); this.ramp.dispose();
    this.shadowPlane.geometry.dispose(); this.shadowPlane.material.dispose();
    this.light.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* each spot's chip area, in the layer's own px (the host's padding box) */
function measure(layer, spots, selector, keepoutSelector, root = null) {
  const box = layer.getBoundingClientRect();
  const W = layer.offsetWidth, H = layer.offsetHeight;
  const scale = W ? box.width / W : 1;
  const host = root || layer.parentElement;
  const areas = new Map();
  for (const spot of spots || []) {
    const key = String(spot.key);
    const el = host?.querySelector(`[data-spot="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key}"]`);
    if (!el) continue;
    const zone = selector ? el.querySelector(selector) : null;
    const r = (zone || el).getBoundingClientRect();
    let area = { x:(r.left - box.left) / scale, y:(r.top - box.top) / scale, w:r.width / scale, h:r.height / scale };
    if (!zone) area = { ...area, y:area.y + area.h * 0.55, h:area.h * 0.45 };
    /* a little felt is kept clear inside the area's own edge */
    area = { x:area.x + AREA_INSET, y:area.y + AREA_INSET, w:area.w - 2 * AREA_INSET, h:area.h - 2 * AREA_INSET };
    const keepouts = keepoutSelector ? [...el.querySelectorAll(keepoutSelector)].map(node => node.getBoundingClientRect())
      .filter(k => k.width > 0 && k.height > 0)
      .map(k => ({ left:(k.left - box.left) / scale, right:(k.right - box.left) / scale, top:(k.top - box.top) / scale, bottom:(k.bottom - box.top) / scale }))
      : [];
    if (area.w > 0 && area.h > 0) areas.set(key, { box:area, keepouts });
  }
  return { W, H, areas };
}

const signatureOf = (spots, phase, contestId) => `${contestId}|${phase}|${(spots || []).map(spot =>
  `${spot.key}:${(spot.stacks || []).map(s => `${s.player}=${s.stake}${s.status ? `/${s.status}` : ""}${s.paid ? `+${s.paid}` : ""}`).join(",")}`).join(";")}`;

export default function ChipPhysics({ host, spots = [], contestId = "", phase = "open", fresh, reducedMotion = false, quality = "phone",
  chip, chipMin, areaSelector = "[data-chips3d-area]", keepoutSelector = "[data-chips3d-keepout]", pairs = true, label = null, clock = Date.now, lockSweep = null, settle = null,
  pixelRatio, onLand = null, onFallback = () => {}, className = "" }) {
  const tv = quality === "tv";
  const layerRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [labels, setLabels] = useState([]);
  const failRef = useRef(onFallback);
  failRef.current = onFallback;
  const live = useRef({});
  const ran = useRef(null);
  const diameter = chip || (tv ? 52 : 22);
  live.current = { spots, contestId, phase, chip:diameter, chipMin, pairs, label, clock, lockSweep, settle, reduced:reducedMotion,
    budget:CHIP3D.budget[tv ? "tv" : "phone"], onLand, host, areaSelector, keepoutSelector };
  const ratio = pixelRatio || (tv ? 1 : Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1));

  const run = animate => {
    const engine = engineRef.current, layer = layerRef.current;
    if (!engine || !layer) return;
    const p = live.current;
    const { W, H, areas } = measure(layer, p.spots, p.areaSelector, p.keepoutSelector, p.host?.current || null);
    if (!W || !H) return;
    /* a new box re-stands every stack at rest (a settled one in its final state) */
    if (engine.frame(W, H, p.chip / 2)) engine.clear();
    try {
      setLabels(engine.sync({ ...p, areas, animate }));
    } catch (error) {
      failRef.current("sync");
    }
  };

  /* mount: the renderer and the table as it stands, no animation */
  useLayoutEffect(() => {
    const canvas = canvasRef.current, layer = layerRef.current;
    let engine;
    try {
      engine = new ChipEngine(canvas, { quality:tv ? "tv" : "phone", pixelRatio:ratio });
    } catch {
      failRef.current("init");
      return undefined;
    }
    engine.onFail = reason => { engine.pause(true); failRef.current(reason); };
    engineRef.current = engine;
    layer.chipStats = engine.stats;
    const lost = event => { event.preventDefault(); engine.onFail("lost"); };
    canvas.addEventListener("webglcontextlost", lost);
    run(false);
    /* a new size re-measures and stands everything at rest */
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => run(false)) : null;
    resize?.observe(layer);
    /* nothing renders while the page is hidden or the table is off screen */
    let hidden = false, away = false;
    const hold = () => engine.pause(hidden || away);
    const vis = () => { hidden = document.visibilityState === "hidden"; hold(); };
    document.addEventListener("visibilitychange", vis);
    const seen = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
      away = !entries.some(entry => entry.isIntersecting); hold();
    }) : null;
    seen?.observe(layer);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", vis);
      resize?.disconnect(); seen?.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { engineRef.current?.renderer.setPixelRatio(ratio); engineRef.current?.kick(); }, [ratio]);

  /* a new table: stand it, or play the moment (fresh frames only) */
  const signature = signatureOf(spots, phase, contestId);
  const runKey = `${signature}|${reducedMotion}|${lockSweep?.at || 0}|${settle?.payAt || 0}`;
  ran.current ??= runKey;
  useLayoutEffect(() => {
    if (ran.current === runKey) return;
    ran.current = runKey;
    const animate = !reducedMotion && (fresh === undefined ? freshFrameNow() : !!fresh);
    run(animate);
  }, [runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPaint = useRef(null);
  onPaint.current = (player, paint) => engineRef.current?.paint(player, paint);
  const players = useMemo(() => [...new Set((spots || []).flatMap(spot => (spot.stacks || []).map(s => s.player)))].sort(),
    [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={layerRef} className={`c3d${className ? ` ${className}` : ""}`} aria-hidden={label ? undefined : "true"}>
      <canvas ref={canvasRef} className="c3d-canvas" aria-hidden="true" />
      {label && <div className="c3d-labels">
        {labels.map(item => <div key={item.id} className={`c3d-label${item.in ? " is-in" : ""}${item.out !== null ? " is-out" : ""}`}
          style={{ left:Math.round(item.x), top:Math.round(item.y), "--c3d-in":`${item.in || 0}ms`, "--c3d-out":`${item.out || 0}ms` }}>
          {label.render(item.item)}
        </div>)}
      </div>}
      <div className="c3d-sources" aria-hidden="true">
        {players.map(p => <FaceSource key={p} p={p} onPaint={onPaint} size={tv ? 512 : 256} />)}
      </div>
    </div>
  );
}
