/* The showcase (the /float/art page): every critter, floatie, accessory and
   pose on a night river or in a studio. Views: lineup, detail, floaties,
   poses, states, medallion, race, portraits. Drivable by URL for the
   screenshot script (scripts/float-art-shots.mjs): ?view=&critter=&hat=
   &shades=&floatie=&pose=&state=&stage=night|studio&t=<seconds>&freeze=1.
   With t, the clock runs from zero to t in fixed 60 Hz steps, so a frame
   is the same frame every time. */
import * as THREE from "three";
import { buildRider, buildFloatie, buildCritter, artStats, floatEnvironment, BUILT_SPECIES, BUILT_FLOATIES } from "./index.js";
import { buildStage, buildPuddle } from "./stage.js";
import { CRITTERS, HATS, SHADES, POSES } from "../../shared/looks.js";
import { FLOATIES, STATS } from "../../shared/floaties.js";
import { mulberry } from "./critter.js";

export const SAMPLE_COLORS = ["#C05B33", "#4F93A3", "#E39A3B", "#7C5CA6", "#3F7D5C", "#B23B5E", "#3B6E9C", "#D97742", "#6E9450", "#A6527C", "#2F7E83", "#D89C2F", "#6D6FA8"];
export const SAMPLE_SKINS = ["ticks", "plain", "dash", "quad", "dots", "ring", "saw", "flame", "star", "bolt", "wave", "crown"];
const NAMES = ["Brandon", "Evan", "Sahil", "Chinh", "Adi", "Ben", "Khoa", "Allan", "Eyob", "Jeremy", "Henry", "Chiang", "Sam"];
const HAT_CYCLE = ["cowboy", "none", "bucket", "party", "visor", "captain", "flowers", "none", "cowboy", "bucket", "party", "visor", "crown"];
const SHADE_CYCLE = ["none", "aviators", "none", "hearts", "none", "stars", "none", "goggles", "aviators", "none", "hearts", "none", "stars"];

