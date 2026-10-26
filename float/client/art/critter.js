/* A critter come to life: the procedural animation over a species template.

   Every frame builds one pose from layers, in order, each blended by its
   weight: seated idle (breathing, looking around, blinking), sad, celebrate,
   the drink, the paddle strokes, swimming, the victory pose. Body channels
   go first and set the bones; hand targets go second, so a hand resting on
   the rim or pulling through the water stays put in the floatie's space
   while the body leans, and a hand at the mouth moves with the head. Arms
   are solved by two-bone IK (they stretch a little when they must, rubber
   hose style). Springs on the head, the squash and the body give overshoot
   and settle; ears, crest and tail follow through.

   A baked (plush) critter is floppier still: its ears, cheeks, belly and
   tail hang on damped springs driven by how its head actually moves in the
   world (the bob of the water, a stroke's lean, a bump the screen gives the
   rider), so it jiggles and flops like a soft toy. Its mesh arrives after
   the skeleton (critterAsset.js) and pops in.

   Nothing in update() allocates. */
import * as THREE from "three";
import { instantiate, solveArm, IDENTITY } from "./rig.js";
import { shellGeometry } from "./critterTemplate.js";

const TAU = Math.PI * 2;
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = x => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => { const d = (x - c) / w; return d <= -1 || d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(d * Math.PI); };
const backOut = x => { const t = clamp01(x), s = 1.9; return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2; };

export const STROKE_S = 0.48;
const STROKE_REPEAT_S = 0.28;
const STATE_RAMP_S = 0.42;
const FIDGET_S = 1.9;
const SIDES = ["L", "R"];
const HIDE = 1e-4;

/* where a critter sits, from its floatie (floatie3d.js gives each its own):
   rest: the left hand's rest point (x mirrored for the right), water: the
   water's height, out: how far out a stroke catches, legRX: the legs' lift,
   lean: the seated recline */
export const DEFAULT_SEAT = Object.freeze({ kind: "ring", rest: [0.34, 0.2, -0.02], water: -0.05, out: 0.6, legRX: 0.32, lean: 0.06 });

/* the pose buffer: every channel a layer can write */
const BODY = ["px", "py", "pz", "prx", "pry", "prz", "hy", "hrx", "hry", "hrz", "sq", "crx", "cry", "crz", "br", "nrx", "hdx", "hdy", "hdz",
  "llx", "lly", "rlx", "rly", "tx", "ty", "t2y", "elx", "elz", "erx", "erz", "cr"];
const ROOT = ["px", "py", "pz", "prx", "pry", "prz"];
const BODY_REST = BODY.filter(k => !ROOT.includes(k));
const HANDS = ["lhx", "lhy", "lhz", "rhx", "rhy", "rhz", "lpx", "lpy", "lpz", "rpx", "rpy", "rpz", "can", "canTilt", "bulge"];
const HAND_POS = ["lhx", "lhy", "lhz", "rhx", "rhy", "rhz"];
const newPose = () => { const p = {}; for (const k of [...BODY, ...HANDS, "thx", "thy", "thz"]) p[k] = 0; return p; };
const blendKeys = (P, Q, keys, w) => {
  if (w <= 0) return;
  if (w >= 1) { for (let i = 0; i < keys.length; i++) P[keys[i]] = Q[keys[i]]; return; }
  for (let i = 0; i < keys.length; i++) { const k = keys[i]; P[k] += (Q[k] - P[k]) * w; }
};
const copyKeys = (P, Q, keys) => { for (let i = 0; i < keys.length; i++) Q[keys[i]] = P[keys[i]]; };

/* a damped spring per channel: [omega, zeta] */
class Springs {
  constructor(spec) { this.spec = spec; this.keys = Object.keys(spec); this.x = {}; this.v = {}; this.init = false; }
  step(P, dt) {
    const { spec, keys, x, v } = this;
    if (!this.init) { this.snap(P); return; }
    const n = Math.min(4, Math.max(1, Math.ceil(dt * 60)));
    const h = dt / n;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], s = spec[k], w = s[0], z = s[1];
      let xx = x[k], vv = v[k];
      const target = P[k];
      for (let j = 0; j < n; j++) { vv += (w * w * (target - xx) - 2 * z * w * vv) * h; xx += vv * h; }
      x[k] = xx; v[k] = vv; P[k] = xx;
    }
  }
  snap(P) { for (const k of this.keys) { this.x[k] = P[k]; this.v[k] = 0; } this.init = true; }
}

const BODY_SPRINGS = {
  hdx: [11, 0.5], hdy: [10, 0.48], hdz: [11, 0.5], sq: [19, 0.3], hrz: [13, 0.55], hry: [13, 0.6], hrx: [12, 0.6], hy: [16, 0.45],
  px: [14, 0.8], py: [14, 0.7], pz: [14, 0.8], prz: [12, 0.6], tx: [8, 0.35], ty: [7, 0.32], t2y: [6, 0.3], cr: [9, 0.28],
  elx: [12, 0.3], elz: [12, 0.3], erx: [12, 0.3], erz: [12, 0.3], cry: [12, 0.6], crx: [12, 0.6],
  llx: [16, 0.6], rlx: [16, 0.6],
};
const HAND_SPRINGS = { lhx: [30, 0.92], lhy: [30, 0.92], lhz: [30, 0.92], rhx: [30, 0.92], rhy: [30, 0.92], rhz: [30, 0.92], canTilt: [14, 0.6], bulge: [22, 0.35] };

/* per side: the channel names and bones, made once */
const SIDE_KEYS = {
  L: { k: "l", hx: "lhx", hy: "lhy", hz: "lhz", px: "lpx", py: "lpy", pz: "lpz", sign: -1 },
  R: { k: "r", hx: "rhx", hy: "rhy", hz: "rhz", px: "rpx", py: "rpy", pz: "rpz", sign: 1 },
};

/* scratch, shared by every critter (single-threaded, used in turn) */
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3(), _w = new THREE.Vector3();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();
const _jp = new THREE.Vector3(), _jq = new THREE.Quaternion(), _js = new THREE.Vector3(), _ja = new THREE.Vector3();

/* one damped spring, stepped in place (x toward target) */
function spring(s, target, w, z, h) {
  s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
  s.x += s.v * h;
}
const sp = () => ({ x: 0, v: 0 });
const lim = (v, m) => (v > m ? m : v < -m ? -m : v);
const CHEEKS = ["cheekL", "cheekR"];
const POP_S = 0.34;

/* Catmull-Rom through keyframes [t, x, y, z] (t ascending) */
function path(keys, t, out) {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const u = clamp01((t - k1[0]) / (k2[0] - k1[0] || 1));
  const u2 = u * u, u3 = u2 * u;
  const cr = (p0, p1, p2, p3) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  out.x = cr(k0[1], k1[1], k2[1], k3[1]); out.y = cr(k0[2], k1[2], k2[2], k3[2]); out.z = cr(k0[3], k1[3], k2[3], k3[3]);
  return out;
}

export function mulberry(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0);
  a = a || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class CritterRuntime {
  constructor(template, { materials, seed = "critter", drink = null } = {}) {
    const inst = instantiate(template);
    this.template = template;
    this.root = inst.root;
    this.b = inst.bones;
    this.skeleton = inst.skeleton;
    this.meshes = inst.meshes;
    this.info = template.info;
    this.rand = mulberry(seed);
    this.restLocal = {};
    for (const [name, bone] of Object.entries(this.b)) this.restLocal[name] = bone.position.clone();
    this.chestAt = template.bones.find(b => b.name === "chest").at.clone();
    this.side = {};
    for (const s of SIDES) {
      const a = this.info[`arm${s}`];
      this.side[s] = {
        ...SIDE_KEYS[s],
        bind: { dir: a.dir.clone(), pole: a.pole.clone(), a: a.a, b: a.b },
        S: a.shoulder.clone().sub(this.chestAt),
        shoulder: this.b[`shoulder${s}`], elbow: this.b[`elbow${s}`], hand: this.b[`hand${s}`],
        restElbow: this.restLocal[`elbow${s}`], restHand: this.restLocal[`hand${s}`],
        stroke: { on: false, t: 0, phase: 0, caught: false },
        keys: [[0, 0, 0, 0], [0.16, 0, 0, 0], [0.32, 0, 0, 0], [0.56, 0, 0, 0], [0.76, 0, 0, 0], [1, 0, 0, 0]],
      };
    }
    this.mouthRest = this.info.mouth ? this.info.mouth.p.clone() : new THREE.Vector3(0, 0.53, -0.25);
    const head = this.info.head;
    const chinY = head ? head.at[1] - head.r[1] : 0.4;
    /* where a held can meets the mouth: under the chin, never beyond the arm's reach */
    this.sipAt = new THREE.Vector3(0, chinY - 0.045, Math.max(this.mouthRest.z + 0.02, -0.24));
    this.seat = DEFAULT_SEAT;
    this.t = 0;
    this.state = { swim: false, handsOff: false, sad: false, celebrate: false };
    this.w = { swim: 0, handsOff: 0, sad: 0, celebrate: 0, pose: 0 };
    this.pose = null; this.poseShown = null; this.poseT = 0;
    this.drinkSide = "R"; this.drinkPop = 1;
    this.look = { yaw: 0, pitch: 0, next: 0.8 + this.rand() * 1.5 };
    this.blinkAt = 1 + this.rand() * 2.5; this.blinkT = -1;
    this.twitch = { at: 2 + this.rand() * 4, t: -1, side: 1 };
    this.wag = { at: 1.5 + this.rand() * 3, t: -1 };
    /* left alone, a critter fidgets: a wave, a stretch and a yawn, a scratch of the head */
    this.fidget = { at: 5 + this.rand() * 7, t: -1, kind: "wave", side: "R", quiet: 0 };
    this.expr = { eyes: "open", mouth: "smile", lids: !!this.info.chill, popEyes: 1, popMouth: 1 };
    this.P = newPose(); this.Q = newPose(); this.R = newPose();
    this.bodySprings = new Springs(BODY_SPRINGS);
    this.handSprings = new Springs(HAND_SPRINGS);
    this.prevHead = { x: 0, y: 0 };
    this.onCatch = null;
    this.impulse = { dip: 0 };
    this.lean = 0;
    this.drink = drink;
    if (drink) { this.b.chest.add(drink); drink.visible = false; }
    this.anchors = { head: this.b.head, chest: this.b.chest, handL: this.b.handL, handR: this.b.handR };
    /* the plush's floppy parts: springs and the bones' rest places */
    this.materials = materials;
    this.jig = {
      init: false, prev: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), local: new THREE.Vector3(),
      earLx: sp(), earLz: sp(), earRx: sp(), earRz: sp(), tipLx: sp(), tipLz: sp(), tipRx: sp(), tipRz: sp(),
      cheek: sp(), cheekS: sp(), belly: sp(), bellyS: sp(), tailY: sp(), tailX: sp(), tipY: sp(), tipX: sp(), prevSq: 1, prevYaw: 0,
    };
    this.rest = {};
    for (const name of ["cheekL", "cheekR", "belly", "earL2", "earR2", "tail3"]) if (this.b[name]) this.rest[name] = this.b[name].position.clone();
    this.pop = 0;
    this.body = null;
  }

  /* a baked critter's mesh, arrived: bind it (and its fur's shells) to the
     skeleton made in the bind pose, and pop it in. Over a stand-in (a hero
     critter showing its race mesh while the hero file loads) it trades
     places where it stands, without a pop. fur: the shells' material when
     it is not this critter's own (a stand-in's) */
  attach(geo, { fur: furFor = null } = {}) {
    if (this.disposed || !geo || this.body?.geometry === geo) return;
    const swap = !!this.body;
    if (swap) {
      this.root.remove(this.body);
      if (this.meshes.fur) this.root.remove(this.meshes.fur);
      this.meshes.fur = null;
    }
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0.45, 0.05), 1.6);
    const body = new THREE.SkinnedMesh(geo, this.materials.plush);
    body.name = "critter-plush";
    body.boundingSphere = sphere.clone();
    this.root.add(body);
    body.bind(this.skeleton, IDENTITY);
    this.meshes.plush = body;
    const furMat = furFor || this.materials.fur;
    const shells = furMat && shellGeometry(geo, furMat.userData.shells);
    if (shells) {
      const fur = new THREE.SkinnedMesh(shells, furMat);
      fur.name = "critter-fur";
      fur.boundingSphere = sphere.clone();
      fur.renderOrder = 1;
      this.root.add(fur);
      fur.bind(this.skeleton, IDENTITY);
      this.meshes.fur = fur;
    }
    if (this.placeholder) { this.root.remove(this.placeholder); this.placeholder.geometry.dispose(); this.placeholder = null; }
    this.body = body;
    if (!swap) this.pop = Math.min(this.pop, 0.001);
  }

  /* an invisible box the size of the sculpt, so a bounding box taken before
     the mesh arrives (a name tag's height) is right */
  holdPlace(bounds) {
    if (this.body || !bounds) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...bounds.lo, ...bounds.hi], 3));
    g.setDrawRange(0, 0);
    const m = new THREE.Mesh(g);
    m.visible = false;
    m.name = "critter-placeholder";
    this.placeholder = m;
    this.root.add(m);
  }

  setSeat(seat) { this.seat = { ...DEFAULT_SEAT, ...(seat || {}) }; }

  setState(next = {}) {
    for (const k of ["swim", "handsOff", "sad", "celebrate"]) if (next && k in next) this.state[k] = !!next[k];
  }

  setPose(id) {
    const next = id === "flex" || id === "chug" || id === "airguitar" || id === "backflip" ? id : null;
    if (next === this.pose) return;
    this.pose = next;
    if (next) { this.poseShown = next; this.poseT = 0; }
  }

  /* one paddle stroke; a repeat inside the same stroke's first 0.28 s is
     the same stroke (the screen may call this every snapshot the flag is up) */
  setStroke(side) {
    const s = side === "L" || side === "l" ? "L" : side === "R" || side === "r" ? "R" : null;
    if (!s) return;
    const st = this.side[s].stroke;
    if (st.on && st.t < STROKE_REPEAT_S) return;
    const recovering = st.on;
    st.on = true;
    st.t = recovering ? STROKE_S * 0.08 : 0;
    st.phase = st.t / STROKE_S;
    st.caught = false;
    if (this.state.handsOff && s === this.drinkSide) { this.drinkSide = s === "L" ? "R" : "L"; this.drinkPop = 0; }
  }

  /* ── the layers: pass 0 writes the body, pass 1 the hands ── */

  base(P, pass) {
    const t = this.t, seat = this.seat;
    if (pass === 0) {
      const breath = Math.sin(t * TAU * 0.28 + 0.6);
      P.px = 0; P.py = 0; P.pz = 0; P.prx = 0; P.pry = 0; P.prz = 0;
      P.hy = 0.004 * breath; P.hrx = seat.lean || 0; P.hry = 0.03 * Math.sin(t * 0.37); P.hrz = 0.02 * Math.sin(t * 0.53 + 1);
      P.sq = 1 + 0.014 * breath;
      P.crx = 0.012 * breath; P.cry = 0; P.crz = 0; P.br = 1 + 0.018 * breath; P.nrx = 0;
      P.hdx = this.look.pitch + 0.02 * Math.sin(t * 0.9); P.hdy = this.look.yaw; P.hdz = 0.04 * Math.sin(t * 0.61 + 2);
      const legSway = 0.06 * Math.sin(t * 1.3);
      P.llx = seat.legRX + legSway; P.lly = 0; P.rlx = seat.legRX - legSway; P.rly = 0;
      let wagA = 0;
      if (this.wag.t >= 0) wagA = Math.sin(this.wag.t * TAU * 2.6) * 0.38 * (1 - this.wag.t / 1.4);
      P.tx = 0.05 * Math.sin(t * 0.8); P.ty = wagA + 0.06 * Math.sin(t * 0.7); P.t2y = wagA * 1.3;
      let tw = 0;
      if (this.twitch.t >= 0) tw = Math.sin(clamp01(this.twitch.t / 0.28) * Math.PI) * 0.45;
      P.elx = 0; P.elz = this.twitch.side < 0 ? tw : 0; P.erx = 0; P.erz = this.twitch.side > 0 ? -tw : 0;
      P.cr = 0.04 * Math.sin(t * 1.1);
    } else {
      const rest = seat.rest;
      const sway = 0.008 * Math.sin(t * 1.1);
      this.seatToChest(-rest[0], rest[1] + sway, rest[2], P, "l");
      this.seatToChest(rest[0], rest[1] - sway, rest[2], P, "r");
      P.lpx = -1; P.lpy = -0.25; P.lpz = 0.55; P.rpx = 1; P.rpy = -0.25; P.rpz = 0.55;
      P.can = 0; P.canTilt = 0; P.bulge = 1;
    }
  }

  sad(P, pass) {
    const t = this.t;
    if (pass === 0) {
      const sigh = bump((t % 5.2) / 5.2, 0.5, 0.18);
      P.hrx = -0.2 + 0.05 * sigh; P.crx = -0.14; P.hy = -0.012 - 0.01 * sigh; P.sq = 0.97 + 0.03 * sigh;
      P.hdx = -0.34 + 0.08 * sigh; P.hdy = 0.12 * Math.sin(t * 0.3); P.hdz = 0.08;
      P.elz = 0.5; P.erz = -0.5; P.elx = -0.25; P.erx = -0.25;
      P.ty = 0; P.t2y = 0; P.tx = -0.25; P.cr = -0.25;
      P.llx = this.seat.legRX - 0.15; P.rlx = this.seat.legRX - 0.15;
    } else {
      this.seatToChest(-0.16, 0.12, -0.14, P, "l");
      this.seatToChest(0.16, 0.12, -0.14, P, "r");
      P.lpx = -1; P.lpy = 0.1; P.lpz = 0.3; P.rpx = 1; P.rpy = 0.1; P.rpz = 0.3;
    }
  }

  celebrate(P, pass) {
    const t = this.t, f = 2.4;
    const hop = Math.abs(Math.sin(t * Math.PI * f));
    if (pass === 0) {
      P.hy = 0.05 * hop; P.sq = 0.92 + 0.12 * hop; P.hrx = 0.02; P.hrz = 0.08 * Math.sin(t * Math.PI * f * 0.5);
      P.hdx = 0.16; P.hdz = 0.14 * Math.sin(t * Math.PI * f * 0.5); P.hdy = 0;
      P.ty = 0.5 * Math.sin(t * TAU * 2.2); P.t2y = P.ty * 1.2; P.cr = 0.2 * Math.sin(t * TAU * 2.4);
      P.llx = this.seat.legRX + 0.25 * Math.sin(t * TAU * 1.2); P.rlx = this.seat.legRX - 0.25 * Math.sin(t * TAU * 1.2);
    } else {
      const wave = Math.sin(t * TAU * 1.25);
      this.restToChest(-0.36 - 0.05 * wave, 0.6 + 0.03 * hop + 0.03 * wave, -0.07, P, "l");
      this.restToChest(0.36 - 0.05 * wave, 0.6 + 0.03 * hop - 0.03 * wave, -0.07, P, "r");
      P.lpx = -1; P.lpy = -0.7; P.lpz = 0.15; P.rpx = 1; P.rpy = -0.7; P.rpz = 0.15;
    }
  }

  /* the drink: hand at the mouth, the can tipped to it, the head back */
  drinkLayer(P, pass, s, sipping, gulp) {
    if (pass === 0) {
      P.hdx = 0.12 + 0.24 * sipping + 0.04 * gulp; P.hdy *= 0.3; P.hdz = s === "L" ? -0.06 : 0.06;
      P.crx -= 0.03 * gulp;
    } else {
      const sx = s === "L" ? -1 : 1;
      const m = this.sipAt;
      this.restToChest(sx * 0.075, m.y + 0.035 * sipping, m.z - 0.015 * sipping, P, s === "L" ? "l" : "r");
      if (s === "L") { P.lpx = -1; P.lpy = -0.7; P.lpz = 0.2; } else { P.rpx = 1; P.rpy = -0.7; P.rpz = 0.2; }
      P.can = 1; P.canTilt = 0.25 + 1.05 * sipping;
    }
  }

  /* a fidget, blended in and out over its own short life */
  fidgetLayer(P, pass) {
    const fg = this.fidget;
    if (fg.t < 0) return;
    const t = fg.t, w = ease(t / 0.3) * (1 - ease((t - (FIDGET_S - 0.35)) / 0.35));
    if (w <= 0) return;
    const sx = fg.side === "L" ? -1 : 1;
    if (fg.kind === "wave") {
      if (pass === 0) { P.hdz += sx * 0.12 * w; P.hdy -= sx * 0.15 * w; P.hrz -= sx * 0.05 * w; }
      else {
        const K = SIDE_KEYS[fg.side], c = this.chestAt;
        const x = sx * (0.33 + 0.05 * Math.sin(t * TAU * 2.6)), y = 0.64, z = -0.1;
        P[K.hx] += (x - c.x - P[K.hx]) * w; P[K.hy] += (y - c.y - P[K.hy]) * w; P[K.hz] += (z - c.z - P[K.hz]) * w;
      }
    } else if (fg.kind === "stretch") {
      const up = Math.sin(Math.PI * clamp01(t / FIDGET_S));
      if (pass === 0) { P.sq += 0.07 * up * w; P.hdx += 0.22 * up * w; P.hrx -= 0.08 * up * w; }
      else {
        const c = this.chestAt;
        P.lhx += (-0.3 - c.x - P.lhx) * w; P.lhy += (0.66 - c.y - P.lhy) * w; P.lhz += (0.02 - c.z - P.lhz) * w;
        P.rhx += (0.3 - c.x - P.rhx) * w; P.rhy += (0.66 - c.y - P.rhy) * w; P.rhz += (0.02 - c.z - P.rhz) * w;
      }
    } else if (pass === 0) { P.hdz -= sx * 0.14 * w; P.hdx -= 0.06 * w; }
    else {
      const K = SIDE_KEYS[fg.side], c = this.chestAt, hd = this.info.head;
      const x = sx * (hd ? hd.r[0] * 0.75 : 0.18), y = (hd ? hd.at[1] + hd.r[1] * 0.45 : 0.72) + 0.015 * Math.sin(t * TAU * 5), z = 0.02;
      P[K.hx] += (x - c.x - P[K.hx]) * w; P[K.hy] += (y - c.y - P[K.hy]) * w; P[K.hz] += (z - c.z - P[K.hz]) * w;
    }
  }

  /* a paddle stroke: reach, catch, pull, out, home; the body leans into it */
  stroke(P, pass, s) {
    const side = this.side[s], st = side.stroke;
    if (!st.on) return;
    const ph = st.phase, lr = s === "L" ? 1 : -1;
    if (pass === 0) {
      const lean = Math.sin(Math.PI * clamp01((ph - 0.08) / 0.62));
      const twist = 0.15 * Math.sin(Math.PI * clamp01((ph - 0.22) / 0.55)) - 0.07 * bump(ph, 0.14, 0.14);
      P.hrz += lr * 0.2 * lean; P.hry += lr * twist;
      P.sq -= 0.055 * bump(ph, 0.32, 0.14);
      P.hdz -= lr * 0.09 * lean; P.hdy -= lr * twist * 0.6;
      this.lean += lr * lean;
    } else {
      const w = ease(ph / 0.06) * (1 - ease((ph - 0.84) / 0.16));
      const seat = this.seat, rest = seat.rest, out = seat.out, wy = seat.water, keys = side.keys;
      keys[0][1] = rest[0]; keys[0][2] = rest[1]; keys[0][3] = rest[2];
      keys[1][1] = rest[0] + 0.05; keys[1][2] = rest[1] + 0.2; keys[1][3] = -0.3;
      keys[2][1] = out; keys[2][2] = wy + 0.07; keys[2][3] = -0.24;
      keys[3][1] = out - 0.01; keys[3][2] = wy + 0.05; keys[3][3] = 0.26;
      keys[4][1] = out - 0.08; keys[4][2] = rest[1] + 0.12; keys[4][3] = 0.3;
      keys[5][1] = rest[0]; keys[5][2] = rest[1]; keys[5][3] = rest[2];
      path(keys, ph, _w);
      const R = this.R;
      this.seatToChest(side.sign * _w.x, _w.y, _w.z, R, "t");
      P[side.hx] += (R.thx - P[side.hx]) * w; P[side.hy] += (R.thy - P[side.hy]) * w; P[side.hz] += (R.thz - P[side.hz]) * w;
      P[side.px] = side.sign; P[side.py] = 0.2; P[side.pz] = 0.7;
    }
  }

  /* overboard: a doggy paddle beside the floatie; w carries the hop in and out */
  swim(P, pass, w) {
    const t = this.t, seat = this.seat;
    const hop = Math.sin(Math.PI * clamp01(w)), e = ease(w);
    if (pass === 0) {
      P.px = 0.86 * e; P.py = (seat.water - 0.2) * e + 0.42 * hop + 0.028 * Math.sin(t * TAU * 1.7) * e; P.pz = 0.22 * e;
      P.prx = -0.82 * e; P.prz = -0.9 * hop * (this.state.swim ? 1 : -1); P.pry = (0.55 + 0.08 * Math.sin(t * TAU * 0.85)) * e;
      P.hrx = 0; P.hrz = 0.08 * Math.sin(t * TAU * 0.85); P.hry = 0;
      P.hdx = 0.78; P.hdy = 0.1 * Math.sin(t * 1.3); P.hdz = 0;
      const kick = Math.sin(t * TAU * 2.6) * 0.45;
      P.llx = -0.2 + kick; P.rlx = -0.2 - kick; P.lly = 0; P.rly = 0;
      P.ty = 0.3 * Math.sin(t * TAU * 1.3); P.elz = 0.35; P.erz = -0.35;
    } else {
      const ph = t * TAU / 0.62;
      this.restToChest(-0.13, 0.25 + Math.cos(ph) * 0.1, -0.27 + Math.sin(ph) * 0.1, P, "l");
      this.restToChest(0.13, 0.25 + Math.cos(ph + Math.PI) * 0.1, -0.27 + Math.sin(ph + Math.PI) * 0.1, P, "r");
      P.lpx = -1; P.lpy = 0.3; P.lpz = 0.3; P.rpx = 1; P.rpy = 0.3; P.rpz = 0.3;
    }
  }

  /* ── the victory poses (the podium), each a loop on its own clock ── */
  victory(P, pass, id, tt) {
    const seat = this.seat, out = this.poseExpr;
    out.eyes = "open"; out.mouth = "smile";
    if (id === "flex") {
      const cyc = tt % 2.2, up = backOut(tt / 0.45);
      const pulse = bump(cyc, 0.75, 0.22) + bump(cyc, 1.55, 0.22);
      const sway = Math.sin(tt * Math.PI / 1.1);
      if (pass === 0) {
        P.hy = 0.02 * pulse; P.sq = 1.02 + 0.07 * pulse; P.br = 1.04 + 0.08 * pulse; P.hrx = -0.04; P.hrz = 0.07 * sway;
        P.hdx = 0.2 + 0.05 * pulse; P.hdy = -0.25 * sway; P.hdz = 0.06 * sway; P.cr = 0.15 * pulse;
      } else {
        const lift = 0.025 * pulse;
        this.restToChest(-0.24 - 0.12 * up, 0.3 + 0.16 * up + lift, -0.08, P, "l");
        this.restToChest(0.24 + 0.12 * up, 0.3 + 0.16 * up + lift, -0.08, P, "r");
        P.lpx = -1; P.lpy = -0.12; P.lpz = 0.25; P.rpx = 1; P.rpy = -0.12; P.rpz = 0.25;
        P.bulge = 1 + 0.16 * pulse * up;
      }
      if (pulse > 0.4) out.eyes = "happy";
      return out;
    }
    if (id === "chug") {
      const cyc = tt % 3.4;
      const chugging = cyc < 2.2;
      const sip = chugging ? ease(cyc / 0.4) : 1 - ease((cyc - 2.2) / 0.25);
      const gulp = chugging && cyc > 0.4 ? Math.abs(Math.sin(cyc * TAU * 2.1)) : 0;
      const raise = chugging ? 0 : backOut((cyc - 2.25) / 0.4);
      if (pass === 0) {
        P.hdx = 0.16 + 0.42 * sip + 0.05 * gulp - 0.2 * raise; P.hdy = 0; P.hdz = 0.05;
        P.hrx = -0.05 + 0.08 * sip; P.sq = 1 - 0.02 * gulp + 0.05 * raise; P.hy = 0.03 * raise;
        P.crx = -0.04 * gulp;
        P.ty = 0.4 * raise * Math.sin(tt * TAU * 2);
      } else {
        const m = this.sipAt;
        if (chugging || raise < 0.05) {
          this.restToChest(0.07, m.y + 0.05 * sip, m.z - 0.01, P, "r");
          P.canTilt = 0.4 + 1.5 * sip;
        } else {
          this.restToChest(0.2, 0.62 + 0.3 * raise, -0.12, P, "r");
          P.canTilt = 0.1;
        }
        P.rpx = 1; P.rpy = -0.7; P.rpz = 0.2;
        this.restToChest(-0.21, 0.32, -0.12, P, "l");
        P.lpx = -1; P.lpy = -0.2; P.lpz = 0.5;
        P.can = 1;
      }
      if ((chugging && sip > 0.6) || raise > 0.2) out.eyes = "happy";
      if (raise > 0.2) out.mouth = "open";
      return out;
    }
    if (id === "airguitar") {
      const strum = Math.sin(tt * TAU * 5.2);
      const bang = Math.sin(tt * TAU * 2.6);
      const big = bump(tt % 2.4, 2.0, 0.28);
      if (pass === 0) {
        P.hdx = -0.06 + 0.2 * bang; P.hdy = 0.18; P.hdz = 0.1 + 0.05 * bang;
        P.hrz = -0.06 + 0.05 * Math.sin(tt * TAU * 1.3); P.hrx = 0.04 * bang; P.sq = 1 + 0.03 * Math.abs(bang); P.hy = 0.012 * Math.abs(bang);
        P.ty = 0.3 * strum; P.llx = seat.legRX + 0.3 * Math.max(0, bang); P.rlx = seat.legRX;
      } else {
        const fret = 0.03 * Math.sin(tt * TAU * 0.7) + 0.02 * Math.round(Math.sin(tt * 3.1));
        this.restToChest(-0.33 - fret, 0.4 + 0.02 * fret, -0.2, P, "l");
        P.lpx = -0.6; P.lpy = -1; P.lpz = 0.3;
        if (big > 0.02) this.restToChest(0.05 + 0.18 * big, 0.3 + 0.38 * big, -0.2, P, "r");
        else this.restToChest(0.04 + 0.03 * strum, 0.28 + 0.065 * strum, -0.22, P, "r");
        P.rpx = 1; P.rpy = -0.4; P.rpz = 0.5;
      }
      if (Math.abs(bang) > 0.55) out.eyes = "happy";
      out.mouth = "open";
      return out;
    }
    /* backflip */
    const cyc = tt % 3.0;
    const crouch = bump(cyc, 0.2, 0.2);
    const air = clamp01((cyc - 0.32) / 0.95);
    const inAir = cyc > 0.32 && cyc < 1.27;
    const land = cyc >= 1.27 ? bump(cyc, 1.36, 0.14) : 0;
    const tada = cyc > 1.36 ? backOut((cyc - 1.36) / 0.35) * (1 - ease((cyc - 2.6) / 0.4)) : 0;
    if (pass === 0) {
      P.py = inAir ? Math.sin(Math.PI * air) * 0.95 : 0;
      P.prx = inAir ? ease(air) * TAU : 0; P.pz = inAir ? Math.sin(Math.PI * air) * 0.12 : 0;
      P.sq = 1 - 0.18 * crouch - 0.22 * land + (inAir ? 0.1 * bump(air, 0.08, 0.1) - 0.12 * bump(air, 0.5, 0.35) : 0);
      P.hy = -0.03 * crouch;
      P.hdx = inAir ? -0.2 : 0.18 * tada; P.hdy = 0;
      P.llx = inAir ? 1.2 : seat.legRX; P.rlx = P.llx;
      P.ty = 0.4 * tada * Math.sin(tt * TAU * 2.4);
      if (land > 0.01) this.impulse.dip = Math.max(this.impulse.dip, land);
    } else if (inAir) {
      this.restToChest(-0.12, 0.3, -0.18, P, "l"); this.restToChest(0.12, 0.3, -0.18, P, "r");
      P.lpx = -1; P.lpy = -0.3; P.lpz = 0.3; P.rpx = 1; P.rpy = -0.3; P.rpz = 0.3;
    } else if (tada > 0.01) {
      this.restToChest(-0.18 - 0.12 * tada, 0.42 + 0.42 * tada, -0.1, P, "l");
      this.restToChest(0.18 + 0.12 * tada, 0.42 + 0.42 * tada, -0.1, P, "r");
      P.lpx = -1; P.lpy = -0.6; P.lpz = 0.2; P.rpx = 1; P.rpy = -0.6; P.rpz = 0.2;
    }
    if (inAir || tada > 0.3) out.eyes = "happy";
    if (inAir || tada > 0.2) out.mouth = "open";
    return out;
  }

  /* a hand target in the critter's rest space, moving with the chest */
  restToChest(x, y, z, P, k) {
    const c = this.chestAt;
    if (k === "l") { P.lhx = x - c.x; P.lhy = y - c.y; P.lhz = z - c.z; }
    else { P.rhx = x - c.x; P.rhy = y - c.y; P.rhz = z - c.z; }
  }

  /* a hand target in seat space (the floatie's), through the body as posed now */
  seatToChest(x, y, z, P, k) {
    _P.set(x, y, z).applyMatrix4(_mi);
    if (k === "l") { P.lhx = _P.x; P.lhy = _P.y; P.lhz = _P.z; }
    else if (k === "r") { P.rhx = _P.x; P.rhy = _P.y; P.rhz = _P.z; }
    else { P.thx = _P.x; P.thy = _P.y; P.thz = _P.z; }
  }

  ramp(k, on, step) { const w = this.w; w[k] = on ? Math.min(1, w[k] + step) : Math.max(0, w[k] - step); }

  /* ── the frame ── */
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.t += dt;
    const { w, state } = this;
    const step = dt / STATE_RAMP_S;
    this.ramp("swim", state.swim && !this.pose, step * 0.9);
    this.ramp("sad", state.sad, step);
    this.ramp("celebrate", state.celebrate, step);
    this.ramp("handsOff", state.handsOff, step);
    this.ramp("pose", !!this.pose, step);
    if (this.pose) this.poseT += dt;
    else if (w.pose <= 0) this.poseShown = null;
    this.timers(dt);

    const P = this.P, Q = this.Q;
    this.lean = 0;
    const sipCyc = (this.t % 3.2) / 3.2;
    const sipping = state.handsOff ? 1 - bump(sipCyc, 0.85, 0.12) * 0.8 : 0;
    const gulp = Math.max(0, Math.sin(this.t * TAU * 2.3)) * sipping;
    const poseW = ease(w.pose);
    const swimOn = w.swim > 0;
    this.poseExpr = this.poseExpr || { eyes: "open", mouth: "smile" };
    let poseExpr = null;

    /* pass 0: the body */
    this.base(P, 0);
    if (w.sad > 0) { copyKeys(P, Q, BODY); this.sad(Q, 0); blendKeys(P, Q, BODY, ease(w.sad)); }
    if (w.celebrate > 0) { copyKeys(P, Q, BODY); this.celebrate(Q, 0); blendKeys(P, Q, BODY, ease(w.celebrate)); }
    if (w.handsOff > 0) { copyKeys(P, Q, BODY); this.drinkLayer(Q, 0, this.drinkSide, sipping, gulp); blendKeys(P, Q, BODY, ease(w.handsOff)); }
    this.fidgetLayer(P, 0);
    this.stroke(P, 0, "L"); this.stroke(P, 0, "R");
    if (swimOn) { copyKeys(P, Q, BODY); this.swim(Q, 0, w.swim); blendKeys(P, Q, ROOT, 1); blendKeys(P, Q, BODY_REST, ease(w.swim)); }
    if (poseW > 0 && this.poseShown) { copyKeys(P, Q, BODY); poseExpr = this.victory(Q, 0, this.poseShown, this.poseT); blendKeys(P, Q, BODY, poseW); }
    this.bodySprings.step(P, dt);
    this.applyBody(P);
    this.secondary(P, dt);

    /* pass 1: the hands, through the body as it now stands */
    this.base(P, 1);
    if (w.sad > 0) { copyKeys(P, Q, HANDS); this.sad(Q, 1); blendKeys(P, Q, HANDS, ease(w.sad)); }
    if (w.celebrate > 0) { copyKeys(P, Q, HANDS); this.celebrate(Q, 1); blendKeys(P, Q, HANDS, ease(w.celebrate)); }
    if (w.handsOff > 0) { copyKeys(P, Q, HANDS); this.drinkLayer(Q, 1, this.drinkSide, sipping, gulp); blendKeys(P, Q, HANDS, ease(w.handsOff)); }
    this.fidgetLayer(P, 1);
    this.stroke(P, 1, "L"); this.stroke(P, 1, "R");
    if (swimOn) { copyKeys(P, Q, HANDS); this.swim(Q, 1, w.swim); blendKeys(P, Q, HANDS, ease(w.swim)); }
    if (poseW > 0 && this.poseShown) { copyKeys(P, Q, HANDS); this.victory(Q, 1, this.poseShown, this.poseT); blendKeys(P, Q, HANDS, poseW); }
    this.handSprings.step(P, dt);
    this.applyArms(P);
    this.applyExpression(dt, poseExpr);
    this.applyDrink(P, dt);
  }

  timers(dt) {
    const L = this.look;
    L.next -= dt;
    if (L.next <= 0) {
      L.next = 1.1 + this.rand() * 2.6;
      L.yaw = (this.rand() - 0.5) * 0.9; L.pitch = -0.08 + this.rand() * 0.24;
      if (this.rand() < 0.22) { L.yaw = 0; L.pitch = 0.05; }
    }
    this.blinkAt -= dt;
    if (this.blinkAt <= 0 && this.blinkT < 0) { this.blinkT = 0; this.blinkAt = 2.2 + this.rand() * 3.6; if (this.rand() < 0.15) this.blinkAt = 0.32; }
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT > 0.15) this.blinkT = -1; }
    const tw = this.twitch;
    tw.at -= dt;
    if (tw.at <= 0 && tw.t < 0) { tw.t = 0; tw.side = this.rand() < 0.5 ? -1 : 1; tw.at = 3 + this.rand() * 6; }
    if (tw.t >= 0) { tw.t += dt; if (tw.t > 0.3) tw.t = -1; }
    const fg = this.fidget;
    const busy = this.side.L.stroke.on || this.side.R.stroke.on || this.pose || this.state.swim || this.state.handsOff || this.state.sad || this.state.celebrate;
    if (busy) { fg.quiet = 0; if (fg.t >= 0 && fg.t < FIDGET_S - 0.3) fg.t = Math.max(fg.t, FIDGET_S - 0.3); }
    else fg.quiet += dt;
    if (fg.t >= 0) { fg.t += dt; if (fg.t > FIDGET_S) { fg.t = -1; fg.at = 6 + this.rand() * 9; } }
    else if (fg.quiet > 2.5) {
      fg.at -= dt;
      if (fg.at <= 0) { fg.t = 0; const r = this.rand(); fg.kind = r < 0.45 ? "wave" : r < 0.75 ? "stretch" : "scratch"; fg.side = this.rand() < 0.5 ? "L" : "R"; }
    }
    const wag = this.wag;
    wag.at -= dt;
    if (wag.at <= 0 && wag.t < 0) { wag.t = 0; wag.at = 3 + this.rand() * 5; }
    if (wag.t >= 0) { wag.t += dt; if (wag.t > 1.4) wag.t = -1; }
    for (let i = 0; i < 2; i++) {
      const s = SIDES[i], st = this.side[s].stroke;
      if (!st.on) continue;
      st.t += dt; st.phase = st.t / STROKE_S;
      if (!st.caught && st.phase >= 0.32) { st.caught = true; if (this.onCatch) this.onCatch(s); }
      if (st.phase >= 1) { st.on = false; st.phase = 0; st.t = 0; }
    }
  }

  applyBody(P) {
    const b = this.b;
    b.root.position.set(P.px, P.py, P.pz);
    b.root.rotation.set(P.prx, P.pry, P.prz, "YXZ");
    const sq = Math.max(0.6, P.sq), wide = 1 / Math.sqrt(sq);
    b.root.scale.set(wide, sq, wide);
    b.hips.position.set(0, this.restLocal.hips.y + P.hy, 0);
    b.hips.rotation.set(P.hrx, P.hry, P.hrz, "YXZ");
    b.chest.rotation.set(P.crx, P.cry, P.crz);
    const br = P.br || 1;
    b.chest.scale.setScalar(br);
    b.neck.scale.setScalar(1 / br);
    b.neck.rotation.set(P.nrx, 0, 0);
    b.head.rotation.set(P.hdx, P.hdy, P.hdz, "YXZ");
    b.legL.rotation.set(P.llx, P.lly, 0); b.legR.rotation.set(P.rlx, P.rly, 0);
    b.tail.rotation.set(P.tx, P.ty, 0); b.tail2.rotation.set(P.tx * 0.6, P.t2y, 0);
    /* follow-through: ears and crest lag the head's turn */
    const hv = P.hdy - this.prevHead.y, hx = P.hdx - this.prevHead.x;
    this.prevHead.y = P.hdy; this.prevHead.x = P.hdx;
    b.earL.rotation.set(P.elx - hx * 4, 0, P.elz + hv * 3);
    b.earR.rotation.set(P.erx - hx * 4, 0, P.erz + hv * 3);
    b.crest.rotation.set(P.cr - hx * 3, -hv * 2, 0);
    /* the chest's frame in seat space, for the hand targets */
    b.root.updateMatrix(); b.hips.updateMatrix(); b.chest.updateMatrix();
    _m.copy(b.root.matrix).multiply(b.hips.matrix).multiply(b.chest.matrix);
    _mi.copy(_m).invert();
  }

  /* the floppy parts (a baked plush only): ears, cheeks, belly and tail on
     damped springs, driven by the head's acceleration in the world (the
     water's bob, a stroke's lean, a bump, a hop) in the head's own frame */
  secondary(P, dt) {
    if (this.pop < 1) {
      this.pop = Math.min(1, this.pop + dt / POP_S);
      this.root.scale.setScalar(this.pop >= 1 ? 1 : 0.02 + 0.98 * backOut(this.pop));
    }
    const b = this.b, j = this.jig, rest = this.rest;
    if (!b.cheekL || dt <= 0) return;
    b.head.updateWorldMatrix(true, false);
    b.head.matrixWorld.decompose(_jp, _jq, _js);
    const scale = Math.abs(_js.y) > 1e-6 ? Math.abs(_js.y) : 1;
    if (!j.init) { j.prev.copy(_jp); j.vel.set(0, 0, 0); j.acc.set(0, 0, 0); j.init = true; }
    _ja.subVectors(_jp, j.prev).divideScalar(dt * scale);
    j.prev.copy(_jp);
    if (_ja.lengthSq() > 100) { j.vel.copy(_ja); return; }
    _w.subVectors(_ja, j.vel).divideScalar(dt);
    j.vel.copy(_ja);
    j.acc.lerp(_w, Math.min(1, dt * 16));
    const al = j.local.copy(j.acc);
    if (al.lengthSq() > 900) al.setLength(30);
    al.applyQuaternion(_jq.invert());
    const ax = al.x, ay = al.y, az = al.z;
    const sqV = (P.sq - j.prevSq) / dt, yawV = (P.hdy - j.prevYaw) / dt;
    j.prevSq = P.sq; j.prevYaw = P.hdy;
    const n = Math.min(4, Math.max(1, Math.ceil(dt * 60))), h = dt / n;
    for (let i = 0; i < n; i++) {
      /* ears lag the head: back when it surges forward, out when it bobs up */
      spring(j.earLx, lim(-az * 0.024 - ay * 0.008, 0.7), 10.5, 0.2, h);
      spring(j.earRx, lim(-az * 0.024 - ay * 0.008, 0.7), 10.5, 0.2, h);
      spring(j.earLz, lim(ax * 0.026 + ay * 0.016 - yawV * 0.05, 0.7), 10.5, 0.2, h);
      spring(j.earRz, lim(ax * 0.026 - ay * 0.016 - yawV * 0.05, 0.7), 10.5, 0.2, h);
      /* the tips lag the ears */
      spring(j.tipLx, lim(-j.earLx.v * 0.07, 0.6), 8, 0.16, h); spring(j.tipRx, lim(-j.earRx.v * 0.07, 0.6), 8, 0.16, h);
      spring(j.tipLz, lim(-j.earLz.v * 0.07, 0.6), 8, 0.16, h); spring(j.tipRz, lim(-j.earRz.v * 0.07, 0.6), 8, 0.16, h);
      /* cheeks and belly sag as the body rises, bounce as it lands */
      spring(j.cheek, lim(-ay * 0.0016, 0.012), 15, 0.16, h);
      spring(j.belly, lim(-ay * 0.002 - sqV * 0.004, 0.016), 11, 0.18, h);
      /* the tail swings against a turn and a sideways shove */
      spring(j.tailY, lim(-ax * 0.04 - yawV * 0.25, 0.7), 7, 0.2, h);
      spring(j.tipY, lim(-j.tailY.v * 0.08, 0.6), 6, 0.16, h);
      spring(j.tailX, lim(ay * 0.02 + az * 0.015, 0.5), 7, 0.22, h);
    }
    b.earL.rotation.x += j.earLx.x; b.earL.rotation.z += j.earLz.x;
    b.earR.rotation.x += j.earRx.x; b.earR.rotation.z += j.earRz.x;
    b.earL2.rotation.set(j.tipLx.x + j.earLx.x * 0.6, 0, j.tipLz.x + j.earLz.x * 0.6);
    b.earR2.rotation.set(j.tipRx.x + j.earRx.x * 0.6, 0, j.tipRz.x + j.earRz.x * 0.6);
    const c = j.cheek.x;
    for (let i = 0; i < 2; i++) {
      const name = CHEEKS[i], bone = b[name];
      bone.position.copy(rest[name]); bone.position.y += c;
      bone.scale.set(1 - c * 3, 1 + c * 6, 1 - c * 3);
    }
    const bl = j.belly.x;
    b.belly.position.copy(rest.belly); b.belly.position.y += bl;
    b.belly.scale.set(1 - bl * 2.5, 1 + bl * 5, 1 + bl * 1.5);
    b.tail.rotation.x += j.tailX.x; b.tail.rotation.y += j.tailY.x;
    b.tail2.rotation.y += j.tailY.x * 0.6 + j.tipY.x;
    b.tail3.rotation.set(j.tailX.x * 0.5, j.tipY.x * 1.4, 0);
  }

  applyArms(P) {
    for (let i = 0; i < 2; i++) {
      const side = this.side[SIDES[i]];
      _T.set(P[side.hx], P[side.hy], P[side.hz]);
      _P.set(P[side.px], P[side.py], P[side.pz]);
      if (_P.lengthSq() < 1e-6) _P.copy(side.bind.pole); else _P.normalize();
      const stretch = solveArm(side.S, _T, _P, side.bind, _q1, _q2);
      const bulge = P.bulge > 0.5 ? P.bulge : 1;
      side.shoulder.quaternion.copy(_q1);
      side.shoulder.scale.setScalar(bulge);
      side.elbow.quaternion.copy(_q2);
      side.elbow.position.copy(side.restElbow).multiplyScalar(stretch / bulge);
      side.hand.position.copy(side.restHand).multiplyScalar(stretch);
    }
  }

  applyExpression(dt, poseExpr) {
    const { w, state } = this;
    let eyes = "open", mouth = "smile", lids = !!this.info.chill;
    if (state.sad) { mouth = "frown"; lids = true; }
    if (state.celebrate) { eyes = "happy"; mouth = "open"; lids = false; }
    if (state.swim) { mouth = "open"; lids = false; }
    if (poseExpr && w.pose > 0.3) { eyes = poseExpr.eyes; mouth = poseExpr.mouth; lids = false; }
    const fg = this.fidget;
    if (fg.t > 0.5 && fg.t < FIDGET_S - 0.4 && !poseExpr) {
      if (fg.kind === "stretch") { eyes = "happy"; mouth = "open"; }
      else if (fg.kind === "wave") { mouth = "open"; }
    }
    const ex = this.expr;
    if (eyes !== ex.eyes) { ex.eyes = eyes; ex.popEyes = 0; }
    if (mouth !== ex.mouth) { ex.mouth = mouth; ex.popMouth = 0; }
    ex.lids = lids;
    ex.popEyes = Math.min(1, ex.popEyes + dt / 0.16);
    ex.popMouth = Math.min(1, ex.popMouth + dt / 0.14);
    const pe = 0.3 + 0.7 * backOut(ex.popEyes), pm = 0.3 + 0.7 * backOut(ex.popMouth);
    const b = this.b;
    let blink = 1;
    if (this.blinkT >= 0) { const bt = this.blinkT / 0.15; blink = bt < 0.4 ? 1 - ease(bt / 0.4) * 0.92 : 0.08 + 0.92 * ease((bt - 0.55) / 0.45); }
    if (ex.eyes === "happy") { b.eyes.scale.setScalar(HIDE); b.happy.scale.set(pe, pe, pe); }
    else { b.eyes.scale.set(pe, Math.max(HIDE, blink * pe), pe); b.happy.scale.setScalar(HIDE); }
    b.lids.scale.setScalar(ex.lids && ex.eyes !== "happy" ? 1 : HIDE);
    b.mSmile.scale.setScalar(ex.mouth === "smile" ? pm : HIDE);
    b.mOpen.scale.setScalar(ex.mouth === "open" ? pm : HIDE);
    b.mFrown.scale.setScalar(ex.mouth === "frown" ? pm : HIDE);
    b.jaw.rotation.x = ex.mouth === "open" ? -0.34 * pm : 0;
  }

  applyDrink(P, dt) {
    const can = this.drink;
    if (!can) return;
    const show = P.can > 0.5;
    can.visible = show;
    if (!show) return;
    this.drinkPop = Math.min(1, this.drinkPop + dt / 0.22);
    const s = this.poseShown === "chug" && this.w.pose > 0.5 ? "R" : this.drinkSide;
    const side = this.side[s];
    /* the can rides the paw: the hand bone's place in chest space */
    _S.copy(side.hand.position).applyQuaternion(side.elbow.quaternion).add(side.elbow.position)
      .applyQuaternion(side.shoulder.quaternion).add(side.shoulder.position);
    /* held at the paw's top inside, toward the mouth */
    can.position.copy(_S);
    can.position.x -= side.sign * 0.03;
    can.position.y += 0.045;
    can.position.z -= 0.035;
    can.scale.setScalar(0.6 + 0.4 * backOut(this.drinkPop));
    can.rotation.set(P.canTilt, 0, -side.sign * 0.15, "YXZ");
  }

  dispose() {
    this.disposed = true;
    this.root.parent?.remove(this.root);
    this.skeleton.dispose();
    if (this.placeholder) { this.placeholder.geometry.dispose(); this.placeholder = null; }
  }
}