/* a stand-in photo for the chip (drawn, never fetched) */
let samplePhotoUrl = null;
export function samplePhoto() {
  if (samplePhotoUrl) return samplePhotoUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#ff9a62"); sky.addColorStop(0.55, "#f7c97e"); sky.addColorStop(1, "#7fb6c9");
  g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#2b2f3a"; g.beginPath(); g.ellipse(128, 250, 98, 70, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#c98d67"; g.beginPath(); g.ellipse(128, 128, 56, 68, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#2a1d17"; g.beginPath(); g.ellipse(128, 82, 60, 34, 0, Math.PI, 0); g.fill(); g.fillRect(70, 78, 116, 16);
  g.fillStyle = "#15161c"; g.beginPath(); g.roundRect(80, 112, 42, 24, 9); g.roundRect(134, 112, 42, 24, 9); g.fill(); g.fillRect(118, 118, 20, 5);
  g.strokeStyle = "#7a3f33"; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.arc(128, 160, 20, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  samplePhotoUrl = c.toDataURL("image/png");
  return samplePhotoUrl;
}

export function sampleEntrant(i, over = {}) {
  const critter = over.critter || CRITTERS[i % CRITTERS.length].id;
  return {
    name: NAMES[i % NAMES.length], device: `dev-${i}`, color: SAMPLE_COLORS[i % SAMPLE_COLORS.length], number: (i * 7 + 3) % 99,
    skin: SAMPLE_SKINS[i % SAMPLE_SKINS.length], groom: i === 12, photo: over.photo === undefined ? null : over.photo,
    look: { critter, floatie: FLOATIES[i % FLOATIES.length].id, hat: HAT_CYCLE[i % HAT_CYCLE.length], shades: SHADE_CYCLE[i % SHADE_CYCLE.length], pose: POSES[i % POSES.length].id, ...over.look },
    ...over.entrant,
  };
}

const FIXED = 1 / 60;

export class Showcase {
  constructor(canvas, labelLayer, { onStats = null } = {}) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 600);
    this.items = [];
    this.labels = [];
    this.stageMood = null;
    this.stage = null;
    this.t = 0;
    this.frozen = false;
    this.spin = { yaw: 0, auto: true, drag: null };
    this.opts = {};
    this.fps = { frames: 0, at: performance.now(), value: 0 };
    this.rand = mulberry("showcase");
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setStage(mood) {
    if (mood === this.stageMood) return;
    if (this.stage) { this.scene.remove(this.stage.group); this.stage.dispose(); }
    this.stageMood = mood;
    this.stage = buildStage(mood);
    this.scene.add(this.stage.group);
    this.scene.fog = this.stage.fog;
    this.scene.background = this.stage.background;
    this.scene.environment = floatEnvironment(this.renderer, mood === "studio" ? "studio" : "night");
    if (this.stage.water) { this.stage.water.material.envMap = this.scene.environment; this.stage.water.material.envMapIntensity = 0.5; this.stage.water.material.needsUpdate = true; }
    this.scene.environmentIntensity = mood === "studio" ? 0.85 : 1.0;
    for (const it of this.items) if (it.puddle) { it.root.remove(it.puddle.mesh); it.puddle.dispose(); it.puddle = buildPuddle(this.stage, 0.9); it.root.add(it.puddle.mesh); }
  }

  clear() {
    for (const it of this.items) { this.scene.remove(it.root); it.rider?.dispose(); it.floatie?.dispose(); it.critterOnly?.dispose(); it.puddle?.dispose(); }
    this.items = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
  }

  /* one rider (or bare floatie) placed in the scene */
  place({ entrant, floatieOnly = null, at = [0, 0, 0], face = Math.PI, detail = "race", label = null, sub = null, behaviour = {} }) {
    const root = new THREE.Group();
    root.position.set(...at);
    let rider = null, floatie = null, critterOnly = null;
    if (arguments[0].critterOnly) {
      critterOnly = buildCritter({ critter: entrant.look.critter, color: entrant.color, hat: entrant.look.hat, shades: entrant.look.shades, entrant, detail, groom: true });
      root.add(critterOnly.root);
    } else if (floatieOnly) {
      floatie = buildFloatie({ floatie: floatieOnly, color: entrant.color, entrant, detail });
      root.add(floatie.root);
    } else {
      rider = buildRider(entrant, { detail });
      root.add(rider.root);
    }
    const puddle = critterOnly ? null : buildPuddle(this.stage, 0.9);
    if (puddle) root.add(puddle.mesh);
    this.scene.add(root);
    const item = { root, rider, floatie, critterOnly, puddle, face, phase: this.rand() * 6, behaviour, nextStroke: 0.6 + this.rand() * 1.6, side: "L" };
    if (rider) {
      if (behaviour.state) rider.critter.setState(behaviour.state);
      if (behaviour.pose) rider.critter.setPose(behaviour.pose);
    }
    this.items.push(item);
    if (label) this.addLabel(item, label, sub);
    return item;
  }

  addLabel(item, text, sub) {
    const el = document.createElement("div");
    el.className = "fa-label";
    el.innerHTML = `<span class="fa-label-name"></span>${sub ? '<span class="fa-label-sub"></span>' : ""}`;
    el.querySelector(".fa-label-name").textContent = text;
    if (sub) el.querySelector(".fa-label-sub").textContent = sub;
    this.labelLayer.appendChild(el);
    this.labels.push({ el, item, y: -0.32 });
  }

  /* ── the views ── */
  setView(view, opts = {}) {
    this.clear();
    this.view = view;
    this.opts = opts;
    this.spin = { yaw: 0, auto: !opts.still, drag: null };
    const stageMood = opts.stage === "studio" ? "studio" : "night";
    this.setStage(stageMood);
    const cam = this.camera;
    const look = opts.look || {};
    if (view === "detail") {
      const e = sampleEntrant(Math.max(0, CRITTERS.findIndex(c => c.id === (look.critter || "capybara"))), {
        look: { hat: look.hat || "none", shades: look.shades || "none", floatie: look.floatie || "classic", critter: look.critter || "capybara" },
        photo: opts.photo ? samplePhoto() : null,
        entrant: { ...(opts.color ? { color: opts.color } : {}), ...(opts.number !== undefined ? { number: opts.number } : {}), ...(opts.skin ? { skin: opts.skin } : {}), groom: true },
      });
      this.place({ entrant: e, at: [0, 0, 0], detail: "hero", behaviour: { strokes: !opts.pose && !opts.state, state: opts.stateObj, pose: opts.pose } });
      if (opts.zoom) { cam.fov = 17; cam.position.set(0, 1.0, 4.3); cam.lookAt(0, 0.66, 0); }
      else { cam.fov = 30; cam.position.set(0, 1.12, 4.5); cam.lookAt(0, 0.56, 0); }
      this.spin.auto = !opts.still;
      this.spin.yaw = opts.yaw ?? 0;
    } else if (view === "floaties") {
      FLOATIES.forEach((f, i) => {
        const row = i < 4 ? 0 : 1, col = i % 4;
        const e = sampleEntrant(i);
        const st = STATS.map(s => `${s.name[0]}${f[s.id]}`).join(" ");
        this.place({ entrant: e, floatieOnly: f.id, at: [(col - 1.5) * 2.5, 0, row ? 1.2 : -1.6], detail: "hero", label: f.name, sub: f.twist });
      });
      cam.fov = 30; cam.position.set(0, 5.6, 9.6); cam.lookAt(0, 0.2, -0.3);
    } else if (view === "poses" || view === "states") {
      const list = view === "poses"
        ? POSES.map(p => ({ label: p.name, pose: p.id }))
        : [{ label: "Paddling", strokes: true, fast: true }, { label: "Drinking", state: { handsOff: true } }, { label: "Swimming", state: { swim: true } },
          { label: "Out", state: { sad: true } }, { label: "Celebrating", state: { celebrate: true } }, { label: "Idle" }];
      const n = list.length;
      list.forEach((b, i) => {
        const critter = opts.look?.critter || CRITTERS[(i * 3 + 1) % CRITTERS.length].id;
        const e = sampleEntrant(i * 2 + 1, { look: { critter, hat: "none", shades: "none", floatie: "classic" } });
        this.place({ entrant: e, at: [(i - (n - 1) / 2) * 2.15, 0, 0], detail: "hero", label: b.label, behaviour: { pose: b.pose, state: b.state, strokes: b.strokes, fast: b.fast } });
      });
      cam.fov = 30; cam.position.set(0, 2.9, n > 4 ? 13.6 : 9.8); cam.lookAt(0, 0.62, 0);
    } else if (view === "wardrobe") {
      /* every hat (and every shade) on a different critter, two rows of four */
      const hats = ["cowboy", "bucket", "visor", "captain", "party", "flowers", "crown", "none"];
      const shades = ["aviators", "none", "hearts", "none", "stars", "goggles", "none", "aviators"];
      const critters = opts.one ? Array(8).fill(opts.look.critter) : ["coyote", "capybara", "frog", "otter", "jackrabbit", "quail", "bighorn", "gila"];
      hats.forEach((hat, i) => {
        const row = i < 4 ? 0 : 1, col = i % 4;
        const e = sampleEntrant(i * 3 + 2, { look: { critter: critters[i], hat, shades: shades[i], floatie: "classic" }, entrant: { groom: true } });
        const label = `${HATS.find(h => h.id === hat)?.name || hat}${shades[i] !== "none" ? ` + ${SHADES.find(s => s.id === shades[i])?.name}` : ""}`;
        this.place({ entrant: e, at: [(col - 1.5) * 2.3, 0, row ? 0.9 : -1.7], detail: "hero", label, behaviour: {} });
      });
      cam.fov = 30; cam.position.set(0, 4.4, 9.2); cam.lookAt(0, 0.55, -0.45);
    } else if (view === "faces") {
      for (const [start, count, y] of [[0, 5, 1.62], [5, 4, 0.82], [9, 4, 0.02]]) for (let j = 0; j < count; j++) {
        const i = start + j;
        const e = sampleEntrant(i, { look: { critter: CRITTERS[i].id, hat: opts.look?.hat && opts.one ? opts.look.hat : "none", shades: "none" } });
        const item = this.place({ entrant: e, critterOnly: true, at: [(j - (count - 1) / 2) * 0.86, y - 0.42, (1.62 - y) * 0.5], face: Math.PI + (opts.yaw ?? 0.35), detail: "hero", label: CRITTERS[i].name, behaviour: {} });
        item.labelY = 0.2;
      }
      cam.fov = 26; cam.position.set(0, 0.95, 5.6); cam.lookAt(0, 0.95, 0);
      this.spin.auto = false;
    } else if (view === "medallion") {
      const a = sampleEntrant(0, { photo: samplePhoto(), look: { critter: "capybara", hat: "none", shades: "none" } });
      const b = sampleEntrant(3, { look: { critter: "frog", hat: "none", shades: "none" } });
      this.place({ entrant: a, at: [-0.55, 0, 0], detail: "hero", behaviour: {} });
      this.place({ entrant: b, at: [0.55, 0, 0], detail: "hero", behaviour: {} });
      cam.fov = 22; cam.position.set(0, 0.62, 2.9); cam.lookAt(0, 0.42, 0);
      this.spin.auto = false;
    } else if (view === "race") {
      for (let i = 0; i < 13; i++) {
        const e = sampleEntrant(i);
        const row = Math.floor(i / 4), col = i % 4;
        const at = [(col - 1.5) * 2.4 + (row % 2) * 1.1, 0, -row * 2.7 + (this.rand() - 0.5) * 0.6];
        this.place({ entrant: e, at, face: 0, detail: "race", behaviour: { strokes: true, fast: true, race: true } });
      }
      cam.fov = 40; cam.position.set(0, 6.5, 9); cam.lookAt(0, 0, -4);
    } else {
      /* lineup: 13 riders, two staggered rows */
      /* three rows: 5, 4, 4 */
      for (const [start, count, z] of [[0, 5, -3.7], [5, 4, -0.9], [9, 4, 1.9]]) for (let j = 0; j < count; j++) {
        const i = start + j;
        const e = sampleEntrant(i, { photo: i === 0 ? samplePhoto() : null });
        this.place({ entrant: e, at: [(j - (count - 1) / 2) * 2.55, 0, z], detail: opts.detail || "race", label: CRITTERS[i].name, behaviour: { strokes: true } });
      }
      cam.fov = 30; cam.position.set(0, 7.6, 13.6); cam.lookAt(0, 0.4, -0.9);
    }
    cam.updateProjectionMatrix();
    this.t = 0;
    for (const it of this.items) it.root.rotation.y = it.face;
  }

  setLook(look) {
    if (this.view !== "detail") return;
    this.setView("detail", { ...this.opts, look: { ...this.opts.look, ...look } });
  }

  stepItems(dt) {
    const t = this.t;
    for (const it of this.items) {
      const b = it.behaviour || {};
      if (it.rider && b.strokes) {
        it.nextStroke -= dt;
        if (it.nextStroke <= 0) {
          it.rider.critter.setStroke(it.side);
          it.side = it.side === "L" ? "R" : "L";
          it.nextStroke = b.fast ? 0.34 + this.rand() * 0.12 : 1.2 + this.rand() * 2.4;
        }
      }
      if (this.view === "detail") it.root.rotation.y = it.face + this.spin.yaw;
      else if (this.view === "race") it.root.rotation.y = 0.15 * Math.sin(t * 0.6 + it.phase);
      else if (this.view !== "medallion" && this.view !== "faces") it.root.rotation.y = it.face + 0.55 * Math.sin(t * 0.32 + it.phase);
      it.rider?.update(dt);
      it.floatie?.update(dt);
      it.critterOnly?.update(dt);
      it.puddle?.update(dt);
    }
    if (this.view === "detail" && this.spin.auto && !this.spin.drag) this.spin.yaw += dt * 0.32;
    this.stage?.update(dt);
  }

  /* run the clock from zero to t (fixed steps) */
  seek(t) {
    const steps = Math.round(Math.max(0, t) / FIXED);
    for (let i = 0; i < steps; i++) { this.t += FIXED; this.stepItems(FIXED); }
  }

  frame(dt) {
    if (!this.frozen) {
      let left = Math.min(dt, 0.1);
      while (left > 1e-6) { const h = Math.min(FIXED, left); this.t += h; this.stepItems(h); left -= h; }
    }
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.fps.frames++;
    const now = performance.now();
    if (now - this.fps.at > 500) {
      this.fps.value = (this.fps.frames * 1000) / (now - this.fps.at);
      this.fps.frames = 0; this.fps.at = now;
      this.onStats?.(this.stats());
    }
  }

  placeLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      l.item.root.getWorldPosition(v);
      v.y += l.item.labelY ?? l.y;
      v.project(this.camera);
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, 0)`;
    }
  }

  stats() {
    const info = this.renderer.info.render;
    const riders = this.items.filter(i => i.rider);
    const per = riders.length ? riders.map(i => artStats(i.rider.root)) : [];
    return {
      fps: Math.round(this.fps.value), calls: info.calls, triangles: info.triangles, riders: riders.length,
      perRider: per.length ? Math.round(per.reduce((s, x) => s + x.triangles, 0) / per.length) : 0,
      meshesPerRider: per.length ? +(per.reduce((s, x) => s + x.meshes, 0) / per.length).toFixed(1) : 0,
    };
  }

  dispose() {
    this.clear();
    this.stage?.dispose();
    this.renderer.dispose();
  }
}

export { BUILT_SPECIES, BUILT_FLOATIES, CRITTERS, HATS, SHADES, POSES, FLOATIES };
